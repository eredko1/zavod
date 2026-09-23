// Shared ambient crowd: instanced low-poly civilians (standing / walking / phone), rolling suitcases and backpacks.
// Owned by: main (integration). Used by terminal (and any map that needs life). Pure set dressing: no colliders, not
// raycast targets (gameplay and AI line-of-sight are unchanged), but they cast shadows so they sit on the floor.
// Spots: [{ x, y, z, ry, pose: 'stand'|'walk'|'phone', bag: 0|1|2, s }].
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TOPS = [0x1d2230, 0x3a3f46, 0x6b1e23, 0x2b3b52, 0x8a8478, 0x1a1a1a, 0x4b5a3a, 0x7d6a4f, 0xb9b3a6, 0x23324a, 0x5a2f4a, 0x2f4f4f, 0x9c7b55, 0x3c3c44, 0xc2bfb6];
const BOTTOMS = [0x1c1f26, 0x2a2e35, 0x3b4150, 0x151515, 0x4a4238, 0x2b3444, 0x5b5750, 0x1f2a3a];
const SKIN = [0xf1c9a5, 0xe0ac86, 0xc68b62, 0x9a6440, 0x6e4529, 0x4a2e1c, 0xf5d5bb];
const HAIR = [0x1a1410, 0x2d2118, 0x4a3524, 0x7a5a3a, 0x9a9590, 0x0e0e0e, 0xb58a52];

const cap = (r, len, rs = 8) => new THREE.CapsuleGeometry(r, len, 2, Math.min(rs, 6));
const place = (g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { g.scale(sx, sy, sz); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; };
const merge = (arr) => mergeGeometries(arr.map((g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; }), false);

/** One figure, 1.74 m, facing +z. Returns geometries per slot: top, bottom, skin, hair, shoes. */
function figure(pose) {
  const walk = pose === 'walk', phone = pose === 'phone';
  const legSwing = walk ? 0.3 : 0.0, armSwing = walk ? 0.28 : 0.04;
  const top = [], bottom = [], skin = [], hair = [], shoes = [];
  // legs (trousers) hinge at the hip (y 0.9)
  for (const s of [-1, 1]) {
    const a = s * legSwing; const hipY = 0.9, L = 0.82;
    const leg = cap(0.068, L - 0.14, 7); leg.translate(0, -L / 2, 0); leg.rotateX(a); leg.translate(s * 0.095, hipY, 0); bottom.push(leg);
    const fx = s * 0.095, fz = Math.sin(a) * L + 0.05, fy = hipY - Math.cos(a) * L + 0.035;
    shoes.push(place(new THREE.BoxGeometry(0.1, 0.075, 0.26), fx, fy, fz + 0.02, -a * 0.3));
  }
  // pelvis + torso (coat/jacket): tapered, flattened front-to-back, slight chest
  const torso = new THREE.CylinderGeometry(0.2, 0.17, 0.62, 12, 3); torso.scale(1, 1, 0.62); torso.translate(0, 1.2, 0); top.push(torso);
  const shoulders = new THREE.SphereGeometry(0.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); shoulders.scale(1.05, 0.45, 0.66); shoulders.translate(0, 1.5, 0); top.push(shoulders);
  const hips = new THREE.CylinderGeometry(0.175, 0.18, 0.16, 12); hips.scale(1, 1, 0.66); hips.translate(0, 0.88, 0); bottom.push(hips);
  // arms from the shoulder (y 1.46), sleeves = top colour, hands = skin
  for (const s of [-1, 1]) {
    let a = -s * armSwing, side = 0.08; const L = 0.62;
    if (phone && s === 1) {   // upper arm hangs, forearm folds up to hold the phone at chest height in front of the face
      const U = 0.3, ex = s * 0.23, ey = 1.46 - U, ez = 0.05;
      const up = cap(0.052, U - 0.06, 7); up.translate(0, -U / 2, 0); up.rotateX(-0.15); up.translate(s * 0.235, 1.46, 0); top.push(up);
      const hx = 0.1, hy = 1.4, hz = 0.3; const dx = hx - ex, dy = hy - ey, dz = hz - ez, F = Math.hypot(dx, dy, dz);
      const fo = cap(0.048, F - 0.06, 7); fo.translate(0, F / 2, 0); fo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize())); fo.translate(ex, ey, ez); top.push(fo);
      const hand = new THREE.SphereGeometry(0.048, 7, 5); hand.scale(0.8, 1.2, 0.7); hand.translate(hx, hy, hz); skin.push(hand);
      const ph = new THREE.BoxGeometry(0.075, 0.15, 0.012); ph.rotateX(-0.9); ph.translate(hx - 0.01, hy + 0.06, hz + 0.02); shoes.push(ph);
      continue;
    }
    const arm = cap(0.052, L - 0.1, 7); arm.translate(0, -L / 2, 0); arm.rotateZ(s * side); arm.rotateX(a); arm.translate(s * 0.235, 1.46, 0); top.push(arm);
    const hx = s * (0.235 + Math.sin(side) * L), hy = 1.46 - Math.cos(a) * L * Math.cos(side), hz = -Math.sin(a) * L;
    const hand = new THREE.SphereGeometry(0.048, 7, 5); hand.scale(0.8, 1.2, 0.7); hand.translate(hx, hy - 0.02, hz); skin.push(hand);
  }
  // neck + head + hair
  const neck = new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8); neck.translate(0, 1.57, 0); skin.push(neck);
  const head = new THREE.SphereGeometry(0.105, 10, 7); head.scale(0.88, 1.08, 0.98); head.translate(0, 1.66 + (phone ? -0.015 : 0), phone ? 0.03 : 0); skin.push(head);
  const nose = new THREE.ConeGeometry(0.018, 0.04, 4); nose.rotateX(Math.PI / 2); nose.translate(0, 1.655, 0.105); skin.push(nose);
  const hr = new THREE.SphereGeometry(0.112, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55); hr.scale(0.9, 1.05, 1.02); hr.translate(0, 1.672, -0.012); hair.push(hr);
  return { top: merge(top), bottom: merge(bottom), skin: merge(skin), hair: merge(hair), shoes: merge(shoes) };
}

function suitcase() { // rolling carry-on standing beside its owner, handle extended
  const body = [], dark = [];
  body.push(place(new THREE.BoxGeometry(0.38, 0.55, 0.23), 0, 0.33, 0));
  for (const x of [-0.12, 0.12]) dark.push(place(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), x, 0.85, -0.09));
  dark.push(place(new THREE.BoxGeometry(0.28, 0.03, 0.03), 0, 1.1, -0.09));
  for (const x of [-0.15, 0.15]) dark.push(place(new THREE.CylinderGeometry(0.03, 0.03, 0.025, 8), x, 0.03, -0.08, 0, 0, Math.PI / 2));
  return { body: merge(body), dark: merge(dark) };
}

let MATS = null;
function mats() {
  if (MATS) return MATS;
  const cloth = (r) => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: r, metalness: 0 });
  MATS = { top: cloth(0.92), bottom: cloth(0.9), skin: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62 }), hair: cloth(0.8),
    shoes: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.55 }), case: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.2 }), caseDark: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.5 }) };
  for (const k in MATS) MATS[k].name = 'crowd_' + k;
  return MATS;
}

export function buildCrowd(world, spots) {
  const { scene, R } = world; if (!spots.length) return;
  const M = mats(); const pick = (a) => new THREE.Color(a[(R() * a.length) | 0]);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const add = (geo, mat, list, colorFn, name) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length); im.name = 'crowd:' + name;
    list.forEach((s, i) => { q.setFromAxisAngle(up, s.ry || 0); p.set(s.x, s.y || 0, s.z); const k = s.s || 1; sc.set(k * (s.wide || 1), k, k * (s.wide || 1)); im.setMatrixAt(i, m4.compose(p, q, sc)); if (colorFn) im.setColorAt(i, colorFn(s)); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = !/^lie/.test(name); im.receiveShadow = true; im.frustumCulled = false; scene.add(im);
  };
  for (const s of spots) { s.s = s.s || (0.93 + R() * 0.14); s.wide = 0.92 + R() * 0.18; s.cTop = pick(TOPS); s.cBot = pick(BOTTOMS); s.cSkin = pick(SKIN); s.cHair = pick(HAIR); }
  for (const pose of ['stand', 'walk', 'phone', 'lie']) {
    const list = spots.filter((s) => (s.pose || 'stand') === pose); if (!list.length) continue;
    const F = figure(pose === 'lie' ? 'stand' : pose);
    if (pose === 'lie') for (const k of Object.keys(F)) { F[k].rotateX(-Math.PI / 2); F[k].translate(0, 0.13, 0.85); }   // sunbather on their back, centred on the spot
    add(F.top, M.top, list, (s) => s.cTop, pose + 'Top'); add(F.bottom, M.bottom, list, (s) => s.cBot, pose + 'Bot');
    add(F.skin, M.skin, list, (s) => s.cSkin, pose + 'Skin'); add(F.hair, M.hair, list, (s) => s.cHair, pose + 'Hair'); add(F.shoes, M.shoes, list, null, pose + 'Shoes');
  }
  // suitcases stand 0.45 m to the owner's right
  const cases = spots.filter((s) => s.bag === 1 && s.pose !== 'walk').map((s) => { const c = Math.cos(s.ry || 0), sn = Math.sin(s.ry || 0); return { x: s.x - c * 0.45, y: s.y || 0, z: s.z + sn * 0.45, ry: (s.ry || 0) + (R() - 0.5) * 0.6, col: new THREE.Color([0x1c2433, 0x5a1d1d, 0x2c2c2c, 0x6b6f75, 0x1f3d33][(R() * 5) | 0]) }; });
  if (cases.length) { const S = suitcase(); add(S.body, M.case, cases, (c) => c.col, 'cases'); add(S.dark, M.caseDark, cases, null, 'caseHandles'); }
}

/** Scatter `n` spots inside a rect at height y, rejecting points where `blocked(x, z)` is true. */
export function scatter(R, n, x0, x1, z0, z1, y, blocked = () => false, opts = {}) {
  const out = [];
  for (let i = 0; i < n * 20 && out.length < n; i++) {
    const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
    if (blocked(x, z) || out.some((o) => Math.hypot(o.x - x, o.z - z) < (opts.gap || 1.1))) continue;
    const r = R();
    out.push({ x, y, z, ry: R() * Math.PI * 2, pose: r < (opts.walk ?? 0.45) ? 'walk' : r < (opts.walk ?? 0.45) + 0.15 ? 'phone' : 'stand', bag: R() < (opts.bag ?? 0.25) ? 1 : 0 });
  }
  return out;
}
