// A deliberate tap on a touch screen: fires on release, only if the finger stayed put (< TAP_MOVE px) and was quick (< TAP_MS).
// HUD buttons that acted on touchstart fired whenever a thumb landed on them on its way to steering or looking around (the
// minimap and the weapon strip sit right where thumbs rest). Desktop clicks are untouched.
const TAP_MS = 300, TAP_MOVE = 12;
/** onTap(el, (target, e) => …, selector?): with a selector, the target is the closest match inside el (and only taps on a match fire) */
export function onTap(el, fn, selector = null) {
  const T = new Map();
  el.addEventListener('touchstart', (e) => { for (const t of e.changedTouches) { const hit = selector ? t.target.closest?.(selector) : el; if (hit && el.contains(hit)) T.set(t.identifier, { x: t.clientX, y: t.clientY, at: performance.now(), hit }); } e.stopPropagation(); }, { passive: true });
  el.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) { const s = T.get(t.identifier); if (s && Math.hypot(t.clientX - s.x, t.clientY - s.y) > TAP_MOVE) s.at = -Infinity; } }, { passive: true });
  el.addEventListener('touchcancel', (e) => { for (const t of e.changedTouches) T.delete(t.identifier); });
  el.addEventListener('touchend', (e) => {
    // any touch that began here ends without the browser's synthetic click (a long press would otherwise still "click" the button)
    for (const t of e.changedTouches) { const s = T.get(t.identifier); T.delete(t.identifier); if (!s) continue; e.preventDefault(); e.stopPropagation();
      if (performance.now() - s.at < TAP_MS && Math.hypot(t.clientX - s.x, t.clientY - s.y) <= TAP_MOVE) fn(s.hit, e); }
  }, { passive: false });
}
