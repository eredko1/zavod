import * as THREE from 'three';
import { resolveMap, FEATURE_GROUPS } from './map-pipeline.js';
import { buildScene, dispose } from '../render/osm-meshes.js';
import { terrainFromSnapshots, drapeScene, terrainGeometry } from '../render/map-terrain.js';
import { surfaceIndex } from '../render/map-surface-index.js';
import { placeSurfaceProps } from '../render/prop-placement.js';
import { sourceVisible, setFeatureVisibility } from '../render/feature-visibility.js';

// Compile source data without touching a view. Add future material/asset stages here, with stable marks.
// Resources transfer to the caller only after every stage succeeds.
export function compileMap(result, settings, mark = () => {}) {
  const hidden = new Set(result.hiddenOSM || []); let mesh, ref;
  try {
  const next = resolveMap(result, settings, name => mark(name)), snaps=result.nyc || [];
  const nextTerrain = terrainFromSnapshots(snaps,next.origin,settings.terrain); mark('terrainSamples');
  for (const issue of nextTerrain.issues) if (!next.issues.some(i=>i.id===issue.id&&i.code===issue.code)) next.issues.push(issue);
  // Apply per-feature preview filters before instancing, which batches several feature types.
  for (const key of FEATURE_GROUPS) next[key] = next[key].filter(f => !hidden.has(f.id));
  for (const c of next.coverage) if (hidden.has(c.id) && ['rendered','reference'].includes(c.status)) { c.status = 'hidden'; c.reason = 'Hidden by the generator 2D filter.'; }

  // Construct replacements first; failed requests never erase the visible world.
  if (nextTerrain.active) next.issues.push({ id: 'nyc-elevation', dataset: '9uxf-ng6q', severity: 'info', code: 'estimated-terrain', message: nextTerrain.method + ' Ground and surface polygons share terrain triangles so display and curb offsets stay consistent. NYC building ground elevations are assumed to share the spot samples’ vertical reference; per-record alignment is not verified.' });
  mesh = buildScene(next); mark('meshes'); drapeScene(mesh.group, nextTerrain); mark('drape');
  ref = new THREE.Group(); const b = next.bounds, size = Math.ceil(Math.max(b.x1 - b.x0, b.z1 - b.z0, 100) / 10) * 10 + 100;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, geometry = terrainGeometry({ x0: cx-size/2, x1: cx+size/2, z0: cz-size/2, z1: cz+size/2 }, nextTerrain);
  const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xb7c0b7, roughness: 1 })); ref.add(ground);
  if (!nextTerrain.active) { const grid = new THREE.GridHelper(size, size / 10, 0x87988e, 0xa2b0a5); grid.position.set((b.x0 + b.x1) / 2, 0.005, (b.z0 + b.z1) / 2); grid.material.transparent = true; grid.material.opacity = 0.45; grid.material.depthWrite = false; ref.add(grid); }
  mesh.walkable = [ground, ...mesh.selectable.filter(m => m.userData.feature?.surface || next.roads.includes(m.userData.feature))];
  mark('baseTerrain');
  mesh.group.updateMatrixWorld(true);
  const gb = geometry.userData.groundBounds, nextSurfaces = surfaceIndex(mesh.walkable.slice(1), (x,z) => nextTerrain.sample(x,z) - (x >= gb.x0 && x <= gb.x1 && z >= gb.z0 && z <= gb.z1 ? 0.02 : 0));
  mark('surfaceIndex');
  setFeatureVisibility(mesh.group,f=>sourceVisible(f,snaps));
  placeSurfaceProps(mesh.group,nextTerrain,nextSurfaces,next.issues);mark('propPlacement');
  return { plan:next, world:mesh, reference:ref, terrain:nextTerrain, surfaces:nextSurfaces };
  } catch(e) { if(mesh)dispose(mesh.group); if(ref)dispose(ref); throw e; }
}
