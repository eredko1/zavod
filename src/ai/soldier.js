// Soldier runtime: locomotion/path following, animation blending, procedural aim layer (spine/head/arm IK on the
// rifle), crouch, lean, flinch, burst fire. Behaviour decisions live in ai.js; this file executes them. Owned by: AI agent.
import * as THREE from 'three';
import { RIFLE } from './model.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrapAngle = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));

export const SPEED = { walk: 1.8, run: 4.5, crouch: 1.2 };

// --- bone helpers (parent.matrixWorld must be current) ---
function parentQuat(bone, out) { _m.extractRotation(bone.parent.matrixWorld); return out.setFromRotationMatrix(_m); }
export function refresh(bone) { bone.updateWorldMatrix(false, false); }
export function rotateWorld(bone, q) { parentQuat(bone, _pq); bone.quaternion.premultiply(_pq).premultiply(q).premultiply(_q2.copy(_pq).invert()); }
export function setWorldQuat(bone, q) { parentQuat(bone, _pq); bone.quaternion.copy(_pq.invert()).multiply(q); }
function wpos(bone, out) { return out.setFromMatrixPosition(bone.matrixWorld); }
function rotAxis(axis, angle) { return _q.setFromAxisAngle(axis, angle); }

let nextId = 1;

export class Soldier {
  constructor(ctx, asset, inst, opts = {}) {
    this.id = nextId++;
    this.ctx = ctx; this.asset = asset; this.inst = inst;
    this.group = inst.group; this.mesh = inst.group; this.bones = inst.bones; this.mixer = inst.mixer; this.actions = inst.actions;
    this.position = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = 0; this.speed = 0;
    this.maxHealth = opts.health ?? 100; this.health = this.maxHealth;
    this.state = 'advance'; this.archetype = opts.archetype || 'rifleman'; this.squad = null;
    this.hitboxes = { head: inst.hitboxes[0], body: inst.hitboxes[1], all: inst.hitboxes };
    for (const h of inst.hitboxes) h.userData.soldier = this;
    this.rng = ctx.rng;
    // motion
    this.moveGoal = null; this.path = null; this.pathIdx = 0; this.pathT = -10; this.gait = 'run'; this.arrived = true;
    this.crouch = 0; this.crouchTarget = 0; this.lean = 0; this.leanTarget = 0; this.stagger = 0;
    this.faceDir = new THREE.Vector3(0, 0, 1);
    // aim
    this.hasTarget = false; this.aimPoint = new THREE.Vector3(); this.aimDir = new THREE.Vector3(0, 0, 1); this.aimSmooth = 0;
    this.engageTime = 0; this.seesPlayer = false; this.lastSeen = -100; this.lastKnown = new THREE.Vector3();
    // fire
    this.burst = 0; this.nextShot = 0; this.fireCooldown = 0; this.wantFire = false; this.shotsFired = 0;
    this.flashT = 0;
    // flinch spring
    this.flAxis = new THREE.Vector3(1, 0, 0); this.flTheta = 0; this.flOmega = 0;
    // timers
    this.stateT = 0; this.nextThink = ctx.rng() * 0.25; this.dead = false; this.deadT = 0; this.ragdoll = null; this.removeMe = false;
    this.spawnT = 0; this.qaLock = null;
    this.alive = true;
    // bind-pose data for IK/head
    this.computeBindData();
    this.tmp = { rifleQ: new THREE.Quaternion(), rifleFwd: new THREE.Vector3(), gripR: new THREE.Vector3(), gripL: new THREE.Vector3() };
    this.updateVisual(0);
  }

  computeBindData() {
    const b = this.bones; this.group.updateMatrixWorld(true);
    const hb = {};
    for (const side of ['Left', 'Right']) {
      const hand = b[side + 'Hand'], mid = b[side + 'HandMiddle1'], t1 = b[side + 'HandThumb1'], t2 = b[side + 'HandThumb2'];
      const hq = new THREE.Quaternion(); hand.getWorldQuaternion(hq); const hqi = hq.clone().invert();
      const fingers = mid ? mid.position.clone().normalize() : new THREE.Vector3(0, 1, 0);
      let thumb = new THREE.Vector3(0, 0, 1);
      if (t1 && t2) { thumb = t2.getWorldPosition(new THREE.Vector3()).sub(t1.getWorldPosition(new THREE.Vector3())).normalize().applyQuaternion(hqi); }
      const palm = side === 'Right' ? new THREE.Vector3().crossVectors(thumb, fingers) : new THREE.Vector3().crossVectors(fingers, thumb);
      palm.sub(fingers.clone().multiplyScalar(palm.dot(fingers))).normalize();
      const bin = new THREE.Vector3().crossVectors(fingers, palm);
      const M = new THREE.Matrix4().makeBasis(fingers, palm, bin);
      hb[side] = { invLocal: M.clone().invert() };
      const up = wpos(b[side + 'Arm'], new THREE.Vector3()), el = wpos(b[side + 'ForeArm'], new THREE.Vector3()), hd = wpos(hand, new THREE.Vector3());
      hb[side].l1 = up.distanceTo(el); hb[side].l2 = el.distanceTo(hd);
      const hip = wpos(b[side + 'UpLeg'], new THREE.Vector3()), knee = wpos(b[side + 'Leg'], new THREE.Vector3()), foot = wpos(b[side + 'Foot'], new THREE.Vector3());
      hb[side].thigh = hip.distanceTo(knee); hb[side].shin = knee.distanceTo(foot);
    }
    this.hb = hb;
    const headQ = new THREE.Quaternion(); b.Head.getWorldQuaternion(headQ);
    this.headFwdLocal = new THREE.Vector3(0, 0, 1).applyQuaternion(headQ.invert());
    this.rifleLocalQ = this.inst.rifle.quaternion.clone();
    // hips parent frame for crouch offset
    const pq = new THREE.Quaternion(); b.Hips.parent.getWorldQuaternion(pq); const ps = b.Hips.parent.getWorldScale(new THREE.Vector3());
    this.hipsDownLocal = new THREE.Vector3(0, -1, 0).applyQuaternion(pq.invert()).divide(ps);
    this.hipsRestY = b.Hips.getWorldPosition(new THREE.Vector3()).y - this.group.position.y;
  }

  placeAt(pos, yaw) {
    this.position.copy(pos); this.yaw = yaw; this.faceDir.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.group.position.copy(pos); this.group.rotation.y = yaw; this.group.updateMatrixWorld(true);
  }

  get eyeHeight() { return 1.62 - 0.5 * this.crouch; }
  eye(out = _v4) { return out.set(this.position.x, this.position.y + this.eyeHeight, this.position.z); }
  chest(out = _v4) { return out.set(this.position.x, this.position.y + 1.35 - 0.45 * this.crouch, this.position.z); }

  // ---------- locomotion ----------
  setGoal(p, gait = 'run') {
    if (!p) { this.moveGoal = null; this.path = null; this.arrived = true; return; }
    const changed = !this.moveGoal || this.moveGoal.distanceToSquared(p) > 1.0;
    this.moveGoal = p.clone(); this.gait = gait; this.arrived = false;
    if (changed) { this.path = null; this.pathT = -10; }
  }

  moveStep(dt, nav, others, player) {
    const t = this.ctx.time.elapsed;
    const desired = _v.set(0, 0, 0);
    if (this.moveGoal && !this.arrived) {
      if (!this.path && t - this.pathT > 0.35 && nav.budget > 0) {
        nav.budget--; this.pathT = t;
        const p = nav.findPath(this.position, this.moveGoal);
        if (p && p.length) { this.path = p; this.pathIdx = 0; }
        else if (p && !p.length) { this.arrived = true; }
        else { // no path: try straight line
          this.path = [this.moveGoal.clone()]; this.pathIdx = 0;
        }
      }
      if (this.path) {
        let wp = this.path[this.pathIdx];
        while (wp && this.position.distanceToSquared(wp) < (this.pathIdx === this.path.length - 1 ? 0.16 : 0.36)) { this.pathIdx++; wp = this.path[this.pathIdx]; }
        if (!wp) { this.arrived = true; this.path = null; }
        else {
          desired.subVectors(wp, this.position); desired.y = 0; const d = desired.length();
          if (d > 1e-4) desired.multiplyScalar(1 / d);
          let sp = this.gait === 'walk' ? SPEED.walk : SPEED.run;
          if (this.crouch > 0.5) sp = Math.min(sp, SPEED.crouch + 0.6);
          if (this.stagger > 0) sp *= 0.25;
          // slow down on final approach
          const remain = this.pathIdx === this.path.length - 1 ? d : 99;
          if (remain < 1.2) sp = Math.min(sp, Math.max(0.8, remain * 2.5));
          desired.multiplyScalar(sp);
        }
      }
    }
    // separation from other soldiers + player avoidance
    for (const o of others) {
      if (o === this || o.dead) continue;
      const dx = this.position.x - o.position.x, dz = this.position.z - o.position.z; const d2 = dx * dx + dz * dz;
      if (d2 < 1.69 && d2 > 1e-6) { const d = Math.sqrt(d2); const k = (1.3 - d) / 1.3 * 2.2; desired.x += dx / d * k; desired.z += dz / d * k; }
    }
    if (player) {
      const dx = this.position.x - player.position.x, dz = this.position.z - player.position.z; const d2 = dx * dx + dz * dz;
      if (d2 < 4 && d2 > 1e-6) { const d = Math.sqrt(d2); const k = (2 - d) / 2 * 3; desired.x += dx / d * k; desired.z += dz / d * k; }
    }
    // steer velocity
    const acc = 14;
    this.vel.x = damp(this.vel.x, desired.x, acc, dt); this.vel.z = damp(this.vel.z, desired.z, acc, dt); this.vel.y = 0;
    this.position.addScaledVector(this.vel, dt);
    nav.resolveCircle(this.position, 0.38);
    this.position.y = nav.groundY(this.position.x, this.position.z);
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    // stuck detection: if we barely move toward a far goal, replan
    if (this.moveGoal && !this.arrived) {
      this.stuckAcc = (this.stuckAcc || 0) + (this.speed < 0.3 ? dt : -dt * 0.5); if (this.stuckAcc < 0) this.stuckAcc = 0;
      if (this.stuckAcc > 1.2) { this.stuckAcc = 0; this.path = null; this.pathT = -10; }
    }
  }

  // body yaw: face target when engaged and not moving away from it, else face movement dir
  updateFacing(dt) {
    let want = null;
    const moving = this.speed > 0.6;
    if (moving) {
      const md = _v.set(this.vel.x, 0, this.vel.z).normalize();
      if (this.hasTarget) {
        const td = _v2.subVectors(this.aimPoint, this.position); td.y = 0; td.normalize();
        want = md.dot(td) > -0.2 ? td : md; // strafe/advance while facing the enemy; turn away when retreating
      } else want = md;
    } else if (this.hasTarget) { want = _v2.subVectors(this.aimPoint, this.position); want.y = 0; want.normalize(); }
    if (want && want.lengthSq() > 0.5) {
      const wy = Math.atan2(want.x, want.z); const d = wrapAngle(wy - this.yaw);
      const rate = moving ? 8 : 5;
      this.yaw += d * (1 - Math.exp(-rate * dt));
      this.yaw = wrapAngle(this.yaw);
    }
    // torso limit: if the aim is beyond ±70° of body yaw, keep turning the body
    if (this.hasTarget) {
      const ay = Math.atan2(this.aimDir.x, this.aimDir.z); const off = wrapAngle(ay - this.yaw - RIFLE.yaw);
      if (Math.abs(off) > 1.1) this.yaw = wrapAngle(this.yaw + (off - Math.sign(off) * 1.1));
    }
  }

  // ---------- aim ----------
  setAim(point) { this.hasTarget = true; this.aimPoint.copy(point); }
  clearAim() { this.hasTarget = false; }

  updateAim(dt) {
    const chest = this.chest(_v3);
    let dir;
    if (this.hasTarget) { dir = _v.subVectors(this.aimPoint, chest).normalize(); }
    else {
      // patrol carry: rifle across the chest, muzzle down
      const y = this.yaw + RIFLE.yaw; dir = _v.set(Math.sin(y) * 0.9, -0.42, Math.cos(y) * 0.9).normalize();
    }
    const l = this.hasTarget ? 10 : 4;
    this.aimDir.lerp(dir, 1 - Math.exp(-l * dt)).normalize();
  }

  // ---------- fire ----------
  startBurst(n) { if (this.burst <= 0) { this.burst = n; this.nextShot = 0; } }

  // ---------- damage / flinch ----------
  flinch(dir, strength = 1) {
    this.flAxis.crossVectors(UP, dir).normalize(); if (this.flAxis.lengthSq() < 0.1) this.flAxis.set(1, 0, 0);
    this.flOmega += 7 * strength;
    this.stagger = Math.max(this.stagger, 0.25 * strength);
  }

  // ---------- per-frame visual pipeline ----------
  updateVisual(dt) {
    const inst = this.inst, b = this.bones;
    // animation blend from speed
    const s = this.speed;
    const wIdle = clamp(1 - s / 1.2, 0, 1);
    const wRun = clamp((s - 2.0) / 2.0, 0, 1);
    const wWalk = clamp(1 - wIdle - wRun, 0, 1);
    if (this.actions.Idle) this.actions.Idle.setEffectiveWeight(wIdle);
    if (this.actions.Walk) { this.actions.Walk.setEffectiveWeight(wWalk); this.actions.Walk.setEffectiveTimeScale(clamp(s / 1.5, 0.6, 1.5)); }
    if (this.actions.Run) { this.actions.Run.setEffectiveWeight(wRun); this.actions.Run.setEffectiveTimeScale(clamp(s / 4.2, 0.7, 1.3)); }
    this.mixer.update(dt);

    // crouch / lean / stagger / flinch integration
    this.crouch = damp(this.crouch, this.crouchTarget, 7, dt);
    this.lean = damp(this.lean, this.leanTarget, 8, dt);
    if (this.stagger > 0) this.stagger -= dt;
    if (dt > 0) { const k = 150, c = 13; this.flOmega += (-k * this.flTheta - c * this.flOmega) * dt; this.flTheta += this.flOmega * dt; }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) { inst.flash.visible = false; inst.flash2.visible = false; } }

    // root
    this.group.position.copy(this.position); this.group.rotation.y = this.yaw;
    this.group.updateWorldMatrix(false, true);

    const yaw = this.yaw; const right = _v2.set(-Math.cos(yaw), 0, Math.sin(yaw)); // character right (-X at yaw 0)

    // ---- crouch: drop hips, fold legs (feet stay planted) ----
    const cr = this.crouch;
    if (cr > 0.005) {
      const a = 0.95 * cr, kb = 1.7 * cr, fa = 0.75 * cr; // thigh forward, knee bend, ankle
      const L1 = this.hb.Left.thigh, L2 = this.hb.Left.shin;
      const drop = (L1 + L2) - (L1 * Math.cos(a) + L2 * Math.cos(kb - a));
      b.Hips.position.addScaledVector(this.hipsDownLocal, drop);
      refresh(b.Hips);
      for (const side of ['Left', 'Right']) {
        const ul = b[side + 'UpLeg'], lg = b[side + 'Leg'], ft = b[side + 'Foot'];
        rotateWorld(ul, rotAxis(right, a)); refresh(ul);
        rotateWorld(lg, rotAxis(right, -kb)); refresh(lg);
        rotateWorld(ft, rotAxis(right, fa)); refresh(ft);
      }
      // forward lean when crouched
      rotateWorld(b.Spine, rotAxis(right, 0.25 * cr));
    }
    refresh(b.Spine);

    // ---- torso aim: rotate so rifle forward == aimDir ----
    // current rifle forward from animated chest
    refresh(b.Spine1); refresh(b.Spine2);
    _m.extractRotation(b.Spine2.matrixWorld); _q2.setFromRotationMatrix(_m).multiply(this.rifleLocalQ);
    const rf = this.tmp.rifleFwd.set(0, 0, 1).applyQuaternion(_q2);
    const ad = this.aimDir;
    const curYaw = Math.atan2(rf.x, rf.z), wantYaw = Math.atan2(ad.x, ad.z);
    let dYaw = wrapAngle(wantYaw - curYaw); dYaw = clamp(dYaw, -1.35, 1.35);
    const curPitch = Math.asin(clamp(rf.y, -1, 1)), wantPitch = Math.asin(clamp(ad.y, -1, 1));
    let dPitch = clamp(wantPitch - curPitch, -0.95, 0.8);
    const aimH = _v3.set(ad.x, 0, ad.z).normalize(); const pitchAxis = _v.crossVectors(aimH, UP).normalize();
    const split = [0.28, 0.34, 0.38]; const spineBones = [b.Spine, b.Spine1, b.Spine2];
    const leanQ = this.lean !== 0 ? _q2.setFromAxisAngle(aimH, -this.lean * 0.3) : null;
    for (let i = 0; i < 3; i++) {
      const sb = spineBones[i];
      rotateWorld(sb, rotAxis(UP, dYaw * split[i]));
      rotateWorld(sb, rotAxis(pitchAxis, dPitch * split[i]));
      if (leanQ && i === 0) rotateWorld(sb, leanQ);
      if (i === 1 && Math.abs(this.flTheta) > 1e-4) rotateWorld(sb, rotAxis(this.flAxis, this.flTheta * 0.7));
      refresh(sb);
    }
    // ---- head look ----
    refresh(b.Neck);
    refresh(b.Head);
    _m.extractRotation(b.Head.matrixWorld); _q2.setFromRotationMatrix(_m);
    const hf = _v3.copy(this.headFwdLocal).applyQuaternion(_q2);
    const lookDir = this.hasTarget ? _v.subVectors(this.aimPoint, wpos(b.Head, _v4)).normalize() : _v.copy(ad);
    let hy = wrapAngle(Math.atan2(lookDir.x, lookDir.z) - Math.atan2(hf.x, hf.z)); hy = clamp(hy, -0.9, 0.9);
    let hp = clamp(Math.asin(clamp(lookDir.y, -1, 1)) - Math.asin(clamp(hf.y, -1, 1)), -0.5, 0.5);
    if (!this.hasTarget) { hp = clamp(hp + 0.35, -0.3, 0.3); }
    const hAxis = _v3.set(lookDir.x, 0, lookDir.z).normalize().cross(UP).normalize();
    rotateWorld(b.Head, rotAxis(UP, hy * 0.85)); rotateWorld(b.Head, rotAxis(hAxis, hp * 0.8));
    if (Math.abs(this.flTheta) > 1e-4) rotateWorld(b.Head, rotAxis(this.flAxis, this.flTheta * 0.9));
    refresh(b.Head);

    // ---- rifle + arm IK ----
    refresh(inst.rifle);
    const rq = this.tmp.rifleQ; _m.extractRotation(inst.rifle.matrixWorld); rq.setFromRotationMatrix(_m);
    const gripR = this.tmp.gripR.copy(RIFLE.gripR).applyMatrix4(inst.rifle.matrixWorld);
    const gripL = this.tmp.gripL.copy(RIFLE.gripL).applyMatrix4(inst.rifle.matrixWorld);
    this.solveArm('Right', gripR, RIFLE.poleR, RIFLE.fingersR, RIFLE.palmR, rq);
    this.solveArm('Left', gripL, RIFLE.poleL, RIFLE.fingersL, RIFLE.palmL, rq);
  }

  solveArm(side, target, poleLocal, fingersLocal, palmLocal, rifleQ) {
    const b = this.bones, hb = this.hb[side];
    const sh = b[side + 'Shoulder'], arm = b[side + 'Arm'], fore = b[side + 'ForeArm'], hand = b[side + 'Hand'];
    refresh(sh); refresh(arm); refresh(fore); refresh(hand);
    const S = wpos(arm, new THREE.Vector3()), E = wpos(fore, _v), H = wpos(hand, _v2);
    const L1 = hb.l1, L2 = hb.l2;
    const toT = _v3.subVectors(target, S); let D = toT.length(); if (D < 1e-4) return;
    const maxD = (L1 + L2) * 0.985; if (D > maxD) D = maxD; if (D < 0.08) D = 0.08;
    const axis = toT.multiplyScalar(1 / toT.length());
    const a = (L1 * L1 + D * D - L2 * L2) / (2 * D); const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const pole = _v4.copy(poleLocal).applyQuaternion(rifleQ);
    const perp = pole.sub(axis.clone().multiplyScalar(pole.dot(axis)));
    if (perp.lengthSq() < 1e-6) perp.set(0, -1, 0).sub(axis.clone().multiplyScalar(axis.y)); perp.normalize();
    const Ep = S.clone().addScaledVector(axis, a).addScaledVector(perp, h);
    // upper arm
    const d0 = E.clone().sub(S).normalize(), d1 = Ep.clone().sub(S).normalize();
    rotateWorld(arm, _q.setFromUnitVectors(d0, d1)); refresh(arm); refresh(fore); refresh(hand);
    const E2 = wpos(fore, _v), H2 = wpos(hand, _v2);
    const Tp = S.clone().addScaledVector(axis, D);
    const e0 = H2.clone().sub(E2).normalize(), e1 = Tp.clone().sub(E2).normalize();
    rotateWorld(fore, _q.setFromUnitVectors(e0, e1)); refresh(fore);
    // hand orientation from rifle frame
    const F = _v3.copy(fingersLocal).applyQuaternion(rifleQ).normalize();
    const P = _v4.copy(palmLocal).applyQuaternion(rifleQ); P.sub(F.clone().multiplyScalar(P.dot(F))).normalize();
    const B = new THREE.Vector3().crossVectors(F, P);
    _m2.makeBasis(F, P, B).multiply(hb.invLocal);
    _q.setFromRotationMatrix(_m2);
    setWorldQuat(hand, _q); refresh(hand);
  }

  showFlash() {
    const f = this.inst.flash; f.visible = true; this.inst.flash2.visible = true;
    f.rotation.z = this.rng() * Math.PI * 2; const sc = 0.8 + this.rng() * 0.6; f.scale.setScalar(sc);
    this.flashT = 0.06;
  }

  muzzleWorld(out) { this.inst.muzzle.updateWorldMatrix(true, false); return out.setFromMatrixPosition(this.inst.muzzle.matrixWorld); }
}
