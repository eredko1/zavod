import * as THREE from 'three';
import { resolveMapStages, FEATURE_GROUPS } from './map-pipeline.js';
import {runBuildStages} from './build-stages.js';
import { buildScene, dispose } from '../render/osm-meshes.js';
import { terrainFromSnapshots, drapeScene, terrainGeometry } from '../render/map-terrain.js';
import { surfaceIndex } from '../render/map-surface-index.js';
import { placeSurfaceProps } from '../render/prop-placement.js';
import { clipPaths } from './area-clip.js';
import { sourceVisible, setFeatureVisibility } from '../render/feature-visibility.js';
import {boundInstances} from '../render/bound-instances.js';

// Compile source data without touching a view. Add future material/asset stages here, with stable marks.
// Resources transfer to the caller only after every stage succeeds.
export function compileMap(result, settings, mark = () => {}) {
  return runBuildStages(compileMapStages(result,settings),mark);
}
export function* compileMapStages(result,settings){
  let mesh, ref;
  try {
  const next = yield* resolveMapStages(result, settings), snaps=result.nyc || [];
  yield 'terrainSamples';const nextTerrain = terrainFromSnapshots(snaps,next.origin,settings.terrain,next.groundSampleDecisions);
  for (const issue of nextTerrain.issues) if (!next.issues.some(i=>i.id===issue.id&&i.code===issue.code)) next.issues.push(issue);
  for(const key of FEATURE_GROUPS)for(const f of next[key]){f.clipBounds=next.bounds;if(f.paths)f.paths=clipPaths(f.paths,next.bounds);}

  // Construct replacements first; failed requests never erase the visible world.
  if (nextTerrain.active) next.issues.push({ id: 'nyc-elevation', dataset: '9uxf-ng6q', severity: 'info', code: 'estimated-terrain', message: nextTerrain.method + ' Ground and surface polygons share terrain triangles so display and curb offsets stay consistent. NYC building ground elevations are assumed to share the spot samples’ vertical reference; per-record alignment is not verified.' });
  yield 'meshes';mesh = buildScene(next);yield 'drape';drapeScene(mesh.group, nextTerrain);
  yield 'baseTerrain';
  ref = new THREE.Group(); const b = next.bounds, geometry = terrainGeometry(b, nextTerrain);
  const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xb7c0b7, roughness: 1 })); ground.userData.feature={id:'terrain',rule:'terrain'};ref.add(ground);
  mesh.walkable = [ground, ...mesh.selectable.filter(m => {const f=m.userData.feature;return m.isMesh&&f&&!f.reference&&f.groundSurface!==false&&(f.surface||next.roads.includes(f));})];
  yield 'surfaceIndex';
  mesh.group.updateMatrixWorld(true);
  const gb = geometry.userData.groundBounds, nextSurfaces = surfaceIndex(mesh.walkable.slice(1), (x,z) => nextTerrain.sample(x,z) - (x >= gb.x0 && x <= gb.x1 && z >= gb.z0 && z <= gb.z1 ? 0.02 : 0));
  mesh.elevatedWalkable=mesh.selectable.filter(m=>{const f=m.userData.feature;return m.isMesh&&!m.isInstancedMesh&&f&&!f.reference&&(f.height||(f.surface||f.width)&&f.groundSurface===false);});
  const supports=surfaceIndex(mesh.elevatedWalkable,()=>-Infinity);
  setFeatureVisibility(mesh.group,f=>sourceVisible(f,snaps));
  yield 'propPlacement';placeSurfaceProps(mesh.group,nextTerrain,nextSurfaces,next.issues);
  yield 'boundInstances';boundInstances(mesh,next.bounds);
  return { plan:next, world:mesh, reference:ref, terrain:nextTerrain, surfaces:nextSurfaces, supports };
  } catch(e) { if(mesh)dispose(mesh.group); if(ref)dispose(ref); throw e; }
}
