// CITY SQUARE trees: plane trees / elms as instanced trunks (bark canvas) + layered alpha canopy cards; the old elm; weeds; hedges. WSP agent.
import * as THREE from 'three';
import { PARK, PATHS, FOUNTAIN, ELM, MOUNDS, CHESS, PLAY_NE, PLAY_NW, DOG_L, DOG_S, PARKHOUSE, ARCH, STATUE_E, STATUE_W, CIRCLES } from './layout.js';
import { leafTexture, barkTexture } from './textures.js';
import { mergeGeos } from './ground.js';
import { instance, buildContactShadows } from './furniture.js';

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
    if (Math.hypot(x - STATUE_E.x, z - STATUE_E.z) < 5 || Math.hypot(x - STATUE_W.x, z - STATUE_W.z) < 4) return true;
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
  // two-layer canopy: an inner dark core (short, tight) and an outer lit shell (wide, ragged), each with its own random
  // card angles so no two cards line up and the silhouette seams do not read as a repeated billboard.
  const canopyLayer = (scale, yBase, n, tilt) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const q = new THREE.PlaneGeometry(15 * scale, 12.5 * scale);
      q.translate(0, yBase, 0); q.rotateZ((R() - 0.5) * 0.35);
      q.rotateX(((i & 1) ? tilt : -tilt) + (R() - 0.5) * 0.3);
      q.rotateY(i / n * Math.PI + R() * 0.55); out.push(q);
    }
    const q = new THREE.PlaneGeometry(11 * scale, 11 * scale); q.rotateX(-Math.PI / 2 + 0.45); q.translate(0, yBase + 0.8, 0); q.rotateY(R() * 3); out.push(q);
    return mergeGeos(out);
  };
  const outerGeo = canopyLayer(1.0, 11.8, 4, 0.35);
  const innerGeo = canopyLayer(0.66, 10.2, 3, 0.55);
  const trunkMat = new THREE.MeshStandardMaterial({ map: bark, roughness: 0.9, color: 0xc9c2b0 });
  /** Leaf card material. `lit` = the sunlit outer shell, otherwise the shaded inner core.
   *  Normals are bent toward +Y so cards do not go black when they face away; a fake translucency term
   *  (emissiveMap = the leaf alpha) puts light back through the canopy the way real backlit foliage does. */
  const leafMat = (tex, lit) => {
    const m = new THREE.MeshStandardMaterial({
      map: tex, alphaTest: lit ? 0.5 : 0.42, side: THREE.DoubleSide, roughness: 0.92, metalness: 0,
      color: lit ? 0x6a9a3c : 0x38592a, emissiveMap: tex, emissive: lit ? 0x54782c : 0x2a4620,
      emissiveIntensity: lit ? 0.3 : 0.26, transparent: false,
    });
    m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(mix(normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), normal, ' + (lit ? '0.42' : '0.25') + ')); nonPerturbedNormal = normal;'); };
    m.customProgramCacheKey = () => 'wsp-leaf-' + (lit ? 'o' : 'i');
    return m;
  };
  const kinds = [trees.filter(t => t.kind === 0), trees.filter(t => t.kind === 1)];
  instance(world, trunkGeo, trunkMat, trees, { surface: 'wood', name: 'trunks', collide: [0.4, 6.5, 0.4] });
  const c0 = instance(world, outerGeo, leafMat(leafA, true), kinds[0], { surface: 'wood', name: 'canopyA', shadow: true });
  const c1 = instance(world, outerGeo, leafMat(leafB, true), kinds[1], { surface: 'wood', name: 'canopyB', shadow: true });
  const i0 = instance(world, innerGeo, leafMat(leafB, false), kinds[0], { surface: 'wood', name: 'canopyAi', shadow: false, ray: false });
  const i1 = instance(world, innerGeo, leafMat(leafA, false), kinds[1], { surface: 'wood', name: 'canopyBi', shadow: false, ray: false });
  for (const c of [c0, c1]) if (c) { c.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: c.material.map, alphaTest: 0.62, side: THREE.DoubleSide }); }
  for (const t of trees) if (R() < 0.3) { const a = R() * 6.3; world.cover(t.x + Math.cos(a) * 0.9, t.z + Math.sin(a) * 0.9, Math.cos(a), Math.sin(a)); }
  for (const t of trees) world.contactBlobs?.push({ x: t.x, z: t.z, s: 2.6 * t.s, y: world.W.groundHeight ? world.W.groundHeight(t.x, t.z) : 0 });
  world.trees = trees;

  // ---- sunflecks: warm additive patches of direct sun that punch through the canopy onto the paving/lawn ----------
  buildSunflecks(world, trees);

  // ---- weeds / grass tufts along fences and lawn edges, hedges along the perimeter ---------------------------------
  const tuftTex = weedTexture(R);
  const tuftG = []; for (const rot of [0, Math.PI / 2]) { const q = new THREE.PlaneGeometry(1, 1); q.translate(0, 0.5, 0); q.rotateY(rot); tuftG.push(q); }
  const tufts = [];
  for (let i = 0; i < 1400; i++) { const x = PARK.x0 + 2 + R() * (PARK.x1 - PARK.x0 - 4), z = PARK.z0 + 2 + R() * (PARK.z1 - PARK.z0 - 4); if (V(x, z) !== 'lawn') continue; tufts.push({ x, z, ry: R() * 6.3, s: 0.35 + R() * 0.5 }); }
  instance(world, mergeGeos(tuftG), new THREE.MeshStandardMaterial({ map: tuftTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, color: 0xc7d0a8 }), tufts, { surface: 'ground', name: 'tufts', shadow: false, ray: false });
  // ---- hedges: a noise-displaced boxwood block on a soil strip, with loose leaf cards breaking the top edge ---------
  const hedgeG = new THREE.BoxGeometry(3.6, 0.95, 0.95, 9, 3, 3); hedgeG.translate(0, 0.475, 0);
  { // push every surface vertex out along its normal by up to 0.1 m of value noise — kills the "solid green box" read
    const p = hedgeG.attributes.position, nAttr = hedgeG.attributes.normal;
    const nz3 = (x, y, z) => { const s = Math.sin(x * 3.1 + y * 5.7 + z * 2.3) + Math.sin(x * 7.9 - z * 4.1) * 0.6 + Math.sin(y * 11.3 + z * 6.7) * 0.4; return s / 2.0; };
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (y < 0.06) continue;                                   // keep the base flat on the ground
      const d = 0.055 + 0.055 * nz3(x, y, z);
      p.setXYZ(i, x + nAttr.getX(i) * d, y + nAttr.getY(i) * d * (y > 0.85 ? 1.4 : 1), z + nAttr.getZ(i) * d);
    }
    hedgeG.computeVertexNormals();
  }
  const hedges = [];
  for (let x = PARK.x0 + 6; x < PARK.x1 - 6; x += 4) for (const z of [PARK.z0 + 2.4, PARK.z1 - 2.4]) { if (V(x, z) !== 'lawn' || R() < 0.25) continue; hedges.push({ x, z, ry: 0 }); }
  for (let z = PARK.z0 + 6; z < PARK.z1 - 6; z += 4) for (const x of [PARK.x0 + 2.4, PARK.x1 - 2.4]) { if (V(x, z) !== 'lawn' || R() < 0.25) continue; hedges.push({ x, z, ry: Math.PI / 2 }); }
  const hedgeTex = hedgeTexture(R);
  const hedgeMat = new THREE.MeshStandardMaterial({ map: hedgeTex, roughness: 0.96, metalness: 0, color: 0x3d5a2a });
  // darker band toward the base (light does not reach into the bottom of a hedge)
  hedgeMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vHY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHY = position.y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vHY;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= mix(0.34, 1.12, smoothstep(0.0, 0.72, vHY));');
  };
  hedgeMat.customProgramCacheKey = () => 'wsp-hedge';
  instance(world, hedgeG, hedgeMat, hedges, { surface: 'wood', name: 'hedges', collide: [1.8, 0.95, 0.5] });
  // 0.2 m soil strip under each hedge (also acts as the contact-shadow footing)
  const soilG = new THREE.BoxGeometry(3.9, 0.2, 1.25); soilG.translate(0, 0.08, 0);
  instance(world, soilG, new THREE.MeshStandardMaterial({ color: 0x3a2e22, roughness: 1 }), hedges, { surface: 'ground', name: 'hedgeSoil', shadow: false, ray: false });
  // 3 loose leaf cards poking out of the top so the silhouette is ragged, not a straight line
  const sprigG = [];
  for (let i = 0; i < 3; i++) { const q = new THREE.PlaneGeometry(1.5, 0.9); q.rotateX((R() - 0.5) * 0.8); q.rotateY(R() * 3); q.translate((i - 1) * 1.15, 1.02, (R() - 0.5) * 0.4); sprigG.push(q); }
  instance(world, mergeGeos(sprigG), new THREE.MeshStandardMaterial({ map: leafA, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95, color: 0x496b31 }), hedges, { surface: 'wood', name: 'hedgeSprigs', shadow: false, ray: false });
  for (const h of hedges) if (R() < 0.3) { const nx = h.ry ? 1 : 0, nz = h.ry ? 0 : 1; world.cover(h.x + nx * 1.1, h.z + nz * 1.1, nx, nz); world.cover(h.x - nx * 1.1, h.z - nz * 1.1, -nx, -nz); }
  for (const h of hedges) world.contactBlobs?.push({ x: h.x, z: h.z, ry: h.ry, ax: 4.4, az: 1.9 });
  world.hedgePlaces = hedges;

  // everything that touches the ground has now registered a blob — build the single contact-shadow mesh
  buildContactShadows(world, world.contactBlobs || []);
}

/** Warm sunflecks on the ground under the canopy: without them the shade is one flat dim green. Additive, no shadow cost. */
function buildSunflecks(world, trees) {
  const { scene, R } = world; const V = world.maskSample; const gh = world.W.groundHeight || (() => 0);
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  for (let i = 0; i < 7; i++) {
    const x = 18 + R() * 92, y = 18 + R() * 92, r = 12 + R() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,244,214,0.95)'); gr.addColorStop(0.55, 'rgba(255,238,196,0.4)'); gr.addColorStop(1, 'rgba(255,230,180,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const places = [];
  for (const t of trees) {
    const n = 2 + ((R() * 3) | 0);
    for (let k = 0; k < n; k++) {
      // the sun is high from the ESE, so flecks land WNW of the trunk
      const a = Math.PI * 0.75 + (R() - 0.5) * 2.1, d = 2.5 + R() * 7 * t.s;
      const x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
      const surf = V ? V(x, z) : 'lawn'; if (surf === 'asphalt') continue;
      places.push({ x, z, ry: R() * 6.3, s: 2.4 + R() * 4.2, y: gh(x, z) });
    }
  }
  if (!places.length) return;
  const geos = [];
  for (const p of places) { const q = new THREE.PlaneGeometry(p.s, p.s); q.rotateX(-Math.PI / 2); q.rotateY(p.ry); q.translate(p.x, p.y + 0.035, p.z); geos.push(q); }
  const m = new THREE.Mesh(mergeGeos(geos), new THREE.MeshBasicMaterial({
    map: tex, color: 0xfff0cc, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
  }));
  m.name = 'sunflecks'; m.renderOrder = 3; m.frustumCulled = false; scene.add(m);
}

function scaleUV2(geo, kx, ky) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * kx, uv.getY(i) * ky); }

function weedTexture(R) {
  const S = 128; const c = document.createElement('canvas'); c.width = S; c.height = S; const g = c.getContext('2d'); g.clearRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) { const x0 = S * 0.5 + (R() - 0.5) * 20; const a = (R() - 0.5) * 1.4; const h = 50 + R() * 70; g.strokeStyle = `hsl(${80 + R() * 30},${40 + R() * 30}%,${30 + R() * 25}%)`; g.lineWidth = 1.5 + R() * 2; g.beginPath(); g.moveTo(x0, S); g.quadraticCurveTo(x0 + Math.sin(a) * h * 0.5, S - h * 0.55, x0 + Math.sin(a) * h, S - h); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function hedgeTexture(R) {
  const S = 256; const c = document.createElement('canvas'); c.width = S; c.height = S; const g = c.getContext('2d'); g.fillStyle = '#25381a'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `hsl(${88 + R() * 26},${35 + R() * 30}%,${22 + R() * 30}%)`; g.beginPath(); g.ellipse(R() * S, R() * S, 3 + R() * 5, 2 + R() * 3, R() * 3, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
