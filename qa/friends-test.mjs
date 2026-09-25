// The friends loop, 3 clients (C is a phone): node qa/friends-test.mjs [outdir]
import { chromium } from '/Users/eugene/Code/node_modules/playwright-core/index.mjs';
const out = process.argv[2] || '/tmp'; const room = 'fr' + Math.random().toString(36).slice(2, 6);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const mk = async (n, extra = '') => { const p = await b.newPage({ viewport: { width: 960, height: 540 } }); p.on('pageerror', e => console.log(n, 'PAGEERROR', e.message));
  await p.goto(`http://localhost:8790/?qa=1&mp=1&room=${room}&map=coney&ai=0&name=${n}${extra}`, { timeout: 150000 }); await p.waitForFunction(() => window.__game?.ready && window.__ctx.net?.connected, null, { timeout: 150000 }); return p; };
const P = [await mk('ALPHA'), await mk('BRAVO'), await mk('CHARLIE', '&touch=1')];
const all = (fn, arg) => Promise.all(P.map((p) => p.evaluate(fn, arg)));
await P[0].waitForTimeout(3000);
const hs = () => all(() => ({ ...window.__game.hangout.state(), lobby: 0, top: 0, pos: window.__ctx.player.position.toArray().map(v => +v.toFixed(1)) }));
// 1) everyone starts near building 2
let s = await hs(); ok(s.every((x) => Math.hypot(x.pos[0] - x.start[0], x.pos[2] - x.start[2]) < 6), 'all 3 start outside building 2 ' + JSON.stringify(s.map((x) => x.pos)));
// 2) each buys from Igor with a real F press (C taps via bus the same path)
for (const p of P) { await p.evaluate(() => { const [x, , z] = window.__game.hangout.state().igor; window.__game.teleport(x + 1.5, 0, z, Math.PI / 2, 0); }); await p.waitForTimeout(900); await p.keyboard.press('KeyF'); await p.waitForTimeout(400); await p.keyboard.press('Digit1'); await p.waitForTimeout(300); await p.keyboard.press('Digit1'); await p.waitForTimeout(300); }
s = await hs(); ok(s.every((x) => x.stash === 1 && x.cash === 10), 'each bought from Igor ' + JSON.stringify(s.map((x) => [x.cash, x.stash])));
// 3) all stand at lobby elevator 0; ALPHA presses F; all ride up
for (const [i, p] of P.entries()) await p.evaluate((i) => { const [x, y, z] = window.__game.hangout.state().lobby[0]; window.__game.teleport(x + (i - 1) * 0.6, 0, z + (i - 1) * 0.3, 0, 0); }, i);
await P[0].waitForTimeout(1200); await P[0].keyboard.press('KeyF'); await P[0].waitForTimeout(9000);
s = await hs(); ok(s.every((x) => x.pos[1] > 40), 'all 3 rode up together ' + JSON.stringify(s.map((x) => x.pos[1])));
await P[0].screenshot({ path: `${out}/fr-top.png` });
// 4) everyone smokes with B
for (const p of P) { await p.keyboard.press('KeyB'); } await P[0].waitForTimeout(5000);
s = await hs(); ok(s.every((x) => x.high > 0.3), 'all 3 lit up with B ' + JSON.stringify(s.map((x) => x.high)));
await P[1].screenshot({ path: `${out}/fr-high.png` });
// 5) ride down together
await P[1].evaluate(() => window.__game.hangout.ride('down', 0)); await P[1].waitForTimeout(500);
await P[1].waitForTimeout(9000);
s = await hs(); ok(s.every((x) => x.pos[1] < 2), 'all 3 back in the lobby ' + JSON.stringify(s.map((x) => x.pos[1])));
// 6) ALPHA takes the red car, the others hop in
const red = await P[0].evaluate(() => { const c = window.__ctx.vehicles.list.find((v) => v.isRed); window.__game.teleport(c.pos.x + 1.8, 0, c.pos.z, 0, 0); return c.pos.toArray(); });
await P[0].waitForTimeout(800); await P[0].keyboard.press('KeyF'); await P[0].waitForTimeout(600);
ok(await P[0].evaluate(() => !!window.__ctx.vehicles.mounted?.isRed), 'ALPHA drives the red car');
await P[0].waitForTimeout(1500);
for (const p of [P[1], P[2]]) { await p.evaluate(([x, , z]) => window.__game.teleport(x - 2.2, 0, z + 1, 0, 0), red); await p.waitForTimeout(1500); await p.keyboard.press('KeyF'); await p.waitForTimeout(500); }
s = await hs(); ok(s[1].passenger && s[2].passenger, 'BRAVO + CHARLIE are passengers');
ok(await P[1].evaluate(() => !window.__ctx.vehicles.list.find((v) => v.isRed).group.visible), 'friends hide their local red car while ALPHA drives it');
await P[0].evaluate(() => window.__ctx.vehicles.qaDrive(1, 0.1, 4)); await P[0].waitForTimeout(4500);
const d = await all(() => window.__ctx.player.position.toArray()); const sep = Math.max(...d.map((q) => Math.hypot(q[0] - d[0][0], q[2] - d[0][2])));
ok(sep < 6, 'passengers travel with the driver (max sep ' + sep.toFixed(1) + ' m) ' + JSON.stringify(d.map((q) => q.map((v) => +v.toFixed(1)))));
await P[1].screenshot({ path: `${out}/fr-ride.png` });
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); await b.close();
