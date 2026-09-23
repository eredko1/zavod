// MAP: CONEY ISLAND — the amusement district, boardwalk and beach, 1:1 from an OSM plan (qa/tools/osm-coney.py) with hand-built
// landmarks to the reference photos (qa/refs/coney). Levels: streets / amusement area / boardwalk y = 0 · beach sand −1.3 → −2.4
// at the waterline (stairs every ~95 m) · pier deck 0 · wheel platform +0.6 · ballpark stands to +8. Owned by: CONEY agent.
import * as THREE from 'three';
import { makeConeyMats } from '../coney/mats.js';
import { buildSky } from '../sbu/sky.js';
import { buildCity } from '../coney/city.js';
import { buildHousing } from '../coney/housing.js';
import { buildShore, BW, sandHeight, waterZ, SAND_TOP } from '../coney/shore.js';
import { buildLandmarks, LM } from '../coney/landmarks.js';
import { buildBeachLife } from '../coney/life.js';
import { buildPark } from '../coney/park.js';
import { OSM, PLAY } from '../coney/osm.js';
import { bbox, segDist, pip } from '../osmkit.js';
import { Batch, boxGeo } from '../sbu/geo.js';

export const meta = {
  id: 'coney', name: 'CONEY ISLAND', subtitle: 'DAY OPS · BOARDWALK', time: 'day', weather: 'clear',
  description: 'Summer afternoon on the seaside amusement strip: the wonder wheel and the wooden coaster, the parachute tower, sideshow fronts, the plank boardwalk and a packed beach down to the surf.',
  grade: 'day', ambience: 'sbu-day', thumb: 'assets/thumbs/sbu.jpg',
};

export function build(world) {
  const { ctx, W } = world;
  W.bounds.set(new THREE.Vector3(PLAY.x0, -6, PLAY.z0), new THREE.Vector3(PLAY.x1, 90, PLAY.z1));
  const piers = OSM.pi.map((p) => bbox(p.p)).filter((q) => q.z1 > BW.z1 + 40 && q.z0 < BW.z1 + 20).map((q) => ({ x0: (q.x0 + q.x1) / 2 - 5.5, x1: (q.x0 + q.x1) / 2 + 5.5, z1: q.z1 }));
  W.groundHeight = (x, z) => {
    if (z <= BW.z1) return 0;
    for (const p of piers) if (x > p.x0 && x < p.x1 && z < p.z1) return 0;
    return sandHeight(x, z);
  };
  ctx.progress(0.13, 'coney: sky'); buildSky(world, { shadowHalf: 130, center: [0, 0, 0] });
  const M = makeConeyMats(world); world.mats = M;
  ctx.progress(0.15, 'coney: streets + blocks'); buildCity(world, M);
  ctx.progress(0.17, 'coney: luna park houses'); buildHousing(world, M);
  ctx.progress(0.19, 'coney: boardwalk + beach'); buildShore(world, M);
  ctx.progress(0.22, 'coney: rides + landmarks'); buildLandmarks(world, M);
  ctx.progress(0.23, 'coney: park'); buildPark(world, M);

  // poses by eye point + look-at target (yaw 0 = -z, yaw -pi/2 = +x)
  const look = (x, y, z, tx, ty, tz) => { const dx = tx - x, dy = ty - y, dz = tz - z; return [x, y, z, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))]; };
  const W0 = LM.wheel, PJ = LM.pj;
  W.poses = {
    spawn: look(-60, 0, 148, 60, 6, 120),                       // on the boardwalk looking east toward the wheel and the coasters
    hero: look(-10, 0, 150, 90, 14, 70),                         // boardwalk: wheel ahead-left, coaster beyond, beach right
    overview: look(-120, 70, 330, 0, 0, 20),                     // over the surf, whole strip from the ocean side
    wheel: look(W0.x + 30, 0, 150, W0.x, 24, W0.z),             // the wheel from the boardwalk
    coaster: look(240, 0, 150, 195, 16, 40),                     // the wooden coaster's timber lattice from the boardwalk
    parachute: look(-345, 0, 150, PJ.x, 45, PJ.z),               // the parachute tower from the boardwalk
    beach: look(-20, -1.5, 215, 20, 8, 100),                     // down on the sand, looking back at the boardwalk and the rides
    surf: look(-80, -2.2, 262, -300, 0, 262),                    // wet sand at the waterline, along the beach
    pier: look(-363, 0, 330, -300, 15, 120),                     // out on the pier looking back at the strip
    sideshow: look(20, 0, -100, 110, 4, -60),                    // the amusement strip street: shutters and painted banners
    surfave: look(-200, 0, -141, 40, 6, -112),                   // down the avenue: shop fronts, the terminal, the rides beyond
    terminal: look(-55, 0, -225, -55, 8, -270),                  // the terminal frontage + train shed
    ballpark: look(-250, 0, -128, -350, 12, -90),                // the ballpark's brick street wall and light towers from the avenue
    cyclone: look(222, 0, -72, 188, 14, 10),                     // the wooden coaster from the avenue at its north end
    rides: look(-30, 0, 60, 60, 6, 40),                          // inside the amusement park among the flat rides
    luna: look(195, 0, -118, 255, 28, -190),                      // the public-housing towers north of the avenue, from the lawn edge
  };
  // QA guard: a pose whose eye is inside a collider is walked backwards along its view line until it is in the open
  for (const [k, p] of Object.entries(W.poses)) {
    const inside = (x, y, z) => ctx.colliders.some((b) => x > b.min.x && x < b.max.x && y > b.min.y && y < b.max.y && z > b.min.z && z < b.max.z);
    const fx = -Math.sin(p[3]), fz = -Math.cos(p[3]); let d = 0;
    while (d < 60 && inside(p[0] - fx * d, p[1] + 1.6, p[2] - fz * d)) d += 1;
    if (d) { p[0] -= fx * (d + 1.5); p[2] -= fz * (d + 1.5); }
  }
  for (let x = PLAY.x0 + 10; x < PLAY.x1; x += 22) world.cover(x, BW.z1 - 2.8, 0, -1);
  ctx.progress(0.24, 'coney: crowds'); try { buildBeachLife(world, M); } catch (e) { console.warn('[coney] life', e); }
  ctx.progress(0.25, 'coney: spawns + bikes'); placeSpawnsBikesCover(world, M, piers);   // after every collider exists (city, housing, park, shore, life)

  W.surfaceAt = (p) => {
    if (p.z > BW.z1 && p.y < -0.5) return 'ground';
    if (p.z > BW.z0 && p.z < BW.z1 + 0.5) return 'wood';
    return 'concrete';
  };
}

// =====================================================================================================================
// SPAWNS · MOTORCYCLES · EXTRA COVER. Computed from the OSM plan and validated against the finished collider set (so it stays
// right when buildings / props move): spawns stand on walkable ground, capsule-free, ≥ 1.5 m from walls, reachable from the
// boardwalk (flood fill), with cover within 12 m; bikes are parked kerbside in the parking lane / in lots / at street ends on
// the boardwalk, never on sand, stairs, in buildings or ride fences. Deterministic (no rng) → identical on every client.
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function placeSpawnsBikesCover(world, M, piers) {
  const { ctx, W } = world; const gh = W.groundHeight; const t0 = performance.now();
  const onPier = (x, z) => z > BW.z1 && piers.some((p) => x > p.x0 + 0.8 && x < p.x1 - 0.8 && z < p.z1 - 2);
  beachCover(world, M, onPier);
  { // ballpark forecourt (open plaza between the avenue kerb and the street wall): a row of concrete planters with hedges
    const B = new Batch(world, M, 'forecourt'), BP = LM.ballpark;
    for (let x = BP.x0 + 22; x < BP.x1 - 10; x += 26) {
      const z = BP.z0 - 8, a = [x - 1.3, 0, z - 0.7], b = [x + 1.3, 0.85, z + 0.7];
      if (ctx.colliders.some((c) => c.min.x < b[0] + 1 && c.max.x > a[0] - 1 && c.min.z < b[2] + 1 && c.max.z > a[2] - 1 && c.max.y > 0.05 && c.min.y < 2)) continue;
      B.box('concreteGrey', a, b); B.box('hedge', [x - 1.2, 0.85, z - 0.6], [x + 1.2, 1.35, z + 0.6], { collide: false });
      world.cover(x, z - 1.3, 0, -1); world.cover(x, z + 1.3, 0, 1);
    }
    B.flush({ shadow: true });
  }

  // ---- collider index (8 m cells; the few huge slabs are tested directly) ------------------------------------------------
  const CELL = 8, grid = new Map(), big = []; const key = (i, j) => (i + 4096) * 8192 + (j + 4096);
  for (const b of ctx.colliders) {
    if (b.max.x - b.min.x > 160 || b.max.z - b.min.z > 160) { big.push(b); continue; }
    for (let i = Math.floor(b.min.x / CELL); i <= Math.floor(b.max.x / CELL); i++) for (let j = Math.floor(b.min.z / CELL); j <= Math.floor(b.max.z / CELL); j++) { const k = key(i, j), l = grid.get(k); if (l) l.push(b); else grid.set(k, [b]); }
  }
  const hit = (b, x0, z0, x1, z1, y0, y1) => b.min.x < x1 && b.max.x > x0 && b.min.z < z1 && b.max.z > z0 && b.min.y < y1 && b.max.y > y0;
  const blocked = (x0, z0, x1, z1, y0, y1) => {
    for (const b of big) if (hit(b, x0, z0, x1, z1, y0, y1)) return true;
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) { const l = grid.get(key(i, j)); if (l) for (const b of l) if (hit(b, x0, z0, x1, z1, y0, y1)) return true; }
    return false;
  };

  // ---- reachability: 1 m grid over the play area, cells blocked by anything standing above boardwalk level, flood from the boardwalk
  const NX = Math.ceil(PLAY.x1 - PLAY.x0), NZ = Math.ceil(PLAY.z1 - PLAY.z0), solid = new Uint8Array(NX * NZ), gy = new Float32Array(NX * NZ);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) gy[j * NX + i] = gh(PLAY.x0 + i + 0.5, PLAY.z0 + j + 0.5);
  for (const b of ctx.colliders) {
    const i0 = Math.max(0, Math.ceil(b.min.x - 0.3 - PLAY.x0 - 0.5)), i1 = Math.min(NX - 1, Math.floor(b.max.x + 0.3 - PLAY.x0 - 0.5));
    const j0 = Math.max(0, Math.ceil(b.min.z - 0.3 - PLAY.z0 - 0.5)), j1 = Math.min(NZ - 1, Math.floor(b.max.z + 0.3 - PLAY.z0 - 0.5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * NX + i, g = gy[k]; if (b.min.y < g + 1.6 && b.max.y > Math.max(g + 0.5, 0.3)) solid[k] = 1; }
  }
  const reach = new Uint8Array(NX * NZ); {
    const q = new Int32Array(NX * NZ); let h = 0, t = 0; let s = (BW.z0 + 12 - PLAY.z0 | 0) * NX + (0 - PLAY.x0 | 0);
    while (solid[s]) s++; q[t++] = s; reach[s] = 1;
    while (h < t) { const k = q[h++], i = k % NX; for (const n of [i > 0 ? k - 1 : -1, i < NX - 1 ? k + 1 : -1, k - NX, k + NX]) if (n >= 0 && n < NX * NZ && !reach[n] && !solid[n]) { reach[n] = 1; q[t++] = n; } }
  }
  const reachable = (x, z) => { const i = Math.floor(x - PLAY.x0), j = Math.floor(z - PLAY.z0); return i >= 0 && j >= 0 && i < NX && j < NZ && reach[j * NX + i] === 1; };

  // ---- road geometry -----------------------------------------------------------------------------------------------------
  const surf = OSM.r.filter((r) => r.w >= 20), streets = OSM.r.filter((r) => r.w >= 9 && r.w < 20);
  const avePts = surf.flatMap((r) => r.p).filter((p) => p[0] > PLAY.x0 - 60 && p[0] < PLAY.x1 + 60).sort((a, b) => a[0] - b[0]);
  const zAve = (x) => { for (let i = 0; i + 1 < avePts.length; i++) { const [ax, az] = avePts[i], [bx, bz] = avePts[i + 1]; if (x >= ax && x <= bx) return bx - ax < 1e-3 ? az : az + (bz - az) * (x - ax) / (bx - ax); } return x < avePts[0][0] ? avePts[0][1] : avePts[avePts.length - 1][1]; };
  const dSet = (x, z, set) => { let d = 1e9; for (const r of set) d = Math.min(d, segDist(x, z, r.p) - r.w / 2); return d; };   // distance to the kerb (negative = in the carriageway)
  const BP = LM.ballpark;
  const areaOf = (x, z) => {
    if (z > BW.z1) return onPier(x, z) ? 'pier' : 'beach';
    if (z >= BW.z0 - 1) return 'boardwalk';
    const za = zAve(x);
    if (x > BP.x0 && x < BP.x1 && z > za + 11.5 && z < BP.z0) return 'ballpark';
    if (dSet(x, z, surf) < 5) return 'surfave';
    if (dSet(x, z, streets) < 4) return 'street';
    return z > za ? 'park' : 'north';
  };

  // ---- motorcycles -------------------------------------------------------------------------------------------------------
  const bikes = [];
  const bikeOK = (x, z, ux, uz, ownRoad = null) => {
    if (z > BW.z1 - 1.2 || x < PLAY.x0 + 4 || x > PLAY.x1 - 4 || z < PLAY.z0 + 4) return false;   // never on the sand / at the map edge
    const y = gh(x, z), rx = -uz, rz = ux;
    for (let a = -1.2; a <= 1.2001; a += 0.3) for (let b = -0.5; b <= 0.5001; b += 0.25) { const px = x + ux * a + rx * b, pz = z + uz * a + rz * b; if (blocked(px - 0.02, pz - 0.02, px + 0.02, pz + 0.02, y + 0.15, y + 1.2) || !reachable(px, pz)) return false; }
    if (ownRoad && streets.concat(surf).some((r) => r !== ownRoad && segDist(x, z, r.p) < r.w / 2 + 2)) return false;   // not across a junction mouth
    return !bikes.some((b) => Math.hypot(b.x - x, b.z - z) < 2.6);
  };
  const nearestOn = (x, z, set) => { let best = null; for (const r of set) for (let i = 0; i + 1 < r.p.length; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 1) continue; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (L * L))); const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz); if (!best || d < best.d) best = { d, px, pz, ux: dx / L, uz: dz / L, r }; } return best; };
  // kerbside group: n bikes parallel to the kerb, centred w/2 − 1.2 m off the centreline (parking lane), 1.2 m gaps (3.3 m centres),
  // heading with the traffic on that side (right-hand traffic); slides along the kerb until the whole group fits between cars/poles
  const kerbGroup = (set, ax, az, hint, n, tag) => {
    for (let s = 0; s <= 60; s = s > 0 ? -s : -s + 1.5) {
      const L0 = nearestOn(ax, az, set); if (!L0) return 0; const L = nearestOn(ax + L0.ux * s, az + L0.uz * s, set);
      let nx = -L.uz, nz = L.ux; if (nx * hint[0] + nz * hint[1] < 0) { nx = -nx; nz = -nz; }
      let ux = L.ux, uz = L.uz; if (-uz * nx + ux * nz < 0) { ux = -ux; uz = -uz; }                  // kerb on the rider's right
      const off = L.r.w / 2 - 1.2, bx = L.px + nx * off, bz = L.pz + nz * off, pts = [];
      for (let k = 0; k < n; k++) { const x = bx + ux * 3.3 * (k - (n - 1) / 2), z = bz + uz * 3.3 * (k - (n - 1) / 2); if (!bikeOK(x, z, ux, uz, L.r)) break; pts.push([x, z]); }
      if (pts.length === n) { for (const [x, z] of pts) bikes.push({ x, z, y: gh(x, z), yaw: Math.atan2(-ux, -uz), tag }); return n; }
    }
    return 0;
  };
  // free spot near a point (lots, boardwalk street ends): spiral out, fixed heading
  const nearSpot = (ax, az, yaw, tag, inside = null) => {
    const ux = -Math.sin(yaw), uz = -Math.cos(yaw);
    for (let r = 0; r < 30; r += 1) for (let a = 0; a < (r ? 12 : 1); a++) { const x = ax + Math.cos(a / 12 * Math.PI * 2) * r, z = az + Math.sin(a / 12 * Math.PI * 2) * r; if (inside && !pip(x, z, inside)) continue; if (bikeOK(x, z, ux, uz)) { bikes.push({ x, z, y: gh(x, z), yaw, tag }); return 1; } }
    return 0;
  };
  const E = -Math.PI / 2, WEST = Math.PI / 2;
  kerbGroup(surf, -110, -128, [0, 1], 3, 'surfave');      // Surf Ave south kerb outside the hot-dog stand (Stillwell corner)
  kerbGroup(surf, 25, -112, [0, 1], 2, 'surfave');        // south kerb by the sideshow strip
  kerbGroup(surf, -330, -136, [0, 1], 2, 'surfave');      // ballpark side of the avenue
  kerbGroup(streets, 38, -60, [1, 0], 2, 'street');       // side street down to the boardwalk (east kerb)
  const lotNear = (x, z) => OSM.l.find((p) => pip(x, z, p));
  { const l = lotNear(20, -214); if (l) { const q = bbox(l); nearSpot(q.x0 + 4, (q.z0 + q.z1) / 2, E, 'lot', l); } }
  { const l = lotNear(-154, -185); if (l) { const q = bbox(l); nearSpot(q.x1 - 4, q.z0 + 6, WEST, 'lot', l); } }
  nearSpot(12, BW.z0 + 2.5, E, 'boardwalk');              // boardwalk at the foot of the side street (inland edge)
  nearSpot(-178, BW.z1 - 4.5, WEST, 'boardwalk');         // beside the beach stairs head
  W.vehicleSpots = bikes.map(({ x, y, z, yaw }) => ({ x, y, z, yaw })); W.vehicleMax = bikes.length;

  // ---- spawns ------------------------------------------------------------------------------------------------------------
  const cover = W.coverPoints, cgrid = new Map();   // cover points bucketed by 12 m cell
  for (const c of cover) { const k = key(Math.floor(c.position.x / 12), Math.floor(c.position.z / 12)); const l = cgrid.get(k); if (l) l.push(c); else cgrid.set(k, [c]); }
  const coverNear = (x, y, z) => { const i0 = Math.floor(x / 12), j0 = Math.floor(z / 12); for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (const c of cgrid.get(key(i, j)) || []) if (Math.abs(c.position.y - y) < 3 && Math.hypot(c.position.x - x, c.position.z - z) < 12) return true; return false; };
  const spawnY = (x, z) => {
    if (x < PLAY.x0 + 14 || x > PLAY.x1 - 14 || z < PLAY.z0 + 16 || z > PLAY.z1 - 8) return null;                 // not hugging the map edge
    if (z > BW.z1 && !onPier(x, z) && (z < BW.z1 + 6 || z > waterZ(x) - 6)) return null;              // not at the bulkhead foot, not in the surf
    const y = gh(x, z);
    if (blocked(x - 0.4, z - 0.4, x + 0.4, z + 0.4, y + 0.05, y + 1.7)) return null;                     // standing capsule (1.6 m + head room)
    if (blocked(x - 1.9, z - 1.9, x + 1.9, z + 1.9, y + 1.2, y + 4)) return null;                          // ≥ 1.5 m from any wall / tall prop
    if (!reachable(x, z) || bikes.some((b) => Math.hypot(b.x - x, b.z - z) < 3.5)) return null;
    if (!coverNear(x, y, z)) return null;
    return y;
  };
  // the AI nav grid (src/ai/nav.js) is capped to a 500 m window centred on W.bounds: enemies must spawn inside it and players
  // should too (so waves can reach them) — only the pier, the one real area outside it, keeps a player spawn near its root
  const bb = W.bounds, bcx = (bb.min.x + bb.max.x) / 2, bcz = (bb.min.z + bb.max.z) / 2, half = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) > 500 ? 250 : 1e9;
  const inNav = (x, z, m) => x > Math.max(bb.min.x, bcx - half) + m && x < Math.min(bb.max.x, bcx + half) - m && z > Math.max(bb.min.z, bcz - half) + m && z < Math.min(bb.max.z, bcz + half) - m;
  const cands = {};
  for (let z = PLAY.z0 + 6; z < PLAY.z1 - 5; z += 4) for (let x = PLAY.x0 + 6; x < PLAY.x1 - 5; x += 4) {
    const a = areaOf(x, z); if (a === 'pier' ? (z > BW.z1 + 70 || !inNav(x, z, -40)) : !inNav(x, z, 6)) continue;
    const y = spawnY(x, z); if (y === null) continue;
    (cands[a] || (cands[a] = [])).push(new THREE.Vector3(x, y, z));
  }
  const QUOTA = { boardwalk: [3, 5], park: [2, 6], surfave: [2, 4], street: [2, 4], beach: [2, 4], pier: [1, 0], ballpark: [1, 2], north: [1, 5] };
  // farthest-point sampling: each pick maximises its distance to everything already chosen (all areas) → even spread
  const fps = (pool, n, chosen, ok) => { const out = []; for (let k = 0; k < n; k++) { let best = null, bd = -1; for (const c of pool) { if (out.includes(c) || !ok(c)) continue; let d = 1e9; for (const o of chosen) d = Math.min(d, dist2(o, c)); for (const o of out) d = Math.min(d, dist2(o, c)); if (d > bd) { bd = d; best = c; } } if (!best) break; out.push(best); } return out; };
  const players = [], enemies = [], stat = {};
  for (const [a, [np]] of Object.entries(QUOTA)) { const got = fps(cands[a] || [], np, players, () => true); players.push(...got); stat[a] = { cand: (cands[a] || []).length, p: got.length, e: 0 }; }
  for (const minP of [35, 25, 12]) {
    for (const [a, [, ne]] of Object.entries(QUOTA)) { const need = ne - stat[a].e; if (need <= 0) continue; const got = fps(cands[a] || [], need, [...players, ...enemies], (c) => !enemies.includes(c) && players.every((p) => dist2(p, c) >= minP)); enemies.push(...got); stat[a].e += got.length; }
    if (enemies.length >= 24) break;
  }
  W.playerSpawns = players.map((v) => v.clone()); W.enemySpawns = enemies.map((v) => v.clone());
  for (const b of bikes) { const a = b.tag; (stat[a] || (stat[a] = { cand: 0, p: 0, e: 0 })).b = (stat[a].b || 0) + 1; }
  const minPE = Math.min(...enemies.map((e) => Math.min(...players.map((p) => dist2(p, e)))));
  const rows = Object.entries(stat).map(([a, s]) => `${a.padEnd(10)} cand ${String(s.cand).padStart(4)}  player ${s.p}  enemy ${s.e}  bikes ${s.b || 0}`);
  console.info(`[coney] spawns ${players.length}p/${enemies.length}e (min player→enemy ${minPE.toFixed(0)} m) · bikes ${bikes.length} · cover ${cover.length} · ${(performance.now() - t0).toFixed(0)} ms\n` + rows.join('\n'));
  W.spawnStats = { stat, minPE, bikes: bikes.map((b) => ({ ...b })) };
}

/** Beach cover (the sand was an open killing field): an upturned lifeguard rowboat hauled up beside every lifeguard chair (NYC
 *  Parks keeps one at each stand) and clusters of steel trash barrels in the mid-beach, each a crouch-height collider + cover. */
function beachCover(world, M, onPier) {
  const B = new Batch(world, M, 'beachCover');
  const put = (key, a, b) => B.box(key, a, b, { collide: false, uv: false });
  for (let x = PLAY.x0 + 40; x < PLAY.x1; x += 120) {
    const bx = x + 5.5, bz = waterZ(x) - 23; if (onPier(bx, bz) || onPier(bx - 3, bz) || onPier(bx + 3, bz)) continue;
    const y = sandHeight(bx, bz) - 0.08;
    put('coasterWhite', [bx - 2.2, y, bz - 0.72], [bx + 1.9, y + 0.45, bz + 0.72]);          // hull (bottom up): topsides
    put('coasterWhite', [bx - 2.1, y + 0.45, bz - 0.5], [bx + 1.7, y + 0.64, bz + 0.5]);     // turn of the bilge
    for (let i = 0; i < 3; i++) put('coasterWhite', [bx + 1.9 + i * 0.3, y + 0.05 * i, bz - 0.6 + i * 0.18], [bx + 2.2 + i * 0.3, y + 0.45 + 0.08 * i, bz + 0.6 - i * 0.18]);   // tapering bow
    put('coasterRed', [bx - 2.24, y + 0.04, bz - 0.76], [bx + 1.92, y + 0.2, bz + 0.76]);    // gunwale band
    put('steelDark', [bx - 2.25, y + 0.64, bz - 0.06], [bx + 2.8, y + 0.72, bz + 0.06]);     // keel strip
    for (const s of [-0.9, 0.9]) put('planksDark', [bx + s - 0.1, y, bz - 1.1], [bx + s + 0.1, y + 0.08, bz + 1.1]);   // oars under it
    world.box([bx - 2.3, y - 0.3, bz - 0.76], [bx + 2.8, y + 0.7, bz + 0.76]);
    world.cover(bx, bz - 1.5, 0, -1, y + 0.08); world.cover(bx, bz + 1.5, 0, 1, y + 0.08);
  }
  for (let x = PLAY.x0 + 25, k = 0; x < PLAY.x1 - 10; x += 55, k++) {
    const cz = BW.z1 + 28 + (k % 3) * 11; if (onPier(x, cz) || onPier(x - 6, cz) || onPier(x + 6, cz)) continue;
    const y = sandHeight(x, cz) - 0.05;
    for (const [dx, dz] of [[-0.45, -0.3], [0.45, -0.3], [0, 0.45]]) B.cyl(k % 2 ? 'binGreen' : 'binBlue', x + dx, cz + dz, y, y + 0.95, 0.33, 12);
    world.box([x - 0.8, y - 0.2, cz - 0.65], [x + 0.8, y + 0.95, cz + 0.8]);
    world.cover(x, cz - 1.4, 0, -1, y + 0.05); world.cover(x, cz + 1.6, 0, 1, y + 0.05);
  }
  B.flush({ shadow: true });
}
