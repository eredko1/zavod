// Belt Parkway run: node qa/belt-test.mjs [outdir] — steal a car, drive through the W 8th St gantry → parkway eastbound,
// cruise, teleport-check the airport loop, westbound exit → back on W 8th St. Screenshots along the way.
import { chromium } from '/Users/eugene/Code/node_modules/playwright-core/index.mjs';
const out = process.argv[2] || '/tmp';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 1100, height: 620 } }); const errs = []; pg.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERROR', e.message); });
pg.on('console', (m) => { if (/\[belt\]/.test(m.text())) console.log(m.text()); });
await pg.goto('http://localhost:8790/?qa=1&map=coney&ai=0&time=day', { timeout: 150000 }); await pg.waitForFunction(() => window.__game?.ready && window.__game.belt, null, { timeout: 150000 });
const car = () => pg.evaluate(() => { const v = window.__ctx.vehicles.mounted; return v ? { x: +v.pos.x.toFixed(1), y: +v.pos.y.toFixed(2), z: +v.pos.z.toFixed(1), h: +v.heading.toFixed(2), sp: +v.fwdSpeed.toFixed(1) } : null; });
// a car at the south end of the ramp, facing north up W 8th St
await pg.evaluate(() => { const r = window.__game.belt.ramp; window.__game.teleport((r.x0 + r.x1) / 2, 0, r.z1 + 25, 0, 0); });
await pg.waitForTimeout(500);
await pg.evaluate(() => { const V = window.__ctx.vehicles; const p = window.__ctx.player.position; const c = V.spawnCar(p.x, p.z, 0, 'sedan', 0x2b3f73, 0); V.mount(c); });
await pg.waitForTimeout(500);
await pg.evaluate(() => window.__ctx.vehicles.qaDrive(1, 0, 6)); await pg.waitForTimeout(6500);
let c = await car(); ok(c && c.z > 11400, 'drove through the gantry → on the Belt Parkway', JSON.stringify(c));
await pg.evaluate(() => window.__ctx.vehicles.qaDrive(1, 0, 5)); await pg.waitForTimeout(2500);
await pg.screenshot({ path: `${out}/belt-drive.png` });
await pg.keyboard.press('KeyV'); await pg.waitForTimeout(1500); await pg.screenshot({ path: `${out}/belt-chase.png` }); await pg.keyboard.press('KeyV');
await pg.waitForTimeout(2500); c = await car(); ok(c && c.x > 350 && c.z > 11900 && c.z < 12100, 'cruising eastbound on the parkway', JSON.stringify(c));
// the airport: stand by the terminals and look at the runway as a jet comes in
await pg.evaluate(() => { window.__ctx.vehicles.dismount?.(); }); await pg.waitForTimeout(600);
await pg.evaluate(() => window.__game.teleport(1790, 0, 12000 + 12, 0, 0)); await pg.waitForTimeout(1500);
await pg.screenshot({ path: `${out}/belt-jfk.png` });
await pg.evaluate(() => window.__game.teleport(1800, 0, 12000 - 420, 0.8, 0.12)); await pg.waitForTimeout(1500);
await pg.screenshot({ path: `${out}/belt-runway.png` });
// walk to the westbound end → exit back to Coney
await pg.evaluate(() => window.__game.teleport(305, 0, 12000 - 7, Math.PI / 2, 0)); await pg.waitForTimeout(1800);
const p = await pg.evaluate(() => window.__ctx.player.position.toArray().map((v) => +v.toFixed(1)));
ok(p[2] < 0 && Math.abs(p[0] - 404) < 6, 'westbound exit → back on W 8th St', JSON.stringify(p));
ok(!errs.length, 'no page errors', JSON.stringify(errs));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
