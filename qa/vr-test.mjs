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

// ---- Y: the pause menu on the panel; the laser clicks RESUME ----
await ctl('left', "updateButtonValue('y-button', 1)"); await pg.waitForTimeout(200); await ctl('left', "updateButtonValue('y-button', 0)"); await pg.waitForTimeout(800);
p = await P(); s = await S(); ok(p.state === 'paused' && s.ui && s.panel, 'Y: paused, the menu panel is up', JSON.stringify({ state: p.state, ui: s.ui, panel: s.panel }));
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
  p = await P(); ok(p.state === 'playing', 'laser + trigger clicked RESUME', JSON.stringify({ state: p.state, s: await S() }));
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
const face = await pg.evaluate(() => { const T = window.__ctx.THREE, m = window.__ctx.scene.getObjectByName('xrWrist'); if (!m?.parent) return null; m.updateMatrixWorld(true); const n = new T.Vector3(0, 0, 1).transformDirection(m.matrixWorld), eye = window.__ctx.camera.position.clone().sub(m.getWorldPosition(new T.Vector3())).normalize(), up = new T.Vector3(0, 1, 0).transformDirection(m.matrixWorld); return { facing: +n.dot(eye).toFixed(2), upright: +up.y.toFixed(2) }; });
ok(face && face.facing > 0.95 && face.upright > 0.5, 'the palm menu faces your eyes, upright', JSON.stringify(face));
await dev(() => { window.__iwer.primaryInputMode = 'controller'; }); await pg.waitForTimeout(600);

// ---- a car: the seat drives the view, the rig keeps its heading; getting out keeps it too ----
const car = await pg.evaluate(async () => { const V = window.__ctx.vehicles; const ok = V?.qaMount?.() || window.__game.tavernPeople?.kit?.steal?.(); await new Promise((r) => setTimeout(r, 1200)); return { ok: !!ok, mounted: !!window.__ctx.player.mounted && !window.__ctx.player.mounted.dialog }; });
if (car.mounted) {
  s = await S(); ok(s.mode === 'seat', 'in a car: the view follows the seat', JSON.stringify(s));
  await ctl('left', "updateAxes('thumbstick', 0, -1)"); await pg.waitForTimeout(1500); await ctl('left', "updateAxes('thumbstick', 0, 0)");
  const spd = await pg.evaluate(() => window.__ctx.player.mounted?.speed || 0); ok(spd > 1, 'left stick drives', spd.toFixed(1));
  await shot('car');
} else console.log('SKIP car (no QA mount hook)', JSON.stringify(car));

// ---- the world's F interactions, from the right grip: jet pack, a car, an elevator; X uses what you bought ----
const grip = async () => { await ctl('right', "updateButtonValue('squeeze', 1)"); await pg.waitForTimeout(200); await ctl('right', "updateButtonValue('squeeze', 0)"); await pg.waitForTimeout(600); };
await pg.waitForFunction(() => { const h = window.__game.vr.state().hands; return h.includes('right') && h.includes('left'); }, null, { timeout: 10000 }).catch(() => {}); await pg.waitForTimeout(500);   // controllers back after the hand-tracking part
if (await pg.evaluate(() => !!window.__ctx.player.mounted && !window.__ctx.player.mounted.dialog)) await grip();   // still in the car from the seat check: out first
const jp = await pg.evaluate(() => window.__game.jetpack.packs()[0]);
await pg.evaluate((j) => window.__game.teleport(j[0] + 0.6, j[1], j[2], 0, 0), jp); await pg.waitForTimeout(500); await grip();
let jet = await pg.evaluate(() => window.__game.jetpack.state()); ok(jet.worn, 'grip by the jet pack straps it on', JSON.stringify(jet));
await ctl('right', "updateButtonValue('a-button', 1)"); await pg.waitForTimeout(1500); jet = await pg.evaluate(() => window.__game.jetpack.state()); await ctl('right', "updateButtonValue('a-button', 0)");
ok(jet.y > 1.5, 'hold A: the jet pack flies', JSON.stringify(jet)); await pg.waitForTimeout(2500);
await pg.evaluate(async () => { const { clickAt } = await import('/src/vr/mirror.js'); window.__vrQuickTest = clickAt; });
await ctl('right', "updateButtonValue('thumbstick', 1)"); await pg.waitForTimeout(150); await ctl('right', "updateButtonValue('thumbstick', 0)"); await pg.waitForTimeout(400);
await pg.evaluate(() => { const b = [...document.querySelectorAll('#vrQuick button')].find((x) => x.dataset.k === 'KeyX'); const r = b.getBoundingClientRect(); window.__vrQuickTest(r.left + r.width / 2, r.top + r.height / 2); }); await pg.waitForTimeout(500);
jet = await pg.evaluate(() => window.__game.jetpack.state()); ok(!jet.worn, 'quick actions → Jetpack takes it off', JSON.stringify(jet));
const parked = await pg.evaluate(() => { const c = window.__ctx.world.parkedCars.find((c) => Math.hypot(c.x - 206, c.z + 395) < 400); return c && [c.x, c.z]; });
if (parked) { await pg.evaluate((c) => window.__game.teleport(c[0] + 1.6, 0.2, c[1] + 0.2, 0, 0), parked); await pg.waitForTimeout(800); await grip(); await pg.waitForTimeout(900);
  const m = await pg.evaluate(() => { const v = window.__ctx.player.mounted; return { mounted: !!v && !v.dialog, car: !!v?.spec?.car, mode: window.__game.vr.state().mode }; });
  ok(m.mounted && m.mode === 'seat', 'grip by a parked car: in the driver\'s seat', JSON.stringify(m));
  await grip(); await pg.waitForTimeout(700); const out = await pg.evaluate(() => ({ mounted: !!window.__ctx.player.mounted, mode: window.__game.vr.state().mode })); ok(!out.mounted && out.mode === 'foot', 'grip again: out of the car', JSON.stringify(out)); }
// the action button: by a parked car it reads STEAL CAR; point the right controller at it and pull the trigger: you're in
if (parked) { await pg.evaluate((c) => window.__game.teleport(c[0] + 1.6, 0.2, c[1] + 0.2, 0, 0), parked); await pg.waitForTimeout(900);
  const btnAt = await pg.evaluate(() => { const T = window.__ctx.THREE, m = window.__ctx.scene.getObjectByName('xrAction'), rig = window.__ctx.scene.getObjectByName('xrRig'); if (!m?.visible) return null; m.updateMatrixWorld(true); return rig.worldToLocal(m.getWorldPosition(new T.Vector3())).toArray(); });
  ok(!!btnAt, 'by a parked car: the action button shows', JSON.stringify(btnAt));
  if (btnAt) { await dev((t) => { const c = window.__iwer.controllers.right, o = c.position, d = [t[0] - o.x, t[1] - o.y, t[2] - o.z], L = Math.hypot(...d); d.forEach((v, i) => { d[i] = v / L; }); const ax = [d[1], -d[0], 0], al = Math.hypot(...ax), ang = Math.acos(-d[2]), sn = Math.sin(ang / 2); if (al > 1e-6) c.quaternion.set(ax[0] / al * sn, ax[1] / al * sn, 0, Math.cos(ang / 2)); }, btnAt);
    await pg.waitForTimeout(300); const a0 = await pg.evaluate(() => window.__ctx.weapons.primary?.ammo);
    await ctl('right', "updateButtonValue('trigger', 1)"); await pg.waitForTimeout(200); await ctl('right', "updateButtonValue('trigger', 0)"); await pg.waitForTimeout(900);
    const m = await pg.evaluate(() => ({ mounted: !!window.__ctx.player.mounted && !window.__ctx.player.mounted.dialog })); ok(m.mounted, 'trigger on the action button: in the car (and no shot fired)', JSON.stringify(m));
    await grip(); await pg.waitForTimeout(600); await dev(() => window.__iwer.controllers.right.quaternion.set(0, 0, 0, 1)); } }
// the watch on the left wrist / controller, and the gun's red dot
const wt = await pg.evaluate(() => { const w = window.__ctx.scene.getObjectByName('xrWatch'); return { watch: !!w?.visible && !!w.parent }; });
ok(wt.watch, 'the watch (health / ammo / cash) is on the left controller', JSON.stringify(wt));
await pg.evaluate(() => { const W = window.__ctx.weapons; W.collect('ak74', 120); W.selectBag(W.bag.indexOf('ak74')); window.__game.teleport(206.8, 0, -402.8, 0, 0); }); await pg.waitForTimeout(1200);
const dot = await pg.evaluate(() => ({ beam: !!window.__ctx.scene.getObjectByName('xrSightBeam')?.visible }));
ok(dot.beam, 'a gun shows its laser sight', JSON.stringify(dot));
const sh = await pg.evaluate(() => window.__game.tavernPeople?.kit?.shafts?.().find((t) => t.kind !== 'stairs' && t.lobby.length));
if (sh) { const c = sh.lobby[0]; await pg.evaluate((c) => window.__game.teleport(c[0], c[1], c[2], 0, 0), c); await pg.waitForTimeout(600); const y0 = (await P()).pos[1]; await grip(); await pg.waitForTimeout(6000);
  const e = await pg.evaluate(() => ({ y: +window.__ctx.player.position.y.toFixed(1), mounted: !!window.__ctx.player.mounted }));
  ok(e.y > y0 + 3 || e.mounted, 'grip at the elevator: it takes you up', JSON.stringify({ y0, ...e })); }
else console.log('SKIP elevator (no shafts)');
const inv0 = await pg.evaluate(() => window.__game.tavernPeople?.kit?.state()?.inv?.length ?? null);
await pg.evaluate(() => window.__game.tavernPeople?.kit?.give?.(50)); await pg.evaluate(() => window.__ctx.hangkit?.give?.('tsingtao') ?? window.__game.hangkit?.give?.('tsingtao'));
await ctl('left', "updateButtonValue('x-button', 1)"); await pg.waitForTimeout(200); await ctl('left', "updateButtonValue('x-button', 0)"); await pg.waitForTimeout(800);
const inv1 = await pg.evaluate(() => window.__game.tavernPeople?.kit?.state()?.inv?.length ?? null);
ok(inv0 != null && inv1 < inv0 + 1, 'X uses the last thing you bought (a tool / drink / smoke)', JSON.stringify({ inv0, inv1 }));
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
