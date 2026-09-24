// Shared ambient crowd: instanced procedural civilians (standing / walking in two stride phases / phone / lying / sitting),
// rolling suitcases. Owned by: main (integration). Used by terminal, wsp, sbu and coney. Pure set dressing: no colliders,
// not raycast targets (gameplay and AI line-of-sight are unchanged); they cast shadows so they sit on the floor.
// Spots: [{ x, y, z, ry, pose: 'stand'|'walk'|'phone'|'lie'|'sit', bag: 0|1|2, s, outfit?: 'city'|'summer'|'beach' }].
//
// Figures are built from a tiny joint rig (IK arms/legs) with lofted tubes: a super-elliptic torso with hips/waist/chest,
// deltoid shoulders, tapered limbs with elbows and knees, mitten hands with thumbs, 0.28 x 0.1 x 0.1 m shoes lofted around
// the ankle, a jawed head with nose/ears/brows/eyes/lips. One body geometry per (pose, sex); every vertex carries a region
// id + a 0..1 param along its limb, and the fragment shader picks the per-instance colour (top / bottom / skin / shoes)
// with crisp hems, so t-shirt vs long sleeve, shorts vs trousers, bikinis, one-pieces and trunks are all the same mesh.
// Hair (short / long / cap) and skirts are separate shared instanced meshes, so the whole crowd is ~18 draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const place = (g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { g.scale(sx, sy, sz); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; };
const merge = (arr) => mergeGeometries(arr.map((g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; }), false);

// regions (vertex attribute rg.x); rg.y = param along the part (torso: crotch 0 -> neck 1, limbs: root 0 -> end 1)
const SKIN = 0, TORSO = 1, ARM = 2, LEG = 3, SHOE = 4, EYE = 5, LIP = 6, DARK = 7;

/** Accumulates indexed triangles with position/normal/rg. */
class GB {
  constructor() { this.p = []; this.n = []; this.r = []; this.i = []; }
  /** add an indexed BufferGeometry (normals computed if missing); region + t (number or fn(x,y,z) of the final pos) */
  add(g, region, t = 0, m = null) {
    if (!g.attributes.normal) g.computeVertexNormals();
    if (m) g.applyMatrix4(m);
    const P = g.attributes.position, N = g.attributes.normal, b = this.p.length / 3;
    for (let k = 0; k < P.count; k++) {
      const x = P.getX(k), y = P.getY(k), z = P.getZ(k); this.p.push(x, y, z); this.n.push(N.getX(k), N.getY(k), N.getZ(k));
      this.r.push(region, typeof t === 'function' ? t(x, y, z) : t);
    }
    if (g.index) for (let k = 0; k < g.index.count; k++) this.i.push(b + g.index.getX(k)); else for (let k = 0; k < P.count; k++) this.i.push(b + k);
    return this;
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('rg', new THREE.Float32BufferAttribute(this.r, 2)); g.setIndex(this.i); return g;
  }
}

/** Lofted tube through rings {c, rx, rz, off?, t, tf?(a)}; frame: u = lateral ref L orthogonalised to the tangent, v = T x u
 *  flipped to agree with hint F. n = super-ellipse exponent. Poles close both ends. Returns {g, t[]} (t per vertex). */
function tube(rings, segs, L, F, { n = 2, cap0 = 0.5, cap1 = 0.5, bump = null } = {}) {
  const pos = [], ts = [], idx = []; const T = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3();
  const frames = rings.map((r, i) => {
    const a = rings[Math.max(0, i - 1)].c, b = rings[Math.min(rings.length - 1, i + 1)].c; T.subVectors(b, a).normalize();
    u.copy(L).addScaledVector(T, -L.dot(T)).normalize(); v.crossVectors(T, u); if (v.dot(F) < 0) { u.negate(); v.negate(); }
    return { T: T.clone(), u: u.clone(), v: v.clone() };
  });
  const se = (c) => Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
  rings.forEach((r, i) => {
    const f = frames[i];
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2; let cx = se(Math.cos(a)) * r.rx, cz = se(Math.sin(a)) * r.rz;
      if (bump) cz += bump(r, a);
      const p = r.c.clone().addScaledVector(f.u, cx).addScaledVector(f.v, cz + (r.off || 0)); pos.push(p.x, p.y, p.z); ts.push(r.tf ? r.tf(a) : r.t);
    }
  });
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < segs; j++) {
    const a = i * segs + j, b = i * segs + (j + 1) % segs, c = (i + 1) * segs + j, d = (i + 1) * segs + (j + 1) % segs;
    idx.push(a, b, c, b, d, c);
  }
  const r0 = rings[0], rN = rings[rings.length - 1], f0 = frames[0], fN = frames[rings.length - 1];
  const p0 = r0.c.clone().addScaledVector(f0.T, -Math.min(r0.rx, r0.rz) * cap0).addScaledVector(f0.v, r0.off || 0), i0 = pos.length / 3; pos.push(p0.x, p0.y, p0.z); ts.push(r0.tf ? r0.tf(-1) : r0.t);
  const p1 = rN.c.clone().addScaledVector(fN.T, Math.min(rN.rx, rN.rz) * cap1).addScaledVector(fN.v, rN.off || 0), i1 = pos.length / 3; pos.push(p1.x, p1.y, p1.z); ts.push(rN.tf ? rN.tf(-1) : rN.t);
  const last = (rings.length - 1) * segs;
  for (let j = 0; j < segs; j++) { idx.push(i0, (j + 1) % segs, j); idx.push(i1, last + j, last + (j + 1) % segs); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return { g, t: ts };
}
const addTube = (B, tb, region) => { const b = B.p.length / 3; B.add(tb.g, region, 0); for (let k = 0; k < tb.t.length; k++) B.r[(b + k) * 2 + 1] = tb.t[k]; };

/** two-bone IK: returns {mid, end} */
function ik(root, target, L1, L2, pole) {
  const d0 = target.clone().sub(root); const d = Math.min(d0.length(), (L1 + L2) * 0.999), dir = d0.normalize();
  const a = (L1 * L1 + d * d - L2 * L2) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const perp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  return { mid: root.clone().addScaledVector(dir, a).addScaledVector(perp, h), end: root.clone().addScaledVector(dir, d) };
}
const lerp3 = (a, b, k) => a.clone().lerp(b, k);
const basis = (X, Y, Z, o) => new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(o);

// body shapes (1.74 m, facing +z). Torso rings: [y, rx, rz, zc]
const SHAPE = {
  m: { sh: 0.18, hip: 0.09, arm: 1, leg: 1, bust: 0,
    torso: [[0.845, 0.13, 0.09, 0], [0.9, 0.172, 0.112, -0.006], [0.98, 0.168, 0.106, 0], [1.06, 0.153, 0.098, 0.008], [1.16, 0.16, 0.104, 0.012], [1.26, 0.176, 0.116, 0.016], [1.345, 0.188, 0.112, 0.008], [1.41, 0.19, 0.098, -0.006], [1.46, 0.14, 0.08, -0.012], [1.5, 0.062, 0.058, -0.008]] },
  f: { sh: 0.163, hip: 0.094, arm: 0.86, leg: 1.02, bust: 0.034,
    torso: [[0.845, 0.135, 0.095, 0], [0.91, 0.184, 0.12, -0.012], [0.99, 0.172, 0.108, -0.004], [1.07, 0.132, 0.088, 0.006], [1.16, 0.142, 0.094, 0.01], [1.25, 0.158, 0.104, 0.014], [1.33, 0.168, 0.1, 0.008], [1.405, 0.17, 0.09, -0.006], [1.455, 0.125, 0.074, -0.01], [1.5, 0.056, 0.054, -0.008]] },
};
const HEAD_C = V3(0, 1.625, 0), HEAD_R = V3(0.08, 0.108, 0.097);
// head deform: narrow jaw + chin, flatter sides, slightly deeper back of skull
const headDeform = (x, y, z) => { const yu = y / HEAD_R.y; const jaw = yu < 0 ? 1 - 0.3 * yu * yu : 1 - 0.06 * yu * yu; return [x * jaw * (1 - 0.05 * Math.max(0, z / HEAD_R.z)), y, z * (yu < 0 ? 1 - 0.12 * yu * yu : 1) + (z < 0 ? z * 0.08 : 0)]; };
const headZ = (x, y) => { const yu = (y - HEAD_C.y) / HEAD_R.y; const jaw = yu < 0 ? 1 - 0.3 * yu * yu : 1 - 0.06 * yu * yu; const xu = x / (HEAD_R.x * jaw * 0.96); return HEAD_R.z * Math.sqrt(Math.max(0, 1 - xu * xu - yu * yu)) * (yu < 0 ? 1 - 0.12 * yu * yu : 1); };

/** pose definitions in the standing frame (hips 0.92). a: arm wrist targets + poles, l: ankle targets + poles + foot pitch/yaw */
function poseDef(pose, sh, hip) {
  const P = { head: null, post: null };
  const stand = () => ({
    arms: [[V3(-(sh + 0.065), 0.875, 0.025), V3(-0.3, 0, -1)], [V3(sh + 0.065, 0.875, 0.025), V3(0.3, 0, -1)]],
    legs: [[V3(-hip - 0.02, 0.085, 0.01), V3(0, 0, 1), 0, -0.14], [V3(hip + 0.02, 0.085, 0.01), V3(0, 0, 1), 0, 0.14]] });
  if (pose === 'stand') return { ...P, ...stand() };
  if (pose === 'walkA' || pose === 'walkB') {
    const s = pose === 'walkA' ? 1 : -1;   // walkA: right (+x) leg forward
    return { ...P, drop: 0.022,
      arms: [[V3(-(sh + 0.045), 0.92, s * 0.2), V3(-0.2, 0, -1)], [V3(sh + 0.045, 0.9, -s * 0.17), V3(0.2, 0, -1)]].map(([t, p], i) => [t, p]),
      legs: [[V3(-hip + 0.01, s > 0 ? 0.15 : 0.1, s > 0 ? -0.27 : 0.3), V3(0, 0, 1), s > 0 ? -0.55 : 0.28, -0.05],
             [V3(hip - 0.01, s > 0 ? 0.1 : 0.15, s > 0 ? 0.3 : -0.27), V3(0, 0, 1), s > 0 ? 0.28 : -0.55, 0.05]] };
  }
  if (pose === 'phone') { const d = stand(); d.arms[1] = [V3(0.07, 1.23, 0.24), V3(1, -0.6, -0.4)]; d.arms[0] = [V3(-0.05, 1.12, 0.17), V3(-1, -0.5, -0.3)]; d.head = 0.32; d.phone = true; return { ...P, ...d }; }
  if (pose === 'lie') return { ...P, head: -0.12,
    arms: [[V3(-(sh + 0.2), 0.92, -0.06), V3(-0.3, 0, -1)], [V3(0.09, 1.73, -0.06), V3(1, 0.1, -0.2)]],
    legs: [[V3(-hip - 0.04, 0.46, -0.03), V3(0, 0.1, 1), -Math.PI / 2, -0.1], [V3(hip + 0.05, 0.085, 0.0), V3(0, 0, 1), 0.05, 0.25]],
    post: new THREE.Matrix4().makeTranslation(0, 0.13, 0.85).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)) };
  if (pose === 'sit') return { ...P, head: -0.05,
    arms: [[V3(-(sh + 0.08), 0.88, -0.2), V3(-0.3, 0, -1)], [V3(sh + 0.08, 0.88, -0.2), V3(0.3, 0, -1)]],
    legs: [[V3(-hip - 0.05, 0.885, 0.6), V3(0, 1, 0.2), 0.12, -0.12], [V3(hip + 0.05, 0.885, 0.6), V3(0, 1, 0.2), 0.12, 0.12]],
    post: new THREE.Matrix4().makeTranslation(0, -0.8, 0) };
  return poseDef('stand', sh, hip);
}

/** Head matrix (tilt about the neck, then the pose's post transform) — shared by body head parts and the hair meshes. */
function headMatrix(pose) {
  const d = poseDef(pose, 0.18, 0.09); const m = new THREE.Matrix4();
  if (d.post) m.copy(d.post);
  if (d.drop) m.multiply(new THREE.Matrix4().makeTranslation(0, -d.drop, 0));
  if (d.head) { const piv = V3(0, 1.52, -0.01); m.multiply(new THREE.Matrix4().makeTranslation(piv.x, piv.y, piv.z)).multiply(new THREE.Matrix4().makeRotationX(d.head)).multiply(new THREE.Matrix4().makeTranslation(-piv.x, -piv.y, -piv.z)); }
  return m;
}

/** One body (skin + clothes + shoes, colours from the shader) for a sex + pose. */
function body(sex, pose) {
  const S = SHAPE[sex], d = poseDef(pose, S.sh, S.hip), B = new GB(), X = V3(1, 0, 0);
  // torso: super-elliptic rings, bust bump on the front at the chest rings
  const tr = S.torso.map(([y, rx, rz, zc]) => ({ c: V3(0, y, zc), rx, rz, t: (y - 0.845) / (1.5 - 0.845), y }));
  const bump = S.bust ? (r, a) => { const k = Math.exp(-(((r.y - 1.26) / 0.05) ** 2)); if (k < 0.05) return 0; const ang = a - Math.PI / 2; return S.bust * k * (Math.exp(-(((ang - 0.42) / 0.32) ** 2)) + Math.exp(-(((ang + 0.42) / 0.32) ** 2))); } : null;
  addTube(B, tube(tr, 8, X, V3(0, 0, 1), { n: 2.3, cap0: 0.3, cap1: 0.2, bump }), TORSO);
  // legs
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1, [tgt, pole, pitch, yaw] = d.legs[i]; const H = V3(s * S.hip, 0.92, 0);
    const { mid: K, end: A } = ik(H, tgt, 0.43, 0.41, pole); const k = S.leg;
    const th = (f) => lerp3(H, K, f), sn = (f) => lerp3(K, A, f);
    const rings = [[th(0), 0.08], [th(0.14), 0.089, 0.004], [th(0.45), 0.077, 0.006], [th(0.84), 0.058, 0.004], [K, 0.052], [sn(0.22), 0.056, -0.012], [sn(0.6), 0.045, -0.006], [A.clone().add(V3(0, -0.01, 0)), 0.033]]
      .map(([c, r, off = 0], j, arr) => ({ c, rx: r * k, rz: r * k * 1.04, off, t: j / (arr.length - 1) }));
    addTube(B, tube(rings, 6, X, V3(0, 0.3, 1)), LEG);
    // shoe: lofted around the ankle along the foot (heel -> toe), sole = t 0, upper = t 1
    const F = V3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
    const lat = V3(Math.cos(yaw), 0, -Math.sin(yaw)); const U = new THREE.Vector3().crossVectors(F, lat).normalize(); if (U.y < 0 && pitch > -1.2) U.negate();
    if (pitch <= -1.2) { if (U.z < 0) U.negate(); }   // foot planted flat while lying: sole faces -z of the standing frame
    const sole = A.clone().addScaledVector(U, -0.085);
    const prof = [[-0.075, 0.08, 0.075], [-0.05, 0.1, 0.085], [0.02, 0.1, 0.095], [0.11, 0.065, 0.1], [0.18, 0.045, 0.085], [0.2, 0.035, 0.06]];
    const sr = prof.map(([sx, h, w]) => ({ c: sole.clone().addScaledVector(F, sx).addScaledVector(U, h / 2), rx: w / 2, rz: h / 2, tf: (a) => (a < 0 ? 0.5 : Math.sin(a) < -0.55 ? 0 : 1) }));
    addTube(B, tube(sr, 6, lat, U, { n: 3, cap0: 0.4, cap1: 0.6 }), SHOE);
  }
  // arms + hands
  const drop = d.drop || 0;
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1, [tgt, pole] = d.arms[i]; const Sh = V3(s * S.sh, 1.415 - drop, -0.005);
    const { mid: E, end: W } = ik(Sh, tgt, 0.295, 0.255, pole); const k = S.arm;
    const up = (f) => lerp3(Sh, E, f), fo = (f) => lerp3(E, W, f);
    const rings = [[Sh, 0.056, 0.056], [up(0.22), 0.054, 0.05], [up(0.55), 0.044, 0.044], [E, 0.037, 0.036], [fo(0.35), 0.038, 0.032], [W, 0.026, 0.021]]
      .map(([c, rx, rz], j, arr) => ({ c, rx: rx * (0.55 + 0.45 * k), rz: rz * (0.55 + 0.45 * k), t: j / (arr.length - 1) }));
    addTube(B, tube(rings, 5, V3(s, 0, 0), V3(0, 0, 1), { cap0: 0.9 }), ARM);
    // mitten hand + thumb, palm facing the thigh
    const D = W.clone().sub(E).normalize(); const Xh = V3(1, 0, 0).addScaledVector(D, -D.x).normalize(); const Yh = D.clone().negate(); const Zh = new THREE.Vector3().crossVectors(Xh, Yh);
    const hs = 0.92 + 0.08 * k; const hm = basis(Xh, Yh, Zh, W.clone().addScaledVector(D, 0.07));
    B.add(new THREE.SphereGeometry(1, 6, 4).scale(0.018 * hs, 0.078 * hs, 0.043 * hs), SKIN, 0, hm);
    B.add(new THREE.SphereGeometry(1, 5, 3).scale(0.012, 0.03, 0.012).rotateX(0.5).translate(0, -0.035, 0.035), SKIN, 0, hm);
    if (d.phone && s === 1) { // phone held facing the face
      const ph = W.clone().addScaledVector(D, 0.1); const n = V3(0, 1.62, 0.06).sub(ph).normalize(); const px = new THREE.Vector3().crossVectors(V3(0, 1, 0), n).normalize(); const py = new THREE.Vector3().crossVectors(n, px);
      B.add(new THREE.BoxGeometry(0.072, 0.15, 0.009), DARK, 0, basis(px, py, n, ph.addScaledVector(n, 0.01)));
    }
  }
  // neck + head (tilted for the phone pose)
  const HB = new GB();
  HB.add(tube([{ c: V3(0, 1.46, -0.012), rx: 0.052, rz: 0.05, t: 0 }, { c: V3(0, 1.525, -0.004), rx: 0.047, rz: 0.047, t: 0 }, { c: V3(0, 1.56, 0.0), rx: 0.045, rz: 0.045, t: 0 }], 8, X, V3(0, 0, 1)).g, SKIN);
  const hg = new THREE.SphereGeometry(1, 8, 6); { const P = hg.attributes.position; for (let k = 0; k < P.count; k++) { const [x, y, z] = headDeform(P.getX(k) * HEAD_R.x, P.getY(k) * HEAD_R.y, P.getZ(k) * HEAD_R.z); P.setXYZ(k, x, y, z); } hg.computeVertexNormals(); hg.translate(HEAD_C.x, HEAD_C.y, HEAD_C.z); }
  HB.add(hg, SKIN);
  const hy = HEAD_C.y; const fz = (x, y) => headZ(x, y);
  HB.add(new THREE.ConeGeometry(0.016, 0.042, 4).rotateY(Math.PI / 4).rotateX(Math.PI / 2 + 0.35).scale(0.9, 1, 1).translate(0, hy - 0.022, fz(0, hy - 0.022) + 0.012), SKIN);
  for (const s of [-1, 1]) {
    HB.add(new THREE.SphereGeometry(1, 5, 4).scale(0.011, 0.028, 0.019).rotateY(s * 0.3).translate(s * HEAD_R.x * 0.99, hy - 0.006, -0.008), SKIN);
    const q = (x, y, w, h, rg, dz = 0.0025) => HB.add(new THREE.PlaneGeometry(w, h).rotateY(s * Math.atan(x / 0.09) * 0.9).translate(s * x, y, fz(x, y) + dz), rg);
    q(0.031, hy + 0.006, 0.022, 0.011, EYE); q(0.032, hy + 0.024, 0.03, 0.0065, EYE, 0.004);
  }
  HB.add(new THREE.PlaneGeometry(0.036, 0.009).translate(0, hy - 0.058, fz(0, hy - 0.058) + 0.004), LIP);
  const hm = headMatrix(pose); if (d.post) hm.premultiply(new THREE.Matrix4().copy(d.post).invert());   // body gets the post transform below
  const hgeo = HB.geo(); hgeo.applyMatrix4(hm);
  const g = B.geo(); if (drop) g.translate(0, -drop, 0);
  // splice head into body
  const out = new GB(); out.p = [...g.attributes.position.array]; out.n = [...g.attributes.normal.array]; out.r = [...g.attributes.rg.array]; out.i = [...g.index.array];
  { const b = out.p.length / 3; out.p.push(...hgeo.attributes.position.array); out.n.push(...hgeo.attributes.normal.array); out.r.push(...hgeo.attributes.rg.array); for (const k of hgeo.index.array) out.i.push(b + k); }
  const res = out.geo(); if (d.post) res.applyMatrix4(d.post);
  return res;
}
// NOTE: drop (walk hip dip) moves arms/torso/legs down; the head matrix includes the same drop so hair follows.

/** Head-hugging hair shell: a sphere around the (deformed) head whose vertices sit `thick` outside the scalp where the
 *  coverage mask says hair, and sink just inside the head elsewhere, so the hairline is a soft edge on the skull. */
function shell(cover, thick, segW = 12, segH = 7, thetaLen = Math.PI * 0.8) {
  const g = new THREE.SphereGeometry(1, segW, segH, 0, Math.PI * 2, 0, thetaLen); const P = g.attributes.position;
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let k = 0; k < P.count; k++) {
    const x = P.getX(k), y = P.getY(k), z = P.getZ(k); const w = cover(x, y, z, ss);
    const [hx, hy, hz] = headDeform(x * HEAD_R.x, y * HEAD_R.y, z * HEAD_R.z); const k2 = 0.965 + w * (0.035 + thick * (0.7 + 0.3 * y));
    P.setXYZ(k, hx * k2 + HEAD_C.x, hy * k2 + HEAD_C.y, hz * k2 + HEAD_C.z);
  }
  g.deleteAttribute('uv'); g.computeVertexNormals(); return g;
}
function hairGeos() {
  const strip = (g) => { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g.index ? g.toNonIndexed() : g; };
  // hairline: high on the forehead, above the ears at the sides, down to the nape at the back
  const line = (x, z, front, side, back) => (z > 0 ? side + (front - side) * Math.pow(z, 1.3) - 0.12 * Math.abs(x) * z : side + (back - side) * Math.pow(-z, 1.2));
  const short = shell((x, y, z, ss) => ss(-0.08, 0.08, y - line(x, z, 0.5, 0.05, -0.55)), 0.13, 12, 6);
  const longTop = shell((x, y, z, ss) => ss(-0.08, 0.08, y - line(x, z, 0.52, -0.55, -0.7)), 0.17, 12, 7, Math.PI * 0.85);
  const back = new THREE.CylinderGeometry(0.1, 0.122, 0.26, 10, 1, true, Math.PI / 2 + 0.25, Math.PI - 0.5); back.scale(1, 1, 1.1); back.translate(0, 1.47, -0.018);
  const long = mergeGeometries([longTop, back].map(strip));
  const dome = shell((x, y, z, ss) => ss(-0.06, 0.06, y - (z > 0 ? 0.2 + 0.1 * z : 0.05 - 0.25 * -z)), 0.12, 12, 6, Math.PI * 0.7);
  const brim = new THREE.CircleGeometry(0.078, 8, 0, Math.PI); brim.rotateX(Math.PI / 2); brim.scale(0.95, 1, 0.95); brim.rotateX(0.16); brim.translate(0, 1.668, 0.072);
  const cap = mergeGeometries([dome, brim].map(strip));
  return { short: strip(short), long, cap };
}
function skirtGeo() {
  const r = [[1.06, 0.14, 0.096], [0.95, 0.19, 0.13], [0.8, 0.215, 0.17], [0.6, 0.245, 0.225]];
  const pos = [], idx = [], seg = 14;
  r.forEach(([y, rx, rz]) => { for (let j = 0; j < seg; j++) { const a = (j / seg) * Math.PI * 2; pos.push(Math.cos(a) * rx * (1 + 0.03 * Math.sin(a * 5) * (y < 0.9 ? 1 : 0)), y, Math.sin(a) * rz - 0.004); } });
  for (let i = 0; i < r.length - 1; i++) for (let j = 0; j < seg; j++) { const a = i * seg + j, b = i * seg + (j + 1) % seg, c = (i + 1) * seg + j, d = (i + 1) * seg + (j + 1) % seg; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

function suitcase() { // rolling carry-on standing beside its owner, handle extended
  const body = [], dark = [];
  body.push(place(new THREE.BoxGeometry(0.38, 0.55, 0.23), 0, 0.33, 0));
  for (const x of [-0.12, 0.12]) dark.push(place(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), x, 0.85, -0.09));
  dark.push(place(new THREE.BoxGeometry(0.28, 0.03, 0.03), 0, 1.1, -0.09));
  for (const x of [-0.15, 0.15]) dark.push(place(new THREE.CylinderGeometry(0.03, 0.03, 0.025, 8), x, 0.03, -0.08, 0, 0, Math.PI / 2));
  return { body: merge(body), dark: merge(dark) };
}

let MATS = null, GEOS = null;
function mats() {
  if (MATS) return MATS;
  const cloth = (r, side = THREE.FrontSide) => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: r, metalness: 0, side });
  const bodyM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  bodyM.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute vec2 rg; attribute vec3 iTop; attribute vec3 iBot; attribute vec3 iSkin; attribute vec3 iHair; attribute vec4 iOpt;
      varying vec2 vRg; varying vec3 vTop; varying vec3 vBot; varying vec3 vSkin; varying vec3 vHair; varying vec4 vOpt;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vRg = rg; vTop = iTop; vBot = iBot; vSkin = iSkin; vHair = iHair; vOpt = iOpt;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vRg; varying vec3 vTop; varying vec3 vBot; varying vec3 vSkin; varying vec3 vHair; varying vec4 vOpt;`)
      .replace('#include <color_fragment>', `
      vec3 cc = vSkin; float cr = 0.52; int R = int(vRg.x + 0.5); float t = vRg.y; float mode = vOpt.z;
      if (R == 1) {
        if (mode > 2.5) { if (t > 0.975) { } else if (t < 0.235) { cc = vBot; cr = 0.9; if (t > 0.205 && vOpt.y > 0.9) { cc = vec3(0.035, 0.03, 0.028); cr = 0.45; } } else { cc = vTop; cr = 0.92; } }
        else if (mode > 1.5) { if (t < 0.725) { cc = vTop; cr = 0.5; } }
        else if (mode > 0.5) { if (t < 0.13) { cc = vBot; cr = 0.5; } else if (t > 0.575 && t < 0.705) { cc = vTop; cr = 0.5; } }
        else { if (t < 0.215) { cc = vBot; cr = 0.7; } }
      } else if (R == 2) { if (t < vOpt.x) { cc = vTop; cr = 0.92; } }
      else if (R == 3) { if (t < vOpt.y) { cc = vBot; cr = 0.9; } }
      else if (R == 4) {
        if (vOpt.w < 0.0) { cc = vSkin * (t < 0.25 ? 0.82 : 1.0); }
        else { cc = t < 0.25 ? (vOpt.w > 0.5 ? vec3(0.78, 0.77, 0.74) : vec3(0.02)) : mix(vec3(0.018, 0.017, 0.02), vec3(0.8, 0.8, 0.78), vOpt.w); cr = 0.6; }
      }
      else if (R == 5) { cc = vHair * 0.35 + vec3(0.004); cr = 0.6; }
      else if (R == 6) { cc = vSkin * vec3(0.72, 0.46, 0.46); cr = 0.45; }
      else if (R == 7) { cc = vec3(0.012); cr = 0.25; }
      diffuseColor.rgb *= cc;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = cr;');
  };
  bodyM.customProgramCacheKey = () => 'crowdBody2';
  MATS = { body: bodyM, hair: cloth(0.72, THREE.DoubleSide), skirt: cloth(0.9, THREE.DoubleSide),
    case: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.2 }), caseDark: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.5 }) };
  for (const k in MATS) MATS[k].name = 'crowd_' + k;
  return MATS;
}
const POSES = ['stand', 'walkA', 'walkB', 'phone', 'lie', 'sit'];
function geos() {
  if (GEOS) return GEOS;
  GEOS = { body: {}, head: {}, hair: hairGeos(), skirt: skirtGeo() };
  for (const p of POSES) { GEOS.head[p] = headMatrix(p); }
  return GEOS;
}
const bodyGeo = (sex, pose) => { const G = geos(); const k = sex + pose; return G.body[k] || (G.body[k] = body(sex, pose)); };

// palettes (sRGB hex)
const PAL = {
  skin: [0xf3cfb0, 0xe8b894, 0xd9a07a, 0xc68b62, 0xa86c45, 0x8a5634, 0x6e4529, 0x4f3020, 0xf6dcc6],
  hair: [0x16110d, 0x2a1d14, 0x3f2c1d, 0x5c4028, 0x7a5a3a, 0xa8834f, 0xd2b27a, 0x8a3b1e, 0x9a9590, 0x0c0c0c],
  cityTop: [0x1d2230, 0x3a3f46, 0x6b1e23, 0x2b3b52, 0x8a8478, 0x1a1a1a, 0x4b5a3a, 0x7d6a4f, 0xb9b3a6, 0x23324a, 0x5a2f4a, 0x2f4f4f, 0x9c7b55, 0xc2bfb6, 0x8c2a2a, 0x3d5c7a, 0xe0ddd4],
  cityBot: [0x1c1f26, 0x2a2e35, 0x2b3a55, 0x151515, 0x4a4238, 0x33456a, 0x5b5750, 0x1f2a3a, 0x7a6a50, 0x3e4a60],
  sumTop: [0xf2f0ea, 0xe84a4a, 0x2a62c8, 0xf2c418, 0x5ac0b0, 0xf08aa8, 0x3a3f46, 0x7a9a4a, 0xff8a3a, 0x1d2230, 0x9ad0f0, 0xffffff, 0x9a3a8a, 0x2f7a4a, 0xd8c8a8, 0xc0303a],
  sumBot: [0x5a78a0, 0x3b5680, 0xb8a57a, 0x1c1c1c, 0x1d2a44, 0xe8e4da, 0x6a7040, 0x8a8a8a, 0x2b3a55, 0xc88a5a],
  dress: [0xf2e6c8, 0xe84a6a, 0x2a62c8, 0xf2c418, 0x1a1a1a, 0x6ad0c0, 0xffffff, 0xd84a2a, 0x7a3aa0, 0x9ad0f0],
  swim: [0xe8205a, 0x1a8ad8, 0xf2c418, 0x111111, 0x2fbf6a, 0xff6a2a, 0x7a2ae0, 0x0a2a6a, 0xf0f0f0, 0xd01a1a, 0x18c0c8, 0xff7ab0],
  cap: [0x1a2a5a, 0xc0202a, 0xf2f0ea, 0x151515, 0x2a6a3a, 0xf2c418, 0x3a6ab8, 0x8a8478],
};

/** pick a per-person outfit: colours + options (sleeve len, leg cover, top mode, shoe tone / barefoot), hair style, skirt */
function dress(R, s, kind) {
  const pick = (a) => a[(R() * a.length) | 0]; const fem = R() < 0.5;
  const o = { fem, top: pick(PAL.cityTop), bot: pick(PAL.cityBot), skin: pick(PAL.skin), hair: pick(PAL.hair), sleeve: 1.02, legs: 1.02, mode: 3, shoe: R() < 0.2 ? 0.85 : 0.05 + R() * 0.12, skirt: false, style: 'short', cap: pick(PAL.cap) };
  if (R() < 0.12) o.hair = pick([0x9a9590, 0xbdb8b0, 0x6a6560]);   // grey
  const hr = R();
  o.style = fem ? (hr < 0.62 ? 'long' : hr < 0.86 ? 'short' : 'cap') : (hr < 0.58 ? 'short' : hr < 0.76 ? 'bald' : hr < 0.95 ? 'cap' : 'long');
  if (kind === 'beach') {
    o.shoe = -1; o.legs = 0; o.sleeve = 0;
    if (fem) { const c = pick(PAL.swim); o.mode = R() < 0.62 ? 1 : 2; o.top = c; o.bot = R() < 0.7 ? c : pick(PAL.swim); if (o.mode === 2) o.bot = c; }
    else { o.mode = 0; o.bot = pick(PAL.swim.concat([0x2a4a7a, 0x3a5a2a, 0x7a2a2a])); o.legs = 0.3 + R() * 0.16; if (R() < 0.25) { o.mode = 3; o.top = pick(PAL.sumTop); o.sleeve = R() < 0.5 ? 0.3 : 0.0; } }
    if (!fem && R() < 0.1) o.style = 'bald';
  } else if (kind === 'summer') {
    const r = R(); o.top = pick(PAL.sumTop); o.bot = pick(PAL.sumBot); o.sleeve = r < 0.62 ? 0.3 + R() * 0.06 : r < 0.8 ? 0.0 : 1.02;
    o.legs = R() < 0.55 ? 0.36 + R() * 0.1 : R() < 0.2 ? 0.78 : 1.02; o.shoe = R() < 0.45 ? 0.85 + R() * 0.1 : R() < 0.2 ? -1 : 0.04 + R() * 0.2;
    if (fem && R() < 0.34) { o.skirt = true; o.legs = 0; if (R() < 0.55) { o.top = o.bot = pick(PAL.dress); } }
  } else {
    o.sleeve = R() < 0.72 ? 1.02 : 0.3; o.legs = R() < 0.9 ? 1.02 : 0.4;
    if (fem && R() < 0.22) { o.skirt = true; o.legs = 0; }
  }
  if (s.pose === 'lie' || s.pose === 'sit') o.skirt = false;   // skirt mesh is upright only
  return o;
}

export function buildCrowd(world, spots, opts = {}) {
  const { scene, R } = world; if (world.ctx?.isTouch && !opts.keepAll) spots = spots.filter((_, i) => i % 2 === 0);   // phones: half the people (instanced, but ~700k tris on coney)
  if (!spots.length) return;
  const M = mats(), G = geos();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const spotM = (s) => { q.setFromAxisAngle(up, s.ry || 0); p.set(s.x, s.y || 0, s.z); const k = s.s * (s.o.fem ? 0.945 : 1); sc.set(k * s.wide, k, k * s.wide); return new THREE.Matrix4().compose(p, q, sc); };
  const mesh = (geo, mat, n, name, shadow) => { const im = new THREE.InstancedMesh(geo, mat, n); im.name = 'crowd:' + name; im.castShadow = shadow; im.receiveShadow = true; im.frustumCulled = false; scene.add(im); return im; };
  const done = (im) => { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; };
  for (const s of spots) {
    s.s = s.s || (0.93 + R() * 0.14); s.wide = 0.94 + R() * 0.13;
    let pose = s.pose || 'stand'; if (pose === 'walk') pose = R() < 0.5 ? 'walkA' : 'walkB'; if (!POSES.includes(pose)) pose = 'stand'; s._pose = pose;
    s.o = dress(R, s, s.outfit || opts.outfit || (pose === 'lie' ? 'beach' : 'city'));
  }
  // bodies: one instanced mesh per (pose, sex); per-instance colours/options as instanced attributes read by the shader
  for (const pose of POSES) for (const sex of ['m', 'f']) {
    const list = spots.filter((s) => s._pose === pose && (s.o.fem ? 'f' : 'm') === sex); if (!list.length) continue;
    const geo = bodyGeo(sex, pose).clone(); const n = list.length;
    const at = { iTop: new Float32Array(n * 3), iBot: new Float32Array(n * 3), iSkin: new Float32Array(n * 3), iHair: new Float32Array(n * 3), iOpt: new Float32Array(n * 4) };
    list.forEach((s, i) => { const o = s.o; for (const [k, v] of [['iTop', o.top], ['iBot', o.bot], ['iSkin', o.skin], ['iHair', o.hair]]) { col.setHex(v); at[k].set([col.r, col.g, col.b], i * 3); } at.iOpt.set([o.sleeve, o.legs, o.mode, o.shoe], i * 4); });
    for (const k in at) geo.setAttribute(k, new THREE.InstancedBufferAttribute(at[k], k === 'iOpt' ? 4 : 3));
    const im = mesh(geo, M.body, n, pose + (sex === 'm' ? 'M' : 'F'), pose !== 'lie');
    list.forEach((s, i) => im.setMatrixAt(i, spotM(s))); done(im);
  }
  // hair (short / long / cap) shared across poses: instance matrix = spot * head matrix of the pose
  for (const style of ['short', 'long', 'cap']) {
    const list = spots.filter((s) => s.o.style === style); if (!list.length) continue;
    const im = mesh(G.hair[style], M.hair, list.length, 'hair_' + style, true);
    list.forEach((s, i) => { im.setMatrixAt(i, spotM(s).multiply(G.head[s._pose])); im.setColorAt(i, col.setHex(style === 'cap' ? s.o.cap : s.o.hair)); }); done(im);
  }
  { const list = spots.filter((s) => s.o.skirt); if (list.length) { const im = mesh(G.skirt, M.skirt, list.length, 'skirt', true); list.forEach((s, i) => { const m = spotM(s); if (s._pose === 'walkA' || s._pose === 'walkB') m.multiply(new THREE.Matrix4().makeTranslation(0, -0.022, 0)).multiply(new THREE.Matrix4().makeScale(1.04, 1, 1.12)); im.setMatrixAt(i, m); im.setColorAt(i, col.setHex(s.o.bot)); }); done(im); } }
  // suitcases stand 0.45 m to the owner's right
  const cases = spots.filter((s) => s.bag === 1 && s.pose !== 'walk' && s.pose !== 'lie' && s.pose !== 'sit').map((s) => { const c = Math.cos(s.ry || 0), sn = Math.sin(s.ry || 0); return { x: s.x - c * 0.45, y: s.y || 0, z: s.z + sn * 0.45, ry: (s.ry || 0) + (R() - 0.5) * 0.6, col: new THREE.Color([0x1c2433, 0x5a1d1d, 0x2c2c2c, 0x6b6f75, 0x1f3d33][(R() * 5) | 0]) }; });
  if (cases.length) {
    const S = suitcase();
    for (const [geo, mat, name, tint] of [[S.body, M.case, 'cases', true], [S.dark, M.caseDark, 'caseHandles', false]]) {
      const im = mesh(geo, mat, cases.length, name, true);
      cases.forEach((c, i) => { q.setFromAxisAngle(up, c.ry); p.set(c.x, c.y, c.z); im.setMatrixAt(i, m4.compose(p, q, sc.set(1, 1, 1))); if (tint) im.setColorAt(i, c.col); }); done(im);
    }
  }
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
