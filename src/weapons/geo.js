// Geometry builder helpers for the procedural viewmodels. Owned by: WEAPONS agent.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

/** Rounded box (bevelled edges). */
export function rbox(w, h, d, r = 0.002, seg = 2) {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2));
}
export function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
/** Cylinder along local Z (barrel-style) — r1 front, r2 back. */
export function cylZ(rTop, rBot, len, seg = 16, open = false) {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, seg, 1, open);
  g.rotateX(-Math.PI / 2); // +Y (rTop) -> -Z (forward)
  return g;
}
/** Cylinder along Y (default) */
export function cylY(rTop, rBot, len, seg = 16, open = false) { return new THREE.CylinderGeometry(rTop, rBot, len, seg, 1, open); }
/** Cylinder along X */
export function cylX(rTop, rBot, len, seg = 16, open = false) { const g = new THREE.CylinderGeometry(rTop, rBot, len, seg, 1, open); g.rotateZ(-Math.PI / 2); return g; }
export function torus(r, tube, rs = 8, ts = 24, arc = Math.PI * 2) { return new THREE.TorusGeometry(r, tube, rs, ts, arc); }
export function sphere(r, s = 12) { return new THREE.SphereGeometry(r, s, Math.max(6, s >> 1)); }
export function capsule(r, len, s = 6, rs = 10) { return new THREE.CapsuleGeometry(r, len, s, rs); }

/** Extrude a 2D profile (array of [x,y]) along Z by depth, centered. Optional bevel. */
export function extrude(points, depth, opts = {}) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const bevel = opts.bevel ?? 0;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: opts.bevelSegments ?? 2, steps: 1, curveSegments: opts.curveSegments ?? 8,
  });
  g.translate(0, 0, -depth / 2);
  // ExtrudeGeometry UVs are in world units — rescale so textures tile sensibly
  const uv = g.attributes.uv; const k = opts.uvScale ?? 8;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
  return g;
}
/** Extrude a Shape object (with holes) along Z */
export function extrudeShape(shape, depth, opts = {}) {
  const bevel = opts.bevel ?? 0;
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: opts.bevelSegments ?? 2, steps: 1, curveSegments: opts.curveSegments ?? 8 });
  g.translate(0, 0, -depth / 2);
  const uv = g.attributes.uv; const k = opts.uvScale ?? 8;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
  return g;
}
/** Lathe profile (array of [radius, y]) around Y */
export function lathe(profile, seg = 16) { return new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(p[0], p[1])), seg); }

/**
 * Computes an edge-wear weight per vertex into a 'color' attribute (r = wear, g = grime, b = unused).
 * For box-like parts, bevel vertices have off-axis normals → worn edges. For round parts, only the end rims wear.
 */
export function bakeWear(geom, mode = 'box', amount = 1, grime = 0.5, palm = 0) {
  const n = geom.attributes.normal, pos = geom.attributes.position;
  const count = pos.count; const col = new Float32Array(count * 3);
  geom.computeBoundingBox(); const bb = geom.boundingBox; const size = new THREE.Vector3(); bb.getSize(size);
  for (let i = 0; i < count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    let wear = 0;
    if (mode === 'box') { const mx = Math.max(nx, ny, nz); wear = THREE.MathUtils.smoothstep(1 - mx, 0.1, 0.42); } // only genuinely angled bevel verts wear, so flat faces don't inherit a tint through interpolation
    else if (mode === 'rim') {
      // distance to the nearest bounding-box face along the longest axis
      const ax = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
      const v = pos['get' + ax.toUpperCase()](i); const d = Math.min(v - bb.min[ax], bb.max[ax] - v);
      wear = 1 - THREE.MathUtils.smoothstep(d, 0, 0.006);
    } else if (mode === 'none') wear = 0;
    else if (mode === 'all') wear = 1;
    // pseudo-random per-vertex grime so it isn't uniform
    const h = Math.sin(pos.getX(i) * 913.1 + pos.getY(i) * 471.7 + pos.getZ(i) * 233.9) * 43758.5453; const r = h - Math.floor(h);
    col[i * 3] = Math.min(1, wear * amount * (0.55 + 0.45 * r));
    col[i * 3 + 1] = grime * (0.6 + 0.4 * r);
    col[i * 3 + 2] = palm; // b: palm/pad mask (glove material darkens + pebbles it)
  }
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geom;
}

/**
 * Part accumulator: add(geometry, materialKey, {pos, rot, scale, wear, wearAmt}) — geometries are transformed and merged per material.
 * build(materials) → Group with one Mesh per material key.
 */
export class Builder {
  constructor() { this.bins = new Map(); }
  add(geom, key, o = {}) {
    const p = o.pos || [0, 0, 0], r = o.rot || [0, 0, 0], s = o.scale || [1, 1, 1];
    _p.set(p[0], p[1], p[2]); _e.set(r[0], r[1], r[2], o.order || 'XYZ'); _q.setFromEuler(_e); _s.set(s[0], s[1], s[2]);
    _m.compose(_p, _q, _s);
    if (geom.index) geom = geom.toNonIndexed();
    geom.applyMatrix4(_m);
    if (!geom.attributes.normal) geom.computeVertexNormals();
    bakeWear(geom, o.wear ?? 'box', o.wearAmt ?? 1, o.grime ?? 0.5, o.palm ?? 0);
    for (const name of Object.keys(geom.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) geom.deleteAttribute(name);
    if (!geom.attributes.uv) geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geom.attributes.position.count * 2), 2));
    (this.bins.get(key) || this.bins.set(key, []).get(key)).push(geom);
    return this;
  }
  build(materials, name = 'part') {
    const g = new THREE.Group(); g.name = name;
    for (const [key, list] of this.bins) {
      const merged = mergeGeometries(list, false);
      for (const l of list) l.dispose();
      const mesh = new THREE.Mesh(merged, materials[key] || materials.metal);
      mesh.name = `${name}:${key}`; mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false;
      g.add(mesh);
    }
    this.bins.clear();
    return g;
  }
}

/** Picatinny rail: base slab plus repeated recoil-groove teeth (along Z). Adds to builder at given transform. */
export function addRail(b, key, len, width, opts = {}) {
  const pitch = 0.01, slot = 0.0055, teethH = opts.teethH ?? 0.003, baseH = opts.baseH ?? 0.003;
  const pos = opts.pos || [0, 0, 0], rot = opts.rot || [0, 0, 0];
  const grp = [];
  // base
  b.add(box(width, baseH, len), key, { pos: [pos[0], pos[1] + baseH / 2, pos[2]], rot, wear: 'box' });
  const n = Math.floor(len / pitch);
  const start = -len / 2 + (len - n * pitch) / 2 + (pitch - slot) / 2;
  for (let i = 0; i < n; i++) {
    const z = start + i * pitch;
    // tooth: trapezoid via a box with slight taper (rotated tiny) — use a wedge extrude for the picatinny profile
    const prof = [[-width / 2, 0], [width / 2, 0], [width / 2 - 0.0012, teethH], [-width / 2 + 0.0012, teethH]];
    const g = extrude(prof, pitch - slot, { uvScale: 20 });
    b.add(g, key, { pos: [pos[0], pos[1] + baseH, pos[2] + z], rot, wear: 'box', wearAmt: 1.2 });
  }
  return grp;
}
