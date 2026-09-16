// MAP: RAILYARD — daytime multi-level freight yard. Owned by: RAILYARD agent (this file plus ../railyard/*.js helpers and assets/models/railyard/).
// Levels: yard floor y=0 · wagon decks y=1.2 · loading platform / goods shed y=1.1 · office first floor y=3.6 · office roof y=7.2 · road overpass y=7.5 (ramps at both ends).
import * as THREE from 'three';
import { makeMats } from '../railyard/mats.js';
import { buildSky } from '../railyard/sky.js';
import { buildGround, buildWeeds } from '../railyard/ground.js';
import { buildTracks } from '../railyard/tracks.js';
import { buildStock } from '../railyard/stock.js';
import { buildStructures } from '../railyard/structures.js';
import { buildYard } from '../railyard/yard.js';
import { buildProps, weedSpots } from '../railyard/props.js';
import { TRACK_X, PLATFORM, SHED, OFFICE, OVERPASS, ROAD_E, ROAD_W, GAUGE, RAIL_TOP, SLEEPER_TOP, CAR_FLOOR } from '../railyard/layout.js';

export const meta = {
  id: 'railyard', name: 'RAILYARD', subtitle: 'DAY OPS · FREIGHT YARD', time: 'day', weather: 'clear',
  description: 'Multi-level freight yard under a bright noon sky: eight tracks of rolling stock, a loading platform and goods shed, a two-storey signal box with a walkable roof, and a road overpass crossing the yard.',
  grade: 'day', ambience: 'railyard-day', thumb: 'assets/thumbs/railyard.jpg',
};

export function build(world) {
  const { ctx, W } = world;
  W.bounds.set(new THREE.Vector3(-66, -1, -66), new THREE.Vector3(66, 40, 66));

  ctx.progress(0.13, 'railyard: sky'); buildSky(world);
  const M = makeMats(world); world.mats = M;
  ctx.progress(0.15, 'railyard: ground'); buildGround(world, M);
  ctx.progress(0.17, 'railyard: tracks'); buildTracks(world, M);
  ctx.progress(0.19, 'railyard: rolling stock'); buildStock(world, M);
  ctx.progress(0.21, 'railyard: structures'); buildStructures(world, M);
  ctx.progress(0.23, 'railyard: yard'); buildYard(world, M);
  ctx.progress(0.24, 'railyard: props'); buildProps(world);
  buildWeeds(world, weedSpots(world));

  // ---- gameplay data --------------------------------------------------------------------------------------
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  W.playerSpawns = [v(-7.5, 0, 58), v(3.5, 0, 60), v(-14, 0, 57), v(9.5, 0, 58)];
  W.enemySpawns = [
    // north yard floor (behind / under the overpass)
    v(-10.5, 0, -56), v(-1.5, 0, -52), v(9.5, 0, -58), v(-31.5, 0, -50), v(20, 0, -46), v(-24.5, 0, -30),
    // mid yard lanes
    v(-13, 0, -2), v(3.5, 0, -4), v(-2, 0, 20), v(-31, 0, -18), v(9.5, 0, 18),
    // platform + shed floor (1.1) and a flatcar deck (1.2)
    v(21, PLATFORM.h, -20), v(21.5, PLATFORM.h, 10), v(30, SHED.floor, 0), v(-5, CAR_FLOOR, -14.2),
    // overpass deck and ramps (7.5) and the office roof / first floor
    v(-20, OVERPASS.top, -44), v(12, OVERPASS.top, -44), v(48.5, OVERPASS.top, -42), v(-48.5, OVERPASS.top, -42),
    v(-38, OFFICE.roof, 11), v(-38, OFFICE.floor1, 11),
    // depot + east road
    v(-47, 0, 40), v(-38, 0, 46), v(48.5, 0, 20), v(38, 0, 30), v(-50, 0, 0),
  ];
  // (cover points are pushed by the builders; top up along open lanes)
  for (const z of [-20, 0, 20, 40]) { world.cover(TRACK_X[3] - 1.7, z, -1, 0); world.cover(TRACK_X[3] + 1.7, z, 1, 0); }

  W.poses = {
    spawn: [-7.5, 0, 58, 0.06, 0.0],
    hero: [-10.5, 0, 34, 0.02, 0.01],                 // down the open lane: boxcars left, flatcars right, gantry + overpass ahead
    overview: [-96, 44, 92, 0.78, -0.42],
    tracks: [-13.2, 0, -10, -0.55, 0.02],             // between the tank cars and the lane, looking NE across the yard
    overpass: [8, OVERPASS.top, -44.5, -2.35, -0.18], // on the deck, looking back SE over the yard and platform
    office_roof: [-37, OFFICE.roof, 12.5, -1.15, -0.12],
    platform: [21.2, PLATFORM.h, 24, 0.35, 0.0],      // along the platform under the canopy, boxcars beside
    depot: [-37.5, 0, 46.5, 1.62, 0.02],              // toward the tank farm
    office_int: [-34.5, OFFICE.floor1, 12, 1.2, -0.05],
    ramp: [48.5, 3.0, -20, 0.55, -0.05],
    boxcar: [-27, CAR_FLOOR, -18.4, 1.55, 0.0],
    shed: [30, SHED.floor, 4, 2.6, 0.0],
  };
  W.groundHeight = () => 0;
  W.surfaceAt = (p) => {
    const x = p.x, z = p.z, y = p.y;
    if (x >= PLATFORM.x0 - 0.2 && x <= SHED.x1 + 0.5 && Math.abs(z) <= 34.5 && y > 0.8) return 'concrete';
    if (z >= OVERPASS.z0 - 0.5 && z <= OVERPASS.z1 + 0.5 && y > 6) return 'concrete';
    if (((x >= ROAD_E.x0 && x <= ROAD_E.x1) || (x >= ROAD_W.x0 && x <= ROAD_W.x1)) && z < 0) return 'concrete';
    if (x >= OFFICE.x0 - 0.5 && x <= OFFICE.x1 + 0.5 && z >= OFFICE.z0 - 0.5 && z <= OFFICE.z1 + 2) return 'concrete';
    for (const tx of TRACK_X) {
      const d = Math.abs(x - tx);
      if (d < 1.8) {
        if (y > CAR_FLOOR - 0.15) return 'metal';                          // rolling stock
        if (Math.abs(d - GAUGE / 2) < 0.12 && y > SLEEPER_TOP - 0.02) return 'metal';  // rail
        if (y > 0.1 && y <= RAIL_TOP + 0.05 && d < 1.3) return 'wood';       // sleepers
        return 'ground';
      }
    }
    return 'ground';
  };
}
