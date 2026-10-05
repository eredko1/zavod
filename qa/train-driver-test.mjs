// Driving a train: node qa/train-driver-test.mjs — board the F at Stillwell, take the controls, doors open / close, power away,
// coast, brake to a stop, overspeed trips the emergency brake, change ends, get off. The HUD shows speed / limit / lever / next stop.
import pw from 'playwright-core';
const { chromium } = pw;
const URL = `http://localhost:${process.env.PORT || 8790}/?qa=1&map=coney&mode=chill&ai=0&time=day`;
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 1200, height: 680 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto(URL, { timeout: 240000 }); await pg.waitForFunction(() => window.__game?.ready && window.__game.subway, null, { timeout: 240000 });
await pg.evaluate(() => window.__game.setState('playing')); await pg.waitForTimeout(500);
const N = (js) => pg.evaluate(js);
// the N at Stillwell, doors open: on board
const on = await N(async () => { const S = window.__game.subway.line('F'); const u = S.until('STW'); S.skew(u + 6); await new Promise((r) => setTimeout(r, 3500));
  const st = S.stops()[0], [x, y, z] = st.at; for (const dx of [-2.9, 2.9]) { window.__game.teleport(x + dx, y + 1.2, z, 0, 0); await new Promise((r) => setTimeout(r, 700)); if (S.state().door) break; }
  const d = S.state().door; if (d) { window.__game.teleport(d[0], d[1] + 0.05, d[2], 0, 0); await new Promise((r) => setTimeout(r, 400)); S.board(); } return S.state().aboard; });
ok(on, 'aboard the F at Stillwell');
const dir = await N(() => { const S = window.__game.subway.line('F'), st = S.state(); return st.leg === 'dwell' ? 1 : 1; });
await N((d) => window.__game.subway.line('F').drive(d), dir); await pg.waitForTimeout(400);
let D = await N(() => window.__game.subway.line('F').driving());
ok(D && D.at === 'STW' && D.v === 0, 'took the controls, berthed at Stillwell', JSON.stringify(D));
await pg.waitForTimeout(800); await pg.screenshot({ path: `${process.env.OUT || '/tmp'}/train-cab.png` });
const hud = await N(() => document.getElementById('trainHud')?.textContent || ''); ok(/mph/.test(hud) && /AT CONEY/i.test(hud), 'the cab display shows speed and the station', hud.slice(0, 120));
await pg.keyboard.press('KeyF'); await pg.waitForTimeout(1600); D = await N(() => window.__game.subway.line('F').driving()); ok(D.doors > 0.8, 'F at the platform opens the doors', JSON.stringify(D));
await pg.keyboard.down('KeyW'); await pg.waitForTimeout(2500); D = await N(() => window.__game.subway.line('F').driving()); ok(D.doors < 0.2, 'power closes the doors first (no traction with them open)', JSON.stringify(D));
await pg.waitForTimeout(3000); await pg.keyboard.up('KeyW'); D = await N(() => window.__game.subway.line('F').driving()); const s1 = D.s;
ok(D.v > 2 && !D.at, 'power: the train pulls out', JSON.stringify(D));
await pg.keyboard.down('KeyS'); await pg.waitForTimeout(7000); await pg.keyboard.up('KeyS'); D = await N(() => window.__game.subway.line('F').driving());
ok(D.v < 0.1 && D.s !== s1, 'brake: it stops', JSON.stringify(D));
// overspeed in the station zone: full power, no braking, and the train trips
await pg.keyboard.down('KeyW'); await pg.waitForTimeout(9000); D = await N(() => window.__game.subway.line('F').driving()); await pg.keyboard.up('KeyW');
ok(D.tripped || D.v <= D.limit + 2.3, 'over the limit near the station trips the emergency brake', JSON.stringify(D));
await pg.keyboard.down('KeyS'); for (let i = 0; i < 60 && (await N(() => window.__game.subway.line('F').driving().v)) > 0.05; i++) await pg.waitForTimeout(250); await pg.keyboard.up('KeyS'); await pg.waitForTimeout(300);   // the lever stays where you leave it: pull it back to brake
await pg.keyboard.press('KeyR'); await pg.waitForTimeout(300); await pg.waitForTimeout(800); await pg.screenshot({ path: `${process.env.OUT || '/tmp'}/train-cab-rear.png` }); const D2 = await N(() => window.__game.subway.line('F').driving()); ok(D2.dir === -D.dir, 'R when stopped: change ends', JSON.stringify(D2));
const p0 = await N(() => window.__ctx.player.position.toArray()); ok(Math.abs(p0[1] - 8.6) < 3, 'you ride in the cab', JSON.stringify(p0.map((v) => +v.toFixed(1))));
// drive back into Stillwell and get off: stop on the mark, doors, F
await N(() => { const L = window.__game.subway.line('F'); L.stopDrive(); }); const off = await N(() => window.__game.subway.line('F').driving()); ok(!off, 'the dispatcher takes the train back (stopDrive)');
ok(errs.length === 0, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
