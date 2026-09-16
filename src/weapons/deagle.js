// Procedural .50 AE heavy pistol viewmodel (bore = -Z, +Y up, +X right; meters). Owned by: WEAPONS agent.
import * as THREE from 'three';
import { Builder, rbox, box, cylZ, cylX, cylY, torus, extrude } from './geo.js';
import { buildArm } from './arms.js';
import { orient } from './rifle.js';

export const DEAGLE_SPEC = {
  id: 'deagle', name: 'DE .50', class: 'Pistol', slot: 1, mode: 'SEMI',
  desc: '.50 AE hand cannon. Seven rounds, brutal recoil, drops anything in two hits. Slow to bring back on target.',
  mag: 7, reserve: 35, rpm: 190, auto: false, damage: 58, headMul: 2.2, range: 100, falloff: [30, 100, 0.65],
  reloadStyle: 'mag', reloadKeys: { magGrab: [-0.02, -0.15, 0.035], down: [-0.08, -0.36, 0.09], rack: [-0.02, 0.06, 0.03], tiltK: 0.9 },
  hipSpread: 2.6, adsSpread: 0.3, spreadPerShot: 1.6, spreadMax: 8, moveSpread: 2.0,
  recoilPitch: 2.3, recoilYaw: 0.7, kickBack: 0.09, kickUp: 0.36, kickRoll: 0.09,
  reloadTime: 2.0, reloadTimeTac: 1.7, swapTime: 0.36, adsTime: 0.2, adsDist: 0.32,
  flashSize: 0.19, flashStrength: 1.3, brassScale: 1.25,
  hip: { pos: [0.10, -0.13, -0.25], rot: [0.0, 0.06, 0.0] },
  sprint: { pos: [0.14, -0.16, -0.27], rot: [-0.3, 0.55, 0.3] },
  lower: { pos: [0.11, -0.35, -0.27], rot: [-0.9, 0.3, 0.2] },
  stats: { damage: 58, rpm: 190, range: 100, mag: 7, mobility: 84, accuracy: 52 },
};

export function buildDeagle(mats) {
  const b = new Builder();
  const group = new THREE.Group(); group.name = 'deagle';
  const parts = {};
  const boreY = 0.02;

  // ---------- FRAME (long dust cover, squared trigger guard, big grip) ----------
  b.add(rbox(0.032, 0.03, 0.19, 0.004, 2), 'metal', { pos: [0, -0.014, -0.02] });
  b.add(rbox(0.034, 0.012, 0.05, 0.003, 1), 'metal', { pos: [0, -0.033, -0.07] }); // dust cover underside / rail
  for (let i = 0; i < 4; i++) b.add(box(0.03, 0.003, 0.004), 'metal', { pos: [0, -0.04, -0.085 + i * 0.01] });
  b.add(rbox(0.036, 0.125, 0.044, 0.009, 3), 'metal', { pos: [0, -0.08, 0.05], rot: [-0.28, 0, 0] }); // grip frame
  b.add(rbox(0.04, 0.10, 0.034, 0.007, 3), 'rubber', { pos: [0, -0.082, 0.056], rot: [-0.28, 0, 0], wear: 'none' }); // rubber grip panels
  for (let i = 0; i < 5; i++) b.add(rbox(0.041, 0.004, 0.03, 0.001, 1), 'polymer', { pos: [0, -0.05 - i * 0.017, 0.048 + i * 0.005], rot: [-0.28, 0, 0], wear: 'none' }); // finger grooves
  b.add(rbox(0.034, 0.008, 0.05, 0.002, 1), 'metal', { pos: [0, -0.142, 0.07], rot: [-0.28, 0, 0], wearAmt: 1.4 }); // magwell lip
  b.add(rbox(0.028, 0.014, 0.036, 0.004, 1), 'metal', { pos: [0, -0.018, 0.086], rot: [0.55, 0, 0] }); // beavertail
  {
    // squared trigger guard with the forward hook
    const path = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.03, -0.05), new THREE.Vector3(0, -0.06, -0.052), new THREE.Vector3(0, -0.07, -0.03), new THREE.Vector3(0, -0.07, 0.01), new THREE.Vector3(0, -0.062, 0.028), new THREE.Vector3(0, -0.035, 0.03)]);
    b.add(new THREE.TubeGeometry(path, 14, 0.0036, 8, false), 'metal', { wear: 'all', wearAmt: 0.2 });
  }
  b.add(cylX(0.0045, 0.0045, 0.04, 8), 'steel', { pos: [0, -0.02, -0.01], wear: 'rim', wearAmt: 1.5 }); // slide stop pin
  b.add(rbox(0.006, 0.01, 0.028, 0.0015, 1), 'steel', { pos: [-0.019, -0.012, 0.0], wearAmt: 1.5 }); // slide release (left)
  b.add(cylX(0.005, 0.005, 0.006, 10), 'steel', { pos: [-0.02, -0.042, 0.03], wear: 'rim', wearAmt: 1.5 }); // mag release
  b.add(rbox(0.014, 0.024, 0.008, 0.002, 1), 'steel', { pos: [0, 0.0, 0.098], rot: [-0.55, 0, 0], wearAmt: 1.4 }); // hammer (cocked)
  for (const x of [-0.017, 0.017]) b.add(rbox(0.004, 0.02, 0.014, 0.001, 1), 'steel', { pos: [x, 0.008, 0.078], wearAmt: 1.5 }); // ambi safety levers

  // ---------- SLIDE + BARREL (animated: the slide is the tall rectangular upper; barrel is fixed underneath the top rail) ----------
  {
    const sb = new Builder();
    sb.add(rbox(0.032, 0.036, 0.235, 0.005, 3), 'steel', { pos: [0, 0.014, -0.02], wearAmt: 1.3 });
    // flat top with the signature rail groove
    sb.add(rbox(0.026, 0.008, 0.19, 0.002, 1), 'steel', { pos: [0, 0.035, -0.03], wearAmt: 1.2 });
    sb.add(box(0.014, 0.004, 0.17), 'blackout', { pos: [0, 0.039, -0.035], wear: 'none' }); // rail groove
    for (let i = 0; i < 7; i++) sb.add(box(0.02, 0.0025, 0.006), 'steel', { pos: [0, 0.041, -0.10 + i * 0.022], wearAmt: 1.3 }); // rail teeth
    // triangular chamfers along the top edges (Deagle's slab-sided look)
    for (const sx of [-1, 1]) sb.add(rbox(0.012, 0.004, 0.22, 0.001, 1), 'steel', { pos: [sx * 0.014, 0.034, -0.02], rot: [0, 0, sx * 0.6], wearAmt: 1.4 });
    // ejection port (right) and extractor
    sb.add(box(0.016, 0.018, 0.034), 'blackout', { pos: [0.011, 0.02, -0.005], wear: 'none' });
    sb.add(rbox(0.003, 0.02, 0.038, 0.0008, 1), 'steel', { pos: [0.0165, 0.02, -0.005], wear: 'all', wearAmt: 0.3 });
    // rear serrations
    for (let i = 0; i < 8; i++) sb.add(box(0.034, 0.024, 0.0016), 'rubber', { pos: [0, 0.012, 0.055 + i * 0.005], wear: 'none' });
    // sights
    sb.add(rbox(0.022, 0.009, 0.01, 0.001, 1), 'steel', { pos: [0, 0.045, 0.085], wearAmt: 1.2 });
    sb.add(box(0.005, 0.009, 0.011), 'blackout', { pos: [0, 0.046, 0.085], wear: 'none' }); // notch
    sb.add(rbox(0.004, 0.01, 0.008, 0.001, 1), 'steel', { pos: [0, 0.045, -0.125], wearAmt: 1.2 }); // front post
    parts.slide = sb.build(mats, 'slide'); parts.slide.userData.travel = 0.045; parts.slide.userData.lockBack = 0.04; group.add(parts.slide);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x9dffb0, toneMapped: false });
    for (const x of [-0.007, 0.007]) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.001, 6, 4), dotMat); d.position.set(x, 0.048, 0.09); parts.slide.add(d); }
    const fd = new THREE.Mesh(new THREE.SphereGeometry(0.001, 6, 4), dotMat); fd.position.set(0, 0.049, -0.128); parts.slide.add(fd);
  }
  // fixed barrel showing at the front (big .50 bore) — sits inside the slide's front opening
  b.add(cylZ(0.011, 0.011, 0.24, 16), 'steel', { pos: [0, boreY, -0.02], wear: 'rim', wearAmt: 1.2 });
  b.add(cylZ(0.0065, 0.0065, 0.004, 12), 'blackout', { pos: [0, boreY, -0.141], wear: 'none' }); // bore
  // ---------- TRIGGER ----------
  {
    const tb = new Builder(); tb.add(rbox(0.007, 0.022, 0.005, 0.0015, 1), 'steel', { pos: [0, -0.011, 0], rot: [0.25, 0, 0], wearAmt: 1.4 });
    parts.trigger = tb.build(mats, 'trigger'); parts.trigger.position.set(0, -0.034, -0.02); group.add(parts.trigger);
  }
  // ---------- MAGAZINE (animated) ----------
  {
    const mb = new Builder();
    mb.add(rbox(0.027, 0.13, 0.038, 0.003, 2), 'steel', { pos: [0, -0.085, 0.058], rot: [-0.28, 0, 0], wearAmt: 0.9 });
    mb.add(rbox(0.031, 0.01, 0.046, 0.002, 1), 'rubber', { pos: [0, -0.152, 0.077], rot: [-0.28, 0, 0], wear: 'none' }); // bumper pad
    parts.mag = mb.build(mats, 'mag'); group.add(parts.mag); parts.mag.userData.home = new THREE.Vector3(0, 0, 0);
  }

  parts.sight = new THREE.Object3D(); parts.sight.position.set(0, 0.049, 0.0); group.add(parts.sight);
  parts.muzzle = new THREE.Object3D(); parts.muzzle.position.set(0, boreY, -0.143); group.add(parts.muzzle);
  parts.eject = new THREE.Object3D(); parts.eject.position.set(0.018, 0.028, -0.005); group.add(parts.eject);

  parts.body = b.build(mats, 'deagleBody'); group.add(parts.body);

  // ---------- ARMS: two-handed thumbs-forward grip (wider grip than the M9) ----------
  const right = buildArm('right', { curl: [0.6, 0.3, 0.95, 1.0, 1.0], spread: 0.04, thumbUp: 1.2, forearmLen: 0.34 }, (hand, fore) => {
    hand.position.set(0.024, -0.098, 0.064);
    orient(hand, [0, -1, 0], [0, 0, -1]);
    hand.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), -0.28);
    hand.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), -0.1);
    fore.position.set(0.037, -0.128, 0.097);
    fore.lookAt(0.12, -0.34, 0.47); fore.rotateX(Math.PI / 2);
  }, mats);
  group.add(right); parts.armR = right;
  const left = buildArm('left', { curl: [0.4, 0.9, 0.95, 1.0, 1.0], spread: 0.02, thumbUp: 0.7, forearmLen: 0.34 }, (hand, fore) => {
    hand.position.set(-0.033, -0.093, 0.047);
    orient(hand, [0, -1, 0], [0, 0, -1]);
    hand.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), Math.PI);
    hand.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), -0.28);
    hand.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), 0.35);
    hand.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), 0.25);
    fore.position.set(-0.048, -0.128, 0.082);
    fore.lookAt(-0.14, -0.35, 0.43); fore.rotateX(Math.PI / 2);
  }, mats);
  group.add(left); parts.armL = left;

  group.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = true; } });
  return { group, parts, spec: DEAGLE_SPEC };
}
