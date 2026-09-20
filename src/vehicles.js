// Rideable vehicles (motorcycles). Owned by: VEHICLES agent. See CONTRACT.md "Vehicles".
// Runs BEFORE player: while ctx.player.mounted is set this module drives player position/yaw/pitch and the camera.
import * as THREE from 'three';
import { buildBike, WHEEL_R, WHEELBASE, FRONT_Z, REAR_Z } from './vehicles/bike.js';
import { BoxGrid, resolveCircle, rectBlocked } from './vehicles/collide.js';

// ---- tunables ----
const MAX_SPEED = 22, REV_MAX = 4.5, ACCEL = 9.5, BRAKE = 11, HARD_BRAKE = 17, DRAG = 0.4, ROLL_FRICTION = 0.5;
const STEER_LOW = 0.42, STEER_HIGH = 0.05, STEER_RATE = 5.5, STEER_RETURN = 7;
const LEAN_MAX = THREE.MathUtils.degToRad(12), LOOK_YAW = THREE.MathUtils.degToRad(60), LOOK_PITCH = THREE.MathUtils.degToRad(35);
const SEAT_Y = 0.85, EYE_UP = 0.58, EYE_BACK = 0.34, MOUNT_DIST = 2.0, BODY_R = 0.42;
const FOV_KICK = 9, BOUNCE = 0.28, HIT_LOSS = 0.55;
const DEG = Math.PI / 180;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _res = { x: 0, z: 0, nx: 0, nz: 0, depth: 0, hit: false };

let C = null; // ctx
const S = {
  grid: new BoxGrid(4), bikes: [], mounted: null, api: null,
  // rider view
  lookYaw: 0, lookPitch: 0, wroteYaw: 0, wrotePitch: 0, idleT: 0, roll: 0, vib: 0, fovBase: 75, fovWritten: -1, prevSlot: null, mountT: 0,
  toastT: 0, revT: 0, qa: null, uiMount: false,
};

function groundY(x, z) { const g = C.world?.groundHeight; return g ? g(x, z) : 0; }
const STEP_UP = 0.5; // bikes ride over anything this low (kerbs, rails, stair steps)
/** Floor under (x,z) for something currently at height yRef: highest of world.groundHeight / collider tops that is ≤ yRef+STEP_UP; keeps yRef when nothing qualifies (multi-level maps whose groundHeight reports the level above). */
function floorAt(x, z, yRef, skip = null) {
  let best = -Infinity; const gy = groundY(x, z); if (gy <= yRef + STEP_UP) best = gy;
  const boxes = S.grid.query(x - 0.3, z - 0.3, x + 0.3, z + 0.3);
  for (let i = 0; i < boxes.length; i++) { const b = boxes[i]; if (b === skip) continue; if (b.min.x > x + 0.3 || b.max.x < x - 0.3 || b.min.z > z + 0.3 || b.max.z < z - 0.3) continue; const t = b.max.y; if (t <= yRef + STEP_UP && t > best && b.min.y < t) best = t; }
  return best === -Infinity ? yRef : best;
}
function inBounds(x, z, pad = 1) { const b = C.world?.bounds; return !b || (x > b.min.x + pad && x < b.max.x - pad && z > b.min.z + pad && z < b.max.z - pad); }

// ---------- bike object ----------
function makeBike(x, z, yaw, yRef = 0) {
  const parts = buildBike(C);
  const bike = {
    ...parts, home: { x, z, yaw, y: floorAt(x, z, yRef) },
    pos: new THREE.Vector3(x, floorAt(x, z, yRef), z), vy: 0, heading: yaw, vel: new THREE.Vector3(), speed: 0, fwdSpeed: 0,
    steer: 0, lean: 0, susp: 0, suspV: 0, spin: 0, skid: 0, throttle: 0, parked: true, box: new THREE.Box3(),
    hitT: 0,
  };
  bike.group.position.copy(bike.pos); bike.group.rotation.y = yaw;
  for (const m of bike.meshes) { m.userData.vehicle = bike; C.raycastTargets.push(m); }
  C.scene.add(bike.group);
  parkBox(bike); C.colliders.push(bike.box);
  S.bikes.push(bike);
  return bike;
}
function parkBox(bike) {
  const c = Math.cos(bike.heading), s = Math.sin(bike.heading);
  const hx = Math.abs(c) * 0.45 + Math.abs(s) * 1.05, hz = Math.abs(s) * 0.45 + Math.abs(c) * 1.05;
  bike.box.min.set(bike.pos.x - hx, bike.pos.y, bike.pos.z - hz); bike.box.max.set(bike.pos.x + hx, bike.pos.y + 1.1, bike.pos.z + hz);
}
function unparkBox(bike) { bike.box.min.set(0, -9999, 0); bike.box.max.set(0.001, -9998, 0.001); rebuildGrids(); }
function rebuildGrids() { S.grid.build(C.colliders); try { C.player?.rebuildColliders?.(); } catch {} }
function fwdOf(h, out) { return out.set(-Math.sin(h), 0, -Math.cos(h)); }

// ---------- placement ----------
function spotFree(x, z, yRef = 0, ignoreBox = null) {
  if (!inBounds(x, z, 2.5)) return false;
  const y = floorAt(x, z, yRef);
  if (Math.abs(y - yRef) > 0.02) return false; // same level as the spawn it belongs to (not on rails / kerbs / steps)
  if (rectBlocked(S.grid, x - 1.6, z - 1.6, x + 1.6, z + 1.6, y + 0.15, y + 1.6, ignoreBox)) return false;
  for (const b of S.bikes) if (Math.hypot(b.pos.x - x, b.pos.z - z) < 3.2) return false;
  for (const s of C.world?.playerSpawns || []) if (Math.hypot(s.x - x, s.z - z) < 1.8) return false;
  return true;
}
function placeBikes() {
  const W = C.world; S.grid.build(C.colliders);
  const spots = Array.isArray(W?.vehicleSpots) ? W.vehicleSpots : null;
  if (spots && spots.length) { for (const s of spots.slice(0, 5)) makeBike(s.x, s.z, s.yaw ?? 0, s.y ?? 0); if (S.bikes.length >= 3) return; }
  const spawns = (W?.playerSpawns?.length ? W.playerSpawns : [new THREE.Vector3(0, 0, 0)]);
  const want = 4, R = C.rng;
  let tries = 0;
  while (S.bikes.length < want && tries++ < 400) {
    const s = spawns[Math.floor(R() * spawns.length) % spawns.length];
    const a = R() * Math.PI * 2, d = 2.5 + R() * 7;
    const x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
    if (!spotFree(x, z, s.y)) continue;
    // face roughly toward the map centre (open ground), with jitter
    const cx = W?.bounds ? (W.bounds.min.x + W.bounds.max.x) / 2 : 0, cz = W?.bounds ? (W.bounds.min.z + W.bounds.max.z) / 2 : 0;
    const yaw = Math.atan2(-(cx - x), -(cz - z)) + (R() - 0.5) * 0.9;
    makeBike(x, z, yaw, s.y);
  }
  // guarantee ≥ 3: relax to any free ring cell around the first spawn
  const s0 = spawns[0];
  for (let d = 3; S.bikes.length < 3 && d < 30; d += 1.5) for (let i = 0; i < 16 && S.bikes.length < 3; i++) { const a = i / 16 * Math.PI * 2; const x = s0.x + Math.cos(a) * d, z = s0.z + Math.sin(a) * d; if (spotFree(x, z, s0.y)) makeBike(x, z, a + Math.PI / 2, s0.y); }
}

// ---------- mount / dismount ----------
function mount(bike) {
  const p = C.player; if (!bike || !p || S.mounted) return false;
  S.mounted = bike; p.mounted = bike; bike.parked = false; unparkBox(bike);
  bike.headlight.visible = true; bike.headlight.intensity = 260; bike.lens.material.emissiveIntensity = 3.5;
  S.lookYaw = wrap(p.yaw - bike.heading); S.lookYaw = clamp(S.lookYaw, -LOOK_YAW, LOOK_YAW); S.lookPitch = clamp(p.pitch, -LOOK_PITCH, LOOK_PITCH);
  S.idleT = 0; S.roll = 0; S.mountT = 0; S.vib = 0;
  S.fovBase = C.settings.fov; S.fovWritten = -1;
  const w = C.weapons; S.prevSlot = null;
  if (w?.swap) { const cur = w.current?.slot ?? w.slot ?? 0; if (cur !== 1) { try { if (w.swap(1)) S.prevSlot = cur; } catch {} } }
  try { C.audio?.play?.('bike_idle', { position: bike.pos, volume: 0.6 }); } catch {}
  C.bus.emit('vehicle', { stage: 'mount', bike });
  C.hud?.toast?.('F — DISMOUNT · W/S THROTTLE · SPACE BRAKE', 2200);
  // first frame: write player + camera immediately so nothing pops
  applyRider(0);
  return true;
}
function dismount() {
  const bike = S.mounted, p = C.player; if (!bike || !p) return false;
  // pick a free spot: left, right, behind, front
  fwdOf(bike.heading, _f); _r.set(-_f.z, 0, _f.x);
  const y = bike.pos.y; let placed = false;
  const cands = [[-1.0, 0], [1.0, 0], [0, 1.6], [0, -1.9], [-1.5, 0.8], [1.5, 0.8]];
  for (const [sx, sz] of cands) {
    const x = bike.pos.x + _r.x * sx + _f.x * -sz, z = bike.pos.z + _r.z * sx + _f.z * -sz;
    if (!inBounds(x, z, 0.6)) continue;
    const gy = floorAt(x, z, bike.pos.y, bike.box);
    if (rectBlocked(S.grid, x - 0.36, z - 0.36, x + 0.36, z + 0.36, gy + 0.05, gy + 1.75, bike.box)) continue;
    p.teleport(x, gy, z, bike.heading + S.lookYaw, S.lookPitch); placed = true; break;
  }
  if (!placed) p.teleport(bike.pos.x - _r.x, y, bike.pos.z - _r.z, bike.heading + S.lookYaw, S.lookPitch);
  p.mounted = null; S.mounted = null;
  bike.vel.set(0, 0, 0); bike.speed = bike.fwdSpeed = 0; bike.throttle = 0; bike.parked = true; parkBox(bike); rebuildGrids();
  bike.headlight.visible = false; bike.headlight.intensity = 0; bike.lens.material.emissiveIntensity = 0.15;
  bike.body.rotation.z = 0; bike.lean = 0; bike.group.rotation.set(0, bike.heading, 0);
  if (S.fovWritten > 0 && Math.abs(C.settings.fov - S.fovWritten) < 1e-6) C.settings.fov = S.fovBase; S.fovWritten = -1;
  const w = C.weapons; if (S.prevSlot != null && w?.swap) { try { w.swap(S.prevSlot); } catch {} } S.prevSlot = null;
  C.bus.emit('vehicle', { stage: 'dismount', bike });
  return true;
}

// ---------- physics ----------
function stepBike(bike, dt, inThr, inBrake, inHard, inSteer) {
  const p = bike.pos, v = bike.vel;
  fwdOf(bike.heading, _f); _r.set(-_f.z, 0, _f.x);
  let fs = v.x * _f.x + v.z * _f.z;         // forward component
  let ls = v.x * _r.x + v.z * _r.z;         // lateral (slide)
  // throttle / brake / reverse
  bike.throttle = damp(bike.throttle, inThr, 10, dt);
  if (inThr > 0 && fs >= -0.5) fs += ACCEL * (1 - clamp(fs / MAX_SPEED, 0, 1) * 0.62) * inThr * dt;
  if (inBrake > 0) { if (fs > 0.3) fs = Math.max(0, fs - BRAKE * inBrake * dt); else fs = Math.max(-REV_MAX, fs - ACCEL * 0.5 * inBrake * dt); }
  if (inHard) { const d = HARD_BRAKE * dt; fs = fs > 0 ? Math.max(0, fs - d) : Math.min(0, fs + d); }
  // passive: drag + rolling friction
  fs -= fs * DRAG * 0.06 * dt * Math.abs(fs) / 10 + Math.sign(fs) * Math.min(Math.abs(fs), ROLL_FRICTION * dt);
  fs = clamp(fs, -REV_MAX, MAX_SPEED);
  // steering: rate falls with speed
  const k = clamp(Math.abs(fs) / MAX_SPEED, 0, 1);
  const steerMax = STEER_LOW + (STEER_HIGH - STEER_LOW) * Math.pow(k, 0.4);
  const target = inSteer * steerMax;
  bike.steer = damp(bike.steer, target, inSteer !== 0 ? STEER_RATE : STEER_RETURN, dt);
  // yaw from bicycle model (only turns when rolling); reverse steers the other way like a real bike
  const yawRate = (Math.abs(fs) > 0.05) ? -fs / WHEELBASE * Math.tan(bike.steer) : 0; // heading increases = left turn
  // hard-brake rear slide: extra yaw + lateral slip in the direction of steer
  const sliding = inHard && Math.abs(fs) > 3;
  bike.skid = damp(bike.skid, sliding ? 1 : 0, sliding ? 6 : 4, dt);
  const extraYaw = yawRate * bike.skid * 0.9 * dt;
  bike.heading += yawRate * dt + extraYaw;
  ls += fs * extraYaw;                          // the rear steps out: velocity lags the new heading
  ls = damp(ls, 0, 4 + (1 - bike.skid) * 10, dt);   // tyres regain grip
  // compose velocity
  fwdOf(bike.heading, _f); _r.set(-_f.z, 0, _f.x);
  v.set(_f.x * fs + _r.x * ls, 0, _f.z * fs + _r.z * ls);
  // integrate + collide (two circles: front & rear axle) with slide, speed loss, small bounce
  const nx0 = p.x + v.x * dt, nz0 = p.z + v.z * dt;
  let px = nx0, pz = nz0, hitN = null;
  const y0 = p.y + STEP_UP, y1 = p.y + 1.25;
  for (let i = 0; i < 2; i++) {
    const az = i === 0 ? FRONT_Z : REAR_Z; const ax = px - _f.x * az, azz = pz - _f.z * az; // axle world pos (fwd = -Z → -az along fwd)
    if (resolveCircle(S.grid, ax, azz, BODY_R, y0, y1, bike.box, _res)) { px += _res.x - ax; pz += _res.z - azz; if (!hitN || _res.depth > hitN.depth) hitN = { nx: _res.nx, nz: _res.nz, depth: _res.depth }; }
  }
  if (hitN) {
    const vn = v.x * hitN.nx + v.z * hitN.nz;
    if (vn < 0) {
      const severity = clamp(-vn / 8, 0, 1);
      v.x -= hitN.nx * vn * (1 + BOUNCE); v.z -= hitN.nz * vn * (1 + BOUNCE);
      v.multiplyScalar(1 - HIT_LOSS * severity);
      bike.suspV -= 1.5 * severity; bike.hitT = 0.25 * severity + 0.05;
      if (severity > 0.25) { try { C.audio?.play?.('impact', { position: p, volume: severity }); } catch {} }
      // heading nudges away from the wall a little (scrape)
      const away = Math.atan2(-hitN.nx, -hitN.nz); bike.heading += wrap(away - bike.heading) * 0.15 * severity;
    }
  }
  // bounds
  const b = C.world?.bounds;
  if (b) {
    if (px < b.min.x + 1.2) { px = b.min.x + 1.2; if (v.x < 0) { v.x = -v.x * BOUNCE; v.z *= 0.6; } }
    if (px > b.max.x - 1.2) { px = b.max.x - 1.2; if (v.x > 0) { v.x = -v.x * BOUNCE; v.z *= 0.6; } }
    if (pz < b.min.z + 1.2) { pz = b.min.z + 1.2; if (v.z < 0) { v.z = -v.z * BOUNCE; v.x *= 0.6; } }
    if (pz > b.max.z - 1.2) { pz = b.max.z - 1.2; if (v.z > 0) { v.z = -v.z * BOUNCE; v.x *= 0.6; } }
  }
  p.x = px; p.z = pz;
  // ground follow: step up smoothly, fall under gravity
  const gy = floorAt(px, pz, p.y, bike.box); const dy = gy - p.y;
  if (dy >= -0.02) { p.y = damp(p.y, gy, 18, dt); bike.vy = 0; bike.suspV += -dy * 4; }
  else { bike.vy -= 20 * dt; p.y += bike.vy * dt; if (p.y <= gy) { p.y = gy; bike.suspV += bike.vy * 0.6; bike.vy = 0; } }
  // derived
  fs = v.x * _f.x + v.z * _f.z; bike.fwdSpeed = fs; bike.speed = v.length();
  // lean: from lateral acceleration, capped ±12°, plus counter-lean from slide
  const leanT = clamp(-(yawRate * fs) / 9.81, -1, 1) * LEAN_MAX * 1.35 + bike.skid * bike.steer * 0.35;
  bike.lean = damp(bike.lean, clamp(leanT, -LEAN_MAX * 1.4, LEAN_MAX * 1.4), 7, dt);
  // suspension: spring on vertical offset excited by throttle/brake changes + speed rumble
  const kS = 90, cS = 9;
  bike.suspV += (-kS * bike.susp - cS * bike.suspV) * dt - (inThr - inBrake - (inHard ? 1.4 : 0)) * 0.5 * dt * Math.min(1, Math.abs(fs) / 6 + 0.3);
  bike.susp += bike.suspV * dt; bike.susp = clamp(bike.susp, -0.09, 0.06);
  bike.spin += fs / WHEEL_R * dt;
  bike.hitT = Math.max(0, bike.hitT - dt);
  // visuals
  bike.group.position.copy(p); bike.group.rotation.set(0, bike.heading, 0);
  bike.body.position.y = bike.susp; bike.body.rotation.z = -bike.lean; bike.body.rotation.x = -bike.suspV * 0.04;
  bike.fork.rotation.y = -bike.steer * 0.85; bike.wheelF.rotation.x = -bike.spin; bike.wheelR.rotation.x = -bike.spin;
}

// ---------- rider (player + camera) ----------
function applyRider(dt) {
  const bike = S.mounted, p = C.player, cam = C.camera; if (!bike || !p) return;
  fwdOf(bike.heading, _f); _r.set(-_f.z, 0, _f.x);
  const leanS = Math.sin(bike.lean);
  // player capsule sits on the seat (feet at seat height so the hitbox spans the rider)
  p.position.set(bike.pos.x + _r.x * leanS * 0.4, bike.pos.y + SEAT_Y * 0.55 + bike.susp, bike.pos.z + _r.z * leanS * 0.4);
  p.velocity.set(0, 0, 0); p.onGround = true; p.height = 1.7;
  // camera: seated eye, lean into the turn, suspension bob, engine vibration
  const eyeH = bike.pos.y + SEAT_Y + EYE_UP + bike.susp * 1.2;
  const rpm = 8 + Math.abs(bike.fwdSpeed) * 2.2 + bike.throttle * 6; S.vib += dt * rpm * 2.4;
  const vibA = 0.0035 + bike.throttle * 0.006 + Math.min(1, Math.abs(bike.fwdSpeed) / 12) * 0.004 + bike.hitT * 0.05;
  const vx = Math.sin(S.vib * 1.7) * vibA, vy = Math.sin(S.vib) * vibA * 0.8;
  _v.set(bike.pos.x, eyeH, bike.pos.z).addScaledVector(_f, -EYE_BACK).addScaledVector(_r, leanS * (SEAT_Y + EYE_UP) * 0.85 + vx);
  _v.y -= (1 - Math.cos(bike.lean)) * (SEAT_Y + EYE_UP) + vy * 0.5; _v.y += vy;
  S.roll = damp(S.roll, -bike.lean * 0.8 + bike.skid * bike.steer * 0.15, 10, dt || 1);
  const yaw = bike.heading + S.lookYaw, pitch = clamp(S.lookPitch - bike.suspV * 0.03 + Math.sin(S.vib * 0.9) * vibA * 0.5, -LOOK_PITCH - 0.1, LOOK_PITCH + 0.1);
  p.yaw = yaw; p.pitch = pitch; S.wroteYaw = yaw; S.wrotePitch = pitch;
  if (cam) { cam.position.copy(_v); cam.rotation.set(pitch, yaw, S.roll); p.cameraPosition?.copy(_v); }
}

function nearestBike(maxDist = Infinity) {
  const p = C.player; if (!p) return null; let best = null, bd = maxDist;
  for (const b of S.bikes) { const d = Math.hypot(b.pos.x - p.position.x, b.pos.z - p.position.z); if (d < bd) { bd = d; best = b; } }
  return best;
}

// ---------- module ----------
export async function init(ctx) {
  C = ctx;
  try { placeBikes(); } catch (e) { console.error('[vehicles] placement failed', e); }
  ctx.bus.on('ui:mount', () => { S.uiMount = true; });
  const api = {
    list: S.bikes, get mounted() { return S.mounted; }, nearBike: null,
    mount: (bike) => mount(bike || nearestBike()), dismount,
    qaSpawn(x, z, yaw = 0, y = ctx.player?.position.y ?? 0) { S.grid.sync(ctx.colliders); const b = makeBike(x, z, yaw, y); S.grid.build(ctx.colliders); ctx.player?.rebuildColliders?.(); return b; },
    qaMount() { const b = nearestBike(); if (!b) return false; return mount(b); },
    /** Drive with fixed inputs for `seconds`; resolves when done. throttle: -1..1 (negative = brake/reverse), steer: -1..1 (+ = right), opts {hard} */
    qaDrive(throttle = 1, steer = 0, seconds = 3, opts = {}) { if (!S.mounted) api.qaMount(); if (!S.mounted) return Promise.resolve(false); if (S.qa) S.qa.res(false); return new Promise((res) => { S.qa = { thr: throttle, steer, t: seconds, hard: !!opts.hard, res }; }); },
    qaState() { const b = S.mounted; return b ? { x: b.pos.x, y: b.pos.y, z: b.pos.z, heading: b.heading, speed: b.speed, fwd: b.fwdSpeed, lean: b.lean, steer: b.steer } : null; },
  };
  S.api = api; return api;
}

export function update(dt, ctx) {
  const p = ctx.player; if (!p) return;
  const input = ctx.input;
  S.grid.sync(ctx.colliders);
  const playing = ctx.state === 'playing' && !p.dead;
  if (S.mounted && p.dead) { dismount(); return; }
  // F is only consumed when it means something to us (mounted, or a bike in reach that is closer than a weapon pickup) — ai.js reads it for gun pickups after us
  const fHeld = playing && (input.pressed?.has?.('KeyF') || S.uiMount); S.uiMount = false;
  if (!S.mounted) {
    const b = nearestBike(MOUNT_DIST); S.api.nearBike = b;
    if (b && playing) {
      const dBike = Math.hypot(b.pos.x - p.position.x, b.pos.z - p.position.z);
      const dGun = ctx.ai?.nearPickupDist; const gunWins = typeof dGun === 'number' && dGun < dBike;
      if (!gunWins) { S.toastT -= dt; if (S.toastT <= 0) { S.toastT = 0.35; ctx.hud?.toast?.('F — RIDE', 600); } if (fHeld) { input.pressed?.delete?.('KeyF'); mount(b); } }
    }
    return;
  }
  S.api.nearBike = null;
  if (fHeld) { input.pressed?.delete?.('KeyF'); dismount(); return; }
  if (dt <= 0) { applyRider(0); return; }
  const bike = S.mounted;
  // read look deltas the player applied after our last write (mouse + recoil) into the free-look offset
  S.lookYaw += wrap(p.yaw - S.wroteYaw); S.lookPitch += p.pitch - S.wrotePitch;
  S.mountT += dt;
  const moved = Math.abs(input.mouse?.dx || 0) + Math.abs(input.mouse?.dy || 0) > 0.5;
  S.idleT = moved ? 0 : S.idleT + dt;
  S.lookYaw = clamp(S.lookYaw, -LOOK_YAW, LOOK_YAW); S.lookPitch = clamp(S.lookPitch, -LOOK_PITCH, LOOK_PITCH);
  if (S.idleT > 0.6) { S.lookYaw = damp(S.lookYaw, 0, 3.5, dt); S.lookPitch = damp(S.lookPitch, 0, 2.5, dt); }
  // inputs
  let thr = 0, brake = 0, hard = false, steer = 0;
  if (S.qa) { const q = S.qa; thr = Math.max(0, q.thr); brake = Math.max(0, -q.thr); hard = q.hard; steer = q.steer; q.t -= dt; if (q.t <= 0) { S.qa = null; q.res(); } }
  else if (ctx.state === 'playing') {
    thr = input.forward ? 1 : 0; brake = input.back ? 1 : 0; hard = !!input.jump; steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const ax = input.touch?.axis?.x || 0; if (Math.abs(ax) > 0.3) steer = clamp(ax * 1.4, -1, 1);
  }
  // physics (substep for stability at low fps)
  const n = dt > 1 / 45 ? 2 : 1;
  for (let i = 0; i < n; i++) stepBike(bike, dt / n, thr, brake, hard, steer);
  // speed FOV kick: written through settings.fov so weapons' ADS fov logic composes with it
  {
    if (S.fovWritten > 0 && Math.abs(ctx.settings.fov - S.fovWritten) > 1e-6) S.fovBase = ctx.settings.fov; // user moved the slider while riding
    const kick = FOV_KICK * clamp(Math.abs(bike.fwdSpeed) / MAX_SPEED, 0, 1) ** 1.3;
    S.fovWritten = S.fovBase + kick; ctx.settings.fov = S.fovWritten;
  }
  // audio
  S.revT -= dt;
  if (thr > 0 && S.revT <= 0) { S.revT = 1.6; try { ctx.audio?.play?.('bike_rev', { position: bike.pos, volume: 0.5 + 0.5 * clamp(bike.speed / MAX_SPEED, 0, 1) }); } catch {} }
  applyRider(dt);
}

export function reset(ctx) {
  if (S.mounted) dismount();
  for (const b of S.bikes) {
    b.pos.set(b.home.x, b.home.y, b.home.z); b.vy = 0; b.heading = b.home.yaw; b.vel.set(0, 0, 0); b.speed = b.fwdSpeed = 0; b.steer = b.lean = b.susp = b.suspV = b.skid = 0;
    b.group.position.copy(b.pos); b.group.rotation.set(0, b.heading, 0); b.body.position.y = 0; b.body.rotation.set(0, 0, 0); b.fork.rotation.y = 0; b.parked = true; parkBox(b);
  }
  S.qa = null; S.lookYaw = S.lookPitch = 0;
}
