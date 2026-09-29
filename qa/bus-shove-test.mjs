// Buses are solid: node qa/bus-shove-test.mjs — hijack a bus, point it at a traffic car and floor it: the car is shoved aside
// and crashes, the bus keeps going.
import pw from 'playwright-core';
const b = await pw.chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
const pg = await b.newPage({ viewport: { width: 1000, height: 600 } }); pg.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
await pg.goto(`http://localhost:${process.env.PORT || 8790}/?qa=1&map=coney&ai=0&time=day`, { timeout: 180000 }); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
await pg.evaluate(() => { window.__game.setState('playing'); window.__game.teleport(-80, 0, -300, 0, 0); }); await pg.waitForTimeout(2000);
const hb = await pg.evaluate(async () => { const T = window.__game.traffic; for (let i = 0; i < 1200; i++) { const b = T.buses().find((q) => q.state === 'dwell' && !q.riding); if (b) return b; await new Promise((r) => setTimeout(r, 100)); } return null; });
await pg.evaluate((id) => window.__game.traffic.toBusDriver(id), hb.id); await pg.waitForTimeout(500); await pg.keyboard.press('KeyF'); await pg.waitForTimeout(1500);
const r = await pg.evaluate(async () => { const V = window.__ctx.vehicles, mv = V.mounted; if (!mv || mv.spec.kind !== 'bus') return { err: 'no bus', kind: mv?.spec?.kind };
  const L = window.__ctx.world.traffic.cars().filter((c) => !c.bus && c.state === 'drive'); let best = null, bd = 1e9; for (const c of L) { const d = Math.hypot(c.x - mv.pos.x, c.z - mv.pos.z); if (d < bd) { bd = d; best = c; } }
  if (!best) return { err: 'no car' };
  // park the bus 9 m behind the car, pointed at it, and floor it
  const fx = -Math.sin(best.h), fz = -Math.cos(best.h); mv.pos.set(best.x - fx * 11, mv.pos.y, best.z - fz * 11); mv.heading = best.h; mv.vel.set(0, 0, 0); best.v = 0; best.hold = true;
  const c0 = [best.x, best.z]; V.qaDrive(1, 0, 3.5).catch?.(() => {}); await new Promise((r) => setTimeout(r, 3800));
  return { moved: +Math.hypot(best.x - c0[0], best.z - c0[1]).toFixed(1), busSpeed: +Math.hypot(mv.vel.x, mv.vel.z).toFixed(1), busTravel: +Math.hypot(mv.pos.x - (c0[0] - fx * 11), mv.pos.z - (c0[1] - fz * 11)).toFixed(1), state: best.state }; });
const pass = r.moved > 2 && r.busTravel > 5 && r.state === 'crashed'; console.log((pass ? 'PASS' : 'FAIL') + ' a hijacked bus shoves a car out of its way', JSON.stringify(r)); await b.close(); console.log(pass ? 'ALL PASS' : '1 FAILED'); process.exit(pass ? 0 : 1);
