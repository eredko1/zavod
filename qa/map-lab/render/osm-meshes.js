import * as THREE from 'three';
import { clipSurfaceGeometry } from './map-merge-mesh.js';
import { buildDetails } from './osm-detail-meshes.js';
import { boundGeometry } from './bounded-geometry.js';
import {clipSolidGeometry} from './solid-clip.js';
import {rollbackMeshes} from './mesh-transaction.js';

function shapeOf(p) {
  const points = r => r.map(([x, z]) => new THREE.Vector2(x, -z));
  const outer = points(p.outer); if (!THREE.ShapeUtils.isClockWise(outer)) outer.reverse();
  const shape = new THREE.Shape(outer);
  for (const ring of p.holes) { const hole = points(ring); if (THREE.ShapeUtils.isClockWise(hole)) hole.reverse(); shape.holes.push(new THREE.Path(hole)); }
  return shape;
}
export function buildScene(plan) {
  const group = new THREE.Group(), selectable = [];
  const solid = new THREE.MeshStandardMaterial({ color: 0xdce1df, roughness: 1 }), estimated = new THREE.MeshStandardMaterial({ color: 0xe5c394, roughness: 1 });
  const asphalt = new THREE.MeshBasicMaterial({ color: 0x727d82, side: THREE.DoubleSide }), path = new THREE.MeshBasicMaterial({ color: 0xc2c5bc, side: THREE.DoubleSide });
  const edge = new THREE.LineBasicMaterial({ color: 0x84928f, transparent: true, opacity: 0.45 });
  const add = (g, material, f, parent = group) => { g=f.height?clipSolidGeometry(g,f.clipBounds):boundGeometry(g,f.clipBounds);if (f.mergeMasks) g = clipSurfaceGeometry(g, f.mergeMasks); const m = new THREE.Mesh(g, material); m.userData.feature = f; parent.add(m); selectable.push(m); return m; };
  for (const b of plan.buildings) {
    if (!b.extrude || b.suppressed || b.reference) continue;
    const building = new THREE.Group(); building.userData.building = b;
    try {
      for (const p of b.shapes) {
        const geometry = new THREE.ExtrudeGeometry(shapeOf(p), { depth: b.height.top - b.height.bottom, bevelEnabled: false, steps: 1 });
        if (!geometry.attributes.position.count) { geometry.dispose(); throw new Error('Triangulation produced no faces.'); }
        geometry.rotateX(-Math.PI / 2); geometry.translate(0, b.height.bottom, 0);
        const mesh=add(geometry, b.height.estimated ? estimated : solid, b, building);
        const outline=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), edge);outline.userData.feature=b;building.add(outline);
      }
      group.add(building);
    } catch (e) { b.failed = true; dispose(building, false); plan.issues.push({ id: b.id, code: 'mesh-error', severity: 'error', message: `Skipped: ${e.message}` }); }
  }
  // Centerlines become ribbons with round joins; widths are separately marked as tagged/estimated.
  for (const r of plan.roads) {
    if(r.reference)continue;
    const material = r.path ? path : asphalt, y = r.surfaceHeight??(r.path ? 0.035 : 0.025),start=selectable.length;
    try {
      for (const p of r.shapes) { const g = new THREE.ShapeGeometry(shapeOf(p)); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); add(g, material, r); }
      const vertices = [], radius = r.width.value / 2, tri = (a, b, c) => vertices.push(a[0], y, a[1], b[0], y, b[1], c[0], y, c[1]);
      for (const line of r.paths) {
        for (let i = 1; i < line.length; i++) {
          const a = line[i - 1], b = line[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!d) continue;
          const x = -(b[1] - a[1]) / d * radius, z = (b[0] - a[0]) / d * radius;
          const p = [a[0] + x, a[1] + z], q = [a[0] - x, a[1] - z], s = [b[0] + x, b[1] + z], t = [b[0] - x, b[1] - z]; tri(p, q, s); tri(q, t, s);
        }
        for (const p of line) for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, b = (i + 1) * Math.PI / 6; tri(p, [p[0] + Math.cos(a) * radius, p[1] + Math.sin(a) * radius], [p[0] + Math.cos(b) * radius, p[1] + Math.sin(b) * radius]); }
      }
      if (vertices.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); add(g, material, r); }
    } catch (e) { rollbackMeshes(selectable,start);r.failed = true; plan.issues.push({ id: r.id, code: 'road-mesh-error', severity: 'error', message: e.message }); }
  }
  const details = buildDetails(plan, shapeOf, [...plan.roads,...plan.buildings].filter(f=>f.reference&&!f.suppressed)); group.add(details.group); selectable.push(...details.selectable);
  const failed = new Set([...plan.buildings, ...plan.roads, ...plan.details].filter(f => f.failed).map(f => f.id));
  for (const c of plan.coverage) if (failed.has(c.id)) { c.status = 'error'; c.reason = 'Mesh generation failed; see generation log.'; }
  // Own even unused materials so repeated rebuilds release all GPU resources.
  group.userData.materials = [solid, estimated, asphalt, path, edge];
  return { group, selectable: selectable.filter(m => !m.userData.feature?.failed) };
}
export function dispose(group, materials = true) {
  const unique = new Set(group.userData.materials || []), geometries = new Set();
  group.traverse(o => { for (const g of o.userData.geometries || []) geometries.add(g); for (const m of o.userData.materials || []) unique.add(m); if (o.geometry) geometries.add(o.geometry); o.dispose?.(); if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) unique.add(m); });
  for (const g of geometries) g.dispose();
  if (materials) for (const m of unique) m.dispose();
}
