// SBU sky: Poly Haven partly-cloudy HDRI (background + PMREM environment), afternoon sun ~50° from the SW, 4096 shadow map fitted to the campus. SBU agent.
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

export const HDRI_URL = './assets/hdri/kloofendal_48d_partly_cloudy_puresky_2k.hdr';
// Sun in the HDRI: elev 48°, az 34° from +X toward +Z. Rotate so the disc sits SW (az 135°).
const HDRI_SUN = new THREE.Vector3(0.553, 0.743, 0.376).normalize();
const SKY_ROT_Y = (34 - 135) * Math.PI / 180;
export const FOG_COLOR = new THREE.Color(0xcdd8e3);
const ENV_SUN_CAP = 3.0;

export function buildSky(world, { shadowHalf = 200, center = [50, 0, -60] } = {}) {
  const { ctx, scene } = world;
  const { renderer } = ctx;
  renderer.toneMappingExposure = 0.85;

  const sunDir = HDRI_SUN.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), SKY_ROT_Y);
  { const az = Math.atan2(sunDir.z, sunDir.x), el = 50 * Math.PI / 180; sunDir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)); }
  scene.backgroundRotation = new THREE.Euler(0, SKY_ROT_Y, 0);
  scene.environmentRotation = new THREE.Euler(0, SKY_ROT_Y, 0);
  scene.background = FOG_COLOR.clone();
  // exponential-squared haze: soft, no hard horizon stripe, distant tree line dissolves into it
  scene.fog = new THREE.FogExp2(FOG_COLOR.getHex(), 0.0032);

  const hemi = new THREE.HemisphereLight(0xb7cbe6, 0x7d7666, 0.55);
  scene.add(hemi); ctx.lights.hemi = hemi;

  const sun = new THREE.DirectionalLight(0xffe9cf, 10.5);
  sun.position.set(center[0] + sunDir.x * 420, sunDir.y * 420, center[2] + sunDir.z * 420); sun.target.position.set(center[0], 0, center[2]);
  sun.castShadow = true;
  const sm = sun.shadow;
  sm.mapSize.set(4096, 4096);
  sm.camera.left = -shadowHalf; sm.camera.right = shadowHalf; sm.camera.top = shadowHalf; sm.camera.bottom = -shadowHalf;
  sm.camera.near = 20; sm.camera.far = 700;
  sm.bias = -0.00016; sm.normalBias = 0.04; sm.radius = 2.4;   // soft PCF: grounded contact shadows, no acne on the terraces
  sm.camera.updateProjectionMatrix();
  scene.add(sun); scene.add(sun.target); ctx.lights.key = sun;

  const fill = new THREE.DirectionalLight(0xc5d5ec, 0.45);
  fill.position.set(-sunDir.x * 100, 70, -sunDir.z * 100); scene.add(fill); ctx.lights.fill = fill;

  const loader = new HDRLoader(); loader.setDataType(THREE.FloatType);
  loader.load(HDRI_URL, (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const src = hdr.image.data, w = hdr.image.width, h = hdr.image.height;
    const clamped = new Float32Array(src.length); const cap = ENV_SUN_CAP;
    for (let i = 0; i < src.length; i += 4) { clamped[i] = Math.min(src[i], cap); clamped[i + 1] = Math.min(src[i + 1], cap); clamped[i + 2] = Math.min(src[i + 2], cap); clamped[i + 3] = 1; }
    const envTex = new THREE.DataTexture(clamped, w, h, THREE.RGBAFormat, THREE.FloatType); envTex.mapping = THREE.EquirectangularReflectionMapping; envTex.flipY = hdr.flipY; envTex.needsUpdate = true;
    const pmrem = new THREE.PMREMGenerator(renderer); pmrem.compileEquirectangularShader();
    const env = pmrem.fromEquirectangular(envTex).texture; pmrem.dispose(); envTex.dispose();
    scene.environment = env; scene.environmentIntensity = 0.75;
    scene.background = hdr; scene.backgroundIntensity = 1.0;
    ctx.bus?.emit?.('skyReady', { map: 'sbu' });
  }, undefined, (e) => console.warn('[sbu] HDRI failed', e));

  return { sunDir };
}
