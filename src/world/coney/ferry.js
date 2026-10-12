// CONEY — the NYC Ferry. A Hornblower-style aluminium catamaran (twin demi-hulls, white with the navy + teal livery, NYC FERRY on
// the side, an enclosed main cabin with big tinted windows, an open upper deck with the wheelhouse forward) ties up at a grey steel
// landing barge off the head of the fishing pier on the wall clock (everyone online sees the same boat at the same moment): it
// waits, backs off and swings round, runs out to sea, and (for whoever's aboard) the picture fades to the Narrows — a separate area
// far off the map with the Verrazzano-Narrows Bridge at full size (two 211 m towers 1298 m apart, the deck ~66 m up, main cables,
// suspenders, anchorages, a lit necklace at night), Staten Island and Bay Ridge either side. It runs up under the bridge to the 69th
// St landing in Bay Ridge, waits, and comes back to the pier. Both landings: a canopy, the blue signs, a gangway, bollards, a ticket
// machine, a queue rail, a second boat laid up at the other berth, and a countdown board ticking off the timetable below.
// F (or the big VR / phone button) on the barge while it's in: board (you stand at the stern rail, look around freely; you turn with
// the boat); F when it's tied up again: off. The Narrows are built the first time anyone rides (nothing to load until then). Off at
// Bay Ridge you're on foot on the barge (it bobs on the swell, the boat with it): up the gangway to Shore Pkwy for Soc Tav, and back
// from Soc Tav's B70 stop to board at the gate. CONEY agent.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hangkit as K } from '../hangkit.js';
import { TZ } from './tavern.js';
import { buildPerson, peopleReady } from '../people.js';

const CYCLE = 240, DOCK_UNTIL = 40, OUT_UNTIL = 70, BR_ARRIVE = 118, BR_LEAVE = 140, NARROWS_UNTIL = 190, IN_UNTIL = 225;   // s on the wall clock: Coney 0..40 (and 225..240), Bay Ridge 118..140
const OUT_Z = 650;                                   // how far out to sea the boat runs before the Narrows (world z)
const NZ = 30000;                                   // the Narrows area: world z offset
// the run up the Narrows (local x, z): in from the sea, under the bridge, up the Brooklyn side to the 69th St landing in Bay Ridge
const NP = [[300, 700], [300, -300], [420, -650], [600, -860], [700, -890], [875, -890]].map(([x, z]) => new THREE.Vector3(x, 0, z));
const BAR = new THREE.Vector3(-1, 0, -1.85), DECK_X = 3.3, DECK_Z0 = -2.15, DECK_Z1 = 9.2;   // BAR: where you stand to buy (the counter is just forward of it); DECK_*: where you can walk on the upper deck
const LEN = 26, BEAM = 8.5, DECK2 = 3.95;           // the boat: length, beam, upper deck height
const BENCH_Z = [-1.5, 0.1, 1.7, 3.3, 4.9, 6.5, 8.1], BENCH_X = 2.2, BODY_R = 0.25;   // bench rows either side of the aisle; your body's radius
// walking the deck: the benches are solid (inflated by your radius) and you slide along them; the aisle down the middle stays clear
const OBST = BENCH_Z.flatMap((z) => [-1, 1].map((s) => [s * BENCH_X - 0.9 - BODY_R, z - BODY_R, s * BENCH_X + 0.9 + BODY_R, z + 0.48 + BODY_R]));
const BAR_R = 1.7, BAR_R_VR = 2.3;                   // how close to the counter you buy (wider in a headset: no precise stick)
// the landing barges: L long (local z, the shore end at −z), BW wide (local x, the boat's berth on +x), deck at local y 0
const BW = 8, BOARD_RISE = 1.05, SPOT_R = 7;          // BOARD_RISE: barge deck → the boat's main deck; SPOT_R: the boarding zone on the barge
const BOARD_HZ = 1, BOARD_NEAR = 260;                // the countdown boards repaint once a second, only when you're near one
const LANDING_R = 40, SEA_W = 40;   // LANDING_R (QA): a boat within this of a barge is "at" that landing; SEA_W: half-width of the open-water zone along her run (she swings 14 m east of the dock)
// landing on the deck from the air: feet within the deck (± LAND_PAD), LAND_BELOW under to LAND_ABOVE over it, not rising faster than
// LAND_VY. Jumping off: HOP_VY up, and HOP_COOL s before either can happen again
const LAND_PAD = 0.3, LAND_BELOW = 0.6, LAND_ABOVE = 1.2, LAND_VY = 0.5, HOP_VY = 5.5, HOP_COOL = 0.6;
// the Bay Ridge barge on foot: BOB_* the swell it (and the boat tied to it) rides on; BR_NEAR: the landing is drawn within this of you;
// GATE_R: how close to the boarding gate you board; SHORE_R: how close to the top of the gangway the TO SOC TAV prompt shows; TP_JUMP:
// a jump bigger than this between frames means something else teleported you off the barge
const BOB_A = 0.07, BOB_A2 = 0.03, BOB_T = 1900, BOB_T2 = 1130, BR_NEAR = 450, GATE_R = 2.6, SHORE_R = 3.5, TP_JUMP = 3;
const bobAt = (ms) => Math.sin(ms / BOB_T) * BOB_A + Math.sin(ms / BOB_T2) * BOB_A2;
let F = null;

export function buildFerry(world) {
  const { ctx, W, scene } = world; const P = W.pier || { x: -361, x0: -366.5, x1: -355.5, z1: 500 };
  // the pier's real footprint: the OSM pier is two overlapping decks (W.pier is the first); everything here clears the union
  const pr = { x0: P.x0 ?? P.x - 5.5, x1: P.x1, z1: P.z1 };
  for (const b of W.walkables || []) if (b.max.z > P.z1 - 30 && b.max.z < P.z1 + 10 && b.min.x < P.x1 + 6 && b.max.x > pr.x0 - 6 && b.max.y < 0.5 && b.max.y > -0.5) { pr.x0 = Math.min(pr.x0, b.min.x); pr.x1 = Math.max(pr.x1, b.max.x); pr.z1 = Math.max(pr.z1, b.max.z); }
  // the Coney landing: the barge out past the pier head (a gangway down from the deck), the boat at its east berth, a spare at the west
  const CL = 32, deckY = -1.85, bx = pr.x1 - 1 - BW / 2, bz = pr.z1 + 5 + CL / 2;
  const dock = { x: bx + BW / 2 + 0.6 + BEAM / 2, z: bz, y: deckY };
  F = { world, ctx, W, dock, pier: pr, path: new THREE.CatmullRomCurve3(NP), lx: 0, lz: 8.5, boat: ferryModel(!!ctx.lite), aboard: false, yawPrev: 0, narrows: null, phaseName: '', faded: null,
    spotPos: new THREE.Vector3(bx + BW / 2 - 1.5, deckY + 0.3, bz - 6), boards: [], spd: 0, last: new THREE.Vector3(), vel: new THREE.Vector3(), walk: new THREE.Vector3(), ownLabel: false };
  scene.add(F.boat.group);
  const parked = F.boat.group.clone(); parked.name = 'nycFerryLaidUp'; parked.position.set(bx - BW / 2 - 0.6 - BEAM / 2, (W.ocean ? W.ocean.waveHeight(bx, bz) : -2.7) + 0.45, bz); scene.add(parked);   // shares the geometry and materials
  F.coney = { x: bx, z: bz, L: CL, parked, rects: [[pr.x0, P.z0 ?? 160, pr.x1, pr.z1], [bx - BW / 2, bz - CL / 2, bx + BW / 2, bz + CL / 2], rectOf(parked.position.x, bz, 0)] };
  F.boards.push(terminal(scene, { x: bx, y: deckY, z: bz, ry: 0, L: CL, shore: { len: 5, rise: -deckY }, name: 'STEEPLECHASE PIER · CONEY ISLAND', dest: 'BAY RIDGE', leave: DOCK_UNTIL, lite: !!ctx.lite, world }));
  F.wake = wake(); F.boat.group.add(F.wake);
  // the pier past the beach is its own little zone (the map stops at the waterline), so you can walk out to the head and the barge
  (W.zones || (W.zones = [])).push({ x0: Math.min(pr.x0, parked.position.x) - 30, x1: dock.x + BEAM / 2 + 1, z0: 370, z1: bz + CL / 2 + 3, name: 'STEEPLECHASE PIER', hint: 'NYC Ferry at the landing' });
  // and the water she runs out over, so a jet pack (or a dive off her) can follow the boat out to sea
  W.zones.push({ x0: dock.x - SEA_W, x1: dock.x + SEA_W, z0: bz + CL / 2, z1: OUT_Z + SEA_W, name: 'NYC FERRY ROUTE', hint: 'Open water off the pier' });
  const mmss = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  K.spot({ pos: F.spotPos, r: SPOT_R, dy: 2.5, when: () => !F.aboard, prompt: () => phase().docked ? `F — BOARD THE FERRY  · Bay Ridge / Soc Tav, leaves in ${mmss(untilLeave(DOCK_UNTIL))}` : `F — NEXT FERRY ${mmss(untilLeave(DOCK_UNTIL))}`, act: () => { if (phase().docked) board(); else ctx.hud?.toast?.(`Next NYC Ferry to Bay Ridge in ${mmss(untilLeave(DOCK_UNTIL))} — wait on the barge`, 1800); } });
  // 8th Ave & 60th (Soc Tav's B70 stop): the way back — the bus down to 69th St and the ferry home
  K.spot({ pos: new THREE.Vector3(-12, 0.15, TZ.oz + 7.6), r: 3.5, dy: 2, prompt: 'F · B70 TO THE 69TH ST FERRY · BACK TO CONEY ISLAND', act: () => toBarge() });
  (W.mapPOIs || (W.mapPOIs = [])).push({ name: 'NYC FERRY', x: dock.x, z: dock.z, kind: 'transit' });
  ctx.bus.on('playerDied', () => { if (F.aboard) leave(false); if (F.barge) offBarge(); });
  world.updaters.push((dt) => update(dt));
  // net.js: where you stand on the deck (sent with your state) and a friend's deck spot → the world on our copy of the boat
  ctx.ferry = { local: () => (F.aboard ? [+F.lx.toFixed(2), +F.lz.toFixed(2)] : null),
    toWorld: (lx, lz, out) => { const w = where(phase().t); if (w.narrows && !F.aboard) return null; F.boat.group.updateMatrixWorld(); return out.set(lx, DECK2, lz).applyMatrix4(F.boat.group.matrixWorld); } };
  // passengers: a few on the benches, two at the stern rail, one by the bar — they ride the boat (children of it); added once the
  // people models are in, animated only while you're near
  const crew = [], seats = ctx.lite ? [[2.2, 0.25, Math.PI, 'sit'], [-2.2, 3.45, Math.PI, 'sit'], [1.6, 9.0, 0, 'stand'], [-1, -3.25, 0, 'stand']] : [[2.2, 0.25, Math.PI, 'sit'], [-2.2, 1.85, Math.PI, 'sit'], [2.2, 5.05, Math.PI, 'sit'], [-2.2, 6.65, Math.PI, 'sit'], [1.6, 9.0, 0, 'stand'], [-1.2, 9.0, 0.3, 'stand'], [-1, -3.25, 0, 'stand']];   // sitters on the bench pads (benches face the bow), the bartender behind the counter
  const addCrew = () => { if (crew.length || !peopleReady()) return; seats.forEach(([x, z, yaw, pose], i) => { try { const f = buildPerson({ seed: 300 + i * 17, pose: pose === 'sit' ? 'sit' : undefined }); f.group.position.set(x, DECK2 + (pose === 'sit' ? 0.02 : 0), z); f.group.rotation.y = yaw; F.boat.group.add(f.group); crew.push(f); if (i === seats.length - 1) f.mood = 'talk'; } catch (e) { console.warn('[ferry] passenger', e); } }); };
  world.updaters.push((dt) => { addCrew(); const P = ctx.player?.position; if (!crew.length || !P || !F.boat.group.visible || F.boat.group.position.distanceTo(P) > 90) return; for (const f of crew) f.update(dt, 0); });
  if (typeof window !== 'undefined' && window.__game) window.__game.ferry = { state: () => ({ ...phase(), aboard: F.aboard, pos: F.boat.group.position.toArray().map((v) => +v.toFixed(1)), deck: [+F.lx.toFixed(2), +F.lz.toFixed(2)], bayRidge: !!where(phase().t).bayRidge, label: ctx.actionLabel || null, big: !!ctx.actionBig }),
    skew: (t) => { F.skew = t - ((Date.now() / 1000) % CYCLE); }, board: () => board(), leave: () => leave(true), dock, spot: F.spotPos.toArray(), bar: [BAR.x, BAR.z],
    clock: () => F.boards.map((b) => b.text), boats: () => boatsAt(), clearance: () => clearance(), paint: () => paintBoards(true),
    barge: () => (F.barge ? { on: true, x: +F.barge.x.toFixed(2), z: +F.barge.z.toFixed(2), y: +ctx.player.position.y.toFixed(3), wz: +(ctx.player.position.z - NZ).toFixed(2), shore: [BR_SHORE, BR.z], gate: [GATE.x, GATE.z], visible: !!F.narrows?.visible } : { on: false }),
    bargeAt: (x, z) => { if (F.barge) { F.barge.x = x; F.barge.z = z; F.barge.last = null; } }, toBarge: () => toBarge() };
}

// ---- the timetable -------------------------------------------------------------------------------------------------------------
function phase() { const t = (((Date.now() / 1000) + (F.skew || 0)) % CYCLE + CYCLE) % CYCLE; return { t, docked: t < DOCK_UNTIL || t >= IN_UNTIL, narrows: t >= OUT_UNTIL && t < NARROWS_UNTIL }; }
/** whole seconds until the next departure at clock time `at` (0 = it's going now) */
function untilLeave(at) { return Math.ceil(((at - phase().t) % CYCLE + CYCLE) % CYCLE); }
const ease = (k) => k * k * (3 - 2 * k);
/** where the boat is at clock time t: { x, z, h (heading, bow −z = 0), narrows } */
function where(t) {
  const D = F.dock;
  if (t < DOCK_UNTIL || t >= IN_UNTIL) return { x: D.x, z: D.z, h: 0 };   // tied up, bow to the beach
  if (t < OUT_UNTIL) { const k = (t - DOCK_UNTIL) / (OUT_UNTIL - DOCK_UNTIL);   // straight back till the stern's clear of the barge, swing round off it, run out
    if (k < 0.4) return { x: D.x, z: D.z + 45 * ease(k / 0.4), h: 0 };
    if (k < 0.65) { const e = ease((k - 0.4) / 0.25); return { x: D.x + 14 * e, z: D.z + 45 + 15 * e, h: Math.PI * e }; }
    const e = (k - 0.65) / 0.35; return { x: D.x + 14, z: D.z + 60 + (OUT_Z - D.z - 60) * e * (0.5 + 0.5 * e), h: Math.PI }; }
  if (t < NARROWS_UNTIL) {   // up to Bay Ridge, tie up, and back down the same way
    const back = t >= BR_LEAVE, u = t < BR_ARRIVE ? ease((t - OUT_UNTIL) / (BR_ARRIVE - OUT_UNTIL)) : !back ? 1 : 1 - ease((t - BR_LEAVE) / (NARROWS_UNTIL - BR_LEAVE));
    const P = F.path.getPointAt(u), T = F.path.getTangentAt(Math.min(0.999, Math.max(0.001, u))); const dx = back ? -T.x : T.x, dz = back ? -T.z : T.z;
    return { x: P.x, z: P.z, h: Math.atan2(-dx, -dz), narrows: true, bayRidge: t >= BR_ARRIVE && t < BR_LEAVE }; }
  const k = ease((t - NARROWS_UNTIL) / (IN_UNTIL - NARROWS_UNTIL)); return { x: D.x, z: OUT_Z + (D.z - OUT_Z) * k, h: 0 };   // in, bow first
}
// the Bay Ridge landing (Narrows-local): the barge along x off the Shore Pkwy bulkhead, the boat at its north berth
const BR = { x: 888, z: -899, L: 72, y: 0.9, parkX: 909, boatZ: -890 }, BR_SHORE = 930, BR_TOP = 3;   // BR_SHORE / BR_TOP: the Shore Pkwy bulkhead (its x, its top)
/** a boat's footprint (x0, z0, x1, z1) lying with heading h (0 or ±π/2 only) */
function rectOf(x, z, h) { const a = Math.abs(Math.sin(h)) > 0.5, hx = (a ? LEN : BEAM) / 2, hz = (a ? BEAM : LEN) / 2; return [x - hx, z - hz, x + hx, z + hz]; }
/** QA: sweep the whole timetable; the hull outline must never be inside the pier, a barge or the laid-up boat */
function clearance() {
  const br = [[BR.x - BR.L / 2, BR.z - BW / 2, BR.x + BR.L / 2, BR.z + BW / 2], rectOf(BR.parkX, BR.boatZ, -Math.PI / 2), [BR_SHORE, -905, BR_SHORE + 60, -893]], hits = [];
  for (let t = 0; t < CYCLE; t += 0.25) { const w = where(t), rects = w.narrows ? br : F.coney.rects, c = Math.cos(w.h), s = Math.sin(w.h);
    for (let lz = -LEN / 2; lz <= LEN / 2; lz += 1) for (let lx = -BEAM / 2; lx <= BEAM / 2; lx += Math.abs(lz) === LEN / 2 ? 1.0625 : BEAM) {
      const x = w.x + lx * c + lz * s, z = w.z - lx * s + lz * c;
      if (rects.some((r) => x > r[0] && x < r[2] && z > r[1] && z < r[3])) { hits.push([t, +x.toFixed(1), +z.toFixed(1)]); break; } } }
  return { hits: hits.length, first: hits[0] || null };
}
/** QA: boats at each landing (the one in service when it's tied up there, plus the laid-up spare) */
function boatsAt() {
  const g = F.boat.group, near = (o, x, z) => o.visible && Math.hypot(o.position.x - x, o.position.z - z) < LANDING_R;
  const coney = [g, F.coney.parked].filter((o) => near(o, F.coney.x, F.coney.z)).length;
  const N = F.narrows, bay = N?.visible ? [N.userData.parked].filter((o) => near(o, BR.x, BR.z)).length + (g.visible && Math.hypot(g.position.x - BR.x, g.position.z - NZ - BR.z) < LANDING_R ? 1 : 0) : 0;
  return { coney, bayRidge: bay, narrowsBuilt: !!N };
}

// ---- per frame ---------------------------------------------------------------------------------------------------------------
const _e = new THREE.Euler(0, 0, 0, 'YXZ'), _fw = new THREE.Vector3();
function update(dt) {
  const { ctx, W } = F, p = ctx.player; if (!p) return; const ph = phase(), w = where(ph.t), g = F.boat.group;
  const inNarrows = !!w.narrows && F.aboard, here = inNarrows || !!F.barge;   // here: you're in the Narrows (riding, or on foot at Bay Ridge)
  if (here && !F.narrows) { F.narrows = buildNarrows(F.world); }
  if (F.narrows) F.narrows.visible = here;
  if (here !== !!F.faded) fade(here ? 'THE NARROWS · VERRAZZANO-NARROWS BRIDGE' : 'CONEY ISLAND · STEEPLECHASE PIER', here);
  // the swell at Bay Ridge: the barge rides it, and so does the boat while she's up the Narrows (tied up alongside, she bobs with it)
  const bob = bobAt(Date.now());
  if (F.brTerm) { F.brTerm.root.position.y = BR.y + bob; const P = p.position; F.brTerm.root.visible = F.narrows.userData.parked.visible = here && Math.hypot(P.x - BR.x, P.z - NZ - BR.z) < BR_NEAR; }
  // out at sea with nobody aboard: out of sight (it's 500 m off and going away)
  const inN = here && !!w.narrows, x = w.x, z = inN ? NZ + w.z : w.z, oy = inN ? bob : !w.narrows && W.ocean ? W.ocean.waveHeight(x, z) : 0;
  g.visible = inN || !w.narrows; g.position.set(x, oy + 0.45, z);   // the hulls draw ~0.5 m
  const roll = Math.sin(Date.now() / 1700) * 0.02, pitch = Math.sin(Date.now() / 2300) * 0.012; g.rotation.set(pitch, w.h, roll, 'YXZ');
  // the wake: foam off the stern while she's making way ahead (none tied up or backing off)
  if (dt > 0) { _fw.set(x - F.last.x, 0, z - F.last.z); const ahead = -(_fw.x * Math.sin(w.h) + _fw.z * Math.cos(w.h)) / dt; F.spd += ((Math.abs(ahead) < 60 ? Math.max(0, ahead) : 0) - F.spd) * Math.min(1, dt * 2); if (Math.abs(ahead) < 60) F.vel.copy(_fw).divideScalar(dt); }
  F.last.set(x, 0, z); F.wake.visible = F.spd > 0.6; if (F.wake.visible) F.wake.material.opacity = Math.min(0.85, F.spd / 10);
  F.boardT = (F.boardT || 0) - dt; if (F.boardT <= 0) { F.boardT = 1 / BOARD_HZ; paintBoards(false); }
  F.hopT = Math.max(0, (F.hopT || 0) - dt);
  // landing on her at sea (a jet pack, a jump off the pier or another boat, a fall): feet over the upper deck, just above it, coming
  // down → you're a deck passenger, exactly as if you'd boarded at the landing (not in the Narrows: only riders are ever there)
  if (!F.aboard && g.visible && !w.narrows && F.hopT <= 0 && !p.dead && !p.mounted && !ctx.vehicles?.mounted && ctx.state === 'playing' && (p.velocity?.y ?? 0) <= LAND_VY) {
    g.updateMatrixWorld(); const l = g.worldToLocal(_fw.copy(p.position));
    if (Math.abs(l.x) <= DECK_X + LAND_PAD && l.z >= DECK_Z0 - LAND_PAD && l.z <= DECK_Z1 + LAND_PAD && l.y >= DECK2 - LAND_BELOW && l.y <= DECK2 + LAND_ABOVE) landOn(l.x, l.z); }
  let label = null;
  if (F.aboard) {
    if (p.dead) { leave(false); return; }
    const playing = ctx.state === 'playing', inp = ctx.input, vr = !!ctx.xr?.presenting, nearBar = Math.hypot(F.lx - BAR.x, F.lz - BAR.z) < (vr ? BAR_R_VR : BAR_R);
    // jumping (or lighting the jet pack) off her: back to your own legs in the world, her way on (so a jump straight up comes down on
    // the deck again; over the rail it's the water). Not in the Narrows: that water's a picture far off the map
    const jumpNow = !!inp?.jump || (p.jet?.thrust || 0) > 0, jumpEdge = jumpNow && !F.jumpHeld; F.jumpHeld = jumpNow;
    if (playing && jumpEdge && !w.narrows && F.hopT <= 0) { hopOff(); return; }
    label = ph.docked ? 'GET OFF · CONEY ISLAND' : w.bayRidge ? 'GET OFF · BAY RIDGE' : nearBar ? 'TALLBOY $3' : null;
    if (playing && inp?.pressed?.has?.('KeyF')) { inp.pressed.delete('KeyF');
      if (ph.docked) { leave(true); return; } if (w.bayRidge) { bayRidge(); return; }   // at a landing F is always getting off
      if (nearBar) { if (K.full()) K.toast?.('Hands full', 1000); else if (K.pay(3)) { K.give('tallboy'); K.toast?.('A tallboy from the ferry bar — $3. B to drink', 1800); } else K.toast?.('$3, pal', 1000); }
      else K.toast?.('Off at the next landing — Bay Ridge, or back at Coney', 1400); }
    F.barT = (F.barT || 0) - dt; if (nearBar && !ph.docked && !w.bayRidge && F.barT <= 0) { F.barT = 2; K.toast?.('F — TALLBOY $3 · B — DRINK', 1200); }
    // in a headset you walk where you look: the head's world yaw (last frame's rendered camera), not the seat's yaw
    let walkYaw = p.yaw; if (vr) { _e.setFromQuaternion(ctx.camera.quaternion, 'YXZ'); walkYaw = _e.y; }
    p.yaw += w.h - F.yawPrev; F.yawPrev = w.h;   // you turn with the boat
    // walk the upper deck: your input in the world, turned into the boat's frame, kept inside the rails, sliding along the benches
    let ix = (inp?.right ? 1 : 0) - (inp?.left ? 1 : 0), iy = (inp?.forward ? 1 : 0) - (inp?.back ? 1 : 0); if (inp?.xrMove) { ix = inp.xrMove.x; iy = inp.xrMove.y; } else if (inp?.touch?.axis && (inp.touch.axis.x || inp.touch.axis.y)) { ix = inp.touch.axis.x; iy = -inp.touch.axis.y; }
    if (playing && (ix || iy)) { const sp = (inp?.sprint ? 4.5 : 2.6) * dt / Math.max(1, Math.hypot(ix, iy)), wx = (-Math.sin(walkYaw) * iy + Math.cos(walkYaw) * ix) * sp, wz = (-Math.cos(walkYaw) * iy - Math.sin(walkYaw) * ix) * sp, c = Math.cos(w.h), sn = Math.sin(w.h);
      stepDeck(wx * c - wz * sn, wx * sn + wz * c); F.walk.set(wx / dt, 0, wz / dt); } else F.walk.set(0, 0, 0);
    g.updateMatrixWorld(); const at = new THREE.Vector3(F.lx, DECK2, F.lz).applyMatrix4(g.matrixWorld); p.position.copy(at); p.velocity?.set?.(0, 0, 0);
    const cam = ctx.camera; cam.position.set(at.x, at.y + 1.62, at.z); cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ'); p.cameraPosition?.copy?.(cam.position);
    if (ph.t >= OUT_UNTIL && ph.t < OUT_UNTIL + 0.5 && F.phaseName !== 'n') { F.phaseName = 'n'; ctx.hud?.toast?.('Up the Narrows to the Verrazzano', 2400); }
    if (ph.t >= IN_UNTIL && F.phaseName !== 'd') { F.phaseName = 'd'; ctx.hud?.toast?.('Coney Island landing — F to get off', 2600); }
    if (w.bayRidge && F.phaseName !== 'b') { F.phaseName = 'b'; ctx.hud?.toast?.('69th St, Bay Ridge — F to get off for Soc Tav (the B70 up 8th Ave)', 3600); }
  }
  if (F.barge) label = bargeWalk(dt, w, bob);
  // the action button (VR pill, phone button) names getting off / the bar; it's big while it's the ferry's (a wide target in a headset)
  if (label) { ctx.actionLabel = label; F.ownLabel = true; } else if (F.ownLabel) { ctx.actionLabel = null; F.ownLabel = false; }
  ctx.actionBig = F.barge ? !!label : F.aboard ? label === 'GET OFF · CONEY ISLAND' || label === 'GET OFF · BAY RIDGE' : ph.docked && Math.hypot(p.position.x - F.spotPos.x, p.position.z - F.spotPos.z) < SPOT_R;
}
/** one step on the upper deck (boat-local metres): each axis on its own, so a bench in the way slides you along it instead of stopping you */
function stepDeck(dx, dz) {
  const inside = (x, z) => OBST.some((o) => x > o[0] && x < o[2] && z > o[1] && z < o[3]), stuck = inside(F.lx, F.lz);   // already inside (a teleport): let them walk out
  const nx = Math.max(-DECK_X, Math.min(DECK_X, F.lx + dx)); if (stuck || !inside(nx, F.lz)) F.lx = nx;
  const nz = Math.max(DECK_Z0, Math.min(DECK_Z1, F.lz + dz)); if (stuck || !inside(F.lx, nz)) F.lz = nz;
}
/** on the deck at (lx, lz): a passenger from here on (the deck walk, ctx.ferry.local → net.js `fe`) */
function mount(lx, lz) {
  const { ctx } = F, p = ctx.player; F.aboard = true; p.mounted = { ferry: true, speed: 0 }; F.yawPrev = where(phase().t).h; F.phaseName = '';
  F.lx = Math.max(-DECK_X, Math.min(DECK_X, lx)); F.lz = Math.max(DECK_Z0, Math.min(DECK_Z1, lz)); F.hopT = HOP_COOL; F.jumpHeld = true;   // a held jump / jet doesn't throw you straight back off
  try { ctx.bus.emit('vrFace'); } catch {}
}
function board() {
  const { ctx } = F, p = ctx.player; if (F.aboard || p.mounted || ctx.vehicles?.mounted) return;
  mount(0, 8.5);
  ctx.hud?.toast?.(`NYC Ferry — leaves in ${untilLeave(DOCK_UNTIL)} s. The bar's forward, up the aisle; F at the landing to get off`, 3200);
}
function landOn(lx, lz) { mount(lx, lz); F.ctx.hud?.toast?.('Made it aboard the NYC Ferry! Jump or jet off to go over the side', 2600); }
/** over the side: your own legs again with her way on, plus the step you took */
function hopOff() {
  const { ctx } = F, p = ctx.player; leave(false); F.hopT = HOP_COOL;
  p.velocity?.set?.(F.vel.x + F.walk.x, HOP_VY, F.vel.z + F.walk.z); p.onGround = false; ctx.hud?.toast?.('Over the side!', 1200);
}
/** off at 69th St: down the gangway onto the barge, just inside the gate, facing the shore */
function bayRidge() { leave(false, true); onBarge(GATE.x, GATE.z - 2.2, -Math.PI / 2); F.ctx.hud?.toast?.('69th St, Bay Ridge. Up the gangway at the shore end for Soc Tav (the B70 up 8th Ave)', 3600); }
function leave(toPier, keepFade) {
  const { ctx } = F, p = ctx.player; F.aboard = false; if (p.mounted?.ferry) p.mounted = null; if (F.faded && !keepFade) fade('', false);
  if (F.ownLabel) { ctx.actionLabel = null; F.ownLabel = false; } ctx.actionBig = false;
  if (toPier) p.teleport(F.spotPos.x, F.spotPos.y, F.spotPos.z, Math.PI / 2, 0);
}
// ---- on foot at Bay Ridge (Narrows-local x, z): the barge, the gangway up to the Shore Pkwy bulkhead, the top of it ----------------
const BX0 = BR.x - BR.L / 2, BX1 = BR.x + BR.L / 2, GATE = { x: BR.x + 6, z: BR.z + BW / 2 - 0.4 };   // the boarding gate (terminal: local gate z −6, berth side)
const WALK = [[BX0 + 0.35, BR.z - BW / 2 + 0.35, BX1, BR.z + BW / 2 - 0.35], [BX1 - 0.2, BR.z - 0.9, BR_SHORE + 0.2, BR.z + 0.9], [BR_SHORE, BR.z - 5, BR_SHORE + 3, BR.z + 5]];
const onWalk = (x, z) => WALK.some((r) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]);
const bargeY = (x, bob) => (x <= BX1 ? BR.y + bob : x >= BR_SHORE ? BR_TOP : BR.y + bob + (BR_TOP - BR.y - bob) * (x - BX1) / (BR_SHORE - BX1));
/** standing on the Bay Ridge landing at (x, z): you walk it like the boat's deck (it bobs; you go with it) */
function onBarge(x, z, yaw) {
  const { ctx } = F, p = ctx.player; if (!F.narrows) F.narrows = buildNarrows(F.world);
  F.barge = { x, z, last: null }; p.mounted = { ferry: true, barge: true, speed: 0 }; p.yaw = yaw; p.pitch = 0; F.faded = true;   // the Narrows are up already (you came off the boat, or faded in)
}
function offBarge() { const p = F.ctx.player; F.barge = null; if (p.mounted?.barge) p.mounted = null; if (F.ownLabel) { F.ctx.actionLabel = null; F.ownLabel = false; } F.ctx.actionBig = false; }
/** Soc Tav → the B70 down to 69th St: on the bulkhead at the top of the gangway, facing the barge */
function toBarge() {
  const { ctx } = F; if (F.aboard || ctx.vehicles?.mounted) return; const z = BR.z;
  ctx.player.teleport(BR_SHORE + 0.8, BR_TOP, NZ + z, Math.PI / 2, 0); onBarge(BR_SHORE + 0.8, z, Math.PI / 2); fade('THE B70 · 69 ST · BAY RIDGE', true);
  const s = ((BR_ARRIVE - phase().t) % CYCLE + CYCLE) % CYCLE; ctx.hud?.toast?.(`69th St ferry landing, Bay Ridge. ${phase().t >= BR_ARRIVE && phase().t < BR_LEAVE ? 'She\'s in: board at the gate' : `Next boat to Coney in ${Math.floor(s / 60)}:${String(Math.ceil(s % 60)).padStart(2, '0')}, board at the gate`}`, 3600);
}
/** up the gangway and off the landing: the B70 to 8th Ave and Soc Tav */
function toSocTav() { const { ctx, W } = F; offBarge(); F.faded = false; if (W.tavern?.arrive) W.tavern.arrive('ferry'); else ctx.hud?.toast?.('Bay Ridge', 1200); }
/** a frame on foot at the landing; returns the action button's label */
function bargeWalk(dt, w, bob) {
  const { ctx } = F, p = ctx.player, B = F.barge, inp = ctx.input, playing = ctx.state === 'playing';
  if (p.dead || (B.last && p.position.distanceTo(B.last) > TP_JUMP)) { offBarge(); return null; }   // something else moved you (a teleport, a respawn)
  let walkYaw = p.yaw; if (ctx.xr?.presenting) { _e.setFromQuaternion(ctx.camera.quaternion, 'YXZ'); walkYaw = _e.y; }
  let ix = (inp?.right ? 1 : 0) - (inp?.left ? 1 : 0), iy = (inp?.forward ? 1 : 0) - (inp?.back ? 1 : 0); if (inp?.xrMove) { ix = inp.xrMove.x; iy = inp.xrMove.y; } else if (inp?.touch?.axis && (inp.touch.axis.x || inp.touch.axis.y)) { ix = inp.touch.axis.x; iy = -inp.touch.axis.y; }
  if (playing && (ix || iy)) { const sp = (inp?.sprint ? 4.5 : 2.6) * dt / Math.max(1, Math.hypot(ix, iy)), wx = (-Math.sin(walkYaw) * iy + Math.cos(walkYaw) * ix) * sp, wz = (-Math.cos(walkYaw) * iy - Math.sin(walkYaw) * ix) * sp;
    if (onWalk(B.x + wx, B.z)) B.x += wx; if (onWalk(B.x, B.z + wz)) B.z += wz; }   // each axis on its own: slide along the rails
  if (B.x > BR_SHORE + 1.5) { toSocTav(); return null; }   // walked off the top of the gangway onto Shore Pkwy
  p.position.set(B.x, bargeY(B.x, bob), NZ + B.z); p.velocity?.set?.(0, 0, 0); B.last = (B.last || new THREE.Vector3()).copy(p.position);
  const cam = ctx.camera; cam.position.set(p.position.x, p.position.y + 1.62, p.position.z); cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ'); p.cameraPosition?.copy?.(cam.position);
  const atShore = B.x > BR_SHORE - SHORE_R, atGate = Math.hypot(B.x - GATE.x, B.z - GATE.z) < GATE_R, docked = !!w.bayRidge;
  if (playing && inp?.pressed?.has?.('KeyF')) { inp.pressed.delete('KeyF');
    if (atShore) { toSocTav(); return null; }
    if (atGate && docked) { offBarge(); mount(0, 8.5); F.ctx.hud?.toast?.('Aboard for Coney Island. F at the Coney landing to get off', 2600); return null; }
    ctx.hud?.toast?.(atGate ? `Next boat to Coney in ${untilLeave(BR_ARRIVE)} s` : 'Soc Tav: up the gangway at the shore end · the boat: at the gate', 1800); }
  return atShore ? 'TO SOC TAV · 69TH ST' : atGate && docked ? 'BOARD · CONEY ISLAND' : null;
}
function fade(text, on) {
  F.faded = on; const f = document.querySelector('.hgfade'), fl = document.querySelector('.hgfloor'); if (!f) return;
  f.classList.remove('car'); f.style.transition = 'opacity .35s'; f.style.opacity = '1'; if (fl && text) { fl.style.fontSize = '40px'; fl.textContent = text; }
  setTimeout(() => { f.style.opacity = '0'; if (fl) fl.textContent = ''; setTimeout(() => { f.style.transition = ''; if (fl) fl.style.fontSize = ''; }, 400); }, 900);
}

// ---- shared kit: every solid part is one vertex-coloured mesh, glass another, the livery a third (a boat is 4 draw calls) ------
let MAT = null;
function mats() {
  if (MAT) return MAT;
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512; const g = cv.getContext('2d');
  // row 0: the hull logo (white, navy NYC FERRY, the teal wave) · row 1: the blue landing sign · row 2: the ticket machine face · row 3: spare white
  g.fillStyle = '#f2f3f5'; g.fillRect(0, 0, 1024, 512);
  g.fillStyle = '#16b3c2'; g.beginPath(); g.moveTo(0, 112); g.bezierCurveTo(220, 60, 300, 128, 520, 100); g.lineTo(520, 128); g.lineTo(0, 128); g.fill();
  g.fillStyle = '#132a63'; g.beginPath(); g.moveTo(0, 122); g.bezierCurveTo(260, 84, 340, 128, 560, 118); g.lineTo(560, 128); g.lineTo(0, 128); g.fill();
  g.fillStyle = '#132a63'; g.font = 'italic 900 92px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('NYC FERRY', 640, 60);
  g.fillStyle = '#1f4fa0'; g.fillRect(0, 128, 1024, 128); g.fillStyle = '#16b3c2'; g.fillRect(0, 236, 1024, 20); g.fillStyle = '#fff'; g.font = '900 86px Arial'; g.fillText('NYC FERRY', 512, 186);
  g.fillStyle = '#1f5fa8'; g.fillRect(0, 256, 1024, 128); g.fillStyle = '#0b1622'; g.fillRect(560, 270, 420, 100); g.fillStyle = '#7fe0ff'; g.font = '700 44px Arial'; g.fillText('TAP HERE', 770, 320);
  g.fillStyle = '#fff'; g.font = '900 62px Arial'; g.fillText('TICKETS $4.50', 280, 320);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  MAT = { col: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15 }), glass: new THREE.MeshStandardMaterial({ color: 0x0e1a26, roughness: 0.06, metalness: 0.75 }),
    livery: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.1, emissiveMap: tex, emissive: 0x000000 }), sign: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissiveMap: tex, emissive: 0x9aa4b4 }) };
  return MAT;
}
const ROW = (r) => [1 - (r + 1) / 4, 1 - r / 4];   // an atlas row → uv v range (the canvas is upside down in v)
function kit() {
  const L = { col: [], glass: [], livery: [], sign: [] }, m = new THREE.Matrix4(), c = new THREE.Color();
  const prep = (g) => { g = g.index ? g.toNonIndexed() : g; g.applyMatrix4(m); return g; };
  const api = { m,
    /** a solid part: one colour, or a colour by local height (fy) for the hull's bands */
    col(hex, g, fy) { const y0 = fy ? (g.index ? g.toNonIndexed() : g) : null; g = prep(y0 || g); const n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { c.setHex(fy ? fy(y0.attributes.position.getY(i)) : hex); a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); L.col.push(g); },
    glass(g) { L.glass.push(prep(g)); },
    tex(which, row, g) { g = prep(g); const uv = g.attributes.uv, [v0, v1] = ROW(row); for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * (v1 - v0)); L[which].push(g); },
    box(hex, x0, y0, z0, x1, y1, z1) { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); api.col(hex, g); },
    gbox(x0, y0, z0, x1, y1, z1) { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); api.glass(g); },
    cyl(hex, x, z, y0, y1, r, seg = 10) { const g = new THREE.CylinderGeometry(r, r, y1 - y0, seg); g.translate(x, (y0 + y1) / 2, z); api.col(hex, g); },
    /** the meshes, into `parent` (shadows off on phones) */
    flush(parent, lite) { const M = mats(); for (const k of Object.keys(L)) if (L[k].length) { const mesh = new THREE.Mesh(mergeGeometries(L[k], false), M[k]); mesh.castShadow = !lite && k !== 'sign'; mesh.receiveShadow = true; mesh.userData.surface = 'metal'; parent.add(mesh); L[k].length = 0; } } };
  return api;
}
const C = { white: 0xf2f3f5, navy: 0x132a63, teal: 0x16b3c2, steel: 0xa7adb3, dark: 0x24272b, orange: 0xff6a1a, bench: 0x2f5f8a, deck: 0x9ea4aa, wood: 0x6b4a2e, grey: 0x5f666c, barge: 0x7c8389, yellow: 0xe8c32a, rubber: 0x1a1a1a, alu: 0xc4c9ce, blue: 0x1f5fa8 };

// ---- the boat ------------------------------------------------------------------------------------------------------------------
function ferryModel(lite) {
  const group = new THREE.Group(); group.name = 'nycFerry'; const k = kit(), box = k.box;
  // twin demi-hulls (a catamaran): a plan-view shape with a fine entry, extruded up, the bow raked back underwater; navy below the
  // boot top, the teal stripe, white topsides. The tunnel between them is open to the water
  const hw = 1.1, hx = BEAM / 2 - hw, band = (y) => (y < 0.3 ? C.navy : y < 0.6 ? C.teal : C.white);
  for (const s of [-1, 1]) { const sh = new THREE.Shape([[-hw, -LEN / 2], [hw, -LEN / 2], [hw, 6], [hw * 0.55, 10.5], [0.06, LEN / 2], [-0.06, LEN / 2], [-hw * 0.55, 10.5], [-hw, 6]].map(([a, b]) => new THREE.Vector2(a, b)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 2.0, steps: 8, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(s * hx, -0.5, 0);
    const pa = g.attributes.position; for (let i = 0; i < pa.count; i++) { const z = pa.getZ(i), y = pa.getY(i); if (z < -6) pa.setZ(i, z + (1.5 - y) * 0.8 * Math.min(1, (-z - 6) / 7)); }
    g.computeVertexNormals(); k.col(0, g, band); }
  box(C.white, -BEAM / 2, 1.2, -LEN / 2 + 3, BEAM / 2, 1.5, LEN / 2);                                    // the main deck across both hulls
  box(C.rubber, -BEAM / 2 - 0.12, 1.18, -LEN / 2 + 3.5, -BEAM / 2, 1.4, LEN / 2); box(C.rubber, BEAM / 2, 1.18, -LEN / 2 + 3.5, BEAM / 2 + 0.12, 1.4, LEN / 2); box(C.rubber, -BEAM / 2, 1.18, LEN / 2, BEAM / 2, 1.4, LEN / 2 + 0.12);   // the fender strake
  for (const s of [-1, 1]) { const pl = new THREE.PlaneGeometry(4.6, 0.57); pl.rotateY(s * Math.PI / 2); pl.translate(s * (BEAM / 2 + 0.005), 0.885, 2); k.tex('livery', 0, pl); }   // NYC FERRY on the hull, both sides
  // the main cabin: white, a navy skirt with the teal line, a band of big tinted windows split by white mullions, a raked glass front
  box(C.white, -3.6, 1.5, -8, 3.6, DECK2 - 0.05, 9); box(C.deck, -3.75, DECK2 - 0.1, -8.3, 3.75, DECK2, 9.6);
  for (const s of [-1, 1]) { box(C.navy, s * 3.6 - 0.03, 1.5, -8, s * 3.6 + 0.03, 1.85, 9); box(C.teal, s * 3.6 - 0.035, 1.85, -8, s * 3.6 + 0.035, 1.95, 9);
    k.gbox(s * 3.6 - 0.04, 2.1, -7.6, s * 3.6 + 0.04, 3.55, 8.6); for (let z = -7.6; z <= 8.7; z += 1.63) box(C.white, s * 3.6 - 0.06, 2.1, z - 0.07, s * 3.6 + 0.06, 3.55, z + 0.07); }
  { const g = new THREE.BoxGeometry(6.8, 1.9, 0.08); g.rotateX(0.35); g.translate(0, 2.75, -8.25); k.glass(g); }
  k.gbox(-1.4, 1.5, 8.95, 1.4, 3.6, 9.05); box(C.white, -1.45, 3.6, 8.94, 1.45, 3.7, 9.06);   // the doors aft
  box(C.white, -3.6, 1.5, -LEN / 2 + 3, 3.6, 2.4, -LEN / 2 + 3.3); for (let x = -3.4; x <= 3.4; x += 1.7) box(C.steel, x - 0.04, 1.5, -LEN / 2 + 3, x + 0.04, 2.5, -LEN / 2 + 3.08);   // bow bulwark and the boarding gate posts
  for (const s of [-1, 1]) { box(C.white, s * 2.8 - 0.4, 1.5, LEN / 2 - 2.5, s * 2.8 + 0.4, 2.3, LEN / 2 - 1.1); k.cyl(C.white, s * 2.8, LEN / 2 - 0.6, 1.5, 2.2, 0.35, 12); }   // stern lockers, life-raft canisters
  // the upper deck: railings, benches, the wheelhouse forward with its windscreen, a radar mast and nav lights
  for (const s of [-1, 1]) { box(C.steel, s * 3.7 - 0.05, DECK2 + 1.0, -8.2, s * 3.7 + 0.05, DECK2 + 1.1, 9.5); box(C.steel, s * 3.7 - 0.025, DECK2 + 0.5, -8.2, s * 3.7 + 0.025, DECK2 + 0.55, 9.5);
    for (let z = -8; z <= 9.5; z += 1.25) box(C.steel, s * 3.7 - 0.035, DECK2, z - 0.035, s * 3.7 + 0.035, DECK2 + 1.0, z + 0.035); }
  box(C.steel, -3.7, DECK2 + 1.0, 9.45, 3.7, DECK2 + 1.1, 9.55); for (let x = -3.6; x <= 3.6; x += 1.2) box(C.steel, x - 0.035, DECK2, 9.465, x + 0.035, DECK2 + 1.0, 9.535);
  for (const z of BENCH_Z) for (const s of [-1, 1]) { box(C.bench, s * BENCH_X - 0.9, DECK2 + 0.42, z, s * BENCH_X + 0.9, DECK2 + 0.5, z + 0.45); box(C.bench, s * BENCH_X - 0.9, DECK2 + 0.5, z + 0.4, s * BENCH_X + 0.9, DECK2 + 0.95, z + 0.48); box(C.dark, s * BENCH_X - 0.05, DECK2, z + 0.1, s * BENCH_X + 0.05, DECK2 + 0.42, z + 0.35); }
  box(C.white, -2.6, DECK2, -8, 2.6, DECK2 + 2.3, -3.8); k.gbox(-2.5, DECK2 + 1.2, -8.06, 2.5, DECK2 + 2.0, -7.95); for (const s of [-1, 1]) k.gbox(s * 2.6 - 0.02, DECK2 + 1.2, -7.6, s * 2.6 + 0.02, DECK2 + 2.0, -4.2);
  box(C.teal, -2.62, DECK2 + 0.95, -8.02, 2.62, DECK2 + 1.05, -3.78);
  box(C.navy, -2.7, DECK2 + 2.3, -8.2, 2.7, DECK2 + 2.45, -3.6); box(C.steel, -0.06, DECK2 + 2.45, -6.1, 0.06, DECK2 + 4.4, -5.9); box(C.dark, -0.9, DECK2 + 3.6, -6.1, 0.9, DECK2 + 3.75, -5.9);
  box(0xd02020, -2.72, DECK2 + 1.5, -6.2, -2.62, DECK2 + 1.7, -5.9); box(0x20b040, 2.62, DECK2 + 1.5, -6.2, 2.72, DECK2 + 1.7, -5.9); box(C.white, -0.1, DECK2 + 4.4, -6.1, 0.1, DECK2 + 4.55, -5.9);   // port red, starboard green, masthead
  for (const s of [-1, 1]) { const ring = new THREE.TorusGeometry(0.3, 0.07, 6, 14); ring.rotateY(Math.PI / 2); ring.translate(s * 3.78, DECK2 + 0.55, 4); k.col(C.orange, ring); }   // lifebuoys hung on the rails, facing out
  // the bar: a counter along the back of the wheelhouse (wood top, navy front), the bartender's alley behind it, a shelf of bottles and a
  // lit sign on the wheelhouse wall, stools in front
  box(C.navy, -2.5, DECK2, -2.75, 0.5, DECK2 + 1.0, -2.3); box(C.wood, -2.55, DECK2 + 1.0, -2.8, 0.55, DECK2 + 1.07, -2.25);
  box(C.wood, -2.4, DECK2 + 1.2, -3.8, 0.4, DECK2 + 1.24, -3.62); box(C.wood, -2.4, DECK2 + 1.6, -3.8, 0.4, DECK2 + 1.64, -3.62);
  { const cols = [0x2f6b2a, 0x6a3a14, 0xc9d7d6]; for (let i = 0; i < 14; i++) k.cyl(cols[i % 3], -2.25 + (i % 7) * 0.38, -3.71, DECK2 + (i < 7 ? 1.24 : 1.64), DECK2 + (i < 7 ? 1.5 : 1.9), 0.035, 8); }
  for (let i = 0; i < 3; i++) { k.cyl(C.wood, -1.9 + i, -1.95, DECK2 + 0.72, DECK2 + 0.78, 0.19, 12); k.cyl(C.steel, -1.9 + i, -1.95, DECK2, DECK2 + 0.75, 0.04, 6); }
  k.flush(group, lite);
  { const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#132a63'; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#16b3c2'; g.lineWidth = 8; g.strokeRect(6, 6, 500, 116);
    g.fillStyle = '#ffd36a'; g.font = '900 64px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BAR', 160, 66); g.fillStyle = '#fff'; g.font = '700 30px Arial'; g.fillText('TALLBOYS $3', 360, 66);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.48), new THREE.MeshBasicMaterial({ map: t })); sign.position.set(-1, DECK2 + 2.0, -3.79); group.add(sign); }
  return { group };
}
/** the wake: a V of foam trailing the sterns, on the water (its opacity follows the speed) */
function wake() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
  for (let i = 0; i < 900; i++) { const v = Math.random(), spread = 0.18 + v * 0.8, side = Math.random() < 0.5 ? -1 : 1, edge = Math.random() < 0.6;
    const u = edge ? 0.5 + side * spread * 0.5 * (0.92 + Math.random() * 0.08) : 0.5 + (Math.random() - 0.5) * (0.25 + v * 0.3);   // the two arms of the V, and the churned middle
    g.fillStyle = `rgba(255,255,255,${(1 - v) * (edge ? 0.5 : 0.35)})`; g.beginPath(); g.arc(u * 128, v * 256, 1.5 + Math.random() * 3, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(26, 46); geo.rotateX(-Math.PI / 2); geo.translate(0, -0.42, LEN / 2 + 23);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.6 })); m.name = 'ferryWake'; m.renderOrder = 2; m.visible = false; return m;
}

// ---- the landings -------------------------------------------------------------------------------------------------------------
/** a floating steel barge (local: L long in z, the shore end at −z, the berth on +x, deck at y 0) with its canopy, signs, gangways,
 * bollards, ticket machine, queue rail and a countdown board; o: { x, y, z, ry, L, shore: { len, rise }, name, dest, leave, lite, world?, parent? }.
 * With `world` (the Coney one, ry 0) the deck, the gangway and the rails are walkable / solid. Returns the board (repainted by paintBoards) */
function terminal(parent, o) {
  const k = kit(), L = o.L, H = L / 2, w = BW / 2, box = k.box, root = new THREE.Group(); root.name = 'ferryLanding'; root.position.set(o.x, o.y, o.z); root.rotation.y = o.ry; parent.add(root);
  box(C.grey, -w, -1.3, -H, w, -0.05, H); box(C.barge, -w + 0.05, -0.05, -H + 0.05, w - 0.05, 0, H - 0.05);
  for (const s of [-1, 1]) { box(C.yellow, s * w - 0.12 * (s + 1) / 2, 0, -H, s * w + 0.12 * (1 - s) / 2, 0.02, H); }   // safety edges
  box(C.navy, -w - 0.02, -0.6, -H, -w, -0.3, H); box(C.navy, w, -0.6, -H, w + 0.02, -0.3, H);
  // rails: the far side and the ends, the berth side too except the boarding gate; the shore end open for the gangway
  const rail = (x0, z0, x1, z1) => { box(C.steel, x0 - 0.04, 1.0, z0 - 0.04, x1 + 0.04, 1.08, z1 + 0.04); box(C.steel, x0 - 0.02, 0.5, z0 - 0.02, x1 + 0.02, 0.54, z1 + 0.02);
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 2)); for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n; box(C.steel, x - 0.04, 0, z - 0.04, x + 0.04, 1.05, z + 0.04); } };
  const gate = -6, rails = [[-w + 0.1, -H + 0.1, -w + 0.1, H - 0.1], [w - 0.1, -H + 0.1, w - 0.1, gate - 1.5], [w - 0.1, gate + 1.5, w - 0.1, H - 0.1], [-w + 0.1, H - 0.1, w - 0.1, H - 0.1], [-w + 0.1, -H + 0.1, -1.2, -H + 0.1], [1.2, -H + 0.1, w - 0.1, -H + 0.1]];
  for (const r of rails) rail(...r);
  for (let z = -H + 3; z < H - 1; z += 8) for (const s of [-1, 1]) { k.cyl(0x2a2d31, s * (w - 0.45), z, 0, 0.45, 0.17, 10); k.cyl(0x2a2d31, s * (w - 0.45), z, 0.45, 0.55, 0.24, 10); k.cyl(C.rubber, s * (w + 0.22), z + 4, -1.3, 0.25, 0.22, 8); }   // bollards, fenders
  for (const [x, z] of [[-w + 0.6, -H - 0.6], [w - 0.6, -H - 0.6], [-w + 0.6, H + 0.6], [w - 0.6, H + 0.6]]) k.cyl(0x4a5056, x, z, -5, 5.5, 0.32, 12);   // guide piles at the ends
  // the canopy: posts, a white soffit, a navy roof, the blue NYC FERRY fascia on all four sides; benches under it
  const cH = Math.min(11, H - 3); for (const z of [-cH + 0.5, 0, cH - 0.5]) for (const s of [-1, 1]) box(C.white, s * (w - 1) - 0.08, 0, z - 0.08, s * (w - 1) + 0.08, 3.0, z + 0.08);
  box(0xe9ecef, -w + 0.4, 2.95, -cH, w - 0.4, 3.0, cH); box(C.navy, -w + 0.5, 3.0, -cH + 0.1, w - 0.5, 3.4, cH - 0.1);
  for (const s of [-1, 1]) { const f = new THREE.PlaneGeometry(cH * 2, 0.6); f.rotateY(s * Math.PI / 2); f.translate(s * (w - 0.38), 3.15, 0); k.tex('sign', 1, f); const e = new THREE.PlaneGeometry(BW - 0.8, 0.6); if (s > 0) e.rotateY(Math.PI); e.translate(0, 3.15, -s * (cH + 0.02)); k.tex('sign', 1, e); }
  for (const z of [-3, 3]) { box(C.wood, -w + 0.5, 0.45, z - 1.2, -w + 1.0, 0.5, z + 1.2); box(C.steel, -w + 0.7, 0, z - 0.05, -w + 0.8, 0.45, z + 0.05); }
  // ticket machine by the shore gate, the queue rail (stanchions and navy belts) leading to the boarding gate
  box(C.blue, -w + 0.6, 0, -H + 3, -w + 1.3, 1.75, -H + 4); { const f = new THREE.PlaneGeometry(1, 0.5); f.rotateY(Math.PI / 2); f.translate(-w + 1.31, 1.3, -H + 3.5); k.tex('sign', 2, f); }
  const posts = []; for (let z = gate - 5; z <= gate + 3; z += 2) posts.push([w - 2.2, z], [w - 3.4, z]);
  for (const [x, z] of posts) { k.cyl(C.steel, x, z, 0, 0.95, 0.03, 6); k.cyl(C.dark, x, z, 0, 0.03, 0.16, 10); }
  for (const x of [w - 2.2, w - 3.4]) box(C.navy, x - 0.02, 0.82, gate - 5, x + 0.02, 0.92, gate + 3);
  // the boarding gangway up to the boat's main deck, and the shore gangway (aluminium, rails both sides)
  { const g = new THREE.BoxGeometry(2.6, 0.12, 1.6); g.rotateZ(Math.atan2(BOARD_RISE, 2.6)); g.translate(w + 0.2, BOARD_RISE / 2, gate); k.col(C.alu, g); }
  const S = o.shore, ang = Math.atan2(S.rise, S.len), sl = Math.hypot(S.len, S.rise);
  { const g = new THREE.BoxGeometry(2.2, 0.12, sl); g.rotateX(ang); g.translate(0, S.rise / 2 - 0.06, -H - S.len / 2); k.col(C.alu, g);
    for (const s of [-1, 1]) { const r = new THREE.BoxGeometry(0.06, 0.06, sl); r.rotateX(ang); r.translate(s * 1.1, S.rise / 2 + 1.0, -H - S.len / 2); k.col(C.steel, r); } }
  // the countdown board: under the canopy at the shore end (both faces) and up on a post at the top of the gangway
  const bc = document.createElement('canvas'); bc.width = 1024; bc.height = 384; const bt = new THREE.CanvasTexture(bc); bt.colorSpace = THREE.SRGBColorSpace; bt.anisotropy = 4;
  const bm = new THREE.MeshBasicMaterial({ map: bt, toneMapped: false }), bg = [];
  { const a = new THREE.PlaneGeometry(3.2, 1.2); a.rotateY(Math.PI); a.translate(0, 2.2, -cH + 0.37); bg.push(a); const b = new THREE.PlaneGeometry(3.2, 1.2); b.translate(0, 2.2, -cH + 0.48); bg.push(b);
    const c = new THREE.PlaneGeometry(3.2, 1.2); c.rotateY(Math.PI); c.translate(0, S.rise + 3.2, -H - S.len - 1.67); bg.push(c); }
  box(C.dark, -1.7, 1.55, -cH + 0.38, 1.7, 2.85, -cH + 0.47); box(C.dark, -1.7, S.rise + 2.55, -H - S.len - 1.55, 1.7, S.rise + 3.85, -H - S.len - 1.65); for (const s of [-1, 1]) box(C.steel, s * 1.75 - 0.08, S.rise, -H - S.len - 1.68, s * 1.75 + 0.08, S.rise + 3.85, -H - S.len - 1.52);
  const board = new THREE.Mesh(mergeGeometries(bg.map((g) => g.toNonIndexed()), false), bm); board.name = 'ferryBoard'; root.add(board);
  // the landing's name on a blue board over the shore gate
  { const c = document.createElement('canvas'); c.width = 1024; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#1f4fa0'; g.fillRect(0, 0, 1024, 128); g.fillStyle = '#16b3c2'; g.fillRect(0, 112, 1024, 16); g.fillStyle = '#fff'; g.font = '900 60px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(o.name, 512, 60);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const n = new THREE.Mesh(new THREE.PlaneGeometry(BW - 0.8, 0.8), new THREE.MeshBasicMaterial({ map: t, toneMapped: false })); n.rotation.y = Math.PI; n.position.set(0, 3.85, -cH - 0.1); root.add(n);
    const n2 = n.clone(); n2.rotation.y = 0; n2.position.z = -cH - 0.05; root.add(n2); box(C.navy, -w + 0.4, 3.4, -cH - 0.09, w - 0.4, 4.3, -cH - 0.06); }
  k.flush(root, o.lite);
  // walkable: the deck, the gangway as shallow steps, rails as colliders (Coney only: the Bay Ridge one is walked by bargeWalk)
  if (o.world) { const X = o.x, Y = o.y, Z = o.z, wd = o.world;
    wd.walkable([X - w, Y - 1.3, Z - H], [X + w, Y, Z + H]);
    const n = 8; for (let i = 0; i < n; i++) { const z0 = Z - H - S.len + i * S.len / n, top = Y + S.rise * (1 - (i + 0.5) / n); wd.walkable([X - 1.1, top - 1.5, z0], [X + 1.1, top, z0 + S.len / n + 0.01]); }
    for (const s of [-1, 1]) wd.box([X + s * 1.15 - 0.05, Y, Z - H - S.len], [X + s * 1.15 + 0.05, Y + S.rise + 1.1, Z - H]);
    for (const [x0, z0, x1, z1] of rails) wd.box([X + Math.min(x0, x1) - 0.06, Y, Z + Math.min(z0, z1) - 0.06], [X + Math.max(x0, x1) + 0.06, Y + 1.1, Z + Math.max(z0, z1) + 0.06]);
    wd.box([X + w - 0.1, Y, Z + gate - 1.5], [X + w + 0.06, Y + 1.1, Z + gate + 1.5]);   // the gate: you board with F, not by walking off the edge
    wd.box([X - w + 0.6, Y, Z - H + 3], [X - w + 1.3, Y + 1.75, Z - H + 4]); }
  const B = { root, canvas: bc, tex: bt, dest: o.dest, leave: o.leave, text: '', key: '' }; return B;
}
/** the countdown boards: NEXT FERRY TO … m:ss off the timetable (BOARDING while she's in), repainted when the text changes */
function paintBoards(force) {
  const p = F.ctx.player?.position, ph = phase();
  for (const B of F.boards) {
    const s = untilLeave(B.leave), atDock = B.leave === DOCK_UNTIL ? ph.docked : ph.t >= BR_ARRIVE && ph.t < BR_LEAVE, mm = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    B.text = `NEXT FERRY TO ${B.dest}  ${mm}`;
    B.root.updateMatrixWorld(); const near = p && B.root.visible && (!B.root.parent || B.root.parent.visible) && p.distanceTo(_fw.setFromMatrixPosition(B.root.matrixWorld)) < BOARD_NEAR;
    if (!force && !near) continue; const key = B.text + atDock; if (key === B.key) continue; B.key = key;
    const g = B.canvas.getContext('2d'); g.fillStyle = '#07090b'; g.fillRect(0, 0, 1024, 384); g.strokeStyle = '#1f4fa0'; g.lineWidth = 14; g.strokeRect(7, 7, 1010, 370);
    g.fillStyle = '#1f4fa0'; g.fillRect(14, 14, 996, 78); g.fillStyle = '#fff'; g.font = '900 52px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('NYC FERRY · SOUTH BROOKLYN', 512, 54);
    g.fillStyle = '#ffb21a'; g.font = '800 64px Arial'; g.textAlign = 'left'; g.fillText('NEXT FERRY TO', 44, 150); g.fillText(B.dest, 44, 230);
    g.textAlign = 'right'; g.font = '900 150px "Courier New", monospace'; g.fillText(mm, 990, 196);
    g.textAlign = 'center'; g.font = '800 52px Arial'; g.fillStyle = atDock ? '#5fe07a' : '#cfd6de'; g.fillText(atDock ? 'NOW BOARDING · ALL ABOARD' : 'ON TIME · BOARDING AT THE GATE', 512, 330);
    B.tex.needsUpdate = true; }
}
// ---- the Narrows: built the first time anyone rides ------------------------------------------------------------------------------
function buildNarrows(world) {
  const { scene, ctx } = world, lite = !!ctx.lite, root = new THREE.Group(); root.name = 'narrows'; root.position.set(0, 0, NZ); scene.add(root);
  (world.W.zones || (world.W.zones = [])).push({ x0: -4000, x1: 4000, z0: NZ - 3500, z1: NZ + 3500, name: 'THE NARROWS', hint: 'NYC Ferry · back to the pier' });
  const S = (c, r = 0.8, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const M = { water: S(0x2a4f5c, 0.18, 0.2), steel: S(0x9ca6a3, 0.55, 0.45), concrete: S(0xb7b2a6, 0.9), land: S(0x46553a, 0.95), sand: S(0xb9a98a, 0.95), bldg: S(0xa59a88, 0.85), cable: S(0x8d9693, 0.5, 0.6),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffe2a0, emissiveIntensity: 1.6 }) };
  const G = new Map(), put = (m, g) => (G.get(m) || G.set(m, []).get(m)).push(g.index ? g.toNonIndexed() : g);
  const box = (m, x0, y0, z0, x1, y1, z1) => { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); put(m, g); };
  { const g = new THREE.PlaneGeometry(9000, 9000); g.rotateX(-Math.PI / 2); put(M.water, g); }
  // the shores: Staten Island west (Fort Wadsworth's green bluff), Bay Ridge east (the Shore Pkwy, low brick blocks)
  box(M.land, -5000, -2, -4000, -950, 14, 4000); box(M.sand, -980, -2, -4000, -930, 3, 4000); box(M.land, 950, -2, -4000, 5000, 8, 4000); box(M.concrete, 930, -2, -4000, 980, 3, 4000);
  const rnd = mulberry(91), blocks = []; for (let i = 0; i < (lite ? 120 : 320); i++) { const x = 1000 + rnd() * 1800, z = -2400 + rnd() * 4800; blocks.push([x, z, 14 + rnd() * 20, 8 + rnd() * 14 + (rnd() < 0.1 ? 30 : 0), 14 + rnd() * 18]); }
  { const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), im = new THREE.InstancedMesh(unit, M.bldg, blocks.length), o = new THREE.Object3D(), c = new THREE.Color();
    blocks.forEach(([x, z, w, h, d], i) => { o.position.set(x, 8, z); o.scale.set(w, h, d); o.updateMatrix(); im.setMatrixAt(i, o.matrix); c.setHSL(0.05 + rnd() * 0.05, 0.25, 0.35 + rnd() * 0.25); im.setColorAt(i, c); }); root.add(im); }
  { const cone = new THREE.ConeGeometry(5, 12, 7).translate(0, 6, 0), im = new THREE.InstancedMesh(cone, S(0x2f4a28, 1), lite ? 150 : 400), o = new THREE.Object3D();
    for (let i = 0; i < im.count; i++) { o.position.set(-1000 - rnd() * 2500, 14, -3000 + rnd() * 6000); o.scale.setScalar(0.8 + rnd() * 0.8); o.updateMatrix(); im.setMatrixAt(i, o.matrix); } root.add(im); }
  // the bridge: the span along x, towers at ±649, the deck ~66 m up with a gentle crown, side spans to the anchorages at ±1150
  const TX = 649, DW = 31, TOP = 211, deckY = (x) => Math.abs(x) <= TX ? 62 + 8 * (1 - (x / TX) ** 2) : 62 - (Math.abs(x) - TX) / (1150 - TX) * 14;
  for (let x = -1150; x < 1150; x += 25) { const y0 = deckY(x), y1 = deckY(x + 25), g = new THREE.BoxGeometry(25.4, 7, DW); g.rotateZ(Math.atan2(y1 - y0, 25)); g.translate(x + 12.5, (y0 + y1) / 2 - 3.5, 0); put(M.steel, g); }
  for (const tx of [-TX, TX]) { for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(9, TOP, 8, 1, 1, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * 0.65); p.setZ(i, p.getZ(i) * 0.7); } g.translate(tx, TOP / 2, s * (DW / 2 + 1)); put(M.steel, g); }
    for (const y of [70, 120, 165, 205]) box(M.steel, tx - 3, y - 3, -DW / 2, tx + 3, y + 3, DW / 2);
    box(M.concrete, tx - 14, -6, -DW / 2 - 10, tx + 14, 6, DW / 2 + 10); }
  for (const ax of [-1170, 1170]) box(M.concrete, ax - 30, 0, -DW / 2 - 12, ax + 30, 60, DW / 2 + 12);
  // the 69th St landing in Bay Ridge: the barge off the Shore Pkwy bulkhead (a gangway up to it), the boat at its north berth, a spare
  // laid up further along, the ferry shed with its sign on the bulkhead
  F.brTerm = terminal(root, { x: BR.x, y: BR.y, z: BR.z, ry: -Math.PI / 2, L: BR.L, shore: { len: BR_SHORE - (BR.x + BR.L / 2), rise: BR_TOP - BR.y }, name: '69 ST · BAY RIDGE', dest: 'CONEY ISLAND', leave: BR_LEAVE, lite }); F.boards.push(F.brTerm);
  const spare = F.coney.parked.clone(); spare.position.set(BR.parkX, 0.45, BR.boatZ); spare.rotation.set(0, -Math.PI / 2, 0); root.add(spare); root.userData.parked = spare;
  box(M.bldg, BR_SHORE + 4, BR_TOP, -906, BR_SHORE + 18, BR_TOP + 4, -894); box(M.steel, BR_SHORE + 3, BR_TOP + 4, -907, BR_SHORE + 19, BR_TOP + 4.4, -893);
  { const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d'); g.fillStyle = '#1f4fa0'; g.fillRect(0, 0, 512, 96); g.fillStyle = '#fff'; g.font = '900 44px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('NYC FERRY · BAY RIDGE', 256, 50);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 2), new THREE.MeshBasicMaterial({ map: t })); sign.rotation.y = -Math.PI / 2; sign.position.set(BR_SHORE + 3.9, BR_TOP + 2.2, -900); root.add(sign); }
  // main cables: a catenary over the main span, down to the anchorages; suspenders every 15 m
  const sus = [], lamps = [];
  for (const s of [-1, 1]) { const zc = s * (DW / 2 + 1), pts = [];
    for (let x = -1150; x <= 1150; x += 25) { const y = Math.abs(x) <= TX ? deckY(x) + 4 + (TOP - 6 - deckY(x) - 4) * (x / TX) ** 2 : TOP - 6 - (Math.abs(x) - TX) / (1150 - TX) * (TOP - 66); pts.push(new THREE.Vector3(x, y, zc)); }
    put(M.cable, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.6, 6, false));
    for (let x = -1140; x <= 1140; x += 15) { if (Math.abs(Math.abs(x) - TX) < 8) continue; const y = Math.abs(x) <= TX ? deckY(x) + 4 + (TOP - 6 - deckY(x) - 4) * (x / TX) ** 2 : TOP - 6 - (Math.abs(x) - TX) / (1150 - TX) * (TOP - 66); sus.push(x, y, zc, x, deckY(x), zc); }
    for (let x = -1140; x <= 1140; x += 30) { const y = Math.abs(x) <= TX ? deckY(x) + 4 + (TOP - 6 - deckY(x) - 4) * (x / TX) ** 2 : TOP - 6 - (Math.abs(x) - TX) / (1150 - TX) * (TOP - 66); lamps.push([x, y + 0.8, zc]); } }
  { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(sus, 3)); root.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x7d8784 }))); }
  const lampIM = new THREE.InstancedMesh(new THREE.SphereGeometry(1.1, 8, 6), M.lamp, lamps.length), o = new THREE.Object3D(); lamps.forEach(([x, y, z], i) => { o.position.set(x, y, z); o.updateMatrix(); lampIM.setMatrixAt(i, o.matrix); }); root.add(lampIM);
  for (const [m, list] of G) { const mesh = new THREE.Mesh(mergeGeometries(list, false), m); mesh.castShadow = false; mesh.receiveShadow = m !== M.water; root.add(mesh); }
  world.updaters.push(() => { if (root.visible) lampIM.visible = !!world.W.night || (world.W.lampK || 0) > 0.2; });
  console.log('[ferry] the Narrows built');
  return root;
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
