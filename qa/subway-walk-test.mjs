// Ride the F like a player: spawn on the boardwalk at Stillwell Ave, WALK (player inputs only, no teleports) up Stillwell Ave,
// through the head house + turnstiles, up the F stairs to the platform, walk in through the open doors, walk the car, ride to
// W 8 St, walk out of the doors and down both flights to the street; then F on / off to Neptune Av and down its stairs to
// Shell Rd. Touch + chill: the tap buttons board and alight. Online: two players board the same train and each draws the
// other inside it while it runs. The wall clock is skewed so nobody waits for the timetable.
// node qa/subway-walk-test.mjs [outdir] [--no-mp]
import { chromium } from 'playwright-core';
const out = process.argv.slice(2).find((a) => !a.startsWith('--')) || '/tmp', noMp = process.argv.includes('--no-mp');
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const errs = [];
// in-page helpers: steer with the view (yaw) + hold "forward" (the QA input path), sidestep when blocked
const HELPERS = () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); window.sleep = sleep;
  window.walkTo = async (x, z, max = 40) => { const p = window.__ctx.player; const t0 = performance.now(); let last = null, stuck = 0;
    while (performance.now() - t0 < max * 1000) { const dx = x - p.position.x, dz = z - p.position.z, d = Math.hypot(dx, dz); if (d < 1.0) return { ok: true, pos: p.position.toArray().map((v) => +v.toFixed(2)) };
      p.yaw = Math.atan2(-dx, -dz); await p.qaWalk({ x: 0, y: 1 }, 0.25, { sprint: d > 4 });
      const cur = p.position.clone(); if (last && cur.distanceTo(last) < 0.15) { if (stuck === 3 || stuck === 6) await p.qaWalk({ x: stuck === 3 ? 1 : -1, y: 0 }, 0.7, {}); if (++stuck > 9) break; } else stuck = 0; last = cur; }
    return { ok: false, pos: p.position.toArray().map((v) => +v.toFixed(2)) }; };
  window.path = async (pts) => { const res = []; for (const [x, z] of pts) { const r = await window.walkTo(x, z); res.push(r); if (!r.ok) break; } return res; };
  const P0 = [274.5, -153], P1 = [457, -107.5], L = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]), u = [(P1[0] - P0[0]) / L, (P1[1] - P0[1]) / L];
  window.w8at = (a, o) => [P0[0] + u[0] * a - u[1] * o, P0[1] + u[1] * a + u[0] * o];
  window.hudTxt = () => document.querySelector('.zvsub')?.innerText || '';
  // inside the car: face along the car's own axes, push the stick
  window.carFace = (lx, lz) => { const c = window.__ctx.subway.local()[0]; const g = window.__ctx.scene.getObjectsByProperty('name', 'fTrainCar')[c]; const e = g.matrixWorld.elements; const h = Math.atan2(e[8], e[10]);
    const wx = lx * Math.cos(h) + lz * Math.sin(h), wz = -lx * Math.sin(h) + lz * Math.cos(h); window.__ctx.player.yaw = Math.atan2(-wx, -wz); };
  window.stick = async (ms) => { const T = window.__ctx.input.touch; T.axis.y = -1; await sleep(ms); T.axis.y = 0; };
  window.walkInCar = async (lz) => { for (let i = 0; i < 60; i++) { const Lc = window.__ctx.subway.local(); if (!Lc) return null; const d = lz - Lc[2]; if (Math.abs(d) < 0.15) return Lc; window.carFace(0, Math.sign(d)); await window.stick(Math.min(250, Math.abs(d) / 2.2 * 1000)); } return window.__ctx.subway.local(); };
  // walk out of the open doors on the platform side (side from the car's door leaves)
  window.walkOut = async () => { const S = window.__game.subway, side = S.debug().open[1]; const Lc = window.__ctx.subway.local(); const doors = [-6.2, -2.1, 2.1, 6.2]; const d = doors.reduce((m, z) => (Math.abs(z - Lc[2]) < Math.abs(m - Lc[2]) ? z : m));
    await window.walkInCar(d); const sx = side === 2 ? (Math.sign(window.__ctx.subway.local()[1]) || 1) : side; window.carFace(sx, 0); await window.stick(1100); await sleep(300); return S.state(); };
};
const open = async (q, name = 'P') => {
  const pg = await b.newPage({ viewport: { width: 1000, height: 560 } }); pg.on('pageerror', (e) => errs.push(name + ': ' + e.message));
  await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
  await pg.goto(`http://localhost:${process.env.PORT || 8790}/?qa=1&map=coney&ai=0&time=day` + q, { timeout: 150000 }); await pg.waitForFunction(() => window.__game?.ready && window.__game.subway, null, { timeout: 150000 });
  await pg.evaluate(() => window.__game.setState('playing')); await pg.evaluate(HELPERS); return pg;
};
const S = (pg) => pg.evaluate(() => window.__game.subway.state());

// ---------------------------------------------------------------------------------------------------------------------------
{ const pg = await open('', 'solo');
  // 1) boardwalk → Stillwell Ave → the head house → turnstiles → F stairs → platform, all on foot
  await pg.evaluate(() => { window.__game.teleport(-87, 0.3, 140, 0, 0); });
  const legs = [['boardwalk → Stillwell Ave at Surf Ave', [[-87, 40], [-86, -50], [-85, -140]]], ['Surf Ave → the bus loop at the head house', [[-87, -200], [-87, -245], [-56, -250]]],
    ['through the doors + the turnstiles into the concourse', [[-56, -262], [-56, -272]]], ['up the F stairs (3rd bank) to the platform', [[-49.5, -274], [-49.5, -292], [-51.5, -300], [-51.6, -318.2]]]];
  for (const [m, pts] of legs) { const r = await pg.evaluate((p) => window.path(p), pts); const last = r[r.length - 1]; ok(r.every((q) => q.ok), m, JSON.stringify(last.pos));
    if (m.includes('concourse')) { const h = await pg.evaluate(() => window.hudTxt()); ok(/to Neptune Av/.test(h) && /3rd stairs/.test(h), 'concourse HUD: next F countdown + which stairs', JSON.stringify(h)); } }
  let s = await S(pg); ok(Math.abs(s.pos[1] - 8.6) < 0.2 && s.pos[0] > -53.6 && s.pos[0] < -45.4, 'standing on the F island', JSON.stringify(s.pos));
  const pois = await pg.evaluate(() => window.__ctx.world.mapPOIs.filter((q) => q.kind === 'transit').map((q) => q.name)); ok(pois.length >= 3, 'stations on the map', JSON.stringify(pois));
  await pg.screenshot({ path: `${out}/subw-platform.png` });
  // 2) the train comes in: HUD says boarding; walking into the car wall stops you; walking through the open door boards
  await pg.evaluate(() => { const U = window.__game.subway; U.skew(U.until('STW') + 4); }); await pg.waitForTimeout(900);
  const h1 = await pg.evaluate(() => window.hudTxt()); ok(/boarding/.test(h1) && /walk in/.test(h1), 'platform HUD: boarding + how to board', JSON.stringify(h1));
  await pg.evaluate(async () => { const p = window.__ctx.player; window.__game.teleport(p.position.x, 8.62, -319.4, Math.PI / 2, 0); await window.sleep(200); await p.qaWalk({ x: 0, y: 1 }, 1.2, {}); });
  s = await S(pg); ok(!s.aboard && s.pos[1] > 8.4 && s.pos[0] > -53.2, 'the car side is solid between doors (no falling onto the tracks)', JSON.stringify(s.pos));
  await pg.evaluate(async () => { const p = window.__ctx.player; await window.walkTo(-51.6, -318.2, 5); p.yaw = Math.PI / 2; await p.qaWalk({ x: 0, y: 1 }, 1.2, {}); });
  s = await S(pg); ok(s.aboard, 'walked in through the open doors → aboard', JSON.stringify(s));
  // 3) walk the car (WASD) while it runs; the HUD shows the next stop
  const l0 = await pg.evaluate(() => window.__ctx.subway.local());
  await pg.evaluate(() => { const U = window.__game.subway; U.skew(U.until('W8') - 30); }); await pg.waitForTimeout(800);
  await pg.evaluate(() => window.carFace(0, 1)); await pg.keyboard.down('KeyW'); await pg.waitForTimeout(1200); await pg.keyboard.up('KeyW');
  const l1 = await pg.evaluate(() => window.__ctx.subway.local()); s = await S(pg);
  ok(s.aboard && s.leg === 'run' && Math.abs(l1[2] - l0[2]) > 1.5, 'walking the aisle of a moving car', JSON.stringify([l0, l1]));
  ok(/next stop W 8 St/.test(await pg.evaluate(() => window.hudTxt())), 'rider HUD: next stop + countdown');
  await pg.evaluate(() => { const p = window.__ctx.player; p.pitch = -0.05; }); await pg.screenshot({ path: `${out}/subw-ride.png` });
  // 4) W 8 St: walk out of the doors, down both flights, out to the street
  await pg.evaluate(() => { const U = window.__game.subway; U.skew(U.until('W8') + 3.5); }); await pg.waitForTimeout(400);
  s = await pg.evaluate(() => window.walkOut()); ok(!s.aboard && Math.abs(s.pos[1] - 14.6) < 0.3, 'walked out onto the W 8 St upper platform', JSON.stringify(s.pos));
  const w8 = await pg.evaluate(() => window.path([[120.8, -5.5], [120.8, -9.5], [109.5, -9.5], [107, -9.5], [107, -5.5], [54.8, -5.5], [54.8, -9.5], [38, -9.5], [35, -14]].map(([a, o]) => window.w8at(a, o))));
  const wl = w8[w8.length - 1]; ok(w8.every((q) => q.ok) && wl.pos[1] < 0.3, 'W 8 St: upper platform → lower level → street, on foot', JSON.stringify(wl.pos));
  ok((await pg.evaluate(() => window.__ctx.player.health)) > 90, 'no fall on the way down');
  await pg.screenshot({ path: `${out}/subw-w8-street.png` });
  // 5) F on at W 8 St, off at Neptune Av, down the stairs to Shell Rd
  await pg.evaluate(async () => { const U = window.__game.subway; const [x, z] = window.w8at(102.9, -4.5); window.__game.teleport(x, 14.65, z, 0, 0); U.skew(U.until('W8') + 4); await window.sleep(800); const st = U.state(); if (st.door) window.__game.teleport(st.door[0], st.door[1] + 0.02, st.door[2], 0, 0); await window.sleep(400); });
  await pg.keyboard.press('KeyF'); await pg.waitForTimeout(500); s = await S(pg); ok(s.aboard, 'F boards at W 8 St', JSON.stringify(s));
  await pg.evaluate(() => { const U = window.__game.subway; U.skew(U.until('NEP') + 4); }); await pg.waitForTimeout(900);
  await pg.keyboard.press('KeyF'); await pg.waitForTimeout(700); s = await S(pg); ok(!s.aboard && s.pos[1] > 8.4 && s.pos[0] > 440, 'F gets you off at Neptune Av', JSON.stringify(s.pos));
  const nep = await pg.evaluate(async () => { const st = window.__game.subway.nepStairs(); const me = window.__ctx.player.position; const side = st.reduce((m, q) => (Math.hypot(q[0][0] - me.x, q[0][1] - me.z) < Math.hypot(m[0][0] - me.x, m[0][1] - me.z) ? q : m)); return window.path(side); });
  const nl = nep[nep.length - 1]; ok(nep.every((q) => q.ok) && nl.pos[1] < 0.3, 'Neptune Av: platform → stairs → Shell Rd', JSON.stringify(nl.pos));
  await pg.close();
}
// ---------------------------------------------------------------------------------------------------------------------------
{ const pg = await open('&mode=chill&touch=1', 'touch');
  await pg.evaluate(async () => { const U = window.__game.subway; window.__game.teleport(-51.6, 8.62, -318.2, Math.PI / 2, 0); U.skew(U.until('STW') + 4); await window.sleep(1000); });
  const bub = await pg.evaluate(() => { const e = document.querySelector('.zvact'); return e ? { on: e.classList.contains('on'), t: e.textContent } : null; });
  ok(bub?.on && /BOARD THE F/.test(bub.t), 'touch: a BOARD THE F button at the open doors', JSON.stringify(bub));
  await pg.evaluate(() => document.querySelector('.zvact').dispatchEvent(new Event('touchstart', { cancelable: true }))); await pg.waitForTimeout(500);
  let s = await S(pg); ok(s.aboard, 'touch: tap boards', JSON.stringify(s));
  await pg.evaluate(() => { const U = window.__game.subway; U.skew(U.until('W8') - 20); }); await pg.waitForTimeout(600);
  const mid = await pg.evaluate(() => { const e = document.querySelector('#touch .act'); return e.classList.contains('show') ? e.textContent : ''; }); ok(!mid, 'touch: no GET OFF button between stations', mid);
  await pg.evaluate(async () => { await window.walkInCar(0); });   // the stick walks the car
  await pg.evaluate(() => { const U = window.__game.subway; U.skew(U.until('W8') + 4); }); await pg.waitForTimeout(800);
  const act = await pg.evaluate(() => { const e = document.querySelector('#touch .act'); return { show: e.classList.contains('show'), t: e.textContent }; }); ok(act.show && act.t === 'GET OFF', 'touch: GET OFF button at a stop', JSON.stringify(act));
  await pg.evaluate(() => document.querySelector('#touch .act').dispatchEvent(new Event('touchstart', { cancelable: true }))); await pg.waitForTimeout(600);
  s = await S(pg); ok(!s.aboard && Math.abs(s.pos[1] - 14.6) < 0.3, 'touch: tap gets you off at W 8 St', JSON.stringify(s.pos));
  await pg.screenshot({ path: `${out}/subw-touch.png` });
  await pg.close();
}
// ---------------------------------------------------------------------------------------------------------------------------
if (!noMp) {
  const room = 'qaf' + Math.random().toString(36).slice(2, 7);
  const mk = async (n) => { const pg = await open(`&mp=1&room=${room}&name=${n}`, n); await pg.waitForFunction(() => window.__ctx?.net?.connected, null, { timeout: 60000 }).catch(() => {}); return pg; };
  const A = await mk('ALPHA'), B = await mk('BRAVO');
  await A.waitForFunction(() => window.__ctx.net.peers >= 1, null, { timeout: 30000 }).catch(() => {});
  ok((await A.evaluate(() => window.__ctx.net.peers)) >= 1 && (await B.evaluate(() => window.__ctx.net.peers)) >= 1, 'online: A and B see each other');
  const sk = await A.evaluate(() => window.__game.subway.until('STW') + 4);
  for (const [pg, z] of [[A, -318.2], [B, -336.6]]) await pg.evaluate(async ([sk, z]) => { window.__game.subway.skew(sk); window.__game.teleport(-51.6, 8.62, z, Math.PI / 2, 0); await window.sleep(700); const st = window.__game.subway.state(); if (st.door) { window.__game.teleport(st.door[0], st.door[1] + 0.02, st.door[2], Math.PI / 2, 0); await window.sleep(300); window.__game.subway.board(); } }, [sk, z]);
  ok((await S(A)).aboard && (await S(B)).aboard, 'online: both players board the same F');
  const sk2 = await A.evaluate(() => window.__game.subway.until('W8') - 25);   // mid-run, at speed
  for (const pg of [A, B]) await pg.evaluate((s) => window.__game.subway.skew(s), sk2);
  await A.waitForTimeout(2500);
  for (const [me, them, n] of [[A, B, 'A sees B'], [B, A, 'B sees A']]) {
    const [tid, loc] = await them.evaluate(() => [window.__ctx.net.id, window.__ctx.subway.local()]);
    const r = await me.evaluate(([tid, loc]) => { const q = window.__ctx.net.peer(tid); const w = window.__ctx.subway.toWorld(loc[0], loc[1], loc[2]); const S = window.__game.subway.state(); return { leg: S.leg, peer: q ? q.pos.toArray().map((v) => +v.toFixed(2)) : null, want: w.toArray().map((v) => +v.toFixed(2)) }; }, [tid, loc]);
    const d = r.peer ? Math.hypot(r.peer[0] - r.want[0], r.peer[1] - r.want[1], r.peer[2] - r.want[2]) : 99;
    ok(r.leg === 'run' && d < 0.8, `online: ${n} inside the moving car (${d.toFixed(2)} m off)`, JSON.stringify(r));
  }
  await A.evaluate(() => { const p = window.__ctx.player; window.carFace(0, -1); p.pitch = -0.05; }); await A.waitForTimeout(400); await A.screenshot({ path: `${out}/subw-mp.png` });
  await A.close(); await B.close();
}
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
