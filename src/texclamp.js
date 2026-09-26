// Texture budget for phones / tablets: every texture in the scene bigger than the device's budget is redrawn into a smaller
// canvas before (re)upload. Phones: 1024 px (people 512); older / low-memory devices: 512 (people 256). Desktop: untouched
// (well, capped at 2048). Saves hundreds of MB of GPU memory on the big maps — iOS kills a tab that grows past ~1–1.5 GB.
// Owned by: main (world.js calls it after the map builds).
const KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'specularMap'];

export function textureBudget(ctx) {
  if (!ctx.isTouch) return { max: 2048, people: 1024, low: false };
  const mem = navigator.deviceMemory || 0, cores = navigator.hardwareConcurrency || 0;
  const low = (mem && mem <= 4) || (cores && cores <= 4) || /iPad;|iPad Mini|iPhone OS 1[0-5]_/i.test(navigator.userAgent) || ctx.qs?.get?.('lowmem') === '1';
  return low ? { max: 512, people: 256, low: true } : { max: 1024, people: 512, low: false };
}

export function clampTextures(ctx, root = ctx.scene) {
  const B = textureBudget(ctx), seen = new Set(); let saved = 0, n = 0;
  root.traverse((o) => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    const person = o.isSkinnedMesh || /^Bip01|person/i.test(o.parent?.name || '');
    for (const m of ms) for (const k of KEYS) {
      const t = m[k]; if (!t || seen.has(t) || t.isRenderTargetTexture || t.isDataTexture || t.isCompressedTexture) continue; seen.add(t);
      const im = t.image, w = im?.width || im?.videoWidth || 0, h = im?.height || im?.videoHeight || 0; if (!w || !h) continue;
      const lim = person ? B.people : B.max; if (Math.max(w, h) <= lim) continue;
      const s = lim / Math.max(w, h), cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
      try {
        const c = document.createElement('canvas'); c.width = cw; c.height = ch; c.getContext('2d').drawImage(im, 0, 0, cw, ch);
        t.image = c; t.needsUpdate = true; saved += (w * h - cw * ch) * 4 * 1.33; n++;
      } catch (e) { /* tainted / not drawable: leave it */ }
    }
  });
  if (n) console.log(`[texclamp] ${n} textures downsized (budget ${B.max}/${B.people}${B.low ? ' low-mem' : ''}) — saved ~${Math.round(saved / 1048576)} MB`);
  return { n, savedMB: Math.round(saved / 1048576), budget: B };
}
