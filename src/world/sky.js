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

  // ---- sky dome: overcast night with sodium light-pollution glow at horizon ---
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 }, uFog: { value: FOG_COLOR.clone() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: `
      varying vec3 vDir; uniform float uTime; uniform vec3 uFog;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return v; }
      void main(){
        float h = clamp(vDir.y, -0.1, 1.0);
        // horizon glow (city light pollution, sodium tinted), stronger to the north-east (docks/city)
        float az = atan(vDir.x, vDir.z);
        float city = 0.55 + 0.45 * cos(az - 0.8);
        vec3 glow = vec3(0.32, 0.20, 0.10) * city;
        vec3 zenith = vec3(0.010, 0.014, 0.022);
        float hz = exp(-h * 6.0);
        vec3 col = mix(zenith, glow, hz * 0.9);
        // low, fast-moving cloud deck lit from below
        vec2 cuv = vDir.xz / max(vDir.y, 0.05) * 0.35 + vec2(uTime*0.012, uTime*0.004);
        float c = fbm(cuv * 1.3);
        float clouds = smoothstep(0.35, 0.8, c);
        vec3 cloudCol = mix(vec3(0.03,0.035,0.05), vec3(0.16,0.11,0.07)*city, hz*0.8 + 0.15);
        col = mix(col, cloudCol, clouds * smoothstep(0.02, 0.25, h) * 0.85);
        col = mix(uFog, col, smoothstep(-0.05, 0.12, vDir.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
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
