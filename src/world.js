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
    ladders: [],        // { x, z, y0, y1, nx, nz } — ladder face at (x,z), climbable from y0 to y1, normal (nx,nz) points AWAY from the wall toward the climber
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
    /** Register a ladder + build a simple visible ladder mesh (rails + rungs). Player climbs it; the top platform must be a collider whose top is y1. */
    ladder(x, z, y0, y1, nx, nz, { mesh = true, color = 0x5a5f66 } = {}) {
      const n = Math.hypot(nx, nz) || 1; nx /= n; nz /= n;
      const L = { x, z, y0, y1, nx, nz }; W.ladders.push(L);
      if (mesh) {
        const g = new THREE.Group(); const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.85 });
        const h = y1 - y0 + 0.9; const rail = new THREE.CylinderGeometry(0.02, 0.02, h, 8);
        for (const sx of [-0.22, 0.22]) { const r = new THREE.Mesh(rail, mat); r.position.set(sx, h / 2, 0); g.add(r); }
        const rung = new THREE.CylinderGeometry(0.014, 0.014, 0.44, 8); rung.rotateZ(Math.PI / 2);
        for (let y = 0.3; y < h - 0.2; y += 0.3) { const r = new THREE.Mesh(rung, mat); r.position.set(0, y, 0); g.add(r); }
        g.position.set(x + nx * 0.12, y0, z + nz * 0.12); g.rotation.y = Math.atan2(nx, nz); scene.add(g);
        g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.surface = 'metal'; ctx.raycastTargets.push(o); } });
        L.mesh = g;
      }
      return L;
    },
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
