// TERMINAL — subway (fictional CENTRAL STATION express stop): mezzanine (y −6, turnstiles/token booth) over a 4-track station (y −12):
// two island platforms, riveted I-beam column rows between door positions, white tile + colored band + mosaics, fluorescent rows,
// two stainless trains parked on the outer tracks with doors on the platform edges (walk-through interiors). TERMINAL agent.
import * as THREE from 'three';
import { Bucket, mat4, stairSteps, instanced } from './kit.js';
import { P } from './plan.js';

export const CAR = { L: 15.6, W: 2.9, H: 3.5, GAP: 0.6, N: 4, X0: -30 };   // car 0 centre at X0, cars along +x
export function carCentres() { const out = []; for (let c = 0; c < CAR.N; c++) out.push(CAR.X0 + c * (CAR.L + CAR.GAP)); return out; }
export function doorXs() { const out = []; for (const cx of carCentres()) out.push(cx - 5.2, cx, cx + 5.2); return out; }
/** column x positions: midway between doors (never in front of a door) */
export function columnXs() { const d = doorXs(); const out = []; for (let i = 0; i < d.length - 1; i++) out.push((d[i] + d[i + 1]) / 2); out.unshift(d[0] - 2.6); out.push(d[d.length - 1] + 2.6); return out; }

export function buildSubway(world, M, Z) {
  const B = new Bucket(world);
  const uv = (m) => m.userData.uv ?? 0.5;
  const { LOW, SUB, MEZ, TRK, ISL, SUB_CEIL: CEIL, SUB_X0: X0, SUB_X1: X1 } = P; const T = 1.0;
  const subFloor = M.concrete.clone(); subFloor.name = 'subFloor'; subFloor.color.set(0x5a5754); subFloor.roughness = 1.0; subFloor.roughnessMap = M.marbleFloor.roughnessMap; subFloor.map = M.grimeMap; subFloor.needsUpdate = true;
  const subCeil = M.concrete.clone(); subCeil.name = 'subCeil'; subCeil.color.set(0x9a958c);
  const yellow = new THREE.MeshStandardMaterial({ color: 0xd8b528, roughness: 0.8 }); yellow.name = 'yellow';
  const zEnd = TRK.D[1] + 0.5;                   // south wall inner face
  const bandY = SUB + 2.1;
  const stairWells = [];                          // {x0,x1,z0,z1} holes in the mezzanine floor / platform ceiling

  // ================= mezzanine (y = −6) x∈[−24,24], z∈[50,88]: turnstiles, token booth, 4 stair wells =================
  {
    const { x0, x1, z0, z1 } = MEZ; const yc = LOW + 3.4;
    // stair wells (x from ±23 → ±13.4 descending toward the centre; one per island per side)
    for (const side of [-1, 1]) for (const isl of [1, 2]) { const [za, zb] = ISL[isl]; const zc = (za + zb) / 2; stairWells.push({ x0: Math.min(side * 21, side * 11.4), x1: Math.max(side * 21, side * 11.4), z0: zc - 2, z1: zc + 2, side, isl }); }
    // floor: strips between wells (split by z bands so the wells are real holes)
    const bands = [[z0 + T, ISL[1][0] + 1.5], [ISL[1][0] + 1.5, ISL[1][1] - 1.5], [ISL[1][1] - 1.5, ISL[2][0] + 1.5], [ISL[2][0] + 1.5, ISL[2][1] - 1.5], [ISL[2][1] - 1.5, z1 + T]];
    for (const [ba, bb] of bands) {
      const wells = stairWells.filter(w => w.z0 < bb && w.z1 > ba);
      if (!wells.length) { B.box(subFloor, [x0 - T, LOW - 0.6, ba], [x1 + T, LOW, bb], { uvScale: 0.5 }); continue; }
      // x-segments around the two wells in this band (west well, centre, east well)
      const segs = [[x0 - T, -21], [-11.4, 11.4], [21, x1 + T]];
      for (const [sa, sb] of segs) B.box(subFloor, [sa, LOW - 0.6, ba], [sb, LOW, bb], { uvScale: 0.5 });
    }
    Z.push({ x0: x0 - T, x1: x1 + T, z0: z0, z1: z1 + T, h: LOW });
    // walls (tile + band), E/W full length, S; N wall is the dining-concourse party wall (x∈[−6,6] passage at z=50)
    for (const side of [-1, 1]) {
      const wx0 = side < 0 ? x0 - T : x1, wx1 = side < 0 ? x0 : x1 + T;
      // west wall has the passage opening z∈[50.5,54] (direct stair from the concourse)
      const segsZ = side < 0 ? [[z0 + T, 51.1], [54.8, z1 + T]] : [[z0 + T, z1 + T]];
      for (const [za, zb] of segsZ) { B.box(M.tile, [wx0, LOW, za], [wx1, yc, zb], { uvScale: 1 }); world.box([wx0, LOW, za], [wx1, yc, zb]); }
      if (side < 0) { B.box(M.tile, [wx0, LOW + 2.6, 51.1], [wx1, yc, 54.8], { uvScale: 1 }); world.box([wx0, LOW + 2.6, 51.1], [wx1, yc, 54.8]); }
      B.box(M.tileBand, [side < 0 ? wx1 : wx0 - 0.01, LOW + 2.2, z0], [side < 0 ? wx1 + 0.01 : wx0, LOW + 2.6, z1], { uvScale: 1 });
      for (const mz of [60, 76]) { const mo = M.mosaic('CENTRAL STATION', 'MAIN ST'); B.add(mo, new THREE.PlaneGeometry(4.2, 1.05), mat4(side < 0 ? wx1 + 0.02 : wx0 - 0.02, LOW + 2.4, mz, 0, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0)); }
    }
    B.box(M.tile, [x0 - T, LOW, z1], [x1 + T, yc, z1 + T], { uvScale: 1 }); world.box([x0 - T, LOW, z1], [x1 + T, yc, z1 + T]);
    B.box(M.tileBand, [x0, LOW + 2.2, z1 - 0.01], [x1, LOW + 2.6, z1], { uvScale: 1 });
    // ceiling with beam grid
    B.box(subCeil, [x0 - T, yc, z0 + T], [x1 + T, yc + 0.5, z1 + T], { uvScale: 0.5 });
    for (let z = z0 + 4; z < z1; z += 8) B.box(M.steelGreen, [x0, yc - 0.4, z - 0.2], [x1, yc, z + 0.2], { uvScale: 1 });
    // square tiled piers on the beam lines (leave the wells + the fare line clear)
    for (const px of [-12, 0, 12]) for (let z = z0 + 8; z < z1; z += 8) { if (Math.abs(z - 54) < 2) continue; B.box(M.tile, [px - 0.5, LOW, z - 0.5], [px + 0.5, yc, z + 0.5], { uvScale: 1, collide: true }); world.cover(px + 1.0, z, 1, 0, LOW); world.cover(px - 1.0, z, -1, 0, LOW); }
    // fare line at z=54: turnstiles x∈[−6,6], fare walls beyond, gate + token booth
    for (const side of [-1, 1]) { const fx0 = Math.min(side * 6, side * x1), fx1 = Math.max(side * 6, side * x1); B.box(M.stainless, [fx0, LOW, 53.6], [fx1, LOW + 1.1, 54.4], { uvScale: 1, collide: true }); B.box(M.ironDark, [fx0, LOW + 1.1, 53.9], [fx1, LOW + 2.3, 54.1], { uvScale: 1 }); }
    for (let i = 0; i < 5; i++) { const tx = -4.8 + i * 2.4; world.termTurnstiles.push([tx, LOW, 54]); }
    B.box(M.stainless, [-6, LOW, 53.6], [-5.5, LOW + 1.0, 54.4], { uvScale: 1, collide: true }); B.box(M.stainless, [5.5, LOW, 53.6], [6, LOW + 1.0, 54.4], { uvScale: 1, collide: true });
    B.box(M.ironDark, [8, LOW, 51.5], [11, LOW + 2.6, 53.3], { uvScale: 1, collide: true }); B.box(M.darkGlass, [8.05, LOW + 1.1, 51.4], [10.95, LOW + 2.2, 51.5], { uvScale: 1 });
    B.add(M.sign('TOKEN BOOTH', { w: 512, h: 96, bg: '#0d0d0d', fg: '#ffffff', font: 'bold 48px Helvetica, Arial' }), new THREE.PlaneGeometry(2.4, 0.42), mat4(9.5, LOW + 2.4, 51.38, 0, Math.PI, 0));
    // wayfinding: overhead black signs, lit
    const sg = (t, x, z, yaw = 0, w = 4) => B.add(M.sign(t, { bg: '#0d0d0d', fg: '#ffffff', font: 'bold 56px Helvetica, Arial, sans-serif' }), new THREE.PlaneGeometry(w, w / 8), mat4(x, LOW + 2.75, z, 0, yaw, 0));
    sg('⟵  UPTOWN  ·  LOCAL & EXPRESS  ·  DOWNTOWN  ⟶', 0, 55.2, Math.PI, 6); sg('⟵  UPTOWN  ·  LOCAL & EXPRESS  ·  DOWNTOWN  ⟶', 0, 55.2, 0, 6);
    for (const w of stairWells) { const t = w.isl === 1 ? 'UPTOWN & NORTH  ·  1 · 2' : 'DOWNTOWN & HARBOR  ·  3 · 4'; sg(t, w.side * 19, w.z0 - 0.6, w.side < 0 ? Math.PI / 2 : -Math.PI / 2, 3.2); }
    sg('EXIT  ·  WEST AVENUE  ·  MAIN CONCOURSE  ⟵', -20, 52.2, 0, 4.5);
    world.cover(9.5, 50.8, 0, -1, LOW); world.cover(-9, 55.2, 0, 1, LOW); world.cover(9, 55.2, 0, 1, LOW);
    for (const lx of [-16, -4, 8, 20]) for (let lz = 52; lz < z1; lz += 8) world.termLamps.push([lx, yc - 0.15, lz, 'fluor']);
    world.termTrash.push([-14, LOW, 52], [14, LOW, 56], [-20, LOW, 70], [20, LOW, 78], [0, LOW, 86]);
    // system map boards
    for (const [mx, mz, yaw] of [[-23.9, 66, Math.PI / 2], [23.9, 74, -Math.PI / 2]]) { B.box(M.ironDark, [mx - 0.05, LOW + 0.9, mz - 1.1], [mx + 0.05, LOW + 2.4, mz + 1.1], { uvScale: 1 }); B.add(M.poster(4), new THREE.PlaneGeometry(2, 1.4), mat4(mx + (yaw > 0 ? 0.06 : -0.06), LOW + 1.65, mz, 0, yaw, 0)); }
  }

  // ================= station level (y = −12): floors, track beds, walls, ceiling =================
  // island platforms
  for (const isl of [1, 2]) {
    const [za, zb] = ISL[isl];
    B.box(subFloor, [X0 - T, SUB - 0.6, za], [X1 + T, SUB, zb], { uvScale: 0.5 });
    world.walkable([X0 - T, SUB - 0.6, za], [X1 + T, SUB, zb]);
    Z.push({ x0: X0 - T, x1: X1 + T, z0: za, z1: zb, h: SUB });
    // edge faces + yellow tactile strips both edges
    for (const [ez, dir] of [[za, -1], [zb, 1]]) { B.box(M.concrete, [X0, SUB - 1.25, ez - 0.05], [X1, SUB - 0.02, ez + 0.05], { uvScale: 0.5 }); B.box(yellow, [X0, SUB, dir < 0 ? ez : ez - 0.6], [X1, SUB + 0.012, dir < 0 ? ez + 0.6 : ez], { uvScale: 1 }); }
    world.box([X0 - T, SUB - 0.6, za - 0.25], [X1 + T, SUB, zb + 0.25]); // edge slabs support the step into the trains
  }
  // track beds (ballast) + rails + ties for the four tracks
  for (const k of ['A', 'B', 'C', 'D']) {
    const [ta, tb] = TRK[k];
    B.box(M.ballast, [X0 - T, SUB - 1.8, ta], [X1 + T, SUB - 1.2, tb], { uvScale: 0.5 });
    Z.push({ x0: X0 - T, x1: X1 + T, z0: ta, z1: tb, h: SUB - 1.2 });
    const zc = (ta + tb) / 2;
    for (const rz of [zc - 0.72, zc + 0.72]) B.box(M.ironDark, [X0 - T, SUB - 1.2, rz - 0.04], [X1 + T, SUB - 1.02, rz + 0.04], { uvScale: 1 });
    for (let x = X0; x < X1; x += 0.7) B.box(M.wood, [x - 0.12, SUB - 1.2, zc - 1.3], [x + 0.12, SUB - 1.08, zc + 1.3], { uvScale: 1 });
    B.box(M.wood, [X0 - T, SUB - 0.95, k === 'A' || k === 'C' ? ta + 0.3 : tb - 0.6], [X1 + T, SUB - 0.9, k === 'A' || k === 'C' ? ta + 0.6 : tb - 0.3], { uvScale: 1 }); // third-rail cover board
  }
  // north wall (behind track A) and south wall (behind track D): tile, band, mosaics, posters
  const wallRun = (zw0, zw1, faceZ, yawFace) => {
    B.box(M.tile, [X0 - T, SUB - 1.8, zw0], [X1 + T, CEIL, zw1], { uvScale: 1 }); world.box([X0 - T, SUB - 2, zw0], [X1 + T, CEIL + 1, zw1]);
    B.box(M.tileBand, [X0, bandY, faceZ - (yawFace ? 0.01 : 0)], [X1, bandY + 0.4, faceZ + (yawFace ? 0 : 0.01)], { uvScale: 1 });
    for (const mx of [-38, -19, 0, 19, 38]) B.add(M.mosaic('CENTRAL STATION', 'MAIN ST · MARKET AV'), new THREE.PlaneGeometry(4.2, 1.05), mat4(mx, bandY + 0.2, faceZ + (yawFace ? -0.02 : 0.02), 0, yawFace ? Math.PI : 0, 0));
    for (let i = 0; i < 8; i++) { const px = -42 + i * 12; if (Math.abs(px) % 19 < 2.5) continue; B.box(M.ironDark, [px - 1.0, SUB + 0.9, faceZ + (yawFace ? -0.04 : -0.02)], [px + 1.0, SUB + 3.0, faceZ + (yawFace ? 0.02 : 0.04)], { uvScale: 1 }); B.add(M.poster(i), new THREE.PlaneGeometry(1.9, 2.0), mat4(px, SUB + 1.95, faceZ + (yawFace ? -0.045 : 0.045), 0, yawFace ? Math.PI : 0, 0)); }
    for (let x = X0 + 4; x < X1; x += 9.2) B.box(M.tile, [x - 0.4, SUB - 1.8, Math.min(faceZ, faceZ + (yawFace ? -0.3 : 0.3))], [x + 0.4, CEIL, Math.max(faceZ, faceZ + (yawFace ? -0.3 : 0.3))], { uvScale: 1 });
    B.box(M.asphalt, [X0 - T, SUB - 1.8, faceZ + (yawFace ? -0.05 : 0)], [X1 + T, SUB - 0.6, faceZ + (yawFace ? 0 : 0.05)], { uvScale: 1 });
  };
  wallRun(TRK.A[0] - 1.0, TRK.A[0], TRK.A[0], false);
  wallRun(zEnd, zEnd + T, zEnd, true);
  // end walls (tunnel portals: dark over the tracks)
  for (const side of [-1, 1]) {
    const ex0 = side < 0 ? X0 - T - 1 : X1 + T, ex1 = side < 0 ? X0 - T : X1 + T + 1;
    B.box(M.tile, [ex0, SUB - 1.8, TRK.A[0] - 1], [ex1, CEIL, zEnd + T], { uvScale: 1 }); world.box([ex0, SUB - 2, TRK.A[0] - 1], [ex1, CEIL + 1, zEnd + T]);
    for (const k of ['A', 'B', 'C', 'D']) { const [ta, tb] = TRK[k]; B.box(M.asphalt, [ex0 + (side < 0 ? 0.02 : -0.02), SUB - 1.8, ta], [ex1 - (side < 0 ? -0.02 : 0.02), CEIL - 0.2, tb], { uvScale: 1 }); }
  }
  // ceiling: split around the mezzanine footprint (its slab is the ceiling there) and the stair wells
  {
    const zc0 = TRK.A[0] - 1, zc1 = zEnd + T;
    B.box(subCeil, [X0 - T - 1, CEIL, zc0], [MEZ.x0 - T, CEIL + 0.6, zc1], { uvScale: 0.5 }); B.box(subCeil, [MEZ.x1 + T, CEIL, zc0], [X1 + T + 1, CEIL + 0.6, zc1], { uvScale: 0.5 });
    B.box(subCeil, [MEZ.x0 - T, CEIL, zc0], [MEZ.x1 + T, CEIL + 0.6, MEZ.z0], { uvScale: 0.5 }); B.box(subCeil, [MEZ.x0 - T, CEIL, MEZ.z1 + T], [MEZ.x1 + T, CEIL + 0.6, zc1], { uvScale: 0.5 });
    // steel girders across (green), every 4.6 m, skipping the stair wells
    for (let x = X0; x <= X1; x += 4.6) { const inWell = stairWells.some(w => x > w.x0 - 0.3 && x < w.x1 + 0.3); const yTop = Math.abs(x) < MEZ.x1 ? LOW - 0.6 : CEIL; for (const [ga, gb] of [[zc0, ISL[1][0] - 1.5], [ISL[1][0] - 1.5, ISL[1][1] + 1.5], [ISL[1][1] + 1.5, ISL[2][0] - 1.5], [ISL[2][0] - 1.5, ISL[2][1] + 1.5], [ISL[2][1] + 1.5, zc1]]) { if (inWell && ((ga < ISL[1][1] && gb > ISL[1][0]) || (ga < ISL[2][1] && gb > ISL[2][0]))) continue; B.box(M.steelGreen, [x - 0.2, yTop - 0.45, ga], [x + 0.2, yTop, gb], { uvScale: 1 }); } }
    for (const zg of [ISL[1][0] + 1.2, ISL[1][1] - 1.2, ISL[2][0] + 1.2, ISL[2][1] - 1.2]) { B.box(M.steelGreen, [X0 - T, CEIL - 0.5, zg - 0.25], [MEZ.x0 - 0.3, CEIL, zg + 0.25], { uvScale: 1 }); B.box(M.steelGreen, [MEZ.x1 + 0.3, CEIL - 0.5, zg - 0.25], [X1 + T, CEIL, zg + 0.25], { uvScale: 1 }); B.box(M.steelGreen, [MEZ.x0 - 0.3, LOW - 1.1, zg - 0.25], [MEZ.x1 + 0.3, LOW - 0.6, zg + 0.25], { uvScale: 1 }); }
  }

  // ================= riveted I-beam columns: one row per platform edge, set back 1.2 m, between the door positions =================
  {
    const hFull = CEIL - SUB, hMez = (LOW - 0.6) - SUB;
    const mkCol = (h) => { const web = new THREE.BoxGeometry(0.14, h, 0.3); const fl = new THREE.BoxGeometry(0.42, h, 0.06); const f1 = fl.clone().translate(0, 0, 0.15), f2 = fl.clone().translate(0, 0, -0.15); const base = new THREE.BoxGeometry(0.55, 0.25, 0.55); base.translate(0, -h / 2 + 0.125, 0); const rivets = []; for (let yy = -h / 2 + 0.5; yy < h / 2 - 0.2; yy += 0.28) for (const dx of [-0.16, 0.16]) for (const dz of [-0.19, 0.19]) { const r = new THREE.BoxGeometry(0.035, 0.035, 0.03); r.translate(dx, yy, dz); rivets.push(r); } return mergeSimple([web, f1, f2, base, ...rivets]); };
    const colFull = mkCol(hFull), colMez = mkCol(hMez);
    const rows = [ISL[1][0] + 1.2, ISL[1][1] - 1.2, ISL[2][0] + 1.2, ISL[2][1] - 1.2];
    const matsFull = [], matsMez = [];
    for (const cx of columnXs()) for (const rz of rows) {
      if (cx < X0 + 1 || cx > X1 - 1) continue;
      if (stairWells.some(w => cx > w.x0 - 0.5 && cx < w.x1 + 0.5 && rz > w.z0 - 0.6 && rz < w.z1 + 0.6)) continue;
      const underMez = Math.abs(cx) < MEZ.x1; (underMez ? matsMez : matsFull).push(mat4(cx, underMez ? (SUB + LOW - 0.6) / 2 : (SUB + CEIL) / 2, rz));
      world.box([cx - 0.25, SUB, rz - 0.25], [cx + 0.25, SUB + 3.5, rz + 0.25]); world.cover(cx + 0.75, rz, 1, 0, SUB); world.cover(cx - 0.75, rz, -1, 0, SUB);
    }
    instanced(world, colFull, M.steelGreen, matsFull, 'metal', { name: 'ibeams' }); instanced(world, colMez, M.steelGreen, matsMez, 'metal', { name: 'ibeamsMez' });
    const sg = M.sign('CS', { w: 128, h: 128, bg: '#f0ece2', fg: '#111', font: 'bold 84px Helvetica, Arial, sans-serif' });
    const sgGeo = mergeSimple([new THREE.PlaneGeometry(0.34, 0.34).translate(0, 0, 0.2), new THREE.PlaneGeometry(0.34, 0.34).rotateY(Math.PI).translate(0, 0, -0.2)]);
    const signMats = [...matsFull, ...matsMez].map(m => { const p = new THREE.Vector3().setFromMatrixPosition(m); return mat4(p.x, SUB + 1.6, p.z); });
    instanced(world, sgGeo, sg, signMats, 'metal', { name: 'colSigns', shadow: false });
  }

  // ================= stairs mezzanine → platforms (along x, inside the wells) + tiled well walls =================
  for (const w of stairWells) {
    const zc = (w.z0 + w.z1) / 2; const xTop = w.side * 21, xBot = w.side * 11.4;
    const st = stairSteps(world, B, M.concrete, { x: xBot, z: zc, dir: [w.side, 0], width: 4, run: 9.6, rise: LOW - SUB, y0: SUB, n: 32, depthUnder: 0.6, uvScale: 0.5 });
    Z.push({ x0: w.x0, x1: w.x1, z0: w.z0, z1: w.z1, h: (x) => { const a = Math.abs(x - xBot); const i = Math.min(31, Math.floor(a / st.stepRun)); return SUB + (i + 1) * st.stepRise; } });
    // side walls of the well (tile) from the platform up to the mezzanine ceiling, with the stair's sloped underside closed by the step mass
    for (const s of [-1, 1]) { const wz = zc + s * 2.15; B.box(M.tile, [w.x0, SUB, wz - 0.15], [w.x1, LOW + 3.4, wz + 0.15], { uvScale: 1 }); world.box([w.x0, SUB, wz - 0.15], [w.x1, LOW + 3.4, wz + 0.15]); B.box(M.stainless, [w.x0, SUB, wz - s * 0.25 - 0.02], [w.x1, LOW + 1.0, wz - s * 0.25 + 0.02], { uvScale: 1 }); }
    B.box(M.stainless, [w.x0, SUB, zc - 0.03], [w.x1, LOW + 1.0, zc + 0.03], { uvScale: 1 });   // centre handrail
    // lit stair edges: fluorescent strip along the well ceiling + tread-edge nosings
    B.box(M.fluor, [w.x0 + 0.5, LOW + 3.3, zc - 0.08], [w.x1 - 0.5, LOW + 3.36, zc + 0.08], { uvScale: 1 });
    world.termLamps.push([(w.x0 + w.x1) / 2, LOW + 3.0, zc, 'fluorReal']);
    // wayfinding at the foot of the stair (on the platform side)
    const sgn = M.sign('⟵  MEZZANINE  ·  EXIT  ·  MAIN CONCOURSE', { bg: '#0d0d0d', fg: '#ffffff', font: 'bold 52px Helvetica, Arial' });
    B.add(sgn, new THREE.PlaneGeometry(3.4, 0.42), mat4(xBot - w.side * 0.3, SUB + 2.6, zc, 0, w.side < 0 ? Math.PI / 2 : -Math.PI / 2, 0));
    // step nosings (yellow) — as a merged run of thin boxes
    for (let i = 0; i < 32; i += 2) { const x = xBot + w.side * (i * st.stepRun); B.box(yellow, [x - 0.03, SUB + (i + 1) * st.stepRise - 0.01, w.z0 + 0.2], [x + 0.03, SUB + (i + 1) * st.stepRise + 0.01, w.z1 - 0.2], { uvScale: 1 }); }
    world.cover(xBot - w.side * 1.2, zc + 2.8, 0, 1, SUB);
  }

  // ================= platform furniture: benches, bins, maps, help points, fluorescents =================
  for (const isl of [1, 2]) {
    const [za, zb] = ISL[isl]; const zc = (za + zb) / 2;
    for (const bx of [-40, -32, 32, 40, -8, 8]) { B.box(M.wood, [bx - 1.5, SUB + 0.42, zc - 0.28], [bx + 1.5, SUB + 0.5, zc + 0.28], { uvScale: 1 }); B.box(M.wood, [bx - 1.5, SUB + 0.5, zc - 0.04], [bx + 1.5, SUB + 1.0, zc + 0.04], { uvScale: 1 }); for (const dx of [-1.3, 0, 1.3]) B.box(M.ironDark, [bx + dx - 0.05, SUB, zc - 0.28], [bx + dx + 0.05, SUB + 0.45, zc + 0.28], { uvScale: 1 }); world.box([bx - 1.5, SUB, zc - 0.3], [bx + 1.5, SUB + 1.0, zc + 0.3]); world.cover(bx, zc + 1.0, 0, 1, SUB); world.cover(bx, zc - 1.0, 0, -1, SUB); }
    world.termTrash.push([-36, SUB, zc], [36, SUB, zc], [-4, SUB, zc], [4, SUB, zc]);
    B.box(M.steelBlue, [-28, SUB, zc - 0.4], [-26.8, SUB + 2.2, zc + 0.4], { uvScale: 1, collide: true }); B.box(M.fluor, [-27.6, SUB + 1.9, zc + 0.4], [-27.2, SUB + 2.0, zc + 0.42], { uvScale: 1 });
    B.box(M.ironDark, [26.8, SUB, zc - 0.5], [28, SUB + 1.9, zc + 0.5], { uvScale: 1, collide: true }); B.add(M.poster(2), new THREE.PlaneGeometry(1.0, 1.4), mat4(27.4, SUB + 1.1, zc + 0.51));
    for (let x = X0 + 2.5; x < X1; x += 5) { const yTop = Math.abs(x) < MEZ.x1 ? LOW - 0.6 : CEIL; for (const fz of [za + 2.2, zb - 2.2]) { B.box(M.fluor, [x - 1.9, yTop - 0.22, fz - 0.14], [x + 1.9, yTop - 0.16, fz + 0.14], { uvScale: 1 }); B.box(M.ironDark, [x - 2.0, yTop - 0.16, fz - 0.2], [x + 2.0, yTop, fz + 0.2], { uvScale: 1 }); } }
    // wet floor patches
    const wet = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.55 }); wet.name = 'wet'; wet.userData.castShadow = false;
    for (const [wx, r] of [[-26, 2.2], [8, 1.6], [30, 2.6]]) B.add(wet, new THREE.CircleGeometry(r, 20), mat4(wx + (isl - 1) * 7, SUB + 0.006, zc + (isl - 1) * 0.5, -Math.PI / 2));
    // platform-edge "stand clear" signs hanging from the ceiling
    for (const sx of [-20, 20]) B.add(M.sign(isl === 1 ? 'UPTOWN & NORTH   ·   1 LOCAL  ·  2 EXPRESS' : 'DOWNTOWN & HARBOR   ·   3 EXPRESS  ·  4 LOCAL', { bg: '#0d0d0d', fg: '#ffffff', font: 'bold 52px Helvetica, Arial' }), new THREE.PlaneGeometry(4.5, 0.55), mat4(sx, SUB + 3.0, zc, 0, 0, 0));
  }

  // ================= two trains parked on the outer tracks (A: doors face south onto island 1, D: doors face north onto island 2) ===========
  buildTrain(B, M, world, 'A', 1);
  buildTrain(B, M, world, 'D', -1);
  world.termLamps.push([-22, SUB + 3.2, (TRK.A[0] + TRK.A[1]) / 2, 'trainInt'], [10, SUB + 3.2, (TRK.D[0] + TRK.D[1]) / 2, 'trainInt']);

  B.flush((m) => (m === M.stainless || m === M.ironDark || m === M.steelGreen || m === M.steelBlue || m === M.brassDark ? 'metal' : m === M.wood ? 'wood' : 'concrete'), { name: 'subway' });
  world.termStairWells = stairWells;
}

function buildTrain(B, M, world, track, doorDir /* +1: doors on the +z side, -1: on the -z side */) {
  const { SUB, TRK } = P; const { L: carL, W: carW, H: carH } = CAR; const floorY = SUB - 0.05;
  const [ta, tb] = TRK[track]; const zEdge = doorDir > 0 ? tb : ta;           // platform edge the doors open onto
  const cz = zEdge - doorDir * (carW / 2 + 0.3);                                  // car centre: doors 0.3 m off the edge
  const roll = M.rollSign(track === 'A' ? '1  NORTH PARK' : '4  HARBOR');
  for (const cx of carCentres()) {
    const x0 = cx - carL / 2, x1 = cx + carL / 2, zA = cz - carW / 2, zB = cz + carW / 2;
    const zDoor = doorDir > 0 ? zB : zA, zBack = doorDir > 0 ? zA : zB;
    B.box(M.rubber, [x0, floorY - 0.12, zA], [x1, floorY, zB], { uvScale: 1 }); world.walkable([x0, floorY - 0.12, zA], [x1, floorY, zB]);
    B.box(M.ironDark, [x0 + 0.3, floorY - 0.9, zA + 0.3], [x1 - 0.3, floorY - 0.12, zB - 0.3], { uvScale: 1 });
    for (const bx of [x0 + 2.2, x1 - 2.2]) for (const bz of [cz - 0.75, cz + 0.75]) B.add(M.ironDark, new THREE.CylinderGeometry(0.42, 0.42, 0.12, 16), mat4(bx, floorY - 0.7, bz, Math.PI / 2, 0, 0));
    B.box(M.stainless, [x0, floorY + carH - 0.1, zA], [x1, floorY + carH, zB], { uvScale: 1 });
    B.box(M.ironDark, [x0 + 1, floorY + carH, zA + 0.6], [x1 - 1, floorY + carH + 0.3, zB - 0.6], { uvScale: 1 });
    const doors = [cx - 5.2, cx, cx + 5.2]; const dw = 1.4;
    for (const zz of [zA, zB]) {
      const isDoorSide = zz === zDoor; let segs = [[x0, x1]];
      if (isDoorSide) { segs = []; let s = x0; for (const d of doors) { segs.push([s, d - dw / 2]); s = d + dw / 2; } segs.push([s, x1]); }
      const zz0 = zz - 0.04, zz1 = zz + 0.04;
      for (const [a, b] of segs) {
        if (b - a < 0.05) continue;
        B.box(M.stainless, [a, floorY, zz0], [b, floorY + 1.0, zz1], { uvScale: 1 }); B.box(M.stainless, [a, floorY + 2.3, zz0], [b, floorY + carH - 0.1, zz1], { uvScale: 1 });
        B.box(M.trainWindow, [a, floorY + 1.0, zz0 + 0.01], [b, floorY + 2.3, zz1 - 0.01], { uvScale: 1 });
        for (let mx = a + 0.75; mx < b; mx += 1.5) B.box(M.stainless, [mx - 0.04, floorY + 1.0, zz0], [mx + 0.04, floorY + 2.3, zz1], { uvScale: 1 });
        world.box([a, floorY, zz0], [b, floorY + carH, zz1]);
      }
      B.box(M.brassDark, [x0, floorY + 0.98, zz0 - 0.01], [x1, floorY + 1.02, zz1 + 0.01], { uvScale: 1 });
    }
    for (const d of doors) { for (const dx of [-dw / 2, dw / 2]) B.box(M.stainless, [d + dx - 0.05, floorY, zDoor - 0.04], [d + dx + 0.05, floorY + 2.2, zDoor + 0.04], { uvScale: 1 }); B.box(M.stainless, [d - dw / 2, floorY + 2.2, zDoor - 0.04], [d + dw / 2, floorY + 2.3, zDoor + 0.04], { uvScale: 1 }); world.box([d - dw / 2, floorY + 2.2, zDoor - 0.06], [d + dw / 2, floorY + carH, zDoor + 0.06]); }
    for (const ex of [x0, x1]) { B.box(M.stainless, [ex - 0.03, floorY, zA], [ex + 0.03, floorY + carH, zB], { uvScale: 1 }); world.box([ex - 0.05, floorY, zA], [ex + 0.05, floorY + carH, zB]); B.add(roll, new THREE.PlaneGeometry(1.1, 0.28), mat4(ex + (ex === x0 ? -0.04 : 0.04), floorY + 3.0, cz, 0, ex === x0 ? -Math.PI / 2 : Math.PI / 2)); }
    for (const sx of [cx - 6.6, cx + 6.6]) B.add(roll, new THREE.PlaneGeometry(1.3, 0.34), mat4(sx, floorY + 2.68, zDoor + doorDir * 0.05, 0, doorDir > 0 ? 0 : Math.PI, 0));
    // interior: longitudinal seats both sides, poles, ceiling light strip
    for (const [sa, sb] of [[x0 + 0.4, doors[0] - dw / 2 - 0.3], [doors[0] + dw / 2 + 0.3, doors[1] - dw / 2 - 0.3], [doors[1] + dw / 2 + 0.3, doors[2] - dw / 2 - 0.3], [doors[2] + dw / 2 + 0.3, x1 - 0.4]]) {
      if (sb - sa < 0.6) continue;
      B.box(M.blueSeat, [sa, floorY, zA + 0.08], [sb, floorY + 0.45, zA + 0.6], { uvScale: 1 }); B.box(M.blueSeat, [sa, floorY + 0.45, zA + 0.08], [sb, floorY + 0.95, zA + 0.2], { uvScale: 1 }); world.box([sa, floorY, zA + 0.06], [sb, floorY + 0.95, zA + 0.6]);
      B.box(M.blueSeat, [sa, floorY, zB - 0.6], [sb, floorY + 0.45, zB - 0.08], { uvScale: 1 }); B.box(M.blueSeat, [sa, floorY + 0.45, zB - 0.2], [sb, floorY + 0.95, zB - 0.08], { uvScale: 1 }); world.box([sa, floorY, zB - 0.6], [sb, floorY + 0.95, zB - 0.06]);
    }
    for (const px of [cx - 2.6, cx + 2.6, cx - 7, cx + 7]) B.add(M.stainless, new THREE.CylinderGeometry(0.02, 0.02, carH - 0.15, 8), mat4(px, floorY + carH / 2, cz));
    B.box(M.fluor, [x0 + 0.5, floorY + carH - 0.16, cz - 0.15], [x1 - 0.5, floorY + carH - 0.12, cz + 0.15], { uvScale: 1 });
    world.cover(cx - 7.8 - 0.6, zDoor + doorDir * 0.9, -1, 0, SUB); world.cover(cx + 7.8 + 0.6, zDoor + doorDir * 0.9, 1, 0, SUB);
  }
  const lead = CAR.X0 - carL / 2 - 0.05;
  for (const dz of [-0.9, 0.9]) B.add(M.fluor, new THREE.CircleGeometry(0.12, 10), mat4(lead, floorY + 0.7, cz + dz, 0, -Math.PI / 2));
}

function mergeSimple(geos) { let total = 0; const ng = geos.map(g => g.index ? g.toNonIndexed() : g); for (const g of ng) total += g.attributes.position.count; const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uvs = new Float32Array(total * 2); let off = 0; for (const g of ng) { pos.set(g.attributes.position.array, off * 3); nor.set(g.attributes.normal.array, off * 3); uvs.set(g.attributes.uv.array, off * 2); off += g.attributes.position.count; } const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); return out; }
