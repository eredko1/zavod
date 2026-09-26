// CONEY — the Belt Parkway loop. Drive up W 8th St past Sammy's (north end, by Neptune Ave) through the green
// "BELT PKWY" gantry and you're up on an elevated loop of the parkway: three one-way lanes on a concrete viaduct (Jersey
// barriers, piers, cobra-head lights, overhead signs, traffic) about a kilometre round — ~35 s a lap flat out — over
// Brighton / Sheepshead Bay: brick walk-ups and six-storey apartment blocks, the B/Q el with a train rattling past, and the
// bay with its piers and fishing boats along Emmons Ave. Keep right at the EXIT 7 · CONEY ISLAND sign (or press T) to go home.
// The loop is its own zone far south of the map: W.zones lets players / vehicles live there without widening W.bounds; the
// deck height comes from W.groundHeight (a wrapper that knows the viaduct). Passengers are carried with the driver.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const ZONE = { x0: -2000, x1: 3400, z0: 11400, z1: 12700, oz: 12000 };   // world rect of the zone; local z = world z − oz
const CX = 900, LS = 300, R = 72, DECK = 9;                                      // loop centre (local x), straight length, bend radius, deck height
const LANES = 3, LW = 3.6, SH = 1.2, ROAD = LANES * LW + SH * 2;                 // 13.2 m deck between barriers
const PER = 2 * LS + 2 * Math.PI * R;                                            // ≈ 1052 m round
const EXIT_S = LS + Math.PI * R + LS * 0.55, EXIT_L = 45;                       // the exit ramp: keep right on the north straight
const RAMP = { x0: 394, x1: 420, z0: -560, z1: -541 };                           // coney: the on-ramp trigger (north end of W 8th St)
const BACK = { x: 404, z: -522, h: Math.PI };                                     // coney: where the exit puts you (heading south)

let Z = null;

/** the loop centreline by arc length s (local x/z): { x, z, tx, tz } — travel is +x along the south straight (z = +R) */
function at(s) {
  s = ((s % PER) + PER) % PER; const h = LS / 2, A = Math.PI * R;
  if (s < LS) return { x: CX - h + s, z: R, tx: 1, tz: 0 };
  s -= LS; if (s < A) { const th = Math.PI / 2 - s / R; return { x: CX + h + R * Math.cos(th), z: R * Math.sin(th), tx: Math.sin(th), tz: -Math.cos(th) }; }
  s -= A; if (s < LS) return { x: CX + h - s, z: -R, tx: -1, tz: 0 };
  s -= LS; const th = -Math.PI / 2 - s / R; return { x: CX - h + R * Math.cos(th), z: R * Math.sin(th), tx: Math.sin(th), tz: -Math.cos(th) };
}
/** signed distance from the centreline (+ = outside / right of travel) and the arc length there */
function project(x, z) {
  const h = LS / 2, dx = x - CX;
  if (Math.abs(dx) <= h) return z >= 0 ? { d: z - R, s: dx + h } : { d: -z - R, s: LS + Math.PI * R + (h - dx) };
  const cx = Math.sign(dx) * h, r = Math.hypot(dx - cx, z), th = Math.atan2(z, dx - cx);
  if (dx > 0) return { d: r - R, s: LS + (Math.PI / 2 - th) * R };
  let t = -Math.PI / 2 - th; while (t < 0) t += Math.PI * 2; return { d: r - R, s: 2 * LS + Math.PI * R + t * R };
}
const right = (p) => ({ x: -p.tz, z: p.tx });   // right-hand normal (outside of the loop)

export function buildBelt(world) {
  const { ctx, W, scene } = world;
  (W.zones || (W.zones = [])).push({ x0: ZONE.x0, x1: ZONE.x1, z0: ZONE.z0, z1: ZONE.z1, name: 'BELT PKWY LOOP', hint: 'EXIT 7 or T → Coney' });
  { const gh = W.groundHeight; W.groundHeight = (x, z) => {
      if (z > ZONE.z0 - 50 && z < ZONE.z1 + 50 && x > ZONE.x0 - 50 && x < ZONE.x1 + 50) { const q = project(x, z - ZONE.oz); return Math.abs(q.d) < ROAD / 2 + 0.2 ? DECK : 0; }   // the viaduct deck, the streets below
      return gh ? gh(x, z) : 0; }; }
  const root = new THREE.Group(); root.name = 'beltLoop'; root.position.set(0, 0, ZONE.oz); scene.add(root);
  Z = { world, ctx, root, traffic: [], t: 0, busy: false, lastTrip: -9, trains: [] };
  const M = mats();
  const G = new Map(); const put = (m, g) => (G.get(m) || G.set(m, []).get(m)).push(g.index ? g.toNonIndexed() : g);
  const wbox = (x0, y0, z0, x1, y1, z1) => world.box([Math.min(x0, x1), y0, Math.min(z0, z1) + ZONE.oz], [Math.max(x0, x1), y1, Math.max(z0, z1) + ZONE.oz]);
  const rnd = mulberry(7);

  // ---- the viaduct: deck ribbon, fascia, barriers (colliders), piers, lights --------------------------------------------------
  const pts = []; for (let s = 0; s <= PER + 0.01; s += 4) pts.push(at(s));
  const ribbon = (o0, o1, y, vRep = 12) => {
    const pos = [], uv = [], idx = [];
    pts.forEach((p, i) => { const r = right(p); pos.push(p.x + r.x * o0, y, p.z + r.z * o0, p.x + r.x * o1, y, p.z + r.z * o1); uv.push(0, i * 4 / vRep, 1, i * 4 / vRep); if (i) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) { g.index.array.reverse(); g.computeVertexNormals(); } return g;
  };
  const wall = (o, y0, y1) => {   // a vertical strip along the loop at offset o
    const pos = [], uv = [], idx = []; pts.forEach((p, i) => { const r = right(p); pos.push(p.x + r.x * o, y0, p.z + r.z * o, p.x + r.x * o, y1, p.z + r.z * o); uv.push(i * 4 / 6, 0, i * 4 / 6, 1); if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  put(M.road, ribbon(-ROAD / 2, ROAD / 2, DECK + 0.02));
  put(M.deckUnder, ribbon(ROAD / 2 + 0.6, -ROAD / 2 - 0.6, DECK - 1.1, 40));                  // underside
  for (const o of [-ROAD / 2 - 0.6, ROAD / 2 + 0.6]) { const g = wall(o, DECK - 1.1, DECK + 0.02); put(M.concrete, g); const g2 = g.clone(); g2.index.array.reverse(); g2.computeVertexNormals(); put(M.concrete, g2); }   // fascia
  // Jersey barriers both sides (visual strips + collider cells every 3 m)
  for (const o of [-ROAD / 2 - 0.3, ROAD / 2 + 0.3]) {
    for (const oo of [o - 0.28, o + 0.28]) { const g = wall(oo, DECK, DECK + 1.05); put(M.concrete, g); const g2 = g.clone(); g2.index.array.reverse(); g2.computeVertexNormals(); put(M.concrete, g2); }
    const top = ribbon(o - 0.28, o + 0.28, DECK + 1.05); put(M.concrete, top);
    for (let s = 0; s < PER; s += 3) { if (o > 0 && s > EXIT_S - 2 && s < EXIT_S + EXIT_L) continue;   // the exit gore opens the outside barrier
      const p = at(s), r = right(p), x = p.x + r.x * o, z = p.z + r.z * o; wbox(x - 0.45, DECK, z - 0.45, x + 0.45, DECK + 1.1, z + 0.45); }
  }
  // exit ramp: a short spur curving off the outside of the north straight, dropping away (the trigger sends you home)
  { const p0 = at(EXIT_S), r = right(p0); const g = new THREE.BufferGeometry(); const pos = [], idx = [];
    for (let i = 0; i <= 12; i++) { const k = i / 12, s = EXIT_S + k * EXIT_L, p = at(s), rr = right(p), off = ROAD / 2 + k * k * 14, y = DECK + 0.03 - k * k * 3;
      pos.push(p.x + rr.x * (off - 5), y, p.z + rr.z * (off - 5), p.x + rr.x * (off + 4), y, p.z + rr.z * (off + 4)); if (i) { const q = i * 2; idx.push(q - 2, q, q - 1, q - 1, q, q + 1); } }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0), 2)); g.setIndex(idx); g.computeVertexNormals(); if (g.attributes.normal.getY(0) < 0) { g.index.array.reverse(); g.computeVertexNormals(); } put(M.asphalt, g); void r; }
  // piers every 24 m: a column + a hammerhead cap under the deck
  for (let s = 6; s < PER; s += 24) { const p = at(s), ang = Math.atan2(p.tz, p.tx);
    const col = new THREE.BoxGeometry(1.6, DECK - 1.1, 1.6); col.translate(p.x, (DECK - 1.1) / 2, p.z); put(M.concrete, col);
    const cap = new THREE.BoxGeometry(1.8, 1.0, ROAD); cap.rotateY(-ang); cap.translate(p.x, DECK - 1.6, p.z); put(M.concrete, cap); }
  // cobra-head lights on the outside barrier every 45 m
  for (let s = 10; s < PER; s += 45) { const p = at(s), r = right(p), x = p.x + r.x * (ROAD / 2 + 0.4), z = p.z + r.z * (ROAD / 2 + 0.4);
    const pl = new THREE.CylinderGeometry(0.1, 0.14, 9, 8); pl.translate(x, DECK + 5.5, z); put(M.steel, pl);
    const arm = new THREE.BoxGeometry(0.12, 0.12, 3); arm.rotateY(Math.atan2(r.x, r.z)); arm.translate(x - r.x * 1.4, DECK + 10, z - r.z * 1.4); put(M.steel, arm);
    const hd = new THREE.BoxGeometry(0.7, 0.18, 0.4); hd.translate(x - r.x * 2.8, DECK + 9.9, z - r.z * 2.8); put(M.lamp, hd); }
  // overhead sign gantries
  const gantry = (s, lines) => { const p = at(s), r = right(p), ang = Math.atan2(p.tx, p.tz);
    for (const o of [-ROAD / 2 - 0.6, ROAD / 2 + 0.6]) { const c = new THREE.BoxGeometry(0.35, 7.5, 0.35); c.translate(p.x + r.x * o, DECK + 3.75, p.z + r.z * o); put(M.steel, c); }
    const bm = new THREE.BoxGeometry(ROAD + 1.6, 0.4, 0.4); bm.rotateY(ang + Math.PI / 2); bm.translate(p.x, DECK + 7.3, p.z); put(M.steel, bm);
    const pn = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.75), new THREE.MeshStandardMaterial({ map: signTex(lines), emissive: 0xffffff, emissiveMap: signTex(lines), emissiveIntensity: 0.12 }));
    pn.position.set(p.x + r.x * 2, DECK + 6.2, p.z + r.z * 2); pn.rotation.y = Math.atan2(-p.tx, -p.tz); root.add(pn); };
  gantry(40, ['BELT PKWY', 'SHEEPSHEAD BAY RD · EXIT 8']);
  gantry(EXIT_S - 160, ['EXIT 7', 'OCEAN PKWY · CONEY ISLAND ↘']);
  gantry(EXIT_S - 12, ['EXIT 7 ↘', 'CONEY ISLAND · KEEP RIGHT']);
  gantry(LS + 30, ['BRIGHTON BEACH', 'EXIT 7A · BRIGHTON BEACH AV']);

  // ---- below: Brighton / Sheepshead Bay ------------------------------------------------------------------------------------
  const BAY_Z = R + 120;   // the bay starts south of the loop
  { const g = new THREE.PlaneGeometry(2600, 900 + BAY_Z); g.rotateX(-Math.PI / 2); g.translate(CX, 0, (-900 + BAY_Z) / 2); put(M.streets, g); }   // streets end at the bay
  { const g = new THREE.PlaneGeometry(2600, 700); g.rotateX(-Math.PI / 2); g.translate(CX, -0.6, BAY_Z + 350); put(M.water, g); }
  { const g = new THREE.BoxGeometry(2600, 0.9, 10); g.translate(CX, -0.1, BAY_Z - 3); put(M.concrete, g); }                   // Emmons Ave bulkhead / promenade
  for (let i = 0; i < 9; i++) { const x = CX - 560 + i * 140 + rnd() * 30, L = 60 + rnd() * 50;                                // piers + fishing boats
    const pr = new THREE.BoxGeometry(4, 0.5, L); pr.translate(x, 0.2, BAY_Z + L / 2); put(M.wood, pr);
    for (let k = 0; k < 4; k++) for (const sd of [-1, 1]) { if (rnd() < 0.35) continue; const bz = BAY_Z + 12 + k * (L / 4), bx = x + sd * 6;
      const hull = new THREE.BoxGeometry(3.2, 1.4, 11 + rnd() * 5); hull.translate(bx, 0.1, bz); put(M.hull, hull);
      const cab = new THREE.BoxGeometry(2.4, 1.8, 3.5); cab.translate(bx, 1.7, bz - 1.5); put(M.cabin, cab); } }
  // blocks: a street grid; walk-ups + six-storey brick apartment blocks, none under the viaduct
  const houses = [], tall = [], trees = [];
  for (let bx = CX - 1250; bx < CX + 1250; bx += 90) for (let bz = -560; bz < BAY_Z - 20; bz += 70) {
    const inner = Math.abs(project(bx + 45, bz + 35).d) < 22; if (inner) continue;
    const apt = rnd() < (Math.abs(bx - CX) < 500 ? 0.35 : 0.15);
    if (apt) { const w = 60 + rnd() * 18, d = 44 + rnd() * 10, h = 17 + rnd() * 5; const x = bx + 45, z = bz + 35; if (Math.abs(project(x, z).d) > 34) tall.push([x, z, w, h, d]); continue; }
    for (const [z0, sd] of [[bz + 8, 1], [bz + 62, -1]]) for (let x = bx + 6; x < bx + 84; x += 7 + rnd() * 2) {
      const h = 7 + rnd() * 4, d = 12 + rnd() * 4, z = z0 + sd * d / 2; if (Math.abs(project(x, z).d) < 16) continue; houses.push([x, z, 6.4, h, d]); }
    for (let x = bx + 4; x < bx + 88; x += 12) if (rnd() < 0.5 && Math.abs(project(x, bz + 1).d) > 12) trees.push([x, bz + 1]);
  }
  const inst = (geo, mat, list, fn) => { const m = new THREE.InstancedMesh(geo, mat, list.length); const o = new THREE.Object3D(); const c = new THREE.Color();
    list.forEach((q, i) => { fn(o, q); o.updateMatrix(); m.setMatrixAt(i, o.matrix); c.setHSL(0.03 + rnd() * 0.06, 0.25 + rnd() * 0.25, 0.32 + rnd() * 0.22); m.setColorAt(i, c); });
    m.castShadow = true; m.receiveShadow = true; m.instanceMatrix.needsUpdate = true; root.add(m); return m; };
  const unit = new THREE.BoxGeometry(1, 1, 1); unit.translate(0, 0.5, 0);
  inst(unit, M.rowhouse, houses, (o, [x, z, w, h, d]) => { o.position.set(x, 0, z); o.scale.set(w, h, d); });
  inst(unit, M.brick, tall, (o, [x, z, w, h, d]) => { o.position.set(x, 0, z); o.scale.set(w, h, d); });
  { const cone = new THREE.ConeGeometry(2.6, 7, 7); cone.translate(0, 6.5, 0); const t = new THREE.InstancedMesh(cone, M.tree, trees.length); const o = new THREE.Object3D();
    trees.forEach(([x, z], i) => { o.position.set(x, 0, z); o.scale.setScalar(0.8 + rnd() * 0.5); o.updateMatrix(); t.setMatrixAt(i, o.matrix); }); root.add(t); }
  // the B/Q el along the north side, with a train going by
  { const ez = -R - 120;
    for (let x = CX - 1250; x < CX + 1250; x += 18) for (const dz of [-3.5, 3.5]) { const c = new THREE.BoxGeometry(0.6, 8, 0.6); c.translate(x, 4, ez + dz); put(M.elGreen, c); }
    const deck = new THREE.BoxGeometry(2500, 1.1, 9); deck.translate(CX, 8.4, ez); put(M.elGreen, deck);
    const tr = new THREE.Group(); for (let k = 0; k < 6; k++) { const car = new THREE.Mesh(new THREE.BoxGeometry(18.5, 3.4, 3), M.trainSteel); car.position.set(k * 19, 10.7, 0); car.castShadow = true; tr.add(car);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(18.6, 0.35, 3.05), M.trainStripe); stripe.position.set(k * 19, 11.4, 0); tr.add(stripe); }
    tr.position.set(CX - 1200, 0, ez - 1.8); root.add(tr); Z.trains.push({ m: tr, x0: CX - 1300, x1: CX + 1300 }); }

  for (const [m, list] of G) { const merged = mergeGeometries(list, false); if (!merged) { console.warn('[belt] merge failed', m.name || m.color?.getHexString?.()); continue; } const mesh = new THREE.Mesh(merged, m); mesh.castShadow = m !== M.water && m !== M.streets; mesh.receiveShadow = true; root.add(mesh); }

  // ---- traffic: a dozen cars lapping in the three lanes ----
  for (let i = 0; i < 12; i++) { const car = trafficCar(M, i); root.add(car); Z.traffic.push({ m: car, lane: i % 3, s: (i * 89) % PER, v: 19 + (i % 5) * 2.4 }); }

  // ---- the on-ramp gantry on W 8th St (coney side) ----
  { const x = (RAMP.x0 + RAMP.x1) / 2, z = -536; const tex = signTex(['BELT PKWY', 'SHEEPSHEAD BAY · BRIGHTON ↑']);
    for (const dx of [-11, 11]) { const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7.2, 0.4), M.steel); p2.position.set(x + dx, 3.6, z); scene.add(p2); world.box([x + dx - 0.3, 0, z - 0.3], [x + dx + 0.3, 7.2, z + 0.3]); }
    const bm = new THREE.Mesh(new THREE.BoxGeometry(22, 0.35, 0.35), M.steel); bm.position.set(x, 7.0, z); scene.add(bm);
    const pn = new THREE.Mesh(new THREE.PlaneGeometry(9, 3), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15 })); pn.position.set(x, 6.1, z + 0.25); scene.add(pn); }

  world.updaters.push((dt) => { if (Z?.world === world) update(dt); });
  if (typeof window !== 'undefined' && window.__game) window.__game.belt = { enter: () => enter(), exit: () => exit(), state: () => ({ inZone: inZone(ctx.player.position), t: +Z.t.toFixed(1) }), ramp: RAMP, zone: ZONE, at: (s, off = 0) => { const p = at(s), r = right(p); return [p.x + r.x * off, DECK, p.z + r.z * off + ZONE.oz, Math.atan2(-p.tx, -p.tz)]; }, exitS: EXIT_S, per: PER, deck: DECK };
  console.log('[belt] elevated loop built', Math.round(PER), 'm');
}

// ---------------------------------------------------------------------------------------------------------------------------
const inZone = (p) => p.z > ZONE.z0 && p.z < ZONE.z1 && p.x > ZONE.x0 && p.x < ZONE.x1;
function update(dt) {
  Z.t += dt; const { ctx } = Z; const p = ctx.player; const now = performance.now() / 1000;
  for (const c of Z.traffic) { c.s = (c.s + c.v * dt) % PER; const q = at(c.s), r = right(q), off = -ROAD / 2 + SH + LW * (c.lane + 0.5);
    c.m.position.set(q.x + r.x * off, DECK, q.z + r.z * off); c.m.rotation.y = Math.atan2(-q.tx, -q.tz); }
  for (const T of Z.trains) { const L = T.x1 - T.x0, k = ((Date.now() / 1000) * 14) % (L * 2); T.m.position.x = k < L ? T.x0 + k : T.x1 - (k - L); T.m.visible = true; }   // wall clock: friends see the same train
  if (!p || p.dead || now - Z.lastTrip < 3) return;
  const v = ctx.vehicles?.mounted, here = v ? v.pos : p.position;
  if (inZone(here) && ctx.state === 'playing' && ctx.input?.pressed?.has?.('KeyT')) { ctx.input.pressed.delete('KeyT'); exit(); return; }
  if (inZone(here) && !Z.hintT) { Z.hintT = 1; ctx.hud?.toast?.('BELT PKWY LOOP — keep right at EXIT 7 (or T) for Coney', 3200); }
  if (!inZone(here)) Z.hintT = 0;
  if (v && !Z.busy && v.pos.x > RAMP.x0 && v.pos.x < RAMP.x1 && v.pos.z > RAMP.z0 && v.pos.z < RAMP.z1) enter();   // on-ramp
  if (!Z.busy && inZone(here)) { const q = project(here.x, here.z - ZONE.oz); if (q.d > 2.2 && q.s > EXIT_S && q.s < EXIT_S + EXIT_L) exit(); }   // right lane through the EXIT 7 gore = off you go
}
function moveTo(x, y, z, h, speed) {
  const { ctx } = Z; const v = ctx.vehicles?.mounted, p = ctx.player;
  if (v) { v.pos.set(x, y, z); v.heading = h; v.vel.set(-Math.sin(h) * speed, 0, -Math.cos(h) * speed); v.vy = 0; v.air = false; if (v.group) { v.group.position.copy(v.pos); v.group.rotation.y = h; } }
  else p.teleport(x, y, z, h, 0);
}
function fade(text, fn) {
  Z.busy = true; Z.lastTrip = performance.now() / 1000;
  const f = document.querySelector('.hgfade'), fl = document.querySelector('.hgfloor');
  if (f) { f.classList.remove('car'); f.style.transition = 'opacity .35s'; f.style.opacity = '1'; }
  setTimeout(() => { try { fn(); } catch (e) { console.warn('[belt]', e); } if (fl) { fl.style.fontSize = '44px'; fl.textContent = text; }
    setTimeout(() => { if (f) f.style.opacity = '0'; if (fl) fl.textContent = ''; setTimeout(() => { if (f) { f.style.transition = ''; fl && (fl.style.fontSize = ''); } Z.busy = false; }, 400); }, 900); }, 380);
}
function enter() { const sp = Math.max(18, Math.abs(Z.ctx.vehicles?.mounted?.fwdSpeed || 0)); fade('BELT PARKWAY', () => { const q = at(20), r = right(q), off = -ROAD / 2 + SH + LW * 2.5; moveTo(q.x + r.x * off, DECK, q.z + r.z * off + ZONE.oz, Math.atan2(-q.tx, -q.tz), sp); }); }
function exit() { const sp = Math.max(10, Math.abs(Z.ctx.vehicles?.mounted?.fwdSpeed || 0) * 0.6); fade('EXIT 7 · CONEY ISLAND', () => moveTo(BACK.x, 0, BACK.z, BACK.h, Z.ctx.vehicles?.mounted ? sp : 0)); }

// ---------------------------------------------------------------------------------------------------------------------------
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function canvasTex(w, h, draw, rep = null) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); } return t; }
function signTex(lines, bg = '#0f6b3a') {
  return canvasTex(512, 176, (g) => { g.fillStyle = bg; g.fillRect(0, 0, 512, 176); g.strokeStyle = '#fff'; g.lineWidth = 5; g.strokeRect(8, 8, 496, 160);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; const hh = 150 / lines.length;
    lines.forEach((t, i) => { let fs = i === 0 ? 50 : 40; do { g.font = `700 ${fs}px Arial`; fs -= 2; } while (g.measureText(t).width > 470); g.fillText(t, 256, 13 + hh * (i + 0.5)); }); });
}
function roadTex() {
  const t = canvasTex(256, 512, (g) => { g.fillStyle = '#3a3b3d'; g.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 5000; i++) { const v = 40 + Math.random() * 40; g.fillStyle = `rgba(${v},${v},${v + 2},0.5)`; g.fillRect(Math.random() * 256, Math.random() * 512, 2, 2); }
    const px = (m) => m / ROAD * 256; g.fillStyle = '#e8c33a'; g.fillRect(px(SH) - 3, 0, 5, 512); g.fillStyle = '#ecece6'; g.fillRect(px(ROAD - SH) - 2, 0, 5, 512);
    for (let l = 1; l < LANES; l++) for (let y = 0; y < 512; y += 128) g.fillRect(px(SH + l * LW) - 2, y, 4, 54); });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function streetTex() {   // Brighton from above: asphalt streets on a 90 × 70 m grid, sidewalks, backyards
  return canvasTex(512, 512, (g) => { g.fillStyle = '#5f6b4a'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${60 + Math.random() * 40},${70 + Math.random() * 40},50,0.4)`; g.fillRect(Math.random() * 512, Math.random() * 512, 3, 3); }
    g.fillStyle = '#b7b3aa'; g.fillRect(0, 0, 512, 60); g.fillRect(0, 0, 60, 512);
    g.fillStyle = '#3b3c3e'; g.fillRect(0, 0, 512, 44); g.fillRect(0, 0, 44, 512);
    g.fillStyle = '#d8d2b8'; for (let x = 60; x < 512; x += 40) g.fillRect(x, 20, 20, 3); for (let y = 60; y < 512; y += 40) g.fillRect(20, y, 3, 20); }, [2600 / 90, 1200 / 70]);
}
function windowsTex(base, rep = [1, 1]) {   // brick walk-up / apartment facade: rows of windows, a cornice
  return canvasTex(128, 256, (g) => { g.fillStyle = base; g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.fillRect(Math.random() * 128, Math.random() * 256, 4, 2); }
    g.fillStyle = '#e2ddd0'; g.fillRect(0, 0, 128, 10);
    for (let y = 26; y < 250; y += 38) for (let x = 12; x < 120; x += 28) { g.fillStyle = '#1d2530'; g.fillRect(x, y, 14, 22); g.fillStyle = '#d9d4c6'; g.fillRect(x - 1, y + 22, 16, 3); } }, rep);
}
function mats() {
  const S = (c, r = 0.8, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  return {
    road: new THREE.MeshStandardMaterial({ map: roadTex(), roughness: 0.85 }), asphalt: S(0x3c3d40, 0.9), concrete: S(0xb3aea4, 0.9), deckUnder: S(0x77746e, 0.95),
    steel: S(0x8d9296, 0.45, 0.7), lamp: new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffd9a0, emissiveIntensity: 0.6 }),
    streets: new THREE.MeshStandardMaterial({ map: streetTex(), roughness: 0.95 }), water: new THREE.MeshStandardMaterial({ color: 0x2b5463, roughness: 0.12, metalness: 0.15 }),
    wood: S(0x6e5a44, 0.9), hull: S(0xf0f0ec, 0.5), cabin: S(0x2d5d8a, 0.5), tree: S(0x3b5a2a, 1),
    rowhouse: new THREE.MeshStandardMaterial({ map: windowsTex('#9a6a52'), roughness: 0.9 }), brick: new THREE.MeshStandardMaterial({ map: windowsTex('#8a4a3a', [5, 2]), roughness: 0.9 }),
    elGreen: S(0x3f5a47, 0.7, 0.3), trainSteel: S(0xb9bec4, 0.35, 0.8), trainStripe: S(0xe0b422, 0.5, 0.2),
    carBody: [0x2b3f73, 0x8a1c1c, 0xdadada, 0x1c1c1c, 0x6d7c86, 0xe0b422].map((c) => S(c, 0.35, 0.3)), carGlass: S(0x111418, 0.1, 0.5), tire: S(0x151515, 0.9),
  };
}
function trafficCar(M, i) {
  const g = new THREE.Group(); const body = M.carBody[i % M.carBody.length];
  const b = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.75, 4.5), body); b.position.y = 0.65; g.add(b);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.4), M.carGlass); cab.position.set(0, 1.3, 0.2); g.add(cab);
  for (const [x, z] of [[-0.85, -1.4], [0.85, -1.4], [-0.85, 1.4], [0.85, 1.4]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 12), M.tire); w.rotation.z = Math.PI / 2; w.position.set(x, 0.34, z); g.add(w); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
