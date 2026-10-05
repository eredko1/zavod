// The shared durak table through a bad connection: node qa/durak-stress-test.mjs [outdir] [--fault=loss=0.25,delay=700,dup=0.2]
// Three humans (A, B, C) + one AI seat, every incoming message dropped / delayed / reordered / doubled (net.js ?netfault). Checks: a
// whole game plays out with every client agreeing at every common seq; a player who stops moving gets their turns played by Sasha
// (here after 5 s) and the game goes on; the host's tab freezing mid-game (CDP page freeze: a locked phone) hands the table to the
// lowest remaining player, who finishes it; the frozen host, back, takes the table as it is now.
import pw from 'playwright-core';
const { chromium } = pw;
const out = process.argv.slice(2).find((a) => !a.startsWith('--')) || '/tmp';
const FAULT = (process.argv.find((a) => a.startsWith('--fault=')) || '--fault=loss=0.25,delay=700,dup=0.2').slice(8);
const room = 'dks' + Math.random().toString(36).slice(2, 6), PORT = process.env.PORT || 8790;
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const errs = [];
const mk = async (n) => { const p = await b.newPage({ viewport: { width: 700, height: 460 } }); p.on('pageerror', (e) => errs.push(n + ': ' + e.message));
  await p.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
  await p.goto(`http://localhost:${PORT}/?qa=1&mp=1&room=${room}&map=coney&ai=0&time=day&name=${n}&netfault=${FAULT}&dkturn=5000`, { timeout: 180000 });
  await p.waitForFunction(() => window.__game?.ready && window.__ctx.net?.connected && window.__game.durakMP, null, { timeout: 180000 });
  await p.evaluate(() => { window.__game.setState('playing'); window.__game.hangout?.give?.(100); }); return p; };
const setHidden = (p, h) => p.evaluate((h) => { Object.defineProperty(document, 'hidden', { get: () => h, configurable: true }); Object.defineProperty(document, 'visibilityState', { get: () => (h ? 'hidden' : 'visible'), configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, h);   // a phone locking: hidden first, then frozen
const until = async (fn, ms = 15000, step = 120) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await new Promise((r) => setTimeout(r, step)); } };
const st = (p) => p.evaluate(() => window.__game.durakMP.state());
const A = await mk('ALPHA'), B = await mk('BRAVO'), C = await mk('CHARLIE');
await until(async () => (await Promise.all([A, B, C].map((p) => p.evaluate(() => window.__ctx.net.list().length)))).every((n) => n >= 2), 40000);

// ---- A opens a 4-seat table, B and C join, A deals ----
await A.evaluate(() => window.__game.durakMP.open({ seats: 4, aiDelay: 150 }));
await until(() => B.evaluate(() => window.__game.durakMP.rooms().length > 0), 15000); await until(() => C.evaluate(() => window.__game.durakMP.rooms().length > 0), 15000);
await B.evaluate(() => window.__game.durakMP.join()); await C.evaluate(() => window.__game.durakMP.join());
const lob = await until(async () => { const ss = await Promise.all([A, B, C].map(st)); return ss.every((s) => s && s.seq === ss[0].seq && s.seats.filter((x) => x.id).length === 3) && ss[0]; }, 30000);
ok(!!lob && lob.n === 4, 'B and C join A\'s table through the lossy connection: 3 humans + 1 AI, everyone sees the same lobby', JSON.stringify(lob?.seats));
await A.evaluate(() => window.__game.durakMP.deal());
const dealt = await until(async () => { const ss = await Promise.all([A, B, C].map(st)); return ss.every((s) => s?.ph === 'play' && s.seq === ss[0].seq) && ss; }, 20000);
ok(!!dealt, 'A deals: all three are in the game');

let compared = 0, diverged = 0;
const pick = (s) => { const L = s.legal; if (!L.length) return null; const beat = L.filter((m) => m.kind === 'beat'); if (beat.length) return beat[0];
  const play = L.filter((m) => m.kind === 'play'), stop = L.find((m) => m.kind === 'bito' || m.kind === 'done' || m.kind === 'take'); return play.length && (!stop || Math.random() < 0.4) ? play[0] : stop || L[0]; };
/** move for every seated client in `movers` whose turn it is, until the game is over (or `stop()` says so) */
async function playOut(all, movers, { stop = () => false, ms = 240000 } = {}) {
  const t0 = Date.now(); let lastSeq = -1, lastChange = Date.now();
  for (;;) {
    const ss = await Promise.all(all.map(st)); const ref = ss.find((s) => s && s.host === s.id) || ss.find(Boolean);
    if (!ref) return 'no-table'; if (ref.over) return 'over'; if (await stop(ss)) return 'stopped';
    if (ref.seq !== lastSeq) { lastSeq = ref.seq; lastChange = Date.now(); } else if (Date.now() - lastChange > 30000) return 'stuck';
    if (Date.now() - t0 > ms) return 'timeout';
    for (let i = 1; i < ss.length; i++) if (ss[i] && ss[0] && ss[i].seq === ss[0].seq && ss[i].table === ss[0].table) { compared++; if (ss[i].g !== ss[0].g) diverged++; }
    const k = ss.findIndex((s, i) => s && movers.includes(all[i]) && s.seat >= 0 && s.toAct === s.seat && s.legal.length);
    if (k < 0) { await new Promise((r) => setTimeout(r, 100)); continue; }
    const m = pick(ss[k]); if (m) await all[k].evaluate((m) => window.__game.durakMP.move(m), m);
    await until(async () => { const v = await st(all[k]); return v && v.seq > ss[k].seq; }, 5000, 80);
  }
}
// ---- a whole game, everyone playing ----
let res = await playOut([A, B, C], [A, B, C]);
const fin = await until(async () => { const ss = await Promise.all([A, B, C].map(st)); return ss.every((s) => s?.over && s.seq === ss[0].seq && s.g === ss[0].g) && ss[0]; }, 20000);
ok(res === 'over' && !!fin, 'game 1 (3 humans + AI) plays to the end through the lossy connection; all three agree on the final table', `${res} · seq ${fin?.seq}`);
ok(compared > 30 && diverged === 0, 'all clients hold identical state at every common seq', `${compared} compared, ${diverged} diverged`);
await A.screenshot({ path: `${out}/durak-stress-end.png` });

// ---- game 2: B stops moving. Sasha plays B's turns (5 s here) and the game goes on ----
for (const p of [A, B, C]) await p.evaluate(() => window.__game.durakMP.again());
await until(async () => { const ss = await Promise.all([A, B, C].map(st)); return ss.every((s) => s?.ph === 'play' && !s.over && s.seq === ss[0].seq); }, 20000);
const bSeat = (await st(B)).seat, bMoves = new Set();
res = await playOut([A, B, C], [A, C], { stop: async (ss) => { const s = ss[0]; if (s.lm && s.lm[0] === bSeat) bMoves.add(s.seq); return bMoves.size >= 2 && s.toAct !== bSeat; }, ms: 120000 });
const autoPlayed = bMoves.size;
ok(res === 'stopped' || res === 'over', 'B stops playing: Sasha plays B\'s turns and the game goes on', `${res} · B's seat moved ${autoPlayed}× without B`);

// ---- the host's tab freezes mid-game: the lowest remaining player (B or C) takes the table and finishes ----
const [iB, iC] = [(await st(B)).id, (await st(C)).id], heir = iB < iC ? B : C, heirId = iB < iC ? iB : iC, other = heir === B ? C : B;
await setHidden(A, true); await new Promise((r) => setTimeout(r, 500)); const cdp = await A.context().newCDPSession(A); await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
const mig = await until(async () => { const s = await st(heir); return s && s.host === heirId && s; }, 40000);
ok(!!mig, 'the host\'s tab freezes mid-game: the lowest remaining player takes the table over', JSON.stringify(mig?.seats));
res = await playOut([heir, other], [B, C]);
ok(res === 'over', 'and the game is finished without the frozen host', res);
await cdp.send('Page.setWebLifecycleState', { state: 'active' }); await setHidden(A, false);
const back = await until(async () => { const [a, h] = [await st(A), await st(heir)]; return h && (!a || (a.host === heirId && a.seq === h.seq)) && (a || 'gone'); }, 20000);
ok(!!back, 'A comes back and takes the table as it is now (or has been seated out)', JSON.stringify(back === 'gone' ? back : { host: back?.host, seq: back?.seq }));

ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
