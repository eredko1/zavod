// TERMINAL kit: merged-geometry buckets per material, world-space UVs, arches, lathes, stairs, colliders. TERMINAL agent.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _v = new THREE.Vector3(), _n = new THREE.Vector3();

/** Re-project UVs from world-space positions (planar per dominant normal axis) so tiling textures are seamless across merged parts. */
export function worldUV(geo, scale = 1, { rot = 0 } = {}) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  if (!nor) geo.computeVertexNormals();
  const n = pos.count; const uv = new Float32Array(n * 2);
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    _v.fromBufferAttribute(pos, i); _n.fromBufferAttribute(geo.attributes.normal, i);
    const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
    let u, v;
    if (ay >= ax && ay >= az) { u = _v.x; v = _v.z; } else if (ax >= az) { u = _v.z; v = _v.y; } else { u = _v.x; v = _v.y; }
    uv[i * 2] = (u * c - v * s) * scale; uv[i * 2 + 1] = (u * s + v * c) * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** Collects geometries per material; flush() → one Mesh per material registered as raycast target. */
export class Bucket {
  constructor(world) { this.world = world; this.parts = new Map(); }
  add(mat, geo, matrix = null, { uvScale = null, uvRot = 0 } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (matrix) g.applyMatrix4(matrix);
    if (uvScale != null) worldUV(g, uvScale, { rot: uvRot });
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
    return g;
  }
  /** Axis-aligned box from min→max corners. surface/collide optional. */
  box(mat, min, max, { uvScale = 0.5, collide = false, surface = null, uvRot = 0 } = {}) {
    const w = max[0] - min[0], h = max[1] - min[1], d = max[2] - min[2];
    if (w <= 0 || h <= 0 || d <= 0) return null;
    const geo = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Matrix4().makeTranslation((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    this.add(mat, geo, m, { uvScale, uvRot });
    if (collide) this.world.box(min, max);
    return geo;
  }
  flush(surfaceOf = () => 'concrete', { shadow = true, name = 'term' } = {}) {
    const meshes = [];
    for (const [mat, geos] of this.parts) {
      if (!geos.length) continue;
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere(); merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `${name}:${mat.name || 'mat'}`;
      mesh.castShadow = shadow && mat.userData.castShadow !== false; mesh.receiveShadow = shadow;
      this.world.scene.add(mesh);
      this.world.solid(mesh, surfaceOf(mat), { collide: false, shadow: false });
      mesh.castShadow = shadow && mat.userData.castShadow !== false; mesh.receiveShadow = shadow;
      meshes.push(mesh);
    }
    this.parts.clear();
    return meshes;
  }
}

/** Round-arched opening shape (rect + semicircle top), centered at x=0, base y=0. w = width, h = total height to apex. */
export function archShape(w, h, { segs = 24, flat = false } = {}) {
  const s = new THREE.Shape(); const r = w / 2; const yc = flat ? h : h - r;
  s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, yc);
  if (!flat) s.absarc(0, yc, r, 0, Math.PI, false);
  else s.lineTo(-r, yc);
  s.lineTo(-r, 0); s.closePath();
  return s;
}
export function archPath(w, h, { segs = 24 } = {}) { const p = new THREE.Path(); const r = w / 2; const yc = h - r; p.moveTo(-r, 0); p.lineTo(r, 0); p.lineTo(r, yc); p.absarc(0, yc, r, 0, Math.PI, false); p.lineTo(-r, 0); p.closePath(); return p; }

/** Rectangle shape (x0,y0)-(x1,y1) */
export function rectShape(x0, y0, x1, y1) { const s = new THREE.Shape(); s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.closePath(); return s; }
export function rectPath(x0, y0, x1, y1) { const s = new THREE.Path(); s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.closePath(); return s; }

/**
 * A wall panel in the XY plane extruded along +Z by depth, with holes. shape coords: x along wall, y up.
 * Returns geometry in local space (x, y, z∈[0,depth]); apply a matrix to place it.
 */
export function wallGeo(shape, holes, depth, { curveSegments = 24 } = {}) {
  for (const h of holes) shape.holes.push(h);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments });
  return g;
}

/** Matrix placing a local-XY panel (extruded along +Z) as a wall: origin at (x,y,z), yaw around Y (0 = faces +z). */
export function placeXY(x, y, z, yaw = 0) { return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1)); }
export function mat4(x, y, z, rx = 0, ry = 0, rz = 0, s = 1) { return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s)); }

/** Lathe profile [[r,y],...] → geometry */
export function lathe(profile, segs = 24) { return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs); }

/** Balustrade: top rail + bottom rail boxes and instanced balusters (returned as [geoRail, balusterMatrices]). from→to horizontal, height h. */
export function balustrade(bucket, matStone, matBal, from, to, { h = 1.1, y = 0, railT = 0.14, spacing = 0.32, instBal = null } = {}) {
  const dx = to[0] - from[0], dz = to[1] - from[1]; const L = Math.hypot(dx, dz); const yaw = Math.atan2(dx, dz);
  const cx = (from[0] + to[0]) / 2, cz = (from[1] + to[1]) / 2;
  // rails (stone)
  const top = new THREE.BoxGeometry(0.22, railT, L + 0.1); bucket.add(matStone, top, mat4(cx, y + h - railT / 2, cz, 0, yaw), { uvScale: 0.5 });
  const bot = new THREE.BoxGeometry(0.2, 0.12, L + 0.1); bucket.add(matStone, bot, mat4(cx, y + 0.06, cz, 0, yaw), { uvScale: 0.5 });
  // balusters
  const n = Math.max(1, Math.floor(L / spacing));
  const step = L / n;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n; const px = from[0] + dx * t, pz = from[1] + dz * t;
    if (instBal) instBal.push(mat4(px, y + 0.12, pz, 0, yaw));
    else bucket.add(matBal, new THREE.CylinderGeometry(0.045, 0.06, h - 0.26, 8), mat4(px, y + 0.12 + (h - 0.26) / 2, pz), { uvScale: 1 });
  }
  return { L, yaw };
}

/** Instanced mesh from one geometry + matrices; registers as raycast target (no colliders). */
export function instanced(world, geo, mat, matrices, surface = 'metal', { shadow = true, name = 'inst', collide = null } = {}) {
  if (!matrices.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, matrices.length);
  for (let i = 0; i < matrices.length; i++) im.setMatrixAt(i, matrices[i]);
  im.instanceMatrix.needsUpdate = true; im.castShadow = shadow; im.receiveShadow = shadow; im.name = name;
  im.userData.surface = surface; im.frustumCulled = true; im.computeBoundingSphere?.();
  world.scene.add(im); world.ctx.raycastTargets.push(im);
  if (collide) { const b = new THREE.Box3(); for (const m of matrices) { b.copy(collide).applyMatrix4(m); world.ctx.colliders.push(b.clone()); } }
  return im;
}

/** Stacked AABB stair: steps from (x0,z0) toward dir over run length with total rise; width across. Registers colliders and returns step tops for groundHeight. */
export function stairSteps(world, bucket, mat, { x, z, dir, width, run, rise, y0 = 0, n = null, depthUnder = 0.6, uvScale = 0.5 }) {
  // dir: [dx,dz] unit axis along the run
  n = n || Math.max(1, Math.round(rise / 0.18));
  const stepRun = run / n, stepRise = rise / n;
  const px = -dir[1], pz = dir[0]; // perpendicular
  const steps = [];
  for (let i = 0; i < n; i++) {
    const a0 = i * stepRun, a1 = run; // each step box extends to the end of the run (solid mass under)
    const top = y0 + (i + 1) * stepRise;
    const c0x = x + dir[0] * a0, c0z = z + dir[1] * a0, c1x = x + dir[0] * a1, c1z = z + dir[1] * a1;
    const minx = Math.min(c0x, c1x, c0x + px * width / 2, c0x - px * width / 2, c1x + px * width / 2, c1x - px * width / 2);
    const maxx = Math.max(c0x, c1x, c0x + px * width / 2, c0x - px * width / 2, c1x + px * width / 2, c1x - px * width / 2);
    const minz = Math.min(c0z, c1z, c0z + pz * width / 2, c0z - pz * width / 2, c1z + pz * width / 2, c1z - pz * width / 2);
    const maxz = Math.max(c0z, c1z, c0z + pz * width / 2, c0z - pz * width / 2, c1z + pz * width / 2, c1z - pz * width / 2);
    const bottom = i === 0 ? y0 - depthUnder : y0 + i * stepRise - 0.001;
    bucket.box(mat, [minx, bottom, minz], [maxx, top, maxz], { uvScale });
    world.box([minx, bottom, minz], [maxx, top, maxz]);
    steps.push({ a0, a1: a0 + stepRun, top });
  }
  return { steps, stepRun, stepRise, n };
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
