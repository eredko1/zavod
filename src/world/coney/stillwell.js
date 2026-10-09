// CONEY — Coney Island–Stillwell Avenue terminal, walkable, at its OSM footprint (x −88…−24 between Stillwell Ave and
// W 12th St; the south face on the Mermaid Ave bus loop). Street level: the white terracotta head house with three doorways
// (+ one on Stillwell Ave), a concourse with the fare line (turnstiles you walk through, token booth, MetroCard machines) and a
// stair bank up to each of the four island platforms. Platform level (7.5 m top of rail, 8.6 m platform): the OSM islands,
// seven tracks, yellow edges, the arched steel train shed with its solar barrel roof, route-bullet signs. Trains: parked D / N /
// Q sets, and F / Q trains that pull in, dwell and pull out on the wall clock (every client sees the same train) — don't stand
// on the tracks. Mercs chase you up the stairs (nav floors are the walkables). CONEY agent.
import * as THREE from 'three';
import { Batch } from '../sbu/geo.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeR160 } from './r160.js';

export const SURF_HH = { x0: -72, x1: -41.5, z: -144 };   // the Surf Ave head house + concourse (x0..x1, from the Surf front at z back to the old head house)
// the bus loop under the el, east of the head house: in off Surf Ave, round the bays and back out (B36 / B68 / B74 terminate here)
export const BUS_LOOP = [[-35, -124], [-35, -212], [-33.5, -224], [-28, -231], [-22.5, -224], [-21, -212], [-21, -121]];
/** OSM blocks the station takes over: the Surf Ave head house and the bus loop (city.js / fronts.js leave them out) */
export const stationClear = (x, z) => (x > SURF_HH.x0 - 1 && x < SURF_HH.x1 + 1 && z > -200 && z < SURF_HH.z + 1) || (x > -42 && x < -10 && z > -186 && z < -138);
let loopAdded = false;
/** put the bus loop in the street network before anything reads it (city.js paints it, traffic.js drives it) */
export function addBusLoop(OSM) { if (loopAdded || OSM.r.some((r) => r.busLoop)) return; loopAdded = true; OSM.r.push({ p: BUS_LOOP.map((q) => q.slice()), w: 9, busLoop: true }); }
export const STILLWELL = { x0: -88, x1: -24, zS: -258, zC: -300, zP0: -266, zP1: -440, RAIL: 7.5, DECK_B: 6.8, DECK_T: 7.3, PLAT: 8.6 };
const ISLANDS = [[-82, -74], [-68, -60], [-53, -46], [-38, -29]];
const TRACKS = [   // track 2 was an 'F' too: its shuttle train (not rideable) sent players to the wrong island — the rideable F is x −54.8 (coney/subway.js)
  { x: -83.8, r: 'D' }, { x: -71, r: 'D' }, { x: -58.2, r: 'D' }, { x: -54.8, r: 'F' }, { x: -44, r: 'Q' }, { x: -40, r: 'Q' }, { x: -27.2, r: 'N' }];
const ROUTE = { D: '#ff6319', F: '#ff6319', N: '#fccc0a', Q: '#fccc0a' };
const STAIR = { z0: -276, run: 13.4, w: 3.0 }, CAR = 18.4, NCAR = 8;

export function buildStillwell(world, M) {
  const { scene, ctx, W } = world; const S = STILLWELL, B = new Batch(world, M, 'stillwell');
  // matte platform concrete + brushed turnstile steel (the shared greys are glossy: SSR mirrored the solar roof in them)
  if (!M.edgeYellow) { M.edgeYellow = new THREE.MeshStandardMaterial({ color: 0xf2c418, roughness: 0.7 }); M.surface.edgeYellow = 'concrete'; }
  if (!M.stwCeil) { M.stwCeil = new THREE.MeshStandardMaterial({ color: 0x5d6b62, roughness: 0.8, metalness: 0.2, emissive: 0x1a221d, emissiveIntensity: 1 }); M.surface.stwCeil = 'metal'; }   // plain painted deck underside (the tie texture moiréd)
  if (!M.stwPlat) { M.stwPlat = new THREE.MeshStandardMaterial({ color: 0xa3a39c, roughness: 0.93, metalness: 0 }); M.surface.stwPlat = 'concrete'; M.stwTurn = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.35, metalness: 0.9 }); M.surface.stwTurn = 'metal'; }
  const w = S.x1 - S.x0, sTop = STAIR.z0 - STAIR.run, cxs = ISLANDS.map(([a, b]) => (a + b) / 2);
  const inStair = (x0, x1) => cxs.some((c) => x1 > c - STAIR.w / 2 - 0.1 && x0 < c + STAIR.w / 2 + 0.1);
  // ---- head house: south facade with 3 doorways (5 m wide, 3.2 m), terracotta, arched windows above -------------------------
  const DOORS = [[-72, -67], [-58.5, -53.5], [-45, -40]], FT = 0.8, fz = S.zS;
  { let x = S.x0; for (const [a, b] of [...DOORS, [S.x1, S.x1]]) { if (a > x) B.box('terracotta', [x, 0, fz - FT], [a, 11, fz]); x = b; }
    for (const [a, b] of DOORS) { B.box('terracotta', [a, 3.2, fz - FT], [b, 11, fz]); B.box('steelDark', [a, 3.1, fz - FT - 0.05], [b, 3.25, fz + 0.05], { collide: false }); } }
  for (let x = S.x0 + 3; x < S.x1 - 3; x += 6) { B.box('glassLight', [x, 4.2, fz + 0.01], [x + 4, 9.4, fz + 0.06], { collide: false }); B.cyl('terracotta', x + 2, fz + 0.05, 9.4, 9.6, 2.05, 16); for (let k = 1; k < 7; k++) B.box('wheelBrown', [x + k * 0.6 - 0.03, 4.2, fz + 0.07], [x + k * 0.6 + 0.03, 9.4, fz + 0.1], { collide: false }); }
  B.box('terracotta', [S.x0 - 0.3, 11, fz - 0.3], [S.x1 + 0.3, 11.8, fz + 0.4]);
  for (let x = S.x0; x < S.x1; x += 0.4) B.box('bulb', [x, 11.85, fz + 0.38], [x + 0.08, 11.93, fz + 0.46], { collide: false });
  sign(scene, 'CONEY ISLAND · STILLWELL AV', (S.x0 + S.x1) / 2, 10.3, fz + 0.12, 0, 22, 1.1, '#111', '#fff');
  for (const [a, b] of DOORS) sign(scene, 'SUBWAY', (a + b) / 2, 3.65, fz + 0.12, 0, 2.6, 0.45, '#0b3d23', '#fff');
  // ---- the Surf Ave head house (like the real station: the street front is on Surf, the trains run in over it): a low white
  // terracotta front with three doorways, the name and arched windows, and a covered concourse under the el back to the doors
  // above and the fare line; a side door onto the bus loop. Kept under the el's cap girders (6.2 m). city.js leaves the OSM
  // block here to us and keeps the el columns out of it.
  { const X0 = SURF_HH.x0, X1 = SURF_HH.x1, HF = SURF_HH.z, H = 6.0, D2 = [[-67, -62], [-58, -53], [-49, -44]];
    let x = X0; for (const [a, b] of [...D2, [X1, X1]]) { if (a > x) B.box('terracotta', [x, 0, HF - FT], [a, H, HF]); x = b; }
    for (const [a, b] of D2) { B.box('terracotta', [a, 3.4, HF - FT], [b, H, HF]); B.box('steelDark', [a, 3.3, HF - FT - 0.05], [b, 3.45, HF + 0.05], { collide: false }); sign(scene, 'SUBWAY', (a + b) / 2, 3.85, HF + 0.12, 0, 2.6, 0.42, '#0b3d23', '#fff'); }
    for (const [a, b] of [[X0 + 1, D2[0][0] - 0.8], [D2[0][1] + 0.8, D2[1][0] - 0.8], [D2[1][1] + 0.8, D2[2][0] - 0.8], [D2[2][1] + 0.8, X1 - 1]]) if (b - a > 1.2) B.box('glassLight', [a, 1.0, HF + 0.01], [b, 3.0, HF + 0.06], { collide: false });
    B.box('terracotta', [X0 - 0.3, H, HF - 0.3], [X1 + 0.3, H + 0.45, HF + 0.4]);
    for (let xx = X0; xx < X1; xx += 0.4) B.box('bulb', [xx, H + 0.5, HF + 0.38], [xx + 0.08, H + 0.58, HF + 0.46], { collide: false });
    sign(scene, 'CONEY ISLAND · STILLWELL AV', (X0 + X1) / 2, 4.75, HF + 0.12, 0, 24, 1.0, '#111', '#fff');
    // the concourse walls: east solid, west with the bus-loop door; a roof under the el; tiled wainscot, light strips, columns
    B.box('terracotta', [X1 - 0.6, 0, fz], [X1, H, HF]);
    B.box('terracotta', [X0, 0, -244], [X0 + 0.6, H, HF]); B.box('terracotta', [X0, 0, fz], [X0 + 0.6, H, -253]); B.box('terracotta', [X0, 3.3, -253], [X0 + 0.6, H, -244]);
    sign(scene, 'SUBWAY', X0 - 0.05, 3.75, -248.5, -Math.PI / 2, 2.6, 0.42, '#0b3d23', '#fff');
    B.box('concreteGrey', [X0, H, fz], [X1, H + 0.25, HF]);
    for (const [a, b] of [[X0 + 0.6, X0 + 0.64], [X1 - 0.64, X1 - 0.6]]) { B.box('ssTile', [a, 0, fz], [b, 2.4, HF - FT], { collide: false }); B.box('ssBlue', [a - 0.005, 2.4, fz], [b + 0.005, 2.55, HF - FT], { collide: false }); }
    for (let z = HF - 5; z > fz + 3; z -= 7) { B.box('bulb', [-63, H - 0.08, z], [-60, H - 0.02, z + 0.25], { collide: false }); B.box('bulb', [-51, H - 0.08, z], [-48, H - 0.02, z + 0.25], { collide: false }); }
    for (let z = HF - 14; z > fz + 6; z -= 14) for (const cx of [-62.5, -48.5]) B.box('steelDark', [cx - 0.3, 0, z - 0.3], [cx + 0.3, H, z + 0.3]);
    SURF_HH.floor = { x0: X0 + 0.6, x1: X1 - 0.6, z0: fz, z1: HF - FT };
    // the bus bays: a kerbed island between the loop's two lanes, two shelters, the terminal sign
    B.box('curb', [-30.4, 0, -214], [-25.6, 0.16, -141], { walkable: true });
    for (const z of [-200, -172]) { B.box('steelDark', [-29.4, 0, z], [-29.25, 2.6, z + 0.15]); B.box('steelDark', [-26.75, 0, z], [-26.6, 2.6, z + 0.15]); B.box('steelDark', [-29.4, 0, z + 7.85], [-29.25, 2.6, z + 8]); B.box('steelDark', [-26.75, 0, z + 7.85], [-26.6, 2.6, z + 8]);
      B.box('glassLight', [-29.4, 2.6, z], [-26.6, 2.7, z + 8], { collide: false }); B.box('glassLight', [-27.6, 0.3, z], [-27.55, 2.3, z + 8], { collide: false }); B.box('steelDark', [-28.6, 0.42, z + 2], [-28.1, 0.5, z + 6]); }
    sign(scene, 'BUS · B36 B68 B74', -28, 3.4, -165.9, 0, 4.2, 0.5, '#1f4fa8', '#fff');
  }
  // side walls (Stillwell Ave entrance on the west), north wall of the concourse
  B.box('terracotta', [S.x0, 0, S.zC], [S.x0 + 0.6, S.DECK_B, -277]); B.box('terracotta', [S.x0, 0, -271], [S.x0 + 0.6, S.DECK_B, fz]); B.box('terracotta', [S.x0, 3.2, -277], [S.x0 + 0.6, S.DECK_B, -271]);
  sign(scene, 'SUBWAY', S.x0 - 0.05, 3.65, -274, -Math.PI / 2, 2.6, 0.45, '#0b3d23', '#fff');
  B.box('terracotta', [S.x1 - 0.6, 0, S.zC], [S.x1, S.DECK_B, fz]);
  B.box('ssTile', [S.x0, 0, S.zC - 0.6], [S.x1, S.DECK_B, S.zC]);
  // concourse: terrazzo floor, ceiling (the deck underside) with light strips
  { // terrazzo: warm grey chips in a cement matrix, brass divider strips every 1.5 m (one plane, tiled texture)
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#b9b2a4'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) { const r = Math.random(); g.fillStyle = r < 0.35 ? '#8c8578' : r < 0.6 ? '#d8d2c4' : r < 0.75 ? '#6f6a60' : r < 0.85 ? '#a38c6c' : '#e9e5da'; const sz = 1 + Math.random() * 3.2; g.fillRect(Math.random() * 256, Math.random() * 256, sz, sz * (0.6 + Math.random() * 0.8)); }
    g.fillStyle = '#b08a3a'; g.fillRect(0, 0, 256, 3); g.fillRect(0, 0, 3, 256);   // brass strips
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const fw = S.x1 - S.x0, fd = (fz - FT) - S.zC; t.repeat.set(fw / 1.5, fd / 1.5);
    const fm = new THREE.MeshStandardMaterial({ map: t, roughness: 0.42, metalness: 0 }), fl = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd), fm);
    { const q = SURF_HH.floor, t2 = t.clone(); t2.repeat.set((q.x1 - q.x0) / 1.5, (q.z1 - q.z0) / 1.5); t2.needsUpdate = true; const f2 = new THREE.Mesh(new THREE.PlaneGeometry(q.x1 - q.x0, q.z1 - q.z0), new THREE.MeshStandardMaterial({ map: t2, roughness: 0.42 })); f2.rotation.x = -Math.PI / 2; f2.position.set((q.x0 + q.x1) / 2, 0.026, (q.z0 + q.z1) / 2); f2.receiveShadow = true; f2.userData.surface = 'concrete'; scene.add(f2); }
    fl.rotation.x = -Math.PI / 2; fl.position.set((S.x0 + S.x1) / 2, 0.025, (S.zC + fz - FT) / 2); fl.receiveShadow = true; fl.userData.surface = 'concrete'; scene.add(fl);
  }
  // white subway-tile wainscot on the inside of the concourse walls, with a green cap band
  for (const [x0, x1, z0, z1] of [[S.x0 + 0.6, S.x0 + 0.64, S.zC, fz - FT], [S.x1 - 0.64, S.x1 - 0.6, S.zC, fz - FT], [S.x0 + 0.6, S.x1 - 0.6, fz - FT - 0.04, fz - FT]]) {
    B.box('ssTile', [x0, 0, z0], [x1, 2.4, z1], { collide: false }); B.box('ssBlue', [x0 - 0.005, 2.4, z0], [x1 + 0.005, 2.55, z1], { collide: false }); }
  for (let z = fz - 4; z > S.zC + 2; z -= 6) for (let x = S.x0 + 6; x < S.x1 - 4; x += 10) B.box('bulb', [x, S.DECK_B - 0.08, z], [x + 3.2, S.DECK_B - 0.02, z + 0.25], { collide: false });
  // fare line at z −270: a fare wall with turnstile gaps (walk through, like the real ones) between x −66 and −42
  { const Z0 = -270.4, Z1 = -269.6; let x = S.x0 + 0.6;
    for (let tx = -66; tx < -42; tx += 2.2) { if (tx > x) { B.box('stwTurn', [x, 0, Z0], [tx, 1.0, Z1]); } B.box('railSteel', [tx, 0, Z0 + 0.1], [tx + 0.35, 1.05, Z1 - 0.1]); x = tx + 1.3;
      // the turnstile itself: hub on the cabinet side, three arms (one across the gap), a lit MetroCard reader on top
      B.cyl('railSteel', tx + 0.42, -270, 0.82, 0.98, 0.09, 12, { collide: false });
      for (const [dy, dz, len] of [[0, 0, 0.55], [0.22, -0.2, 0.3], [-0.22, 0.2, 0.3]]) B.box('railSteel', [tx + 0.42, 0.88 + dy, -270 + dz - 0.02], [tx + 0.42 + len, 0.92 + dy, -270 + dz + 0.02], { collide: false });
      B.box('ssBlue', [tx + 0.05, 1.05, -270.25], [tx + 0.3, 1.12, -269.75], { collide: false }); B.box('bulb', [tx + 0.12, 1.12, -270.05], [tx + 0.22, 1.15, -269.95], { collide: false }); }
    B.box('stwTurn', [x, 0, Z0], [S.x1 - 0.6, 1.0, Z1]); }
  B.box('fascia', [-36, 0, -265.5], [-30, 2.6, -262.5]); B.box('glassDark', [-36.05, 1.1, -262.55], [-30.05, 2.3, -262.45], { collide: false });   // token booth
  sign(scene, 'TOKEN BOOTH', -33, 2.85, -262.4, 0, 3.4, 0.4, '#111', '#fff');
  for (const x of [-84, -82, -80]) { B.box('ssBlue', [x, 0, -262], [x + 1.2, 1.9, -261.2]); }   // MetroCard machines
  sign(scene, 'D  F  N  Q  ·  TO ALL TRAINS  ↑', -54, 4.6, -270, 0, 12, 0.7, '#111', '#fff');
  // ---- stairs: one bank per island, from the concourse (z −276) north up to the platform (8.6 m) -----------------------------
  for (const cx of cxs) {
    B.stairs('concreteGrey', { x: cx, z: STAIR.z0, y0: 0, rise: S.PLAT, run: STAIR.run, width: STAIR.w, axis: 'z', dir: -1, n: 46, walkable: true, base: 0 });
    for (const s of [-1, 1]) { const x = cx + s * (STAIR.w / 2 + 0.12); B.box('ssTile', [x - 0.12, 0, sTop], [x + 0.12, S.PLAT + 1.05, STAIR.z0]); }   // stair walls, up through the platform as a railing
    B.box('railSteel', [cx - STAIR.w / 2 - 0.25, S.PLAT, STAIR.z0 - 0.12], [cx + STAIR.w / 2 + 0.25, S.PLAT + 1.05, STAIR.z0 + 0.12]);   // end railing at the top of the well
  }
  // ---- deck (trackbed) + island platforms, with the stair wells cut out --------------------------------------------------------
  const zDeck0 = fz - FT, zDeck1 = S.zP1 - 2;
  const slabs = (x0, x1, y0, y1, key, zA, zB) => {   // a slab from zA (south) to zB (north), cut around the stair wells
    const cuts = cxs.filter((c) => c + STAIR.w / 2 > x0 && c - STAIR.w / 2 < x1);
    const piece = (za, zb, xa, xb) => { if (za - zb < 0.05 || xb - xa < 0.05) return; B.box(key, [xa, y0, zb], [xb, y1, za], { walkable: true }); };
    if (!cuts.length) return piece(zA, zB, x0, x1);
    piece(zA, STAIR.z0, x0, x1); piece(sTop, zB, x0, x1);
    let x = x0; for (const c of cuts) { piece(STAIR.z0, sTop, x, c - STAIR.w / 2); x = c + STAIR.w / 2; } piece(STAIR.z0, sTop, x, x1);
  };
  slabs(S.x0, S.x1, S.DECK_B, S.DECK_T, 'stwCeil', zDeck0, zDeck1);
  for (const [a, b] of ISLANDS) {
    slabs(a, b, S.DECK_T, S.PLAT, 'stwPlat', S.zP0, S.zP1);
    for (const e of [a, b]) { const s = e === a ? 1 : -1; B.box('edgeYellow', [Math.min(e, e + s * 0.6), S.PLAT, S.zP1], [Math.max(e, e + s * 0.6), S.PLAT + 0.012, S.zP0], { collide: false }); }   // yellow edge strips
    for (let z = S.zP0 - 8; z > S.zP1 + 4; z -= 12) { if (z < STAIR.z0 + 2 && z > sTop - 2) continue; B.box('railSteelGreen', [(a + b) / 2 - 0.25, S.PLAT, z - 0.25], [(a + b) / 2 + 0.25, 14.5, z + 0.25]); }   // platform columns
    for (let z = S.zP0 - 14; z > S.zP1 + 10; z -= 36) sign(scene, 'Coney Island – Stillwell Av', (a + b) / 2, S.PLAT + 3.2, z, Math.PI / 2, 5.2, 0.55, '#111', '#fff', true);
  }
  // rails
  for (const t of TRACKS) for (const s of [-0.72, 0.72]) B.box('steel', [t.x + s - 0.04, S.DECK_T, S.zP1 - 1], [t.x + s + 0.04, S.RAIL, zDeck0], { collide: false });
  // route bullets above each track at the south end
  for (const t of TRACKS) bullet(scene, t.r, ROUTE[t.r], t.x, S.PLAT + 3.4, S.zP0 - 1);
  // ---- the train shed: steel arches on the platform columns, solar barrel roof (the old terminal() shell, now over real platforms)
  const Y = S.RAIL, zr0 = S.zP1 + 34, zr1 = S.zP0;   // shed from the platforms' south end to −406 (OSM building)
  for (let z = zr0 + 4; z < zr1; z += 12) for (let k = 0; k < 12; k++) {
    const a0 = k / 12 * Math.PI, a1 = (k + 1) / 12 * Math.PI, R0 = w / 2; const p0 = [S.x0 + w / 2 - Math.cos(a0) * R0, Y + 1.1 + Math.sin(a0) * 9 + 5], p1 = [S.x0 + w / 2 - Math.cos(a1) * R0, Y + 1.1 + Math.sin(a1) * 9 + 5];
    const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); const g = new THREE.BoxGeometry(L, 0.6, 0.5); g.rotateZ(Math.atan2(p1[1] - p0[1], p1[0] - p0[0])); g.translate((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, z); B.add('railSteelGreen', g, { uv: false });
  }
  for (const x of [S.x0 + 0.3, S.x1 - 0.3]) for (let z = zr0 + 4; z < zr1; z += 12) B.box('railSteelGreen', [x - 0.3, S.PLAT, z - 0.3], [x + 0.3, Y + 6.1, z + 0.3]);
  { // solar barrel roof: panels following the arch ribs (12 facets across, the full shed length)
    const tex = solarTex(); tex.repeat.set(1, 14); const mat = new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.3, metalness: 0.6, side: THREE.DoubleSide, name: 'shedRoof' });
    const geos = []; const L = zr1 - zr0, R0 = w / 2 + 0.3;
    for (let k = 0; k < 12; k++) { const a0 = k / 12 * Math.PI, a1 = (k + 1) / 12 * Math.PI; const p0 = [S.x0 + w / 2 - Math.cos(a0) * R0, Y + 1.4 + Math.sin(a0) * 9 + 5], p1 = [S.x0 + w / 2 - Math.cos(a1) * R0, Y + 1.4 + Math.sin(a1) * 9 + 5];
      const sw = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); const g = new THREE.PlaneGeometry(sw, L); g.rotateX(-Math.PI / 2); g.rotateZ(Math.atan2(p1[1] - p0[1], p1[0] - p0[0])); g.translate((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (zr0 + zr1) / 2); geos.push(g); }
    const rm = new THREE.Mesh(mergeGeometries(geos), mat); rm.castShadow = true; rm.receiveShadow = true; scene.add(rm); }
  // columns under the deck (north of the concourse), open arcade
  for (let z = S.zC - 8; z > S.zP1; z -= 12) for (const t of TRACKS) B.box('railSteelGreen', [t.x - 0.3, 0, z - 0.3], [t.x + 0.3, S.DECK_B, z + 0.3]);
  B.flush({ shadow: true });
  // ---- trains ---------------------------------------------------------------------------------------------------------------
  buildTrains(world, M);
  W.stillwell = { concourse: new THREE.Vector3(-56, 0, -264), platform: new THREE.Vector3(cxs[1], S.PLAT, -320), stairs: cxs.map((c) => new THREE.Vector3(c, 0, STAIR.z0 + 1)) };
  for (let x = S.x0 + 4; x < S.x1 - 4; x += 8) world.cover(x, fz + 1.2, 0, 1);
}

// ---------------------------------------------------------------------------------------------------------------------------
function buildTrains(world, M) {
  const { scene, ctx } = world; const S = STILLWELL;
  // the parked sets are the same R160 as the running trains (coney/r160.js): one car built, merged per material, instanced
  const PARKED = ctx.lite ? [6] : [0, 6], MOVING = [];   // phones: one parked set   // track indices (the D on track 2, the F on 3, the N on track 4 and the Q on 5 run: coney/subway.js)
  const total = (PARKED.length + MOVING.length) * NCAR, tmp = new THREE.Group();
  const kit = makeR160(tmp, { CAR, NCAR: 1, FLOOR: S.PLAT - S.RAIL, DOORZ: [-6.2, -2.1, 2.1, 6.2], lite: !!ctx.lite, route: { id: 'D', color: '#ff6319', fg: '#fff' } });
  const byMat = new Map(); const car0 = kit.cars[0]; car0.updateMatrixWorld(true);
  car0.traverse((o) => { if (!o.isMesh) return; const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); (byMat.get(o.material) || byMat.set(o.material, []).get(o.material)).push(g); });
  const I = {}; let n = 0; for (const [m, list] of byMat) { const g = mergeGeometries(list, false); if (!g) continue; const im = new THREE.InstancedMesh(g, m, total); im.castShadow = !m.transparent; im.receiveShadow = true; im.frustumCulled = false; im.name = 'stwParked'; scene.add(im); I['m' + n++] = im; }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  const place = (k, x, zFront) => { for (let c = 0; c < NCAR; c++) { p.set(x, S.RAIL, zFront - CAR / 2 - c * CAR); m4.compose(p, q, one); for (const im of Object.values(I)) im.setMatrixAt(k * NCAR + c, m4); } };
  let k = 0;
  for (const ti of PARKED) { const x = TRACKS[ti].x; place(k++, x, S.zP0 - 2); world.box([x - 1.55, S.DECK_T, S.zP0 - 2 - NCAR * CAR], [x + 1.55, S.RAIL + 3.9, S.zP0 - 2]); }
  for (const im of Object.values(I)) im.instanceMatrix.needsUpdate = true;
  // moving trains: 150 s cycle — pull in from the north (30 s), dwell 45 s, pull out (30 s), gone 45 s. Wall clock → shared.
  const CYC = 150, IN = 30, DW = 45, OUT = 30, STOP = S.zP0 - 2, FAR = -900;
  const mov = MOVING.map((m) => ({ ...m, k: k++, x: TRACKS[m.i].x, z: FAR, v: 0 }));
  const ease = (t) => 1 - (1 - t) * (1 - t);
  world.updaters.push((dt) => {
    const t = Date.now() / 1000; let dirty = false;
    for (const m of mov) {
      const ph = ((t + m.off) % CYC + CYC) % CYC; let z;
      if (ph < IN) z = FAR + (STOP - FAR) * ease(ph / IN); else if (ph < IN + DW) z = STOP; else if (ph < IN + DW + OUT) { const u = (ph - IN - DW) / OUT; z = STOP + (FAR - STOP) * u * u; } else z = FAR - 400;
      m.v = dt > 0 ? Math.abs(z - m.z) / dt : 0; if (z !== m.z) { m.z = z; place(m.k, m.x, z); dirty = true; }
      // standing on the tracks when it comes through: that's it for you
      const me = ctx.player; if (me && !me.dead && m.v > 1.5 && Math.abs(me.position.x - m.x) < 1.7 && me.position.y > S.DECK_T - 0.5 && me.position.y < S.RAIL + 3 && me.position.z < z + 1 && me.position.z > z - NCAR * CAR) { ctx.deathNote = { text: 'hit by a Coney-bound train', at: performance.now() }; me.damage?.(500, new THREE.Vector3(m.x, S.RAIL + 1, z)); ctx.hud?.toast?.('Hit by the train. Stay off the tracks.', 2600); }
    }
    if (dirty) for (const im of Object.values(I)) im.instanceMatrix.needsUpdate = true;
  });
  // arrival announcements when you're in the station
  let said = {}; world.updaters.push(() => { const me = ctx.player?.position; if (!me || me.z > S.zS || me.z < S.zP1 || me.x < S.x0 || me.x > S.x1) return; const t = Date.now() / 1000; for (const m of mov) { const ph = ((t + m.off) % CYC + CYC) % CYC, key = Math.floor((t + m.off) / CYC) + ':' + m.i; if (ph > IN - 6 && ph < IN - 5 && !said[key]) { said[key] = 1; ctx.hud?.toast?.(`🚇 ${TRACKS[m.i].r} train arriving — stand clear of the platform edge`, 2600); } } });
}
function mergeBoxes(list) { const out = new THREE.BufferGeometry(); const pos = [], nor = [], idx = []; let o = 0; for (const g of list) { const gp = g.attributes.position, gn = g.attributes.normal; for (let i = 0; i < gp.count; i++) { pos.push(gp.getX(i), gp.getY(i), gp.getZ(i)); nor.push(gn.getX(i), gn.getY(i), gn.getZ(i)); } for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + o); o += gp.count; } out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setIndex(idx); return out; }

// ---------------------------------------------------------------------------------------------------------------------------
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
function sign(scene, text, x, y, z, yaw, w, h, bg, fg, twoSided = false) {
  const t = canvasTex(1024, Math.round(1024 * h / w), (g, W, H) => { g.fillStyle = bg; g.fillRect(0, 0, W, H); if (bg === '#111') { g.fillStyle = '#fff'; g.fillRect(0, 6, W, 4); } g.fillStyle = fg; let fs = Math.floor(H * 0.6); do { g.font = `700 ${fs}px Helvetica, Arial`; fs -= 2; } while (g.measureText(text).width > W - 40); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, W / 2, H / 2 + 3); });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.35, roughness: 0.5, side: twoSided ? THREE.DoubleSide : THREE.FrontSide }));
  m.position.set(x, y, z); m.rotation.y = yaw; scene.add(m); return m;
}
function bullet(scene, r, col, x, y, z) {
  const t = canvasTex(128, 128, (g) => { g.fillStyle = col; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill(); g.fillStyle = col === '#fccc0a' ? '#111' : '#fff'; g.font = '700 84px Helvetica, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(r, 64, 70); });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshStandardMaterial({ map: t, transparent: true, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.3, side: THREE.DoubleSide })); m.position.set(x, y, z); scene.add(m);
}
function solarTex() {   // the shed's solar panels: dark blue cells in silver frames with skylight strips
  const t = canvasTex(256, 256, (g) => { g.fillStyle = '#c9ced2'; g.fillRect(0, 0, 256, 256); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = y === 3 ? '#e8f0f4' : '#1b2a44'; g.fillRect(x * 64 + 3, y * 64 + 3, 58, 58); if (y < 3) { g.strokeStyle = 'rgba(120,150,190,.35)'; for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x * 64 + 3 + k * 14.5, y * 64 + 3); g.lineTo(x * 64 + 3 + k * 14.5, y * 64 + 61); g.stroke(); } } } });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
