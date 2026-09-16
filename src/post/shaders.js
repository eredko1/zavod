// GLSL for the ZAVOD post stack. Owned by: POST agent.
// All passes are GLSL1-style (three prefixes #version 300 es + texture2D shims for WebGL2).

// ---------------------------------------------------------------------------------------------
// Shared depth helpers: linear view Z, view-space position from depth, normal from depth (min-diff).
// Every pass that includes this must supply uniforms tDepth, uProj, uInvProj, uNear, uFar, uTexel.
// ---------------------------------------------------------------------------------------------
export const DEPTH_COMMON = /* glsl */`
uniform highp sampler2D tDepth;
uniform mat4 uProj;
uniform mat4 uInvProj;
uniform float uNear;
uniform float uFar;
uniform vec2 uTexel;          // 1 / full-res depth size

float rawDepth(vec2 uv) { return texture2D(tDepth, uv).x; }
// negative view-space z (three convention)
float viewZ(float d) { return (uNear * uFar) / ((uFar - uNear) * d - uFar); }
vec3 viewPos(vec2 uv, float d) {
  vec4 c = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 v = uInvProj * c;
  return v.xyz / v.w;
}
// Depth-only normal reconstruction; picks the neighbour with the smaller depth delta on each axis
// so silhouettes don't produce garbage normals.
vec3 reconstructNormal(vec2 uv, vec3 P, float d) {
  vec2 ox = vec2(uTexel.x, 0.0), oy = vec2(0.0, uTexel.y);
  float dl = rawDepth(uv - ox), dr = rawDepth(uv + ox);
  float db = rawDepth(uv - oy), dt = rawDepth(uv + oy);
  vec3 Pl = viewPos(uv - ox, dl), Pr = viewPos(uv + ox, dr);
  vec3 Pb = viewPos(uv - oy, db), Pt = viewPos(uv + oy, dt);
  vec3 dx = (abs(dl - d) < abs(dr - d)) ? (P - Pl) : (Pr - P);
  vec3 dy = (abs(db - d) < abs(dt - d)) ? (P - Pb) : (Pt - P);
  return normalize(cross(dx, dy));
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

export const FSQ_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

// ---------------------------------------------------------------------------------------------
// SSR trace (half-res). Output: rgb = reflected scene colour (HDR linear), a = confidence.
// Only traces from surfaces whose view-space normal points roughly up (wet ground / puddles).
// ---------------------------------------------------------------------------------------------
export const SSR_TRACE_FRAG = /* glsl */`
${DEPTH_COMMON}
uniform sampler2D tColor;
uniform vec3 uUpView;         // world up in view space
uniform float uTime;
uniform float uMaxDist;       // metres
uniform float uThickness;     // metres (scaled by distance)
uniform float uMinUp;         // dot(N, up) threshold
varying vec2 vUv;
#define STEPS 32
#define REFINE 5

void main() {
  float d = rawDepth(vUv);
  if (d >= 1.0) { gl_FragColor = vec4(0.0); return; }
  vec3 P = viewPos(vUv, d);
  if (-P.z < 0.9) { gl_FragColor = vec4(0.0); return; }             // viewmodel / very near
  vec3 N = reconstructNormal(vUv, P, d);
  float up = dot(N, uUpView);
  if (up < uMinUp) { gl_FragColor = vec4(0.0); return; }
  N = normalize(mix(N, uUpView, 0.6));                               // flatten ripples for a calm-water look
  vec3 V = normalize(-P);
  vec3 R = reflect(-V, N);
  // glossy jitter (wet asphalt isn't a mirror)
  float j = hash12(gl_FragCoord.xy + fract(uTime) * 61.0);
  float j2 = hash12(gl_FragCoord.yx * 1.7 + fract(uTime * 0.37) * 23.0);
  R = normalize(R + (vec3(j2, j, hash12(gl_FragCoord.xy * 0.31 + j)) - 0.5) * 0.03);

  float rayLen = uMaxDist;
  vec3 E = P + R * rayLen;
  if (E.z > -uNear) {                                                // clip against near plane
    rayLen = (-uNear - P.z) / R.z * 0.98; E = P + R * rayLen;
  }
  vec4 c0 = uProj * vec4(P, 1.0);
  vec4 c1 = uProj * vec4(E, 1.0);
  vec2 uv0 = c0.xy / c0.w * 0.5 + 0.5;
  vec2 uv1 = c1.xy / c1.w * 0.5 + 0.5;
  // clip the screen-space segment to the viewport so every step is spent on visible pixels
  vec2 dir = uv1 - uv0;
  float tMax = 1.0;
  if (dir.x > 0.0) tMax = min(tMax, (1.0 - uv0.x) / dir.x); else if (dir.x < 0.0) tMax = min(tMax, -uv0.x / dir.x);
  if (dir.y > 0.0) tMax = min(tMax, (1.0 - uv0.y) / dir.y); else if (dir.y < 0.0) tMax = min(tMax, -uv0.y / dir.y);
  tMax = clamp(tMax, 0.0, 1.0);
  // perspective-correct interpolation in screen space: interpolate 1/w and z/w linearly
  float k0 = 1.0 / c0.w, k1 = 1.0 / c1.w;                          // c.w = -viewZ
  float q0 = P.z * k0, q1 = E.z * k1;
  float sPrev = 0.0, sHit = 0.0; bool hit = false;
  float thick = uThickness;
  for (int i = 1; i <= STEPS; i++) {
    float s = tMax * (float(i) - j * 0.75) / float(STEPS);
    vec2 uv = mix(uv0, uv1, s);
    float k = mix(k0, k1, s);
    float rz = mix(q0, q1, s) / k;                                   // view z along the ray (negative)
    float sz = viewZ(rawDepth(uv));
    float th = thick * (1.0 + 0.05 * -sz);
    if (rz < sz && rz > sz - th) { hit = true; sHit = s; break; }
    sPrev = s;
  }
  if (!hit) { gl_FragColor = vec4(0.0); return; }
  float t0 = sPrev, t1 = sHit;
  for (int k = 0; k < REFINE; k++) {
    float tm = 0.5 * (t0 + t1);
    vec2 uv = mix(uv0, uv1, tm);
    float kk = mix(k0, k1, tm);
    float rz = mix(q0, q1, tm) / kk, sz = viewZ(rawDepth(uv));
    if (rz < sz) t1 = tm; else t0 = tm;
  }
  vec2 huv = mix(uv0, uv1, t1);
  float hd = rawDepth(huv);
  vec3 HP = viewPos(huv, hd);
  vec3 HN = reconstructNormal(huv, HP, hd);
  float facing = clamp(-dot(HN, R) * 4.0, 0.0, 1.0);                // reject back-facing hits (ray passed under geometry)
  vec2 e = smoothstep(vec2(0.0), vec2(0.1), huv) * smoothstep(vec2(0.0), vec2(0.1), 1.0 - huv);
  float edge = e.x * e.y;
  float distFade = 1.0 - smoothstep(0.75, 1.0, t1 / max(tMax, 1e-4));
  float conf = facing * edge * distFade;
  vec3 col = texture2D(tColor, huv).rgb;
  gl_FragColor = vec4(col, conf);
}
`;

// Separable blur for the SSR buffer, weighted by confidence; anisotropic (taller than wide) so
// lamp reflections stretch vertically like on real wet asphalt.
export const SSR_BLUR_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 uDir;            // (texel,0) or (0,texel)
varying vec2 vUv;
void main() {
  const float w[5] = float[5](0.227, 0.194, 0.121, 0.054, 0.016);
  vec4 acc = texture2D(tDiffuse, vUv) * w[0];
  float ws = w[0];
  for (int i = 1; i < 5; i++) {
    vec2 o = uDir * float(i);
    vec4 a = texture2D(tDiffuse, vUv + o), b = texture2D(tDiffuse, vUv - o);
    acc += a * w[i] + b * w[i];
    ws += 2.0 * w[i];
  }
  gl_FragColor = acc / ws;
}
`;

// ---------------------------------------------------------------------------------------------
// Composite: scene colour × AO, then Fresnel-weighted SSR on up-facing pixels. Also the pass that
// copies the dedicated scene RT into the composer chain, so it always runs.
// ---------------------------------------------------------------------------------------------
export const COMPOSITE_FRAG = /* glsl */`
${DEPTH_COMMON}
uniform sampler2D tScene;
uniform sampler2D tAO;
uniform sampler2D tSSR;
uniform float uAO;            // 0..1 blend
uniform float uSSR;           // 0..1 blend
uniform float uF0;
uniform vec3 uUpView;
uniform float uMinUp;
varying vec2 vUv;

void main() {
  vec3 col = texture2D(tScene, vUv).rgb;
  float d = rawDepth(vUv);
  if (d < 1.0 && (uAO > 0.0 || uSSR > 0.0)) {
    vec3 P = viewPos(vUv, d);
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    if (uAO > 0.0) {
      // depth-aware 4-tap upsample of the half-res AO
      vec2 hx = uTexel * 2.0;
      float zc = P.z;
      float ao = 0.0, ws = 0.0;
      for (int i = 0; i < 4; i++) {
        vec2 o = vec2(float(i & 1) - 0.5, float(i >> 1) - 0.5) * hx;
        float dz = viewZ(rawDepth(vUv + o));
        float w = 1.0 / (1.0 + abs(dz - zc) * 4.0);
        ao += texture2D(tAO, vUv + o).r * w; ws += w;
      }
      ao /= ws;
      ao = max(ao, 0.45);
      // AO is an ambient term: back it off on directly lit (bright) pixels so lamps don't get dirty
      float litFade = 1.0 - smoothstep(0.25, 2.0, luma);
      col *= mix(1.0, ao, uAO * litFade);
    }
    if (uSSR > 0.0 && -P.z > 0.9) {
      vec3 N = reconstructNormal(vUv, P, d);
      float up = dot(N, uUpView);
      if (up > uMinUp) {
        vec3 V = normalize(-P);
        float cosT = clamp(dot(N, V), 0.0, 1.0);
        float F = uF0 + (1.0 - uF0) * pow(1.0 - cosT, 5.0);
        vec4 r = texture2D(tSSR, vUv);
        float w = clamp(F * r.a * uSSR * smoothstep(uMinUp, uMinUp + 0.15, up), 0.0, 1.0);
        col = mix(col, r.rgb, w);
      }
    }
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------------------------------------------------------------------------------------------
// Camera motion blur via reprojection against the previous frame's view-projection.
// ---------------------------------------------------------------------------------------------
export const MOTION_BLUR_FRAG = /* glsl */`
${DEPTH_COMMON}
uniform sampler2D tDiffuse;
uniform mat4 uInvViewProj;    // current
uniform mat4 uPrevViewProj;   // previous frame
uniform float uIntensity;     // 0..1 (shutter)
uniform float uMaxBlur;       // uv units
uniform float uTime;
varying vec2 vUv;
#define SAMPLES 8

void main() {
  vec4 base = texture2D(tDiffuse, vUv);
  float d = rawDepth(vUv);
  float vz = -viewZ(d);
  if (uIntensity <= 0.001 || vz < 1.0) { gl_FragColor = base; return; }   // skip viewmodel
  vec4 clip = vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 wp = uInvViewProj * clip; wp /= wp.w;
  vec4 pc = uPrevViewProj * wp;
  vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
  vec2 vel = (vUv - puv) * uIntensity;
  float len = length(vel);
  if (len < 0.0004) { gl_FragColor = base; return; }
  if (len > uMaxBlur) vel *= uMaxBlur / len;
  float j = hash12(gl_FragCoord.xy + fract(uTime) * 17.0) - 0.5;
  vec3 acc = vec3(0.0); float ws = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    float t = (float(i) + j) / float(SAMPLES - 1) - 0.5;
    vec2 suv = vUv + vel * t;
    float sd = -viewZ(rawDepth(suv));
    float w = sd < 1.0 ? 0.0 : 1.0;                                  // don't smear the viewmodel into the world
    acc += texture2D(tDiffuse, suv).rgb * w; ws += w;
  }
  gl_FragColor = vec4(ws > 0.0 ? acc / ws : base.rgb, base.a);
}
`;

// ---------------------------------------------------------------------------------------------
// Depth of field: subtle near-field bokeh on the viewmodel during ADS (CoD sight blur).
// ---------------------------------------------------------------------------------------------
export const DOF_FRAG = /* glsl */`
${DEPTH_COMMON}
uniform sampler2D tDiffuse;
uniform float uNearEnd;       // metres: fully blurred below this
uniform float uNearStart;     // metres: sharp beyond this
uniform float uMaxCoc;        // px
uniform float uAmount;        // 0..1
uniform vec2 uResolution;
varying vec2 vUv;
#define TAPS 12

float coc(float vz) { return uMaxCoc * uAmount * (1.0 - smoothstep(uNearEnd, uNearStart, vz)); }

void main() {
  vec4 base = texture2D(tDiffuse, vUv);
  float vz = -viewZ(rawDepth(vUv));
  float c = coc(vz);
  if (c < 0.5) { gl_FragColor = base; return; }
  vec2 px = 1.0 / uResolution;
  float rot = hash12(gl_FragCoord.xy) * 6.2831;
  float cs = cos(rot), sn = sin(rot);
  vec3 acc = base.rgb; float ws = 1.0;
  for (int i = 0; i < TAPS; i++) {
    float a = float(i) * 2.399963 + rot;                            // golden-angle spiral
    float r = sqrt((float(i) + 0.5) / float(TAPS));
    vec2 o = vec2(cos(a), sin(a)) * r * c * px;
    float sz = -viewZ(rawDepth(vUv + o));
    float sc = coc(sz);
    float w = clamp(sc / max(c, 0.001), 0.0, 1.0);                  // only gather from equally blurred pixels
    acc += texture2D(tDiffuse, vUv + o).rgb * w; ws += w;
  }
  gl_FragColor = vec4(acc / ws, base.a);
}
`;

// ---------------------------------------------------------------------------------------------
// Final grade (LDR, after tone map + SMAA): shake, lens rain, CA, sharpen, LGG, contrast,
// saturation, split tone, health FX, flash, vignette, grain.
// ---------------------------------------------------------------------------------------------
export const GRADE_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform sampler2D tDrops;
uniform vec2 uResolution;
uniform float uTime;
uniform float uExposure;      // LDR gain (1 = none)
uniform float uContrast;
uniform float uPivot;
uniform float uSaturation;
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uSplitAmount;
uniform float uVignette;
uniform float uGrain;
uniform float uCA;
uniform float uSharpen;
uniform float uDrops;         // lens rain strength (already includes look-up factor)
uniform float uDropsAspect;
uniform vec2 uDropsOffset;
uniform vec2 uShake;          // uv offset
uniform float uDamage;        // 0..1 red edge pulse
uniform float uDesat;         // 0..1
uniform float uLowHealth;     // 0..1 persistent
uniform float uHeartbeat;     // 0..1 pulse
uniform float uFlash;         // 0..1 white flash
uniform float uEdgeDark;      // extra vignette from health
varying vec2 vUv;

vec3 sampleScene(vec2 uv) { return texture2D(tDiffuse, uv).rgb; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec2 uv = vUv + uShake;
  vec2 px = 1.0 / uResolution;
  vec2 cuv = uv - 0.5;
  float r2 = dot(cuv, cuv);

  // lens rain: two droplet layers, RG = normal xy, B = drop mask
  if (uDrops > 0.0) {
    vec2 duv1 = uv * vec2(uDropsAspect, 1.0) * 1.6 + uDropsOffset;
    vec2 duv2 = uv * vec2(uDropsAspect, 1.0) * 0.9 + uDropsOffset * 0.6 + vec2(0.37, 0.61);
    vec4 d1 = texture2D(tDrops, duv1);
    vec4 d2 = texture2D(tDrops, duv2);
    float phase1 = 0.5 + 0.5 * sin(uTime * 0.23), phase2 = 0.5 + 0.5 * sin(uTime * 0.31 + 2.0);
    vec2 n1 = (d1.rg * 2.0 - 1.0) * d1.b * smoothstep(0.35, 0.8, phase1);
    vec2 n2 = (d2.rg * 2.0 - 1.0) * d2.b * smoothstep(0.35, 0.8, phase2);
    uv += (n1 + n2) * uDrops * 0.009;
  }

  // chromatic aberration (radial, edges only) + sharpen
  vec2 ca = cuv * r2 * uCA;
  vec3 c;
  c.r = sampleScene(uv + ca).r;
  c.g = sampleScene(uv).g;
  c.b = sampleScene(uv - ca).b;
  if (uSharpen > 0.0) {
    vec3 n = sampleScene(uv + vec2(px.x, 0.0)) + sampleScene(uv - vec2(px.x, 0.0)) + sampleScene(uv + vec2(0.0, px.y)) + sampleScene(uv - vec2(0.0, px.y));
    c += (c - n * 0.25) * uSharpen;
  }
  c = max(c, 0.0);

  // grade
  c *= uExposure;
  c = uGain * (c + uLift * (1.0 - c));
  c = pow(max(c, 0.0), 1.0 / uGamma);
  c = (c - uPivot) * uContrast + uPivot;
  c = max(c, 0.0);
  float l = luma(c);
  float sat = uSaturation * (1.0 - 0.75 * uDesat) * (1.0 - 0.55 * uLowHealth);
  c = mix(vec3(l), c, sat);
  // split toning
  float sh = pow(1.0 - l, 2.0), hi = pow(l, 1.5);
  c *= mix(vec3(1.0), uShadowTint, sh * uSplitAmount);
  c *= mix(vec3(1.0), uHighlightTint, hi * uSplitAmount);

  // health FX
  float edge = smoothstep(0.12, 0.62, r2);
  if (uDamage > 0.0) {
    c = mix(c, vec3(0.62, 0.05, 0.03), edge * uDamage * 0.85);
  }
  if (uLowHealth > 0.0) {
    float hb = uHeartbeat * uLowHealth;
    c = mix(c, vec3(0.35, 0.03, 0.02), edge * (0.35 * uLowHealth + 0.35 * hb));
    c *= 1.0 - edge * 0.35 * uLowHealth;
  }
  c *= 1.0 - edge * uEdgeDark;

  // vignette (soft, wide)
  float vig = 1.0 - uVignette * smoothstep(0.15, 0.85, r2 * 1.6);
  c *= vig;

  // flash
  c = mix(c, vec3(1.0, 0.97, 0.9), uFlash);

  // film grain: animated hash, luminance weighted (stronger in shadows/mids)
  if (uGrain > 0.0) {
    float g = hash12(gl_FragCoord.xy + vec2(fract(uTime * 13.7) * 251.0, fract(uTime * 7.3) * 197.0)) - 0.5;
    float g2 = hash12(gl_FragCoord.yx * 1.3 + vec2(fract(uTime * 5.1) * 89.0, 0.0)) - 0.5;
    g = (g + g2 * 0.5) * 0.75;
    float lw = 1.0 - smoothstep(0.0, 1.0, l) * 0.7;
    c += g * uGrain * lw;
  }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

export const GRADE_FRAG_FULL = /* glsl */`
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
${GRADE_FRAG}
`;
