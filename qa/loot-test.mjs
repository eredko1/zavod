// Chill online: BRAVO drops ALPHA's robber (a puppet on BRAVO's screen) → BRAVO gets the robber's money. node qa/loot-test.mjs
import { chromium } from 'playwright-core';
const room = 'lt' + Math.random().toString(36).slice(2, 6);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const errs = [];
const mk = async (n) => { const p = await b.newPage({ viewport: { width: 480, height: 270 } }); p.on('pageerror', (e) => errs.push(n + ': ' + e.message));
  await p.goto(`http://localhost:8790/?qa=1&mp=1&room=${room}&map=coney&mode=chill&name=${n}`, { timeout: 150000 }); await p.waitForFunction(() => window.__game?.ready && window.__ctx.net?.connected && window.__game.chill, null, { timeout: 150000 }); return p; };
const A = await mk('ALPHA'), B = await mk('BRAVO'); await A.waitForTimeout(2500);
await A.evaluate(() => window.__game.setState('playing')); await B.evaluate(() => window.__game.setState('playing'));
const id = await A.evaluate(() => { window.__game.crews.calm(1e9); return window.__game.chill.spawn(20)?.[0]?.id ?? window.__game.crews.state().thugs[0]?.id; });
await B.waitForTimeout(2000);
const aid = await A.evaluate(() => window.__ctx.net.id), c0 = await B.evaluate(() => window.__game.hangout.state().cash);
const tid = await A.evaluate(() => window.__game.crews.state().thugs.find((t) => t.type !== 'mk')?.id);
await B.evaluate(([aid, tid]) => window.__ctx.net.send('thughit', { o: aid, i: tid, d: 250, h: 1 }), [aid, tid]);   // what B's hit on the puppet sends
await B.waitForTimeout(2500);
const c1 = await B.evaluate(() => window.__game.hangout.state().cash);
ok(c1 > c0, 'BRAVO gets paid for dropping ALPHA\'s robber', `$${c0} → $${c1}`);
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
