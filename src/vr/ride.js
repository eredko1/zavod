// Riding a bike in VR with tracked hands: how far you turned the bars (or slid the pinch stick) and how far you pushed / pulled,
// shaped into steer and throttle. Pure (numbers in, numbers out) so qa can test it without a headset. Owned by: main (vr).
// What made Luna Park's narrow paths so hard before (RIDE_OLD): full lock at 0.55 rad of bars (~16 cm of hand travel), no deadzone,
// the same gain at walking pace and at 20 m/s, raw throttle (3 cm dead, full at 10 cm), and the bars' angle read in the leaning
// body's frame, so the bike's own lean fed back into the steering.
// Now: a deadzone, full lock further out on an expo curve (fine control round the centre), less steering the faster you go,
// smoothing, and the push sets a target speed (a small push is a walking pace you can hold) instead of raw acceleration.
export const RIDE = {
  DEAD: 0.07, FULL: 0.85, EXPO: 1.5,                  // bars, rad: deadzone, full lock, curve
  SLOW: 4, FAST: 16, FAST_GAIN: 0.45,                 // m/s: full gain below SLOW, FAST_GAIN of it above FAST
  SMOOTH: 9, THR_SMOOTH: 8,                           // 1/s: steer / throttle smoothing rates
  PUSH_DEAD: 0.035, PUSH_FULL: 0.16, PUSH_EXPO: 1.6,  // m pushed away from where you took hold
  GOV: 3,                                             // m/s under the target speed for full throttle
  BAR_R: 0.3,                                         // m: a grip's distance from the steering axis (pinch stick slide to bars angle)
};
export const RIDE_OLD = { FULL: 0.55, PUSH_DEAD: 0.03, PUSH_FULL: 0.1 };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const curve = (x, dead, full, expo) => { const a = Math.abs(x); return a <= dead ? 0 : Math.sign(x) * Math.min(1, (a - dead) / (full - dead)) ** expo; };
export function rideState() { return { steer: 0, thr: 0 }; }
/** bars: rad the bars turned since you took hold (+ = right); push: m pushed away (+) / pulled back (-); speed: the bike's forward m/s;
 *  top: its top speed. Returns { steer: -1..1 (+ = right), thr: -1..1 (< 0 brakes) } */
export function shapeRide(st, bars, push, speed, top, dt) {
  const R = RIDE, k = 1 - Math.exp(-dt * R.SMOOTH), kt = 1 - Math.exp(-dt * R.THR_SMOOTH);
  const gain = 1 - (1 - R.FAST_GAIN) * clamp((Math.abs(speed) - R.SLOW) / (R.FAST - R.SLOW), 0, 1);
  st.steer += (curve(bars, R.DEAD, R.FULL, R.EXPO) * gain - st.steer) * k;
  const u = curve(push, R.PUSH_DEAD, R.PUSH_FULL, R.PUSH_EXPO);
  const want = u > 0 ? clamp((top * u - speed) / R.GOV, 0, 1) : u;   // forward: hold a target speed; back: brake
  st.thr += (want - st.thr) * kt;
  return { steer: clamp(st.steer, -1, 1), thr: clamp(st.thr, -1, 1) };
}
/** the old mapping, for comparison in qa */
export function rideOld(bars, push) {
  const O = RIDE_OLD;
  return { steer: clamp(bars / O.FULL, -1, 1), thr: curve(push, O.PUSH_DEAD, O.PUSH_FULL, 1) };
}
