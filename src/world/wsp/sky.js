// WSP sky: Poly Haven urban_street_04 (2k) as background + PMREM env (sun disc clamped), late-morning sun from the SE with a 4096 shadow map. WSP agent.
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

export const HDRI_URL = './assets/hdri/urban_street_04_2k.hdr';
// measured offline: brightest texel u=0.600, v=0.336 → elevation 29.5°, azimuth 36° from +x toward +z (SE in the park frame)
const SUN_AZ = 36 * Math.PI / 180, SUN_EL = 44 * Math.PI / 180;   // key light raised to ~44° (late morning); disc mismatch hidden by the skyline
export const FOG_COLOR = new THREE.Color(0xcfd8e2);
const ENV_SUN_CAP = 4.0;

export function buildSky(world) {
  const { ctx, scene } = world; const { renderer } = ctx;
  renderer.toneMappingExposure = 1.0;
  const sunDir = new THREE.Vector3(Math.cos(SUN_EL) * Math.cos(SUN_AZ), Math.sin(SUN_EL), Math.cos(SUN_EL) * Math.sin(SUN_AZ));
  scene.background = FOG_COLOR.clone();
  scene.fog = new THREE.FogExp2(FOG_COLOR.getHex(), 0.0022);

  const hemi = new THREE.HemisphereLight(0xb7cbe6, 0x6b6a5e, 0.55); scene.add(hemi); ctx.lights.hemi = hemi;
  const sun = new THREE.DirectionalLight(0xfff0d8, 9.5);
  sun.position.copy(sunDir).multiplyScalar(220); sun.target.position.set(0, 0, 0);
  sun.castShadow = true; const sm = sun.shadow;
  sm.mapSize.set(4096, 4096);
  sm.camera.left = -175; sm.camera.right = 175; sm.camera.top = 175; sm.camera.bottom = -175;
  sm.camera.near = 40; sm.camera.far = 520; sm.bias = -0.0002; sm.normalBias = 0.05; sm.radius = 1.2;
  sm.camera.updateProjectionMatrix();
  scene.add(sun); scene.add(sun.target); ctx.lights.key = sun;
  const fill = new THREE.DirectionalLight(0xc4d6ee, 0.35); fill.position.set(-sunDir.x * 100, 70, -sunDir.z * 100); scene.add(fill); ctx.lights.fill = fill;

  const loader = new HDRLoader(); loader.setDataType(THREE.FloatType);
  loader.load(HDRI_URL, (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const src = hdr.image.data, w = hdr.image.width, h = hdr.image.height;
    const clamped = new Float32Array(src.length);
    for (let i = 0; i < src.length; i += 4) { clamped[i] = Math.min(src[i], ENV_SUN_CAP); clamped[i + 1] = Math.min(src[i + 1], ENV_SUN_CAP); clamped[i + 2] = Math.min(src[i + 2], ENV_SUN_CAP); clamped[i + 3] = 1; }
    const envTex = new THREE.DataTexture(clamped, w, h, THREE.RGBAFormat, THREE.FloatType); envTex.mapping = THREE.EquirectangularReflectionMapping; envTex.flipY = hdr.flipY; envTex.needsUpdate = true;
    const pmrem = new THREE.PMREMGenerator(renderer); pmrem.compileEquirectangularShader();
    const env = pmrem.fromEquirectangular(envTex).texture; pmrem.dispose(); envTex.dispose();
    scene.environment = env; scene.environmentIntensity = 0.9;
    scene.background = hdr; scene.backgroundIntensity = 1.0; scene.backgroundBlurriness = 0.0;
    ctx.bus?.emit?.('skyReady', { map: 'wsp' });
  }, undefined, (e) => console.warn('[wsp] HDRI failed', e));
  return { sunDir };
}
