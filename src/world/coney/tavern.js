// CONEY — Soccer Tavern, 6004 8th Ave, Sunset Park (Brooklyn's Chinatown). An Irish dive bar since 1929 (an ex-speakeasy on
// what was "Lapskaus Boulevard" when 8th Ave was Norwegian), now in the middle of the city's biggest Chinatown. Built as its
// own zone far north of the map (like the Belt loop): a stretch of 8th Ave between 60th and 61st St — two-storey brick
// rowhouses with Chinese shop signs (bakery, fruit stand, pharmacy, driving school, tax office, travel agency, roast meat),
// awnings, fire escapes, London planes, parked cars, the N train entrance — and the tavern itself, walkable: the long dark-wood
// L-bar on the left with black ladder-back stools, the back-bar mirror and packed liquor shelves, the drop ceiling with two
// fans, Christmas string lights + tinsel all year, a Coors Light sign, framed photos, high-tops and two dartboards on the right,
// the jukebox (Luna Park Radio), four TVs showing a match, the back door out to the smoking yard and the restroom. Facade from the owner's photo:
// red brick, white board "SOCCER TAVERN" in red letters, Norwegian / US / Irish flags over the open green doors, the blue
// "329 Services Corp. TRAFFIC TICKET" sign upstairs, yellow driving-school signs.
// Getting here: ride the D past Bay 50 St (→ 62 St, change for the N → 8 Av), or take EXIT 7B off the Belt loop in a car.
// Getting back: the N at 8 Av (F at the station entrance → Stillwell), drive off either end of 8th Ave (→ the Belt), or T.
// Interior is lit by baked shading (unlit materials): no runtime lights, identical day and night. CONEY agent (tavern).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { hangkit as K } from '../hangkit.js';
import { placeCars } from '../carkit.js';
import { pa } from './r160.js';
import { buildTavernPeople } from './tavern-people.js';

export const TZ = { x0: -125, x1: 125, z0: -12052, z1: -11948, oz: -12000 };   // world rect of the zone; local z = world z − oz (x is shared)
const SW = 0.15;                                                                // sidewalk / bar floor height
const ROAD = 6, WALK = 10.5;                                                    // road half-width, building line
const ST60 = [-30, -18], ST61 = [62, 74];                                        // the cross streets (local x)
const BAR = { x0: -4.0, x1: 2.4, z0: 10.8, z1: 30.5, ceil: 3.1 };               // the bar room
const DOOR = [-0.9, 0.3];                                                        // the front door (local x)
const OCHE_X = BAR.x1 - 2.37;                                                    // the throw line: 2.37 m from the board face
// the room is laid out as in the photo, then mirrored (the bar on the left as you walk in, darts on the right): MX maps x across
const MX = (x) => BAR.x0 + BAR.x1 - x;
const GAP_EXIT = [MX(BAR.x0 + 2.1), MX(BAR.x0 + 1.1)], GAP_WC = [MX(BAR.x1 - 0.1), MX(BAR.x1 - 0.9)];   // back-wall doorways (game x)
const BOARDS = [{ z: 22.2 }, { z: 25.6 }];                                       // two dartboards on the left (+x) wall, centre 1.73 m up
const NSTAT = { x: 13, z: -8.6 };                                                // the N train entrance (across the avenue)
const CJK = '"PingFang TC","Hiragino Sans TC","Hiragino Sans GB","Heiti TC","Microsoft JhengHei","Noto Sans CJK TC","Noto Sans TC",sans-serif';
const FONT = 'Helvetica, Arial, sans-serif';
const inZone = (p) => p.x > TZ.x0 && p.x < TZ.x1 && p.z > TZ.z0 && p.z < TZ.z1;
const inBar = (p) => p.x > BAR.x0 && p.x < BAR.x1 && p.z - TZ.oz > BAR.z0 - 0.3 && p.z - TZ.oz < BAR.z1;

let Z = null;

export function buildTavern(world) {
  const { ctx, W, scene } = world; const lite = !!ctx.lite;
  (W.zones || (W.zones = [])).push({ x0: TZ.x0, x1: TZ.x1, z0: TZ.z0, z1: TZ.z1, name: '8 AV · SUNSET PARK', hint: 'N at 8 Av → Coney · T' });
  { const gh = W.groundHeight; W.groundHeight = (x, z) => { if (z > TZ.z0 - 30 && z < TZ.z1 + 30 && x > TZ.x0 - 30 && x < TZ.x1 + 30) { const lz = z - TZ.oz; const road = Math.abs(lz) < ROAD || (x > ST60[0] && x < ST60[1]) || (x > ST61[0] && x < ST61[1]); return road && !inBar({ x, z }) ? 0 : SW; } return gh ? gh(x, z) : 0; }; }
  const root = new THREE.Group(); root.name = 'sunsetPark'; root.position.set(0, 0, TZ.oz); scene.add(root);
  Z = { world, ctx, W, root, lite, busy: false, lastTrip: -9, t: 0, tvT: 0, inside: false, radioPrev: null, hint: 0 };
  // a friend fed the jukebox: everyone in the bar hears the same song from the same second
  ctx.bus.on('net:juke', (m) => { if (!Z.inside) return; if (m?.title == null) restoreRadio(); else if (typeof m.title === 'string' && Number.isFinite(m.t0)) { jukeOn(m.title, m.t0); K.toast(`🎵 ${m.title}`, 2200); } });
  // one warm fill light for the people / lit props in here, created with the world (a light added later recompiles every shader);
  // it only turns up while you're on 8th Ave (intensity changes are free)
  Z.hemi = new THREE.HemisphereLight(0xffe2b8, 0x4a3020, 0); scene.add(Z.hemi);
  const rnd = mulberry(6004);
  const G = new Map(); const put = (m, g) => { g = g.index ? g.toNonIndexed() : g; (G.get(m) || G.set(m, []).get(m)).push(g); return g; };
  const wbox = (x0, y0, z0, x1, y1, z1) => world.box([Math.min(x0, x1), y0, Math.min(z0, z1) + TZ.oz], [Math.max(x0, x1), y1, Math.max(z0, z1) + TZ.oz]);
  const M = mats(lite);
  Z.M = M;

  // ---- the atlas: every storefront, the tavern's whole facade, flags and signs share one canvas (one draw call) ----------------
  const S = lite ? 1024 : 2048, D = S / 2048;   // D: density scale
  const A = new Atlas(S); const jobs = [];
  const job = (w, h, pxm, draw) => { const j = { w: Math.ceil(w * pxm), h: Math.ceil(h * pxm), draw, rect: null }; jobs.push(j); return j; };

  // ---- the street ------------------------------------------------------------------------------------------------------------
  { const g = new THREE.PlaneGeometry(260, ROAD * 2); g.rotateX(-Math.PI / 2); scaleUV(g, 260 / 12, 1); put(M.road, g); }
  for (const [a, b] of [ST60, ST61]) { const g = new THREE.PlaneGeometry(b - a, 120); g.rotateX(-Math.PI / 2); g.translate((a + b) / 2, 0.005, 0); scaleUV(g, 1, 10); put(M.cross, g); }
  { const g = new THREE.PlaneGeometry(900, 700); g.rotateX(-Math.PI / 2); g.translate(0, -0.05, 0); put(M.ground, g); }   // under everything
  // sidewalks (both sides, split at the cross streets) + kerbs
  const walkSegs = [[-130, ST60[0]], [ST60[1], ST61[0]], [ST61[1], 130]];
  for (const sd of [-1, 1]) for (const [a, b] of walkSegs) {
    const g = new THREE.BoxGeometry(b - a, SW, WALK - ROAD + 0.4); g.translate((a + b) / 2, SW / 2, sd * (ROAD + WALK + 0.4) / 2); boxUV(g, 1.5); put(M.walk, g);
    const k = new THREE.BoxGeometry(b - a, SW + 0.01, 0.2); k.translate((a + b) / 2, SW / 2, sd * (ROAD + 0.1)); put(M.kerb, k);
  }
  // crosswalk stripes + the avenue's double yellow, painted (thin boxes)
  for (const [a, b] of [ST60, ST61]) for (let z = -ROAD + 0.4; z < ROAD - 0.3; z += 0.9) for (const x of [a + 1.2, b - 1.2]) { const g = new THREE.BoxGeometry(2.4, 0.01, 0.5); g.translate(x, 0.012, z); put(M.paint, g); }
  // ---- buildings ------------------------------------------------------------------------------------------------------------------
  const shops = SHOPS.slice(); let si = 0;
  const bld = [];   // { x0, x1, sd, floors, h, shop, hero }
  for (const sd of [-1, 1]) {
    for (const [a, b] of walkSegs) {
      let x = a; const aa = Math.max(a, -104), bb = Math.min(b, 106); x = aa;
      while (x < bb - 3) {
        let w = 6 + Math.floor(rnd() * 3) * 0.8; if (x + w > bb - 2) w = bb - x;
        if (sd > 0 && x < 2.7 && x + w > -12) { // the tavern's block: 6002 | 6004 SOCCER TAVERN | 6006, fixed
          if (x < -12) { w = -12 - x; if (w > 2.5) bld.push({ x0: x, x1: -12, sd, floors: 3, shop: shops[si++ % shops.length] }); }
          bld.push({ x0: -12, x1: -6, sd, floors: 2, shop: SHOP_6002, hero: 'n' }, { x0: -6, x1: 2.7, sd, floors: 2, hero: 'tavern' }, { x0: 2.7, x1: 9.2, sd, floors: 3, shop: SHOP_6006, hero: 'n' });
          x = 9.2; continue;
        }
        const floors = rnd() < 0.55 ? 3 : rnd() < 0.5 ? 2 : 4;
        bld.push({ x0: x, x1: x + w, sd, floors, shop: shops[si++ % shops.length] }); x += w;
      }
    }
  }
  const brickTint = [0x9a4a36, 0x8a5a44, 0xb07a5a, 0x7e3f30, 0xa8876a, 0x92523e];
  for (const B of bld) {
    const w = B.x1 - B.x0, fz = B.sd * WALK, gf = 4.3, h = B.hero === 'tavern' ? 7.6 : gf + (B.floors - 1) * 3.1 + 0.7; B.h = h;
    const depth = B.hero === 'tavern' ? 21 : 16, cx = (B.x0 + B.x1) / 2, back = fz + B.sd * depth;
    // the box behind the face (sides / roof), and its collider — the tavern is hollow (its room has its own walls)
    if (B.hero !== 'tavern') { const g = new THREE.BoxGeometry(w, h, depth); g.translate(cx, h / 2, (fz + back) / 2); put(M.side, g); wbox(B.x0 + 0.02, 0, fz, B.x1 - 0.02, h, back); }
    else { const g = new THREE.BoxGeometry(w, 0.4, depth); g.translate(cx, h - 0.2, (fz + back) / 2); put(M.side, g);
      for (const [x0, x1] of [[B.x0, BAR.x0 - 0.02], [BAR.x1 + 0.02, B.x1]]) { const s = new THREE.BoxGeometry(x1 - x0, h, depth); s.translate((x0 + x1) / 2, h / 2, (fz + back) / 2); put(M.side, s); }
      wbox(B.x0, 0, fz, BAR.x0 - 0.02, h, back); wbox(BAR.x1 + 0.02, 0, fz, B.x1, h, back);
      // the back wall between the room and the yard: solid except the two doorways (yard, restroom)
      for (const [a, b2] of [[BAR.x0, GAP_WC[0]], [GAP_WC[1], GAP_EXIT[0]], [GAP_EXIT[1], BAR.x1]]) { wbox(a, 0, BAR.z1, b2, h, back); const r = new THREE.BoxGeometry(b2 - a, h, back - BAR.z1); r.translate((a + b2) / 2, h / 2, (BAR.z1 + back) / 2); put(M.side, r); }
      for (const [a, b2] of [GAP_WC, GAP_EXIT]) { const l = new THREE.BoxGeometry(b2 - a, h - SW - 2.2, back - BAR.z1); l.translate((a + b2) / 2, (h + SW + 2.2) / 2, (BAR.z1 + back) / 2); put(M.side, l); } }
    const colour = brickTint[Math.floor(rnd() * brickTint.length)];
    if (B.hero === 'tavern') { B.job = job(w, h, 64 * D, (g, W2, H2) => drawTavernFacade(g, W2, H2, w, h)); continue; }
    // upper floors: the shared brick-and-windows material (lit by the sun: it's day or night out here)
    { const g = new THREE.PlaneGeometry(w, h - gf); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 1.75 + (B.x0 % 1.75) / 1.75, uv.getY(i) * (h - gf) / 3.1 - 0.02);
      if (B.sd > 0) g.rotateY(Math.PI); g.translate(cx, gf + (h - gf) / 2, fz - B.sd * 0.01); setColor(g, colour); put(M.upper, g); }
    // cornice + parapet cap, window sills are in the texture
    { const g = new THREE.BoxGeometry(w, 0.28, 0.45); g.translate(cx, h - 0.2, fz - B.sd * 0.2); shade(g, B.floors > 2 ? 0x8d877c : 0x5b4a40); put(M.prop, g); }
    { const g = new THREE.BoxGeometry(w, 0.16, 0.25); g.translate(cx, gf, fz - B.sd * 0.1); shade(g, 0x7e7a72); put(M.prop, g); }
    // the storefront (atlas)
    const pxm = (B.hero ? 48 : 30) * D; B.job = job(w, gf, pxm, (g, W2, H2) => drawStore(g, W2, H2, B.shop, w));
    // awning or sign box
    if (B.shop.awn) { const aw = new THREE.BoxGeometry(w - 0.3, 0.06, 1.3); aw.rotateX(B.sd * -0.32); aw.translate(cx, gf - 0.55, fz - B.sd * 0.62); shade(aw, B.shop.awn); put(M.prop, aw);
      const va = new THREE.BoxGeometry(w - 0.3, 0.32, 0.03); va.translate(cx, gf - 0.9, fz - B.sd * 1.22); shade(va, B.shop.awn); put(M.prop, va); }
    // fire escape on the taller ones (not on phones)
    if (!lite && B.floors >= 3 && rnd() < 0.7 && w > 5.5) fireEscape(put, M, cx, fz, B.sd, gf, B.floors, Math.min(4.2, w - 1.2));
    // AC units in a few windows
    if (!lite) for (let f = 1; f < B.floors; f++) if (rnd() < 0.35) { const ax = B.x0 + 0.9 + Math.floor(rnd() * Math.max(1, Math.floor(w / 1.75))) * 1.75; const g = new THREE.BoxGeometry(0.62, 0.42, 0.5); g.translate(Math.min(B.x1 - 0.5, ax), gf + (f - 1) * 3.1 + 1.25, fz - B.sd * 0.24); shade(g, 0xc9c6bf); put(M.prop, g); }
  }
  // far backdrop: the avenue runs on (cheap boxes with the same window material), and the cross streets end in blocks
  { const far = []; for (const sd of [-1, 1]) for (let x = -300; x < 300; x += 7 + rnd() * 3) { if (x > -106 && x < 108) continue; far.push([x, sd, 7 + rnd() * 3, 7 + Math.floor(rnd() * 3) * 3.1]); }
    for (const [a, b] of [ST60, ST61]) for (const sd of [-1, 1]) far.push([(a + b) / 2, sd * 5.5, b - a + 8, 11, true]);
    for (const q of far) { const [x, sd, w, h, cross] = q; const z = cross ? sd * 55 : sd * (WALK + 0.2); const d = cross ? 8 : 14;
      const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 1.75, uv.getY(i) * h / 3.1); g.translate(x, h / 2, z + (cross ? 0 : sd * d / 2)); setColor(g, brickTint[Math.floor(rnd() * brickTint.length)]); put(M.upper, g); } }
  for (const [a, b] of [ST60, ST61]) for (const sd of [-1, 1]) wbox(a, 0, sd * 50, b, 12, sd * 52);   // the cross streets end
  // trees (London planes in pits), street lamps, hydrant, trash cans
  const trees = []; for (const sd of [-1, 1]) for (let x = -100; x < 104; x += 9 + rnd() * 5) { if ((x > ST60[0] - 2 && x < ST60[1] + 2) || (x > ST61[0] - 2 && x < ST61[1] + 2) || (sd > 0 && x > -7 && x < 4) || (sd < 0 && Math.abs(x - NSTAT.x) < 4)) continue; if (rnd() < (lite ? 0.45 : 0.72)) trees.push([x, sd * (ROAD + 1.3)]); }
  for (const [x, z] of trees) { const g = new THREE.CylinderGeometry(0.13, 0.18, 3.6, 7); g.translate(x, 1.8, z); shade(g, 0x8a8468); put(M.prop, g); const pit = new THREE.BoxGeometry(1.2, 0.02, 1.2); pit.translate(x, SW + 0.005, z); shade(pit, 0x3e3226); put(M.prop, pit); wbox(x - 0.2, 0, z - 0.2, x + 0.2, 3, z + 0.2); }
  { const geo = mergeVertices(new THREE.IcosahedronGeometry(1, lite ? 1 : 2)); const pos = geo.attributes.position; for (let i = 0; i < pos.count; i++) { const k = 0.86 + Math.random() * 0.26; pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k); } geo.computeVertexNormals();
    const cnt = trees.length * 4, im = new THREE.InstancedMesh(geo, M.leaf, cnt); const o = new THREE.Object3D(), c = new THREE.Color(); let i = 0;
    for (const [x, z] of trees) for (let k = 0; k < 4; k++) { o.position.set(x + (rnd() - 0.5) * 2.2, 5 + rnd() * 1.8, z + (rnd() - 0.5) * 1.6); o.scale.set(1.9 + rnd(), 1.4 + rnd() * 0.6, 1.9 + rnd()); o.rotation.set(rnd(), rnd() * 6, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); c.setHSL(0.25 + rnd() * 0.05, 0.38, 0.17 + rnd() * 0.06); im.setColorAt(i++, c); }
    im.castShadow = !lite; im.receiveShadow = true; root.add(im); }
  for (const sd of [-1, 1]) for (let x = -96; x < 104; x += 32) { const z = sd * (ROAD + 0.55); const p = new THREE.CylinderGeometry(0.08, 0.12, 8.5, 7); p.translate(x, 4.25, z); put(M.steel, p);
    const arm = new THREE.BoxGeometry(0.1, 0.1, 2.4); arm.translate(x, 8.4, z - sd * 1.1); put(M.steel, arm); const hd = new THREE.BoxGeometry(0.4, 0.14, 0.7); hd.translate(x, 8.35, z - sd * 2.3); put(M.lamp, hd); wbox(x - 0.15, 0, z - 0.15, x + 0.15, 4, z + 0.15);
    const pool = new THREE.PlaneGeometry(9, 9); pool.rotateX(-Math.PI / 2); pool.translate(x, SW + 0.02, z - sd * 2.3); put(M.pool, pool); }
  { const hy = new THREE.CylinderGeometry(0.14, 0.16, 0.75, 8); hy.translate(-15.5, SW + 0.37, ROAD + 0.6); shade(hy, 0xc7b21e); put(M.prop, hy); const cap = new THREE.SphereGeometry(0.15, 8, 6); cap.translate(-15.5, SW + 0.78, ROAD + 0.6); shade(cap, 0xc7b21e); put(M.prop, cap); }
  for (const [x, sd] of [[-17, 1], [8, -1], [40, 1], [58, -1]]) { const g = new THREE.CylinderGeometry(0.3, 0.26, 0.9, 10); g.translate(x, SW + 0.45, sd * (ROAD + 0.75)); shade(g, 0x2f4a38); put(M.prop, g); }
  // the fruit stand on the sidewalk (whichever shop sells fruit): crates of oranges, apples, dragon fruit, bok choy
  for (const B of bld) if (B.shop?.fruit) { const cx = (B.x0 + B.x1) / 2, z = B.sd * (WALK - 1.0);
    for (let k = 0; k < 6; k++) { const x = cx - 2.2 + (k % 3) * 1.5, zz = z - B.sd * (k < 3 ? 0 : 0.7); const cr = new THREE.BoxGeometry(1.3, 0.25, 0.6); cr.rotateX(B.sd * 0.3); cr.translate(x, SW + 0.75 - (k < 3 ? 0 : 0.2), zz); shade(cr, 0x9b7a4c); put(M.prop, cr);
      const col = [0xf08a1c, 0xc8231d, 0xe0407a, 0x6aa33a, 0xe8d23a, 0x8c2f6f][k]; for (let n = 0; n < (lite ? 4 : 9); n++) { const f = new THREE.SphereGeometry(0.075, 6, 5); f.translate(x - 0.5 + (n % 3) * 0.5 + rnd() * 0.1, SW + 0.9 - (k < 3 ? 0 : 0.2) + rnd() * 0.04, zz - 0.15 + Math.floor(n / 3) * 0.15); shade(f, col); put(M.prop, f); } }
    const legs = new THREE.BoxGeometry(4.6, 0.7, 1.3); legs.translate(cx - 0.7, SW + 0.35, z - B.sd * 0.35); shade(legs, 0x5a4a3a); put(M.prop, legs); wbox(cx - 3, 0, z - 1, cx + 1.6, 1, z + 0.4 * B.sd); }
  // the N train entrance: a stair opening in the sidewalk, green railings, two green globes, the sign
  { const x = NSTAT.x, z = NSTAT.z; const well = new THREE.BoxGeometry(3.2, 0.05, 1.7); well.translate(x, SW - 0.02, z); shade(well, 0x0a0a0a); put(M.prop, well);
    for (const [dx, dz, w, d] of [[0, -0.9, 3.4, 0.06], [-1.7, 0, 0.06, 1.8], [1.7, 0, 0.06, 1.8]]) { const r = new THREE.BoxGeometry(w, 1.0, d); r.translate(x + dx, SW + 0.5, z + dz); shade(r, 0x1e4a2c); put(M.prop, r); }
    for (let k = 0; k < 6; k++) { const st = new THREE.BoxGeometry(3.0, 0.18, 0.3); st.translate(x, SW - 0.2 - k * 0.18, z - 0.7 + k * 0.28); shade(st, 0x77736b); put(M.prop, st); }
    for (const dx of [-1.7, 1.7]) { const p = new THREE.CylinderGeometry(0.05, 0.05, 2.1, 6); p.translate(x + dx, SW + 1.05, z + 0.9); put(M.steel, p); const gl = new THREE.SphereGeometry(0.2, 10, 8); gl.translate(x + dx, SW + 2.25, z + 0.9); put(M.globe, gl); }
    wbox(x - 1.75, 0, z - 0.95, x + 1.75, 1.1, z - 0.85); wbox(x - 1.75, 0, z - 0.9, x - 1.65, 1.1, z + 0.9); wbox(x + 1.65, 0, z - 0.9, x + 1.75, 1.1, z + 0.9); wbox(x - 1.6, 0, z - 0.85, x + 1.6, 0.9, z + 0.6);
    const sj = job(3.4, 0.55, 90 * D, (g, W2, H2) => { g.fillStyle = '#111'; g.fillRect(0, 0, W2, H2); g.fillStyle = '#fff'; g.font = `700 ${H2 * 0.46}px ${FONT}`; g.textBaseline = 'middle'; g.fillText('8 Av', H2 * 0.25, H2 * 0.5);
      const bx = W2 - H2 * 0.62; g.fillStyle = '#fccc0a'; g.beginPath(); g.arc(bx, H2 / 2, H2 * 0.36, 0, 7); g.fill(); g.fillStyle = '#111'; g.textAlign = 'center'; g.font = `700 ${H2 * 0.48}px ${FONT}`; g.fillText('N', bx, H2 * 0.53); g.textAlign = 'left';
      g.fillStyle = '#ddd'; g.font = `500 ${H2 * 0.2}px ${FONT}`; g.fillText('Downtown & Coney Island · 62 St', W2 * 0.3, H2 * 0.5); });
    Z.nSign = { j: sj, x, z: z + 0.9 }; }
  Z.nPos = new THREE.Vector3(NSTAT.x, SW, NSTAT.z + TZ.oz + 1.2);
  // street name signs at the corners
  for (const [x, t] of [[ST60[1] + 0.4, '60 St'], [ST61[0] - 0.4, '61 St']]) { const z = ROAD + 0.5; const p = new THREE.CylinderGeometry(0.045, 0.05, 3.2, 6); p.translate(x, 1.6, z); put(M.steel, p);
    const j = job(1.1, 0.24, 120 * D, (g, W2, H2) => { g.fillStyle = '#0f6b3a'; g.fillRect(0, 0, W2, H2); g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(2, 2, W2 - 4, H2 - 4); g.fillStyle = '#fff'; g.font = `700 ${H2 * 0.62}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, W2 / 2, H2 * 0.54); });
    const j2 = job(1.1, 0.24, 120 * D, (g, W2, H2) => { g.fillStyle = '#0f6b3a'; g.fillRect(0, 0, W2, H2); g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(2, 2, W2 - 4, H2 - 4); g.fillStyle = '#fff'; g.font = `700 ${H2 * 0.62}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('8 Av', W2 / 2, H2 * 0.54); });
    (Z.streetSigns || (Z.streetSigns = [])).push({ j, j2, x, z }); }

  // ---- the tavern facade 3-D bits: sign board, flags, doors, lamp box, step ------------------------------------------------------
  const FZ = WALK;   // facade plane (local z), faces −z (the street)
  { const g = new THREE.BoxGeometry(5.6, 0.85, 0.12); g.translate(-1.7, 3.55, FZ - 0.07); shade(g, 0xefeee8); put(M.prop, g); }
  Z.signJob = job(5.6, 0.85, 110 * D, (g, W2, H2) => { g.fillStyle = '#f1efe9'; g.fillRect(0, 0, W2, H2); g.fillStyle = 'rgba(0,0,0,.06)'; for (let i = 0; i < 30; i++) g.fillRect(Math.random() * W2, Math.random() * H2, 30, 2);
    g.fillStyle = '#a3161c'; g.font = `700 ${H2 * 0.62}px "Arial Black", ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; const t = 'SOCCER   TAVERN'; let x = W2 * 0.08; const step = W2 * 0.84 / (t.length - 1);
    for (const ch of t) { g.fillText(ch, x, H2 * 0.54); x += step; } g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3; g.strokeRect(1, 1, W2 - 2, H2 - 2); });
  { const g = new THREE.BoxGeometry(1.8, 0.45, 0.5); g.translate(DOOR[0] + 0.6, 2.75, FZ - 0.25); shade(g, 0x1d3a2c); put(M.prop, g); }   // the dark green box over the door
  { const st = new THREE.BoxGeometry(1.5, 0.05, 0.5); st.translate(DOOR[0] + 0.6, SW + 0.02, FZ - 0.2); shade(st, 0x6e6a62); put(M.prop, st); }
  // the doors: dark green outer leaf swung out against the wall, lime-green inner door open into the vestibule (Guinness sticker)
  { const g = new THREE.BoxGeometry(0.05, 2.25, 1.15); g.translate(DOOR[1] + 0.05, SW + 1.13, FZ - 0.6); shade(g, 0x1f4a33); put(M.prop, g); }
  { const g = new THREE.BoxGeometry(1.1, 2.2, 0.05); g.rotateY(-1.2); g.translate(DOOR[0] + 0.25, SW + 1.1, FZ + 0.75); shade(g, 0x7bbf3a); put(M.prop, g); }
  Z.stickerJob = job(0.3, 0.55, 200 * D, (g, W2, H2) => { g.fillStyle = '#111'; g.beginPath(); g.moveTo(W2 * 0.15, 0); g.lineTo(W2 * 0.85, 0); g.lineTo(W2 * 0.75, H2); g.lineTo(W2 * 0.25, H2); g.fill(); g.fillStyle = '#efe6cf'; g.fillRect(W2 * 0.15, 0, W2 * 0.7, H2 * 0.16); g.fillStyle = '#c9a44a'; g.font = `700 ${H2 * 0.08}px ${FONT}`; g.textAlign = 'center'; g.fillText('GUINNESS', W2 / 2, H2 * 0.55); });
  // flags on three poles over the door, angled out: Norway, USA, Ireland
  const flagJobs = [['no', 1.0, 1], ['us', -0.4, 0.3], ['ie', -2.2, -1]].map(([k, x, sx]) => ({ k, x, sx, d: new THREE.Vector3(sx * 0.5, 0.78, -0.5).normalize(), j: job(1.3, 0.9, 80 * D, (g, W2, H2) => drawFlag(g, W2, H2, k)) }));
  for (const f of flagJobs) { const p = new THREE.CylinderGeometry(0.025, 0.025, 2.0, 6); p.translate(0, 1.0, 0); p.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), f.d)); p.translate(f.x, 3.95, FZ - 0.05); put(M.steel, p); }
  // the neighbours' projecting signs (law office on 6006's second floor, driving school vertical), 6002's number on the awning
  const lawJob = job(4.6, 1.2, 60 * D, (g, W2, H2) => { g.fillStyle = '#1b3f9a'; g.fillRect(0, 0, W2, H2 * 0.5); g.fillStyle = '#fff'; g.font = `700 ${H2 * 0.36}px ${CJK}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('梁 志 勝 律 師 樓', W2 / 2, H2 * 0.26);
    g.fillStyle = '#7a1414'; g.fillRect(0, H2 * 0.5, W2, H2 * 0.5); g.fillStyle = '#ffe07a'; g.font = `700 ${H2 * 0.14}px ${CJK}`; g.fillText('房東房客 · 車禍 · 報稅欠稅 · 移民', W2 / 2, H2 * 0.63); g.font = `700 ${H2 * 0.12}px ${FONT}`; g.fillStyle = '#fff'; g.fillText('LAW OFFICE · TAX DISPUTES · (212) 349-6099', W2 / 2, H2 * 0.84); });
  const vJob = job(0.55, 2.4, 70 * D, (g, W2, H2) => { g.fillStyle = '#f2c417'; g.fillRect(0, 0, W2, H2); g.fillStyle = '#c21d1d'; g.font = `700 ${W2 * 0.62}px ${CJK}`; g.textAlign = 'center'; g.textBaseline = 'middle'; [...'全通駕駛學校'].forEach((c, i) => g.fillText(c, W2 / 2, H2 * (0.1 + i * 0.15))); });

  // the sandwich board outside 6006: 報稅 $30起
  { const sb = job(0.7, 1.0, 110 * D, (g, W2, H2) => { g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, W2, H2); g.fillStyle = '#1b3f9a'; g.fillRect(0, 0, W2, H2 * 0.18); g.fillStyle = '#fff'; g.font = `700 ${H2 * 0.12}px ${CJK}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('報稅 $30起', W2 / 2, H2 * 0.09);
      g.fillStyle = '#1b3f9a'; g.font = `700 ${H2 * 0.1}px ${CJK}`; g.fillText('超時工資', W2 / 2, H2 * 0.3); g.fillStyle = '#333'; g.font = `500 ${H2 * 0.05}px ${CJK}`; for (let i = 0; i < 6; i++) g.fillText(['不贏錢不收費用', '無論有無身份', '員工工作三個月的', '勞工賠償 法律援助', '免費諮詢', '2ND FLOOR →'][i], W2 / 2, H2 * (0.44 + i * 0.09)); });
    Z.sandJob = sb; }
  // ---- pack the atlas, then emit the textured quads ------------------------------------------------------------------------------
  let ok = false; for (let tries = 0; tries < 5 && !ok; tries++) { ok = A.pack(jobs); if (!ok) for (const j of jobs) { j.w = Math.ceil(j.w * 0.85); j.h = Math.ceil(j.h * 0.85); } }
  if (!ok) console.warn('[tavern] atlas overflow');
  A.draw(jobs); const atlasTex = A.texture(); M.atlas.map = atlasTex; M.atlas.needsUpdate = true; M.atlasLit.map = atlasTex; M.atlasLit.needsUpdate = true;
  const quad = (j, w, h, x, y, z, ry = 0, u0 = 0, u1 = 1, v0 = 0, v1 = 1, mat = M.atlas) => { const g = new THREE.PlaneGeometry(w, h); const r = j.rect, uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) { const u = u0 + uv.getX(i) * (u1 - u0), v = v0 + uv.getY(i) * (v1 - v0); uv.setXY(i, r.u0 + u * (r.u1 - r.u0), r.v0 + v * (r.v1 - r.v0)); }
    if (ry) g.rotateY(ry); g.translate(x, y, z); return put(mat, g); };
  for (const B of bld) { if (!B.job?.rect) continue; const w = B.x1 - B.x0, cx = (B.x0 + B.x1) / 2, fz = B.sd * WALK, ry = B.sd > 0 ? Math.PI : 0;
    if (B.hero === 'tavern') {   // three pieces round the door opening (the door is a hole you walk through)
      const L = (x) => (x - B.x0) / w, top = SW + 2.35;   // u from the facade's left edge as seen from the street (−z side, u runs +x → −x when rotated)
      const piece = (xa, xb, ya, yb) => { const ua = 1 - (xb - B.x0) / w, ub = 1 - (xa - B.x0) / w; quad(B.job, xb - xa, yb - ya, (xa + xb) / 2, (ya + yb) / 2, fz - 0.005, ry, ua, ub, ya / B.h, yb / B.h); };
      piece(B.x0, DOOR[0], 0, B.h); piece(DOOR[1], B.x1, 0, B.h); piece(DOOR[0], DOOR[1], top, B.h); void L;
      // wall colliders beside the door
      wbox(B.x0, 0, FZ - 0.05, DOOR[0], B.h, FZ + 0.3); wbox(DOOR[1], 0, FZ - 0.05, B.x1, B.h, FZ + 0.3);
      continue; }
    quad(B.job, w, 4.3, cx, 4.3 / 2, fz - B.sd * 0.012, ry, 0, 1, 0, 1, M.atlasLit); }
  quad(Z.signJob, 5.6, 0.85, -1.7, 3.55, FZ - 0.135, Math.PI);
  { const g = quad(Z.stickerJob, 0.3, 0.55, 0, 0, 0, 0); g.rotateY(-1.2 + Math.PI); g.translate(DOOR[0] + 0.25 + Math.sin(-1.2) * 0.04, SW + 1.35, FZ + 0.75 - Math.cos(-1.2) * 0.04); }
  for (const f of flagJobs) { const g = quad(f.j, 1.3, 0.9, 0, 0, 0); const pos = g.attributes.position, d = f.d, v = new THREE.Vector3(0, -1, 0).addScaledVector(d, d.y).normalize();
    for (let i = 0; i < pos.count; i++) { const lx = pos.getX(i) + 0.65 + 0.6, ly = pos.getY(i) - 0.45, w = Math.sin(lx * 3.4) * 0.05; pos.setXYZ(i, f.x + d.x * lx - v.x * ly + w, 3.95 + d.y * lx - v.y * ly, FZ - 0.05 + d.z * lx - v.z * ly + w * 0.5); } }
  quad(lawJob, 4.6, 1.2, 5.95, 6.2, FZ - 0.08, Math.PI, 0, 1, 0, 1, M.atlasLit); { const g = new THREE.BoxGeometry(4.7, 1.25, 0.12); g.translate(5.95, 6.2, FZ - 0.01); shade(g, 0x222); put(M.prop, g); }
  quad(vJob, 0.55, 2.4, 3.1, 2.3, FZ - 0.9, Math.PI / 2, 0, 1, 0, 1, M.atlasLit); quad(vJob, 0.55, 2.4, 3.1, 2.3, FZ - 0.9, -Math.PI / 2, 0, 1, 0, 1, M.atlasLit);
  { const g = new THREE.BoxGeometry(0.06, 2.45, 0.6); g.translate(3.1, 2.3, FZ - 0.9); shade(g, 0x333); put(M.prop, g); }
  // the N sign, street signs, sandwich board need the rects too (they were packed with the rest)
  quad(Z.nSign.j, 3.4, 0.55, Z.nSign.x, SW + 2.75, Z.nSign.z + 0.02, 0); quad(Z.nSign.j, 3.4, 0.55, Z.nSign.x, SW + 2.75, Z.nSign.z - 0.02, Math.PI);
  { const g = new THREE.BoxGeometry(3.5, 0.6, 0.03); g.translate(Z.nSign.x, SW + 2.75, Z.nSign.z); shade(g, 0x111); put(M.prop, g); }
  for (const s of Z.streetSigns) { quad(s.j, 1.1, 0.24, s.x, 3.05, s.z, Math.PI / 2); quad(s.j, 1.1, 0.24, s.x, 3.05, s.z, -Math.PI / 2); quad(s.j2, 1.1, 0.24, s.x, 3.3, s.z, 0); quad(s.j2, 1.1, 0.24, s.x, 3.3, s.z, Math.PI); }
  for (const s of [1, -1]) { const g = quad(Z.sandJob, 0.7, 1.0, 0, 0, 0); g.rotateX(s * 0.18); if (s < 0) g.rotateY(Math.PI); g.translate(4.4, SW + 0.5, FZ - 1.2 + s * 0.09); }

  // ---- the bar room ------------------------------------------------------------------------------------------------------------------
  buildBarRoom(world, root, put, wbox, M, lite, rnd);
  buildBack(world, root, put, wbox, M, lite, rnd);
  K.spot({ pos: Z.juke, r: 1.6, dy: 2, prompt: 'F — JUKEBOX · LUNA PARK RADIO', act: () => jukebox() });

  // ---- merge everything per material --------------------------------------------------------------------------------------------------
  for (const [m, list] of G) { normAttrs(list); const merged = mergeGeometries(list, false); if (!merged) { console.warn('[tavern] merge failed', m.name); continue; }
    const mesh = new THREE.Mesh(merged, m); mesh.name = 'tavern:' + (m.name || m.type); mesh.receiveShadow = !m.isMeshBasicMaterial; mesh.castShadow = !lite && !m.isMeshBasicMaterial && m !== M.road && m !== M.cross && m !== M.ground && m !== M.walk; root.add(mesh);
    if (m === M.side || m === M.wall || m === M.upper) ctx.raycastTargets?.push?.(mesh); }
  // parked cars along both kerbs (stealable — they're the kit's parked cars), a gap in front of the tavern
  { const list = []; for (const sd of [-1, 1]) for (let x = -98; x < 100; x += 6.2 + rnd() * 1.5) { if ((x > ST60[0] - 4 && x < ST60[1] + 3) || (x > ST61[0] - 4 && x < ST61[1] + 3) || (sd > 0 && x > -9 && x < 6) || (sd < 0 && Math.abs(x - NSTAT.x) < 5) || rnd() < 0.3) continue; list.push({ x, z: sd * (ROAD - 1.1) + TZ.oz, ry: sd > 0 ? 0 : Math.PI, kind: rnd() < 0.2 ? 'suv' : 'sedan' }); }
    try { placeCars(world, list.map((c) => ({ ...c, kind: ['sedan', 'suv', 'cab'].includes(c.kind) ? c.kind : 'sedan' })), { raycast: true }); for (const c of list) wbox(c.x - 2.2, 0, c.z - TZ.oz - 0.9, c.x + 2.2, 1.4, c.z - TZ.oz + 0.9); } catch (e) { console.warn('[tavern] cars', e); } }

  // ---- getting here and back ----------------------------------------------------------------------------------------------------------------
  W.tavern = { arrive: (how) => arrive(how), stayOn: () => stayOn(), leave: (how) => leave(how), inZone: (p) => inZone(p), inBar: (p) => inBar(p), zone: TZ, boards: boardsWorld(), oche: MX(OCHE_X), bar: BAR, root };
  K.spot({ pos: Z.nPos, r: 2.6, dy: 2, prompt: 'F — 8 AV · N TRAIN → CONEY ISLAND (STILLWELL AV)', act: () => leave('N') });
  K.spot({ pos: Z.urinal, r: 1.0, dy: 2, prompt: 'F — TAKE A PISS', act: () => pee() });
  K.spot({ pos: Z.yardSpot, r: 2.2, dy: 2, low: true, prompt: 'F — HAVE A SMOKE OUT BACK', act: () => yardSmoke() });
  world.updaters.push((dt) => { if (Z?.world === world) update(dt); });
  try { buildTavernPeople(world); } catch (e) { console.warn('[tavern] people', e); }
  if (typeof window !== 'undefined' && window.__game) window.__game.tavern = { arrive: (h) => arrive(h), leave: (h) => leave(h), state: () => ({ inZone: inZone(ctx.player.position), inBar: inBar(ctx.player.position), busy: Z.busy, pos: ctx.player.position.toArray().map((v) => +v.toFixed(2)) }), zone: TZ, bar: BAR, door: [(DOOR[0] + DOOR[1]) / 2, SW, TZ.oz + WALK], nPos: Z.nPos.toArray(), boards: W.tavern.boards, juke: (t) => { const t0 = jukeOn(t); ctx.net?.send?.('juke', { title: t, t0 }); return t0; }, radio: () => ({ now: W.radio?.now, qa: W.radio?.qa?.() }), back: () => ({ urinal: Z.urinal.toArray(), yard: Z.yardSpot.toArray(), exitX: (GAP_EXIT[0] + GAP_EXIT[1]) / 2, wcX: (GAP_WC[0] + GAP_WC[1]) / 2, z1: BAR.z1 + TZ.oz }), pee: () => pee(), peeT: () => Z.pee || 0 };
  console.log('[tavern] 8th Ave + Soccer Tavern built ·', bld.length, 'buildings ·', G.size, 'materials');
}

// ---------------------------------------------------------------------------------------------------------------------------
// the room: a drop ceiling, wood panelling, the L-bar, stools, back-bar with mirror and bottles, TVs, fans, lights, darts, jukebox
function buildBarRoom(world, root, put, wbox, M, lite, rnd) {
  // built in the photo's layout, then mirrored across the room: geometry after it's all placed (some pieces are moved after put),
  // colliders as they come, and the loose meshes (bottles, lights, TVs, chalkboard, fans) by position / yaw
  const mine = new Map(), kids = root.children.length, c2 = BAR.x0 + BAR.x1;
  const put2 = (m, g) => { const r = put(m, g); if (!NOMIR) mine.set(r, m === M.inside); return r; };
  const wbox2 = (x0, y0, z0, x1, y1, z1) => wbox(c2 - x1, y0, z0, c2 - x0, y1, z1);
  BAKE = true; try { buildRoom(world, root, put2, wbox2, M, lite, rnd); } finally { BAKE = false; }
  for (const [g, flipU] of mine) mirrorGeo(g, c2, flipU);
  for (const o of root.children.slice(kids)) { o.position.x = c2 - o.position.x; o.rotation.y = -o.rotation.y;
    if (o.isInstancedMesh) { const m = new THREE.Matrix4(); for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); m.elements[12] = c2 - m.elements[12]; o.setMatrixAt(i, m); } o.position.x = 0; o.instanceMatrix.needsUpdate = true; } }
  Z.juke.x = c2 - Z.juke.x;
}
let NOMIR = false;
// mirror a (non-indexed) geometry across x = c2/2: positions, normals, winding; flipU un-mirrors a picture/sign (u within its own rect)
function mirrorGeo(g, c2, flipU) {
  const p = g.attributes.position, n = g.attributes.normal; for (let i = 0; i < p.count; i++) { p.setX(i, c2 - p.getX(i)); if (n) n.setX(i, -n.getX(i)); }
  if (!g.index) for (const a of Object.values(g.attributes)) { const s = a.itemSize, arr = a.array; for (let t = 0; t + 2 < a.count; t += 3) for (let k = 0; k < s; k++) { const i1 = (t + 1) * s + k, i2 = (t + 2) * s + k, v = arr[i1]; arr[i1] = arr[i2]; arr[i2] = v; } }
  if (flipU && g.attributes.uv) { const uv = g.attributes.uv; let a = 1e9, b = -1e9; for (let i = 0; i < uv.count; i++) { a = Math.min(a, uv.getX(i)); b = Math.max(b, uv.getX(i)); } for (let i = 0; i < uv.count; i++) uv.setX(i, a + b - uv.getX(i)); }
  for (const a of Object.values(g.attributes)) a.needsUpdate = true; g.computeBoundingSphere?.();
}
function buildRoom(world, root, put, wbox, M, lite, rnd) {
  const { x0, x1, z0, z1, ceil } = BAR, y0 = SW, H = ceil - y0, cx = (x0 + x1) / 2;
  const IA = new Atlas(lite ? 1024 : 2048); const jobs = []; const job = (w, h, pxm, draw) => { const j = { w: Math.ceil(w * pxm), h: Math.ceil(h * pxm), draw }; jobs.push(j); return j; };
  const P = lite ? 70 : 140;
  // floor (planks + the colour spill of the lights), ceiling (tiles), walls (panelling) — each a repeating canvas material
  { const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate(cx, y0 + 0.002, (z0 + z1) / 2); put(M.floor, g); }
  { const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(Math.PI / 2); g.translate(cx, ceil, (z0 + z1) / 2); scaleUV(g, (x1 - x0) / 0.6, (z1 - z0) / 0.6); put(M.ceil, g); }
  const wallQ = (ax, az, bx, bz) => { const L = Math.hypot(bx - ax, bz - az); const g = new THREE.PlaneGeometry(L, H); scaleUV(g, L / 1.2, 1); g.rotateY(Math.atan2(-(bz - az), bx - ax)); g.translate((ax + bx) / 2, y0 + H / 2, (az + bz) / 2); put(M.wall, g); };
  wallQ(x1, z0, x1, z1); wallQ(x0, z1, x0, z0);   // +x (left as you walk in, in the photo), −x (right) — normals inward
  // back wall: two doorways (restroom on the +x side, the yard door on the −x side, as in the photo), lintels over them
  { const eg = [x0 + 1.1, x0 + 2.1], wg = [x1 - 0.9, x1 - 0.1]; wallQ(x1, z1, wg[1], z1); wallQ(wg[0], z1, eg[1], z1); wallQ(eg[0], z1, x0, z1);
    for (const [a, b] of [eg, wg]) { const g = new THREE.PlaneGeometry(b - a, ceil - (y0 + 2.2)); g.rotateY(Math.PI); g.translate((a + b) / 2, (ceil + y0 + 2.2) / 2, z1); put(M.wall, g); }
    wbox(x0, 0, z1, eg[0], ceil, z1 + 0.3); wbox(eg[1], 0, z1, wg[0], ceil, z1 + 0.3); wbox(wg[1], 0, z1, x1, ceil, z1 + 0.3); }
  NOMIR = true; try {   // the front wall stays put: the street door doesn't move
    wallQ(x0, z0 + 0.1, DOOR[0], z0 + 0.1); wallQ(DOOR[1], z0 + 0.1, x1, z0 + 0.1); { const g = new THREE.PlaneGeometry(DOOR[1] - DOOR[0], ceil - (y0 + 2.35)); g.translate((DOOR[0] + DOOR[1]) / 2, (ceil + y0 + 2.35) / 2, z0 + 0.1); put(M.wall, g); }
  } finally { NOMIR = false; }
  wbox(x1, 0, z0, x1 + 0.3, ceil, z1); wbox(x0 - 0.3, 0, z0, x0, ceil, z1);
  // the white half-partition with green trim by the front tables (photo, left foreground)
  { const g = new THREE.BoxGeometry(0.12, 1.05, 1.4); g.translate(x1 - 1.9, y0 + 0.52, z0 + 2.2); shade(g, 0xe9e6dc, 0.8); put(M.pnt, g); const t = new THREE.BoxGeometry(0.16, 0.06, 1.44); t.translate(x1 - 1.9, y0 + 1.06, z0 + 2.2); shade(t, 0x2f7a3e, 0.8); put(M.pnt, t); wbox(x1 - 1.97, 0, z0 + 1.5, x1 - 1.83, 1.1, z0 + 2.9); }
  // ---- the bar: counter along the right wall, returning to the wall at the front in a curve (the L) ----
  const cX0 = x0 + 1.4, cX1 = cX0 + 0.62, cZ0 = z0 + 3.2, cZ1 = z1 - 3.4, top = y0 + 1.07;
  const woodBox = (w, h, d, x, y, z, ry = 0, col = 0xa05a34, sh = 1) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); boxUV(g, 0.8); shade(g, col, sh); put(M.barWood, g); return g; };
  woodBox(cX1 - cX0, top - y0 - 0.06, cZ1 - cZ0, (cX0 + cX1) / 2, (y0 + top - 0.06) / 2, (cZ0 + cZ1) / 2);
  woodBox(0.8, 0.06, cZ1 - cZ0, (cX0 + cX1) / 2 + 0.06, top - 0.03, (cZ0 + cZ1) / 2, 0, 0xc0703e);
  { const g = new THREE.CylinderGeometry(0.035, 0.035, cZ1 - cZ0, 8); g.rotateX(Math.PI / 2); g.translate(cX1 + 0.33, y0 + 0.2, (cZ0 + cZ1) / 2); shade(g, 0xb08a3a, 0.9); put(M.pnt, g); }   // brass foot rail
  // the curve: a quarter circle from the counter's front end round to the wall (the L), 6 segments
  { const r = (cX0 + cX1) / 2 - x0, N = 6; for (let i = 0; i < N; i++) { const a0 = -i * Math.PI / 2 / N, a1 = -(i + 1) * Math.PI / 2 / N, am = (a0 + a1) / 2; const mx = x0 + r * Math.cos(am), mz = cZ0 + r * Math.sin(am), seg = 2 * r * Math.sin(Math.PI / 4 / N) + 0.08;
      woodBox(0.62, top - y0 - 0.06, seg, mx, (y0 + top - 0.06) / 2, mz, -am); woodBox(0.8, 0.06, seg + 0.04, mx + Math.cos(am) * 0.06, top - 0.03, mz + Math.sin(am) * 0.06, -am, 0xc0703e); wbox(mx - 0.36, 0, mz - 0.36, mx + 0.36, top, mz + 0.36); } }
  wbox(cX0 - 0.05, 0, cZ0, cX1 + 0.1, top, cZ1);
  // back-bar: a low cabinet, the mirror + bottle shelves (canvas), a top cornice with the garland
  woodBox(0.5, 0.95, cZ1 - cZ0 + 0.4, x0 + 0.25, y0 + 0.47, (cZ0 + cZ1) / 2, 0, 0x6a3a22);
  const bbJob = job(cZ1 - cZ0 + 0.4, 1.75, P, (g, W2, H2) => drawBackBar(g, W2, H2));
  woodBox(0.35, 0.18, cZ1 - cZ0 + 0.6, x0 + 0.18, y0 + 2.8, (cZ0 + cZ1) / 2, 0, 0x5a3220);
  // bottles in front of the canvas: two glass shelves of real bottles (instanced) so the back-bar has depth
  { const n = lite ? 40 : 110, geo = new THREE.CylinderGeometry(0.038, 0.042, 0.3, 7); geo.translate(0, 0.15, 0); const nk = new THREE.CylinderGeometry(0.014, 0.02, 0.1, 6); nk.translate(0, 0.35, 0); const bg = mergeGeometries([geo.toNonIndexed(), nk.toNonIndexed()]);
    const im = new THREE.InstancedMesh(bg, M.bottle, n); const o = new THREE.Object3D(), c = new THREE.Color(); const cols = [0x6b3a12, 0x2e5a1e, 0xd8e2e0, 0x8a4a14, 0x1d3b22, 0xb9772a, 0x3a1a0c, 0xe8e0c8, 0x5a0f1a, 0x9fb8c0];
    for (let i = 0; i < n; i++) { const row = i % 2, k = Math.floor(i / 2); o.position.set(x0 + 0.2 + row * 0.1, y0 + (row ? 1.02 : 1.62), cZ0 + 0.2 + (k / (n / 2)) * (cZ1 - cZ0 - 0.4) + (rnd() - 0.5) * 0.05); const s = 0.8 + rnd() * 0.45; o.scale.set(1, s, 1); o.updateMatrix(); im.setMatrixAt(i, o.matrix); c.setHex(cols[Math.floor(rnd() * cols.length)]); im.setColorAt(i, c); }
    root.add(im);
    for (const y of [y0 + 1.0, y0 + 1.6]) { const sh = new THREE.BoxGeometry(0.28, 0.02, cZ1 - cZ0); sh.translate(x0 + 0.16, y, (cZ0 + cZ1) / 2); shade(sh, 0x8fa4a6, 0.9); put(M.pnt, sh); } }
  // taps on the bar: a tower with handles (Guinness, Coors Light, Tsingtao, Stella, Blue Moon) + the Guinness surge on its own
  { const tz = cZ0 + 3.2; const tw = new THREE.BoxGeometry(0.1, 0.34, 0.9); tw.translate(cX0 + 0.14, top + 0.17, tz); shade(tw, 0xc9ccce, 0.9); put(M.pnt, tw);
    [0x111111, 0xc8ced6, 0x1e7a3a, 0xb3121e, 0x2a5aa8].forEach((col, i) => { const h = new THREE.BoxGeometry(0.05, 0.22, 0.05); h.translate(cX0 + 0.14, top + 0.44, tz - 0.36 + i * 0.18); shade(h, col, 0.9); put(M.pnt, h); }); }
  // ---- stools: black metal ladder-backs, vinyl seats, along the counter ----
  const stool = (x, z, ry = Math.PI / 2) => { const pc = []; const leg = (dx, dz) => { const g = new THREE.CylinderGeometry(0.014, 0.014, 0.76, 5); g.translate(dx, 0.38, dz); pc.push(g); };
    for (const dx of [-0.17, 0.17]) for (const dz of [-0.17, 0.17]) leg(dx, dz);
    for (const y of [0.25, 0.52]) { const r = new THREE.BoxGeometry(0.36, 0.02, 0.02); r.translate(0, y, 0.17); pc.push(r); const r2 = r.clone(); r2.translate(0, 0, -0.34); pc.push(r2); const r3 = new THREE.BoxGeometry(0.02, 0.02, 0.36); r3.translate(0.17, y, 0); pc.push(r3); const r4 = r3.clone(); r4.translate(-0.34, 0, 0); pc.push(r4); }
    for (const dz of [-0.16, 0.16]) { const b = new THREE.BoxGeometry(0.02, 0.5, 0.02); b.translate(-0.18, 1.02, dz); pc.push(b); } for (const y of [0.92, 1.1, 1.24]) { const s = new THREE.BoxGeometry(0.02, 0.05, 0.34); s.translate(-0.18, y, 0); pc.push(s); }
    for (const g of pc) { g.rotateY(ry); g.translate(x, y0, z); shade(g, 0x121212, 0.85); put(M.pnt, g); }
    const seat = new THREE.CylinderGeometry(0.21, 0.2, 0.08, 14); seat.translate(x, y0 + 0.8, z); shade(seat, 0x1b1a1a, 0.9); put(M.pnt, seat); };
  for (let z = cZ0 + 0.3; z < cZ1 - 0.2; z += 0.95) stool(cX1 + 0.5, z, Math.PI);
  // high-tops along the left wall + their stools
  const tables = [z0 + 1.1, z0 + 4.2, z0 + 7.0];
  for (const tz of tables) { const tx = x1 - 0.55; const top2 = new THREE.BoxGeometry(0.75, 0.05, 0.75); top2.translate(tx, y0 + 1.05, tz); shade(top2, 0x6a4a2e, 0.9); put(M.pnt, top2);
    const ped = new THREE.CylinderGeometry(0.04, 0.04, 1.02, 6); ped.translate(tx, y0 + 0.52, tz); shade(ped, 0x151515); put(M.pnt, ped); const ft = new THREE.CylinderGeometry(0.26, 0.28, 0.03, 10); ft.translate(tx, y0 + 0.02, tz); shade(ft, 0x151515); put(M.pnt, ft);
    stool(tx - 0.6, tz, 0); stool(tx, tz - 0.62, -Math.PI / 2); wbox(tx - 0.3, 0, tz - 0.3, tx + 0.3, 1.05, tz + 0.3); }
  // ---- the darts: two boards on the left wall, cabinets, oche line, trophies, the chalkboard ----
  const boardJob = job(0.46, 0.46, lite ? 280 : 560, (g, W2, H2) => drawBoard(g, W2, H2));
  for (const b of BOARDS) { const cab = new THREE.BoxGeometry(0.06, 0.95, 1.4); cab.translate(x1 - 0.03, y0 + 1.73 - SW, b.z); shade(cab, 0x241510, 0.9); put(M.pnt, cab);
    const surround = new THREE.CylinderGeometry(0.3, 0.3, 0.04, 28); surround.rotateZ(Math.PI / 2); surround.translate(x1 - 0.06, 1.73, b.z); shade(surround, 0x151515, 0.9); put(M.pnt, surround);
    const oc = new THREE.BoxGeometry(0.04, 0.01, 0.6); oc.translate(OCHE_X, y0 + 0.006, b.z); shade(oc, 0xcfa84a, 1); put(M.pnt, oc);
    const lamp = new THREE.BoxGeometry(0.3, 0.06, 0.18); lamp.translate(x1 - 0.5, 2.55, b.z); shade(lamp, 0x1a1a1a); put(M.pnt, lamp); }
  const trophyJob = job(2.6, 0.45, P, (g, W2, H2) => drawTrophies(g, W2, H2));
  { const sh = new THREE.BoxGeometry(0.22, 0.03, 3.4); sh.translate(x1 - 0.11, y0 + 2.3, (BOARDS[0].z + BOARDS[1].z) / 2); shade(sh, 0x3a2216); put(M.pnt, sh);
    for (let i = 0; i < (lite ? 5 : 10); i++) { const z = BOARDS[0].z - 1.4 + i * 0.36 + rnd() * 0.05, h = 0.18 + rnd() * 0.22; const cup = new THREE.CylinderGeometry(0.05, 0.025, 0.1, 8); cup.translate(x1 - 0.12, y0 + 2.32 + h, z); shade(cup, 0xd4b04a, 0.95); put(M.pnt, cup);
      const st = new THREE.CylinderGeometry(0.012, 0.012, h - 0.06, 5); st.translate(x1 - 0.12, y0 + 2.32 + h / 2, z); shade(st, 0xd4b04a, 0.95); put(M.pnt, st); const bs = new THREE.BoxGeometry(0.1, 0.07, 0.1); bs.translate(x1 - 0.12, y0 + 2.35, z); shade(bs, 0x2a1a10); put(M.pnt, bs); } }
  // the live chalkboard between the boards (darts.js draws on it) + the price board behind the bar
  const chalk = makeCanvasTex(lite ? 256 : 512, lite ? 192 : 384, (g, w, h) => drawChalk(g, w, h, null));
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.68), new THREE.MeshBasicMaterial({ map: chalk.tex, toneMapped: true })); m.position.set(x1 - 0.045, 1.9, (BOARDS[0].z + BOARDS[1].z) / 2); m.rotation.y = -Math.PI / 2; root.add(m);
    const fr = new THREE.BoxGeometry(0.04, 0.74, 0.96); fr.translate(x1 - 0.01, 1.9, (BOARDS[0].z + BOARDS[1].z) / 2); shade(fr, 0x5a3a22); put(M.pnt, fr); }
  Z.chalk = chalk;
  const menuJob = job(1.6, 0.7, P, (g, W2, H2) => drawMenu(g, W2, H2));
  // ---- signs, photos, banner, clock, EXIT, restroom, jukebox front, scarves ----
  const coorsJob = job(1.3, 0.62, P, (g, W2, H2) => drawCoors(g, W2, H2));
  const photos = []; for (let i = 0; i < (lite ? 4 : 8); i++) photos.push(job(0.42, 0.34, P, (g, W2, H2) => drawPhoto(g, W2, H2, i)));
  const clipJob = job(0.9, 0.6, P, (g, W2, H2) => drawClippings(g, W2, H2));
  const bannerJob = job(1.7, 0.8, P, (g, W2, H2) => drawBanner(g, W2, H2));
  const clockJob = job(0.36, 0.36, P * 1.4, (g, W2, H2) => drawClock(g, W2, H2));
  const exitJob = job(0.6, 0.2, P * 1.4, (g, W2, H2) => { g.fillStyle = '#111'; g.fillRect(0, 0, W2, H2); g.fillStyle = '#ff2a1a'; g.font = `700 ${H2 * 0.7}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT', W2 / 2, H2 * 0.55); });
  const wcJob = job(0.3, 0.3, P * 1.4, (g, W2, H2) => { g.fillStyle = '#e9e4d6'; g.fillRect(0, 0, W2, H2); g.fillStyle = '#222'; g.font = `700 ${H2 * 0.22}px ${FONT}`; g.textAlign = 'center'; g.fillText('RESTROOM', W2 / 2, H2 * 0.3); g.font = `700 ${H2 * 0.26}px ${CJK}`; g.fillText('洗手間', W2 / 2, H2 * 0.62); g.font = `600 ${H2 * 0.11}px ${FONT}`; g.fillText('CUSTOMERS ONLY', W2 / 2, H2 * 0.86); });
  const cashJob = job(0.5, 0.3, P * 1.4, (g, W2, H2) => { g.fillStyle = '#f5f0e0'; g.fillRect(0, 0, W2, H2); g.fillStyle = '#b3121e'; g.font = `700 ${H2 * 0.3}px ${FONT}`; g.textAlign = 'center'; g.fillText('CASH', W2 / 2, H2 * 0.38); g.fillText('ONLY', W2 / 2, H2 * 0.74); });
  const jukeJob = job(0.8, 1.55, P, (g, W2, H2) => drawJukebox(g, W2, H2));
  const scarfJobs = [['CELTIC', '#0b7a3e', '#fff'], ['YNWA', '#c8102e', '#f6eb61'], ['ÉIRE', '#169b62', '#ff883e'], ['NORGE', '#ba0c2f', '#00205b'], ['BROOKLYN', '#1b2a5a', '#e9e2d0'], ['CORK', '#c8102e', '#fff']].map(([t, a, b]) => job(1.3, 0.2, P, (g, W2, H2) => drawScarf(g, W2, H2, t, a, b)));
  const tvJobs = null; void tvJobs;
  IA.pack(jobs) || console.warn('[tavern] interior atlas overflow'); IA.draw(jobs); const itex = IA.texture(); M.inside.map = itex; M.inside.needsUpdate = true;
  const iq = (j, w, h, x, y, z, ry) => { const g = new THREE.PlaneGeometry(w, h); const r = j.rect, uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, r.u0 + uv.getX(i) * (r.u1 - r.u0), r.v0 + uv.getY(i) * (r.v1 - r.v0)); g.rotateY(ry); g.translate(x, y, z); return put(M.inside, g); };
  const RX = -Math.PI / 2, LX = Math.PI / 2;   // facing −x (on the left/+x wall), facing +x (on the right/−x wall)
  iq(bbJob, cZ1 - cZ0 + 0.4, 1.75, x0 + 0.02, y0 + 1.82, (cZ0 + cZ1) / 2, LX);
  for (const b of BOARDS) iq(boardJob, 0.46, 0.46, x1 - 0.085, 1.73, b.z, RX);
  iq(trophyJob, 2.6, 0.45, x1 - 0.01, y0 + 2.55, (BOARDS[0].z + BOARDS[1].z) / 2, RX);
  iq(menuJob, 1.6, 0.7, x0 + 0.02, y0 + 2.45, cZ0 + 2.0, LX);
  iq(coorsJob, 1.3, 0.62, x1 - 0.02, y0 + 2.5, z0 + 1.6, RX);
  photos.forEach((j, i) => iq(j, 0.42, 0.34, x1 - 0.015, y0 + 1.55 + (i % 2) * 0.45, z0 + 0.7 + Math.floor(i / 2) * 0.55 + (i > 3 ? 4.2 : 0), RX));
  iq(clipJob, 0.9, 0.6, x1 - 0.015, y0 + 1.7, z0 + 9.0, RX);
  iq(bannerJob, 1.7, 0.8, cx + 0.6, y0 + 2.35, z1 - 0.02, Math.PI);
  iq(clockJob, 0.36, 0.36, cx - 0.9, y0 + 2.5, z1 - 0.02, Math.PI);
  iq(exitJob, 0.6, 0.2, x0 + 1.6, y0 + 2.42, z1 - 0.02, Math.PI);
  iq(wcJob, 0.3, 0.3, x1 - 0.5, y0 + 1.6, z1 - 0.025, Math.PI);
  iq(cashJob, 0.5, 0.3, x0 + 0.02, y0 + 2.15, cZ0 + 5.5, LX);
  scarfJobs.forEach((j, i) => { const g = iq(j, 1.3, 0.2, 0, 0, 0, 0); g.rotateY(LX); g.rotateX(0); g.translate(x0 + 0.03, y0 + 2.95, cZ0 + 0.8 + i * 1.5); });
  // back doors: the EXIT door (with a wreath) and the restroom door, as panels
  // both propped open into the room (the yard door with its wreath, the restroom door)
  { const open = (w, h, hx, col, ry) => { const d = new THREE.BoxGeometry(w, h, 0.05); d.translate(w / 2, h / 2, 0); d.rotateY(ry); d.translate(hx, y0, z1 - 0.05); shade(d, col); put(M.pnt, d); return d; };
    open(0.95, 2.1, x0 + 1.12, 0x3a2418, 1.35); const wr = new THREE.TorusGeometry(0.16, 0.05, 6, 16); wr.rotateY(Math.PI / 2 + 1.35 - Math.PI / 2); wr.translate(x0 + 1.12 + Math.cos(1.35) * 0.47, y0 + 1.6, z1 - 0.05 - Math.sin(1.35) * 0.47); shade(wr, 0x1f5a2a); put(M.pnt, wr);
    open(0.78, 2.05, x1 - 0.12, 0xb0703a, Math.PI - 1.35); }
  // jukebox against the left wall (between the front tables and the darts)
  { const jz = z0 + 9.0 - 1.2; Z.juke = new THREE.Vector3(x1 - 0.4, SW, jz + TZ.oz); const b = new THREE.BoxGeometry(0.55, 1.5, 0.8); b.translate(x1 - 0.3, y0 + 0.75, jz); shade(b, 0x2a1a14); put(M.pnt, b);
    iq(jukeJob, 0.72, 1.4, x1 - 0.585, y0 + 0.8, jz, RX); wbox(x1 - 0.6, 0, jz - 0.42, x1, 1.5, jz + 0.42); }
  // ---- TVs: four screens up high sharing one animated canvas (a match) ----
  Z.tv = makeCanvasTex(lite ? 192 : 320, lite ? 108 : 180, (g, w, h) => drawMatch(g, w, h, 0));
  { const tvm = new THREE.MeshBasicMaterial({ map: Z.tv.tex, toneMapped: false }); const spots = [[x0 + 0.5, cZ0 + 1.2, LX], [x0 + 0.5, cZ1 - 1.4, LX], [cx - 0.2, z1 - 0.12, Math.PI], [x1 - 0.2, z0 + 3.0, RX]];
    for (const [x, z, ry] of spots) { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.52), tvm); s.position.set(x + (ry === LX ? 0.07 : ry === RX ? -0.07 : 0), 2.62, z + (ry === Math.PI ? -0.06 : 0)); s.rotation.y = ry; root.add(s);
      const bz = new THREE.BoxGeometry(0.98, 0.58, 0.08); bz.rotateY(ry); bz.translate(x + (ry === LX ? 0.02 : ry === RX ? -0.02 : 0), 2.62, z); shade(bz, 0x0c0c0c); put(M.pnt, bz); } }
  // ---- ceiling fans (they turn), hanging ornaments, string lights, tinsel ----
  Z.fans = [];
  for (const fz of [z0 + 6, z0 + 13]) { const parts = []; const hub = new THREE.CylinderGeometry(0.12, 0.14, 0.14, 12); parts.push(shade(hub, 0x3a2a1c));
    for (let k = 0; k < 5; k++) { const bl = new THREE.BoxGeometry(0.62, 0.012, 0.13); bl.translate(0.42, -0.02, 0); bl.rotateY(k * Math.PI * 2 / 5); parts.push(shade(bl, 0x4a3020)); }
    const bowl = new THREE.SphereGeometry(0.13, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); bowl.translate(0, -0.08, 0); parts.push(shade(bowl, 0xf2e6c0, 1));
    normAttrs(parts); const fan = new THREE.Mesh(mergeGeometries(parts.map((p) => p.index ? p.toNonIndexed() : p)), M.pnt); fan.position.set(cx - 0.3, ceil - 0.32, fz); root.add(fan); Z.fans.push(fan);
    const rod = new THREE.CylinderGeometry(0.015, 0.015, 0.25, 5); rod.translate(cx - 0.3, ceil - 0.13, fz); shade(rod, 0x3a2a1c); put(M.pnt, rod); }
  for (let i = 0; i < (lite ? 6 : 14); i++) { const x = x0 + 0.8 + rnd() * (x1 - x0 - 1.6), z = z0 + 1 + rnd() * (z1 - z0 - 2), L = 0.2 + rnd() * 0.5; const s = new THREE.CylinderGeometry(0.004, 0.004, L, 3); s.translate(x, ceil - L / 2, z); shade(s, 0xcccccc); put(M.pnt, s);
    const o = new THREE.SphereGeometry(0.06 + rnd() * 0.05, 10, 8); o.translate(x, ceil - L - 0.07, z); shade(o, [0xc0c4c8, 0xb3121e, 0x1f7a33, 0xd4af37][i % 4], 1.05); put(M.pnt, o); }
  { const pts = []; const run = (ax, az, bx, bz, y) => { const L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / (lite ? 0.35 : 0.2)); for (let i = 0; i <= n; i++) { const k = i / n, sag = Math.sin(((k * L) % 1.2) / 1.2 * Math.PI) * 0.1; pts.push([ax + (bx - ax) * k, y - sag, az + (bz - az) * k]); } };
    run(x1 - 0.04, z0 + 0.2, x1 - 0.04, z1 - 0.2, ceil - 0.12); run(x0 + 0.05, z0 + 0.3, x0 + 0.05, z1 - 0.2, ceil - 0.12); run(x0 + 0.2, z1 - 0.05, x1 - 0.2, z1 - 0.05, ceil - 0.12);
    run(x0 + 0.45, cZ0, x0 + 0.45, cZ1, y0 + 2.62); run(x1 - 1.9, z0 + 0.3, x1 - 1.9, z0 + 3, y0 + 1.25);
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 5, 4), new THREE.MeshBasicMaterial({ toneMapped: false }), pts.length); const o = new THREE.Object3D(), c = new THREE.Color(); const cols = [0xff3020, 0x30ff60, 0x3070ff, 0xffd040, 0xfff0d0, 0xff50c0];
    pts.forEach((p, i) => { o.position.set(...p); o.updateMatrix(); im.setMatrixAt(i, o.matrix); c.setHex(cols[i % cols.length]).multiplyScalar(1.6); im.setColorAt(i, c); }); root.add(im);
    // tinsel garland on the back-bar cornice and along the left wall: a sagging tube, red and green in turns
    const gar = (ax, az, bx, bz, y) => { const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.floor(L / 1.1)), cp = []; for (let i = 0; i <= n * 6; i++) { const k = i / (n * 6); cp.push(new THREE.Vector3(ax + (bx - ax) * k, y - Math.abs(Math.sin(k * n * Math.PI)) * 0.22, az + (bz - az) * k)); }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cp), n * 12, 0.05, 5, false); const col = new Float32Array(tube.attributes.position.count * 3); const cA = new THREE.Color(0xc8121e), cB = new THREE.Color(0x1d8a3a);
      for (let i = 0; i < tube.attributes.position.count; i++) { const seg = Math.floor(i / 6 / (12 * n / (n * 2))); const cc = (seg & 1 ? cB : cA).clone().multiplyScalar(0.75 + Math.random() * 0.5); col.set([cc.r, cc.g, cc.b], i * 3); } tube.setAttribute('color', new THREE.BufferAttribute(col, 3)); put(M.pnt, tube); };
    gar(x0 + 0.4, cZ0, x0 + 0.4, cZ1, y0 + 2.72); if (!lite) { gar(x1 - 0.08, z0 + 0.4, x1 - 0.08, BOARDS[0].z - 1.6, ceil - 0.2); gar(x0 + 0.2, z1 - 0.08, x1 - 0.2, z1 - 0.08, ceil - 0.25); } }
  // the big red bow at the back-bar's front corner
  { for (const s of [-1, 1]) { const c = new THREE.ConeGeometry(0.07, 0.16, 8); c.rotateZ(s * Math.PI / 2); c.translate(x0 + 0.3, y0 + 2.75, cZ0 + 0.3 + s * 0.14); shade(c, 0xc0121c, 1); put(M.pnt, c); }
    for (const s of [-1, 1]) { const r = new THREE.BoxGeometry(0.02, 0.32, 0.04); r.rotateX(s * 0.3); r.translate(x0 + 0.3, y0 + 2.45, cZ0 + 0.3 + s * 0.08); shade(r, 0xc0121c, 1); put(M.pnt, r); } }
  // a warm glow pool over the bar and the darts (additive quads on the floor/counter: the "light" of the room, baked)
  { const glow = new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35, toneMapped: false });
    for (const [x, z, w, d] of [[cX1 + 0.4, (cZ0 + cZ1) / 2, 2.2, cZ1 - cZ0], [OCHE_X + 1, (BOARDS[0].z + BOARDS[1].z) / 2, 2.4, 5]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), glow); m.rotation.x = -Math.PI / 2; m.position.set(x, y0 + 0.01, z); m.renderOrder = 2; root.add(m); } }
}

// ---------------------------------------------------------------------------------------------------------------------------
function update(dt) {
  const { ctx } = Z; Z.t += dt; const p = ctx.player; if (!p) return;
  const v = ctx.vehicles?.mounted, here = v ? v.pos : p.position, iz = inZone(here), ib = !v && inBar(here);
  Z.root.visible = iz || Math.hypot(ctx.camera.position.x - 0, ctx.camera.position.z - TZ.oz) < 300;
  Z.hemi.intensity = !iz ? 0 : ib ? 2.2 : here.z - TZ.oz > BAR.z1 ? 1.1 : 0.5;
  if (!iz) { if (Z.hint) { Z.hint = 0; restoreRadio(); } return; }
  if (!Z.hint) { Z.hint = 1; }
  // TVs: a few frames a second while you're in the bar (or looking in)
  Z.tvT -= dt; if (Z.tvT < 0 && (ib || Math.abs(here.z - (TZ.oz + WALK)) < 8)) { Z.tvT = Z.lite ? 0.25 : 0.12; Z.tv.draw((g, w, h) => drawMatch(g, w, h, Z.t)); }
  for (const f of Z.fans) f.rotation.y += dt * 3.2;
  if (ib !== Z.inside) { Z.inside = ib; if (ib) K.toast('SOCCER TAVERN · since 1929 · cash only', 2400); }
  if (p.dead || Z.busy || performance.now() / 1000 - Z.lastTrip < 3) return;
  if (ctx.state === 'playing' && ctx.input?.pressed?.has?.('KeyT') && !ctx.durakOpen && !Z.dartsOpen) { ctx.input.pressed.delete('KeyT'); leave(v ? 'car' : 'N'); return; }
  if (v && (v.pos.x > TZ.x1 - 14 || v.pos.x < TZ.x0 + 14) && Math.abs(v.pos.z - TZ.oz) < ROAD + 1) leave('belt');   // drive off either end of 8th Ave → the Belt
}
function jukebox() {
  const { ctx, W } = Z; const R = W.radio; const titles = R?.tracks || [];
  const play = (t) => () => { const t0 = jukeOn(t); if (t0 != null) try { ctx.net?.send?.('juke', { title: t, t0 }); } catch {} K.toast(`🎵 ${t}`, 2200); return null; };
  K.openDialog('JUKEBOX', { text: titles.length ? 'A quarter a song, three for a dollar. The good stuff is in the back of the book — Luna Park Radio.' : 'The jukebox hums. Nothing loaded.',
    choices: [...titles.map((t) => ({ label: t, go: play(t) })), ...(Z.radioPrev != null ? [{ label: 'Pull the plug', go: () => { restoreRadio(); try { ctx.net?.send?.('juke', { title: null }); } catch {} return null; } }] : []), { label: 'Leave it', go: null }] });
}
// the jukebox takes over the radio for you: the picked song, then the rest in order (Luna Park Radio elsewhere stays shuffled)
function jukeOn(title, t0) { const { ctx, W } = Z; if (Z.radioPrev == null) Z.radioPrev = ctx.settings.radio || 'car'; ctx.settings.radio = 'always'; return W.radio?.juke?.(title, t0) ?? null; }
// ---- out back: the restroom (a white cinderblock box off the back wall) and the smoking yard behind the bar ----------------
function buildBack(world, root, put, wbox, M, lite, rnd) {
  const y0 = SW, back = WALK + 21, oz = TZ.oz, box = (x0, y, z0, x1, y1, z1, col, mat = M.pnt) => { const g = new THREE.BoxGeometry(x1 - x0, y1 - y, z1 - z0); g.translate((x0 + x1) / 2, (y + y1) / 2, (z0 + z1) / 2); shade(g, col); put(mat, g); return g; };
  const floor = (x0, z0, x1, z1, col, mat = M.pnt) => { const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y0 + 0.004, (z0 + z1) / 2); shade(g, col); put(mat, g); };
  // the two doorways through the back wall (floors), then the restroom
  BAKE = true; try {
    for (const [a, b] of [GAP_WC, GAP_EXIT]) floor(a, BAR.z1, b, back, 0x5a4a3a);
    const R = { x0: -4.0, x1: -1.8, z0: back, z1: back + 2.7 }, top = y0 + 2.6, tile = 0xe6e2d4;
    floor(R.x0, R.z0, R.x1, R.z1, 0x77736a); box(R.x0 - 0.15, 0, R.z0, R.x0, top, R.z1 + 0.15, tile); box(R.x1, 0, R.z0, R.x1 + 0.15, top, R.z1 + 0.15, tile); box(R.x0 - 0.15, 0, R.z1, R.x1 + 0.15, top, R.z1 + 0.15, tile);
    box(R.x0 - 0.15, top, R.z0, R.x1 + 0.15, top + 0.12, R.z1 + 0.15, 0xcfcac0);
    wbox(R.x0 - 0.15, 0, R.z0, R.x0, top, R.z1 + 0.15); wbox(R.x1, 0, R.z0, R.x1 + 0.15, top, R.z1 + 0.15); wbox(R.x0 - 0.15, 0, R.z1, R.x1 + 0.15, top, R.z1 + 0.15);
    box(R.x0, y0 + 1.1, R.z0, R.x1, y0 + 1.14, R.z1, 0x2f6a4a);   // a green tile stripe round the room
    // the urinal (east wall), the stall (north-west corner) with the bowl, the sink and mirror (west wall), a bare bulb
    const uz = R.z0 + 1.5; box(R.x1 - 0.32, y0 + 0.45, uz - 0.2, R.x1, y0 + 1.05, uz + 0.2, 0xf4f4f0); box(R.x1 - 0.28, y0 + 0.45, uz - 0.16, R.x1 - 0.05, y0 + 0.5, uz + 0.16, 0xd8e4e6);
    { const p = new THREE.CylinderGeometry(0.015, 0.015, 0.5, 5); p.translate(R.x1 - 0.06, y0 + 1.3, uz); shade(p, 0xb8bcc0); put(M.pnt, p); }
    box(R.x0 + 0.9, 0, R.z1 - 1.1, R.x0 + 0.94, y0 + 1.9, R.z1, 0x6a7a6e); box(R.x0 + 0.94, y0 + 0.15, R.z1 - 1.12, R.x0 + 1.5, y0 + 1.9, R.z1 - 1.08, 0x6a7a6e);
    { const b = new THREE.CylinderGeometry(0.2, 0.16, 0.42, 12); b.translate(R.x0 + 0.45, y0 + 0.21, R.z1 - 0.45); shade(b, 0xf4f4f0); put(M.pnt, b); } box(R.x0 + 0.25, y0 + 0.42, R.z1 - 0.2, R.x0 + 0.65, y0 + 0.82, R.z1, 0xf4f4f0);
    const sz = R.z0 + 0.7; box(R.x0, y0 + 0.78, sz - 0.25, R.x0 + 0.4, y0 + 0.92, sz + 0.25, 0xf4f4f0); box(R.x0, y0 + 1.25, sz - 0.3, R.x0 + 0.02, y0 + 1.9, sz + 0.3, 0x5c6a72);
    { const b = new THREE.SphereGeometry(0.06, 8, 6); b.translate((R.x0 + R.x1) / 2, top - 0.15, (R.z0 + R.z1) / 2); shade(b, 0xfff2c0, 1.6); put(M.pnt, b); }
    // scrawl on the tiles (coloured marker strokes)
    for (let i = 0; i < (lite ? 6 : 16); i++) { const z = R.z0 + 0.3 + rnd() * (R.z1 - R.z0 - 0.6), y = y0 + 1.25 + rnd() * 0.9; box(R.x1 - 0.004, y, z, R.x1, y + 0.006 + rnd() * 0.01, z + 0.05 + rnd() * 0.16, [0x111111, 0x1a3aa8, 0xb3121e][i % 3]); }
    Z.urinal = new THREE.Vector3(R.x1 - 0.55, y0, uz + oz);
  } finally { BAKE = false; }
  // the yard: concrete, a board fence all round, a picnic table under string lights, the butt bucket, a keg, milk crates
  const Y = { x0: -6.0, x1: 2.7, z0: back, z1: back + 9 }, fence = 0x6b4f35, fh = y0 + 2.3;
  floor(Y.x0, Y.z0, Y.x1, Y.z1, 0x7a766e, M.prop);
  for (const [x0, z0, x1, z1] of [[Y.x0 - 0.1, Y.z0, Y.x0, Y.z1 + 0.1], [Y.x1, Y.z0, Y.x1 + 0.1, Y.z1 + 0.1], [Y.x0 - 0.1, Y.z1, Y.x1 + 0.1, Y.z1 + 0.1]]) {
    wbox(x0, 0, z0, x1, fh + 0.2, z1); const alongX = x1 - x0 > z1 - z0, L = alongX ? x1 - x0 : z1 - z0, n = Math.floor(L / (lite ? 0.6 : 0.16));
    for (let i = 0; i < n; i++) { const k = (i + 0.5) / n, w = L / n - 0.012, cx = alongX ? x0 + k * L : (x0 + x1) / 2, cz = alongX ? (z0 + z1) / 2 : z0 + k * L, hh = fh + (i % 3) * 0.04;
      box(cx - (alongX ? w / 2 : 0.05), 0, cz - (alongX ? 0.05 : w / 2), cx + (alongX ? w / 2 : 0.05), hh, cz + (alongX ? 0.05 : w / 2), i % 2 ? fence : 0x5e4430, M.prop); } }
  const tx = 0.2, tz = Y.z0 + 4.6;   // picnic table
  box(tx - 0.9, y0 + 0.72, tz - 0.4, tx + 0.9, y0 + 0.77, tz + 0.4, 0x7a5a3a, M.prop); for (const s of [-1, 1]) { box(tx - 0.9, y0 + 0.42, tz + s * 0.62 - 0.14, tx + 0.9, y0 + 0.46, tz + s * 0.62 + 0.14, 0x7a5a3a, M.prop); for (const e of [-0.75, 0.75]) box(tx + e - 0.04, 0, tz + s * 0.35 - 0.04, tx + e + 0.04, y0 + 0.72, tz + s * 0.35 + 0.04, 0x5a4028, M.prop); }
  wbox(tx - 0.9, 0, tz - 0.4, tx + 0.9, y0 + 0.77, tz + 0.4);
  { const c = new THREE.CylinderGeometry(0.05, 0.05, 0.12, 10); c.translate(tx + 0.3, y0 + 0.83, tz); setColor(c, 0x8a8c8e); put(M.prop, c); }   // the coffee-can ashtray
  { const b = new THREE.CylinderGeometry(0.2, 0.17, 0.38, 12); b.translate(-0.9, y0 + 0.19, Y.z0 + 1.0); setColor(b, 0xb3221e); put(M.prop, b); wbox(-1.1, 0, Y.z0 + 0.8, -0.7, 0.4, Y.z0 + 1.2); }   // the sand bucket by the door
  { const k = new THREE.CylinderGeometry(0.22, 0.22, 0.6, 14); k.translate(2.2, y0 + 0.3, Y.z1 - 0.6); setColor(k, 0xa8adb2); put(M.prop, k); wbox(1.95, 0, Y.z1 - 0.85, 2.45, 0.6, Y.z1 - 0.35); }
  for (const [x, z, h2] of [[-5.4, Y.z1 - 0.5, 0], [-5.4, Y.z1 - 0.5, 0.33], [-4.9, Y.z1 - 0.5, 0]]) { box(x - 0.2, y0 + h2, z - 0.2, x + 0.2, y0 + h2 + 0.32, z + 0.2, 0x1e4a9a, M.prop); } wbox(-5.65, 0, Y.z1 - 0.75, -4.65, 0.66, Y.z1 - 0.25);
  for (const [x, z, ry] of [[tx - 1.6, tz - 0.2, 0.4], [tx + 1.7, tz + 0.5, -0.3]]) { const parts = [[0.44, 0.04, 0.42, 0, 0.45, 0], [0.44, 0.42, 0.04, 0, 0.66, -0.2]]; for (const [w, h, d, ox, oy, oz2] of parts) { const g = new THREE.BoxGeometry(w, h, d); g.translate(ox, oy, oz2); g.rotateY(ry); g.translate(x, y0, z); setColor(g, 0xeeeeea); put(M.prop, g); } }
  { const pts = []; for (const z of [Y.z0 + 2.2, Y.z0 + 6.0]) for (let i = 0; i <= 22; i++) { const k = i / 22; pts.push([Y.x0 + k * (Y.x1 - Y.x0), y0 + 2.6 - Math.sin(k * Math.PI) * 0.35, z]); }
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffe6a8, toneMapped: false }), pts.length); const o = new THREE.Object3D();
    pts.forEach((p, i) => { o.position.set(...p); o.updateMatrix(); im.setMatrixAt(i, o.matrix); }); root.add(im); }
  { const t = makeCanvasTex(256, 128, (g, w, h) => { g.fillStyle = '#f2efe6'; g.fillRect(0, 0, w, h); g.fillStyle = '#b3121e'; g.font = `700 ${h * 0.26}px ${FONT}`; g.textAlign = 'center'; g.fillText('SMOKING AREA', w / 2, h * 0.36); g.font = `700 ${h * 0.3}px ${CJK}`; g.fillStyle = '#222'; g.fillText('吸煙區', w / 2, h * 0.74); g.font = `600 ${h * 0.09}px ${FONT}`; g.fillText('BUTTS IN THE BUCKET — KENNY', w / 2, h * 0.93); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), new THREE.MeshBasicMaterial({ map: t.tex })); m.position.set((GAP_EXIT[0] + GAP_EXIT[1]) / 2 + 1.1, y0 + 1.9, back + 0.02); root.add(m); }
  Z.yardSpot = new THREE.Vector3(tx, y0, tz + oz);
}
const PEE = ['Ahhh. The seal is broken. Now you\'ll be back every twenty minutes.', 'Somebody wrote «TONY OWES ME $40» above the urinal. In three languages. In three handwritings.', 'You read the graffiti: «LIVERPOOL 4 LIFE» — «UNCLE LOU IS A LIAR» — «不要問». Very Sunset Park.', 'Mr. Wong walks in, looks at you, says «I was just leaving», walks out.', 'The flush handle comes off in your hand. You put it back. Nobody has to know.'];
function pee() { if (Z.pee && performance.now() - Z.pee < 6000) { K.toast('You just went. Hydrate first (B).', 1800); return; } Z.pee = performance.now(); K.toast('🚽 ' + pick(PEE), 3600); }
function yardSmoke() {
  const st = K.state(); if (st?.smoking) { K.toast('One at a time.', 1400); return; }
  if (!st?.inv?.includes('cigs')) { K.give('cigs'); K.toast('DUCK, out back: «No smokes? Here — 555s from Chinatown. Don\'t tell Kenny I carry a pack for strangers.»', 3600); }
  K.useItem('cigs'); if (Math.random() < 0.5) setTimeout(() => K.toast(pick(['Out back, under the string lights. Somebody\'s radio is playing Cantopop from a window upstairs.', 'A cat walks the fence. It looks at you like it knows about the envelope.', 'The kitchen fan of the roast-duck place next door blows five-spice at you. Worth it.']), 3400), 1800);
}
function restoreRadio() { try { Z.W.radio?.juke?.(null); } catch {} if (Z.radioPrev != null) { Z.ctx.settings.radio = Z.radioPrev; Z.radioPrev = null; } }

// ---- trips -------------------------------------------------------------------------------------------------------------
function fade(lines, fn, hold = 1100) {
  Z.busy = true; Z.lastTrip = performance.now() / 1000;
  const f = document.querySelector('.hgfade'), fl = document.querySelector('.hgfloor'); const L = Array.isArray(lines) ? lines : [lines];
  if (f) { f.classList.remove('car'); f.style.transition = 'opacity .4s'; f.style.opacity = '1'; }
  setTimeout(() => { if (fl) { fl.style.fontSize = '40px'; fl.textContent = L[0]; }
    let i = 1; const next = () => { if (i < L.length) { if (fl) fl.textContent = L[i]; i++; setTimeout(next, hold); return; }
      try { fn(); } catch (e) { console.warn('[tavern]', e); }
      setTimeout(() => { if (f) f.style.opacity = '0'; if (fl) fl.textContent = ''; setTimeout(() => { if (f) f.style.transition = ''; if (fl) fl.style.fontSize = ''; Z.busy = false; }, 450); }, 500); };
    setTimeout(next, hold); }, 420);
}
function moveTo(x, y, z, h, speed) {
  const { ctx } = Z; const v = ctx.vehicles?.mounted, p = ctx.player;
  if (v) { v.pos.set(x, y, z); v.heading = h; v.vel.set(-Math.sin(h) * speed, 0, -Math.cos(h) * speed); v.vy = 0; v.air = false; if (v.group) { v.group.position.copy(v.pos); v.group.rotation.y = h; } }
  else p.teleport(x, y, z, h, 0);
}
function stayOn() { K.toast('Stay on: the D runs on to 62 St–New Utrecht Av — change for the N to 8 Av (Sunset Park). Soccer Tavern is right there.', 5200); }
function arrive(how) {
  if (!Z || Z.busy) return false; const { ctx } = Z;
  if (how === 'belt') { const sp = Math.max(8, Math.min(14, Math.abs(ctx.vehicles?.mounted?.fwdSpeed || 0) * 0.5));
    fade(['EXIT 7B · GOWANUS EXPWY', '8 AV · SUNSET PARK'], () => { moveTo(-88, 0, TZ.oz + 2.3, -Math.PI / 2, ctx.vehicles?.mounted ? sp : 0); K.toast('8th Ave, Sunset Park — Soccer Tavern is on your right, green door, three flags. Drive off either end for the Belt.', 4800); });
    return true; }
  // the D to 62 St, the N one stop to 8 Av, up the stairs
  try { pa(ctx, 'This is 62nd Street, New Utrecht Avenue. Transfer is available to the N train.'); } catch {}
  fade(['62 ST · NEW UTRECHT AV', 'TRANSFER TO THE N ↔', '8 AV · SUNSET PARK'], () => { const yaw = Math.atan2(-(-2 - NSTAT.x), -(WALK - 2 - NSTAT.z)); moveTo(NSTAT.x, SW, TZ.oz + NSTAT.z + 1.8, yaw, 0);
    K.toast('8th Ave & 61st, Sunset Park — Soccer Tavern is across the street: green door, three flags. The N back to Coney is right here (F).', 5200); }, 1000);
  return true;
}
function leave(how) {
  if (!Z || Z.busy) return false; const { ctx, W } = Z; restoreRadio();
  if (how === 'belt' || (how === 'car' && ctx.vehicles?.mounted)) {
    if (W.belt?.enter) { Z.busy = true; Z.lastTrip = performance.now() / 1000; W.belt.enter(); setTimeout(() => { Z.busy = false; }, 2000); return true; }
    how = 'N'; }
  if (ctx.vehicles?.mounted) { try { ctx.vehicles.dismount?.(); } catch {} }
  fade(['8 AV · N TRAIN', 'CONEY ISLAND–STILLWELL AV'], () => { moveTo(-47, 0, -226, Math.PI, 0); K.toast('Coney Island–Stillwell Av. The D back to Sunset Park leaves from here (ride it past Bay 50 St).', 4200); });
  return true;
}
function boardsWorld() { return BOARDS.map((b, i) => ({ i, face: new THREE.Vector3(MX(BAR.x1 - 0.09), 1.73, b.z + TZ.oz), normal: new THREE.Vector3(1, 0, 0), oche: new THREE.Vector3(MX(OCHE_X - 0.1), SW, b.z + TZ.oz) })); }
export const tavernChalk = (fn) => { if (Z?.chalk) Z.chalk.draw((g, w, h) => drawChalk(g, w, h, fn)); };
export const tavernZ = () => Z;

// ---------------------------------------------------------------------------------------------------------------------------
// materials: street (lit), atlas (unlit: signs + shop windows glow a little at night), the room (unlit, baked shading)
function mats(lite) {
  const S = (c, r = 0.85, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const B = (o) => new THREE.MeshBasicMaterial(o);
  const t = (w, h, draw, rep) => makeCanvasTex(w, h, draw, rep).tex;
  const q = lite ? 0.5 : 1;
  const M = {
    road: new THREE.MeshStandardMaterial({ map: t(256 * q, 256 * q, (g, w, h) => { noiseFill(g, w, h, '#3b3c3e', 38, 62); g.fillStyle = '#d9b22c'; g.fillRect(0, h / 2 - 5 * q, w, 3 * q); g.fillRect(0, h / 2 + 2 * q, w, 3 * q); g.fillStyle = 'rgba(0,0,0,.18)'; for (const k of [0.3, 0.7]) g.fillRect(0, h * k - 8 * q, w, 16 * q); }, [1, 1]), roughness: 0.92 }),
    cross: new THREE.MeshStandardMaterial({ map: t(128 * q, 128 * q, (g, w, h) => noiseFill(g, w, h, '#3d3e40', 38, 62), [1, 1]), roughness: 0.92 }),
    ground: S(0x2a2b2c, 1),
    walk: new THREE.MeshStandardMaterial({ map: t(256 * q, 256 * q, (g, w, h) => { noiseFill(g, w, h, '#a9a49b', 150, 185); g.strokeStyle = 'rgba(60,55,50,.45)'; g.lineWidth = 2; for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * w / 2, 0); g.lineTo(i * w / 2, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / 2); g.lineTo(w, i * h / 2); g.stroke(); } for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(40,40,40,.25)'; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 4, 0, 7); g.fill(); } }, [1, 1]), roughness: 0.95 }),
    kerb: S(0x8e8a82, 0.9), paint: S(0xe9e6dc, 0.8), side: S(0x6e4436, 0.95), steel: S(0x2a2c2e, 0.5, 0.6),
    lamp: B({ color: 0xffe8b0 }), pool: B({ map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.22, toneMapped: false }), globe: B({ color: 0x3fe07a }), leaf: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    upper: new THREE.MeshStandardMaterial({ map: t(128 * q, 224 * q, (g, w, h) => drawUpper(g, w, h), [1, 1]), vertexColors: true, roughness: 0.9 }),
    prop: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    atlas: B({ side: THREE.DoubleSide }), atlasLit: B({ side: THREE.FrontSide }),
    // the room (unlit: the light is baked into vertex colours / textures)
    floor: B({ map: t(256 * q, 1024 * q, (g, w, h) => drawFloor(g, w, h)) }),
    ceil: B({ map: t(64, 64, (g, w, h) => { g.fillStyle = '#d6d0c2'; g.fillRect(0, 0, w, h); for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(90,80,60,${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 1); } g.fillStyle = '#b8b2a3'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h); }, [1, 1]) }),
    wall: B({ map: t(256 * q, 256 * q, (g, w, h) => drawPanel(g, w, h), [1, 1]) }),
    barWood: B({ map: t(128 * q, 128 * q, (g, w, h) => { noiseFill(g, w, h, '#b2744a', 150, 190); for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(60,25,10,${0.08 + Math.random() * 0.12})`; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); const y = Math.random() * h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + 6, w * 0.6, y - 6, w, y + Math.random() * 4); g.stroke(); } }, [1, 1]), vertexColors: true }),
    pnt: B({ vertexColors: true }), inside: B({ transparent: false }),
    bottle: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  };
  for (const [k, m] of Object.entries(M)) m.name = k;
  return M;
}

// ---- canvas helpers -------------------------------------------------------------------------------------------------------------
function makeCanvasTex(w, h, draw, rep = null) { const c = document.createElement('canvas'); c.width = Math.max(8, Math.round(w)); c.height = Math.max(8, Math.round(h)); const g = c.getContext('2d'); draw(g, c.width, c.height);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; if (rep) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(...rep); }
  return { tex, c, g, draw: (fn) => { fn(g, c.width, c.height); tex.needsUpdate = true; } }; }
function noiseFill(g, w, h, base, lo, hi) { g.fillStyle = base; g.fillRect(0, 0, w, h); for (let i = 0; i < w * h / 10; i++) { const v = lo + Math.random() * (hi - lo); g.fillStyle = `rgba(${v | 0},${v | 0},${(v + 2) | 0},.35)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }
function glowTex() { return makeCanvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,190,120,.9)'); gr.addColorStop(1, 'rgba(255,160,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }).tex; }
class Atlas {
  constructor(S) { this.S = S; this.c = document.createElement('canvas'); this.c.width = this.c.height = S; this.g = this.c.getContext('2d'); }
  pack(jobs) { const S = this.S, pad = 2; const order = jobs.slice().sort((a, b) => b.h - a.h); let x = 0, y = 0, rh = 0;
    for (const j of order) { j.w = Math.min(j.w, S - pad * 2); if (x + j.w + pad > S) { x = 0; y += rh + pad; rh = 0; } if (y + j.h + pad > S) return false; j.px = x + pad; j.py = y + pad; x += j.w + pad * 2; rh = Math.max(rh, j.h + pad); }
    for (const j of jobs) j.rect = { u0: j.px / S, u1: (j.px + j.w) / S, v0: 1 - (j.py + j.h) / S, v1: 1 - j.py / S }; return true; }
  draw(jobs) { const g = this.g; g.fillStyle = '#444'; g.fillRect(0, 0, this.S, this.S); for (const j of jobs) { if (!j.rect) continue; g.save(); g.beginPath(); g.rect(j.px, j.py, j.w, j.h); g.clip(); g.translate(j.px, j.py); try { j.draw(g, j.w, j.h); } catch (e) { console.warn('[tavern] draw', e); } g.restore(); } }
  texture() { const t = new THREE.CanvasTexture(this.c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
}
// geometry helpers
const _L = new THREE.Vector3(0.35, 1, 0.25).normalize();
let BAKE = false;
function shade(g, hex, amb = 0.62) { if (!BAKE) return setColor(g, hex); const n = g.attributes.normal, c = new THREE.Color(hex), col = new Float32Array(n.count * 3); for (let i = 0; i < n.count; i++) { const d = n.getX(i) * _L.x + n.getY(i) * _L.y + n.getZ(i) * _L.z; const k = Math.min(1.25, amb * 0.8 + 0.42 * Math.max(0, d) + 0.12 * (n.getY(i) * 0.5 + 0.5)); col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k; } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g; }
function setColor(g, hex) { const c = new THREE.Color(hex), n = g.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g; }
function scaleUV(g, su, sv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; }
function boxUV(g, m) { const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)); const u = ax > 0.5 ? p.getZ(i) : p.getX(i), v = ay > 0.5 ? p.getZ(i) : p.getY(i); uv.setXY(i, u / m, v / m); } return g; }
function normAttrs(list) { const hasC = list.some((g) => g.attributes.color); for (const g of list) { if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); if (!g.attributes.normal) g.computeVertexNormals(); if (hasC && !g.attributes.color) setColor(g, 0xffffff); if (!hasC && g.attributes.color) g.deleteAttribute('color'); } }
function fireEscape(put, M, cx, fz, sd, gf, floors, w) {
  for (let f = 1; f < floors; f++) { const y = gf + (f - 1) * 3.1 + 0.05, z = fz - sd * 0.65;
    const pl = new THREE.BoxGeometry(w, 0.05, 1.2); pl.translate(cx, y, z); put(M.steel, pl);
    for (const yy of [0.5, 1.0]) { const r = new THREE.BoxGeometry(w, 0.035, 0.035); r.translate(cx, y + yy, fz - sd * 1.24); put(M.steel, r); }
    for (let k = 0; k <= 6; k++) { const b = new THREE.BoxGeometry(0.025, 1.0, 0.025); b.translate(cx - w / 2 + k * w / 6, y + 0.5, fz - sd * 1.24); put(M.steel, b); }
    if (f < floors - 1) { const L = Math.hypot(w * 0.7, 3.1); const st = new THREE.BoxGeometry(L, 0.04, 0.5); st.rotateZ(Math.atan2(3.1, w * 0.7) * (f & 1 ? 1 : -1)); st.translate(cx, y + 1.55, z + sd * 0.25); put(M.steel, st); } }
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---- the shops of 8th Ave (fictional names, the real mix of the avenue) ------------------------------------------------------------
const SHOPS = [
  { zh: '永發餅家', en: 'WING FAT BAKERY', bg: '#b3121e', fg: '#ffd84a', kind: 'bakery', awn: 0xb3121e },
  { zh: '新鮮水果蔬菜', en: 'FRESH FRUIT & VEGETABLES', bg: '#1f7a3a', fg: '#fff', kind: 'fruit', fruit: true, awn: 0x1f7a3a },
  { zh: '德仁堂藥房', en: 'TAK YAN PHARMACY', bg: '#f4f4f0', fg: '#0d6b3a', kind: 'pharmacy' },
  { zh: '環球旅行社', en: 'GLOBAL TRAVEL · 機票 · 簽證', bg: '#1b3f9a', fg: '#fff', kind: 'travel' },
  { zh: '明記燒臘', en: 'MING KEE BBQ · ROAST DUCK', bg: '#c21d1d', fg: '#fff3b0', kind: 'roast', awn: 0x8a1414 },
  { zh: '海鮮魚行', en: 'OCEAN SEAFOOD MARKET', bg: '#0e5a8a', fg: '#fff', kind: 'fish', awn: 0x0e5a8a },
  { zh: '報稅 會計', en: 'TAX · ACCOUNTING · 保險', bg: '#f2c417', fg: '#b3121e', kind: 'office' },
  { zh: '珍珠奶茶', en: 'BUBBLE TEA · 奶茶', bg: '#e35d9a', fg: '#fff', kind: 'tea' },
  { zh: '手機維修', en: 'CELL PHONE REPAIR', bg: '#e8741c', fg: '#fff', kind: 'phone' },
  { zh: '金山超級市場', en: 'GOLD MOUNTAIN SUPERMARKET', bg: '#b3121e', fg: '#fff', kind: 'market', fruit: false, awn: 0xd8a21a },
  { zh: '美髮廳', en: 'HAIR SALON', bg: '#6b2d8a', fg: '#fff', kind: 'salon' },
  { zh: '同仁參茸藥材', en: 'HERBS · GINSENG', bg: '#5a3a1c', fg: '#f2d27a', kind: 'herbs' },
  { zh: '福州麵家', en: 'FUZHOU NOODLE HOUSE', bg: '#d8a21a', fg: '#7a0f0f', kind: 'noodle', awn: 0xa81818 },
  { zh: '全通駕駛學校', en: 'CHUAN TONG DRIVING SCHOOL', bg: '#f2c417', fg: '#c21d1d', kind: 'office' },
  { zh: '華美地產', en: 'HUA MEI REALTY', bg: '#123a6a', fg: '#fff', kind: 'office' },
  { zh: '洗衣', en: 'LAUNDROMAT', bg: '#2a8ab8', fg: '#fff', kind: 'laundry' },
];
const SHOP_6002 = { zh: '點心茶樓', en: '6002 · DIM SUM', bg: '#9a1414', fg: '#ffd84a', kind: 'roast', awn: 0xa81818 };
const SHOP_6006 = { zh: '全通駕駛學校', en: 'CHUAN TONG DRIVING SCHOOL · 718-435-5883', bg: '#f2c417', fg: '#c21d1d', kind: 'office' };

// ---- drawing ------------------------------------------------------------------------------------------------------------------------
function drawUpper(g, w, h) {   // one window bay of a brick walk-up: 1.75 m × 3.1 m
  noiseFill(g, w, h, '#cfcac4', 190, 225); const bh = h / 40; g.strokeStyle = 'rgba(80,60,50,.22)'; g.lineWidth = 1;
  for (let y = 0; y < h; y += bh) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (y / bh) % 2 ? 0 : w / 8; x < w; x += w / 4) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + bh); g.stroke(); } }
  const wx = w * 0.22, ww = w * 0.56, wy = h * 0.22, wh = h * 0.52;
  g.fillStyle = '#d8d2c2'; g.fillRect(wx - 3, wy - 5, ww + 6, 5); g.fillRect(wx - 4, wy + wh, ww + 8, 6);
  const gr = g.createLinearGradient(0, wy, 0, wy + wh); gr.addColorStop(0, '#2c3440'); gr.addColorStop(1, '#171b22'); g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
  g.fillStyle = 'rgba(230,220,190,.55)'; g.fillRect(wx + 2, wy + 2, ww - 4, wh * 0.35);   // blinds half down
  g.fillStyle = '#eee9dc'; g.fillRect(wx, wy + wh / 2 - 1, ww, 3); g.fillRect(wx + ww / 2 - 1, wy, 3, wh);
}
function drawStore(g, w, h, s, metres) {
  const px = w / metres;
  noiseFill(g, w, h, '#3b3a38', 50, 70);
  const band = h * 0.24; g.fillStyle = s.bg; g.fillRect(0, h * 0.02, w, band);
  g.fillStyle = s.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  let fs = band * 0.56; g.font = `700 ${fs}px ${CJK}`; while (g.measureText(s.zh).width > w * 0.9 && fs > 6) { fs -= 1; g.font = `700 ${fs}px ${CJK}`; } g.fillText(s.zh, w / 2, h * 0.02 + band * 0.38);
  fs = band * 0.2; g.font = `700 ${fs}px ${FONT}`; while (g.measureText(s.en).width > w * 0.92 && fs > 4) { fs -= 0.5; g.font = `700 ${fs}px ${FONT}`; } g.fillText(s.en, w / 2, h * 0.02 + band * 0.8);
  // window + door
  const wy = h * 0.3, wh = h * 0.66, dw = 1.0 * px, dx = w - dw - 0.3 * px;
  const gr = g.createLinearGradient(0, wy, 0, wy + wh); const warm = !['fish', 'phone', 'laundry', 'pharmacy'].includes(s.kind);
  gr.addColorStop(0, warm ? '#f6e2b0' : '#e8f0f4'); gr.addColorStop(1, warm ? '#b88a52' : '#8aa0ac'); g.fillStyle = gr; g.fillRect(0.25 * px, wy, dx - 0.5 * px, wh);
  g.fillStyle = '#2a2a2a'; g.fillRect(dx, wy, dw, wh); g.fillStyle = 'rgba(200,220,230,.35)'; g.fillRect(dx + 3, wy + 3, dw - 6, wh * 0.7);
  goods(g, 0.25 * px, wy, dx - 0.5 * px, wh, s.kind, px);
  g.strokeStyle = '#1a1a1a'; g.lineWidth = Math.max(2, px * 0.06); g.strokeRect(0.25 * px, wy, dx - 0.5 * px, wh); g.strokeRect(dx, wy, dw, wh);
  g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, wy - h * 0.035, w, h * 0.035);   // the roll-gate box
  if (s.kind === 'office' || s.kind === 'travel') { g.fillStyle = s.fg === '#fff' ? '#b3121e' : s.fg; g.font = `700 ${wh * 0.14}px ${CJK}`; g.fillText(s.kind === 'travel' ? '機票 · 旅遊' : '報稅 · 移民', (dx) / 2, wy + wh * 0.2); }
}
function goods(g, x, y, w, h, kind, px) {
  const R = (a, b) => a + Math.random() * (b - a);
  if (kind === 'bakery') { for (let r = 0; r < 3; r++) { g.fillStyle = '#c9c2b0'; g.fillRect(x + 4, y + h * (0.35 + r * 0.22), w - 8, 3); for (let i = 0; i < w / (px * 0.18); i++) { g.fillStyle = r === 1 ? '#f2c230' : pick(['#e8b04a', '#d4893a', '#f0d9a0']); g.beginPath(); g.ellipse(x + 8 + i * px * 0.18, y + h * (0.32 + r * 0.22), px * 0.07, px * 0.035, 0, 0, 7); g.fill(); } } }
  else if (kind === 'roast') { for (let i = 0; i < w / (px * 0.45); i++) { g.fillStyle = pick(['#8a3a12', '#a4521c', '#6e2a0c']); g.beginPath(); g.ellipse(x + px * 0.3 + i * px * 0.45, y + h * 0.35, px * 0.14, px * 0.28, 0, 0, 7); g.fill(); g.fillStyle = '#ddd'; g.fillRect(x + px * 0.3 + i * px * 0.45 - 1, y + h * 0.05, 2, h * 0.08); } }
  else if (kind === 'fruit' || kind === 'market') { for (let r = 0; r < 4; r++) for (let i = 0; i < w / 6; i++) { g.fillStyle = pick(['#f08a1c', '#c8231d', '#e0407a', '#6aa33a', '#e8d23a', '#3a7a2a']); g.fillRect(x + i * 6, y + h * (0.45 + r * 0.13), 5, 5); } }
  else if (kind === 'fish') { for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(60,140,190,.7)'; g.fillRect(x + 6 + i * (w - 12) / 3, y + h * 0.3, (w - 12) / 3 - 6, h * 0.45); g.fillStyle = 'rgba(255,255,255,.5)'; for (let k = 0; k < 6; k++) g.fillRect(x + 10 + i * (w - 12) / 3 + R(0, (w - 12) / 3 - 20), y + h * R(0.35, 0.7), 8, 3); } }
  else if (kind === 'pharmacy' || kind === 'herbs' || kind === 'phone') { for (let r = 0; r < 5; r++) for (let i = 0; i < w / 5; i++) { g.fillStyle = pick(kind === 'herbs' ? ['#8a5a2a', '#c9a45a', '#6e4a2a', '#b3121e'] : ['#e04a3a', '#3a7ae0', '#f2f2f2', '#2ab070', '#f2c230']); g.fillRect(x + 3 + i * 5, y + h * (0.12 + r * 0.17), 4, h * 0.1); } }
  else if (kind === 'tea') { g.fillStyle = '#fff'; g.fillRect(x + w * 0.2, y + h * 0.12, w * 0.6, h * 0.4); g.fillStyle = '#e35d9a'; g.font = `700 ${h * 0.07}px ${CJK}`; g.textAlign = 'center'; for (let i = 0; i < 4; i++) g.fillText(['珍珠奶茶 $6', '芒果冰沙 $7', '水果茶 $6', 'TARO $6'][i], x + w / 2, y + h * (0.19 + i * 0.09)); }
  else if (kind === 'salon') { for (let i = 0; i < 3; i++) { g.fillStyle = '#222'; g.fillRect(x + w * (0.15 + i * 0.28), y + h * 0.5, w * 0.14, h * 0.3); g.fillStyle = '#ddd'; g.fillRect(x + w * (0.13 + i * 0.28), y + h * 0.15, w * 0.18, h * 0.25); } }
  else if (kind === 'laundry') { for (let i = 0; i < w / (px * 0.7); i++) { g.fillStyle = '#ddd'; g.fillRect(x + 4 + i * px * 0.7, y + h * 0.5, px * 0.6, px * 0.6); g.fillStyle = '#556'; g.beginPath(); g.arc(x + 4 + i * px * 0.7 + px * 0.3, y + h * 0.5 + px * 0.3, px * 0.2, 0, 7); g.fill(); } }
  else if (kind === 'noodle') { for (let i = 0; i < w / (px * 0.8); i++) { g.fillStyle = '#7a0f0f'; g.fillRect(x + 6 + i * px * 0.8, y + h * 0.55, px * 0.6, h * 0.05); g.fillStyle = '#f2e6c0'; g.beginPath(); g.arc(x + 6 + i * px * 0.8 + px * 0.3, y + h * 0.5, px * 0.12, 0, 7); g.fill(); } }
  else { g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(x + w * 0.1, y + h * 0.35, w * 0.8, h * 0.4); for (let i = 0; i < 6; i++) { g.fillStyle = '#9aa'; g.fillRect(x + w * 0.15, y + h * (0.4 + i * 0.05), w * 0.7 * Math.random(), 2); } }
}
function brick(g, x0, y0, w, h, px, base = '#7a3222') {   // running bond, px = pixels per metre
  g.fillStyle = '#6a5a4e'; g.fillRect(x0, y0, w, h); const bw = 0.2 * px, bh = 0.0667 * px;
  for (let y = y0, r = 0; y < y0 + h; y += bh, r++) for (let x = x0 - (r & 1 ? bw / 2 : 0); x < x0 + w; x += bw) { const v = Math.random() * 30 - 15, c = base.match(/\w\w/g).map((q) => Math.max(0, Math.min(255, parseInt(q, 16) + v + (Math.random() < 0.08 ? -30 : 0)))); g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; g.fillRect(x + 0.6, y + 0.6, bw - 1.2, bh - 1.2); }
}
function drawTavernFacade(g, W, H, mw, mh) {   // the whole two-storey front, 0 = left edge as seen from the street
  const px = W / mw, Y = (m) => H - m * px, X = (m) => m * px;   // metres from the bottom-left
  brick(g, 0, 0, W, H, px);
  // second floor: a double window (left, the red 廣東 card in it), the blue sign between, a single window (right)
  const win = (x, w, y, h, fn) => { g.fillStyle = '#e9e6de'; g.fillRect(X(x) - 5, Y(y + h) - 5, X(w) + 10, X(h) + 10); g.fillStyle = '#20252c'; g.fillRect(X(x), Y(y + h), X(w), X(h)); g.fillStyle = '#e9e6de'; g.fillRect(X(x + w / 2) - 3, Y(y + h), 6, X(h)); g.fillRect(X(x), Y(y + h * 0.55), X(w), 5); g.fillStyle = 'rgba(220,210,180,.4)'; g.fillRect(X(x) + 3, Y(y + h) + 3, X(w) - 6, X(h * 0.4)); if (fn) fn(); g.fillStyle = '#d3cdbf'; g.fillRect(X(x) - 10, Y(y) , X(w) + 20, 10); };
  win(1.4, 1.9, 4.8, 1.65, () => { g.fillStyle = '#c21d1d'; g.fillRect(X(2.55), Y(6.1), X(0.45), X(0.75)); g.fillStyle = '#ffd84a'; g.font = `700 ${X(0.26)}px ${CJK}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('廣', X(2.775), Y(5.88)); g.fillText('東', X(2.775), Y(5.55)); });
  win(6.3, 1.1, 4.8, 1.65, () => { g.fillStyle = 'rgba(240,240,235,.8)'; for (let i = 0; i < 12; i++) g.fillRect(X(6.3) + 2, Y(6.4) + i * X(0.12), X(1.1) - 4, X(0.06)); });
  // the blue sign: 329 Services Corp.
  { const x = X(3.6), y = Y(6.45), w = X(2.3), h = X(1.25); g.fillStyle = '#fff'; g.fillRect(x - 4, y - 4, w + 8, h + 8); g.fillStyle = '#1238a8'; g.fillRect(x, y, w, h); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `600 ${h * 0.09}px ${FONT}`; g.fillText('329 Services Corp.', x + w / 2, y + h * 0.1); g.font = `700 ${h * 0.14}px ${CJK}`; g.fillText('梅小姐罰單處理中心', x + w / 2, y + h * 0.26); g.font = `700 ${h * 0.11}px ${FONT}`; g.fillText('TRAFFIC TICKET', x + w / 2, y + h * 0.42);
    g.font = `500 ${h * 0.075}px ${CJK}`; g.fillText('行車違規 - 紅燈, 超速, 停牌吊銷', x + w / 2, y + h * 0.56); g.fillText('刑事法庭 - 酒後駕駛, 危險駕駛', x + w / 2, y + h * 0.66); g.fillText('泊車違例 - DOT/TLC 全美違規', x + w / 2, y + h * 0.76); g.font = `700 ${h * 0.12}px ${FONT}`; g.fillText('347-799-4196', x + w / 2, y + h * 0.9); }
  // the stone band under the second floor
  g.fillStyle = '#b7aa98'; g.fillRect(0, Y(4.35), W, X(0.12));
  // parapet: stepped, darker, a coping
  g.fillStyle = '#6a5a4c'; g.fillRect(0, 0, W, X(0.12)); g.fillStyle = '#9a8a78'; g.fillRect(X(3.2), Y(mh - 0.05), X(2.3), X(0.08));
  // ground floor (u runs left→right as seen from the street; the model's x runs the other way: left edge = building x1 = 2.7)
  const L = (x) => X(2.7 - x);   // model x → canvas x
  // the neon window (left of the door): dark room, a pink/blue neon beer sign, the "A" health grade card
  { const x = L(1.9), w = L(0.55) - L(1.9); g.fillStyle = '#151218'; g.fillRect(x, Y(2.1), w, X(1.2)); g.strokeStyle = '#1d1d1d'; g.lineWidth = 6; g.strokeRect(x, Y(2.1), w, X(1.2));
    g.shadowColor = '#ff4fa0'; g.shadowBlur = X(0.12); g.strokeStyle = '#ff6fb4'; g.lineWidth = X(0.03); g.font = `italic 700 ${X(0.3)}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.strokeText('Coors', x + w / 2 + X(0.08), Y(1.62));
    g.shadowColor = '#4fb4ff'; g.strokeStyle = '#7fd0ff'; g.font = `700 ${X(0.16)}px ${FONT}`; g.strokeText('LIGHT', x + w / 2 + X(0.1), Y(1.3)); g.shadowColor = '#5aff7a'; g.strokeStyle = '#6aff8a'; g.beginPath(); g.arc(x + w / 2 + X(0.1), Y(1.5), X(0.5), Math.PI * 1.1, Math.PI * 1.9); g.stroke(); g.shadowBlur = 0;
    g.fillStyle = '#fff'; g.fillRect(x + X(0.06), Y(1.35), X(0.22), X(0.28)); g.fillStyle = '#1b50a8'; g.font = `700 ${X(0.2)}px ${FONT}`; g.fillText('A', x + X(0.17), Y(1.21)); }
  // the door opening itself is a hole in the mesh; frame it + the address on the jamb
  { const x = L(DOOR[1]), w = L(DOOR[0]) - L(DOOR[1]); g.fillStyle = '#0d0d0d'; g.fillRect(x, Y(SW + 2.35), w, X(2.35)); g.fillStyle = '#244a36'; g.fillRect(x - 8, Y(SW + 2.45), w + 16, X(0.1)); g.fillRect(x - 8, Y(SW + 2.35), 8, X(2.35)); g.fillRect(x + w, Y(SW + 2.35), 8, X(2.35)); }
  // the picture window (right of the door): a framed print of an old team, lit
  { const x = L(-1.3), w = L(-2.8) - L(-1.3); g.fillStyle = '#6d8fb8'; g.fillRect(x, Y(2.2), w, X(1.1)); g.fillStyle = '#e8dcc0'; g.fillRect(x + X(0.12), Y(2.08), w - X(0.24), X(0.86)); g.fillStyle = '#3a2a1a'; for (let r = 0; r < 2; r++) for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(x + X(0.3) + i * (w - X(0.5)) / 6, Y(1.8 - r * 0.3), X(0.06), 0, 7); g.fill(); g.fillRect(x + X(0.25) + i * (w - X(0.5)) / 6, Y(1.74 - r * 0.3), X(0.1), X(0.16)); } g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(x, Y(2.2), w, X(1.1)); }
  // yellow signs right of the window: 欣欣護理中心 / 廣東駕駛學校, the vertical ones, blue 報稅 二樓
  { const x = L(-2.95), w = L(-5.9) - L(-2.95); g.fillStyle = '#f2d21a'; g.fillRect(x, Y(3.3), w, X(0.75)); g.fillStyle = '#1a1a1a'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${X(0.24)}px ${CJK}`; g.fillText('欣欣護理中心', x + w / 2, Y(3.1)); g.fillStyle = '#1238a8'; g.fillText('廣東駕駛學校', x + w / 2, Y(2.78)); g.fillStyle = '#333'; g.font = `600 ${X(0.08)}px ${FONT}`; g.fillText('TEL: 646-683-1500 · 6004 8th Ave 2FL Suite#202', x + w / 2, Y(2.6));
    const vx = L(-3.0); g.fillStyle = '#f2d21a'; g.fillRect(vx, Y(2.45), X(0.95), X(1.9)); g.fillStyle = '#1238a8'; g.font = `700 ${X(0.2)}px ${CJK}`; const c1 = '欣欣護理中心', c2 = '廣東駕駛學校'; [...c1].forEach((c, i) => g.fillText(c, vx + X(0.28), Y(2.3 - i * 0.28))); g.fillStyle = '#c21d1d'; [...c2].forEach((c, i) => g.fillText(c, vx + X(0.68), Y(2.3 - i * 0.28)));
    g.fillStyle = '#1238a8'; g.fillRect(vx + X(0.3), Y(0.52), X(0.45), X(0.9)); g.fillStyle = '#ffd84a'; g.font = `700 ${X(0.2)}px ${CJK}`; g.fillText('報', vx + X(0.52), Y(1.3)); g.fillText('稅', vx + X(0.52), Y(1.05)); g.fillStyle = '#fff'; g.font = `700 ${X(0.12)}px ${CJK}`; g.fillText('二樓', vx + X(0.52), Y(0.72));
    g.fillStyle = '#fff'; g.fillRect(vx - X(0.1), Y(0.62), X(0.35), X(0.14)); g.fillStyle = '#222'; g.font = `700 ${X(0.1)}px ${FONT}`; g.fillText('6004', vx + X(0.075), Y(0.55)); }
  // the upstairs door (green, 6004, a flyer taped on)
  { const x = L(-4.6), w = L(-5.7) - L(-4.6); g.fillStyle = '#1f4a38'; g.fillRect(x, Y(2.3), w, X(2.3)); g.strokeStyle = '#123024'; g.lineWidth = 4; g.strokeRect(x + 6, Y(2.2), w - 12, X(2.1)); g.fillStyle = '#fff'; g.fillRect(x + w * 0.35, Y(2.1), w * 0.3, X(0.12)); g.fillStyle = '#222'; g.font = `700 ${X(0.09)}px ${FONT}`; g.textAlign = 'center'; g.fillText('6004', x + w / 2, Y(2.04));
    g.fillStyle = '#d8e8f8'; g.fillRect(x + w * 0.25, Y(1.5), w * 0.5, X(0.6)); g.fillStyle = '#1b3f9a'; g.font = `700 ${X(0.08)}px ${CJK}`; g.fillText('雪場', x + w / 2, Y(1.35)); g.fillStyle = '#444'; g.fillRect(x + w * 0.5 - X(0.2), Y(0.5), X(0.4), X(0.05)); }
  // grime at the bottom
  const gr = g.createLinearGradient(0, Y(0.8), 0, H); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(20,15,10,.45)'); g.fillStyle = gr; g.fillRect(0, Y(0.8), W, X(0.8));
}
function drawFlag(g, w, h, k) {
  if (k === 'no') { g.fillStyle = '#ba0c2f'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(w * 0.27, 0, w * 0.19, h); g.fillRect(0, h * 0.375, w, h * 0.25); g.fillStyle = '#00205b'; g.fillRect(w * 0.31, 0, w * 0.11, h); g.fillRect(0, h * 0.44, w, h * 0.125); }
  else if (k === 'ie') { ['#169b62', '#ffffff', '#ff883e'].forEach((c, i) => { g.fillStyle = c; g.fillRect(i * w / 3, 0, w / 3 + 1, h); }); }
  else { for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#fff' : '#b22234'; g.fillRect(0, i * h / 13, w, h / 13 + 1); } g.fillStyle = '#3c3b6e'; g.fillRect(0, 0, w * 0.4, h * 7 / 13); g.fillStyle = '#fff'; for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) { g.beginPath(); g.arc(w * 0.03 + c * w * 0.065, h * 0.05 + r * h * 0.1, Math.max(1, w * 0.008), 0, 7); g.fill(); } }
  g.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i < 5; i++) g.fillRect(i * w / 5 + w / 10, 0, w / 22, h);
}
function drawFloor(g, w, h) {   // worn planks along the room + coloured light spill from the neon / string lights
  g.fillStyle = '#6a5040'; g.fillRect(0, 0, w, h); const pw = w / 10;
  for (let i = 0; i < 10; i++) for (let y = -Math.random() * 200; y < h; y += 150 + Math.random() * 120) { const v = Math.random() * 30 - 15; g.fillStyle = `rgb(${110 + v},${84 + v},${66 + v})`; g.fillRect(i * pw + 1, y, pw - 2, 148); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(i * pw, y, pw, 2); }
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(30,20,10,${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 8, 1); }
  const spill = (x, y, r, c) => { const gr = g.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
  g.globalCompositeOperation = 'lighter'; spill(w * 0.55, h * 0.2, w * 0.25, 'rgba(70,60,190,.45)'); spill(w * 0.4, h * 0.34, w * 0.2, 'rgba(150,50,160,.35)'); spill(w * 0.6, h * 0.55, w * 0.3, 'rgba(120,80,40,.3)'); spill(w * 0.25, h * 0.7, w * 0.22, 'rgba(120,80,40,.3)'); spill(w * 0.75, h * 0.8, w * 0.18, 'rgba(40,110,60,.3)'); g.globalCompositeOperation = 'source-over';
  const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(0,0,0,.35)'); gr.addColorStop(0.15, 'rgba(0,0,0,0)'); gr.addColorStop(0.85, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.35)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
}
function drawPanel(g, w, h) {   // honey wood panelling, darker at the floor, a chair rail
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#b27a44'); gr.addColorStop(0.6, '#9c6536'); gr.addColorStop(1, '#5e3a1e'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const bw = w / 6; for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(${i % 2 ? 40 : 90},${i % 2 ? 20 : 50},10,.12)`; g.fillRect(i * bw, 0, bw, h); g.fillStyle = 'rgba(30,15,5,.55)'; g.fillRect(i * bw, 0, 2, h);
    for (let k = 0; k < 14; k++) { g.strokeStyle = `rgba(60,30,10,${0.05 + Math.random() * 0.1})`; g.lineWidth = 1; g.beginPath(); const x = i * bw + Math.random() * bw; g.moveTo(x, 0); g.bezierCurveTo(x + 5, h * 0.3, x - 5, h * 0.6, x + 2, h); g.stroke(); } }
  g.fillStyle = 'rgba(255,225,170,.18)'; g.fillRect(0, 0, w, h * 0.1);
}
function drawBackBar(g, w, h) {   // mirror band behind packed shelves, garland lights, a stocking, the register
  g.fillStyle = '#1a120c'; g.fillRect(0, 0, w, h);
  const my = h * 0.05, mh = h * 0.58; const gr = g.createLinearGradient(0, my, 0, my + mh); gr.addColorStop(0, '#5a6a74'); gr.addColorStop(0.5, '#3a4650'); gr.addColorStop(1, '#2a323a'); g.fillStyle = gr; g.fillRect(w * 0.02, my, w * 0.96, mh);
  g.fillStyle = 'rgba(255,255,255,.08)'; for (let i = 0; i < 12; i++) { g.save(); g.translate(Math.random() * w, my); g.rotate(0.5); g.fillRect(0, 0, 8 + Math.random() * 20, mh * 1.4); g.restore(); }
  const shelf = (y, n, big) => { g.fillStyle = '#7a8a8c'; g.fillRect(0, y, w, 4); for (let i = 0; i < n; i++) { const x = (i + 0.5) * w / n + (Math.random() - 0.5) * 3, bw = w / n * 0.72, bh = (big ? h * 0.17 : h * 0.12) * (0.75 + Math.random() * 0.4);
      const c = pick(['#6b3a12', '#2e5a1e', '#d8e2e0', '#8a4a14', '#1d3b22', '#b9772a', '#3a1a0c', '#e8e0c8', '#5a0f1a', '#9fb8c0', '#c9a44a', '#224']); g.fillStyle = c; g.fillRect(x - bw / 2, y - bh, bw, bh); g.fillRect(x - bw / 6, y - bh - bh * 0.3, bw / 3, bh * 0.3);
      g.fillStyle = pick(['#f2ead0', '#111', '#c9a44a', '#fff', '#b3121e']); g.fillRect(x - bw / 2 + 1, y - bh * 0.62, bw - 2, bh * 0.3); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x - bw / 2 + 1, y - bh, 2, bh); } };
  shelf(h * 0.33, Math.floor(w / 14), true); shelf(h * 0.63, Math.floor(w / 12), false);
  g.fillStyle = '#2a1a10'; g.fillRect(0, h * 0.64, w, h * 0.36);   // lower cabinet (behind the 3-D one)
  for (let i = 0; i < w / 40; i++) { g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(i * 40, h * 0.66, 2, h * 0.34); }
  // the register + a stack of receipts, a stocking
  g.fillStyle = '#222'; g.fillRect(w * 0.42, h * 0.52, w * 0.08, h * 0.1); g.fillStyle = '#6aff8a'; g.fillRect(w * 0.43, h * 0.53, w * 0.03, h * 0.02);
  g.fillStyle = '#c21d1d'; g.fillRect(w * 0.93, h * 0.12, w * 0.02, h * 0.18); g.fillStyle = '#fff'; g.fillRect(w * 0.925, h * 0.1, w * 0.03, h * 0.03);
}
function drawBoard(g, w, h) {   // a regulation board face: 20 at the top, trebles and doubles in red/green, bulls
  const cx = w / 2, cy = h / 2, R = w / 2 * 0.98, k = R / 225; const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
  g.fillStyle = '#111'; g.fillRect(0, 0, w, h); g.fillStyle = '#0c0c0c'; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
  const ring = (r0, r1, colA, colB) => { for (let i = 0; i < 20; i++) { const a0 = -Math.PI / 2 + (i - 0.5) * Math.PI / 10, a1 = a0 + Math.PI / 10; g.fillStyle = i % 2 ? colB : colA; g.beginPath(); g.arc(cx, cy, r1 * k, a0, a1); g.arc(cx, cy, r0 * k, a1, a0, true); g.closePath(); g.fill(); } };
  ring(15.9, 170, '#1a1a1a', '#efe4c8'); ring(99, 107, '#c8202a', '#1f8a3a'); ring(162, 170, '#c8202a', '#1f8a3a');
  g.fillStyle = '#1f8a3a'; g.beginPath(); g.arc(cx, cy, 15.9 * k, 0, 7); g.fill(); g.fillStyle = '#c8202a'; g.beginPath(); g.arc(cx, cy, 6.35 * k, 0, 7); g.fill();
  g.strokeStyle = '#b8b8b8'; g.lineWidth = Math.max(1, k * 0.9); for (const r of [6.35, 15.9, 99, 107, 162, 170]) { g.beginPath(); g.arc(cx, cy, r * k, 0, 7); g.stroke(); }
  for (let i = 0; i < 20; i++) { const a = -Math.PI / 2 + (i - 0.5) * Math.PI / 10; g.beginPath(); g.moveTo(cx + Math.cos(a) * 15.9 * k, cy + Math.sin(a) * 15.9 * k); g.lineTo(cx + Math.cos(a) * 170 * k, cy + Math.sin(a) * 170 * k); g.stroke(); }
  g.fillStyle = '#e8e8e8'; g.font = `700 ${22 * k}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; ORDER.forEach((n, i) => { const a = -Math.PI / 2 + i * Math.PI / 10; g.fillText(String(n), cx + Math.cos(a) * 196 * k, cy + Math.sin(a) * 196 * k); });
}
function drawTrophies(g, w, h) { g.fillStyle = '#6a4a2e'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2ead0'; g.font = `700 ${h * 0.2}px Georgia, serif`; g.textAlign = 'center'; g.fillText('BROOKLYN DART LEAGUE · CHAMPIONS', w / 2, h * 0.3); g.font = `600 ${h * 0.14}px Georgia, serif`; g.fillText('1987 · 1994 · 2003 · 2011 · 2019 · 2023', w / 2, h * 0.62); g.strokeStyle = '#c9a44a'; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6); }
function drawMenu(g, w, h) { g.fillStyle = '#1c2a22'; g.fillRect(0, 0, w, h); g.strokeStyle = '#6a4a2e'; g.lineWidth = 8; g.strokeRect(0, 0, w, h); g.fillStyle = '#f2efe4'; g.textAlign = 'left'; g.font = `700 ${h * 0.12}px "Marker Felt","Chalkboard SE",cursive`;
  const L = [['TSINGTAO 青島', '$6'], ['COORS LIGHT', '$5'], ['GUINNESS PINT', '$8'], ['JAMESON · VODKA SHOT', '$7'], ['BUCKET (5 BEERS)', '$25']]; L.forEach(([a, b], i) => { g.fillText(a, w * 0.06, h * (0.18 + i * 0.16)); g.textAlign = 'right'; g.fillText(b, w * 0.94, h * (0.18 + i * 0.16)); g.textAlign = 'left'; });
  g.fillStyle = '#f2c417'; g.font = `700 ${h * 0.09}px ${FONT}`; g.fillText('CASH ONLY · 只收現金', w * 0.06, h * 0.95); }
function drawCoors(g, w, h) { g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8a8f96'; g.lineWidth = 5; g.strokeRect(3, 3, w - 6, h - 6); g.shadowColor = '#fff'; g.shadowBlur = 8; g.fillStyle = '#e8eef4'; g.font = `italic 700 ${h * 0.34}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Coors', w * 0.45, h * 0.42); g.fillStyle = '#c8202a'; g.font = `700 ${h * 0.2}px ${FONT}`; g.fillText('LIGHT', w * 0.72, h * 0.44); g.shadowBlur = 0;
  g.fillStyle = '#8fb8e0'; g.beginPath(); g.moveTo(w * 0.1, h * 0.85); g.lineTo(w * 0.3, h * 0.62); g.lineTo(w * 0.45, h * 0.78); g.lineTo(w * 0.6, h * 0.58); g.lineTo(w * 0.9, h * 0.85); g.fill(); }
function drawPhoto(g, w, h, i) { g.fillStyle = '#1a1208'; g.fillRect(0, 0, w, h); g.fillStyle = i % 3 ? '#d8c8a0' : '#c0c0c0'; g.fillRect(w * 0.08, h * 0.1, w * 0.84, h * 0.8); g.fillStyle = i % 3 ? '#5a4020' : '#333';
  if (i % 2) for (let r = 0; r < 2; r++) for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(w * (0.18 + k * 0.13), h * (0.35 + r * 0.25), w * 0.04, 0, 7); g.fill(); g.fillRect(w * (0.15 + k * 0.13), h * (0.4 + r * 0.25), w * 0.06, h * 0.12); }
  else { g.fillRect(w * 0.2, h * 0.5, w * 0.6, h * 0.3); g.beginPath(); g.arc(w * 0.5, h * 0.35, w * 0.12, 0, 7); g.fill(); } }
function drawClippings(g, w, h) { g.fillStyle = '#4a2e1a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 4; i++) { const x = w * (0.05 + (i % 2) * 0.48), y = h * (0.05 + Math.floor(i / 2) * 0.48); g.fillStyle = '#e9e0c8'; g.fillRect(x, y, w * 0.44, h * 0.42); g.fillStyle = '#222'; g.font = `700 ${h * 0.06}px Georgia, serif`; g.fillText(['SOCCER BAR 60 YEARS', 'DART TEAM WINS AGAIN', 'LAPSKAUS BLVD', 'SUNSET PARK TONIGHT'][i], x + 4, y + h * 0.08); for (let k = 0; k < 7; k++) g.fillRect(x + 4, y + h * (0.14 + k * 0.035), w * 0.4 * (0.6 + Math.random() * 0.4), 1.5); } }
function drawBanner(g, w, h) { g.fillStyle = '#c8102e'; g.fillRect(0, 0, w, h); g.fillStyle = '#f6eb61'; g.font = `700 ${h * 0.2}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText("YOU'LL NEVER", w / 2, h * 0.3); g.fillText('WALK ALONE', w / 2, h * 0.55); g.font = `700 ${h * 0.14}px ${FONT}`; g.fillStyle = '#fff'; g.fillText('SUNSET PARK · BROOKLYN', w / 2, h * 0.82); g.strokeStyle = '#f6eb61'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12); }
function drawClock(g, w, h) { g.fillStyle = '#2a1a10'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2ecd8'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.45, 0, 7); g.fill(); g.strokeStyle = '#222'; g.lineWidth = 2; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * w * 0.36, h / 2 + Math.sin(a) * w * 0.36); g.lineTo(w / 2 + Math.cos(a) * w * 0.42, h / 2 + Math.sin(a) * w * 0.42); g.stroke(); }
  g.lineWidth = 4; g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + w * 0.2, h / 2 - w * 0.12); g.stroke(); g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 - w * 0.05, h / 2 - w * 0.33); g.stroke(); }
function drawJukebox(g, w, h) { g.fillStyle = '#1a0f0a'; g.fillRect(0, 0, w, h); const gr = g.createLinearGradient(0, 0, w, 0); ['#ff3a3a', '#ffb13a', '#fff05a', '#5aff7a', '#3ab8ff', '#b05aff'].forEach((c, i, a) => gr.addColorStop(i / (a.length - 1), c));
  g.strokeStyle = gr; g.lineWidth = w * 0.06; g.beginPath(); g.arc(w / 2, h * 0.3, w * 0.4, Math.PI, 0); g.lineTo(w * 0.9, h * 0.95); g.moveTo(w * 0.1, h * 0.3); g.lineTo(w * 0.1, h * 0.95); g.stroke();
  g.fillStyle = '#20303a'; g.fillRect(w * 0.2, h * 0.22, w * 0.6, h * 0.25); g.fillStyle = '#9fe0ff'; g.font = `700 ${h * 0.035}px ${FONT}`; g.textAlign = 'center'; g.fillText('LUNA PARK RADIO', w / 2, h * 0.28); g.fillStyle = '#e8e0c8'; for (let i = 0; i < 6; i++) g.fillRect(w * 0.26, h * (0.31 + i * 0.025), w * 0.48, h * 0.012);
  g.fillStyle = '#c9a44a'; g.fillRect(w * 0.2, h * 0.52, w * 0.6, h * 0.04); for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#e8e0c8' : '#b3121e'; g.fillRect(w * (0.22 + (i % 6) * 0.095), h * (0.6 + Math.floor(i / 6) * 0.05), w * 0.07, h * 0.035); }
  g.fillStyle = '#6a5040'; g.fillRect(w * 0.2, h * 0.75, w * 0.6, h * 0.17); g.fillStyle = '#2a1a10'; for (let i = 0; i < 8; i++) g.fillRect(w * 0.22, h * (0.77 + i * 0.018), w * 0.56, h * 0.008); }
function drawScarf(g, w, h, t, a, b) { g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b; for (let i = 0; i < w; i += h * 1.2) g.fillRect(i, 0, h * 0.35, h); g.fillStyle = a; g.fillRect(w * 0.2, h * 0.12, w * 0.6, h * 0.76); g.fillStyle = b; g.font = `700 ${h * 0.62}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, w / 2, h * 0.55); }
/** the match on the TVs: a pitch seen from the TV gantry, 22 players drifting after the ball, the score bug, a ticker */
function drawMatch(g, w, h, t) {
  g.fillStyle = '#2f7a2e'; g.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#2c742b' : '#348233'; g.fillRect(i * w / 8, 0, w / 8, h); }
  g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = Math.max(1, w / 220); g.strokeRect(w * 0.04, h * 0.12, w * 0.92, h * 0.76); g.beginPath(); g.moveTo(w / 2, h * 0.12); g.lineTo(w / 2, h * 0.88); g.stroke(); g.beginPath(); g.arc(w / 2, h / 2, h * 0.14, 0, 7); g.stroke();
  g.strokeRect(w * 0.04, h * 0.3, w * 0.12, h * 0.4); g.strokeRect(w * 0.84, h * 0.3, w * 0.12, h * 0.4);
  const bx = w / 2 + Math.sin(t * 0.37) * w * 0.33 + Math.sin(t * 1.3) * w * 0.05, by = h / 2 + Math.sin(t * 0.53 + 1) * h * 0.28;
  for (let i = 0; i < 22; i++) { const home = i < 11, sx = (home ? 0.2 : 0.8) + ((i % 11) % 4) * (home ? 0.14 : -0.14) * 0.8, sy = 0.2 + ((i * 7) % 11) / 11 * 0.6;
    const x = w * sx * 0.6 + bx * 0.4 + Math.sin(t * (0.7 + i * 0.05) + i) * w * 0.02, y = h * sy * 0.6 + by * 0.4 + Math.cos(t * (0.6 + i * 0.04) + i) * h * 0.03;
    g.fillStyle = home ? '#c8102e' : '#f4f4f4'; g.fillRect(x - w * 0.006, y - h * 0.018, w * 0.012, h * 0.036); }
  g.fillStyle = '#fff'; g.beginPath(); g.arc(bx, by, Math.max(1.2, w * 0.005), 0, 7); g.fill();
  const min = 23 + Math.floor((Date.now() / 1000 / 60) % 67); g.fillStyle = 'rgba(10,20,50,.85)'; g.fillRect(w * 0.03, h * 0.03, w * 0.34, h * 0.09); g.fillStyle = '#fff'; g.font = `700 ${h * 0.065}px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillText(`LIV 1-0 CEL  ${min}'`, w * 0.045, h * 0.077);
  g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(0, h * 0.9, w, h * 0.1); g.fillStyle = '#ffd84a'; g.font = `600 ${h * 0.055}px ${FONT}`; const tick = 'BROOKLYN DART LEAGUE: SOCCER TAVERN vs 8 AV · TUE 8PM  ·  HAPPY HOUR 4-7  ·  CASH ONLY  ·  ';
  const off = (t * 40) % (tick.length * h * 0.03); g.fillText(tick + tick, w - off, h * 0.95);
}
/** the chalkboard by the darts: darts.js hands in fn(g, w, h) to write the live score; idle: "DARTS · 501 · F at the oche" */
function drawChalk(g, w, h, fn) {
  g.fillStyle = '#1e2b24'; g.fillRect(0, 0, w, h); for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 6, 1); }
  g.fillStyle = '#eeeae0'; g.font = `700 ${h * 0.1}px "Marker Felt","Chalkboard SE",cursive`; g.textAlign = 'center';
  if (fn) { try { fn(g, w, h); } catch (e) { console.warn('[tavern] chalk', e); } return; }
  g.fillText('DARTS', w / 2, h * 0.2); g.font = `600 ${h * 0.07}px "Marker Felt","Chalkboard SE",cursive`; g.fillText('501 · double out', w / 2, h * 0.36); g.fillText('1 v 1  ·  2 v 2', w / 2, h * 0.5); g.fillText('F at the line to play', w / 2, h * 0.66);
  g.fillText('LEAGUE NIGHT TUESDAY', w / 2, h * 0.86);
}
