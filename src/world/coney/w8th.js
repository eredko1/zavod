// CONEY — West 8th Street–NY Aquarium, the two-level elevated station, on its OSM alignment (platforms x 268…463, 14° off the
// street grid, north of Surf Ave): Culver (F) on the upper level (platform 14.6 m), Brighton (Q) on the lower (8.6 m), two
// tracks and two side platforms per level, canopies over the top level, steel bents, stair towers from the street to both
// levels, and the covered footbridge south over Surf Ave toward the Aquarium. F and Q trains stop and move on (wall clock).
// The station is rotated, so its floors / walls are strings of small AABB cells (the game's colliders are axis-aligned).
import * as THREE from 'three';
import { Batch } from '../sbu/geo.js';

const P0 = new THREE.Vector2(274.5, -153), P1 = new THREE.Vector2(457, -107.5);
export const W8 = { P0, P1, L: P0.distanceTo(P1), LO: { rail: 7.5, top: 7.3, bot: 6.8, plat: 8.6 }, UP: { rail: 13.5, top: 13.3, bot: 12.8, plat: 14.6 }, halfTrack: 2.0, platIn: 3.7, platOut: 7.2 };
const CAR = 18.4, NCAR = 6;

export function buildW8th(world, M) {
  const { scene, ctx, W } = world; const S = W8, B = new Batch(world, M, 'w8th');
  const u = P1.clone().sub(P0).normalize(), n = new THREE.Vector2(-u.y, u.x), ang = Math.atan2(u.x, u.y);   // n: +z side (Surf Ave / the Aquarium)
  const at = (a, o, y = 0) => new THREE.Vector3(P0.x + u.x * a + n.x * o, y, P0.y + u.y * a + n.y * o);
  if (!M.w8Plat) { M.w8Plat = new THREE.MeshStandardMaterial({ color: 0xa6a59e, roughness: 0.93 }); M.surface.w8Plat = 'concrete'; }
  if (!M.edgeYellow) { M.edgeYellow = new THREE.MeshStandardMaterial({ color: 0xf2c418, roughness: 0.7 }); M.surface.edgeYellow = 'concrete'; }
  // a box in station coordinates (a along the platforms, o across, y up): one rotated mesh + axis-aligned collider cells
  const sbox = (key, a0, a1, o0, o1, y0, y1, { collide = true, walkable = false, cell = 1.6 } = {}) => {
    const g = new THREE.BoxGeometry(o1 - o0, y1 - y0, a1 - a0); g.translate((o0 + o1) / 2, (y0 + y1) / 2, (a0 + a1) / 2);
    g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(n.x, 0, n.y), new THREE.Vector3(0, 1, 0), new THREE.Vector3(u.x, 0, u.y))); g.translate(P0.x, 0, P0.y); B.add(key, g);
    if (!collide) return;
    const na = Math.max(1, Math.ceil((a1 - a0) / cell)), no = Math.max(1, Math.ceil((o1 - o0) / cell));
    for (let i = 0; i < na; i++) for (let k = 0; k < no; k++) {
      const aa = a0 + (a1 - a0) * i / na, ab = a0 + (a1 - a0) * (i + 1) / na, oa = o0 + (o1 - o0) * k / no, ob = o0 + (o1 - o0) * (k + 1) / no;
      const cs = [at(aa, oa), at(ab, oa), at(aa, ob), at(ab, ob)], x0 = Math.min(...cs.map((c) => c.x)), x1 = Math.max(...cs.map((c) => c.x)), z0 = Math.min(...cs.map((c) => c.z)), z1 = Math.max(...cs.map((c) => c.z));
      // shrink a little: rotated floor cells overlap their neighbours' AABBs. Thin walls / posts shrink much less — the full 0.18
      // left railings 1 cm thick with 0.34 m gaps (players slid through the W 8 St railings and fell) and canopy posts inside-out
      const sh = walkable ? 0.18 : Math.min(0.18, 0.2 * Math.min(x1 - x0, z1 - z0));
      const mn = [x0 + sh, y0, z0 + sh], mx = [x1 - sh, y1, z1 - sh];
      if (walkable) world.walkable(mn, mx); else world.box(mn, mx);
    }
  };
  const L = S.L, E = 8;   // platforms run a = 0…L; the structure extends E past each end
  for (const lv of [S.LO, S.UP]) {
    sbox('elSoffit', -E, L + E, -S.platIn, S.platIn, lv.bot, lv.top, { walkable: true, cell: 2.2 });
    sbox('stwCeil', -E, L + E, -S.platIn, S.platIn, lv.bot - 0.04, lv.bot - 0.01, { collide: false });   // plain underside: the tie texture moirés from the street                                  // trackbed between the platforms
    for (const s of [-1, 1]) {
      const oi = s * S.platIn, oo = s * S.platOut, [o0, o1] = [Math.min(oi, oo), Math.max(oi, oo)];
      sbox('w8Plat', 0, L, o0, o1, lv.top, lv.plat, { walkable: true, cell: 1.8 });                                                    // side platform
      sbox('edgeYellow', 0, L, s > 0 ? o0 : o1 - 0.6, s > 0 ? o0 + 0.6 : o1, lv.plat, lv.plat + 0.012, { collide: false });              // yellow edge
      sbox('galv', 0, L, s > 0 ? o1 - 0.08 : o0, s > 0 ? o1 : o0 + 0.08, lv.plat, lv.plat + 1.1, { cell: 1.2 });                        // outer railing / windscreen
      for (const r of [-0.72, 0.72]) sbox('steel', -E, L + E, s * S.halfTrack + r - 0.04, s * S.halfTrack + r + 0.04, lv.top, lv.rail, { collide: false });   // rails
    }
  }
  // upper level canopies (butterfly roofs on posts) + signs
  for (const s of [-1, 1]) { const oc = s * (S.platIn + S.platOut) / 2;
    for (let a = 6; a < L - 4; a += 12) sbox('railSteelGreen', a - 0.15, a + 0.15, oc - 0.15, oc + 0.15, S.UP.plat, S.UP.plat + 3.2, { cell: 1 });
    sbox('fascia', 2, L - 2, oc - 2.4, oc + 2.4, S.UP.plat + 3.2, S.UP.plat + 3.4, { collide: false }); }
  // bents: columns from the street to the upper deck every 12 m, cross girders under both decks
  for (let a = -E + 2; a <= L + E - 2; a += 12) { for (const s of [-1, 1]) sbox('elGirder', a - 0.35, a + 0.35, s * 7.7 - 0.35, s * 7.7 + 0.35, 0, S.UP.top, { cell: 1 });
    for (const lv of [S.LO, S.UP]) sbox('elGirder', a - 0.3, a + 0.3, -8.1, 8.1, lv.bot - 0.7, lv.bot, { collide: false }); }
  // ---- stairs: from the street up to the lower level (north side, at the W 8th St end) and on up to the upper level ----------
  // each flight is axis-aligned to the station (rotated steps = small cells), 2.4 m wide, 0.187 m risers
  const flight = (aStart, oCenter, y0, y1, dir) => {   // runs along ±a from aStart, rising y0 → y1
    const nSteps = Math.round((y1 - y0) / 0.187), run = nSteps * 0.29;
    for (let i = 0; i < nSteps; i++) { const a0 = aStart + dir * i * 0.29, a1 = a0 + dir * 0.29; sbox('concreteGrey', Math.min(a0, a1), Math.max(a0, a1), oCenter - 1.2, oCenter + 1.2, y0, y0 + (i + 1) * (y1 - y0) / nSteps, { walkable: true, cell: 2.4 }); }
    for (const s of [-1, 1]) sbox('galv', Math.min(aStart, aStart + dir * run), Math.max(aStart, aStart + dir * run), oCenter + s * 1.3 - 0.05, oCenter + s * 1.3 + 0.05, y0, y1 + 1.0, { cell: 1.2 });
    return aStart + dir * run;
  };
  const oN = -(S.platOut + 2.3), oS = S.platOut + 2.3;   // clear of the bent columns at ±7.7   // stair towers just outside each side
  { const aTop = flight(40, oN, 0, S.LO.plat, 1); sbox('w8Plat', aTop, aTop + 3, oN - 1.4, -S.platOut + 0.1, S.LO.plat - 0.25, S.LO.plat, { walkable: true }); }        // street → lower (north side)
  { const aTop = flight(40, oS, 0, S.LO.plat, 1); sbox('w8Plat', aTop, aTop + 3, S.platOut - 0.1, oS + 1.4, S.LO.plat - 0.25, S.LO.plat, { walkable: true }); }        // street → lower (south side)
  { const aTop = flight(110, oN, S.LO.plat, S.UP.plat, 1); sbox('w8Plat', 105, 110, oN - 1.4, -S.platOut + 0.1, S.LO.plat - 0.25, S.LO.plat, { walkable: true }); sbox('w8Plat', aTop, aTop + 3, oN - 1.4, -S.platOut + 0.1, S.UP.plat - 0.25, S.UP.plat, { walkable: true }); }   // lower → upper (north)
  { const aTop = flight(110, oS, S.LO.plat, S.UP.plat, 1); sbox('w8Plat', 105, 110, S.platOut - 0.1, oS + 1.4, S.LO.plat - 0.25, S.LO.plat, { walkable: true }); sbox('w8Plat', aTop, aTop + 3, S.platOut - 0.1, oS + 1.4, S.UP.plat - 0.25, S.UP.plat, { walkable: true }); }   // lower → upper (south)
  // gaps in the outer railings where the stairs land (the railing cells there are removed after the fact)
  const openings = [[40 + 46 * 0.29, 40 + 46 * 0.29 + 3, S.LO.plat, 0], [105, 110, S.LO.plat, 0], [110 + 32 * 0.29, 110 + 32 * 0.29 + 3, S.UP.plat, 0], [148.2, 151.8, S.LO.plat, 1]];   // [a0, a1, level, south only]
  const colsBefore = ctx.colliders.length;
  // ---- the footbridge to the Aquarium: south from the lower level's south platform, over Surf Ave, stairs down at the end ----
  { const aB = 150, o0 = S.platOut, len = 38, y = S.LO.plat;
    const bx = (o0a, o1a, y0, y1, key, opt) => sbox(key, aB - 1.6, aB + 1.6, o0a, o1a, y0, y1, opt);
    bx(o0 - 0.1, o0 + len, y - 0.3, y, 'w8Plat', { walkable: true, cell: 1.6 });
    for (const s of [-1, 1]) sbox('galv', aB + s * 1.6 - 0.05, aB + s * 1.6 + 0.05, o0, o0 + len - (s < 0 ? 2.8 : 0), y, y + 1.2, { cell: 1.2 });   // (the −a side stops short: the stairs down leave from there)
    sbox('galv', aB - 1.6, aB + 1.6, o0 + len - 0.05, o0 + len + 0.05, y, y + 1.2, { cell: 1.2 });   // end railing
    sbox('fascia', aB - 1.9, aB + 1.9, o0, o0 + len, y + 2.7, y + 2.85, { collide: false });
    for (let o = o0 + 4; o < o0 + len; o += 8) for (const s of [-1, 1]) sbox('railSteelGreen', aB + s * 1.7 - 0.1, aB + s * 1.7 + 0.1, o - 0.1, o + 0.1, 0, y + 2.7, { cell: 1 });
    // stairs down at the Aquarium end (running back along −a)
    const nSteps = 46, run = nSteps * 0.29, oE = o0 + len - 1.4;
    for (let i = 0; i < nSteps; i++) { const a1 = aB - 1.6 - i * 0.29, a0 = a1 - 0.29; sbox('concreteGrey', a0, a1, oE - 1.2, oE + 1.2, 0, y - i * (y / nSteps), { walkable: true, cell: 2.4 }); }
    W.aquariumBridge = at(aB, o0 + len - 1.4, 0);
  }
  // platform furniture: benches against the windscreens, litter baskets, the conductor's zebra board (drawn with the signs)
  for (const lv of [S.UP, S.LO]) for (const sd of [-1, 1]) for (const a of [28, 88, 142, 172]) { const oo = sd * (S.platOut - 0.45);
    sbox('fascia', a - 1.1, a + 1.1, oo - 0.22, oo + 0.22, lv.plat + 0.42, lv.plat + 0.48, { collide: false }); sbox('fascia', a - 1.1, a + 1.1, sd * (S.platOut - 0.12) - 0.04, sd * (S.platOut - 0.12) + 0.04, lv.plat + 0.5, lv.plat + 0.9, { collide: false });
    for (const e of [-0.9, 0.9]) sbox('galv', a + e - 0.04, a + e + 0.04, oo - 0.2, oo + 0.2, lv.plat, lv.plat + 0.44, { collide: false });
    sbox('railSteelGreen', a + 1.6, a + 2.1, oo - 0.25, oo + 0.25, lv.plat, lv.plat + 0.85, { cell: 1 }); }
  B.flush({ shadow: true });
  // cut the railing cells where stairs arrive on the platforms (they were added as plain boxes)
  const inOpen = (b) => { const c = new THREE.Vector3((b.min.x + b.max.x) / 2, 0, (b.min.z + b.max.z) / 2); const d = c.clone().sub(new THREE.Vector3(P0.x, 0, P0.y)); const a = d.x * u.x + d.z * u.y, o = d.x * n.x + d.z * n.y; return Math.abs(Math.abs(o) - S.platOut) < 0.4 && b.max.y - b.min.y < 1.4 && openings.some(([a0, a1, y, south]) => a > a0 - 0.5 && a < a1 + 0.5 && Math.abs(b.min.y - y) < 0.1 && (!south || o > 0)); };
  for (let i = ctx.colliders.length - 1; i >= 0; i--) { const b = ctx.colliders[i]; if (b && inOpen(b)) ctx.colliders.splice(i, 1); }
  void colsBefore;
  // signs
  for (const [lv, route, col, name] of [[S.LO, 'Q', '#fccc0a', 'W 8 St – NY Aquarium'], [S.UP, 'F', '#ff6319', 'W 8 St – NY Aquarium']]) for (const s of [-1, 1]) for (let a = 20; a < L - 10; a += 45) {
    const p = at(a, s * (S.platIn + S.platOut) / 2, lv.plat + 2.6); sign(scene, `${route}  ·  ${name}`, p, ang + Math.PI / 2 + (s > 0 ? Math.PI : 0), 4.6, 0.5, col); }
  wayfinding(world, M, S, u, n, at, B);
  // ---- trains: an F up top and a Q below, each stopping ~25 s then moving on (wall clock, 160 s cycle) ------------------------
  buildTrains(world, S, u, n, at);
  W.w8th = { lower: at(80, S.platIn + 1.5, S.LO.plat), upper: at(120, S.platIn + 1.5, S.UP.plat), street: at(40, oN, 0), bridge: W.aquariumBridge }; if (typeof window !== 'undefined' && window.__game) window.__game.w8th = W.w8th;
  (W.mapPOIs || (W.mapPOIs = [])).push({ name: 'W 8 ST – NY AQUARIUM STATION', x: at(L / 2, 0).x, z: at(L / 2, 0).z, kind: 'transit' });
}

// ---- wayfinding: hanging black signs (white Helvetica, route bullets, arrows) that say where the F, the exits, the Q and the
// Aquarium footbridge are, from wherever you stand; all of them one merged mesh on one 1024² canvas. Lamps under the canopies
// and the upper deck. Where each flight leaves from (a along the platforms): upper ↔ lower 110…122 (both sides), lower ↔ street
// 40…56 (both sides), footbridge a 150 off the lower south platform; the F stops on the north (−o) upper track only.
const ROWS = [
  ['↑', [], 'Exit  ·  Q trains  ·  NY Aquarium  ·  Surf Av'], ['↓', ['Q'], 'Stairs down  ·  Exit  ·  NY Aquarium  ·  Boardwalk'],
  ['', ['F'], 'No F service on this platform  —  F boards across the tracks (north side)'], ['↑', ['F'], 'F trains  ·  upper level  ·  Stillwell Av  ·  Neptune Av'],
  ['↑', ['F'], 'Stairs up to F trains'], ['↑', [], 'Exit  ·  W 8 St  ·  Surf Av  ·  Luna Park'], ['↓', [], 'Exit  ·  W 8 St  ·  Surf Av'],
  ['↑', [], 'Footbridge to NY Aquarium  ·  Boardwalk  ·  Beach'], ['↑', ['F', 'Q'], 'NY Aquarium footbridge  ·  F: north side, via the street'], ['zebra', [], ''],
];
function wayfinding(world, M, S, u, n, at, B) {
  const { scene } = world, RH = 96;
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const g = c.getContext('2d');
  ROWS.forEach(([arrow, bullets, text], r) => { const y = r * RH; g.fillStyle = '#0d0d0d'; g.fillRect(0, y, 1024, RH);
    if (arrow === 'zebra') { for (let k = 0; k < 16; k++) { g.fillStyle = k & 1 ? '#111' : '#f4f4f4'; g.fillRect(k * 64, y, 64, RH); } return; }
    g.fillStyle = '#fff'; g.fillRect(0, y + 6, 1024, 3); let x = 18; g.textBaseline = 'middle';
    if (arrow) { g.font = '700 58px Helvetica, Arial'; g.fillText(arrow, x, y + 54); x += 62; }
    for (const b of bullets) { g.fillStyle = b === 'F' ? '#ff6319' : '#fccc0a'; g.beginPath(); g.arc(x + 26, y + 52, 26, 0, 7); g.fill(); g.fillStyle = b === 'F' ? '#fff' : '#111'; g.font = '700 36px Helvetica, Arial'; g.textAlign = 'center'; g.fillText(b, x + 26, y + 54); g.textAlign = 'left'; x += 60; }
    g.fillStyle = '#fff'; let f = 40; do { g.font = `700 ${f}px Helvetica, Arial`; f -= 1; } while (g.measureText(text).width > 1000 - x && f > 20); g.fillText(text, x + 8, y + 54); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const geos = [], v0 = (r) => 1 - (r + 1) * RH / 1024;
  const put = (row, a, o, y, facing, w = 3.6) => {   // facing: 'a+' | 'a-' | 'in' (toward the tracks) ; a sign + its dark back
    const h = w * RH / 1024, pl = new THREE.PlaneGeometry(w, h), uv = pl.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setY(k, v0(row) + uv.getY(k) * RH / 1024);
    const nrm = facing === 'a+' ? [u.x, u.y] : facing === 'a-' ? [-u.x, -u.y] : [-Math.sign(o) * n.x, -Math.sign(o) * n.y];
    const p = at(a, o, y); pl.rotateY(Math.atan2(nrm[0], nrm[1])); pl.translate(p.x + nrm[0] * 0.03, p.y, p.z + nrm[1] * 0.03); geos.push(pl);
    const bk = new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.05); bk.rotateY(Math.atan2(nrm[0], nrm[1])); bk.translate(p.x, p.y, p.z); B.add('fascia', bk); };
  const oc = (sd) => sd * (S.platIn + S.platOut) / 2, rail = (sd) => sd * (S.platOut - 0.15);
  for (const sd of [-1, 1]) {
    const yU = S.UP.plat + 2.55, yL = S.LO.plat + 2.45;
    put(0, 80, oc(sd), yU, 'a-'); put(0, 165, oc(sd), yU, 'a+'); put(1, 120.8, rail(sd), S.UP.plat + 2.2, 'in');
    if (sd > 0) { put(2, 45, rail(sd), S.UP.plat + 2.2, 'in', 4.4); put(2, 95, rail(sd), S.UP.plat + 2.2, 'in', 4.4); put(2, 160, rail(sd), S.UP.plat + 2.2, 'in', 4.4); }
    put(4, 107.5, rail(sd), S.LO.plat + 2.3, 'in'); put(6, 54.8, rail(sd), S.LO.plat + 2.3, 'in');
    put(3, 80, oc(sd), yL, 'a-'); put(5, 80, oc(sd), yL, 'a+'); put(5, 20, oc(sd), yL, 'a-'); put(3, 140, oc(sd), yL, 'a+');
    if (sd > 0) { put(7, 150, rail(sd), S.LO.plat + 2.3, 'in'); put(7, 125, oc(sd) + 1.2, yL - 0.5, 'a-'); } else put(8, 150, rail(sd), S.LO.plat + 2.3, 'in', 4.2);
  }
  put(9, S.L / 2 + 6 + 3 * 18.4 - 1, rail(-1), S.UP.plat + 1.9, 'in', 1.0);   // the conductor's zebra board, mid-train
  const m = new THREE.Mesh(mergeGeos(geos), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.4, roughness: 0.6 })); m.name = 'w8Signs'; scene.add(m);
  // lamps: fluorescent fixtures under the upper canopies and the upper deck (over the Q platforms)
  if (!M.w8Lamp) { M.w8Lamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e2, emissiveIntensity: 1.3 }); M.surface.w8Lamp = 'metal'; }
  const sb = (a0, a1, o0, o1, y0, y1) => { const bx = new THREE.BoxGeometry(o1 - o0, y1 - y0, a1 - a0); bx.translate((o0 + o1) / 2, (y0 + y1) / 2, (a0 + a1) / 2); bx.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(n.x, 0, n.y), new THREE.Vector3(0, 1, 0), new THREE.Vector3(u.x, 0, u.y))); bx.translate(S.L * 0 + at(0, 0).x, 0, at(0, 0).z); B.add('w8Lamp', bx); };
  for (const sd of [-1, 1]) for (let a = 4; a < S.L - 2; a += 9) { sb(a, a + 1.4, oc(sd) - 0.12, oc(sd) + 0.12, S.UP.plat + 3.08, S.UP.plat + 3.16); sb(a + 4, a + 5.4, oc(sd) - 0.12, oc(sd) + 0.12, S.UP.bot - 0.12, S.UP.bot - 0.04); }
  B.flush({ shadow: false });
}
function mergeGeos(list) {
  const pos = [], nor = [], uv = [];
  for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0; pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return out;
}

function buildTrains(world, S, u, n, at) {
  const { scene, ctx } = world;
  const body = new THREE.BoxGeometry(3.0, 3.4, CAR - 0.3); body.translate(0, 2.05, 0);
  const win = new THREE.BoxGeometry(3.04, 1.0, CAR - 1.6); win.translate(0, 2.7, 0);
  const mk = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, 2 * NCAR); m.castShadow = true; m.frustumCulled = false; scene.add(m); return m; };
  const I = [mk(body, new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.35, metalness: 0.85 })), mk(win, new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff0c0, emissiveIntensity: 0.9 }))];
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(u.x, u.y)), one = new THREE.Vector3(1, 1, 1), m4 = new THREE.Matrix4();
  const T = [{ lv: S.LO, o: S.halfTrack, off: 80, k: 1 }];   // the Q below; the F upstairs is the rideable one (coney/subway.js)
  const CYC = 160, IN = 28, DW = 25, OUT = 28, STOP = S.L - 4, FAR = 190;   // along the elevated only (the Culver/Brighton alignment)
  const zero = new THREE.Vector3(0, 0, 0);
  world.updaters.push(() => {
    const t = Date.now() / 1000;
    for (const tr of T) {
      const ph = ((t + tr.off) % CYC + CYC) % CYC; let a;   // front of the train along a; arrives from the west (−a), leaves east
      if (ph < IN) { const e = 1 - (1 - ph / IN) ** 2; a = -FAR + (STOP + FAR) * e; } else if (ph < IN + DW) a = STOP; else if (ph < IN + DW + OUT) { const e = ((ph - IN - DW) / OUT) ** 2; a = STOP + FAR * e; } else a = null;
      for (let c = 0; c < NCAR; c++) { const p = at((a ?? 0) - CAR / 2 - c * CAR, tr.o, tr.lv.rail); m4.compose(p, q, a == null ? zero : one); for (const im of I) im.setMatrixAt(tr.k * NCAR + c, m4); }   // off the map between runs
      tr.a = a;
    }
    for (const im of I) im.instanceMatrix.needsUpdate = true;
  });
}
function sign(scene, text, p, yaw, w, h, col) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * h / w); const g = c.getContext('2d');
  g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#fff'; g.fillRect(0, 6, c.width, 4);
  g.fillStyle = col; g.beginPath(); g.arc(c.height * 0.55, c.height * 0.56, c.height * 0.34, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; let fs = Math.floor(c.height * 0.5); g.font = `700 ${fs}px Helvetica, Arial`; g.textBaseline = 'middle'; g.fillText(text, c.height * 1.1, c.height * 0.58);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.35, side: THREE.DoubleSide }));
  m.position.copy(p); m.rotation.y = yaw; scene.add(m);
}
