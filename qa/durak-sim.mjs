// Durak engine + Arkady AI self-play in the page: rules never deadlock, every game ends, Arkady beats random and greedy players.
// node qa/durak-sim.mjs
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
const pg = await b.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto('http://localhost:8790/?qa=1&map=zavod', { timeout: 150000 }); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 150000 });
const r = await pg.evaluate(async () => {
  const D = await import('/src/world/coney/durak.js');
  const rnd = (G, who) => { const ms = D.legalMoves(G).filter((m) => m.who === who); return ms[Math.floor(Math.random() * ms.length)]; };
  const greedy = (G, who) => { const ms = D.legalMoves(G).filter((m) => m.who === who); const v = (c) => (c.r - 6) + (c.s === G.tr ? 9 : 0);
    const beat = ms.filter((m) => m.kind === 'beat').sort((a, b) => v(a.c) - v(b.c)); if (beat.length) return beat[0];
    const play = ms.filter((m) => m.kind === 'play').sort((a, b) => v(a.c) - v(b.c)); if (play.length && (!G.table.length || v(play[0].c) < 6)) return play[0];
    return ms.find((m) => m.kind === 'bito' || m.kind === 'done' || m.kind === 'take') || ms[0]; };
  const out = {};
  for (const [name, opp, mode] of [['random', rnd, 'podkidnoy'], ['greedy', greedy, 'podkidnoy'], ['random·perevod', rnd, 'perevodnoy'], ['greedy·perevod', greedy, 'perevodnoy']]) {
    let ark = 0, you = 0, draw = 0, stuck = 0, moves = 0, t0 = performance.now();
    for (let g = 0; g < 150; g++) {
      const G = D.newGame(Math.random, mode), M = D.makeMemory(); let n = 0; let tx = 0;
      while (!G.over && n < 600) { const who = D.toAct(G); const m = who === 1 ? D.aiMove(G, M, 1) : opp(G, 0); if (!m) { stuck++; break; } if (m.kind === 'transfer' || m.kind === 'show') out.transfers = (out.transfers || 0) + 1; D.apply(G, m); D.remember(M, G); n++; }
      moves += n; if (!G.over) stuck++; else if (G.result === 'draw') draw++; else if (G.result === 0) ark++; else you++;
      const all = G.hands[0].length + G.hands[1].length + G.deck.length + G.discard.length + G.table.flatMap((p) => [p.a, p.d]).filter(Boolean).length; if (all !== 36) { stuck++; out.badCount = all; }
    }
    out[name] = { arkadyWins: ark, arkadyLoses: you, draw, stuck, avgMoves: +(moves / 150).toFixed(1), ms: Math.round(performance.now() - t0) };
  }
  return out;
});
console.log(JSON.stringify(r, null, 1)); console.log('errors', JSON.stringify(errs.slice(0, 3)));
await b.close();
