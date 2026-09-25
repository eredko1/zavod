// CONEY hangout — "recreate our youth": Igor in the park by Luna Park building 2 sells a $10 bag (or a bottle, every other
// time); Sammy's deli on W 8th St sells liquor and 40s of Olde English once you've answered his question; any Luna Park
// lobby has 3 steel elevators to the 19th-floor gallery (friends standing with you ride along, online); B to light up /
// drink anywhere and friends close by share it; ride down, steal a car off the kerb or take the red car. The generic loop
// (cash, stash, B, elevators, stealing, passengers, merc cash, respawn-at) lives in ../hangkit.js. CONEY agent.
import * as THREE from 'three';
import { buildKit, hangkit as K } from '../hangkit.js';
import { buildDeli, sammyTalk } from '../deli.js';
import { buildLocals, sammyLotion } from './locals.js';
import { buildChill } from './chill.js';
import { OSM } from './osm.js';
import { cen, pip } from '../osmkit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const B2 = new THREE.Vector3(163, 0, -445);      // OSM "Luna Park Houses 2" centre (map frame)
const START_CASH = 20, PRICE = 10;

let H = null;

export function buildHangout(world, M) {
  const { ctx, W } = world; const towers = world.lunaTowers || [];
  if (!towers.length) return;
  W.lunaTowers = towers;   // exposed on ctx.world for QA / other modules
  // building 2 = the complex nearest the OSM centroid of "Luna Park Houses 2"
  let b2 = towers[0]; for (const t of towers) if (t.centre.distanceTo(B2) < b2.centre.distanceTo(B2)) b2 = t;
  const free = (v) => !ctx.colliders.some((b) => v.x > b.min.x - 0.4 && v.x < b.max.x + 0.4 && v.z > b.min.z - 0.4 && v.z < b.max.z + 0.4 && b.max.y > 0.3 && b.min.y < 1.8);
  // online start: right outside building 2's lobby door (whichever face is open)
  let door = b2.lobby.doors.find((d) => free(d.outside)) || b2.lobby.doors[0];
  const out = door.outside.clone(); for (let k = 0; k < 12 && !free(out); k++) out.addScaledVector(door.outside.clone().sub(door.inside).setY(0).normalize(), 1);
  W.onlineStart = [out.x, 0, out.z, door.yawIn];
  // Igor: in the nearest park polygon to building 2 (else the lawn in front of it)
  let igor = null, bd = 260;
  for (const p of OSM.pk) { const [x, z] = cen(p); const d = Math.hypot(x - b2.centre.x, z - b2.centre.z); if (d < bd && pip(x, z, p)) { const v = new THREE.Vector3(x, 0, z); if (free(v)) { bd = d; igor = v; } } }
  if (!igor) igor = out.clone().addScaledVector(door.outside.clone().sub(door.inside).setY(0).normalize(), 12);
  H = { world, ctx, towers, b2, igor, buys: 0 };
  H.igor = buildIgor(world, M, igor);   // the interaction point is Igor's bench, not the park centre
  if (H.gate) { const g = H.gate, dx = H.igor.x - g.x, dz = H.igor.z - g.z; W.onlineStart = [g.x, 0, g.z, Math.atan2(-dx, -dz)]; }   // friends spawn at Igor's gate
  // three bikes parked in a row just outside the park gate (vehicles.js takes W.vehicleSpots; coney.js puts these first)
  if (H.gate) {
    const g = H.gate, ax = H.igor.x - g.x, az = H.igor.z - g.z, L0 = Math.hypot(ax, az) || 1, ux = ax / L0, uz = az / L0, px = -uz, pz = ux;   // u: gate → park, p: along the fence
    const clearAt = (x, z) => !ctx.colliders.some((b) => x > b.min.x - 1.3 && x < b.max.x + 1.3 && z > b.min.z - 1.3 && z < b.max.z + 1.3 && b.max.y > 0.3 && b.min.y < 1.6);
    W.tableBikes = [];
    for (const back of [4, 6, 8, 10]) { for (let k = -4; k <= 4 && W.tableBikes.length < 3; k++) { const x = g.x - ux * back + px * (5 + k * 2.4), z = g.z - uz * back + pz * (5 + k * 2.4); if (clearAt(x, z) && W.tableBikes.every((b) => Math.hypot(b.x - x, b.z - z) > 2.2)) W.tableBikes.push({ x, y: 0, z, yaw: Math.atan2(ux, uz) }); } if (W.tableBikes.length >= 3) break; }
  }
  (W.mapPOIs || (W.mapPOIs = [])).push({ name: 'LUNA PARK HOUSES', x: b2.centre.x, z: b2.centre.z - 30, kind: 'landmark' });
  buildKit(world, { cash: START_CASH, title: 'CONEY — CONTROLS',
    help: 'F · talk (Igor, Sammy) / elevator / steal car / hop in<br>B · blaze or drink (stand close to share)<br>Kills pay cash · N · give a friend $10<br>Driving: Shift nitro · Q horn · V camera · Space handbrake<br>M · map · L · Luna Park Radio · . next track<br>Belt Pkwy → JFK: north end of W 8th St<br>Roof: stairs at the end of the 19th-floor lobby<br>Sammy\'s deli: W 8th St, across from the towers',
    respawn: { label: 'Table Park', at: () => W.onlineStart } });
  K.spot({ pos: H.igor, r: 2.4, prompt: `F — TALK TO IGOR ($${PRICE})`, act: buyIgor });
  // every Luna Park tower: 3 lobby cars up to the 19th floor, each gallery side's cars back down (shaft index = tower index)
  for (const t of towers) K.shaft({ kind: 'elevator', floors: 19, lobby: { cars: t.lobby.cars }, tops: t.top.map((s) => ({ cars: s.cars, face: s.view.yaw })) });
  try { placeDeli(world); } catch (e) { console.warn('[hangout] deli', e); }
  try { buildLocals(world, H); } catch (e) { console.warn('[hangout] locals', e); }   // POPS, SHADES, NET GOST + the mangal (coney/locals.js)
  if (ctx.mode === 'chill') try { buildChill(world, H); } catch (e) { console.warn('[hangout] chill', e); }   // chill mode (coney/chill.js)
  // the Wonder Wheel: ride a cabin all the way round (~2.5 min) — look around and snipe from the top; F gets you off
  const wheelSpot = () => { const WW = W.wonderWheel; if (!WW || H.wheelSpot) return; H.wheelSpot = K.spot({ pos: WW.base, r: 3.2, dy: 2, prompt: 'F — RIDE THE WONDER WHEEL', act: () => rideWheel(WW) }); };   // landmarks build after the hangout
  buildDoors(world);
  ctx.bus.on('net:red', (m) => { if (H?.world === world) onRemoteRed(m); });
  ctx.bus.on('net:igor', (m) => ctx.hud?.toast?.(`${ctx.net?.peer?.(m.f)?.name || 'Someone'} bought from Igor`, 1800));
  world.updaters.push(() => { if (H?.world === world) { wheelSpot(); updateDoors(ctx.time.dt || 0.016); updateRed(); updateWheelRide(ctx.time.dt || 0.016); } });
  ctx.bus.on('playerDied', () => { if (H?.wheel) H.wheel = null; });
  console.log('[hangout] building 2 at', b2.centre.toArray().map((v) => v.toFixed(0)).join(','), '· igor at', igor.x.toFixed(0), igor.z.toFixed(0), '· towers', towers.length, '· parked cars', (world.parkedCars || []).length, '· deli', H.deli ? H.deli.door.toArray().map((v) => v.toFixed(0)).join(',') : 'none');
}
const stealLocal = (i, mine) => K.stealLocal(i, mine);

// ---- Sammy's deli: east side of W 8th St (the divided road along Luna Park's east edge), between Neptune Ave and the
// shopping-centre driveway. The storefront faces the street; first free spot along the kerb wins.
function placeDeli(world) {
  const { ctx } = world;
  const clear = (fx, fz, u, n) => { // footprint 8.5 x 12 (+ 2 m of sidewalk in front) must be free of colliders
    for (let a = -4.6; a <= 4.6; a += 0.8) for (let d = -2; d <= 11.6; d += 0.8) { const x = fx + u.x * a + n.x * d, z = fz + u.y * a + n.y * d;
      if (ctx.colliders.some((b) => !(b.max.y <= 1.6 && b.max.x - b.min.x < 5.2 && b.max.z - b.min.z < 5.2) && x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z && b.max.y > 0.4 && b.min.y < 3)) return false; }   // parked cars don't count (they're moved)
    return true; };
  // across the street from Luna Park: the east kerb north of Neptune Ave, then the east kerb south of it; the Luna Park side last
  for (const [ax, az, bx, bz, side] of [[393, -469, 406, -530, 1], [368, -352, 393, -469, 1], [384, -478, 327, -219, -1]]) {
    const A = new THREE.Vector2(ax, az), u = new THREE.Vector2(bx - ax, bz - az).normalize(); const n = new THREE.Vector2(-u.y, u.x); if (Math.sign(n.x) !== side) n.negate();
    const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(n.x, n.y);
    const order = []; for (let s = 6; s < len - 6; s += 3) order.push(s);
    order.sort((p, q) => Math.abs(A.y + u.y * p + 415) - Math.abs(A.y + u.y * q + 415));   // nearest to z −415 (level with building 2's park) first
    for (const s of order) {
      const fx = A.x + u.x * s + n.x * 8.5, fz = A.y + u.y * s + n.y * 8.5;
      if (!clear(fx, fz, u, n)) continue;
      for (const [i, c] of (world.parkedCars || []).entries()) { if (c.gone) continue; const dx = c.x - fx, dz = c.z - fz, a = dx * u.x + dz * u.y, d = dx * n.x + dz * n.y; if (Math.abs(a) < 6 && d > -4 && d < 13) K.stealLocal(i, false); }   // clear the kerb
      const D = buildDeli(world, { x: fx, z: fz, yaw, name: "SAMMY'S DELI & GROCERY" });
      H.deli = D; (world.W.mapPOIs || (world.W.mapPOIs = [])).push({ name: "SAMMY'S DELI", x: D.door.x, z: D.door.z, kind: 'shop' });
      K.vendor({ name: 'SAMMY', pos: D.sammy, r: 2.3, talk: sammyTalk('SAMMY', { extra: sammyLotion }) });
      return;
    }
  }
  console.warn('[hangout] no free spot for the deli on W 8th St');
}

function buildIgor(world, M, pos) {
  const { scene } = world; const R = world.R;
  const toB2 = Math.atan2(-(H?.b2?.centre.x ?? B2.x) + pos.x, -(H?.b2?.centre.z ?? B2.z) + pos.z);   // faces building 2
  // ---- the little park: fenced concrete pad, rundown picnic tables, NYC benches, bin, lamp ------------------------------
  const park = new THREE.Group(); park.position.copy(pos); park.rotation.y = toB2; scene.add(park);
  const Wd = 22, Dd = 16;
  const conc = new THREE.MeshStandardMaterial({ color: 0x9a978f, roughness: 0.95 });
  { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#a19e96'; g.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 2500; k++) { const v = 120 + Math.random() * 70; g.fillStyle = `rgba(${v},${v},${v - 6},0.35)`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    g.strokeStyle = 'rgba(60,58,54,0.7)'; g.lineWidth = 2; for (let k = 0; k <= 4; k++) { g.beginPath(); g.moveTo(k * 64, 0); g.lineTo(k * 64, 256); g.stroke(); g.beginPath(); g.moveTo(0, k * 64); g.lineTo(256, k * 64); g.stroke(); }
    for (let k = 0; k < 14; k++) { g.strokeStyle = 'rgba(50,48,44,0.5)'; g.lineWidth = 1; g.beginPath(); let x = Math.random() * 256, y = Math.random() * 256; g.moveTo(x, y); for (let q = 0; q < 5; q++) { x += (Math.random() - 0.5) * 30; y += (Math.random() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
    for (let k = 0; k < 10; k++) { g.fillStyle = 'rgba(30,28,24,0.18)'; g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, 6 + Math.random() * 16, 4 + Math.random() * 10, 0, 0, 7); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Wd / 4, Dd / 4); conc.map = t; conc.color.set(0xffffff); }
  const pad = new THREE.Mesh(new THREE.BoxGeometry(Wd, 0.1, Dd), conc); pad.position.y = 0.05; pad.receiveShadow = true; park.add(pad);
  const iron = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.55, metalness: 0.6 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x7d7466, roughness: 0.95 }), woodOld = new THREE.MeshStandardMaterial({ color: 0x5f5a50, roughness: 1 }), benchGreen = new THREE.MeshStandardMaterial({ color: 0x2f4a36, roughness: 0.7, metalness: 0.2 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; park.add(m); return m; };
  const W2 = new THREE.Vector3(), Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), toB2);
  const wbox = (lx0, y0, lz0, lx1, y1, lz1) => { const cs = [[lx0, lz0], [lx1, lz0], [lx0, lz1], [lx1, lz1]].map(([x, z]) => W2.set(x, 0, z).applyQuaternion(Q).add(pos).clone()); world.box([Math.min(...cs.map((c) => c.x)), y0, Math.min(...cs.map((c) => c.z))], [Math.max(...cs.map((c) => c.x)), y1, Math.max(...cs.map((c) => c.z))]); };
  // black picket fence (1.2 m) around the pad, 2.5 m gate gap facing the building (+z local = toward building 2 after the yaw)
  const fence = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(z1 - z0, x1 - x0); for (const y of [0.25, 1.1]) add(new THREE.BoxGeometry(L, 0.04, 0.04), iron, (x0 + x1) / 2, y, (z0 + z1) / 2, 0, -a); for (let k = 0; k <= L / 0.13; k++) { const t = k * 0.13 / L; add(new THREE.BoxGeometry(0.02, 1.22, 0.02), iron, x0 + (x1 - x0) * t, 0.61, z0 + (z1 - z0) * t); } const n = 12; for (let k = 0; k < n; k++) { const t0 = k / n, t1 = (k + 1) / n; wbox(Math.min(x0 + (x1 - x0) * t0, x0 + (x1 - x0) * t1) - 0.06, 0, Math.min(z0 + (z1 - z0) * t0, z0 + (z1 - z0) * t1) - 0.06, Math.max(x0 + (x1 - x0) * t0, x0 + (x1 - x0) * t1) + 0.06, 1.2, Math.max(z0 + (z1 - z0) * t0, z0 + (z1 - z0) * t1) + 0.06); } };
  const hx = Wd / 2, hz = Dd / 2;
  fence(-hx, -hz, hx, -hz); fence(-hx, -hz, -hx, hz); fence(hx, -hz, hx, hz); fence(-hx, hz, -1.3, hz); fence(1.3, hz, hx, hz);
  for (const x of [-1.3, 1.3]) add(new THREE.BoxGeometry(0.08, 1.5, 0.08), iron, x, 0.75, hz);
  H.gate = new THREE.Vector3(0, 0, hz + 3).applyAxisAngle(new THREE.Vector3(0, 1, 0), toB2).add(pos);   // just outside the gate
  // rundown picnic tables: faded slats, one missing plank, one knocked askew
  const table = (x, z, ry, broken) => { const g = new THREE.Group(); g.position.set(x, 0.1, z); g.rotation.y = ry; park.add(g);
    const slats = broken ? [0, 1, 3, 4] : [0, 1, 2, 3, 4];
    for (const k of slats) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.045, 0.14), k % 2 ? wood : woodOld); m.position.set(0, 0.74, -0.32 + k * 0.16); m.rotation.z = (Math.random() - 0.5) * 0.03; m.castShadow = true; g.add(m); }
    for (const sz of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.045, 0.26), woodOld); m.position.set(0, 0.44, sz * 0.72); m.castShadow = true; g.add(m); }
    for (const sx of [-0.75, 0.75]) for (const s2 of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), iron); leg.position.set(sx, 0.4, s2 * 0.4); leg.rotation.x = s2 * 0.62; g.add(leg); }
    const c = Math.abs(Math.cos(ry)) > 0.7; wbox(x - (c ? 1 : 0.95), 0, z - (c ? 0.95 : 1), x + (c ? 1 : 0.95), 0.8, z + (c ? 0.95 : 1)); };
  table(-6.5, -3.5, 0.05, false); table(-6, 2.8, -0.1, true); table(0.5, -4.5, 0.02, false); table(6.8, -2.5, 0.35, false);
  // two green NYC slat benches along the fence; Igor sits on the one by the gate
  const bench = (x, z, ry) => { const g = new THREE.Group(); g.position.set(x, 0.1, z); g.rotation.y = ry; park.add(g);
    for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.045, 0.12), benchGreen); m.position.set(0, 0.45, -0.18 + k * 0.15); g.add(m); }
    for (let k = 0; k < 2; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.04), benchGreen); m.position.set(0, 0.62 + k * 0.17, -0.27); m.rotation.x = -0.18; g.add(m); }
    for (const sx of [-0.85, 0.85]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.5), iron); m.position.set(sx, 0.4, -0.05); g.add(m); } return g; };
  const igorBench = bench(3.2, 5.6, Math.PI); bench(-4, -7, 0);
  wbox(2.2, 0, 5.2, 4.2, 0.9, 6.1); wbox(-5, 0, -7.4, -3, 0.9, -6.5);
  add(new THREE.CylinderGeometry(0.3, 0.28, 0.9, 12), new THREE.MeshStandardMaterial({ color: 0x1f3d2a, roughness: 0.6, metalness: 0.3 }), -9.5, 0.55, 6.5);
  add(new THREE.CylinderGeometry(0.07, 0.1, 5.5, 8), iron, 9.5, 2.85, 6.8); add(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffe0a0, emissiveIntensity: 0.6 }), 9.5, 5.7, 6.8);
  for (let k = 0; k < 14; k++) add(new THREE.BoxGeometry(0.08 + Math.random() * 0.12, 0.01, 0.05 + Math.random() * 0.1), new THREE.MeshStandardMaterial({ color: [0xe8e2d0, 0xc8201e, 0x2a62c8, 0xf2c418][k % 4], roughness: 0.9 }), (Math.random() - 0.5) * Wd * 0.9, 0.11, (Math.random() - 0.5) * Dd * 0.9, 0, Math.random() * 3);
  // ---- Igor: short (1.62 m), heavy-set, buzz-cut dark hair, black t-shirt, dark jeans, white sneakers, sitting -----------
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0b594, roughness: 0.6 }), shirt = new THREE.MeshStandardMaterial({ color: 0x131313, roughness: 0.9 }), jeans = new THREE.MeshStandardMaterial({ color: 0x28324a, roughness: 0.85 }), hair = new THREE.MeshStandardMaterial({ color: 0x2a211a, roughness: 0.9 }), shoe = new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.6 });
  const igor = new THREE.Group(); igorBench.add(igor); igor.position.set(0.35, 0, 0.05);
  const part = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, 0, rz); m.castShadow = true; igor.add(m); return m; };
  part(new THREE.SphereGeometry(0.3, 16, 12), shirt, 0, 0.82, 0.02, 1.25, 1.05, 1.15);          // big round belly + chest
  part(new THREE.SphereGeometry(0.26, 14, 10), shirt, 0, 1.1, 0.0, 1.3, 0.8, 1.0);              // shoulders
  part(new THREE.CylinderGeometry(0.1, 0.11, 0.12, 12), skin, 0, 1.3, 0.02);                   // neck (short)
  part(new THREE.SphereGeometry(0.13, 16, 12), skin, 0, 1.44, 0.03, 1.02, 1.08, 1.05);         // head, round
  part(new THREE.SphereGeometry(0.135, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, 0, 1.47, 0.015, 1.02, 0.75, 1.05); // buzz cut
  part(new THREE.SphereGeometry(0.03, 8, 6), skin, 0, 1.43, 0.16);                             // nose
  for (const s2 of [-1, 1]) {
    part(new THREE.SphereGeometry(0.022, 8, 6), skin, s2 * 0.13, 1.44, 0.03);                  // ears
    part(new THREE.CapsuleGeometry(0.075, 0.12, 4, 10), shirt, s2 * 0.36, 1.03, 0.02, 1, 1, 1, 0, s2 * 0.25);   // sleeves
    part(new THREE.CapsuleGeometry(0.06, 0.22, 4, 10), skin, s2 * 0.4, 0.8, 0.14, 1, 1, 1, -0.9, s2 * 0.1);     // forearms on the thighs
    part(new THREE.SphereGeometry(0.055, 8, 6), skin, s2 * 0.34, 0.62, 0.3);                    // hands
    part(new THREE.CapsuleGeometry(0.1, 0.34, 4, 10), jeans, s2 * 0.14, 0.52, 0.22, 1.1, 1, 1, Math.PI / 2);     // thighs
    part(new THREE.CapsuleGeometry(0.075, 0.3, 4, 10), jeans, s2 * 0.15, 0.27, 0.44);          // shins
    part(new THREE.BoxGeometry(0.11, 0.08, 0.27), shoe, s2 * 0.15, 0.05, 0.5);                 // sneakers
  }
  // merge the static park (pad, fence, tables, benches, litter, Igor) into one mesh per material: it was ~600 draw calls
  { park.updateMatrixWorld(true); const inv = park.matrixWorld.clone().invert(); const byMat = new Map(); const kill = [];
    park.traverse((o) => { if (!o.isMesh) return; const g = o.geometry.clone().applyMatrix4(inv.clone().multiply(o.matrixWorld)); const gg = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gg.deleteAttribute(k); if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2)); (byMat.get(o.material) || byMat.set(o.material, []).get(o.material)).push(gg); kill.push(o); });
    for (const o of kill) o.parent.remove(o);
    for (const [mat, list] of byMat) { const m = new THREE.Mesh(mergeGeometries(list, false), mat); m.castShadow = mat !== iron; m.receiveShadow = true; park.add(m); } }
  const ipos = igorBench.getWorldPosition(new THREE.Vector3()); ipos.y = 0;
  // name tag
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.font = '700 34px Barlow, Arial'; x.textAlign = 'center'; x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(40, 10, 176, 44); x.fillStyle = '#ffd27a'; x.fillText('IGOR', 128, 44);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true })); tag.scale.set(1.1, 0.28, 1); tag.position.set(0, 1.95, 0); igor.add(tag);
  return ipos;
}

// ---- lobby doors: two sliding glass leaves in every lobby entrance; closed = collider, open when anyone is within 2.5 m ----
function buildDoors(world) {
  const { ctx, scene } = world; H.doors = [];
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x9fb0b8, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.45, envMapIntensity: 1.3 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.4, metalness: 0.8 });
  for (const t of H.towers) for (const d of t.lobby.doors) {
    const g = new THREE.Group(); g.position.copy(d.plane); g.rotation.y = Math.atan2(d.along.x, d.along.z) - Math.PI / 2; scene.add(g);
    const leaves = [-1, 1].map((s2) => { const L = new THREE.Group(); const pane = new THREE.Mesh(new THREE.BoxGeometry(d.half - 0.04, 2.1, 0.03), glass); pane.position.y = 1.05; L.add(pane);
      for (const [w, h, x, y] of [[d.half, 0.08, 0, 2.1], [d.half, 0.08, 0, 0.04], [0.06, 2.1, s2 * (d.half / 2 - 0.03), 1.05], [0.06, 2.1, -s2 * (d.half / 2 - 0.03), 1.05], [0.04, 0.5, -s2 * (d.half / 2 - 0.2), 1.1]]) { const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), frame); f.position.set(x, y, 0); L.add(f); }
      L.position.x = s2 * d.half / 2; g.add(L); return { L, s2 }; });
    const hw = d.half + 0.1, ax = d.along; const box = new THREE.Box3(new THREE.Vector3(d.plane.x - Math.abs(ax.x) * hw - Math.abs(ax.z) * 0.12, 0, d.plane.z - Math.abs(ax.z) * hw - Math.abs(ax.x) * 0.12), new THREE.Vector3(d.plane.x + Math.abs(ax.x) * hw + Math.abs(ax.z) * 0.12, 2.3, d.plane.z + Math.abs(ax.z) * hw + Math.abs(ax.x) * 0.12));
    ctx.colliders.push(box);
    H.doors.push({ d, leaves, box, open: 0, closed: true });
  }
}
function updateDoors(dt) {
  const { ctx } = H; const who = [ctx.player?.position]; const net = ctx.net; if (net?.list) for (const id of net.list()) { const q = net.peer(id); if (q) who.push(q.pos); }
  let changed = false;
  for (const D of H.doors) {
    const near = who.some((p) => p && Math.hypot(p.x - D.d.plane.x, p.z - D.d.plane.z) < 2.6 && Math.abs(p.y - D.d.plane.y) < 2);
    D.open = Math.max(0, Math.min(1, D.open + (near ? 3 : -2) * dt));
    for (const { L, s2 } of D.leaves) L.position.x = s2 * (D.d.half / 2 + D.open * (D.d.half - 0.05));
    const wantClosed = D.open < 0.3;
    if (wantClosed !== D.closed) { D.closed = wantClosed; if (wantClosed) ctx.colliders.push(D.box); else { const k = ctx.colliders.indexOf(D.box); if (k > -1) ctx.colliders.splice(k, 1); } changed = true; }
  }
  if (changed) try { ctx.player?.rebuildColliders?.(); } catch {}
}

// ---- the red car: the group's ride, parked by building 2. One real drivable car per client; whoever drives it announces
// 'red' taken/parked so every other client hides / re-parks its copy (the driver is shown by net.js as a red remote car).
function buildRedCar(world) {
  const { ctx } = H; const cars = world.parkedCars || []; const [sx, , sz] = world.W.onlineStart || [H.b2.centre.x, 0, H.b2.centre.z];
  let best = null, bd = 1e9; for (const c of cars) { if (c.gone || c.kind === 'van') continue; const d = Math.hypot(c.x - sx, c.z - sz); if (d > 12 && d < bd) { bd = d; best = c; } }
  if (!best || !ctx.vehicles?.spawnCar) return;
  const i = cars.indexOf(best); stealLocal(i, false);   // the kerb slot becomes the red car
  const car = ctx.vehicles.spawnCar(best.x, best.z, (best.ry || 0) - Math.PI / 2, 'sedan', 0xb3121c, 0);
  if (!car) return; car.isRed = true; H.red = { car, mine: false, hidden: false };
  // a red marker so friends can find it
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d'); g.font = '700 30px Barlow, Arial'; g.textAlign = 'center'; g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(20, 10, 216, 44); g.fillStyle = '#ff5a5a'; g.fillText('THE RED CAR', 128, 42);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true })); tag.scale.set(1.8, 0.45, 1); tag.position.set(0, 2.4, 0); car.group.add(tag); H.red.tag = tag;
}
function redHide(v) { const r = H.red; if (!r || r.hidden === v) return; r.hidden = v; const car = r.car; car.group.visible = !v;
  if (v) { r.saved = car.pos.clone(); car.pos.y = -500; } else if (r.saved && car.pos.y < -100) car.pos.copy(r.saved);   // hidden copy must not be mountable (vehicles.js finds cars by pos)
  const k = H.ctx.colliders.indexOf(car.box); if (v && k > -1) H.ctx.colliders.splice(k, 1); if (!v && k < 0) H.ctx.colliders.push(car.box); try { H.ctx.player?.rebuildColliders?.(); } catch {} }
function updateRed() {
  if (!H.redTried && H.ctx.vehicles?.spawnCar) { H.redTried = true; try { buildRedCar(H.world); } catch (e) { console.warn('[hangout] red car', e); } }   // vehicles.js boots after the world
  const r = H.red; if (!r) return; const mv = H.ctx.vehicles?.mounted;
  if (mv === r.car && !r.mine) { r.mine = true; r.tag.visible = false; H.ctx.net?.send?.('red', { s: 'taken' }); }
  else if (r.mine && mv !== r.car) { r.mine = false; r.tag.visible = true; const c = r.car; H.ctx.net?.send?.('red', { s: 'parked', x: +c.pos.x.toFixed(2), z: +c.pos.z.toFixed(2), y: +c.pos.y.toFixed(2), h: +c.heading.toFixed(3) }); }
}
function onRemoteRed(m) {
  const r = H.red; if (!r || r.mine) return;
  if (m.s === 'taken') return redHide(true);
  if (m.s === 'parked' && Number.isFinite(+m.x)) { const c = r.car; c.pos.set(+m.x, +m.y || 0, +m.z); c.heading = +m.h || 0; c.group.position.copy(c.pos); c.group.rotation.set(0, c.heading, 0);
    const cs = Math.cos(c.heading), sn = Math.sin(c.heading), hx = Math.abs(cs) * 0.95 + Math.abs(sn) * 2.35, hz = Math.abs(sn) * 0.95 + Math.abs(cs) * 2.35; c.box.min.set(c.pos.x - hx, c.pos.y, c.pos.z - hz); c.box.max.set(c.pos.x + hx, c.pos.y + 1.5, c.pos.z + hz); redHide(false); }
}

// ---- the Wonder Wheel ride ------------------------------------------------------------------------------------------------
const _ww = new THREE.Vector3();
function rideWheel(WW) {
  let best = 0, by = Infinity; for (let i = 0; i < WW.n; i++) { const y = WW.pos(i, _ww).y; if (y < by) { by = y; best = i; } }   // the cabin at the bottom
  H.wheel = { WW, i: best, t: 0, promptT: 0 }; H.ctx.player.mounted = { wheel: true };
  H.ctx.hud?.toast?.('All aboard — F to get off', 1800);
}
function updateWheelRide(dt) {
  const r = H.wheel; if (!r) return; const { ctx } = H; const p = ctx.player;
  if (p.dead || !p.mounted?.wheel) { H.wheel = null; return; }
  r.t += dt; r.promptT -= dt;
  const at = r.WW.pos(r.i, _ww);
  const off = r.t > 20 && at.y < r.WW.base.y + 1.2;   // came round to the bottom again
  if (off || (ctx.state === 'playing' && ctx.input?.pressed?.has?.('KeyF'))) {
    ctx.input?.pressed?.delete?.('KeyF'); H.wheel = null; p.mounted = null; const b = r.WW.base; p.teleport(b.x + 1.5, b.y, b.z - 1.2, p.yaw, 0); return;
  }
  if (r.promptT <= 0) { ctx.hud?.toast?.('F — GET OFF THE WHEEL', 900); r.promptT = 3; }
  p.position.copy(at); p.velocity?.set?.(0, 0, 0);
  const cam = ctx.camera; cam.position.set(at.x, at.y + 1.55, at.z); cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ'); p.cameraPosition?.copy?.(cam.position);
  ctx.interactNear = true;
}

// ---- Igor -------------------------------------------------------------------------------------------------------------------
function buyIgor() {
  const { ctx } = H;
  if (K.full()) { ctx.hud?.toast?.(`IGOR: "Finish what you got first." (B to use)`, 2200); return; }
  if (!K.pay(PRICE)) { ctx.hud?.toast?.('IGOR: "No money, no honey."', 2200); return; }
  const item = (H.buys++ % 2 === 0) ? 'weed' : 'bottle'; K.give(item);
  ctx.hud?.toast?.(item === 'weed' ? 'IGOR: "Ten bucks. B to blaze — pass it around."' : 'IGOR: "Here, a bottle. B to drink — share with the boys."', 2800);
  try { ctx.audio?.play?.('ui_click'); } catch {}
  ctx.net?.send?.('igor');
}

/** QA hooks (window.__game.hangout) */
export const hangoutQA = {
  state: () => { const s = K.state(); return H && s && { ...s, stash: s.inv.length, igor: H.igor?.toArray(), start: H.world.W.onlineStart, b2: H.b2?.centre.toArray(), lobby: H.b2?.lobby.cars.map((c) => c.pos.toArray()), top: H.b2?.top[0].cars.map((c) => c.pos.toArray()), deli: H.deli && { sammy: H.deli.sammy.toArray(), counter: H.deli.counter.toArray(), door: H.deli.door.toArray(), inside: H.deli.inside.toArray(), face: H.deli.face } }; },
  buy: () => buyIgor(), use: () => K.useItem(), light: () => { K.give('weed'); K.useItem(); }, ride: (dir = 'up', k = 0) => K.callElevator(H.towers.indexOf(H.b2), k, dir), steal: () => { const c = K.nearestParked(1e9); if (c) K.steal(c); return !!c; },
  park: () => K.pickRespawn(), wheel: () => { const WW = H.world.W.wonderWheel; if (WW) rideWheel(WW); return !!WW; }, wheelState: () => H.wheel && { i: H.wheel.i, t: +H.wheel.t.toFixed(1), y: +H.ctx.player.position.y.toFixed(1) }, choose: (i) => K.choose(i), close: () => K.closeDialog(), give: (n) => K.earn(n), drop: (n = 30) => { const p = H.ctx.player.position; K.dropCash(p.clone().add(new THREE.Vector3(3, 0, 0)), n); },
};
