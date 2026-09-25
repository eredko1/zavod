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

export const STILLWELL = { x0: -88, x1: -24, zS: -258, zC: -300, zP0: -266, zP1: -440, RAIL: 7.5, DECK_B: 6.8, DECK_T: 7.3, PLAT: 8.6 };
const ISLANDS = [[-82, -74], [-68, -60], [-53, -46], [-38, -29]];
const TRACKS = [{ x: -83.8, r: 'D' }, { x: -71, r: 'D' }, { x: -58.2, r: 'F' }, { x: -54.8, r: 'F' }, { x: -44, r: 'Q' }, { x: -40, r: 'Q' }, { x: -27.2, r: 'N' }];
const ROUTE = { D: '#ff6319', F: '#ff6319', N: '#fccc0a', Q: '#fccc0a' };
const STAIR = { z0: -276, run: 13.4, w: 3.0 }, CAR = 18.4, NCAR = 8;

export function buildStillwell(world, M) {
  const { scene, ctx, W } = world; const S = STILLWELL, B = new Batch(world, M, 'stillwell');
  // matte platform concrete + brushed turnstile steel (the shared greys are glossy: SSR mirrored the solar roof in them)
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
  // side walls (Stillwell Ave entrance on the west), north wall of the concourse
  B.box('terracotta', [S.x0, 0, S.zC], [S.x0 + 0.6, S.DECK_B, -277]); B.box('terracotta', [S.x0, 0, -271], [S.x0 + 0.6, S.DECK_B, fz]); B.box('terracotta', [S.x0, 3.2, -277], [S.x0 + 0.6, S.DECK_B, -271]);
  sign(scene, 'SUBWAY', S.x0 - 0.05, 3.65, -274, -Math.PI / 2, 2.6, 0.45, '#0b3d23', '#fff');
  B.box('terracotta', [S.x1 - 0.6, 0, S.zC], [S.x1, S.DECK_B, fz]);
  B.box('ssTile', [S.x0, 0, S.zC - 0.6], [S.x1, S.DECK_B, S.zC]);
  // concourse: terrazzo floor, ceiling (the deck underside) with light strips
  B.box('fascia', [S.x0, 0, S.zC], [S.x1, 0.03, fz - FT], { collide: false });
  for (let z = fz - 4; z > S.zC + 2; z -= 6) for (let x = S.x0 + 6; x < S.x1 - 4; x += 10) B.box('bulb', [x, S.DECK_B - 0.08, z], [x + 3.2, S.DECK_B - 0.02, z + 0.25], { collide: false });
  // fare line at z −270: a fare wall with turnstile gaps (walk through, like the real ones) between x −66 and −42
  { const Z0 = -270.4, Z1 = -269.6; let x = S.x0 + 0.6;
    for (let tx = -66; tx < -42; tx += 2.2) { if (tx > x) { B.box('stwTurn', [x, 0, Z0], [tx, 1.0, Z1]); } B.box('railSteel', [tx, 0, Z0 + 0.1], [tx + 0.35, 1.05, Z1 - 0.1]); x = tx + 1.3; }
    B.box('stwTurn', [x, 0, Z0], [S.x1 - 0.6, 1.0, Z1]); }
  B.box('fascia', [-36, 0, -265.5], [-30, 2.6, -262.5]); B.box('glassDark', [-36.05, 1.1, -262.55], [-30.05, 2.3, -262.45], { collide: false });   // token booth
  sign(scene, 'TOKEN BOOTH', -33, 2.85, -262.4, 0, 3.4, 0.4, '#111', '#fff');
  for (const x of [-84, -82, -80]) { B.box('ssBlue', [x, 0, -262], [x + 1.2, 1.9, -261.2]); }   // MetroCard machines
  sign(scene, 'D  F  N  Q  ·  TO ALL TRAINS  ↑', -54, 5.6, -270, 0, 12, 0.7, '#111', '#fff');
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
  slabs(S.x0, S.x1, S.DECK_B, S.DECK_T, 'elSoffit', zDeck0, zDeck1);
  for (const [a, b] of ISLANDS) {
    slabs(a, b, S.DECK_T, S.PLAT, 'stwPlat', S.zP0, S.zP1);
    for (const e of [a, b]) { const s = e === a ? 1 : -1; B.box('ssOrange', [Math.min(e, e + s * 0.6), S.PLAT, S.zP1], [Math.max(e, e + s * 0.6), S.PLAT + 0.012, S.zP0], { collide: false }); }   // yellow edge strips
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
  // one R160-ish car: brushed stainless body, lit window band, dark door bands, roof; instanced for every car on the map
  const body = new THREE.BoxGeometry(3.0, 3.4, CAR - 0.3); body.translate(0, 1.7 + 0.35, 0);
  const win = new THREE.BoxGeometry(3.04, 1.0, CAR - 1.6); win.translate(0, 2.35 + 0.35, 0);
  const doors = []; for (const z of [-6.2, -2.1, 2.1, 6.2]) { const d = new THREE.BoxGeometry(3.06, 2.1, 1.3); d.translate(0, 1.4 + 0.35, z); doors.push(d); }
  const stripe = new THREE.BoxGeometry(3.07, 0.14, CAR - 0.4); stripe.translate(0, 3.25 + 0.35, 0);
  const mk = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return m; };
  const alu = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.35, metalness: 0.85 }), glass = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff0c0, emissiveIntensity: 0.9, roughness: 0.2 }), dark = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.5, metalness: 0.6 });
  const PARKED = [0, 4, 6], MOVING = [{ i: 2, off: 0 }, { i: 5, off: 70 }];   // track indices
  const total = (PARKED.length + MOVING.length) * NCAR;
  const I = { body: mk(body, alu, total), win: mk(win, glass, total), doors: mk(mergeBoxes(doors), dark, total), stripe: mk(stripe, new THREE.MeshStandardMaterial({ color: 0xff6319, roughness: 0.5 }), total) };
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
      const me = ctx.player; if (me && !me.dead && m.v > 1.5 && Math.abs(me.position.x - m.x) < 1.7 && me.position.y > S.DECK_T - 0.5 && me.position.y < S.RAIL + 3 && me.position.z < z + 1 && me.position.z > z - NCAR * CAR) { me.damage?.(500, new THREE.Vector3(m.x, S.RAIL + 1, z)); ctx.hud?.toast?.('Hit by the train. Stay off the tracks.', 2600); }
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
