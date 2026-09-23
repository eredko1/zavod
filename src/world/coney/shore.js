// CONEY shore: the beach (dry sand sloping to wet sand at the real OSM waterline), the Atlantic (animated normals + fresnel +
// shore foam), the Riegelmann-style boardwalk (plank deck, beach bulkhead + piles, railing, stairs, lamps, benches, bins),
// rock jetties and the fishing pier. CONEY agent. Frame: see osm.js (+x along the boardwalk, +z toward the ocean).
import * as THREE from 'three';
import { Batch, boxGeo } from '../sbu/geo.js';
import { OSM } from './osm.js';
import { walk, bbox, pip } from '../osmkit.js';

export const BW = { z0: 137, z1: 161, x0: -900, x1: 800 };   // boardwalk deck (y = 0)
export const SAND_TOP = -1.3, WATER_Y = -2.35;
const X0 = -1000, X1 = 900;

// waterline z(x): southern edge of the OSM beach polygon, sampled every 5 m and smoothed
const WL = (() => {
  const big = [...OSM.be].sort((a, b) => b.length - a.length)[0] || [];
  const out = [];
  for (let x = X0; x <= X1; x += 5) {
    let zmax = -1e9;
    for (let i = 0; i < big.length; i++) { const [ax, az] = big[i], [bx, bz] = big[(i + 1) % big.length]; if ((ax - x) * (bx - x) <= 0 && ax !== bx) zmax = Math.max(zmax, az + (bz - az) * (x - ax) / (bx - ax)); }
    out.push(zmax > 170 ? zmax : 290);
  }
  const sm = out.map((_, i) => { let s = 0, n = 0; for (let k = -4; k <= 4; k++) { const v = out[i + k]; if (v !== undefined) { s += v; n++; } } return s / n; });
  return sm;
})();
export const waterZ = (x) => { const f = (Math.min(X1, Math.max(X0, x)) - X0) / 5, i = Math.floor(f), t = f - i; return (WL[i] ?? 290) * (1 - t) + (WL[i + 1] ?? WL[i] ?? 290) * t; };

/** Sand surface height (only meaningful for z > BW.z1). Gentle dune near the boardwalk, then a steady slope to the water. */
export function sandHeight(x, z) {
  const zw = waterZ(x); const t = (z - BW.z1) / Math.max(20, zw - BW.z1);
  if (t <= 1) { const dune = 0.25 * Math.sin(Math.min(1, t * 4) * Math.PI) ; return SAND_TOP - 1.05 * t + dune * (1 - t); }
  return SAND_TOP - 1.05 - Math.min(2.5, (z - zw) * 0.035);
}

export function buildShore(world, M) {
  const { scene, ctx, R } = world;
  const G = new Batch(world, M, 'shoreGround'), S = new Batch(world, M, 'shore');

  // ---- beach surface: a height-field grid from the bulkhead to 60 m past the waterline, one mesh, wet band in-shader ----
  {
    const step = 3; const nx = Math.round((X1 - X0) / step); const zs = []; for (let z = BW.z1; z < 420; z += (z < 330 ? step : 8)) zs.push(z);
    const pos = [], idx = [];
    for (let j = 0; j < zs.length; j++) for (let i = 0; i <= nx; i++) { const x = X0 + i * step, z = zs[j]; pos.push(x, sandHeight(x, z) + (R() - 0.5) * 0.03, z); }
    for (let j = 0; j + 1 < zs.length; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const uv = new Float32Array(pos.length / 3 * 2); for (let k = 0; k < pos.length / 3; k++) { uv[k * 2] = pos[k * 3] / 3; uv[k * 2 + 1] = pos[k * 3 + 2] / 3; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const m = M.sand.clone(); m.name = 'beach';
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          float wet = smoothstep(${(WATER_Y + 0.55).toFixed(2)}, ${(WATER_Y + 0.05).toFixed(2)}, vWP.y);
          float tide = smoothstep(${(WATER_Y + 0.9).toFixed(2)}, ${(WATER_Y + 0.5).toFixed(2)}, vWP.y) * 0.35;         // darker tide-line band above the wet sand
          float n = fract(sin(dot(floor(vWP.xz * 1.7), vec2(12.9898, 78.233))) * 43758.5453);
          diffuseColor.rgb *= mix(1.0, 0.62, max(wet, tide * (0.6 + 0.4 * n)));
          diffuseColor.rgb *= 0.94 + 0.08 * n;
          // the scan is a warm orange sand; the refs are a pale grey-beige: desaturate hard, keep the grain
          float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb = mix(vec3(lum), diffuseColor.rgb, 0.35) * vec3(1.06, 1.02, 0.94);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.28, smoothstep(${(WATER_Y + 0.4).toFixed(2)}, ${(WATER_Y + 0.02).toFixed(2)}, vWP.y));`);
    };
    m.customProgramCacheKey = () => 'coney-beach';
    const mesh = new THREE.Mesh(g, m); mesh.name = 'beach'; mesh.receiveShadow = true; mesh.userData.surface = 'ground'; scene.add(mesh); ctx.raycastTargets.push(mesh);
  }

  // ---- ocean ------------------------------------------------------------------------------------------------------
  buildOcean(world);

  // ---- boardwalk deck, bulkhead, piles, railing, stairs --------------------------------------------------------------
  const deckT = 0.35;
  G.add('planks', boxGeo([BW.x0, -deckT, BW.z0], [BW.x1, 0.02, BW.z1]), { uvScale: 1 / 2.4 });
  // concrete centre strip (vehicle lane) with seam lines, as on the real boardwalk
  G.add('concretePav', boxGeo([BW.x0, 0.021, 147.4], [BW.x1, 0.03, 150.6]), { uvScale: 1 / 3 });
  // beach face: dark bulkhead + posts every 3 m, lattice skirt between them
  S.add('planksDark', boxGeo([BW.x0, SAND_TOP - 0.6, BW.z1 - 0.02], [BW.x1, -deckT, BW.z1 + 0.05]), { uvScale: 1 / 2 });
  for (let x = BW.x0; x < BW.x1; x += 3) S.add('pile', boxGeo([x - 0.13, SAND_TOP - 0.7, BW.z1 + 0.05], [x + 0.13, 0, BW.z1 + 0.3]), { uv: false });
  world.box([BW.x0, SAND_TOP - 1, BW.z1 - 0.05], [BW.x1, -0.02, BW.z1 + 0.3]);           // bulkhead face (you drop off the edge, not through it)
  // stairs to the beach every ~95 m (and at the pier head), railing everywhere else
  const stairX = []; for (let x = BW.x0 + 60; x < BW.x1 - 30; x += 95) stairX.push(x);
  for (const p of OSM.pi) { const q = bbox(p.p); if (q.z0 < BW.z1 + 5 && q.z1 > BW.z1 + 40) stairX.push(null); }
  const railSegs = []; let x = BW.x0;
  for (const sx of stairX.filter((v) => v !== null).sort((a, b) => a - b)) { railSegs.push([x, sx - 2.5]); x = sx + 2.5; stairs(S, world, sx); }
  railSegs.push([x, BW.x1]);
  for (const [a, b] of railSegs) {
    if (b - a < 1) continue;
    S.add('steelDark', boxGeo([a, 1.0, BW.z1 - 0.12], [b, 1.07, BW.z1 - 0.04]), { uv: false });
    S.add('steelDark', boxGeo([a, 0.55, BW.z1 - 0.1], [b, 0.6, BW.z1 - 0.06]), { uv: false });
    for (let px = a; px <= b; px += 2) S.add('steelDark', boxGeo([px - 0.04, 0, BW.z1 - 0.12], [px + 0.04, 1.07, BW.z1 - 0.04]), { uv: false });
    world.box([a, 0, BW.z1 - 0.15], [b, 1.1, BW.z1 - 0.02]);
  }
  // lamps (tall pole, twin globes) every 30 m on both edges, benches facing the ocean, bins
  const lamps = [], benches = [], bins = [];
  for (let lx = BW.x0 + 12; lx < BW.x1; lx += 30) { lamps.push([lx, BW.z1 - 1.2]); lamps.push([lx + 15, BW.z0 + 1.2]); }
  for (let bx = BW.x0 + 20; bx < BW.x1; bx += 15) if (!stairX.some((s) => s !== null && Math.abs(s - bx) < 5)) benches.push([bx, BW.z1 - 2.4]);
  for (let bx = BW.x0 + 27; bx < BW.x1; bx += 45) bins.push([bx, BW.z1 - 1.6]);
  for (const [lx, lz] of lamps) {
    S.cyl('steelDark', lx, lz, 0, 0.5, 0.2, 10); S.cyl('steelDark', lx, lz, 0.5, 7.5, 0.09, 8);
    S.add('steelDark', boxGeo([lx - 0.9, 7.4, lz - 0.05], [lx + 0.9, 7.5, lz + 0.05]), { uv: false });
    for (const s of [-0.85, 0.85]) { const gl = new THREE.SphereGeometry(0.28, 12, 8); gl.translate(lx + s, 7.2, lz); S.add('lampHead', gl, { uv: false }); }
    world.box([lx - 0.2, 0, lz - 0.2], [lx + 0.2, 7.5, lz + 0.2]);
  }
  for (const [bx, bz] of benches) {
    for (let k = 0; k < 4; k++) S.add('bench', boxGeo([bx - 1, 0.42 + (k > 1 ? (k - 1) * 0.22 : 0), bz - 0.28 + (k < 2 ? k * 0.18 : 0.4)], [bx + 1, 0.46 + (k > 1 ? (k - 1) * 0.22 : 0), bz - 0.14 + (k < 2 ? k * 0.18 : 0.44)]), { uv: false });
    for (const s of [-0.85, 0.85]) S.add('steelDark', boxGeo([bx + s - 0.04, 0, bz - 0.3], [bx + s + 0.04, 0.9, bz + 0.45]), { uv: false });
    world.box([bx - 1, 0, bz - 0.3], [bx + 1, 0.5, bz + 0.45]); if (R() < 0.35) world.cover(bx, bz - 0.9, 0, -1);
  }
  for (const [bx, bz] of bins) { S.cyl('binGreen', bx, bz, 0, 0.95, 0.32, 12); world.box([bx - 0.32, 0, bz - 0.32], [bx + 0.32, 0.95, bz + 0.32]); }

  // ---- jetties: rock groynes from OSM, boulders instanced along the line from the bulkhead into the surf ---------------
  {
    const geo = new THREE.DodecahedronGeometry(1, 0); const pl = [];
    for (const line of OSM.gr) walk(line, 1.3, (px, pz) => { if (pz < BW.z1 + 4) return; for (let k = 0; k < 3; k++) { const ox = (R() - 0.5) * 3.2, oz = (R() - 0.5) * 1.2; const x = px + ox, z = pz + oz; const y = Math.max(sandHeight(x, z), WATER_Y - 1.2) + 0.2 + R() * 0.5; pl.push({ x, y, z, s: 0.8 + R() * 0.9, r: [R() * 3, R() * 3, R() * 3] }); } });
    const im = new THREE.InstancedMesh(geo, M.rock, pl.length); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    pl.forEach((p, i) => { e.set(...p.r); q.setFromEuler(e); im.setMatrixAt(i, m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.s * 1.1, p.s * 0.8, p.s))); });
    im.castShadow = true; im.receiveShadow = true; im.name = 'jetties'; im.userData.surface = 'concrete'; scene.add(im); ctx.raycastTargets.push(im);
    for (const line of OSM.gr) walk(line, 4, (px, pz) => { if (pz < BW.z1 + 4) return; const y = Math.max(sandHeight(px, pz), WATER_Y - 1) + 0.9; world.box([px - 1.8, y - 2.5, pz - 2], [px + 1.8, y, pz + 2]); });
  }

  // ---- fishing pier: plank deck on piles at boardwalk level, railings, a shelter at the head ---------------------------
  for (const p of OSM.pi) {
    const q = bbox(p.p); if (!(q.z1 > BW.z1 + 40 && q.z0 < BW.z1 + 20)) continue;
    const w = 11, cx = (q.x0 + q.x1) / 2, main = [cx - w / 2, cx + w / 2];
    S.add('planks', boxGeo([main[0], -0.35, BW.z1], [main[1], 0.02, q.z1]), { uvScale: 1 / 2.4 });
    world.walkable([main[0], -0.4, BW.z1], [main[1], 0.02, q.z1]);
    const tee = OSM.pi.find((o) => { const b = bbox(o.p); return b.z0 > q.z1 - 80 && b.x1 - b.x0 > 40; });
    if (tee) { const b = bbox(tee.p); S.add('planks', boxGeo([b.x0, -0.35, b.z0 - 4], [b.x1, 0.02, b.z0 + 6]), { uvScale: 1 / 2.4 }); world.walkable([b.x0, -0.4, b.z0 - 4], [b.x1, 0.02, b.z0 + 6]); }
    for (let z = BW.z1 + 3; z < q.z1; z += 6) for (const px of [main[0] + 0.3, main[1] - 0.3]) { const yb = Math.max(sandHeight(px, z), WATER_Y - 3); S.add('pile', boxGeo([px - 0.2, yb - 1, z - 0.2], [px + 0.2, -0.35, z + 0.2]), { uv: false }); }
    for (const px of [main[0], main[1] - 0.08]) { S.add('steelDark', boxGeo([px, 1.0, BW.z1 + 1], [px + 0.08, 1.07, q.z1]), { uv: false }); world.box([px - 0.05, 0, BW.z1 + 1], [px + 0.13, 1.1, q.z1]); for (let z = BW.z1 + 1; z < q.z1; z += 2.5) S.add('steelDark', boxGeo([px, 0, z], [px + 0.08, 1.07, z + 0.08]), { uv: false }); }
    // shade shelter mid-pier
    const sz = BW.z1 + 120; for (const px of [main[0] + 1, main[1] - 1]) for (const dz of [-6, 6]) S.add('steel', boxGeo([px - 0.1, 0, sz + dz - 0.1], [px + 0.1, 3.4, sz + dz + 0.1]), { uv: false });
    S.add('wheelBlue', boxGeo([main[0], 3.4, sz - 7], [main[1], 3.6, sz + 7]), { uv: false });
    world.cover(cx, BW.z1 + 60, 0, -1); world.cover(cx, BW.z1 + 180, 0, 1);
  }
  G.flush({ shadow: false }); S.flush({ shadow: true });
}

function stairs(S, world, sx) {
  const w = 4.5, n = 5, rise = -SAND_TOP / n, run = 0.4;
  for (let i = 0; i < n; i++) { const y = -rise * (i + 1), z = BW.z1 + i * run; S.box('concreteGrey', [sx - w / 2, SAND_TOP - 0.4, z], [sx + w / 2, y + 0.001 + rise * 0.0, z + run], { walkable: true }); }
  for (const s of [-1, 1]) S.add('steelDark', boxGeo([sx + s * w / 2 - 0.04, 0.9 - 0.1, BW.z1], [sx + s * w / 2 + 0.04, 1.0, BW.z1 + n * run]), { uv: false });
}

function buildOcean(world) {
  const { scene, ctx } = world;
  const S = 256; const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); const img = g.createImageData(S, S);
  // tileable wave height field (sum of periodic sines) -> normal map
  const H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { let h = 0; for (let k = 1; k <= 6; k++) { const fx = [1, 2, 3, 5, 7, 11][k - 1], fy = [2, 1, 4, 3, 6, 5][k - 1]; h += Math.sin((x * fx + y * fy) / S * Math.PI * 2 + k * 1.7) / k; } H[y * S + x] = h; }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const dx = H[y * S + (x + 1) % S] - H[y * S + (x - 1 + S) % S], dy = H[((y + 1) % S) * S + x] - H[((y - 1 + S) % S) * S + x]; const n = new THREE.Vector3(-dx * 2.2, -dy * 2.2, 1).normalize(); const i = (y * S + x) * 4; img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255; img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  const nt = new THREE.CanvasTexture(c); nt.wrapS = nt.wrapT = THREE.RepeatWrapping; nt.repeat.set(1, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x2c5a63, roughness: 0.16, metalness: 0.0, normalMap: nt, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 0.55, transparent: true, opacity: 0.96, name: 'ocean' });
  const U = { uT: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uT = U.uT;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform float uT;')
      .replace('#include <normal_fragment_maps>', `
        vec3 n1 = texture2D(normalMap, vWP.xz / 23.0 + vec2(uT * 0.011, uT * 0.017)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(normalMap, vWP.xz / 9.0 - vec2(uT * 0.021, -uT * 0.006)).xyz * 2.0 - 1.0;
        vec3 nt = normalize(vec3((n1.xy + n2.xy) * 0.35, 1.0));
        normal = normalize(tbn * nt);`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float far = smoothstep(40.0, 600.0, length(vWP.xz - cameraPosition.xz));
        diffuseColor.rgb = mix(vec3(0.07, 0.17, 0.17), vec3(0.09, 0.16, 0.22), far);          // green-teal near shore, blue offshore
        // breaking surf: foam bands parallel to the shore, animated toward the beach
        float shore = vWP.z;`)
      ;
  };
  mat.customProgramCacheKey = () => 'coney-ocean';
  const g2 = new THREE.PlaneGeometry(4000, 2200, 1, 1); g2.rotateX(-Math.PI / 2); g2.translate(0, 0, 1350);
  const m = new THREE.Mesh(g2, mat); m.position.y = WATER_Y; m.name = 'ocean'; m.receiveShadow = false; m.renderOrder = 1; scene.add(m);
  // surf foam: 3 soft bands following the waterline, drifting shoreward and fading
  const fc = document.createElement('canvas'); fc.width = 512; fc.height = 64; const fg = fc.getContext('2d'); fg.clearRect(0, 0, 512, 64);
  for (let i = 0; i < 900; i++) { const x = Math.random() * 512, y = 20 + Math.random() * 24 + Math.sin(x / 30) * 6; fg.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.5})`; fg.beginPath(); fg.ellipse(x, y, 3 + Math.random() * 9, 1 + Math.random() * 2.5, 0, 0, 7); fg.fill(); }
  const ft = new THREE.CanvasTexture(fc); ft.wrapS = THREE.RepeatWrapping;
  const bands = [];
  for (let k = 0; k < 3; k++) {
    const pos = [], uv = [], idx = [];
    for (let x = X0, i = 0; x <= X1; x += 10, i++) { const zw = waterZ(x); pos.push(x, 0, zw - 2, x, 0, zw + 9); uv.push(x / 60, 0, x / 60, 1); if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); } }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); gg.setIndex(idx);
    const fm = new THREE.MeshBasicMaterial({ map: ft, transparent: true, depthWrite: false, opacity: 0.8, color: 0xf4f8f8, name: 'foam' });
    const mesh = new THREE.Mesh(gg, fm); mesh.position.y = WATER_Y + 0.03; mesh.renderOrder = 2; mesh.name = 'surf' + k; scene.add(mesh); bands.push({ mesh, ph: k / 3 });
  }
  world.updaters.push((dt) => {
    U.uT.value += dt;
    for (const b of bands) { const t = (U.uT.value * 0.09 + b.ph) % 1; b.mesh.position.z = 26 * (1 - t) - 4; b.mesh.material.opacity = Math.sin(t * Math.PI) * 0.75; b.mesh.material.map.offset.x = b.ph + U.uT.value * 0.003; }
  });
}
