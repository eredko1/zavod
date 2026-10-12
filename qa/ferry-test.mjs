// NYC Ferry: node qa/ferry-test.mjs [outdir]  (PORT env, default 8790)
// Boarding at the Coney barge, walking up the aisle to the bar (benches don't snag), the countdown boards ticking, two boats at each
// landing, the hull never inside the pier / a barge / the spare boat over a whole timetable, landing on her at sea (and jumping off),
// the big GET OFF button, getting off at Bay Ridge.
import pw from 'playwright-core';
const { chromium } = pw;
const out = process.argv[2] || '/tmp';
const URL = `http://localhost:${process.env.PORT || 8790}/?qa=1&map=coney&mode=chill&ai=0&time=day`;
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 1200, height: 680 } });
pg.on('pageerror', (e) => { console.log('PAGEERROR', e.message); fails++; });
pg.on('console', (m) => { if (/\[update:|\[ferry\]/.test(m.text())) console.log(m.text()); });
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
await pg.goto(URL, { timeout: 180000 }); await pg.waitForFunction(() => window.__game?.ready && window.__game.ferry, null, { timeout: 180000 });
await pg.evaluate(() => window.__game.setState('playing')); await pg.waitForTimeout(800);
const S = () => pg.evaluate(() => window.__game.ferry.state());
const wait = (ms) => pg.waitForTimeout(ms);

// ---- the hull never inside the pier, a barge or the spare boat (the whole timetable, both landings) ----
const cl = await pg.evaluate(() => window.__game.ferry.clearance());
ok(cl.hits === 0, 'hull clear of the pier, barges and spare boats all cycle', JSON.stringify(cl));

// ---- Coney: two boats, the board counting down ----
await pg.evaluate(() => window.__game.ferry.skew(10)); await wait(1500);
const n1 = await pg.evaluate(() => window.__game.ferry.boats()); ok(n1.coney === 2, 'two boats at the Coney landing', JSON.stringify(n1));
const spot = await pg.evaluate(() => window.__game.ferry.spot);
await pg.evaluate(([x, y, z]) => window.__game.teleport(x, y, z, Math.PI, 0), spot); await wait(1200);
const c1 = await pg.evaluate(() => { window.__game.ferry.paint(); return window.__game.ferry.clock()[0]; }); await wait(2200);
const c2 = await pg.evaluate(() => { window.__game.ferry.paint(); return window.__game.ferry.clock()[0]; });
const secs = (t) => { const m = /(\d+):(\d\d)$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : NaN; };
ok(/^NEXT FERRY TO BAY RIDGE {2}\d+:\d\d$/.test(c1) && secs(c1) - secs(c2) >= 1 && secs(c1) - secs(c2) <= 4, 'Coney board counts down', `${c1} → ${c2}`);
const st0 = await S(); ok(st0.big, 'big BOARD button on the barge while she is in', JSON.stringify(st0));
await pg.screenshot({ path: `${out}/ferry-barge.png` });
// the barge is walkable: stand on it, still there after a second
const pz = await pg.evaluate(() => window.__ctx.player.position.y); ok(pz > -2.2 && pz < -1.2, 'standing on the barge deck', pz.toFixed(2));

// ---- board with F, walk up the aisle to the bar ----
await pg.keyboard.press('KeyF'); await wait(600);
let st = await S(); ok(st.aboard, 'boarded with F at the gate', JSON.stringify(st));
await pg.evaluate(() => { const p = window.__ctx.player; p.yaw = 0; p.pitch = 0; });   // bow is −z: yaw 0 looks forward while docked
await pg.keyboard.down('KeyW'); await wait(4800); await pg.keyboard.up('KeyW');
st = await S(); ok(st.deck[1] < -1.2, 'walked up the aisle to the bar', JSON.stringify(st.deck));
await pg.keyboard.down('KeyA'); await wait(500); await pg.keyboard.up('KeyA');
st = await S(); const bar = await pg.evaluate(() => window.__game.ferry.bar);
ok(Math.hypot(st.deck[0] - bar[0], st.deck[1] - bar[1]) < 1.7, 'at the bar', JSON.stringify(st.deck));
await pg.screenshot({ path: `${out}/ferry-bar.png` });
// benches: diagonal into a bench row slides along it (no dead stop)
await pg.keyboard.down('KeyS'); await pg.keyboard.down('KeyD'); await wait(2500); await pg.keyboard.up('KeyS'); await pg.keyboard.up('KeyD');
const st2 = await S(); ok(st2.deck[1] - st.deck[1] > 2, 'slid along the benches walking back (no snag)', `${JSON.stringify(st.deck)} → ${JSON.stringify(st2.deck)}`);
ok(st2.label === 'GET OFF · CONEY ISLAND', 'GET OFF button label while docked', st2.label);

// ---- Bay Ridge: two boats, the board, get off ----
await pg.evaluate(() => window.__game.ferry.skew(124)); await wait(3500);
st = await S(); ok(st.bayRidge && st.label === 'GET OFF · BAY RIDGE' && st.big, 'big GET OFF at Bay Ridge', JSON.stringify(st));
const n2 = await pg.evaluate(() => window.__game.ferry.boats()); ok(n2.bayRidge === 2, 'two boats at the Bay Ridge landing', JSON.stringify(n2));
const c3 = await pg.evaluate(() => { window.__game.ferry.paint(); return window.__game.ferry.clock()[1]; }); ok(/^NEXT FERRY TO CONEY ISLAND {2}0:1\d$/.test(c3), 'Bay Ridge board', c3);
await pg.evaluate(() => { window.__ctx.player.yaw += Math.PI / 2; }); await wait(800); await pg.screenshot({ path: `${out}/ferry-bayridge.png` });
await pg.keyboard.press('KeyF'); await wait(3500);
st = await S(); const inTav = await pg.evaluate(() => window.__game.tavern?.state?.().inZone);
ok(!st.aboard && inTav, 'got off at Bay Ridge (up the B70 to Soc Tav)', JSON.stringify({ aboard: st.aboard, inTav }));

// ---- land on her at sea from the air, ride along, jump off ----
await pg.evaluate(() => window.__game.ferry.skew(64)); await wait(1500);
const drop = await pg.evaluate(async () => { const G = window.__game.ferry, c = window.__ctx; const g = c.scene.getObjectByName('nycFerry'); g.updateMatrixWorld();
  const p = new c.THREE.Vector3(0, 3.95 + 1.0, 4).applyMatrix4(g.matrixWorld); window.__game.teleport(p.x, p.y, p.z, 0, 0);
  for (let i = 0; i < 40 && !G.state().aboard; i++) await new Promise((r) => setTimeout(r, 50)); return G.state(); });
ok(drop.aboard, 'dropped onto the moving deck: a passenger', JSON.stringify(drop));
const a0 = await S(); await wait(1500); const a1 = await S();
ok(a1.aboard && Math.hypot(a1.pos[0] - a0.pos[0], a1.pos[2] - a0.pos[2]) > 5 && Math.hypot(a1.deck[0] - a0.deck[0], a1.deck[1] - a0.deck[1]) < 0.2, 'rides along with her under way', `${a0.pos} → ${a1.pos}`);
const fe = await pg.evaluate(() => window.__ctx.ferry.local()); ok(Array.isArray(fe), 'deck spot for net.js fe', JSON.stringify(fe));
await pg.screenshot({ path: `${out}/ferry-atsea.png` });
await pg.keyboard.down('Space'); await wait(200); await pg.keyboard.up('Space'); await wait(200);
ok(!(await S()).aboard, 'jumped off at sea', '');
await pg.evaluate(() => window.__game.ferry.skew(10)); await wait(500);

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
