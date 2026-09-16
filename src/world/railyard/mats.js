// RAILYARD materials: Poly Haven PBR sets (rail_* + shared assets/textures), grayscale-tint variants, canvas textures. RAILYARD agent.
import * as THREE from 'three';
import { addGrime } from '../mats.js';

const BASE = './assets/textures/';
const loader = new THREE.TextureLoader();

/** Every material uses world-space UVs (see geo.worldUV) so a single texture instance (repeat 1) serves all meshes. */
function tex(file, { srgb = false, aniso = 8 } = {}) {
  const t = loader.load(BASE + file);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Load an image and hand back a luminance-normalised grayscale CanvasTexture once ready (for tinting painted metal). */
function grayTex(file, targets, aniso = 8) {
  const t = new THREE.Texture(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; t.colorSpace = THREE.SRGBColorSpace;
  new THREE.ImageLoader().load(BASE + file, (img) => {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height); const px = d.data; let sum = 0; const n = px.length / 4;
    for (let i = 0; i < px.length; i += 4) { const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; px[i] = px[i + 1] = px[i + 2] = l; sum += l; }
    const gain = 178 / Math.max(1, sum / n);
    for (let i = 0; i < px.length; i += 4) { const v = Math.min(255, px[i] * gain); px[i] = px[i + 1] = px[i + 2] = v; }
    g.putImageData(d, 0, 0);
    t.image = c; t.needsUpdate = true;
    for (const m of targets) { m.map = t; m.needsUpdate = true; }
  });
  return t;
}

export function makeMats(world) {
  const { ctx, R } = world;
  const aniso = Math.min(16, ctx.renderer?.capabilities?.getMaxAnisotropy?.() ?? 8);
  const sets = {};
  const set = (key, id, res) => {
    if (sets[key]) return sets[key];
    const p = (m) => `${id}_${m}_${res}.jpg`;
    const s = { map: tex(p('Diffuse'), { srgb: true, aniso }), normalMap: tex(p('nor_gl'), { aniso }), arm: tex(p('arm'), { aniso }) };
    sets[key] = s; return s;
  };
  /** PBR material; arm packs AO/rough/metal. */
  const pbr = (key, id, res, { color = 0xffffff, roughness = 1, metalness = 1, normalScale = 1, envMapIntensity = 1, grime = null, ...rest } = {}) => {
    const s = set(key, id, res);
    const m = new THREE.MeshStandardMaterial({
      color, map: s.map, normalMap: s.normalMap, normalScale: new THREE.Vector2(normalScale, normalScale),
      aoMap: s.arm, aoMapIntensity: 1, roughnessMap: s.arm, metalnessMap: s.arm, roughness, metalness, envMapIntensity, ...rest,
    });
    m.name = key;
    if (grime) addGrime(m, R, { key, ...grime });
    return m;
  };

  const M = {};
  // ---- ground / ballast ---------------------------------------------------------
  M.ballast = pbr('ballast', 'rail_gravel_stones', '2k', { color: 0xd6d2ca, normalScale: 0.9, envMapIntensity: 0.6 });
  M.dirt = pbr('dirt', 'rail_gravel_road', '2k', { color: 0xe4d9c6, normalScale: 0.8, envMapIntensity: 0.5 });
  M.asphalt = pbr('asphalt', 'worn_asphalt', '2k', { color: 0xb5b5b5, normalScale: 0.6, envMapIntensity: 0.6 });
  // ---- concrete -------------------------------------------------------------------
  M.concrete = pbr('concrete', 'concrete_floor_02', '1k', { color: 0xcfcbc3, normalScale: 0.6, envMapIntensity: 0.6, grime: { strength: 0.55, height: 1.4, wet: 0.0, tint: [0.45, 0.42, 0.36] } });
  M.concreteWall = pbr('concreteWall', 'concrete_wall_006', '1k', { color: 0xd4d0c8, normalScale: 0.7, envMapIntensity: 0.6, grime: { strength: 0.7, height: 2.2, wet: 0.0, tint: [0.4, 0.38, 0.33] } });
  M.concreteCracked = pbr('concreteCracked', 'cracked_concrete', '1k', { color: 0xc8c4bb, normalScale: 0.8, envMapIntensity: 0.6 });
  M.paintedConcrete = pbr('paintedConcrete', 'painted_concrete', '1k', { color: 0xd8d4cc, normalScale: 0.6, envMapIntensity: 0.6, grime: { strength: 0.6, height: 1.6, wet: 0.0 } });
  // ---- brick ------------------------------------------------------------------------
  M.brick = pbr('brick', 'rail_church_bricks_03', '1k', { color: 0xd9cfc4, normalScale: 0.9, envMapIntensity: 0.5, grime: { strength: 0.6, height: 2.0, wet: 0.0, tint: [0.35, 0.3, 0.26] } });
  M.brickDark = pbr('brickDark', 'factory_brick', '1k', { color: 0xc8bfb4, normalScale: 0.9, envMapIntensity: 0.5, grime: { strength: 0.5, height: 1.8, wet: 0.0 } });
  // ---- metals -----------------------------------------------------------------------
  M.steel = pbr('steel', 'rail_metal_plate_02', '1k', { color: 0x6d6a66, normalScale: 0.7, envMapIntensity: 0.9 });          // underframes, bogies, gantries
  M.steelDark = pbr('steelDark', 'rail_metal_plate_02', '1k', { color: 0x3b3a38, normalScale: 0.6, envMapIntensity: 0.8 });  // rails web, masts, fence posts
  M.railHead = new THREE.MeshStandardMaterial({ color: 0xb8b4ac, roughness: 0.32, metalness: 1.0, envMapIntensity: 1.2, name: 'railHead' }); // polished running surface
  M.rustSheet = pbr('rustSheet', 'rusty_metal_sheet', '1k', { color: 0xcfc6ba, normalScale: 0.8, envMapIntensity: 0.7 });
  M.rustPlate = pbr('rustPlate', 'rail_rusty_painted_metal', '1k', { color: 0xd8d2ca, normalScale: 0.8, envMapIntensity: 0.7, grime: { strength: 0.5, height: 2.4, wet: 0.0, tint: [0.4, 0.3, 0.22] } });
  M.metalPlate = pbr('metalPlate', 'metal_plate', '1k', { color: 0x9d9a94, normalScale: 0.7, envMapIntensity: 0.8 });
  M.grid = pbr('grid', 'rusty_metal_grid', '1k', { color: 0xa8a49e, normalScale: 0.6, envMapIntensity: 0.7 });
  M.corrugated = pbr('corrugated', 'corrugated_iron_02', '2k', { color: 0xc8c6c0, normalScale: 1.0, envMapIntensity: 0.8, grime: { strength: 0.45, height: 1.0, wet: 0.0 } });
  M.shutter = pbr('shutter', 'painted_metal_shutter', '1k', { color: 0xc9c5bd, normalScale: 0.9, envMapIntensity: 0.7, grime: { strength: 0.6, height: 2.0, wet: 0.0 } });
  // ---- wagon bodies (distinct texture sets = distinct colours) ----------------------
  M.wagonRed = pbr('wagonRed', 'rail_box_profile_metal_sheet', '1k', { color: 0xd9cbc1, normalScale: 1.0, envMapIntensity: 0.7, grime: { strength: 0.7, height: 2.6, wet: 0.0, tint: [0.35, 0.26, 0.2] } });
  M.wagonGreen = pbr('wagonGreen', 'rail_green_metal_rust', '1k', { color: 0xc4ccc0, normalScale: 0.9, envMapIntensity: 0.7, grime: { strength: 0.6, height: 2.6, wet: 0.0, tint: [0.35, 0.3, 0.22] } });
  M.wagonRust = pbr('wagonRust', 'rail_rusty_painted_metal', '1k', { color: 0xc9bfb3, normalScale: 0.9, envMapIntensity: 0.7, grime: { strength: 0.7, height: 2.6, wet: 0.0, tint: [0.36, 0.26, 0.18] } });
  M.wagonBlue = pbr('wagonBlue', 'rail_blue_metal_plate', '1k', { color: 0xbcc6d4, normalScale: 0.9, envMapIntensity: 0.7, grime: { strength: 0.65, height: 2.6, wet: 0.0, tint: [0.3, 0.3, 0.3] } });
  // tinted painted metal (grayscale corrugated base) for containers / boxcar colour variety
  const tint = (hex, key) => { const m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.62, metalness: 0.35, envMapIntensity: 0.7, name: key }); addGrime(m, R, { key, strength: 0.7, height: 2.4, wet: 0.0, tint: [0.4, 0.33, 0.26] }); return m; };
  M.contOrange = tint(0xb2521e, 'contOrange'); M.contBlue = tint(0x1f3f74, 'contBlue'); M.contGreen = tint(0x2f5a3a, 'contGreen'); M.contMaroon = tint(0x6e2a22, 'contMaroon'); M.contGrey = tint(0x8a8d8f, 'contGrey'); M.contYellow = tint(0xb8951f, 'contYellow');
  const contMats = [M.contOrange, M.contBlue, M.contGreen, M.contMaroon, M.contGrey, M.contYellow];
  const contSet = set('container', 'container_side', '2k');
  for (const m of contMats) { m.normalMap = contSet.normalMap; m.normalScale.set(0.9, 0.9); m.roughnessMap = contSet.arm; m.metalnessMap = contSet.arm; m.aoMap = contSet.arm; m.roughness = 1; m.metalness = 1; }
  grayTex('container_side_Diffuse_2k.jpg', contMats, aniso);
  // ---- wood -------------------------------------------------------------------------
  M.sleeper = pbr('sleeper', 'rail_dark_wooden_planks', '1k', { color: 0x8a7d6c, normalScale: 0.9, envMapIntensity: 0.4 });
  M.plank = pbr('plank', 'rail_dark_wooden_planks', '1k', { color: 0xb3a692, normalScale: 0.9, envMapIntensity: 0.4 });
  // ---- misc -------------------------------------------------------------------------
  M.distant = new THREE.MeshStandardMaterial({ color: 0x5f6870, roughness: 0.95, metalness: 0.0, name: 'distant' });
  M.distantDark = new THREE.MeshStandardMaterial({ color: 0x3d4248, roughness: 0.95, metalness: 0.0, name: 'distantDark' });
  M.glass = new THREE.MeshStandardMaterial({ color: 0x9fb4c4, roughness: 0.08, metalness: 0.9, envMapIntensity: 1.4, transparent: true, opacity: 0.55, name: 'glass', depthWrite: false });
  M.black = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8, metalness: 0.2, name: 'black' });
  M.yellow = new THREE.MeshStandardMaterial({ color: 0xa8892c, roughness: 0.75, metalness: 0.25, name: 'yellow' }); addGrime(M.yellow, R, { key: 'yellow', strength: 0.8, height: 0.8, wet: 0.0, tint: [0.4, 0.33, 0.24] });
  M.white = new THREE.MeshStandardMaterial({ color: 0xe6e3dc, roughness: 0.75, metalness: 0.1, name: 'white' });
  M.lampRed = new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff2010, emissiveIntensity: 4, roughness: 0.3, name: 'lampRed' });
  M.lampGreen = new THREE.MeshStandardMaterial({ color: 0x002a00, emissive: 0x20ff50, emissiveIntensity: 3, roughness: 0.3, name: 'lampGreen' });
  M.tarp = new THREE.MeshStandardMaterial({ color: 0x3f5a8a, roughness: 0.9, metalness: 0.0, name: 'tarp' });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.95, metalness: 0.0, name: 'rubber' });

  // surface type per material (for raycast userData.surface)
  M.surface = {
    ballast: 'ground', dirt: 'ground', asphalt: 'concrete', concrete: 'concrete', concreteWall: 'concrete', concreteCracked: 'concrete', paintedConcrete: 'concrete',
    brick: 'concrete', brickDark: 'concrete', steel: 'metal', steelDark: 'metal', railHead: 'metal', rustSheet: 'metal', rustPlate: 'metal', metalPlate: 'metal', grid: 'metal', corrugated: 'metal', shutter: 'metal',
    wagonRed: 'metal', wagonGreen: 'metal', wagonRust: 'metal', wagonBlue: 'metal', contOrange: 'metal', contBlue: 'metal', contGreen: 'metal', contMaroon: 'metal', contGrey: 'metal', contYellow: 'metal',
    sleeper: 'wood', plank: 'wood', distant: 'concrete', distantDark: 'concrete', glass: 'metal', black: 'metal', yellow: 'metal', white: 'metal', lampRed: 'metal', lampGreen: 'metal', tarp: 'wood', rubber: 'metal',
  };
  return M;
}

/** Grass/weed tuft alpha card texture. */
export function weedTexture(R) {
  const S = 256; const c = document.createElement('canvas'); c.width = S; c.height = S; const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const x0 = S * 0.5 + (R() - 0.5) * 80, y0 = S; const h = 90 + R() * 150, lean = (R() - 0.5) * 120;
    const dry = R() < 0.45; const cr = dry ? 150 + R() * 60 : 70 + R() * 60, cg = dry ? 130 + R() * 40 : 110 + R() * 70, cb = dry ? 60 + R() * 30 : 30 + R() * 40;
    g.strokeStyle = `rgba(${cr | 0},${cg | 0},${cb | 0},${0.85 + R() * 0.15})`; g.lineWidth = 2 + R() * 3.5;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + lean * 0.4, y0 - h * 0.6, x0 + lean, y0 - h); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Ground mask: R = asphalt/concrete apron, G = oil/grime darkening, B = dry pale dirt variation. */
export function groundMaskTexture(R, size, paint) {
  const S = 2048; const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const toPx = (m) => (m / size + 0.5) * S; const pxm = S / size;
  const api = {
    g, toPx, pxm,
    rect(ch, x0, z0, x1, z1, a = 1) { g.fillStyle = ch === 'r' ? `rgba(255,0,0,${a})` : ch === 'g' ? `rgba(0,255,0,${a})` : `rgba(0,0,255,${a})`; g.globalCompositeOperation = 'lighter'; g.fillRect(toPx(Math.min(x0, x1)), toPx(Math.min(z0, z1)), Math.abs(x1 - x0) * pxm, Math.abs(z1 - z0) * pxm); g.globalCompositeOperation = 'source-over'; },
    blob(ch, cx, cz, rx, rz, a, n = 8) {
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {
        const ox = (R() - 0.5) * rx * 0.9, oz = (R() - 0.5) * rz * 0.9, r = Math.min(rx, rz) * (0.4 + R() * 0.6);
        const x = toPx(cx + ox), y = toPx(cz + oz), rp = r * pxm;
        const gr = g.createRadialGradient(x, y, rp * 0.4, x, y, rp);
        const col = ch === 'r' ? '255,0,0' : ch === 'g' ? '0,255,0' : '0,0,255';
        gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = gr; g.fillRect(x - rp, y - rp, 2 * rp, 2 * rp);
      }
      g.globalCompositeOperation = 'source-over';
    },
  };
  paint(api);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4;
  return t;
}

/** Stencilled wagon lettering / numbers (transparent). */
export function stencilTexture({ text = 'RZD 24-7731', color = '#e8e2d6', w = 512, h = 128, R = Math.random } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.font = `bold ${Math.round(h * 0.55)}px "Arial Narrow", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color;
  g.fillText(text, w / 2, h / 2);
  for (let i = 0; i < 300; i++) { g.clearRect(R() * w, R() * h, 1 + R() * 3, 1 + R() * 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
