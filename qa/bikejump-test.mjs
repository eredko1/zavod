// Bikes: Space (hold → release) jumps; Table Park has wide openings on every side — ride straight out. node qa/bikejump-test.mjs [out]
import { chromium } from 'playwright-core';
const out = process.argv[2] || '/tmp';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 900, height: 500 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
await pg.goto('http://localhost:8790/?qa=1&map=coney&ai=0&time=day', { timeout: 150000 }); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 150000 });
await pg.evaluate(() => window.__game.setState('playing'));
const st = () => pg.evaluate(() => window.__ctx.vehicles.qaState());
// a bike in the middle of Table Park, facing each way in turn; ride out
const P = await pg.evaluate(() => window.__game.hangout.parkInfo()); const cx = P.pos[0], cz = P.pos[2];
let outs = 0;
for (const [k, lx, lz] of [[0, 0, 1], [1, 1, 0], [2, -1, 0], [3, 0, -1]]) {   // local +z = the front gate, ±x the sides, −z the back
  const c = Math.cos(P.yaw), sn = Math.sin(P.yaw), wx = lx * c + lz * sn, wz = -lx * sn + lz * c, h = Math.atan2(-wx, -wz);
  await pg.evaluate(([x, z, h]) => { const V = window.__ctx.vehicles; V.dismount?.(); const bk = V.qaSpawn(x, z, h); V.mount(bk); }, [cx, cz, h]);
  await pg.waitForTimeout(300); await pg.evaluate(() => window.__ctx.vehicles.qaDrive(0.7, 0, 3.5)); await pg.waitForTimeout(3700);
  const s = await st(); const d = s ? Math.hypot(s.x - cx, s.z - cz) : 0; if (d > (lx ? P.hx : P.hz) + 2) outs++;   // past the fence line (the gate's parked bikes may stop you after) console.log('dir', k, 'rode', d.toFixed(1), 'm');
}
ok(outs === 4, 'ride out of Table Park through the wide openings', `${outs}/4 directions`);
// jump: on a bike, hold Space ~0.5 s, release
await pg.evaluate(() => { const V = window.__ctx.vehicles; V.dismount?.(); const p = window.__ctx.player.position; const bk = V.qaSpawn(p.x, p.z, 0); V.mount(bk); });
await pg.waitForTimeout(400); const y0 = (await st()).y;
await pg.keyboard.down('Space'); await pg.waitForTimeout(500); await pg.keyboard.up('Space');
let maxY = y0, air = false; for (let i = 0; i < 20; i++) { const s = await st(); maxY = Math.max(maxY, s.y); air = air || s.air; await pg.waitForTimeout(40); }
ok(air && maxY - y0 > 0.6, 'Space (hold → release) jumps the bike', `+${(maxY - y0).toFixed(2)} m`);
await pg.waitForTimeout(1500); const s2 = await st(); ok(s2 && !s2.air, 'lands again', JSON.stringify({ y: s2?.y, air: s2?.air }));
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
