// CONEY — Durak with ARKADY (podkidnoy, 2 players, 36 cards 6…A). Arkady sits at the card table in the little park by
// Luna Park building 1. Rules as played on every bench in Brighton:
//  · 6 cards each; the last card of the deck is turned up — its suit is trump, and it's the last card anyone draws
//  · lowest trump leads first; the attacker leads any card, the defender beats it (higher same suit, or any trump over a
//    non-trump); the attacker may throw in more cards of ranks already on the table ("подкидывать") — never more than the
//    defender can cover, at most 6 per bout (5 in the very first bout)
//  · all beaten + attacker says "бито" → the cards are out and the defender attacks next; the defender may instead take
//    ("беру") — the attacker can still throw in, then everything goes into the defender's hand and he skips his attack
//  · after each bout the attacker refills to 6 first, then the defender; when the deck is gone the first to empty their hand
//    is out — whoever is left holding cards is the ДУРАК (both empty at once = a draw)
// Arkady plays to win: he remembers every card that's been out or picked up, keeps his trumps, sheds junk, knows when to take,
// and once the deck is empty (perfect information) he plays the endgame out by search.
import { hangkit as K } from '../hangkit.js';

const SUITS = ['♠', '♣', '♥', '♦'], RED = [false, false, true, true], RANK = { 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const id = (c) => c.r * 4 + c.s, eq = (a, b) => a.r === b.r && a.s === b.s;
const beats = (d, a, tr) => (d.s === a.s && d.r > a.r) || (d.s === tr && a.s !== tr);

// ------------------------------------------------------------------ engine (pure-ish: state objects, clone for search)
export function newGame(rng = Math.random) {
  const deck = []; for (let s = 0; s < 4; s++) for (let r = 6; r <= 14; r++) deck.push({ r, s });
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const hands = [[], []]; for (let k = 0; k < 6; k++) { hands[0].push(deck.pop()); hands[1].push(deck.pop()); }
  const trumpCard = deck[0], tr = trumpCard.s;
  const lowT = (h) => Math.min(...h.filter((c) => c.s === tr).map((c) => c.r), 99);
  const l0 = lowT(hands[0]), l1 = lowT(hands[1]); const att = l0 === l1 ? (rng() < 0.5 ? 0 : 1) : l0 < l1 ? 0 : 1;
  const G = { deck, trumpCard, tr, hands, table: [], att, def: 1 - att, taking: false, discard: [], firstBout: true, boutCap: 0, over: false, result: null, seen: new Set() };
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
export function legalMoves(G) {   // for whoever is to act: { who, kind: 'play'|'beat'|'take'|'bito'|'done', c?, i? }
  if (G.over) return [];
  const A = G.att, D = G.def, out = [];
  if (G.taking) { for (const c of G.hands[A]) if (canThrow(G, c)) out.push({ who: A, kind: 'play', c }); out.push({ who: A, kind: 'done' }); return out; }
  if (!G.table.length) { for (const c of G.hands[A]) out.push({ who: A, kind: 'play', c }); return out; }
  const open = G.table.findIndex((p) => !p.d);
  if (open >= 0) { for (const c of G.hands[D]) if (beats(c, G.table[open].a, G.tr)) out.push({ who: D, kind: 'beat', c, i: open }); out.push({ who: D, kind: 'take' }); return out; }
  for (const c of G.hands[A]) if (canThrow(G, c)) out.push({ who: A, kind: 'play', c }); out.push({ who: A, kind: 'bito' });
  return out;
}
export const toAct = (G) => (G.over ? -1 : G.taking || !G.table.length || G.table.every((p) => p.d) ? G.att : G.def);
const take1 = (h, c) => { const k = h.findIndex((x) => eq(x, c)); if (k > -1) h.splice(k, 1); };
export function apply(G, m, search = false) {
  const A = G.att, D = G.def;
  if (m.kind === 'play') { take1(G.hands[A], m.c); G.table.push({ a: m.c, d: null }); if (!search) G.seen.add(id(m.c)); }
  else if (m.kind === 'beat') { take1(G.hands[D], m.c); G.table[m.i].d = m.c; if (!search) G.seen.add(id(m.c)); }
  else if (m.kind === 'take') { G.taking = true; }
  else if (m.kind === 'done') { const got = G.table.flatMap((p) => (p.d ? [p.a, p.d] : [p.a])); G.hands[D].push(...got); if (!search) G.pickedUp = { who: D, cards: got }; endBout(G, false); return; }
  else if (m.kind === 'bito') { G.discard.push(...G.table.flatMap((p) => [p.a, p.d])); endBout(G, true); return; }
  // automatic ends: the attacker can't add anything more (or the defender is out) once everything's beaten / taken
  if (!G.taking && G.table.length && G.table.every((p) => p.d) && (G.hands[D].length === 0 || G.hands[A].length === 0 || G.table.length >= G.boutCap) && G.deck.length === 0) { apply(G, { kind: 'bito' }, search); return; }
  if (G.taking && (G.hands[A].length === 0 || G.table.length >= G.boutCap)) { apply(G, { kind: 'done' }, search); return; }
  checkOver(G);
}
function endBout(G, beaten) {
  G.table = []; G.taking = false; G.firstBout = false;
  for (const w of [G.att, G.def]) while (G.hands[w].length < 6 && G.deck.length) G.hands[w].push(G.deck.pop());   // attacker refills first
  if (beaten) { const a = G.att; G.att = G.def; G.def = a; }
  checkOver(G);
  if (!G.over) { if (!G.hands[G.att].length) { const a = G.att; G.att = G.def; G.def = a; } G.boutCap = cap(G); }
}
function checkOver(G) {
  if (G.deck.length || G.table.length) return;
  const e0 = !G.hands[0].length, e1 = !G.hands[1].length;
  if (e0 || e1) { G.over = true; G.result = e0 && e1 ? 'draw' : e0 ? 1 : 0; }   // result: index of the DURAK (or 'draw')
}
function clone(G) { return { deck: G.deck.slice(), trumpCard: G.trumpCard, tr: G.tr, hands: [G.hands[0].slice(), G.hands[1].slice()], table: G.table.map((p) => ({ a: p.a, d: p.d })), att: G.att, def: G.def, taking: G.taking, discard: G.discard.slice(), firstBout: G.firstBout, boutCap: G.boutCap, over: G.over, result: G.result, seen: G.seen }; }

// ------------------------------------------------------------------ Arkady
const val = (c, tr) => (c.r - 6) + (c.s === tr ? 9 : 0);   // 0 (6 off-suit) … 17 (ace of trumps)
/** what Arkady knows of your hand: cards you picked up that you haven't played since */
export function makeMemory() { return { yours: new Map() }; }
export function remember(M, G) {
  if (G.pickedUp && G.pickedUp.who === 0) { for (const c of G.pickedUp.cards) M.yours.set(id(c), c); }
  G.pickedUp = null; for (const k of [...M.yours.keys()]) if (!G.hands[0].some((c) => id(c) === k)) M.yours.delete(k);
}
export function aiMove(G, M, me = 1) {
  const moves = legalMoves(G).filter((m) => m.who === me); if (moves.length <= 1) return moves[0];
  if (G.deck.length === 0) { const best = solve(G, me); if (best) return best; }   // perfect information: search it out
  const tr = G.tr, late = G.deck.length <= 6, opp = G.hands[1 - me].length;
  // ---- defending
  if (G.def === me && !G.taking && G.table.some((p) => !p.d)) {
    const open = G.table.filter((p) => !p.d).map((p) => p.a);
    const plan = cheapestCover(open, G.hands[me], tr);
    if (!plan) return moves.find((m) => m.kind === 'take');
    const cost = plan.reduce((s, c) => s + val(c, tr), 0), tableJunk = G.table.every((p) => p.a.s !== tr && p.a.r <= 10);
    const highTrump = plan.some((c) => c.s === tr && c.r >= (late ? 13 : 11));
    if (!late && highTrump && tableJunk && G.hands[me].length <= 6 && G.deck.length > 10) return moves.find((m) => m.kind === 'take');   // don't burn a big trump on 6s and 7s
    if (!late && cost >= 20 && tableJunk) return moves.find((m) => m.kind === 'take');
    const want = plan[0]; return moves.find((m) => m.kind === 'beat' && eq(m.c, want)) || moves[0];
  }
  // ---- attacking / throwing in
  const plays = moves.filter((m) => m.kind === 'play');
  if (!G.table.length) {   // leading: cheapest card, and ranks we hold twice so we can keep pressing
    const cnt = {}; for (const c of G.hands[me]) cnt[c.r] = (cnt[c.r] || 0) + 1;
    const known = [...M.yours.values()];
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
/** cheapest way to cover every open attack card (tiny brute force: ≤ 6 × ≤ 12) */
function cheapestCover(open, hand, tr) {
  let best = null, bestCost = 1e9;
  const rec = (i, used, picks, cost) => {
    if (cost >= bestCost) return;
    if (i === open.length) { best = picks.slice(); bestCost = cost; return; }
    for (let k = 0; k < hand.length; k++) { if (used & (1 << k)) continue; const c = hand[k]; if (!beats(c, open[i], tr)) continue; picks.push(c); rec(i + 1, used | (1 << k), picks, cost + val(c, tr) * 1 + (c.s === tr ? 3 : 0)); picks.pop(); }
  };
  rec(0, 0, [], 0); return best;
}
/** deck empty: full-information minimax (alpha-beta + memo, node budget); returns the best move or null if out of budget */
function solve(G, me) {
  let nodes = 0; const LIMIT = 90000, memo = new Map();
  const key = (S) => S.hands.map((h) => h.map(id).sort((a, b) => a - b).join('.')).join('|') + '/' + S.table.map((p) => id(p.a) + ':' + (p.d ? id(p.d) : '')).join(',') + '/' + S.att + (S.taking ? 't' : '') + S.boutCap;
  const evalS = (S) => { const h0 = S.hands[1 - me].length, h1 = S.hands[me].length; return Math.tanh((h0 - h1) * 0.15); };   // heuristic when the budget runs out
  function mm(S, depth, a, b) {
    if (S.over) return S.result === 'draw' ? 0 : S.result === me ? -1 : 1;
    if (++nodes > LIMIT || depth > 40) return evalS(S);
    const k = key(S); const hit = memo.get(k); if (hit !== undefined) return hit;
    const who = toAct(S), max = who === me; let v = max ? -2 : 2;
    const ms = orderMoves(legalMoves(S), S.tr);
    for (const m of ms) { const T = clone(S); apply(T, m, true); const r = mm(T, depth + 1, a, b);
      if (max) { if (r > v) v = r; if (v > a) a = v; } else { if (r < v) v = r; if (v < b) b = v; } if (a >= b) break; }
    if (nodes <= LIMIT) memo.set(k, v); return v;
  }
  let best = null, bv = -3; const root = orderMoves(legalMoves(G).filter((m) => m.who === me), G.tr);
  for (const m of root) { const T = clone(G); apply(T, m, true); const r = mm(T, 1, -2, 2); if (r > bv) { bv = r; best = m; } if (nodes > LIMIT) break; }
  return nodes > LIMIT && bv < 0.99 ? null : best;
}
function orderMoves(ms, tr) { return ms.sort((a, b) => (a.c ? val(a.c, tr) : 30) - (b.c ? val(b.c, tr) : 30)); }

// ------------------------------------------------------------------ the table UI
let U = null;
const LINES = {
  hello: ['Ну что, сыграем? Раздаю.', 'Садись. Только не плачь потом.', 'Давай, по-быстрому. Козыри смотри.'],
  iTake: ['Ладно… беру.', 'Беру-беру, не радуйся.', 'Хитрый какой. Беру.'],
  youTake: ['Бери, бери, не стесняйся.', 'Держи ещё, чтоб не скучал.', 'На, на здоровье.'],
  bito: ['Бито.', 'Бито. Твой ход.', 'Отбился, молодец.'],
  win: ['Ну ты дурак! Ещё партию?', 'Дурак, дурак! Погоны вешать?', 'Не твой день, брат.'],
  lose: ['Эх… ладно, повезло тебе.', 'Всё, я дурак. Отыграюсь.', 'Ну ты даёшь. Реванш?'],
  draw: ['Ничья. Бывает.', 'Ничья — оба молодцы.'],
  think: ['Хм…', 'Так-так…', 'Секунду…'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function openDurak(ctx, { stake = 0, onEnd } = {}) {
  if (U) return;
  const G = newGame(), M = makeMemory();
  const root = document.createElement('div'); root.className = 'hkui durak'; document.body.appendChild(root);
  if (!document.getElementById('durak-css')) { const st = document.createElement('style'); st.id = 'durak-css'; st.textContent = CSS; document.head.appendChild(st); }
  U = { ctx, G, M, root, stake, onEnd, busy: false, say: pick(LINES.hello), sel: null };
  try { document.exitPointerLock?.(); } catch {}
  if (ctx.player) ctx.player.mounted = { dialog: true };
  root.addEventListener('click', onClick); addEventListener('keydown', onKey, true);
  render(); setTimeout(step, 700);
}
function close(result) {
  if (!U) return; const { ctx, root, onEnd } = U;
  removeEventListener('keydown', onKey, true); root.remove(); if (ctx.player?.mounted?.dialog) ctx.player.mounted = null;
  U = null; try { ctx.requestPointerLock?.(); } catch {}
  onEnd?.(result);
}
function onKey(e) {
  if (!U) return;
  if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (U.G.over) close(U.G.result); else if (confirmQuit()) close('quit'); return; }
  if (/^Digit[1-9]$|^Numpad[1-9]$|^Key[FBVNPXQTLMH]$|^Space$/.test(e.code)) { e.preventDefault(); e.stopImmediatePropagation();
    const n = +e.code.replace(/\D/g, ''); if (n) { const c = sortedHand()[n - 1]; if (c) playCard(c); }
    if (e.code === 'Space' || e.code === 'KeyF') { const mv = legalMoves(U.G).find((m) => m.who === 0 && (m.kind === 'bito' || m.kind === 'done' || m.kind === 'take')); if (mv) doMove(mv); } }
}
function confirmQuit() { if (U.quitArm && performance.now() - U.quitArm < 2500) return true; U.quitArm = performance.now(); U.say = 'Сдаёшься? Ещё раз Esc — и ты дурак.'; render(); return false; }
function sortedHand() { const G = U.G; return G.hands[0].slice().sort((a, b) => (a.s === G.tr) - (b.s === G.tr) || a.s - b.s || a.r - b.r); }
function onClick(e) {
  const t = e.target.closest('[data-act]'); if (!t || !U) return; const act = t.dataset.act;
  if (act === 'card') { const c = sortedHand()[+t.dataset.k]; if (c) playCard(c); }
  else if (act === 'take' || act === 'bito' || act === 'done') { const mv = legalMoves(U.G).find((m) => m.who === 0 && m.kind === act); if (mv) doMove(mv); }
  else if (act === 'again') { const s = U.stake, cb = U.onEnd; U.onEnd = null; const r = U.G.result; close(r); cb?.(r, true); }
  else if (act === 'leave') close(U.G.over ? U.G.result : 'quit');
}
function playCard(c) {
  const G = U.G; if (U.busy || toAct(G) !== 0) return;
  const ms = legalMoves(G).filter((m) => m.who === 0 && m.c && eq(m.c, c));
  if (!ms.length) { U.say = G.def === 0 && !G.taking && G.table.some((p) => !p.d) ? 'Этим не побьёшь.' : 'Так нельзя — только те ранги, что на столе.'; flash(c); render(); return; }
  doMove(ms[0]);
}
function doMove(m) {
  const G = U.G; apply(G, m); remember(U.M, G);
  if (m.kind === 'take' && m.who === 0) U.say = pick(LINES.youTake);
  if (m.kind === 'bito' && m.who === 0) U.say = pick(['Бито.', 'Ага, бито.']);
  try { U.ctx.audio?.play?.('ui_click'); } catch {}
  render(); if (G.over) return finish(); setTimeout(step, 350);
}
function step() {
  if (!U) return; const G = U.G; if (G.over) return finish();
  if (toAct(G) !== 1) { render(); return; }
  U.busy = true; render();
  setTimeout(() => {
    if (!U) return; const m = aiMove(G, U.M, 1);
    if (m) { apply(G, m); remember(U.M, G);
      if (m.kind === 'take') U.say = pick(LINES.iTake); else if (m.kind === 'bito') U.say = pick(LINES.bito); else if (m.kind === 'done') U.say = pick(['Забирай.', 'Всё, забирай.']);
      else if (m.kind === 'beat' && Math.random() < 0.2) U.say = pick(['Отбился.', 'Легко.', 'Так-то.']); else if (m.kind === 'play' && !G.table.slice(0, -1).length && Math.random() < 0.25) U.say = pick(['Держи.', 'Ну-ка…', 'Отбивайся.']); }
    U.busy = false; render(); if (G.over) return finish(); setTimeout(step, 300);
  }, 550 + Math.random() * 500);
}
function finish() {
  const G = U.G; if (U.done) return; U.done = true;
  const r = G.result; U.say = r === 'draw' ? pick(LINES.draw) : r === 0 ? pick(LINES.win) : pick(LINES.lose);
  const st = stats(); if (r === 'draw') st.d++; else if (r === 0) st.l++; else st.w++; saveStats(st);
  if (U.stake) { if (r === 1) { K.earn(U.stake * 2); } else if (r === 'draw') K.earn(U.stake); }
  render();
}
export function stats() { try { return { w: 0, l: 0, d: 0, ...JSON.parse(localStorage.getItem('zavod.durak') || '{}') }; } catch { return { w: 0, l: 0, d: 0 }; } }
function saveStats(s) { try { localStorage.setItem('zavod.durak', JSON.stringify(s)); } catch {} }
function flash(c) { U.flash = id(c); setTimeout(() => { if (U) { U.flash = null; render(); } }, 400); }

function cardHTML(c, extra = '', attrs = '') {
  const tr = U.G.tr === c.s ? ' trump' : '';
  return `<div class="dk-card${RED[c.s] ? ' red' : ''}${tr}${extra}" ${attrs}><span class="tl">${RANK[c.r]}<br>${SUITS[c.s]}</span><span class="mid">${SUITS[c.s]}</span><span class="br">${RANK[c.r]}<br>${SUITS[c.s]}</span></div>`;
}
function render() {
  if (!U) return; const G = U.G, me = toAct(G) === 0 && !U.busy, st = stats();
  const legal = new Set(legalMoves(G).filter((m) => m.who === 0 && m.c).map((m) => id(m.c)));
  const hand = sortedHand().map((c, k) => cardHTML(c, (me && legal.has(id(c)) ? ' ok' : '') + (U.flash === id(c) ? ' bad' : ''), `data-act="card" data-k="${k}" style="--i:${k}"`)).join('');
  const opp = G.hands[1].map((_, k) => `<div class="dk-back" style="--i:${k}"></div>`).join('');
  const table = G.table.map((p) => `<div class="dk-pair">${cardHTML(p.a)}${p.d ? cardHTML(p.d, ' def') : ''}</div>`).join('');
  const deck = G.deck.length ? `<div class="dk-deck">${G.deck.length > 1 ? '<div class="dk-back stack"></div>' : ''}${cardHTML(G.trumpCard, ' turned')}<b>${G.deck.length}</b></div>` : `<div class="dk-deck empty">козырь <span class="${RED[G.tr] ? 'red' : ''}">${SUITS[G.tr]}</span></div>`;
  const moves = legalMoves(G).filter((m) => m.who === 0);
  const btn = (k, t) => (moves.some((m) => m.kind === k) && me ? `<button data-act="${k}">${t}</button>` : '');
  const status = G.over ? '' : U.busy ? 'Аркадий думает…' : toAct(G) === 0 ? (G.def === 0 && !G.taking ? 'Отбивайся — или бери' : G.taking ? 'Он берёт — подкидывай или хватит' : G.table.length ? 'Подкидывай — или бито' : 'Твой ход — заходи') : '';
  const end = G.over ? `<div class="dk-end"><h2>${G.result === 'draw' ? 'НИЧЬЯ' : G.result === 0 ? 'ТЫ ДУРАК' : 'АРКАДИЙ — ДУРАК'}</h2><p>${G.result === 1 && U.stake ? `+$${U.stake * 2}` : G.result === 0 && U.stake ? `−$${U.stake}` : ''}</p><button data-act="again">Ещё партию</button><button data-act="leave">Встать из-за стола</button></div>` : '';
  U.root.innerHTML = `
    <div class="dk-top"><div class="dk-who">АРКАДИЙ <small>${st.w}–${st.l}${st.d ? '–' + st.d : ''} · ${U.stake ? '$' + U.stake + ' на кону' : 'на интерес'}</small></div><div class="dk-say">${U.say || ''}</div><div class="dk-opp">${opp}</div></div>
    <div class="dk-mid">${deck}<div class="dk-table">${table}</div><div class="dk-bito">${G.discard.length ? `<div class="dk-back pile"></div><small>бито ${G.discard.length}</small>` : ''}</div></div>
    <div class="dk-status">${status}</div>
    <div class="dk-hand">${hand}</div>
    <div class="dk-btns">${btn('take', 'Беру (F)')}${btn('bito', 'Бито (F)')}${btn('done', 'Хватит (F)')}</div>
    <div class="dk-help">клик / 1–9 — карта · F / пробел — беру · бито · Esc — встать</div>${end}`;
}
const CSS = `
.durak{position:fixed;inset:0;z-index:60;background:radial-gradient(ellipse at 50% 45%,#2e6b45 0%,#1d4a31 55%,#0f2a1c 100%);color:#f2efe6;font:500 15px Barlow,Arial;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:14px 12px 10px;user-select:none}
.durak .dk-top{display:flex;flex-direction:column;align-items:center;gap:6px;width:100%}
.durak .dk-who{font:700 18px 'Barlow Condensed',Arial;letter-spacing:.18em}.durak .dk-who small{font:500 12px Barlow;letter-spacing:.05em;opacity:.7;margin-left:8px}
.durak .dk-say{min-height:22px;background:rgba(0,0,0,.35);padding:4px 12px;border-radius:14px;font-style:italic}
.durak .dk-opp,.durak .dk-hand{display:flex;justify-content:center;min-height:118px;align-items:flex-end}
.durak .dk-opp{min-height:92px}
.durak .dk-back{width:62px;height:88px;border-radius:7px;background:repeating-linear-gradient(45deg,#8a1c24 0 6px,#a8262f 6px 12px);border:3px solid #f2efe6;box-shadow:0 2px 6px rgba(0,0,0,.4);margin-left:-34px}
.durak .dk-opp .dk-back:first-child,.durak .dk-hand .dk-card:first-child{margin-left:0}
.durak .dk-card{position:relative;width:74px;height:106px;border-radius:8px;background:#fbfaf5;color:#1a1a1a;box-shadow:0 3px 8px rgba(0,0,0,.45);margin-left:-26px;cursor:pointer;transition:transform .12s,box-shadow .12s;flex:none}
.durak .dk-card.red{color:#c3121b}.durak .dk-card.trump{background:linear-gradient(#fbfaf5,#f5ecd0)}
.durak .dk-card .tl,.durak .dk-card .br{position:absolute;font:700 15px/1.05 Georgia,serif;text-align:center}.durak .dk-card .tl{top:5px;left:6px}.durak .dk-card .br{bottom:5px;right:6px;transform:rotate(180deg)}
.durak .dk-card .mid{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:34px}
.durak .dk-hand .dk-card.ok{transform:translateY(-14px);box-shadow:0 0 0 3px #ffd23b,0 6px 12px rgba(0,0,0,.5)}
.durak .dk-hand .dk-card:hover{transform:translateY(-22px)}.durak .dk-card.bad{animation:dkshake .3s}
@keyframes dkshake{25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
.durak .dk-mid{display:flex;align-items:center;justify-content:center;gap:26px;width:100%;min-height:170px}
.durak .dk-table{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;max-width:640px;min-width:200px}
.durak .dk-pair{position:relative;width:86px;height:124px}.durak .dk-pair .dk-card{position:absolute;left:0;top:0;margin:0;cursor:default}
.durak .dk-pair .dk-card.def{left:12px;top:16px;transform:rotate(12deg)}
.durak .dk-deck{position:relative;width:110px;height:120px}.durak .dk-deck .dk-back.stack{position:absolute;left:0;top:10px;margin:0;z-index:2}
.durak .dk-deck .dk-card.turned{position:absolute;left:26px;top:20px;transform:rotate(90deg);margin:0;cursor:default;z-index:1}
.durak .dk-deck b{position:absolute;left:18px;top:-8px;font:700 13px Barlow;opacity:.8;z-index:3}.durak .dk-deck.empty{display:flex;align-items:center;justify-content:center;font:600 14px Barlow;opacity:.8}
.durak .dk-deck.empty span{font-size:30px;margin-left:6px}.durak .red{color:#ff6a6a}
.durak .dk-bito{width:90px;display:flex;flex-direction:column;align-items:center;gap:4px;opacity:.85}.durak .dk-back.pile{margin:0;transform:rotate(-14deg)}
.durak .dk-status{font:700 14px 'Barlow Condensed';letter-spacing:.14em;color:#ffd27a;min-height:18px;text-transform:uppercase}
.durak .dk-btns{display:flex;gap:10px;min-height:40px}.durak button{font:700 15px 'Barlow Condensed',Arial;letter-spacing:.12em;padding:9px 20px;border:0;border-radius:6px;background:#ffd23b;color:#1a1a1a;cursor:pointer}
.durak .dk-help{font-size:12px;opacity:.55}
.durak .dk-end{position:absolute;inset:0;background:rgba(0,0,0,.55);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px}
.durak .dk-end h2{font:800 52px 'Barlow Condensed',Arial;letter-spacing:.12em;margin:0;color:#ffd23b}.durak .dk-end button{min-width:220px}
@media (max-height:560px){.durak .dk-card{width:58px;height:84px}.durak .dk-back{width:48px;height:68px}.durak .dk-pair{width:70px;height:98px}.durak .dk-mid{min-height:120px}}
`;
