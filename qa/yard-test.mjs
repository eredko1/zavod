// Coney Island Yard: node qa/yard-test.mjs [outdir] — the yard is built (tracks, laid-up trains, no houses on it), the D driven
// north with the switch thrown runs down the lead into a yard track and stops at the bumper; step off and it stays laid up
// there, you're on the ballast and can walk; the F driven north through Stillwell (onto the D's track) takes the yard too.
import pw from 'playwright-core';
const { chromium } = pw;
const out = process.argv[2] || '/tmp';
const URL = `http://localhost:${process.env.PORT || 8790}/?qa=1&map=coney&mode=chill&ai=0&time=day`;
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 1200, height: 680 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto(URL, { timeout: 240000 }); await pg.waitForFunction(() => window.__game?.ready && window.__game.subway, null, { timeout: 240000 });
await pg.evaluate(() => window.__game.setState('playing')); await pg.waitForTimeout(500);
const N = (js, a) => pg.evaluate(js, a);

const y0 = await N(() => window.__game.subway.yard());
ok(y0 && y0.parked.length >= 3 && y0.free.length >= 3, 'the yard: tracks, trains laid up, free tracks', JSON.stringify(y0));
await N(() => { window.__game.teleport(120, 60, -600, 0, -0.75); }); await pg.waitForTimeout(2500); await pg.screenshot({ path: `${out}/yard-overview.png` });

// board a line's train at Stillwell (doors open) and take the controls
const boardAt = async (id) => {
  await N(async (id) => { const S = window.__game.subway.line(id); for (let i = 0; i < 400; i++) { const st = S.state(); if (st.leg === 'dwell' && st.stop === 'STW') break; S.skew(1); await new Promise((r) => setTimeout(r, 20)); } }, id);
  await pg.waitForTimeout(3500);
  const c = await N((id) => window.__game.subway.line(id).debug().cars[2], id);
  for (const dx of [-3, 3, -6, 6, 0]) { await N(([x, y, z]) => window.__game.teleport(x, y + 1.2, z, 0, 0), [c[0] + dx, c[1], c[2]]); await pg.waitForTimeout(600);
    if (await N((id) => { const S = window.__game.subway.line(id); S.board(); return S.state().aboard; }, id)) return true; }
  return false;
};
// throw the switch to the yard, put the train just short of it, and drive in: power, then brake for the bumper
const intoYard = async (id, dir) => {
  await N(([id, d]) => window.__game.subway.line(id).drive(d), [id, dir]); await pg.waitForTimeout(400);
  await pg.keyboard.press('KeyY'); await pg.waitForTimeout(300);
  let D = await N((id) => window.__game.subway.line(id).driving(), id);
  const hud = await N(() => document.getElementById('trainHud')?.textContent || '');
  if (D.yk == null) return { D, hud };
  await N(([id, s]) => window.__game.subway.line(id).driveSet(s), [id, D.up ? D.ysJ - 12 : D.ysJ + 110 + 12]);
  await N(() => { window.__ctx.input.touch.axis.y = -0.5; });
  for (let i = 0; i < 240; i++) { await pg.waitForTimeout(500); D = await N((id) => window.__game.subway.line(id).driving(), id); const left = D.up ? D.L - 2 - D.s : D.s - 110 - 2; if (left < 22) break; }
  await N(() => { window.__ctx.input.touch.axis.y = 0.8; });
  for (let i = 0; i < 30 && D.v > 0.05; i++) { await pg.waitForTimeout(400); D = await N((id) => window.__game.subway.line(id).driving(), id); }
  await N(() => { window.__ctx.input.touch.axis.y = 0; });
  const cars = await N((id) => window.__game.subway.line(id).debug().cars, id);
  return { D, hud, cars };
};

ok(await boardAt('D'), 'aboard the D at Stillwell');
let r = await intoYard('D', 1);
ok(r.D.yk != null && /SWITCH YARD/.test(await N(() => document.getElementById('trainHud')?.textContent || '')), 'Y throws the switch to a yard track (cab display shows it)', JSON.stringify({ yk: r.D.yk, hud: r.hud.slice(-40) }));
const inYard = (c) => c.every((p) => p[2] < -640 && p[1] < 1.2 && p[0] > 20);
ok(r.cars && inYard(r.cars) && r.D.v < 0.1, 'the D runs down the lead into the yard and stops short of the bumper', JSON.stringify({ D: r.D, lead: r.cars?.[0] }));
await pg.waitForTimeout(500); await pg.screenshot({ path: `${out}/yard-cab.png` });
const yk = r.D.yk;
await pg.keyboard.press('KeyF'); await pg.waitForTimeout(800);
const y1 = await N(() => window.__game.subway.yard());
const me = await N(() => ({ pos: window.__ctx.player.position.toArray().map((v) => +v.toFixed(1)), aboard: window.__game.subway.line('D').state().aboard }));
ok(!me.aboard && y1.parked.includes(yk) && !y1.free.includes(yk), 'F: off the train; it stays laid up on its track', JSON.stringify({ yk, me, y1 }));
ok(me.pos[1] < 1 && me.pos[2] < -640, 'down on the ballast in the yard', JSON.stringify(me.pos));
const walk = (yaw, sec) => N(async ([yaw, sec]) => { const p = window.__ctx.player; p.yaw = yaw; await p.qaWalk({ x: 0, y: 1 }, sec, {}); return p.position.toArray().map((v) => +v.toFixed(1)); }, [yaw, sec]);
const me2 = await walk(Math.PI, 2);   // south, down the gap between two trains
ok(Math.hypot(me2[0] - me.pos[0], me2[2] - me.pos[2]) > 2 && me2[2] < -640, 'you can walk the yard (its own zone, not clamped back to the map)', JSON.stringify(me2));
const me3 = await walk(Math.PI / 2, 1.5);   // west, into the next track's laid-up train
ok(Math.abs(me3[0] - me2[0]) < 2, "the laid-up trains are solid (no walking through them)", JSON.stringify(me3));
await N(() => { const p = window.__ctx.player; p.yaw = 0; p.pitch = -0.1; }); await pg.waitForTimeout(800); await pg.screenshot({ path: `${out}/yard-ground.png` });

// the F north through Stillwell runs onto the D's track (backwards on its route): the yard switch works there too
ok(await boardAt('F'), 'aboard the F at Stillwell');
r = await intoYard('F', -1);
ok(r.D.yk != null && r.D.yk !== yk && r.cars && inYard(r.cars), 'the F, through Stillwell and north, takes a free yard track', JSON.stringify({ D: r.D, lead: r.cars?.[5] }));
// the switch can't be thrown under the train
await pg.keyboard.press('KeyY'); await pg.waitForTimeout(300);
const D3 = await N(() => window.__game.subway.line('F').driving());
ok(D3.yk === r.D.yk, 'no throwing the switch with the train past it', JSON.stringify(D3));
await N(() => window.__game.subway.line('F').stopDrive());
ok(errs.length === 0, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
