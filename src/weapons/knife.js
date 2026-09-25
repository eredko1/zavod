// Combat knife viewmodel (blade = -Z, +Y up). Melee: fires as a 2.3 m hitscan "stab" (spec.melee — no ammo, no flash, no
// brass, no tracer; the recoil springs throw the blade forward). Chill mode (coney) starts you with only this. Owned by: WEAPONS agent.
import * as THREE from 'three';
import { buildArm } from './arms.js';
import { orient } from './rifle.js';

export const KNIFE_SPEC = {
  id: 'knife', name: 'KNIFE', class: 'Melee', slot: 0, mode: 'MELEE', melee: true,
  desc: 'A folding knife from the Brighton flea market. Two stabs does it. Stay close.',
  mag: 1, reserve: 0, rpm: 95, auto: true, damage: 55, headMul: 1.6, range: 2.3, falloff: [3, 3, 1],
  reloadStyle: 'mag', reloadKeys: { magGrab: [0, 0, 0], down: [0, 0, 0], rack: [0, 0, 0], tiltK: 0 },
  flashSize: 0, flashStrength: 0, brassScale: 0,
  stats: { damage: 55, rpm: 95, range: 2, mag: 1, mobility: 100, accuracy: 100 },
  hipSpread: 0.4, adsSpread: 0.4, spreadPerShot: 0, spreadMax: 0, moveSpread: 0,
  recoilPitch: 0, recoilYaw: 0, kickBack: -0.55, kickUp: -0.35, kickRoll: 0.45,
  reloadTime: 1, reloadTimeTac: 1, swapTime: 0.22, adsTime: 0.2, adsDist: 0.3,
  hip: { pos: [0.12, -0.12, -0.3], rot: [0.25, 0.2, -0.35] },
  sprint: { pos: [0.14, -0.16, -0.26], rot: [-0.2, 0.45, 0.2] },
  lower: { pos: [0.12, -0.34, -0.26], rot: [-0.9, 0.3, 0.2] },
};

// profile shapes are drawn in (x = along the knife, y = up) and turned so +x runs down the barrel axis (-Z), thickness on X
const alongZ = (g, depth, dx = 0, dy = 0) => { g.translate(0, 0, -depth / 2); g.rotateY(Math.PI / 2); g.translate(0, dy, dx); return g; };
let _gripTex = null;
function gripTexture() {   // G10 scales: fine diamond knurl over layered black/olive
  if (_gripTex) return _gripTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#1d1f1c'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(${60 + (i % 3) * 8},${66 + (i % 2) * 6},52,0.18)`; g.fillRect(0, i * 7 + (i % 2) * 2, 128, 2); }
  g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 1;
  for (let k = -128; k < 256; k += 6) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 128, 128); g.stroke(); g.beginPath(); g.moveTo(k + 128, 0); g.lineTo(k, 128); g.stroke(); }
  _gripTex = new THREE.CanvasTexture(c); _gripTex.wrapS = _gripTex.wrapT = THREE.RepeatWrapping; _gripTex.repeat.set(3, 1); _gripTex.colorSpace = THREE.SRGBColorSpace; _gripTex.anisotropy = 4;
  return _gripTex;
}

export function buildKnife(mats) {
  const group = new THREE.Group(); group.name = 'knife'; const parts = {};
  if (!mats.blade) mats.blade = new THREE.MeshPhysicalMaterial({ color: 0xc9cdd2, roughness: 0.26, metalness: 1.0, envMapIntensity: 1.2 });   // bright satin steel
  if (!mats.bladeDark) mats.bladeDark = new THREE.MeshStandardMaterial({ color: 0x55595e, roughness: 0.5, metalness: 1.0 });                // fuller / stonewash
  if (!mats.grip) mats.grip = new THREE.MeshStandardMaterial({ map: gripTexture(), color: 0xffffff, roughness: 0.82, metalness: 0.05 });
  if (!mats.guard) mats.guard = new THREE.MeshStandardMaterial({ color: 0x2b2c2e, roughness: 0.4, metalness: 0.9 });
  const body = new THREE.Group(); body.name = 'knifeBody'; group.add(body);
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); body.add(m); return m; };
  // blade: drop point with a clipped spine, belly sweeping up to the tip; bevels read as the edge grind
  const bl = new THREE.Shape(); bl.moveTo(0, 0.011); bl.lineTo(0.118, 0.011); bl.quadraticCurveTo(0.152, 0.0095, 0.178, 0.0015);
  bl.quadraticCurveTo(0.158, -0.0155, 0.105, -0.0185); bl.lineTo(0.012, -0.0185); bl.quadraticCurveTo(0.004, -0.0185, 0.002, -0.013); bl.lineTo(0, -0.013); bl.closePath();
  add(alongZ(new THREE.ExtrudeGeometry(bl, { depth: 0.0022, bevelEnabled: true, bevelThickness: 0.0011, bevelSize: 0.0016, bevelSegments: 2, curveSegments: 14 }), 0.0022, -0.021, 0.006), mats.blade);
  // fuller groove, both faces
  for (const sx of [-1, 1]) { const f = add(new THREE.BoxGeometry(0.0004, 0.0042, 0.078), mats.bladeDark); f.position.set(sx * 0.00225, 0.0105, -0.075); }
  // spine jimping (thumb ramp)
  for (let i = 0; i < 6; i++) { const j = add(new THREE.BoxGeometry(0.0036, 0.0012, 0.0012), mats.bladeDark); j.position.set(0, 0.0175, -0.03 - i * 0.0032); }
  // guard: a short double quillon
  const gd = new THREE.Shape(); gd.moveTo(-0.004, -0.028); gd.lineTo(0.004, -0.024); gd.lineTo(0.004, 0.022); gd.lineTo(-0.004, 0.026); gd.closePath();
  add(alongZ(new THREE.ExtrudeGeometry(gd, { depth: 0.009, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0012, bevelSegments: 2 }), 0.009, -0.018, 0.001), mats.guard);
  // handle: finger grooves underneath, palm swell on top, rounded G10 scales
  const h = new THREE.Shape(); h.moveTo(0, 0.0115); h.quadraticCurveTo(-0.06, 0.016, -0.108, 0.011); h.lineTo(-0.114, 0.004); h.lineTo(-0.112, -0.013);
  h.quadraticCurveTo(-0.098, -0.02, -0.084, -0.0135); h.quadraticCurveTo(-0.07, -0.019, -0.056, -0.0135); h.quadraticCurveTo(-0.042, -0.019, -0.028, -0.0135);
  h.quadraticCurveTo(-0.014, -0.0195, 0, -0.014); h.closePath();
  const hg = new THREE.ExtrudeGeometry(h, { depth: 0.013, bevelEnabled: true, bevelThickness: 0.0042, bevelSize: 0.0028, bevelSegments: 4, curveSegments: 10 });
  { const pos = hg.attributes.position, uv = hg.attributes.uv; for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) * 12, pos.getY(i) * 12 + pos.getZ(i) * 6); }   // wrap the knurl evenly
  add(alongZ(hg, 0.013, -0.014, 0.0), mats.grip);
  // pins + pommel
  for (const x of [0.028, 0.078]) for (const sx of [-1, 1]) { const pn = add(new THREE.CylinderGeometry(0.0022, 0.0022, 0.0012, 10), mats.blade); pn.rotation.z = Math.PI / 2; pn.position.set(sx * 0.0112, 0.0, -0.014 + x); }
  const pm = add(new THREE.CylinderGeometry(0.0085, 0.0095, 0.012, 12), mats.guard); pm.rotation.x = Math.PI / 2; pm.position.set(0, -0.002, 0.104);
  parts.body = body;
  parts.sight = new THREE.Object3D(); parts.sight.position.set(0, 0.03, 0); group.add(parts.sight);
  parts.muzzle = new THREE.Object3D(); parts.muzzle.position.set(0, 0.01, -0.19); group.add(parts.muzzle);
  parts.eject = new THREE.Object3D(); group.add(parts.eject);
  const right = buildArm('right', { curl: [0.9, 1.0, 1.0, 1.0, 1.0], spread: 0.02, thumbUp: 0.6, forearmLen: 0.34 }, (hand, fore) => {
    hand.position.set(0.012, -0.03, 0.045);
    orient(hand, [0, -1, 0], [0, 0, -1]);
    hand.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), -0.1);
    fore.position.set(0.03, -0.07, 0.085);
    fore.lookAt(0.12, -0.3, 0.46); fore.rotateX(Math.PI / 2);
  }, mats);
  group.add(right); parts.armR = right;
  group.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = true; } });
  return { group, parts, spec: KNIFE_SPEC };
}
