// Rideable vehicles: motorcycles + drivable cars (stolen off the kerb in hangout mode). Owned by: VEHICLES agent. See CONTRACT.md "Vehicles".
// Runs BEFORE player: while ctx.player.mounted is set this module drives player position/yaw/pitch and the camera.
// Physics: arcade single-track model shared by bikes and cars (per-spec tuning), variable sub-steps ≤ 1/120 s so handling is
// identical at 30/60/120 fps; tyre grip as lateral-slip decay (handbrake drops rear grip → slides), surface grip (sand),
// ground follow with ramp launch, circle-vs-AABB collisions. Cameras: first person (driver's seat / on the bike) and a
// third-person chase cam (V key / CAM button) with wall avoidance. Running people over: ctx.ai.damage for local soldiers,
// bus 'vehicleHit' {peerId, speed, damage, point} for remote players (net.js turns it into a hit).
import * as THREE from 'three';
import { buildBike, buildRider, WHEEL_R, WHEELBASE, FRONT_Z, REAR_Z } from './vehicles/bike.js';
import { BoxGrid, resolveCircle, rectBlocked, segmentHit } from './vehicles/collide.js';
import { carGeometries, carMaterials, carSpec, carEye, carInterior } from './world/carkit.js';

const DEG = Math.PI / 180;
const LOOK_PITCH = 35 * DEG, LEAN_MAX = 12 * DEG;
const FOV_KICK = 9, BOUNCE = 0.28, HIT_LOSS = 0.55, GRAV = 17, MAX_STEP = 1 / 120;
// ---- per-vehicle handling + rider geometry ----
// accel: launch acceleration (v = max·tanh(a·t/max)); brake/hard: service brake / handbrake decel; grip: lateral slip decay /s
// (hardGrip while the handbrake is on); latG: cornering limit in g (caps steering angle with speed); circles: collision circles
// along the body (local z, - = front); band: collide with boxes whose top is above pos.y+band (lower ones are driven over);
// eyeH/eyeBack/eyeSide: first-person eye above the ground / behind centre / right of centre; reach: mount distance from the body.
const BIKE_SPEC = {
  car: false, kind: 'bike', max: 22, revMax: 4.5, accel: 9.5, brake: 11, hard: 17, hardYaw: 0.9, grip: 16, hardGrip: 4, latG: 1.25, steerLow: 0.42,
  wheelbase: WHEELBASE, circles: [FRONT_Z, REAR_Z], bodyR: 0.42, band: 0.5, stepUp: 0.5, h: 1.25, leanK: 1,
  eyeH: 1.43, eyeBack: 0.34, eyeSide: 0, reach: 1.2, hx: 0.45, hz: 1.05, boxH: 1.1, lookYaw: 60 * DEG,
  chaseD: 4.4, chaseH: 0.32, chaseLook: 1.45, hitMul: 8, hitSlow: 0.75, engineBrake: 0.6,
};
const CAR_BASE = {
  car: true, max: 30, revMax: 7, accel: 9, brake: 13, hard: 5.5, hardYaw: 1.3, grip: 13, hardGrip: 1.1, latG: 1.05, steerLow: 0.6,
  band: 0.28, stepUp: 0.36, leanK: -0.2, lookYaw: 110 * DEG, chaseD: 6.8, chaseH: 0.3, chaseLook: 1.6, hitMul: 12, hitSlow: 0.9, engineBrake: 1.4,
};
const CAR_SPECS = {};
function carSpecFor(kind) {
  if (CAR_SPECS[kind]) return CAR_SPECS[kind];
  const K = carSpec(kind) || carSpec('sedan'), hw = K.w / 2, hl = K.len / 2, e = carEye(kind);
  return (CAR_SPECS[kind] = { ...CAR_BASE, kind, wheelbase: K.wheels[0] - K.wheels[1], circles: [-(hl - hw), 0, hl - hw], bodyR: hw, h: K.roof,
    eyeH: e.y, eyeBack: -e.x, eyeSide: e.z, reach: 1.4, hx: hw + 0.05, hz: hl, boxH: K.roof });
}
// surfaces: sand is slow + slippery, grass/dirt a little
const SURF = { hard: { max: 1, accel: 1, grip: 1, drag: 0, rumble: 0 }, soft: { max: 0.8, accel: 0.85, grip: 0.75, drag: 0.8, rumble: 0.3 }, sand: { max: 0.5, accel: 0.7, grip: 0.45, drag: 2.2, rumble: 1 } };

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
  chase: false, chaseYaw: 0, chaseY: 0, chaseD: 0, vmHidden: false, hits: new Map(), ui: null,
};

function groundY(x, z) { const g = C.world?.groundHeight; return g ? g(x, z) : 0; }
/** Floor under (x,z) for something currently at height yRef: highest of world.groundHeight / collider tops that is ≤ yRef+stepUp; keeps yRef when nothing qualifies (multi-level maps whose groundHeight reports the level above). */
function floorAt(x, z, yRef, skip = null, stepUp = 0.5) {
  let best = -Infinity; const gy = groundY(x, z); if (gy <= yRef + stepUp) best = gy;
  const boxes = S.grid.query(x - 0.3, z - 0.3, x + 0.3, z + 0.3);
  for (let i = 0; i < boxes.length; i++) { const b = boxes[i]; if (b === skip) continue; if (b.min.x > x + 0.3 || b.max.x < x - 0.3 || b.min.z > z + 0.3 || b.max.z < z - 0.3) continue; const t = b.max.y; if (t <= yRef + stepUp && t > best && b.min.y < t) best = t; }
  return best === -Infinity ? yRef : best;
}
/** the bounds that apply at (x, z): an extra zone's rect (coney's Belt Parkway) when inside one, else the map's */
function boundsAt(x, z) { const zn = C.world?.zones?.find((r) => x > r.x0 - 2 && x < r.x1 + 2 && z > r.z0 - 2 && z < r.z1 + 2); return zn ? { min: { x: zn.x0, z: zn.z0 }, max: { x: zn.x1, z: zn.z1 } } : C.world?.bounds; }
function inBounds(x, z, pad = 1) { const b = boundsAt(x, z); return !b || (x > b.min.x + pad && x < b.max.x - pad && z > b.min.z + pad && z < b.max.z - pad); }

function baseState(x, z, yaw, yRef) {
  const y = floorAt(x, z, yRef);
  return { home: { x, z, yaw, y }, pos: new THREE.Vector3(x, y, z), vy: 0, air: false, heading: yaw, vel: new THREE.Vector3(), speed: 0, fwdSpeed: 0,
    steer: 0, lean: 0, susp: 0, suspV: 0, spin: 0, skid: 0, throttle: 0, brakeK: 0, parked: true, box: new THREE.Box3(), hitT: 0,
    tPitch: 0, tRoll: 0, aLong: 0, surf: SURF.hard, surfT: 0, groundVy: 0 };
}

// ---------- bike object ----------
function makeBike(x, z, yaw, yRef = 0) {
  const parts = buildBike(C);
  const bike = { ...parts, ...baseState(x, z, yaw, yRef), spec: BIKE_SPEC, rider: null };
  bike.group.position.copy(bike.pos); bike.group.rotation.y = yaw;
  for (const m of bike.meshes) { m.userData.vehicle = bike; C.raycastTargets.push(m); }
  C.scene.add(bike.group);
  parkBox(bike); C.colliders.push(bike.box);
  S.bikes.push(bike);
  return bike;
}
/** A drivable car from the shared car kit (geometry faces +x in the kit; vehicles face -z, so the kit is turned +90 deg). */
function makeCar(x, z, yaw, kind = 'sedan', color = 0x22305c, yRef = 0) {
  if (!carSpec(kind)) kind = 'sedan';
  const geos = carGeometries(kind).geos, CM = carMaterials();
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
  const kit = new THREE.Group(); kit.rotation.y = Math.PI / 2; body.add(kit);     // kit frame (+x front) → vehicle frame (-z front)
  const meshes = []; const paint = CM.paint.clone(); paint.color = new THREE.Color(color);
  const lampR = CM.lampR.clone(), lampW = CM.lampW.clone(); lampR.emissive = new THREE.Color(0xff1a0a); lampR.emissiveIntensity = 0.08; lampW.emissive = new THREE.Color(0xfff0d0); lampW.emissiveIntensity = 0.05;
  const mat = { paint, lampR, lampW };
  for (const [slot, g] of Object.entries(geos)) { if (!g) continue; const m = new THREE.Mesh(g, mat[slot] || CM[slot]); m.castShadow = slot === 'paint'; m.receiveShadow = true; m.userData.surface = 'metal'; kit.add(m); meshes.push(m); }
  const cab = carInterior(kind, geos); kit.add(cab.group);
  const sp = carSpecFor(kind);
  const headlight = new THREE.SpotLight(0xfff2d8, 0, 55, 0.5, 0.5, 1.4); headlight.position.set(0, 0.8, -sp.hz + 0.1); headlight.target.position.set(0, 0, -16); group.add(headlight); group.add(headlight.target); headlight.visible = false;
  const lens = { material: lampW };
  const dummy = new THREE.Group();
  const car = { group, body, fork: dummy, wheelF: dummy, wheelR: dummy, headlight, lens, lampR, meshes, kind, color, steerWheel: cab.wheel, ...baseState(x, z, yaw, yRef), spec: sp };
  group.position.copy(car.pos); group.rotation.y = yaw;
  for (const m of meshes) { m.userData.vehicle = car; C.raycastTargets.push(m); }
  C.scene.add(group); parkBox(car); C.colliders.push(car.box); S.bikes.push(car); rebuildGrids();
  return car;
}
function parkBox(v) {
  const c = Math.cos(v.heading), s = Math.sin(v.heading), sp = v.spec;
  const hx = Math.abs(c) * sp.hx + Math.abs(s) * sp.hz, hz = Math.abs(s) * sp.hx + Math.abs(c) * sp.hz;
  v.box.min.set(v.pos.x - hx, v.pos.y, v.pos.z - hz); v.box.max.set(v.pos.x + hx, v.pos.y + sp.boxH, v.pos.z + hz);
}
function unparkBox(v) { v.box.min.set(0, -9999, 0); v.box.max.set(0.001, -9998, 0.001); rebuildGrids(); }
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
  if (spots && spots.length) { for (const s of spots.slice(0, W.vehicleMax || 5)) makeBike(s.x, s.z, s.yaw ?? 0, s.y ?? 0); if (S.bikes.length >= 3) return; }   // maps may raise the cap via W.vehicleMax
  const spawns = (W?.playerSpawns?.length ? W.playerSpawns : [new THREE.Vector3(0, 0, 0)]);
  const want = 5, R = C.rng, MIN_APART = 25;
  // candidates = every walkable anchor the map exposes (player spawns, enemy spawns, cover points) → bikes dispersed over the whole map
  const anchors = [...spawns, ...(W?.enemySpawns || []), ...((W?.coverPoints || []).map(c => c.position))].filter(v => v && Math.abs(v.y || 0) < 0.15);
  const farFromBikes = (x, z) => S.bikes.every(b => Math.hypot(b.group.position.x - x, b.group.position.z - z) >= MIN_APART);
  const tryAt = (ax, az, ay) => { for (let k = 0; k < 12; k++) { const a = R() * Math.PI * 2, d = 2 + R() * 4; const x = ax + Math.cos(a) * d, z = az + Math.sin(a) * d; if (!spotFree(x, z, ay) || !farFromBikes(x, z)) continue; const cx = W?.bounds ? (W.bounds.min.x + W.bounds.max.x) / 2 : 0, cz = W?.bounds ? (W.bounds.min.z + W.bounds.max.z) / 2 : 0; makeBike(x, z, Math.atan2(-(cx - x), -(cz - z)) + (R() - 0.5) * 0.9, ay || 0); return true; } return false; };
  const s0 = spawns[Math.floor(R() * spawns.length)]; tryAt(s0.x, s0.z, s0.y);
  const pool = anchors.slice().sort(() => R() - 0.5);
  let tries = 0;
  while (S.bikes.length < want && tries++ < 300 && pool.length) {
    let best = null, bd = -1; for (const a of pool) { let d = Infinity; for (const b of S.bikes) d = Math.min(d, Math.hypot(b.group.position.x - a.x, b.group.position.z - a.z)); if (d > bd) { bd = d; best = a; } }
    if (!best) break; pool.splice(pool.indexOf(best), 1); if (bd < MIN_APART) continue; tryAt(best.x, best.z, best.y);
  }
  for (let d = 3; S.bikes.length < 3 && d < 30; d += 1.5) for (let i = 0; i < 16 && S.bikes.length < 3; i++) { const a = i / 16 * Math.PI * 2; const x = s0.x + Math.cos(a) * d, z = s0.z + Math.sin(a) * d; if (spotFree(x, z, s0.y)) makeBike(x, z, a, s0.y || 0); }
}

// ---------- mount / dismount ----------
function setRaycastable(v, on) {
  const T = C.raycastTargets;
  for (const m of v.meshes) { const i = T.indexOf(m); if (on && i < 0) T.push(m); else if (!on && i > -1) T.splice(i, 1); }
}
function mount(bike) {
  const p = C.player; if (!bike || !p || S.mounted || p.mounted) return false;
  S.mounted = bike; p.mounted = bike; bike.parked = false; unparkBox(bike);
  setRaycastable(bike, false);   // your own vehicle never eats your bullets (chase cam rays pass through it)
  bike.headlight.visible = true; bike.headlight.intensity = 260; bike.lens.material.emissiveIntensity = bike.spec.car ? 1.2 : 3.5;
  S.lookYaw = clamp(wrap(p.yaw - bike.heading), -bike.spec.lookYaw, bike.spec.lookYaw); S.lookPitch = clamp(p.pitch, -LOOK_PITCH, LOOK_PITCH);
  S.idleT = 0; S.roll = 0; S.mountT = 0; S.vib = 0; S.chaseYaw = bike.heading; S.chaseY = bike.pos.y; S.chaseD = bike.spec.chaseD;
  S.fovBase = C.settings.fov; S.fovWritten = -1;
  if (S.chase) setChase(true);
  const w = C.weapons; S.prevSlot = null;
  if (w?.swap) { const cur = w.current?.slot ?? w.slot ?? 0; if (cur !== 1) { try { if (w.swap(1)) S.prevSlot = cur; } catch {} } }
  try { C.audio?.play?.('bike_idle', { position: bike.pos, volume: 0.6 }); } catch {}
  C.bus.emit('vehicle', { stage: 'mount', bike });
  C.hud?.toast?.(bike.spec.car ? 'F — GET OUT · W/S GAS/BRAKE · A/D STEER · SPACE HANDBRAKE · V CAMERA' : 'F — DISMOUNT · W/S THROTTLE · SPACE BRAKE · V CAMERA', 2600);
  applyView(0);
  return true;
}
function dismount() {
  const bike = S.mounted, p = C.player; if (!bike || !p) return false;
  const sp = bike.spec;
  fwdOf(bike.heading, _f); _r.set(-_f.z, 0, _f.x);
  const y = bike.pos.y; let placed = false;
  parkBox(bike); rebuildGrids();   // park first so the exit spot is checked against the vehicle's own box too
  // door side first (left), then right, behind, front
  const sx0 = sp.hx + (sp.car ? 0.85 : 0.55), sz0 = sp.hz + 0.7;
  const cands = [[-sx0, sp.car ? -0.3 : 0], [sx0, 0], [0, sz0], [0, -sz0], [-sx0, sz0 * 0.6], [sx0, sz0 * 0.6], [-sx0 - 0.8, 0], [sx0 + 0.8, 0]];
  for (const [sx, sz] of cands) {
    const x = bike.pos.x + _r.x * sx - _f.x * sz, z = bike.pos.z + _r.z * sx - _f.z * sz;
    if (!inBounds(x, z, 0.6)) continue;
    const gy = floorAt(x, z, bike.pos.y, bike.box);
    if (rectBlocked(S.grid, x - 0.4, z - 0.4, x + 0.4, z + 0.4, gy + 0.05, gy + 1.75, null)) continue;
    p.teleport(x, gy, z, bike.heading + S.lookYaw, S.lookPitch); placed = true; break;
  }
  if (!placed) p.teleport(bike.pos.x - _r.x * sx0, y, bike.pos.z - _r.z * sx0, bike.heading + S.lookYaw, S.lookPitch);
  p.mounted = null; S.mounted = null; S.qa = null;
  bike.vel.set(0, 0, 0); bike.speed = bike.fwdSpeed = 0; bike.throttle = 0; bike.vy = 0; bike.air = false; bike.parked = true;
  setRaycastable(bike, true);
  bike.headlight.visible = false; bike.headlight.intensity = 0; bike.lens.material.emissiveIntensity = sp.car ? 0.05 : 0.15; if (bike.lampR) bike.lampR.emissiveIntensity = 0.08;
  bike.body.rotation.set(0, 0, 0); bike.body.position.y = 0; bike.lean = 0; bike.tPitch = bike.tRoll = 0; bike.group.rotation.set(0, bike.heading, 0);
  if (bike.rider) bike.rider.visible = false;
  showViewmodel(true);
  if (S.fovWritten > 0 && Math.abs(C.settings.fov - S.fovWritten) < 1e-6) C.settings.fov = S.fovBase; S.fovWritten = -1;
  const w = C.weapons; if (S.prevSlot != null && w?.swap) { try { w.swap(S.prevSlot); } catch {} } S.prevSlot = null;
  C.bus.emit('vehicle', { stage: 'dismount', bike });
  return true;
}
function showViewmodel(on) {
  const vm = C.weapons?.viewmodel; if (!vm) return;
  if (!on) { if (vm.visible) { vm.visible = false; S.vmHidden = true; } }
  else if (S.vmHidden) { vm.visible = true; S.vmHidden = false; }
}

// ---------- physics ----------
function surfaceUnder(v) {
  const W = C.world; let s = 'concrete';
  try { s = W?.surfaceAt?.(v.pos) || s; } catch {}
  if (s === 'sand' || (s === 'ground' && W?.mapId === 'coney')) return SURF.sand;   // coney: 'ground' = the beach
  if (s === 'grass' || s === 'lawn' || s === 'dirt' || s === 'mud' || s === 'gravel') return SURF.soft;
  return SURF.hard;
}
/** One frame of physics, sub-stepped so every step is ≤ 1/120 s (same handling at any frame rate). */
function simulate(v, dt, thr, brk, hard, steer) {
  const n = Math.max(1, Math.ceil(dt / MAX_STEP - 1e-6)), h = dt / n;
  v.surfT -= dt; if (v.surfT <= 0) { v.surfT = 0.1; v.surf = surfaceUnder(v); }
  for (let i = 0; i < n; i++) stepVeh(v, h, thr, brk, hard, steer);
  visuals(v, dt, thr, brk, hard);
}
function stepVeh(v, dt, thr, brk, hard, steer) {
  const p = v.pos, vel = v.vel, sp = v.spec, sf = v.surf || SURF.hard;
  fwdOf(v.heading, _f); _r.set(-_f.z, 0, _f.x);
  let fs = vel.x * _f.x + vel.z * _f.z, ls = vel.x * _r.x + vel.z * _r.z;
  const fs0 = fs, max = sp.max * sf.max, grounded = !v.air;
  v.throttle = damp(v.throttle, thr, 10, dt);
  if (grounded) {
    if (thr > 0 && fs >= -0.5) { const k = clamp(fs / max, 0, 1); fs += sp.accel * sf.accel * thr * (1 - k * k) * dt; }
    if (thr > 0 && fs < -0.5) fs = Math.min(0, fs + sp.brake * thr * dt);                        // throttle while rolling back = brake
    if (brk > 0) { if (fs > 0.3) fs = Math.max(0, fs - sp.brake * brk * dt); else if (thr === 0) fs = Math.max(-sp.revMax, fs - sp.accel * 0.5 * brk * dt); }
    if (hard) { const d = sp.hard * dt; fs = fs > 0 ? Math.max(0, fs - d) : Math.min(0, fs + d); }
    // passive: air drag + rolling resistance (+ surface drag, + engine braking off-throttle)
    fs -= fs * Math.abs(fs) * 0.0024 * dt;
    const rf = (0.5 + sf.drag + (thr === 0 && brk === 0 ? sp.engineBrake : 0)) * dt; fs -= Math.sign(fs) * Math.min(Math.abs(fs), rf);
    if (fs > max) fs = damp(fs, max, 1.2, dt);   // entering sand at speed bleeds off instead of hitting a wall
  }
  fs = clamp(fs, -sp.revMax, sp.max * 1.05);
  // steering: the angle is capped by the cornering limit at this speed (so it's twitch-free at 30 m/s, tight at walking pace)
  const af = Math.abs(fs);
  const sliding = hard && af > 3 && grounded;
  v.skid = damp(v.skid, sliding ? 1 : 0, sliding ? 6 : 3, dt);
  const latMax = sp.latG * 9.81 * sf.grip * (1 + 1.5 * v.skid);
  let steerMax = sp.steerLow; if (af > 1) steerMax = Math.min(steerMax, Math.atan(latMax * sp.wheelbase / (af * af)));
  v.steer = damp(v.steer, steer * Math.max(0.02, steerMax), steer !== 0 ? 6 : 8, dt);
  // yaw (bicycle model; reverse steers the other way like a real vehicle); handbrake → rear steps out
  let yawRate = (grounded && af > 0.05) ? -fs / sp.wheelbase * Math.tan(v.steer) : 0;
  yawRate *= 1 + sp.hardYaw * v.skid;
  // world velocity from the old frame, then rotate the chassis under it: the lateral part is the tyre slip
  const wx = _f.x * fs + _r.x * ls, wz = _f.z * fs + _r.z * ls;
  v.heading += yawRate * dt;
  fwdOf(v.heading, _f); _r.set(-_f.z, 0, _f.x);
  fs = wx * _f.x + wz * _f.z; ls = wx * _r.x + wz * _r.z;
  const grip = grounded ? (sp.grip * sf.grip * (1 - v.skid) + sp.hardGrip * v.skid) : 0.2;
  ls *= Math.exp(-grip * dt);
  vel.set(_f.x * fs + _r.x * ls, 0, _f.z * fs + _r.z * ls);
  // integrate + collide (circles along the body) with slide, speed loss, small bounce
  let px = p.x + vel.x * dt, pz = p.z + vel.z * dt, hitN = null;
  const y0 = p.y + sp.band, y1 = p.y + sp.h;
  for (let i = 0; i < sp.circles.length; i++) {
    const az = sp.circles[i]; const ax = px - _f.x * az, azz = pz - _f.z * az;
    if (resolveCircle(S.grid, ax, azz, sp.bodyR, y0, y1, v.box, _res)) { px += _res.x - ax; pz += _res.z - azz; if (!hitN || _res.depth > hitN.depth) hitN = { nx: _res.nx, nz: _res.nz, depth: _res.depth }; }
  }
  if (hitN) {
    const vn = vel.x * hitN.nx + vel.z * hitN.nz;
    if (vn < 0) {
      const severity = clamp(-vn / 8, 0, 1);
      vel.x -= hitN.nx * vn * (1 + BOUNCE); vel.z -= hitN.nz * vn * (1 + BOUNCE);
      vel.multiplyScalar(1 - HIT_LOSS * severity);
      v.suspV -= 1.5 * severity; v.hitT = Math.max(v.hitT, 0.25 * severity + 0.05);
      if (severity > 0.25 && v === S.mounted) { try { C.audio?.play?.('impact', { position: p, volume: severity }); } catch {} }
      const away = Math.atan2(-hitN.nx, -hitN.nz); v.heading += wrap(away - v.heading) * 0.15 * severity * (sp.car ? 0.4 : 1);
    }
  }
  const b = boundsAt(px, pz);
  if (b) {
    if (px < b.min.x + 1.2) { px = b.min.x + 1.2; if (vel.x < 0) { vel.x = -vel.x * BOUNCE; vel.z *= 0.6; } }
    if (px > b.max.x - 1.2) { px = b.max.x - 1.2; if (vel.x > 0) { vel.x = -vel.x * BOUNCE; vel.z *= 0.6; } }
    if (pz < b.min.z + 1.2) { pz = b.min.z + 1.2; if (vel.z < 0) { vel.z = -vel.z * BOUNCE; vel.x *= 0.6; } }
    if (pz > b.max.z - 1.2) { pz = b.max.z - 1.2; if (vel.z > 0) { vel.z = -vel.z * BOUNCE; vel.x *= 0.6; } }
  }
  p.x = px; p.z = pz;
  // ground: climb kerbs smoothly, stick to downhill slopes, leave the ground off a crest/ledge (keeping the ramp's vertical speed)
  const gy = floorAt(px, pz, p.y, v.box, sp.stepUp), dy = gy - p.y, y00 = p.y;
  if (!v.air) {
    if (dy >= 0) { p.y = dy > 0.03 ? damp(p.y, gy, 22, dt) : gy; if (dy > 0.03) v.suspV -= dy * 2.5; }
    else if (dy > -Math.max(0.04, Math.abs(fs) * dt * 0.35) && v.groundVy > -2.5 * Math.max(1, Math.abs(fs) / 10)) p.y = gy;
    else { v.air = true; v.vy = Math.max(0, v.groundVy) * 0.9; }
    if (!v.air) v.groundVy = damp(v.groundVy, (p.y - y00) / dt, 12, dt);
  }
  if (v.air) {
    v.vy -= GRAV * dt; p.y += v.vy * dt;
    if (p.y <= gy) { v.suspV += v.vy * 0.25; p.y = gy; v.vy = 0; v.air = false; v.groundVy = 0; if (v === S.mounted && v.suspV < -2) try { C.audio?.play?.('impact', { position: p, volume: 0.3 }); } catch {} }
  }
  fwdOf(v.heading, _f);
  const fsN = vel.x * _f.x + vel.z * _f.z; v.fwdSpeed = fsN; v.speed = vel.length();
  v.aLong = damp(v.aLong, (fsN - fs0) / dt, 8, dt);
  v.yawRate = yawRate;
  // suspension spring, excited by throttle/brake + surface rumble
  const kS = 90, cS = 9;
  v.suspV += (-kS * v.susp - cS * v.suspV) * dt - (thr - brk - (hard ? 1.4 : 0)) * 0.5 * dt * Math.min(1, Math.abs(fsN) / 6 + 0.3);
  if (sf.rumble && Math.abs(fsN) > 1) { v.rumbleN = damp(v.rumbleN || 0, Math.random() - 0.5, 7, dt); v.suspV += v.rumbleN * sf.rumble * Math.min(1, Math.abs(fsN) / 8) * 30 * dt; }   // low-passed: rough ground rolls, it doesn't buzz
  v.susp += v.suspV * dt; v.susp = clamp(v.susp, -0.09, 0.06);
  v.spin += fsN / WHEEL_R * dt;
  v.hitT = Math.max(0, v.hitT - dt);
}
/** Per-frame visual pose: lean / body roll, terrain pitch+roll, suspension, fork + wheels, steering wheel, lights. */
function visuals(v, dt, thr, brk, hard) {
  const sp = v.spec, p = v.pos;
  fwdOf(v.heading, _f); _r.set(-_f.z, 0, _f.x);
  // lean (bikes lean in, cars roll out a little) from lateral acceleration, plus counter-lean from a slide
  const leanT = clamp(-((v.yawRate || 0) * v.fwdSpeed) / 9.81, -1, 1) * LEAN_MAX * 1.35 + v.skid * v.steer * 0.35;
  v.lean = damp(v.lean, clamp(leanT, -LEAN_MAX * 1.4, LEAN_MAX * 1.4) * sp.leanK, 7, dt);
  // terrain under the axles / sides
  const hw = sp.wheelbase / 2, yf = floorAt(p.x + _f.x * hw, p.z + _f.z * hw, p.y + 0.2, v.box, sp.stepUp), yr = floorAt(p.x - _f.x * hw, p.z - _f.z * hw, p.y + 0.2, v.box, sp.stepUp);
  let tp = v.air ? v.tPitch : Math.atan2(yf - yr, sp.wheelbase), tr = 0;
  if (sp.car && !v.air) { const yR = floorAt(p.x + _r.x * sp.hx, p.z + _r.z * sp.hx, p.y + 0.2, v.box, sp.stepUp), yL = floorAt(p.x - _r.x * sp.hx, p.z - _r.z * sp.hx, p.y + 0.2, v.box, sp.stepUp); tr = Math.atan2(yR - yL, sp.hx * 2); }
  if (v.air) tp = damp(v.tPitch, clamp(v.vy * 0.03, -0.3, 0.2), 2, dt);
  v.tPitch = damp(v.tPitch, clamp(tp, -0.5, 0.5), 12, dt); v.tRoll = damp(v.tRoll, clamp(tr, -0.35, 0.35), 12, dt);
  v.group.position.copy(p); v.group.rotation.set(0, v.heading, 0);
  const squat = sp.car ? clamp(v.aLong * 0.0035, -0.05, 0.035) : 0;
  v.body.position.y = v.susp; v.body.rotation.set(v.tPitch - v.suspV * 0.04 + squat, 0, -v.lean + v.tRoll, 'YXZ');
  v.fork.rotation.y = -v.steer * 0.85; v.wheelF.rotation.x = -v.spin; v.wheelR.rotation.x = -v.spin;
  if (v.steerWheel) v.steerWheel.rotation.x = clamp(v.steer * 4.5, -2.6, 2.6);
  v.brakeK = damp(v.brakeK, (brk > 0 && v.fwdSpeed > 0.3) || hard ? 1 : 0, 20, dt);
  if (v.lampR) v.lampR.emissiveIntensity = 0.45 + 2.2 * v.brakeK;
}

// ---------- running people over ----------
function runOver(v, dt) {
  const sp = v.spec, spd = v.speed; if (spd < 3.5) return;
  const now = C.time?.elapsed ?? performance.now() / 1000;
  fwdOf(v.heading, _f); _r.set(-_f.z, 0, _f.x);
  const px = v.pos.x, pz = v.pos.z, reach = Math.max(sp.hx, sp.hz) + 1.2;
  const hitAt = (x, y, z, pad) => {
    const dx = x - px, dz = z - pz; if (dx * dx + dz * dz > reach * reach || Math.abs(y - v.pos.y) > 2) return 0;
    const lz = dx * _f.x + dz * _f.z, lx = dx * _r.x + dz * _r.z;
    if (Math.abs(lx) > sp.hx + pad || Math.abs(lz) > sp.hz + pad) return 0;
    const len = Math.hypot(dx, dz) || 1; const closing = (v.vel.x * dx + v.vel.z * dz) / len;   // speed toward them
    return closing > 2.5 ? Math.max(closing, spd * 0.6) : 0;
  };
  const soldiers = C.ai?.soldiers;
  if (soldiers && C.ai.damage) for (const s of soldiers) {
    if (!s || s.dead || !s.position) continue;
    const k = hitAt(s.position.x, s.position.y, s.position.z, 0.35); if (!k) continue;
    if ((S.hits.get(s) || -9) > now - 0.6) continue; S.hits.set(s, now);
    const dmg = Math.round(k * sp.hitMul);
    try { C.ai.damage(s, dmg, s.position.clone().setY(s.position.y + 1)); } catch (e) { console.error('[vehicles] ai.damage', e); }
    try { C.hud?.hitmarker?.(!!s.dead); } catch {}
    try { C.audio?.play?.('impact', { position: s.position, volume: 0.8 }); } catch {}
    v.vel.multiplyScalar(sp.hitSlow); v.suspV -= 0.8; v.hitT = Math.max(v.hitT, 0.12);
  }
  const net = C.net; if (!net?.list || !net.peer) return;
  let ids; try { ids = net.list(); } catch { return; }
  for (const id of ids) {
    const q = net.peer(id); if (!q || q.dead || q.veh || !q.pos) continue;   // people in cars / on bikes aren't pedestrians
    const k = hitAt(q.pos.x, q.pos.y, q.pos.z, 0.4); if (!k) continue;
    if ((S.hits.get(id) || -9) > now - 1) continue; S.hits.set(id, now);
    const dmg = Math.round(k * sp.hitMul);
    C.bus.emit('vehicleHit', { peerId: id, speed: +k.toFixed(2), damage: dmg, point: [q.pos.x, q.pos.y + 1, q.pos.z], car: !!sp.car });
    try { C.hud?.hitmarker?.(dmg >= 100); } catch {}
    v.vel.multiplyScalar(sp.hitSlow); v.hitT = Math.max(v.hitT, 0.12);
  }
}

// ---------- rider (player + camera) ----------
function applyView(dt) {
  const bike = S.mounted, p = C.player; if (!bike || !p) return;
  const sp = bike.spec;
  fwdOf(bike.heading, _f); _r.set(-_f.z, 0, _f.x);
  const leanS = Math.sin(bike.lean);
  // player capsule sits in the seat (feet at seat height so the hitbox spans the rider)
  const seatY = sp.car ? 0.3 : 0.47;
  p.position.set(bike.pos.x + _r.x * (leanS * 0.4 + (sp.car ? sp.eyeSide : 0)), bike.pos.y + seatY + bike.susp, bike.pos.z + _r.z * (leanS * 0.4 + (sp.car ? sp.eyeSide : 0)));
  p.velocity.set(0, 0, 0); p.onGround = true; p.height = 1.7;
  if (bike.rider) bike.rider.visible = S.chase;
  showViewmodel(!S.chase);
  if (S.chase) return applyChase(bike, dt);
  const eyeH = bike.pos.y + sp.eyeH + bike.susp * 1.2;
  // engine buzz: frequency capped ~10 Hz — the old rpm-linear phase hit 35+ Hz at speed, aliased at 60 fps into random jolts ("the bike is bumpy")
  const rpm = 8 + Math.abs(bike.fwdSpeed) * 2.2 + bike.throttle * 6; S.vib += (dt || 0) * Math.min(rpm, 30) * 1.2;
  const vibA = (sp.car ? 0.4 : 1) * (0.0012 + bike.throttle * 0.0018 + Math.min(1, Math.abs(bike.fwdSpeed) / 12) * 0.0012) + bike.hitT * 0.035 + (bike.surf?.rumble || 0) * 0.002;
  const vx = Math.sin(S.vib * 1.7) * vibA, vy = Math.sin(S.vib) * vibA * 0.8;
  const H = sp.eyeH;
  _v.set(bike.pos.x, eyeH, bike.pos.z).addScaledVector(_f, -sp.eyeBack).addScaledVector(_r, leanS * H * 0.85 + vx + sp.eyeSide);
  _v.y -= (1 - Math.cos(bike.lean)) * H; _v.y += vy;
  // body pitch moves the eye (seat is behind the axle midpoint on bikes, near it in cars)
  _v.y += Math.sin(bike.tPitch) * (-sp.eyeBack);
  const rollT = sp.car ? (bike.tRoll * 0.9 - bike.lean * 0.5) : (-bike.lean * 0.8 + bike.skid * bike.steer * 0.15);
  S.roll = damp(S.roll, rollT, 10, dt || 1);
  const yaw = bike.heading + S.lookYaw;
  const pitch = clamp(S.lookPitch + bike.tPitch * 0.9 - bike.suspV * 0.03 + Math.sin(S.vib * 0.9) * vibA * 0.5, -LOOK_PITCH - 0.5, LOOK_PITCH + 0.5);
  p.yaw = yaw; p.pitch = pitch; S.wroteYaw = yaw; S.wrotePitch = pitch;
  const cam = C.camera; if (cam) { cam.position.copy(_v); cam.rotation.set(pitch, yaw, S.roll); p.cameraPosition?.copy(_v); }
}
/** Third-person chase camera: trails the heading with a little lag, orbits with free-look, pulls in in front of walls. */
function applyChase(v, dt) {
  const sp = v.spec, p = C.player, cam = C.camera;
  const k = dt || 1;
  // follow the direction of travel when reversing slowly so the view doesn't swing around
  S.chaseYaw = S.chaseYaw + wrap(v.heading - S.chaseYaw) * (1 - Math.exp(-(sp.car ? 4 : 5) * k));
  S.chaseY = damp(S.chaseY, v.pos.y, 8, k);
  const tx = v.pos.x, ty = S.chaseY + sp.chaseLook, tz = v.pos.z;
  const yaw = S.chaseYaw + S.lookYaw;
  const elev = clamp(sp.chaseH - S.lookPitch * 0.8, -0.05, 1.2);
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const D = sp.chaseD * (1 + clamp(v.speed / sp.max, 0, 1) * 0.12);
  const cx = tx - fx * Math.cos(elev) * D, cy = ty + Math.sin(elev) * D, cz = tz - fz * Math.cos(elev) * D;
  const t = segmentHit(S.grid, tx, ty, tz, cx, cy, cz, v.box, v.pos.y + 0.25);
  const want = Math.max(1.2, t * D - 0.3);
  S.chaseD = want < S.chaseD ? want : damp(S.chaseD, want, 3, k);   // snap in, ease out
  const d = S.chaseD;
  _v.set(tx - fx * Math.cos(elev) * d, ty + Math.sin(elev) * d, tz - fz * Math.cos(elev) * d);
  { const gy = groundY(_v.x, _v.z); if (_v.y < gy + 0.4) _v.y = gy + 0.4; }
  const shake = v.hitT * 0.15;
  if (shake) { _v.x += (Math.random() - 0.5) * shake; _v.y += (Math.random() - 0.5) * shake; }
  // aim a little above and ahead of the vehicle so the crosshair sits over the roof, not on it
  const lx = tx + fx * 4 - _v.x, ly = ty + 0.1 - _v.y, lz = tz + fz * 4 - _v.z;
  const cyaw = Math.atan2(-lx, -lz), cpitch = Math.atan2(ly, Math.hypot(lx, lz));
  p.yaw = cyaw; p.pitch = cpitch; S.wroteYaw = cyaw; S.wrotePitch = cpitch;
  S.roll = damp(S.roll, 0, 8, k);
  if (cam) { cam.position.copy(_v); cam.rotation.set(cpitch, cyaw, 0); p.cameraPosition?.copy(_v); }
}
function setChase(on) {
  S.chase = !!on;
  const v = S.mounted;
  if (v) { S.chaseYaw = v.heading; S.chaseY = v.pos.y; S.chaseD = v.spec.chaseD; if (S.chase && !v.spec.car && !v.rider) { v.rider = buildRider(); v.body.add(v.rider); } }
  S.lookYaw = 0; S.lookPitch = 0;
  if (S.ui) S.ui.cam.classList.toggle('on', S.chase);
  return S.chase;
}

/** Nearest vehicle whose body is within its reach of the player (distance to the footprint, not the centre). */
function nearestBike() {
  const p = C.player; if (!p) return null; let best = null, bd = Infinity;
  for (const b of S.bikes) {
    if (b === S.mounted) continue;
    const sp = b.spec, dx = p.position.x - b.pos.x, dz = p.position.z - b.pos.z;
    if (Math.abs(p.position.y - b.pos.y) > 1.6) continue;
    const c = Math.cos(b.heading), s = Math.sin(b.heading);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;   // into the vehicle frame (right, back)
    const d = Math.hypot(Math.max(0, Math.abs(lx) - sp.hx), Math.max(0, Math.abs(lz) - sp.hz));
    if (d < sp.reach && d < bd) { bd = d; best = b; }
  }
  return best;
}
function nearParked() {
  if (typeof window === 'undefined' || !window.__game?.hangout) return null;   // stealing parked cars = hangout mode only
  const list = C.world?.parkedCars, p = C.player?.position; if (!list || !p) return null;
  for (const c of list) if (!c.gone && Math.hypot(c.x - p.x, c.z - p.z) < 3.0 && Math.abs((c.y || 0) - p.y) < 1.5) return c;
  return null;
}

// ---------- touch UI: ENTER / EXIT and CAMERA buttons (touch.js reads nearBike/mounted for its own button; we hide that one while ours shows) ----------
function buildUI(ctx) {
  if (!ctx.isTouch || typeof document === 'undefined') return;
  const st = document.createElement('style');
  st.textContent = `#vehui{position:fixed;inset:0;pointer-events:none;z-index:31;font-family:"Barlow Condensed","Arial Narrow",system-ui,sans-serif}
#vehui .vb{position:absolute;display:none;align-items:center;justify-content:center;pointer-events:auto;border-radius:24px;border:2px solid #e9a23b;background:rgba(233,162,59,.42);color:#fff;font-weight:700;letter-spacing:.1em;font-size:15px;text-shadow:0 1px 2px #000;-webkit-user-select:none;user-select:none;touch-action:none}
#vehui .vb.show{display:flex}#vehui .vb.down{background:rgba(233,162,59,.8);transform:scale(.94)}
#vehui .enter{left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 22px);width:128px;height:50px;margin-left:-64px}
#vehui .cam{left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 22px);width:64px;height:50px;margin-left:76px;background:rgba(10,14,20,.5);border-color:rgba(255,255,255,.45);font-size:13px}
#vehui .cam.on{background:rgba(233,162,59,.42);border-color:#e9a23b}
#touch .act.vhdup{display:none!important}`;
  document.head.appendChild(st);
  const root = document.createElement('div'); root.id = 'vehui'; root.innerHTML = '<div class="vb enter">ENTER</div><div class="vb cam">CAM</div>'; document.body.appendChild(root);
  const enter = root.querySelector('.enter'), cam = root.querySelector('.cam');
  const tap = (el, fn) => el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('down'); setTimeout(() => el.classList.remove('down'), 120); fn(); }, { passive: false });
  tap(enter, () => { ctx.input.pressed.add('KeyF'); S.uiMount = true; });
  tap(cam, () => setChase(!S.chase));
  enter.addEventListener('click', () => { ctx.input.pressed.add('KeyF'); S.uiMount = true; }); cam.addEventListener('click', () => setChase(!S.chase));
  S.ui = { root, enter, cam, label: '', act: null };
}
function updateUI(ctx) {
  const U = S.ui; if (!U) return;
  const p = ctx.player, playing = ctx.state === 'playing' && p && !p.dead;
  let label = '';
  if (playing) {
    if (S.mounted) label = S.mounted.spec.car ? 'EXIT' : 'GET OFF';
    else if (!p.mounted) { const b = S.api.nearBike; if (b) label = b.spec.car ? 'ENTER' : 'RIDE'; else if (nearParked()) label = 'STEAL'; }
  }
  if (label !== U.label) { U.label = label; U.enter.textContent = label; U.enter.classList.toggle('show', !!label); }
  U.cam.classList.toggle('show', playing && !!S.mounted); U.cam.classList.toggle('on', S.chase);
  // touch.js' contextual button duplicates ours for RIDE / GET OFF — hide it then (it still shows TAKE for weapon pickups)
  const act = U.act || (U.act = document.querySelector('#touch .act'));
  if (act) { const t = act.textContent || ''; act.classList.toggle('vhdup', !!label && (t === 'RIDE' || t === 'GET OFF') && (!!S.mounted || !!S.api.nearBike)); }
}

// ---------- module ----------
export async function init(ctx) {
  C = ctx;
  try { placeBikes(); } catch (e) { console.error('[vehicles] placement failed', e); }
  ctx.bus.on('ui:mount', () => { S.uiMount = true; });
  try { buildUI(ctx); } catch (e) { console.warn('[vehicles] ui', e); }
  S.chase = !!ctx.isTouch && ctx.qs?.get?.('chase') !== '0';   // phones start in the chase cam (small screen, cabin view is cramped); V / CAM toggles
  const api = {
    list: S.bikes, get mounted() { return S.mounted; }, nearBike: null,
    mount: (bike) => mount(bike || nearestBike()), dismount,
    /** Third-person chase camera (V key / CAM button on touch). */
    get chase() { return S.chase; }, set chase(v) { setChase(v); }, toggleCamera: () => setChase(!S.chase),
    /** Touch hook: tap = the same as pressing F (enter / exit / steal). */
    use: () => { S.uiMount = true; },
    spawnCar: (x, z, yaw, kind, color, y) => makeCar(x, z, yaw, kind, color, y ?? ctx.player?.position.y ?? 0),
    qaSpawn(x, z, yaw = 0, y = ctx.player?.position.y ?? 0) { S.grid.sync(ctx.colliders); const b = makeBike(x, z, yaw, y); S.grid.build(ctx.colliders); ctx.player?.rebuildColliders?.(); return b; },
    qaMount() { const b = nearestBike(); if (!b) return false; return mount(b); },
    /** Drive with fixed inputs for `seconds`; resolves when done. throttle: -1..1 (negative = brake/reverse), steer: -1..1 (+ = right), opts {hard} */
    qaDrive(throttle = 1, steer = 0, seconds = 3, opts = {}) { if (!S.mounted) api.qaMount(); if (!S.mounted) return Promise.resolve(false); if (S.qa) S.qa.res(false); return new Promise((res) => { S.qa = { thr: throttle, steer, t: seconds, hard: !!opts.hard, res }; }); },
    qaState() { const b = S.mounted; return b ? { x: b.pos.x, y: b.pos.y, z: b.pos.z, heading: b.heading, speed: b.speed, fwd: b.fwdSpeed, lean: b.lean, steer: b.steer, skid: b.skid, air: b.air, surf: Object.keys(SURF).find((k) => SURF[k] === b.surf), car: !!b.spec.car, chase: S.chase } : null; },
    /** Deterministic replay at a fixed frame rate from the current state (restored afterwards): {fps, seconds, thr, steer, hard} → end pose + max per-frame pos jerk. */
    qaSim({ fps = 60, seconds = 3, thr = 1, steer = 0, hard = false } = {}) {
      const v = S.mounted; if (!v) return null;
      const save = { pos: v.pos.clone(), vel: v.vel.clone(), heading: v.heading, steer: v.steer, skid: v.skid, vy: v.vy, air: v.air, susp: v.susp, suspV: v.suspV, throttle: v.throttle, groundVy: v.groundVy, aLong: v.aLong };
      const dt = 1 / fps, n = Math.round(seconds * fps); let prev = null, prev2 = null, jerk = 0, ymin = Infinity, ymax = -Infinity;
      for (let i = 0; i < n; i++) {
        simulate(v, dt, Math.max(0, thr), Math.max(0, -thr), hard, steer);
        const cur = v.pos.clone(); ymin = Math.min(ymin, cur.y); ymax = Math.max(ymax, cur.y);
        if (prev && prev2) { const a = cur.clone().sub(prev).sub(prev.clone().sub(prev2)).length() / (dt * dt); jerk = Math.max(jerk, a); }
        prev2 = prev; prev = cur;
      }
      const out = { x: +v.pos.x.toFixed(3), y: +v.pos.y.toFixed(3), z: +v.pos.z.toFixed(3), heading: +v.heading.toFixed(4), speed: +v.speed.toFixed(3), maxAccel: +jerk.toFixed(2), ymin: +ymin.toFixed(3), ymax: +ymax.toFixed(3) };
      Object.assign(v, { heading: save.heading, steer: save.steer, skid: save.skid, vy: save.vy, air: save.air, susp: save.susp, suspV: save.suspV, throttle: save.throttle, groundVy: save.groundVy, aLong: save.aLong }); v.pos.copy(save.pos); v.vel.copy(save.vel);
      visuals(v, 0.016, 0, 0, false); applyView(0);
      return out;
    },
  };
  S.api = api; return api;
}

export function update(dt, ctx) {
  const p = ctx.player; if (!p) return;
  const input = ctx.input;
  S.grid.sync(ctx.colliders);
  const playing = ctx.state === 'playing' && !p.dead;
  if (S.mounted && p.dead) { dismount(); updateUI(ctx); return; }
  // F is only consumed when it means something to us (mounted, or a vehicle in reach that is closer than a weapon pickup) — ai.js / hangout read it after us
  const fHeld = playing && (input.pressed?.has?.('KeyF') || S.uiMount); S.uiMount = false;
  if (playing && input.pressed?.has?.('KeyV') && S.mounted) { input.pressed.delete('KeyV'); setChase(!S.chase); }
  if (!S.mounted) {
    const b = p.mounted ? null : nearestBike(); S.api.nearBike = b;
    if (b && playing) {
      const dBike = Math.hypot(b.pos.x - p.position.x, b.pos.z - p.position.z) - Math.max(b.spec.hx, b.spec.hz) * 0.5;
      const dGun = ctx.ai?.nearPickupDist; const gunWins = typeof dGun === 'number' && dGun < dBike;
      if (!gunWins) { S.toastT -= dt; if (S.toastT <= 0) { S.toastT = 0.35; ctx.hud?.toast?.(b.spec.car ? 'F — DRIVE' : 'F — RIDE', 600); } if (fHeld) { input.pressed?.delete?.('KeyF'); mount(b); } }
    }
    updateUI(ctx);
    return;
  }
  S.api.nearBike = null;
  if (fHeld) { input.pressed?.delete?.('KeyF'); dismount(); updateUI(ctx); return; }
  updateUI(ctx);
  if (dt <= 0) { applyView(0); return; }
  const bike = S.mounted, sp = bike.spec;
  // read look deltas the player applied after our last write (mouse + recoil) into the free-look offset
  S.lookYaw += wrap(p.yaw - S.wroteYaw); S.lookPitch += p.pitch - S.wrotePitch;
  S.mountT += dt;
  const moved = Math.abs(input.mouse?.dx || 0) + Math.abs(input.mouse?.dy || 0) > 0.5;
  S.idleT = moved ? 0 : S.idleT + dt;
  const lim = S.chase ? Math.PI : sp.lookYaw;
  S.lookYaw = S.chase ? wrap(S.lookYaw) : clamp(S.lookYaw, -lim, lim); S.lookPitch = clamp(S.lookPitch, -LOOK_PITCH, LOOK_PITCH);
  if (S.idleT > (S.chase ? 1.2 : 0.6)) { S.lookYaw = damp(S.lookYaw, 0, S.chase ? 2 : 3.5, dt); S.lookPitch = damp(S.lookPitch, 0, 2.5, dt); }
  // inputs: keyboard, or the touch stick (analog: up = gas, down = brake/reverse, sideways = steer)
  let thr = 0, brake = 0, hard = false, steer = 0;
  if (S.qa) { const q = S.qa; thr = Math.max(0, q.thr); brake = Math.max(0, -q.thr); hard = q.hard; steer = q.steer; q.t -= dt; if (q.t <= 0) { S.qa = null; q.res(); } }
  else if (ctx.state === 'playing') {
    const key = (c) => input.down ? input.down(c) : input.keys?.has?.(c);
    thr = key('KeyW') || key('ArrowUp') ? 1 : 0; brake = key('KeyS') || key('ArrowDown') ? 1 : 0; hard = !!input.jump;
    steer = (key('KeyD') || key('ArrowRight') ? 1 : 0) - (key('KeyA') || key('ArrowLeft') ? 1 : 0);
    const ax = input.touch?.axis?.x || 0, ay = input.touch?.axis?.y || 0;
    if (Math.abs(ax) > 0.12) steer = Math.sign(ax) * clamp((Math.abs(ax) - 0.12) / 0.7, 0, 1) ** 1.2;
    if (ay < -0.15) thr = Math.max(thr, clamp((-ay - 0.15) / 0.55, 0, 1));
    if (ay > 0.2) brake = Math.max(brake, clamp((ay - 0.2) / 0.55, 0, 1));
  }
  simulate(bike, dt, thr, brake, hard, steer);
  runOver(bike, dt);
  // speed FOV kick: written through settings.fov so weapons' ADS fov logic composes with it
  {
    if (S.fovWritten > 0 && Math.abs(ctx.settings.fov - S.fovWritten) > 1e-6) S.fovBase = ctx.settings.fov; // user moved the slider while riding
    const kick = FOV_KICK * clamp(Math.abs(bike.fwdSpeed) / sp.max, 0, 1) ** 1.3;
    S.fovWritten = S.fovBase + kick; ctx.settings.fov = S.fovWritten;
  }
  S.revT -= dt;
  if (thr > 0 && S.revT <= 0) { S.revT = 1.6; if (!sp.car) try { ctx.audio?.play?.('bike_rev', { position: bike.pos, volume: 0.5 + 0.5 * clamp(bike.speed / sp.max, 0, 1) }); } catch {} }
  applyView(dt);
}

export function reset(ctx) {
  if (S.mounted) dismount();
  for (const b of S.bikes) {
    b.pos.set(b.home.x, b.home.y, b.home.z); b.vy = 0; b.air = false; b.heading = b.home.yaw; b.vel.set(0, 0, 0); b.speed = b.fwdSpeed = 0; b.steer = b.lean = b.susp = b.suspV = b.skid = b.tPitch = b.tRoll = 0;
    b.group.position.copy(b.pos); b.group.rotation.set(0, b.heading, 0); b.body.position.y = 0; b.body.rotation.set(0, 0, 0); b.fork.rotation.y = 0; b.parked = true; parkBox(b);
  }
  rebuildGrids(); S.qa = null; S.lookYaw = S.lookPitch = 0; S.hits.clear();
}
