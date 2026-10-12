// CONEY realism pass (the Apple Maps 3D look): the W 8 St lots get their real tenants (the DMV office and the firehouse,
// placed in the lots by the station; fences, stall paint and light poles; city.js parks cars round them), Coney Island Creek
// north of the yard (water, mud banks, reeds, the mowed marsh field), the Asser Levy Park playground (rubber surfacing,
// a play structure with slides and a climbing net, swings, benches, a fence; all solid) and the street furniture
// (hydrants, meters, bins, manholes) along the play-area avenues. One Batch: every material key merges into one draw. CONEY agent.
import * as THREE from 'three';
import { Batch, boxGeo } from '../sbu/geo.js';
import { OSM, PLAY } from './osm.js';
import { ribbon, walk, pip, bbox, segDist, segDist1 } from '../osmkit.js';
import { roofKit } from '../sbu/buildings.js';

// ---- W 8 St: the lots north of the station between the avenue and the Belt -------------------------------------------------
const W8_ZONE = { x0: 280, x1: 520, z0: -470, z1: -140 };
const W8_LINE = [[334, -222], [388, -473]];   // W 8 St centreline (between its two OSM carriageways)
const SITES = [{ kind: 'dmv', w: 36, d: 22, h: 5.2 }, { kind: 'fire', w: 18, d: 22, h: 8.6 }];
const inZone = (q) => q.x1 > W8_ZONE.x0 && q.x0 < W8_ZONE.x1 && q.z1 > W8_ZONE.z0 && q.z0 < W8_ZONE.z1;
export const w8Lots = () => OSM.l.filter((p) => { const q = bbox(p); return inZone(q) && (q.z0 + q.z1) / 2 < W8_ZONE.z1 - 20; });   // not the aquarium lot on Surf Av
let sitesCache = null;
/** the DMV and the firehouse: rects inside the W 8 St lots, clear of streets and buildings, nearest W 8 St. Pure (OSM only) so
 *  city.js can keep its parked cars out of them before this module builds them */
export function w8Sites() {
  if (sitesCache) return sitesCache;
  const lots = w8Lots(), taken = OSM.b.map((b) => bbox(b.p)), out = [];
  const roads = OSM.r.filter((r) => r.w >= 9);
  const clear = (r) => !taken.some((q) => r.x0 < q.x1 + 3 && r.x1 > q.x0 - 3 && r.z0 < q.z1 + 3 && r.z1 > q.z0 - 3)
    && !roads.some((rd) => [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1], [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2]].some(([x, z]) => segDist(x, z, rd.p) < rd.w / 2 + 3));
  for (const s of SITES) {
    let best = null;
    for (const lot of lots) { const q = bbox(lot);
      for (let x = q.x0; x + s.w <= q.x1; x += 2) for (let z = q.z0; z + s.d <= q.z1; z += 2) {
        const r = { x0: x, x1: x + s.w, z0: z, z1: z + s.d };
        if (![[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]].every(([a, b]) => pip(a, b, lot)) || !clear(r)) continue;
        const d = segDist1((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, ...W8_LINE[0], ...W8_LINE[1]);
        if (!best || d < best.d) best = { ...s, ...r, d, lot };
      } }
    if (best) { out.push(best); taken.push(best); }
  }
  return (sitesCache = out);
}
export const inW8Site = (x, z, m = 0) => w8Sites().some((r) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m);

// ---- Coney Island Creek: west of the yard (coney/yard.js), north of the Neptune Av blocks ---------------------------------
export const CREEK = [[-820, -1000], [-560, -905], [-306, -827], [-150, -776], [-50, -748]];
const CREEK_HALF = 16, CREEK_BANK = 9;
export const FIELD = { x0: -200, x1: -24, z0: -1000, z1: -796 };   // the mowed marsh field across the water
/** the creek, its banks and the field: horizon.js keeps its rowhouse sprawl out of here */
export const inCreek = (x, z, m = 0) => (x > -840 - m && x < -20 + m && z < -700 + m && segDist(x, z, CREEK) < CREEK_HALF + CREEK_BANK + 20 + m) || (x > FIELD.x0 - m && x < FIELD.x1 + m && z > FIELD.z0 - m && z < FIELD.z1 + m);

export function buildRealism(world, M) {
  const { ctx, R } = world, lite = !!ctx.lite;
  const S = new Batch(world, M, 'realism'), G = [1, 2, 3].map((r) => Object.assign(new Batch(world, M, 'realismGround' + r), { rank: r }));
  const fenceRun = (pts, h, gapNear) => {   // chain-link: posts every 3 m, top rail, mesh panel; AABB collider cells along it
    for (let i = 0; i + 1 < pts.length; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 0.5) continue;
      const n = Math.max(1, Math.ceil(L / 3));
      for (let k = 0; k < n; k++) { const t0 = k / n, t1 = (k + 1) / n, x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
        if (gapNear && gapNear((x0 + x1) / 2, (z0 + z1) / 2)) continue;
        const a = Math.atan2(z1 - z0, x1 - x0), l = Math.hypot(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        const panel = boxGeo([-l / 2, 0.05, -0.02], [l / 2, h, 0.02]); panel.rotateY(-a); panel.translate(cx, 0, cz); S.add('fenceMesh', panel, { uv: false });
        const rail = boxGeo([-l / 2, h - 0.05, -0.03], [l / 2, h, 0.03]); rail.rotateY(-a); rail.translate(cx, 0, cz); S.add('galv', rail);
        S.cyl('galv', x0, z0, 0, h + 0.05, 0.04, 6);
        world.box([Math.min(x0, x1) - 0.08, 0, Math.min(z0, z1) - 0.08], [Math.max(x0, x1) + 0.08, h, Math.max(z0, z1) + 0.08]);
      } } };
  if (!M.fenceMesh) {   // chain-link: a see-through diamond weave (alpha-tested, one shared material)
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.strokeStyle = 'rgba(180,184,186,1)'; g.lineWidth = 3;
    for (let k = -64; k < 128; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 64, 64); g.stroke(); g.beginPath(); g.moveTo(k + 64, 0); g.lineTo(k, 64); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(1, 1);
    M.fenceMesh = new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, transparent: false }); M.fenceMesh.name = 'fenceMesh'; M.surface.fenceMesh = 'metal'; (M.noShadow || (M.noShadow = {})).fenceMesh = true;
  }
  const ok = (name, fn) => { try { fn(); } catch (e) { console.warn('[realism] ' + name, e); } };
  ok('w8', () => w8th(world, M, S, G, fenceRun));
  ok('creek', () => creek(world, M, S, G, lite));
  ok('playground', () => playground(world, M, S, G, fenceRun));
  if (!lite) ok('street', () => streetDetail(world, M, S));   // phones: draw-call budget (qa/sweep.mjs), the avenues keep city.js's kit
  S.flush({ shadow: !lite });
  for (const B of G) for (const m of B.flush({ shadow: false })) { const rank = B.rank + 7; let prev = null;   // above city.js's 7 ground layers
    m.onBeforeRender = (_r, _s, _c, _g, mt) => { prev = [mt.polygonOffset, mt.polygonOffsetFactor, mt.polygonOffsetUnits]; mt.polygonOffset = true; mt.polygonOffsetFactor = -rank; mt.polygonOffsetUnits = -2 * rank; };
    m.onAfterRender = (_r, _s, _c, _g, mt) => { if (prev) [mt.polygonOffset, mt.polygonOffsetFactor, mt.polygonOffsetUnits] = prev; }; }
  (world.W.mapPOIs || (world.W.mapPOIs = [])).push(...w8Sites().map((s) => ({ name: s.kind === 'dmv' ? 'DMV' : 'FDNY ENGINE 245', x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2, kind: 'landmark' })));
}

/** sign board texture: one canvas per sign (two signs, tiny) */
function signMat(text, bg, fg) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 64; const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, 512, 64);
  g.fillStyle = fg; g.font = 'bold 40px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
}

function w8th(world, M, S, G, fenceRun) {
  const { scene } = world, sites = w8Sites(), signs = [];
  for (const s of sites) {
    const { x0, x1, z0, z1, h } = s;
    // which side faces W 8 St: the long face nearest the street line
    const faces = [['w', x0, (z0 + z1) / 2], ['e', x1, (z0 + z1) / 2], ['n', (x0 + x1) / 2, z0], ['s', (x0 + x1) / 2, z1]].map(([f, x, z]) => [f, segDist1(x, z, ...W8_LINE[0], ...W8_LINE[1])]).sort((a, b) => a[1] - b[1]);
    const f = faces[0][0], along = f === 'w' || f === 'e' ? 'z' : 'x', fc = f === 'w' ? x0 : f === 'e' ? x1 : f === 'n' ? z0 : z1, out = f === 'w' || f === 'n' ? -1 : 1;
    const a0 = along === 'z' ? z0 : x0, a1 = along === 'z' ? z1 : x1;
    const slab = (u0, u1, y0, y1, d0, d1, key, opt = { collide: false }) => along === 'z' ? S.box(key, [Math.min(fc + out * d0, fc + out * d1), y0, u0], [Math.max(fc + out * d0, fc + out * d1), y1, u1], opt) : S.box(key, [u0, y0, Math.min(fc + out * d0, fc + out * d1)], [u1, y1, Math.max(fc + out * d0, fc + out * d1)], opt);
    if (s.kind === 'fire') {   // two-storey red brick firehouse: two red roll-up bays, limestone band, the company sign
      S.box('brickRed', [x0, 0, z0], [x1, h, z1]);
      const bw = (a1 - a0 - 3) / 2;
      for (let k = 0; k < 2; k++) { const u0 = a0 + 1 + k * (bw + 1), u1 = u0 + bw; slab(u0, u1, 0, 4.2, 0, 0.06, 'red'); for (let y = 0.4; y < 4.1; y += 0.35) slab(u0, u1, y, y + 0.04, 0.06, 0.09, 'corniceDark'); }
      slab(a0, a1, 4.6, 5.0, 0, 0.12, 'graniteCap');
      for (let u = a0 + 1.5; u < a1 - 1; u += 3) slab(u, u + 1.4, 5.6, 7.6, 0, 0.04, 'glassDark');
      slab(a0, a1, h, h + 0.5, -0.1, 0.15, 'graniteCap');
      signs.push({ text: 'ENGINE 245  LADDER 161', bg: '#f4f1e6', fg: '#8a1b14', s, along, fc, out, a0, a1, y: 4.25 });
      // apron: concrete in front of the bays (the rigs pull straight out onto W 8 St)
      if (along === 'z') G[1].poly('concreteGrey', [[fc, a0], [fc + out * 9, a0], [fc + out * 9, a1], [fc, a1]], 0.05); else G[1].poly('concreteGrey', [[a0, fc], [a1, fc], [a1, fc + out * 9], [a0, fc + out * 9]], 0.05);
    } else {                  // one-storey state office: tan block, a glass entry band, blue sign band, flat roof
      S.box('stuccoTaupe', [x0, 0, z0], [x1, h, z1]);
      slab(a0 + 3, a1 - 3, 0.2, 2.9, 0, 0.06, 'glassDark'); for (let u = a0 + 3; u <= a1 - 3; u += 2.5) slab(u - 0.06, u + 0.06, 0.2, 2.9, 0.06, 0.1, 'darkMullion');
      slab(a0 + 2, a1 - 2, 3.0, 3.25, 0, 1.6, 'fascia');   // entry canopy
      signs.push({ text: 'NYS DMV  ·  DEPT OF MOTOR VEHICLES', bg: '#123e7c', fg: '#ffffff', s, along, fc, out, a0, a1, y: 3.6 });
    }
    roofKit(S, x0, z0, x1, z1, s.kind === 'fire' ? h + 0.5 : h, 'roof', world.R, s.kind === 'fire' ? 2 : 4);
  }
  // signs: one mesh per sign (two)
  for (const g of signs) { const L = Math.min(g.a1 - g.a0 - 2, 16), mid = (g.a0 + g.a1) / 2, p = new THREE.PlaneGeometry(L, L / 8);
    const m = new THREE.Mesh(p, signMat(g.text, g.bg, g.fg)); m.name = 'realism:sign';
    if (g.along === 'z') { m.position.set(g.fc + g.out * 0.14, g.y + L / 16, mid); m.rotation.y = g.out * Math.PI / 2; } else { m.position.set(mid, g.y + L / 16, g.fc + g.out * 0.14); m.rotation.y = g.out > 0 ? 0 : Math.PI; }
    scene.add(m); }
  // the lots: chain-link round the sides off the street, stall paint, light poles
  const roads = OSM.r.filter((r) => r.w >= 9), nearRoad = (x, z) => roads.some((r) => segDist(x, z, r.p) < r.w / 2 + 7) || inW8Site(x, z, 2);
  for (const lot of w8Lots()) {
    fenceRun([...lot, lot[0]], 1.9, nearRoad);
    const q = bbox(lot);
    for (let x = q.x0 + 3; x < q.x1 - 3; x += 2.8) for (let z = q.z0 + 4; z < q.z1 - 3; z += 7) {   // the same grid city.js parks its cars on
      if (!pip(x - 1.4, z, lot) || !pip(x + 1.4, z, lot) || inW8Site(x, z, 3)) continue;
      G[2].add('paint', boxGeo([x - 1.45, 0.05, z - 2.5], [x - 1.35, 0.055, z + 2.5]), { uv: false });
    }
    for (let x = q.x0 + 12; x < q.x1 - 6; x += 30) for (let z = q.z0 + 10; z < q.z1 - 6; z += 30) {   // cobra-head light poles
      if (!pip(x, z, lot) || inW8Site(x, z, 4)) continue;
      S.cyl('galv', x, z, 0, 9, 0.12, 8, { collide: true }); S.box('galv', [x - 0.06, 8.8, z - 0.06], [x + 1.6, 8.95, z + 0.06], { collide: false }); S.box('lampHead', [x + 1.1, 8.6, z - 0.25], [x + 1.9, 8.85, z + 0.25], { collide: false });
    }
  }
}

function creek(world, M, S, G, lite) {
  const { R } = world;
  const bank = ribbon(CREEK, (CREEK_HALF + CREEK_BANK) * 2, 0.04); if (bank) G[0].add('mud', bank, { uvScale: 1 / 4 });
  const reedLine = ribbon(CREEK, (CREEK_HALF + 2.5) * 2, 0.045); if (reedLine) G[1].add('grass', reedLine, { uvScale: 1 / 4 });
  const water = ribbon(CREEK, CREEK_HALF * 2, 0.05); if (water) G[2].add('water', water, { uvScale: 1 / 8 });
  // rounded head of the basin at the yard end
  { const [ex, ez] = CREEK[CREEK.length - 1], pts = []; for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI * 2; pts.push([ex + Math.cos(a) * CREEK_HALF, ez + Math.sin(a) * CREEK_HALF]); } G[2].poly('water', pts, 0.05); }
  // the field: mowed grass with worn dirt tracks crossing it (the reference's pale paths)
  const F = FIELD; G[0].poly('grass', [[F.x0, F.z0], [F.x1, F.z0], [F.x1, F.z1], [F.x0, F.z1]], 0.04);
  for (const p of [[[F.x0 + 10, F.z1 - 6], [F.x1 - 30, F.z0 + 40]], [[F.x0 + 40, F.z0 + 8], [F.x1 - 8, F.z1 - 40]], [[F.x0 + 6, F.z0 + 90], [F.x1 - 6, F.z0 + 70]]]) { const g = ribbon(p, 2.2, 0.05); if (g) G[1].add('mulch', g, { uvScale: 1 / 3 }); }
  // reeds: clumps of thin blades along both banks (one merged mesh, no colliders; none on phones: draw-call budget)
  const roads = OSM.r.filter((r) => r.w >= 6), onRoad = (x, z, m) => roads.some((r) => segDist(x, z, r.p) < r.w / 2 + m);
  if (!M.reed) { M.reed = new THREE.MeshLambertMaterial({ color: 0x8a9a5a, side: THREE.DoubleSide }); M.reed.name = 'reed'; M.surface.reed = 'grass'; }
  const blade = (x, z, h, a) => { const g = new THREE.PlaneGeometry(0.5, h, 1, 1); g.translate(0, h / 2, 0); g.rotateY(a); g.translate(x, 0, z); return g; };
  if (!lite) walk(CREEK, 1.6, (x, z, dx, dz) => { for (const sd of [-1, 1]) { const o = CREEK_HALF + 0.5 + R() * 2.2, px = x - dz * sd * o, pz = z + dx * sd * o; if (onRoad(px, pz, 2)) continue;
    for (let k = 0; k < 3; k++) S.add('reed', blade(px + (R() - 0.5) * 1.2, pz + (R() - 0.5) * 1.2, 1.2 + R() * 1.0, R() * 3.14), { uv: false }); } });
  // bank guard: a low timber kerb + colliders on both banks so nobody walks out onto the water (gaps where a street bridges it)
  walk(CREEK, 3, (x, z, dx, dz) => { for (const sd of [-1, 1]) { const o = CREEK_HALF + 0.3, px = x - dz * sd * o, pz = z + dx * sd * o; if (onRoad(px, pz, 3)) continue;
    world.box([px - 1.6, 0, pz - 1.6], [px + 1.6, 1.1, pz + 1.6]); } });
}

function playground(world, M, S, G, fenceRun) {
  // Asser Levy Park: the big OSM park east of the aquarium; the playground goes in its east half, clear of streets and buildings
  const park = OSM.pk.map((p) => ({ p, q: bbox(p) })).find(({ q }) => q.x0 > 500 && q.x1 > 850 && q.z0 < 0 && q.z1 > 40); if (!park) return;
  const W = 28, D = 20, roads = OSM.r.filter((r) => r.w >= 5), taken = OSM.b.map((b) => bbox(b.p)), cols = world.ctx.colliders;
  let at = null;
  for (let x = park.q.x1 - W - 4; x > park.q.x0 && !at; x -= 3) for (let z = park.q.z0 + 4; z + D < park.q.z1 && !at; z += 3) {
    const r = { x0: x, x1: x + W, z0: z, z1: z + D }, pts = [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1], [x + W / 2, z + D / 2]];
    if (!pts.every(([a, b]) => pip(a, b, park.p))) continue;
    if (pts.some(([a, b]) => roads.some((rd) => segDist(a, b, rd.p) < rd.w / 2 + 3)) || taken.some((q) => r.x0 < q.x1 + 2 && r.x1 > q.x0 - 2 && r.z0 < q.z1 + 2 && r.z1 > q.z0 - 2)) continue;
    if (cols.some((b) => b.max.y > 0.3 && b.min.x < r.x1 && b.max.x > r.x0 && b.min.z < r.z1 && b.max.z > r.z0)) continue;
    at = r;
  }
  if (!at) { console.warn('[realism] no room for the Asser Levy playground'); return; }
  const { x0, x1, z0, z1 } = at, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  G[1].poly('terracotta', [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], 0.05);                                  // poured rubber surfacing
  G[2].poly('busBlue', [[cx - 9, z0 + 2], [cx + 1, z0 + 2], [cx + 1, z1 - 2], [cx - 9, z1 - 2]], 0.055);     // the blue rubber under the structure
  // fence with two gates (north and south middle)
  fenceRun([[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]], 1.2, (x, z) => Math.abs(x - (cx + 6)) < 1.6);
  // play structure: two decks on posts, a roof, a tube slide and a wave slide, a climbing net up to the high deck, steps
  const deck = (dx0, dz0, dx1, dz1, y, roof) => {
    S.box('alu', [dx0, y - 0.12, dz0], [dx1, y, dz1], { walkable: true });
    for (const [px, pz] of [[dx0, dz0], [dx1, dz0], [dx0, dz1], [dx1, dz1]]) S.cyl('steelRed', px, pz, 0, roof ? y + 2.2 : y + 1.0, 0.07, 8, { collide: true });
    for (const [a, b, c, d] of [[dx0, dz0, dx1, dz0 + 0.05], [dx0, dz1 - 0.05, dx1, dz1]]) S.box('steelYellow', [a, y + 0.85, b], [c, y + 0.95, d], { collide: false });
    if (roof) S.add('steelYellow', (() => { const g = new THREE.ConeGeometry(Math.hypot(dx1 - dx0, dz1 - dz0) * 0.55, 1.1, 4); g.rotateY(Math.PI / 4); g.translate((dx0 + dx1) / 2, y + 2.75, (dz0 + dz1) / 2); return g; })());
  };
  const dx = cx - 8;
  deck(dx, cz - 3, dx + 3, cz, 1.6, true); deck(dx + 3, cz - 3, dx + 6, cz, 1.0, false);
  S.stairs('alu', { x: dx + 4.5, z: cz, y0: 0, rise: 1.0, run: 2.0, width: 1.2, axis: 'z', dir: 1 });                      // steps up to the low deck from the south
  { const g = new THREE.CylinderGeometry(0.45, 0.45, 4.2, 12, 1, true); g.rotateZ(Math.PI / 2 - 0.38); g.translate(dx - 1.9, 0.95, cz - 1.5); S.add('steelOrange', g); }   // tube slide off the high deck to the west
  { const g = boxGeo([-0.45, -0.04, -1.9], [0.45, 0.04, 1.9]); g.rotateX(-0.27); g.translate(dx + 4.5, 0.5, cz - 5.0); S.add('steelYellow', g); S.box('steelYellow', [dx + 3.95, 0, cz - 7], [dx + 5.05, 0.3, cz - 6.6], { collide: false }); }   // wave slide off the low deck to the north
  // climbing net: a rope grid on an A-frame up to the high deck
  for (let k = 0; k <= 6; k++) { const t = k / 6; S.add('black', (() => { const g = boxGeo([-0.02, 0, -0.02], [0.02, 1.9, 0.02]); g.rotateX(0.55); g.translate(dx + t * 3, 0, cz + 1.3); return g; })(), { uv: false }); }
  for (let k = 1; k <= 5; k++) { const y = k * 0.3, zz = cz + 1.3 - Math.sin(0.55) * y / Math.cos(0.55); S.box('black', [dx, y, zz - 0.02], [dx + 3, y + 0.03, zz + 0.02], { collide: false }); }
  world.box([dx, 0, cz], [dx + 3, 1.5, cz + 1.4]);
  // swings: an A-frame beam with four seats on chains
  { const sx0 = cx + 2, sx1 = cx + 12, sz = cz + 4;
    for (const x of [sx0, sx1]) { for (const s of [-1, 1]) { const g = boxGeo([-0.06, 0, -0.06], [0.06, 2.6, 0.06]); g.rotateX(s * 0.28); g.translate(x, 0, sz); S.add('steelRed', g); } world.box([x - 0.15, 0, sz - 0.8], [x + 0.15, 2.5, sz + 0.8]); }
    S.box('steelRed', [sx0, 2.45, sz - 0.07], [sx1, 2.6, sz + 0.07], { collide: false });
    for (let k = 0; k < 4; k++) { const x = sx0 + 1.4 + k * 2.4; for (const o of [-0.22, 0.22]) S.box('steelDark', [x + o - 0.015, 0.55, sz - 0.015], [x + o + 0.015, 2.45, sz + 0.015], { collide: false }); S.box('black', [x - 0.28, 0.5, sz - 0.12], [x + 0.28, 0.56, sz + 0.12], { collide: false }); } }
  // spring riders and benches round the inside of the fence
  for (const [x, z] of [[cx + 4, cz - 5], [cx + 8, cz - 5]]) { S.cyl('steelDark', x, z, 0, 0.35, 0.08, 6); S.box('steelOrange', [x - 0.35, 0.35, z - 0.18], [x + 0.35, 0.85, z + 0.18], { collide: true }); }
  for (let k = 0; k < 4; k++) { const x = x0 + 3 + k * 6; if (Math.abs(x - (cx + 6)) < 2) continue; S.box('bench', [x, 0.42, z1 - 1.0], [x + 1.8, 0.48, z1 - 0.55], { collide: false }); S.box('bench', [x, 0.48, z1 - 0.62], [x + 1.8, 0.9, z1 - 0.55], { collide: false }); S.box('steelDark', [x + 0.1, 0, z1 - 0.95], [x + 1.7, 0.42, z1 - 0.6]); }
  (world.W.mapPOIs || (world.W.mapPOIs = [])).push({ name: 'ASSER LEVY PLAYGROUND', x: cx, z: cz, kind: 'landmark' });
  world.W.asserPlayground = at;
}

/** hydrants at the corners, meters along the avenue kerbs, litter bins, manhole covers: the play area's busy streets */
function streetDetail(world, M, S) {
  const { R } = world, inPlay = (x, z) => x > PLAY.x0 && x < PLAY.x1 && z > PLAY.z0 && z < PLAY.z1 - 260;
  const solid = world.ctx.colliders, free = (x, z) => !solid.some((b) => x > b.min.x - 0.6 && x < b.max.x + 0.6 && z > b.min.z - 0.6 && z < b.max.z + 0.6 && b.max.y > 0.3 && b.min.y < 1.5);
  const meters = [], step = 12;
  for (const r of OSM.r) { if (r.w < 12) continue;
    walk(r.p, step, (x, z, dx, dz) => { if (!inPlay(x, z)) return; for (const sd of [-1, 1]) { const o = r.w / 2 + 0.6, px = x - dz * sd * o, pz = z + dx * sd * o; if (!free(px, pz)) continue; meters.push([px, pz]); } });
    walk(r.p, 40, (x, z) => { if (!inPlay(x, z)) return; const g = new THREE.CylinderGeometry(0.33, 0.33, 0.02, 14); g.translate(x + (R() - 0.5) * 3, 0.045, z + (R() - 0.5) * 3); S.add('steelDark', g, { uv: false }); });   // manholes in the roadway
  }
  for (const [x, z] of meters) { if (R() < 0.55) { S.cyl('galv', x, z, 0, 1.15, 0.035, 6); S.box('steelDark', [x - 0.09, 1.15, z - 0.07], [x + 0.09, 1.45, z + 0.07], { collide: false }); }
    else if (R() < 0.35) { S.cyl('binGreen', x, z, 0, 0.95, 0.3, 10, { collide: true }); S.cyl('black', x, z, 0.95, 1.0, 0.31, 10); } }
}
