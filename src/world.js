// Level, materials, lighting, weather. Owned by: WORLD agent.
// Rainy night container yard / shipyard ("ZAVOD"). Submodules live in ./world/*.js.
import * as THREE from 'three';
import { buildSky } from './world/sky.js';
import { buildGround } from './world/ground.js';
import { buildStructures } from './world/structures.js';
import { buildContainers } from './world/containers.js';
import { buildProps } from './world/props.js';
import { buildLamps } from './world/lamps.js';
import { buildRain } from './world/rain.js';
import { buildDistant } from './world/distant.js';

const updaters = [];
let W = null;

export async function init(ctx) {
  const { scene, renderer } = ctx;
  const R = ctx.rng;
  W = {
    bounds: new THREE.Box3(new THREE.Vector3(-58, -1, -58), new THREE.Vector3(58, 30, 58)),
    poses: {}, playerSpawns: [], enemySpawns: [], coverPoints: [], navNodes: [],
    lampPositions: [], // filled by lamps.js, read by rain.js for lit streaks
    groundHeight: () => 0,
    surfaceAt: (p) => (p.y > 0.2 ? 'metal' : 'ground'),
  };

  // shared helpers for submodules
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
    box(min, max) { ctx.colliders.push(new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max))); },
    cover(x, z, nx, nz) { W.coverPoints.push({ position: new THREE.Vector3(x, 0, z), normal: new THREE.Vector3(nx, 0, nz).normalize() }); },
  };

  renderer.toneMappingExposure = 1.25;
  ctx.progress(0.13, 'sky');
  buildSky(world);
  ctx.progress(0.15, 'ground');
  buildGround(world);
  ctx.progress(0.17, 'structures');
  buildStructures(world);
  ctx.progress(0.19, 'containers');
  buildContainers(world);
  ctx.progress(0.21, 'props');
  buildProps(world);
  ctx.progress(0.22, 'lamps');
  buildLamps(world);
  ctx.progress(0.23, 'distant');
  buildDistant(world);
  ctx.progress(0.24, 'rain');
  buildRain(world);

  // ---- gameplay data --------------------------------------------------------
  const v = (x, z) => new THREE.Vector3(x, 0, z);
  W.playerSpawns = [v(-4, 46), v(6, 44), v(-14, 48)];
  W.enemySpawns = [
    v(-40, -10), v(-30, -30), v(-50, 5), v(-20, -45), v(14, -44), v(40, -42), v(52, -20), v(52, 10), v(46, 34), v(30, 42),
    v(20, -8), v(34, 8), v(-8, -40), v(2, -46), v(44, -8), v(-36, 30), v(-48, 40), v(24, 26),
  ];
  W.poses = {
    spawn: [-4, 0, 46, 0.05, 0.0],
    hero: [15.4, 0, 39, 0.12, 0.0],
    containers: [21.5, 0, -2, -1.2, 0.05],
    crane: [22, 0, 44, -0.35, 0.42],
    warehouse: [-46, 0, -25, -0.9, 0.08],
    overview: [-14, 22, 66, 0.28, -0.42],
    puddles: [-3, 0, 14, 0.55, -0.22],
    dock: [-4, 0, -34, 1.2, 0.04],
    tanks: [-30, 0, 36, 1.9, 0.1],
    gate: [8, 0, 52, 2.6, 0.05],
  };
  return W;
}

export function update(dt, ctx) {
  if (!W) return;
  for (let i = 0; i < updaters.length; i++) updaters[i](dt, ctx);
}

export function reset(ctx) { /* nothing dynamic to reset: weather/lights are stateless */ }
