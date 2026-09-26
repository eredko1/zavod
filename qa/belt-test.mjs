// Belt Parkway loop: node qa/belt-test.mjs [outdir] — steal a car, drive through the W 8th St gantry → up on the elevated
// loop (deck at 9 m), lap, keep right through EXIT 7 → back on W 8th St. Screenshots of the deck and the blocks below.
import { chromium } from 'playwright-core';
const out = process.argv[2] || '/tmp';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 1100, height: 620 } }); const errs = []; pg.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERROR', e.message); });
pg.on('console', (m) => { if (/\[belt\]/.test(m.text())) console.log(m.text()); });
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
await pg.goto('http://localhost:8790/?qa=1&map=coney&ai=0&time=day', { timeout: 150000 }); await pg.waitForFunction(() => window.__game?.ready && window.__game.belt, null, { timeout: 150000 });
await pg.evaluate(() => window.__game.setState('playing'));
const car = () => pg.evaluate(() => { const v = window.__ctx.vehicles.mounted; return v ? { x: +v.pos.x.toFixed(1), y: +v.pos.y.toFixed(2), z: +v.pos.z.toFixed(1), h: +v.heading.toFixed(2), sp: +(v.fwdSpeed || 0).toFixed(1) } : null; });
await pg.evaluate(() => { const r = window.__game.belt.ramp; window.__game.teleport((r.x0 + r.x1) / 2, 0, r.z1 + 25, 0, 0); }); await pg.waitForTimeout(500);
await pg.evaluate(() => { const V = window.__ctx.vehicles; const p = window.__ctx.player.position; const c = V.spawnCar(p.x, p.z, 0, 'sedan', 0x2b3f73, 0); V.mount(c); }); await pg.waitForTimeout(500);
pg.evaluate(() => window.__ctx.vehicles.qaDrive(1, 0, 6)).catch(() => {}); await pg.waitForTimeout(6500);
let c = await car(); ok(c && c.z > 11400 && Math.abs(c.y - 9) < 0.6, 'through the gantry → up on the elevated loop', JSON.stringify(c));
pg.evaluate(() => window.__ctx.vehicles.qaDrive(1, 0, 4)).catch(() => {}); await pg.waitForTimeout(3000);
c = await car(); ok(c && Math.abs(c.y - 9) < 0.6, 'still on the deck at speed', JSON.stringify(c));
await pg.screenshot({ path: `${out}/belt-deck.png` });
await pg.keyboard.press('KeyV'); await pg.waitForTimeout(1500); await pg.screenshot({ path: `${out}/belt-chase.png` }); await pg.keyboard.press('KeyV');
// place the car just before the exit in the right lane, drive through
await pg.evaluate(() => { const B = window.__game.belt; const a = B.at(B.exitS - 25, 3.8), v = window.__ctx.vehicles.mounted; v.pos.set(a[0], a[1], a[2]); v.heading = a[3]; v.vel.set(0, 0, 0); });   // right lane
await pg.waitForTimeout(300);
const pre = await car();
pg.evaluate(() => window.__ctx.vehicles.qaDrive(1, 0, 5)).catch(() => {}); await pg.waitForTimeout(5500);
c = await car(); ok(c && c.z < 0 || (await pg.evaluate(() => window.__ctx.player.position.z)) < 0, 'EXIT 7 takes you back to Coney (or T does)', JSON.stringify({ pre, c }));
if (!(c && c.z < 0)) { await pg.keyboard.press('KeyT'); await pg.waitForTimeout(2000); }
// look down on Brighton / the bay from the deck on foot
await pg.evaluate(() => { window.__ctx.vehicles.dismount?.(); }); await pg.waitForTimeout(500);
await pg.evaluate(() => { const B = window.__game.belt; const a = B.at(120); window.__game.teleport(a[0], a[1], a[2], a[3] + Math.PI / 2, -0.25); }); await pg.waitForTimeout(1800);
await pg.screenshot({ path: `${out}/belt-view-s.png` });
await pg.evaluate(() => { const B = window.__game.belt; const a = B.at(B.per / 2 + 150); window.__game.teleport(a[0], a[1], a[2], a[3] + Math.PI / 2, -0.1); }); await pg.waitForTimeout(1800);
await pg.screenshot({ path: `${out}/belt-view-n.png` });
const py = await pg.evaluate(() => window.__ctx.player.position.y); ok(Math.abs(py - 9) < 0.5, 'standing on the deck on foot', `${py}`);
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
