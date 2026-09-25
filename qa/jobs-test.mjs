// Igor's jobs: delivery (reach the beam), collect (rob the debtor), chop shop (bring a stolen car). node qa/jobs-test.mjs [outdir]
import { chromium } from '/Users/eugene/Code/node_modules/playwright-core/index.mjs';
const out = process.argv[2] || '/tmp';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
await pg.goto('http://localhost:8790/?qa=1&map=coney&ai=0&time=day', { timeout: 150000 }); await pg.waitForFunction(() => window.__game?.ready && window.__game.jobs, null, { timeout: 150000 });
await pg.evaluate(() => { window.__game.setState('playing'); const [x, , z] = window.__game.hangout.state().igor; window.__game.teleport(x + 1.5, 0, z, Math.PI / 2, 0); });
await pg.waitForTimeout(900);
// talk to Igor → Got any work? → Delivery
await pg.keyboard.press('KeyF'); await pg.waitForTimeout(300); await pg.keyboard.press('Digit3'); await pg.waitForTimeout(300); await pg.keyboard.press('Digit1'); await pg.waitForTimeout(300); await pg.keyboard.press('Digit1'); await pg.waitForTimeout(300);
let j = await pg.evaluate(() => window.__game.jobs.state()); ok(j?.kind === 'deliver', 'Igor hands out a delivery', JSON.stringify(j));
await pg.waitForTimeout(300); await pg.screenshot({ path: `${out}/job-hud.png` });
const cash0 = await pg.evaluate(() => window.__game.hangout.state().cash);
if (j) { await pg.evaluate((a) => window.__game.teleport(a[0] + 1, a[1], a[2], 0, 0), j.at); await pg.waitForTimeout(800); }
ok(!(await pg.evaluate(() => window.__game.jobs.state())) && (await pg.evaluate(() => window.__game.hangout.state().cash)) > cash0, 'delivery pays on arrival');
// collect
j = await pg.evaluate(() => { window.__game.jobs.start('collect'); return window.__game.jobs.state(); }); ok(j?.kind === 'collect', 'collect job', JSON.stringify(j));
await pg.waitForTimeout(500);
for (let i = 0; i < 6 && await pg.evaluate(() => !!window.__game.jobs.state()); i++) { await pg.evaluate(() => { const t = window.__game.crews.state().thugs.find((x) => x.type === 'mk' && x.st !== 'dead' && x.st !== 'flee'); if (!t) return; const p = window.__ctx.player; window.__game.teleport(t.pos[0] - 1.5, t.pos[1], t.pos[2], Math.atan2(-(1.5), 0), 0); }); await pg.waitForTimeout(300); await pg.evaluate(() => window.__game.crews.robNear(true)); await pg.waitForTimeout(1800); }
ok(!(await pg.evaluate(() => window.__game.jobs.state())), 'debt collected');
// chop shop
j = await pg.evaluate(() => { window.__game.jobs.start('chop'); return window.__game.jobs.state(); }); ok(j?.kind === 'chop', 'chop job', JSON.stringify(j));
const stole = await pg.evaluate(() => window.__game.hangout.steal()); await pg.waitForTimeout(1500);
await pg.evaluate((a) => { const v = window.__ctx.vehicles.mounted; if (v) { v.pos.set(a[0] + 2, a[1], a[2]); } }, j.at); await pg.waitForTimeout(800);
ok(stole && !(await pg.evaluate(() => window.__game.jobs.state())), 'car delivered to the chop shop', `done ${await pg.evaluate(() => window.__game.jobs.done())}`);
await pg.evaluate(() => window.__game.jobs.start('deliver')); await pg.waitForTimeout(400);
await pg.keyboard.press('KeyM'); await pg.waitForTimeout(700); await pg.screenshot({ path: `${out}/job-map.png` }); await pg.keyboard.press('KeyM');
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
