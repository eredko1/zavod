// NYC (Map Lab pipeline) on the stand-in GLB: node qa/nyc-test.mjs [outdir]. Collision, ground and surfaces come from meshes
// (world/meshcollide.js): spawn on walkable ground, a building wall stops you, a 15 cm curb steps up, the ramp takes you onto the
// 3 m deck, surface classes map to footstep sounds, bullets hit walls, the edge of the built area stops you.
import pw from 'playwright-core';
const { chromium } = pw;
const out = process.argv[2] || '/tmp';
const URL = `http://localhost:${process.env.PORT || 8790}/?qa=1&map=nyc&ai=0&time=day`;
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 1200, height: 680 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto(URL, { timeout: 240000 }); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
await pg.evaluate(() => window.__game.setState('playing')); await pg.waitForTimeout(800);
const P = () => pg.evaluate(() => window.__ctx.player.position.toArray().map((v) => +v.toFixed(2)));
const tp = (x, y, z, yaw = 0) => pg.evaluate(([x, y, z, yaw]) => window.__game.teleport(x, y, z, yaw, 0), [x, y, z, yaw]);
const walk = async (key, ms) => { await pg.keyboard.down(key); await pg.waitForTimeout(ms); await pg.keyboard.up(key); await pg.waitForTimeout(250); };
const W = await pg.evaluate(() => { const w = window.__ctx.world; return { spawns: w.playerSpawns.map((s) => s.toArray()), surf: w.playerSpawns.map((s) => w.surfaceAt(s.clone().setY(s.y + 0.05))) }; });
ok(W.spawns.length >= 4 && W.surf.every((s) => s === 'concrete' || s === 'ground'), 'spawns chosen by rule on walkable ground', JSON.stringify(W));
const surf = await pg.evaluate(() => { const w = window.__ctx.world, T = window.__ctx.THREE; return { road: w.surfaceAt(new T.Vector3(0, 0.1, 0)), sidewalk: w.surfaceAt(new T.Vector3(-8, 0.3, -30)), deck: w.surfaceAt(new T.Vector3(97, 3.2, 23)), water: w.surfaceAt(new T.Vector3(0, 0, 116)) }; });
ok(surf.road === 'concrete' && surf.sidewalk === 'concrete' && surf.deck === 'metal' && surf.water === 'water', 'surface classes → footstep surfaces', JSON.stringify(surf));
// the curb: stand in the street next to the sidewalk, walk onto it
await tp(-5.4, 0, -30, Math.PI / 2); await pg.waitForTimeout(400);   // facing −x… walk toward the sidewalk at x < −6
await walk('KeyW', 900); let p = await P(); ok(Math.abs(p[1] - 0.15) < 0.05, 'a 15 cm curb steps up onto the sidewalk', JSON.stringify(p));
// a building: walk north into the wall line of the block's buildings
const wall = await pg.evaluate(() => { const T = window.__ctx.THREE, r = new T.Raycaster(new T.Vector3(-30, 1.5, -40), new T.Vector3(0, 0, -1)); const h = r.intersectObjects(window.__ctx.raycastTargets, false).find((q) => q.object.userData.collisionRole === 'blocking'); return h ? h.point.toArray() : null; });
if (wall) { await tp(wall[0], 0.2, wall[2] + 4, 0); await pg.waitForTimeout(400); await walk('KeyW', 2500); p = await P(); ok(p[2] > wall[2] - 0.1, 'a building wall stops you', JSON.stringify({ wall: wall.map((v) => +v.toFixed(1)), p })); }
else ok(false, 'found a building wall to walk into');
// the ramp up to the deck (east), then along the deck
await tp(60, 0.05, 23, -Math.PI / 2); await pg.waitForTimeout(400); await walk('KeyW', 6500); p = await P();
ok(p[1] > 2.8 && p[0] > 84, 'up the ramp onto the 3 m deck', JSON.stringify(p));
await pg.screenshot({ path: `${out}/nyc-deck.png` });
// bullets hit a wall
const shot = await pg.evaluate(async () => { const T = window.__ctx.THREE; window.__game.teleport(-30, 0.2, -36, 0, 0); await new Promise((r) => setTimeout(r, 300)); let hit = null; window.__ctx.bus.on('impact', (d) => { hit = d; }); window.__game.fire(1); await new Promise((r) => setTimeout(r, 300)); return hit ? { surface: hit.surface } : null; });
ok(!!shot, 'a bullet hits a building', JSON.stringify(shot));
// the edge of the built area
await tp(110, 0.2, -100, -Math.PI / 2); await pg.waitForTimeout(300); await walk('KeyW', 3000); p = await P();
const bx = await pg.evaluate(() => window.__ctx.world.bounds.max.x); ok(p[0] <= bx + 0.01, 'the edge of the built area stops you', JSON.stringify({ p, edge: bx }));
ok(errs.length === 0, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
