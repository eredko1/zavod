// Belt Parkway loop: node qa/belt-test.mjs [outdir] — steal a car, drive through the W 8th St gantry → up on the elevated
// loop (deck at 9 m), lap, keep right through EXIT 7 → back on W 8th St. Screenshots of the deck and the blocks below.
import { chromium } from 'playwright-core';
const out = process.argv[2] || '/tmp';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 1100, height: 620 } }); const errs = []; pg.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERROR', e.message); });
pg.on('console', (m) => { if (/\[belt\]/.test(m.text())) console.log(m.text()); });
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
await pg.goto(`http://localhost:${process.env.PORT || 8790}/?qa=1&map=coney&ai=0&time=day`, { timeout: 150000 }); await pg.waitForFunction(() => window.__game?.ready && window.__game.belt, null, { timeout: 150000 });
await pg.evaluate(() => window.__game.setState('playing'));
const car = () => pg.evaluate(() => { const v = window.__ctx.vehicles.mounted; return v ? { x: +v.pos.x.toFixed(1), y: +v.pos.y.toFixed(2), z: +v.pos.z.toFixed(1), h: +v.heading.toFixed(2), sp: +(v.fwdSpeed || 0).toFixed(1) } : null; });
await pg.evaluate(() => { const r = window.__game.belt.ramp; window.__game.teleport((r.x0 + r.x1) / 2, 0, r.z1 + 25, 0, 0); }); await pg.waitForTimeout(500);
await pg.evaluate(() => { const V = window.__ctx.vehicles; const p = window.__ctx.player.position; const c = V.spawnCar(p.x, p.z, 0, 'sedan', 0x2b3f73, 0); V.mount(c); }); await pg.waitForTimeout(500);
for (let k = 0; k < 20 && await pg.evaluate(() => { const v = window.__ctx.vehicles.mounted; return window.__ctx.world.traffic.cars().some((t) => Math.abs(t.x - v.pos.x) < 5 && t.z < v.pos.z + 3 && t.z > v.pos.z - 40); }); k++) await pg.waitForTimeout(500);   // Coney traffic queues at the ramp: wait for a clear lane
pg.evaluate(() => window.__ctx.vehicles.qaDrive(1, 0, 6)).catch(() => {}); await pg.waitForTimeout(6500);
let c = await car(); ok(c && c.z > 11400 && Math.abs(c.y - 9) < 0.6, 'through the gantry → up on the elevated loop', JSON.stringify(c));
if (!(c && c.z > 11400)) console.log('  traffic within 10 m:', await pg.evaluate(() => { const v = window.__ctx.vehicles.mounted; return JSON.stringify(window.__ctx.world.traffic.cars().filter((t) => Math.hypot(t.x - v.pos.x, t.z - v.pos.z) < 10).map((t) => [t.kind, +t.x.toFixed(1), +t.z.toFixed(1), t.state]));}));
pg.evaluate(() => window.__ctx.vehicles.qaDrive(1, 0, 4)).catch(() => {}); await pg.waitForTimeout(3000);
c = await car(); ok(c && Math.abs(c.y - 9) < 0.6, 'still on the deck at speed', JSON.stringify(c));
await pg.screenshot({ path: `${out}/belt-deck.png` });
await pg.keyboard.press('KeyV'); await pg.waitForTimeout(1500); await pg.screenshot({ path: `${out}/belt-chase.png` }); await pg.keyboard.press('KeyV');
// every exit: just before its gore in the right lane, drive through, land at its street
const dest = { coney: (p) => p.z < -400 && p.z > -600 && p.x > 300, stillwell: (p) => Math.abs(p.x + 40) < 40 && Math.abs(p.z + 121) < 30, brighton: (p) => p.x > 2100 && Math.abs(p.z + 40) < 20, tavern: (p) => p.z < -11000 };
for (const e of await pg.evaluate(() => window.__game.belt.exits.map((e) => ({ id: e.id, s: e.s, to: e.to })))) {
  await pg.evaluate(() => { const V = window.__ctx.vehicles; V.dismount?.(); const p = window.__ctx.player.position; V.mount(V.spawnCar(p.x, p.z, 0, 'sedan', 0x2b3f73, 0)); });   // a fresh car each time (a wreck won't drive)
  await pg.evaluate((s) => { const B = window.__game.belt, a = B.at(s - 25, B.lane(2)), v = window.__ctx.vehicles.mounted; v.pos.set(a[0], a[1], a[2]); v.heading = a[3]; v.vel.set(0, 0, 0); }, e.s);
  await pg.waitForTimeout(3200);   // the 3 s re-trip guard
  pg.evaluate(() => window.__ctx.vehicles.qaDrive(1, 0, 4)).catch(() => {});
  let p = null; for (let k = 0; k < 16; k++) { await pg.waitForTimeout(500); p = await pg.evaluate(() => { const v = window.__ctx.vehicles.mounted, q = v ? v.pos : window.__ctx.player.position; return { x: +q.x.toFixed(1), y: +q.y.toFixed(1), z: +q.z.toFixed(1) }; }); if (dest[e.to](p) && p.y < 2) break; }
  await pg.waitForTimeout(1500);   // let the arrival's fade finish
  ok(dest[e.to](p) && p.y < 2, `EXIT ${e.id} → ${e.to}`, JSON.stringify(p));
  await pg.screenshot({ path: `${out}/belt-exit-${e.id}.png` });
}
// every on-ramp on the street takes a car up onto the loop
for (const r of await pg.evaluate(() => window.__game.belt.ramps.map((r) => ({ id: r.id, x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 })))) {
  await pg.waitForTimeout(3200);
  await pg.evaluate(([x, z]) => { const V = window.__ctx.vehicles; if (!V.mounted) V.mount(V.spawnCar(x, z, 0, 'sedan', 0x2b3f73, 0)); const v = V.mounted; v.hp = null; v.pos.set(x, 0, z); v.vel.set(0, 0, 0); }, [r.x, r.z]); await pg.waitForTimeout(1500);
  const p = await car(); ok(p && p.z > 11400 && Math.abs(p.y - 9) < 0.6, `on-ramp ${r.id} → the loop`, JSON.stringify(p));
}
// off the end of 8th Ave by car → up on the Belt
await pg.waitForTimeout(3200); await pg.evaluate(() => window.__game.tavern.arrive('car')); await pg.waitForTimeout(6000);
await pg.evaluate(() => { const v = window.__ctx.vehicles.mounted, Z = window.__game.tavern.zone; if (v) { v.pos.set(Z.x1 - 10, 0.15, Z.oz + 3); v.vel.set(0, 0, 0); } }); await pg.waitForTimeout(2500);
{ const p = await car(); ok(p && p.z > 11400, 'drive off 8th Ave → onto the Belt', JSON.stringify(p)); }
ok(await pg.evaluate(() => window.__ctx.scene.getObjectByName('beltTraffic:sedan:paint')?.count > 0), 'traffic on the loop is real cars');
await pg.evaluate(() => window.__game.belt.exit()); await pg.waitForTimeout(2000);
// look down on Brighton / the bay from the deck on foot
await pg.evaluate(() => { window.__ctx.vehicles.dismount?.(); }); await pg.waitForTimeout(500);
await pg.evaluate(() => { const B = window.__game.belt; const a = B.at(120); window.__game.teleport(a[0], a[1], a[2], a[3] + Math.PI / 2, -0.25); }); await pg.waitForTimeout(1800);
await pg.screenshot({ path: `${out}/belt-view-s.png` });
await pg.evaluate(() => { const B = window.__game.belt; const a = B.at(B.per / 2 + 150); window.__game.teleport(a[0], a[1], a[2], a[3] + Math.PI / 2, -0.1); }); await pg.waitForTimeout(1800);
await pg.screenshot({ path: `${out}/belt-view-n.png` });
const py = await pg.evaluate(() => window.__ctx.player.position.y); ok(Math.abs(py - 9) < 0.5, 'standing on the deck on foot', `${py}`);
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
