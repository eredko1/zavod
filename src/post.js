// Post-processing pipeline. Owned by: POST agent.
//
//   ScenePass (scene → sceneRT: HalfFloat colour + 32F depth)
//   → GTAO (half-res, depth-only normals, poisson denoise; 'ultra'/'high')
//   → SSR trace (half-res, 24 steps + 4 refine, up-facing pixels only) → SSR blur H/V ('ultra'/'high')
//   → Composite (scene × AO, Fresnel-weighted SSR; always runs — it is the copy into the composer chain)
//   → UnrealBloom (threshold 0.9 post-exposure, radius 0.6, strength 0.5)
//   → Motion blur (reprojection, 8 taps, 1/120 s shutter, off during ADS; 'ultra')
//   → DOF (near-field bokeh on the viewmodel while ADS; 'ultra')
//   → OutputPass (renderer.toneMapping + sRGB, applied exactly once)
//   → SMAA
//   → Grade (LDR: shake, lens rain, CA, sharpen, LGG/contrast/sat, teal/sodium split tone, health FX, vignette, grain)
//
// Public API: render(dt, ctx), shake(amount), setQuality(q), profile(frames) → per-pass ms, passes()
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FSQ_VERT, SSR_TRACE_FRAG, SSR_BLUR_FRAG, COMPOSITE_FRAG, MOTION_BLUR_FRAG, DOF_FRAG, GRADE_FRAG_FULL } from './post/shaders.js';
import { makeDropletTexture } from './post/lensdrops.js';

const TIERS = ['ultra', 'high', 'medium', 'low'];
const _v = new THREE.Vector3(), _fwd = new THREE.Vector3();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------- small pass helpers ----------
class ScenePass extends Pass {
  constructor(scene, camera, rt) { super(); this.scene = scene; this.camera = camera; this.rt = rt; this.needsSwap = false; }
  render(renderer) {
    const ac = renderer.autoClear; renderer.autoClear = true;
    renderer.setRenderTarget(this.rt);
    renderer.render(this.scene, this.camera);
    renderer.autoClear = ac;
  }
  setSize() {}
}
// Fullscreen shader that writes into its own render target (no composer swap).
class RTPass extends Pass {
  constructor(material, rt) { super(); this.material = material; this.rt = rt; this.fsq = new FullScreenQuad(material); this.needsSwap = false; }
  render(renderer) { renderer.setRenderTarget(this.rt); this.fsq.render(renderer); }
  setSize() {}
  dispose() { this.fsq.dispose(); this.material.dispose(); this.rt.dispose(); }
}

function depthUniforms(depthTex) {
  return {
    tDepth: { value: depthTex }, uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() },
    uNear: { value: 0.03 }, uFar: { value: 600 }, uTexel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
  };
}
const mat = (uniforms, fragmentShader) => new THREE.ShaderMaterial({ uniforms, vertexShader: FSQ_VERT, fragmentShader, depthTest: false, depthWrite: false });

export async function init(ctx) {
  const { renderer, scene, camera } = ctx;
  renderer.setPixelRatio(Math.min(devicePixelRatio, ctx.settings.renderScale ?? 2));
  const pr = renderer.getPixelRatio();
  const W = Math.floor(innerWidth * pr), H = Math.floor(innerHeight * pr);

  // ---- private test scene ----
  if (ctx.qs.get('posttest') === '1') {
    const { buildPostTestScene } = await import('./post/testscene.js');
    buildPostTestScene(ctx);
    ctx.bus.on('boot', () => { if (!ctx.qs.get('pose')) ctx.player?.teleport?.(0, 0, 18, 0.12, -0.16); });
  }

  // ---- render targets ----
  const depthTex = new THREE.DepthTexture(W, H, THREE.FloatType);
  const sceneRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthTexture: depthTex, depthBuffer: true, stencilBuffer: false });
  sceneRT.texture.name = 'post.scene';
  const half = (w, h) => new THREE.WebGLRenderTarget(Math.max(1, w >> 1), Math.max(1, h >> 1), { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const ssrRT = half(W, H), ssrRT2 = half(W, H);

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false }));
  composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight);

  // 1. scene
  const scenePass = new ScenePass(scene, camera, sceneRT);

  // 2. GTAO (half res). Constructed without a gbuffer (r186 throws otherwise), then pointed at our depth.
  const gtao = new GTAOPass(scene, camera, W >> 1, H >> 1);
  gtao.setGBuffer(depthTex, undefined);              // depth-only → normals reconstructed in-shader, no extra scene draw
  gtao.output = GTAOPass.OUTPUT.Off;                 // compute only; composite reads gtao.pdRenderTarget
  gtao.needsSwap = false;
  gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.0, thickness: 0.6, distanceFallOff: 1.0, scale: 1.0, samples: 16, screenSpaceRadius: false });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 8 });
  const gtaoSetSize = gtao.setSize.bind(gtao);
  gtao.setSize = (w, h) => gtaoSetSize(Math.max(1, w >> 1), Math.max(1, h >> 1));

  // 3. SSR: trace → blur H → blur V (all half res)
  const ssrU = { ...depthUniforms(depthTex), tColor: { value: sceneRT.texture }, uUpView: { value: new THREE.Vector3(0, 1, 0) }, uTime: { value: 0 }, uMaxDist: { value: 40 }, uThickness: { value: 0.35 }, uMinUp: { value: 0.75 } };
  const ssrTrace = new RTPass(mat(ssrU, SSR_TRACE_FRAG), ssrRT);
  const blurHU = { tDiffuse: { value: ssrRT.texture }, uDir: { value: new THREE.Vector2(1 / ssrRT.width, 0) } };
  const blurVU = { tDiffuse: { value: ssrRT2.texture }, uDir: { value: new THREE.Vector2(0, 1.6 / ssrRT.height) } };
  const ssrBlurH = new RTPass(mat(blurHU, SSR_BLUR_FRAG), ssrRT2);
  const ssrBlurV = new RTPass(mat(blurVU, SSR_BLUR_FRAG), ssrRT);

  // 4. composite (scene×AO + SSR) into the composer chain
  const compU = { ...depthUniforms(depthTex), tScene: { value: sceneRT.texture }, tAO: { value: gtao.pdRenderTarget.texture }, tSSR: { value: ssrRT.texture }, uAO: { value: 0.85 }, uSSR: { value: 1 }, uF0: { value: 0.05 }, uUpView: ssrU.uUpView, uMinUp: { value: 0.75 } };
  const composite = new ShaderPass(mat(compU, COMPOSITE_FRAG)); composite.needsSwap = true;

  // 5. bloom
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.5, 0.6, 0.9);

  // 6. motion blur
  const mbU = { ...depthUniforms(depthTex), tDiffuse: { value: null }, uInvViewProj: { value: new THREE.Matrix4() }, uPrevViewProj: { value: new THREE.Matrix4() }, uIntensity: { value: 0 }, uMaxBlur: { value: 0.012 }, uTime: { value: 0 } };
  const motionBlur = new ShaderPass(mat(mbU, MOTION_BLUR_FRAG));

  // 7. DOF
  const dofU = { ...depthUniforms(depthTex), tDiffuse: { value: null }, uNearEnd: { value: 0.10 }, uNearStart: { value: 0.42 }, uMaxCoc: { value: 5 }, uAmount: { value: 0 }, uResolution: { value: new THREE.Vector2(W, H) } };
  const dof = new ShaderPass(mat(dofU, DOF_FRAG));

  // 8. tone map + sRGB, then AA, then LDR grade to screen
  const output = new OutputPass();
  const smaa = new SMAAPass();
  const drops = makeDropletTexture(512, ctx.seed);
  const gU = {
    tDiffuse: { value: null }, tDrops: { value: drops }, uResolution: { value: new THREE.Vector2(W, H) }, uTime: { value: 0 },
    uExposure: { value: 1.0 }, uContrast: { value: 1.08 }, uPivot: { value: 0.22 }, uSaturation: { value: 0.95 },
    uLift: { value: new THREE.Vector3(0.005, 0.009, 0.015) }, uGamma: { value: new THREE.Vector3(1, 1, 1) }, uGain: { value: new THREE.Vector3(1.0, 0.99, 0.97) },
    uShadowTint: { value: new THREE.Vector3(0.86, 0.96, 1.10) }, uHighlightTint: { value: new THREE.Vector3(1.08, 1.0, 0.90) }, uSplitAmount: { value: 0.55 },
    uVignette: { value: 0.3 }, uGrain: { value: 0.035 }, uCA: { value: 0.006 }, uSharpen: { value: 0.25 },
    uDrops: { value: 0 }, uDropsAspect: { value: W / H }, uDropsOffset: { value: new THREE.Vector2() }, uShake: { value: new THREE.Vector2() },
    uDamage: { value: 0 }, uDesat: { value: 0 }, uLowHealth: { value: 0 }, uHeartbeat: { value: 0 }, uFlash: { value: 0 }, uEdgeDark: { value: 0 },
  };
  const grade = new ShaderPass(mat(gU, GRADE_FRAG_FULL));

  const named = [['scene', scenePass], ['gtao', gtao], ['ssrTrace', ssrTrace], ['ssrBlurH', ssrBlurH], ['ssrBlurV', ssrBlurV], ['composite', composite], ['bloom', bloom], ['motionBlur', motionBlur], ['dof', dof], ['output', output], ['smaa', smaa], ['grade', grade]];
  for (const [, p] of named) composer.addPass(p);

  // ---------- runtime state ----------
  const S = {
    ctx, composer, named, sceneRT, depthTex, ssrRT, ssrRT2, gtao, ssrU, compU, mbU, dofU, gU, bloom, motionBlur, dof, output, smaa, grade, ssrTrace, ssrBlurH, ssrBlurV,
    time: 0, prevVP: new THREE.Matrix4(), curVP: new THREE.Matrix4(), invVP: new THREE.Matrix4(), hasPrev: false,
    shakeAmt: 0, damage: 0, flash: 0, lowFpsT: 0, cooldown: 0, quality: ctx.settings.quality, lastFrame: -1,
    profiling: null, bypass: ctx.qs.get('post') === '0',
    tuning: { bloomThreshold: 1.6, bloomStrength: 0.45, bloomRadius: 0.6, ao: 0.85, ssr: 1.0, motionShutter: 1 / 120, grain: 0.035, vignette: 0.3 },
  };

  const api = {
    render: (dt, c) => render(S, dt, c),
    shake: (amt) => { S.shakeAmt = Math.min(1.2, S.shakeAmt + (amt || 0)); },
    setQuality: (q) => setQuality(S, q),
    profile: (frames = 30) => new Promise((res) => { S.profiling = { left: frames, n: 0, acc: {}, cnt: {}, resolve: res }; }),
    passes: () => named.map(([n, p]) => ({ name: n, enabled: p.enabled })),
    tuning: S.tuning, uniforms: { grade: gU, composite: compU, ssr: ssrU, motionBlur: mbU, dof: dofU },
    _S: S,
  };

  // ---------- events ----------
  ctx.bus.on('playerDamaged', (d) => { const a = clamp((d?.amount ?? 20) / 60, 0.25, 1); S.damage = Math.min(1, S.damage + 0.55 + 0.45 * a); api.shake(0.18 * a); });
  ctx.bus.on('explosion', (d) => {
    let k = 1;
    if (d?.position && ctx.camera) { const dist = _v.copy(d.position).distanceTo(ctx.camera.position); const r = (d.radius || 5); k = 1 - smoothstep(r * 0.8, r * 4, dist); }
    S.flash = Math.min(1, S.flash + 0.9 * k); api.shake(0.9 * k);
  });
  ctx.bus.on('shot', (d) => { if (!d || d.who === undefined || d.who === 'player') api.shake(0.045); });
  ctx.bus.on('quality', (q) => setQuality(S, q));
  ctx.bus.on('state', ({ state }) => { if (state === 'playing') S.lowFpsT = 0; });

  setQuality(S, ctx.settings.quality);
  applySize(S, innerWidth, innerHeight);
  return api;
}

export function reset(ctx) {
  const S = ctx.post?._S; if (!S) return;
  S.shakeAmt = 0; S.damage = 0; S.flash = 0; S.hasPrev = false; S.lowFpsT = 0;
}

export function onResize(ctx) { const S = ctx.post?._S; if (S) applySize(S, innerWidth, innerHeight); }

function applySize(S, w, h) {
  const { ctx, composer } = S;
  const pr = Math.min(devicePixelRatio, ctx.settings.renderScale ?? 2);
  ctx.renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr); composer.setSize(w, h);
  const W = Math.floor(w * pr), H = Math.floor(h * pr);
  S.sceneRT.setSize(W, H);
  S.ssrRT.setSize(Math.max(1, W >> 1), Math.max(1, H >> 1)); S.ssrRT2.setSize(Math.max(1, W >> 1), Math.max(1, H >> 1));
  S.ssrBlurH.material.uniforms.uDir.value.set(1 / S.ssrRT.width, 0);
  S.ssrBlurV.material.uniforms.uDir.value.set(0, 1.6 / S.ssrRT.height);
  for (const u of [S.ssrU, S.compU, S.mbU, S.dofU]) u.uTexel.value.set(1 / W, 1 / H);
  S.dofU.uResolution.value.set(W, H); S.gU.uResolution.value.set(W, H); S.gU.uDropsAspect.value = W / H;
}

function setQuality(S, q) {
  if (!TIERS.includes(q)) return;
  S.quality = q; S.ctx.settings.quality = q;
}

function render(S, dt, ctx) {
  const { renderer, camera, settings } = ctx;
  dt = clamp(dt || 0, 0, 0.1);
  S.time += dt;
  if (settings.quality !== S.quality) setQuality(S, settings.quality);
  const q = S.quality;
  const tierHi = q === 'ultra' || q === 'high';
  const ads = clamp(+(ctx.weapons?.ads ?? 0) || 0, 0, 1);

  // renderer.info resets per render() call; accumulate over the whole frame so ctx.perf stays meaningful
  renderer.info.autoReset = false; renderer.info.reset();

  // ---- camera matrices ----
  camera.updateMatrixWorld();
  S.curVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  if (!S.hasPrev) { S.prevVP.copy(S.curVP); S.hasPrev = true; }
  S.invVP.copy(S.curVP).invert();
  for (const u of [S.ssrU, S.compU, S.mbU, S.dofU]) { u.uProj.value.copy(camera.projectionMatrix); u.uInvProj.value.copy(camera.projectionMatrixInverse); u.uNear.value = camera.near; u.uFar.value = camera.far; }
  S.ssrU.uUpView.value.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
  S.ssrU.uTime.value = S.time; S.mbU.uTime.value = S.time; S.gU.uTime.value = S.time;

  // ---- pass gating ----
  const aoOn = !!settings.ao && tierHi;
  const ssrOn = !!settings.ssr && tierHi;
  S.gtao.enabled = aoOn;
  S.ssrTrace.enabled = S.ssrBlurH.enabled = S.ssrBlurV.enabled = ssrOn;
  S.compU.uAO.value = aoOn ? S.tuning.ao : 0;
  S.compU.uSSR.value = ssrOn ? S.tuning.ssr : 0;

  S.bloom.enabled = !!settings.bloom;
  const exposure = renderer.toneMappingExposure || 1;
  S.bloom.threshold = S.tuning.bloomThreshold / exposure;
  S.bloom.strength = S.tuning.bloomStrength; S.bloom.radius = S.tuning.bloomRadius;

  // motion blur: fixed shutter, so blur length is fps-independent; fades out with ADS
  let mbI = 0;
  if (settings.motionBlur && q === 'ultra' && dt > 0) mbI = clamp(S.tuning.motionShutter / dt, 0.2, 1.0) * (1 - ads);
  S.motionBlur.enabled = mbI > 0.01;
  S.mbU.uIntensity.value = mbI; S.mbU.uInvViewProj.value.copy(S.invVP); S.mbU.uPrevViewProj.value.copy(S.prevVP);

  const dofAmt = (settings.dof && q === 'ultra') ? smoothstep(0.15, 0.9, ads) : 0;
  S.dof.enabled = dofAmt > 0.02; S.dofU.uAmount.value = dofAmt;

  // ---- grade dynamics ----
  const g = S.gU;
  g.uGrain.value = settings.filmGrain === false ? 0 : S.tuning.grain;
  g.uVignette.value = S.tuning.vignette;
  // lens rain: stronger when looking up, none when ADS (eye is on the sight)
  camera.getWorldDirection(_fwd);
  const lookUp = smoothstep(-0.25, 0.75, _fwd.y);
  const rainOn = settings.rain !== false && (ctx.world?.raining ?? true);
  g.uDrops.value = rainOn ? (0.35 + 0.65 * lookUp) * 0.5 * (1 - ads) : 0;
  g.uDropsOffset.value.set(0, -S.time * 0.004);
  // shake → screen-space offset
  S.shakeAmt *= Math.exp(-5.5 * dt);
  if (S.shakeAmt < 0.002) S.shakeAmt = 0;
  const t = S.time;
  g.uShake.value.set(Math.sin(t * 61.3) * Math.cos(t * 23.7), Math.cos(t * 53.1 + 1.3)).multiplyScalar(S.shakeAmt * 0.007);
  // health
  S.damage = Math.max(0, S.damage - dt / 1.2);
  S.flash *= Math.exp(-9 * dt); if (S.flash < 0.003) S.flash = 0;
  const hp = ctx.player?.health, maxHp = ctx.player?.maxHealth || 100;
  const low = (typeof hp === 'number') ? smoothstep(35, 12, hp * (100 / maxHp)) : 0;
  const dead = ctx.state === 'dead';
  g.uDamage.value = S.damage * (1 - low * 0.4);
  g.uDesat.value = Math.max(S.damage, dead ? 1 : 0);
  g.uLowHealth.value = dead ? 1 : low;
  const hb = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 1.25)), 8) + 0.55 * Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 1.25 - 1.1)), 12);
  g.uHeartbeat.value = clamp(hb, 0, 1);
  g.uFlash.value = S.flash;
  g.uEdgeDark.value = dead ? 0.45 : 0;

  // ---- render ----
  if (settings.post === false || S.bypass) { renderer.setRenderTarget(null); renderer.render(ctx.scene, camera); }
  else if (S.profiling) renderProfiled(S, dt); else S.composer.render(dt);
  renderer.setRenderTarget(null);
  S.prevVP.copy(S.curVP);

  // ---- auto quality ----
  const autoq = !ctx.qa || ctx.qs.get('autoq') === '1';
  if (autoq && ctx.state === 'playing' && dt > 0) {
    S.cooldown = Math.max(0, S.cooldown - dt);
    if (ctx.perf.fps < 45 && S.cooldown === 0) {
      S.lowFpsT += dt;
      if (S.lowFpsT > 3) {
        const i = TIERS.indexOf(S.quality);
        if (i < TIERS.length - 1) { const nq = TIERS[i + 1]; setQuality(S, nq); ctx.bus.emit('quality', nq); }
        S.lowFpsT = 0; S.cooldown = 6;
      }
    } else S.lowFpsT = 0;
  }
}

// Same loop as EffectComposer.render, but each pass wrapped in a GPU timer query (EXT_disjoint_timer_query_webgl2).
// Results are collected asynchronously in later frames; falls back to CPU submission time when the extension is missing.
function renderProfiled(S, dt) {
  const { composer } = S; const renderer = composer.renderer; const gl = renderer.getContext();
  const P = S.profiling;
  if (S.timerExt === undefined) S.timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2') || null;
  const ext = S.timerExt;
  P.pending = P.pending || [];
  // collect finished queries
  if (ext) {
    for (let i = P.pending.length - 1; i >= 0; i--) {
      const e = P.pending[i];
      if (gl.getQueryParameter(e.q, gl.QUERY_RESULT_AVAILABLE)) {
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) { P.acc[e.name] = (P.acc[e.name] || 0) + gl.getQueryParameter(e.q, gl.QUERY_RESULT) / 1e6; P.cnt[e.name] = (P.cnt[e.name] || 0) + 1; }
        gl.deleteQuery(e.q); P.pending.splice(i, 1);
      }
    }
  }
  if (P.left > 0) {
    for (let i = 0; i < composer.passes.length; i++) {
      const pass = composer.passes[i]; if (!pass.enabled) continue;
      const name = S.named[i][0];
      pass.renderToScreen = composer.isLastEnabledPass(i);
      let q = null; const t0 = performance.now();
      if (ext) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); }
      pass.render(renderer, composer.writeBuffer, composer.readBuffer, dt, false);
      if (pass.needsSwap) composer.swapBuffers();
      if (ext) { gl.endQuery(ext.TIME_ELAPSED_EXT); P.pending.push({ name, q }); }
      else { P.acc[name] = (P.acc[name] || 0) + (performance.now() - t0); P.cnt[name] = (P.cnt[name] || 0) + 1; }
    }
    P.left--;
  } else {
    composer.render(dt);
    P.drain = (P.drain || 0) + 1;
  }
  if (P.left <= 0 && (P.pending.length === 0 || P.drain > 120)) {
    const out = {}; let total = 0;
    for (const k in P.acc) { out[k] = +(P.acc[k] / Math.max(1, P.cnt[k])).toFixed(3); total += out[k]; }
    out.total = +total.toFixed(3); out.method = ext ? 'gpu-timer-query' : 'cpu-submit';
    for (const e of P.pending) gl.deleteQuery(e.q);
    S.profiling = null; P.resolve(out);
  }
}
