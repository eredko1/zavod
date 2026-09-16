// RAILYARD sky: Poly Haven daytime HDRI (background + PMREM environment), warm sun with a 4096 shadow map fitted to the yard, light haze. RAILYARD agent.
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

export const HDRI_URL = './assets/hdri/kloofendal_48d_partly_cloudy_puresky_2k.hdr';
// Sun direction baked in the HDRI (measured offline: brightest texel u=0.595, v=0.2335 from top → elev 48°, az 34° from +X toward +Z).
const HDRI_SUN = new THREE.Vector3(0.553, 0.743, 0.376).normalize();
// Rotate the sky so the sun sits WSW of the yard (long shadows across the tracks, platform faces lit).
const SKY_ROT_Y = -2.08;
export const FOG_COLOR = new THREE.Color(0xc9d4de);

export function buildSky(world) {
  const { ctx, scene } = world;
  const { renderer } = ctx;
  renderer.toneMappingExposure = 0.95;

  // world sun direction = R_y(SKY_ROT_Y) · HDRI_SUN
  const sunDir = HDRI_SUN.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), SKY_ROT_Y);
  scene.backgroundRotation = new THREE.Euler(0, SKY_ROT_Y, 0);
  scene.environmentRotation = new THREE.Euler(0, SKY_ROT_Y, 0);

  // placeholder until the HDRI arrives (build() is sync)
  scene.background = FOG_COLOR.clone();
  scene.fog = new THREE.FogExp2(FOG_COLOR.getHex(), 0.0022);

  const hemi = new THREE.HemisphereLight(0xa9c0dc, 0x6b655c, 0.55);
  scene.add(hemi); ctx.lights.hemi = hemi;

  const sun = new THREE.DirectionalLight(0xffe9cf, 3.4); // ≈5600 K
  sun.position.copy(sunDir).multiplyScalar(160); sun.target.position.set(0, 0, -6);
  sun.castShadow = true;
  const sm = sun.shadow;
  sm.mapSize.set(4096, 4096);
  sm.camera.left = -80; sm.camera.right = 80; sm.camera.top = 80; sm.camera.bottom = -80;
  sm.camera.near = 40; sm.camera.far = 300;
  sm.bias = -0.00025; sm.normalBias = 0.035; sm.radius = 1.5;
  scene.add(sun); scene.add(sun.target); ctx.lights.key = sun;

  const fill = new THREE.DirectionalLight(0xbfd0e8, 0.18);
  fill.position.set(-sunDir.x * 100, 60, -sunDir.z * 100); scene.add(fill); ctx.lights.fill = fill;

  const loader = new HDRLoader();
  loader.load(HDRI_URL, (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer); pmrem.compileEquirectangularShader();
    const env = pmrem.fromEquirectangular(hdr).texture; pmrem.dispose();
    scene.environment = env; scene.environmentIntensity = 0.85;
    scene.background = hdr; scene.backgroundIntensity = 1.0;
    ctx.bus?.emit?.('skyReady', { map: 'railyard' });
  }, undefined, (e) => console.warn('[railyard] HDRI failed', e));

  return { sunDir };
}
