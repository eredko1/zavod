// SBU ground: lawns, hex-paver mall with brick bands, SAC circular plaza, roads with curbs/crosswalks, Zebra Path, Staller sunken plaza + grass terraces, fountain, pond. SBU agent.
import * as THREE from 'three';
import { Batch, boxGeo, circlePts } from './geo.js';
import { GROUND, MALL, LIB, LIB_LAWN, SAC, SAC_PLAZA, PLAZA_C, BUS_LOOP, ZEBRA, PIT, FOUNTAIN, POND, STALLER, PSY, ENG_DRIVE, EAST_LAWN, BOUNDS, FREY, HARRIMAN, ESS, ECC } from './layout.js';

const PAV_Y = 0.03;   // paving top (3 cm above the lawn plane, no z-fight)

export function groundHeight(x, z) {
  if (x >= PIT.x0 && x <= PIT.x1 && z >= PIT.z0 && z <= PIT.z1) {
    if (x >= PIT.floorX0) return PIT.floor;
    const i = Math.floor((PIT.floorX0 - x) / PIT.tread);
    return Math.min(0, PIT.floor + PIT.rise * (i + 1));
  }
  if (x >= POND.x0 && x <= POND.x1 && z >= POND.z0 && z <= POND.z1) return POND.depth;
  return 0;
}

/** Split a big rect into pieces that avoid the given holes (axis-aligned). */
function rectMinusHoles(rect, holes) {
  let pieces = [rect];
  for (const h of holes) {
    const next = [];
    for (const p of pieces) {
      if (h.x1 <= p.x0 || h.x0 >= p.x1 || h.z1 <= p.z0 || h.z0 >= p.z1) { next.push(p); continue; }
      const hx0 = Math.max(h.x0, p.x0), hx1 = Math.min(h.x1, p.x1), hz0 = Math.max(h.z0, p.z0), hz1 = Math.min(h.z1, p.z1);
      if (p.x0 < hx0) next.push({ x0: p.x0, x1: hx0, z0: p.z0, z1: p.z1 });
      if (hx1 < p.x1) next.push({ x0: hx1, x1: p.x1, z0: p.z0, z1: p.z1 });
      if (p.z0 < hz0) next.push({ x0: hx0, x1: hx1, z0: p.z0, z1: hz0 });
      if (hz1 < p.z1) next.push({ x0: hx0, x1: hx1, z0: hz1, z1: p.z1 });
    }
    pieces = next;
  }
  return pieces;
}

export function buildGround(world, M) {
  const { ctx, scene, R, W } = world;
  const B = new Batch(world, M, 'ground');       // flat paving: receives shadows only
  const S = new Batch(world, M, 'groundSolid');  // walls, terraces, stairs: cast shadows

  // ---- lawn plane with holes for the Staller pit and the pond ------------------------------------------------------
  const holes = [{ x0: PIT.x0, x1: PIT.x1, z0: PIT.z0, z1: PIT.z1 }, { x0: POND.x0, x1: POND.x1, z0: POND.z0, z1: POND.z1 }];
  for (const p of rectMinusHoles({ x0: GROUND.x0, x1: GROUND.x1, z0: GROUND.z0, z1: GROUND.z1 }, holes)) {
    const g = new THREE.PlaneGeometry(p.x1 - p.x0, p.z1 - p.z0, 1, 1); g.rotateX(-Math.PI / 2); g.translate((p.x0 + p.x1) / 2, 0, (p.z0 + p.z1) / 2);
    B.add('grass', g);
  }
  // ground collider (the player walks on y=0 by convention; a floor collider keeps AI nav honest)
  world.box([GROUND.x0, -1, GROUND.z0], [GROUND.x1, 0, GROUND.z1]);

  const pav = (key, x0, z0, x1, z1, { y = PAV_Y, t = 0.12 } = {}) => B.box(key, [Math.min(x0, x1), y - t, Math.min(z0, z1)], [Math.max(x0, x1), y, Math.max(z0, z1)], { collide: false });

  // ---- Academic Mall: hex pavers z -14…12 from the SAC plaza to the Administration forecourt ------------------------
  pav('hex', MALL.x0, MALL.z0, MALL.x1, MALL.z1);
  // widen around the SAC's curved bay and east to the Psychology / east lawn edge
  pav('hex', -40, 12, 18, 20);
  pav('hex', 11, 12, 55, 19);               // SAC east side walk
  pav('hex', 116, 12, 120, 110);            // walk between Psychology and the east lawn
  pav('hex', 55, 12, 120, 19);              // Psychology forecourt
  pav('hex', PSY.x0 - 4, 19, PSY.x0, 72);   // Psychology west walk
  pav('hex', PSY.wingX0, PSY.wingZ1, PSY.x1 + 4, PSY.wingZ1 + 4); // Psychology courtyard walk
  pav('hex', 11, 20, 18, 100);              // SAC east alley to the south
  pav('hex', -40, 20, 11, 24);              // in front of the drum base
  // brick bands across the mall every 6 m + longitudinal edges
  for (let x = MALL.x0 + 8; x < MALL.x1; x += 8) pav('brickPav', x - 0.22, MALL.z0, x + 0.22, MALL.z1, { y: PAV_Y + 0.004, t: 0.02 });
  pav('brickPav', MALL.x0, MALL.z0 + 5.6, MALL.x1, MALL.z0 + 6.0, { y: PAV_Y + 0.004, t: 0.02 });
  pav('brickPav', MALL.x0, MALL.z1 - 6.0, MALL.x1, MALL.z1 - 5.6, { y: PAV_Y + 0.004, t: 0.02 });
  S.box('curb', [MALL.x0, 0, MALL.z0 - 0.3], [MALL.x1, 0.15, MALL.z0], { collide: false });
  S.box('curb', [MALL.x0, 0, MALL.z1], [MALL.x1, 0.15, MALL.z1 + 0.3], { collide: false });
  S.box('curb', [LIB.x0 - 8, 0, LIB_LAWN.z1 - 0.15], [LIB.x1 + 6, 0.15, LIB_LAWN.z1], { collide: false });
  S.box('curb', [EAST_LAWN.x0 - 0.3, 0, EAST_LAWN.z0], [EAST_LAWN.x0, 0.15, EAST_LAWN.z1], { collide: false });
  S.box('curb', [EAST_LAWN.x1, 0, EAST_LAWN.z0], [EAST_LAWN.x1 + 0.3, 0.15, EAST_LAWN.z1], { collide: false });
  S.box('curb', [PIT.x0, 0, PIT.z1 + 0.5], [PIT.floorX0 - 4, 0.15, PIT.z1 + 0.8], { collide: false });
  // tree-pit strips (ivy) along the mall's south edge and the library lawn edge
  for (let x = -100; x < 190; x += 12) {
    if (x > 120 && x < 152) continue; // fountain circle
    S.box('concreteGrey', [x - 2.2, 0, MALL.z1 - 5.6], [x + 2.2, 0.42, MALL.z1 - 1.2]);
    pav('ivy', x - 2.0, MALL.z1 - 5.4, x + 2.0, MALL.z1 - 1.4, { y: 0.5, t: 0.1 });
    world.cover(x - 2.8, MALL.z1 - 3.4, -1, 0); world.cover(x + 2.8, MALL.z1 - 3.4, 1, 0);
  }

  // ---- library forecourt: lawn strip with the entrance walk, hoop-fence + hex apron along the face ------------------
  pav('hex', LIB.entX0 - 2, LIB.z1, LIB.entX1 + 2, LIB_LAWN.z1);           // entrance walk
  pav('hex', LIB.x0 - 8, LIB.z1, LIB.x0 + 2, LIB_LAWN.z1);                  // west end apron
  pav('hex', LIB.x1 - 4, LIB.z1, LIB.x1 + 6, LIB_LAWN.z1);                  // east end apron
  pav('hex', LIB.x0, LIB.z1, LIB.x1, LIB.z1 + 2.5);                         // apron along the facade
  // Zebra Path (between Frey Hall and the library) + link to the mall
  pav('zebra', ZEBRA.x - ZEBRA.w / 2, ZEBRA.z0, ZEBRA.x + ZEBRA.w / 2, ZEBRA.z1, { y: PAV_Y + 0.005 });
  pav('hex', ZEBRA.x - 6, ZEBRA.z1, ZEBRA.x + 6, MALL.z0);
  pav('hex', ZEBRA.x - 5, -146, ZEBRA.x + 5, ZEBRA.z0);
  pav('hex', LIB.x0 - 7, -56, LIB.x0, -25);                                 // library west side walk
  pav('hex', FREY.x1, -60, LIB.wingX0, -52);                                // Frey / library link
  pav('hex', FREY.x0 - 6, FREY.z0 - 6, FREY.x1 + 6, FREY.z0);               // north of Frey
  pav('hex', FREY.x0 - 6, FREY.z0 - 6, FREY.x0, FREY.z1 + 6);               // west of Frey
  pav('hex', FREY.x0 - 6, FREY.z1, FREY.x1 + 6, FREY.z1 + 6);               // south of Frey
  pav('hex', HARRIMAN.x0, HARRIMAN.z1, HARRIMAN.x1 + 6, HARRIMAN.z1 + 6);   // south of Harriman
  pav('hex', -125, -54, -96, -46);                                          // Harriman → Frey alley
  pav('hex', ESS.x1, ESS.z0 - 6, ESS.x1 + 6, ESS.z1 + 6);                   // east of ESS
  pav('hex', -140, -46, -128, MALL.z0);                                     // ESS north walk down to the mall

  // ---- SAC plaza: hex field + radial concrete bands + ring ---------------------------------------------------------------
  B.poly('hex', SAC_PLAZA, PAV_Y + 0.002);
  const pc = PLAZA_C;
  B.poly('asphalt', circlePts(pc.x, pc.z, pc.r, 64), PAV_Y + 0.005);
  for (let k = 0; k < 12; k++) {
    const a = k * Math.PI / 6 + 0.15; const dx = Math.cos(a), dz = Math.sin(a); const nx = -dz * 0.45, nz = dx * 0.45;
    const r0 = 6, r1 = pc.r;
    B.poly('concretePav', [[pc.x + dx * r0 + nx, pc.z + dz * r0 + nz], [pc.x + dx * r1 + nx, pc.z + dz * r1 + nz], [pc.x + dx * r1 - nx, pc.z + dz * r1 - nz], [pc.x + dx * r0 - nx, pc.z + dz * r0 - nz]], PAV_Y + 0.008);
  }
  for (const rr of [6, 18, pc.r]) {
    const outer = circlePts(pc.x, pc.z, rr + 0.35, 64), inner = circlePts(pc.x, pc.z, rr - 0.35, 64).reverse();
    const shape = new THREE.Shape(outer.map(p => new THREE.Vector2(p[0], -p[1]))); shape.holes.push(new THREE.Path(inner.map(p => new THREE.Vector2(p[0], -p[1]))));
    const g = new THREE.ShapeGeometry(shape, 1); g.rotateX(-Math.PI / 2); g.translate(0, PAV_Y + 0.008, 0); B.add('concretePav', g);
  }
  B.poly('brickPav', circlePts(pc.x, pc.z, 5.5, 40), PAV_Y + 0.006);
  // bus loop link walk (plaza → loop) and the SAC south service alley
  pav('hex', -112, 55, -100, 75);
  pav('hex', -112, 75, -104, 118);   // continue the link walk in hex pavers (plain concrete read as a dirt strip at eye level)

  // ---- east lawn, fountain, pond, Staller ---------------------------------------------------------------------------------
  const F = FOUNTAIN;
  // granite basin: split-face ring wall r 6 (1.1 m high, 0.9 thick) with a cap slab, wet cobble floor inside, 4-ring cobble apron outside
  const ring = (key, r0, r1, y0, y1, seg = 64) => { const o = circlePts(F.x, F.z, r1, seg), i2 = circlePts(F.x, F.z, r0, seg).reverse(); const sh = new THREE.Shape(o.map(p => new THREE.Vector2(p[0], -p[1]))); sh.holes.push(new THREE.Path(i2.map(p => new THREE.Vector2(p[0], -p[1])))); const gg = new THREE.ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false }); gg.rotateX(-Math.PI / 2); gg.translate(0, y0, 0); return gg; };
  const cylWall = (key, r, y0, y1, inward = false, seg = 64, scale = 1 / 1.2) => { const g = new THREE.CylinderGeometry(r, r, y1 - y0, seg, 1, true); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * Math.PI * r * scale, uv.getY(i) * (y1 - y0) * scale); if (inward) g.scale(-1, 1, 1); g.translate(F.x, (y0 + y1) / 2, F.z); S.add(key, g, { uv: false }); };
  cylWall('granite', 6.1, 0, 1.0); cylWall('granite', 5.2, 0.3, 1.0, true);
  S.add('graniteCap', ring('graniteCap', 5.05, 6.25, 1.0, 1.12));
  for (let k = 0; k < 24; k++) { const a = k * Math.PI / 12; const g = boxGeo([-0.03, 0.05, -0.025], [0.03, 0.98, 0.025]); g.rotateY(-a); g.translate(F.x + Math.cos(a) * 6.1, 0, F.z + Math.sin(a) * 6.1); S.add('steelDark', g, { uv: false }); }  // block joints
  for (let k = 0; k < 24; k++) { const a = k * Math.PI / 12; world.box([F.x + Math.cos(a) * 5.65 - 0.8, 0, F.z + Math.sin(a) * 5.65 - 0.8], [F.x + Math.cos(a) * 5.65 + 0.8, 1.12, F.z + Math.sin(a) * 5.65 + 0.8]); }
  B.poly('cobbleWet', circlePts(F.x, F.z, 5.2, 48), 0.3);
  B.cyl('steelDark', F.x, F.z, 0.3, 0.55, 0.7, 16, { r0: 0.9 });
  { const g = new THREE.CircleGeometry(5.15, 48); g.rotateX(-Math.PI / 2); g.translate(F.x, 0.55, F.z); B.add('water', g); }
  B.add('cobble', ring('cobble', 6.3, F.ring + 1.5, PAV_Y, PAV_Y + 0.012));
  for (const rr of [7.4, 8.5, 9.6]) B.add('graniteCap', ring('graniteCap', rr - 0.06, rr + 0.06, PAV_Y + 0.012, PAV_Y + 0.02));
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) world.cover(F.x + Math.cos(a) * 7.0, F.z + Math.sin(a) * 7.0, Math.cos(a), Math.sin(a));
  pav('hex', 120, -14, 178, 12);                                              // mall continues to the Admin forecourt
  pav('hex', F.x - 8, -60, F.x + 8, -14);                                     // walk north to the Staller plaza stair
  pav('hex', 100, -61, 146, -50);                                             // pit south rim walk
  pav('hex', 146, -145, 152, -50);                                            // Staller east wing west walk (top level)
  pav('hex', 174, -145, 180, -50);                                            // east of Staller
  pav('hex', 120, 12, 175, 16);
  pav('hex', 170, 12, 175, 110);                                              // Humanities west walk
  pav('hex', 120, 60, 175, 64);                                               // lawn cross path
  pav('hex', 55, 72, 120, 80);                                                // south of Psychology
  pav('hex', 18, 80, 120, 88);                                                // ECC north walk
  pav('hex', 18, 88, 30, 140);                                                // south alley to Engineering Drive
  pav('hex', 120, 110, 175, 116);                                             // south of east lawn

  // pond (The Brook): basin, water, concrete rim
  const P = POND;
  S.box('mud', [P.x0, P.depth - 0.4, P.z0], [P.x1, P.depth, P.z1], { collide: true });
  { const g = new THREE.PlaneGeometry(P.x1 - P.x0 - 0.6, P.z1 - P.z0 - 0.6); g.rotateX(-Math.PI / 2); g.translate((P.x0 + P.x1) / 2, -0.12, (P.z0 + P.z1) / 2); B.add('water', g); }
  for (const [a, b] of [[[P.x0 - 0.8, P.z0 - 0.8], [P.x1 + 0.8, P.z0]], [[P.x0 - 0.8, P.z1], [P.x1 + 0.8, P.z1 + 0.8]], [[P.x0 - 0.8, P.z0], [P.x0, P.z1]], [[P.x1, P.z0], [P.x1 + 0.8, P.z1]]])
    S.box('concretePav', [a[0], -0.5, a[1]], [b[0], 0.4, b[1]]);
  for (const [a, b] of [[[P.x0, P.depth - 0.4, P.z0], [P.x1, 0, P.z0 + 0.3]], [[P.x0, P.depth - 0.4, P.z1 - 0.3], [P.x1, 0, P.z1]], [[P.x0, P.depth - 0.4, P.z0], [P.x0 + 0.3, 0, P.z1]], [[P.x1 - 0.3, P.depth - 0.4, P.z0], [P.x1, 0, P.z1]]])
    S.box('concreteGrey', a, b, { collide: false });

  // Staller sunken plaza: floor, retaining walls, 8 grass terraces with concrete risers, stair at the south end
  const T = PIT;
  B.box('concretePav', [T.floorX0, T.floor - 0.5, T.z0], [T.x1, T.floor, T.z1], { collide: true });
  for (let i = 0; i < T.steps; i++) {
    const x1 = T.floorX0 - i * T.tread, x0 = x1 - T.tread; const top = T.floor + T.rise * (i + 1);
    S.box('grass', [x0, T.floor - 0.5, T.z0], [x1 - 0.18, top, T.z1], { walkable: true });
    // pale cast concrete riser (never unlit: plain material, no ARM/metalness map) + a 0.04 m nosing lip that catches the sun
    S.box('riser', [x1 - 0.18, T.floor - 0.5, T.z0], [x1, top - 0.05, T.z1], { collide: false });
    S.box('nosing', [x1 - 0.22, top - 0.05, T.z0], [x1 + 0.04, top + 0.02, T.z1], { collide: false });
    // granite kerb capping the grass tread against the riser (staller_steps.jpg)
    S.box('graniteCap', [x1 - 0.55, top - 0.06, T.z0], [x1 - 0.18, top + 0.015, T.z1], { collide: false });
    world.cover(x0 + 1.2, T.z0 + 12, 1, 0, top); world.cover(x0 + 1.2, T.z1 - 12, 1, 0, top);
  }
  S.box('grass', [T.x0, -0.5, T.z0], [T.floorX0 - T.steps * T.tread, 0, T.z1], { collide: true });          // upper lawn
  S.box('concreteGrey', [T.x0 - 0.2, T.floor - 0.5, T.z0 - 0.4], [T.x1, T.floor + 0.1, T.z0], { collide: true }); // north wall footing (Staller block sits on it)
  S.box('concreteGrey', [T.floorX0 - 4, T.floor - 0.5, T.z1], [T.x1, 0, T.z1 + 0.6], { collide: true });      // south retaining wall (east part)
  S.stairs('concretePav', { x: (T.floorX0 + T.x1) / 2, z: T.z1 - 9, y0: T.floor, rise: -T.floor, run: 9, width: T.x1 - T.floorX0 - 1, axis: 'z', dir: 1, n: 10 });
  // low wall along the south rim of the terraces (mall side) with a gap for the stair
  S.box('graniteWall', [T.x0, 0, T.z1], [T.floorX0 - 4, 0.45, T.z1 + 0.5]);
  S.box('graniteCap', [T.x0 - 0.06, 0.45, T.z1 - 0.06], [T.floorX0 - 4, 0.53, T.z1 + 0.56], { collide: false });
  for (let x = T.x0 + 6; x < T.floorX0 - 6; x += 12) world.cover(x, T.z1 + 1.3, 0, 1);
  // Staller entrance walk on the pit floor + terrace railing posts
  B.box('concretePav', [T.floorX0, T.floor, T.z0], [T.x1, T.floor + 0.02, T.z0 + 6], { collide: false });

  // ---- roads: Campus Drive bus loop (asphalt ring + island), Campus Drive west exit, Engineering Drive stub ----------------
  const L = BUS_LOOP;
  { const outer = circlePts(L.x, L.z, L.r + L.w / 2, 64), inner = circlePts(L.x, L.z, L.r - L.w / 2, 64).reverse();
    const shape = new THREE.Shape(outer.map(p => new THREE.Vector2(p[0], -p[1]))); shape.holes.push(new THREE.Path(inner.map(p => new THREE.Vector2(p[0], -p[1]))));
    const g = new THREE.ShapeGeometry(shape, 1); g.rotateX(-Math.PI / 2); g.translate(0, 0.02, 0); B.add('asphalt', g);
    // curbs: outer + inner rings (low)
    for (const rr of [L.r + L.w / 2, L.r - L.w / 2]) { const o = circlePts(L.x, L.z, rr + 0.25, 64), i2 = circlePts(L.x, L.z, rr - 0.25, 64).reverse(); const sh = new THREE.Shape(o.map(p => new THREE.Vector2(p[0], -p[1]))); sh.holes.push(new THREE.Path(i2.map(p => new THREE.Vector2(p[0], -p[1])))); const gg = new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: false }); gg.rotateX(-Math.PI / 2); gg.translate(0, 0.0, 0); S.add('curb', gg); }
    // island: concrete pad + shelter footing
    B.poly('concretePav', circlePts(L.x, L.z, L.r - L.w / 2 - 0.3, 48), PAV_Y + 0.004);
    // lane dashes around the ring
    for (let k = 0; k < 28; k++) { const a = k * Math.PI * 2 / 28; const g2 = boxGeo([-1.2, 0.03, -0.08], [1.2, 0.045, 0.08]); g2.rotateY(-a - Math.PI / 2); g2.translate(L.x + Math.cos(a) * L.r, 0, L.z + Math.sin(a) * L.r); B.add('paint', g2, { uv: false }); }
  }
  // Campus Drive exits west from the loop at z = L.z (road 9 m wide) to the map edge; stop line + crosswalk at the loop
  pav('asphalt', BOUNDS.x0 - 30, L.z - 4.5, L.x - L.r, L.z + 4.5, { y: 0.02, t: 0.1 });
  pav('curb', BOUNDS.x0 - 30, L.z - 4.75, L.x - L.r - 2, L.z - 4.5, { y: 0.14, t: 0.14 });
  pav('curb', BOUNDS.x0 - 30, L.z + 4.5, L.x - L.r - 2, L.z + 4.75, { y: 0.14, t: 0.14 });
  for (let z = L.z - 3.6; z < L.z + 4; z += 1.2) pav('paint', L.x - L.r - 7, z, L.x - L.r - 3, z + 0.6, { y: 0.035, t: 0.015 });   // crosswalk
  for (let x = BOUNDS.x0 - 28; x < L.x - L.r - 8; x += 6) pav('paintY', x, L.z - 0.08, x + 3, L.z + 0.08, { y: 0.035, t: 0.015 });
  // sidewalks along Campus Drive
  pav('concretePav', BOUNDS.x0 - 30, L.z - 7.5, L.x - L.r - 2, L.z - 4.75);
  pav('concretePav', BOUNDS.x0 - 30, L.z + 4.75, L.x - L.r - 2, L.z + 7.5);
  // Engineering Drive: road stub from the south edge up to the SAC service alley
  const E = ENG_DRIVE;
  pav('asphalt', E.x0, E.z0, E.x1, BOUNDS.z1 + 30, { y: 0.02, t: 0.1 });
  pav('curb', E.x0 - 0.25, E.z0, E.x0, BOUNDS.z1 + 30, { y: 0.14, t: 0.14 });
  pav('curb', E.x1, E.z0, E.x1 + 0.25, BOUNDS.z1 + 30, { y: 0.14, t: 0.14 });
  pav('concretePav', E.x0 - 3, E.z0 - 3, E.x1 + 3, E.z0, { y: PAV_Y });
  pav('concretePav', E.x0 - 3, E.z0, E.x0 - 0.25, BOUNDS.z1 + 30);
  pav('concretePav', E.x1 + 0.25, E.z0, E.x1 + 3, BOUNDS.z1 + 30);
  for (let z = E.z0 + 4; z < BOUNDS.z1 + 30; z += 6) pav('paintY', (E.x0 + E.x1) / 2 - 0.08, z, (E.x0 + E.x1) / 2 + 0.08, z + 3, { y: 0.035, t: 0.015 });
  for (let x = E.x0 + 0.6; x < E.x1; x += 1.2) pav('paint', x, E.z0 + 1, x + 0.6, E.z0 + 4, { y: 0.035, t: 0.015 });
  // lane arrows (straight) on Engineering Drive and at the loop entry
  for (const [ax, az, dir] of [[(E.x0 + E.x1) / 2 - 2, E.z0 + 14, 1], [(E.x0 + E.x1) / 2 + 2, E.z0 + 30, -1], [L.x - L.r - 12, L.z + 2.4, 0], [L.x - L.r - 12, L.z - 2.4, 0]]) {
    if (dir === 0) { pav('paint', ax - 2, az - 0.12, ax + 1, az + 0.12, { y: 0.035, t: 0.015 }); const g = new THREE.ConeGeometry(0.5, 1.2, 3); g.rotateX(Math.PI / 2); g.rotateY(Math.PI / 2); g.scale(1, 0.02, 1); g.translate(ax + 1.5, 0.035, az); B.add('paint', g, { uv: false }); }
    else { pav('paint', ax - 0.12, az - 1.5 * dir, ax + 0.12, az + 1.5 * dir, { y: 0.035, t: 0.015 }); const g = new THREE.ConeGeometry(0.5, 1.2, 3); g.rotateX(dir > 0 ? -Math.PI / 2 : Math.PI / 2); g.scale(1, 0.02, 1); g.translate(ax, 0.035, az + 2.1 * dir); B.add('paint', g, { uv: false }); }
  }
  pav('concretePav', -100, 96, E.x0, 104);                                  // walk from the loop to Engineering Drive
  pav('concretePav', E.x1, 96, 18, 104);                                    // walk to the SAC south alley
  // John S. Toll Drive (backdrop, north of Chemistry / Staller) + Circle-Road-style west backdrop road
  pav('asphalt', -260, -212, 400, -202, { y: 0.02, t: 0.1 });
  for (let x = -258; x < 400; x += 8) pav('paintY', x, -207.1, x + 4, -206.9, { y: 0.035, t: 0.015 });
  pav('asphalt', -262, -212, -252, 260, { y: 0.02, t: 0.1 });                                   // Circle Road (west arc, straightened)
  for (let z = -210; z < 260; z += 8) pav('paintY', -257.1, z, -256.9, z + 4, { y: 0.035, t: 0.015 });
  pav('asphalt', -262, 250, 400, 260, { y: 0.02, t: 0.1 });                                     // Circle Road south leg
  // Nicolls Road (Route 97): divided 4-lane highway at the far west edge of campus, grass median
  pav('asphalt', -712, -900, -698, 900, { y: 0.02, t: 0.1 }); pav('asphalt', -690, -900, -676, 900, { y: 0.02, t: 0.1 });
  for (let z = -900; z < 900; z += 12) { pav('paint', -705.1, z, -704.9, z + 4, { y: 0.035, t: 0.015 }); pav('paint', -683.1, z, -682.9, z + 4, { y: 0.035, t: 0.015 }); }
  pav('paintY', -698.2, -900, -697.9, 900, { y: 0.035, t: 0.015 }); pav('paintY', -690.1, -900, -689.8, 900, { y: 0.035, t: 0.015 });

  // ---- granite retaining walls / kerbs where lawn meets paving (no more razor grass-to-slab edges) -----------------------
  // a 0.45 m split-face granite wall with a cap, so every lawn edge reads as a built edge (staller_steps.jpg foreground)
  const retain = (x0, z0, x1, z1, h = 0.45) => {
    const ax0 = Math.min(x0, x1), ax1 = Math.max(x0, x1), az0 = Math.min(z0, z1), az1 = Math.max(z0, z1);
    S.box('graniteWall', [ax0, -0.4, az0], [ax1, h, az1], { collide: false });
    S.box('graniteCap', [ax0 - 0.07, h, az0 - 0.07], [ax1 + 0.07, h + 0.09, az1 + 0.07], { collide: false });
  };
  // east lawn (fountain → Humanities): all four edges
  retain(EAST_LAWN.x0 - 0.45, EAST_LAWN.z0 + 4, EAST_LAWN.x0, EAST_LAWN.z1);
  retain(EAST_LAWN.x1, EAST_LAWN.z0 + 4, EAST_LAWN.x1 + 0.45, EAST_LAWN.z1);
  retain(EAST_LAWN.x0, EAST_LAWN.z0 + 4, EAST_LAWN.x1, EAST_LAWN.z0 + 4.45);
  retain(EAST_LAWN.x0, 110, EAST_LAWN.x1, 110.45);
  retain(EAST_LAWN.x0, 60, EAST_LAWN.x1, 60.45, 0.35);
  // the arts-centre lawn either side of the terraces
  retain(T.x0, T.z0 - 0.5, T.floorX0 - 4, T.z0 - 0.05, 0.4);
  retain(T.x0 - 0.45, T.z0 - 0.5, T.x0, T.z1 + 0.5, 0.4);
  // library forecourt lawn
  retain(LIB.x0 - 0.45, LIB.z1 + 2.5, LIB.x0, LIB_LAWN.z1 - 0.2, 0.35);
  retain(LIB.x1, LIB.z1 + 2.5, LIB.x1 + 0.45, LIB_LAWN.z1 - 0.2, 0.35);
  // bus-loop / Campus Drive walk: kerb both sides so the concrete no longer meets raw grass
  retain(-112.45, 55, -112, 118, 0.28); retain(-104, 75, -103.55, 118, 0.28); retain(-100, 55, -99.55, 75, 0.28);
  // south walks (lecture-hall lawn) and the Psychology forecourt
  retain(18, 79.55, 120, 80, 0.3); retain(18, 88, 120, 88.45, 0.3);
  retain(119.55, 12, 120, 110, 0.3); retain(169.55, 12, 170, 110, 0.3);
  // wide mulch/plant beds at the building feet (breaks the wall-meets-grass line, reads as maintained campus)
  const bed = (x0, z0, x1, z1) => B.box('mulchDark', [Math.min(x0, x1), 0.02, Math.min(z0, z1)], [Math.max(x0, x1), 0.09, Math.max(z0, z1)], { collide: false });
  bed(LIB.x0 - 1.4, LIB.z1 + 2.5, LIB.x1 + 1.4, LIB.z1 + 4.2);
  bed(PSY.x0 - 2.2, PSY.z0 - 2.2, PSY.x1 + 2.2, PSY.z0);
  bed(FREY.x0 - 1.8, FREY.z1, FREY.x1 + 1.8, FREY.z1 + 1.8);
  bed(ECC.x0 - 2, ECC.z0 - 2.2, ECC.x1 + 2, ECC.z0);

  B.flush({ shadow: false }); S.flush();
  W.groundHeight = groundHeight;
}
