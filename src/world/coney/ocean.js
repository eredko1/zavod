// CONEY — the Atlantic. One camera-centred polar-grid mesh (dense under the eye, 3 km out) with ONE custom shader:
//  · swell: 6 Gerstner waves rolling in from the open ocean (+z) toward the beach, horizontal crest gathering, the short ones
//    faded per-vertex by grid spacing (no swimming / aliasing) and per-pixel by footprint (no glitter noise far out);
//  · surf: two trains of breaking bores (7.5 s / 12 s sets) that stand up at the breaker line (~30 m out), roll shoreward as
//    white water, run up the sand as a thin swash sheet and drain back — the sheet is geometry (it really climbs the beach mesh)
//    with a see-through, foamy edge; shoaling bump + wave fade in the shallows; residual foam carpet in the surf zone;
//  · colour: depth over the real sand profile (shallow sand-tinted turquoise-green → Atlantic grey-blue offshore), sunlit
//    crest scattering, Schlick fresnel reflection of the scene's own procedural sky (gradient + sun glow + the HDRI's clouds,
//    same maths as horizon.js' dome), GGX-ish sun / moon glint, horizon haze identical to the far-ocean disc it fades into.
// Lights / fog / sky come from the live scene each frame (key light, hemi, fog, the 'horizon:sky' dome), so the day → dusk →
// night cycle and the lunafilm grade just work. No transmission, no reflection pass, no depth-texture read: 1 draw call.
// Phones (ctx.lite): ~1/3 of the vertices and a cheaper fragment path (fewer normal waves, no cloud reflection).
// CPU twin: waveHeight(x, z) evaluates the exact same function (incl. the Gerstner inverse) for the jet skis.
import * as THREE from 'three';

const G = 9.81;
// [wavelength m, amplitude m, direction deg off due-shoreward (-z), steepness Q, phase]
const WAVES = [[64, 0.3, 5, 1.6, 0.0], [38, 0.2, -12, 1.8, 1.3], [21, 0.115, 18, 1.8, 2.1], [12.5, 0.062, -24, 1.7, 4.2], [7.2, 0.033, 33, 1.5, 0.7], [4.1, 0.018, -7, 1.4, 5.5]]
  .map(([L, A, deg, Q, ph]) => { const k = 2 * Math.PI / L, a = deg * Math.PI / 180; return { L, A, Q, ph, k, dx: Math.sin(a), dz: -Math.cos(a), w: Math.sqrt(G * k) }; });
const BORES = [{ T: 7.5, H: 0.42, o: 0.0 }, { T: 12.0, H: 0.26, o: 0.37 }];
const f = (v) => v.toFixed(5);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function buildOcean(world, { waterZ, WATER_Y, SAND_TOP, BZ1 }) {
  const { scene, ctx, W } = world;
  const low = !!ctx.lite;
  const X0 = -1000, NX = 381;
  const wl = new Float32Array(NX * 4); for (let i = 0; i < NX; i++) wl[i * 4] = waterZ(X0 + i * 5);
  const tWL = new THREE.DataTexture(wl, NX, 1, THREE.RGBAFormat, THREE.FloatType); tWL.minFilter = tWL.magFilter = THREE.NearestFilter; tWL.needsUpdate = true;

  // ---- CPU twin ---------------------------------------------------------------------------------------------------------
  const O = { time: 0, ph: new Float32Array(WAVES.length), bs: new Float32Array(BORES.length) };
  const envG = (d) => sstep(5, 60, d) * (1 + 0.3 * Math.exp(-(((d - 35) / 13) ** 2)));
  const gerst = (x, z, out) => { let dx = 0, dz = 0, y = 0; for (let i = 0; i < WAVES.length; i++) { const w = WAVES[i], th = w.k * (w.dx * x + w.dz * z) - O.ph[i] + w.ph, c = Math.cos(th); dx += w.Q * w.A * w.dx * c / WAVES.length * 2; dz += w.Q * w.A * w.dz * c / WAVES.length * 2; y += w.A * Math.sin(th); } out.dx = dx; out.dz = dz; out.y = y; return out; };
  const bore = (d, x, i) => {
    const B = BORES[i]; let s = O.bs[i] + 0.05 * Math.sin(x * 0.011 + i * 2.1) + 0.03 * Math.sin(x * 0.037 + 2.0 + i); s -= Math.floor(s);
    const e = 1 - Math.pow(1 - s, 1.7), dB = 30 - 39 * e, Hb = B.H * (0.78 + 0.22 * Math.sin(x * 0.019 + i * 4.0)) * Math.pow(1 - s, 0.9) * sstep(0, 0.06, s), xp = d - dB;
    return xp >= 0 ? Hb * Math.exp(-xp / 7) : Hb * Math.exp(xp / 0.9);
  };
  const _g = { dx: 0, dz: 0, y: 0 };
  /** water surface height at world (x, z) right now (same function as the shader's vertex stage, without its distance LOD) */
  O.waveHeight = (x, z) => {
    let px = x, pz = z;
    for (let it = 0; it < 3; it++) { const e = envG(pz - waterZ(px)); gerst(px, pz, _g); px = x - _g.dx * e; pz = z - _g.dz * e; }
    const d = pz - waterZ(px), e = envG(d); gerst(px, pz, _g);
    let y = WATER_Y + e * _g.y; for (let i = 0; i < BORES.length; i++) y += bore(d, px, i);
    return y;
  };
  /** surface normal (finite differences of waveHeight) */
  O.normal = (x, z, out = new THREE.Vector3()) => { const h = 0.35, a = O.waveHeight(x - h, z), b = O.waveHeight(x + h, z), c = O.waveHeight(x, z - h), e = O.waveHeight(x, z + h); return out.set(a - b, 2 * h, c - e).normalize(); };
  /** metres of water above the sand at (x, z) (negative on the dry beach) */
  O.depth = (x, z) => O.waveHeight(x, z) - (W.groundHeight ? W.groundHeight(x, z) : WATER_Y - 3);
  O.shoreZ = waterZ; O.level = WATER_Y;
  O.info = () => ({ time: +O.time.toFixed(2), level: WATER_Y, waves: WAVES.map((w) => ({ L: w.L, A: w.A, T: +(2 * Math.PI / w.w).toFixed(2) })), bores: BORES.map((b) => b.T), lowSpec: low, verts: geo.attributes.position.count, mesh: mesh.name });

  // ---- detail normal + foam texture (tileable, 256²): RG = ripple normal, B = foam lace, A = foam blotches ----------------
  const tex = (() => {
    const S = 256, data = new Uint8Array(S * S * 4); let seed = 7; const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const H = new Float32Array(S * S), comps = [];
    for (let i = 0; i < 14; i++) { const fx = Math.round((R() - 0.5) * (6 + i * 2.2)), fy = Math.round((R() - 0.5) * (6 + i * 2.2)) || 1; comps.push([fx, fy, R() * 6.28, 1 / Math.hypot(fx, fy) ** 1.1]); }
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { let h = 0; for (const [fx, fy, p, a] of comps) h += a * Math.sin((fx * x + fy * y) / S * 6.2832 + p); H[y * S + x] = h; }
    const worley = (n) => { const pts = []; for (let i = 0; i < n; i++) pts.push([R() * S, R() * S]); const out = new Float32Array(S * S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { let d1 = 1e9, d2 = 1e9; for (const [px, py] of pts) { let dx = Math.abs(px - x), dy = Math.abs(py - y); if (dx > S / 2) dx = S - dx; if (dy > S / 2) dy = S - dy; const d = dx * dx + dy * dy; if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; } out[y * S + x] = Math.sqrt(d2) - Math.sqrt(d1); }
      return out; };
    const w1 = worley(26), w2 = worley(90);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x, dx = H[y * S + (x + 1) % S] - H[y * S + (x + S - 1) % S], dy = H[((y + 1) % S) * S + x] - H[((y + S - 1) % S) * S + x];
      const n = new THREE.Vector3(-dx * 1.6, -dy * 1.6, 1).normalize();
      const lace = Math.max(0, 1 - w1[i] / 5) * 0.65 + Math.max(0, 1 - w2[i] / 3) * 0.55;       // bright rims along the cell edges (sea-foam lace)
      data[i * 4] = (n.x * 0.5 + 0.5) * 255; data[i * 4 + 1] = (n.y * 0.5 + 0.5) * 255; data[i * 4 + 2] = Math.min(255, lace * 255); data[i * 4 + 3] = Math.min(255, (0.5 + H[i] * 0.25) * 255);
    }
    const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = low ? 2 : 8; t.needsUpdate = true;
    return t;
  })();

  // ---- mesh: polar grid, rings geometric from 0 to 3 km -------------------------------------------------------------------
  const NR = low ? 64 : 120, NA = low ? 88 : 168, RMAX = 3000, q = low ? 1.095 : 1.052;
  const a0 = RMAX / (Math.pow(q, NR) - 1);
  const pos = new Float32Array((NR * NA + 1) * 3), idx = [];
  for (let i = 1; i <= NR; i++) { const r = a0 * (Math.pow(q, i) - 1); for (let j = 0; j < NA; j++) { const a = j / NA * Math.PI * 2, k = 1 + (i - 1) * NA + j; pos[k * 3] = Math.cos(a) * r; pos[k * 3 + 2] = Math.sin(a) * r; } }
  for (let j = 0; j < NA; j++) idx.push(0, 1 + (j + 1) % NA, 1 + j);
  for (let i = 1; i < NR; i++) for (let j = 0; j < NA; j++) { const a = 1 + (i - 1) * NA + j, b = 1 + (i - 1) * NA + (j + 1) % NA, c = a + NA, d = b + NA; idx.push(a, b, c, b, d, c); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), RMAX);

  const WDEF = WAVES.map((w, i) => `W(${f(w.k * w.dx)}, ${f(w.k * w.dz)}, ${f(w.dx)}, ${f(w.dz)}, ${f(w.A)}, ${f(w.Q * 2 / WAVES.length)}, ${f(w.L)}, uPh[${i}] - ${f(w.ph)})`);
  const U = {
    uPh: { value: O.ph }, uBs: { value: O.bs }, tWL: { value: tWL }, tDet: { value: tex }, uT: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uAmb: { value: new THREE.Color(0.5, 0.6, 0.7) }, uFogCol: { value: new THREE.Color(0.8, 0.85, 0.9) }, uFogD: { value: 0.0003 },
    uSky: { value: new THREE.Color(0.3, 0.5, 0.8) }, uHorizon: { value: new THREE.Color(0.8, 0.85, 0.9) }, uGlow: { value: new THREE.Color(0, 0, 0) }, uDisc: { value: new THREE.Color(0, 0, 0) }, uSkySun: { value: new THREE.Vector3(0, 1, 0) },
    uCloudLit: { value: new THREE.Color(1, 1, 1) }, uCloudDark: { value: new THREE.Color(0.6, 0.6, 0.7) }, tSky: { value: null }, uRot: { value: 0 }, uHasSky: { value: 0 }, uNight: { value: 0 }, uLamp: { value: 0 },
  };
  const COMMON = /* glsl */`
    #define WATER_Y ${f(WATER_Y)}
    #define SAND_TOP ${f(SAND_TOP)}
    #define BZ1 ${f(BZ1)}
    uniform float uPh[${WAVES.length}]; uniform float uBs[${BORES.length}]; uniform sampler2D tWL; uniform float uT;
    float wz(float x) { float fx = clamp((x - ${f(X0)}) / 5.0, 0.0, ${NX - 1}.0); int i = int(floor(fx)); float t = fx - float(i);
      return mix(texelFetch(tWL, ivec2(i, 0), 0).r, texelFetch(tWL, ivec2(min(i + 1, ${NX - 1}), 0), 0).r, t); }
    float envG(float d) { return smoothstep(5.0, 60.0, d) * (1.0 + 0.3 * exp(-pow((d - 35.0) / 13.0, 2.0))); }
    // one breaking-bore train: height, d(height)/dd, foam
    vec3 bore(float d, float x, float s0, float H, float i) {
      float s = fract(s0 + 0.05 * sin(x * 0.011 + i * 2.1) + 0.03 * sin(x * 0.037 + 2.0 + i));
      float e = 1.0 - pow(1.0 - s, 1.7), dB = 30.0 - 39.0 * e;
      float Hb = H * (0.78 + 0.22 * sin(x * 0.019 + i * 4.0)) * pow(1.0 - s, 0.9) * smoothstep(0.0, 0.06, s), xp = d - dB;
      float h = xp >= 0.0 ? Hb * exp(-xp / 7.0) : Hb * exp(xp / 0.9);
      float dh = xp >= 0.0 ? -h / 7.0 : h / 0.9;
      float fo = (xp >= 0.0 ? exp(-xp / (2.0 + 13.0 * s)) : exp(xp / 0.45)) * smoothstep(0.0, 0.05, s) * (1.0 - 0.55 * s) * smoothstep(0.0, 0.05, Hb);
      return vec3(h, dh, fo);
    }
    float sandY(float z, float zw) {
      if (z <= BZ1) return 0.0;
      float t = (z - BZ1) / max(20.0, zw - BZ1);
      if (t <= 1.0) { float dune = 0.25 * sin(min(1.0, t * 4.0) * 3.14159265); return SAND_TOP - 1.05 * t + dune * (1.0 - t); }
      return SAND_TOP - 1.05 - min(2.5, (z - zw) * 0.035);
    }`;
  const vert = /* glsl */`
    ${COMMON}
    varying vec3 vW; varying vec2 vP; varying float vZw;
    #define W(KX, KZ, DX, DZ, A, Q, L, PH) { float th = KX * p.x + KZ * p.y - (PH); float lod = 1.0 - smoothstep(L * 0.16, L * 0.33, sp); float c = cos(th); disp.x += Q * A * DX * c * lod; disp.z += Q * A * DZ * c * lod; disp.y += A * sin(th) * lod; }
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      float r = length(position.xz); float sp = r * ${f(q - 1)} + 0.25;     // local grid spacing
      // the grid follows the camera; sampling the waves where its vertices happen to be made the swell swim / pulse as you moved
      // (fast on a jet ski). Snap each vertex to a world-anchored grid at its ring's spacing (rounded to a power of two): the
      // waves stay put, only the mesh slides under them.
      float spq = exp2(ceil(log2(sp))); w.xz = floor(w.xz / spq + 0.5) * spq;
      vec2 p = w.xz;
      float zw = wz(p.x), d = p.y - zw;
      vec3 disp = vec3(0.0);
      ${WDEF.join('\n      ')}
      float e = envG(d); disp *= e;
      float hb = 0.0; ${BORES.map((b, i) => `hb += bore(d, p.x, uBs[${i}], ${f(b.H)}, ${i}.0).x;`).join(' ')}
      w.xyz += vec3(disp.x, disp.y + hb, disp.z);
      vW = w.xyz; vP = p; vZw = zw;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const frag = /* glsl */`
    ${COMMON}
    uniform sampler2D tDet, tSky; uniform vec3 uSunDir, uSunCol, uAmb, uFogCol, uSky, uHorizon, uGlow, uDisc, uSkySun, uCloudLit, uCloudDark; uniform float uFogD, uRot, uHasSky, uNight, uLamp;
    varying vec3 vW; varying vec2 vP; varying float vZw;
    float hazeF(float dd) { float n = min(dd, 3000.0) * uFogD; return 1.0 - exp(-n * n) * exp(-max(dd - 3000.0, 0.0) / 30000.0); }
    // the scene's sky in direction dir (horizon.js dome maths, minus stars)
    vec3 skyCol(vec3 dir) {
      float e = max(dir.y, 0.0); float t = pow(1.0 - e, 4.0);
      vec3 col = mix(uSky, uHorizon, t);
      float sd = max(dot(dir, uSkySun), 0.0); float az = max(dot(normalize(dir.xz + 1e-5), normalize(uSkySun.xz + 1e-5)), 0.0);
      col += uGlow * (pow(sd, 6.0) * 0.55 + pow(sd, 60.0) * 0.9) + uGlow * pow(az, 3.0) * t * 0.35;
      #ifndef LOW
      if (uHasSky > 0.5) {
        float c = cos(uRot), s = sin(uRot); vec3 r = vec3(c * dir.x + s * dir.z, max(dir.y, 0.0), -s * dir.x + c * dir.z);
        vec2 uv = vec2(atan(r.z, r.x) * 0.15915494 + 0.5, asin(clamp(r.y, -1.0, 1.0)) * 0.31830989 + 0.5);
        vec3 h = texture2D(tSky, uv).rgb; float mx = max(max(h.r, h.g), h.b), mn = min(min(h.r, h.g), h.b);
        float cl = smoothstep(0.62, 0.86, mn / max(mx, 1e-4)) * smoothstep(-0.01, 0.06, e) * step(mx, 6.0);
        float lum = clamp(dot(h, vec3(0.3, 0.5, 0.2)) / 2.2, 0.0, 1.0);
        col = mix(col, mix(uCloudDark, uCloudLit, smoothstep(0.1, 0.9, lum)) + uGlow * pow(sd, 3.0) * 0.9 * lum, cl * 0.9);
      }
      #endif
      return mix(col, uFogCol, smoothstep(0.015, -0.02, dir.y) * 0.6);
    }
    #define WN(KX, KZ, DX, DZ, A, Q, L, PH) { float th = KX * vP.x + KZ * vP.y - (PH); float lod = 1.0 - smoothstep(L * 0.5, L * 1.2, fp); float k = length(vec2(KX, KZ)); float c = cos(th), s = sin(th); dh += vec2(KX, KZ) * A * c * lod * e; jac -= Q * A * k * s * lod * e; }
    void main() {
      vec3 V = vW - cameraPosition; float dist = length(V); V /= dist;
      float d = vP.y - vZw;
      if (d < -16.0) discard;
      float sand = sandY(vW.z, vZw), D = vW.y - sand;                    // water over the sand here
      float fp = dist * 0.0022;                                          // ~pixel footprint in metres (normal-wave LOD)
      float e = envG(d); vec2 dh = vec2(0.0); float jac = 1.0;
      ${(low ? WDEF.slice(0, 4) : WDEF).map((s) => s.replace(/^W\(/, 'WN(')).join('\n      ')}
      vec3 b0 = bore(d, vP.x, uBs[0], ${f(BORES[0].H)}, 0.0), b1 = bore(d, vP.x, uBs[1], ${f(BORES[1].H)}, 1.0);
      dh.y += b0.y + b1.y;
      // ripples: two scrolled samples of the detail normal, fading with distance
      float rip = (1.0 - smoothstep(30.0, 260.0, dist)) * (0.55 + 0.45 * smoothstep(0.0, 20.0, d));
      vec2 n1 = texture2D(tDet, vP * 0.19 + vec2(uT * 0.013, uT * 0.021)).rg * 2.0 - 1.0;
      #ifndef LOW
      vec2 n2 = texture2D(tDet, vP * 0.071 - vec2(uT * 0.009, -uT * 0.006)).rg * 2.0 - 1.0; n1 = n1 * 0.6 + n2 * 0.55;
      #endif
      vec3 N = normalize(vec3(-dh.x - n1.x * 0.24 * rip, 1.0, -dh.y - n1.y * 0.24 * rip));
      // foam: bore white water, residual carpet in the surf zone, crest whitecaps offshore, lace at the swash edge
      vec4 ft = texture2D(tDet, vP * 0.11 + vec2(0.0, uT * 0.02)); vec4 ft2 = texture2D(tDet, vP * 0.037 - vec2(uT * 0.004, 0.0));
      float blot = ft2.a; float lace = ft.b * 0.45 + ft2.b * 0.3 + smoothstep(0.35, 0.75, texture2D(tDet, vP * 0.23 + vec2(uT * 0.01, 0.0)).a) * 0.45;
      float wf = clamp(b0.z + b1.z * 0.8, 0.0, 1.4);
      float resid = smoothstep(34.0, 6.0, d) * smoothstep(-8.0, 0.0, d) * 0.28 * (0.4 + blot);
      float caps = smoothstep(0.62, 0.42, jac) * smoothstep(40.0, 90.0, d) * 0.9;
      float edge = smoothstep(0.1, 0.015, D) * smoothstep(-0.02, 0.01, D);
      float fam = wf + resid + caps + edge * 0.8;
      float foam = clamp(smoothstep(0.22, 0.95, fam * (0.15 + lace * 1.1)) + smoothstep(1.0, 1.4, fam) * 0.35 * lace, 0.0, 1.0) * (1.0 - smoothstep(400.0, 1500.0, dist) * 0.7);
      // light
      vec3 L = normalize(uSunDir); float sunUp = smoothstep(-0.05, 0.12, L.y);
      vec3 R = reflect(V, N); float farK = smoothstep(40.0, 1500.0, dist); R.y = max(abs(R.y), 0.05 + 0.10 * farK); R = normalize(R);   // unresolved facets far out tilt toward the viewer: reflect higher (bluer) sky
      float cosv = max(dot(-V, N), 0.0); float F = (0.02 + 0.98 * pow(1.0 - cosv, 5.0)) * mix(0.9, 0.72, farK);
      vec3 refl = skyCol(R);
      // water body: shallow sand-tinted turquoise-green → Atlantic grey-blue, lit by sky + sun
      float deep = smoothstep(0.3, 2.6, D), off = smoothstep(60.0, 450.0, d);
      vec3 cShallow = vec3(0.16, 0.30, 0.25), cMid = vec3(0.045, 0.14, 0.15), cDeep = vec3(0.025, 0.075, 0.10);
      vec3 body = mix(mix(cShallow, cMid, deep), cDeep, off);
      body = mix(vec3(0.42, 0.37, 0.28) * 0.6, body, smoothstep(0.0, 0.5, D));       // the sand bottom through ankle-deep water
      vec3 light = uAmb * 0.9 + uSunCol * max(L.y, 0.0) * 0.32;
      body *= light;
      // sunlight through the backs of the crests (subsurface): the green glow of a wave face
      float crest = clamp(disp_h(vW.y), 0.0, 1.0);
      float sss = pow(max(dot(normalize(vec3(V.x, 0.0, V.z)), normalize(vec3(L.x, 0.0, L.z))), 0.0), 3.0) * crest * sunUp;
      body += vec3(0.06, 0.20, 0.16) * uSunCol * sss * 0.35;
      vec3 col = mix(body, refl, F);
      // sun / moon glint (normalised Blinn lobe that widens with distance so far water gets a broad sheen instead of noise)
      vec3 Hh = normalize(L - V); float sh = mix(1400.0, 180.0, smoothstep(10.0, 900.0, dist));
      col += uSunCol * pow(max(dot(N, Hh), 0.0), sh) * (sh * 0.012) * F * 4.0 * smoothstep(-0.02, 0.05, L.y + 0.04);
      // foam lit like a rough white surface
      vec3 foamC = vec3(0.92, 0.94, 0.95) * (uSunCol * max(dot(N, L), 0.0) * 0.33 + uAmb * 1.05);
      col = mix(col, foamC, foam);
      // horizon haze (same curve as the far-ocean disc it fades into)
      col = mix(col, uFogCol, hazeF(dist));
      float alpha = smoothstep(0.0, 0.07, D + foam * 0.03) * (1.0 - smoothstep(2300.0, 2900.0, dist));
      gl_FragColor = vec4(col, alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`.replace('float crest = clamp(disp_h(vW.y), 0.0, 1.0);', 'float crest = clamp((vW.y - WATER_Y) * 2.2 + 0.25, 0.0, 1.0) * smoothstep(8.0, 30.0, d);');
  const mat = new THREE.ShaderMaterial({ name: 'ocean', uniforms: U, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: true, fog: false, defines: low ? { LOW: 1 } : {} });
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'ocean'; mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.userData.surface = 'water';
  mesh.position.set(0, WATER_Y, 250); scene.add(mesh);

  // ---- per frame: clock (wall-clock → identical sea for every online client), follow the camera, pull lights / sky / fog ----
  let dome = null; const _d = new THREE.Vector3();
  const tick = () => {
    const t = (Date.now() / 1000) % 7200; O.time = t;
    for (let i = 0; i < WAVES.length; i++) O.ph[i] = (WAVES[i].w * t) % (Math.PI * 2);
    for (let i = 0; i < BORES.length; i++) O.bs[i] = (t / BORES[i].T + BORES[i].o) % 1;
  };
  O.tick = tick; tick();
  world.updaters.push(() => {
    tick(); U.uT.value = O.time % 600;
    const cam = ctx.camera; if (cam) mesh.position.set(Math.max(-2500, Math.min(2500, cam.position.x)), WATER_Y, Math.max(150, Math.min(3000, cam.position.z)));
    const key = ctx.lights?.key; if (key) { _d.copy(key.position).sub(key.target.position).normalize(); U.uSunDir.value.copy(_d); U.uSunCol.value.copy(key.color).multiplyScalar(key.intensity); }
    const hemi = ctx.lights?.hemi; if (hemi) U.uAmb.value.copy(hemi.color).lerp(hemi.groundColor, 0.25).multiplyScalar(hemi.intensity * (1 + (scene.environmentIntensity ?? 0.5) * 0.6));
    if (scene.fog) { U.uFogCol.value.copy(scene.fog.color); if (scene.fog.density) U.uFogD.value = scene.fog.density; }
    if (!dome) dome = scene.getObjectByName('horizon:sky');
    const du = dome?.material?.uniforms;
    if (du) {
      for (const k of ['uSky', 'uHorizon', 'uGlow', 'uDisc', 'uCloudLit', 'uCloudDark']) if (du[k]) U[k].value.copy(du[k].value);
      if (du.uSunDir) U.uSkySun.value.copy(du.uSunDir.value);
      U.tSky.value = du.tSky?.value || null; U.uRot.value = du.uRot?.value || 0; U.uHasSky.value = U.tSky.value ? (du.uHasSky?.value || 0) : 0; U.uNight.value = du.uNight?.value || 0;
    } else if (scene.fog) { U.uHorizon.value.copy(scene.fog.color); U.uSky.value.copy(scene.fog.color).multiplyScalar(0.8); U.uSkySun.value.copy(U.uSunDir.value); }
  });
  O.mesh = mesh; O.material = mat;
  W.ocean = O;
  if (typeof window !== 'undefined' && window.__game) window.__game.ocean = O;
  return O;
}
