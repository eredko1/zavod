// RAILYARD geometry batching: world-space UVs, merged static meshes per material, AABB/step/ramp collider helpers. RAILYARD agent.
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';

const _n = new THREE.Vector3();

/** Rewrite UVs from world positions by dominant normal axis (tri-planar-ish) so one texture tiles seamlessly across merged geometry. scale = 1 / metres-per-tile. */
export function worldUV(geo, scale = 0.5, offset = 0) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  if (!nor) geo.computeVertexNormals();
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

/** Scale a CylinderGeometry's native UVs to metres (u around circumference, v along height). */
export function scaleCylUV(g, r, h, scale) {
  const uv = g.attributes.uv; const cu = 2 * Math.PI * r * scale, cv = h * scale;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * cu, uv.getY(i) * cv);
  return g;
}

/**
 * Box [min,max] whose top (and optionally bottom) surface is sloped along `axis`: y_top goes topA0 → topA1 from min[axis] to max[axis].
 * Used for ramps, embankment retaining walls and sloped parapets. Normals recomputed.
 */
export function slopedBox(min, max, axis, { topA0, topA1, botA0 = null, botA1 = null }) {
  const g = new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]).toNonIndexed();
  g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  const pos = g.attributes.position; const ai = axis === 'x' ? 0 : 2; const a0 = min[ai], a1 = max[ai]; const yMid = (min[1] + max[1]) / 2;
  for (let i = 0; i < pos.count; i++) {
    const a = ai === 0 ? pos.getX(i) : pos.getZ(i); const t = (a - a0) / (a1 - a0);
    const y = pos.getY(i);
    if (y > yMid) pos.setY(i, topA0 + (topA1 - topA0) * t);
    else if (botA0 !== null) pos.setY(i, botA0 + (botA1 - botA0) * t);
  }
  pos.needsUpdate = true; g.computeVertexNormals();
  return g;
}

/** BoxGeometry spanning [min,max] (world space). */
export function boxGeo(min, max) {
  const g = new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  return g;
}

/**
 * Collects geometry per material and flushes one merged Mesh per material.
 * Colliders are registered directly (AABBs) when adding boxes.
 */
export class Batch {
  constructor(world, M, name = 'batch') {
    this.world = world; this.M = M; this.name = name; this.lists = new Map(); this.meshes = [];
    this.opts = new Map(); // matKey → { shadow, uvScale }
  }
  /** Add an arbitrary (already world-positioned) geometry under a material key. */
  add(key, geo, { uvScale = 0.5, uv = true } = {}) {
    if (!this.M[key]) { console.warn('[railyard] unknown material', key); key = 'steel'; }
    if (uv) worldUV(geo, uvScale);
    if (geo.index) geo = geo.toNonIndexed();
    // strip attributes other than position/normal/uv so merge never fails
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    (this.lists.get(key) || this.lists.set(key, []).get(key)).push(geo);
    return geo;
  }
  /** Axis-aligned box [min,max] with optional collider / walkable registration. */
  box(key, min, max, { collide = true, walkable = false, uvScale = 0.5, uv = true } = {}) {
    const g = this.add(key, boxGeo(min, max), { uvScale, uv });
    if (walkable) this.world.walkable(min, max);
    else if (collide) this.world.box(min, max);
    return g;
  }
  /** Stair: n steps from (start) rising to `rise` along axis ('x'|'z', signed dir), width across. Each step is a stacked AABB (rise/n ≤ 0.45). */
  stairs(key, { x, z, y0 = 0, rise, run, width, axis = 'z', dir = 1, n = null, uvScale = 0.5, walkable = true, solidBelow = true, base = null }) {
    n = n || Math.max(2, Math.ceil(rise / 0.3));
    const sh = rise / n, sl = run / n;
    for (let i = 0; i < n; i++) {
      const a0 = (axis === 'z' ? z : x) + dir * sl * i, a1 = a0 + dir * sl;
      const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
      const top = y0 + sh * (i + 1), bottom = solidBelow ? (base ?? y0) : top - sh;
      const min = axis === 'z' ? [x - width / 2, bottom, lo] : [lo, bottom, z - width / 2];
      const max = axis === 'z' ? [x + width / 2, top, hi] : [hi, top, z + width / 2];
      this.box(key, min, max, { walkable, uvScale });
    }
    return { top: y0 + rise };
  }
  /** Ramp (sloped slab) along axis from a0 (height y0) to a1 (height y1), colliders as thin steps ≤ 0.15 rise. Visual = one rotated slab. */
  ramp(key, { axis = 'z', a0, a1, c0, c1, y0, y1, thick = 0.6, step = 0.15, uvScale = 0.5, walkable = true, solidBelow = true }) {
    const len = Math.abs(a1 - a0), rise = y1 - y0, width = Math.abs(c1 - c0), cm = (c0 + c1) / 2;
    const slope = Math.atan2(rise, len) * Math.sign(a1 - a0);
    const g = new THREE.BoxGeometry(axis === 'z' ? width : Math.hypot(len, rise), thick, axis === 'z' ? Math.hypot(len, rise) : width);
    if (axis === 'z') g.rotateX(-slope); else g.rotateZ(slope);
    const mid = (a0 + a1) / 2, ym = (y0 + y1) / 2 - thick / 2;
    g.translate(axis === 'z' ? cm : mid, ym, axis === 'z' ? mid : cm);
    this.add(key, g, { uvScale });
    const n = Math.max(1, Math.ceil(Math.abs(rise) / step)); const sl = (a1 - a0) / n;
    for (let i = 0; i < n; i++) {
      const p0 = a0 + sl * i, p1 = p0 + sl; const lo = Math.min(p0, p1), hi = Math.max(p0, p1);
      const top = y0 + rise * (i + 1) / n; const bottom = solidBelow ? Math.min(y0, y1) - 0.5 : top - thick;
      const min = axis === 'z' ? [Math.min(c0, c1), bottom, lo] : [lo, bottom, Math.min(c0, c1)];
      const max = axis === 'z' ? [Math.max(c0, c1), top, hi] : [hi, top, Math.max(c0, c1)];
      if (walkable) this.world.walkable(min, max); else this.world.box(min, max);
    }
    return { heightAt: (a) => y0 + rise * (a - a0) / (a1 - a0) };
  }
  /** Cylinder (axis Y) at x,z from y0 to y1. */
  cyl(key, x, z, y0, y1, r, seg = 16, { collide = false, uvScale = 0.5 } = {}) {
    const g = new THREE.CylinderGeometry(r, r, y1 - y0, seg); scaleCylUV(g, r, y1 - y0, uvScale); g.translate(x, (y0 + y1) / 2, z);
    this.add(key, g, { uv: false });
    if (collide) this.world.box([x - r, y0, z - r], [x + r, y1, z + r]);
    return g;
  }
  /** Horizontal cylinder along axis ('x'|'z') from a0 to a1 at (c, y). */
  hcyl(key, axis, a0, a1, c, y, r, seg = 20, { collide = false, uvScale = 0.5 } = {}) {
    const g = new THREE.CylinderGeometry(r, r, Math.abs(a1 - a0), seg); scaleCylUV(g, r, Math.abs(a1 - a0), uvScale);
    if (axis === 'z') g.rotateX(Math.PI / 2); else g.rotateZ(Math.PI / 2);
    const mid = (a0 + a1) / 2; g.translate(axis === 'z' ? c : mid, y, axis === 'z' ? mid : c);
    this.add(key, g, { uv: false });
    if (collide) { const lo = Math.min(a0, a1), hi = Math.max(a0, a1); this.world.box(axis === 'z' ? [c - r, y - r, lo] : [lo, y - r, c - r], axis === 'z' ? [c + r, y + r, hi] : [hi, y + r, c + r]); }
    return g;
  }
  /** Merge and add to the scene. One Mesh per material. */
  flush({ shadow = true, receive = true, frustumCulled = true } = {}) {
    const { scene, ctx } = this.world;
    for (const [key, list] of this.lists) {
      if (!list.length) continue;
      const merged = BGU.mergeGeometries(list, false);
      if (!merged) { console.warn('[railyard] merge failed for', key); continue; }
      merged.computeBoundingSphere(); merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, this.M[key]);
      mesh.name = `${this.name}:${key}`; mesh.castShadow = shadow; mesh.receiveShadow = receive; mesh.frustumCulled = frustumCulled;
      mesh.userData.surface = this.M.surface[key] || 'metal';
      scene.add(mesh); ctx.raycastTargets.push(mesh); this.meshes.push(mesh);
      for (const g of list) g.dispose();
    }
    this.lists.clear();
    return this.meshes;
  }
}
