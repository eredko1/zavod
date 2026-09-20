// MAP: STONY BROOK — Stony Brook University's Academic Mall and the campus around it, 1:1 from an OSM plan (see ../sbu/RESEARCH.md). Owned by: SBU agent (this file + ../sbu/*).
// Levels: mall y=0 · Staller sunken plaza −3 with 8 grass terraces (0.375 m each) · SAC vestibule roof +4.6 (ladder) · Staller wing terrace 0 from the plaza (ladder).
import * as THREE from 'three';
import { makeMats } from '../sbu/mats.js';
import { buildSky } from '../sbu/sky.js';
import { buildGround, groundHeight } from '../sbu/ground.js';
import { buildBuildings } from '../sbu/buildings.js';
import { buildProps } from '../sbu/props.js';
import { BOUNDS, MALL, SAC_PLAZA, PIT, BUS_LOOP, ENG_DRIVE, LIB, SAC, FREY, ZEBRA, PSY, STALLER, FOUNTAIN, EAST_LAWN } from '../sbu/layout.js';

export const meta = {
  id: 'sbu', name: 'UNIVERSITY', subtitle: 'DAY OPS · ACADEMIC MALL', time: 'day', weather: 'clear',
  description: 'A sprawling state university campus: the brutalist library tower over the academic mall, the student center, arts plaza and lecture halls, ringed by campus drives.',
  grade: 'day', ambience: 'sbu-day', thumb: 'assets/thumbs/sbu.jpg',
};

export function build(world) {
  const { ctx, W } = world;
  W.bounds.set(new THREE.Vector3(BOUNDS.x0, -4, BOUNDS.z0), new THREE.Vector3(BOUNDS.x1, 60, BOUNDS.z1));
  W.groundHeight = groundHeight;

  ctx.progress(0.13, 'university: sky'); buildSky(world);
  const M = makeMats(world); world.mats = M;
  ctx.progress(0.15, 'university: ground'); buildGround(world, M);
  ctx.progress(0.18, 'university: buildings'); buildBuildings(world, M);
  ctx.progress(0.22, 'university: props'); buildProps(world, M);

  // ---- gameplay ------------------------------------------------------------------------------------------------------
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  W.playerSpawns = [v(-100, 0, 24), v(-104, 0, 34), v(-96, 0, 12), v(-110, 0, 20)];                         // SAC plaza, west side
  W.enemySpawns = [
    v(27, 0, -12), v(-5, 0, -40), v(60, 0, -8), v(100, 0, -6), v(136, 0, -18),                                // library forecourt / mall east
    v(90, 0, -100), v(120, groundHeight(120, -95), -95), v(139, PIT.floor, -100), v(144, 0, -80),              // Staller terraces / plaza / wing terrace
    v(60, 0, 24), v(140, 0, 40), v(-35, 0, -80), v(-70, 0, -40), v(-125, 0, -50), v(30, 0, 92), v(160, 0, 4),   // Psychology, east lawn, Zebra Path, Frey, Harriman alley, south alley, Admin gate
  ];
  // extra cover along facades and the mall furniture (props/ground added the rest)
  for (let x = -8; x < 70; x += 12) world.cover(x, LIB.z1 + 1.4, 0, 1);                                        // library face
  for (let x = -76; x < -46; x += 10) world.cover(x, FREY.z1 + 1.2, 0, 1);                                     // Frey south face
  for (let z = -100; z < -50; z += 12) { world.cover(FREY.x1 + 1.2, z, 1, 0); world.cover(LIB.x0 - 1.2, z, -1, 0); } // Zebra Path walls
  for (let x = 58; x < 114; x += 12) world.cover(x, PSY.z0 - 1.2, 0, -1);                                      // Psychology north face
  for (let z = 24; z < 64; z += 10) world.cover(SAC.x1 + 1.2, z, 1, 0);                                        // SAC east face
  for (let z = -130; z < -70; z += 12) world.cover(STALLER.ex0 - 1.2, z, -1, 0, PIT.floor);                     // Staller entrance face (pit floor)
  for (let z = -120; z < -70; z += 12) world.cover(LIB.x1 + 1.2, z, 1, 0);                                     // library east face (terrace top)
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) world.cover(FOUNTAIN.x + Math.cos(a) * (FOUNTAIN.ring + 1), FOUNTAIN.z + Math.sin(a) * (FOUNTAIN.ring + 1), Math.cos(a), Math.sin(a));

  W.poses = {
    spawn: [-104, 0, 24, -1.5, 0.0],                       // SAC plaza, looking east along the mall
    hero: [-62, 0, 3, -1.32, 0.06],                        // the mall: library on the left, SAC drum on the right, fountain far ahead
    overview: [-165, 80, 120, -0.9, -0.42],                // high from the SW over the plaza, mall and library
    library: [27, 0, 4, 0.0, 0.12],                        // the entrance walk, "LIBRARY" over the doors
    sac: [-106, 0, 40, -1.62, 0.08],                       // the glass front from the plaza
    staller: [88, 0, -100, -1.45, -0.12],                  // top of the lawn steps: arts-center balcony and fly tower ahead
    steps: [138, PIT.floor, -92, 1.35, 0.12],             // from the sunken plaza floor up the grass terraces to the library's east face
    wang: [176, 0, -66, -0.86, 0.12],                      // east of the arts wing, NE to the arts-center portal, towers and spire
    frey: [-28, 0, -34, 0.35, 0.1],                        // Zebra Path mouth, Frey's ribbed concrete on the left
    zebra: [-35, 0, -104, 3.14, 0.02],                     // down the Zebra Path toward the mall
    roads: [-112, 0, 71, 2.75, -0.02],                      // the bus loop on Campus Drive
    fountain: [124, 0, 9, -1.15, 0.05],                    // fountain with the Administration building beyond
    terrace: [-83.2, 4.6, 33, 2.2, -0.1],                  // SAC vestibule roof (ladder), looking SW over the plaza
    javits: [142, 0, 116, 2.95, 0.1],                      // SE lawn edge, south to the round lecture-hall drums
    plaza: [-96, 0, 24, 1.0, -0.05],                        // centre of the SAC plaza, radial bands, buses beyond
  };
  W.surfaceAt = (p) => {
    const { x, z } = p;
    if (p.y > 1.5) return 'concrete';
    if (x >= PIT.floorX0 && x <= PIT.x1 && z >= PIT.z0 && z <= PIT.z1) return 'concrete';
    if (z >= MALL.z0 && z <= MALL.z1 && x >= MALL.x0 && x <= MALL.x1) return 'concrete';
    if (x >= ZEBRA.x - 5 && x <= ZEBRA.x + 5 && z >= ZEBRA.z0 && z <= MALL.z0) return 'concrete';
    if (x >= -125 && x <= -24 && z >= -16 && z <= 65) return 'concrete';
    if (Math.hypot(x - BUS_LOOP.x, z - BUS_LOOP.z) < BUS_LOOP.r + BUS_LOOP.w) return 'concrete';
    if (x >= ENG_DRIVE.x0 - 3 && x <= ENG_DRIVE.x1 + 3 && z >= ENG_DRIVE.z0) return 'concrete';
    return 'ground';
  };
}
