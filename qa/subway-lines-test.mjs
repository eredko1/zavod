// Ride the Q and the D: Q from Stillwell (4th island) → W 8 St lower level → Ocean Pkwy (off; the Q runs on to Brighton Beach
// past the map edge, so riders are put off there); D from Stillwell (2nd island) → Bay 50 St. The wall clock is skewed so the
// test doesn't wait for the timetable. node qa/subway-lines-test.mjs [outdir]
import { chromium } from 'playwright-core';
const out = process.argv[2] || '/tmp';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 1000, height: 560 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
await pg.goto('http://localhost:8790/?qa=1&map=coney&ai=0&time=day', { timeout: 150000 }); await pg.waitForFunction(() => window.__game?.ready && window.__game.subway?.line, null, { timeout: 150000 });
await pg.evaluate(() => { window.__game.setState('playing'); window.__ctx.camera.getObjectByName('viewmodel').visible = false; });
ok(JSON.stringify(await pg.evaluate(() => window.__game.subway.lines())) === '["F","Q","D"]', 'three lines: F, Q, D');
const S = (id) => pg.evaluate((id) => window.__game.subway.line(id).state(), id);
const goTo = async (id, st, extra = 6) => { await pg.evaluate(([id, st, e]) => { const U = window.__game.subway.line(id); U.skew(U.until(st) + e); }, [id, st, extra]); await pg.waitForTimeout(500); };
const boardAt = async (id, x, z) => {
  await pg.evaluate(([x, z]) => window.__game.teleport(x, 8.62, z, Math.PI / 2, 0), [x, z]); await pg.waitForTimeout(1200);
  let s = await S(id); if (s.door) { await pg.evaluate((d) => window.__game.teleport(d[0], d[1] + 0.02, d[2], Math.PI / 2, 0), s.door); await pg.waitForTimeout(500); }
  await pg.keyboard.press('KeyF'); await pg.waitForTimeout(600); return S(id); };
// Q: Stillwell 4th island (x −33.5), beside the train's middle
await goTo('Q', 'STW'); let at = await pg.evaluate(() => window.__game.subway.line('Q').stops().find((q) => q.id === 'STW').at);
let s = await boardAt('Q', -34.5, at[2]); ok(s.aboard, 'Q boards at Stillwell (4th island)', JSON.stringify(s));
await goTo('Q', 'W8', 5); await pg.waitForTimeout(800); s = await S('Q'); ok(s.aboard && s.stop === 'W8' && Math.abs(s.pos[1] - 8.6) < 0.6, 'Q stops at W 8 St, lower level', JSON.stringify(s.pos));
await pg.screenshot({ path: `${out}/q-w8.png` });
await goTo('Q', 'OCP', 5); await pg.waitForTimeout(800); await pg.keyboard.press('KeyF'); await pg.waitForTimeout(900);
s = await S('Q'); ok(!s.aboard && s.pos[0] > 850 && s.pos[1] > 7.5, 'off the Q at Ocean Pkwy, on the platform', JSON.stringify(s.pos));
await pg.waitForTimeout(1200); await pg.screenshot({ path: `${out}/q-ocp.png` }); const p1 = await pg.evaluate(() => window.__ctx.player.position.y); ok(p1 > 7.5, 'standing on the Ocean Pkwy platform', p1.toFixed(2));
// D: Stillwell 2nd island (x −64)
await goTo('D', 'STW'); at = await pg.evaluate(() => window.__game.subway.line('D').stops().find((q) => q.id === 'STW').at);
s = await boardAt('D', -62.5, at[2]); ok(s.aboard, 'D boards at Stillwell (2nd island)', JSON.stringify(s));
await pg.evaluate(() => { const U = window.__game.subway.line('D'); U.skew(U.until('B50') - 15); }); await pg.waitForTimeout(1500);
await pg.evaluate(() => { const p = window.__ctx.player; p.yaw += Math.PI / 2; }); await pg.waitForTimeout(500); await pg.screenshot({ path: `${out}/d-ride.png` });
s = await S('D'); ok(s.aboard && s.leg === 'run' && s.pos[2] < -450, 'riding the D north up the West End el', JSON.stringify(s.pos));
await goTo('D', 'B50', 5); await pg.waitForTimeout(800); await pg.keyboard.press('KeyF'); await pg.waitForTimeout(900);
s = await S('D'); ok(!s.aboard && s.pos[2] < -600 && s.pos[1] > 7.5, 'off the D at Bay 50 St, on the platform', JSON.stringify(s.pos));
await pg.waitForTimeout(1200); await pg.screenshot({ path: `${out}/d-b50.png` }); const p2 = await pg.evaluate(() => window.__ctx.player.position.y); ok(p2 > 7.5, 'standing on the Bay 50 St platform', p2.toFixed(2));
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
