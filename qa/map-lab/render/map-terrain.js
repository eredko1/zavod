import * as THREE from 'three';
import { projection } from '../pipeline/osm-model.js';
import { vertexData, triangleGroups } from './vertex-data.js';
import { sourceNumber } from '../data/source-number.js';
import { sourceCoordinate } from '../data/source-coordinate.js';
import { featureID, NYC_SOURCES } from '../data/map-sources.js';

// Every surface uses the same cell diagonal and elevation plane, including clipped edges.
export const TERRAIN_CELL = 5;
function halfPlane(poly, side) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], da = side(a), db = side(b), ka = da >= 0, kb = db >= 0;
    if (ka) out.push(a);
    if (ka !== kb) { const t = da / (da - db); out.push(a.map((v, j) => v + (b[j] - v) * t)); }
  }
  return out;
}
function terrainTriangles(triangle, vertices) {
  const zs = triangle.map(p => p[2]), cell = TERRAIN_CELL;
  // Only visit the covered span of each row; long diagonal polygons avoid a full bounding-box scan.
  for (let iz = Math.floor(Math.min(...zs) / cell); iz <= Math.floor(Math.max(...zs) / cell); iz++) {
    const z = iz * cell, row = halfPlane(halfPlane(triangle, p => p[2] - z), p => z + cell - p[2]);
    if (row.length < 3) continue;
    const xs = row.map(p => p[0]);
    for (let ix = Math.floor(Math.min(...xs) / cell); ix <= Math.floor(Math.max(...xs) / cell); ix++) {
    const x = ix * cell, poly = halfPlane(halfPlane(row, p => p[0] - x), p => x + cell - p[0]);
    for (const sign of [-1, 1]) {
      const part = halfPlane(poly, p => sign * (p[0] - x - p[2] + z));
      for (let i = 1; i < part.length - 1; i++) {
        const [a, b, c] = [part[0], part[i], part[i + 1]];
        if (Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0])) > 1e-10) vertices.push(...a, ...b, ...c);
      }
    }
    }
  }
}

// The base terrain already conforms to the lattice. Never feed it through surface clipping.
export function terrainGeometry(bounds, terrain) {
  const cell = TERRAIN_CELL, x0 = Math.floor(bounds.x0 / cell) * cell, z0 = Math.floor(bounds.z0 / cell) * cell;
  const x1 = Math.ceil(bounds.x1 / cell) * cell, z1 = Math.ceil(bounds.z1 / cell) * cell;
  const nx = terrain.active ? (x1-x0)/cell : 1, nz = terrain.active ? (z1-z0)/cell : 1, positions = [], indices = [];
  for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) { const x = x0 + ix * (x1-x0)/nx, z = z0 + iz * (z1-z0)/nz; positions.push(x, terrain.sample(x, z) - 0.02, z); }
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) { const a = iz * (nx + 1) + ix, b = a + 1, c = a + nx + 1, d = c + 1; indices.push(a, d, b, a, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals(); g.computeBoundingSphere();
  g.userData.groundBounds = { x0, z0, x1, z1 }; return g;
}

export function terrainFromSnapshots(snapshots, origin, enabled = true) {
  const project = projection(...origin), samples = [], issues = [], positions = new Map();
  const source = NYC_SOURCES.find(s => s.id === 'nyc-elevation');
  for (const snap of snapshots.filter(s => s.sourceId === 'nyc-elevation')) for (const f of snap.data.features) {
    const p = f.properties, elevation = sourceNumber(p.elevation);
    // Roofs (302000) and bridges (300020) are not ground. Never mix them into the terrain.
    if (String(p.sub_code) !== '300000' || elevation === null || f.geometry.type !== 'Point') continue;
    const id = featureID(source,f); let coordinate;
    try { coordinate = sourceCoordinate(f.geometry.coordinates); }
    catch (e) { issues.push({id,dataset:source.dataset,code:'invalid-geometry',severity:'error',message:e.message}); continue; }
    const key = `${coordinate.lon},${coordinate.lat}`, [x,z] = project(coordinate);
    if (!positions.has(key)) positions.set(key,[]);
    positions.get(key).push({id,x,z,elevation:elevation*0.3048,sourceId:String(p.source_id)});
  }
  // Conflicting observations have no justified winner. Retain evidence and omit that location.
  for (const records of positions.values()) {
    records.sort((a,b)=>a.id.localeCompare(b.id));
    const candidates = records.map(r=>({id:r.id,elevation:r.elevation,unit:'metres'}));
    if (records.some(r=>r.elevation!==records[0].elevation)) {
      for (const r of records) issues.push({id:r.id,dataset:source.dataset,code:'conflicting-elevation',severity:'warning',message:'Conflicting ground elevations at the same coordinate; this location is excluded from terrain interpolation.',candidates});
    } else samples.push({...records[0],members:records.map(r=>r.id)});
  }
  samples.sort((a,b)=>a.x-b.x||a.z-b.z||a.id.localeCompare(b.id));
  const values = samples.map(s => s.elevation).sort((a, b) => a - b), datum = values.length ? values[Math.floor(values.length / 2)] : 0, active = enabled && samples.length >= 3;
  const heights = new Map();
  const estimate = (x, z) => {
    if (!active) return 0;
    const key = `${x.toFixed(3)},${z.toFixed(3)}`; if (heights.has(key)) return heights.get(key);
    const nearest = [];
    for (const s of samples) { const d2 = (s.x - x) ** 2 + (s.z - z) ** 2; if (nearest.length === 4 && d2 >= nearest[3].d2) continue; let i = 0; while (i < nearest.length && nearest[i].d2 <= d2) i++; nearest.splice(i, 0, { s, d2 }); if (nearest.length > 4) nearest.pop(); }
    const value = nearest[0].d2 < 0.000001 ? nearest[0].s.elevation : nearest[0].d2 > 10000 ? nearest[0].s.elevation : nearest.reduce((sum, n) => sum + n.s.elevation / Math.max(n.d2, 0.000001), 0) / nearest.reduce((sum, n) => sum + 1 / Math.max(n.d2, 0.000001), 0);
    if (heights.size > 100000) heights.clear(); heights.set(key, value - datum); return value - datum;
  };
  const sample = (x, z) => {
    if (!active) return 0;
    const cell = TERRAIN_CELL, x0 = Math.floor(x / cell) * cell, z0 = Math.floor(z / cell) * cell, u = (x - x0) / cell, v = (z - z0) / cell;
    const a = estimate(x0, z0), d = estimate(x0 + cell, z0 + cell);
    return v <= u ? a * (1 - u) + estimate(x0 + cell, z0) * (u - v) + d * v : a * (1 - v) + d * u + estimate(x0, z0 + cell) * (v - u);
  };
  return { active, samples, issues, datum, min: values[0] ?? null, max: values.at(-1) ?? null, sample, method: 'Shared 5 m triangle grid; vertex elevations use four-nearest inverse-distance weighting, nearest sample beyond 100 m. Ground subtype 300000 only; conflicting co-located observations excluded. Estimated surface, not a surveyed terrain mesh.' };
}

export function drapeScene(group, terrain) {
  if (!terrain.active) return;
  function visit(o) {
    if (o.userData.building) {
      const b = o.userData.building, ring = b.shapes[0].outer, x = ring.reduce((s, p) => s + p[0], 0) / ring.length, z = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      b.ground = Number.isFinite(b.groundElevation) ? b.groundElevation - terrain.datum : terrain.sample(x, z); o.position.y = b.ground; return;
    }
    if (o.isInstancedMesh) {
      const m = o.matrixWorld.clone();
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); const f = o.userData.features[i]; m.elements[13] += f.elevation !== undefined ? f.elevation - terrain.datum : terrain.sample(m.elements[12], m.elements[14]); o.setMatrixAt(i, m); }
      o.instanceMatrix.needsUpdate = true; o.computeBoundingSphere(); return;
    }
    if (o.isMesh && o.geometry?.attributes.position) {
      // One projection pass over original triangles. No recursive pre-subdivision or temporary non-indexed copy.
      const old=o.geometry,index=old.index,channels=vertexData(old),vertices=[],groups=[];
      for(const group of triangleGroups(old)){
        const start=vertices.length/channels.stride;
        for(let i=group.start;i<group.start+group.count;i+=3)terrainTriangles([0,1,2].map(j=>channels.read(index?index.getX(i+j):i+j)),vertices);
        groups.push({start,count:vertices.length/channels.stride-start,materialIndex:group.materialIndex});
      }
      o.geometry=channels.geometry(vertices,groups);
      old.dispose();
    }
    if (o.geometry?.attributes.position) {
      const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + terrain.sample(p.getX(i), p.getZ(i))); p.needsUpdate = true; o.geometry.computeVertexNormals(); o.geometry.computeBoundingSphere();
    }
    for (const child of o.children) visit(child);
  }
  visit(group);
}
