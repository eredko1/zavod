// Player collision helpers. Owned by: PLAYER agent.
// Vertical capsule (feet at pos, radius r, height h) vs world-space AABBs (ctx.colliders) with a
// uniform-grid broadphase, iterative separate-axis resolution, CoD-style auto step-up and flat-bottom support.
import * as THREE from 'three';

const _q = new THREE.Vector3();

/** Uniform grid over the XZ plane. Rebuilds itself when the source array changes length. */
export class ColliderGrid {
  constructor(cell = 4) { this.cell = cell; this.map = new Map(); this.entries = []; this.src = null; this.n = -1; this.stamp = 1; this.out = []; }
  _key(ix, iz) { return (ix + 32768) * 65536 + (iz + 32768); }
  build(boxes) {
    this.map.clear(); this.entries.length = 0; this.src = boxes; this.n = boxes.length;
    const c = this.cell;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]; if (!b || !b.min || !b.max || b.isEmpty()) continue;
      const e = { box: b, stamp: 0 }; this.entries.push(e);
      const x0 = Math.floor(b.min.x / c), x1 = Math.floor(b.max.x / c), z0 = Math.floor(b.min.z / c), z1 = Math.floor(b.max.z / c);
      // huge boxes (ground slabs) go to a catch-all bucket instead of thousands of cells
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 400) { (this.map.get('big') || this.map.set('big', []).get('big')).push(e); continue; }
      for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
        const k = this._key(ix, iz); let l = this.map.get(k); if (!l) { l = []; this.map.set(k, l); } l.push(e);
      }
    }
  }
  sync(boxes) { if (boxes !== this.src || boxes.length !== this.n) this.build(boxes); }
  /** All boxes whose cells overlap [minX,maxX]×[minZ,maxZ]. Returned array is reused. */
  query(minX, minZ, maxX, maxZ) {
    const out = this.out; out.length = 0; const s = ++this.stamp, c = this.cell;
    const x0 = Math.floor(minX / c), x1 = Math.floor(maxX / c), z0 = Math.floor(minZ / c), z1 = Math.floor(maxZ / c);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const l = this.map.get(this._key(ix, iz)); if (!l) continue;
      for (let i = 0; i < l.length; i++) { const e = l[i]; if (e.stamp !== s) { e.stamp = s; out.push(e.box); } }
    }
    const big = this.map.get('big'); if (big) for (const e of big) { if (e.stamp !== s) { e.stamp = s; out.push(e.box); } }
    return out;
  }
}

/** True if a capsule at pos (feet) with height h overlaps any box (optionally ignoring one). */
export function capsuleOverlaps(grid, pos, r, h, ignore = null, skin = 0.001) {
  const boxes = grid.query(pos.x - r, pos.z - r, pos.x + r, pos.z + r);
  const ay = pos.y + r, by = pos.y + h - r;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]; if (b === ignore) continue;
    if (b.min.y >= pos.y + h - skin || b.max.y <= pos.y + skin) continue;
    const qy = ay > b.max.y ? ay : by < b.min.y ? by : Math.max(ay, Math.min(by, b.min.y));
    const cx = Math.max(b.min.x, Math.min(b.max.x, pos.x)), cz = Math.max(b.min.z, Math.min(b.max.z, pos.z)), cy = Math.max(b.min.y, Math.min(b.max.y, qy));
    const dx = pos.x - cx, dy = qy - cy, dz = pos.z - cz;
    if (dx * dx + dy * dy + dz * dz < (r - skin) * (r - skin)) return true;
  }
  return false;
}

/**
 * Resolve the capsule out of all overlapping AABBs (3–4 passes). Mutates pos and vel.
 * opts: { grounded (bool, allows step-up), step (max step height), groundY (floor height here), wishX, wishZ (move intent) }
 * Returns info { ground, ceiling, blocked (Box3|null), blockedNX, blockedNZ, stepped (m), landedVy }.
 */
export function resolveCapsule(grid, pos, r, h, vel, opts, info) {
  info.ground = false; info.ceiling = false; info.blocked = null; info.blockedNX = 0; info.blockedNZ = 0; info.stepped = 0; info.landedVy = 0;
  const step = opts.step ?? 0.45, supportR = r * 0.6;
  // floor
  if (pos.y < opts.groundY) { if (vel.y < 0) info.landedVy = Math.min(info.landedVy, vel.y); pos.y = opts.groundY; if (vel.y < 0) vel.y = 0; info.ground = true; }
  else if (pos.y <= opts.groundY + 1e-4) info.ground = true;

  for (let pass = 0; pass < 4; pass++) {
    let any = false;
    const boxes = grid.query(pos.x - r - step, pos.z - r - step, pos.x + r + step, pos.z + r + step);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.min.y >= pos.y + h || b.max.y <= pos.y) continue;                     // no vertical overlap with capsule extents
      const cx = Math.max(b.min.x, Math.min(b.max.x, pos.x)), cz = Math.max(b.min.z, Math.min(b.max.z, pos.z));
      const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;                                                  // footprint circle misses box
      const d = Math.sqrt(d2);
      const ay = pos.y + r, by = pos.y + h - r;                                   // capsule segment
      const topAbove = b.max.y - pos.y;                                           // box top relative to feet
      const upOK = topAbove > 0 && topAbove <= step + 1e-4;

      // --- flat-bottom support / landing: box top at or below the bottom sphere centre and we are mostly over it
      if (b.max.y <= ay + 1e-6 && d <= supportR) {
        if (vel.y < 0) info.landedVy = Math.min(info.landedVy, vel.y);
        if (opts.grounded && upOK && vel.y <= 0.01) info.stepped += topAbove;
        pos.y = b.max.y; if (vel.y < 0) vel.y = 0; info.ground = true; any = true; continue;
      }
      // --- CoD auto step-up: grounded, low obstacle, moving into it, headroom on top
      if (opts.grounded && upOK && vel.y <= 0.01) {
        const movingIn = d > 1e-6 ? (-(dx * opts.wishX + dz * opts.wishZ) / d > 0.2) : true;
        if (movingIn && !capsuleOverlaps(grid, _q.set(pos.x, b.max.y, pos.z), r, h, b)) { info.stepped += topAbove; pos.y = b.max.y; if (vel.y < 0) vel.y = 0; info.ground = true; any = true; continue; }
      }
      // --- general capsule vs box: closest point on segment to box y-range
      const qy = ay > b.max.y ? ay : by < b.min.y ? by : Math.max(ay, Math.min(by, b.min.y));
      const cy = Math.max(b.min.y, Math.min(b.max.y, qy));
      const dy = qy - cy;
      const dist = Math.sqrt(d2 + dy * dy);
      if (dist >= r) continue;
      any = true;
      if (dist < 1e-6) {
        // segment point inside the box: push along the axis of least penetration (capsule extents)
        const px0 = pos.x - b.min.x + r, px1 = b.max.x - pos.x + r, pz0 = pos.z - b.min.z + r, pz1 = b.max.z - pos.z + r;
        const py0 = b.max.y - pos.y, py1 = pos.y + h - b.min.y;
        const m = Math.min(px0, px1, pz0, pz1, py0, py1);
        if (m === py0) { pos.y = b.max.y; if (vel.y < 0) vel.y = 0; info.ground = true; }
        else if (m === py1) { pos.y = b.min.y - h; if (vel.y > 0) vel.y = 0; info.ceiling = true; }
        else if (m === px0) { pos.x -= px0; if (vel.x > 0) vel.x = 0; info.blocked = b; info.blockedNX = -1; info.blockedNZ = 0; }
        else if (m === px1) { pos.x += px1; if (vel.x < 0) vel.x = 0; info.blocked = b; info.blockedNX = 1; info.blockedNZ = 0; }
        else if (m === pz0) { pos.z -= pz0; if (vel.z > 0) vel.z = 0; info.blocked = b; info.blockedNX = 0; info.blockedNZ = -1; }
        else { pos.z += pz1; if (vel.z < 0) vel.z = 0; info.blocked = b; info.blockedNX = 0; info.blockedNZ = 1; }
        continue;
      }
      let nx = dx / dist, ny = dy / dist, nz = dz / dist, pen = r - dist;
      // grounded: ceiling-edge contacts act as walls (no jitter into the floor);
      // airborne: top-edge contacts act as walls so air-strafing can't "ledge-slip" up onto boxes (mantle handles that)
      if ((opts.grounded ? ny < -0.05 : ny > 0.05) && d > 1e-6) { nx = dx / d; nz = dz / d; ny = 0; pen = r - d; }
      pos.x += nx * pen; pos.y += ny * pen; pos.z += nz * pen;
      const vn = vel.x * nx + vel.y * ny + vel.z * nz;
      if (vn < 0) { vel.x -= vn * nx; vel.y -= vn * ny; vel.z -= vn * nz; }
      if (ny > 0.7) info.ground = true; else if (ny < -0.7) info.ceiling = true;
      else { info.blocked = b; info.blockedNX = nx; info.blockedNZ = nz; }
      if (pos.y < opts.groundY) { pos.y = opts.groundY; if (vel.y < 0) vel.y = 0; info.ground = true; }
    }
    if (!any) break;
  }
  return info;
}

/**
 * Highest support surface (box top or ground) under the feet within `depth` below pos.y.
 * Returns the surface height or -Infinity.
 */
export function supportBelow(grid, pos, r, depth, groundY) {
  let best = groundY <= pos.y + 1e-4 && groundY >= pos.y - depth ? groundY : -Infinity;
  const supportR = r * 0.6;
  const boxes = grid.query(pos.x - r, pos.z - r, pos.x + r, pos.z + r);
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.max.y > pos.y + 1e-4 || b.max.y < pos.y - depth || b.max.y <= best) continue;
    const cx = Math.max(b.min.x, Math.min(b.max.x, pos.x)), cz = Math.max(b.min.z, Math.min(b.max.z, pos.z));
    const dx = pos.x - cx, dz = pos.z - cz;
    if (dx * dx + dz * dz <= supportR * supportR) best = b.max.y;
  }
  return best;
}
