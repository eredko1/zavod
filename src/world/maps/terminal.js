// MAP: GRAND CENTRAL — real Grand Central Terminal (Manhattan), four levels. Owned by: TERMINAL agent (helpers in ../terminal/*). See ../terminal/RESEARCH.md.
import * as THREE from 'three';
import { P } from '../terminal/plan.js';
import { makeMats } from '../terminal/mats.js';
import { buildLighting } from '../terminal/lighting.js';
import { buildConcourse } from '../terminal/concourse.js';
import { buildSouth } from '../terminal/south.js';
import { buildSubway } from '../terminal/subway.js';

export const meta = {
  id: 'terminal', name: 'GRAND CENTRAL', subtitle: 'DAY OPS · MAIN CONCOURSE', time: 'day', weather: 'clear',
  description: 'Grand Central Terminal, Manhattan: the Main Concourse under the celestial ceiling, the opal clock, marble staircases and balconies, Vanderbilt Hall, the Dining Concourse ramps and the subway platforms below.',
  grade: 'day', ambience: 'terminal-day', thumb: 'assets/thumbs/terminal.jpg',
};

export function build(world) {
  const { ctx, W } = world;
  const B = P.BOUNDS; W.bounds.set(new THREE.Vector3(B.x0, B.y0, B.z0), new THREE.Vector3(B.x1, B.y1, B.z1));
  const Z = [];                                   // height zones {x0,x1,z0,z1,h|h(x,z)} pushed by the builders
  world.termLamps = []; world.termBal = []; world.termTrash = []; world.termTurnstiles = []; world.termZones = Z; // shared lists the terminal builders append to (props instances them)
  const M = makeMats(ctx, world.R, null);
  ctx.progress(0.13, 'lighting'); buildLighting(world, M);
  ctx.progress(0.15, 'main concourse'); buildConcourse(world, M, Z);
  ctx.progress(0.19, 'vanderbilt hall · ramps · dining'); try { buildSouth(world, M, Z); } catch (e) { console.error('[terminal] south', e); }
  ctx.progress(0.22, 'subway'); try { buildSubway(world, M, Z); } catch (e) { console.error('[terminal] subway', e); }
  ctx.progress(0.235, 'props'); import('../terminal/props.js').then((m) => m.buildProps(world, M)).catch((e) => console.warn('[terminal] props skipped', e?.message || e));

  W.groundHeight = (x, z) => {
    let h = 0;
    for (let i = 0; i < Z.length; i++) { const q = Z[i]; if (x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1) h = typeof q.h === 'function' ? q.h(x, z) : q.h; }
    return h;
  };
  W.surfaceAt = (p) => (p.y < -1 && p.z > 55 ? 'concrete' : 'concrete');

  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  W.playerSpawns = [v(-36, 0, 0), v(-34, 0, 8), v(-34, 0, -8)];
  // concourse-floor spawns only until the AI nav is height-aware (balcony/lower-level spawns come with that block)
  W.enemySpawns = [v(36, 0, 0), v(34, 0, 10), v(34, 0, -10), v(20, 0, 14), v(20, 0, -14), v(0, 0, -15), v(-8, 0, 15), v(14, 0, 4), v(14, 0, -4), v(26, 0, 0), v(6, 0, -12), v(6, 0, 12), v(-14, 0, -15), v(30, 0, 16)];
  if (W.coverPoints.length < 40) {
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; world.cover(Math.cos(a) * 4.2, Math.sin(a) * 4.2, Math.cos(a), Math.sin(a)); }   // info booth ring
    for (const x of [-30, -18, -6, 6, 18, 30]) { world.cover(x, 16.5, 0, -1); world.cover(x, -16.5, 0, 1); }                                          // wall piers
    for (const [x, z] of [[-20, 0], [20, 0], [-26, 5], [-26, -5], [26, 5], [26, -5]]) world.cover(x, z, Math.sign(-x), 0);                          // stair feet
  }
  W.poses = {
    spawn: [-36, 0, 0, -Math.PI / 2, 0.02],
    hero: [-30, 0, 6, -1.35, 0.14],
    overview: [-38, 6, 0, -Math.PI / 2, -0.12],
    clock: [7, 0, 5, 0.95, 0.12],
    stairs: [-12, 0, 0, Math.PI / 2, 0.18],
    stairsEast: [8, 0, 0, -Math.PI / 2, 0.18],
    mezzanine: [36, 6, 0, Math.PI / 2, -0.05],
    vanderbilt: [-4, 0, 47.5, 0.25, 0.34],
    windows: [8, 0, -4, -Math.PI / 2 - 0.3, 0.4],
    shafts: [18, 6, -13, Math.PI * 0.72, -0.28],
    train: [-24, -12.05, 71.8, -Math.PI / 2, 0.0],
    gallery: [0, -6, 21.5, Math.PI - 0.25, 0.1],
    ramp: [-40, -1.45, 25, -Math.PI / 2, -0.05],
    dining: [-16, -6, 36, 1.2, 0.05],
    platform: [-34, -12, 61.5, -Math.PI / 2 + 0.28, 0.06],
    ceiling: [-10, 0, 8, -0.6, 1.1],
  };
}
