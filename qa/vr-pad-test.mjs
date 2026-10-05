// VR controllers of every make read the same: node qa/vr-pad-test.mjs. Feeds src/vr/pad.js the gamepads WebXR reports for Quest Touch,
// PSVR2 Sense (SteamVR on a PC, with and without face buttons bound), Valve Index, HTC Vive wands and WMR, and checks each one moves,
// turns, fires, grabs, jumps, reloads and opens the tablet.
import { read, kindOf } from '../src/vr/pad.js';
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const B = (n, on = {}) => Array.from({ length: n }, (_, i) => ({ pressed: !!on[i], touched: !!on[i] || !!on['t' + i], value: on[i] ? 1 : 0 }));
const pad = (profiles, nb, axes, on = {}) => ({ profiles, gamepad: { buttons: B(nb, on), axes } });
const STICKS = [['Quest Touch', ['oculus-touch-v3', 'oculus-touch', 'generic-trigger-squeeze-thumbstick']], ['PSVR2 Sense', ['sony-playstation-vr2-sense', 'generic-trigger-squeeze-thumbstick']],
  ['Valve Index', ['valve-index', 'generic-trigger-squeeze-touchpad-thumbstick']], ['WMR', ['microsoft-mixed-reality', 'generic-trigger-squeeze-touchpad-thumbstick']], ['unknown stick', []]];
for (const [name, prof] of STICKS) {
  ok(kindOf(pad(prof, 6, [0, 0, 0, 0])) === 'stick', `${name}: a thumbstick controller`);
  const L = read(pad(prof, 6, [0, 0, 0, -1]), 'move'); ok(L.y === -1 && L.x === 0, `${name}: left stick forward walks`, JSON.stringify(L));
  const R = read(pad(prof, 6, [0, 0, 1, 0]), 'turn'); ok(R.x === 1, `${name}: right stick turns`);
  const f = read(pad(prof, 6, [0, 0, 0, 0], { 0: 1, 1: 1, 4: 1, 5: 1, 3: 1 }), 'turn'); ok(f.trig && f.grip && f.a && f.b && f.stickClick && f.face, `${name}: trigger, grip, A, B, stick click`, JSON.stringify(f));
  const nf = read(pad(prof, 4, [0, 0, 0, 0], { 3: 1 }), 'move'); ok(!nf.face && nf.stickClick, `${name} with no face buttons bound: no A/B, the stick click still reads (jump / tablet)`, JSON.stringify(nf));
  const dz = read(pad(prof, 6, [0, 0, 0.1, -0.12]), 'move'); ok(dz.x === 0 && dz.y === 0, `${name}: a resting stick inside the deadzone reads 0`);
}
// WMR: the thumb on the touchpad while the stick rests
const w = read(pad(['microsoft-mixed-reality'], 6, [0.6, -0.7, 0, 0], { t2: 1 }), 'move'); ok(w.x === 0.6 && w.y === -0.7, 'WMR: the touchpad walks when the stick rests', JSON.stringify(w));
// Vive wands: a touchpad, no stick, no face buttons
const VIVE = ['htc-vive', 'generic-trigger-squeeze-touchpad'];
ok(kindOf(pad(VIVE, 4, [0, 0])) === 'pad', 'Vive: a touchpad controller');
const vm = read(pad(VIVE, 4, [0, -0.8], { t2: 1 }), 'move'); ok(vm.y === -0.8, 'Vive: touching the left pad forward walks', JSON.stringify(vm));
const vr0 = read(pad(VIVE, 4, [0.9, 0], { t2: 1 }), 'turn'); ok(vr0.x === 0, 'Vive: just touching the right pad does not turn');
const vr1 = read(pad(VIVE, 4, [0.9, 0], { 2: 1 }), 'turn'); ok(vr1.x === 1, 'Vive: pressing the right pad\'s edge turns');
const vj = read(pad(VIVE, 4, [0, -0.9], { 2: 1 }), 'turn'); ok(vj.a && !vj.b, 'Vive: the right pad\'s top jumps');
const vb = read(pad(VIVE, 4, [0, 0.9], { 2: 1 }), 'turn'); ok(vb.b && !vb.a, 'Vive: the right pad\'s bottom reloads');
const vmenu = read(pad(VIVE, 4, [0, 0], { 2: 1 }), 'move'); ok(vmenu.menu && !vmenu.stickClick, 'Vive: the left pad\'s centre opens the tablet');
const vrun = read(pad(VIVE, 4, [0, -0.9], { 2: 1 }), 'move'); ok(vrun.stickClick && !vrun.menu, 'Vive: pressing the left pad while walking runs');
const vt = read(pad(VIVE, 4, [0, 0], { 0: 1, 1: 1 }), 'turn'); ok(vt.trig && vt.grip, 'Vive: trigger fires, grip grabs');
ok(read(null, 'move').kind === 'none' && read({ gamepad: null }, 'move').x === 0, 'no gamepad (tracked hands / gone): reads as nothing pressed');
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
