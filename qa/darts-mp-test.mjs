// Darts at Soc Tav over the net, through a bad connection: node qa/darts-mp-test.mjs [outdir] [--fault=loss=0.25,delay=700,dup=0.2]
// Three clients (A, B, C) in one room, every incoming message dropped / delayed / reordered / doubled by net.js's ?netfault. Checks:
// a friend who walks up long after the board was opened joins THAT board (not a second one), a full 301 game plays out with every
// dart counted once and all clients agreeing, PLAY AGAIN from a guest re-racks the same players, two boards opened at the same moment
// settle on one, a thrower who sits on their turn loses it, the host walking off mid-game hands the board on, and the host's tab
// freezing mid-game (CDP page freeze: a locked phone) lets the next player take over and finish.
import pw from 'playwright-core';
const { chromium } = pw;
const out = process.argv.slice(2).find((a) => !a.startsWith('--')) || '/tmp';
const FAULT = (process.argv.find((a) => a.startsWith('--fault=')) || '--fault=loss=0.25,delay=700,dup=0.2').slice(8);
const room = 'dt' + Math.random().toString(36).slice(2, 6), PORT = process.env.PORT || 8790;
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const errs = [];
const mk = async (n) => { const p = await b.newPage({ viewport: { width: 700, height: 500 } }); p.on('pageerror', (e) => errs.push(n + ': ' + e.message));
  await p.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
  await p.goto(`http://localhost:${PORT}/?qa=1&mp=1&room=${room}&map=coney&mode=chill&ai=0&time=day&name=${n}&netfault=${FAULT}&dtturn=6000`, { timeout: 180000 });
  await p.waitForFunction(() => window.__game?.ready && window.__ctx.net?.connected && window.__game.darts, null, { timeout: 180000 });
  await p.evaluate(() => window.__game.setState('playing')); return p; };
const setHidden = (p, h) => p.evaluate((h) => { Object.defineProperty(document, 'hidden', { get: () => h, configurable: true }); Object.defineProperty(document, 'visibilityState', { get: () => (h ? 'hidden' : 'visible'), configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, h);   // a phone locking: hidden first, then frozen
const until = async (fn, ms = 15000, step = 150) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await new Promise((r) => setTimeout(r, step)); } };
const T = (p) => p.evaluate(() => { const t = window.__game.darts.table(0); return t && JSON.parse(JSON.stringify(t)); });
const id = (p) => p.evaluate(() => window.__game.darts.me());
const A = await mk('ALPHA'), B = await mk('BRAVO'), C = await mk('CHARLIE');
await until(async () => (await Promise.all([A, B, C].map((p) => p.evaluate(() => window.__ctx.net.list().length)))).every((n) => n >= 2), 40000);
const [iA, iB, iC] = [await id(A), await id(B), await id(C)];

// ---- A opens the board; B walks up 25 s later (the old code forgot the board after 20 s and opened a second one) ----
await A.evaluate(() => window.__game.darts.open(0));
await new Promise((r) => setTimeout(r, 25000));
await B.evaluate(() => window.__game.darts.open(0));
let tb = await until(async () => { const [a, bb] = [await T(A), await T(B)]; return a && bb && a.id === bb.id && a.seats.length === 2 && bb.seats.some((s) => s.id === iB) && a.seq === bb.seq && a; });
ok(!!tb && tb.host === iA, 'B walks up 25 s after A opened the board: joins A\'s board (no second board)', JSON.stringify(tb?.seats));

/** throw for whoever's turn it is, until the game is over; returns how many darts each client threw */
async function playOut(clients, { max = 400, aim = async () => [Math.random() * 0.6 - 0.3, Math.random() * 0.6 - 0.3] } = {}) {
  const thrown = new Map(); let lastSeq = -1, still = 0;
  for (let i = 0; i < max; i++) {
    const ts = await Promise.all(clients.map(T)); const host = ts.find(Boolean);
    if (!host) return { res: 'no-table', thrown };
    if (host.phase === 'over') return { res: 'over', thrown };
    still = host.seq === lastSeq ? still + 1 : 0; lastSeq = host.seq; if (still > 120) return { res: 'stuck', thrown, host };
    let did = false;
    for (const c of clients) { const u = await c.evaluate(() => window.__game.darts.ui()); if (u?.myTurn) { const [x, y] = await aim(c); await c.evaluate(([x, y]) => window.__game.darts.throwAt(x, y), [x, y]); thrown.set(c, (thrown.get(c) || 0) + 1); did = true; } }
    await new Promise((r) => setTimeout(r, did ? 300 : 200));
  }
  return { res: 'max', thrown };
}
const agree = async (clients) => until(async () => { const ts = await Promise.all(clients.map(T)); return ts.every((t) => t && t.id === ts[0].id && t.seq === ts[0].seq && JSON.stringify(t.score) === JSON.stringify(ts[0].score) && t.phase === ts[0].phase) && ts[0]; }, 15000);

/** a perfect thrower: treble 20 while far off, then the checkout (the darts land exactly where aimed: throwAt) */
const checkout = (c) => c.evaluate(() => { const D = window.__game.darts, t = D.table(0), left = t.score[t.mode === '2v2' ? t.turn % 2 : t.turn];
  if (left > 60) return D.aim(20, 'triple'); if (left === 50) return D.aim(50); if (left <= 20) return D.aim(left, 'single'); if (left % 3 === 0) return D.aim(left / 3, 'triple'); if (left % 2 === 0 && left <= 40) return D.aim(left / 2, 'double'); return D.aim(left - 40 > 0 ? 20 : Math.max(1, left - 20), 'single'); });
// ---- a 1v1 game, A vs B, through the bad connection ----
await A.evaluate(() => window.__game.darts.start());
const g1 = await playOut([A, B], { aim: checkout });
let fin = await agree([A, B]);
ok(g1.res === 'over' && !!fin && fin.win >= 0, 'game 1 (A v B) plays to a checkout through the lossy connection; both agree on the result', JSON.stringify({ res: g1.res, note: fin?.note, score: fin?.score }));
await A.screenshot({ path: `${out}/darts-mp-end.png` });

// ---- PLAY AGAIN from the guest: the same two, straight into game 2 ----
await B.evaluate(() => window.__game.darts.again());
tb = await until(async () => { const [a, bb] = [await T(A), await T(B)]; return a?.phase === 'play' && bb?.phase === 'play' && a.seq === bb.seq && a; }, 15000);
ok(!!tb && tb.seats.map((s) => s.id).join() === [iA, iB].join(), 'PLAY AGAIN from B (not the host): the same board re-racks A and B into game 2', JSON.stringify(tb?.seats));
// a thrower who sits on their turn (6 s here) loses it
for (let k = 0; k < 6 && (await T(A)).seats[(await T(A)).turn].id !== iB; k++) { await A.evaluate(() => window.__game.darts.throwAt(0, -0.2)); await new Promise((r) => setTimeout(r, 400)); }   // A's darts first: it's B who sits
const t0 = await T(A); const who = t0.seats[t0.turn].id;
const sat = await until(async () => { const t = await T(A); return t.turnN > t0.turnN && t; }, 20000);
ok(!!sat && /too long/.test(sat.note || ''), 'a thrower who sits on their turn loses the rest of it', JSON.stringify({ who, note: sat?.note }));
// the host walks off mid-game: B keeps the board, AH FAI throws for A, the game finishes
await A.evaluate(() => window.__game.darts.close());
tb = await until(async () => { const t = await T(B); return t?.host === iB && t.seats.some((s) => s.id === 'ahfai') && t; }, 15000);
ok(!!tb, 'the host (A) walks off mid-game: B keeps the board, AH FAI takes A\'s seat', JSON.stringify(tb?.seats));
const g2 = await playOut([B], { aim: checkout });
ok(g2.res === 'over', 'B and AH FAI finish game 2', g2.res);
await B.evaluate(() => window.__game.darts.close()); await new Promise((r) => setTimeout(r, 3000));

// ---- two boards opened at the same moment (A and C): one board for everyone a few seconds later ----
await Promise.all([A.evaluate(() => window.__game.darts.open(0)), C.evaluate(() => window.__game.darts.open(0))]);
tb = await until(async () => { const [a, c] = [await T(A), await T(C)]; return a && c && a.id === c.id && a.seq === c.seq && a.seats.some((s) => s.id === iA) && a.seats.some((s) => s.id === iC) && a; }, 20000);
ok(!!tb, 'A and C open the board at the same moment: they end up on one board together', JSON.stringify({ host: tb?.host, seats: tb?.seats }));

// ---- the host's tab freezes mid-game (a locked phone): the other player takes over and finishes ----
const host = tb?.host === iA ? A : C, other = host === A ? C : A, iO = host === A ? iC : iA;
await host.evaluate(() => window.__game.darts.start());
await until(async () => (await T(other))?.phase === 'play', 10000);
await playOut([A, C], { max: 6 });
await setHidden(host, true); await new Promise((r) => setTimeout(r, 500)); const cdp = await host.context().newCDPSession(host); await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
tb = await until(async () => { const t = await T(other); return t?.host === iO && t; }, 30000);
if (!tb) console.log('DBG', JSON.stringify(await other.evaluate(() => window.__game.darts.dbg())), JSON.stringify(await T(other)));
ok(!!tb, 'the host\'s tab freezes mid-game: the other player takes the board over', JSON.stringify({ host: tb?.host, note: tb?.note }));
const g3 = await playOut([other], { aim: checkout });
if (g3.res !== 'over') console.log('DBG3', JSON.stringify(g3.host), JSON.stringify(await other.evaluate(() => ({ ui: window.__game.darts.ui(), dbg: window.__game.darts.dbg() }))));
ok(g3.res === 'over', 'and finishes the game against AH FAI', g3.res);
await cdp.send('Page.setWebLifecycleState', { state: 'active' }); await setHidden(host, false); await new Promise((r) => setTimeout(r, 3000));
const back = await until(async () => { const [h, o] = [await T(host), await T(other)]; return h && o && h.id === o.id && h.host === iO && h.seq === o.seq && h; }, 15000);
ok(!!back, 'the frozen host comes back and sees the board as it is now (not its old copy)', JSON.stringify({ host: back?.host }));

ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
