// Realistic townsfolk: Microsoft Rocketbox avatars (MIT — github.com/microsoft/Microsoft-Rocketbox), converted to GLB
// (1K WebP textures) with a shared Biped animation pack per gender (idle / walk / run / sit / talk / drunk / angry).
// buildPerson(o) returns the same interface as deli.js buildFigure — { group, head, body, limbs, guard, hands, play(),
// update(dt, speed) } — so every hangout NPC upgrades in place. Fights / hands-up are procedural: after the mixer runs,
// arm bones are aimed along world directions (rig-axis agnostic). Loaded once in world.js before the map builds.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const BASE = new URL('../../assets/models/people/', import.meta.url).href;
export const AVATARS = {
  m01: { g: 'm', tag: 'tourist' }, m03: { g: 'm', tag: 'older' }, m04: { g: 'm', dark: true }, m05: { g: 'm' }, m08: { g: 'm', tag: 'suit' },
  m10: { g: 'm', tag: 'track' }, m12: { g: 'm', dark: true }, m17: { g: 'm', tag: 'track' }, m18: { g: 'm', dark: true, tag: 'hood' }, m20: { g: 'm' },
  f01: { g: 'f' }, f09: { g: 'f', tag: 'older' }, f17: { g: 'f' },
  m02: { g: 'm', solo: true },   // ARKADY (black hair, blue eyes — recoloured head texture); only when asked for by name
};
const MOBILE_SET = ['m02', 'm03', 'm04', 'm10', 'm12', 'm20', 'm08', 'f09', 'f17'];
const P = { ready: false, av: {}, clips: { m: {}, f: {} } };
export const peopleReady = () => P.ready;
export const peopleDebug = () => P;

export async function loadPeople(ctx) {
  if (P.ready || P.loading) return P.loading;
  const loader = new GLTFLoader(), load = (f) => new Promise((res, rej) => loader.load(BASE + f, res, undefined, rej));
  const ids = ctx.isTouch ? MOBILE_SET : Object.keys(AVATARS);
  P.loading = (async () => {
    const [am, af, ...avs] = await Promise.all([load('anims_m.glb'), load('anims_f.glb'), ...ids.map((id) => load(id + '.glb').catch(() => null))]);
    for (const [g, gl] of [['m', am], ['f', af]]) for (const c of gl.animations) {
      const m = /^[mf]_(.*)$/.exec(c.name); if (!m) continue;   // Max leftovers (footsteps, motion-extraction helpers)
      P.clips[g][KEY[m[1]] || m[1]] = cleanClip(c);
    }
    ids.forEach((id, i) => { if (avs[i]) P.av[id] = prepAvatar(avs[i], ctx); });
    P.ready = Object.keys(P.av).length > 0;
    console.log('[people]', Object.keys(P.av).length, 'avatars,', Object.keys(P.clips.m).length + Object.keys(P.clips.f).length, 'clips');
  })();
  return P.loading;
}
const KEY = { idle_neutral_01: 'idle', walk_neutral_01: 'walk', run_neutral_01: 'run', sit_chair_idle_neutral_01: 'sit', gestic_talk_neutral_01: 'talk', idle_drunk_01: 'drunk', idle_angry_01: 'angry' };

/** in-place loops: only rotations (so one clip fits every body), plus the pelvis height with any travel removed */
function cleanClip(c) {
  const tracks = [];
  for (const t of c.tracks) {
    if (t.name.endsWith('.quaternion')) { tracks.push(t); continue; }
    if (!/Pelvis\.position$/.test(t.name)) continue;
    const v = t.values.slice(), n = t.times.length, T = t.times[n - 1] - t.times[0] || 1;
    for (let k = 0; k < 3; k++) {   // de-trend any axis that drifts (root motion) — keeps the bob
      const drift = v[(n - 1) * 3 + k] - v[k]; if (Math.abs(drift) < 0.15) continue;
      for (let i = 0; i < n; i++) v[i * 3 + k] -= drift * (t.times[i] - t.times[0]) / T;
    }
    tracks.push(new THREE.VectorKeyframeTrack(t.name, t.times, v));
  }
  return new THREE.AnimationClip(c.name, c.duration, tracks);
}
function prepAvatar(gltf, ctx) {
  const root = gltf.scene;
  root.traverse((o) => {
    if (!o.isMesh) return; o.castShadow = !ctx.isTouch; o.receiveShadow = true; o.frustumCulled = true;   // culled off-screen (padded sphere below); no shadow casting on phones
    const m = o.material; m.roughness = 0.78; m.metalness = 0; m.envMapIntensity = 0.55;
    if (/opacity/i.test(m.name)) { m.transparent = false; m.alphaTest = 0.45; m.side = THREE.DoubleSide; m.depthWrite = true; }   // hair cards, lashes
  });
  root.updateMatrixWorld(true);
  const bone = (re) => { let b = null; root.traverse((o) => { if (!b && o.isBone && re.test(o.name)) b = o; }); return b; };
  const head = bone(/Head$/), eyeL = bone(/LEye$/), eyeR = bone(/REye$/);
  const hp = head.getWorldPosition(new THREE.Vector3()), ep = eyeL.getWorldPosition(new THREE.Vector3()).add(eyeR.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
  const fwd = ep.sub(hp).setY(0).normalize(), yawFix = Math.atan2(fwd.x, fwd.z);   // turn so the face looks down +Z
  const box = new THREE.Box3().setFromObject(root);
  return { root, yawFix, height: box.max.y - box.min.y, footY: box.min.y };
}

// ------------------------------------------------------------------------------------------------------------------------
/** pick an avatar from buildFigure-style options (explicit o.avatar wins) */
function pickAvatar(o, seed) {
  const have = Object.keys(P.av); if (o.avatar && P.av[o.avatar]) return o.avatar;
  const lum = (c) => (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) / 255;
  const female = !!o.bun || !!o.female;
  let pool = have.filter((id) => AVATARS[id].g === (female ? 'f' : 'm') && !AVATARS[id].solo);
  if (!female && o.skin != null) { const dark = lum(o.skin) < 0.45; const p2 = pool.filter((id) => !!AVATARS[id].dark === dark); if (p2.length) pool = p2; }
  if (!pool.length) pool = have;
  return pool[Math.abs(seed) % pool.length];
}
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();

export function buildPerson(o = {}) {
  const seed = o.seed ?? Math.floor(Math.random() * 1000);
  const id = pickAvatar(o, seed), A = P.av[id], g = AVATARS[id].g;
  const group = new THREE.Group(); group.name = 'person';
  const inner = new THREE.Group(); inner.rotation.y = -A.yawFix; inner.position.y = -A.footY; group.add(inner);
  const model = SkeletonUtils.clone(A.root); inner.add(model);
  model.traverse((o) => { if (o.isSkinnedMesh) { try { o.computeBoundingSphere(); o.boundingSphere.radius = Math.max(1.4, o.boundingSphere.radius * 1.6); } catch { o.frustumCulled = false; } } });   // animated limbs stay inside
  const bones = {}; model.traverse((b) => { if (b.isBone) bones[b.name.replace(/^Bip01_?/, '').replace(/_/g, ' ').trim()] = b; });
  const B = (n) => bones[n] || bones[n.replace(/ /g, '')];
  const arm = (s) => ({ up: B(`${s} UpperArm`), fore: B(`${s} Forearm`), hand: B(`${s} Hand`), cl: B(`${s} Clavicle`) });
  const R = arm('R'), L = arm('L'), spine = B('Spine1'), headB = B('Head');
  // accessory anchors the old figure API exposed: head (centre of the skull) and a right-hand mount
  const head = new THREE.Object3D(); headB.add(head);
  { model.updateMatrixWorld(true); const hw = headB.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.09, 0.0)); headB.worldToLocal(hw); head.position.copy(hw);
    head.quaternion.copy(headB.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(group.getWorldQuaternion(new THREE.Quaternion())); }   // keep head accessories upright in the rest pose
  const handR = new THREE.Object3D(); R.hand?.add(handR);
  // mixer: idle / walk / run weights driven by speed; sit / talk / drunk as base loops
  const mixer = new THREE.AnimationMixer(model), clips = P.clips[g], act = {};
  for (const k of ['idle', 'walk', 'run', 'sit', 'talk', 'drunk', 'angry']) if (clips[k]) { const a = mixer.clipAction(clips[k]); a.play(); a.setEffectiveWeight(0); a.time = (seed * 0.37) % clips[k].duration; act[k] = a; }
  const base = o.pose === 'sit' && act.sit ? 'sit' : 'idle';
  if (act[base]) act[base].setEffectiveWeight(1);
  const limbs = { arms: [{ sh: L.up, fore: handR, s: -1 }, { sh: R.up, fore: handR, s: 1 }], legs: [] };
  const F = {
    group, head, body: inner, limbs, handR, avatar: id, mood: null,   // mood: 'talk' | 'drunk' | 'angry' swaps the idle loop
    guard: false, hands: false, act: null,
    play(name, dur = name === 'punch' ? 0.34 : name === 'hit' ? 0.42 : 0.5) { F.act = { name, t: 0, dur, side: Math.random() < 0.5 ? 1 : 0 }; },
    update(dt, speed = 0) {
      if (base === 'sit') { mixer.update(dt); return; }
      const sp = F.guard || F.hands ? 0 : speed, idleK = o.mood || F.mood;
      const wWalk = sp > 0.05 ? Math.min(1, sp / 1.2) * (sp > 2.6 ? Math.max(0, 1 - (sp - 2.6) / 1.2) : 1) : 0, wRun = sp > 2.6 ? Math.min(1, (sp - 2.6) / 1.2) : 0, wIdle = Math.max(0, 1 - wWalk - wRun);
      for (const [k, a] of Object.entries(act)) { const want = k === 'walk' ? wWalk : k === 'run' ? wRun : k === (idleK && act[idleK] ? idleK : 'idle') ? wIdle : 0; a.setEffectiveWeight(THREE.MathUtils.lerp(a.getEffectiveWeight(), want, Math.min(1, dt * 8))); }
      if (act.walk) act.walk.timeScale = sp > 0.05 ? THREE.MathUtils.clamp(sp / 1.35, 0.6, 1.8) : 1;
      if (act.run) act.run.timeScale = sp > 2.6 ? THREE.MathUtils.clamp(sp / 3.6, 0.8, 1.6) : 1;
      mixer.update(dt);
      overlay(dt);
    },
  };
  // ---- procedural overlays: aim a bone so its child sits along a direction given in the character's frame ----
  const dirW = (x, y, z) => _v.set(x, y, z).normalize().applyQuaternion(group.getWorldQuaternion(_q3));
  function aim(b, child, dx, dy, dz, w = 1) {
    if (!b || !child || w <= 0) return;
    b.updateWorldMatrix(true, false); child.updateWorldMatrix(false, false);
    const cur = _v2.copy(child.getWorldPosition(new THREE.Vector3())).sub(b.getWorldPosition(new THREE.Vector3())).normalize();
    const want = dirW(dx, dy, dz); const d = _q.setFromUnitVectors(cur, want); _q.slerp(_q2.identity(), 1 - w).normalize();
    const wq = b.getWorldQuaternion(new THREE.Quaternion()); const pq = b.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    b.quaternion.copy(pq.multiply(d.multiply(wq)));
    b.updateWorldMatrix(false, true);
  }
  function lean(b, ax, ang) { if (!b || !ang) return; const axis = dirW(...ax); const wq = b.getWorldQuaternion(new THREE.Quaternion()); const pq = b.parent.getWorldQuaternion(new THREE.Quaternion()).invert(); b.quaternion.copy(pq.multiply(_q.setFromAxisAngle(axis, ang).multiply(wq))); b.updateWorldMatrix(false, true); }
  // character frame: +Z forward, +Y up; the right arm is on −X
  const side = { R: -1, L: 1 };
  function overlay(dt) {
    if (F.hands) for (const [s, a] of [['R', R], ['L', L]]) { aim(a.up, a.fore, side[s] * 0.8, 0.6, 0.05); aim(a.fore, a.hand, side[s] * 0.1, 1, 0.1); }
    else if (F.guard) {
      const t = performance.now() / 1000;
      for (const [s, a] of [['R', R], ['L', L]]) { aim(a.up, a.fore, side[s] * 0.35, -0.6, 0.7); aim(a.fore, a.hand, -side[s] * 0.3, 0.9, 0.5 + Math.sin(t * 6 + side[s]) * 0.08); }
      lean(spine, [1, 0, 0], 0.12);
    }
    const a = F.act; if (!a) return;
    a.t += dt; const k = Math.min(1, a.t / a.dur), e = Math.sin(k * Math.PI);
    if (a.name === 'punch') { const P_ = a.side ? R : L, sg = a.side ? -1 : 1, snap = k < 0.3 ? 0 : e;
      aim(P_.up, P_.fore, sg * 0.12, 0.05, 1, snap); aim(P_.fore, P_.hand, sg * 0.05, 0.05, 1, snap); lean(spine, [0, 1, 0], (a.side ? 1 : -1) * 0.45 * e); }
    else if (a.name === 'hit') { lean(spine, [1, 0, 0], -0.35 * e); lean(headB, [1, 0, 0], -0.5 * e); lean(headB, [0, 0, 1], (a.side ? 1 : -1) * 0.3 * e); }
    else if (a.name === 'shove') { for (const [s, b] of [['R', R], ['L', L]]) { aim(b.up, b.fore, side[s] * 0.25, 0.1, 1, e); aim(b.fore, b.hand, side[s] * 0.2, 0.2, 1, e); } lean(spine, [1, 0, 0], 0.25 * e); }
    if (k >= 1) F.act = null;
  }
  // props the capsule figures had: a rasta tam, shades
  const mat = (c, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  if (o.tam) { [0x1f7a33, 0xe0b422, 0xb4221c].forEach((c, i) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.125 - i * 0.01, 0.13 - i * 0.01, 0.05, 16), mat(c)); m.position.set(0, 0.02 + i * 0.045, -0.02); head.add(m); });
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(0x1f7a33)); top.scale.set(1.05, 0.7, 1.1); top.position.set(0, 0.14, -0.02); head.add(top); }
  if (o.glasses) {   // thin dark rims: two lens frames, a bridge, temples back to the ears (o.glasses === 'clear' → see-through lenses)
    const gm = mat(0x151515, 0.3), lens = new THREE.MeshStandardMaterial({ color: o.glasses === 'clear' ? 0xdfe8ee : 0x0a0a0a, roughness: 0.05, metalness: 0.1, transparent: true, opacity: o.glasses === 'clear' ? 0.18 : 0.85 });
    const G = new THREE.Group(); G.position.set(0, -0.045 + (o.glassesY || 0), 0.098 + (o.glassesZ || 0)); head.add(G);
    for (const sx of [-1, 1]) { const f = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0028, 6, 20), gm); f.scale.set(1.25, 0.9, 1); f.position.set(sx * 0.033, 0, 0); G.add(f);
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.024, 16), lens); l.scale.set(1.25, 0.9, 1); l.position.set(sx * 0.033, 0, -0.001); G.add(l);
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.004, 0.1), gm); t.position.set(sx * 0.064, 0.004, -0.05); G.add(t); }
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.003, 0.003), gm); br.position.set(0, 0.006, 0); G.add(br);
  }
  F.update(0.001, 0); F._mixer = mixer; F._act = act;
  return F;
}
