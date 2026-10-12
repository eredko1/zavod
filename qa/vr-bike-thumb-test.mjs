// VR bike riding + the left-thumb snap turn: node qa/vr-bike-thumb-test.mjs [outdir]
//  1. the thumb microgesture detector (src/vr/thumb.js) on synthetic joint poses: forward / back swipes along the index turn,
//     with a cooldown; pinch-stick walking (approach, drag, release), a resting thumb, a slow creep and a busy hand don't
//  2. the ride shaping (src/vr/ride.js): deadzone, less steer at speed, a small push holds a walking pace
//  3. in the game (Luna Park, Coney): a synthetic rider with shaky hands follows a real Luna Park path through the new mapping and
//     stays on it (the old mapping, same rider, for comparison), then in VR (IWER) the bike's lean is capped and the view never rolls
import pw from 'playwright-core';
import { readFileSync } from 'node:fs';
import { thumbState, thumbSwipe, THUMB } from '../src/vr/thumb.js';
import { rideState, shapeRide, RIDE } from '../src/vr/ride.js';
const out = process.argv[2] || '/tmp';
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };

// ---- 1. the thumb detector ----
const HZ = 72, L = 0.075;   // the left index: knuckle (proximal phalanx) at the origin, tip 7.5 cm ahead
// a hand pose: thumb at s m along the index and lat m to its side; the whole hand moved by `move` and turned by `yaw`
const pose = (s, lat, move = [0, 0, 0], yaw = 0) => { const c = Math.cos(yaw), n = Math.sin(yaw), w = ([x, y, z]) => [x * c + z * n + move[0], y + move[1], -x * n + z * c + move[2]];
  return { thumb: w([lat, 0.004, -s]), prox: w([0, 0, 0]), tip: w([0, 0, -L]) }; };
/** play keyframes [t, s, lat, busy?, move?] at HZ through a fresh detector; returns the turns fired */
function play(keys, noise = 0) {
  const st = thumbState(), fired = []; let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  const T = keys[keys.length - 1][0];
  for (let i = 0; i <= T * HZ; i++) { const t = i / HZ; let k = 0; while (k < keys.length - 2 && keys[k + 1][0] <= t) k++;
    const a = keys[k], b = keys[k + 1] || a, f = b[0] > a[0] ? Math.min(1, (t - a[0]) / (b[0] - a[0])) : 0, lerp = (x, y) => x + (y - x) * f;
    const mv = (a[4] || [0, 0, 0]).map((v, j) => lerp(v, (b[4] || [0, 0, 0])[j]));
    const d = thumbSwipe(st, pose(lerp(a[1], b[1]) + rnd() * noise, lerp(a[2], b[2]) + rnd() * noise, mv, t * 0.3), t + 10, !!a[3]); if (d) fired.push(d); }
  return fired;
}
const ON = 0.018, OFF = 0.06;   // the thumb on the side of the index / away from it
let f = play([[0, 0.02, OFF], [0.3, 0.02, ON], [0.5, 0.02, ON], [0.65, 0.045, ON], [0.9, 0.045, ON], [1.1, 0.045, OFF]]);
ok(f.length === 1 && f[0] === 1, 'thumb: a swipe towards the fingertip turns right, once', JSON.stringify(f));
f = play([[0, 0.045, OFF], [0.3, 0.045, ON], [0.5, 0.045, ON], [0.65, 0.015, ON], [0.9, 0.015, ON], [1.1, 0.015, OFF]]);
ok(f.length === 1 && f[0] === -1, 'thumb: a swipe back towards the knuckle turns left', JSON.stringify(f));
f = play([[0, 0.02, OFF], [0.2, 0.02, ON], [0.3, 0.02, ON], [0.42, 0.045, ON], [0.5, 0.045, OFF], [0.6, 0.02, OFF], [0.7, 0.02, ON], [0.82, 0.045, ON], [0.9, 0.045, OFF], [1.5, 0.02, OFF], [1.6, 0.02, ON], [1.72, 0.045, ON], [1.9, 0.045, OFF]]);
ok(f.length === 2, `thumb: a second swipe inside the ${THUMB.COOLDOWN} s cooldown is ignored, the next one after it turns`, JSON.stringify(f));
f = play([[0, 0.02, OFF], [0.3, 0.02, ON], [0.5, 0.02, ON], [0.62, 0.045, ON], [0.75, 0.02, ON], [0.9, 0.045, ON], [1.1, 0.045, OFF]]);
ok(f.length === 1, 'thumb: rubbing back and forth without lifting is one turn', JSON.stringify(f));
f = play([[0, 0.03, OFF], [0.3, 0.03, ON], [3.3, 0.03, ON], [3.5, 0.03, OFF]], 0.003);
ok(f.length === 0, 'thumb: resting on the finger with 3 mm of tracking jitter: no turn', JSON.stringify(f));
f = play([[0, 0.02, OFF], [0.3, 0.02, ON], [2.3, 0.05, ON], [2.5, 0.05, OFF]]);
ok(f.length === 0, 'thumb: a slow creep along the finger (3 cm in 2 s): no turn', JSON.stringify(f));
// pinch-stick walking: the thumb comes in to the fingertip, the pinched hand is dragged around and turned, then let go (and the
// thumb slides back down the finger as it opens). Run with the pinch flagged busy (as vr.js does) and with it missed entirely
for (const flagged of [true, false]) {
  const walk = [[0, 0.03, OFF], [0.25, 0.07, 0.012], [0.3, 0.074, 0.008, flagged], [1.0, 0.074, 0.008, flagged, [0, 0, -0.12]], [1.6, 0.074, 0.008, flagged, [0.08, 0.05, -0.05]], [1.7, 0.074, 0.008, false, [0.08, 0.05, -0.05]],
    [1.9, 0.035, 0.016, false, [0.08, 0.05, -0.05]], [2.1, 0.02, OFF, false, [0.08, 0.05, -0.05]]];
  f = play(walk, 0.002); ok(f.length === 0, `thumb: pinch-stick walking (pinch ${flagged ? 'flagged busy' : 'not reported'}): no turn`, JSON.stringify(f));
}
f = play([[0, 0.02, OFF], [0.3, 0.02, ON, true], [0.5, 0.02, ON, true], [0.65, 0.045, ON, true], [0.9, 0.045, ON, true], [1.1, 0.045, OFF]]);
ok(f.length === 0, 'thumb: a swipe while the hand is busy (tablet up, on the bars): no turn', JSON.stringify(f));
f = play([[0, 0.02, OFF], [0.3, 0.02, 0.031], [0.5, 0.02, 0.031], [0.65, 0.045, 0.031], [0.9, 0.045, OFF]]);
ok(f.length === 0, `thumb: a slide ${(0.031 * 100).toFixed(1)} cm off the finger (beyond ${THUMB.TOUCH * 100} cm): no turn`, JSON.stringify(f));

// ---- 2. ride shaping ----
const run = (bars, push, speed, s = 1) => { const st = rideState(); let o; for (let i = 0; i < s * 90; i++) o = shapeRide(st, bars, push, speed, 22, 1 / 90); return o; };
ok(run(0.05, 0, 3).steer === 0, `ride: bars inside the ${RIDE.DEAD} rad deadzone don't steer`);
const lo = run(0.4, 0, 3).steer, hi = run(0.4, 0, 18).steer; ok(lo > 0.15 && hi < lo * 0.6, 'ride: the same bars steer less at 18 m/s than at 3 m/s', JSON.stringify({ lo: +lo.toFixed(3), hi: +hi.toFixed(3) }));
const sm = (() => { const st = rideState(); return shapeRide(st, 0.85, 0, 2, 22, 1 / 90).steer; })(); ok(sm > 0 && sm < 0.15, 'ride: a sudden full lock is smoothed in, not a jump', sm.toFixed(3));
const crawl = run(0.0, 0.08, 3).thr, cruise = run(0.0, 0.08, 5).thr; ok(crawl > 0 && cruise === 0, 'ride: a small push holds a walking pace (gas below it, none above)', JSON.stringify({ at3: +crawl.toFixed(3), at5: +cruise.toFixed(3) }));
ok(run(0, -0.1, 5).thr < -0.3, 'ride: pulling back brakes');

// ---- 3. in the game ----
const PAGE = `http://localhost:${process.env.PORT || 8790}/?qa=1&map=coney&ai=0&time=day&vr=1`;
const IWER = readFileSync(new URL('../node_modules/iwer/build/iwer.min.js', 'file://' + process.argv[1]), 'utf8');
const b = await pw.chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio', '--enable-unsafe-swiftshader'] });
const errs = [];
try {
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
  pg.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERROR', e.message); });
  await pg.addInitScript(IWER + `\n;window.__iwer = new IWER.XRDevice(IWER.metaQuest3); window.__iwer.installRuntime({ forceInstall: true }); try { localStorage.setItem('zavod.helpSeen', '1'); localStorage.setItem('zavod.vr', JSON.stringify({ tut: true })); } catch {}`);
  await pg.goto(PAGE, { timeout: 180000 }); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
  await pg.evaluate(() => window.__game.setState('playing')); await pg.waitForTimeout(500);
  // a real Luna Park path: the longest OSM footpath among the towers whose line is clear of anything solid
  const path = await pg.evaluate(async () => {
    const { OSM } = await import('/src/world/coney/osm.js'), c = window.__ctx;
    const clear = (x, z) => !c.colliders.some((bx) => bx.max.y > c.world.groundHeight(x, z) + 0.3 && bx.min.y < c.world.groundHeight(x, z) + 1.2 && x > bx.min.x - 0.6 && x < bx.max.x + 0.6 && z > bx.min.z - 0.6 && z < bx.max.z + 0.6);
    const dense = (p) => { const o = []; for (let i = 0; i < p.length - 1; i++) { const [a, b] = [p[i], p[i + 1]], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1)); for (let k = 0; k < n; k++) o.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); } o.push(p[p.length - 1]); return o; };
    const best = OSM.w.filter((w) => !w.s && w.p.every(([x, z]) => x > 60 && x < 380 && z > -520 && z < -110)).map((w) => ({ w, d: dense(w.p) }))
      .map((o) => ({ ...o, len: o.d.length - 1, turn: o.w.p.slice(1, -1).reduce((a, p, i) => { const q = o.w.p[i], r = o.w.p[i + 2], a1 = Math.atan2(p[0] - q[0], p[1] - q[1]), a2 = Math.atan2(r[0] - p[0], r[1] - p[1]); return a + Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1))); }, 0) }))
      .filter((o) => o.len > 45 && o.turn > 0.5 && o.d.every(([x, z]) => clear(x, z))).sort((a, b) => b.len - a.len)[0];
    return best ? { pts: best.d, w: best.w.w, len: best.len, turn: +best.turn.toFixed(2) } : null;
  });
  ok(!!path, 'found a clear, curvy Luna Park path', path ? JSON.stringify({ len: path.len, width: path.w, turn: path.turn }) : '');
  if (path) {
    /** ride it with shaky synthetic hands through a mapping ('new' = ride.js, 'old' = the previous one), from a standing start */
    const ride = (mapping) => pg.evaluate(async ({ path, mapping }) => {
      const R = await import('/src/vr/ride.js'), c = window.__ctx, V = c.vehicles, P = path.pts;
      if (V.mounted) { c.input.xrSteer = c.input.xrThrottle = null; V.dismount(); await new Promise((r) => setTimeout(r, 300)); }
      const [x0, z0] = P[0], [x1, z1] = P[3], yaw = Math.atan2(-(x1 - x0), -(z1 - z0));
      const bike = V.qaSpawn(x0, z0, yaw, c.world.groundHeight(x0, z0)); c.player.teleport(x0 + 1, bike.pos.y, z0, yaw, 0); V.mount(bike);
      await new Promise((r) => setTimeout(r, 300)); if (V.mounted !== bike) return { err: 'could not mount the test bike' };
      const st = R.rideState(); let seg = 0, maxOff = 0, sumOff = 0, n = 0, maxV = 0, crashes = 0, lastCrash = bike.crashT || 0, t0 = performance.now(), prev = t0, ph = 0;
      const near = (x, z) => { let best = 1e9, bi = seg; for (let i = Math.max(0, seg - 3); i < Math.min(P.length - 1, seg + 12); i++) { const [ax, az] = P[i], [bx, bz] = P[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), d = Math.hypot(x - ax - dx * u, z - az - dz * u); if (d < best) { best = d; bi = i; } } seg = bi; return best; };
      let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
      return await new Promise((done) => { const tick = () => {
        const now = performance.now(), dt = Math.min(0.1, (now - prev) / 1000); prev = now; ph += dt;
        const b = V.mounted; if (!b) return done({ err: 'not mounted' });
        const off = near(b.pos.x, b.pos.z); maxOff = Math.max(maxOff, off); sumOff += off; n++; maxV = Math.max(maxV, b.fwdSpeed);
        if ((b.crashT || 0) !== lastCrash) { crashes++; lastCrash = b.crashT; }
        // the rider: aim 3.5 m down the path, turn the bars towards it (a person's proportional grip), hands shaking a little
        const la = P[Math.min(P.length - 1, seg + 4)], fx = -Math.sin(b.heading), fz = -Math.cos(b.heading), tx = la[0] - b.pos.x, tz = la[1] - b.pos.z;
        const err = Math.atan2(fx * tz - fz * tx, fx * tx + fz * tz);   // + = the target is to the right
        const bars = Math.max(-0.85, Math.min(0.85, err * 1.1)) + Math.sin(ph * 2 * Math.PI * 3) * 0.04 + rnd() * 0.03, push = 0.08 + Math.sin(ph * 2 * Math.PI * 0.7) * 0.01;
        const o = mapping === 'new' ? R.shapeRide(st, bars, push, b.fwdSpeed, b.spec.max, dt) : R.rideOld(bars, push);
        c.input.xrSteer = o.steer; c.input.xrThrottle = o.thr;
        const end = Math.hypot(b.pos.x - P[P.length - 1][0], b.pos.z - P[P.length - 1][1]) < 2.5 || seg >= P.length - 3, late = now - t0 > 70000;
        if (end || late || off > 6) { c.input.xrSteer = c.input.xrThrottle = null; return done({ done: end, secs: +((now - t0) / 1000).toFixed(1), maxOff: +maxOff.toFixed(2), meanOff: +(sumOff / n).toFixed(2), maxV: +maxV.toFixed(1), crashes, frames: n }); }
        requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    }, { path, mapping });
    const half = Math.max(1.2, path.w / 2);
    const rn = await ride('new'); console.log('new mapping ride', JSON.stringify(rn));
    await pg.screenshot({ path: `${out}/vr-bike-luna.png` });
    ok(rn.done && rn.maxOff < half + 0.3 && rn.crashes === 0, `new mapping: the shaky rider stays on the ${path.w} m path end to end (off the line by at most ${(half + 0.3).toFixed(1)} m), no crashes`, JSON.stringify(rn));
    ok(rn.maxV < 8, 'new mapping: a light push keeps it at a pace you can steer on the paths', `${rn.maxV} m/s`);
    const ro = await ride('old'); console.log('old mapping ride (for comparison)', JSON.stringify(ro));
    ok(true, 'old mapping, same rider (info)', JSON.stringify({ old: { maxOff: ro.maxOff, maxV: ro.maxV, done: ro.done, crashes: ro.crashes }, new: { maxOff: rn.maxOff, maxV: rn.maxV } }));
  }
  // ---- VR: riding with the lean capped and no view roll ----
  await pg.evaluate(() => window.__game.vr.enter()); await pg.waitForFunction(() => window.__game.vr.state().presenting, null, { timeout: 15000 }).catch(() => {});
  await pg.waitForTimeout(1200);
  const vr = await pg.evaluate(async () => {
    const c = window.__ctx, V = c.vehicles, T = c.THREE; if (!V.mounted) { const p = c.player.position; V.qaSpawn(p.x + 1, p.z, 0, p.y); V.qaMount(); }
    await new Promise((r) => setTimeout(r, 600));
    const xrCam = c.renderer.xr.getCamera(), rig = c.scene.getObjectByName('xrRig'); let lean = 0, roll = 0, camRoll = 0, mode = window.__game.vr.state().mode;
    const drive = V.qaDrive(1, 0.8, 3); const t0 = performance.now();
    while (performance.now() - t0 < 2900) { await new Promise((r) => requestAnimationFrame(r)); const b = V.mounted; if (!b) break; lean = Math.max(lean, Math.abs(b.lean));
      const e = new T.Euler().setFromQuaternion(rig.getWorldQuaternion(new T.Quaternion()), 'YXZ'); roll = Math.max(roll, Math.abs(e.z), Math.abs(e.x));
      camRoll = Math.max(camRoll, Math.abs(new T.Euler().setFromQuaternion(c.camera.quaternion, 'YXZ').z)); }
    await drive; return { mode, lean: +(lean * 57.3).toFixed(1), rigTilt: +(roll * 57.3).toFixed(2), camRoll: +(camRoll * 57.3).toFixed(2), speed: +(V.mounted?.speed || 0).toFixed(1), presenting: window.__game.vr.state().presenting };
  });
  ok(vr.presenting && vr.mode === 'seat', 'VR: on the bike, seated', JSON.stringify(vr));
  ok(vr.lean > 0.5 && vr.lean <= 5.05, 'VR: a hard turn leans the bike, capped at 5 deg', `${vr.lean} deg`);
  ok(vr.rigTilt < 0.01 && vr.camRoll < 0.5, 'VR: the view never rolls with the lean', JSON.stringify({ rigTilt: vr.rigTilt, camRoll: vr.camRoll }));
  ok(await pg.evaluate(() => window.__game.vr.prefs.thumb === true), 'the thumb turn is on by default');
  await pg.evaluate(() => window.__game.vr.exit()); await pg.waitForTimeout(500);
  ok(errs.length === 0, 'no page errors', JSON.stringify(errs.slice(0, 3)));
} finally { await b.close(); }
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
