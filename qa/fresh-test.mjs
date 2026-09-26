// Pause → "Start fresh (everyone)" (click twice): cash/inventory reset, locals back up, crews & dropped cash cleared,
// and a friend in the room gets reset too. node qa/fresh-test.mjs
import { chromium } from 'playwright-core';
const room = 'fr' + Math.random().toString(36).slice(2, 6);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const errs = [];
const mk = async (n) => { const p = await b.newPage({ viewport: { width: 700, height: 400 } }); p.on('pageerror', (e) => errs.push(n + ': ' + e.message));
  await p.goto(`http://localhost:8790/?qa=1&mp=1&room=${room}&map=coney&mode=chill&name=${n}`, { timeout: 150000 }); await p.waitForFunction(() => window.__game?.ready && window.__ctx.net?.connected && window.__game.crews, null, { timeout: 150000 }); return p; };
const A = await mk('ALPHA'), B = await mk('BRAVO'); await A.waitForTimeout(2500);
for (const p of [A, B]) await p.evaluate(() => { window.__game.setState('playing'); window.__game.hangout.give(200); window.__game.crews.calm(1e9); });
await A.evaluate(() => { window.__game.crews.gang('ru', 'talk', 3); window.__game.hangout.drop(40); });
const s0 = await A.evaluate(() => ({ cash: window.__game.hangout.state().cash, thugs: window.__game.crews.state().thugs.length, drops: window.__game.hangout.state().drops.length }));
const b0 = await B.evaluate(() => window.__game.hangout.state().cash);
// A: pause → Start fresh, twice
await A.evaluate(() => window.__game.setState('paused')); await A.waitForTimeout(400);
for (let i = 0; i < 2; i++) { await A.evaluate(() => document.querySelector('[data-act="fresh"]')?.click()); await A.waitForTimeout(400); }
await A.waitForTimeout(1500);
const s1 = await A.evaluate(() => ({ cash: window.__game.hangout.state().cash, thugs: window.__game.crews.state().thugs.length, drops: window.__game.hangout.state().drops.length, state: window.__ctx.state }));
ok(s0.cash > 60 && s1.cash === 60, 'my cash back to the start ($60 in chill)', `${s0.cash} → ${s1.cash}`);
ok(s0.thugs >= 3 && s1.thugs === 0, 'crews cleared', `${s0.thugs} → ${s1.thugs}`);
ok(s0.drops >= 1 && s1.drops === 0, 'cash lying around cleared', `${s0.drops} → ${s1.drops}`);
ok(s1.state === 'playing', 'back in the game');
const b1 = await B.evaluate(() => window.__game.hangout.state().cash); ok(b0 > 60 && b1 === 60, 'my friend was reset too', `${b0} → ${b1}`);
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
