// Asset loading. Owned by: WORLD agent. Loads textures/HDRI/models from ./assets/ with caching. Exposes ctx.assets.
import * as THREE from 'three';
export async function init(ctx) {
  const texLoader = new THREE.TextureLoader();
  const cache = new Map();
  const api = {
    texture(url, { srgb = false, repeat = 1, aniso = 8 } = {}) {
      if (cache.has(url)) return cache.get(url);
      const t = texLoader.load(url); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = aniso;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace; cache.set(url, t); return t;
    },
  };
  return api;
}
