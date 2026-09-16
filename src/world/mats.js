// Shared material helpers: grime overlay, canvas-generated signage/decals. WORLD agent.
import * as THREE from 'three';

let grimeTex = null;
export function getGrimeTexture(R) {
  if (grimeTex) return grimeTex;
  const S = 512; const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  // vertical drip streaks
  for (let i = 0; i < 260; i++) {
    const x = R() * S, y0 = R() * S * 0.5, w = 1 + R() * 5, h = 40 + R() * 300;
    const gr = g.createLinearGradient(0, y0, 0, y0 + h);
    const a = 0.15 + R() * 0.45;
    gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x, y0, w, h);
  }
  // blotches
  for (let i = 0; i < 160; i++) {
    const x = R() * S, y = R() * S, r = 4 + R() * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); const a = 0.1 + R() * 0.35;
    gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // fine speckle
  for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(255,255,255,${R() * 0.25})`; g.fillRect(R() * S, R() * S, 1 + R() * 2, 1 + R() * 2); }
  grimeTex = new THREE.CanvasTexture(c); grimeTex.wrapS = grimeTex.wrapT = THREE.RepeatWrapping;
  return grimeTex;
}

/**
 * Adds rust/dirt streaks + bottom wetness to a MeshStandardMaterial via onBeforeCompile.
 * opts: { strength, scale, height (m over which bottom grime fades), tint, wet (roughness drop at bottom) }
 */
export function addGrime(mat, R, { strength = 0.7, scale = 0.7, height = 1.2, tint = [0.42, 0.33, 0.24], wet = 0.35, key = 'g' } = {}) {
  const tex = getGrimeTexture(R);
  const u = { uGrime: { value: tex }, uGrimeS: { value: strength }, uGrimeScale: { value: scale }, uGrimeH: { value: height }, uGrimeTint: { value: new THREE.Vector3(...tint) }, uWet: { value: wet } };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#ifdef USE_INSTANCING\n vGPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#endif');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGPos; uniform sampler2D uGrime; uniform float uGrimeS, uGrimeScale, uGrimeH, uWet; uniform vec3 uGrimeTint; float gGrime;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec2 guv = vGPos.xz * uGrimeScale + vec2(vGPos.y * 0.13, vGPos.y * uGrimeScale);
          #ifdef USE_UV
          guv = vUv * uGrimeScale * 2.0 + vec2(0.0, vGPos.y * 0.05);
          #endif
          float gt = texture2D(uGrime, guv).r;
          float bottom = 1.0 - clamp(vGPos.y / uGrimeH, 0.0, 1.0);
          gGrime = clamp(gt * uGrimeS * (0.35 + 0.65 * bottom) + bottom * bottom * 0.35 * uGrimeS, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uGrimeTint * 1.6, gGrime);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + gGrime * 0.25 - (1.0 - clamp(vGPos.y / 0.6, 0.0, 1.0)) * uWet, 0.04, 1.0);`);
  };
  const prevKey = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => (prevKey ? prevKey.call(mat) : '') + '|grime' + key;
  return mat;
}

/** Cyrillic sign / warning / graffiti texture. Returns THREE.CanvasTexture (sRGB). */
export function signTexture({ w = 512, h = 128, bg = '#1c1f22', fg = '#e8e4d8', text = 'ЗАВОД', font = 'bold 84px "Arial Narrow", Arial, sans-serif', border = '#c9a227', stripes = false, sub = null, R = Math.random } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (stripes) {
    g.save(); g.beginPath(); g.rect(0, 0, w, h); g.clip();
    for (let x = -h; x < w + h; x += 40) { g.fillStyle = '#d7b62a'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 20, 0); g.lineTo(x + 20 - h, h); g.lineTo(x - h, h); g.closePath(); g.fill(); }
    g.restore();
    g.fillStyle = bg; g.fillRect(w * 0.08, h * 0.2, w * 0.84, h * 0.6);
  }
  if (border) { g.strokeStyle = border; g.lineWidth = Math.max(3, h * 0.05); g.strokeRect(g.lineWidth, g.lineWidth, w - 2 * g.lineWidth, h - 2 * g.lineWidth); }
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, sub ? h * 0.38 : h / 2);
  if (sub) { g.font = `bold ${Math.round(h * 0.22)}px Arial`; g.fillText(sub, w / 2, h * 0.76); }
  // weathering
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(60,40,20,${R() * 0.35})`; g.fillRect(R() * w, R() * h, 1 + R() * 4, 1 + R() * 3); }
  for (let i = 0; i < 12; i++) { const x = R() * w; const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, `rgba(80,50,20,${0.2 + R() * 0.4})`); gr.addColorStop(1, 'rgba(80,50,20,0)'); g.fillStyle = gr; g.fillRect(x, 0, 1 + R() * 6, h); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** Graffiti tag with transparent background. */
export function graffitiTexture({ text = 'ЗАВОД', color = '#d8322d', w = 512, h = 256, R = Math.random } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.font = `italic bold ${Math.round(h * 0.6)}px Impact, "Arial Black", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.save(); g.translate(w / 2, h / 2); g.rotate((R() - 0.5) * 0.15);
  g.strokeStyle = 'rgba(10,10,10,0.85)'; g.lineWidth = h * 0.12; g.strokeText(text, 0, 0);
  g.fillStyle = color; g.fillText(text, 0, 0);
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = h * 0.02; g.strokeText(text, 0, -h * 0.02);
  g.restore();
  // drips
  for (let i = 0; i < 30; i++) { const x = w * 0.2 + R() * w * 0.6, y = h * 0.55 + R() * h * 0.2; g.fillStyle = color; g.fillRect(x, y, 2 + R() * 3, R() * 40); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** Lit window grid texture for distant apartment blocks (emissive). */
export function windowsTexture(R, cols = 12, rows = 24) {
  const w = cols * 16, h = rows * 16; const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (R() < 0.13) { const warm = R() < 0.75; g.fillStyle = warm ? `rgba(255,${170 + R() * 60},${80 + R() * 60},${0.5 + R() * 0.5})` : `rgba(150,200,255,${0.4 + R() * 0.5})`; g.fillRect(x * 16 + 4, y * 16 + 3, 8, 10); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter;
  return t;
}

/** Tileable chain-link mesh alpha texture. */
export function chainlinkTexture() {
  const S = 256; const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.strokeStyle = 'rgba(190,195,200,1)'; g.lineWidth = 3; g.lineCap = 'round';
  const cell = 32;
  for (let y = -cell; y < S + cell; y += cell) for (let x = -cell; x < S + cell; x += cell) {
    g.beginPath(); g.moveTo(x, y + cell / 2); g.lineTo(x + cell / 2, y); g.lineTo(x + cell, y + cell / 2); g.lineTo(x + cell / 2, y + cell); g.closePath(); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Barbed wire strip alpha texture (tileable in X). */
export function barbedTexture() {
  const w = 256, h = 64; const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(200,200,205,1)'; g.lineWidth = 2.5;
  g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, h / 2 + Math.sin(x / 8) * 6); g.stroke();
  g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, h / 2 - Math.sin(x / 8) * 6); g.stroke();
  for (let x = 12; x < w; x += 40) { g.beginPath(); g.moveTo(x - 6, h / 2 - 16); g.lineTo(x + 6, h / 2 + 16); g.moveTo(x + 6, h / 2 - 16); g.lineTo(x - 6, h / 2 + 16); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 16; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
