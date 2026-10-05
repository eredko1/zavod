// CONEY — darts at Soccer Tavern: F at either oche opens the board. 301, straight out (bust below zero), three darts a turn,
// 1v1 or 2v2 (teams alternate throwers), against AH FAI when nobody else is around. Aim with the mouse or a finger (the aim sits
// above your fingertip so you can see it), hold to draw back, let go to throw; Space throws on a keyboard. The aim sways: a bit
// sober, a lot drunk (double vision), trippy when high, shaky after a few cigarettes; hold too long and your arm tires.
// Online it plays like the durak table: whoever opens a board hosts it; everyone in chill mode anywhere gets a JOIN banner,
// JOIN walks you to the line. Each thrower rolls their own dart (their own drink is in it) and the host keeps the score.
// Net 'dt': open / st (the table) / join / leave / throw / again / ask (see the table section). CONEY agent (tavern).
import * as THREE from 'three';
import { hangkit as K } from '../hangkit.js';
import { tavernChalk } from './tavern.js';

const SECT = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const R_BULL = 0.037, R_OUTER = 0.094, R_T0 = 0.582, R_T1 = 0.629, R_D0 = 0.953;   // board radius 1 = outside of the double ring
const START = 301, AI = 'ahfai';
let D = null, U = null;   // D: module state, U: the open overlay

/** where a dart at board point (x, y) (y up, radius 1 = double ring) scores: { v, label, ring } */
export function scoreAt(x, y) {
  const r = Math.hypot(x, y); if (r > 1) return { v: 0, label: 'MISS', ring: 'miss' };
  if (r < R_BULL) return { v: 50, label: 'BULL', ring: 'bull' }; if (r < R_OUTER) return { v: 25, label: '25', ring: 'outer' };
  const a = (Math.atan2(x, y) * 180 / Math.PI + 360 + 9) % 360, n = SECT[Math.floor(a / 18)];
  if (r >= R_T0 && r < R_T1) return { v: n * 3, label: 'T' + n, ring: 'triple' }; if (r >= R_D0) return { v: n * 2, label: 'D' + n, ring: 'double' };
  return { v: n, label: String(n), ring: 'single' };
}
const aimAt = (n, ring) => { if (n === 50) return [0, 0]; if (n === 25) return [0, 0.065]; const a = SECT.indexOf(n) * 18 * Math.PI / 180, r = ring === 'triple' ? 0.605 : ring === 'double' ? 0.976 : 0.78; return [Math.sin(a) * r, Math.cos(a) * r]; };
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

export function buildDarts(world) {
  const { ctx, W } = world; const T = W.tavern; if (!T?.boards) return;
  TURN_MS = +ctx.qs?.get?.('dtturn') || TURN_MS;
  D = { world, ctx, W, T, tables: T.boards.map(() => null), seen: T.boards.map(() => 0), afkAt: T.boards.map(() => 0), aiT: T.boards.map(() => 0) };
  T.boards.forEach((b, i) => K.spot({ pos: b.oche, r: 1.3, dy: 2, prompt: `F — DARTS · BOARD ${i + 1}`, act: () => openBoard(i) }));
  ctx.bus.on('net:dt', (m) => { try { onMsg(m); } catch (e) { console.warn('[darts]', e); } });
  setInterval(() => { try { tick(); } catch (e) { console.warn('[darts] tick', e); } }, 500);
  // VR: no 2D board; you throw real darts at the one on the wall (src/vr/physical.js reads this)
  ctx.darts = { vr: () => !!(U && ctx.xr?.presenting), myTurn: () => !!U && myTurn(), board: () => U && D.T.boards[U.b]?.hit, throwAt: (x, y) => throwDart(x, y, true),
    darts: () => { const Tb = U && D.tables[U.b]; return Tb ? Tb.darts.length : 0; }, turn: () => { const Tb = U && D.tables[U.b]; return Tb ? Tb.turnN : 0; },
    /** the trigger at the board when nobody's throwing: the host starts (AH FAI if alone), after a game it's PLAY AGAIN */
    go: () => { const Tb = U && D.tables[U.b]; if (!Tb) return; if (Tb.phase === 'lobby' && Tb.host === me()) { if (Tb.seats.length < 2) vsAI(); else start(U.b); } else if (Tb.phase === 'over') again(); } };
  addEventListener('keydown', onKey, true); addEventListener('keyup', onKeyUp, true);
  if (typeof window !== 'undefined' && window.__game) window.__game.darts = { open: (i = 0) => openBoard(i), table: (i = 0) => D.tables[i], ui: () => (U ? { b: U.b, aim: U.aim.slice(), sway: +U.swayAmp.toFixed(3), pending: !!U.pending, myTurn: myTurn(), fb: U.fb ? { msg: U.fb.msg, good: !!U.fb.good } : null, v: U.dbgV, trail: U.trail.map((q) => [Math.round(q.t), Math.round(q.y)]) } : null), again: () => U && again(), me: () => me(), dbg: (b = 0) => ({ seenAge: Math.round(performance.now() - D.seen[b]), host: D.tables[b]?.host, list: D.ctx.net?.list?.(), hp: D.tables[b] && D.ctx.net?.peer?.(D.tables[b].host) && { afk: D.ctx.net.peer(D.tables[b].host).afk, seenAge: Math.round(performance.now() - D.ctx.net.peer(D.tables[b].host).seen) } }),
    vsAI: () => U && vsAI(), start: () => U && start(U.b), throwAt: (x, y) => U && throwDart(x, y, true), close: () => close(), scoreAt, aim: (n, ring) => aimAt(n, ring), drink: (item) => { K.give(item); return K.useItem(item); }, difficulty: () => difficulty() };
  drawChalk(0);
}

// ------------------------------------------------------------------ the table (host-authoritative; offline you are the host)
// Online the host re-sends the table every BEAT_MS (st, with its id and a seq that only grows), so anyone walking up to the board
// sees it and joins it rather than opening a second one. Two boards opened at once settle on one (sameBoard: a game in progress,
// then more players, then the older one, then the lower host id) and the other host's players move over. A throw goes out with the
// turn and dart number it is for and is re-sent until the table shows it (the host takes each dart once). If the host stops sending
// mid-game (gone, or their game in the background) the lowest remaining player takes the table over, their seat going to AH FAI; a
// thrower who sits on their turn (TURN_MS, or AFK_MS in the background) loses the rest of it. PLAY AGAIN from anyone re-racks the
// same players at the same board.
const BEAT_MS = 2000, LIVE_MS = 8000, HOST_STALE_MS = 7000, PEER_FRESH_MS = 3000, RETRY_MS = 1000, RETRIES = 6, AFK_MS = 10000, AGAIN_MS = 2500, OVER_KEEP_MS = 45000;
let TURN_MS = 30000;   // ?dtturn=ms (QA)
const me = () => D.ctx.net?.id || 'me';
const myName = () => D.ctx.net?.name || 'YOU';
const online = () => !!(D.ctx.net?.connected && D.ctx.net?.peers > 0);
const send = (k, data) => { try { D.ctx.net?.send?.('dt', { k, ...data }); } catch {} };
const teamOf = (Tb, i) => (Tb.mode === '2v2' ? i % 2 : i);
const humansAt = (Tb) => Tb.seats.filter((s) => s.id !== AI);
const present = (id) => id === me() || (D.ctx.net?.list?.() || []).includes(id);
const live = (b) => { const Tb = D.tables[b]; return !!Tb && (Tb.host === me() || (performance.now() - D.seen[b] < LIVE_MS && present(Tb.host))); };
function newTable(b, seats) { return { b, id: me() + Math.random().toString(36).slice(2, 6), seq: 1, host: me(), phase: 'lobby', mode: '1v1', seats, score: [START, START], turn: 0, darts: [], last: [], turnStart: START, win: -1, at: Date.now() }; }
function openBoard(b) {
  const Tb = D.tables[b]; D.wantIn = b;   // I'm here to throw: whatever board is live here, get me on it (tick)
  if (Tb && live(b) && Tb.host !== me()) {   // somebody's board: get on it (or watch the game in progress)
    if (!Tb.seats.some((s) => s.id === me())) { D.joining = { b, id: Tb.id, at: performance.now(), tries: 0 }; send('join', { b, id: Tb.id, n: myName() }); K.toast(Tb.phase === 'play' ? '🎯 Game on: watching, you\'re up next game' : '🎯 Joining the board…', 1600); }
    show(b); return;
  }
  if (!Tb || !live(b) || (Tb.host === me() && Tb.phase === 'over')) {
    D.tables[b] = newTable(b, [{ id: me(), n: myName() }]); D.seen[b] = performance.now(); publish(b); if (online()) send('open', { b, n: myName() });
  }
  show(b);
}
/** host: the table changed (seq up), tell everyone */
function publish(b, bump = true) { const Tb = D.tables[b]; if (Tb && Tb.host === me()) { if (bump) Tb.seq = (Tb.seq || 0) + 1; Tb.beat = performance.now(); send('st', { b, T: Tb }); } drawChalk(b); render(); }
function hostJoin(b, id, n) { const Tb = D.tables[b]; if (!Tb || Tb.host !== me()) return;
  if (Tb.seats.some((s) => s.id === id)) return publish(b, false);   // already in: just the table again
  if (Tb.phase !== 'lobby' || Tb.seats.length >= 4) { Tb.wait = [...(Tb.wait || []).filter((w) => w.id !== id), { id, n: String(n || 'PLAYER').slice(0, 16) }].slice(0, 3); return publish(b); }
  Tb.seats = Tb.seats.filter((s) => s.id !== AI); Tb.seats.push({ id, n: String(n || 'PLAYER').slice(0, 16) }); if (Tb.seats.length > 2) Tb.mode = '2v2';
  K.toast(`🎯 ${n} is up for darts`, 2000); publish(b); }
/** host: a player walked off. Mid-game AH FAI takes the seat if anyone else is still playing; otherwise it's over */
function hostLeave(b, id) { const Tb = D.tables[b]; if (!Tb || Tb.host !== me()) return; Tb.wait = (Tb.wait || []).filter((w) => w.id !== id); const i = Tb.seats.findIndex((s) => s.id === id); if (i < 0) return publish(b);
  const who = Tb.seats[i].n;
  if (Tb.phase === 'play') { if (humansAt(Tb).length > 1) { Tb.seats[i] = { id: AI, n: 'AH FAI' }; Tb.note = `${who} walked off: AH FAI throws for them`; aiMaybe(b); } else { Tb.phase = 'over'; Tb.win = -2; Tb.note = `${who} walked off`; } }
  else Tb.seats.splice(i, 1);
  publish(b); }
function vsAI() { const Tb = D.tables[U.b]; if (!Tb || Tb.host !== me() || Tb.phase !== 'lobby') return; Tb.seats = Tb.seats.filter((s) => s.id !== AI).slice(0, 1); Tb.seats.push({ id: AI, n: 'AH FAI' }); Tb.mode = '1v1'; start(U.b); }
function start(b) { const Tb = D.tables[b]; if (!Tb || Tb.host !== me() || Tb.phase !== 'lobby') return;
  if (Tb.seats.length < 2) { Tb.seats.push({ id: AI, n: 'AH FAI' }); }
  Tb.mode = Tb.seats.length >= 4 ? '2v2' : '1v1'; if (Tb.mode === '1v1') Tb.seats = Tb.seats.slice(0, 2);
  Tb.phase = 'play'; Tb.score = [START, START]; Tb.turn = 0; Tb.darts = []; Tb.last = []; Tb.turnStart = START; Tb.win = -1; Tb.note = ''; Tb.againAt = 0; Tb.turnAt = Date.now(); Tb.turnN = 0;
  if (online()) send('open', { b, n: myName(), live: 1 });
  publish(b); aiMaybe(b); }
/** host: everyone at the line again (the ones waiting too), straight into the next game */
function hostAgain(b) { const Tb = D.tables[b]; if (!Tb || Tb.host !== me() || Tb.phase === 'play') return;
  const seats = [...Tb.seats, ...(Tb.wait || [])].filter((s, i, a) => a.findIndex((x) => x.id === s.id) === i && (s.id === AI || present(s.id))).slice(0, 4);
  Object.assign(Tb, { phase: 'lobby', seats, wait: [], score: [START, START], turn: 0, darts: [], last: [], win: -1, note: 'Racking up…' }); Tb.againAt = performance.now() + AGAIN_MS; publish(b); }
/** a dart lands (host): score it, bust / win / next thrower. turn / n: which dart this is (a re-sent throw that already landed is dropped) */
function hostThrow(b, id, p, turn = null, n = null) {
  const Tb = D.tables[b]; if (!Tb || Tb.host !== me() || Tb.phase !== 'play' || Tb.seats[Tb.turn]?.id !== id || Tb.darts.length >= 3) return;
  if ((turn != null && turn !== Tb.turnN) || (n != null && n !== Tb.darts.length)) return publish(b, false);   // already counted (or stale): resend the table
  const x = +p[0], y = +p[1]; if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const s = scoreAt(x, y), t = teamOf(Tb, Tb.turn); if (!Tb.darts.length) Tb.turnStart = Tb.score[t];
  Tb.darts.push({ p: [+x.toFixed(3), +y.toFixed(3)], l: s.label, v: s.v }); Tb.turnAt = Date.now(); const left = Tb.score[t] - s.v;
  if (left < 0) { Tb.score[t] = Tb.turnStart; Tb.note = `BUST — ${Tb.seats[Tb.turn].n} back to ${Tb.turnStart}`; return endTurn(b); }
  Tb.score[t] = left;
  if (left === 0) { Tb.phase = 'over'; Tb.win = t; Tb.overAt = Date.now(); Tb.note = `${Tb.seats[Tb.turn].n} checks out on ${s.label}!`; if (online()) send('open', { b, n: winners(Tb), won: 1 }); return publish(b); }
  Tb.note = ''; if (Tb.darts.length >= 3) return endTurn(b);
  publish(b); aiMaybe(b);
}
function endTurn(b) { const Tb = D.tables[b]; Tb.last = Tb.darts; Tb.lastBy = Tb.seats[Tb.turn].n; Tb.darts = []; Tb.turn = (Tb.turn + 1) % Tb.seats.length; Tb.turnN = (Tb.turnN || 0) + 1; Tb.turnAt = Date.now(); publish(b); aiMaybe(b); }
const winners = (Tb) => Tb.seats.filter((_, i) => teamOf(Tb, i) === Tb.win).map((s) => s.n).join(' & ');
// AH FAI: decent, not a machine — trebles when he's far off, then goes for the number that finishes
function aiMaybe(b) {
  const Tb = D.tables[b]; if (!Tb || Tb.host !== me() || Tb.phase !== 'play' || Tb.seats[Tb.turn]?.id !== AI || D.aiT[b]) return;
  D.aiT[b] = setTimeout(() => { D.aiT[b] = 0; const T2 = D.tables[b]; if (!T2 || T2.host !== me() || T2.phase !== 'play' || T2.seats[T2.turn]?.id !== AI) return;
    const left = T2.score[teamOf(T2, T2.turn)]; let a;
    if (left > 60) a = aimAt(20, 'triple'); else if (left === 50) a = aimAt(50); else if (left <= 20) a = aimAt(left, 'single'); else if (left <= 40 && left % 2 === 0) a = aimAt(left / 2, 'double'); else if (left % 3 === 0) a = aimAt(left / 3, 'triple'); else a = aimAt(Math.min(20, left - 20 > 0 ? 20 : left), 'single');
    const sd = 0.06; hostThrow(b, AI, [a[0] + gauss() * sd, a[1] + gauss() * sd]); }, 1100 + Math.random() * 600);
}

// ------------------------------------------------------------------ net
/** which of two tables on one board stays: a game in progress, then more players, then the older, then the lower host id */
function better(A, B) {
  const k = (T) => [T.phase === 'play' ? 1 : 0, humansAt(T).length, -(T.at || 0)];
  const a = k(A), c = k(B); for (let i = 0; i < a.length; i++) if (a[i] !== c[i]) return a[i] > c[i];
  return A.host < B.host;
}
function onMsg(m) {
  const b = m.b | 0; if (!(b >= 0 && b < D.tables.length)) return; const from = m.f, L = D.tables[b];
  if (m.k === 'open') { if (from === me()) return; banner(b, String(m.n || 'Somebody').slice(0, 16), m.won ? 'won' : m.live ? 'live' : 'open'); return; }
  if (m.k === 'st') {
    if (!m.T || typeof m.T !== 'object') { if (L && L.host === from) { D.tables[b] = null; drawChalk(b); render(); } return; }
    const N = m.T; if (N.host !== from && !(L && L.id === N.id && L.host === from)) return;   // only the host speaks for a table (or hands it over)
    if (!Array.isArray(N.seats) || !Array.isArray(N.score)) return;
    if (L && L.id === N.id) {   // the same table: newer only (a host whose game froze takes the newer table on: somebody took over)
      if ((N.seq || 0) < (L.seq || 0) || ((N.seq || 0) === (L.seq || 0) && !(N.host !== L.host && N.host < L.host))) { D.seen[b] = performance.now(); return; }
    } else if (L && live(b) && L.phase !== 'over') {   // two tables on one board: keep the better, the other's players come over
      if (!better(N, L)) return;
      const mine = L.host === me(), wasIn = L.seats.some((s) => s.id === me());
      if (mine) { clearTimeout(D.aiT[b]); D.aiT[b] = 0; }
      D.tables[b] = N; D.seen[b] = performance.now();
      if (wasIn && !N.seats.some((s) => s.id === me())) { D.joining = { b, id: N.id, at: performance.now(), tries: 0 }; send('join', { b, id: N.id, n: myName() }); K.toast(`🎯 ${N.seats[0]?.n || 'Somebody'} has this board: joining it`, 1800); }
      drawChalk(b); render(); return;
    }
    D.tables[b] = N; D.seen[b] = performance.now(); if (D.joining?.b === b && N.seats.some((s) => s.id === me())) D.joining = null;
    if (U?.pending && U.b === b && (N.turnN !== U.pending.turn || N.darts.length !== U.pending.n || N.seats[N.turn]?.id !== me())) U.pending = null;   // my dart is in
    drawChalk(b); render(); return;
  }
  if (!L || L.host !== me() || (m.id && m.id !== L.id)) return;   // the rest is for the host of this table
  if (m.k === 'join') return hostJoin(b, from, m.n);
  if (m.k === 'leave') return hostLeave(b, from);
  if (m.k === 'again') return hostAgain(b);
  if (m.k === 'ask') return publish(b, false);
  if (m.k === 'throw' && Array.isArray(m.p)) return hostThrow(b, from, m.p, Number.isInteger(m.turn) ? m.turn : null, Number.isInteger(m.n) ? m.n : null);
}
/** twice a second: the host's heartbeat, auto-start / the slow thrower; everyone else: a silent host, a join or a dart nobody answered */
function tick() {
  if (!D) return; const now = performance.now(), net = D.ctx.net;
  D.tables.forEach((Tb, b) => {
    if (!Tb) return;
    if (Tb.host === me()) {
      if (!online()) return;
      if (Tb.phase === 'over' && Date.now() - (Tb.overAt || 0) > OVER_KEEP_MS && !(U && U.b === b)) { D.tables[b] = null; send('st', { b, T: null }); drawChalk(b); return; }
      if (now - (Tb.beat || 0) > BEAT_MS) publish(b, false);
      if (Tb.againAt && now > Tb.againAt && Tb.phase === 'lobby') { Tb.againAt = 0; if (Tb.seats.length >= 2) start(b); }
      for (const s of humansAt(Tb)) if (s.id !== me() && !present(s.id)) hostLeave(b, s.id);   // gone from the room
      if (Tb.phase === 'play' && Tb.seats[Tb.turn]?.id === AI) aiMaybe(b);   // AH FAI's turn on a board just handed to me
      const cur = Tb.seats[Tb.turn];
      if (Tb.phase === 'play' && cur && cur.id !== AI && cur.id !== me()) {
        const afk = !!net?.peer?.(cur.id)?.afk, idle = Date.now() - (Tb.turnAt || Date.now());
        if (idle > (afk ? AFK_MS : TURN_MS)) { Tb.note = `${cur.n} took too long: turn over`; endTurn(b); }
      }
      return;
    }
    // somebody else's table: still there? (a host in the background can still answer an ask from its network thread, so a host
    // that's been AFK for HOST_STALE_MS counts as gone too)
    const hp = net?.peer?.(Tb.host); D.afkAt[b] = hp?.afk ? D.afkAt[b] || now : 0;
    const away = D.afkAt[b] && now - D.afkAt[b] > HOST_STALE_MS;
    if (now - D.seen[b] > HOST_STALE_MS || away) {
      const gone = !present(Tb.host), frozen = away || (hp && (hp.afk || now - (hp.seen ?? 0) < PEER_FRESH_MS));
      if (Tb.phase === 'play' && (gone || frozen) && Tb.seats.some((s) => s.id === me())) {   // mid-game: the lowest remaining player takes it on
        const cand = humansAt(Tb).map((s) => s.id).filter((id) => id !== Tb.host && present(id) && !net?.peer?.(id)?.afk).sort()[0];
        if (cand === me()) { const old = Tb.host; Tb.host = me(); const i = Tb.seats.findIndex((s) => s.id === old); if (i >= 0) Tb.seats[i] = { id: AI, n: 'AH FAI' }; Tb.note = 'The host left: you keep score now'; Tb.turnAt = Date.now(); publish(b); aiMaybe(b); K.toast('🎯 You\'re keeping score now', 1800); return; }
      } else if (gone || now - D.seen[b] > LIVE_MS * 3) { D.tables[b] = null; drawChalk(b); render(); }   // the board is free again
    }
  });
  // at the board to play and not on it (the board I was joining closed, another one opened, mine lost a tie): join the live one
  if (U && D.wantIn === U.b && !D.joining) { const Tb = D.tables[U.b]; if (Tb && Tb.host !== me() && live(U.b) && !Tb.seats.some((s) => s.id === me()) && !(Tb.wait || []).some((w) => w.id === me())) { D.joining = { b: U.b, id: Tb.id, at: performance.now(), tries: 0 }; send('join', { b: U.b, id: Tb.id, n: myName() }); } }
  if (D.joining) { const j = D.joining; if (D.tables[j.b]?.id !== j.id) { D.joining = null; return; } if (now - j.at > 1500) { if (++j.tries > 6) D.joining = null; else { j.at = now; send('join', { b: j.b, id: j.id, n: myName() }); } } }
  const P = U?.pending; if (P && now - P.at > RETRY_MS) { if (++P.tries > RETRIES) { U.pending = null; K.toast('🎯 The board isn\'t answering', 1600); render(); } else { P.at = now; send('throw', { b: P.b, id: P.id, p: P.p, turn: P.turn, n: P.n }); send('ask', { b: P.b, id: P.id }); } }
}
function banner(b, who, kind) {
  const { ctx, W } = D; if (ctx.world !== W || ctx.state === 'menu') return;
  if (kind === 'won') { K.toast(`🎯 ${who} won 301 at Soc Tav`, 3200); return; }
  if (U) return;
  document.querySelector('.dt-banner')?.remove(); const el = document.createElement('div'); el.className = 'dt-banner';
  el.style.cssText = 'position:fixed;left:50%;top:210px;transform:translateX(-50%);z-index:59;background:rgba(18,32,26,.95);border:1px solid #e0b64a;border-radius:10px;padding:10px 14px;display:flex;gap:12px;align-items:center;font:600 14px Barlow,Arial;color:#f4efe2;max-width:92vw';
  el.innerHTML = `<span>🎯 ${who.replace(/[<>&]/g, '')} ${kind === 'live' ? 'started a darts game' : 'is up for darts'} at Soc Tav</span><button style="padding:8px 14px;border-radius:6px;border:0;background:#e0b64a;color:#111;font:700 13px Barlow;cursor:pointer">JOIN</button><button style="padding:8px 10px;border-radius:6px;border:1px solid #888;background:transparent;color:#ddd;cursor:pointer">✕</button>`;
  const [go, x] = el.querySelectorAll('button'); const kill = () => el.remove();
  const doJoin = () => { kill(); try { if (ctx.vehicles?.mounted) ctx.vehicles.dismount?.(); } catch {} const o = D.T.boards[b].oche; try { ctx.player.teleport(o.x, o.y, o.z, D.T.boards[b].yaw ?? -Math.PI / 2, 0); } catch {} setTimeout(() => openBoard(b), 400); };
  for (const [btn, fn] of [[go, doJoin], [x, kill]]) { btn.addEventListener('click', fn); btn.addEventListener('touchstart', (e) => { e.preventDefault(); fn(); }, { passive: false }); }
  document.body.appendChild(el); setTimeout(kill, 20000);
}

// ------------------------------------------------------------------ how hard it is right now: drink, highs, cigarettes
function difficulty() {
  const st = K.state() || {}; const drunk = Math.min(1.5, st.drunk || 0), high = Math.min(1, st.high || 0), smoke = Math.min(1, st.smoke || 0);
  return { drunk, high, smoke, sway: 0.03 + drunk * 0.2 + high * 0.1 + smoke * 0.05, tremor: 0.004 + smoke * 0.03 + drunk * 0.008, scatter: 0.02 + drunk * 0.07 + high * 0.035 };
}
const moodLine = (d) => [d.drunk > 1 ? '🍺 hammered' : d.drunk > 0.5 ? '🍺 drunk' : d.drunk > 0.15 ? '🍺 buzzed' : '', d.high > 0.4 ? '🌀 tripping' : d.high > 0.1 ? '🌿 high' : '', d.smoke > 0.4 ? '🚬 shaky' : d.smoke > 0.1 ? '🚬 jittery' : ''].filter(Boolean).join(' · ') || 'stone sober — steady hand';

// ------------------------------------------------------------------ the overlay
function show(b) {
  if (U) { U.b = b; render(); return; }
  const { ctx } = D; try { document.exitPointerLock?.(); } catch {} ctx.durakOpen = true;
  const root = document.createElement('div'); root.className = 'darts'; root.innerHTML = `<style>${CSS}</style><div class="dt-top"></div><canvas></canvas><div class="dt-bot"></div><button class="dt-x">✕ LEAVE</button>`;
  document.body.appendChild(root);
  U = { b, root, cv: root.querySelector('canvas'), top: root.querySelector('.dt-top'), bot: root.querySelector('.dt-bot'), aim: [0, 0.3], ptr: [0, 0.3], hold: 0, holding: false, t: 0, swayAmp: 0, last: performance.now(), fly: null, touch: false, trail: [], live: null, fb: null, key: null };
  const toBoard = (e) => { const r = U.cv.getBoundingClientRect(), s = r.width / 2.5, off = U.touch ? 70 : 0; return [(e.clientX - r.left - r.width / 2) / s, -(e.clientY - off - r.top - r.height / 2) / s]; };
  // aim by moving slowly; throw by flicking up and letting go (the flick doesn't drag the aim: it's frozen while you're moving fast)
  const sample = (e) => { const t = performance.now(); U.trail.push({ t, x: e.clientX, y: e.clientY }); while (U.trail.length && t - U.trail[0].t > FLICK_WINDOW_MS * 2) U.trail.shift(); };
  U.cv.addEventListener('pointerdown', (e) => { e.preventDefault(); try { U.cv.setPointerCapture(e.pointerId); } catch {} U.touch = e.pointerType === 'touch'; U.ptr = toBoard(e); U.trail = []; sample(e); if (myTurn()) { U.holding = true; U.hold = 0; } });
  U.cv.addEventListener('pointermove', (e) => { U.touch = e.pointerType === 'touch'; sample(e); const v = flickVel(); U.live = v; if (Math.hypot(v[0], v[1]) < AIM_MAX_V) U.ptr = toBoard(e); });
  U.cv.addEventListener('pointerup', (e) => { e.preventDefault(); sample(e); if (U.holding) { U.holding = false; U.dbgV = flickVel(); release(U.dbgV); } U.live = null; });
  U.cv.addEventListener('pointercancel', () => { U.holding = false; U.live = null; });
  U.cv.style.touchAction = 'none';
  root.querySelector('.dt-x').addEventListener('click', () => close());
  U.bot.addEventListener('click', (e) => { const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return; if (a === 'ai') vsAI(); if (a === 'start') start(U.b); if (a === 'again') again(); if (a === 'open') { D.tables[U.b] = null; openBoard(U.b); } });
  addEventListener('resize', size); size(); render(); U.raf = requestAnimationFrame(frame);
}
function size() { if (!U) return; const s = Math.min(innerWidth * 0.94, innerHeight * 0.66), dpr = Math.min(2, devicePixelRatio || 1); U.cv.style.width = U.cv.style.height = s + 'px'; U.cv.width = U.cv.height = Math.round(s * dpr); }
function close() {
  if (!U) return; const b = U.b, Tb = D.tables[b];
  if (Tb) {
    if (Tb.host === me()) {
      const next = humansAt(Tb).map((s) => s.id).filter((id) => id !== me() && present(id)).sort()[0];
      if (next && Tb.phase !== 'over') {   // others still at the board: they keep it (mid-game AH FAI throws for me)
        const i = Tb.seats.findIndex((s) => s.id === me()); if (i >= 0) { if (Tb.phase === 'play') Tb.seats[i] = { id: AI, n: 'AH FAI' }; else Tb.seats.splice(i, 1); }
        Tb.host = next; Tb.note = `${myName()} walked off`; Tb.seq = (Tb.seq || 0) + 1; send('st', { b, T: Tb }); clearTimeout(D.aiT[b]); D.aiT[b] = 0;
      } else { D.tables[b] = null; send('st', { b, T: null }); }
    } else send('leave', { b, id: Tb.id });
  }
  D.wantIn = null; D.joining = null; if (U.sign) { U.sign.parent?.remove(U.sign); U.sign.material.map.dispose(); U.sign.material.dispose(); U.sign.geometry.dispose(); }
  cancelAnimationFrame(U.raf); removeEventListener('resize', size); removeEventListener('keyup', onKeyUp, true); U.root.remove(); U = null; D.ctx.durakOpen = false; drawChalk(b);
  try { D.ctx.requestPointerLock?.(); } catch {}   // back to the game (desktop: the mouse; VR: out of the 2D-screen mode)
}
function onKeyUp(e) {   // Space let go: the swinging power meter decides the throw
  if (D.ctx.xr?.presenting) return;   // VR: the hands throw (the grip sends F, the buttons send keys: none of them are darts keys there)
  if (!U?.key || (e.code !== 'Space' && e.code !== 'KeyF')) return; e.preventDefault(); e.stopImmediatePropagation();
  const p = keyPower(performance.now() - U.key.t0); U.key = null; release(null, p);
}
const keyPower = (ms) => 1 - 0.75 * Math.cos(ms / 1000 * KEY_SWING * Math.PI * 2);   // 0.25 → 1.75 → 0.25 …, starting low
function onKey(e) {
  if (!U || D.ctx.xr?.presenting) return;
  if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
  if (e.code === 'Space' || e.code === 'KeyF') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) { const Tb = D.tables[U.b]; if (Tb?.phase === 'lobby' && Tb.host === me()) start(U.b); else if (Tb?.phase === 'over') again(); else if (myTurn()) U.key = { t0: performance.now() }; } return; }
  if (/^Key[WASDBVNPXQTMHIGE]$|^Digit|^Numpad/.test(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); }
}
const myTurn = () => { const Tb = D.tables[U?.b]; return !!(Tb && Tb.phase === 'play' && Tb.seats[Tb.turn]?.id === me() && Tb.darts.length < 3 && !U.fly && !U.pending); };
/** PLAY AGAIN: the host re-racks the same players; anyone else asks the host (and gets back in line if they'd left it) */
function again() { const Tb = D.tables[U.b]; if (!Tb || !live(U.b)) { D.tables[U.b] = null; openBoard(U.b); return; }
  if (Tb.host === me()) hostAgain(U.b); else { send('again', { b: U.b, id: Tb.id }); if (!Tb.seats.some((s) => s.id === me())) send('join', { b: U.b, id: Tb.id, n: myName() }); K.toast('🎯 Racking up…', 1200); } }
// ---- the release: a flick up throws. Its speed is the power (POWER_V screen heights a second is spot on; GOOD_LO…GOOD_HI of that
// lands where you aimed, softer drops low, harder sails high), its sideways part pulls the dart left or right
const FLICK_WINDOW_MS = 120, MIN_SEG_MS = 24, AIM_MAX_V = 0.9, FLICK_MIN_V = 0.35, POWER_V = 2.2, GOOD_LO = 0.75, GOOD_HI = 1.35, DROP_K = 0.9, SAIL_K = 0.55, PULL_K = 0.35, KEY_SWING = 0.7;
/** the flick: the fastest upward stretch of the pointer's last FLICK_WINDOW_MS (a finger slows down just before it lifts), in screen
 *  heights a second, y up */
function flickVel() {
  const tr = U.trail, t = performance.now(), pts = tr.filter((p) => t - p.t <= FLICK_WINDOW_MS); let best = [0, 0];
  for (let i = 1; i < pts.length; i++) { let j = i - 1; while (j > 0 && pts[i].t - pts[j].t < MIN_SEG_MS) j--; const dt = (pts[i].t - pts[j].t) / 1000; if (dt <= 0.004) continue;
    const v = [(pts[i].x - pts[j].x) / innerHeight / dt, -(pts[i].y - pts[j].y) / innerHeight / dt]; if (v[1] > best[1]) best = v; }
  return best;
}
/** where a release lands relative to the aim: power p (1 = spot on), sideways pull s (−1…1); also what to tell the player */
export function releaseError(p, s = 0) {
  const dy = p < GOOD_LO ? -(GOOD_LO - p) * DROP_K : p > GOOD_HI ? (p - GOOD_HI) * SAIL_K : 0, dx = Math.max(-0.6, Math.min(0.6, s * PULL_K));
  const msg = p < GOOD_LO ? (p < 0.5 ? 'Way too soft: it dropped' : 'A bit soft: dropped low') : p > GOOD_HI ? (p > 1.7 ? 'Way too hard: it sailed' : 'Too hard: sailed high') : Math.abs(s) > 0.35 ? (s > 0 ? 'Pulled it right' : 'Pulled it left') : 'Perfect release';
  return { dx, dy, msg, good: p >= GOOD_LO && p <= GOOD_HI && Math.abs(s) <= 0.35 };
}
/** a throw from a flick (v: [vx, vy] screen heights / s) or the keyboard's power meter (p) */
function release(v, pKey) {
  if (!U || !myTurn()) return false; const d = difficulty();
  let p, side = 0;
  if (v) { if (v[1] < FLICK_MIN_V) { U.fb = { msg: 'Flick up to throw (aim, then a quick swipe up)', t: performance.now() }; render(); return false; } p = v[1] / POWER_V; side = v[0] / Math.max(0.5, v[1]); }
  else p = pKey;
  const e = releaseError(p, side); U.fb = { msg: e.msg, good: e.good, t: performance.now() };
  try { if (U.touch) navigator.vibrate?.(e.good ? 15 : [10, 30, 10]); } catch {}
  return throwDart(U.aim[0] + e.dx + gauss() * d.scatter, U.aim[1] + e.dy + gauss() * d.scatter, true);
}
/** the darts that finish from here (straight out: any last dart), fewest first, a double to finish if there's one */
const SCORES = (() => { const a = [[50, 'BULL'], [25, '25']]; for (let n = 20; n >= 1; n--) a.push([n * 3, 'T' + n], [n * 2, 'D' + n], [n, String(n)]); return a.sort((x, y) => y[0] - x[0]); })();
const outs = new Map();
export function checkout(left, darts = 3) {
  const k = left + ':' + darts; if (outs.has(k)) return outs.get(k); let best = null;
  const fin = SCORES.filter(([v, l]) => v === left).sort((a, b) => (b[1][0] === 'D' ? 1 : 0) - (a[1][0] === 'D' ? 1 : 0));
  if (fin.length) best = [fin[0][1]];
  else if (darts > 1) for (const [v, l] of SCORES) { if (v >= left) continue; const r = checkout(left - v, darts - 1); if (r && (!best || r.length + 1 < best.length)) { best = [l, ...r]; if (best.length === 2) break; } }
  outs.set(k, best); return best;
}
/** throw from the swaying aim (or, for QA, exactly at x, y) */
function throwDart(x, y, exact) {
  if (!U || !myTurn()) return false; const d = difficulty();
  let p = exact ? [x, y] : [U.aim[0] + gauss() * d.scatter, U.aim[1] + gauss() * d.scatter];
  const b = U.b, Tb = D.tables[b]; U.fly = { p, t: 0 };
  const turn = Tb.turnN, n = Tb.darts.length;
  setTimeout(() => { if (!U) return; U.fly = null; const T2 = D.tables[b]; if (!T2) return;
    if (T2.host === me()) hostThrow(b, me(), p, turn, n); else { U.pending = { b, id: T2.id, p, turn, n, at: performance.now(), tries: 0 }; send('throw', { b, id: T2.id, p, turn, n }); } }, 180);
  return true;
}
function frame(now) {
  if (!U) return; U.raf = requestAnimationFrame(frame);
  if (vrMode()) return;
  const dt = Math.min(0.05, (now - U.last) / 1000); U.last = now; U.t += dt; if (U.holding) U.hold += dt;
  const d = difficulty(), t = U.t, tire = U.hold > 1.6 ? Math.min(2, (U.hold - 1.6) * 0.8) : 0;   // hold too long and the arm shakes
  const amp = d.sway * (1 + tire); U.swayAmp = amp;
  const sx = Math.sin(t * (0.9 + d.drunk * 0.5)) * amp + Math.sin(t * 2.3 + 1) * amp * 0.35 + gauss() * (d.tremor + tire * 0.01);
  const sy = Math.sin(t * (1.3 + d.drunk * 0.4) + 0.7) * amp * 0.8 + Math.cos(t * 1.9) * amp * 0.3 + gauss() * (d.tremor + tire * 0.01);
  const k = Math.min(1, dt * (8 - Math.min(5, d.drunk * 4)));   // drunk: the aim lags your hand
  U.base = U.base || U.ptr.slice(); U.base[0] += (U.ptr[0] - U.base[0]) * k; U.base[1] += (U.ptr[1] - U.base[1]) * k;
  U.aim[0] = U.base[0] + sx; U.aim[1] = U.base[1] + sy;
  drawBoard(d);
}
function drawBoard(d) {
  const c = U.cv, g = c.getContext('2d'), W = c.width, s = W / 2.5, cx = W / 2, cy = W / 2, t = U.t;
  if (!D.ctx.lite) c.style.filter = `${d.drunk > 0.3 ? `blur(${Math.min(2.5, (d.drunk - 0.3) * 2).toFixed(2)}px)` : ''} ${d.high > 0.1 ? `hue-rotate(${Math.round(Math.sin(t * 0.6) * d.high * 160)}deg) saturate(${1 + d.high})` : ''}`.trim() || 'none';
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, W);
  const rot = Math.sin(t * 0.4) * d.high * 0.25;
  const board = (ox, oy, alpha) => { g.save(); g.globalAlpha = alpha; g.translate(cx + ox, cy + oy); g.rotate(rot); paintBoard(g, s); g.restore(); };
  if (d.drunk > 0.25) board(Math.sin(t * 0.8) * d.drunk * s * 0.09, Math.cos(t * 0.6) * d.drunk * s * 0.05, 0.35);   // double vision
  board(0, 0, 1);
  const Tb = D.tables[U.b], darts = Tb ? (Tb.darts.length ? Tb.darts : Tb.last || []) : [];
  for (const dd of darts) drawDart(g, cx + dd.p[0] * s, cy - dd.p[1] * s, s, Tb.darts.length ? 1 : 0.45);
  if (U.fly) drawDart(g, cx + U.fly.p[0] * s, cy - U.fly.p[1] * s, s, 1);
  if (U.pending) drawDart(g, cx + U.pending.p[0] * s, cy - U.pending.p[1] * s, s, 0.8);   // on its way to the host
  meter(g, W, s);
  if (myTurn()) { const x = cx + U.aim[0] * s, y = cy - U.aim[1] * s, r = s * (0.05 + U.swayAmp * 0.5); g.strokeStyle = U.holding ? '#ffdd55' : 'rgba(255,255,255,.9)'; g.lineWidth = Math.max(2, s * 0.012);
    g.beginPath(); g.arc(x, y, r, 0, 7); g.moveTo(x - r * 1.6, y); g.lineTo(x - r * 0.5, y); g.moveTo(x + r * 0.5, y); g.lineTo(x + r * 1.6, y); g.moveTo(x, y - r * 1.6); g.lineTo(x, y - r * 0.5); g.moveTo(x, y + r * 0.5); g.lineTo(x, y + r * 1.6); g.stroke(); }
}
/** the power meter (right edge: green is spot on; the marker is the flick you're making / the swinging keyboard power) and how the last
 *  release went */
function meter(g, W, s) {
  const p = U.key ? keyPower(performance.now() - U.key.t0) : U.live && U.holding ? Math.max(0, U.live[1]) / POWER_V : null, x = W - s * 0.12, y0 = W * 0.18, h = W * 0.64, top = 2;   // the bar runs 0 … 2× spot-on power
  if (p != null || myTurn()) {
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x - s * 0.035, y0, s * 0.07, h);
    const yAt = (q) => y0 + h * (1 - Math.min(top, q) / top);
    g.fillStyle = 'rgba(60,200,90,.75)'; g.fillRect(x - s * 0.035, yAt(GOOD_HI), s * 0.07, yAt(GOOD_LO) - yAt(GOOD_HI));
    if (p != null) { g.fillStyle = '#ffdd55'; g.fillRect(x - s * 0.06, yAt(p) - 3, s * 0.12, 6); }
    g.fillStyle = 'rgba(255,255,255,.7)'; g.font = `600 ${Math.round(s * 0.06)}px Barlow, Arial`; g.textAlign = 'center'; g.fillText('POWER', x, y0 - s * 0.04);
  }
  if (U.fb && performance.now() - U.fb.t < 2200) { g.font = `700 ${Math.round(s * 0.085)}px Barlow, Arial`; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(U.fb.msg, W / 2, W - s * 0.06); g.fillStyle = U.fb.good ? '#7dff9a' : '#ffd27a'; g.fillText(U.fb.msg, W / 2, W - s * 0.06); }
}
function paintBoard(g, s) {
  g.fillStyle = '#111'; g.beginPath(); g.arc(0, 0, s * 1.22, 0, 7); g.fill();
  const ring = (r0, r1, colA, colB) => { for (let i = 0; i < 20; i++) { const a0 = (i * 18 - 9 - 90) * Math.PI / 180, a1 = a0 + Math.PI / 10; g.fillStyle = i % 2 ? colB : colA; g.beginPath(); g.arc(0, 0, r1 * s, a0, a1); g.arc(0, 0, r0 * s, a1, a0, true); g.fill(); } };
  ring(R_OUTER, 1, '#161412', '#efe2c0'); ring(R_D0, 1, '#c3261f', '#1f8a3e'); ring(R_T0, R_T1, '#c3261f', '#1f8a3e');
  g.fillStyle = '#1f8a3e'; g.beginPath(); g.arc(0, 0, R_OUTER * s, 0, 7); g.fill(); g.fillStyle = '#c3261f'; g.beginPath(); g.arc(0, 0, R_BULL * s, 0, 7); g.fill();
  g.strokeStyle = 'rgba(200,200,200,.55)'; g.lineWidth = Math.max(1, s * 0.006); for (const r of [R_BULL, R_OUTER, R_T0, R_T1, R_D0, 1]) { g.beginPath(); g.arc(0, 0, r * s, 0, 7); g.stroke(); }
  g.fillStyle = '#f2efe6'; g.font = `700 ${s * 0.11}px Barlow, Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
  SECT.forEach((n, i) => { const a = (i * 18 - 90) * Math.PI / 180; g.fillText(n, Math.cos(a) * s * 1.11, Math.sin(a) * s * 1.11); });
}
function drawDart(g, x, y, s, a) { g.save(); g.globalAlpha = a; g.fillStyle = '#222'; g.beginPath(); g.arc(x, y, s * 0.018, 0, 7); g.fill(); g.strokeStyle = '#d8d8d8'; g.lineWidth = s * 0.012; g.beginPath(); g.moveTo(x, y); g.lineTo(x + s * 0.07, y + s * 0.09); g.stroke();
  g.fillStyle = '#e03a2a'; g.beginPath(); g.moveTo(x + s * 0.07, y + s * 0.09); g.lineTo(x + s * 0.13, y + s * 0.1); g.lineTo(x + s * 0.09, y + s * 0.15); g.fill(); g.restore(); }
function render() {
  if (!U) return; const Tb = D.tables[U.b], d = difficulty(), esc = (t) => String(t).replace(/[<>&]/g, '');
  vrLabel(Tb);
  if (!Tb) { U.top.innerHTML = '<b>Board is free</b>'; U.bot.innerHTML = '<button data-a="open">OPEN THE BOARD</button>'; return; }
  const teams = Tb.mode === '2v2' ? [0, 1].map((t) => Tb.seats.filter((_, i) => i % 2 === t).map((s) => esc(s.n)).join(' & ')) : Tb.seats.slice(0, 2).map((s) => esc(s.n));
  const cur = Tb.seats[Tb.turn], turnT = teamOf(Tb, Tb.turn);
  U.top.innerHTML = `<div class="dt-sc">${[0, 1].map((t) => `<div class="${Tb.phase === 'play' && t === turnT ? 'on' : ''}"><i>${teams[t] || '—'}</i><b>${Tb.score[t]}</b></div>`).join('')}</div>
    <div class="dt-st">${Tb.phase === 'lobby' ? `301 · straight out · ${Tb.seats.length} at the line` : Tb.phase === 'over' ? esc(Tb.note || (Tb.win >= 0 ? `${winners(Tb)} win!` : 'Game over')) : `${cur?.id === me() ? '<b>YOUR THROW</b>' : esc(cur?.n || '') + ' throwing'} · ${'🎯'.repeat(3 - Tb.darts.length)} ${Tb.darts.map((x) => x.l).join(' ')} ${Tb.note ? '· ' + esc(Tb.note) : ''}${(() => { const left = Tb.score[turnT], out = cur?.id === me() && left <= 170 && checkout(left, 3 - Tb.darts.length); return out ? ` · <b>OUT: ${out.join(' ')}</b>` : ''; })()}`}</div>
    <div class="dt-mood">${moodLine(d)}</div>`;
  const host = Tb.host === me();
  U.bot.innerHTML = Tb.phase === 'lobby' ? (Tb.againAt ? '<span class="dt-h">Next game starting…</span>' : host ? `<button data-a="ai">PLAY AH FAI</button><button data-a="start" ${Tb.seats.length < 2 ? 'disabled' : ''}>START ${Tb.seats.length >= 4 ? '2v2' : '1v1'}</button><span class="dt-h">Friends anywhere in chill mode got a JOIN banner</span>` : Tb.seats.some((s) => s.id === me()) ? '<span class="dt-h">You\'re in. Waiting for the host to start…</span>' : '<span class="dt-h">Getting you on the board…</span>')
    : Tb.phase === 'over' ? '<button data-a="again">PLAY AGAIN</button>' : `<span class="dt-h">${U.touch || matchMedia('(pointer:coarse)').matches ? 'Drag to aim (the ring sits above your finger), then flick up to throw: the speed of the flick is the power' : 'Aim with the mouse, then press and flick up to throw (the flick\'s speed is the power) · or hold Space and let go in the green'}</span>`;
}
// ---- VR: the 2D overlay steps aside (the real board is right there) and a sign over the board says whose throw it is. Walk away from the
// line to stop playing
const VR_LEAVE_M = 2.5;
function vrMode() {
  const vr = !!D.ctx.xr?.presenting; if (!U) return vr;
  U.root.style.display = vr ? 'none' : ''; if (U.sign) U.sign.visible = vr;
  if (vr) { const o = D.T.boards[U.b]?.oche, p = D.ctx.player?.position; if (o && p && Math.hypot(p.x - o.x, p.z - o.z) > VR_LEAVE_M) { close(); return true; } }
  return vr;
}
function vrLabel(Tb) {
  if (!D.ctx.xr?.presenting || !U) return; const B = D.T.boards[U.b]; if (!B?.hit) return;
  if (!U.sign) { const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    U.sign = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.25), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false })); U.sign.userData = { c, tex };
    U.sign.position.copy(B.hit.c).add(new THREE.Vector3(0, B.hit.r1 * 1.6 + 0.2, -0.02)); U.sign.rotation.y = Math.PI; D.ctx.scene.add(U.sign); }
  const { c, tex } = U.sign.userData, g = c.getContext('2d'); g.clearRect(0, 0, 1024, 256); g.fillStyle = 'rgba(12,14,18,.85)'; g.beginPath(); g.roundRect(0, 0, 1024, 256, 30); g.fill();
  const cur = Tb?.seats[Tb.turn], t = Tb ? teamOf(Tb, Tb.turn) : 0, left = Tb?.score[t], out = Tb && cur?.id === me() && left <= 170 && checkout(left, 3 - Tb.darts.length);
  const l1 = !Tb ? 'Board is free' : Tb.phase === 'lobby' ? (Tb.host === me() ? 'Pull the trigger at the board to start' : 'Waiting for the host') : Tb.phase === 'over' ? (Tb.note || 'Game over') : cur?.id === me() ? `YOUR THROW · ${3 - Tb.darts.length} left` : `${cur?.n || ''} throwing`;
  const l2 = Tb ? `${Tb.seats.map((s2, i) => s2.n).slice(0, 2).join(' v ')} · ${Tb.score.join(' : ')}${out ? ' · OUT ' + out.join(' ') : ''}${Tb.darts.length ? ' · ' + Tb.darts.map((x) => x.l).join(' ') : ''}` : '';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffd27a'; g.font = '800 64px system-ui'; g.fillText(l1, 512, 84, 980); g.fillStyle = '#f2ecdc'; g.font = '600 44px system-ui'; g.fillText(l2, 512, 180, 980);
  tex.needsUpdate = true;
}
function drawChalk(b) {
  const Tb = D?.tables?.[b]; if (!Tb) { if (!D?.tables?.some(Boolean)) tavernChalk(null); return; }
  tavernChalk((g, w, h) => { g.fillText(`BOARD ${b + 1} · 301`, w / 2, h * 0.16); g.font = `600 ${h * 0.085}px "Marker Felt","Chalkboard SE",cursive`;
    const names = Tb.mode === '2v2' ? [0, 1].map((t) => Tb.seats.filter((_, i) => i % 2 === t).map((s) => s.n).join(' & ')) : Tb.seats.slice(0, 2).map((s) => s.n);
    [0, 1].forEach((t) => { g.textAlign = 'left'; g.fillText((names[t] || '—').slice(0, 18), w * 0.08, h * (0.38 + t * 0.2)); g.textAlign = 'right'; g.fillText(String(Tb.score[t]), w * 0.92, h * (0.38 + t * 0.2)); });
    g.textAlign = 'center'; g.fillText(Tb.phase === 'lobby' ? 'WAITING ON THROWERS' : Tb.phase === 'over' ? (Tb.win >= 0 ? 'WINNER: ' + winners(Tb) : 'GAME OFF').slice(0, 26) : `${Tb.seats[Tb.turn]?.n || ''} UP`, w / 2, h * 0.86); });
}
const CSS = `.darts{position:fixed;inset:0;z-index:60;background:radial-gradient(ellipse at 50% 40%,#3a2418 0%,#1e120c 70%,#0c0705 100%);color:#f2efe6;font:500 15px Barlow,Arial;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:12px 10px calc(10px + env(safe-area-inset-bottom));user-select:none;-webkit-user-select:none;overflow:hidden}
.darts canvas{flex:none;touch-action:none;cursor:crosshair}
.darts .dt-top{width:100%;max-width:640px;text-align:center}.darts .dt-sc{display:flex;gap:10px;justify-content:center}
.darts .dt-sc div{flex:1;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:6px 10px;display:flex;justify-content:space-between;align-items:center}
.darts .dt-sc div.on{border-color:#e0b64a;box-shadow:0 0 0 1px #e0b64a inset}.darts .dt-sc i{font-style:normal;font-weight:600;opacity:.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.darts .dt-sc b{font:700 26px Barlow}
.darts .dt-st{margin-top:6px;font:600 15px Barlow}.darts .dt-mood{margin-top:2px;font:500 13px Barlow;opacity:.75}
.darts .dt-bot{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;align-items:center;min-height:44px}
.darts .dt-bot button{padding:11px 18px;border-radius:8px;border:0;background:#e0b64a;color:#111;font:700 15px Barlow;cursor:pointer}.darts .dt-bot button[disabled]{opacity:.4}
.darts .dt-h{font:500 13px Barlow;opacity:.75;text-align:center}
@media (max-width:640px){.darts .dt-top{margin-top:42px}}
.darts .dt-x{position:absolute;top:10px;right:10px;padding:8px 12px;font:700 13px Barlow,Arial;background:rgba(0,0,0,.45);color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:8px;cursor:pointer}`;
