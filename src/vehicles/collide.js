// Vehicle collision helpers: XZ uniform-grid broadphase over ctx.colliders + circle-vs-AABB resolution. Owned by: VEHICLES agent.
export class BoxGrid {
  constructor(cell = 4) { this.cell = cell; this.map = new Map(); this.src = null; this.n = -1; this.stamp = 1; this.out = []; this.entries = []; }
  key(ix, iz) { return (ix + 32768) * 65536 + (iz + 32768); }
  build(boxes) {
    this.map.clear(); this.entries.length = 0; this.src = boxes; this.n = boxes.length; const c = this.cell;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]; if (!b || !b.min || b.isEmpty()) continue;
      const e = { box: b, stamp: 0 }; this.entries.push(e);
      const x0 = Math.floor(b.min.x / c), x1 = Math.floor(b.max.x / c), z0 = Math.floor(b.min.z / c), z1 = Math.floor(b.max.z / c);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 400) { (this.map.get('big') || this.map.set('big', []).get('big')).push(e); continue; }
      for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) { const k = this.key(ix, iz); let l = this.map.get(k); if (!l) { l = []; this.map.set(k, l); } l.push(e); }
    }
  }
  sync(boxes) { if (boxes !== this.src || boxes.length !== this.n) this.build(boxes); }
  query(minX, minZ, maxX, maxZ) {
    const out = this.out; out.length = 0; const s = ++this.stamp, c = this.cell;
    const x0 = Math.floor(minX / c), x1 = Math.floor(maxX / c), z0 = Math.floor(minZ / c), z1 = Math.floor(maxZ / c);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) { const l = this.map.get(this.key(ix, iz)); if (!l) continue; for (let i = 0; i < l.length; i++) { const e = l[i]; if (e.stamp !== s) { e.stamp = s; out.push(e.box); } } }
    const big = this.map.get('big'); if (big) for (const e of big) if (e.stamp !== s) { e.stamp = s; out.push(e.box); }
    return out;
  }
}

/**
 * Push a vertical circle (x,z,r) between heights y0..y1 out of overlapping boxes (ignoring `skip` and boxes that don't span the height band).
 * Writes {x,z,nx,nz,depth,hit} into res. Returns true if a hit occurred (nx,nz = normal of the deepest push).
 */
export function resolveCircle(grid, x, z, r, y0, y1, skip, res) {
  res.hit = false; res.nx = 0; res.nz = 0; res.depth = 0; res.x = x; res.z = z;
  for (let pass = 0; pass < 3; pass++) {
    const boxes = grid.query(res.x - r, res.z - r, res.x + r, res.z + r); let any = false;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]; if (b === skip) continue;
      if (b.max.y <= y0 || b.min.y >= y1) continue;
      const cx = Math.max(b.min.x, Math.min(b.max.x, res.x)), cz = Math.max(b.min.z, Math.min(b.max.z, res.z));
      let dx = res.x - cx, dz = res.z - cz; const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      let nx, nz, depth;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; depth = r - d; }
      else { // centre inside the box: push out through the nearest face
        const px = Math.min(res.x - b.min.x, b.max.x - res.x), pz = Math.min(res.z - b.min.z, b.max.z - res.z);
        if (px < pz) { nx = (res.x - b.min.x < b.max.x - res.x) ? -1 : 1; nz = 0; depth = px + r; } else { nz = (res.z - b.min.z < b.max.z - res.z) ? -1 : 1; nx = 0; depth = pz + r; }
      }
      res.x += nx * depth; res.z += nz * depth; any = true; res.hit = true;
      if (depth > res.depth) { res.depth = depth; res.nx = nx; res.nz = nz; }
    }
    if (!any) break;
  }
  return res.hit;
}

/** True if any box (other than skip) overlaps the XZ rect within the height band. */
export function rectBlocked(grid, minX, minZ, maxX, maxZ, y0, y1, skip = null) {
  const boxes = grid.query(minX, minZ, maxX, maxZ);
  for (let i = 0; i < boxes.length; i++) { const b = boxes[i]; if (b === skip) continue; if (b.max.y <= y0 || b.min.y >= y1) continue; if (b.max.x > minX && b.min.x < maxX && b.max.z > minZ && b.min.z < maxZ) return true; }
  return false;
}
