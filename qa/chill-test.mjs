// Chill mode (coney): knife only (handgun slot locked), a gopnik walks up and robs you, knife him → your money back, Vitek
// (shashlik + $60) → Makarov unlocked, no mercenaries. node qa/chill-test.mjs [outdir]
import { chromium } from '/Users/eugene/Code/node_modules/playwright-core/index.mjs';
const out = process.argv[2] || '/tmp';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 1100, height: 620 } }); const errs = []; pg.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERROR', e.message); });
pg.on('console', (m) => { if (/\[chill\]/.test(m.text())) console.log(m.text()); });
await pg.goto('http://localhost:8790/?qa=1&map=coney&mode=chill&time=day', { timeout: 150000 }); await pg.waitForFunction(() => window.__game?.ready && window.__game.chill, null, { timeout: 150000 });
await pg.waitForTimeout(1500);
const lo = await pg.evaluate(() => ({ ...window.__ctx.weapons.loadout, cur: window.__ctx.weapons.currentId, cash: window.__game.hangout.state().cash }));
ok(lo.primary === 'knife' && lo.cash === 60, 'start: knife + $60', JSON.stringify(lo));
await pg.keyboard.press('Digit2'); await pg.waitForTimeout(500);
ok((await pg.evaluate(() => window.__ctx.weapons.currentId)) === 'knife', 'handgun slot locked (Digit2 does nothing)');
await pg.screenshot({ path: `${out}/chill-knife.png` });
// a thug comes for you
await pg.evaluate(() => window.__game.chill.spawn(9)); await pg.waitForTimeout(500);
let c = await pg.evaluate(() => window.__game.chill.state()); ok(c.thugs.length === 1, 'a gopnik shows up', JSON.stringify(c.thugs));
await pg.waitForTimeout(1200); await pg.screenshot({ path: `${out}/chill-thug.png` });
await pg.waitForFunction(() => window.__game.chill.state().robbed > 0, null, { timeout: 20000 }).catch(() => {});
c = await pg.evaluate(() => window.__game.chill.state()); const cash1 = await pg.evaluate(() => window.__game.hangout.state().cash);
ok(c.robbed === 1 && cash1 < 60, 'he robs you', `robbed ${c.robbed}, cash ${cash1}`);
// catch him and knife him
const t = c.thugs[0];
for (let i = 0; i < 12; i++) {
  const s = await pg.evaluate(() => window.__game.chill.state().thugs[0]); if (!s || s.st === 'dead') break;
  await pg.evaluate((p) => { const me = window.__ctx.player; const dx = p[0] - 1.2, dz = p[2]; window.__game.teleport(dx, p[1], dz, Math.atan2(-(p[0] - dx), -(p[2] - dz)), -0.1); }, s.pos);
  await pg.waitForTimeout(80); await pg.evaluate(() => window.__game.fire(1)); await pg.waitForTimeout(400);
}
c = await pg.evaluate(() => window.__game.chill.state()); ok(c.thugs[0]?.st === 'dead', 'knifed him', JSON.stringify(c.thugs[0]));
const drops = await pg.evaluate(() => window.__game.hangout.state().drops); ok(drops.length >= 1, 'he drops what he took (+ his own)', JSON.stringify(drops));
if (drops[0]) { await pg.evaluate((d) => window.__game.teleport(d[0], 0, d[2], 0, 0), drops[0]); await pg.waitForTimeout(700); }
const cash2 = await pg.evaluate(() => window.__game.hangout.state().cash); ok(cash2 > cash1, 'money back', `${cash1} → ${cash2}`);
// Vitek: skewer + $60 → Makarov
await pg.evaluate(async () => { const m = await import('/src/world/hangkit.js'); m.hangkit.give('skewer'); m.hangkit.earn(60); });
const vp = c.vitek; await pg.evaluate((p) => window.__game.teleport(p[0] + 1.6, p[1], p[2], Math.PI / 2, 0), vp); await pg.waitForTimeout(600);
await pg.keyboard.press('KeyF'); await pg.waitForTimeout(300); const dlg = (await pg.evaluate(() => window.__game.hangout.state().dialog)); ok(dlg?.name === 'VITEK', 'talk to VITEK', dlg?.text?.slice(0, 70));
await pg.keyboard.press('Digit1'); await pg.waitForTimeout(300); await pg.keyboard.press('Digit1'); await pg.waitForTimeout(700);
c = await pg.evaluate(() => window.__game.chill.state()); ok(c.armed, 'bought the Makarov');
await pg.keyboard.press('Digit2'); await pg.waitForTimeout(900);
ok((await pg.evaluate(() => window.__ctx.weapons.currentId)) === 'm9', 'handgun in hand (slot 2)');
await pg.screenshot({ path: `${out}/chill-makarov.png` });
ok((await pg.evaluate(() => window.__ctx.ai.alive())) === 0, 'no mercenaries');
ok(!errs.length, 'no page errors', JSON.stringify(errs));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
