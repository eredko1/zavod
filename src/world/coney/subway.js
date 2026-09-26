// CONEY — ride the F. One six-car R160 F train shuttles on the wall clock (every client sees the same train) along the real
// OSM alignment: Coney Island–Stillwell Av (track 3, the F) → out of the terminal's south throat, east along the el →
// W 8 St–NY Aquarium (upper level, where the F stops) → north up the Culver el over Shell Rd → Neptune Av, and back.
// Doors open at every stop: F — board; F again at a stop — get off. You ride standing by a door, free to look around the car
// or out the windows; the chime and the stop announcements are the real ones. Neptune Av (elevated, side platforms, stairs
// down to Shell Rd & Neptune Ave) is built here, with the el structure from W 8 St up to it. CONEY agent (subway).
import * as THREE from 'three';
import { OSM } from './osm.js';
import { W8 } from './w8th.js';
import { hangkit as K } from '../hangkit.js';

const CAR = 18.4, NCAR = 6, LEN = CAR * NCAR, RAIL = 7.5, FLOOR = 1.1;   // car floor = platform height above top of rail
const VMAX = 13, ACC = 1.1, DWELL = { STW: 30, W8: 20, NEP: 30 };
const STW_X = -54.8, STW_Z0 = -440, STW_ZS = -266;                         // Stillwell track 3 (F): platform north → south end
const NEP_Z = -492;                                                        // Neptune Av: where the Culver el crosses Neptune Ave
let R = null;

export function buildSubway(world) {
  const { ctx, W, scene } = world;
  R = { world, ctx, W, aboard: null, lastAnn: '', t: 0 };
  // ---- the route: Stillwell platform + the shortest OSM el path to the Culver line at Neptune Av ----
  const path = routePath();
  if (!path || path.length < 4) { console.warn('[subway] no route'); return; }
  const P = resample(path, 2);
  // heights: 7.5 m el; up to the W 8 St upper level (F) through that station
  const w8u = new THREE.Vector2(W8.P1.x - W8.P0.x, W8.P1.y - W8.P0.y).normalize();
  const w8a = (p) => (p.x - W8.P0.x) * w8u.x + (p.z - W8.P0.y) * w8u.y, w8o = (p) => -(p.x - W8.P0.x) * w8u.y + (p.z - W8.P0.y) * w8u.x;
  const inW8 = (p) => { const a = w8a(p); return a > -10 && a < W8.L + 10 && Math.abs(w8o(p)) < 12; };
  // snap the path onto the upper track through W 8 St, then ramp the height in / out over 90 m
  for (const p of P) if (inW8(p)) { const a = w8a(p); p.x = W8.P0.x + w8u.x * a + (-w8u.y) * (-W8.halfTrack); p.z = W8.P0.y + w8u.y * a + w8u.x * (-W8.halfTrack); }
  let s = 0; P.forEach((p, i) => { if (i) s += Math.hypot(p.x - P[i - 1].x, p.z - P[i - 1].z); p.s = s; });
  const w8idx = P.map((p, i) => (inW8(p) ? i : -1)).filter((i) => i >= 0), w8s0 = P[w8idx[0]].s, w8s1 = P[w8idx[w8idx.length - 1]].s;
  for (const p of P) { const d = p.s < w8s0 ? w8s0 - p.s : p.s > w8s1 ? p.s - w8s1 : 0; const k = Math.max(0, 1 - d / 90); p.y = RAIL + (W8.UP.rail - RAIL) * (k * k * (3 - 2 * k)); }
  R.P = P; R.L = s;
  // stops (s of the train's HEAD = the end with larger s)
  const sAt = (pred) => { for (const p of P) if (pred(p)) return p.s; return null; };
  const sStw = sAt((p) => p.z > STW_ZS - 2) ?? 180;
  const sW8c = (w8s0 + w8s1) / 2 + 6, sNep = sAt((p) => p.x > 440 && p.z < NEP_Z) ?? s - 20;
  const stops = [{ id: 'STW', s: sStw, name: 'Coney Island–Stillwell Av' }, { id: 'W8', s: sW8c + LEN / 2, name: 'W 8 St–NY Aquarium' }, { id: 'NEP', s: sNep + LEN / 2 - 10, name: 'Neptune Av' }];
  R.stops = stops;
  // timetable: dwell STW → W8 → NEP → W8 → STW, trapezoidal runs (wall clock)
  const runT = (d) => { d = Math.abs(d); const dA = VMAX * VMAX / ACC; return d >= dA ? d / VMAX + VMAX / ACC : 2 * Math.sqrt(d / ACC); };
  const seq = [0, 1, 2, 1]; R.legs = []; let T = 0;
  for (let i = 0; i < seq.length; i++) { const a = stops[seq[i]], b = stops[seq[(i + 1) % seq.length]]; const dw = DWELL[a.id];
    R.legs.push({ kind: 'dwell', t0: T, t1: T + dw, stop: a, next: b, dir: b.s > a.s ? 1 : -1 }); T += dw;
    const rt = runT(b.s - a.s); R.legs.push({ kind: 'run', t0: T, t1: T + rt, a, b }); T += rt; }
  R.cycle = T;
  // ---- the train ----
  R.cars = buildTrain(scene);
  // ---- el structure + Neptune Av station beyond the play area ----
  buildEl(world, P);
  buildNeptune(world, P, sNep);
  // ---- boarding / alighting ----
  R.doorPos = new THREE.Vector3(0, -999, 0);
  K.spot({ pos: R.doorPos, r: 2.4, dy: 3, when: () => !R.aboard && !!R.boardable, prompt: () => `F — BOARD THE F  ·  next: ${R.boardable?.next?.name || ''}`, act: () => board() });
  world.updaters.push((dt) => update(dt));
  addEventListener('keydown', (e) => { if (R?.aboard && R.canAlight && e.code === 'KeyF' && !e.repeat && R.ctx.state === 'playing') { e.preventDefault(); e.stopImmediatePropagation(); alight(); } }, true);   // F at a stop: off (before the weapon's inspect grabs F)
  ctx.bus.on('playerDied', () => { if (R.aboard) alight(true); });
  ctx.bus.on('worldReset', () => { if (R.aboard) alight(true); });
  (W.mapPOIs || (W.mapPOIs = [])).push({ name: 'NEPTUNE AV STATION', x: P[P.length - 1].x, z: NEP_Z, kind: 'transit' });
  if (typeof window !== 'undefined' && window.__game) window.__game.subway = {
    state: () => ({ aboard: !!R.aboard, leg: legNow().kind, stop: legNow().stop?.id || null, head: +headS().toFixed(1), cycle: +R.cycle.toFixed(1), L: +R.L.toFixed(1), door: R.boardable ? R.doorPos.toArray().map((v) => +v.toFixed(2)) : null, pos: R.ctx.player.position.toArray().map((v) => +v.toFixed(2)) }),
    stops: () => R.stops.map((q) => ({ id: q.id, s: +q.s.toFixed(1), at: ptAt(q.s - LEN / 2).toArray().map((v) => +v.toFixed(1)) })),
    until: (id) => { const t = now() % R.cycle; const l = R.legs.find((g) => g.kind === 'dwell' && g.stop.id === id); return l ? ((l.t0 - t) % R.cycle + R.cycle) % R.cycle : null; },
    debug: () => ({ side: R.stops.map((q) => q.sideCache || null), cars: R.cars.map((g) => g.position.toArray().map((v) => +v.toFixed(1))), open: R.lastOpen }),
    board: () => board(), alight: () => alight(), skew: (sec) => { R.skew = (R.skew || 0) + sec; },
  };
  console.log('[subway] F route', Math.round(R.L), 'm ·', stops.map((q) => `${q.id}@${Math.round(q.s)}`).join(' '), '· cycle', Math.round(R.cycle), 's');
}

// ---------------------------------------------------------------------------------------------------------------------------
function routePath() {
  // graph of every elevated OSM rail vertex; endpoints within 4 m are joined; Dijkstra from the Stillwell F track to Neptune Av
  const V = [], E = new Map(); const key = (x, z) => `${Math.round(x * 2)}/${Math.round(z * 2)}`, idx = new Map();
  const node = (x, z) => { let k = key(x, z); if (idx.has(k)) return idx.get(k); for (let i = 0; i < V.length; i++) if (Math.hypot(V[i][0] - x, V[i][1] - z) < 4) { idx.set(k, i); return i; } V.push([x, z]); idx.set(k, V.length - 1); return V.length - 1; };
  const link = (a, b) => { const d = Math.hypot(V[a][0] - V[b][0], V[a][1] - V[b][1]); (E.get(a) || E.set(a, []).get(a)).push([b, d]); (E.get(b) || E.set(b, []).get(b)).push([a, d]); };
  for (const l of OSM.rl) { if (!l.el || l.p.length < 2) continue; let prev = null; for (const [x, z] of l.p) { const n = node(x, z); if (prev !== null && prev !== n) link(prev, n); prev = n; } }
  const near = (x, z, f = () => true) => { let b = -1, bd = 1e9; V.forEach((v, i) => { if (!f(v)) return; const d = Math.hypot(v[0] - x, v[1] - z); if (d < bd) { bd = d; b = i; } }); return b; };
  const src = near(STW_X, -258), dst = near(520, NEP_Z - 40, (v) => v[0] > 440 && v[1] < NEP_Z + 60);
  if (src < 0 || dst < 0) return null;
  const dist = new Array(V.length).fill(Infinity), prev = new Array(V.length).fill(-1); dist[src] = 0; const Q = new Set([src]);
  while (Q.size) { let u = -1, ud = Infinity; for (const q of Q) if (dist[q] < ud) { ud = dist[q]; u = q; } Q.delete(u); if (u === dst) break;
    for (const [v, w] of E.get(u) || []) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; Q.add(v); } }
  if (!isFinite(dist[dst])) return null;
  const out = []; for (let u = dst; u >= 0; u = prev[u]) out.unshift(new THREE.Vector3(V[u][0], RAIL, V[u][1]));
  const pre = []; for (let z = STW_Z0; z < out[0].z - 1; z += 6) pre.push(new THREE.Vector3(STW_X, RAIL, z));   // the platform track itself
  // run on past Neptune Av a little (the train's tail must clear the station) — extend along the last direction
  const a = out[out.length - 2], b = out[out.length - 1], d = b.clone().sub(a).setY(0).normalize(); out.push(b.clone().addScaledVector(d, 40));
  return [...pre, ...out];
}
function resample(pts, step) {   // even spacing ON the rail polyline (no smoothing — the train stays locked to the track)
  const out = [pts[0].clone()];
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; const L = Math.hypot(b.x - a.x, b.z - a.z); const n = Math.max(1, Math.round(L / step)); for (let k = 1; k <= n; k++) out.push(a.clone().lerp(b, k / n)); }
  return out;
}
const _p = new THREE.Vector3();
function ptAt(s, out = new THREE.Vector3()) {
  const P = R.P; s = Math.max(0, Math.min(R.L, s)); let lo = 0, hi = P.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m].s <= s) lo = m; else hi = m; }
  const a = P[lo], b = P[hi], k = (s - a.s) / Math.max(1e-6, b.s - a.s); return out.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
}
const now = () => Date.now() / 1000 + (R?.skew || 0);
function legNow() { const t = now() % R.cycle; return R.legs.find((l) => t >= l.t0 && t < l.t1) || R.legs[0]; }
function headS() {
  const l = legNow(), t = now() % R.cycle;
  if (l.kind === 'dwell') return l.stop.s;
  const D = l.b.s - l.a.s, d = Math.abs(D), T = l.t1 - l.t0, u = t - l.t0; const dA = VMAX * VMAX / ACC;
  let x; if (d >= dA) { const ta = VMAX / ACC; x = u < ta ? 0.5 * ACC * u * u : u > T - ta ? d - 0.5 * ACC * (T - u) ** 2 : 0.5 * ACC * ta * ta + VMAX * (u - ta); }
  else { const h = T / 2; x = u < h ? 0.5 * ACC * u * u : d - 0.5 * ACC * (T - u) ** 2; }
  return l.a.s + Math.sign(D) * x;
}

// ---------------------------------------------------------------------------------------------------------------------------
// an R160-ish car: stainless shell with see-through window band, a door leaf per door (slides at stops), grey floor, orange/yellow
// bucket seats down both sides, poles, light strips — the interior shows when you're riding
function buildTrain(scene) {
  const S = (c, r = 0.5, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const alu = S(0xc9cdd1, 0.32, 0.85), glass = new THREE.MeshStandardMaterial({ color: 0xbfd6e0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const inside = S(0xe4e1d8, 0.6), floor = S(0x6f6d68, 0.9), seatA = S(0xe38a1c, 0.5), seatB = S(0xe0c021, 0.5), pole = S(0xd9dde0, 0.2, 0.9), lamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f7ff, emissiveIntensity: 1.4 });
  const doorM = S(0x9aa0a6, 0.35, 0.8), bull = new THREE.MeshStandardMaterial({ map: bulletTex(), emissive: 0xffffff, emissiveMap: bulletTex(), emissiveIntensity: 0.6 });
  const W = 3.0, H = 3.3, L = CAR - 0.4, DOORS = [-6.2, -2.1, 2.1, 6.2];
  const cars = [];
  for (let c = 0; c < NCAR; c++) {
    const g = new THREE.Group(); g.name = 'fTrainCar'; scene.add(g);
    const add = (geo, m, x, y, z, noShadow) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = !noShadow; me.receiveShadow = true; g.add(me); return me; };
    add(new THREE.BoxGeometry(W, 0.12, L), floor, 0, FLOOR, 0);
    add(new THREE.BoxGeometry(W, 0.1, L), alu, 0, FLOOR + H - 0.05, 0);                                   // roof
    add(new THREE.BoxGeometry(W - 0.2, 0.02, L - 0.3), inside, 0, FLOOR + H - 0.14, 0, true);              // ceiling
    for (const zz of [-L / 2, L / 2]) add(new THREE.BoxGeometry(W, H, 0.08), alu, 0, FLOOR + H / 2, zz);    // end walls
    add(new THREE.BoxGeometry(W + 0.02, 1.1, L), alu, 0, FLOOR - 0.5, 0);                                  // underframe
    for (const sx of [-1, 1]) {
      // wall bands between the doors: lower panel, glass band, upper panel
      const seg = [[-L / 2, DOORS[0] - 0.65], [DOORS[0] + 0.65, DOORS[1] - 0.65], [DOORS[1] + 0.65, DOORS[2] - 0.65], [DOORS[2] + 0.65, DOORS[3] - 0.65], [DOORS[3] + 0.65, L / 2]];
      for (const [z0, z1] of seg) { const l = z1 - z0, zc = (z0 + z1) / 2;
        add(new THREE.BoxGeometry(0.06, 1.0, l), alu, sx * W / 2, FLOOR + 0.5, zc); add(new THREE.BoxGeometry(0.02, 1.0, l), glass, sx * W / 2, FLOOR + 1.5, zc, true); add(new THREE.BoxGeometry(0.06, H - 2.0, l), alu, sx * W / 2, FLOOR + 2.0 + (H - 2.0) / 2, zc);
        add(new THREE.BoxGeometry(0.45, 0.42, l - 0.3), zc % 2 > 0 ? seatA : seatB, sx * (W / 2 - 0.32), FLOOR + 0.42, zc, true); }   // bench of bucket seats
      for (const dz of DOORS) { const leaf = add(new THREE.BoxGeometry(0.05, 2.0, 0.64), doorM, sx * W / 2, FLOOR + 1.0, dz - 0.32); const leaf2 = add(new THREE.BoxGeometry(0.05, 2.0, 0.64), doorM, sx * W / 2, FLOOR + 1.0, dz + 0.32);
        leaf.userData.door = { sx, z: dz - 0.32, dir: -1 }; leaf2.userData.door = { sx, z: dz + 0.32, dir: 1 };
        add(new THREE.BoxGeometry(0.06, H - 2.0, 1.3), alu, sx * W / 2, FLOOR + 2.0 + (H - 2.0) / 2, dz); }
      add(new THREE.PlaneGeometry(0.7, 0.7), bull, sx * (W / 2 + 0.04), FLOOR + 2.55, L / 2 - 1.2, true).rotation.y = sx * Math.PI / 2;   // the orange F bullet
    }
    for (const dz of DOORS) add(new THREE.CylinderGeometry(0.03, 0.03, H - 0.2, 8), pole, 0, FLOOR + H / 2, dz, true);
    add(new THREE.BoxGeometry(0.25, 0.04, L - 1), lamp, -0.7, FLOOR + H - 0.17, 0, true); add(new THREE.BoxGeometry(0.25, 0.04, L - 1), lamp, 0.7, FLOOR + H - 0.17, 0, true);
    // trucks: frame + two wheelsets each, at the bogie centres (±(CAR/2 − 2.6)); they're what sits on the rails
    const truckM = S(0x2a2b2d, 0.7, 0.5), wheelM = S(0x5b5d60, 0.4, 0.9);
    for (const tz of [-(CAR / 2 - 2.6), CAR / 2 - 2.6]) { add(new THREE.BoxGeometry(2.3, 0.45, 2.9), truckM, 0, 0.55, tz);
      for (const wz of [-1.05, 1.05]) for (const wx of [-0.75, 0.75]) { const w = add(new THREE.CylinderGeometry(0.43, 0.43, 0.16, 16), wheelM, wx, 0.43, tz + wz); w.rotation.z = Math.PI / 2; } }
    // cab ends on the first and last car: windshield, headlights, marker lights, route sign
    if (c === 0 || c === NCAR - 1) { const e = (c === 0 ? 1 : -1) * (L / 2 + 0.05);
      add(new THREE.BoxGeometry(2.1, 0.9, 0.04), new THREE.MeshStandardMaterial({ color: 0x0c1014, roughness: 0.05, metalness: 0.6 }), 0, FLOOR + 1.75, e, true);
      const hl = new THREE.MeshStandardMaterial({ color: 0xfffbe8, emissive: 0xfff4d0, emissiveIntensity: 0 }); g.userData.head = hl;
      for (const sx of [-1, 1]) { add(new THREE.CircleGeometry(0.12, 12), hl, sx * 0.95, FLOOR + 0.55, e + Math.sign(e) * 0.03, true).rotation.y = e > 0 ? 0 : Math.PI;
        add(new THREE.CircleGeometry(0.06, 10), new THREE.MeshStandardMaterial({ color: 0x44ff66, emissive: 0x33ff55, emissiveIntensity: 1.2 }), sx * 1.2, FLOOR + 2.95, e + Math.sign(e) * 0.03, true).rotation.y = e > 0 ? 0 : Math.PI; }
      const sgn = add(new THREE.PlaneGeometry(1.5, 0.32), new THREE.MeshStandardMaterial({ map: destTex(), emissive: 0xffffff, emissiveMap: destTex(), emissiveIntensity: 0.9 }), 0.2, FLOOR + 2.5, e + Math.sign(e) * 0.03, true); sgn.rotation.y = e > 0 ? 0 : Math.PI; }
    g.userData.doors = []; g.traverse((o) => { if (o.userData.door) g.userData.doors.push(o); });
    cars.push(g);
  }
  return cars;
}
function destTex() {
  if (destTex.t) return destTex.t; const c = document.createElement('canvas'); c.width = 320; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#050505'; g.fillRect(0, 0, 320, 64);
  g.fillStyle = '#ff6319'; g.beginPath(); g.arc(32, 32, 24, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = '700 30px Helvetica, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('F', 32, 34);
  g.fillStyle = '#ffb347'; g.textAlign = 'left'; g.font = '600 22px Helvetica, Arial'; g.fillText('JAMAICA–179 ST', 66, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (destTex.t = t);
}
function bulletTex() {
  if (bulletTex.t) return bulletTex.t; const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#ff6319'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = '700 84px Helvetica, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('F', 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (bulletTex.t = t);
}

// ---------------------------------------------------------------------------------------------------------------------------
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
function update(dt) {
  if (!R?.P) return; const { ctx } = R;
  const h = headS(), l = legNow(), t = now() % R.cycle;
  const ds = R.lastH == null ? 0 : h - R.lastH; R.lastH = h; const speed = Math.abs(ds) / Math.max(1e-3, dt), moving = l.kind === 'run' ? Math.sign(l.b.s - l.a.s) : 0;
  const curve = (() => { ptAt(h - 30, _a); ptAt(h - 10, _b); const a1 = Math.atan2(_b.x - _a.x, _b.z - _a.z); ptAt(h + 10, _a); const a2 = Math.atan2(_a.x - _b.x, _a.z - _b.z); let d = a2 - a1; d = Math.atan2(Math.sin(d), Math.cos(d)); return d; })();
  trackSound(speed, Math.abs(curve));
  // doors: open 2 s into a dwell, close (chime) 4 s before it ends
  const open = l.kind === 'dwell' ? Math.max(0, Math.min(1, (t - l.t0 - 1.5) / 1.2, (l.t1 - 3 - t) / 1.2)) : 0;
  const dwellSide = l.kind === 'dwell' ? sideAt(l.stop) : 0; R.lastOpen = [+open.toFixed(2), dwellSide];
  R.cars.forEach((g, c) => {
    const sm = h - (c + 0.5) * CAR; ptAt(sm + CAR / 2 - 2.6, _a); ptAt(sm - CAR / 2 + 2.6, _b);   // the two trucks sit on the rails; the body hangs between them
    g.position.copy(_a).add(_b).multiplyScalar(0.5); const dx = _a.x - _b.x, dz = _a.z - _b.z, dy = _a.y - _b.y;
    g.rotation.set(0, Math.atan2(dx, dz), 0); g.rotateX(-Math.atan2(dy, Math.hypot(dx, dz)));
    const sway = Math.sin(now() * 2.1 + c * 1.7) * 0.004 * Math.min(1, speed / 6) + curve * 0.01; g.rotateZ(sway);   // a little roll: more at speed, leaning out on the curves
    if (g.userData.head) g.userData.head.emissiveIntensity = (c === 0 ? moving > 0 : moving < 0) ? 2.2 : 0.15;
    for (const d of g.userData.doors) d.position.z = d.userData.z + (d.userData.sx === dwellSide || dwellSide === 2 ? d.userData.dir * 0.62 * open : 0);
  });
  // announcements
  const annKey = l.kind + (l.stop?.id || l.a?.id) + (l.b?.id || l.next?.id || '') + Math.floor(t / R.cycle);
  if (R.aboard && annKey !== R.lastAnn) { R.lastAnn = annKey; announce(l); }
  // boarding: the train is at a platform with its doors open and you're on that platform near a door
  R.boardable = null;
  if (l.kind === 'dwell' && open > 0.8 && !R.aboard) {
    const me = ctx.player.position; let best = null, bd = 2.6;
    R.cars.forEach((g, c) => { for (const dz of [-6.2, -2.1, 2.1, 6.2]) for (const sx of dwellSide === 2 ? [-1, 1] : [dwellSide]) { _a.set(sx * 2.2, FLOOR, dz).applyMatrix4(g.matrixWorld); const d = Math.hypot(_a.x - me.x, _a.z - me.z); if (d < bd && Math.abs(_a.y - me.y) < 2.5) { bd = d; best = { c, dz, sx }; R.doorPos.copy(_a); } } });
    if (best) { R.boardable = { ...best, next: l.next }; }
  }
  // riding: stand inside by your door; free look; F at a stop gets you off
  if (R.aboard) {
    const g = R.cars[R.aboard.c]; g.updateMatrixWorld(true);
    const p = ctx.player; _a.set(R.aboard.sx * 0.75, FLOOR, R.aboard.dz).applyMatrix4(g.matrixWorld);
    p.position.set(_a.x, _a.y, _a.z); p.velocity?.set?.(0, 0, 0);
    const cam = ctx.camera; cam.position.set(_a.x, _a.y + 1.62, _a.z); cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ'); p.cameraPosition?.copy?.(cam.position);
    R.canAlight = l.kind === 'dwell' && open > 0.8;
    if (l.kind === 'dwell' && open > 0.8 && !R.hintOff) { R.hintOff = true; K.toast(`F — GET OFF at ${l.stop.name}`, 2600); }
    if (l.kind !== 'dwell') R.hintOff = false;
  }
}
/** which side the platform is on at a stop (+1 = the car's right / −1 left, 2 = both) — measured, not assumed */
function sideAt(stop) {
  if (stop.id === 'NEP') return 2;
  if (stop.sideCache) return stop.sideCache;
  const g = R.cars[2]; g.updateMatrixWorld(true);
  const probe = (sx) => { _a.set(sx * 2.4, FLOOR + 0.5, 0).applyMatrix4(g.matrixWorld); const ray = new THREE.Raycaster(new THREE.Vector3(_a.x, _a.y + 1, _a.z), new THREE.Vector3(0, -1, 0), 0, 3); return ray.intersectObjects(R.ctx.raycastTargets.filter((o) => o.isMesh), false).length; };
  const side = probe(1) >= probe(-1) ? 1 : -1; stop.sideCache = side; return side;
}
function board() {
  const b = R.boardable; if (!b) return; R.aboard = { c: b.c, dz: b.dz, sx: b.sx };
  R.ctx.player.mounted = { train: true }; R.lastAnn = '';
  K.toast('Stand clear of the closing doors, please.', 2400);
}
function alight(force = false) {
  const a = R.aboard; if (!a) return; R.aboard = null; const p = R.ctx.player; if (p.mounted?.train) p.mounted = null;
  if (force) return;
  const g = R.cars[a.c]; g.updateMatrixWorld(true); _a.set(a.sx * 2.7, FLOOR, a.dz).applyMatrix4(g.matrixWorld);
  p.teleport?.(_a.x, _a.y + 0.02, _a.z, p.yaw, p.pitch);
}
function announce(l) {
  const n = (id) => R.stops.find((q) => q.id === id)?.name;
  if (l.kind === 'dwell') {
    const s = l.stop, nx = l.next; chime();
    const bound = nx.s > s.s ? 'Jamaica–179th Street–bound F local' : 'Coney Island–bound F';
    K.toast(s.id === 'STW' ? `This is Coney Island–Stillwell Avenue. This is a ${bound} train. The next stop is ${n('W8')}.` : `This is ${s.name}. ${s.id === 'W8' ? 'Transfer is available to the Q train. ' : ''}This is a ${bound} train. The next stop is ${nx.name}.`, 5200);
  } else { K.toast(`The next stop is ${l.b.name}.`, 3000); }
}
/** aboard: steel-wheel rumble (filtered noise, louder with speed) + flange squeal when curving at speed */
function trackSound(speed, curve) {
  if (!R.aboard) { if (R.snd) R.snd.g.gain.value = R.snd.q.gain.value = 0; return; }
  try {
    if (!R.snd) { const ac = R.ac || (R.ac = new (window.AudioContext || window.webkitAudioContext)()); const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0); let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; const g = ac.createGain(); g.gain.value = 0; src.connect(lp).connect(g).connect(ac.destination); src.start();
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 2900; const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3100; bp.Q.value = 18; const q = ac.createGain(); q.gain.value = 0; o.connect(bp).connect(q).connect(ac.destination); o.start();
      R.snd = { g, q, o, lp }; }
    const k = Math.min(1, speed / VMAX); R.snd.g.gain.value = 0.05 + k * 0.32; R.snd.lp.frequency.value = 220 + k * 520;
    R.snd.q.gain.value = curve > 0.05 && speed > 5 ? Math.min(0.05, (curve - 0.05) * 0.4) * k : 0; R.snd.o.frequency.value = 2800 + Math.sin(now() * 13) * 120;
  } catch {}
}
function chime() {   // the R160 "ding-dong" (two falling sine tones)
  try { const ac = R.ac || (R.ac = new (window.AudioContext || window.webkitAudioContext)()); const t = ac.currentTime;
    for (const [f, d] of [[1046.5, 0], [830.6, 0.32]]) { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; o.type = 'sine'; g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.18, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.7); o.connect(g).connect(ac.destination); o.start(t + d); o.stop(t + d + 0.75); } } catch {}
}

// ---------------------------------------------------------------------------------------------------------------------------
// el structure where coney/city.js doesn't build one (east of the play area): bents every 12 m, girders, ties
function buildEl(world, P) {
  const { scene } = world; const green = new THREE.MeshStandardMaterial({ color: 0x3f5a47, roughness: 0.7, metalness: 0.35 }), ties = new THREE.MeshStandardMaterial({ color: 0x4a3b2e, roughness: 0.95 });
  const gs = [], ts = [];
  const skip = (p) => p.x < 300 || (Math.abs(p.x - 365) < 110 && p.z > -175 && p.z < -90);   // city.js covers the west; W 8 St builds its own
  for (let i = 0; i < P.length - 1; i += 6) {
    const a = P[i], b = P[Math.min(P.length - 1, i + 6)]; if (skip(a)) continue;
    const ang = Math.atan2(b.x - a.x, b.z - a.z), L = Math.hypot(b.x - a.x, b.z - a.z);
    for (const o of [-2.4, 2.4]) { const gd = new THREE.BoxGeometry(0.5, 0.9, L); gd.rotateY(ang); gd.translate((a.x + b.x) / 2 + Math.cos(ang) * o, a.y - 0.8, (a.z + b.z) / 2 - Math.sin(ang) * o); gs.push(gd); }
    const td = new THREE.BoxGeometry(5.6, 0.25, L); td.rotateY(ang); td.translate((a.x + b.x) / 2, a.y - 0.2, (a.z + b.z) / 2); ts.push(td);
    if ((i / 6) % 2 === 0) for (const o of [-3.2, 3.2]) { const c = new THREE.BoxGeometry(0.6, a.y - 1.2, 0.6); c.translate(a.x + Math.cos(ang) * o, (a.y - 1.2) / 2, a.z - Math.sin(ang) * o); gs.push(c); }
  }
  const merge = (list, m) => { if (!list.length) return; const g = mergeAll(list); const me = new THREE.Mesh(g, m); me.castShadow = true; me.receiveShadow = true; scene.add(me); };
  merge(gs, green); merge(ts, ties);
}
function mergeAll(list) {   // tiny merge (positions + normals) so we don't need the addon here
  let n = 0; for (const g of list) n += (g.index ? g.index.count : g.attributes.position.count);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); return out;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Neptune Av: elevated, side platforms either side of the F, canopies, name signs, a staircase down each side to Shell Rd,
// Shell Rd under the el and Neptune Ave crossing it, a block of shops / walk-ups on each side
function buildNeptune(world, P, sNep) {
  const { scene, ctx, W } = world;
  const cS = sNep - 10, c0 = ptAt(cS), c1 = ptAt(cS + 20); const u = new THREE.Vector2(c1.x - c0.x, c1.z - c0.z).normalize(), n = new THREE.Vector2(-u.y, u.x);
  const y = c0.y, plat = y + FLOOR, PL = 130, O0 = 1.7, O1 = 5.4;
  const at = (a, o, yy) => new THREE.Vector3(c0.x + u.x * a + n.x * o, yy, c0.z + u.y * a + n.y * o), ang = Math.atan2(u.x, u.y);
  (W.zones || (W.zones = [])).push({ x0: Math.min(c0.x, c1.x) - 160, x1: Math.max(c0.x, c1.x) + 160, z0: c0.z - 180, z1: c0.z + 400, name: 'NEPTUNE AV · SHELL RD', hint: 'the F back to Coney' });
  const S = (c, r = 0.8, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const conc = S(0xa9a59c, 0.9), edge = S(0xf2c418, 0.7), steel = S(0x3f5a47, 0.6, 0.4), roofM = S(0x5b6168, 0.5, 0.6), asph = S(0x39393b, 0.95), walk = S(0x9d998f, 0.9);
  // a rotated box: a mesh + collider cells (0.5 m) so the rotated floors stay walkable and the gaps stay open
  const rbox = (m, a0, a1, o0, o1, y0, y1, { collide = true, walkable = false } = {}) => {
    const g = new THREE.BoxGeometry(o1 - o0, y1 - y0, a1 - a0); const me = new THREE.Mesh(g, m); me.position.copy(at((a0 + a1) / 2, (o0 + o1) / 2, (y0 + y1) / 2)); me.rotation.y = ang; me.castShadow = true; me.receiveShadow = true; scene.add(me);
    if (!collide) return me;
    const cell = 0.6, na = Math.max(1, Math.ceil((a1 - a0) / cell)), no = Math.max(1, Math.ceil((o1 - o0) / cell));
    for (let i = 0; i < na; i++) for (let j = 0; j < no; j++) { const pa = at(a0 + (i + 0.5) * (a1 - a0) / na, o0 + (j + 0.5) * (o1 - o0) / no, 0), h = 0.36; const mn = [pa.x - h, y0, pa.z - h], mx = [pa.x + h, y1, pa.z + h]; walkable ? world.walkable(mn, mx) : world.box(mn, mx); }
    return me;
  };
  for (const s of [-1, 1]) {
    const o0 = s > 0 ? O0 : -O1, o1 = s > 0 ? O1 : -O0;
    rbox(conc, -PL / 2, PL / 2, o0, o1, plat - 0.35, plat, { walkable: true });
    rbox(edge, -PL / 2, PL / 2, s > 0 ? O0 : -O0 - 0.5, s > 0 ? O0 + 0.5 : -O0, plat, plat + 0.01, { collide: false });
    rbox(steel, -PL / 2, PL / 2, s > 0 ? O1 - 0.1 : -O1, s > 0 ? O1 : -O1 + 0.1, plat, plat + 1.1);                        // back railing
    for (let a = -PL / 2 + 8; a < PL / 2; a += 16) rbox(steel, a - 0.12, a + 0.12, s * (O1 - 0.6) - 0.12, s * (O1 - 0.6) + 0.12, plat, plat + 3.2, { collide: false });   // canopy posts
    rbox(roofM, -PL / 2 + 10, PL / 2 - 10, s > 0 ? O0 + 0.4 : -O1 - 0.3, s > 0 ? O1 + 0.3 : -O0 - 0.4, plat + 3.2, plat + 3.35, { collide: false });
    // name signs + F bullets
    for (const a of [-40, 0, 40]) { const sg = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.55), new THREE.MeshStandardMaterial({ map: nameTex('Neptune Av'), emissive: 0xffffff, emissiveMap: nameTex('Neptune Av'), emissiveIntensity: 0.25 })); sg.position.copy(at(a, s * (O1 - 0.62), plat + 2.5)); sg.rotation.y = ang + (s > 0 ? -Math.PI / 2 : Math.PI / 2); scene.add(sg); }
    // stairs down to the street at the south end of each platform (going away from the track, then down along the el)
    const aS = -PL / 2 + 6, oS = s * (O1 + 1.2), nSt = Math.ceil(plat / 0.19), rise = plat / nSt, tread = 0.29;
    rbox(conc, aS - 1, aS + 1.6, s > 0 ? O1 - 0.2 : oS - 1.2, s > 0 ? oS + 1.2 : -O1 + 0.2, plat - 0.35, plat, { walkable: true });   // landing off the platform
    for (let k = 0; k < nSt; k++) { const a0 = aS - 1 - (k + 1) * tread; rbox(conc, a0, a0 + tread, oS - 1.1, oS + 1.1, 0, plat - (k + 1) * rise, { walkable: true }); }
    rbox(steel, aS - 1 - nSt * tread, aS - 1, oS + s * 1.15 - 0.05, oS + s * 1.15 + 0.05, 0, plat + 1.0, { collide: true });   // outer railing
  }
  // street: Shell Rd under the el, Neptune Ave across, sidewalks, a row of storefronts / walk-ups each side
  const plane = (m, a0, a1, o0, o1, yy) => { const g = new THREE.PlaneGeometry(o1 - o0, a1 - a0); g.rotateX(-Math.PI / 2); const me = new THREE.Mesh(g, m); me.position.copy(at((a0 + a1) / 2, (o0 + o1) / 2, yy)); me.rotation.y = ang; me.receiveShadow = true; scene.add(me); };
  plane(asph, -260, 260, -10, 10, 0.03); plane(walk, -260, 260, -14, -10, 0.05); plane(walk, -260, 260, 10, 14, 0.05);
  { const g = new THREE.PlaneGeometry(260, 18); g.rotateX(-Math.PI / 2); const me = new THREE.Mesh(g, asph); me.position.set(c0.x, 0.035, NEP_Z); me.receiveShadow = true; scene.add(me); }   // Neptune Ave (E–W)
  const fac = facadeTex();
  for (const s of [-1, 1]) for (let a = -200; a < 220; a += 13 + ((a * 7) % 5)) { if (Math.abs(at(a, 0, 0).z - NEP_Z) < 16) continue; const h = 7 + ((a * 13) % 7); rbox(new THREE.MeshStandardMaterial({ map: fac, color: [0xb88a70, 0xd8c7a6, 0x9c5a44, 0xc9c1b0][((a / 13) | 0) & 3], roughness: 0.9 }), a, a + 12, s * 15, s * 27, 0, h); }
  // arrival: coming up the stairs at street level shows the POI; a subtle lamp at each stair foot
  R.nep = { at, plat, O0, O1 };
}
function nameTex(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 68; const g = c.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, 512, 68); g.fillStyle = '#fff'; g.fillRect(0, 5, 512, 3);
  g.fillStyle = '#ff6319'; g.beginPath(); g.arc(40, 38, 22, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = '700 30px Helvetica, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('F', 40, 40);
  g.textAlign = 'left'; g.font = '700 34px Helvetica, Arial'; g.fillText(text, 78, 40);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function facadeTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#3a4048'; for (let x = 10; x < 120; x += 30) g.fillRect(x, 14, 18, 26), g.fillRect(x, 58, 18, 26); g.fillStyle = '#2a2f36'; g.fillRect(0, 100, 128, 28); g.fillStyle = '#e8d8a0'; g.fillRect(8, 104, 112, 6);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
void _p; void _m; void _q; void _up;
