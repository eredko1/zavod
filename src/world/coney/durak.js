// CONEY — Durak with ARKASHA (podkidnoy, 2 players, 36 cards 6…A). Arkasha sits at the card table in the little park by
// Luna Park building 1. Rules as played on every bench in Brighton:
//  · 6 cards each; the last card of the deck is turned up — its suit is trump, and it's the last card anyone draws
//  · lowest trump leads first; the attacker leads any card, the defender beats it (higher same suit, or any trump over a
//    non-trump); the attacker may throw in more cards of ranks already on the table ("подкидывать") — never more than the
//    defender can cover, at most 6 per bout (5 in the very first bout)
//  · all beaten + attacker says "бито" → the cards are out and the defender attacks next; the defender may instead take
//    ("беру") — the attacker can still throw in, then everything goes into the defender's hand and he skips his attack
//  · after each bout the attacker refills to 6 first, then the defender; when the deck is gone the first to empty their hand
//    is out — whoever is left holding cards is the ДУРАК (both empty at once = a draw)
// ПЕРЕВОДНОЙ (the default at Arkasha's table): before beating anything, the defender may lay a card of the SAME rank as the
// attack and send the whole attack back — allowed only while nothing on the table is beaten yet and only if the other player
// holds at least as many cards as will then be on the table (6 max). House rule: you may instead just SHOW the trump of
// that rank ("козырем перевожу") — it stays in your hand, once per card per bout. Transfers can bounce back and forth.
// Arkasha plays to win: he remembers every card that's been out or picked up, keeps his trumps, sheds junk, knows when to take,
// and once the deck is empty (perfect information) he plays the endgame out by search.
import { hangkit as K } from '../hangkit.js';

import { SUITS, RED, RANK, id, eq, beats, newGame, ranksOnTable, canThrow, canTransfer, legalMoves, toAct, apply, makeMemory, remember, aiMove } from './durak-engine.js';
export { newGame, ranksOnTable, canThrow, canTransfer, legalMoves, toAct, apply, makeMemory, remember, aiMove, active, next, toJSON, fromJSON } from './durak-engine.js';   // the rules + Arkasha live in durak-engine.js (2–4 players)

// ------------------------------------------------------------------ the table UI
// One render path for both tables: solo vs ARKASHA (seat 0 = you, seat 1 = him, his moves run here) and the shared table
// over the net (openDurak(ctx, { mp }) — durak-mp.js owns the state and the AI seats; this only draws it seat-relative:
// your seat at the bottom, everyone else across the top clockwise, and only YOUR hand face up).
import { next as nextSeat } from './durak-engine.js';
let U = null;
const LINES = {   // «Бурбон, братва, Гудзон»
  hello: ['Бурбон, братва, Гудзон! Садись, раздаю.', 'Карты на стол — узнаем, кто дурак.', 'Садись. Медведь по козырям — ещё какой мастак.', 'Ты сдавай — бурбон я сам налью.'],
  iTake: ['Ладно… беру. Медведь не жадный.', 'Беру-беру, не радуйся.', 'Хитрый какой. Беру.'],
  youTake: ['«Бей!» кричал сначала, а потом «Беру!» кричал. Как Саша.', 'Бери, бери — Саша тоже стопку копил.', 'Держи ещё, чтоб не скучал.'],
  bito: ['Бито. Дай огня, аккордеон!', 'Бито. Твой ход.', 'Отбился, молодец. Ещё бурбона?'],
  win: ['Вот так, ты дурак — получай сосиской в лоб!', 'Я без карт, а вы при картах — вся колода ваша!', 'Пуст стакан, пуста рука — а ты дурак.'],
  lose: ['Эх… ладно. Наливай, реванш.', 'Всё, я дурак. Саше не говори.', 'Ну ты даёшь. Бурбон за мной.'],
  draw: ['Ничья. Бывает. Наливай.', 'Ничья — оба молодцы. Бурбон, братва, Гудзон!'],
  think: ['Хм…', 'Шейкер, лёд, вермут, бурбон…', 'Так-так…'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function openDurak(ctx, { stake = 0, onEnd, mode = 'perevodnoy', mp = null } = {}) {
  if (U) return false;
  const G = mp ? null : newGame(Math.random, mode), M = mp ? null : makeMemory();
  const root = document.createElement('div'); root.className = 'hkui durak' + (ctx.isTouch ? ' touch' : ''); document.body.appendChild(root);
  if (!document.getElementById('durak-css')) { const st = document.createElement('style'); st.id = 'durak-css'; st.textContent = CSS; document.head.appendChild(st); }
  U = { ctx, G, M, root, stake, onEnd, mode, busy: false, say: mp ? '' : pick(LINES.hello), sel: null, choose: null, mp, me: 0, names: ['ТЫ', 'АРКАША'], v: null, deal: -1 }; ctx.durakOpen = true;   // radio.js plays Luna Park Radio at the table
  try { document.exitPointerLock?.(); } catch {}
  if (ctx.player) ctx.player.mounted = { dialog: true };
  try { ctx.world?.radio?.cue?.('Бурбон, братва, Гудзон'); } catch {}   // durak mode: the table's song from the top
  root.addEventListener('click', onClick); addEventListener('keydown', onKey, true);
  if (mp) syncMP(); render(); if (!mp) setTimeout(step, 700);
  return true;
}
export function closeDurak() { if (U) close('reset'); }   // start fresh from the pause menu
/** shared table: durak-mp.js calls this after every state it adopts (and with a line to say) */
export function durakSync(say) { if (!U?.mp) return; if (say) U.say = say; syncMP(); render(); }
export const durakOpen = () => !!U, durakMine = () => !!U?.mp;
function syncMP() {
  const v = U.mp.view(); U.v = v; U.G = v.G; U.me = v.me; U.names = v.names; U.stake = v.stake; U.busy = false;
  if (v.deal !== U.deal) { U.deal = v.deal; U.done = false; U.choose = null; }
  if (U.G?.over && !U.done) finish();
}
function close(result) {
  if (!U) return; const { ctx, root, onEnd } = U;
  removeEventListener('keydown', onKey, true); root.remove(); if (ctx.player?.mounted?.dialog) ctx.player.mounted = null; ctx.durakOpen = false;
  U = null; try { ctx.requestPointerLock?.(); } catch {}
  onEnd?.(result);
}
function onKey(e) {
  if (!U) return;
  if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (!U.G || U.G.over || U.me < 0) close(U.G?.over ? U.G.result : 'quit'); else if (confirmQuit()) close('quit'); return; }
  if (e.code === 'KeyL') { e.preventDefault(); e.stopImmediatePropagation(); const S = U.ctx.settings; S.radio = S.radio === 'off' ? 'car' : 'off'; U.say = S.radio === 'off' ? 'Радио выключил.' : '📻 Luna Park Radio — погромче!'; render(); return; }
  if (e.code === 'Period') { return; }   // radio.js: next track
  if (/^Digit[1-9]$|^Numpad[1-9]$|^Key[FBVNPXQTMH]$|^Space$/.test(e.code)) { e.preventDefault(); e.stopImmediatePropagation();
    if (U.mp && !U.G) { if ((e.code === 'Space' || e.code === 'KeyF') && U.v?.host) U.mp.deal(); return; }   // the lobby: the host deals
    const n = +e.code.replace(/\D/g, ''); if (n) { const c = sortedHand()[n - 1]; if (c) playCard(c); }
    if (e.code === 'Space' || e.code === 'KeyF') { const mv = myMoves().find((m) => m.kind === 'bito' || m.kind === 'done' || m.kind === 'take'); if (mv) doMove(mv); } }
}
function confirmQuit() { if (U.quitArm && performance.now() - U.quitArm < 2500) return true; U.quitArm = performance.now(); U.say = U.mp ? 'Встаёшь? Ещё раз Esc — за тебя доиграет Саша (ставка сгорит).' : 'Сдаёшься? Ещё раз Esc — и ты дурак.'; render(); return false; }
function sortedHand() { const G = U.G; if (!G || U.me < 0) return []; return G.hands[U.me].slice().sort((a, b) => (a.s === G.tr) - (b.s === G.tr) || a.s - b.s || a.r - b.r); }
function myMoves() { const G = U.G; if (!G || U.me < 0 || G.over || toAct(G) !== U.me) return []; return legalMoves(G).filter((m) => m.who === U.me); }
function onClick(e) {
  const t = e.target.closest('[data-act]'); if (!t || !U) return; const act = t.dataset.act;
  if (act === 'card') { const c = sortedHand()[+t.dataset.k]; if (c) playCard(c); }
  else if (act === 'pick') { const m = U.choose?.ms.find((x) => x.kind === t.dataset.k); if (m) doMove(m); }
  else if (act === 'cancel') { U.choose = null; render(); }
  else if (act === 'take' || act === 'bito' || act === 'done') { const mv = myMoves().find((m) => m.kind === act); if (mv) doMove(mv); }
  else if (act === 'deal') U.mp?.deal();
  else if (act === 'seats') U.mp?.seats(+t.dataset.k);
  else if (act === 'again') { if (U.mp) { U.mp.again(); U.say = U.v?.host ? '' : 'Ждём раздачу…'; render(); return; } const cb = U.onEnd; U.onEnd = null; const r = U.G.result; close(r); cb?.(r, true); }
  else if (act === 'leave') close(U.G?.over ? U.G.result : 'quit');
}
function playCard(c) {
  const G = U.G; if (!G || U.busy || U.me < 0 || toAct(G) !== U.me) return;
  const ms = myMoves().filter((m) => m.c && eq(m.c, c));
  if (!ms.length) { U.say = G.def === U.me && !G.taking && G.table.some((p) => !p.d) ? 'Этим не побьёшь.' : 'Так нельзя — только те ранги, что на столе.'; flash(c); render(); return; }
  const kinds = [...new Set(ms.map((m) => m.kind))];
  if (kinds.length > 1) { U.choose = { c, ms }; render(); return; }   // it could beat OR transfer: ask
  doMove(ms[0]);
}
function doMove(m) {
  U.choose = null;
  try { U.ctx.audio?.play?.('ui_click'); } catch {}
  if (U.mp) { U.busy = true; render(); U.mp.move(m); return; }   // the host applies it (ours or over the net) and hands us back the table
  const G = U.G; apply(G, m); remember(U.M, G);
  if (m.kind === 'transfer' || m.kind === 'show') U.say = pick(['Ах ты ж… перевёл!', 'Перевод, значит. Ну-ну.', 'Хитро.']);
  if (m.kind === 'take' && m.who === 0) U.say = pick(LINES.youTake);
  if (m.kind === 'bito' && m.who === 0) U.say = pick(['Бито.', 'Ага, бито.']);
  render(); if (G.over) return finish(); setTimeout(step, 350);
}
function step() {
  if (!U || U.mp) return; const G = U.G; if (G.over) return finish();
  if (toAct(G) !== 1) { render(); return; }
  U.busy = true; render();
  setTimeout(() => {
    if (!U) return; const m = aiMove(G, U.M, 1);
    if (m) { apply(G, m); remember(U.M, G);
      if (m.kind === 'transfer') U.say = pick(['Перевожу.', 'А я переведу!', 'На, отбивайся сам.']); else if (m.kind === 'show') U.say = pick(['Козырем перевожу — вот, смотри.', 'Показываю козыря. Перевод.']); else if (m.kind === 'take') U.say = pick(LINES.iTake); else if (m.kind === 'bito') U.say = pick(LINES.bito); else if (m.kind === 'done') U.say = pick(['Забирай.', 'Всё, забирай.']);
      else if (m.kind === 'beat' && Math.random() < 0.2) U.say = pick(['Отбился.', 'Легко.', 'Так-то.']); else if (m.kind === 'play' && !G.table.slice(0, -1).length && Math.random() < 0.25) U.say = pick(['Держи.', 'Ну-ка…', 'Отбивайся.']); }
    U.busy = false; render(); if (G.over) return finish(); setTimeout(step, 300);
  }, 550 + Math.random() * 500);
}
function finish() {
  const G = U.G; if (U.done) return; U.done = true;
  const r = G.result;
  if (!U.mp) U.say = r === 'draw' ? pick(LINES.draw) : r === 0 ? pick(LINES.win) : pick(LINES.lose);
  if (r === U.me) { const sz = document.createElement('div'); sz.className = 'dk-sausage'; sz.textContent = '🌭'; U.root.appendChild(sz); setTimeout(() => sz.remove(), 1600); try { U.ctx.audio?.play?.('impact_flesh', { volume: 1.2 }); } catch {} }   // «получай сосиской в лоб!»
  if (U.mp) return;   // the shared table: durak-mp.js pays out; Arkasha's head-to-head score is his own
  const st = stats(); if (r === 'draw') st.d++; else if (r === 0) st.l++; else st.w++; saveStats(st);
  if (U.stake) { if (r === 1) { K.earn(U.stake * 2); } else if (r === 'draw') K.earn(U.stake); }
  render();
}
export function stats() { try { return { w: 0, l: 0, d: 0, ...JSON.parse(localStorage.getItem('zavod.durak') || '{}') }; } catch { return { w: 0, l: 0, d: 0 }; } }
function saveStats(s) { try { localStorage.setItem('zavod.durak', JSON.stringify(s)); } catch {} }
function flash(c) { U.flash = id(c); setTimeout(() => { if (U) { U.flash = null; render(); } }, 400); }
/** each winner's cut: the pot (stake × every seat, AI seats included) split by everyone but the durak */
export const potShare = (stake, n) => Math.floor((stake * n) / Math.max(1, n - 1));
const passedSet = (G) => new Set(Array.isArray(G.passed) ? G.passed : G.passed instanceof Set ? [...G.passed] : []);   // who has let the throw-in token go (engine field, if it keeps one)

function cardHTML(c, extra = '', attrs = '') {
  const tr = U.G.tr === c.s ? ' trump' : '';
  return `<div class="dk-card${RED[c.s] ? ' red' : ''}${tr}${extra}" ${attrs}><span class="tl">${RANK[c.r]}<br>${SUITS[c.s]}</span><span class="mid">${SUITS[c.s]}</span><span class="br">${RANK[c.r]}<br>${SUITS[c.s]}</span></div>`;
}
function seatHTML(G, s, n) {
  const out = (G.out || []).includes(s), turn = !G.over && toAct(G) === s, cnt = G.hands[s].length, small = n > 2;
  const backs = Array.from({ length: Math.min(cnt, small ? 7 : 36) }, (_, k) => `<div class="dk-back${small ? ' sm' : ''}" style="--i:${k}"></div>`).join('');
  const b = [];
  if (!G.over && !out) { if (s === G.att) b.push('<em class="att">АТАКА</em>'); if (s === G.def) b.push(G.taking ? '<em class="take">БЕРЁТ</em>' : '<em class="def">ЗАЩИТА</em>'); if (passedSet(G).has(s)) b.push('<em class="ok">✓ ПАС</em>'); }
  if (out) b.push('<em class="out">ВЫШЕЛ</em>');
  const ai = U.mp && U.v?.ai?.[s] ? ' <i>AI</i>' : '';
  return `<div class="dk-seat${turn ? ' turn' : ''}${out ? ' gone' : ''}" data-seat="${s}">${U.mp || small ? `<div class="nm">${esc(U.names[s])}${ai}${small ? ` <b>${cnt}</b>` : ''}</div>` : ''}<div class="dk-opp">${backs}</div><div class="bd">${b.join('')}</div></div>`;
}
function render() {
  if (!U) return; const G = U.G;
  if (!G) return renderLobby();
  const me = U.me, n = G.n || G.hands.length, mine = U.busy ? [] : myMoves(), myTurn = mine.length > 0, st = stats();
  const legal = new Set(mine.filter((m) => m.c).map((m) => id(m.c))), txs = new Set(mine.filter((m) => m.kind === 'transfer' || m.kind === 'show').map((m) => id(m.c)));
  const hs = sortedHand(), cw = innerWidth < 620 ? 52 : 74, W = Math.min(innerWidth - 24, 900), ov = hs.length > 1 ? Math.max(-(cw - 16), Math.min(-Math.round(cw * 0.35), (W - cw * hs.length) / (hs.length - 1))) : 0;
  const hand = hs.map((c, k) => cardHTML(c, (legal.has(id(c)) ? ' ok' : '') + (txs.has(id(c)) ? ' tx' : '') + (U.flash === id(c) ? ' bad' : ''), `data-act="card" data-k="${k}" style="--i:${k}"`)).join('');
  const others = me >= 0 ? Array.from({ length: n - 1 }, (_, k) => (me + 1 + k) % n) : Array.from({ length: n }, (_, k) => k);
  const seats = others.map((s) => seatHTML(G, s, n)).join('');
  const table = G.table.map((p) => `<div class="dk-pair">${cardHTML(p.a)}${p.d ? cardHTML(p.d, ' def') : ''}</div>`).join('');
  const deck = G.deck.length ? `<div class="dk-deck">${G.deck.length > 1 ? '<div class="dk-back stack"></div>' : ''}${cardHTML(G.trumpCard, ' turned')}<b>${G.deck.length}</b></div>` : `<div class="dk-deck empty">козырь <span class="${RED[G.tr] ? 'red' : ''}">${SUITS[G.tr]}</span></div>`;
  const tgt = me >= 0 && txs.size ? nextSeat(G, me) : -1, tgtName = tgt >= 0 && n > 2 ? ` → ${esc(U.names[tgt])}` : '';
  const iAtt = me === G.att, btn = (k, t) => (mine.some((m) => m.kind === k) ? `<button data-act="${k}">${t}</button>` : '');
  const who = toAct(G), whoName = esc(U.names[who] || '');
  const status = G.over ? '' : me < 0 ? `Смотришь — сядешь со следующей раздачи · ходит ${whoName}` : U.busy ? (U.mp ? 'Ход отправлен…' : 'Аркаша думает…') : myTurn ? (G.def === me && !G.taking ? (txs.size ? `Отбивайся, переводи${tgtName} — или бери` : 'Отбивайся — или бери') : G.taking ? `${n > 2 ? esc(U.names[G.def]) : 'Он'} берёт — подкидывай или хватит` : G.table.length ? (iAtt ? 'Подкидывай — или бито' : 'Подкидывай — или пас') : 'Твой ход — заходи') : U.mp ? `${U.v?.ai?.[who] ? 'Думает' : 'Ходит'} ${whoName}…` : '';
  const KN = { beat: 'Бить', transfer: `Перевести${tgtName}`, show: `Показать козыря (перевод${tgtName})` };
  const choose = U.choose ? `<div class="dk-choose">${U.choose.ms.map((m) => `<button data-act="pick" data-k="${m.kind}">${KN[m.kind] || m.kind}</button>`).join('')}<button data-act="cancel" class="ghost">Отмена</button></div>` : '';
  const radio = U.ctx.world?.radio?.now && U.ctx.settings?.radio !== 'off' ? `<div class="dk-radio">📻 ${U.ctx.world.radio.now} · L — выкл · . — дальше</div>` : `<div class="dk-radio off">📻 L — радио</div>`;
  let end = '';
  if (G.over) {
    const r = G.result, share = potShare(U.stake, n), money = !U.stake || me < 0 ? '' : r === 'draw' ? (U.mp ? `ставка $${U.stake} назад` : '') : r === me ? `−$${U.stake}` : `+$${share}`;
    end = `<div class="dk-end"><h2>${r === 'draw' ? 'НИЧЬЯ' : r === me ? 'ТЫ ДУРАК' : `${esc(U.names[r])} — ДУРАК`}</h2><p>${money}</p>${U.mp && U.say ? `<p class="say">${esc(U.say)}</p>` : ''}<button data-act="again">Ещё партию</button><button data-act="leave">Встать из-за стола</button></div>`;
  }
  const title = U.mp ? `ОБЩИЙ СТОЛ <small>${G.mode === 'perevodnoy' ? 'переводной' : 'подкидной'} · ${n} за столом · ${U.stake ? '$' + U.stake + ' с каждого' : 'на интерес'}</small>` : `АРКАША <small>${G.mode === 'perevodnoy' ? 'переводной' : 'подкидной'} · ${st.w}–${st.l}${st.d ? '–' + st.d : ''} · ${U.stake ? '$' + U.stake + ' на кону' : 'на интерес'}</small>`;
  const meB = U.mp && me >= 0 && !G.over ? ((G.out || []).includes(me) ? ' · ты вышел' : me === G.att ? ' · ты в атаке' : me === G.def ? ' · ты отбиваешься' : '') : '';
  U.root.innerHTML = `
    <div class="dk-top"><div class="dk-who">${title}</div><div class="dk-say">${esc(U.say || '')}</div><div class="dk-seats n${n}">${seats}</div></div>
    <div class="dk-mid">${deck}<div class="dk-table">${table}</div><div class="dk-bito">${G.discard.length ? `<div class="dk-back pile"></div><small>бито ${G.discard.length}</small>` : ''}</div></div>
    <div class="dk-status${me >= 0 && who === me && !G.over ? ' mine' : ''}">${status}${meB}</div>
    <div class="dk-hand" style="--ov:${Math.round(ov)}px">${hand}</div>
    <div class="dk-btns">${btn('take', 'Беру (F)')}${btn('bito', iAtt ? 'Бито (F)' : 'Пас (F)')}${btn('done', 'Хватит (F)')}</div>
    <div class="dk-help">${U.ctx.isTouch ? 'тап — карта · синяя рамка — можно перевести' : 'клик / 1–9 — карта · синяя рамка — можно перевести · F / пробел — беру · бито · пас · L — радио · Esc — встать'}</div>${radio}${choose}${end}`;
}
function renderLobby() {
  const v = U.v || {}, seats = (v.seats || []).map((s) => `<li class="${s.ai ? 'ai' : ''}${s.me ? ' me' : ''}">${esc(s.n)}${s.ai ? ' <i>AI</i>' : ''}${s.me ? ' <i>ты</i>' : ''}</li>`).join('');
  const cnt = [2, 3, 4].map((k) => `<button data-act="seats" data-k="${k}" class="${k === v.want ? '' : 'ghost'}"${k < (v.humans || 1) ? ' disabled' : ''}>${k}</button>`).join('');
  const wait = v.wait?.length ? `<p>Ждут следующей раздачи: ${v.wait.map(esc).join(', ')}</p>` : '';
  U.root.innerHTML = `
    <div class="dk-top"><div class="dk-who">ОБЩИЙ СТОЛ <small>${v.mode === 'podkidnoy' ? 'подкидной' : 'переводной'} · ${v.stake ? '$' + v.stake + ' с каждого' : 'на интерес'}</small></div><div class="dk-say">${esc(U.say || 'ARKASHA: «Садитесь, братва. Места всем хватит.»')}</div></div>
    <div class="dk-lobby"><h2>ЗА СТОЛОМ</h2><ol>${seats}</ol>${wait}
      ${v.host ? `<div class="dk-cnt">мест: ${cnt}</div><button data-act="deal">Раздать (F)</button>` : `<p>Ждём, пока ${esc(v.hostName || 'хозяин стола')} раздаст…</p>`}
      <button data-act="leave" class="ghost">Встать</button></div>`;
}
const CSS = `
.durak{position:fixed;inset:0;z-index:60;background:radial-gradient(ellipse at 50% 45%,#2e6b45 0%,#1d4a31 55%,#0f2a1c 100%);color:#f2efe6;font:500 15px Barlow,Arial;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:14px 12px 10px;user-select:none;overflow:hidden}
.durak .dk-top{display:flex;flex-direction:column;align-items:center;gap:6px;width:100%}
.durak .dk-who{font:700 18px 'Barlow Condensed',Arial;letter-spacing:.18em;text-align:center}.durak .dk-who small{font:500 12px Barlow;letter-spacing:.05em;opacity:.7;margin-left:8px}
.durak .dk-say{min-height:22px;background:rgba(0,0,0,.35);padding:4px 12px;border-radius:14px;font-style:italic;max-width:94%;text-align:center}
.durak .dk-seats{display:flex;justify-content:center;gap:10px;width:100%}
.durak .dk-seat{display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px 6px;border-radius:10px;min-width:0;flex:0 1 auto}
.durak .dk-seats.n3 .dk-seat,.durak .dk-seats.n4 .dk-seat{flex:1 1 0;max-width:220px;background:rgba(0,0,0,.18)}
.durak .dk-seat .nm{font:700 13px 'Barlow Condensed',Arial;letter-spacing:.1em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}.durak .dk-seat .nm b{background:rgba(0,0,0,.4);border-radius:8px;padding:0 6px;margin-left:4px}
.durak .dk-seat i,.durak .dk-lobby i{font:600 10px Barlow;opacity:.6;font-style:normal}
.durak .dk-seat.turn{box-shadow:0 0 0 2px #ffd23b,0 0 18px rgba(255,210,59,.55)}.durak .dk-seat.gone{opacity:.5}
.durak .dk-seat .bd{display:flex;gap:4px;min-height:16px;flex-wrap:wrap;justify-content:center}.durak .dk-seat em{font:700 10px Barlow;font-style:normal;letter-spacing:.08em;padding:1px 6px;border-radius:8px;background:#444}
.durak em.att{background:#c3121b}.durak em.def{background:#1f5fa8}.durak em.take{background:#b8860b}.durak em.ok{background:#2e7d32}.durak em.out{background:#555}
.durak .dk-opp,.durak .dk-hand{display:flex;justify-content:center;min-height:118px;align-items:flex-end}
.durak .dk-opp{min-height:92px}.durak .dk-seats.n3 .dk-opp,.durak .dk-seats.n4 .dk-opp{min-height:44px}
.durak .dk-back{width:62px;height:88px;border-radius:7px;background:repeating-linear-gradient(45deg,#8a1c24 0 6px,#a8262f 6px 12px);border:3px solid #f2efe6;box-shadow:0 2px 6px rgba(0,0,0,.4);margin-left:-34px;flex:none}
.durak .dk-back.sm{width:26px;height:38px;border-width:2px;border-radius:4px;margin-left:-17px}
.durak .dk-opp .dk-back:first-child,.durak .dk-hand .dk-card:first-child{margin-left:0}
.durak .dk-card{position:relative;width:74px;height:106px;border-radius:8px;background:#fbfaf5;color:#1a1a1a;box-shadow:0 3px 8px rgba(0,0,0,.45);margin-left:-26px;cursor:pointer;transition:transform .12s,box-shadow .12s;flex:none}
.durak .dk-hand .dk-card{margin-left:var(--ov,-26px)}
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
.durak .dk-deck{position:relative;width:110px;height:120px;flex:none}.durak .dk-deck .dk-back.stack{position:absolute;left:0;top:10px;margin:0;z-index:2}
.durak .dk-deck .dk-card.turned{position:absolute;left:26px;top:20px;transform:rotate(90deg);margin:0;cursor:default;z-index:1}
.durak .dk-deck b{position:absolute;left:18px;top:-8px;font:700 13px Barlow;opacity:.8;z-index:3}.durak .dk-deck.empty{display:flex;align-items:center;justify-content:center;font:600 14px Barlow;opacity:.8}
.durak .dk-deck.empty span{font-size:30px;margin-left:6px}.durak .red{color:#ff6a6a}
.durak .dk-bito{width:90px;display:flex;flex-direction:column;align-items:center;gap:4px;opacity:.85;flex:none}.durak .dk-back.pile{margin:0;transform:rotate(-14deg)}
.durak .dk-status{font:700 14px 'Barlow Condensed';letter-spacing:.14em;color:#ffd27a;min-height:18px;text-transform:uppercase;text-align:center}.durak .dk-status.mine{color:#fff3b0;text-shadow:0 0 10px rgba(255,210,59,.7)}
.durak .dk-btns{display:flex;gap:10px;min-height:40px}.durak button{font:700 15px 'Barlow Condensed',Arial;letter-spacing:.12em;padding:9px 20px;border:0;border-radius:6px;background:#ffd23b;color:#1a1a1a;cursor:pointer}
.durak button:disabled{opacity:.35;cursor:default}
.durak .dk-help{font-size:12px;opacity:.55;text-align:center}
.durak .dk-sausage{position:absolute;left:50%;top:40%;font-size:40px;z-index:70;animation:dksaus 1.5s ease-in forwards;pointer-events:none}
@keyframes dksaus{0%{transform:translate(260px,-240px) rotate(-60deg) scale(.6)}55%{transform:translate(-50%,-20%) rotate(20deg) scale(4.5)}62%{transform:translate(-50%,-10%) rotate(10deg) scale(4.2)}100%{transform:translate(-50%,160%) rotate(90deg) scale(3);opacity:0}}
.durak .dk-hand .dk-card.tx{box-shadow:0 0 0 3px #4aa3ff,0 6px 12px rgba(0,0,0,.5)}
.durak .dk-choose{position:absolute;left:50%;bottom:170px;transform:translateX(-50%);display:flex;flex-wrap:wrap;justify-content:center;gap:8px;background:rgba(0,0,0,.6);padding:10px;border-radius:10px;max-width:94vw}.durak button.ghost{background:#ddd}
.durak .dk-radio{position:absolute;right:14px;top:12px;font:600 12px Barlow;opacity:.8;background:rgba(0,0,0,.3);padding:4px 10px;border-radius:12px}.durak .dk-radio.off{opacity:.45}
.durak .dk-end{position:absolute;inset:0;background:rgba(0,0,0,.55);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;padding:0 12px}
.durak .dk-end h2{font:800 52px 'Barlow Condensed',Arial;letter-spacing:.12em;margin:0;color:#ffd23b}.durak .dk-end button{min-width:220px}.durak .dk-end .say{font-style:italic;opacity:.85;margin:0}
.durak .dk-lobby{display:flex;flex-direction:column;align-items:center;gap:10px;margin:auto 0;background:rgba(0,0,0,.35);padding:16px 22px;border-radius:14px;max-width:94vw}
.durak .dk-lobby h2{font:800 30px 'Barlow Condensed',Arial;letter-spacing:.14em;margin:0;color:#ffd23b}.durak .dk-lobby ol{margin:0;padding-left:22px;font:600 17px Barlow;line-height:1.6}.durak .dk-lobby li.ai{opacity:.7}.durak .dk-lobby li.me{color:#ffd23b}
.durak .dk-lobby p{margin:0;opacity:.8;text-align:center}.durak .dk-cnt{display:flex;gap:6px;align-items:center}.durak .dk-cnt button{padding:6px 14px}
.durak.touch button{padding:12px 20px;min-height:44px}
@media (max-height:560px){.durak .dk-card{width:58px;height:84px}.durak .dk-back{width:48px;height:68px}.durak .dk-back.sm{width:22px;height:32px}.durak .dk-pair{width:70px;height:98px}.durak .dk-mid{min-height:120px}}
@media (max-width:860px){.durak .dk-radio{display:none}}
@media (max-width:620px){.durak{padding:8px 6px 6px;font-size:13px}.durak .dk-card{width:52px;height:76px;border-radius:6px}.durak .dk-card .tl,.durak .dk-card .br{font-size:12px}.durak .dk-card .mid{font-size:24px}
  .durak .dk-back{width:44px;height:64px;margin-left:-28px}.durak .dk-back.sm{width:20px;height:30px;margin-left:-14px}.durak .dk-opp{min-height:66px}.durak .dk-hand{min-height:92px}
  .durak .dk-seats{gap:4px}.durak .dk-seat{padding:3px 2px}.durak .dk-seat .nm{font-size:11px}.durak .dk-seat em{font-size:9px;padding:1px 4px}
  .durak .dk-mid{gap:6px;min-height:130px}.durak .dk-table{gap:6px;min-width:0;flex:1 1 auto}.durak .dk-pair{width:60px;height:88px}.durak .dk-pair .dk-card.def{left:8px;top:11px}
  .durak .dk-deck{width:64px;height:90px}.durak .dk-deck .dk-card.turned{left:12px;top:8px}.durak .dk-bito{width:48px}.durak .dk-deck.empty{flex-direction:column;font-size:11px}.durak .dk-deck.empty span{font-size:22px;margin:0}.durak .dk-back.pile{margin:0}
  .durak .dk-status{font-size:12px;letter-spacing:.08em}.durak .dk-btns{gap:6px;flex-wrap:wrap;justify-content:center}.durak .dk-help{font-size:10px}
  .durak .dk-end h2{font-size:34px}.durak .dk-radio{display:none}.durak .dk-who{font-size:14px}.durak .dk-who small{display:block;margin:0}.durak .dk-choose{bottom:130px}}
`;
