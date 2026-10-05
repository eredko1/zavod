// VR: the game in a WebXR headset (built for Meta Quest 3; any immersive-vr browser works). Owned by: VR.
//
// How it fits the flat game without forking it:
//  · ctx.camera stays the gameplay camera every module reads and writes. In VR a separate xrCam inside a RIG renders the eyes; the
//    rig is re-placed every frame so the real head sits where the game put the eye (on foot: over the player capsule, standing on
//    the real floor; in a car/ride: at the seat the vehicle wrote). The head's world pose is then copied back into ctx.camera, so
//    audio, the viewmodel's lights and anything that reads "where am I looking" see the real head.
//  · Turning is the rig's yaw (snap turn) + the real head's yaw. On foot the player's yaw is set from it each frame, so walking
//    and the server-side avatar follow the head. Big yaw changes from the game (teleports, respawns) carry into the rig.
//  · Physically stepping moves the capsule (room-scale), and walls push the view back instead of letting you into them.
//  · Input is translated into what the game already understands: the left stick is the touch stick (analog, also drives cars),
//    buttons are synthetic key events (F, R, B, Space …), the right trigger is the fire button. Guns are held in the right hand and
//    aim down the barrel (ctx.xrAim); with fists you punch for real: a fast jab of either hand is a hit.
//  · Every 2D screen (HUD, menus, dialogs, bag, durak, darts) is the page's own DOM mirrored onto a panel (mirror.js) you point at
//    with a controller laser or a hand ray, and pinch / pull the trigger to click.
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { createMirror, pointerDown, pointerUp, moveAt, clickable, setGLCanvas, hitAt } from './mirror.js';

const SNAP_DEFAULT = 45, DEAD = 0.18, PINCH_ON = 0.018, PINCH_OFF = 0.032, PUNCH_V = 2.1, PUNCH_GAP = 0.28, HAND_STICK = 0.07;
// in a car: menus stay at arm's length plus (the laser starts at your hand; reading closer than ~1 m tires the eyes), the HUD comes in
// over the dashboard
const SEAT_UI_DIST = 0.95, SEAT_HUD_DIST = 0.65, UI_DIST = 1.2, UI_W = 1.6, HUD_DIST = 2.0, HUD_W = 2.3, HUD_FOLLOW = 22 * Math.PI / 180;
const UI_HZ = 15, HUD_HZ = 2, GAME_HZ = 24, STAND_H = 1.7, EYE_DEFAULT = 2.0;
const PREF_KEY = 'zavod.vr';
const SMOOTH_TURN = 2.1;   // rad/s at full stick (~120°/s)
const XR_SCALE = 0.8, RAF_LATE = 50;   // of the Quest 3's ~2064 x 2208 per eye: fill-rate headroom; fixed foveation does the rest
const V = { presenting: false, turn: 0, rigYaw: 0, wroteYaw: null, mode: 'foot', head: new THREE.Vector3(), headQ: new THREE.Quaternion(), headPrev: null, seatY: 1.2, hands: {}, pads: {}, keys: new Set(), ui: false, uiHold: false };
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _m = new THREE.Matrix4(), _ray = new THREE.Raycaster();
const prefs = { snap: SNAP_DEFAULT, vignette: true, hud: true, smooth: false, left: false, eye: EYE_DEFAULT, ...load() };
function load() { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; } }
function save() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {} }
const mainHand = () => prefs.left ? V.hands.left : V.hands.right, offHand = () => prefs.left ? V.hands.right : V.hands.left;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export async function init(ctx) {
  V.ctx = ctx; const { renderer, scene } = ctx;
  ctx.xr = { presenting: false, prefs, enter: () => start(), exit: () => V.session?.end(), syncAim: () => syncAim(ctx) };
  renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local-floor');
  // the rig: xrCam (the eyes), both controllers, both hands; re-placed each frame (see place())
  const rig = V.rig = new THREE.Group(); rig.name = 'xrRig'; scene.add(rig);
  V.cam = new THREE.PerspectiveCamera(70, 1, 0.05, 600); V.cam.name = 'xrCam'; rig.add(V.cam);
  // the aim the weapons read in VR: a camera-type object (its forward is -Z) on the gun hand
  ctx.xrAim = null; V.aim = new THREE.PerspectiveCamera(); V.aim.name = 'xrAim'; scene.add(V.aim);
  const cmf = new XRControllerModelFactory(), hmf = new XRHandModelFactory();
  for (let i = 0; i < 2; i++) {
    const ray = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i), hand = renderer.xr.getHand(i);
    rig.add(ray, grip, hand);
    const H = { i, ray, grip, hand, side: null, src: null, prev: new THREE.Vector3(), vel: new THREE.Vector3(), pinch: false, punchT: 0 };
    ray.addEventListener('connected', (e) => { H.src = e.data; H.side = e.data.handedness; V.hands[H.side] = H; });
    ray.addEventListener('disconnected', () => { if (V.hands[H.side] === H) delete V.hands[H.side]; H.src = null; });
    try { grip.add(cmf.createControllerModel(grip)); } catch (e) { console.warn('[vr] controller model', e); }
    try { hand.add(hmf.createHandModel(hand, 'mesh')); } catch (e) { console.warn('[vr] hand model', e); }
    H.laser = laser(); ray.add(H.laser.line, H.laser.dot); V['h' + i] = H;
  }
  V.panel = null;   // see ensurePanel()
  V.wrist = wristMenu(); V.vig = vignette(); V.cam.add(V.vig);
  // the overlays that need a mouse release pointer lock on desktop: that's our "a 2D screen is up" signal, whatever screen it is
  const exitPL = document.exitPointerLock?.bind(document); document.exitPointerLock = () => { if (V.presenting && ctx.state === 'playing') V.uiHold = true; try { exitPL?.(); } catch {} };
  const reqPL = ctx.requestPointerLock; ctx.requestPointerLock = () => { V.uiHold = false; if (!V.presenting) reqPL?.(); };
  ctx.bus.on('state', () => { V.uiHold = false; });
  ctx.bus.on('shot', () => { if (V.presenting) pulse(mainHand(), 0.45, 35); });
  enterButton(ctx); optionsCard(ctx); keyboard(ctx);
  // a page reached by link / reload from inside VR (picking a map reloads): the browser hands the session straight back
  V.granted = !!window.__xrGranted;   // caught by index.html's first script: the event can fire before this module loads
  navigator.xr?.addEventListener?.('sessiongranted', () => { V.granted = true; if (window.__game?.ready) start(); });
  ctx.bus.on('boot', () => { if (V.granted) start(); });
  window.__game && (window.__game.vr = qaHooks());
  return { get presenting() { return V.presenting; }, enter: () => start(), exit: () => V.session?.end(), prefs };
}

// the 2D layer is built the first time VR starts: phones never pay for its canvas, GPU texture or DOM watcher
function ensurePanel() {
  if (V.panel) return;
  // the 2D layer: the DOM mirror on a panel (menus / dialogs in front of you, the HUD a little further, lazily following)
  V.mirror = createMirror(2048);
  // repaint on change: any DOM mutation marks the mirror dirty (canvas overlays like the minimap, darts, durak redraw without
  // mutating, so those get a steady rate instead; see panel())
  new MutationObserver(() => { V.dirty = true; }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); setGLCanvas(V.ctx.renderer.domElement);
  V.tex = new THREE.CanvasTexture(V.mirror.canvas); V.tex.colorSpace = THREE.SRGBColorSpace; V.tex.generateMipmaps = true; V.tex.minFilter = THREE.LinearMipmapLinearFilter; V.tex.anisotropy = 8;   // text stays crisp, not shimmering, at panel distance
  V.panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: V.tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  V.panel.name = 'xrPanel'; V.panel.renderOrder = 9990; V.panel.visible = false; V.panel.frustumCulled = false; V.rig.add(V.panel);
  V.panelYaw = 0; V.drawT = 0;
}

async function start() {
  const { ctx } = V; if (V.presenting || V.starting || !navigator.xr) return; V.starting = true;
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'] });
    ctx.renderer.xr.setFramebufferScaleFactor(+(ctx.qs.get('xrscale') || XR_SCALE));
    await ctx.renderer.xr.setSession(session);
    V.session = session; begin(session);
  } catch (e) { console.warn('[vr] could not start', e); ctx.hud?.toast?.('VR: ' + (e.message || e), 3000); }
  V.starting = false;
}

function begin(session) {
  ensurePanel();
  const { ctx } = V; V.presenting = true; ctx.xr.presenting = true; V.headPrev = null; V.wroteYaw = null; V.mode = 'foot';
  V.turn = ctx.player?.yaw || 0; V.rigYaw = V.turn; V.seatH0 = 0;   // your real head height: taken from the first head pose (or Recalibrate)
  try { ctx.renderer.xr.setFoveation(1); } catch {}
  try { session.updateTargetFrameRate?.(72)?.catch?.(() => {}); } catch {}
  // shadows are a whole second scene pass per light, per eye: off in the headset, back on after if they were on
  raycastSeesCulled(true);
  // point / spot lights (lamps, the gun's screen fill lights, muzzle flash, deli lamps) cost every lit pixel of both eyes, even at
  // intensity 0: off while in VR, sun / sky / moon stay. Done once here (a light switching on later would recompile every shader)
  V.lightsOff = []; ctx.scene.traverse((o) => { if ((o.isPointLight || o.isSpotLight) && o.visible) { o.visible = false; V.lightsOff.push(o); } });
  V.shadows0 = ctx.renderer.shadowMap.enabled; if (V.shadows0) ctx.bus.emit('setting', { key: 'shadows', value: false });
  // the gun goes from the screen corner into your right hand
  const vm = ctx.weapons?.viewmodel; if (vm) { V.vmScale0 = vm.scale.clone(); V.vmParent = vm.parent; V.gunMount = V.gunMount || new THREE.Group(); V.gunMount.name = 'xrGunMount'; vm.position.set(0, 0, 0); vm.rotation.set(0, 0, 0); V.gunMount.add(vm); }
  ctx.xrAim = V.aim;
  try { ctx.renderer.xr.getReferenceSpace()?.addEventListener?.('reset', () => { V.headPrev = null; }); } catch {}   // a recenter (hold the Meta button) is not a step
  // 2D overlays animate with window.requestAnimationFrame (darts, durak), which a headset browser may stop running during an immersive
  // session. Each callback still goes to the browser; one it hasn't run within RAF_LATE ms runs from the XR frame instead (once).
  V.raf0 = window.requestAnimationFrame; V.caf0 = window.cancelAnimationFrame; V.rafQ = new Map(); V.rafId = 1e6;
  window.requestAnimationFrame = (cb) => { const id = ++V.rafId, e = { t0: performance.now(), rid: 0, run: (t) => { if (!V.rafQ?.delete(id) && V.rafQ) return; V.caf0.call(window, e.rid); cb(t); } }; e.rid = V.raf0.call(window, e.run); V.rafQ.set(id, e); return id; };
  window.cancelAnimationFrame = (id) => { const e = V.rafQ?.get(id); if (e) { V.rafQ.delete(id); V.caf0.call(window, e.rid); } else V.caf0.call(window, id); };
  session.addEventListener('visibilitychange', () => { if (session.visibilityState !== 'visible' && ctx.state === 'playing') ctx.setState('paused'); });
  session.addEventListener('end', end);
  document.body.classList.add('xr-on');
  if (ctx.state === 'paused' && !V.granted) ctx.setState('playing');
  V.granted = false;
  console.log('[vr] session started');
}

function end() {
  const { ctx } = V; V.presenting = false; ctx.xr.presenting = false; V.session = null; ctx.xrAim = null;
  const vm = ctx.weapons?.viewmodel; if (vm && V.vmParent) { V.vmParent.add(vm); vm.position.set(0, 0, 0); vm.rotation.set(0, 0, 0); vm.visible = true; }
  if (vm) { vm.traverse((o) => { if (/^arm_/.test(o.name)) o.visible = true; }); if (V.vmScale0) vm.scale.copy(V.vmScale0); }   // weapons.js only rewrites the screen scale when its fov changes
  V.arms = null; V.poseMark = null;
  for (const H of [V.h0, V.h1]) for (const c of H?.grip?.children || []) if (c !== V.gunMount) c.visible = true;
  if (V.shadows0) ctx.bus.emit('setting', { key: 'shadows', value: true });
  if (V.raf0) { window.requestAnimationFrame = V.raf0; window.cancelAnimationFrame = V.caf0; V.rafQ = null; V.raf0 = null; }   // pending callbacks are still queued with the browser
  V.crouch = false; V.sprintLatch = false; V.rigY = null; V.turnRate = 0; if (V.quick) quick(ctx, false); if (V.tabOn) { key('Tab', false); V.tabOn = false; }
  releaseKeys(); const inp = ctx.input; inp.xrMove = null; inp.touch.axis.x = inp.touch.axis.y = 0; inp.touch.fire = false;
  V.panel.visible = false; document.body.classList.remove('xr-on'); uncullAll(); raycastSeesCulled(false); for (const l of V.lightsOff || []) l.visible = true; V.lightsOff = null;
  ctx.camera.aspect = innerWidth / innerHeight; ctx.camera.updateProjectionMatrix();
  if (ctx.state === 'playing') ctx.setState('paused');
  console.log('[vr] session ended');
}

// ---- per frame: input (runs first, before touch / vehicles / player / weapons) -------------------------------------------------
export function update(dt, ctx) {
  if (!V.presenting) return;
  if (V.rafQ?.size) { const t = performance.now(); for (const e of [...V.rafQ.values()]) if (t - e.t0 > RAF_LATE) { try { e.run(t); } catch (err) { console.warn('[vr] raf', err); } } }
  const frame = ctx.renderer.xr.getFrame(), ref = ctx.renderer.xr.getReferenceSpace(); if (!frame || !ref) return;
  const pose = frame.getViewerPose(ref); if (pose) { const t = pose.transform; V.head.set(t.position.x, t.position.y, t.position.z); V.headQ.set(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w); if (!V.seatH0 && V.head.y > 0.3) V.seatH0 = V.head.y; }
  _e.setFromQuaternion(V.headQ, 'YXZ'); const headYaw = _e.y, headPitch = _e.x;
  const inp = ctx.input, p = ctx.player, playing = ctx.state === 'playing';
  V.ui = ctx.state !== 'playing' || V.uiHold || V.quick || !!p?.mounted?.dialog || !!ctx.durakOpen;
  // ---- gamepads ----
  // left-handed: the hands swap jobs (gun + turn stick on the left, move stick + bag on the right)
  const L = offHand(), R = mainHand(), Lg = L?.src?.hand ? null : L?.src?.gamepad, Rg = R?.src?.hand ? null : R?.src?.gamepad;   // tracked hands expose a gamepad too (button 0 = pinch): read hands as hands
  const btn = (g, i) => !!g?.buttons?.[i]?.pressed, ax = (g, i) => { const v = g?.axes?.[i] || 0; return Math.abs(v) < DEAD ? 0 : v; };
  let mx = 0, my = 0, fire = false, sprint = false;
  if (Lg) { mx = ax(Lg, 2); my = ax(Lg, 3); }
  // hands: a left pinch is a joystick (pinch, then move the hand the way you want to go)
  const LH = L?.src?.hand ? L : null, RH = R?.src?.hand ? R : null;
  for (const H of [LH, RH]) if (H) { const d = jointDist(H.hand, 'thumb-tip', 'index-finger-tip'); H.pinch = H.pinch ? d < PINCH_OFF : d < PINCH_ON; }
  if (LH && !V.wrist.shown) { if (LH.pinch) { const tip = LH.hand.joints['index-finger-tip']; if (tip) { if (!LH.stick0) LH.stick0 = tip.position.clone(); _v.subVectors(tip.position, LH.stick0).applyAxisAngle(_up, -headYaw); mx = clamp(_v.x / HAND_STICK, -1, 1); my = clamp(_v.z / HAND_STICK, -1, 1); } } else LH.stick0 = null; }
  // movement: analog to the player, and the touch stick for cars (vehicles.js reads it as analog throttle / steer)
  const moving = Math.hypot(mx, my) > 0.05;
  inp.xrMove = playing && !V.ui && moving ? { x: mx, y: -my } : null;
  inp.touch.axis.x = playing && !V.ui ? mx : 0; inp.touch.axis.y = playing && !V.ui ? my : 0;
  // sprint: click the left stick (latched until you let go of the stick) or hold the left trigger (also nitro in a car)
  if (btn(Lg, 3)) V.sprintLatch = true; if (!moving) V.sprintLatch = false; sprint = V.sprintLatch || btn(Lg, 0);
  // snap turn on the right stick (crouch: pull it down)
  const rx = ax(Rg, 2), ry = ax(Rg, 3);
  if (V.ui || !prefs.smooth) V.turnRate = 0;
  if (!V.ui) { if (prefs.smooth) { V.turnRate = Math.abs(rx) > 0.2 ? -Math.sign(rx) * (Math.abs(rx) - 0.2) / 0.8 * SMOOTH_TURN : 0; V.turn += V.turnRate * dt; }
    else { if (Math.abs(rx) > 0.7 && !V.snapLatch) { V.snapLatch = true; V.turn -= Math.sign(rx) * prefs.snap * Math.PI / 180; V.vigKick = 1; } if (Math.abs(rx) < 0.3) V.snapLatch = false; }
    if (ry > 0.75 && !V.crouchLatch) { V.crouchLatch = true; V.crouch = !V.crouch; } if (ry < 0.3) V.crouchLatch = false; }
  else if (Math.abs(ry) > 0.25) scrollUI(ry * 900 * dt);
  // buttons → the game's own keys
  const keys = new Set();
  if (sprint && !V.ui) keys.add('ShiftLeft'); if (V.crouch && !V.ui) keys.add('KeyC');
  if (btn(Rg, 4)) keys.add('Space');            // A: jump (hold a bike jump)
  if (btn(Rg, 5)) keys.add('KeyR');             // B: reload
  if (btn(Rg, 1)) keys.add('KeyF');             // right grip: interact / talk / get in & out
  if (btn(Lg, 4)) keys.add('KeyB');             // X: use the last thing you bought (drink, smoke …)
  if (btn(Lg, 1)) keys.add(p?.mounted && !p.mounted.dialog ? 'KeyQ' : 'KeyI');   // left grip: the bag (in a car: the horn)
  if (btn(Rg, 3) && !V.quickLatch) { V.quickLatch = true; quick(ctx, !V.quick); } else if (!btn(Rg, 3)) V.quickLatch = false;   // right stick click: quick actions
  setKeys(keys);
  // Y: the pause menu (the Quest's own ≡ button belongs to the system, WebXR never sees it)
  if (btn(Lg, 5) && !V.menuLatch) { V.menuLatch = true; ctx.setState(ctx.state === 'playing' ? 'paused' : 'playing'); } else if (!btn(Lg, 5)) V.menuLatch = false;
  // right stick up: next weapon (fists → the bag's guns → fists)
  if (!V.ui && playing && ry < -0.75 && !V.cycleLatch) { V.cycleLatch = true; cycleWeapon(ctx); } if (ry > -0.3) V.cycleLatch = false;
  fire = btn(Rg, 0) || !!RH?.pinch;
  // the hands' velocities (in the rig: your own motion, not the train's) for punches
  for (const H of [L, R]) if (H) { const src = H.src?.hand ? H.hand.joints['wrist'] : H.grip; if (src) { _v.copy(src.position); if (dt > 0 && H.seeded === H.src) H.vel.subVectors(_v, H.prev).divideScalar(dt); else H.vel.set(0, 0, 0); H.seeded = H.src; H.prev.copy(_v); } }   // the first sample of a new input has no history: no phantom 20 m/s jab
  // fists: a fast forward jab of either hand lands a punch from that hand
  const fists = ctx.weapons?.currentId === 'fists'; let punch = null;
  if (fists && playing && !V.ui) for (const H of [L, R]) if (H) { const fwd = _v2.set(-Math.sin(headYaw), 0, -Math.cos(headYaw)); const v = H.vel, along = v.dot(fwd);
    if (along > PUNCH_V && v.length() > PUNCH_V && V.time - H.punchT > PUNCH_GAP) { H.punchT = V.time; punch = H; } }
  V.time = (V.time || 0) + dt;
  // the aim: the gun hand's grip (or the punching hand) as a world pose for weapons.js
  V.punchH = punch;   // syncAim() aims from this hand this frame
  if (V.ui) V.fireLock = true; else if (!fire) V.fireLock = false;   // the trigger that just clicked a menu must be let go before it shoots
  inp.touch.fire = playing && !V.ui && !V.fireLock && (fists ? (!!punch && !V.punchPrev) || fire : fire);
  V.punchPrev = !!punch;
  if (punch) pulse(punch, 0.6, 60);
  // UI: lasers, clicks, the wrist menu
  pointers(ctx, dt, [L, R], fire, LH, RH);
  // ---- on foot: the player's yaw / pitch follow the head; big jumps from the game (a teleport) turn the rig instead ----
  const foot = !p?.mounted || p.mounted.dialog; V.footNow = foot;
  if (p && foot) {
    if (V.wroteYaw != null && Math.abs(wrap(p.yaw - V.wroteYaw)) > 0.35) V.turn += wrap(p.yaw - V.wroteYaw);
    if (!p.mounted?.dialog) { p.yaw = V.turn + headYaw; p.pitch = clamp(headPitch, -1.45, 1.45); } V.wroteYaw = p.yaw;
    // room-scale: the head moved over the floor → the body steps with it (collisions apply)
    if (V.headPrev && !p.dead && !p.mounted) { _v.set(V.head.x - V.headPrev.x, 0, V.head.z - V.headPrev.z).applyAxisAngle(_up, V.rigYaw); if (_v.lengthSq() < 1) (p.xrStep || (p.xrStep = new THREE.Vector3())).copy(_v); }
  } else V.wroteYaw = null;
  V.headPrev = (V.headPrev || new THREE.Vector3()).copy(V.head);
}
const _up = new THREE.Vector3(0, 1, 0);
function pulse(H, k, ms) { try { H?.src?.gamepad?.hapticActuators?.[0]?.pulse?.(k, ms); } catch {} }
function cycleWeapon(ctx) {
  const W = ctx.weapons; if (!W) return; const bag = W.bag || [], cur = W.currentId;
  if (cur === 'fists') { if (bag.length) W.selectBag(0); return; }
  const i = bag.findIndex((b) => (b?.id ?? b) === cur); if (i >= 0 && i + 1 < bag.length) W.selectBag(i + 1); else W.fists();
}
function jointDist(hand, a, b) { const A = hand.joints?.[a], B = hand.joints?.[b]; return A && B ? A.position.distanceTo(B.position) : 1; }

function tap(code) { key(code, true); setTimeout(() => key(code, false), 120); }
function setKeys(want) {
  for (const k of V.keys) if (!want.has(k)) key(k, false);
  for (const k of want) if (!V.keys.has(k)) key(k, true);
  V.keys = want;
}
function releaseKeys() { for (const k of V.keys) key(k, false); V.keys = new Set(); }
function key(code, down) { document.body.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code.replace(/^Key|^Digit/, '').toLowerCase(), bubbles: true, cancelable: true })); }

// ---- lasers + the panel's clicks ------------------------------------------------------------------------------------------------
function laser() {
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.85, depthTest: false })); line.renderOrder = 9995; line.visible = false; line.frustumCulled = false;
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.008, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false })); dot.renderOrder = 9996; dot.visible = false;
  return { line, dot };
}
function pointers(ctx, dt, Hs, fire, LH, RH) {
  const ui = V.ui && V.panel.visible;
  for (const H of Hs) {
    if (!H) continue; const las = H.laser; las.line.visible = las.dot.visible = false;
    const trig = H.src?.hand ? H.pinch : !!H.src?.gamepad?.buttons?.[0]?.pressed;
    if (!ui) { H.trigPrev = trig; continue; }
    H.ray.updateMatrixWorld(); _m.identity().extractRotation(H.ray.matrixWorld);
    _ray.ray.origin.setFromMatrixPosition(H.ray.matrixWorld); _ray.ray.direction.set(0, 0, -1).applyMatrix4(_m);
    const hit = _ray.intersectObject(V.panel, false)[0];
    las.line.visible = true; las.line.scale.z = hit ? hit.distance : 1.5;
    if (hit) {
      las.dot.visible = true; las.dot.position.set(0, 0, -hit.distance + 0.002);
      const x = hit.uv.x * innerWidth, y = (1 - hit.uv.y) * innerHeight; H.at = [x, y];
      las.line.material.color.set(clickable(x, y) ? 0x7dffb0 : 0xffd27a);
      if (trig && !H.trigPrev) { const el = pointerDown(x, y); V.lastClick = { x: Math.round(x), y: Math.round(y), el: el ? el.tagName + '.' + el.className : null }; V.drawT = 0; pulse(H, 0.25, 25); }
      else if (!trig && H.trigPrev) { pointerUp(x, y); V.drawT = 0; }
      else moveAt(x, y, trig);
    } else { if (!trig && H.trigPrev) pointerUp(); H.at = null; }
    H.trigPrev = trig;
  }
}
function scrollUI(dy) {
  const H = mainHand() || offHand(); if (!H?.at) return;
  let el = hitAt(H.at[0], H.at[1]);
  while (el && el !== document.body) { const cs = getComputedStyle(el); if (/auto|scroll/.test(cs.overflowY) && el.scrollHeight > el.clientHeight) { el.scrollTop += dy; V.drawT = 0; return; } el = el.parentElement; }
}

// ---- the wrist menu (hand tracking: no buttons, so the left palm carries them; poke with the right index finger) -------------
const WRIST = [['MENU', 'menu'], ['JUMP', 'Space'], ['TALK / F', 'KeyF'], ['BAG', 'KeyI'], ['MORE…', 'quick'], ['⟲ TURN', 'turnL'], ['TURN ⟳', 'turnR'], ['RELOAD', 'KeyR'], ['USE (B)', 'KeyB'], ['WEAPON', 'weapon']];
const WCOLS = 5, WCELL = 128, WW = 0.2, WH = 0.08;
function wristMenu() {
  const cv = document.createElement('canvas'); cv.width = WCOLS * WCELL; cv.height = 2 * WCELL; const g = cv.getContext('2d');
  const paint = (hot = -1) => { g.clearRect(0, 0, cv.width, cv.height); g.fillStyle = 'rgba(12,14,18,0.86)'; g.fillRect(0, 0, cv.width, cv.height);
    WRIST.forEach(([t], i) => { const x = (i % WCOLS) * WCELL, y = Math.floor(i / WCOLS) * WCELL; g.fillStyle = i === hot ? '#ffd27a' : '#2a2f38'; g.fillRect(x + 6, y + 6, WCELL - 12, WCELL - 12); g.fillStyle = i === hot ? '#111' : '#ffd27a'; g.font = 'bold 22px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x + WCELL / 2, y + WCELL / 2); }); };
  paint();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false })); m.renderOrder = 9992; m.visible = false; m.name = 'xrWrist';
  return { mesh: m, shown: false, t: 0, hot: -1, paint: (i) => { paint(i); tex.needsUpdate = true; } };
}
// the flat game's gloved forearms (baked per weapon into groups named arm_left / arm_right) float beside your real hand in VR: hide
// them every frame (reload / inspect animations show them again), with the list cached per weapon
function armsOff(ctx, vm) {
  const id = ctx.weapons.currentId; if (V.armsFor !== id || !V.arms) { V.armsFor = id; V.arms = []; vm.traverse((o) => { if (/^arm_/.test(o.name)) V.arms.push(o); }); }
  for (const o of V.arms) o.visible = false;
}
function wristUpdate(ctx) {
  const W = V.wrist, L = offHand(), R = mainHand();   // the menu on the off hand's palm, poked by the main hand
  const hand = L?.src?.hand ? L.hand : null; if (!hand) { W.mesh.visible = W.shown = false; return; }
  const wr = hand.joints['wrist'], mid = hand.joints['middle-finger-metacarpal']; if (!wr || !mid) return;
  if (W.mesh.parent !== wr) wr.add(W.mesh);
  W.mesh.position.set(0, -0.045, -0.05); W.mesh.rotation.set(Math.PI / 2, 0, 0);   // above the palm (a joint's -Y is out of the palm)
  // shown when the palm faces your eyes
  wr.updateMatrixWorld(); _v.set(0, -1, 0).transformDirection(wr.matrixWorld); _v2.setFromMatrixPosition(wr.matrixWorld); const eye = V.cam.getWorldPosition(new THREE.Vector3()).sub(_v2).normalize();
  W.shown = _v.dot(eye) > 0.55; W.mesh.visible = W.shown;
  if (!W.shown || !R?.src?.hand) return;
  const tip = R.hand.joints['index-finger-tip']; if (!tip) return;
  W.mesh.updateMatrixWorld(); _v.setFromMatrixPosition(tip.matrixWorld); W.mesh.worldToLocal(_v);
  // hover: the finger over a button lights it; a poke through the plane presses it once (pull back out to press again)
  const over = Math.abs(_v.x) < WW / 2 && Math.abs(_v.y) < WH / 2 && _v.z < 0.04 && _v.z > -0.03;
  const i = over ? Math.floor(_v.y > 0 ? 0 : 1) * WCOLS + clamp(Math.floor((_v.x + WW / 2) / (WW / WCOLS)), 0, WCOLS - 1) : -1;
  if (i !== W.hot) { W.hot = i; W.paint(i); }
  const poke = over && _v.z < 0.008;
  if (poke && !W.down) { W.down = true; pulse(V.hands.left, 0.3, 20); const [, act] = WRIST[i];
    if (act === 'menu') ctx.setState(ctx.state === 'playing' ? 'paused' : 'playing');
    else if (act === 'quick') quick(ctx, !V.quick);
    else if (act === 'weapon') cycleWeapon(ctx);
    else if (act === 'turnL' || act === 'turnR') V.turn += (act === 'turnL' ? 1 : -1) * prefs.snap * Math.PI / 180;
    else tap(act);
  } else if (!poke && _v.z > 0.02) W.down = false;
}

// ---- performance: the Quest draws every object twice (no multiview in three r186) on a phone-class GPU. The flat game draws
// ~1300 objects / 6M triangles a frame out to the horizon; at 72 Hz the headset manages a few hundred. Small things far away
// (cars, people, props, train cars) stop drawing past a distance that grows with their size; buildings, ground, sky stay.
// Hidden by moving them off layer 0 (the eyes' layer), so modules that toggle .visible themselves are untouched.
const CULL_LAYER = 30, CULL_EVERY = 0.2, CULL_RESCAN = 3, FIG_FAR = 45, INST_MIN = 8;
const cullDist = (r) => r < 1.5 ? 45 : r < 4 ? 75 : r < 10 ? 120 : r < 30 ? 220 : Infinity;
const _s = new THREE.Sphere();
function cull(ctx, dt) {
  V.cullT = (V.cullT || 0) - dt; if (V.cullT > 0) return; V.cullT = CULL_EVERY;
  V.scanT = (V.scanT || 0) - CULL_EVERY; const hidden = V.culled || (V.culled = new Set()), frozen = V.frozen || (V.frozen = new Set());
  // instanced / batched meshes: their geometry's sphere is one copy, not the spread of copies: never culled here.
  // figures (anything with a skeleton): the bone hierarchy is the expensive part (35 people = 2800 bones re-multiplied every frame),
  // so a far figure's whole rig also stops updating its matrices (see freeze) besides not drawing.
  if (V.scanT <= 0 || !V.cullList) { V.scanT = CULL_RESCAN; const L = V.cullList = [], F = V.figs = new Set();
    ctx.scene.traverse((o) => {
      if (o.isBone && !o.parent?.isBone && o.parent && !isRig(o.parent)) F.add(o.parent);
      if (o.isInstancedMesh && o.count > INST_MIN && !isRig(o)) instTrack(o);
      if (!(o.isMesh || o.isPoints || o.isLine) || o.isInstancedMesh || o.isBatchedMesh || !o.geometry || o === V.panel || isRig(o) || (!(o.layers.mask & 1) && !hidden.has(o))) return;   // culled ones have lost layer 0: keep them listed
      const g = o.geometry; if (!g.boundingSphere) { try { g.computeBoundingSphere(); } catch { return; } } if (!g.boundingSphere || !(g.boundingSphere.radius < 30)) return; L.push(o); });
    const live = new Set(L); for (const o of hidden) if (!live.has(o)) { unhide(o); hidden.delete(o); }   // gone or pooled away: whole again
    for (const f of frozen) if (!F.has(f)) { thaw(f); frozen.delete(f); } }
  const eye = ctx.camera.position;
  for (const o of V.cullList) {
    _s.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld); const far = _s.center.distanceTo(eye) - _s.radius > cullDist(_s.radius);
    if (far) { if (!hidden.has(o)) { o.userData.xrMask = o.layers.mask; o.layers.mask = (o.layers.mask & ~1) | (1 << CULL_LAYER); hidden.add(o); } }
    else if (hidden.has(o)) { unhide(o); hidden.delete(o); }
  }
  for (const o of V.inst?.keys() || []) instCull(o, eye);
  for (const f of V.figs) {
    if (!f.parent) continue;
    _v.copy(f.position).applyMatrix4(f.parent.matrixWorld);   // its parent still updates: a fresh position
    const far = _v.distanceTo(eye) > FIG_FAR;
    if (far && !frozen.has(f)) { freeze(f); frozen.add(f); } else if (!far && frozen.has(f)) { thaw(f); frozen.delete(f); }
  }
}
// a frozen figure keeps its last pose: Object3D.prototype.updateMatrixWorld is shadowed on that one object, so its subtree is skipped
const NOOP = function () {};
function freeze(f) { f.updateMatrixWorld = NOOP; }
function thaw(f) { delete f.updateMatrixWorld; f.matrixWorldNeedsUpdate = true; }
/** before a raycast: frozen figures catch up (once per frame) so a far shot still hits where they actually are */
function thawForRay() {
  const fr = V.frozen; if (!fr?.size || V.rayFrame === V.ctx.time.frame) return; V.rayFrame = V.ctx.time.frame;
  for (const f of fr) if (f.parent) THREE.Object3D.prototype.updateMatrixWorld.call(f, true);
}
function unhide(o) { if (o.userData.xrMask != null) { o.layers.mask = o.userData.xrMask; o.userData.xrMask = null; } }
function uncullAll() { for (const o of V.culled || []) unhide(o); for (const f of V.frozen || []) thaw(f); for (const o of V.inst?.keys() || []) instRestore(o); V.culled = null; V.frozen = null; V.cullList = null; V.figs = null; V.inst = null; }
// ---- instanced props spread over the map (parked cars: one InstancedMesh per car part holding every car of a kind, ~1500 cars,
// half the triangles of a Coney frame): only the copies in range are packed into the draw list. The full lists are kept and put
// back on exit. Instances a module moves itself (traffic, crowds) are left alone: their matrices change between our writes.
function instTrack(o) {
  const I = V.inst || (V.inst = new Map()); if (I.has(o)) return;
  const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); const r = g.boundingSphere?.radius ?? Infinity; if (!(r < 30)) return;
  I.set(o, { all: o.instanceMatrix.array.slice(), col: o.instanceColor?.array.slice() || null, n: o.count, r, ver: o.instanceMatrix.version, cx: g.boundingSphere.center });
}
function instCull(o, eye) {
  const e = V.inst.get(o); if (!o.parent) { instRestore(o); V.inst.delete(o); return; }
  if (o.instanceMatrix.version !== e.ver) { V.inst.delete(o); return; }   // someone else animates it: hands off (its own matrices stand)
  o.updateWorldMatrix(true, false); const me = o.matrixWorld.elements, lim = cullDist(e.r) + e.r, A = e.all, M = o.instanceMatrix.array, C = o.instanceColor?.array;
  let k = 0;
  for (let i = 0; i < e.n; i++) {
    const b = i * 16, x = A[b + 12], y = A[b + 13], z = A[b + 14];   // instance origin (local) → world through the mesh
    const wx = me[0] * x + me[4] * y + me[8] * z + me[12], wy = me[1] * x + me[5] * y + me[9] * z + me[13], wz = me[2] * x + me[6] * y + me[10] * z + me[14];
    const dx = wx - eye.x, dy = wy - eye.y, dz = wz - eye.z; if (dx * dx + dy * dy + dz * dz > lim * lim) continue;
    if (k !== i) { M.set(A.subarray(b, b + 16), k * 16); if (C) C.set(e.col.subarray(i * 3, i * 3 + 3), k * 3); }
    else if (M[b + 12] !== x || M[b + 14] !== z) { M.set(A.subarray(b, b + 16), b); if (C) C.set(e.col.subarray(i * 3, i * 3 + 3), i * 3); }
    k++;
  }
  if (k !== o.count || k !== e.k) { o.count = k; o.instanceMatrix.needsUpdate = true; if (o.instanceColor) o.instanceColor.needsUpdate = true; }
  e.k = k; e.ver = o.instanceMatrix.version;
}
function instRestore(o) { const e = V.inst?.get(o); if (!e) return; o.instanceMatrix.array.set(e.all); if (e.col && o.instanceColor) o.instanceColor.array.set(e.col); o.count = e.n; o.instanceMatrix.needsUpdate = true; if (o.instanceColor) o.instanceColor.needsUpdate = true; }
// culled things must still be hit by bullets, sight lines and footsteps: while in VR a raycast that would have seen layer 0 also sees
// the cull layer (culling only takes layer 0 away)
const RC = THREE.Raycaster.prototype, RC0 = { one: RC.intersectObject, all: RC.intersectObjects };
function raycastSeesCulled(on) {
  if (!on) { RC.intersectObject = RC0.one; RC.intersectObjects = RC0.all; return; }
  const wrap = (f) => function (...a) {
    const m = this.layers.mask; if (!(m & 1)) return f.apply(this, a);
    this.layers.enable(CULL_LAYER); try { return f.apply(this, a); } finally { this.layers.mask = m; }
  };
  RC.intersectObject = wrap(RC0.one); RC.intersectObjects = wrap(RC0.all);
}
function isRig(o) { for (let p = o; p; p = p.parent) if (p === V.rig || p === V.gunMount) return true; return false; }

// ---- comfort: a soft tunnel while you're moved by the stick, a car or a snap ---------------------------------------------------
function vignette() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, uniforms: { k: { value: 0 }, hurt: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    // k: the comfort tunnel (black edges); hurt: a red edge flash when you take damage (the flat game's is a screen-space post effect)
    fragmentShader: 'varying vec2 vUv; uniform float k; uniform float hurt; void main(){ float r = length(vUv - 0.5) * 2.0; float a = smoothstep(mix(1.2, 0.55, k), mix(1.4, 0.95, k), r) * k; float h = smoothstep(0.45, 1.0, r) * hurt; gl_FragColor = vec4(0.55 * h / max(a + h, 1e-3), 0.0, 0.0, max(a, h)); }',
  }));
  m.position.set(0, 0, -0.1); m.renderOrder = 9999; m.frustumCulled = false; m.name = 'xrVignette'; return m;
}

// ---- before the eyes render: place the rig, copy the head into ctx.camera, the gun into the hand, the panel ------------------
// where the game wants the eye this frame → the rig. Run twice a frame: before weapons fire (syncAim) and before the eyes render;
// only the second eases stairs.
function placeRig(ctx, ease) {
  const p = ctx.player, cam = ctx.camera, rig = V.rig;
  // where the game wants the eye: on foot the player's capsule; otherwise whatever wrote the camera (car seat, ride, cutscene)
  const foot = !p?.mounted || p.mounted.dialog, mode = foot ? 'foot' : 'seat';
  // a car / bike: the seat in the vehicle's own frame (no engine buzz, crash shake or lean: those are screen effects, and in a headset
  // any camera motion you didn't make is what makes people sick); rides without a vehicle body (train, bus seat) follow the camera
  const veh = !foot && p.mounted?.pos && p.mounted.spec && Number.isFinite(p.mounted.heading) ? p.mounted : null;
  _e.setFromQuaternion(cam.quaternion, 'YXZ'); const base = foot ? 0 : veh ? veh.heading : _e.y;
  if (mode !== V.mode) { V.turn = V.rigYaw - base; V.mode = mode; V.seatY = V.head.y; }   // no world-spin on getting in or out
  V.rigYaw = base + V.turn;
  rig.rotation.set(0, V.rigYaw, 0);
  _v.set(V.head.x, 0, V.head.z).applyAxisAngle(_up, V.rigYaw);
  // eye height: whatever your real height (or sitting), the world's floor moves so your eyes start at prefs.eye; ducking and
  // leaning still move you (the offset is fixed, measured once per session or on Recalibrate)
  const lift = (prefs.eye || EYE_DEFAULT) - (V.seatH0 || V.head.y);
  if (foot && p) rig.position.set(p.position.x - _v.x, p.position.y + (p.height - STAND_H) + lift, p.position.z - _v.z);
  else {
    const eye = _v2; if (veh) { const sp = veh.spec, fx = -Math.sin(veh.heading), fz = -Math.cos(veh.heading); eye.set(veh.pos.x - fx * (sp.eyeBack || 0) - fz * (sp.eyeSide || 0), veh.pos.y + (sp.eyeH || 1.2), veh.pos.z - fz * (sp.eyeBack || 0) + fx * (sp.eyeSide || 0)); } else eye.copy(cam.position);
    rig.position.set(eye.x - _v.x, eye.y - V.seatY, eye.z - _v.z);
  }
  // stairs and curbs: the flat game hides a step with an eased eye; here the rig eases, up and down, on the ground (falls, jumps and
  // teleports follow at once)
  if (foot) { const dy = rig.position.y - (V.rigY ?? rig.position.y); if (ease) V.rigY = Math.abs(dy) < 0.6 && p.onGround ? V.rigY + dy * Math.min(1, ctx.time.realDt * 12) : rig.position.y; if (V.rigY != null) rig.position.y = V.rigY; } else V.rigY = null;
  rig.updateMatrixWorld(true);
}
/** weapons.js calls this before it aims: the gun hand's (or a punching hand's) world pose, with this frame's player position */
export function syncAim(ctx) {
  if (!V.presenting) return; placeRig(ctx, false); thawForRay();   // far figures catch up before the player's own shots only (AI sight lines, footsteps don't need it)
  const H = V.punchH || mainHand(); if (!H) return;
  const src = !V.punchH && V.gunMount?.parent && V.gunMount.visible ? V.gunMount : H.src?.hand ? (H.hand.joints['wrist'] || H.grip) : H.grip;   // a gun aims down its own barrel
  src.updateMatrixWorld(true); src.matrixWorld.decompose(V.aim.position, V.aim.quaternion, _v);
  if (V.punchH) { _v.copy(V.punchH.vel).applyQuaternion(V.rig.quaternion).normalize(); V.aim.lookAt(_v.add(V.aim.position)); }   // a camera-type object: lookAt points its -Z
  V.aim.updateMatrixWorld(true);
}
export function render(ctx) {
  const p = ctx.player, cam = ctx.camera;
  placeRig(ctx, true);
  const foot = !p?.mounted || p.mounted.dialog;
  // the eye cameras have no parent: anything that asks one for its world position mid-render (sky, LODs, billboards' onBeforeRender)
  // would rebuild its world matrix from the bare head pose, i.e. put the eyes back at the world origin. Their world matrices are
  // set by WebXRManager.updateCamera from the rig; freeze them there.
  const xc = ctx.renderer.xr.getCamera(); xc.matrixWorldAutoUpdate = false; for (const c of xc.cameras) c.matrixWorldAutoUpdate = false;
  ctx.renderer.xr.updateCamera(V.cam);
  V.cam.matrixWorld.decompose(cam.position, cam.quaternion, _v); cam.updateMatrixWorld(true);
  // the gun in the right hand: weapons.js posed it for the screen (hip offset); take the hip back out so the grip is in your palm
  const vm = ctx.weapons?.viewmodel, R = mainHand();
  if (vm && V.gunMount) {
    const holder = R ? (R.src?.hand ? (R.hand.joints['wrist'] || R.grip) : R.grip) : null;
    if (holder && V.gunMount.parent !== holder) holder.add(V.gunMount);
    if (R?.src?.hand) { V.gunMount.position.set(0, -0.02, -0.06); V.gunMount.rotation.set(-0.5, 0, 0); } else { V.gunMount.position.set(0, -0.01, 0.05); V.gunMount.rotation.set(0, 0, 0); }
    // only once per weapons.js write (it re-poses every frame it runs; paused, it doesn't, and we mustn't subtract twice)
    const sp = ctx.weapons.spec, pose = vm.children[0];
    if (sp?.hip && pose && !(V.poseMark && pose.position.equals(V.poseMark))) { pose.position.x -= sp.hip.pos[0]; pose.position.y -= sp.hip.pos[1]; pose.position.z -= sp.hip.pos[2]; pose.rotation.x -= sp.hip.rot[0]; pose.rotation.y -= sp.hip.rot[1]; pose.rotation.z -= sp.hip.rot[2]; (V.poseMark || (V.poseMark = new THREE.Vector3())).copy(pose.position); }
    V.gunMount.visible = !!holder && ctx.weapons.currentId !== 'fists';
    vm.scale.set(1, 1, 1);   // weapons.js widens it on screen to fake a 50° viewmodel fov; in a hand it's life size
    armsOff(ctx, vm);
    if (R?.grip) for (const c of R.grip.children) if (c !== V.gunMount) c.visible = !V.gunMount.visible;
    const O = offHand(); if (O?.grip) for (const c of O.grip.children) if (c !== V.gunMount) c.visible = true;   // after a gun-hand switch   // the gun replaces the controller model in your hand
  }
  wristUpdate(ctx);
  panel(ctx);
  cull(ctx, ctx.time.realDt);
  // comfort tunnel: stick motion and vehicles at speed; a flash on snap turns
  const sp = foot ? Math.hypot(p?.velocity?.x || 0, p?.velocity?.z || 0) * (ctx.input.xrMove ? 1 : 0) : Math.abs(p?.mounted?.speed || 0) * 0.35;
  V.vigKick = Math.max(0, (V.vigKick || 0) - ctx.time.realDt * 4);
  // turning smoothly narrows the view too
  const want = prefs.vignette ? clamp(sp / 5 + Math.abs(V.turnRate || 0) / 3, 0, 0.85) : 0; V.vig.material.uniforms.k.value += (Math.max(want, prefs.vignette ? V.vigKick * 0.6 : 0) - V.vig.material.uniforms.k.value) * Math.min(1, ctx.time.realDt * 8);
  const hp = p?.health ?? 100; if (V.hp != null && hp < V.hp - 0.5) V.hurtK = Math.min(0.85, (V.hurtK || 0) + (V.hp - hp) / 40 + 0.25); V.hp = hp;
  V.hurtK = Math.max(p?.dead ? 0.7 : 0, (V.hurtK || 0) - ctx.time.realDt * 1.2); V.vig.material.uniforms.hurt.value = V.hurtK;
  V.vig.visible = V.vig.material.uniforms.k.value > 0.01 || V.hurtK > 0.01;
  ctx.renderer.render(ctx.scene, V.cam);
}

function panel(ctx) {
  const P = V.panel, ui = V.ui, show = ui || prefs.hud;
  P.visible = show; if (!show) return;
  // repaint the DOM: menus often (they're being clicked), the HUD a few times a second
  // HUD: a few times a second (the minimap and compass are canvases); menus when something changed; minigames (canvas) steadily
  V.drawT -= ctx.time.realDt; V.idleT = (V.idleT || 0) + ctx.time.realDt;
  const game = !!ctx.durakOpen, due = V.drawT <= 0 && (game || !ui || V.dirty || V.idleT > 1);
  if (due) { V.drawT = 1 / (game ? GAME_HZ : ui ? UI_HZ : HUD_HZ); V.dirty = false; V.idleT = 0; V.mirror.draw(!ui); V.tex.needsUpdate = true; }
  // in a car the dashboard is ~0.6 m away: the HUD comes in front of it (same angular size), menus too
  const seat = V.mode === 'seat', k = seat ? (ui ? SEAT_UI_DIST : SEAT_HUD_DIST) / (ui ? UI_DIST : HUD_DIST) : 1;
  const asp = V.mirror.H / V.mirror.W, w = (ui ? UI_W : HUD_W) * k, d = (ui ? UI_DIST : HUD_DIST) * k;
  _e.setFromQuaternion(V.headQ, 'YXZ'); const hy = _e.y;
  if (ui !== V.panelUI) { V.panelUI = ui; V.panelYaw = hy; V.panelY = V.head.y - (ui ? 0.1 : 0.2); }   // a menu opens straight ahead of you and stays put
  else if (!ui && Math.abs(wrap(hy - V.panelYaw)) > HUD_FOLLOW) V.panelYaw += wrap(hy - V.panelYaw) * Math.min(1, ctx.time.realDt * 2.5);   // the HUD drifts after you
  if (!ui) V.panelY += (V.head.y - 0.2 - V.panelY) * Math.min(1, ctx.time.realDt * 2);
  P.scale.set(w, w * asp, 1);
  P.position.set(V.head.x - Math.sin(V.panelYaw) * d, V.panelY, V.head.z - Math.cos(V.panelYaw) * d);
  P.rotation.set(0, V.panelYaw, 0);
  P.material.opacity = ui ? 1 : 0.92;
}

// ---- 2D: the ENTER VR button and the VR options card (mirrored into the headset with the pause menu) --------------------------
function enterButton(ctx) {
  if (!navigator.xr) return;
  navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
    if (!ok) return; V.supported = true;
    const b = document.createElement('button'); b.id = 'vrEnter'; b.textContent = ctx.xrDevice ? '🥽  ENTER VR' : '🥽 VR'; b.dataset.vrSkip = '1';
    b.style.cssText = `position:fixed;z-index:100000;left:50%;transform:translateX(-50%);bottom:${ctx.xrDevice ? '9%' : '12px'};padding:${ctx.xrDevice ? '22px 54px' : '8px 16px'};font:800 ${ctx.xrDevice ? 30 : 14}px system-ui;letter-spacing:.06em;color:#111;background:#ffd27a;border:0;border-radius:999px;box-shadow:0 6px 30px rgba(0,0,0,.5);cursor:pointer`;
    b.addEventListener('click', (e) => { e.stopPropagation(); start(); });
    document.body.appendChild(b);
    const sync = () => { b.style.display = V.presenting ? 'none' : ''; }; ctx.bus.on('state', sync); setInterval(sync, 1000);
  }).catch(() => {});
}
function optionsCard(ctx) {
  const el = document.createElement('div'); el.id = 'vrOpts';
  el.style.cssText = 'position:fixed;z-index:9000;right:16px;top:16px;width:260px;padding:14px 16px;background:rgba(14,16,20,.92);border:1px solid rgba(255,210,122,.5);border-radius:12px;color:#eee;font:600 15px system-ui;display:none';
  const row = (label, html) => `<div style="display:flex;justify-content:space-between;align-items:center;margin:8px 0">${label}${html}</div>`;
  const pill = (k, v, t) => `<button data-k="${k}" data-v="${v}" style="margin-left:6px;padding:6px 10px;border-radius:8px;border:0;font:700 14px system-ui;cursor:pointer">${t}</button>`;
  el.innerHTML = `<div style="color:#ffd27a;font:800 16px system-ui;letter-spacing:.08em;margin-bottom:6px">VR</div>`
    + row('Snap turn', `<span>${pill('snap', 30, '30°')}${pill('snap', 45, '45°')}${pill('snap', 90, '90°')}</span>`)
    + row('Comfort tunnel', `<span>${pill('vignette', 1, 'On')}${pill('vignette', 0, 'Off')}</span>`)
    + row('HUD', `<span>${pill('hud', 1, 'On')}${pill('hud', 0, 'Off')}</span>`)
    + row('Turning', `<span>${pill('smooth', 0, 'Snap')}${pill('smooth', 1, 'Smooth')}</span>`)
    + row('Gun hand', `<span>${pill('left', 0, 'Right')}${pill('left', 1, 'Left')}</span>`)
    + row('Eye height', `<span>${pill('eye', 1.6, '1.6')}${pill('eye', 1.8, '1.8')}${pill('eye', 2, '2.0 m')}</span>`)
    + `<button data-k="recal" style="width:100%;margin:4px 0 8px;padding:8px;border-radius:10px;border:0;background:#2a2f38;color:#eee;font:700 14px system-ui;cursor:pointer">Recalibrate height (stand or sit naturally)</button>`
    + `<div style="font:500 12px system-ui;opacity:.75;line-height:1.45;margin:10px 0">Left stick move · click it or hold left trigger to sprint · right stick ←/→ turn, ↑ next weapon, ↓ crouch, click: quick actions (map, grenade, radio, horn …) · trigger fire / click · right grip F · A jump · B reload · X use · left grip bag · Y menu. Hands: pinch left + drag to walk, pinch right to fire, look at your left palm for buttons (MORE… = quick actions). Fists: punch for real. Left-handed: the two hands swap.</div>`
    + `<button data-k="exit" style="width:100%;padding:10px;border-radius:10px;border:0;background:#c0392b;color:#fff;font:800 15px system-ui;cursor:pointer">EXIT VR</button>`;
  const paint = () => { for (const b of el.querySelectorAll('button[data-v]')) { const on = String(+prefs[b.dataset.k]) === b.dataset.v || ((b.dataset.k === 'snap' || b.dataset.k === 'eye') && +b.dataset.v === +prefs[b.dataset.k]); b.style.background = on ? '#ffd27a' : '#2a2f38'; b.style.color = on ? '#111' : '#ddd'; } };
  el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; e.stopPropagation(); if (b.dataset.k === 'exit') { V.session?.end(); return; }
    if (b.dataset.k === 'recal') { V.seatH0 = V.head.y; return; }
    const k = b.dataset.k, v = +b.dataset.v; prefs[k] = k === 'snap' || k === 'eye' ? v : !!v; save(); paint(); });
  document.body.appendChild(el); paint();
  const sync = () => { el.style.display = V.presenting && ctx.state !== 'playing' ? '' : 'none'; }; ctx.bus.on('state', sync); setInterval(sync, 500);
}

// ---- quick actions: every key-only action of the flat game, one laser click away (right stick click / the wrist's MORE…) ----------
const QUICK = [['🗺️ Map', 'KeyM'], ['💣 Grenade', 'KeyG'], ['🔪 Stab', 'KeyV'], ['🚀 Jetpack', 'KeyX'], ['📻 Radio on/off', 'KeyL'], ['⏭️ Next song', 'Period'],
  ['📯 Horn', 'KeyQ'], ['🚽 Take a leak', 'KeyP'], ['💵 Give a friend $10', 'KeyN'], ['🔫 Sell a friend a pistol', 'KeyJ'], ['👥 Players', 'Tab'], ['❔ Help', 'KeyH'],
  ['🧎 Crouch', 'crouch'], ['🔄 Respawn', 'KeyT'], ['🎒 Bag', 'KeyI'], ['✖ Close', 'close']];
function quick(ctx, on) {
  if (!V.quickEl) {
    const el = V.quickEl = document.createElement('div'); el.id = 'vrQuick';
    el.style.cssText = 'position:fixed;z-index:9500;left:50%;top:50%;transform:translate(-50%,-50%);width:min(760px,92vw);padding:18px;background:rgba(14,16,20,.95);border:1px solid rgba(255,210,122,.6);border-radius:16px;display:none;grid-template-columns:repeat(4,1fr);gap:10px;font:700 17px system-ui';
    el.innerHTML = QUICK.map(([t, k]) => `<button data-k="${k}" style="padding:16px 8px;border-radius:10px;border:0;background:#2a2f38;color:#eee;font:inherit;cursor:pointer">${t}</button>`).join('');
    el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; e.stopPropagation(); const k = b.dataset.k; quick(ctx, false);
      if (k === 'close') return; if (k === 'KeyV' && ctx.player?.mounted && !ctx.player.mounted.dialog) return;   // V is the chase cam in a vehicle
      if (k === 'crouch') { V.crouch = !V.crouch; return; } if (k === 'Tab') { key('Tab', !V.tabOn); V.tabOn = !V.tabOn; return; } tap(k); });
    document.body.appendChild(el);
  }
  V.quick = !!on; V.quickEl.style.display = on ? 'grid' : 'none'; V.drawT = 0;
}

// ---- a keyboard for text fields (name, room, chat): immersive mode has no system keyboard. It's DOM, so the panel mirrors it ----
const KROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
function keyboard(ctx) {
  const el = document.createElement('div'); el.id = 'vrKbd';
  el.style.cssText = 'position:fixed;z-index:9800;left:50%;bottom:3%;transform:translateX(-50%);padding:10px;background:rgba(14,16,20,.96);border:1px solid rgba(255,210,122,.6);border-radius:14px;display:none;font:700 20px system-ui';
  const k = (t, v = t, w = 1) => `<button data-v="${v}" style="width:${w * 52}px;height:52px;margin:3px;border-radius:8px;border:0;background:#2a2f38;color:#eee;font:inherit;cursor:pointer">${t}</button>`;
  const draw = () => { el.innerHTML = KROWS.map((r) => `<div style="text-align:center">${[...r].map((c) => k(V.shift ? c.toUpperCase() : c)).join('')}</div>`).join('')
    + `<div style="text-align:center">${k('⇧', 'shift', 1.5)}${k('space', ' ', 5)}${k('⌫', 'back', 1.5)}${k('Done ⏎', 'enter', 2.4)}</div>`; };
  draw();
  el.addEventListener('mousedown', (e) => e.preventDefault());   // keep the text field focused
  el.addEventListener('click', (e) => { const b = e.target.closest('button'); const f = V.kbdFor; if (!b || !f) return; e.stopPropagation(); const v = b.dataset.v;
    if (v === 'shift') { V.shift = !V.shift; draw(); }
    else if (v === 'back') { f.value = f.value.slice(0, -1); f.dispatchEvent(new Event('input', { bubbles: true })); }
    else if (v === 'enter') { for (const t of ['keydown', 'keyup']) f.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', bubbles: true })); f.dispatchEvent(new Event('change', { bubbles: true })); f.blur(); show(null); }
    else { f.value += v; f.dispatchEvent(new Event('input', { bubbles: true })); if (V.shift) { V.shift = false; draw(); } }
    V.drawT = 0; });
  document.body.appendChild(el);
  const show = (f) => { V.kbdFor = f; el.style.display = f ? 'block' : 'none'; V.drawT = 0; };
  document.addEventListener('focusin', (e) => { const t = e.target; if (V.presenting && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && /^(text|search|number|email|url|tel|password)$/.test(t.type || 'text')))) show(t); });
  document.addEventListener('focusout', (e) => { if (e.target === V.kbdFor) setTimeout(() => { if (document.activeElement !== V.kbdFor) show(null); }, 0); });
}

function qaHooks() {
  return {
    state: () => ({ presenting: V.presenting, ui: V.ui, mode: V.mode, turn: +V.turn.toFixed(3), rigYaw: +V.rigYaw.toFixed(3), head: V.head.toArray().map((v) => +v.toFixed(3)), rig: V.rig.position.toArray().map((v) => +v.toFixed(2)),
      cam: V.ctx.camera.position.toArray().map((v) => +v.toFixed(2)), hands: Object.keys(V.hands), panel: !!V.panel?.visible, mirrorMs: +(V.mirror?.ms || 0).toFixed(1), keys: [...V.keys], aim: V.aim.position.toArray().map((v) => +v.toFixed(2)), wrist: V.wrist.shown, culled: V.culled?.size || 0, inputs: V.session ? V.session.inputSources.length : 0, at: (V.hands.right?.at || []).map(Math.round), click: V.lastClick || null }),
    enter: () => start(), exit: () => V.session?.end(), mirror: () => V.mirror?.canvas.toDataURL('image/png'), prefs,
  };
}
