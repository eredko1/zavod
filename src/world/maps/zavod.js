// MAP: ZAVOD — rainy night container yard / shipyard. Owned by: ZAVOD-DEPTH agent (plus ../sky ../ground ../structures ../containers ../props ../lamps ../rain ../distant ../mats).
import * as THREE from 'three';
import { buildSky } from '../sky.js';
import { buildGround } from '../ground.js';
import { buildStructures } from '../structures.js';
import { buildContainers } from '../containers.js';
import { buildProps } from '../props.js';
import { buildLamps } from '../lamps.js';
import { buildRain } from '../rain.js';
import { buildDistant } from '../distant.js';

export const meta = {
  id: 'zavod', name: 'ZAVOD', subtitle: 'NIGHT OPS · CONTAINER YARD', time: 'night', weather: 'rain',
  description: 'Rain-soaked shipyard. Sodium lamps, stacked containers, a half-open warehouse and a gantry crane.',
  grade: 'night', ambience: 'rain-industrial', thumb: 'assets/thumbs/zavod.jpg',
};

export function build(world) {
  const { ctx, W, scene } = world;
  ctx.renderer.toneMappingExposure = 1.25;
  W.bounds.set(new THREE.Vector3(-58, -1, -58), new THREE.Vector3(58, 30, 58));
  ctx.progress(0.13, 'sky'); buildSky(world);
  ctx.progress(0.15, 'ground'); buildGround(world);
  ctx.progress(0.17, 'structures'); buildStructures(world);
  ctx.progress(0.19, 'containers'); buildContainers(world);
  ctx.progress(0.21, 'props'); buildProps(world);
  ctx.progress(0.22, 'lamps'); buildLamps(world);
  ctx.progress(0.23, 'distant'); buildDistant(world);
  ctx.progress(0.24, 'rain'); buildRain(world);

  // ---- steel observation platform + ladder near spawn (also the ladder test rig) ----
  {
    const px = -12, pz = 40, top = 3.0, hw = 2.0;
    const steel = new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.6, metalness: 0.8 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 0.12, hw * 2), steel); deck.position.set(px, top - 0.06, pz); deck.name = 'platform'; scene.add(deck);
    world.solid(deck, 'metal', { collide: false }); world.walkable([px - hw, top - 0.12, pz - hw], [px + hw, top, pz + hw]);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, top, 0.16), steel); leg.position.set(px + sx * (hw - 0.1), top / 2, pz + sz * (hw - 0.1)); leg.name = 'leg'; scene.add(leg); world.solid(leg, 'metal'); }
    // railing on three sides (thin colliders), open on the ladder side (+z)
    for (const [x0, z0, x1, z1] of [[px - hw, pz - hw, px + hw, pz - hw + 0.05], [px - hw, pz - hw, px - hw + 0.05, pz + hw], [px + hw - 0.05, pz - hw, px + hw, pz + hw]]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 1.05, z1 - z0), steel); r.position.set((x0 + x1) / 2, top + 0.52, (z0 + z1) / 2); r.name = 'rail'; scene.add(r); world.solid(r, 'metal');
    }
    world.ladder(px, pz + hw, 0, top, 0, 1);
    world.cover(px, pz - 1, 0, -1, top); W.poses.platform = [px, top, pz, 0.3, -0.15];
  }
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
  W.surfaceAt = (p) => (p.y > 0.2 ? 'metal' : 'ground');
}
