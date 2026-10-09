// CONEY — the R160 car kit for the F (coney/subway.js builds, moves and boards the train; this file makes it look and sound
// like one). Every car is baked into a handful of meshes per car: stainless (fluted lower panels, planar UVs), one "trim"
// atlas (black window band, skirt, trucks, wheels, rubber, bullet, car numbers …), interior atlas (walls, blue-grey benches,
// parody ad cards, stickers), speckled rubber floor, ceiling light panels, and one shared LED canvas (exterior destination
// signs, the FIND strip map over the doors, the next-stop line) that is redrawn only when the text changes. Door leaves are
// stainless + glass + black rubber edges in the sliding door groups (userData.door). Sound: wheel clack over the rail joints
// (per axle of the car you ride), traction-motor whine on acceleration / braking, PA voice via speechSynthesis.
import * as THREE from 'three';

const cnv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const tex = (c, srgb = true, rep = false) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
const CARNO = [8412, 8413, 8414, 8415, 8416, 8417];

// ---- textures ------------------------------------------------------------------------------------------------------------
// trim atlas: 4 × 4 cells of 64 px. [colour, roughness, metalness]
/** the rect [x0,x1]×[y0,y1] minus window openings [[x0,x1,y0,y1] …], as a few solid rects (vertical strips, each split around the
 *  openings that cross it) */
function frameAround(x0, x1, y0, y1, holes) {
  const xs = [x0, x1, ...holes.flatMap((h) => [h[0], h[1]])].filter((x) => x >= x0 && x <= x1).sort((a, b) => a - b), out = [];
  for (let i = 0; i + 1 < xs.length; i++) { const a = xs[i], b = xs[i + 1]; if (b - a < 1e-3) continue; const m = (a + b) / 2;
    const cuts = holes.filter((h) => m > h[0] && m < h[1]).map((h) => [Math.max(y0, h[2]), Math.min(y1, h[3])]).filter(([p, q]) => q > p).sort((p, q) => p[0] - q[0]);
    let y = y0; for (const [p, q] of cuts) { if (p - y > 1e-3) out.push([a, b, y, p]); y = Math.max(y, q); } if (y1 - y > 1e-3) out.push([a, b, y, y1]); }
  return out;
}
const TRIM = { black: 0, steel: 1, skirt: 2, truck: 3, wheel: 4, bullet: 5, yellow: 6, white: 7, rubber: 8, num0: 9, num1: 10, num2: 11, grey: 12, red: 13, dkglass: 14, amber: 15 };
function trimAtlas(rt) {
  const [c, g] = cnv(256, 256), [cm, gm] = cnv(256, 256);
  const cells = [['#0c0d0f', 0.3, 0.3], ['#c4c8cc', 0.3, 0.92], ['#2b2c2e', 0.8, 0.35], ['#221e1b', 0.85, 0.45], ['#6d6f71', 0.35, 0.95], ['#0c0d0f', 0.4, 0.1], ['#f2c418', 0.55, 0.1], ['#e9e9e6', 0.6, 0.05],
    ['#101112', 0.9, 0], ['#c4c8cc', 0.32, 0.9], ['#c4c8cc', 0.32, 0.9], ['#c4c8cc', 0.32, 0.9], ['#7b8085', 0.55, 0.6], ['#b3261e', 0.5, 0.1], ['#0f1318', 0.08, 0.5], ['#e08a1a', 0.5, 0.1]];
  cells.forEach(([col, r, m], i) => { const x = (i % 4) * 64, y = (i >> 2) * 64; g.fillStyle = col; g.fillRect(x, y, 64, 64); gm.fillStyle = `rgb(0,${r * 255 | 0},${m * 255 | 0})`; gm.fillRect(x, y, 64, 64); });
  // brushing on the steel cells, grime on the skirt / trucks, corrugation on the diaphragm
  for (const i of [1, 9, 10, 11]) { const x = (i % 4) * 64, y = (i >> 2) * 64; for (let k = 0; k < 64; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '40,44,48'},${0.04 + Math.random() * 0.05})`; g.fillRect(x, y + k, 64, 1); } }
  for (const i of [2, 3]) { const x = (i % 4) * 64, y = (i >> 2) * 64; for (let k = 0; k < 90; k++) { g.fillStyle = `rgba(${70 + Math.random() * 40 | 0},${50 + Math.random() * 20 | 0},30,${Math.random() * 0.35})`; g.fillRect(x + Math.random() * 64, y + Math.random() * 64, 2 + Math.random() * 6, 1 + Math.random() * 4); } }
  { const x = 0, y = 128; for (let k = 0; k < 64; k += 6) { g.fillStyle = '#26282a'; g.fillRect(x, y + k, 64, 2); } }
  // F bullet (orange disc on black)
  { const x = 64, y = 64; g.fillStyle = rt.color; g.beginPath(); g.arc(x + 32, y + 32, 28, 0, 7); g.fill(); g.fillStyle = rt.fg; g.font = '700 38px Helvetica, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(rt.id, x + 32, y + 35); }
  // car numbers: two per cell (top / bottom half), black on stainless
  g.font = '700 22px Helvetica, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#16181a';
  CARNO.forEach((n, k) => { const i = 9 + (k >> 1), x = (i % 4) * 64, y = (i >> 2) * 64 + (k & 1) * 32; g.fillText(String(n), x + 32, y + 17); });
  const map = tex(c), mr = tex(cm, false); return { map, mr };
}
/** remap a geometry's 0…1 uvs into atlas cell i (grid n × n), optionally a sub-rect [u0, v0, u1, v1] of the cell */
function cellUV(geo, i, n = 4, sub = [0, 0, 1, 1], inset = 0.06) {
  const uv = geo.attributes.uv, cu = (i % n) / n, cv = 1 - ((i / n | 0) + 1) / n, s = 1 / n;
  for (let k = 0; k < uv.count; k++) { const u = sub[0] + (sub[2] - sub[0]) * (inset + uv.getX(k) * (1 - 2 * inset)), v = sub[1] + (sub[3] - sub[1]) * (inset + uv.getY(k) * (1 - 2 * inset)); uv.setXY(k, cu + u * s, cv + v * s); }
  return geo;
}
function bodyTex() {   // fluted stainless, 8 flutes per tile, a band of grime at the bottom (v = 0)
  const [c, g] = cnv(64, 128), [cn, gn] = cnv(64, 4);
  g.fillStyle = '#c3c7cb'; g.fillRect(0, 0, 64, 128);
  for (let x = 0; x < 64; x++) { const s = Math.sin((x / 8) * Math.PI * 2); g.fillStyle = s > 0 ? `rgba(255,255,255,${s * 0.06})` : `rgba(30,34,38,${-s * 0.07})`; g.fillRect(x, 0, 1, 128); }
  const gr = g.createLinearGradient(0, 70, 0, 128); gr.addColorStop(0, 'rgba(70,58,44,0)'); gr.addColorStop(1, 'rgba(58,48,36,0.55)'); g.fillStyle = gr; g.fillRect(0, 70, 64, 58);
  for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(60,50,38,${Math.random() * 0.25})`; g.fillRect(Math.random() * 64, 90 + Math.random() * 38, 1, 2 + Math.random() * 10); }
  for (let x = 0; x < 64; x++) { const d = Math.cos((x / 8) * Math.PI * 2); gn.fillStyle = `rgb(${128 + d * 90 | 0},128,255)`; gn.fillRect(x, 0, 1, 4); }
  const map = tex(c); map.wrapS = THREE.RepeatWrapping; const nm = tex(cn, false); nm.wrapS = nm.wrapT = THREE.RepeatWrapping; return { map, nm };
}
function floorTex() {
  const [c, g] = cnv(128, 128); g.fillStyle = '#5a5956'; g.fillRect(0, 0, 128, 128);
  for (let k = 0; k < 900; k++) { const v = Math.random(); g.fillStyle = v < 0.45 ? '#3b3a38' : v < 0.8 ? '#7d7b76' : v < 0.93 ? '#a8a49b' : '#c4b58a'; g.fillRect(Math.random() * 128, Math.random() * 128, 1 + (Math.random() < 0.3), 1); }
  return tex(c, true, true);
}
// interior atlas 512 × 256: 8 ad cards (128 × 64) on top, 16 small 64 × 64 cells below
const INT = { wall: 0, seatB: 1, seatG: 2, ceil: 3, hold: 4, lean: 5, steel: 6, strap: 7, yellow: 8, emerg: 9, wallDk: 10 };
const ADS = [
  ['#1d4f91', '#fff', 'DR. BORIS', 'SKIN DOCTOR', 'Your face, but less Brighton.', '1-718-NO-ACNE'],
  ['#c8102e', '#fff', 'COUSIN VLAD', 'ATTORNEY AT LAW*', 'Slipped on the boardwalk? We sue.', '*not an attorney'],
  ['#f5d000', '#111', 'PELMENI EXPRESS', 'DELIVERY', 'Hotter than the F in August.', 'Faster too.'],
  ['#0a7d4f', '#fff', 'LEARN ENGLISH', 'IN 3 DAYS', 'Or 30 years. Like Uncle Misha.', 'Brighton Language Academy'],
  ['#2a2a2a', '#ffcf3a', 'SERGEI MATTRESS', 'SALE SALE SALE', 'So cheap you will sleep', 'on the train anyway.'],
  ['#7a2a8c', '#fff', 'BABUSHKA CARE', 'HOME AIDES', 'She will feed you. You cannot', 'say no. Nobody can.'],
  ['#e36b00', '#fff', 'KEFIR NOT VODKA', 'Dept. of Health (Brighton)', 'Your liver called.', 'It is not happy.'],
  ['#1b75bc', '#fff', 'NATASHA\'S DOGS', 'ON SURF AVE', 'Not the famous ones.', 'Better. Ask anyone.'],
];
function intAtlas(lite) {
  const [c, g] = cnv(512, 256); g.textAlign = 'center'; g.textBaseline = 'middle';
  if (!lite) ADS.forEach(([bg, fg, h1, h2, l1, l2], i) => { const x = (i % 4) * 128, y = (i >> 2) * 64; g.fillStyle = bg; g.fillRect(x, y, 128, 64); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x, y, 128, 3);
    const fit = (txt, w, px, yy) => { let f = px; do { g.font = `${w} ${f}px Helvetica, Arial`; f -= 0.5; } while (g.measureText(txt).width > 118 && f > 5); g.fillText(txt, x + 64, y + yy); };
    g.fillStyle = fg; fit(h1, 800, 15, 13); fit(h2, 700, 9, 26); fit(l1, 500, 9, 40); fit(l2, 500, 9, 52); });
  const cells = ['#dcdad2', '#4d6b8e', '#8b9197', '#f0f0ec', '#f2c418', '#f2c418', '#c9cdd1', '#141414', '#f2c418', '#c8102e', '#b9b7af'];
  cells.forEach((col, i) => { const x = (i % 8) * 64, y = 128 + (i >> 3) * 64; g.fillStyle = col; g.fillRect(x, y, 64, 64); });
  for (const i of [1, 2]) { const x = (i % 8) * 64; for (let k = 0; k < 64; k += 4) { g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(x, 128 + k, 64, 1); } }
  g.fillStyle = '#111'; g.font = '800 10px Helvetica, Arial'; g.fillText('PLEASE', 4 * 64 + 32, 128 + 24); g.fillText('HOLD ON', 4 * 64 + 32, 128 + 38);
  g.font = '800 8px Helvetica, Arial'; g.fillText('DO NOT LEAN', 5 * 64 + 32, 128 + 24); g.fillText('ON DOORS', 5 * 64 + 32, 128 + 38);
  g.fillStyle = '#fff'; g.font = '800 8px Helvetica, Arial'; g.fillText('EMERGENCY', 1 * 64 + 32, 192 + 26); g.fillText('BRAKE', 1 * 64 + 32, 192 + 38);
  return tex(c);
}
function intUV(geo, i) {   // small cells: 8 × 2 grid in the lower half
  const uv = geo.attributes.uv, cu = (i % 8) / 8, cv = 0.5 - ((i >> 3) + 1) * 0.25;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, cu + (0.08 + uv.getX(k) * 0.84) / 8, cv + (0.08 + uv.getY(k) * 0.84) * 0.25);
  return geo;
}
function adUV(geo, i) { const uv = geo.attributes.uv, cu = (i % 4) / 4, cv = 1 - ((i >> 2) + 1) * 0.25; for (let k = 0; k < uv.count; k++) uv.setXY(k, cu + uv.getX(k) / 4, cv + uv.getY(k) * 0.25); return geo; }
// LED canvas 512 × 256: row 0 the destination sign, row 1 the FIND strip map, row 2 the next-stop line
function ledCanvas() { const [c, g] = cnv(512, 256); const t = tex(c); return { c, g, t }; }
function rowUV(geo, r, u0 = 0, u1 = 1) { const uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), 1 - (r + 1) * 0.25 + uv.getY(k) * 0.25); return geo; }

// ---- the car --------------------------------------------------------------------------------------------------------------
const SHARED = {};   // textures every line shares (the trim atlas carries the line's bullet, the LED canvas its signs)
export function makeR160(scene, { CAR, NCAR, FLOOR, DOORZ, lite, route = { id: 'F', color: '#ff6319', fg: '#fff' } }) {
  const trim = trimAtlas(route), body = SHARED.body || (SHARED.body = bodyTex()), led = ledCanvas();
  const M = {
    body: new THREE.MeshStandardMaterial({ map: body.map, normalMap: body.nm, normalScale: new THREE.Vector2(0.3, 0.3), roughness: 0.34, metalness: 0.88 }),
    trim: new THREE.MeshStandardMaterial({ map: trim.map, roughnessMap: trim.mr, metalnessMap: trim.mr, roughness: 1, metalness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fb4bd, roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide }),
    // the cab's windshield and storm window: what the driver looks through from a hand's width away, so barely there (the side
    // windows' reflective glass read as a milky sheet over the whole view)
    cabGlass: new THREE.MeshStandardMaterial({ color: 0x1c2a30, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.15 }),
    int: new THREE.MeshStandardMaterial({ map: SHARED.int || (SHARED.int = intAtlas(lite)), roughness: 0.62, metalness: 0.02 }),
    floor: new THREE.MeshStandardMaterial({ map: SHARED.floor || (SHARED.floor = floorTex()), roughness: 0.92 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf2f6ff, emissiveIntensity: 1.5 }),
    led: new THREE.MeshStandardMaterial({ color: 0x000000, map: led.t, emissive: 0xffffff, emissiveMap: led.t, emissiveIntensity: 1.25, roughness: 0.4 }),
    ind: new THREE.MeshStandardMaterial({ color: 0x3a2a08, emissive: 0xffb020, emissiveIntensity: 0 }),
  };
  const W = 3.0, H = 3.3, L = CAR - 0.4, hL = L / 2, F = FLOOR, lz = DOORZ;
  const segs = [[-hL, lz[0] - 0.65], [lz[0] + 0.65, lz[1] - 0.65], [lz[1] + 0.65, lz[2] - 0.65], [lz[2] + 0.65, lz[3] - 0.65], [lz[3] + 0.65, hL]];
  const cars = [];
  for (let c = 0; c < NCAR; c++) {
    const g = new THREE.Group(); g.name = 'fTrainCar'; scene.add(g);
    const cab = c === 0 || c === NCAR - 1, cabE = c === 0 ? 1 : -1;   // which end is the cab
    const add = (geo, m, x, y, z, o = {}) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); if (o.ry) me.rotation.y = o.ry; if (o.rz) me.rotation.z = o.rz; if (o.rx) me.rotation.x = o.rx; me.castShadow = !!o.sh; me.receiveShadow = true; if (o.door) me.userData.door = o.door; g.add(me); return me; };
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const T = (i, w, h, d, x, y, z, o) => add(cellUV(box(w, h, d), i), M.trim, x, y, z, o);
    const I = (i, w, h, d, x, y, z, o) => add(intUV(box(w, h, d), i), M.int, x, y, z, o);
    const bodyBox = (w, h, d, x, y, z, o) => { const geo = box(w, h, d); geo.translate(x, y, z); const p = geo.attributes.position, uv = geo.attributes.uv;
      for (let k = 0; k < p.count; k++) uv.setXY(k, (p.getZ(k) + p.getX(k)) / 0.55, (p.getY(k) - (F - 0.42)) / 1.45); return add(geo, M.body, 0, 0, 0, o); };
    // floor, underframe, skirt
    add((() => { const geo = box(W - 0.1, 0.12, L); const p = geo.attributes.position, uv = geo.attributes.uv; for (let k = 0; k < p.count; k++) uv.setXY(k, p.getZ(k) / 1.4, p.getX(k) / 1.4); return geo; })(), M.floor, 0, F - 0.06, 0);
    T(TRIM.skirt, W - 0.12, 0.5, L - 0.2, 0, F - 0.4, 0, { sh: true });
    // sides: fluted lower panel, black window band with glass, stainless upper panel, roof cove
    for (const sx of [-1, 1]) {
      for (const [z0, z1] of segs) { const l = z1 - z0, zc = (z0 + z1) / 2;
        bodyBox(0.06, 1.37, l, sx * W / 2, F + 0.95 / 2 - 0.42 / 2, zc, { sh: true });
        T(TRIM.black, 0.07, 0.12, l, sx * W / 2, F + 1.0, zc); T(TRIM.black, 0.07, 0.12, l, sx * W / 2, F + 1.82, zc);
        add(box(0.02, 0.72, l - 0.1), M.glass, sx * W / 2, F + 1.41, zc);
        const nW = Math.max(1, Math.round(l / 1.6)); for (let k = 1; k < nW; k++) T(TRIM.black, 0.075, 0.72, 0.1, sx * W / 2, F + 1.41, z0 + l * k / nW);   // mullions
        T(TRIM.steel, 0.06, H - 1.88, l, sx * W / 2, F + 1.88 + (H - 1.88) / 2, zc, { sh: true });
        // interior: wall panels below / above the windows, benches, ads
        I(INT.wall, 0.04, 0.95, l, sx * (W / 2 - 0.06), F + 0.5, zc); I(INT.wall, 0.04, 0.5, l, sx * (W / 2 - 0.06), F + 2.1, zc);
        const seat = (z0 === -hL || z1 === hL) ? INT.seatG : INT.seatB, bl = l - 0.5;
        if (bl > 0.8) { I(seat, 0.46, 0.08, bl, sx * (W / 2 - 0.33), F + 0.43, zc); I(seat, 0.08, 0.42, bl, sx * (W / 2 - 0.12), F + 0.68, zc, { rz: sx * 0.12 }); I(INT.wallDk, 0.4, 0.38, bl - 0.1, sx * (W / 2 - 0.33), F + 0.2, zc);
          for (const e of [z0 + 0.22, z1 - 0.22]) T(TRIM.steel, 0.5, 0.05, 0.05, sx * (W / 2 - 0.3), F + 0.78, e); }   // stainless armrest / partition bar at the bench ends
        if (!lite) { const nAd = Math.max(1, Math.floor(l / 1.05)); for (let k = 0; k < nAd; k++) add(adUV(new THREE.PlaneGeometry(0.92, 0.3), (c * 3 + k * 5 + (sx > 0 ? 1 : 4) + Math.round(zc)) & 7), M.int, sx * (W / 2 - 0.18), F + 2.2, z0 + l * (k + 0.5) / nAd, { ry: -sx * Math.PI / 2, rz: 0 }).rotateOnAxis(new THREE.Vector3(1, 0, 0), -0.32); }
        // horizontal grab bar above the bench, yellow tips
        if (bl > 0.8) { const bar = new THREE.CylinderGeometry(0.018, 0.018, bl, 8); bar.rotateX(Math.PI / 2); add(cellUV(bar, TRIM.steel), M.trim, sx * 0.98, F + 1.95, zc);
          if (!lite) for (let k = 0; k < Math.floor(bl / 0.9); k++) { T(TRIM.black, 0.02, 0.2, 0.05, sx * 0.98, F + 1.83, z0 + 0.7 + k * 0.9); T(TRIM.black, 0.1, 0.02, 0.06, sx * 0.98, F + 1.72, z0 + 0.7 + k * 0.9); } }   // hanging straps
      }
      // door openings: black rubber frame, yellow threshold, door-open indicator light, sliding leaves
      for (const dz of lz) {
        T(TRIM.steel, 0.06, H - 2.02, 1.3, sx * W / 2, F + 2.02 + (H - 2.02) / 2, dz, { sh: true });
        for (const e of [-0.66, 0.66]) T(TRIM.black, 0.08, 2.02, 0.05, sx * W / 2, F + 1.01, dz + e);
        T(TRIM.black, 0.08, 0.06, 1.36, sx * W / 2, F + 2.02, dz); T(TRIM.yellow, 0.3, 0.02, 1.26, sx * (W / 2 - 0.15), F + 0.005, dz);
        add(box(0.05, 0.07, 0.16), M.ind, sx * (W / 2 + 0.03), F + 2.18, dz + 0.78);
        for (const dir of [-1, 1]) { const zc = dz + dir * 0.32, d = { sx, dir };
          T(TRIM.steel, 0.05, 1.02, 0.64, sx * W / 2, F + 0.51, zc, { door: d, sh: true }); T(TRIM.steel, 0.05, 0.22, 0.64, sx * W / 2, F + 1.9, zc, { door: d });
          for (const e of [-0.28, 0.28]) T(TRIM.steel, 0.05, 0.8, 0.08, sx * W / 2, F + 1.41, zc + e, { door: d });
          add(box(0.02, 0.8, 0.5), M.glass, sx * W / 2, F + 1.41, zc, { door: d });
          T(TRIM.black, 0.07, 2.0, 0.04, sx * W / 2, F + 1.0, dz + dir * 0.02, { door: d });                          // rubber nosing where the leaves meet
        }
        // FIND strip map over the door (inside) + the stainless door pole
        add(rowUV(new THREE.PlaneGeometry(1.25, 0.16), 1), M.led, sx * (W / 2 - 0.08), F + 2.2, dz, { ry: -sx * Math.PI / 2 });
        if (!lite) add(intUV(new THREE.PlaneGeometry(0.16, 0.16), INT.hold), M.int, sx * (W / 2 - 0.08), F + 1.4, dz - sx * 0.75, { ry: -sx * Math.PI / 2 });
      }
      // side LED destination sign in the window band + car numbers under the windows at both ends
      add(rowUV(new THREE.PlaneGeometry(1.1, 0.14), 0), M.led, sx * (W / 2 + 0.045), F + 1.66, lz[2] + 1.35 * sx, { ry: sx * Math.PI / 2 });
      for (const ez of [-hL + 0.9, hL - 0.9]) add(cellUV(new THREE.PlaneGeometry(0.5, 0.13), TRIM.num0 + (c >> 1), 4, [0, (c & 1) ? 0 : 0.5, 1, (c & 1) ? 0.5 : 1], 0.02), M.trim, sx * (W / 2 + 0.035), F + 0.82, ez, { ry: sx * Math.PI / 2 });
      add(cellUV(new THREE.PlaneGeometry(0.34, 0.34), TRIM.bullet), M.trim, sx * (W / 2 + 0.035), F + 2.55, cabE * (hL - 1.2) * (cab ? 1 : 0) + (cab ? 0 : hL - 1.2), { ry: sx * Math.PI / 2 });
    }
    // roof: flat centre + sloped edges, two A/C units, rain gutters
    T(TRIM.steel, W - 0.7, 0.08, L, 0, F + H + 0.1, 0, { sh: true });
    for (const sx of [-1, 1]) T(TRIM.steel, 0.42, 0.08, L, sx * (W / 2 - 0.17), F + H - 0.0, 0, { rz: -sx * 0.42, sh: true });
    for (const az of [-L / 4, L / 4]) T(TRIM.grey, 1.9, 0.26, 3.2, 0, F + H + 0.27, az, { sh: true });
    // ceiling, light panels, poles, end walls
    I(INT.ceil, W - 0.3, 0.03, L - 0.1, 0, F + 2.42, 0);
    for (const sx of [-1, 1]) add(box(0.2, 0.03, L - 1.2), M.lamp, sx * 0.55, F + 2.4, 0);
    for (const dz of lz) { const p = new THREE.CylinderGeometry(0.022, 0.022, 2.42, 10); add(cellUV(p, TRIM.steel), M.trim, 0, F + 1.21, dz); T(TRIM.yellow, 0.05, 0.05, 0.05, 0, F + 1.99, dz); }
    for (const zz of [-hL, hL]) {
      const isCab = cab && Math.sign(zz) === cabE, s = Math.sign(zz);
      // outer end: fluted below, steel above, gangway door window or the cab windshield
      bodyBox(W, 1.37, 0.08, 0, F + 0.95 / 2 - 0.42 / 2, zz, { sh: true });
      // the steel above the fluting: on a cab end it's cut round the windshield and the storm window (a solid slab here covered the
      // top two thirds of the driver's view)
      const winCab = [[-0.72 * s - 0.475, -0.72 * s + 0.475, F + 1.26, F + 1.98], [0.05 * s - 0.25, 0.05 * s + 0.25, F + 1.045, F + 1.995]];
      if (isCab) { for (const [x0, x1, y0, y1] of frameAround(-W / 2, W / 2, F + 1.44, F + H, winCab)) T(TRIM.steel, x1 - x0, y1 - y0, 0.08, (x0 + x1) / 2, (y0 + y1) / 2, zz + s * 0.001, { sh: true }); }
      else T(TRIM.steel, W, H - 1.88 + 0.44, 0.08, 0, F + 1.88 + (H - 1.88) / 2 - 0.22, zz + s * 0.001, { sh: true });
      if (isCab) {
        // the operator's windshield is on the right-hand side looking out of either end (x mirrors with the end), the storm door
        // window by the middle. Both are real glass: the black mask and the inside end wall are frames around them, so the driver
        // (coney/subway.js puts you in the cab) sees the track ahead
        const wx = -0.72 * s, win = [[wx - 0.475, wx + 0.475, F + 1.26, F + 1.98], [0.05 * s - 0.25, 0.05 * s + 0.25, F + 1.045, F + 1.995]];
        for (const [x0, x1, y0, y1] of frameAround(-(W - 0.35) / 2, (W - 0.35) / 2, F + 1.095, F + 2.345, win)) T(TRIM.black, x1 - x0, y1 - y0, 0.04, (x0 + x1) / 2, (y0 + y1) / 2, zz + s * 0.05);   // the black cab mask
        for (const [x0, x1, y0, y1] of win) add(box(x1 - x0, y1 - y0, 0.02), M.cabGlass, (x0 + x1) / 2, (y0 + y1) / 2, zz + s * 0.075);
        add(rowUV(new THREE.PlaneGeometry(1.0, 0.16), 0, 0.12, 1), M.led, 0.62 * s, F + 2.18, zz + s * 0.08, { ry: s > 0 ? 0 : Math.PI });
        add(cellUV(new THREE.PlaneGeometry(0.3, 0.3), TRIM.bullet), M.trim, 0.62 * s, F + 1.82, zz + s * 0.08, { ry: s > 0 ? 0 : Math.PI });
        add(cellUV(new THREE.PlaneGeometry(0.46, 0.12), TRIM.num0 + (c >> 1), 4, [0, (c & 1) ? 0 : 0.5, 1, (c & 1) ? 0.5 : 1], 0.02), M.trim, -0.72 * s, F + 1.1, zz + s * 0.08, { ry: s > 0 ? 0 : Math.PI });
        for (const sx of [-1, 1]) T(TRIM.steel, 0.25, H - 0.2, 0.3, sx * (W / 2 - 0.1), F + H / 2 - 0.3, zz - s * 0.05, { ry: -sx * s * 0.5, sh: true });   // the rounded corners
        T(TRIM.skirt, W - 0.3, 0.4, 0.12, 0, F - 0.35, zz + s * 0.05, { sh: true });                                     // anticlimber
        const hl = new THREE.MeshStandardMaterial({ color: 0xfffbe8, emissive: 0xfff4d0, emissiveIntensity: 0 }), mk = new THREE.MeshStandardMaterial({ color: 0x331b08, emissive: 0xffa028, emissiveIntensity: 0 }); g.userData.head = hl; g.userData.mark = mk;
        for (const sx of [-1, 1]) { add(new THREE.CircleGeometry(0.11, 14), hl, sx * 1.05, F + 0.62, zz + s * 0.09, { ry: s > 0 ? 0 : Math.PI });
          add(new THREE.CircleGeometry(0.075, 12), mk, sx * 1.1, F + 2.92, zz + s * 0.09, { ry: s > 0 ? 0 : Math.PI }); }
      } else {
        T(TRIM.dkglass, 0.62, 0.8, 0.02, 0, F + 1.5, zz + s * 0.045); add(box(0.62, 0.8, 0.02), M.glass, 0, F + 1.5, zz - s * 0.06);
        T(TRIM.rubber, 1.3, 2.3, 0.2, 0, F + 1.1, zz + s * 0.13, { sh: true });                                         // diaphragm to the next car
        T(TRIM.steel, 0.05, 1.1, 0.05, 0.55, F + 1.0, zz + s * 0.25);                                                   // safety chain post
      }
      // inside of the end: wall, the end door with its window, next-stop LED over it
      // a cab end's inside wall has the windshield cut out of it (the storm window is in the open middle)
      const cut = isCab ? [[-0.72 * s - 0.475, -0.72 * s + 0.475, F + 1.26, F + 1.98]] : [];
      for (const x of [-0.95, 0.95]) for (const [x0, x1, y0, y1] of frameAround(x - 0.5, x + 0.5, F, F + H - 0.9, cut)) I(INT.wall, x1 - x0, y1 - y0, 0.04, (x0 + x1) / 2, (y0 + y1) / 2, zz - s * 0.06);
      I(INT.wall, 0.9, 0.5, 0.04, 0, F + 2.15, zz - s * 0.06); I(INT.wall, 0.9, 1.1, 0.04, 0, F + 0.55, zz - s * 0.065);
      add(rowUV(new THREE.PlaneGeometry(1.3, 0.16), 2), M.led, 0, F + 2.3, zz - s * 0.09, { ry: s > 0 ? Math.PI : 0 });
      if (!lite) add(intUV(new THREE.PlaneGeometry(0.22, 0.22), INT.emerg), M.int, 0.95 * s, F + 1.6, zz - s * 0.085, { ry: s > 0 ? Math.PI : 0 });   // on the side away from the windshield (which mirrors with the end)
    }
    // under the car: trucks (side frames, wheels, motors, third-rail shoe beams), equipment boxes between them
    for (const tz of [-(CAR / 2 - 2.6), CAR / 2 - 2.6]) {
      T(TRIM.truck, 1.9, 0.22, 0.5, 0, 0.72, tz, { sh: true });                                                       // bolster
      for (const sx of [-1, 1]) { T(TRIM.truck, 0.18, 0.34, 2.9, sx * 0.9, 0.52, tz, { sh: true }); T(TRIM.grey, 0.14, 0.2, 0.2, sx * 0.9, 0.78, tz - 0.6); T(TRIM.grey, 0.14, 0.2, 0.2, sx * 0.9, 0.78, tz + 0.6);
        T(TRIM.truck, 0.5, 0.06, 0.35, sx * 1.55, 0.32, tz + 1.05); T(TRIM.truck, 0.06, 0.3, 0.1, sx * 1.3, 0.45, tz + 1.05); }   // shoe beam + paddle
      for (const wz of [-1.05, 1.05]) { for (const wx of [-0.75, 0.75]) { const w = new THREE.CylinderGeometry(0.43, 0.43, 0.14, 18); w.rotateZ(Math.PI / 2); add(cellUV(w, TRIM.wheel), M.trim, wx, 0.43, tz + wz, { sh: true }); }
        const ax = new THREE.CylinderGeometry(0.07, 0.07, 1.5, 8); ax.rotateZ(Math.PI / 2); add(cellUV(ax, TRIM.truck), M.trim, 0, 0.43, tz + wz);
        const mo = new THREE.CylinderGeometry(0.27, 0.27, 0.9, 12); mo.rotateZ(Math.PI / 2); add(cellUV(mo, TRIM.skirt), M.trim, 0, 0.45, tz + wz * 0.45); }
    }
    for (const [ez, ew] of [[-3.2, 2.4], [0.6, 1.6], [3.6, 2.0]]) T(TRIM.skirt, 2.3, 0.55, ew, 0, F - 0.7, ez, { sh: true });
    cars.push(g);
  }
  return { cars, M, led };
}

// ---- LED text --------------------------------------------------------------------------------------------------------------
/** redraw the shared LED canvas: dest ('JAM' | 'STW'), strip map with index cur (at / last stop) and nxt lit, next-stop line */
export function drawLED(L, rt, fw, cur, nxt, line, blink) {   // rt: the line's cfg (id, color, fg, dest, strip); fw: outbound
  const { g, t } = L; g.fillStyle = '#050505'; g.fillRect(0, 0, 512, 256);
  // row 0: the destination sign, amber LED
  g.fillStyle = rt.color; g.beginPath(); g.arc(34, 32, 24, 0, 7); g.fill(); g.fillStyle = rt.fg; g.font = '700 32px Helvetica, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(rt.id, 34, 34);
  const [d1, d2] = (fw ? rt.dest.out : rt.dest.in).split('|'); g.fillStyle = '#ffae3a'; g.textAlign = 'left'; g.font = '700 30px "Courier New", monospace'; g.fillText(d1, 72, d2 ? 22 : 34); if (d2) { g.font = '700 22px "Courier New", monospace'; g.fillText(d2, 72, 48); }
  // row 1: FIND strip map: a line with a dot per stop, names above, the next stop lit red (blinking), passed stops dim
  const STR = rt.strip, y0 = 64, n = STR.length, x0 = 22, dx = (512 - 44) / (n - 1);
  g.fillStyle = '#1a1a1a'; g.fillRect(0, y0, 512, 64); g.fillStyle = rt.color; g.fillRect(x0, y0 + 44, 512 - 44, 4);
  for (let i = 0; i < n; i++) { const k = fw ? i : n - 1 - i, x = x0 + dx * i, passed = fw ? k < cur : k > cur;
    const lit = k === nxt ? (blink ? '#ff2020' : '#5a0a0a') : k === cur ? '#ffd24a' : passed ? '#3a3a3a' : '#e8e8e8';
    g.fillStyle = lit; g.beginPath(); g.arc(x, y0 + 46, k === nxt || k === cur ? 6 : 4, 0, 7); g.fill();
    g.save(); g.translate(x, y0 + 36); g.rotate(-0.55); g.font = `${k === nxt ? 700 : 500} 11px Helvetica, Arial`; g.fillStyle = k === nxt ? '#ff5a4a' : passed ? '#555' : '#ddd'; g.textAlign = 'left'; g.fillText(STR[k], 0, 0); g.restore(); }
  // row 2: red LED text line
  g.fillStyle = '#ff3a2a'; g.font = '700 26px "Courier New", monospace'; g.textAlign = 'center'; g.fillText(line, 256, 160);
  t.needsUpdate = true;
}

// ---- sound --------------------------------------------------------------------------------------------------------------
/** ride audio on the game's AudioContext: wheel clack (call click()), motor whine; gain follows the game's volume settings */
export function rideAudio(ctx) {
  let A = null;
  const vol = () => (ctx.audio?.muted ? 0 : (ctx.settings?.masterVolume ?? 1) * (ctx.settings?.sfxVolume ?? 1));
  const init = () => { if (A) return A; const ac = ctx.audio?.context || new (window.AudioContext || window.webkitAudioContext)(); const out = ac.createGain(); out.connect(ac.destination);
    const mk = (type, f) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6; bp.frequency.value = f; const gg = ac.createGain(); gg.gain.value = 0; o.connect(bp).connect(gg).connect(out); o.start(); return { o, bp, gg }; };
    const nb = ac.createBuffer(1, ac.sampleRate * 0.12 | 0, ac.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.012));
    A = { ac, out, w1: mk('sawtooth', 300), w2: mk('triangle', 750), nb }; return A; };
  return {
    get ac() { return A?.ac || ctx.audio?.context || null; }, get out() { return A?.out || null; }, vol,
    update(on, speed, acc) {
      try { if (!on) { if (A) A.out.gain.value = 0; return; } init(); if (A.ac.state === 'suspended') A.ac.resume();
        A.out.gain.value = vol(); const k = Math.min(1, speed / 13), a = Math.min(1, Math.abs(acc) / 1.2);
        const f = 140 + speed * 62; A.w1.o.frequency.value = f; A.w1.bp.frequency.value = f; A.w2.o.frequency.value = f * 2.52; A.w2.bp.frequency.value = f * 2.52;
        A.w1.gg.gain.value = (0.035 * a + 0.006 * k) * (speed > 0.3 ? 1 : 0); A.w2.gg.gain.value = (0.018 * a) * (speed > 0.3 ? 1 : 0); } catch {}
    },
    click(speed, when = 0) {   // one wheel over a rail joint: a sharp tick + a low thump
      try { init(); const ac = A.ac, t = ac.currentTime + when, k = Math.min(1, speed / 13);
        const s = ac.createBufferSource(); s.buffer = A.nb; const hp = ac.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 900 + Math.random() * 400; hp.Q.value = 1.2; const gg = ac.createGain(); gg.gain.value = 0.12 + 0.3 * k; s.connect(hp).connect(gg).connect(A.out); s.start(t);
        const o = ac.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.09); const og = ac.createGain(); og.gain.setValueAtTime(0.18 * k + 0.04, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); o.connect(og).connect(A.out); o.start(t); o.stop(t + 0.14); } catch {}
    },
  };
}
/** the PA: a canned-sounding voice (speechSynthesis) when there is one and the game isn't muted */
export function pa(ctx, text) {
  try { const S = window.speechSynthesis; if (!S || ctx.audio?.muted || ctx.qs?.get?.('qa')) return; const v = (ctx.settings?.masterVolume ?? 1) * (ctx.settings?.sfxVolume ?? 1); if (v <= 0.01) return;
    S.cancel(); const u = new SpeechSynthesisUtterance(text.replace(/–/g, ' ').replace(/\bSt\b/g, 'Street').replace(/\bAv\b/g, 'Avenue')); u.rate = 1.02; u.pitch = 0.92; u.volume = Math.min(1, v * 0.9);
    const vs = S.getVoices(), en = vs.find((x) => /en-US/.test(x.lang) && /male|Alex|Fred|Daniel|Google US/i.test(x.name)) || vs.find((x) => /en-US/.test(x.lang)); if (en) u.voice = en; S.speak(u); } catch {}
}
