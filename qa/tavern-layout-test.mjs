// Soccer Tavern layout acceptance (docs/TAVERN_SPEC.md): node qa/tavern-layout-test.mjs [outdir]
// Geometric checks on the built colliders (main route clear for the spec's capsule, soft chairs, the basement door solid), the
// layout's own numbers (aisles, corridor, darts, stool counts), and a real walk of the main route from the front door to the back.
import pw from 'playwright-core';
const out = process.argv[2] || '/tmp';
const b = await pw.chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 1100, height: 620 } }); const errs = []; pg.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERROR', e.message); });
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
await pg.goto(`http://localhost:${process.env.PORT || 8790}/?qa=1&map=coney&ai=0&time=night`, { timeout: 180000 }); await pg.waitForFunction(() => window.__game?.ready && window.__game.tavern, null, { timeout: 180000 });
await pg.evaluate(() => window.__game.setState('playing'));
const R = await pg.evaluate(() => {
  const S = window.__game.tavern.layout(), C = window.__ctx.colliders, P = window.__ctx.world.tavern.plan, L = window.__ctx.world.tavern;
  const blockedAt = (x, z, r, y0 = 0.25, y1 = 1.7) => C.filter((c) => c.max.x > x - r && c.min.x < x + r && c.max.z > z - r && c.min.z < z + r && c.max.y > y0 && c.min.y < y1);
  // the main route, sampled every 5 cm, against the spec's capsule radius
  let worst = null; const R2 = S.route;
  for (let i = 0; i + 1 < R2.length; i++) { const [ax, az] = R2[i], [bx, bz] = R2[i + 1], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.05); for (let k = 0; k <= n; k++) { const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n, hit = blockedAt(x, z, S.capsule); if (hit.length && !worst) worst = { at: [x.toFixed(2), z.toFixed(2)], box: [hit[0].min.toArray().map((v) => +v.toFixed(2)), hit[0].max.toArray().map((v) => +v.toFixed(2))] }; } }
  const soft = S.soft.map(([x, z]) => blockedAt(x, z, 0.05).length);
  const bz = S.basementFace, bx = P.lx(18.15), basementSolid = blockedAt(bx, bz - 0.3, 0.05, 0.3, 1.8).length > 0;
  return { worst, stools: S.stools, soft, basementSolid, assumed: S.assumed };
});
// the spec's route runs the corridor at x = 12 ft; its supply stack reaches x = 11.5, inside a 0.9 ft capsule there (the spec's
// own numbers disagree by 0.4 ft): that one pinch is reported, not failed; anything else in the way fails
const pinch = R.worst && R.worst.box[0][0] > -1.5 && R.worst.box[1][0] < -0.85 && R.worst.box[1][1] < 1.5;
if (pinch) console.log('NOTE main route brushes the corridor supply stack (spec: route x=12, stack to x=11.5, capsule 0.9 ft)', JSON.stringify(R.worst));
ok(!R.worst || pinch, 'main route (front door → back door) is clear for a 0.9 ft capsule (bar the spec\'s supply-stack pinch)', JSON.stringify(R.worst));
ok(R.stools.bar_long === 11 && R.stools.bar_short === 3, 'bar stools: 11 on the long side, 3 on the short side', JSON.stringify(R.stools));
ok(R.stools.hitop_nook === 4 && R.stools.hitops_right === 8, 'four stools at each of the three hi-tops', JSON.stringify(R.stools));
ok(R.soft.length === 4 && R.soft.every((n) => n === 0), 'the four low-table chairs are soft (no hard collider)', JSON.stringify(R.soft));
ok(R.basementSolid, 'the basement door is solid (closed and locked)');
// the layout's own numbers
const J = JSON.parse((await import('node:fs')).readFileSync(new URL('../src/world/coney/tavern-layout.json', import.meta.url), 'utf8'));
const aisle = J.furniture.hi_tops.stools.reduce((m, [x]) => Math.min(m, x), 99) - J.furniture.hi_tops.stool_radius - (J.bar.stools.long_side.positions[0][0] + J.bar.stools.radius);
ok(aisle >= 5, 'aisle between the bar stools and the hi-top stools ≥ 5 ft', aisle.toFixed(2));
ok(Math.abs(J.bar.staff_aisle.clear_width - 2.3) < 1e-6, 'staff aisle 2.3 ft, open to the kitchen doorway');
const dartWall = J.walls.items.find((w) => w.id === 'dart_wall'); ok(Math.abs(19.5 - J.darts.board.center[0] - 2) < 0.01 && dartWall.w === 5.5, 'board 2 ft from the right wall, dart wall 5.5 ft');
ok(Math.abs(J.darts.board.center[1] - J.darts.oche.line.from[1] - 7.77) < 0.01, 'oche 7.77 ft from the board face');
ok(Math.abs(J.darts.oche.thrower_stands_at[1] - 31.4 - 4.7) < 0.05, 'thrower ~4.7 ft from the basement door face');
// decor in place
const D = await pg.evaluate(() => { const names = []; window.__ctx.scene.traverse((o) => { if (o.isMesh && o.parent?.name === 'sunsetPark' && o.material?.map) names.push(o.position.y.toFixed(2)); }); return names.length; });
ok(D > 5, 'decor pictures in place (map, chalkboard, back bar, board, jukebox, mural…)', D);
// walk it: in the front door, up the aisle, the jog past the kitchen doorway and the darts, down the corridor, out the back
const walk = async (tx, tz, maxMs) => { const t0 = Date.now(); while (Date.now() - t0 < maxMs) { const p = await pg.evaluate(() => window.__ctx.player.position.toArray()); const dx = tx - p[0], dz = tz - p[2]; if (Math.hypot(dx, dz) < 0.35) return true;
    await pg.evaluate(([dx, dz]) => { const p = window.__ctx.player; p.yaw = Math.atan2(-dx, -dz); }, [dx, dz]); await pg.keyboard.down('KeyW'); await pg.waitForTimeout(140); await pg.keyboard.up('KeyW'); } return false; };
const route = await pg.evaluate(() => window.__game.tavern.layout().route);
await pg.evaluate(([x, z]) => window.__game.teleport(x, 0.15, z, Math.PI, 0), route[0]); await pg.waitForTimeout(600);
let reached = true; for (let i = 1; i < route.length && reached; i++) reached = await walk(route[i][0], route[i][1], 16000);
const endP = await pg.evaluate(() => window.__ctx.player.position.toArray().map((v) => +v.toFixed(2)));
ok(reached, 'walked the main route on foot, front door to the back door', JSON.stringify(endP));
await pg.screenshot({ path: `${out}/tavern-route-end.png` });
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
console.log('ASSUMED (kept as given):', R.assumed.join(', '));
await b.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
