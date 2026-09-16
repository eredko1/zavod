// Procedural textures + PBR materials for the viewmodels. Owned by: WEAPONS agent.
import * as THREE from 'three';

function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Tileable value noise, octaves. Returns Float32Array size*size in 0..1 */
function noiseField(size, seed, octaves = 5, base = 8, gain = 0.55) {
  const r = prng(seed); const out = new Float32Array(size * size);
  let amp = 1, freq = base, tot = 0;
  for (let o = 0; o < octaves; o++) {
    const gs = freq; const grid = new Float32Array(gs * gs); for (let i = 0; i < grid.length; i++) grid[i] = r();
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = x / size * gs, fy = y / size * gs; const x0 = Math.floor(fx), y0 = Math.floor(fy); const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const x1 = (x0 + 1) % gs, y1 = (y0 + 1) % gs;
      const a = grid[y0 * gs + x0], b = grid[y0 * gs + x1], c = grid[y1 * gs + x0], d = grid[y1 * gs + x1];
      out[y * size + x] += amp * ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy);
    }
    tot += amp; amp *= gain; freq *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

function canvasTex(size, draw, { srgb = false, repeat = 1, aniso = 8 } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  draw(g, c);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Height field → tangent-space normal map canvas texture */
function normalFromHeight(h, size, strength = 2) {
  return canvasTex(size, (g, c) => {
    const img = g.createImageData(size, size); const d = img.data;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const l = h[y * size + (x + size - 1) % size], r = h[y * size + (x + 1) % size], u = h[((y + size - 1) % size) * size + x], dn = h[((y + 1) % size) * size + x];
      let nx = (l - r) * strength, ny = (u - dn) * strength, nz = 1; const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}

export function makeTextures() {
  const S = 512;
  // --- metal grunge: base noise + directional scratches + speckle
  const base = noiseField(S, 11, 5, 6, 0.5);
  const r = prng(99);
  const scratch = new Float32Array(S * S);
  for (let i = 0; i < 260; i++) {
    const x0 = r() * S, y0 = r() * S, ang = (r() - 0.5) * 0.6 + (r() < 0.5 ? 0 : Math.PI / 2), len = 10 + r() * 90, w = r() < 0.8 ? 1 : 2, amp = 0.35 + r() * 0.65;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    for (let t = 0; t < len; t++) { const x = Math.round(x0 + dx * t), y = Math.round(y0 + dy * t); for (let k = 0; k < w; k++) { const xi = (x + k + S) % S, yi = (y + S) % S; scratch[yi * S + xi] = Math.max(scratch[yi * S + xi], amp * (0.6 + 0.4 * Math.sin(t / len * Math.PI))); } }
  }
  const speck = new Float32Array(S * S); for (let i = 0; i < 6000; i++) { const x = (r() * S) | 0, y = (r() * S) | 0; speck[y * S + x] = r(); }
  const height = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) height[i] = base[i] * 0.6 - scratch[i] * 0.5 + speck[i] * 0.15;

  // albedo-ish grime (multiplied): mostly ~1 with darker smudges & bright scratch highlights
  const grunge = canvasTex(S, (g) => {
    const img = g.createImageData(S, S); const d = img.data;
    for (let i = 0; i < S * S; i++) {
      const v = 0.7 + base[i] * 0.3 + scratch[i] * 0.35; // R: albedo multiplier
      const rough = 0.45 + base[i] * 0.55 - scratch[i] * 0.4 + speck[i] * 0.15; // G: roughness multiplier
      const m = 1 - scratch[i] * 0.3; // B: metalness multiplier
      d[i * 4] = Math.min(255, v * 255); d[i * 4 + 1] = Math.max(0, Math.min(255, rough * 255)); d[i * 4 + 2] = Math.max(0, Math.min(255, m * 255)); d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
  const metalNormal = normalFromHeight(height, S, 1.6);

  // --- polymer stipple: fine bumps + coarse mottle
  const stip = noiseField(S, 21, 3, 48, 0.5); const mottle = noiseField(S, 22, 3, 5, 0.6);
  const polyH = new Float32Array(S * S); for (let i = 0; i < S * S; i++) polyH[i] = stip[i] * 0.7 + mottle[i] * 0.3;
  const polymerNormal = normalFromHeight(polyH, S, 2.6);
  const polymerGrunge = canvasTex(S, (g) => {
    const img = g.createImageData(S, S); const d = img.data;
    for (let i = 0; i < S * S; i++) { const v = 0.82 + mottle[i] * 0.18; const ro = 0.75 + stip[i] * 0.25; d[i * 4] = v * 255; d[i * 4 + 1] = ro * 255; d[i * 4 + 2] = 255; d[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
  });

  // --- glove: woven fabric + leather creases
  const weave = new Float32Array(S * S); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) weave[y * S + x] = 0.5 + 0.25 * Math.sin(x * 0.9) * Math.sin(y * 0.9) + 0.25 * Math.sin((x + y) * 0.45);
  const crease = noiseField(S, 31, 4, 4, 0.6);
  const gloveH = new Float32Array(S * S); for (let i = 0; i < S * S; i++) gloveH[i] = weave[i] * 0.45 + crease[i] * 0.55;
  const gloveNormal = normalFromHeight(gloveH, S, 2.2);
  const gloveMap = canvasTex(S, (g) => {
    const img = g.createImageData(S, S); const d = img.data;
    for (let i = 0; i < S * S; i++) { const v = 0.7 + crease[i] * 0.3 + (weave[i] - 0.5) * 0.15; d[i * 4] = v * 255; d[i * 4 + 1] = (0.85 + crease[i] * 0.15) * 255; d[i * 4 + 2] = 255; d[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
  });
  return { grunge, metalNormal, polymerNormal, polymerGrunge, gloveNormal, gloveMap };
}

/**
 * Injects edge-wear (vertex color .r) + grime (vertex color .g) into a physical material:
 * albedo → wearColor at worn edges, roughness/metalness shift; grime darkens.
 */
function injectWear(mat, { wearColor = [0.62, 0.6, 0.56], wearRough = 0.32, wearMetal = 1.0, grimeDark = 0.35, wearScale = 1 } = {}) {
  mat.vertexColors = true;
  mat.customProgramCacheKey = () => `wear:${wearColor.join(',')}:${wearRough}:${wearMetal}:${grimeDark}`;
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', `
        float vmMask = 1.0;
        #ifdef USE_MAP
          vmMask = texture2D( map, vMapUv * 2.37 + 0.31 ).r; vmMask = smoothstep(0.55, 1.0, vmMask);
        #endif
        float vmWear = clamp(vColor.r * ${wearScale.toFixed(2)} * (0.45 + 0.75 * vmMask), 0.0, 1.0);
        float vmGrime = vColor.g;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${wearColor.map(v => v.toFixed(3)).join(',')}), vmWear);
        diffuseColor.rgb *= mix(1.0, ${(1 - grimeDark).toFixed(3)}, vmGrime * (1.0 - vmMask * 0.5));
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, ${wearRough.toFixed(3)}, vmWear);
        roughnessFactor = mix(roughnessFactor, min(1.0, roughnessFactor + 0.25), vmGrime * 0.6);
      `)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, ${wearMetal.toFixed(3)}, vmWear);
      `);
  };
  return mat;
}

export function makeMaterials(tex) {
  const M = THREE.MeshPhysicalMaterial;
  const nsMetal = new THREE.Vector2(0.55, 0.55), nsPoly = new THREE.Vector2(0.5, 0.5), nsGlove = new THREE.Vector2(0.7, 0.7);
  const rep = (t, n) => { const c = t.clone(); c.repeat.set(n, n); c.needsUpdate = true; return c; };
  const mats = {
    // anodized aluminum receiver / rails (matte black type-III)
    metal: injectWear(new M({ color: 0x1c1d1f, roughness: 0.62, metalness: 0.8, map: rep(tex.grunge, 1.5), roughnessMap: rep(tex.grunge, 1.5), normalMap: rep(tex.metalNormal, 1.5), normalScale: nsMetal, envMapIntensity: 0.75 }), { wearColor: [0.62, 0.61, 0.58], wearRough: 0.32, wearMetal: 1, wearScale: 1.0 }),
    // parkerized steel: barrel, flash hider, bolt, charging handle
    steel: injectWear(new M({ color: 0x232527, roughness: 0.46, metalness: 0.95, map: rep(tex.grunge, 2.5), roughnessMap: rep(tex.grunge, 2.5), normalMap: rep(tex.metalNormal, 2.5), normalScale: nsMetal, envMapIntensity: 1.0 }), { wearColor: [0.66, 0.64, 0.6], wearRough: 0.28, wearMetal: 1, wearScale: 1.1 }),
    // glass-filled polymer: grip, stock, mag, handstop
    polymer: injectWear(new M({ color: 0x141416, roughness: 0.68, metalness: 0.0, map: rep(tex.polymerGrunge, 2), roughnessMap: rep(tex.polymerGrunge, 2), normalMap: rep(tex.polymerNormal, 2), normalScale: nsPoly, envMapIntensity: 0.8 }), { wearColor: [0.36, 0.36, 0.35], wearRough: 0.45, wearMetal: 0, grimeDark: 0.25, wearScale: 0.8 }),
    // FDE polymer accents (mag)
    fde: injectWear(new M({ color: 0x3a3128, roughness: 0.7, metalness: 0.0, map: rep(tex.polymerGrunge, 2), roughnessMap: rep(tex.polymerGrunge, 2), normalMap: rep(tex.polymerNormal, 2), normalScale: nsPoly, envMapIntensity: 0.8 }), { wearColor: [0.5, 0.45, 0.38], wearRough: 0.5, wearMetal: 0, grimeDark: 0.3, wearScale: 0.8 }),
    rubber: injectWear(new M({ color: 0x0c0c0d, roughness: 0.9, metalness: 0.0, normalMap: rep(tex.polymerNormal, 3), normalScale: new THREE.Vector2(0.8, 0.8) }), { wearColor: [0.2, 0.2, 0.2], wearRough: 0.75, wearMetal: 0, wearScale: 0.5 }),
    brass: new M({ color: 0xc9a24a, roughness: 0.28, metalness: 1.0, envMapIntensity: 1.2 }),
    glass: new M({ color: 0x1a2c58, roughness: 0.02, metalness: 0.0, transparent: true, opacity: 0.42, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.2, depthWrite: false, side: THREE.DoubleSide, iridescence: 0.8, iridescenceIOR: 1.5, iridescenceThicknessRange: [200, 500], specularIntensity: 1.5, ior: 1.7, reflectivity: 0.9 }),
    blackout: new THREE.MeshBasicMaterial({ color: 0x030303 }),
    dot: new THREE.MeshBasicMaterial({ color: 0xff1a10, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }),
    glove: injectWear(new M({ color: 0x2a2b2c, roughness: 0.86, metalness: 0.0, map: rep(tex.gloveMap, 3), roughnessMap: rep(tex.gloveMap, 3), normalMap: rep(tex.gloveNormal, 3), normalScale: nsGlove, envMapIntensity: 0.6, sheen: 0.4, sheenRoughness: 0.8, sheenColor: new THREE.Color(0x444444) }), { wearColor: [0.4, 0.38, 0.35], wearRough: 0.7, wearMetal: 0, grimeDark: 0.2, wearScale: 0.4 }),
    knuckle: injectWear(new M({ color: 0x1e1f21, roughness: 0.55, metalness: 0.05, normalMap: rep(tex.polymerNormal, 3), normalScale: nsPoly }), { wearColor: [0.35, 0.35, 0.34], wearRough: 0.4, wearMetal: 0 }),
    sleeve: injectWear(new M({ color: 0x3b4034, roughness: 0.95, metalness: 0.0, map: rep(tex.gloveMap, 4), normalMap: rep(tex.gloveNormal, 4), normalScale: nsGlove, envMapIntensity: 0.4 }), { wearColor: [0.45, 0.46, 0.4], wearRough: 0.9, wearMetal: 0, grimeDark: 0.3, wearScale: 0.3 }),
    // grenade body
    olive: injectWear(new M({ color: 0x3c4a2e, roughness: 0.6, metalness: 0.3, map: rep(tex.grunge, 2), roughnessMap: rep(tex.grunge, 2), normalMap: rep(tex.metalNormal, 2), normalScale: nsMetal }), { wearColor: [0.6, 0.6, 0.58], wearRough: 0.35, wearMetal: 0.9 }),
  };
  for (const m of Object.values(mats)) { m.dithering = true; }
  return mats;
}
