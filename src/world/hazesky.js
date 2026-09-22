// Shared day-sky dome for the HDRI maps (railyard, wsp, sbu). Owned by: main (integration).
// scene.background draws the HDRI un-fogged, so the fogged ground met the sky at a razor-hard stripe on every
// overview shot. This dome samples the same equirect HDRI but fades it into the fog colour from a few degrees above
// the horizon downward, so terrain → haze → sky is one continuous gradient (aerial perspective, as in the refs).
import * as THREE from 'three';

/**
 * @param scene   THREE.Scene (its fog colour is the haze colour)
 * @param hdr     equirect HDR texture (the background)
 * @param opts    { rotY: sky rotation (rad), intensity, hazeTop: elevation (sin) where the haze is gone, hazeFloor: haze amount at the horizon (0..1) }
 */
export function hazeSky(scene, hdr, { rotY = 0, intensity = 1, hazeTop = 0.16, hazeFloor = 0.92, radius = 560 } = {}) {
  const fogCol = scene.fog?.color?.clone?.() || new THREE.Color(0xcdd8e3);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
    uniforms: { tSky: { value: hdr }, uRot: { value: rotY }, uInt: { value: intensity }, uFog: { value: fogCol }, uTop: { value: hazeTop }, uFloor: { value: hazeFloor } },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tSky; uniform float uRot, uInt, uTop, uFloor; uniform vec3 uFog;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float c = cos(uRot), s = sin(uRot);
        vec3 r = vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z);   // same convention as scene.backgroundRotation (Y)
        vec2 uv = vec2(atan(r.z, r.x) * 0.15915494 + 0.5, asin(clamp(r.y, -1.0, 1.0)) * 0.31830989 + 0.5);
        vec3 sky = texture2D(tSky, uv).rgb * uInt;
        float e = d.y;
        float h = uFloor * (1.0 - smoothstep(-0.01, uTop, e));   // haze thickest at/below the horizon
        h = max(h, step(e, -0.005));                              // below the horizon: pure haze (ground fades into it)
        gl_FragColor = vec4(mix(sky, uFog, h), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  dome.name = 'hazeSky'; dome.frustumCulled = false; dome.renderOrder = -1000; dome.matrixAutoUpdate = true;
  dome.onBeforeRender = (renderer, sc, camera) => { dome.position.copy(camera.getWorldPosition(_v)); dome.updateMatrixWorld(); };
  scene.add(dome);
  scene.background = fogCol.clone(); // anything the dome misses is haze, never the raw HDRI
  return dome;
}
const _v = new THREE.Vector3();
