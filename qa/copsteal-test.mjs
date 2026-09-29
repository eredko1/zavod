// Steal a cop car: node qa/copsteal-test.mjs [outdir] — a cop car pulls up, the crew bails out, F at it: you drive it (3 stars)
import pw from 'playwright-core';
const out = process.argv[2] || '/tmp';
const b = await pw.chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 1100, height: 620 } }); const errs = []; pg.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERROR', e.message); });
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
await pg.goto(`http://localhost:${process.env.PORT || 8790}/?qa=1&map=coney&ai=0&time=day`, { timeout: 180000 }); await pg.waitForFunction(() => window.__game?.ready && window.__game.chase, null, { timeout: 180000 });
await pg.evaluate(() => { window.__game.setState('playing'); window.__game.teleport(75, 0, -330, -Math.PI / 2, 0); }); await pg.waitForTimeout(1000);
await pg.evaluate(() => window.__ctx.bus.emit('shot', { who: 'player', origin: window.__ctx.player.position.clone() })); await pg.waitForTimeout(300);
ok(await pg.evaluate(() => window.__game.chase.copBail(3.4)), 'wanted: a cop car pulls up and the crew bails out');
await pg.waitForTimeout(800); await pg.keyboard.press('KeyF'); await pg.waitForTimeout(1200);
const st = await pg.evaluate(() => ({ stolen: window.__game.chase.stolen(), stars: window.__game.chase.state().stars, kind: window.__ctx.vehicles.mounted?.kind }));
ok(st.stolen && st.stars >= 3, 'F: you are driving the cop car, three stars', JSON.stringify(st));
await pg.screenshot({ path: `${out}/copsteal.png` }); pg.evaluate(() => window.__ctx.vehicles.qaDrive(1, 0, 1.6)).catch(() => {}); await pg.waitForTimeout(1500);
const sp = await pg.evaluate(() => window.__ctx.vehicles.qaState()); ok(sp && sp.speed > 1.5, 'and it drives (the cops you left on the kerb are shooting)', sp?.speed?.toFixed(1));
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
