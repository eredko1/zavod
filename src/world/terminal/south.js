// TERMINAL — south block: Oyster Bar ramps, Whispering Gallery, bridge, Vanderbilt Hall, Dining Concourse, Oyster Bar, subway mezzanine. TERMINAL agent.
import * as THREE from 'three';
import { Bucket, placeXY, mat4, lathe, balustrade, wallGeo, stairSteps } from './kit.js';
import { P } from './plan.js';
import { archShapeAt, grilleGeo, slopedParapet } from './concourse.js';

/** Ramp surface height at |x| (0 at RAMP_TOP_X → LOW at RAMP_BOT_X). */
export function rampY(x) { const a = Math.abs(x); if (a >= P.RAMP_TOP_X) return 0; if (a <= P.RAMP_BOT_X) return P.LOW; return P.LOW * (P.RAMP_TOP_X - a) / (P.RAMP_TOP_X - P.RAMP_BOT_X); }

function archHole(cx, y0, w, h) { const p = new THREE.Path(); const r = w / 2, yc = y0 + h - r; p.moveTo(cx - r, y0); p.lineTo(cx + r, y0); p.lineTo(cx + r, yc); p.absarc(cx, yc, r, 0, Math.PI, false); p.lineTo(cx - r, y0); p.closePath(); return p; }
function rectHole(x0, y0, x1, y1) { const p = new THREE.Path(); p.moveTo(x0, y0); p.lineTo(x1, y0); p.lineTo(x1, y1); p.lineTo(x0, y1); p.closePath(); return p; }

/** Barrel vault (inside faces) spanning z∈[z0,z1] along x∈[x0,x1]; spring at ySpring, rise r. */
function barrelGeo(x0, x1, z0, z1, ySpring, rise, { nx = 8, nz = 24 } = {}) {
  const pos = [], uvs = [], idx = []; const cz = (z0 + z1) / 2, hz = (z1 - z0) / 2;
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) { const x = x0 + (x1 - x0) * i / nx; const th = Math.PI * j / nz; const z = cz + Math.cos(th) * hz; const y = ySpring + Math.sin(th) * rise; pos.push(x, y, z); uvs.push(x, th * hz); }
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const a = i * (nz + 1) + j, b = a + nz + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
  const n = g.attributes.normal; if (n.getY(Math.floor(n.count / 2)) > 0) { const ix = g.index.array; for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; } g.computeVertexNormals(); }
  return g;
}
/** Sloped slab (prism) from xa→xb with heights ya→yb (top surface), thickness t, spanning z0..z1. */
function slopedSlab(B, mat, xa, xb, ya, yb, z0, z1, t, uvScale) {
  const v = [[xa, ya - t, z0], [xb, yb - t, z0], [xb, yb, z0], [xa, ya, z0], [xa, ya - t, z1], [xb, yb - t, z1], [xb, yb, z1], [xa, ya, z1]];
  const p = []; const push = (x, y, z) => p.push(x, y, z); const q = (a, b, c, d) => { for (const i of [a, c, b, a, d, c]) push(...v[i]); };
  q(0, 1, 2, 3); q(5, 4, 7, 6); q(4, 0, 3, 7); q(1, 5, 6, 2); q(3, 2, 6, 7); q(4, 5, 1, 0);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals();
  B.add(mat, g, null, { uvScale });
}

export function buildSouth(world, M, Z) {
  const B = new Bucket(world);
  const uv = (m) => m.userData.uv ?? 0.5;
  const { RZ0, RZ1, RAMP_Z0, LOW, VH, DIN, OYS, MEZ, BRIDGE_HX } = P;
  const T = 1.0;

  // ================= ramps + corridors + gallery (y 0 → -6) =================
  for (const side of [-1, 1]) {
    const ax = (a) => side * a;
    // level-0 corridor along the north side of the ramp (|x| 26.5 → 54), floor + parapet toward the ramp
    const cx0 = Math.min(ax(P.OPEN_X0 - 0.5), ax(54)), cx1 = Math.max(ax(P.OPEN_X0 - 0.5), ax(54));
    B.box(M.marbleFloor, [cx0, -0.6, RZ0 - 0.2], [cx1, 0, RAMP_Z0], { uvScale: uv(M.marbleFloor) });
    Z.push({ x0: cx0, x1: cx1, z0: RZ0 - 0.5, z1: RAMP_Z0, h: 0 });
    // ramp top landing (|x| 50..54, full strip) at 0
    const lx0 = Math.min(ax(P.RAMP_TOP_X), ax(54)), lx1 = Math.max(ax(P.RAMP_TOP_X), ax(54));
    B.box(M.marbleFloor, [lx0, -0.6, RAMP_Z0 - 0.1], [lx1, 0, RZ1], { uvScale: uv(M.marbleFloor) });
    Z.push({ x0: lx0, x1: lx1, z0: RAMP_Z0 - 0.5, z1: RZ1, h: 0 });
    // the ramp itself: segmented sloped slabs (visual) — groundHeight carries the physics
    const segs = 14; const xa0 = ax(P.RAMP_TOP_X), xb0 = ax(P.RAMP_BOT_X);
    for (let i = 0; i < segs; i++) { const xa = xa0 + (xb0 - xa0) * i / segs, xb = xa0 + (xb0 - xa0) * (i + 1) / segs; slopedSlab(B, M.marbleFloor, xa, xb, rampY(xa), rampY(xb), RAMP_Z0, RZ1, 0.6, uv(M.marbleFloor)); }
    Z.push({ x0: Math.min(xa0, xb0), x1: Math.max(xa0, xb0), z0: RAMP_Z0, z1: RZ1, h: (x) => rampY(x) });
    // parapet between corridor (0) and ramp: marble wall, 1.0 m above the corridor, |x| 26 → 50
    { const px0 = Math.min(ax(P.OPEN_X0 - 0.5), ax(P.RAMP_TOP_X)), px1 = Math.max(ax(P.OPEN_X0 - 0.5), ax(P.RAMP_TOP_X)); B.box(M.marble, [px0, -0.7, RAMP_Z0 - 0.3], [px1, 1.0, RAMP_Z0], { uvScale: uv(M.marble) }); world.box([px0, -0.7, RAMP_Z0 - 0.3], [px1, 1.0, RAMP_Z0]); }
    // ramp-side wall below the corridor (the corridor slab face) down to the ramp: solid mass
    B.box(M.marble, [cx0, -6.6, RZ0 - 0.2], [cx1, -0.6, RAMP_Z0 - 0.3], { uvScale: uv(M.marble) });
    // north wall of the ramp strip for |x| < 26.5 (solid behind the ticket offices, marble-clad) — from the pit floor up to the ceiling
    B.box(M.marble, [Math.min(ax(BRIDGE_HX + 0.5), ax(P.OPEN_X0 - 0.5)), -6.6, RZ0 - 0.5], [Math.max(ax(BRIDGE_HX + 0.5), ax(P.OPEN_X0 - 0.5)), 4.2, RAMP_Z0], { uvScale: uv(M.marble) });
    world.box([Math.min(ax(BRIDGE_HX + 0.5), ax(P.OPEN_X0 - 0.5)), -6.6, RZ0 - 0.5], [Math.max(ax(BRIDGE_HX + 0.5), ax(P.OPEN_X0 - 0.5)), 4.2, RAMP_Z0]);
    // south wall of the ramp strip (z=29..30) with blind arches; the Vanderbilt Hall wall stands above it
    B.box(M.marble, [Math.min(ax(BRIDGE_HX + 0.5), ax(54)), -6.6, RZ1], [Math.max(ax(BRIDGE_HX + 0.5), ax(54)), 4.2, RZ1 + T], { uvScale: uv(M.marble) });
    world.box([Math.min(ax(BRIDGE_HX + 0.5), ax(54)), -6.6, RZ1], [Math.max(ax(BRIDGE_HX + 0.5), ax(54)), 4.2, RZ1 + T]);
    for (let a = 12; a < 50; a += 8) { const cx = ax(a); B.add(M.guastavino, new THREE.ShapeGeometry(archShapeAt(0, 0, 4, 3.2)), placeXY(cx, rampY(cx) + 0.4, RZ1 - 0.05, Math.PI), { uvScale: 1 }); B.box(M.brass, [cx - 0.15, rampY(cx) + 3.7, RZ1 - 0.35], [cx + 0.15, rampY(cx) + 3.85, RZ1], { uvScale: 1 }); world.termLamps.push([cx, rampY(cx) + 3.6, RZ1 - 0.5, 'wall']); }
    // end wall at |x| = 54 (closed bronze doors to Vanderbilt Ave / Lexington Ave) — corridor + landing
    B.box(M.stone, [Math.min(ax(54), ax(55)), -0.6, RZ0 - 0.5], [Math.max(ax(54), ax(55)), 4.2, RZ1 + T], { uvScale: uv(M.stone) }); world.box([Math.min(ax(54), ax(55)), -0.6, RZ0 - 0.5], [Math.max(ax(54), ax(55)), 4.2, RZ1 + T]);
    for (const zz of [21, 24, 27]) { B.box(M.bronze, [Math.min(ax(53.9), ax(54)), 0, zz - 1.2], [Math.max(ax(53.9), ax(54)), 3.2, zz + 1.2], { uvScale: 1 }); B.add(M.glassDim, new THREE.PlaneGeometry(1.8, 1.4), mat4(ax(53.85), 2.3, zz, 0, side < 0 ? Math.PI / 2 : -Math.PI / 2)); }
    // ceilings: flat at y=4.2 over |x| 26.5..54 (whole strip); sloped over the ramp for |x| < 26.5
    B.box(M.plaster, [Math.min(ax(P.OPEN_X0 - 0.5), ax(55)), 4.2, RZ0 - 0.5], [Math.max(ax(P.OPEN_X0 - 0.5), ax(55)), 4.8, RZ1 + T], { uvScale: 0.5 });
    { const xa = ax(P.OPEN_X0 - 0.5), xb = ax(P.RAMP_BOT_X); const ya = rampY(xa) + 4.2, yb = LOW + 4.4; slopedSlab(B, M.plaster, xa, xb, ya + 0.5, yb + 0.5, RAMP_Z0 - 0.2, RZ1 + 0.2, 0.5, 0.5); }
    // step face where the ceiling jumps (|x| = 26.5)
    { const xa = ax(P.OPEN_X0 - 0.5); B.box(M.plaster, [Math.min(xa, xa + side * 0.3), rampY(xa) + 4.2, RAMP_Z0 - 0.2], [Math.max(xa, xa + side * 0.3), 4.8, RZ1 + 0.2], { uvScale: 0.5 }); }
    // coffer beams across the ramp ceiling
    for (let a = 12; a < 50; a += 4) { const cx = ax(a); const yc = a > P.OPEN_X0 ? 4.2 : rampY(cx) + 4.2 + 0.5; B.box(M.plasterDark, [cx - 0.3, yc - 0.6, RAMP_Z0], [cx + 0.3, yc + 0.02, RZ1], { uvScale: 0.5 }); }
    // opening in the concourse south wall → corridor: door surround and sign
    const sgn = M.sign(side < 0 ? '⟵  DINING CONCOURSE · OYSTER BAR · SUBWAY' : 'DINING CONCOURSE · OYSTER BAR · SUBWAY  ⟶', { bg: '#1d1710', fg: '#e8c56a', font: 'bold 52px Georgia, serif' });
    B.add(sgn, new THREE.PlaneGeometry(4.2, 0.5), mat4(ax((P.OPEN_X0 + P.OPEN_X1) / 2), 4.6, P.Z1 - 0.02, 0, Math.PI, 0));
    // cover along the corridor: marble benches
    for (const a of [34, 42]) { const bx = ax(a); B.box(M.marbleDark, [bx - 1.2, 0, RZ0 + 0.2], [bx + 1.2, 0.5, RZ0 + 0.9], { uvScale: 1, collide: true }); world.cover(bx, RZ0 + 1.6, 0, 1); }
    // ramp cover: baggage carts along the ramp wall
    for (const a of [20, 30, 40]) { const bx = ax(a); const y = rampY(bx); B.box(M.ironDark, [bx - 0.6, y, RZ1 - 1.1], [bx + 0.6, y + 1.0, RZ1 - 0.15], { uvScale: 1, collide: true }); world.cover(bx, RZ1 - 1.9, 0, -1, y); }
  }
  // Whispering Gallery: x∈[-8,8], z∈[19.5,29], floor -6, Guastavino barrel vault under the bridge
  {
    B.box(M.terrazzo, [-BRIDGE_HX - 0.5, LOW - 0.6, RZ0 - 0.5], [BRIDGE_HX + 0.5, LOW, RZ1 + T], { uvScale: uv(M.terrazzo) });
    Z.push({ x0: -BRIDGE_HX - 0.5, x1: BRIDGE_HX + 0.5, z0: RZ0 - 0.5, z1: RZ1 + T, h: LOW });
    // vault: spring at -3.0, rise 2.2 → apex -0.8 (bridge underside)
    B.add(M.guastavino, barrelGeo(-BRIDGE_HX - 0.5, BRIDGE_HX + 0.5, RZ0 - 0.5, RZ1 + T, LOW + 3.0, 2.2), null, { uvScale: 1 });
    // pendentive arches (4 brass-edged Guastavino arches: E/W to the ramps, N blind, S to the dining concourse)
    for (const side of [-1, 1]) { const x = side * (BRIDGE_HX + 0.5); B.add(M.marble, new THREE.TorusGeometry(4.6, 0.25, 8, 32, Math.PI), mat4(x, LOW + 3.0, (RZ0 + RZ1 + 0.5) / 2, 0, Math.PI / 2, 0)); }
    // north wall of the gallery (blind arch with a bronze grille + lit niche), south arch open to dining
    B.box(M.marble, [-BRIDGE_HX - 0.5, LOW, RZ0 - 0.5], [BRIDGE_HX + 0.5, LOW + 5.5, RZ0], { uvScale: uv(M.marble) }); world.box([-BRIDGE_HX - 0.5, LOW, RZ0 - 0.5], [BRIDGE_HX + 0.5, 0, RZ0]);
    B.add(M.glassDim, new THREE.ShapeGeometry(archShapeAt(0, LOW, 4, 3.6)), placeXY(0, 0, RZ0 + 0.05), { uvScale: uv(M.glassDim) });
    B.add(M.bronze, grilleGeo(4, 3.6, { arch: true }), placeXY(0, LOW, RZ0 + 0.3));
    const sgnO = M.sign('OYSTER BAR  &  RESTAURANT', { bg: '#0e0a06', fg: '#f2d27a', font: 'bold 60px Georgia, serif' }); B.add(sgnO, new THREE.PlaneGeometry(5.5, 0.6), mat4(0, LOW + 4.0, RZ0 + 0.06));
    world.termLamps.push([0, LOW + 4.6, (RZ0 + RZ1) / 2, 'point']);
    // side walls of the gallery toward the ramps below their arch (the ramps arrive here at -6): open — nothing
    // south wall: arch opening to the Dining Concourse (x∈[-5,5]); piers either side
    for (const side of [-1, 1]) { const x0 = Math.min(side * 5, side * (BRIDGE_HX + 0.5)), x1 = Math.max(side * 5, side * (BRIDGE_HX + 0.5)); B.box(M.marble, [x0, LOW, RZ1], [x1, LOW + 5.5, RZ1 + T], { uvScale: uv(M.marble) }); world.box([x0, LOW, RZ1], [x1, 0, RZ1 + T]); }
    B.box(M.marble, [-5, LOW + 4.3, RZ1], [5, LOW + 5.5, RZ1 + T], { uvScale: uv(M.marble) });
    // the ramps meet the gallery: end their side walls at the arch line; masonry above the ramp mouths up to the vault
    for (const side of [-1, 1]) { const x0 = Math.min(side * (BRIDGE_HX + 0.5), side * (BRIDGE_HX + 1.5)), x1 = Math.max(side * (BRIDGE_HX + 0.5), side * (BRIDGE_HX + 1.5)); B.box(M.marble, [x0, LOW + 4.4, RZ0 - 0.5], [x1, 4.2, RZ1 + T], { uvScale: uv(M.marble) }); }
    for (let i = 0; i < 4; i++) world.cover(side_(i) * 3.5, RZ0 + 2 + (i % 2) * 5, -side_(i), 0, LOW);
  }
  // bridge: level-0 slab x∈[-7.5,7.5], z∈[19.5,30] with marble balustrades (colliders)
  {
    B.box(M.marbleFloor, [-BRIDGE_HX, -0.8, RZ0 - 0.2], [BRIDGE_HX, 0, VH.z0 + 0.2], { uvScale: uv(M.marbleFloor) });
    world.walkable([-BRIDGE_HX, -0.8, RZ0 - 0.2], [BRIDGE_HX, 0, VH.z0 + 0.2]);
    for (const side of [-1, 1]) { const x = side * (BRIDGE_HX - 0.15); balustrade(B, M.marble, M.marble, [x, RZ0], [x, VH.z0], { y: 0, instBal: world.termBal }); world.box([x - 0.2, 0, RZ0], [x + 0.2, 1.1, VH.z0]); }
    // the bridge floats over the gallery: side faces
    for (const side of [-1, 1]) B.box(M.marble, [Math.min(side * BRIDGE_HX, side * (BRIDGE_HX + 0.5)), -0.8, RZ0], [Math.max(side * BRIDGE_HX, side * (BRIDGE_HX + 0.5)), 0, RZ1], { uvScale: uv(M.marble) });
  }

  // ================= Vanderbilt Hall (y=0, over the dining concourse) =================
  {
    const { x0, x1, z0, z1, h } = VH;
    B.box(M.marbleFloor, [x0 - T, -0.8, z0 - T], [x1 + T, 0, z1 + T], { uvScale: uv(M.marbleFloor) });
    world.walkable([x0 - T, -0.8, z0 - T], [x1 + T, 0, z1 + T]);
    // walls: N (with the central arch to the bridge + 5 window bays), S (42nd St doors), E/W
    const holesN = [archHole(0, 0, 2 * BRIDGE_HX - 3, 7)]; const holesS = [];
    for (const cx of [-24, -12, 0, 12, 24]) { holesN.push(rectHole(cx - 2.6, 4.5, cx + 2.6, 12)); holesS.push(rectHole(cx - 2.6, 4.5, cx + 2.6, 12)); }
    for (const cx of [-12, 0, 12]) holesS.push(rectHole(cx - 1.8, 0, cx + 1.8, 3.6)); // 42nd St doors
    const shape = () => { const s = new THREE.Shape(); s.moveTo(x0 - T, 0); s.lineTo(x1 + T, 0); s.lineTo(x1 + T, h + 0.6); s.lineTo(x0 - T, h + 0.6); s.closePath(); return s; };
    B.add(M.stone, wallGeo(shape(), holesN, T), placeXY(0, 0, z0 - T), { uvScale: uv(M.stone) });
    B.add(M.stone, wallGeo(shape(), holesS, T), placeXY(0, 0, z1), { uvScale: uv(M.stone) });
    world.box([x0 - T, 0, z0 - T], [-BRIDGE_HX + 1.5, h, z0]); world.box([BRIDGE_HX - 1.5, 0, z0 - T], [x1 + T, h, z0]); world.box([x0 - T, 7, z0 - T], [x1 + T, h, z0]);
    world.box([x0 - T, 0, z1], [x1 + T, h, z1 + T]);
    for (const side of [-1, 1]) { const wx0 = side < 0 ? x0 - T : x1, wx1 = side < 0 ? x0 : x1 + T; B.box(M.stone, [wx0, 0, z0 - T], [wx1, h + 0.6, z1 + T], { uvScale: uv(M.stone) }); world.box([wx0, 0, z0 - T], [wx1, h, z1 + T]); }
    // windows: dim daylight glass + bronze grilles (N & S), door glass
    for (const cx of [-24, -12, 0, 12, 24]) for (const zz of [z0 - T * 0.5, z1 + T * 0.5]) { B.add(M.glassDim, new THREE.PlaneGeometry(5.2, 7.5), mat4(cx, 8.25, zz), { uvScale: uv(M.glassDim) }); B.add(M.bronze, grilleGeo(5.2, 7.5), mat4(cx, 4.5, zz > 40 ? z1 - 0.1 : z0 + 0.1, 0, 0, 0)); }
    for (const cx of [-12, 0, 12]) { B.add(M.glassDim, new THREE.PlaneGeometry(3.4, 3.4), mat4(cx, 1.8, z1 + 0.5), { uvScale: uv(M.glassDim) }); B.add(M.bronze, grilleGeo(3.4, 3.4), mat4(cx, 0, z1 + 0.2)); }
    // wainscot + cornice + coffered ceiling
    B.box(M.marble, [x0, 0, z0], [x1, 2.2, z0 + 0.12], { uvScale: uv(M.marble) }); B.box(M.marble, [x0, 0, z1 - 0.12], [x1, 2.2, z1], { uvScale: uv(M.marble) });
    B.box(M.marble, [x0, h - 1.2, z0], [x1, h, z0 + 0.6], { uvScale: uv(M.marble) }); B.box(M.marble, [x0, h - 1.2, z1 - 0.6], [x1, h, z1], { uvScale: uv(M.marble) });
    B.box(M.plaster, [x0 - T, h, z0 - T], [x1 + T, h + 0.6, z1 + T], { uvScale: 0.5 });
    for (let x = x0 + 3; x < x1; x += 6) B.box(M.plasterDark, [x - 0.4, h - 0.9, z0], [x + 0.4, h, z1], { uvScale: 0.5 });
    for (let z = z0 + 3.3; z < z1; z += 6.6) B.box(M.plasterDark, [x0, h - 0.9, z - 0.4], [x1, h, z + 0.4], { uvScale: 0.5 });
    // chandeliers (4-tier brass, 5 of them) — emissive globes + point lights registered
    for (const cx of [-24, -12, 0, 12, 24]) { chandelier(B, M, cx, 9.0, (z0 + z1) / 2, 1.6); world.termLamps.push([cx, 8.2, (z0 + z1) / 2, 'chandelier']); }
    // benches (waiting-room rows, oak) — cover
    for (const cx of [-20, -8, 8, 20]) for (const zz of [35, 40, 45]) { bench(B, M, cx, zz, 4.5); world.cover(cx, zz + 1.0, 0, 1); world.cover(cx, zz - 1.0, 0, -1); }
    // sign over the north arch (inside VH) + over the bridge (toward the concourse)
    const sgn = M.sign('MAIN CONCOURSE  ·  TRACKS  ·  BALCONIES', { bg: '#1d1710', fg: '#e8c56a', font: 'bold 56px Georgia, serif' });
    B.add(sgn, new THREE.PlaneGeometry(6.5, 0.6), mat4(0, 7.5, z0 - 0.02, 0, 0, 0));
    const sgn2 = M.sign('VANDERBILT HALL  ·  42nd STREET', { bg: '#1d1710', fg: '#e8c56a', font: 'bold 56px Georgia, serif' });
    B.add(sgn2, new THREE.PlaneGeometry(6.5, 0.6), mat4(0, 7.5, z0 - T + 0.02, 0, Math.PI, 0));
    B.add(sgn2, new THREE.PlaneGeometry(6.5, 0.6), mat4(0, 9.6, P.Z1 - 0.02, 0, Math.PI, 0));
  }

  // ================= Dining Concourse (y=-6, under Vanderbilt Hall) =================
  {
    const { x0, x1, z0, z1 } = DIN; const yc = -0.8; // ceiling = VH slab underside
    B.box(M.terrazzo, [x0 - T, LOW - 0.6, z0 - T], [x1 + T, LOW, z1 + T], { uvScale: uv(M.terrazzo) });
    Z.push({ x0: x0 - T, x1: x1 + T, z0: z0 - T, z1: z1 + T, h: LOW });
    // perimeter walls (marble-clad) — N wall has the arch from the gallery (x∈[-5,5]); S wall has the subway passage (x∈[-6,6]); E/W solid
    B.box(M.marble, [x0 - T, LOW, z0 - T], [-5, yc, z0], { uvScale: uv(M.marble) }); B.box(M.marble, [5, LOW, z0 - T], [x1 + T, yc, z0], { uvScale: uv(M.marble) });
    world.box([x0 - T, LOW, z0 - T], [-5, yc, z0]); world.box([5, LOW, z0 - T], [x1 + T, yc, z0]);
    B.box(M.marble, [x0 - T, LOW, z1], [-6, yc, z1 + T], { uvScale: uv(M.marble) }); B.box(M.marble, [6, LOW, z1], [x1 + T, yc, z1 + T], { uvScale: uv(M.marble) }); B.box(M.marble, [-6, LOW + 3.4, z1], [6, yc, z1 + T], { uvScale: uv(M.marble) });
    world.box([x0 - T, LOW, z1], [-6, yc, z1 + T]); world.box([6, LOW, z1], [x1 + T, yc, z1 + T]);
    for (const side of [-1, 1]) { const wx0 = side < 0 ? x0 - T : x1, wx1 = side < 0 ? x0 : x1 + T; B.box(M.marble, [wx0, LOW, z0 - T], [wx1, yc, z1 + T], { uvScale: uv(M.marble) }); world.box([wx0, LOW, z0 - T], [wx1, yc, z1 + T]); }
    // coffered beam ceiling: deep N–S beams every 4 m and E–W girders
    B.box(M.plaster, [x0 - T, yc, z0 - T], [x1 + T, yc + 0.3, z1 + T], { uvScale: 0.5 });
    for (let x = x0 + 2; x < x1; x += 4) B.box(M.plaster, [x - 0.35, yc - 1.0, z0], [x + 0.35, yc, z1], { uvScale: 0.5 });
    for (const zz of [z0 + 6.6, z0 + 13.3]) B.box(M.plaster, [x0, yc - 1.2, zz - 0.5], [x1, yc, zz + 0.5], { uvScale: 0.5 });
    // square stone piers on the girder lines (skip the Oyster Bar footprint)
    for (const px of [-20, -12, 12, 20]) for (const pz of [z0 + 6.6, z0 + 13.3]) { if (px < OYS.x1 && pz < OYS.z1) continue; B.box(M.marble, [px - 0.6, LOW, pz - 0.6], [px + 0.6, yc, pz + 0.6], { uvScale: uv(M.marble), collide: true }); world.cover(px + 1.1, pz, 1, 0, LOW); world.cover(px - 1.1, pz, -1, 0, LOW); }
    // food counters along the south wall (shuttered fronts + generic neon-ish signs)
    const names = ['COFFEE', 'BAGELS', 'PIZZA', 'SUSHI', 'TACOS', 'JUICE'];
    let k = 0; for (let x = -26; x <= 24; x += 10) { B.box(M.marbleDark, [x - 4, LOW, z1 - 3], [x + 4, LOW + 1.1, z1], { uvScale: 1, collide: true }); B.box(M.shutter, [x - 4, LOW + 1.1, z1 - 0.5], [x + 4, LOW + 3.4, z1], { uvScale: 1 }); const s = M.sign(names[k++ % names.length], { bg: '#160f0a', fg: k % 2 ? '#7fe0e6' : '#f2c25a', font: 'bold 80px Helvetica, Arial, sans-serif' }); B.add(s, new THREE.PlaneGeometry(4.5, 0.6), mat4(x, LOW + 3.9, z1 - 0.52, 0, Math.PI, 0)); world.cover(x, z1 - 3.7, 0, -1, LOW); world.termLamps.push([x, LOW + 4.0, z1 - 1.5, 'fluor']); }
    // Pullman-style booths in the centre (wood + red seats)
    for (const bx of [-2, 6, 14, 22]) for (const bz of [z0 + 4, z0 + 9.5, z0 + 15]) { booth(B, M, bx, LOW, bz); world.cover(bx + 1.6, bz, 1, 0, LOW); world.cover(bx - 1.6, bz, -1, 0, LOW); }
    // terrazzo medallion + info kiosk (dining concourse clock)
    B.add(M.brass, new THREE.RingGeometry(2.2, 2.5, 48), mat4(8, LOW + 0.01, z0 + 9.5, -Math.PI / 2));
    B.add(M.brass, new THREE.CylinderGeometry(0.12, 0.16, 2.6, 12), mat4(8, LOW + 1.3, z0 + 9.5)); B.add(M.brass, new THREE.BoxGeometry(0.55, 0.55, 0.55), mat4(8, LOW + 2.9, z0 + 9.5)); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; B.add(M.clockFace, new THREE.CylinderGeometry(0.22, 0.22, 0.02, 24), mat4(8 + Math.sin(a) * 0.28, LOW + 2.9, z0 + 9.5 + Math.cos(a) * 0.28, Math.PI / 2, a, 0)); }
    for (const [lx, lz] of [[-2, z0 + 6.6], [14, z0 + 6.6], [-2, z0 + 13.3], [14, z0 + 13.3], [24, z0 + 3]]) world.termLamps.push([lx, yc - 1.3, lz, 'pendant']);
    // trash cans (instanced later via props) — positions
    world.termTrash.push([-8, LOW, z0 + 2], [12, LOW, z1 - 4.2], [26, LOW, z0 + 12]);
    // signage to the subway
    const s = M.sign('SUBWAY  ·  4 · 5 · 6  ·  42 ST', { bg: '#0d0d0d', fg: '#ffffff', font: 'bold 60px Helvetica, Arial, sans-serif' }); B.add(s, new THREE.PlaneGeometry(4.5, 0.5), mat4(0, LOW + 3.1, z1 - 0.02, 0, Math.PI, 0));
  }
  // Oyster Bar: x∈[-31,-8], z∈[30,41], Guastavino vaulted, counter + tables; door from the dining side (x=-8) at z∈[32,35]
  {
    const { x0, x1, z0, z1 } = OYS;
    // partition walls (east x=-8 with door, south z=41)
    B.box(M.marble, [x1 - 0.4, LOW, z0], [x1, -0.8, 32], { uvScale: uv(M.marble) }); B.box(M.marble, [x1 - 0.4, LOW, 35], [x1, -0.8, z1], { uvScale: uv(M.marble) }); B.box(M.marble, [x1 - 0.4, LOW + 3.2, 32], [x1, -0.8, 35], { uvScale: uv(M.marble) });
    world.box([x1 - 0.4, LOW, z0], [x1, -0.8, 32]); world.box([x1 - 0.4, LOW, 35], [x1, -0.8, z1]);
    B.box(M.marble, [x0, LOW, z1 - 0.4], [x1, -0.8, z1], { uvScale: uv(M.marble) }); world.box([x0, LOW, z1 - 0.4], [x1, -0.8, z1]);
    // vaults: two barrels along x
    B.add(M.guastavino, barrelGeo(x0, x1 - 0.4, z0, (z0 + z1) / 2, LOW + 2.6, 1.5), null, { uvScale: 1 });
    B.add(M.guastavino, barrelGeo(x0, x1 - 0.4, (z0 + z1) / 2, z1 - 0.4, LOW + 2.6, 1.5), null, { uvScale: 1 });
    B.box(M.marble, [x0, LOW + 2.4, (z0 + z1) / 2 - 0.3], [x1 - 0.4, LOW + 2.8, (z0 + z1) / 2 + 0.3], { uvScale: uv(M.marble) });
    // counter (long, along the north wall) with stools; tables
    B.box(M.wood, [x0 + 2, LOW, z0 + 1.2], [x1 - 3, LOW + 1.1, z0 + 2.2], { uvScale: 1, collide: true });
    for (let x = x0 + 3; x < x1 - 3; x += 1.2) { B.add(M.brass, new THREE.CylinderGeometry(0.04, 0.04, 0.7, 8), mat4(x, LOW + 0.35, z0 + 3)); B.add(M.redSeat, new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12), mat4(x, LOW + 0.74, z0 + 3)); }
    for (const [tx, tz] of [[-26, 37], [-21, 37], [-16, 37], [-26, 39.5], [-21, 39.5], [-16, 39.5], [-12, 38]]) { table(B, M, tx, LOW, tz); world.cover(tx + 1, tz, 1, 0, LOW); }
    const s = M.sign('OYSTER BAR', { bg: '#0a0806', fg: '#ff6a5a', font: 'bold 84px Georgia, serif' }); B.add(s, new THREE.PlaneGeometry(3.6, 0.5), mat4(x1 - 0.42, LOW + 3.6, 33.5, 0, Math.PI / 2, 0));
    for (const lx of [-26, -20, -14]) for (const lz of [32.5, 38]) world.termLamps.push([lx, LOW + 3.4, lz, 'pendant']);
  }

  // ================= subway mezzanine (y=-6) x∈[-16,16], z∈[50,58] =================
  {
    const { x0, x1, z0, z1 } = MEZ; const yc = LOW + 3.4;
    B.box(M.concrete, [x0 - T, LOW - 0.6, z0], [x1 + T, LOW, z1 - 1], { uvScale: 0.5 });
    for (const [fx0, fx1] of [[x0 - T, -14.3], [-9.7, 9.7], [14.3, x1 + T]]) B.box(M.concrete, [fx0, LOW - 0.6, z1 - 1], [fx1, LOW, z1 + T], { uvScale: 0.5 });
    Z.push({ x0: x0 - T, x1: x1 + T, z0, z1: z1 + T, h: LOW });
    // tiled walls E/W + S (with two stair openings at x=±12 → handled by subway.js), ceiling
    for (const side of [-1, 1]) { const wx0 = side < 0 ? x0 - T : x1, wx1 = side < 0 ? x0 : x1 + T; B.box(M.tile, [wx0, LOW, z0], [wx1, yc, z1 + T], { uvScale: 1 }); world.box([wx0, LOW, z0], [wx1, yc, z1 + T]); B.box(M.tileBand, [side < 0 ? wx1 : wx0 - 0.01, LOW + 2.2, z0], [side < 0 ? wx1 + 0.01 : wx0, LOW + 2.6, z1], { uvScale: 1 }); }
    B.box(M.tile, [x0 - T, LOW, z1], [-14.2, yc, z1 + T], { uvScale: 1 }); B.box(M.tile, [-9.8, LOW, z1], [9.8, yc, z1 + T], { uvScale: 1 }); B.box(M.tile, [14.2, LOW, z1], [x1 + T, yc, z1 + T], { uvScale: 1 });
    world.box([x0 - T, LOW, z1], [-14.2, yc, z1 + T]); world.box([-9.8, LOW, z1], [9.8, yc, z1 + T]); world.box([14.2, LOW, z1], [x1 + T, yc, z1 + T]);
    B.box(M.concrete, [x0 - T, yc, z0 - 0.5], [x1 + T, yc + 0.5, z1 + T], { uvScale: 0.5 });
    // turnstile line at z=54 with fare walls; token booth
    for (const side of [-1, 1]) { const fx0 = Math.min(side * 6, side * x1), fx1 = Math.max(side * 6, side * x1); B.box(M.stainless, [fx0, LOW, 53.6], [fx1, LOW + 1.1, 54.4], { uvScale: 1, collide: true }); B.box(M.ironDark, [fx0, LOW + 1.1, 53.9], [fx1, LOW + 2.3, 54.1], { uvScale: 1 }); }
    for (let i = 0; i < 5; i++) { const tx = -4.8 + i * 2.4; world.termTurnstiles.push([tx, LOW, 54]); }
    B.box(M.stainless, [-6, LOW, 53.6], [-5.5, LOW + 1.0, 54.4], { uvScale: 1, collide: true }); B.box(M.stainless, [5.5, LOW, 53.6], [6, LOW + 1.0, 54.4], { uvScale: 1, collide: true });
    B.box(M.ironDark, [8, LOW, 51.5], [11, LOW + 2.6, 53.3], { uvScale: 1, collide: true }); B.box(M.darkGlass, [8.05, LOW + 1.1, 51.4], [10.95, LOW + 2.2, 51.5], { uvScale: 1 });
    const s = M.sign('TOKEN BOOTH', { w: 512, h: 96, bg: '#0d0d0d', fg: '#ffffff', font: 'bold 48px Helvetica, Arial' }); B.add(s, new THREE.PlaneGeometry(2.4, 0.42), mat4(9.5, LOW + 2.4, 51.38, 0, Math.PI, 0));
    world.cover(9.5, 50.8, 0, -1, LOW); world.cover(-9, 55.2, 0, 1, LOW); world.cover(9, 55.2, 0, 1, LOW);
    for (const lx of [-10, 0, 10]) for (const lz of [51.5, 56]) world.termLamps.push([lx, yc - 0.15, lz, 'fluor']);
    const s2 = M.sign('DOWNTOWN & BROOKLYN  ·  4 5 6', { bg: '#0d0d0d', fg: '#ffffff', font: 'bold 56px Helvetica, Arial' }); B.add(s2, new THREE.PlaneGeometry(4, 0.5), mat4(0, LOW + 2.9, z1 - 0.02, 0, Math.PI, 0));
    world.termTrash.push([-14, LOW, 52], [14, LOW, 56]);
  }

  B.flush((m) => (m === M.brass || m === M.brassDark || m === M.bronze || m === M.ironDark || m === M.stainless || m === M.shutter ? 'metal' : m === M.wood ? 'wood' : 'concrete'), { name: 'south' });
}
function side_(i) { return i % 2 ? 1 : -1; }

// ---- furniture helpers ---------------------------------------------------------------------------------------------
export function chandelier(B, M, x, y, z, s = 1) {
  B.add(M.brass, new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 6, 6), mat4(x, y + 3, z));
  for (let t = 0; t < 4; t++) { const r = (1.1 - t * 0.25) * s, yy = y + t * 0.45 * s; B.add(M.brass, new THREE.TorusGeometry(r, 0.05 * s, 8, 24), mat4(x, yy, z, Math.PI / 2)); const n = 12 - t * 2; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; B.add(M.lampGlass, new THREE.SphereGeometry(0.09 * s, 8, 6), mat4(x + Math.cos(a) * r, yy + 0.12 * s, z + Math.sin(a) * r)); } }
  B.add(M.brass, new THREE.SphereGeometry(0.35 * s, 16, 12), mat4(x, y - 0.3 * s, z));
}
export function bench(B, M, x, z, len = 3, yaw = 0) {
  const m = mat4(x, 0, z, 0, yaw);
  const add = (geo, dx, dy, dz, mat = M.wood) => { const g = geo; g.translate(dx, dy, dz); g.applyMatrix4(m); B.add(mat, g, null, { uvScale: 1 }); };
  add(new THREE.BoxGeometry(len, 0.08, 0.5), 0, 0.46, 0); add(new THREE.BoxGeometry(len, 0.5, 0.08), 0, 0.75, -0.22);
  for (const dx of [-len / 2 + 0.2, len / 2 - 0.2]) { add(new THREE.BoxGeometry(0.1, 0.42, 0.5), dx, 0.21, 0, M.ironDark); add(new THREE.BoxGeometry(0.1, 0.55, 0.1), dx, 0.72, -0.22, M.ironDark); }
  const box = new THREE.Box3(new THREE.Vector3(-len / 2, 0, -0.3), new THREE.Vector3(len / 2, 1.0, 0.3)).applyMatrix4(m); B.world.ctx.colliders.push(box);
}
export function booth(B, M, x, y, z) {
  B.box(M.wood, [x - 1.4, y, z - 1.1], [x + 1.4, y + 0.75, z + 1.1], { uvScale: 1 });
  B.box(M.wood, [x - 1.4, y + 0.75, z - 0.6], [x + 1.4, y + 0.8, z + 0.6], { uvScale: 1 });
  for (const s of [-1, 1]) { B.box(M.redSeat, [x - 1.35, y + 0.45, Math.min(z + s * 0.7, z + s * 1.05)], [x + 1.35, y + 0.5, Math.max(z + s * 0.7, z + s * 1.05)], { uvScale: 1 }); B.box(M.redSeat, [x - 1.35, y + 0.5, Math.min(z + s * 1.05, z + s * 1.15)], [x + 1.35, y + 1.25, Math.max(z + s * 1.05, z + s * 1.15)], { uvScale: 1 }); B.box(M.wood, [x - 1.4, y, Math.min(z + s * 1.15, z + s * 1.25)], [x + 1.4, y + 1.3, Math.max(z + s * 1.15, z + s * 1.25)], { uvScale: 1 }); }
  B.world.ctx.colliders.push(new THREE.Box3(new THREE.Vector3(x - 1.4, y, z - 1.25), new THREE.Vector3(x + 1.4, y + 1.3, z + 1.25)));
}
export function table(B, M, x, y, z) {
  B.add(M.wood, new THREE.CylinderGeometry(0.55, 0.55, 0.05, 16), mat4(x, y + 0.74, z)); B.add(M.ironDark, new THREE.CylinderGeometry(0.04, 0.25, 0.72, 10), mat4(x, y + 0.36, z));
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.4; const cx = x + Math.cos(a) * 0.85, cz = z + Math.sin(a) * 0.85; B.add(M.redSeat, new THREE.BoxGeometry(0.42, 0.06, 0.42), mat4(cx, y + 0.46, cz, 0, -a)); B.add(M.ironDark, new THREE.BoxGeometry(0.4, 0.5, 0.04), mat4(cx - Math.cos(a) * 0.2, y + 0.72, cz - Math.sin(a) * 0.2, 0, -a + Math.PI / 2)); for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) B.add(M.ironDark, new THREE.CylinderGeometry(0.015, 0.015, 0.45, 5), mat4(cx + dx, y + 0.22, cz + dz)); }
  B.world.ctx.colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.6, y, z - 0.6), new THREE.Vector3(x + 0.6, y + 0.78, z + 0.6)));
}
