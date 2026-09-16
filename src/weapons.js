// Weapons: first-person viewmodel (M4A1 + M9), feel (sway/bob/ADS/recoil), reload/swap/grenade, hitscan + FX. Owned by: WEAPONS agent.
import * as THREE from 'three';
import { makeTextures, makeMaterials } from './weapons/materials.js';
import { buildRifle } from './weapons/rifle.js';
import { buildPistol } from './weapons/pistol.js';
import { FX } from './weapons/fx.js';
import { Grenades } from './weapons/grenade.js';

const DEG = Math.PI / 180;
const VM_FOV = 50;                // vertical fov the viewmodel is authored for (x/y-scale trick emulates it under the world fov)
const ADS_FOV_MUL = 0.7;
const GRENADES = 4;

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _rlp = new THREE.Vector3(), _rlr = new THREE.Vector3(), _ins = new THREE.Vector3(), _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _ray = new THREE.Ray();
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t, damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt)), sstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const lerp3 = (out, a, b, t) => out.set(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));
/** keyframe track: keys = [[t, [x,y,z]], ...] sorted; smoothstep between keys */
function track(out, t, keys) {
  if (t <= keys[0][0]) return out.set(...keys[0][1]);
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const k = sstep((t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])); return lerp3(out, keys[i - 1][1], keys[i][1], k); }
  return out.set(...keys[keys.length - 1][1]);
}
function pulse(t, a, b) { return t < a ? sstep(t / a) : 1 - sstep((t - a) / b); }

let S = null;

export async function init(ctx) {
  const { camera, scene } = ctx;
  const tex = makeTextures(); const mats = makeMaterials(tex);
  const fx = new FX(ctx); const grenades = new Grenades(ctx, mats, fx);

  const vmRoot = new THREE.Group(); vmRoot.name = 'viewmodel'; camera.add(vmRoot);
  // subtle viewmodel fill (short range so it barely touches the world) — keeps the gun readable in deep shadow
  const fill = new THREE.PointLight(0x9fb8e0, 0.05, 1.4, 2.0); fill.position.set(0.25, 0.22, 0.05); camera.add(fill);
  const fill2 = new THREE.PointLight(0xffc890, 0.02, 1.2, 2.0); fill2.position.set(-0.3, -0.1, -0.1); camera.add(fill2);
  const poseNode = new THREE.Group(); vmRoot.add(poseNode);
  const swayNode = new THREE.Group(); poseNode.add(swayNode);

  const rifle = buildRifle(mats, { suppressor: false }), pistol = buildPistol(mats);
  const weapons = [rifle, pistol].map((w) => {
    swayNode.add(w.group);
    // muzzle flash: 3 crossed planes at the muzzle (one facing the camera, two along the barrel)
    const fm = new THREE.MeshBasicMaterial({ map: fx.tex.flash.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(1.8, 1.5, 1.2), side: THREE.DoubleSide });
    fm.map.repeat.set(1 / 3, 1); fm.map.needsUpdate = true;
    const flash = new THREE.Group(); flash.visible = false; w.parts.muzzle.add(flash);
    const sz = w.spec.slot === 0 ? 0.15 : 0.11;
    const f0 = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), fm); f0.position.z = -0.01; flash.add(f0);
    const f1 = new THREE.Mesh(new THREE.PlaneGeometry(sz * 1.35, sz * 0.8), fm); f1.rotation.y = Math.PI / 2; f1.position.z = -sz * 0.5; flash.add(f1);
    const f2 = new THREE.Mesh(new THREE.PlaneGeometry(sz * 1.35, sz * 0.8), fm); f2.rotation.y = Math.PI / 2; f2.rotation.x = Math.PI / 2; f2.position.z = -sz * 0.5; flash.add(f2);
    for (const f of [f0, f1, f2]) { f.renderOrder = 30; f.frustumCulled = false; }
    // magazine/hand home transforms
    w.parts.mag.userData.home = w.parts.mag.position.clone();
    return { ...w, flash, flashMat: fm, ammo: w.spec.mag, reserve: w.spec.reserve, fireTimer: 0, shots: 0, lastShot: -9, boltT: 9, trigT: 9, slideLocked: false, cur: { name: w.spec.name, ammo: w.spec.mag, mag: w.spec.mag, reserve: w.spec.reserve, slot: w.spec.slot } };
  });
  pistol.group.visible = false;

  // fallback environment for the viewmodel if the world hasn't provided one (dark yard with a few sodium lamps)
  let fallbackEnv = null;
  const ensureEnv = () => {
    const useScene = !!scene.environment;
    if (!useScene && !fallbackEnv) {
      const pm = new THREE.PMREMGenerator(ctx.renderer); const es = new THREE.Scene();
      es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 16, 8), new THREE.MeshBasicMaterial({ color: 0x0a0d12, side: THREE.BackSide })));
      const lampMat = new THREE.MeshBasicMaterial({ color: 0xffb060 }); const skyMat = new THREE.MeshBasicMaterial({ color: 0x223044 });
      for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(6, 2), lampMat); const a = i * Math.PI / 2 + 0.4; l.position.set(Math.cos(a) * 30, 8 + i * 2, Math.sin(a) * 30); l.lookAt(0, 0, 0); es.add(l); }
      const sky = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), skyMat); sky.position.set(0, 45, 0); sky.rotation.x = Math.PI / 2; es.add(sky);
      const grd = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshBasicMaterial({ color: 0x141618 })); grd.position.y = -3; grd.rotation.x = -Math.PI / 2; es.add(grd);
      fallbackEnv = pm.fromScene(es, 0.04).texture; pm.dispose();
    }
    for (const m of Object.values(mats)) { const want = useScene ? null : fallbackEnv; if (m.envMap !== want && 'envMap' in m) { m.envMap = want; m.needsUpdate = true; } }
    fx.brassMesh.material.envMap = useScene ? null : fallbackEnv;
  };
  ensureEnv();

  S = {
    ctx, mats, fx, grenades, vmRoot, poseNode, swayNode, weapons, cur: 0,
    adsTarget: 0, adsT: 0, ads: 0, adsOn: false,
    sprint: 0, lower: 0, swap: null, reload: null, throwing: null, inspect: null,
    rp: new THREE.Vector3(), rr: new THREE.Vector3(), rpv: new THREE.Vector3(), rrv: new THREE.Vector3(),
    lookX: 0, lookY: 0, bobX: 0, bobY: 0, spreadExtra: 0, recPitch: 0, recYaw: 0,
    flashT: 9, flashLife: 0.045, triggerHeld: false, triggerPressed: false, dryLatch: false,
    grenadeCount: GRENADES, wallPull: 0, lastFov: -1, scaleFov: -1, time: 0, envCheck: 0, dead: false,
    fired: 0,
  };
  ctx.bus.on('shot', (d) => { if (d && d.who === 'enemy' && d.origin && d.dir) { const o = d.origin.isVector3 ? d.origin : _v.set(d.origin[0] ?? d.origin.x, d.origin[1] ?? d.origin.y, d.origin[2] ?? d.origin.z); const dir = d.dir.isVector3 ? d.dir : _v2.set(d.dir[0] ?? d.dir.x, d.dir[1] ?? d.dir.y, d.dir[2] ?? d.dir.z); fx.enemyShot(o.clone(), dir.clone()); } });
  ctx.bus.on('playerDied', () => { S.dead = true; cancelActions(); });
  ctx.bus.on('playerRespawn', () => { S.dead = false; });
  S.envCheck = 0; S._ensureEnv = ensureEnv;

  const api = {
    get current() { return S.weapons[S.cur].cur; },
    get slots() { return S.weapons.map(w => w.cur); },
    get ads() { return S.ads; },
    get reloading() { return !!S.reload; },
    get grenades() { return S.grenadeCount; },
    get spread() { return currentSpread(); },
    get sprinting() { return S.sprint > 0.5; },
    fire: () => { const w = S.weapons[S.cur]; if (w.ammo > 0) fireShot(w); else dryFire(w); },
    qaFire: (n = 1) => { const w = S.weapons[S.cur]; for (let i = 0; i < n; i++) { if (w.ammo <= 0) { w.ammo = w.spec.mag; } fireShot(w, { hold: 0.6 }); } },
    reload: () => startReload(),
    swap: (slot) => startSwap(slot),
    throwGrenade: () => startThrow(),
    inspect: () => startInspect(),
    // QA helpers
    setAdsForQA: (v = 1) => { S.qaAds = v == null ? null : v; if (v != null) { S.adsTarget = v; S.adsT = v; S.ads = v; S.adsOn = v > 0.5; if (ctx.player) ctx.player.ads = S.adsOn; } },
    qaReload: (t = 0.5) => { const w = S.weapons[S.cur]; w.ammo = 0; startReload(true); if (S.reload) S.reload.t = t; },
    qaSprint: (v = 1) => { S.sprint = v; },
    qaShowcase: (yaw = 0.6, pitch = 0.1, dist = 0.9, x = 0, y = -0.03) => { S.showcase = yaw == null ? null : { yaw, pitch, dist, x, y }; },
    qaGrenade: (t = 0.0) => { startThrow(true); if (S.throwing) S.throwing.t = t; },
    qaExplode: (x, y, z) => { fx.explosion(new THREE.Vector3(x, y, z)); },
    qaImpact: (x, y, z, surface = 'concrete') => { fx.impact(new THREE.Vector3(x, y, z), new THREE.Vector3(0, 1, 0), surface, new THREE.Vector3(0, -1, 0)); },
    materials: mats, fx, grenadeSim: grenades, viewmodel: vmRoot,
    get state() { return S; },
  };
  return api;
}

// ------------------------------------------------------------------ actions
function cancelActions() { if (S.reload) endReload(false); S.throwing = null; S.inspect = null; S.adsTarget = 0; }

function startSwap(slot) {
  if (slot == null || slot === S.cur || slot < 0 || slot >= S.weapons.length || (S.swap && S.swap.to === slot)) return false;
  if (S.reload) endReload(false); S.throwing = null; S.inspect = null;
  S.swap = { to: slot, t: 0, phase: 'lower', dur: S.weapons[S.cur].spec.swapTime }; return true;
}
function startReload(force = false) {
  const w = S.weapons[S.cur];
  if (S.reload || S.swap || S.throwing) return false;
  if (!force && (w.ammo >= w.spec.mag || w.reserve <= 0)) return false;
  S.inspect = null;
  const empty = w.ammo === 0;
  S.reload = { t: 0, dur: empty ? w.spec.reloadTime : w.spec.reloadTimeTac, empty, magOut: false, magIn: false, racked: false, w };
  S.ctx.bus.emit('reload', { stage: 'start', weapon: w.spec.name, empty });
  return true;
}
function endReload(complete) {
  const r = S.reload; if (!r) return; const w = r.w;
  if (complete) S.ctx.bus.emit('reload', { stage: 'end', weapon: w.spec.name });
  w.parts.mag.visible = true; w.parts.mag.position.copy(w.parts.mag.userData.home); w.parts.mag.rotation.set(0, 0, 0);
  if (w.parts.chargingHandle) w.parts.chargingHandle.position.z = 0.098;
  S.reload = null;
}
function startThrow(force = false) {
  if (S.throwing || S.swap) return false;
  if (!force && S.grenadeCount <= 0) return false;
  if (S.reload) endReload(false); S.inspect = null;
  S.throwing = { t: 0, pinned: false, thrown: false, dur: 1.15 }; S.adsTarget = 0;
  return true;
}
function startInspect() { if (S.reload || S.swap || S.throwing || S.inspect || S.adsOn) return false; S.inspect = { t: 0, dur: 3.2 }; return true; }

function dryFire(w) {
  if (S.dryLatch) return; S.dryLatch = true;
  w.trigT = 0; S.ctx.bus.emit('dryfire', { weapon: w.spec.name });
  if (w.reserve > 0) startReload();
}

function currentSpread() {
  const w = S.weapons[S.cur], sp = w.spec, p = S.ctx.player;
  const mv = clamp((p?.speed ?? 0) / 4.4, 0, 1.5), air = p && p.onGround === false ? 1.5 : 0;
  return lerp(sp.hipSpread + sp.moveSpread * mv + air, sp.adsSpread + mv * 0.3, S.ads) + S.spreadExtra * (1 - S.ads * 0.8);
}

function fireShot(w, opts = {}) {
  const ctx = S.ctx, sp = w.spec, cam = ctx.camera, p = ctx.player, rng = ctx.rng;
  const now = S.time;
  if (now - w.lastShot > 0.35) w.shots = 0;
  w.ammo = Math.max(0, w.ammo - 1); w.shots++; w.lastShot = now; w.boltT = 0; w.trigT = 0; S.fired++;
  if (sp.slot === 1 && w.ammo === 0) w.slideLocked = true;
  S.inspect = null;

  // direction with spread (cone; deterministic via ctx.rng)
  cam.updateMatrixWorld(true);
  cam.getWorldDirection(_fwd); _right.set(1, 0, 0).applyQuaternion(cam.quaternion); _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
  const spread = currentSpread() * DEG; const a = rng() * Math.PI * 2, rad = Math.sqrt(rng()) * spread; const tr = Math.tan(rad);
  const dir = new THREE.Vector3().copy(_fwd).addScaledVector(_right, Math.cos(a) * tr).addScaledVector(_up, Math.sin(a) * tr).normalize();
  const origin = cam.getWorldPosition(new THREE.Vector3());
  S.spreadExtra = Math.min(sp.spreadMax, S.spreadExtra + sp.spreadPerShot);

  // hitscan
  S._rc = S._rc || new THREE.Raycaster(); const rc = S._rc; rc.set(origin, dir); rc.near = 0.05; rc.far = sp.range;
  let hit = null;
  if (ctx.raycastTargets?.length) { const hits = rc.intersectObjects(ctx.raycastTargets, true); for (const h of hits) { if (h.object === S.vmRoot || (!h.object.visible && !h.object.userData?.soldier)) continue; hit = h; break; } } // soldier hitboxes are invisible meshes by design
  const dist = hit ? hit.distance : sp.range;

  // muzzle world position (visual) — used by light, brass, tracer, smoke
  const muzzle = w.parts.muzzle.getWorldPosition(new THREE.Vector3());
  S.fx.muzzleLightAt(muzzle, sp.slot === 0 ? 1 : 0.7, opts.hold ? opts.hold : 0.045);
  // viewmodel flash
  S.flashT = 0; S.flashLife = opts.hold ? opts.hold : (0.04 + rng() * 0.02); S.flashW = w;
  w.flashMat.map.offset.x = Math.floor(rng() * 3) / 3; w.flash.rotation.z = rng() * Math.PI * 2; w.flash.scale.setScalar(0.85 + rng() * 0.4); w.flash.visible = true; w.flashMat.opacity = 1;
  // brass
  const ej = w.parts.eject.getWorldPosition(new THREE.Vector3());
  _v.copy(_right).multiplyScalar(2.2 + rng() * 1.2).addScaledVector(_up, 1.6 + rng() * 0.8).addScaledVector(_fwd, -0.3 + rng() * 0.4); if (p?.velocity) _v.add(p.velocity);
  S.fx.ejectBrass(ej, _v, sp.slot === 0 ? 1 : 0.8);
  // tracer 1-in-3, smoke wisp every other shot
  if (w.shots % 3 === 1) S.fx.tracer(muzzle, _v2.subVectors(hit ? hit.point : _v3.copy(origin).addScaledVector(dir, dist), muzzle).normalize(), dist);
  if (w.shots % 2 === 0 || opts.hold) S.fx.muzzleSmoke(muzzle, _fwd);

  // visual recoil (spring impulses) — smaller in ADS
  const k = lerp(1, 0.55, S.ads);
  S.rpv.z += sp.kickBack * 40 * k; S.rrv.x += sp.kickUp * 40 * k; S.rrv.z += (rng() - 0.5) * 2 * sp.kickRoll * 40 * k; S.rrv.y += (rng() - 0.5) * sp.kickRoll * 30 * k; S.rpv.x += (rng() - 0.5) * 0.15 * k;
  // camera recoil pattern: climbs, drifts right for the first burst then wanders
  if (p && !opts.noCamera) {
    const n = w.shots; const patternYaw = n < 4 ? 0.3 : n < 9 ? -0.7 : Math.sin(n * 1.7) * 0.8;
    const kp = sp.recoilPitch * DEG * (0.85 + rng() * 0.3) * (n === 1 ? 1.15 : 1) * lerp(1, 0.85, S.ads);
    const ky = sp.recoilYaw * DEG * (patternYaw + (rng() - 0.5) * 1.2) * lerp(1, 0.85, S.ads);
    p.pitch = (p.pitch ?? 0) + kp; p.yaw = (p.yaw ?? 0) + ky; cam.rotation.x += kp; cam.rotation.y += ky;
    S.recPitch += kp * 0.55; S.recYaw += ky * 0.4;
  }
  // impact / damage
  if (hit) {
    let n = hit.normal ? hit.normal.clone() : null;
    if (!n) { n = hit.face ? hit.face.normal.clone() : dir.clone().negate(); if (hit.instanceId !== undefined && hit.object.getMatrixAt) { hit.object.getMatrixAt(hit.instanceId, _m); _m.premultiply(hit.object.matrixWorld); n.transformDirection(_m); } else n.transformDirection(hit.object.matrixWorld); }
    if (n.dot(dir) > 0) n.negate();
    const ud = hit.object.userData || {};
    if (ud.soldier) {
      const headshot = ud.part === 'head'; const dmg = Math.round(sp.damage * (headshot ? sp.headMul : 1) * (dist > 40 ? Math.max(0.6, 1 - (dist - 40) / 120) : 1));
      try { ctx.ai?.damage?.(ud.soldier, dmg, hit.point.clone(), headshot); } catch (e) { console.warn('[weapons] ai.damage', e); }
      ctx.bus.emit('hit', { soldier: ud.soldier, damage: dmg, headshot, point: hit.point.clone() });
      S.fx.impact(hit.point, n, 'flesh', dir);
      ctx.bus.emit('impact', { point: hit.point.clone(), normal: n, surface: 'flesh' });
    } else {
      const surface = ud.surface || (ctx.world?.surfaceAt?.(hit.point)) || 'concrete';
      S.fx.impact(hit.point, n, surface, dir);
      ctx.bus.emit('impact', { point: hit.point.clone(), normal: n, surface, distance: dist });
    }
  }
  ctx.bus.emit('shot', { origin, dir, weapon: sp.name, who: 'player', muzzle, hit: hit ? hit.point.clone() : null });
  w.cur.ammo = w.ammo;
}

// ------------------------------------------------------------------ per-frame
export function update(dt, ctx) {
  if (!S) return;
  const p = ctx.player, input = ctx.input, cam = ctx.camera; const playing = ctx.state === 'playing';
  const w = S.weapons[S.cur], sp = w.spec;
  S.time += dt;
  if ((S.envCheck += dt) > 1) { S.envCheck = 0; S._ensureEnv(); }

  // ---------- input ----------
  if (playing && dt > 0 && !S.dead) {
    if (input.consume('Digit1')) startSwap(0);
    if (input.consume('Digit2')) startSwap(1);
    if (input.mouse.wheel) startSwap(1 - S.cur);
    if (input.consume('KeyR')) startReload();
    if (input.consume('KeyG')) startThrow();
    if (input.consume('KeyF')) startInspect();
    const trig = !!input.fire; if (trig && !S.triggerHeld) S.triggerPressed = true; if (!trig) S.dryLatch = false; S.triggerHeld = trig;
    const busy = S.swap || S.throwing;
    S.adsTarget = (input.ads && !busy && !S.reload && (p?.sprinting !== true || S.triggerHeld)) ? 1 : 0;
    if (S.qaAds != null) S.adsTarget = S.qaAds;
    if (S.adsTarget && S.inspect) S.inspect = null;
  } else { S.triggerPressed = false; if (!playing) S.adsTarget = 0; }

  // ---------- ADS ----------
  const adsSpeed = 1 / sp.adsTime;
  S.adsT = clamp(S.adsT + (S.adsTarget ? dt * adsSpeed : -dt * adsSpeed * 1.15), 0, 1);
  S.ads = S.adsTarget ? 1 - (1 - S.adsT) ** 2.2 : S.adsT ** 1.8; // ease-out in, ease-in out
  const adsOn = S.adsT > 0.5; if (adsOn !== S.adsOn) { S.adsOn = adsOn; ctx.bus.emit('ads', { on: adsOn }); }
  if (p) p.ads = S.adsTarget === 1;
  const fovBase = ctx.settings.fov || 75; const targetFov = fovBase * lerp(1, ADS_FOV_MUL, S.ads);
  if (Math.abs(cam.fov - targetFov) > 0.01 || S.lastFov !== targetFov) { cam.fov = targetFov; cam.updateProjectionMatrix(); S.lastFov = targetFov; }
  if (S.scaleFov !== fovBase) { S.scaleFov = fovBase; const s = Math.tan(fovBase * DEG / 2) / Math.tan(VM_FOV * DEG / 2); S.vmRoot.scale.set(s, s, 1); }

  // ---------- sprint / lowered blends ----------
  const wantSprint = !!(p?.sprinting) && !S.triggerHeld && !S.reload && !S.throwing && S.adsTarget === 0;
  S.sprint = damp(S.sprint, wantSprint ? 1 : 0, wantSprint ? 9 : 14, dt);
  let lowerT = 0;
  // swap
  if (S.swap) {
    const sw = S.swap; sw.t += dt;
    if (sw.phase === 'lower') { lowerT = sstep(sw.t / (sw.dur * 0.45)); if (sw.t >= sw.dur * 0.45) { S.weapons[S.cur].group.visible = false; S.cur = sw.to; S.weapons[S.cur].group.visible = true; sw.phase = 'raise'; sw.t = 0; ctx.bus.emit('swap', { slot: S.cur, name: S.weapons[S.cur].spec.name }); S.rrv.x -= 3; } }
    else { lowerT = 1 - sstep(sw.t / (sw.dur * 0.55)); if (sw.t >= sw.dur * 0.55) { S.swap = null; lowerT = 0; } }
  }
  if (S.dead || ctx.state === 'dead') lowerT = Math.max(lowerT, 1);
  // grenade throw
  if (S.throwing) {
    const th = S.throwing; th.t += dt;
    if (!th.pinned && th.t > 0.12) { th.pinned = true; ctx.bus.emit('grenade', { stage: 'pin' }); }
    if (!th.thrown && th.t > 0.5) { th.thrown = true; S.grenadeCount = Math.max(0, S.grenadeCount - 1); cam.updateMatrixWorld(true); cam.getWorldDirection(_fwd); _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
      const o = cam.getWorldPosition(new THREE.Vector3()).addScaledVector(_fwd, 0.35).addScaledVector(_right, 0.2).add(_v.set(0, -0.15, 0));
      const v = new THREE.Vector3().copy(_fwd).multiplyScalar(17).add(_v.set(0, 3.2, 0)); if (p?.velocity) v.addScaledVector(p.velocity, 0.6);
      S.grenades.spawn(o, v); ctx.bus.emit('grenade', { stage: 'throw', position: o.clone() }); S.rrv.x -= 4; S.rpv.z += 0.5; }
    lowerT = Math.max(lowerT, th.t < 0.5 ? sstep(th.t / 0.3) : 1 - sstep((th.t - 0.5) / 0.55));
    if (th.t >= th.dur) S.throwing = null;
  }
  S.lower = damp(S.lower, lowerT, 30, dt);

  // ---------- firing ----------
  const canFire = playing && !S.dead && !S.reload && !S.swap && !S.throwing && S.lower < 0.3 && S.sprint < 0.45 && (p?.canFire !== false);
  w.fireTimer -= dt;
  if (canFire && dt > 0 && (sp.auto ? S.triggerHeld : S.triggerPressed)) {
    if (w.ammo > 0) { let guard = 0; while (w.fireTimer <= 0 && w.ammo > 0 && guard++ < 3) { fireShot(w); w.fireTimer += 60 / sp.rpm; } }
    else dryFire(w);
  }
  if (w.fireTimer < 0) w.fireTimer = 0;
  S.triggerPressed = false;
  if (S.inspect) { S.inspect.t += dt; if (S.inspect.t >= S.inspect.dur) S.inspect = null; }

  // spread decay & camera recoil recovery
  S.spreadExtra = damp(S.spreadExtra, 0, S.time - w.lastShot > 0.12 ? 9 : 2.5, dt);
  if (p && S.time - w.lastShot > 0.09) {
    const kr = 1 - Math.exp(-dt * 11);
    const rp = S.recPitch * kr, ry = S.recYaw * kr; S.recPitch -= rp; S.recYaw -= ry; p.pitch -= rp; p.yaw -= ry; cam.rotation.x -= rp; cam.rotation.y -= ry;
    if (Math.abs(S.recPitch) < 1e-4) S.recPitch = 0; if (Math.abs(S.recYaw) < 1e-4) S.recYaw = 0;
  }

  // ---------- reload timeline ----------
  const reloadOff = { pos: _rlp.set(0, 0, 0), rot: _rlr.set(0, 0, 0) }; // extra weapon offset while reloading
  const armL = w.parts.armL, mag = w.parts.mag;
  armL.position.copy(armL.userData.home.pos); armL.rotation.set(0, 0, 0);
  if (S.reload) {
    const r = S.reload; r.t += dt; const u = clamp(r.t / r.dur, 0, 1); const isRifle = sp.slot === 0;
    // weapon tilt: roll left + nose down while the hand works the mag, back at the end
    const tilt = pulse(u, 0.18, 0.2) * (u < 0.75 ? 1 : 1) ; const tiltK = isRifle ? 1 : 0.8;
    const settle = u > 0.72 ? 1 - sstep((u - 0.72) / 0.28) : 1;
    reloadOff.rot.set(-0.14 * tiltK * settle, 0.12 * settle, -0.42 * tiltK * settle); reloadOff.pos.set(0.012 * settle, -0.02 * settle, 0.01 * settle);
    // left hand track (weapon space, relative to home)
    const magHome = mag.userData.home; const wrist = armL.userData.home.pos;
    const magGrab = isRifle ? [-0.02, -0.18, -0.02] : [-0.02, -0.14, 0.03];
    const down = isRifle ? [-0.1, -0.42, 0.06] : [-0.08, -0.36, 0.08];
    const rack = isRifle ? [-0.02, 0.055, 0.12] : [-0.02, 0.05, 0.04];
    const rel = (a) => [a[0] - wrist.x, a[1] - wrist.y, a[2] - wrist.z]; // absolute weapon-space → offset from home
    const homeOff = [0, 0, 0];
    const keys = r.empty
      ? [[0, homeOff], [0.16, rel(magGrab)], [0.2, rel(magGrab)], [0.42, rel(down)], [0.5, rel(down)], [0.72, rel(magGrab)], [0.76, rel(magGrab)], [0.86, rel(rack)], [0.93, [rack[0] - wrist.x, rack[1] - wrist.y, rack[2] - wrist.z + 0.035]], [1.0, homeOff]]
      : [[0, homeOff], [0.18, rel(magGrab)], [0.22, rel(magGrab)], [0.45, rel(down)], [0.52, rel(down)], [0.76, rel(magGrab)], [0.8, rel(magGrab)], [1.0, homeOff]];
    const off = track(_v3, u, keys); armL.position.add(off);
    // hand orientation: rotate to grab (palm inward), then to the rack
    const rotK = pulse(u, 0.18, 0.75); armL.rotation.set(-0.5 * rotK * (u > 0.84 && r.empty ? 0.3 : 1), 0.25 * rotK, (isRifle ? 0.9 : 0.6) * rotK);
    // magazine events + motion
    if (!r.magOut && u >= 0.2) { r.magOut = true; ctx.bus.emit('reload', { stage: 'magOut', weapon: sp.name }); r.dropV = 0; r.dropY = 0; }
    if (r.magOut && !r.magIn) {
      if (u < 0.5) { r.dropV = (r.dropV || 0) + 12 * dt; r.dropY = (r.dropY || 0) + r.dropV * dt; mag.position.copy(magHome).add(_v3.set(0.0, -r.dropY, -r.dropY * 0.4)); mag.rotation.x = -r.dropY * 2.5; mag.visible = r.dropY < 0.5; }
      else { // new mag carried by the left hand from below into the well
        const k = sstep((u - 0.5) / (r.empty ? 0.22 : 0.26)); mag.visible = true;
        mag.position.copy(magHome).add(_v3.set(0.0, -0.2 * (1 - k), -0.05 * (1 - k))); mag.rotation.set(-0.35 * (1 - k), 0, 0.3 * (1 - k));
      }
    }
    if (!r.magIn && u >= (r.empty ? 0.72 : 0.76)) { r.magIn = true; mag.position.copy(magHome); mag.rotation.set(0, 0, 0); mag.visible = true; ctx.bus.emit('reload', { stage: 'magIn', weapon: sp.name }); S.rpv.y += 0.6; S.rrv.x += 1.2;
      const take = Math.min(sp.mag - w.ammo, w.reserve); w.ammo += take; w.reserve -= take; w.cur.ammo = w.ammo; w.cur.reserve = w.reserve; if (!r.empty) w.slideLocked = false; }
    // charging handle / slide rack on empty reload
    if (r.empty) {
      const rk = u > 0.86 && u < 0.98 ? pulse((u - 0.86) / 0.12, 0.45, 0.55) : 0;
      if (w.parts.chargingHandle) w.parts.chargingHandle.position.z = 0.098 + rk * 0.04;
      if (w.parts.bolt) w.parts.bolt.position.z = -0.02 + rk * 0.05;
      if (!r.racked && u > 0.94) { r.racked = true; w.slideLocked = false; w.boltT = 0.02; S.rrv.x -= 0.8; S.rpv.z += 0.3; if (isRifle) w.boltT = 9; }
      if (sp.slot === 1) w.slideLocked = w.slideLocked && u < 0.93;
    }
    if (u >= 1) endReload(true);
  }

  // ---------- inspect ----------
  const insp = _ins.set(0, 0, 0); let inspRot = null;
  if (S.inspect) { const k = S.inspect.t / S.inspect.dur; const e = Math.sin(k * Math.PI); inspRot = [0.25 * e, 1.25 * Math.sin(k * Math.PI * 2) * e + 0.3 * e, 0.55 * e]; insp.set(-0.06 * e, 0.02 * e, 0.05 * e); }

  // ---------- pose composition ----------
  const sight = w.parts.sight.position;
  const adsPos = [-sight.x, -sight.y, -sp.adsDist - sight.z];
  const pos = lerp3(_v, sp.hip.pos, adsPos, S.ads), rot = lerp3(_v2, sp.hip.rot, [0, 0, 0], S.ads);
  lerp3(pos, [pos.x, pos.y, pos.z], sp.sprint.pos, S.sprint); lerp3(rot, [rot.x, rot.y, rot.z], sp.sprint.rot, S.sprint);
  lerp3(pos, [pos.x, pos.y, pos.z], sp.lower.pos, S.lower); lerp3(rot, [rot.x, rot.y, rot.z], sp.lower.rot, S.lower);
  pos.add(reloadOff.pos).add(insp); rot.add(reloadOff.rot); if (inspRot) { rot.x += inspRot[0]; rot.y += inspRot[1]; rot.z += inspRot[2]; }
  // wall clip avoidance: pull back when something is right in front
  if (ctx.colliders?.length && (ctx.time.frame % 3 === 0)) { cam.getWorldDirection(_fwd); _ray.set(cam.getWorldPosition(_up), _fwd); let best = 0.8; for (let i = 0; i < ctx.colliders.length; i++) { const b = ctx.colliders[i]; if (!b?.min) continue; const hp = _ray.intersectBox(b, _v3); if (hp) { const d = hp.distanceTo(_ray.origin); if (d < best) best = d; } } S.wallTarget = best < 0.8 ? (0.8 - best) : 0; }
  S.wallPull = damp(S.wallPull, S.wallTarget || 0, 12, dt); pos.z += S.wallPull * 0.55; pos.y -= S.wallPull * 0.08; rot.x += S.wallPull * 0.9; rot.y += S.wallPull * 0.4;
  if (S.showcase) { const sc = S.showcase; pos.set(sc.x, sc.y, -sc.dist); rot.set(sc.pitch, sc.yaw, 0); }
  S.poseNode.position.copy(pos); S.poseNode.rotation.set(rot.x, rot.y, rot.z);

  // ---------- sway node: idle sway + look lag + bob + recoil spring ----------
  const t = S.time, adsK = lerp(1, 0.18, S.ads), sprintK = 1 + S.sprint * 1.5;
  const mdx = input?.mouse?.dx ?? 0, mdy = input?.mouse?.dy ?? 0;
  S.lookX = damp(S.lookX, clamp(mdx, -60, 60), 14, dt); S.lookY = damp(S.lookY, clamp(mdy, -60, 60), 14, dt);
  const bob = p?.bob || { x: 0, y: 0, roll: 0 }; S.bobX = damp(S.bobX, bob.x, 22, dt); S.bobY = damp(S.bobY, bob.y, 22, dt);
  // spring integrate (semi-implicit): x'' = -k x - c x'
  const K = 420, C = 30; // substepped: raw Euler at dt>=0.08 s (sub-12 fps) went unstable and made the viewmodel jitter after landings/shots
  for (const [x, v] of [[S.rp, S.rpv], [S.rr, S.rrv]]) { let rem = dt; while (rem > 0) { const h = Math.min(rem, 1 / 240); v.x += (-K * x.x - C * v.x) * h; v.y += (-K * x.y - C * v.y) * h; v.z += (-K * x.z - C * v.z) * h; x.addScaledVector(v, h); rem -= h; } }
  const sn = S.swayNode; if (S.showcase) { sn.position.set(0, 0, 0); sn.rotation.set(0, 0, 0); }
  const swx = (Math.sin(t * 0.7) + 0.5 * Math.sin(t * 1.9 + 1.3) + 0.25 * Math.sin(t * 3.7)) * 0.0022 * adsK * sprintK;
  const swy = (Math.sin(t * 1.1 + 2.0) + 0.5 * Math.sin(t * 2.6) + 0.25 * Math.sin(t * 4.3 + 0.7)) * 0.0018 * adsK * sprintK;
  const land = p?.landImpulse || 0;
  if (!S.showcase) sn.position.set(
    swx - S.lookX * 0.00045 * adsK + S.bobX * 0.9 * adsK + S.rp.x,
    swy - S.lookY * 0.00035 * adsK - S.bobY * 1.1 * adsK - land * 0.05 + S.rp.y * 0.02,
    S.rp.z * 0.025 + land * 0.02);
  if (!S.showcase) sn.rotation.set(
    (Math.sin(t * 0.9 + 0.4) * 0.004) * adsK - S.lookY * 0.0012 * adsK + S.rr.x * 0.05 - land * 0.12 - S.bobY * 1.4 * adsK,
    (Math.sin(t * 0.6 + 1.7) * 0.004) * adsK - S.lookX * 0.0016 * adsK + S.rr.y * 0.05 + S.bobX * 1.2 * adsK,
    (Math.sin(t * 0.8 + 3.1) * 0.005) * adsK - S.lookX * 0.0011 * adsK + S.rr.z * 0.05 + (bob.roll || 0) * 0.6 + S.bobX * 1.4 * adsK);

  // ---------- moving parts ----------
  for (const ww of S.weapons) {
    ww.boltT += dt; ww.trigT += dt;
    if (ww.spec.slot === 0) {
      if (!S.reload || !S.reload.empty) { const bt = ww.boltT; ww.parts.bolt.position.z = -0.02 + (bt < 0.075 ? pulse(bt / 0.075, 0.35, 0.65) * 0.05 : 0); }
      ww.parts.trigger.rotation.x = ww.trigT < 0.08 ? pulse(ww.trigT / 0.08, 0.3, 0.7) * 0.35 : 0;
    } else {
      const bt = ww.boltT; const cyc = bt < 0.085 ? pulse(bt / 0.085, 0.3, 0.7) : 0;
      ww.parts.slide.position.z = ww.slideLocked ? 0.03 : cyc * 0.032;
      ww.parts.trigger.rotation.x = ww.trigT < 0.1 ? pulse(ww.trigT / 0.1, 0.3, 0.7) * 0.4 : 0;
    }
    ww.cur.ammo = ww.ammo; ww.cur.reserve = ww.reserve;
  }
  // muzzle flash lifetime
  if (S.flashW) { S.flashT += dt; const fl = S.flashW; if (S.flashT >= S.flashLife) { fl.flash.visible = false; S.flashW = null; } else { const k = S.flashT / S.flashLife; fl.flashMat.opacity = k < 0.5 ? 1 : 1 - (k - 0.5) * 2; fl.flash.scale.setScalar(fl.flash.scale.x * (1 + dt * 4)); } }

  // ---------- world FX ----------
  cam.updateMatrixWorld(true);
  S.fx.update(dt, cam); S.grenades.update(dt);
}

export function onResize(ctx) { S && (S.lastFov = -1); }

export function reset(ctx) {
  if (!S) return;
  cancelActions(); S.swap = null; S.cur = 0; S.dead = false;
  for (const w of S.weapons) { w.ammo = w.spec.mag; w.reserve = w.spec.reserve; w.fireTimer = 0; w.shots = 0; w.lastShot = -9; w.boltT = 9; w.trigT = 9; w.slideLocked = false; w.flash.visible = false; w.group.visible = w.spec.slot === 0; w.cur.ammo = w.ammo; w.cur.reserve = w.reserve; w.parts.mag.visible = true; w.parts.mag.position.copy(w.parts.mag.userData.home); w.parts.mag.rotation.set(0, 0, 0); }
  S.adsTarget = 0; S.adsT = 0; S.ads = 0; S.adsOn = false; S.sprint = 0; S.lower = 0; S.rp.set(0, 0, 0); S.rr.set(0, 0, 0); S.rpv.set(0, 0, 0); S.rrv.set(0, 0, 0);
  S.spreadExtra = 0; S.recPitch = 0; S.recYaw = 0; S.grenadeCount = GRENADES; S.flashW = null; S.wallPull = 0; S.wallTarget = 0;
  S.fx.reset(); S.grenades.reset();
}
