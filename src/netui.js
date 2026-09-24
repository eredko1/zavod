// Online UI (owned with net.js): "Play online" overlay (room + name + share link, mobile-friendly), connection badge,
// scoreboard (hold Tab / tap the badge on phones), room roster card on the main + pause menus, and a phone action
// button for F-prompts (hangout: Igor / elevator / steal / ride) that touch.js has no button for.
// Opened by the main-menu item (hud emits bus 'ui' {action:'online'}); works offline too (joining reloads with ?room=).
import { roster, toggleBoard, netInfo, cleanName, cleanRoom } from './net.js';

let U = null;
const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));

const CSS = `
.zvnet{position:fixed;top:calc(env(safe-area-inset-top,0px) + 12px);right:calc(env(safe-area-inset-right,0px) + 14px);z-index:40;font:600 12px Barlow,Arial,sans-serif;letter-spacing:.12em;color:#cfe3ff;background:rgba(10,14,20,.6);padding:5px 10px;border-left:3px solid #4aa3ff;pointer-events:none;white-space:nowrap;max-width:60vw;overflow:hidden;text-overflow:ellipsis}
.zvnet.ok{border-color:#5fd37a}.zvnet.ok2{border-color:#b7d35f}.zvnet.warn{border-color:#e9a23b;color:#ffe2b0}.zvnet.bad{border-color:#e5534b;color:#ffc9c4}
.zvtouch .zvnet{right:calc(env(safe-area-inset-right,0px) + 70px);top:calc(env(safe-area-inset-top,0px) + 10px);pointer-events:auto;padding:7px 10px;font-size:11px}
.zvboard{display:none;position:fixed;left:50%;top:16%;transform:translateX(-50%);width:min(440px,94vw);max-height:70vh;overflow:auto;z-index:41;background:rgba(8,10,14,.86);border:1px solid rgba(255,255,255,.12);font:500 15px Barlow,Arial,sans-serif;color:#e8edf2;pointer-events:none}
.zvtouch .zvboard{pointer-events:auto;top:12%}
.zvboard h3{margin:0;padding:10px 16px;font:700 13px 'Barlow Condensed',Arial;letter-spacing:.2em;background:rgba(74,163,255,.18)}
.zvboard table{width:100%;border-collapse:collapse}.zvboard td{padding:6px 16px}.zvboard tr.me td{color:#ffd27a}.zvboard td.n{text-align:right;width:56px}.zvboard .afk{opacity:.5;font-size:11px;letter-spacing:.1em;margin-left:6px}
.zvon{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:rgba(3,5,8,.72);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);padding:12px;box-sizing:border-box;overflow:auto;-webkit-user-select:text;user-select:text}
.zvon.on{display:flex}
.zvon .card{width:min(440px,100%);max-height:calc(100dvh - 24px);overflow:auto;box-sizing:border-box;background:linear-gradient(180deg,rgba(18,22,30,.97),rgba(10,12,17,.97));border:1px solid rgba(255,255,255,.12);border-top:3px solid #e9a23b;padding:18px 20px;color:#e8edf2;font:500 15px Barlow,Arial,sans-serif}
.zvon h2{margin:0 0 2px;font:700 26px 'Barlow Condensed',Arial;letter-spacing:.08em;text-transform:uppercase}
.zvon .sub{opacity:.6;font-size:13px;letter-spacing:.06em;margin-bottom:14px}
.zvon label{display:block;font:600 11px Barlow,Arial;letter-spacing:.16em;text-transform:uppercase;opacity:.75;margin:10px 0 5px}
.zvon input{width:100%;box-sizing:border-box;font:500 17px Barlow,Arial,sans-serif;color:#fff;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.2);padding:11px 12px;border-radius:3px;outline:none}
.zvon input:focus{border-color:#e9a23b;background:rgba(233,162,59,.08)}
.zvon .link{display:flex;gap:8px;align-items:stretch;margin-top:14px}
.zvon .link code{flex:1;min-width:0;font:500 12px ui-monospace,Menlo,monospace;background:rgba(0,0,0,.35);padding:10px;border:1px dashed rgba(255,255,255,.18);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;align-self:center}
.zvon button{font:700 14px 'Barlow Condensed',Arial;letter-spacing:.14em;text-transform:uppercase;color:#e8edf2;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.22);padding:12px 14px;min-height:44px;cursor:pointer;border-radius:3px}
.zvon button:hover{background:rgba(255,255,255,.14)}
.zvon button.primary{background:#e9a23b;border-color:#e9a23b;color:#111}
.zvon button.primary:hover{background:#f3b556}
.zvon .btns{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}.zvon .btns .primary{flex:1 1 160px}
.zvon .hint{font-size:12.5px;opacity:.6;margin-top:8px;line-height:1.35}
.zvon .who{margin-top:14px;font-size:14px}.zvon .who b{font:600 11px Barlow;letter-spacing:.16em;opacity:.7;display:block;margin-bottom:4px}
.zvon .who span{display:inline-block;margin:2px 6px 2px 0;padding:3px 8px;background:rgba(255,255,255,.07);border-radius:10px}.zvon .who span.me{color:#ffd27a}
.zvon .copied{color:#5fd37a;font-size:12px;height:14px;margin-top:4px}
.zvon .card.wide{width:min(620px,100%)}
.zvon .maps{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:4px 0 2px}
.zvon .mapt{position:relative;display:block;padding:0;min-height:0;border:1px solid rgba(255,255,255,.16);border-radius:3px;overflow:hidden;background:linear-gradient(160deg,#9fb3c8,#5d6b7a 55%,#c9a97a);cursor:pointer;text-align:left;aspect-ratio:16/10}
.zvon .mapt.night{background:linear-gradient(160deg,#1b2431,#0a0e15 60%,#2a1f12)}
.zvon .mapt img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;filter:saturate(.85)}
.zvon .mapt span{position:absolute;left:0;right:0;bottom:0;padding:14px 7px 5px;font:700 12.5px 'Barlow Condensed',Arial;letter-spacing:.1em;text-transform:uppercase;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.78));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zvon .mapt i{position:absolute;right:5px;top:5px;font:700 10px Barlow,Arial;font-style:normal;letter-spacing:.12em;padding:3px 5px;background:rgba(0,0,0,.55);color:#cfe3ff;border-radius:2px}
.zvon .mapt.sel{border-color:#e9a23b;box-shadow:0 0 0 2px #e9a23b inset}
.zvon .mapt.sel span{color:#ffd27a}
.zvon .mapt:hover{border-color:rgba(255,255,255,.4)}
.zvon .mapd{font-size:12.5px;opacity:.65;min-height:16px;margin-top:6px;line-height:1.35}
@media (max-width:520px){.zvon .maps{grid-template-columns:repeat(2,1fr);gap:6px}.zvon .card{padding:14px 14px}.zvon h2{font-size:22px}.zvon .mapd{display:none}}
@media (max-height:480px){.zvon .maps{grid-template-columns:repeat(6,1fr);gap:5px}.zvon .mapt{aspect-ratio:4/3}.zvon .mapt span{font-size:10.5px;padding:10px 4px 3px}.zvon .mapt i{display:none}.zvon .mapd{display:none}.zvon .card.wide{width:min(760px,100%)}}
.zvroom{position:fixed;right:calc(env(safe-area-inset-right,0px) + 22px);bottom:calc(env(safe-area-inset-bottom,0px) + 64px);z-index:45;width:260px;display:none;background:rgba(8,10,14,.8);border:1px solid rgba(255,255,255,.12);border-top:2px solid #5fd37a;color:#e8edf2;font:500 14px Barlow,Arial,sans-serif}
.zvroom.on{display:block}
.zvroom h4{margin:0;padding:8px 12px;font:700 12px 'Barlow Condensed',Arial;letter-spacing:.18em;background:rgba(95,211,122,.12);display:flex;justify-content:space-between}
.zvroom ul{list-style:none;margin:0;padding:6px 12px;max-height:150px;overflow:auto}.zvroom li{display:flex;justify-content:space-between;padding:2px 0}.zvroom li.me{color:#ffd27a}.zvroom li i{font-style:normal;opacity:.55;font-size:12px}
.zvroom .b{display:flex;gap:6px;padding:0 12px 10px}.zvroom button{flex:1;font:700 12px 'Barlow Condensed',Arial;letter-spacing:.12em;text-transform:uppercase;color:#e8edf2;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);padding:8px 6px;min-height:36px;cursor:pointer}
@media (max-width:760px),(max-height:480px){.zvroom{right:auto;left:calc(env(safe-area-inset-left,0px) + 10px);bottom:auto;top:calc(env(safe-area-inset-top,0px) + 10px);width:210px;font-size:13px}.zvroom ul{max-height:90px}}
.zvact{position:fixed;left:calc(env(safe-area-inset-left,0px) + 110px);bottom:calc(env(safe-area-inset-bottom,0px) + 286px);z-index:35;display:none;min-height:46px;max-width:60vw;padding:0 16px;border-radius:23px;align-items:center;justify-content:center;font:700 14px 'Barlow Condensed',Arial;letter-spacing:.1em;color:#fff;background:rgba(95,160,233,.45);border:1.5px solid #7fb6ff;-webkit-user-select:none;user-select:none;touch-action:none}
.zvact.on{display:flex}.zvact.down{transform:scale(.94);background:rgba(95,160,233,.75)}
`;

export function install(ctx, opts) {
  if (U) return;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  if (ctx.isTouch) document.body.classList.add('zvtouch');
  U = { ctx, opts, badge: null, board: null, room: null, over: null, act: null, boardShown: false, boardHtml: '', lastStatus: '' };
  // "Play online" in the main menu → our overlay (hud has no case for it; it only emits the ui event)
  ctx.bus.on('ui', (e) => { if (e?.action === 'online') openOnline(); });
  // the one-tap friends button: shared room 'lunapark' on Coney; asks for a name only the first time on this device
  ctx.bus.on('ui', (e) => {
    if (e?.action !== 'coney') return;
    let name = ''; try { name = cleanName(localStorage.getItem('zavod.name')); } catch {}
    if (!name) { U.forceMap = 'coney'; openOnline(); if (U.f) { U.f.room.value = 'lunapark'; U.f.upd(); } return; }
    const info = netInfo(); if (info && info.room === 'lunapark' && curMap() === 'coney') { if (U.ctx.state === 'menu') U.ctx.setState('playing'); return; }
    const u = new URL(location.href); u.search = ''; u.searchParams.set('map', 'coney'); u.searchParams.set('room', 'lunapark'); u.searchParams.set('name', name); location.href = u.toString();
  });
  ctx.bus.on('state', () => refresh());
  // phones: hangout F-prompts ("F — TALK TO IGOR") get a tappable button
  if (ctx.isTouch) installTouchAct(ctx);
  // while the overlay is open it owns the keyboard (hud menu nav / game keys must not see typing)
  addEventListener('keydown', (e) => {
    if (!U.over?.classList.contains('on')) return;
    e.stopImmediatePropagation();
    if (e.code === 'Escape') { e.preventDefault(); closeOnline(); }
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); join(); }
  }, true);
  addEventListener('keyup', (e) => { if (U.over?.classList.contains('on')) e.stopImmediatePropagation(); }, true);
}

// called by net.js once we are in a room
export function online(ctx) {
  if (!U || U.badge) return;
  const badge = document.createElement('div'); badge.className = 'zvnet warn'; badge.textContent = 'CONNECTING…'; document.body.appendChild(badge);
  const board = document.createElement('div'); board.className = 'zvboard'; document.body.appendChild(board);
  const room = document.createElement('div'); room.className = 'zvroom';
  room.innerHTML = `<h4><span class="t">ROOM</span><span class="c"></span></h4><ul></ul><div class="b"><button data-a="copy">Copy invite</button><button data-a="edit">Room / name</button></div>`;
  document.body.appendChild(room);
  room.querySelector('[data-a=copy]').addEventListener('click', (e) => { e.stopPropagation(); share(room.querySelector('[data-a=copy]')); });
  room.querySelector('[data-a=edit]').addEventListener('click', (e) => { e.stopPropagation(); openOnline(); });
  const tapBoard = (e) => { e.preventDefault(); e.stopPropagation(); toggleBoard(); renderBoard(); };
  badge.addEventListener('touchstart', tapBoard, { passive: false }); board.addEventListener('touchstart', tapBoard, { passive: false });
  if (!ctx.isTouch) badge.title = 'Hold Tab for the scoreboard';
  Object.assign(U, { badge, board, room });
  refresh();
}

export function setStatus(text, level = 'warn') { if (U?.badge) { U.badge.textContent = text; U.badge.className = 'zvnet ' + level; } }
export function setRespawn() { refresh(); }

export function refresh() {
  if (!U) return; const info = netInfo();
  if (info && U.badge) {
    const s = info.status; const t = s.text + (U.ctx.isTouch ? ' ▾' : '');
    if (t + s.level !== U.lastStatus) { U.lastStatus = t + s.level; setStatus(t, s.level); }
  }
  if (info && U.room) {
    const st = U.ctx.state; const show = st === 'menu' || st === 'paused';
    U.room.classList.toggle('on', show);
    if (show) {
      const rows = roster();
      U.room.querySelector('.t').textContent = `ROOM · ${info.room.toUpperCase()}`;
      U.room.querySelector('.c').textContent = `${rows.length} IN`;
      U.room.querySelector('ul').innerHTML = rows.map((r) => `<li class="${r.me ? 'me' : ''}"><span>${esc(r.name)}${r.afk ? ' <i>afk</i>' : ''}</span><i>${r.k} / ${r.d}</i></li>`).join('');
    }
  }
  if (U.over?.classList.contains('on')) fillWho();
  if (U.boardShown) renderBoard();
}

export function renderBoard() {
  if (!U?.board) return; const info = netInfo(); if (!info) return;
  const rows = roster().map((r) => `<tr class="${r.me ? 'me' : ''}"><td>${esc(r.name)}${r.afk ? '<span class="afk">AFK</span>' : ''}</td><td class="n">${r.k}</td><td class="n">${r.d}</td></tr>`).join('');
  const html = `<h3>FREE FOR ALL · ${esc(info.room.toUpperCase())}</h3><table><tr><td style="opacity:.5">PLAYER</td><td class="n" style="opacity:.5">K</td><td class="n" style="opacity:.5">D</td></tr>${rows}</table>`;
  if (html !== U.boardHtml) { U.boardHtml = html; U.board.innerHTML = html; }
}
// per frame from net.update: show/hide the board
export function frame(show) {
  if (!U?.board) return; const v = !!show && U.ctx.state !== 'menu';
  if (v !== U.boardShown) { U.boardShown = v; U.board.style.display = v ? 'block' : 'none'; if (v) renderBoard(); }
}

// ---------- "Play online" overlay ----------
const randomRoom = (map) => `${map}-${Math.random().toString(36).slice(2, 6)}`;
function shareUrl(map, room) { const u = new URL(location.origin + location.pathname); u.searchParams.set('map', map); u.searchParams.set('room', room); return u.toString(); }
function curMap() { return netInfo()?.map || U.ctx.world?.mapId || U.opts.map || 'zavod'; }
function selMap() { return U.sel || curMap(); }
function mapList() { const l = U.ctx.world?.maps; return Array.isArray(l) && l.length ? l.filter((m) => m?.id) : [{ id: curMap(), name: curMap().toUpperCase() }]; }
function mapName(id) { return (mapList().find((m) => m.id === id)?.name || id).toUpperCase(); }
/** select a map in the overlay; an auto-named room (<map>-xxxx) follows the map so the invite reads right */
function pickMap(id, quiet = false) {
  const prev = U.sel; U.sel = id; if (!U.f) return;
  for (const b of U.f.maps.children) { const on = b.dataset.id === id; b.classList.toggle('sel', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); }
  const m = mapList().find((x) => x.id === id); U.f.mapd.textContent = m ? `${m.subtitle || ''}${m.subtitle && m.description ? ' — ' : ''}${m.description || ''}` : '';
  if (!quiet && prev && prev !== id) { const r = cleanRoom(U.f.room.value); if (!r || r.startsWith(prev + '-')) U.f.room.value = randomRoom(id); }
  U.f.upd();
}

function buildOverlay() {
  const o = document.createElement('div'); o.className = 'zvon';
  o.innerHTML = `<div class="card wide" role="dialog" aria-label="Play online">
    <h2>Play online</h2><div class="sub">Free-for-all + co-op waves with friends · map <b class="mp"></b></div>
    <label>Map</label><div class="maps" role="radiogroup" aria-label="Map"></div><div class="mapd"></div>
    <label for="zv-room">Room</label><input id="zv-room" class="room" maxlength="24" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="e.g. coney-night">
    <label for="zv-name">Your name</label><input id="zv-name" class="name" maxlength="16" autocomplete="nickname" autocapitalize="words" spellcheck="false" enterkeyhint="go" placeholder="callsign">
    <div class="hint">Everyone picks the same map + room (or just opens your invite link). Letters, numbers, - and _ only.</div>
    <div class="link"><code class="url"></code><button class="copy">Copy</button></div><div class="copied"></div>
    <div class="who"></div>
    <div class="btns"><button class="primary join">Join room</button><button class="back">Back</button><button class="leave" style="display:none">Leave room</button></div>
  </div>`;
  document.body.appendChild(o);
  const q = (s) => o.querySelector(s);
  U.over = o; U.f = { room: q('.room'), name: q('.name'), url: q('.url'), mp: q('.mp'), who: q('.who'), copied: q('.copied'), leave: q('.leave'), maps: q('.maps'), mapd: q('.mapd') };
  const upd = () => { const r = cleanRoom(U.f.room.value) || '…'; U.f.url.textContent = shareUrl(selMap(), r); U.f.mp.textContent = mapName(selMap()); };
  // map picker: every registered map, thumbnail from assets/thumbs/<id>.jpg (gradient + name if there is none)
  for (const m of mapList()) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'mapt' + (m.time === 'night' ? ' night' : ''); b.dataset.id = m.id; b.setAttribute('role', 'radio'); b.title = m.description || m.name;
    b.innerHTML = `<img alt="" loading="lazy" src="./assets/thumbs/${esc(m.id)}.jpg"><span>${esc(m.name || m.id)}</span>${m.id === curMap() ? '<i>HERE</i>' : ''}`;
    b.querySelector('img').addEventListener('error', (e) => e.target.remove());
    b.addEventListener('click', (e) => { e.stopPropagation(); pickMap(m.id); });
    U.f.maps.appendChild(b);
  }
  U.f.room.addEventListener('input', () => { const c = cleanRoom(U.f.room.value); if (c !== U.f.room.value) U.f.room.value = c; upd(); });
  U.f.upd = upd;
  q('.copy').addEventListener('click', (e) => { e.stopPropagation(); share(q('.copy')); });
  q('.join').addEventListener('click', (e) => { e.stopPropagation(); join(); });
  q('.back').addEventListener('click', (e) => { e.stopPropagation(); closeOnline(); });
  U.f.leave.addEventListener('click', (e) => { e.stopPropagation(); const u = new URL(location.href); u.searchParams.delete('room'); u.searchParams.delete('mp'); location.href = u.toString(); });
  o.addEventListener('click', (e) => { if (e.target === o) closeOnline(); });
  // the touch overlay / game must not see these touches
  for (const ev of ['touchstart', 'touchmove', 'touchend', 'mousedown', 'wheel']) o.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
}
export function openOnline() {
  if (!U) return; if (!U.over) buildOverlay();
  const info = netInfo(); let lastRoom = '', lastName = '';
  try { lastRoom = cleanRoom(localStorage.getItem('zavod.room')); lastName = cleanName(localStorage.getItem('zavod.name')); } catch {}
  let lastMap = ''; try { lastMap = localStorage.getItem('zavod.onlineMap') || ''; } catch {}
  const ids = mapList().map((m) => m.id);
  U.sel = U.forceMap || (info ? curMap() : ids.includes(lastMap) ? lastMap : curMap()); U.forceMap = null;
  U.f.room.value = info?.room || lastRoom || randomRoom(U.sel);
  U.f.name.value = info?.name || lastName || '';
  pickMap(U.sel, true);
  U.f.leave.style.display = info ? '' : 'none';
  U.over.querySelector('.join').textContent = info ? 'Apply' : 'Join room';
  U.f.copied.textContent = ''; U.f.upd(); fillWho();
  U.over.classList.add('on');
  if (document.pointerLockElement) try { document.exitPointerLock(); } catch {}
  if (!U.ctx.isTouch) setTimeout(() => { U.f.name.value ? U.f.room.focus() : U.f.name.focus(); }, 30);
}
export function closeOnline() { U?.over?.classList.remove('on'); try { document.activeElement?.blur?.(); } catch {} }
function fillWho() {
  const info = netInfo(); if (!info || !U.f) { if (U.f) U.f.who.innerHTML = ''; return; }
  const rows = roster();
  U.f.who.innerHTML = `<b>IN ROOM ${esc(info.room.toUpperCase())} · ${esc(info.status.text)}</b>` + rows.map((r) => `<span class="${r.me ? 'me' : ''}">${esc(r.name)}${r.afk ? ' · afk' : ''}</span>`).join('');
}
function join() {
  const map = selMap(); const room = cleanRoom(U.f.room.value) || randomRoom(map); const name = cleanName(U.f.name.value);
  try { localStorage.setItem('zavod.room', room); localStorage.setItem('zavod.onlineMap', map); if (name) localStorage.setItem('zavod.name', name); } catch {}
  const info = netInfo();
  if (info && info.room === room && map === curMap() && (!name || name === info.name)) { closeOnline(); if (U.ctx.state === 'menu') U.ctx.setState('playing'); return; }
  const u = new URL(location.href); u.searchParams.set('map', map); u.searchParams.set('room', room); u.searchParams.delete('mp'); u.searchParams.delete('pose');
  if (name) u.searchParams.set('name', name); else u.searchParams.delete('name');
  location.href = u.toString();
}
async function share(btn) {
  const room = U.f ? (cleanRoom(U.f.room.value) || netInfo()?.room) : netInfo()?.room; if (!room) return;
  const url = shareUrl(U.over?.classList.contains('on') ? selMap() : curMap(), room); let ok = false;
  if (U.ctx.isTouch && navigator.share) { try { await navigator.share({ title: 'ZAVOD — join my room', text: `Join me in ZAVOD (room ${room})`, url }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(url); ok = true; } catch {}
  if (!ok) { try { const t = document.createElement('textarea'); t.value = url; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); ok = document.execCommand('copy'); t.remove(); } catch {} }
  const msg = ok ? 'Invite link copied' : url;
  if (U.f && U.over?.classList.contains('on')) U.f.copied.textContent = msg;
  if (btn) { const old = btn.textContent; btn.textContent = ok ? 'Copied ✓' : 'Copy failed'; setTimeout(() => { btn.textContent = old; }, 1600); }
}

// ---------- phones: tappable F-prompt ----------
function installTouchAct(ctx) {
  const b = document.createElement('div'); b.className = 'zvact'; document.body.appendChild(b); U.act = b; let hideT = 0;
  const hook = () => {
    const hud = ctx.hud; if (!hud?.toast || hud.toast.__zv) return !!hud?.toast?.__zv;
    const orig = hud.toast;
    hud.toast = function (text, ms) {
      if (typeof text === 'string' && /^F — /.test(text) && ctx.state === 'playing') { b.textContent = text.slice(4); b.classList.add('on'); clearTimeout(hideT); hideT = setTimeout(() => b.classList.remove('on'), 800); }
      return orig.call(this, text, ms);
    };
    hud.toast.__zv = true; return true;
  };
  if (!hook()) ctx.bus.on('boot', hook);
  b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); b.classList.add('down'); setTimeout(() => b.classList.remove('down'), 120); ctx.input?.pressed?.add('KeyF'); }, { passive: false });
  ctx.bus.on('state', ({ state }) => { if (state !== 'playing') b.classList.remove('on'); });
}
