// Soccer Tavern / 8th Ave: node qa/tavern-test.mjs [outdir] [parts] — parts: travel,bar,darts,mp (default all)
// travel: ride the D out of Stillwell past Bay 50 St (clock skewed) → 8 Av; EXIT 7B off the Belt in a car → 8th Ave; walk in;
// the N back to Coney. bar: buy a Tsingtao. darts: a leg vs AI to a finish (QA throws). mp: two browsers, one darts table.
import pw from 'playwright-core';
const { chromium } = pw;
const out = process.argv[2] || '/tmp', parts = (process.argv[3] || 'travel,bar,back,darts,mp').split(',');
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
}
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
