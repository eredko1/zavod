// CONEY — Durak rules engine + ARKASHA's AI, 2–4 players (36 cards 6…A). Pure state objects (clone for search, toJSON/fromJSON
// for the wire); durak.js is the table UI, durak-mp.js the networked table. Rules as played on every bench in Brighton:
//  · 6 cards each (dealt round-robin from seat 0); the bottom card of the deck is turned up — its suit is trump, the last card drawn
//  · seats go clockwise = index+1 mod n, skipping seats that are out (G.out). Lowest trump leads first (nobody has one → random);
//    the defender is always the next active seat after the primary attacker (G.att → G.def)
//  · the attacker leads any one card; the defender beats it (higher same suit, or any trump over a non-trump). Everyone except the
//    defender may throw in cards of ranks already on the table ("подкидывать") — never more than the defender held at the start of
//    the bout, at most 6 per bout (5 in the very first bout; G.boutCap), never more unbeaten than he can cover
//  · throw-ins are SERIALIZED (one seat acts at a time, toAct): while any card is unbeaten the defender acts; otherwise the throw-in
//    token goes to the primary attacker first, then the other non-defender active seats clockwise starting after the defender. Each
//    may throw in or pass ('bito' when all is beaten, 'done' while he's taking); any card played or beaten resets the pass round
//    (G.passed); the bout ends when every thrower has passed since the last card. n>2: throwers with no cards, or with the table at
//    boutCap, or facing a defender with no cards, are skipped automatically. n=2 keeps the classic behaviour exactly (the attacker
//    always says бито/хватит himself unless the deck is gone and nothing more can be thrown)
//  · all beaten → cards out, the defender leads next (if he's out: the next active seat). The defender may instead take ('take')
//    — throwers can still add, then everything goes into his hand and the seat AFTER him leads
//  · refill to 6 from the deck after each bout: primary attacker, the other throwers in token order, the defender last
//  · once the deck is empty a player with an empty hand at the end of a bout goes out (pushed to G.out, in refill order); when ≤1
//    active player is left the game is over: G.result = that seat — the ДУРАК — or 'draw' if the last ones emptied together
// ПЕРЕВОДНОЙ (the default at Arkasha's table): while nothing on the table is beaten (all attack cards the same rank), the defender
// may lay a card of that rank and pass the whole attack to the NEXT active seat clockwise (next(G, def)) — allowed only if that
// seat holds at least as many cards as will then be on the table (≤6, ≤5 first bout). The transferrer becomes primary attacker,
// the next seat the defender, boutCap is recomputed against him; transfers chain around the table (back to the original attacker
// in 2p, around anyone in 3–4p). House rule: you may instead SHOW the trump of that rank ("козырем перевожу") — it stays in your
// hand, once per card per bout (G.shown).
// Arkasha plays to win: he remembers every card that's been picked up, keeps his trumps, sheds junk, knows when to take or pass the
// attack on, and once the deck is empty with exactly two players left (perfect information) he plays the endgame out by search.

export const SUITS = ['♠', '♣', '♥', '♦'], RED = [false, false, true, true], RANK = { 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
export const id = (c) => c.r * 4 + c.s, eq = (a, b) => a.r === b.r && a.s === b.s;
export const beats = (d, a, tr) => (d.s === a.s && d.r > a.r) || (d.s === tr && a.s !== tr);

// ------------------------------------------------------------------ seats
/** seats still in the game, in seat order */
export const active = (G) => { const r = []; for (let i = 0; i < G.n; i++) if (!G.out.includes(i)) r.push(i); return r; };
/** next active seat clockwise after `seat` (seat itself if it's the only one left) */
export function next(G, seat) { for (let k = 1; k <= G.n; k++) { const s = (seat + k) % G.n; if (!G.out.includes(s)) return s; } return seat; }
/** throw-in token order: primary attacker, then the other non-defenders clockwise from the seat after the defender */
export function throwers(G) { const l = [G.att]; for (let s = next(G, G.def); s !== G.att && s !== G.def; s = next(G, s)) l.push(s); return l; }

// ------------------------------------------------------------------ engine
export function newGame(rng = Math.random, mode = 'perevodnoy', n = 2) {
  n = Math.max(2, Math.min(4, n | 0));
  const deck = []; for (let s = 0; s < 4; s++) for (let r = 6; r <= 14; r++) deck.push({ r, s });
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const hands = []; for (let p = 0; p < n; p++) hands.push([]);
  for (let k = 0; k < 6; k++) for (let p = 0; p < n; p++) hands[p].push(deck.pop());
  const trumpCard = deck[0], tr = trumpCard.s;
  const low = hands.map((h) => Math.min(...h.filter((c) => c.s === tr).map((c) => c.r), 99)), lo = Math.min(...low);
  const cand = low.map((v, i) => (v === lo ? i : -1)).filter((i) => i >= 0);
  const att = cand.length === 1 ? cand[0] : cand[Math.floor(rng() * cand.length)];
  const G = { n, deck, trumpCard, tr, hands, table: [], att, def: (att + 1) % n, taking: false, discard: [], firstBout: true, boutCap: 0, over: false, result: null, seen: new Set(), mode, shown: [], out: [], passed: [] };
  G.boutCap = cap(G); return G;
}
function cap(G) { return Math.min(G.firstBout ? 5 : 6, G.hands[G.def].length); }   // cards the defender can be asked to face this bout
export const ranksOnTable = (G) => new Set(G.table.flatMap((p) => (p.d ? [p.a.r, p.d.r] : [p.a.r])));
const unbeaten = (G) => G.table.filter((p) => !p.d).length;
export function canThrow(G, c) {
  if (G.over) return false;
  if (!G.table.length) return !G.taking;   // leading a new bout
  if (G.table.length >= G.boutCap) return false;
  if (!G.taking && unbeaten(G) >= G.hands[G.def].length) return false;   // he couldn't cover another
  return ranksOnTable(G).has(c.r);
}
/** transfer (переводной): only before any card on the table is beaten, same rank as the attack, and the next seat can face it */
export function canTransfer(G, c, show = false) {
  if (G.mode !== 'perevodnoy' || G.taking || !G.table.length || G.table.some((p) => p.d)) return false;
  const r = G.table[0].a.r; if (c.r !== r || G.table.some((p) => p.a.r !== r)) return false;
  if (show && (c.s !== G.tr || G.shown.some((x) => eq(x, c)))) return false;
  const to = next(G, G.def); if (to === G.def) return false;
  const k = G.table.length + (show ? 0 : 1); return k <= (G.firstBout ? 5 : 6) && G.hands[to].length >= k;
}
// n>2: can this thrower still add anything (public info only)? otherwise the token skips him
const canAdd = (G, s) => G.hands[s].length > 0 && G.table.length < G.boutCap && (G.taking || G.hands[G.def].length > 0);
const tokenHolder = (G) => { for (const s of throwers(G)) if (!G.passed.includes(s) && (G.n === 2 || canAdd(G, s))) return s; return -1; };
/** the ONE seat that must act now (-1 if the game is over) */
export function toAct(G) {
  if (G.over) return -1;
  if (!G.table.length) return G.att;
  if (!G.taking && G.table.some((p) => !p.d)) return G.def;
  return tokenHolder(G);
}
/** moves for the seat to act: { who, kind: 'play'|'beat'|'take'|'transfer'|'show'|'bito'|'done', c?, i? } */
export function legalMoves(G) {
  if (G.over) return [];
  const W = toAct(G), D = G.def, out = []; if (W < 0) return out;
  if (G.taking) { for (const c of G.hands[W]) if (canThrow(G, c)) out.push({ who: W, kind: 'play', c }); out.push({ who: W, kind: 'done' }); return out; }
  if (!G.table.length) { for (const c of G.hands[W]) out.push({ who: W, kind: 'play', c }); return out; }
  const open = G.table.findIndex((p) => !p.d);
  if (open >= 0) { for (const c of G.hands[D]) if (beats(c, G.table[open].a, G.tr)) out.push({ who: D, kind: 'beat', c, i: open });
    for (const c of G.hands[D]) { if (canTransfer(G, c)) out.push({ who: D, kind: 'transfer', c }); if (canTransfer(G, c, true)) out.push({ who: D, kind: 'show', c }); }
    out.push({ who: D, kind: 'take' }); return out; }
  for (const c of G.hands[W]) if (canThrow(G, c)) out.push({ who: W, kind: 'play', c }); out.push({ who: W, kind: 'bito' });
  return out;
}
const sameMove = (a, m) => a.who === m.who && a.kind === m.kind && (!a.c || (m.c && eq(a.c, m.c))) && (a.i === undefined || a.i === m.i);
const take1 = (h, c) => { const k = h.findIndex((x) => eq(x, c)); if (k > -1) h.splice(k, 1); };
/** apply a move; false (and nothing changes) if it isn't legal right now. search=true skips validation + bookkeeping (AI search) */
export function apply(G, m, search = false) {
  if (!m || (!search && !legalMoves(G).some((x) => sameMove(x, m)))) return false;
  step(G, m, search); return true;
}
function step(G, m, search) {
  const A = G.att, D = G.def, W = m.kind === 'bito' || m.kind === 'done' || m.kind === 'play' ? (m.who ?? A) : D;
  if (m.kind === 'play') { take1(G.hands[W], m.c); G.table.push({ a: m.c, d: null }); G.passed = []; if (!search) G.seen.add(id(m.c)); }
  else if (m.kind === 'beat') { take1(G.hands[D], m.c); G.table[m.i].d = m.c; G.passed = []; if (!search) G.seen.add(id(m.c)); }
  else if (m.kind === 'take') { G.taking = true; G.passed = []; }
  else if (m.kind === 'transfer' || m.kind === 'show') {   // перевод: the attack (plus this card) moves on to the next seat
    const to = next(G, D);
    if (m.kind === 'transfer') { take1(G.hands[D], m.c); G.table.push({ a: m.c, d: null }); if (!search) G.seen.add(id(m.c)); } else G.shown.push(m.c);
    G.att = D; G.def = to; G.passed = []; G.boutCap = cap(G); if (!search) G.lastTransfer = { who: D, to, show: m.kind === 'show' };
    return;
  }
  else if (m.kind === 'done' || m.kind === 'bito') {
    G.passed.push(W);
    if (G.n === 2 || tokenHolder(G) < 0) return finishBout(G, m.kind === 'bito', search);
    return;
  }
  // automatic ends once nothing more can be thrown in
  if (G.n === 2) {   // classic 2-player behaviour, unchanged
    if (!G.taking && G.table.length && G.table.every((p) => p.d) && (G.hands[D].length === 0 || G.hands[A].length === 0 || G.table.length >= G.boutCap) && G.deck.length === 0) return finishBout(G, true, search);
    if (G.taking && (G.hands[A].length === 0 || G.table.length >= G.boutCap)) return finishBout(G, false, search);
  } else if ((G.taking || G.table.every((p) => p.d)) && tokenHolder(G) < 0) return finishBout(G, !G.taking, search);
}
function finishBout(G, beaten, search) {
  const D = G.def;
  if (beaten) G.discard.push(...G.table.flatMap((p) => [p.a, p.d]));
  else { const got = G.table.flatMap((p) => (p.d ? [p.a, p.d] : [p.a])); G.hands[D].push(...got); if (!search) G.pickedUp = { who: D, cards: got }; }
  const order = throwers(G); order.push(D);   // refill: primary attacker, other throwers, defender last
  G.table = []; G.taking = false; G.firstBout = false; G.shown = []; G.passed = [];
  for (const w of order) while (G.hands[w].length < 6 && G.deck.length) G.hands[w].push(G.deck.pop());
  if (!G.deck.length) for (const w of order) if (!G.hands[w].length && !G.out.includes(w)) G.out.push(w);
  const act = active(G);
  if (act.length <= 1) { G.over = true; G.result = act.length ? act[0] : 'draw'; return; }   // result: seat of the DURAK (or 'draw')
  G.att = beaten && !G.out.includes(D) ? D : next(G, D); G.def = next(G, G.att); G.boutCap = cap(G);
}
export function clone(G) {
  return { n: G.n, deck: G.deck.slice(), trumpCard: G.trumpCard, tr: G.tr, hands: G.hands.map((h) => h.slice()), table: G.table.map((p) => ({ a: p.a, d: p.d })), att: G.att, def: G.def, taking: G.taking,
    discard: G.discard.slice(), firstBout: G.firstBout, boutCap: G.boutCap, over: G.over, result: G.result, seen: G.seen, mode: G.mode, shown: G.shown.slice(), out: G.out.slice(), passed: G.passed.slice() };
}
const cc = (c) => (c ? { r: c.r, s: c.s } : null);
/** plain JSON-safe snapshot (cards {r,s}, seen as an array of ids) — fromJSON(toJSON(G)) is exact */
export function toJSON(G) {
  return { n: G.n, deck: G.deck.map(cc), trumpCard: cc(G.trumpCard), tr: G.tr, hands: G.hands.map((h) => h.map(cc)), table: G.table.map((p) => ({ a: cc(p.a), d: cc(p.d) })), att: G.att, def: G.def,
    taking: G.taking, discard: G.discard.map(cc), firstBout: G.firstBout, boutCap: G.boutCap, over: G.over, result: G.result, seen: [...G.seen], mode: G.mode, shown: G.shown.map(cc),
    out: G.out.slice(), passed: G.passed.slice(), pickedUp: G.pickedUp ? { who: G.pickedUp.who, cards: G.pickedUp.cards.map(cc) } : null, lastTransfer: G.lastTransfer ? { ...G.lastTransfer } : null };
}
export function fromJSON(o) {
  const G = toJSON({ ...o, seen: o.seen || [], out: o.out || [], passed: o.passed || [], shown: o.shown || [] }); G.seen = new Set(G.seen);
  if (!G.pickedUp) delete G.pickedUp; if (!G.lastTransfer) delete G.lastTransfer; return G;
}

// ------------------------------------------------------------------ Arkasha
const val = (c, tr) => (c.r - 6) + (c.s === tr ? 9 : 0);   // 0 (6 off-suit) … 17 (ace of trumps)
/** what the AI knows of each hand: cards a seat picked up that it hasn't played since (public info). M.yours = seat 0's */
export function makeMemory() { const known = [new Map(), new Map(), new Map(), new Map()]; return { known, yours: known[0] }; }
export function remember(M, G) {
  if (G.pickedUp) for (const c of G.pickedUp.cards) M.known[G.pickedUp.who].set(id(c), c);
  G.pickedUp = null;
  for (let s = 0; s < G.n; s++) for (const k of [...M.known[s].keys()]) if (!G.hands[s].some((c) => id(c) === k)) M.known[s].delete(k);
}
export function aiMove(G, M, me = 1) {
  const moves = legalMoves(G).filter((m) => m.who === me); if (moves.length <= 1) return moves[0];
  const act = active(G);
  if (G.deck.length === 0 && act.length === 2) { const best = solve(G, me); if (best) return best; }   // perfect information: search it out
  const tr = G.tr, late = G.deck.length <= 6;
  // ---- defending
  if (G.def === me && !G.taking && G.table.some((p) => !p.d)) {
    const opp = G.hands[next(G, me)].length;   // whoever a transfer would land on
    const open = G.table.filter((p) => !p.d).map((p) => p.a);
    const plan = cheapestCover(open, G.hands[me], tr);
    // перевод: showing the trump costs nothing; laying a cheap same-rank card beats paying for a defence
    const show = moves.find((m) => m.kind === 'show'); if (show && (!plan || !late || opp >= G.table.length + 2)) return show;
    const tx = moves.filter((m) => m.kind === 'transfer').sort((a, b) => val(a.c, tr) - val(b.c, tr))[0];
    if (tx) { const costD = plan ? plan.reduce((q, c) => q + val(c, tr) + (c.s === tr ? 3 : 0), 0) : 99, costT = val(tx.c, tr) + (tx.c.s === tr ? 6 : 0);
      if (!plan || costT + 1 < costD || (late && tx.c.s !== tr)) return tx; }
    if (!plan) return moves.find((m) => m.kind === 'take');
    const cost = plan.reduce((s, c) => s + val(c, tr), 0), tableJunk = G.table.every((p) => p.a.s !== tr && p.a.r <= 10);
    const highTrump = plan.some((c) => c.s === tr && c.r >= (late ? 13 : 11));
    if (!late && highTrump && tableJunk && G.hands[me].length <= 6 && G.deck.length > 10) return moves.find((m) => m.kind === 'take');   // don't burn a big trump on 6s and 7s
    if (!late && cost >= 20 && tableJunk) return moves.find((m) => m.kind === 'take');
    const want = plan[0]; return moves.find((m) => m.kind === 'beat' && eq(m.c, want)) || moves[0];
  }
  // ---- attacking / throwing in
  const opp = G.hands[G.def].length, known = [...(M?.known?.[G.def]?.values() || [])];
  const plays = moves.filter((m) => m.kind === 'play');
  if (!G.table.length) {   // leading: cheapest card, and ranks we hold twice so we can keep pressing
    const cnt = {}; for (const c of G.hands[me]) cnt[c.r] = (cnt[c.r] || 0) + 1;
    const score = (c) => val(c, tr) - (cnt[c.r] - 1) * 1.6 - (known.some((k) => k.s === c.s && k.r > c.r) || (c.s !== tr && known.some((k) => k.s === tr)) ? 0 : 0.8) + (c.s === tr && !late ? 6 : 0);
    return plays.sort((a, b) => score(a.c) - score(b.c))[0];
  }
  const stop = moves.find((m) => m.kind === 'bito' || m.kind === 'done');
  if (!plays.length) return stop;
  const giving = G.taking;   // he's taking: dump what we don't need, keep what hurts him later
  const ok = plays.filter((m) => { const v = val(m.c, tr); if (giving) return m.c.s !== tr ? v <= (late ? 8 : 5) : late && v <= 11 && opp > 3; return m.c.s !== tr && (late ? v <= 8 : v <= 4); });
  if (!ok.length) return stop;
  return ok.sort((a, b) => val(a.c, tr) - val(b.c, tr))[0];
}
/** cheapest way to cover every open attack card (tiny brute force: ≤ 6 × hand) */
function cheapestCover(open, hand, tr) {
  let best = null, bestCost = 1e9;
  const rec = (i, used, picks, cost) => {
    if (cost >= bestCost) return;
    if (i === open.length) { best = picks.slice(); bestCost = cost; return; }
    for (let k = 0; k < hand.length && k < 31; k++) { if (used & (1 << k)) continue; const c = hand[k]; if (!beats(c, open[i], tr)) continue; picks.push(c); rec(i + 1, used | (1 << k), picks, cost + val(c, tr) * 1 + (c.s === tr ? 3 : 0)); picks.pop(); }
  };
  rec(0, 0, [], 0); return best;
}
/** deck empty, two players left: full-information minimax (alpha-beta + memo, node + time budget); best move or null if out of budget */
function solve(G, me) {
  let nodes = 0; const LIMIT = 90000, memo = new Map(), t0 = performance.now(), TIME = 16;
  const key = (S) => S.hands.map((h) => h.map(id).sort((a, b) => a - b).join('.')).join('|') + '/' + S.table.map((p) => id(p.a) + ':' + (p.d ? id(p.d) : '')).join(',') + '/' + S.att + (S.taking ? 't' : '') + S.boutCap + 'p' + S.passed.join('') + 's' + S.shown.map(id).join('.');
  const evalS = (S) => { let o = 0; for (let s = 0; s < S.n; s++) if (s !== me && !S.out.includes(s)) o = Math.max(o, S.hands[s].length); return Math.tanh((o - S.hands[me].length) * 0.15); };   // heuristic when the budget runs out
  const spent = () => nodes > LIMIT || ((nodes & 255) === 0 && performance.now() - t0 > TIME && (nodes = LIMIT + 1) > 0);   // out of time counts as out of nodes
  function mm(S, depth, a, b) {
    if (S.over) return S.result === 'draw' ? 0 : S.result === me ? -1 : 1;
    ++nodes; if (spent() || depth > 40) return evalS(S);
    const k = key(S); const hit = memo.get(k); if (hit !== undefined) return hit;
    const who = toAct(S), max = who === me; let v = max ? -2 : 2;
    const ms = orderMoves(legalMoves(S), S.tr);
    for (const m of ms) { const T = clone(S); step(T, m, true); const r = mm(T, depth + 1, a, b);
      if (max) { if (r > v) v = r; if (v > a) a = v; } else { if (r < v) v = r; if (v < b) b = v; } if (a >= b) break; }
    if (nodes <= LIMIT) memo.set(k, v); return v;
  }
  let best = null, bv = -3; const root = orderMoves(legalMoves(G).filter((m) => m.who === me), G.tr);
  for (const m of root) { const T = clone(G); step(T, m, true); const r = mm(T, 1, -2, 2); if (r > bv) { bv = r; best = m; } if (nodes > LIMIT) break; }
  return nodes > LIMIT && bv < 0.99 ? null : best;
}
function orderMoves(ms, tr) { return ms.sort((a, b) => (a.c ? val(a.c, tr) : 30) - (b.c ? val(b.c, tr) : 30)); }
