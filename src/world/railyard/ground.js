// RAILYARD ground: dry gravel/dirt yard floor with asphalt aprons, oil stains, pale-dust variation; instanced weed cards. RAILYARD agent.
import * as THREE from 'three';
import { groundMaskTexture, weedTexture } from './mats.js';
import { TRACK_X, PLATFORM, SHED, OFFICE, OVERPASS, DEPOT, ROAD_E, ROAD_W, FENCE } from './layout.js';

export const GROUND_SIZE = 220;

export function buildGround(world, M) {
  const { ctx, scene, R } = world;

  // ---- mask: R asphalt, G oil/grime, B pale dust --------------------------------
  const maskTex = groundMaskTexture(R, GROUND_SIZE, (m) => {
    // asphalt aprons: east + west service roads, depot apron, office forecourt, platform back lane, south gate area
    m.rect('r', ROAD_E.x0, OVERPASS.rampEnd, ROAD_E.x1, FENCE + 4);
    m.rect('r', ROAD_W.x0, OVERPASS.rampEnd, ROAD_W.x1, DEPOT.z0 + 2);
    m.rect('r', DEPOT.x0, DEPOT.z0, DEPOT.x1, DEPOT.z1);
    m.rect('r', OFFICE.x0 - 2, OFFICE.z0 - 4, OFFICE.x1 + 6, OFFICE.z1 + 4);
    m.rect('r', SHED.x1, PLATFORM.z0 - 4, ROAD_E.x0, PLATFORM.z1 + 4);
    m.rect('r', 20, 38, 44, 62);           // SE container/stack yard
    m.rect('r', -6, 60, 16, 66);           // south gate apron (player spawn)
    m.rect('r', -66, -64, 66, -60);        // north boundary road
    // oil / grease: along track centres (drip lines), fuel depot, under wagons
    m.g.globalCompositeOperation = 'lighter';
    for (const tx of TRACK_X) {
      m.g.strokeStyle = 'rgba(0,255,0,0.32)'; m.g.lineWidth = 0.9 * m.pxm; m.g.lineCap = 'round';
      m.g.beginPath(); m.g.moveTo(m.toPx(tx), m.toPx(-66)); m.g.lineTo(m.toPx(tx), m.toPx(66)); m.g.stroke();
    }
    m.g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 90; i++) { const tx = TRACK_X[(R() * TRACK_X.length) | 0]; m.blob('g', tx + (R() - 0.5) * 1.6, (R() - 0.5) * 120, 1 + R() * 3, 2 + R() * 6, 0.35 + R() * 0.45, 5); }
    for (let i = 0; i < 30; i++) m.blob('g', DEPOT.x0 + 4 + R() * 22, DEPOT.z0 + 4 + R() * 28, 1.5 + R() * 4, 1.5 + R() * 4, 0.5 + R() * 0.4, 6);
    for (let i = 0; i < 40; i++) m.blob('g', (R() - 0.5) * 130, (R() - 0.5) * 130, 1 + R() * 3, 1 + R() * 3, 0.25 + R() * 0.35, 4);
    // tyre marks on the roads
    m.g.globalCompositeOperation = 'lighter'; m.g.strokeStyle = 'rgba(0,255,0,0.22)'; m.g.lineWidth = 0.45 * m.pxm;
    for (const rx of [ROAD_E.x0 + 2.4, ROAD_E.x0 + 6.4, ROAD_W.x0 + 2.4, ROAD_W.x0 + 6.4]) { m.g.beginPath(); m.g.moveTo(m.toPx(rx), m.toPx(0)); m.g.lineTo(m.toPx(rx + (R() - 0.5)), m.toPx(60)); m.g.stroke(); }
    m.g.globalCompositeOperation = 'source-over';
    // pale dust / dry patches (B)
    for (let i = 0; i < 160; i++) m.blob('b', (R() - 0.5) * 200, (R() - 0.5) * 200, 4 + R() * 14, 4 + R() * 14, 0.25 + R() * 0.5, 6);
  });

  // ---- material: dirt base, ballast micro-blend, asphalt where mask.r -----------------
  const mat = M.dirt;
  const asphaltSet = { map: M.asphalt.map, nor: M.asphalt.normalMap, arm: M.asphalt.roughnessMap };
  const ballastSet = { map: M.ballast.map };
  const uniforms = { uMask: { value: maskTex }, uWorld: { value: GROUND_SIZE }, uAsMap: { value: asphaltSet.map }, uAsNor: { value: asphaltSet.nor }, uAsArm: { value: asphaltSet.arm }, uBalMap: { value: ballastSet.map } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos; uniform sampler2D uMask, uAsMap, uAsNor, uAsArm, uBalMap; uniform float uWorld;
        vec4 gMask; float gAsph;`)
      .replace('#include <map_fragment>', `
        vec2 muv = vWPos.xz / uWorld + 0.5;
        gMask = texture2D(uMask, muv);
        gAsph = smoothstep(0.35, 0.6, gMask.r);
        vec4 dirtA = texture2D(map, vMapUv);
        vec4 dirtB = texture2D(map, vMapUv * 0.37 + 0.21);
        vec4 bal = texture2D(uBalMap, vMapUv * 1.7);
        // anti-tiling blend + pale dust patches + a hint of loose ballast stones everywhere
        vec4 dirt = mix(dirtA, dirtB, 0.5);
        dirt.rgb = mix(dirt.rgb, bal.rgb * 1.05, 0.35);
        dirt.rgb = mix(dirt.rgb, dirt.rgb * vec3(1.18, 1.14, 1.05), gMask.b * 0.8);
        vec4 asph = texture2D(uAsMap, vMapUv * 0.55);
        vec4 texelColor = mix(dirt, asph * vec4(1.15, 1.15, 1.15, 1.0), gAsph);
        texelColor.rgb *= 1.0 - gMask.g * 0.62;
        diffuseColor *= texelColor;`)
      .replace('#include <normal_fragment_maps>', `
        vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
        vec3 mapA = texture2D( uAsNor, vNormalMapUv * 0.55 ).xyz * 2.0 - 1.0;
        mapN = mix(mapN, mapA * 0.7, gAsph);
        mapN.xy *= normalScale;
        normal = normalize( tbn * mapN );`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float asR = texture2D(uAsArm, vRoughnessMapUv * 0.55).g;
        roughnessFactor = mix(roughnessFactor, asR * 0.95, gAsph);
        roughnessFactor = clamp(roughnessFactor - gMask.g * 0.25, 0.3, 1.0);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.0, gAsph);`);
  };
  mat.customProgramCacheKey = () => 'railyard-ground';
  mat.needsUpdate = true;

  const geo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, 1, 1);
  geo.rotateX(-Math.PI / 2);
  // world UVs: 1 tile per 3.2 m
  const uv = geo.attributes.uv, pos = geo.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 3.2, pos.getZ(i) / 3.2);
  const ground = new THREE.Mesh(geo, mat);
  ground.name = 'ground'; ground.receiveShadow = true; ground.userData.surface = 'ground';
  scene.add(ground); ctx.raycastTargets.push(ground);
  world.ground = ground; world.groundMask = maskTex;
  return ground;
}

/** Weed tufts: instanced crossed alpha cards along ballast shoulders, fences, walls. */
export function buildWeeds(world, spots) {
  const { scene, R } = world;
  const tex = weedTexture(R);
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, color: 0xd8d2b8, transparent: false });
  // two crossed quads, pivot at the base
  const q1 = new THREE.PlaneGeometry(1, 1); q1.translate(0, 0.5, 0);
  const q2 = q1.clone(); q2.rotateY(Math.PI / 2);
  const geo = mergeSimple([q1, q2]);
  const im = new THREE.InstancedMesh(geo, mat, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
  for (let i = 0; i < spots.length; i++) {
    const sp = spots[i]; const sc = sp.s ?? (0.45 + R() * 0.6);
    e.set(0, R() * Math.PI, 0); q.setFromEuler(e); p.set(sp.x, sp.y ?? 0, sp.z); s.set(sc * (0.8 + R() * 0.5), sc, sc * (0.8 + R() * 0.5));
    im.setMatrixAt(i, m.compose(p, q, s));
  }
  im.instanceMatrix.needsUpdate = true; im.castShadow = false; im.receiveShadow = true; im.name = 'weeds'; im.frustumCulled = false;
  scene.add(im);
  return im;
}

function mergeSimple(geos) {
  const g = new THREE.BufferGeometry(); const pos = [], nor = [], uv = [];
  for (const q of geos) { const n = q.toNonIndexed(); pos.push(...n.attributes.position.array); nor.push(...n.attributes.normal.array); uv.push(...n.attributes.uv.array); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
