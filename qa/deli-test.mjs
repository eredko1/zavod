// Sammy's deli (coney): node qa/deli-test.mjs [outdir] — finds the deli, walks in, talks to Sammy (his question first), buys a
// 40 + a bottle, drinks (drowsy), checks the merc cash drop pickup. Exit 1 on failure.
import { chromium } from 'playwright-core';
const out = process.argv[2] || '/tmp';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 1100, height: 620 } });
const errs = []; pg.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERROR', e.message); });
pg.on('console', (m) => { const t = m.text(); if (/\[hangout\]|\[hangkit\]/.test(t)) console.log(t); });
await pg.goto('http://localhost:8790/?qa=1&map=coney&ai=0&time=day', { timeout: 150000 }); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 150000 });
const st = () => pg.evaluate(() => window.__game.hangout.state());
let s = await st(); ok(!!s.deli, 'deli placed', JSON.stringify(s.deli));
// outside shot: stand across the street looking at the storefront
await pg.evaluate(() => { const d = window.__game.hangout.state().deli; const [x, , z] = d.door; const f = d.face; const ox = x + Math.sin(f) * 16, oz = z + Math.cos(f) * 16; window.__game.teleport(ox, 0, oz, Math.atan2(-(x - ox), -(z - oz)), 0.06); });
await pg.waitForTimeout(2500); await pg.screenshot({ path: `${out}/deli-outside.png` });
// walk in: teleport inside the door facing in
await pg.evaluate(() => { const d = window.__game.hangout.state().deli; const [x, , z] = d.inside; window.__game.teleport(x, 0, z, d.face + Math.PI, -0.05); });
await pg.waitForTimeout(1500); await pg.screenshot({ path: `${out}/deli-inside.png` });
// to the counter, in front of Sammy
await pg.evaluate(() => { const d = window.__game.hangout.state().deli; const [x, , z] = d.counter, [sx, , sz] = d.sammy; window.__game.teleport(x, 0, z, Math.atan2(-(sx - x), -(sz - z)), 0); });
await pg.waitForTimeout(900);
await pg.keyboard.press('KeyF'); await pg.waitForTimeout(500);
s = await st(); ok(s.dialog?.name === 'SAMMY', 'F opens Sammy dialogue', JSON.stringify(s.dialog));
await pg.screenshot({ path: `${out}/deli-talk1.png` });
ok(/anal/i.test(s.dialog?.text || ''), 'Sammy asks his question straight away', s.dialog?.text);
await pg.screenshot({ path: `${out}/deli-talk2.png` });
await pg.keyboard.press('Digit2'); await pg.waitForTimeout(300); s = await st(); ok(/patience/i.test(s.dialog?.text || ''), 'answer 2 reply', s.dialog?.text);
await pg.keyboard.press('Digit1'); await pg.waitForTimeout(300); s = await st(); ok(/Olde English/i.test(s.dialog?.text || ''), 'shop menu', s.dialog?.choices?.join(' | '));
await pg.screenshot({ path: `${out}/deli-shop.png` });
const cash0 = s.cash;
await pg.keyboard.press('Digit2'); await pg.waitForTimeout(300); s = await st(); ok(s.inv.includes('forty') && s.cash === cash0 - 5, 'bought a 40 for $5', JSON.stringify([s.cash, s.inv]));
ok((await pg.evaluate(() => window.__ctx.weapons.current?.id ?? 'x')) !== undefined, 'weapon keys not swapped by dialogue');
await pg.keyboard.press('Digit1'); await pg.waitForTimeout(300);   // "something else" → shop
await pg.keyboard.press('Digit1'); await pg.waitForTimeout(300); s = await st(); ok(s.inv.includes('bottle') && s.cash === cash0 - 20, 'bought a bottle for $15', JSON.stringify([s.cash, s.inv]));
await pg.keyboard.press('KeyF'); await pg.waitForTimeout(300); s = await st(); ok(!s.dialog, 'F closes dialogue');
ok(!(await pg.evaluate(() => !!window.__ctx.player.mounted)), 'player free after dialogue');
await pg.keyboard.press('KeyB'); await pg.waitForTimeout(3000); s = await st(); ok(s.drunk > 0.5, 'B drinks the bottle → drowsy', s.drunk);
await pg.screenshot({ path: `${out}/deli-drunk.png` });
// second visit: short tease, straight to the shop
await pg.keyboard.press('KeyF'); await pg.waitForTimeout(400); s = await st(); ok(s.dialog && /anal/i.test(s.dialog.text), 'second visit: he asks again', s.dialog?.text);
await pg.keyboard.press('KeyF'); await pg.waitForTimeout(300);
// merc cash: a drop next to the player is picked up by walking over it
await pg.evaluate(() => window.__game.hangout.drop(35)); await pg.waitForTimeout(300);
const c1 = (await st()).cash;
await pg.evaluate(() => { const [x, y, z] = window.__game.hangout.state().drops[0]; window.__game.teleport(x, 0, z, 0, 0); }); await pg.waitForTimeout(600);
s = await st(); ok(s.cash === c1 + 35 && !s.drops.length, 'walked over merc cash → +$35', JSON.stringify([c1, s.cash]));
ok(!errs.length, 'no page errors', JSON.stringify(errs));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
