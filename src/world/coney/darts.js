// CONEY — darts at Soccer Tavern: F at either oche opens the board. 301, straight out (bust below zero), three darts a turn,
// 1v1 or 2v2 (teams alternate throwers), against AH FAI when nobody else is around. Aim with the mouse or a finger (the aim sits
// above your fingertip so you can see it), hold to draw back, let go to throw; Space throws on a keyboard. The aim sways: a bit
// sober, a lot drunk (double vision), trippy when high, shaky after a few cigarettes; hold too long and your arm tires.
// Online it plays like the durak table: whoever opens a board hosts it; everyone in chill mode anywhere gets a JOIN banner,
// JOIN walks you to the line. Each thrower rolls their own dart (their own drink is in it) and the host keeps the score.
// Net 'dt': open / st (the table) / join / leave / throw. CONEY agent (tavern).
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
  D = { world, ctx, W, T, tables: T.boards.map(() => null), seen: T.boards.map(() => 0), aiT: T.boards.map(() => 0) };
  T.boards.forEach((b, i) => K.spot({ pos: b.oche, r: 1.3, dy: 2, prompt: `F — DARTS · BOARD ${i + 1}`, act: () => openBoard(i) }));
  ctx.bus.on('net:dt', (m) => { try { onMsg(m); } catch (e) { console.warn('[darts]', e); } });
  addEventListener('keydown', onKey, true);
  if (typeof window !== 'undefined' && window.__game) window.__game.darts = { open: (i = 0) => openBoard(i), table: (i = 0) => D.tables[i], ui: () => (U ? { b: U.b, aim: U.aim.slice(), sway: +U.swayAmp.toFixed(3) } : null),
    vsAI: () => U && vsAI(), start: () => U && start(U.b), throwAt: (x, y) => U && throwDart(x, y, true), close: () => close(), scoreAt, aim: (n, ring) => aimAt(n, ring), drink: (item) => { K.give(item); return K.useItem(item); }, difficulty: () => difficulty() };
  drawChalk(0);
}

// ------------------------------------------------------------------ the table (host-authoritative; offline you are the host)
const me = () => D.ctx.net?.id || 'me';
const myName = () => D.ctx.net?.name || 'YOU';
const online = () => !!(D.ctx.net?.connected && D.ctx.net?.peers > 0);
const send = (k, data) => { try { D.ctx.net?.send?.('dt', { k, ...data }); } catch {} };
const teamOf = (Tb, i) => (Tb.mode === '2v2' ? i % 2 : i);
function openBoard(b) {
  const Tb = D.tables[b];
  if (Tb && Tb.phase !== 'over' && Tb.host !== me() && performance.now() - D.seen[b] < 20000) { send('join', { b, n: myName() }); show(b); K.toast('🎯 Joining the board…', 1600); return; }
  if (!Tb || Tb.phase === 'over' || Tb.host === me() || performance.now() - D.seen[b] >= 20000) {
    D.tables[b] = { b, host: me(), phase: 'lobby', mode: '1v1', seats: [{ id: me(), n: myName() }], score: [START, START], turn: 0, darts: [], last: [], turnStart: START, win: -1, at: Date.now() };
    D.seen[b] = performance.now(); publish(b); if (online()) send('open', { b, n: myName() });
  }
  show(b);
}
function publish(b) { const Tb = D.tables[b]; drawChalk(b); render(); if (Tb?.host === me()) send('st', { b, T: Tb }); }
function hostJoin(b, id, n) { const Tb = D.tables[b]; if (!Tb || Tb.host !== me()) return;
  if (Tb.seats.some((s) => s.id === id)) return publish(b);
  if (Tb.phase !== 'lobby' || Tb.seats.length >= 4) return send('st', { b, T: Tb });
  Tb.seats = Tb.seats.filter((s) => s.id !== AI); Tb.seats.push({ id, n: String(n || 'PLAYER').slice(0, 16) }); if (Tb.seats.length > 2) Tb.mode = '2v2';
  K.toast(`🎯 ${n} is up for darts`, 2000); publish(b); }
function hostLeave(b, id) { const Tb = D.tables[b]; if (!Tb || Tb.host !== me()) return; const i = Tb.seats.findIndex((s) => s.id === id); if (i < 0) return;
  if (Tb.phase === 'play') { Tb.phase = 'over'; Tb.win = -2; Tb.note = `${Tb.seats[i].n} walked off`; } else Tb.seats.splice(i, 1);
  publish(b); }
function vsAI() { const Tb = D.tables[U.b]; if (!Tb || Tb.host !== me() || Tb.phase !== 'lobby') return; Tb.seats = Tb.seats.filter((s) => s.id !== AI).slice(0, 1); Tb.seats.push({ id: AI, n: 'AH FAI' }); Tb.mode = '1v1'; start(U.b); }
function start(b) { const Tb = D.tables[b]; if (!Tb || Tb.host !== me() || Tb.phase !== 'lobby') return;
  if (Tb.seats.length < 2) { Tb.seats.push({ id: AI, n: 'AH FAI' }); }
  Tb.mode = Tb.seats.length >= 4 ? '2v2' : '1v1'; if (Tb.mode === '1v1') Tb.seats = Tb.seats.slice(0, 2);
  Tb.phase = 'play'; Tb.score = [START, START]; Tb.turn = 0; Tb.darts = []; Tb.last = []; Tb.turnStart = START; Tb.win = -1; Tb.note = '';
  if (online()) send('open', { b, n: myName(), live: 1 });
  publish(b); aiMaybe(b); }
/** a dart lands (host): score it, bust / win / next thrower */
function hostThrow(b, id, p) {
  const Tb = D.tables[b]; if (!Tb || Tb.host !== me() || Tb.phase !== 'play' || Tb.seats[Tb.turn]?.id !== id || Tb.darts.length >= 3) return;
  const x = +p[0], y = +p[1]; if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const s = scoreAt(x, y), t = teamOf(Tb, Tb.turn); if (!Tb.darts.length) Tb.turnStart = Tb.score[t];
  Tb.darts.push({ p: [+x.toFixed(3), +y.toFixed(3)], l: s.label, v: s.v }); const left = Tb.score[t] - s.v;
  if (left < 0) { Tb.score[t] = Tb.turnStart; Tb.note = `BUST — ${Tb.seats[Tb.turn].n} back to ${Tb.turnStart}`; return endTurn(b); }
  Tb.score[t] = left;
  if (left === 0) { Tb.phase = 'over'; Tb.win = t; Tb.note = `${Tb.seats[Tb.turn].n} checks out on ${s.label}!`; if (online()) send('open', { b, n: winners(Tb), won: 1 }); return publish(b); }
  Tb.note = ''; if (Tb.darts.length >= 3) return endTurn(b);
  publish(b); aiMaybe(b);
}
function endTurn(b) { const Tb = D.tables[b]; Tb.last = Tb.darts; Tb.lastBy = Tb.seats[Tb.turn].n; Tb.darts = []; Tb.turn = (Tb.turn + 1) % Tb.seats.length; publish(b); aiMaybe(b); }
const winners = (Tb) => Tb.seats.filter((_, i) => teamOf(Tb, i) === Tb.win).map((s) => s.n).join(' & ');
// AH FAI: decent, not a machine — trebles when he's far off, then goes for the number that finishes
function aiMaybe(b) {
  const Tb = D.tables[b]; if (!Tb || Tb.phase !== 'play' || Tb.seats[Tb.turn]?.id !== AI || D.aiT[b]) return;
  D.aiT[b] = setTimeout(() => { D.aiT[b] = 0; if (D.tables[b] !== Tb || Tb.phase !== 'play' || Tb.seats[Tb.turn]?.id !== AI) return;
    const left = Tb.score[teamOf(Tb, Tb.turn)]; let a;
    if (left > 60) a = aimAt(20, 'triple'); else if (left === 50) a = aimAt(50); else if (left <= 20) a = aimAt(left, 'single'); else if (left <= 40 && left % 2 === 0) a = aimAt(left / 2, 'double'); else if (left % 3 === 0) a = aimAt(left / 3, 'triple'); else a = aimAt(Math.min(20, left - 20 > 0 ? 20 : left), 'single');
    const sd = 0.06; hostThrow(b, AI, [a[0] + gauss() * sd, a[1] + gauss() * sd]); }, 1100 + Math.random() * 600);
}

// ------------------------------------------------------------------ net
function onMsg(m) {
  const b = m.b | 0; if (!(b >= 0 && b < D.tables.length)) return; const from = m.f;
  if (m.k === 'open') { if (from === me()) return; banner(b, String(m.n || 'Somebody').slice(0, 16), m.won ? 'won' : m.live ? 'live' : 'open'); return; }
  if (m.k === 'st') { if (!m.T || typeof m.T !== 'object') { D.tables[b] = null; drawChalk(b); render(); return; } const Tb = m.T; if (Tb.host !== from) return;
    D.tables[b] = Tb; D.seen[b] = performance.now(); drawChalk(b); render(); return; }
  if (m.k === 'join') return hostJoin(b, from, m.n);
  if (m.k === 'leave') return hostLeave(b, from);
  if (m.k === 'throw' && Array.isArray(m.p)) return hostThrow(b, from, m.p);
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
  U = { b, root, cv: root.querySelector('canvas'), top: root.querySelector('.dt-top'), bot: root.querySelector('.dt-bot'), aim: [0, 0.3], ptr: [0, 0.3], hold: 0, holding: false, t: 0, swayAmp: 0, last: performance.now(), fly: null, touch: false };
  const toBoard = (e) => { const r = U.cv.getBoundingClientRect(), s = r.width / 2.5, off = U.touch ? 70 : 0; return [(e.clientX - r.left - r.width / 2) / s, -(e.clientY - off - r.top - r.height / 2) / s]; };
  U.cv.addEventListener('pointerdown', (e) => { e.preventDefault(); U.touch = e.pointerType === 'touch'; U.ptr = toBoard(e); if (myTurn()) { U.holding = true; U.hold = 0; } });
  U.cv.addEventListener('pointermove', (e) => { U.touch = e.pointerType === 'touch'; U.ptr = toBoard(e); });
  U.cv.addEventListener('pointerup', (e) => { e.preventDefault(); if (U.holding) { U.holding = false; throwDart(); } });
  U.cv.addEventListener('pointercancel', () => { U.holding = false; });
  U.cv.style.touchAction = 'none';
  root.querySelector('.dt-x').addEventListener('click', () => close());
  U.bot.addEventListener('click', (e) => { const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return; if (a === 'ai') vsAI(); if (a === 'start') start(U.b); if (a === 'again') { D.tables[U.b] = null; openBoard(U.b); } });
  addEventListener('resize', size); size(); render(); U.raf = requestAnimationFrame(frame);
}
function size() { if (!U) return; const s = Math.min(innerWidth * 0.94, innerHeight * 0.66), dpr = Math.min(2, devicePixelRatio || 1); U.cv.style.width = U.cv.style.height = s + 'px'; U.cv.width = U.cv.height = Math.round(s * dpr); }
function close() {
  if (!U) return; const b = U.b, Tb = D.tables[b];
  if (Tb) { if (Tb.host === me()) { if (Tb.phase === 'play' && Tb.seats.some((s) => s.id !== me() && s.id !== AI)) hostLeave(b, me()); else { D.tables[b] = null; send('st', { b, T: null }); } } else send('leave', { b }); }
  cancelAnimationFrame(U.raf); removeEventListener('resize', size); U.root.remove(); U = null; D.ctx.durakOpen = false; drawChalk(b);
  try { D.ctx.requestPointerLock?.(); } catch {}   // back to the game (desktop: the mouse; VR: out of the 2D-screen mode)
}
function onKey(e) {
  if (!U) return;
  if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
  if (e.code === 'Space' || e.code === 'KeyF') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) { const Tb = D.tables[U.b]; if (Tb?.phase === 'lobby' && Tb.host === me()) start(U.b); else throwDart(); } return; }
  if (/^Key[WASDBVNPXQTMHIGE]$|^Digit|^Numpad/.test(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); }
}
const myTurn = () => { const Tb = D.tables[U?.b]; return !!(Tb && Tb.phase === 'play' && Tb.seats[Tb.turn]?.id === me() && Tb.darts.length < 3 && !U.fly); };
/** throw from the swaying aim (or, for QA, exactly at x, y) */
function throwDart(x, y, exact) {
  if (!U || !myTurn()) return false; const d = difficulty();
  let p = exact ? [x, y] : [U.aim[0] + gauss() * d.scatter, U.aim[1] + gauss() * d.scatter];
  const b = U.b, Tb = D.tables[b]; U.fly = { p, t: 0 };
  setTimeout(() => { if (!U) return; U.fly = null; if (Tb.host === me()) hostThrow(b, me(), p); else send('throw', { b, p }); }, 180);
  return true;
}
function frame(now) {
  if (!U) return; U.raf = requestAnimationFrame(frame);
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
  if (myTurn()) { const x = cx + U.aim[0] * s, y = cy - U.aim[1] * s, r = s * (0.05 + U.swayAmp * 0.5); g.strokeStyle = U.holding ? '#ffdd55' : 'rgba(255,255,255,.9)'; g.lineWidth = Math.max(2, s * 0.012);
    g.beginPath(); g.arc(x, y, r, 0, 7); g.moveTo(x - r * 1.6, y); g.lineTo(x - r * 0.5, y); g.moveTo(x + r * 0.5, y); g.lineTo(x + r * 1.6, y); g.moveTo(x, y - r * 1.6); g.lineTo(x, y - r * 0.5); g.moveTo(x, y + r * 0.5); g.lineTo(x, y + r * 1.6); g.stroke(); }
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
  if (!Tb) { U.top.innerHTML = '<b>Board is free</b>'; U.bot.innerHTML = '<button data-a="again">OPEN THE BOARD</button>'; return; }
  const teams = Tb.mode === '2v2' ? [0, 1].map((t) => Tb.seats.filter((_, i) => i % 2 === t).map((s) => esc(s.n)).join(' & ')) : Tb.seats.slice(0, 2).map((s) => esc(s.n));
  const cur = Tb.seats[Tb.turn], turnT = teamOf(Tb, Tb.turn);
  U.top.innerHTML = `<div class="dt-sc">${[0, 1].map((t) => `<div class="${Tb.phase === 'play' && t === turnT ? 'on' : ''}"><i>${teams[t] || '—'}</i><b>${Tb.score[t]}</b></div>`).join('')}</div>
    <div class="dt-st">${Tb.phase === 'lobby' ? `301 · straight out · ${Tb.seats.length} at the line` : Tb.phase === 'over' ? esc(Tb.note || (Tb.win >= 0 ? `${winners(Tb)} win!` : 'Game over')) : `${cur?.id === me() ? '<b>YOUR THROW</b>' : esc(cur?.n || '') + ' throwing'} · ${'🎯'.repeat(3 - Tb.darts.length)} ${Tb.darts.map((x) => x.l).join(' ')} ${Tb.note ? '· ' + esc(Tb.note) : ''}`}</div>
    <div class="dt-mood">${moodLine(d)}</div>`;
  const host = Tb.host === me();
  U.bot.innerHTML = Tb.phase === 'lobby' ? (host ? `<button data-a="ai">PLAY AH FAI</button><button data-a="start" ${Tb.seats.length < 2 ? 'disabled' : ''}>START ${Tb.seats.length >= 4 ? '2v2' : '1v1'}</button><span class="dt-h">Friends anywhere in chill mode got a JOIN banner</span>` : '<span class="dt-h">Waiting for the host to start…</span>')
    : Tb.phase === 'over' ? '<button data-a="again">PLAY AGAIN</button>' : `<span class="dt-h">${U.touch || matchMedia('(pointer:coarse)').matches ? 'Drag to aim (the ring sits above your finger) · lift to throw' : 'Mouse to aim · click or Space to throw · hold too long and your arm shakes'}</span>`;
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
