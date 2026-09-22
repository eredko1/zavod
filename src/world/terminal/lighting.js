// TERMINAL lighting: SE sun through the east windows + south clerestory (4096 shadow), window spots, warm interior points,
// interior HDRI environment (PMREM), light shafts (additive prisms) + dust motes, light haze. TERMINAL agent.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { P } from './plan.js';

export const SUN_DIR = new THREE.Vector3(0.80, 0.55, 0.27).normalize();   // from the scene toward the sun (E-SE, 33° up)
export const HDRI_URL = './assets/hdri/st_fagans_interior_2k.hdr';

export function buildLighting(world, M) {
  const { ctx, scene, R } = world; const { renderer } = ctx;
  renderer.toneMappingExposure = 0.82;
  scene.background = new THREE.Color(0x0b0d10);      // never visible (closed shell); dark neutral
  scene.fog = new THREE.FogExp2(0xcfc2a8, 0.0022);    // very light warm haze for depth

  // ---- environment: quick gradient PMREM now, HDRI PMREM when loaded --------------------------------------
  const pmrem = new THREE.PMREMGenerator(renderer); pmrem.compileEquirectangularShader();
  {
    const s = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 8), new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: {}, vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }', fragmentShader: 'varying vec3 vP; void main(){ float h=normalize(vP).y; vec3 c=mix(vec3(0.22,0.17,0.12), vec3(0.55,0.5,0.42), smoothstep(-0.2,0.6,h)); gl_FragColor=vec4(c,1.0); }' }));
    s.add(sky); scene.environment = pmrem.fromScene(s, 0.02).texture; scene.environmentIntensity = 0.22;
  }
  new RGBELoader().load(HDRI_URL, (t) => { t.mapping = THREE.EquirectangularReflectionMapping; const env = pmrem.fromEquirectangular(t).texture; scene.environment = env; scene.environmentIntensity = 0.22; t.dispose(); pmrem.dispose(); }, undefined, () => { console.warn('[terminal] HDRI missing'); pmrem.dispose(); });

  // ---- ambient: hemisphere (cool from the windows above, warm bounce from the pink marble) ----------------
  const hemi = new THREE.HemisphereLight(0xb9c6d4, 0x6e5a48, 0.16); scene.add(hemi); ctx.lights.hemi = hemi;

  // ---- sun -------------------------------------------------------------------------------------------------
  const sun = new THREE.DirectionalLight(0xfff0d2, 4.4);
  sun.position.copy(SUN_DIR).multiplyScalar(150).add(new THREE.Vector3(0, 0, 8)); sun.target.position.set(0, 0, 8);
  sun.castShadow = true; const sm = sun.shadow; sm.mapSize.set(4096, 4096);
  sm.camera.left = -62; sm.camera.right = 62; sm.camera.top = 62; sm.camera.bottom = -62; sm.camera.near = 40; sm.camera.far = 300;
  sm.bias = -0.0005; sm.normalBias = 0.07; sm.radius = 1.5;
  scene.add(sun); scene.add(sun.target); ctx.lights.key = sun;

  // ---- window spots (shaft cores): 3 east windows (no shadow) + 2 clerestory (shadowed) -------------------
  ctx.lights.spots = ctx.lights.spots || [];
  const spot = (from, to, { color = 0xffe2b0, intensity = 650, angle = 0.22, penumbra = 0.6, shadow = false } = {}) => {
    const s = new THREE.SpotLight(color, intensity, 120, angle, penumbra, 1.4);
    s.position.copy(from); s.target.position.copy(to); s.castShadow = shadow;
    if (shadow) { s.shadow.mapSize.set(1024, 1024); s.shadow.bias = -0.0004; s.shadow.camera.near = 5; s.shadow.camera.far = 120; }
    scene.add(s); scene.add(s.target); ctx.lights.spots.push(s); return s;
  };
  const hit0 = (from) => from.clone().addScaledVector(SUN_DIR, -from.y / SUN_DIR.y); // where the ray reaches y=0
  // east windows: one wide spot for the three (the sun already paints the sharp patches); clerestory: two, no shadow (perf)
  { const w = new THREE.Vector3(P.X1 + 6, 20, 0).addScaledVector(SUN_DIR, 8); spot(w, hit0(new THREE.Vector3(P.X1, 20, 0)), { intensity: 1400, angle: 0.34, penumbra: 0.7 }); }
  for (const cx of [-12, 12]) { const w = new THREE.Vector3(cx, 17.5, P.Z1 + 4).addScaledVector(SUN_DIR, 6); spot(w, hit0(new THREE.Vector3(cx, 17.5, P.Z1)), { intensity: 900, angle: 0.16 }); }

  // ---- warm interior points (budget: 8) ----------------------------------------------------------------------
  const pt = (x, y, z, color, intensity, dist, decay = 2) => { const l = new THREE.PointLight(color, intensity, dist, decay); l.position.set(x, y, z); scene.add(l); return l; };
  // ---- cove wash: a few very broad, low-intensity warm lights backing the cornice/arch strips ------------
  // (the strips themselves are emissive geometry in concourse.js — these make the stone actually receive the wash)
  // physical falloff (decay 2) keeps the wash tight to the stone near the strip instead of flat-filling the room
  for (const x of [-30, -10, 10, 30]) for (const z of [P.Z1 - 2.1, P.Z0 + 2.1]) pt(x, P.CORNICE - 2.4, z, 0xffd6a0, 540, 24);
  pt(P.X0 + 4.5, 22.0, 0, 0xffdcaa, 900, 30); pt(P.X1 - 4.5, 22.0, 0, 0xffdcaa, 900, 30);   // end lunettes
  for (const x of [-34, 34]) pt(x, P.BAL_Y - 1.3, 0, 0xffd2a0, 120, 16);                    // balcony soffit / arcade
  pt(0, 4.6, 0, 0xffd9a0, 60, 22);                                  // info booth / clock
  pt(-12, 8.2, 40, 0xffd2a0, 140, 34); pt(12, 8.2, 40, 0xffd2a0, 140, 34);   // Vanderbilt Hall chandeliers
  pt(0, -1.6, 24.5, 0xffd0a0, 70, 24);                              // Whispering Gallery
  pt(6, -2.0, 40, 0xffd8b0, 110, 30); pt(-19, -2.5, 36, 0xffc890, 60, 20);   // dining / oyster bar
  pt(-30, -10.2, 63, 0xd8e8ff, 42, 26); pt(-8, -10.2, 63, 0xd8e8ff, 42, 26); pt(14, -10.2, 63, 0xd8e8ff, 42, 26); pt(36, -10.2, 63, 0xd8e8ff, 42, 26);   // subway fluorescents (cool)
  pt(0, -2.8, 54, 0xe4ecff, 60, 20);                                // subway mezzanine
  pt(-22, -9.0, 71.9, 0xf2f6ff, 40, 12);                             // inside the stopped train

  // ---- light shafts: additive prisms from each window opening down the sun direction -----------------------
  const shaftMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.86, 0.62) }, uStrength: { value: 0.30 } },
    vertexShader: `
      attribute vec2 aBeam; // x: across (0..1), y: along (0 window → 1 floor)
      varying vec2 vB; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ vB = aBeam; vN = normalize(normalMatrix * normal); vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; vec4 mv = viewMatrix * wp; vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uColor; uniform float uStrength; varying vec2 vB; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      void main(){
        float edge = smoothstep(0.0, 0.25, vB.x) * smoothstep(0.0, 0.25, 1.0 - vB.x);
        float along = pow(1.0 - vB.y, 1.3) * smoothstep(0.0, 0.06, vB.y);
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float fres = mix(0.35, 1.0, facing);
        float streaks = 0.7 + 0.6 * noise(vec2(vB.x * 18.0 + vW.y * 0.05, vB.y * 2.0 - uTime * 0.03));
        float a = uStrength * edge * along * fres * streaks;
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });
  const shaftGeos = []; const beamBoxes = []; const beamQuads = [];
  const addShaft = (corners /* 4 window corners: bl, br, tr, tl in world */) => {
    const far = corners.map(c => c.clone().addScaledVector(SUN_DIR, -(c.y + 0.05) / SUN_DIR.y));
    const pos = [], beam = [], nor = [];
    const quad = (a, b, c, d, ba, bb, bc, bd) => { const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize(); for (const [p, q] of [[a, ba], [b, bb], [c, bc], [a, ba], [c, bc], [d, bd]]) { pos.push(p.x, p.y, p.z); beam.push(q[0], q[1]); nor.push(n.x, n.y, n.z); } };
    const [bl, br, tr, tl] = corners; const [fbl, fbr, ftr, ftl] = far;
    // four side faces of the prism (window quad → floor quad)
    quad(bl, br, fbr, fbl, [0, 0], [1, 0], [1, 1], [0, 1]);   // bottom sheet
    quad(tl, tr, ftr, ftl, [0, 0], [1, 0], [1, 1], [0, 1]);   // top sheet
    quad(bl, tl, ftl, fbl, [0, 0], [1, 0], [1, 1], [0, 1]);   // left
    quad(br, tr, ftr, fbr, [0, 0], [1, 0], [1, 1], [0, 1]);   // right
    // internal sheets for body
    const mid = (a, b) => a.clone().add(b).multiplyScalar(0.5);
    quad(mid(bl, br), mid(tl, tr), mid(ftl, ftr), mid(fbl, fbr), [0, 0], [1, 0], [1, 1], [0, 1]);
    quad(mid(bl, tl), mid(br, tr), mid(fbr, ftr), mid(fbl, ftl), [0, 0], [1, 0], [1, 1], [0, 1]);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('aBeam', new THREE.Float32BufferAttribute(beam, 2));
    shaftGeos.push(g);
    const bb = new THREE.Box3(); for (const c of [...corners, ...far]) bb.expandByPoint(c); beamBoxes.push(bb); beamQuads.push([...corners, ...far]);
  };
  // east windows: three 9×18 m arches at x = X1 (inner face), z = -12.5, 0, 12.5, y 11..29 (use the rectangular body + arch approximated by top at 27)
  for (const cz of [-12.5, 0, 12.5]) { const x = P.X1; addShaft([new THREE.Vector3(x, 11.5, cz + 4.3), new THREE.Vector3(x, 11.5, cz - 4.3), new THREE.Vector3(x, 27.5, cz - 3.2), new THREE.Vector3(x, 27.5, cz + 3.2)]); }
  // south clerestory: 5 arches at z = Z1, x = -24..24, y 13.5..21.5
  for (const cx of [-24, -12, 0, 12, 24]) { const z = P.Z1; addShaft([new THREE.Vector3(cx - 3.1, 14, z), new THREE.Vector3(cx + 3.1, 14, z), new THREE.Vector3(cx + 2.2, 21, z), new THREE.Vector3(cx - 2.2, 21, z)]); }
  {
    const merged = mergeShaftGeos(shaftGeos);
    const mesh = new THREE.Mesh(merged, shaftMat); mesh.name = 'lightShafts'; mesh.frustumCulled = false; mesh.renderOrder = 5; scene.add(mesh);
  }
  // dust motes inside the beams (bilinear sample of window quad → floor quad)
  {
    const N = 2600; const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    const lerp = (a, b, t) => a.clone().lerp(b, t);
    for (let i = 0; i < N; i++) {
      const q = beamQuads[Math.floor(R() * beamQuads.length)]; const [bl, br, tr, tl, fbl, fbr, ftr, ftl] = q;
      const u = R(), v = R(), t = R();
      const w = lerp(lerp(bl, br, u), lerp(tl, tr, u), v), f = lerp(lerp(fbl, fbr, u), lerp(ftl, ftr, u), v); const p = lerp(w, f, t);
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; seed[i] = R() * 100 + t;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTime: { value: 0 }, uSun: { value: SUN_DIR.clone() } },
      vertexShader: `attribute float aSeed; uniform float uTime; varying float vA;
        void main(){ vec3 p = position; float t = uTime * 0.12 + aSeed; p += vec3(sin(t*1.3+aSeed)*0.35, -mod(t*0.35, 6.0) + 3.0, cos(t*0.9+aSeed*0.7)*0.35);
          vec4 mv = modelViewMatrix * vec4(p,1.0); gl_Position = projectionMatrix * mv; float d = -mv.z; gl_PointSize = clamp(90.0 / d, 1.0, 5.0); vA = 0.5 + 0.5*sin(t*2.0+aSeed*3.0); }`,
      fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c); float a = smoothstep(0.5, 0.05, r) * vA * 0.55; gl_FragColor = vec4(vec3(1.0,0.9,0.7)*a, a); }`,
    });
    const pts = new THREE.Points(g, mat); pts.name = 'dust'; pts.frustumCulled = false; pts.renderOrder = 6; scene.add(pts);
    world.updaters.push((dt) => { mat.uniforms.uTime.value += dt; shaftMat.uniforms.uTime.value += dt; });
  }
  // haze planes near the east windows (soft additive gradient)
  {
    const hz = new THREE.Mesh(new THREE.PlaneGeometry(36, 30), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, uniforms: {}, vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }', fragmentShader: 'varying vec2 vUv; void main(){ float a = smoothstep(0.0,0.5,vUv.x)*smoothstep(1.0,0.5,vUv.x)*smoothstep(0.0,0.4,vUv.y)*smoothstep(1.0,0.6,vUv.y)*0.10; gl_FragColor=vec4(vec3(1.0,0.9,0.7)*a,a); }' }));
    hz.position.set(P.X1 - 6, 19, 0); hz.rotation.y = Math.PI / 2; hz.name = 'haze'; hz.renderOrder = 4; scene.add(hz);
  }
  return { sun };
}

function mergeShaftGeos(geos) {
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), beam = new Float32Array(n * 2); let off = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, off * 3); nor.set(g.attributes.normal.array, off * 3); beam.set(g.attributes.aBeam.array, off * 2); off += g.attributes.position.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('aBeam', new THREE.BufferAttribute(beam, 2)); return out;
}
