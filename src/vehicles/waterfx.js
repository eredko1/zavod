// Jet-ski water FX + engine voice. Owned by: VEHICLES agent.
//  · spray: one Points draw (pooled 320 particles, per-particle alpha + size): rooster tail off the jet nozzle, bow sheets at
//    speed, a ring burst on every landing; lit by the ocean's live ambient + sun so it greys out at night.
//  · wake: one ribbon mesh (≤ 56 samples dropped behind the stern), widening + fading over ~5 s, riding the swell
//    (y = ocean.waveHeight), textured with the ocean's foam lace.
//  · engine: a small Web Audio voice (two detuned oscillators through a low-pass + band-passed hull/water noise) on the foley
//    bus; pitch from throttle + speed, over-revs when the pump is out of the water (airborne / beached). Silent in qa mode.
import * as THREE from 'three';

const N = 320, TRAIL = 56;
export function createWaterFX(ctx) {
  const O = () => ctx.world?.ocean;
  // ---- spray ----
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N), max = new Float32Array(N), aA = new Float32Array(N), aS = new Float32Array(N);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aA', new THREE.BufferAttribute(aA, 1)); g.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
  const uCol = { value: new THREE.Color(1, 1, 1) };
  const sm = new THREE.ShaderMaterial({ name: 'spray', transparent: true, depthWrite: false, fog: false, uniforms: { uCol, uPx: { value: 600 } },
    vertexShader: 'attribute float aA, aS; varying float vA; uniform float uPx; void main() { vA = aA; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aS * uPx / max(0.5, -mv.z), 1.0, 160.0); }',
    fragmentShader: 'uniform vec3 uCol; varying float vA; void main() { vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q); if (r > 1.0) discard; float a = vA * (1.0 - r) * (0.55 + 0.45 * fract(sin(dot(floor(gl_PointCoord * 5.0), vec2(12.9, 78.2))) * 437.5)); gl_FragColor = vec4(uCol, a); }' });
  const pts = new THREE.Points(g, sm); pts.frustumCulled = false; pts.name = 'jetskiSpray'; pts.renderOrder = 3; ctx.scene.add(pts);
  let head = 0;
  const emit = (x, y, z, vx, vy, vz, t, s) => { const i = head; head = (head + 1) % N; pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz; life[i] = max[i] = t; aS[i] = s; };
  // ---- wake ribbon ----
  const trail = [];
  const wp = new Float32Array(TRAIL * 2 * 3), wa = new Float32Array(TRAIL * 2), wuv = new Float32Array(TRAIL * 2 * 2), widx = [];
  for (let i = 0; i + 1 < TRAIL; i++) { const a = i * 2; widx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(wp, 3)); wg.setAttribute('aA', new THREE.BufferAttribute(wa, 1)); wg.setAttribute('uv', new THREE.BufferAttribute(wuv, 2)); wg.setIndex(widx);
  const tFoam = { value: null };
  const wm = new THREE.ShaderMaterial({ name: 'wake', transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, uniforms: { uCol, tFoam },
    vertexShader: 'attribute float aA; varying float vA; varying vec2 vUv; varying vec2 vW; void main() { vA = aA; vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform vec3 uCol; uniform sampler2D tFoam; varying float vA; varying vec2 vUv; varying vec2 vW; void main() { float e = 1.0 - abs(vUv.x * 2.0 - 1.0); float lace = texture2D(tFoam, vW * 0.21).b; float edge = smoothstep(0.0, 0.35, e) * (0.35 + 0.65 * smoothstep(0.55, 0.15, e)); float a = vA * edge * smoothstep(0.1, 0.6, lace + vA * 0.4); gl_FragColor = vec4(uCol * 1.1, min(1.0, a * 1.1)); }' });
  const wake = new THREE.Mesh(wg, wm); wake.frustumCulled = false; wake.name = 'jetskiWake'; wake.renderOrder = 2; wake.visible = false; ctx.scene.add(wake);
  let dropT = 0;

  // ---- engine voice ----
  let eng = null;
  const engine = (on) => {
    const E = ctx.audio?.engine, ac = E?.ac; if (!ac) return;
    if (on && !eng) {
      const dest = E.bus?.foley || E.master, t = ac.currentTime;
      const o1 = ac.createOscillator(); o1.type = 'sawtooth'; const o2 = ac.createOscillator(); o2.type = 'square';
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 2.5;
      const g1 = ac.createGain(); g1.gain.value = 0;
      const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const nz = ac.createBufferSource(); nz.buffer = buf; nz.loop = true; const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.7; const g2 = ac.createGain(); g2.gain.value = 0;
      o1.connect(lp); o2.connect(lp); lp.connect(g1); g1.connect(dest); nz.connect(bp); bp.connect(g2); g2.connect(dest);
      o1.start(t); o2.start(t); nz.start(t); g1.gain.setTargetAtTime(0.06, t, 0.2);
      eng = { o1, o2, lp, g1, nz, bp, g2 };
    } else if (!on && eng) {
      const t = ac.currentTime, e = eng; eng = null; e.g1.gain.setTargetAtTime(0, t, 0.12); e.g2.gain.setTargetAtTime(0, t, 0.12);
      setTimeout(() => { try { e.o1.stop(); e.o2.stop(); e.nz.stop(); e.g1.disconnect(); e.g2.disconnect(); } catch {} }, 700);
    }
  };
  const engineFrame = (v) => {
    const ac = ctx.audio?.engine?.ac; if (!eng || !ac) return; const t = ac.currentTime;
    const out = v.air || v.beached, rpm = Math.min(1.25, 0.18 + 0.82 * Math.max(v.throttle, Math.abs(v.fwdSpeed) / v.spec.max) + (out && v.throttle > 0.2 ? 0.35 : 0));
    const f = 34 + 88 * rpm;
    eng.o1.frequency.setTargetAtTime(f, t, 0.08); eng.o2.frequency.setTargetAtTime(f * 1.51 + 2, t, 0.08); eng.lp.frequency.setTargetAtTime(300 + 1700 * rpm, t, 0.08);
    const vol = (ctx.settings?.masterVolume ?? 1);
    eng.g1.gain.setTargetAtTime((0.035 + 0.075 * v.throttle) * vol, t, 0.06);
    eng.g2.gain.setTargetAtTime((v.air ? 0.004 : 0.012 + 0.07 * Math.min(1, Math.abs(v.fwdSpeed) / 16)) * vol, t, 0.06); eng.bp.frequency.setTargetAtTime(500 + 60 * Math.abs(v.fwdSpeed), t, 0.1);
  };

  const _f = new THREE.Vector3(), _r = new THREE.Vector3();
  return {
    engine, pts, wake,
    /** landing splash: k 0..1.5 */
    burst(v, k) { const n = Math.round(40 + 90 * Math.min(1.5, k)); for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = 1.5 + Math.random() * 4 * k; emit(v.pos.x + Math.cos(a) * 0.8, v.pos.y + 0.1, v.pos.z + Math.sin(a) * 1.3, Math.cos(a) * s + v.vel.x * 0.3, 1.5 + Math.random() * 4.5 * k, Math.sin(a) * s + v.vel.z * 0.3, 0.6 + Math.random() * 0.7, 0.06 + Math.random() * 0.12); } },
    /** per frame while riding */
    ride(v, dt) {
      const sp = Math.abs(v.fwdSpeed); _f.set(-Math.sin(v.heading), 0, -Math.cos(v.heading)); _r.set(-_f.z, 0, _f.x);
      if (!v.air && !v.beached && v.wet) {
        // rooster tail off the nozzle
        const nT = Math.min(12, dt * (110 * v.throttle + 50 * Math.min(1, sp / 12)));
        for (let k = 0; k < nT; k++) { if (Math.random() > nT - k) break; const sx = v.pos.x - _f.x * 1.6 + (Math.random() - 0.5) * 0.3, sz = v.pos.z - _f.z * 1.6 + (Math.random() - 0.5) * 0.3; const b = -2 - sp * 0.35 * Math.random(); emit(sx, v.pos.y + 0.2, sz, _f.x * b + (Math.random() - 0.5) * 1.2, 1.2 + Math.random() * (1.5 + 3.5 * v.throttle), _f.z * b + (Math.random() - 0.5) * 1.2, 0.5 + Math.random() * 0.6, 0.05 + Math.random() * 0.08); }
        // bow sheets at speed
        if (sp > 5) { const nB = dt * sp * 5; for (let k = 0; k < nB; k++) { if (Math.random() > nB - k) break; const s = Math.random() < 0.5 ? -1 : 1, bx = v.pos.x + _f.x * 0.7 + _r.x * s * 0.6, bz = v.pos.z + _f.z * 0.7 + _r.z * s * 0.6, o = 1 + Math.random() * 2; emit(bx, v.pos.y + 0.12, bz, _r.x * s * o + _f.x * sp * 0.2, 0.8 + Math.random() * 1.6, _r.z * s * o + _f.z * sp * 0.2, 0.35 + Math.random() * 0.4, 0.04 + Math.random() * 0.07); } }
      }
      // wake samples behind the stern
      dropT -= dt; if (dropT <= 0) { dropT = 0.1; if (!v.air && v.wet && sp > 1.2) trail.unshift({ x: v.pos.x - _f.x * 1.5, z: v.pos.z - _f.z * 1.5, rx: _r.x, rz: _r.z, age: 0, k: Math.min(1, sp / 9) }); else trail.unshift(null); if (trail.length > TRAIL) trail.length = TRAIL; }
      engineFrame(v);
    },
    stop() { engine(false); },
    update(dt) {
      const oc = O(); const ou = oc?.material?.uniforms;
      if (ou) { const k = Math.max(0, ou.uSunDir.value.y) * 0.3, su = ou.uSunCol.value; uCol.value.copy(ou.uAmb.value).multiplyScalar(0.95); uCol.value.r += su.r * k; uCol.value.g += su.g * k; uCol.value.b += su.b * k; tFoam.value = ou.tDet.value; }
      sm.uniforms.uPx.value = (ctx.renderer?.domElement?.height || 720) / (2 * Math.tan((ctx.camera?.fov || 70) * Math.PI / 360));
      let live = 0;
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) { aA[i] = 0; continue; }
        live++; life[i] -= dt; vel[i * 3 + 1] -= 9.81 * dt; const dr = Math.exp(-1.2 * dt); vel[i * 3] *= dr; vel[i * 3 + 2] *= dr;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const t = life[i] / max[i]; aA[i] = Math.max(0, Math.min(1, t * 1.6)) * 0.8; aS[i] *= 1 + dt * 0.6;
        if (oc && vel[i * 3 + 1] < 0 && pos[i * 3 + 1] < oc.level - 0.6) life[i] = 0;
      }
      g.attributes.position.needsUpdate = true; g.attributes.aA.needsUpdate = true; g.attributes.aS.needsUpdate = true; pts.visible = live > 0;
      // wake
      let any = false;
      for (let i = 0; i < TRAIL; i++) {
        const s = trail[i]; const j = i * 2;
        if (!s || !oc) { wa[j] = wa[j + 1] = 0; if (i > 0) { wp.copyWithin(j * 3, (j - 2) * 3, j * 3); } continue; }
        s.age += dt; const w = 0.45 + s.age * 1.1, y = oc.waveHeight(s.x, s.z) + 0.1, a = Math.max(0, 1 - s.age / 5) * s.k;
        wp[j * 3] = s.x - s.rx * w; wp[j * 3 + 1] = y; wp[j * 3 + 2] = s.z - s.rz * w; wp[j * 3 + 3] = s.x + s.rx * w; wp[j * 3 + 4] = y; wp[j * 3 + 5] = s.z + s.rz * w;
        wa[j] = wa[j + 1] = a; wuv[j * 2] = 0; wuv[j * 2 + 2] = 1; wuv[j * 2 + 1] = wuv[j * 2 + 3] = i * 0.1; if (a > 0) any = true;
      }
      wg.attributes.position.needsUpdate = true; wg.attributes.aA.needsUpdate = true; wg.attributes.uv.needsUpdate = true; wake.visible = any;
      if (!any && trail.length && trail.every((s) => !s)) trail.length = 0;
      return live;
    },
  };
}
