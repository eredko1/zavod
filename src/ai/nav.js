// Navigation grid (0.5 m cells) built from ctx.world.bounds + ctx.colliders, A* with string pulling,
// circle-vs-AABB resolution, and fallback cover generation. Owned by: AI agent.
import * as THREE from 'three';

const AGENT_R = 0.42;      // inflation radius for blocked cells
const LOW_TOP = 0.5;       // colliders with top below this are step-overs
const HIGH_BOTTOM = 1.6;   // colliders starting above this are overhead
const MAX_EXPAND = 24000;

class Heap {
  constructor() { this.a = []; this.k = []; }
  get size() { return this.a.length; }
  push(v, key) {
    const a = this.a, k = this.k; a.push(v); k.push(key);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= k[i]) break; [a[p], a[i]] = [a[i], a[p]]; [k[p], k[i]] = [k[i], k[p]]; i = p; }
  }
  pop() {
    const a = this.a, k = this.k; const top = a[0]; const lv = a.pop(), lk = k.pop();
    if (a.length) {
      a[0] = lv; k[0] = lk; let i = 0; const n = a.length;
      for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < n && k[l] < k[m]) m = l; if (r < n && k[r] < k[m]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; [k[m], k[i]] = [k[i], k[m]]; i = m; }
    }
    return top;
  }
  clear() { this.a.length = 0; this.k.length = 0; }
}

export class NavGrid {
  constructor(ctx, cell = 0.5) {
    this.ctx = ctx; this.cell = cell; this.stamp = 1; this.heap = new Heap();
    this.colliderCount = -1;
    this.build();
  }

  build() {
    const ctx = this.ctx, cell = this.cell;
    const b = ctx.world?.bounds;
    let minX = -60, maxX = 60, minZ = -60, maxZ = 60;
    if (b && isFinite(b.min.x) && b.max.x - b.min.x > 4) { minX = b.min.x; maxX = b.max.x; minZ = b.min.z; maxZ = b.max.z; }
    // safety clamp — nobody wants a 10^6-cell grid
    const span = Math.max(maxX - minX, maxZ - minZ); if (span > 400) { const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2; minX = cx - 200; maxX = cx + 200; minZ = cz - 200; maxZ = cz + 200; }
    this.minX = minX; this.minZ = minZ;
    this.w = Math.max(4, Math.ceil((maxX - minX) / cell)); this.h = Math.max(4, Math.ceil((maxZ - minZ) / cell));
    const n = this.w * this.h;
    this.blocked = new Uint8Array(n);
    this.g = new Float32Array(n); this.parent = new Int32Array(n); this.seen = new Uint32Array(n); this.closed = new Uint32Array(n);
    // border
    for (let x = 0; x < this.w; x++) { this.blocked[x] = 1; this.blocked[(this.h - 1) * this.w + x] = 1; }
    for (let z = 0; z < this.h; z++) { this.blocked[z * this.w] = 1; this.blocked[z * this.w + this.w - 1] = 1; }
    const cols = ctx.colliders || [];
    this.solids = [];
    for (const box of cols) {
      if (!box || !box.min) continue;
      if (box.max.y < LOW_TOP || box.min.y > HIGH_BOTTOM) continue;
      if (box.max.y - box.min.y < 0.05) continue;
      this.solids.push(box);
      const x0 = Math.max(0, Math.floor((box.min.x - AGENT_R - minX) / cell)), x1 = Math.min(this.w - 1, Math.floor((box.max.x + AGENT_R - minX) / cell));
      const z0 = Math.max(0, Math.floor((box.min.z - AGENT_R - minZ) / cell)), z1 = Math.min(this.h - 1, Math.floor((box.max.z + AGENT_R - minZ) / cell));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.blocked[z * this.w + x] = 1;
    }
    this.colliderCount = cols.length;
    let free = 0; for (let i = 0; i < n; i++) if (!this.blocked[i]) free++;
    this.freeCount = free;
  }

  maybeRebuild() { const c = this.ctx.colliders?.length ?? 0; if (c !== this.colliderCount) this.build(); }

  cx(x) { return Math.floor((x - this.minX) / this.cell); }
  cz(z) { return Math.floor((z - this.minZ) / this.cell); }
  wx(cx) { return this.minX + (cx + 0.5) * this.cell; }
  wz(cz) { return this.minZ + (cz + 0.5) * this.cell; }
  inGrid(cx, cz) { return cx >= 0 && cz >= 0 && cx < this.w && cz < this.h; }
  walkable(cx, cz) { return this.inGrid(cx, cz) && !this.blocked[cz * this.w + cx]; }
  isFree(x, z) { return this.walkable(this.cx(x), this.cz(z)); }

  // nearest walkable cell center (spiral search), returns Vector3 with y = ground
  nearestFree(x, z, maxR = 8) {
    const cx = this.cx(x), cz = this.cz(z);
    if (this.walkable(cx, cz)) return new THREE.Vector3(x, this.groundY(x, z), z);
    const rMax = Math.ceil(maxR / this.cell);
    for (let r = 1; r <= rMax; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        if (this.walkable(cx + dx, cz + dz)) { const wx = this.wx(cx + dx), wz = this.wz(cz + dz); return new THREE.Vector3(wx, this.groundY(wx, wz), wz); }
      }
    }
    return null;
  }

  randomFreeNear(x, z, r, rng = Math.random) {
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (this.isFree(px, pz)) return new THREE.Vector3(px, this.groundY(px, pz), pz);
    }
    return this.nearestFree(x, z, r + 2);
  }

  groundY(x, z) { const g = this.ctx.world?.groundHeight; return g ? g(x, z) : 0; }

  // supercover line walk over cells; true when every touched cell is walkable
  lineFree(x0, z0, x1, z1) {
    let cx = this.cx(x0), cz = this.cz(z0); const ex = this.cx(x1), ez = this.cz(z1);
    if (!this.walkable(cx, cz) || !this.walkable(ex, ez)) return false;
    const dx = Math.abs(ex - cx), dz = Math.abs(ez - cz); const sx = cx < ex ? 1 : -1, sz = cz < ez ? 1 : -1;
    let err = dx - dz; let guard = dx + dz + 2;
    while (guard-- > 0) {
      if (!this.walkable(cx, cz)) return false;
      if (cx === ex && cz === ez) return true;
      const e2 = 2 * err;
      if (e2 > -dz && e2 < dx) { // diagonal step: require both orthogonal neighbours free (no corner cutting)
        if (!this.walkable(cx + sx, cz) || !this.walkable(cx, cz + sz)) return false;
        err -= dz; err += dx; cx += sx; cz += sz;
      } else if (e2 > -dz) { err -= dz; cx += sx; }
      else { err += dx; cz += sz; }
    }
    return false;
  }

  // A* from world (from) to world (to). Returns array of Vector3 waypoints (excluding start), or null.
  findPath(from, to, opts = {}) {
    const start = this.nearestFree(from.x, from.z, 4), goalP = this.nearestFree(to.x, to.z, 6);
    if (!start || !goalP) return null;
    const sx = this.cx(start.x), sz = this.cz(start.z), gx = this.cx(goalP.x), gz = this.cz(goalP.z);
    const w = this.w, h = this.h, blocked = this.blocked, g = this.g, parent = this.parent, seen = this.seen, closed = this.closed;
    const stamp = ++this.stamp; const heap = this.heap; heap.clear();
    const si = sz * w + sx, gi = gz * w + gx;
    const H = (i) => { const x = i % w, z = (i - x) / w; const dx = Math.abs(x - gx), dz = Math.abs(z - gz); return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz); };
    g[si] = 0; parent[si] = -1; seen[si] = stamp; heap.push(si, H(si));
    let best = si, bestH = H(si), expanded = 0, found = false;
    const maxExpand = opts.maxExpand || MAX_EXPAND;
    while (heap.size) {
      const i = heap.pop();
      if (closed[i] === stamp) continue;
      closed[i] = stamp;
      if (i === gi) { found = true; best = i; break; }
      if (++expanded > maxExpand) break;
      const hh = H(i); if (hh < bestH) { bestH = hh; best = i; }
      const x = i % w, z = (i - x) / w;
      for (let k = 0; k < 8; k++) {
        const dx = k < 4 ? (k === 0 ? 1 : k === 1 ? -1 : 0) : (k === 4 || k === 5 ? 1 : -1);
        const dz = k < 4 ? (k === 2 ? 1 : k === 3 ? -1 : 0) : (k === 4 || k === 6 ? 1 : -1);
        const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
        const ni = nz * w + nx; if (blocked[ni] || closed[ni] === stamp) continue;
        if (k >= 4 && (blocked[z * w + nx] || blocked[nz * w + x])) continue;
        const ng = g[i] + (k >= 4 ? Math.SQRT2 : 1);
        if (seen[ni] !== stamp || ng < g[ni]) { seen[ni] = stamp; g[ni] = ng; parent[ni] = i; heap.push(ni, ng + H(ni) * 1.001); }
      }
    }
    // reconstruct
    const cells = []; let c = best; let guard = 100000;
    while (c !== -1 && guard-- > 0) { cells.push(c); c = parent[c]; }
    cells.reverse();
    if (cells.length <= 1 && !found) return null;
    const pts = cells.map(i => { const x = i % w, z = (i - x) / w; return new THREE.Vector3(this.wx(x), 0, this.wz(z)); });
    if (found) pts[pts.length - 1].set(goalP.x, 0, goalP.z);
    pts[0].set(from.x, 0, from.z);
    const out = this.smooth(pts);
    for (const p of out) p.y = this.groundY(p.x, p.z);
    out.complete = found;
    return out;
  }

  smooth(pts) {
    if (pts.length <= 2) return pts.slice(1);
    const out = []; let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.lineFree(pts[i].x, pts[i].z, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]); i = j;
    }
    return out;
  }

  // Push a circle (XZ) out of solid colliders that span the given y range. Mutates pos. Returns true when it hit something.
  resolveCircle(pos, radius, y0 = 0.3, y1 = 1.4) {
    let hit = false;
    for (const box of this.solids) {
      if (box.max.y < pos.y + y0 || box.min.y > pos.y + y1) continue;
      const cx = Math.max(box.min.x, Math.min(pos.x, box.max.x)), cz = Math.max(box.min.z, Math.min(pos.z, box.max.z));
      let dx = pos.x - cx, dz = pos.z - cz; const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      hit = true;
      if (d2 < 1e-8) { // inside: push out along smallest penetration axis
        const px = Math.min(pos.x - box.min.x, box.max.x - pos.x), pz = Math.min(pos.z - box.min.z, box.max.z - pos.z);
        if (px < pz) pos.x += (pos.x - (box.min.x + box.max.x) / 2 > 0 ? 1 : -1) * (px + radius); else pos.z += (pos.z - (box.min.z + box.max.z) / 2 > 0 ? 1 : -1) * (pz + radius);
      } else { const d = Math.sqrt(d2); const push = radius - d; pos.x += dx / d * push; pos.z += dz / d * push; }
    }
    // stay inside grid
    const m = this.cell * 1.5;
    pos.x = Math.max(this.minX + m, Math.min(this.minX + this.w * this.cell - m, pos.x));
    pos.z = Math.max(this.minZ + m, Math.min(this.minZ + this.h * this.cell - m, pos.z));
    return hit;
  }

  // Segment vs solids (XZ, at a given height) — cheap "can I walk straight there" test independent of grid inflation
  segmentBlocked(a, b, y = 1.0) {
    for (const box of this.solids) {
      if (box.max.y < y || box.min.y > y) continue;
      // slab test in XZ
      let tmin = 0, tmax = 1; const dx = b.x - a.x, dz = b.z - a.z;
      for (let ax = 0; ax < 2; ax++) {
        const o = ax ? a.z : a.x, d = ax ? dz : dx, lo = ax ? box.min.z : box.min.x, hi = ax ? box.max.z : box.max.x;
        if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { tmin = 2; break; } continue; }
        let t1 = (lo - o) / d, t2 = (hi - o) / d; if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) break;
      }
      if (tmin <= tmax) return true;
    }
    return false;
  }
}

// Cover points fallback: side midpoints + corners of tall enough colliders, offset outward.
export function generateCover(ctx, nav) {
  const out = [];
  for (const box of ctx.colliders || []) {
    if (!box || !box.min) continue;
    const h = box.max.y - box.min.y, sx = box.max.x - box.min.x, sz = box.max.z - box.min.z;
    if (h < 0.9 || box.min.y > 0.5 || Math.max(sx, sz) < 1.2) continue;
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, off = 0.7;
    const cand = [
      [box.max.x + off, cz, 1, 0], [box.min.x - off, cz, -1, 0], [cx, box.max.z + off, 0, 1], [cx, box.min.z - off, 0, -1],
    ];
    if (sx > 3.5) { cand.push([box.min.x + 0.6, box.max.z + off, 0, 1], [box.max.x - 0.6, box.max.z + off, 0, 1], [box.min.x + 0.6, box.min.z - off, 0, -1], [box.max.x - 0.6, box.min.z - off, 0, -1]); }
    if (sz > 3.5) { cand.push([box.max.x + off, box.min.z + 0.6, 1, 0], [box.max.x + off, box.max.z - 0.6, 1, 0], [box.min.x - off, box.min.z + 0.6, -1, 0], [box.min.x - off, box.max.z - 0.6, -1, 0]); }
    for (const [x, z, nx, nz] of cand) {
      if (!nav.isFree(x, z)) continue;
      out.push({ position: new THREE.Vector3(x, nav.groundY(x, z), z), normal: new THREE.Vector3(nx, 0, nz), height: h });
    }
  }
  return out;
}
