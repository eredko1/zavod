// Verlet bone ragdoll for soldier deaths: 15 particles + distance/limit constraints, ground + AABB collision;
// skeleton bones follow the particle segments. Owned by: AI agent.
import * as THREE from 'three';
import { refresh } from './soldier.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const GRAVITY = 10.5, SUB = 1 / 120;

const _bu = new THREE.Vector3(), _bs = new THREE.Vector3(), _bf = new THREE.Vector3();
function basisQuat(up, side, out) {
  const u = _bu.copy(up).normalize(); const s = _bs.copy(side).addScaledVector(u, -u.dot(side)).normalize();
  const f = _bf.crossVectors(s, u).normalize();
  _m.makeBasis(s, u, f); return out.setFromRotationMatrix(_m);
}

export class Ragdoll {
  constructor(soldier, nav, hit) {
    const b = soldier.bones; this.soldier = soldier; this.nav = nav; this.bones = b;
    soldier.group.updateMatrixWorld(true);
    const wp = (bone, dy = 0) => bone.getWorldPosition(new THREE.Vector3()).add(_v.set(0, dy, 0));
    const P = this.P = {};
    P.hips = wp(b.Hips); P.hipL = wp(b.LeftUpLeg); P.hipR = wp(b.RightUpLeg); P.chest = wp(b.Spine2);
    P.head = wp(b.Head).lerp(wp(b.HeadTop_End), 0.5);
    P.shL = wp(b.LeftArm); P.shR = wp(b.RightArm); P.elL = wp(b.LeftForeArm); P.elR = wp(b.RightForeArm); P.haL = wp(b.LeftHand); P.haR = wp(b.RightHand);
    P.knL = wp(b.LeftLeg); P.knR = wp(b.RightLeg); P.ftL = wp(b.LeftFoot); P.ftR = wp(b.RightFoot);
    this.names = Object.keys(P);
    this.radius = { hips: 0.14, chest: 0.15, head: 0.12, hipL: 0.1, hipR: 0.1, shL: 0.09, shR: 0.09, elL: 0.06, elR: 0.06, haL: 0.05, haR: 0.05, knL: 0.07, knR: 0.07, ftL: 0.06, ftR: 0.06 };
    this.prev = {}; this.mass = {};
    const vel = soldier.vel;
    for (const n of this.names) { this.prev[n] = P[n].clone().addScaledVector(vel, -SUB); this.mass[n] = 1; }
    this.mass.hips = 2.2; this.mass.chest = 2.0; this.mass.hipL = this.mass.hipR = 1.4; this.mass.head = 1.1;
    // constraints
    const C = this.C = []; const d = (a, c, k = 1) => C.push([a, c, P[a].distanceTo(P[c]), k, 0]);
    const min = (a, c, m) => C.push([a, c, m, 1, 1]); const max = (a, c, m) => C.push([a, c, m, 1, 2]);
    d('hips', 'chest'); d('hips', 'hipL'); d('hips', 'hipR'); d('hipL', 'hipR'); d('hipL', 'chest'); d('hipR', 'chest');
    d('chest', 'shL'); d('chest', 'shR'); d('shL', 'shR'); d('shL', 'hips'); d('shR', 'hips'); d('hipL', 'shL'); d('hipR', 'shR');
    d('head', 'chest', 0.9); d('head', 'shL', 0.7); d('head', 'shR', 0.7);
    d('shL', 'elL'); d('elL', 'haL'); d('shR', 'elR'); d('elR', 'haR');
    d('hipL', 'knL'); d('knL', 'ftL'); d('hipR', 'knR'); d('knR', 'ftR');
    min('haL', 'shL', 0.24); min('haR', 'shR', 0.24); min('knL', 'chest', 0.5); min('knR', 'chest', 0.5); min('ftL', 'hipL', 0.4); min('ftR', 'hipR', 0.4);
    min('knL', 'knR', 0.14); min('ftL', 'ftR', 0.14); min('elL', 'elR', 0.3); min('haL', 'haR', 0.12); min('head', 'haL', 0.15); min('head', 'haR', 0.15);
    min('elL', 'hips', 0.15); min('elR', 'hips', 0.15); min('knL', 'hips', 0.3); min('knR', 'hips', 0.3);
    max('haL', 'chest', 0.72); max('haR', 'chest', 0.72); max('ftL', 'chest', 1.2); max('ftR', 'chest', 1.2);
    // "muscles": soft constraints that keep legs straight and torso upright, decaying to zero over ~0.7 s so the body buckles instead of dropping
    const muscle = (a, c) => C.push([a, c, P[a].distanceTo(P[c]), 1, 3]);
    muscle('hipL', 'ftL'); muscle('hipR', 'ftR'); muscle('head', 'ftL'); muscle('head', 'ftR'); muscle('chest', 'knL'); muscle('chest', 'knR');
    this.muscle = 1;
    // impulse from killing shot
    if (hit && hit.dir) {
      const dir = hit.dir.clone().normalize(); const pt = hit.point || P.chest;
      for (const n of this.names) {
        const dist = P[n].distanceTo(pt); const w = Math.max(0, 1 - dist / 0.7);
        const s = (hit.strength || 3.5) * 0.7 * (0.3 + w) * (n === 'head' && hit.headshot ? 1.8 : 1);
        this.prev[n].addScaledVector(dir, -s * SUB); this.prev[n].y += 0.25 * SUB * s; // tiny lift so the body doesn't just drop straight
      }
      // knees buckle: pull knees forward/down slightly
      const fwd = _v.set(Math.sin(soldier.yaw), 0, Math.cos(soldier.yaw));
      this.prev.knL.addScaledVector(fwd, -0.6 * SUB); this.prev.knR.addScaledVector(fwd, -0.6 * SUB);
      this.prev.hips.addScaledVector(fwd, 0.4 * SUB);
    }
    // bone bind data (at death pose)
    this.rec = {};
    const record = (bone, upA, upB, sideA, sideB) => {
      const q0 = bone.getWorldQuaternion(new THREE.Quaternion());
      const up = P[upB].clone().sub(P[upA]); const side = sideA ? P[sideB].clone().sub(P[sideA]) : null;
      const f0 = side ? basisQuat(up, side, new THREE.Quaternion()) : null;
      this.rec[bone.name] = { bone, q0, upA, upB, sideA, sideB, f0, d0: up.normalize() };
    };
    record(b.Hips, 'hips', 'chest', 'hipL', 'hipR');
    record(b.Spine, 'hips', 'chest', 'shL', 'shR');
    record(b.Neck, 'chest', 'head', 'shL', 'shR');
    record(b.LeftArm, 'shL', 'elL'); record(b.LeftForeArm, 'elL', 'haL'); record(b.RightArm, 'shR', 'elR'); record(b.RightForeArm, 'elR', 'haR');
    record(b.LeftUpLeg, 'hipL', 'knL'); record(b.LeftLeg, 'knL', 'ftL'); record(b.RightUpLeg, 'hipR', 'knR'); record(b.RightLeg, 'knR', 'ftR');
    this.order = [b.Hips, b.Spine, b.Spine1, b.Spine2, b.Neck, b.Head, b.LeftShoulder, b.LeftArm, b.LeftForeArm, b.LeftHand, b.RightShoulder, b.RightArm, b.RightForeArm, b.RightHand, b.LeftUpLeg, b.LeftLeg, b.LeftFoot, b.RightUpLeg, b.RightLeg, b.RightFoot];
    this.acc = 0; this.settled = false; this.restT = 0; this.age = 0; this.energy = 1;
  }

  step(dt) {
    if (this.settled) return;
    this.age += dt; this.acc += dt; let n = 0;
    while (this.acc >= SUB && n < 4) { this.acc -= SUB; this.substep(SUB); n++; }
    if (n === 4) this.acc = 0;
    if (this.energy < 0.004) { this.restT += dt; if (this.restT > 0.8 || this.age > 6) this.settled = true; } else this.restT = 0;
  }

  substep(h) {
    const P = this.P, prev = this.prev; const g = GRAVITY * h * h; let energy = 0;
    for (const n of this.names) {
      const p = P[n], q = prev[n];
      const vx = (p.x - q.x) * 0.985, vy = (p.y - q.y) * 0.985, vz = (p.z - q.z) * 0.985;
      q.copy(p); p.x += vx; p.y += vy - g; p.z += vz;
      energy += vx * vx + vy * vy + vz * vz;
    }
    this.energy = energy / this.names.length / (h * h) * 0.01;
    this.muscle = Math.max(0, this.muscle - h / 0.7);
    const mk = this.muscle * this.muscle * 0.35;
    for (let it = 0; it < 5; it++) {
      for (const c of this.C) {
        const a = P[c[0]], b = P[c[1]], rest = c[2], mode = c[4]; let k = c[3];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z; const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        if (mode === 1 && d >= rest) continue; if (mode === 2 && d <= rest) continue;
        if (mode === 3) { if (mk <= 0) continue; k = mk; }
        const ma = this.mass[c[0]], mb = this.mass[c[1]]; const wa = (1 / ma) / (1 / ma + 1 / mb), wb = 1 - wa;
        const diff = (d - rest) / d * k; const ox = dx * diff, oy = dy * diff, oz = dz * diff;
        a.x += ox * wa; a.y += oy * wa; a.z += oz * wa; b.x -= ox * wb; b.y -= oy * wb; b.z -= oz * wb;
      }
      this.collide();
    }
  }

  collide() {
    const P = this.P, nav = this.nav;
    for (const n of this.names) {
      const p = P[n], r = this.radius[n]; const gy = nav.groundY(p.x, p.z) + r;
      if (p.y < gy) { p.y = gy; const q = this.prev[n]; q.x = p.x + (q.x - p.x) * 0.35; q.z = p.z + (q.z - p.z) * 0.35; }
      for (const box of nav.solids) {
        if (p.x < box.min.x - r || p.x > box.max.x + r || p.z < box.min.z - r || p.z > box.max.z + r || p.y < box.min.y - r || p.y > box.max.y + r) continue;
        const px = Math.min(p.x - (box.min.x - r), (box.max.x + r) - p.x), pz = Math.min(p.z - (box.min.z - r), (box.max.z + r) - p.z), py = (box.max.y + r) - p.y;
        if (py <= px && py <= pz) { p.y = box.max.y + r; const q = this.prev[n]; q.x = p.x + (q.x - p.x) * 0.35; q.z = p.z + (q.z - p.z) * 0.35; }
        else if (px < pz) p.x += (p.x - (box.min.x + box.max.x) / 2 > 0 ? px : -px); else p.z += (p.z - (box.min.z + box.max.z) / 2 > 0 ? pz : -pz);
      }
    }
  }

  // write particle state into the skeleton
  apply() {
    const P = this.P, b = this.bones, rec = this.rec;
    const hips = b.Hips; hips.parent.updateWorldMatrix(true, false);
    const local = P.hips.clone(); hips.parent.worldToLocal(local); hips.position.copy(local);
    for (const bone of this.order) {
      const r = rec[bone.name];
      if (r) {
        const up = _v.subVectors(P[r.upB], P[r.upA]);
        let qw;
        if (r.f0) { const f = basisQuat(up, _v2.subVectors(P[r.sideB], P[r.sideA]), _q2); qw = f.multiply(_q.copy(r.f0).invert()).multiply(r.q0); }
        else { qw = _q2.setFromUnitVectors(r.d0, _v.normalize()).multiply(r.q0); }
        _m.extractRotation(bone.parent.matrixWorld); const pq = _q.setFromRotationMatrix(_m).invert();
        bone.quaternion.copy(pq).multiply(qw);
      }
      refresh(bone);
    }
  }
}
