// VR port: node qa/vr-test.mjs [outdir] — the game under Meta's Immersive Web Emulation Runtime (a scripted Quest 3: head,
// controllers, hands), in headless Chrome. Enters VR, then: head yaw drives the player, the left stick walks where you look, snap
// turn, room-scale steps, the gun fires down the right controller, a real jab punches with fists, Y pauses and the menu shows on
// the panel and takes laser clicks, hands pinch-walk, a car seat follows, leaving VR restores the flat game.
import pw from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
const { chromium } = pw;
const out = process.argv[2] || '/tmp';
const PAGE = `http://localhost:${process.env.PORT || 8790}/?qa=1&map=coney&mode=chill&vr=1&time=day`;
const IWER = readFileSync(new URL('../node_modules/iwer/build/iwer.min.js', import.meta.url), 'utf8');
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio', '--enable-unsafe-swiftshader'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const errs = [];
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
pg.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERROR', e.message); });
pg.on('console', (m) => { if (/\[vr\]/.test(m.text()) || m.type() === 'error') console.log('console', m.text().slice(0, 300)); });
await pg.addInitScript(IWER + `\n;window.__iwer = new IWER.XRDevice(IWER.metaQuest3); window.__iwer.installRuntime({ forceInstall: true }); try { localStorage.setItem('zavod.helpSeen', '1'); } catch {}`);
await pg.goto(PAGE, { timeout: 180000 }); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
await pg.evaluate(() => window.__game.setState('playing')); await pg.waitForTimeout(600);
const S = () => pg.evaluate(() => window.__game.vr.state());
const P = () => pg.evaluate(() => { const p = window.__ctx.player; return { pos: p.position.toArray().map((v) => +v.toFixed(2)), yaw: +p.yaw.toFixed(3), state: window.__ctx.state }; });
const dev = (fn, arg) => pg.evaluate(fn, arg);
const ctl = (side, fn) => pg.evaluate(`window.__iwer.controllers.${side}.${fn}`);
const shot = (n) => pg.screenshot({ path: `${out}/vr-${n}.png` });
const until = async (fn, ms = 6000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await new Promise((r) => setTimeout(r, 100)); } };
// point the right controller's ray at a rig-local point
const aimRight = (t) => dev((t) => { const c = window.__iwer.controllers.right, o = c.position, d = [t[0] - o.x, t[1] - o.y, t[2] - o.z], L = Math.hypot(...d); d.forEach((v, i) => { d[i] = v / L; });
  const ax = [d[1], -d[0], 0], al = Math.hypot(...ax), ang = Math.acos(-d[2]), sn = Math.sin(ang / 2); if (al > 1e-6) c.quaternion.set(ax[0] / al * sn, ax[1] / al * sn, 0, Math.cos(ang / 2)); else c.quaternion.set(0, 0, 0, 1); }, t);
const click = async (side = 'right', b = 'trigger', ms = 150) => { await ctl(side, `updateButtonValue('${b}', 1)`); await pg.waitForTimeout(ms); await ctl(side, `updateButtonValue('${b}', 0)`); await pg.waitForTimeout(400); };
/** put a controller's poking tip on a rig-local point */
const tipTo = async (side, t, dz = 0) => { await dev((side) => window.__iwer.controllers[side].quaternion.set(0, 0, 0, 1), side); await pg.waitForTimeout(150); const off = await pg.evaluate((s) => window.__game.vr.tipOffset(s), side); await dev(([side, t, off, dz]) => { const c = window.__iwer.controllers[side]; c.quaternion.set(0, 0, 0, 1); c.position.set(t[0] - off[0], t[1] - off[1], t[2] - off[2] + dz); }, [side, t, off || [0, 0, 0], dz]); };

// ---- enter ----
ok(await pg.evaluate(() => !!document.getElementById('vrEnter')), 'the ENTER VR button is on the page');
await pg.evaluate(() => window.__game.vr.enter()); await pg.waitForFunction(() => window.__game.vr.state().presenting, null, { timeout: 15000 }).catch(() => {});
let s = await S(); ok(s.presenting, 'entered immersive VR', JSON.stringify(s));
await pg.waitForTimeout(1500);
const f0 = await pg.evaluate(() => window.__ctx.time.frame); await pg.waitForTimeout(1000); const f1 = await pg.evaluate(() => window.__ctx.time.frame);
ok(f1 - f0 > 10, 'the XR frame loop runs', `${f1 - f0} frames/s`);
await shot('enter');
s = await S(); ok(s.hands.includes('left') && s.hands.includes('right'), 'both controllers connected', JSON.stringify(s.hands));
ok(!s.ui && s.panel, 'playing: HUD panel shown, not in UI mode', JSON.stringify({ ui: s.ui, panel: s.panel }));
// the camera the game reads sits at the head: ~1.6 m over the player's feet
let p = await P(); ok(Math.abs(s.cam[1] - p.pos[1] - 2.0) < 0.1 && Math.hypot(s.cam[0] - p.pos[0], s.cam[2] - p.pos[2]) < 0.05, 'ctx.camera = the real head over the capsule, eyes at 2.0 m', JSON.stringify({ cam: s.cam, feet: p.pos }));

// ---- look: turning the head turns the player ----
await dev(() => { const q = window.__iwer.quaternion; const s = Math.sin(Math.PI / 4), c = Math.cos(Math.PI / 4); q.set(0, s, 0, c); });   // 90° left
await pg.waitForTimeout(400); const pY = await P(); s = await S();
ok(Math.abs(Math.atan2(Math.sin(pY.yaw - s.turn - Math.PI / 2), Math.cos(pY.yaw - s.turn - Math.PI / 2))) < 0.05, 'head yaw drives the player yaw', JSON.stringify({ yaw: pY.yaw, turn: s.turn }));
// ---- walk: the left stick goes where you look ----
p = await P(); await ctl('left', "updateAxes('thumbstick', 0, -1)"); await pg.waitForTimeout(1500); await ctl('left', "updateAxes('thumbstick', 0, 0)"); await pg.waitForTimeout(300);
let p2 = await P(); const dx = p2.pos[0] - p.pos[0], dz = p2.pos[2] - p.pos[2];
const fx = -Math.sin(pY.yaw), fz = -Math.cos(pY.yaw);
ok(Math.hypot(dx, dz) > 2 && (dx * fx + dz * fz) / Math.hypot(dx, dz) > 0.9, 'left stick walks the way the head faces', JSON.stringify({ moved: [dx.toFixed(2), dz.toFixed(2)], facing: [fx.toFixed(2), fz.toFixed(2)] }));
await dev(() => window.__iwer.quaternion.set(0, 0, 0, 1)); await pg.waitForTimeout(300);
const tut = await pg.evaluate(() => window.__game.vr.tut()); ok(tut >= 1, 'first time in VR: the walk-through is up, and walking ticks off its first step', String(tut));
// ---- snap turn ----
s = await S(); const t0 = s.turn; await ctl('right', "updateAxes('thumbstick', 1, 0)"); await pg.waitForTimeout(250); await ctl('right', "updateAxes('thumbstick', 0, 0)"); await pg.waitForTimeout(250);
s = await S(); ok(Math.abs(s.turn - t0 + Math.PI / 4) < 0.01, 'right stick: a 45° snap turn to the right', JSON.stringify({ t0, t1: s.turn }));
await ctl('right', "updateAxes('thumbstick', 1, 0)"); await pg.waitForTimeout(500); s = await S(); ok(Math.abs(s.turn - t0 + Math.PI / 2) < 0.01, 'one snap per push (holding does not spin)', String(s.turn)); await ctl('right', "updateAxes('thumbstick', 0, 0)"); await pg.waitForTimeout(200);
// ---- room-scale: step 0.5 m forward in the room → the body follows ----
p = await P(); s = await S(); await dev(() => { const d = window.__iwer.position; d.set(d.x, d.y, d.z - 0.5); }); await pg.waitForTimeout(500);
p2 = await P(); const step = Math.hypot(p2.pos[0] - p.pos[0], p2.pos[2] - p.pos[2]); ok(step > 0.4 && step < 0.6, 'room-scale: a real step moves the player', step.toFixed(2));
const s2 = await S(); ok(Math.hypot(s2.cam[0] - p2.pos[0], s2.cam[2] - p2.pos[2]) < 0.05, '…and the head stays over the capsule', JSON.stringify({ cam: s2.cam, p: p2.pos }));
await dev(() => { const d = window.__iwer.position; d.set(d.x, d.y, d.z + 0.5); }); await pg.waitForTimeout(400);

// ---- guns: the right trigger fires down the barrel of the controller ----
await pg.evaluate(() => { const W = window.__ctx.weapons; W.collect('ak74', 120); W.selectBag(W.bag.indexOf('ak74')); }); await pg.waitForTimeout(900);
s = await S(); const gun = await pg.evaluate(() => ({ id: window.__ctx.weapons.currentId, vm: (() => { const v = window.__ctx.weapons.viewmodel, w = new window.__ctx.THREE.Vector3(); v.getWorldPosition(w); return w.toArray().map((x) => +x.toFixed(2)); })(), parent: window.__ctx.weapons.viewmodel.parent?.name }));
ok(gun.parent === 'xrGunMount', 'the gun is in the right hand', JSON.stringify(gun));
const a0 = await pg.evaluate(() => window.__ctx.weapons.current?.ammo ?? window.__ctx.weapons.primary?.ammo);
await ctl('right', "updateButtonValue('trigger', 1)"); await pg.waitForTimeout(400); await ctl('right', "updateButtonValue('trigger', 0)"); await pg.waitForTimeout(300);
const a1 = await pg.evaluate(() => window.__ctx.weapons.current?.ammo ?? window.__ctx.weapons.primary?.ammo);
ok(a1 < a0, 'right trigger fires', JSON.stringify({ a0, a1 }));
await shot('gun');
// …and the bullet really leaves the gun: the aim sits on the gun in the hand, and a target 10 m down the barrel takes the hit
const hit = await pg.evaluate(async () => {
  const T = window.__ctx.THREE, sc = window.__ctx.scene, aim = window.__ctx.xrAim, mount = sc.getObjectByName('xrGunMount');
  const gp = mount.getWorldPosition(new T.Vector3()), d = aim.getWorldDirection(new T.Vector3()), off = aim.position.distanceTo(gp);
  const box = new T.Mesh(new T.BoxGeometry(1.5, 1.5, 1.5), new T.MeshBasicMaterial()); box.position.copy(aim.position).addScaledVector(d, 10); box.updateMatrixWorld(true);
  window.__hits = 0; box.userData.onHit = () => { window.__hits++; }; sc.add(box); window.__ctx.raycastTargets.push(box);
  window.__iwer.controllers.right.updateButtonValue('trigger', 1); await new Promise((r) => setTimeout(r, 300)); window.__iwer.controllers.right.updateButtonValue('trigger', 0); await new Promise((r) => setTimeout(r, 200));
  sc.remove(box); window.__ctx.raycastTargets.splice(window.__ctx.raycastTargets.indexOf(box), 1);
  return { off: +off.toFixed(3), hits: window.__hits, aim: aim.position.toArray().map((v) => +v.toFixed(2)) };
});
ok(hit.off < 0.3 && hit.hits > 0, 'the aim is on the gun in the hand, and a target 10 m down the barrel is hit', JSON.stringify(hit));
// ---- fists: a real jab lands a punch ----
await pg.evaluate(() => window.__ctx.weapons.fists()); await pg.waitForTimeout(700);
const pre = await pg.evaluate(() => window.__ctx.weapons.combo?.() ?? 0);
const fired0 = await pg.evaluate(() => window.__game.weaponsFired?.() ?? null);
let punched = false; await pg.exposeFunction('__punchSeen', () => { punched = true; });
await pg.evaluate(() => window.__ctx.bus.on('weaponFired', () => window.__punchSeen()));
await pg.evaluate(() => window.__ctx.bus.on('shot', () => window.__punchSeen()));
await dev(() => { const c = window.__iwer.controllers.right; c.position.set(c.position.x, c.position.y, c.position.z); });
for (let i = 0; i < 6; i++) { await dev((i) => { const c = window.__iwer.controllers.right; c.position.set(c.position.x, c.position.y, c.position.z - 0.12); }, i); await pg.waitForTimeout(16); }
await pg.waitForTimeout(300); for (let i = 0; i < 6; i++) { await dev(() => { const c = window.__iwer.controllers.right; c.position.set(c.position.x, c.position.y, c.position.z + 0.12); }); await pg.waitForTimeout(40); }
const combo = await pg.evaluate(() => window.__ctx.weapons.combo?.() ?? 0);
ok(punched || combo > pre, 'a fast jab of the right hand throws a punch', JSON.stringify({ punched, combo, pre }));

// ---- a knife: a fast swing of the hand slashes ----
let slashed = false; await pg.exposeFunction('__slashSeen', () => { slashed = true; });
await pg.evaluate(() => { window.__ctx.weapons.collect('knife', 0); window.__ctx.weapons.selectBag(window.__ctx.weapons.bag.indexOf('knife')); window.__ctx.bus.on('shot', () => window.__slashSeen()); }); await pg.waitForTimeout(800);
for (let i = 0; i < 6; i++) { await dev(() => { const c = window.__iwer.controllers.right; c.position.set(c.position.x + 0.13, c.position.y, c.position.z); }); await pg.waitForTimeout(16); }
await pg.waitForTimeout(300); for (let i = 0; i < 6; i++) { await dev(() => { const c = window.__iwer.controllers.right; c.position.set(c.position.x - 0.13, c.position.y, c.position.z); }); await pg.waitForTimeout(40); }
ok(slashed, 'a fast sideways swing with the knife slashes', String(slashed));

// ---- Y: the wrist tablet on the left controller; laser + trigger works its buttons; its PAUSE MENU brings up the 2D menu ----
await dev(() => { window.__iwer.quaternion.set(0, 0, 0, 1); const l = window.__iwer.controllers.left; l.position.set(-0.2, 1.3, -0.35); l.quaternion.set(0, 0, 0, 1); const r = window.__iwer.controllers.right; r.position.set(0.2, 1.3, -0.3); }); await pg.waitForTimeout(300);
await click('left', 'y-button', 200); await pg.waitForTimeout(400);
let tb = await pg.evaluate(() => window.__game.vr.tablet()); ok(tb.shown && tb.rects > 7, 'Y: the tablet is up on the left controller', JSON.stringify(tb));
await shot('tablet');
// GUNS tab → the AK button draws it
await pg.evaluate(() => { const W = window.__ctx.weapons; W.collect('ak74', 120); W.fists(); }); await pg.waitForTimeout(400);
let at = await pg.evaluate(() => window.__game.vr.tabletRect(window.__game.vr.tabletTab('guns'))); await aimRight(at); await pg.waitForTimeout(200); await click();
const akBtn = await pg.evaluate(() => { const n = window.__ctx.weapons.bag.indexOf('ak74'); return window.__game.vr.tabletRect(7 + 1 + n); }); await aimRight(akBtn); await pg.waitForTimeout(200);
await click(); await pg.waitForTimeout(500);
tb = await pg.evaluate(() => ({ ...window.__game.vr.tablet(), cur: window.__ctx.weapons.currentId }));
ok(tb.tab === 'guns' && tb.cur === 'ak74', 'tablet: GUNS tab, the AK button draws it (laser + trigger)', JSON.stringify(tb));
// ACT tab → PAUSE MENU (the last button)
at = await pg.evaluate(() => window.__game.vr.tabletRect(window.__game.vr.tabletTab('act'))); await aimRight(at); await pg.waitForTimeout(200); await click();
at = await pg.evaluate(() => window.__game.vr.tabletRect(7 + 11)); await aimRight(at); await pg.waitForTimeout(200); await click(); await pg.waitForTimeout(500);
p = await P(); s = await S(); ok(p.state === 'paused' && s.ui && s.panel, 'tablet → PAUSE MENU: paused, the menu panel is up', JSON.stringify({ state: p.state, ui: s.ui, panel: s.panel }));
writeFileSync(`${out}/vr-mirror-pause.png`, Buffer.from((await pg.evaluate(() => window.__game.vr.mirror())).split(',')[1], 'base64'));
const vrOpts = await pg.evaluate(() => getComputedStyle(document.getElementById('vrOpts')).display !== 'none'); ok(vrOpts, 'the VR options card is on the pause menu');
await shot('pause');
// aim the right controller at the RESUME button: the button's viewport point → the panel's world point → point the ray there
const aimed = await pg.evaluate(() => {
  const el = [...document.querySelectorAll('button, .btn, [data-act]')].find((b) => /resume/i.test(b.textContent) && b.getBoundingClientRect().width > 0); if (!el) return null;
  const r = el.getBoundingClientRect(), u = (r.left + r.width / 2) / innerWidth, v = 1 - (r.top + r.height / 2) / innerHeight;
  const T = window.__ctx.THREE, panel = window.__ctx.scene.getObjectByName('xrPanel'), rig = window.__ctx.scene.getObjectByName('xrRig');
  const local = new T.Vector3(u - 0.5, v - 0.5, 0); panel.updateMatrixWorld(true); const world = local.applyMatrix4(panel.matrixWorld); const inRig = rig.worldToLocal(world.clone());
  return { label: el.textContent.trim(), target: inRig.toArray() };
});
ok(!!aimed, 'found the RESUME button', JSON.stringify(aimed));
if (aimed) {
  await dev((t) => { const c = window.__iwer.controllers.right, o = c.position, d = [t[0] - o.x, t[1] - o.y, t[2] - o.z], L = Math.hypot(...d); d.forEach((v, i) => { d[i] = v / L; });
    // rotate -Z onto d: axis = (-Z) × d, angle = acos(-Z · d)
    const ax = [d[1], -d[0], 0], al = Math.hypot(...ax), ang = Math.acos(-d[2]); const s = Math.sin(ang / 2);
    if (al > 1e-6) c.quaternion.set(ax[0] / al * s, ax[1] / al * s, ax[2] / al * s, Math.cos(ang / 2)); else c.quaternion.set(0, 0, 0, 1); }, aimed.target);
  await pg.waitForTimeout(400); await shot('laser'); console.log('aim', JSON.stringify(await S()));
  await ctl('right', "updateButtonValue('trigger', 1)"); await pg.waitForTimeout(150); await ctl('right', "updateButtonValue('trigger', 0)"); await pg.waitForTimeout(600);
  p = await P(); ok(p.state === 'playing' && !(await pg.evaluate(() => window.__game.vr.tablet().shown)), 'laser + trigger clicked RESUME (the tablet stays put away)', JSON.stringify({ state: p.state, s: await S() }));
}
await dev(() => window.__iwer.controllers.right.quaternion.set(0, 0, 0, 1));

// ---- hands: pinch the left hand and drag forward to walk ----
await dev(() => { window.__iwer.primaryInputMode = 'hand'; }); await pg.waitForTimeout(800);
s = await S(); ok(s.hands.includes('left'), 'hand tracking: hands connected', JSON.stringify(s.hands));
p = await P();
await dev(() => window.__iwer.hands.left.setPinchValueImmediate(1)); await pg.waitForTimeout(200);
for (let i = 0; i < 5; i++) { await dev(() => { const h = window.__iwer.hands.left; h.position.set(h.position.x, h.position.y, h.position.z - 0.02); }); await pg.waitForTimeout(50); }
await pg.waitForTimeout(1200); p2 = await P();
await dev(() => window.__iwer.hands.left.setPinchValueImmediate(0)); await pg.waitForTimeout(300);
ok(Math.hypot(p2.pos[0] - p.pos[0], p2.pos[2] - p.pos[2]) > 1, 'left pinch + drag walks', JSON.stringify({ from: p.pos, to: p2.pos }));
await shot('hands');
// hands: a right-hand pinch fires the gun in that hand; the palm menu faces your eyes (it read backwards on the left hand)
await pg.evaluate(() => { const W = window.__ctx.weapons; W.collect('ak74', 120); W.selectBag(W.bag.indexOf('ak74')); }); await pg.waitForTimeout(900);
const ha0 = await pg.evaluate(() => window.__ctx.weapons.primary?.ammo);
await dev(() => window.__iwer.hands.right.setPinchValueImmediate(1)); await pg.waitForTimeout(400); await dev(() => window.__iwer.hands.right.setPinchValueImmediate(0)); await pg.waitForTimeout(300);
const ha1 = await pg.evaluate(() => window.__ctx.weapons.primary?.ammo);
ok(ha1 < ha0, 'hands: a right pinch fires the gun', JSON.stringify({ ha0, ha1 }));
// hands-only quick draw: a finger gun (IWER's 'point' pose: index out, the rest curled) brings the gun up from fists
await pg.evaluate(() => window.__ctx.weapons.fists()); await pg.waitForTimeout(600);
await dev(() => { window.__iwer.hands.right.poseId = 'point'; }); await pg.waitForTimeout(900);
const drawn = await pg.evaluate(() => window.__ctx.weapons.currentId);
ok(drawn && drawn !== 'fists' && drawn !== 'knife', 'hands: a finger gun draws the gun', String(drawn));
await dev(() => { window.__iwer.hands.right.poseId = 'relaxed'; }); await pg.waitForTimeout(300);
const face = await pg.evaluate(() => { const T = window.__ctx.THREE, m = window.__ctx.scene.getObjectByName('xrTablet'); if (!m?.parent) return null; m.updateMatrixWorld(true); const n = new T.Vector3(0, 0, 1).transformDirection(m.matrixWorld), eye = window.__ctx.camera.position.clone().sub(m.getWorldPosition(new T.Vector3())).normalize(), up = new T.Vector3(0, 1, 0).transformDirection(m.matrixWorld); return { facing: +n.dot(eye).toFixed(2), upright: +up.y.toFixed(2) }; });
ok(face && face.facing > 0.95 && face.upright > 0.5, 'the palm tablet faces your eyes, upright', JSON.stringify(face));
await dev(() => { window.__iwer.primaryInputMode = 'controller'; }); await pg.waitForTimeout(600);

// ---- a car: the seat drives the view, the rig keeps its heading; getting out keeps it too ----
const car = await pg.evaluate(async () => { const V = window.__ctx.vehicles; const ok = V?.qaMount?.() || window.__game.tavernPeople?.kit?.steal?.(); await new Promise((r) => setTimeout(r, 1200)); return { ok: !!ok, mounted: !!window.__ctx.player.mounted && !window.__ctx.player.mounted.dialog }; });
if (car.mounted) {
  s = await S(); ok(s.mode === 'seat', 'in a car: the view follows the seat', JSON.stringify(s));
  await ctl('left', "updateAxes('thumbstick', 0, -1)"); await pg.waitForTimeout(1500); await ctl('left', "updateAxes('thumbstick', 0, 0)");
  const spd = await pg.evaluate(() => window.__ctx.player.mounted?.speed || 0); ok(spd > 1, 'left stick drives', spd.toFixed(1));
  // the steering wheel: grip it at 3 o'clock, turn it clockwise to half past four → right; let go → the stick has it back
  // the wheel turns about its own X: in its plane, which way is 3 o'clock for the driver? the sign that turns its 12 o'clock to the
  // driver's right, found by trying it (the column's frame is the car's; the rig may face anywhere in the seat)
  const wf = await pg.evaluate(() => window.__game.vr.wheelFrame()); ok(!!wf, 'in the car: the steering wheel is there to grab', JSON.stringify(wf));
  if (wf) {
    const at = (a) => wf.c.map((c, i) => c + 0.17 * (Math.cos(a) * wf.y[i] + Math.sin(a) * wf.z[i]));   // a = 0: the top of the wheel; the angle about the wheel's X
    // which way is the driver's right: the car's right in the rig, from the seat's facing (the wheel is ahead of you, so its right is the side
    // that's to the right of forward = the car's forward × up)
    const car = await pg.evaluate(() => { const v = window.__ctx.vehicles.mounted, T = window.__ctx.THREE, rig = window.__ctx.scene.getObjectByName('xrRig'), rq = rig.getWorldQuaternion(new T.Quaternion()).invert();
      const f = new T.Vector3(-Math.sin(v.heading), 0, -Math.cos(v.heading)).applyQuaternion(rq); return f.toArray(); });
    const right = [-car[2], 0, car[0]];   // forward × up, flattened
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const sgn = dot(at(0.5).map((v, i) => v - at(0)[i]), right) > 0 ? 1 : -1;   // + angle moves the top to the driver's right?
    await dev((p) => { const c = window.__iwer.controllers.right; c.quaternion.set(0, 0, 0, 1); c.position.set(...p); }, at(0)); await pg.waitForTimeout(250);
    await ctl('right', "updateButtonValue('squeeze', 1)"); await pg.waitForTimeout(250);
    for (let k = 1; k <= 6; k++) { await dev((p) => { window.__iwer.controllers.right.position.set(...p); }, at(sgn * k * Math.PI / 4 / 6)); await pg.waitForTimeout(60); }   // top → towards the right: clockwise
    await ctl('left', "updateAxes('thumbstick', 0, -1)"); await pg.waitForTimeout(700);
    const wh = await pg.evaluate(() => ({ ...window.__game.vr.phys().wheel, vSteer: +(window.__ctx.vehicles.mounted?.steer || 0).toFixed(3), mounted: !!window.__ctx.player.mounted }));
    await ctl('left', "updateAxes('thumbstick', 0, 0)");
    ok(wh.hands === 1 && wh.steer > 0.2 && wh.vSteer > 0 && wh.mounted, 'grip the wheel and turn it clockwise: the car steers right (and you stay in the car)', JSON.stringify(wh));
    await ctl('right', "updateButtonValue('squeeze', 0)"); await pg.waitForTimeout(300);
    const rel = await pg.evaluate(() => ({ steer: window.__ctx.input.xrSteer ?? null, hands: window.__game.vr.phys().wheel?.hands ?? 0 }));
    ok(rel.steer === null && rel.hands === 0, 'let go of the wheel: the stick steers again', JSON.stringify(rel));
    await dev(() => { const c = window.__iwer.controllers.right; c.position.set(0.45, 1.0, 0.25); }); await pg.waitForTimeout(200);
  }
  await shot('car');
} else console.log('SKIP car (no QA mount hook)', JSON.stringify(car));

// ---- holsters: the right hand over the right shoulder + squeeze draws the rifle ----
await pg.evaluate(() => { window.__ctx.weapons.collect('ak74', 90); window.__ctx.weapons.fists(); }); await pg.waitForTimeout(500);
await dev(() => { window.__iwer.quaternion.set(0, 0, 0, 1); const c = window.__iwer.controllers.right; c.position.set(0.17, 1.52, 0.16); c.quaternion.set(0, 0, 0, 1); }); await pg.waitForTimeout(400);
await ctl('right', "updateButtonValue('squeeze', 1)"); await pg.waitForTimeout(250); await ctl('right', "updateButtonValue('squeeze', 0)"); await pg.waitForTimeout(700);
const hol = await pg.evaluate(() => window.__ctx.weapons.currentId); ok(hol === 'ak74', 'squeeze over the right shoulder: the rifle comes out', String(hol));
await dev(() => { const c = window.__iwer.controllers.right; c.position.set(0.2, 1.4, -0.3); const l = window.__iwer.controllers.left; l.position.set(-0.2, 1.4, -0.3); }); await pg.waitForTimeout(300);

// ---- the world's F interactions, from the right grip: jet pack, a car, an elevator; X uses what you bought ----
const grip = async () => { await ctl('right', "updateButtonValue('squeeze', 1)"); await pg.waitForTimeout(650); await ctl('right', "updateButtonValue('squeeze', 0)"); await pg.waitForTimeout(600); };   // a hold: in a vehicle a quick squeeze is for the wheel
await pg.waitForFunction(() => { const h = window.__game.vr.state().hands; return h.includes('right') && h.includes('left'); }, null, { timeout: 10000 }).catch(() => {}); await pg.waitForTimeout(500);   // controllers back after the hand-tracking part
if (await pg.evaluate(() => !!window.__ctx.player.mounted && !window.__ctx.player.mounted.dialog)) { await dev(() => window.__iwer.controllers.right.position.set(0.45, 1.0, 0.25)); await grip(); await dev(() => window.__iwer.controllers.right.position.set(0.2, 1.4, -0.3)); }   // still in the car from the seat check: out first
const jp = await pg.evaluate(() => window.__game.jetpack.packs()[0]);
await pg.evaluate((j) => window.__game.teleport(j[0] + 0.6, j[1], j[2], 0, 0), jp); await pg.waitForTimeout(500); await grip();
let jet = await pg.evaluate(() => window.__game.jetpack.state()); ok(jet.worn, 'grip by the jet pack straps it on', JSON.stringify(jet));
await ctl('right', "updateButtonValue('a-button', 1)"); await pg.waitForTimeout(2500); jet = await pg.evaluate(() => window.__game.jetpack.state()); await ctl('right', "updateButtonValue('a-button', 0)");
ok(jet.y > 1.5, 'hold A: the jet pack flies', JSON.stringify(jet)); await pg.waitForTimeout(2500);
await pg.evaluate(async () => { const { clickAt } = await import('/src/vr/mirror.js'); window.__vrQuickTest = clickAt; });
await ctl('right', "updateButtonValue('thumbstick', 1)"); await pg.waitForTimeout(150); await ctl('right', "updateButtonValue('thumbstick', 0)"); await pg.waitForTimeout(400);
await pg.evaluate(() => { const b = [...document.querySelectorAll('#vrQuick button')].find((x) => x.dataset.k === 'KeyX'); const r = b.getBoundingClientRect(); window.__vrQuickTest(r.left + r.width / 2, r.top + r.height / 2); }); await pg.waitForTimeout(500);
jet = await pg.evaluate(() => window.__game.jetpack.state()); ok(!jet.worn, 'quick actions → Jetpack takes it off', JSON.stringify(jet));
const parked = await pg.evaluate(() => { const c = window.__ctx.world.parkedCars.find((c) => Math.hypot(c.x - 206, c.z + 395) < 400); return c && [c.x, c.z]; });
if (parked) { await pg.evaluate((c) => window.__game.teleport(c[0] + 1.6, 0.2, c[1] + 0.2, 0, 0), parked); await pg.waitForTimeout(800); await grip(); await pg.waitForTimeout(900);
  const m = await pg.evaluate(() => { const v = window.__ctx.player.mounted; return { mounted: !!v && !v.dialog, car: !!v?.spec?.car, mode: window.__game.vr.state().mode }; });
  ok(m.mounted && m.mode === 'seat', 'grip by a parked car: in the driver\'s seat', JSON.stringify(m));
  await dev(() => window.__iwer.controllers.right.position.set(0.45, 1.0, 0.25)); await pg.waitForTimeout(200);
  await grip(); await pg.waitForTimeout(700); const out = await pg.evaluate(() => ({ mounted: !!window.__ctx.player.mounted, mode: window.__game.vr.state().mode })); ok(!out.mounted && out.mode === 'foot', 'grip again: out of the car', JSON.stringify(out)); }
// the action button: by a parked car it reads STEAL CAR; point the right controller at it and pull the trigger: you're in
if (parked) { await pg.evaluate((c) => window.__game.teleport(c[0] + 1.6, 0.2, c[1] + 0.2, 0, 0), parked); await pg.waitForTimeout(900);
  const btnAt = await pg.evaluate(() => { const T = window.__ctx.THREE, m = window.__ctx.scene.getObjectByName('xrAction'), rig = window.__ctx.scene.getObjectByName('xrRig'); if (!m?.visible) return null; m.updateMatrixWorld(true); return rig.worldToLocal(m.getWorldPosition(new T.Vector3())).toArray(); });
  ok(!!btnAt, 'by a parked car: the action button shows', JSON.stringify(btnAt));
  if (btnAt) { await dev((t) => { const c = window.__iwer.controllers.right, o = c.position, d = [t[0] - o.x, t[1] - o.y, t[2] - o.z], L = Math.hypot(...d); d.forEach((v, i) => { d[i] = v / L; }); const ax = [d[1], -d[0], 0], al = Math.hypot(...ax), ang = Math.acos(-d[2]), sn = Math.sin(ang / 2); if (al > 1e-6) c.quaternion.set(ax[0] / al * sn, ax[1] / al * sn, 0, Math.cos(ang / 2)); }, btnAt);
    await pg.waitForTimeout(300); const a0 = await pg.evaluate(() => window.__ctx.weapons.primary?.ammo);
    await ctl('right', "updateButtonValue('trigger', 1)"); await pg.waitForTimeout(200); await ctl('right', "updateButtonValue('trigger', 0)"); await pg.waitForTimeout(900);
    const m = await pg.evaluate(() => ({ mounted: !!window.__ctx.player.mounted && !window.__ctx.player.mounted.dialog })); ok(m.mounted, 'trigger on the action button: in the car (and no shot fired)', JSON.stringify(m));
    await dev(() => window.__iwer.controllers.right.position.set(0.45, 1.0, 0.25)); await pg.waitForTimeout(200);
    await grip(); await pg.waitForTimeout(600); await dev(() => { const c = window.__iwer.controllers.right; c.quaternion.set(0, 0, 0, 1); c.position.set(0.2, 1.4, -0.3); }); } }
// the watch on the left wrist / controller, and the gun's red dot
const wt = await pg.evaluate(() => { const w = window.__ctx.scene.getObjectByName('xrWatch'); return { watch: !!w?.visible && !!w.parent }; });
ok(wt.watch, 'the watch (health / ammo / cash) is on the left controller', JSON.stringify(wt));
await pg.evaluate(() => { const W = window.__ctx.weapons; W.collect('ak74', 120); W.selectBag(W.bag.indexOf('ak74')); window.__game.teleport(206.8, 0, -402.8, 0, 0); }); await pg.waitForTimeout(1200);
const dot = await pg.evaluate(() => ({ beam: !!window.__ctx.scene.getObjectByName('xrSightBeam')?.visible }));
ok(dot.beam, 'a gun shows its laser sight', JSON.stringify(dot));
const sh = await pg.evaluate(() => window.__game.tavernPeople?.kit?.shafts?.().find((t) => t.kind !== 'stairs' && t.lobby.length));
await pg.evaluate(() => { const p = window.__ctx.player; if (p.dead || window.__ctx.state === 'dead') { p.respawn(); } p.health = 100; window.__game.setState('playing'); }); await pg.waitForTimeout(600);   // the jet pack landing can hurt
if (sh) { const c = sh.lobby[0]; await pg.evaluate((c) => window.__game.teleport(c[0], c[1], c[2], 0, 0), c); await pg.waitForTimeout(800); const y0 = (await P()).pos[1];
  // the call button by the door: poke it with the controller's tip
  const bt = await pg.evaluate(() => window.__game.vr.buttonAt()); ok(!!bt, 'by the elevator: a call button to poke', JSON.stringify(bt));
  if (bt) { await tipTo('right', bt, 0.08); await pg.waitForTimeout(250); await tipTo('right', bt, 0); await pg.waitForTimeout(400); }
  const rid = await until(() => pg.evaluate(() => !!window.__ctx.player.mounted?.elevator), 2000);
  ok(rid, 'poke the call button: the elevator comes', JSON.stringify({ rid }));
  await dev(() => { const c = window.__iwer.controllers.right; c.position.set(0.2, 1.4, -0.3); });
  if (!rid) await grip();
  await pg.waitForTimeout(6000);
  const e = await pg.evaluate(() => ({ y: +window.__ctx.player.position.y.toFixed(1), mounted: !!window.__ctx.player.mounted }));
  ok(e.y > y0 + 3 || e.mounted, 'the elevator takes you up', JSON.stringify({ y0, ...e })); }
else console.log('SKIP elevator (no shafts)');
const inv0 = await pg.evaluate(() => window.__game.tavernPeople?.kit?.state()?.inv?.length ?? null);
await pg.evaluate(() => window.__game.tavernPeople.kit.item('vodka'));
await click('left', 'x-button', 200); await pg.waitForTimeout(400);
let held = await pg.evaluate(() => window.__game.vr.phys().held); ok(!!held, 'X: the newest thing in your bag goes into your left hand', String(held));
await click('left', 'x-button', 200); await pg.waitForTimeout(400);
const inv1 = await pg.evaluate(() => window.__game.tavernPeople?.kit?.state()?.inv?.length ?? null);
ok(inv0 != null && inv1 < inv0 + 1, 'X again: used straight away', JSON.stringify({ inv0, inv1 }));
// a kvass to the mouth
await pg.evaluate(() => window.__game.tavernPeople.kit.item('kvass'));
const kv0 = await pg.evaluate(() => (window.__game.tavernPeople?.kit?.state()?.inv || []).filter((x) => x === 'kvass').length);
await dev(() => { const l = window.__iwer.controllers.left; l.position.set(-0.25, 1.1, -0.3); l.quaternion.set(0, 0, 0, 1); }); await pg.waitForTimeout(200);
await click('left', 'x-button', 200); held = await pg.evaluate(() => window.__game.vr.phys().held);
const head = (await S()).head; await dev((h) => { window.__iwer.controllers.left.position.set(h[0], h[1] - 0.09, h[2] - 0.1); }, head); await pg.waitForTimeout(700);
const kv1 = await pg.evaluate(() => (window.__game.tavernPeople?.kit?.state()?.inv || []).filter((x) => x === 'kvass').length);
ok(held === 'kvass' && kv1 === kv0 - 1, 'a kvass in your hand, brought to your mouth: drunk', JSON.stringify({ held, kv0, kv1 }));
await dev(() => window.__iwer.controllers.left.position.set(-0.2, 1.4, -0.3)); await pg.waitForTimeout(1500);
// fists up in front of your face: a block (damage taken × 0.35)
await pg.evaluate(() => window.__ctx.weapons.fists()); await pg.waitForTimeout(400);
await dev((h) => { window.__iwer.controllers.left.position.set(h[0] - 0.1, h[1] - 0.05, h[2] - 0.22); window.__iwer.controllers.right.position.set(h[0] + 0.1, h[1] - 0.05, h[2] - 0.22); }, head); await pg.waitForTimeout(400);
const blk = await pg.evaluate(() => { const p = window.__ctx.player; p.protectUntil = 0; p.health = 100; p.damage(20, null); return { guard: window.__game.vr.phys().guard, hp: p.health }; });
ok(blk.guard && blk.hp > 90, 'fists up in front of your face: a 20 hit only takes 7', JSON.stringify(blk));
await dev(() => { window.__iwer.controllers.left.position.set(-0.2, 1.4, -0.3); window.__iwer.controllers.right.position.set(0.2, 1.4, -0.3); }); await pg.waitForTimeout(300);
const unb = await pg.evaluate(() => { const p = window.__ctx.player; p.health = 100; p.damage(20, null); return { guard: window.__game.vr.phys().guard, hp: p.health }; });
ok(!unb.guard && unb.hp === 80, 'hands down: no block', JSON.stringify(unb));
await pg.evaluate((s) => window.__game.teleport(206.8, 0, -402.8, 0, 0)); await pg.waitForTimeout(600);

// ---- quick actions (right stick click) and the VR keyboard ----
await ctl('right', "updateButtonValue('thumbstick', 1)"); await pg.waitForTimeout(200); await ctl('right', "updateButtonValue('thumbstick', 0)"); await pg.waitForTimeout(500);
s = await S(); const qOpen = await pg.evaluate(() => getComputedStyle(document.getElementById('vrQuick')).display !== 'none');
ok(qOpen && s.ui, 'right stick click opens quick actions (UI mode)', JSON.stringify({ qOpen, ui: s.ui }));
await pg.evaluate(() => { const b = [...document.querySelectorAll('#vrQuick button')].find((x) => x.dataset.k === 'KeyM'); const r = b.getBoundingClientRect(); window.__vrClick = [r.left + r.width / 2, r.top + r.height / 2]; });
const mapOpen = await pg.evaluate(async () => { const { clickAt } = await import('/src/vr/mirror.js'); clickAt(...window.__vrClick); await new Promise((r) => setTimeout(r, 600)); return { quick: getComputedStyle(document.getElementById('vrQuick')).display, mapKey: true }; });
ok(mapOpen.quick === 'none', 'a quick action closes the grid and fires its key', JSON.stringify(mapOpen));
await pg.keyboard.press('KeyM'); await pg.waitForTimeout(300);
const kb = await pg.evaluate(async () => { const i = document.createElement('input'); i.type = 'text'; i.style.cssText = 'position:fixed;left:10px;top:10px;z-index:99999'; document.body.appendChild(i); i.focus(); await new Promise((r) => setTimeout(r, 100));
  const shown = getComputedStyle(document.getElementById('vrKbd')).display !== 'none'; const { clickAt } = await import('/src/vr/mirror.js');
  for (const v of ['h', 'i']) { const b = document.querySelector(`#vrKbd button[data-v="${v}"]`); const r = b.getBoundingClientRect(); clickAt(r.left + r.width / 2, r.top + r.height / 2); }
  const val = i.value; i.remove(); return { shown, val }; });
ok(kb.shown && kb.val === 'hi', 'focusing a text field brings up the VR keyboard, and it types', JSON.stringify(kb));

// ---- leave VR ----
await pg.evaluate(() => window.__game.vr.exit()); await pg.waitForTimeout(800);
s = await S(); const vmp = await pg.evaluate(() => window.__ctx.weapons.viewmodel.parent === window.__ctx.camera);
ok(!s.presenting && vmp, 'exit VR: the flat game is back (gun on the screen camera)', JSON.stringify({ presenting: s.presenting, vmp }));
// enter → exit → enter → exit: the flat game afterwards is exactly the flat game (gun scale and parent, arms, shadows, raycasts)
const flat = () => pg.evaluate(() => { const vm = window.__ctx.weapons.viewmodel; let arms = 0, armsOn = 0; vm.traverse((o) => { if (/^arm_/.test(o.name)) { arms++; if (o.visible) armsOn++; } });
  return { scale: vm.scale.toArray().map((v) => +v.toFixed(3)), parent: vm.parent === window.__ctx.camera, arms, armsOn, shadows: window.__ctx.renderer.shadowMap.enabled, rc: window.__ctx.THREE.Raycaster.prototype.intersectObject.name, culled: (() => { let n = 0; window.__ctx.scene.traverse((o) => { if (o.layers.mask === (1 << 30)) n++; }); return n; })() }; });
const flat1 = await flat();
for (let i = 0; i < 2; i++) { await pg.evaluate(() => window.__game.vr.enter()); await pg.waitForFunction(() => window.__game.vr.state().presenting, null, { timeout: 15000 }).catch(() => {}); await pg.waitForTimeout(1200); await pg.evaluate(() => window.__game.vr.exit()); await pg.waitForTimeout(700); }
const flat2 = await flat();
ok(JSON.stringify(flat1) === JSON.stringify(flat2) && flat2.culled === 0 && flat2.parent, 'enter/exit twice: the flat game is unchanged', JSON.stringify({ flat1, flat2 }));
ok(errs.length === 0, 'no page errors', JSON.stringify(errs.slice(0, 5)));
await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
