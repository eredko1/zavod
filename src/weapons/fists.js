// Fists: both hands up in a loose guard (fingers curled, thumbs over). Melee like the knife (a short hitscan "punch", spec.melee):
// jab / cross alternate, a quick third punch is a hook for more. weapons.js drops the hands out of view when you haven't punched
// for a moment, so walking about in chill mode nobody's waving anything around. Chill mode's default; 7 / numpad 7 anywhere.
// Owned by: WEAPONS agent.
import * as THREE from 'three';
import { buildArm } from './arms.js';
import { orient } from './rifle.js';

export const FISTS_SPEC = {
  id: 'fists', name: 'FISTS', class: 'Melee', slot: 0, mode: 'MELEE', melee: true, fists: true,
  desc: 'Two hands and a bad attitude. Jab, cross, hook: chain them for the big one.',
  mag: 1, reserve: 0, rpm: 190, auto: false, damage: 14, headMul: 1.5, range: 1.8, falloff: [2, 2, 1],
  reloadStyle: 'mag', reloadKeys: { magGrab: [0, 0, 0], down: [0, 0, 0], rack: [0, 0, 0], tiltK: 0 },
  flashSize: 0, flashStrength: 0, brassScale: 0,
  stats: { damage: 14, rpm: 190, range: 2, mag: 1, mobility: 100, accuracy: 100 },
  hipSpread: 0.3, adsSpread: 0.3, spreadPerShot: 0, spreadMax: 0, moveSpread: 0,
  recoilPitch: 0, recoilYaw: 0, kickBack: -0.4, kickUp: -0.15, kickRoll: 0.2,
  reloadTime: 1, reloadTimeTac: 1, swapTime: 0.18, adsTime: 0.15, adsDist: 0.3,
  hip: { pos: [0, -0.1, -0.3], rot: [0.1, 0, 0] },
  sprint: { pos: [0, -0.2, -0.26], rot: [-0.3, 0, 0] },
  lower: { pos: [0, -0.4, -0.24], rot: [-0.9, 0, 0] },
};

export function buildFists(mats) {
  const group = new THREE.Group(); group.name = 'fists'; const parts = {};
  const body = new THREE.Group(); body.name = 'fistsBody'; group.add(body); parts.body = body;
  parts.sight = new THREE.Object3D(); parts.sight.position.set(0, 0.03, 0); group.add(parts.sight);
  parts.muzzle = new THREE.Object3D(); parts.muzzle.position.set(0, 0.0, -0.2); group.add(parts.muzzle);
  parts.eject = new THREE.Object3D(); group.add(parts.eject);
  // a fist each side: fingers fully curled, knuckles forward, the thumb across; forearms dropping away out of shot
  const fist = (side) => { const sx = side === 'right' ? 1 : -1;
    return buildArm(side, { curl: [1.0, 1.0, 1.0, 1.0, 1.0], spread: 0.0, thumbUp: 0.15, forearmLen: 0.34, keepFore: false }, (hand, fore) => {
      hand.position.set(sx * 0.105, -0.035, -0.02);
      orient(hand, [0, 0, -1], [sx * -0.2, 1, 0]);
      hand.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), -sx * 0.35);
      fore.position.set(sx * 0.13, -0.09, 0.05);
      fore.lookAt(sx * 0.2, -0.32, 0.42); fore.rotateX(Math.PI / 2);
    }, mats); };
  const R = fist('right'), L = fist('left'); group.add(R); group.add(L); parts.armR = R; parts.armL = L;
  group.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = true; } });
  return { group, parts, spec: FISTS_SPEC };
}
