// Procedural, tileable rain-droplet normal map for the lens (RG = normal.xy, B = mask). Owned by: POST agent.
import * as THREE from 'three';
import { mulberry32 } from '../ctx.js';

export function makeDropletTexture(size = 512, seed = 7) {
  const rng = mulberry32(seed);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) { data[i * 4] = 128; data[i * 4 + 1] = 128; data[i * 4 + 2] = 0; data[i * 4 + 3] = 255; }
  const drops = [];
  const N = 110;
  for (let i = 0; i < N; i++) {
    const big = rng() < 0.18;
    const r = big ? 10 + rng() * 16 : 3 + rng() * 6;
    drops.push({ x: rng() * size, y: rng() * size, r, ry: r * (1.15 + rng() * 0.6), tail: rng() < 0.35 ? r * (1 + rng() * 3) : 0 });
  }
  const put = (px, py, nx, ny, mask) => {
    px = ((px % size) + size) % size; py = ((py % size) + size) % size;
    const o = (py * size + px) * 4;
    if (mask <= data[o + 2] / 255) return;
    data[o] = Math.round((nx * 0.5 + 0.5) * 255);
    data[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
    data[o + 2] = Math.round(mask * 255);
  };
  for (const d of drops) {
    const R = Math.ceil(Math.max(d.r, d.ry + d.tail)) + 1;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      // main body (ellipse) + a thinning tail trailing upward (drop has run down the lens)
      let ex = dx / d.r, ey = dy / d.ry;
      let inside = ex * ex + ey * ey;
      if (inside > 1 && d.tail > 0 && dy < 0) {
        const t = -dy / d.tail;
        const w = d.r * 0.55 * (1 - t);
        if (t < 1 && Math.abs(dx) < w) { ex = dx / Math.max(w, 0.001); ey = 0; inside = ex * ex; }
      }
      if (inside > 1) continue;
      const h = Math.sqrt(1 - inside);       // sphere cap height
      // normal of a sphere cap; lens droplets act as tiny inverted lenses so flip
      const nx = -ex * (1 - h) * 1.6, ny = -ey * (1 - h) * 1.6;
      const mask = Math.min(1, 0.35 + 0.65 * h);
      put(Math.round(d.x + dx), Math.round(d.y + dy), THREE.MathUtils.clamp(nx, -1, 1), THREE.MathUtils.clamp(ny, -1, 1), mask);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true; tex.needsUpdate = true;
  return tex;
}
