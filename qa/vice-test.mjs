// WSP / SBU friends loop: node qa/vice-test.mjs <wsp|sbu> [outdir] — deli + Sammy, rasta bag, every shaft up + down, steal.
import { chromium } from '/Users/eugene/Code/node_modules/playwright-core/index.mjs';
const map = process.argv[2] || 'wsp', out = process.argv[3] || '/tmp';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 1100, height: 620 } });
const errs = []; pg.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERROR', e.message); });
pg.on('console', (m) => { const t = m.text(); if (/\[(wsp|sbu|hangkit)\]/.test(t)) console.log(t.slice(0, 200)); });
await pg.goto(`http://localhost:8790/?qa=1&map=${map}&ai=0&time=day`, { timeout: 150000 }); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 150000 });
const st = () => pg.evaluate(() => window.__game.hangout.state());
const pos = () => pg.evaluate(() => window.__ctx.player.position.toArray().map((v) => +v.toFixed(2)));
const tp = (p, yaw = 0, pitch = 0) => pg.evaluate(([p, yaw, pitch]) => window.__game.teleport(p[0], p[1], p[2], yaw, pitch), [p, yaw, pitch]);
let s = await st();
ok(s.vendors?.length >= 3, 'vendors: Sammy + 2 rastas', JSON.stringify(s.vendors?.map((v) => v.name)));
ok(s.shafts?.length >= 2, 'shafts', JSON.stringify(s.shafts?.map((t) => t.label)));
ok(s.cars > 5, 'parked cars to steal', s.cars);
// Sammy: the question, then a 40
const sam = s.vendors.find((v) => v.name === 'SAMMY');
const deli = await pg.evaluate(() => { const d = window.__ctx.world.deli; return d && { counter: d.counter.toArray(), sammy: d.sammy.toArray(), door: d.door.toArray(), face: d.face }; });
ok(!!sam && !!deli, 'deli built', JSON.stringify(deli?.door));
if (deli) {
  const [dx, , dz] = deli.door; const f = deli.face; { const ox = dx + Math.sin(f) * 12, oz = dz + Math.cos(f) * 12; await tp([ox, 0, oz], Math.atan2(-(dx - ox), -(dz - oz)), 0.08); } await pg.waitForTimeout(2200); await pg.screenshot({ path: `${out}/${map}-deli-out.png` });
  const [cx, , cz] = deli.counter, [sx, , sz] = deli.sammy; await tp([cx, 0, cz], Math.atan2(-(sx - cx), -(sz - cz))); await pg.waitForTimeout(800);
  await pg.keyboard.press('KeyF'); await pg.waitForTimeout(300); await pg.keyboard.press('Digit1'); await pg.waitForTimeout(300);
  s = await st(); ok(/anal/i.test(s.dialog?.text || ''), 'Sammy asks first', s.dialog?.text);
  await pg.screenshot({ path: `${out}/${map}-sammy.png` });
  await pg.keyboard.press('Digit3'); await pg.waitForTimeout(250); await pg.keyboard.press('Digit1'); await pg.waitForTimeout(250); await pg.keyboard.press('Digit2'); await pg.waitForTimeout(250);
  s = await st(); ok(s.inv.includes('forty'), 'bought a 40', JSON.stringify([s.cash, s.inv])); await pg.keyboard.press('KeyF'); await pg.waitForTimeout(200);
}
// a rasta: teleport next to him, buy a bag, smoke
const ras = s.vendors.find((v) => v.name !== 'SAMMY');
await tp([ras.pos[0] + 1.6, ras.pos[1], ras.pos[2]], Math.PI / 2); await pg.waitForTimeout(1000);
const rp = (await st()).vendors.find((v) => v.name === ras.name).pos; await tp([rp[0] + 1.5, rp[1], rp[2]], Math.PI / 2); await pg.waitForTimeout(500);
await pg.keyboard.press('KeyF'); await pg.waitForTimeout(300); s = await st(); ok(s.dialog?.name === ras.name, `talk to ${ras.name}`, s.dialog?.text);
await pg.screenshot({ path: `${out}/${map}-rasta.png` });
await pg.keyboard.press('Digit1'); await pg.waitForTimeout(300); s = await st(); ok(s.inv.includes('weed'), 'bought a bag', JSON.stringify([s.cash, s.inv]));
await pg.keyboard.press('Digit1'); await pg.waitForTimeout(200);
await pg.keyboard.press('KeyB'); await pg.waitForTimeout(4500); s = await st(); ok(s.high > 0.2, 'smoking → high', s.high);
// every shaft: up (screenshot the view) and back down
for (let i = 0; i < s.shafts.length; i++) {
  const t = s.shafts[i]; await tp(t.lobby[0], 0); await pg.waitForTimeout(700);
  await pg.keyboard.press('KeyF'); await pg.waitForTimeout(6500);
  const p = await pos(); ok(Math.abs(p[1] - t.top[0][1]) < 1.0, `${t.label}: up to y=${t.top[0][1].toFixed(1)}`, JSON.stringify(p));
  await pg.evaluate(() => { const vm = window.__ctx.camera.getObjectByName('viewmodel'); if (vm) vm.visible = false; }); await pg.waitForTimeout(600);
  await pg.screenshot({ path: `${out}/${map}-top-${i}.png` });
  await pg.evaluate(() => { const vm = window.__ctx.camera.getObjectByName('viewmodel'); if (vm) vm.visible = true; });
  // walk a few steps on the roof (not falling through)
  await pg.keyboard.down('KeyW'); await pg.waitForTimeout(700); await pg.keyboard.up('KeyW'); await pg.waitForTimeout(500);
  const p2 = await pos(); ok(p2[1] > t.top[0][1] - 1.0, `${t.label}: roof holds when walking`, JSON.stringify(p2));
  await tp(t.top[0], 0); await pg.waitForTimeout(600); await pg.keyboard.press('KeyF'); await pg.waitForTimeout(6500);
  const p3 = await pos(); ok(p3[1] < t.lobby[0][1] + 1.0, `${t.label}: back down`, JSON.stringify(p3));
}
// steal the nearest parked car
ok(await pg.evaluate(() => window.__game.hangout.steal()), 'stole a car'); await pg.waitForTimeout(800);
ok(await pg.evaluate(() => !!window.__ctx.vehicles.mounted), 'driving the stolen car');
ok(!errs.length, 'no page errors', JSON.stringify(errs));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
