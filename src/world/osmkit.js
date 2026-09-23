// Shared OSM-to-geometry helpers (used by sbu/campus.js and coney/*). Owned by: main (integration).
// Footprints -> rectangles in a (possibly rotated) local frame -> any per-rect builder writing into a geo Batch
// (sbu/geo.js API: add/box/lists, world.box colliders). Road/path ribbons, polyline walkers, point-in-polygon.
import * as THREE from 'three';
import { Batch } from './sbu/geo.js';

export const cen = (p) => { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; };
export const pip = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
export const bbox = (p) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return { x0, x1, z0, z1 }; };
export function segDist(x, z, p) { let best = 1e9; for (let i = 0; i + 1 < p.length; i++) { const [ax, az] = p[i], [bx, bz] = p[i + 1]; const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return best; }
export function walk(pts, step, fn) { let next = step / 2, acc = 0; for (let i = 0; i + 1 < pts.length; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[i + 1]; const L = Math.hypot(x1 - x0, z1 - z0); if (L < 1e-3) continue; const ux = (x1 - x0) / L, uz = (z1 - z0) / L; while (next <= acc + L) { const d = next - acc; fn(x0 + ux * d, z0 + uz * d, ux, uz); next += step; } acc += L; } }

/** Ribbon (road / path) along a polyline at height y: flat strip of width w, mitred joints. */
export function ribbon(pts, w, y) {
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

function proxyWorld(world) { return { ...world, R: world.R, _boxes: [], box(min, max) { this._boxes.push([min, max]); }, walkable(min, max) { this._boxes.push([min, max]); }, cover() {} }; }

/** Rectilinear decomposition of a (roughly) axis-aligned footprint: coordinate compression -> inside cells -> merged rects. */
export function decompose(p) {
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

/** Dominant edge direction of a footprint (radians, folded into [-pi/4, pi/4]). */
export function footprintAngle(p) {
  let best = 0, bestL = 0; const hist = new Map();
  for (let i = 0; i < p.length; i++) { const [ax, az] = p[i], [bx, bz] = p[(i + 1) % p.length]; const L = Math.hypot(bx - ax, bz - az); if (L < 2) continue; const a = ((Math.atan2(bz - az, bx - ax) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2); const k = Math.round(a / 0.035); const v = (hist.get(k) || 0) + L; hist.set(k, v); if (v > bestL) { bestL = v; best = k * 0.035; } }
  return best > Math.PI / 4 ? best - Math.PI / 2 : best;
}

/**
 * Builds a footprint: decomposes it into rectangles in its own grid-aligned frame and calls buildRect(batch, rect) for each.
 * Axis-aligned footprints build straight into S; rotated ones build into a scratch batch (colliders recorded) whose geometry is
 * then rotated into place, with conservative AABB colliders. Returns the rects (rects.aligned tells which frame they are in).
 */
export function footprint(S, world, M, poly, buildRect) {
  const ang = footprintAngle(poly); const aligned = Math.abs(ang) < 0.07;
  const c = Math.cos(-ang), s = Math.sin(-ang); const [ox, oz] = cen(poly);
  const loc = poly.map(([x, z]) => aligned ? [x, z] : [ox + (x - ox) * c - (z - oz) * s, oz + (x - ox) * s + (z - oz) * c]);
  const rects = decompose(loc); rects.aligned = aligned; rects.angle = ang; rects.origin = [ox, oz];
  if (!rects.length) return rects;
  const T = aligned ? S : new Batch(proxyWorld(world), M, 'osmRot');
  for (const r of rects) buildRect(T, r);
  if (!aligned) {
    const m = new THREE.Matrix4().makeTranslation(ox, 0, oz).multiply(new THREE.Matrix4().makeRotationY(-ang)).multiply(new THREE.Matrix4().makeTranslation(-ox, 0, -oz));
    for (const [key, list] of T.lists) for (const g of list) { g.applyMatrix4(m); (S.lists.get(key) || S.lists.set(key, []).get(key)).push(g); }
    T.lists.clear();
    for (const [mn, mx] of T.world._boxes) {
      const pts = [[mn[0], mn[2]], [mx[0], mn[2]], [mn[0], mx[2]], [mx[0], mx[2]]].map(([x, z]) => new THREE.Vector3(x, 0, z).applyMatrix4(m));
      world.box([Math.min(...pts.map((q) => q.x)), mn[1], Math.min(...pts.map((q) => q.z))], [Math.max(...pts.map((q) => q.x)), mx[1], Math.max(...pts.map((q) => q.z))]);
    }
    rects.matrix = m;
  }
  return rects;
}
