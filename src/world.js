// World host: picks a map from the registry (?map=), provides shared builder helpers, exposes ctx.world. Owned by: main.
// Map content lives in ./world/maps/<id>.js (one agent per map); shared submodules in ./world/*.js.
import * as THREE from 'three';
import { MAPS, DEFAULT_MAP } from './world/maps/index.js';

const updaters = [];
let W = null;

export async function init(ctx) {
  const { scene, renderer } = ctx;
  const R = ctx.rng;
  const mapId = MAPS[ctx.qs.get('map')] ? ctx.qs.get('map') : DEFAULT_MAP;
  const map = MAPS[mapId];
  W = {
    mapId, meta: map.meta,
    maps: Object.values(MAPS).map(m => m.meta),           // for the HUD map selector
    grade: map.meta.grade, ambience: map.meta.ambience,   // hints for post (color grade) and audio (ambience set)
    bounds: new THREE.Box3(new THREE.Vector3(-58, -1, -58), new THREE.Vector3(58, 30, 58)),
    poses: {}, playerSpawns: [], enemySpawns: [], coverPoints: [], navNodes: [],
    walkables: [],      // optional: Box3[] of elevated walkable platforms (tops are floors) for AI nav on multi-level maps
    lampPositions: [],  // filled by lamps.js, read by rain.js for lit streaks
    groundHeight: () => 0,
    surfaceAt: (p) => (p.y > 0.2 ? 'metal' : 'ground'),
    updaters,
  };

  // shared helpers for map builders / submodules
  const world = {
    ctx, R, W, scene, updaters,
    /** Register a solid mesh: shadows, raycast target, AABB collider. */
    solid(mesh, surface = 'metal', { collide = true, shadow = true, box = null } = {}) {
      mesh.userData.surface = surface;
      if (shadow) { mesh.castShadow = true; mesh.receiveShadow = true; }
      ctx.raycastTargets.push(mesh);
      if (collide) {
        if (box) ctx.colliders.push(box);
        else { mesh.updateWorldMatrix(true, false); ctx.colliders.push(new THREE.Box3().setFromObject(mesh)); }
      }
      return mesh;
    },
    box(min, max) { const b = new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)); ctx.colliders.push(b); return b; },
    /** Elevated floor the AI may walk on (also a collider). */
    walkable(min, max) { const b = world.box(min, max); W.walkables.push(b); return b; },
    cover(x, z, nx, nz, y = 0) { W.coverPoints.push({ position: new THREE.Vector3(x, y, z), normal: new THREE.Vector3(nx, 0, nz).normalize() }); },
  };

  ctx.progress(0.12, `map: ${map.meta.name}`);
  map.build(world);
  if (!W.poses.spawn && W.playerSpawns[0]) { const s = W.playerSpawns[0]; W.poses.spawn = [s.x, s.y, s.z, 0, 0]; }
  return W;
}

export function update(dt, ctx) {
  if (!W) return;
  for (let i = 0; i < updaters.length; i++) updaters[i](dt, ctx);
}

export function reset(ctx) { /* maps are static; dynamic state lives in other modules */ }
