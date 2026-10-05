// Darts aiming and throwing: node qa/darts-aim-test.mjs [outdir]. Desktop: aim with the mouse, press and flick up to throw (the flick's
// speed is the power): a good flick lands, a slow lift doesn't throw, a wild one sails high; Space held and let go in the green throws.
// Phone: a finger flick throws. Plus the release model (soft drops, hard sails, sideways pulls) and the checkout hints.
import pw from 'playwright-core';
const { chromium } = pw;
const out = process.argv[2] || '/tmp', PORT = process.env.PORT || 8790;
const PAGE = `http://localhost:${PORT}/?qa=1&map=coney&mode=chill&time=day`;
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const errs = [];
const open = async (pg) => { pg.on('pageerror', (e) => errs.push(e.message)); await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
  await pg.goto(PAGE, { timeout: 180000 }); await pg.waitForFunction(() => window.__game?.ready && window.__game.darts, null, { timeout: 180000 });
  await pg.evaluate(() => { window.__game.setState('playing'); window.__game.darts.open(0); window.__game.darts.vsAI(); }); await pg.waitForTimeout(600); };
const darts = (pg) => pg.evaluate(() => { const t = window.__game.darts.table(0); return { n: t.darts.length, turn: t.turn, turnN: t.turnN, mine: window.__game.darts.ui()?.myTurn }; });
const fb = (pg) => pg.evaluate(() => window.__game.darts.ui()?.fb || null);
const myTurnAgain = (pg) => pg.waitForFunction(() => window.__game.darts.ui()?.myTurn, null, { timeout: 20000 }).catch(() => {});

// ---- the release model and the checkout table (pure functions) ----
const pg = await b.newPage({ viewport: { width: 1200, height: 800 } }); await open(pg);
const model = await pg.evaluate(async () => { const m = await import('/src/world/coney/darts.js'); const e = (p, s) => m.releaseError(p, s);
  return { good: e(1, 0), soft: e(0.6, 0), limp: e(0.3, 0), hard: e(1.5, 0), right: e(1, 0.8), left: e(1, -0.8), c170: m.checkout(170), c32: m.checkout(32), c3: m.checkout(3), c101: m.checkout(101), c171: m.checkout(171), c181: m.checkout(181), c41two: m.checkout(41, 2) }; });
ok(model.good.good && model.good.dx === 0 && model.good.dy === 0, 'a spot-on release lands where you aimed', JSON.stringify(model.good));
ok(model.soft.dy < 0 && model.limp.dy < model.soft.dy && /soft/.test(model.soft.msg), 'soft drops low, softer drops lower', JSON.stringify([model.soft, model.limp]));
ok(model.hard.dy > 0 && /hard/i.test(model.hard.msg), 'too hard sails high', JSON.stringify(model.hard));
ok(model.right.dx > 0 && model.left.dx < 0, 'a sideways flick pulls the dart that way', JSON.stringify([model.right.dx, model.left.dx]));
ok(model.c170?.join() === 'T20,T20,BULL' && model.c32?.join() === 'D16' && model.c3?.length === 1 && model.c101?.length === 2 && model.c171?.join() === 'T20,T20,T17' && model.c181 === null && model.c41two?.length === 2, 'checkout hints: 170 = T20 T20 BULL, 32 = D16, 171 = T20 T20 T17, 181 has none', JSON.stringify({ c170: model.c170, c32: model.c32, c3: model.c3, c101: model.c101, c171: model.c171, c181: model.c181, c41: model.c41two }));

// ---- desktop: aim with the mouse, press, flick up, let go ----
const geo = await pg.evaluate(() => { const r = document.querySelector('.darts canvas').getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, s: r.width / 2.5, H: innerHeight }; });
const at = (x, y) => [geo.cx + x * geo.s, geo.cy - y * geo.s];
async function aimTo(x, y) { const [px, py] = at(x, y); await pg.mouse.move(px, py, { steps: 8 }); await pg.waitForTimeout(700); return [px, py]; }
// the flick itself runs in the page, with real 16 ms frames between moves (a round trip per mouse step from here is slower than any flick)
async function flick(px, py, dist, ms, steps = 6) { await pg.evaluate(async ([px, py, dist, ms, steps]) => { const cv = document.querySelector('.darts canvas'), ev = (t, y) => cv.dispatchEvent(new PointerEvent(t, { clientX: px, clientY: y, pointerId: 7, pointerType: 'mouse', bubbles: true, cancelable: true }));
  const spin = (ms) => { const t = performance.now() + ms; while (performance.now() < t); };   // exact frames (headless timers run late)
  ev('pointerdown', py); for (let i = 1; i <= steps; i++) { spin(ms / steps); ev('pointermove', py - dist * i / steps); } ev('pointerup', py - dist); }, [px, py, dist, ms, steps]); await pg.waitForTimeout(500); }
let d0 = await darts(pg); let [px, py] = await aimTo(0, 0.605);
await flick(px, py, geo.H * 0.22, 100); let d1 = await darts(pg), f = await fb(pg);
ok(d1.n === d0.n + 1, 'mouse: aim at the treble 20, press and flick up: the dart is thrown', JSON.stringify({ before: d0.n, after: d1.n, fb: f?.msg }));
ok(f && /Perfect|Pulled/.test(f.msg), 'a flick at a good speed: "perfect release"', JSON.stringify({ f, ui: await pg.evaluate(() => window.__game.darts.ui()) }));
await pg.screenshot({ path: `${out}/darts-aim-desktop.png` });
[px, py] = await aimTo(0, 0.3); d0 = await darts(pg);
await pg.mouse.down(); for (let i = 1; i <= 6; i++) { await pg.mouse.move(px, py - 3 * i); await pg.waitForTimeout(60); } await pg.mouse.up(); await pg.waitForTimeout(400);
d1 = await darts(pg); f = await fb(pg); ok(d1.n === d0.n && /Flick up/.test(f?.msg || ''), 'a slow lift doesn\'t throw (it tells you to flick)', JSON.stringify({ n: [d0.n, d1.n], fb: f?.msg }));
[px, py] = await aimTo(0, 0.3); await flick(px, py, geo.H * 0.45, 60, 3); f = await fb(pg);
ok(/hard/i.test(f?.msg || ''), 'a wild flick sails high', JSON.stringify(f));
// keyboard: hold Space, let go when the swinging meter is in the green (~0.36 s in)
await myTurnAgain(pg); await aimTo(0, 0.605); d0 = await darts(pg);
await pg.keyboard.down('Space'); await pg.waitForTimeout(360); await pg.keyboard.up('Space'); await pg.waitForTimeout(500);
d1 = await darts(pg); f = await fb(pg);
ok(d1.n !== d0.n || d1.turnN !== d0.turnN, 'Space held and let go: thrown with the meter\'s power', JSON.stringify({ d0, d1, fb: f?.msg }));
ok(f && /Perfect|Pulled|soft|hard/.test(f.msg), 'the release gets feedback', JSON.stringify(f));
await pg.close();

// ---- a phone: drag the ring (it sits above the finger) onto the treble 20, flick up ----
const ph = await b.newPage({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true }); await open(ph);
const pgeo = await ph.evaluate(() => { const r = document.querySelector('.darts canvas').getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, s: r.width / 2.5, H: innerHeight }; });
const cdp = await ph.context().newCDPSession(ph);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const fx = pgeo.cx, fy = pgeo.cy - 0.605 * pgeo.s + 70;   // the finger, 70 px under the ring
d0 = await darts(ph);
await touch('touchStart', fx, fy + 30); for (let i = 1; i <= 6; i++) { await touch('touchMove', fx, fy + 30 - 5 * i); await ph.waitForTimeout(50); } await ph.waitForTimeout(700);
for (let i = 1; i <= 3; i++) { await touch('touchMove', fx, fy - pgeo.H * 0.36 * i / 3); } await touch('touchEnd'); await ph.waitForTimeout(500);   // each CDP touch takes ~50 ms here: big steps make a real flick's speed
d1 = await darts(ph); f = await fb(ph);
ok(d1.n === d0.n + 1, 'phone: drag to aim, flick up with the finger: thrown', JSON.stringify({ before: d0.n, after: d1.n, fb: f?.msg, ui: await ph.evaluate(() => window.__game.darts.ui()) }));
await ph.screenshot({ path: `${out}/darts-aim-phone.png` });
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
