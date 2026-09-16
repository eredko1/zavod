// First-person character controller. Owned by: PLAYER agent.
// Capsule collision vs ctx.colliders (see ./player/collision.js), CoD MW2019-style movement feel,
// head bob / landing spring / slide / mantle, health + regen, death cam, QA driving hooks.
import * as THREE from 'three';
import { ColliderGrid, capsuleOverlaps, resolveCapsule, supportBelow } from './player/collision.js';

// ---- tunables ---------------------------------------------------------------
const RADIUS = 0.35, H_STAND = 1.7, H_CROUCH = 1.15, EYE_DROP = 0.12;
const STEP = 0.45, MANTLE_MIN = 0.45, MANTLE_MAX = 1.3, MANTLE_TIME = 0.4;
const GRAVITY = 20, JUMP_V = 6.5, COYOTE = 0.12, JUMP_BUFFER = 0.12;
const SPD = { walk: 4.4, sprint: 6.6, crouch: 2.2, ads: 2.6 };
const STRAFE_MUL = 0.9, BACK_MUL = 0.8, AIR_CONTROL = 0.3;
const ACCEL_L = 30, STOP_L = 20;                 // damp lambdas: ~0.1 s to speed, ~0.15 s to stop
const SLIDE_TIME = 0.6, SLIDE_V0 = 7.6, SLIDE_V1 = 2.2, SPRINT_OUT = 0.2;
const REGEN_DELAY = 4, REGEN_RATE = 30, HARD_LAND_V = 9, DEATH_CAM_T = 0.8;
const PITCH_MAX = THREE.MathUtils.degToRad(89), STRAFE_ROLL = THREE.MathUtils.degToRad(1.2);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
const smooth = (t) => t * t * (3 - 2 * t);

// scratch
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _ray = new THREE.Raycaster(); _ray.far = 3;
const _info = {};

let ctxRef = null, grid = null;
// private controller state (not on the public object)
const S = {
  time: 0, wasGround: false, groundTime: -9, jumpBufferT: -9, jumpedAt: -9, takeoffSpeed: 0,
  crouchPrev: false, sprintPrev: false, sprintPop: false, hTarget: H_STAND, eyeSmooth: 0,
  slideT: 0, slideDir: new THREE.Vector3(), sliding: false,
  mantle: null, // { t, from:Vector3, to:Vector3 }
  sprintOut: 0, bobPhase: 0, bobBlend: 0, stepSide: 1, lastStepPhase: 0,
  landY: 0, landV: 0, landImpulseRaw: 0, roll: 0,
  lastDamage: -99, deathT: 0, deathRoll: 1, hover: false,
  qa: null, qaTrace: [],
  noFallDamageUntil: 0, physMs: 0,
};

export async function init(ctx) {
  ctxRef = ctx;
  grid = new ColliderGrid(4);
  const p = {
    position: new THREE.Vector3(0, 0, 20), velocity: new THREE.Vector3(), yaw: 0, pitch: 0,
    height: H_STAND, radius: RADIUS, health: 100, maxHealth: 100,
    onGround: true, crouching: false, sprinting: false, sliding: false, mantling: false, ads: false, dead: false,
    speed: 0, moveState: 'idle',
    bob: { x: 0, y: 0, roll: 0 }, landImpulse: 0, sprintBlend: 0, slideBlend: 0, crouchBlend: 0,
    sprintOutTime: 0, sprintOutDuration: SPRINT_OUT, canFire: true, mantleEnabled: true,
    cameraPosition: new THREE.Vector3(), fallDamageEnabled: true,
    eye() { return new THREE.Vector3(p.position.x, p.position.y + p.height - EYE_DROP, p.position.z); },
    teleport(x, y, z, yaw = p.yaw, pitch = p.pitch) {
      p.position.set(x, y, z); p.yaw = yaw; p.pitch = clamp(pitch, -PITCH_MAX, PITCH_MAX); p.velocity.set(0, 0, 0);
      S.mantle = null; S.sliding = false; S.slideT = 0; S.landY = S.landV = 0; S.eyeSmooth = 0; S.bobBlend = 0;
      // teleported into the air (QA camera poses): float until the player gives movement input
      grid.sync(ctx.colliders);
      const gy = groundY(x, z);
      S.hover = y > gy + 0.3 && supportBelow(grid, p.position, RADIUS, 0.3, gy) === -Infinity;
      S.noFallDamageUntil = S.hover ? Infinity : 0;
    },
    damage(amount, from) {
      if (p.dead || !(amount > 0)) return;
      p.health = Math.max(0, p.health - amount); S.lastDamage = S.time;
      ctx.bus.emit('playerDamaged', { amount, from: from ?? null });
      if (p.health <= 0) die();
    },
    heal(amount = p.maxHealth) { if (p.dead) return; p.health = Math.min(p.maxHealth, p.health + Math.max(0, amount)); },
    respawn() { respawn(); },
    rebuildColliders() { grid.build(ctx.colliders); },
    /** QA: drive movement for `seconds`. dir = {x:strafe(+right), y:forward(+fwd)} or [x,y]; opts {sprint,crouch,jump,jumpAt}. Resolves when done. */
    qaWalk(dir = { x: 0, y: 1 }, seconds = 1, opts = {}) {
      // also accepts an array of segments [{dir, t, opts}] executed back-to-back without input gaps
      const segsIn = Array.isArray(dir) && typeof dir[0] === 'object' ? dir : [{ dir, t: seconds, opts }];
      const segs = segsIn.map(sg => { const d = sg.dir ?? [0, 1], o = sg.opts ?? {}; const x = Array.isArray(d) ? d[0] : (d?.x ?? 0), y = Array.isArray(d) ? d[1] : (d?.y ?? 0);
        return { x, y, t: sg.t ?? 1, sprint: !!o.sprint, crouch: !!o.crouch, jump: !!o.jump, jumpAt: o.jumpAt ?? null, jumpDone: false }; });
      if (S.qa) S.qa.res();
      return new Promise((res) => { S.qa = { segs, i: 0, elapsed: 0, res }; });
    },
    qaStop() { if (S.qa) { S.qa.res(); S.qa = null; } },
    qaLog() {
      const r = (v) => +v.toFixed(3);
      return { pos: [r(p.position.x), r(p.position.y), r(p.position.z)], vel: [r(p.velocity.x), r(p.velocity.y), r(p.velocity.z)], speed: r(p.speed), yaw: r(p.yaw), pitch: r(p.pitch),
        h: r(p.height), ground: p.onGround, crouch: p.crouching, sprint: p.sprinting, slide: p.sliding, mantle: p.mantling, ads: p.ads, state: p.moveState, hp: r(p.health), dead: p.dead,
        bob: [r(p.bob.x), r(p.bob.y), r(p.bob.roll)], land: r(p.landImpulse), sprintBlend: r(p.sprintBlend), slideBlend: r(p.slideBlend), sprintOut: r(p.sprintOutTime), hover: S.hover, t: r(S.time), sinceDamage: r(S.time - S.lastDamage), physMs: +S.physMs.toFixed(3), colliders: ctx.colliders.length };
    },
    qaTrace() { return S.qaTrace; },
    qaClearTrace() { S.qaTrace.length = 0; },
  };
  ctx.player = p;
  const spawn = ctx.world?.playerSpawns?.[0]; if (spawn) p.position.copy(spawn);
  applyCamera(p, ctx);
  return p;
}

export function reset(ctx) {
  respawn(true);
}

function groundY(x, z) { const w = ctxRef.world; const g = w?.groundHeight ? w.groundHeight(x, z) : 0; return Number.isFinite(g) ? g : 0; }

function die() {
  const p = ctxRef.player; if (p.dead) return;
  p.dead = true; p.health = 0; S.deathT = 0; S.deathRoll = (ctxRef.rng ? ctxRef.rng() : Math.random()) < 0.5 ? -1 : 1;
  S.sliding = false; S.mantle = null; p.sprinting = false; p.ads = false; p.canFire = false;
  p.velocity.set(0, 0, 0);
  ctxRef.bus.emit('playerDied', { position: p.position.clone() });
  ctxRef.setState('dead');
}

function respawn(silent = false) {
  const ctx = ctxRef, p = ctx.player;
  const spawns = ctx.world?.playerSpawns?.length ? ctx.world.playerSpawns : [p.position.clone()];
  const enemies = (ctx.ai?.soldiers ?? []).filter(s => s && s.position && s.state !== 'dead' && (s.health ?? 1) > 0);
  let best = spawns[0], bestD = -1;
  for (const s of spawns) {
    let d = Infinity; for (const e of enemies) d = Math.min(d, s.distanceTo(e.position));
    if (enemies.length === 0) d = ctx.rng ? ctx.rng() : Math.random();
    if (d > bestD) { bestD = d; best = s; }
  }
  const wasDead = p.dead;
  p.dead = false; p.health = p.maxHealth; S.lastDamage = -99; S.deathT = 0;
  p.teleport(best.x, best.y, best.z, p.yaw, 0);
  S.hover = false; S.wasGround = true; S.groundTime = S.time; S.jumpBufferT = -9; S.sprintOut = 0; S.bobPhase = 0;
  S.crouchPrev = false; S.sprintPrev = false; S.sprintPop = false; S.hTarget = H_STAND; p.height = H_STAND; p.crouching = false; p.sprinting = false; p.sliding = false; p.mantling = false;
  p.landImpulse = 0; p.sprintBlend = 0; p.slideBlend = 0; p.bob.x = p.bob.y = p.bob.roll = 0; S.roll = 0;
  applyCamera(p, ctx);
  ctx.bus.emit('playerRespawn', { position: p.position.clone() });
  if (wasDead && !silent && ctx.state === 'dead') ctx.setState('playing');
}

// ---- per-frame ----------------------------------------------------------------
export function update(dt, ctx) {
  const p = ctx.player, input = ctx.input;
  if (!p) return;
  if (dt === 0) { applyCamera(p, ctx); return; }
  S.time += dt;
  grid.sync(ctx.colliders);

  if (p.dead || ctx.state === 'dead') { updateDeath(p, ctx, dt); applyCamera(p, ctx); return; }
  if (ctx.state !== 'playing') { applyCamera(p, ctx); return; }

  // ---- input gather (keyboard/mouse, or QA script override) ----
  let ix = 0, iy = 0, sprintIn = false, crouchIn = false, jumpHeld = false, jumpPress = input.consume('Space');
  if (input.forward) iy += 1; if (input.back) iy -= 1; if (input.right) ix += 1; if (input.left) ix -= 1;
  sprintIn = input.sprint; crouchIn = input.crouch; jumpHeld = input.jump;
  if (S.qa) {
    const Q = S.qa, q = Q.segs[Q.i]; Q.elapsed += dt;
    ix += q.x; iy += q.y; sprintIn = sprintIn || q.sprint; crouchIn = crouchIn || q.crouch;
    if (q.jump) { jumpHeld = true; if (!q.jumpDone) { jumpPress = true; q.jumpDone = true; } }
    if (q.jumpAt != null && !q.jumpDone && Q.elapsed >= q.jumpAt) { jumpPress = true; jumpHeld = true; q.jumpDone = true; }
    if (Q.elapsed >= q.t) { Q.elapsed = 0; Q.i++; if (Q.i >= Q.segs.length) { S.qa = null; Q.res(); } }
  }
  const il = Math.hypot(ix, iy); if (il > 1) { ix /= il; iy /= il; }
  if (jumpPress) S.jumpBufferT = S.time;
  const jumpWanted = S.time - S.jumpBufferT <= JUMP_BUFFER;
  if (S.hover && (il > 0 || jumpPress)) { S.hover = false; S.noFallDamageUntil = S.time + 4; }

  // ---- mouse look ----
  const sens = (ctx.settings.sensitivity ?? 0.0022) * (p.ads ? (ctx.settings.adsSensitivityMul ?? 0.6) : 1);
  p.yaw -= input.mouse.dx * sens;
  p.pitch = clamp(p.pitch - input.mouse.dy * sens, -PITCH_MAX, PITCH_MAX);
  if (p.yaw > Math.PI * 4 || p.yaw < -Math.PI * 4) p.yaw %= Math.PI * 2;

  // ---- ADS (owned by weapons) — sprint cancels it ----
  const wAds = ctx.weapons?.ads;
  const adsIn = typeof wAds === 'number' ? wAds > 0.5 : (wAds != null ? !!wAds : !!input.ads);

  // ---- mantle in progress: scripted motion ----
  if (S.mantle) { updateMantle(p, ctx, dt); finishFrame(p, ctx, dt, ix, iy, il); return; }

  const gy = groundY(p.position.x, p.position.z);
  const wasGround = S.wasGround;
  const coyote = S.time - S.groundTime <= COYOTE;

  // ---- crouch / stand (ceiling check) ----
  const wasSprinting = p.sprinting;
  const crouchEdge = crouchIn && !S.crouchPrev; S.crouchPrev = crouchIn;
  let wantCrouch = crouchIn || S.sliding;
  const sprintEdge = sprintIn && !S.sprintPrev; S.sprintPrev = sprintIn;
  if (sprintEdge && iy > 0.5 && wasGround && !S.sliding && crouchIn) S.sprintPop = true; // pressing sprint while crouched stands you up (CoD)
  if (!crouchIn) S.sprintPop = false;
  if (S.sprintPop && !S.sliding) wantCrouch = false;
  if (!wantCrouch && p.crouching && capsuleOverlaps(grid, p.position, RADIUS, H_STAND)) wantCrouch = true; // no headroom
  p.crouching = wantCrouch;
  S.hTarget = wantCrouch ? H_CROUCH : H_STAND;
  const hPrev = p.height;
  p.height = damp(p.height, S.hTarget, 16, dt);
  if (Math.abs(p.height - S.hTarget) < 0.002) p.height = S.hTarget;
  if (p.height > hPrev && capsuleOverlaps(grid, p.position, RADIUS, p.height)) p.height = hPrev; // growing into something

  // ---- sprint ----
  const canSprint = iy > 0.5 && sprintIn && !p.crouching && !S.sliding && (wasGround || p.sprinting);
  p.sprinting = canSprint;
  p.ads = adsIn && !p.sprinting;
  if (p.sprinting) S.sprintOut = SPRINT_OUT; else S.sprintOut = Math.max(0, S.sprintOut - dt);

  // ---- slide: sprint + crouch press ----
  if (crouchEdge && wasSprinting && wasGround && p.speed > 5 && !S.sliding) {
    S.sliding = true; S.slideT = 0; S.sprintPop = false; p.sprinting = false; p.crouching = true; S.hTarget = H_CROUCH;
    S.slideDir.set(p.velocity.x, 0, p.velocity.z).normalize(); if (S.slideDir.lengthSq() < 0.5) forwardVec(p.yaw, S.slideDir);
  }
  if (S.sliding) { S.slideT += dt; if (S.slideT >= SLIDE_TIME || !wasGround && S.slideT > 0.15) S.sliding = false; }
  p.sliding = S.sliding;

  // ---- wish velocity ----
  const fwd = forwardVec(p.yaw, _f), right = _r.set(-fwd.z, 0, fwd.x);
  let base = p.crouching ? SPD.crouch : p.ads ? SPD.ads : p.sprinting ? SPD.sprint : SPD.walk;
  const dirMul = il > 0 ? (Math.abs(iy) * (iy < 0 ? BACK_MUL : 1) + Math.abs(ix) * STRAFE_MUL) / (Math.abs(ix) + Math.abs(iy)) : 1;
  const wishSpeed = base * dirMul;
  const wx = (fwd.x * iy + right.x * ix) / (il || 1), wz = (fwd.z * iy + right.z * ix) / (il || 1);
  const v = p.velocity;
  if (S.sliding) {
    const k = S.slideT / SLIDE_TIME, sv = SLIDE_V0 + (SLIDE_V1 - SLIDE_V0) * k;
    // slight steering during slide
    if (il > 0) { S.slideDir.x += wx * dt * 1.2; S.slideDir.z += wz * dt * 1.2; S.slideDir.normalize(); }
    v.x = S.slideDir.x * sv; v.z = S.slideDir.z * sv;
  } else if (S.hover) {
    v.x = 0; v.z = 0;
  } else if (wasGround || coyote && v.y <= 0) {
    const tx = wx * wishSpeed * (il > 0 ? 1 : 0), tz = wz * wishSpeed * (il > 0 ? 1 : 0);
    const l = il > 0 ? ACCEL_L : STOP_L;
    v.x = damp(v.x, tx, l, dt); v.z = damp(v.z, tz, l, dt);
    if (il === 0 && Math.hypot(v.x, v.z) < 0.02) { v.x = 0; v.z = 0; }
  } else {
    // air: reduced control, no speed gain beyond takeoff speed
    if (il > 0) {
      const cap = Math.max(S.takeoffSpeed, 3.0, Math.min(wishSpeed, SPD.walk));
      v.x = damp(v.x, wx * cap, ACCEL_L * AIR_CONTROL, dt); v.z = damp(v.z, wz * cap, ACCEL_L * AIR_CONTROL, dt);
      const hs = Math.hypot(v.x, v.z); if (hs > cap) { v.x *= cap / hs; v.z *= cap / hs; }
    } else { v.x = damp(v.x, 0, 0.4, dt); v.z = damp(v.z, 0, 0.4, dt); }
  }

  // ---- jump / gravity ----
  let jumped = false;
  if (jumpWanted && (wasGround || coyote) && v.y <= 0.5 && !S.hover) {
    v.y = JUMP_V; jumped = true; S.jumpBufferT = -9; S.jumpedAt = S.time; S.groundTime = -9;
    S.takeoffSpeed = Math.hypot(v.x, v.z);
    if (S.sliding) { S.sliding = false; p.sliding = false; }
  }
  if (!S.hover) v.y -= GRAVITY * dt * 0.5; else v.y = 0;   // leapfrog: half step before, half after → apex independent of frame rate
  if (v.y < -40) v.y = -40;

  // ---- integrate + collide (substepped when fast) ----
  const tPhys = performance.now();
  const grounded = wasGround || coyote;
  const distance = v.length() * dt, steps = clamp(Math.ceil(distance / 0.2), 1, 8), sdt = dt / steps;
  let ground = false, landedVy = 0, blocked = null, bnx = 0, bnz = 0, stepped = 0, ceiling = false;
  const opts = { grounded: grounded && !jumped, step: STEP, groundY: gy, wishX: wx * (il > 0 ? 1 : 0), wishZ: wz * (il > 0 ? 1 : 0) };
  for (let i = 0; i < steps; i++) {
    p.position.addScaledVector(v, sdt);
    opts.groundY = groundY(p.position.x, p.position.z);
    resolveCapsule(grid, p.position, RADIUS, p.height, v, opts, _info);
    ground = _info.ground; if (_info.landedVy < landedVy) landedVy = _info.landedVy;
    if (_info.blocked) { blocked = _info.blocked; bnx = _info.blockedNX; bnz = _info.blockedNZ; }
    stepped += _info.stepped; ceiling = ceiling || _info.ceiling;
  }
  // step-down snap (stairs/curbs) so walking down a curb doesn't become a fall
  if (!ground && grounded && !jumped && v.y <= 0 && S.time - S.jumpedAt > 0.25 && !S.hover) {
    const sup = supportBelow(grid, p.position, RADIUS, STEP, groundY(p.position.x, p.position.z));
    if (sup > -Infinity) { stepped -= (p.position.y - sup); p.position.y = sup; v.y = 0; ground = true; }
  }
  // world bounds
  const b = ctx.world?.bounds;
  if (b) { p.position.x = clamp(p.position.x, b.min.x + RADIUS, b.max.x - RADIUS); p.position.z = clamp(p.position.z, b.min.z + RADIUS, b.max.z - RADIUS); if (p.position.y < b.min.y) { p.position.y = b.min.y; v.y = Math.max(0, v.y); ground = true; } }
  if (ceiling && v.y > 0) v.y = 0;
  if (!S.hover && !ground) v.y -= GRAVITY * dt * 0.5;
  S.physMs = S.physMs * 0.9 + (performance.now() - tPhys) * 0.1;
  if (stepped !== 0) S.eyeSmooth -= stepped;              // camera eases over steps instead of popping

  // ---- mantle trigger: blocked by a ledge 0.45..1.3 m above feet while pushing into it + jump ----
  if (p.mantleEnabled && blocked && !S.sliding && il > 0 && (jumpWanted || jumped || jumpHeld && S.time - S.jumpedAt < 0.6)) {
    const top = blocked.max.y - p.position.y;
    const into = -(bnx * wx + bnz * wz);
    if (top > MANTLE_MIN && top <= MANTLE_MAX && into > 0.5) {
      const to = new THREE.Vector3(p.position.x - bnx * (RADIUS + 0.25), blocked.max.y, p.position.z - bnz * (RADIUS + 0.25));
      to.x = clamp(to.x, blocked.min.x + 0.05, blocked.max.x - 0.05); to.z = clamp(to.z, blocked.min.z + 0.05, blocked.max.z - 0.05);
      if (!capsuleOverlaps(grid, to, RADIUS, H_STAND, blocked)) {
        S.mantle = { t: 0, from: p.position.clone(), to, dur: MANTLE_TIME * (0.7 + 0.3 * (top / MANTLE_MAX)) };
        p.mantling = true; v.set(0, 0, 0); S.jumpBufferT = -9; S.sliding = false; p.sliding = false; p.sprinting = false;
      }
    }
  }

  // ---- landing ----
  p.onGround = ground;
  if (ground) S.groundTime = S.time;
  if (ground && !wasGround && landedVy < -1) onLand(p, ctx, -landedVy);
  S.wasGround = ground;
  if (!ground && !jumped && wasGround) S.takeoffSpeed = Math.hypot(v.x, v.z); // walked off an edge

  finishFrame(p, ctx, dt, ix, iy, il);
}

function forwardVec(yaw, out) { return out.set(-Math.sin(yaw), 0, -Math.cos(yaw)); }

function onLand(p, ctx, fallSpeed) {
  const dip = clamp(fallSpeed * 0.013, 0.02, 0.24);
  S.landV -= dip * 16;
  S.landImpulseRaw = Math.max(S.landImpulseRaw, clamp(fallSpeed / 12, 0.15, 1));
  if (fallSpeed > HARD_LAND_V && p.fallDamageEnabled && S.time > S.noFallDamageUntil) p.damage(Math.round((fallSpeed - HARD_LAND_V) * 7), null);
  // a landing counts as a heavy footstep
  emitFootstep(p, ctx, true);
  S.lastStepPhase = S.bobPhase;
}

function updateMantle(p, ctx, dt) {
  const m = S.mantle; m.t += dt;
  const k = clamp(m.t / m.dur, 0, 1);
  // rise first (ease-out), then move forward over the ledge (ease-in-out); slight overshoot dip on the camera
  const ky = smooth(clamp(k * 1.35, 0, 1)), kxz = smooth(clamp((k - 0.2) / 0.8, 0, 1));
  p.position.x = m.from.x + (m.to.x - m.from.x) * kxz; p.position.z = m.from.z + (m.to.z - m.from.z) * kxz;
  p.position.y = m.from.y + (m.to.y - m.from.y) * ky;
  S.eyeSmooth = -0.18 * Math.sin(k * Math.PI);           // camera dip during the vault
  p.velocity.set(0, 0, 0); p.onGround = false; p.sprinting = false;
  if (k >= 1) { S.mantle = null; p.mantling = false; p.onGround = true; S.wasGround = true; S.groundTime = S.time; S.eyeSmooth = -0.06; S.landV -= 0.8; emitFootstep(p, ctx, false); }
}

function updateDeath(p, ctx, dt) {
  S.deathT = Math.min(DEATH_CAM_T, S.deathT + dt);
  // let the body settle on the ground (gravity, simple)
  const v = p.velocity; v.y -= GRAVITY * dt; v.x = damp(v.x, 0, 6, dt); v.z = damp(v.z, 0, 6, dt);
  p.position.addScaledVector(v, dt);
  const opts = { grounded: false, step: 0, groundY: groundY(p.position.x, p.position.z), wishX: 0, wishZ: 0 };
  resolveCapsule(grid, p.position, RADIUS, H_CROUCH, v, opts, _info);
  const k = smooth(S.deathT / DEATH_CAM_T);
  p.height = H_STAND + (0.38 - H_STAND) * k;
  S.roll = damp(S.roll, S.deathRoll * 0.62 * k, 8, dt);
  p.bob.x = damp(p.bob.x, 0, 8, dt); p.bob.y = damp(p.bob.y, 0, 8, dt); p.bob.roll = damp(p.bob.roll, 0, 8, dt);
  p.sprintBlend = damp(p.sprintBlend, 0, 10, dt); p.slideBlend = damp(p.slideBlend, 0, 10, dt); p.landImpulse = damp(p.landImpulse, 0, 8, dt);
  p.speed = 0; p.moveState = 'idle'; p.onGround = true; p.canFire = false;
}

/** bob, springs, footsteps, regen, blends, camera. Runs at the end of every live frame. */
function finishFrame(p, ctx, dt, ix, iy, il) {
  const v = p.velocity;
  p.speed = Math.hypot(v.x, v.z);
  p.sprintOutTime = S.sprintOut;
  p.canFire = !p.sprinting && S.sprintOut <= 0 && !p.mantling && !p.dead;
  p.moveState = p.mantling ? 'air' : !p.onGround ? 'air' : p.crouching ? 'crouch' : p.sprinting ? 'sprint' : p.speed > 0.3 ? 'walk' : 'idle';

  // blends for weapons/hud
  p.sprintBlend = damp(p.sprintBlend, p.sprinting ? 1 : 0, p.sprinting ? 9 : 12, dt);
  p.slideBlend = damp(p.slideBlend, S.sliding ? 1 : 0, S.sliding ? 14 : 8, dt);
  p.crouchBlend = (H_STAND - p.height) / (H_STAND - H_CROUCH);

  // head bob: phase advances per stride; footsteps at the low points
  const moving = p.onGround && p.speed > 0.4 && !p.mantling && !S.sliding;
  S.bobBlend = damp(S.bobBlend, moving ? 1 : 0, moving ? 10 : 7, dt);
  if (moving) {
    const stepsPerSec = 1.4 + p.speed * 0.28;
    const prev = S.bobPhase; S.bobPhase += stepsPerSec * Math.PI * dt;
    const fire = Math.floor((S.bobPhase - Math.PI / 2) / Math.PI) > Math.floor((prev - Math.PI / 2) / Math.PI);
    if (fire) emitFootstep(p, ctx, p.sprinting);
  } else if (S.bobBlend < 0.02) S.bobPhase = 0;
  const spdK = clamp(p.speed / SPD.walk, 0, 1.5);
  let ay = 0.017, ax = 0.010, ar = THREE.MathUtils.degToRad(0.28);
  if (p.sprinting || p.sprintBlend > 0.5) { ay = 0.036; ax = 0.021; ar = THREE.MathUtils.degToRad(0.6); }
  if (p.crouching) { ay *= 0.55; ax *= 0.5; ar *= 0.5; }
  if (p.ads) { ay *= 0.25; ax *= 0.25; ar *= 0.2; }
  const ph = S.bobPhase, bb = S.bobBlend * Math.min(1, spdK);
  const figure8 = p.sprintBlend * 0.35;
  p.bob.x = bb * ax * Math.sin(ph);
  p.bob.y = bb * ay * (Math.cos(2 * ph) * (1 - figure8) + Math.sin(2 * ph) * figure8);
  p.bob.roll = bb * ar * Math.sin(ph);

  // landing spring (critically-ish damped) and step smoothing
  // substepped so it stays stable at any frame rate (explicit Euler at dt>0.08 s blew up and pinned the pitch clamp)
  const k = 260, c = 30; // zeta≈0.93: one dip and settle, no ringing
  { let rem = dt; while (rem > 0) { const h = Math.min(rem, 1 / 240); S.landV += (-k * S.landY - c * S.landV) * h; S.landY += S.landV * h; rem -= h; } }
  S.landY = clamp(S.landY, -0.35, 0.35); S.landV = clamp(S.landV, -12, 12);
  if (Math.abs(S.landY) < 1e-4 && Math.abs(S.landV) < 1e-3) { S.landY = 0; S.landV = 0; }
  S.landImpulseRaw = damp(S.landImpulseRaw, 0, 6, dt); p.landImpulse = S.landImpulseRaw;
  S.eyeSmooth = damp(S.eyeSmooth, 0, 16, dt);

  // strafe roll + slide lean
  const rollT = -ix * STRAFE_ROLL * (p.onGround ? 1 : 0.5) - p.slideBlend * THREE.MathUtils.degToRad(2.5);
  S.roll = damp(S.roll, rollT, 12, dt);

  // health regen 4 s after last damage
  if (!p.dead && p.health < p.maxHealth && S.time - S.lastDamage >= REGEN_DELAY) p.health = Math.min(p.maxHealth, p.health + REGEN_RATE * dt);

  applyCamera(p, ctx);
  if (ctx.qa) { const t = S.qaTrace; t.push({ t: +S.time.toFixed(3), y: +p.position.y.toFixed(3), spd: +p.speed.toFixed(2), boby: +p.bob.y.toFixed(4), bobx: +p.bob.x.toFixed(4), g: p.onGround ? 1 : 0, hp: Math.round(p.health), land: +p.landImpulse.toFixed(2), camX: +ctx.camera.rotation.x.toFixed(3), eye: +(ctx.camera.position.y - p.position.y).toFixed(3), dt: +dt.toFixed(3) }); if (t.length > 900) t.splice(0, t.length - 900); }
}

function applyCamera(p, ctx) {
  const cam = ctx.camera; if (!cam) return;
  const eyeY = p.position.y + p.height - EYE_DROP + S.eyeSmooth + S.landY + (p.dead ? 0 : -p.slideBlend * 0.08);
  const fwd = forwardVec(p.yaw, _f), right = _r.set(-fwd.z, 0, fwd.x);
  _v.set(p.position.x, eyeY, p.position.z).addScaledVector(right, p.bob.x).addScaledVector(_up, p.bob.y);
  cam.position.copy(_v); p.cameraPosition.copy(_v);
  const pitchOff = S.landY * 0.9 + (p.dead ? -0.12 * smooth(S.deathT / DEATH_CAM_T) : 0);
  cam.rotation.set(clamp(p.pitch + pitchOff, -PITCH_MAX, PITCH_MAX), p.yaw, S.roll + p.bob.roll);
}

function emitFootstep(p, ctx, sprint) {
  ctx.bus.emit('footstep', { position: p.position.clone(), surface: surfaceUnder(p, ctx), sprint: !!sprint, who: 'player', crouch: p.crouching });
}

function surfaceUnder(p, ctx) {
  try {
    const s = ctx.world?.surfaceAt?.(p.position); if (typeof s === 'string' && s) return s;
    const targets = ctx.raycastTargets; if (targets && targets.length) {
      _ray.set(_v.set(p.position.x, p.position.y + 0.5, p.position.z), _f.set(0, -1, 0)); _ray.far = 1.2;
      const hits = _ray.intersectObjects(targets, false);
      for (const h of hits) { const su = h.object?.userData?.surface; if (su && su !== 'flesh') return su; }
    }
  } catch { /* other modules' meshes may be mid-construction */ }
  return 'concrete';
}
