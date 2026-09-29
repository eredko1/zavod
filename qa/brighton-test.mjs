// Brighton Beach: node qa/brighton-test.mjs [outdir] — walk the boardwalk east past Coney's old edge, drive east along the avenue
// into Brighton Beach Ave, ride a jet ski east through the ocean to Brighton; ground heights on the avenue / boardwalk / sand.
import pw from 'playwright-core';
const out = process.argv[2] || '/tmp';
const b = await pw.chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 1100, height: 620 } }); const errs = []; pg.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERROR', e.message); });
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
await pg.goto(`http://localhost:${process.env.PORT || 8790}/?qa=1&map=coney&ai=0&time=day`, { timeout: 180000 }); await pg.waitForFunction(() => window.__game?.ready && window.__game.brighton, null, { timeout: 180000 });
await pg.evaluate(() => window.__game.setState('playing'));
const pos = () => pg.evaluate(() => window.__ctx.player.position.toArray().map((v) => +v.toFixed(1)));
// ground
const gh = await pg.evaluate(() => { const G = window.__game.brighton; return { ave: G.gh(1500, G.ave.z), walk: G.gh(1500, G.ave.z + 16), board: G.gh(1500, 149), sand: G.gh(1500, 260) }; });
ok(gh.ave === 0 && gh.walk > 0.1 && gh.board === 0 && gh.sand < -1, 'ground: avenue, kerb, boardwalk, beach', JSON.stringify(gh));
// on foot: the boardwalk east across x = 440
await pg.evaluate(() => window.__game.teleport(415, 0, 149, -Math.PI / 2, 0)); await pg.waitForTimeout(600);
await pg.keyboard.down('ShiftLeft'); await pg.keyboard.down('KeyW'); await pg.waitForTimeout(9000); await pg.keyboard.up('KeyW'); await pg.keyboard.up('ShiftLeft');
let p = await pos(); ok(p[0] > 470, 'walked east along the boardwalk past the old map edge', JSON.stringify(p));
// by car: the avenue from the Surf Ave end into Brighton Beach Ave
await pg.evaluate(() => { const V = window.__ctx.vehicles; const c = V.spawnCar(1030, -40, -Math.PI / 2, 'sedan', 0x2b3f73, 0); V.mount(c); }); await pg.waitForTimeout(700);
pg.evaluate(() => window.__ctx.vehicles.qaDrive(1, 0, 14)).catch(() => {}); await pg.waitForTimeout(14500);
const car = await pg.evaluate(() => window.__ctx.vehicles.qaState()); ok(car && car.x > 1300, 'drove east up Brighton Beach Ave', JSON.stringify(car && [car.x.toFixed(0), car.z.toFixed(0)]));
await pg.screenshot({ path: `${out}/brighton-drive.png` });
await pg.evaluate(() => window.__ctx.vehicles.dismount?.()); await pg.waitForTimeout(500);
// jet ski: from off Coney east through the ocean
const js = await pg.evaluate(async () => { const V = window.__ctx.vehicles; const j = V.list.find((b) => b.spec.water); if (!j) return null; j.pos.set(470, j.pos.y, 500); j.heading = -Math.PI / 2; window.__game.teleport(470, 0, 500, -Math.PI / 2, 0); await new Promise((r) => setTimeout(r, 300)); V.qaMount(); return !!V.mounted && V.mounted.spec.water; });
ok(js, 'on a jet ski off Coney');
if (js) { pg.evaluate(() => window.__ctx.vehicles.qaDrive(1, 0, 24)).catch(() => {}); await pg.waitForTimeout(24500); const s = await pg.evaluate(() => window.__ctx.vehicles.qaState()); ok(s && s.x > 850, 'jet skied east toward Brighton', JSON.stringify(s && [s.x.toFixed(0), s.z.toFixed(0)])); await pg.screenshot({ path: `${out}/brighton-jetski.png` }); }
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
