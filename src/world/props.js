// Instanced Poly Haven props: barrels, crates, tyres, barriers, boxes, pipes, carts. WORLD agent.
import * as THREE from 'three';
import { WAREHOUSE, DOCK, SUBSTATION, HUT } from './structures.js';

const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

/**
 * Instance every leaf mesh of a GLTF for the given placements.
 * placement: { x, z, y?, ry?, rx?, s?, collide? }
 */
export function instanceModel(world, id, placements, surface = 'metal', { collide = true, shadow = true, castShadow = true } = {}) {
  const { ctx, scene } = world;
  const src = ctx.assets.modelSource(id);
  if (!src || !placements.length) return null;
  const root = src.scene; root.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(root);
  const leaves = []; root.traverse((o) => { if (o.isMesh) leaves.push(o); });
  const group = new THREE.Group(); group.name = 'props:' + id;
  const instMats = placements.map((pl) => {
    const s = pl.s ?? 1;
    const y = pl.y ?? (-bbox.min.y * s);
    _e.set(pl.rx ?? 0, pl.ry ?? 0, pl.rz ?? 0); _q.setFromEuler(_e); _p.set(pl.x, y, pl.z); _s.set(s, s, s);
    const m = new THREE.Matrix4().compose(_p, _q, _s);
    if (collide && pl.collide !== false) {
      const b = bbox.clone().applyMatrix4(m);
      if (b.max.y - b.min.y > 0.25) ctx.colliders.push(b);
    }
    return m;
  });
  for (const leaf of leaves) {
    const im = new THREE.InstancedMesh(leaf.geometry, leaf.material, placements.length);
    im.name = `props:${id}:${leaf.name}`;
    for (let i = 0; i < instMats.length; i++) { _m.multiplyMatrices(instMats[i], leaf.matrixWorld); im.setMatrixAt(i, _m); }
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = shadow && castShadow; im.receiveShadow = shadow;
    im.userData.surface = surface; im.frustumCulled = true;
    im.computeBoundingSphere?.(); im.computeBoundingBox?.();
    group.add(im); ctx.raycastTargets.push(im);
  }
  scene.add(group);
  return { group, bbox, instMats };
}

export function buildProps(world) {
  const { R, W } = world;
  const j = (a) => (R() - 0.5) * a; // jitter
  const rot = () => R() * Math.PI * 2;
  const P = (x, z, extra = {}) => ({ x, z, ...extra });
  const wh = WAREHOUSE, dk = DOCK, sb = SUBSTATION;

  // ---- barrels: clusters ----------------------------------------------------
  const barrels = [];
  const cluster = (x, z, n, r = 1.2) => { for (let i = 0; i < n; i++) barrels.push(P(x + j(r * 2), z + j(r * 2), { ry: rot() })); };
  cluster(-52, -18, 5, 1.3); cluster(-16, 2, 4); cluster(36, -44, 6, 1.6); cluster(-46, 30, 5, 1.5); cluster(8, -50, 3); cluster(22, 48, 4, 1.3); cluster(-30, -52, 5, 1.6);
  cluster(wh.x0 + 14, wh.z0 + 14, 6, 1.6); cluster(50, -52, 4);
  barrels.push(P(-7.5, 7.5, { ry: rot() }), P(-2, 6, { ry: rot() }), P(-14, 40, { ry: rot() }), P(30, 14, { rx: Math.PI / 2, y: 0.32, ry: 0.4 }), P(-43, -8, { rx: Math.PI / 2, y: 0.32, ry: 1.2 }));
  instanceModel(world, 'barrel_03', barrels, 'metal');
  for (const b of barrels.slice(0, 12)) world.cover(b.x + 0.9, b.z, 1, 0);

  // ---- crates -----------------------------------------------------------------
  instanceModel(world, 'old_military_crate', [P(dk.x0 + 3, dk.z0 + 4, { y: dk.h, ry: 0.2 }), P(dk.x0 + 3, dk.z0 + 4, { y: dk.h + 0.36, ry: 0.3 }), P(-9, -6, { ry: 1.2 }), P(-11.5, -6.8, { ry: 1.4 }), P(wh.x0 + 20, wh.z0 + 14, { ry: 0.1 }), P(-4, 44, { ry: 2 })], 'wood');
  instanceModel(world, 'wooden_military_crate', [P(dk.x0 + 3, dk.z1 - 3, { y: dk.h, ry: 1.5 }), P(-8, 1, { ry: 0.3 }), P(-8, 1, { y: 0.42, ry: 0.35 }), P(wh.x0 + 26, wh.z0 + 10, { ry: 0.2 }), P(wh.x0 + 26, wh.z0 + 10, { y: 0.42, ry: 0.25 })], 'wood');
  instanceModel(world, 'wooden_crate_01', [P(-10, 2.5, { ry: 0.9 }), P(wh.x0 + 24, wh.z0 + 11, { ry: 1.0 }), P(dk.x0 + 4, dk.z0 + 8, { y: dk.h, ry: 0.5 }), P(-2, 42, { ry: 0.2 }), P(50, 46, { ry: 2.2 })], 'wood');
  instanceModel(world, 'cardboard_box_01', [P(wh.x0 + 19, wh.z0 + 15.5, { ry: 0.4 }), P(wh.x0 + 30, wh.z0 + 6, { ry: 1.1 }), P(dk.x0 + 2.5, dk.z0 + 14, { y: dk.h, ry: 0.7 })], 'wood', { castShadow: false });
  instanceModel(world, 'plastic_crate_01', [P(-12, 8, { ry: 0.2 }), P(-12, 8, { y: 0.26, ry: 0.1 }), P(HUT.x + 2.3, HUT.z + 0.8, { ry: 0.4 })], 'metal', { castShadow: false });
  instanceModel(world, 'industrial_pastic_container', [P(-16, 6, { ry: 0.3 }), P(24, 46, { ry: 2.4 })], 'metal', { castShadow: false });
  instanceModel(world, 'ammo_box', [P(-9.5, -5.5, { y: 0.36, ry: 0.3 }), P(-2, 46, { ry: 1.2 }), P(dk.x0 + 3.2, dk.z0 + 4.4, { y: dk.h + 0.36, ry: 0.5 })], 'metal', { castShadow: false });

  // ---- tyres: piles ------------------------------------------------------------
  const tyres = [];
  const pile = (x, z, n) => { for (let k = 0; k < n; k++) tyres.push(P(x + j(0.08), z + j(0.08), { rx: Math.PI / 2, y: 0.08 + k * 0.16, ry: rot() })); };
  pile(-54, 46, 5); pile(-53.3, 45.2, 3); pile(14, 52, 4); pile(15, 52.6, 2); pile(52, 40, 6); pile(51.3, 41, 3); pile(-52, -40, 4); pile(32, -40, 3);
  tyres.push(P(-50, 42, { rx: Math.PI / 2, y: 0.08, ry: 1 }), P(18, 50, { ry: 0.8, y: 0.3, rz: 0.15 }), P(-20, 30, { ry: 2, y: 0.3, rz: -0.1 }), P(52, -24, { rx: Math.PI / 2, y: 0.08 }));
  instanceModel(world, 'old_tyre', tyres, 'concrete', { castShadow: false });

  // ---- road barriers: heavy models used sparingly near hero routes -------------
  instanceModel(world, 'concrete_road_barrier_02', [P(12, 24, { ry: 0.05 }), P(13.6, 24, { ry: -0.03 }), P(-1, 36, { ry: 1.6 }), P(2, -24, { ry: 1.5 })], 'concrete');
  for (const [x, z] of [[12.8, 24], [-1, 36], [2, -24]]) { world.cover(x, z + 1.1, 0, 1); world.cover(x, z - 1.1, 0, -1); }

  // ---- carts, generators, welding, jerrycans, toolboxes, ladders --------------
  instanceModel(world, 'industrial_storage_cart', [P(wh.x0 + 12, wh.z0 + 22, { ry: 0.3 }), P(-18, -28, { ry: 1.2 })], 'metal');
  instanceModel(world, 'portable_generator', [P(-6, 26, { ry: 0.6 }), P(sb.x0 - 2, sb.z1 + 2, { ry: 2.8 })], 'metal');
  instanceModel(world, 'portable_welding_cart', [P(-19, -30, { ry: 0.4 })], 'metal');
  instanceModel(world, 'metal_jerrycan', [P(-6.8, 26.6, { ry: 0.3 }), P(-45, 33, { ry: 1.1 })], 'metal', { castShadow: false });
  instanceModel(world, 'metal_toolbox', [P(-6, 25.3, { y: 0.0, ry: 1.2 }), P(dk.x0 + 2, dk.z0 + 5.5, { y: dk.h, ry: 0.4 })], 'metal', { castShadow: false });
  instanceModel(world, 'ladder_sectioned_01', [P(wh.x1 - 0.55, -36, { ry: Math.PI / 2, rz: 0.0, rx: -0.2, y: 0.05 }), P(-22.6, 46, { ry: -Math.PI / 2, rx: -0.15, y: 0.05 })], 'metal', { collide: false, castShadow: false });

  // ---- wall-mounted: power boxes, utility boxes, pipe modules ------------------
  instanceModel(world, 'power_box_01', [P(wh.x1 + 0.06, -40, { y: 1.5, ry: Math.PI / 2 }), P(sb.x0 + 1.5, sb.z1 + 0.06, { y: 1.5 })], 'metal', { collide: false, castShadow: false });
  instanceModel(world, 'utility_box_01', [P(wh.x1 + 0.3, -44, { ry: Math.PI / 2 }), P(sb.x1 + 0.3, sb.z0 + 3, { ry: Math.PI / 2 }), P(sb.x1 + 0.3, sb.z0 + 4, { ry: Math.PI / 2 }), P(-56.5, -30, { ry: -Math.PI / 2 }), P(-56.5, 20, { ry: -Math.PI / 2 })], 'metal');
  const pipes = [];
  for (let i = 0; i < 3; i++) pipes.push(P(wh.x1 + 0.12, -50 + i * 0.6, { y: 1.0, ry: -Math.PI / 2 }));
  for (let i = 0; i < 2; i++) pipes.push(P(sb.x1 - 8 + i * 0.6, sb.z1 + 0.14, { y: 1.0, ry: Math.PI }));
  instanceModel(world, 'modular_industrial_pipes_01', pipes, 'metal', { collide: false, castShadow: false });

  // ---- trash --------------------------------------------------------------------
  instanceModel(world, 'metal_trash_can', [P(HUT.x + 2.4, HUT.z - 1.4, { ry: 0.4 }), P(wh.x1 + 1, -27, { ry: 1.1 }), P(-12, 24, { ry: 2 })], 'metal', { castShadow: false });
  instanceModel(world, 'trashbag', [P(HUT.x + 3.1, HUT.z - 1.0, { ry: 0.4 }), P(HUT.x + 3.4, HUT.z - 1.9, { ry: 1.4 }), P(wh.x1 + 1.6, -27.6, { ry: 2.1 }), P(wh.x1 + 1.9, -26.8, { ry: 0.1 }), P(-12.7, 24.6, { ry: 0.6 }), P(-56.5, 44, { ry: 0.3 }), P(-56.3, 44.6, { ry: 2.8 }), P(54, 26, { ry: 1 }), P(31, -43.4, { ry: 2.6 })], 'wood', { collide: false, castShadow: false });

  // ---- overhead crane inside the warehouse (scaled up to suit the bay) --------
  instanceModel(world, 'overhead_crane', [P(wh.x0 + 22, wh.z0 + 20, { y: 7.9, s: 1.6, ry: Math.PI / 2 })], 'metal', { collide: false, castShadow: false });
}
