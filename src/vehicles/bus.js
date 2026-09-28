// MTA 40 ft low-floor city bus (NovaBus LFS / New Flyer XD40 proportions), built in the carkit frame (+x = front, y up,
// z = width, +z = kerb side). Owned by: TRAFFIC agent. Used by coney/traffic.js (route buses), vehicles.js (a hijacked bus
// you drive) and net.js (a friend driving one).
// Look: white body with the NYCT blue lower band, black flush window band, MTA roundel + "New York City Transit" + fleet
// number, a street-side ad, raked one-piece windshield under an amber dot-matrix destination sign (front, kerb side, rear),
// bug-eye mirrors, a fold-up bike rack, dual rear wheels, roof HVAC + battery pods. Inside: speckled floor with the raised
// rear platform, blue plastic seats (side-facing up front, forward pairs at the back, rear bench), yellow stanchions and
// grab rails, strip lights, farebox and the driver's cab. Doors (front + rear, kerb side) swing out on setDoors(0..1).
// Draw calls: paint, glass, trim, vertex-coloured misc (outside + inside), lights, sign, four door leaves.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BUS = { len: 12.2, w: 2.59, h: 3.3, floor: 0.38, deck: 0.72, axleF: 3.6, axleR: -2.95, wheelR: 0.5, doorF: [4.45, 5.6], doorR: [-1.6, -0.4], eye: { x: 5.2, y: 2.08, z: -0.72 } };
const L = BUS.len, HW = BUS.w / 2, XF = L / 2, XR = -L / 2, TOP = 2.85, BELT = 1.05, WIN = 2.5, TH = 3.2;

let MATS = null;
const signMats = new Map();
function ledCanvas(text, w = 640, h = 80, cols = 160, rows = 20) {
  const lo = document.createElement('canvas'); lo.width = cols; lo.height = rows; const g = lo.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, cols, rows); g.fillStyle = '#fff'; g.font = `bold ${rows - 4}px Arial Narrow, Arial, sans-serif`; g.textBaseline = 'middle';
  const [a, b] = text.split('|'); let x = 3; if (b !== undefined) { g.font = `bold ${rows - 2}px Arial`; g.fillText(a, x, rows / 2 + 1); x += g.measureText(a).width + 6; g.font = `bold ${rows - 7}px Arial Narrow, Arial, sans-serif`; g.fillText(b, x, rows / 2 + 1, cols - x - 2); } else g.fillText(a, x, rows / 2 + 1, cols - 6);
  const px = g.getImageData(0, 0, cols, rows).data, c = document.createElement('canvas'); c.width = w; c.height = h; const q = c.getContext('2d');
  q.fillStyle = '#050403'; q.fillRect(0, 0, w, h); const sx = w / cols, sy = h / rows;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const v = px[(j * cols + i) * 4]; q.fillStyle = v > 110 ? '#ffb020' : '#1c1204'; q.beginPath(); q.arc((i + 0.5) * sx, (j + 0.5) * sy, sx * 0.36, 0, 7); q.fill(); }
  return c;
}
/** amber LED destination sign, one material per text (e.g. 'B36|SHEEPSHEAD BAY') */
export function signMaterial(text) {
  let m = signMats.get(text); if (m) return m;
  const t = new THREE.CanvasTexture(ledCanvas(text)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.4, roughness: 0.3, map: t }); m.name = 'bus_sign'; signMats.set(text, m); return m;
}
function liveryTexture(lite) {
  const W = lite ? 1024 : 2048, H = lite ? 256 : 512, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const half = H / 2, py = (y) => half * (1 - y / TH);   // metres up the side → pixels inside one half
  const ux = (x) => (x - XR) / L * W;
  for (const side of [1, -1]) {   // top half: kerb side (front on the right) · bottom half: street side (front on the left)
    const oy = side > 0 ? 0 : half, X = (x) => (side > 0 ? ux(x) : W - ux(x));
    g.save(); g.translate(0, oy); g.beginPath(); g.rect(0, 0, W, half); g.clip();
    g.fillStyle = '#eceeec'; g.fillRect(0, 0, W, half);
    // the blue lower band, sweeping up behind the front door
    const band = new Path2D(), x0 = X(XR), x1 = X(XF), xs = X(3.9), xe = X(4.4);
    band.moveTo(x0, py(0.3)); band.lineTo(x0, py(0.95)); band.lineTo(xs, py(0.95)); band.bezierCurveTo(X(4.15), py(0.95), X(4.1), py(1.05), xe, py(1.05)); band.lineTo(x1, py(1.05)); band.lineTo(x1, py(0.3)); band.closePath();
    g.fillStyle = '#123f95'; g.fill(band);
    g.fillStyle = '#e8a321'; g.fillRect(Math.min(x0, x1), py(0.99), W, 3);   // thin gold pinstripe over the band
    g.fillStyle = '#14171a'; g.fillRect(0, py(WIN), W, py(BELT) - py(WIN));  // flush black window band
    g.fillStyle = '#2a2d31'; g.fillRect(0, py(0.34), W, py(0.3) - py(0.34));
    // MTA roundel + NYCT wordmark + fleet number
    const mx = X(side > 0 ? 1.2 : 1.6), my = py(0.63), r = half * 0.075;
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(mx, my, r, 0, 7); g.fill(); g.fillStyle = '#123f95'; g.font = `italic bold ${r * 0.95}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('MTA', mx, my + 1);
    g.fillStyle = '#ffffff'; g.font = `bold ${half * 0.06}px Arial`; g.textAlign = 'left'; g.fillText('New York City Transit', X(side > 0 ? 1.7 : 2.9), py(0.66));
    g.fillStyle = '#1d1f22'; g.font = `bold ${half * 0.07}px Arial`; g.textAlign = 'center'; g.fillText('8517', X(5.3), py(2.66)); g.fillText('8517', X(-5.4), py(2.66));
    if (side < 0) {   // street side: a king-size ad between the axles, on the white above the band? no — on the band, like the real ones
      const a0 = X(-2.2), a1 = X(2.8), ay0 = py(0.92), ay1 = py(0.36), aw = a1 - a0; g.fillStyle = '#f6d23a'; g.fillRect(a0, ay0, aw, ay1 - ay0);
      g.fillStyle = '#c4161c'; g.font = `900 ${half * 0.085}px Arial Black, Arial`; g.textAlign = 'left'; g.fillText('LUNA PARK', a0 + (aw > 0 ? 8 : -8), (ay0 + ay1) / 2 - half * 0.03);
      g.fillStyle = '#1b1b1b'; g.font = `bold ${half * 0.045}px Arial`; g.fillText('THRILLS ALL SUMMER · CONEY ISLAND', a0 + 8, (ay0 + ay1) / 2 + half * 0.045);
    }
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function mats(lite) {
  if (MATS) return MATS;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  MATS = {
    paint: lite ? std({ map: liveryTexture(true), roughness: 0.4, metalness: 0.1 }) : new THREE.MeshPhysicalMaterial({ map: liveryTexture(false), roughness: 0.35, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.15 }),
    glass: std({ color: 0x1a2328, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.3 }),
    trim: std({ color: 0x141516, roughness: 0.6, metalness: 0.2 }),
    vc: std({ vertexColors: true, roughness: 0.62, metalness: 0.08 }),
    light: new THREE.MeshBasicMaterial({ vertexColors: true }),
    leaf: std({ color: 0x151a1e, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide }),
  };
  for (const k in MATS) MATS[k].name = 'bus_' + k;
  return MATS;
}

// ---- geometry helpers ----------------------------------------------------------------------------------------------------
const col = new THREE.Color();
function strip(g) { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k); return g; }
function tint(g, hex) { g = strip(g); col.setHex(hex); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); return g; }
function box(x0, y0, z0, x1, y1, z1) { const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g; }
function cyl(r0, r1, h, seg = 12) { return new THREE.CylinderGeometry(r0, r1, h, seg); }
/** paint UVs: 'r' kerb side livery, 'l' street side, 'w' plain white, 'b' plain blue */
function uvPaint(g, mode) {
  g = strip(g); const p = g.attributes.position, n = p.count, uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i); let u, v;
    if (mode === 'r') { u = (x - XR) / L; v = 0.5 + 0.5 * y / TH; }
    else if (mode === 'l') { u = 1 - (x - XR) / L; v = 0.5 * y / TH; }
    else if (mode === 'b') { u = 0.006; v = 0.5 + 0.5 * 0.6 / TH; }
    else { u = 0.5; v = 0.5 + 0.5 * 2.72 / TH; }
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); if (g.attributes.color) g.deleteAttribute('color'); return g;
}
/** one side's lower panel (belt down to the skirt) with the wheel arches notched out, split around door openings */
function lowerPanel(side, gaps) {
  const out = [], z = side * HW, cuts = [XR, ...gaps.flat(), XF];
  for (let k = 0; k + 1 < cuts.length; k += 2) {
    const x0 = cuts[k], x1 = cuts[k + 1]; if (x1 - x0 < 0.05) continue;
    const s = new THREE.Shape(); s.moveTo(x0, 0.3);
    for (const ax of [BUS.axleR, BUS.axleF]) { const R = 0.64; if (ax - R > x0 && ax + R < x1) { s.lineTo(ax - R, 0.3); s.absarc(ax, 0.42, R, Math.PI + 0.19, -0.19, true); s.lineTo(ax + R, 0.3); } }
    s.lineTo(x1, 0.3); s.lineTo(x1, BELT); s.lineTo(x0, BELT); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.045, bevelEnabled: false, curveSegments: 10 }); g.translate(0, 0, side > 0 ? HW - 0.045 : -HW);
    void z; out.push(g);
  }
  return out;
}

/**
 * Build one bus. o = { sign: 'B36|SHEEPSHEAD BAY', lite }. Returns { group (kit frame), meshes (raycastable), setDoors(k),
 * seats: [{ x, y, z, face }] (seat-pan centre, face = +1 facing +x / 0 facing inward), driver: { x, y, z }, interior (Group) }.
 */
export function buildBus(o = {}) {
  const M = mats(!!o.lite), sign = signMaterial(o.sign || 'B36|SHEEPSHEAD BAY');
  const P = { paint: [], glass: [], trim: [], vc: [], in: [], light: [], sign: [] };
  const paint = (g, m) => P.paint.push(uvPaint(g, m)), vc = (g, hex) => P.vc.push(tint(g, hex)), inn = (g, hex) => P.in.push(tint(g, hex)), lit = (g, hex) => P.light.push(tint(g, hex));
  // ---- shell -----------------------------------------------------------------------------------------------------------
  for (const side of [1, -1]) {
    for (const g of lowerPanel(side, side > 0 ? [BUS.doorR, BUS.doorF] : [])) paint(g, side > 0 ? 'r' : 'l');
    const zo = side * (HW - 0.0225);
    // window band: black pillars (livery band is black here) + glass
    const xs = side > 0 ? [[XR + 0.15, BUS.doorR[0]], [BUS.doorR[1], BUS.doorF[0]]] : [[XR + 0.15, XF - 0.28]];
    for (const [a, b] of xs) {
      const n = Math.max(1, Math.round((b - a) / 1.45)), w = (b - a) / n;
      for (let i = 0; i <= n; i++) { const x = a + i * w; paint(box(x - 0.07, BELT, zo - 0.022, x + 0.07, WIN, zo + 0.022), side > 0 ? 'r' : 'l'); }
      for (let i = 0; i < n; i++) { const g = new THREE.PlaneGeometry(w - 0.14, WIN - BELT - 0.08); g.rotateY(side > 0 ? 0 : Math.PI); g.translate(a + (i + 0.5) * w, (BELT + WIN) / 2, zo + side * 0.005); P.glass.push(strip(g)); }
      paint(box(a - 0.02, BELT - 0.04, zo - 0.03, b + 0.02, BELT + 0.03, zo + 0.03), side > 0 ? 'r' : 'l');
    }
    if (side > 0) { paint(box(BUS.doorF[1], BELT, zo - 0.022, XF - 0.28, WIN, zo + 0.022), 'r'); }   // the stretch between front door and nose
    paint(box(XR + 0.1, WIN, zo - 0.022, XF - 0.2, TOP, zo + 0.022), side > 0 ? 'r' : 'l');   // upper band
    // door jambs (black rubber seals)
    if (side > 0) for (const [a, b] of [BUS.doorF, BUS.doorR]) { P.trim.push(strip(box(a - 0.05, BUS.floor, HW - 0.06, a, WIN + 0.02, HW + 0.01)), strip(box(b, BUS.floor, HW - 0.06, b + 0.05, WIN + 0.02, HW + 0.01)), strip(box(a - 0.05, WIN, HW - 0.06, b + 0.05, WIN + 0.05, HW + 0.01))); }
    // curbside destination sign (window next to the front door)
    if (side > 0) { const g = new THREE.PlaneGeometry(1.15, 0.26); g.translate(3.35, 2.24, HW + 0.012); P.sign.push(strip(g)); P.trim.push(strip(box(2.74, 2.08, HW - 0.01, 3.96, 2.4, HW + 0.008))); }
    // skirt shadow line + rub rail
    P.trim.push(strip(box(XR + 0.1, 0.28, side * HW - 0.03, XF - 0.15, 0.33, side * HW + 0.03 * side)));
  }
  // roof: rounded shoulders, extruded along x
  { const s = new THREE.Shape(), N = 14; for (let i = 0; i <= N; i++) { const t = i / N, z = -HW + t * 2 * HW, e = Math.abs(z / HW), y = TOP + 0.24 * Math.pow(Math.max(0, 1 - Math.pow(e, 5)), 0.5); i ? s.lineTo(z, y) : s.moveTo(z, y); }
    for (let i = N; i >= 0; i--) { const t = i / N, z = -HW + 0.05 + t * 2 * (HW - 0.05), e = Math.abs(z / HW), y = TOP - 0.05 + 0.22 * Math.pow(Math.max(0, 1 - Math.pow(e, 5)), 0.5); s.lineTo(z, y); }
    const g = new THREE.ExtrudeGeometry(s, { depth: L - 0.3, bevelEnabled: false }); g.rotateY(Math.PI / 2); g.translate(XR + 0.15, 0, 0); paint(g, 'w');
    paint(box(-5.6, 3.02, -0.95, -3.2, 3.36, 0.95), 'w'); paint(box(-2.9, 3.02, -0.82, 3.9, 3.27, 0.82), 'w');   // HVAC pod, battery/CNG fairing
    P.trim.push(strip(box(-5.5, 3.35, -0.8, -3.3, 3.37, 0.8))); for (let x = -5.2; x < -3.4; x += 0.45) P.trim.push(strip(box(x, 3.34, 0.96, x + 0.3, 3.1, 0.97))); }
  // front: rounded corners, lower panel, raked windshield, the sign header, bumper, lamps, mirrors, bike rack
  for (const sz of [1, -1]) { const g = new THREE.CylinderGeometry(0.16, 0.16, TOP - 0.3, 10, 1, true, sz > 0 ? 0 : -Math.PI / 2, Math.PI / 2); g.translate(XF - 0.16, (TOP + 0.3) / 2, sz * (HW - 0.16)); paint(g, 'w');
    const r = new THREE.CylinderGeometry(0.16, 0.16, TOP - 0.3, 10, 1, true, sz > 0 ? Math.PI / 2 : Math.PI, Math.PI / 2); r.translate(XR + 0.16, (TOP + 0.3) / 2, sz * (HW - 0.16)); paint(r, 'w'); }
  paint(box(XF - 0.05, 0.3, -HW + 0.16, XF, 1.02, HW - 0.16), 'b');
  { const g = new THREE.PlaneGeometry(BUS.w - 0.36, 1.62); g.rotateY(Math.PI / 2); g.rotateZ(0.07); g.translate(XF - 0.07, 1.84, 0); P.glass.push(strip(g)); }
  P.trim.push(strip(box(XF - 0.2, 2.62, -HW + 0.14, XF - 0.1, TOP + 0.05, HW - 0.14)), strip(box(XF - 0.08, 1.0, -HW + 0.14, XF + 0.01, 1.08, HW - 0.14)));
  for (const sz of [1, -1]) P.trim.push(strip(box(XF - 0.14, 1.0, sz * (HW - 0.2), XF - 0.02, 2.66, sz * (HW - 0.12))));
  { const g = new THREE.PlaneGeometry(2.0, 0.24); g.rotateY(Math.PI / 2); g.translate(XF - 0.095, 2.76, 0); P.sign.push(strip(g)); }
  P.trim.push(strip(box(XF - 0.04, 0.3, -HW + 0.05, XF + 0.12, 0.56, HW - 0.05)));
  for (const sz of [1, -1]) { lit(box(XF + 0.005, 0.66, sz * 0.78, XF + 0.02, 0.8, sz * 1.1), 0xfff4dc); lit(box(XF + 0.005, 0.84, sz * 0.9, XF + 0.02, 0.9, sz * 1.1), 0xffa21a);
    vc(box(XF - 0.02, 0.62, sz * 0.74, XF + 0.01, 0.94, sz * 1.14), 0x2a2c2e);
    // bug-eye mirrors on swan-neck arms
    const arm = cyl(0.025, 0.025, 0.62, 6); arm.rotateZ(Math.PI / 2 - 0.5); arm.translate(XF + 0.2, 2.72, sz * (HW - 0.18)); vc(arm, 0x1a1a1a);
    const arm2 = cyl(0.022, 0.022, 0.55, 6); arm2.translate(XF + 0.46, 2.4, sz * (HW - 0.1)); vc(arm2, 0x1a1a1a);
    vc(box(XF + 0.36, 1.95, sz * (HW - 0.2), XF + 0.56, 2.28, sz * (HW + 0.05)), 0x111111); }
  // bike rack (folded up against the bumper)
  for (const sz of [1, -1]) { const t = cyl(0.018, 0.018, 0.55, 6); t.translate(XF + 0.16, 0.8, sz * 0.45); vc(t, 0x9aa0a6); }
  { const t = cyl(0.018, 0.018, 0.92, 6); t.rotateX(Math.PI / 2); t.translate(XF + 0.16, 1.06, 0); vc(t, 0x9aa0a6); const t2 = t.clone(); t2.translate(0, -0.5, 0); vc(t2, 0x9aa0a6); }
  // rear: panel, engine grille, window, tail lamps, route number, bumper
  paint(box(XR, 0.3, -HW + 0.16, XR + 0.05, TOP, HW - 0.16), 'w');
  P.trim.push(strip(box(XR - 0.02, 0.5, -0.95, XR + 0.01, 1.35, 0.95))); for (let y = 0.56; y < 1.33; y += 0.07) vc(box(XR - 0.035, y, -0.9, XR - 0.015, y + 0.025, 0.9), 0x3a3c3e);
  { const g = new THREE.PlaneGeometry(1.7, 0.62); g.rotateY(-Math.PI / 2); g.translate(XR - 0.005, 2.1, 0); P.glass.push(strip(g)); }
  { const g = new THREE.PlaneGeometry(0.62, 0.18); g.rotateY(-Math.PI / 2); g.translate(XR - 0.006, 2.62, 0); P.sign.push(strip(g)); }
  for (const sz of [1, -1]) { lit(box(XR - 0.02, 0.6, sz * (HW - 0.3), XR, 1.32, sz * (HW - 0.12)), 0xc81010); lit(box(XR - 0.02, 1.36, sz * (HW - 0.3), XR, 1.5, sz * (HW - 0.12)), 0xff9a10); }
  P.trim.push(strip(box(XR - 0.1, 0.3, -HW + 0.05, XR + 0.03, 0.52, HW - 0.05)));
  // underbody + wheels (dual at the back), dark arches
  P.trim.push(strip(box(XR + 0.2, 0.22, -HW + 0.12, XF - 0.25, 0.32, HW - 0.12)));
  for (const ax of [BUS.axleF, BUS.axleR]) for (const sz of [1, -1]) {
    const w = ax > 0 ? 0.3 : 0.56, zc = sz * (HW - 0.06 - w / 2);
    const tyre = cyl(BUS.wheelR, BUS.wheelR, w, 24); tyre.rotateX(Math.PI / 2); tyre.translate(ax, BUS.wheelR, zc); vc(tyre, 0x161616);
    const rim = cyl(0.3, 0.3, 0.02, 20); rim.rotateX(Math.PI / 2); rim.translate(ax, BUS.wheelR, zc + sz * (w / 2 + 0.005)); vc(rim, 0xb8bcc0);
    const hub = cyl(0.12, 0.14, 0.08, 12); hub.rotateX(Math.PI / 2); hub.translate(ax, BUS.wheelR, zc + sz * (w / 2 + 0.03)); vc(hub, 0x8c9094);
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2, nut = cyl(0.018, 0.018, 0.05, 6); nut.rotateX(Math.PI / 2); nut.translate(ax + Math.cos(a) * 0.2, BUS.wheelR + Math.sin(a) * 0.2, zc + sz * (w / 2 + 0.025)); vc(nut, 0x6c7074); }
    const liner = new THREE.CylinderGeometry(0.63, 0.63, 0.5, 14, 1, true, -Math.PI / 2 - 1.4, 2.8); liner.rotateX(Math.PI / 2); liner.translate(ax, 0.42, sz * (HW - 0.3)); P.trim.push(strip(liner));
  }
  // ---- interior --------------------------------------------------------------------------------------------------------
  const zi = HW - 0.06, D = BUS.deck, F = BUS.floor, rearX = -1.75;
  inn(box(rearX, F - 0.02, -zi, XF - 0.25, F, zi), 0x55585b);
  inn(box(XR + 0.1, D - 0.02, -zi, rearX, D, zi), 0x55585b); inn(box(rearX - 0.02, F, -zi, rearX, D, zi), 0xd0a018);   // yellow step nosing
  for (const sz of [1, -1]) { inn(box(XR + 0.1, F, sz * zi - 0.01, XF - 0.3, BELT, sz * zi + 0.01), 0xcfd2cf); }
  inn(box(XR + 0.1, TOP - 0.06, -zi, XF - 0.3, TOP - 0.04, zi), 0xdcdedb);
  for (const sz of [1, -1]) { lit(box(XR + 0.4, TOP - 0.1, sz * 0.62 - 0.09, XF - 0.8, TOP - 0.06, sz * 0.62 + 0.09), 0xf2f6ff); inn(box(XR + 0.3, 2.44, sz * 0.9 - 0.02, XF - 0.9, 2.62, sz * 0.9 + 0.02), 0xc8ccca); }
  // seats: side-facing up front over the arches, forward pairs on the platform, the rear bench
  const seats = [], SEAT = 0x2c56a8;
  const sideSeat = (x0, x1, sz) => { for (let x = x0; x + 0.46 <= x1 + 1e-3; x += 0.48) { inn(box(x, F + 0.42, sz * zi - sz * 0.46, x + 0.44, F + 0.48, sz * zi - sz * 0.04), SEAT); inn(box(x, F + 0.48, sz * zi - sz * 0.1, x + 0.44, F + 1.02, sz * zi - sz * 0.04), SEAT); inn(box(x + 0.1, F, sz * zi - sz * 0.32, x + 0.34, F + 0.42, sz * zi - sz * 0.2), 0x6a6e72); seats.push({ x: x + 0.22, y: F + 0.48, z: sz * (zi - 0.28), face: 0, side: sz }); } };
  sideSeat(1.4, 3.05, -1); sideSeat(-0.1, 2.9, 1); sideSeat(-1.4, 0.95, -1);
  for (let x = rearX - 0.55; x > XR + 1.15; x -= 0.82) for (const sz of [1, -1]) { const z0 = sz * 0.36, z1 = sz * zi;
    inn(box(x - 0.22, D + 0.42, Math.min(z0, z1), x + 0.22, D + 0.48, Math.max(z0, z1)), SEAT); inn(box(x - 0.3, D + 0.48, Math.min(z0, z1), x - 0.24, D + 1.08, Math.max(z0, z1)), SEAT);
    inn(box(x - 0.36, D + 1.02, Math.min(z0, z1), x - 0.3, D + 1.12, Math.max(z0, z1)), 0xd0a018);
    for (const k of [0.28, 0.72]) seats.push({ x: x, y: D + 0.48, z: z0 + (z1 - z0) * k, face: 1, side: sz }); }
  inn(box(XR + 0.35, D + 0.42, -zi, XR + 0.85, D + 0.48, zi), SEAT); inn(box(XR + 0.25, D + 0.48, -zi, XR + 0.33, D + 1.1, zi), SEAT);
  for (const z of [-0.8, -0.28, 0.28, 0.8]) seats.push({ x: XR + 0.6, y: D + 0.48, z, face: 1, side: Math.sign(z) });
  // stanchions + grab rails
  for (const [x, z] of [[4.0, 0.52], [2.9, -0.5], [1.7, 0.5], [0.4, -0.5], [-0.3, 0.55], [-1.85, 0.45], [-1.85, -0.45], [-3.2, 0.4], [-4.4, -0.4]]) { const y0 = x < rearX ? D : F, g = cyl(0.02, 0.02, TOP - 0.06 - y0, 8); g.translate(x, (y0 + TOP - 0.06) / 2, z); inn(g, 0xe8b818); }
  for (const sz of [1, -1]) { const g = cyl(0.018, 0.018, 8.8, 8); g.rotateZ(Math.PI / 2); g.translate(-0.6, 2.2, sz * 0.62); inn(g, 0xe8b818); }
  // driver's cab: seat, wheel, dash, farebox, partition
  const dx = 5.25, dz = -0.72;
  inn(box(dx - 0.25, F + 0.35, dz - 0.25, dx + 0.25, F + 0.52, dz + 0.25), 0x202224); inn(box(dx - 0.33, F + 0.52, dz - 0.25, dx - 0.25, F + 1.25, dz + 0.25), 0x202224); inn(cyl(0.08, 0.1, 0.35, 8).translate(dx, F + 0.18, dz), 0x333538);
  { const w = new THREE.TorusGeometry(0.24, 0.022, 8, 24); w.rotateX(Math.PI / 2); w.rotateZ(0.35); w.translate(dx + 0.52, F + 1.02, dz); inn(w, 0x151515); }
  inn(box(XF - 0.62, F + 0.55, -zi, XF - 0.25, F + 0.95, 0.2), 0x1c1d1f); inn(box(XF - 0.45, F + 0.95, -zi, XF - 0.25, F + 1.0, zi), 0x1c1d1f);
  inn(box(4.9, F, 0.02, 5.22, F + 1.12, 0.3), 0x9ea2a6); lit(box(5.221, F + 0.86, 0.06, 5.23, F + 1.02, 0.26), 0x39c86a);   // farebox + its screen
  inn(box(dx - 0.45, F, dz + 0.3, dx - 0.4, F + 1.8, -zi + 0.02), 0x8a8e92);
  // ---- meshes --------------------------------------------------------------------------------------------------------
  const group = new THREE.Group(); group.name = 'bus'; const interior = new THREE.Group(); interior.name = 'bus:interior'; group.add(interior);
  const meshes = [];
  const add = (arr, mat, parent = group, shadow = false) => { if (!arr.length) return null; const m = new THREE.Mesh(mergeGeometries(arr, false), mat); m.castShadow = shadow && !o.lite; m.receiveShadow = true; m.userData.surface = 'metal'; parent.add(m); meshes.push(m); return m; };
  add(P.paint, M.paint, group, true); add(P.trim, M.trim); add(P.vc, M.vc, group, true); add(P.light, M.light); add(P.sign, sign);
  const gl = add(P.glass, M.glass); if (gl) gl.renderOrder = 2;
  add(P.in, M.vc, interior);
  // doors: two leaves each, hinged on the jambs, swinging out
  const leaves = [];
  for (const [a, b] of [BUS.doorF, BUS.doorR]) {
    const w = (b - a) / 2 - 0.01;
    for (const k of [0, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(k ? b : a, 0, HW - 0.03); group.add(pivot);
      const fr = [box(0, BUS.floor, -0.015, w, BUS.floor + 0.1, 0.015), box(0, WIN - 0.06, -0.015, w, WIN, 0.015), box(0, BUS.floor, -0.015, 0.05, WIN, 0.015), box(w - 0.05, BUS.floor, -0.015, w, WIN, 0.015), box(0, 1.15, -0.015, w, 1.19, 0.015)];
      const pane = new THREE.PlaneGeometry(w - 0.1, WIN - BUS.floor - 0.16); pane.translate(w / 2, (BUS.floor + WIN) / 2 + 0.02, 0);
      const g = mergeGeometries([...fr.map(strip), strip(pane)].map((q) => { if (!q.attributes.uv) q.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2)); return q; }), false);
      if (k) g.scale(-1, 1, 1);
      const m = new THREE.Mesh(g, M.leaf); m.renderOrder = 2; pivot.add(m); leaves.push({ pivot, dir: k ? 1 : -1 });
    }
  }
  let doorK = -1;
  const setDoors = (kk) => { kk = Math.max(0, Math.min(1, kk)); if (Math.abs(kk - doorK) < 1e-3) return; doorK = kk; const e = kk * kk * (3 - 2 * kk); for (const l of leaves) { l.pivot.rotation.y = l.dir * e * 1.45; l.pivot.position.z = HW - 0.03 + e * 0.06; } };
  setDoors(0);
  return { group, interior, meshes, setDoors, seats, driver: { x: dx, y: F + 0.52, z: dz }, len: L, w: BUS.w, h: BUS.h };
}
