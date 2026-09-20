#!/usr/bin/env node
// Vehicles QA: spawn a bike, mount, drive, assert movement/bounds/no-penetration, dismount standing. Usage: node qa/bike-test.mjs [map] [outPrefix]
import { chromium } from '/Users/eugene/Code/node_modules/playwright-core/index.mjs';
const map = process.argv[2] || 'zavod', prefix = process.argv[3] || `qa/shots/bike-${map}`;
const url = `http://localhost:8790/?qa=1&map=${map}&ai=0`;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--disable-gpu-vsync', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
try {
  await page.goto(url, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction('window.__game && window.__game.ready === true', null, { timeout: 90000 });
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => { const c = window.__ctx, v = c.vehicles; return { n: v.list.length, bikes: v.list.map(b => [+b.pos.x.toFixed(1), +b.pos.y.toFixed(2), +b.pos.z.toFixed(1)]), spawn: c.world.playerSpawns[0].toArray(), bounds: [c.world.bounds.min.toArray(), c.world.bounds.max.toArray()], colliders: c.colliders.length }; });
  console.log(JSON.stringify(info));
  check(info.n >= 3 && info.n <= 5, `bikes placed: ${info.n}`);
  // every bike sits on the ground and is free of colliders
  const sit = await page.evaluate(() => { const c = window.__ctx; return c.vehicles.list.map(b => { const gy = c.world.groundHeight(b.pos.x, b.pos.z); let hit = 0; for (const bx of c.colliders) { if (bx === b.box) continue; if (bx.max.y <= b.pos.y + 0.2 || bx.min.y >= b.pos.y + 1.2) continue; if (bx.max.x > b.pos.x - 0.4 && bx.min.x < b.pos.x + 0.4 && bx.max.z > b.pos.z - 0.9 && bx.min.z < b.pos.z + 0.9) hit++; } return { dy: +(b.pos.y - gy).toFixed(3), hit, inB: c.world.bounds.containsPoint(b.pos) }; }); });
  check(sit.every(s => Math.abs(s.dy) < 0.01), 'bikes on groundHeight ' + JSON.stringify(sit));
  check(sit.every(s => s.hit === 0), 'bikes free of colliders');
  check(sit.every(s => s.inB), 'bikes inside bounds');
  // spawn a test bike at a known open spot (per map), stand 1.6 m from it looking at it: close-up shot of the parked bike
  const SPOT = { zavod: [-6, 40, 0], railyard: [-4, 50, 0], terminal: [-30, 4, -Math.PI / 2] }[map] || [0, 0, 0];
  await page.evaluate((SPOT) => { const c = window.__ctx, b = c.vehicles.qaSpawn(...SPOT); c.__testBike = b; const a = b.heading + 1.1; const dx = -Math.sin(a) * 1.6, dz = -Math.cos(a) * 1.6; c.player.teleport(b.pos.x - dx, b.pos.y, b.pos.z - dz, a, -0.3); }, SPOT);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${prefix}-parked.png` });
  const near = await page.evaluate(() => { const c = window.__ctx, b = c.__testBike; return Math.hypot(b.pos.x - c.player.position.x, b.pos.z - c.player.position.z); });
  check(near < 2, `player near bike (${near.toFixed(2)} m)`);
  // mount via F key press
  await page.keyboard.press('KeyF'); await page.waitForTimeout(300);
  const m0 = await page.evaluate(() => ({ mounted: window.__ctx.player.mounted === window.__ctx.__testBike, slot: window.__ctx.weapons?.current?.slot, hl: window.__ctx.vehicles.mounted?.headlight.visible }));
  check(m0.mounted, 'mounted with F'); check(m0.hl === true, 'headlight on');
  const start = await page.evaluate(() => window.__ctx.player.position.toArray());
  // drive: 2.5 s straight, then 2.5 s turning right
  await page.evaluate(() => window.__ctx.vehicles.qaDrive(1, 0, 2.5));
  const s1 = await page.evaluate(() => window.__ctx.vehicles.qaState()); console.log('after straight', JSON.stringify(s1));
  check(s1.fwd > 10, `speed after 2.5 s straight (${s1.fwd.toFixed(1)} m/s)`);
  await page.evaluate(() => { window.__ctx.vehicles.qaDrive(1, 0.7, 2.5); });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${prefix}-riding.png` });
  const mid = await page.evaluate(() => ({ st: window.__ctx.vehicles.qaState(), cam: window.__ctx.camera.rotation.toArray(), fov: window.__ctx.camera.fov }));
  console.log('mid-turn', JSON.stringify(mid));
  check(Math.abs(mid.st.lean) > 0.05, `lean visible (${(mid.st.lean * 57.3).toFixed(1)} deg)`);
  check(Math.abs(mid.cam[2]) > 0.02, `camera roll (${(mid.cam[2] * 57.3).toFixed(1)} deg)`);
  check(mid.fov > 75.5, `fov kick (${mid.fov.toFixed(1)})`);
  await page.waitForTimeout(1500);
  const end = await page.evaluate(() => ({ p: window.__ctx.player.position.toArray(), st: window.__ctx.vehicles.qaState(), inB: window.__ctx.world.bounds.containsPoint(window.__ctx.player.position) }));
  const dist = Math.hypot(end.p[0] - start[0], end.p[2] - start[2]);
  console.log('end', JSON.stringify(end), 'dist', dist.toFixed(1));
  check(dist > 30, `moved > 30 m (${dist.toFixed(1)} m)`);
  check(end.inB, 'inside bounds');
  // penetration: bike centre must not be inside any collider (excluding low kerbs)
  const pen = await page.evaluate(() => { const c = window.__ctx, b = c.vehicles.mounted; let n = 0; for (const bx of c.colliders) { if (bx === b.box) continue; if (bx.max.y <= b.pos.y + 0.25 || bx.min.y >= b.pos.y + 1.2) continue; if (b.pos.x > bx.min.x + 0.05 && b.pos.x < bx.max.x - 0.05 && b.pos.z > bx.min.z + 0.05 && b.pos.z < bx.max.z - 0.05) n++; } return n; });
  check(pen === 0, `no collider penetration (${pen})`);
  // hard brake + slide, then a wall run: drive straight for 6 s (will hit something) and re-check penetration
  await page.evaluate(() => window.__ctx.vehicles.qaDrive(1, -0.8, 1.0, { hard: true }));
  await page.evaluate(() => window.__ctx.vehicles.qaDrive(1, 0, 6));
  const pen2 = await page.evaluate(() => { const c = window.__ctx, b = c.vehicles.mounted; let n = 0; for (const bx of c.colliders) { if (bx === b.box) continue; if (bx.max.y <= b.pos.y + 0.25 || bx.min.y >= b.pos.y + 1.2) continue; if (b.pos.x > bx.min.x + 0.05 && b.pos.x < bx.max.x - 0.05 && b.pos.z > bx.min.z + 0.05 && b.pos.z < bx.max.z - 0.05) n++; } return { n, st: c.vehicles.qaState(), inB: c.world.bounds.containsPoint(c.player.position) }; });
  console.log('after wall run', JSON.stringify(pen2));
  check(pen2.n === 0, 'no penetration after wall run'); check(pen2.inB, 'inside bounds after wall run');
  // dismount with F
  await page.keyboard.press('KeyF'); await page.waitForTimeout(600);
  const d = await page.evaluate(() => { const c = window.__ctx, p = c.player; return { mounted: !!p.mounted, y: p.position.y, gy: c.world.groundHeight(p.position.x, p.position.z), onGround: p.onGround, h: p.height, slot: c.weapons?.current?.slot, fov: c.settings.fov, dist: Math.hypot(c.__testBike.pos.x - p.position.x, c.__testBike.pos.z - p.position.z) }; });
  console.log('dismount', JSON.stringify(d));
  check(!d.mounted, 'dismounted'); check(Math.abs(d.y - d.gy) < 0.1 && d.onGround, `standing on ground (y=${d.y.toFixed(2)} gy=${d.gy.toFixed(2)})`);
  check(d.dist > 0.6 && d.dist < 2.5, `placed beside bike (${d.dist.toFixed(2)} m)`); check(Math.abs(d.fov - 75) < 0.01, `fov restored (${d.fov})`);
  await page.screenshot({ path: `${prefix}-dismounted.png` });
  // F must still reach the weapon-pickup system when no bike is near: drop a rifle (spawn+kill a merc) and pick it up with F
  if (map === 'zavod') {
    const pk = await page.evaluate(async () => {
      const c = window.__ctx; const wait = (ms) => new Promise(r => setTimeout(r, ms));
      c.ai.qaSpawnAt(-6, 10); await wait(300); c.ai.qaKillAll(); await wait(2500);
      let rifle = null; c.scene.traverse(o => { if (!rifle && o.userData?.pickup) rifle = o; }); if (!rifle) return { err: 'no dropped rifle' };
      const rp = rifle.position; c.player.teleport(rp.x + 0.5, c.world.groundHeight(rp.x, rp.z), rp.z + 0.5, 0, -0.5); await wait(400);
      const before = c.weapons.current.id, nearBike = !!c.vehicles.nearBike;
      c.input.pressed.add('KeyF'); await wait(300);
      return { before, after: c.weapons.current.id, nearBike, nearPickup: !!c.ai.nearPickup, mounted: !!c.player.mounted };
    });
    console.log('pickup', JSON.stringify(pk));
    check(pk.nearBike === false && pk.mounted === false, 'no bike near the rifle');
    check(pk.after === 'ak74' && pk.before !== 'ak74', `F picked up the rifle (${pk.before} -> ${pk.after})`);
  }
  const perf = await page.evaluate(() => window.__game.stats());
  console.log('stats', JSON.stringify(perf));
} catch (e) { fails.push('exception ' + (e.message || e)); console.log('EXC', e); }
console.log(JSON.stringify({ ok: fails.length === 0 && errors.length === 0, fails, errors: errors.slice(0, 10) }));
await browser.close();
process.exitCode = fails.length ? 1 : 0;
