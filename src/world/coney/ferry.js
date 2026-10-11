// CONEY — the NYC Ferry. A white-and-navy catamaran ties up at the head of the fishing pier on the wall clock (everyone online sees
// the same boat at the same moment): it waits, backs off and swings round, runs out to sea, and (for whoever's aboard) the
// picture fades to the Narrows — a separate area far off the map with the Verrazzano-Narrows Bridge at full size (two 211 m
// towers 1298 m apart, the deck ~66 m up, main cables, suspenders, anchorages, a lit necklace at night), Staten Island and
// Bay Ridge either side. It runs up under the bridge, swings round and back under, fades, and comes in to the pier again.
// F on the pier while it's in: board (you stand at the stern rail, look around freely; you turn with the boat); F when it's
// tied up again: off onto the pier. The Narrows are built the first time anyone rides (nothing to load until then). CONEY agent.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hangkit as K } from '../hangkit.js';
import { TZ } from './tavern.js';
import { buildPerson, peopleReady } from '../people.js';

const CYCLE = 240, DOCK_UNTIL = 40, OUT_UNTIL = 70, BR_ARRIVE = 118, BR_LEAVE = 140, NARROWS_UNTIL = 190, IN_UNTIL = 225;   // s on the wall clock: Coney 0..40 (and 225..240), Bay Ridge 118..140
const OUT_Z = 650;                                   // how far out to sea the boat runs before the Narrows (world z)
const NZ = 30000;                                   // the Narrows area: world z offset
// the run up the Narrows (local x, z): in from the sea, under the bridge, up the Brooklyn side to the 69th St pier in Bay Ridge
const NP = [[300, 700], [300, -300], [420, -650], [600, -860], [700, -890], [875, -890]].map(([x, z]) => new THREE.Vector3(x, 0, z));
const BAR = new THREE.Vector3(-2.9, 0, -2.6), DECK_X = 3.3, DECK_Z0 = -3.4, DECK_Z1 = 9.2;   // the bar on the upper deck; where you can walk
const LEN = 26, BEAM = 8.5, DECK2 = 3.95;           // the boat: length, beam, upper deck height
let F = null;

export function buildFerry(world) {
  const { ctx, W, scene } = world; const P = W.pier || { x: -361, x1: -355.5, z1: 500 };
  const dock = { x: P.x1 + 0.6 + BEAM / 2, z: Math.min(P.z1 - LEN / 2 - 6, 470) };
  F = { world, ctx, W, dock, path: new THREE.CatmullRomCurve3(NP), lx: 0, lz: 8.5, boat: ferryModel(!!ctx.lite), aboard: false, yawPrev: 0, narrows: null, phaseName: '', faded: null, spotPos: new THREE.Vector3(P.x1 - 1.2, 0.3, dock.z) };
  scene.add(F.boat.group);
  // the pier past the beach is its own little zone (the map stops at the waterline), so you can walk out to the head and the boat
  (W.zones || (W.zones = [])).push({ x0: Math.min(P.x0 ?? P.x - 5.5, dock.x) - 30, x1: dock.x + BEAM / 2 + 1, z0: 370, z1: P.z1 + 3, name: 'STEEPLECHASE PIER', hint: 'NYC Ferry at the head' });
  const nextIn = () => { const t = phase().t; return Math.ceil((t >= IN_UNTIL ? CYCLE : IN_UNTIL) - t); }, mmss = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  K.spot({ pos: F.spotPos, r: 6, dy: 2.5, when: () => !F.aboard, prompt: () => phase().docked ? `F — BOARD THE NYC FERRY · BAY RIDGE / SOC TAV${phase().t < DOCK_UNTIL ? ` (leaves in ${Math.ceil(DOCK_UNTIL - phase().t)} s)` : ''}` : `NYC FERRY — next boat in ${mmss(nextIn())}`, act: () => { if (phase().docked) board(); else ctx.hud?.toast?.(`Next NYC Ferry in ${mmss(nextIn())} — wait on the pier`, 1800); } });
  // 8th Ave & 60th (Soc Tav's B70 stop): the way back — the bus down to 69th St and the ferry home
  K.spot({ pos: new THREE.Vector3(-12, 0.15, TZ.oz + 7.6), r: 3.5, dy: 2, prompt: 'F — B70 + NYC FERRY BACK TO CONEY ISLAND', act: () => { fade('69 ST · BAY RIDGE → CONEY ISLAND', true); setTimeout(() => { fade('', false); ctx.player.teleport(F.spotPos.x, 0.3, F.spotPos.z, Math.PI / 2, 0); ctx.hud?.toast?.('NYC Ferry from Bay Ridge — Coney Island, Steeplechase Pier', 2600); }, 400); } });
  (W.mapPOIs || (W.mapPOIs = [])).push({ name: 'NYC FERRY', x: dock.x, z: dock.z, kind: 'transit' });
  ctx.bus.on('playerDied', () => { if (F.aboard) leave(false); });
  world.updaters.push((dt) => update(dt));
  // net.js: where you stand on the deck (sent with your state) and a friend's deck spot → the world on our copy of the boat
  ctx.ferry = { local: () => (F.aboard ? [+F.lx.toFixed(2), +F.lz.toFixed(2)] : null),
    toWorld: (lx, lz, out) => { const w = where(phase().t); if (w.narrows && !F.aboard) return null; F.boat.group.updateMatrixWorld(); return out.set(lx, DECK2, lz).applyMatrix4(F.boat.group.matrixWorld); } };
  // passengers: a few on the benches, two at the stern rail, one by the bar — they ride the boat (children of it); added once the
  // people models are in, animated only while you're near
  const crew = [], seats = ctx.lite ? [[2.2, -0.9, Math.PI, 'sit'], [-2.2, 4, 0, 'sit'], [1.6, 9.0, 0, 'stand']] : [[2.2, -0.9, Math.PI, 'sit'], [-2.2, 2.3, Math.PI, 'sit'], [2.2, 5.5, 0, 'sit'], [-2.2, 7.1, 0, 'sit'], [1.6, 9.0, 0, 'stand'], [-1.2, 9.0, 0.3, 'stand'], [-1.75, -2.6, -Math.PI / 2, 'stand']];
  const addCrew = () => { if (crew.length || !peopleReady()) return; seats.forEach(([x, z, yaw, pose], i) => { try { const f = buildPerson({ seed: 300 + i * 17, pose: pose === 'sit' ? 'sit' : undefined }); f.group.position.set(x, DECK2 + (pose === 'sit' ? 0.02 : 0), z); f.group.rotation.y = yaw; F.boat.group.add(f.group); crew.push(f); if (i === seats.length - 1) f.mood = 'talk'; } catch (e) { console.warn('[ferry] passenger', e); } }); };
  world.updaters.push((dt) => { addCrew(); const P = ctx.player?.position; if (!crew.length || !P || !F.boat.group.visible || F.boat.group.position.distanceTo(P) > 90) return; for (const f of crew) f.update(dt, 0); });
  if (typeof window !== 'undefined' && window.__game) window.__game.ferry = { state: () => ({ ...phase(), aboard: F.aboard, pos: F.boat.group.position.toArray().map((v) => +v.toFixed(1)) }), skew: (t) => { F.skew = t - ((Date.now() / 1000) % CYCLE); }, board: () => board(), leave: () => leave(true), dock };
}

// ---- the timetable -------------------------------------------------------------------------------------------------------------
function phase() { const t = (((Date.now() / 1000) + (F.skew || 0)) % CYCLE + CYCLE) % CYCLE; return { t, docked: t < DOCK_UNTIL || t >= IN_UNTIL, narrows: t >= OUT_UNTIL && t < NARROWS_UNTIL }; }
const ease = (k) => k * k * (3 - 2 * k);
/** where the boat is at clock time t: { x, z, h (heading, bow −z = 0), narrows } */
function where(t) {
  const D = F.dock;
  if (t < DOCK_UNTIL || t >= IN_UNTIL) return { x: D.x, z: D.z, h: 0 };   // tied up, bow to the beach
  if (t < OUT_UNTIL) { const k = (t - DOCK_UNTIL) / (OUT_UNTIL - DOCK_UNTIL), back = Math.min(1, k / 0.35);   // back off, swing round, run out
    const z = D.z + ease(back) * 30 + Math.max(0, k - 0.35) / 0.65 * (OUT_Z - D.z - 30) * (0.6 + 0.4 * ease(Math.max(0, k - 0.35) / 0.65)); return { x: D.x + Math.sin(back * Math.PI) * 12, z, h: ease(Math.min(1, k / 0.45)) * Math.PI }; }
  if (t < NARROWS_UNTIL) {   // up to Bay Ridge, tie up, and back down the same way
    const back = t >= BR_LEAVE, u = t < BR_ARRIVE ? ease((t - OUT_UNTIL) / (BR_ARRIVE - OUT_UNTIL)) : !back ? 1 : 1 - ease((t - BR_LEAVE) / (NARROWS_UNTIL - BR_LEAVE));
    const P = F.path.getPointAt(u), T = F.path.getTangentAt(Math.min(0.999, Math.max(0.001, u))); const dx = back ? -T.x : T.x, dz = back ? -T.z : T.z;
    return { x: P.x, z: P.z, h: Math.atan2(-dx, -dz), narrows: true, bayRidge: t >= BR_ARRIVE && t < BR_LEAVE }; }
  const k = ease((t - NARROWS_UNTIL) / (IN_UNTIL - NARROWS_UNTIL)); return { x: D.x, z: OUT_Z + (D.z - OUT_Z) * k, h: 0 };   // in, bow first
}

// ---- per frame ---------------------------------------------------------------------------------------------------------------
function update(dt) {
  const { ctx, W } = F, p = ctx.player; if (!p) return; const ph = phase(), w = where(ph.t), g = F.boat.group;
  const inNarrows = !!w.narrows && F.aboard;
  if (inNarrows && !F.narrows) F.narrows = buildNarrows(F.world);
  if (F.narrows) F.narrows.visible = inNarrows;
  if (inNarrows !== !!F.faded) fade(inNarrows ? 'THE NARROWS · VERRAZZANO-NARROWS BRIDGE' : 'CONEY ISLAND · STEEPLECHASE PIER', inNarrows);
  // out at sea with nobody aboard: out of sight (it's 500 m off and going away)
  const x = w.x, z = inNarrows ? NZ + w.z : w.z, oy = !inNarrows && W.ocean ? W.ocean.waveHeight(x, z) : 0;
  g.visible = inNarrows || !w.narrows; g.position.set(x, oy + 0.45, z);   // the hulls draw ~0.5 m
  const roll = Math.sin(Date.now() / 1700) * 0.02, pitch = Math.sin(Date.now() / 2300) * 0.012; g.rotation.set(pitch, w.h, roll, 'YXZ');
  if (F.aboard) {
    if (p.dead) { leave(false); return; }
    const playing = ctx.state === 'playing', inp = ctx.input, nearBar = Math.hypot(F.lx - BAR.x, F.lz - BAR.z) < 1.7;
    if (playing && inp?.pressed?.has?.('KeyF')) { inp.pressed.delete('KeyF');
      if (ph.docked) { leave(true); return; } if (w.bayRidge) { bayRidge(); return; }   // at a pier F is always getting off
      if (nearBar) { if (K.full()) K.toast?.('Hands full', 1000); else if (K.pay(3)) { K.give('tallboy'); K.toast?.('A tallboy from the ferry bar — $3. B to drink', 1800); } else K.toast?.('$3, pal', 1000); }
      else K.toast?.('Off at the next pier — Bay Ridge, or back at Coney', 1400); }
    F.barT = (F.barT || 0) - dt; if (nearBar && !ph.docked && !w.bayRidge && F.barT <= 0) { F.barT = 2; K.toast?.('F — TALLBOY $3 · B — DRINK', 1200); }
    p.yaw += w.h - F.yawPrev; F.yawPrev = w.h;   // you turn with the boat
    // walk the upper deck: your input in the world, turned into the boat's frame, kept inside the rails
    let ix = (inp?.right ? 1 : 0) - (inp?.left ? 1 : 0), iy = (inp?.forward ? 1 : 0) - (inp?.back ? 1 : 0); if (inp?.xrMove) { ix = inp.xrMove.x; iy = inp.xrMove.y; } else if (inp?.touch?.axis && (inp.touch.axis.x || inp.touch.axis.y)) { ix = inp.touch.axis.x; iy = -inp.touch.axis.y; }
    if (playing && (ix || iy)) { const sp = (inp?.sprint ? 4.5 : 2.6) * dt / Math.max(1, Math.hypot(ix, iy)), wx = (-Math.sin(p.yaw) * iy + Math.cos(p.yaw) * ix) * sp, wz = (-Math.cos(p.yaw) * iy - Math.sin(p.yaw) * ix) * sp, c = Math.cos(w.h), sn = Math.sin(w.h);
      F.lx = Math.max(-DECK_X, Math.min(DECK_X, F.lx + wx * c - wz * sn)); F.lz = Math.max(DECK_Z0, Math.min(DECK_Z1, F.lz + wx * sn + wz * c)); }
    g.updateMatrixWorld(); const at = new THREE.Vector3(F.lx, DECK2, F.lz).applyMatrix4(g.matrixWorld); p.position.copy(at); p.velocity?.set?.(0, 0, 0);
    const cam = ctx.camera; cam.position.set(at.x, at.y + 1.62, at.z); cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ'); p.cameraPosition?.copy?.(cam.position);
    if (ph.t >= OUT_UNTIL && ph.t < OUT_UNTIL + 0.5 && F.phaseName !== 'n') { F.phaseName = 'n'; ctx.hud?.toast?.('Up the Narrows to the Verrazzano', 2400); }
    if (ph.t >= IN_UNTIL && F.phaseName !== 'd') { F.phaseName = 'd'; ctx.hud?.toast?.('Coney Island pier — F to get off', 2600); }
    if (w.bayRidge && F.phaseName !== 'b') { F.phaseName = 'b'; ctx.hud?.toast?.('69th St, Bay Ridge — F to get off for Soc Tav (the B70 up 8th Ave)', 3600); }
  }
}
function board() {
  const { ctx } = F, p = ctx.player; if (F.aboard || p.mounted || ctx.vehicles?.mounted) return;
  F.aboard = true; p.mounted = { ferry: true, speed: 0 }; F.yawPrev = where(phase().t).h; F.phaseName = ''; F.lx = 0; F.lz = 8.5;
  try { ctx.bus.emit('vrFace'); } catch {}
  ctx.hud?.toast?.(`NYC Ferry — leaves in ${Math.max(0, Math.ceil(DOCK_UNTIL - phase().t))} s. Look around; F at the pier to get off`, 3200);
}
/** off at 69th St: up the B70 to 8th Ave and Soc Tav */
function bayRidge() { const { ctx, W } = F; leave(false); if (W.tavern?.arrive) W.tavern.arrive('ferry'); else ctx.hud?.toast?.('Bay Ridge', 1200); }
function leave(toPier) {
  const { ctx } = F, p = ctx.player; F.aboard = false; if (p.mounted?.ferry) p.mounted = null; if (F.faded) fade('', false);
  if (toPier) p.teleport(F.spotPos.x, 0.3, F.spotPos.z, Math.PI / 2, 0);
}
function fade(text, on) {
  F.faded = on; const f = document.querySelector('.hgfade'), fl = document.querySelector('.hgfloor'); if (!f) return;
  f.classList.remove('car'); f.style.transition = 'opacity .35s'; f.style.opacity = '1'; if (fl && text) { fl.style.fontSize = '40px'; fl.textContent = text; }
  setTimeout(() => { f.style.opacity = '0'; if (fl) fl.textContent = ''; setTimeout(() => { f.style.transition = ''; if (fl) fl.style.fontSize = ''; }, 400); }, 900);
}

// ---- the boat ------------------------------------------------------------------------------------------------------------------
function liveryTex() {   // the cabin side: dark window band, the teal + navy stripes, NYC FERRY
  const c = document.createElement('canvas'); c.width = 1024; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#f4f5f6'; g.fillRect(0, 0, 1024, 128); g.fillStyle = '#0d1520'; g.fillRect(0, 8, 1024, 54);
  for (let x = 60; x < 1000; x += 64) { g.fillStyle = '#e8eaec'; g.fillRect(x, 8, 5, 54); }
  g.fillStyle = '#16b3c2'; g.fillRect(0, 68, 1024, 9); g.fillStyle = '#132a63'; g.fillRect(0, 80, 1024, 48);
  g.fillStyle = '#fff'; g.font = '900 36px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('NYC FERRY', 512, 105);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function ferryModel(lite) {
  const S = (c, r = 0.5, m = 0.1) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const M = { white: S(0xf2f3f5, 0.35, 0.15), navy: S(0x132a63, 0.4, 0.2), teal: S(0x16b3c2, 0.4, 0.1), glass: S(0x0d1520, 0.08, 0.6), steel: S(0x9aa0a6, 0.35, 0.8), dark: S(0x24272b, 0.6, 0.4), orange: S(0xff6a1a, 0.6, 0), bench: S(0x2f5f8a, 0.6, 0.1),
    side: new THREE.MeshStandardMaterial({ map: liveryTex(), roughness: 0.4, metalness: 0.1 }) };
  const group = new THREE.Group(); group.name = 'nycFerry'; const G = new Map(), put = (m, g) => (G.get(m) || G.set(m, []).get(m)).push(g.index ? g.toNonIndexed() : g);
  const box = (m, x0, y0, z0, x1, y1, z1) => { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); put(m, g); };
  // twin hulls (a catamaran): pointed bows, navy below the waterline stripe, white above
  for (const s of [-1, 1]) { const hx = s * (BEAM / 2 - 1.1); const sh = new THREE.Shape([[-LEN / 2, 0.2], [-LEN / 2 + 3.5, -0.5], [LEN / 2 - 0.5, -0.5], [LEN / 2, 0.4], [LEN / 2, 1.5], [-LEN / 2 - 0.6, 1.5]].map(([a, b]) => new THREE.Vector2(a, b)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 2.1, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2 }); g.rotateY(Math.PI / 2); g.translate(hx - 1.05, 0, 0); put(M.white, g);
    box(M.navy, hx - 1.12, -0.55, -LEN / 2 + 3.4, hx + 1.12, 0.15, LEN / 2 - 0.4); }
  box(M.white, -BEAM / 2, 1.2, -LEN / 2 + 1.5, BEAM / 2, 1.5, LEN / 2);                                   // the main deck slab across both hulls
  box(M.teal, -BEAM / 2 - 0.02, 1.2, -LEN / 2 + 2, BEAM / 2 + 0.02, 1.32, LEN / 2 + 0.02);
  // the cabin: livery panels both sides (window band, stripes, the name), glazed front, doors at the back
  box(M.white, -3.6, 1.5, -8, 3.6, DECK2 - 0.05, 9); box(M.white, -3.75, DECK2 - 0.1, -8.3, 3.75, DECK2, 9.6);
  for (const s of [-1, 1]) { const pl = new THREE.PlaneGeometry(17, 2.4); pl.rotateY(s * Math.PI / 2); pl.translate(s * 3.61, 2.7, 0.5); if (s < 0) { const uv = pl.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); } put(M.side, pl); }
  box(M.glass, -3.4, 2.1, -8.05, 3.4, 3.5, -7.95); box(M.glass, -1.4, 1.5, 8.95, 1.4, 3.6, 9.05);
  // the upper deck: railings, benches, the wheelhouse forward with its windscreen, a mast with radar and lights
  for (const s of [-1, 1]) { box(M.steel, s * 3.7 - 0.03, DECK2, -8.2, s * 3.7 + 0.03, DECK2 + 1.05, 9.5); box(M.steel, s * 3.7 - 0.04, DECK2 + 1.0, -8.2, s * 3.7 + 0.04, DECK2 + 1.08, 9.5);
    for (let z = -8; z <= 9.5; z += 1.25) box(M.steel, s * 3.7 - 0.02, DECK2, z - 0.02, s * 3.7 + 0.02, DECK2 + 1.0, z + 0.02); }
  box(M.steel, -3.7, DECK2 + 1.0, 9.46, 3.7, DECK2 + 1.08, 9.54); for (let x = -3.6; x <= 3.6; x += 1.2) box(M.steel, x - 0.02, DECK2, 9.48, x + 0.02, DECK2 + 1.0, 9.52);
  if (!lite) for (let z = -1.5; z < 8.5; z += 1.6) for (const s of [-1, 1]) { box(M.bench, s * 2.2 - 0.9, DECK2 + 0.42, z, s * 2.2 + 0.9, DECK2 + 0.5, z + 0.45); box(M.bench, s * 2.2 - 0.9, DECK2 + 0.5, z + 0.4, s * 2.2 + 0.9, DECK2 + 0.95, z + 0.48); box(M.dark, s * 2.2 - 0.05, DECK2, z + 0.1, s * 2.2 + 0.05, DECK2 + 0.42, z + 0.35); }
  box(M.white, -2.6, DECK2, -8, 2.6, DECK2 + 2.3, -3.8); box(M.glass, -2.5, DECK2 + 1.2, -8.06, 2.5, DECK2 + 2.0, -7.95); for (const s of [-1, 1]) box(M.glass, s * 2.6 - 0.02, DECK2 + 1.2, -7.6, s * 2.6 + 0.02, DECK2 + 2.0, -4.2);
  box(M.navy, -2.7, DECK2 + 2.3, -8.2, 2.7, DECK2 + 2.45, -3.6); box(M.steel, -0.06, DECK2 + 2.45, -6.1, 0.06, DECK2 + 4.4, -5.9); box(M.dark, -0.9, DECK2 + 3.6, -6.1, 0.9, DECK2 + 3.75, -5.9);
  for (const s of [-1, 1]) { const ring = new THREE.TorusGeometry(0.32, 0.08, 6, 14); ring.translate(s * 3.72, DECK2 + 0.6, 4); ring.rotateY(0); put(M.orange, ring); }
  box(M.navy, BAR.x - 0.55, DECK2, BAR.z - 0.9, BAR.x + 0.55, DECK2 + 1.05, BAR.z + 0.9); box(M.teal, BAR.x - 0.6, DECK2 + 1.05, BAR.z - 0.95, BAR.x + 0.6, DECK2 + 1.12, BAR.z + 0.95);   // the bar
  for (const [m, list] of G) { const mesh = new THREE.Mesh(mergeGeometries(list, false), m); mesh.castShadow = !lite; mesh.receiveShadow = true; mesh.userData.surface = 'metal'; group.add(mesh); }
  return { group };
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
  // the 69th St pier in Bay Ridge: a concrete pier out from the Shore Pkwy, the ferry shed with its sign
  box(M.concrete, 830, -0.5, -904, 932, 1.6, -894); box(M.bldg, 900, 1.6, -903, 928, 6, -895); box(M.steel, 898, 6, -904, 930, 6.4, -894);
  { const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d'); g.fillStyle = '#132a63'; g.fillRect(0, 0, 512, 96); g.fillStyle = '#fff'; g.font = '900 44px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('NYC FERRY · BAY RIDGE', 256, 50);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6), new THREE.MeshBasicMaterial({ map: t })); sign.position.set(914, 4.6, -893.9); root.add(sign); }
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
