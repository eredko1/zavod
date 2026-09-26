// Guns off the books (Igor, a tough in a crew), V = quick stab with any gun, anybody can be stabbed (Sammy goes down, gets up).
// node qa/deal-test.mjs [outdir]
import { chromium } from 'playwright-core';
const out = process.argv[2] || '/tmp';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 800, height: 450 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
await pg.goto('http://localhost:8790/?qa=1&map=coney&mode=chill&time=day', { timeout: 150000 }); await pg.waitForFunction(() => window.__game?.ready && window.__game.crews, null, { timeout: 150000 });
await pg.evaluate(() => { window.__game.setState('playing'); window.__game.hangout.give(400); window.__game.crews.calm(1e9); });
await pg.waitForTimeout(1500);
// Igor: F → 4 (Need a piece) → 3 (AK)
await pg.evaluate(() => { const [x, , z] = window.__game.hangout.state().igor; window.__game.teleport(x + 1.5, 0, z, Math.PI / 2, 0); }); await pg.waitForTimeout(900);
for (const k of ['KeyF', 'Digit4', 'Digit3', 'Digit1']) { await pg.keyboard.press(k); await pg.waitForTimeout(350); }
let lo = await pg.evaluate(() => window.__game.hangout.loadout()); ok(lo.primary === 'ak74', 'Igor sells an AK', JSON.stringify(lo));
// a dealer in a crew: face him, F, buy the first gun (Makarov)
await pg.evaluate(() => { const s = window.__ctx.world.onlineStart; window.__game.teleport(s[0] + 40, 0, s[2], 0, 0); }); await pg.waitForTimeout(400);
const id = await pg.evaluate(() => window.__game.crews.dealer(5)); await pg.waitForTimeout(4500);
await pg.evaluate((id) => { const t = window.__game.crews.state().thugs.find((x) => x.id === id); const p = window.__ctx.player.position; window.__game.teleport(t.pos[0] - 1.6, t.pos[1], t.pos[2], Math.atan2(-1.6, 0) * 0 + Math.atan2(-(1.6), -0), 0); }, id);
await pg.waitForTimeout(400); for (const k of ['KeyF', 'Digit1', 'Digit1']) { await pg.keyboard.press(k); await pg.waitForTimeout(350); }
lo = await pg.evaluate(() => window.__game.hangout.loadout()); ok(lo.secondary === 'm9', 'a tough sells a Makarov', JSON.stringify(lo));
// stab SHADES (walks laps round the park) with V while holding a gun
for (let i = 0; i < 6; i++) {
  await pg.evaluate(() => { const v = window.__game.hangout.vendors().find((x) => x.name === 'SHADES'); const p = v.pos; window.__game.teleport(p[0] - 1.3, p[1], p[2], -Math.PI / 2, -0.15); });
  await pg.waitForTimeout(150); await pg.keyboard.press('KeyV'); await pg.waitForTimeout(650);
}
await pg.screenshot({ path: `${out}/stab.png` });
const h = await pg.evaluate(() => window.__game.hangout.hurt()); const sh = h.find((x) => x.name === 'SHADES');
ok(sh && (sh.down || sh.hp < 100), 'V stabs a local', JSON.stringify(sh));
ok(sh?.down, 'they go down after a few stabs', JSON.stringify(sh));
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
