#!/usr/bin/env node
// Driving feel for cars (Coney chill): deterministic runs in a sealed lab world (vehicles.qaLab: test boxes + flat ground only,
// chase cam + speed FOV running) at a fixed 60 fps. Prints the numbers and asserts arcade (GTA-style) targets:
// 0-60 mph about 5 s, 60-0 in about 35 m, speed-sensitive steering, a handbrake slide that recovers, a smooth chase cam with a
// light weight-transfer and a small FOV kick, glancing wall hits that slide along, no tunnelling through thin walls, kerbs that
// step up without sticking. Usage: PORT=8848 node qa/drive-feel-test.mjs [kind] [--report] (--report: print, never fail)
import { chromium } from 'playwright-core';
const kind = process.argv.find((a, i) => i > 1 && !a.startsWith('--')) || 'sedan', reportOnly = process.argv.includes('--report');
const url = `http://localhost:${process.env.PORT || 8790}/?qa=1&map=coney&mode=chill&ai=0&time=day`;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
try {
  const pg = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = []; pg.on('pageerror', (e) => errors.push(e.message));
  await pg.goto(url, { timeout: 180000 });
  await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
  await pg.waitForTimeout(800);
  await pg.evaluate((kind) => { const c = window.__ctx, V = c.vehicles, p = c.player.position; V.mount(V.spawnCar(p.x, p.z, 0, kind, 0x2b3f73, p.y)); }, kind);
  await pg.waitForTimeout(300);
  // one scenario = one evaluate (begin → steps → end), so the live frame loop never interleaves with the lab
  const run = (fn, arg) => pg.evaluate(([src, arg]) => {
    const V = window.__ctx.vehicles, L = V.qaLab, p = window.__ctx.player.position, X = p.x, Z = p.z, DT = 1 / 60;
    const lab = { X, Z, DT, begin: (boxes, dx, dz, h, sp, ground) => L.begin(boxes, X + dx, Z + dz, h, sp, ground), step: L.step, sp: V.mounted.spec };
    try { return new Function('lab', 'arg', src)(lab, arg); } finally { L.end(); }
  }, [fn.toString().replace(/^[^{]*{/, '').replace(/}\s*$/, ''), arg]);

  // ---- straight line: 0-60, top speed, 60-0, brake → reverse → forward ----
  const accel = await run((lab) => { lab.begin([], 0, 0, 0, 0); let t = 0, t60 = null, top = 0, s;
    for (let i = 0; i < 60 * 15; i++) { s = lab.step(lab.DT, 1, 0, false, 0); t += lab.DT; if (t60 == null && s.fwd >= 26.8224) t60 = t; top = Math.max(top, s.fwd); }
    return { t60, top }; });
  const brake = await run((lab) => { lab.begin([], 0, 0, 0, 26.8224); let s, d = 0, t = 0, x0 = lab.X, z0 = lab.Z, tStop = null, tRev = null, tFwd = null;
    for (let i = 0; i < 60 * 8; i++) { s = lab.step(lab.DT, 0, 1, false, 0); t += lab.DT; if (tStop == null && s.fwd <= 0.05) { tStop = t; d = Math.hypot(s.x - x0, s.z - z0); } if (tStop != null && tRev == null && s.fwd <= -2) tRev = t - tStop; }
    let t2 = 0; for (let i = 0; i < 60 * 4; i++) { s = lab.step(lab.DT, 1, 0, false, 0); t2 += lab.DT; if (tFwd == null && s.fwd >= 2) tFwd = t2; }
    return { d, tStop, tRev, tFwd }; });
  // ---- steering: steady full lock at 20/40/60 mph (speed held), response time, slip angle ----
  const steerAt = await run((lab) => { const out = {};
    for (const mph of [20, 40, 60]) { const v0 = mph * 0.44704; lab.begin([], 0, 0, 0, v0); let s, t = 0, yaw = [], t90 = null, slip = 0;
      for (let i = 0; i < 60 * 3; i++) { const sp0 = i ? s.fwd : v0; s = lab.step(lab.DT, sp0 < v0 ? 1 : 0, 0, false, 1); t += lab.DT; if (t > 1.5) yaw.push(Math.abs(s.yawRate)); slip = Math.max(slip, Math.abs(Math.atan2(s.lat, Math.abs(s.fwd))) * 57.3); }
      const ss = yaw.reduce((a, b) => a + b, 0) / yaw.length;
      lab.begin([], 0, 0, 0, v0); t = 0; for (let i = 0; i < 60 * 2; i++) { s = lab.step(lab.DT, 0.4, 0, false, 1); t += lab.DT; if (t90 == null && Math.abs(s.yawRate) >= 0.9 * ss) t90 = t; }
      out[mph] = { yawDeg: ss * 57.3, latG: ss * v0 / 9.81, t90, slip }; lab.step(lab.DT); }
    return out; });
  // ---- camera: steady 40 mph turn (yaw lag), braking (weight-transfer pull-in), FOV at rest / 60 ----
  const cam = await run((lab) => { const v0 = 40 * 0.44704; lab.begin([], 0, 0, 0, v0); let s, lag = 0, dists = [], fov0 = null;
    for (let i = 0; i < 60 * 3; i++) { s = lab.step(lab.DT, s && s.fwd < v0 ? 1 : 0, 0, false, 1); if (i > 90) lag = Math.max(lag, Math.abs(((s.camYaw - s.heading + 9 * Math.PI) % (2 * Math.PI)) - Math.PI) * 57.3); }
    lab.begin([], 0, 0, 0, 0); s = lab.step(lab.DT); fov0 = s.fov; const d0 = s.camDist;
    for (let i = 0; i < 60 * 2; i++) s = lab.step(lab.DT); const dRest = s.camDist;
    lab.begin([], 0, 0, 0, 26.8224); for (let i = 0; i < 60 * 1.5; i++) s = lab.step(lab.DT, 1, 0, false, 0); const fov60 = s.fov, dCruise = s.camDist;
    let dMin = 99, dMax = 0, jerk = 0, prev = null; for (let i = 0; i < 60 * 1.2; i++) { s = lab.step(lab.DT, 0, 1, false, 0); dMin = Math.min(dMin, s.camDist); dMax = Math.max(dMax, s.camDist); if (prev != null) jerk = Math.max(jerk, Math.abs(s.camDist - prev)); prev = s.camDist; }
    return { lag, fov0, fov60, dRest, dCruise, brakeShift: dCruise - dMin, camStepMax: jerk }; });
  // ---- handbrake: 40 mph, full lock + handbrake 0.8 s, release + straighten, gas ----
  const hand = await run((lab) => { const v0 = 40 * 0.44704; lab.begin([], 0, 0, 0, v0); let s, slip = 0, rec = null, t = 0, h0 = 0;
    for (let i = 0; i < 48; i++) { s = lab.step(lab.DT, 0, 0, true, 1); slip = Math.max(slip, Math.abs(Math.atan2(s.lat, Math.abs(s.fwd) + 1e-3)) * 57.3); }
    const turned = Math.abs(s.heading - h0) * 57.3, vAfter = s.speed;
    for (let i = 0; i < 60 * 4; i++) { s = lab.step(lab.DT, 1, 0, false, 0); t += lab.DT; const a = Math.abs(Math.atan2(s.lat, Math.abs(s.fwd) + 1e-3)) * 57.3; slip = Math.max(slip, a); if (rec == null && a < 3) rec = t; }
    return { slip, turned, vAfter, recover: rec, vEnd: s.speed }; });
  // ---- walls: 15 deg glance at 60 mph, head-on at 60, thin walls at 46 / 67 m/s (also at 30 fps) ----
  const glance = await run((lab) => { const X = lab.X, Z = lab.Z, ang = 15 * Math.PI / 180;
    lab.begin([[X - 4.5, 0, Z - 400, X - 3.5, 4, Z + 20]], 0, 0, ang, 26.8224); let s, vMin = 99, spin = 0, hit = false, t = 0, tHit = 0;
    for (let i = 0; i < 60 * 2.5; i++) { s = lab.step(lab.DT, 1, 0, false, 0); t += lab.DT; if (s.x - X < -2.3 && !hit) { hit = true; tHit = t; } if (hit) { vMin = Math.min(vMin, s.speed); spin = Math.max(spin, Math.abs(s.yawRate) * 57.3); } }
    return { hit, vMin, keep: vMin / 26.8224, spin, vEnd: s.speed, headingEnd: s.heading * 57.3, xEnd: s.x - X }; });
  const headOn = await run((lab) => { const X = lab.X, Z = lab.Z; lab.begin([[X - 10, 0, Z - 31, X + 10, 4, Z - 30]], 0, 0, 0, 26.8224); let s, back = 0, through = false;
    for (let i = 0; i < 60 * 2; i++) { s = lab.step(lab.DT, 0, 0, false, 0); back = Math.min(back, s.fwd); if (s.z - Z < -31) through = true; }
    return { bounce: -back, through, zEnd: s.z - Z }; });
  const tunnel = await run((lab) => { const X = lab.X, Z = lab.Z, out = [];
    for (const [v0, fps, th] of [[46, 60, 0.1], [67, 60, 0.1], [67, 30, 0.1], [67, 20, 0.05]]) { lab.begin([[X - 10, 0, Z - 40 - th, X + 10, 3, Z - 40]], 0, 0, 0, v0); let s, through = false;
      for (let i = 0; i < fps * 1.5; i++) { s = lab.step(1 / fps, 1, 0, false, 0); if (s.z - Z < -40 - th) through = true; } out.push({ v0, fps, th, through }); }
    // a thin wall at a 30 deg angle (rotated walls are rows of small AABB cells)
    { const cells = []; for (let k = 0; k < 40; k++) { const cx = X - 10 + k * 0.5, cz = Z - 40 + k * 0.5 * Math.tan(30 * Math.PI / 180); cells.push([cx, 0, cz - 0.08, cx + 0.5, 3, cz + 0.08]); }
      lab.begin(cells, 0, 0, 0, 67); let s, through = false; for (let i = 0; i < 90; i++) { s = lab.step(1 / 30, 1, 0, false, 0); const wz = Z - 40 + (s.x - X + 10) * Math.tan(30 * Math.PI / 180); if (s.z < wz - 1.5) through = true; } out.push({ v0: 67, fps: 30, th: 'cells30', through }); }
    return out; });
  // ---- kerbs: 0.15 m pavement (ground step, like Coney's) square-on at 8 m/s, glancing at 10 deg / 12 m/s, and a 0.3 m step ----
  const kerb = await run((lab) => { const X = lab.X, Z = lab.Z, res = {};
    const go = (name, h, ang, v0, slab = true) => { lab.begin(slab ? [] : [[X - 30, 0, Z - 200, X + 30, h, Z - 10]], 0, 0, ang, v0, slab ? [[X - 30, Z - 200, X + 30, Z - 10, h]] : []); let s, vMin = 99, yMax = 0, prevY = 0, dyMax = 0, on = null, t = 0, airT = 0;
      for (let i = 0; i < 60 * 3; i++) { s = lab.step(lab.DT, v0 > 0 ? (s && s.fwd < v0 ? 1 : 0) : 0, 0, false, 0); t += lab.DT; if (s.z - Z < -8) vMin = Math.min(vMin, s.speed); dyMax = Math.max(dyMax, Math.abs(s.y - prevY)); prevY = s.y; if (on == null && s.y >= h - 0.01) on = t; if (s.air) airT += lab.DT; }
      res[name] = { on, vMin, vEnd: s.speed, dyMaxPerFrame: dyMax, airT, z: s.z - Z }; };
    go('square15', 0.15, 0, 8); go('glance15', 0.15, 0.17, 12); go('step30', 0.3, 0, 6); go('step30glance', 0.3, 0.3, 10, true); go('box15', 0.15, 0, 8, false);
    return res; });
  // ---- chase cam vs buildings: backed against a wall, then reversing + turning past a pillar: the camera never ends up inside ----
  const camClip = await run((lab) => { const X = lab.X, Z = lab.Z, boxes = [[X - 20, 0, Z + 3, X + 20, 8, Z + 5], [X - 3.2, 0, Z - 0.5, X - 2.2, 8, Z + 0.5], [X + 2.4, 0, Z + 1, X + 3.4, 8, Z + 2]];
    const inside = (s, m) => boxes.some((b) => s.camX > b[0] - m && s.camX < b[3] + m && s.camZ > b[2] - m && s.camZ < b[5] + m && s.camY < b[4]);
    lab.begin(boxes, 0, 0, 0, 0); let s, bad = 0, n = 0, dMin = 99;
    for (let i = 0; i < 60 * 1; i++) { s = lab.step(lab.DT); if (inside(s, 0.12)) bad++; n++; dMin = Math.min(dMin, s.camDist); }
    for (let i = 0; i < 60 * 2.5; i++) { s = lab.step(lab.DT, 0, 0.6, false, i < 75 ? 1 : -1); if (inside(s, 0.12)) bad++; n++; dMin = Math.min(dMin, s.camDist); }
    // a building whose side runs 0.15 m off the camera's line, starting 2 m behind the car: the near plane (about 0.25 m across) would scrape it
    boxes.length = 0; boxes.push([X + 0.15, 0, Z + 2, X + 6, 10, Z + 14]); lab.begin(boxes, 0, 0, 0, 0);
    for (let i = 0; i < 60 * 1; i++) { s = lab.step(lab.DT); if (inside(s, 0.25)) bad++; n++; dMin = Math.min(dMin, s.camDist); }
    return { bad, n, dMin }; });
  const touch = await pg.evaluate(() => { const T = window.__ctx.vehicles.qaTouch; return { small: T(0.25, 0, true, 10).steer, full: T(1, 0, true, 10).steer, cruise: T(0.8, 0, true, 8).thr, cruiseStill: T(0.8, 0, true, 0).thr, gas: T(0, -0.8, true, 0).thr, brake: T(0.5, 0.7, true, 8), bike: T(0.25, 0, false, 10).steer }; });
  const R = { kind, accel, brake, steerAt, cam, hand, glance, headOn, tunnel, kerb, camClip, touch };
  const f = (v, d = 2) => v == null ? 'n/a' : typeof v === 'number' ? v.toFixed(d) : String(v);
  console.log(JSON.stringify(R));
  console.log(`\n${kind}: 0-60 ${f(accel.t60)} s · top ${f(accel.top * 2.237, 0)} mph · 60-0 ${f(brake.d, 1)} m · stop→reverse ${f(brake.tRev)} s · reverse→forward ${f(brake.tFwd)} s`);
  for (const m of [20, 40, 60]) console.log(`steer @${m} mph: ${f(steerAt[m].yawDeg, 1)} deg/s · ${f(steerAt[m].latG)} g · 90% in ${f(steerAt[m].t90)} s · slip ${f(steerAt[m].slip, 1)} deg`);
  console.log(`camera: yaw lag ${f(cam.lag, 1)} deg · dist ${f(cam.dRest)}→${f(cam.dCruise)} m · brake pull-in ${f(cam.brakeShift)} m · max step ${f(cam.camStepMax, 3)} m/frame · FOV ${f(cam.fov0, 1)}→${f(cam.fov60, 1)}`);
  console.log(`handbrake: slip ${f(hand.slip, 1)} deg · turned ${f(hand.turned, 0)} deg · ${f(hand.vAfter)} m/s after · recovers in ${f(hand.recover)} s`);
  console.log(`wall glance 15 deg @60: keeps ${f(glance.keep * 100, 0)} % · spin ${f(glance.spin, 0)} deg/s · end ${f(glance.vEnd)} m/s · head-on bounce ${f(headOn.bounce)} m/s`);
  console.log(`tunnel: ${tunnel.map((t) => `${t.v0}m/s@${t.fps}fps/${t.th}:${t.through ? 'THROUGH' : 'held'}`).join(' · ')}`);
  for (const [k, v] of Object.entries(kerb)) console.log(`kerb ${k}: on ${f(v.on)} s · vMin ${f(v.vMin)} · vEnd ${f(v.vEnd)} · max dy ${f(v.dyMaxPerFrame, 3)} m/frame · air ${f(v.airT)} s`);
  console.log(`camera clip: ${camClip.bad}/${camClip.n} frames inside a box · closest ${f(camClip.dMin)} m · touch: ${JSON.stringify(touch)}`);
  console.log('');
  // ---- targets ----
  check(accel.t60 != null && accel.t60 >= 4 && accel.t60 <= 6.2, `0-60 mph about 5 s (${f(accel.t60)} s)`);
  check(accel.top >= 30 && accel.top <= 45, `top speed 67-100 mph (${f(accel.top * 2.237, 0)} mph)`);
  check(brake.d >= 28 && brake.d <= 40, `60-0 about 35 m (${f(brake.d, 1)} m)`);
  check(brake.tRev != null && brake.tRev <= 1.2, `holding brake after a stop reverses promptly (${f(brake.tRev)} s to -2 m/s)`);
  check(brake.tFwd != null && brake.tFwd <= 1.2, `gas while reversing drives forward promptly (${f(brake.tFwd)} s to +2 m/s)`);
  check(steerAt[20].yawDeg > steerAt[40].yawDeg * 1.4 && steerAt[40].yawDeg > steerAt[60].yawDeg * 1.2, `speed-sensitive yaw rate (${[20, 40, 60].map((m) => f(steerAt[m].yawDeg, 0)).join('/')} deg/s)`);
  check(steerAt[60].latG >= 0.7 && steerAt[60].latG <= 1.3, `60 mph full lock holds a sensible 0.7-1.3 g (${f(steerAt[60].latG)} g)`);
  check([20, 40, 60].every((m) => steerAt[m].t90 != null && steerAt[m].t90 >= 0.12 && steerAt[m].t90 <= 0.45), `steering filtered, not twitchy or laggy (90% yaw in ${[20, 40, 60].map((m) => f(steerAt[m].t90)).join('/')} s)`);
  check(steerAt[60].slip <= 6, `grip at 60 mph full lock: little slide (${f(steerAt[60].slip, 1)} deg)`);
  check(hand.slip >= 20 && hand.slip <= 75, `handbrake kicks the tail out (${f(hand.slip, 1)} deg slip)`);
  check(hand.turned >= 45, `handbrake turn rotates the car (${f(hand.turned, 0)} deg)`);
  check(hand.recover != null && hand.recover <= 1.5, `slide recovers after release (${f(hand.recover)} s)`);
  check(cam.lag >= 2 && cam.lag <= 15, `chase cam trails the turn a little (${f(cam.lag, 1)} deg)`);
  check(cam.brakeShift >= 0.15 && cam.brakeShift <= 1.2, `chase cam weight-transfer on braking (${f(cam.brakeShift)} m)`);
  check(cam.camStepMax <= 0.08, `chase cam distance moves smoothly (${f(cam.camStepMax, 3)} m/frame)`);
  check(cam.fov60 - cam.fov0 >= 3 && cam.fov60 - cam.fov0 <= 10, `FOV kick at 60 mph (+${f(cam.fov60 - cam.fov0, 1)} deg)`);
  check(glance.hit && glance.keep >= 0.6, `15 deg wall glance slides along, keeps speed (${f(glance.keep * 100, 0)} %)`);
  check(glance.spin <= 90, `wall glance doesn't spin the car (${f(glance.spin, 0)} deg/s)`);
  check(!headOn.through && headOn.bounce <= 4, `head-on: stops, small bounce (${f(headOn.bounce)} m/s)`);
  check(tunnel.every((t) => !t.through), 'no tunnelling through thin walls at speed / low fps');
  check(kerb.square15.on != null && kerb.square15.vEnd >= 6.5, `15 cm kerb square-on: climbs, keeps speed (${f(kerb.square15.vEnd)} m/s)`);
  check(kerb.glance15.on != null && kerb.glance15.vEnd >= 10, `15 cm kerb at 10 deg: climbs, doesn't stick (${f(kerb.glance15.vEnd)} m/s)`);
  check(kerb.square15.dyMaxPerFrame <= 0.06 && kerb.glance15.dyMaxPerFrame <= 0.06, `kerb step is eased, not a snap (${f(kerb.square15.dyMaxPerFrame, 3)} m/frame)`);
  check(kerb.box15.on != null && kerb.box15.vEnd >= 6.5, `15 cm kerb collider box: climbs (${f(kerb.box15.vEnd)} m/s)`);
  check(camClip.bad === 0, `chase cam never inside a building (${camClip.bad}/${camClip.n} frames)`);
  check(touch.small > 0 && touch.small < 0.12 && touch.full === 1, `touch steering: soft centre, full lock at the edge (${f(touch.small, 3)} at 25 %)`);
  check(touch.cruise > 0.3 && touch.cruiseStill === 0 && touch.gas > 0.8 && touch.brake.thr === 0 && touch.brake.brake > 0.5, 'touch: cruise throttle while steering on the move, none from rest, stick down brakes');
  check(errors.length === 0, `no page errors ${errors.slice(0, 3).join(' | ')}`);
} catch (e) { console.error(e); fails.push(String(e)); }
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
process.exit(fails.length && !reportOnly ? 1 : 0);
