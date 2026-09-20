// Height-aware navigation grid (0.5 m cells, up to 3 floor layers per cell) built from ctx.world.bounds, ctx.colliders,
// ctx.world.walkables and ctx.world.groundHeight; A* over (cell, layer) nodes with stairs (|Δfloor| ≤ 0.55) and one-way
// drops (≤ 3.5 m), layer-aware string pulling, circle-vs-AABB resolution, fallback cover generation. Owned by: AI agent.
import * as THREE from 'three';

const AGENT_R = 0.28;       // inflation radius for blocking (soldier half-width)
const STEP = 0.55;          // max floor change between neighbour cells (stairs are ≤ 0.45 steps)
const STEP_BLOCK = 0.5;     // colliders whose top is ≤ this above the floor are steps, not walls
const CLEAR = 1.8;          // headroom needed above a floor
const DROP_MAX = 3.5;       // one-way hop-down limit
const LOW_FLOOR = 2.2;      // collider tops this close above the base floor are floors without needing a stair chain
const K = 4;                // candidate slots per cell (base + 3 highest tops)
const L = 3;                // final layers per cell
const MAX_EXPAND = 60000;
const MAX_CELLS = 300000;

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

const DX = [1, -1, 0, 0, 1, 1, -1, -1], DZ = [0, 0, 1, -1, 1, -1, 1, -1];

export class NavGrid {
  constructor(ctx, cell = 0.5) {
    this.ctx = ctx; this.cellWanted = cell; this.cell = cell; this.stamp = 1; this.heap = new Heap();
    this.colliderCount = -1; this.budget = 4; this.buildMs = 0; this.builds = 0;
    this.build();
  }

  build() {
    const t0 = performance.now();
    const ctx = this.ctx; let cell = this.cellWanted;
    const b = ctx.world?.bounds;
    let minX = -60, maxX = 60, minZ = -60, maxZ = 60;
    if (b && isFinite(b.min.x) && b.max.x - b.min.x > 4) { minX = b.min.x; maxX = b.max.x; minZ = b.min.z; maxZ = b.max.z; }
    const span = Math.max(maxX - minX, maxZ - minZ); if (span > 500) { const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2; minX = cx - 250; maxX = cx + 250; minZ = cz - 250; maxZ = cz + 250; }
    const area = (maxX - minX) * (maxZ - minZ); if (area / (cell * cell) > MAX_CELLS) cell = Math.ceil(Math.sqrt(area / MAX_CELLS) * 20) / 20; // big maps: coarser cells, capped node count
    this.cell = cell; this.minX = minX; this.minZ = minZ;
    const w = this.w = Math.max(4, Math.ceil((maxX - minX) / cell)), h = this.h = Math.max(4, Math.ceil((maxZ - minZ) / cell));
    const n = this.n = w * h;
    // ---- 1. base floor + candidate tops ----
    const base = this.base = new Float32Array(n);
    const gh = ctx.world?.groundHeight;
    for (let z = 0; z < h; z++) { const wz = minZ + (z + 0.5) * cell; for (let x = 0; x < w; x++) { let g = gh ? gh(minX + (x + 0.5) * cell, wz) : 0; if (!Number.isFinite(g)) g = 0; base[z * w + x] = g; } }
    const cand = new Float32Array(n * K); const candN = new Uint8Array(n); const candW = new Uint8Array(n * K); // candW: 1 = from a registered walkable
    for (let i = 0; i < n; i++) { cand[i * K] = base[i]; candN[i] = 1; }
    const walk = new Set(ctx.world?.walkables || []);
    const cols = []; const seen = new Set();
    for (const src of [ctx.colliders || [], ctx.world?.walkables || []]) for (const box of src) { if (!box || !box.min || seen.has(box)) continue; if (!(box.max.x > box.min.x && box.max.z > box.min.z && box.max.y >= box.min.y)) continue; if (!isFinite(box.min.x + box.max.x + box.min.y + box.max.y + box.min.z + box.max.z)) continue; seen.add(box); cols.push(box); }
    this.solids = cols;
    const addCand = (i, top, isW) => {
      const o = i * K; let c = candN[i];
      for (let j = 0; j < c; j++) if (Math.abs(cand[o + j] - top) < 0.03) { if (isW) candW[o + j] = 1; return; }
      if (c < K) { cand[o + c] = top; candW[o + c] = isW; candN[i] = c + 1; return; }
      let lo = 1; for (let j = 2; j < K; j++) if (cand[o + j] < cand[o + lo]) lo = j; // slot 0 is the base
      if (top > cand[o + lo]) { cand[o + lo] = top; candW[o + lo] = isW; }
    };
    for (const box of cols) {
      const sx = box.max.x - box.min.x, sz = box.max.z - box.min.z; if (Math.min(sx, sz) < 0.35) continue; // railings / poles never carry a floor
      const isW = walk.has(box) ? 1 : 0;
      const x0 = Math.max(0, Math.ceil((box.min.x - minX) / cell - 0.5)), x1 = Math.min(w - 1, Math.floor((box.max.x - minX) / cell - 0.5));
      const z0 = Math.max(0, Math.ceil((box.min.z - minZ) / cell - 0.5)), z1 = Math.min(h - 1, Math.floor((box.max.z - minZ) / cell - 0.5));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) addCand(z * w + x, box.max.y, isW);
    }
    // ---- 2. blocking: a collider inside the standing volume [f+0.5, f+1.8] (inflated footprint) kills that candidate ----
    const blocked = new Uint8Array(n * K);
    for (const box of cols) {
      const x0 = Math.max(0, Math.floor((box.min.x - AGENT_R - minX) / cell)), x1 = Math.min(w - 1, Math.floor((box.max.x + AGENT_R - minX) / cell));
      const z0 = Math.max(0, Math.floor((box.min.z - AGENT_R - minZ) / cell)), z1 = Math.min(h - 1, Math.floor((box.max.z + AGENT_R - minZ) / cell));
      const lo = box.min.y, hi = box.max.y;
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const i = z * w + x, o = i * K, c = candN[i];
        for (let j = 0; j < c; j++) { if (blocked[o + j]) continue; const f = cand[o + j]; if (lo < f + CLEAR && hi > f + STEP_BLOCK) blocked[o + j] = 1; }
      }
    }
    // border
    for (let x = 0; x < w; x++) { candN[x] = 0; candN[(h - 1) * w + x] = 0; }
    for (let z = 0; z < h; z++) { candN[z * w] = 0; candN[z * w + w - 1] = 0; }
    // ---- 3. acceptance: base + walkables + low tops are seeds; other tops (stair steps) are accepted by flooding from an
    //         accepted neighbour with |Δfloor| ≤ STEP while the height-above-base stays continuous (kills phantom slabs over pits) ----
    const acc = new Uint8Array(n * K); const queue = new Int32Array(n * K); let qh = 0, qt = 0;
    for (let i = 0; i < n; i++) { const o = i * K, c = candN[i]; for (let j = 0; j < c; j++) { if (blocked[o + j]) continue; if (j === 0 || candW[o + j] || cand[o + j] - base[i] <= LOW_FLOOR) { acc[o + j] = 1; queue[qt++] = o + j; } } }
    while (qh < qt) {
      const s = queue[qh++]; const i = (s / K) | 0; const f = cand[s]; const hab = f - base[i];
      const x = i % w, z = (i - x) / w;
      for (let k = 0; k < 8; k++) {
        const nx = x + DX[k], nz = z + DZ[k]; if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
        const ni = nz * w + nx, no = ni * K, nc = candN[ni];
        for (let j = 1; j < nc; j++) { if (acc[no + j] || blocked[no + j]) continue; const nf = cand[no + j]; if (Math.abs(nf - f) > STEP) continue; if (Math.abs((nf - base[ni]) - hab) > 1.0) continue; acc[no + j] = 1; queue[qt++] = no + j; }
      }
    }
    // ---- 4. final layers (ascending; keep base + highest) ----
    const floor = this.floor = new Float32Array(n * L); const nl = this.nl = new Uint8Array(n);
    const tmp = [];
    let walkable = 0, multi = 0;
    for (let i = 0; i < n; i++) {
      const o = i * K, c = candN[i]; tmp.length = 0;
      for (let j = 0; j < c; j++) if (acc[o + j]) tmp.push(cand[o + j]);
      if (!tmp.length) { nl[i] = 0; continue; }
      tmp.sort((a, b) => a - b);
      while (tmp.length > L) tmp.splice(1, 1);
      nl[i] = tmp.length; for (let j = 0; j < tmp.length; j++) floor[i * L + j] = tmp[j];
      walkable += tmp.length; if (tmp.length > 1) multi++;
    }
    this.walkableCount = walkable; this.multiCount = multi;
    // A* scratch
    if (!this.g || this.g.length !== n * L) { this.g = new Float32Array(n * L); this.parent = new Int32Array(n * L); this.seen = new Uint16Array(n * L); this.closed = new Uint16Array(n * L); this.region = new Int32Array(n * L); }
    this.stamp = 1; this.seen.fill(0); this.closed.fill(0);
    // ---- 5. regions (weakly connected, drops treated as undirected) ----
    const region = this.region; region.fill(-1); let rid = 0; const rq = queue;
    for (let s0 = 0; s0 < n * L; s0++) {
      const i0 = (s0 / L) | 0; if (s0 - i0 * L >= nl[i0] || region[s0] !== -1) continue;
      let head = 0, tail = 0; rq[tail++] = s0; region[s0] = rid;
      while (head < tail) {
        const s = rq[head++]; const i = (s / L) | 0; const f = floor[s]; const x = i % w, z = (i - x) / w;
        for (let k = 0; k < 8; k++) {
          const nx = x + DX[k], nz = z + DZ[k]; if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
          const ni = nz * w + nx, c = nl[ni];
          for (let j = 0; j < c; j++) { const s2 = ni * L + j; if (region[s2] !== -1) continue; const d = Math.abs(floor[s2] - f); if (d <= STEP || (k < 4 && d <= DROP_MAX)) { region[s2] = rid; rq[tail++] = s2; } }
          if (k < 4 && c === 0) { // drop across a blocked ring (container edge): 2 cells out, cardinal
            const mx = x + DX[k] * 2, mz = z + DZ[k] * 2; if (mx < 0 || mz < 0 || mx >= w || mz >= h) continue;
            const mi = mz * w + mx, mc = nl[mi];
            for (let j = 0; j < mc; j++) { const s2 = mi * L + j; if (region[s2] !== -1) continue; const d = Math.abs(floor[s2] - f); if (d <= DROP_MAX) { region[s2] = rid; rq[tail++] = s2; } }
          }
        }
      }
      rid++;
    }
    this.regionCount = rid;
    this.colliderCount = (ctx.colliders || []).length;
    this.buildMs = performance.now() - t0; this.builds++;
    this.levels = this.countLevels();
  }

  countLevels() { const set = new Set(); const f = this.floor, nl = this.nl; for (let i = 0; i < this.n; i++) for (let j = 0; j < nl[i]; j++) set.add(Math.round(f[i * L + j] * 2) / 2); return set.size; }

  maybeRebuild() { const c = this.ctx.colliders?.length ?? 0; if (c !== this.colliderCount) { this.build(); return true; } return false; }

  debugStats() { return { cell: this.cell, w: this.w, h: this.h, cells: this.n, walkable: this.walkableCount, multiLayerCells: this.multiCount, levels: this.levels, regions: this.regionCount, solids: this.solids.length, buildMs: +this.buildMs.toFixed(1), builds: this.builds }; }

  // ---- cell helpers ----
  cx(x) { return Math.floor((x - this.minX) / this.cell); }
  cz(z) { return Math.floor((z - this.minZ) / this.cell); }
  wx(cx) { return this.minX + (cx + 0.5) * this.cell; }
  wz(cz) { return this.minZ + (cz + 0.5) * this.cell; }
  inGrid(cx, cz) { return cx >= 0 && cz >= 0 && cx < this.w && cz < this.h; }
  /** any floor in this cell */
  walkable(cx, cz) { return this.inGrid(cx, cz) && this.nl[cz * this.w + cx] > 0; }
  /** layer index in cell i whose floor is within tol of f, else -1 */
  layerNear(i, f, tol = STEP) { const c = this.nl[i], o = i * L; let best = -1, bd = tol + 1e-6; for (let j = 0; j < c; j++) { const d = Math.abs(this.floor[o + j] - f); if (d < bd) { bd = d; best = j; } } return best; }
  /** layer to stand on given a body height y: the closest floor not more than `up` above y; else the lowest */
  layerFor(i, y, up = 0.6) { const c = this.nl[i], o = i * L; if (!c) return -1; let best = -1, bd = 1e9; for (let j = 0; j < c; j++) { const f = this.floor[o + j]; if (f > y + up) continue; const d = Math.abs(f - y); if (d < bd) { bd = d; best = j; } } return best === -1 ? 0 : best; }
  isFree(x, z, y) { const cx = this.cx(x), cz = this.cz(z); if (!this.inGrid(cx, cz)) return false; const i = cz * this.w + cx; if (!this.nl[i]) return false; return y === undefined ? true : this.layerNear(i, y, 1.0) >= 0; }
  /** Floor height at (x,z). With y: the layer the body at y stands on; without: the lowest layer. Falls back to groundHeight when the cell has no floor. */
  floorAt(x, z, y) {
    const cx = this.cx(x), cz = this.cz(z); if (!this.inGrid(cx, cz)) return this.groundY(x, z);
    const i = cz * this.w + cx; if (!this.nl[i]) return y === undefined ? this.groundY(x, z) : this.floorNearby(x, z, y);
    const j = y === undefined ? 0 : this.layerFor(i, y); return this.floor[i * L + j];
  }
  /** cell without floor (e.g. inflated ring): use the nearest cell's floor near y, else ground */
  floorNearby(x, z, y) { const p = this.nearestFree(x, z, 1.5, y); return p ? p.y : Math.max(this.groundY(x, z), this.highestTopBelow(x, z, y)); }
  /** highest solid top under (x,z) at or below y+0.3 (for ragdolls, decals, dropped props) */
  highestTopBelow(x, z, y) { let best = this.groundY(x, z); for (const b of this.solids) { if (b.max.y > y + 0.3 || b.max.y <= best) continue; if (x < b.min.x || x > b.max.x || z < b.min.z || z > b.max.z) continue; best = b.max.y; } return best; }
  /** support height for a free body at (x,z,y): the nav floor below it if any, else the highest collider top / ground */
  floorBelow(x, z, y) { const cx = this.cx(x), cz = this.cz(z); if (this.inGrid(cx, cz)) { const i = cz * this.w + cx, c = this.nl[i]; let best = -Infinity; for (let j = 0; j < c; j++) { const f = this.floor[i * L + j]; if (f <= y + 0.3 && f > best) best = f; } if (best > -Infinity) return best; } return this.highestTopBelow(x, z, y); }
  regionAt(x, z, y) { const cx = this.cx(x), cz = this.cz(z); if (!this.inGrid(cx, cz)) return -1; const i = cz * this.w + cx; if (!this.nl[i]) return -1; return this.region[i * L + this.layerFor(i, y ?? this.floor[i * L])]; }
  sameRegion(a, b) { const ra = this.regionAt(a.x, a.z, a.y), rb = this.regionAt(b.x, b.z, b.y); return ra !== -1 && ra === rb; }

  /** nearest node (cell+layer) to (x,z,y): spiral search scoring ring distance + height mismatch. Returns {i,j} or null. */
  nearestNode(x, z, y, maxR = 8) {
    const cx = this.cx(x), cz = this.cz(z); const rMax = Math.ceil(maxR / this.cell); const hasY = y !== undefined && Number.isFinite(y);
    let best = null, bs = 1e9;
    for (let r = 0; r <= rMax; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (r > 0 && Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        const nx = cx + dx, nz = cz + dz; if (!this.inGrid(nx, nz)) continue;
        const i = nz * this.w + nx, c = this.nl[i]; if (!c) continue;
        for (let j = 0; j < c; j++) { const dy = hasY ? Math.abs(this.floor[i * L + j] - y) : 0; const sc = r * this.cell + dy * 1.5; if (sc < bs) { bs = sc; best = { i, j }; } }
      }
      if (best && bs <= r * this.cell + 0.9) break; // a good height match on this ring beats anything farther out
    }
    return best;
  }
  nodePos(i, j) { const x = i % this.w, z = (i - x) / this.w; return new THREE.Vector3(this.wx(x), this.floor[i * L + j], this.wz(z)); }

  // nearest walkable position (cell center) near a height, Vector3 with y = floor, or null
  nearestFree(x, z, maxR = 8, y) {
    const cx = this.cx(x), cz = this.cz(z);
    if (this.inGrid(cx, cz)) { const i = cz * this.w + cx; if (this.nl[i]) { const j = y === undefined ? 0 : this.layerFor(i, y); if (y === undefined || Math.abs(this.floor[i * L + j] - y) <= 1.0) return new THREE.Vector3(x, this.floor[i * L + j], z); } }
    const nd = this.nearestNode(x, z, y, maxR); return nd ? this.nodePos(nd.i, nd.j) : null;
  }

  randomFreeNear(x, z, r, rng = Math.random, y) {
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (this.isFree(px, pz, y)) return new THREE.Vector3(px, this.floorAt(px, pz, y), pz);
    }
    return this.nearestFree(x, z, r + 2, y);
  }

  groundY(x, z) { const g = this.ctx.world?.groundHeight; if (!g) return 0; const v = g(x, z); return Number.isFinite(v) ? v : 0; }

  // supercover line walk over cells tracking the floor layer; true when every touched cell has a floor within STEP of the running floor.
  // Sets this.lineEndF to the floor at the end.
  lineFree(x0, z0, x1, z1, f0) {
    let cx = this.cx(x0), cz = this.cz(z0); const ex = this.cx(x1), ez = this.cz(z1); const w = this.w;
    if (!this.inGrid(cx, cz) || !this.inGrid(ex, ez)) return false;
    let f = f0; let j = this.layerNear(cz * w + cx, f); if (j < 0) return false; f = this.floor[(cz * w + cx) * L + j];
    const dx = Math.abs(ex - cx), dz = Math.abs(ez - cz); const sx = cx < ex ? 1 : -1, sz = cz < ez ? 1 : -1;
    let err = dx - dz; let guard = dx + dz + 2;
    const step = (nx, nz) => { if (!this.inGrid(nx, nz)) return false; const jj = this.layerNear(nz * w + nx, f); if (jj < 0) return false; f = this.floor[(nz * w + nx) * L + jj]; return true; };
    while (guard-- > 0) {
      if (cx === ex && cz === ez) { this.lineEndF = f; return true; }
      const e2 = 2 * err;
      if (e2 > -dz && e2 < dx) { // diagonal: both orthogonal neighbours must carry the floor (no corner cutting)
        const fa = f; if (!step(cx + sx, cz)) return false; f = fa; if (!step(cx, cz + sz)) return false; f = fa;
        err -= dz; err += dx; cx += sx; cz += sz; if (!step(cx, cz)) return false;
      } else if (e2 > -dz) { err -= dz; cx += sx; if (!step(cx, cz)) return false; }
      else { err += dx; cz += sz; if (!step(cx, cz)) return false; }
    }
    return false;
  }

  /** A* from world `from` to world `to` (both may carry y). Returns Vector3[] waypoints with y = floor (excluding start), `.complete`, or null. */
  findPath(from, to, opts = {}) {
    const sn = this.nearestNode(from.x, from.z, from.y, 4), gn = this.nearestNode(to.x, to.z, to.y, 6);
    if (!sn || !gn) return null;
    const w = this.w, h = this.h, nl = this.nl, floor = this.floor, g = this.g, parent = this.parent, seen = this.seen, closed = this.closed;
    if (this.stamp >= 65000) { this.stamp = 0; seen.fill(0); closed.fill(0); }
    const stamp = ++this.stamp; const heap = this.heap; heap.clear();
    const si = sn.i * L + sn.j, gi = gn.i * L + gn.j;
    const gx = gn.i % w, gz = (gn.i - gx) / w;
    const H = (ci) => { const x = ci % w, z = (ci - x) / w; const dx = Math.abs(x - gx), dz = Math.abs(z - gz); return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz); };
    g[si] = 0; parent[si] = -1; seen[si] = stamp; heap.push(si, H(sn.i));
    let best = si, bestH = H(sn.i), expanded = 0, found = false;
    const maxExpand = opts.maxExpand || MAX_EXPAND;
    while (heap.size) {
      const s = heap.pop();
      if (closed[s] === stamp) continue;
      closed[s] = stamp;
      if (s === gi) { found = true; best = s; break; }
      if (++expanded > maxExpand) break;
      const i = (s / L) | 0; const hh = H(i); if (hh < bestH) { bestH = hh; best = s; }
      const f = floor[s]; const x = i % w, z = (i - x) / w; const gs = g[s];
      for (let k = 0; k < 8; k++) {
        const nx = x + DX[k], nz = z + DZ[k]; if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
        const ni = nz * w + nx; const c = nl[ni];
        const diag = k >= 4;
        if (diag && (this.layerNear(z * w + nx, f) < 0 || this.layerNear(nz * w + x, f) < 0)) continue;
        let walked = false;
        for (let j = 0; j < c; j++) {
          const s2 = ni * L + j; if (closed[s2] === stamp) continue;
          const d = floor[s2] - f; let cost;
          if (Math.abs(d) <= STEP) { cost = diag ? Math.SQRT2 : 1; walked = true; }
          else if (!diag && d < 0 && -d <= DROP_MAX) cost = 1 + 2 + -d * 0.5; // hop down: penalised so it's a shortcut, not a habit
          else continue;
          const ng = gs + cost;
          if (seen[s2] !== stamp || ng < g[s2]) { seen[s2] = stamp; g[s2] = ng; parent[s2] = s; heap.push(s2, ng + H(ni) * 1.001); }
        }
        if (!diag && c === 0 && !walked) { // drop over a blocked ring (e.g. a container edge): 2 cells out
          const mx = x + DX[k] * 2, mz = z + DZ[k] * 2; if (mx < 0 || mz < 0 || mx >= w || mz >= h) continue;
          const mi = mz * w + mx, mc = nl[mi];
          for (let j = 0; j < mc; j++) { const s2 = mi * L + j; if (closed[s2] === stamp) continue; const d = floor[s2] - f; if (d >= -STEP || -d > DROP_MAX) continue; const ng = gs + 2 + 3 + -d * 0.5; if (seen[s2] !== stamp || ng < g[s2]) { seen[s2] = stamp; g[s2] = ng; parent[s2] = s; heap.push(s2, ng + H(mi) * 1.001); } }
        }
      }
    }
    const nodes = []; let c = best; let guard = 200000;
    while (c !== -1 && guard-- > 0) { nodes.push(c); c = parent[c]; }
    nodes.reverse();
    if (nodes.length <= 1 && !found) return null;
    const pts = nodes.map(s => { const i = (s / L) | 0; const x = i % w, z = (i - x) / w; const p = new THREE.Vector3(this.wx(x), floor[s], this.wz(z)); return p; });
    if (found) { const last = pts[pts.length - 1]; const gp = this.nearestFree(to.x, to.z, 0.01, last.y); if (gp && Math.abs(gp.y - last.y) < 0.6 && Math.hypot(gp.x - last.x, gp.z - last.z) < this.cell) { last.x = gp.x; last.z = gp.z; } }
    pts[0].set(from.x, pts[0].y, from.z);
    const out = this.smooth(pts);
    out.complete = found;
    return out;
  }

  // string pulling per level-continuous segment (drops stay as explicit waypoints)
  smooth(pts) {
    if (pts.length <= 2) return pts.slice(1);
    const out = []; let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      // never skip across a drop: limit j to the last point before the next drop edge
      let lim = i + 1; while (lim < pts.length - 1 && Math.abs(pts[lim + 1].y - pts[lim].y) <= STEP) lim++;
      if (j > lim) j = lim;
      while (j > i + 1 && !this.lineFree(pts[i].x, pts[i].z, pts[j].x, pts[j].z, pts[i].y)) j--;
      out.push(pts[j]); i = j;
      if (i < pts.length - 1 && Math.abs(pts[i + 1].y - pts[i].y) > STEP) { out.push(pts[i + 1]); i++; } // the drop target
    }
    return out;
  }

  // Push a circle (XZ) at body height pos.y out of solids that span the standing volume. Mutates pos. Returns true when it hit something.
  resolveCircle(pos, radius, y0 = STEP_BLOCK, y1 = 1.5) {
    let hit = false;
    for (const box of this.solids) {
      if (box.max.y < pos.y + y0 || box.min.y > pos.y + y1) continue;
      if (pos.x < box.min.x - radius || pos.x > box.max.x + radius || pos.z < box.min.z - radius || pos.z > box.max.z + radius) continue;
      const cx = Math.max(box.min.x, Math.min(pos.x, box.max.x)), cz = Math.max(box.min.z, Math.min(pos.z, box.max.z));
      let dx = pos.x - cx, dz = pos.z - cz; const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      hit = true;
      if (d2 < 1e-8) { // inside: push out along smallest penetration axis
        const px = Math.min(pos.x - box.min.x, box.max.x - pos.x), pz = Math.min(pos.z - box.min.z, box.max.z - pos.z);
        if (px < pz) pos.x += (pos.x - (box.min.x + box.max.x) / 2 > 0 ? 1 : -1) * (px + radius); else pos.z += (pos.z - (box.min.z + box.max.z) / 2 > 0 ? 1 : -1) * (pz + radius);
      } else { const d = Math.sqrt(d2); const push = radius - d; pos.x += dx / d * push; pos.z += dz / d * push; }
    }
    const m = this.cell * 1.5;
    pos.x = Math.max(this.minX + m, Math.min(this.minX + this.w * this.cell - m, pos.x));
    pos.z = Math.max(this.minZ + m, Math.min(this.minZ + this.h * this.cell - m, pos.z));
    return hit;
  }

  // Segment vs solids (XZ, at a given height) — cheap "can I walk straight there" test independent of grid inflation
  segmentBlocked(a, b, y = 1.0) {
    for (const box of this.solids) {
      if (box.max.y < y || box.min.y > y) continue;
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

// Cover points fallback: side midpoints + corners of tall enough colliders, offset outward, on whatever floor is there.
export function generateCover(ctx, nav) {
  const out = [];
  for (const box of ctx.colliders || []) {
    if (!box || !box.min) continue;
    const h = box.max.y - box.min.y, sx = box.max.x - box.min.x, sz = box.max.z - box.min.z;
    if (h < 0.9 || Math.max(sx, sz) < 1.2 || Math.max(sx, sz) > 60) continue;
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, off = 0.7;
    const cand = [
      [box.max.x + off, cz, 1, 0], [box.min.x - off, cz, -1, 0], [cx, box.max.z + off, 0, 1], [cx, box.min.z - off, 0, -1],
    ];
    if (sx > 3.5) { cand.push([box.min.x + 0.6, box.max.z + off, 0, 1], [box.max.x - 0.6, box.max.z + off, 0, 1], [box.min.x + 0.6, box.min.z - off, 0, -1], [box.max.x - 0.6, box.min.z - off, 0, -1]); }
    if (sz > 3.5) { cand.push([box.max.x + off, box.min.z + 0.6, 1, 0], [box.max.x + off, box.max.z - 0.6, 1, 0], [box.min.x - off, box.min.z + 0.6, -1, 0], [box.min.x - off, box.max.z - 0.6, -1, 0]); }
    for (const [x, z, nx, nz] of cand) {
      if (!nav.isFree(x, z, box.min.y)) continue;
      const y = nav.floorAt(x, z, box.min.y); if (box.max.y - y < 0.9) continue;
      out.push({ position: new THREE.Vector3(x, y, z), normal: new THREE.Vector3(nx, 0, nz), height: box.max.y - y });
    }
  }
  return out;
}
