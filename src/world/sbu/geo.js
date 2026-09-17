// SBU geometry batching: world-space UVs, one merged Mesh per material, AABB/stair helpers, extruded polygons. SBU agent.
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';

const _n = new THREE.Vector3();

/** Rewrite UVs from world positions by dominant normal axis so one texture tiles seamlessly across merged geometry. scale = 1 / metres-per-tile. */
export function worldUV(geo, scale = 0.5, offset = 0) {
  const pos = geo.attributes.position;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const n2 = geo.attributes.normal;
  let uv = geo.attributes.uv;
  if (!uv || uv.count !== pos.count) { uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2); geo.setAttribute('uv', uv); }
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    _n.set(Math.abs(n2.getX(i)), Math.abs(n2.getY(i)), Math.abs(n2.getZ(i)));
    if (_n.y >= _n.x && _n.y >= _n.z) uv.setXY(i, (x + offset) * scale, (z + offset) * scale);
    else if (_n.x >= _n.z) uv.setXY(i, (z + offset) * scale, (y + offset) * scale);
    else uv.setXY(i, (x + offset) * scale, (y + offset) * scale);
  }
  uv.needsUpdate = true;
  return geo;
}

/** BoxGeometry spanning [min,max] (world space). */
export function boxGeo(min, max) {
  const g = new THREE.BoxGeometry(Math.max(0.001, max[0] - min[0]), Math.max(0.001, max[1] - min[1]), Math.max(0.001, max[2] - min[2]));
  g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  return g;
}

/** Extruded polygon (points [[x,z],...] in world XZ) from y0 to y1. */
export function prismGeo(pts, y0, y1) {
  const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], -p[1])));
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); g.translate(0, y0, 0);
  return g;
}

/** Flat polygon (XZ) at height y. */
export function polyGeo(pts, y) {
  const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], -p[1])));
  const g = new THREE.ShapeGeometry(shape, 1);
  g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
  return g;
}

/** Circle polygon points. */
export function circlePts(cx, cz, r, n = 48, a0 = 0, a1 = Math.PI * 2) {
  const pts = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  if (a1 - a0 >= Math.PI * 2 - 1e-6) pts.pop();
  return pts;
}

/**
 * Collects geometry per material key and flushes one merged Mesh per material.
 */
export class Batch {
  constructor(world, M, name = 'sbu') {
    this.world = world; this.M = M; this.name = name; this.lists = new Map(); this.meshes = [];
  }
  add(key, geo, { uvScale = null, uv = true } = {}) {
    if (!this.M[key]) { console.warn('[sbu] unknown material', key); key = 'concrete'; }
    if (uv) worldUV(geo, uvScale ?? (this.M.uvScale?.[key] ?? 0.5));
    if (geo.index) geo = geo.toNonIndexed();
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    (this.lists.get(key) || this.lists.set(key, []).get(key)).push(geo);
    return geo;
  }
  box(key, min, max, { collide = true, walkable = false, uvScale = null, uv = true } = {}) {
    const g = this.add(key, boxGeo(min, max), { uvScale, uv });
    if (walkable) this.world.walkable(min, max);
    else if (collide) this.world.box(min, max);
    return g;
  }
  prism(key, pts, y0, y1, { collide = true, uvScale = null } = {}) {
    const g = this.add(key, prismGeo(pts, y0, y1), { uvScale });
    if (collide) { const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]); this.world.box([Math.min(...xs), y0, Math.min(...zs)], [Math.max(...xs), y1, Math.max(...zs)]); }
    return g;
  }
  poly(key, pts, y, { uvScale = null } = {}) { return this.add(key, polyGeo(pts, y), { uvScale }); }
  /** Stair: n steps rising `rise` over `run` along axis ('x'|'z', signed dir) starting at (x,z), width across. Stacked AABB steps. */
  stairs(key, { x, z, y0 = 0, rise, run, width, axis = 'z', dir = 1, n = null, walkable = true, base = null }) {
    n = n || Math.max(2, Math.ceil(rise / 0.3));
    const sh = rise / n, sl = run / n;
    for (let i = 0; i < n; i++) {
      const a0 = (axis === 'z' ? z : x) + dir * sl * i, a1 = a0 + dir * sl;
      const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
      const top = y0 + sh * (i + 1), bottom = base ?? y0;
      const min = axis === 'z' ? [x - width / 2, bottom, lo] : [lo, bottom, z - width / 2];
      const max = axis === 'z' ? [x + width / 2, top, hi] : [hi, top, z + width / 2];
      this.box(key, min, max, { walkable });
    }
    return { top: y0 + rise };
  }
  cyl(key, x, z, y0, y1, r, seg = 16, { collide = false, r0 = null } = {}) {
    const g = new THREE.CylinderGeometry(r, r0 ?? r, y1 - y0, seg); g.translate(x, (y0 + y1) / 2, z);
    this.add(key, g);
    if (collide) this.world.box([x - r, y0, z - r], [x + r, y1, z + r]);
    return g;
  }
  hcyl(key, axis, a0, a1, c, y, r, seg = 20) {
    const g = new THREE.CylinderGeometry(r, r, Math.abs(a1 - a0), seg);
    if (axis === 'z') g.rotateX(Math.PI / 2); else g.rotateZ(Math.PI / 2);
    const mid = (a0 + a1) / 2; g.translate(axis === 'z' ? c : mid, y, axis === 'z' ? mid : c);
    this.add(key, g);
    return g;
  }
  flush({ shadow = true, receive = true } = {}) {
    const { scene, ctx } = this.world;
    for (const [key, list] of this.lists) {
      if (!list.length) continue;
      const merged = BGU.mergeGeometries(list, false);
      if (!merged) { console.warn('[sbu] merge failed for', key); continue; }
      merged.computeBoundingSphere(); merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, this.M[key]);
      mesh.name = `${this.name}:${key}`; mesh.castShadow = shadow && !(this.M.noShadow?.[key]); mesh.receiveShadow = receive;
      mesh.userData.surface = this.M.surface[key] || 'concrete';
      scene.add(mesh); ctx.raycastTargets.push(mesh); this.meshes.push(mesh);
      for (const g of list) g.dispose();
    }
    this.lists.clear();
    return this.meshes;
  }
}
