// NYC: the Map Lab city. Until Map Lab's first area ships this loads a stand-in block-out (assets/maps/nyc-standin.glb, written by
// qa/tools/make-nyc-standin.mjs) through the same path the real cells will take: each mesh's glTF extras carry its collision role
// (Map Lab's walkable-ground / walkable-elevated / blocking) and surface class, collision and ground from the meshes (world/meshcollide.js),
// spawns by rule, the play area's edge from the geometry. See qa/map-lab docs and Felix's integration brief. Owned by: main.
import * as THREE from 'three';
import { MeshCollision } from '../meshcollide.js';
import { buildSky } from '../railyard/sky.js';

export const meta = {
  id: 'nyc', name: 'NYC (MAP LAB)', subtitle: 'STAND-IN AREA · REAL CITY SOON', time: 'day', weather: 'clear',
  description: 'The Map Lab city pipeline: streets, curbs, a ramp and an elevated deck from a GLB, with mesh collision and surface classes. Real New York cells drop in here.',
  grade: 'day', ambience: 'coney', thumb: 'assets/thumbs/railyard.jpg',
};
const STANDIN = 'assets/maps/nyc-standin.glb', EDGE = 2;
let SCENE = null;

export async function load(ctx) {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  SCENE = (await new GLTFLoader().loadAsync(STANDIN)).scene;
}

export function build(world) {
  const { ctx, W, scene } = world;
  if (!SCENE) throw new Error('[nyc] map not loaded');
  buildSky(world);
  scene.add(SCENE); SCENE.updateMatrixWorld(true);
  const MC = new MeshCollision(ctx); ctx.meshCollision = MC;
  let n = 0;
  SCENE.traverse((o) => { if (!o.isMesh) return; const role = o.userData.role, cls = o.userData.surfaceClass; if (!role || !cls) { console.warn('[nyc] mesh without a collision role / surface class', o.name); return; }
    o.castShadow = role === 'blocking'; o.receiveShadow = true; MC.add(o, role, cls); n++; });
  // the map's own answers to "how high is the ground here" and "what am I standing on"
  W.groundHeight = (x, z) => { const g = MC.groundFor(x, z); return Number.isFinite(g) ? g : 0; };
  W.surfaceAt = (p) => MC.surfaceAt(p);
  // the edge of the built area blocks movement: the bounds are the geometry's (Map Lab: the collision index's tiles)
  const bb = new THREE.Box3().setFromObject(SCENE); W.bounds.set(new THREE.Vector3(bb.min.x + EDGE, -5, bb.min.z + EDGE), new THREE.Vector3(bb.max.x - EDGE, 80, bb.max.z - EDGE));
  const spawns = MC.spawns(W.bounds, 10);
  W.playerSpawns = spawns.slice(0, 6); W.enemySpawns = spawns.slice();
  if (spawns[0]) W.poses.spawn = [spawns[0].x, spawns[0].y, spawns[0].z, 0, 0];
  W.poses.ramp = [60, 0.2, 23, -Math.PI / 2, 0]; W.poses.deck = [97, 3.05, 23, 0, 0];
  console.log('[nyc] stand-in:', n, 'collision meshes ·', spawns.length, 'spawns by rule');
}
