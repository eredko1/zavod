// Soccer Tavern / 8th Ave: node qa/tavern-test.mjs [outdir] [parts] — parts: travel,bar,darts,mp (default all)
// travel: ride the D out of Stillwell past Bay 50 St (clock skewed) → 8 Av; EXIT 7B off the Belt in a car → 8th Ave; walk in;
// the N back to Coney. bar: buy a Tsingtao. darts: a leg vs AI to a finish (QA throws). mp: two browsers, one darts table.
import pw from 'playwright-core';
const { chromium } = pw;
const out = process.argv[2] || '/tmp', parts = (process.argv[3] || 'travel,bus,bar,back,darts,mp').split(',');
const URL = `http://localhost:${process.env.PORT || 8790}/?qa=1&map=coney&ai=0&time=night`;
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const errs = [];
async function open(name = '') {
  const pg = await b.newPage({ viewport: { width: 1200, height: 680 } }); pg.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERROR', name, e.message); });
  pg.on('console', (m) => { if (/\[tavern\]|\[darts/.test(m.text())) console.log(name, m.text()); });
  await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
  await pg.goto(URL + (name ? `&room=tvqa${process.pid}&name=${name}` : ''), { timeout: 180000 }); await pg.waitForFunction(() => window.__game?.ready && window.__game.tavern, null, { timeout: 180000 });
  await pg.evaluate(() => window.__game.setState('playing')); await pg.waitForTimeout(800); return pg;
}
const pos = (pg) => pg.evaluate(() => window.__ctx.player.position.toArray().map((v) => +v.toFixed(2)));
const T = (pg) => pg.evaluate(() => window.__game.tavern.state());
const walk = async (pg, key, ms) => { await pg.keyboard.down(key); await pg.waitForTimeout(ms); await pg.keyboard.up(key); };
const toDoor = (pg, back = 2) => pg.evaluate((back) => { const d = window.__game.tavern.door; window.__game.teleport(d[0], d[1], d[2] - back, Math.PI, 0); }, back);

const pg = await open();
if (parts.includes('travel')) {
  // ---- the D: board at Stillwell, skip the clock to the end of the Bay 50 St dwell, ride on → 62 St / N → 8 Av ----
  const D = await pg.evaluate(async () => { const S = window.__game.subway.line('D'); const u = S.until('STW'); S.skew(u + 6); await new Promise((r) => setTimeout(r, 3500));
    const st = S.stops()[0]; const [x, y, z] = st.at; let door = null; for (const dx of [-2.9, 2.9]) { window.__game.teleport(x + dx, y + 1.2, z, 0, 0); await new Promise((r) => setTimeout(r, 700)); door = S.state().door; if (door) break; }
    if (door) { window.__game.teleport(door[0], door[1] + 0.05, door[2], 0, 0); await new Promise((r) => setTimeout(r, 500)); S.board(); }
    await new Promise((r) => setTimeout(r, 300)); return { door, aboard: S.state().aboard }; });
  ok(D.aboard, 'boarded the D at Stillwell', JSON.stringify(D));
  if (D.aboard) {
    await pg.evaluate(() => { const S = window.__game.subway.line('D'); S.skew(S.until('B50') + 17); });
    let arrived = false; for (let i = 0; i < 30 && !arrived; i++) { await pg.waitForTimeout(1000); arrived = (await T(pg)).inZone; }
    const p = await pos(pg); ok(arrived, 'the D past Bay 50 St → 62 St → N → 8 Av, Sunset Park', JSON.stringify(p));
    await pg.waitForTimeout(1500); await pg.screenshot({ path: `${out}/tavern-arrive-d.png` });
  }
  // ---- the N express: every minute from Stillwell straight to 8 Av ----
  await pg.evaluate(() => window.__game.tavern.leave('N')); await pg.waitForTimeout(3000);
  const N = await pg.evaluate(async () => { const S = window.__game.subway.line('N'); if (!S) return { none: true }; const cyc = S.state().cycle; const u = S.until('STW'); S.skew(u + 1); await new Promise((r) => setTimeout(r, 2500));
    const st = S.stops()[0]; const [x, y, z] = st.at; let door = null; for (const dx of [-2.9, 2.9]) { window.__game.teleport(x + dx, y + 1.2, z, 0, 0); await new Promise((r) => setTimeout(r, 700)); door = S.state().door; if (door) break; }
    if (door) { window.__game.teleport(door[0], door[1] + 0.05, door[2], 0, 0); await new Promise((r) => setTimeout(r, 500)); S.board(); }
    await new Promise((r) => setTimeout(r, 300)); return { cyc, door, st: st.at, open: S.state().open, aboard: S.state().aboard, p: window.__ctx.player.position.toArray().map((v) => +v.toFixed(1)) }; });
  if (!N.aboard) await pg.screenshot({ path: `${out}/n-platform.png` });
  ok(N.cyc && N.cyc <= 70, 'the N comes about every minute', JSON.stringify(N.cyc));
  ok(N.aboard, 'boarded the N at Stillwell', JSON.stringify(N));
  if (N.aboard) { let arrived = false; for (let i = 0; i < 40 && !arrived; i++) { await pg.waitForTimeout(1000); arrived = (await T(pg)).inZone; } ok(arrived, 'the N express → 8 Av, Sunset Park'); await pg.screenshot({ path: `${out}/tavern-arrive-n.png` }); }
  // ---- the Belt: a car on the loop, right lane through EXIT 7B → 8th Ave in the car ----
  await pg.evaluate(() => { const B = window.__game.belt; const a = B.at(B.exitB - 60, 3.8); window.__game.teleport(a[0], a[1], a[2], a[3], 0); }); await pg.waitForTimeout(600);
  await pg.evaluate(() => { const V = window.__ctx.vehicles; const p = window.__ctx.player.position; const B = window.__game.belt; const a = B.at(B.exitB - 30, 3.8); const c = V.spawnCar(a[0], a[2], a[3], 'sedan', 0x2b3f73, a[1]); V.mount(c); }); await pg.waitForTimeout(600);
  pg.evaluate(() => window.__ctx.vehicles.qaDrive(1, 0, 6)).catch(() => {}); let inCar = null;
  for (let i = 0; i < 16; i++) { await pg.waitForTimeout(700); inCar = await pg.evaluate(() => { const v = window.__ctx.vehicles.mounted; return v ? [+v.pos.x.toFixed(1), +v.pos.y.toFixed(1), +v.pos.z.toFixed(1)] : null; }); if (inCar && Math.abs(inCar[2] + 12000) < 60) break; }
  ok(inCar && Math.abs(inCar[2] + 12000) < 60, 'EXIT 7B off the Belt → 8th Ave, still in the car', JSON.stringify(inCar));
  await pg.waitForTimeout(2500); await pg.screenshot({ path: `${out}/tavern-arrive-belt.png` });
  await pg.evaluate(() => window.__ctx.vehicles.dismount?.()); await pg.waitForTimeout(600);
  // ---- the street, the facade, walking in ----
  await pg.evaluate(() => { const d = window.__game.tavern.door; window.__game.teleport(d[0] + 3, d[1], d[2] - 13, Math.PI + 0.2, 0.08); }); await pg.waitForTimeout(1800);
  await pg.screenshot({ path: `${out}/tavern-facade.png` });
  await pg.evaluate(() => { const d = window.__game.tavern.door; window.__game.teleport(d[0] + 25, d[1], d[2] - 11, Math.PI * 0.72, 0.05); }); await pg.waitForTimeout(1500);
  await pg.screenshot({ path: `${out}/tavern-street.png` });
  await toDoor(pg, 2.5); await pg.waitForTimeout(400); await walk(pg, 'KeyW', 2600);
  const s = await T(pg); ok(s.inBar, 'walked in through the front door', JSON.stringify(s));
  await pg.evaluate(() => { const d = window.__game.tavern.door; window.__game.teleport(d[0] + 1.0, d[1], d[2] + 1.0, Math.PI - 0.12, 0.05); }); await pg.waitForTimeout(1200);
  await pg.screenshot({ path: `${out}/tavern-inside.png` });
  await pg.evaluate(() => { const B = window.__game.tavern.boards[0]; window.__game.teleport(B.oche.x - 1.6, B.oche.y, B.oche.z + 0.6, -Math.PI / 2 - 0.3, 0.05); }); await pg.waitForTimeout(1000);
  await pg.screenshot({ path: `${out}/tavern-darts-wall.png` });
  // ---- the N home ----
  await pg.evaluate(() => { const n = window.__game.tavern.nPos; window.__game.teleport(n[0], n[1], n[2], 0, 0); }); await pg.waitForTimeout(600);
  await pg.keyboard.press('KeyF'); await pg.waitForTimeout(5500);
  const home = await pos(pg); ok(home[2] > -700 && home[2] < 0, 'F at the 8 Av N entrance → Stillwell', JSON.stringify(home));
  await pg.screenshot({ path: `${out}/tavern-home.png` });
  await pg.evaluate(() => window.__game.tavern.arrive('D')); await pg.waitForTimeout(5000);   // back for the next parts
}
if (parts.includes('bus')) {
  // ---- a Coney bus: board at a stop, stay on three stops, it runs on to 8 Av ----
  await pg.evaluate(() => window.__game.teleport(-47, 0, -226, 0, 0)); await pg.waitForTimeout(1500);
  const bus = await pg.evaluate(async () => { const T = window.__game.traffic; for (let i = 0; i < 1500; i++) { const b = T.buses().find((q) => q.state === 'dwell' && q.door > 0.8); if (b) return b; await new Promise((r) => setTimeout(r, 100)); } return null; });
  ok(!!bus, 'a bus at a stop, doors open', bus ? `${bus.route} @ ${bus.stop}` : 'none');
  if (bus) { await pg.evaluate((id) => window.__game.traffic.toBusDoor(id), bus.id); await pg.waitForTimeout(400); await pg.keyboard.press('KeyF'); await pg.waitForTimeout(600);
    ok(!!(await pg.evaluate(() => window.__game.traffic.ride())), 'on the bus');
    let arrived = false; for (let i = 0; i < 300 && !arrived; i++) { await pg.waitForTimeout(1000); arrived = (await T(pg)).inZone; }
    ok(arrived, 'three stops in, the bus runs on to 8 Av, Sunset Park', JSON.stringify(await pos(pg))); await pg.screenshot({ path: `${out}/tavern-arrive-bus.png` }); }
}
if (parts.includes('bar')) {
  // ---- KENNY: a Tsingtao ----
  await pg.evaluate(() => { const k = window.__game.tavernPeople.kenny(); window.__game.teleport(k[0] - 0.3, k[1], k[2], -Math.PI / 2, 0); window.__game.tavernPeople.kit.give(30); }); await pg.waitForTimeout(900);
  await pg.keyboard.press('KeyF'); await pg.waitForTimeout(600);
  let st = await pg.evaluate(() => window.__game.tavernPeople.kit.state() || null); ok(st?.dialog?.name === 'KENNY', 'F at the bar: Kenny talks', JSON.stringify(st?.dialog || null));
  await pg.screenshot({ path: `${out}/tavern-kenny.png` });
  const i = st?.dialog?.choices?.findIndex((c) => /Tsingtao 青島/.test(c)) ?? -1; if (i >= 0) await pg.evaluate((i) => window.__game.tavernPeople.kit.choose(i), i); await pg.waitForTimeout(400);
  st = await pg.evaluate(() => window.__game.tavernPeople.kit.state()); ok(st.inv.includes('tsingtao'), 'bought a Tsingtao from Kenny', JSON.stringify({ inv: st.inv, cash: st.cash, text: st.dialog?.text }));
  await pg.evaluate(() => window.__game.tavernPeople.kit.close()); await pg.keyboard.press('KeyB'); await pg.waitForTimeout(800);
  st = await pg.evaluate(() => window.__game.tavernPeople.kit.state()); ok(st.drunk > 0 && !st.inv.includes('tsingtao'), 'B: drank it', JSON.stringify({ drunk: st.drunk }));
  // Kenny from anywhere along the counter, even right beside a regular on his stool (friends: "keeps saying to talk to other people")
  const who = []; for (const dz of [-3.2, -1, 1.5, 3.6]) { await pg.evaluate((dz) => { const k = window.__game.tavernPeople.kenny(); window.__game.tavernPeople.kit.close(); window.__game.teleport(k[0] - 0.25, k[1], window.__game.tavern.zone.oz + 18.5 + dz, -Math.PI / 2, 0); }, dz); await pg.waitForTimeout(500);
    await pg.keyboard.press('KeyF'); await pg.waitForTimeout(400); who.push(await pg.evaluate(() => window.__game.tavernPeople.kit.state().dialog?.name || null)); }
  await pg.evaluate(() => window.__game.tavernPeople.kit.close());
  ok(who.every((n) => n === 'KENNY'), 'F anywhere at the counter talks to Kenny', JSON.stringify(who));
  // the crew walks up to a stranger
  await pg.evaluate(() => { const d = window.__game.tavern.door; window.__game.teleport(d[0] - 0.8, d[1], d[2] + 5.5, Math.PI - 0.6, 0.02); }); await pg.waitForTimeout(6000);
  const g = await pg.evaluate(() => ({ greeted: window.__game.tavernPeople.greeted(), crew: window.__game.tavernPeople.crew() })); ok(g.greeted, 'BIG TONY walks up and says his piece', JSON.stringify(g.crew[0]));
  await pg.screenshot({ path: `${out}/tavern-crew.png` });
  await pg.evaluate(() => { const d = window.__game.tavern.door; window.__game.teleport(d[0] - 2.2, d[1], d[2] + 10.5, Math.PI + 1.25, 0.05); }); await pg.waitForTimeout(1500);
  await pg.screenshot({ path: `${out}/tavern-regulars.png` });
}
if (parts.includes('back')) {
  // ---- out the back door into the smoking yard; the restroom ----
  const bk = await pg.evaluate(() => window.__game.tavern.back());
  await pg.evaluate((bk) => window.__game.teleport(bk.exitX, 0.15, bk.z1 - 1.2, Math.PI, 0), bk); await pg.waitForTimeout(500);
  const yawIn = await pg.evaluate(() => window.__ctx.player.rotation?.y ?? 0); void yawIn;
  let p = null; for (const yaw of [Math.PI, 0]) { await pg.evaluate(([bk, yaw]) => window.__game.teleport(bk.exitX, 0.15, bk.z1 - 1.2, yaw, 0), [bk, yaw]); await pg.waitForTimeout(300); await walk(pg, 'KeyW', 2200); p = await pos(pg); if (p[2] > bk.z1 + 1.5) break; }
  ok(p[2] > bk.z1 + 1.5, 'walked through the back door into the yard', JSON.stringify({ p, z1: bk.z1 }));
  await pg.screenshot({ path: `${out}/tavern-yard.png` });
  await pg.evaluate((bk) => window.__game.teleport(bk.yard[0] - 1.2, bk.yard[1], bk.yard[2] - 1.5, 0, 0), bk); await pg.waitForTimeout(700); await pg.keyboard.press('KeyF'); await pg.waitForTimeout(700);
  const sm = await pg.evaluate(() => window.__game.tavernPeople.kit.state()); ok(!!sm, 'F in the yard: a smoke', JSON.stringify({ inv: sm?.inv }));
  await pg.evaluate((bk) => window.__game.teleport(bk.urinal[0], bk.urinal[1], bk.urinal[2], -Math.PI / 2, 0), bk); await pg.waitForTimeout(700); await pg.keyboard.press('KeyF'); await pg.waitForTimeout(500);
  ok(await pg.evaluate(() => window.__game.tavern.peeT() > 0), 'F at the urinal: relief');
  await pg.screenshot({ path: `${out}/tavern-wc.png` });
  // the bar is on the left now (mirrored): a look from the door
  await toDoor(pg, -1.5); await pg.waitForTimeout(1200); await pg.screenshot({ path: `${out}/tavern-room.png` });
  // the back of the room: the kitchen, the restrooms, the corridor to the yard door
  await pg.evaluate((bk) => window.__game.teleport(-0.8, 0.15, bk.z1 - 7, Math.PI, 0.02), bk); await pg.waitForTimeout(1200); await pg.screenshot({ path: `${out}/tavern-back.png` });
  await pg.evaluate((bk) => window.__game.teleport(-1.6, 0.15, bk.z1 + 6.5, 0, 0.05), bk); await pg.waitForTimeout(1200); await pg.screenshot({ path: `${out}/tavern-mural.png` });
}
// my dart for what's left: T20 when far, then the number that finishes
const finish = (pg, b = 0) => pg.evaluate((b) => { const G = window.__game.darts, T = G.table(b), me = T.seats[T.turn], t = T.mode === '2v2' ? T.turn % 2 : T.turn, left = T.score[t];
  const a = left > 60 ? G.aim(20, 'triple') : left === 50 ? G.aim(50) : left <= 20 ? G.aim(left, 'single') : left <= 40 && left % 2 === 0 ? G.aim(left / 2, 'double') : left % 3 === 0 ? G.aim(left / 3, 'triple') : G.aim(left > 40 ? 20 : 1, 'single'); return G.throwAt(a[0], a[1]); }, b);
async function playOut(pg, name, b = 0) { for (let i = 0; i < 120; i++) { const T = await pg.evaluate((b) => window.__game.darts.table(b), b); if (!T || T.phase === 'over') return T; if (T.seats[T.turn]?.id === await pg.evaluate(() => window.__ctx.net?.id || 'me')) await finish(pg, b); await pg.waitForTimeout(450); } return null; }
if (parts.includes('darts')) {
  // ---- F at the line opens the board; a leg against Ah Fai to a finish ----
  const bd = await pg.evaluate(() => { const o = window.__game.tavern.boards[0].oche; window.__game.teleport(o.x, o.y, o.z, Math.PI, 0); return o; }); await pg.waitForTimeout(800);
  await pg.keyboard.press('KeyF'); await pg.waitForTimeout(700);
  ok(await pg.evaluate(() => !!document.querySelector('.darts') && !!window.__game.darts.ui()), 'F at the oche opens the board');
  await pg.screenshot({ path: `${out}/darts-lobby.png` });
  const sc = await pg.evaluate(() => { const G = window.__game.darts; return [G.scoreAt(0, 0).v, G.scoreAt(0, 0.605).label, G.scoreAt(0, 0.976).label, G.scoreAt(0.4, 0).label, G.scoreAt(0, 1.2).v]; });
  ok(JSON.stringify(sc) === JSON.stringify([50, 'T20', 'D20', '6', 0]), 'board scoring (bull, T20, D20, 6, miss)', JSON.stringify(sc));
  await pg.evaluate(() => window.__game.darts.vsAI()); await pg.waitForTimeout(400);
  const d0 = await pg.evaluate(() => window.__game.darts.difficulty().sway);
  await pg.mouse.move(600, 300); await pg.waitForTimeout(400); await pg.screenshot({ path: `${out}/darts-sober.png` });
  const T = await playOut(pg, 'solo'); ok(T?.phase === 'over' && T.win >= 0, 'a leg of 301 vs Ah Fai to a checkout', JSON.stringify(T && { note: T.note, score: T.score }));
  await pg.screenshot({ path: `${out}/darts-over.png` });
  // drink up: the aim sways harder, double vision
  await pg.evaluate(() => window.__game.darts.drink('erguotou')); await pg.waitForTimeout(3500); await pg.evaluate(() => window.__game.darts.drink('boilermaker')); await pg.waitForTimeout(3500);
  const d1 = await pg.evaluate(() => window.__game.darts.difficulty());
  ok(d1.sway > d0 * 2, 'two drinks in: the aim sways a lot more', JSON.stringify({ d0, d1 }));
  await pg.evaluate(() => { window.__game.darts.close(); window.__game.darts.open(0); }); await pg.waitForTimeout(300); await pg.evaluate(() => window.__game.darts.vsAI()); await pg.mouse.move(600, 300); await pg.waitForTimeout(800);
  await pg.screenshot({ path: `${out}/darts-drunk.png` }); await pg.evaluate(() => window.__game.darts.close());
  ok(d0 > 0 && d0 < 0.1, 'sober: a steady hand', d0);
  ok(!errs.length, 'no page errors (darts)', JSON.stringify(errs.slice(0, 3)));
}
if (parts.includes('mp')) {
  // ---- two players: A opens a board, B (on the boardwalk in Coney) gets the banner, JOIN walks B to the line, they play ----
  const A = await open('DA'), B = await open('DB');
  await B.evaluate(() => window.__game.teleport(-47, 0, -226, 0, 0)); await A.waitForTimeout(6000);
  await A.evaluate(() => { const o = window.__game.tavern.boards[0].oche; window.__game.teleport(o.x, o.y, o.z, Math.PI, 0); window.__game.darts.open(0); });
  let ban = false; for (let i = 0; i < 20 && !ban; i++) { await B.waitForTimeout(500); ban = await B.evaluate(() => !!document.querySelector('.dt-banner')); }
  ok(ban, 'B in Coney gets the darts banner');
  await B.screenshot({ path: `${out}/darts-banner.png` });
  if (ban) await B.click('.dt-banner button');
  let seats = 0; for (let i = 0; i < 20 && seats < 2; i++) { await A.waitForTimeout(500); seats = await A.evaluate(() => window.__game.darts.table(0)?.seats.length || 0); }
  ok(seats === 2, 'JOIN: B is at the line with A', seats);
  ok(await B.evaluate(() => window.__game.tavern.state().inBar), 'B walked to the tavern');
  await A.evaluate(() => window.__game.darts.start()); await A.waitForTimeout(800);
  const both = await Promise.all([playOut(A, 'A', 0), playOut(B, 'B', 0)]);
  ok(both[0]?.phase === 'over' && both[1]?.phase === 'over' && both[0].win === both[1].win, 'A and B play a leg to a finish, same result', JSON.stringify(both.map((t) => t && { n: t.note, s: t.score })));
  await B.screenshot({ path: `${out}/darts-mp.png` });
}
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
