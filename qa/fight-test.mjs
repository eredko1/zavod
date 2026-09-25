// Chill street life: rob a passer-by (hands up → cash), start a fight (guard, punches land, knife finishes it), cops answer a mugging.
// node qa/fight-test.mjs [outdir]
import { chromium } from '/Users/eugene/Code/node_modules/playwright-core/index.mjs';
const out = process.argv[2] || '/tmp';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
await pg.goto('http://localhost:8790/?qa=1&map=coney&mode=chill&time=day', { timeout: 150000 }); await pg.waitForFunction(() => window.__game?.ready && window.__game.crews, null, { timeout: 150000 });
await pg.evaluate(() => { window.__game.setState('playing'); const s = window.__ctx.world.onlineStart; window.__game.teleport(s[0] + 40, 0, s[2], 0, 0); window.__game.crews.calm(0); });
await pg.waitForTimeout(1500);
// 1) a passer-by right in front of us
const st = () => pg.evaluate(() => ({ cr: window.__game.crews.state(), cash: window.__game.hangout.state().cash, hp: window.__ctx.player.health, chase: window.__game.chase?.state?.() }));
await pg.evaluate(() => { const p = window.__ctx.player; const id = window.__game.crews.mark(2); const t = window.__game.crews.state().thugs.find((x) => x.id === id); if (t) { const yaw = Math.atan2(-(t.pos[0] - p.position.x), -(t.pos[2] - p.position.z)); window.__game.teleport(p.position.x, p.position.y, p.position.z, yaw, 0); } });
await pg.waitForTimeout(400);
let s0 = await st(); const who = await pg.evaluate(() => window.__game.crews.robNear(true));
ok(!!who, 'F — ROB targets the passer-by', who);
await pg.waitForTimeout(400); await pg.screenshot({ path: `${out}/fight-rob.png` });
await pg.waitForTimeout(1600); let s1 = await st();
ok(s1.cash > s0.cash, 'hands up → pays out', `$${s0.cash} → $${s1.cash}`);
// 2) a crew squares up (clear any heat from the mugging first)
await pg.evaluate(() => window.__game.chase?.clear?.()); await pg.waitForTimeout(500);
await pg.evaluate(() => { window.__game.crews.gang('st', 'talk', 2); }); await pg.waitForTimeout(6000);
const f = await pg.evaluate(() => { const t = window.__game.crews.state().thugs.find((x) => x.type !== 'mk' && x.st !== 'dead'); return t && window.__game.crews.fight(); }); await pg.waitForTimeout(3500);
s1 = await st(); ok(s1.cr.thugs.some((t) => t.st === 'fight'), 'crew fights back', f);
await pg.screenshot({ path: `${out}/fight-guard.png` });
await pg.waitForTimeout(3000); const s2 = await st(); ok(s2.hp < 100, 'punches land', `hp ${s2.hp}`);
// knife them: face the nearest fighter and slash
for (let i = 0; i < 14; i++) {
  await pg.evaluate(() => { const p = window.__ctx.player; const t = window.__game.crews.state().thugs.filter((x) => x.st === 'fight').sort((a, b) => Math.hypot(a.pos[0] - p.position.x, a.pos[2] - p.position.z) - Math.hypot(b.pos[0] - p.position.x, b.pos[2] - p.position.z))[0]; if (!t) return; const yaw = Math.atan2(-(t.pos[0] - p.position.x), -(t.pos[2] - p.position.z)); p.yaw = yaw; p.pitch = -0.12; window.__game.fire(1); });
  await pg.waitForTimeout(650);
}
const s3 = await st(); ok(s3.cr.thugs.some((t) => t.st === 'dead') || s3.cr.thugs.every((t) => t.st !== 'fight'), 'knife ends the fight', JSON.stringify(s3.cr.thugs.map((t) => [t.name, t.st, t.hp])));
await pg.screenshot({ path: `${out}/fight-after.png` });
// 3) cops answer a mugging
const sb = await pg.evaluate(() => { window.__bust = 0; window.__ctx.bus.on('busted', () => window.__bust++); window.__game.chase?.crime?.('rob'); return window.__game.chase?.state?.()?.stars; }); console.log('stars right after', sb); await pg.waitForTimeout(9000);
const s4 = await st(); const bust = await pg.evaluate(() => window.__bust);
ok(sb >= 1 && ((s4.chase?.stars || 0) >= 1 || bust > 0), 'mugging brings the cops (still wanted, or busted)', JSON.stringify({ stars: s4.chase?.stars, units: s4.chase?.units?.length, bust, hp: s4.hp }));
ok(s4.hp > 0, 'one-star cops cuff, they don\'t kill', `hp ${s4.hp}`);
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
