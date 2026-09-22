// Shared parked-car kit (sedan / cab / hatch / van / suv). Owned by: main (integration); used by wsp, terminal, sbu.
// The old cars were extruded side profiles: slab sides, square section, glass as a separate band — a PS1 read up close.
// These are lofted: ~40 cross-sections along the length, each a rounded section with tumblehome (the greenhouse leans
// in), plan-view taper at nose and tail, real wheel arches cut into the sills, a greenhouse with A/B/C pillars, and
// separate slots for glass / tyres / rims / trim / lamps / plates so each map instances them with its own materials.
// Car frame: +x = front, y up (ground 0), z = width. Returns { geos: {paint, glass, rubber, rim, trim, lampW, lampR, plate}, len, w, h }.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KINDS = {
  //         len   w     clear belt  roof  hood   nose(x of windshield base, top), rear(top, base), wheel x, B-pillar x, tail height
  sedan: { len: 4.7, w: 1.8, clr: 0.2, belt: 0.93, roof: 1.43, hood: 0.86, ws: [0.95, 0.12], rs: [-0.72, -1.45], wheels: [1.42, -1.38], b: [0.05], trunk: 0.97 },
  cab:   { len: 4.8, w: 1.82, clr: 0.2, belt: 0.95, roof: 1.47, hood: 0.88, ws: [0.92, 0.1], rs: [-0.8, -1.5], wheels: [1.45, -1.42], b: [0.02], trunk: 0.99, sign: true },
  hatch: { len: 4.2, w: 1.76, clr: 0.19, belt: 0.95, roof: 1.46, hood: 0.84, ws: [0.9, 0.18], rs: [-1.25, -1.85], wheels: [1.3, -1.28], b: [0.1], trunk: 1.0 },
  suv:   { len: 4.75, w: 1.9, clr: 0.28, belt: 1.12, roof: 1.74, hood: 1.04, ws: [1.05, 0.35], rs: [-1.9, -2.15], wheels: [1.45, -1.42], b: [0.2, -0.95], trunk: 1.12 },
  van:   { len: 5.2, w: 1.98, clr: 0.24, belt: 1.12, roof: 2.08, hood: 1.02, ws: [1.72, 1.2], rs: [-2.5, -2.58], wheels: [1.68, -1.72], b: [0.7], trunk: 1.12, panel: true },
};
export const CAR_KINDS = Object.keys(KINDS);
export function carSpec(kind) { return KINDS[kind]; }

const smooth = (a, b, t) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };

export function carGeometries(kind = 'sedan') {
  const K = KINDS[kind]; const L = K.len, HW = K.w / 2, xf = L / 2, xr = -L / 2;
  const NS = 30;                       // stations along the length
  const xs = []; for (let i = 0; i <= NS; i++) { const t = i / NS; xs.push(xr + (xf - xr) * (0.5 - 0.5 * Math.cos(Math.PI * t))); } // denser at the ends
  const [wsBase, wsTop] = K.ws, [rsTop, rsBase] = K.rs;
  const archR = 0.43, wheelR = K.clr > 0.25 ? 0.37 : 0.33;
  // side profile
  const beltAt = (x) => { // top of the lower body: hood at the front, rising to the belt at the windshield base, trunk deck behind
    if (x > wsBase) return K.hood + (K.belt - K.hood) * (1 - smooth(wsBase, xf, x)) - 0.12 * smooth(xf - 0.35, xf, x);
    if (x < rsBase) return K.trunk - 0.1 * smooth(xr + 0.3, xr, x);
    return K.belt;
  };
  const roofAt = (x) => { // greenhouse top; equals the belt outside [rsBase, wsBase]
    if (x >= wsBase || x <= rsBase) return beltAt(x);
    const b = beltAt(x);
    if (x > wsTop) return b + (K.roof - b) * Math.pow((wsBase - x) / (wsBase - wsTop), 0.8);
    if (x < rsTop) return b + (K.roof - b) * Math.pow((x - rsBase) / (rsTop - rsBase), 0.75);
    return K.roof + 0.02 * Math.cos(((x - (wsTop + rsTop) / 2) / (wsTop - rsTop)) * Math.PI);
  };
  const bottomAt = (x) => { let y = K.clr + 0.02; for (const wx of K.wheels) { const d = Math.abs(x - wx); if (d < archR) y = Math.max(y, 0.33 + Math.sqrt(archR * archR - d * d) * 0.98); } return y; };
  const halfW = (x) => { const u = x > 0 ? x / xf : x / xr; return HW * (1 - 0.1 * Math.pow(u, 6)); };
  // cross-section ring: [z/halfW, y-param] from bottom-right around the top to bottom-left.
  // y-param: 'b' bottom, 'r' rocker, 's' shoulder, 'e' belt edge, 'g' glass (lerp belt→roof), 'R' roof edge, 'C' roof centre
  const ring = [[0.86, 'b'], [0.985, 'r'], [1.0, 's'], [0.975, 'e'], [0.9, 'g1'], [0.8, 'g2'], [0.74, 'R'], [0.4, 'C'], [0.0, 'C0']];
  const RN = ring.length; const full = []; for (let i = 0; i < RN; i++) full.push([ring[i][0], ring[i][1]]); for (let i = RN - 2; i >= 0; i--) full.push([-ring[i][0], ring[i][1]]);
  const M = full.length;
  const pos = [];
  for (const x of xs) {
    const hw = halfW(x), b = bottomAt(x), be = beltAt(x), ro = roofAt(x), inGH = ro > be + 0.02;
    const tumble = inGH ? 1 : 0;
    for (const [zk, k] of full) {
      let y, z = zk * hw;
      switch (k) {
        case 'b': y = b; break;
        case 'r': y = b + 0.1; break;
        case 's': y = be - 0.1; z *= 1.0; break;
        case 'e': y = be; break;
        case 'g1': y = be + (ro - be) * 0.35; z = Math.sign(zk) * hw * (0.975 - 0.07 * tumble); break;
        case 'g2': y = be + (ro - be) * 0.82; z = Math.sign(zk) * hw * (0.975 - 0.16 * tumble); break;
        case 'R': y = ro; z = Math.sign(zk) * hw * (0.975 - 0.24 * tumble); break;
        case 'C': y = ro + 0.025 * tumble + 0.03 * (1 - tumble); z = Math.sign(zk) * hw * 0.42; break;
        case 'C0': y = ro + 0.03 * tumble + 0.035 * (1 - tumble); z = 0; break;
      }
      if (!inGH && (k === 'g1' || k === 'g2' || k === 'R')) { y = be + (k === 'g1' ? 0.008 : k === 'g2' ? 0.016 : 0.022); z = Math.sign(zk) * hw * (k === 'g1' ? 0.955 : k === 'g2' ? 0.9 : 0.8); }
      // nose/tail round-over in elevation: pull the extreme stations' top in and down
      const endK = Math.max(smooth(xf - 0.12, xf, x), smooth(xr + 0.12, xr, x));
      if (endK > 0) { y = y - (y - (b + be) / 2) * 0.35 * endK; z *= 1 - 0.12 * endK; }
      pos.push(x, y, z);
    }
  }
  const idxPaint = [], idxGlass = [];
  const segOf = (j) => { const k = full[j][1], k2 = full[(j + 1) % M][1]; return k + '>' + k2; };
  const glassSide = new Set(['e>g1', 'g1>g2', 'g2>R', 'R>g2', 'g2>g1', 'g1>e']);
  const glassTop = new Set(['R>C', 'C>C0', 'C0>C', 'C>R']);
  const pillar = (x) => { const bs = K.b; for (const bx of bs) if (Math.abs(x - bx) < 0.07) return true; return x > wsBase - 0.12 || x < rsBase + 0.1 || (x > wsTop - 0.02 && x < wsTop + 0.12) || (x < rsTop + 0.02 && x > rsTop - 0.14); };
  for (let i = 0; i < NS; i++) {
    const xm = (xs[i] + xs[i + 1]) / 2, inGH = roofAt(xm) > beltAt(xm) + 0.05;
    for (let j = 0; j < M - 1; j++) {
      const a = i * M + j, b = a + 1, c = a + M, d = c + 1;
      const s = segOf(j);
      let g = false;
      if (inGH && glassSide.has(s) && s !== 'e>g1' && s !== 'g1>e' && !pillar(xm) && !(K.panel && xm < K.b[0] - 0.1)) g = true;   // side windows (panel van: blind rear)
      if (inGH && glassTop.has(s) && (xm > wsTop + 0.05 || (xm < rsTop - 0.05 && !K.panel))) g = true;                         // windshield / backlight
      (g ? idxGlass : idxPaint).push(a, c, b, b, c, d);
    }
  }
  // end caps (fan)
  const capFan = (st, flip) => { const base = st * M; const cx = pos.length / 3; let sx = 0, sy = 0; for (let j = 0; j < M; j++) { sx += pos[(base + j) * 3 + 1]; } sy = sx / M; pos.push(xs[st], sy, 0); for (let j = 0; j < M - 1; j++) flip ? idxPaint.push(cx, base + j + 1, base + j) : idxPaint.push(cx, base + j, base + j + 1); };
  capFan(0, true); capFan(NS, false);
  const mk = (idx) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g.toNonIndexed(); };
  const paint = mk(idxPaint), glass = mk(idxGlass);
  // glass sits a hair inside the body so its edges read as a frame
  { const p = glass.attributes.position, n = glass.attributes.normal; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) - n.getX(i) * 0.006, p.getY(i) - n.getY(i) * 0.006, p.getZ(i) - n.getZ(i) * 0.006); }

  const parts = { rubber: [], rim: [], trim: [], lampW: [], lampR: [], plate: [], paintX: [] };
  const box = (arr, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); arr.push(g); };
  // wheels: tyre with a rounded shoulder, rim face with 5 spokes, dark hub; dark arch liner behind each wheel
  for (const wx of K.wheels) for (const sz of [1, -1]) {
    const zc = sz * (halfW(wx) - 0.13);
    const tyre = new THREE.LatheGeometry([[0.2, -0.11], [wheelR - 0.035, -0.115], [wheelR, -0.08], [wheelR + 0.004, 0], [wheelR, 0.08], [wheelR - 0.035, 0.115], [0.2, 0.11]].map(([r, y]) => new THREE.Vector2(r, y)), 14);
    tyre.rotateX(Math.PI / 2); tyre.translate(wx, wheelR, zc); parts.rubber.push(tyre);
    const face = new THREE.CylinderGeometry(0.215, 0.215, 0.02, 12); face.rotateX(Math.PI / 2); face.translate(wx, wheelR, zc + sz * 0.1); parts.trim.push(face);
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; const sp = new THREE.BoxGeometry(0.2, 0.045, 0.03); sp.translate(0.1, 0, 0); sp.rotateZ(a); sp.translate(wx, wheelR, zc + sz * 0.115); parts.rim.push(sp); }
    const lip = new THREE.TorusGeometry(0.205, 0.016, 3, 14); lip.translate(wx, wheelR, zc + sz * 0.112); parts.rim.push(lip);
    const hub = new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10); hub.rotateX(Math.PI / 2); hub.translate(wx, wheelR, zc + sz * 0.12); parts.rim.push(hub);
    const liner = new THREE.CylinderGeometry(archR - 0.01, archR - 0.01, HW * 1.5, 8, 1, true, -Math.PI / 2, Math.PI); liner.rotateX(Math.PI / 2); liner.translate(wx, 0.33, 0); parts.trim.push(liner);
  }
  // under-tray between the arches so nothing shows through under the sills
  box(parts.trim, L * 0.92, 0.12, K.w * 0.8, 0, K.clr + 0.08, 0);
  // lamps: headlamps wrap the nose corners, tail lamps across the tail corners
  const hlY = K.hood - 0.13, tlY = K.trunk - 0.12;
  for (const sz of [1, -1]) {
    box(parts.lampW, 0.1, 0.13, 0.42, xf - 0.07, hlY, sz * (HW - 0.3), 0, sz * 0.25);
    box(parts.lampR, 0.08, 0.14, 0.4, xr + 0.06, tlY, sz * (HW - 0.28), 0, -sz * 0.2);
    // mirrors (paint) on a dark stalk
    const mx = wsBase - 0.2; box(parts.paintX, 0.1, 0.12, 0.2, mx, K.belt + 0.08, sz * (HW + 0.1)); box(parts.trim, 0.05, 0.04, 0.12, mx, K.belt + 0.04, sz * (HW + 0.02));
    // door handles + shut lines
    const doors = [K.b[0] + 0.55, K.b[0] - 0.5];
    for (const dx of doors) box(parts.trim, 0.18, 0.035, 0.03, dx, K.belt - 0.1, sz * (halfW(dx) + 0.005));
    for (const bx of [wsBase - 0.08, ...K.b, K.panel ? null : (rsBase + 0.35)].filter(v => v !== null)) box(parts.trim, 0.012, K.belt - K.clr - 0.25, 0.012, bx, (K.belt + K.clr) / 2 + 0.05, sz * (halfW(bx) + 0.003));
    // black window surround / B-pillar applique
    for (const bx of K.b) box(parts.trim, 0.12, (roofAt(bx) - K.belt) * 0.8, 0.012, bx, (roofAt(bx) + K.belt) / 2, sz * (halfW(bx) * 0.88 + 0.004), sz * 0.14);
  }
  // grille + lower intake, bumpers' dark lower lip, plates
  box(parts.trim, 0.05, 0.16, K.w * 0.5, xf - 0.02, hlY - 0.02, 0);
  box(parts.trim, 0.06, 0.1, K.w * 0.78, xf - 0.04, K.clr + 0.16, 0);
  box(parts.trim, 0.06, 0.1, K.w * 0.8, xr + 0.04, K.clr + 0.16, 0);
  box(parts.plate, 0.012, 0.11, 0.36, xf + 0.005, K.clr + 0.3, 0);
  box(parts.plate, 0.012, 0.11, 0.36, xr - 0.005, tlY - 0.2, 0);
  if (K.sign) { box(parts.trim, 0.2, 0.05, 0.5, 0.1, K.roof + 0.03, 0); box(parts.lampW, 0.16, 0.16, 0.48, 0.1, K.roof + 0.13, 0); }
  const merge = (arr) => arr.length ? mergeGeometries(arr.map(g => g.index ? g.toNonIndexed() : g).map(g => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; }), false) : null;
  // paint gets a uv so per-map materials with maps do not break
  for (const g of [paint, glass]) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const paintAll = merge([paint, ...parts.paintX]);
  return {
    geos: { paint: paintAll, glass, rubber: merge(parts.rubber), rim: merge(parts.rim), trim: merge(parts.trim), lampW: merge(parts.lampW), lampR: merge(parts.lampR), plate: merge(parts.plate) },
    len: L, w: K.w + 0.2, h: K.roof,
  };
}

/** Default materials for the kit (maps may substitute their own). Paint is white so instanceColor tints it. */
let MATS = null;
export function carMaterials() {
  if (MATS) return MATS;
  MATS = {
    paint: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.08, envMapIntensity: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0c1216, roughness: 0.04, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.4, reflectivity: 0.9 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.93 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x9a9ea3, roughness: 0.35, metalness: 0.9 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x121314, roughness: 0.6, metalness: 0.2 }),
    lampW: new THREE.MeshStandardMaterial({ color: 0xd9e0e4, roughness: 0.1, metalness: 0.3, emissive: 0x3a4044 }),
    lampR: new THREE.MeshStandardMaterial({ color: 0x8a0e0e, roughness: 0.2, emissive: 0x300404 }),
    plate: new THREE.MeshStandardMaterial({ color: 0xe6e2d4, roughness: 0.5 }),
  };
  for (const k in MATS) MATS[k].name = 'car_' + k;
  return MATS;
}
export const CAR_COLORS = [0x1a1a1c, 0x9a9ea3, 0x5f656b, 0x22305c, 0x6a1c1c, 0xb4b2ab, 0x33383c, 0x16181a, 0x7b8086, 0x1a4433, 0x4a4036, 0x2d4a55, 0xd8d6cf, 0x0f1e3a].map(c => new THREE.Color(c));
