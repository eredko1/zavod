// Sky dome, environment (PMREM), fog, moon key light. WORLD agent.
import * as THREE from 'three';

export const FOG_COLOR = new THREE.Color(0x0a0e15);

export function buildSky(world) {
  const { ctx, scene } = world;
  const { renderer } = ctx;

  // ---- environment: PMREM of dark HDRI (metals reflect something) ----------
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const hdr = ctx.assets?.hdr;
  if (hdr) {
    const env = pmrem.fromEquirectangular(hdr).texture;
    scene.environment = env; scene.environmentIntensity = 0.55;
    hdr.dispose();
  } else {
    const env = pmrem.fromScene(makeGradientEnvScene(), 0.04).texture;
    scene.environment = env; scene.environmentIntensity = 0.6;
  }
  pmrem.dispose();

  scene.background = FOG_COLOR.clone();
  scene.fog = new THREE.FogExp2(FOG_COLOR.getHex(), 0.0105);

  // ---- sky dome: dramatic stormy night with moon rim lighting, sodium docklands & lightning ---
  const moonDir = new THREE.Vector3(-45, 70, 30).normalize();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uFog: { value: FOG_COLOR.clone() },
      uMoonDir: { value: moonDir },
      uMoonColor: { value: new THREE.Color(0x9fb4d6) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * p;
        gl_Position.z = gl_Position.w * 0.99999;
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform float uTime;
      uniform vec3 uFog;
      uniform vec3 uMoonDir;
      uniform vec3 uMoonColor;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p = p * 2.04 + vec2(1.7, 9.2);
          a *= 0.5;
        }
        return v;
      }

      float getLightningFlash(float time, float period, float offset) {
        float t = mod(time + offset, period);
        if (t > 0.42) return 0.0;
        // Multi-stroke strike profile: stroke 1 (intense), stroke 2 (re-strike), stroke 3 (flicker tail)
        float p1 = exp(-t * 32.0);
        float p2 = step(0.10, t) * exp(-(t - 0.10) * 26.0) * 0.75;
        float p3 = step(0.22, t) * exp(-(t - 0.22) * 20.0) * 0.45;
        return p1 + p2 + p3;
      }

      void main() {
        float h = clamp(vDir.y, -0.1, 1.0);
        float az = atan(vDir.x, vDir.z);

        // ---- 1. Moon & corona ----
        float moonDot = dot(vDir, uMoonDir);
        float moonDisk = smoothstep(0.9992, 0.9997, moonDot);
        float moonHalo = pow(max(0.0, moonDot), 32.0) * 0.65 + pow(max(0.0, moonDot), 5.0) * 0.30;
        vec3 moonTotal = uMoonColor * (moonDisk * 3.5 + moonHalo);

        // ---- 2. Night sky base gradient ----
        vec3 zenithCol = vec3(0.007, 0.011, 0.022);
        vec3 midSkyCol = vec3(0.016, 0.023, 0.038);
        vec3 skyBase = mix(midSkyCol, zenithCol, smoothstep(0.08, 0.75, h));

        // ---- 3. Industrial horizon glow & docklands light pollution ----
        // Primary industrial docklands to the northeast (shipping terminal & cranes)
        float dockGlow = pow(max(0.0, cos(az - 0.85)), 2.2);
        // Secondary refinery / railyard glow to the west
        float westGlow = pow(max(0.0, cos(az + 1.35)), 2.8) * 0.55;
        float cityFactor = 0.45 + 0.90 * dockGlow + 0.45 * westGlow;

        vec3 sodiumCol = vec3(0.94, 0.50, 0.16);
        vec3 tungstenCol = vec3(0.78, 0.34, 0.11);
        vec3 horizonCol = mix(tungstenCol, sodiumCol, dockGlow);

        float horizonSpread = exp(-h * 12.0) * 0.85 + exp(-h * 4.5) * 0.22;
        vec3 horizonHaze = horizonCol * horizonSpread * cityFactor;

        // Factory skyline accents & aviation hazard beacons on distant stacks/cranes
        float beaconHash = fract(sin(floor(az * 48.0) * 127.1) * 43758.5453);
        float beaconStrobe = step(0.82, sin(uTime * 2.6 + beaconHash * 6.28));
        float beaconDot = pow(max(0.0, sin(az * 48.0)), 32.0) * smoothstep(0.035, 0.012, h) * smoothstep(0.002, 0.012, h);
        vec3 beaconColor = mix(vec3(1.2, 0.15, 0.05), vec3(1.1, 0.65, 0.1), step(0.5, beaconHash));
        vec3 skylineAccents = beaconColor * beaconDot * beaconStrobe * 0.85;

        // ---- 4. Broken, brooding storm clouds ----
        vec2 cuv = vDir.xz / max(vDir.y + 0.12, 0.08) * 0.38;
        vec2 wind = vec2(uTime * 0.010, uTime * 0.004);

        // Domain warping for turbulent storm cloud billows
        vec2 warp = vec2(
          fbm(cuv * 0.85 + wind + vec2(0.0, 0.0)),
          fbm(cuv * 0.85 + wind + vec2(5.2, 1.3))
        );
        float cloudNoise = fbm(cuv * 1.15 + warp * 0.75 + wind);

        // Fast-moving lower ragged scud clouds
        vec2 scudWind = vec2(uTime * 0.022, uTime * 0.009);
        float scudNoise = fbm(cuv * 2.3 + scudWind + vec2(3.1, 7.4));

        // Broken brooding cloud density with clear sky gaps
        float stormClouds = smoothstep(0.35, 0.72, cloudNoise);
        float raggedScud = smoothstep(0.48, 0.78, scudNoise) * 0.40;
        float totalClouds = clamp(stormClouds + raggedScud * (1.0 - stormClouds * 0.5), 0.0, 1.0);

        // ---- 5. Moon rim lighting on storm clouds (silver lining) ----
        float edgeTransmittance = smoothstep(0.10, 0.45, totalClouds) * (1.0 - smoothstep(0.45, 0.85, totalClouds));
        float moonRim = pow(max(0.0, moonDot), 2.4) * edgeTransmittance * 1.9;
        float moonIllum = pow(max(0.0, moonDot), 1.3) * totalClouds * 0.35;
        vec3 moonCloudRim = uMoonColor * (moonRim + moonIllum);

        // ---- 6. Low-altitude sodium horizon reflections on cloud undersides ----
        float cloudBottomLit = exp(-h * 5.0) * cityFactor;
        vec3 cloudSodiumReflect = sodiumCol * cloudBottomLit * 0.85;

        // ---- 7. Distant lightning strikes ----
        // Storm cell 1: Northeast bay (azimuth ~ 0.90)
        float l1 = getLightningFlash(uTime, 9.6, 2.5);
        float cell1Spread = pow(max(0.0, cos(az - 0.90)), 3.5);
        float strike1 = l1 * cell1Spread;

        // Storm cell 2: Distant western outskirts (azimuth ~ -1.25)
        float l2 = getLightningFlash(uTime, 14.8, 8.2);
        float cell2Spread = pow(max(0.0, cos(az + 1.25)), 4.5);
        float strike2 = l2 * cell2Spread;

        float totalLightning = strike1 + strike2;
        vec3 lightningCol = vec3(0.75, 0.88, 1.20); // electric violet-cyan
        vec3 cloudLightning = lightningCol * totalLightning * (totalClouds * 2.2 + (1.0 - totalClouds) * 0.5) * smoothstep(0.01, 0.45, h);
        vec3 horizonLightning = lightningCol * totalLightning * exp(-h * 4.5) * 0.85;

        // ---- 8. Composition ----
        vec3 skyBackdrop = skyBase + horizonHaze + skylineAccents + horizonLightning + moonTotal * (1.0 - totalClouds * 0.85);
        vec3 cloudBodyCol = mix(vec3(0.008, 0.012, 0.020), vec3(0.024, 0.022, 0.030), exp(-h * 4.0));
        vec3 cloudComposite = cloudBodyCol + cloudSodiumReflect + moonCloudRim + cloudLightning;

        float cloudVisibility = totalClouds * smoothstep(0.015, 0.22, h);
        vec3 col = mix(skyBackdrop, cloudComposite, cloudVisibility);

        // Seamless fog blending at horizon
        col = mix(uFog, col, smoothstep(-0.04, 0.12, vDir.y));

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(520, 32, 16), skyMat);
  sky.name = 'sky'; sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);
  world.updaters.push((dt) => { skyMat.uniforms.uTime.value += dt; });

  // ---- lights --------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0x2c3a52, 0x0e0b08, 0.95);
  scene.add(hemi); ctx.lights.hemi = hemi;

  const key = new THREE.DirectionalLight(0x9fb4d6, 0.85);
  key.position.set(-45, 70, 30); key.target.position.set(0, 0, 0);
  key.castShadow = true;
  const sm = key.shadow;
  sm.mapSize.set(4096, 4096);
  sm.camera.left = -64; sm.camera.right = 64; sm.camera.top = 64; sm.camera.bottom = -64;
  sm.camera.near = 10; sm.camera.far = 200; sm.bias = -0.0006; sm.normalBias = 0.05; sm.radius = 2;
  scene.add(key); scene.add(key.target); ctx.lights.key = key;

  const fill = new THREE.DirectionalLight(0x3a4a66, 0.12);
  fill.position.set(40, 30, -50); scene.add(fill); ctx.lights.fill = fill;
}

function makeGradientEnvScene() {
  const s = new THREE.Scene();
  const m = new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: 0x0b0f18 });
  s.add(new THREE.Mesh(new THREE.SphereGeometry(10, 16, 8), m));
  return s;
}
