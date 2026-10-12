// Shared car kit (sedan / cab / hatch / suv / e34 / van, the sports and Soviet kinds; see KINDS). Owned by: main (integration); used by wsp, terminal, sbu.
// The old cars were extruded side profiles: slab sides, square section, glass as a separate band — a PS1 read up close.
// These are lofted: ~40 cross-sections along the length, each a rounded section with tumblehome (the greenhouse leans
// in), plan-view taper at nose and tail, real wheel arches cut into the sills, a greenhouse with A/B/C pillars, and
// separate slots for glass / tyres / rims / trim / lamps / plates so each map instances them with its own materials.
// Car frame: +x = front, y up (ground 0), z = width. Returns { geos: {paint, glass, rubber, rim, trim, lampW, lampR, plate}, len, w, h }.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hasCarModel, instanceCarModel } from './carmodels.js';

const KINDS = {
  //         len   w     clear belt  roof  hood   nose(x of windshield base, top), rear(top, base), wheel x, B-pillar x, tail height
  sedan: { len: 4.75, w: 1.82, clr: 0.19, belt: 0.95, roof: 1.44, hood: 0.86, ws: [1.02, 0.05], rs: [-0.55, -1.5], wheels: [1.43, -1.4], b: [0.02], trunk: 1.0 },   // modern Camry-style: fast windshield, sloped backlight, short deck
  cab:   { len: 4.9, w: 1.84, clr: 0.2, belt: 0.95, roof: 1.5, hood: 0.88, ws: [0.86, 0.22], rs: [-0.92, -1.38], wheels: [1.47, -1.45], b: [0.0], trunk: 1.0, sign: true },   // Crown Vic-style formal roof, long trunk
  hatch: { len: 4.2, w: 1.76, clr: 0.19, belt: 0.95, roof: 1.46, hood: 0.84, ws: [0.9, 0.18], rs: [-1.25, -1.85], wheels: [1.3, -1.28], b: [0.1], trunk: 1.0 },
  suv:   { len: 4.8, w: 1.92, clr: 0.28, belt: 1.13, roof: 1.78, hood: 1.06, ws: [1.1, 0.42], rs: [-2.02, -2.2], wheels: [1.47, -1.44], b: [0.2, -0.95], trunk: 1.14, square: true, rack: true, clad: true },   // two-box, upright tail, roof rack, black arch cladding
  // BMW E34-style saloon: long hood, low belt, tall thin-pillared glasshouse, upright flat trunk, kidney grille, quad round lamps
  e34:   { len: 4.72, w: 1.75, clr: 0.17, belt: 0.86, roof: 1.41, hood: 0.8, ws: [0.72, 0.16], rs: [-0.86, -1.36], wheels: [1.42, -1.34], b: [-0.17], trunk: 0.9, square: true, kidney: true },
  coupe: { len: 4.45, w: 1.94, clr: 0.14, belt: 0.78, roof: 1.22, hood: 0.72, ws: [0.55, -0.35], rs: [-0.95, -1.7], wheels: [1.33, -1.3], b: [-0.35], trunk: 0.84, sport: true, eye: { x: 0.05, y: 1.02, z: -0.36 } },   // mid-engine supercar (Ferrari model: cockpit ahead of the engine)
  muscle: { len: 4.8, w: 1.9, clr: 0.16, belt: 0.86, roof: 1.33, hood: 0.84, ws: [0.75, -0.1], rs: [-0.75, -1.6], wheels: [1.45, -1.4], b: [-0.1], trunk: 0.88, sport: true },   // Camaro-ish
  // Soviet classics: boxy three-box sedans, narrow track, chrome bumpers
  lada: { len: 4.12, w: 1.62, clr: 0.17, belt: 0.92, roof: 1.44, hood: 0.86, ws: [0.62, 0.12], rs: [-0.74, -1.22], wheels: [1.21, -1.21], b: [-0.2], trunk: 0.9, boxy: true },
  volga: { len: 4.73, w: 1.8, clr: 0.18, belt: 0.93, roof: 1.48, hood: 0.88, ws: [0.8, 0.24], rs: [-0.95, -1.45], wheels: [1.4, -1.4], b: [-0.2], trunk: 0.93, boxy: true },
  moskvich: { len: 4.1, w: 1.55, clr: 0.18, belt: 0.93, roof: 1.45, hood: 0.87, ws: [0.6, 0.1], rs: [-0.7, -1.2], wheels: [1.2, -1.2], b: [-0.2], trunk: 0.92, boxy: true },
  van:   { len: 5.2, w: 1.98, clr: 0.24, belt: 1.12, roof: 2.08, hood: 1.02, ws: [1.72, 1.2], rs: [-2.5, -2.58], wheels: [1.68, -1.72], b: [0.7], trunk: 1.12, panel: true },
};
export const CAR_KINDS = Object.keys(KINDS);
export function carSpec(kind) { return KINDS[kind]; }

// plan-view half width at x: boxy / square bodies keep square corners, the rest taper at nose and tail
const halfWOf = (K) => { const HW = K.w / 2, xf = K.len / 2, xr = -xf; return (x) => { const u = x > 0 ? x / xf : x / xr; return K.boxy || K.square ? HW * (1 - 0.04 * Math.pow(u, 12)) : HW * (1 - 0.1 * Math.pow(u, 6)); }; };
const smooth = (a, b, t) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };

export function carGeometries(kind = 'sedan', { wheels = true } = {}) {
  const K = KINDS[kind]; const L = K.len, HW = K.w / 2, xf = L / 2, xr = -L / 2;
  const NS = 44;                       // stations along the length (22 read faceted up close)
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
  const halfW = halfWOf(K);
  // cross-section ring: [z/halfW, y-param] from bottom-right around the top to bottom-left.
  // y-param: 'b' bottom, 'r' rocker, 's' shoulder, 'e' belt edge, 'g' glass (lerp belt→roof), 'R' roof edge, 'C' roof centre
  const ring = [[0.86, 'b'], [0.985, 'r'], [1.0, 's'], [0.975, 'e'], [0.9, 'g1'], [0.8, 'g2'], [0.74, 'R'], [0.4, 'C'], [0.0, 'C0']];
  const RN = ring.length; const full = []; for (let i = 0; i < RN; i++) full.push([ring[i][0], ring[i][1]]); for (let i = RN - 2; i >= 0; i--) full.push([-ring[i][0], ring[i][1]]);
  const M = full.length;
  const pos = [], floorPos = [];   // floorPos: the 'b' corners per station at sill height (the floor ignores the arches)
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
      if (k === 'b') { const b0 = K.clr + 0.02; floorPos.push(x, endK > 0 ? b0 - (b0 - (b0 + be) / 2) * 0.35 * endK : b0, z); }
      pos.push(x, y, z);
    }
  }
  const idxPaint = [], idxGlass = [], idxDark = [];   // idxDark: the rocker cladding and the window seals (trim slot)
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
      // dark rocker along the sills (grounds the body, reads lower) and a black seal under the side glass: the belt line
      const dark = (!K.boxy && (s === 'b>r' || s === 'r>b')) || (!g && inGH && (s === 'e>g1' || s === 'g1>e') && !pillar(xm));
      (g ? idxGlass : dark ? idxDark : idxPaint).push(a, c, b, b, c, d);
    }
  }
  // end caps (fan)
  // (the ring is open across the bottom: the fan's last triangle closes the nose / tail down to the sill chord)
  // each triangle is wound to face out along the car (dir -1 tail, +1 nose); a fixed winding left the tail panel facing in
  const capFan = (st, dir) => { const base = st * M; const cx = pos.length / 3; let sy = 0; for (let j = 0; j < M; j++) sy += pos[(base + j) * 3 + 1]; sy /= M; pos.push(xs[st], sy, 0);
    const P = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]), n = new THREE.Vector3();
    for (let j = 0; j < M; j++) { const a = base + j, b = base + (j + 1) % M, o = P(cx); n.subVectors(P(a), o).cross(new THREE.Vector3().subVectors(P(b), o)); n.x * dir >= 0 ? idxPaint.push(cx, a, b) : idxPaint.push(cx, b, a); } };
  capFan(0, -1); capFan(NS, 1);
  const mk = (idx) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g.toNonIndexed(); };
  const paint = mk(idxPaint), glass = mk(idxGlass), darkSkin = mk(idxDark);
  // the glass shares the body's edges exactly: pushing it in (for a frame line) opened a crack all round every window

  const parts = { rubber: [], rim: [], trim: [darkSkin], lampW: [], lampR: [], plate: [], paintX: [], caliper: [] };
  const box = (arr, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); arr.push(g); };
  // closed underside + wheel wells. The loft is a shell open at the bottom and its inside faces are culled, so anything that
  // looked in (into an arch, under a sill, through the nose cap) saw straight through the car. Floor: both windings (dark
  // from below, and the cabin floor from inside). Each well: a liner strip over the arch and down its two legs to the floor,
  // and an inboard wall (the arch shape), both wound both ways, so an arch reads as a dark pocket from outside and a hump inside.
  { const T = [], orient = (a, b, c, toward) => { const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)), m = new THREE.Vector3().add(a).add(b).add(c).multiplyScalar(1 / 3); return n.dot(toward(m)) >= 0 ? [a, b, c] : [a, c, b]; };
    const tri = (a, b, c, toward) => { for (const v of orient(a, b, c, toward)) T.push(v.x, v.y, v.z); }, V = (i) => new THREE.Vector3(floorPos[i * 3], floorPos[i * 3 + 1], floorPos[i * 3 + 2]);
    const down = () => new THREE.Vector3(0, -1, 0), up = () => new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < NS; i++) { const a = V(i * 2), b = V(i * 2 + 1), c = V(i * 2 + 2), d = V(i * 2 + 3); for (const f of [down, up]) { tri(a, b, c, f); tri(b, d, c, f); } }
    const y0 = K.clr + 0.02, ARC = 12;
    for (const wx of K.wheels) for (const sz of [1, -1]) {
      const zo = sz * (halfW(wx) + 0.01), zi = sz * (halfW(wx) - 0.36);   // outer edge just past the skin; inboard wall behind the tyre
      const prof = [new THREE.Vector2(wx + archR, y0)]; for (let k = 0; k <= ARC; k++) { const a = k / ARC * Math.PI; prof.push(new THREE.Vector2(wx + Math.cos(a) * archR, 0.33 + Math.sin(a) * archR * 0.98)); } prof.push(new THREE.Vector2(wx - archR, y0));
      for (let k = 0; k < prof.length - 1; k++) { const p = prof[k], q = prof[k + 1], P = (v, z) => new THREE.Vector3(v.x, v.y, z), inward = (m) => new THREE.Vector3(wx - m.x, 0.33 - m.y, 0);
        const a = P(p, zo), b = P(q, zo), c = P(p, zi), d = P(q, zi), outward = (m) => inward(m).negate(); for (const f of [inward, outward]) { tri(a, b, c, f); tri(b, d, c, f); } }
      const ctr = new THREE.Vector3(wx, (y0 + 0.33) / 2, zi), out = () => new THREE.Vector3(0, 0, sz), inn = () => new THREE.Vector3(0, 0, -sz);
      for (let k = 0; k < prof.length - 1; k++) for (const f of [out, inn]) tri(ctr, new THREE.Vector3(prof[k].x, prof[k].y, zi), new THREE.Vector3(prof[k + 1].x, prof[k + 1].y, zi), f);   // both ways: the cabin sees the arch humps
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(T, 3)); g.computeVertexNormals(); parts.trim.push(g); }
  // wheels: tyre with a rounded shoulder, rim face with 5 spokes, dark hub
  for (const wx of K.wheels) for (const sz of [1, -1]) {
    const zc = sz * (halfW(wx) - 0.13);
    if (!wheels) continue;   // traffic: the wheels are separate instances that spin (wheelGeometry)
    const tyre = new THREE.LatheGeometry([[0.2, -0.11], [wheelR - 0.035, -0.115], [wheelR, -0.08], [wheelR + 0.004, 0], [wheelR, 0.08], [wheelR - 0.035, 0.115], [0.2, 0.11]].map(([r, y]) => new THREE.Vector2(r, y)), 10);
    tyre.rotateX(Math.PI / 2); tyre.translate(wx, wheelR, zc); parts.rubber.push(tyre);
    const face = new THREE.CylinderGeometry(0.215, 0.215, 0.02, 12); face.rotateX(Math.PI / 2); face.translate(wx, wheelR, zc + sz * 0.1); parts.trim.push(face);
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 + (k % 2) * 0.12; const sp = new THREE.BoxGeometry(0.19, 0.03, 0.025); sp.translate(0.105, 0, 0); sp.rotateZ(a); sp.translate(wx, wheelR, zc + sz * 0.115); parts.rim.push(sp); }   // split 5-spoke
    { const lip = new THREE.TorusGeometry(0.212, 0.012, 6, 24); lip.translate(wx, wheelR, zc + sz * 0.112); parts.rim.push(lip);
      const barrel = new THREE.CylinderGeometry(0.205, 0.205, 0.16, 16, 1, true); barrel.rotateX(Math.PI / 2); barrel.translate(wx, wheelR, zc + sz * 0.03); parts.trim.push(barrel);
      const disc = new THREE.CylinderGeometry(0.16, 0.16, 0.02, 18); disc.rotateX(Math.PI / 2); disc.translate(wx, wheelR, zc + sz * 0.06); parts.rim.push(disc);
      const cal = new THREE.BoxGeometry(0.1, 0.13, 0.05); cal.translate(wx + (wx > 0 ? -0.12 : 0.12), wheelR + 0.06, zc + sz * 0.075); parts.caliper.push(cal); }
    const hub = new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10); hub.rotateX(Math.PI / 2); hub.translate(wx, wheelR, zc + sz * 0.12); parts.rim.push(hub);
  }
  // lamps: headlamps wrap the nose corners, tail lamps across the tail corners
  const hlY = K.hood - 0.13, tlY = K.trunk - 0.12;
  for (const sz of [1, -1]) {
    if (K.kidney) {   // E34: a black panel across the nose carrying two round lamps a side, wide wrap-around tail clusters
      box(parts.trim, 0.04, 0.17, 0.5, xf - 0.03, hlY, sz * 0.43);
      for (const lz of [0.31, 0.53]) { const l = new THREE.CylinderGeometry(0.068, 0.068, 0.04, 14); l.rotateZ(Math.PI / 2); l.translate(xf - 0.005, hlY, sz * lz); parts.lampW.push(l); }
      box(parts.lampR, 0.035, 0.13, 0.46, xr + 0.03, tlY, sz * (halfW(xr + 0.1) - 0.24), 0, -sz * 0.1);
    } else {
      const hz = sz * (halfW(xf - 0.1) - 0.3);
      box(parts.trim, 0.05, 0.13, 0.42, xf - 0.045, hlY, hz, 0, sz * 0.22);   // dark housing: the lens reads as a cluster, not a sticker
      box(parts.lampW, 0.05, 0.09, 0.36, xf - 0.035, hlY, hz, 0, sz * 0.22);
      box(parts.lampW, 0.03, 0.018, 0.34, xf - 0.02, hlY - 0.075, hz, 0, sz * 0.22);   // DRL strip
      const tz = sz * (halfW(xr + 0.1) - 0.27);
      box(parts.trim, 0.04, 0.11, 0.42, xr + 0.04, tlY, tz, 0, -sz * 0.18);
      box(parts.lampR, 0.035, 0.08, 0.36, xr + 0.03, tlY, tz, 0, -sz * 0.18);
      box(parts.lampW, 0.036, 0.03, 0.1, xr + 0.03, tlY - 0.02, tz - sz * 0.08, 0, -sz * 0.18);   // reversing lamp
    }
    // mirrors (paint) on a dark stalk
    const mx = wsBase - 0.2; box(parts.paintX, 0.1, 0.12, 0.2, mx, K.belt + 0.08, sz * (HW + 0.1)); box(parts.trim, 0.05, 0.04, 0.12, mx, K.belt + 0.04, sz * (HW + 0.02));
    // door handles + shut lines
    const doors = [K.b[0] + 0.55, K.b[0] - 0.5];
    for (const dx of doors) box(parts.trim, 0.18, 0.035, 0.03, dx, K.belt - 0.1, sz * (halfW(dx) + 0.005));
    for (const bx of [wsBase - 0.08, ...K.b, K.panel ? null : (rsBase + 0.35)].filter(v => v !== null)) box(parts.trim, 0.012, K.belt - K.clr - 0.25, 0.012, bx, (K.belt + K.clr) / 2 + 0.05, sz * (halfW(bx) + 0.003));
    // black window surround / B-pillar applique
    for (const bx of K.b) box(parts.trim, 0.12, (roofAt(bx) - K.belt) * 0.8, 0.012, bx, (roofAt(bx) + K.belt) / 2, sz * (halfW(bx) * 0.88 + 0.004), sz * 0.14);
  }
  // wheel-arch flares (black cladding on the SUV), a shoulder crease, the drip rail round the glasshouse, bumpers, kind extras
  for (const wx of K.wheels) for (const sz of [1, -1]) { const f = new THREE.TorusGeometry(archR + 0.012, K.clad ? 0.05 : 0.03, 5, 14, Math.PI); f.scale(1, 1, 0.7); f.translate(wx, 0.33, sz * (halfW(wx) - 0.006)); (K.clad ? parts.trim : parts.paintX).push(f); }
  { const T = [], tri = (a, b, c, o) => { const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)), m = new THREE.Vector3().add(a).add(b).add(c).multiplyScalar(1 / 3).sub(o); for (const v of n.dot(m) >= 0 ? [a, b, c] : [a, c, b]) T.push(v.x, v.y, v.z); };
    // strip: rows of 3-point profiles along x, swept into an open ridge, wound both ways (seen through the glass from the cabin too)
    const strip = (rows) => { for (let i = 0; i < rows.length - 1; i++) { const A = rows[i], B = rows[i + 1]; for (let k = 0; k < 2; k++) for (const s of [1, -1]) { const o = new THREE.Vector3().subVectors(A[k + 1], A[k]).cross(new THREE.Vector3().subVectors(B[k], A[k])).multiplyScalar(-1e3 * s).add(A[k]); tri(A[k], B[k], A[k + 1], o); tri(B[k], B[k + 1], A[k + 1], o); } } };
    const flush = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(T.splice(0), 3)); g.computeVertexNormals(); return g; };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    for (const sz of [1, -1]) {   // shoulder crease: a 1 cm ridge below the belt, broken where it would cross an arch
      let run = []; const end = () => { if (run.length > 1) strip(run); run = []; };
      for (const x of xs) { const y = Math.min(K.belt - 0.14, beltAt(x) - 0.11), hw = halfW(x);
        if (x < xr + 0.22 || x > xf - 0.28 || y - 0.03 < bottomAt(x)) { end(); continue; }
        run.push([V(x, y + 0.022, sz * hw), V(x, y, sz * (hw + 0.011)), V(x, y - 0.022, sz * hw)]); }
      end(); }
    parts.paintX.push(flush());
    const jR = full.findIndex((r) => r[1] === 'R'), jG = full.findIndex((r) => r[1] === 'g2');   // +z side; the -z side mirrors
    for (const [jr, jg] of [[jR, jG], [M - 1 - jR, M - 1 - jG]]) {   // drip rail / dark window frame along the roof edge, A to C pillar
      const rows = []; xs.forEach((x, i) => { if (roofAt(x) <= beltAt(x) + 0.05) return; const P = (j) => V(pos[(i * M + j) * 3], pos[(i * M + j) * 3 + 1], pos[(i * M + j) * 3 + 2]), r = P(jr), g = P(jg), mid = r.clone().lerp(g, 0.14);
        mid.z += Math.sign(r.z) * 0.008; rows.push([r.clone().lerp(V(r.x, r.y + 0.02, r.z * 0.97), 0.5), mid, r.clone().lerp(g, 0.28)]); });
      strip(rows); }
    parts.trim.push(flush()); }
  const bw = 2 * halfW(xf - 0.08) * 0.96, bwr = 2 * halfW(xr + 0.08) * 0.96;
  if (!K.boxy) {   // bumpers: a full-width bar wrapping the nose / tail, body colour (black plastic on the SUV), lower intake in it
    const bm = K.clad ? parts.trim : parts.paintX;
    box(bm, 0.12, 0.2, bw, xf - 0.02, K.clr + 0.33, 0); box(bm, 0.12, 0.22, bwr, xr + 0.02, K.clr + 0.34, 0);
    box(parts.trim, 0.02, 0.08, K.w * 0.46, xf + 0.045, K.clr + 0.29, 0);
    if (K.clad) { box(parts.rim, 0.05, 0.07, K.w * 0.5, xf + 0.03, K.clr + 0.17, 0); box(parts.rim, 0.05, 0.07, K.w * 0.5, xr - 0.03, K.clr + 0.17, 0); }   // skid plates
  }
  if (K.kidney) for (const kz of [0.085, -0.085]) { box(parts.rim, 0.03, 0.2, 0.15, xf - 0.0, hlY - 0.005, kz); box(parts.trim, 0.03, 0.17, 0.12, xf + 0.006, hlY - 0.005, kz); }   // twin kidneys, chrome surround
  else box(parts.trim, 0.05, 0.16, K.w * 0.5, xf - 0.02, hlY - 0.02, 0);   // grille
  if (K.kidney || K.sign) for (const sz of [1, -1]) box(parts.trim, Math.abs(K.wheels[0] - K.wheels[1]) - 2 * archR - 0.12, 0.045, 0.02, (K.wheels[0] + K.wheels[1]) / 2, K.clr + 0.33, sz * (halfW(0) + 0.006));   // side rub strips
  if (K.rack) { const rx = (wsTop + rsTop) / 2, rl = wsTop - rsTop + 0.3;
    for (const sz of [1, -1]) { box(parts.trim, rl, 0.035, 0.04, rx, K.roof + 0.085, sz * HW * 0.62); for (const fx of [rx - rl / 2 + 0.06, rx + rl / 2 - 0.06]) box(parts.trim, 0.07, 0.07, 0.05, fx, K.roof + 0.045, sz * HW * 0.62); }
    for (const cx of [rx - rl * 0.28, rx + rl * 0.22]) box(parts.rim, 0.04, 0.025, HW * 1.3, cx, K.roof + 0.11, 0); }   // roof rails + crossbars
  // lower intake, bumpers' dark lower lip, plates
  box(parts.trim, 0.06, 0.1, K.w * 0.78, xf - 0.04, K.clr + 0.16, 0);
  box(parts.trim, 0.06, 0.1, K.w * 0.8, xr + 0.04, K.clr + 0.16, 0);
  if (K.boxy) { box(parts.rim, 0.07, 0.09, K.w * 0.98, xf + 0.02, K.clr + 0.3, 0); box(parts.rim, 0.07, 0.09, K.w * 0.98, xr - 0.02, K.clr + 0.34, 0); box(parts.rim, 0.03, 0.14, K.w * 0.52, xf - 0.01, hlY - 0.01, 0); }   // chrome bumpers + grille
  else box(parts.lampR, 0.02, 0.022, K.w * 0.55, xr + 0.012, tlY + 0.045, 0);   // light bar across the tail
  if (K.sport) { box(parts.trim, 0.3, 0.03, K.w * 0.82, xr + 0.25, K.trunk + 0.09, 0); box(parts.trim, 0.04, 0.09, 0.05, xr + 0.3, K.trunk + 0.04, 0.55); box(parts.trim, 0.04, 0.09, 0.05, xr + 0.3, K.trunk + 0.04, -0.55); }   // spoiler
  box(parts.plate, 0.012, 0.11, 0.36, K.boxy ? xf + 0.005 : xf + 0.062, K.clr + 0.3, 0);   // kit bumpers stand 4 cm proud of the nose
  box(parts.plate, 0.012, 0.11, 0.36, xr - 0.005, tlY - 0.2, 0);
  if (K.sign) { box(parts.trim, 0.2, 0.05, 0.5, 0.1, K.roof + 0.03, 0); box(parts.lampW, 0.16, 0.16, 0.48, 0.1, K.roof + 0.13, 0); }
  const merge = (arr) => arr.length ? mergeGeometries(arr.map(g => g.index ? g.toNonIndexed() : g).map(g => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; }), false) : null;
  // paint gets a uv so per-map materials with maps do not break
  for (const g of [paint, glass]) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const paintAll = merge([paint, ...parts.paintX]); paintAll.userData.darkSkin = darkSkin;   // carInterior lines the cabin with both
  return {
    geos: { paint: paintAll, glass, rubber: merge(parts.rubber), rim: merge(parts.rim), trim: merge(parts.trim), lampW: merge(parts.lampW), lampR: merge(parts.lampR), plate: merge(parts.plate), caliper: merge(parts.caliper), shadow: (() => { const g = new THREE.PlaneGeometry(L * 1.08, K.w * 1.25); g.rotateX(-Math.PI / 2); g.translate(0, 0.012, 0); return g; })() },
    len: L, w: K.w + 0.2, h: K.roof,
  };
}

/** Traffic cars: one wheel at the origin (axle along z, outer face toward +z) for a wheel of radius r, split per material
 *  slot like carGeometries: { rubber, rim, trim }. Rotate it pi about y for the left side; spin it about z. */
export function wheelGeometry(r = 0.33) {
  const tyre = new THREE.LatheGeometry([[0.2, -0.11], [r - 0.035, -0.115], [r, -0.08], [r + 0.004, 0], [r, 0.08], [r - 0.035, 0.115], [0.2, 0.11]].map(([a, y]) => new THREE.Vector2(a, y)), 12);
  tyre.rotateX(Math.PI / 2);
  const rim = [], trim = [];
  const face = new THREE.CylinderGeometry(0.215, 0.215, 0.02, 12); face.rotateX(Math.PI / 2); face.translate(0, 0, 0.1); trim.push(face);
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 + (k % 2) * 0.12; const sp = new THREE.BoxGeometry(0.19, 0.03, 0.025); sp.translate(0.105, 0, 0); sp.rotateZ(a); sp.translate(0, 0, 0.115); rim.push(sp); }
  const lip = new THREE.TorusGeometry(0.212, 0.012, 6, 24); lip.translate(0, 0, 0.112); rim.push(lip);
  const barrel = new THREE.CylinderGeometry(0.205, 0.205, 0.16, 16, 1, true); barrel.rotateX(Math.PI / 2); barrel.translate(0, 0, 0.03); trim.push(barrel);
  const disc = new THREE.CylinderGeometry(0.16, 0.16, 0.02, 18); disc.rotateX(Math.PI / 2); disc.translate(0, 0, 0.06); rim.push(disc);
  const hub = new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10); hub.rotateX(Math.PI / 2); hub.translate(0, 0, 0.12); rim.push(hub);
  const m = (arr) => mergeGeometries(arr.map((g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; }), false);
  return { rubber: m([tyre]), rim: m(rim), trim: m(trim) };
}
/** instanced kit wheels for a crowd of cars (one draw per material slot, `count` wheels): set(i, carMatrix, wheel from
 *  wheelLayout, spin (radians rolled), steer (+ = right, fronts only), tyre radius), then commit() once a frame */
export function wheelInstances(parent, count, name = 'wheels', shadows = false) {
  const wg = wheelGeometry(0.33), CM = carMaterials(), UP = new THREE.Vector3(0, 1, 0), ZAX = new THREE.Vector3(0, 0, 1), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), m = new THREE.Matrix4(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const ims = ['rubber', 'rim', 'trim'].map((slot) => { const im = new THREE.InstancedMesh(wg[slot], CM[slot], count); im.name = `${name}:${slot}`; im.frustumCulled = false; im.castShadow = shadows && slot === 'rubber'; parent.add(im); return im; });
  return {
    set(i, base, w, spin, steer = 0, r = 0.33) { q.setFromAxisAngle(UP, (w.x > 0 ? -steer : 0) + (w.side < 0 ? Math.PI : 0)); q2.setFromAxisAngle(ZAX, w.side > 0 ? -spin : spin); q.multiply(q2);
      const k = r / 0.33; sc.set(k, k, 1); m.compose(v.set(w.x, w.y, w.z), q, sc).premultiply(base); for (const im of ims) im.setMatrixAt(i, m); },
    commit() { for (const im of ims) im.instanceMatrix.needsUpdate = true; },
  };
}
/** wheel centres of a kind in the kit frame: [{ x, y, z, side }] (side +1 = +z / right) and the tyre radius */
export function wheelLayout(kind = 'sedan') {
  const K = KINDS[kind] || KINDS.sedan, r = K.clr > 0.25 ? 0.37 : 0.33;
  const halfW = halfWOf(K);
  const out = []; for (const wx of K.wheels) for (const sz of [1, -1]) out.push({ x: wx, y: r, z: sz * (halfW(wx) - 0.13), side: sz });
  return { r, wheels: out };
}
function shadowTex() {   // soft contact shadow under the car (ambient occlusion on the road)
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 32, 4, 64, 32, 62); gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.scale(1, 0.55); g.fillStyle = gr; g.fillRect(0, 0, 128, 117); g.restore(); const t = new THREE.CanvasTexture(c); return t;
}
function plateTex() {   // New York 'Excelsior' plate: gold with navy lettering
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#f1c83a'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#12264f'; g.fillRect(0, 0, 256, 26); g.fillRect(0, 110, 256, 18);
  g.fillStyle = '#f1c83a'; g.font = 'bold 20px Arial'; g.textAlign = 'center'; g.fillText('NEW YORK', 128, 20); g.font = 'bold 13px Arial'; g.fillText('EXCELSIOR', 128, 124);
  g.fillStyle = '#12264f'; g.font = 'bold 54px Arial'; const L = 'ABCDEFGHJKLMNPRSTUVWXYZ'; let s = ''; for (let i = 0; i < 3; i++) s += L[(Math.random() * L.length) | 0]; s += '-'; for (let i = 0; i < 4; i++) s += (Math.random() * 10) | 0; g.fillText(s, 128, 88);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** Default materials for the kit (maps may substitute their own). Paint is white so instanceColor tints it. */
let MATS = null;
export function carMaterials() {
  if (MATS) return MATS;
  MATS = {
    paint: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.08, envMapIntensity: 0.9 }),
    // tinted glass: near-black body, a sharp mirror reflection dimmed and cooled by the tint (one specular layer: a clearcoat on top
    // of a high-ior base doubled the sky and washed the side windows out to white at a glance)
    glass: new THREE.MeshPhysicalMaterial({ color: 0x04070a, roughness: 0.015, metalness: 0.0, ior: 1.5, specularIntensity: 1, specularColor: 0xb4c2cc, envMapIntensity: 1.2 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.93 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x9a9ea3, roughness: 0.35, metalness: 0.9 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x121314, roughness: 0.6, metalness: 0.2 }),
    lampW: new THREE.MeshStandardMaterial({ color: 0xd9e0e4, roughness: 0.1, metalness: 0.3, emissive: 0x3a4044 }),
    lampR: new THREE.MeshStandardMaterial({ color: 0x8a0e0e, roughness: 0.2, emissive: 0x300404 }),
    plate: new THREE.MeshStandardMaterial({ map: plateTex(), roughness: 0.45 }),
    caliper: new THREE.MeshStandardMaterial({ color: 0xb01818, roughness: 0.4, metalness: 0.3 }),
    shadow: new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, opacity: 0.85 }),
  };
  MATS.lampW.emissive.setHex(0x8a9298); MATS.lampR.emissive.setHex(0x6a0808);
  MATS.glassSee = new THREE.MeshPhysicalMaterial({ color: 0x10171c, roughness: 0.015, transparent: true, opacity: 0.68, depthWrite: false, ior: 1.5, specularIntensity: 1, specularColor: 0xb4c2cc, envMapIntensity: 1.2 });   // driven cars: see who's inside
  if (typeof window !== 'undefined' && window.__zavodLite) { for (const k of ['paint', 'glass', 'glassSee']) { const o = MATS[k]; const n = new THREE.MeshStandardMaterial({ color: o.color, roughness: o.roughness, metalness: o.metalness, transparent: o.transparent, opacity: o.opacity, depthWrite: o.depthWrite }); MATS[k] = n; } }   // phones: no clearcoat
  for (const k in MATS) MATS[k].name = 'car_' + k;
  return MATS;
}
export const CAR_COLORS = [0x1a1a1c, 0x9a9ea3, 0x5f656b, 0x22305c, 0x6a1c1c, 0xb4b2ab, 0x33383c, 0x16181a, 0x7b8086, 0x1a4433, 0x4a4036, 0x2d4a55, 0xd8d6cf, 0x0f1e3a].map(c => new THREE.Color(c));

// phones: a parked row's tyres, dark trim and calipers become one vertex-coloured slot ('dark'), one draw call per kind per row
// instead of three (~30 fewer in a street view). All three are near-black or tiny, so the shared roughness doesn't show.
const DARK_SLOTS = ['rubber', 'trim', 'caliper'];
let DARK = null;
const darkMat = () => DARK || (DARK = new THREE.MeshStandardMaterial({ name: 'car_dark', vertexColors: true, roughness: 0.85, metalness: 0.15 }));
/** One read-only set of carGeometries(kind) per kind for every user that only instances it (parked cars, the Uber): a sedan's
 *  geometry is a few MB, building it again per user doubled that. Callers that transform geometry use carGeometries(). */
const _shared = new Map();
export function sharedCarGeometries(kind) { let k = _shared.get(kind); if (!k) _shared.set(kind, (k = carGeometries(kind))); return k; }
function parkedGeos(ctx, kind) {
  const G = { ...sharedCarGeometries(kind).geos }; if (!ctx?.lite) return G;
  const CM = carMaterials(), parts = [];
  for (const s of DARK_SLOTS) { const g0 = G[s]; delete G[s]; if (!g0) continue; const g = g0.index ? g0.toNonIndexed() : g0.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const c = CM[s].color, n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g); }
  if (parts.length) G.dark = mergeGeometries(parts);
  return G;
}

/** Instances parked cars: list of { x, y?, z, ry, kind, color? } → one InstancedMesh per kind × slot. No colliders (callers add them). */
export function placeCars(world, list, { raycast = true } = {}) {
  const { scene, ctx, R } = world; const CM = carMaterials();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  const reg = world.parkedCars || (world.parkedCars = []);
  if (world.W && !world.W.parkedCars) world.W.parkedCars = reg;   // vehicles.js reads ctx.world.parkedCars (touch STEAL button)
  if (world.W && !world.W.carLampsGlow) { world.W.carLampsGlow = true; const g = world.W.nightGlow || (world.W.nightGlow = []); g.push({ m: CM.lampW, e0: CM.lampW.emissiveIntensity, f: 1.5 }, { m: CM.lampR, e0: CM.lampR.emissiveIntensity, f: 2.5 }); }   // kit lamps brighten after dark (coney horizon.js drives nightGlow)
  for (const c of list) { c.refs = []; if (c.color == null) c.color = null; reg.push(c); }
  for (const kind of CAR_KINDS) {
    const P = list.filter((c) => c.kind === kind); if (!P.length) continue;
    if (hasCarModel(kind)) {   // a real model: one InstancedMesh per part
      const T = P.map((c) => m4.compose(p.set(c.x, c.y || 0, c.z), q.setFromAxisAngle(up, c.ry || 0), one).clone());
      const cols = P.map((c) => { const col = c.color != null ? new THREE.Color(c.color) : new THREE.Color([0xb3120f, 0xe8b400, 0xf2f2f0, 0x111214, 0x1f4fb8, 0xb3120f][(Math.random() * 6) | 0]); c.color = col.getHex(); return col; });
      const ims = instanceCarModel(kind, T, cols, scene) || [];
      // LOD: the real model is ~450k triangles a car, so only the nearest few get it; the rest wear the kit's light body
      const hi = ims.map((im) => ({ im, M: P.map((_, i) => { const a = new THREE.Matrix4(); im.getMatrixAt(i, a); return a; }) }));
      for (const h of hi) h.im.count = Math.min(1, P.length);   // one instance until the first LOD pass: the boot pre-warm still compiles its shaders
      const G = parkedGeos(ctx, kind), lo = [];
      for (const slot of Object.keys(G)) { if (!G[slot]) continue;
        const im = new THREE.InstancedMesh(G[slot], slot === 'dark' ? darkMat() : CM[slot], P.length); im.name = `cars:${kind}:lo:${slot}`;
        P.forEach((c, i) => { im.setMatrixAt(i, T[i]); if (slot === 'paint') im.setColorAt(i, cols[i]); });
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.castShadow = slot === 'paint'; im.receiveShadow = true; im.userData.surface = 'metal'; scene.add(im); lo.push(im);
        if (raycast && (slot === 'paint' || slot === 'glass')) ctx.raycastTargets.push(im); }
      P.forEach((c, i) => { for (const im of lo) c.refs.push({ im, i }); });
      carLod(world, { P, T, cols, hi, lo, cur: '' });
      continue;
    }
    const G = parkedGeos(ctx, kind);
    for (const slot of Object.keys(G)) {
      if (!G[slot]) continue;
      const im = new THREE.InstancedMesh(G[slot], slot === 'dark' ? darkMat() : CM[slot], P.length); im.name = `cars:${kind}:${slot}`;
      P.forEach((c, i) => { q.setFromAxisAngle(up, c.ry || 0); p.set(c.x, c.y || 0, c.z); im.setMatrixAt(i, m4.compose(p, q, one)); c.refs.push({ im, i }); if (slot === 'paint') { const col = c.color != null ? new THREE.Color(c.color) : (kind === 'cab' ? new THREE.Color(0xf2b820) : CAR_COLORS[((R ? R() : Math.random()) * CAR_COLORS.length) | 0]); c.color = col.getHex(); im.setColorAt(i, col); } });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = slot === 'paint'; im.receiveShadow = true; im.userData.surface = 'metal'; scene.add(im);
      if (raycast && (slot === 'paint' || slot === 'glass')) ctx.raycastTargets.push(im);
    }
  }
}

// parked real-model cars: every ~0.3 s the nearest few (in range) get the full model, packed into the first instances (count =
// how many, hidden when none: a zero-count part still costs a draw call), and their light kit body is hidden; stolen ones (gone) get neither
const LOD_ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
function carLod(world, L) {
  const lists = world.carLods || (world.carLods = []); lists.push(L);
  if (lists.length > 1) return;
  const ctx = world.ctx, R2 = (ctx.lite ? 30 : 45) ** 2, MAX = ctx.lite ? 5 : 12; let t = 0;
  world.updaters.push((dt) => {
    t -= dt; if (t > 0) return; t = 0.3; const cam = ctx.camera?.position; if (!cam) return;
    for (const L of world.carLods) {
      const near = []; L.P.forEach((c, i) => { if (c.gone) return; const d = (c.x - cam.x) ** 2 + (c.z - cam.z) ** 2; if (d < R2) near.push([d, i]); });
      near.sort((a, b) => a[0] - b[0]); const pick = near.slice(0, MAX).map((n) => n[1]), key = pick.join(',') + '|' + L.P.filter((c) => c.gone).length;
      if (key === L.cur) continue; L.cur = key; const set = new Set(pick);
      for (const h of L.hi) { pick.forEach((i, j) => { h.im.setMatrixAt(j, h.M[i]); if (h.im.instanceColor) h.im.setColorAt(j, L.cols[i]); }); h.im.count = pick.length; h.im.visible = pick.length > 0; h.im.instanceMatrix.needsUpdate = true; if (h.im.instanceColor) h.im.instanceColor.needsUpdate = true; }
      for (const im of L.lo) { L.P.forEach((c, i) => im.setMatrixAt(i, c.gone || set.has(i) ? LOD_ZERO : L.T[i])); im.instanceMatrix.needsUpdate = true; im.boundingSphere = null; }
    }
  });
}

/**
 * Colliders for a parked car that match its body (a 3.2 m square let you walk into the nose and bumped you off thin air at
 * the doors): one exact box when it sits square to the grid, else a row of small AABB cells along its length (colliders are
 * axis-aligned; rotated things are built from cells). Sets c.boxes; c.box stays the first for older callers.
 */
export function parkedCarBoxes(world, c) {
  const K = KINDS[c.kind] || KINDS.sedan, L = K.len / 2, W = K.w / 2, y = c.y || 0, H = y + K.roof;
  const fx = Math.cos(c.ry || 0), fz = -Math.sin(c.ry || 0), ax = Math.abs(fx), az = Math.abs(fz);
  if (Math.min(ax, az) < 0.06) { const hx = ax > az ? L : W, hz = ax > az ? W : L; c.boxes = [world.box([c.x - hx, y, c.z - hz], [c.x + hx, H, c.z + hz])]; }
  else {
    const r = W * 0.9, n = Math.max(2, Math.ceil((L - r) / (r * 0.6)) + 1), e = r * (ax + az) * 0.85;   // 0.85: the cell corners stick out past the paint
    c.boxes = []; for (let k = 0; k < n; k++) { const t = -(L - r) + 2 * (L - r) * k / (n - 1), cx = c.x + fx * t, cz = c.z + fz * t; c.boxes.push(world.box([cx - e, y, cz - e], [cx + e, H, cz + e])); }
  }
  c.box = c.boxes[0]; return c.boxes;
}
/** A parked car's colliders (parkedCarBoxes, or the single box older maps set). */
export const carBoxes = (c) => c.boxes || (c.box ? [c.box] : []);
/** Take a parked car's colliders out of the world (stolen / cleared for a scene). */
export function dropParkedCarBoxes(ctx, c) { for (const b of carBoxes(c)) { const k = ctx.colliders.indexOf(b); if (k > -1) ctx.colliders.splice(k, 1); } }

/** Remove one parked car from its instanced meshes (hangout: stolen). */
export function hideParkedCar(c) { const z = new THREE.Matrix4().makeScale(0, 0, 0); for (const { im, i } of c.refs || []) { im.setMatrixAt(i, z); im.instanceMatrix.needsUpdate = true; } c.gone = true; }

/**
 * Driver's-eye point for a kind, in the kit frame (+x front, y up, z right-hand = passenger side): the eye sits ~0.42 m behind
 * the top edge of the windshield, ~0.28 m under the roof, on the left (US driver) seat. vehicles.js places its camera here.
 */
export function carEye(kind = 'sedan') {
  const K = KINDS[kind] || KINDS.sedan;
  if (K.eye) return { ...K.eye };   // real models: the driver's seat of that model
  return { x: K.ws[1] - 0.46, y: K.roof - 0.25, z: -K.w / 2 * 0.4 };
}

/**
 * Cabin for a drivable car (kit frame, same as carGeometries): the inside of the body shell (paint geometry rendered BackSide
 * in a dark trim colour → roof liner, pillars, door cards), a faint tint on the inside of the glass, dashboard with an
 * instrument binnacle (lit gauges), steering wheel on a column (returns `wheel`: rotate wheel.rotation.x to steer), seats,
 * centre console and a rear-view mirror. Opaque exterior glass hides all of it from outside. No colliders / raycast.
 */
export function carInterior(kind = 'sedan', geos = null) {
  const K = KINDS[kind] || KINDS.sedan; const G = geos || carGeometries(kind).geos; const HW = K.w / 2;
  const I = interiorMats();
  const g = new THREE.Group(); g.name = 'carInterior';
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = false; m.receiveShadow = true; parent.add(m); return m; };
  add(G.paint, I.shell); if (G.paint.userData.darkSkin) add(G.paint.userData.darkSkin, I.shell); add(G.glass, I.glassIn);
  const eye = carEye(kind), [wsBase, wsTop] = K.ws;
  // dashboard: from under the windshield base back to ~0.5 m ahead of the eye, top just above the belt line
  const dx0 = eye.x + 0.52, dx1 = wsBase + 0.05, dTop = K.belt - 0.03;   // top below the belt so the hood shows over it
  add(new THREE.BoxGeometry(dx1 - dx0, 0.36, K.w * 0.9), I.dash, (dx0 + dx1) / 2, dTop - 0.18, 0);
  add(new THREE.BoxGeometry(0.2, 0.05, K.w * 0.88), I.dash, dx0 + 0.02, dTop - 0.21, 0, 0, 0, 0.5);          // lower lip, rounded read
  // binnacle hood + gauges in front of the driver
  add(new THREE.BoxGeometry(0.2, 0.16, 0.34), I.dash, dx0 + 0.04, dTop + 0.04, eye.z);   // tall enough that the dials show through the top of the wheel
  add(new THREE.PlaneGeometry(0.26, 0.06), I.gauge, dx0 - 0.064, dTop + 0.03, eye.z, 0, -Math.PI / 2, 0);
  // centre stack + console
  add(new THREE.BoxGeometry(0.16, 0.3, 0.3), I.trim, dx0 - 0.05, dTop - 0.25, 0);
  add(new THREE.PlaneGeometry(0.18, 0.1), I.screen, dx0 - 0.135, dTop - 0.12, 0, 0, -Math.PI / 2, 0);
  add(new THREE.BoxGeometry(0.9, 0.22, 0.24), I.trim, eye.x - 0.1, K.clr + 0.35, 0);
  // seats (base + back), both fronts
  for (const sz of [eye.z, -eye.z]) {
    add(new THREE.BoxGeometry(0.52, 0.14, 0.5), I.seat, eye.x - 0.02, K.clr + 0.32, sz);
    add(new THREE.BoxGeometry(0.13, 0.7, 0.5), I.seat, eye.x - 0.36, K.clr + 0.72, sz, 0, 0, 0.2);
    add(new THREE.BoxGeometry(0.1, 0.18, 0.26), I.seat, eye.x - 0.44, K.clr + 1.14, sz, 0, 0, 0.2);
  }
  // steering wheel on a raked column
  const col = new THREE.Group(); col.position.set(eye.x + 0.43, eye.y - 0.27, eye.z); col.rotation.z = -0.42; g.add(col);   // tilt: top leans toward the driver; high enough that the top of the rim shows looking ahead
  const wheel = new THREE.Group(); col.add(wheel);
  const rim = new THREE.TorusGeometry(0.18, 0.02, 8, 28); rim.rotateY(Math.PI / 2); add(rim, I.wheel, 0, 0, 0, 0, 0, 0, wheel);
  for (const a of [0, Math.PI * 0.62, -Math.PI * 0.62]) { const sp = new THREE.BoxGeometry(0.02, 0.17, 0.03); sp.translate(0, -0.085, 0); add(sp, I.wheel, 0, 0, 0, a, 0, 0, wheel); }
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 12), I.wheel, 0.01, 0, 0, 0, 0, Math.PI / 2, wheel);
  add(new THREE.CylinderGeometry(0.035, 0.045, 0.34, 8), I.trim, 0.18, 0, 0, 0, 0, Math.PI / 2, col);
  // rear bench (base + back), door cards with armrests both sides, sun visors, shifter, cup holders
  { const rx = eye.x - 1.05; if (rx - 0.3 > K.rs[1]) { add(new THREE.BoxGeometry(0.5, 0.14, K.w * 0.78), I.seat, rx, K.clr + 0.3, 0); add(new THREE.BoxGeometry(0.12, 0.62, K.w * 0.78), I.seat, rx - 0.3, K.clr + 0.66, 0, 0, 0, 0.22); } }
  for (const sz of [1, -1]) { const zc = sz * (HW - 0.09);
    add(new THREE.BoxGeometry(1.9, 0.55, 0.05), I.door, eye.x - 0.35, K.clr + 0.55, zc);
    add(new THREE.BoxGeometry(0.55, 0.06, 0.1), I.trim, eye.x - 0.05, K.clr + 0.66, zc - sz * 0.05);
    add(new THREE.BoxGeometry(0.16, 0.02, 0.36), I.visor, wsTop - 0.14, K.roof - 0.035, sz * 0.42); }   // visors folded up flat to the roof
  add(new THREE.CylinderGeometry(0.015, 0.02, 0.18, 8), I.trim, eye.x + 0.15, K.clr + 0.55, 0);
  add(new THREE.SphereGeometry(0.035, 10, 8), I.chrome, eye.x + 0.15, K.clr + 0.65, 0);
  for (const dz of [-0.06, 0.06]) add(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12), I.dash, eye.x - 0.1, K.clr + 0.47, dz);
  // rear-view mirror
  add(new THREE.BoxGeometry(0.03, 0.07, 0.24), I.trim, wsTop - 0.04, K.roof - 0.12, 0);
  add(new THREE.BoxGeometry(0.004, 0.055, 0.22), I.mirror, wsTop - 0.058, K.roof - 0.12, 0);
  return { group: g, wheel };
}
let IMATS = null;
function gaugeTex() {   // speedo + tach dials, lit orange needles
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#050505'; g.fillRect(0, 0, 256, 64);
  for (const cx of [64, 192]) { g.strokeStyle = '#d8d2c4'; g.lineWidth = 2; g.beginPath(); g.arc(cx, 34, 26, Math.PI * 0.8, Math.PI * 2.2); g.stroke();
    for (let i = 0; i <= 10; i++) { const a = Math.PI * 0.8 + i / 10 * Math.PI * 1.4; g.beginPath(); g.moveTo(cx + Math.cos(a) * 20, 34 + Math.sin(a) * 20); g.lineTo(cx + Math.cos(a) * 26, 34 + Math.sin(a) * 26); g.stroke(); }
    g.strokeStyle = '#ff7a1a'; g.lineWidth = 3; const a = Math.PI * (cx < 128 ? 1.2 : 1.05); g.beginPath(); g.moveTo(cx, 34); g.lineTo(cx + Math.cos(a) * 22, 34 + Math.sin(a) * 22); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function interiorMats() {
  if (IMATS) return IMATS;
  IMATS = {
    shell: new THREE.MeshStandardMaterial({ color: 0x5b5853, roughness: 0.9, side: THREE.BackSide }),
    glassIn: new THREE.MeshPhysicalMaterial({ color: 0x8fa3ad, roughness: 0.05, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.BackSide, envMapIntensity: 0.6 }),
    dash: new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.8 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x151618, roughness: 0.55, metalness: 0.2 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x3b3029, roughness: 0.8 }),   // worn brown leather
    wheel: new THREE.MeshStandardMaterial({ color: 0x101112, roughness: 0.5 }),
    gauge: (() => { const t = gaugeTex(); return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.35, roughness: 0.4 }); })(),
    door: new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.85 }), visor: new THREE.MeshStandardMaterial({ color: 0x8a847a, roughness: 0.95 }), chrome: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.15, metalness: 1 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0x2a5f9a, emissiveIntensity: 0.25, roughness: 0.3 }),
    mirror: new THREE.MeshStandardMaterial({ color: 0xaab4bc, roughness: 0.05, metalness: 1 }),
  };
  return IMATS;
}
