// Outfits for the Rocketbox people (world/people.js): clothes are re-baked on the GPU in UV space from the avatar's own mesh,
// so no UV-layout knowledge is needed — every body-material triangle is drawn at its UV position with its bind-pose
// position / normal / limb frame as varyings, and a fragment shader paints jeans, a black band tee with a front + back print,
// a track suit with three stripes down the sleeves and legs, bare forearms, white sneakers. The avatar's original texture is
// only used for fold shading (its luminance over a blurred mip). 12 dilation passes pad the islands so mips don't bleed.
//
//  - dressFigure(fig, ctx, outfit)      retexture a buildPerson() figure (material cached per avatar+outfit, shared by clones)
//  - standTall(fig, metres)             scale a figure to a real standing height (measured from the avatar's bind pose)
//  - addAfro(fig)                       big natural afro on the head anchor (lumpy squashed sphere + fuzzy alpha shell)
//  - dressRemote(inst, pid, ctx)        net.js remote players: the hero body (m20, 1.83 m, jeans + SOAD-style tee per player)
//  - shirtOf(id, ctx) / SHIRTS / shirtSwatchHTML(id, ctx)   deterministic tee per net id (collisions resolved across the room)
//  - dressViewmodelArms(mats)           first-person forearms: bare fair skin instead of the multicam sleeve
// Tee prints are original typographic layouts of the band / album NAMES only — no album artwork or logos are reproduced.
import * as THREE from 'three';
import { buildPerson, peopleReady, peopleDebug, loadPeople } from './people.js';

export const HERO = { avatar: 'm20', height: 1.83 };
const SKIN_FAIR = 0xe7bda0;

// ------------------------------------------------------------------------------------------------ tee designs (canvas text)
const IMPACT = 'Impact, "Haettenschweiler", "Arial Narrow Bold", "Arial Black", sans-serif';
const BLACKF = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
const HAND = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", "Segoe Print", cursive';
function fitText(g, s, x, y, font, px, maxW) { let p = px; g.font = font.replace('#', p); while (g.measureText(s).width > maxW && p > 8) { p -= 2; g.font = font.replace('#', p); } g.fillText(s, x, y); return p; }
function strokeFit(g, s, x, y, font, px, maxW, lw) { let p = px; g.font = font.replace('#', p); while (g.measureText(s).width > maxW && p > 8) { p -= 2; g.font = font.replace('#', p); } g.lineWidth = lw; g.strokeText(s, x, y); return p; }
/** screen-print wear: speckle holes through the ink */
function distress(g, S, n = 900, seed = 1) {
  let s = seed * 9973 + 17; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.save(); g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < n; i++) { g.globalAlpha = 0.25 + r() * 0.6; g.beginPath(); g.arc(r() * S, r() * S, 0.5 + r() * r() * 3.2, 0, Math.PI * 2); g.fill(); }
  g.restore();
}
const BAND = 'SYSTEM OF A DOWN';
/** 8 tee variants: label = what the durak seat swatch says, c = accent (swatch + back print) */
export const SHIRTS = [
  { key: 'classic', label: 'SOAD CLASSIC', c: '#e8e6e0', c2: '#d6232b', front(g, S) {
      g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = '#ecebe6';
      fitText(g, 'SYSTEM', S / 2, S * 0.36, `900 #px ${IMPACT}`, 150, S * 0.86); fitText(g, 'OF A', S / 2, S * 0.56, `900 #px ${IMPACT}`, 104, S * 0.5); fitText(g, 'DOWN', S / 2, S * 0.84, `900 #px ${IMPACT}`, 160, S * 0.86);
      g.fillStyle = '#d6232b'; g.fillRect(S * 0.08, S * 0.405, S * 0.2, S * 0.1); g.fillRect(S * 0.72, S * 0.405, S * 0.2, S * 0.1); } },
  { key: 'toxicity', label: 'TOXICITY', c: '#e4262c', c2: '#f1efe8', front(g, S) {
      g.textAlign = 'center'; g.fillStyle = '#f1efe8'; g.save(); g.letterSpacing = '6px'; fitText(g, BAND, S / 2, S * 0.24, `700 #px ${BLACKF}`, 40, S * 0.9); g.restore();
      g.fillStyle = '#e4262c'; g.save(); g.translate(S / 2, S * 0.62); g.scale(1, 1.55); fitText(g, 'TOXICITY', 0, 0, `900 #px ${IMPACT}`, 130, S * 0.94); g.restore();
      g.fillRect(S * 0.1, S * 0.8, S * 0.8, S * 0.025); } },
  { key: 'mezmerize', label: 'MEZMERIZE', c: '#e9b73c', c2: '#e9b73c', front(g, S) {
      g.textAlign = 'center'; g.strokeStyle = g.fillStyle = '#e9b73c';
      g.lineWidth = 5; g.beginPath(); g.moveTo(S * 0.1, S * 0.3); g.lineTo(S * 0.9, S * 0.3); g.moveTo(S * 0.1, S * 0.7); g.lineTo(S * 0.9, S * 0.7); g.stroke();
      fitText(g, 'MEZMERIZE', S / 2, S * 0.58, `italic 700 #px ${SERIF}`, 110, S * 0.9);
      g.fillStyle = '#f0e6c8'; fitText(g, BAND, S / 2, S * 0.82, `700 #px ${SERIF}`, 40, S * 0.8); fitText(g, '✦', S / 2, S * 0.22, `#px ${SERIF}`, 50, S); } },
  { key: 'hypnotize', label: 'HYPNOTIZE', c: '#3fd4e6', c2: '#3fd4e6', front(g, S) {
      g.textAlign = 'center'; g.strokeStyle = '#3fd4e6'; g.lineJoin = 'round';
      for (let i = 0; i < 3; i++) { g.globalAlpha = [0.35, 0.65, 1][i]; strokeFit(g, 'HYPNOTIZE', S / 2, S * (0.36 + i * 0.2), `900 #px ${BLACKF}`, 96, S * 0.94, i === 2 ? 9 : 6); }
      g.globalAlpha = 1; g.fillStyle = '#3fd4e6'; fitText(g, 'HYPNOTIZE', S / 2, S * 0.76, `900 #px ${BLACKF}`, 96, S * 0.94);
      g.fillStyle = '#e8f8fa'; fitText(g, BAND, S / 2, S * 0.92, `700 #px ${BLACKF}`, 34, S * 0.86); } },
  { key: 'soad', label: 'S·O·A·D', c: '#f4f2ec', c2: '#d6232b', front(g, S) {
      g.textAlign = 'center'; g.lineJoin = 'round';
      g.fillStyle = '#d6232b'; fitText(g, 'SOAD', S / 2 + 12, S * 0.66 + 12, `900 #px ${BLACKF}`, 200, S * 0.94);
      g.fillStyle = '#f4f2ec'; fitText(g, 'SOAD', S / 2, S * 0.66, `900 #px ${BLACKF}`, 200, S * 0.94);
      g.fillStyle = '#d6232b'; fitText(g, BAND, S / 2, S * 0.86, `700 #px ${BLACKF}`, 38, S * 0.9); } },
  { key: 'steal', label: 'STEAL THIS', c: '#f2f2ee', c2: '#f2f2ee', front(g, S) {
      g.textAlign = 'center'; g.fillStyle = '#f2f2ee'; g.save(); g.translate(S / 2, S / 2); g.rotate(-0.1);
      fitText(g, 'STEAL THIS', 0, -S * 0.08, `700 #px ${HAND}`, 104, S * 0.9); fitText(g, 'ALBUM!', 0, S * 0.18, `700 #px ${HAND}`, 130, S * 0.8);
      g.strokeStyle = '#f2f2ee'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(-S * 0.34, S * 0.25); g.bezierCurveTo(-S * 0.1, S * 0.3, S * 0.1, S * 0.22, S * 0.36, S * 0.27); g.stroke(); g.restore();
      g.fillStyle = '#9a9a96'; fitText(g, BAND, S / 2, S * 0.93, `700 #px ${BLACKF}`, 30, S * 0.8); } },
  { key: 'ring', label: 'SOAD RING', c: '#ff8a1e', c2: '#ff8a1e', front(g, S) {
      g.fillStyle = g.strokeStyle = '#ff8a1e'; g.lineWidth = 6; g.beginPath(); g.arc(S / 2, S / 2, S * 0.44, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(S / 2, S / 2, S * 0.3, 0, Math.PI * 2); g.stroke();
      const txt = (BAND + ' • ').repeat(2).split(''); g.font = `900 36px ${BLACKF}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      txt.forEach((ch, i) => { const a = (i / txt.length) * Math.PI * 2 - Math.PI / 2; g.save(); g.translate(S / 2 + Math.cos(a) * S * 0.37, S / 2 + Math.sin(a) * S * 0.37); g.rotate(a + Math.PI / 2); g.fillText(ch, 0, 0); g.restore(); });
      g.fillStyle = '#fbe6cf'; fitText(g, 'SOAD', S / 2, S / 2 + 4, `900 #px ${IMPACT}`, 120, S * 0.5); } },
  { key: 'tricolor', label: 'TRICOLOR', c: '#f2a800', c2: '#0f47b0', front(g, S) {
      const x0 = S * 0.08, w = S * 0.84, y0 = S * 0.2, h = S * 0.5;
      [['#d90012', 0], ['#1d48b8', 1], ['#f2a800', 2]].forEach(([c, i]) => { g.fillStyle = c; g.fillRect(x0, y0 + (h / 3) * i, w, h / 3 + 1); });
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.save(); g.globalCompositeOperation = 'destination-out'; fitText(g, 'SOAD', S / 2, y0 + h / 2 + 6, `900 #px ${IMPACT}`, 250, w * 0.86); g.restore();
      g.textBaseline = 'alphabetic'; g.fillStyle = '#f4f2ec'; fitText(g, BAND, S / 2, S * 0.86, `900 #px ${BLACKF}`, 40, S * 0.9); } },
  { key: 'tool', label: 'TOOL', c: '#c9c2b0', c2: '#8a7f66', front(g, S) {   // Redko's tee: plain lettering, no album art
      g.textAlign = 'center'; g.fillStyle = '#c9c2b0'; g.save(); g.translate(S / 2, S * 0.5); g.scale(1, 1.35); fitText(g, 'TOOL', 0, 0, `900 #px ${SERIF}`, 210, S * 0.86); g.restore();
      g.strokeStyle = '#8a7f66'; g.lineWidth = 4; g.strokeRect(S * 0.12, S * 0.2, S * 0.76, S * 0.6); } },
];
const SOAD_N = 8;   // the per-player rotation only uses the SOAD tees; the ones after are character shirts
function backPrint(g, S, v) {
  if (v.key === 'tool') { g.textAlign = 'center'; g.fillStyle = v.c; fitText(g, 'TOOL', S / 2, S * 0.5, `900 #px ${SERIF}`, 160, S * 0.8); return; }
  g.textAlign = 'center'; g.fillStyle = v.c;
  fitText(g, 'SYSTEM', S / 2, S * 0.3, `900 #px ${IMPACT}`, 132, S * 0.9); fitText(g, 'OF A DOWN', S / 2, S * 0.54, `900 #px ${IMPACT}`, 132, S * 0.94);
  g.fillStyle = v.c2 === v.c ? '#ecebe6' : v.c2; g.fillRect(S * 0.2, S * 0.62, S * 0.6, 8);
  fitText(g, v.key === 'classic' ? 'SOAD' : v.label.replace('·', ''), S / 2, S * 0.84, `900 #px ${BLACKF}`, 86, S * 0.86);
}
const printCache = new Map();
function printTex(i, back) {
  const k = i + (back ? 'b' : 'f'); if (printCache.has(k)) return printCache.get(k);
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const v = SHIRTS[i]; if (back) backPrint(g, S, v); else v.front(g, S); distress(g, S, 1400, i * 3 + (back ? 7 : 1));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; printCache.set(k, t); return t;
}

// ------------------------------------------------------------------------------------------------ shirt per player id
const hashId = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) % SOAD_N; };
/** tee variant for a net id: preferred = hash(id); clashes in the current room resolved in id order (same answer on every client) */
export function shirtOf(id, ctx) {
  if (!id) return 0;
  const ids = new Set([id]); const n = ctx?.net; if (n?.id) ids.add(n.id); try { for (const x of n?.list?.() || []) ids.add(x); } catch {}
  const used = new Set();
  for (const x of [...ids].sort()) { let v = hashId(x); while (used.has(v) && used.size < SOAD_N) v = (v + 1) % SOAD_N; used.add(v); if (x === id) return v; }
  return hashId(id);
}
const escH = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** small inline tee swatch + label (durak seats) */
export function shirtSwatchHTML(id, ctx) {
  const v = SHIRTS[shirtOf(id, ctx)];
  return `<span class="tee-sw" title="SOAD tee: ${escH(v.label)}" style="display:inline-flex;align-items:center;gap:4px;padding:1px 7px 1px 4px;border-radius:8px;background:#0b0b0d;border:1px solid ${v.c};color:${v.c};font:700 10px 'Barlow Condensed',Arial;letter-spacing:.06em;line-height:14px;vertical-align:middle;white-space:nowrap">`
    + `<svg width="15" height="13" viewBox="0 0 30 26" style="flex:none"><path d="M9 1 L1 6 L4 12 L8 10 L8 25 L22 25 L22 10 L26 12 L29 6 L21 1 Q15 5 9 1Z" fill="#18181b" stroke="${v.c}" stroke-width="2"/><rect x="11" y="11" width="8" height="3" fill="${v.c2}"/><rect x="11" y="16" width="8" height="2" fill="${v.c}"/></svg>${escH(v.label)}</span>`;
}

// ------------------------------------------------------------------------------------------------ UV-space bake
const REG = { torso: 0, upper: 1, fore: 2, hand: 3, thigh: 4, calf: 5, foot: 6, head: 7 };
function regionOf(name) {
  if (/UpperArm|UpArm/i.test(name)) return REG.upper; if (/Fore/i.test(name)) return REG.fore; if (/Hand|Finger/i.test(name)) return REG.hand;
  if (/Thigh/i.test(name)) return REG.thigh; if (/Calf/i.test(name)) return REG.calf; if (/Foot|Toe/i.test(name)) return REG.foot;
  if (/Head|Eye|Jaw|Lip|Brow|Cheek|Nose|Mouth|Tongue/i.test(name)) return REG.head; return REG.torso;
}
const sideOf = (name) => (/(^|[ _])L[ _]/.test(name) ? 'L' : /(^|[ _])R[ _]/.test(name) ? 'R' : '');
const prepCache = new Map();
/** bind-pose data for one avatar's body-material mesh: non-indexed UV-bake geometry + anatomy levels (character frame, metres) */
function prepAvatar(id) {
  if (prepCache.has(id)) return prepCache.get(id);
  const A = peopleDebug().av[id]; if (!A) return null;
  const root = A.root; root.updateMatrixWorld(true);
  let mesh = null; root.traverse((o) => { if (!mesh && o.isSkinnedMesh && /body/i.test(o.material?.name || '')) mesh = o; });
  if (!mesh) return null;
  const toChar = new THREE.Matrix4().makeTranslation(0, -A.footY, 0).multiply(new THREE.Matrix4().makeRotationY(-A.yawFix));
  const bones = mesh.skeleton.bones, bw = (b) => b.getWorldPosition(new THREE.Vector3()).applyMatrix4(toChar);
  const byName = (re) => bones.find((b) => re.test(b.name));
  const G = mesh.geometry, pos = G.attributes.position, uv = G.attributes.uv, sI = G.attributes.skinIndex, sW = G.attributes.skinWeight, N = pos.count;
  // skinned bind-pose positions in the character frame (+Z forward, feet at y=0) and smooth normals from them
  const P = new Float32Array(N * 3), v = new THREE.Vector3();
  for (let i = 0; i < N; i++) { v.fromBufferAttribute(pos, i); mesh.applyBoneTransform(i, v); v.applyMatrix4(mesh.matrixWorld).applyMatrix4(toChar); P.set([v.x, v.y, v.z], i * 3); }
  const tmp = new THREE.BufferGeometry(); tmp.setAttribute('position', new THREE.BufferAttribute(P, 3)); if (G.index) tmp.setIndex(G.index); tmp.computeVertexNormals();
  const Nn = tmp.attributes.normal.array;
  const vb = new Int16Array(N), vr = new Int8Array(N);
  for (let i = 0; i < N; i++) { let bi = 0, bwt = -1; for (let k = 0; k < 4; k++) { const w = sW.getComponent(i, k); if (w > bwt) { bwt = w; bi = sI.getComponent(i, k); } } vb[i] = bi; vr[i] = regionOf(bones[bi]?.name || ''); }
  // limb frames: axis start → end bone, lateral (outer side of a hanging limb) and its perpendicular
  const Z = new THREE.Vector3(0, 0, 1), frames = {};
  const pair = { [REG.upper]: ['UpperArm', 'Forearm'], [REG.fore]: ['Forearm', 'Hand'], [REG.thigh]: ['Thigh', 'Calf'], [REG.calf]: ['Calf', 'Foot'] };
  for (const s of ['L', 'R']) for (const [r, [a, b]] of Object.entries(pair)) {
    const Ba = byName(new RegExp(`(^|[ _])${s}[ _]${a}$`)), Bb = byName(new RegExp(`(^|[ _])${s}[ _]${b}$`)); if (!Ba || !Bb) continue;
    const pa = bw(Ba), pb = bw(Bb), ax = pb.clone().sub(pa), len = ax.length(); ax.normalize();
    const lat = new THREE.Vector3().crossVectors(Z, ax).normalize(); if (lat.dot(new THREE.Vector3(Math.sign(pa.x) || 1, 1, 0)) < 0) lat.negate();
    frames[s + r] = { pa, ax, len, lat, perp: new THREE.Vector3().crossVectors(ax, lat).normalize() };
  }
  const idx = G.index ? G.index.array : null, T = (idx ? idx.length : N) / 3;
  const gl = (mesh.geometry.groups?.length ? mesh.geometry.groups : [{ start: 0, count: idx ? idx.length : N }]);
  const oP = [], oN = [], oUV = [], oR = [], oL = [];
  const d = new THREE.Vector3();
  for (const grp of gl) for (let t = grp.start / 3; t < (grp.start + grp.count) / 3 && t < T; t++) {
    const vi = [0, 1, 2].map((k) => (idx ? idx[t * 3 + k] : t * 3 + k));
    const rs = vi.map((i) => vr[i]); const reg = rs[1] === rs[2] ? rs[1] : rs[0];
    const own = vi.find((i) => vr[i] === reg); const s = sideOf(bones[vb[own]]?.name || ''); const F = frames[s + reg];
    for (const i of vi) {
      oP.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); oN.push(Nn[i * 3], Nn[i * 3 + 1], Nn[i * 3 + 2]); oUV.push(uv.getX(i), uv.getY(i)); oR.push(reg);
      if (F) { d.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).sub(F.pa); const along = d.dot(F.ax); d.addScaledVector(F.ax, -along); oL.push(d.dot(F.lat), d.dot(F.perp), along / F.len); } else oL.push(0, 0, 0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(oP, 3)); geo.setAttribute('aN', new THREE.Float32BufferAttribute(oN, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(oUV, 2));
  geo.setAttribute('aR', new THREE.Float32BufferAttribute(oR, 1)); geo.setAttribute('aL', new THREE.Float32BufferAttribute(oL, 3));
  const y = (re) => { const b = byName(re); return b ? bw(b).y : 0; };
  const out = { geo, mesh, material: mesh.material, height: A.height, pelvis: y(/Pelvis$/), spine2: y(/Spine2$/), neck: y(/Neck$/), head: y(/Head$/) };
  prepCache.set(id, out); return out;
}

const VERT = /* glsl */`
attribute vec3 aN; attribute float aR; attribute vec3 aL;
varying vec2 vUv; varying vec3 vP; varying vec3 vN; varying float vR; varying vec3 vL;
void main() { vUv = uv; vP = position; vN = aN; vR = aR; vL = aL; gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0); }`;
const FRAG = /* glsl */`
uniform sampler2D uMap, uFront, uBack; uniform float uHasMap;
uniform int uTop, uBottom, uShoes;                 // top: 0 keep 1 tee 2 track jacket | bottom: 0 keep 1 jeans 2 track pants | shoes: 0 keep 1 white
uniform vec3 uSkin, uShirt, uJacket, uStripe, uDenim, uPants;
uniform float uHem, uNeck, uChestY, uBackY;
varying vec2 vUv; varying vec3 vP; varying vec3 vN; varying float vR; varying vec3 vL;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float stripes(vec3 L) {                             // three bands along the outer side of the limb
  if (L.x <= 0.0) return 0.0;
  float b = abs(L.y), w = 0.0065, c = 0.0205;
  float s = 1.0 - smoothstep(w - 0.0012, w + 0.0012, b);
  s = max(s, 1.0 - smoothstep(w - 0.0012, w + 0.0012, abs(b - c)));
  return s;
}
void main() {
  int r = int(vR + 0.5);
  vec4 o = uHasMap > 0.5 ? texture2D(uMap, vUv) : vec4(0.5);
  float lum = dot(o.rgb, vec3(0.3, 0.59, 0.11)), lumA = uHasMap > 0.5 ? dot(textureLod(uMap, vUv, 4.0).rgb, vec3(0.3, 0.59, 0.11)) : 0.5;
  float det = clamp(lum / (lumA + 0.015), 0.55, 1.45);          // folds from the original clothes, colour removed
  float n1 = vn(vUv * 900.0), n2 = vn(vUv * 260.0 + 7.0);
  vec3 col = o.rgb;
  bool lower = r == 4 || r == 5 || (r == 0 && vP.y < uHem);
  bool upperBody = (r == 0 && vP.y >= uHem) || r == 1 || r == 2;
  if (upperBody && uTop == 1) {
    bool bare = r == 2 || (r == 1 && vL.z > 0.42);
    if (bare) col = uSkin * (0.93 + 0.1 * n2) * mix(1.0, det, 0.15);
    else {
      col = uShirt * (0.85 + 0.3 * n1) * mix(1.0, det, 0.6);
      if (r == 1 && vL.z > 0.37) col *= 1.35;                                           // sleeve hem rib
      if (r == 0 && vP.y > uNeck - 0.03 && vN.z > -0.2) col *= 1.3;                    // collar rib
      // prints: front across the chest, back between the shoulder blades (mirrored so it reads from behind)
      float fz = smoothstep(0.25, 0.5, vN.z), bz = smoothstep(0.25, 0.5, -vN.z);
      vec2 fu = vec2(vP.x / 0.27 + 0.5, (vP.y - uChestY) / 0.27 + 0.5), bu = vec2(0.5 - vP.x / 0.31, (vP.y - uBackY) / 0.31 + 0.5);
      if (fz > 0.0 && all(greaterThan(fu, vec2(0.0))) && all(lessThan(fu, vec2(1.0)))) { vec4 p = texture2D(uFront, fu); col = mix(col, p.rgb * (0.82 + 0.18 * n2) * mix(1.0, det, 0.45), p.a * fz); }
      if (bz > 0.0 && all(greaterThan(bu, vec2(0.0))) && all(lessThan(bu, vec2(1.0)))) { vec4 p = texture2D(uBack, bu); col = mix(col, p.rgb * (0.82 + 0.18 * n2) * mix(1.0, det, 0.45), p.a * bz); }
    }
  } else if (upperBody && uTop == 2) {
    col = uJacket * (0.9 + 0.2 * n1) * mix(1.0, det, 0.7);
    if (r == 1 || r == 2) col = mix(col, uStripe * mix(1.0, det, 0.3), stripes(vL));
    if (r == 2 && vL.z > 0.9) col *= 1.25;                                               // cuff rib
    if (r == 0) {
      if (vN.z > 0.4 && abs(vP.x) < 0.0045) col = vec3(0.32) * (0.8 + 0.4 * n1);         // zip
      if (vP.y < uHem + 0.05) col *= 1.2;                                                 // waistband rib
      if (vP.y > uNeck - 0.035) col = mix(col, uStripe, 0.08);                             // collar
      vec2 m = (vP.xy - vec2(0.085, uChestY + 0.055)) / vec2(0.02, 0.013);                // small plain chest tab (no logo)
      if (vN.z > 0.3 && abs(m.x) < 1.0 && abs(m.y) < 1.0) col = uStripe * 0.95;
    }
  }
  if (lower && uBottom == 1) {
    float tw = 0.5 + 0.5 * sin((vUv.x + vUv.y) * 2600.0 + n1 * 3.0);                       // twill
    col = uDenim * (0.78 + 0.22 * tw) * (0.85 + 0.3 * n2) * mix(1.0, det, 0.75);
    if ((r == 4 || r == 5) && vN.z > 0.2) col *= 1.0 + 0.22 * smoothstep(0.2, 0.9, vN.z) * (r == 4 ? 1.0 : 0.6);    // worn fronts
    if ((r == 4 || r == 5) && vL.x > 0.0 && abs(vL.y) < 0.0022) col = vec3(0.55, 0.4, 0.2);                       // outseam stitch
    if (r == 0 && vP.y > uHem - 0.045) col *= 0.8;                                                                 // waistband
  } else if (lower && uBottom == 2) {
    col = uPants * (0.9 + 0.2 * n1) * mix(1.0, det, 0.7);
    if (r == 4 || r == 5) col = mix(col, uStripe * mix(1.0, det, 0.3), stripes(vL));
  }
  if (r == 6 && uShoes == 1) {
    col = vec3(0.86, 0.86, 0.84) * clamp(pow(det, 1.2), 0.6, 1.2);
    if (vP.y < 0.028) col = vec3(0.62, 0.6, 0.56);                                        // sole
  }
  gl_FragColor = vec4(col, 1.0);
}`;
const DILATE = /* glsl */`
uniform sampler2D uSrc; uniform vec2 uPx; varying vec2 vUv;
void main() {
  vec4 c = texture2D(uSrc, vUv); if (c.a > 0.5) { gl_FragColor = c; return; }
  vec4 acc = vec4(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec4 s = texture2D(uSrc, vUv + vec2(float(x), float(y)) * uPx); if (s.a > 0.5) acc += vec4(s.rgb, 1.0); }
  gl_FragColor = acc.a > 0.0 ? vec4(acc.rgb / acc.a, 1.0) : vec4(0.0);
}`;
const lin = (hex) => new THREE.Color(hex);
let BK = null;
function bakeKit() {
  if (BK) return BK;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const paint = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, depthTest: false, depthWrite: false,
    uniforms: { uMap: { value: null }, uHasMap: { value: 1 }, uFront: { value: null }, uBack: { value: null }, uTop: { value: 0 }, uBottom: { value: 0 }, uShoes: { value: 0 },
      uSkin: { value: lin(SKIN_FAIR) }, uShirt: { value: lin(0x141416) }, uJacket: { value: lin(0x121316) }, uStripe: { value: lin(0xf2f2ee) }, uDenim: { value: lin(0x3f5f8e) }, uPants: { value: lin(0x121316) },
      uHem: { value: 1 }, uNeck: { value: 1.5 }, uChestY: { value: 1.3 }, uBackY: { value: 1.3 } } });
  const dil = new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: DILATE, depthTest: false, depthWrite: false, uniforms: { uSrc: { value: null }, uPx: { value: new THREE.Vector2() } } });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), dil); quad.frustumCulled = false;
  BK = { cam, paint, dil, quad, sceneQ: new THREE.Scene().add(quad) }; return BK;
}
const bakeCache = new Map();
/** outfit: { top: 'keep'|'tee'|'track', shirt: 0..7, bottom: 'keep'|'jeans'|'track', shoes: 'keep'|'white', skin, jacket, pants, stripe, denim } */
function outfitKey(o) { return [o.top, o.shirt | 0, o.bottom, o.shoes, o.skin, o.jacket, o.pants, o.stripe, o.denim].join('/'); }
function bakedMaterial(ctx, id, o) {
  const key = id + '|' + outfitKey(o); if (bakeCache.has(key)) return bakeCache.get(key);
  const pr = prepAvatar(id); const R = ctx?.renderer; if (!pr || !R) return null;
  const K = bakeKit(), S = ctx.lite ? 512 : 1024, u = K.paint.uniforms;
  const src = pr.material.map;
  u.uMap.value = src; u.uHasMap.value = src ? 1 : 0;
  u.uTop.value = { tee: 1, track: 2 }[o.top] || 0; u.uBottom.value = { jeans: 1, track: 2 }[o.bottom] || 0; u.uShoes.value = o.shoes === 'white' ? 1 : 0;
  u.uSkin.value.set(o.skin ?? SKIN_FAIR); u.uJacket.value.set(o.jacket ?? 0x121316); u.uPants.value.set(o.pants ?? o.jacket ?? 0x121316); u.uStripe.value.set(o.stripe ?? 0xf2f2ee); u.uDenim.value.set(o.denim ?? 0x3f5f8e);
  if (o.top === 'tee') { u.uFront.value = printTex(o.shirt | 0, false); u.uBack.value = printTex(o.shirt | 0, true); } else { u.uFront.value = u.uBack.value = printTex(0, false); }
  u.uHem.value = pr.pelvis + 0.035; u.uNeck.value = pr.neck; u.uChestY.value = pr.neck - 0.215; u.uBackY.value = pr.neck - 0.2;
  const mk = (filter) => { const t = new THREE.WebGLRenderTarget(S, S, { depthBuffer: false, minFilter: filter, magFilter: filter === THREE.NearestFilter ? THREE.NearestFilter : THREE.LinearFilter, generateMipmaps: false }); t.texture.colorSpace = THREE.SRGBColorSpace; return t; };
  const a = mk(THREE.NearestFilter), b = mk(THREE.NearestFilter);
  const out = new THREE.WebGLRenderTarget(S, S, { depthBuffer: false, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true });
  out.texture.colorSpace = THREE.SRGBColorSpace; out.texture.anisotropy = ctx.lite ? 2 : 8; out.texture.flipY = false;
  const prevRT = R.getRenderTarget(), prevAuto = R.autoClear, cc = R.getClearColor(new THREE.Color()), ca = R.getClearAlpha();
  const sc = new THREE.Scene(), m = new THREE.Mesh(pr.geo, K.paint); m.frustumCulled = false; sc.add(m);
  try {
    R.autoClear = true; R.setClearColor(0x000000, 0);
    R.setRenderTarget(a); R.clear(); R.render(sc, K.cam);
    K.dil.uniforms.uPx.value.set(1 / S, 1 / S);
    let s = a, d = b; const PASSES = 12;
    for (let i = 0; i < PASSES; i++) { const dst = i === PASSES - 1 ? out : d; K.dil.uniforms.uSrc.value = s.texture; R.setRenderTarget(dst); R.clear(); R.render(K.sceneQ, K.cam); if (dst !== out) { d = s; s = dst; } }
  } finally { R.setRenderTarget(prevRT); R.autoClear = prevAuto; R.setClearColor(cc, ca); }
  a.dispose(); b.dispose();
  const mat = pr.material.clone(); mat.map = out.texture; mat.name = pr.material.name + '_' + (o.top || 'keep');
  if (mat.normalScale) mat.normalScale = mat.normalScale.clone().multiplyScalar(o.top === 'track' ? 0.5 : 0.7);
  mat.roughness = o.top === 'track' ? 0.62 : 0.85; mat.needsUpdate = true;
  bakeCache.set(key, mat); return mat;
}

// ------------------------------------------------------------------------------------------------ figure helpers
function bodyMesh(fig) { let m = null; fig.group.traverse((o) => { if (!m && o.isSkinnedMesh && /body/i.test(o.material?.name || '')) m = o; }); return m; }
/** retexture a buildPerson() figure; returns true when dressed */
export function dressFigure(fig, ctx, outfit) {
  if (!fig?.avatar) return false;
  try { const mat = bakedMaterial(ctx, fig.avatar, outfit); const m = bodyMesh(fig); if (!mat || !m) return false; m.material = mat; fig.outfit = outfit; return true; }
  catch (e) { console.warn('[outfits] dress', e); return false; }
}
/** scale the figure to a real standing height; heights are measured from the avatar's bind pose (top of head → soles) */
export function standTall(fig, metres) {
  const A = peopleDebug().av[fig?.avatar]; if (!A) return 1;
  const k = metres / A.height; fig.group.scale.setScalar(k); fig.heightScale = k; return k;
}
export const avatarHeight = (id) => peopleDebug().av[id]?.height ?? null;

// ---- afro: lumpy squashed sphere that clears the face, dark brown-black, fine curl texture + a fuzzy alpha shell for the silhouette
let AFRO = null;
function vnoise3(x, y, z) {
  const h = (i, j, k) => { let n = i * 374761393 + j * 668265263 + k * 1442695041; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi, s = (t) => t * t * (3 - 2 * t), u = s(xf), v = s(yf), w = s(zf);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(h(xi, yi, zi), h(xi + 1, yi, zi), u), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v), L(L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
}
function curlCanvas(S, alpha) {
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  let s = alpha ? 77 : 31; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = alpha ? '#000' : '#6a6a6a'; g.fillRect(0, 0, S, S);
  const n = alpha ? 2600 : 5200;
  for (let i = 0; i < n; i++) {   // tight coils: short arcs, light and dark, tiled seamlessly (drawn at 9 offsets)
    const x = r() * S, y = r() * S, rad = 1.2 + r() * 3.2, a0 = r() * Math.PI * 2, v = alpha ? 255 : Math.floor(40 + r() * 170);
    g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 0.6 + r() * 1.1; g.globalAlpha = alpha ? 0.9 : 0.55;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.beginPath(); g.arc(x + ox, y + oy, rad, a0, a0 + Math.PI * (1 + r())); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 3); return t;
}
function afroKit() {
  if (AFRO) return AFRO;
  const geo = new THREE.SphereGeometry(1, 48, 32), p = geo.attributes.position, v = new THREE.Vector3();
  const C = new THREE.Vector3(0, 0.045, -0.03), RX = 0.168, RY = 0.148, RZ = 0.163;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const lump = 1 + (vnoise3(v.x * 3.2 + 5, v.y * 3.2, v.z * 3.2) - 0.5) * 0.13 + (vnoise3(v.x * 9, v.y * 9 + 3, v.z * 9) - 0.5) * 0.05;
    let x = C.x + v.x * RX * lump, y = C.y + v.y * RY * lump, z = C.z + v.z * RZ * lump;
    // clear the face: inside the face oval the hair sits back behind the skin; hairline ~3 cm above the brows
    const fx = Math.abs(x), face = (1 - THREE.MathUtils.smoothstep(fx, 0.068, 0.1)) * (1 - THREE.MathUtils.smoothstep(y, 0.02, 0.06));
    if (z > 0) z = THREE.MathUtils.lerp(z, Math.min(z, -0.005), face);
    // above the forehead the front edge curls back a little (so the hairline isn't a visor)
    if (z > 0.06 && y < 0.1 && fx < 0.1) z = THREE.MathUtils.lerp(z, 0.06 + (z - 0.06) * 0.4, 1 - THREE.MathUtils.smoothstep(y, 0.03, 0.1));
    y = Math.max(y, -0.075 + Math.max(0, z) * 0.35);   // flat-ish underside at the nape / ear lobes
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  const map = curlCanvas(256, false), alphaMap = curlCanvas(256, true);
  const mat = new THREE.MeshStandardMaterial({ color: 0x1c1410, roughness: 0.95, metalness: 0, map, bumpMap: map, bumpScale: 1.4, envMapIntensity: 0.25 });
  const fuzz = new THREE.MeshStandardMaterial({ color: 0x1a120e, roughness: 1, metalness: 0, alphaMap, alphaTest: 0.5, map, envMapIntensity: 0.2 });
  AFRO = { geo, mat, fuzz }; return AFRO;
}
export function addAfro(fig, { scale = 1 } = {}) {
  if (!fig?.head) return null;
  const K = afroKit(), g = new THREE.Group(); g.name = 'afro';
  // the head anchor lives under a Rocketbox bone whose world scale is 0.01 (cm rig): undo it so the afro is in metres
  fig.group.updateWorldMatrix(true, true); const hs = fig.head.getWorldScale(new THREE.Vector3()).x / (fig.group.getWorldScale(new THREE.Vector3()).x || 1);
  g.scale.setScalar(scale / (hs || 1));
  const core = new THREE.Mesh(K.geo, K.mat); core.castShadow = true; core.receiveShadow = true;
  const shell = new THREE.Mesh(K.geo, K.fuzz); shell.scale.setScalar(1.045); shell.castShadow = false; shell.receiveShadow = true;
  g.add(core, shell); fig.head.add(g); return g;
}

// ------------------------------------------------------------------------------------------------ remote players (net.js)
const REMOTES = new Set();
let sigAt = 0, sig = '';
/** playable looks (chill-mode picker; everyone online sees your pick) — the table crew plus REDKO, the default hero */
export const CHARS = {
  redko: { name: 'REDKO', avatar: 'm02', h: 1.83, wide: 1.07, outfit: { top: 'tee', shirt: 8, bottom: 'jeans', skin: 0xe7bda0 } },
  arkasha: { name: 'ARKASHA', avatar: 'm02', h: 1.80, glasses: 'clear', glassesY: 0.035 },
  mcguinness: { name: 'McGUINNESS', avatar: 'm12', h: 1.73, wx: 1.22, wz: 1.18, afro: true, outfit: { top: 'tee', shirt: 3, bottom: 'jeans', skin: 0x5a3a26 } },
  feliks: { name: 'FELIKS', avatar: 'm20', h: 1.83, hair: 0x2b1d14, outfit: { top: 'tee', shirt: 6, bottom: 'jeans' } },
  elf: { name: 'THE ELF', avatar: 'm08', h: 1.70, knife: true, outfit: { top: 'track', bottom: 'track', shoes: 'white' } },
  sasha: { name: 'SASHA', avatar: 'm01', h: 1.78 },
};
export function buildChar(id, ctx) {
  const C = CHARS[id] || CHARS.redko; const fig = buildPerson({ avatar: C.avatar, seed: 11, glasses: C.glasses, glassesY: C.glassesY }); if (!fig) return null;
  standTall(fig, C.h); if (C.wide) { fig.group.scale.x *= C.wide; fig.group.scale.z *= C.wide; } if (C.wx) { fig.group.scale.x *= C.wx; fig.group.scale.z *= C.wz; }
  if (C.afro) addAfro(fig); if (C.hair) addLongHair(fig, { color: C.hair }); if (C.knife) addKnife(fig); if (C.outfit) dressFigure(fig, ctx, C.outfit);
  return fig;
}
const LOOKS = new Map();   // peer id -> character id (net 'look')
export const looks = () => LOOKS;
/** the figure wrapper of a remote player (jet pack etc. hang off it) */
export function remoteWrap(pid) { for (const H of REMOTES) if (H.pid === pid) return H.wrap; return null; }
export function setRemoteChar(pid, id, ctx) {
  if (!CHARS[id] || LOOKS.get(pid) === id) return; LOOKS.set(pid, id);
  for (const H of REMOTES) if (H.pid === pid && H.wrap) { const fig = buildChar(id, ctx); if (!fig) return; H.wrap.remove(H.fig.group); H.fig = fig; H.wrap.add(fig.group); fig.group.traverse((o) => { if (o.isMesh) o.castShadow = !ctx.lite; }); }
}
function heroOutfit(pid, ctx) { return { top: 'tee', shirt: shirtOf(pid, ctx), bottom: 'jeans', shoes: 'keep', skin: SKIN_FAIR }; }
/** swap the soldier look of a remote player for the hero (jeans + his own SOAD-style tee). Hitboxes / muzzle stay on the soldier rig. */
export function dressRemote(inst, pid, ctx) {
  if (!inst || inst.hero) return;
  if (!peopleReady()) { const pd = peopleDebug(); (pd.loading || loadPeople(ctx)).then(() => { if (peopleReady()) dressRemote(inst, pid, ctx); }).catch(() => {}); return; }
  const fig = buildChar(LOOKS.get(pid) || 'redko', ctx); if (!fig) return;
  const hideMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  inst.model?.traverse((o) => { if (o.isMesh && !/^hit_/.test(o.name)) { o.visible = false; o.castShadow = false; } });
  for (const m of inst.props || []) { if (m.name === 'rifle') { m.material = hideMat; m.castShadow = false; } else m.visible = false; }
  const wrap = new THREE.Group(); wrap.name = 'hero'; wrap.rotation.y = -(inst.inner?.rotation.y || 0); (inst.inner || inst.group).add(wrap); wrap.add(fig.group);
  fig.group.traverse((o) => { if (o.isMesh) o.castShadow = !ctx.lite; });
  const H = { fig, pid, wrap, shirt: shirtOf(pid, ctx), last: new THREE.Vector3(), sp: 0, first: true };
  inst.hero = H; REMOTES.add(H);
  const mix = inst.mixer, mu = mix ? mix.update.bind(mix) : null, wp = new THREE.Vector3();
  const tick = (dt) => {
    inst.group.getWorldPosition(wp);
    if (dt > 0) { const d = H.first ? 0 : Math.hypot(wp.x - H.last.x, wp.z - H.last.z) / dt; H.first = false; H.sp += (Math.min(d, 9) - H.sp) * Math.min(1, dt * 6); }
    H.last.copy(wp); H.fig.update(dt, H.fig.mood === 'sit' || H.sp < 0.25 ? 0 : H.sp);   // seated in a car: no running legs
    const now = performance.now(); if (now - sigAt > 500) { sigAt = now; refreshShirts(ctx); }
  };
  if (mix) mix.update = (dt) => { const r = mu(dt); tick(dt); return r; };
  else ctx.world?.updaters?.push?.(tick);
}
function refreshShirts(ctx) {
  const n = ctx.net; const s = [n?.id, ...(n?.list?.() || [])].sort().join(','); if (s === sig) return; sig = s;
  for (const H of REMOTES) { if (!H.fig.group.parent) { REMOTES.delete(H); continue; } }   // looks come from the character pick now (net 'look')
}
/** QA: what each remote peer wears */
export const outfitsQA = { remotes: () => [...REMOTES].map((H) => ({ pid: H.pid, a: H.fig.avatar, shirt: H.shirt, label: SHIRTS[H.shirt].label, h: +(avatarHeight(HERO.avatar) * (H.fig.heightScale || 1)).toFixed(3) })) };

// ------------------------------------------------------------------------------------------------ first-person forearms
/** the viewmodel sleeve material becomes bare fair forearm skin (short-sleeve tee: the sleeve ends above the elbow, off-screen) */
export function dressViewmodelArms(mats) {
  const m = mats?.sleeve; if (!m) return;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = vnoise3(x / 14, y / 14, 1.7) * 0.6 + vnoise3(x / 4, y / 4, 4.2) * 0.4, i = (y * S + x) * 4;
    const k = 0.92 + n * 0.12; d[i] = Math.min(255, 231 * k); d[i + 1] = Math.min(255, 189 * k * (0.99 + 0.02 * n)); d[i + 2] = Math.min(255, 160 * k); d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  let s = 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.strokeStyle = 'rgba(92,62,44,0.22)'; g.lineWidth = 0.7;   // fine forearm hair
  for (let i = 0; i < 900; i++) { const x = r() * S, y = r() * S, a = -0.2 + r() * 0.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(a) * 5, y + Math.cos(a) * 5); g.stroke(); }
  g.fillStyle = 'rgba(170,110,80,0.18)'; for (let i = 0; i < 90; i++) { g.beginPath(); g.arc(r() * S, r() * S, 0.8 + r() * 1.4, 0, Math.PI * 2); g.fill(); }   // freckles
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.2, 1.2);
  m.map = t; m.color?.set(0xffffff); m.bumpMap = null; m.normalScale?.set(0.15, 0.15); m.roughness = 0.6; m.envMapIntensity = 0.25; m.needsUpdate = true;
}

/** long rocker hair: a cap over the crown and a curtain down the back to the shoulder blades (dark brown) */
export function addLongHair(fig, { color = 0x2b1d14 } = {}) {
  if (!fig?.head) return null;
  fig.group.updateWorldMatrix(true, true); const hs = fig.head.getWorldScale(new THREE.Vector3()).x / (fig.group.getWorldScale(new THREE.Vector3()).x || 1);
  const g = new THREE.Group(); g.name = 'longhair'; g.scale.setScalar(1 / (hs || 1));
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.118, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.4), m); cap.scale.set(1, 1.02, 1.08); cap.position.set(0, 0.012, -0.012);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.122, 0.17, 0.46, 18, 1, true, Math.PI * 0.62, Math.PI * 0.76), m); back.position.set(0, -0.2, -0.018);
  for (const s of [-1, 1]) { const side = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.1), m); side.position.set(s * 0.112, -0.13, -0.035); side.rotation.z = s * 0.08; g.add(side); }
  for (const o of [cap, back]) { o.castShadow = true; g.add(o); }
  fig.head.add(g); return g;
}

/** a long knife in the right hand (THE ELF never puts it down) */
export function addKnife(fig, { len = 0.34 } = {}) {
  if (!fig?.handR) return null;
  fig.group.updateWorldMatrix(true, true); const hs = fig.handR.getWorldScale(new THREE.Vector3()).x / (fig.group.getWorldScale(new THREE.Vector3()).x || 1);
  const g = new THREE.Group(); g.name = 'knife'; g.scale.setScalar(1 / (hs || 1));
  const steel = new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 1, roughness: 0.22 }), grip = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.7 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.017, 0.12, 10), grip); handle.position.y = -0.02;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.022), steel); guard.position.y = 0.045;
  const bladeG = new THREE.BoxGeometry(0.034, len, 0.004); bladeG.translate(0, len / 2 + 0.05, 0); { const P = bladeG.attributes.position; for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y > len * 0.8 + 0.05) P.setX(i, P.getX(i) * (1 - (y - len * 0.8 - 0.05) / (len * 0.2)) + 0.008); } bladeG.computeVertexNormals(); }
  const blade = new THREE.Mesh(bladeG, steel);
  for (const o of [handle, guard, blade]) { o.castShadow = true; g.add(o); }
  g.rotation.set(Math.PI / 2, 0, 0); fig.handR.add(g); return g;
}
