// SBU materials: Poly Haven PBR sets from assets/textures + canvas textures (hex pavers, ribbed concrete, zebra path, slit windows, leaves, signs). SBU agent.
import * as THREE from 'three';
import { addGrime } from '../mats.js';

const BASE = './assets/textures/';
const loader = new THREE.TextureLoader();

function tex(file, { srgb = false, aniso = 8 } = {}) {
  const t = loader.load(BASE + file);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function finish(c, { srgb = true, wrap = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; return t;
}

/** Grey concrete hex pavers with pale joints. 512 px = 2 m. */
export function hexPaverTexture(R) {
  const S = 512; const [c, g] = canvas(S, S);
  g.fillStyle = '#9a9a97'; g.fillRect(0, 0, S, S);
  const cols = 8, w = S / cols, r = w / Math.sqrt(3); const rows = 10, vs = S / rows; const ry = vs / 1.5; // slightly squashed hex so the tile wraps
  for (let row = -1; row <= rows; row++) for (let col = -1; col <= cols; col++) {
    const cx = col * w + (row % 2 ? w / 2 : 0), cy = row * vs;
    const v = 118 + (R() - 0.5) * 34; const tint = R() < 0.12 ? 1.08 : 1;
    g.fillStyle = `rgb(${(v * tint) | 0},${(v * tint) | 0},${(v * tint * 0.98) | 0})`;
    g.beginPath();
    for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; const px = cx + Math.cos(a) * (r - 1.6), py = cy + Math.sin(a) * (ry - 1.6) * 1.0; if (k) g.lineTo(px, py); else g.moveTo(px, py); }
    g.closePath(); g.fill();
  }
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${R() < 0.5 ? 40 : 230},${R() < 0.5 ? 40 : 230},${R() < 0.5 ? 40 : 230},${R() * 0.12})`; g.fillRect(R() * S, R() * S, 1 + R() * 2, 1 + R() * 2); }
  return finish(c);
}

/** Ribbed / bush-hammered brutalist concrete (vertical ribs). 512 px = 2 m. Returns { map, normalMap }. */
export function ribbedConcreteTexture(R) {
  const S = 512; const [c, g] = canvas(S, S);
  g.fillStyle = '#b9b3a8'; g.fillRect(0, 0, S, S);
  const ribW = 32; // 12.5 cm ribs
  for (let x = 0; x < S; x += ribW) {
    const v = 175 + (R() - 0.5) * 22;
    g.fillStyle = `rgb(${v | 0},${(v - 4) | 0},${(v - 12) | 0})`; g.fillRect(x, 0, ribW * 0.62, S);
    g.fillStyle = `rgb(${(v - 40) | 0},${(v - 44) | 0},${(v - 50) | 0})`; g.fillRect(x + ribW * 0.62, 0, ribW * 0.38, S);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, 0, 3, S);
  }
  for (let i = 0; i < 14000; i++) { const d = R() < 0.55; g.fillStyle = `rgba(${d ? 30 : 235},${d ? 28 : 230},${d ? 24 : 220},${R() * 0.22})`; g.fillRect(R() * S, R() * S, 1 + R() * 2, 1 + R() * 3); }
  for (let i = 0; i < 40; i++) { const x = R() * S; const gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, `rgba(60,50,40,${0.05 + R() * 0.12})`); gr.addColorStop(1, 'rgba(60,50,40,0)'); g.fillStyle = gr; g.fillRect(x, 0, 2 + R() * 6, S); }
  const map = finish(c);
  // normal map from the rib profile
  const [nc, ng] = canvas(S, S); ng.fillStyle = '#8080ff'; ng.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += ribW) {
    ng.fillStyle = '#4a80ff'; ng.fillRect(x + ribW * 0.62 - 2, 0, 4, S);     // rib right edge (normal -x)
    ng.fillStyle = '#b680ff'; ng.fillRect(x + ribW - 3, 0, 4, S);             // groove right wall (normal +x)
  }
  const normalMap = finish(nc, { srgb: false });
  return { map, normalMap };
}

/** Smooth precast concrete panels (library / Psychology): pale tan with panel joints. 512 px = 4 m. */
export function precastTexture(R) {
  const S = 512; const [c, g] = canvas(S, S);
  g.fillStyle = '#cfc6b6'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 12000; i++) { const d = R() < 0.5; g.fillStyle = `rgba(${d ? 60 : 245},${d ? 55 : 240},${d ? 45 : 230},${R() * 0.16})`; g.fillRect(R() * S, R() * S, 1 + R() * 3, 1 + R() * 3); }
  for (let i = 0; i < 24; i++) { const x = R() * S; const gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, `rgba(70,60,50,${0.04 + R() * 0.1})`); gr.addColorStop(1, 'rgba(70,60,50,0)'); g.fillStyle = gr; g.fillRect(x, 0, 3 + R() * 10, S); }
  g.strokeStyle = 'rgba(70,64,56,0.55)'; g.lineWidth = 2; g.strokeRect(1, 1, S - 2, S - 2);
  g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.stroke();
  return finish(c);
}

/** Top-floor slit windows (library): concrete with narrow dark vertical slots. 512 px = 4.2 m wide × 4.2 m high (one floor). */
export function slitWindowTexture(R) {
  const S = 512; const [c, g] = canvas(S, S);
  g.fillStyle = '#cbc2b2'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 6000; i++) { const d = R() < 0.5; g.fillStyle = `rgba(${d ? 60 : 245},${d ? 55 : 240},${d ? 45 : 230},${R() * 0.14})`; g.fillRect(R() * S, R() * S, 1 + R() * 3, 1 + R() * 3); }
  for (let k = 0; k < 4; k++) { const x = S * (0.09 + k * 0.25); g.fillStyle = '#2b3138'; g.fillRect(x, S * 0.22, S * 0.075, S * 0.56); g.fillStyle = '#7d96a8'; g.fillRect(x + 4, S * 0.24, S * 0.075 - 8, S * 0.52); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, S * 0.22, S * 0.075, 8); }
  return finish(c);
}

/** Granite setts (cobbles): grey blocks with dark joints. 512 px = 1.5 m. */
export function cobbleTexture(R, { dark = false } = {}) {
  const S = 512; const [c, g] = canvas(S, S);
  g.fillStyle = dark ? '#3a3835' : '#6e6a62'; g.fillRect(0, 0, S, S);
  const bw = 40, bh = 30;
  for (let y = 0; y < S; y += bh) for (let x = (y / bh) % 2 ? -bw / 2 : 0; x < S; x += bw) {
    const v = (dark ? 78 : 150) + (R() - 0.5) * 40; const t = R() < 0.5 ? 1.03 : 0.97;
    g.fillStyle = `rgb(${(v * t) | 0},${(v * 0.98) | 0},${(v * 0.92 / t) | 0})`; g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x + 2, y + 2, bw - 4, 3);
  }
  for (let i = 0; i < 7000; i++) { const d = R() < 0.5; g.fillStyle = `rgba(${d ? 30 : 230},${d ? 30 : 225},${d ? 30 : 215},${R() * 0.14})`; g.fillRect(R() * S, R() * S, 1 + R() * 2, 1 + R() * 2); }
  return finish(c);
}

/** Zebra Path: black/white bands across a 2 m tile (bands run across the path = along U). */
export function zebraTexture(R) {
  const S = 512; const [c, g] = canvas(S, S);
  for (let i = 0; i < 4; i++) { const dark = i % 2; g.fillStyle = dark ? '#2a2a2c' : '#d7d5ce'; g.fillRect(0, i * S / 4, S, S / 4); }
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${R() < 0.5 ? 20 : 240},${R() < 0.5 ? 20 : 240},${R() < 0.5 ? 20 : 240},${R() * 0.14})`; g.fillRect(R() * S, R() * S, 1 + R() * 3, 1 + R() * 2); }
  return finish(c);
}

/**
 * Leaf clump card. Returns { map, alphaMap }: the colour map is OPAQUE (leaf green everywhere) and the
 * alpha is a separate map, so mip-mapping can never average transparent black into the leaf colour —
 * that halo is what made the canopies read as dark sprite blobs at distance.
 */
export function leafTexture(R, { pine = false } = {}) {
  const S = 256; const [c, g] = canvas(S, S); const [ac, ag] = canvas(S, S);
  g.fillStyle = pine ? '#3a4a30' : '#54703a'; g.fillRect(0, 0, S, S);       // colour bed (never black)
  ag.fillStyle = '#000000'; ag.fillRect(0, 0, S, S);
  const n = pine ? 2600 : 900;
  for (let i = 0; i < n; i++) {
    const x = R() * S, y = R() * S; const a = R() * Math.PI * 2; const l = pine ? 6 + R() * 8 : 7 + R() * 9;
    const gsh = pine ? 70 + R() * 40 : 95 + R() * 60; const rr = pine ? 30 + R() * 25 : 60 + R() * 45; const b = pine ? 30 + R() * 25 : 25 + R() * 30;
    const lw = pine ? 1.5 + R() * 1.5 : 3 + R() * 3;
    g.strokeStyle = `rgb(${rr | 0},${gsh | 0},${b | 0})`; g.lineWidth = lw; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    ag.strokeStyle = '#ffffff'; ag.lineWidth = lw; ag.lineCap = 'round';
    ag.beginPath(); ag.moveTo(x, y); ag.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ag.stroke();
  }
  const map = finish(c); const alphaMap = finish(ac, { srgb: false });
  return { map, alphaMap };
}

/**
 * Pale cast-in-place concrete (terrace risers, floor bands, retaining walls, kerbs).
 * Deliberately a canvas texture: the Poly Haven concrete_wall diffuse is a dark brown-grey that goes
 * black on any surface facing away from the sun. 512 px = 2 m. Returns { map, normalMap }.
 */
export function castConcreteTexture(R, { base = '#c6c3ba', joints = true } = {}) {
  const S = 512; const [c, g] = canvas(S, S);
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {                                   // pour/board mottling
    const x = R() * S, y = R() * S, r = 20 + R() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const d = R() < 0.5;
    gr.addColorStop(0, `rgba(${d ? 150 : 225},${d ? 148 : 222},${d ? 140 : 212},${0.08 + R() * 0.16})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 16000; i++) { const d = R() < 0.5; g.fillStyle = `rgba(${d ? 70 : 245},${d ? 68 : 242},${d ? 60 : 232},${R() * 0.14})`; g.fillRect(R() * S, R() * S, 1 + R() * 2, 1 + R() * 2); }
  for (let i = 0; i < 26; i++) { const x = R() * S; const gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, `rgba(80,74,64,${0.04 + R() * 0.09})`); gr.addColorStop(1, 'rgba(80,74,64,0)'); g.fillStyle = gr; g.fillRect(x, 0, 2 + R() * 7, S); }
  // form-board joints every 1 m
  if (joints) {
    g.fillStyle = 'rgba(96,92,82,0.42)'; for (let y = 0; y < S; y += S / 2) g.fillRect(0, y, S, 2.5);
    g.fillStyle = 'rgba(240,238,230,0.30)'; for (let y = 0; y < S; y += S / 2) g.fillRect(0, y + 2.5, S, 1.5);
  }
  const map = finish(c);
  const [nc, ng] = canvas(S, S); ng.fillStyle = '#8080ff'; ng.fillRect(0, 0, S, S);
  if (joints) for (let y = 0; y < S; y += S / 2) { ng.fillStyle = '#80a0ff'; ng.fillRect(0, y, S, 2); ng.fillStyle = '#8060ff'; ng.fillRect(0, y + 2, S, 2); }
  return { map, normalMap: finish(nc, { srgb: false }) };
}

/** Mottled tree bark: warm grey-brown (#7a7062) with vertical fissures and lichen patches. 512 px = 1.6 m. */
export function barkTexture(R) {
  const S = 512; const [c, g] = canvas(S, S);
  g.fillStyle = '#7a7062'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {                                    // vertical fissures
    const x = R() * S, w = 2 + R() * 9, y0 = R() * S, h = 60 + R() * 420;
    const d = 0.35 + R() * 0.45;
    const gr = g.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, `rgba(48,42,34,0)`); gr.addColorStop(0.5, `rgba(48,42,34,${d})`); gr.addColorStop(1, `rgba(48,42,34,0)`);
    g.fillStyle = gr; g.fillRect(x, y0, w, h);
    g.fillStyle = `rgba(190,182,166,${d * 0.4})`; g.fillRect(x + w, y0, 1.5, h);
  }
  for (let i = 0; i < 90; i++) {                                     // lichen / pale patches
    const x = R() * S, y = R() * S, r = 6 + R() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${150 + R() * 40 | 0},${152 + R() * 40 | 0},${126 + R() * 30 | 0},${0.12 + R() * 0.2})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 14000; i++) { const d = R() < 0.55; g.fillStyle = `rgba(${d ? 40 : 200},${d ? 36 : 194},${d ? 28 : 176},${R() * 0.22})`; g.fillRect(R() * S, R() * S, 1 + R() * 2, 1 + R() * 3); }
  const map = finish(c);
  const [nc, ng] = canvas(S, S); ng.fillStyle = '#8080ff'; ng.fillRect(0, 0, S, S);
  for (let i = 0; i < 200; i++) { const x = R() * S, w = 3 + R() * 8, y0 = R() * S, h = 80 + R() * 380; ng.fillStyle = '#5a80ff'; ng.fillRect(x, y0, w / 2, h); ng.fillStyle = '#a680ff'; ng.fillRect(x + w / 2, y0, w / 2, h); }
  return { map, normalMap: finish(nc, { srgb: false }) };
}

/** Hedge foliage: dense small leaves, dark green (#3d5a2a) with sun-bleached tops. 512 px = 1.2 m. */
export function hedgeTexture(R) {
  const S = 512; const [c, g] = canvas(S, S);
  g.fillStyle = '#2d431e'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 5200; i++) {
    const x = R() * S, y = R() * S, a = R() * Math.PI * 2, l = 5 + R() * 11, w = 2 + R() * 3.5;
    const v = R();
    g.strokeStyle = `rgba(${(45 + v * 46) | 0},${(74 + v * 52) | 0},${(28 + v * 30) | 0},${0.6 + R() * 0.4})`;
    g.lineWidth = w; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  for (let i = 0; i < 70; i++) { const x = R() * S, y = R() * S, r = 10 + R() * 40; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(8,16,6,${0.2 + R() * 0.3})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  return finish(c);
}

/** Grass clump card: opaque colour bed + separate alpha (no black mip halo). */
export function grassCardTexture(R) {
  const S = 256; const [c, g] = canvas(S, S); const [ac, ag] = canvas(S, S);
  g.fillStyle = '#79934a'; g.fillRect(0, 0, S, S);
  ag.fillStyle = '#000000'; ag.fillRect(0, 0, S, S);
  for (let i = 0; i < 150; i++) {
    const x0 = S * (0.14 + R() * 0.72), lean = (R() - 0.5) * 74, h = S * (0.4 + R() * 0.58);
    const v = R(), lw = 2.6 + R() * 3.2;
    g.strokeStyle = `rgb(${(74 + v * 48) | 0},${(106 + v * 64) | 0},${(44 + v * 32) | 0})`;
    g.lineWidth = lw; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, S); g.quadraticCurveTo(x0 + lean * 0.35, S - h * 0.6, x0 + lean, S - h); g.stroke();
    ag.strokeStyle = '#ffffff'; ag.lineWidth = lw; ag.lineCap = 'round';
    ag.beginPath(); ag.moveTo(x0, S); ag.quadraticCurveTo(x0 + lean * 0.35, S - h * 0.6, x0 + lean, S - h); ag.stroke();
  }
  return { map: finish(c, { wrap: false }), alphaMap: finish(ac, { srgb: false, wrap: false }) };
}

/** Contact-occlusion gradient: opaque-ish dark at v=0 fading to white at v=1 (used with MultiplyBlending). */
export function aoGradTexture(dark = 0.45) {
  const [c, g] = canvas(8, 128);
  const gr = g.createLinearGradient(0, 127, 0, 0);
  const d = Math.round(255 * (1 - dark));
  gr.addColorStop(0, `rgb(${d},${d},${d})`); gr.addColorStop(0.35, `rgb(${(d + (255 - d) * 0.45) | 0},${(d + (255 - d) * 0.45) | 0},${(d + (255 - d) * 0.45) | 0})`); gr.addColorStop(1, 'rgb(255,255,255)');
  g.fillStyle = gr; g.fillRect(0, 0, 8, 128);
  const t = finish(c, { wrap: false }); t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
/** Radial contact shadow disc (MultiplyBlending). */
export function aoDiscTexture(dark = 0.5) {
  const S = 128; const [c, g] = canvas(S, S);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  const d = Math.round(255 * (1 - dark));
  gr.addColorStop(0, `rgb(${d},${d},${d})`); gr.addColorStop(0.45, `rgb(${(d + (255 - d) * 0.5) | 0},${(d + (255 - d) * 0.5) | 0},${(d + (255 - d) * 0.5) | 0})`); gr.addColorStop(1, 'rgb(255,255,255)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const t = finish(c, { wrap: false }); t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

/** Distant tree-line silhouette strip (alpha), `variant` picks the skyline profile. */
export function treelineTexture(R, variant = 0) {
  const W = 1024, H = 256; const [c, g] = canvas(W, H); g.clearRect(0, 0, W, H);
  const base = H - 4;
  const cols = [['#3f5236', '#4b6140'], ['#3a4b33', '#46583c'], ['#44553a', '#51684a']][variant % 3];
  for (let pass = 0; pass < 2; pass++) {
    g.fillStyle = cols[pass];
    let x = -20;
    while (x < W + 20) {
      const w = 26 + R() * 74, h = (pass ? 70 : 110) * (0.55 + R() * 0.9);
      const conif = R() < (variant === 1 ? 0.7 : 0.35);
      g.beginPath();
      if (conif) { g.moveTo(x, base); g.lineTo(x + w / 2, base - h * 1.25); g.lineTo(x + w, base); }
      else { g.moveTo(x, base); g.bezierCurveTo(x - w * 0.15, base - h * 0.8, x + w * 0.2, base - h, x + w * 0.5, base - h); g.bezierCurveTo(x + w * 0.8, base - h, x + w * 1.15, base - h * 0.8, x + w, base); }
      g.closePath(); g.fill();
      x += w * (0.45 + R() * 0.4);
    }
  }
  g.fillStyle = cols[0]; g.fillRect(0, base - 6, W, 10);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping; return t;
}

/** Baked window-strip band for buildings read at distance (no thin mullion geometry → no shimmer). */
export function windowStripTexture(R, { wall = '#c9c1b1', glass = '#4d6068', lit = '#c6b389' } = {}) {
  const W = 512, H = 128; const [c, g] = canvas(W, H);
  g.fillStyle = wall; g.fillRect(0, 0, W, H);
  const n = 12, pad = W / n * 0.18;
  for (let i = 0; i < n; i++) {
    const x = i * W / n + pad, w = W / n - pad * 2;
    g.fillStyle = R() < 0.22 ? lit : glass; g.fillRect(x, H * 0.18, w, H * 0.6);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x, H * 0.18, w, 5);
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x, H * 0.75, w, 4);
  }
  for (let i = 0; i < 2500; i++) { const d = R() < 0.5; g.fillStyle = `rgba(${d ? 50 : 240},${d ? 46 : 234},${d ? 38 : 222},${R() * 0.12})`; g.fillRect(R() * W, R() * H, 1 + R() * 2, 1 + R() * 2); }
  return finish(c);
}

/** Bus livery side panel: fictional transit branding. */
export function busSideTexture({ text = 'CAMPUS TRANSIT', route = 'ROUTE 5 · INNER LOOP' } = {}) {
  const W = 1024, H = 256; const [c, g] = canvas(W, H);
  g.fillStyle = '#eceae4'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#1e3f7a'; g.fillRect(0, H * 0.62, W, H * 0.22);
  g.fillStyle = '#9b1b2a'; g.fillRect(0, H * 0.84, W, H * 0.06);
  g.fillStyle = '#1e3f7a'; g.font = 'bold 74px Helvetica, Arial, sans-serif'; g.textBaseline = 'middle';
  g.fillText(text, 46, H * 0.3);
  g.fillStyle = '#f2f0ea'; g.font = 'bold 34px Helvetica, Arial, sans-serif';
  g.fillText(route, 46, H * 0.73);
  return finish(c, { wrap: false });
}

/** Campus wayfinding / building sign: red panel with white text (generic). */
export function signTexture({ text = 'ACADEMIC MALL', sub = null, w = 512, h = 128, bg = '#9b1b2a', fg = '#f4efe6', font = 'bold 60px Helvetica, Arial, sans-serif' } = {}) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, sub ? h * 0.36 : h / 2);
  if (sub) { g.font = `${Math.round(h * 0.2)}px Helvetica, Arial, sans-serif`; g.fillText(sub, w / 2, h * 0.74); }
  return finish(c, { wrap: false });
}

/** Facade lettering (dark text on transparent). */
export function letteringTexture({ text = 'LIBRARY', w = 1024, h = 128, color = '#2a2d31', font = null } = {}) {
  const [c, g] = canvas(w, h); g.clearRect(0, 0, w, h);
  let px = Math.round(h * 0.72); g.font = font || `bold ${px}px Helvetica, Arial, sans-serif`;
  if (!font) { const tw = g.measureText(text).width; if (tw > w * 0.94) { px = Math.floor(px * w * 0.94 / tw); g.font = `bold ${px}px Helvetica, Arial, sans-serif`; } }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(text, w / 2 + px * 0.04, h / 2 + px * 0.04);   // offset shadow
  g.fillStyle = color; g.fillText(text, w / 2, h / 2);
  return finish(c, { wrap: false });
}

/** Crosswalk / road-marking free: plain white paint. */
export function makeMats(world) {
  const { ctx, R } = world;
  const aniso = Math.min(16, ctx.renderer?.capabilities?.getMaxAnisotropy?.() ?? 8);
  const sets = {};
  const set = (key, id, res, { arm = true } = {}) => {
    if (sets[key]) return sets[key];
    const p = (m) => `${id}_${m}_${res}.jpg`;
    const s = { map: tex(p('Diffuse'), { srgb: true, aniso }), normalMap: tex(p('nor_gl'), { aniso }), arm: arm ? tex(p('arm'), { aniso }) : null };
    sets[key] = s; return s;
  };
  const pbr = (key, id, res, { color = 0xffffff, roughness = 1, metalness = 0, normalScale = 1, envMapIntensity = 0.6, grime = null, arm = true, ...rest } = {}) => {
    const s = set(key, id, res, { arm });
    const m = new THREE.MeshStandardMaterial({
      color, map: s.map, normalMap: s.normalMap, normalScale: new THREE.Vector2(normalScale, normalScale),
      ...(s.arm ? { aoMap: s.arm, aoMapIntensity: 1, roughnessMap: s.arm, metalnessMap: s.arm, roughness: 1, metalness: 1 } : { roughness, metalness }),
      envMapIntensity, ...rest,
    });
    m.name = key;
    if (grime) addGrime(m, R, { key, ...grime });
    return m;
  };
  const plain = (key, color, { roughness = 0.8, metalness = 0, envMapIntensity = 0.6, ...rest } = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity, name: key, ...rest }); return m; };

  const M = {}; M.uvScale = {}; M.surface = {}; M.noShadow = {};
  const reg = (key, mat, surface, uvScale) => { M[key] = mat; M.surface[key] = surface; M.uvScale[key] = uvScale; return mat; };

  // ---- ground -------------------------------------------------------------------------------
  reg('grass', pbr('grass', 'wsp_grass', '1k', { color: 0x86a05c, normalScale: 0.8, arm: false, roughness: 0.95, envMapIntensity: 0.3 }), 'ground', 1 / 2.5);
  reg('hex', new THREE.MeshStandardMaterial({ map: hexPaverTexture(R), color: 0xc6c8c6, roughness: 0.9, metalness: 0, envMapIntensity: 0.5, name: 'hex' }), 'concrete', 1 / 2);
  reg('brickPav', pbr('brickPav', 'wsp_brick', '1k', { color: 0x9a6a58, normalScale: 0.7, arm: false, roughness: 0.9, envMapIntensity: 0.4 }), 'concrete', 1 / 1.2);
  reg('concretePav', pbr('concretePav', 'concrete_floor_02', '1k', { color: 0xb4b6b8, normalScale: 0.5, grime: { strength: 0.3, height: 0.2, wet: 0, tint: [0.46, 0.46, 0.45] } }), 'concrete', 1 / 3);
  reg('asphalt', pbr('asphalt', 'asphalt_02', '2k', { color: 0x8f8f8d, normalScale: 0.6, envMapIntensity: 0.5 }), 'concrete', 1 / 5);
  reg('cobble', new THREE.MeshStandardMaterial({ map: cobbleTexture(R), color: 0xd6d2ca, roughness: 0.9, envMapIntensity: 0.4, name: 'cobble' }), 'concrete', 1 / 1.5);
  reg('curb', plain('curb', 0xb9b6ae, { roughness: 0.85 }), 'concrete', 0.5);
  reg('paint', plain('paint', 0xe8e6df, { roughness: 0.7 }), 'concrete', 0.5);
  reg('paintY', plain('paintY', 0xd9b23a, { roughness: 0.7 }), 'concrete', 0.5);
  reg('zebra', new THREE.MeshStandardMaterial({ map: zebraTexture(R), roughness: 0.85, name: 'zebra' }), 'concrete', 1 / 2);
  reg('water', new THREE.MeshStandardMaterial({ color: 0x3e5a5a, roughness: 0.05, metalness: 0.6, envMapIntensity: 1.4, transparent: true, opacity: 0.86, name: 'water' }), 'water', 0.2);
  reg('mud', plain('mud', 0x4a3f33, { roughness: 1 }), 'ground', 0.5);
  reg('ivy', pbr('ivy', 'wsp_grass', '1k', { color: 0x4a6a34, normalScale: 1.2, arm: false, roughness: 1, envMapIntensity: 0.2 }), 'ground', 1 / 1.2);
  reg('mulch', plain('mulch', 0x5a4331, { roughness: 1 }), 'ground', 0.5);
  // ---- buildings -----------------------------------------------------------------------------
  const rib = ribbedConcreteTexture(R);
  reg('ribbed', new THREE.MeshStandardMaterial({ map: rib.map, normalMap: rib.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), color: 0xd3cbbd, roughness: 0.92, envMapIntensity: 0.5, name: 'ribbed' }), 'concrete', 1 / 2);
  addGrime(M.ribbed, R, { key: 'ribbed', strength: 0.5, height: 2.5, wet: 0, tint: [0.45, 0.42, 0.37] });
  reg('precast', new THREE.MeshStandardMaterial({ map: precastTexture(R), color: 0xcdc4b4, roughness: 0.88, envMapIntensity: 0.55, name: 'precast' }), 'concrete', 1 / 4);
  addGrime(M.precast, R, { key: 'precast', strength: 0.4, height: 2.2, wet: 0, tint: [0.45, 0.42, 0.37] });
  reg('precastDark', new THREE.MeshStandardMaterial({ map: M.precast.map, color: 0xa79d8e, roughness: 0.9, envMapIntensity: 0.45, name: 'precastDark' }), 'concrete', 1 / 4);
  reg('slit', new THREE.MeshStandardMaterial({ map: slitWindowTexture(R), color: 0xc8bcaa, roughness: 0.85, envMapIntensity: 0.5, name: 'slit' }), 'concrete', 1 / 4.2);
  reg('concrete', pbr('concrete', 'concrete_wall_006', '1k', { color: 0xd6d0c6, normalScale: 0.6, grime: { strength: 0.5, height: 2.0, wet: 0, tint: [0.42, 0.4, 0.35] } }), 'concrete', 1 / 2.5);
  reg('concreteGrey', pbr('concreteGrey', 'concrete_wall_006', '1k', { color: 0xbdbab3, normalScale: 0.6 }), 'concrete', 1 / 2.5);
  reg('brickRed', pbr('brickRed', 'factory_brick', '1k', { color: 0xc9887a, normalScale: 0.9, grime: { strength: 0.45, height: 1.8, wet: 0, tint: [0.4, 0.33, 0.28] } }), 'concrete', 1 / 1.6);
  reg('brickBrown', pbr('brickBrown', 'rail_church_bricks_03', '1k', { color: 0x6e5245, normalScale: 0.9, grime: { strength: 0.45, height: 2, wet: 0, tint: [0.35, 0.3, 0.26] } }), 'concrete', 1 / 1.6);
  reg('brickDark', pbr('brickDark', 'factory_brick', '1k', { color: 0x5a3d35, normalScale: 0.9 }), 'concrete', 1 / 1.6);
  reg('brickStaller', pbr('brickStaller', 'factory_brick', '1k', { color: 0x9c7a62, normalScale: 0.9, grime: { strength: 0.4, height: 2, wet: 0, tint: [0.35, 0.3, 0.26] } }), 'concrete', 1 / 1.6);
  reg('stucco', pbr('stucco', 'concrete_wall_006', '1k', { color: 0xc9c2b4, normalScale: 0.3, roughness: 0.8, grime: { strength: 0.35, height: 2.5, wet: 0, tint: [0.4, 0.38, 0.34] } }), 'concrete', 1 / 4);
  reg('stuccoLight', pbr('stuccoLight', 'concrete_wall_006', '1k', { color: 0xbdb9b0, normalScale: 0.3 }), 'concrete', 1 / 4);   // (both retextured with the pale render coat below)
  reg('glass', plain('glass', 0x5c7a74, { roughness: 0.04, metalness: 0.95, envMapIntensity: 1.2 }), 'metal', 0.5);
  reg('glassLit', plain('glassLit', 0x5f746e, { roughness: 0.05, metalness: 0.9, envMapIntensity: 1.0, emissive: 0xffd9a0, emissiveIntensity: 0.14 }), 'metal', 0.5);
  reg('granite', pbr('granite', 'cracked_concrete', '1k', { color: 0xcfcabe, normalScale: 1.6, envMapIntensity: 0.4 }), 'concrete', 1 / 1.2);
  reg('graniteCap', plain('graniteCap', 0x7d7a74, { roughness: 0.8 }), 'concrete', 0.5);
  reg('cobbleWet', new THREE.MeshStandardMaterial({ map: cobbleTexture(R, { dark: true }), color: 0xffffff, roughness: 0.35, metalness: 0.05, envMapIntensity: 0.8, name: 'cobbleWet' }), 'concrete', 1 / 1.5);
  reg('terrazzo', pbr('terrazzo', 'concrete_floor_02', '1k', { color: 0xa9a6a0, normalScale: 0.3, envMapIntensity: 0.6 }), 'concrete', 1 / 2);
  reg('fascia', plain('fascia', 0xd2d2ce, { roughness: 0.5, metalness: 0.15, envMapIntensity: 0.6 }), 'metal', 0.5);
  reg('parapetMetal', plain('parapetMetal', 0xb9b9b4, { roughness: 0.4, metalness: 0.35, envMapIntensity: 0.7 }), 'metal', 0.5);
  reg('gravelRoof', pbr('gravelRoof', 'rail_gravel_road', '2k', { color: 0x8e8a80, normalScale: 0.7, envMapIntensity: 0.25 }), 'concrete', 1 / 3);
  reg('hvac', plain('hvac', 0x9a9c98, { roughness: 0.6, metalness: 0.5, envMapIntensity: 0.6 }), 'metal', 0.5);
  reg('redSteel', plain('redSteel', 0xc8262a, { roughness: 0.45, metalness: 0.4, envMapIntensity: 0.7 }), 'metal', 0.5);
  reg('glassDark', plain('glassDark', 0x3f5250, { roughness: 0.06, metalness: 0.95, envMapIntensity: 1.1 }), 'metal', 0.5);
  reg('glassLight', plain('glassLight', 0x6f8f8a, { roughness: 0.05, metalness: 0.9, envMapIntensity: 1.2 }), 'metal', 0.5);
  reg('glassRed', plain('glassRed', 0x8c1a22, { roughness: 0.12, metalness: 0.85, envMapIntensity: 1.2 }), 'metal', 0.5);
  reg('white', plain('white', 0xdedcd6, { roughness: 0.55, metalness: 0.15, envMapIntensity: 0.6 }), 'metal', 0.5);
  reg('whiteMullion', plain('whiteMullion', 0xd9d8d2, { roughness: 0.45, metalness: 0.3, envMapIntensity: 0.7 }), 'metal', 0.5);
  reg('darkMullion', plain('darkMullion', 0x2a2c2e, { roughness: 0.5, metalness: 0.5, envMapIntensity: 0.6 }), 'metal', 0.5);
  reg('red', plain('red', 0xb3232c, { roughness: 0.5, metalness: 0.3, envMapIntensity: 0.7 }), 'metal', 0.5);
  reg('steel', plain('steel', 0x8e9296, { roughness: 0.45, metalness: 0.85, envMapIntensity: 0.9 }), 'metal', 0.5);
  reg('steelDark', plain('steelDark', 0x2f3234, { roughness: 0.55, metalness: 0.7, envMapIntensity: 0.7 }), 'metal', 0.5);
  reg('alu', plain('alu', 0xb9bcbe, { roughness: 0.35, metalness: 0.9, envMapIntensity: 1.0 }), 'metal', 0.5);
  reg('roof', pbr('roof', 'rail_gravel_road', '2k', { color: 0x8e8a80, normalScale: 0.7, envMapIntensity: 0.25 }), 'concrete', 1 / 3);
  reg('roofMetal', pbr('roofMetal', 'corrugated_iron_02', '2k', { color: 0x9a9c9c, normalScale: 0.8, envMapIntensity: 0.6 }), 'metal', 1 / 2);
  reg('bench', plain('bench', 0x23262a, { roughness: 0.6, metalness: 0.5 }), 'wood', 0.5);
  reg('binGreen', plain('binGreen', 0x1f4a2e, { roughness: 0.6, metalness: 0.4 }), 'metal', 0.5);
  reg('binBlue', plain('binBlue', 0x1e3f8a, { roughness: 0.6, metalness: 0.4 }), 'metal', 0.5);
  reg('bark', pbr('bark', 'rail_dark_wooden_planks', '1k', { color: 0xb3a898, normalScale: 0.8, envMapIntensity: 0.3 }), 'wood', 1 / 1.5);
  reg('hedge', pbr('hedge', 'wsp_grass', '1k', { color: 0x5a7a40, normalScale: 1.2, arm: false, roughness: 1, envMapIntensity: 0.2 }), 'ground', 1 / 1.0);
  reg('black', plain('black', 0x141414, { roughness: 0.9 }), 'metal', 0.5);
  reg('rubber', plain('rubber', 0x1a1a1a, { roughness: 0.95 }), 'metal', 0.5);
  reg('bus', plain('bus', 0xe8e8e4, { roughness: 0.45, metalness: 0.3, envMapIntensity: 0.9 }), 'metal', 0.5);
  reg('busBlue', plain('busBlue', 0x1f3f7a, { roughness: 0.45, metalness: 0.3, envMapIntensity: 0.9 }), 'metal', 0.5);
  reg('chrome', plain('chrome', 0xcfd3d6, { roughness: 0.2, metalness: 1, envMapIntensity: 1.2 }), 'metal', 0.5);
  reg('lampHead', plain('lampHead', 0xe9eef2, { roughness: 0.4, metalness: 0.2, emissive: 0x556066, emissiveIntensity: 0.2 }), 'metal', 0.5);
  reg('banner', plain('banner', 0x9b1b2a, { roughness: 0.8, side: THREE.DoubleSide }), 'wood', 0.5);
  reg('cream', plain('cream', 0xd8cfbd, { roughness: 0.85 }), 'concrete', 0.5);

  // ---- critic r2 additions ---------------------------------------------------------------------
  // pale cast-in-place concrete for terrace risers / retaining walls / floor bands (never unlit black)
  const cast = castConcreteTexture(R);
  const rendercoat = castConcreteTexture(R, { base: '#cbc6bb', joints: false });
  for (const [key, col] of [['concrete', 0xd2ccc0], ['concreteGrey', 0xc0bcb2], ['stucco', 0xcac4b6], ['stuccoLight', 0xc2beb4]]) {
    M[key].map = rendercoat.map; M[key].color.setHex(col); M[key].envMapIntensity = 0.75;
    M[key].aoMap = null; M[key].roughnessMap = null; M[key].metalnessMap = null; M[key].roughness = 0.88; M[key].metalness = 0;
    M.uvScale[key] = 1 / 3; M[key].needsUpdate = true;
  }
  reg('riser', new THREE.MeshStandardMaterial({ map: cast.map, normalMap: cast.normalMap, normalScale: new THREE.Vector2(0.5, 0.5), color: 0xb5b2aa, roughness: 0.85, metalness: 0, envMapIntensity: 0.8, name: 'riser' }), 'concrete', 1 / 2);
  reg('nosing', new THREE.MeshStandardMaterial({ map: cast.map, color: 0xcfccc3, roughness: 0.8, metalness: 0, envMapIntensity: 0.85, name: 'nosing' }), 'concrete', 1 / 2);
  reg('floorBand', new THREE.MeshStandardMaterial({ map: cast.map, color: 0xa9a49a, roughness: 0.82, metalness: 0, envMapIntensity: 0.7, name: 'floorBand' }), 'concrete', 1 / 3);
  // taupe stucco (arts & culture centre) — flat render coat, no brick
  reg('stuccoTaupe', new THREE.MeshStandardMaterial({ map: rendercoat.map, color: 0x8a8478, roughness: 0.8, metalness: 0, envMapIntensity: 0.8, name: 'stuccoTaupe' }), 'concrete', 1 / 5);
  reg('stuccoTaupeDark', new THREE.MeshStandardMaterial({ map: rendercoat.map, color: 0x6e6a60, roughness: 0.82, metalness: 0, envMapIntensity: 0.7, name: 'stuccoTaupeDark' }), 'concrete', 1 / 5);
  // granite retaining wall / kerb where lawn meets paving
  reg('graniteWall', new THREE.MeshStandardMaterial({ map: cobbleTexture(R), color: 0xb9b5ac, roughness: 0.82, metalness: 0, envMapIntensity: 0.7, name: 'graniteWall' }), 'concrete', 1 / 1.4);
  // real hedge foliage
  { const ht = hedgeTexture(R); reg('hedgeLeaf', new THREE.MeshStandardMaterial({ map: ht, color: 0x3d5a2a, roughness: 0.9, metalness: 0, envMapIntensity: 0.22, name: 'hedgeLeaf' }), 'ground', 1 / 1.2); }
  // soot / rain staining under window sills (flat transparent overlay on the wall face)
  reg('sillStain', new THREE.MeshStandardMaterial({ color: 0x2e2a24, roughness: 0.95, transparent: true, opacity: 0.35, depthWrite: false, name: 'sillStain' }), 'concrete', 0.5);
  M.noShadow.sillStain = true;
  // baked window strip for buildings only ever read at distance (kills mullion shimmer)
  reg('windowStrip', new THREE.MeshStandardMaterial({ map: windowStripTexture(R), color: 0xffffff, roughness: 0.55, metalness: 0.2, envMapIntensity: 0.7, name: 'windowStrip' }), 'concrete', 1 / 8);
  reg('windowStripBrick', new THREE.MeshStandardMaterial({ map: windowStripTexture(R, { wall: '#7d5c47', glass: '#3f5158', lit: '#c8b489' }), color: 0xffffff, roughness: 0.65, metalness: 0.15, envMapIntensity: 0.6, name: 'windowStripBrick' }), 'concrete', 1 / 8);
  // bus body panels
  reg('busSkin', new THREE.MeshStandardMaterial({ map: busSideTexture(), color: 0xffffff, roughness: 0.4, metalness: 0.3, envMapIntensity: 0.9, name: 'busSkin' }), 'metal', 1);
  reg('busGlass', plain('busGlass', 0x2b3a3c, { roughness: 0.08, metalness: 0.9, envMapIntensity: 1.1 }), 'metal', 0.5);
  reg('tailLight', plain('tailLight', 0x8c1418, { roughness: 0.35, metalness: 0.2, emissive: 0x9a1418, emissiveIntensity: 0.5 }), 'metal', 0.5);
  reg('mulchDark', plain('mulchDark', 0x3f3025, { roughness: 1, envMapIntensity: 0.2 }), 'ground', 0.5);
  M.noShadow.sillStain = true;

  // mottled bark (replaces the near-black plank texture)
  { const bk = barkTexture(R); M.bark.map = bk.map; M.bark.normalMap = bk.normalMap; M.bark.color.set(0xffffff); M.bark.roughness = 1; M.bark.metalness = 0; M.bark.aoMap = null; M.bark.roughnessMap = null; M.bark.metalnessMap = null; M.bark.envMapIntensity = 0.3; M.uvScale.bark = 1 / 1.6; M.bark.needsUpdate = true; }
  // alpha-tested grass clump cards
  { const gc = grassCardTexture(R); M.grassCard = new THREE.MeshLambertMaterial({ map: gc.map, alphaMap: gc.alphaMap, color: 0xa8a878, alphaTest: 0.4, side: THREE.DoubleSide, name: 'grassCard' });
    // tufts are lit like the lawn they sit on (normal bent to +Y): upright cards facing the sun glowed neon against the flat lawn
    M.grassCard.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(mix(normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), normal, 0.2));'); }; M.grassCard.customProgramCacheKey = () => 'sbu-grasscard'; }
  M.surface.grassCard = 'ground'; M.uvScale.grassCard = 1;
  // baked contact occlusion (multiply blend over the ground)
  M.aoEdge = new THREE.MeshBasicMaterial({ map: aoGradTexture(0.5), transparent: true, premultipliedAlpha: true, blending: THREE.MultiplyBlending, depthWrite: false, fog: false, name: 'aoEdge' });
  M.aoDisc = new THREE.MeshBasicMaterial({ map: aoDiscTexture(0.5), transparent: true, premultipliedAlpha: true, blending: THREE.MultiplyBlending, depthWrite: false, fog: false, name: 'aoDisc' });
  M.treeline = [0, 1, 2].map(v => new THREE.MeshBasicMaterial({ map: treelineTexture(R, v), transparent: true, alphaTest: 0.28, side: THREE.DoubleSide, fog: true, color: 0x93a68e, name: 'treeline' + v }));

  // macro luminance variation so tiling doesn't read.
  // ground: ±9 % at ~20 m + ~5 m. walls: ±10 % at 4 m in all three axes (brick/stucco/precast patchiness).
  const macro = (m, tag, code) => {
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMPos;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vMPos;
        float mh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float mn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(mh(i), mh(i + vec2(1, 0)), f.x), mix(mh(i + vec2(0, 1)), mh(i + vec2(1, 1)), f.x), f.y); }`)
        .replace('#include <map_fragment>', `#include <map_fragment>\n${code}`);
    };
    const pk = m.customProgramCacheKey; m.customProgramCacheKey = () => (pk ? pk.call(m) : '') + '|' + tag;
  };
  const GROUND_MACRO = `{ float v = mn(vMPos.xz * 0.05) * 0.5 + mn(vMPos.xz * 0.125) * 0.3 + mn(vMPos.xz * 0.21) * 0.2; diffuseColor.rgb *= 0.91 + 0.17 * v; }`;
  // 4 m macro patches (±10 %) + faint vertical weathering that darkens toward the top of each 4 m band
  const WALL_MACRO = `{
        float v = mn(vMPos.xz * 0.25) * 0.55 + mn(vec2(vMPos.y, vMPos.x + vMPos.z) * 0.25) * 0.45;
        float course = mn(vec2(floor(vMPos.y * 0.25), 3.7)) ;
        diffuseColor.rgb *= 0.90 + 0.20 * v;
        diffuseColor.rgb *= 0.96 + 0.08 * course;
      }`;
  for (const m of [M.hex, M.grass, M.asphalt, M.concretePav, M.cobble]) macro(m, 'gmacro', GROUND_MACRO);
  for (const m of [M.brickRed, M.brickBrown, M.brickDark, M.brickStaller, M.precast, M.precastDark, M.stucco, M.stuccoLight, M.stuccoTaupe, M.concrete, M.concreteGrey, M.ribbed, M.riser, M.floorBand, M.graniteWall])
    macro(m, 'wmacro', WALL_MACRO);
  return M;
}
