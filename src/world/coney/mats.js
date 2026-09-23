// CONEY materials: the University material set (brick / precast / glass / asphalt / curb / paint … all generic) plus the seaside
// palette — beach sand, weathered boardwalk planks, the ocean, ride paints matched to the reference photos, painted banner signs,
// roll-down shutters and the terracotta/tile of the old Surf Avenue fronts. CONEY agent.
import * as THREE from 'three';
import { makeMats } from '../sbu/mats.js';

const loader = new THREE.TextureLoader();
function pbrSet(id, res, rep = 1, aniso = 8) {
  const t = (m, srgb) => { const x = loader.load(`./assets/textures/${id}_${m}_${res}.jpg`); x.wrapS = x.wrapT = THREE.RepeatWrapping; x.repeat.set(rep, rep); x.anisotropy = aniso; if (srgb) x.colorSpace = THREE.SRGBColorSpace; return x; };
  return { map: t('Diffuse', true), normalMap: t('nor_gl', false), arm: t('arm', false) };
}
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const tex = (c, { srgb = true, wrap = true } = {}) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };

export function makeConeyMats(world) {
  const M = makeMats(world); const R = world.R;
  const aniso = Math.min(16, world.ctx.renderer?.capabilities?.getMaxAnisotropy?.() ?? 8);
  const reg = (key, mat, surface, uvScale) => { mat.name = key; M[key] = mat; M.surface[key] = surface; M.uvScale[key] = uvScale; return mat; };
  const std = (p) => new THREE.MeshStandardMaterial(p);

  // ---- beach + boardwalk ---------------------------------------------------------------------------------------------
  { const s = pbrSet('coast_sand_01', '1k', 1, aniso); reg('sand', std({ map: s.map, normalMap: s.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), aoMap: s.arm, roughnessMap: s.arm, roughness: 1, metalness: 0, color: 0xe8dcc4, envMapIntensity: 0.3 }), 'ground', 1 / 3); }
  { const s = pbrSet('coast_sand_01', '1k', 1, aniso); reg('sandWet', std({ map: s.map, normalMap: s.normalMap, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.35, metalness: 0, color: 0x9c8e76, envMapIntensity: 0.9 }), 'ground', 1 / 3); }
  { const s = pbrSet('weathered_planks', '1k', 1, aniso); reg('planks', std({ map: s.map, normalMap: s.normalMap, aoMap: s.arm, roughnessMap: s.arm, roughness: 1, metalness: 0, color: 0xb7b0a6, envMapIntensity: 0.4 }), 'wood', 1 / 2.4); }
  { const s = pbrSet('weathered_planks', '1k', 1, aniso); reg('planksDark', std({ map: s.map, normalMap: s.normalMap, roughness: 0.9, metalness: 0, color: 0x6e665c }), 'wood', 1 / 2.4); }
  reg('pile', std({ color: 0x4a4036, roughness: 0.95 }), 'wood', 0.5);
  reg('rock', std({ color: 0x5e5a54, roughness: 0.95, flatShading: true }), 'concrete', 0.5);

  // ---- ride / landmark paints (sampled from qa/refs/coney) ------------------------------------------------------------
  reg('wheelGreen', std({ color: 0x78c8ad, roughness: 0.55, metalness: 0.35 }), 'metal', 1);
  reg('wheelPink', std({ color: 0xe9a39a, roughness: 0.55, metalness: 0.35 }), 'metal', 1);
  reg('wheelBrown', std({ color: 0x7a3a2c, roughness: 0.6, metalness: 0.4 }), 'metal', 1);
  reg('wheelBlue', std({ color: 0x2f6fb5, roughness: 0.55, metalness: 0.35 }), 'metal', 1);
  reg('cabinWhite', std({ color: 0xf1ede2, roughness: 0.5, metalness: 0.1 }), 'metal', 1);
  reg('coasterWhite', std({ color: 0xf4f2ec, roughness: 0.65, metalness: 0.05 }), 'wood', 1);
  reg('coasterTrack', std({ color: 0x4b4136, roughness: 0.9 }), 'wood', 1);
  reg('coasterRed', std({ color: 0xc0282a, roughness: 0.45, metalness: 0.4 }), 'metal', 1);
  reg('steelRed', std({ color: 0xc03028, roughness: 0.45, metalness: 0.5 }), 'metal', 1);
  reg('steelOrange', std({ color: 0xe0661e, roughness: 0.45, metalness: 0.5 }), 'metal', 1);
  reg('steelYellow', std({ color: 0xf2c418, roughness: 0.45, metalness: 0.4 }), 'metal', 1);
  reg('pjRed', std({ color: 0xc8322c, roughness: 0.5, metalness: 0.45 }), 'metal', 1);
  reg('pjYellow', std({ color: 0xf4c81c, roughness: 0.55, metalness: 0.2 }), 'metal', 1);
  reg('pjBlue', std({ color: 0x2455a8, roughness: 0.55, metalness: 0.2 }), 'metal', 1);
  reg('bulb', new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xffe6b0, emissiveIntensity: 1.6, roughness: 0.3 }), 'metal', 1);
  reg('terracotta', std({ color: 0xe8e2d4, roughness: 0.6, metalness: 0 }), 'concrete', 0.5);
  reg('railSteel', std({ color: 0x3f4a44, roughness: 0.7, metalness: 0.5 }), 'metal', 0.5);
  reg('railSteelGreen', std({ color: 0x3e5b4d, roughness: 0.7, metalness: 0.45 }), 'metal', 0.5);

  // ---- roll-down shutters (grey slats with graffiti tags) -------------------------------------------------------------
  { const [c, g] = canvas(256, 256); g.fillStyle = '#9a9c9b'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 8) { g.fillStyle = 'rgba(40,40,40,0.35)'; g.fillRect(0, y, 256, 2); g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(0, y + 2, 256, 1); }
    for (let i = 0; i < 3; i++) { g.strokeStyle = ['#1c3fa8', '#c02a2a', '#161616', '#2a8a3a'][(R() * 4) | 0]; g.lineWidth = 5 + R() * 5; g.beginPath(); let x = 20 + R() * 180, y = 80 + R() * 120; g.moveTo(x, y); for (let k = 0; k < 7; k++) { x += 8 + R() * 18; y += (R() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
    reg('shutter2', std({ map: tex(c), roughness: 0.6, metalness: 0.5, envMapIntensity: 0.5 }), 'metal', 1 / 3); }

  // ---- painted banner signage (sideshow style) — generic text only, never real business names -------------------------
  M.bannerTex = (words, pal = 0) => {
    const [c, g] = canvas(1024, 256); const P = [['#f4d21c', '#c8201e', '#1a3d8f'], ['#e8412c', '#fff2c8', '#153a7a'], ['#2a7fd0', '#fff4d0', '#c8201e'], ['#ffffff', '#c8201e', '#1c1c1c'], ['#2f9a4a', '#ffe36a', '#1c1c1c']][pal % 5];
    g.fillStyle = P[0]; g.fillRect(0, 0, 1024, 256); g.strokeStyle = P[2]; g.lineWidth = 14; g.strokeRect(7, 7, 1010, 242);
    g.fillStyle = P[1]; g.font = 'bold 132px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = P[2]; g.strokeText(words, 512, 134); g.fillText(words, 512, 134);
    for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(0,0,0,' + (R() * 0.08) + ')'; g.fillRect(R() * 1024, R() * 256, 30 + R() * 90, 3 + R() * 10); }
    return tex(c, { wrap: false });
  };
  // painted mural panel (sideshow freak-show banners): a row of colourful framed figures
  M.muralTex = (pal = 0) => {
    const [c, g] = canvas(1024, 256); const bg = ['#f6e2a8', '#fbd7c4', '#d6ecf6', '#f7f0c0'][pal % 4]; g.fillStyle = bg; g.fillRect(0, 0, 1024, 256);
    for (let i = 0; i < 8; i++) { const x = 8 + i * 127; g.fillStyle = ['#c8201e', '#1a3d8f', '#2f9a4a', '#e8a01c'][(i + pal) % 4]; g.fillRect(x, 10, 118, 236); g.fillStyle = ['#ffe9a8', '#e8f4ff', '#ffe0d4', '#f4ffd8'][(i * 3 + pal) % 4]; g.fillRect(x + 8, 18, 102, 186);
      g.fillStyle = ['#7a3a2a', '#3a2a1a', '#d49a6a', '#8a5a3a'][(i + 1) % 4]; g.beginPath(); g.arc(x + 59, 70, 18, 0, 7); g.fill(); g.fillStyle = ['#c8201e', '#1a3d8f', '#6a2a8a', '#2f9a4a'][(i * 7 + pal) % 4]; g.fillRect(x + 36, 90, 46, 90);
      g.fillStyle = '#1c1c1c'; g.font = 'bold 22px Impact, sans-serif'; g.textAlign = 'center'; g.fillText(['ALIVE', 'WONDER', 'MAGIC', 'STRONG', 'FIRE', 'SWORD', 'GIANT', 'SNAKE'][i], x + 59, 232); }
    return tex(c, { wrap: false });
  };
  // a fixed palette of sign materials, merged per material by the batches (rotates correctly with footprints, ~28 draw calls)
  { const words = ['HOT DOGS', 'CLAMS', 'FRIES', 'ARCADE', 'SOUVENIRS', 'COLD BEER', 'ICE CREAM', 'PIZZA', 'GAMES', 'T-SHIRTS', 'SNACKS', 'LEMONADE', 'SHOOT', 'FUN HOUSE', 'SIDESHOW', 'BUMPER CARS', 'CORN DOGS', 'TACOS', 'SEAFOOD', 'CHURROS', 'WIN A PRIZE', 'SKEE BALL'];
    M.signKeys = []; words.forEach((wd, i) => { const t = M.bannerTex(wd, i); reg('sign' + i, new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.12, roughness: 0.6, side: THREE.DoubleSide }), 'wood', 1); M.signKeys.push('sign' + i); });
    M.muralKeys = []; for (let i = 0; i < 4; i++) { const t = M.muralTex(i); reg('mural' + i, new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.7, side: THREE.DoubleSide }), 'wood', 1); M.muralKeys.push('mural' + i); } }
  M.signMat = (texture, { emissive = 0.15 } = {}) => new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: emissive, roughness: 0.6, metalness: 0, name: 'sign' });

  // ---- far housing-tower facade: brick with a punched-window grid (4 bays x 4 floors per tile = 11.6 x 11.2 m), used on
  // plain blocks for everything outside the playable area (the full per-bay facade cost ~2M triangles for the backdrop)
  for (const [key, base, mortar] of [['towerFarBrown', '#7a4a36', '#5e3a2c'], ['towerFarRed', '#8e4a38', '#6a372a'], ['towerFarTan', '#b89a7a', '#8e765e']]) {
    const [c, g] = canvas(512, 512); g.fillStyle = base; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '40,24,18' : '200,160,130'},${R() * 0.1})`; g.fillRect(R() * 512, R() * 512, 6 + R() * 10, 3); }
    for (let f = 0; f < 4; f++) { g.fillStyle = mortar; g.fillRect(0, f * 128 + 118, 512, 6); for (let b = 0; b < 4; b++) { const lit = R() < 0.12; g.fillStyle = lit ? '#e8d4a0' : (R() < 0.5 ? '#2a3238' : '#3a444c'); g.fillRect(b * 128 + 30, f * 128 + 30, 68, 70); g.fillStyle = 'rgba(230,230,225,0.8)'; g.fillRect(b * 128 + 26, f * 128 + 100, 76, 5); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(b * 128 + 62, f * 128 + 30, 3, 70); } }
    reg(key, std({ map: tex(c), roughness: 0.9, metalness: 0 }), 'concrete', 1 / 11.6);
  }
  // ---- storefront fascia colours for the shop rows ------------------------------------------------------------------
  const fas = [0xc8201e, 0xf2c418, 0x1f5fb0, 0x2f9a4a, 0xe8661e, 0xf4f0e6, 0x7a2a8a, 0x1c1c1c];
  fas.forEach((c, i) => reg('fascia' + i, std({ color: c, roughness: 0.6, metalness: 0.1 }), 'metal', 1));
  M.fasciaKeys = fas.map((_, i) => 'fascia' + i);
  // stucco / painted masonry for 1–3 storey amusement-zone buildings
  [0xe8e0cc, 0xd9c7a6, 0xc9d4d6, 0xe6cfc0, 0xb9c9b2, 0xf1ece0].forEach((c, i) => reg('paintWall' + i, std({ color: c, roughness: 0.9 }), 'concrete', 0.5));
  M.paintWallKeys = [0, 1, 2, 3, 4, 5].map((i) => 'paintWall' + i);
  return M;
}
