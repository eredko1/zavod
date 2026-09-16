// Asset loading. Owned by: WORLD agent.
// Loads Poly Haven CC0 PBR texture sets, GLTF props and the HDRI from ./assets/ with caching; exposes ctx.assets.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const BASE = './assets/';

// ---- manifest ---------------------------------------------------------------
// Texture sets: <id>_Diffuse_<res>.jpg, <id>_nor_gl_<res>.jpg, <id>_arm_<res>.jpg (R=AO, G=Rough, B=Metal)
export const TEXTURE_SETS = {
  asphalt: { id: 'asphalt_02', res: '2k' },
  asphalt_worn: { id: 'worn_asphalt', res: '2k' },
  container: { id: 'container_side', res: '2k' },
  corrugated: { id: 'corrugated_iron_02', res: '2k' },
  concrete_floor: { id: 'concrete_floor_02', res: '1k' },
  factory_wall: { id: 'factory_wall', res: '1k' },
  rusty_sheet: { id: 'rusty_metal_sheet', res: '1k' },
  metal_plate: { id: 'metal_plate', res: '1k' },
  grid: { id: 'rusty_metal_grid', res: '1k' },
  concrete_wall: { id: 'concrete_wall_006', res: '1k' },
  painted_concrete: { id: 'painted_concrete', res: '1k' },
  brick: { id: 'factory_brick', res: '1k' },
  shutter: { id: 'painted_metal_shutter', res: '1k' },
  cracked_concrete: { id: 'cracked_concrete', res: '1k' },
  rust: { id: 'rusty_metal_02', res: '1k' },
};

export const MODELS = [
  'barrel_03', 'concrete_road_barrier', 'concrete_road_barrier_02', 'modular_chainlink_fence', 'old_military_crate',
  'wooden_military_crate', 'cardboard_box_01', 'industrial_storage_cart', 'hanging_industrial_lamp', 'industrial_wall_lamp',
  'street_lamp_01', 'old_tyre', 'power_box_01', 'utility_box_01', 'metal_trash_can', 'trashbag', 'plastic_crate_01', 'ammo_box',
  'modular_industrial_pipes_01', 'portable_welding_cart', 'metal_jerrycan', 'portable_generator', 'wooden_crate_01',
  'ladder_sectioned_01', 'metal_toolbox', 'overhead_crane', 'industrial_pastic_container',
];

export const HDRI = 'hdri/moonless_golf_2k.hdr';

let api_fit = (t) => t;
export async function init(ctx) {
  const texLoader = new THREE.TextureLoader();
  const gltfLoader = new GLTFLoader();
  const hdrLoader = new RGBELoader();
  const maxAniso = Math.min(ctx.isTouch ? 4 : 16, ctx.renderer?.capabilities?.getMaxAnisotropy?.() ?? 8);
  const cache = new Map();
  const models = new Map();
  let hdr = null;

  // Downscale oversized images on memory-constrained devices (iOS Safari kills tabs near ~1 GB of GPU memory).
  const TEX_MAX = ctx.settings.texMax || 4096;
  const fit = (t) => {
    const im = t && t.image; if (!im || !im.width) return t;
    const w = im.width, h = im.height, m = Math.max(w, h); if (m <= TEX_MAX) return t;
    const k = TEX_MAX / m, c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); t.image = c; t.needsUpdate = true; return t;
  };
  api_fit = fit;
  const loadTex = (url) => new Promise((res, rej) => texLoader.load(url, (t) => res(fit(t)), undefined, () => { console.warn('[assets] missing texture', url); res(null); }));

  const api = {
    maxAniso,
    /** Load (cached) a single texture. */
    texture(url, { srgb = false, repeat = 1, aniso = maxAniso } = {}) {
      const full = url.startsWith('./') || url.startsWith('http') ? url : BASE + url;
      if (cache.has(full)) return cache.get(full);
      const t = texLoader.load(full, fit);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = aniso;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      cache.set(full, t); return t;
    },
    /** A PBR set { map, normalMap, armMap }; textures are shared, so clone before changing repeat. */
    pbr(name) { return cache.get('set:' + name); },
    /**
     * Build a MeshStandardMaterial from a set with ARM packing. repeat may be number or [u,v].
     */
    material(name, { repeat = 1, color = 0xffffff, roughness = 1, metalness = 1, normalScale = 1, envMapIntensity = 1, grayscale = false, ...rest } = {}) {
      const set = api.pbr(name);
      const rep = Array.isArray(repeat) ? repeat : [repeat, repeat];
      const clone = (t) => { if (!t) return null; const c = t.clone(); c.repeat.set(rep[0], rep[1]); c.needsUpdate = true; return c; };
      const map = clone(grayscale ? set.mapGray : set.map);
      const normalMap = clone(set.normalMap);
      const arm = clone(set.armMap);
      const m = new THREE.MeshStandardMaterial({
        color, map, normalMap, normalScale: new THREE.Vector2(normalScale, normalScale),
        aoMap: arm, aoMapIntensity: 1, roughnessMap: arm, metalnessMap: arm, roughness, metalness, envMapIntensity, ...rest,
      });
      return m;
    },
    /** Get a fresh clone of a loaded GLTF scene (Group). */
    model(id) {
      const src = models.get(id);
      if (!src) { console.warn('[assets] model not loaded', id); return new THREE.Group(); }
      return src.scene.clone(true);
    },
    /** The raw loaded gltf (do not mutate). */
    modelSource(id) { return models.get(id) || null; },
    get hdr() { return hdr; },
  };

  // ---- preload everything -----------------------------------------------------
  const texJobs = Object.entries(TEXTURE_SETS);
  const total = texJobs.length * 3 + MODELS.length + 1;
  let done = 0;
  const tick = (label) => { done++; ctx.progress(0.01 + 0.11 * (done / total), `loading ${label}`); };

  const loadSet = async (key, { id, res }) => {
    const p = (m) => `${BASE}textures/${id}_${m}_${res}.jpg`;
    const [map, nor, arm] = await Promise.all([
      loadTex(p('Diffuse')).then(t => { tick(id); return t; }),
      loadTex(p('nor_gl')).then(t => { tick(id); return t; }),
      loadTex(p('arm')).then(t => { tick(id); return t; }),
    ]);
    for (const t of [map, nor, arm]) { if (!t) continue; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso; }
    if (map) map.colorSpace = THREE.SRGBColorSpace;
    const set = { map, normalMap: nor, armMap: arm, mapGray: null };
    // grayscale (luma-normalised) variant so instance colours can tint painted metal
    if (map && (key === 'container' || key === 'corrugated' || key === 'shutter')) set.mapGray = toGray(map, maxAniso);
    cache.set('set:' + key, set);
  };
  const loadModel = (id) => new Promise((res) => {
    gltfLoader.load(`${BASE}models/props/${id}/${id}.gltf`, (g) => {
      g.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) { for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) if (m[k]) { fit(m[k]); m[k].anisotropy = Math.min(maxAniso, ctx.isTouch ? 4 : 16); } m.envMapIntensity = 1; }
        }
      });
      models.set(id, g); tick(id); res(g);
    }, undefined, (e) => { console.warn('[assets] model failed', id, e?.message || e); tick(id); res(null); });
  });
  const loadHdr = () => new Promise((res) => hdrLoader.load(BASE + HDRI, (t) => { t.mapping = THREE.EquirectangularReflectionMapping; hdr = t; tick('sky'); res(t); }, undefined, () => { tick('sky'); res(null); }));

  await Promise.all([...texJobs.map(([k, v]) => loadSet(k, v)), ...MODELS.map(loadModel), loadHdr()]);
  return api;
}

function toGray(tex, aniso) {
  const img = tex.image; if (!img || !img.width) return null;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height); const px = d.data;
  let sum = 0; const n = px.length / 4;
  for (let i = 0; i < px.length; i += 4) { const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; px[i] = px[i + 1] = px[i + 2] = l; sum += l; }
  const mean = sum / n; const gain = 175 / Math.max(1, mean); // normalise so tint colours read true
  for (let i = 0; i < px.length; i += 4) { const v = Math.min(255, px[i] * gain); px[i] = px[i + 1] = px[i + 2] = v; }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function update() {}
