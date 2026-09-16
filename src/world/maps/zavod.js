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
  const { ctx, W } = world;
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
