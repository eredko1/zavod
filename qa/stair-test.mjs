// 19th floor: fire stair B down to 16 (walkable landings/flights), the stuck roof door (shoulder it open), P = take a leak.
// node qa/stair-test.mjs [outdir]
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const out = process.argv[2] || '/tmp';
const b = await chromium.launch({ ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' }), headless: true, args: ['--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 800, height: 450 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
await pg.goto('http://localhost:8790/?qa=1&map=coney&ai=0&time=day', { timeout: 150000 }); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 150000 });
await pg.evaluate(() => { window.__game.setState('playing'); window.__ctx.camera.getObjectByName('viewmodel').visible = false; });
const pos = () => pg.evaluate(() => window.__ctx.player.position.toArray().map((v) => +v.toFixed(2)));
// main.js caps frame dt: slow rendering advances less game time than a wall-clock sleep.
const waitGame = async (seconds) => {
  const until = await pg.evaluate((s) => window.__ctx.time.elapsed + s, seconds);
  await pg.waitForFunction((t) => window.__ctx.time.elapsed >= t, until, { timeout: 30000 });
};
const sb = await pg.evaluate(() => window.__game.hangout.stairB()); ok(!!sb, 'tower has stair B', JSON.stringify(sb));
if (sb) {
  // stand on the top landing, and on the bottom one: nobody falls through
  await pg.evaluate((t) => window.__game.teleport(t[0], t[1] + 0.05, t[2], 0, 0), sb.top); await waitGame(1.2);
  let p = await pos(); ok(Math.abs(p[1] - sb.top[1]) < 0.3, 'top landing holds (floor 19)', JSON.stringify(p));
  await pg.screenshot({ path: `${out}/stair-top.png` });
  await pg.evaluate((t) => window.__game.teleport(t[0], t[1] + 0.05, t[2], Math.PI, 0), sb.bottom); await waitGame(1.2);
  p = await pos(); ok(Math.abs(p[1] - sb.bottom[1]) < 0.3, `bottom landing holds (${sb.floors} floors down)`, JSON.stringify(p));
  await pg.screenshot({ path: `${out}/stair-bottom.png` });
  // walk: from the bottom landing, hold W toward the stairs for a few seconds and climb
  const y0 = p[1]; await pg.evaluate((y) => { window.__ctx.player.yaw = y; }, sb.up);
  await pg.keyboard.down('KeyW'); await waitGame(1.8); await pg.keyboard.up('KeyW');
  p = await pos(); ok(p[1] > y0 + 1.0, 'can climb a flight', `y ${y0} → ${p[1]}`);
}
// roof door: blocked, 4 shoves open it
const rd = await pg.evaluate(() => window.__game.hangout.roofDoor());
ok(rd && !rd.open, 'roof door starts shut', JSON.stringify(rd));
await pg.evaluate((d) => { const a = d.inside, o = d.outside; window.__game.teleport(a[0], a[1] + 0.05, a[2], Math.atan2(-(o[0] - a[0]), -(o[2] - a[2])), 0); }, rd); await waitGame(0.8);
await pg.keyboard.down('KeyW'); await waitGame(1.2); await pg.keyboard.up('KeyW');
let p = await pos(); const dOut = (q) => Math.hypot(q[0] - rd.outside[0], q[2] - rd.outside[2]);
ok(dOut(p) > 1.0, 'shut door blocks the way', `${dOut(p).toFixed(2)} m from outside`);
for (let i = 0; i < 4; i++) { await pg.keyboard.press('KeyF'); await waitGame(0.35); }
ok((await pg.evaluate(() => window.__game.hangout.roofDoor().open)), 'four shoves bust it open');
await waitGame(0.6); await pg.keyboard.down('KeyW'); await waitGame(1.5); await pg.keyboard.up('KeyW');
p = await pos(); const dIn = Math.hypot(p[0] - rd.inside[0], p[2] - rd.inside[2]); ok(dIn > 2.5 && Math.abs(p[1] - rd.outside[1]) < 0.6, 'walk out onto the roof', `${dIn.toFixed(2)} m past the door`);
await pg.screenshot({ path: `${out}/roof-door.png` });
// take a leak
await pg.keyboard.press('KeyP'); await waitGame(1.6); await pg.screenshot({ path: `${out}/leak.png` });
const pud = await pg.evaluate(() => { let n = 0; window.__ctx.scene.traverse((o) => { if (o.isMesh && o.geometry?.type === 'CircleGeometry' && o.visible && o.material?.color?.getHex?.() === 0xd9c23a) n++; }); return n; });
ok(pud >= 1, 'P leaves a puddle', `${pud}`);
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
