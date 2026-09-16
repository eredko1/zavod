// RAILYARD props: instanced Poly Haven models (barrels, crates, tyres, barriers, carts, generators…) + weed spots. RAILYARD agent.
import { instanceModel } from '../props.js';
import { PLATFORM, SHED, OFFICE, DEPOT, ROAD_E, TRACK_X, FENCE } from './layout.js';

export function buildProps(world) {
  const { R } = world;
  const j = (a) => (R() - 0.5) * a; const rot = () => R() * Math.PI * 2;
  const P = (x, z, extra = {}) => ({ x, z, ...extra });
  const ph = PLATFORM.h, sf = SHED.floor;

  // barrels: depot, behind the office, platform ends, SE yard, under the overpass
  const barrels = [];
  const cluster = (x, z, n, r = 1.2, y) => { for (let i = 0; i < n; i++) barrels.push(P(x + j(r * 2), z + j(r * 2), { ry: rot(), y })); };
  cluster(-45.5, 47, 6, 1.5); cluster(-56, 52, 4, 1.2); cluster(-37, 41, 3, 1.0); cluster(-30, 10, 4, 1.2); cluster(38, 52, 5, 1.4); cluster(30, -46, 4, 1.2); cluster(-46, -44, 5, 1.4); cluster(46, 30, 3, 1.0);
  barrels.push(P(24.5, -32, { ry: rot(), y: ph }), P(24.5, -31.1, { ry: rot(), y: ph }), P(24.6, 32.5, { ry: rot(), y: ph }), P(-6.5, -40, { rx: Math.PI / 2, y: 0.32, ry: 0.4 }), P(-12, 30, { rx: Math.PI / 2, y: 0.32, ry: 1.3 }));
  instanceModel(world, 'barrel_03', barrels, 'metal');
  for (const b of barrels.slice(0, 10)) world.cover(b.x + 0.9, b.z, 1, 0);

  // crates: shed interior (floor 1.1), platform, office ground floor, depot
  instanceModel(world, 'old_military_crate', [P(30, -6, { y: sf, ry: 0.2 }), P(30, -6, { y: sf + 0.36, ry: 0.3 }), P(31.2, 2, { y: sf, ry: 1.2 }), P(-41, 13.5, { ry: 0.1 }), P(22, 8, { y: ph, ry: 0.4 }), P(-43, 36, { ry: 2 })], 'wood');
  instanceModel(world, 'wooden_military_crate', [P(29, 4, { y: sf, ry: 1.5 }), P(29, 4, { y: sf + 0.42, ry: 1.55 }), P(21.5, -12, { y: ph, ry: 0.3 }), P(-41.5, 8, { ry: 0.3 }), P(34, 56, { ry: 0.9 }), P(34.6, 55.2, { ry: 1.2 })], 'wood');
  instanceModel(world, 'wooden_crate_01', [P(28, -9, { y: sf, ry: 0.9 }), P(22.5, 20, { y: ph, ry: 1.0 }), P(22.5, 21, { y: ph, ry: 0.4 }), P(-9.2, 50, { ry: 0.2 }), P(41, 54, { ry: 2.2 })], 'wood');
  instanceModel(world, 'cardboard_box_01', [P(31, 8, { y: sf, ry: 0.4 }), P(28.5, -3, { y: sf, ry: 1.1 }), P(23, 6.8, { y: ph, ry: 0.7 })], 'wood', { castShadow: false });
  instanceModel(world, 'plastic_crate_01', [P(-33.4, 12.5, { ry: 0.2 }), P(-33.4, 12.5, { y: 0.26, ry: 0.1 }), P(31.5, -1, { y: sf, ry: 0.4 })], 'metal', { castShadow: false });
  instanceModel(world, 'industrial_pastic_container', [P(-31, 16.5, { ry: 0.3 }), P(38, 58, { ry: 2.4 })], 'metal', { castShadow: false });
  instanceModel(world, 'ammo_box', [P(-42.5, 12, { y: 0.0, ry: 0.3 }), P(22.3, -12.4, { y: ph + 0.36, ry: 0.5 }), P(-37, 15, { y: OFFICE.floor1, ry: 1.1 })], 'metal', { castShadow: false });

  // tyres: SE yard + depot corner + by the guard hut
  const tyres = [];
  const pile = (x, z, n) => { for (let k = 0; k < n; k++) tyres.push(P(x + j(0.08), z + j(0.08), { rx: Math.PI / 2, y: 0.08 + k * 0.16, ry: rot() })); };
  pile(42, 40, 5); pile(41.3, 41.2, 3); pile(-58, 44, 4); pile(52, 52, 5); pile(51.2, 53.2, 2); pile(-56, 60, 3);
  tyres.push(P(44, 43, { rx: Math.PI / 2, y: 0.08, ry: 1 }), P(-57, 47, { ry: 0.8, y: 0.3, rz: 0.15 }));
  instanceModel(world, 'old_tyre', tyres, 'concrete', { castShadow: false });

  // road barriers: ramp feet, gate, office forecourt
  instanceModel(world, 'concrete_road_barrier_02', [P(48.5, 2, { ry: 1.57 }), P(48.5, 60, { ry: 1.5 }), P(-48.5, 2, { ry: 1.6 }), P(-29.5, 14, { ry: 0.03 }), P(-29.5, 8, { ry: -0.02 })], 'concrete');
  for (const [x, z] of [[48.5, 2], [-48.5, 2], [-29.5, 14], [-29.5, 8]]) { world.cover(x, z + 1.1, 0, 1); world.cover(x, z - 1.1, 0, -1); }
  instanceModel(world, 'concrete_road_barrier', [P(5, 60, { ry: 0.1 }), P(-3, 60, { ry: -0.1 }), P(-3, -60, { ry: 0.05 }), P(12, -60, { ry: 0.05 })], 'concrete');

  // carts, generators, welding, jerrycans, toolboxes, ladders, trash
  instanceModel(world, 'industrial_storage_cart', [P(20, -22, { y: ph, ry: 1.57 }), P(-34, -8, { ry: 0.3 }), P(29, 9, { y: sf, ry: 0.2 })], 'metal');
  instanceModel(world, 'portable_generator', [P(-30, 6, { ry: 0.6 }), P(37, 38, { ry: 2.8 }), P(21, 30, { y: ph, ry: 1.6 })], 'metal');
  instanceModel(world, 'portable_welding_cart', [P(-33, -9.5, { ry: 0.4 }), P(-12.5, -50, { ry: 1.9 })], 'metal');
  instanceModel(world, 'metal_jerrycan', [P(-44.8, 46, { ry: 0.3 }), P(-45.4, 46.4, { ry: 1.1 }), P(-36.5, 40, { ry: 2.2 }), P(-30.6, 6.6, { ry: 0.3 })], 'metal', { castShadow: false });
  instanceModel(world, 'metal_toolbox', [P(-29.6, 6.4, { ry: 1.2 }), P(20.5, -21, { y: ph, ry: 0.4 }), P(-36, 12, { y: OFFICE.floor1, ry: 0.4 })], 'metal', { castShadow: false });
  instanceModel(world, 'ladder_sectioned_01', [P(OFFICE.x0 - 0.55, 9, { ry: -Math.PI / 2, rx: -0.2, y: 0.05 }), P(SHED.x1 + 0.55, 20, { ry: Math.PI / 2, rx: -0.15, y: 0.05 })], 'metal', { collide: false, castShadow: false });
  instanceModel(world, 'metal_trash_can', [P(OFFICE.x1 + 1.2, 13, { ry: 0.4 }), P(24.6, -2, { y: ph, ry: 1.1 }), P(49, 58, { ry: 2 })], 'metal', { castShadow: false });
  instanceModel(world, 'trashbag', [P(OFFICE.x1 + 1.9, 13.4, { ry: 0.4 }), P(OFFICE.x1 + 2.2, 12.6, { ry: 1.4 }), P(24.9, -2.7, { y: ph, ry: 2.1 }), P(-31.2, -30, { ry: 0.1 }), P(-30.6, -29.4, { ry: 0.6 }), P(50, 57.5, { ry: 0.3 })], 'wood', { collide: false, castShadow: false });
  instanceModel(world, 'utility_box_01', [P(OFFICE.x1 + 0.3, 7.6, { ry: Math.PI / 2 }), P(-30.2, -40, { ry: -Math.PI / 2 }), P(SHED.x1 + 0.3, 24, { ry: Math.PI / 2 }), P(SHED.x1 + 0.3, 25, { ry: Math.PI / 2 })], 'metal');
  instanceModel(world, 'power_box_01', [P(OFFICE.x1 + 0.06, 14.8, { y: 1.5, ry: Math.PI / 2 }), P(SHED.x0 - 0.06, -26, { y: ph + 1.5, ry: -Math.PI / 2 })], 'metal', { collide: false, castShadow: false });
  instanceModel(world, 'modular_industrial_pipes_01', [P(SHED.x1 + 0.12, 28, { y: 1.0, ry: Math.PI / 2 }), P(SHED.x1 + 0.12, 28.6, { y: 1.0, ry: Math.PI / 2 })], 'metal', { collide: false, castShadow: false });
}

/** Weed spots: ballast shoulders, fence line, wall feet, cracks in the aprons. */
export function weedSpots(world) {
  const { R } = world; const spots = [];
  for (const tx of TRACK_X) for (let z = -64; z < 64; z += 0.9) { if (R() < 0.55) spots.push({ x: tx + (R() < 0.5 ? -1 : 1) * (1.9 + R() * 0.7), z: z + R() * 0.8, s: 0.35 + R() * 0.5 }); }
  for (let a = -FENCE; a < FENCE; a += 1.1) { if (R() < 0.7) { spots.push({ x: a + R(), z: -FENCE + 0.4 + R() * 1.2, s: 0.5 + R() * 0.7 }); spots.push({ x: a + R(), z: FENCE - 0.4 - R() * 1.2, s: 0.5 + R() * 0.7 }); spots.push({ x: -FENCE + 0.4 + R() * 1.2, z: a + R(), s: 0.5 + R() * 0.7 }); spots.push({ x: FENCE - 0.4 - R() * 1.2, z: a + R(), s: 0.5 + R() * 0.7 }); } }
  for (let i = 0; i < 260; i++) spots.push({ x: (R() - 0.5) * 124, z: (R() - 0.5) * 124, s: 0.3 + R() * 0.4 });
  for (let i = 0; i < 120; i++) { const a = R() * Math.PI * 2; const r = 66 + R() * 40; spots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.6 + R() * 0.9 }); }
  for (let z = OFFICE.z0; z < OFFICE.z1; z += 0.7) spots.push({ x: OFFICE.x0 - 0.4 - R() * 0.4, z, s: 0.4 + R() * 0.4 });
  for (let x = -60; x < -34; x += 0.8) spots.push({ x, z: DEPOT.z1 + 0.6 + R() * 1.5, s: 0.5 + R() * 0.6 });
  return spots.filter(s => !(s.x > PLATFORM.x0 - 1 && s.x < SHED.x1 + 1 && Math.abs(s.z) < 35) && !(s.x > ROAD_E.x0 && s.x < ROAD_E.x1) && !(s.x > -53 && s.x < -44 && s.z > -40 && s.z < 26));
}
