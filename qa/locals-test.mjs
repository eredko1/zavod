// Coney locals: POPS (sip of a 40 → he rides with you and kills mercs), SHADES → crabs → Sammy's lotion, NET GOST shashlik →
// the mangal → golden Deagle. node qa/locals-test.mjs [outdir]
import { chromium } from '/Users/eugene/Code/node_modules/playwright-core/index.mjs';
const out = process.argv[2] || '/tmp';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 1100, height: 620 } }); const errs = []; pg.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERROR', e.message); });
pg.on('console', (m) => { if (/\[locals\]/.test(m.text())) console.log(m.text()); });
await pg.goto('http://localhost:8790/?qa=1&map=coney&time=day', { timeout: 150000 }); await pg.waitForFunction(() => window.__game?.ready && window.__game.locals, null, { timeout: 150000 });
const H = () => pg.evaluate(() => window.__game.hangout.state());
const tp = (p, yaw = 0, pitch = 0) => pg.evaluate(([p, yaw, pitch]) => window.__game.teleport(p[0], p[1], p[2], yaw, pitch), [p, yaw, pitch]);
await pg.evaluate(() => { window.__ctx.ai.qaStartWave = () => {}; window.__game.killAll(); window.__game.hangout.give(100); });
// ---- POPS ----
await tp([0, 0, 100], 0); await pg.waitForTimeout(3500);
const p0 = await pg.evaluate(() => window.__game.locals.pops()); await pg.waitForTimeout(2000); const p1 = await pg.evaluate(() => window.__game.locals.pops());
ok(Math.hypot(p1.pos[0] - p0.pos[0], p1.pos[2] - p0.pos[2]) > 2, 'POPS cruises in his cart', JSON.stringify([p0.pos, p1.pos]));
await tp([p1.pos[0] + 2.2, p1.pos[1], p1.pos[2]], Math.PI / 2); await pg.waitForTimeout(700); await pg.screenshot({ path: `${out}/locals-pops.png` });
await pg.evaluate(async () => { const m = await import('/src/world/hangkit.js'); m.hangkit.give('forty'); });
let s = null;
for (const [ox, oz] of [[2, 0], [-2, 0], [0, 2], [0, -2], [1.4, 1.4]]) {   // a free spot next to the cart
  const pp = (await pg.evaluate(() => window.__game.locals.pops())).pos; await tp([pp[0] + ox, pp[1], pp[2] + oz], Math.atan2(ox, oz)); await pg.waitForTimeout(400);
  await pg.keyboard.press('KeyF'); await pg.waitForTimeout(400); s = await H(); if (s.dialog) break;
} ok(s.dialog?.name === 'POPS', 'talk to POPS', s.dialog?.text?.slice(0, 80));
ok(s.dialog?.choices?.some((c) => /40/.test(c)), 'can offer him a sip of the 40', JSON.stringify(s.dialog?.choices));
await pg.keyboard.press('Digit1'); await pg.waitForTimeout(300); await pg.keyboard.press('Digit1'); await pg.waitForTimeout(300);
let pops = await pg.evaluate(() => window.__game.locals.pops()); ok(pops.leader === 'me' && pops.left > 150, 'POPS rides with you', JSON.stringify(pops));
// mercs appear: POPS should take some down
await pg.evaluate(() => { const p = window.__ctx.player.position; for (let i = 0; i < 4; i++) window.__ctx.ai.qaSpawnAt(p.x + 12 + i * 2, p.z + 6, { state: 'cover', health: 100 }); });
await pg.waitForTimeout(9000); pops = await pg.evaluate(() => window.__game.locals.pops()); ok(pops.kills >= 1, 'POPS kills mercs', `${pops.kills} kills`);
await pg.screenshot({ path: `${out}/locals-pops-fight.png` });
// ---- SHADES → crabs → Sammy ----
const shades = s.vendors?.find?.((v) => v.name === 'SHADES') || null;
const sp = await pg.evaluate(async () => { const m = await import('/src/world/hangkit.js'); return m.kit().vendors.find((v) => v.name === 'SHADES').pos.toArray(); });
await tp([sp[0] + 1.6, sp[1], sp[2]], Math.PI / 2); await pg.waitForTimeout(900);
const sp2 = await pg.evaluate(async () => { const m = await import('/src/world/hangkit.js'); return m.kit().vendors.find((v) => v.name === 'SHADES').pos.toArray(); }); await tp([sp2[0] + 1.5, sp2[1], sp2[2]], Math.PI / 2); await pg.waitForTimeout(300);
await pg.keyboard.press('KeyF'); await pg.waitForTimeout(300); await pg.keyboard.press('Digit1'); await pg.waitForTimeout(300); await pg.keyboard.press('Digit1'); await pg.waitForTimeout(300);
let st = await pg.evaluate(async () => (await import('/src/world/hangkit.js')).hangkit.status); ok(st.shades, 'bought sunglasses', JSON.stringify(st));
await pg.screenshot({ path: `${out}/locals-shades.png` });
await pg.waitForTimeout(26000); st = await pg.evaluate(async () => (await import('/src/world/hangkit.js')).hangkit.status); ok(st.crabs, '…and got crabs', JSON.stringify(st));
const d = await pg.evaluate(() => window.__game.hangout.state().deli); await tp(d.counter, Math.atan2(-(d.sammy[0] - d.counter[0]), -(d.sammy[2] - d.counter[2]))); await pg.waitForTimeout(800);
await pg.keyboard.press('KeyF'); await pg.waitForTimeout(300); await pg.keyboard.press('Digit1'); await pg.waitForTimeout(300); await pg.keyboard.press('Digit1'); await pg.waitForTimeout(300);
s = await H(); ok(s.dialog?.choices?.some((c) => /lotion/i.test(c)), 'Sammy offers the special lotion', JSON.stringify(s.dialog?.choices));
const li = s.dialog?.choices?.findIndex((c) => /lotion/i.test(c)) ?? -1; if (li >= 0) { await pg.keyboard.press('Digit' + (li + 1)); await pg.waitForTimeout(300); } await pg.evaluate(() => window.__game.hangout.close()); await pg.waitForTimeout(200);
st = await pg.evaluate(async () => (await import('/src/world/hangkit.js')).hangkit.status); ok(!st.crabs, 'lotion cures the crabs', JSON.stringify(st));
// ---- NET GOST → mangal → golden deagle ----
const mk = await pg.evaluate(() => window.__game.locals.market()); ok(!!mk, 'NET GOST market built', JSON.stringify(mk?.door));
if (mk) { await tp(mk.counter, Math.atan2(-(mk.cashier[0] - mk.counter[0]), -(mk.cashier[2] - mk.counter[2]))); await pg.waitForTimeout(800);
  await pg.screenshot({ path: `${out}/locals-market.png` });
  await pg.keyboard.press('KeyF'); await pg.waitForTimeout(300); await pg.keyboard.press('Digit1'); await pg.waitForTimeout(300); await pg.keyboard.press('Digit1'); await pg.waitForTimeout(300);
  s = await H(); ok(s.inv.includes('meat'), 'bought shashlik from OLGA', JSON.stringify(s.inv)); }
const mg = await pg.evaluate(() => window.__game.locals.mangal()); await tp([mg[0], 0, mg[2] + 1.4], 0); await pg.waitForTimeout(700);
await pg.keyboard.press('KeyF'); await pg.waitForTimeout(500); ok((await pg.evaluate(() => window.__game.locals.grill().state)) === 'cooking', 'meat on the mangal');
await pg.waitForTimeout(3000); await pg.screenshot({ path: `${out}/locals-mangal.png` });
await pg.waitForTimeout(13000); ok((await pg.evaluate(() => window.__game.locals.grill().state)) === 'ready', 'shashlik ready');
for (let k = 0; k < 4; k++) {   // a walker passing by may be closer — step right up to the grill and retry
  await pg.evaluate(() => window.__game.hangout.close()); await pg.evaluate((m) => window.__game.teleport(m[0], 0, m[2] + 0.9, 0, 0), mg); await pg.waitForTimeout(300);
  await pg.keyboard.press('KeyF'); await pg.waitForTimeout(700); console.log('  eat try', k, JSON.stringify(await pg.evaluate(async () => ({ g: window.__game.locals.grill().state, dlg: window.__game.hangout.state().dialog?.name, v: (await import('/src/world/hangkit.js')).kit().vendors.map((v) => [v.name, +Math.hypot(v.pos.x - window.__ctx.player.position.x, v.pos.z - window.__ctx.player.position.z).toFixed(1)]), lo: window.__ctx.weapons.loadout, p: window.__ctx.player.position.toArray().map((x) => +x.toFixed(1)), mounted: !!window.__ctx.player.mounted })))); if ((await pg.evaluate(() => window.__game.locals.grill().state)) !== 'ready') break;
}
await pg.waitForTimeout(800);
const lo = await pg.evaluate(() => window.__ctx.weapons.loadout); ok(lo.secondary === 'deagle', 'ate it → golden Deagle', JSON.stringify(lo));
await pg.screenshot({ path: `${out}/locals-deagle.png` });
ok(!errs.length, 'no page errors', JSON.stringify(errs));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
