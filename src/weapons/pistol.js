// Procedural M9/1911-class pistol viewmodel (bore = -Z, +Y up, +X right). Owned by: WEAPONS agent.
import * as THREE from 'three';
import { Builder, rbox, box, cylZ, cylX, cylY, torus, extrude } from './geo.js';
import { buildArm } from './arms.js';
import { orient } from './rifle.js';

export const PISTOL_SPEC = {
  id: 'm9', name: 'M9', class: 'Pistol', slot: 1, mode: 'SEMI',
  desc: '9 mm service pistol. Fast draw, 15 rounds, quick ADS.',
  mag: 15, reserve: 60, rpm: 420, auto: false, damage: 30, headMul: 2.0, range: 80, falloff: [25, 80, 0.6],
  reloadStyle: 'mag', reloadKeys: { magGrab: [-0.02, -0.14, 0.03], down: [-0.08, -0.36, 0.08], rack: [-0.02, 0.05, 0.04], tiltK: 0.8 },
  flashSize: 0.11, flashStrength: 0.7, brassScale: 0.8,
  stats: { damage: 30, rpm: 420, range: 80, mag: 15, mobility: 95, accuracy: 60 },
  hipSpread: 2.2, adsSpread: 0.35, spreadPerShot: 1.1, spreadMax: 7, moveSpread: 1.8,
  recoilPitch: 0.75, recoilYaw: 0.28, kickBack: 0.04, kickUp: 0.16, kickRoll: 0.05,
  reloadTime: 1.7, reloadTimeTac: 1.45, swapTime: 0.32, adsTime: 0.16, adsDist: 0.30,
  hip: { pos: [0.06, -0.065, -0.34], rot: [0.02, 0.04, 0.0] },
  sprint: { pos: [0.14, -0.15, -0.26], rot: [-0.3, 0.55, 0.3] },
  lower: { pos: [0.11, -0.34, -0.26], rot: [-0.9, 0.3, 0.2] },
};

export function buildPistol(mats) {
  const b = new Builder();
  const group = new THREE.Group(); group.name = 'pistol';
  const parts = {};

  // ---------- FRAME ----------
  b.add(rbox(0.026, 0.026, 0.15, 0.004, 2), 'metal', { pos: [0, -0.014, -0.005] }); // frame rails / dust cover
  b.add(rbox(0.028, 0.012, 0.04, 0.003, 1), 'metal', { pos: [0, -0.004, -0.06] }); // accessory rail block
  for (let i = 0; i < 3; i++) b.add(box(0.026, 0.003, 0.004), 'metal', { pos: [0, -0.033, -0.072 + i * 0.01] });
  // grip (raked ~17°) with polymer panels
  b.add(rbox(0.031, 0.105, 0.036, 0.008, 3), 'metal', { pos: [0, -0.07, 0.036], rot: [-0.3, 0, 0] });
  b.add(rbox(0.036, 0.085, 0.028, 0.006, 2), 'polymer', { pos: [0, -0.072, 0.04], rot: [-0.3, 0, 0] }); // grip panels (both sides)
  b.add(rbox(0.03, 0.006, 0.04, 0.002, 1), 'metal', { pos: [0, -0.123, 0.052], rot: [-0.3, 0, 0], wearAmt: 1.4 }); // magwell lip
  // beavertail / grip tang
  b.add(rbox(0.026, 0.012, 0.03, 0.004, 1), 'metal', { pos: [0, -0.016, 0.075], rot: [0.5, 0, 0] });
  // trigger guard (round, 1911/M9 style)
  {
    const path = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.027, -0.035), new THREE.Vector3(0, -0.055, -0.03), new THREE.Vector3(0, -0.062, -0.005), new THREE.Vector3(0, -0.055, 0.016), new THREE.Vector3(0, -0.03, 0.02)]);
    b.add(new THREE.TubeGeometry(path, 12, 0.0032, 8, false), 'metal', { wear: 'all', wearAmt: 0.2 });
  }
  b.add(cylX(0.004, 0.004, 0.036, 8), 'steel', { pos: [0, -0.015, 0.01], wear: 'rim', wearAmt: 1.5 }); // slide stop pin
  b.add(rbox(0.005, 0.008, 0.024, 0.0015, 1), 'steel', { pos: [-0.016, -0.012, 0.0], wearAmt: 1.5 }); // slide release lever (left)
  b.add(cylX(0.005, 0.005, 0.006, 10), 'steel', { pos: [-0.017, -0.036, 0.022], wear: 'rim', wearAmt: 1.5 }); // mag release
  b.add(rbox(0.012, 0.02, 0.008, 0.002, 1), 'steel', { pos: [0, 0.0, 0.082], rot: [-0.6, 0, 0], wearAmt: 1.4 }); // hammer (cocked)
  b.add(rbox(0.004, 0.02, 0.012, 0.001, 1), 'steel', { pos: [-0.014, 0.004, 0.06], wearAmt: 1.5 }); // safety lever

  // ---------- SLIDE (animated) ----------
  {
    const sb = new Builder();
    sb.add(rbox(0.027, 0.028, 0.19, 0.005, 3), 'steel', { pos: [0, 0.014, -0.01], wearAmt: 1.3 });
    // rounded top ridge
    sb.add(cylZ(0.011, 0.011, 0.19, 12), 'steel', { pos: [0, 0.022, -0.01], wear: 'rim', wearAmt: 0.5 });
    // ejection port (open on the right/top)
    sb.add(box(0.014, 0.016, 0.03), 'rubber', { pos: [0.01, 0.02, 0.005], wear: 'none' });
    // rear serrations
    for (let i = 0; i < 7; i++) { sb.add(box(0.03, 0.02, 0.0015), 'rubber', { pos: [0, 0.014, 0.05 + i * 0.0045], wear: 'none' }); }
    for (let i = 0; i < 5; i++) { sb.add(box(0.03, 0.016, 0.0015), 'rubber', { pos: [0, 0.012, -0.085 + i * 0.0045], wear: 'none' }); }
    // sights: 3-dot
    sb.add(rbox(0.018, 0.007, 0.008, 0.001, 1), 'steel', { pos: [0, 0.031, 0.07], wearAmt: 1.2 }); // rear sight
    sb.add(box(0.006, 0.007, 0.008), 'rubber', { pos: [0, 0.031, 0.07], wear: 'none' }); // notch
    sb.add(rbox(0.0035, 0.008, 0.006, 0.001, 1), 'steel', { pos: [0, 0.031, -0.095], wearAmt: 1.2 }); // front sight
    // muzzle: barrel visible inside the slide front
    sb.add(cylZ(0.0075, 0.0075, 0.012, 12), 'steel', { pos: [0, 0.015, -0.106], wear: 'rim' });
    sb.add(cylZ(0.0045, 0.0045, 0.004, 10), 'rubber', { pos: [0, 0.015, -0.111], wear: 'none' });
    // extractor line
    sb.add(box(0.001, 0.006, 0.03), 'rubber', { pos: [0.0135, 0.02, 0.02], wear: 'none' });
    parts.slide = sb.build(mats, 'slide'); group.add(parts.slide);
    // tritium dots
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x9dffb0, toneMapped: false });
    for (const x of [-0.006, 0.006]) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.0009, 6, 4), dotMat); d.position.set(x, 0.033, 0.074); parts.slide.add(d); }
    const fd = new THREE.Mesh(new THREE.SphereGeometry(0.0009, 6, 4), dotMat); fd.position.set(0, 0.034, -0.098); parts.slide.add(fd);
  }
  // ---------- BARREL (fixed, shows when the slide is back) ----------
  b.add(cylZ(0.0075, 0.0075, 0.10, 12), 'steel', { pos: [0, 0.015, -0.05], wear: 'rim', wearAmt: 1.5 });
  // ---------- TRIGGER (animated) ----------
  {
    const tb = new Builder();
    tb.add(rbox(0.006, 0.02, 0.005, 0.0015, 1), 'steel', { pos: [0, -0.01, 0], rot: [0.25, 0, 0], wearAmt: 1.4 });
    parts.trigger = tb.build(mats, 'trigger'); parts.trigger.position.set(0, -0.03, -0.012); group.add(parts.trigger);
  }
  // ---------- MAGAZINE (animated) ----------
  {
    const mb = new Builder();
    mb.add(rbox(0.023, 0.11, 0.03, 0.003, 2), 'steel', { pos: [0, -0.075, 0.046], rot: [-0.3, 0, 0], wearAmt: 0.9 });
    mb.add(rbox(0.027, 0.008, 0.038, 0.002, 1), 'polymer', { pos: [0, -0.13, 0.062], rot: [-0.3, 0, 0], wearAmt: 1.2 }); // baseplate
    parts.mag = mb.build(mats, 'mag'); group.add(parts.mag); parts.mag.userData.home = new THREE.Vector3(0, 0, 0);
  }

  parts.sight = new THREE.Object3D(); parts.sight.position.set(0, 0.034, 0.0); group.add(parts.sight);
  parts.muzzle = new THREE.Object3D(); parts.muzzle.position.set(0, 0.015, -0.112); group.add(parts.muzzle);
  parts.eject = new THREE.Object3D(); parts.eject.position.set(0.016, 0.022, 0.005); group.add(parts.eject);

  parts.body = b.build(mats, 'pistolBody'); group.add(parts.body);

  // ---------- ARMS: two-handed thumbs-forward grip ----------
  const right = buildArm('right', { curl: [0.6, 0.3, 0.95, 1.0, 1.0], spread: 0.04, thumbUp: 1.2, forearmLen: 0.34 }, (hand, fore) => {
    hand.position.set(0.022, -0.09, 0.052);
    orient(hand, [0, -1, 0], [0, 0, -1]);
    hand.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), -0.3);
    hand.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), -0.1);
    fore.position.set(0.035, -0.12, 0.085);
    fore.lookAt(0.12, -0.33, 0.46); fore.rotateX(Math.PI / 2);
  }, mats);
  group.add(right); parts.armR = right;
  const left = buildArm('left', { curl: [0.4, 0.9, 0.95, 1.0, 1.0], spread: 0.02, thumbUp: 0.7, forearmLen: 0.34 }, (hand, fore) => {
    hand.position.set(-0.03, -0.085, 0.035);
    orient(hand, [0, -1, 0], [0, 0, -1]); // mirror-ish: fingers forward, palm to the right, wrapping the right hand
    hand.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), Math.PI); // flip so the back of the hand faces left
    hand.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), -0.3);
    hand.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), 0.35);
    hand.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), 0.25);
    fore.position.set(-0.045, -0.12, 0.07);
    fore.lookAt(-0.14, -0.34, 0.42); fore.rotateX(Math.PI / 2);
  }, mats);
  group.add(left); parts.armL = left;

  group.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = true; } });
  return { group, parts, spec: PISTOL_SPEC };
}
