// Pooled weapon FX: muzzle flash, brass, tracers, impact particles, bullet-hole decals, explosions. Owned by: WEAPONS agent.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- textures
function canvas(size, draw) { const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); draw(g, size); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

function softDot(size = 64, inner = 0.0, pow = 1.6) {
  return canvas(size, (g, s) => { const img = g.createImageData(s, s); const d = img.data; for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const dx = (x + 0.5) / s - 0.5, dy = (y + 0.5) / s - 0.5; const r = Math.hypot(dx, dy) * 2; let a = Math.max(0, 1 - Math.max(0, r - inner) / (1 - inner)); a = Math.pow(a, pow); const i = (y * s + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = a * 255; } g.putImageData(img, 0, 0); });
}
/** 3 muzzle-flash frames in a 1x3 strip: hot core + randomized spikes, orange fringe. */
function flashAtlas(rng) {
  const F = 3, S = 160;
  const c = document.createElement('canvas'); c.width = S * F; c.height = S; const g = c.getContext('2d');
  for (let f = 0; f < F; f++) {
    const cx = f * S + S / 2, cy = S / 2;
    g.save(); g.translate(cx, cy);
    // fringe glow
    let grd = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.5); grd.addColorStop(0, 'rgba(255,200,120,0.9)'); grd.addColorStop(0.25, 'rgba(255,120,30,0.45)'); grd.addColorStop(0.6, 'rgba(200,60,10,0.12)'); grd.addColorStop(1, 'rgba(120,30,0,0)');
    g.fillStyle = grd; g.fillRect(-S / 2, -S / 2, S, S);
    // spikes
    const n = 7 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng() * 0.6, len = S * (0.22 + rng() * 0.26), w = 3 + rng() * 6;
      g.save(); g.rotate(a);
      const lg = g.createLinearGradient(0, 0, len, 0); lg.addColorStop(0, 'rgba(255,240,200,0.95)'); lg.addColorStop(0.5, 'rgba(255,160,60,0.6)'); lg.addColorStop(1, 'rgba(255,90,20,0)');
      g.fillStyle = lg; g.beginPath(); g.moveTo(0, -w); g.lineTo(len, 0); g.lineTo(0, w); g.closePath(); g.fill(); g.restore();
    }
    // core
    grd = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.16); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,235,180,0.95)'); grd.addColorStop(1, 'rgba(255,170,60,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(0, 0, S * 0.16, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.ClampToEdgeWrapping; return t;
}
/** 2x2 bullet-hole atlas */
function holeAtlas(rng) {
  return canvas(256, (g, s) => {
    g.clearRect(0, 0, s, s);
    for (let f = 0; f < 4; f++) {
      const cx = (f % 2) * 128 + 64, cy = Math.floor(f / 2) * 128 + 64;
      // scorched ring
      let grd = g.createRadialGradient(cx, cy, 8, cx, cy, 58); grd.addColorStop(0, 'rgba(0,0,0,0.95)'); grd.addColorStop(0.35, 'rgba(15,12,10,0.8)'); grd.addColorStop(0.7, 'rgba(30,26,22,0.35)'); grd.addColorStop(1, 'rgba(40,36,32,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, 58, 0, Math.PI * 2); g.fill();
      // ragged crater edge chips (light)
      for (let i = 0; i < 14; i++) { const a = rng() * Math.PI * 2, r = 16 + rng() * 14; g.fillStyle = `rgba(${150 + rng() * 60 | 0},${140 + rng() * 50 | 0},${120 + rng() * 40 | 0},${0.35 + rng() * 0.4})`; g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2 + rng() * 4, 0, Math.PI * 2); g.fill(); }
      // hole
      grd = g.createRadialGradient(cx, cy, 0, cx, cy, 14 + rng() * 4); grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.7, 'rgba(5,5,5,1)'); grd.addColorStop(1, 'rgba(10,10,10,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, 18, 0, Math.PI * 2); g.fill();
      // radial cracks
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1.5;
      for (let i = 0; i < 5; i++) { const a = rng() * Math.PI * 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (22 + rng() * 30), cy + Math.sin(a) * (22 + rng() * 30)); g.stroke(); }
    }
  });
}
function scorchTex(rng) {
  return canvas(256, (g, s) => {
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128); grd.addColorStop(0, 'rgba(0,0,0,0.95)'); grd.addColorStop(0.45, 'rgba(8,6,5,0.75)'); grd.addColorStop(0.8, 'rgba(20,16,14,0.25)'); grd.addColorStop(1, 'rgba(30,26,22,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) { const a = rng() * Math.PI * 2, r = 40 + rng() * 90; g.fillStyle = `rgba(0,0,0,${0.2 + rng() * 0.5})`; g.beginPath(); g.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 4 + rng() * 14, 0, Math.PI * 2); g.fill(); }
  });
}
function smokeTex(rng) {
  return canvas(128, (g, s) => {
    g.clearRect(0, 0, s, s);
    for (let i = 0; i < 26; i++) { const a = rng() * Math.PI * 2, r = rng() * 28, x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r, rad = 14 + rng() * 24; const grd = g.createRadialGradient(x, y, 0, x, y, rad); grd.addColorStop(0, 'rgba(255,255,255,0.28)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill(); }
  });
}
function ringTex() {
  return canvas(128, (g, s) => { const grd = g.createRadialGradient(64, 64, 40, 64, 64, 64); grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.8)'); grd.addColorStop(0.8, 'rgba(255,255,255,0.3)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, s, s); });
}

// ---------------------------------------------------------------- particle system (one Points per look)
const PARTICLE_VS = `
attribute float aSize; attribute vec4 aColor; varying vec4 vColor;
void main(){ vColor = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * (600.0 / -mv.z); gl_PointSize = min(gl_PointSize, 220.0); gl_Position = projectionMatrix * mv; }`;
const PARTICLE_FS = `
uniform sampler2D map; varying vec4 vColor;
void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vColor.rgb, vColor.a * t.a); if (gl_FragColor.a < 0.004) discard; }`;

class ParticleSystem {
  constructor(scene, max, { map, blending = THREE.NormalBlending, depthWrite = false, toneMapped = true, gravity = 9.8, drag = 0.5, grow = 0, bounce = false, renderOrder = 5 }) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max); this.size0 = new Float32Array(max); this.col = new Float32Array(max * 4); this.col0 = new Float32Array(max * 4); this.col1 = new Float32Array(max * 4);
    this.gravity = gravity; this.drag = drag; this.grow = grow; this.bounce = bounce;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: map } }, vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS, transparent: true, depthWrite, depthTest: true, blending, toneMapped });
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false; this.points.renderOrder = renderOrder; scene.add(this.points);
    this.groundY = 0;
  }
  /** emit one particle: p,v Vector3; life s; size (world-ish); c0/c1 [r,g,b,a] start/end colors */
  emit(p, v, life, size, c0, c1) {
    let i;
    if (this.n < this.max) i = this.n++; else { // replace the oldest
      i = 0; let best = -1; for (let k = 0; k < this.max; k++) { const r = this.life[k] / this.maxLife[k]; if (r > best) { best = r; i = k; } }
    }
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z; this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.life[i] = 0; this.maxLife[i] = life; this.size0[i] = size; this.size[i] = size;
    for (let k = 0; k < 4; k++) { this.col0[i * 4 + k] = c0[k]; this.col1[i * 4 + k] = c1[k]; this.col[i * 4 + k] = c0[k]; }
  }
  update(dt) {
    if (dt <= 0 || this.n === 0) return;
    const drag = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.n;) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) { this.n--; this.copy(this.n, i); continue; }
      const t = this.life[i] / this.maxLife[i];
      this.vel[i * 3 + 1] -= this.gravity * dt; this.vel[i * 3] *= drag; this.vel[i * 3 + 1] *= drag; this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.bounce && this.pos[i * 3 + 1] < this.groundY + 0.01) { this.pos[i * 3 + 1] = this.groundY + 0.01; this.vel[i * 3 + 1] = Math.abs(this.vel[i * 3 + 1]) * 0.3; this.vel[i * 3] *= 0.6; this.vel[i * 3 + 2] *= 0.6; }
      this.size[i] = this.size0[i] * (1 + this.grow * t);
      for (let k = 0; k < 4; k++) this.col[i * 4 + k] = this.col0[i * 4 + k] + (this.col1[i * 4 + k] - this.col0[i * 4 + k]) * t;
      i++;
    }
    const g = this.points.geometry; g.attributes.position.needsUpdate = true; g.attributes.aSize.needsUpdate = true; g.attributes.aColor.needsUpdate = true; g.setDrawRange(0, this.n);
  }
  copy(from, to) {
    if (from === to) return;
    for (let k = 0; k < 3; k++) { this.pos[to * 3 + k] = this.pos[from * 3 + k]; this.vel[to * 3 + k] = this.vel[from * 3 + k]; }
    this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from]; this.size0[to] = this.size0[from]; this.size[to] = this.size[from];
    for (let k = 0; k < 4; k++) { this.col[to * 4 + k] = this.col[from * 4 + k]; this.col0[to * 4 + k] = this.col0[from * 4 + k]; this.col1[to * 4 + k] = this.col1[from * 4 + k]; }
  }
  clear() { this.n = 0; this.points.geometry.setDrawRange(0, 0); }
}

// ---------------------------------------------------------------- billboard pool (fireballs, smoke, flashes in world space)
class BillboardPool {
  constructor(scene, max, map, { blending = THREE.NormalBlending, toneMapped = true, renderOrder = 6, depthWrite = false } = {}) {
    this.items = []; this.max = max;
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < max; i++) {
      const mat = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite, blending, toneMapped, opacity: 1 });
      const m = new THREE.Mesh(geo, mat); m.visible = false; m.frustumCulled = false; m.renderOrder = renderOrder; scene.add(m);
      this.items.push({ mesh: m, life: 0, max: 0, s0: 1, s1: 1, c0: new THREE.Color(), c1: new THREE.Color(), a0: 1, a1: 0, vel: new THREE.Vector3(), roll: 0, spin: 0, fadeIn: 0 });
    }
  }
  spawn(pos, { life = 1, s0 = 1, s1 = 2, c0 = 0xffffff, c1 = 0xffffff, a0 = 1, a1 = 0, vel = null, roll = 0, spin = 0, fadeIn = 0 } = {}) {
    let it = this.items.find(i => !i.mesh.visible); if (!it) { it = this.items[0]; for (const o of this.items) if (o.life / o.max > it.life / it.max) it = o; }
    it.mesh.visible = true; it.mesh.position.copy(pos); it.life = 0; it.max = life; it.s0 = s0; it.s1 = s1; it.c0.set(c0); it.c1.set(c1); it.a0 = a0; it.a1 = a1; it.vel.copy(vel || _v.set(0, 0, 0)); it.roll = roll; it.spin = spin; it.fadeIn = fadeIn;
    it.mesh.scale.setScalar(s0); it.mesh.material.color.copy(it.c0); it.mesh.material.opacity = fadeIn > 0 ? 0 : a0;
    return it;
  }
  update(dt, camera) {
    for (const it of this.items) {
      if (!it.mesh.visible) continue;
      it.life += dt; if (it.life >= it.max) { it.mesh.visible = false; continue; }
      const t = it.life / it.max; const e = 1 - (1 - t) * (1 - t);
      it.mesh.position.addScaledVector(it.vel, dt);
      it.mesh.scale.setScalar(it.s0 + (it.s1 - it.s0) * e);
      it.mesh.material.color.copy(it.c0).lerp(it.c1, t);
      let a = it.a0 + (it.a1 - it.a0) * t; if (it.fadeIn > 0 && it.life < it.fadeIn) a *= it.life / it.fadeIn;
      it.mesh.material.opacity = a;
      it.mesh.quaternion.copy(camera.quaternion); it.roll += it.spin * dt; it.mesh.rotateZ(it.roll);
    }
  }
  clear() { for (const it of this.items) it.mesh.visible = false; }
}

// ---------------------------------------------------------------- FX manager
export class FX {
  constructor(ctx) {
    this.ctx = ctx; const { scene, rng } = ctx; this.scene = scene; this.rng = rng;
    this.t = 0;
    const dot = softDot(64, 0, 1.4), hardDot = softDot(32, 0.55, 3), chip = softDot(16, 0.8, 8);
    this.tex = { dot, hardDot, chip, flash: flashAtlas(rng), hole: holeAtlas(rng), scorch: scorchTex(rng), smoke: smokeTex(rng), ring: ringTex() };

    // particles
    this.sparks = new ParticleSystem(scene, 600, { map: hardDot, blending: THREE.AdditiveBlending, toneMapped: false, gravity: 14, drag: 1.2, bounce: true, renderOrder: 7 });
    this.embers = new ParticleSystem(scene, 300, { map: dot, blending: THREE.AdditiveBlending, toneMapped: false, gravity: 3, drag: 1.5, renderOrder: 7 });
    this.dust = new ParticleSystem(scene, 500, { map: this.tex.smoke, gravity: 0.6, drag: 2.0, grow: 2.2, renderOrder: 5 });
    this.chips = new ParticleSystem(scene, 300, { map: chip, gravity: 16, drag: 0.4, bounce: true, renderOrder: 6 });
    this.blood = new ParticleSystem(scene, 300, { map: dot, gravity: 12, drag: 1.6, grow: 0.8, renderOrder: 6 });
    this.splash = new ParticleSystem(scene, 300, { map: dot, gravity: 14, drag: 0.8, renderOrder: 6 });

    // billboards
    this.puffs = new BillboardPool(scene, 40, this.tex.smoke, { renderOrder: 6 });
    this.fire = new BillboardPool(scene, 32, this.tex.smoke, { blending: THREE.AdditiveBlending, toneMapped: false, renderOrder: 8 });
    this.flashes = new BillboardPool(scene, 8, this.tex.flash, { blending: THREE.AdditiveBlending, toneMapped: false, renderOrder: 9 });
    for (const it of this.flashes.items) { it.mesh.material.map = this.tex.flash.clone(); it.mesh.material.map.repeat.set(1 / 3, 1); it.mesh.material.map.needsUpdate = true; }
    this.rings = new BillboardPool(scene, 4, this.tex.ring, { blending: THREE.AdditiveBlending, toneMapped: false, renderOrder: 8 });
    for (const it of this.rings.items) it.flat = true;

    // brass (instanced)
    {
      const g = new THREE.CylinderGeometry(0.0045, 0.0048, 0.045, 8); g.rotateX(Math.PI / 2);
      const m = new THREE.MeshPhysicalMaterial({ color: 0xd2a848, metalness: 1, roughness: 0.32, envMapIntensity: 1.3 });
      this.brassMax = 40; this.brassMesh = new THREE.InstancedMesh(g, m, this.brassMax); this.brassMesh.frustumCulled = false; this.brassMesh.castShadow = false; this.brassMesh.count = 0; scene.add(this.brassMesh);
      this.brass = []; for (let i = 0; i < this.brassMax; i++) this.brass.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), life: 0, on: false, scale: 1 });
      this.brassDummy = new THREE.Object3D();
    }
    // tracers
    {
      const g = new THREE.CylinderGeometry(0.012, 0.012, 1, 6, 1, true); g.translate(0, 0.5, 0);
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 1.9, 0.9), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      this.tracerMesh = new THREE.InstancedMesh(g, m, 24); this.tracerMesh.frustumCulled = false; this.tracerMesh.count = 0; scene.add(this.tracerMesh);
      this.tracers = []; for (let i = 0; i < 24; i++) this.tracers.push({ o: new THREE.Vector3(), d: new THREE.Vector3(), len: 0, s: 0, on: false, speed: 380 });
    }
    // bullet-hole decals
    {
      const g = new THREE.PlaneGeometry(1, 1); this.decalMax = 160;
      const aFrame = new THREE.InstancedBufferAttribute(new Float32Array(this.decalMax), 1); g.setAttribute('aFrame', aFrame); this.decalFrame = aFrame;
      const m = new THREE.MeshStandardMaterial({ map: this.tex.hole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, roughness: 0.95, metalness: 0.0, color: 0xffffff });
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aFrame; varying float vFrame;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvFrame = aFrame;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFrame;').replace('#include <map_fragment>', `
          vec2 fuv = vMapUv * 0.5 + vec2(mod(vFrame, 2.0), floor(vFrame / 2.0)) * 0.5;
          vec4 sampledDiffuseColor = texture2D( map, fuv ); diffuseColor *= sampledDiffuseColor;`);
      };
      this.decals = new THREE.InstancedMesh(g, m, this.decalMax); this.decals.frustumCulled = false; this.decals.renderOrder = 3; this.decals.count = 0; this.decalHead = 0; scene.add(this.decals);
      this.decalDummy = new THREE.Object3D();
      for (let i = 0; i < this.decalMax; i++) { this.decalDummy.scale.setScalar(0); this.decalDummy.updateMatrix(); this.decals.setMatrixAt(i, this.decalDummy.matrix); }
    }
    // scorch decals
    {
      const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
      this.scorches = []; for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: this.tex.scorch, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 1 })); m.visible = false; m.renderOrder = 2; scene.add(m); this.scorches.push(m); }
      this.scorchHead = 0;
    }
    // lights: muzzle (player), enemy flash, explosion
    this.muzzleLight = new THREE.PointLight(0xffa552, 0, 9, 1.6); scene.add(this.muzzleLight); this.muzzleLightT = 0; this.muzzleLightMax = 0.05;
    this.enemyLight = new THREE.PointLight(0xffa552, 0, 7, 1.6); scene.add(this.enemyLight); this.enemyLightT = 0;
    this.boomLight = new THREE.PointLight(0xffb070, 0, 30, 1.2); scene.add(this.boomLight); this.boomT = 0;
    this.enemyFlashT = 1; this.enemyTracerQuota = 0;
  }

  // ---- muzzle flash light at world position
  muzzleLightAt(p, strength = 1, hold = 0.045) { this.muzzleLight.position.copy(p); this.muzzleLight.intensity = 140 * strength; this.muzzleLightT = 0; this.muzzleLightMax = hold; }

  // ---- brass
  ejectBrass(p, v, scale = 1) {
    let b = this.brass.find(x => !x.on); if (!b) { b = this.brass[0]; for (const o of this.brass) if (o.life > b.life) b = o; }
    b.on = true; b.life = 0; b.p.copy(p); b.v.copy(v); b.scale = scale;
    b.q.setFromEuler(new THREE.Euler(this.rng() * 6, this.rng() * 6, this.rng() * 6)); b.w.set((this.rng() - 0.5) * 30, (this.rng() - 0.5) * 30, (this.rng() - 0.5) * 30);
  }
  // ---- tracer
  tracer(origin, dir, dist, speed = 380) {
    let t = this.tracers.find(x => !x.on); if (!t) return;
    t.on = true; t.o.copy(origin); t.d.copy(dir).normalize(); t.len = dist; t.s = 0; t.speed = speed;
  }
  // ---- decals
  bulletHole(point, normal, size = 0.06) {
    const i = this.decalHead; this.decalHead = (this.decalHead + 1) % this.decalMax; this.decals.count = Math.min(this.decalMax, this.decals.count + 1);
    const d = this.decalDummy; d.position.copy(point).addScaledVector(normal, 0.004);
    _v.copy(normal); d.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _v); d.rotateZ(this.rng() * Math.PI * 2);
    d.scale.setScalar(size * (0.8 + this.rng() * 0.5)); d.updateMatrix(); this.decals.setMatrixAt(i, d.matrix); this.decals.instanceMatrix.needsUpdate = true;
    this.decalFrame.setX(i, Math.floor(this.rng() * 4)); this.decalFrame.needsUpdate = true;
  }
  scorch(point, size = 3.2) {
    const m = this.scorches[this.scorchHead]; this.scorchHead = (this.scorchHead + 1) % this.scorches.length;
    m.visible = true; m.position.copy(point); m.position.y += 0.02; m.rotation.y = this.rng() * 6.28; m.scale.setScalar(size);
  }

  // ---- impacts by surface
  impact(point, normal, surface, dir) {
    const r = this.rng; const n = normal; const refl = _v2.copy(dir).reflect(n);
    const rnd = (k) => (r() - 0.5) * k;
    const jitter = (out, base, spreadV, speed) => out.copy(base).multiplyScalar(speed).add(_v3.set(rnd(spreadV), rnd(spreadV), rnd(spreadV)));
    const p = _v.copy(point).addScaledVector(n, 0.01);
    switch (surface) {
      case 'metal': {
        for (let i = 0; i < 26; i++) { const sp = 3 + r() * 9; jitter(_v3, refl, sp * 1.2, sp * 0.5).addScaledVector(n, sp * 0.4); this.sparks.emit(p, _v3, 0.15 + r() * 0.45, 0.012 + r() * 0.012, [3, 2.2, 1.2, 1], [2.0, 0.5, 0.05, 0]); }
        for (let i = 0; i < 6; i++) { jitter(_v3, n, 1.2, 0.8); this.dust.emit(p, _v3, 0.4 + r() * 0.3, 0.12, [0.5, 0.5, 0.5, 0.35], [0.4, 0.4, 0.4, 0]); }
        this.bulletHole(point, normal, 0.045); break;
      }
      case 'concrete': case 'ground': default: {
        for (let i = 0; i < 12; i++) { jitter(_v3, n, 2.0, 1.4); this.dust.emit(p, _v3, 0.6 + r() * 0.6, 0.16 + r() * 0.1, [0.62, 0.58, 0.52, 0.55], [0.5, 0.48, 0.45, 0]); }
        for (let i = 0; i < 14; i++) { const sp = 2 + r() * 5; jitter(_v3, n, sp * 1.1, sp); this.chips.emit(p, _v3, 0.5 + r() * 0.7, 0.02 + r() * 0.02, [0.55, 0.52, 0.47, 1], [0.45, 0.42, 0.38, 1]); }
        for (let i = 0; i < 5; i++) { const sp = 3 + r() * 6; jitter(_v3, refl, sp, sp * 0.4).addScaledVector(n, sp * 0.3); this.sparks.emit(p, _v3, 0.1 + r() * 0.25, 0.008, [2.5, 1.8, 1.0, 1], [1.5, 0.4, 0.05, 0]); }
        this.bulletHole(point, normal, 0.065); break;
      }
      case 'wood': {
        for (let i = 0; i < 16; i++) { const sp = 2 + r() * 5; jitter(_v3, n, sp, sp); this.chips.emit(p, _v3, 0.6 + r() * 0.8, 0.03 + r() * 0.03, [0.5, 0.36, 0.2, 1], [0.35, 0.25, 0.14, 1]); }
        for (let i = 0; i < 6; i++) { jitter(_v3, n, 1.5, 1.0); this.dust.emit(p, _v3, 0.5 + r() * 0.4, 0.12, [0.55, 0.42, 0.28, 0.4], [0.4, 0.3, 0.2, 0]); }
        this.bulletHole(point, normal, 0.06); break;
      }
      case 'water': {
        for (let i = 0; i < 30; i++) { const sp = 2 + r() * 5; _v3.set(rnd(2.5), sp, rnd(2.5)); this.splash.emit(p, _v3, 0.4 + r() * 0.5, 0.02 + r() * 0.03, [0.75, 0.82, 0.9, 0.9], [0.6, 0.7, 0.8, 0]); }
        for (let i = 0; i < 6; i++) { _v3.set(rnd(0.8), 0.6 + r() * 0.6, rnd(0.8)); this.dust.emit(p, _v3, 0.5 + r() * 0.4, 0.18, [0.7, 0.75, 0.8, 0.35], [0.7, 0.75, 0.8, 0]); }
        this.rings.spawn(_v3.copy(point).addScaledVector(normal, 0.02), { life: 0.5, s0: 0.1, s1: 0.9, c0: 0x9ab0c8, c1: 0x9ab0c8, a0: 0.6, a1: 0 });
        break;
      }
      case 'flesh': {
        for (let i = 0; i < 24; i++) { const sp = 1 + r() * 4; jitter(_v3, dir, sp * 1.4, sp * 0.6).addScaledVector(n, sp * 0.5); this.blood.emit(p, _v3, 0.3 + r() * 0.5, 0.02 + r() * 0.035, [0.45, 0.02, 0.02, 0.95], [0.25, 0.01, 0.01, 0]); }
        for (let i = 0; i < 5; i++) { jitter(_v3, dir, 1.0, 0.8); this.dust.emit(p, _v3, 0.35 + r() * 0.3, 0.14, [0.4, 0.05, 0.05, 0.5], [0.3, 0.05, 0.05, 0]); }
        break;
      }
    }
  }

  // ---- muzzle smoke wisp in world space (lingers after the shot)
  muzzleSmoke(p, dir) {
    const r = this.rng;
    for (let i = 0; i < 2; i++) { _v3.copy(dir).multiplyScalar(1.2 + r() * 1.5).add(_v2.set((r() - 0.5) * 0.4, 0.3 + r() * 0.4, (r() - 0.5) * 0.4)); this.dust.emit(p, _v3, 0.5 + r() * 0.5, 0.08 + r() * 0.06, [0.55, 0.55, 0.58, 0.28], [0.5, 0.5, 0.5, 0]); }
  }

  // ---- enemy shot FX (world space): billboard flash cross + light + tracer
  enemyShot(origin, dir) {
    const r = this.rng;
    const it = this.flashes.spawn(origin, { life: 0.05, s0: 0.5 + r() * 0.25, s1: 0.35, c0: 0xffd0a0, c1: 0xff8040, a0: 1, a1: 0, roll: r() * 6.28 });
    it.mesh.material.map.offset.x = Math.floor(r() * 3) / 3;
    this.enemyLight.position.copy(origin); this.enemyLight.intensity = 90; this.enemyLightT = 0;
    // tracer to first hit (capped raycast)
    let dist = 60;
    if (this.ctx.raycastTargets?.length) { this._ray = this._ray || new THREE.Raycaster(); this._ray.set(origin, _v.copy(dir).normalize()); this._ray.far = 80; const h = this._ray.intersectObjects(this.ctx.raycastTargets, true)[0]; if (h) { dist = h.distance; if (h.object.userData.surface) this.impact(h.point, h.face?.normal ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : _v2.copy(dir).negate(), h.object.userData.surface, dir); } }
    this.tracer(origin, dir, dist, 300);
  }

  // ---- explosion
  explosion(pos) {
    const r = this.rng; const p = _v.copy(pos);
    // flash
    const fl = this.flashes.spawn(p, { life: 0.16, s0: 8, s1: 13, c0: new THREE.Color(0xffffff).multiplyScalar(3), c1: new THREE.Color(0xffa040).multiplyScalar(2), a0: 1, a1: 0 }); fl.mesh.material.map.offset.x = 0;
    // HDR fireball core (bloom catches it) — the frag must read as a real detonation, not a puff
    const HOT = new THREE.Color(0xfff0c0).multiplyScalar(7), HOT2 = new THREE.Color(0xff7a20).multiplyScalar(3);
    for (let i = 0; i < 4; i++) { _v2.set((r() - 0.5) * 0.8, 0.6 + r() * 0.8, (r() - 0.5) * 0.8).add(p); this.fire.spawn(_v2, { life: 0.28 + r() * 0.2, s0: 2.5 + r(), s1: 6 + r() * 3, c0: HOT, c1: HOT2, a0: 1, a1: 0, spin: (r() - 0.5) * 3 }); }
    // fireballs (additive) + smoke (normal)
    for (let i = 0; i < 10; i++) { _v2.set((r() - 0.5) * 2.2, r() * 1.8 + 0.4, (r() - 0.5) * 2.2).add(p); this.fire.spawn(_v2, { life: 0.5 + r() * 0.45, s0: 1.8 + r() * 1.2, s1: 6 + r() * 3.5, c0: new THREE.Color(0xffd090).multiplyScalar(3.5), c1: new THREE.Color(0xb02a08).multiplyScalar(1.5), a0: 1, a1: 0, vel: _v3.set((r() - 0.5) * 2, 3 + r() * 3, (r() - 0.5) * 2), roll: r() * 6.28, spin: (r() - 0.5) * 3 }); }
    for (let i = 0; i < 16; i++) { _v2.set((r() - 0.5) * 3.0, r() * 2.6 + 0.3, (r() - 0.5) * 3.0).add(p); this.puffs.spawn(_v2, { life: 3.5 + r() * 2.5, s0: 2 + r() * 2, s1: 9 + r() * 6, c0: 0x2a2622, c1: 0x4a4644, a0: 0.9, a1: 0, vel: _v3.set((r() - 0.5) * 1.5, 1.2 + r() * 1.5, (r() - 0.5) * 1.5), roll: r() * 6.28, spin: (r() - 0.5) * 1.2, fadeIn: 0.15 }); }
    // ring shockwave (flat on ground)
    const ring = this.rings.spawn(_v2.copy(p).setY(p.y + 0.15), { life: 0.45, s0: 1, s1: 18, c0: 0xffd0a0, c1: 0xff9040, a0: 0.9, a1: 0 });
    ring.flat = true;
    // sparks + embers + debris + dust
    for (let i = 0; i < 160; i++) { const sp = 6 + r() * 18; _v3.set((r() - 0.5), r() * 0.9 + 0.1, (r() - 0.5)).normalize().multiplyScalar(sp); this.sparks.emit(p, _v3, 0.4 + r() * 1.0, 0.014 + r() * 0.02, [3, 2.2, 1.2, 1], [1.5, 0.3, 0.02, 0]); }
    for (let i = 0; i < 80; i++) { const sp = 2 + r() * 8; _v3.set((r() - 0.5), r() * 1.2 + 0.2, (r() - 0.5)).normalize().multiplyScalar(sp); this.embers.emit(p, _v3, 1.0 + r() * 1.5, 0.02 + r() * 0.025, [2.5, 1.0, 0.2, 1], [0.8, 0.15, 0.02, 0]); }
    for (let i = 0; i < 60; i++) { const sp = 5 + r() * 12; _v3.set((r() - 0.5), r() * 1.0 + 0.2, (r() - 0.5)).normalize().multiplyScalar(sp); this.chips.emit(p, _v3, 1.0 + r() * 1.2, 0.03 + r() * 0.05, [0.35, 0.33, 0.3, 1], [0.25, 0.23, 0.2, 1]); }
    for (let i = 0; i < 70; i++) { const sp = 3 + r() * 6; _v3.set((r() - 0.5), r() * 0.5, (r() - 0.5)).normalize().multiplyScalar(sp); this.dust.emit(p, _v3, 1.2 + r() * 1.2, 0.5 + r() * 0.4, [0.45, 0.42, 0.38, 0.6], [0.4, 0.38, 0.35, 0]); }
    this.scorch(_v2.copy(p).setY(this.ctx.world?.groundHeight?.(p.x, p.z) ?? 0));
    this.boomLight.position.copy(p).y += 1.2; this.boomLight.intensity = 9000; this.boomT = 0;
  }

  update(dt, camera) {
    if (dt <= 0) return;
    this.t += dt;
    // lights decay
    this.muzzleLightT += dt; if (this.muzzleLight.intensity > 0) { const k = 1 - this.muzzleLightT / this.muzzleLightMax; this.muzzleLight.intensity = k > 0 ? this.muzzleLight.intensity * (k > 0.6 ? 1 : 0.6) : 0; if (k <= 0) this.muzzleLight.intensity = 0; }
    this.enemyLightT += dt; if (this.enemyLight.intensity > 0 && this.enemyLightT > 0.045) this.enemyLight.intensity = 0;
    this.boomT += dt; if (this.boomLight.intensity > 0) this.boomLight.intensity = Math.max(0, 9000 * Math.pow(1 - Math.min(1, this.boomT / 0.7), 2));
    // particles
    this.sparks.update(dt); this.embers.update(dt); this.dust.update(dt); this.chips.update(dt); this.blood.update(dt); this.splash.update(dt);
    this.puffs.update(dt, camera); this.fire.update(dt, camera); this.flashes.update(dt, camera);
    this.rings.update(dt, camera); for (const it of this.rings.items) if (it.mesh.visible && it.flat) { it.mesh.rotation.set(-Math.PI / 2, 0, 0); }
    // brass
    let n = 0; const d = this.brassDummy;
    for (const b of this.brass) {
      if (!b.on) continue;
      b.life += dt; if (b.life > 6) { b.on = false; continue; }
      b.v.y -= 20 * dt; b.p.addScaledVector(b.v, dt);
      const gy = (this.ctx.world?.groundHeight?.(b.p.x, b.p.z) ?? 0) + 0.006;
      if (b.p.y < gy) { b.p.y = gy; if (Math.abs(b.v.y) > 0.6) { b.v.y = -b.v.y * 0.35; b.v.x *= 0.7; b.v.z *= 0.7; b.w.multiplyScalar(0.5); } else { b.v.set(0, 0, 0); b.w.set(0, 0, 0); b.q.setFromEuler(new THREE.Euler(0, Math.atan2(b.q.x, b.q.w) * 2, Math.PI / 2)); } }
      if (b.w.lengthSq() > 0) { _q.setFromEuler(new THREE.Euler(b.w.x * dt, b.w.y * dt, b.w.z * dt)); b.q.multiply(_q); }
      d.position.copy(b.p); d.quaternion.copy(b.q); d.scale.setScalar(b.scale); d.updateMatrix(); this.brassMesh.setMatrixAt(n++, d.matrix);
    }
    this.brassMesh.count = n; if (n) this.brassMesh.instanceMatrix.needsUpdate = true;
    // tracers
    n = 0;
    for (const t of this.tracers) {
      if (!t.on) continue;
      t.s += t.speed * dt; if (t.s > t.len + 3) { t.on = false; continue; }
      const head = Math.min(t.s, t.len), tail = Math.max(0, t.s - 2.6); const L = head - tail; if (L <= 0.01) { continue; }
      _v.copy(t.o).addScaledVector(t.d, tail); _q.setFromUnitVectors(UP, t.d); d.position.copy(_v); d.quaternion.copy(_q); d.scale.set(1, L, 1); d.updateMatrix(); this.tracerMesh.setMatrixAt(n++, d.matrix);
    }
    this.tracerMesh.count = n; if (n) this.tracerMesh.instanceMatrix.needsUpdate = true;
  }

  reset() {
    for (const s of [this.sparks, this.embers, this.dust, this.chips, this.blood, this.splash]) s.clear();
    for (const b of [this.puffs, this.fire, this.flashes, this.rings]) b.clear();
    for (const b of this.brass) b.on = false; this.brassMesh.count = 0;
    for (const t of this.tracers) t.on = false; this.tracerMesh.count = 0;
    this.decals.count = 0; this.decalHead = 0; for (const m of this.scorches) m.visible = false;
    this.muzzleLight.intensity = 0; this.enemyLight.intensity = 0; this.boomLight.intensity = 0;
  }
}
