// TERMINAL — direct subway route from the west arcade: street-style stair (railings, globe lamps) in the concourse's west arcade down to a
// tiled passage (y −6) that runs west under the arcade floor, south under the ramp corridor/landing and west of the waiting hall, then east
// into the subway mezzanine. Every level-0 floor above it is registered as a collider slab. TERMINAL agent.
import * as THREE from 'three';
import { Bucket, mat4, stairSteps } from './kit.js';
import { P } from './plan.js';

export function buildPassage(world, M, Z) {
  const B = new Bucket(world);
  const { LOW, PASS, MEZ, RZ0, RZ1 } = P; const T = 0.6;
  const yc = LOW + 2.7;                       // passage ceiling
  const [sx0, sx1] = PASS.stairX, [sz0, sz1] = PASS.stairZ;
  const cx = (sx0 + sx1) / 2, w = sx1 - sx0;

  // ---- stair: descends south from z=8 (y 0) to z=17.6 (y −6) inside the west arcade ------------------------------------
  const st = stairSteps(world, B, M.concrete, { x: cx, z: sz1, dir: [0, -1], width: w, run: sz1 - sz0, rise: -LOW, y0: LOW, n: 32, depthUnder: 0.6, uvScale: 0.5 });
  Z.push({ x0: sx0, x1: sx1, z0: sz0, z1: sz1, h: (x, z) => { const a = sz1 - z; const i = Math.min(31, Math.floor(a / st.stepRun)); return LOW + (i + 1) * st.stepRise; } });
  // the hole in the concourse floor: side walls of the well (tile) + street-style railings (dark green iron) + globe lamps on posts at the top
  for (const s of [-1, 1]) {
    const wx = cx + s * (w / 2 + 0.15);
    B.box(M.tile, [wx - 0.15, LOW, sz0 - 0.3], [wx + 0.15, 0.0, sz1 + T], { uvScale: 1 }); world.box([wx - 0.15, LOW, sz0 - 0.3], [wx + 0.15, 1.05, sz1 + T]);
    B.box(M.steelGreen, [wx - 0.05, 0, sz0 - 0.3], [wx + 0.05, 1.05, sz1], { uvScale: 1 });        // railing top over the well edge
    B.box(M.steelGreen, [wx - 0.35, 0, sz0 - 0.55], [wx + 0.35, 0.12, sz0 - 0.3], { uvScale: 1 });
    B.add(M.steelGreen, new THREE.CylinderGeometry(0.06, 0.07, 2.6, 8), mat4(wx, 1.3, sz0 - 0.45)); B.add(M.lampGlass, new THREE.SphereGeometry(0.22, 12, 8), mat4(wx, 2.75, sz0 - 0.45)); world.termLamps.push([wx, 2.75, sz0 - 0.45]);
    B.box(M.stainless, [cx + s * (w / 2 - 0.1) - 0.02, LOW, sz0], [cx + s * (w / 2 - 0.1) + 0.02, 1.0, sz1], { uvScale: 1 });
  }
  B.box(M.stainless, [cx - 0.03, LOW, sz0], [cx + 0.03, 1.0, sz1], { uvScale: 1 });
  // back wall of the well at the bottom (south end) is the passage; the north lip: a low kerb
  B.box(M.marbleDark, [sx0 - 0.4, 0, sz0 - 0.55], [sx1 + 0.4, 0.14, sz0 - 0.3], { uvScale: 1 }); world.box([sx0 - 0.4, 0, sz0 - 0.55], [sx1 + 0.4, 0.14, sz0 - 0.3]);
  // lit "SUBWAY ↓" sign over the stair head + emissive white strip lighting the treads
  const subSign = M.sign('SUBWAY  ↓   1 · 2 · 3 · 4', { bg: '#0d3b1f', fg: '#ffffff', font: 'bold 64px Helvetica, Arial, sans-serif' });
  B.add(M.atlas, M.signGeo(subSign, 3.2, 0.42), mat4(cx, 3.1, sz0 - 0.45, 0, 0, 0)); B.add(M.atlas, M.signGeo(subSign, 3.2, 0.42), mat4(cx, 3.1, sz0 - 0.45, 0, Math.PI, 0));
  B.box(M.brassDark, [cx - 1.7, 2.85, sz0 - 0.5], [cx + 1.7, 3.35, sz0 - 0.4], { uvScale: 1 });
  world.termLamps.push([cx, 3.6, sz0 - 0.45, 'point']);

  // ---- passage legs (y −6): A: stair foot → west under the arcade floor; B: south under the corridor/landing; C: east into the mezzanine --------
  const legs = [
    { x0: PASS.legW[0], x1: sx1, z0: sz1, z1: sz1 + 4 },                                    // A: z∈[17.6,21.6], x from −54 to −36.5 (under the arcade + corridor edge)
    { x0: PASS.legW[0], x1: PASS.legW[1], z0: sz1 + 4, z1: MEZ.z0 + 4.7 },                   // B: x∈[−54,−50], z from 21.6 to 54.7
    { x0: PASS.legW[1], x1: MEZ.x0 - 1 + 0.01, z0: MEZ.z0 + 1.2, z1: MEZ.z0 + 4.7 },           // C: z∈[51.2,54.7], x from −50 to −25
  ];
  for (const L of legs) {
    B.box(M.concrete, [L.x0 - T, LOW - 0.6, L.z0 - T], [L.x1 + T, LOW, L.z1 + T], { uvScale: 0.5 });
    Z.push({ x0: L.x0, x1: L.x1, z0: L.z0, z1: L.z1, h: LOW });
    B.box(M.concrete, [L.x0 - T, yc, L.z0 - T], [L.x1 + T, yc + 0.5, L.z1 + T], { uvScale: 0.5 });
  }
  // walls: tile with band — built per leg, leaving the joins open
  const wall = (x0, y0, z0, x1, y1, z1) => { B.box(M.tile, [x0, y0, z0], [x1, y1, z1], { uvScale: 1 }); world.box([x0, y0, z0], [x1, y1, z1]); };
  const A = legs[0], Bg = legs[1], C = legs[2];
  wall(A.x0 - T, LOW, A.z0 - T, sx0 - 0.15, yc, A.z0);            // A north wall (west of the stair mouth)
  wall(sx1 + 0.15, LOW, A.z0 - T, A.x1 + T, yc, A.z0);            // A north wall (east of the stair mouth)
  wall(A.x1, LOW, A.z0 - T, A.x1 + T, yc, A.z1 + T);              // A east end wall
  wall(Bg.x1, LOW, A.z1, A.x1 + T, yc, A.z1 + T);                 // A south wall (east of leg B)
  wall(Bg.x1, LOW, A.z1 + T, Bg.x1 + T, yc, C.z0);                // B east wall down to the C junction
  wall(Bg.x0 - T, LOW, A.z0 - T, Bg.x0, yc, Bg.z1 + T);           // B/A west wall (full)
  wall(Bg.x0 - T, LOW, C.z1, C.x1 + T, yc, C.z1 + T);             // C south wall (+ B's south end)
  wall(Bg.x1, LOW, C.z0 - T, C.x1 + T, yc, C.z0);                 // C north wall
  for (const [x0, z0, x1, z1, faceX] of [[A.x0, A.z0 - 0.01, A.x1, A.z0, false], [C.x0, C.z0 - 0.01, C.x1, C.z0, false], [Bg.x0 - 0.01, A.z0, Bg.x0, Bg.z1, true]]) B.box(M.tileBand, [x0, LOW + 2.0, z0], [x1, LOW + 2.4, z1], { uvScale: 1 });
  // lighting: fluorescent tubes every 6 m along the legs; signs at the turns
  for (let x = A.x0 + 3; x < A.x1; x += 6) world.termLamps.push([x, yc - 0.15, (A.z0 + A.z1) / 2, 'fluor']);
  for (let z = Bg.z0 + 3; z < Bg.z1; z += 6) world.termLamps.push([(Bg.x0 + Bg.x1) / 2, yc - 0.15, z, 'fluorZ']);
  for (let x = C.x0 + 3; x < C.x1; x += 6) world.termLamps.push([x, yc - 0.15, (C.z0 + C.z1) / 2, 'fluor']);
  world.termLamps.push([(Bg.x0 + Bg.x1) / 2, yc - 0.6, 38, 'fluorReal']);
  const sg = (t, x, z, yaw) => B.add(M.atlas, M.signGeo(t, { bg: '#0d0d0d', fg: '#ffffff', font: 'bold 56px Helvetica, Arial, sans-serif' }, 3.6, 0.45), mat4(x, LOW + 2.45, z, 0, yaw, 0));
  sg('⟵  TO TRAINS  ·  1 · 2 · 3 · 4', cx, A.z1 - 0.02, Math.PI); sg('⟶  MAIN CONCOURSE  ·  EXIT', A.x1 - 6, A.z0 + 0.02, 0);
  sg('TO TRAINS  ⟶', Bg.x0 + 0.02, C.z0 + 1.8, Math.PI / 2); sg('⟵  EXIT  ·  MAIN CONCOURSE', Bg.x1 - 0.02, A.z1 + 2, -Math.PI / 2);
  sg('TRAINS  ⟶', C.x1 - 3, C.z0 + 0.02, 0);
  // posters in leg B, bins, cover
  for (let z = 26; z < 50; z += 8) { B.box(M.ironDark, [Bg.x0 - 0.05, LOW + 0.9, z - 1.0], [Bg.x0 + 0.02, LOW + 3.0, z + 1.0], { uvScale: 1 }); B.add(M.atlas, M.posterGeo(Math.floor(z / 8), 2.0, 1.9), mat4(Bg.x0 + 0.03, LOW + 1.95, z, 0, Math.PI / 2, 0)); }
  world.termTrash.push([A.x0 + 1, LOW, A.z1 - 0.8], [Bg.x1 - 0.8, LOW, 40], [C.x1 - 1.5, LOW, C.z1 - 0.8]);
  world.cover(Bg.x1 - 1.0, 30, 1, 0, LOW); world.cover(A.x0 + 1.2, A.z0 + 2, -1, 0, LOW); world.cover(C.x0 + 1, C.z0 + 2, -1, 0, LOW);

  // ---- level-0 floors above the passage become collider slabs (the concourse floor is groundHeight 0 elsewhere) ---------------------------
  world.box([A.x0 - T, -0.7, A.z0 - T], [A.x1 + T, 0, P.Z1]);                       // arcade floor over leg A (inside the concourse)
  world.box([A.x0 - T, -0.7, P.Z1], [A.x1 + T, 0, A.z1 + T]);                        // corridor floor over leg A (south of the wall)
  world.box([Bg.x0 - T, -0.7, A.z1], [Bg.x1 + T, 0, RZ1 + 1]);                       // corridor + ramp-top landing over leg B
  // the ramp-strip / waiting-hall side wall west of Vanderbilt Hall: nothing walkable above leg B south of z=30 (exterior seal handles it)
  B.flush((m) => (m === M.stainless || m === M.ironDark || m === M.steelGreen ? 'metal' : 'concrete'), { name: 'passage' });
}
