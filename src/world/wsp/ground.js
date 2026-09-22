// CITY SQUARE ground: one fine grid mesh (1 m cells) over the core with a painted mask blending lawn / hex pavers / asphalt / sidewalk / rubber / gravel;
// mounds + the sunken fountain pit come from W.groundHeight (also used by player + AI). Fountain steps, basin, water. WSP agent.
import * as THREE from 'three';
import { CORE, PARK, STREETS, FOUNTAIN, PATHS, PAVED_RECTS, MOUNDS, CIRCLES, PLAY_NE, PLAY_NW, DOG_L, DOG_S, BUILDINGS } from './layout.js';
import { makeMask, hexPaverTexture, graniteTexture, sidewalkTexture } from './textures.js';

const F = FOUNTAIN;
export function pitDepth(r) {
  if (r < F.r) return F.floor;
  for (let i = 0; i < F.steps; i++) if (r < F.r + F.tread * (i + 1)) return F.floor + F.rise * (i + 1);
  return 0;
}
export function moundHeight(x, z) {
  let y = 0;
  for (const m of MOUNDS) { const d = Math.hypot(x - m.x, z - m.z) / m.r; if (d < 1) { const k = 0.5 + 0.5 * Math.cos(d * Math.PI); y = Math.max(y, m.h * k * k); } }
  return y;
}
export function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  if (r < F.r + F.tread * F.steps) return pitDepth(r);
  return moundHeight(x, z);
}

export function buildGround(world, T) {
  const { ctx, scene, R } = world;
  const hex = hexPaverTexture(R), side = sidewalkTexture(R), granite = graniteTexture(R, { tone: 168 });
  world.tex = Object.assign(world.tex || {}, { hex, side, granite });

  // ---- mask (R hex pavers · G asphalt · B sidewalk · R+G rubber · R+B gravel) ------------------------------------------
  const mask = makeMask(CORE, 3, (m) => {
    // outside the park: sidewalk everywhere between building lines, then roadways
    m.rect('b', CORE.x0, CORE.z0, CORE.x1, PARK.z0); m.rect('b', CORE.x0, PARK.z1, CORE.x1, CORE.z1);
    m.rect('b', CORE.x0, CORE.z0, PARK.x0, CORE.z1); m.rect('b', PARK.x1, CORE.z0, CORE.x1, CORE.z1);
    for (const s of STREETS) { if (s.axis === 'x') m.rect('g', s.a0, s.r0, s.a1, s.r1); else m.rect('g', s.r0, s.a0, s.r1, s.a1); }
    // the library raised plaza + the two side plazas are paved (hex/granite)
    m.rect('r', 64, 83, 134, 89); m.rect('r', 128, 86, 146, 160); m.rect('r', 140, 83, 150, 89);
    // park: paths + plazas
    for (const p of PATHS) m.path('r', p.pts, p.w);
    for (const r of PAVED_RECTS) m.rect('r', r.x0, r.z0, r.x1, r.z1);
    m.circle('r', 0, 0, F.plaza);
    for (const c of CIRCLES) m.circle('r', c.x, c.z, c.r);
    // playgrounds (rubber = R+G) and dog runs (gravel = R+B)
    m.g.globalCompositeOperation = 'lighter';
    for (const p of [PLAY_NE, PLAY_NW]) { m.rect('r', p.x0, p.z0, p.x1, p.z1); m.rect('g', p.x0, p.z0, p.x1, p.z1); }
    for (const d of [DOG_L, DOG_S]) { m.rect('r', d.x0, d.z0, d.x1, d.z1); m.rect('b', d.x0, d.z0, d.x1, d.z1); }
    m.g.globalCompositeOperation = 'source-over';
    // tree pits along the outer sidewalks are drawn later as meshes; lawn strips on the College Place median
    m.rect('k', 57.5, 88, 59.5, 150);
  });

  // ---- material ---------------------------------------------------------------------------------------------------
  const mat = new THREE.MeshStandardMaterial({ map: T.grass, normalMap: T.grassN, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.95, metalness: 0, color: 0xffffff });
  const U = { uMask: { value: mask }, uA: { value: new THREE.Vector4(CORE.x0, CORE.z0, CORE.x1 - CORE.x0, CORE.z1 - CORE.z0) }, uHex: { value: hex }, uAsph: { value: T.asphalt }, uAsphN: { value: T.asphaltN }, uSide: { value: side }, uGran: { value: granite } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos; uniform sampler2D uMask, uHex, uAsph, uAsphN, uSide, uGran; uniform vec4 uA;
        float gHex, gAsp, gSide, gRub, gGrv, gLawn;
        float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float nz(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hsh(i), hsh(i + vec2(1, 0)), f.x), mix(hsh(i + vec2(0, 1)), hsh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `
        vec2 muv = (vWPos.xz - uA.xy) / uA.zw;
        vec4 mk = texture2D(uMask, muv);
        gRub = smoothstep(0.4, 0.7, min(mk.r, mk.g)); gGrv = smoothstep(0.4, 0.7, min(mk.r, mk.b));
        gHex = smoothstep(0.35, 0.65, mk.r) * (1.0 - gRub) * (1.0 - gGrv);
        gAsp = smoothstep(0.35, 0.65, mk.g) * (1.0 - gRub);
        gSide = smoothstep(0.35, 0.65, mk.b) * (1.0 - gGrv) * (1.0 - gAsp);
        gLawn = clamp(1.0 - gHex - gAsp - gSide - gRub - gGrv, 0.0, 1.0);
        vec2 wp = vWPos.xz;
        vec4 grassA = texture2D(map, wp / 4.0); vec4 grassB = texture2D(map, wp / 9.7 + 0.37);
        vec4 lawn = mix(grassA, grassB, 0.45); lawn.rgb *= vec3(0.52, 0.68, 0.36);
        float wear = nz(wp * 0.08) * 0.6 + nz(wp * 0.31) * 0.4;  // worn / dry patches
        lawn.rgb = mix(lawn.rgb, lawn.rgb * vec3(1.15, 1.05, 0.75), smoothstep(0.6, 0.85, wear) * 0.45);
        vec4 hexc = texture2D(uHex, wp / 2.0);
        vec4 asph = texture2D(uAsph, wp / 7.0); asph.rgb *= 0.85;
        vec4 sidec = texture2D(uSide, wp / 3.0);
        vec4 rub = vec4(0.22, 0.24, 0.30, 1.0) * (0.85 + 0.3 * nz(wp * 0.7));
        vec4 grv = texture2D(uGran, wp / 1.3) * vec4(0.95, 0.9, 0.82, 1.0);
        vec4 texelColor = lawn * gLawn + hexc * gHex + asph * gAsp + sidec * gSide + rub * gRub + grv * gGrv;
        // shade of dirt where lawn meets pavement, faint crosswalk-free tyre polish on roads
        texelColor.rgb *= 1.0 - 0.12 * gAsp * smoothstep(0.3, 0.7, nz(wp * 0.05));
        diffuseColor *= texelColor;`)
      .replace('#include <normal_fragment_maps>', `
        vec3 mapN = texture2D( normalMap, vWPos.xz / 4.0 ).xyz * 2.0 - 1.0;
        vec3 mapA = texture2D( uAsphN, vWPos.xz / 7.0 ).xyz * 2.0 - 1.0;
        mapN = mix(mapN * vec3(normalScale, 1.0), mapA * vec3(0.5, 0.5, 1.0), 1.0 - gLawn);
        normal = normalize( tbn * mapN );`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = 0.95 * gLawn + 0.72 * gHex + 0.8 * gAsp + 0.88 * gSide + 0.85 * gRub + 0.95 * gGrv;`);
  };
  mat.customProgramCacheKey = () => 'wsp-ground';

  // ---- fine grid mesh (1 m) displaced by groundHeight (pit region pushed below the floor slabs) ---------------------
  const W = CORE.x1 - CORE.x0, H = CORE.z1 - CORE.z0;
  const geo = new THREE.PlaneGeometry(W, H, W, H); geo.rotateX(-Math.PI / 2); geo.translate((CORE.x0 + CORE.x1) / 2, 0, (CORE.z0 + CORE.z1) / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i); const r = Math.hypot(x, z);
    pos.setY(i, r < F.coping - 2.0 ? F.floor - 0.12 : moundHeight(x, z));
  }
  geo.computeVertexNormals(); geo.computeBoundingSphere();
  // uv attribute unused by the shader (world-space uvs) but keep it valid
  const ground = new THREE.Mesh(geo, mat); ground.name = 'ground'; ground.receiveShadow = true; ground.userData.surface = 'ground';
  scene.add(ground); ctx.raycastTargets.push(ground);
  world.ground = ground; world.groundMask = mask;
  // CPU-side mask sampling for placement / surfaceAt
  const mc = mask.image, mg = mc.getContext('2d'), mpx = mc.width / (CORE.x1 - CORE.x0);
  const mdata = mg.getImageData(0, 0, mc.width, mc.height).data;
  world.maskSample = (x, z) => {
    const px = Math.floor((x - CORE.x0) * mpx), pz = Math.floor((z - CORE.z0) * mpx);
    if (px < 0 || pz < 0 || px >= mc.width || pz >= mc.height) return 'side';
    const i = (pz * mc.width + px) * 4; const r = mdata[i], g = mdata[i + 1], b = mdata[i + 2];
    if (r > 120 && g > 120) return 'rubber'; if (r > 120 && b > 120) return 'gravel'; if (r > 120) return 'hex'; if (g > 120) return 'asphalt'; if (b > 120) return 'side'; return 'lawn';
  };

  // ---- outer apron beyond the core (flat, cheap) ------------------------------------------------------------------
  const apShape = new THREE.Shape(); apShape.moveTo(-700, -700); apShape.lineTo(700, -700); apShape.lineTo(700, 700); apShape.lineTo(-700, 700); apShape.closePath();
  const apHole = new THREE.Path(); apHole.moveTo(CORE.x0 + 0.5, CORE.z0 + 0.5); apHole.lineTo(CORE.x1 - 0.5, CORE.z0 + 0.5); apHole.lineTo(CORE.x1 - 0.5, CORE.z1 - 0.5); apHole.lineTo(CORE.x0 + 0.5, CORE.z1 - 0.5); apHole.closePath(); apShape.holes.push(apHole);
  const apGeo = new THREE.ShapeGeometry(apShape); apGeo.rotateX(-Math.PI / 2); const apUV = apGeo.attributes.uv, apP = apGeo.attributes.position; for (let i = 0; i < apUV.count; i++) apUV.setXY(i, apP.getX(i) / 7, apP.getZ(i) / 7);
  const apron = new THREE.Mesh(apGeo, new THREE.MeshStandardMaterial({ map: T.asphalt, roughness: 0.9, color: 0x9a9a98 }));
  apron.position.y = -0.03; apron.receiveShadow = true; apron.name = 'apron'; scene.add(apron);

  // ---- fountain: sunken granite plaza (3 step rings, 1.05 m), basin, central plinth, jets + mist -------------------
  const floorTex = graniteTexture(R, { tone: 141, slabs: [2, 2], joint: 4 });      // 512 px = 2.4 m → 1.2 m slabs, #8d8d88
  const granMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.72, metalness: 0.0, color: 0x84847e, side: THREE.DoubleSide });
  const parts = [];
  const ring = (r0, r1, y) => { const g = new THREE.RingGeometry(r0, r1, 96, 1); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); worldUV(g, 2.4); parts.push(g); };
  const wall = (r, y0, y1) => { const g = new THREE.CylinderGeometry(r, r, y1 - y0, 96, 1, true); g.translate(0, (y0 + y1) / 2, 0); worldUV(g, 2.4); parts.push(g); };
  ring(0, F.r, F.floor);                       // sunken floor
  for (let i = 0; i < F.steps; i++) { const r0 = F.r + i * F.tread, y = F.floor + F.rise * (i + 1); wall(r0, y - F.rise, y); ring(r0, r0 + F.tread, y); }
  ring(F.r + F.steps * F.tread, F.coping, 0.02); // coping band at grade
  wall(F.coping, -0.3, 0.02);
  // scribed concentric joint rings across the sunken floor (the ref plaza is set out in circles, not a plain slab field)
  const jointG = [];
  for (let r0 = 2.2; r0 < F.r - 0.3; r0 += 1.55) { const rg = new THREE.RingGeometry(r0, r0 + 0.05, 96, 1); rg.rotateX(-Math.PI / 2); rg.translate(0, F.floor + 0.012, 0); jointG.push(rg); }
  { const jm = new THREE.Mesh(mergeGeos(jointG), new THREE.MeshStandardMaterial({ color: 0x585853, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    jm.name = 'fountainJoints'; jm.receiveShadow = true; scene.add(jm); }
  const fm = new THREE.Mesh(mergeGeos(parts), granMat); fm.name = 'fountainSteps'; fm.receiveShadow = true; fm.castShadow = true; fm.userData.surface = 'concrete'; scene.add(fm); ctx.raycastTargets.push(fm);
  // step ring colliders: 48 tangential AABB segments per ring (step-up ≤ 0.45 m keeps them walkable); groundHeight mirrors them for the player/AI floor
  for (let i = 0; i < F.steps; i++) { const r0 = F.r + i * F.tread, r1 = r0 + F.tread, top = F.floor + F.rise * (i + 1); const n = 48; for (let k = 0; k < n; k++) { const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2; const xs = [Math.cos(a0) * r0, Math.cos(a1) * r0, Math.cos(a0) * r1, Math.cos(a1) * r1], zs = [Math.sin(a0) * r0, Math.sin(a1) * r0, Math.sin(a0) * r1, Math.sin(a1) * r1]; ctx.colliders.push(new THREE.Box3(new THREE.Vector3(Math.min(...xs), F.floor - 0.2, Math.min(...zs)), new THREE.Vector3(Math.max(...xs), top, Math.max(...zs)))); } }
  // basin: granite rim r 4.2 (0.45 high, 0.5 wide), water inside, raised dark-granite plinth r 2 in the centre
  const rimMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.66, color: 0x93918a });
  const rimG = new THREE.RingGeometry(F.basinR, F.basinR + 0.5, 64); rimG.rotateX(-Math.PI / 2); rimG.translate(0, F.floor + F.basinH, 0); worldUV(rimG, 2.4);
  const rimW = new THREE.CylinderGeometry(F.basinR + 0.5, F.basinR + 0.5, F.basinH, 64, 1, true); rimW.translate(0, F.floor + F.basinH / 2, 0); worldUV(rimW, 2.4);
  const rimIn = new THREE.CylinderGeometry(F.basinR, F.basinR, F.basinH, 64, 1, true); rimIn.translate(0, F.floor + F.basinH / 2, 0); worldUV(rimIn, 2.4);
  const rim = new THREE.Mesh(mergeGeos([rimG, rimW, rimIn]), rimMat); rim.material.side = THREE.DoubleSide; rim.castShadow = rim.receiveShadow = true; rim.userData.surface = 'concrete'; scene.add(rim); ctx.raycastTargets.push(rim);
  { const n = 32; for (let k = 0; k < n; k++) { const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2; const r0 = F.basinR - 0.05, r1 = F.basinR + 0.5; const xs = [Math.cos(a0) * r0, Math.cos(a1) * r0, Math.cos(a0) * r1, Math.cos(a1) * r1], zs = [Math.sin(a0) * r0, Math.sin(a1) * r0, Math.sin(a0) * r1, Math.sin(a1) * r1]; ctx.colliders.push(new THREE.Box3(new THREE.Vector3(Math.min(...xs), F.floor - 0.1, Math.min(...zs)), new THREE.Vector3(Math.max(...xs), F.floor + F.basinH, Math.max(...zs)))); } }
  const plinthMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.78, color: 0x8c8c85 });
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(F.plinthR + 0.35, F.plinthR + 0.6, F.plinthH * 0.62, 48), plinthMat); plinth.position.y = F.floor + F.plinthH * 0.31; plinth.castShadow = plinth.receiveShadow = true; plinth.userData.surface = 'concrete'; scene.add(plinth); ctx.raycastTargets.push(plinth);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(F.plinthR + 0.5, F.plinthR + 0.5, 0.1, 48), plinthMat); cap.position.y = F.floor + F.plinthH * 0.62 + 0.05; cap.castShadow = true; scene.add(cap);
  ctx.colliders.push(new THREE.Box3(new THREE.Vector3(-F.plinthR - 0.25, F.floor - 0.1, -F.plinthR - 0.25), new THREE.Vector3(F.plinthR + 0.25, F.floor + F.plinthH + 0.12, F.plinthR + 0.25)));
  { const holes = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, r = F.plinthR * 0.55; const hg = new THREE.CircleGeometry(0.14, 12); hg.rotateX(-Math.PI / 2); hg.translate(Math.cos(a) * r, F.floor + F.plinthH * 0.62 + 0.105, Math.sin(a) * r); holes.push(hg); }
    const hg2 = new THREE.CircleGeometry(0.2, 14); hg2.rotateX(-Math.PI / 2); hg2.translate(0, F.floor + F.plinthH * 0.62 + 0.105, 0); holes.push(hg2);
    const hm = new THREE.Mesh(mergeGeos(holes), new THREE.MeshStandardMaterial({ color: 0x2a2c2b, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); hm.name = 'jetHoles'; scene.add(hm); }
  const waterMat = new THREE.MeshPhysicalMaterial({ color: 0x4c625e, roughness: 0.14, metalness: 0.0, transparent: true, opacity: 0.72, envMapIntensity: 0.9, clearcoat: 1, clearcoatRoughness: 0.08 });
  const water = new THREE.Mesh(new THREE.RingGeometry(F.plinthR + 0.1, F.basinR, 64), waterMat); water.rotation.x = -Math.PI / 2; water.position.y = F.floor + 0.32; water.name = 'water'; water.userData.surface = 'water'; scene.add(water); ctx.raycastTargets.push(water);
  // jets: translucent tapered columns (additive, alpha-blended) from the plinth top and a ring of 12 on the basin floor, plus mist quads near the tops
  const jetTex = jetColumnTexture(); const jetMat = new THREE.MeshBasicMaterial({ map: jetTex, color: 0xd6e6ef, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true });
  const jgeos = [];
  const jet = (x, z, y0, h, r) => { const g = new THREE.CylinderGeometry(r * 0.35, r, h, 12, 1, true); g.translate(0, h / 2, 0); g.translate(x, y0, z); jgeos.push(g); const cone = new THREE.CylinderGeometry(0.02, r * 0.9, h * 1.15, 10, 1, true); cone.translate(0, h * 1.15 / 2, 0); cone.translate(x, y0, z); jgeos.push(cone); };
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; jet(Math.cos(a) * 3.35, Math.sin(a) * 3.35, F.floor + 0.3, 2.4, 0.16); }
  jet(0, 0, F.floor + F.plinthH * 0.62 + 0.12, 7.0, 0.3); jet(0.4, 0.26, F.floor + F.plinthH * 0.62 + 0.12, 5.2, 0.2); jet(-0.4, -0.26, F.floor + F.plinthH * 0.62 + 0.12, 4.4, 0.17);
  const jetsMesh = new THREE.Mesh(mergeGeos(jgeos), jetMat); jetsMesh.name = 'jets'; jetsMesh.renderOrder = 5; scene.add(jetsMesh);
  const mistTex = mistTexture(); const mistMat = new THREE.MeshBasicMaterial({ map: mistTex, color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const mistG = [];
  const mist = (x, y, z, s) => { for (const rot of [0.3, 1.35, 2.4]) { const q = new THREE.PlaneGeometry(s, s * 0.8); q.rotateY(rot); q.translate(x, y, z); mistG.push(q); } };
  mist(0, F.floor + 6.4, 0, 4.2); mist(0, F.floor + 4.2, 0, 3.0); mist(0, F.floor + 1.2, 0, 6.2);
  const mistMesh = new THREE.Mesh(mergeGeos(mistG), mistMat); mistMesh.name = 'mist'; mistMesh.renderOrder = 6; scene.add(mistMesh);
  let t = 0;
  world.updaters.push((dt) => { t += dt; jetsMesh.scale.y = 1 + Math.sin(t * 2.3) * 0.05; jetMat.opacity = 0.3 + Math.sin(t * 3.1) * 0.05; mistMat.opacity = 0.3 + Math.sin(t * 1.7) * 0.07; mistMesh.rotation.y = t * 0.15; });

  return ground;
}

function worldUV(g, scale) {
  const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / scale, (p.getZ(i) + p.getY(i)) / scale);
}
export function mergeGeos(geos) {
  const out = new THREE.BufferGeometry(); const pos = [], nor = [], uv = [];
  for (const q of geos) { const n = q.index ? q.toNonIndexed() : q; pos.push(...n.attributes.position.array); nor.push(...n.attributes.normal.array); uv.push(...n.attributes.uv.array); }
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}
function jetColumnTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(255,255,255,0.05)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0.75)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
  const gx = g.createLinearGradient(0, 0, 64, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.35, 'rgba(0,0,0,0)'); gx.addColorStop(0.65, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, 64, 256); g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.35})`; g.fillRect(8 + Math.random() * 48, Math.random() * 256, 1, 4 + Math.random() * 14); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
function mistTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,0.8)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function sprayTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0.4)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(32, 0); g.quadraticCurveTo(0, 60, 6, 128); g.lineTo(58, 128); g.quadraticCurveTo(64, 60, 32, 0); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
