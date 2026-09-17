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

  // --- glove: coarse nylon weave + leather creases + stitched seams (double dashed lines on a grid)
  const weave = new Float32Array(S * S); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) weave[y * S + x] = 0.5 + 0.22 * Math.sin(x * 1.1) * Math.sin(y * 1.1) + 0.18 * Math.sin((x + y) * 0.5) + 0.1 * Math.sin(x * 0.23) * Math.sin(y * 0.19);
  const crease = noiseField(S, 31, 4, 4, 0.6);
  const seam = new Float32Array(S * S);
  {
    const r2 = prng(77);
    const lines = [[0, 96], [0, 300], [1, 128], [1, 400], [1, 260]]; // [axis, offset]
    for (const [ax, off] of lines) for (let t = 0; t < S; t++) { const dash = (Math.floor(t / 9) % 2) === 0; for (let k = -1; k <= 1; k++) for (const side of [-4, 4]) { const u = (off + side + k + S) % S; const i = ax === 0 ? t * S + u : u * S + t; seam[i] = Math.max(seam[i], dash ? 0.9 : 0.25); } }
    for (let i = 0; i < 900; i++) { const x = (r2() * S) | 0, y = (r2() * S) | 0; seam[y * S + x] = Math.max(seam[y * S + x], r2() * 0.5); } // pilling
  }
  const gloveH = new Float32Array(S * S); for (let i = 0; i < S * S; i++) gloveH[i] = weave[i] * 0.4 + crease[i] * 0.5 - seam[i] * 0.35;
  const gloveNormal = normalFromHeight(gloveH, S, 2.6);
  const gloveMap = canvasTex(S, (g) => {
    const img = g.createImageData(S, S); const d = img.data;
    for (let i = 0; i < S * S; i++) { const cr = crease[i]; const v = 0.5 + cr * 0.55 + (weave[i] - 0.5) * 0.3 - seam[i] * 0.55 - (cr < 0.35 ? (0.35 - cr) * 0.9 : 0); const ro = 0.85 + cr * 0.15 - seam[i] * 0.1; d[i * 4] = Math.max(0, Math.min(255, v * 255)); d[i * 4 + 1] = Math.max(0, Math.min(255, ro * 255)); d[i * 4 + 2] = 255; d[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
  });
  // --- palm: pebbled synthetic leather (small dimple grid + noise), used through the glove material's vertex-color b channel
  const palmN = noiseField(S, 41, 3, 24, 0.55);
  const palmH = new Float32Array(S * S); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const gx = ((x % 14) - 7) / 7, gy = ((y % 14) - 7) / 7; palmH[y * S + x] = Math.max(0, 1 - (gx * gx + gy * gy)) * 0.6 + palmN[y * S + x] * 0.4; }
  const palmNormal = normalFromHeight(palmH, S, 2.0);
  // --- camo sleeve: multicam-style blotches in 4 tones + cream speckle; creases as a bump map
  const cA = noiseField(S, 51, 3, 5, 0.5), cB = noiseField(S, 52, 4, 7, 0.55), cC = noiseField(S, 53, 5, 11, 0.5), cD = noiseField(S, 54, 2, 4, 0.5);
  const camoMap = canvasTex(S, (g) => {
    const img = g.createImageData(S, S); const d = img.data;
    const tones = [[0x6c, 0x67, 0x4e], [0x4b, 0x52, 0x38], [0x4c, 0x40, 0x30], [0x32, 0x37, 0x28], [0x86, 0x81, 0x68]]; // multicam, desaturated ~25%
    for (let i = 0; i < S * S; i++) {
      const a = cA[i], b2 = cB[i], c = cC[i], dd = cD[i]; let t;
      if (c > 0.7 && a > 0.5) t = 4; else if (b2 > 0.58) t = 1; else if (a > 0.56 && c < 0.5) t = 2; else if (dd < 0.44 && b2 < 0.46) t = 3; else t = 0;
      const k = 0.9 + c * 0.2; const col = tones[t]; d[i * 4] = Math.min(255, col[0] * k); d[i * 4 + 1] = Math.min(255, col[1] * k); d[i * 4 + 2] = Math.min(255, col[2] * k); d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: true });
  const creaseN = noiseField(S, 61, 4, 6, 0.6);
  const camoBump = canvasTex(S, (g) => {
    const img = g.createImageData(S, S); const d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = y * S + x; const fold = 0.5 + 0.5 * Math.sin(x * 0.045 + creaseN[i] * 9.0) * Math.sin(y * 0.02 + creaseN[i] * 4.0); const v = (0.35 + fold * 0.45 + weave[i] * 0.2) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
  });
  return { grunge, metalNormal, polymerNormal, polymerGrunge, gloveNormal, gloveMap, palmNormal, camoMap, camoBump };
}

/**
 * Injects edge-wear (vertex color .r) + grime (vertex color .g) into a physical material:
 * albedo → wearColor at worn edges, roughness/metalness shift; grime darkens.
 */
function injectWear(mat, { wearColor = [0.62, 0.6, 0.56], wearRough = 0.32, wearMetal = 1.0, grimeDark = 0.35, wearScale = 1, palmColor = null, palmMap = null } = {}) {
  mat.vertexColors = true;
  mat.customProgramCacheKey = () => `wear:${wearColor.join(',')}:${wearRough}:${wearMetal}:${grimeDark}:${palmColor ? palmColor.join(',') : ''}`;
  if (palmMap) mat.userData.palmMap = palmMap;
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
        ${palmColor ? `float vmPalm = vColor.b; float vmPebble = 1.0;
        #ifdef USE_MAP
          vmPebble = 0.7 + 0.6 * texture2D( map, vMapUv * 3.1 ).r;
        #endif
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${palmColor.map(v => v.toFixed(3)).join(',')}) * vmPebble, vmPalm);` : ''}
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, ${wearRough.toFixed(3)}, vmWear);
        roughnessFactor = mix(roughnessFactor, min(1.0, roughnessFactor + 0.25), vmGrime * 0.6);
        ${palmColor ? 'roughnessFactor = mix(roughnessFactor, 0.92, vColor.b);' : ''}
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
    metal: injectWear(new M({ color: 0x08090a, roughness: 0.66, metalness: 0.6, map: rep(tex.grunge, 1.5), roughnessMap: rep(tex.grunge, 1.5), normalMap: rep(tex.metalNormal, 1.5), normalScale: nsMetal, envMapIntensity: 0.55 }), { wearColor: [0.4, 0.4, 0.39], wearRough: 0.35, wearMetal: 1.0, wearScale: 0.9 }),
    // parkerized steel: barrel, flash hider, bolt, charging handle
    steel: injectWear(new M({ color: 0x0b0c0e, roughness: 0.5, metalness: 0.6, map: rep(tex.grunge, 2.5), roughnessMap: rep(tex.grunge, 2.5), normalMap: rep(tex.metalNormal, 2.5), normalScale: nsMetal, envMapIntensity: 0.6 }), { wearColor: [0.45, 0.44, 0.42], wearRough: 0.3, wearMetal: 1.0, wearScale: 1.0 }),
    // glass-filled polymer: grip, stock, mag, handstop
    polymer: injectWear(new M({ color: 0x141416, roughness: 0.68, metalness: 0.0, map: rep(tex.polymerGrunge, 2), roughnessMap: rep(tex.polymerGrunge, 2), normalMap: rep(tex.polymerNormal, 2), normalScale: nsPoly, envMapIntensity: 0.8 }), { wearColor: [0.36, 0.36, 0.35], wearRough: 0.45, wearMetal: 0, grimeDark: 0.25, wearScale: 0.8 }),
    // FDE polymer accents (mag)
    fde: injectWear(new M({ color: 0x3a3128, roughness: 0.7, metalness: 0.0, map: rep(tex.polymerGrunge, 2), roughnessMap: rep(tex.polymerGrunge, 2), normalMap: rep(tex.polymerNormal, 2), normalScale: nsPoly, envMapIntensity: 0.8 }), { wearColor: [0.5, 0.45, 0.38], wearRough: 0.5, wearMetal: 0, grimeDark: 0.3, wearScale: 0.8 }),
    rubber: injectWear(new M({ color: 0x0c0c0d, roughness: 0.9, metalness: 0.0, normalMap: rep(tex.polymerNormal, 3), normalScale: new THREE.Vector2(0.8, 0.8) }), { wearColor: [0.2, 0.2, 0.2], wearRough: 0.75, wearMetal: 0, wearScale: 0.5 }),
    brass: new M({ color: 0xc9a24a, roughness: 0.28, metalness: 1.0, envMapIntensity: 1.2 }),
    glass: new M({ color: 0x1a2c58, roughness: 0.02, metalness: 0.0, transparent: true, opacity: 0.42, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.2, depthWrite: false, side: THREE.DoubleSide, iridescence: 0.8, iridescenceIOR: 1.5, iridescenceThicknessRange: [200, 500], specularIntensity: 1.5, ior: 1.7, reflectivity: 0.9 }),
    blackout: new THREE.MeshBasicMaterial({ color: 0x030303 }),
    dot: new THREE.MeshBasicMaterial({ color: 0xff1a10, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }),
    // coyote-tan tactical glove: nylon/leather weave with stitched seams; palm patches darker & pebbled (vertex color b); fingertip dirt via edge wear
    glove: injectWear(new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 0.9, metalness: 0.0, map: rep(tex.gloveMap, 3.0), roughnessMap: rep(tex.gloveMap, 3.0), normalMap: rep(tex.gloveNormal, 3.0), normalScale: new THREE.Vector2(1.1, 1.1), envMapIntensity: 0.0 }), { wearColor: [0.62, 0.55, 0.42], wearRough: 0.92, wearMetal: 0, grimeDark: 0.6, wearScale: 0.8, palmColor: [0.17, 0.155, 0.14] }),
    // hard knuckle plate: slightly glossy dark grey polymer
    knuckle: injectWear(new THREE.MeshStandardMaterial({ color: 0x1e2022, roughness: 0.5, metalness: 0.05, normalMap: rep(tex.polymerNormal, 3), normalScale: new THREE.Vector2(0.4, 0.4), envMapIntensity: 0.7 }), { wearColor: [0.5, 0.5, 0.48], wearRough: 0.35, wearMetal: 0, wearScale: 0.8 }),
    // multicam sleeve with creases (bump) and a rolled cuff
    sleeve: injectWear(new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.95, metalness: 0.0, map: rep(tex.camoMap, 1.6), bumpMap: rep(tex.camoBump, 1.6), bumpScale: 0.012, normalMap: rep(tex.gloveNormal, 6), normalScale: new THREE.Vector2(0.8, 0.8), envMapIntensity: 0.0 }), { wearColor: [0.55, 0.52, 0.42], wearRough: 0.95, wearMetal: 0, grimeDark: 0.35, wearScale: 0.3 }),
    // grenade body
    olive: injectWear(new M({ color: 0x3c4a2e, roughness: 0.6, metalness: 0.3, map: rep(tex.grunge, 2), roughnessMap: rep(tex.grunge, 2), normalMap: rep(tex.metalNormal, 2), normalScale: nsMetal }), { wearColor: [0.6, 0.6, 0.58], wearRough: 0.35, wearMetal: 0.9 }),
  };
  for (const m of Object.values(mats)) { m.dithering = true; }
  return mats;
}
