// WSP trees: London planes / elms as instanced trunks (bark canvas) + 5 alpha canopy cards each; the Hangman's Elm; weeds; hedges. WSP agent.
import * as THREE from 'three';
import { PARK, PATHS, FOUNTAIN, ELM, MOUNDS, CHESS, PLAY_NE, PLAY_NW, DOG_L, DOG_S, PARKHOUSE, ARCH, GARIBALDI, HOLLEY, CIRCLES } from './layout.js';
import { leafTexture, barkTexture } from './textures.js';
import { mergeGeos } from './ground.js';
import { instance } from './furniture.js';

export function buildTrees(world, T) {
  const { ctx, scene, R } = world; const V = world.maskSample;
  const bark = barkTexture(R); const leafA = leafTexture(R, { hue: 96 }), leafB = leafTexture(R, { hue: 84 });

  // ---- placements ---------------------------------------------------------------------------------------------------
  const trees = []; const taken = [];
  const free = (x, z, r) => { for (const t of taken) if (Math.hypot(t[0] - x, t[1] - z) < r) return false; return true; };
  const put = (x, z, s = 1, kind = 0) => { if (!free(x, z, 5.5 * s)) return false; taken.push([x, z]); trees.push({ x, z, s, kind, ry: R() * 6.3 }); return true; };
  const blocked = (x, z) => {
    if (Math.hypot(x, z) < FOUNTAIN.plaza + 1) return true;
    if (Math.abs(x - ARCH.cx) < 14 && z > -75 && z < -28) return true;                       // arch axis stays open
    for (const r of [PLAY_NE, PLAY_NW, DOG_L, DOG_S, PARKHOUSE, CHESS]) if (x > r.x0 - 1.5 && x < r.x1 + 1.5 && z > r.z0 - 1.5 && z < r.z1 + 1.5) return true;
    for (const m of MOUNDS) if (Math.hypot(x - m.x, z - m.z) < m.r + 1) return true;
    for (const c of CIRCLES) if (Math.hypot(x - c.x, z - c.z) < c.r + 1) return true;
    if (Math.hypot(x - GARIBALDI.x, z - GARIBALDI.z) < 5 || Math.hypot(x - HOLLEY.x, z - HOLLEY.z) < 4) return true;
    return false;
  };
  // tree-lined paths: pairs at ~9 m along the main walks, 3.2 m off the edge (inside the lawn, or in pits on paving)
  for (const p of PATHS.slice(0, 12)) {
    let acc = 0, next = 4;
    for (let i = 0; i + 1 < p.pts.length; i++) {
      const [x0, z0] = p.pts[i], [x1, z1] = p.pts[i + 1]; const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
      while (next <= acc + L) { const d = next - acc; const x = x0 + ux * d, z = z0 + uz * d; for (const sd of [-1, 1]) { const tx = x - uz * sd * (p.w / 2 + 3.2), tz = z + ux * sd * (p.w / 2 + 3.2); if (!blocked(tx, tz) && tx > PARK.x0 + 2 && tx < PARK.x1 - 2 && tz > PARK.z0 + 2 && tz < PARK.z1 - 2) put(tx, tz, 0.9 + R() * 0.35); } next += 11 + R() * 4; }
      acc += L;
    }
  }
  // plaza ring in pits (r 25) and the arch flanks
  for (let i = 0; i < 14; i++) { const a = (i + 0.3) / 14 * Math.PI * 2; if (Math.abs(Math.sin(a)) < 0.2 && Math.cos(a) < 0) continue; if (Math.abs(Math.cos(a)) < 0.16) continue; const x = Math.cos(a) * 26, z = Math.sin(a) * 26; if (!blocked(x, z)) put(x, z, 1.1 + R() * 0.25); }
  for (const x of [-20, 23]) for (const z of [-40, -50, -66]) put(x, z, 1.0 + R() * 0.3);
  // lawn scatter
  for (let i = 0; i < 900 && trees.length < 165; i++) {
    const x = PARK.x0 + 3 + R() * (PARK.x1 - PARK.x0 - 6), z = PARK.z0 + 3 + R() * (PARK.z1 - PARK.z0 - 6);
    if (blocked(x, z) || V(x, z) !== 'lawn') continue; put(x, z, 0.8 + R() * 0.5, R() < 0.25 ? 1 : 0);
  }
  // street trees (from the sidewalk tree pits)
  for (const t of world.streetTrees || []) trees.push({ x: t.x, z: t.z, s: t.s, kind: 0, ry: R() * 6.3 });
  // the Hangman's Elm — one big tree
  trees.push({ x: ELM.x, z: ELM.z, s: 2.1, kind: 1, ry: 0.4 });

  // ---- geometry: trunk (tapered, 7 m) + 3 limbs; canopy = 3 vertical crossed cards + 2 horizontal, pivot at the base ---
  const trunkG = []; const tr = new THREE.CylinderGeometry(0.2, 0.45, 8.5, 9); tr.translate(0, 4.25, 0); trunkG.push(tr);
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.4; const l = new THREE.CylinderGeometry(0.08, 0.18, 4.5, 7); l.translate(0, 2.25, 0); l.rotateZ(0.55); l.rotateY(a); l.translate(0, 7.6, 0); trunkG.push(l); }
  const trunkGeo = mergeGeos(trunkG); scaleUV2(trunkGeo, 1.2, 0.4);
  const canG = [];
  for (let i = 0; i < 4; i++) { const q = new THREE.PlaneGeometry(15, 12.5); q.translate(0, 11.8, 0); q.rotateX((i & 1) ? 0.35 : -0.35); q.rotateY(i / 4 * Math.PI + 0.3); canG.push(q); }
  { const q = new THREE.PlaneGeometry(11, 11); q.rotateX(-Math.PI / 2 + 0.5); q.translate(0, 12.5, 0); q.rotateY(1.1); canG.push(q); }
  const canopyGeo = mergeGeos(canG);
  const trunkMat = new THREE.MeshStandardMaterial({ map: bark, roughness: 0.9, color: 0xc9c2b0 });
  const leafMat = (tex) => {
    const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, color: 0xaebb93, emissive: 0x0c1408, transparent: false });
    // foliage cards: light them as if the canopy normal points up (no dark back faces), with a little geometric variation
    m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(mix(normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), normal, 0.25)); nonPerturbedNormal = normal;'); };
    m.customProgramCacheKey = () => 'wsp-leaf';
    return m;
  };
  const kinds = [trees.filter(t => t.kind === 0), trees.filter(t => t.kind === 1)];
  instance(world, trunkGeo, trunkMat, trees, { surface: 'wood', name: 'trunks', collide: [0.4, 6.5, 0.4] });
  const c0 = instance(world, canopyGeo, leafMat(leafA), kinds[0], { surface: 'wood', name: 'canopyA', shadow: true });
  const c1 = instance(world, canopyGeo, leafMat(leafB), kinds[1], { surface: 'wood', name: 'canopyB', shadow: true });
  for (const c of [c0, c1]) if (c) { c.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: c.material.map, alphaTest: 0.75, side: THREE.DoubleSide }); }
  for (const t of trees) if (R() < 0.3) { const a = R() * 6.3; world.cover(t.x + Math.cos(a) * 0.9, t.z + Math.sin(a) * 0.9, Math.cos(a), Math.sin(a)); }
  world.trees = trees;

  // ---- weeds / grass tufts along fences and lawn edges, hedges along the perimeter ---------------------------------
  const tuftTex = weedTexture(R);
  const tuftG = []; for (const rot of [0, Math.PI / 2]) { const q = new THREE.PlaneGeometry(1, 1); q.translate(0, 0.5, 0); q.rotateY(rot); tuftG.push(q); }
  const tufts = [];
  for (let i = 0; i < 1400; i++) { const x = PARK.x0 + 2 + R() * (PARK.x1 - PARK.x0 - 4), z = PARK.z0 + 2 + R() * (PARK.z1 - PARK.z0 - 4); if (V(x, z) !== 'lawn') continue; tufts.push({ x, z, ry: R() * 6.3, s: 0.35 + R() * 0.5 }); }
  instance(world, mergeGeos(tuftG), new THREE.MeshStandardMaterial({ map: tuftTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, color: 0xc7d0a8 }), tufts, { surface: 'ground', name: 'tufts', shadow: false, ray: false });
  // hedges (boxwood blocks) inside the perimeter fence in runs, and shrubs around the park house
  const hedgeG = new THREE.BoxGeometry(3.6, 0.9, 0.9); hedgeG.translate(0, 0.45, 0);
  const hedges = [];
  for (let x = PARK.x0 + 6; x < PARK.x1 - 6; x += 4) for (const z of [PARK.z0 + 2.4, PARK.z1 - 2.4]) { if (V(x, z) !== 'lawn' || R() < 0.25) continue; hedges.push({ x, z, ry: 0 }); }
  for (let z = PARK.z0 + 6; z < PARK.z1 - 6; z += 4) for (const x of [PARK.x0 + 2.4, PARK.x1 - 2.4]) { if (V(x, z) !== 'lawn' || R() < 0.25) continue; hedges.push({ x, z, ry: Math.PI / 2 }); }
  const hedgeTex = hedgeTexture(R);
  instance(world, hedgeG, new THREE.MeshStandardMaterial({ map: hedgeTex, roughness: 0.95, color: 0xb8c9a0 }), hedges, { surface: 'wood', name: 'hedges', collide: [1.8, 0.9, 0.45] });
  for (const h of hedges) if (R() < 0.3) { const nx = h.ry ? 1 : 0, nz = h.ry ? 0 : 1; world.cover(h.x + nx * 1.1, h.z + nz * 1.1, nx, nz); world.cover(h.x - nx * 1.1, h.z - nz * 1.1, -nx, -nz); }
}

function scaleUV2(geo, kx, ky) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * kx, uv.getY(i) * ky); }

function weedTexture(R) {
  const S = 128; const c = document.createElement('canvas'); c.width = S; c.height = S; const g = c.getContext('2d'); g.clearRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) { const x0 = S * 0.5 + (R() - 0.5) * 20; const a = (R() - 0.5) * 1.4; const h = 50 + R() * 70; g.strokeStyle = `hsl(${80 + R() * 30},${40 + R() * 30}%,${30 + R() * 25}%)`; g.lineWidth = 1.5 + R() * 2; g.beginPath(); g.moveTo(x0, S); g.quadraticCurveTo(x0 + Math.sin(a) * h * 0.5, S - h * 0.55, x0 + Math.sin(a) * h, S - h); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function hedgeTexture(R) {
  const S = 256; const c = document.createElement('canvas'); c.width = S; c.height = S; const g = c.getContext('2d'); g.fillStyle = '#2f4a22'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `hsl(${88 + R() * 26},${35 + R() * 30}%,${22 + R() * 30}%)`; g.beginPath(); g.ellipse(R() * S, R() * S, 3 + R() * 5, 2 + R() * 3, R() * 3, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
