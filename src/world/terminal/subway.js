// TERMINAL — IRT subway level (y=-12): stairs from the mezzanine, side platform, riveted I-beam columns, tiled walls with mosaics, a stopped stainless train. TERMINAL agent.
import * as THREE from 'three';
import { Bucket, mat4, stairSteps, instanced } from './kit.js';
import { P } from './plan.js';
import { addGrime } from '../mats.js';

export function buildSubway(world, M, Z) {
  const B = new Bucket(world);
  const uv = (m) => m.userData.uv ?? 0.5;
  const { LOW, SUB, MEZ, PLAT, TRACK } = P; const T = 1.0;
  const CEIL = SUB + 3.7;   // platform ceiling
  const z0 = PLAT.z0, z1 = PLAT.z1;

  // ---- floor / track bed ----------------------------------------------------------------------
  const subFloor = M.concrete.clone(); subFloor.name = 'subFloor'; subFloor.color.set(0x5e5a55); subFloor.roughness = 0.85; addGrime(subFloor, world.R, { strength: 0.55, scale: 0.35, height: 0.5, tint: [0.3, 0.27, 0.22], wet: 0.3, key: 'sub' });
  const subCeil = M.concrete.clone(); subCeil.name = 'subCeil'; subCeil.color.set(0x9a958c);
  B.box(subFloor, [PLAT.x0 - T, SUB - 0.6, z0 - 0.5], [PLAT.x1 + T, SUB, z1], { uvScale: 0.5 });
  Z.push({ x0: PLAT.x0 - T, x1: PLAT.x1 + T, z0: z0 - 0.5, z1, h: SUB });
  B.box(M.ballast, [PLAT.x0 - T, SUB - 1.8, z1], [PLAT.x1 + T, SUB - 1.2, TRACK.z1 + 0.5], { uvScale: 0.5 });
  Z.push({ x0: PLAT.x0 - T, x1: PLAT.x1 + T, z0: z1, z1: TRACK.z1 + 0.5, h: SUB - 1.2 });
  // platform edge: yellow tactile strip + edge face
  B.box(M.concrete, [PLAT.x0, SUB - 1.25, z1 - 0.05], [PLAT.x1, SUB - 0.02, z1 + 0.05], { uvScale: 0.5 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xd8b528, roughness: 0.8 }); yellow.name = 'yellow';
  B.box(yellow, [PLAT.x0, SUB, z1 - 0.6], [PLAT.x1, SUB + 0.012, z1], { uvScale: 1 });
  // rails + ties
  for (const rz of [TRACK.z0 + 1.2, TRACK.z0 + 2.7]) B.box(M.ironDark, [PLAT.x0 - T, SUB - 1.2, rz - 0.04], [PLAT.x1 + T, SUB - 1.02, rz + 0.04], { uvScale: 1 });
  for (let x = PLAT.x0; x < PLAT.x1; x += 0.7) B.box(M.wood, [x - 0.12, SUB - 1.2, TRACK.z0 + 0.6], [x + 0.12, SUB - 1.08, TRACK.z0 + 3.3], { uvScale: 1 });
  // third rail cover (wood board) on the far side
  B.box(M.wood, [PLAT.x0 - T, SUB - 0.95, TRACK.z0 + 3.6], [PLAT.x1 + T, SUB - 0.9, TRACK.z0 + 3.9], { uvScale: 1 });

  // ---- walls: north (platform back wall, tiled, band + mosaics), south (far wall beyond the track), ends -----------
  const bandY = SUB + 2.1;
  // north wall with two stair openings (x=±12, 4 m wide)
  for (const [wx0, wx1] of [[PLAT.x0 - T, -14.2], [-9.8, 9.8], [14.2, PLAT.x1 + T]]) { B.box(M.tile, [wx0, SUB, z0 - 0.5], [wx1, CEIL, z0], { uvScale: 1 }); world.box([wx0, SUB, z0 - 0.5], [wx1, CEIL, z0]); B.box(M.tileBand, [wx0 + 0.001, bandY, z0 - 0.01], [wx1 - 0.001, bandY + 0.4, z0 + 0.01], { uvScale: 1 }); }
  // framed generic posters between the tablets
  for (let i = 0; i < 6; i++) { const px = -42 + i * 16.8 + 6; const po = M.poster(i); B.box(M.ironDark, [px - 1.0, SUB + 0.9, z0 - 0.02], [px + 1.0, SUB + 3.0, z0 + 0.04], { uvScale: 1 }); B.add(po, new THREE.PlaneGeometry(1.9, 2.0), mat4(px, SUB + 1.95, z0 + 0.045)); }
  // mosaic tablets on the north wall
  for (const mx of [-36, -24, 0, 24, 36]) { const mo = M.mosaic('GRAND CONCOURSE', '42 ST · LEXINGTON AV'); B.add(mo, new THREE.PlaneGeometry(4.2, 1.05), mat4(mx, bandY + 0.2, z0 + 0.02)); }
  // far wall (south of the track)
  B.box(M.tile, [PLAT.x0 - T, SUB - 1.8, TRACK.z1 + 0.5], [PLAT.x1 + T, CEIL, TRACK.z1 + 0.5 + T], { uvScale: 1 }); world.box([PLAT.x0 - T, SUB - 2, TRACK.z1 + 0.5], [PLAT.x1 + T, CEIL, TRACK.z1 + 1.5]);
  B.box(M.tileBand, [PLAT.x0, bandY, TRACK.z1 + 0.49], [PLAT.x1, bandY + 0.4, TRACK.z1 + 0.5], { uvScale: 1 });
  for (const mx of [-30, -10, 10, 30]) { const mo = M.mosaic('GRAND CONCOURSE', '42 ST'); B.add(mo, new THREE.PlaneGeometry(4.2, 1.05), mat4(mx, bandY + 0.2, TRACK.z1 + 0.48, 0, Math.PI, 0)); }
  // pilasters on the far wall + grime band at the bottom
  for (let x = PLAT.x0 + 4; x < PLAT.x1; x += 9.2) B.box(M.tile, [x - 0.4, SUB - 1.8, TRACK.z1 + 0.2], [x + 0.4, CEIL, TRACK.z1 + 0.5], { uvScale: 1 });
  B.box(M.asphalt, [PLAT.x0 - T, SUB - 1.8, TRACK.z1 + 0.45], [PLAT.x1 + T, SUB - 0.6, TRACK.z1 + 0.5], { uvScale: 1 });
  // end walls (tunnel mouths beyond: dark boxes)
  for (const side of [-1, 1]) {
    const ex0 = side < 0 ? PLAT.x0 - T - 1 : PLAT.x1 + T, ex1 = side < 0 ? PLAT.x0 - T : PLAT.x1 + T + 1;
    B.box(M.tile, [ex0, SUB - 1.8, z0 - 0.5], [ex1, CEIL, z1], { uvScale: 1 }); world.box([ex0, SUB - 2, z0 - 0.5], [ex1, CEIL + 1, TRACK.z1 + 1.5]);
    // tunnel portal over the track (dark)
    B.box(M.asphalt, [ex0, SUB - 1.8, z1], [ex1, CEIL, TRACK.z1 + 0.5], { uvScale: 1 });
    B.box(M.ironDark, [ex0 - 0.02, SUB - 1.8, z1 - 0.3], [ex1 + 0.02, CEIL - 0.2, z1 + 0.05], { uvScale: 1 });
  }
  // ceiling (concrete, with a shallow beam grid), lower over the platform than the mezzanine
  for (const [cx0, cx1] of [[PLAT.x0 - T - 1, -14.3], [-9.7, 9.7], [14.3, PLAT.x1 + T + 1]]) B.box(subCeil, [cx0, CEIL, z0 - 0.5], [cx1, CEIL + 0.6, TRACK.z1 + 1.5], { uvScale: 0.5 });
  for (const [cx0, cx1] of [[-14.3, -9.7], [9.7, 14.3]]) B.box(subCeil, [cx0, CEIL, 64.5], [cx1, CEIL + 0.6, TRACK.z1 + 1.5], { uvScale: 0.5 });
  for (let x = PLAT.x0; x <= PLAT.x1; x += 4.6) B.box(M.steelGreen, [x - 0.2, CEIL - 0.45, z0], [x + 0.2, CEIL, TRACK.z1 + 0.5], { uvScale: 1 });
  B.box(M.steelGreen, [PLAT.x0 - T, CEIL - 0.5, 64 - 0.25], [PLAT.x1 + T, CEIL, 64 + 0.25], { uvScale: 1 });

  // ---- riveted I-beam columns (instanced) on the platform + along the track edge -------------------------------
  {
    const web = new THREE.BoxGeometry(0.14, CEIL - SUB, 0.3); const fl = new THREE.BoxGeometry(0.42, CEIL - SUB, 0.06);
    const f1 = fl.clone().translate(0, 0, 0.15), f2 = fl.clone().translate(0, 0, -0.15);
    const base = new THREE.BoxGeometry(0.55, 0.25, 0.55); base.translate(0, -(CEIL - SUB) / 2 + 0.125, 0);
    const rivets = []; for (let yy = -(CEIL - SUB) / 2 + 0.5; yy < (CEIL - SUB) / 2 - 0.2; yy += 0.28) for (const dx of [-0.16, 0.16]) for (const dz of [-0.19, 0.19]) { const r = new THREE.BoxGeometry(0.035, 0.035, 0.03); r.translate(dx, yy, dz); rivets.push(r); }
    const col = mergeSimple([web, f1, f2, base, ...rivets]);
    const mats = []; const y = (SUB + CEIL) / 2;
    for (let x = PLAT.x0 + 2.3; x < PLAT.x1; x += 4.6) { mats.push(mat4(x, y, 64)); world.box([x - 0.25, SUB, 63.75], [x + 0.25, CEIL, 64.25]); world.cover(x + 0.7, 64, 1, 0, SUB); world.cover(x - 0.7, 64, -1, 0, SUB); }
    for (let x = PLAT.x0 + 2.3; x < PLAT.x1; x += 4.6) { mats.push(mat4(x, y, z1 + 0.3)); world.box([x - 0.25, SUB - 1.2, z1 + 0.05], [x + 0.25, CEIL, z1 + 0.55]); }
    instanced(world, col, M.steelGreen, mats, 'metal', { name: 'ibeams' });
    // "42" tile signs on both faces of every column
    const sg = M.sign('42', { w: 128, h: 128, bg: '#f0ece2', fg: '#111', font: 'bold 84px Helvetica, Arial, sans-serif' }); sg.map.repeat.set(1, 1);
    const sgGeo = mergeSimple([new THREE.PlaneGeometry(0.34, 0.34).translate(0, -0.9, 0.2), new THREE.PlaneGeometry(0.34, 0.34).rotateY(Math.PI).translate(0, -0.9, -0.2)]);
    instanced(world, sgGeo, sg, mats, 'metal', { name: 'colSigns', shadow: false });
    // rivet rows (tiny instanced spheres) skipped → painted rivet feel via roughness
  }
  // ---- stairs down from the mezzanine (x=±12, from z=57 (y -6) to z=66.6 (y -12)) --------------------------------
  // (re)build the stairs properly: descending toward +z. Build rising from the platform end (z=66.6) toward -z.
  for (const side of [-1, 1]) {
    const cx = side * 12; const w = 4.0; const zTop = MEZ.z1 - 1, zBot = zTop + 9.6;
    const st = stairSteps(world, B, M.concrete, { x: cx, z: zBot, dir: [0, -1], width: w, run: 9.6, rise: LOW - SUB, y0: SUB, n: 32, depthUnder: 0.6, uvScale: 0.5 });
    Z.push({ x0: cx - w / 2, x1: cx + w / 2, z0: zTop, z1: zBot, h: (x, z) => { const a = zBot - z; const i = Math.min(31, Math.floor(a / st.stepRun)); return SUB + (i + 1) * st.stepRise; } });
    // enclosure walls (tiled) along the stair + handrails; opening through the mezzanine floor/platform ceiling
    for (const s of [-1, 1]) { const wx = cx + s * (w / 2 + 0.15); B.box(M.tile, [wx - 0.15, SUB, zTop - 0.5], [wx + 0.15, LOW + 3.4, zBot], { uvScale: 1 }); world.box([wx - 0.15, SUB, zTop - 0.5], [wx + 0.15, LOW + 3.4, zBot]); B.box(M.stainless, [wx - s * 0.1 - 0.02, SUB, zTop], [wx - s * 0.1 + 0.02, LOW + 1.0, zBot], { uvScale: 1 }); }
    // the mezzanine floor gap: mezzanine slab box covers z<59 only around the stair, so cut a hole by rebuilding: (mezz floor is a full box) → add a stair-top landing in the mezzanine at LOW (z 57..58) is the mezz floor itself; stair descends from z=57.
    // handrail down the middle
    B.box(M.stainless, [cx - 0.03, SUB, zTop], [cx + 0.03, LOW + 1.0, zBot], { uvScale: 1 });
    // ceiling over the stair (sloped concrete): approximate with a box at mezz ceiling height
    { const L = Math.hypot(64.5 - zTop, (LOW + 3.4) - CEIL); const ang = Math.atan2((LOW + 3.4) - CEIL, 64.5 - zTop); const g = new THREE.BoxGeometry(w + 0.6, 0.4, L); B.add(M.concrete, g, mat4(cx, ((LOW + 3.4) + CEIL) / 2 + 0.2, (zTop + 64.5) / 2, ang), { uvScale: 0.5 }); }
    world.cover(cx + s_(side) * (w / 2 + 0.9), zBot + 0.5, s_(side), 0, SUB);
    const sgn = M.sign('4 · 5 · 6   DOWNTOWN & BROOKLYN', { bg: '#0d0d0d', fg: '#ffffff', font: 'bold 56px Helvetica, Arial' }); B.add(sgn, new THREE.PlaneGeometry(3.6, 0.45), mat4(cx, LOW + 2.6, zTop - 0.02, 0, 0, 0));
  }

  // ---- platform furniture: benches (wood slat), trash cans, help point, vending --------------------------------------
  for (const bx of [-40, -30, -20, 20, 30, 40]) { B.box(M.wood, [bx - 1.5, SUB + 0.42, z0 + 0.4], [bx + 1.5, SUB + 0.5, z0 + 0.95], { uvScale: 1 }); B.box(M.wood, [bx - 1.5, SUB + 0.5, z0 + 0.35], [bx + 1.5, SUB + 1.0, z0 + 0.42], { uvScale: 1 }); for (const dx of [-1.3, 0, 1.3]) B.box(M.ironDark, [bx + dx - 0.05, SUB, z0 + 0.4], [bx + dx + 0.05, SUB + 0.45, z0 + 0.95], { uvScale: 1 }); world.box([bx - 1.5, SUB, z0 + 0.3], [bx + 1.5, SUB + 1.0, z0 + 1.0]); world.cover(bx, z0 + 1.7, 0, 1, SUB); }
  world.termTrash.push([-16, SUB, z0 + 0.8], [16, SUB, z0 + 0.8], [-44, SUB, z0 + 0.8], [44, SUB, z0 + 0.8], [0, SUB, z0 + 0.8]);
  B.box(M.steelBlue, [-2, SUB, z0 + 0.1], [-0.8, SUB + 2.2, z0 + 0.7], { uvScale: 1, collide: true }); B.box(M.fluor, [-1.6, SUB + 1.9, z0 + 0.7], [-1.2, SUB + 2.0, z0 + 0.72], { uvScale: 1 });
  B.box(M.ironDark, [2, SUB, z0 + 0.1], [3.2, SUB + 1.9, z0 + 0.9], { uvScale: 1, collide: true }); B.box(M.darkGlass, [2.1, SUB + 0.6, z0 + 0.9], [3.1, SUB + 1.7, z0 + 0.92], { uvScale: 1 });
  // fluorescent tube fixtures along the platform ceiling (emissive) + positions for real lights
  for (let x = PLAT.x0 + 2.5; x < PLAT.x1; x += 5) for (const fz of [60.5, 67]) { B.box(M.fluor, [x - 1.9, CEIL - 0.22, fz - 0.14], [x + 1.9, CEIL - 0.16, fz + 0.14], { uvScale: 1 }); B.box(M.ironDark, [x - 2.0, CEIL - 0.16, fz - 0.2], [x + 2.0, CEIL, fz + 0.2], { uvScale: 1 }); }
  for (const lx of [-33, -11, 11, 33]) world.termLamps.push([lx, CEIL - 0.4, 63, 'fluorReal']);
  // wet floor patches (dark glossy decals) — thin boxes with low roughness
  const wet = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.55 }); wet.name = 'wet'; wet.userData.castShadow = false;
  for (const [wx, wz, r] of [[-26, 62, 2.2], [8, 66, 1.6], [30, 61, 2.8], [-6, 64.5, 1.2]]) B.add(wet, new THREE.CircleGeometry(r, 20), mat4(wx, SUB + 0.006, wz, -Math.PI / 2));

  // ---- stopped train on the track (4 cars, doors open onto the platform; interior walkable) --------------------------
  {
    const carL = 15.6, carW = 2.9, carH = 3.5; const floorY = SUB - 0.05; const cz = TRACK.z0 + 1.95; // car center over the track
    const roll = M.rollSign('4  WOODLAWN');
    for (let c = 0; c < 4; c++) {
      const cx = -30 + c * (carL + 0.6);
      const x0 = cx - carL / 2, x1 = cx + carL / 2, zA = cz - carW / 2, zB = cz + carW / 2;
      // floor + underframe
      B.box(M.rubber, [x0, floorY - 0.12, zA], [x1, floorY, zB], { uvScale: 1 }); world.walkable([x0, floorY - 0.12, zA], [x1, floorY, zB]);
      B.box(M.ironDark, [x0 + 0.3, floorY - 0.9, zA + 0.3], [x1 - 0.3, floorY - 0.12, zB - 0.3], { uvScale: 1 });
      for (const bx of [x0 + 2.2, x1 - 2.2]) for (const bz of [cz - 0.75, cz + 0.75]) B.add(M.ironDark, new THREE.CylinderGeometry(0.42, 0.42, 0.12, 16), mat4(bx, floorY - 0.7, bz, Math.PI / 2, 0, 0));
      // roof
      B.box(M.stainless, [x0, floorY + carH - 0.1, zA], [x1, floorY + carH, zB], { uvScale: 1 });
      B.box(M.ironDark, [x0 + 1, floorY + carH, zA + 0.6], [x1 - 1, floorY + carH + 0.3, zB - 0.6], { uvScale: 1 });
      // walls: platform side (zA, toward the platform) with 3 open doors; far side solid with windows; ends
      const doors = [cx - 5.2, cx, cx + 5.2]; const dw = 1.4;
      for (const zz of [zA, zB]) {
        const isPlat = zz === zA; let segs = [[x0, x1]];
        if (isPlat) { segs = []; let s = x0; for (const d of doors) { segs.push([s, d - dw / 2]); s = d + dw / 2; } segs.push([s, x1]); }
        for (const [a, b] of segs) {
          if (b - a < 0.05) continue;
          const zz0 = zz === zA ? zA - 0.02 : zB - 0.06, zz1 = zz === zA ? zA + 0.06 : zB + 0.02;
          B.box(M.stainless, [a, floorY, zz0], [b, floorY + 1.0, zz1], { uvScale: 1 }); B.box(M.stainless, [a, floorY + 2.3, zz0], [b, floorY + carH - 0.1, zz1], { uvScale: 1 });
          B.box(M.trainWindow, [a, floorY + 1.0, zz0 + 0.01], [b, floorY + 2.3, zz1 - 0.01], { uvScale: 1 });
          // window mullions every 1.5 m
          for (let mx = a + 0.75; mx < b; mx += 1.5) B.box(M.stainless, [mx - 0.04, floorY + 1.0, zz0], [mx + 0.04, floorY + 2.3, zz1], { uvScale: 1 });
          world.box([a, floorY, zz0], [b, floorY + carH, zz1]);
        }
        // fluted stainless band below the windows
        B.box(M.brassDark, [x0, floorY + 0.98, zz === zA ? zA - 0.03 : zB + 0.0], [x1, floorY + 1.02, zz === zA ? zA + 0.0 : zB + 0.03], { uvScale: 1 });
      }
      // open door frames (pocketed doors shown half-open)
      for (const d of doors) { B.box(M.stainless, [d - dw / 2 - 0.05, floorY, zA - 0.02], [d - dw / 2 + 0.05, floorY + 2.2, zA + 0.06], { uvScale: 1 }); B.box(M.stainless, [d + dw / 2 - 0.05, floorY, zA - 0.02], [d + dw / 2 + 0.05, floorY + 2.2, zA + 0.06], { uvScale: 1 }); B.box(M.stainless, [d - dw / 2, floorY + 2.2, zA - 0.02], [d + dw / 2, floorY + 2.3, zA + 0.06], { uvScale: 1 }); world.box([d - dw / 2, floorY + 2.2, zA - 0.05], [d + dw / 2, floorY + carH, zA + 0.1]); }
      // ends
      for (const ex of [x0, x1]) { B.box(M.stainless, [ex - 0.03, floorY, zA], [ex + 0.03, floorY + carH, zB], { uvScale: 1 }); world.box([ex - 0.05, floorY, zA], [ex + 0.05, floorY + carH, zB]); B.add(roll, new THREE.PlaneGeometry(1.1, 0.28), mat4(ex + (ex === x0 ? -0.04 : 0.04), floorY + 3.0, cz, 0, ex === x0 ? -Math.PI / 2 : Math.PI / 2)); }
      // roll sign on the platform side + car number
      B.add(roll, new THREE.PlaneGeometry(1.3, 0.34), mat4(cx - 6.6, floorY + 2.68, zA - 0.03, 0, Math.PI, 0)); B.add(roll, new THREE.PlaneGeometry(1.3, 0.34), mat4(cx + 6.6, floorY + 2.68, zA - 0.03, 0, Math.PI, 0));
      // interior: longitudinal seats (both sides), poles, ceiling lights
      for (const [sa, sb] of [[x0 + 0.4, doors[0] - dw / 2 - 0.3], [doors[0] + dw / 2 + 0.3, doors[1] - dw / 2 - 0.3], [doors[1] + dw / 2 + 0.3, doors[2] - dw / 2 - 0.3], [doors[2] + dw / 2 + 0.3, x1 - 0.4]]) {
        if (sb - sa < 0.6) continue;
        B.box(M.blueSeat, [sa, floorY, zA + 0.08], [sb, floorY + 0.45, zA + 0.6], { uvScale: 1 }); B.box(M.blueSeat, [sa, floorY + 0.45, zA + 0.08], [sb, floorY + 0.95, zA + 0.2], { uvScale: 1 }); world.box([sa, floorY, zA + 0.06], [sb, floorY + 0.95, zA + 0.6]);
        B.box(M.blueSeat, [sa, floorY, zB - 0.6], [sb, floorY + 0.45, zB - 0.08], { uvScale: 1 }); B.box(M.blueSeat, [sa, floorY + 0.45, zB - 0.2], [sb, floorY + 0.95, zB - 0.08], { uvScale: 1 }); world.box([sa, floorY, zB - 0.6], [sb, floorY + 0.95, zB - 0.06]);
      }
      for (const px of [cx - 2.6, cx + 2.6, cx - 7, cx + 7]) { B.add(M.stainless, new THREE.CylinderGeometry(0.02, 0.02, carH - 0.15, 8), mat4(px, floorY + carH / 2, cz)); }
      B.box(M.fluor, [x0 + 0.5, floorY + carH - 0.16, cz - 0.15], [x1 - 0.5, floorY + carH - 0.12, cz + 0.15], { uvScale: 1 });
      world.cover(cx - 7.8 - 0.6, zA - 0.9, -1, 0, SUB); world.cover(cx + 7.8 + 0.6, zA - 0.9, 1, 0, SUB);
    }
    // headlights/tail glow on the lead car end
    B.add(M.fluor, new THREE.CircleGeometry(0.12, 10), mat4(-30 - 15.6 / 2 - 0.05, floorY + 0.7, cz - 0.9, 0, -Math.PI / 2)); B.add(M.fluor, new THREE.CircleGeometry(0.12, 10), mat4(-30 - 15.6 / 2 - 0.05, floorY + 0.7, cz + 0.9, 0, -Math.PI / 2));
    world.termLamps.push([-22, SUB + 3.2, cz, 'trainInt'], [10, SUB + 3.2, cz, 'trainInt']);
  }

  B.flush((m) => (m === M.stainless || m === M.ironDark || m === M.steelGreen || m === M.steelBlue || m === M.brassDark ? 'metal' : m === M.wood ? 'wood' : 'concrete'), { name: 'subway' });
}
function s_(side) { return side; }
function mergeSimple(geos) { let total = 0; for (const g of geos) total += (g.index ? g.toNonIndexed() : g).attributes.position.count; const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uvs = new Float32Array(total * 2); let off = 0; for (const g0 of geos) { const g = g0.index ? g0.toNonIndexed() : g0; pos.set(g.attributes.position.array, off * 3); nor.set(g.attributes.normal.array, off * 3); uvs.set(g.attributes.uv.array, off * 2); off += g.attributes.position.count; } const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); return out; }
