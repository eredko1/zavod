// Jet skis on the Coney ocean: find one, steal it (F), throttle + turn on the swell (moves, rides the wave height, pitch/roll
// follow the sea), Space charge-jump off the water, try to drive up the beach (stalls on the sand), radio plays while riding,
// and a second browser sees the rider on the jet ski. Also checks window.__game.ocean. node qa/jetski-test.mjs [outdir]
import { chromium } from 'playwright-core';
const out = process.argv[2] || '/tmp'; const room = 'js' + Math.random().toString(36).slice(2, 6);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const errs = [];
const mk = async (n, mp) => { const p = await b.newPage({ viewport: { width: 960, height: 540 } }); p.on('pageerror', (e) => errs.push(n + ': ' + e.message));
  await p.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
  await p.goto(`http://localhost:8790/?qa=1&map=coney&ai=0&time=day${mp ? `&mp=1&room=${room}&name=${n}` : ''}`, { timeout: 150000 });
  await p.waitForFunction((mp) => window.__game?.ready && (!mp || window.__ctx.net?.connected), mp, { timeout: 150000 }); await p.evaluate(() => window.__game.setState('playing')); return p; };
const A = await mk('ALPHA', true);
const st = () => A.evaluate(() => { const V = window.__ctx.vehicles, s = V.qaState(); if (s) s.wave = window.__game.ocean.waveHeight(s.x, s.z); return s; });

// ocean hooks
const oi = await A.evaluate(() => { const O = window.__game.ocean; if (!O) return null; const i = O.info(); const h1 = O.waveHeight(0, 400); return { i, h1, finite: [O.waveHeight(-300, 350), O.waveHeight(100, 600), O.waveHeight(0, 300)].every(Number.isFinite) }; });
ok(oi && oi.finite && oi.i.waves.length >= 4 && Math.abs(oi.h1 - oi.i.level) < 1.5, 'window.__game.ocean {waveHeight, info}', JSON.stringify(oi?.i?.waves?.map((w) => w.L)));

// find + steal
const skis = await A.evaluate(() => window.__ctx.vehicles.qaJetskis());
ok(skis.length >= 4, 'jet skis moored along the beach / by the pier', `${skis.length}: ` + skis.map((s) => `${s.x.toFixed(0)},${s.z.toFixed(0)}`).join(' '));
const s0 = skis.find((s) => Math.abs(s.x + 65) < 5) || skis[0];
await A.evaluate((s) => { const W = window.__ctx.world, x = s.x, z = s.z - 2.7; window.__game.teleport(x, W.groundHeight(x, z), z, Math.PI, -0.2); }, s0);
await A.waitForTimeout(500);
ok(await A.evaluate(() => window.__ctx.vehicles.nearBike?.spec?.kind === 'jetski'), 'wading up to it: F prompt targets the jet ski');
await A.keyboard.press('KeyF'); await A.waitForTimeout(400);
let s = await st(); ok(s?.kind === 'jetski', 'F steals / mounts the jet ski', JSON.stringify({ kind: s?.kind }));
ok(s && Math.abs(s.y - s.wave) < 0.4, 'floats at the wave height', `y ${s?.y.toFixed(2)} wave ${s?.wave.toFixed(2)}`);

// throttle out to sea (heading pi = +z), sample height / pitch / roll
await A.evaluate(() => { window.__ctx.vehicles.chase = true; });
A.evaluate(() => window.__ctx.vehicles.qaDrive(1, 0, 4)).catch(() => {});
const P = [], dev = [];
for (let i = 0; i < 18; i++) { await A.waitForTimeout(220); const q = await st(); P.push(q); if (!q.air) dev.push(Math.abs(q.y - q.wave)); }
await A.waitForTimeout(200); s = await st();
const moved = Math.hypot(s.x - s0.x, s.z - s0.z), pr = (k) => Math.max(...P.map((q) => q[k])) - Math.min(...P.map((q) => q[k]));
ok(moved > 20 && s.speed > 8, 'throttle: planes out to sea', `${moved.toFixed(1)} m, ${s.speed.toFixed(1)} m/s`);
ok(Math.max(...dev) < 0.45, 'stays on the water surface (± wave)', `max |y - wave| ${Math.max(...dev).toFixed(2)} m`);
ok(pr('pitch') > 0.01 && pr('roll') > 0.005, 'pitch / roll follow the swell', `pitch range ${pr('pitch').toFixed(3)} roll range ${pr('roll').toFixed(3)} y range ${pr('y').toFixed(2)}`);
await A.screenshot({ path: `${out}/jetski-ride.png` });
// turn
const h0 = s.heading; let lean = 0;
A.evaluate(() => window.__ctx.vehicles.qaDrive(1, 1, 2)).catch(() => {});
for (let i = 0; i < 8; i++) { await A.waitForTimeout(220); lean = Math.max(lean, Math.abs((await st()).lean)); }
s = await st(); ok(Math.abs(s.heading - h0) > 0.6 && lean > 0.05, 'steers + leans into the turn like the bike', `dHeading ${(s.heading - h0).toFixed(2)} lean ${lean.toFixed(3)}`);
const fx = await A.evaluate(() => window.__ctx.vehicles.qaFx());
ok(fx && fx.spray, 'spray / wake FX while riding', JSON.stringify(fx));
// radio
await A.waitForTimeout(1500);
const radio = await A.evaluate(() => ({ now: window.__ctx.world.radio?.now || null, qa: window.__ctx.world.radio?.qa?.() }));
ok(radio.now && radio.qa?.some((t) => t.playing), 'Luna Park Radio plays on the jet ski', JSON.stringify(radio.now));

// second browser sees the rider on the jet ski (before the jump / beach tests, while riding in open water)
const B = await mk('BRAVO', true);
A.evaluate(() => window.__ctx.vehicles.qaDrive(0.5, 0.2, 8)).catch(() => {});
const ap = await A.evaluate(() => { const p = window.__ctx.vehicles.mounted.pos; return [p.x, p.z]; });
await B.evaluate((ap) => { const W = window.__ctx.world, x = ap[0], z = Math.min(385, ap[1] - 25); window.__game.teleport(x, W.groundHeight(x, z), z, Math.PI, -0.05); }, ap);
await B.waitForTimeout(3500);
const vis = await B.evaluate(() => { let ski = false; window.__ctx.scene.traverse((o) => { if (o.name === 'jetski' && o.parent?.parent === window.__ctx.scene) ski = true; }); return { ski, peers: window.__ctx.net.qaPeers?.() }; });
ok(vis.ski, 'BRAVO sees a remote jet ski');
ok(vis.peers?.some((p) => p.veh === 'jetski' && p.riderVisible), 'BRAVO sees the rider on it', JSON.stringify(vis.peers));
await B.screenshot({ path: `${out}/jetski-bravo.png` });
await B.close();

// jump: hold Space, release while riding (keyboard; cancel the scripted drive first)
await A.evaluate(() => window.__ctx.vehicles.qaDrive(0, 0, 0.05)); await A.waitForTimeout(200);
await A.evaluate(() => { const V = window.__ctx.vehicles; if (V.mounted) V.mounted.heading = Math.PI; });
await A.keyboard.down('KeyW'); await A.waitForTimeout(1500);
const wy0 = (await st()).wave;
await A.keyboard.down('Space'); await A.waitForTimeout(500); await A.keyboard.up('Space');
let maxH = 0, air = false; for (let i = 0; i < 25; i++) { const q = await st(); maxH = Math.max(maxH, q.y - q.wave); air = air || q.air; await A.waitForTimeout(40); }
await A.keyboard.up('KeyW');
ok(air && maxH > 0.6, 'Space (hold → release) jumps off the water', `+${maxH.toFixed(2)} m over the surface (wave ${wy0.toFixed(2)})`);
await A.waitForTimeout(1600); s = await st(); ok(!s.air && Math.abs(s.y - s.wave) < 0.45, 'lands back on the water', JSON.stringify({ air: s.air, dy: +(s.y - s.wave).toFixed(2) }));

// the beach: aim at the shore (-z) at full throttle; it must stall on the sand, not cross the beach
await A.evaluate(() => { const V = window.__ctx.vehicles, v = V.mounted; v.heading = 0; v.vel.set(0, 0, 0); });
A.evaluate(() => window.__ctx.vehicles.qaDrive(1, 0, 40)).catch(() => {});
for (let i = 0; i < 60; i++) { await A.waitForTimeout(500); s = await st(); if (i > 4 && s.speed < 0.6) break; }
await A.evaluate(() => window.__ctx.vehicles.qaDrive(0, 0, 0.05)); await A.waitForTimeout(200);
s = await st(); const zw = await A.evaluate((x) => window.__game.ocean.shoreZ(x), s.x);
ok(s.speed < 1.5 && s.z > zw - 20 && (s.beached || s.depth < 0.3), 'drives onto the sand → stalls at the waterline', JSON.stringify({ z: +s.z.toFixed(1), shoreZ: +zw.toFixed(1), speed: +s.speed.toFixed(2), beached: s.beached }));
await A.screenshot({ path: `${out}/jetski-beached.png` });
// dismount: F, on your feet
await A.keyboard.press('KeyF'); await A.waitForTimeout(300);
ok(await A.evaluate(() => !window.__ctx.vehicles.mounted && !window.__ctx.player.mounted), 'F gets off');
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 4)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
