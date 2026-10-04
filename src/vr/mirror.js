// VR DOM MIRROR: draws the page's own overlay DOM (HUD, menus, dialogs, bag, durak, darts, chat …) into a canvas, so every 2D
// screen the game already has shows up inside the headset with no per-screen port. Immersive WebXR never shows the DOM, but the
// page still lays it out: we read each visible element's box + computed style and paint backgrounds, borders, text, <canvas>,
// <img>, range sliders and checkboxes at the same layout (scaled to the canvas). Clicks come back the other way: a ray hit on
// the panel → viewport (x, y) → elementFromPoint → the same pointer/mouse/click events a real click fires.
// Owned by: VR.

const SKIP = '#app, #touch, .xh, .hm, .vig, canvas.dmg, .lock, #boot.hide, [data-vr-skip], script, style, link, meta, noscript, template';
const RX_COLOR = /rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/gi;

export function createMirror(width = 1600) {
  const cv = document.createElement('canvas'), g = cv.getContext('2d', { alpha: true });
  const M = { canvas: cv, g, W: width, H: Math.round(width * 9 / 16), scale: 1, dirty: true, drawn: 0, ms: 0 };
  M.resize = () => { const vw = Math.max(1, innerWidth), vh = Math.max(1, innerHeight); M.scale = M.W / vw; const h = Math.round(vh * M.scale); if (cv.width !== M.W || cv.height !== h) { cv.width = M.W; cv.height = h; } M.H = h; };
  M.resize();
  /** repaint everything visible. `hud` = the in-game look: no full-screen dark backdrops, so the world shows through */
  M.draw = (hud = false) => {
    const t0 = performance.now(); M.resize(); const s = M.scale;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.setTransform(s, 0, 0, s, 0, 0);
    // the body's own children, painted bottom to top by z-index (DOM order breaks ties)
    const kids = [...document.body.children].map((el, i) => ({ el, i, z: zOf(el) })).sort((a, b) => a.z - b.z || a.i - b.i);
    for (const k of kids) paint(g, k.el, 1, hud, 0);
    M.drawn++; M.ms = performance.now() - t0; return cv;
  };
  return M;
}

function zOf(el) { const z = parseInt(getComputedStyle(el).zIndex, 10); return Number.isFinite(z) ? z : 0; }
const visible = (cs) => cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.02;

function paint(g, el, alpha, hud, depth) {
  if (el.nodeType !== 1 || depth > 40 || el === glCanvas || el.matches(SKIP)) return;
  const cs = getComputedStyle(el); if (!visible(cs)) return;
  const a = alpha * +cs.opacity, r = el.getBoundingClientRect();
  const big = r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9;
  if (r.width > 0 && r.height > 0) {
    g.globalAlpha = a;
    // backgrounds: a flat colour, or the first colour of a gradient (good enough at panel resolution)
    let bg = cs.backgroundColor; if ((!bg || /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) && cs.backgroundImage && cs.backgroundImage !== 'none') bg = (cs.backgroundImage.match(RX_COLOR) || [])[0] || null;
    if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg) && !(hud && big)) { g.fillStyle = bg; rrect(g, r, cs); g.fill(); }
    const bw = parseFloat(cs.borderTopWidth) || parseFloat(cs.borderLeftWidth) || 0;
    if (bw > 0 && cs.borderTopStyle !== 'none' && !/rgba\(0, 0, 0, 0\)/.test(cs.borderTopColor)) { g.strokeStyle = cs.borderTopColor; g.lineWidth = bw; rrect(g, r, cs, bw / 2); g.stroke(); }
    const tag = el.tagName;
    if (tag === 'CANVAS' && el.width > 0 && el.height > 0) { try { g.drawImage(el, r.left, r.top, r.width, r.height); } catch { /* tainted / lost context */ } }
    else if (tag === 'IMG' && el.complete && el.naturalWidth) { try { g.drawImage(el, r.left, r.top, r.width, r.height); } catch {} }
    else if (tag === 'INPUT') input(g, el, r, cs);
    else if (tag === 'SELECT') { g.fillStyle = cs.color; g.font = font(cs); g.textBaseline = 'middle'; g.fillText((el.options[el.selectedIndex]?.text || '') + ' ▾', r.left + 6, r.top + r.height / 2); }
  }
  // overflow clip (scroll lists, rounded cards)
  const clip = cs.overflow !== 'visible' && r.width > 0 && r.height > 0;
  if (clip) { g.save(); g.beginPath(); g.rect(r.left, r.top, r.width, r.height); g.clip(); }
  for (const n of el.childNodes) {
    if (n.nodeType === 3) { if (n.nodeValue.trim()) text(g, n, cs, a); }
    else if (n.nodeType === 1) paint(g, n, a, hud, depth + 1);
  }
  if (clip) g.restore();
  g.globalAlpha = 1;
}

function rrect(g, r, cs, inset = 0) {
  const rad = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, r.width / 2, r.height / 2);
  g.beginPath(); if (g.roundRect && rad > 0) g.roundRect(r.left + inset, r.top + inset, r.width - inset * 2, r.height - inset * 2, rad); else g.rect(r.left + inset, r.top + inset, r.width - inset * 2, r.height - inset * 2);
}
const font = (cs) => `${cs.fontStyle === 'italic' ? 'italic ' : ''}${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
const _range = document.createRange();

// a text node: one fillText per line box. Range.getClientRects() gives the line boxes; the words are flowed into them in order.
function text(g, n, cs, a) {
  let s = n.nodeValue.replace(/\s+/g, ' '); if (cs.textTransform === 'uppercase') s = s.toUpperCase(); else if (cs.textTransform === 'lowercase') s = s.toLowerCase();
  _range.selectNodeContents(n); const rects = [..._range.getClientRects()].filter((q) => q.width > 0.5 && q.height > 0.5); if (!rects.length) return;
  g.globalAlpha = a; g.font = font(cs); g.fillStyle = cs.color; g.textBaseline = 'middle';
  const sh = cs.textShadow && cs.textShadow !== 'none'; if (sh) { g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = 3; }
  if (rects.length === 1) { g.fillText(s.trim(), rects[0].left, rects[0].top + rects[0].height / 2, rects[0].width + 2); }
  else {
    const words = s.trim().split(' '); let w = 0;
    for (const q of rects) { let line = ''; while (w < words.length) { const t = line ? line + ' ' + words[w] : words[w]; if (line && g.measureText(t).width > q.width + 2) break; line = t; w++; } g.fillText(line, q.left, q.top + q.height / 2); }
  }
  if (sh) { g.shadowColor = 'transparent'; g.shadowBlur = 0; }
}

function input(g, el, r, cs) {
  const t = el.type;
  if (t === 'range') {
    const lo = +el.min || 0, hi = el.max === '' ? 100 : +el.max, k = hi > lo ? (+el.value - lo) / (hi - lo) : 0, y = r.top + r.height / 2;
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(r.left, y - 2, r.width, 4); g.fillStyle = cs.accentColor && cs.accentColor !== 'auto' ? cs.accentColor : '#e8b04a'; g.fillRect(r.left, y - 2, r.width * k, 4);
    g.beginPath(); g.arc(r.left + r.width * k, y, Math.min(9, r.height / 2), 0, Math.PI * 2); g.fill();
  } else if (t === 'checkbox' || t === 'radio') {
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(r.left + 1, r.top + 1, r.width - 2, r.height - 2);
    if (el.checked) { g.fillStyle = '#e8b04a'; g.fillRect(r.left + 4, r.top + 4, r.width - 8, r.height - 8); }
  } else {
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(r.left, r.top, r.width, r.height); g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1; g.strokeRect(r.left, r.top, r.width, r.height);
    g.fillStyle = el.value ? cs.color : 'rgba(255,255,255,0.45)'; g.font = font(cs); g.textBaseline = 'middle'; g.fillText(el.value || el.placeholder || '', r.left + 6, r.top + r.height / 2, r.width - 10);
  }
}

// ---- clicks from the headset ------------------------------------------------------------------------------------------------
/** what's under viewport (x, y), ignoring the WebGL canvas */
export function hitAt(x, y) {
  // the topmost element the mirror actually draws: never the 3D canvas itself (wherever it lives: #app, or an emulator's wrapper)
  // nor anything in the skip list (crosshair, damage flash …) that may sit over the menus
  for (const el of document.elementsFromPoint(x, y)) { if (el === document.body || el === document.documentElement) return null; if (el.closest('#app') || el.closest(SKIP) || el === glCanvas || el.contains(glCanvas)) continue; return el; }
  return null;
}
let glCanvas = null;
/** the WebGL canvas, so clicks never land on it */
export function setGLCanvas(c) { glCanvas = c; }
// a press and a release, like a mouse: pointerdown/mousedown on press, pointerup/mouseup on release, and click when both land on the
// same element (so darts can hold for power, sliders and card drags work). Range sliders jump to the pressed x.
let pressed = null;
const evt = (x, y, buttons) => ({ bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons, view: window, pointerId: 77, pointerType: 'mouse', isPrimary: true });
export function pointerDown(x, y) {
  const el = hitAt(x, y); pressed = el ? { el, x, y } : null; if (!el) return null;
  if (el.tagName === 'INPUT' && el.type === 'range') { setRange(el, x); return el; }
  el.dispatchEvent(new PointerEvent('pointerdown', evt(x, y, 1))); el.dispatchEvent(new MouseEvent('mousedown', evt(x, y, 1)));
  if (el.tagName === 'INPUT' && /text|search|number/.test(el.type)) el.focus();
  return el;
}
export function pointerUp(x, y) {
  const p = pressed; pressed = null; if (!p) return null; if (x == null) { x = p.x; y = p.y; }
  const el = (p.el.isConnected && p.el.tagName === 'CANVAS') ? p.el : hitAt(x, y) || p.el;   // a canvas keeps the gesture (darts: release anywhere throws)
  if (p.el.tagName === 'INPUT' && p.el.type === 'range') return p.el;
  el.dispatchEvent(new PointerEvent('pointerup', evt(x, y, 0))); el.dispatchEvent(new MouseEvent('mouseup', evt(x, y, 0)));
  if (el === p.el && el.isConnected) el.dispatchEvent(new MouseEvent('click', evt(x, y, 0)));
  return el;
}
function setRange(el, x) { const r = el.getBoundingClientRect(), lo = +el.min || 0, hi = el.max === '' ? 100 : +el.max, st = +el.step || 1; el.value = String(Math.round((lo + (hi - lo) * Math.min(1, Math.max(0, (x - r.left) / r.width))) / st) * st); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
/** a full click (press + release) at viewport (x, y) */
export function clickAt(x, y) { const el = pointerDown(x, y); pointerUp(x, y); return el; }
/** pointer moved over (x, y): hover + drag for canvases that track the mouse (darts aim, durak card drag) */
export function moveAt(x, y, down) {
  if (down && pressed?.el.tagName === 'INPUT' && pressed.el.type === 'range') { setRange(pressed.el, x); return pressed.el; }   // dragging a slider
  const el = down && pressed?.el.tagName === 'CANVAS' && pressed.el.isConnected ? pressed.el : hitAt(x, y); if (!el) return null;
  const o = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons: down ? 1 : 0, view: window, pointerId: 77, pointerType: 'mouse', isPrimary: true };
  el.dispatchEvent(new PointerEvent('pointermove', o)); el.dispatchEvent(new MouseEvent('mousemove', o)); return el;
}
/** is there something clickable at (x, y)? (for the laser's hover highlight) */
export function clickable(x, y) { const el = hitAt(x, y); if (!el) return false; const c = el.closest('button, a, input, select, label, [onclick], .hkch, .btn, [role=button], canvas, .card, li'); return !!c; }
