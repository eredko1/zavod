// RAILYARD sky: Poly Haven daytime HDRI (background + PMREM environment), warm sun with a 4096 shadow map fitted to the yard, light haze. RAILYARD agent.
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

export const HDRI_URL = './assets/hdri/kloofendal_48d_partly_cloudy_puresky_2k.hdr';
// Sun direction baked in the HDRI (measured offline: brightest texel u=0.595, v=0.2335 from top → elev 48°, az 34° from +X toward +Z).
const HDRI_SUN = new THREE.Vector3(0.553, 0.743, 0.376).normalize();
// Rotate the sky so the sun sits WSW of the yard (long shadows across the tracks, platform faces lit).
const SKY_ROT_Y = -2.08;
export const FOG_COLOR = new THREE.Color(0xc9d4de);
const ENV_SUN_CAP = 3.0; // sky texels are ~0.3–2; the sun disc is ~5e4

export function buildSky(world) {
  const { ctx, scene } = world;
  const { renderer } = ctx;
  renderer.toneMappingExposure = 0.9;

  // world sun direction = R_y(SKY_ROT_Y) · HDRI_SUN
  const sunDir = HDRI_SUN.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), SKY_ROT_Y);
  // pull the key light down to ~38° elevation (longer, more shaping shadows than the HDRI's 48° disc; the disc sits in cloud so the mismatch is invisible)
  { const az = Math.atan2(sunDir.z, sunDir.x), el = 38 * Math.PI / 180; sunDir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)); }
  scene.backgroundRotation = new THREE.Euler(0, SKY_ROT_Y, 0);
  scene.environmentRotation = new THREE.Euler(0, SKY_ROT_Y, 0);

  // placeholder until the HDRI arrives (build() is sync)
  scene.background = FOG_COLOR.clone();
  scene.fog = new THREE.FogExp2(FOG_COLOR.getHex(), 0.0032);

  const hemi = new THREE.HemisphereLight(0xa9c0dc, 0x6b655c, 0.5);
  scene.add(hemi); ctx.lights.hemi = hemi;

  const sun = new THREE.DirectionalLight(0xffe6c8, 11.0); // sun ≈ 4–5× sky irradiance → real contrast; exposure compensates // ≈5600 K
  sun.position.copy(sunDir).multiplyScalar(160); sun.target.position.set(0, 0, -6);
  sun.castShadow = true;
  const sm = sun.shadow;
  sm.mapSize.set(4096, 4096);
  sm.camera.left = -80; sm.camera.right = 80; sm.camera.top = 80; sm.camera.bottom = -80;
  sm.camera.near = 30; sm.camera.far = 320;
  sm.bias = -0.00025; sm.normalBias = 0.035; sm.radius = 1.5;
  sm.camera.updateProjectionMatrix();
  scene.add(sun); scene.add(sun.target); ctx.lights.key = sun;

  const fill = new THREE.DirectionalLight(0xbfd0e8, 0.5);
  fill.position.set(-sunDir.x * 100, 60, -sunDir.z * 100); scene.add(fill); ctx.lights.fill = fill;

  const loader = new HDRLoader(); loader.setDataType(THREE.FloatType);
  loader.load(HDRI_URL, (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    // Environment: the same sky with the sun disc clamped out, so direct sun (and its shadows) come only from the DirectionalLight.
    const src = hdr.image.data, w = hdr.image.width, h = hdr.image.height;
    const clamped = new Float32Array(src.length); const cap = ENV_SUN_CAP;
    for (let i = 0; i < src.length; i += 4) { clamped[i] = Math.min(src[i], cap); clamped[i + 1] = Math.min(src[i + 1], cap); clamped[i + 2] = Math.min(src[i + 2], cap); clamped[i + 3] = 1; }
    const envTex = new THREE.DataTexture(clamped, w, h, THREE.RGBAFormat, THREE.FloatType); envTex.mapping = THREE.EquirectangularReflectionMapping; envTex.flipY = hdr.flipY; envTex.needsUpdate = true;
    const pmrem = new THREE.PMREMGenerator(renderer); pmrem.compileEquirectangularShader();
    const env = pmrem.fromEquirectangular(envTex).texture; pmrem.dispose(); envTex.dispose();
    scene.environment = env; scene.environmentIntensity = 1.0;
    scene.background = hdr; scene.backgroundIntensity = 1.0;
    ctx.bus?.emit?.('skyReady', { map: 'railyard' });
  }, undefined, (e) => console.warn('[railyard] HDRI failed', e));

  return { sunDir };
}
