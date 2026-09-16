// Wet asphalt ground with puddle mask, painted lane markings, grime, animated rain ripples. WORLD agent.
import * as THREE from 'three';

export const GROUND_SIZE = 160;

export function buildGround(world) {
  const { ctx, scene, R } = world;
  const A = ctx.assets;

  const mask = makeMask(R);
  const maskTex = new THREE.CanvasTexture(mask);
  maskTex.wrapS = maskTex.wrapT = THREE.ClampToEdgeWrapping; maskTex.anisotropy = 8;
  const varTex = new THREE.CanvasTexture(makeVariation(R));
  varTex.wrapS = varTex.wrapT = THREE.RepeatWrapping;

  const mat = A.material('asphalt', { repeat: GROUND_SIZE / 7, roughness: 1, metalness: 1, normalScale: 0.55, envMapIntensity: 0.9, color: 0xb8b8b8 });
  const asphaltWorn = A.pbr('asphalt_worn');
  const detail = asphaltWorn?.map ? asphaltWorn.map.clone() : null;
  if (detail) { detail.repeat.set(GROUND_SIZE / 23, GROUND_SIZE / 23); detail.needsUpdate = true; }

  const uniforms = { uMask: { value: maskTex }, uTime: { value: 0 }, uRain: { value: 1 }, uWorld: { value: GROUND_SIZE }, uDetail: { value: detail || maskTex }, uVar: { value: varTex } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos; uniform sampler2D uMask; uniform sampler2D uDetail; uniform sampler2D uVar; uniform float uTime; uniform float uRain; uniform float uWorld;
        vec2 hash22(vec2 p){ vec3 a = fract(vec3(p.xyx) * vec3(123.34, 234.34, 345.65)); a += dot(a, a + 34.45); return fract(vec2(a.x*a.y, a.y*a.z)); }
        vec2 rippleGrad(vec2 p, float t){
          vec2 g = vec2(0.0);
          for (int L = 0; L < 2; L++) {
            vec2 q = p * (1.0 + float(L) * 0.83) + float(L) * 17.3;
            vec2 c = floor(q); vec2 f = q - c;
            for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
              vec2 o = vec2(float(x), float(y)); vec2 h = hash22(c + o);
              vec2 d = f - (o + h);
              float r = length(d);
              float life = fract(t * (0.7 + h.y * 0.6) + h.x * 9.0);
              float Rr = life * 0.75;
              float w = sin((r - Rr) * 34.0) * exp(-abs(r - Rr) * 14.0) * (1.0 - life) * (1.0 - life) * step(r, Rr + 0.12);
              g += (d / max(r, 1e-3)) * w;
            }
          }
          return g;
        }
        float ripples(vec2 p, float t) { return 0.0; }
        vec4 gMask; float gPuddle;`)
      .replace('#include <map_fragment>', `
        vec2 muv = vWPos.xz / uWorld + 0.5;
        gMask = texture2D(uMask, muv);
        // anti-tiling: blend a second asphalt sample at a different scale by low-frequency mask alpha
        vec4 texelColor = texture2D(map, vMapUv);
        vec4 texel2 = texture2D(uDetail, vMapUv * 0.31 + 0.37);
        float lowVar = texture2D(uVar, muv * 3.0).r;
        texelColor = mix(texelColor, texel2, smoothstep(0.35, 0.65, lowVar) * 0.75);
        diffuseColor *= texelColor;
        // painted markings (worn yellow) and grime / oil
        vec3 paint = vec3(0.85, 0.62, 0.16) * (0.75 + 0.5 * texelColor.g);
        diffuseColor.rgb = mix(diffuseColor.rgb, paint, gMask.g * 0.9);
        diffuseColor.rgb *= 1.0 - gMask.b * 0.7;
        gPuddle = smoothstep(0.35, 0.6, gMask.r);
        diffuseColor.rgb *= mix(1.0, 0.45, gPuddle);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = roughnessFactor * (0.78 - 0.3 * gMask.b);
        roughnessFactor = mix(roughnessFactor, 0.035, gPuddle);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (gPuddle > 0.001) {
          vec2 g = rippleGrad(vWPos.xz * 1.6, uTime) * uRain;
          vec3 nW = normalize(vec3(-g.x * 0.35, 1.0, -g.y * 0.35));
          vec3 nV = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
          normal = normalize(mix(normal, nV, gPuddle));
        }`);
  };
  mat.customProgramCacheKey = () => 'zavod-ground';

  const geo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(geo, mat);
  ground.name = 'ground'; ground.receiveShadow = true; ground.userData.surface = 'ground';
  scene.add(ground);
  ctx.raycastTargets.push(ground);
  world.updaters.push((dt) => { uniforms.uTime.value += dt; uniforms.uRain.value = world.ctx.settings.rain === false ? 0 : 1; });
  world.ground = ground;
  world.groundMask = mask;
}

// R = puddles, G = paint, B = grime/oil, A = low-frequency variation
function makeMask(R) {
  const S = 2048; const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const toPx = (m) => (m / GROUND_SIZE + 0.5) * S; // world metre → px
  const pxm = S / GROUND_SIZE;
  g.fillStyle = '#000000'; g.fillRect(0, 0, S, S); // opaque: keep RGB un-premultiplied

  const blob = (cx, cz, rx, rz, color, alpha, n = 10) => {
    // organic blob: union of jittered ellipses
    for (let i = 0; i < n; i++) {
      const ox = (R() - 0.5) * rx * 0.9, oz = (R() - 0.5) * rz * 0.9;
      const r = Math.min(rx, rz) * (0.45 + R() * 0.55);
      const x = toPx(cx + ox), y = toPx(cz + oz), rp = r * pxm;
      const gr = g.createRadialGradient(x, y, rp * 0.55, x, y, rp);
      gr.addColorStop(0, color.replace('A', alpha)); gr.addColorStop(1, color.replace('A', 0));
      g.fillStyle = gr; g.fillRect(x - rp, y - rp, 2 * rp, 2 * rp);
    }
  };

  // ---- grime (B): oil stains, drainage streaks, general dirt ----------------
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 260; i++) blob((R() - 0.5) * 120, (R() - 0.5) * 120, 3 + R() * 10, 3 + R() * 10, 'rgba(0,0,255,A)', 0.12 + R() * 0.25, 5);
  for (let i = 0; i < 40; i++) blob((R() - 0.5) * 110, (R() - 0.5) * 110, 1 + R() * 2.5, 1 + R() * 2.5, 'rgba(0,0,255,A)', 0.55 + R() * 0.4, 6); // oil
  // tyre tracks along the container lanes (dark lines)
  g.strokeStyle = 'rgba(0,0,255,0.35)'; g.lineWidth = 0.5 * pxm; g.lineCap = 'round';
  for (const lx of [8.5, 15, 21.5, 28, 34.5, 41, 47.5, 54]) {
    for (const off of [-0.9, 0.9]) {
      g.beginPath(); g.moveTo(toPx(lx + off), toPx(-56)); g.lineTo(toPx(lx + off + (R() - 0.5)), toPx(56)); g.stroke();
    }
  }
  g.globalCompositeOperation = 'source-over';

  // ---- puddles (R) -----------------------------------------------------------
  g.globalCompositeOperation = 'lighter';
  const puddles = [
    [-3, 12, 12, 8], [4, 22, 8, 5], [-9, -8, 7, 9], [18, 40, 10, 5], [30, -20, 6, 12], [40, 20, 7, 7], [-26, 20, 9, 6], [-44, 34, 8, 8],
    [-5, -40, 9, 6], [22, -46, 12, 4], [50, 44, 6, 8], [10, -14, 5, 7], [-20, -12, 6, 5], [34, 32, 5, 5], [-35, 2, 8, 5], [50, -36, 5, 9],
  ];
  for (const [x, z, rx, rz] of puddles) blob(x, z, rx, rz, 'rgba(255,0,0,A)', 0.9, 14);
  for (let i = 0; i < 90; i++) blob((R() - 0.5) * 112, (R() - 0.5) * 112, 1.5 + R() * 4, 1.5 + R() * 4, 'rgba(255,0,0,A)', 0.8, 5);
  // lane wheel ruts collect water
  g.strokeStyle = 'rgba(255,0,0,0.6)'; g.lineWidth = 0.7 * pxm;
  for (const lx of [8.5, 21.5, 34.5, 47.5]) for (const off of [-0.9, 0.9]) {
    const z0 = -40 + R() * 20, z1 = z0 + 12 + R() * 30;
    g.beginPath(); g.moveTo(toPx(lx + off), toPx(z0)); g.lineTo(toPx(lx + off), toPx(z1)); g.stroke();
  }
  g.globalCompositeOperation = 'source-over';

  // ---- paint (G): lane lines, hatching, bay numbers, crossings ---------------
  g.strokeStyle = 'rgba(0,255,0,0.85)'; g.fillStyle = 'rgba(0,255,0,0.85)'; g.lineWidth = 0.14 * pxm;
  // container row outlines
  for (const rx of [12, 18.5, 25, 31.5, 38, 44.5, 51]) {
    g.strokeRect(toPx(rx - 1.5), toPx(-42), 3 * pxm, 84 * pxm);
  }
  // dashed lane centre lines
  g.setLineDash([2 * pxm, 2 * pxm]);
  for (const lx of [15.25, 28, 41.25]) { g.beginPath(); g.moveTo(toPx(lx), toPx(-44)); g.lineTo(toPx(lx), toPx(46)); g.stroke(); }
  g.setLineDash([]);
  // plaza hatching (no-parking zone) and stop line
  g.lineWidth = 0.18 * pxm;
  g.save(); g.beginPath(); g.rect(toPx(-12), toPx(-4), 14 * pxm, 10 * pxm); g.clip();
  for (let i = -30; i < 30; i++) { g.beginPath(); g.moveTo(toPx(-12 + i * 1.2), toPx(-4)); g.lineTo(toPx(-12 + i * 1.2 + 10), toPx(6)); g.stroke(); }
  g.restore();
  g.strokeRect(toPx(-12), toPx(-4), 14 * pxm, 10 * pxm);
  g.lineWidth = 0.4 * pxm; g.beginPath(); g.moveTo(toPx(-14), toPx(30)); g.lineTo(toPx(6), toPx(30)); g.stroke();
  // pedestrian crossing stripes
  for (let i = 0; i < 8; i++) g.fillRect(toPx(-14 + i * 2.2), toPx(31), 1.2 * pxm, 3.5 * pxm);
  // bay numbers
  g.font = `bold ${5 * pxm}px Arial`; g.textAlign = 'center';
  g.save(); g.translate(toPx(15.25), toPx(-48)); g.rotate(Math.PI / 2); g.fillText('12', 0, 0); g.restore();
  g.save(); g.translate(toPx(28), toPx(-48)); g.rotate(Math.PI / 2); g.fillText('13', 0, 0); g.restore();
  g.save(); g.translate(toPx(41.25), toPx(-48)); g.rotate(Math.PI / 2); g.fillText('14', 0, 0); g.restore();
  g.font = `bold ${3.2 * pxm}px Arial`; g.fillText('СТОП', toPx(-4), toPx(35));
  // loading area box near warehouse
  g.lineWidth = 0.16 * pxm; g.strokeRect(toPx(-44), toPx(-20), 16 * pxm, 10 * pxm);
  // wear: erase parts of the paint
  g.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 500; i++) { const x = R() * S, y = R() * S, r = (0.3 + R() * 1.2) * pxm; const k = Math.floor(40 + R() * 150); g.fillStyle = `rgb(255,${k},255)`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  g.globalCompositeOperation = 'source-over';
  return c;
}

function makeVariation(R) {
  const S = 256; const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 60; i++) {
    const x = R() * S, y = R() * S, r = 20 + R() * 70;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); const a = 0.3 + R() * 0.6;
    gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  return c;
}
