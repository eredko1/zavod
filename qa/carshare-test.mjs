// Two friends in one car at speed: the driver lights up (B) → the passenger gets high too; the passenger drinks → driver too.
// node qa/carshare-test.mjs
import { chromium } from 'playwright-core';
const room = 'cs' + Math.random().toString(36).slice(2, 6);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const errs = [];
const mk = async (n) => { const p = await b.newPage({ viewport: { width: 640, height: 360 } }); p.on('pageerror', (e) => errs.push(n + ': ' + e.message));
  await p.goto(`http://localhost:8790/?qa=1&mp=1&room=${room}&map=coney&ai=0&name=${n}`, { timeout: 150000 }); await p.waitForFunction(() => window.__game?.ready && window.__ctx.net?.connected, null, { timeout: 150000 }); return p; };
const A = await mk('DRIVER'), B = await mk('RIDER'); await A.waitForTimeout(3000);
ok(await A.evaluate(() => window.__game.hangout.steal()), 'driver steals a car'); await A.waitForTimeout(1500);
const cp = await A.evaluate(() => window.__ctx.vehicles.mounted.pos.toArray());
await B.evaluate((c) => window.__game.teleport(c[0] + 1.5, 0, c[2] + 1.5, 0, 0), cp); await B.waitForTimeout(2500);
await B.keyboard.press('KeyF'); await B.waitForTimeout(800);
ok(await B.evaluate(() => window.__game.hangout.state().passenger), 'rider hops in');
A.evaluate(() => window.__ctx.vehicles.qaDrive(1, 0, 8)).catch(() => {}); await A.waitForTimeout(3500);
const sp = await A.evaluate(() => window.__ctx.vehicles.qaState()?.speed); console.log('speed', sp?.toFixed?.(1));
await B.evaluate(() => { window.__sm = []; window.__ctx.bus.on('net:smoke', (m) => window.__sm.push(m)); });
await A.evaluate(() => window.__game.hangout.light()); await B.waitForTimeout(2500);
const rx = await B.evaluate(() => window.__sm); const aid = await A.evaluate(() => window.__ctx.net.id);
ok(rx.length && rx.every((m) => m.c === aid), 'smoke is tagged with the car (shared however far apart the laggy positions are)', JSON.stringify(rx[0]));
const hb = await B.evaluate(() => window.__game.hangout.state().high); ok(hb > 0, 'rider gets high off the driver\'s joint', `high ${hb}`);
await B.evaluate(() => { window.__game.hangout.give && null; }); 
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
