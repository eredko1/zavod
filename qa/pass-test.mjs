// B-to-use + passing test, 2 clients on coney: node qa/pass-test.mjs [outdir]
import { chromium } from '/Users/eugene/Code/node_modules/playwright-core/index.mjs';
const out = process.argv[2] || '/tmp'; const room = 'ps' + Math.random().toString(36).slice(2, 6);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const mk = async (n) => { const p = await b.newPage({ viewport: { width: 960, height: 540 } }); p.on('pageerror', e => console.log(n, 'PAGEERROR', e.message)); await p.goto(`http://localhost:8790/?qa=1&mp=1&room=${room}&map=coney&ai=0&name=${n}`, { timeout: 150000 }); await p.waitForFunction(() => window.__game?.ready && window.__ctx.net?.connected, null, { timeout: 150000 }); return p; };
const A = await mk('ALPHA'), B = await mk('BRAVO'); await A.waitForTimeout(2500);
const st = (p) => p.evaluate(() => { const s = window.__game.hangout.state(); return { cash: s.cash, item: s.item, high: s.high, drunk: s.drunk, igor: s.igor, pos: window.__ctx.player.position.toArray() }; });
let a = await st(A); ok(Math.hypot(a.pos[0] - a.igor[0], a.pos[2] - a.igor[2]) < 14, 'spawn is right by Igor (' + Math.hypot(a.pos[0] - a.igor[0], a.pos[2] - a.igor[2]).toFixed(1) + ' m)');
for (const p of [A, B]) { await p.evaluate(() => { const [x, , z] = window.__game.hangout.state().igor; window.__game.teleport(x + 1.5, 0, z, Math.PI / 2, 0); }); await p.waitForTimeout(900); await p.keyboard.press('KeyF'); await p.waitForTimeout(400); }
a = await st(A); ok(a.item === 'weed' && a.cash === 10, 'first buy = weed');
// stand together somewhere else on the map, A blazes with B
await A.evaluate(() => window.__game.teleport(0, 0, 150, 0, 0)); await B.evaluate(() => window.__game.teleport(1.5, 0, 150, 0, 0)); await A.waitForTimeout(1500);
await A.keyboard.press('KeyB'); await A.waitForTimeout(6000);
a = await st(A); const bb = await st(B); ok(a.high > 0.2, 'A lifted with B (' + a.high + ')'); ok(bb.high > 0.15, 'BRAVO got it passed (' + bb.high + ')');
// second buy = bottle, drink next to B
await A.evaluate(() => { const [x, , z] = window.__game.hangout.state().igor; window.__game.teleport(x + 1.5, 0, z, Math.PI / 2, 0); }); await A.waitForTimeout(900); await A.keyboard.press('KeyF'); await A.waitForTimeout(400);
a = await st(A); ok(a.item === 'bottle', 'second buy = bottle');
await A.evaluate(() => window.__game.teleport(0, 0, 150, 0, 0)); await A.waitForTimeout(1200); await A.keyboard.press('KeyB'); await A.waitForTimeout(2500);
a = await st(A); const b2 = await st(B); ok(a.drunk > 0.3 && b2.drunk > 0.3, 'bottle shared: drowsy A ' + a.drunk + ' B ' + b2.drunk);
await B.screenshot({ path: `${out}/pass-drowsy.png` });
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); await b.close();
