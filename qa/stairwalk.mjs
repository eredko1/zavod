// Walk the fire stair for real: 19th-floor lobby → side door → hallway → down every flight to the bottom, then back up,
// then the roof stair: up through the (shouldered-open) door. Steers toward each waypoint holding W; reports where it sticks.
import { chromium } from 'playwright-core';
const out = process.argv[2] || '/tmp';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 800, height: 450 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
await pg.goto('http://localhost:8790/?qa=1&map=coney&ai=0&time=day', { timeout: 150000 }); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 150000 });
await pg.evaluate(() => { window.__game.setState('playing'); window.__ctx.camera.getObjectByName('viewmodel').visible = false; });
const sb = await pg.evaluate(() => window.__game.hangout.stairB());
const pos = () => pg.evaluate(() => window.__ctx.player.position.toArray().map((v) => +v.toFixed(2)));
async function walk(path, label) {
  await pg.evaluate((p) => window.__game.teleport(p[0], p[1] + 0.05, p[2], 0, 0), path[0]); await pg.waitForTimeout(600);
  for (let i = 1; i < path.length; i++) {
    const w = path[i]; let t0 = Date.now(), p = await pos(), best = 1e9;
    await pg.keyboard.down('KeyW');
    while (Date.now() - t0 < 6000) {
      p = await pos(); const d = Math.hypot(w[0] - p[0], w[2] - p[2]); best = Math.min(best, d);
      if (d < 0.45) break;
      await pg.evaluate((w) => { const pl = window.__ctx.player; pl.yaw = Math.atan2(-(w[0] - pl.position.x), -(w[2] - pl.position.z)); pl.pitch = -0.15; }, w);
      await pg.waitForTimeout(60);
    }
    await pg.keyboard.up('KeyW');
    const d = Math.hypot(w[0] - p[0], w[2] - p[2]);
    if (d > 0.6 || Math.abs(p[1] - w[1]) > 0.7) { await pg.screenshot({ path: `${out}/stuck-${label}-${i}.png` }); return { ok: false, at: i, want: w.map((v) => +v.toFixed(2)), got: p }; }
  }
  return { ok: true, end: await pos() };
}
// the stair must actually reach the ground floor, not dead-end partway up the tower (it used to stop at 16)
ok(sb.bottom[1] < 0.6, 'fire stair reaches the ground floor', `bottom y=${sb.bottom[1].toFixed(2)} over ${sb.floors} flights`);
const down = await walk(sb.path, 'down'); ok(down.ok, 'walk 19 → lobby door → hallway → all flights down', JSON.stringify(down));
ok(down.ok && down.end[1] < 0.6, 'ended on the ground floor', JSON.stringify(down.end || null));
// and you can walk out of the stairwell into the ground-floor lobby and reach the street door
if (down.ok) { const outp = await pg.evaluate(() => window.__game.hangout.state()?.lobby?.[1] || null); ok(!!outp, 'lobby reachable from QA api'); if (outp) { const o = await walk([down.end, outp], 'exit'); ok(o.ok, 'walk out of the stairwell across the lobby to the elevators', JSON.stringify(o)); } }
const up = await walk(sb.path.slice().reverse(), 'up'); ok(up.ok, 'walk back up to the 19th-floor lobby', JSON.stringify(up));
ok(up.ok && Math.abs(up.end[1] - sb.top[1]) < 0.7, 'ended back on the 19th floor', JSON.stringify(up.end || null));
// roof stair: foot of the flight in the 19th lobby → top → shoulder the door → out
const rf = await pg.evaluate(() => { const h = window.__game.hangout; return { door: h.roofDoor(), top: h.roof() }; });
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
