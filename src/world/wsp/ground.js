// WSP ground: one fine grid mesh (1 m cells) over the core with a painted mask blending lawn / hex pavers / asphalt / sidewalk / rubber / gravel;
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
  const hex = hexPaverTexture(R), side = sidewalkTexture(R), granite = graniteTexture(R);
  world.tex = Object.assign(world.tex || {}, { hex, side, granite });

  // ---- mask (R hex pavers · G asphalt · B sidewalk · R+G rubber · R+B gravel) ------------------------------------------
  const mask = makeMask(CORE, 3, (m) => {
    // outside the park: sidewalk everywhere between building lines, then roadways
    m.rect('b', CORE.x0, CORE.z0, CORE.x1, PARK.z0); m.rect('b', CORE.x0, PARK.z1, CORE.x1, CORE.z1);
    m.rect('b', CORE.x0, CORE.z0, PARK.x0, CORE.z1); m.rect('b', PARK.x1, CORE.z0, CORE.x1, CORE.z1);
    for (const s of STREETS) { if (s.axis === 'x') m.rect('g', s.a0, s.r0, s.a1, s.r1); else m.rect('g', s.r0, s.a0, s.r1, s.a1); }
    // Bobst raised plaza + Schwartz plaza + Gould plaza are paved (hex/granite)
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
    // tree pits along the outer sidewalks are drawn later as meshes; lawn strips on LaGuardia median
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
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ map: T.asphalt, roughness: 0.9, color: 0x9a9a98 }));
  apron.material.map.repeat.set(200, 200); apron.rotation.x = -Math.PI / 2; apron.position.y = -0.03; apron.receiveShadow = true; apron.name = 'apron'; scene.add(apron);

  // ---- fountain: floor slab, steps, coping, basin, water ---------------------------------------------------------
  const granMat = new THREE.MeshStandardMaterial({ map: granite, roughness: 0.6, metalness: 0.02, color: 0xbdbcb8, side: THREE.DoubleSide });
  granite.repeat.set(1, 1);
  const parts = [];
  const ring = (r0, r1, y) => { const g = new THREE.RingGeometry(r0, r1, 96, 1); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); worldUV(g, 2); parts.push(g); };
  const wall = (r, y0, y1) => { const g = new THREE.CylinderGeometry(r, r, y1 - y0, 96, 1, true); g.translate(0, (y0 + y1) / 2, 0); worldUV(g, 2); parts.push(g); };
  ring(0, F.r, F.floor);                       // sunken floor
  for (let i = 0; i < F.steps; i++) { const r0 = F.r + i * F.tread, y = F.floor + F.rise * (i + 1); wall(r0, y - F.rise, y); ring(r0, r0 + F.tread, y); }
  ring(F.r + F.steps * F.tread, F.coping, 0.02); // coping band at grade
  wall(F.coping, -0.3, 0.02);
  const fountainGeo = mergeGeos(parts);
  const fm = new THREE.Mesh(fountainGeo, granMat); fm.name = 'fountainSteps'; fm.receiveShadow = true; fm.castShadow = true; fm.userData.surface = 'concrete'; scene.add(fm); ctx.raycastTargets.push(fm);
  // steps are handled by groundHeight (player + AI); the floor is walkable
  // central basin: low granite rim + inner floor + water plane, jets
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(F.basinR + 0.45, F.basinR + 0.45, F.basinH, 64, 1, false), granMat);
  rim.position.y = F.floor + F.basinH / 2; rim.castShadow = rim.receiveShadow = true; rim.userData.surface = 'concrete'; scene.add(rim); ctx.raycastTargets.push(rim);
  ctx.colliders.push(new THREE.Box3(new THREE.Vector3(-F.basinR - 0.45, F.floor - 0.1, -F.basinR - 0.45), new THREE.Vector3(F.basinR + 0.45, F.floor + F.basinH, F.basinR + 0.45)));
  const waterMat = new THREE.MeshPhysicalMaterial({ color: 0x3a5f6e, roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.86, envMapIntensity: 1.2, clearcoat: 1, clearcoatRoughness: 0.05 });
  const water = new THREE.Mesh(new THREE.CircleGeometry(F.basinR, 48), waterMat); water.rotation.x = -Math.PI / 2; water.position.y = F.floor + F.basinH + 0.005; water.name = 'water'; water.userData.surface = 'water'; scene.add(water); ctx.raycastTargets.push(water);
  // jets: a ring of spray quads (crossed, additive-ish alpha) merged into one mesh; scaled in updaters via uniform time
  const sprTex = sprayTexture(); const jetMat = new THREE.MeshBasicMaterial({ map: sprTex, color: 0xf4f8fa, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const jgeos = []; const jets = 12;
  const jet = (x, z, h, w) => { for (const rot of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) { const q = new THREE.PlaneGeometry(w, h); q.translate(0, h / 2, 0); q.rotateY(rot); q.translate(x, F.floor + F.basinH, z); jgeos.push(q); } };
  for (let i = 0; i < jets; i++) { const a = i / jets * Math.PI * 2; jet(Math.cos(a) * 1.9, Math.sin(a) * 1.9, 2.4, 0.5); }
  jet(0, 0, 6.5, 1.3); jet(0.2, 0.1, 5.2, 1.0);
  const jetsMesh = new THREE.Mesh(mergeGeos(jgeos), jetMat); jetsMesh.name = 'jets'; jetsMesh.renderOrder = 5; scene.add(jetsMesh);
  let t = 0;
  world.updaters.push((dt) => { t += dt; jetsMesh.scale.y = 1 + Math.sin(t * 2.3) * 0.06; jetMat.opacity = 0.55 + Math.sin(t * 3.1) * 0.06; });

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
function sprayTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0.4)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(32, 0); g.quadraticCurveTo(0, 60, 6, 128); g.lineTo(58, 128); g.quadraticCurveTo(64, 60, 32, 0); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
