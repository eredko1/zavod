// CONEY street fronts: the real businesses of Surf Ave, Mermaid Ave, Stillwell Ave, W 12th St, W 8th St and Neptune Ave
// (OpenStreetMap, coney/stores.js) each get a storefront on the wall they really are on: a sign board in their colours and
// lettering (stand-in names, de-branding rule), a glass front with mullions and a bulkhead, pilasters, an awning when they
// have one. Then the per-street character the generic city pass doesn't have:
//  · NORMAN'S (Surf & Stillwell): the yellow DELICATESSEN band, the big white boards on the roof, green-and-white awnings, the
//    vertical blade sign on the corner, the serving counters;
//  · Mermaid Ave / W 8th / W 12th / Neptune / Stillwell walk-ups: ground-floor shops on every street face (procedural names:
//    delis, 99¢ stores, nail salons, check cashing …), bracketed cornices, black fire escapes;
//  · Surf Ave north side: white stucco with a row of arched windows upstairs, billboards on the roofs.
// Everything is overlay geometry a few cm proud of the walls city.js built (no colliders, no new raycast targets): one
// vertex-coloured mesh, one glass mesh, one sign atlas, a handful of landmark textures. CONEY agent.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OSM, PLAY } from './osm.js';
import { STORES } from './stores.js';
import { BW } from './shore.js';
import { stationClear } from './stillwell.js';
import { pip } from '../osmkit.js';
import { isSchool } from './school.js';

const UP = new THREE.Vector3(0, 1, 0);
const SIGN_Y0 = 3.3, SIGN_Y1 = 4.5;                          // the sign band over the shop (city.js keeps its own boards at 3.36-4.44)
const GENERIC = [   // procedural ground-floor shops on the walk-up streets
  ['DELI & GROCERY', 'COLD BEER · LOTTO', '#2a8a3a', '#ffffff', '#2a8a3a'], ['99¢ & UP', 'EVERYTHING', '#f2c418', '#c8202a', null], ['NAIL SALON', 'MANI · PEDI · WAX', '#f7d6e4', '#c2185b', null],
  ['PHARMACY', 'Rx', '#ffffff', '#1a7a4a', null], ['BARBER SHOP', 'WALK-INS WELCOME', '#1a1a1a', '#ffffff', '#c8202a'], ['LAUNDROMAT', 'WASH · DRY · FOLD', '#1f6fb8', '#ffffff', null],
  ['CELL PHONES', 'REPAIR · ACCESSORIES', '#111111', '#36c0ff', null], ['ПРОДУКТЫ', 'EUROPEAN GROCERY', '#7a1a1a', '#ffd23a', '#7a1a1a'], ['CHECK CASHING', 'MONEY ORDERS · BILL PAY', '#ffd23a', '#1a3a7a', null],
  ['PIZZA', 'SLICES · HEROES', '#c8202a', '#ffffff', '#2a8a3a'], ['CHINESE FOOD', 'TAKE OUT', '#c8202a', '#ffd23a', null], ['HALAL', 'GYRO · PLATTERS', '#1d6b34', '#ffffff', null],
  ['LIQUORS', 'WINE & SPIRITS', '#1a1a1a', '#ffd23a', null], ['TAX SERVICE', 'INSURANCE · NOTARY', '#ffffff', '#1a3a7a', null], ['BAKERY', 'ХЛЕБ · CAKES', '#f2e6c8', '#7a3a1a', '#7a3a1a'],
  ['OPTICAL', 'EYE EXAMS', '#ffffff', '#1f4fa8', null], ['URGENT CARE', 'WALK-IN', '#ffffff', '#d8201e', null], ['DOLLAR STORE', '', '#2a8a3a', '#ffd23a', null],
  ['TRAVEL AGENCY', 'ПУТЕШЕСТВИЯ', '#1aa0d8', '#ffffff', null], ['LAWYER', 'ACCIDENTS · IMMIGRATION', '#1a2a4a', '#f2e6c8', null],
];
const ADS = [   // rooftop billboards on Surf Ave (parodies)
  ['HORIZON', 'Stop schlepping. 5G on the whole boardwalk.', '#1f5fae', '#ffffff', '#ffd23a'], ['INJURED?', 'CALL ALEX & ALEX  1-800-HURT-NOW', '#ffd23a', '#111111', '#c8202a'],
  ['MORPHEUS8', 'sleep like you mean it', '#2a1a3a', '#ffffff', '#ff7ab0'], ['CONEY CYCLONES', 'BASEBALL · TONIGHT 7PM', '#0d3b66', '#ffffff', '#ff9a1f'],
];

/** which street a point is on (the nearest road ≥ 9 m wide, classified by where it runs) */
const ROADS = OSM.r.filter((r) => r.w >= 9);
const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L)); return Math.hypot(a[0] + t * dx - x, a[1] + t * dz - z); };
function roadNear(x, z) { let best = null, bd = 1e9; for (const r of ROADS) for (let i = 0; i + 1 < r.p.length; i++) { const d = segD(x, z, r.p[i], r.p[i + 1]) - r.w / 2; if (d < bd) { bd = d; best = { r, i }; } } return best ? { ...best, d: bd } : null; }
export function streetAt(x, z) {
  const q = roadNear(x, z); if (!q || q.d > 14) return null;
  if (q.r.w >= 20) return 'surf';
  const a = q.r.p[q.i], b = q.r.p[q.i + 1], ew = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
  if (ew && mz > -320 && mz < -260) return 'mermaid';
  if (ew && mz < -480) return 'neptune';
  if (!ew && mx > -100 && mx < -72) return 'stillwell';
  if (!ew && mx > 330 && mx < 410) return 'w8';
  if (!ew && mx > 20 && mx < 70) return 'w12';
  return ew ? 'avenue' : 'side';
}
const WALKUP = new Set(['mermaid', 'w8', 'w12', 'neptune', 'stillwell']);

// ---- faces: every outer edge of every OSM building in the map, in world coordinates, with its outward normal ----------------
function faces() {
  const out = [];
  OSM.b.forEach((b, bi) => {
    const p = b.p.length > 3 && b.p[0][0] === b.p[b.p.length - 1][0] && b.p[0][1] === b.p[b.p.length - 1][1] ? b.p.slice(0, -1) : b.p;
    let cx = 0, cz = 0; for (const [x, z] of p) { cx += x; cz += z; } cx /= p.length; cz /= p.length;
    if (b.s === 'tower' && b.h > 50 && cx > 60 && cx < 380 && cz > -520 && cz < -110) return;   // Luna Park Houses: housing.js
    if (stationClear(cx, cz) || isSchool(cx, cz)) return;   // the Stillwell head house + bus loop; P.S. 90 (school.js)
    for (let i = 0; i < p.length; i++) {
      const A = p[i], B = p[(i + 1) % p.length], L = Math.hypot(B[0] - A[0], B[1] - A[1]); if (L < 3) continue;
      const tx = (B[0] - A[0]) / L, tz = (B[1] - A[1]) / L; let nx = tz, nz = -tx; const mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2;
      if (nx * (mx - cx) + nz * (mz - cz) < 0) { nx = -nx; nz = -nz; }
      const q = roadNear(mx + nx * 3, mz + nz * 3);   // a street face: a road a sidewalk away, straight out from it
      const street = q && q.d < 9 && segD(mx + nx * (q.d + 4), mz + nz * (q.d + 4), q.r.p[q.i], q.r.p[q.i + 1]) < q.r.w / 2 + 1 ? streetAt(mx + nx * 3, mz + nz * 3) : null;
      out.push({ b, bi, A, B, L, tx, tz, nx, nz, mx, mz, street, used: [] });
    }
  });
  return out;
}
/** wall height city.js gave the building (shop blocks are raised to one / two storeys) */
function wallH(b) {
  const shopLike = !['tower', 'apart', 'civic', 'rowhouse', 'aquarium', 'service'].includes(b.s);
  if (!shopLike) return Math.max(3, b.h);
  const h0 = Math.min(Math.max(3, b.h), 12); return h0 > 7 ? Math.max(h0, 8.4) : Math.max(h0, 5.4);
}

// ---- geometry kit: boxes / quads in a face frame (u along the wall, y up, w out of it) ----------------------------------------
class Kit {
  constructor() { this.col = []; this.glass = []; this.sign = []; this.tex = new Map(); this._c = new THREE.Color(); }
  frame(f) {   // right-handed basis: x = along (so text reads left → right from the street), y = up, z = out
    const t = new THREE.Vector3(f.tx, 0, f.tz), n = new THREE.Vector3(f.nx, 0, f.nz), o = new THREE.Vector3(f.A[0], 0, f.A[1]);
    const flip = new THREE.Vector3().crossVectors(t, UP).dot(n) < 0; if (flip) { t.negate(); o.set(f.B[0], 0, f.B[1]); }
    return { m: new THREE.Matrix4().makeBasis(t, UP, n).setPosition(o), flip, L: f.L };
  }
  /** u measured from the face's A end, whichever way the frame runs */
  U(F, u) { return F.flip ? F.L - u : u; }
  box(F, u0, u1, y0, y1, w0, w1, color) {
    const a = this.U(F, u0), b = this.U(F, u1), g = new THREE.BoxGeometry(Math.abs(b - a), y1 - y0, w1 - w0); g.deleteAttribute('uv');
    g.translate((a + b) / 2, (y0 + y1) / 2, (w0 + w1) / 2); g.applyMatrix4(F.m); this.paint(g, color); this.col.push(g); return g;
  }
  geo(F, g, color) { g.deleteAttribute('uv'); g.applyMatrix4(F.m); this.paint(g, color); this.col.push(g); }
  paint(g, color) { const c = this._c.set(color), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
  quad(F, list, u0, u1, y0, y1, w, uv = [0, 0, 1, 1]) {
    const a = this.U(F, u0), b = this.U(F, u1), g = new THREE.PlaneGeometry(Math.abs(b - a), y1 - y0); g.translate((a + b) / 2, (y0 + y1) / 2, w);
    const t = g.attributes.uv; for (let i = 0; i < t.count; i++) t.setXY(i, uv[0] + t.getX(i) * uv[2], uv[1] + t.getY(i) * uv[3]);
    g.applyMatrix4(F.m); list.push(g); return g;
  }
}
const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return c.getHex(); };

// ---- sign painting: each sign is drawn at its real aspect into a 400 x 100 atlas cell (stretched back on the board) ---------
const CW = 400, CH = 100, COLS = 5;
function fitFont(g, text, weight, family, maxW, maxH) { let s = maxH; g.font = `${weight} ${s}px ${family}`; const w = g.measureText(text).width; if (w > maxW) s = Math.max(8, s * maxW / w); g.font = `${weight} ${s}px ${family}`; return s; }
function paintSign(g, W, H, s) {
  const st = s.st, bg = s.bg, fg = s.fg, sub = s.s || '';
  const SANS = '"Arial Black", "Helvetica Neue", Arial, sans-serif', SERIF = 'Georgia, "Times New Roman", serif', SCRIPT = '"Brush Script MT", "Snell Roundhand", "Segoe Script", Georgia, cursive';
  g.fillStyle = bg; g.fillRect(0, 0, W, H); g.textAlign = 'center'; g.textBaseline = 'middle';
  const main = sub ? H * 0.6 : H * 0.78, cy = sub ? H * 0.4 : H * 0.52;
  if (st === 'bulb') { for (let x = 8; x < W - 4; x += 14) for (const y of [7, H - 7]) { g.fillStyle = '#ffe9a0'; g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill(); } }
  if (st === 'chan') { g.shadowColor = fg; g.shadowBlur = 14; }
  if (st === 'box') { g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 5; g.strokeRect(2.5, 2.5, W - 5, H - 5); }
  if (st === 'bubble') {
    fitFont(g, s.n, '900', SANS, W * 0.9, main * 1.1); g.lineJoin = 'round'; g.lineWidth = 9; g.strokeStyle = '#5a1030'; g.strokeText(s.n, W / 2, cy); g.fillStyle = fg; g.fillText(s.n, W / 2, cy);
  } else if (st === 'script') { fitFont(g, s.n, 'italic 700', SCRIPT, W * 0.9, main * 1.05); g.fillStyle = fg; g.fillText(s.n, W / 2, cy + 2); }
  else if (st === 'firehouse' || st === 'police') { fitFont(g, s.n, '700', SERIF, W * 0.92, main * 0.9); g.fillStyle = fg; g.fillText(s.n, W / 2, cy); }
  else { fitFont(g, s.n, '900', SANS, W * 0.9, main * 0.9); g.fillStyle = fg; g.fillText(s.n, W / 2, cy); }
  g.shadowBlur = 0;
  if (sub) { fitFont(g, sub, '600', '"Helvetica Neue", Arial, sans-serif', W * 0.86, H * 0.2); g.fillStyle = fg; g.globalAlpha = 0.9; g.fillText(sub, W / 2, H * 0.8); g.globalAlpha = 1; }
}
function atlasOf(signs, lite) {
  const rows = Math.max(1, Math.ceil(signs.length / COLS)), k = lite ? 0.6 : 1;
  const c = document.createElement('canvas'); c.width = Math.round(CW * COLS * k); c.height = Math.round(CH * rows * k); const g = c.getContext('2d'); g.scale(k, k);
  const tmp = document.createElement('canvas');
  signs.forEach((s, i) => {
    const W = Math.round(CH * Math.max(1.2, s.aspect)), H = CH; tmp.width = W; tmp.height = H; const q = tmp.getContext('2d'); paintSign(q, W, H, s);
    const col = i % COLS, row = Math.floor(i / COLS); g.drawImage(tmp, col * CW, row * CH, CW, CH);
    s.uv = [(col * CW + 1) / (CW * COLS), 1 - ((row + 1) * CH - 1) / (CH * rows), (CW - 2) / (CW * COLS), (CH - 2) / (CH * rows)];
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; return t;
}

// ---- one shop unit on a face, centred at u (m from the face's A end) ------------------------------------------------------
function shopUnit(K, F, u, w, s, signs, o = {}) {
  const u0 = u - w / 2, u1 = u + w / 2, pil = 0.32, frameC = o.frame || 0x2a2c30, sy0 = o.sy0 ?? SIGN_Y0, sy1 = o.sy1 ?? SIGN_Y1;
  K.box(F, u0, u0 + pil, 0, sy1 + 0.1, 0, 0.26, o.pier || 0x8f877c); K.box(F, u1 - pil, u1, 0, sy1 + 0.1, 0, 0.26, o.pier || 0x8f877c);           // pilasters
  const dw = Math.min(o.enter ? 1.6 : 1.1, (w - 2 * pil) * (o.enter ? 0.4 : 0.3)), dx = u0 + pil + (o.doorLeft ? 0.3 : (w - 2 * pil) - dw - 0.3);   // the door
  if (o.enter) {   // a shop you can walk into: glass and bulkhead either side of an open doorway, the door swung back inside
    for (const [a, b] of [[u0 + pil, dx], [dx + dw, u1 - pil]]) if (b - a > 0.05) { K.box(F, a, b, 0, 0.5, 0, 0.22, shade(s.bg, 0.55)); K.quad(F, K.glass, a, b, 0.5, sy0 - 0.35, 0.17); }
    K.box(F, dx - 0.06, dx, 0, sy0 - 0.35, 0, 0.22, frameC); K.box(F, dx + dw, dx + dw + 0.06, 0, sy0 - 0.35, 0, 0.22, frameC); K.box(F, dx, dx + 0.05, 0.02, 2.4, -dw + 0.05, 0, 0x1c1e22);
  } else {
    K.box(F, u0 + pil, u1 - pil, 0, 0.5, 0, 0.22, shade(s.bg, 0.55));                                                                                // bulkhead
    K.quad(F, K.glass, u0 + pil, u1 - pil, 0.5, sy0 - 0.35, 0.17);                                                                                 // glass
  }
  K.box(F, u0 + pil, u1 - pil, sy0 - 0.35, sy0 - 0.2, 0, 0.22, frameC);                                                                            // transom rail
  const nm = Math.max(1, Math.round((w - 2 * pil) / 1.7)); for (let k = 1; k < nm; k++) { const x = u0 + pil + (w - 2 * pil) * k / nm; K.box(F, x - 0.04, x + 0.04, 0.5, sy0 - 0.35, 0.15, 0.21, frameC); }
  if (!o.enter) { K.box(F, dx, dx + dw, 0.02, 2.3, 0.15, 0.2, 0x1c1e22); K.box(F, dx + 0.1, dx + dw - 0.1, 1.0, 1.06, 0.2, 0.26, 0xb8bcc2); }   // a closed door with a push bar
  K.box(F, u0 - 0.05, u1 + 0.05, sy0 - 0.08, sy1 + 0.08, 0.1, 0.3, 0x18191c);                                                                     // sign backing
  const sg = { ...s, aspect: w / (sy1 - sy0) }; signs.push(sg); sg.place = () => K.quad(F, K.sign, u0, u1, sy0, sy1, 0.305, sg.uv);
  if (s.aw) awning(K, F, u0 + 0.1, u1 - 0.1, sy0 - 0.12, s.aw, o.stripe);
  return { u0, u1, dx, dw, sy0 };
}
// ---- enterable shops: the room behind the storefront is carved out of the building's colliders (AABBs, so square-on faces
// only), a front wall either side of the doorway; coney/shops.js builds the interior when you come near and puts people in it
const KIND = (k) => /restaurant|fast_food|cafe|pizza/.test(k) ? 'food' : /ice_cream|confectionery/.test(k) ? 'candy' : /bar|pub/.test(k) ? 'bar' : /bank|beauty|hairdresser|laundry|clinic|dancing|nail/.test(k) ? 'service' : 'grocery';
function depthBehind(f, u) { const px = f.A[0] + f.tx * u, pz = f.A[1] + f.tz * u; let d = 0.5; while (d < 14 && pip(px - f.nx * d, pz - f.nz * d, f.b.p)) d += 0.5; return d - 0.5; }
function carve(ctx, box) {
  const out = []; for (const C of ctx.colliders) {
    if (!(C.max.x > box.min.x && C.min.x < box.max.x && C.max.z > box.min.z && C.min.z < box.max.z && C.max.y > box.min.y && C.min.y < box.max.y)) { out.push(C); continue; }
    const P = (ax, ay, az, bx, by, bz) => { if (bx - ax > 0.01 && by - ay > 0.01 && bz - az > 0.01) out.push(new THREE.Box3(new THREE.Vector3(ax, ay, az), new THREE.Vector3(bx, by, bz))); };
    const x0 = Math.max(C.min.x, box.min.x), x1 = Math.min(C.max.x, box.max.x), z0 = Math.max(C.min.z, box.min.z), z1 = Math.min(C.max.z, box.max.z);
    P(C.min.x, C.min.y, C.min.z, box.min.x, C.max.y, C.max.z); P(box.max.x, C.min.y, C.min.z, C.max.x, C.max.y, C.max.z);
    P(x0, C.min.y, C.min.z, x1, C.max.y, box.min.z); P(x0, C.min.y, box.max.z, x1, C.max.y, C.max.z);
    P(x0, box.max.y, z0, x1, C.max.y, z1); P(x0, C.min.y, z0, x1, box.min.y, z1);
  }
  ctx.colliders.length = 0; ctx.colliders.push(...out);
}
function makeEnterable(world, K, f, F, unit, s) {
  const rd = Math.min(9, depthBehind(f, (unit.u0 + unit.u1) / 2) - 0.6); if (rd < 4.5) return null;
  const toW = (u, y, w) => new THREE.Vector3(K.U(F, u), y, w).applyMatrix4(F.m), H = 3.3;
  const corners = [toW(unit.u0 + 0.35, 0.05, -rd), toW(unit.u1 - 0.35, H, 0.45)], box = new THREE.Box3().setFromPoints(corners);
  carve(world.ctx, box);
  for (const [a, b] of [[unit.u0, unit.dx], [unit.dx + unit.dw, unit.u1]]) { if (b - a < 0.05) continue; const p = toW(a, 0, -0.2), q = toW(b, H, 0.05);   // the front wall either side of the doorway
    world.box([Math.min(p.x, q.x), 0, Math.min(p.z, q.z)], [Math.max(p.x, q.x), H, Math.max(p.z, q.z)]); }
  return { m: F.m.elements.slice(), flip: F.flip, L: F.L, u0: unit.u0, u1: unit.u1, dx: unit.dx, dw: unit.dw, rd, H, kind: KIND(s.k || ''), name: s.n, bg: s.bg, fg: s.fg, c: toW((unit.u0 + unit.u1) / 2, 0, -rd / 2).toArray() };
}
/** awning: 1.5 m out, 0.55 m fall, a 0.3 m valance; striped = alternating with white every 0.35 m */
function awning(K, F, u0, u1, yTop, color, stripe = false) {
  const D = 1.5, fall = 0.55, S = Math.hypot(D, fall), th = Math.atan2(fall, D), seg = stripe ? Math.max(1, Math.round((u1 - u0) / 0.35)) : 1, sw = (u1 - u0) / seg;
  for (let i = 0; i < seg; i++) {
    const a = u0 + i * sw, c = stripe && i % 2 ? 0xf4f2ea : color, x0 = K.U(F, a), x1 = K.U(F, a + sw);
    const sl = new THREE.BoxGeometry(Math.abs(x1 - x0), 0.04, S); sl.rotateX(th); sl.translate((x0 + x1) / 2, yTop - fall / 2, D / 2); K.geo(F, sl, c);
    const v = new THREE.BoxGeometry(Math.abs(x1 - x0), 0.3, 0.03); v.translate((x0 + x1) / 2, yTop - fall - 0.15, D); K.geo(F, v, c);
  }
}

// ---- NORMAN'S: the corner hot dog palace -------------------------------------------------------------------------------------
function bandTex(W, H, draw) { const c = document.createElement('canvas'); c.width = W; c.height = H; draw(c.getContext('2d'), W, H); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
const GREEN = '#1d6b34', YEL = '#f6c51b', SCRIPT = '"Brush Script MT", "Snell Roundhand", Georgia, cursive';
function normans(world, K, fs, lite) {
  const mats = [], add = (geo, tex) => { const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.22 }); const me = new THREE.Mesh(geo, m); me.name = 'fronts:normans'; me.receiveShadow = true; world.scene.add(me); mats.push(m); };
  const res = lite ? 0.5 : 1;
  fs.forEach((f, fi) => {
    const F = K.frame(f), L = f.L, H = wallH(f.b);
    // serving counters: open bays with stainless counters under the awning, a yellow tiled pier between each
    const nb = Math.max(2, Math.round(L / 3.4)), bw = L / nb;
    for (let i = 0; i < nb; i++) { const a = i * bw; K.box(F, a, a + 0.35, 0, 3.3, 0, 0.3, 0xe8c040); K.quad(F, K.glass, a + 0.35, a + bw, 1.15, 3.0, 0.12); K.box(F, a + 0.35, a + bw, 0, 1.1, 0, 0.55, 0xb9bec4); K.box(F, a + 0.35, a + bw, 1.06, 1.12, 0, 0.62, 0xd8dde2); }
    K.box(F, 0, L, 3.0, 3.3, 0, 0.3, 0xe8c040);
    awning(K, F, 0.1, L - 0.1, 3.25, 0x1d6b34, true);
    // the yellow band: SEA FOOD · DELICATESSEN · CLAM BAR (green on yellow, the 1950s lettering)
    const t1 = bandTex(Math.round(1600 * res), Math.round(1600 * res / (L / 1.4)), (g, W, Hh) => { g.fillStyle = YEL; g.fillRect(0, 0, W, Hh); g.fillStyle = GREEN; g.textAlign = 'center'; g.textBaseline = 'middle';
      const words = fi % 2 ? ['SEA FOOD', 'DELICATESSEN', 'BUFFET · CATERING'] : ['FRANKFURTERS', 'DELICATESSEN', 'CLAM BAR']; words.forEach((w, k) => { fitFont(g, w, '900', 'Georgia, serif', W / 3.4, Hh * 0.72); g.fillText(w, W * (k + 0.5) / 3, Hh * 0.54); }); });
    add(K.quad(F, [], 0, L, 3.35, 4.75, 0.33), t1); K.box(F, 0, L, 3.3, 4.8, 0.05, 0.32, 0xc8a018);
    // the big white boards on the roof: THIS IS THE ORIGINAL / FOLLOW THE CROWD and the green script name
    const top = H + 0.2, bh = 3.0;
    const t2 = bandTex(Math.round(1600 * res), Math.round(1600 * res / (L / bh)), (g, W, Hh) => { g.fillStyle = '#f7f5ec'; g.fillRect(0, 0, W, Hh); g.strokeStyle = GREEN; g.lineWidth = Hh * 0.05; g.strokeRect(Hh * 0.04, Hh * 0.04, W - Hh * 0.08, Hh - Hh * 0.08);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#c8202a'; fitFont(g, fi % 2 ? 'FOLLOW THE CROWD' : 'THIS IS THE ORIGINAL', '900', 'Georgia, serif', W * 0.7, Hh * 0.22); g.fillText(fi % 2 ? 'FOLLOW THE CROWD' : 'THIS IS THE ORIGINAL', W / 2, Hh * 0.22);
      g.fillStyle = GREEN; fitFont(g, "Norman's", 'italic 700', SCRIPT, W * 0.62, Hh * 0.62); g.fillText("Norman's", W / 2, Hh * 0.6);
      g.fillStyle = '#c8202a'; fitFont(g, 'FAMOUS · SINCE 1916', '700', 'Georgia, serif', W * 0.4, Hh * 0.11); g.fillText('FAMOUS · SINCE 1916', W / 2, Hh * 0.88); });
    add(K.quad(F, [], 0.4, L - 0.4, top + 0.8, top + 0.8 + bh, 0.2), t2);
    K.box(F, 0.3, L - 0.3, top + 0.7, top + 0.9 + bh, 0.05, 0.18, 0x2a2c30);
    for (let u = 1; u < L - 0.5; u += 4) { K.box(F, u - 0.08, u + 0.08, H - 0.3, top + 0.8, -0.4, -0.24, 0x2a2c30); K.box(F, u - 0.06, u + 0.06, H - 0.2, top + 2.2, -1.6, -1.45, 0x2a2c30); }
  });
  // the blade sign on the corner the two street faces share: yellow, NORMAN'S in red down both sides
  if (fs.length >= 2) {
    const [a, b] = fs, pts = [a.A, a.B], q = [b.A, b.B]; let corner = null, bd = 4;
    for (const p of pts) for (const r of q) { const d = Math.hypot(p[0] - r[0], p[1] - r[1]); if (d < bd) { bd = d; corner = p; } }
    if (corner) {
      const nx = a.nx + b.nx, nz = a.nz + b.nz, nl = Math.hypot(nx, nz) || 1, cx = corner[0] + nx / nl * 1.1, cz = corner[1] + nz / nl * 1.1, H = wallH(a.b);
      const tex = bandTex(Math.round(256 * res), Math.round(1400 * res), (g, W, Hh) => { g.fillStyle = YEL; g.fillRect(0, 0, W, Hh); g.strokeStyle = '#c8202a'; g.lineWidth = W * 0.06; g.strokeRect(W * 0.05, W * 0.05, W * 0.9, Hh - W * 0.1);
        g.fillStyle = '#c8202a'; g.textAlign = 'center'; g.textBaseline = 'middle'; const L = "NORMAN'S"; for (let i = 0; i < L.length; i++) { fitFont(g, L[i], '900', 'Georgia, serif', W * 0.7, Hh / L.length * 0.82); g.fillText(L[i], W / 2, Hh * (i + 0.55) / L.length); } });
      const ang = Math.atan2(nx / nl, nz / nl) + Math.PI / 2, bh = 7.5, y0 = Math.max(3.4, H - 2.5);
      for (const side of [1, -1]) { const g = new THREE.PlaneGeometry(1.1, bh); g.rotateY(ang + (side < 0 ? Math.PI : 0)); g.translate(cx + Math.sin(ang) * 0.13 * side, y0 + bh / 2, cz + Math.cos(ang) * 0.13 * side); add(g, tex); }
      const box = new THREE.BoxGeometry(1.16, bh + 0.1, 0.24); box.deleteAttribute('uv'); box.rotateY(ang); box.translate(cx, y0 + bh / 2, cz); K.paint(box, 0xc8202a); K.col.push(box);
      for (const y of [y0 + 1, y0 + bh - 1]) { const arm = new THREE.BoxGeometry(0.1, 0.1, 1.2); arm.deleteAttribute('uv'); arm.rotateY(Math.atan2(nx, nz)); arm.translate((cx + corner[0]) / 2, y, (cz + corner[1]) / 2); K.paint(arm, 0x2a2c30); K.col.push(arm); }
    }
  }
  return mats;
}

// ---- walk-up character: cornice with brackets, black fire escapes (a stack per 2-3 bays, ladders between landings) -------------
function walkup(K, f, R) {
  const F = K.frame(f), L = f.L, st = f.b.s === 'apart' ? 3.0 : f.b.s === 'tower' ? 2.8 : 3.1, H = wallH(f.b), floors = Math.max(1, Math.round(H / st)), top = floors * st + (f.b.s === 'rowhouse' ? 0.5 : 0.9);
  // cornice: a deep moulded box, brackets every 1.2 m, a frieze band under it
  K.box(F, -0.15, L + 0.15, top - 0.15, top + 0.25, 0, 0.62, 0xd9d2c3); K.box(F, 0, L, top - 0.55, top - 0.15, 0, 0.18, 0xcfc6b4);
  for (let u = 0.4; u < L - 0.2; u += 1.2) K.box(F, u - 0.1, u + 0.1, top - 0.55, top - 0.15, 0.18, 0.55, 0xcfc6b4);
  if (floors < 3 || L < 7 || R() < 0.25) return;
  const n = Math.max(1, Math.floor(L / 9)), pw = Math.min(4.2, L / n - 1.2);
  for (let k = 0; k < n; k++) {
    const c = L * (k + 0.5) / n, u0 = c - pw / 2, u1 = c + pw / 2, D = 1.05, steel = 0x16171a;
    for (let fl = 1; fl < floors; fl++) {
      const y = fl * st + 0.05;
      K.box(F, u0, u1, y, y + 0.06, 0.1, D, steel);                                                                         // landing grate
      K.box(F, u0, u1, y + 0.95, y + 1.0, D - 0.04, D + 0.02, steel); K.box(F, u0, u0 + 0.04, y + 0.95, y + 1.0, 0.1, D, steel); K.box(F, u1 - 0.04, u1, y + 0.95, y + 1.0, 0.1, D, steel);   // top rail
      for (let u = u0; u <= u1 + 0.01; u += 0.5) K.box(F, u, u + 0.03, y, y + 0.98, D - 0.03, D, steel);                    // balusters
      if (fl < floors - 1) { const a = K.U(F, u0 + 0.3), b = K.U(F, u0 + 1.6), dx = b - a, rise = st - 0.05, len = Math.hypot(dx, rise);   // the stair to the next landing
        for (const w of [0.3, 0.85]) { const s = new THREE.BoxGeometry(len, 0.05, 0.05); s.rotateZ(Math.atan2(rise, dx)); s.translate((a + b) / 2, y + rise / 2, w); K.geo(F, s, steel); } }
      for (const u of [u0 + 0.05, u1 - 0.05]) K.box(F, u - 0.03, u + 0.03, y - 0.5, y, 0.1, 0.16, steel);                 // brackets into the wall
    }
    const yL = st + 0.05; K.box(F, u1 - 0.55, u1 - 0.5, yL - 2.2, yL, D - 0.05, D, steel); K.box(F, u1 - 0.1, u1 - 0.05, yL - 2.2, yL, D - 0.05, D, steel);   // the drop ladder, pulled up
    for (let y = yL - 2.1; y < yL; y += 0.3) K.box(F, u1 - 0.55, u1 - 0.05, y, y + 0.03, D - 0.05, D, steel);
  }
}

/** Surf Ave north side: a white stucco upper storey with a row of arched windows (one texture, repeated along the face) */
let archTex = null;
function archBand(world, f, uvList) {
  const H = wallH(f.b); if (H < 8) return false;
  const K0 = new Kit(), F = K0.frame(f), y0 = 4.75, y1 = H - 0.35, rep = Math.max(1, Math.round(f.L / 3.2));
  const g = K0.quad(F, [], 0, f.L, y0, y1, 0.07, [0, 0, rep, 1]); uvList.push(g); return true;
}
function archTexture() {
  if (archTex) return archTex;
  archTex = bandTex(256, 256, (g, W, H) => { g.fillStyle = '#f1efe9'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`; g.fillRect(Math.random() * W, Math.random() * H, 3, 3); }
    const x0 = W * 0.22, x1 = W * 0.78, yb = H * 0.86, ys = H * 0.42, r = (x1 - x0) / 2;
    g.fillStyle = '#d6d0c4'; g.beginPath(); g.moveTo(x0 - 10, yb + 8); g.lineTo(x0 - 10, ys); g.arc(W / 2, ys, r + 10, Math.PI, 0); g.lineTo(x1 + 10, yb + 8); g.closePath(); g.fill();
    g.fillStyle = '#1d2733'; g.beginPath(); g.moveTo(x0, yb); g.lineTo(x0, ys); g.arc(W / 2, ys, r, Math.PI, 0); g.lineTo(x1, yb); g.closePath(); g.fill();
    g.fillStyle = 'rgba(160,190,220,.25)'; g.beginPath(); g.moveTo(x0 + 6, yb - 4); g.lineTo(x0 + 6, ys); g.arc(W / 2, ys, r - 6, Math.PI, Math.PI * 1.35); g.lineTo(x0 + r * 0.7, yb - 4); g.fill();
    g.fillStyle = '#f1efe9'; g.fillRect(W / 2 - 3, ys - r, 6, yb - ys + r); g.fillRect(x0, ys + 6, x1 - x0, 5);
    g.fillStyle = '#c9c2b4'; g.fillRect(x0 - 16, yb, x1 - x0 + 32, 12); });
  archTex.wrapS = THREE.RepeatWrapping; return archTex;
}

/** rooftop billboard: two posts + a catwalk and a 9 x 3 m face, set back from the street wall */
function billboard(K, f, ad, list) {
  const F = K.frame(f), H = wallH(f.b), c = f.L / 2, w = Math.min(9, f.L - 1), y0 = H + 1.6, y1 = y0 + w / 3, back = -2.2;
  for (const u of [c - w * 0.32, c + w * 0.32]) K.box(F, u - 0.12, u + 0.12, H, y0, back - 0.35, back - 0.11, 0x3a3c40);
  K.box(F, c - w / 2, c + w / 2, y0 - 0.1, y0, back - 0.9, back, 0x3a3c40);
  K.box(F, c - w / 2 - 0.1, c + w / 2 + 0.1, y0, y1 + 0.1, back - 0.2, back - 0.05, 0x26282c);
  list.push({ F, ad, u0: c - w / 2, u1: c + w / 2, y0: y0 + 0.05, y1: y1 + 0.05, w: back - 0.04 });
}
function adsTex(lite) {
  const k = lite ? 0.5 : 1;
  return bandTex(Math.round(2048 * k), Math.round(1366 * k), (g, W, H) => {
    ADS.forEach(([a, b, bg, fg, ac], i) => { const x = (i % 2) * W / 2, y = Math.floor(i / 2) * H / 2, w = W / 2, h = H / 2; g.fillStyle = bg; g.fillRect(x, y, w, h);
      g.fillStyle = ac; g.fillRect(x, y + h * 0.82, w, h * 0.18); g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillStyle = fg; fitFont(g, a, '900', '"Arial Black", Arial, sans-serif', w * 0.86, h * 0.36); g.fillText(a, x + w * 0.07, y + h * 0.33);
      fitFont(g, b, 'italic 600', 'Georgia, serif', w * 0.86, h * 0.13); g.fillText(b, x + w * 0.07, y + h * 0.64); });
  });
}

// ---------------------------------------------------------------------------------------------------------------------------
/** storefronts on faces given from outside (8th Ave by Soc Tav: its painted fronts have no real doors). items:
 *  [{ A: [x, z], B: [x, z], poly: [[x, z] …] (the building, for the room depth), store: {n, s, st, bg, fg, aw, k}, enter }]; the
 *  outward normal is taken to point away from the polygon's centre. Returns the walk-in units (pushed to W.shopUnits). */
export function extraFronts(world, items) {
  const { scene } = world, lite = !!world.ctx.lite, K = new Kit(), signs = [], out = [];
  for (const it of items) {
    const [ax, az] = it.A, [bx, bz] = it.B, L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L; let nx = tz, nz = -tx;
    const cx = it.poly.reduce((a, p) => a + p[0], 0) / it.poly.length, cz = it.poly.reduce((a, p) => a + p[1], 0) / it.poly.length; if (nx * ((ax + bx) / 2 - cx) + nz * ((az + bz) / 2 - cz) < 0) { nx = -nx; nz = -nz; }
    const f = { A: it.A, B: it.B, L, tx, tz, nx, nz, b: { p: it.poly } }, F = K.frame(f), w = Math.min(L - 0.4, 7.5), u = L / 2;
    const unit = shopUnit(K, F, u, w, it.store, signs, { enter: it.enter });
    if (it.enter) { const e = makeEnterable(world, K, f, F, unit, it.store); if (e) out.push(e); }
  }
  if (signs.length) { const tex = atlasOf(signs, lite); for (const sg of signs) sg.place(); const me = new THREE.Mesh(mergeGeometries(K.sign, false), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.3 })); me.name = 'fronts:extraSigns'; scene.add(me); }
  if (K.col.length) { const me = new THREE.Mesh(mergeGeometries(K.col, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.15 })); me.name = 'fronts:extraKit'; me.receiveShadow = true; scene.add(me); }
  if (K.glass.length) { const me = new THREE.Mesh(mergeGeometries(K.glass, false), new THREE.MeshStandardMaterial({ color: 0x24303c, roughness: 0.08, metalness: 0.75, emissive: 0x3a2e1c, emissiveIntensity: 0.35 })); me.name = 'fronts:extraGlass'; scene.add(me); }
  (world.W.shopUnits || (world.W.shopUnits = [])).push(...out);
  return out;
}

export function buildFronts(world, M) {
  const { scene, ctx } = world, lite = !!ctx.lite; let seed = 41851; const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);   // own sequence: world.R stays as it was
  const all = faces(), inMap = (f) => f.mx > PLAY.x0 - 10 && f.mx < PLAY.x1 + 10 && f.mz > -560 && f.mz < BW.z0;
  const K = new Kit(), signs = [], st = { stores: 0, generic: 0, walkups: 0, arches: 0, boards: 0 };
  const mats = [];
  // 1) the mapped businesses: the street face of their building nearest the point, the unit centred on the point
  const NORM = STORES.find((s) => s.st === 'landmark');
  const ENTER_MAX = lite ? 6 : 14, shopUnits = []; let enterN = 0;
  for (const s of STORES) {
    if (s === NORM) continue;
    let best = null, bd = 18;
    for (const f of all) { if (!f.street || !inMap(f)) continue; const d = segD(s.x, s.z, f.A, f.B); if (d < bd) { bd = d; best = f; } }
    if (!best) continue;
    const big = s.st === 'bubble', w0 = Math.min(big ? 12 : 7.5, best.L - 0.4); if (w0 < 2.8) continue;
    const t = ((s.x - best.A[0]) * best.tx + (s.z - best.A[1]) * best.tz); let u = Math.max(w0 / 2 + 0.2, Math.min(best.L - w0 / 2 - 0.2, t)), w = w0;
    // don't overlap a neighbour already on this face: slide off it, else shrink into the gap
    for (const [a, b] of best.used) { if (u + w / 2 > a && u - w / 2 < b) { u = u < (a + b) / 2 ? a - w / 2 - 0.1 : b + w / 2 + 0.1; } }
    if (u - w / 2 < 0.1 || u + w / 2 > best.L - 0.1 || best.used.some(([a, b]) => u + w / 2 > a && u - w / 2 < b)) continue;
    best.used.push([u - w / 2, u + w / 2]); best.store = true;
    const square = Math.abs(best.tx) > 0.995 || Math.abs(best.tz) > 0.995, F = K.frame(best), enter = square && enterN < ENTER_MAX && !big && w >= 4.5;
    const unit = shopUnit(K, F, u, w, s, signs, { ...(big ? { sy1: SIGN_Y1 + 0.5 } : {}), enter }); st.stores++;
    if (enter) { const e = makeEnterable(world, K, best, F, unit, s); if (e) { shopUnits.push(e); enterN++; } }
  }
  // NORMAN'S: every street face of its building
  if (NORM) { let b = null, bd = 25; for (const f of all) { if (!f.street) continue; const d = segD(NORM.x, NORM.z, f.A, f.B); if (d < bd) { bd = d; b = f.b; } }
    if (b) { const fs = all.filter((f) => f.b === b && f.street && f.L > 6).sort((p, q) => q.L - p.L).slice(0, 2); for (const f of fs) f.store = f.landmark = true; mats.push(...normans(world, K, fs, lite)); } }
  // 2) the walk-up streets: ground-floor shops on every street face of the apartment blocks, cornices + fire escapes
  for (const f of all) {
    if (!inMap(f) || !f.street || f.landmark) continue;
    const res = f.b.s === 'apart' || f.b.s === 'rowhouse' || (f.b.s === 'tower' && f.b.h < 40);
    if (res && WALKUP.has(f.street)) {
      walkup(K, f, R); st.walkups++;
      if (f.b.s !== 'rowhouse' || f.street !== 'side') {
        const n = Math.floor(f.L / 6.5);
        for (let k = 0; k < n; k++) { const u = f.L * (k + 0.5) / n, w = Math.min(6, f.L / n - 0.4); if (R() < 0.28 || f.used.some(([a, b]) => u + w / 2 > a && u - w / 2 < b)) continue;
          const [nm, sub, bg, fg, aw] = GENERIC[(R() * GENERIC.length) | 0]; shopUnit(K, K.frame(f), u, w, { n: nm, s: sub, st: R() < 0.2 ? 'chan' : 'box', bg, fg, aw: R() < 0.5 ? aw : null }, signs, { doorLeft: R() < 0.5 }); f.used.push([u - w / 2, u + w / 2]); st.generic++; }
      }
    }
  }
  // 3) Surf Ave north side: arched upper storeys and a few billboards on the roofs
  const arches = [], boards = [];
  for (const f of all) {
    if (!inMap(f) || f.street !== 'surf' || f.landmark || f.nz < 0.45) continue;
    const shopLike = !['tower', 'apart', 'civic', 'rowhouse', 'aquarium', 'service'].includes(f.b.s);
    if (shopLike && f.L > 8 && R() < 0.6 && archBand(world, f, arches)) st.arches++;
    if (shopLike && f.L > 10 && boards.length < ADS.length * 2 && R() < 0.45) { billboard(K, f, ADS[boards.length % ADS.length], boards); st.boards++; }
  }

  // ---- meshes ----
  if (signs.length) { const tex = atlasOf(signs, lite); for (const s of signs) s.place();
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.3 }); mats.push(m);
    const me = new THREE.Mesh(mergeGeometries(K.sign, false), m); me.name = 'fronts:signs'; me.receiveShadow = true; scene.add(me); }
  if (K.col.length) { const me = new THREE.Mesh(mergeGeometries(K.col, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.15 })); me.name = 'fronts:kit'; me.castShadow = !lite; me.receiveShadow = true; scene.add(me); }
  if (K.glass.length) { const me = new THREE.Mesh(mergeGeometries(K.glass, false), new THREE.MeshStandardMaterial({ color: 0x24303c, roughness: 0.08, metalness: 0.75, emissive: 0x3a2e1c, emissiveIntensity: 0.35 })); me.name = 'fronts:glass'; scene.add(me); }
  if (arches.length) { const me = new THREE.Mesh(mergeGeometries(arches, false), new THREE.MeshStandardMaterial({ map: archTexture(), roughness: 0.85 })); me.name = 'fronts:arches'; me.receiveShadow = true; scene.add(me); }
  if (boards.length) { const tex = adsTex(lite), list = []; for (const b of boards) { const i = ADS.indexOf(b.ad); list.push(K.quad(b.F, [], b.u0, b.u1, b.y0, b.y1, b.w, [(i % 2) / 2, 1 - (Math.floor(i / 2) + 1) / 2, 0.5, 0.5])); }
    const me = new THREE.Mesh(mergeGeometries(list, false), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.18 })); me.name = 'fronts:billboards'; scene.add(me); }
  console.log('[fronts]', st.stores, 'mapped stores ·', st.generic, 'procedural shops ·', st.walkups, 'walk-up faces ·', st.arches, 'arched upper storeys ·', st.boards, 'billboards');
  st.enterable = shopUnits.length; world.W.shopUnits = shopUnits;
  world.W.fronts = { stats: st, faces: all.filter((f) => f.store).length };
  return st;
}
