// Frag grenade: mesh, arc + bounce vs colliders/ground, fuse, explosion damage. Owned by: WEAPONS agent.
import * as THREE from 'three';
import { Builder, rbox, cylY, sphere, torus, lathe } from './geo.js';

const _v = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3();
const GRAVITY = 20, RADIUS = 0.035, FUSE = 3.5, EXPLODE_R = 6, EXPLODE_DMG = 120;

export function buildGrenadeMesh(mats) {
  const b = new Builder();
  // M67-style body: lathe (sphere slightly ovoid) + fuze well + spoon
  b.add(lathe([[0, -0.034], [0.018, -0.03], [0.03, -0.015], [0.032, 0.0], [0.03, 0.015], [0.02, 0.028], [0.012, 0.031], [0, 0.031]], 18), 'olive', { wear: 'rim', wearAmt: 0.6 });
  b.add(cylY(0.011, 0.012, 0.014, 12), 'steel', { pos: [0, 0.036, 0], wear: 'rim' }); // fuze
  b.add(cylY(0.006, 0.006, 0.012, 8), 'steel', { pos: [0, 0.048, 0], wear: 'rim' }); // striker
  b.add(rbox(0.012, 0.004, 0.05, 0.001, 1), 'steel', { pos: [0, 0.046, 0.02], rot: [0.5, 0, 0], wearAmt: 1.2 }); // spoon
  b.add(torus(0.009, 0.0012, 5, 14), 'steel', { pos: [0.012, 0.045, 0], rot: [0, 0, 0], wear: 'all', wearAmt: 0.5 }); // pull ring
  const g = b.build(mats, 'grenade'); g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export class Grenades {
  constructor(ctx, mats, fx) {
    this.ctx = ctx; this.fx = fx; this.list = []; this.template = buildGrenadeMesh(mats); this.pool = [];
  }
  spawn(pos, vel) {
    let mesh = this.pool.pop(); if (!mesh) { mesh = this.template.clone(); }
    mesh.visible = true; this.ctx.scene.add(mesh); mesh.position.copy(pos);
    const g = { mesh, p: pos.clone(), v: vel.clone(), w: new THREE.Vector3((this.ctx.rng() - 0.5) * 20, (this.ctx.rng() - 0.5) * 10, (this.ctx.rng() - 0.5) * 20), t: 0, rest: false, bounceCd: 0 };
    this.list.push(g); return g;
  }
  update(dt) {
    if (dt <= 0) return;
    const ctx = this.ctx;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i]; g.t += dt; g.bounceCd -= dt;
      if (g.t >= FUSE) { this.explode(g.p); this.recycle(g); this.list.splice(i, 1); continue; }
      if (!g.rest) {
        g.v.y -= GRAVITY * dt; g.p.addScaledVector(g.v, dt);
        // ground
        const gy = (ctx.world?.groundHeight?.(g.p.x, g.p.z) ?? 0) + RADIUS;
        if (g.p.y < gy) { g.p.y = gy; this.bounce(g, _n.set(0, 1, 0)); }
        // AABB colliders (sphere vs box)
        const cols = ctx.colliders || [];
        for (let k = 0; k < cols.length; k++) {
          const b = cols[k]; if (!b || !b.min) continue;
          if (g.p.x < b.min.x - RADIUS || g.p.x > b.max.x + RADIUS || g.p.y < b.min.y - RADIUS || g.p.y > b.max.y + RADIUS || g.p.z < b.min.z - RADIUS || g.p.z > b.max.z + RADIUS) continue;
          b.clampPoint(g.p, _c); _n.subVectors(g.p, _c); const d = _n.length();
          if (d < RADIUS) {
            if (d < 1e-5) { // center inside the box: push out along the smallest penetration axis
              const dx = Math.min(g.p.x - b.min.x, b.max.x - g.p.x), dy = Math.min(g.p.y - b.min.y, b.max.y - g.p.y), dz = Math.min(g.p.z - b.min.z, b.max.z - g.p.z);
              if (dx <= dy && dx <= dz) _n.set(g.p.x - b.min.x < b.max.x - g.p.x ? -1 : 1, 0, 0); else if (dy <= dz) _n.set(0, g.p.y - b.min.y < b.max.y - g.p.y ? -1 : 1, 0); else _n.set(0, 0, g.p.z - b.min.z < b.max.z - g.p.z ? -1 : 1);
              g.p.addScaledVector(_n, RADIUS);
            } else { _n.divideScalar(d); g.p.copy(_c).addScaledVector(_n, RADIUS + 0.001); }
            this.bounce(g, _n);
          }
        }
        // spin
        g.mesh.rotation.x += g.w.x * dt; g.mesh.rotation.y += g.w.y * dt; g.mesh.rotation.z += g.w.z * dt;
        if (g.v.lengthSq() < 0.05 && g.p.y <= gy + 0.002) { g.rest = true; g.v.set(0, 0, 0); }
      }
      g.mesh.position.copy(g.p);
    }
  }
  bounce(g, n) {
    const vn = g.v.dot(n);
    if (vn < 0) {
      g.v.addScaledVector(n, -vn * (1 + 0.38)); // reflect with restitution
      // tangential friction
      _v.copy(n).multiplyScalar(g.v.dot(n)); const tang = g.v.clone().sub(_v); tang.multiplyScalar(0.72); g.v.copy(_v).add(tang);
      g.w.multiplyScalar(0.6);
      if (Math.abs(vn) > 1.2 && g.bounceCd <= 0) { g.bounceCd = 0.08; this.ctx.bus.emit('grenade', { stage: 'bounce', position: g.p.clone(), speed: Math.abs(vn) }); }
      if (Math.abs(vn) < 0.9 && n.y > 0.7) { g.v.y = 0; }
    }
  }
  explode(pos) {
    const ctx = this.ctx;
    this.fx.explosion(pos);
    ctx.ai?.damageRadius?.(pos.clone(), EXPLODE_R, EXPLODE_DMG);
    const pp = ctx.player?.position; if (pp) { const d = Math.hypot(pp.x - pos.x, (pp.y + 0.9) - pos.y, pp.z - pos.z); if (d < EXPLODE_R) { const dmg = Math.round(100 * (1 - d / EXPLODE_R) ** 1.3); if (dmg > 0) ctx.player.damage?.(dmg, pos.clone()); } }
    ctx.bus.emit('explosion', { position: pos.clone(), radius: EXPLODE_R });
  }
  recycle(g) { g.mesh.visible = false; this.ctx.scene.remove(g.mesh); this.pool.push(g.mesh); }
  reset() { for (const g of this.list) this.recycle(g); this.list.length = 0; }
}
