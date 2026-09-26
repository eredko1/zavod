// Durak engine + Arkasha AI self-play in the page, 2–4 players: rules never deadlock, every game ends, invariants hold after every
// move (36 cards conserved, no duplicates, only legal moves, apply rejects illegal ones, toJSON/fromJSON exact), n=2 is move-for-move
// identical to the classic 2-player engine (commit 42d256c), Arkasha beats random and greedy players.
// node qa/durak-sim.mjs
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
const classic = execSync('git show 42d256c:src/world/coney/durak.js', { cwd: new URL('..', import.meta.url).pathname }).toString().split('\n');
const s0 = classic.findIndex((l) => l.startsWith('const SUITS')), s1 = classic.findIndex((l) => l.startsWith('function orderMoves'));
const classicSrc = classic.slice(s0, s1 + 1).join('\n');
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
const pg = await b.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto('http://localhost:8790/?qa=1&map=zavod', { timeout: 150000 }); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 150000 });
const r = await pg.evaluate(async (classicSrc) => {
  const D = await import('/src/world/coney/durak-engine.js'), UI = await import('/src/world/coney/durak.js');
  const O = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(classicSrc));
  const out = { reexports: ['newGame', 'legalMoves', 'canTransfer', 'canThrow', 'ranksOnTable', 'apply', 'toAct', 'aiMove', 'makeMemory', 'remember', 'toJSON', 'fromJSON', 'active', 'next'].filter((k) => typeof UI[k] !== 'function') };
  const seeded = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const cardKey = (c) => c.r * 4 + c.s;
  // ---- n=2: identical to the classic engine (same deal, same legal moves in the same order, same state after every move)
  { let diffs = 0, games = 0, moves = 0; const snap = (G) => JSON.stringify([G.hands, G.table, G.att, G.def, G.taking, G.deck.length, G.discard.length, G.over, G.result, G.boutCap, G.shown]);
    for (let g = 0; g < 400 && diffs < 3; g++) { const mode = g & 1 ? 'podkidnoy' : 'perevodnoy', A = D.newGame(seeded(g + 1), mode, 2), B = O.newGame(seeded(g + 1), mode), pick = seeded(9999 + g); games++;
      for (let n = 0; !A.over && n < 1000; n++) {
        const la = JSON.stringify(D.legalMoves(A)), lb = JSON.stringify(O.legalMoves(B));
        if (la !== lb || D.toAct(A) !== O.toAct(B) || snap(A) !== snap(B)) { diffs++; out.diff2 = out.diff2 || { g, n, la, lb, a: snap(A), b: snap(B) }; break; }
        const ms = D.legalMoves(A), m = ms[Math.floor(pick() * ms.length)]; D.apply(A, m); O.apply(B, JSON.parse(JSON.stringify(m))); moves++;
      }
      if (A.over !== B.over || A.result !== B.result) diffs++;
    }
    out.classic2 = { games, moves, diffs };
  }
  // ---- self-play at n = 2, 3, 4 with invariants after every move
  const v = (G, c) => (c.r - 6) + (c.s === G.tr ? 9 : 0);
  const rnd = (G) => { const ms = D.legalMoves(G); return ms[Math.floor(Math.random() * ms.length)]; };
  const greedy = (G) => { const ms = D.legalMoves(G);
    const beat = ms.filter((m) => m.kind === 'beat').sort((a, b) => v(G, a.c) - v(G, b.c)); if (beat.length) return beat[0];
    const tx = ms.find((m) => m.kind === 'show') || ms.find((m) => m.kind === 'transfer' && m.c.s !== G.tr); if (tx) return tx;
    const play = ms.filter((m) => m.kind === 'play').sort((a, b) => v(G, a.c) - v(G, b.c)); if (play.length && (!G.table.length || v(G, play[0].c) < 6)) return play[0];
    return ms.find((m) => m.kind === 'bito' || m.kind === 'done' || m.kind === 'take') || ms[0]; };
  const check = (G, bad) => {
    const cards = [...G.deck, ...G.hands.flat(), ...G.table.flatMap((p) => [p.a, p.d]).filter(Boolean), ...G.discard];
    if (cards.length !== 36) bad.push('count ' + cards.length); else if (new Set(cards.map(cardKey)).size !== 36) bad.push('dupes');
    const j = JSON.stringify(D.toJSON(G)); if (JSON.stringify(D.toJSON(D.fromJSON(JSON.parse(j)))) !== j) bad.push('json');
    if (!G.over) { const w = D.toAct(G), ms = D.legalMoves(G); if (w < 0 || !ms.length || ms.some((m) => m.who !== w)) bad.push('toAct ' + w);
      if (G.out.includes(G.att) || G.out.includes(G.def) || G.att === G.def || G.def !== D.next(G, G.att)) bad.push('seats'); }
  };
  const illegal = (G) => {   // apply must refuse (and not touch) moves that aren't legal right now
    const j = JSON.stringify(D.toJSON(G)), w = D.toAct(G), ms = D.legalMoves(G);
    const other = (w + 1) % G.n, c = G.hands[other][0];
    const tries = [{ who: other, kind: 'take' }, { who: w, kind: 'beat', c: { r: 99, s: 0 }, i: 0 }, c && { who: other, kind: 'play', c }, { who: w, kind: 'bogus' }].filter((m) => m && !ms.some((x) => x.who === m.who && x.kind === m.kind && (!m.c || (x.c && x.c.r === m.c.r && x.c.s === m.c.s))));
    return tries.every((m) => D.apply(G, m) === false) && JSON.stringify(D.toJSON(G)) === j;
  };
  for (const n of [2, 3, 4]) for (const mode of ['podkidnoy', 'perevodnoy']) for (const mix of ['random', 'greedy', 'ai', 'ai-vs-random', 'ai-vs-greedy']) {
    const games = n === 2 ? 150 : 250; const st = { games, over: 0, draw: 0, stuck: 0, moves: 0, transfers: 0, chained: 0, shows: 0, bad: [], illegalOK: 0, illegalBad: 0, maxMoves: 0, aiMaxMs: 0, aiT: [], aiLoses: 0, oppLoses: 0 };
    const t0 = performance.now();
    for (let g = 0; g < games; g++) {
      const G = D.newGame(Math.random, mode, n), M = D.makeMemory(); let k = 0, chain = 0;
      const brain = (s) => (mix === 'random' ? 'r' : mix === 'greedy' ? 'g' : mix === 'ai' ? 'a' : s % 2 === 1 ? 'a' : mix === 'ai-vs-random' ? 'r' : 'g');
      while (!G.over && k < 1000) {
        const w = D.toAct(G), bn = brain(w); let m;
        if (bn === 'a') { const t = performance.now(); m = D.aiMove(G, M, w); const dt = performance.now() - t; st.aiT.push(dt); st.aiMaxMs = Math.max(st.aiMaxMs, dt); } else m = bn === 'r' ? rnd(G) : greedy(G);
        if (!m) { st.stuck++; break; }
        if (k % 17 === 0) { if (illegal(G)) st.illegalOK++; else st.illegalBad++; }
        if (m.kind === 'transfer' || m.kind === 'show') { st.transfers++; if (m.kind === 'show') st.shows++; if (++chain >= 2) st.chained++; } else if (m.kind !== 'transfer') chain = 0;
        if (!D.apply(G, m)) { st.bad.push('rejected legal ' + m.kind); break; }
        D.remember(M, G); k++;
        if (st.bad.length < 5) check(G, st.bad);
      }
      st.moves += k; st.maxMoves = Math.max(st.maxMoves, k);
      if (!G.over) st.stuck++; else { st.over++; if (G.result === 'draw') st.draw++; else if (brain(G.result) === 'a' && mix.startsWith('ai-')) st.aiLoses++; else if (mix.startsWith('ai-')) st.oppLoses++;
        if (G.result !== 'draw' && (G.out.includes(G.result) || G.out.length !== n - 1)) st.bad.push('result/out'); if (G.result === 'draw' && G.out.length !== n) st.bad.push('draw/out'); }
    }
    st.ms = Math.round(performance.now() - t0); st.aiMaxMs = +st.aiMaxMs.toFixed(1); st.aiT.sort((a, b) => a - b); st.aiP99 = +(st.aiT[Math.floor(st.aiT.length * 0.99)] || 0).toFixed(1); delete st.aiT; st.avgMoves = +(st.moves / games).toFixed(1); st.bad = st.bad.slice(0, 5);
    out[`n${n}·${mode}·${mix}`] = st;
  }
  return out;
}, classicSrc);
ok(!r.reexports.length, 'durak.js re-exports the engine API', JSON.stringify(r.reexports));
ok(r.classic2.diffs === 0 && r.classic2.moves > 10000, 'n=2 identical to the classic engine, move for move', JSON.stringify(r.classic2) + (r.diff2 ? JSON.stringify(r.diff2) : ''));
const tx = { 3: 0, 4: 0, c3: 0, c4: 0 };
for (const [k, st] of Object.entries(r)) { if (!k.startsWith('n')) continue; const n = +k[1];
  console.log(k.padEnd(28), JSON.stringify({ over: st.over, draw: st.draw, avgMoves: st.avgMoves, maxMoves: st.maxMoves, transfers: st.transfers, chained: st.chained, shows: st.shows, aiLoses: st.aiLoses, oppLoses: st.oppLoses, aiP99: st.aiP99, aiMaxMs: st.aiMaxMs, ms: st.ms }));
  ok(st.over === st.games && !st.stuck && st.maxMoves < 1000, `${k}: every game ends`, `${st.over}/${st.games}`);
  ok(!st.bad.length, `${k}: invariants (36 cards, no dupes, legal moves, toAct, seats, json round-trip, result)`, JSON.stringify(st.bad));
  ok(st.illegalOK > 0 && !st.illegalBad, `${k}: apply rejects illegal moves without touching state`, `${st.illegalOK} ok / ${st.illegalBad} bad`);
  if (st.aiMaxMs) ok(st.aiP99 < 30 && st.aiMaxMs < 80, `${k}: AI fast enough (p99 < 30 ms; max allows a GC pause)`, `p99 ${st.aiP99} ms, max ${st.aiMaxMs} ms`);
  if (k.includes('perevodnoy') && n > 2) { tx[n] += st.transfers; tx['c' + n] += st.chained; }
  if (k.includes('podkidnoy')) ok(st.transfers === 0, `${k}: no transfers in podkidnoy`);
  if (k.includes('ai-vs')) ok(st.aiLoses < st.oppLoses, `${k}: Arkasha seats lose less than the others`, `${st.aiLoses} vs ${st.oppLoses}`);
}
for (const n of [3, 4]) ok(tx[n] > 0 && tx['c' + n] > 0, `perevodnoy n=${n}: transfers happen, including chains`, `${tx[n]} transfers, ${tx['c' + n]} chained`);
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
