// SBU wider campus, built 1:1 from the OpenStreetMap plan in ./osm.js (qa/tools/osm-sbu.py): every building the hand-built
// core does not model, the road network, footpaths, parking lots (with parked cars), sports pitches + stadium, ponds, woods,
// lawns and plazas. SBU agent. Same frame as layout.js. The hand-built core (old BOUNDS) keeps its own paving; OSM ground
// features are only laid outside it so nothing doubles up.
import * as THREE from 'three';
import { Batch, polyGeo, boxGeo } from './geo.js';
import { facade, roofKit, block } from './buildings.js';
import { OSM, PLAY } from './osm.js';
import { BOUNDS } from './layout.js';
import { placeCars, CAR_KINDS } from '../carkit.js';

const CORE = { x0: BOUNDS.x0 + 4, x1: BOUNDS.x1 - 4, z0: BOUNDS.z0 + 4, z1: BOUNDS.z1 - 4 };
const inCore = (x, z) => x > CORE.x0 && x < CORE.x1 && z > CORE.z0 && z < CORE.z1;
const cen = (p) => { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; };
const pip = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
const bbox = (p) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return { x0, x1, z0, z1 }; };

/** Everything that must exist before props.js instances trees: returns extra tree placements for props.js. */
export function planCampusTrees(world) {
  const R = world.R, out = [];
  const nearBuilding = (x, z, m = 6) => OSM.b.some((b) => { const q = b._bb || (b._bb = bbox(b.p)); return x > q.x0 - m && x < q.x1 + m && z > q.z0 - m && z < q.z1 + m; });
  const onHard = (x, z) => OSM.l.some((p) => pip(x, z, p)) || OSM.pi.some((o) => pip(x, z, o.p)) || OSM.wa.some((p) => pip(x, z, p)) || OSM.g.some((o) => o.k === 'plaza' && pip(x, z, o.p));
  const nearRoad = (x, z) => OSM.r.some((r) => segDist(x, z, r.p) < r.w / 2 + 2.5) || OSM.w.some((w) => segDist(x, z, w.p) < w.w / 2 + 1.2);
  const ok = (x, z) => !inCore(x, z) && x > PLAY.x0 - 150 && x < PLAY.x1 + 150 && z > PLAY.z0 - 150 && z < PLAY.z1 + 150 && !nearBuilding(x, z) && !onHard(x, z);
  // woods: dense mixed stands
  for (const p of OSM.wd) {
    const q = bbox(p); const n = Math.min(260, Math.floor((q.x1 - q.x0) * (q.z1 - q.z0) / 70));
    for (let i = 0; i < n * 2 && i < 900; i++) { const x = q.x0 + R() * (q.x1 - q.x0), z = q.z0 + R() * (q.z1 - q.z0); if (!pip(x, z, p) || !ok(x, z)) continue; out.push({ x, z, s: 0.9 + R() * 0.5, kind: R() < 0.45 ? 'pine' : 'dec' }); }
  }
  // street trees along roads and footpaths (both sides, ~14 m)
  for (const r of [...OSM.r, ...OSM.w.filter((w) => w.w >= 3)]) {
    walk(r.p, 13 + R() * 5, (x, z, dx, dz) => { for (const sd of [-1, 1]) { if (R() < 0.35) continue; const off = r.w / 2 + 3 + R() * 1.5; const tx = x - dz * sd * off, tz = z + dx * sd * off; if (ok(tx, tz) && !nearRoad(tx, tz)) out.push({ x: tx, z: tz, s: 0.8 + R() * 0.4, kind: R() < 0.15 ? 'pine' : 'dec' }); } });
  }
  // lawn scatter in the playable area
  for (let i = 0; i < 1400; i++) { const x = PLAY.x0 + R() * (PLAY.x1 - PLAY.x0), z = PLAY.z0 + R() * (PLAY.z1 - PLAY.z0); if (R() < 0.6 || !ok(x, z) || nearRoad(x, z)) continue; out.push({ x, z, s: 0.8 + R() * 0.5, kind: R() < 0.25 ? 'pine' : 'dec' }); }
  // thin to >= 5 m spacing
  const kept = []; const grid = new Map(); const key = (x, z) => `${Math.floor(x / 5)},${Math.floor(z / 5)}`;
  for (const t of out) { let clash = false; for (let a = -1; a <= 1 && !clash; a++) for (let b = -1; b <= 1 && !clash; b++) for (const o of grid.get(`${Math.floor(t.x / 5) + a},${Math.floor(t.z / 5) + b}`) || []) if (Math.hypot(o.x - t.x, o.z - t.z) < 5) { clash = true; break; } if (clash) continue; kept.push(t); const k = key(t.x, t.z); (grid.get(k) || grid.set(k, []).get(k)).push(t); }
  return kept;
}

function segDist(x, z, p) { let best = 1e9; for (let i = 0; i + 1 < p.length; i++) { const [ax, az] = p[i], [bx, bz] = p[i + 1]; const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return best; }
function walk(pts, step, fn) { let next = step / 2, acc = 0; for (let i = 0; i + 1 < pts.length; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[i + 1]; const L = Math.hypot(x1 - x0, z1 - z0); if (L < 1e-3) continue; const ux = (x1 - x0) / L, uz = (z1 - z0) / L; while (next <= acc + L) { const d = next - acc; fn(x0 + ux * d, z0 + uz * d, ux, uz); next += step; } acc += L; } }

/** Ribbon (road / path) along a polyline at height y: flat strip of width w, mitred joints. */
function ribbon(pts, w, y) {
  const pos = [], idx = []; const n = pts.length; if (n < 2) return null;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    pos.push(p[0] - dz * w / 2, y, p[1] + dx * w / 2, p[0] + dz * w / 2, y, p[1] - dx * w / 2);
    if (i) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  // make sure the strip faces up whichever way the polyline runs
  if (g.attributes.normal.getY(0) < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  return g;
}

/** Split a polyline into runs outside the hand-built core. */
function outsideRuns(p) { const runs = []; let cur = []; for (const q of p) { if (inCore(q[0], q[1])) { if (cur.length > 1) runs.push(cur); cur = []; } else cur.push(q); } if (cur.length > 1) runs.push(cur); return runs; }

export function buildCampus(world, M) {
  const { ctx, scene, R } = world;
  const G = new Batch(world, M, 'campusGround');   // flat, receive only
  const S = new Batch(world, M, 'campus');          // solids
  // ---- ground: lawns/plazas, lots, pitches, track, water, roads, paths (y-stacked so nothing z-fights) ----------------------
  for (const o of OSM.g) { const [cx, cz] = cen(o.p); if (inCore(cx, cz)) continue; G.poly(o.k === 'plaza' ? 'concretePav' : 'grass', o.p, o.k === 'plaza' ? 0.02 : 0.005); }
  for (const p of OSM.l) { const [cx, cz] = cen(p); if (inCore(cx, cz)) continue; G.poly('asphalt', p, 0.03); }
  for (const o of OSM.pi) { const [cx, cz] = cen(o.p); if (inCore(cx, cz)) continue; G.poly(/tennis|basketball/.test(o.sport) ? 'asphalt' : 'grass', o.p, 0.035); pitchLines(G, o); }
  for (const o of OSM.tr) G.poly('red', o.p, 0.03);
  for (const p of OSM.wa) { const [cx, cz] = cen(p); if (inCore(cx, cz)) continue; G.poly('water', p, -0.25); G.poly('mud', p, -0.6); }
  for (const r of OSM.r) for (const run of outsideRuns(r.p)) {
    const g = ribbon(run, r.w, 0.045); if (g) G.add('asphalt', g, { uvScale: 1 / 6 });
    const c = ribbon(run, r.w + 0.7, 0.04); if (c) G.add('curb', c, { uvScale: 0.5 });
    if (r.w >= 7) walk(run, 6, (x, z, dx, dz) => { const d = boxGeo([-0.06, 0.05, -1.5], [0.06, 0.056, 1.5]); d.rotateY(Math.atan2(dx, dz)); d.translate(x, 0, z); G.add(r.k ? 'paintY' : 'paint', d, { uv: false }); });
  }
  for (const w of OSM.w) for (const run of outsideRuns(w.p)) { const g = ribbon(run, w.w, 0.06); if (g) G.add(w.s ? 'concreteGrey' : 'concretePav', g, { uvScale: 1 / 3 }); }
  G.flush({ shadow: false });

  // ---- parking lots: stall stripes + parked cars (lots inside the playable area are densely filled) --------------------
  const cars = [];
  for (const p of OSM.l) {
    const [cx, cz] = cen(p); if (inCore(cx, cz)) continue; const q = bbox(p);
    const play = cx > PLAY.x0 - 20 && cx < PLAY.x1 + 20 && cz > PLAY.z0 - 20 && cz < PLAY.z1 + 20;   // lots in the fogged ring get stripes, not cars
    const alongX = (q.x1 - q.x0) >= (q.z1 - q.z0);
    // rows of stalls every 18 m across the short axis (5.5 m stall + 7 m aisle + 5.5 m stall)
    const [a0, a1, b0, b1] = alongX ? [q.x0, q.x1, q.z0, q.z1] : [q.z0, q.z1, q.x0, q.x1];
    for (let b = b0 + 3; b < b1 - 3; b += 18) for (const side of [0, 12.5]) {
      const row = b + side; if (row > b1 - 2) continue;
      for (let a = a0 + 2; a < a1 - 2; a += 2.7) {
        const [x, z] = alongX ? [a, row + 2.75] : [row + 2.75, a];
        if (!pip(x, z, p)) continue;
        const st = alongX ? boxGeo([a - 0.05, 0.035, row], [a + 0.05, 0.04, row + 5.5]) : boxGeo([row, 0.035, a - 0.05], [row + 5.5, 0.04, a + 0.05]); S.add('paint', st, { uv: false });
        if (play && R() < 0.3) cars.push({ x: x + (alongX ? 1.35 : 0), z: z + (alongX ? 0 : 1.35), ry: (alongX ? Math.PI / 2 : 0) + (side ? Math.PI : 0) + (R() - 0.5) * 0.06, kind: ['sedan', 'sedan', 'suv', 'hatch', 'suv', 'van'][(R() * 6) | 0] });
      }
    }
  }
  const nearCam = cars.filter((c) => c.x > PLAY.x0 - 60 && c.x < PLAY.x1 + 60 && c.z > PLAY.z0 - 60 && c.z < PLAY.z1 + 60);
  placeCars(world, cars, { raycast: false });
  for (const c of nearCam) { const ax = Math.abs(Math.sin(c.ry)) > 0.5; const hx = ax ? 2.4 : 1.0, hz = ax ? 1.0 : 2.4; world.box([c.x - hx, 0, c.z - hz], [c.x + hx, 1.5, c.z + hz]); if (R() < 0.15) world.cover(c.x + (ax ? 0 : 1.6), c.z + (ax ? 1.6 : 0), ax ? 0 : 1, ax ? 1 : 0); }

  // ---- buildings ----------------------------------------------------------------------------------------------------
  let nBld = 0;
  for (const b of OSM.b) { try { building(S, world, M, b); nBld++; } catch (e) { console.warn('[sbu] campus building', e); } }
  S.flush({ shadow: true });
  ctx.progress?.(0.215, `university: ${nBld} campus buildings`);
}

const STYLE = {
  precast: { wall: 'precast', storey: 4.0, band: 1.5, inset: 0.6, pitch: 3.6, pierW: 0.5, parapet: 0.9 },
  hospital: { wall: 'precast', storey: 3.8, band: 1.3, inset: 0.5, pitch: 3.2, pierW: 0.4, parapet: 1.0 },
  brick: { wall: 'brickRed', pier: 'brickRed', storey: 3.1, band: 1.6, inset: 0.35, pitch: 2.8, pierW: 0.9, parapet: 0.7, floorBand: true, lit: 0.18 },
  glass: { wall: 'stuccoLight', glass: 'glassLight', storey: 4.2, band: 1.0, inset: 0.35, pitch: 3.0, pierW: 0.25, parapet: 0.8, lit: 0.35 },
  glassbrick: { wall: 'brickBrown', pier: 'brickBrown', glass: 'glassLight', storey: 3.3, band: 1.2, inset: 0.35, pitch: 3.0, pierW: 0.7, parapet: 0.8, lit: 0.25 },
};

function building(S, world, M, b) {
  const floors = Math.max(1, b.f | 0);
  // campus-grid aligned? (dominant edge direction within 4 deg of an axis) — else build in a rotated local frame
  let best = 0, bestL = 0; const hist = new Map();
  for (let i = 0; i < b.p.length; i++) { const [ax, az] = b.p[i], [bx, bz] = b.p[(i + 1) % b.p.length]; const L = Math.hypot(bx - ax, bz - az); if (L < 2) continue; const a = ((Math.atan2(bz - az, bx - ax) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2); const k = Math.round(a / 0.035); const v = (hist.get(k) || 0) + L; hist.set(k, v); if (v > bestL) { bestL = v; best = k * 0.035; } }
  const ang = best > Math.PI / 4 ? best - Math.PI / 2 : best;
  const aligned = Math.abs(ang) < 0.07;
  const c = Math.cos(-ang), s = Math.sin(-ang); const [ox, oz] = cen(b.p);
  const loc = b.p.map(([x, z]) => aligned ? [x, z] : [ox + (x - ox) * c - (z - oz) * s, oz + (x - ox) * s + (z - oz) * c]);
  const rects = decompose(loc);
  if (!rects.length) return;
  // rotated buildings: build into a scratch batch whose colliders are recorded, then rotate its geometry into place
  const T = aligned ? S : new Batch(proxyWorld(world), M, 'campusRot');
  const style = b.s;
  for (const r of rects) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    if (style === 'stadium') { stands(T, r); continue; }
    if (style === 'garage') { garage(T, r, Math.max(3, floors)); continue; }
    if (w < 4 || d < 4) { block(T, style === 'brick' ? 'brickRed' : style === 'glassbrick' ? 'brickBrown' : 'precast', r.x0, r.z0, r.x1, r.z1, floors * 3.6, { hvac: 0 }); continue; }
    if (style === 'arena') {
      const h = 15;
      block(T, 'brickBrown', r.x0, r.z0, r.x1, r.z1, h, { hvac: 0 });
      if (w > 20 && d > 20) T.hcyl('roofMetal', w > d ? 'x' : 'z', w > d ? r.x0 + 1 : r.z0 + 1, w > d ? r.x1 - 1 : r.z1 - 1, w > d ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2, h - Math.min(w, d) * 0.35, Math.min(w, d) * 0.5, 24);
      continue;
    }
    facade(T, { hvac: b.play ? 3 : 1, x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, floors: style === 'service' ? Math.min(floors, 2) : floors, ...(STYLE[style] || STYLE.precast), ...(b.play ? {} : { mullionPitch: 0 }), ground: floors >= 4 && style !== 'brick' && world.R() < 0.4 ? { h: 4.2, inset: 1.0, pitch: 7.2 } : undefined });
  }
  if (!aligned) {
    const m = new THREE.Matrix4().makeTranslation(ox, 0, oz).multiply(new THREE.Matrix4().makeRotationY(-ang)).multiply(new THREE.Matrix4().makeTranslation(-ox, 0, -oz));
    for (const [key, list] of T.lists) for (const g of list) { g.applyMatrix4(m); (S.lists.get(key) || S.lists.set(key, []).get(key)).push(g); }
    T.lists.clear();
    for (const [mn, mx] of T.world._boxes) { // conservative AABB of each rotated collider
      const pts = [[mn[0], mn[2]], [mx[0], mn[2]], [mn[0], mx[2]], [mx[0], mx[2]]].map(([x, z]) => new THREE.Vector3(x, 0, z).applyMatrix4(m));
      world.box([Math.min(...pts.map((p) => p.x)), mn[1], Math.min(...pts.map((p) => p.z))], [Math.max(...pts.map((p) => p.x)), mx[1], Math.max(...pts.map((p) => p.z))]);
    }
  }
  // a few cover points along the long faces of playable buildings
  if (b.play) for (const r of rects) { if (r.x1 - r.x0 < 12) continue; for (let x = r.x0 + 6; x < r.x1 - 4; x += 14) { world.cover(x, r.z0 - 1.2, 0, -1); world.cover(x, r.z1 + 1.2, 0, 1); } }
}

function proxyWorld(world) { return { ...world, R: world.R, _boxes: [], box(min, max) { this._boxes.push([min, max]); }, walkable(min, max) { this._boxes.push([min, max]); }, cover() {} }; }

/** Rectilinear decomposition of a (roughly) axis-aligned footprint: coordinate compression -> inside cells -> merged rects. */
function decompose(p) {
  const snap = (v) => Math.round(v * 2) / 2;
  const xs = [...new Set(p.map((q) => snap(q[0])))].sort((a, b) => a - b), zs = [...new Set(p.map((q) => snap(q[1])))].sort((a, b) => a - b);
  // drop tiny coordinate steps (< 1.5 m) that only produce slivers
  const clean = (arr) => arr.filter((v, i) => i === 0 || i === arr.length - 1 || (v - arr[i - 1] >= 1.5));
  const X = clean(xs), Z = clean(zs);
  const on = [];
  for (let j = 0; j + 1 < Z.length; j++) { on.push([]); for (let i = 0; i + 1 < X.length; i++) on[j].push(pip((X[i] + X[i + 1]) / 2, (Z[j] + Z[j + 1]) / 2, p)); }
  const rects = []; const used = on.map((row) => row.map(() => false));
  for (let j = 0; j < on.length; j++) for (let i = 0; i < on[j].length; i++) {
    if (!on[j][i] || used[j][i]) continue;
    let i1 = i; while (i1 + 1 < on[j].length && on[j][i1 + 1] && !used[j][i1 + 1]) i1++;
    let j1 = j; outer: while (j1 + 1 < on.length) { for (let k = i; k <= i1; k++) if (!on[j1 + 1][k] || used[j1 + 1][k]) break outer; j1++; }
    for (let jj = j; jj <= j1; jj++) for (let k = i; k <= i1; k++) used[jj][k] = true;
    rects.push({ x0: X[i], x1: X[i1 + 1], z0: Z[j], z1: Z[j1 + 1] });
  }
  return rects.filter((r) => r.x1 - r.x0 >= 2 && r.z1 - r.z0 >= 2);
}

function stands(B, r) {
  // stadium: stepped concrete bleachers along both long sides of the footprint, open in the middle (the field is a pitch polygon)
  const alongX = r.x1 - r.x0 >= r.z1 - r.z0; const depth = Math.min(22, (alongX ? r.z1 - r.z0 : r.x1 - r.x0) * 0.22);
  for (const side of [0, 1]) for (let k = 0; k < 14; k++) {
    const t0 = depth * k / 14, t1 = depth, y = 0.6 + k * 0.55;
    if (alongX) { const z0 = side ? r.z1 - t1 : r.z0 + t0, z1 = side ? r.z1 - t0 : r.z0 + t1; B.box(k % 2 ? 'concrete' : 'concreteGrey', [r.x0 + 6, 0, Math.min(z0, z1)], [r.x1 - 6, y, Math.max(z0, z1)]); }
    else { const x0 = side ? r.x1 - t1 : r.x0 + t0, x1 = side ? r.x1 - t0 : r.x0 + t1; B.box(k % 2 ? 'concrete' : 'concreteGrey', [Math.min(x0, x1), 0, r.z0 + 6], [Math.max(x0, x1), y, r.z1 - 6]); }
  }
  // press box on one side
  if (alongX) B.box('glassDark', [(r.x0 + r.x1) / 2 - 18, 8.3, r.z0], [(r.x0 + r.x1) / 2 + 18, 12.5, r.z0 + 5]);
  else B.box('glassDark', [r.x0, 8.3, (r.z0 + r.z1) / 2 - 18], [r.x0 + 5, 12.5, (r.z0 + r.z1) / 2 + 18]);
}

function garage(B, r, levels) {
  // open-deck parking structure: slabs every 3.2 m on a column grid, solid spandrel parapets, stair core
  for (let l = 0; l <= levels; l++) { const y = l * 3.2; B.box('concreteGrey', [r.x0, y, r.z0], [r.x1, y + 0.3, r.z1], { walkable: l === levels }); if (l) { B.box('concrete', [r.x0, y + 0.3, r.z0], [r.x1, y + 1.2, r.z0 + 0.25]); B.box('concrete', [r.x0, y + 0.3, r.z1 - 0.25], [r.x1, y + 1.2, r.z1]); B.box('concrete', [r.x0, y + 0.3, r.z0], [r.x0 + 0.25, y + 1.2, r.z1]); B.box('concrete', [r.x1 - 0.25, y + 0.3, r.z0], [r.x1, y + 1.2, r.z1]); } }
  for (let x = r.x0 + 0.5; x < r.x1; x += 8.5) for (let z = r.z0 + 0.5; z < r.z1; z += 8.5) B.box('concrete', [x, 0, z], [x + 0.6, levels * 3.2, z + 0.6], { collide: true });
  B.box('precast', [r.x0, 0, r.z0], [r.x0 + 6, levels * 3.2 + 3, r.z0 + 6]);
}

function pitchLines(G, o) {
  const q = bbox(o.p); const w = q.x1 - q.x0, d = q.z1 - q.z0; if (w < 15 || d < 15) return;
  const line = (x0, z0, x1, z1) => G.add('white', boxGeo([Math.min(x0, x1) - 0.06, 0.04, Math.min(z0, z1) - 0.06], [Math.max(x0, x1) + 0.06, 0.045, Math.max(z0, z1) + 0.06]), { uv: false });
  const m = 3; line(q.x0 + m, q.z0 + m, q.x1 - m, q.z0 + m); line(q.x0 + m, q.z1 - m, q.x1 - m, q.z1 - m); line(q.x0 + m, q.z0 + m, q.x0 + m, q.z1 - m); line(q.x1 - m, q.z0 + m, q.x1 - m, q.z1 - m);
  if (w > d) line((q.x0 + q.x1) / 2, q.z0 + m, (q.x0 + q.x1) / 2, q.z1 - m); else line(q.x0 + m, (q.z0 + q.z1) / 2, q.x1 - m, (q.z0 + q.z1) / 2);
}

/** Open-ground points on the OSM footpath network outside the hand-built core (spawns, crowd). */
export function campusPathPoints(world, n, { gap = 25, play = true } = {}) {
  const R = world.R, pts = [];
  const clearOf = (x, z) => !OSM.b.some((b) => { const q = b._bb || (b._bb = bbox(b.p)); return x > q.x0 - 3 && x < q.x1 + 3 && z > q.z0 - 3 && z < q.z1 + 3; });
  const cand = []; for (const w of OSM.w) walk(w.p, 9, (x, z) => { if (inCore(x, z)) return; if (play && !(x > PLAY.x0 + 8 && x < PLAY.x1 - 8 && z > PLAY.z0 + 8 && z < PLAY.z1 - 8)) return; if (clearOf(x, z)) cand.push([x, z]); });
  for (let i = cand.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; [cand[i], cand[j]] = [cand[j], cand[i]]; }
  for (const c of cand) { if (pts.length >= n) break; if (pts.some((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < gap)) continue; pts.push(c); }
  return pts;
}
