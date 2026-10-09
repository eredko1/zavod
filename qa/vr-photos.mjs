// Photos of ZAVOD in VR for sharing: node qa/vr-photos.mjs [outdir]. The emulated Quest 3 (IWER), 1920×1080, the walk-through
// skipped, staged poses: the boardwalk, behind the wheel, darts at Soc Tav, the wrist tablet, a drink in hand, the jet pack, the
// train cab, a rifle in Washington Square Park. Writes vr-photo-<name>.jpg.
import pw from 'playwright-core';
import { readFileSync } from 'node:fs';
const { chromium } = pw;
const out = process.argv[2] || '/tmp', PORT = process.env.PORT || 8790;
const IWER = readFileSync(new URL('../node_modules/iwer/build/iwer.min.js', import.meta.url), 'utf8');
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
const shots = [];
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean), want = (n) => !ONLY.length || ONLY.includes(n);   // ONLY=boxing,drive … retakes

async function session(map, extra = '') {
  const pg = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  pg.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await pg.addInitScript(IWER + `\n;window.__iwer = new IWER.XRDevice(IWER.metaQuest3); window.__iwer.installRuntime({ forceInstall: true });
    try { localStorage.setItem('zavod.helpSeen', '1'); const v = JSON.parse(localStorage.getItem('zavod.vr') || '{}'); v.tut = true; localStorage.setItem('zavod.vr', JSON.stringify(v)); } catch {}`);
  await pg.goto(`http://localhost:${PORT}/?qa=1&map=${map}&vr=1&time=day${extra}`, { timeout: 240000 });
  await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  await pg.evaluate(() => { window.__game.setState('playing'); window.__game.freezeAI?.(true); window.__game.vr.enter(); });
  await pg.waitForFunction(() => window.__game.vr.state().presenting, null, { timeout: 15000 });
  await pg.waitForTimeout(2500);
  return pg;
}
const pose = (pg, o) => pg.evaluate((o) => {
  const W = window.__iwer, q = (y, p = 0) => { const cy = Math.cos(y / 2), sy = Math.sin(y / 2), cp = Math.cos(p / 2), sp = Math.sin(p / 2); return [cp * 0 + sp * cy * 0 + sp * cy, sy * cp, -sy * sp, cy * cp]; };
  if (o.head) { const [x, y, z, w] = q((o.head[0] || 0) + (o.turn || 0), o.head[1] || 0); W.quaternion.set(x, y, z, w); }
  const t = o.turn || 0, ct = Math.cos(t), st = Math.sin(t);   // turn: the whole pose (hands too) swung round to face that way
  for (const side of ['left', 'right']) { const c = o[side]; if (!c) continue; const C = W.controllers[side]; const [px, py, pz] = c.p; C.position.set(px * ct + pz * st, py, -px * st + pz * ct); const [x, y, z, w] = q((c.yaw || 0) + t, c.pitch || 0); C.quaternion.set(x, y, z, w); }
}, o);
const snap = async (pg, name, caption, wait = 900, keepTablet = false) => { if (!want(name.split('-')[0])) return;
  if (!keepTablet && await pg.evaluate(() => window.__game.vr.tablet().open)) { await pg.evaluate(() => window.__iwer.controllers.left.updateButtonValue('y-button', 1)); await pg.waitForTimeout(250); await pg.evaluate(() => window.__iwer.controllers.left.updateButtonValue('y-button', 0)); } await pg.waitForTimeout(wait); const f = `${out}/vr-photo-${name}.jpg`; await pg.screenshot({ path: f, type: 'jpeg', quality: 88 }); shots.push({ name, caption, f }); console.log('shot', name); };
const tp = (pg, x, y, z, yaw) => pg.evaluate(([x, y, z, yaw]) => window.__game.teleport(x, y, z, yaw, 0), [x, y, z, yaw]);

// ---- Coney Island ----
let pg = await session('coney', '&mode=chill');
await pg.evaluate(() => { const W = window.__ctx.weapons; W.fists(); });
// the boardwalk, looking down it with the Wonder Wheel side in view
const bw = await pg.evaluate(() => { const s = window.__ctx.world?.onlineStart; return s; });
if (bw) { await tp(pg, bw[0], bw[1], bw[2], bw[3]); await pose(pg, { head: [0, 0.05], left: { p: [-0.25, 1.15, -0.35] }, right: { p: [0.25, 1.15, -0.35] } }); await snap(pg, 'arrive', 'Coney Island, first thing you see', 1500); }
// the wrist tablet
await pose(pg, { head: [0.25, -0.35], left: { p: [-0.18, 1.32, -0.38], yaw: 0.3 }, right: { p: [0.2, 1.2, -0.3] } });
await pg.evaluate(() => window.__iwer.controllers.left.updateButtonValue('y-button', 1)); await pg.waitForTimeout(200); await pg.evaluate(() => window.__iwer.controllers.left.updateButtonValue('y-button', 0));
await snap(pg, 'tablet', 'The wrist tablet: bag, guns, live map, crew, settings', 900, true);
await pg.evaluate(() => { window.__iwer.controllers.left.updateButtonValue('y-button', 1); }); await pg.waitForTimeout(200); await pg.evaluate(() => window.__iwer.controllers.left.updateButtonValue('y-button', 0));
// the tablet away (whatever state the shots above left it in)
const tabletOff = async () => { if (await pg.evaluate(() => window.__game.vr.tablet().open)) { await pg.evaluate(() => window.__iwer.controllers.left.updateButtonValue('y-button', 1)); await pg.waitForTimeout(250); await pg.evaluate(() => window.__iwer.controllers.left.updateButtonValue('y-button', 0)); await pg.waitForTimeout(300); } };
await tabletOff();
// a drink in hand
await pg.evaluate(() => window.__game.tavernPeople?.kit?.item?.('guinness')); await pose(pg, { head: [0.1, -0.15], left: { p: [-0.12, 1.42, -0.32], yaw: 0.2 }, right: { p: [0.25, 1.1, -0.3] } });
await pg.evaluate(() => window.__iwer.controllers.left.updateButtonValue('x-button', 1)); await pg.waitForTimeout(200); await pg.evaluate(() => window.__iwer.controllers.left.updateButtonValue('x-button', 0));
await snap(pg, 'drink', 'A pint in your hand: bring it to your mouth to drink', 1200);
await pg.evaluate(() => window.__iwer.controllers.left.updateButtonValue('x-button', 1)); await pg.waitForTimeout(200); await pg.evaluate(() => window.__iwer.controllers.left.updateButtonValue('x-button', 0)); await pg.waitForTimeout(1800);   // drink it: empty hands for what's next
// behind the wheel of a parked car
const car = await pg.evaluate(() => { const c = window.__ctx.world.parkedCars.find((c) => !c.gone && Math.hypot(c.x - 206, c.z + 395) < 400); return c && [c.x, c.z]; });
if (car) {
  await tp(pg, car[0] + 1.6, 0.2, car[1] + 0.2, 0); await pg.waitForTimeout(800);
  await pg.evaluate(() => window.__game.tavernPeople?.kit?.steal?.() || window.__ctx.vehicles?.qaMount?.()); await pg.waitForTimeout(1500);
  const w = await pg.evaluate(() => window.__game.vr.wheelAt());
  // face the car's front (the rig keeps whatever heading you had when you got in), hands on the wheel
  const fy = await pg.evaluate(() => { const v = window.__ctx.vehicles.mounted, T = window.__ctx.THREE, rig = window.__ctx.scene.getObjectByName('xrRig'), rq = rig.getWorldQuaternion(new T.Quaternion()).invert();
    const f = new T.Vector3(-Math.sin(v.heading), 0, -Math.cos(v.heading)).applyQuaternion(rq); return Math.atan2(-f.x, -f.z); });
  if (w) { const r = [Math.cos(fy), -Math.sin(fy)]; await pose(pg, { head: [fy, -0.12], left: { p: [w[0] - 0.16 * r[0], w[1] + 0.02, w[2] - 0.16 * r[1]], yaw: fy }, right: { p: [w[0] + 0.16 * r[0], w[1] + 0.02, w[2] + 0.16 * r[1]], yaw: fy } }); }
  await pg.evaluate(() => window.__iwer.controllers.left.updateAxes('thumbstick', 0, -0.6)); await pg.waitForTimeout(2500); await pg.evaluate(() => window.__iwer.controllers.left.updateAxes('thumbstick', 0, 0));
  await snap(pg, 'drive', 'Hands on the wheel: grab it and turn it to steer', 600);
  await pg.evaluate(() => window.__ctx.vehicles?.dismount?.()); await pg.waitForTimeout(800);
}
// boxing: fists up in front of one of the Soc Tav regulars, then a right cross landing
await pg.evaluate(() => window.__ctx.weapons.fists()); await pg.waitForTimeout(400);
// the regular standing furthest from the others (no name tags in your face), squared up 2.6 m away: out of talking range
const mark = await pg.evaluate(() => { const c = window.__game.tavernPeople?.crew?.() || []; let best = null, bd = -1;
  for (const a of c) { const d = Math.min(...c.filter((x) => x !== a).map((x) => Math.hypot(x.pos[0] - a.pos[0], x.pos[2] - a.pos[2]))); if (d > bd) { bd = d; best = a; } } return best; });
if (mark && want('boxing')) {
  await tabletOff(); const [mx, my, mz] = mark.pos;
  // hands empty: whatever's still held gets used up first
  for (let k = 0; k < 2 && await pg.evaluate(() => !!window.__game.vr.phys().held); k++) { await pg.evaluate(() => window.__iwer.controllers.left.updateButtonValue('x-button', 1)); await pg.waitForTimeout(200); await pg.evaluate(() => window.__iwer.controllers.left.updateButtonValue('x-button', 0)); await pg.waitForTimeout(2000); }
  // stand 2.4 m off, on whichever side has room, facing them: the head turned so they're dead centre
  const st = await pg.evaluate(([x, y, z]) => { const P = window.__ctx.player; for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { const px = x + Math.sin(a) * 3.2, pz = z + Math.cos(a) * 3.2; window.__game.teleport(px, y, pz, a, 0); if (Math.hypot(P.position.x - px, P.position.z - pz) < 0.3) return { a }; } return { a: 0 }; }, [mx, my, mz]);
  await pg.waitForTimeout(1500);
  const look = await pg.evaluate(([x, z]) => { const T = window.__ctx.THREE, rig = window.__ctx.scene.getObjectByName('xrRig'), l = rig.worldToLocal(new T.Vector3(x, 1.5, z)); return Math.atan2(-l.x, -l.z); }, [mx, mz]);
  console.log('boxing vs', mark.name, JSON.stringify(st), look.toFixed(2));
  await pose(pg, { turn: look, head: [0, -0.08], left: { p: [-0.11, 1.42, -0.3], pitch: 0.6 }, right: { p: [0.12, 1.4, -0.27], pitch: 0.6 } });
  await snap(pg, 'boxing-guard', `Fists up: a real guard blocks most of a hit (${mark.name} isn't impressed)`, 1200);
  await pose(pg, { turn: look, head: [0, -0.08], left: { p: [-0.11, 1.42, -0.3], pitch: 0.6 }, right: { p: [0.12, 1.4, -0.27], pitch: 0.2 } }); await pg.waitForTimeout(200);
  for (let k = 1; k <= 4; k++) { await pose(pg, { turn: look, left: { p: [-0.11, 1.42, -0.3], pitch: 0.6 }, right: { p: [0.06, 1.47, -0.27 - k * 0.11], pitch: 0.05 } }); await pg.waitForTimeout(25); }
  await snap(pg, 'boxing-punch', 'A real right cross: the faster you throw it, the harder it lands', 120);
}
// darts at Soc Tav
await pg.evaluate(() => { const B = window.__game.tavern.boards[0]; window.__game.teleport(B.oche.x, B.oche.y, B.oche.z, B.yaw, 0); }); await pg.waitForTimeout(1500);
await pg.evaluate(() => { window.__game.darts.open(0); window.__game.darts.vsAI(); }); await pg.waitForTimeout(1000);
await pose(pg, { head: [0, 0.06], right: { p: [0.1, 1.5, -0.28], pitch: 0.12 }, left: { p: [-0.25, 1.1, -0.2] } });
await snap(pg, 'darts', 'Darts at Soc Tav: a real dart in your hand, throw it at the board', 1200);
await pg.evaluate(() => window.__game.teleport(206.8, 0, -402.8, 0, 0)); await pg.waitForTimeout(800);
// the jet pack over the beach
const jp = await pg.evaluate(() => window.__game.jetpack?.packs?.()[0]);
if (jp) { await tp(pg, jp[0] + 0.6, jp[1], jp[2], 0); await pg.waitForTimeout(600); await pose(pg, { right: { p: [0.6, 1.2, 0.2] } });
  await pg.evaluate(() => window.__iwer.controllers.right.updateButtonValue('squeeze', 1)); await pg.waitForTimeout(700); await pg.evaluate(() => window.__iwer.controllers.right.updateButtonValue('squeeze', 0));
  await pg.evaluate(() => window.__iwer.controllers.right.updateButtonValue('a-button', 1)); await pg.waitForTimeout(4500); await pg.evaluate(() => window.__iwer.controllers.right.updateButtonValue('a-button', 0));
  await pose(pg, { head: [0.6, -0.45], left: { p: [-0.25, 1.15, -0.35] }, right: { p: [0.25, 1.15, -0.35] } });
  await snap(pg, 'jetpack', 'Jet pack: up over Coney Island', 300); }
await pg.close();

// ---- Washington Square Park, a rifle ----
pg = await session('wsp');
await pose(pg, { head: [0.15, 0.02], right: { p: [0.14, 1.42, -0.32], pitch: 0.02 }, left: { p: [0.02, 1.38, -0.62] } });
await snap(pg, 'rifle', 'Washington Square Park, rifle up, laser sight on', 1500);
await pg.close();

// ---- the railyard at night ----
pg = await session('railyard');
await pose(pg, { head: [0.4, 0.05], right: { p: [0.16, 1.38, -0.3] }, left: { p: [-0.2, 1.2, -0.3] } });
await snap(pg, 'railyard', 'The railyard', 1500);
await pg.close();

await b.close();
console.log(JSON.stringify(shots));
