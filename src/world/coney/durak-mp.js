// CONEY — the shared durak table at ARKASHA's: 2–4 humans over the net, empty seats played by ARKASHA, SASHA, McGUINNESS, THE ELF.
// Casual trust: the HOST (whoever opened the table) deals, runs the AI seats (each with its own card memory), validates every human
// move with the engine's apply() and broadcasts the FULL state with a monotonic seq after each move. Every client keeps the full
// state (so host migration is trivial: if the host drops, the lowest remaining seated human id takes over at the same seq); the UI
// (durak.js) only ever shows your own hand face up.
// Wire — one event type 'dk' (reliable: net.js re-sends it once), `k` = kind, `table` = table id (host id + random), never crosses:
//   st     host → all   { table, seq, host, seats:[[id|'', name]], want, stake, mode, ph:'lobby'|'play', deal, wait:[[id,name]], lm:[seat,kind]|null, g }
//                       g = toJSON(G) with every card packed to a 2-char string ('~' + one char) so a 4-player state fits net.js's 4 KB cap;
//                       re-broadcast every 4 s as a heartbeat (same seq: late listeners catch up, the dialog knows who's seated)
//   join   any → host   { table, n }                 seat me (lobby) or queue me for the next deal (spectate meanwhile)
//   move   seated → host { table, seq, m }           m = { who, kind, c?:{r,s}, i? } against state seq (stale → ignored)
//   nack   host → one   { table, to, seq, why }      illegal move rejected
//   again  any → host   { table }                    re-deal with the same seats (+ whoever is waiting); stakes re-collected
//   leave  any → all    { table }                    my seat goes to an AI (or out of the lobby); if I was the host → migration
//   close  host → all   { table }                    last human left: the table is gone
// Stakes: every human pays `stake` when a deal starts (their own wallet, K.pay); the pot is stake × seats (AI seats stake too — from
// nowhere); the durak gets nothing, everyone else takes pot / (n − 1). A human who walks away mid-game forfeits.
import { hangkit as K } from '../hangkit.js';
import { SUITS, newGame, legalMoves, toAct, apply, aiMove, makeMemory, remember, toJSON, fromJSON } from './durak-engine.js';
import { openDurak, durakSync, durakOpen, durakMine, closeDurak, potShare } from './durak.js';

const AI_NAMES = ['ARKASHA', 'SASHA', 'McGUINNESS', 'THE ELF'], KINDS = ['play', 'beat', 'take', 'transfer', 'show', 'bito', 'done'];
const LIVE_MS = 12000, BEAT_MS = 4000, NEAR = 30;
let S = null;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const myId = () => S?.ctx.net?.id || null;
const netUp = () => !!(S?.ctx.net?.connected && S.ctx.net.id);
const toast = (t, ms = 2200) => { try { K.toast(t, ms); } catch {} };

export function initDurakMP(ctx, { pos } = {}) {
  if (S) { S.ctx = ctx; S.pos = pos || S.pos; return; }
  S = { ctx, pos, T: null, mems: [], rooms: new Map(), gone: new Set(), told: new Set(), paidDeal: null, paid: false, paidOut: null, aiT: 0, aiDelay: 750, beatAt: 0, joining: null, lastNack: null, pendingAt: 0 };
  ctx.bus.on('net:dk', (m) => { try { onMsg(m); } catch (e) { console.warn('[durak-mp]', e); } });
  setInterval(() => { try { tick(); } catch (e) { console.warn('[durak-mp] tick', e); } }, 500);
  if (typeof window !== 'undefined' && window.__game) window.__game.durakMP = durakMPQA;
}

// ------------------------------------------------------------------ packing (cards → '~' + one char '0'…'S')
const isCard = (v) => v && typeof v === 'object' && !Array.isArray(v) && Number.isInteger(v.r) && Number.isInteger(v.s) && Object.keys(v).length === 2;
function pack(v) { if (isCard(v)) return '~' + String.fromCharCode(24 + v.r * 4 + v.s); if (Array.isArray(v)) return v.map(pack); if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = pack(v[k]); return o; } return v; }
function unpack(v) {
  if (typeof v === 'string' && v.length === 2 && v[0] === '~') { const x = v.charCodeAt(1) - 24; return x >= 24 && x < 60 ? { r: x >> 2, s: x & 3 } : null; }
  if (Array.isArray(v)) return v.map(unpack); if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = unpack(v[k]); return o; } return v;
}
const str = (s, n = 16) => String(s ?? '').slice(0, n);
const okId = (s) => typeof s === 'string' && /^[a-z0-9]{8}$/.test(s);

// ------------------------------------------------------------------ table helpers
const seatOf = (T, pid = myId()) => (T && pid ? T.seats.findIndex((s) => s.id === pid) : -1);
const humans = (T) => T.seats.filter((s) => s.id).map((s) => ({ id: s.id, n: s.n }));
const nameOf = (pid) => (pid === myId() ? S.ctx.net?.name : S.ctx.net?.peer?.(pid)?.name) || 'игрок';
function makeSeats(hs, want) {
  const n = Math.max(2, Math.min(4, Math.max(want, hs.length))), seats = hs.slice(0, 4).map((h) => ({ id: h.id, n: h.n }));
  for (const nm of AI_NAMES) { if (seats.length >= n) break; seats.push({ id: '', n: nm }); }
  return seats;
}
const freeAIName = (T) => AI_NAMES.find((nm) => !T.seats.some((s) => !s.id && s.n === nm)) || 'ARKASHA';
function rememberAll() {   // remember() consumes G.pickedUp — hand it to every AI's memory
  const G = S.T.G, pu = G.pickedUp; for (const M of S.mems) { G.pickedUp = pu; remember(M, G); } G.pickedUp = null;
}
function freshMems() { const T = S.T; S.mems = T.seats.map(() => makeMemory()); if (T.G) { T.G.pickedUp = null; for (const M of S.mems) remember(M, T.G); } }

// ------------------------------------------------------------------ wire
function wire(T) {
  return { table: T.id, seq: T.seq, host: T.host, seats: T.seats.map((s) => [s.id || '', s.n]), want: T.want, stake: T.stake, mode: T.mode, ph: T.ph, deal: T.deal,
    wait: T.wait.map((w) => [w.id, w.n]), lm: T.lm, g: T.G ? pack(toJSON(T.G)) : null };
}
function broadcast() {
  const T = S.T; if (!T || T.host !== myId()) return; S.beatAt = performance.now();
  const m = wire(T); const len = JSON.stringify(m).length; if (len > 3800) console.warn('[durak-mp] state is', len, 'bytes');
  S.ctx.net?.send?.('dk', { k: 'st', ...m });
}
const send = (k, data = {}) => S.ctx.net?.send?.('dk', { k, table: S.T?.id || data.table, ...data });
function decode(m) {
  if (typeof m.table !== 'string' || !okId(m.host) || !Number.isInteger(m.seq) || !Array.isArray(m.seats) || m.seats.length < 2 || m.seats.length > 4) return null;
  let G = null;
  if (m.g) { const o = unpack(m.g); if (!o || o.n !== m.seats.length || !Array.isArray(o.hands) || o.hands.length !== o.n) return null; G = fromJSON(o); }
  return { id: str(m.table, 24), seq: m.seq, host: m.host, seats: m.seats.map((s) => ({ id: okId(s?.[0]) ? s[0] : '', n: str(s?.[1]) || '?' })), want: Math.max(2, Math.min(4, m.want | 0)), stake: Math.max(0, Math.min(500, m.stake | 0)),
    mode: m.mode === 'podkidnoy' ? 'podkidnoy' : 'perevodnoy', ph: m.ph === 'play' ? 'play' : 'lobby', deal: m.deal | 0, wait: (Array.isArray(m.wait) ? m.wait : []).slice(0, 4).filter((w) => okId(w?.[0])).map((w) => ({ id: w[0], n: str(w[1]) || '?' })),
    lm: Array.isArray(m.lm) ? [m.lm[0] | 0, str(m.lm[1], 10)] : null, G };
}
function normMove(m) {
  if (!m || typeof m !== 'object' || !KINDS.includes(m.kind) || !Number.isInteger(m.who)) return null;
  const o = { who: m.who, kind: m.kind };
  if (m.c) { if (!Number.isInteger(m.c.r) || !Number.isInteger(m.c.s)) return null; o.c = { r: m.c.r, s: m.c.s }; }
  if (m.i !== undefined) { if (!Number.isInteger(m.i)) return null; o.i = m.i; }
  return o;
}

// ------------------------------------------------------------------ receive
function onMsg(m) {
  if (!S || !m || typeof m.k !== 'string' || typeof m.table !== 'string') return;
  const T = S.T, mine = T && T.id === m.table, host = mine && T.host === myId();
  if (m.k === 'st') return onState(m);
  if (m.k === 'close') { S.rooms.delete(m.table); if (mine && m.f === T.host) { drop(); toast('ARKASHA: «Стол закрыли. Бурбон, братва, Гудзон.»'); } return; }
  if (!mine) return;
  if (m.k === 'leave') { S.gone.add(m.f); if (host) hostLeave(m.f); else if (m.f === T.host) tick(); return; }
  if (m.k === 'nack') { if (m.to === myId()) { S.lastNack = { seq: m.seq, why: str(m.why, 40) }; if (durakMine()) durakSync(`Так нельзя${m.why === 'turn' ? ' — сейчас не твой ход' : ''}.`); } return; }
  if (!host) return;
  if (m.k === 'join') return hostJoin(m.f, str(m.n) || nameOf(m.f));
  if (m.k === 'again') { if (T.ph === 'lobby' || T.G?.over) hostDeal(); return; }
  if (m.k === 'move') {
    if (m.seq !== T.seq) return;   // stale: they'll get the newer state anyway
    const s = seatOf(T, m.f), mv = normMove(m.m);
    if (s < 0 || !mv || mv.who !== s || !hostMove(s, mv)) send('nack', { to: m.f, seq: T.seq, why: s >= 0 && T.G && toAct(T.G) !== s ? 'turn' : 'illegal' });
  }
}
function onState(m) {
  const N = decode(m); if (!N) return;
  const me = myId();
  S.rooms.set(N.id, { at: performance.now(), host: N.host, hostName: N.seats.find((s) => s.id === N.host)?.n || nameOf(N.host), names: N.seats.map((s) => s.n), humans: N.seats.filter((s) => s.id).length, n: N.seats.length, ph: N.ph, stake: N.stake, wait: N.wait.length });
  const T = S.T;
  if (T && T.id === N.id) { if (N.seq <= T.seq) return; if (N.host === me && T.host !== me) return; return adopt(N); }   // nobody hands me the host role but me
  if (T) return;   // I'm at another table
  const seated = N.seats.some((s) => s.id === me) || N.wait.some((w) => w.id === me);
  if (S.joining?.id === N.id && seated) { S.joining = null; S.gone.clear(); adopt(N); openUI(); return; }
  if (N.ph === 'lobby' && !S.told.has(N.id) && near()) { S.told.add(N.id); toast(`${S.rooms.get(N.id).hostName} открыл общий стол у Аркаши — подходи, F → «Сесть за общий стол»`, 3200); }
}
function adopt(N) {
  S.T = N; const me = myId();
  if (!N.seats.some((s) => s.id === me) && !N.wait.some((w) => w.id === me)) { drop(); toast('Тебя больше нет за столом.'); return; }
  local();
}
/** everything a client does with a new state: stakes in / out, a line to say, redraw */
function local() {
  const T = S.T, G = T.G, s = seatOf(T), prev = S.snap?.id === T.id ? S.snap : null;
  S.snap = { id: T.id, deal: T.deal, seats: T.seats.map((x) => ({ ...x })), G: G ? { out: G.out.slice() } : null };
  if (T.ph === 'play' && G && s >= 0 && S.paidDeal !== T.deal) {
    S.paidDeal = T.deal; S.paid = !T.stake || K.pay(T.stake);
    if (T.stake) toast(S.paid ? `−$${T.stake} в банк · банк $${T.stake * G.n}` : `Нет $${T.stake} — играешь на интерес`, 1800);
  }
  if (G?.over && s >= 0 && S.paidDeal === T.deal && S.paidOut !== T.deal) {
    S.paidOut = T.deal;
    if (T.stake && S.paid) { if (G.result === 'draw') K.earn(T.stake); else if (G.result !== s) K.earn(potShare(T.stake, G.n)); }
  }
  S.pendingAt = 0;
  if (durakMine()) durakSync(line(prev));
}
function line(prev) {
  const T = S.T, G = T.G, me = seatOf(T), N = (x) => T.seats[x]?.n || '?';
  if (!G) return prev?.seats.length !== T.seats.length || humans(prev || { seats: [] }).length !== humans(T).length ? `За столом: ${T.seats.map((s) => s.n).join(', ')}` : '';
  if (!prev || prev.deal !== T.deal || !prev.G) return `Раздал на ${G.n}. Козырь ${SUITS[G.tr]} — заходит ${G.att === me ? 'ТЫ' : N(G.att)}${T.stake ? ` · банк $${T.stake * G.n}` : ''}.`;
  if (G.over) { const r = G.result; return r === 'draw' ? 'Ничья — все молодцы. Бурбон, братва, Гудзон!' : r === me ? pick(['Вот так, ты дурак — получай сосиской в лоб!', 'Пуст стакан, пуста рука — а ты дурак.']) : pick([`${N(r)} — дурак! Сосиской в лоб!`, `Все без карт, а ${N(r)} при картах — вся колода его!`]); }
  const out = G.out.filter((x) => !prev.G.out.includes(x)); if (out.length) return out.includes(me) ? 'Ты вышел — без карт! Смотри, кто останется дураком.' : `${out.map(N).join(', ')} — вышел, без карт!`;
  const [w, k] = T.lm || [];
  if (k === 'transfer' || k === 'show') { const to = G.lastTransfer?.to ?? G.def; if (to === me) return pick(['Перевели на тебя — отбивайся!', `${N(w)} перевёл на тебя${k === 'show' ? ' — козырем показал' : ''}. Отбивайся!`]); if (w === me) return `Перевёл на ${N(to)}. Пусть отбивается.`; return `${N(w)} переводит на ${N(to)}${k === 'show' ? ' — козырем показал' : ''}.`; }
  if (k === 'take') return w === me ? pick(['«Бей!» кричал сначала, а потом «Беру!» кричал. Как Саша.', 'Бери, бери — Саша тоже стопку копил.']) : `${N(w)}: «Беру!»${w === G.def && T.seats[w]?.id ? '' : ' — подкидывайте!'}`;
  if ((k === 'bito' || k === 'done') && !G.table.length) return k === 'bito' ? pick(['Бито. Дай огня, аккордеон!', 'Бито.']) : 'Забирай!';
  if (k === 'bito' || k === 'done') return w === me ? '' : `${N(w)}: «Пас».`;
  if (toAct(G) === me && G.def === me && k === 'play') return pick(['Отбивайся!', 'Держи.', '']);
  return '';
}
function drop() { const was = S.T; S.T = null; S.mems = []; clearTimeout(S.aiT); S.gone.clear(); if (was && durakMine()) closeDurak(); }

// ------------------------------------------------------------------ host
function hostOpen({ want = 3, stake = 0, mode = 'perevodnoy' } = {}) {
  const me = myId(); if (!me) return false;
  S.T = { id: me + Math.random().toString(36).slice(2, 6), host: me, seats: makeSeats([{ id: me, n: nameOf(me) }], want), want: Math.max(2, Math.min(4, want)), stake, mode, ph: 'lobby', deal: 0, seq: 1, G: null, wait: [], lm: null };
  S.mems = []; S.gone.clear(); broadcast(); return true;
}
function bump() { S.T.seq++; broadcast(); local(); }
function hostJoin(pid, n) {
  const T = S.T; if (!okId(pid) || seatOf(T, pid) >= 0 || T.wait.some((w) => w.id === pid)) return broadcast();   // already in: just resend the table
  S.gone.delete(pid);
  if (T.ph === 'lobby' && humans(T).length < 4) { const hs = [...humans(T), { id: pid, n }]; T.want = Math.max(T.want, hs.length); T.seats = makeSeats(hs, T.want); }
  else if (humans(T).length + T.wait.length < 4) T.wait.push({ id: pid, n });
  else return;
  toast(`${n} садится за стол`, 1600); bump();
}
function hostLeave(pid) {
  const T = S.T; if (!T) return; let changed = false;
  const w = T.wait.findIndex((x) => x.id === pid); if (w > -1) { T.wait.splice(w, 1); changed = true; }
  const s = seatOf(T, pid);
  if (s >= 0) {
    const who = T.seats[s].n; changed = true;
    if (T.ph === 'lobby') T.seats = makeSeats(humans(T).filter((h) => h.id !== pid), T.want);
    else { const ai = freeAIName(T); T.seats[s] = { id: '', n: ai }; S.mems[s] = makeMemory(); if (T.G) remember(S.mems[s], { ...T.G, pickedUp: null }); toast(`${who} встал из-за стола — за него доигрывает ${ai}`, 2400); if (durakMine()) durakSync(`${who} ушёл. ${ai}: «Я за него доиграю.»`); }
  }
  if (!humans(T).length && !T.wait.length) { send('close'); drop(); return; }
  if (changed) { T.lm = null; bump(); pump(); }
}
function hostDeal() {
  const T = S.T; if (!T || T.host !== myId() || (T.ph === 'play' && !T.G?.over)) return;
  const hs = [...humans(T), ...T.wait].filter((h) => !S.gone.has(h.id)).slice(0, 4);
  T.seats = makeSeats(hs, T.want); T.wait = []; T.G = newGame(Math.random, T.mode, T.seats.length); T.ph = 'play'; T.deal++; T.lm = null;
  freshMems(); bump(); pump();
}
function hostMove(s, m) {
  const T = S.T; if (!T || T.ph !== 'play' || !T.G || T.G.over || m.who !== s) return false;
  if (!apply(T.G, m)) return false;
  rememberAll(); T.lm = [s, m.kind]; bump(); pump(); return true;
}
function pump() {
  clearTimeout(S.aiT); const T = S.T; if (!T || T.host !== myId() || T.ph !== 'play' || !T.G || T.G.over) return;
  const s = toAct(T.G); if (s < 0 || T.seats[s].id) return;
  const seq = T.seq;
  S.aiT = setTimeout(() => { const T2 = S.T; if (!T2 || T2 !== T || T.seq !== seq || T.host !== myId()) return; const m = aiMove(T.G, S.mems[s] || (S.mems[s] = makeMemory()), s); if (m) hostMove(s, m); }, S.aiDelay * (0.7 + Math.random() * 0.6));
}
function becomeHost() {
  const T = S.T, me = myId(), old = T.host; T.host = me;
  const s = seatOf(T, old); if (s >= 0) { if (T.ph === 'lobby') T.seats = makeSeats(humans(T).filter((h) => h.id !== old), T.want); else T.seats[s] = { id: '', n: freeAIName(T) }; }
  T.wait = T.wait.filter((w) => w.id !== old);
  freshMems(); T.lm = null; toast('Хозяин стола ушёл — теперь стол держишь ты', 2400);
  bump(); pump();
}

// ------------------------------------------------------------------ housekeeping: drops, host migration, heartbeat, join retries
function tick() {
  if (!S) return; const now = performance.now();
  for (const [k, r] of S.rooms) if (now - r.at > LIVE_MS) S.rooms.delete(k);
  if (S.joining && !S.T) { const j = S.joining; if (now - j.at > 2000) { if (++j.tries > 5) { S.joining = null; toast('Стол не отвечает.'); } else { j.at = now; S.ctx.net?.send?.('dk', { k: 'join', table: j.id, n: nameOf(myId()) }); } } }
  const T = S.T; if (!T || !netUp()) return;
  const net = S.ctx.net, me = net.id, here = new Set([...net.list(), me]), present = (pid) => here.has(pid) && !S.gone.has(pid);
  if (T.host !== me) {
    if (!present(T.host)) {   // host gone: the lowest remaining seated (or waiting) human id takes over
      const cand = [...humans(T).map((h) => h.id), ...T.wait.map((w) => w.id)].filter((pid) => pid !== T.host && present(pid)).sort()[0];
      if (cand === me) becomeHost();
    }
    if (S.pendingAt && now - S.pendingAt > 5000 && durakMine()) { S.pendingAt = 0; durakSync('Хост молчит… ещё раз.'); }
    return;
  }
  for (const h of [...humans(T), ...T.wait]) if (h.id !== me && !present(h.id)) hostLeave(h.id);
  if (S.T && now - S.beatAt > BEAT_MS) broadcast();
}
function near(r = NEAR) { const p = S.ctx.player?.position, a = S.pos?.(); return !!(p && a && Math.hypot(p.x - a.x, p.z - a.z) < r); }

// ------------------------------------------------------------------ the local player: open / join / move / leave (UI + dialog + QA)
function view() {
  const T = S.T; if (!T) return { G: null, me: -1, names: [], ai: [], seats: [] };
  const me = myId(), s = seatOf(T);
  return { G: T.G, me: T.ph === 'play' ? s : -1, names: T.seats.map((x) => x.n), ai: T.seats.map((x) => !x.id), host: T.host === me, hostName: T.seats.find((x) => x.id === T.host)?.n || nameOf(T.host),
    stake: T.stake, mode: T.mode, deal: T.deal, want: T.want, humans: humans(T).length, seats: T.seats.map((x) => ({ n: x.n, ai: !x.id, me: x.id === me })), wait: T.wait.map((w) => w.n) };
}
const ADAPTER = { view, move: (m) => move(m), deal: () => deal(), again: () => again(), seats: (n) => seats(n) };
function openUI() { if (durakOpen()) { if (!durakMine()) return; durakSync(); return; } openDurak(S.ctx, { mp: ADAPTER, onEnd: () => leave() }); }
function canStake(stake) { if (!stake) return true; const c = K.state()?.cash ?? 0; if (c >= stake) return true; toast(`ARKASHA: «За общим столом $${stake} с каждого. У тебя нет.»`); return false; }
export function open(o = {}) {
  if (!S || !netUp()) { toast('Общий стол — только онлайн.'); return false; }
  if (S.T) { openUI(); return true; }
  if (!canStake(o.stake | 0)) return false;
  if (o.aiDelay != null) S.aiDelay = +o.aiDelay;
  if (!hostOpen({ want: o.seats ?? o.want ?? 3, stake: o.stake | 0, mode: o.mode || 'perevodnoy' })) return false;
  openUI(); return true;
}
export function join(id = null) {
  if (!S || !netUp()) return false; if (S.T) { openUI(); return true; }
  const r = id ? S.rooms.get(id) : null; id = id || liveTable()?.[0]; if (!id) { toast('Никто стол не открывал.'); return false; }
  if (!canStake((r || S.rooms.get(id))?.stake || 0)) return false;
  S.joining = { id, at: performance.now(), tries: 0 }; S.ctx.net.send('dk', { k: 'join', table: id, n: nameOf(myId()) });
  return true;
}
function move(m) {
  const T = S.T, s = T && seatOf(T); if (!T || s < 0) return false;
  const mv = normMove({ ...m, who: m.who ?? s }); if (!mv) return false;
  if (T.host === myId()) { if (!hostMove(s, mv)) { S.lastNack = { seq: T.seq, why: 'illegal' }; if (durakMine()) durakSync('Так нельзя.'); return false; } return true; }
  S.pendingAt = performance.now(); send('move', { seq: T.seq, m: mv }); return true;
}
function deal() { const T = S.T; if (!T) return; if (T.host === myId()) hostDeal(); else send('again'); }
function again() { deal(); }
function seats(n) { const T = S.T; if (!T || T.host !== myId() || T.ph !== 'lobby') return; T.want = Math.max(humans(T).length, Math.max(2, Math.min(4, n | 0))); T.seats = makeSeats(humans(T), T.want); bump(); }
export function leave() {
  const T = S?.T; if (!T) return; const me = myId();
  if (T.host === me && !humans(T).some((h) => h.id !== me) && !T.wait.some((w) => w.id !== me)) send('close'); else send('leave');
  S.T = null; S.mems = []; clearTimeout(S.aiT);
  if (durakMine()) closeDurak();
}
function liveTable() { let best = null; for (const [k, r] of S.rooms) if (!best || r.at > best[1].at) best = [k, r]; return best; }

// ------------------------------------------------------------------ Arkasha's dialog: the shared-table choices (online only)
export function tableLine() {
  if (!S || !netUp()) return ''; const r = liveTable()?.[1];
  return r ? ` За общим столом: ${r.names.join(', ')}${r.ph === 'play' ? ' (идёт партия)' : ''}.` : '';
}
export function tableChoices(after) {
  if (!S || !netUp()) return [];
  const go = (fn) => () => { setTimeout(fn, 30); return after ? after() : null; };   // after the dialog closes (it clears the seated flag)
  if (S.T) return [{ label: 'Вернуться за общий стол', go: go(() => openUI()) }];
  const lt = liveTable();
  if (lt) { const [id, r] = lt, full = r.humans + r.wait >= 4; if (!full) return [{ label: `Сесть за общий стол — ${r.names.join(', ')}${r.stake ? ` · $${r.stake}` : ''}${r.ph === 'play' ? ' (со следующей раздачи)' : ''}`, go: go(() => join(id)) }]; return []; }
  return [{ label: 'Сесть за общий стол — открыть (до 4, for fun)', go: go(() => open({ seats: 3 })) }, { label: 'Общий стол — $20 с каждого', go: go(() => open({ seats: 3, stake: 20 })) }];
}

/** QA (window.__game.durakMP) */
export const durakMPQA = {
  state: () => { const T = S?.T; if (!T) return null; const s = seatOf(T), G = T.G, d = document.querySelector('.durak');
    return { table: T.id, seq: T.seq, host: T.host, id: myId(), seat: s, ph: T.ph, deal: T.deal, stake: T.stake, n: T.seats.length, seats: T.seats.map((x) => ({ id: x.id, n: x.n })), wait: T.wait.map((w) => w.id),
      g: G ? JSON.stringify(toJSON(G)) : null, toAct: G ? toAct(G) : -1, over: !!G?.over, result: G?.result ?? null, def: G?.def ?? -1, att: G?.att ?? -1, lt: G?.lastTransfer || null, lm: T.lm,
      legal: G && s >= 0 && toAct(G) === s ? legalMoves(G).filter((m) => m.who === s) : [], cash: K.state()?.cash,
      ui: d ? { hand: d.querySelectorAll('.dk-hand .dk-card').length, faceUpTop: d.querySelectorAll('.dk-seats .dk-card').length, backs: d.querySelectorAll('.dk-seats .dk-back').length, seats: d.querySelectorAll('.dk-seats .dk-seat').length, lobby: !!d.querySelector('.dk-lobby'), end: d.querySelector('.dk-end h2')?.textContent || null, say: d.querySelector('.dk-say')?.textContent || '' } : null }; },
  open: (o) => open(o), join: (id) => join(id), move: (m) => move(m), leave: () => leave(), deal: () => deal(), again: () => again(), seats: (n) => seats(n),
  rooms: () => [...(S?.rooms || [])].map(([k, r]) => ({ id: k, ...r })), nack: () => S?.lastNack, aiDelay: (ms) => { S.aiDelay = ms; }, choices: () => tableChoices().map((c) => c.label),
  raw: (m) => send('move', { seq: S.T?.seq, m }),   // unvalidated, straight to the host (the rejection test)
};
