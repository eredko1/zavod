import * as THREE from 'three';
import {boundGeometry} from './bounded-geometry.js';
import {clipPaths} from '../pipeline/area-clip.js';
import {treeRowPoints} from '../pipeline/tree-placement.js';
import {clipSurfaceGeometry} from './map-merge-mesh.js';
import {rollbackMeshes} from './mesh-transaction.js';

export function buildDetails(plan, shapeOf, featureReferences = []) {
  const group = new THREE.Group(), selectable = [], batches = new Map();
  const materials = Object.fromEntries(Object.entries({ roadbed: 0x727d82, prop: 0xaab2b1, foliage: 0x899c89, trunk: 0x8b8176, fence: 0x969f9d, land: 0xb1bdaa, paved: 0xc6c9c1, wood:0xbca98b, sand:0xd9c6a1, pitch: 0xa1b69e, water: 0x9bb7c0, reference: 0xb9a4be, rail: 0x7a858b }).map(([k, color]) => [k, new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide })]));
  const outlineMaterial=new THREE.LineBasicMaterial({color:0xb9a4be});
  const primitives = { box: new THREE.BoxGeometry(1, 1, 1), cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 8), ball: new THREE.SphereGeometry(0.5, 8, 6) };
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0);
  function instance(kind, material, f, x, y, z, sx, sy, sz, angle = 0, segment = null) {
    // Batch by source so filters can hide groups without rebuilding geometry.
    const key = `${kind}/${material}/${f.sourceId || 'osm-overpass'}`; if (!batches.has(key)) batches.set(key, { kind, material, items: [] });
    rotation.setFromAxisAngle(axis, angle); matrix.compose(new THREE.Vector3(x, y, z), rotation, new THREE.Vector3(sx, sy, sz));
    batches.get(key).items.push({ matrix: matrix.clone(), feature: f, segment });
  }
  function beam(f, material, a, b, y, height, width) {
    const distance = Math.hypot(b[0] - a[0], b[1] - a[1]); if (distance < 0.001) return;
    instance('box', material, f, (a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2, width, height, distance, Math.atan2(b[0] - a[0], b[1] - a[1]), [a,b]);
  }
  function tree(f, x, z) {
    const b=f.clipBounds;if(b&&(x<b.x0||x>b.x1||z<b.z0||z>b.z1))return;
    const d = f.dimensions, h = d.height, crown = d.crown || Math.min(5, h * 0.6), trunk = d.trunk || 0.3;
    instance('cylinder', 'trunk', f, x, h * 0.3, z, trunk, h * 0.6, trunk);
    instance('ball', 'foliage', f, x, h * 0.7, z, crown, h * 0.6, crown);
  }
  function prop(f) {
    const [x, z] = f.point, d = f.dimensions, h = d.height, a = f.rotation;
    const box = (ox, y, oz, sx, sy, sz) => instance('box', 'prop', f, x + ox * Math.cos(a) + oz * Math.sin(a), y, z - ox * Math.sin(a) + oz * Math.cos(a), sx, sy, sz, a);
    if (f.rule === 'tree') tree(f, x, z);
    else if (f.rule === 'bench') { box(0, h * 0.5, 0, d.length, 0.1, d.width); box(0, h * 0.78, d.width * 0.4, d.length, h * 0.44, 0.08); for (const sign of [-1, 1]) box(sign * d.length * 0.35, h * 0.25, 0, 0.08, h * 0.5, d.width * 0.8); }
    else if (['lamp', 'signal', 'pole'].includes(f.rule)) {
      instance('cylinder', 'prop', f, x, h / 2, z, 0.12, h, 0.12);
      if (f.rule === 'lamp') { box(0.3, h - 0.05, 0, 0.7, 0.1, 0.1); box(0.6, h - 0.14, 0, 0.45, 0.18, 0.25); }
      else box(0, h - 0.25, 0, 0.3, 0.5, 0.15);
    } else if (f.rule === 'gate') { for (const sign of [-1, 1]) box(sign * d.width / 2, h / 2, 0, 0.08, h, 0.08); box(0, h * 0.7, 0, d.width, 0.07, 0.07); }
    else if (f.rule === 'bin' || f.rule === 'bollard') instance('cylinder', 'prop', f, x, h / 2, z, d.width, h, d.width);
    else instance('cylinder', 'reference', f, x, 0.09, z, 0.35, 0.1, 0.35);
  }
  const surfaces = plan.details.filter(f => f.surface&&!f.reference).sort((a, b) => {
    const area = f => f.shapes.reduce((sum, s) => sum + Math.abs(s.outer.reduce((v, p, i, r) => { const q = r[(i + 1) % r.length]; return v + p[0] * q[1] - q[0] * p[1]; }, 0)), 0);
    return area(b) - area(a);
  });
  for (let i = 0; i < surfaces.length; i++) {
    const f = surfaces[i],start=selectable.length;
    try { for (const p of f.shapes) { let g = new THREE.ShapeGeometry(shapeOf(p)); g.rotateX(-Math.PI / 2); g.translate(0, f.surfaceHeight ?? (-0.012 + i / (surfaces.length + 1) * 0.018), 0);g=boundGeometry(g,f.clipBounds);if(f.mergeMasks)g=clipSurfaceGeometry(g,f.mergeMasks);if(!g.attributes.position.count){g.dispose();continue;} const mesh = new THREE.Mesh(g, materials[f.surfaceKind]); mesh.userData.feature = f; group.add(mesh); selectable.push(mesh); } }
    catch (e) { rollbackMeshes(selectable,start);f.failed = true; plan.issues.push({ id: f.id, code: 'surface-error', severity: 'error', message: e.message }); }
  }
  for (const f of [...plan.details,...featureReferences]) {
    try {
      if(f.reference&&!f.point){
        let paths=[...f.paths,...f.shapes.flatMap(s=>[s.outer,...s.holes].map(r=>[...r,r[0]]))];if(f.clipBounds)paths=clipPaths(paths,f.clipBounds);
        const vertices=[];for(const path of paths)for(let i=1;i<path.length;i++)for(const p of[path[i-1],path[i]])vertices.push(p[0],.06,p[1]);
        if(vertices.length){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const lines=new THREE.LineSegments(geometry,outlineMaterial);lines.userData.feature=f;group.add(lines);selectable.push(lines);}continue;
      }
      if (f.point) { if(f.reference)instance('cylinder','reference',f,f.point[0],.09,f.point[1],.35,.1,.35);else prop(f); continue; }
      const d = f.dimensions;
      if (f.rule === 'surface' || (f.rule === 'kerb' && d.height === 0)) continue;
      if(f.rule==='tree-row'){for(const [x,z]of f.treePoints??treeRowPoints(f))tree(f,x,z);continue;}
      for (const line of f.paths) {
        for (let i = 1; i < line.length; i++) {
          const a = line[i - 1], b = line[i], distance = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!distance) continue;
          if (f.rule === 'fence') {
            beam(f, 'fence', a, b, d.height * 0.35, 0.05, d.width); beam(f, 'fence', a, b, d.height * 0.85, 0.05, d.width);
            const steps = Math.max(1, Math.ceil(distance / 3)); for (let n = 0; n <= steps; n++) instance('box', 'fence', f, a[0] + (b[0] - a[0]) * n / steps, d.height / 2, a[1] + (b[1] - a[1]) * n / steps, d.width, d.height, d.width);
          } else if (['wall', 'hedge', 'kerb'].includes(f.rule)) beam(f, f.rule === 'hedge' ? 'foliage' : 'fence', a, b, d.height / 2 + (f.baseOffset || 0), d.height, d.width);
          else if (f.rule === 'rail') {
            for (const sign of [-1, 1]) { const x = -(b[1] - a[1]) / distance * d.width / 2 * sign, z = (b[0] - a[0]) / distance * d.width / 2 * sign; beam(f, 'rail', [a[0] + x, a[1] + z], [b[0] + x, b[1] + z], 0.075, 0.07, 0.06); }
          } else beam(f, 'reference', a, b, 0.07, 0.04, 0.09);
        }
      }
    } catch (e) { f.failed = true; plan.issues.push({ id: f.id, code: 'detail-error', severity: 'error', message: e.message }); }
  }
  for (const b of batches.values()) {
    const items = b.items.filter(i => !i.feature.failed); if (!items.length) continue;
    const mesh = new THREE.InstancedMesh(primitives[b.kind], materials[b.material], items.length);
    items.forEach((item, i) => mesh.setMatrixAt(i, item.matrix)); mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    mesh.userData.features = items.map(i => i.feature);mesh.userData.segments=items.map(i=>i.segment); group.add(mesh); selectable.push(mesh);
  }
  group.userData.materials = [...Object.values(materials),outlineMaterial]; group.userData.geometries = Object.values(primitives);
  return { group, selectable };
}
