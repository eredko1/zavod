// CONEY hangout — "recreate our youth": Igor in the park by Luna Park building 2 sells a $10 bag; any Luna Park lobby has
// 3 steel elevators to the 19th-floor gallery (friends standing with you ride along, online); light up up there (friends
// see the smoke) and the world goes soft and blurry for a while; ride down, steal a car off the kerb and drive around —
// friends can hop in as passengers. Everything is synced over net.js events (net:igor/elev/steal/smoke). CONEY agent.
import * as THREE from 'three';
import { buildCrowd } from '../crowd.js';
import { hideParkedCar } from '../carkit.js';
import { OSM } from './osm.js';
import { cen, pip } from '../osmkit.js';

const B2 = new THREE.Vector3(163, 0, -445);      // OSM "Luna Park Houses 2" centre (map frame)
const START_CASH = 20, PRICE = 10;
const RIDE_T = 4.2, FADE = 0.45;

let H = null;

export function buildHangout(world, M) {
  const { ctx, W } = world; const towers = world.lunaTowers || [];
  if (!towers.length) return;
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
  buildIgor(world, M, igor);
  H = { world, ctx, towers, b2, igor, cash: START_CASH, stash: 0, riding: null, high: 0, highT: -1, joint: null, puffs: [], passenger: null, promptT: 0, lastPrompt: '', smokeT: 0, ui: null };
  buildUI(); buildPuffs(world);
  ctx.bus.on('net:elev', (m) => onRemoteElev(m));
  ctx.bus.on('net:steal', (m) => stealLocal(m.i, false));
  ctx.bus.on('net:smoke', (m) => { if (Array.isArray(m.p)) puff(new THREE.Vector3(...m.p)); });
  ctx.bus.on('net:igor', (m) => ctx.hud?.toast?.(`${ctx.net?.peer?.(m.f)?.name || 'Someone'} bought from Igor`, 1800));
  ctx.bus.on('playerDied', () => { endRide(true); leavePassenger(); });
  world.updaters.push((dt) => update(dt));
  console.log('[hangout] building 2 at', b2.centre.toArray().map((v) => v.toFixed(0)).join(','), '· igor at', igor.x.toFixed(0), igor.z.toFixed(0), '· towers', towers.length, '· parked cars', (world.parkedCars || []).length);
}

// ---------------------------------------------------------------------------------------------------------------------------
function buildIgor(world, M, pos) {
  const face = Math.atan2(-(H?.b2?.centre.x ?? pos.x) + pos.x, -(H?.b2?.centre.z ?? pos.z) + pos.z);
  buildCrowd(world, [{ x: pos.x, y: 0, z: pos.z, ry: face, pose: 'stand', s: 1.02 }]);
  // his bench + a lamp, and a name tag
  const g = new THREE.Group(); g.position.copy(pos); g.rotation.y = face; world.scene.add(g);
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.8 }), iron = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.5, metalness: 0.6 });
  for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.14), wood); s.position.set(0, 0.45, -1.2 - k * 0.16); g.add(s); }
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.05), wood); back.position.set(0, 0.75, -1.62); g.add(back);
  for (const x of [-0.8, 0.8]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.5), iron); l.position.set(x, 0.22, -1.35); g.add(l); }
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.font = '700 34px Barlow, Arial'; x.textAlign = 'center'; x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(40, 10, 176, 44); x.fillStyle = '#ffd27a'; x.fillText('IGOR', 128, 44);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true })); tag.scale.set(1.2, 0.3, 1); tag.position.set(0, 2.2, 0); g.add(tag);
  world.box([pos.x - 0.3, 0, pos.z - 0.3], [pos.x + 0.3, 1.8, pos.z + 0.3]);
}

// ---------------------------------------------------------------------------------------------------------------------------
function update(dt) {
  const { ctx } = H; const p = ctx.player; if (!p) return;
  const playing = ctx.state === 'playing' && !p.dead;
  // effects run regardless
  updateHigh(dt); updatePuffs(dt); updateJoint(dt);
  if (H.riding) return updateRide(dt);
  if (H.passenger) return updatePassenger(dt);
  if (!playing) return;
  const F = ctx.input?.pressed?.has?.('KeyF');
  const pos = p.position; const near = (v, r, dy = 1.2) => Math.hypot(v.x - pos.x, v.z - pos.z) < r && Math.abs(v.y - pos.y) < dy;
  const mounted = !!ctx.vehicles?.mounted;
  let prompt = null, act = null;
  if (!mounted) {
    if (near(H.igor, 2.6)) { prompt = H.stash ? 'IGOR: "Go up top, enjoy the view."' : `F — TALK TO IGOR ($${PRICE})`; act = H.stash ? null : buyIgor; }
    if (!act) for (let ti = 0; ti < H.towers.length && !act; ti++) {
      const t = H.towers[ti];
      t.lobby.cars.forEach((c, k) => { if (!act && near(c.pos, 1.4)) { prompt = 'F — ELEVATOR ▲ 19'; act = () => callElevator(ti, k, 'up'); } });
      t.top.forEach((side, si) => side.cars.forEach((c, k) => { if (!act && near(c.pos, 1.4)) { prompt = 'F — ELEVATOR ▼ LOBBY'; act = () => callElevator(ti, k, 'down', si); } }));
      if (!act && H.stash && Math.abs(pos.y - t.yF) < 1.2 && t.centre.distanceTo(new THREE.Vector3(pos.x, 0, pos.z)) < 40) { prompt = 'F — LIGHT UP'; act = lightUp; }
    }
    if (!act) { const c = nearestParked(3.0); if (c) { prompt = 'F — STEAL CAR'; act = () => steal(c); } }
    if (!act) { const f = nearestFriendCar(3.8); if (f) { prompt = `F — RIDE WITH ${f.name}`; act = () => enterPassenger(f.id); } }
  }
  H.promptT -= dt;
  if (prompt && (prompt !== H.lastPrompt || H.promptT <= 0)) { ctx.hud?.toast?.(prompt, 700); H.promptT = 0.4; }
  H.lastPrompt = prompt || '';
  if (F && act) { ctx.input.pressed.delete('KeyF'); act(); }
}

// ---- Igor -------------------------------------------------------------------------------------------------------------------
function buyIgor() {
  const { ctx } = H;
  if (H.cash < PRICE) { ctx.hud?.toast?.('IGOR: "No money, no honey."', 2200); return; }
  H.cash -= PRICE; H.stash = 1; renderCash();
  ctx.hud?.toast?.('IGOR: "Ten bucks. Go up top, the view is crazy."', 2600);
  try { ctx.audio?.play?.('ui_click'); } catch {}
  ctx.net?.send?.('igor');
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
  H.riding = { t: -delay, dest, dir, floor: dir === 'up' ? 1 : 19, jitter: (Math.random() - 0.5) * 0.9, moved: false };
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
    H.high = Math.min(1, H.high + 0.22); H.highT = 55;   // each hit deepens it; it lingers ~55 s after the last one
  }
  if (H.smokeT <= 0) { if (H.joint) H.joint.g.visible = false; if (ctx.weapons?.viewmodel) ctx.weapons.viewmodel.visible = true; ctx.hud?.toast?.('…the whole island is glowing.', 2400); }
}
function updateHigh(dt) {
  const { ctx } = H; const cv = ctx.canvas; if (!cv) return;
  if (H.highT > 0) { H.highT -= dt; if (H.highT < 20) H.high = Math.max(0, H.high - dt / 20); }
  const k = H.high;
  if (k <= 0.001) { if (cv.style.filter) { cv.style.filter = ''; cv.style.transform = ''; } return; }
  const t = performance.now() / 1000;
  cv.style.filter = `blur(${(2.6 * k).toFixed(2)}px) saturate(${(1 + 0.45 * k).toFixed(2)}) contrast(${(1 - 0.06 * k).toFixed(3)}) hue-rotate(${(Math.sin(t * 0.3) * 8 * k).toFixed(1)}deg)`;
  cv.style.transform = `rotate(${(Math.sin(t * 0.55) * 0.8 * k).toFixed(3)}deg) scale(${(1 + 0.025 * k + Math.sin(t * 0.9) * 0.006 * k).toFixed(4)})`;
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
  for (const id of net.list()) { const q = net.peer(id); if (!q?.veh || q.veh.k === 'bike' || q.veh.k === 'pass') continue; const d = Math.hypot(q.pos.x - p.x, q.pos.z - p.z); if (d < bd) { bd = d; best = q; } }
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
  if (!q || !q.veh || q.veh.k === 'bike' || q.dead || ctx.input?.pressed?.has?.('KeyF')) { ctx.input?.pressed?.delete?.('KeyF'); return leavePassenger(); }
  const h = q.heading; const fwd = new THREE.Vector3(-Math.sin(h), 0, -Math.cos(h)), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const seat = q.pos.clone().addScaledVector(right, 0.4).addScaledVector(fwd, 0.15);
  p.position.set(seat.x, seat.y + 0.3, seat.z); p.velocity?.set?.(0, 0, 0);
  const cam = ctx.camera; cam.position.set(seat.x, seat.y + 1.17, seat.z); cam.rotation.set(p.pitch, p.yaw, 0); p.cameraPosition?.copy?.(cam.position);
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
  H.ui = { cash, fade, floor }; renderCash();
}
function renderCash() { if (H?.ui) H.ui.cash.textContent = `$${H.cash}${H.stash ? '  ·  🌿' : ''}`; }

/** QA hooks (window.__game.hangout) */
export const hangoutQA = {
  state: () => H && { cash: H.cash, stash: H.stash, high: +H.high.toFixed(2), riding: !!H.riding, passenger: !!H.passenger, igor: H.igor?.toArray(), start: H.world.W.onlineStart, b2: H.b2?.centre.toArray(), lobby: H.b2?.lobby.cars.map((c) => c.pos.toArray()), top: H.b2?.top[0].cars.map((c) => c.pos.toArray()) },
  buy: () => buyIgor(), light: () => lightUp(), ride: (dir = 'up', k = 0) => callElevator(H.towers.indexOf(H.b2), k, dir), steal: () => { const c = nearestParked(1e9); if (c) steal(c); return !!c; },
};
