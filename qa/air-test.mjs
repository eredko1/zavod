// NYPD chopper + tank (coney/airsupport.js): node qa/air-test.mjs [outdir]. 2 stars → the chopper comes, lands, cops get out;
// steal it, climb, fly, fire the chain guns, set down and get out. 3 stars → the tank hunts you and fires; hijack it, drive, fire.
import { chromium } from 'playwright-core';
const out = process.argv[2] || '/tmp';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 1100, height: 620 } }); const errs = []; pg.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERROR', e.message); });
pg.on('console', (m) => { if (/\[air|air support/.test(m.text())) console.log(m.text()); });
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
await pg.goto(`http://localhost:${process.env.PORT || 8790}/?qa=1&map=coney&mode=chill&ai=0&time=day`, { timeout: 150000 }); await pg.waitForFunction(() => window.__game?.ready && window.__game.air, null, { timeout: 150000 });
await pg.evaluate(() => window.__game.setState('playing'));
const st = () => pg.evaluate(() => window.__game.air.state());
const wait = async (fn, s) => { for (let i = 0; i < s * 2; i++) { const v = await pg.evaluate(fn); if (v) return v; await pg.waitForTimeout(500); } return null; };
const god = () => pg.evaluate(() => { const p = window.__ctx.player; p.health = p.maxHealth; p.protectUntil = performance.now() + 60000; });
await pg.evaluate(() => window.__game.teleport(-40, 0.3, -121, 0, 0)); await pg.waitForTimeout(800); await god();
// ---- the chopper
await pg.evaluate(() => window.__game.chase.stars(2));
ok(await wait(() => !!window.__game.air.state().heli, 3), 'two stars → the NYPD chopper', JSON.stringify(await st()));
await pg.waitForTimeout(4000); await pg.screenshot({ path: `${out}/air-inbound.png` });
await pg.evaluate(() => window.__game.air.land());
const landed = await wait(() => window.__game.air.state().heli?.st === 'landed', 40); await god();
ok(landed, 'it sets down near you', JSON.stringify(await st()));
const cops = await pg.evaluate(() => window.__game.chase.state().units.filter((u) => u.kind === 'cop' && !u.dead).length); ok(cops >= 2, 'cops get out', `${cops}`);
await pg.screenshot({ path: `${out}/air-landed.png` });
await pg.evaluate(() => window.__game.chase.clear()); await pg.waitForTimeout(300);
ok(await pg.evaluate(() => window.__game.air.board('heli')), 'F → steal it'); await god();
const y0 = (await st()).heli.pos[1];
await pg.evaluate(() => window.__ctx.input.keys.add('Space')); await pg.waitForTimeout(3000); await pg.evaluate(() => window.__ctx.input.keys.delete('Space'));
const s1 = await st(); ok(s1.heli.pos[1] > y0 + 12, 'Space climbs', JSON.stringify(s1.heli.pos));
await pg.evaluate(() => window.__ctx.input.keys.add('KeyW')); await pg.waitForTimeout(3000); await pg.evaluate(() => window.__ctx.input.keys.delete('KeyW'));
const s2 = await st(); ok(Math.hypot(s2.heli.pos[0] - s1.heli.pos[0], s2.heli.pos[2] - s1.heli.pos[2]) > 25, 'W flies forward', JSON.stringify(s2.heli.pos));
await pg.screenshot({ path: `${out}/air-flying.png` });
await pg.evaluate(() => { window.__ctx.player.pitch = -0.5; window.__game.air.fire(); }); await pg.waitForTimeout(700);
await pg.screenshot({ path: `${out}/air-guns.png` });
ok(!(await pg.evaluate(() => window.__game.air.leave())), 'no jumping out up high');
await pg.evaluate(() => window.__ctx.input.keys.add('KeyC')); await wait(() => { const h = window.__game.air.state().heli; return h && h.pos[1] < window.__ctx.world.groundHeight(h.pos[0], h.pos[2]) + 0.5; }, 20); await pg.evaluate(() => window.__ctx.input.keys.delete('KeyC'));
ok(await pg.evaluate(() => window.__game.air.leave()), 'set down → F out'); await pg.waitForTimeout(500);
{ const s = await st(); const p = await pg.evaluate(() => window.__ctx.player.position.toArray()); ok(!s.pilot && s.heli.st === 'parked' && Math.hypot(p[0] - s.heli.pos[0], p[2] - s.heli.pos[2]) < 6, 'standing beside it', JSON.stringify({ s, p })); }
// ---- you can shake it: get well away from where they last saw you and the stars fade, the chopper goes home
await pg.evaluate(() => { window.__game.chase.stars(2); window.__game.air.spawnHeli(); }); await pg.waitForTimeout(1000);
await pg.evaluate(() => window.__game.teleport(1800, 0.3, -40, 0, 0));
const cleared = await wait(() => window.__game.chase.state().stars === 0, 45);
ok(cleared, 'outrun it: the stars fade', JSON.stringify(await pg.evaluate(() => window.__game.chase.search())));
ok(await wait(() => { const h = window.__game.air.state().heli; return !h || h.st === 'leave' || h.st === 'parked'; }, 5), 'the chopper backs off', JSON.stringify(await st()));
await pg.evaluate(() => window.__game.teleport(-40, 0.3, -121, 0, 0)); await pg.waitForTimeout(800);
// ---- the tank
await pg.evaluate(() => window.__game.chase.stars(3)); await god();
ok(await wait(() => window.__game.air.spawnTank(70), 3), 'three stars → a tank', JSON.stringify(await st()));
const d0 = await pg.evaluate(() => { const t = window.__game.air.state().tank, p = window.__ctx.player.position; return Math.hypot(t.pos[0] - p.x, t.pos[2] - p.z); });
for (let k = 0; k < 6; k++) { await pg.waitForTimeout(2000); await god(); }
const d1 = await pg.evaluate(() => { const t = window.__game.air.state().tank, p = window.__ctx.player.position; return Math.hypot(t.pos[0] - p.x, t.pos[2] - p.z); });
ok(d1 < d0 - 5 || d1 < 45, 'the tank comes for you', `${d0.toFixed(0)} → ${d1.toFixed(0)}`);
await pg.screenshot({ path: `${out}/air-tank.png` });
ok((await st()).tank.shots > 0, 'it fires on you', JSON.stringify((await st()).tank)); await god();
await pg.evaluate(() => window.__game.chase.clear()); await pg.waitForTimeout(300);
ok(await pg.evaluate(() => window.__game.air.board('tank')), 'F → hijack the tank');
const t0 = (await st()).tank.pos;
await pg.evaluate(() => window.__ctx.input.keys.add('KeyW')); await pg.waitForTimeout(2500); await pg.evaluate(() => window.__ctx.input.keys.delete('KeyW'));
const t1 = (await st()).tank.pos; ok(Math.hypot(t1[0] - t0[0], t1[2] - t0[2]) > 6, 'W drives it', JSON.stringify([t0, t1]));
await pg.evaluate(() => window.__game.air.fire()); await pg.waitForTimeout(1200); await pg.screenshot({ path: `${out}/air-tank-fire.png` });
ok(await pg.evaluate(() => window.__game.air.leave()), 'F out of the tank');
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
