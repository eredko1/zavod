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

/** Leaf clump alpha texture (deciduous / pine). */
export function leafTexture(R, { pine = false } = {}) {
  const S = 256; const [c, g] = canvas(S, S); g.clearRect(0, 0, S, S);
  const n = pine ? 2600 : 520;
  for (let i = 0; i < n; i++) {
    const x = R() * S, y = R() * S; const a = R() * Math.PI * 2; const l = pine ? 6 + R() * 8 : 7 + R() * 9;
    const gsh = pine ? 70 + R() * 40 : 95 + R() * 60; const rr = pine ? 30 + R() * 25 : 60 + R() * 45; const b = pine ? 30 + R() * 25 : 25 + R() * 30;
    g.strokeStyle = `rgba(${rr | 0},${gsh | 0},${b | 0},${0.85 + R() * 0.15})`; g.lineWidth = pine ? 1.5 + R() * 1.5 : 3 + R() * 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
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
  reg('concretePav', pbr('concretePav', 'concrete_floor_02', '1k', { color: 0xd3cfc6, normalScale: 0.5, grime: { strength: 0.3, height: 0.2, wet: 0, tint: [0.5, 0.48, 0.44] } }), 'concrete', 1 / 3);
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
  reg('stuccoLight', pbr('stuccoLight', 'concrete_wall_006', '1k', { color: 0xbdb9b0, normalScale: 0.3 }), 'concrete', 1 / 4);
  reg('glass', plain('glass', 0x5c7a74, { roughness: 0.04, metalness: 0.95, envMapIntensity: 1.2 }), 'metal', 0.5);
  reg('glassLit', plain('glassLit', 0x5f746e, { roughness: 0.05, metalness: 0.9, envMapIntensity: 1.0, emissive: 0xffd9a0, emissiveIntensity: 0.14 }), 'metal', 0.5);
  reg('granite', pbr('granite', 'cracked_concrete', '1k', { color: 0xcfcabe, normalScale: 1.6, envMapIntensity: 0.4 }), 'concrete', 1 / 1.2);
  reg('graniteCap', plain('graniteCap', 0xa8a294, { roughness: 0.75 }), 'concrete', 0.5);
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

  // macro luminance variation (±8 %, ~20 m) on ground materials so tiling doesn't read
  for (const m of [M.hex, M.grass, M.asphalt, M.concretePav, M.cobble]) {
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMPos;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vMPos;
        float mh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float mn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(mh(i), mh(i + vec2(1, 0)), f.x), mix(mh(i + vec2(0, 1)), mh(i + vec2(1, 1)), f.x), f.y); }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
        { float v = mn(vMPos.xz * 0.05) * 0.6 + mn(vMPos.xz * 0.21) * 0.4; diffuseColor.rgb *= 0.90 + 0.18 * v; }`);
    };
    const pk = m.customProgramCacheKey; m.customProgramCacheKey = () => (pk ? pk.call(m) : '') + '|macro';
  }
  return M;
}
