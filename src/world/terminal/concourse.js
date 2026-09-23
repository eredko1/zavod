// TERMINAL — Main Concourse shell: floor, walls, windows, celestial vault, balconies, Garnier stairs, info booth + clock, ticket offices, boards. TERMINAL agent.
import * as THREE from 'three';
import { Bucket, archPath, wallGeo, placeXY, mat4, lathe, balustrade, instanced, stairSteps } from './kit.js';
import { P } from './plan.js';

function archHole(cx, y0, w, h) { const p = new THREE.Path(); const r = w / 2, yc = y0 + h - r; p.moveTo(cx - r, y0); p.lineTo(cx + r, y0); p.lineTo(cx + r, yc); p.absarc(cx, yc, r, 0, Math.PI, false); p.lineTo(cx - r, y0); p.closePath(); return p; }
function rectHole(x0, y0, x1, y1) { const p = new THREE.Path(); p.moveTo(x0, y0); p.lineTo(x1, y0); p.lineTo(x1, y1); p.lineTo(x0, y1); p.closePath(); return p; }

/** Elliptical vault section height at z (|z| ≤ half). */
export function vaultY(z) { const t = Math.min(1, Math.abs(z) / -P.Z0); return P.CORNICE + (P.APEX - P.CORNICE) * Math.sqrt(Math.max(0, 1 - t * t)); }

export function buildConcourse(world, M, Z) {
  const { ctx, scene, R } = world;
  const B = new Bucket(world);
  const uv = (m) => m.userData.uv ?? 0.5;
  const { X0, X1, Z0, Z1, CORNICE, APEX, WALL_T: T, BAL_Y, BAL_X } = P;

  // ---- floor (Tennessee pink marble) --------------------------------------------------
  { // floor split around the west subway stair well (x∈[−40.5,−36.5], z∈[8,17.6])
    const [wx0, wx1] = P.PASS.stairX, [wz0, wz1] = P.PASS.stairZ;
    B.box(M.marbleFloor, [X0 - 2, -0.6, Z0 - 2], [X1 + 2, 0, wz0], { uvScale: uv(M.marbleFloor) });
    B.box(M.marbleFloor, [X0 - 2, -0.6, wz1], [X1 + 2, 0, Z1 + 2], { uvScale: uv(M.marbleFloor) });
    B.box(M.marbleFloor, [X0 - 2, -0.6, wz0], [wx0 - 0.3, 0, wz1], { uvScale: uv(M.marbleFloor) });
    B.box(M.marbleFloor, [wx1 + 0.3, -0.6, wz0], [X1 + 2, 0, wz1], { uvScale: uv(M.marbleFloor) });
  }

  // ---- long walls (N/S) to the cornice, with pilasters -------------------------------------
  // south wall: central arch (bridge), two corner openings (ramps), clerestory arches, tall grilled windows
  {
    const holesS = [archHole(0, 0, P.BRIDGE_HX * 2 - 1, 9)];
    for (const s of [-1, 1]) holesS.push(archHole(s * (P.OPEN_X0 + P.OPEN_X1) / 2, 0, P.OPEN_X1 - P.OPEN_X0, 6));
    for (const cx of [-24, -12, 0, 12, 24]) holesS.push(archHole(cx, 13.5, 6.4, 8));      // clerestory
    for (const cx of [-30, -18, -6, 6, 18, 30]) holesS.push(rectHole(cx - 1.6, 6.5, cx + 1.6, 12));   // tall grilled windows
    const shape = new THREE.Shape(); shape.moveTo(X0 - T, 0); shape.lineTo(X1 + T, 0); shape.lineTo(X1 + T, CORNICE); shape.lineTo(X0 - T, CORNICE); shape.closePath();
    const g = wallGeo(shape, holesS, T); B.add(M.stone, g, placeXY(0, 0, Z1), { uvScale: uv(M.stone) });
    // glass behind clerestory + tall windows (bright daylight), grilles over tall windows
    for (const cx of [-24, -12, 0, 12, 24]) { const gl = new THREE.ShapeGeometry(archShapeAt(cx, 13.5, 6.4, 8)); B.add(M.glass, gl, placeXY(0, 0, Z1 + T * 0.55), { uvScale: uv(M.glass) }); }
    for (const cx of [-30, -18, -6, 6, 18, 30]) { const gl = new THREE.PlaneGeometry(3.2, 5.5); B.add(M.glassDim, gl, mat4(cx, 9.25, Z1 + T * 0.6), { uvScale: uv(M.glassDim) }); B.add(M.bronze, grilleGeo(3.2, 5.5), mat4(cx, 9.25, Z1 + 0.25)); }
    // colliders: wall segments (leave the 3 openings)
    world.box([X0 - 2, 0, Z1], [-P.OPEN_X1, 40, Z1 + T]); world.box([-P.OPEN_X0, 0, Z1], [-P.BRIDGE_HX + 0.5, 40, Z1 + T]);
    world.box([P.BRIDGE_HX - 0.5, 0, Z1], [P.OPEN_X0, 40, Z1 + T]); world.box([P.OPEN_X1, 0, Z1], [X1 + 2, 40, Z1 + T]);
    world.box([X0 - 2, 6, Z1], [X1 + 2, 40, Z1 + T]); // lintels over openings
  }
  // north wall: solid with arched niches (closed doors to the MetLife passage) above the north balcony
  {
    const holesN = [];
    for (const cx of [-24, -12, 0, 12, 24]) holesN.push(archHole(cx, 13.5, 6.4, 8));
    const shape = new THREE.Shape(); shape.moveTo(X0 - T, 0); shape.lineTo(X1 + T, 0); shape.lineTo(X1 + T, CORNICE); shape.lineTo(X0 - T, CORNICE); shape.closePath();
    const g = wallGeo(shape, holesN, T); B.add(M.stone, g, placeXY(0, 0, Z0 - T), { uvScale: uv(M.stone) });
    for (const cx of [-24, -12, 0, 12, 24]) { const gl = new THREE.ShapeGeometry(archShapeAt(cx, 13.5, 6.4, 8)); B.add(M.glassDim, gl, placeXY(0, 0, Z0 - T * 0.55), { uvScale: uv(M.glassDim) }); }
    world.box([X0 - 2, 0, Z0 - T], [X1 + 2, 40, Z0]);
    // doors on the north balcony back wall (dark bronze, recessed look)
    for (const cx of [-20, 0, 20]) B.box(M.bronze, [cx - 1.6, BAL_Y, Z0 - 0.1], [cx + 1.6, BAL_Y + 3.6, Z0 + 0.05], { uvScale: 1 });
  }
  // pilasters on long walls (paired, rising to the cornice) + cornice band + bulb strings
  {
    const pil = [];
    for (const x of [-36, -24, -12, 0, 12, 24, 36]) for (const zz of [Z1, Z0]) {
      const dir = zz > 0 ? -1 : 1;
      pil.push([x - 3.6, zz + dir * 0.35], [x + 3.6, zz + dir * 0.35]);
    }
    for (const [x, z] of pil) {
      const d = z > 0 ? -1 : 1;
      B.box(M.stone, [x - 0.6, 0, Math.min(z, z + d * 0.95)], [x + 0.6, CORNICE - 1.2, Math.max(z, z + d * 0.95)], { uvScale: uv(M.stone) });
      B.box(M.marble, [x - 0.8, CORNICE - 2.6, Math.min(z, z + d * 1.15)], [x + 0.8, CORNICE - 1.2, Math.max(z, z + d * 1.15)], { uvScale: uv(M.marble) });   // capital
      B.box(M.marbleDark, [x - 0.75, 0, Math.min(z, z + d * 1.1)], [x + 0.75, 2.8, Math.max(z, z + d * 1.1)], { uvScale: uv(M.marbleDark) });               // base
    }
    // Botticino wainscot along the long walls (dark band with a cap molding)
    B.box(M.marbleDark, [X0, 0, Z1 - 0.18], [X1, 2.6, Z1 + 0.05], { uvScale: uv(M.marbleDark) }); B.box(M.marble, [X0, 2.6, Z1 - 0.26], [X1, 2.8, Z1 + 0.05], { uvScale: uv(M.marble) });
    B.box(M.marbleDark, [X0, 0, Z0 - 0.05], [X1, 2.6, Z0 + 0.18], { uvScale: uv(M.marbleDark) }); B.box(M.marble, [X0, 2.6, Z0 - 0.05], [X1, 2.8, Z0 + 0.26], { uvScale: uv(M.marble) });
    // cornice underside molding + a second step (depth)
    B.box(M.marble, [X0 - T, CORNICE - 1.6, Z1 - 0.6], [X1 + T, CORNICE - 1.2, Z1 + 0.2], { uvScale: uv(M.marble) }); B.box(M.marble, [X0 - T, CORNICE - 1.6, Z0 - 0.2], [X1 + T, CORNICE - 1.2, Z0 + 0.6], { uvScale: uv(M.marble) });
    // cornice (long walls + end walls), a projecting band under the vault spring
    B.box(M.marble, [X0 - T, CORNICE - 1.2, Z1 - 1.0], [X1 + T, CORNICE + 0.3, Z1 + 0.2], { uvScale: uv(M.marble) });
    B.box(M.marble, [X0 - T, CORNICE - 1.2, Z0 - 0.2], [X1 + T, CORNICE + 0.3, Z0 + 1.0], { uvScale: uv(M.marble) });
    // frieze band above the balcony arcade
    B.box(M.marble, [X0, BAL_Y + 3.9, Z1 - 0.7], [X1, BAL_Y + 4.6, Z1 + 0.1], { uvScale: uv(M.marble) });
    B.box(M.marble, [X0, BAL_Y + 3.9, Z0 - 0.1], [X1, BAL_Y + 4.6, Z0 + 0.7], { uvScale: uv(M.marble) });
  }

  // ---- end walls (E/W): lunette to the vault with three 18 m arched windows ------------------------
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape(); const hw = -Z0 + T; // local x = world z (mirrored for one side; symmetric)
    shape.moveTo(-hw, 0); shape.lineTo(hw, 0); shape.lineTo(hw, CORNICE); shape.absellipse(0, CORNICE, hw, APEX - CORNICE + 0.6, 0, Math.PI, false); shape.lineTo(-hw, 0); shape.closePath();
    const holes = [];
    for (const cz of [-12.5, 0, 12.5]) holes.push(archHole(cz, 11, 9, 18));
    // ground-level arcade niches (passages to Vanderbilt Ave / Lexington Ave) — closed with grilles
    for (const cz of [-12.5, 0, 12.5]) holes.push(archHole(cz, 0, 5, 6));
    // balcony-level arched openings (shops behind)
    for (const cz of [-12.5, 0, 12.5]) holes.push(archHole(cz, BAL_Y, 4.6, 5.2));
    const g = wallGeo(shape, holes, T);
    const x = side < 0 ? X0 - T : X1 + T; const yaw = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    B.add(M.stone, g, placeXY(x, 0, 0, yaw), { uvScale: uv(M.stone) });
    // glass panes + catwalk bands + mullion posts
    for (const cz of [-12.5, 0, 12.5]) {
      const gl = new THREE.ShapeGeometry(archShapeAt(cz, 11, 9, 18));
      const gx = side < 0 ? X0 - T * 0.45 : X1 + T * 0.45;
      B.add(M.glass, gl, placeXY(gx, 0, 0, yaw), { uvScale: uv(M.glass) });
      for (const yy of [17, 23]) B.box(M.bronze, [Math.min(gx, gx - side * 0.5), yy - 0.25, cz - 4.5], [Math.max(gx, gx - side * 0.5), yy + 0.25, cz + 4.5], { uvScale: 1 });
      for (const dz of [-3, -1, 1, 3]) B.box(M.bronze, [Math.min(gx, gx - side * 0.3), 11, cz + dz - 0.12], [Math.max(gx, gx - side * 0.3), 24.5, cz + dz + 0.12], { uvScale: 1 });
      // dim glass in the ground niches + balcony openings (interior spaces beyond)
      B.add(M.glassDim, new THREE.ShapeGeometry(archShapeAt(cz, 0, 5, 6)), placeXY(gx - side * 0.2, 0, 0, yaw), { uvScale: uv(M.glassDim) });
      B.add(M.shopGlow, new THREE.ShapeGeometry(archShapeAt(cz, BAL_Y, 4.6, 5.2)), placeXY(gx - side * 0.2, 0, 0, yaw), { uvScale: 0.5 });
      B.box(M.brass, [Math.min(gx - side * 0.25, gx - side * 0.35), BAL_Y + 0.9, cz - 2.3], [Math.max(gx - side * 0.25, gx - side * 0.35), BAL_Y + 0.98, cz + 2.3], { uvScale: 1 });
    }
    world.box(side < 0 ? [X0 - T - 1, 0, Z0 - 2] : [X1, 0, Z0 - 2], side < 0 ? [X0, 44, Z1 + 2] : [X1 + T + 1, 44, Z1 + 2]);
    // end arch: deep coffered band following the vault edge
    const pts = []; for (let i = 0; i <= 40; i++) { const zz = Z0 + (Z1 - Z0) * i / 40; pts.push(new THREE.Vector3(side < 0 ? X0 + 1.2 : X1 - 1.2, vaultY(zz) - 0.6, zz)); }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.9, 10, false);
    B.add(M.marble, tube, null, { uvScale: uv(M.marble) });
  }

  // ---- celestial vault -----------------------------------------------------------------------
  {
    const NX = 84, NZ = 48; const pos = [], uvs = [], idx = [];
    for (let i = 0; i <= NX; i++) for (let j = 0; j <= NZ; j++) {
      const x = X0 - T + (X1 - X0 + 2 * T) * i / NX; const th = Math.PI * j / NZ; // th: 0 at z=Z1 → π at z=Z0
      const z = Math.cos(th) * (Z1 + 0.05); const y = CORNICE + Math.sin(th) * (APEX - CORNICE);
      pos.push(x, y, z); uvs.push(i / NX, j / NZ);
    }
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) { const a = i * (NZ + 1) + j, b = a + NZ + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
    // ensure normals face inward (down)
    const n = g.attributes.normal; if (n.getY(Math.floor(n.count / 2)) > 0) { const ix = g.index.array; for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; } g.computeVertexNormals(); }
    const vaultMat = M.vault.clone(); vaultMat.side = THREE.FrontSide; vaultMat.name = 'vault';
    const mesh = new THREE.Mesh(g, vaultMat); mesh.name = 'vault'; mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); world.solid(mesh, 'concrete', { collide: false, shadow: false });
    mesh.castShadow = true; mesh.receiveShadow = true;
    // roof slab above the vault so no sun leaks through the top (shadow caster)
    B.box(M.plasterDark, [X0 - 3, APEX + 0.6, Z0 - 3], [X1 + 3, APEX + 1.2, Z1 + 3], { uvScale: 0.2 });
    // longitudinal gilded ribs at the vault spring + mid
    for (const zz of [Z1 - 0.4, Z0 + 0.4]) B.box(M.brassDark, [X0, CORNICE + 0.2, zz - 0.25], [X1, CORNICE + 0.7, zz + 0.25], { uvScale: 1 });
  }

  // ---- balconies (+6): W/E full width, north strip; slabs, undersides, balustrades, arcade with grilles -----
  {
    const y0 = BAL_Y - 0.6, y1 = BAL_Y;
    for (const side of [-1, 1]) {
      const bx0 = side < 0 ? X0 : BAL_X, bx1 = side < 0 ? -BAL_X : X1;
      B.box(M.marble, [bx0, y0, Z0], [bx1, y1, Z1], { uvScale: uv(M.marble) });
      world.walkable([bx0, y0, Z0], [bx1, y1, Z1]);
      Z.push({ x0: bx0, x1: bx1, z0: Z0, z1: Z1, h: BAL_Y });
      // balustrade on the balcony front, except where the stair landing/flights meet it (|z| < UP_Z1)
      const fx = side < 0 ? -BAL_X : BAL_X;
      // balcony tabs beyond the return flights: x∈[∓31,∓28.5], |z|∈[11.5,18.5] at +6 (collider slab, the flights land on them)
      const tx0 = Math.min(fx, side * P.UP_X0), tx1 = Math.max(fx, side * P.UP_X0);
      for (const [za, zb] of [[Z0, -P.UP_Z1], [P.UP_Z1, Z1]]) {
        const lo = Math.min(za, zb), hi = Math.max(za, zb);
        B.box(M.marble, [tx0, y0, lo], [tx1, y1, hi], { uvScale: uv(M.marble) }); world.walkable([tx0, y0, lo], [tx1, y1, hi]);
        B.box(M.plaster, [tx0, y0 - 0.3, lo], [tx1, y0, hi], { uvScale: 0.5 });
        const tfx = side * P.UP_X0; balustrade(B, M.marble, M.marble, [tfx, lo + 0.1], [tfx, hi - 0.1], { y: BAL_Y, instBal: world.termBal }); world.box([tfx - 0.15, BAL_Y, lo], [tfx + 0.15, BAL_Y + 1.1, hi]);
        // short return balustrade closing the tab's inner corner at |z| = 11.5 is not needed: the flight arrives there
      }
      balustrade(B, M.marble, M.marble, [fx, -P.LAND_Z], [fx, P.LAND_Z], { y: BAL_Y, instBal: world.termBal }); world.box([fx - 0.15, BAL_Y, -P.LAND_Z], [fx + 0.15, BAL_Y + 1.1, P.LAND_Z]);
      // arcade under the balcony front (|z| > UP_Z1): piers + arches + bronze grilles (closed passages)
      const arcX0 = Math.min(fx, fx - side * 0.9), arcX1 = Math.max(fx, fx - side * 0.9);
      for (const s2 of [-1, 1]) {
        const za = s2 * P.UP_Z1, zb = s2 * Z1; const zc = (za + zb) / 2; // one 5 m arch per corner span (7 m)
        const shape = new THREE.Shape(); const lo = Math.min(za, zb), hi = Math.max(za, zb);
        shape.moveTo(lo, 0); shape.lineTo(hi, 0); shape.lineTo(hi, y0 + 0.01); shape.lineTo(lo, y0 + 0.01); shape.closePath();
        const g = wallGeo(shape, [archHole(zc, 0, 4.6, 5.0)], 0.9);
        B.add(M.stone, g, placeXY(side < 0 ? arcX1 : arcX0, 0, 0, side < 0 ? Math.PI / 2 : -Math.PI / 2), { uvScale: uv(M.stone) });
        // open passage: colliders for the piers either side of the arch and the lintel above it (arch 4.6 wide, 5.0 high)
        world.box([arcX0 - 0.1, 0, lo], [arcX1 + 0.1, y0, zc - 2.3]); world.box([arcX0 - 0.1, 0, zc + 2.3], [arcX1 + 0.1, y0, hi]); world.box([arcX0 - 0.1, 4.6, zc - 2.3], [arcX1 + 0.1, y0, zc + 2.3]);
        // lit passage behind: back wall glow + a warm bulb strip
        B.box(M.bulb, [side < 0 ? X0 + 1 : X1 - 5, 3.4, zc - 1.5], [side < 0 ? X0 + 5 : X1 - 1, 3.5, zc + 1.5], { uvScale: 1 });
      }
      // under-balcony ceiling (coffered look) + solid mass filling behind the stair (under landing) is done in stairs
      B.box(M.plaster, [bx0, y0 - 0.3, Z0], [bx1, y0, Z1], { uvScale: 0.5 });
      // sign band on the arcade lintel
      const sgn = M.sign(side < 0 ? 'WEST AVENUE  ·  SHUTTLE  ·  MAIN ST' : 'MARKET AVENUE  ·  EAST PASSAGE', { bg: '#3a2c18', fg: '#e8c56a', font: 'bold 60px Georgia, serif' });
      B.add(M.atlas, M.signGeo(sgn, 14, 0.9), mat4(fx - side * 0.01, y0 - 0.55, side < 0 ? 0 : 0, 0, side < 0 ? Math.PI / 2 : -Math.PI / 2));
    }
    // north balcony
    B.box(M.marble, [-BAL_X, y0, Z0], [BAL_X, y1, P.BAL_NZ], { uvScale: uv(M.marble) });
    world.walkable([-BAL_X, y0, Z0], [BAL_X, y1, P.BAL_NZ]);
    Z.push({ x0: -BAL_X, x1: BAL_X, z0: Z0, z1: P.BAL_NZ, h: BAL_Y });
    balustrade(B, M.marble, M.marble, [P.UP_X0, P.BAL_NZ], [-P.UP_X0, P.BAL_NZ], { y: BAL_Y, instBal: world.termBal }); world.box([P.UP_X0, BAL_Y, P.BAL_NZ - 0.15], [-P.UP_X0, BAL_Y + 1.1, P.BAL_NZ + 0.15]);
    B.box(M.plaster, [-BAL_X, y0 - 0.3, Z0], [BAL_X, y0, P.BAL_NZ], { uvScale: 0.5 });
    // north arcade: track gates (11 arches) with grilles, lit platforms glow behind
    {
      const shape = new THREE.Shape(); shape.moveTo(-BAL_X, 0); shape.lineTo(BAL_X, 0); shape.lineTo(BAL_X, y0 + 0.01); shape.lineTo(-BAL_X, y0 + 0.01); shape.closePath();
      const holes = []; const gates = [];
      for (let i = 0; i < 11; i++) { const cx = -28 + i * 5.6; holes.push(archHole(cx, 0, 3.6, 4.6)); gates.push(cx); }
      const g = wallGeo(shape, holes, 0.9); B.add(M.stone, g, placeXY(0, 0, P.BAL_NZ - 0.9), { uvScale: uv(M.stone) });
      // open track gates: pier colliders between the arches + lintel band above (arch 3.6 wide, 4.6 high)
      { let px = -BAL_X - 0.1; for (const cx of gates) { world.box([px, 0, P.BAL_NZ - 1.0], [cx - 1.8, y0, P.BAL_NZ]); px = cx + 1.8; } world.box([px, 0, P.BAL_NZ - 1.0], [BAL_X + 0.1, y0, P.BAL_NZ]); world.box([-BAL_X - 0.1, 4.3, P.BAL_NZ - 1.0], [BAL_X + 0.1, y0, P.BAL_NZ]); }
      // gate numbers (generic)
      let tn = 42; for (const cx of gates) { const s = M.sign(`TRACK ${tn}`, { w: 512, h: 128, bg: '#1a1a1a', fg: '#f2e6c8', font: 'bold 64px Georgia, serif' }); B.add(M.atlas, M.signGeo(s, 1.8, 0.45), mat4(cx, 4.85, P.BAL_NZ + 0.01)); tn -= 3; }
      B.box(M.bulb, [-BAL_X + 1, 3.6, Z0 + 0.6], [BAL_X - 1, 3.7, Z0 + 0.7], { uvScale: 1 });
      // platform-ish glow surfaces behind the gates (train shed hint)
      B.box(M.plasterDark, [-BAL_X, 0, Z0], [BAL_X, y0, Z0 + 0.4], { uvScale: 0.5 });
    }
  }

  // ---- Garnier stairs (west and east) -----------------------------------------------------------------
  for (const side of [-1, 1]) {
    const sx = (x) => side * x; // mirror helper (west uses negative x)
    // lower flight: from x=-20 to -26 (west) rising 0→3, width 8
    const lower = stairSteps(world, B, M.marble, { x: sx(P.ST_X0), z: 0, dir: [Math.sign(sx(P.ST_X1) - sx(P.ST_X0)), 0], width: P.ST_HALF * 2, run: Math.abs(P.ST_X1 - P.ST_X0), rise: 3, n: 16, depthUnder: 0.6, uvScale: uv(M.marble) });
    Z.push({ x0: Math.min(sx(P.ST_X0), sx(P.ST_X1)), x1: Math.max(sx(P.ST_X0), sx(P.ST_X1)), z0: -P.ST_HALF, z1: P.ST_HALF, h: (x) => { const a = Math.abs(x - sx(P.ST_X0)); const i = Math.min(15, Math.floor(a / lower.stepRun)); return (i + 1) * lower.stepRise; } });
    // landing y=3: x∈[-26,-31], z∈[-5.5,5.5]
    const lx0 = Math.min(sx(P.ST_X1), sx(-P.BAL_X)), lx1 = Math.max(sx(P.ST_X1), sx(-P.BAL_X));
    B.box(M.marble, [lx0, -0.6, -P.LAND_Z], [lx1, 3, P.LAND_Z], { uvScale: uv(M.marble) }); world.walkable([lx0, -0.6, -P.LAND_Z], [lx1, 3, P.LAND_Z]);
    Z.push({ x0: lx0, x1: lx1, z0: -P.LAND_Z, z1: P.LAND_Z, h: 3 });
    // upper return flights: x∈[-31,-28.5], from |z|=5.5 to 11.5 rising 3→6
    for (const s2 of [-1, 1]) {
      const ux0 = Math.min(sx(-P.BAL_X), sx(P.UP_X0)), ux1 = Math.max(sx(-P.BAL_X), sx(P.UP_X0));
      const up = stairSteps(world, B, M.marble, { x: (ux0 + ux1) / 2, z: s2 * P.LAND_Z, dir: [0, s2], width: ux1 - ux0, run: P.UP_Z1 - P.LAND_Z, rise: 3, y0: 3, n: 16, depthUnder: 3.6, uvScale: uv(M.marble) });
      Z.push({ x0: ux0, x1: ux1, z0: Math.min(s2 * P.LAND_Z, s2 * P.UP_Z1), z1: Math.max(s2 * P.LAND_Z, s2 * P.UP_Z1), h: (x, z) => { const a = Math.abs(z - s2 * P.LAND_Z); const i = Math.min(15, Math.floor(a / up.stepRun)); return 3 + (i + 1) * up.stepRise; } });
      // sloped outer parapet along the flight (x = UP_X0 side) + end cap at the top
      slopedParapet(B, world, M.marble, [sx(P.UP_X0) - side * 0.15, 3, s2 * P.LAND_Z], [sx(P.UP_X0) - side * 0.15, 6, s2 * P.UP_Z1], 0.3, 1.0);
      world.box([Math.min(sx(P.UP_X0), sx(P.UP_X0) - side * 0.3), 3, Math.min(s2 * P.LAND_Z, s2 * P.UP_Z1)], [Math.max(sx(P.UP_X0), sx(P.UP_X0) - side * 0.3), 7.0, Math.max(s2 * P.LAND_Z, s2 * P.UP_Z1)]);
      // landing edge balustrade (z = ±5.5, between x=-26 and -28.5)
      const bz = s2 * P.LAND_Z; balustrade(B, M.marble, M.marble, [Math.min(sx(P.ST_X1), sx(P.UP_X0)), bz], [Math.max(sx(P.ST_X1), sx(P.UP_X0)), bz], { y: 3, instBal: world.termBal });
      world.box([Math.min(sx(P.ST_X1), sx(P.UP_X0)), 3, bz - 0.15], [Math.max(sx(P.ST_X1), sx(P.UP_X0)), 4.1, bz + 0.15]);
      // small jog balustrade at x=-26 between |z| 4 → 5.5
      const jx = sx(P.ST_X1); balustrade(B, M.marble, M.marble, [jx, s2 * P.ST_HALF], [jx, bz], { y: 3, instBal: world.termBal }); world.box([jx - 0.15, 3, Math.min(s2 * P.ST_HALF, bz)], [jx + 0.15, 4.1, Math.max(s2 * P.ST_HALF, bz)]);
      // lower flight cheek walls (sloped) at z=±4
      slopedParapet(B, world, M.marble, [sx(P.ST_X0), 0, s2 * (P.ST_HALF + 0.15)], [sx(P.ST_X1), 3, s2 * (P.ST_HALF + 0.15)], 0.3, 1.0, 'z');
      const cx0 = Math.min(sx(P.ST_X0), sx(P.ST_X1)), cx1 = Math.max(sx(P.ST_X0), sx(P.ST_X1));
      world.box([cx0, 0, Math.min(s2 * P.ST_HALF, s2 * (P.ST_HALF + 0.3))], [cx1, 4.0, Math.max(s2 * P.ST_HALF, s2 * (P.ST_HALF + 0.3))]);
      // newel posts with brass lamps at the flight bottom
      const nx = sx(P.ST_X0) + side * 0.15, nz = s2 * (P.ST_HALF + 0.15);
      B.box(M.marble, [nx - 0.35, 0, nz - 0.35], [nx + 0.35, 1.5, nz + 0.35], { uvScale: uv(M.marble) });
      B.add(M.brass, new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8), mat4(nx, 2.1, nz));
      B.add(M.lampGlass, new THREE.SphereGeometry(0.28, 14, 10), mat4(nx, 2.85, nz));
      world.termLamps.push([nx, 2.85, nz]);
    }
    // solid mass under the upper flights/landing gap (x∈[-31,-28.5], |z|<5.5 is landing; fine)
    // wall closing the under-balcony space behind the landing (|z| < UP_Z1), with an arched niche on the landing
    const wx0 = Math.min(sx(-P.BAL_X), sx(-P.BAL_X - 0.9)), wx1 = Math.max(sx(-P.BAL_X), sx(-P.BAL_X - 0.9));
    B.box(M.stone, [wx0, -0.6, -P.UP_Z1], [wx1, BAL_Y - 0.6, P.UP_Z1], { uvScale: uv(M.stone) }); world.box([wx0 - 0.1, -0.6, -P.UP_Z1], [wx1 + 0.1, BAL_Y - 0.6, P.UP_Z1]);
    const fxw = sx(-P.BAL_X) - side * 0.03, yaww = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    B.add(M.glassDim, new THREE.ShapeGeometry(archShapeAt(0, 3, 3, 2.3)), placeXY(fxw, 0, 0, yaww), { uvScale: uv(M.glassDim) });
    B.add(M.bronze, grilleGeo(3, 2.3, { arch: true }), placeXY(fxw - side * 0.05, 3, 0, yaww));
    const sgn = M.sign(side < 0 ? 'WEST AVENUE  ·  DINING CONCOURSE  ·  SUBWAY' : 'MARKET AVENUE  ·  EAST BALCONY  ·  SUBWAY', { bg: '#2a1e10', fg: '#e8c56a', font: 'bold 52px Georgia, serif' });
    B.add(M.atlas, M.signGeo(sgn, 9, 0.45), mat4(fxw - side * 0.05, BAL_Y - 0.3, 0, 0, yaww, 0));
  }

  // ---- gold globe chandeliers (four at the ends, over the balconies) -----------------------------------------------
  for (const [gx, gz] of [[-37, -10.5], [-37, 10.5], [37, -10.5], [37, 10.5]]) globeChandelier(B, M, gx, 9.2, gz, 1.0);
  // ---- information booth + four-faced clock -------------------------------------------------------------
  {
    const r = 3.1;
    B.add(M.marble, new THREE.CylinderGeometry(r, r + 0.15, 1.1, 18), mat4(0, 0.55, 0), { uvScale: uv(M.marble) });
    { // glazing you can see into: warm-lit interior (counter, clerks, timetable racks) behind a tinted, reflective pane
      const c = document.createElement('canvas'); c.width = 1024; c.height = 128; const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#6b5434'); gr.addColorStop(0.55, '#c9a46a'); gr.addColorStop(0.72, '#3a2a1a'); gr.addColorStop(1, '#241a10'); g.fillStyle = gr; g.fillRect(0, 0, 1024, 128);
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(40,28,16,${0.25 + world.R() * 0.3})`; g.fillRect(world.R() * 1024, 8 + world.R() * 20, 6 + world.R() * 30, 30 + world.R() * 20); }   // racks
      for (let i = 0; i < 9; i++) { const x = 60 + i * 110 + world.R() * 40; g.fillStyle = '#1c150e'; g.beginPath(); g.ellipse(x, 58, 11, 13, 0, 0, 7); g.fill(); g.fillRect(x - 17, 70, 34, 30); }   // clerks behind the counter
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.6, r - 0.6, 1.5, 24, 1, true), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, color: 0xd8c8a8 }));
      inner.position.set(0, 1.85, 0); inner.name = 'boothInterior'; world.scene.add(inner);
      const pane = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.08, r - 0.08, 1.5, 36, 1, true), new THREE.MeshPhysicalMaterial({ color: 0x3a4148, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.38, envMapIntensity: 1.6, depthWrite: false }));
      pane.position.set(0, 1.85, 0); pane.name = 'boothGlass'; pane.userData.surface = 'glass'; world.scene.add(pane); world.ctx.raycastTargets.push(pane);
    }
    for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; B.box(M.brass, [-0.06, 1.1, -0.06], [0.06, 2.65, 0.06], { uvScale: 1 }); const g = B.parts.get(M.brass); const last = g[g.length - 1]; last.applyMatrix4(mat4(Math.cos(a) * r, 0, Math.sin(a) * r, 0, -a)); }
    B.add(M.brass, new THREE.CylinderGeometry(r + 0.25, r + 0.1, 0.25, 18), mat4(0, 2.75, 0));
    B.add(M.brass, new THREE.CylinderGeometry(r + 0.06, r + 0.06, 0.08, 18), mat4(0, 1.12, 0));
    for (let i = 0; i < 18; i++) { const a = (i + 0.5) / 18 * Math.PI * 2; B.add(M.brassDark, new THREE.BoxGeometry(0.05, 0.9, 0.5), mat4(Math.cos(a) * (r + 0.02), 0.6, Math.sin(a) * (r + 0.02), 0, -a)); }
    B.add(M.brass, new THREE.TorusGeometry(r * 0.6, 0.05, 8, 36), mat4(0, 3.5, 0, Math.PI / 2));
    B.add(M.brassDark, lathe([[r + 0.1, 0], [r - 0.3, 0.35], [r * 0.6, 0.62], [0.55, 0.85], [0.3, 0.9]], 36), mat4(0, 2.88, 0));
    // clock: pedestal, four opal faces, acorn finial
    B.add(M.brass, new THREE.CylinderGeometry(0.26, 0.36, 0.7, 16), mat4(0, 4.1, 0));
    B.add(M.brass, new THREE.BoxGeometry(0.95, 0.95, 0.95), mat4(0, 4.95, 0));
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; const fx = Math.sin(a) * 0.49, fz = Math.cos(a) * 0.49; B.add(M.clockFace, new THREE.CylinderGeometry(0.4, 0.4, 0.03, 32), mat4(fx, 4.95, fz, Math.PI / 2, a, 0)); B.add(M.brass, new THREE.TorusGeometry(0.42, 0.035, 8, 32), mat4(fx, 4.95, fz, 0, a, 0)); B.add(M.ironDark, new THREE.BoxGeometry(0.03, 0.3, 0.02), mat4(fx + Math.sin(a) * 0.02, 5.08, fz + Math.cos(a) * 0.02, 0, a, 0)); }
    B.add(M.brass, lathe([[0, 0], [0.14, 0.05], [0.19, 0.22], [0.1, 0.42], [0, 0.52]], 16), mat4(0, 5.43, 0));
    world.box([-r - 0.15, 0, -r - 0.15], [r + 0.15, 2.9, r + 0.15]);
    Z.booth = { x: 0, z: 0, r };
    world.termLamps.push([0, 4.4, 0]);
    // the "information" sign band
    const sgn = M.sign('INFORMATION', { bg: '#151515', fg: '#f0e2c0', w: 1024, h: 96, font: 'bold 64px Georgia, serif' });
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; B.add(M.atlas, M.signGeo(sgn, 2.4, 0.3), mat4(Math.sin(a) * (r + 0.27), 2.75, Math.cos(a) * (r + 0.27), 0, a, 0)); }
  }

  // ---- ticket offices along the south wall + departure boards ------------------------------------------------
  for (const side of [-1, 1]) {
    const x0 = Math.min(side * P.TICK_X0, side * P.TICK_X1), x1 = Math.max(side * P.TICK_X0, side * P.TICK_X1);
    B.box(M.marble, [x0, 0, P.TICK_Z0], [x1, P.TICK_H, Z1], { uvScale: uv(M.marble), collide: true });
    B.box(M.brassDark, [x0, P.TICK_H - 0.5, P.TICK_Z0 - 0.06], [x1, P.TICK_H, P.TICK_Z0 - 0.02], { uvScale: 1 });
    const sgn = M.sign('TICKETS   ·   REGIONAL RAIL   ·   TICKETS', { bg: '#1b1611', fg: '#e8c56a', font: 'bold 56px Georgia, serif' });
    B.add(M.atlas, M.signGeo(sgn, x1 - x0 - 0.4, 0.45), mat4((x0 + x1) / 2, P.TICK_H - 0.25, P.TICK_Z0 - 0.07, 0, Math.PI, 0));
    for (let x = x0 + 1.2; x < x1 - 0.8; x += 2.4) { B.add(M.bronze, grilleGeo(1.4, 1.5), mat4(x, 1.85, P.TICK_Z0 - 0.04, 0, Math.PI, 0)); B.box(M.darkGlass, [x - 0.7, 1.1, P.TICK_Z0 - 0.02], [x + 0.7, 2.6, P.TICK_Z0], { uvScale: 1 }); B.box(M.marbleDark, [x - 0.8, 0.95, P.TICK_Z0 - 0.35], [x + 0.8, 1.1, P.TICK_Z0], { uvScale: 1 }); }
    // departure board above (canvas emissive) framed in brass
    const bd = M.board(side < 0 ? 'DEPARTURES' : 'ARRIVALS');
    B.box(M.brassDark, [x0 + 1.5, 4.6, Z1 - 0.32], [x1 - 1.5, 9.2, Z1 - 0.05], { uvScale: 1 });
    B.add(bd, new THREE.PlaneGeometry(x1 - x0 - 3.4, 4.2), mat4((x0 + x1) / 2, 6.9, Z1 - 0.34, 0, Math.PI, 0));
    for (let i = 0; i < 3; i++) world.cover(x0 + 2 + i * (x1 - x0 - 4) / 2, P.TICK_Z0 - 0.7, 0, -1);
  }

  buildCoves(B, M);

  const meshes = B.flush((m) => (m === M.brass || m === M.brassDark || m === M.brassBezel || m === M.bronze || m === M.ironDark ? 'metal' : m === M.wood ? 'wood' : 'concrete'), { name: 'concourse' });
  return meshes;
}

/**
 * Cove lighting — the defining light of the hall (ref concourse_wide / concourse_east):
 * one continuous warm strip under every cornice, around every arch head and along every balcony front.
 * All strips merge into a single M.cove draw call; the wash itself comes from a handful of broad
 * point lights in lighting.js (coveWash) so the stone actually receives it.
 */
function buildCoves(B, M) {
  const { X0, X1, Z0, Z1, CORNICE, BAL_Y, BAL_X, WALL_T: T } = P;
  const strip = (min, max) => B.box(M.cove, min, max, { uvScale: 1 });
  /** Thin ribbon following an arc in a plane. axis 'x' = arc lies in the y/z plane (end walls). */
  const arc = (cx, cy, cz, r, axis, a0 = 0, a1 = Math.PI, segs = 26, t = 0.085) => {
    const pts = [];
    for (let i = 0; i <= segs; i++) { const a = a0 + (a1 - a0) * i / segs;
      pts.push(axis === 'x' ? new THREE.Vector3(cx, cy + Math.sin(a) * r, cz + Math.cos(a) * r)
                            : new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz)); }
    B.add(M.cove, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs, t, 4, false), null, { uvScale: 1 });
  };

  // 1. main cornice, long walls — tucked under the projecting molding, washing down the stone
  for (const [zi, zo] of [[Z1 - 0.58, Z1 - 0.30], [Z0 + 0.30, Z0 + 0.58]]) strip([X0 - T, CORNICE - 1.80, Math.min(zi, zo)], [X1 + T, CORNICE - 1.64, Math.max(zi, zo)]);
  // 2. end walls — the line follows the vault edge round the great lunette
  for (const side of [-1, 1]) {
    const bx = side < 0 ? X0 + 1.9 : X1 - 1.9; const pts = [];
    for (let i = 0; i <= 34; i++) { const z = Z0 + (Z1 - Z0) * i / 34; pts.push(new THREE.Vector3(bx, vaultY(z) - 1.55, z)); }
    B.add(M.cove, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 34, 0.085, 4, false), null, { uvScale: 1 });
    // 3. arch head of each of the three great windows (r 4.5 opening → strip at 5.05) + springing line
    const fx = side < 0 ? X0 + 0.45 : X1 - 0.45;
    for (const cz of [-12.5, 0, 12.5]) {
      arc(fx, 24.5, cz, 5.05, 'x', 0, Math.PI, 22);
      strip([Math.min(fx, fx + 0.14), 24.35, cz - 5.1], [Math.max(fx, fx + 0.14), 24.5, cz - 4.98]);
      strip([Math.min(fx, fx + 0.14), 24.35, cz + 4.98], [Math.max(fx, fx + 0.14), 24.5, cz + 5.1]);
    }
  }
  // 4. clerestory arch heads, south + north walls (5 each, opening r 3.2 → strip at 3.75)
  for (const zf of [Z1 - 0.42, Z0 + 0.42]) for (const cx of [-24, -12, 0, 12, 24]) arc(cx, 18.3, zf, 3.75, 'z', 0, Math.PI, 18);
  // 5. frieze line over the balcony arcade (continuous, under the existing bulb dots)
  for (const [zi, zo] of [[Z1 - 0.80, Z1 - 0.62], [Z0 + 0.62, Z0 + 0.80]]) strip([X0, BAL_Y + 4.50, Math.min(zi, zo)], [X1, BAL_Y + 4.64, Math.max(zi, zo)]);
  // 6. balcony fronts + undersides (W/E full depth, north strip)
  for (const side of [-1, 1]) {
    const fx = side * BAL_X;
    strip([Math.min(fx, fx - side * 0.14), BAL_Y - 0.74, Z0], [Math.max(fx, fx - side * 0.14), BAL_Y - 0.60, Z1]);       // fascia line
    strip([Math.min(fx - side * 0.5, fx - side * 0.9), BAL_Y - 0.93, Z0], [Math.max(fx - side * 0.5, fx - side * 0.9), BAL_Y - 0.86, Z1]); // soffit wash over the arcade
  }
  strip([-BAL_X, BAL_Y - 0.74, P.BAL_NZ - 0.14], [BAL_X, BAL_Y - 0.60, P.BAL_NZ]);
  strip([-BAL_X, BAL_Y - 0.93, P.BAL_NZ + 0.5], [BAL_X, BAL_Y - 0.86, P.BAL_NZ + 0.9]);
}

// ---- helpers ------------------------------------------------------------------------------------------------
export function globeChandelier(B, M, x, y, z, s = 1) {
  B.add(M.brass, new THREE.CylinderGeometry(0.03, 0.03, 3.4, 6), mat4(x, y + 1.7 + 1.1 * s, z));
  B.add(M.brass, new THREE.TorusGeometry(1.05 * s, 0.05 * s, 8, 32), mat4(x, y, z, Math.PI / 2));
  B.add(M.brass, new THREE.TorusGeometry(0.75 * s, 0.045 * s, 8, 28), mat4(x, y + 0.65 * s, z, Math.PI / 2));
  B.add(M.brass, new THREE.TorusGeometry(0.75 * s, 0.045 * s, 8, 28), mat4(x, y - 0.65 * s, z, Math.PI / 2));
  for (let ring = 0; ring < 3; ring++) { const yy = y + (ring - 1) * 0.55 * s, rr = (ring === 1 ? 1.05 : 0.8) * s; const n = ring === 1 ? 16 : 10; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; B.add(M.lampGlass, new THREE.SphereGeometry(0.11 * s, 8, 6), mat4(x + Math.cos(a) * rr, yy, z + Math.sin(a) * rr)); } }
  B.add(M.lampGlass, new THREE.SphereGeometry(0.3 * s, 12, 8), mat4(x, y, z));
  B.add(M.brass, new THREE.SphereGeometry(0.16 * s, 10, 8), mat4(x, y - 1.15 * s, z));
}
export function archShapeAt(cx, y0, w, h) { const s = new THREE.Shape(); const r = w / 2, yc = y0 + h - r; s.moveTo(cx - r, y0); s.lineTo(cx + r, y0); s.lineTo(cx + r, yc); s.absarc(cx, yc, r, 0, Math.PI, false); s.lineTo(cx - r, y0); s.closePath(); return s; }

/** Bronze grille: lattice of thin bars filling w×h (base at y=0 local, centered on x), optional arched top. */
export function grilleGeo(w, h, { arch = false, pitch = 0.32 } = {}) {
  const geos = []; const r = w / 2; const bar = 0.035;
  const topAt = (x) => arch ? (h - r + Math.sqrt(Math.max(0, r * r - x * x))) : h;
  for (let x = -r + pitch / 2; x < r; x += pitch) { const t = topAt(x); const g = new THREE.BoxGeometry(bar, t, bar); g.translate(x, t / 2, 0); geos.push(g); }
  for (let y = pitch / 2; y < h; y += pitch) { const g = new THREE.BoxGeometry(w, bar, bar); g.translate(0, y, 0); geos.push(g); }
  const g = new THREE.BoxGeometry(w, 0.12, 0.08); g.translate(0, 1.0, 0); geos.push(g); // mid rail
  const out = mergeGeos(geos); return out;
}
function mergeGeos(geos) { const ng = geos.map(g => g.index ? g.toNonIndexed() : g); let total = 0; for (const g of ng) total += g.attributes.position.count; const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2); let off = 0; for (const g of ng) { pos.set(g.attributes.position.array, off * 3); nor.set(g.attributes.normal.array, off * 3); uv.set(g.attributes.uv.array, off * 2); off += g.attributes.position.count; } const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return out; }

/** Sloped parapet (box whose top follows from→to). axis: 'x' if it runs along x, 'z' along z. thickness t, height h above the slope. */
export function slopedParapet(B, world, mat, from, to, t, h, axis = null) {
  axis = axis || (Math.abs(to[0] - from[0]) > Math.abs(to[2] - from[2]) ? 'x' : 'z');
  const p = []; const push = (x, y, z) => p.push(x, y, z);
  const y0a = from[1] - 0.05, y1a = from[1] + h, y0b = to[1] - 0.05, y1b = to[1] + h;
  const base = Math.min(from[1], to[1]) - 3.5; // extend below to hide the stair mass edge
  if (axis === 'x') {
    const z0 = from[2] - t / 2, z1 = from[2] + t / 2, xa = from[0], xb = to[0];
    const v = [[xa, base, z0], [xb, base, z0], [xb, y1b, z0], [xa, y1a, z0], [xa, base, z1], [xb, base, z1], [xb, y1b, z1], [xa, y1a, z1]];
    boxFaces(v, push);
  } else {
    const x0 = from[0] - t / 2, x1 = from[0] + t / 2, za = from[2], zb = to[2];
    const v = [[x0, base, za], [x0, base, zb], [x0, y1b, zb], [x0, y1a, za], [x1, base, za], [x1, base, zb], [x1, y1b, zb], [x1, y1a, za]];
    boxFaces(v, push);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals();
  B.add(mat, g, null, { uvScale: mat.userData.uv ?? 0.5 });
  void y0a; void y0b;
}
function boxFaces(v, push) {
  const q = (a, b, c, d) => { for (const i of [a, c, b, a, d, c]) push(...v[i]); };
  q(0, 1, 2, 3); q(5, 4, 7, 6); q(4, 0, 3, 7); q(1, 5, 6, 2); q(3, 2, 6, 7); q(4, 5, 1, 0);
}
