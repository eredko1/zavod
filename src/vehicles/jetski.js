// Procedural personal watercraft (3-seat sit-down jet ski). Owned by: VEHICLES agent.
// Local space: forward = -Z, up = +Y, y = 0 is the waterline at rest (keel ~0.3 m below, seat top ~0.72 m above).
// Hull is a lofted V-section with vertex colours (white hull, colour stripe, dark deck + footwells) → one mesh; seat, pod,
// bars, screen, nozzle merged per material. ~2.5k tris. Same return shape as buildBike (group/body/fork/wheel*/headlight/lens/meshes).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const SKI_LEN = 3.2, SKI_W = 1.2, SEAT_Y = 0.72;
let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    hull: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.05 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.75 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.5, metalness: 0.2 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.22, metalness: 1 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x151b22, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.75 }),
    lens: new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xfff0c8, emissiveIntensity: 0.15, roughness: 0.25 }),
  };
  return MATS;
}
const COLORS = [0xd9262e, 0xf2c230, 0x1f6fd0, 0x19b39a, 0xff6a1a, 0x9a3fd0];

// hull stations along z (bow → stern): [z, half-width, deck height, keel depth]
const ST = [[-1.62, 0.02, 0.30, 0.02], [-1.5, 0.2, 0.34, 0.1], [-1.25, 0.38, 0.38, 0.2], [-0.9, 0.52, 0.4, 0.28], [-0.4, 0.6, 0.4, 0.31], [0.2, 0.61, 0.38, 0.3], [0.8, 0.6, 0.34, 0.27], [1.3, 0.57, 0.3, 0.22], [1.55, 0.55, 0.28, 0.18]];
function hullGeo(color) {
  const stripe = new THREE.Color(color), white = new THREE.Color(0xeef0f2), deck = new THREE.Color(0x2a2d31), well = new THREE.Color(0x3a3f45);
  // ring (right side, keel → deck centre), mirrored for the left
  const ring = (w, hd, kd) => [[0, -kd, white], [w * 0.55, -kd * 0.55, white], [w * 0.92, -kd * 0.12, white], [w, 0.06, stripe], [w, 0.16, stripe], [w * 0.97, hd * 0.8, white], [w * 0.8, hd, deck], [w * 0.4, hd + 0.01, well], [0, hd + 0.03, deck]];
  const pos = [], col = [], idx = [];
  const R0 = ring(1, 1, 1).length, per = R0 * 2 - 2;       // full loop: right side then left side back (shared keel + centre)
  for (const [z, w, hd, kd] of ST) {
    const r = ring(w, hd, kd); const loop = [...r, ...r.slice(1, -1).reverse().map(([x, y, c]) => [-x, y, c])];
    for (const [x, y, c] of loop) { pos.push(x, y, z); col.push(c.r, c.g, c.b); }
  }
  for (let s = 0; s + 1 < ST.length; s++) for (let i = 0; i < per; i++) { const a = s * per + i, b = s * per + (i + 1) % per, c = a + per, d = b + per; idx.push(a, b, c, b, d, c); }
  // stern transom cap
  const base = (ST.length - 1) * per, cz = ST[ST.length - 1][0]; const ci = pos.length / 3; pos.push(0, 0.05, cz); col.push(0.85, 0.86, 0.88);
  for (let i = 0; i < per; i++) idx.push(base + i, base + (i + 1) % per, ci);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const put = (list, g, x, y, z, rx = 0, ry = 0, rz = 0) => { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); list.push(g); };
let PARTS = null;
function parts() {
  if (PARTS) return PARTS;
  const SEAT = [], TRIM = [], CHR = [], SCR = [];
  // saddle: long rounded seat from behind the pod to the stern step
  put(SEAT, new THREE.CapsuleGeometry(0.2, 1.05, 4, 10), 0, 0.56, 0.52, Math.PI / 2);
  put(SEAT, new THREE.BoxGeometry(0.4, 0.1, 1.2), 0, 0.58, 0.5);
  // steering pod + engine cowl
  put(TRIM, new THREE.BoxGeometry(0.62, 0.26, 0.55), 0, 0.5, -0.45, -0.25);
  put(TRIM, new THREE.CylinderGeometry(0.1, 0.12, 0.14, 12), 0, 0.28, 1.58, Math.PI / 2);   // jet nozzle
  put(TRIM, new THREE.BoxGeometry(0.9, 0.05, 0.3), 0, 0.3, 1.5);                             // boarding step
  put(TRIM, new THREE.BoxGeometry(0.3, 0.12, 0.45), 0, 0.46, 0.05);                          // seat pedestal front
  for (const s of [-1, 1]) put(TRIM, new THREE.BoxGeometry(0.06, 0.05, 1.4), s * 0.61, 0.17, 0.2); // rub rails
  put(SCR, new THREE.BoxGeometry(0.5, 0.02, 0.28), 0, 0.68, -0.72, -0.9);                   // windscreen
  const G = { seat: mergeGeometries(SEAT), trim: mergeGeometries(TRIM), screen: mergeGeometries(SCR) };
  // handlebars (steer group, pivot at the pod top)
  const BAR = []; put(BAR, new THREE.CylinderGeometry(0.018, 0.018, 0.8, 8), 0, 0.08, 0, 0, 0, Math.PI / 2);
  put(BAR, new THREE.CylinderGeometry(0.03, 0.03, 0.18, 8), 0, 0, 0);
  const GR = []; for (const s of [-1, 1]) put(GR, new THREE.CylinderGeometry(0.026, 0.026, 0.14, 8), s * 0.35, 0.08, 0, 0, 0, Math.PI / 2);
  G.bar = mergeGeometries(BAR); G.grip = mergeGeometries(GR);
  for (const s of [-1, 1]) { const m = new THREE.BoxGeometry(0.1, 0.06, 0.02); m.translate(s * 0.33, 0.28, -0.05); (G.mirr = G.mirr || []).push(m); }
  G.mirr = mergeGeometries(G.mirr);
  PARTS = G; return G;
}
const HULLS = new Map();

/** Builds one jet ski. color: stripe colour (defaults to a palette pick by index). */
export function buildJetski(ctx, color = null, i = 0) {
  const M = mats(), G = parts(); const c = color ?? COLORS[i % COLORS.length];
  if (!HULLS.has(c)) HULLS.set(c, hullGeo(c));
  const group = new THREE.Group(); group.name = 'jetski';
  const body = new THREE.Group(); group.add(body);
  const meshes = [];
  const mk = (geo, mat, parent) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; m.userData.surface = 'metal'; parent.add(m); meshes.push(m); return m; };
  mk(HULLS.get(c), M.hull, body); mk(G.seat, M.seat, body); mk(G.trim, M.trim, body); const scr = mk(G.screen, M.screen, body); scr.castShadow = false;
  const fork = new THREE.Group(); fork.position.set(0, 0.66, -0.36); body.add(fork);
  mk(G.bar, M.chrome, fork); mk(G.grip, M.seat, fork); mk(G.mirr, M.trim, fork);
  const lens = mk(new THREE.CircleGeometry(0.07, 16), M.lens.clone(), body); lens.position.set(0, 0.52, -0.73); lens.rotation.set(0.25, Math.PI, 0); lens.castShadow = false;
  const headlight = new THREE.SpotLight(0xfff1cf, 0, 45, 0.48, 0.55, 1.2);
  headlight.position.set(0, 0.55, -0.8); headlight.target.position.set(0, -0.3, -12); headlight.castShadow = false; headlight.visible = false; body.add(headlight); body.add(headlight.target);
  const dummy = new THREE.Group();
  return { group, body, fork, wheelF: dummy, wheelR: dummy, headlight, lens, meshes, color: c };
}
