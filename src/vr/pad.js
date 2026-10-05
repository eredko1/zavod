// VR controllers, any make: one reading of a controller's gamepad, whatever its layout. Owned by: main (vr agent).
// WebXR's 'xr-standard' mapping puts trigger / squeeze / touchpad / thumbstick / A·X / B·Y at buttons 0-5 and touchpad / thumbstick
// at axes 0-1 / 2-3. Not every controller has every part:
//  · Quest Touch, PSVR2 Sense (SteamVR on a PC), Index, Pico, WMR: thumbstick + two face buttons (some PC runtimes leave the face
//    buttons unbound: then they're simply never pressed, and everything is still on the wrist tablet)
//  · Vive wands (and WMR's pad): a touchpad instead of / beside the stick. Touching the left pad moves you; pressing the right pad
//    turns (left / right edge), jumps (top) or reloads (bottom); pressing the centre of the left pad opens the tablet.
// read(src, side) → { trig, grip, x, y, stickClick, a, b, menu, padPress, face, kind } with x, y in [-1, 1], y down = +1 (the stick's own
// convention). Values below DEAD read as 0.
const DEAD = 0.18, PAD_EDGE = 0.45;
const NONE = Object.freeze({ trig: false, trigV: 0, grip: false, x: 0, y: 0, stickClick: false, a: false, b: false, menu: false, padPress: false, face: false, kind: 'none' });

const pressed = (g, i) => !!g?.buttons?.[i]?.pressed;
const touched = (g, i) => !!(g?.buttons?.[i]?.touched || g?.buttons?.[i]?.pressed);
const axis = (g, i) => { const v = g?.axes?.[i] || 0; return Math.abs(v) < DEAD ? 0 : v; };

/** what sort of controller: 'stick' (thumbstick), 'pad' (touchpad only) — from the profile list, then the axes it reports */
export function kindOf(src) {
  const prof = (src?.profiles || []).join(' '), g = src?.gamepad;
  if (/thumbstick|oculus|meta|quest|pico|index|knuckles|sony|psvr|playstation|sense/i.test(prof)) return 'stick';
  if (/vive|touchpad/i.test(prof)) return 'pad';
  return (g?.axes?.length || 0) >= 4 ? 'stick' : 'pad';
}

export function read(src, side) {
  const g = src?.gamepad; if (!g) return NONE;
  const kind = kindOf(src), face = (g.buttons?.length || 0) > 4;
  const r = { trig: pressed(g, 0), trigV: g.buttons?.[0]?.value || 0, grip: pressed(g, 1), x: 0, y: 0, stickClick: false, a: pressed(g, 4), b: pressed(g, 5), menu: false, padPress: false, face, kind };
  if (kind === 'stick') {
    r.x = axis(g, 2); r.y = axis(g, 3); r.stickClick = pressed(g, 3);
    if (!r.x && !r.y && touched(g, 2)) { r.x = axis(g, 0); r.y = axis(g, 1); }   // WMR: the stick is resting, the thumb is on the pad
    return r;
  }
  // a touchpad: the axes are where your thumb is (touching it is enough to walk; the turn side needs a press)
  const px = axis(g, 0) || axis(g, 2), py = axis(g, 1) || axis(g, 3), press = pressed(g, 2) || pressed(g, 3);
  r.padPress = press;
  if (side === 'move') { if (touched(g, 2) || touched(g, 3) || px || py) { r.x = px; r.y = py; } r.stickClick = press && Math.hypot(px, py) > PAD_EDGE; r.menu = press && Math.hypot(px, py) <= PAD_EDGE; }
  else if (press) {
    if (Math.abs(px) >= Math.abs(py) && Math.abs(px) > PAD_EDGE) r.x = Math.sign(px);   // edge press: snap turn
    else if (py < -PAD_EDGE) r.a = true;   // top: jump
    else if (py > PAD_EDGE) r.b = true;    // bottom: reload
    else r.stickClick = true;                    // centre
  }
  return r;
}
export { NONE as NO_PAD };
