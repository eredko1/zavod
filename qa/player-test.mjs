#!/usr/bin/env node
// Headless player-controller test. Node 20. Usage: node qa/player-test.mjs [--url http://localhost:8790/?qa=1] [--shot qa/shots/player-sprint.png]
import { chromium } from '/Users/eugene/Code/node_modules/playwright-core/index.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : d; };
const URL = opt('url', 'http://localhost:8790/?qa=1&seed=7');
const SHOT = opt('shot', 'qa/shots/player-sprint.png');

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--mute-audio', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(String(e.message)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const log = () => ev(() => window.__ctx.player.qaLog());
const walk = (dir, s, o = {}) => ev(([d, s, o]) => window.__ctx.player.qaWalk(d, s, o), [dir, s, o]);
const settle = (ms = 400) => page.waitForTimeout(ms);

try {
  await page.goto(URL, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction('window.__game && window.__game.ready === true', null, { timeout: 90000 });
  await settle(800);

  // ---- test arena: find a clear 16x16 m patch inside world bounds, freeze AI, add stub colliders ----
  const arena = await ev(() => {
    const ctx = window.__ctx, T = ctx.THREE; ctx.ai && (ctx.ai.frozen = true);
    const b = ctx.world?.bounds ?? new T.Box3(new T.Vector3(-60, 0, -60), new T.Vector3(60, 20, 60));
    // pick the 19x19 m patch intersecting the fewest colliders; remove only those (rest of the world stays for broadphase realism)
    const hits = (cx, cz, r) => ctx.colliders.filter(c => c.max.x > cx - r && c.min.x < cx + r && c.max.z > cz - r && c.min.z < cz + r && c.max.y > (ctx.world?.groundHeight?.(cx, cz) ?? 0) + 0.01);
    let best = [0, 0], bestN = Infinity;
    outer: for (let z = b.min.z + 10; z <= b.max.z - 10; z += 2) for (let x = b.min.x + 10; x <= b.max.x - 10; x += 2) { const n = hits(x, z, 9.5).length; if (n < bestN) { bestN = n; best = [x, z]; if (!n) break outer; } }
    const [cx, cz] = best; const removed = hits(cx, cz, 9.5); for (const c of removed) ctx.colliders.splice(ctx.colliders.indexOf(c), 1);
    const gy = ctx.world?.groundHeight?.(cx, cz) ?? 0;
    const box = (x0, y0, z0, x1, y1, z1) => ctx.colliders.push(new T.Box3(new T.Vector3(cx + x0, gy + y0, cz + z0), new T.Vector3(cx + x1, gy + y1, cz + z1)));
    // player faces -z (yaw 0). Lanes at different x offsets so scenarios don't interfere.
    box(-3, 0, -7.5, 3, 3, -7);       // lane x=0: wall
    box(-8.5, 0, -3, -6.5, 0.35, 2);  // lane x=-7.5: step (curb) 0.35
    box(-6, 0, -3, -4.5, 1.2, 2);     // lane x=-5.25: mantle box 1.2
    box(-4.2, 0, -3, -3, 2.6, 2);     // lane x=-3.6: container-height 2.6 (unmantleable)
    box(4, 1.3, -3, 8, 2.0, 2);       // lane x=6: low ceiling (bottom 1.3)
    box(5, 0, 4, 8, 2.6, 8);          // lane x=6.5,z=6: roof to fall from
    ctx.player.rebuildColliders();
    return { cx, cz, gy, removed: removed.length, n: ctx.colliders.length, bounds: [b.min.x, b.min.z, b.max.x, b.max.z] };
  });
  console.log('arena', JSON.stringify(arena));
  const { cx, cz, gy } = arena;
  const tp = (x, y, z, yaw = 0) => ev(([x, y, z, yaw]) => window.__game.teleport(x, y, z, yaw, 0), [cx + x, gy + y, cz + z, yaw]);
  await ev(() => { window.__steps = 0; window.__ctx.bus.on('footstep', () => window.__steps++); window.__ctx.player.fallDamageEnabled = true; });

  // 1. wall: no penetration, then sliding
  await tp(0, 0, 0); await settle(300);
  await walk([0, 1], 2.0); let s = await log();
  const wallFront = cz - 7 + 0.35; // max.z + radius
  check('wall: no penetration', s.pos[2] >= wallFront - 0.01 && s.pos[2] < wallFront + 0.15, `z=${s.pos[2]} limit=${wallFront.toFixed(2)}`);
  const xBefore = s.pos[0];
  await walk([1, 1], 1.0); s = await log();
  check('wall: slides along', s.pos[0] - xBefore > 1.5 && s.pos[2] >= wallFront - 0.01, `dx=${(s.pos[0] - xBefore).toFixed(2)} z=${s.pos[2]}`);

  // 2. step-up onto 0.35 curb
  await tp(-7.5, 0, 4); await settle(300);
  await walk([0, 1], 1.2); s = await log();
  check('step-up 0.35 curb', Math.abs(s.pos[1] - (gy + 0.35)) < 0.02 && s.ground && s.pos[2] < cz + 2, `y=${s.pos[1]} z=${s.pos[2]} ground=${s.ground}`);
  // walk off the far side: step-down snap keeps you grounded
  await walk([0, 1], 1.4); s = await log();
  check('step-down off curb', Math.abs(s.pos[1] - gy) < 0.02 && s.ground, `y=${s.pos[1]} ground=${s.ground}`);

  // 3. 1.2 m box: jump fails without mantle, succeeds with it; 2.6 m box never
  await ev(() => { window.__ctx.player.mantleEnabled = false; });
  await tp(-5.25, 0, 4); await settle(300);
  await walk([0, 1], 1.4, { jumpAt: 0.5 }); s = await log();
  check('1.2 m box: no mantle -> stays down', s.pos[1] < gy + 0.3, `y=${s.pos[1]} z=${s.pos[2]}`);
  await ev(() => { window.__ctx.player.mantleEnabled = true; });
  await tp(-5.25, 0, 4); await settle(300);
  await walk([0, 1], 1.4, { jumpAt: 0.5 }); s = await log();
  check('1.2 m box: mantle -> on top', Math.abs(s.pos[1] - (gy + 1.2)) < 0.03 && s.ground, `y=${s.pos[1]} z=${s.pos[2]} ground=${s.ground}`);
  await tp(-3.6, 0, 4); await settle(300);
  await walk([0, 1], 2.2, { jumpAt: 0.6 }); s = await log();
  check('2.6 m box: cannot mantle', s.pos[1] < gy + 0.3, `y=${s.pos[1]}`);

  // 4. speeds + acceleration
  await tp(0, 0, 6, 0); await settle(300);
  await ev(() => window.__ctx.player.qaClearTrace());
  await walk([0, 1], 1.0); s = await log();
  check('walk speed 4.4', Math.abs(s.speed - 4.4) < 0.08, `speed=${s.speed}`);
  let tr = await ev(() => window.__ctx.player.qaTrace());
  const t0 = (tr.find(f => f.spd > 0.05) ?? tr[0]).t, t95 = tr.find(f => f.spd >= 4.4 * 0.95);
  check('accel ~0.1 s', t95 && t95.t - t0 <= 0.16, `t95=${t95 ? (t95.t - t0).toFixed(3) : 'n/a'}`);
  await ev(() => window.__ctx.player.qaClearTrace());
  await walk([0, 0], 0.5); tr = await ev(() => window.__ctx.player.qaTrace());
  const tStop = tr.find(f => f.spd <= 0.2), tS0 = (tr.find(f => f.spd < 4.3) ?? tr[0]).t; check('stop ~0.15 s', tStop && tStop.t - tS0 <= 0.22, `tStop=${tStop ? (tStop.t - tS0).toFixed(3) : 'n/a'}`);
  await tp(0, 0, 6, 0); await settle(300);
  await walk([1, 0], 0.8); s = await log(); check('strafe 0.9x', Math.abs(s.speed - 4.4 * 0.9) < 0.08, `speed=${s.speed}`);
  await tp(0, 0, 6, 0); await settle(300);
  await walk([0, -1], 0.8); s = await log(); check('backpedal 0.8x', Math.abs(s.speed - 4.4 * 0.8) < 0.08, `speed=${s.speed}`);
  await tp(0, 0, 6, 0); await settle(300);
  await walk([0, 1], 0.8, { crouch: true }); s = await log(); check('crouch speed 2.2 + height', Math.abs(s.speed - 2.2) < 0.08 && Math.abs(s.h - 1.15) < 0.01, `speed=${s.speed} h=${s.h}`);

  // sprint + bob + footsteps + screenshot
  await tp(8, 0, 8, Math.PI * 0.75); await settle(300);   // face into the map from the corner
  await ev(() => { window.__steps = 0; window.__ctx.player.qaClearTrace(); });
  const sprintP = walk([0, 1], 2.0, { sprint: true });
  await settle(900);
  s = await log();
  await page.screenshot({ path: SHOT });
  check('sprint speed 6.6', Math.abs(s.speed - 6.6) < 0.1 && s.sprint && s.sprintBlend > 0.9, `speed=${s.speed} sprint=${s.sprint} blend=${s.sprintBlend}`);
  check('sprint blocks fire (sprintOut)', s.sprintOut > 0, `sprintOut=${s.sprintOut}`);
  await sprintP;
  tr = await ev(() => window.__ctx.player.qaTrace());
  const by = tr.map(f => f.boby); let flips = 0; for (let i = 1; i < by.length; i++) if (Math.sign(by[i]) !== Math.sign(by[i - 1]) && by[i] !== 0) flips++;
  const amp = Math.max(...by.map(Math.abs));
  check('bob oscillates', flips >= 6 && amp > 0.015 && amp < 0.06, `flips=${flips} amp=${amp.toFixed(3)}`);
  const steps = await ev(() => window.__steps);
  check('footsteps emitted', steps >= 4 && steps <= 12, `steps=${steps} in 2 s`);
  await walk([0, 0], 0.35); s = await log();
  check('sprint-out timer counts down after sprint', !s.sprint && s.sprintOut === 0, `sprintOut=${s.sprintOut}`);

  // slide: sprint then crouch
  await tp(0, 0, 8, 0); await settle(300);
  await walk([{ dir: [0, 1], t: 0.7, opts: { sprint: true } }, { dir: [0, 1], t: 0.2, opts: { sprint: true, crouch: true } }]); s = await log();
  check('slide: sprint+crouch', s.slide && s.slideBlend > 0.5 && s.speed > 5, `slide=${s.slide} blend=${s.slideBlend} speed=${s.speed}`);
  await walk([0, 1], 0.7, { sprint: true, crouch: true }); s = await log();
  check('slide ends crouched', !s.slide && s.crouch && s.speed < 2.4, `slide=${s.slide} crouch=${s.crouch} speed=${s.speed}`);

  // jump height
  await tp(0, 0, 8, 0); await settle(300);
  await ev(() => window.__ctx.player.qaClearTrace());
  await walk([0, 0], 1.0, { jump: true }); tr = await ev(() => window.__ctx.player.qaTrace());
  const apex = Math.max(...tr.map(f => f.y)) - gy; s = await log();
  check('jump apex ~1.05 m', apex > 0.95 && apex < 1.15 && s.ground, `apex=${apex.toFixed(3)} ground=${s.ground}`);

  // 5. low ceiling: blocked standing, passes crouched, cannot stand under it
  await tp(6, 0, 4); await settle(300);
  await walk([0, 1], 1.5); s = await log();
  check('low ceiling blocks standing', s.pos[2] >= cz + 2 + 0.3 && !s.crouch, `z=${s.pos[2]} limit=${(cz + 2.35).toFixed(2)}`);
  await walk([0, 1], 1.4, { crouch: true }); s = await log();
  check('crouch passes under ceiling', s.crouch && s.pos[2] < cz + 1.5 && s.pos[2] > cz - 3, `z=${s.pos[2]} crouch=${s.crouch}`);
  await walk([0, 0], 0.3); s = await log();
  check('stays crouched under ceiling', s.crouch && s.h < 1.2, `crouch=${s.crouch} h=${s.h}`);
  await walk([0, 1], 1.6); s = await log();
  check('stands after leaving ceiling', !s.crouch && s.h > 1.65, `crouch=${s.crouch} h=${s.h} z=${s.pos[2]}`);

  // 6. fall off the roof: lands, land impulse, hard-landing damage, then regen
  await tp(6.5, 2.6, 6, 0); await settle(300); s = await log();
  check('stands on collider roof', Math.abs(s.pos[1] - (gy + 2.6)) < 0.02 && s.ground, `y=${s.pos[1]} ground=${s.ground}`);
  await ev(() => { window.__ctx.player.qaClearTrace(); window.__ctx.player.fallDamageEnabled = true; });
  await walk([0, 1], 1.6); s = await log(); tr = await ev(() => window.__ctx.player.qaTrace());
  const maxLand = Math.max(...tr.map(f => f.land)), airFrames = tr.filter(f => !f.g).length;
  check('falls off edge and lands', Math.abs(s.pos[1] - gy) < 0.02 && s.ground && airFrames > 10, `y=${s.pos[1]} airFrames=${airFrames}`);
  check('landing impulse', maxLand > 0.3, `landImpulse=${maxLand}`);
  check('hard landing (>9 m/s) damages', s.hp < 100 && s.hp > 80, `hp=${s.hp}`);
  const hpAfter = s.hp;
  await settle(Math.max(0, (3.6 - s.sinceDamage) * 1000)); s = await log(); check('no regen before 4 s', s.hp === hpAfter && s.sinceDamage < 4, `hp=${s.hp} sinceDamage=${s.sinceDamage}`);
  await settle(Math.max(0, (4.5 - s.sinceDamage) * 1000)); s = await log(); check('regen to full after 4 s + 30 hp/s', s.hp === 100, `hp=${s.hp} sinceDamage=${s.sinceDamage}`);

  // 7. damage/death/respawn
  const evs = await ev(async () => {
    const ctx = window.__ctx, got = []; const off = ['playerDamaged', 'playerDied', 'playerRespawn'].map(n => ctx.bus.on(n, () => got.push(n)));
    ctx.player.damage(30, new ctx.THREE.Vector3(0, 0, 0)); const hp1 = ctx.player.health;
    ctx.player.damage(500); const st = ctx.state; await new Promise(r => setTimeout(r, 1000));
    const camY = ctx.camera.position.y - ctx.player.position.y, roll = ctx.camera.rotation.z;
    ctx.player.damage(10); const ignored = ctx.player.health === 0;
    ctx.player.respawn(); const st2 = ctx.state, hp2 = ctx.player.health; off.forEach(f => f());
    return { hp1, st, camY, roll, ignored, st2, hp2, got };
  });
  check('damage + death + death cam', evs.hp1 === 70 && evs.st === 'dead' && evs.camY < 0.5 && Math.abs(evs.roll) > 0.4 && evs.ignored, JSON.stringify(evs));
  check('respawn restores', evs.st2 === 'playing' && evs.hp2 === 100 && evs.got.includes('playerDied') && evs.got.includes('playerRespawn'), `${evs.st2} hp=${evs.hp2}`);

  // 8. mouse look: yaw/pitch + clamp, strafe roll
  const look = await ev(async () => {
    const ctx = window.__ctx, p = ctx.player; p.yaw = 0; p.pitch = 0;
    ctx.input.mouse.dx = 100; ctx.input.mouse.dy = -100000; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { yaw: p.yaw, pitch: p.pitch, order: ctx.camera.rotation.order, camPitch: ctx.camera.rotation.x };
  });
  check('mouse look + pitch clamp 89°', Math.abs(look.yaw + 0.22) < 0.01 && Math.abs(look.pitch - 1.5533) < 0.001 && look.order === 'YXZ', JSON.stringify(look));
  await tp(0, 0, 8, 0); await settle(300);
  const rollP = walk([1, 0], 0.6); await settle(400); const roll = await ev(() => window.__ctx.camera.rotation.z); await rollP;
  check('strafe roll ±1.2°', roll < -0.012 && roll > -0.03, `roll=${(roll * 180 / Math.PI).toFixed(2)}°`);

  // 9. low frame-rate stress: timeScale 6 clamps dt to the loop max (0.1 s = 10 fps). Jump, sprint, fall off the roof;
  //    pitch/eye must stay sane (no spring blow-up, no NaN), jump apex must be frame-rate independent.
  await tp(6.5, 2.6, 6, 0); await settle(300);
  await ev(() => { window.__game.timeScale(6); window.__ctx.player.qaClearTrace(); window.__ctx.player.fallDamageEnabled = false; });
  await walk([{ dir: [0, 0], t: 1.0, opts: { jump: true } }, { dir: [0, 0], t: 0.3, opts: { jump: true } }, { dir: [0, 1], t: 2.5, opts: { sprint: true } }, { dir: [0, 0], t: 1.5 }]);
  tr = await ev(() => window.__ctx.player.qaTrace()); s = await log();
  await ev(() => { window.__game.timeScale(1); window.__ctx.player.fallDamageEnabled = true; });
  const maxDt = Math.max(...tr.map(f => f.dt)), badCam = tr.filter(f => Math.abs(f.camX) > 0.4 || f.eye < 0.6 || f.eye > 1.95 || !Number.isFinite(f.eye) || !Number.isFinite(f.y));
  const apexLow = Math.max(...tr.filter(f => f.t < tr[0].t + 1.0).map(f => f.y)) - (gy + 2.6);
  check('10 fps: camera pitch/eye stay sane', badCam.length === 0 && maxDt >= 0.09, `maxDt=${maxDt} bad=${badCam.length} ${badCam[0] ? JSON.stringify(badCam[0]) : ''}`);
  check('10 fps: jump apex frame-rate independent', apexLow > 0.95 && apexLow < 1.15, `apex=${apexLow.toFixed(3)}`);
  check('10 fps: landed and settled', Math.abs(s.pos[1] - gy) < 0.02 && s.ground && s.speed < 0.1 && Math.abs(s.pitch) < 0.01, `y=${s.pos[1]} ground=${s.ground} speed=${s.speed} pitch=${s.pitch}`);

  // broadphase cost with the real collider set (EMA of integrate+collide ms per frame while sprinting through the map)
  await ev(() => window.__game.pose('spawn')); await settle(200);
  await walk([0, 1], 1.5, { sprint: true }); s = await log();
  check('collision cheap with real colliders', s.physMs < 0.25, `physMs=${s.physMs} colliders=${s.colliders}`);
  const perf = await ev(() => window.__game.stats());
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log('stats', JSON.stringify(perf));
} catch (e) {
  console.log('TEST CRASH', e);
  process.exitCode = 1;
} finally {
  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails}/${results.length} passed${fails ? `, ${fails} FAILED` : ''}`);
  if (fails) process.exitCode = 1;
  await browser.close();
}
