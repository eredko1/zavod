// Durak engine rules for 2–4 players on hand-built positions: 3p transfer goes to the NEXT seat, chains around the table (4p, and
// skipping an out seat), transfer blocked by a short hand, show-trump once per card per bout, throw-in token order + pass-round
// reset, refill order, next leader after бито vs беру, going out mid-bout, last-two endgame, draw, toJSON/fromJSON, clone.
// node qa/durak-rules-test.mjs
import { chromium } from 'playwright-core';
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
const pg = await b.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto('http://localhost:8790/?qa=1&map=zavod', { timeout: 150000 }); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 150000 });
const res = await pg.evaluate(async () => {
  const D = await import('/src/world/coney/durak-engine.js'); const R = [];
  const t = (c, m, x = '') => R.push([!!c, m, typeof x === 'string' ? x : JSON.stringify(x)]);
  const SU = { S: 0, C: 1, H: 2, D: 3 }, RK = { J: 11, Q: 12, K: 13, A: 14 };
  const C = (s) => ({ r: RK[s.slice(0, -1)] || +s.slice(0, -1), s: SU[s.slice(-1)] });   // '8S' '10H' 'AD'
  const cs = (l) => l.map(C), nm = (c) => c && (({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[c.r] || c.r) + 'SCHD'[c.s];
  // position builder: trump ♦ unless told otherwise; table as [['8S', null], ['9S', '10S']]
  const P = (o) => { const n = o.n || o.hands.length, tr = o.tr ?? 3, G = D.fromJSON({ n, deck: cs(o.deck || []), trumpCard: C(o.trumpCard || '6D'), tr, hands: o.hands.map(cs), table: (o.table || []).map(([a, d]) => ({ a: C(a), d: d ? C(d) : null })),
    att: o.att ?? 0, def: o.def ?? 1, taking: !!o.taking, discard: [], firstBout: !!o.firstBout, boutCap: 0, over: false, result: null, seen: [], mode: o.mode || 'perevodnoy', shown: cs(o.shown || []), out: o.out || [], passed: o.passed || [] });
    G.boutCap = o.boutCap ?? Math.min(G.firstBout ? 5 : 6, G.hands[G.def].length + G.table.filter((p) => p.d).length); return G; };
  const mv = (G, who, kind, c) => ({ who, kind, ...(c ? { c: C(c) } : {}) });
  const beatMv = (G, c) => D.legalMoves(G).find((m) => m.kind === 'beat' && nm(m.c) === c);
  const has = (G, kind, c) => D.legalMoves(G).some((m) => m.kind === kind && (!c || nm(m.c) === c));
  const H = (G, s) => G.hands[s].map(nm).join(' ');

  // ---- seats helpers
  { const G = P({ n: 4, hands: [['6S'], ['7S'], ['8S'], ['9S']], out: [2] });
    t(JSON.stringify(D.active(G)) === '[0,1,3]' && D.next(G, 1) === 3 && D.next(G, 3) === 0 && D.next(G, 2) === 3, 'active/next skip out seats', [D.active(G), D.next(G, 1), D.next(G, 3)]); }

  // ---- 3p: transfer goes to the NEXT seat, not back to the attacker
  { const G = P({ n: 3, hands: [['9C', 'JC'], ['8H', 'KS', 'QS'], ['6C', '7C', '10H', 'JH']], table: [['8S', null]] });
    t(has(G, 'transfer', '8H'), '3p: defender may transfer with a same-rank card');
    t(D.apply(G, mv(G, 1, 'transfer', '8H')), '3p: transfer applies');
    t(G.att === 1 && G.def === 2 && D.toAct(G) === 2 && G.table.length === 2, '3p: attack passed on to seat 2 (not back to 0)', { att: G.att, def: G.def, toAct: D.toAct(G) });
    t(G.lastTransfer && G.lastTransfer.who === 1 && G.lastTransfer.to === 2, '3p: lastTransfer {who, to}', G.lastTransfer);
    t(G.boutCap === 4, '3p: boutCap recomputed against the new defender (4 cards)', G.boutCap);
    t(JSON.stringify(D.throwers(G)) === '[1,0]', '3p: new throw-in order = transferrer, then seat after the defender', D.throwers(G)); }

  // ---- 4p chain all the way round: 0 → 1 → 2 → 3 → 0
  { const G = P({ n: 4, hands: [['6C', '10C', 'JC', 'QC', 'KC'], ['7C', 'KS'], ['7H', 'KH'], ['7D', 'AS', 'QS']], table: [['7S', null]] });
    const ok1 = D.apply(G, mv(G, 1, 'transfer', '7C')), ok2 = D.apply(G, mv(G, 2, 'transfer', '7H')), ok3 = D.apply(G, mv(G, 3, 'transfer', '7D'));
    t(ok1 && ok2 && ok3 && G.att === 3 && G.def === 0 && D.toAct(G) === 0 && G.table.length === 4, '4p: chained transfer 1→2→3 lands back on seat 0', { att: G.att, def: G.def, n: G.table.length });
    t(JSON.stringify(D.throwers(G)) === '[3,1,2]', '4p: after the chain, throwers = 3 then 1, 2', D.throwers(G));
    t(!has(G, 'transfer') && has(G, 'take'), '4p: seat 0 has no 7 — must beat or take'); }

  // ---- 4p chain skipping an out seat: 0 → 1 → 2 → 0 (seat 3 is out)
  { const G = P({ n: 4, hands: [['6C', '10C', 'JC'], ['7C', 'KS'], ['7H', 'KH'], []], out: [3], table: [['7S', null]] });
    D.apply(G, mv(G, 1, 'transfer', '7C')); const r = D.apply(G, mv(G, 2, 'transfer', '7H'));
    t(r && G.att === 2 && G.def === 0 && D.toAct(G) === 0, '4p (seat 3 out): chain 1→2 skips seat 3, lands on 0', { att: G.att, def: G.def }); }

  // ---- transfer blocked when the next seat is short; show-trump still allowed (no card added)
  { const G = P({ n: 3, hands: [['9C', 'JC', 'QC'], ['8H', '8D', 'KS'], ['6C', '7C']], table: [['8S', null], ['8C', null]] });
    t(!has(G, 'transfer'), '3p: transfer blocked — seat 2 holds 2 cards, table would be 3', D.legalMoves(G).map((m) => m.kind + (m.c ? nm(m.c) : '')));
    t(has(G, 'show', '8D') && !has(G, 'show', '8H'), '3p: show the trump 8♦ allowed (table stays 2), non-trump cannot be shown');
    const n1 = G.hands[1].length; D.apply(G, mv(G, 1, 'show', '8D'));
    t(G.def === 2 && G.att === 1 && G.hands[1].length === n1 && G.table.length === 2 && G.shown.length === 1, 'show: the trump stays in hand, attack passed on', H(G, 1)); }
  { const G = P({ n: 3, hands: [['9C'], ['8S'], ['6C', '7C', '9H']], table: [['8C', null]] });   // not the same rank as everything / beaten → no transfer
    G.table[0].d = C('10C'); G.table.push({ a: C('10H'), d: null });
    t(!has(G, 'transfer') && !has(G, 'show'), 'no transfer once anything on the table is beaten'); }

  // ---- 3p full circle with show once per card per bout
  { const G = P({ n: 3, hands: [['8C', 'AS', 'AC', 'AH', 'KC'], ['8D', 'QS', 'QC', 'QH'], ['8H', 'JS', 'JC', 'JH', '9S']], table: [['8S', null]] });
    D.apply(G, mv(G, 1, 'show', '8D')); D.apply(G, mv(G, 2, 'transfer', '8H')); const r = D.apply(G, mv(G, 0, 'transfer', '8C'));
    t(r && G.def === 1 && G.att === 0 && G.table.length === 3, '3p: chain 1(show)→2→0 comes back to seat 1', { att: G.att, def: G.def });
    t(!has(G, 'show', '8D') && has(G, 'transfer', '8D'), 'show: the same trump can\'t be shown twice in a bout, but can still be laid');
    D.apply(G, mv(G, 1, 'take')); t(G.taking && D.toAct(G) === 0, 'take: throw-in token to the primary attacker (seat 0)'); }

  // ---- throw-in token order + pass-round reset (4p, att 1, def 2 → throwers 1, 3, 0)
  { const G = P({ n: 4, hands: [['9C', 'KD', 'QD'], ['6H', 'AD', 'KH'], ['JC', '10H', 'JH', 'QH'], ['9H', 'KS', 'QS']], att: 1, def: 2, table: [['9S', '10S']] });
    t(JSON.stringify(D.throwers(G)) === '[1,3,0]' && D.toAct(G) === 1, 'token: primary attacker first', D.throwers(G));
    t(D.apply(G, mv(G, 3, 'play', '9H')) === false, 'token: seat 3 may not throw out of turn');
    D.apply(G, mv(G, 1, 'bito')); t(D.toAct(G) === 3 && G.table.length === 1, 'token: attacker passes → seat 3 (after the defender)', D.toAct(G));
    D.apply(G, mv(G, 3, 'play', '9H')); t(D.toAct(G) === 2 && G.passed.length === 0, 'token: a thrown card resets the pass round, defender to act');
    D.apply(G, beatMv(G, '10H')); t(D.toAct(G) === 1, 'token: after the beat it starts again from the primary attacker', D.toAct(G));
    D.apply(G, mv(G, 1, 'bito')); D.apply(G, mv(G, 3, 'bito')); t(D.toAct(G) === 0 && G.table.length === 2, 'token: … then seat 0 last');
    t(has(G, 'play', '9C'), 'token: seat 0 may throw its 9');
    D.apply(G, mv(G, 0, 'bito')); t(G.table.length === 0 && G.discard.length === 4, 'bout ends when every thrower has passed since the last card', G.discard.length);
    t(G.att === 2 && G.def === 3, 'бито → the defender (2) leads, next seat (3) defends', { att: G.att, def: G.def }); }
  { const G = P({ n: 3, hands: [['KD'], ['AS', 'AD'], []], deck: ['6S', '7S', '8S'], table: [['9S', '10S']] });   // seat 2 empty mid-game: skipped
    D.apply(G, mv(G, 0, 'bito')); t(G.table.length === 0, 'token: thrower with no cards is skipped automatically (3p)'); }
  { const G = P({ n: 3, hands: [['9C', 'KD'], ['AD'], ['9H', 'KS']], table: [['9S', '10S']], boutCap: 2 });
    D.apply(G, mv(G, 0, 'play', '9C')); D.apply(G, beatMv(G, 'AD'));
    t(G.table.length === 0 && G.discard.length === 4, 'cap: table reaches boutCap → nobody can add, bout ends by itself (3p)', G.discard.length); }

  // ---- refill order: primary attacker, other throwers (token order), defender last
  { const G = P({ n: 4, hands: [['7C', '8C', '9C', '10C', 'JC'], ['7H', '8H', '9H', '10H', 'JH'], ['7D', '8D', '9D', '10D', 'JD'], ['6C', 'QC', 'KC', 'AC', '6H']], att: 3, def: 0, deck: ['AD', 'AH', 'AS', 'KS'], table: [['6S', 'QS']] });
    D.apply(G, mv(G, 3, 'bito')); D.apply(G, mv(G, 1, 'bito')); D.apply(G, mv(G, 2, 'bito'));
    const got = [3, 1, 2, 0].map((s) => nm(G.hands[s][G.hands[s].length - 1]));
    t(JSON.stringify(got) === '["KS","AS","AH","AD"]', 'refill: 3 (attacker), 1, 2, then 0 (defender) last', got);
    t(G.att === 0 && G.def === 1, 'бито: defender 0 leads next', { att: G.att, def: G.def }); }
  { const G = P({ n: 3, hands: [['7C', '8C'], ['7H', '9C'], ['7D', '8D', '9D', '10D', 'JD', 'QD']], deck: ['AD', 'AH', 'AS'], table: [['6S', null]] });
    const r = [D.apply(G, mv(G, 1, 'take')), D.apply(G, mv(G, 0, 'done')), D.toAct(G) === 2, D.apply(G, mv(G, 2, 'done'))];
    t(r.every(Boolean), 'беру: token 0 → 2, both say хватит', r);
    t(G.hands[0].length === 5 && G.hands[2].length === 6 && G.hands[1].length === 3 && G.deck.length === 0 && nm(G.hands[0][2]) === 'AS', 'refill: attacker gets first pick, taker gets nothing left', [0, 1, 2].map((s) => G.hands[s].length));
    t(G.att === 2 && G.def === 0, 'беру → the seat AFTER the taker (2) leads, 0 defends', { att: G.att, def: G.def }); }
  { const G = P({ n: 4, hands: [['7C', '8C'], ['9C'], ['JC'], ['7H']], att: 2, def: 3, deck: ['AS', 'KS', 'QS', 'JS', '10S', '9S', '8S', '7S', 'AH', 'KH', 'QH', 'JH', '10H', '9H', '8H', '6H', 'AC', 'KC', 'QC', '6C'], table: [['6S', null]] });
    D.apply(G, mv(G, 3, 'take')); D.apply(G, mv(G, 2, 'done')); D.apply(G, mv(G, 0, 'done')); D.apply(G, mv(G, 1, 'done'));
    t(G.att === 0 && G.def === 1 && G.hands[3].length === 6, '4p беру by seat 3 → seat 0 leads (wraps around)', { att: G.att, def: G.def }); }

  // ---- going out mid-bout / next lead after the defender goes out
  { const G = P({ n: 3, hands: [['6S', 'KC'], ['7S'], ['9H', 'QH']], table: [] });
    D.apply(G, mv(G, 0, 'play', '6S')); D.apply(G, beatMv(G, '7S'));
    t(G.table.length === 0 && JSON.stringify(G.out) === '[1]', 'defender beats his last card (deck empty) → bout auto-ends, he goes out', G.out);
    t(G.att === 2 && G.def === 0, '… and the next active seat after him (2) leads', { att: G.att, def: G.def }); }
  { const G = P({ n: 3, hands: [['6S'], ['7S', 'AD', 'AH'], ['6H', 'QH']], table: [] });
    D.apply(G, mv(G, 0, 'play', '6S')); D.apply(G, beatMv(G, '7S'));
    t(D.toAct(G) === 2 && G.table.length === 1, 'attacker who emptied his hand stops throwing: token skips him to seat 2', D.toAct(G));
    D.apply(G, mv(G, 2, 'play', '6H')); D.apply(G, beatMv(G, 'AH')); D.apply(G, mv(G, 2, 'bito'));
    t(JSON.stringify(G.out) === '[0]' && G.att === 1 && G.def === 2 && !G.over, 'he goes out at the end of the bout; the defender leads the last two', { out: G.out, att: G.att, def: G.def }); }

  // ---- last-two endgame (3p, seat 2 already out): search AI moves are legal, game ends with the right durak
  { const G = P({ n: 3, hands: [['6S', 'JS', 'QC'], ['7S', '8C', 'AH'], []], out: [2], table: [] }); const M = D.makeMemory(); let k = 0, legal = true;
    t(D.next(G, 1) === 0 && JSON.stringify(D.throwers(G)) === '[0]', 'last two: seats wrap past the out seat');
    while (!G.over && k++ < 100) { const m = D.aiMove(G, M, D.toAct(G)); if (!D.apply(G, m)) { legal = false; break; } }
    t(legal && G.over && (G.result === 0 || G.result === 1 || G.result === 'draw'), 'last two: AI (exact search) plays it out legally', G.result); }
  { const G = P({ n: 3, hands: [['KC'], ['9H'], []], out: [2], table: [] });
    D.apply(G, mv(G, 0, 'play', 'KC')); D.apply(G, mv(G, 1, 'take'));
    t(G.over && G.result === 1 && JSON.stringify(G.out) === '[2,0]', 'last two: taker left holding cards is the ДУРАК', { over: G.over, result: G.result, out: G.out }); }
  { const G = P({ n: 3, hands: [['6S'], ['7S'], []], out: [2], table: [] });
    D.apply(G, mv(G, 0, 'play', '6S')); D.apply(G, beatMv(G, '7S'));
    t(G.over && G.result === 'draw' && G.out.length === 3, 'draw: the last two empty together', { result: G.result, out: G.out }); }
  { const G = P({ n: 4, hands: [['6S'], ['7S'], ['8H', '9H'], []], out: [3], table: [] });
    D.apply(G, mv(G, 0, 'play', '6S')); D.apply(G, beatMv(G, '7S'));
    t(JSON.stringify(G.out) === '[3,0,1]', '4p: out order is refill order', G.out);
    t(G.over && G.result === 2, '4p: two go out in the same bout → the one left is the ДУРАК', { over: G.over, result: G.result, out: G.out }); }

  // ---- first bout: 5-card limit; transfer of three 6s onto a 4-card hand
  { const G = P({ n: 3, firstBout: true, hands: [['9C'], ['6H', 'KS', 'QS', 'JS', '10S', '9S'], ['7C', '10H', 'JH', 'QH']], table: [['6S', null], ['6C', null], ['6D', null]], boutCap: 5 });
    t(has(G, 'transfer', '6H'), 'transfer making 4 on the table onto a 4-card hand is allowed'); G.hands[2].pop(); t(!has(G, 'transfer'), '… and blocked against a 3-card hand'); }
  { const G = P({ n: 2, firstBout: true, hands: [['6H', 'KS'], ['AS', 'AD', 'AC', 'AH', 'KD', 'KH']], table: [['6S', '7S'], ['6C', '7C'], ['7H', '8H'], ['8C', '9C'], ['9H', '10H']], boutCap: 5 });
    t(!has(G, 'play') && has(G, 'bito'), 'first bout: nothing more once 5 are on the table'); }
  { const G = P({ n: 3, firstBout: true, hands: [['9C'], ['6H', 'KS'], ['7C', '10H', 'JH', 'QH', 'KH', 'AH']], table: [['6S', null], ['6C', null], ['6D', null], ['7S', null], ['7D', null]], boutCap: 5 });
    t(!has(G, 'transfer'), 'mixed ranks on the table: no transfer'); }

  // ---- apply validation / toJSON / clone
  { const G = P({ n: 3, hands: [['9C', 'JC'], ['8H', 'KS', 'QS'], ['6C', '7C', '10H', 'JH']], table: [['8S', null]] }), j = JSON.stringify(D.toJSON(G));
    const bad = [mv(G, 0, 'take'), mv(G, 2, 'transfer', '8H'), { who: 1, kind: 'beat', c: C('8H'), i: 0 }, { who: 1, kind: 'beat', c: C('KS'), i: 3 }, mv(G, 1, 'transfer', '9C'), mv(G, 1, 'bito'), null];
    t(bad.every((m) => D.apply(G, m) === false) && JSON.stringify(D.toJSON(G)) === j, 'apply rejects illegal / out-of-turn moves and changes nothing');
    const o = JSON.parse(j), G2 = D.fromJSON(o); t(JSON.stringify(D.toJSON(G2)) === j && G2.seen instanceof Set, 'toJSON/fromJSON round-trip is exact');
    const K = D.clone(G); t(['hands', 'discard', 'shown', 'out', 'passed', 'deck', 'table'].every((f) => K[f] !== G[f]) && K.hands.every((h, i) => h !== G.hands[i]), 'clone copies every array'); }
  { const G = D.newGame(Math.random, 'perevodnoy', 3); t(G.n === 3 && G.hands.length === 3 && G.hands.every((h) => h.length === 6) && G.deck.length === 18 && G.def === D.next(G, G.att), 'newGame n=3: 6 each, 18 in the deck');
    const low = G.hands.map((h) => Math.min(99, ...h.filter((c) => c.s === G.tr).map((c) => c.r))); t(low[G.att] === Math.min(...low), 'newGame: lowest trump leads', low);
    const G4 = D.newGame(Math.random, 'podkidnoy', 4); t(G4.hands.length === 4 && G4.deck.length === 12 && G4.out.length === 0, 'newGame n=4: 12 left in the deck'); }
  return R.filter((r) => r[1]);
});
for (const [c, m, x] of res) ok(c, m, x);
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
