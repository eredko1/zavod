// Ride the F: Stillwell (board) → W 8 St (off, on the upper platform) → board again → Neptune Av (off, on the platform).
// The wall clock is skewed so the test doesn't wait for the timetable. node qa/subway-test.mjs [outdir]
import { chromium } from 'playwright-core';
const out = process.argv[2] || '/tmp';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 1000, height: 560 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
await pg.goto('http://localhost:8790/?qa=1&map=coney&ai=0&time=day', { timeout: 150000 }); await pg.waitForFunction(() => window.__game?.ready && window.__game.subway, null, { timeout: 150000 });
await pg.evaluate(() => { window.__game.setState('playing'); window.__ctx.camera.getObjectByName('viewmodel').visible = false; });
const S = () => pg.evaluate(() => window.__game.subway.state());
const goTo = async (id, extra = 6) => { await pg.evaluate(([id, e]) => { const U = window.__game.subway; U.skew(U.until(id) + e); }, [id, extra]); await pg.waitForTimeout(400); };
// 1) Stillwell: stand on the island east of track 3, facing the train
await goTo('STW');
await pg.evaluate(() => window.__game.teleport(-51.6, 8.62, -330, Math.PI / 2, 0.02)); await pg.waitForTimeout(1500);
let s = await S(); ok(s.stop === 'STW' && s.door, 'F train in at Stillwell, doors open, a door in reach', JSON.stringify(s));
await pg.screenshot({ path: `${out}/sub-stw.png` });
if (s.door) { await pg.evaluate((d) => window.__game.teleport(d[0], d[1] + 0.02, d[2], Math.PI / 2, 0), s.door); await pg.waitForTimeout(500); }
await pg.keyboard.press('KeyF'); await pg.waitForTimeout(600); s = await S(); ok(s.aboard, 'F boards the train', JSON.stringify(s));
// 2) ride: jump to the middle of the run, look out
await pg.evaluate(() => { const U = window.__game.subway; U.skew(U.until('W8') - 12); }); await pg.waitForTimeout(1200);
await pg.evaluate(() => { const p = window.__ctx.player; p.yaw += Math.PI / 2; p.pitch = -0.05; }); await pg.waitForTimeout(700);
await pg.screenshot({ path: `${out}/sub-ride.png` }); s = await S(); ok(s.aboard && s.leg === 'run', 'riding between stations', JSON.stringify(s));
// 3) W 8 St: off onto the upper platform
await goTo('W8', 5); await pg.waitForTimeout(800); await pg.keyboard.press('KeyF'); await pg.waitForTimeout(700);
s = await S(); ok(!s.aboard && Math.abs(s.pos[1] - 14.6) < 0.8, 'F gets you off at W 8 St (upper level)', JSON.stringify(s.pos));
await pg.screenshot({ path: `${out}/sub-w8.png` });
// 4) board again, ride to Neptune Av
await pg.waitForTimeout(300); s = await S(); if (s.door) { await pg.evaluate((d) => window.__game.teleport(d[0], d[1] + 0.02, d[2], 0, 0), s.door); await pg.waitForTimeout(400); await pg.keyboard.press('KeyF'); await pg.waitForTimeout(600); }
s = await S(); ok(s.aboard, 'back on at W 8 St', JSON.stringify(s));
await goTo('NEP', 5); await pg.waitForTimeout(800); await pg.keyboard.press('KeyF'); await pg.waitForTimeout(900);
s = await S(); ok(!s.aboard && s.pos[1] > 7.5 && s.pos[0] > 420, 'off at Neptune Av, on the platform', JSON.stringify(s.pos));
await pg.evaluate(() => { const p = window.__ctx.player; p.pitch = -0.05; }); await pg.waitForTimeout(600); await pg.screenshot({ path: `${out}/sub-nep.png` });
await pg.waitForTimeout(1500); const p2 = await pg.evaluate(() => window.__ctx.player.position.toArray()); ok(p2[1] > 7.5, 'standing, not falling through the platform', JSON.stringify(p2.map((v) => +v.toFixed(2))));
// 5) from the street: the train on the el
await pg.evaluate(() => { const U = window.__game.subway; U.skew(U.until('W8') - 20); const st = U.stops().find((q) => q.id === 'W8').at; window.__game.teleport(st[0] - 40, 0, st[2] + 30, -2.2, 0.28); }); await pg.waitForTimeout(1500);
await pg.screenshot({ path: `${out}/sub-street.png` });
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
