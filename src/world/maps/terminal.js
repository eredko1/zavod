// MAP: GRAND CENTRAL — real Grand Central Terminal (Manhattan), four levels. Owned by: TERMINAL agent (helpers in ../terminal/*). See ../terminal/RESEARCH.md.
import * as THREE from 'three';
import { P } from '../terminal/plan.js';
import { makeMats } from '../terminal/mats.js';
import { buildLighting } from '../terminal/lighting.js';
import { buildConcourse } from '../terminal/concourse.js';
import { buildSouth } from '../terminal/south.js';
import { buildSubway } from '../terminal/subway.js';
import { buildPassage } from '../terminal/passage.js';
import { buildExterior } from '../terminal/exterior.js';
import { buildCrowd, scatter } from '../crowd.js';

export const meta = {
  id: 'terminal', name: 'CENTRAL STATION', subtitle: 'DAY OPS · MAIN CONCOURSE', time: 'day', weather: 'clear',
  description: 'A grand Beaux-Arts rail terminal: the main concourse under a celestial ceiling, the four-faced clock, marble staircases and balconies, the waiting hall, dining concourse ramps and the subway below.',
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
  ctx.progress(0.225, 'passage'); try { buildPassage(world, M, Z); } catch (e) { console.error('[terminal] passage', e); }
  ctx.progress(0.23, 'street'); try { buildExterior(world, M, Z); } catch (e) { console.error('[terminal] exterior', e); }
  ctx.progress(0.235, 'props'); import('../terminal/props.js').then((m) => { m.buildProps(world, M); clearOpenings(); }).catch((e) => console.warn('[terminal] props skipped', e?.message || e));

  // keep the arcade arches and track gates passable: drop any low prop collider that sits inside an opening
  const clearOpenings = () => { const inArch = (b) => { const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2; if (b.min.y > 2) return false;
      if (Math.abs(Math.abs(cx) - 30.2) < 1.6 && Math.abs(Math.abs(cz) - 15) < 2.4) return true;            // W/E arcade arches (|x|≈31, |z|≈15)
      if (Math.abs(cz - (P.BAL_NZ - 0.5)) < 1.2) { for (let i = 0; i < 11; i++) if (Math.abs(cx - (-28 + i * 5.6)) < 1.9) return true; } // north gates
      return false; };
    for (let i = ctx.colliders.length - 1; i >= 0; i--) { const b = ctx.colliders[i]; const w = b.max.x - b.min.x, d = b.max.z - b.min.z; if (w < 4 && d < 4 && inArch(b)) ctx.colliders.splice(i, 1); } };
  clearOpenings(); { let t = 0, n = ctx.colliders.length; world.updaters.push((dt) => { t += dt; if (t < 12 && ctx.colliders.length !== n) { n = ctx.colliders.length; clearOpenings(); n = ctx.colliders.length; } }); } // async GLTF props add colliders later
  // ---- people: a transit hall with nobody in it reads as a greybox (critic r1 #8). Non-colliding set dressing. ----
  try {
    const R = world.R, face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
    const crowd = [];
    for (let i = 0; i < 12; i++) { const a = R() * Math.PI * 2, r = 4.6 + R() * 1.8; const x = Math.cos(a) * r, z = Math.sin(a) * r; crowd.push({ x, y: 0, z, ry: R() < 0.6 ? face(x, z, 0, 0) : R() * 6.3, pose: R() < 0.3 ? 'phone' : 'stand', bag: R() < 0.35 ? 1 : 0 }); }
    for (const qx of [11, 15.5, 20, 24]) { const n = 2 + ((R() * 4) | 0); for (let k = 0; k < n; k++) crowd.push({ x: qx + (R() - 0.5) * 0.3, y: 0, z: 13.9 - k * 0.85, ry: (R() - 0.5) * 0.3, pose: R() < 0.25 ? 'phone' : 'stand', bag: R() < 0.3 ? 1 : 0 }); }
    const hall = (x, z) => Math.hypot(x, z) < 6.8 || (Math.abs(x) > 17.5 && Math.abs(z) < 5.5) || (x > 9 && z > 9.5) || Math.abs(x + 38.5) < 3;
    crowd.push(...scatter(R, 30, -27, 27, -14, 13.5, 0, hall, { walk: 0.6, bag: 0.3, gap: 1.4 }));
    for (let i = 0; i < 7; i++) { const sx = R() < 0.5 ? -1 : 1; crowd.push({ x: sx * 32.3, y: P.BAL_Y, z: -10 + R() * 20, ry: -sx * Math.PI / 2 + (R() - 0.5) * 0.4, pose: R() < 0.3 ? 'phone' : 'stand' }); }
    const isl = P.ISL[1]; crowd.push(...scatter(R, 16, -40, 40, isl[0] + 1.3, isl[1] - 1.3, -12, (x) => Math.abs(x) < 8 || Math.abs(Math.abs(x) - 24) < 5, { walk: 0.25, bag: 0.2, gap: 2 }).map((c) => ({ ...c, ry: R() < 0.7 ? (R() < 0.5 ? 0 : Math.PI) + (R() - 0.5) * 0.5 : c.ry })));
    const walkAlong = (c) => ({ ...c, ry: (R() < 0.5 ? Math.PI / 2 : -Math.PI / 2) + (R() - 0.5) * 0.3 });
    crowd.push(...scatter(R, 8, -58, 58, P.ST.z0 + 0.8, P.ST.curbN - 0.6, 0, () => false, { walk: 0.7, bag: 0.1, gap: 3 }).map(walkAlong));
    crowd.push(...scatter(R, 9, -58, 58, P.ST.curbS + 0.6, P.ST.facadeZ - 1.2, 0, (x) => Math.abs(x) < 10, { walk: 0.65, bag: 0.1, gap: 3 }).map(walkAlong));
    buildCrowd(world, crowd);
  } catch (e) { console.warn('[terminal] crowd', e); }
  W.groundHeight = (x, z) => {
    let h = 0;
    // balconies/tabs (h ≥ 5.9) are collider slabs you stand on via collision — the ground beneath them stays the concourse floor, so the arcades are walkable
    for (let i = 0; i < Z.length; i++) { const q = Z[i]; if (typeof q.h === 'number' && q.h >= 5.9) continue; if (x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1) h = typeof q.h === 'function' ? q.h(x, z) : q.h; }
    return h;
  };
  W.surfaceAt = (p) => {
    if (p.y < -8 && ((p.z > P.TRK.A[0] - 0.2 && p.z < P.TRK.A[1]) || (p.z > P.TRK.D[0] && p.z < P.TRK.D[1] + 0.2))) return 'metal';   // trains
    if (p.y < -5 && p.z > 53.5 && p.z < 54.5 && Math.abs(p.x) < 7) return 'metal';                                                  // turnstiles
    return 'concrete';
  };

  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const isl1 = (P.ISL[1][0] + P.ISL[1][1]) / 2, isl2 = (P.ISL[2][0] + P.ISL[2][1]) / 2;
  W.playerSpawns = [v(-36, 0, 0), v(-34, 0, 8), v(-34, 0, -8), v(-38, 0, 12), v(-30, -12, isl1), v(-40, 0, 53)];
  W.enemySpawns = [v(36, 0, 0), v(34, 0, 10), v(34, 0, -10), v(20, 0, 14), v(20, 0, -14), v(0, 0, -15), v(-8, 0, 15), v(14, 0, 4), v(14, 0, -4), v(26, 0, 0), v(6, 0, -12), v(6, 0, 12), v(-14, 0, -15), v(30, 0, 16),
    v(30, -12, isl1), v(-6, -12, isl1), v(34, -12, isl2), v(-30, -12, isl2), v(6, -12, isl2), v(0, -6, 70), v(16, -6, 60), v(0, -6, 24.5), v(10, -6, 40), v(30, 0, 62), v(-20, 0, 66)];
  W.objectives = [{ name: 'SUBWAY', position: v(0, -12, isl1) }];
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
    gallery: [0, -6, 21.5, Math.PI - 0.25, 0.1],
    ramp: [-40, -1.45, 25, -Math.PI / 2, -0.05],
    dining: [-16, -6, 36, 1.2, 0.05],
    mezzanine_sub: [0, -6, 52, Math.PI - 0.2, 0.06],
    platform: [-36, -12, isl1 - 2.6, -Math.PI / 2 + 0.2, 0.05],
    platform2: [36, -12, isl2 + 2.6, Math.PI / 2 - 0.25, 0.05],
    train: [-24, -12.05, (P.TRK.A[0] + P.TRK.A[1]) / 2 - 0.3, -Math.PI / 2, 0.0],
    substair: [-38.5, 0, 4, Math.PI - 0.15, 0.3],
    passage: [-52, -6, 24, Math.PI, 0.05],
    street: [-24, 0, 62, Math.PI + 0.6, 0.06],
    facade: [26, 0, 74, 0.45, 0.4],
    viaduct: [-44, 0, 66, -Math.PI / 2 + 0.55, 0.18],
    skyline: [0, 0, 56, Math.PI - 0.3, 0.32],
    ceiling: [-10, 0, 8, -0.6, 1.1],
  };
}
