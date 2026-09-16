// RAILYARD structures: loading platform + canopy + goods shed, two-storey brick yard office (interior, exterior stair, roof), road overpass with ramps. RAILYARD agent.
import * as THREE from 'three';
import { Batch, slopedBox } from './geo.js';
import { PLATFORM, SHED, OFFICE, OVERPASS, ROAD_E, ROAD_W, TRACK_X } from './layout.js';
import { signTexture } from '../mats.js';

/** Sloped handrail + stepped colliders along a stair/ramp edge. axis: 'x'|'z'; a0→a1 with heights y0→y1 (floor), rail 1.05 high. */
function railing(B, world, { axis, a0, a1, c, y0, y1, thick = 0.06, collide = true }) {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
  const yLo = a0 < a1 ? y0 : y1, yHi = a0 < a1 ? y1 : y0; // heights at lo / hi
  const min = axis === 'x' ? [lo, 0, c - thick / 2] : [c - thick / 2, 0, lo], max = axis === 'x' ? [hi, 0, c + thick / 2] : [c + thick / 2, 0, hi];
  // top rail + mid rail (sloped), posts every ~1.5 m
  B.add('steelDark', slopedBox([min[0], yLo + 0.95, min[2]], [max[0], yHi + 1.05, max[2]], axis, { topA0: yLo + 1.05, topA1: yHi + 1.05, botA0: yLo + 0.99, botA1: yHi + 0.99 }), { uv: false });
  B.add('steelDark', slopedBox([min[0], yLo + 0.5, min[2]], [max[0], yHi + 0.55, max[2]], axis, { topA0: yLo + 0.55, topA1: yHi + 0.55, botA0: yLo + 0.5, botA1: yHi + 0.5 }), { uv: false });
  const n = Math.max(1, Math.round((hi - lo) / 1.5));
  for (let i = 0; i <= n; i++) {
    const a = lo + (hi - lo) * i / n; const y = yLo + (yHi - yLo) * i / n;
    const pmin = axis === 'x' ? [a - 0.03, y, c - 0.03] : [c - 0.03, y, a - 0.03], pmax = axis === 'x' ? [a + 0.03, y + 1.05, c + 0.03] : [c + 0.03, y + 1.05, a + 0.03];
    B.box('steelDark', pmin, pmax, { collide: false, uv: false });
  }
  if (collide) {
    const steps = Math.max(1, Math.ceil(Math.abs(y1 - y0) / 0.3));
    for (let i = 0; i < steps; i++) {
      const p0 = lo + (hi - lo) * i / steps, p1 = lo + (hi - lo) * (i + 1) / steps; const y = yLo + (yHi - yLo) * (i + 0.5) / steps;
      world.box(axis === 'x' ? [p0, y, c - 0.08] : [c - 0.08, y, p0], axis === 'x' ? [p1, y + 1.05, c + 0.08] : [c + 0.08, y + 1.05, p1]);
    }
  }
}

/** Window: glass pane + frame + sill. face: 'x'|'z' (wall normal axis), at coordinate w, spanning a0..a1 and y0..y1. */
function window_(B, face, w, a0, a1, y0, y1, { mullions = 1, frame = 'white' } = {}) {
  const t = 0.05;
  const min = face === 'x' ? [w - t, y0, a0] : [a0, y0, w - t], max = face === 'x' ? [w + t, y1, a1] : [a1, y1, w + t];
  B.box('glass', min, max, { collide: false, uv: false });
  const f = 0.08;
  const fr = (m0, m1) => B.box(frame, m0, m1, { collide: false, uv: false });
  if (face === 'x') {
    fr([w - t - 0.02, y0 - f, a0 - f], [w + t + 0.02, y0, a1 + f]); fr([w - t - 0.02, y1, a0 - f], [w + t + 0.02, y1 + f, a1 + f]);
    fr([w - t - 0.02, y0, a0 - f], [w + t + 0.02, y1, a0]); fr([w - t - 0.02, y0, a1], [w + t + 0.02, y1, a1 + f]);
    for (let i = 1; i <= mullions; i++) { const a = a0 + (a1 - a0) * i / (mullions + 1); fr([w - t - 0.01, y0, a - 0.03], [w + t + 0.01, y1, a + 0.03]); }
    fr([w - 0.2, y0 - f - 0.04, a0 - f - 0.05], [w + 0.2, y0 - f, a1 + f + 0.05]);
  } else {
    fr([a0 - f, y0 - f, w - t - 0.02], [a1 + f, y0, w + t + 0.02]); fr([a0 - f, y1, w - t - 0.02], [a1 + f, y1 + f, w + t + 0.02]);
    fr([a0 - f, y0, w - t - 0.02], [a0, y1, w + t + 0.02]); fr([a1, y0, w - t - 0.02], [a1 + f, y1, w + t + 0.02]);
    for (let i = 1; i <= mullions; i++) { const a = a0 + (a1 - a0) * i / (mullions + 1); fr([a - 0.03, y0, w - t - 0.01], [a + 0.03, y1, w + t + 0.01]); }
    fr([a0 - f - 0.05, y0 - f - 0.04, w - 0.2], [a1 + f + 0.05, y0 - f, w + 0.2]);
  }
}

export function buildStructures(world, M) {
  const { ctx, scene, R } = world;
  const B = new Batch(world, M, 'structures');
  buildPlatform(B, world, M);
  buildShed(B, world, M);
  buildOffice(B, world, M);
  buildOverpass(B, world, M);
  B.flush();
  buildSigns(world, M);
}

// ---- loading platform + canopy ----------------------------------------------------------------------
function buildPlatform(B, world, M) {
  const P = PLATFORM;
  B.box('concreteCracked', [P.x0, 0, P.z0], [P.x1, P.h, P.z1], { walkable: true, uvScale: 0.4 });
  // coping + safety line along the yard edge
  B.box('concreteWall', [P.x0 - 0.02, P.h - 0.3, P.z0], [P.x0 + 0.45, P.h + 0.015, P.z1], { collide: false, uvScale: 0.5 });
  B.box('yellow', [P.x0 + 0.6, P.h, P.z0], [P.x0 + 0.72, P.h + 0.012, P.z1], { collide: false, uv: false });
  // end stairs (north / south) and the mid stair down to the yard
  B.stairs('concrete', { x: 19.6, z: P.z1 + 3.3, y0: 0, rise: P.h, run: 3.3, width: 3.2, axis: 'z', dir: -1, n: 4, uvScale: 0.5 });
  B.stairs('concrete', { x: 19.6, z: P.z0 - 3.3, y0: 0, rise: P.h, run: 3.3, width: 3.2, axis: 'z', dir: 1, n: 4, uvScale: 0.5 });
  B.stairs('concrete', { x: P.x0 - 1.6, z: 0.5, y0: 0, rise: P.h, run: 1.6, width: 2.0, axis: 'x', dir: 1, n: 4, uvScale: 0.5 });
  // canopy: steel columns, beams, corrugated roof, fascia
  const cz = []; for (let z = -30; z <= 30; z += 7.5) cz.push(z);
  for (const z of cz) {
    B.box('steelDark', [25.0, P.h, z - 0.16], [25.32, 5.05, z + 0.16], { collide: true, uvScale: 1 });
    B.box('steel', [16.4, 4.8, z - 0.14], [26.4, 5.05, z + 0.14], { collide: false, uvScale: 1 });
    // knee brace
    const kb = new THREE.BoxGeometry(0.1, 0.1, 3.2); kb.rotateX(Math.PI / 2); kb.rotateY(0.62); kb.translate(23.6, 4.05, z); B.add('steelDark', kb, { uv: false });
  }
  B.box('steel', [16.4, 4.8, -34.4], [16.7, 5.05, 34.4], { collide: false, uvScale: 1 });
  B.box('corrugated', [16.2, 5.05, -34.6], [26.5, 5.17, 34.6], { collide: true, uvScale: 0.6 });
  B.box('rustPlate', [16.15, 4.62, -34.6], [16.25, 5.2, 34.6], { collide: false, uvScale: 0.8 });
  B.box('rustPlate', [16.15, 4.62, -34.6], [26.5, 5.2, -34.5], { collide: false, uvScale: 0.8 });
  B.box('rustPlate', [16.15, 4.62, 34.5], [26.5, 5.2, 34.6], { collide: false, uvScale: 0.8 });
  // platform furniture: bench slabs, a pallet stack, a luggage trolley outline, bollards
  for (const z of [-24, -6, 14, 28]) { B.box('plank', [23.6, P.h + 0.42, z - 1.0], [24.2, P.h + 0.5, z + 1.0], { collide: false, uvScale: 1 }); B.box('steelDark', [23.65, P.h, z - 0.9], [24.15, P.h + 0.42, z - 0.8], { collide: false }); B.box('steelDark', [23.65, P.h, z + 0.8], [24.15, P.h + 0.42, z + 0.9], { collide: false }); }
  for (const [x, z] of [[21, -30], [22.4, -29.2], [21.4, 30.5]]) { B.box('plank', [x - 0.6, P.h, z - 0.5], [x + 0.6, P.h + 0.14, z + 0.5], { uvScale: 1 }); B.box('plank', [x - 0.6, P.h + 0.14, z - 0.5], [x + 0.6, P.h + 0.9, z + 0.5], { uvScale: 1 }); world.cover(x - 1.2, z, -1, 0, P.h); }
  // cover along the platform edge (behind the coping) and against the canopy columns
  for (const z of [-28, -18, -8, 4, 16, 26]) world.cover(P.x0 + 1.2, z, -1, 0, P.h);
  for (const z of cz) { world.cover(24.4, z, -1, 0, P.h); }
}

// ---- goods shed behind the platform ---------------------------------------------------------------------
function buildShed(B, world, M) {
  const S = SHED; const t = 0.4, top = S.roof;
  B.box('concreteCracked', [S.x0, 0, S.z0], [S.x1, S.floor, S.z1], { walkable: true, uvScale: 0.4 });
  // west (platform) wall with three shutter openings: z = -20 (closed), 0 (open), 20 (closed)
  const segs = [[S.z0, -22.2], [-17.8, -2.2], [2.2, 17.8], [22.2, S.z1]];
  for (const [a, b] of segs) B.box('brick', [S.x0, S.floor, a], [S.x0 + t, top, b], { uvScale: 0.42 });
  for (const zc of [-20, 0, 20]) {
    B.box('brick', [S.x0, 4.7, zc - 2.2], [S.x0 + t, top, zc + 2.2], { uvScale: 0.42 });            // lintel
    B.box('steelDark', [S.x0 - 0.05, 4.55, zc - 2.35], [S.x0 + t + 0.05, 4.75, zc + 2.35], { collide: false });
    if (zc !== 0) B.box('shutter', [S.x0 + 0.08, S.floor, zc - 2.2], [S.x0 + 0.16, 4.7, zc + 2.2], { collide: true, uvScale: 0.5 });
    else { B.box('shutter', [S.x0 + 0.08, 4.1, zc - 2.2], [S.x0 + 0.16, 4.7, zc + 2.2], { collide: true, uvScale: 0.5 }); } // rolled up
    // bay number plaque area (sign texture applied separately)
  }
  // east wall with the back door at z 6..8, north/south walls
  B.box('brick', [S.x1 - t, S.floor, S.z0], [S.x1, top, 6], { uvScale: 0.42 });
  B.box('brick', [S.x1 - t, S.floor, 8], [S.x1, top, S.z1], { uvScale: 0.42 });
  B.box('brick', [S.x1 - t, 3.4, 6], [S.x1, top, 8], { uvScale: 0.42 });
  B.box('brick', [S.x0, S.floor, S.z0], [S.x1, top, S.z0 + t], { uvScale: 0.42 });
  B.box('brick', [S.x0, S.floor, S.z1 - t], [S.x1, top, S.z1], { uvScale: 0.42 });
  // partitions → only the middle bay (z -12..12) is enterable
  B.box('brick', [S.x0 + t, S.floor, -12.2], [S.x1 - t, top, -11.8], { uvScale: 0.42 });
  B.box('brick', [S.x0 + t, S.floor, 11.8], [S.x1 - t, top, 12.2], { uvScale: 0.42 });
  // back-door steps down to the east service lane
  B.stairs('concrete', { x: S.x1 + 1.6, z: 7, y0: 0, rise: S.floor, run: 1.6, width: 2.2, axis: 'x', dir: -1, n: 4 });
  // roof: shallow pitch with ridge, eaves gutters
  B.add('corrugated', slopedBox([S.x0 - 0.4, top, S.z0 - 0.4], [S.x0 + 4, top + 1.0, S.z1 + 0.4], 'x', { topA0: top + 0.1, topA1: top + 1.0, botA0: top - 0.05, botA1: top + 0.85 }), { uvScale: 0.6 });
  B.add('corrugated', slopedBox([S.x0 + 4, top, S.z0 - 0.4], [S.x1 + 0.4, top + 1.0, S.z1 + 0.4], 'x', { topA0: top + 1.0, topA1: top + 0.1, botA0: top + 0.85, botA1: top - 0.05 }), { uvScale: 0.6 });
  world.box([S.x0 - 0.4, top, S.z0 - 0.4], [S.x1 + 0.4, top + 1.0, S.z1 + 0.4]);
  B.box('steelDark', [S.x0 + 3.9, top + 0.95, S.z0 - 0.4], [S.x0 + 4.1, top + 1.1, S.z1 + 0.4], { collide: false });
  // clerestory windows on the east wall, roof trusses in the open bay
  for (let z = -30; z <= 30; z += 6) window_(B, 'x', S.x1 - 0.1, z - 1.2, z + 1.2, 4.8, 5.9, { mullions: 2, frame: 'steelDark' });
  for (const z of [-8, 0, 8]) { B.box('steel', [S.x0 + t, top - 0.5, z - 0.1], [S.x1 - t, top - 0.2, z + 0.1], { collide: false }); }
  // interior: pallet racks (steel uprights + plank shelves) along the back wall of the open bay, a workbench
  for (const z of [-9, -5.5, -2, 1.5, 4.5]) {
    for (const x of [S.x1 - t - 1.2, S.x1 - t - 0.1]) B.box('steelDark', [x, S.floor, z - 0.05], [x + 0.1, S.floor + 3.6, z + 0.05], { collide: false });
  }
  for (const y of [S.floor + 0.05, S.floor + 1.3, S.floor + 2.5]) B.box('plank', [S.x1 - t - 1.2, y, -9], [S.x1 - t, y + 0.08, 4.5], { collide: false, uvScale: 1 });
  world.box([S.x1 - t - 1.2, S.floor, -9], [S.x1 - t, S.floor + 3.6, 4.5]);
  B.box('plank', [S.x0 + t + 0.4, S.floor + 0.85, -10.5], [S.x0 + t + 2.4, S.floor + 0.92, -8.0], { uvScale: 1 }); B.box('steelDark', [S.x0 + t + 0.5, S.floor, -10.4], [S.x0 + t + 2.3, S.floor + 0.85, -8.1], { collide: false });
  world.cover(S.x1 - t - 2.2, -6, 1, 0, S.floor); world.cover(S.x1 - t - 2.2, 2, 1, 0, S.floor); world.cover(S.x0 + t + 3.2, -9.2, -1, 0, S.floor);
  world.cover(S.x1 + 2.6, 7, 1, 0, 0); world.cover(S.x0 - 1.4, -4, 1, 0, PLATFORM.h); world.cover(S.x0 - 1.4, 4, 1, 0, PLATFORM.h);
}

// ---- yard office / signal box ------------------------------------------------------------------------------
function buildOffice(B, world, M) {
  const O = OFFICE; const t = 0.32; const f1 = O.floor1, roof = O.roof;
  // ground floor slab
  B.box('concreteCracked', [O.x0 - 0.6, 0, O.z0 - 0.6], [O.x1 + 0.6, 0.06, O.z1 + 0.6], { collide: false, uvScale: 0.5 });
  // ---- ground floor walls (door on the east face z 10..11.6; windows east/north) ----
  const wall = (min, max) => B.box('brick', min, max, { uvScale: 0.42 });
  // east wall (x1) with door + 2 windows
  wall([O.x1 - t, 0, O.z0], [O.x1, f1, 7.0]); wall([O.x1 - t, 0, 8.6], [O.x1, f1, 10.0]); wall([O.x1 - t, 0, 11.7], [O.x1, f1, 12.8]); wall([O.x1 - t, 0, 14.4], [O.x1, f1, O.z1]);
  wall([O.x1 - t, 2.4, 7.0], [O.x1, f1, 8.6]); wall([O.x1 - t, 2.3, 10.0], [O.x1, f1, 11.7]); wall([O.x1 - t, 2.4, 12.8], [O.x1, f1, 14.4]);
  wall([O.x1 - t, 0, 7.0], [O.x1, 0.9, 8.6]); wall([O.x1 - t, 0, 12.8], [O.x1, 0.9, 14.4]);
  window_(B, 'x', O.x1 - t / 2, 7.05, 8.55, 0.95, 2.35); window_(B, 'x', O.x1 - t / 2, 12.85, 14.35, 0.95, 2.35);
  // door frame (open doorway) + steel door leaf swung open inward
  B.box('steelDark', [O.x1 - t - 0.02, 0, 9.95], [O.x1 + 0.02, 2.32, 10.05], { collide: false }); B.box('steelDark', [O.x1 - t - 0.02, 0, 11.65], [O.x1 + 0.02, 2.32, 11.75], { collide: false }); B.box('steelDark', [O.x1 - t - 0.02, 2.25, 9.95], [O.x1 + 0.02, 2.35, 11.75], { collide: false });
  B.box('shutter', [O.x1 - t - 1.5, 0.02, 11.55], [O.x1 - t - 0.02, 2.2, 11.62], { collide: true, uvScale: 0.6 });
  // west wall, north wall (window), south wall (stair side, small window)
  wall([O.x0, 0, O.z0], [O.x0 + t, f1, O.z1]);
  wall([O.x0, 0, O.z0], [O.x1, f1, O.z0 + t]);
  wall([O.x0, 0, O.z1 - t], [-40, f1, O.z1]); wall([-37.6, 0, O.z1 - t], [O.x1, f1, O.z1]); wall([-40, 0, O.z1 - t], [-37.6, 0.9, O.z1]); wall([-40, 2.4, O.z1 - t], [-37.6, f1, O.z1]);
  window_(B, 'z', O.z1 - t / 2, -39.95, -37.65, 0.95, 2.35);
  // interior ground floor: counter, lockers, notice board
  B.box('plank', [O.x0 + t + 0.3, 0.9, 8.5], [O.x0 + t + 0.9, 0.98, 13.5], { uvScale: 1 }); B.box('paintedConcrete', [O.x0 + t + 0.35, 0, 8.55], [O.x0 + t + 0.85, 0.9, 13.45], { uvScale: 0.5 });
  B.box('shutter', [O.x0 + t + 4.0, 0, O.z0 + t], [O.x0 + t + 6.4, 1.9, O.z0 + t + 0.5], { uvScale: 0.6 });
  world.cover(O.x0 + t + 1.6, 11, 1, 0, 0); world.cover(O.x0 + t + 5.2, O.z0 + t + 1.2, 0, 1, 0);
  // first floor slab (also the ground-floor ceiling)
  B.box('concrete', [O.x0, f1 - 0.28, O.z0], [O.x1, f1, O.z1], { walkable: true, uvScale: 0.5 });
  // ---- first floor (signal box): brick to sill, big window band on east + north, door on the south (stair landing) ----
  const sill = f1 + 1.0, head = f1 + 2.9;
  wall([O.x0, f1, O.z0], [O.x0 + t, roof, O.z1]);                                              // west
  wall([O.x0, f1, O.z0], [O.x1, sill, O.z0 + t]); wall([O.x0, head, O.z0], [O.x1, roof, O.z0 + t]); // north band
  wall([O.x0, f1, O.z0 + t], [O.x0 + 0.9, roof, O.z0 + t + 0.01]);
  for (let x = O.x0 + 0.9; x < O.x1 - 0.5; x += 2.3) window_(B, 'z', O.z0 + t / 2, x, Math.min(x + 2.1, O.x1 - 0.5), sill + 0.05, head - 0.05, { mullions: 2 });
  wall([O.x1 - 0.5, f1, O.z0], [O.x1, roof, O.z0 + t]);
  wall([O.x1 - t, f1, O.z0], [O.x1, sill, O.z1]); wall([O.x1 - t, head, O.z0], [O.x1, roof, O.z1]);   // east band
  for (let z = O.z0 + 0.5; z < O.z1 - 0.5; z += 2.4) window_(B, 'x', O.x1 - t / 2, z, Math.min(z + 2.2, O.z1 - 0.5), sill + 0.05, head - 0.05, { mullions: 2 });
  wall([O.x1 - t, f1, O.z0], [O.x1, roof, O.z0 + 0.5]); wall([O.x1 - t, f1, O.z1 - 0.5], [O.x1, roof, O.z1]);
  // south wall with the landing door at x -38 .. -36.8
  wall([O.x0, f1, O.z1 - t], [-38.0, roof, O.z1]); wall([-36.8, f1, O.z1 - t], [O.x1, roof, O.z1]); wall([-38.0, f1 + 2.2, O.z1 - t], [-36.8, roof, O.z1]);
  B.box('steelDark', [-38.02, f1, O.z1 - t - 0.02], [-37.96, f1 + 2.2, O.z1 + 0.02], { collide: false }); B.box('steelDark', [-36.84, f1, O.z1 - t - 0.02], [-36.78, f1 + 2.2, O.z1 + 0.02], { collide: false });
  // interior first floor: control desk along the east window, chairs, cabinets
  B.box('plank', [O.x1 - t - 0.9, f1 + 0.78, O.z0 + 1.0], [O.x1 - t - 0.05, f1 + 0.84, O.z1 - 1.0], { uvScale: 1 }); B.box('paintedConcrete', [O.x1 - t - 0.85, f1, O.z0 + 1.0], [O.x1 - t - 0.1, f1 + 0.78, O.z1 - 1.0], { uvScale: 0.5 });
  B.box('shutter', [O.x0 + t, f1, O.z0 + t + 3.0], [O.x0 + t + 0.5, f1 + 2.0, O.z0 + t + 6.0], { uvScale: 0.6 });
  world.cover(O.x1 - t - 1.7, 9, 1, 0, f1); world.cover(O.x1 - t - 1.7, 13, 1, 0, f1); world.cover(O.x0 + t + 1.2, 10.5, -1, 0, f1);
  // roof slab + parapet (gap on the south edge where the stair lands, x -43.8..-42.2), plant box, antenna mast
  B.box('concreteCracked', [O.x0 - 0.2, roof - 0.25, O.z0 - 0.2], [O.x1 + 0.2, roof, O.z1 + 0.2], { walkable: true, uvScale: 0.5 });
  const pp = 0.3, ph = O.parapet;
  B.box('brick', [O.x0 - 0.2, roof, O.z0 - 0.2], [O.x1 + 0.2, ph, O.z0 - 0.2 + pp], { uvScale: 0.42 });      // north
  B.box('brick', [O.x0 - 0.2, roof, O.z0 - 0.2], [O.x0 - 0.2 + pp, ph, O.z1 + 0.2], { uvScale: 0.42 });      // west
  B.box('brick', [O.x1 + 0.2 - pp, roof, O.z0 - 0.2], [O.x1 + 0.2, ph, O.z1 + 0.2], { uvScale: 0.42 });      // east
  B.box('brick', [-42.2, roof, O.z1 + 0.2 - pp], [O.x1 + 0.2, ph, O.z1 + 0.2], { uvScale: 0.42 });           // south (with stair gap at the west end)
  for (const [a, b] of [[[O.x0 - 0.22, ph, O.z0 - 0.22], [O.x1 + 0.22, ph + 0.06, O.z0 - 0.2 + pp + 0.02]], [[O.x0 - 0.22, ph, O.z0 - 0.22], [O.x0 - 0.2 + pp + 0.02, ph + 0.06, O.z1 + 0.22]], [[O.x1 + 0.2 - pp - 0.02, ph, O.z0 - 0.22], [O.x1 + 0.22, ph + 0.06, O.z1 + 0.22]], [[-42.22, ph, O.z1 + 0.2 - pp - 0.02], [O.x1 + 0.22, ph + 0.06, O.z1 + 0.22]]]) B.box('concreteCracked', a, b, { collide: false, uvScale: 0.5 }); // coping strips
  B.box('corrugated', [O.x0 + 1.0, roof, 7.0], [O.x0 + 3.4, roof + 1.5, 9.4], { uvScale: 0.6 });             // plant room / stair head
  B.cyl('steelDark', O.x0 + 6, O.z0 + 2, roof, roof + 6.5, 0.06, 6); B.box('steelDark', [O.x0 + 5.4, roof + 5.2, O.z0 + 1.95], [O.x0 + 6.6, roof + 5.3, O.z0 + 2.05], { collide: false });
  world.cover(O.x1 - 0.9, 8, 1, 0, roof); world.cover(O.x1 - 0.9, 14, 1, 0, roof); world.cover(-38, O.z0 + 0.9, 0, -1, roof); world.cover(O.x0 + 4.2, 8.2, 1, 0, roof);
  // ---- exterior stair on the south face: flight 1 east→west to the landing (f1), flight 2 on to the roof ----
  const sz0 = O.z1, sz1 = O.z1 + 1.5, sw = sz1 - sz0, szc = (sz0 + sz1) / 2;
  B.stairs('concrete', { x: -32.6, z: szc, y0: 0, rise: f1, run: 4.0, width: sw, axis: 'x', dir: -1, n: 12, uvScale: 0.5 });
  B.box('concrete', [-38.4, 0, sz0], [-36.6, f1, sz1], { walkable: true, uvScale: 0.5 });                    // landing (solid pier)
  B.stairs('concrete', { x: -38.4, z: szc, y0: f1, rise: roof - f1, run: 4.0, width: sw, axis: 'x', dir: -1, n: 12, uvScale: 0.5, base: 0 });
  B.box('concrete', [-44.2, 0, sz0], [-42.4, roof, sz1], { walkable: true, uvScale: 0.5 });                   // top landing → roof gap
  // railings: outer edge (z = sz1) along both flights and landings, end rail at x -32.6, small return rails
  railing(B, world, { axis: 'x', a0: -32.6, a1: -36.6, c: sz1 - 0.05, y0: 0, y1: f1 });
  railing(B, world, { axis: 'x', a0: -36.6, a1: -38.4, c: sz1 - 0.05, y0: f1, y1: f1 });
  railing(B, world, { axis: 'x', a0: -38.4, a1: -42.4, c: sz1 - 0.05, y0: f1, y1: roof });
  railing(B, world, { axis: 'x', a0: -42.4, a1: -44.2, c: sz1 - 0.05, y0: roof, y1: roof });
  railing(B, world, { axis: 'z', a0: sz0, a1: sz1, c: -44.15, y0: roof, y1: roof });
  // inner rail along flight 2 (against the wall side it is the building; landing 1 inner side is the door) — nothing needed
  world.cover(-40.5, sz1 + 1.2, 0, 1, 0);
}

// ---- road overpass with ramps ---------------------------------------------------------------------------------
function buildOverpass(B, world, M) {
  const V = OVERPASS; const top = V.top, under = top - V.slab;
  // deck slab (walkable), asphalt wearing course, kerbs, parapets (gaps over the ramp footprints on the south side)
  B.box('concreteCracked', [V.x0, under, V.z0], [V.x1, top, V.z1], { walkable: true, uvScale: 0.4 });
  B.box('asphalt', [V.x0, top, V.z0 + 0.7], [V.x1, top + 0.04, V.z1 - 0.7], { collide: false, uvScale: 0.3 });
  B.box('concrete', [V.x0, top, V.z0 + 0.3], [V.x1, top + 0.15, V.z0 + 0.7], { collide: false, uvScale: 0.5 });
  B.box('concrete', [V.x0, top, V.z1 - 0.7], [V.x1, top + 0.15, V.z1 - 0.3], { collide: false, uvScale: 0.5 });
  B.box('concreteWall', [V.x0, top, V.z0], [V.x1, top + V.parapet, V.z0 + 0.3], { uvScale: 0.5 });                       // north parapet
  B.box('concreteWall', [ROAD_W.x1, top, V.z1 - 0.3], [ROAD_E.x0, top + V.parapet, V.z1], { uvScale: 0.5 });              // south parapet (between the ramps)
  B.box('concreteWall', [V.x0, top, V.z0], [V.x0 + 0.3, top + V.parapet, V.z1], { uvScale: 0.5 });                        // west end
  B.box('concreteWall', [V.x1 - 0.3, top, V.z0], [V.x1, top + V.parapet, V.z1], { uvScale: 0.5 });                        // east end
  // centre line dashes
  for (let x = V.x0 + 2; x < V.x1 - 2; x += 4) B.box('white', [x, top + 0.041, -44.06], [x + 2, top + 0.045, -43.94], { collide: false, uv: false });
  // girders under the deck + piers with crossheads
  for (const z of [V.z0 + 0.6, -44.3, V.z1 - 1.2]) B.box('rustPlate', [V.x0 + 0.5, under - 0.7, z], [V.x1 - 0.5, under, z + 0.6], { collide: false, uvScale: 0.6 });
  for (const px of [-46, -34, -24.25, -13.25, -2.25, 9.9, 22, 34, 46]) {
    B.box('concreteWall', [px - 0.7, 0, -47.3], [px + 0.7, under - 0.7, -40.7], { uvScale: 0.5 });
    B.box('concreteWall', [px - 1.3, under - 1.4, V.z0 + 0.3], [px + 1.3, under - 0.7, V.z1 - 0.3], { collide: false, uvScale: 0.5 });
    B.box('concreteWall', [px - 0.9, 0, -47.5], [px + 0.9, 0.5, -40.5], { uvScale: 0.5 }); // plinth
    world.cover(px - 1.6, -44, -1, 0); world.cover(px + 1.6, -44, 1, 0);
  }
  // street lights on the north parapet
  for (let x = -45; x <= 45; x += 15) { B.box('steelDark', [x - 0.08, top + V.parapet, V.z0 + 0.05], [x + 0.08, top + 6.5, V.z0 + 0.25], { collide: false }); B.box('steelDark', [x - 0.08, top + 6.3, V.z0 + 0.05], [x + 0.08, top + 6.5, V.z0 + 2.6], { collide: false }); B.box('white', [x - 0.35, top + 6.2, V.z0 + 2.0], [x + 0.35, top + 6.35, V.z0 + 3.0], { collide: false, uv: false }); }
  // ---- ramps (east + west): solid embankment wedge, asphalt top, sloped parapets with stepped colliders ----
  for (const [x0, x1] of [[ROAD_E.x0, ROAD_E.x1], [ROAD_W.x0, ROAD_W.x1]]) {
    const z0 = V.z1, z1 = V.rampEnd; // top at z0 (7.5) → ground at z1 (0)
    B.add('concreteWall', slopedBox([x0, -0.2, z0], [x1, top, z1], 'z', { topA0: top - 0.04, topA1: 0.0 }), { uvScale: 0.5 });
    B.add('asphalt', slopedBox([x0 + 0.5, top - 0.5, z0], [x1 - 0.5, top + 0.02, z1], 'z', { topA0: top + 0.02, topA1: 0.02, botA0: top - 0.5, botA1: -0.5 }), { uvScale: 0.3 });
    // colliders: steps of ≤ 0.15 m, solid to the ground
    const n = 50; for (let i = 0; i < n; i++) {
      const za = z0 + (z1 - z0) * i / n, zb = z0 + (z1 - z0) * (i + 1) / n; const y = top * (1 - (i + 1) / n);
      world.walkable([x0, -0.2, za], [x1, Math.max(0.02, y), zb]);
      for (const [px0, px1] of [[x0, x0 + 0.3], [x1 - 0.3, x1]]) world.box([px0, y, za], [px1, y + V.parapet, zb]);
    }
    for (const [px0, px1] of [[x0, x0 + 0.3], [x1 - 0.3, x1]]) B.add('concreteWall', slopedBox([px0, 0, z0], [px1, top + V.parapet, z1], 'z', { topA0: top + V.parapet, topA1: V.parapet, botA0: top - 0.3, botA1: -0.3 }), { uvScale: 0.5 });
    // ramp centre-line dashes, and cover points on the ramp behind the parapet
    for (let z = z0 + 2; z < z1 - 2; z += 4) { const y = top * (1 - (z + 1 - z0) / (z1 - z0)); const g = new THREE.BoxGeometry(0.12, 0.02, 2.0); g.rotateX(-Math.atan2(top, z1 - z0)); g.translate((x0 + x1) / 2, y + 0.05, z + 1); B.add('white', g, { uv: false }); }
    for (const z of [-30, -20, -10]) { const y = top * (1 - (z - z0) / (z1 - z0)); world.cover(x0 + 1.1, z, -1, 0, y); world.cover(x1 - 1.1, z, 1, 0, y); }
  }
  // cover along the deck parapets
  for (const x of [-40, -28, -16, -4, 8, 20, 32, 40]) { world.cover(x, V.z0 + 1.1, 0, -1, top); world.cover(x, V.z1 - 1.1, 0, 1, top); }
  // ground-level road continuing south from the ramp feet to the gates: kerbs + a couple of jersey barriers
  for (const [x0, x1] of [[ROAD_E.x0, ROAD_E.x1], [ROAD_W.x0, ROAD_W.x1]]) {
    const zEnd = x0 > 0 ? 62 : 26;
    B.box('concrete', [x0 - 0.3, 0, V.rampEnd], [x0, 0.14, zEnd], { collide: false, uvScale: 0.5 });
    B.box('concrete', [x1, 0, V.rampEnd], [x1 + 0.3, 0.14, zEnd], { collide: false, uvScale: 0.5 });
  }
}

// ---- signage (canvas textures, separate small meshes) ------------------------------------------------------------
function buildSigns(world, M) {
  const { scene, R } = world;
  const add = (tex, w, h, x, y, z, ry) => {
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.2 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); mesh.position.set(x, y, z); mesh.rotation.y = ry; mesh.castShadow = false; mesh.receiveShadow = true;
    mesh.userData.surface = 'metal'; scene.add(mesh); world.ctx.raycastTargets.push(mesh);
  };
  add(signTexture({ text: 'ГРУЗОВОЙ ДВОР', sub: 'FREIGHT YARD · СОРТИРОВОЧНАЯ', bg: '#1d2a3a', fg: '#e8e4d8', border: '#c9a227', R }), 6, 1.5, SHED.x0 - 0.02, 5.9, 0, -Math.PI / 2);
  add(signTexture({ text: 'ПУТЬ 8', bg: '#14212e', fg: '#ffffff', border: '#ffffff', w: 256, h: 128, R }), 1.4, 0.7, PLATFORM.x0 + 0.5, 3.4, -24, -Math.PI / 2);
  add(signTexture({ text: 'ПУТЬ 8', bg: '#14212e', fg: '#ffffff', border: '#ffffff', w: 256, h: 128, R }), 1.4, 0.7, PLATFORM.x0 + 0.5, 3.4, 24, -Math.PI / 2);
  add(signTexture({ text: 'ДИСПЕТЧЕР', sub: 'YARD OFFICE', bg: '#3a2418', fg: '#e8e4d8', border: '#c9a227', R }), 3.2, 0.8, OFFICE.x1 + 0.02, 3.0, 11, Math.PI / 2);
  add(signTexture({ text: 'ОПАСНО', sub: 'ВЫСОКОЕ НАПРЯЖЕНИЕ', bg: '#c9a227', fg: '#111111', border: '#111111', stripes: false, R }), 1.2, 0.5, -30.7, 2.0, -12, Math.PI / 2);
  add(signTexture({ text: 'ТОПЛИВО', sub: 'NO SMOKING · НЕ КУРИТЬ', bg: '#8a1a12', fg: '#ffffff', border: '#ffffff', R }), 3.0, 0.75, -40, 1.9, 31.05, Math.PI);
  add(signTexture({ text: 'СТОП', bg: '#b3261e', fg: '#ffffff', border: '#ffffff', w: 256, h: 128, R }), 1.0, 0.5, 48.5, 2.2, 61.5, Math.PI);
}
