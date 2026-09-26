// ARKADY's table by building 1: walk up, F → "Deal me in", play a whole game of durak by clicking / keys; stakes pay out.
// node qa/durak-test.mjs [outdir]
import { chromium } from 'playwright-core';
const out = process.argv[2] || '/tmp';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 1100, height: 650 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); localStorage.removeItem('zavod.durak'); } catch {} });
await pg.goto('http://localhost:8790/?qa=1&map=coney&ai=0&time=day', { timeout: 150000 }); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 150000 });
await pg.evaluate(() => { window.__game.setState('playing'); window.__ctx.camera.getObjectByName('viewmodel').visible = false; });
const A = await pg.evaluate(() => window.__game.hangout.arkady()); ok(!!A, 'Arkady\'s table exists by building 1', JSON.stringify(A));
await pg.evaluate((a) => { const s = a.seat, p = a.pos; window.__game.teleport(s[0], 0, s[2], Math.atan2(-(p[0] - s[0]), -(p[2] - s[2])), -0.12); }, A); await pg.waitForTimeout(1500);
await pg.screenshot({ path: `${out}/arkady.png` });
await pg.keyboard.press('KeyF'); await pg.waitForTimeout(400);
const k = await pg.evaluate(() => [...document.querySelectorAll('.hkch')].findIndex((x) => /Переводной — for fun/.test(x.textContent)));
await pg.keyboard.press('Digit' + (k + 1)); await pg.waitForTimeout(1500);
ok(await pg.evaluate(() => !!document.querySelector('.durak')), 'the durak table opens');
await pg.screenshot({ path: `${out}/durak-open.png` });
// play: whenever it's our move, click a highlighted card if any, else the action button
let turns = 0;
for (let i = 0; i < 400; i++) {
  const st = await pg.evaluate(() => { const d = document.querySelector('.durak'); if (!d) return 'closed'; if (d.querySelector('.dk-end')) return 'over'; const ok = d.querySelector('.dk-hand .dk-card.ok'); const btn = d.querySelector('.dk-btns button');
    if (ok && Math.random() < 0.85) { ok.click(); return 'card'; } if (btn) { btn.click(); return 'btn'; } return 'wait'; });
  if (st === 'over' || st === 'closed') break; if (st !== 'wait') turns++; await pg.waitForTimeout(st === 'wait' ? 250 : 120);
  if (turns === 12) await pg.screenshot({ path: `${out}/durak-mid.png` });
}
const end = await pg.evaluate(() => document.querySelector('.dk-end h2')?.textContent);
ok(!!end, 'the game plays to the end', `${end} after ${turns} moves`);
await pg.screenshot({ path: `${out}/durak-end.png` });
await pg.evaluate(() => [...document.querySelectorAll('.dk-end button')].find((x) => /Встать/.test(x.textContent))?.click()); await pg.waitForTimeout(500);
ok(await pg.evaluate(() => !document.querySelector('.durak') && !window.__ctx.player.mounted), 'stand up: back in the world');
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
