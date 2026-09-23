// Soldier asset: loads Soldier.glb (Mixamo rig), upgrades materials toward a tactical look, builds procedural
// gear (helmet w/ NVG mount + headset, plate carrier + pouches, knee pads, rifle) and hitboxes, and creates
// skinned instances via SkeletonUtils.clone. Owned by: AI agent.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';

const BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'HeadTop_End',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHandMiddle1', 'LeftHandThumb1', 'LeftHandThumb2',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'RightHandMiddle1', 'RightHandThumb1', 'RightHandThumb2',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];

export const RIFLE = {
  yaw: THREE.MathUtils.degToRad(20),        // rifle angled across the body (stock in right shoulder, bladed stance)
  gripR: new THREE.Vector3(0.0, -0.075, -0.06),   // right hand (pistol grip), rifle-local
  gripL: new THREE.Vector3(-0.01, -0.035, 0.24),  // left hand (handguard), rifle-local
  muzzle: new THREE.Vector3(0, 0.0, 0.56),
  // hand orientation, rifle-local: fingers direction + palm normal (character right is -X in rifle/inner space)
  fingersR: new THREE.Vector3(0.35, -0.55, 0.75), palmR: new THREE.Vector3(1, 0.15, -0.2),
  fingersL: new THREE.Vector3(-0.7, 0.15, 0.7), palmL: new THREE.Vector3(-0.35, 0.9, 0.1),
  poleR: new THREE.Vector3(-0.45, -1, -0.35), poleL: new THREE.Vector3(0.8, -1, 0.2),
};

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

function findBone(root, suffix) {
  let hit = null;
  root.traverse(o => { if (!hit && (o.isBone || o.isObject3D) && (o.name === 'mixamorig' + suffix || o.name.endsWith(':' + suffix) || o.name === suffix)) hit = o; });
  return hit;
}
export function collectBones(root) {
  const b = {};
  for (const n of BONES) b[n] = findBone(root, n);
  return b;
}

// -------- procedural textures --------
function hash2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function makeBodyTexture(src, tint, seedOff, { camo = true, size = 0 } = {}) {
  const img = src.image; const w = size || img.width || 1024, h = size || img.height || 1024;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d', { willReadFrequently: true });
  try { g.drawImage(img, 0, 0, w, h); } catch (e) { g.fillStyle = '#5a5e4c'; g.fillRect(0, 0, w, h); }
  const id = g.getImageData(0, 0, w, h), d = id.data;
  const [tr, tg, tb] = tint; const camoOn = camo;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; let r = d[i], gg = d[i + 1], b = d[i + 2];
      const lum = 0.3 * r + 0.59 * gg + 0.11 * b;
      const isRed = r > gg * 1.7 && r > b * 1.7 && r > 90;
      // desaturate heavily, remove red unit markings
      let f = 0.8; r = r + (lum - r) * f; gg = gg + (lum - gg) * f; b = b + (lum - b) * f;
      if (isRed) { r = gg = b = lum * 0.4; }
      // camo blotches on bright armour plates, grime everywhere
      const nx = (x + seedOff) / 38, ny = (y + seedOff * 0.7) / 38;
      const n1 = vnoise(nx, ny), n2 = vnoise(nx * 2.3 + 7.1, ny * 2.3 + 3.3), n3 = vnoise(x / 9 + 11, y / 9 + 5);
      const blot = n1 * 0.65 + n2 * 0.35;
      let camo = 1;
      if (camoOn && lum > 105) camo = blot > 0.58 ? 0.62 : blot > 0.47 ? 0.85 : 1.08;
      const grime = 0.78 + 0.3 * vnoise(x / 120 + seedOff, y / 120) + 0.08 * (n3 - 0.5);
      const k = camo * grime;
      d[i] = Math.min(255, r * tr * k); d[i + 1] = Math.min(255, gg * tg * k); d[i + 2] = Math.min(255, b * tb * k);
    }
  }
  g.putImageData(id, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = src.flipY; tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = src.wrapS; tex.wrapT = src.wrapT; tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function makeRoughTexture(w = 256) {
  const cv = document.createElement('canvas'); cv.width = cv.height = w; const g = cv.getContext('2d');
  const id = g.createImageData(w, w), d = id.data;
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; const n = 0.72 + 0.25 * vnoise(x / 23, y / 23) + 0.08 * vnoise(x / 4, y / 4); const v = Math.min(255, n * 255); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  g.putImageData(id, 0, 0); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); return t;
}

export function makeFlashTexture() {
  const s = 128, cv = document.createElement('canvas'); cv.width = cv.height = s; const g = cv.getContext('2d');
  g.clearRect(0, 0, s, s);
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,250,230,1)'); grd.addColorStop(0.18, 'rgba(255,215,120,0.95)'); grd.addColorStop(0.45, 'rgba(255,140,40,0.45)'); grd.addColorStop(1, 'rgba(255,90,10,0)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3, len = s * (0.3 + 0.2 * ((i * 7) % 3) / 2);
    g.strokeStyle = 'rgba(255,200,110,0.8)'; g.lineWidth = 3 + (i % 2) * 2; g.beginPath(); g.moveTo(s / 2, s / 2); g.lineTo(s / 2 + Math.cos(a) * len, s / 2 + Math.sin(a) * len); g.stroke();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function makeBloodTexture(rng = Math.random) {
  const s = 256, cv = document.createElement('canvas'); cv.width = cv.height = s; const g = cv.getContext('2d');
  g.clearRect(0, 0, s, s);
  const blob = (x, y, r, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(105,8,10,${a})`); gr.addColorStop(0.7, `rgba(80,5,7,${a * 0.85})`); gr.addColorStop(1, 'rgba(60,3,5,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  blob(s / 2, s / 2, s * 0.34, 0.95);
  for (let i = 0; i < 26; i++) { const a = rng() * Math.PI * 2, d = s * (0.18 + rng() * 0.3); blob(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, s * (0.03 + rng() * 0.09), 0.8); }
  for (let i = 0; i < 40; i++) { const a = rng() * Math.PI * 2, d = s * (0.3 + rng() * 0.2); blob(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, s * (0.008 + rng() * 0.02), 0.9); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// -------- procedural gear geometry (all in metres, character faces +Z, right side is -X) --------
function box(w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { const g = new THREE.BoxGeometry(w, h, d); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; }
function cyl(r, len, x, y, z, axis = 'z', seg = 10, r2) { const g = new THREE.CylinderGeometry(r2 ?? r, r, len, seg); if (axis === 'z') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateZ(Math.PI / 2); g.translate(x, y, z); return g; }

export function buildRifleGeometry() {
  const parts = [
    box(0.036, 0.07, 0.26, 0, 0, 0),                 // receiver
    box(0.03, 0.028, 0.16, 0, 0.052, 0.0),           // top rail
    cyl(0.017, 0.1, 0, 0.085, 0.02, 'z', 12),        // optic tube
    box(0.028, 0.03, 0.04, 0, 0.078, 0.07),          // optic mount front
    box(0.042, 0.052, 0.24, 0, 0.0, 0.26),           // handguard
    cyl(0.009, 0.19, 0, 0.0, 0.47, 'z', 8),          // barrel
    cyl(0.014, 0.05, 0, 0.0, 0.54, 'z', 8),          // muzzle device
    box(0.012, 0.035, 0.02, 0, 0.05, 0.36),          // front sight post
    box(0.03, 0.17, 0.062, 0, -0.115, 0.03, 0.12),   // magazine
    box(0.03, 0.1, 0.04, 0, -0.085, -0.075, -0.3),   // pistol grip
    box(0.03, 0.02, 0.06, 0, -0.045, -0.02),         // trigger guard
    box(0.03, 0.045, 0.2, 0, -0.005, -0.23),         // buffer tube / stock
    box(0.04, 0.11, 0.035, 0, -0.03, -0.335),        // butt plate
    box(0.02, 0.02, 0.08, -0.028, 0.01, 0.28),       // side rail / light
    cyl(0.012, 0.06, -0.03, 0.005, 0.36, 'z', 8),    // flashlight
  ];
  const g = BGU.mergeGeometries(parts, false); parts.forEach(p => p.dispose()); return g;
}

function buildHelmetGeometry(r) {
  const parts = [];
  const dome = new THREE.SphereGeometry(r, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62); dome.scale(1, 0.92, 1.12); parts.push(dome);
  const brim = new THREE.CylinderGeometry(r * 1.02, r * 1.05, 0.02, 18, 1, true); brim.scale(1, 1, 1.12); brim.translate(0, -r * 0.3, 0); parts.push(brim);
  parts.push(box(0.03, 0.04, 0.025, 0, r * 0.62, r * 1.02));                 // NVG shroud
  parts.push(box(0.022, 0.07, 0.03, 0, r * 0.9, r * 1.06, -0.55));            // NVG arm (folded up)
  parts.push(cyl(0.017, 0.06, -0.02, r * 1.02, r * 0.92, 'z', 8));            // NVG tube L
  parts.push(cyl(0.017, 0.06, 0.02, r * 1.02, r * 0.92, 'z', 8));             // NVG tube R
  parts.push(cyl(0.038, 0.025, r * 1.05, -r * 0.35, 0.01, 'x', 12));          // headset cup L (+X side)
  parts.push(cyl(0.038, 0.025, -r * 1.05, -r * 0.35, 0.01, 'x', 12));         // headset cup R
  parts.push(box(0.012, 0.012, 0.09, r * 1.02, -r * 0.45, 0.05));             // boom mic
  parts.push(box(0.03, 0.02, 0.05, r * 0.7, r * 0.55, -r * 0.4, 0, 0.5));     // rail/strobe
  const g = BGU.mergeGeometries(parts, false); parts.forEach(p => p.dispose()); return g;
}

function buildVestGeometry(w, depth) {
  const hw = w / 2, fz = depth / 2, parts = [];
  parts.push(box(w * 0.92, 0.3, 0.045, 0, 0, fz + 0.01));                  // front plate
  parts.push(box(w * 0.9, 0.3, 0.04, 0, 0.01, -fz - 0.005));               // back plate
  parts.push(box(0.06, 0.26, depth + 0.04, hw - 0.01, -0.02, 0));          // side cummerbund L
  parts.push(box(0.06, 0.26, depth + 0.04, -hw + 0.01, -0.02, 0));         // cummerbund R
  for (let i = -1; i <= 1; i++) parts.push(box(0.07, 0.13, 0.055, i * 0.085, -0.075, fz + 0.055));  // mag pouches
  parts.push(box(0.09, 0.07, 0.04, 0.0, 0.085, fz + 0.045));               // admin pouch
  parts.push(box(0.07, 0.09, 0.05, hw + 0.03, -0.06, fz * 0.3));           // radio pouch (left side)
  parts.push(box(0.02, 0.09, 0.02, hw + 0.03, 0.06, fz * 0.3));            // antenna
  parts.push(box(0.05, 0.05, 0.25, hw - 0.03, 0.18, 0));                  // shoulder strap L
  parts.push(box(0.05, 0.05, 0.25, -hw + 0.03, 0.18, 0));                 // shoulder strap R
  parts.push(box(0.12, 0.05, 0.06, -hw * 0.5, 0.11, fz + 0.05, 0, 0, 0.35)); // chest rig strap detail
  const g = BGU.mergeGeometries(parts, false); parts.forEach(p => p.dispose()); return g;
}

function buildKneepadGeometry() {
  const g = new THREE.SphereGeometry(0.068, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55); g.scale(1, 1.15, 0.85); g.rotateX(Math.PI / 2 - 0.15); // dome pointing +Z
  const strap = new THREE.CylinderGeometry(0.075, 0.08, 0.05, 12, 1, true); strap.translate(0, -0.02, -0.03);
  const m = BGU.mergeGeometries([g, strap], false); g.dispose(); strap.dispose(); return m;
}

function buildPouchBeltGeometry(w, depth) {
  const parts = []; const hw = w / 2, fz = depth / 2;
  parts.push(box(w + 0.02, 0.05, depth + 0.02, 0, 0, 0));                  // belt
  parts.push(box(0.1, 0.11, 0.06, -hw * 0.9, -0.05, fz * 0.4));            // dump pouch R
  parts.push(box(0.08, 0.1, 0.06, hw * 0.85, -0.05, fz * 0.3));            // utility pouch L
  parts.push(box(0.05, 0.15, 0.04, -hw * 1.1, -0.1, 0.02));               // holster
  const g = BGU.mergeGeometries(parts, false); parts.forEach(p => p.dispose()); return g;
}

// -------- helpers --------
// Attach `obj` to `bone` so that it sits at the given world pose (bone must have current matrixWorld).
export function attachAtWorld(obj, bone, worldPos, worldQuat) {
  _m.compose(worldPos, worldQuat || _q.identity(), _v.set(1, 1, 1));
  _m.premultiply(bone.matrixWorld.clone().invert());
  _m.decompose(obj.position, obj.quaternion, obj.scale);
  bone.add(obj);
}

// -------- asset --------
export async function loadSoldierAsset(ctx, url = new URL('../../assets/models/soldier/Soldier.glb', import.meta.url).href) {
  const loader = new GLTFLoader();
  const gltf = await new Promise((res, rej) => loader.load(url, res, undefined, rej));
  const scene = gltf.scene;
  const bones = collectBones(scene);
  if (!bones.Hips || !bones.Head || !bones.RightHand) throw new Error('Soldier.glb: expected Mixamo rig');

  let bodyMesh = null, visorMesh = null;
  scene.traverse(o => { if (o.isSkinnedMesh) { if (/visor/i.test(o.name)) visorMesh = o; else if (!bodyMesh) bodyMesh = o; } });
  scene.updateMatrixWorld(true);

  // Facing: the visor sits in front of the face → model forward. Compute yaw fix so the model faces +Z.
  const headP = bones.Head.getWorldPosition(new THREE.Vector3());
  let fwd = new THREE.Vector3(0, 0, 1);
  if (visorMesh) {
    visorMesh.geometry.computeBoundingBox(); const c = visorMesh.geometry.boundingBox.getCenter(new THREE.Vector3()); visorMesh.localToWorld(c);
    fwd.subVectors(c, headP); fwd.y = 0; if (fwd.lengthSq() > 1e-6) fwd.normalize(); else fwd.set(0, 0, 1);
  }
  const yawFix = Math.atan2(fwd.x, fwd.z); // rotate by -yawFix so forward becomes +Z
  const fixQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yawFix);

  // Measure body (bind pose, in "inner" space = after yaw fix)
  const toInner = (p) => p.clone().applyQuaternion(fixQ);
  const pos = bodyMesh.geometry.attributes.position; const bb = new THREE.Box3();
  const chest = new THREE.Box3(), waist = new THREE.Box3(), headB = new THREE.Box3(), kneeB = new THREE.Box3();
  const kneeY = toInner(bones.RightLeg.getWorldPosition(new THREE.Vector3())).y;
  const spine2Y = toInner(bones.Spine2.getWorldPosition(new THREE.Vector3())).y;
  const hipsY = toInner(bones.Hips.getWorldPosition(new THREE.Vector3())).y;
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i); bodyMesh.localToWorld(_v); _v.applyQuaternion(fixQ);
    bb.expandByPoint(_v);
    if (Math.abs(_v.x) < 0.19) {
      if (_v.y > spine2Y - 0.14 && _v.y < spine2Y + 0.03) chest.expandByPoint(_v);
      if (_v.y > hipsY - 0.08 && _v.y < hipsY + 0.06) waist.expandByPoint(_v);
      if (_v.y > kneeY - 0.06 && _v.y < kneeY + 0.06 && _v.x < 0) kneeB.expandByPoint(_v);
    }
    if (_v.y > headP.y + 0.12 && Math.abs(_v.x) < 0.16) headB.expandByPoint(_v);
  }
  const measure = { height: bb.max.y, chest, waist, headB, kneeB, kneeY, spine2Y, hipsY };

  // Materials
  const srcMat = bodyMesh.material; const srcMap = srcMat.map;
  const tints = [[0.55, 0.6, 0.48], [0.5, 0.52, 0.5], [0.6, 0.56, 0.46]];
  const rough = makeRoughTexture();
  const bodyMats = tints.map((t, i) => new THREE.MeshStandardMaterial({
    map: srcMap ? makeBodyTexture(srcMap, t, i * 173) : null, color: srcMap ? 0xffffff : 0x4a4d40,
    normalMap: srcMat.normalMap || null, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.82, metalness: 0.04, roughnessMap: rough,
    envMapIntensity: 0.6, name: 'soldierBody' + i,
  }));
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 0.35, metalness: 0.3, envMapIntensity: 0.9, name: 'soldierVisor' });
  const gearMat = new THREE.MeshStandardMaterial({ color: 0x2a2c26, roughness: 0.9, metalness: 0.0, roughnessMap: rough, name: 'soldierGear' });
  const gearMat2 = new THREE.MeshStandardMaterial({ color: 0x3a3a30, roughness: 0.88, metalness: 0.0, roughnessMap: rough, name: 'soldierGear2' });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0x2f3128, roughness: 0.75, metalness: 0.05, roughnessMap: rough, name: 'soldierHelmet' });
  const rifleMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.5, metalness: 0.7, envMapIntensity: 0.8, name: 'soldierRifle' });
  const flashMat = new THREE.MeshBasicMaterial({ map: makeFlashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, color: new THREE.Color(3, 2.4, 1.6) });
  const hitMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });

  // Geometry
  const chestW = Math.max(0.3, chest.max.x - chest.min.x), chestD = Math.max(0.18, chest.max.z - chest.min.z);
  const waistW = Math.max(0.28, waist.max.x - waist.min.x), waistD = Math.max(0.16, waist.max.z - waist.min.z);
  const headR = Math.max(0.09, (headB.max.x - headB.min.x) / 2 + 0.015);
  const geo = {
    rifle: buildRifleGeometry(), helmet: buildHelmetGeometry(headR + 0.022), vest: buildVestGeometry(chestW, chestD), knee: buildKneepadGeometry(), belt: buildPouchBeltGeometry(waistW, waistD),
    flash: new THREE.PlaneGeometry(0.34, 0.34), hitHead: new THREE.SphereGeometry(headR + 0.02, 8, 6),
    hitChest: new THREE.BoxGeometry(chestW + 0.06, 0.5, chestD + 0.06), hitPelvis: new THREE.BoxGeometry(waistW + 0.04, 0.3, waistD + 0.04),
    hitThigh: new THREE.BoxGeometry(0.17, 0.44, 0.18), hitShin: new THREE.BoxGeometry(0.14, 0.44, 0.15), hitArm: new THREE.BoxGeometry(0.12, 0.28, 0.12),
  };

  const clips = {}; for (const c of gltf.animations) clips[c.name] = c;
  return { scene, bones, clips, bodyMesh, visorMesh, yawFix, fixQ, measure, geo, mats: { bodyMats, visorMat, gearMat, gearMat2, helmetMat, rifleMat, flashMat, hitMat }, headR, chestW, chestD, waistW, waistD };
}

// -------- looks (coney chase: cops + neighbourhood crews reuse the soldier rig with different clothes) --------
// cop: navy uniform (plain, no camo), peaked patrol cap, black duty belt, no plate carrier / knee pads.
// crew: street clothes (hoodie/jacket colours), bare head or a beanie, no tactical gear.
const LOOKS = {
  cop: { tints: [[0.3, 0.36, 0.62]], hat: 'cap', belt: true },
  crew: { tints: [[0.42, 0.42, 0.45], [0.2, 0.2, 0.22], [0.72, 0.26, 0.22], [0.45, 0.5, 0.36], [0.36, 0.44, 0.6]], hat: 'beanie', belt: false },
};
function buildCapGeometry(r) {
  const crown = new THREE.CylinderGeometry(r * 1.12, r * 0.98, r * 0.62, 18); crown.scale(1, 1, 1.08); crown.translate(0, r * 0.12, 0);
  const band = new THREE.CylinderGeometry(r * 1.0, r * 1.0, r * 0.3, 18, 1, true); band.scale(1, 1, 1.08); band.translate(0, -r * 0.28, 0);
  const brim = new THREE.CylinderGeometry(r * 0.75, r * 0.75, 0.012, 16, 1, false, -Math.PI / 2, Math.PI); brim.scale(1.15, 1, 1.0); brim.rotateX(0.18); brim.translate(0, -r * 0.4, r * 0.82);
  const badge = box(0.035, 0.04, 0.01, 0, r * 0.05, r * 1.12);
  const g = BGU.mergeGeometries([crown.toNonIndexed(), band.toNonIndexed(), brim.toNonIndexed(), badge.toNonIndexed()], false); [crown, band, brim, badge].forEach(p => p.dispose()); return g;
}
function buildBeanieGeometry(r) { const g = new THREE.SphereGeometry(r * 1.06, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55); g.scale(1, 1.05, 1.12); g.translate(0, -r * 0.12, 0); return g; }
/** Lazily builds (and caches on the asset) the materials + hat geometry for a look; 512 px textures to keep the one-off cost small. */
export function lookAssets(asset, look) {
  const L = LOOKS[look]; if (!L) return null;
  const cache = asset.looks || (asset.looks = {}); if (cache[look]) return cache[look];
  const srcMat = asset.bodyMesh.material, srcMap = srcMat.map, rough = asset.mats.gearMat.roughnessMap;
  const bodyMats = L.tints.map((t, i) => new THREE.MeshStandardMaterial({
    map: srcMap ? makeBodyTexture(srcMap, t, 57 + i * 91, { camo: false, size: 512 }) : null, color: srcMap ? 0xffffff : new THREE.Color(t[0], t[1], t[2]),
    normalMap: srcMat.normalMap || null, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.86, metalness: 0.0, roughnessMap: rough, envMapIntensity: 0.5, name: look + 'Body' + i,
  }));
  const hatMats = look === 'cop' ? [new THREE.MeshStandardMaterial({ color: 0x141a2e, roughness: 0.7, metalness: 0.05, name: 'copCap' })]
    : [0x1b1b1d, 0x5a1616, 0x3a3f44].map((c, i) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, roughnessMap: rough, name: 'crewBeanie' + i }));
  const hat = look === 'cop' ? buildCapGeometry(asset.headR + 0.018) : buildBeanieGeometry(asset.headR + 0.012);
  const beltMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.55, metalness: 0.1, name: look + 'Belt' });
  return (cache[look] = { L, bodyMats, hatMats, hat, beltMat });
}

// Creates one soldier visual instance: { group, inner, model, bones, mixer, actions, rifle, muzzle, flash, hitboxes[], props[] }
// look: undefined (merc) | 'cop' | 'crew' — see LOOKS
export function createInstance(asset, variant = 0, look) {
  const group = new THREE.Group(); group.name = 'soldier';
  const inner = new THREE.Group(); inner.rotation.y = -asset.yawFix; group.add(inner);
  const model = SkeletonUtils.clone(asset.scene); inner.add(model);
  const bones = collectBones(model);
  const mats = asset.mats;
  let bodyMesh = null;
  model.traverse(o => {
    if (o.isSkinnedMesh) {
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      if (/visor/i.test(o.name)) o.material = mats.visorMat; else { o.material = mats.bodyMats[variant % mats.bodyMats.length]; bodyMesh = o; }
    }
  });
  group.updateMatrixWorld(true);

  const props = [];
  const add = (geoName, mat, bone, worldPos, worldQuat, extra) => {
    const m = new THREE.Mesh(asset.geo[geoName], mat); m.castShadow = true; m.receiveShadow = true; m.name = geoName;
    if (extra) Object.assign(m, extra);
    attachAtWorld(m, bone, worldPos, worldQuat); props.push(m); return m;
  };
  const wp = (b) => b.getWorldPosition(new THREE.Vector3());
  const ms = asset.measure;

  // helmet at head centre
  const headP = wp(bones.Head), headTop = wp(bones.HeadTop_End);
  const headC = headP.clone().lerp(headTop, 0.55); headC.y += 0.035; headC.z += 0.01;
  add('helmet', mats.helmetMat, bones.Head, headC);
  // vest at chest (Spine2), belt at hips
  const s2 = wp(bones.Spine2); const chestC = new THREE.Vector3((ms.chest.min.x + ms.chest.max.x) / 2, s2.y + 0.02, (ms.chest.min.z + ms.chest.max.z) / 2);
  add('vest', mats.gearMat, bones.Spine2, chestC);
  const hp = wp(bones.Hips); const beltC = new THREE.Vector3((ms.waist.min.x + ms.waist.max.x) / 2, hp.y - 0.02, (ms.waist.min.z + ms.waist.max.z) / 2);
  add('belt', mats.gearMat2, bones.Hips, beltC);
  // knee pads on the shin bones
  for (const side of ['Left', 'Right']) {
    const k = wp(bones[side + 'Leg']); const kz = isFinite(ms.kneeB.max.z) ? ms.kneeB.max.z : k.z + 0.06;
    add('knee', mats.gearMat2, bones[side + 'Leg'], new THREE.Vector3(k.x, k.y + 0.01, kz - 0.01));
  }
  // rifle root on the upper chest, angled across the body
  const rifle = new THREE.Mesh(asset.geo.rifle, mats.rifleMat); rifle.castShadow = true; rifle.receiveShadow = true; rifle.name = 'rifle';
  const rq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), RIFLE.yaw);
  const rPos = new THREE.Vector3(-0.12, s2.y + 0.07, ms.chest.max.z + 0.2);
  attachAtWorld(rifle, bones.Spine2, rPos, rq); props.push(rifle);
  const muzzle = new THREE.Object3D(); muzzle.position.copy(RIFLE.muzzle); rifle.add(muzzle);
  const flash = new THREE.Mesh(asset.geo.flash, mats.flashMat); flash.position.copy(RIFLE.muzzle).z += 0.12; flash.visible = false; flash.castShadow = false; flash.renderOrder = 5; rifle.add(flash);
  const flash2 = new THREE.Mesh(asset.geo.flash, mats.flashMat); flash2.rotation.y = Math.PI / 2; flash2.visible = false; flash2.renderOrder = 5; flash.add(flash2);

  // hitboxes
  const hitboxes = [];
  const hb = (geoName, part, bone, worldPos, worldQuat) => {
    const m = new THREE.Mesh(asset.geo[geoName], mats.hitMat); m.visible = false; m.name = 'hit_' + part; m.castShadow = false; m.receiveShadow = false;
    m.userData.part = part; m.userData.surface = 'flesh'; attachAtWorld(m, bone, worldPos, worldQuat); hitboxes.push(m); return m;
  };
  hb('hitHead', 'head', bones.Head, headC);
  const s1 = wp(bones.Spine1);
  hb('hitChest', 'body', bones.Spine1, new THREE.Vector3(chestC.x, s1.y + 0.12, chestC.z));
  hb('hitPelvis', 'body', bones.Hips, new THREE.Vector3(beltC.x, hp.y - 0.04, beltC.z));
  for (const side of ['Left', 'Right']) {
    const u = wp(bones[side + 'UpLeg']), k = wp(bones[side + 'Leg']), f = wp(bones[side + 'Foot']);
    hb('hitThigh', 'body', bones[side + 'UpLeg'], u.clone().lerp(k, 0.5));
    hb('hitShin', 'body', bones[side + 'Leg'], k.clone().lerp(f, 0.5));
    const a = wp(bones[side + 'Arm']), e = wp(bones[side + 'ForeArm']);
    const armQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), e.clone().sub(a).normalize());
    hb('hitArm', 'body', bones[side + 'Arm'], a.clone().lerp(e, 0.5), armQ);
  }

  if (look) applyLook(asset, { props, model, variant }, look);

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const n of ['Idle', 'Walk', 'Run']) { const c = asset.clips[n]; if (c) { const a = mixer.clipAction(c); a.play(); a.setEffectiveWeight(n === 'Idle' ? 1 : 0); actions[n] = a; } }
  return { group, inner, model, bones, mixer, actions, rifle, muzzle, flash, flash2, hitboxes, props, bodyMesh, look: look || null };
}

function applyLook(asset, inst, look) {
  const A = lookAssets(asset, look); if (!A) return;
  const v = inst.variant | 0;
  inst.model.traverse(o => { if (!o.isSkinnedMesh) return; if (/visor/i.test(o.name)) o.visible = false; else o.material = A.bodyMats[v % A.bodyMats.length]; });
  for (const m of inst.props) {
    if (m.name === 'helmet') { const bare = look === 'crew' && v % 3 === 1; if (bare) m.visible = false; else { m.geometry = A.hat; m.material = A.hatMats[v % A.hatMats.length]; } }
    else if (m.name === 'vest' || m.name === 'knee') m.visible = false;
    else if (m.name === 'belt') { if (A.L.belt) m.material = A.beltMat; else m.visible = false; }
  }
}
