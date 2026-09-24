// CONEY hangout — "recreate our youth": Igor in the park by Luna Park building 2 sells a $10 bag; any Luna Park lobby has
// 3 steel elevators to the 19th-floor gallery (friends standing with you ride along, online); light up up there (friends
// see the smoke) and the world goes soft and blurry for a while; ride down, steal a car off the kerb and drive around —
// friends can hop in as passengers. Everything is synced over net.js events (net:igor/elev/steal/smoke). CONEY agent.
import * as THREE from 'three';
import { buildCrowd } from '../crowd.js';
import { hideParkedCar } from '../carkit.js';
import { OSM } from './osm.js';
import { cen, pip } from '../osmkit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const B2 = new THREE.Vector3(163, 0, -445);      // OSM "Luna Park Houses 2" centre (map frame)
const START_CASH = 20, PRICE = 10;
const RIDE_T = 4.2, FADE = 0.45;

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
  H = { world, ctx, towers, b2, igor, cash: START_CASH, stash: 0, item: null, buys: 0, drunk: 0, drunkT: -1, riding: null, high: 0, highT: -1, joint: null, puffs: [], passenger: null, promptT: 0, lastPrompt: '', smokeT: 0, ui: null };
  H.igor = buildIgor(world, M, igor);   // the interaction point is Igor's bench, not the park centre
  if (H.gate) { const g = H.gate, dx = H.igor.x - g.x, dz = H.igor.z - g.z; W.onlineStart = [g.x, 0, g.z, Math.atan2(-dx, -dz)]; }   // friends spawn at Igor's gate
  buildDoors(world);
  buildUI(); buildPuffs(world);
  ctx.bus.on('net:elev', (m) => onRemoteElev(m));
  ctx.bus.on('net:steal', (m) => stealLocal(m.i, false));
  ctx.bus.on('net:red', (m) => onRemoteRed(m));
  ctx.bus.on('net:smoke', (m) => { if (!Array.isArray(m.p)) return; const at = new THREE.Vector3(...m.p); puff(at); const me = ctx.player?.position; if (me && !me.dead && at.distanceTo(me) < 4) { H.high = Math.min(1, H.high + 0.18); H.highT = Math.max(H.highT, 150); } });   // passing it around: friends within 5 m get lifted too
  ctx.bus.on('net:drink', (m) => { if (!Array.isArray(m.p)) return; const me = ctx.player?.position; if (me && !me.dead && new THREE.Vector3(...m.p).distanceTo(me) < 4) { drink(false); ctx.hud?.toast?.(`${ctx.net?.peer?.(m.f)?.name || 'A friend'} passed you the bottle`, 1800); } });
  ctx.bus.on('net:igor', (m) => ctx.hud?.toast?.(`${ctx.net?.peer?.(m.f)?.name || 'Someone'} bought from Igor`, 1800));
  ctx.bus.on('playerDied', () => { endRide(true); leavePassenger(); });
  buildParkRespawn();
  world.updaters.push((dt) => update(dt));
  console.log('[hangout] building 2 at', b2.centre.toArray().map((v) => v.toFixed(0)).join(','), '· igor at', igor.x.toFixed(0), igor.z.toFixed(0), '· towers', towers.length, '· parked cars', (world.parkedCars || []).length);
}

// ---------------------------------------------------------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------------------------------------------------------
function update(dt) {
  const { ctx } = H; const p = ctx.player; if (!p) return;
  const playing = ctx.state === 'playing' && !p.dead;
  // effects run regardless
  updateHigh(dt); updatePuffs(dt); updateJoint(dt); updateDoors(dt); updateRed();
  if (playing && ctx.input?.pressed?.has?.('KeyB') && (H.riding || H.passenger || ctx.vehicles?.mounted)) { ctx.input.pressed.delete('KeyB'); useItem(); }
  if (H.riding) return updateRide(dt);
  if (H.passenger) return updatePassenger(dt);
  if (!playing) return;
  const F = ctx.input?.pressed?.has?.('KeyF');
  if (ctx.input?.pressed?.has?.('KeyB')) { ctx.input.pressed.delete('KeyB'); useItem(); }   // B = blaze / drink, anywhere (also while riding)
  const pos = p.position; const near = (v, r, dy = 1.2) => Math.hypot(v.x - pos.x, v.z - pos.z) < r && Math.abs(v.y - pos.y) < dy;
  const mounted = !!ctx.vehicles?.mounted;
  let prompt = null, act = null;
  if (!mounted) {
    if (near(H.igor, 2.4)) { prompt = H.stash ? 'IGOR: "Go up top, enjoy the view."' : `F — TALK TO IGOR ($${PRICE})`; act = H.stash ? null : buyIgor; }
    if (!act) for (let ti = 0; ti < H.towers.length && !act; ti++) {
      const t = H.towers[ti];
      t.lobby.cars.forEach((c, k) => { if (!act && near(c.pos, 1.4)) { prompt = 'F — ELEVATOR ▲ 19'; act = () => callElevator(ti, k, 'up'); } });
      t.top.forEach((side, si) => side.cars.forEach((c, k) => { if (!act && near(c.pos, 1.4)) { prompt = 'F — ELEVATOR ▼ LOBBY'; act = () => callElevator(ti, k, 'down', si); } }));
    }
    if (!act) { const c = nearestParked(3.0); if (c) { prompt = 'F — STEAL CAR'; act = () => steal(c); } }
    if (!act) { const f = nearestFriendCar(3.8); if (f) { prompt = `F — HOP IN WITH ${f.name}`; act = () => enterPassenger(f.id); } }
  }
  ctx.interactNear = !!act;   // next frame's weapons.js leaves F alone while a prompt is up
  H.promptT -= dt;
  if (prompt && (prompt !== H.lastPrompt || H.promptT <= 0)) { ctx.hud?.toast?.(prompt, 700); H.promptT = 0.4; }
  H.lastPrompt = prompt || '';
  if (F && act) { ctx.input.pressed.delete('KeyF'); act(); }
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

// ---- Igor -------------------------------------------------------------------------------------------------------------------
function buyIgor() {
  const { ctx } = H;
  if (H.item) { ctx.hud?.toast?.(`IGOR: "Finish what you got first." (B to use)`, 2200); return; }
  if (H.cash < PRICE) { ctx.hud?.toast?.('IGOR: "No money, no honey."', 2200); return; }
  H.cash -= PRICE; H.item = (H.buys++ % 2 === 0) ? 'weed' : 'bottle'; H.stash = 1; renderCash();
  ctx.hud?.toast?.(H.item === 'weed' ? 'IGOR: "Ten bucks. B to blaze — pass it around."' : 'IGOR: "Here, a bottle. B to drink — share with the boys."', 2800);
  try { ctx.audio?.play?.('ui_click'); } catch {}
  ctx.net?.send?.('igor');
}

/** B: use what you hold, anywhere. Weed = lifted/blurry (~2.5 min), bottle = drowsy/heavy (~2 min); friends within a few metres share it. */
function useItem() {
  const { ctx } = H; if (!H.item) { ctx.hud?.toast?.('Nothing on you — see Igor ($10)', 1600); return; }
  const it = H.item; H.item = null; H.stash = 0; renderCash();
  if (it === 'weed') return lightUp();
  drink(true);
}
function drink(mine) {
  const { ctx } = H; H.drunk = Math.min(1, (H.drunk || 0) + 0.55); H.drunkT = 120;
  if (mine) {
    const p = ctx.player.position; ctx.net?.send?.('drink', { p: [+p.x.toFixed(2), +(p.y + 1.5).toFixed(2), +p.z.toFixed(2)] });
    ctx.hud?.toast?.('*glug glug*', 1400);
    if (!H.bottle) { const g = new THREE.Group(); const glass = new THREE.MeshPhysicalMaterial({ color: 0x5a3a12, roughness: 0.1, transparent: true, opacity: 0.8 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 12), glass); g.add(body); const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.016, 0.07, 10), glass); neck.position.y = 0.1; g.add(neck);
      const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0305, 0.0305, 0.05, 12), new THREE.MeshStandardMaterial({ color: 0xe8dcc0 })); g.add(label); g.position.set(0.1, -0.12, -0.3); g.rotation.set(0.9, 0, -0.3); H.bottle = g; }
    ctx.camera.add(H.bottle); H.bottle.visible = true; if (ctx.weapons?.viewmodel) ctx.weapons.viewmodel.visible = false;
    clearTimeout(H.bottleT); H.bottleT = setTimeout(() => { H.bottle.visible = false; if (ctx.weapons?.viewmodel && H.smokeT <= 0) ctx.weapons.viewmodel.visible = true; }, 2600);
  }
}

// ---- elevators ----------------------------------------------------------------------------------------------------------------
function callElevator(ti, k, dir, side = 0) {
  const { ctx } = H; const p = ctx.player.position;
  ctx.net?.send?.('elev', { i: ti, k, d: dir, s: side, p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)] });
  startRide(ti, k, dir, side);
}
function onRemoteElev(m) {
  if (H.riding || H.passenger || !Array.isArray(m.p)) return; const p = H.ctx.player; if (!p || p.dead || H.ctx.vehicles?.mounted) return;
  // anyone standing with the caller (same floor, a few metres) rides along
  if (Math.hypot(p.position.x - m.p[0], p.position.z - m.p[2]) < 3.5 && Math.abs(p.position.y - m.p[1]) < 1.5) { H.ctx.hud?.toast?.(`${H.ctx.net?.peer?.(m.f)?.name || 'A friend'} holds the door…`, 1400); startRide(m.i, m.k, m.d, m.s || 0, 0.6); }
}
function startRide(ti, k, dir, side, delay = 0) {
  const { ctx } = H; const t = H.towers[ti]; if (!t) return;
  const dest = dir === 'up' ? { ...t.top[0].cars[k], face: t.top[0].view.yaw } : { ...t.lobby.cars[k], face: t.lobby.cars[k].yaw + Math.PI };
  H.riding = { t: -delay, dest, dir, floor: dir === 'up' ? 1 : 19, jitter: (Math.random() - 0.5) * 0.5, moved: false };
  ctx.player.mounted = { elevator: true };
  try { ctx.audio?.play?.('ui_click'); } catch {}
}
function updateRide(dt) {
  const r = H.riding, { ctx } = H; r.t += dt; const p = ctx.player;
  const k = r.t < 0 ? 0 : r.t < FADE ? r.t / FADE : r.t < RIDE_T - FADE ? 1 : Math.max(0, (RIDE_T - r.t) / FADE);
  H.ui.fade.style.opacity = k.toFixed(3);
  const prog = Math.min(1, Math.max(0, (r.t - FADE) / (RIDE_T - 2 * FADE)));
  const fl = r.dir === 'up' ? Math.round(1 + prog * 18) : Math.round(19 - prog * 18);
  H.ui.floor.textContent = r.t > 0 ? `${r.dir === 'up' ? '▲' : '▼'} ${fl === 1 ? 'L' : fl}` : '';
  if (!r.moved && r.t >= RIDE_T / 2) { // teleport at the darkest moment
    const d = r.dest; const side = new THREE.Vector3(Math.cos(d.face), 0, -Math.sin(d.face));
    p.mounted = null; p.teleport(d.pos.x + side.x * r.jitter, d.pos.y, d.pos.z + side.z * r.jitter, d.face, 0); p.mounted = { elevator: true }; r.moved = true;
  }
  if (r.t >= RIDE_T) endRide();
}
function endRide(force = false) { if (!H?.riding) return; H.riding = null; H.ui.fade.style.opacity = '0'; H.ui.floor.textContent = ''; const p = H.ctx.player; if (p?.mounted?.elevator) p.mounted = null; if (!force) try { H.ctx.audio?.play?.('ui_click'); } catch {} }

// ---- smoking + the high ---------------------------------------------------------------------------------------------------------
function lightUp() {
  const { ctx } = H; H.stash = 0; H.smokeT = 11; H.puffT = 0.6;
  ctx.hud?.toast?.('…', 1200);
  if (!H.joint) { // a small joint + ember held low in the view
    const g = new THREE.Group();
    const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.006, 0.075, 8), new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 0.9 })); paper.rotation.z = Math.PI / 2.3; g.add(paper);
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.0062, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff6a20 })); ember.position.set(0.035, 0.014, 0); g.add(ember);
    g.position.set(-0.12, -0.13, -0.32); g.rotation.set(0.3, 0.6, 0); H.joint = { g, ember }; }
  ctx.camera.add(H.joint.g); H.joint.g.visible = true;
  if (ctx.weapons?.viewmodel) ctx.weapons.viewmodel.visible = false;
}
function updateJoint(dt) {
  if (H.smokeT <= 0) return; const { ctx } = H;
  H.smokeT -= dt; H.puffT -= dt;
  if (H.joint) H.joint.ember.material.color.setHSL(0.05, 1, 0.45 + 0.15 * Math.sin(performance.now() / 180));
  if (H.puffT <= 0) {
    H.puffT = 1.6 + Math.random() * 0.8;
    const cam = ctx.camera; const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    const at = cam.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, 0.45).add(new THREE.Vector3(0, -0.08, 0));
    puff(at); ctx.net?.send?.('smoke', { p: [+at.x.toFixed(2), +at.y.toFixed(2), +at.z.toFixed(2)] });
    H.high = Math.min(1, H.high + 0.22); H.highT = 150;   // each hit deepens it; it lingers ~2.5 min (long enough for the drive), fading over the last 40 s
  }
  if (H.smokeT <= 0) { if (H.joint) H.joint.g.visible = false; if (ctx.weapons?.viewmodel) ctx.weapons.viewmodel.visible = true; ctx.hud?.toast?.('…the whole island is glowing.', 2400); }
}
function updateHigh(dt) {
  const { ctx } = H; const cv = ctx.canvas; if (!cv) return;
  if (H.highT > 0) { H.highT -= dt; if (H.highT < 40) H.high = Math.max(0, H.high - dt / 40); }
  if (H.drunkT > 0) { H.drunkT -= dt; if (H.drunkT < 30) H.drunk = Math.max(0, H.drunk - dt / 30); } else H.drunk = 0;
  const k = H.high, d = H.drunk || 0;
  if (k <= 0.001 && d <= 0.001) { if (cv.style.filter) { cv.style.filter = ''; cv.style.transform = ''; } return; }
  const t = performance.now() / 1000;
  // weed: soft blur, saturated, slow hue drift + gentle wobble · bottle: heavy-lidded (darker, desaturated), double vision, big slow sway
  const blur = 2.6 * k + 1.6 * d * (0.6 + 0.4 * Math.sin(t * 0.7));
  const ghost = d > 0.05 ? ` drop-shadow(${(9 * d * Math.sin(t * 0.9)).toFixed(1)}px ${(3 * d).toFixed(1)}px 0 rgba(255,255,255,${(0.25 * d).toFixed(2)}))` : '';
  cv.style.filter = `blur(${blur.toFixed(2)}px) saturate(${(1 + 0.45 * k - 0.35 * d).toFixed(2)}) brightness(${(1 - 0.22 * d * (0.7 + 0.3 * Math.sin(t * 0.4))).toFixed(2)}) contrast(${(1 - 0.06 * k).toFixed(3)}) hue-rotate(${(Math.sin(t * 0.3) * 8 * k).toFixed(1)}deg)${ghost}`;
  cv.style.transform = `rotate(${(Math.sin(t * 0.55) * 0.8 * k + Math.sin(t * 0.33) * 2.4 * d).toFixed(3)}deg) scale(${(1 + 0.025 * k + 0.03 * d + Math.sin(t * 0.9) * 0.006 * (k + d)).toFixed(4)}) translateY(${(Math.sin(t * 0.5) * 6 * d).toFixed(1)}px)`;
}
function buildPuffs(world) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(235,235,230,0.55)'); gr.addColorStop(1, 'rgba(235,235,230,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  H.puffTex = new THREE.CanvasTexture(c);
}
function puff(at) {
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: H.puffTex, transparent: true, depthWrite: false, opacity: 0.6 }));
    s.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.15, Math.random() * 0.1, (Math.random() - 0.5) * 0.15)); s.scale.setScalar(0.25);
    H.world.scene.add(s); H.puffs.push({ s, t: 0, life: 3.5 + Math.random() * 2, v: new THREE.Vector3((Math.random() - 0.5) * 0.25, 0.25 + Math.random() * 0.2, (Math.random() - 0.5) * 0.25) });
  }
}
function updatePuffs(dt) {
  for (let i = H.puffs.length - 1; i >= 0; i--) { const q = H.puffs[i]; q.t += dt; q.s.position.addScaledVector(q.v, dt); q.s.scale.setScalar(0.25 + q.t * 0.55); q.s.material.opacity = 0.55 * (1 - q.t / q.life); if (q.t >= q.life) { H.world.scene.remove(q.s); q.s.material.dispose(); H.puffs.splice(i, 1); } }
}

// ---- cars ---------------------------------------------------------------------------------------------------------------------
function nearestParked(r) {
  const p = H.ctx.player.position; let best = null, bd = r;
  for (const c of H.world.parkedCars || []) { if (c.gone) continue; const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; best = c; } }
  return best;
}
function steal(c) {
  const { ctx } = H; const i = (H.world.parkedCars || []).indexOf(c); if (i < 0) return;
  stealLocal(i, true);
  const car = ctx.vehicles?.spawnCar?.(c.x, c.z, (c.ry || 0) - Math.PI / 2, c.kind === 'cab' ? 'sedan' : c.kind, c.color ?? 0x22305c, 0);
  if (car) { ctx.vehicles.mount(car); ctx.hud?.toast?.('Hot-wired it. Drive.', 1800); }
  ctx.net?.send?.('steal', { i });
}
function stealLocal(i, mine) {
  const c = (H.world.parkedCars || [])[i]; if (!c || c.gone) return; const { ctx } = H;
  hideParkedCar(c);
  if (c.box) { const k = ctx.colliders.indexOf(c.box); if (k > -1) ctx.colliders.splice(k, 1); try { ctx.player?.rebuildColliders?.(); } catch {} }
}

// ---- passenger in a friend's car ---------------------------------------------------------------------------------------------
function nearestFriendCar(r) {
  const net = H.ctx.net; if (!net?.list) return null; const p = H.ctx.player.position; let best = null, bd = r;
  for (const id of net.list()) { const q = net.peer(id); if (!q?.veh || q.veh.k === 'pass') continue; const d = Math.hypot(q.pos.x - p.x, q.pos.z - p.z); if (d < bd) { bd = d; best = q; } }
  return best;
}
function enterPassenger(id) { H.passenger = { id }; H.ctx.player.mounted = { passenger: true }; H.ctx.hud?.toast?.('F — GET OUT', 1600); }
function leavePassenger() {
  if (!H?.passenger) return; const { ctx } = H; const q = ctx.net?.peer?.(H.passenger.id); H.passenger = null;
  const p = ctx.player; p.mounted = null;
  if (q) { const h = q.heading; const right = new THREE.Vector3(Math.cos(h), 0, -Math.sin(h)); p.teleport(q.pos.x + right.x * 2.2, q.pos.y, q.pos.z + right.z * 2.2, p.yaw, 0); }
}
function updatePassenger(dt) {
  const { ctx } = H; const q = ctx.net?.peer?.(H.passenger.id); const p = ctx.player;
  if (!q || !q.veh || q.dead || ctx.input?.pressed?.has?.('KeyF')) { ctx.input?.pressed?.delete?.('KeyF'); return leavePassenger(); }
  const h = q.heading; const fwd = new THREE.Vector3(-Math.sin(h), 0, -Math.cos(h)), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const bike = q.veh.k === 'bike', sid = [...(ctx.net?.id || 'x')].reduce((a, c) => a + c.charCodeAt(0), 0) % 3;
  const SEATS = [[0.4, 0.15], [-0.4, -0.85], [0.4, -0.85]];   // front passenger, rear left, rear right (metres right, forward)
  const [sr, sf] = bike ? [0, -0.55] : SEATS[sid];
  const seat = q.pos.clone().addScaledVector(right, sr).addScaledVector(fwd, sf);
  p.position.set(seat.x, seat.y + (bike ? 0.55 : 0.3), seat.z); p.velocity?.set?.(0, 0, 0);
  const cam = ctx.camera; cam.position.set(seat.x, seat.y + (bike ? 1.5 : 1.17), seat.z); cam.rotation.set(p.pitch, p.yaw, 0); p.cameraPosition?.copy?.(cam.position);
}

// ---- UI: cash + elevator fade -------------------------------------------------------------------------------------------------
function buildUI() {
  const css = document.createElement('style'); css.textContent = `
  .hgcash{position:fixed;left:18px;bottom:92px;z-index:40;font:700 20px 'Barlow Condensed',Arial;color:#9fe39a;text-shadow:0 1px 2px #000;pointer-events:none;letter-spacing:.06em}
  .hgfade{position:fixed;inset:0;background:#050505;opacity:0;z-index:45;pointer-events:none;transition:none}
  .hgfloor{position:fixed;left:50%;top:44%;transform:translate(-50%,-50%);z-index:46;font:700 64px 'Barlow Condensed',Arial;color:#ffb24a;letter-spacing:.1em;text-shadow:0 0 18px rgba(255,160,40,.6);pointer-events:none}`;
  document.head.appendChild(css);
  const cash = document.createElement('div'); cash.className = 'hgcash'; document.body.appendChild(cash);
  const fade = document.createElement('div'); fade.className = 'hgfade'; document.body.appendChild(fade);
  const floor = document.createElement('div'); floor.className = 'hgfloor'; document.body.appendChild(floor);
  const use = document.createElement('button'); use.textContent = 'USE'; use.style.cssText = 'position:fixed;left:18px;bottom:130px;z-index:46;display:none;padding:12px 18px;font:700 16px Barlow Condensed,Arial;letter-spacing:.12em;color:#fff;background:rgba(40,120,60,.8);border:1px solid rgba(255,255,255,.4);border-radius:6px';
  use.addEventListener('touchstart', (e) => { e.preventDefault(); useItem(); }, { passive: false }); use.addEventListener('click', (e) => { e.stopPropagation(); useItem(); }); document.body.appendChild(use);
  // controls card: shown for 14 s on first spawn, H toggles
  const help = document.createElement('div'); help.style.cssText = 'position:fixed;right:14px;top:60px;z-index:44;background:rgba(8,10,14,.78);border-left:2px solid #ffb24a;color:#e8edf2;font:500 13px Barlow,Arial;padding:10px 14px;line-height:1.55;pointer-events:none;max-width:260px';
  help.innerHTML = '<b style="letter-spacing:.14em;font-family:Barlow Condensed">CONEY — CONTROLS (H)</b><br>F · talk to Igor / elevator / steal car / hop in<br>B · blaze or drink (stand close to share)<br>V · car/bike camera · Space · handbrake<br>Tab · scoreboard · Esc · menu<br>Roof: stairs at the end of the 19th-floor lobby';
  document.body.appendChild(help); setTimeout(() => { help.style.display = 'none'; }, 14000);
  addEventListener('keydown', (e) => { if (e.code === 'KeyH' && !e.repeat) help.style.display = help.style.display === 'none' ? 'block' : 'none'; });
  H.ui = { cash, fade, floor, use, help }; renderCash();
}
function renderCash() { if (!H?.ui) return; H.ui.cash.textContent = `$${H.cash}${H.item === 'weed' ? '  ·  🌿 (B)' : H.item === 'bottle' ? '  ·  🍾 (B)' : ''}`; if (H.ui.use) H.ui.use.style.display = H.item ? 'block' : 'none'; }

/** QA hooks (window.__game.hangout) */
// ---- death screen: "Respawn at Table Park" (button or T). Solo: respawn right now at Igor's gate. Online: net.js keeps its
// countdown (fair to the killer); the choice is remembered and the respawn is moved to the park when it fires.
function buildParkRespawn() {
  const ctx = H.ctx;
  if (!buildParkRespawn.keyed) { buildParkRespawn.keyed = true; addEventListener('keydown', (e) => { if (e.code === 'KeyT' && H?.ctx.state === 'dead') pickPark(); }); }
  ctx.bus.on('state', ({ state }) => { if (state === 'dead') parkBtn(); });   // the HUD is built after the world: add the button lazily
  ctx.bus.on('playerRespawn', () => { if (!H.parkRsp) return; H.parkRsp = false; toPark(); });
}
function parkBtn() {
  const btns = document.querySelector('#hud .dead .btns'); if (!btns) return;
  let b = btns.querySelector('.park-rsp');
  if (!b) { b = document.createElement('button'); b.className = 'btn primary park-rsp'; b.addEventListener('click', (e) => { e.stopPropagation(); pickPark(); }); btns.prepend(b); }
  b.textContent = 'Respawn at Table Park [T]'; b.disabled = false; H.parkBtn = b;
}
function pickPark() {
  const ctx = H?.ctx; if (!ctx || ctx.state !== 'dead') return;
  H.parkRsp = true;
  if (ctx.net?.connected) { if (H.parkBtn) { H.parkBtn.textContent = 'Table Park ✓ — respawning…'; H.parkBtn.disabled = true; } return; }
  ctx.player.respawn();   // emits playerRespawn → toPark()
}
function toPark() {
  const s = H.world.W.onlineStart; if (!s) return; const p = H.ctx.player;
  const cols = H.ctx.colliders, blocked = (x, z) => cols.some((b) => x > b.min.x - 0.4 && x < b.max.x + 0.4 && z > b.min.z - 0.4 && z < b.max.z + 0.4 && b.max.y > 0.3 && b.min.y < 1.8);
  let x = s[0], z = s[2];
  for (let k = 0; k < 10; k++) { const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 2, tx = s[0] + Math.cos(a) * r, tz = s[2] + Math.sin(a) * r; if (!blocked(tx, tz)) { x = tx; z = tz; break; } }   // spread so friends don't stack
  p.teleport(x, s[1], z, s[3], 0);
}

export const hangoutQA = {
  state: () => H && { cash: H.cash, stash: H.stash, item: H.item, drunk: +(H.drunk || 0).toFixed(2), high: +H.high.toFixed(2), riding: !!H.riding, passenger: !!H.passenger, igor: H.igor?.toArray(), start: H.world.W.onlineStart, b2: H.b2?.centre.toArray(), lobby: H.b2?.lobby.cars.map((c) => c.pos.toArray()), top: H.b2?.top[0].cars.map((c) => c.pos.toArray()) },
  buy: () => buyIgor(), use: () => useItem(), light: () => lightUp(), ride: (dir = 'up', k = 0) => callElevator(H.towers.indexOf(H.b2), k, dir), steal: () => { const c = nearestParked(1e9); if (c) steal(c); return !!c; }, park: () => pickPark(),
};
