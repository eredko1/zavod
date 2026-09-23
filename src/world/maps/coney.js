// MAP: CONEY ISLAND — the amusement district, boardwalk and beach, 1:1 from an OSM plan (qa/tools/osm-coney.py) with hand-built
// landmarks to the reference photos (qa/refs/coney). Levels: streets / amusement area / boardwalk y = 0 · beach sand −1.3 → −2.4
// at the waterline (stairs every ~95 m) · pier deck 0 · wheel platform +0.6 · ballpark stands to +8. Owned by: CONEY agent.
import * as THREE from 'three';
import { makeConeyMats } from '../coney/mats.js';
import { buildSky } from '../sbu/sky.js';
import { buildCity } from '../coney/city.js';
import { buildShore, BW, sandHeight, waterZ, SAND_TOP } from '../coney/shore.js';
import { buildLandmarks, LM } from '../coney/landmarks.js';
import { buildBeachLife } from '../coney/life.js';
import { buildPark } from '../coney/park.js';
import { OSM, PLAY } from '../coney/osm.js';
import { bbox } from '../osmkit.js';

export const meta = {
  id: 'coney', name: 'CONEY ISLAND', subtitle: 'DAY OPS · BOARDWALK', time: 'day', weather: 'clear',
  description: 'Summer afternoon on the seaside amusement strip: the wonder wheel and the wooden coaster, the parachute tower, sideshow fronts, the plank boardwalk and a packed beach down to the surf.',
  grade: 'day', ambience: 'sbu-day', thumb: 'assets/thumbs/sbu.jpg',
};

export function build(world) {
  const { ctx, W } = world;
  W.bounds.set(new THREE.Vector3(PLAY.x0, -6, PLAY.z0), new THREE.Vector3(PLAY.x1, 90, PLAY.z1));
  const piers = OSM.pi.map((p) => bbox(p.p)).filter((q) => q.z1 > BW.z1 + 40 && q.z0 < BW.z1 + 20).map((q) => ({ x0: (q.x0 + q.x1) / 2 - 5.5, x1: (q.x0 + q.x1) / 2 + 5.5, z1: q.z1 }));
  W.groundHeight = (x, z) => {
    if (z <= BW.z1) return 0;
    for (const p of piers) if (x > p.x0 && x < p.x1 && z < p.z1) return 0;
    return sandHeight(x, z);
  };
  ctx.progress(0.13, 'coney: sky'); buildSky(world, { shadowHalf: 130, center: [0, 0, 0] });
  const M = makeConeyMats(world); world.mats = M;
  ctx.progress(0.15, 'coney: streets + blocks'); buildCity(world, M);
  ctx.progress(0.19, 'coney: boardwalk + beach'); buildShore(world, M);
  ctx.progress(0.22, 'coney: rides + landmarks'); buildLandmarks(world, M);
  ctx.progress(0.23, 'coney: park'); buildPark(world, M);

  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  W.playerSpawns = [v(-60, 0, 148), v(-40, 0, 150), v(-80, 0, 146), v(-60, 0, 125), v(-150, 0, 120), v(20, 0, 128)];
  W.enemySpawns = [
    v(110, 0, 148), v(180, 0, 150), v(240, 0, 148), v(-220, 0, 148), v(-320, 0, 150), v(-400, 0, 146),           // boardwalk
    v(64, 0, 40), v(120, 0, 20), v(0, 0, 80), v(-150, 0, 60), v(-250, 0, 90), v(-330, 0, 100),                   // amusement area / plaza
    v(-100, 0, -140), v(40, 0, -130), v(160, 0, -130), v(-250, 0, -130),                                          // Surf Avenue
    v(-50, 0, -250), v(-20, 0, -320), v(100, 0, -250), v(-360, 0, -150),                                          // north blocks / terminal
    v(-100, sandHeight(-100, 220), 220), v(60, sandHeight(60, 230), 230), v(-360, 0, 300),                        // beach + pier
  ];
  // poses by eye point + look-at target (yaw 0 = -z, yaw -pi/2 = +x)
  const look = (x, y, z, tx, ty, tz) => { const dx = tx - x, dy = ty - y, dz = tz - z; return [x, y, z, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))]; };
  const W0 = LM.wheel, PJ = LM.pj;
  W.poses = {
    spawn: look(-60, 0, 148, 60, 6, 120),                       // on the boardwalk looking east toward the wheel and the coasters
    hero: look(-10, 0, 150, 90, 14, 70),                         // boardwalk: wheel ahead-left, coaster beyond, beach right
    overview: look(-120, 70, 330, 0, 0, 20),                     // over the surf, whole strip from the ocean side
    wheel: look(W0.x + 30, 0, 150, W0.x, 24, W0.z),             // the wheel from the boardwalk
    coaster: look(240, 0, 150, 195, 16, 40),                     // the wooden coaster's timber lattice from the boardwalk
    parachute: look(-345, 0, 150, PJ.x, 45, PJ.z),               // the parachute tower from the boardwalk
    beach: look(-20, -1.5, 215, 20, 8, 100),                     // down on the sand, looking back at the boardwalk and the rides
    surf: look(-80, -2.2, 262, -300, 0, 262),                    // wet sand at the waterline, along the beach
    pier: look(-363, 0, 330, -300, 15, 120),                     // out on the pier looking back at the strip
    sideshow: look(20, 0, -100, 110, 4, -60),                    // the amusement strip street: shutters and painted banners
    surfave: look(-140, 0, -160, 100, 6, -160),                  // the avenue
    terminal: look(-55, 0, -225, -55, 8, -270),                  // the terminal frontage + train shed
    ballpark: look(-300, 0, -130, -330, 10, -60),                // the ballpark's brick wall and light towers
    rides: look(-30, 0, 60, 60, 6, 40),                          // inside the amusement park among the flat rides
  };
  // QA guard: a pose whose eye is inside a collider is walked backwards along its view line until it is in the open
  for (const [k, p] of Object.entries(W.poses)) {
    const inside = (x, y, z) => ctx.colliders.some((b) => x > b.min.x && x < b.max.x && y > b.min.y && y < b.max.y && z > b.min.z && z < b.max.z);
    const fx = -Math.sin(p[3]), fz = -Math.cos(p[3]); let d = 0;
    while (d < 60 && inside(p[0] - fx * d, p[1] + 1.6, p[2] - fz * d)) d += 1;
    if (d) { p[0] -= fx * (d + 1.5); p[2] -= fz * (d + 1.5); }
  }
  for (let x = PLAY.x0 + 10; x < PLAY.x1; x += 22) world.cover(x, BW.z1 - 2.8, 0, -1);
  ctx.progress(0.24, 'coney: crowds'); try { buildBeachLife(world, M); } catch (e) { console.warn('[coney] life', e); }

  W.surfaceAt = (p) => {
    if (p.z > BW.z1 && p.y < -0.5) return 'ground';
    if (p.z > BW.z0 && p.z < BW.z1 + 0.5) return 'wood';
    return 'concrete';
  };
}
