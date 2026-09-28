// CONEY — ride the F. One six-car R160 F train shuttles on the wall clock (every client sees the same train) along the real
// OSM alignment: Coney Island–Stillwell Av (track 3, the F) → out of the terminal's south throat, east along the el →
// W 8 St–NY Aquarium (upper level, where the F stops) → north up the Culver el over Shell Rd → Neptune Av, and back.
// Doors open at every stop: F (touch: BOARD F) or just walk in through an open door; F / GET OFF or walk out at a stop to get
// off. Aboard you walk the car's aisle (it carries you and turns you on the curves); the chime and the stop announcements are
// the real ones. Signposting: green globe lamps + F bullets at every entrance, an "F ↑" sign over Stillwell's F stairs, a
// next-train HUD in / near the stations, the train on the minimap. Online, riders are sent in car coordinates (net.js). Neptune Av (elevated, side platforms, stairs
// down to Shell Rd & Neptune Ave) is built here, with the el structure from W 8 St up to it. CONEY agent (subway).
import * as THREE from 'three';
import { OSM } from './osm.js';
import { W8 } from './w8th.js';
import { hangkit as K } from '../hangkit.js';
import { makeR160, drawLED, rideAudio, pa } from './r160.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CAR = 18.4, NCAR = 6, LEN = CAR * NCAR, RAIL = 7.5, FLOOR = 1.1;   // car floor = platform height above top of rail
const VMAX = 13, ACC = 1.1, DWELL = { STW: 30, W8: 20, NEP: 30, OCP: 25, B50: 25 };
const STW_X = -54.8, STW_Z0 = -440, STW_ZS = -266;                         // Stillwell track 3 (F): platform north → south end
const NEP_Z = -492;                                                        // Neptune Av: where the Culver el crosses Neptune Ave
// the three lines out of Stillwell, on their real tracks and OSM alignments. Stops past the map edge are `hidden`: the train
// runs on out of sight and comes back; riders are put off at the last stop in the map (the announcements stay right).
const LINES_CFG = [
  { id: 'F', color: '#ff6319', fg: '#fff', stwX: STW_X, dir: 'S', dst: [520, NEP_Z - 40, (v) => v[0] > 440 && v[1] < NEP_Z + 60], w8: 'UP', ext: 40, off: 0,
    dest: { out: 'Jamaica-179 St', in: 'Coney Island|Stillwell Av' }, bound: { out: 'Jamaica–179th Street–bound F local', in: 'Coney Island–bound F' },
    strip: ['Stillwell Av', 'W 8 St', 'Neptune Av', 'Avenue X', 'Avenue U', 'Kings Hwy', 'Avenue P', 'Avenue N', 'Bay Pkwy', 'Avenue I'] },
  { id: 'Q', color: '#fccc0a', fg: '#111', stwX: -40, dir: 'S', dst: [823, -105, (v) => v[0] > 800], w8: 'LO', ext: 520, off: 97, bend: { x: 1035, h: -0.138 },
    dest: { out: '96 St-2 Av', in: 'Coney Island|Stillwell Av' }, bound: { out: '96th Street–bound Q', in: 'Coney Island–bound Q' },
    strip: ['Stillwell Av', 'W 8 St', 'Ocean Pkwy', 'Brighton Bch', 'Sheepshead Bay', 'Neck Rd', 'Avenue U', 'Kings Hwy', 'Avenue M', 'Avenue J'] },
  { id: 'D', color: '#ff6319', fg: '#fff', stwX: -58.2, dir: 'N', dst: [-21, -668, (v) => v[1] < -640], w8: null, ext: 340, off: 41,
    dest: { out: 'Norwood-205 St', in: 'Coney Island|Stillwell Av' }, bound: { out: 'Norwood–205th Street–bound D', in: 'Coney Island–bound D' },
    strip: ['Stillwell Av', 'Bay 50 St', '25 Av', 'Bay Pkwy', '20 Av', '18 Av', '79 St', '71 St', '62 St', 'Ft Hamilton'] },
  // the N: a Sea Beach express straight to 8 Av (Soccer Tavern) — every minute (a short dwell, it turns just past the throat)
  { id: 'N', color: '#fccc0a', fg: '#111', stwX: -43.1, dir: 'N', dst: [-21, -668, (v) => v[1] < -640], w8: null, ext: 60, off: 7, turn: 150, dwell: 16,
    dest: { out: '8 Av|Sunset Park', in: 'Coney Island|Stillwell Av' }, bound: { out: '8th Avenue–bound N express', in: 'Coney Island–bound N' },
    strip: ['Stillwell Av', '8 Av'] },
];
const NAMES = { STW: ['Coney Island–Stillwell Av', 'Coney Island–Stillwell Avenue'], W8: ['W 8 St–NY Aquarium', 'West 8th Street–New York Aquarium'], NEP: ['Neptune Av', 'Neptune Avenue'],
  OCP: ['Ocean Pkwy', 'Ocean Parkway'], N8: ['8 Av', '8th Avenue, Sunset Park'], BRT: ['Brighton Beach', 'Brighton Beach'], B50: ['Bay 50 St', 'Bay 50th Street'], A25: ['25 Av', '25th Avenue'] };
const LINES = [], STN = {}, G = { hudT: 0 }; let MAPR = null, MAPS = null;   // G: the shared HUD / clocks / PA state
let R = null, SKEW = 0;
const W8U = new THREE.Vector2(W8.P1.x - W8.P0.x, W8.P1.y - W8.P0.y).normalize();   // R: the line being updated (every function below works on R)

export function buildSubway(world) {
  const { ctx, W } = world;
  for (const cfg of LINES_CFG) { R = { world, ctx, W, cfg, id: cfg.id, off: cfg.off, li: LINES.length, aboard: null, lastAnn: '', t: 0 }; try { if (buildLine()) LINES.push(R); } catch (e) { console.warn('[subway] line', cfg.id, e); } }
  if (!LINES.length) return; R = LINES[0];
  world.updaters.push((dt) => { for (const L of LINES) { R = L; update(dt); } R = LINES.find((L) => L.aboard) || LINES[0]; const t = now() % R.cycle; hud(t); if ((G.hudT & 7) === 1) stationLife(); });
  addEventListener('keydown', (e) => { const L = LINES.find((q) => q.aboard); if (L && L.canAlight && e.code === 'KeyF' && !e.repeat && ctx.state === 'playing') { e.preventDefault(); e.stopImmediatePropagation(); R = L; alight(); } }, true);   // F at a stop: off (before the weapon's inspect grabs F)
  const offAll = () => { for (const L of LINES) if (L.aboard) { R = L; alight(true); } };
  ctx.bus.on('playerDied', offAll); ctx.bus.on('worldReset', offAll);
  R = LINES[0]; buildEntrances(world);
  // for net.js (riders are sent in car coordinates: line × 10 + car, so a friend on the same train stays inside it) and the map
  const F = LINES[0];
  ctx.subway = {
    local: () => { const L = LINES.find((q) => q.aboard); return L ? [L.li * 10 + L.aboard.c, +L.aboard.lx.toFixed(2), +L.aboard.lz.toFixed(2)] : null; },
    toWorld: (c, lx, lz, out = new THREE.Vector3()) => { const L = LINES[Math.floor(c / 10)], g = L?.cars[c % 10]; if (!g) return null; g.updateMatrixWorld(); return out.set(lx, FLOOR, lz).applyMatrix4(g.matrixWorld); },
    train: () => { const a = F.cars[0].position, b = F.cars[NCAR - 1].position; return [a.x, a.z, b.x, b.z]; },
    routes: () => MAPR || (MAPR = LINES.map((L) => ({ id: L.id, color: L.id === 'D' ? '#c9500f' : L.cfg.color, dash: L.id === 'D', w: L.id === 'Q' ? 3.2 : 2, pts: L.P.filter((p, i) => i % 8 === 0 || i === L.P.length - 1).map((p) => [p.x, p.z]) })).sort((a, b) => b.w - a.w)),
    stations: () => MAPS || (MAPS = [{ id: 'STW', x: -47, z: -330, r: 'DFNQ' }, { id: 'W8', x: w8Pt(W8.L / 2, 0, 0).x, z: w8Pt(W8.L / 2, 0, 0).z, r: 'FQ' }, ...[['NEP', 'F'], ['OCP', 'Q'], ['B50', 'D']].filter(([id]) => STN[id]).map(([id, r]) => ({ id, x: STN[id].c.x, z: STN[id].c.z, r }))].map((q) => ({ ...q, name: NAMES[q.id][0] }))),
    trains: () => LINES.map((L) => { const a = L.cars[0].position, b = L.cars[NCAR - 1].position; return { id: L.id, color: L.cfg.color, seg: [a.x, a.z, b.x, b.z] }; }),
  };
  const api = (L) => { const w = (f) => (...a) => { const pr = R; R = L; try { return f(...a); } finally { R = pr; } };
    return {
      state: w(() => ({ line: L.id, aboard: !!L.aboard, leg: legNow().kind, stop: legNow().stop?.id || null, head: +headS().toFixed(1), cycle: +L.cycle.toFixed(1), L: +L.L.toFixed(1), door: L.boardable ? L.doorPos.toArray().map((v) => +v.toFixed(2)) : null, pos: ctx.player.position.toArray().map((v) => +v.toFixed(2)) })),
      stops: w(() => L.stops.map((q) => ({ id: q.id, s: +q.s.toFixed(1), hidden: !!q.hidden, at: ptAt(q.s - LEN / 2).toArray().map((v) => +v.toFixed(1)) }))),
      until: w((id) => { const t = now() % L.cycle; const l = L.legs.find((g) => g.kind === 'dwell' && g.stop.id === id); return l ? ((l.t0 - t) % L.cycle + L.cycle) % L.cycle : null; }),
      debug: w(() => ({ side: L.stops.map((q) => q.sideCache || null), cars: L.cars.map((g) => g.position.toArray().map((v) => +v.toFixed(1))), open: L.lastOpen })),
      nepStairs: () => STN.NEP?.stairs, board: w(() => board()), alight: w(() => alight()), skew: (sec) => { SKEW += sec; },
    }; };
  if (typeof window !== 'undefined' && window.__game) window.__game.subway = { ...api(F), line: (id) => { const L = LINES.find((q) => q.id === id); return L ? api(L) : null; }, lines: () => LINES.map((q) => q.id) };
}
function buildLine() {
  const { ctx, world, cfg } = R;
  // ---- the route: the line's Stillwell track + the shortest OSM el path to its far end ----
  const path = routePath(cfg);
  if (!path || path.length < 4) { console.warn('[subway] no route', cfg.id); return false; }
  const P = resample(path, 2);
  let s = 0;
  if (cfg.w8) {   // snap onto this line's track through W 8 St (F upper north, Q lower south), ramp the height in / out over 90 m
    const lv = W8[cfg.w8], oT = cfg.w8 === 'UP' ? -W8.halfTrack : W8.halfTrack;
    const w8u = new THREE.Vector2(W8.P1.x - W8.P0.x, W8.P1.y - W8.P0.y).normalize();
    const w8a = (p) => (p.x - W8.P0.x) * w8u.x + (p.z - W8.P0.y) * w8u.y, w8o = (p) => -(p.x - W8.P0.x) * w8u.y + (p.z - W8.P0.y) * w8u.x;
    const inW8 = (p) => { const a = w8a(p); return a > -10 && a < W8.L + 10 && Math.abs(w8o(p)) < 12; };
    for (const p of P) if (inW8(p)) { const a = w8a(p); p.x = W8.P0.x + w8u.x * a + (-w8u.y) * oT; p.z = W8.P0.y + w8u.y * a + w8u.x * oT; }
    P.forEach((p, i) => { if (i) s += Math.hypot(p.x - P[i - 1].x, p.z - P[i - 1].z); p.s = s; });
    const w8idx = P.map((p, i) => (inW8(p) ? i : -1)).filter((i) => i >= 0);
    if (w8idx.length) { R.w8s0 = P[w8idx[0]].s; R.w8s1 = P[w8idx[w8idx.length - 1]].s;
      for (const p of P) { const d = p.s < R.w8s0 ? R.w8s0 - p.s : p.s > R.w8s1 ? p.s - R.w8s1 : 0; const k = Math.max(0, 1 - d / 90); p.y = RAIL + (lv.rail - RAIL) * (k * k * (3 - 2 * k)); } }
  } else P.forEach((p, i) => { if (i) s += Math.hypot(p.x - P[i - 1].x, p.z - P[i - 1].z); p.s = s; });
  R.P = P; R.L = s;
  // stops (s of the train's HEAD = the end with larger s)
  const sAt = (pred) => { for (const p of P) if (pred(p)) return p.s; return null; };
  const st = (id, sv, o = {}) => ({ id, s: sv, name: NAMES[id][0], speak: NAMES[id][1], ...o });
  const sStw = cfg.dir === 'S' ? sAt((p) => p.z > STW_ZS - 2) ?? 180 : sAt((p) => p.z < STW_Z0 + 4) ?? 180;
  const sW8 = R.w8s0 != null ? (R.w8s0 + R.w8s1) / 2 + 6 + LEN / 2 : 0;
  let stops, seq;
  if (cfg.id === 'F') { stops = [st('STW', sStw), st('W8', sW8), st('NEP', (sAt((p) => p.x > 440 && p.z < NEP_Z) ?? s - 20) + LEN / 2 - 10, { both: true })]; seq = [0, 1, 2, 1]; }
  else if (cfg.id === 'Q') { stops = [st('STW', sStw), st('W8', sW8), st('OCP', sAt((p) => p.x > 1005) ?? s - 200, { both: true }), st('BRT', s - 4, { hidden: true })]; seq = [0, 1, 2, 3, 2, 1]; }
  else if (cfg.id === 'N') { stops = [st('STW', sStw), st('N8', Math.min(s - 4, sStw + cfg.turn), { hidden: true })]; seq = [0, 1]; }
  else { stops = [st('STW', sStw), st('B50', sAt((p) => p.z < -735) ?? s - 200, { both: true }), st('A25', s - 4, { hidden: true })]; seq = [0, 1, 2, 1]; }
  R.stops = stops;
  // timetable: dwell at each stop, jerk-limited runs between them (wall clock: every client sees the same trains)
  const runT = (d) => { d = Math.abs(d); const dA = VMAX * VMAX / ACC; return d >= dA ? d / VMAX + VMAX / ACC : 2 * Math.sqrt(d / ACC); };
  R.legs = []; let T = 0;
  for (let i = 0; i < seq.length; i++) { const a = stops[seq[i]], b = stops[seq[(i + 1) % seq.length]]; const dw = a.hidden ? (cfg.dwell ? 2 : 20) : cfg.dwell || DWELL[a.id] || 25;
    R.legs.push({ kind: 'dwell', t0: T, t1: T + dw, stop: a, next: b, dir: b.s > a.s ? 1 : -1 }); T += dw;
    const rt = runT(b.s - a.s); R.legs.push({ kind: 'run', t0: T, t1: T + rt, a, b }); T += rt; }
  R.cycle = T;
  R.cars = buildTrain(world.scene);
  buildEl(world, P);
  if (cfg.id === 'F') buildElStation(world, stops[2].s, { id: 'NEP', name: 'Neptune Av', zone: 'NEPTUNE AV · SHELL RD', hint: 'the F back to Coney', cross: NEP_Z, street: true });
  if (cfg.id === 'Q') buildElStation(world, stops[2].s, { id: 'OCP', name: 'Ocean Pkwy', zone: 'OCEAN PKWY · BRIGHTON BEACH AV', hint: 'the Q back to Coney', street: true });
  if (cfg.id === 'D') buildElStation(world, stops[1].s, { id: 'B50', name: 'Bay 50 St', zone: 'BAY 50 ST', hint: 'the D back to Coney', street: false });
  // ---- boarding ----
  const me = R; R.doorPos = new THREE.Vector3(0, -999, 0);
  K.spot({ pos: R.doorPos, r: 4.6, dy: 3, when: () => !me.aboard && !!me.boardable, prompt: () => `F — BOARD THE ${cfg.id}  ·  next: ${me.boardable?.next?.name || ''}`, act: () => { R = me; board(); } });
  console.log(`[subway] ${cfg.id} route`, Math.round(R.L), 'm ·', stops.map((q) => `${q.id}@${Math.round(q.s)}`).join(' '), '· cycle', Math.round(R.cycle), 's');
  return true;
}

// ---------------------------------------------------------------------------------------------------------------------------
function routePath(cfg) {
  // graph of every elevated OSM rail vertex; endpoints within 4 m are joined; Dijkstra from the line's Stillwell track to its far end
  const V = [], E = new Map(); const key = (x, z) => `${Math.round(x * 2)}/${Math.round(z * 2)}`, idx = new Map();
  const node = (x, z) => { let k = key(x, z); if (idx.has(k)) return idx.get(k); for (let i = 0; i < V.length; i++) if (Math.hypot(V[i][0] - x, V[i][1] - z) < 4) { idx.set(k, i); return i; } V.push([x, z]); idx.set(k, V.length - 1); return V.length - 1; };
  const link = (a, b) => { const d = Math.hypot(V[a][0] - V[b][0], V[a][1] - V[b][1]); (E.get(a) || E.set(a, []).get(a)).push([b, d]); (E.get(b) || E.set(b, []).get(b)).push([a, d]); };
  for (const l of OSM.rl) { if (!l.el || l.p.length < 2) continue; let prev = null; for (const [x, z] of l.p) { const n = node(x, z); if (prev !== null && prev !== n) link(prev, n); prev = n; } }
  const near = (x, z, f = () => true) => { let b = -1, bd = 1e9; V.forEach((v, i) => { if (!f(v)) return; const d = Math.hypot(v[0] - x, v[1] - z); if (d < bd) { bd = d; b = i; } }); return b; };
  const src = cfg.dir === 'S' ? near(cfg.stwX, -258, (v) => Math.abs(v[0] - cfg.stwX) < 2.5 && v[1] > -270) : near(cfg.stwX, -442, (v) => Math.abs(v[0] - cfg.stwX) < 2.5 && v[1] < -430), dst = near(cfg.dst[0], cfg.dst[1], cfg.dst[2]);
  if (src < 0 || dst < 0) return null;
  const dist = new Array(V.length).fill(Infinity), prev = new Array(V.length).fill(-1); dist[src] = 0; const Q = new Set([src]);
  while (Q.size) { let u = -1, ud = Infinity; for (const q of Q) if (dist[q] < ud) { ud = dist[q]; u = q; } Q.delete(u); if (u === dst) break;
    for (const [v, w] of E.get(u) || []) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; Q.add(v); } }
  if (!isFinite(dist[dst])) return null;
  const out = []; for (let u = dst; u >= 0; u = prev[u]) out.unshift(new THREE.Vector3(V[u][0], RAIL, V[u][1]));
  const pre = [];   // the platform track itself, through the terminal
  if (cfg.dir === 'S') for (let z = STW_Z0; z < out[0].z - 1; z += 6) pre.push(new THREE.Vector3(cfg.stwX, RAIL, z));
  else for (let z = STW_ZS + 4; z > out[0].z + 1; z -= 6) pre.push(new THREE.Vector3(cfg.stwX, RAIL, z));
  // run on past the last OSM vertex along the last direction (a tail clearance, or the hidden run to the map edge)
  const a = out[out.length - 2], b = out[out.length - 1], d = b.clone().sub(a).setY(0).normalize();
  if (cfg.bend) {   // follow the avenue: straight on to bend.x, then ease the heading round to bend.h (rad, atan2(dz, dx)) at ≤ 0.1°/m
    let h = Math.atan2(d.z, d.x); const q = b.clone();
    for (let run = 0; run < cfg.ext; run += 10) { if (q.x > cfg.bend.x) h += Math.max(-0.0175, Math.min(0.0175, cfg.bend.h - h)); q.x += Math.cos(h) * 10; q.z += Math.sin(h) * 10; out.push(q.clone()); }
  } else out.push(b.clone().addScaledVector(d, cfg.ext));
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
const now = () => Date.now() / 1000 + SKEW + (R?.off || 0);
function legNow() { const t = now() % R.cycle; return R.legs.find((l) => t >= l.t0 && t < l.t1) || R.legs[0]; }
function headS() {
  const l = legNow(), t = now() % R.cycle;
  if (l.kind === 'dwell') return l.stop.s;
  const D = l.b.s - l.a.s, d = Math.abs(D), T = l.t1 - l.t0, u = t - l.t0; const dA = VMAX * VMAX / ACC;
  // jerk-limited: velocity ramps along a smoothstep (∫ = k³ − k⁴/2), so the train eases into and out of its acceleration and
  // braking like a real one (same run time and distance as the old trapezoid, so the timetable is unchanged)
  const I = (k) => k * k * k - k * k * k * k / 2;
  let x; if (d >= dA) { const ta = VMAX / ACC; x = u < ta ? VMAX * ta * I(u / ta) : u > T - ta ? d - VMAX * ta * I((T - u) / ta) : VMAX * ta / 2 + VMAX * (u - ta); }
  else { const h = T / 2, vp = ACC * h; x = u < h ? vp * h * I(u / h) : d - vp * h * I((T - u) / h); }
  return l.a.s + Math.sign(D) * x;
}

// ---------------------------------------------------------------------------------------------------------------------------
// the R160 cars come from coney/r160.js; here every static piece is baked into one mesh per material and the door leaves into
// sliding groups (side × direction × material)
function buildTrain(scene) {
  const kit = makeR160(scene, { CAR, NCAR, FLOOR, DOORZ, lite: !!R.ctx.lite, route: R.cfg }); R.kit = kit;
  for (const g of kit.cars) {
    g.userData.doors = [];
    { const stat = new Map(), doors = new Map(); g.updateMatrix();
      for (const ch of [...g.children]) { if (!ch.isMesh) continue; ch.updateMatrix(); const geo = (ch.geometry.index ? ch.geometry.toNonIndexed() : ch.geometry.clone()).applyMatrix4(ch.matrix);
        if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
        const key = ch.userData.door ? `${ch.userData.door.sx}|${ch.userData.door.dir}|${ch.material.uuid}` : null; const map = key ? doors : stat, k = key || ch.material.uuid;
        if (!map.has(k)) map.set(k, { m: ch.material, list: [], door: ch.userData.door, shadow: false }); const e = map.get(k); e.list.push(geo); e.shadow ||= ch.castShadow; g.remove(ch); }
      for (const { m, list, shadow } of stat.values()) { const me = new THREE.Mesh(mergeGeometries(list, false), m); me.castShadow = shadow; me.receiveShadow = true; g.add(me); }
      for (const { m, list, door, shadow } of doors.values()) { const me = new THREE.Mesh(mergeGeometries(list, false), m); me.castShadow = shadow; me.userData.door = { sx: door.sx, dir: door.dir, z: 0 }; g.add(me); g.userData.doors.push(me); } }
  }
  return kit.cars;
}
function destTex() {
  if (destTex.t) return destTex.t; const c = document.createElement('canvas'); c.width = 320; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#050505'; g.fillRect(0, 0, 320, 64);
  g.fillStyle = '#ff6319'; g.beginPath(); g.arc(32, 32, 24, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = '700 30px Helvetica, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('F', 32, 34);
  g.fillStyle = '#ffb347'; g.textAlign = 'left'; g.font = '600 22px Helvetica, Arial'; g.fillText('JAMAICA–179 ST', 66, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (destTex.t = t);
}
function bulletAtlas() {   // D F N Q bullets in a row, 128 px each, transparent between
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d'); g.textAlign = 'center'; g.textBaseline = 'middle';
  [['D', '#ff6319', '#fff'], ['F', '#ff6319', '#fff'], ['N', '#fccc0a', '#111'], ['Q', '#fccc0a', '#111']].forEach(([l, bg, fg], i) => { g.fillStyle = bg; g.beginPath(); g.arc(i * 128 + 64, 64, 60, 0, 7); g.fill(); g.fillStyle = fg; g.font = '700 84px Helvetica, Arial'; g.fillText(l, i * 128 + 64, 70); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------------------------------------------------------------------------------------------------------------------
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
function update(dt) {
  if (!R?.P) return; const { ctx } = R;
  const h = headS(), l = legNow(), t = now() % R.cycle;
  const ds = R.lastH == null ? 0 : h - R.lastH; R.lastH = h; const speed = Math.abs(ds) / Math.max(1e-3, dt), moving = l.kind === 'run' ? Math.sign(l.b.s - l.a.s) : 0;
  const curve = (() => { ptAt(h - 30, _a); ptAt(h - 10, _b); const a1 = Math.atan2(_b.x - _a.x, _b.z - _a.z); ptAt(h + 10, _a); const a2 = Math.atan2(_a.x - _b.x, _a.z - _b.z); let d = a2 - a1; d = Math.atan2(Math.sin(d), Math.cos(d)); return d; })();
  trackSound(speed, Math.abs(curve)); R.acc = (R.acc || 0) + ((speed - (R.lastV ?? speed)) / Math.max(1e-3, dt) - (R.acc || 0)) * Math.min(1, dt * 3); R.lastV = speed;
  // doors: open 2 s into a dwell, close (chime) 4 s before it ends
  const open = l.kind === 'dwell' && !l.stop.hidden ? Math.max(0, Math.min(1, (t - l.t0 - 1.5) / 1.2, (l.t1 - 3 - t) / 1.2)) : 0;
  const dwellSide = l.kind === 'dwell' && !l.stop.hidden ? sideAt(l.stop) : 0; R.lastOpen = [+open.toFixed(2), dwellSide];
  const cam = ctx.camera.position, far = ctx.lite ? 320 : 900;
  R.cars.forEach((g, c) => {
    const sm = h - (c + 0.5) * CAR; ptAt(sm + CAR / 2 - 2.6, _a); ptAt(sm - CAR / 2 + 2.6, _b);   // the two trucks sit on the rails; the body hangs between them
    g.position.copy(_a).add(_b).multiplyScalar(0.5); const dx = _a.x - _b.x, dz = _a.z - _b.z, dy = _a.y - _b.y;
    g.rotation.set(0, Math.atan2(dx, dz), 0); g.rotateX(-Math.atan2(dy, Math.hypot(dx, dz)));
    const sway = Math.sin(now() * 2.1 + c * 1.7) * 0.004 * Math.min(1, speed / 6) + Math.sin(now() * 0.9 + c) * 0.0015 * Math.min(1, speed / 6) + curve * 0.01; g.rotateZ(sway);   // a little roll: more at speed, leaning out on the curves
    // rail joints every 11.9 m (39 ft rails): each truck dips as its wheels cross one (visual only; riders feel it through the camera)
    if (speed > 0.5) { const jk = Math.min(1, speed / VMAX), dip = (s) => { const q = ((s % JOINT) + JOINT) % JOINT; return q < 0.45 ? Math.sin(q / 0.45 * Math.PI) : 0; };
      const f = dip(sm + CAR / 2 - 2.6), r = dip(sm - CAR / 2 + 2.6); g.position.y -= (f + r) * 0.006 * jk; g.rotateX((f - r) * 0.0012 * jk); }
    const lead = c === 0 ? moving > 0 || (l.kind === 'dwell' && l.next.s > l.stop.s) : moving < 0 || (l.kind === 'dwell' && l.next.s < l.stop.s);
    if (g.userData.head) { g.userData.head.emissiveIntensity = lead ? 2.4 : 0.1; g.userData.mark.emissive.setHex(lead ? 0xffb030 : 0xff1a10); g.userData.mark.emissiveIntensity = 1.8; }
    g.visible = !!R.aboard || g.position.distanceTo(cam) < far;
    for (const d of g.userData.doors) d.position.z = d.userData.z + (d.userData.sx === dwellSide || dwellSide === 2 ? d.userData.dir * 0.62 * open : 0);
  });
  cabin(dt, l, t, open, speed, curve);
  // announcements
  const annKey = l.kind + (l.stop?.id || l.a?.id) + (l.b?.id || l.next?.id || '') + Math.floor(t / R.cycle);
  if (R.aboard && annKey !== R.lastAnn) { R.lastAnn = annKey; announce(l); }
  // boarding: the train is at a platform with its doors open and you're on that platform near a door
  R.boardable = null; R.open = open; R.side = dwellSide; R.leg = l;
  const playing = ctx.state === 'playing', p = ctx.player;
  if (l.kind === 'dwell' && (!l.next.hidden || R.id === 'N') && open > 0.8 && !R.aboard && !p.dead && !p.mounted) {   // (not onto a train about to run out of the map)
    const me = p.position; let best = null, bd = 4.5;
    R.cars.forEach((g, c) => { for (const dz of DOORZ) for (const sx of dwellSide === 2 ? [-1, 1] : [dwellSide]) { _a.set(sx * 2.2, FLOOR, dz).applyMatrix4(g.matrixWorld); const d = Math.hypot(_a.x - me.x, _a.z - me.z); if (d < bd && Math.abs(_a.y - me.y) < 2.5) { bd = d; best = { c, dz, sx }; R.doorPos.copy(_a); } } });
    if (best) R.boardable = { ...best, next: l.next };
  }
  // the car body is solid to someone on a platform (it has no colliders — it moves): walking into its side pushes you back
  // out, except through an open door on the platform side, which boards you (no F needed)
  if (!R.aboard && !p.dead && !p.mounted && Math.hypot(p.position.x - R.cars[2].position.x, p.position.z - R.cars[2].position.z) < 90) {
    if (Math.hypot(p.position.x - R.cars[2].position.x, p.position.z - R.cars[2].position.z) < 90) for (let c = 0; c < NCAR; c++) { const g = R.cars[c]; _inv.copy(g.matrixWorld).invert(); _b.copy(p.position).applyMatrix4(_inv);
      if (Math.abs(_b.z) > CAR / 2 - 0.1 || Math.abs(_b.y - FLOOR) > 1.0 || Math.abs(_b.x) > 1.85) continue;
      const door = DOORZ.find((dz) => Math.abs(_b.z - dz) < 0.62), sd = Math.sign(_b.x) || 1;
      if (door != null && R.boardable && open > 0.8 && (dwellSide === 2 || sd === dwellSide)) { if (playing) board(sd * 1.25, _b.z, c); break; }
      if (Math.abs(_b.x) < 1.85) { _b.x = sd * 1.85; _b.applyMatrix4(g.matrixWorld); p.position.x = _b.x; p.position.z = _b.z; } }
  }
  // riding: you stand in the car and can walk its aisle (WASD / stick, relative to where you look); the car carries you and
  // turns you with it on the curves. At a stop: F, or walk out through an open door on the platform side, gets you off.
  if (R.aboard && l.kind === 'dwell' && l.next.hidden && open > 0.8 && t > l.t1 - 5.5) { if ((R.id === 'D' || R.id === 'N') && R.W.tavern) { if (R.stayKey !== l.t0) { R.stayKey = l.t0; R.W.tavern.stayOn(); } } else { K.toast(`The ${R.id} runs on to ${l.next.name}, past the edge of the map. Everybody off at ${l.stop.name}.`, 4200); alight(); } }
  if (R.aboard && (R.id === 'D' || R.id === 'N') && R.W.tavern && l.kind === 'run' && l.b.hidden && t - l.t0 > 4) { alight(true); R.W.tavern.arrive(R.id === 'N' ? 'Nx' : 'D'); }
  if (R.aboard) {
    const A = R.aboard, g = R.cars[A.c]; g.updateMatrixWorld(true);
    const head = Math.atan2(g.matrixWorld.elements[8], g.matrixWorld.elements[10]);   // the car's local +z in world
    if (A.head != null) { let d = head - A.head; d = Math.atan2(Math.sin(d), Math.cos(d)); p.yaw += d; } A.head = head;
    R.canAlight = l.kind === 'dwell' && open > 0.8;
    const inp = ctx.input; let ix = 0, iy = 0;
    if (playing && inp) { if (inp.forward) iy += 1; if (inp.back) iy -= 1; if (inp.right) ix += 1; if (inp.left) ix -= 1; }
    const il = Math.hypot(ix, iy);
    if (il > 0) { const sp = (inp.sprint ? 3.4 : 2.2) * Math.min(dt, 0.05) / il;   // walking pace inside a car
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      const wx = (fx * iy + rx * ix) * sp, wz = (fz * iy + rz * ix) * sp, sh = Math.sin(head), ch = Math.cos(head);
      A.lz += wx * sh + wz * ch; A.lx += wx * ch - wz * sh; A.walkT = (A.walkT || 0) + dt; }
    const LZ = (CAR - 0.4) / 2 - 0.45; A.lz = Math.max(-LZ, Math.min(LZ, A.lz));
    const door = DOORZ.find((dz) => Math.abs(A.lz - dz) < 0.6), openHere = R.canAlight && door != null && (dwellSide === 2 || Math.sign(A.lx) === dwellSide);
    if (Math.abs(A.lx) < 1.15) A.inside = true;   // walked in off the doorway: from now on walking back out gets you off
    if (openHere && A.inside && Math.abs(A.lx) > 1.34) { alight(false, door, Math.sign(A.lx)); }   // stepped out onto the platform
    else {
      const wl = door == null ? 0.95 : 1.3 + (openHere && A.inside ? 0.1 : 0); A.lx = Math.max(-wl, Math.min(wl, A.lx));   // the aisle between the benches; the door wells are deeper
      _a.set(A.lx, FLOOR, A.lz).applyMatrix4(g.matrixWorld);
      p.position.set(_a.x, _a.y, _a.z); p.velocity?.set?.(0, 0, 0); p.speed = il > 0 ? 2.2 : 0;
      const cam = ctx.camera, bob = il > 0 ? Math.sin((A.walkT || 0) * 9) * 0.025 : 0; cam.position.set(_a.x, _a.y + 1.62 + bob, _a.z); cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ'); p.cameraPosition?.copy?.(cam.position);
      if (R.canAlight && !R.hintOff) { R.hintOff = true; K.toast(`${ctx.isTouch ? 'GET OFF' : 'F'} — get off at ${l.stop.name} (or walk out the open doors)`, 3200); }
      if (l.kind !== 'dwell') R.hintOff = false;
      if (R.canAlight && playing && inp?.pressed?.has?.('KeyF')) { inp.pressed.delete('KeyF'); alight(); }   // the touch GET OFF button injects F
    }
  }
  // doors closing: the chime + the conductor, for riders and for anyone standing at the open doors
  if (l.kind === 'dwell' && t > l.t1 - 4.6 && t < l.t1 - 4.2 && R.closeKey !== l.t0 && (R.aboard || R.boardable)) { R.closeKey = l.t0; chime(); K.toast('Stand clear of the closing doors, please.', 2400); if (R.aboard) pa(R.ctx, 'Stand clear of the closing doors, please.'); }
  // touch: the contextual action button (touch.js) says what F does here
  const lab = R.aboard && R.canAlight ? 'GET OFF' : null;   // boarding is a hangkit spot: its "F — BOARD THE F" prompt already gets a tap button on phones (netui.js)
  if (lab) { ctx.actionLabel = lab; R.ownLabel = true; } else if (R.ownLabel) { ctx.actionLabel = null; R.ownLabel = false; }
  if (R.aboard || lab || R.boardable) ctx.interactNear = true;   // weapons.js leaves F (the touch button) to us
}
const DOORZ = [-6.2, -2.1, 2.1, 6.2], JOINT = 11.9, _inv = new THREE.Matrix4();
const mss = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
/** the next train out of a stop, per line and direction: [{ line, color, fg, to, dest, arrive (s until the doors open), leave, boarding }] */
function departures(id) {
  const out = new Map(), pr = R;
  for (const L of LINES) { R = L; const t = now() % L.cycle;
    for (const l of L.legs) { if (l.kind !== 'dwell' || l.stop.id !== id || l.next.hidden) continue;
      const fw = l.next.s > l.stop.s, to = fw ? L.stops.filter((q) => !q.hidden).pop().name : NAMES.STW[0], boarding = t >= l.t0 + 1.5 && t < l.t1 - 3;
      const arrive = boarding ? 0 : ((l.t0 + 1.5 - t) % L.cycle + L.cycle) % L.cycle, leave = boarding ? l.t1 - 3 - t : arrive + (l.t1 - l.t0 - 4.5), k = L.id + fw;
      if (!out.has(k) || arrive < out.get(k).arrive) out.set(k, { line: L.id, color: L.cfg.color, fg: L.cfg.fg, to: to.replace('Coney Island–', ''), dest: fw ? L.cfg.dest.out : 'Coney Island', arrive, leave, boarding }); } }
  R = pr; return [...out.values()].sort((a, b) => a.arrive - b.arrive);
}
const STW_ISL = [[-82, -74, null], [-68, -60, 'D'], [-53, -46, 'F'], [-38, -29, 'Q']];
/** which station you're at / walking up to: Stillwell's head house + bus loop + Stillwell Ave frontage, W 8 St with its stair
 *  towers + the Aquarium footbridge, and the el stations built here (Neptune Av, Ocean Pkwy, Bay 50 St) */
function stationAt(p) {
  if (p.x > -125 && p.x < -5 && p.z > -445 && p.z < -200) { const isl = p.y > 7 ? STW_ISL.find(([a, b]) => p.x > a - 0.5 && p.x < b + 0.5) : null; return { id: 'STW', plat: p.y > 7, isl: isl ? isl[2] || '-' : null }; }
  const dx = p.x - W8.P0.x, dz = p.z - W8.P0.y, u = W8U, a = dx * u.x + dz * u.y, o = -dx * u.y + dz * u.x;
  if (a > -25 && a < W8.L + 20 && o > -22 && o < 50) return { id: 'W8', plat: p.y > 13.5, lower: p.y > 7.5 && p.y < 13.5 };
  for (const [id, S] of Object.entries(STN)) if (Math.hypot(p.x - S.c.x, p.z - S.c.z) < 160) return { id, plat: p.y > 7 };
  return null;
}
const bul = (d) => `<b class="f" style="background:${d.color};color:${d.fg}">${d.line}</b>`;
/** the subway HUD: next trains near / in a station (every line that stops there), where to go, and the rider's next stop */
function hud(t) {
  const { ctx } = R; G.hudT++; if (G.hudT % 8) return;
  if (!G.el) { const st = document.createElement('style'); st.textContent = `
    .zvsub{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 94px);transform:translateX(-50%);z-index:38;display:none;pointer-events:none;padding:6px 14px 7px;border-radius:8px;background:rgba(8,10,14,.72);border:1px solid rgba(255,255,255,.14);font:600 14px 'Barlow Condensed',Arial,sans-serif;color:#eef2f5;letter-spacing:.04em;text-align:center;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,.4)}
    .zvsub.on{display:block}.zvsub b.f{display:inline-block;width:19px;height:19px;line-height:19px;border-radius:50%;background:#ff6319;color:#fff;font:700 13px Arial;text-align:center;margin-right:7px;vertical-align:1px}
    .zvsub .l{display:block}.zvsub .h{display:block;font-weight:500;font-size:12.5px;color:#ffcf8a;margin-top:2px}.zvsub .now{color:#8dff9c}`;
    document.head.appendChild(st); G.el = document.createElement('div'); G.el.className = 'zvsub'; document.body.appendChild(G.el); }
  const p = ctx.player; let html = '';
  const key = ctx.isTouch ? 'tap BOARD' : 'F';
  if (ctx.state === 'playing' && p && !p.dead) {
    if (R.aboard) {
      const l = R.leg, me = { line: R.id, color: R.cfg.color, fg: R.cfg.fg };
      if (R.canAlight) html = `<span class="l">${bul(me)}<span class="now">${l.stop.name}</span> — doors open ${mss(l.t1 - 3 - t)}</span><span class="h">${l.next.hidden ? `last stop in the map: get off here (the ${R.id} runs on to ${l.next.name})` : `${ctx.isTouch ? 'GET OFF' : 'F'} or walk out the open doors to get off · next: ${l.next.name}`}</span>`;
      else { const nx = l.kind === 'run' ? l.b : l.next, lg = R.legs.find((g) => g.kind === 'dwell' && g.stop === nx && g.t0 >= (l.kind === 'run' ? l.t1 - 0.01 : l.t1 + 0.01)) || R.legs.find((g) => g.kind === 'dwell' && g.stop === nx);
        html = `<span class="l">${bul(me)}${l.kind === 'run' && l.b.s > l.a.s ? R.cfg.dest.out : 'Coney Island'} · next stop <b>${nx.name}</b> — ${mss(((lg.t0 + 1.5 - t) % R.cycle + R.cycle) % R.cycle)}</span><span class="h">walk the car: ${ctx.isTouch ? 'stick' : 'WASD'} · look out the windows</span>`; }
    } else if (!p.mounted) {
      const st = stationAt(p.position);
      if (st) {
        let deps = departures(st.id); if (st.id === 'W8' && (st.plat || st.lower)) deps = deps.filter((d) => (d.line === 'F') === !!st.plat);
        if (st.id === 'STW' && st.isl && st.isl !== '-') deps = deps.filter((d) => d.line === st.isl);
        const lines = deps.slice(0, 3).map((d) => `<span class="l">${bul(d)}to ${d.to} — ${d.boarding ? `<span class="now">boarding · leaves ${mss(d.leave)}</span>` : d.arrive < 20 ? `<span class="now">arriving ${mss(d.arrive)}</span>` : mss(d.arrive)}</span>`).join('');
        const brd = LINES.find((L) => L.boardable);
        let h = '';
        if (brd) h = `${key} to board the ${brd.id} — or just walk in through the open doors`;
        else if (st.id === 'STW') h = st.plat ? (st.isl === '-' ? 'parked trains only — D: 2nd island · F: 3rd · Q: 4th from Stillwell Ave' : `the ${st.isl} boards here`) : 'through the turnstiles → stairs from Stillwell Ave: D 2nd bank · F 3rd · Q 4th';
        else if (st.id === 'W8') h = w8Hint(p);
        else h = st.plat ? `${deps[0]?.line || ''} back to Coney Island stops here` : 'stairs at the end of the platforms';
        html = lines + `<span class="h">${h}</span>`;
      }
    }
  }
  if (html !== G.html) { G.html = html; G.el.innerHTML = html; G.el.classList.toggle('on', !!html); }
}
/** W 8 St wayfinding for the HUD: which way (an arrow relative to where you look) and how far to the stairs you want */
function w8Pt(a, o, y) { const u = W8U; return new THREE.Vector3(W8.P0.x + u.x * a - u.y * o, y, W8.P0.y + u.y * a + u.x * o); }
function w8Hint(p) {
  const P = p.position, u = W8U, o = -(P.x - W8.P0.x) * u.y + (P.z - W8.P0.y) * u.x, sd = o < 0 ? -1 : 1, lvl = P.y > 13.5 ? 'up' : P.y > 7.5 ? 'lo' : 'st';
  const dir = (q) => { const b = Math.atan2(q.x - P.x, q.z - P.z), f = Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw)); let r = b - f; r = Math.atan2(Math.sin(r), Math.cos(r));
    return `${['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'][((Math.round(-r / (Math.PI / 4)) % 8) + 8) % 8]} ${Math.round(Math.hypot(q.x - P.x, q.z - P.z))} m`; };
  if (lvl === 'up') return sd < 0 ? `upper level: the F stops here · exit / Q / Aquarium: stairs ${dir(w8Pt(120.8, -7, 0))}` : `no F on this side — stairs ${dir(w8Pt(120.8, 7, 0))} → Q level → street → north stairs up`;
  if (lvl === 'lo') return sd < 0 ? `F: stairs up ${dir(w8Pt(107.5, -9.5, 0))} · exit ${dir(w8Pt(54.8, -9, 0))} · the Q boards on the south side` : `the Q boards here · Aquarium footbridge ${dir(w8Pt(150, 9, 0))} · exit ${dir(w8Pt(54.8, 9, 0))}`;
  return `F: north stairs ${dir(w8Pt(38.2, -9.5, 0))} · Q: south stairs ${dir(w8Pt(38.2, 9.5, 0))}`;
}
/** station life: countdown clocks (in-world LED, per platform: the lines that stop there), and the station PA when a train comes in */
function stationLife() {
  const { ctx, world } = R, p = ctx.player.position;
  if (!G.clocks) { G.clocks = []; const yawW8 = Math.atan2(W8U.x, W8U.y);
    const groups = [['W8', ['F'], [[60, -5.45, W8.UP.plat + 2.6], [150, -5.45, W8.UP.plat + 2.6]].map(([a, o, y]) => [w8Pt(a, o, y), yawW8])], ['W8', ['Q'], [[92, 5.45, W8.LO.plat + 2.5], [140, 5.45, W8.LO.plat + 2.5]].map(([a, o, y]) => [w8Pt(a, o, y), yawW8])],
      ['STW', ['F'], [[new THREE.Vector3(-49.5, 11.3, -345), 0], [new THREE.Vector3(-49.5, 11.3, -300), 0]]], ['STW', ['Q'], [[new THREE.Vector3(-33.5, 11.3, -330), 0]]], ['STW', ['D'], [[new THREE.Vector3(-64, 11.3, -330), 0]]]];
    for (const [id, S] of Object.entries(STN)) if (id !== 'NEP') groups.push([id, null, [[S.at(0, S.O1 - 0.9, S.plat + 2.7), S.ang], [S.at(0, -S.O1 + 0.9, S.plat + 2.7), S.ang]]]);
    for (const [id, only, spots] of groups) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 64; const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.MeshStandardMaterial({ color: 0, map: tx, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: 1.1 }), geos = [];
      for (const [q, yaw] of spots) { for (const k of [0, Math.PI]) { const g = new THREE.PlaneGeometry(1.6, 0.4); g.rotateY(yaw + k); g.translate(q.x + Math.sin(yaw + k) * 0.04, q.y, q.z + Math.cos(yaw + k) * 0.04); geos.push(g); } const bx = new THREE.BoxGeometry(1.7, 0.48, 0.07); bx.rotateY(yaw); bx.translate(q.x, q.y, q.z); geos.push(bx); }
      const mesh = new THREE.Mesh(mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false), m); mesh.name = `clock${id}`; world.scene.add(mesh); G.clocks.push({ id, only, c, tx, at: spots[0][0], last: '' }); } }
  for (const C of G.clocks) { if (C.at.distanceTo(p) > 180) continue;
    const deps = departures(C.id).filter((d) => !C.only || C.only.includes(d.line)).slice(0, 2), txt = deps.map((d) => `${d.line}${d.dest}|${d.boarding ? 'NOW' : Math.max(1, Math.ceil(d.arrive / 60))}`).join('/');
    if (txt === C.last) continue; C.last = txt; const g = C.c.getContext('2d'); g.fillStyle = '#060606'; g.fillRect(0, 0, 256, 64);
    deps.forEach((d, i) => { const y = 16 + i * 32; g.fillStyle = d.color; g.beginPath(); g.arc(14, y, 11, 0, 7); g.fill(); g.fillStyle = d.fg; g.font = '700 15px Helvetica, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(d.line, 14, y + 1);
      g.fillStyle = '#ffae3a'; g.font = '700 16px "Courier New", monospace'; g.textAlign = 'left'; g.fillText(d.dest.slice(0, 14), 32, y + 1); g.textAlign = 'right'; g.fillText(d.boarding ? 'NOW' : `${Math.max(1, Math.ceil(d.arrive / 60))} min`, 250, y + 1); });
    C.tx.needsUpdate = true; }
  // the station PA: "now approaching" ~25 s out, "this is ..." as the doors open — only while you're on that station's platforms
  if (LINES.some((L) => L.aboard) || ctx.state !== 'playing') return; const st = stationAt(p); if (!st || !(st.plat || st.lower)) return;
  for (const d of departures(st.id)) { if (st.id === 'W8' && (d.line === 'F') !== !!st.plat) continue; if (st.id === 'STW' && st.isl && st.isl !== d.line) continue;
    const L = LINES.find((q) => q.id === d.line), bound = d.to === 'Stillwell Av' ? L.cfg.bound.in : L.cfg.bound.out, k1 = `${st.id}|${d.line}|a|${Math.round(Date.now() / 1000 + d.arrive)}`;
    if (!d.boarding && d.arrive < 25 && d.arrive > 18 && G.paKey !== k1) { G.paKey = k1; const txt = `Attention passengers: the next ${bound} train is now approaching. Please stand away from the platform edge.`; K.toast(txt, 4200); pa(ctx, txt); }
    const k2 = `${st.id}|${d.line}|d|${Math.round(Date.now() / 1000 - (d.leave > 0 ? 0 : 1) + d.leave)}`;
    if (d.boarding && d.leave > 12 && G.paKey2 !== k2 && !G.said?.[k2]) { G.paKey2 = k2; (G.said ||= {})[k2] = 1; const txt = `This is ${NAMES[st.id][1]}. This is a ${bound} train.`; K.toast(txt, 4200); pa(ctx, txt); }
  }
}
/** which side the platform is on at a stop (+1 = the car's right / −1 left, 2 = both) — measured, not assumed */
function sideAt(stop) {
  if (stop.both) return 2;
  if (stop.sideCache) return stop.sideCache;
  const g = R.cars[2]; g.updateMatrixWorld(true);
  const probe = (sx) => { _a.set(sx * 2.4, FLOOR + 0.5, 0).applyMatrix4(g.matrixWorld); const ray = new THREE.Raycaster(new THREE.Vector3(_a.x, _a.y + 1, _a.z), new THREE.Vector3(0, -1, 0), 0, 3); const fy = _a.y - 0.5; return ray.intersectObjects(R.ctx.raycastTargets.filter((o) => o.isMesh && !o.isInstancedMesh), false).filter((h) => Math.abs(h.point.y - fy) < 0.35).length; };   // only a floor at door-sill height counts (a passing Stillwell shuttle flipped the side)
  const r = probe(1), l = probe(-1); if (!r && !l) return 1;   // nothing measured (yet): don't cache a guess
  const side = r >= l ? 1 : -1; stop.sideCache = side; return side;
}
function board(lx, lz, c) {
  const b = R.boardable; if (!b || R.aboard) return;
  R.aboard = { c: c ?? b.c, lx: lx ?? b.sx * 1.1, lz: lz ?? b.dz, head: null };
  R.ctx.player.mounted = { train: true, line: R.id }; R.lastAnn = ''; R.hintOff = true;
  K.toast(`On the ${R.id} — next stop ${b.next?.name || ''}. Walk around; ${R.ctx.isTouch ? 'GET OFF' : 'F'} or the open doors at a stop to get off.`, 3200);
}
function alight(force = false, dz, side) {
  const a = R.aboard; if (!a) return; R.aboard = null; const p = R.ctx.player; if (p.mounted?.train) p.mounted = null;
  if (force) return;
  const s = side || (R.side === 2 ? (Math.sign(a.lx) || 1) : R.side || 1), d = dz ?? DOORZ.reduce((m, z) => (Math.abs(z - a.lz) < Math.abs(m - a.lz) ? z : m), DOORZ[0]);
  const g = R.cars[a.c]; g.updateMatrixWorld(true); _a.set(s * 2.7, FLOOR, d).applyMatrix4(g.matrixWorld);
  p.teleport?.(_a.x, _a.y + 0.02, _a.z, p.yaw, p.pitch);
}
function announce(l) {
  const oth = ['D', 'F', 'N', 'Q'].filter((x) => x !== R.id), X = { STW: `Transfer is available to the ${oth.slice(0, -1).join(', ')} and ${oth[oth.length - 1]} trains.`, W8: R.id === 'F' ? 'Transfer is available to the Q train.' : R.id === 'Q' ? 'Transfer is available to the F train.' : '' };
  if (l.kind === 'dwell') {
    const s = l.stop, nx = l.next; if (s.hidden) return; chime();
    const bound = nx.s > s.s ? R.cfg.bound.out : R.cfg.bound.in, xf = X[s.id] || '';
    const txt = `This is ${s.speak}. ${xf ? xf + ' ' : ''}This is a ${bound} train. The next stop is ${nx.speak}.`;
    K.toast(txt, 5200); pa(R.ctx, txt);
  } else if (!l.b.hidden) { const txt = `The next stop is ${l.b.speak}.`; K.toast(txt, 3000); pa(R.ctx, txt); }
}
/** the cars' live bits: door-open lights, the LED signs / strip map, ceiling-light flicker, sparks off the shoes at night,
 *  wheel clack + motor whine for the car you ride */
const _sp = new THREE.Vector3();
function cabin(dt, l, t, open, speed, curve) {
  const M = R.kit.M, idx = (st) => ({ STW: 0, W8: 1, NEP: 2, OCP: 2, BRT: 3, B50: 1, A25: 2 })[st.id];
  M.ind.emissiveIntensity = open > 0.05 ? 2.4 : 0;
  // LED: destination follows the direction of travel; the strip map lights the next stop (blinking while you ride)
  const run = l.kind === 'run', a = run ? l.a : l.stop, b = run ? l.b : l.next, fw = b.s > a.s;
  const line = run ? `Next stop: ${R.cfg.strip[idx(b)]}` : `This is ${R.cfg.strip[idx(a)]}`, blink = R.aboard ? Math.floor(now() * 1.6) & 1 : 1;
  const key = `${fw}|${idx(a)}|${idx(b)}|${line}|${blink}`; if (key !== R.ledKey) { R.ledKey = key; drawLED(R.kit.led, R.cfg, fw, idx(a), idx(b), line, blink); }
  // lights: a rare flicker (a gap in the third rail, or a tired ballast)
  R.flk = (R.flk ?? 6) - dt; if (R.flk < 0) { R.flk = 8 + Math.random() * 20; R.flkT = 0.35; }
  // the cabin is lit by its own panels: at night the interior surfaces glow with them (no real lights = no extra cost)
  const nk = Math.max(0, Math.min(1, ((R.W.horizon?.cycle?.s ?? 0) - 0.3) / 0.4)), lit = (R.flkT > 0 && Math.sin(R.flkT * 70) > 0.2 ? 0.2 : 1) * (0.08 + 0.55 * nk);
  if (!M.int.emissiveMap) { for (const m of [M.int, M.floor]) { m.emissive.setHex(0xfff8ec); m.emissiveMap = m.map; m.needsUpdate = true; } }
  M.int.emissiveIntensity = lit; M.floor.emissiveIntensity = lit * 0.6;
  R.flkT = Math.max(0, (R.flkT || 0) - dt); M.lamp.emissiveIntensity = R.flkT > 0 && Math.sin(R.flkT * 70) > 0.2 ? 0.25 : 1.2;
  // sparks: brief showers from the shoes / wheels on the curves and now and then at a joint, at night
  if (!R.spk) { const n = 60, geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(-999), 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffc070, size: 0.09, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); pts.frustumCulled = false; R.world.scene.add(pts);
    R.spk = { pts, n, v: new Float32Array(n * 3), life: new Float32Array(n), i: 0 }; }
  const S = R.spk, night = (R.W.horizon?.cycle?.s ?? 0) > 0.55, near = R.aboard || R.ctx.player.position.distanceTo(R.cars[2].position) < 220;
  if (night && near && speed > 3 && (Math.abs(curve) > 0.035 ? Math.random() < 0.5 : Math.random() < 0.04)) {
    const g = R.cars[Math.random() * NCAR | 0], tz = (Math.random() < 0.5 ? -1 : 1) * (CAR / 2 - 2.6) + (Math.random() < 0.5 ? -1.05 : 1.05);
    for (let k = 0; k < 6; k++) { const i = S.i = (S.i + 1) % S.n; _sp.set((Math.random() < 0.5 ? -1 : 1) * 1.5, 0.3, tz).applyMatrix4(g.matrixWorld); S.pts.geometry.attributes.position.setXYZ(i, _sp.x, _sp.y, _sp.z);
      S.v[i * 3] = (Math.random() - 0.5) * 5; S.v[i * 3 + 1] = Math.random() * 2.5; S.v[i * 3 + 2] = (Math.random() - 0.5) * 5; S.life[i] = 0.25 + Math.random() * 0.35; } }
  let live = false; const P = S.pts.geometry.attributes.position;
  for (let i = 0; i < S.n; i++) { if (S.life[i] <= 0) continue; S.life[i] -= dt; live = true; if (S.life[i] <= 0) { P.setXYZ(i, 0, -999, 0); continue; }
    S.v[i * 3 + 1] -= 9.8 * dt; P.setXYZ(i, P.getX(i) + S.v[i * 3] * dt, P.getY(i) + S.v[i * 3 + 1] * dt, P.getZ(i) + S.v[i * 3 + 2] * dt); }
  if (live || S.was) P.needsUpdate = true; S.was = live; S.pts.visible = live;
  // ride audio: motor whine on acceleration / braking; a click for every axle of your car crossing a rail joint
  const au = R.au || (R.au = rideAudio(R.ctx)); au.update(!!R.aboard, speed, R.acc || 0);
  if (R.aboard) { const sm = headS() - (R.aboard.c + 0.5) * CAR, ax = [CAR / 2 - 2.6 + 1.05, CAR / 2 - 2.6 - 1.05, -(CAR / 2 - 2.6) + 1.05, -(CAR / 2 - 2.6) - 1.05].map((o) => sm + o);
    if (R.ax) ax.forEach((s, k) => { if (Math.floor(s / JOINT) !== Math.floor(R.ax[k] / JOINT) && speed > 0.8) au.click(speed, k * 0.004); }); R.ax = ax; } else R.ax = null;
}
/** aboard: steel-wheel rumble (filtered noise, louder with speed) + flange squeal when curving at speed */
function trackSound(speed, curve) {
  if (!R.aboard) { if (R.snd) R.snd.g.gain.value = R.snd.q.gain.value = 0; return; }
  try {
    if (!R.snd) { const ac = R.ac || (R.ac = R.ctx.audio?.context || new (window.AudioContext || window.webkitAudioContext)()); const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0); let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; const g = ac.createGain(); g.gain.value = 0; src.connect(lp).connect(g).connect(ac.destination); src.start();
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 2900; const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3100; bp.Q.value = 18; const q = ac.createGain(); q.gain.value = 0; o.connect(bp).connect(q).connect(ac.destination); o.start();
      R.snd = { g, q, o, lp }; }
    const k = Math.min(1, speed / VMAX), v = R.au?.vol?.() ?? 1; R.snd.g.gain.value = (0.05 + k * 0.32) * v; R.snd.lp.frequency.value = 220 + k * 520;
    R.snd.q.gain.value = curve > 0.04 && speed > 4 ? Math.min(0.06, (curve - 0.03) * 0.5) * k * v : 0; R.snd.o.frequency.value = 2800 + Math.sin(now() * 13) * 120;
  } catch {}
}
function chime() {   // the R160 "ding-dong" (two falling sine tones)
  try { const ac = R.ac || (R.ac = R.ctx.audio?.context || new (window.AudioContext || window.webkitAudioContext)()); const t = ac.currentTime;
    for (const [f, d] of [[1046.5, 0], [830.6, 0.32]]) { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; o.type = 'sine'; g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.18 * (R.au?.vol?.() ?? 1)), t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.7); o.connect(g).connect(ac.destination); o.start(t + d); o.stop(t + d + 0.75); } } catch {}
}

// ---------------------------------------------------------------------------------------------------------------------------
// el structure where coney/city.js doesn't build one (east of the play area): bents every 12 m, girders, ties
function buildEl(world, P) {
  const { scene } = world; const green = new THREE.MeshStandardMaterial({ color: 0x3f5a47, roughness: 0.7, metalness: 0.35 }), ties = new THREE.MeshStandardMaterial({ color: 0x4a3b2e, roughness: 0.95 });
  const gs = [], ts = [];
  const skip = (p) => (p.x < 300 && p.z > -672) || (Math.abs(p.x - 365) < 110 && p.z > -175 && p.z < -90);   // city.js covers the west; W 8 St builds its own
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
function buildElStation(world, sHead, opt) {
  const { scene, ctx, W } = world;
  const cS = sHead - LEN / 2, c0 = ptAt(cS), c1 = ptAt(cS + 20); const u = new THREE.Vector2(c1.x - c0.x, c1.z - c0.z).normalize(), n = new THREE.Vector2(-u.y, u.x);
  const y = c0.y, plat = y + FLOOR, PL = 130, O0 = 1.7, O1 = 5.4;
  const at = (a, o, yy) => new THREE.Vector3(c0.x + u.x * a + n.x * o, yy, c0.z + u.y * a + n.y * o), ang = Math.atan2(u.x, u.y);
  (W.zones || (W.zones = [])).push({ x0: Math.min(c0.x, c1.x) - 160, x1: Math.max(c0.x, c1.x) + 160, z0: c0.z - 180, z1: c0.z + 400, name: opt.zone, hint: opt.hint });
  { const z = W.zones[W.zones.length - 1]; if (c0.x > (W.bounds?.max?.x ?? 440)) z.x0 = Math.max(z.x0, (W.bounds?.max?.x ?? 440) + 3); else { z.z1 = Math.min(z.z1, (W.bounds?.min?.z ?? -420) - 3); z.z0 = c0.z - 400; } }   // an island zone: overlapping the main map it clamped W 8 St (invisible walls at x 361 / z −83)
  const S = (c, r = 0.8, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const conc = S(0xa9a59c, 0.9), edge = S(0xf2c418, 0.7), steel = S(0x3f5a47, 0.6, 0.4), roofM = S(0x5b6168, 0.5, 0.6), asph = S(0x39393b, 0.95), walk = S(0x9d998f, 0.9);
  // a rotated box: merged geometry + collider cells (0.5 m) so the rotated floors stay walkable and the gaps stay open
  const GM = new Map();
  const rbox = (m, a0, a1, o0, o1, y0, y1, { collide = true, walkable = false, coarse = false } = {}) => {
    const g = new THREE.BoxGeometry(o1 - o0, y1 - y0, a1 - a0).toNonIndexed(); g.rotateY(ang); const c = at((a0 + a1) / 2, (o0 + o1) / 2, (y0 + y1) / 2); g.translate(c.x, c.y, c.z); (GM.get(m) || GM.set(m, []).get(m)).push(g);   // merged per material below
    const me = null; if (!collide) return me;
    if (coarse) { const cs = [at(a0, o0, 0), at(a1, o0, 0), at(a0, o1, 0), at(a1, o1, 0)]; world.box([Math.min(...cs.map((q) => q.x)), y0, Math.min(...cs.map((q) => q.z))], [Math.max(...cs.map((q) => q.x)), y1, Math.max(...cs.map((q) => q.z))]); return me; }   // buildings: one box, nobody walks inside
    const cell = 0.6, na = Math.max(1, Math.ceil((a1 - a0) / cell)), no = Math.max(1, Math.ceil((o1 - o0) / cell));
    for (let i = 0; i < na; i++) for (let j = 0; j < no; j++) { const pa = at(a0 + (i + 0.5) * (a1 - a0) / na, o0 + (j + 0.5) * (o1 - o0) / no, 0), h = 0.36; const mn = [pa.x - h, y0, pa.z - h], mx = [pa.x + h, y1, pa.z + h]; walkable ? world.walkable(mn, mx) : world.box(mn, mx); }
    return me;
  };
  const feet = [], stairs = []; if (opt.id === 'NEP') W.neptunePlat = { at, plat, a0: -PL / 2 + 6, a1: PL / 2 - 12, o0: O0 + 0.9, o1: O1 - 0.9 };   // riders waiting on the platforms (coney/folk.js)
  for (const s of [-1, 1]) {
    const o0 = s > 0 ? O0 : -O1, o1 = s > 0 ? O1 : -O0;
    rbox(conc, -PL / 2, PL / 2, o0, o1, plat - 0.35, plat, { walkable: true });
    rbox(edge, -PL / 2, PL / 2, s > 0 ? O0 : -O0 - 0.5, s > 0 ? O0 + 0.5 : -O0, plat, plat + 0.01, { collide: false });
    for (const [r0, r1] of [[-PL / 2, -PL / 2 + 5], [-PL / 2 + 7.6, PL / 2]]) rbox(steel, r0, r1, s > 0 ? O1 - 0.1 : -O1, s > 0 ? O1 : -O1 + 0.1, plat, plat + 1.1);   // back railing, open where the stair landing leaves (it ran straight across: the stairs were unreachable)
    for (let a = -PL / 2 + 8; a < PL / 2; a += 16) rbox(steel, a - 0.12, a + 0.12, s * (O1 - 0.6) - 0.12, s * (O1 - 0.6) + 0.12, plat, plat + 3.2, { collide: false });   // canopy posts
    rbox(roofM, -PL / 2 + 10, PL / 2 - 10, s > 0 ? O0 + 0.4 : -O1 - 0.3, s > 0 ? O1 + 0.3 : -O0 - 0.4, plat + 3.2, plat + 3.35, { collide: false });
    // name signs + F bullets
    for (const a of [-40, 0, 40]) { const sg = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.55), new THREE.MeshStandardMaterial({ map: nameTex(opt.name), emissive: 0xffffff, emissiveMap: nameTex(opt.name), emissiveIntensity: 0.25 })); sg.position.copy(at(a, s * (O1 - 0.62), plat + 2.5)); sg.rotation.y = ang + (s > 0 ? -Math.PI / 2 : Math.PI / 2); scene.add(sg); }
    // stairs down to the street at the south end of each platform (going away from the track, then down along the el)
    const aS = -PL / 2 + 6, oS = s * (O1 + 1.2), nSt = Math.ceil(plat / 0.19), rise = plat / nSt, tread = 0.29;
    rbox(conc, aS - 1, aS + 1.6, s > 0 ? O1 - 0.2 : oS - 1.2, s > 0 ? oS + 1.2 : -O1 + 0.2, plat - 0.35, plat, { walkable: true });   // landing off the platform
    for (let k = 0; k < nSt; k++) { const a0 = aS - 1 - (k + 1) * tread; rbox(conc, a0, a0 + tread, oS - 1.1, oS + 1.1, 0, plat - (k + 1) * rise, { walkable: true }); }
    rbox(steel, aS - 1 - nSt * tread, aS - 1, oS + s * 1.15 - 0.05, oS + s * 1.15 + 0.05, 0, plat + 1.0, { collide: true });   // outer railing
    { const f = at(aS - 1 - nSt * tread - 1.6, oS + s * 1.8, 0); feet.push([f.x, f.z]); stairs.push([at(aS + 0.3, s * (O0 + O1) / 2, plat), at(aS + 0.3, oS, plat), at(aS - 1 - nSt * tread - 1.2, oS, 0)].map((q) => [+q.x.toFixed(2), +q.z.toFixed(2)])); }   // the globe lamp at the stair foot (buildEntrances)
  }
  // street: Shell Rd under the el, Neptune Ave across, sidewalks, a row of storefronts / walk-ups each side
  const plane = (m, a0, a1, o0, o1, yy) => { const g = new THREE.PlaneGeometry(o1 - o0, a1 - a0); g.rotateX(-Math.PI / 2); const me = new THREE.Mesh(g, m); me.position.copy(at((a0 + a1) / 2, (o0 + o1) / 2, yy)); me.rotation.y = ang; me.receiveShadow = true; scene.add(me); };
  if (opt.street) plane(asph, -260, 260, -10, 10, 0.03); if (opt.street) { plane(walk, -260, 260, -14, -10, 0.05); plane(walk, -260, 260, 10, 14, 0.05);
  { const g = new THREE.PlaneGeometry(260, 18); g.rotateX(-Math.PI / 2); const me = new THREE.Mesh(g, asph); me.position.set(c0.x, 0.035, NEP_Z); me.receiveShadow = true; if (opt.cross) scene.add(me); }   // Neptune Ave (E–W)
  const fac = facadeTex(), facM = [0xb88a70, 0xd8c7a6, 0x9c5a44, 0xc9c1b0].map((c) => new THREE.MeshStandardMaterial({ map: fac, color: c, roughness: 0.9 }));
  for (const s of [-1, 1]) for (let a = -200; a < 220; a += 13 + ((a * 7) % 5)) { if (Math.abs(at(a, 0, 0).z - NEP_Z) < 16 || (opt.id === 'OCP' && at(a, 0, 0).x < 870)) continue; const h = 7 + ((a * 13) % 7); rbox(facM[((a / 13) | 0) & 3], a, a + 12, s * 15, s * 27, 0, h, { coarse: true }); }
  }
  for (const [m, list] of GM) { const me = new THREE.Mesh(mergeGeometries(list, false), m); me.castShadow = true; me.receiveShadow = true; scene.add(me); }
  // arrival: coming up the stairs at street level shows the POI; a subtle lamp at each stair foot
  STN[opt.id] = { at, plat, O0, O1, c: c0, feet, stairs, ang };   // stairs: [platform, landing, street] per side (QA walks them)
}
// ---------------------------------------------------------------------------------------------------------------------------
// street-level signposting: the green globe lamps (lit, so they read at night too) with an F bullet at every entrance —
// Stillwell's bus-loop doors + the Stillwell Ave door, W 8 St's two stair towers + the Aquarium footbridge stairs, Neptune
// Av's stair feet — and an "F ↑" sign over the one Stillwell stair bank that leads to the F platform
function buildEntrances(world) {
  const { scene, W } = world; const u = W8U, w8 = (a, o) => [W8.P0.x + u.x * a - u.y * o, W8.P0.y + u.y * a + u.x * o];
  const spots = [[-72.8, -256.5], [-59.2, -256.5], [-52.8, -256.5], [-39.2, -256.5], [-89.6, -277.8], [-89.6, -270.2]];
  const oN = -(W8.platOut + 2.3), oS = W8.platOut + 2.3, oE = W8.platOut + 38 - 1.4;
  for (const o of [oN, oS]) for (const d of [-1.7, 1.7]) spots.push(w8(38.2, o + d));
  for (const d of [-1.7, 1.7]) spots.push(w8(133.8, oE + d));
  const RT = spots.map((q, i) => (i < 6 ? 'DFNQ' : 'FQ'));   // Stillwell: D F N Q · W 8 St: F Q
  for (const [id, r] of [['NEP', 'F'], ['OCP', 'Q'], ['B50', 'D']]) for (const q of STN[id]?.feet || []) { spots.push(q); RT.push(r); }
  const poles = [], globes = [], bul = [];
  spots.forEach(([x, z], si) => {
    const pg = new THREE.CylinderGeometry(0.055, 0.08, 2.9, 8); pg.translate(x, 1.45, z); poles.push(pg);
    const cap = new THREE.CylinderGeometry(0.2, 0.16, 0.12, 12); cap.translate(x, 2.95, z); poles.push(cap);
    const gg = new THREE.SphereGeometry(0.27, 16, 12); gg.translate(x, 3.25, z); globes.push(gg);
    const rs = RT[si], nb = rs.length, bw = 0.34;   // a row of route bullets on two crossed planes (atlas: D F N Q)
    for (const r of [0, Math.PI / 2]) for (let k = 0; k < nb; k++) { const b = new THREE.PlaneGeometry(bw, bw), uv = b.attributes.uv, cell = 'DFNQ'.indexOf(rs[k]); for (let i = 0; i < uv.count; i++) uv.setX(i, (cell + uv.getX(i)) / 4);
      b.translate((k - (nb - 1) / 2) * (bw + 0.03), 0, 0); b.rotateY(r); b.translate(x, 2.3, z); bul.push(b); }
    world.box([x - 0.1, 0, z - 0.1], [x + 0.1, 3.2, z + 0.1]);
  });
  const add = (list, m) => { const me = new THREE.Mesh(mergeGeometries(list, false), m); me.castShadow = true; scene.add(me); return me; };
  add(poles, new THREE.MeshStandardMaterial({ color: 0x1f3a2a, roughness: 0.6, metalness: 0.5 }));
  add(globes, new THREE.MeshStandardMaterial({ color: 0x3fdc6e, emissive: 0x22c653, emissiveIntensity: 1.6, roughness: 0.3 })).castShadow = false;
  const bt = bulletAtlas(); add(bul, new THREE.MeshStandardMaterial({ map: bt, transparent: true, alphaTest: 0.4, emissive: 0xffffff, emissiveMap: bt, emissiveIntensity: 0.5, side: THREE.DoubleSide })).castShadow = false;
  // Stillwell concourse: which stairs go to the F (the 3rd bank from Stillwell Ave, x −49.5)
  const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d');
  g.fillStyle = '#111'; g.fillRect(0, 0, 512, 96); g.fillStyle = '#fff'; g.fillRect(0, 6, 512, 4);
  g.fillStyle = '#ff6319'; g.beginPath(); g.arc(52, 54, 32, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = '700 44px Helvetica, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('F', 52, 57);
  g.textAlign = 'left'; g.font = '700 30px Helvetica, Arial'; g.fillText('↑  W 8 St · Neptune Av', 100, 44); g.font = '500 20px Helvetica, Arial'; g.fillStyle = '#ffcf8a'; g.fillText('this stairway · west side of the platform', 100, 76);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.68), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.4, side: THREE.DoubleSide }));
  sg.position.set(-49.5, 3.9, -275.7); scene.add(sg);
  void W;
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
