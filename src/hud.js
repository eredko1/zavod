// HUD, menus, screens. Owned by: HUD agent.
// DOM + CSS + two small canvases (compass, damage arcs). Reads ctx.player / ctx.weapons / ctx.ai defensively every frame.
// Public API (ctx.hud): hitmarker(headshot, kill) · damageFrom(dirOrPos) · killfeed(text) · toast(text, ms) · scorePopup(text, headshot)
//                       showMenu() · hideMenu() · wave(n, total)

const VERSION = '0.1.0';
const ICON_HS = '<svg viewBox="0 0 16 16"><path d="M8 1.5a4.6 4.6 0 0 0-4.6 4.6c0 1.9 1 3.3 2.1 4.1v1.6c0 .4.3.7.7.7h3.6c.4 0 .7-.3.7-.7v-1.6c1.1-.8 2.1-2.2 2.1-4.1A4.6 4.6 0 0 0 8 1.5zm-2 5.2a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2zm4 0a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2zM6.2 13.2h3.6v1.3H6.2z"/></svg>';
const ICON_AR = '<svg class="ar" viewBox="0 0 18 8"><path d="M0 3.3h13.2L10.6.7 11.3 0 18 4l-6.7 4-.7-.7 2.6-2.6H0z"/></svg>';
const ICON_GR = '<svg viewBox="0 0 13 15"><path d="M5.2 0h2.6v1.4h1.6v1.2H7.8v.9c2.2.6 3.7 2.5 3.7 4.9 0 3.6-2.2 6.6-5 6.6s-5-3-5-6.6c0-2.4 1.5-4.3 3.7-4.9v-.9H3.6V1.4h1.6z"/></svg>';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap180 = (d) => ((d + 540) % 360) - 180;
const fmt = (n) => (n | 0).toLocaleString('en-US');

export async function init(ctx) {
  const root = document.getElementById('hud');
  root.innerHTML = buildDOM();
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => Array.from(root.querySelectorAll(s));

  // ---- font warm-up (do not block boot on failure) ----
  try { await Promise.race([Promise.all([document.fonts.load('600 20px "Barlow Condensed"'), document.fonts.load('700 20px "Barlow Condensed"'), document.fonts.load('500 12px "Barlow"')]), new Promise(r => setTimeout(r, 1500))]); } catch { /* fallback stack */ }

  const dpr = () => Math.min(devicePixelRatio || 1, 2);
  const H = {
    ctx, root,
    layers: { game: $('.game'), menu: $('.mainmenu'), pause: $('.pause'), dead: $('.dead'), vic: $('.vic') },
    // in-game refs
    compassC: $('.compass canvas'), bearing: $('.compass .bearing'),
    objWave: $('.obj .w'), objScore: $('.obj .sc'), objHost: $('.obj .hostile b'),
    feed: $('.feed'), xh: $('.xh'), hm: $('.hm'), dmgC: $('.dmg'), vig: $('.vig'),
    hp: $('.hp'), hpBar: $('.hp .bar'), hpSegs: $$('.hp .bar i'), hpVal: $('.hp .lab b'),
    wpn: $('.wpn'), wName: $('.wpn .nm'), wMode: $('.wpn .mode'), wMag: $('.wpn .mag'), wRes: $('.wpn .res'), wGr: $('.wpn .gr b'), wSlots: $$('.wpn .slot i'),
    prompt: $('.prompt'), lock: $('.lock'), toastEl: $('.toast'), pops: $('.pops'), wave: $('.wave'), waveT: $('.wave .t'), waveS: $('.wave .s'),
    board: $('.board'), bKills: $('.board .bk'), bWave: $('.board .bw'), bScore: $('.board .bs'), bAcc: $('.board .ba'), bTime: $('.board .bt'),
    panels: { settings: $('.panel.settings'), controls: $('.panel.controls'), maps: $('.panel.maps'), loadout: $('.panel.loadout') },
    // caches (write DOM only on change)
    c: { bearing: null, wave: null, score: null, host: null, hp: null, low: null, hpOn: null, name: null, mode: null, mag: null, res: null, gr: null, slot: null, lowAmmo: null, empty: null, prompt: null, ads: null, gap: null, vig: null, hb: null, lock: null, board: null },
    heading: 0, headingDrawn: NaN, pingsDrawn: -1,
    dmg: [], dmgDirty: false,
    hpFullSince: 0, lastHealth: null,
    lastShotBy: new Map(),
    lastScore: 0, shotsFired: 0, shotsHit: 0,
    toastTimer: 0, feedTimer: 0,
    panel: null, sel: 0, ui: null,
    state: ctx.state,
  };
  ctx.__hud = H;

  // ---- canvases ----
  H.cc = H.compassC.getContext('2d');
  H.dc = H.dmgC.getContext('2d');
  sizeCanvases(H);
  applyScale(H);

  // ---- menus & panels ----
  bindMenus(H);
  buildSettings(H);
  buildControls(H);
  buildMaps(H);
  buildLoadout(H);

  // ---- state ----
  ctx.bus.on('state', ({ state, prev }) => onState(H, state, prev));
  onState(H, ctx.state, null);

  // ---- events ----
  const bus = ctx.bus;
  bus.on('hit', (d) => { H.shotsHit++; hitmarker(H, !!d?.headshot, false); });
  bus.on('enemyKilled', (d) => {
    hitmarker(H, !!d?.headshot, true);
    killfeed(H, `<span class="me">YOU</span>${ICON_AR}${d?.headshot ? ICON_HS : ''}<span>${d?.name || 'OPERATOR'}</span>`, true);
    const cur = d?.score ?? ctx.ai?.score ?? 0; const delta = cur - H.lastScore; H.lastScore = cur;
    const streak = d?.streak ?? ctx.ai?.streak ?? 0;
    scorePopup(H, `+${delta > 0 ? delta : (d?.headshot ? 150 : 100)}${d?.headshot ? ' HEADSHOT' : ''}${streak >= 3 ? ` · ×${streak}` : ''}`, !!d?.headshot);
  });
  bus.on('playerDamaged', (d) => { if (d?.from) damageFrom(H, d.from, true); });
  bus.on('shot', (d) => {
    if (d?.who === 'enemy') { if (d.soldier) H.lastShotBy.set(d.soldier, performance.now()); else if (d.origin) { const s = nearestSoldier(ctx, d.origin); if (s) H.lastShotBy.set(s, performance.now()); } }
    else if (d?.who === 'player' || !d?.who) H.shotsFired++;
  });
  bus.on('wave', (d) => showWave(H, d?.n ?? 1, d?.total ?? 6, d?.enemies));
  bus.on('restart', () => reset(ctx));
  bus.on('pointerlock', () => { H.c.lock = null; });

  // ---- keyboard nav in menus ----
  addEventListener('keydown', (e) => onKey(H, e));

  return {
    hitmarker: (headshot = false, kill = false) => hitmarker(H, headshot, kill),
    damageFrom: (v) => damageFrom(H, v),
    killfeed: (text) => killfeed(H, text, false),
    toast: (text, ms = 2200) => toast(H, text, ms),
    scorePopup: (text, headshot = false) => scorePopup(H, text, headshot),
    wave: (n, total, enemies) => showWave(H, n, total, enemies),
    showMenu: () => ctx.setState('menu'),
    hideMenu: () => { if (ctx.state !== 'playing') ctx.setState('playing'); },
    openSettings: () => openPanel(H, 'settings'),
    closePanel: () => openPanel(H, null),
  };
}

export function onResize(ctx) { const H = ctx.__hud; if (!H) return; sizeCanvases(H); applyScale(H); H.headingDrawn = NaN; H.dmgDirty = true; }
export function reset(ctx) {
  const H = ctx.__hud; if (!H) return;
  H.feed.innerHTML = ''; H.pops.innerHTML = ''; H.dmg.length = 0; H.dmgDirty = true; H.lastShotBy.clear();
  H.lastScore = 0; H.shotsFired = 0; H.shotsHit = 0; H.hpFullSince = 0; H.lastHealth = null;
  H.wave.classList.remove('on'); H.toastEl.classList.remove('on'); H.hm.getAnimations().forEach(a => a.cancel());
  for (const k in H.c) H.c[k] = null;
}

// =====================================================================
// per-frame
// =====================================================================
export function update(dt, ctx) {
  const H = ctx.__hud; if (!H) return;
  const rdt = ctx.time.realDt ?? dt;
  const now = performance.now();
  if (ctx.state !== 'playing') { if (H.dmg.length) { H.dmg.length = 0; H.dmgDirty = true; drawDamage(H, rdt); } return; }

  const p = ctx.player, w = ctx.weapons, ai = ctx.ai, c = H.c;

  // ---- heading / compass ----
  const yaw = p?.yaw ?? 0;
  H.heading = ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
  const hq = Math.round(H.heading) % 360;
  if (hq !== c.bearing) { c.bearing = hq; H.bearing.textContent = String(hq).padStart(3, '0'); }
  const pings = collectPings(H, ctx, now);
  if (Math.abs(H.heading - H.headingDrawn) > 0.05 || pings.length || H.pingsDrawn !== pings.length) { drawCompass(H, pings); H.headingDrawn = H.heading; H.pingsDrawn = pings.length; }

  // ---- objective line ----
  const wave = ai?.wave ?? 0, score = ai?.score ?? 0;
  let alive = 0; if (typeof ai?.alive === 'function') alive = ai.alive() | 0; else if (ai?.soldiers) { for (const s of ai.soldiers) if (s && !isDead(s)) alive++; }
  if (wave !== c.wave) { c.wave = wave; H.objWave.textContent = String(Math.max(0, wave)).padStart(2, '0'); }
  if (score !== c.score) { c.score = score; H.objScore.textContent = fmt(score); }
  if (alive !== c.host) { c.host = alive; H.objHost.textContent = String(alive).padStart(2, '0'); }

  H.lastScore = score; // popups compute their delta against the last frame's score

  // ---- health ----
  const hp = p?.health ?? 100, maxHp = p?.maxHealth ?? 100, frac = clamp(hp / maxHp, 0, 1);
  const hpq = Math.round(frac * 100);
  if (hpq !== c.hp) {
    c.hp = hpq;
    const segs = H.hpSegs.length;
    for (let i = 0; i < segs; i++) { const f = clamp(frac * segs - i, 0, 1); H.hpSegs[i].style.setProperty('--f', f.toFixed(2)); }
    H.hpVal.textContent = Math.ceil(hp);
    const low = frac < 0.35; if (low !== c.low) { c.low = low; H.hp.classList.toggle('low', low); }
  }
  if (frac >= 0.999) { if (H.lastHealth !== null && H.lastHealth < 0.999) H.hpFullSince = now; } else H.hpFullSince = 0;
  H.lastHealth = frac;
  const hpOn = frac < 0.999 || (H.hpFullSince && now - H.hpFullSince < 1800);
  if (hpOn !== c.hpOn) { c.hpOn = hpOn; H.hp.classList.toggle('on', hpOn); }
  // vignette: 0 above 45% health, ramps to .85 at 8%
  const v = frac > 0.45 ? 0 : Math.round(clamp((0.45 - frac) / 0.37, 0, 1) * 0.85 * 20) / 20;
  if (v !== c.vig) { c.vig = v; H.vig.style.setProperty('--v', v); }
  const hb = v > 0 ? (1.25 - v * 0.7).toFixed(2) + 's' : '1.1s';
  if (hb !== c.hb) { c.hb = hb; H.vig.style.setProperty('--hb', hb); }

  // ---- weapon ----
  const cur = w?.current || {};
  const name = cur.name ?? '—', mag = cur.ammo ?? 0, magSize = cur.mag ?? 30, res = cur.reserve ?? 0;
  const mode = (cur.mode ?? cur.fireMode ?? w?.fireMode ?? 'AUTO');
  const gr = w?.grenades ?? cur.grenades ?? p?.grenades ?? 2;
  const si = Array.isArray(w?.slots) ? w.slots.indexOf(cur) : -1; const slot = si >= 0 ? si : clamp(cur.slot ?? 0, 0, 1);
  if (name !== c.name) { c.name = name; H.wName.textContent = name; }
  if (mode !== c.mode) { c.mode = mode; H.wMode.textContent = mode; }
  if (mag !== c.mag) { c.mag = mag; H.wMag.textContent = mag; }
  if (res !== c.res) { c.res = res; H.wRes.textContent = res; }
  if (gr !== c.gr) { c.gr = gr; H.wGr.textContent = gr; }
  if (slot !== c.slot) { c.slot = slot; H.wSlots.forEach((el, i) => el.classList.toggle('on', i === slot)); }
  const lowAmmo = magSize > 0 && mag / magSize < 0.2 && mag > 0, empty = mag === 0;
  if (lowAmmo !== c.lowAmmo) { c.lowAmmo = lowAmmo; H.wpn.classList.toggle('low', lowAmmo); }
  if (empty !== c.empty) { c.empty = empty; H.wpn.classList.toggle('empty', empty); }

  // ---- prompt (reload) ----
  let prompt = null;
  if (w?.reloading) prompt = 'reloading';
  else if (magSize > 0 && mag / magSize < 0.2) prompt = res > 0 ? 'reload' : 'noammo';
  if (prompt !== c.prompt) {
    c.prompt = prompt;
    H.prompt.classList.toggle('on', !!prompt);
    H.prompt.classList.toggle('red', prompt === 'noammo' || (prompt === 'reload' && mag === 0));
    if (prompt === 'reload') H.prompt.innerHTML = '<kbd>R</kbd> RELOAD'; else if (prompt === 'reloading') H.prompt.textContent = 'RELOADING'; else if (prompt === 'noammo') H.prompt.textContent = 'NO AMMO';
  }

  // ---- crosshair ----
  const ads = typeof w?.ads === 'number' ? w.ads : (w?.ads || p?.ads ? 1 : 0);
  const adsOn = ads > 0.5;
  if (adsOn !== c.ads) { c.ads = adsOn; H.xh.classList.toggle('ads', adsOn); }
  if (!adsOn) {
    let gap;
    if (typeof w?.spread === 'number') {
      // spread is a cone half-angle in degrees: project it to screen pixels through the camera's focal length
      const fov = (ctx.camera?.fov ?? 75) * Math.PI / 180; const focal = (innerHeight / 2) / Math.tan(fov / 2);
      gap = clamp(focal * Math.tan(clamp(w.spread, 0, 15) * Math.PI / 180) * 0.85, 5, 90);
    } else { const spd = p?.speed ?? 0; const sp = clamp(spd / 6.6, 0, 1) * (p?.sprinting ? 1.4 : 1) + (p?.onGround === false ? 0.6 : 0) + (p?.crouching ? -0.25 : 0); gap = 6 + sp * 14; }
    gap = Math.round(gap * 4) / 4;
    if (gap !== c.gap) { c.gap = gap; H.xh.style.setProperty('--gap', `${gap}px`); }
  }

  // ---- damage arcs ----
  if (H.dmg.length || H.dmgDirty) drawDamage(H, rdt);

  // ---- pointer lock hint ----
  const lock = !ctx.qa && !ctx.input?.locked;
  if (lock !== c.lock) { c.lock = lock; H.lock.classList.toggle('on', lock); }

  // ---- scoreboard (Tab) ----
  const board = !!ctx.input?.down?.('Tab');
  if (board !== c.board) { c.board = board; H.board.classList.toggle('on', board); }
  if (board) {
    H.bKills.textContent = fmt(ai?.kills ?? 0); H.bWave.textContent = `${ai?.wave ?? 0} / ${ai?.totalWaves ?? 6}`; H.bScore.textContent = fmt(ai?.score ?? 0);
    H.bAcc.textContent = H.shotsFired ? Math.round(100 * H.shotsHit / H.shotsFired) + '%' : '—';
    const t = ctx.time.elapsed | 0; H.bTime.textContent = `${String((t / 60) | 0).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  }
}

// =====================================================================
// compass
// =====================================================================
function collectPings(H, ctx, now) {
  const out = []; const ai = ctx.ai, p = ctx.player; if (!ai?.soldiers?.length || !p?.position) return out;
  const px = p.position.x, pz = p.position.z;
  for (const s of ai.soldiers) {
    if (!s || isDead(s)) continue; const pos = s.position || s.mesh?.position || s.group?.position; if (!pos) continue;
    const dx = pos.x - px, dz = pos.z - pz; const d2 = dx * dx + dz * dz;
    const fired = H.lastShotBy.get(s); const recent = fired && now - fired < 2000;
    if (!recent && d2 > 144) continue;
    const b = Math.atan2(dx, -dz) * 180 / Math.PI; // north = -Z
    out.push({ rel: wrap180(b - H.heading), hot: !!recent, d: Math.sqrt(d2) });
  }
  return out;
}

function drawCompass(H, pings) {
  const g = H.cc, W = H.cw, Hh = H.ch, s = H.scale, r = H.dprv;
  g.setTransform(r, 0, 0, r, 0, 0); g.clearRect(0, 0, W, Hh);
  const half = 45; const ppd = W / (half * 2); const cx = W / 2; const head = H.heading;
  const y0 = 2 * s;
  g.textAlign = 'center'; g.textBaseline = 'top';
  g.shadowColor = 'rgba(0,0,0,.95)'; g.shadowBlur = 4 * s; g.shadowOffsetY = 1;
  const start = Math.floor((head - half) / 5) * 5;
  for (let d = start; d <= head + half; d += 5) {
    const rel = d - head; const x = cx + rel * ppd; const dd = ((d % 360) + 360) % 360;
    const card = dd % 90 === 0, num = dd % 30 === 0, mid = dd % 15 === 0;
    if (card) {
      g.fillStyle = '#f2f4f6'; g.font = `600 ${18 * s}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      g.fillText('NESW'[dd / 90], x, y0 - 1 * s);
    } else if (num) {
      g.fillStyle = 'rgba(233,236,239,.7)'; g.font = `500 ${12 * s}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      g.fillText(String(dd), x, y0 + 4 * s);
    } else {
      g.fillStyle = mid ? 'rgba(233,236,239,.8)' : 'rgba(233,236,239,.4)';
      const w = mid ? 1.5 * s : 1; g.fillRect(x - w / 2, y0 + (mid ? 5 : 8) * s, w, (mid ? 11 : 6) * s);
    }
  }
  // pings
  if (pings.length) {
    const py = 24 * s;
    for (const q of pings) {
      if (Math.abs(q.rel) > half + 2) continue;
      const x = cx + clamp(q.rel, -half, half) * ppd; const sz = (q.hot ? 5 : 3.5) * s;
      g.fillStyle = q.hot ? '#ff3b2b' : 'rgba(232,57,43,.75)';
      g.beginPath(); g.moveTo(x, py - sz); g.lineTo(x + sz, py); g.lineTo(x, py + sz); g.lineTo(x - sz, py); g.closePath(); g.fill();
    }
  }
}

// =====================================================================
// damage indicators
// =====================================================================
function damageFrom(H, v, isPosition = false) {
  const p = H.ctx.player; if (!v) return;
  let dx = v.x ?? 0, dz = v.z ?? 0;
  // API: a unit-ish direction vector. Bus 'playerDamaged': a world position (subtract player).
  const L = Math.hypot(dx, v.y ?? 0, dz);
  if ((isPosition || L > 1.5) && p?.position) { dx -= p.position.x; dz -= p.position.z; }
  if (Math.abs(dx) < 1e-4 && Math.abs(dz) < 1e-4) return;
  const bearing = Math.atan2(dx, -dz) * 180 / Math.PI;
  // merge with a recent arc from the same direction
  for (const d of H.dmg) { if (Math.abs(wrap180(d.bearing - bearing)) < 12) { d.t = 0; d.bearing = bearing; return; } }
  H.dmg.push({ bearing, t: 0 });
  if (H.dmg.length > 6) H.dmg.shift();
}

function drawDamage(H, dt) {
  const g = H.dc, W = H.dw, s = H.scale, r = H.dprv;
  g.setTransform(r, 0, 0, r, 0, 0); g.clearRect(0, 0, W, W);
  const cx = W / 2, R = 118 * s;
  for (let i = H.dmg.length - 1; i >= 0; i--) {
    const d = H.dmg[i]; d.t += dt; if (d.t >= 1) { H.dmg.splice(i, 1); continue; }
    const a = 1 - d.t; const rel = wrap180(d.bearing - H.heading) * Math.PI / 180; // 0 = ahead (up)
    const ang = rel - Math.PI / 2; const span = 0.36 + 0.1 * (1 - a);
    // soft glow
    const grad = g.createRadialGradient(cx, cx, R - 10 * s, cx, cx, R + 8 * s);
    grad.addColorStop(0, `rgba(240,40,30,0)`); grad.addColorStop(0.55, `rgba(240,40,30,${(0.45 * a).toFixed(3)})`); grad.addColorStop(1, `rgba(240,40,30,0)`);
    g.strokeStyle = grad; g.lineWidth = 16 * s; g.lineCap = 'butt';
    g.beginPath(); g.arc(cx, cx, R - 1 * s, ang - span, ang + span); g.stroke();
    // crisp arc, tapered by drawing three nested arcs of decreasing span
    g.lineCap = 'round';
    for (let k = 0; k < 3; k++) { g.strokeStyle = `rgba(255,${60 + k * 30},${50 + k * 30},${(0.95 * a).toFixed(3)})`; g.lineWidth = (3.2 - k * 0.9) * s; g.beginPath(); g.arc(cx, cx, R, ang - span * (1 - k * 0.3), ang + span * (1 - k * 0.3)); g.stroke(); }
    // pointer tick
    const tx = cx + Math.cos(ang) * (R - 16 * s), ty = cx + Math.sin(ang) * (R - 16 * s);
    g.fillStyle = `rgba(255,255,255,${(0.9 * a).toFixed(3)})`;
    g.beginPath(); g.moveTo(tx + Math.cos(ang) * 6 * s, ty + Math.sin(ang) * 6 * s); g.lineTo(tx + Math.cos(ang + 2.4) * 4 * s, ty + Math.sin(ang + 2.4) * 4 * s); g.lineTo(tx + Math.cos(ang - 2.4) * 4 * s, ty + Math.sin(ang - 2.4) * 4 * s); g.closePath(); g.fill();
  }
  H.dmgDirty = H.dmg.length > 0;
}

// =====================================================================
// hit marker / feed / popups / toast / wave
// =====================================================================
function hitmarker(H, headshot, kill) {
  H.hm.classList.toggle('kill', kill);
  H.hm.getAnimations().forEach(a => a.cancel());
  const s = kill ? 1.55 : (headshot ? 1.3 : 1.2);
  H.hm.animate([{ opacity: 1, transform: `scale(${s})` }, { opacity: 1, transform: 'scale(1)', offset: kill ? 0.35 : 0.5 }, { opacity: 0, transform: 'scale(1)' }], { duration: kill ? 380 : 210, easing: 'ease-out', fill: 'forwards' });
}

function killfeed(H, html, isHtml) {
  const el = document.createElement('div'); el.className = 'k';
  if (isHtml) el.innerHTML = html; else el.innerHTML = String(html).replace(/[<>&]/g, (m) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m])).replace(/\s*(?:⟶|->|→)\s*/g, ICON_AR);
  H.feed.appendChild(el);
  while (H.feed.children.length > 5) H.feed.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 480); }, 4200);
}

function scorePopup(H, text, headshot) {
  const el = document.createElement('div'); el.textContent = text; if (headshot) el.classList.add('hs');
  const n = H.pops.children.length; el.style.top = `${-n * 20}px`;
  H.pops.appendChild(el); setTimeout(() => el.remove(), 1150);
}

function toast(H, text, ms) {
  H.toastEl.textContent = text; H.toastEl.classList.add('on');
  clearTimeout(H.toastTimer); H.toastTimer = setTimeout(() => H.toastEl.classList.remove('on'), ms);
}

function showWave(H, n, total, enemies) {
  H.waveT.textContent = `WAVE ${n} / ${total}`;
  const cnt = enemies ? `${enemies} ` : '';
  H.waveS.textContent = n >= total ? `FINAL WAVE — ${cnt}HOSTILES · HOLD THE YARD` : `${cnt}HOSTILES INBOUND`;
  H.wave.classList.remove('on'); void H.wave.offsetWidth; H.wave.classList.add('on');
}

function isDead(s) { return s.state === 'dead' || s.dead === true || (typeof s.health === 'number' && s.health <= 0); }
function nearestSoldier(ctx, origin) {
  let best = null, bd = 9; for (const s of ctx.ai?.soldiers ?? []) { const pos = s?.position; if (!pos) continue; const d = Math.hypot(pos.x - origin.x, pos.z - origin.z); if (d < bd) { bd = d; best = s; } } return best;
}

// =====================================================================
// state / menus
// =====================================================================
function onState(H, state, prev) {
  H.state = state; const L = H.layers; const ctx = H.ctx;
  root(H).dataset.state = state;
  L.game.classList.toggle('on', state === 'playing');
  L.menu.classList.toggle('on', state === 'menu');
  L.pause.classList.toggle('on', state === 'paused');
  L.dead.classList.toggle('on', state === 'dead');
  L.vic.classList.toggle('on', state === 'victory');
  openPanel(H, null);
  H.ui = state === 'menu' ? L.menu : state === 'paused' ? L.pause : state === 'dead' ? L.dead : state === 'victory' ? L.vic : null;
  if (H.ui) select(H, 0);
  if (state === 'dead' || state === 'victory') fillStats(H, L[state === 'dead' ? 'dead' : 'vic']);
  if (state === 'playing' && prev && prev !== 'paused') { H.c.hpOn = null; }
}
const root = (H) => H.root;

function fillStats(H, layer) {
  const ai = H.ctx.ai || {};
  layer.querySelector('.st-k').textContent = fmt(ai.kills ?? 0);
  layer.querySelector('.st-w').textContent = `${ai.wave ?? 0}`;
  layer.querySelector('.st-s').textContent = fmt(ai.score ?? 0);
  const acc = layer.querySelector('.st-a'); if (acc) acc.textContent = H.shotsFired ? Math.round(100 * H.shotsHit / H.shotsFired) + '%' : '—';
}

function bindMenus(H) {
  const ctx = H.ctx;
  const act = (a) => {
    switch (a) {
      case 'deploy': ctx.setState('playing'); break;
      case 'resume': ctx.setState('playing'); break;
      case 'maps': openPanel(H, H.panel === 'maps' ? null : 'maps'); break;
      case 'loadout': openPanel(H, H.panel === 'loadout' ? null : 'loadout'); break;
      case 'settings': openPanel(H, H.panel === 'settings' ? null : 'settings'); break;
      case 'controls': openPanel(H, H.panel === 'controls' ? null : 'controls'); break;
      case 'menu': ctx.setState('menu'); break;
      case 'retry': ctx.restart(); break;
    }
  };
  H.root.querySelectorAll('[data-act]').forEach(b => {
    b.addEventListener('click', (e) => { e.stopPropagation(); ctx.bus.emit('ui', { type: 'click', action: b.dataset.act }); act(b.dataset.act); });
    b.addEventListener('mouseenter', () => { const items = uiItems(H); const i = items.indexOf(b); if (i > -1 && i !== H.sel) { select(H, i); ctx.bus.emit('ui', { type: 'hover' }); } });
  });
  H.root.querySelectorAll('.panel .close').forEach(b => b.addEventListener('click', () => openPanel(H, null)));
  H.lock.addEventListener('click', () => ctx.requestPointerLock?.());
  H.act = act;
}
function uiItems(H) { return H.ui ? Array.from(H.ui.querySelectorAll('.mi, .btn')) : []; }
function select(H, i) {
  const items = uiItems(H); if (!items.length) return;
  H.sel = (i + items.length) % items.length;
  items.forEach((el, k) => el.classList.toggle('sel', k === H.sel));
}
function openPanel(H, name) {
  H.panel = name;
  if (name && H.ui) { const items = uiItems(H); const i = items.findIndex(el => el.dataset.act === name); if (i > -1) select(H, i); }
  for (const k in H.panels) H.panels[k].classList.toggle('on', k === name);
  // panels live in the UI layer: reparent the shared panels into the active layer so they inherit its visibility
  if (name && H.ui) { const p = H.panels[name]; if (p.parentElement !== H.ui) H.ui.appendChild(p); }
}
function onKey(H, e) {
  const ctx = H.ctx; if (!H.ui || ctx.state === 'playing') return;
  const k = e.code;
  if (k === 'Escape') { e.preventDefault(); if (H.panel) openPanel(H, null); else if (ctx.state === 'paused') ctx.setState('playing'); return; }
  if (H.panel) return;
  if (k === 'ArrowDown' || k === 'KeyS') { e.preventDefault(); select(H, H.sel + 1); ctx.bus.emit('ui', { type: 'hover' }); }
  else if (k === 'ArrowUp' || k === 'KeyW') { e.preventDefault(); select(H, H.sel - 1); ctx.bus.emit('ui', { type: 'hover' }); }
  else if (k === 'Enter' || k === 'Space' || k === 'NumpadEnter') { e.preventDefault(); const it = uiItems(H)[H.sel]; if (it) { ctx.bus.emit('ui', { type: 'click', action: it.dataset.act }); H.act(it.dataset.act); } }
}

// =====================================================================
// settings / controls panels
// =====================================================================
function buildSettings(H) {
  const ctx = H.ctx, S = ctx.settings, body = H.panels.settings.querySelector('.body');
  const h4 = (t) => { const e = document.createElement('h4'); e.textContent = t; body.appendChild(e); };
  const row = (label) => { const r = document.createElement('div'); r.className = 'row'; r.innerHTML = `<label>${label}</label><div class="ctl"></div>`; body.appendChild(r); return r.querySelector('.ctl'); };
  const slider = (label, min, max, step, get, set, fmtv) => {
    const c = row(label); const inp = document.createElement('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step;
    const val = document.createElement('span'); val.className = 'val'; c.append(inp, val);
    const sync = () => { const v = get(); inp.value = v; val.textContent = fmtv(v); inp.style.setProperty('--p', `${100 * (v - min) / (max - min)}%`); };
    inp.addEventListener('input', () => { set(+inp.value); sync(); });
    sync(); H.syncers.push(sync);
  };
  const cycle = (label, opts, get, set, onoff) => {
    const c = row(label); const w = document.createElement('div'); w.className = 'cyc';
    w.innerHTML = `<button aria-label="previous">&#8249;</button><span class="val"></span><button aria-label="next">&#8250;</button>`; c.appendChild(w);
    const val = w.querySelector('.val'); const [prev, next] = w.querySelectorAll('button');
    const sync = () => { const v = get(); const i = opts.indexOf(v); val.textContent = onoff ? (v ? 'ON' : 'OFF') : String(opts[i] ?? v).toUpperCase(); if (onoff) { val.classList.toggle('on', !!v); val.classList.toggle('off', !v); } };
    const step = (d) => { const i = Math.max(0, opts.indexOf(get())); set(opts[(i + d + opts.length) % opts.length]); sync(); };
    prev.addEventListener('click', () => step(-1)); next.addEventListener('click', () => step(1)); val.addEventListener('click', () => step(1));
    sync(); H.syncers.push(sync);
  };
  H.syncers = [];
  h4('Display');
  slider('Field of view', 60, 110, 1, () => S.fov, (v) => { S.fov = v; if (!ctx.weapons?.ads && ctx.camera) { ctx.camera.fov = v; ctx.camera.updateProjectionMatrix(); } }, (v) => `${v}°`);
  cycle('Quality', ['low', 'medium', 'high', 'ultra'], () => S.quality, (v) => { S.quality = v; ctx.bus.emit('quality', v); }, false);
  h4('Controls');
  slider('Sensitivity', 0.5, 15, 0.1, () => Math.round(S.sensitivity / 0.00044 * 10) / 10, (v) => { S.sensitivity = v * 0.00044; }, (v) => v.toFixed(1));
  slider('ADS sensitivity', 0.2, 1.5, 0.05, () => S.adsSensitivityMul, (v) => { S.adsSensitivityMul = v; }, (v) => `${v.toFixed(2)}×`);
  h4('Graphics');
  for (const [key, label] of [['shadows', 'Shadows'], ['rain', 'Rain'], ['motionBlur', 'Motion blur'], ['ssr', 'Reflections (SSR)'], ['ao', 'Ambient occlusion'], ['bloom', 'Bloom'], ['dof', 'Depth of field'], ['filmGrain', 'Film grain']])
    cycle(label, [false, true], () => !!S[key], (v) => { S[key] = v; ctx.bus.emit('setting', { key, value: v }); }, true);
  h4('Audio');
  slider('Master volume', 0, 100, 1, () => Math.round(S.masterVolume * 100), (v) => { S.masterVolume = v / 100; ctx.bus.emit('setting', { key: 'masterVolume', value: v / 100 }); }, (v) => `${v}`);
  H.panels.settings.querySelector('.reset').addEventListener('click', () => {
    Object.assign(S, { fov: 75, sensitivity: 0.0022, adsSensitivityMul: 0.6, shadows: true, rain: true, motionBlur: true, ssr: true, ao: true, bloom: true, dof: true, filmGrain: true, masterVolume: 1, quality: 'ultra' });
    ctx.bus.emit('quality', 'ultra'); H.syncers.forEach(f => f());
  });
}

function buildMaps(H) {
  const ctx = H.ctx, body = H.panels.maps.querySelector('.body');
  const maps = ctx.world?.maps || [{ id: 'zavod', name: 'ZAVOD', subtitle: 'Night ops · Container yard', time: 'night', weather: 'rain', description: '' }];
  const cur = ctx.world?.mapId || 'zavod';
  const grid = document.createElement('div'); grid.className = 'mapcards';
  maps.forEach((m, i) => {
    const el = document.createElement('button'); el.className = 'mapcard' + (m.id === cur ? ' cur' : '') + ` t-${m.time}`; el.style.setProperty('--i', i);
    el.innerHTML = `<div class="thumb"><img alt="" src="./${m.thumb || ''}"><span class="pill">${(m.time || '').toUpperCase()} · ${(m.weather || 'clear').toUpperCase()}</span>${m.id === cur ? '<span class="cur">Selected</span>' : ''}</div><div class="nm">${m.name}</div><div class="sb">${m.subtitle || ''}</div><div class="ds">${m.description || ''}</div>`;
    const img = el.querySelector('img'); img.onerror = () => { img.remove(); };
    el.addEventListener('click', () => {
      ctx.bus.emit('ui', { type: 'click', action: 'map:' + m.id }); if (m.id === cur) { openPanel(H, null); return; }
      const q = new URLSearchParams(location.search); q.set('map', m.id); q.delete('qa'); q.delete('pose'); q.delete('seed');
      el.classList.add('go'); setTimeout(() => location.assign(location.pathname + '?' + q.toString()), 180);
    });
    grid.appendChild(el);
  });
  body.appendChild(grid);
  const curMeta = maps.find(m => m.id === cur); H.panels.maps.querySelector('.curmap').textContent = curMeta ? `Current: ${curMeta.name}` : '';
  // title block reflects the loaded map
  if (curMeta) { const t = H.root.querySelector('.mainmenu .title'), st = H.root.querySelector('.mainmenu .subtitle'); if (t) t.textContent = curMeta.name; if (st) st.textContent = curMeta.subtitle || ''; }
}

function buildLoadout(H) {
  const ctx = H.ctx, body = H.panels.loadout.querySelector('.body');
  const FALLBACK = [{ id: 'm4a1', name: 'M4A1', class: 'AR', slot: 0, desc: '', bars: { damage: 34, fireRate: 89, range: 70, accuracy: 70, mobility: 60 } }, { id: 'm9', name: 'M9', class: 'Pistol', slot: 1, desc: '', bars: { damage: 30, fireRate: 47, range: 45, accuracy: 60, mobility: 90 } }];
  const render = () => {
    const ars = (ctx.weapons?.arsenal?.length ? ctx.weapons.arsenal : FALLBACK);
    const cur = ctx.settings.loadout || { primary: 'm4a1', secondary: 'm9' };
    body.innerHTML = '';
    for (const [slot, label] of [[0, 'Primary'], [1, 'Secondary']]) {
      const col = document.createElement('div'); col.className = 'lcol'; col.innerHTML = `<h3>${label}</h3>`;
      ars.filter(w => w.slot === slot).forEach((w, i) => {
        const sel = (slot === 0 ? cur.primary : cur.secondary) === w.id;
        const el = document.createElement('button'); el.className = 'wrow' + (sel ? ' cur' : ''); el.style.setProperty('--i', i);
        const bars = w.bars || {}; const bar = (k, t) => `<div class="b"><label>${t}</label><i style="--v:${(bars[k] ?? 50)}%"></i></div>`;
        el.innerHTML = `<div class="hd"><span class="cls">${w.class}</span><span class="nm">${w.name}</span>${sel ? '<span class="tick">Equipped</span>' : ''}</div><div class="bars">${bar('damage', 'DMG')}${bar('fireRate', 'RPM')}${bar('range', 'RNG')}${bar('accuracy', 'ACC')}${bar('mobility', 'MOB')}</div><div class="ds">${w.desc || ''}</div>`;
        el.addEventListener('click', () => {
          const next = { primary: slot === 0 ? w.id : cur.primary, secondary: slot === 1 ? w.id : cur.secondary };
          try { ctx.weapons?.setLoadout?.(next); } catch (e) { console.warn('[hud] setLoadout', e); }
          ctx.settings.loadout = next; ctx.bus.emit('ui', { type: 'click', action: 'loadout' });
          const q = new URLSearchParams(location.search); q.set('primary', next.primary); q.set('secondary', next.secondary); history.replaceState(null, '', location.pathname + '?' + q.toString());
          render();
        });
        col.appendChild(el);
      });
      body.appendChild(col);
    }
    const names = (id) => (ars.find(w => w.id === id) || {}).name || id;
    H.panels.loadout.querySelector('.curload').textContent = `${names(cur.primary)} · ${names(cur.secondary)}`;
    const ls = H.root.querySelector('.mainmenu .loadsum'); if (ls) ls.textContent = `${names(cur.primary)} · ${names(cur.secondary)}`;
  };
  render(); ctx.bus.on('loadout', render); ctx.bus.on('boot', render);
}

function buildControls(H) {
  const body = H.panels.controls.querySelector('.body');
  const keys = [['Move', 'W A S D'], ['Sprint', 'SHIFT'], ['Jump', 'SPACE'], ['Crouch', 'C / CTRL'], ['Fire', 'LMB'], ['Aim down sights', 'RMB / E'], ['Reload', 'R'], ['Grenade', 'G'], ['Primary', '1'], ['Secondary', '2'], ['Scoreboard', 'TAB'], ['Pause', 'ESC']];
  const grid = document.createElement('div'); grid.className = 'keys';
  for (const [a, k] of keys) { const r = document.createElement('div'); r.className = 'row'; r.innerHTML = `<label>${a}</label><div class="ctl">${k.split(' ').map(x => `<kbd>${x}</kbd>`).join('')}</div>`; grid.appendChild(r); }
  body.appendChild(grid);
}

// =====================================================================
// sizing
// =====================================================================
function applyScale(H) {
  const s = clamp(innerHeight / 1080, 0.7, 1.6); H.scale = s; H.root.style.setProperty('--hs', s.toFixed(3));
}
function sizeCanvases(H) {
  const s = clamp(innerHeight / 1080, 0.7, 1.6), r = dprSafe(); H.dprv = r;
  H.cw = Math.round(600 * s); H.ch = Math.round(46 * s);
  H.compassC.width = Math.round(H.cw * r); H.compassC.height = Math.round(H.ch * r);
  H.dw = Math.round(420 * s);
  H.dmgC.width = Math.round(H.dw * r); H.dmgC.height = Math.round(H.dw * r);
}
function dprSafe() { return Math.min(devicePixelRatio || 1, 2); }

// =====================================================================
// DOM
// =====================================================================
function buildDOM() {
  const mi = (act, i, label, cls = '') => `<button class="mi in ${cls}" data-act="${act}" style="--i:${i + 3}"><small>0${i + 1}</small><span>${label}</span></button>`;
  const stats = (extra) => `<div class="stats in up" style="--i:5"><div><label>Kills</label><b class="st-k">0</b></div><div><label>Wave</label><b class="st-w">0</b></div><div><label>Score</label><b class="st-s">0</b></div>${extra ? '<div><label>Accuracy</label><b class="st-a">—</b></div>' : ''}</div>`;
  const panel = (cls, title, sub, foot) => `<section class="panel ${cls}"><h2>${title}<small>${sub}</small></h2><div class="body"></div><div class="foot">${foot}<button class="close"><kbd>ESC</kbd> Back</button></div></section>`;
  return `
  <div class="layer game">
    <div class="vig"></div>
    <div class="compass"><canvas></canvas><div class="mark"></div><div class="bearing">000</div></div>
    <div class="obj"><span>Wave</span><b class="w">00</b><i></i><span>Score</span><b class="sc">0</b><i></i><span class="hostile">Hostiles <b>00</b></span></div>
    <div class="feed"></div>
    <canvas class="dmg"></canvas>
    <div class="xh"><i></i><i></i><i></i><i></i></div>
    <div class="hm"><i></i><i></i><i></i><i></i></div>
    <div class="pops"></div>
    <div class="prompt"></div>
    <div class="wave"><div class="t">WAVE 1 / 6</div><div class="ln"></div><div class="s">HOSTILES INBOUND</div></div>
    <div class="hp"><div class="lab"><b>100</b><span>Health</span></div><div class="bar"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>
    <div class="wpn">
      <div class="name"><span class="nm">—</span><span class="mode">AUTO</span></div>
      <div class="ammo"><span class="mag">0</span><span class="sep">/</span><span class="res">0</span></div>
      <div class="sub"><span class="slot"><i class="on"></i><i></i></span><span class="gr">${ICON_GR}<b>2</b></span></div>
    </div>
    <div class="board"><h3>Mission status</h3><div class="row"><span>Kills</span><b class="bk">0</b></div><div class="row"><span>Wave</span><b class="bw">0 / 6</b></div><div class="row"><span>Score</span><b class="bs">0</b></div><div class="row"><span>Accuracy</span><b class="ba">—</b></div><div class="row"><span>Time</span><b class="bt">00:00</b></div></div>
    <div class="toast"></div>
    <div class="lock"><div>Click to engage</div></div>
  </div>

  <div class="layer ui mainmenu">
    <div class="backdrop"></div>
    <div class="col">
      <div class="eyebrow in" style="--i:0">Special operations</div>
      <h1 class="title in" style="--i:1">Zavod</h1>
      <div class="subtitle in" style="--i:2">Night ops · Container yard</div>
      <div class="loadsum in" style="--i:2"></div>
      <nav class="menu">${mi('deploy', 0, 'Deploy', 'primary')}${mi('maps', 1, 'Select map')}${mi('loadout', 2, 'Loadout')}${mi('settings', 3, 'Settings')}${mi('controls', 4, 'Controls')}</nav>
    </div>
    <div class="tag-tr in" style="--i:2"><i></i>Operator <b>Online</b><br>Sector <b>Zavod-7</b></div>
    <div class="tag-bl in up" style="--i:6">Build <b>${VERSION}</b> · three r186 · webgl2<br>Zavod is a non-commercial tech demo</div>
    <div class="tag-br in up" style="--i:7"><span><kbd>W</kbd><kbd>S</kbd> Navigate</span><span><kbd>ENTER</kbd> Select</span><span><kbd>ESC</kbd> Back</span></div>
  </div>

  <div class="layer ui pause">
    <div class="backdrop"></div>
    <div class="col">
      <div class="eyebrow in" style="--i:0">Mission suspended</div>
      <h1 class="title sm in" style="--i:1">Paused</h1>
      <div class="subtitle in" style="--i:2">Night ops · Container yard</div>
      <div class="loadsum in" style="--i:2"></div>
      <nav class="menu">${mi('resume', 0, 'Resume', 'primary')}${mi('settings', 1, 'Settings')}${mi('menu', 2, 'Quit to menu')}</nav>
    </div>
    <div class="tag-br in up" style="--i:6"><span><kbd>W</kbd><kbd>S</kbd> Navigate</span><span><kbd>ENTER</kbd> Select</span><span><kbd>ESC</kbd> Resume</span></div>
  </div>

  <div class="layer ui dead">
    <div class="backdrop"></div><div class="flash"></div>
    <div class="center">
      <div class="kia">K.I.A.</div>
      <div class="sub in up" style="--i:3">Killed in action</div>
      <div class="rule in up" style="--i:4"></div>
      ${stats(true)}
      <div class="btns in up" style="--i:7"><button class="btn primary" data-act="retry">Retry</button><button class="btn" data-act="menu">Quit to menu</button></div>
    </div>
  </div>

  <div class="layer ui vic">
    <div class="backdrop"></div>
    <div class="shut t"></div><div class="shut b"></div><div class="seam"></div>
    <div class="center">
      <div class="mc">Mission complete</div>
      <div class="sub in up" style="--i:0">Container yard secured</div>
      <div class="rule in up" style="--i:1"></div>
      ${stats(true)}
      <div class="btns in up" style="--i:4"><button class="btn primary" data-act="retry">Play again</button><button class="btn" data-act="menu">Main menu</button></div>
    </div>
  </div>

  ${panel('maps', 'Select map', 'Selecting reloads the mission', '<span class="curmap"></span>')}
  ${panel('loadout', 'Loadout', 'Applied immediately', '<span class="curload"></span>')}
  ${panel('settings', 'Settings', 'Applied live', '<button class="reset">Restore defaults</button>')}
  ${panel('controls', 'Controls', 'Keyboard &amp; mouse', '<span>Rebinding not available</span>')}
  `;
}
