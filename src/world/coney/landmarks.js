// CONEY landmarks, built to the reference photos (qa/refs/coney) at OSM positions: the wheel (46 m, pastel green/pink with a
// brown A-frame, 24 cabins, turning), the wooden coaster (white timber bents under a dark wooden track with a red top rail),
// the steel loop coaster, the 80 m parachute tower (red lattice, 12-petal crown, striped base), the terminal train shed on
// the elevated lines, the ballpark, and a kit of flat rides at every mapped ride node. CONEY agent. No real names rendered.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Batch, boxGeo } from '../sbu/geo.js';
import { OSM, PLAY } from './osm.js';
import { BW } from './shore.js';
import { bbox, footprintAngle, cen, walk } from '../osmkit.js';
import { buildStillwell } from './stillwell.js';
import { buildW8th } from './w8th.js';

export const LM = {
  wheel: { x: 64, z: 61, h: 46 },
  pj: { x: -392.5, z: 112.5, h: 80 },
  terminal: { x0: -88, x1: -24, z0: -406, z1: -258 },
  ballpark: { x0: -418, x1: -267, z0: -110, z1: 51 },
  hotdog: { x0: -124, x1: -96, z0: -119, z1: -92 },
};

// ---- instanced strut helper: unit box stretched between two points (lattice members) --------------------------------------
class Struts {
  constructor(name, mat) { this.name = name; this.mat = mat; this.m = []; }
  add(a, b, t = 0.2) { const d = new THREE.Vector3().subVectors(b, a); const L = d.length(); if (L < 1e-3) return; const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()); this.m.push(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(t, L, t))); }
  build(scene, { shadow = true, ray = null } = {}) {
    if (!this.m.length) return null; const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.mat, this.m.length); this.m.forEach((m, i) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true;
    im.castShadow = shadow; im.receiveShadow = true; im.name = this.name; im.userData.surface = 'metal'; scene.add(im); if (ray) ray.push(im); return im;
  }
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildLandmarks(world, M) {
  const B = new Batch(world, M, 'landmarks');
  wheel(world, M, B);
  parachuteJump(world, M, B);
  for (const c of OSM.rc) { const q = bbox(c.p); if (q.x1 < PLAY.x0 - 50 || q.x0 > PLAY.x1 + 50) continue; if (c.k === 'wood') woodCoaster(world, M, B, c); else steelCoaster(world, M, B, c); }
  buildStillwell(world, M);   // the walkable terminal (coney/stillwell.js)
  try { buildW8th(world, M); } catch (e) { console.warn('[coney] w8th', e); }   // W 8 St – NY Aquarium, two levels (coney/w8th.js)
  ballpark(world, M, B);
  hotdogStand(world, M, B);
  flatRides(world, M, B);
  B.flush({ shadow: true });
}

// =========================================================================================================================
function wheel(world, M, B) {
  const { scene, R } = world; const W = LM.wheel; const hubY = 24.5, Rr = 21.5, depth = 3.2;
  const grp = new THREE.Group(); grp.position.set(W.x, hubY, W.z); scene.add(grp);
  const rot = new THREE.Group(); grp.add(rot);
  const pink = new Struts('wheelPink', M.wheelPink), green = new Struts('wheelGreen', M.wheelGreen);
  const N = 16;
  for (const zf of [-depth / 2, depth / 2]) {
    for (let i = 0; i < N; i++) {                       // outer polygonal rim (pink) + inner ring (green) + zig-zag lattice between
      const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
      pink.add(V(Math.cos(a0) * Rr, Math.sin(a0) * Rr, zf), V(Math.cos(a1) * Rr, Math.sin(a1) * Rr, zf), 0.32);
      green.add(V(Math.cos(a0) * Rr * 0.72, Math.sin(a0) * Rr * 0.72, zf), V(Math.cos(a1) * Rr * 0.72, Math.sin(a1) * Rr * 0.72, zf), 0.22);
      green.add(V(Math.cos(a0) * Rr * 0.72, Math.sin(a0) * Rr * 0.72, zf), V(Math.cos((a0 + a1) / 2) * Rr, Math.sin((a0 + a1) / 2) * Rr, zf), 0.14);
      green.add(V(Math.cos(a1) * Rr * 0.72, Math.sin(a1) * Rr * 0.72, zf), V(Math.cos((a0 + a1) / 2) * Rr, Math.sin((a0 + a1) / 2) * Rr, zf), 0.14);
      (i % 2 ? green : pink).add(V(0, 0, zf * 0.3), V(Math.cos(a0) * Rr, Math.sin(a0) * Rr, zf), 0.24);          // spokes, alternating paint
      green.add(V(Math.cos(a0) * Rr * 0.35, Math.sin(a0) * Rr * 0.35, zf), V(Math.cos(a1 + 0.35) * Rr * 0.72, Math.sin(a1 + 0.35) * Rr * 0.72, zf), 0.12); // cross bracing
    }
  }
  for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; pink.add(V(Math.cos(a) * Rr, Math.sin(a) * Rr, -depth / 2), V(Math.cos(a) * Rr, Math.sin(a) * Rr, depth / 2), 0.2); }
  const pm = pink.build(rot), gm = green.build(rot);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, depth + 1, 16).rotateX(Math.PI / 2), M.wheelBrown); rot.add(hub);
  // 24 cabins hanging from the rim, kept upright while the wheel turns
  const cab = new THREE.Group();
  const cg = new THREE.BoxGeometry(2.0, 2.2, 1.6); cg.translate(0, -1.6, 0);
  const cabins = new THREE.InstancedMesh(cg, M.cabinWhite, 24); cabins.castShadow = true; cabins.name = 'wheelCabins'; grp.add(cabins);
  const roofG = new THREE.BoxGeometry(2.2, 0.25, 1.8); roofG.translate(0, -0.45, 0); const roofs = new THREE.InstancedMesh(roofG, M.wheelBlue, 24); grp.add(roofs);
  // sign on the hub (the real one carries the ride name — ours is a plain red disc)
  const sgn = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.2, 24).rotateX(Math.PI / 2), M.coasterRed); sgn.position.z = depth / 2 + 0.7; rot.add(sgn);
  // A-frame towers (brown) both sides + base platform + fence
  const brown = new Struts('wheelTower', M.wheelBrown);
  for (const zf of [-depth / 2 - 0.6, depth / 2 + 0.6]) {
    for (const s of [-1, 1]) { brown.add(V(W.x + s * 9.5, 0, W.z + zf * 1.6), V(W.x, hubY, W.z + zf), 0.7); brown.add(V(W.x + s * 9.5, 0, W.z + zf * 1.6), V(W.x + s * 4.2, hubY * 0.55, W.z + zf * 1.3), 0.35); }
    for (let k = 1; k < 7; k++) { const y = k * hubY / 7, w = 9.5 * (1 - y / hubY); brown.add(V(W.x - w, y, W.z + zf * (1.6 - 0.6 * y / hubY)), V(W.x + w, y, W.z + zf * (1.6 - 0.6 * y / hubY)), 0.25); if (k < 6) { const y2 = (k + 1) * hubY / 7, w2 = 9.5 * (1 - y2 / hubY); brown.add(V(W.x - w, y, W.z + zf * 1.3), V(W.x + w2, y2, W.z + zf * 1.3), 0.14); brown.add(V(W.x + w, y, W.z + zf * 1.3), V(W.x - w2, y2, W.z + zf * 1.3), 0.14); } }
  }
  brown.build(world.scene);
  B.box('concreteGrey', [W.x - 12, 0, W.z - 6], [W.x + 12, 0.6, W.z + 6], { walkable: true });
  for (const s of [-1, 1]) for (const zf of [-1, 1]) world.box([W.x + s * 9.5 - 0.6, 0, W.z + zf * 3.2 - 0.6], [W.x + s * 9.5 + 0.6, 6, W.z + zf * 3.2 + 0.6]);
  world.cover(W.x, W.z - 7, 0, -1); world.cover(W.x, W.z + 7, 0, 1);
  const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  let ang = 0;
  const upd = (dt) => { ang += dt * 0.045; rot.rotation.z = ang; for (let i = 0; i < 24; i++) { const a = ang + i / 24 * Math.PI * 2; p.set(Math.cos(a) * (Rr - 0.2), Math.sin(a) * (Rr - 0.2), (i % 3 === 0 ? 0 : (i % 2 ? 1 : -1) * 0.6)); m4.compose(p, q, one); cabins.setMatrixAt(i, m4); roofs.setMatrixAt(i, m4); } cabins.instanceMatrix.needsUpdate = true; roofs.instanceMatrix.needsUpdate = true; };
  upd(0); world.updaters.push(upd);
  // ride it (coney/hangout.js): where cabin i's floor is right now, in world space
  const zoff = (i) => (i % 3 === 0 ? 0 : (i % 2 ? 1 : -1) * 0.6);
  if (world.W) world.W.wonderWheel = { n: 24, base: new THREE.Vector3(W.x, 0.6, W.z - 7.2), pos: (i, out) => { const a = ang + i / 24 * Math.PI * 2; return out.set(W.x + Math.cos(a) * (Rr - 0.2), hubY + Math.sin(a) * (Rr - 0.2) - 2.62, W.z + zoff(i)); } };
}

// =========================================================================================================================
function parachuteJump(world, M, B) {
  const P = LM.pj; const s = new Struts('pjLattice', M.pjRed); const H = 62, top = 76;
  const half = (y) => y < H ? 5.2 - 3.4 * Math.pow(y / H, 0.8) : 1.8;
  const legs = (y) => { const h = half(y); return [V(P.x - h, y, P.z - h), V(P.x + h, y, P.z - h), V(P.x + h, y, P.z + h), V(P.x - h, y, P.z + h)]; };
  const levels = []; for (let y = 10; y <= H; y += 4) levels.push(y); levels.push(H + 4);
  for (let i = 0; i + 1 < levels.length; i++) {
    const a = legs(levels[i]), b = legs(levels[i + 1]);
    for (let k = 0; k < 4; k++) { s.add(a[k], b[k], 0.45); s.add(a[k], a[(k + 1) % 4], 0.18); s.add(a[k], b[(k + 1) % 4], 0.1); s.add(a[(k + 1) % 4], b[k], 0.1); }
  }
  // service platform ring at ~42 m and the crown
  const ring = (y, r, n, t) => { for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2; s.add(V(P.x + Math.cos(a0) * r, y, P.z + Math.sin(a0) * r), V(P.x + Math.cos(a1) * r, y, P.z + Math.sin(a1) * r), t); } };
  ring(42, 4.6, 12, 0.2); ring(42.8, 4.6, 12, 0.12);
  s.add(V(P.x, H + 4, P.z), V(P.x, top, P.z), 0.6);
  for (let i = 0; i < 12; i++) {                        // 12 radiating arms, each ending in a polyhedral "petal" frame
    const a = i / 12 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    const root = V(P.x + ca * 1.6, H + 5, P.z + sa * 1.6), tip = V(P.x + ca * 15, H + 9, P.z + sa * 15), up = V(P.x + ca * 8, top - 1, P.z + sa * 8);
    s.add(root, tip, 0.28); s.add(V(P.x, top - 1, P.z), up, 0.2); s.add(up, tip, 0.2); s.add(V(P.x + ca * 3, H + 2, P.z + sa * 3), V(P.x + ca * 11, H + 7.5, P.z + sa * 11), 0.14);
    const c = V(P.x + ca * 15.5, H + 7, P.z + sa * 15.5); const r2 = 3.2; const pts = [];
    for (let k = 0; k < 6; k++) { const b = k / 6 * Math.PI * 2; pts.push(V(c.x + Math.cos(b) * r2 * -sa, c.y + Math.sin(b) * r2, c.z + Math.cos(b) * r2 * ca)); }
    for (let k = 0; k < 6; k++) { s.add(pts[k], pts[(k + 1) % 6], 0.12); s.add(pts[k], tip, 0.08); s.add(pts[k], V(c.x + ca * 2.4, c.y, c.z + sa * 2.4), 0.08); }
    ring(H + 9, 15, 12, 0.14);
  }
  s.build(world.scene);
  // yellow canopy cables / guide arms inside the crown
  const y = new Struts('pjYellow', M.pjYellow); for (let i = 0; i < 12; i++) { const a = (i + 0.5) / 12 * Math.PI * 2; y.add(V(P.x, H + 1, P.z), V(P.x + Math.cos(a) * 11, H + 11, P.z + Math.sin(a) * 11), 0.35); } y.build(world.scene);
  // striped octagonal base pavilion (red / yellow / blue panels) with a yellow drum cornice and round red roundels
  const n = 16, rB = 8.2, hB = 9;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2; const key = ['pjRed', 'pjYellow', 'pjBlue', 'pjYellow'][i % 4];
    const g = new THREE.BoxGeometry(2 * rB * Math.sin(Math.PI / n) + 0.05, hB, 0.5); g.translate(0, hB / 2, 0); g.rotateY(-(a0 + a1) / 2 + Math.PI / 2); g.translate(P.x + Math.cos((a0 + a1) / 2) * rB, 0, P.z + Math.sin((a0 + a1) / 2) * rB); B.add(key, g, { uv: false });
  }
  B.add('pjYellow', new THREE.CylinderGeometry(rB + 0.5, rB + 0.5, 1.4, 24, 1, true).translate(P.x, hB + 0.7, P.z), { uv: false });
  B.add('pjRed', new THREE.CylinderGeometry(rB + 0.8, rB + 0.8, 0.3, 24).translate(P.x, hB + 1.5, P.z), { uv: false });
  B.add('pjRed', new THREE.CylinderGeometry(rB - 0.4, rB - 0.4, 0.4, 24).translate(P.x, hB + 1.6, P.z), { uv: false });
  world.box([P.x - rB, 0, P.z - rB], [P.x + rB, hB + 1.7, P.z + rB]);
  for (let a = 0; a < 8; a++) world.cover(P.x + Math.cos(a * Math.PI / 4) * (rB + 1), P.z + Math.sin(a * Math.PI / 4) * (rB + 1), Math.cos(a * Math.PI / 4), Math.sin(a * Math.PI / 4));
}

// =========================================================================================================================
/** Local frame for a coaster footprint: long axis u, short axis v, centre, half extents. */
function coasterFrame(c) {
  const ang = footprintAngle(c.p); const [ox, oz] = cen(c.p); const ca = Math.cos(-ang), sa = Math.sin(-ang);
  const loc = c.p.map(([x, z]) => [(x - ox) * ca - (z - oz) * sa, (x - ox) * sa + (z - oz) * ca]);
  const q = bbox(loc); const alongX = q.x1 - q.x0 >= q.z1 - q.z0;
  const hu = (alongX ? q.x1 - q.x0 : q.z1 - q.z0) / 2, hv = (alongX ? q.z1 - q.z0 : q.x1 - q.x0) / 2; const cu = alongX ? (q.x0 + q.x1) / 2 : (q.z0 + q.z1) / 2, cv = alongX ? (q.z0 + q.z1) / 2 : (q.x0 + q.x1) / 2;
  const toWorld = (u, v) => { const lx = alongX ? u + cu : v + cv, lz = alongX ? v + cv : u + cu; return [ox + lx * Math.cos(ang) - lz * Math.sin(ang), oz + lx * Math.sin(ang) + lz * Math.cos(ang)]; };
  return { hu, hv, toWorld };
}

function woodCoaster(world, M, B, c) {
  const F = coasterFrame(c); const hu = F.hu - 4, hv = Math.max(6, F.hv - 4); const Hmax = c.h;
  // course: two laps of a stadium oval (outer high, inner low) joined at the station end; height profile = lift + decaying hills
  const pts = []; const N = 360;
  for (let i = 0; i < N; i++) {
    const s = i / N; const lap = s < 0.55 ? 0 : 1; const t = lap ? (s - 0.55) / 0.45 : s / 0.55; const k = lap ? 0.62 : 1;
    const per = 2 * (2 * hu * k) + Math.PI * hv * k * 2; let d = t * per; let u, v;
    const L = 2 * hu * k, rr = hv * k;
    if (d < L) { u = -hu * k + d; v = -rr; } else if ((d -= L) < Math.PI * rr) { const a = -Math.PI / 2 + d / rr; u = hu * k + Math.cos(a) * rr * 0.9; v = Math.sin(a) * rr; } else if ((d -= Math.PI * rr) < L) { u = hu * k - d; v = rr; } else { d -= L; const a = Math.PI / 2 + d / rr; u = -hu * k + Math.cos(a) * rr * 0.9; v = Math.sin(a) * rr; }
    let y;
    // lap 0: long lift to the top, the big first drop, then hills that stay high; lap 1: lower, faster camelbacks
    if (!lap) { y = t < 0.3 ? 4 + (Hmax - 4) * Math.sin(Math.min(1, t / 0.3) * Math.PI / 2) : 8 + (Hmax - 8) * (0.5 + 0.5 * Math.cos((t - 0.3) / 0.7 * Math.PI * 3.4)) * (1 - (t - 0.3) * 0.45); }
    else y = 7 + (Hmax * 0.55) * (0.5 + 0.5 * Math.cos(t * Math.PI * 5)) * (1 - t * 0.55);
    const [x, z] = F.toWorld(u, v); pts.push(V(x, Math.max(2.5, y), z));
  }
  const white = new Struts('coasterBents', M.coasterWhite), track = new Struts('coasterTrack', M.coasterTrack), red = new Struts('coasterRail', M.coasterRed);
  for (let i = 0; i < N; i++) {
    const a = pts[i], b = pts[(i + 1) % N]; const d = new THREE.Vector3().subVectors(b, a); d.y = 0; d.normalize(); const side = V(-d.z, 0, d.x);
    const tl = [a.clone().addScaledVector(side, 0.8), b.clone().addScaledVector(side, 0.8)], tr = [a.clone().addScaledVector(side, -0.8), b.clone().addScaledVector(side, -0.8)];
    track.add(tl[0], tl[1], 0.35); track.add(tr[0], tr[1], 0.35); track.add(a.clone().addScaledVector(side, -1.1).setY(a.y - 0.15), a.clone().addScaledVector(side, 1.1).setY(a.y - 0.15), 0.25);
    red.add(a.clone().addScaledVector(side, 1.05).setY(a.y + 0.55), b.clone().addScaledVector(side, 1.05).setY(b.y + 0.55), 0.08);
    if (i % 4 === 0) red.add(a.clone().addScaledVector(side, 1.05).setY(a.y - 0.1), a.clone().addScaledVector(side, 1.05).setY(a.y + 0.55), 0.05);
    if (i % 2) continue;                               // bents every other sample (~1.5 m): posts, ledgers, X-bracing to the next bent
    const j = (i + 2) % N; const a2 = pts[j]; const d2 = new THREE.Vector3().subVectors(pts[(j + 1) % N], a2); d2.y = 0; d2.normalize(); const side2 = V(-d2.z, 0, d2.x);
    for (const s of [-1.5, 1.5]) {
      const top = a.clone().addScaledVector(side, s).setY(a.y - 0.3), bot = top.clone().setY(0); white.add(bot, top, 0.28);
      const top2 = a2.clone().addScaledVector(side2, s).setY(a2.y - 0.3);
      for (let y = 2.4; y < Math.min(top.y, top2.y) - 0.8; y += 2.4) { white.add(top.clone().setY(y), top2.clone().setY(y), 0.16); if (y + 2.4 < Math.min(top.y, top2.y)) { white.add(top.clone().setY(y), top2.clone().setY(y + 2.4), 0.1); white.add(top2.clone().setY(y), top.clone().setY(y + 2.4), 0.1); } }
    }
    for (let y = 2.4; y < a.y - 0.8; y += 2.4) { white.add(a.clone().addScaledVector(side, -1.5).setY(y), a.clone().addScaledVector(side, 1.5).setY(y), 0.14); white.add(a.clone().addScaledVector(side, -1.5).setY(y), a.clone().addScaledVector(side, 1.5).setY(Math.min(a.y - 0.4, y + 2.4)), 0.08); }
    world.box([a.x - 0.3, 0, a.z - 0.3], [a.x + 0.3, Math.min(a.y, 4), a.z + 0.3]);
  }
  white.build(world.scene); track.build(world.scene); red.build(world.scene);
  // site (critic r7 #6): 3 m white corrugated wall around the footprint, a blue palisade on one corner, ticket booth + marquee, barricades
  if (!M.corrWhite) { const c2 = document.createElement('canvas'); c2.width = 128; c2.height = 256; const g = c2.getContext('2d'); for (let x = 0; x < 128; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, '#d6d5cf'); gr.addColorStop(0.5, '#f6f5f0'); gr.addColorStop(1, '#c9c8c2'); g.fillStyle = gr; g.fillRect(x, 0, 16, 256); }
    for (let i = 0; i < 30; i++) { const x = Math.random() * 128, L = 20 + Math.random() * 120; const gr = g.createLinearGradient(0, 0, 0, L); gr.addColorStop(0, 'rgba(120,90,60,0.35)'); gr.addColorStop(1, 'rgba(120,90,60,0)'); g.fillStyle = gr; g.fillRect(x, 0, 2 + Math.random() * 3, L); }
    const t = new THREE.CanvasTexture(c2); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; M.corrWhite = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0.2, name: 'corrWhite' }); M.surface.corrWhite = 'metal'; M.uvScale.corrWhite = 1 / 1.6; }
  { const q = bbox(c.p), m = 3; const wall = (x0, z0, x1, z1, key, h) => B.box(key, [Math.min(x0, x1), 0, Math.min(z0, z1)], [Math.max(x0, x1), h, Math.max(z0, z1)]);
    wall(q.x0 - m, q.z0 - m, q.x1 + m, q.z0 - m + 0.15, 'corrWhite', 3); wall(q.x0 - m, q.z1 + m - 0.15, q.x1 + m, q.z1 + m, 'corrWhite', 3);
    wall(q.x0 - m, q.z0 - m, q.x0 - m + 0.15, q.z1 + m, 'corrWhite', 3); wall(q.x1 + m - 0.15, q.z0 - m, q.x1 + m, (q.z0 + q.z1) / 2, 'corrWhite', 3);
    for (let z = (q.z0 + q.z1) / 2; z < q.z1 + m; z += 0.25) B.box('wheelBlue', [q.x1 + m - 0.05, 0, z], [q.x1 + m + 0.05, 2.4, z + 0.08], { collide: false });
    B.box('wheelBlue', [q.x1 + m - 0.08, 2.2, (q.z0 + q.z1) / 2], [q.x1 + m + 0.08, 2.35, q.z1 + m], { collide: false }); world.box([q.x1 + m - 0.1, 0, (q.z0 + q.z1) / 2], [q.x1 + m + 0.1, 2.4, q.z1 + m]);
    const bx = q.x1 + m + 3, bz = q.z0 + 8; B.box('steelRed', [bx - 1.2, 0, bz - 0.8], [bx + 1.2, 2.8, bz + 0.8]); B.box('wheelBlue', [bx - 1.3, 2.8, bz - 0.9], [bx + 1.3, 3.1, bz + 0.9], { collide: false }); B.box('glassLit', [bx - 0.8, 1.1, bz - 0.82], [bx + 0.8, 2.0, bz - 0.8], { collide: false });
    B.box('pjYellow', [bx - 0.5, 3.1, bz - 0.1], [bx + 0.5, 10.1, bz + 0.1]); for (let y = 3.4; y < 10; y += 0.45) B.box('bulb', [bx - 0.55, y, bz - 0.16], [bx + 0.55, y + 0.06, bz - 0.1], { collide: false });
    for (let k = 0; k < 10; k++) { const x = bx + 3 + (k % 5) * 2.2, z = bz - 3 + Math.floor(k / 5) * 5; B.box('steelOrange', [x - 1.1, 0.9, z - 0.03], [x + 1.1, 1.0, z + 0.03], { collide: false }); for (const s2 of [-1, 1]) B.box('steelOrange', [x + s2 * 1.05 - 0.03, 0, z - 0.3], [x + s2 * 1.05 + 0.03, 1.0, z + 0.3], { collide: false }); world.box([x - 1.1, 0, z - 0.1], [x + 1.1, 1.0, z + 0.1]); }
    world.cover(bx, bz - 1.4, 0, -1); }
  // station shed at the start
  const [sx, sz] = F.toWorld(-hu * 0.6, -hv); B.box('paintWall1', [sx - 12, 0, sz - 5], [sx + 12, 4.2, sz + 3]); B.box('coasterRed', [sx - 13, 4.2, sz - 6], [sx + 13, 4.6, sz + 4]); world.cover(sx, sz - 6, 0, -1);
  // animated train on the outer lap
  const cars = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 1.0, 2.6), M.coasterRed, 4); cars.name = 'coasterTrain'; cars.castShadow = true; world.scene.add(cars);
  let tt = 0; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = V(0, 0, 1);
  world.updaters.push((dt) => { tt = (tt + dt * 0.035) % 1; for (let k = 0; k < 4; k++) { const f = ((tt - k * 0.006) % 1 + 1) % 1 * N; const i = Math.floor(f), a = pts[i], b = pts[(i + 1) % N]; const p = a.clone().lerp(b, f - i); p.y += 0.7; q.setFromUnitVectors(up, b.clone().sub(a).normalize()); m4.compose(p, q, V(1, 1, 1)); cars.setMatrixAt(k, m4); } cars.instanceMatrix.needsUpdate = true; });
}

function steelCoaster(world, M, B, c) {
  const F = coasterFrame(c); const hu = F.hu - 3, H = c.h; const big = H > 25;
  const pts = []; const N = big ? 300 : 160;
  for (let i = 0; i < N; i++) {
    const s = i / N; let u, v = 0, y;
    if (big) {  // vertical lift -> 90 deg drop -> vertical loop -> camel hills -> return straight
      if (s < 0.12) { u = -hu; y = 3 + (H - 3) * (s / 0.12); v = -2.5; }
      else if (s < 0.2) { const t = (s - 0.12) / 0.08; u = -hu + Math.sin(t * Math.PI / 2) * 10; y = H - Math.sin(t * Math.PI / 2) * (H - 4) ; v = -2.5; }
      else if (s < 0.38) { const t = (s - 0.2) / 0.18; const a = t * Math.PI * 2; u = -hu + 10 + Math.sin(a) * 10 + t * 6; y = 4 + (1 - Math.cos(a)) * 11; v = -2.5 + t * 2; }
      else if (s < 0.7) { const t = (s - 0.38) / 0.32; u = -hu + 26 + t * (2 * hu - 30); y = 4 + 9 * Math.abs(Math.sin(t * Math.PI * 3)) * (1 - t * 0.5); v = -0.5; }
      else { const t = (s - 0.7) / 0.3; const a = t * Math.PI; u = hu - 4 - (1 - Math.cos(a)) * (hu - 2) ; v = -0.5 + Math.sin(a) * 4 + t * 2; y = 3 + Math.sin(a) * 4; }
    } else { const a = s * Math.PI * 2; u = Math.cos(a) * hu; v = Math.sin(a) * Math.max(3, F.hv - 3); y = 3 + H * 0.5 * (1 + Math.sin(a * 3)) * (0.6 + 0.4 * Math.cos(a)); }
    const [x, z] = F.toWorld(u, v); pts.push(V(x, y, z));
  }
  const rail = new Struts('steelTrack', M.steelOrange), sup = new Struts('steelSupport', big ? M.coasterWhite : M.steelYellow);
  for (let i = 0; i < N; i++) {
    const a = pts[i], b = pts[(i + 1) % N]; const d = new THREE.Vector3().subVectors(b, a); const dh = V(d.x, 0, d.z).normalize(); const side = V(-dh.z, 0, dh.x);
    for (const s of [-0.55, 0.55]) rail.add(a.clone().addScaledVector(side, s), b.clone().addScaledVector(side, s), 0.22);
    rail.add(a.clone().setY(a.y - 0.5), b.clone().setY(b.y - 0.5), 0.35);
    if (i % 5 === 0 && a.y > 3.5) {
      const upright = Math.abs(d.y) < d.length() * 0.85 && !(big && i / N > 0.2 && i / N < 0.38 && a.y > 8);
      if (upright) { sup.add(a.clone().setY(0), a.clone().setY(a.y - 0.5), big ? 0.6 : 0.3); world.box([a.x - 0.4, 0, a.z - 0.4], [a.x + 0.4, Math.min(a.y, 4), a.z + 0.4]); }
    }
  }
  rail.build(world.scene); sup.build(world.scene);
  if (big) { const [lx, lz] = F.toWorld(-hu, -2.5); const lift = new Struts('liftTower', M.coasterWhite); B.box('coasterRed', [lx - 1.0, H * 0.35, lz - 1.35], [lx + 1.0, H * 0.35 + 20, lz - 1.25], { collide: false }); for (const dx of [-1.2, 1.2]) for (const dz of [-1.2, 1.2]) lift.add(V(lx + dx, 0, lz + dz), V(lx + dx * 0.6, H, lz + dz * 0.6), 0.35); for (let y = 4; y < H; y += 4) { lift.add(V(lx - 1.2, y, lz - 1.2), V(lx + 1.2, y, lz + 1.2), 0.15); lift.add(V(lx + 1.2, y, lz - 1.2), V(lx - 1.2, y, lz + 1.2), 0.15); } lift.build(world.scene); world.box([lx - 1.5, 0, lz - 1.5], [lx + 1.5, H, lz + 1.5]); }
}

// =========================================================================================================================
function ballpark(world, M, B) {
  const P = LM.ballpark; const R = world.R;
  // brick outer wall with arched gates on the north (street) side, grandstand wrapping the NE corner, light towers, scoreboard
  const wallH = 6; if (!M.brickTan) { // tan brick (running bond, 0.24 x 0.075 m module, 1 cm joints) as a light texture — tinting the dark red scan only made it brown
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#b8a888'; g.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 32; r++) for (let k = -1; k < 9; k++) { const v = 205 + Math.random() * 30; g.fillStyle = `rgb(${v + 12},${v - 4},${v - 40})`; g.fillRect(k * 32 + (r % 2) * 16 + 1, r * 8 + 1, 30, 6); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    M.brickTan = new THREE.MeshStandardMaterial({ map: t, roughness: 0.88, normalMap: M.brickRed.normalMap || null, name: 'brickTan' }); M.surface.brickTan = 'concrete'; M.uvScale.brickTan = 1 / 1.92; }
  B.box('brickTan', [P.x0, 0, P.z0], [P.x1, wallH, P.z0 + 1.2]); B.box('brickTan', [P.x1 - 1.2, 0, P.z0], [P.x1, wallH, P.z1]);
  for (let y = 1.2; y < wallH; y += 1.2) { B.box('brickRed', [P.x0, y, P.z0 - 0.02], [P.x1, y + 0.3, P.z0 + 0.01], { collide: false }); B.box('brickRed', [P.x1 - 0.01, y, P.z0], [P.x1 + 0.02, y + 0.3, P.z1], { collide: false }); }
  B.box('pjBlue', [P.x0, wallH + 0.6, P.z0 - 0.35], [P.x1, wallH + 3.6, P.z0 - 0.25], { collide: false });
  B.box('brickRed', [P.x0, 0, P.z0], [P.x0 + 1.2, 3.5, P.z1]); B.box('brickRed', [P.x0, 0, P.z1 - 1.2], [P.x1, 3.5, P.z1]);
  for (let x = P.x0 + 10; x < P.x1 - 10; x += 14) { B.box('glassDark', [x, 0.3, P.z0 - 0.02], [x + 4, 3.6, P.z0 + 0.02], { collide: false }); B.cyl('brickRed', x + 2, P.z0 - 0.01, 3.6, 3.9, 2.05, 16); }
  const rows = 14;
  for (let k = 0; k < rows; k++) { const y = 1 + k * 0.55, d = 1.2 + k * 0.85; B.box(k % 2 ? 'concrete' : 'concreteGrey', [P.x0 + 20, 0, P.z0 + d], [P.x1 - 1.2 - d, y, P.z0 + d + 0.85], { walkable: true }); B.box(k % 2 ? 'concrete' : 'concreteGrey', [P.x1 - 1.2 - d - 0.85, 0, P.z0 + d], [P.x1 - 1.2 - d, y, P.z1 - 40], { walkable: true }); }
  const seat = new Struts('stadiumSeats', M.wheelBlue); for (let k = 0; k < rows; k++) { const y = 1.25 + k * 0.55, d = 1.6 + k * 0.85; seat.add(V(P.x0 + 20, y, P.z0 + d), V(P.x1 - 2.2 - d, y, P.z0 + d), 0.4); } seat.build(world.scene);
  // grandstand canopy: thin white steel roof on raked columns (was a black slab)
  // street wall: pilasters, a stone band, a row of pennants and a big arched main gate at the east end
  for (let x = P.x0 + 3; x < P.x1; x += 7) B.box('brickDark', [x, 0, P.z0 - 0.35], [x + 0.9, wallH + 0.6, P.z0 + 0.1], { collide: false });
  B.box('precast', [P.x0, wallH, P.z0 - 0.3], [P.x1, wallH + 0.6, P.z0 + 1.2], { collide: false });
  for (let x = P.x0 + 6; x < P.x1 - 4; x += 8) { B.cyl('steel', x, P.z0 - 0.1, wallH + 0.6, wallH + 5, 0.05, 6); B.box(['fascia0', 'fascia2', 'fascia5'][Math.abs(Math.round(x / 8)) % 3], [x, wallH + 3.8, P.z0 - 0.12], [x + 1.4, wallH + 4.9, P.z0 - 0.08], { collide: false }); }
  { const gx = P.x1 - 26; B.box('precast', [gx - 8, 0, P.z0 - 1.5], [gx + 8, 11, P.z0 + 1.2], { collide: false }); B.box('glassDark', [gx - 5, 0, P.z0 - 1.52], [gx + 5, 6, P.z0 - 1.48], { collide: false }); B.cyl('precast', gx, P.z0 - 1.5, 6, 6.2, 5, 24); B.box('fascia0', [gx - 6, 8, P.z0 - 1.55], [gx + 6, 9.8, P.z0 - 1.5], { collide: false }); }
  for (const [x, z] of [[P.x0 + 6, P.z0 + 6], [P.x1 - 6, P.z1 - 6], [P.x0 + 6, P.z1 - 6], [P.x1 - 6, P.z0 + 6], [(P.x0 + P.x1) / 2, P.z1 - 4], [P.x0 + 4, (P.z0 + P.z1) / 2]]) { B.cyl('steel', x, z, 0, 40, 0.5, 10, { collide: true }); B.add('steel', new THREE.TorusGeometry(3.4, 0.12, 6, 28).translate(x, 43, z), { uv: false }); B.box('lampHead', [x - 2.8, 41, z - 0.3], [x + 2.8, 45, z + 0.3], { collide: false }); }
  B.box('steelDark', [P.x0 + 8, 6, P.z1 - 6], [P.x0 + 30, 14, P.z1 - 5]); B.box('glassLit', [P.x0 + 9, 7, P.z1 - 6.05], [P.x0 + 29, 13, P.z1 - 6.01], { collide: false });
  // infield dirt and bases
  const hx = P.x1 - 32, hz = P.z0 + 32;
  B.add('mud', new THREE.CircleGeometry(20, 32, Math.PI * 0.5, Math.PI * 0.5).rotateX(-Math.PI / 2).translate(hx, 0.035, hz), { uv: false });
  for (const [x, z] of [[hx, hz], [hx - 27, hz], [hx - 27, hz + 27], [hx, hz + 27]]) B.box('white', [x - 0.3, 0.04, z - 0.3], [x + 0.3, 0.1, z + 0.3], { collide: false });
  for (let i = 0; i < 6; i++) world.cover(P.x0 + 20 + i * 18, P.z0 + 16, 0, 1);
}

function hotdogStand(world, M, B) {
  // the corner frankfurter stand: green-and-yellow wraparound fascia, a big "HOT DOGS" banner, flags on the roof
  const H = LM.hotdog; const y0 = 3.2, y1 = 5.6;
  for (const [a, b] of [[[H.x0 - 0.3, y0, H.z0 - 0.3], [H.x1 + 0.3, y1, H.z0 - 0.1]], [[H.x0 - 0.3, y0, H.z1 + 0.1], [H.x1 + 0.3, y1, H.z1 + 0.3]], [[H.x0 - 0.3, y0, H.z0 - 0.3], [H.x0 - 0.1, y1, H.z1 + 0.3]], [[H.x1 + 0.1, y0, H.z0 - 0.3], [H.x1 + 0.3, y1, H.z1 + 0.3]]]) B.box('fascia3', a, b, { collide: false });
  for (const [a, b] of [[[H.x0 - 0.35, y1 - 0.5, H.z0 - 0.35], [H.x1 + 0.35, y1 - 0.2, H.z0 - 0.3]], [[H.x0 - 0.35, y1 - 0.5, H.z1 + 0.3], [H.x1 + 0.35, y1 - 0.2, H.z1 + 0.35]]]) B.box('fascia1', a, b, { collide: false });
  const g = new THREE.PlaneGeometry(16, 3); g.rotateY(Math.PI); g.translate((H.x0 + H.x1) / 2, y1 + 1.8, H.z0 - 0.4); B.add('sign0', g, { uv: false });
  const g2 = new THREE.PlaneGeometry(16, 3); g2.translate((H.x0 + H.x1) / 2, y1 + 1.8, H.z1 + 0.4); B.add('sign0', g2, { uv: false });
  for (let x = H.x0 + 2; x < H.x1; x += 4) { B.cyl('steel', x, H.z0 + 1, 6, 11, 0.05, 6); B.box(['fascia0', 'fascia1', 'fascia2', 'fascia5'][Math.abs(Math.round(x / 4)) % 4], [x, 10, H.z0 + 1], [x + 1.6, 11, H.z0 + 1.05], { collide: false }); }
}

// =========================================================================================================================
function flatRides(world, M, B) {
  const R = world.R; const pal = ['wheelBlue', 'steelRed', 'steelYellow', 'wheelGreen', 'steelOrange', 'pjBlue', 'wheelPink'];
  const spinners = []; const placed = [];
  for (const r of OSM.rd) {
    if (!(r.x > PLAY.x0 && r.x < PLAY.x1 && r.z > PLAY.z0 && r.z < BW.z0 - 4)) continue;
    if (placed.some((p) => Math.hypot(p[0] - r.x, p[1] - r.z) < 9)) continue; placed.push([r.x, r.z]);
    const c1 = pal[(R() * pal.length) | 0], c2 = pal[(R() * pal.length) | 0];
    const fence = (rad) => { for (let i = 0; i < 20; i++) { const a0 = i / 20 * Math.PI * 2, a1 = (i + 1) / 20 * Math.PI * 2; const L = rad * 2 * Math.sin(Math.PI / 20); const mk = (w, h, y, d = 0.04) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, y, 0); g.rotateY(-(a0 + a1) / 2 + Math.PI / 2); g.translate(r.x + Math.cos((a0 + a1) / 2) * rad, 0, r.z + Math.sin((a0 + a1) / 2) * rad); B.add('alu', g, { uv: false }); }; mk(L, 0.05, 1.05); mk(L, 0.05, 0.25); for (let k = -4; k <= 4; k++) { const g = new THREE.BoxGeometry(0.025, 0.8, 0.025); g.translate(k * L / 9, 0.65, 0); g.rotateY(-(a0 + a1) / 2 + Math.PI / 2); g.translate(r.x + Math.cos((a0 + a1) / 2) * rad, 0, r.z + Math.sin((a0 + a1) / 2) * rad); B.add('alu', g, { uv: false }); } } world.box([r.x - rad, 0, r.z - rad], [r.x + rad, 1.1, r.z + rad]); world.cover(r.x, r.z - rad - 0.8, 0, -1); world.cover(r.x, r.z + rad + 0.8, 0, 1); };
    if (r.t === 'drop' || r.h > 30) { const h = r.h || 40; B.cyl('steelDark', r.x, r.z, 0, h, 1.1, 12, { collide: true }); B.cyl(c1, r.x, r.z, h * 0.3, h * 0.33, 3.2, 20); B.cyl(c2, r.x, r.z, h, h + 1.5, 2.2, 16); fence(6); continue; }
    if (r.t === 'carousel') {
      B.cyl('white', r.x, r.z, 0, 0.5, 7, 28); B.add(c1, new THREE.ConeGeometry(7.6, 2.6, 24).translate(r.x, 5.8, r.z), { uv: false }); B.add('bulb', new THREE.TorusGeometry(7.4, 0.08, 4, 48).rotateX(Math.PI / 2).translate(r.x, 4.5, r.z), { uv: false });
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; B.cyl('alu', r.x + Math.cos(a) * 5.5, r.z + Math.sin(a) * 5.5, 0.5, 4.5, 0.05, 6); B.box(i % 2 ? 'white' : c2, [r.x + Math.cos(a) * 5.5 - 0.5, 1.4, r.z + Math.sin(a) * 5.5 - 0.2], [r.x + Math.cos(a) * 5.5 + 0.5, 2.1, r.z + Math.sin(a) * 5.5 + 0.2], { collide: false }); }
      B.cyl(c2, r.x, r.z, 0.5, 4.5, 1.4, 12, { collide: true }); fence(8.5); continue;
    }
    if (r.t === 'ship') { for (const s of [-1, 1]) { B.add('steelDark', new THREE.CylinderGeometry(0.25, 0.3, 11, 8).rotateZ(s * 0.35).translate(r.x + s * 2, 5.2, r.z - 1.6), { uv: false }); B.add('steelDark', new THREE.CylinderGeometry(0.25, 0.3, 11, 8).rotateZ(s * 0.35).translate(r.x + s * 2, 5.2, r.z + 1.6), { uv: false }); } B.add(c1, new THREE.CylinderGeometry(1.6, 1.6, 12, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(r.x, 2.4, r.z), { uv: false }); fence(9); continue; }
    // chair-swing / umbrella ride: checker deck, tapered mast with bulb rings, striped scalloped canopy that tilts and turns,
    // 12 chains to seated gondolas that fly out with the spin, ticket booth at the gate
    B.cyl('white', r.x, r.z, 0, 0.45, 6.2, 32); B.add(c2, new THREE.TorusGeometry(6.1, 0.12, 4, 48).rotateX(Math.PI / 2).translate(r.x, 0.45, r.z), { uv: false });
    for (let i = 0; i < 16; i++) { const a0 = i / 16 * Math.PI * 2; B.add(i % 2 ? c1 : 'white', new THREE.CircleGeometry(6.0, 2, a0, Math.PI / 8).rotateX(-Math.PI / 2).translate(r.x, 0.46, r.z), { uv: false }); }
    B.add(c1, new THREE.CylinderGeometry(0.45, 0.8, 7.5, 12).translate(r.x, 4.2, r.z), { uv: false }); world.box([r.x - 0.8, 0, r.z - 0.8], [r.x + 0.8, 7.5, r.z + 0.8]);
    for (const y of [2.2, 3.6, 5.0, 6.4]) B.add('bulb', new THREE.TorusGeometry(0.62 - y * 0.03, 0.05, 4, 20).rotateX(Math.PI / 2).translate(r.x, y, r.z), { uv: false });
    { const bx = r.x + 8.5, bz = r.z; B.box(c2, [bx - 0.9, 0, bz - 0.9], [bx + 0.9, 2.3, bz + 0.9]); B.box('glassLit', [bx - 0.92, 1.0, bz - 0.6], [bx - 0.9, 1.9, bz + 0.6], { collide: false }); B.add(c1, new THREE.ConeGeometry(1.4, 0.9, 4).rotateY(Math.PI / 4).translate(bx, 2.75, bz), { uv: false }); }
    const grp = new THREE.Group(); grp.position.set(r.x, 7.9, r.z); world.scene.add(grp);
    const can = new THREE.ConeGeometry(5.2, 1.8, 24, 1, true); can.translate(0, 0.2, 0);
    { const pos = can.attributes.position, col = new Float32Array(pos.count * 3); const A = new THREE.Color(M[c1].color), Bc = new THREE.Color(0xffffff); for (let k = 0; k < pos.count; k++) { const a = Math.atan2(pos.getZ(k), pos.getX(k)); const cc = Math.floor((a + Math.PI) / (Math.PI / 6)) % 2 ? A : Bc; col[k * 3] = cc.r; col[k * 3 + 1] = cc.g; col[k * 3 + 2] = cc.b; } can.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
    // merge per ride: canopy + valance (vertex colours) | bulbs + topper | 12 chains + seats baked at the fly-out angle
    const vc = (g, c) => { g = g.index ? g.toNonIndexed() : g; const n = g.attributes.position.count, a = new Float32Array(n * 3); const cc = new THREE.Color(c); for (let k = 0; k < n; k++) { a[k * 3] = cc.r; a[k * 3 + 1] = cc.g; a[k * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g; };
    const strip = (g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g; };
    const canG = mergeGeometries([strip(can), vc(new THREE.CylinderGeometry(5.25, 5.25, 0.5, 24, 1, true).translate(0, -0.9, 0), M[c2].color)]);
    const canopy = new THREE.Mesh(canG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide })); canopy.castShadow = true; grp.add(canopy);
    grp.add(new THREE.Mesh(mergeGeometries([strip(new THREE.TorusGeometry(5.3, 0.07, 4, 64).rotateX(Math.PI / 2).translate(0, -1.2, 0)), strip(new THREE.SphereGeometry(0.5, 12, 8).translate(0, 1.3, 0))]), M.bulb));
    const sg = [];
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2; const m = new THREE.Matrix4().makeTranslation(Math.cos(a) * 4.6, -1.0, Math.sin(a) * 4.6).multiply(new THREE.Matrix4().makeRotationY(-a)).multiply(new THREE.Matrix4().makeRotationZ(0.45));
      const col = M[pal[(i + 3) % pal.length]].color;
      sg.push(vc(new THREE.BoxGeometry(0.04, 3.6, 0.04).translate(0, -1.8, 0), 0x9aa0a4).applyMatrix4(m), vc(new THREE.BoxGeometry(0.55, 0.12, 0.5).translate(0, -3.6, 0), col).applyMatrix4(m), vc(new THREE.BoxGeometry(0.55, 0.6, 0.08).translate(0, -3.3, -0.24), col).applyMatrix4(m));
    }
    const seatMesh = new THREE.Mesh(mergeGeometries(sg), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 })); seatMesh.castShadow = true; grp.add(seatMesh);
    const seats = [];
    spinners.push({ grp, seats, w: 0.7 + R() * 0.6, ph: R() * 6 }); fence(8);
  }
  world.updaters.push((dt) => { for (const s of spinners) { s.ph += dt; s.grp.rotation.y += dt * s.w; s.grp.rotation.z = Math.sin(s.ph * 0.35) * 0.12; const fly = 0.45 + 0.1 * Math.sin(s.ph * 0.5); for (const p of s.seats) p.rotation.z = fly; } });
}
