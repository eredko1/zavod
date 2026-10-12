// The off-hand thumb microgesture: with the thumb tip on the side of the index finger (within TOUCH of the knuckle-to-fingertip
// line), a quick slide towards the fingertip or back towards the knuckle is a snap turn (forward: right, back: left).
// Pure ([x, y, z] joint positions in, a direction out) so qa can test it without a headset. Owned by: main (vr).
// Not a pinch: a touch near the fingertip (a pinch, or one coming in) or while the hand is busy (the pinch stick, the bars, the
// tablet) disarms it until the thumb has left the finger, so walking with the pinch stick never turns you.
export const THUMB = {
  TOUCH: 0.025, RELEASE: 0.035,   // m from the index line: the thumb is on it / has left it
  SWIPE: 0.018, MAX_T: 0.45,      // m along the finger, within this many s of touching (slower slides re-anchor)
  PINCH_ZONE: 0.03,               // m: the thumb this close to the index tip is a pinch, not a swipe
  COOLDOWN: 0.5,                  // s between turns
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.sqrt(dot(a, a));
export function thumbState() { return { on: false, armed: true, fired: false, s0: 0, t0: 0, last: -1e9 }; }
/** j: { thumb, prox, tip } (thumb-tip, index-finger-phalanx-proximal, index-finger-tip); t: seconds; busy: the hand is doing
 *  something else. Returns +1 (slid towards the fingertip), -1 (back towards the knuckle) or 0 */
export function thumbSwipe(st, j, t, busy) {
  const C = THUMB;
  if (busy || !j) { st.on = false; st.armed = false; return 0; }
  const ax = sub(j.tip, j.prox), L = len(ax); if (L < 0.01) { st.on = false; return 0; }
  const r = sub(j.thumb, j.prox), s = Math.max(0, Math.min(L, dot(r, ax) / L));
  const d = len(sub(r, ax.map((v) => v * s / L))), pinchD = len(sub(j.thumb, j.tip));
  if (d > C.RELEASE) { st.on = false; st.armed = true; return 0; }
  if (pinchD < C.PINCH_ZONE) { st.on = false; st.armed = false; return 0; }   // a pinch (or one coming in)
  if (!st.on) { if (d > C.TOUCH || !st.armed) return 0; st.on = true; st.fired = false; st.s0 = s; st.t0 = t; return 0; }
  if (st.fired) return 0;
  if (t - st.t0 > C.MAX_T) { st.s0 = s; st.t0 = t; return 0; }   // resting or creeping: not a swipe, start over from here
  const ds = s - st.s0; if (Math.abs(ds) < C.SWIPE || t - st.last < C.COOLDOWN) return 0;
  st.fired = true; st.last = t; return Math.sign(ds);
}
