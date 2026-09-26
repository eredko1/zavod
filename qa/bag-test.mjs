// Stab a merc → his gun goes in your bag; walk over another → bag; keys 1–9 / numpad pick; ammo stays per gun.
// node qa/bag-test.mjs [outdir]
import { chromium } from 'playwright-core';
const out = process.argv[2] || '/tmp';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 800, height: 450 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
await pg.goto('http://localhost:8790/?qa=1&map=zavod&primary=m4a1&secondary=m9', { timeout: 150000 }); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 150000 });
await pg.evaluate(() => { window.__game.setState('playing'); window.__game.freezeAI(true); });
await pg.waitForTimeout(1500);
await pg.evaluate(() => { const p = window.__ctx.player.position; for (let i = 0; i < 3; i++) window.__ctx.ai.qaSpawnAt(p.x + 6 + i * 3, p.z + 4); });   // a few mercs to stab
await pg.waitForTimeout(800);
const W = () => pg.evaluate(() => ({ bag: window.__ctx.weapons.bag, cur: window.__ctx.weapons.currentId, ammo: window.__ctx.weapons.current?.ammo }));
ok((await W()).bag.join() === 'm4a1,m9', 'bag starts with the loadout', JSON.stringify(await W()));
// stab the nearest merc to death (V) — stand next to him facing him
for (let tries = 0; tries < 8; tries++) {
  const r = await pg.evaluate(() => { const ai = window.__ctx.ai; const p = window.__ctx.player.position; const s = ai.soldiers.filter((x) => !x.dead).sort((a, b) => a.position.distanceTo(p) - b.position.distanceTo(p))[0]; if (!s) return null;
    const q = s.position; window.__game.teleport(q.x - 1.2, q.y, q.z, -Math.PI / 2, -0.1); return [q.x, q.y, q.z]; });
  console.log('merc', JSON.stringify(r), await pg.evaluate(() => window.__ctx.ai.soldiers.length)); if (!r) break; await pg.waitForTimeout(250);
  for (let k = 0; k < 3; k++) { await pg.keyboard.press('KeyV'); await pg.waitForTimeout(650); }
  console.log('after', JSON.stringify(await pg.evaluate(() => { const p = window.__ctx.player.position; const s = window.__ctx.ai.soldiers.sort((a, b) => a.position.distanceTo(p) - b.position.distanceTo(p))[0]; return s && { hp: s.health ?? s.hp, dead: s.dead, d: +s.position.distanceTo(p).toFixed(2), drops: window.__ctx.ai.qaDrops?.() }; })));
  const w = await W(); if (w.bag.length > 2) break;
}
let w = await W(); ok(w.bag.length >= 3, 'stabbing a merc puts his gun in the bag', JSON.stringify(w));
await pg.screenshot({ path: `${out}/bag-stab.png` });
// select it with the number key, fire a few, switch away and back — ammo remembered
if (w.bag.length >= 3) {
  await pg.keyboard.press('Digit3'); await pg.waitForTimeout(900); w = await W(); ok(w.cur === w.bag[2], 'key 3 equips it', JSON.stringify(w));
  await pg.evaluate(() => window.__game.fire(3)); await pg.waitForTimeout(300); const a0 = (await W()).ammo;
  await pg.keyboard.press('Numpad1'); await pg.waitForTimeout(900); ok((await W()).cur === 'm4a1', 'numpad 1 back to the M4');
  await pg.keyboard.press('Digit3'); await pg.waitForTimeout(900); const a1 = (await W()).ammo; ok(a1 === a0, 'ammo remembered per gun', `${a0} → ${a1}`);
}
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
