// GPU rain: camera-following streak volume + roof-edge drip curtains, lit by nearby lamps. WORLD agent.
import * as THREE from 'three';
import { WAREHOUSE, DOCK } from './structures.js';
import { FOG_COLOR } from './sky.js';

const MAXL = 12;

function makeRainSystem(world, { count, box, center = null, follow = true, speed = 10, width = 0.005, length = 0.3, alpha = 0.32, wind = [0.9, 0, 0.35] }) {
  const { ctx, scene, W, R } = world;
  const seeds = new Float32Array(count * 4 * 4), corners = new Float32Array(count * 4 * 2), idx = new Uint32Array(count * 6);
  for (let i = 0; i < count; i++) {
    const s = [R(), R(), R(), R()];
    for (let k = 0; k < 4; k++) { seeds.set(s, (i * 4 + k) * 4); corners[(i * 4 + k) * 2] = (k & 1) ? 1 : -1; corners[(i * 4 + k) * 2 + 1] = (k & 2) ? 1 : 0; }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 4 * 3), 3)); // unused, keeps three happy
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  g.setAttribute('aCorner', new THREE.BufferAttribute(corners, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const lampPos = [], lampCol = [];
  const lamps = [...W.lampPositions].sort((a, b) => b.intensity - a.intensity).slice(0, MAXL);
  for (let i = 0; i < MAXL; i++) { const l = lamps[i]; lampPos.push(l ? new THREE.Vector3(l.x, l.y, l.z) : new THREE.Vector3(0, -999, 0)); lampCol.push(l ? l.color.clone().multiplyScalar(l.intensity / 600) : new THREE.Color(0)); }

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...box) }, uCenter: { value: new THREE.Vector3() },
      uWind: { value: new THREE.Vector3(...wind) }, uSpeed: { value: speed }, uWidth: { value: width }, uLen: { value: length }, uAlpha: { value: alpha },
      uLampPos: { value: lampPos }, uLampCol: { value: lampCol }, uFog: { value: FOG_COLOR.clone() }, uFogD: { value: 0.0105 },
    },
    vertexShader: `
      attribute vec4 aSeed; attribute vec2 aCorner;
      uniform float uTime, uSpeed, uWidth, uLen, uAlpha, uFogD; uniform vec3 uCam, uBox, uCenter, uWind, uFog;
      uniform vec3 uLampPos[${MAXL}]; uniform vec3 uLampCol[${MAXL}];
      varying vec2 vUv; varying vec3 vCol; varying float vA;
      void main(){
        float spd = uSpeed * (0.8 + aSeed.w * 0.5);
        vec3 p = aSeed.xyz * uBox;
        p.y -= uTime * spd; p.xz += uWind.xz * uTime * (0.6 + aSeed.w * 0.8);
        vec3 c = uCenter;
        p = mod(p - c + uBox * 0.5, uBox) - uBox * 0.5 + c;
        vec3 d = normalize(vec3(uWind.x * 0.25, -spd, uWind.z * 0.25));
        vec3 toCam = normalize(uCam - p);
        vec3 right = normalize(cross(d, toCam));
        float L = uLen * (0.6 + aSeed.w * 0.8);
        vec3 wp = p + d * (aCorner.y * L) + right * (aCorner.x * uWidth);
        // lighting from nearby lamps
        vec3 col = vec3(0.10, 0.12, 0.16) * 0.22;
        for (int i = 0; i < ${MAXL}; i++) {
          vec3 dl = uLampPos[i] - p; float dd = dot(dl, dl);
          col += uLampCol[i] * (0.55 / (1.0 + dd * 0.16));
        }
        col = min(col, vec3(1.3));
        float dist = length(uCam - p);
        float near = smoothstep(0.7, 2.6, dist);
        float far = 1.0 - smoothstep(uBox.x * 0.33, uBox.x * 0.5, dist);
        float fog = exp(-uFogD * uFogD * dist * dist);
        vCol = mix(uFog * 0.5, col, fog); vA = uAlpha * near * far;
        vUv = aCorner;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: `
      varying vec2 vUv; varying vec3 vCol; varying float vA;
      void main(){
        float ax = 1.0 - vUv.x * vUv.x;
        float ay = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y));
        float a = ax * ay * vA;
        gl_FragColor = vec4(vCol * a, a);
      }`,
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 20; mesh.name = 'rain';
  scene.add(mesh);
  if (center) mat.uniforms.uCenter.value.set(...center);
  world.updaters.push((dt) => {
    mat.uniforms.uTime.value += dt;
    mat.uniforms.uCam.value.copy(ctx.camera.position);
    if (follow) mat.uniforms.uCenter.value.copy(ctx.camera.position);
    mesh.visible = ctx.settings.rain !== false;
  });
  return mesh;
}

export function buildRain(world) {
  const q = world.ctx.settings.quality;
  const count = q === 'low' ? 1500 : q === 'medium' ? 3500 : q === 'high' ? 6000 : 9000;
  makeRainSystem(world, { count, box: [44, 26, 44], follow: true });
  // heavier, closer sheet for foreground streak detail
  makeRainSystem(world, { count: Math.round(count * 0.2), box: [14, 10, 14], follow: true, width: 0.006, length: 0.36, alpha: 0.4, speed: 11 });
  // roof-edge drip curtains: warehouse front eave & dock canopy
  const wh = WAREHOUSE, dk = DOCK;
  makeRainSystem(world, { count: 700, box: [wh.x1 - wh.x0, wh.h + 0.3, 0.35], center: [(wh.x0 + wh.x1) / 2, (wh.h + 0.3) / 2, wh.z1 + 0.45], follow: false, speed: 7, width: 0.008, length: 0.45, alpha: 0.6, wind: [0, 0, 0] });
  makeRainSystem(world, { count: 260, box: [0.3, 4.2, dk.z1 - dk.z0 + 2], center: [dk.x1 + 2.2, 2.1, (dk.z0 + dk.z1) / 2], follow: false, speed: 6.5, width: 0.008, length: 0.4, alpha: 0.6, wind: [0, 0, 0] });
  // gutter streams: a few thick vertical drip lines from roof corners
  for (const [x, z] of [[wh.x0 + 1, wh.z1 + 0.6], [wh.x1 - 1, wh.z1 + 0.6], [dk.x1 + 2.5, dk.z0 - 0.5]]) {
    makeRainSystem(world, { count: 60, box: [0.12, 9.5, 0.12], center: [x, 4.75, z], follow: false, speed: 8, width: 0.014, length: 0.8, alpha: 0.7, wind: [0, 0, 0] });
  }
}
