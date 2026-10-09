// CONEY — the heavy end of a wanted level. At 2 stars an NYPD helicopter (white and blue, twin chain guns on stub pylons) flies
// in, circles you with its gunner firing bursts, then sets down in an open spot near you and drops two cops. At 3 stars an
// armored tank comes up the streets on the nav grid, swings its turret onto you and lobs shells (blast damage, walls stop them).
// Both can be stolen: walk up to the landed chopper or the tank and F. Chopper: W/S/A/D fly, mouse turns and aims, Space
// climbs, C descends, fire = chain guns, F gets out once you're low. Tank: W/S/A/D drive the hull, mouse aims the turret,
// fire = the main gun. Phones: the stick, look, JUMP / CROUCH, FIRE and the action button. Both can be shot up (bullets do
// little to the tank, a grenade or its own gun do a lot) and blow up. Built lazily, one of each at a time, tiny geometry
// (phones: no shadows or spotlight). Local to your own chase: friends see your cops, not these. You can shake them: both work
// from where the cops last saw you; the chopper only picks you up again close by and out in the open, goes home after a while,
// and the stars fade like any chase (coney/chase.js). CONEY agent.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hangkit as K } from '../hangkit.js';
import { chaseQA as CH } from './chase.js';

const HELI = { hp: 700, orbitR: 34, orbitY: 26, speed: 30, landAfter: 22, landedFor: 45, burstEvery: 3.4, burst: 10, rof: 11, hitDmg: 7, spotR: 42, onStation: 100 };
const HELI_PILOT = { acc: 16, drag: 0.9, vmax: 34, climb: 9, yawRate: 1.6, rof: 12, dmg: 24, range: 260, exitAlt: 3.2, radius: 3.4 };
const TANK = { hp: 2600, speed: 7, turn: 0.9, turretRate: 0.9, standOff: 38, fireEvery: 7, shellV: 85, blastR: 7, blastDmg: 60, radius: 2.1 };
const TANK_PILOT = { speed: 13, rev: 5, turn: 1.1, reload: 1.6, blastDmg: 160 };
const BULLET_ON_TANK = 0.12;   // small arms barely scratch it
const SMALL_BOX = 12;           // m² footprint: poles, bins, hydrants, parked cars. The craft roll / fly over them, buildings stop them
let A = null;

export function buildAirSupport(world) {
  const { ctx, W } = world;
  A = { world, ctx, W, heli: null, tank: null, pilot: null, shells: [], t: 0, heliCd: 0, tankCd: 0, near: [], nearT: 0, aimYaw: 0, aimPitch: -0.15, hud: null, fireT: 0, shotT: 0, gun: 0 };
  // where a chopper can go: the map plus Brighton (the far zones, the Belt and 8th Ave, stay out)
  A.box = { x0: W.bounds.min.x, x1: W.bounds.max.x, z0: W.bounds.min.z, z1: W.bounds.max.z };
  for (const z of W.zones || []) if (Math.abs(z.z0) < 2000 && /BRIGHTON BEACH$/.test(z.name)) { A.box.x1 = Math.max(A.box.x1, z.x1); A.box.z1 = Math.max(A.box.z1, z.z1); }
  A.spotPos = new THREE.Vector3(1e6, 0, 0);   // the F spot follows whichever craft you're next to
  K.spot({ pos: A.spotPos, r: 4.2, dy: 3, when: () => !!stealable(), prompt: () => stealable()?.kind === 'heli' ? 'F — STEAL THE NYPD CHOPPER' : 'F — HIJACK THE TANK', act: () => { const c = stealable(); if (c) board(c); } });
  ctx.bus.on('playerDied', () => { if (A.pilot) leave(true); });
  ctx.bus.on('worldReset', () => { if (A.pilot) leave(true); for (const c of [A.heli, A.tank]) if (c) dispose(c); A.heli = A.tank = null; });
  world.updaters.push((dt) => update(dt));
  if (typeof window !== 'undefined' && window.__game) window.__game.air = {
    state: () => ({ heli: A.heli && { st: A.heli.st, hp: Math.round(A.heli.hp), pos: A.heli.pos.toArray().map((v) => +v.toFixed(1)) }, tank: A.tank && { st: A.tank.st, hp: Math.round(A.tank.hp), pos: A.tank.pos.toArray().map((v) => +v.toFixed(1)), speed: +(A.tank.speed || 0).toFixed(1), heading: +A.tank.heading.toFixed(2), path: A.tank.path?.length || 0, shots: A.tank.shots || 0, bumped: A.t - (A.tank.bumpT ?? -9) < 0.2 }, pilot: A.pilot?.kind || null }),
    spawnHeli: (land = false) => { if (!A.heli) A.heli = spawnHeli(); if (land && A.heli) A.heli.landT = 0; return !!A.heli; },
    spawnTank: (d = 60) => { if (!A.tank) A.tank = spawnTank(d); return !!A.tank; },
    land: () => { if (A.heli) { A.heli.st = 'orbit'; A.heli.landT = 0; } },
    board: (k) => { const c = k === 'tank' ? A.tank : A.heli; if (c) { const p = ctx.player.position; c.pos.x = p.x + 3; c.pos.z = p.z; c.st = c.kind === 'heli' ? 'landed' : 'parked'; c.pos.y = ground(c.pos.x, c.pos.z); place(c); return board(c); } return false; },
    put: (k, x, z, h = 0) => { const c = k === 'tank' ? (A.tank || (A.tank = spawnTank(30))) : (A.heli || (A.heli = spawnHeli())); if (!c) return false; c.pos.set(x, ground(x, z), z); c.heading = h; c.vel.set(0, 0, 0); c.speed = 0; c.st = 'parked'; c.pitch = c.roll = 0; place(c); return true; },   // QA / screenshots: park one here
    leave: () => leave(), fire: () => { A.qaFire = 0.6; }, hurt: (k, n) => { const c = k === 'tank' ? A.tank : A.heli; if (c) hurt(c, n, true); },
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
const ground = (x, z) => { const g = A.W.groundHeight?.(x, z); return Number.isFinite(g) ? g : 0; };
function stealable() {
  const p = A.ctx.player; if (!p || p.dead || p.mounted || A.ctx.vehicles?.mounted) return null;
  for (const c of [A.heli, A.tank]) if (c && !c.dead && (c.st === 'landed' || c.st === 'parked' || c.kind === 'tank') && Math.hypot(c.pos.x - p.position.x, c.pos.z - p.position.z) < c.reach && Math.abs(c.pos.y - p.position.y) < 3) return c;
  return null;
}
/** colliders within ~45 m of (x, z), refreshed a few times a second (the craft collide with buildings and land on roofs) */
function nearBoxes(x, z) {
  if (A.t - A.nearT < 0.3 && Math.hypot(x - A.nearX, z - A.nearZ) < 15) return A.near;
  A.nearT = A.t; A.nearX = x; A.nearZ = z; A.near = [];
  for (const b of A.ctx.colliders) { if (b.max.x < x - 45 || b.min.x > x + 45 || b.max.z < z - 45 || b.min.z > z + 45 || b.max.y - b.min.y > 400) continue; if (A.own?.has(b)) continue; if ((b.max.x - b.min.x) * (b.max.z - b.min.z) < SMALL_BOX && b.max.y - b.min.y < 8) continue; A.near.push(b); }
  return A.near;
}
/** push a craft (a circle of radius r, feet at pos.y) out of building boxes; returns the highest roof it's standing over */
function collide(c, r) {
  let floor = ground(c.pos.x, c.pos.z); const p = c.pos;
  for (const b of nearBoxes(p.x, p.z)) {
    if (p.x < b.min.x - r || p.x > b.max.x + r || p.z < b.min.z - r || p.z > b.max.z + r) continue;
    if (b.max.y < p.y + 0.6) { if (p.x > b.min.x - r * 0.5 && p.x < b.max.x + r * 0.5 && p.z > b.min.z - r * 0.5 && p.z < b.max.z + r * 0.5) floor = Math.max(floor, b.max.y); continue; }   // under us: a roof (or a car) to sit on
    if (b.min.y > p.y + (c.kind === 'heli' ? 3.2 : 2.6)) continue;   // overhead (the el, a sign)
    const dx0 = p.x - (b.min.x - r), dx1 = b.max.x + r - p.x, dz0 = p.z - (b.min.z - r), dz1 = b.max.z + r - p.z, m = Math.min(dx0, dx1, dz0, dz1);
    if (m === dx0) { p.x -= dx0; c.vel.x = Math.min(0, c.vel.x) * 0.3; } else if (m === dx1) { p.x += dx1; c.vel.x = Math.max(0, c.vel.x) * 0.3; } else if (m === dz0) { p.z -= dz0; c.vel.z = Math.min(0, c.vel.z) * 0.3; } else { p.z += dz1; c.vel.z = Math.max(0, c.vel.z) * 0.3; }
    c.bumpT = A.t;
  }
  p.x = Math.min(A.box.x1 - 4, Math.max(A.box.x0 + 4, p.x)); p.z = Math.min(A.box.z1 - 4, Math.max(A.box.z0 + 4, p.z));
  return floor;
}
/** an open spot to set the chopper down: 18..42 m from `around`, nothing standing within 8 m, on the ground */
function landingSpot(around) {
  const nav = A.ctx.ai?.nav;
  for (let k = 0; k < 24; k++) {
    const a = Math.random() * Math.PI * 2, d = 18 + Math.random() * 24; let x = around.x + Math.cos(a) * d, z = around.z + Math.sin(a) * d;
    const q = nav?.nearestFree?.(x, z, 6, 0); if (q) { x = q.x; z = q.z; } const gy = ground(x, z);
    if (Math.abs(gy - (A.W.groundHeight?.(around.x, around.z) ?? 0)) > 2.5) continue;
    if (x < A.box.x0 + 10 || x > A.box.x1 - 10 || z < A.box.z0 + 10 || z > A.box.z1 - 10) continue;
    let clear = true; for (const b of A.ctx.colliders) { if (b.max.y < gy + 0.3 || b.min.y > gy + 14 || b.max.y - b.min.y > 400) continue; if (b.max.x > x - 8 && b.min.x < x + 8 && b.max.z > z - 8 && b.min.z < z + 8) { clear = false; break; } }
    if (clear) return new THREE.Vector3(x, gy, z);
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------------
function update(dt) {
  const ctx = A.ctx, p = ctx.player; if (!p || dt <= 0) return; dt = Math.min(dt, 0.05); A.t += dt;
  const playing = ctx.state === 'playing', stars = CH.starsNow?.() || 0, onMap = Math.abs(p.position.z) < 1500;
  // spawns: one chopper from 2 stars, one tank from 3 (a breather after one goes down)
  A.heliCd -= dt; A.tankCd -= dt;
  if (playing && onMap && stars >= 2 && !A.heli && A.heliCd <= 0) A.heli = spawnHeli();
  if (playing && onMap && stars >= 3 && !A.tank && A.tankCd <= 0) A.tank = spawnTank();
  for (const c of [A.heli, A.tank]) { if (!c) continue;
    if (c === A.pilot) continue;
    if (c.kind === 'heli') heliAI(c, dt, stars); else tankAI(c, dt, stars);
    if (c.gone) { dispose(c); if (c === A.heli) { A.heli = null; A.heliCd = 45; } else { A.tank = null; A.tankCd = 30; } } }
  if (A.pilot) pilotFrame(A.pilot, dt, playing);
  shellsFrame(dt);
  for (const c of [A.heli, A.tank]) if (c) visuals(c, dt);
  const s = stealable(); if (s) A.spotPos.set(s.pos.x, p.position.y, s.pos.z); else A.spotPos.set(1e6, 0, 0);
}

// ---- the chopper ----------------------------------------------------------------------------------------------------------
function spawnHeli() {
  const p = A.ctx.player.position, a = Math.random() * Math.PI * 2, m = heliModel();
  const c = { kind: 'heli', ...m, pos: new THREE.Vector3(p.x + Math.cos(a) * 240, 60, p.z + Math.sin(a) * 240), vel: new THREE.Vector3(), heading: 0, pitch: 0, roll: 0, hp: HELI.hp, st: 'inbound', t: 0, orbitA: a, landT: HELI.landAfter, burstT: 2, rounds: 0, roundT: 0, rotor: 1, reach: 5.5, crew: 2 };
  c.pos.x = Math.min(A.box.x1, Math.max(A.box.x0, c.pos.x)); c.pos.z = Math.min(A.box.z1, Math.max(A.box.z0, c.pos.z));
  A.world.scene.add(c.group); hitboxes(c); A.ctx.hud?.toast?.('NYPD AVIATION — a chopper is on you', 2400);
  return c;
}
function heliAI(c, dt, stars) {
  const p = A.ctx.player, P = p.position; c.t += dt;
  if (c.dead) { crash(c, dt); return; }
  if (!stars && c.st !== 'leave' && c.st !== 'parked') { c.st = c.st === 'landed' ? 'takeoff' : 'leave'; }
  const target = new THREE.Vector3();
  if (c.st === 'inbound' || c.st === 'orbit' || c.st === 'leave' || c.st === 'takeoff') {
    if (c.st === 'leave') { target.set(c.pos.x + (c.pos.x - P.x), 70, c.pos.z + (c.pos.z - P.z)); if (Math.hypot(c.pos.x - P.x, c.pos.z - P.z) > 300) c.gone = true; }
    else if (c.st === 'takeoff') { target.set(c.pos.x, HELI.orbitY + 6, c.pos.z); if (c.pos.y > ground(c.pos.x, c.pos.z) + 15) c.st = stars ? 'orbit' : 'leave'; }
    else { const L = spot(c) ? P : (CH.lastKnown?.() || P);   // circles where you were last seen
      c.orbitA += dt * 0.32; target.set(L.x + Math.cos(c.orbitA) * HELI.orbitR, Math.max(L.y, 0) + HELI.orbitY, L.z + Math.sin(c.orbitA) * HELI.orbitR);
      if (c.t > HELI.onStation && c.st === 'orbit') { c.st = 'leave'; A.ctx.hud?.toast?.('The chopper is heading back to base', 1800); }
      if (c.st === 'inbound' && c.pos.distanceTo(target) < 40) c.st = 'orbit';
      if (c.st === 'orbit') { c.landT -= dt; gunner(c, dt, stars); if (c.landT <= 0 && !A.ctx.vehicles?.mounted && CH.seenAgo?.() < 3) { const s = landingSpot(P); if (s) { c.land = s; c.st = 'descend'; } else c.landT = 6; } } }
    fly(c, target, dt, c.st === 'leave' ? 1.3 : 1);
  } else if (c.st === 'descend') {
    const L = c.land; target.set(L.x, c.pos.distanceTo(new THREE.Vector3(L.x, c.pos.y, L.z)) > 4 ? Math.max(L.y + 12, c.pos.y) : L.y, L.z);
    fly(c, target, dt, 0.7); if (Math.abs(c.pos.x - L.x) < 1.5 && Math.abs(c.pos.z - L.z) < 1.5 && c.pos.y < L.y + 0.4) touchdown(c);
  } else if (c.st === 'landed') {
    c.t2 = (c.t2 || 0) + dt; c.rotor = Math.max(0.35, c.rotor - dt * 0.4);
    if (c.t2 > HELI.landedFor && stars) { c.st = 'takeoff'; c.t2 = 0; c.rotor = 1; c.landT = HELI.landAfter * 1.5; unpark(c); }
  } else if (c.st === 'parked') { c.rotor = Math.max(0, c.rotor - dt * 0.3); if (Math.hypot(c.pos.x - P.x, c.pos.z - P.z) > 450) c.gone = true; }
}
/** steer toward a point: tilt into the direction, yaw to face it, a top speed */
function fly(c, target, dt, k = 1) {
  const d = new THREE.Vector3().subVectors(target, c.pos), hd = Math.hypot(d.x, d.z);
  const want = new THREE.Vector3(d.x, 0, d.z).multiplyScalar(Math.min(1, hd / 25) * HELI.speed * k / (hd || 1));
  c.vel.x += (want.x - c.vel.x) * Math.min(1, dt * 0.9); c.vel.z += (want.z - c.vel.z) * Math.min(1, dt * 0.9);
  c.vel.y += (Math.max(-6, Math.min(7, d.y * 0.8)) - c.vel.y) * Math.min(1, dt * 1.5);
  c.pos.addScaledVector(c.vel, dt);
  if (hd > 3) { const face = Math.atan2(-d.x, -d.z); c.heading += Math.atan2(Math.sin(face - c.heading), Math.cos(face - c.heading)) * Math.min(1, dt * 1.2); }
  const floor = collide(c, HELI_PILOT.radius); if (c.pos.y < floor) { c.pos.y = floor; c.vel.y = Math.max(0, c.vel.y); }
  tilt(c, dt);
}
function tilt(c, dt) { const fx = -Math.sin(c.heading), fz = -Math.cos(c.heading), fwd = c.vel.x * fx + c.vel.z * fz, side = c.vel.x * -fz + c.vel.z * fx;
  c.pitch += (-fwd * 0.012 - c.pitch) * Math.min(1, dt * 3); c.roll += (-side * 0.015 - c.roll) * Math.min(1, dt * 3); }
function touchdown(c) {
  c.st = 'landed'; c.t2 = 0; c.vel.set(0, 0, 0); c.pos.y = c.land.y; park(c);
  const fx = -Math.sin(c.heading), fz = -Math.cos(c.heading);
  for (let i = 0; i < c.crew; i++) { const side = i ? 1 : -1, at = new THREE.Vector3(c.pos.x - fz * side * 2.6 + fx, c.pos.y, c.pos.z + fx * side * 2.6 + fz); try { CH.spawnCopAt?.(at); } catch (e) { console.warn('[air] cop', e); } }
  c.crew = 0; A.ctx.hud?.toast?.('The chopper set down — two cops out. It\'s sitting there…', 2600);
}
/** can the crew see you: close by (horizontally), you're out in the open. A sighting tells the chase where you are */
function spot(c) {
  const p = A.ctx.player, P = p.position; if (p.dead) return false;
  if (A.t - (c.spotT ?? -9) < 0.5) return c.sees; c.spotT = A.t;
  c.sees = Math.hypot(c.pos.x - P.x, c.pos.z - P.z) < HELI.spotR && !A.W.indoorAt?.(P, p.mounted) && Math.abs(P.z) < 1500;
  if (c.sees) CH.spotted?.(P); return c.sees;
}
/** the door gunner: bursts at you while the crew has eyes on you */
function gunner(c, dt, stars) {
  const p = A.ctx.player, P = p.position; if (p.dead) return;
  c.burstT -= dt; if (c.burstT <= 0 && c.rounds <= 0) { c.burstT = HELI.burstEvery; if (spot(c) && c.pos.distanceTo(P) < 90) c.rounds = HELI.burst; }
  if (c.rounds <= 0) return; c.roundT -= dt; if (c.roundT > 0) return; c.roundT = 1 / HELI.rof; c.rounds--;
  const o = gunMuzzle(c, c.rounds % 2), eye = new THREE.Vector3(P.x, P.y + 1.4, P.z), dir = eye.clone().sub(o).normalize();
  const hitP = stars >= 3 ? 0.34 : 0.24, hit = Math.random() < hitP;
  if (!hit) dir.x += (Math.random() - 0.5) * 0.08, dir.y += (Math.random() - 0.5) * 0.05, dir.z += (Math.random() - 0.5) * 0.08;
  try { A.ctx.weapons?.fx?.enemyShot?.(o, dir.normalize()); A.ctx.weapons?.fx?.muzzleLightAt?.(o, 0.6, 0.03); } catch {}
  try { A.ctx.audio?.play?.('enemy_shot', { position: o, volume: 0.9 }); } catch {}
  if (hit) p.damage(HELI.hitDmg * (A.ctx.mode === 'chill' ? 1 : 1.2), o);
}
function gunMuzzle(c, side) { const o = new THREE.Vector3(side ? 1.75 : -1.75, 0.95, -1.45); c.group.updateMatrixWorld(); return o.applyMatrix4(c.group.matrixWorld); }
function crash(c, dt) {
  c.vel.y -= 9.8 * dt; c.heading += dt * 4; c.pos.addScaledVector(c.vel, dt); const floor = collide(c, 2.5);
  if (c.pos.y <= floor) { c.pos.y = floor; if (!c.wreck) { c.wreck = true; boom(c.pos.clone().setY(floor + 1), 9, 120, c.killedByPlayer); charred(c); c.wreckT = 60; } c.vel.set(0, 0, 0); c.rotor = 0; }
  if (c.wreck) { c.wreckT -= dt; if (c.wreckT <= 0 && Math.hypot(c.pos.x - A.ctx.player.position.x, c.pos.z - A.ctx.player.position.z) > 60) c.gone = true; }
}

// ---- the tank ---------------------------------------------------------------------------------------------------------------
function spawnTank(d0 = null) {
  const p = A.ctx.player.position, nav = A.ctx.ai?.nav; let at = null;
  for (let k = 0; k < 20 && !at; k++) { const a = Math.random() * Math.PI * 2, d = d0 ?? (90 + Math.random() * 50); const q = nav?.nearestFree?.(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 8, 0);
    if (q && Math.abs(q.y - ground(q.x, q.z)) < 1 && q.x > A.box.x0 + 10 && q.x < A.box.x1 - 10 && q.z > A.box.z0 + 10 && q.z < A.box.z1 - 10) at = q; }
  if (!at) return null;
  const m = tankModel(); const c = { kind: 'tank', ...m, pos: new THREE.Vector3(at.x, ground(at.x, at.z), at.z), vel: new THREE.Vector3(), heading: Math.atan2(at.x - p.x, at.z - p.z), turret: 0, gunPitch: 0, hp: TANK.hp, st: 'hunt', t: 0, fireT: TANK.fireEvery * 0.6, path: null, pathT: -9, pi: 0, reach: 4.6, rotor: 0, speed: 0 };
  A.world.scene.add(c.group); hitboxes(c); A.ctx.hud?.toast?.('They sent a TANK.', 2400);
  return c;
}
function tankAI(c, dt, stars) {
  const p = A.ctx.player, P = p.position; c.t += dt;
  if (c.dead) { c.wreckT -= dt; if (c.wreckT <= 0 && Math.hypot(c.pos.x - P.x, c.pos.z - P.z) > 60) c.gone = true; return; }
  if (c.st === 'parked') { c.speed = 0; if (Math.hypot(c.pos.x - P.x, c.pos.z - P.z) > 450) c.gone = true; return; }
  const d = Math.hypot(P.x - c.pos.x, P.z - c.pos.z), seen = (CH.seenAgo?.() ?? 0) < 2, L = seen ? P : (CH.lastKnown?.() || P), dl = Math.hypot(L.x - c.pos.x, L.z - c.pos.z);
  if (!stars) { c.st = 'leave'; if (d > 160) c.gone = true; }
  // drive: along a nav path to where you were last seen, stop at stand-off range when it has you; leaving: away from you
  let goal = null; if (c.st === 'leave') goal = new THREE.Vector3(c.pos.x + (c.pos.x - P.x), 0, c.pos.z + (c.pos.z - P.z)); else if (dl > (seen ? TANK.standOff : 6)) goal = L;
  let want = 0, face = c.heading;
  if (goal) { if (A.t - c.pathT > 2) { c.pathT = A.t; try { c.path = A.ctx.ai?.nav?.findPath?.(c.pos.clone(), goal.clone(), { maxExpand: 8000 }) || null; } catch { c.path = null; } if (c.path && c.path.length < 2) c.path = null; c.pi = 0; }
    let w = goal; if (c.path) { while (c.pi < c.path.length - 1 && Math.hypot(c.path[c.pi].x - c.pos.x, c.path[c.pi].z - c.pos.z) < 3) c.pi++; w = c.path[c.pi]; }
    face = Math.atan2(-(w.x - c.pos.x), -(w.z - c.pos.z)); const err = Math.atan2(Math.sin(face - c.heading), Math.cos(face - c.heading)); want = Math.abs(err) < 0.6 ? TANK.speed : 1.5;
    // nav paths are cut for people: a corner the hull won't clear pins it against the wall. Stuck a moment → back off turning, aim past the corner
    c.stuckT = A.t - (c.bumpT ?? -9) < 0.1 && Math.abs(c.speed) < 2.5 ? (c.stuckT || 0) + dt : 0;
    if (c.stuckT > 0.6) { c.stuckT = 0; c.backT = 1.2; if (c.path && c.pi < c.path.length - 1) c.pi++; }
    if (c.backT > 0) { c.backT -= dt; want = -3; c.heading -= Math.sign(err || 1) * TANK.turn * dt; }
    else c.heading += Math.sign(err) * Math.min(Math.abs(err), TANK.turn * dt); }
  c.speed += (want - c.speed) * Math.min(1, dt * 1.2); drive(c, dt);
  // the turret tracks you; fires when it's on you and you're in range
  const tw = Math.atan2(-(L.x - c.pos.x), -(L.z - c.pos.z)) - c.heading, te = Math.atan2(Math.sin(tw - c.turret), Math.cos(tw - c.turret));
  c.turret += Math.sign(te) * Math.min(Math.abs(te), TANK.turretRate * dt);
  c.fireT -= dt; if (c.st !== 'leave' && seen && c.fireT <= 0 && Math.abs(te) < 0.06 && d < 110 && !p.dead) { c.fireT = TANK.fireEvery * (0.8 + Math.random() * 0.4);
    const aim = new THREE.Vector3(P.x + (Math.random() - 0.5) * 7, P.y + 0.6, P.z + (Math.random() - 0.5) * 7); fireShell(c, aim, false); c.shots = (c.shots || 0) + 1; }
}
function drive(c, dt) {
  const fx = -Math.sin(c.heading), fz = -Math.cos(c.heading); c.vel.set(fx * c.speed, 0, fz * c.speed); c.pos.addScaledVector(c.vel, dt);
  const floor = collide(c, TANK.radius); c.pos.y += (floor - c.pos.y) * Math.min(1, dt * 8);
}
function fireShell(c, aim, mine) {
  c.group.updateMatrixWorld(); const muzzle = new THREE.Vector3(); c.gunTip.getWorldPosition(muzzle);
  const dir = aim.clone().sub(muzzle).normalize(), m = shellMesh(); m.position.copy(muzzle); A.world.scene.add(m);
  A.shells.push({ m, v: dir.multiplyScalar(TANK.shellV), t: 0, mine, from: c });
  try { A.ctx.weapons?.fx?.muzzleLightAt?.(muzzle, 2.2, 0.08); A.ctx.weapons?.fx?.muzzleSmoke?.(muzzle, dir.clone().normalize()); } catch {}
  try { A.ctx.audio?.play?.('explosion', { position: muzzle, volume: 0.5 }); } catch {}
  c.recoil = 1;
}
let SHELL_GEO = null, SHELL_MAT = null;
function shellMesh() { if (!SHELL_GEO) { SHELL_GEO = new THREE.SphereGeometry(0.18, 8, 6); SHELL_MAT = new THREE.MeshBasicMaterial({ color: 0xffd27a }); } return new THREE.Mesh(SHELL_GEO, SHELL_MAT); }
function shellsFrame(dt) {
  const P = A.ctx.player.position;
  for (let i = A.shells.length - 1; i >= 0; i--) { const s = A.shells[i]; s.t += dt; s.v.y -= 2 * dt; const prev = s.m.position.clone(); s.m.position.addScaledVector(s.v, dt); const q = s.m.position;
    let hit = s.t > 3 || q.y <= ground(q.x, q.z) + 0.05;
    if (!hit && !s.mine && Math.hypot(q.x - P.x, q.y - (P.y + 1), q.z - P.z) < 1.6) hit = true;
    if (!hit) for (const b of nearBoxes(q.x, q.z)) if (b.containsPoint(q) && !(s.from && s.from.box === b)) { hit = true; break; }
    if (!hit && s.mine) { const other = s.from === A.tank ? A.heli : A.tank; if (other && !other.dead && other.pos.distanceTo(q) < 3.5) hit = true; }
    if (hit) { q.lerp(prev, 0.3); boom(q.clone(), TANK.blastR, s.mine ? TANK_PILOT.blastDmg : TANK.blastDmg, s.mine); A.world.scene.remove(s.m); A.shells.splice(i, 1); } }
}
/** a blast: fx, your health, and (your own shell) everyone in range and the other craft */
function boom(pos, r, dmg, mine) {
  const ctx = A.ctx;
  try { ctx.weapons?.fx?.explosion?.(pos); ctx.weapons?.fx?.scorch?.(pos.clone().setY(ground(pos.x, pos.z) + 0.02), r * 0.5); } catch {}
  const pp = ctx.player.position, d = Math.hypot(pp.x - pos.x, pp.y + 0.9 - pos.y, pp.z - pos.z), inside = A.pilot && A.pilot.kind === 'tank';
  if (d < r && !(inside && mine)) ctx.player.damage(Math.round(dmg * (1 - d / r) ** 1.2 * (inside ? 0.35 : 1)), pos.clone());
  if (mine) { try { ctx.ai?.damageRadius?.(pos.clone(), r, dmg); } catch {}
    const g = new THREE.Vector3(); for (const h of ctx.raycastTargets || []) { if (!h?.userData?.onHit || h.userData.soldier || h.userData.remote || h.userData.craft || !h.parent) continue; h.getWorldPosition(g); const dd = g.distanceTo(pos); if (dd < r) try { h.userData.onHit(Math.round(dmg * (1 - dd / r) ** 1.2), false, g.clone(), g.clone().sub(pos).normalize()); } catch {} } }
  for (const c of [A.heli, A.tank]) if (c && !c.dead && c !== A.pilot) { const dd = c.pos.distanceTo(pos); if (dd < r + 2) hurt(c, dmg * 3 * (1 - dd / (r + 2)), mine); }
  if (A.pilot && !mine) { const dd = A.pilot.pos.distanceTo(pos); if (dd < r + 2) hurt(A.pilot, dmg * (1 - dd / (r + 2)), false); }
  ctx.bus.emit('explosion', { position: pos.clone(), radius: r });
}
function hurt(c, n, byPlayer) {
  if (c.dead || !(n > 0)) return; c.hp -= n; c.flashT = 0.1;
  if (c.hp <= 0) { c.dead = true; c.killedByPlayer = byPlayer;
    if (c === A.pilot) leave(true);
    if (c.kind === 'tank') { boom(c.pos.clone().setY(c.pos.y + 1.5), 8, 110, byPlayer); charred(c); c.wreckT = 60; c.speed = 0; }
    else { c.vel.y = Math.min(c.vel.y, 0); c.rotor = 0.6; if (c.st === 'landed' || c.st === 'parked') { c.pos.y += 0.01; } }
    if (byPlayer) try { CH.crime?.('copKill', c.pos.clone()); } catch {}
    A.ctx.hud?.toast?.(c.kind === 'tank' ? 'TANK DESTROYED' : 'CHOPPER DOWN', 1800); }
}

// ---- you at the controls ---------------------------------------------------------------------------------------------------
function board(c) {
  const ctx = A.ctx, p = ctx.player; if (A.pilot || p.mounted || ctx.vehicles?.mounted || c.dead) return false;
  A.pilot = c; c.st = c.kind === 'heli' ? 'flying' : 'driving'; unpark(c); c.rotor = c.kind === 'heli' ? Math.max(c.rotor, 0.4) : 0;
  p.mounted = { craft: c.kind, speed: 0 }; A.aimYaw = c.heading; A.aimPitch = -0.12; A.camYaw = c.heading;
  for (const m of c.hits) m.userData.mine = true;
  if (c.kind === 'tank') c.speed = 0;
  CH.raise?.(3, c.pos.clone());   // stealing police hardware: three stars, right now
  hud(true); ctx.hud?.toast?.(c.kind === 'heli' ? (ctx.isTouch ? 'Stick: fly · look: turn/aim · JUMP up · CROUCH down · FIRE: chain guns' : 'W/S/A/D fly · mouse turn + aim · SPACE up · C down · CLICK chain guns · F out (low)') : (ctx.isTouch ? 'Stick: drive · look: turret · FIRE: main gun' : 'W/S/A/D drive · mouse: turret · CLICK fire · F out'), 4200);
  return true;
}
function leave(force = false) {
  const c = A.pilot, ctx = A.ctx, p = ctx.player; if (!c) return false;
  if (!force && c.kind === 'heli' && c.pos.y - collide(c, HELI_PILOT.radius) > HELI_PILOT.exitAlt) { ctx.hud?.toast?.('Too high to jump — C to set it down', 1400); return false; }
  A.pilot = null; for (const m of c.hits) m.userData.mine = false;
  if (p.mounted?.craft) p.mounted = null;
  if (!c.dead) { c.st = 'parked'; c.vel.set(0, 0, 0); c.speed = 0; if (c.kind === 'heli') c.pos.y = collide(c, HELI_PILOT.radius); park(c); }
  const fx = -Math.sin(c.heading), fz = -Math.cos(c.heading), sx = c.kind === 'heli' ? 2.8 : 3.4, x = c.pos.x + fz * sx, z = c.pos.z - fx * sx;
  p.teleport(x, Math.max(c.pos.y, ground(x, z)), z, c.heading, 0); hud(false);
  return true;
}
function pilotFrame(c, dt, playing) {
  const ctx = A.ctx, inp = ctx.input, p = ctx.player;
  if (c.dead || p.dead) { leave(true); return; }
  if (playing && inp.pressed.has('KeyF')) { inp.pressed.delete('KeyF'); if (leave()) return; }
  const sens = ctx.settings?.sensitivity ?? 0.0022, mdx = playing ? inp.mouse.dx : 0, mdy = playing ? inp.mouse.dy : 0;
  A.aimPitch = Math.max(-0.9, Math.min(0.35, A.aimPitch - mdy * sens));
  const ax = inp.touch?.axis?.x || 0, ay = inp.touch?.axis?.y || 0;
  const fwd = playing ? (inp.down('KeyW') || inp.down('ArrowUp') ? 1 : 0) - (inp.down('KeyS') || inp.down('ArrowDown') ? 1 : 0) - ay : 0;
  const side = playing ? (inp.down('KeyD') || inp.down('ArrowRight') ? 1 : 0) - (inp.down('KeyA') || inp.down('ArrowLeft') ? 1 : 0) + ax : 0;
  const fire = playing && (inp.fire || A.qaFire > 0); A.qaFire = Math.max(0, (A.qaFire || 0) - dt);
  if (c.kind === 'heli') {
    c.heading -= mdx * sens; A.aimYaw = c.heading;
    const fx = -Math.sin(c.heading), fz = -Math.cos(c.heading), up = playing ? (inp.down('Space') ? 1 : 0) - (inp.down('KeyC') || inp.down('ControlLeft') ? 1 : 0) : 0;
    c.rotor = Math.min(1, c.rotor + dt * 0.6); const lift = c.rotor > 0.8;
    if (lift) { c.vel.x += (fx * fwd + -fz * side) * HELI_PILOT.acc * dt; c.vel.z += (fz * fwd + fx * side) * HELI_PILOT.acc * dt; }
    c.vel.x -= c.vel.x * HELI_PILOT.drag * dt; c.vel.z -= c.vel.z * HELI_PILOT.drag * dt; const hv = Math.hypot(c.vel.x, c.vel.z); if (hv > HELI_PILOT.vmax) { c.vel.x *= HELI_PILOT.vmax / hv; c.vel.z *= HELI_PILOT.vmax / hv; }
    c.vel.y += ((lift ? up * HELI_PILOT.climb : -2) - c.vel.y) * Math.min(1, dt * 2.5);
    c.pos.addScaledVector(c.vel, dt); c.pos.y = Math.min(c.pos.y, 160);
    const floor = collide(c, HELI_PILOT.radius); if (c.pos.y < floor) { if (c.vel.y < -8) hurt(c, (-c.vel.y - 8) * 40, false); c.pos.y = floor; c.vel.y = Math.max(0, c.vel.y); c.vel.x *= 0.9; c.vel.z *= 0.9; }
    if (A.t - (c.bumpT || -9) < 0.05 && hv > 12) hurt(c, hv * 2, false);
    tilt(c, dt);
    if (fire) chainGuns(c, dt);
  } else {
    A.aimYaw -= mdx * sens;
    const want = fwd > 0.2 ? TANK_PILOT.speed * Math.min(1, fwd) : fwd < -0.2 ? -TANK_PILOT.rev : 0; c.speed += (want - c.speed) * Math.min(1, dt * (want ? 0.9 : 2));
    c.heading -= side * TANK_PILOT.turn * dt * (c.speed < -0.5 ? -1 : 1); drive(c, dt);
    const tw = A.aimYaw - c.heading, te = Math.atan2(Math.sin(tw - c.turret), Math.cos(tw - c.turret)); c.turret += Math.sign(te) * Math.min(Math.abs(te), 1.6 * dt);
    c.gunPitch = Math.max(-0.12, Math.min(0.3, A.aimPitch + 0.12));
    c.fireT = (c.fireT || 0) - dt; if (fire && c.fireT <= 0) { c.fireT = TANK_PILOT.reload; fireShell(c, aimPoint(c), true); try { ctx.bus.emit('shot', { who: 'player', origin: c.pos.clone() }); } catch {} }
  }
  p.mounted.speed = c.kind === 'heli' ? Math.hypot(c.vel.x, c.vel.z) : Math.abs(c.speed);
  // the player rides inside (the cops aim here); the chase camera sits behind and above, looking where you aim
  p.position.set(c.pos.x, c.pos.y + (c.kind === 'heli' ? 0.6 : 1.6), c.pos.z); p.velocity?.set?.(0, 0, 0);
  A.camYaw += Math.atan2(Math.sin(A.aimYaw - A.camYaw), Math.cos(A.aimYaw - A.camYaw)) * Math.min(1, dt * 8);
  const back = c.kind === 'heli' ? 15 : 11, hgt = c.kind === 'heli' ? 4.5 : 4.2, cp = Math.cos(A.aimPitch);
  const cam = ctx.camera, fx = -Math.sin(A.camYaw), fz = -Math.cos(A.camYaw);
  cam.position.set(c.pos.x - fx * back * cp, c.pos.y + hgt - Math.sin(A.aimPitch) * back * 0.6, c.pos.z - fz * back * cp);
  cam.position.y = Math.max(cam.position.y, ground(cam.position.x, cam.position.z) + 0.6);
  cam.rotation.set(A.aimPitch - 0.12, A.camYaw, 0, 'YXZ'); p.yaw = A.camYaw; p.pitch = A.aimPitch; p.cameraPosition?.copy?.(cam.position);
  hudFrame(c);
}
/** where the reticle points: the first thing along the camera ray (or 200 m out) */
function aimPoint(c) {
  const cam = A.ctx.camera, rc = A.rc || (A.rc = new THREE.Raycaster()), dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion); rc.set(cam.position, dir); rc.far = 300;
  const hits = rc.intersectObjects(A.ctx.raycastTargets || [], true); for (const h of hits) { if (h.object.userData?.craft === c || h.distance < 8) continue; if (!h.object.visible && !h.object.userData?.soldier) continue; return h.point; }
  const t = dir.y < -0.01 ? (cam.position.y - ground(cam.position.x, cam.position.z)) / -dir.y : 220; return cam.position.clone().addScaledVector(dir, Math.min(t, 220));
}
function chainGuns(c, dt) {
  A.fireT -= dt; if (A.fireT > 0) return; A.fireT = 1 / HELI_PILOT.rof; A.gun ^= 1;
  const ctx = A.ctx, fx = ctx.weapons?.fx, o = gunMuzzle(c, A.gun), target = aimPoint(c), dir = target.clone().sub(o).normalize();
  dir.x += (Math.random() - 0.5) * 0.012; dir.y += (Math.random() - 0.5) * 0.012; dir.z += (Math.random() - 0.5) * 0.012; dir.normalize();
  const rc = A.rc2 || (A.rc2 = new THREE.Raycaster()); rc.set(o, dir); rc.far = HELI_PILOT.range; let hit = null;
  for (const h of rc.intersectObjects(ctx.raycastTargets || [], true)) { const ud = h.object.userData || {}; if (ud.craft === c) continue; if (!h.object.visible && !ud.soldier && !ud.remote) continue; hit = h; break; }
  let dist = HELI_PILOT.range;
  if (hit) { dist = hit.distance; const ud = hit.object.userData || {};
    if (ud.craftRef) hurt(ud.craftRef, HELI_PILOT.dmg * (ud.craftRef.kind === 'tank' ? BULLET_ON_TANK * 3 : 1), true);
    else if (typeof ud.onHit === 'function') { try { ud.onHit(HELI_PILOT.dmg, false, hit.point.clone(), dir.clone()); } catch {} try { fx?.impact?.(hit.point, dir.clone().negate(), 'flesh', dir); } catch {} }
    else if (ud.soldier) { try { ctx.ai?.damage?.(ud.soldier, HELI_PILOT.dmg, hit.point.clone(), false); } catch {} try { fx?.impact?.(hit.point, dir.clone().negate(), 'flesh', dir); } catch {} }
    else if (ud.remote) { try { ctx.net?.hit?.(ud.remote, HELI_PILOT.dmg, false, hit.point.clone()); } catch {} }
    else try { fx?.impact?.(hit.point, (hit.face?.normal || dir.clone().negate()).clone(), ud.surface || 'concrete', dir); } catch {} }
  else if (dir.y < 0) { const t = (o.y - ground(o.x, o.z)) / -dir.y; if (t < HELI_PILOT.range) { dist = t; try { fx?.impact?.(o.clone().addScaledVector(dir, t), new THREE.Vector3(0, 1, 0), 'concrete', dir); } catch {} } }
  try { fx?.tracer?.(o, dir, dist); fx?.muzzleLightAt?.(o, 0.7, 0.03); } catch {}
  try { ctx.audio?.play?.('m4a1', { position: o, volume: 0.7 }); } catch {}
  A.shotT -= 1 / HELI_PILOT.rof; if (A.shotT <= 0) { A.shotT = 0.5; try { ctx.bus.emit('shot', { who: 'player', origin: o.clone() }); } catch {} }
}
function hud(on) {
  if (!A.hud) { const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 96px);transform:translateX(-50%);padding:5px 12px;background:rgba(8,12,18,.55);border:1px solid rgba(120,170,255,.35);border-radius:4px;color:#dfe8ff;font:700 12px Barlow Condensed,Arial;letter-spacing:.14em;z-index:41;pointer-events:none;display:none;white-space:nowrap'; document.body.appendChild(d); A.hud = d; }
  A.hud.style.display = on ? 'block' : 'none';
}
function hudFrame(c) {
  A.hudT = (A.hudT || 0) + 1; if (A.hudT % 6) return;
  const hull = Math.max(0, Math.round(100 * c.hp / (c.kind === 'heli' ? HELI.hp : TANK.hp)));
  A.hud.textContent = c.kind === 'heli' ? `NYPD AIR · ALT ${Math.round(c.pos.y - ground(c.pos.x, c.pos.z))} M · ${Math.round(Math.hypot(c.vel.x, c.vel.z) * 3.6)} KM/H · HULL ${hull}%` : `TANK · ${Math.round(Math.abs(c.speed) * 3.6)} KM/H · ${c.fireT > 0 ? 'LOADING' : 'READY'} · ARMOR ${hull}%`;
}

// ---- shared: parking (solid when standing), hitboxes, visuals, wrecks ------------------------------------------------------
function park(c) { if (!c.box) { c.box = new THREE.Box3(); A.ctx.colliders.push(c.box); (A.own || (A.own = new Set())).add(c.box); }
  const r = c.kind === 'heli' ? 1.3 : 2.4, l = c.kind === 'heli' ? 2.6 : 3.8; c.box.min.set(c.pos.x - Math.max(r, l) * 0.8, c.pos.y, c.pos.z - Math.max(r, l) * 0.8); c.box.max.set(c.pos.x + Math.max(r, l) * 0.8, c.pos.y + (c.kind === 'heli' ? 2.6 : 2.4), c.pos.z + Math.max(r, l) * 0.8);
  try { A.ctx.player?.rebuildColliders?.(); } catch {} }
function unpark(c) { if (!c.box) return; c.box.min.set(0, -9999, 0); c.box.max.set(0.001, -9998, 0.001); try { A.ctx.player?.rebuildColliders?.(); } catch {} }
function place(c) { c.group.position.copy(c.pos); c.group.rotation.set(0, c.heading, 0); if (c.st === 'landed' || c.st === 'parked') park(c); }
function hitboxes(c) {
  const mat = new THREE.MeshBasicMaterial({ visible: false }), list = c.kind === 'heli' ? [[2.6, 2.2, 4.6, 0, 1.6, 0], [0.8, 0.9, 5.5, 0, 1.9, 4.2]] : [[4.4, 2.2, 7.6, 0, 1.2, 0], [2.9, 1.0, 3.8, 0, 2.6, 0.3]];
  c.hits = list.map(([w, h, d, x, y, z]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.userData = { craft: c, craftRef: c, surface: 'metal', onHit: (dmg) => { if (!m.userData.mine) hurt(c, dmg * (c.kind === 'tank' ? BULLET_ON_TANK : 1), true); } }; c.group.add(m); A.ctx.raycastTargets.push(m); return m; });
}
function visuals(c, dt) {
  if (c.kind === 'heli') { c.rotorG.rotation.y += dt * 28 * c.rotor; c.tailG.rotation.x += dt * 40 * c.rotor; c.blur.material.opacity = 0.22 * Math.max(0, c.rotor - 0.5) * 2; c.blades.visible = c.rotor < 0.85;
    c.group.position.copy(c.pos); c.group.rotation.set(c.pitch, c.heading, c.roll, 'YXZ');
    if (c.light) { c.light.visible = !!A.W.night && !c.dead && c.st !== 'parked' && c.st !== 'landed'; if (c.light.visible) { c.light.target.position.copy(A.ctx.player.position); c.light.target.updateMatrixWorld(); } } }
  else { c.group.position.copy(c.pos); c.group.rotation.set(0, c.heading, 0); c.turretG.rotation.y = c.turret; c.barrel.rotation.x = c.gunPitch || 0;
    c.recoil = Math.max(0, (c.recoil || 0) - dt * 3); c.barrel.position.z = -1.7 + c.recoil * 0.5; c.treadT = (c.treadT || 0) + Math.abs(c.speed) * dt; }
  if (c.flashT > 0) { c.flashT -= dt; }
}
function charred(c) { const m = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 }); c.group.traverse((o) => { if (o.isMesh && o.material?.visible !== false && !o.material?.transparent) o.material = m; }); }
function dispose(c) { A.world.scene.remove(c.group); for (const m of c.hits || []) { const i = A.ctx.raycastTargets.indexOf(m); if (i > -1) A.ctx.raycastTargets.splice(i, 1); } unpark(c); c.group.traverse((o) => { if (o.isMesh && o.geometry !== SHELL_GEO) o.geometry.dispose?.(); }); }

// ---- models (facing -z, like the cars) --------------------------------------------------------------------------------------
let HM = null;
function heliMats() { if (HM) return HM; const S = (c, r = 0.45, m = 0.2) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  return (HM = { white: S(0xf2f3f5, 0.35, 0.25), blue: S(0x1b3c94, 0.4, 0.3), glass: S(0x0d1622, 0.08, 0.6), dark: S(0x2a2c30, 0.5, 0.7), blur: new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }), decal: decalMat() }); }
function decalMat() { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const g = cv.getContext('2d'); g.fillStyle = '#1b3c94'; g.font = '900 52px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('NYPD', 128, 34);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }); }
function heliModel() {
  const M = heliMats(), lite = !!A.ctx.lite, group = new THREE.Group(), G = new Map(), put = (m, g, x, y, z, rx = 0, ry = 0, rz = 0) => { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); (G.get(m) || G.set(m, []).get(m)).push(g.index ? g.toNonIndexed() : g); };
  { const g = new THREE.SphereGeometry(1.25, 16, 12); g.scale(1.05, 1.0, 1.85); put(M.white, g, 0, 1.6, 0); }
  { const g = new THREE.SphereGeometry(1.2, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42); g.scale(1.02, 0.95, 1.2); put(M.glass, g, 0, 1.55, -0.95, -Math.PI / 2 + 0.35); }
  put(M.blue, new THREE.BoxGeometry(2.66, 0.32, 3.4), 0, 1.25, 0.1);
  put(M.white, new THREE.CylinderGeometry(0.2, 0.42, 5.4, 10), 0, 1.85, 4.1, Math.PI / 2);
  put(M.blue, new THREE.BoxGeometry(0.12, 1.5, 0.9), 0, 2.5, 6.55, 0.25); put(M.blue, new THREE.BoxGeometry(1.7, 0.08, 0.45), 0, 1.9, 5.7);
  put(M.white, new THREE.BoxGeometry(1.0, 0.55, 1.8), 0, 2.72, 0.45); put(M.dark, new THREE.CylinderGeometry(0.1, 0.12, 0.6, 8), 0, 3.1, 0);
  for (const s of [-1, 1]) { put(M.dark, new THREE.CylinderGeometry(0.06, 0.06, 3.8, 6), s * 0.95, 0.08, 0, Math.PI / 2); for (const z of [-0.8, 0.8]) put(M.dark, new THREE.BoxGeometry(0.07, 0.95, 0.07), s * 0.9, 0.52, z, 0, 0, s * 0.18);
    put(M.dark, new THREE.BoxGeometry(0.9, 0.1, 0.3), s * 1.3, 1.0, -0.2); put(M.dark, new THREE.BoxGeometry(0.28, 0.28, 0.8), s * 1.75, 0.95, -0.3);
    for (const k of [-0.06, 0.06]) put(M.dark, new THREE.CylinderGeometry(0.045, 0.045, 1.3, 6), s * 1.75 + k, 0.95, -1.1, Math.PI / 2); }
  for (const [m, list] of G) { const mesh = new THREE.Mesh(mergeGeometries(list, false), m); mesh.castShadow = !lite; group.add(mesh); }
  for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.38), M.decal); d.position.set(s * 1.33, 1.62, 0.35); d.rotation.y = s * Math.PI / 2; group.add(d); }
  const rotorG = new THREE.Group(); rotorG.position.set(0, 3.38, 0); group.add(rotorG);
  const blades = new THREE.Mesh(mergeGeometries([new THREE.BoxGeometry(10.6, 0.05, 0.3), new THREE.BoxGeometry(0.3, 0.05, 10.6)], false), M.dark); rotorG.add(blades);
  const blur = new THREE.Mesh(new THREE.CircleGeometry(5.3, 28).rotateX(-Math.PI / 2), M.blur.clone()); rotorG.add(blur);
  const tailG = new THREE.Group(); tailG.position.set(0.18, 2.55, 6.6); group.add(tailG); tailG.add(new THREE.Mesh(mergeGeometries([new THREE.BoxGeometry(0.04, 1.5, 0.14), new THREE.BoxGeometry(0.04, 0.14, 1.5)], false), M.dark));
  let light = null; if (!lite) { light = new THREE.SpotLight(0xf4f7ff, 900, 120, 0.22, 0.5, 1.2); light.position.set(0, 0.8, -2); light.visible = false; group.add(light); group.add(light.target); }
  return { group, rotorG, tailG, blades, blur, light };
}
function tankModel() {
  const lite = !!A.ctx.lite, S = (c, r = 0.75, m = 0.25) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const M = { olive: S(0x4f5532), dark: S(0x1f201c, 0.9, 0.2), steel: S(0x3a3d35, 0.6, 0.5) };
  const group = new THREE.Group(), G = new Map(), put = (m, g, x, y, z, rx = 0, ry = 0, rz = 0) => { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); (G.get(m) || G.set(m, []).get(m)).push(g.index ? g.toNonIndexed() : g); };
  put(M.olive, new THREE.BoxGeometry(3.5, 1.0, 6.9), 0, 1.15, 0.2); put(M.olive, new THREE.BoxGeometry(3.5, 0.8, 1.4), 0, 1.25, -3.55, -0.55);
  for (const s of [-1, 1]) { put(M.dark, new THREE.BoxGeometry(0.75, 1.1, 7.6), s * 2.0, 0.6, 0); put(M.olive, new THREE.BoxGeometry(0.1, 0.65, 7.0), s * 2.42, 1.05, 0);
    for (let i = 0; i < 7; i++) put(M.steel, new THREE.CylinderGeometry(0.36, 0.36, 0.2, 10), s * 2.4, 0.45, -3 + i, 0, 0, Math.PI / 2); }
  for (const [m, list] of G) { const mesh = new THREE.Mesh(mergeGeometries(list, false), m); mesh.castShadow = !lite; mesh.receiveShadow = true; group.add(mesh); }
  const turretG = new THREE.Group(); turretG.position.set(0, 1.65, 0.4); group.add(turretG);
  const T = new Map(), tput = (m, g, x, y, z, rx = 0, ry = 0) => { g.rotateX(rx); g.rotateY(ry); g.translate(x, y, z); (T.get(m) || T.set(m, []).get(m)).push(g.index ? g.toNonIndexed() : g); };
  tput(M.olive, new THREE.BoxGeometry(2.8, 0.8, 3.4), 0, 0.4, 0.3); tput(M.olive, new THREE.BoxGeometry(2.4, 0.7, 1.0), 0, 0.38, -1.6, 0.3);
  tput(M.steel, new THREE.CylinderGeometry(0.42, 0.42, 0.25, 12), 0.6, 0.92, 0.6); tput(M.steel, new THREE.BoxGeometry(0.5, 0.4, 0.8), -0.85, 0.95, 1.2);
  for (const [m, list] of T) { const mesh = new THREE.Mesh(mergeGeometries(list, false), m); mesh.castShadow = !lite; turretG.add(mesh); }
  const barrel = new THREE.Group(); barrel.position.set(0, 0.45, -1.7); turretG.add(barrel);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 5.2, 10).rotateX(Math.PI / 2).translate(0, 0, -2.6), M.steel); tube.castShadow = !lite; barrel.add(tube);
  const mant = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.5), M.olive); barrel.add(mant);
  const gunTip = new THREE.Object3D(); gunTip.position.set(0, 0, -5.4); barrel.add(gunTip);
  return { group, turretG, barrel, gunTip };
}
