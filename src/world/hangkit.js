// HANGKIT — the friends loop, map-agnostic: cash, a small stash (weed / liquor / 40oz), B to use it anywhere (friends within a
// few metres get lifted too), vendors you talk to (dialogue with numbered choices, tappable on phones), elevators / hidden
// stairs that fade you between floors (friends standing with you ride along), steal a parked car, hop in a friend's car,
// cash dropped by mercenaries you kill, "respawn at <spot>" on the death screen. Maps configure it (coney/hangout.js,
// wsp + sbu hangouts); everything online rides net.js events: elev / steal / smoke / drink / buy.
import * as THREE from 'three';
import { hideParkedCar } from './carkit.js';

const RIDE_T = 4.2, STAIRS_T = 5.2, FADE = 0.45, MAX_INV = 3, SHARE_R = 4;
export const ITEMS = {
  weed: { icon: '🌿', name: 'bag of weed' },
  bottle: { icon: '🍾', name: 'bottle of liquor', drunk: 0.8, dur: 150 },
  forty: { icon: '🍺', name: '40 of Olde English', drunk: 1, dur: 180 },
  kvass: { icon: '🥤', name: 'kvass', drunk: 0.2, dur: 45 },
  meat: { icon: '🥩', name: 'shashlik (raw — grill it)', keep: true },
  skewer: { icon: '🍢', name: 'hot shashlik skewer', keep: true },   // not for B: grill it at the mangal
};

let V = null;
export const kit = () => V;

/**
 * @param world  map world
 * @param o.cash starting cash · o.help controls-card html · o.title card title · o.respawn { label, at: () => [x, y, z, yaw] }
 */
export function buildKit(world, o = {}) {
  const { ctx } = world;
  V = { world, ctx, cash: o.cash ?? 20, startCash: o.cash ?? 20, inv: [], drunk: 0, drunkT: -1, high: 0, highT: -1, smokeT: 0, puffT: 0, puffs: [], riding: null, passenger: null,
    shafts: [], spots: [], vendors: [], drops: [], dialog: null, promptT: 0, lastPrompt: '', respawn: o.respawn || null, respawnPick: false, talked: new Set(), onUpdate: [] };
  buildUI(o); buildPuffs();
  if (!ctx.__hangkitBound) { ctx.__hangkitBound = true; bindOnce(ctx); }
  world.updaters.push((dt) => { if (V?.world === world) update(dt); });
  return api;
}

const api = {
  get cash() { return V?.cash ?? 0; },
  /** status effects: { shades: bool, crabs: bool } */
  get status() { return V?.status || {}; },
  setStatus(k, v) { if (!V) return; V.status = V.status || {}; V.status[k] = v; renderCash(); },
  has: (item) => !!V?.inv.includes(item),
  take(item) { if (!V) return false; const i = V.inv.indexOf(item); if (i < 0) return false; V.inv.splice(i, 1); renderCash(); return true; },
  pay(n) { if (!V || V.cash < n) return false; V.cash -= n; renderCash(); return true; },
  earn(n) { if (!V) return; V.cash += n; renderCash(); },
  give(item) { if (!V || V.inv.length >= MAX_INV) return false; V.inv.push(item); renderCash(); return true; },
  full: () => !V || V.inv.length >= MAX_INV,
  /** interaction point: { pos: Vector3 (may move), r, dy, prompt: string | () => string, act: () => void, when?: () => bool } */
  spot(s) { V.spots.push({ r: 2, dy: 1.3, ...s }); return s; },
  /** vendor: { name, pos: Vector3 (may move), r, talk: () => node }  node = { text, choices: [{ label, go: node | () => node | null }] } */
  vendor(v) { const e = { r: 2.2, ...v }; V.vendors.push(e); return e; },
  removeVendor(e) { if (!V) return; const i = V.vendors.indexOf(e); if (i > -1) V.vendors.splice(i, 1); if (V.dialog?.vendor === e) closeDialog(); },
  /** elevator / stair shaft: { kind: 'elevator' | 'stairs', floors, label, lobby: { cars: [{ pos, yaw }] }, tops: [{ cars: [{ pos, yaw }], face }] } */
  shaft(s) { V.shafts.push({ kind: 'elevator', floors: 10, ...s }); return V.shafts.length - 1; },
  onUpdate(fn) { V.onUpdate.push(fn); },
  toast: (t, ms) => V?.ctx.hud?.toast?.(t, ms),
  puff: (at) => puff(at), useItem: () => useItem(), callElevator: (i, k, dir, s) => callElevator(i, k, dir, s), steal: (c) => steal(c), stealLocal: (i, mine) => stealLocal(i, mine),
  nearestParked: (r) => nearestParked(r), endRide: (f) => endRide(f), leavePassenger: () => leavePassenger(), pickRespawn: () => pickRespawn(),
  openDialog: (name, node) => openDialog(name, node), closeDialog: () => closeDialog(), choose: (i) => choose(i), dropCash: (at, n) => dropCash(at, n),
  /** QA: where the interaction points are */
  points: () => V && { shafts: V.shafts.map((t) => ({ kind: t.kind, label: t.label, lobby: t.lobby.cars.map((c) => c.pos.toArray()), top: t.tops[0].cars.map((c) => c.pos.toArray()) })), vendors: V.vendors.map((v) => ({ name: v.name, pos: v.pos.toArray() })), cars: (V.world.parkedCars || []).filter((c) => !c.gone).length, start: V.world.W?.onlineStart },
  state: () => V && { cash: V.cash, inv: V.inv.slice(), item: V.inv[V.inv.length - 1] || null, drunk: +(V.drunk || 0).toFixed(2), high: +V.high.toFixed(2), riding: !!V.riding, passenger: !!V.passenger,
    dialog: V.dialog ? { name: V.dialog.name, text: V.dialog.node.text, choices: (V.dialog.node.choices || []).map((c) => c.label) } : null, drops: V.drops.map((d) => [+d.pos.x.toFixed(1), +d.pos.y.toFixed(1), +d.pos.z.toFixed(1), d.n]) },
};
export const hangkit = api;
/** generic QA hook for maps without their own (window.__game.hangout) */
export const kitQA = { state: () => ({ ...api.state(), ...api.points() }), ride: (i, dir = 'up', k = 0) => callElevator(i, k, dir), choose: (i) => choose(i), close: () => closeDialog(), steal: () => { const c = nearestParked(1e9); if (c) steal(c); return !!c; }, give: (n) => api.earn(n), use: () => useItem() };

// bus handlers live for the page (the world may be rebuilt); they always act on the current V
function bindOnce(ctx) {
  ctx.bus.on('net:elev', (m) => V && onRemoteElev(m));
  ctx.bus.on('net:steal', (m) => V && stealLocal(m.i, false));
  ctx.bus.on('net:smoke', (m) => { if (!V || !Array.isArray(m.p)) return; const at = new THREE.Vector3(...m.p); puff(at); const me = V.ctx.player; if (me && !me.dead && at.distanceTo(me.position) < SHARE_R + 1) { V.high = Math.min(1, V.high + 0.18); V.highT = Math.max(V.highT, 150); } });
  ctx.bus.on('net:drink', (m) => { if (!V || !Array.isArray(m.p)) return; const me = V.ctx.player; if (!me || me.dead || new THREE.Vector3(...m.p).distanceTo(me.position) >= SHARE_R + 1) return;
    const it = ITEMS[m.k] || ITEMS.bottle; drink(false, it); V.ctx.hud?.toast?.(`${V.ctx.net?.peer?.(m.f)?.name || 'A friend'} passed you the ${m.k === 'forty' ? '40' : 'bottle'}`, 1800); });
  ctx.bus.on('net:buy', (m) => V && V.ctx.hud?.toast?.(`${V.ctx.net?.peer?.(m.f)?.name || 'Someone'} bought ${ITEMS[m.k]?.name ? 'a ' + ITEMS[m.k].name : 'something'} from ${String(m.v || 'the man').slice(0, 16)}`, 1800));
  ctx.bus.on('playerDied', () => { if (!V) return; endRide(true); leavePassenger(); closeDialog(); });
  // mercenary cash: solo / host kills arrive as enemyKilled, an online client's own kills as mercKilled (netwaves)
  ctx.bus.on('enemyKilled', (d) => { if (V && d?.position && !d.qa) mercCash(d.position, !!d.headshot); });
  ctx.bus.on('mercKilled', (d) => { if (V && d?.mine && d.position) mercCash(d.position, !!d.hs); });
  ctx.bus.on('state', ({ state }) => { if (V && state === 'dead') respawnBtn(); showUI(state === 'playing'); });
  ctx.bus.on('playerRespawn', () => {
    if (!V) return;
    if (V.cash < V.startCash) { V.cash = V.startCash; renderCash(); }   // back on your feet with at least the starting cash (ammo refills in weapons.js)
    if (!V.respawnPick) return; V.respawnPick = false; toRespawn();
  });
  addEventListener('keydown', (e) => {
    if (!V) return;
    if (e.code === 'KeyT' && V.ctx.state === 'dead' && V.respawn) { pickRespawn(); return; }
    if (!V.dialog) return;
    // dialogue owns 1-4 / F while open (capture phase: the game's key handler never sees them → no weapon swap / inspect)
    const m = /^(Digit|Numpad)([1-4])$/.exec(e.code);
    if (m) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) choose(+m[2] - 1); }
    else if (e.code === 'KeyF' || e.code === 'Digit0') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) closeDialog(); }
  }, { capture: true });
  addEventListener('keydown', (e) => { if (V?.ui?.help && e.code === 'KeyH' && !e.repeat) V.ui.help.style.display = V.ui.help.style.display === 'none' ? 'block' : 'none'; });
  // Q: horn (in a car — friends hear it) · N: give $10 to the closest friend within 3 m
  addEventListener('keydown', (e) => {
    if (!V || e.repeat || V.ctx.state !== 'playing' || V.dialog) return;
    if (e.code === 'KeyQ' && V.ctx.vehicles?.mounted?.spec?.car) { const p = V.ctx.vehicles.mounted.pos; horn(1); V.ctx.net?.send?.('horn', { p: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)] }); }
    if (e.code === 'KeyN') giveCash();
  });
  ctx.bus.on('net:horn', (m) => { if (!V || !Array.isArray(m.p)) return; const me = V.ctx.player.position; const d = Math.hypot(me.x - m.p[0], me.z - m.p[2]); if (d < 160) horn(Math.max(0.08, 1 - d / 160)); });
  ctx.bus.on('net:cash', (m) => { if (!V || m.to !== V.ctx.net?.id) return; const n = Math.round(+m.n); if (!(n > 0 && n <= 50)) return; api.earn(n); V.ctx.hud?.toast?.(`${V.ctx.net?.peer?.(m.f)?.name || 'A friend'} gave you $${n}`, 2000); });
  // bonus cash: every wave you get through pays everyone $15
  ctx.bus.on('wave', (w) => { if (!V || !(w?.n > 1) || w.n === V.lastWave) return; const was = V.lastWave; V.lastWave = w.n; if (was) { api.earn(15); V.ctx.hud?.toast?.('Wave survived · +$15', 1800); } });
}

// ---------------------------------------------------------------------------------------------------------------------------
function update(dt) {
  const { ctx } = V; const p = ctx.player; if (!p) return;
  const playing = ctx.state === 'playing' && !p.dead;
  updateHigh(dt); updatePuffs(dt); updateJoint(dt); updateDrops(dt, playing);
  for (const fn of V.onUpdate) { try { fn(dt, playing); } catch (e) { if (ctx.time.frame % 300 === 1) console.warn('[hangkit] map update', e); } }
  if (V.dialog) { if (!playing) closeDialog(); else { ctx.interactNear = true; faceVendor(dt); } return; }
  if (playing && ctx.input?.pressed?.has?.('KeyB') && (V.riding || V.passenger || ctx.vehicles?.mounted)) { ctx.input.pressed.delete('KeyB'); useItem(); }
  if (V.riding) return updateRide(dt);
  if (V.passenger) return updatePassenger(dt);
  if (!playing) return;
  const F = ctx.input?.pressed?.has?.('KeyF');
  if (ctx.input?.pressed?.has?.('KeyB')) { ctx.input.pressed.delete('KeyB'); useItem(); }   // B = blaze / drink, anywhere
  const pos = p.position; const near = (v, r, dy = 1.3) => Math.hypot(v.x - pos.x, v.z - pos.z) < r && Math.abs(v.y - pos.y) < dy;
  let prompt = null, act = null;
  if (!ctx.vehicles?.mounted) {
    for (const v of V.vendors) if (!act && near(v.pos, v.r)) { prompt = `F — TALK TO ${v.name}`; act = () => talk(v); }
    for (const s of V.spots) if (!act && (!s.when || s.when()) && near(s.pos, s.r, s.dy)) { prompt = typeof s.prompt === 'function' ? s.prompt() : s.prompt; act = s.act; }
    for (let i = 0; i < V.shafts.length && !act; i++) {
      const t = V.shafts[i], up = t.kind === 'stairs' ? 'F — CLIMB ▲' : `F — ELEVATOR ▲ ${t.floors}`, dn = t.kind === 'stairs' ? 'F — GO DOWN ▼' : 'F — ELEVATOR ▼ LOBBY';
      t.lobby.cars.forEach((c, k) => { if (!act && near(c.pos, t.r || 1.4)) { prompt = t.label ? `${up} · ${t.label}` : up; act = () => callElevator(i, k, 'up'); } });
      t.tops.forEach((side, si) => side.cars.forEach((c, k) => { if (!act && near(c.pos, t.r || 1.4)) { prompt = dn; act = () => callElevator(i, k, 'down', si); } }));
    }
    if (!act) { const c = nearestParked(3.0); if (c) { prompt = 'F — STEAL CAR'; act = () => steal(c); } }
    if (!act) { const f = nearestFriendCar(3.8); if (f) { prompt = `F — HOP IN WITH ${f.name}`; act = () => enterPassenger(f.id); } }
  }
  ctx.interactNear = !!act;   // next frame's weapons.js leaves F alone while a prompt is up
  V.promptT -= dt;
  if (prompt && (prompt !== V.lastPrompt || V.promptT <= 0)) { ctx.hud?.toast?.(prompt, 700); V.promptT = 0.4; }
  V.lastPrompt = prompt || '';
  if (F && act) { ctx.input.pressed.delete('KeyF'); act(); }
}

// ---- stash ----------------------------------------------------------------------------------------------------------------
/** B: use the newest thing you hold. Weed = lifted/blurry (~2.5 min), liquor / 40 = drowsy; friends within a few metres share it. */
function useItem() {
  const { ctx } = V; const k = V.inv.map((x) => !ITEMS[x]?.keep).lastIndexOf(true);
  if (k < 0) { ctx.hud?.toast?.(V.inv.length ? 'Raw meat — grill it at Table Park' : 'Nothing on you', 1400); return; }
  const it = V.inv.splice(k, 1)[0]; renderCash();
  if (it === 'weed') return lightUp();
  drink(true, ITEMS[it], it);
}
function drink(mine, spec = ITEMS.bottle, kind = 'bottle') {
  const { ctx } = V; V.drunk = Math.min(1, (V.drunk || 0) + spec.drunk); V.drunkT = Math.max(V.drunkT, spec.dur);
  if (!mine) return;
  const p = ctx.player.position; ctx.net?.send?.('drink', { k: kind, p: [+p.x.toFixed(2), +(p.y + 1.5).toFixed(2), +p.z.toFixed(2)] });
  ctx.hud?.toast?.(kind === 'forty' ? '*glug glug glug* …that malt hits' : '*glug glug*', 1600);
  const m = bottleModel(kind);
  ctx.camera.add(m); m.visible = true; if (ctx.weapons?.viewmodel) ctx.weapons.viewmodel.visible = false;
  clearTimeout(V.bottleT); V.bottleT = setTimeout(() => { m.visible = false; if (ctx.weapons?.viewmodel && V.smokeT <= 0) ctx.weapons.viewmodel.visible = true; }, 2600);
}
const _models = {};
function bottleModel(kind) {
  if (_models[kind]) return _models[kind];
  const g = new THREE.Group();
  if (kind === 'forty') {   // 40 oz in a brown paper bag
    const bag = new THREE.MeshStandardMaterial({ color: 0x9a7650, roughness: 1 }), glass = new THREE.MeshPhysicalMaterial({ color: 0x3a2208, roughness: 0.1, transparent: true, opacity: 0.85 });
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.04, 0.2, 10), bag); b.scale.set(1, 1, 0.8); g.add(b);
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, 0.1, 10), glass); n.position.y = 0.14; g.add(n);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 10), new THREE.MeshStandardMaterial({ color: 0xc8a030, metalness: 0.8, roughness: 0.3 })); cap.position.y = 0.195; g.add(cap);
    g.position.set(0.1, -0.15, -0.32);
  } else {
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x5a3a12, roughness: 0.1, transparent: true, opacity: 0.8 });
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 12), glass)); const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.016, 0.07, 10), glass); neck.position.y = 0.1; g.add(neck);
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0305, 0.0305, 0.05, 12), new THREE.MeshStandardMaterial({ color: 0xe8dcc0 }))); g.position.set(0.1, -0.12, -0.3);
  }
  g.rotation.set(0.9, 0, -0.3); return (_models[kind] = g);
}

// ---- smoking + the high ---------------------------------------------------------------------------------------------------------
function lightUp() {
  const { ctx } = V; V.smokeT = 11; V.puffT = 0.6;
  ctx.hud?.toast?.('…', 1200);
  if (!V.joint) {
    const g = new THREE.Group();
    const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.006, 0.075, 8), new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 0.9 })); paper.rotation.z = Math.PI / 2.3; g.add(paper);
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.0062, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff6a20 })); ember.position.set(0.035, 0.014, 0); g.add(ember);
    g.position.set(-0.12, -0.13, -0.32); g.rotation.set(0.3, 0.6, 0); V.joint = { g, ember }; }
  ctx.camera.add(V.joint.g); V.joint.g.visible = true;
  if (ctx.weapons?.viewmodel) ctx.weapons.viewmodel.visible = false;
}
function updateJoint(dt) {
  if (V.smokeT <= 0) return; const { ctx } = V;
  V.smokeT -= dt; V.puffT -= dt;
  if (V.joint) { V.joint.ember.material.color.setHSL(0.05, 1, 0.45 + 0.15 * Math.sin(performance.now() / 180)); V.joint.g.visible = !ctx.vehicles?.mounted; }   // driving: no floating joint in the chase view
  if (V.puffT <= 0) {
    V.puffT = 1.6 + Math.random() * 0.8;
    const cam = ctx.camera; const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    let at = cam.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, 0.45).add(new THREE.Vector3(0, -0.08, 0));
    const car = ctx.vehicles?.mounted; let hotbox = false;
    if (car) {   // in the whip: the smoke rolls out of the driver's window (not off the chase camera) and the car hotboxes
      const h = car.heading; at = car.pos.clone().add(new THREE.Vector3(-Math.cos(h) * 0.95 - Math.sin(h) * 0.2, car.spec?.car ? 1.25 : 1.5, Math.sin(h) * 0.95 - Math.cos(h) * 0.2)); hotbox = !!car.spec?.car;
    }
    puff(at); ctx.net?.send?.('smoke', { p: [+at.x.toFixed(2), +at.y.toFixed(2), +at.z.toFixed(2)] });
    V.high = Math.min(1, V.high + (hotbox ? 0.3 : 0.22)); V.highT = 150;
  }
  if (V.smokeT <= 0) { if (V.joint) V.joint.g.visible = false; if (ctx.weapons?.viewmodel) ctx.weapons.viewmodel.visible = true; ctx.hud?.toast?.('…everything is glowing.', 2400); }
}
function updateHigh(dt) {
  const { ctx } = V; const cv = ctx.canvas; if (!cv) return;
  if (V.highT > 0) { V.highT -= dt; if (V.highT < 40) V.high = Math.max(0, V.high - dt / 40); }
  if (V.drunkT > 0) { V.drunkT -= dt; if (V.drunkT < 30) V.drunk = Math.max(0, V.drunk - dt / 30); } else V.drunk = 0;
  const k = V.high, d = V.drunk || 0;
  if (V.status?.crabs && ctx.state === 'playing' && ctx.player && !ctx.player.dead) { V.itchT = (V.itchT ?? 3) - dt; if (V.itchT <= 0) { V.itchT = 2.5 + Math.random() * 4; ctx.player.yaw += (Math.random() - 0.5) * 0.35; ctx.player.pitch += (Math.random() - 0.5) * 0.2; if (Math.random() < 0.4) ctx.hud?.toast?.(['*scratch scratch*', 'why is it so itchy down there', '*SCRATCH*', 'Sammy has lotion…'][Math.floor(Math.random() * 4)], 1100); } }
  if (k <= 0.001 && d <= 0.001) { const sh = V.status?.shades ? 'brightness(0.82) contrast(1.08) sepia(0.18)' : ''; if (cv.style.filter !== sh) { cv.style.filter = sh; cv.style.transform = ''; } return; }
  const t = performance.now() / 1000;
  // weed: soft blur, saturated, slow hue drift + gentle wobble · liquor: heavy-lidded (darker, desaturated), double vision, big slow sway
  const blur = 2.6 * k + 3.4 * d * (0.55 + 0.45 * Math.sin(t * 0.7));
  const ghost = d > 0.05 ? ` drop-shadow(${(22 * d * Math.sin(t * 0.9)).toFixed(1)}px ${(7 * d * Math.cos(t * 0.6)).toFixed(1)}px 0 rgba(255,255,255,${(0.4 * d).toFixed(2)}))` : '';
  cv.style.filter = `blur(${blur.toFixed(2)}px) saturate(${(1 + 0.45 * k - 0.35 * d).toFixed(2)}) brightness(${(1 - 0.32 * d * (0.7 + 0.3 * Math.sin(t * 0.4))).toFixed(2)}) contrast(${(1 - 0.06 * k).toFixed(3)}) hue-rotate(${(Math.sin(t * 0.3) * 8 * k).toFixed(1)}deg)${ghost}`;
  cv.style.transform = `rotate(${(Math.sin(t * 0.55) * 0.8 * k + Math.sin(t * 0.33) * 6 * d).toFixed(3)}deg) scale(${(1 + 0.025 * k + 0.07 * d + Math.sin(t * 0.9) * 0.012 * (k + d)).toFixed(4)}) translate(${(Math.sin(t * 0.37) * 14 * d).toFixed(1)}px, ${(Math.sin(t * 0.5) * 12 * d).toFixed(1)}px)`;
  // drunk: the view drifts on its own and your aim swims — you fight it with the mouse
  const p = ctx.player; if (d > 0.05 && p && !p.dead && ctx.state === 'playing') { p.yaw += Math.sin(t * 0.62) * 0.35 * d * dt; p.pitch += Math.sin(t * 0.47 + 1.3) * 0.12 * d * dt; }
}
function buildPuffs() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(235,235,230,0.55)'); gr.addColorStop(1, 'rgba(235,235,230,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  V.puffTex = new THREE.CanvasTexture(c);
}
function puff(at) {
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: V.puffTex, transparent: true, depthWrite: false, opacity: 0.6 }));
    s.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.15, Math.random() * 0.1, (Math.random() - 0.5) * 0.15)); s.scale.setScalar(0.25);
    V.world.scene.add(s); V.puffs.push({ s, t: 0, life: 3.5 + Math.random() * 2, v: new THREE.Vector3((Math.random() - 0.5) * 0.25, 0.25 + Math.random() * 0.2, (Math.random() - 0.5) * 0.25) });
  }
}
function updatePuffs(dt) {
  for (let i = V.puffs.length - 1; i >= 0; i--) { const q = V.puffs[i]; q.t += dt; q.s.position.addScaledVector(q.v, dt); q.s.scale.setScalar(0.25 + q.t * 0.55); q.s.material.opacity = 0.55 * (1 - q.t / q.life); if (q.t >= q.life) { V.world.scene.remove(q.s); q.s.material.dispose(); V.puffs.splice(i, 1); } }
}

// ---- vendors + dialogue ---------------------------------------------------------------------------------------------------------
function talk(v) { const node = v.talk(api, V.talked.has(v.name)); V.talked.add(v.name); openDialog(v.name, node, v); }
function openDialog(name, node, vendor = null) {
  if (!node) return closeDialog();
  const { ctx } = V; const p = ctx.player;
  if (!V.dialog) { p.mounted = { dialog: true }; }
  V.dialog = { name, node, vendor };
  const u = V.ui; u.dname.textContent = name; u.dtext.textContent = node.text;
  u.dch.innerHTML = '';
  (node.choices || [{ label: 'Leave', go: null }]).forEach((c, i) => {
    const b = document.createElement('button'); b.className = 'hkch'; b.innerHTML = `<b>${i + 1}</b> ${c.label}`;
    const pick = (e) => { e.preventDefault(); e.stopPropagation(); choose(i); };
    b.addEventListener('touchstart', pick, { passive: false }); b.addEventListener('mousedown', pick); u.dch.appendChild(b);
  });
  u.dlg.classList.add('on');
  try { ctx.audio?.play?.('ui_click'); } catch {}
}
function choose(i) {
  if (!V?.dialog) return; const c = (V.dialog.node.choices || [{ go: null }])[i]; if (!c) return;
  const next = typeof c.go === 'function' ? c.go(api) : c.go;
  if (next) openDialog(V.dialog.name, next, V.dialog.vendor); else closeDialog();
}
function closeDialog() {
  if (!V?.dialog) return; V.dialog = null; V.ui.dlg.classList.remove('on');
  const p = V.ctx.player; if (p?.mounted?.dialog) p.mounted = null;
}
function faceVendor(dt) {   // look toward whoever you're talking to
  const v = V.dialog?.vendor; if (!v) return; const p = V.ctx.player;
  const want = Math.atan2(-(v.pos.x - p.position.x), -(v.pos.z - p.position.z)); let d = want - p.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
  p.yaw += d * Math.min(1, dt * 4); p.pitch += (-0.05 - p.pitch) * Math.min(1, dt * 4);
  const cam = V.ctx.camera; cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
}
/** shop helper for vendor scripts: pay, hand over, tell friends. Returns the reply node text. */
export function sell(item, price, vendorName, lines = {}) {
  if (api.full()) return lines.full || 'Your hands are full. Use what you got first (B).';
  if (V.cash < price) return lines.broke || `That's $${price}. You got $${V.cash}.`;
  api.pay(price); api.give(item);
  V.ctx.net?.send?.('buy', { k: item, v: vendorName });
  try { V.ctx.audio?.play?.('ui_click'); } catch {}
  return lines.ok || 'Here you go.';
}

// ---- mercenary cash ---------------------------------------------------------------------------------------------------------------
function mercCash(at, hs = false) {
  const bounty = 5 * (1 + Math.floor(Math.random() * 3)) + (hs ? 10 : 0);   // every kill pays $5–15 on the spot, headshots +$10
  api.earn(bounty); V.ctx.hud?.toast?.(`+$${bounty} ${hs ? 'headshot ' : ''}bounty`, 1200);
  if (Math.random() > 0.6) return;   // and most of them carry a wad: $20–50 on the body, walk over it
  dropCash(at, 20 + 5 * Math.floor(Math.random() * 7));
}
let _ac = null;
/** a two-tone car horn (synth: no asset), volume by distance */
function horn(vol) {
  try { _ac = _ac || new (window.AudioContext || window.webkitAudioContext)(); const t = _ac.currentTime, g = _ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18 * vol, t + 0.02); g.gain.setValueAtTime(0.18 * vol, t + 0.42); g.gain.linearRampToValueAtTime(0, t + 0.5); g.connect(_ac.destination);
    for (const f of [415, 523]) { const o = _ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const lp = _ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; o.connect(lp); lp.connect(g); o.start(t); o.stop(t + 0.52); } } catch {}
}
function giveCash() {
  const net = V.ctx.net; if (!net?.list) return; const me = V.ctx.player.position; let best = null, bd = 3;
  for (const id of net.list()) { const q = net.peer(id); if (!q?.pos || q.dead) continue; const d = Math.hypot(q.pos.x - me.x, q.pos.z - me.z); if (d < bd) { bd = d; best = { id, name: q.name }; } }
  if (!best) { V.ctx.hud?.toast?.('Get closer to a friend to give cash (N)', 1600); return; }
  if (!api.pay(10)) { V.ctx.hud?.toast?.('You need $10', 1400); return; }
  net.send('cash', { to: best.id, n: 10 }); V.ctx.hud?.toast?.(`Gave ${best.name || 'your friend'} $10`, 1600);
}
let _cashTex = null;
function dropCash(at, n) {
  const g = new THREE.Group();
  const bill = new THREE.MeshStandardMaterial({ color: 0x6f9a5c, roughness: 0.8 }), band = new THREE.MeshStandardMaterial({ color: 0xc9b37a, roughness: 0.6 });
  const stack = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.07), bill); g.add(stack);
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.038, 0.072), band); g.add(b);
  if (!_cashTex) { const c = document.createElement('canvas'); c.width = 128; c.height = 48; const x = c.getContext('2d'); x.font = '700 30px Barlow, Arial'; x.textAlign = 'center'; x.fillStyle = '#9fe39a'; x.shadowColor = '#000'; x.shadowBlur = 6; x.fillText('$', 64, 36); _cashTex = new THREE.CanvasTexture(c); }
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: _cashTex, transparent: true, depthWrite: false })); tag.scale.set(0.5, 0.19, 1); tag.position.y = 0.45; g.add(tag);
  const y = Number.isFinite(at.y) ? at.y : 0; const gy = V.world.groundHeight ? V.world.groundHeight(at.x, at.z) : 0;
  g.position.set(at.x + (Math.random() - 0.5) * 0.6, (Number.isFinite(gy) && Math.abs(gy - y) < 2.5 ? gy : y) + 0.25, at.z + (Math.random() - 0.5) * 0.6);
  V.world.scene.add(g); V.drops.push({ g, pos: g.position, n, t: 0 });
}
function updateDrops(dt, playing) {
  const p = V.ctx.player?.position;
  for (let i = V.drops.length - 1; i >= 0; i--) {
    const d = V.drops[i]; d.t += dt; d.g.rotation.y += dt * 1.6; d.g.children[0].position.y = d.g.children[1].position.y = Math.sin(d.t * 3) * 0.04;
    const got = playing && p && Math.hypot(p.x - d.pos.x, p.z - d.pos.z) < 1.6 && Math.abs(p.y + 0.3 - d.pos.y) < 2;
    if (got || d.t > 120) {
      V.world.scene.remove(d.g); V.drops.splice(i, 1);
      if (got) { api.earn(d.n); V.ctx.hud?.toast?.(`+$${d.n} off the merc`, 1600); try { V.ctx.audio?.play?.('pickup'); } catch {} }
    }
  }
}

// ---- elevators / stairs -------------------------------------------------------------------------------------------------------
function callElevator(ti, k, dir, side = 0) {
  const { ctx } = V; const p = ctx.player.position;
  ctx.net?.send?.('elev', { i: ti, k, d: dir, s: side, p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)] });
  startRide(ti, k, dir, side);
}
function onRemoteElev(m) {
  if (V.riding || V.passenger || V.dialog || !Array.isArray(m.p)) return; const p = V.ctx.player; if (!p || p.dead || V.ctx.vehicles?.mounted) return;
  if (Math.hypot(p.position.x - m.p[0], p.position.z - m.p[2]) < 3.5 && Math.abs(p.position.y - m.p[1]) < 1.5) { V.ctx.hud?.toast?.(`${V.ctx.net?.peer?.(m.f)?.name || 'A friend'} ${V.shafts[m.i]?.kind === 'stairs' ? 'leads the way…' : 'holds the door…'}`, 1400); startRide(m.i, m.k, m.d, m.s || 0, 0.6); }
}
function startRide(ti, k, dir, side, delay = 0) {
  const { ctx } = V; const t = V.shafts[ti]; if (!t) return;
  const top = t.tops[side] || t.tops[0], up = t.tops[0];
  const src = dir === 'up' ? (up.cars[k] || up.cars[0]) : (t.lobby.cars[k] || t.lobby.cars[0]);
  const dest = dir === 'up' ? { ...src, face: up.face ?? src.yaw } : { ...src, face: src.yaw + Math.PI };
  V.riding = { t: -delay, dest, dir, shaft: t, T: t.kind === 'stairs' ? STAIRS_T : RIDE_T, jitter: (Math.random() - 0.5) * 0.5, moved: false }; void top;
  ctx.player.mounted = { elevator: true };
  try { ctx.audio?.play?.('ui_click'); } catch {}
}
function updateRide(dt) {
  const r = V.riding, { ctx } = V; r.t += dt; const p = ctx.player, T = r.T;
  const k = r.t < 0 ? 0 : r.t < FADE ? r.t / FADE : r.t < T - FADE ? 1 : Math.max(0, (T - r.t) / FADE);
  V.ui.fade.style.opacity = k.toFixed(3);
  const prog = Math.min(1, Math.max(0, (r.t - FADE) / (T - 2 * FADE))), n = r.shaft.floors;
  if (r.shaft.kind === 'stairs') V.ui.floor.textContent = r.t > 0 ? (r.dir === 'up' ? 'climbing…' : 'heading down…') : '';
  else { const fl = r.dir === 'up' ? Math.round(1 + prog * (n - 1)) : Math.round(n - prog * (n - 1)); V.ui.floor.textContent = r.t > 0 ? `${r.dir === 'up' ? '▲' : '▼'} ${fl === 1 ? 'L' : fl}` : ''; }
  if (!r.moved && r.t >= T / 2) {
    const d = r.dest; const side = new THREE.Vector3(Math.cos(d.face), 0, -Math.sin(d.face));
    p.mounted = null; p.teleport(d.pos.x + side.x * r.jitter, d.pos.y, d.pos.z + side.z * r.jitter, d.face, 0); p.mounted = { elevator: true }; r.moved = true;
  }
  if (r.t >= T) endRide();
}
function endRide(force = false) { if (!V?.riding) return; V.riding = null; V.ui.fade.style.opacity = '0'; V.ui.floor.textContent = ''; const p = V.ctx.player; if (p?.mounted?.elevator) p.mounted = null; if (!force) try { V.ctx.audio?.play?.('ui_click'); } catch {} }

// ---- cars ---------------------------------------------------------------------------------------------------------------------
function nearestParked(r) {
  const p = V.ctx.player.position; let best = null, bd = r;
  for (const c of V.world.parkedCars || []) { if (c.gone) continue; const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd && Math.abs((c.y || 0) - p.y) < 2.5) { bd = d; best = c; } }
  return best;
}
function steal(c) {
  const { ctx } = V; const i = (V.world.parkedCars || []).indexOf(c); if (i < 0) return;
  stealLocal(i, true);
  const car = ctx.vehicles?.spawnCar?.(c.x, c.z, (c.ry || 0) - Math.PI / 2, c.kind === 'cab' ? 'sedan' : c.kind, c.color ?? 0x22305c, c.y || 0);
  if (car) { ctx.vehicles.mount(car); ctx.hud?.toast?.('Hot-wired it. Drive.', 1800); }
  ctx.net?.send?.('steal', { i });
}
function stealLocal(i, mine) {
  const c = (V.world.parkedCars || [])[i]; if (!c || c.gone) return; const { ctx } = V; void mine;
  hideParkedCar(c);
  if (c.box) { const k = ctx.colliders.indexOf(c.box); if (k > -1) ctx.colliders.splice(k, 1); try { ctx.player?.rebuildColliders?.(); } catch {} }
}
function nearestFriendCar(r) {
  const net = V.ctx.net; if (!net?.list) return null; const p = V.ctx.player.position; let best = null, bd = r;
  for (const id of net.list()) { const q = net.peer(id); if (!q?.veh || q.veh.k === 'pass') continue; const d = Math.hypot(q.pos.x - p.x, q.pos.z - p.z); if (d < bd) { bd = d; best = q; } }
  return best;
}
function enterPassenger(id) { V.passenger = { id }; V.ctx.player.mounted = { passenger: true }; V.ctx.hud?.toast?.('F — GET OUT', 1600); }
function leavePassenger() {
  if (!V?.passenger) return; const { ctx } = V; const q = ctx.net?.peer?.(V.passenger.id); V.passenger = null;
  const p = ctx.player; p.mounted = null;
  if (q) { const h = q.heading; const right = new THREE.Vector3(Math.cos(h), 0, -Math.sin(h)); p.teleport(q.pos.x + right.x * 2.2, q.pos.y, q.pos.z + right.z * 2.2, p.yaw, 0); }
}
function updatePassenger() {
  const { ctx } = V; const q = ctx.net?.peer?.(V.passenger.id); const p = ctx.player;
  if (!q || !q.veh || q.dead || ctx.input?.pressed?.has?.('KeyF')) { ctx.input?.pressed?.delete?.('KeyF'); return leavePassenger(); }
  const h = q.heading; const fwd = new THREE.Vector3(-Math.sin(h), 0, -Math.cos(h)), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const bike = q.veh.k === 'bike', sid = [...(ctx.net?.id || 'x')].reduce((a, c) => a + c.charCodeAt(0), 0) % 3;
  const SEATS = [[0.4, 0.15], [-0.4, -0.85], [0.4, -0.85]];   // front passenger, rear left, rear right (metres right, forward)
  const [sr, sf] = bike ? [0, -0.55] : SEATS[sid];
  const seat = q.pos.clone().addScaledVector(right, sr).addScaledVector(fwd, sf);
  p.position.set(seat.x, seat.y + (bike ? 0.55 : 0.3), seat.z); p.velocity?.set?.(0, 0, 0);
  const cam = ctx.camera; cam.position.set(seat.x, seat.y + (bike ? 1.5 : 1.17), seat.z); cam.rotation.set(p.pitch, p.yaw, 0); p.cameraPosition?.copy?.(cam.position);
}

// ---- death screen: "Respawn at <spot>" (button or T). Solo: respawn right now. Online: net.js keeps its countdown; the choice
// is remembered and the respawn is moved there when it fires.
function respawnBtn() {
  if (!V.respawn) return;
  const btns = document.querySelector('#hud .dead .btns'); if (!btns) return;
  let b = btns.querySelector('.park-rsp');
  if (!b) { b = document.createElement('button'); b.className = 'btn primary park-rsp'; b.addEventListener('click', (e) => { e.stopPropagation(); pickRespawn(); }); btns.prepend(b); }
  b.textContent = `Respawn at ${V.respawn.label} [T]`; b.disabled = false; V.respawnBtn = b;
}
function pickRespawn() {
  const ctx = V?.ctx; if (!ctx || ctx.state !== 'dead' || !V.respawn) return;
  V.respawnPick = true;
  if (ctx.net?.connected) { if (V.respawnBtn) { V.respawnBtn.textContent = `${V.respawn.label} ✓ — respawning…`; V.respawnBtn.disabled = true; } return; }
  ctx.player.respawn();   // emits playerRespawn → toRespawn()
}
function toRespawn() {
  const s = V.respawn?.at?.(); if (!s) return; const p = V.ctx.player;
  const cols = V.ctx.colliders, blocked = (x, z) => cols.some((b) => x > b.min.x - 0.4 && x < b.max.x + 0.4 && z > b.min.z - 0.4 && z < b.max.z + 0.4 && b.max.y > s[1] + 0.3 && b.min.y < s[1] + 1.8);
  let x = s[0], z = s[2];
  for (let k = 0; k < 10; k++) { const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 2, tx = s[0] + Math.cos(a) * r, tz = s[2] + Math.sin(a) * r; if (!blocked(tx, tz)) { x = tx; z = tz; break; } }   // spread so friends don't stack
  p.teleport(x, s[1], z, s[3], 0);
}

// ---- UI: cash + stash, elevator fade, dialogue panel, USE button, controls card --------------------------------------------
function buildUI(o) {
  document.querySelectorAll('.hkui').forEach((e) => e.remove());
  if (!document.getElementById('hkcss')) {
    const css = document.createElement('style'); css.id = 'hkcss'; css.textContent = `
  .hgcash{position:fixed;left:18px;bottom:92px;z-index:40;font:700 20px 'Barlow Condensed',Arial;color:#9fe39a;text-shadow:0 1px 2px #000;pointer-events:none;letter-spacing:.06em}
  .hgfade{position:fixed;inset:0;background:#050505;opacity:0;z-index:45;pointer-events:none;transition:none}
  .hgfloor{position:fixed;left:50%;top:44%;transform:translate(-50%,-50%);z-index:46;font:700 64px 'Barlow Condensed',Arial;color:#ffb24a;letter-spacing:.1em;text-shadow:0 0 18px rgba(255,160,40,.6);pointer-events:none}
  .hkdlg{position:fixed;left:50%;bottom:9vh;transform:translateX(-50%);width:min(620px,92vw);z-index:47;background:rgba(10,12,16,.9);border-left:3px solid #ffb24a;color:#eef2f5;padding:14px 18px 12px;display:none;font:500 17px Barlow,Arial;line-height:1.4;box-shadow:0 8px 30px rgba(0,0,0,.5)}
  .hkdlg.on{display:block}
  .hkdlg .nm{font:700 15px 'Barlow Condensed',Arial;letter-spacing:.18em;color:#ffb24a;margin-bottom:4px}
  .hkdlg .tx{margin-bottom:10px;white-space:pre-line}
  .hkch{display:block;width:100%;text-align:left;margin:5px 0 0;padding:9px 12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);color:#fff;font:600 15px Barlow,Arial;border-radius:4px;cursor:pointer}
  .hkch b{display:inline-block;min-width:22px;color:#ffb24a}
  .hkch:hover,.hkch:active{background:rgba(255,178,74,.2)}
  .hkdlg .ft{margin-top:8px;font:500 12px Barlow,Arial;color:#9aa4ad;letter-spacing:.05em}`;
    document.head.appendChild(css);
  }
  const el = (cls, tag = 'div') => { const e = document.createElement(tag); e.className = cls + ' hkui'; document.body.appendChild(e); return e; };
  const cash = el('hgcash'), fade = el('hgfade'), floor = el('hgfloor');
  const dlg = el('hkdlg'); dlg.innerHTML = '<div class="nm"></div><div class="tx"></div><div class="chs"></div><div class="ft">1–4 choose · F leave</div>';
  const use = el('hguse', 'button'); use.textContent = 'USE (B)'; use.style.cssText = 'position:fixed;left:18px;bottom:130px;z-index:46;display:none;padding:12px 18px;font:700 16px Barlow Condensed,Arial;letter-spacing:.12em;color:#fff;background:rgba(40,120,60,.8);border:1px solid rgba(255,255,255,.4);border-radius:6px';
  use.addEventListener('touchstart', (e) => { e.preventDefault(); useItem(); }, { passive: false }); use.addEventListener('click', (e) => { e.stopPropagation(); useItem(); });
  let help = null;
  if (o.help) {
    help = el('hghelp'); help.style.cssText = 'position:fixed;right:14px;top:60px;z-index:44;background:rgba(8,10,14,.78);border-left:2px solid #ffb24a;color:#e8edf2;font:500 13px Barlow,Arial;padding:10px 14px;line-height:1.55;pointer-events:none;max-width:280px';
    help.innerHTML = `<b style="letter-spacing:.14em;font-family:Barlow Condensed">${o.title || 'CONTROLS'} (H)</b><br>${o.help}`;
    if (V.ctx.isTouch) help.style.display = 'none';   // phones: the on-screen buttons need that corner
    setTimeout(() => { if (help) help.style.display = 'none'; }, 14000);
  }
  V.ui = { cash, fade, floor, use, help, dlg, dname: dlg.querySelector('.nm'), dtext: dlg.querySelector('.tx'), dch: dlg.querySelector('.chs') }; renderCash(); showUI(V.ctx.state === 'playing');
}
function showUI(on) {   // cash / USE / help card are in-game HUD: hidden on the menus, pause and death screens
  if (!V?.ui) return; for (const k of ['cash', 'use', 'help']) { const e = V.ui[k]; if (e) e.style.visibility = on ? '' : 'hidden'; }
}
function renderCash() {
  if (!V?.ui) return;
  V.ui.cash.textContent = `$${V.cash}${V.inv.length ? '  ·  ' + V.inv.map((i) => ITEMS[i]?.icon || '?').join(' ') + ' (B)' : ''}${V.status?.shades ? '  🕶' : ''}${V.status?.crabs ? '  🦀' : ''}`;
  if (V.ui.use) V.ui.use.style.display = V.inv.length ? 'block' : 'none';
}
