// Combat knife viewmodel (blade = -Z, +Y up). Melee: fires as a 2.3 m hitscan "stab" (spec.melee — no ammo, no flash, no
// brass, no tracer; the recoil springs throw the blade forward). Chill mode (coney) starts you with only this. Owned by: WEAPONS agent.
import * as THREE from 'three';
import { Builder, rbox, box } from './geo.js';
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

export function buildKnife(mats) {
  const b = new Builder(); const group = new THREE.Group(); group.name = 'knife'; const parts = {};
  if (!mats.blade) mats.blade = new THREE.MeshPhysicalMaterial({ color: 0xc9cdd2, roughness: 0.26, metalness: 1.0, envMapIntensity: 1.2 });   // bright satin steel
  b.add(rbox(0.005, 0.034, 0.17, 0.0015, 1), 'blade', { pos: [0, 0.008, -0.11], wear: 'all', wearAmt: 0.3 });                // blade
  b.add(box(0.0045, 0.016, 0.034), 'blade', { pos: [0, 0.016, -0.2], rot: [-0.55, 0, 0] });                                  // tip
  b.add(rbox(0.012, 0.012, 0.016, 0.003, 1), 'metal', { pos: [0, -0.002, -0.02] });                                           // bolster / guard
  b.add(rbox(0.02, 0.028, 0.11, 0.006, 2), 'polymer', { pos: [0, -0.004, 0.045] });                                           // handle
  parts.body = b.build(mats, 'knifeBody'); group.add(parts.body);
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
