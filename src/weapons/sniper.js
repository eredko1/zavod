// Procedural M24 SWS-class bolt-action sniper viewmodel (bore = -Z, +Y up, +X right; meters). Owned by: WEAPONS agent.
import * as THREE from 'three';
import { Builder, rbox, box, cylZ, cylY, cylX, torus, extrude, lathe, sphere, addRail } from './geo.js';
import { buildArm } from './arms.js';
import { orient } from './rifle.js';

export const SNIPER_SPEC = {
  id: 'm24', name: 'M24', class: 'Sniper', slot: 0, mode: 'BOLT',
  desc: '7.62 bolt-action with a 10x scope. One shot to the head, two to the body. Slow, deliberate, unforgiving up close.',
  mag: 5, reserve: 30, rpm: 55, auto: false, damage: 95, headMul: 3.0, range: 400, falloff: [150, 400, 0.85],
  action: 'bolt', actionTime: 1.1, actionDelay: 0.22, scope: true, scopeSway: 0.0022,
  reloadStyle: 'mag', reloadKeys: { magGrab: [-0.02, -0.125, -0.03], down: [-0.1, -0.42, 0.06], rack: [-0.02, 0.055, 0.12], tiltK: 1 },
  hipSpread: 12, adsSpread: 0.02, spreadPerShot: 0.4, spreadMax: 3, moveSpread: 3.0,
  recoilPitch: 3.2, recoilYaw: 0.9, kickBack: 0.14, kickUp: 0.28, kickRoll: 0.1,
  reloadTime: 3.0, reloadTimeTac: 2.6, swapTime: 0.6, adsTime: 0.5, adsDist: 0.20, adsFovMul: 0.22,
  flashSize: 0.17, flashStrength: 1.4, brassScale: 1.4, wallReach: 1.0,
  hip: { pos: [0.10, -0.15, -0.33], rot: [0.0, 0.06, 0.01] },
  sprint: { pos: [0.17, -0.18, -0.32], rot: [-0.25, 0.8, 0.35] },
  lower: { pos: [0.12, -0.37, -0.28], rot: [-0.9, 0.35, 0.2] },
  stats: { damage: 95, rpm: 55, range: 400, mag: 5, mobility: 45, accuracy: 98 },
};

export function buildSniper(mats) {
  const b = new Builder();
  const group = new THREE.Group(); group.name = 'sniper';
  const parts = {};
  const scopeY = 0.064;

  // ---------- RECEIVER (Remington 700 long action: round body, flat bottom) ----------
  b.add(cylZ(0.0175, 0.0175, 0.23, 20), 'blued', { pos: [0, 0, 0.0], wear: 'rim', wearAmt: 0.5 });
  b.add(rbox(0.034, 0.022, 0.22, 0.003, 1), 'blued', { pos: [0, -0.011, 0.0] });
  b.add(box(0.012, 0.016, 0.078), 'blackout', { pos: [0.013, 0.008, -0.03], wear: 'none' }); // ejection port (right)
  b.add(rbox(0.003, 0.02, 0.082, 0.0008, 1), 'steel', { pos: [0.0175, 0.008, -0.03], wear: 'all', wearAmt: 0.3 }); // worn port lip
  b.add(cylZ(0.019, 0.019, 0.032, 20), 'blued', { pos: [0, 0, -0.125], wear: 'rim', wearAmt: 1.2 }); // barrel shank / recoil lug ring
  b.add(cylZ(0.0135, 0.0135, 0.034, 16), 'steel', { pos: [0, 0, 0.13], wear: 'rim', wearAmt: 1.1 }); // bolt shroud
  b.add(cylZ(0.006, 0.006, 0.012, 10), 'steel', { pos: [0, 0, 0.152], wear: 'rim' }); // cocking indicator
  b.add(rbox(0.006, 0.01, 0.026, 0.0015, 1), 'steel', { pos: [0.014, 0.008, 0.10], wearAmt: 1.5 }); // safety lever (right rear)

  // ---------- BARREL (heavy contour, 24") ----------
  b.add(cylZ(0.0115, 0.014, 0.615, 20), 'blued', { pos: [0, 0, -0.43], wear: 'rim', wearAmt: 0.45 });
  b.add(cylZ(0.0118, 0.0118, 0.01, 20), 'steel', { pos: [0, 0, -0.742], wear: 'rim', wearAmt: 1.4 }); // crown ring
  b.add(cylZ(0.0045, 0.0045, 0.004, 12), 'blackout', { pos: [0, 0, -0.748], wear: 'none' }); // bore

  // ---------- STOCK (HS Precision style: aluminium bedding block fibreglass, near-vertical grip, high comb) ----------
  {
    const prof = [[-0.46, -0.004], [-0.462, -0.046], [-0.30, -0.052], [-0.12, -0.055], [0.02, -0.06], [0.04, -0.10], [0.062, -0.155], [0.108, -0.16], [0.128, -0.10], [0.19, -0.085], [0.40, -0.10], [0.437, -0.115], [0.44, 0.02], [0.30, 0.036], [0.16, 0.032], [0.12, 0.0], [-0.11, -0.003]];
    b.add(extrude(prof, 0.05, { bevel: 0.007, bevelSegments: 3, uvScale: 5 }), 'stockOD', { rot: [0, -Math.PI / 2, 0] });
    // barrel channel shadow (dark strip along the fore-end top)
    b.add(box(0.03, 0.004, 0.34), 'blackout', { pos: [0, -0.004, -0.28], wear: 'none' });
    // adjustable cheek riser + recoil pad + spacers
    b.add(rbox(0.052, 0.03, 0.13, 0.009, 3), 'stockOD', { pos: [0, 0.045, 0.28], wearAmt: 0.8 });
    for (const z of [0.235, 0.325]) b.add(cylY(0.004, 0.004, 0.02, 8), 'steel', { pos: [0.028, 0.032, z], wear: 'rim' }); // riser posts
    b.add(rbox(0.052, 0.14, 0.02, 0.006, 2), 'rubber', { pos: [0, -0.045, 0.45], wear: 'none' });
    b.add(rbox(0.05, 0.135, 0.008, 0.003, 1), 'polymer', { pos: [0, -0.046, 0.437], wear: 'none' }); // spacer
    // grip texture panels + palm swell
    for (const x of [-0.026, 0.026]) b.add(rbox(0.004, 0.045, 0.03, 0.001, 1), 'rubber', { pos: [x, -0.115, 0.085], rot: [-0.25, 0, 0], wear: 'none' });
    // sling studs
    for (const z of [-0.40, 0.40]) { b.add(cylY(0.0035, 0.0035, 0.012, 8), 'steel', { pos: [0, z < 0 ? -0.055 : -0.105, z], wear: 'rim' }); b.add(torus(0.007, 0.0016, 6, 14), 'steel', { pos: [0, z < 0 ? -0.066 : -0.116, z], wear: 'all', wearAmt: 0.5 }); }
  }
  // ---------- BIPOD (Harris, folded forward under the fore-end) ----------
  b.add(rbox(0.042, 0.022, 0.05, 0.004, 2), 'metal', { pos: [0, -0.062, -0.40], wearAmt: 1.2 }); // mount / hinge block
  b.add(cylX(0.006, 0.006, 0.046, 10), 'steel', { pos: [0, -0.062, -0.415], wear: 'rim' }); // hinge pin
  for (const sx of [-1, 1]) {
    b.add(cylZ(0.0055, 0.0065, 0.17, 10), 'metal', { pos: [sx * 0.02, -0.066, -0.505], rot: [0, sx * 0.05, 0], wear: 'rim', wearAmt: 1.1 }); // upper leg
    b.add(cylZ(0.0045, 0.0045, 0.12, 8), 'steel', { pos: [sx * 0.024, -0.066, -0.60], rot: [0, sx * 0.05, 0], wear: 'rim', wearAmt: 0.8 }); // extension
    b.add(cylZ(0.008, 0.007, 0.018, 10), 'rubber', { pos: [sx * 0.026, -0.066, -0.66], wear: 'none' }); // foot
    b.add(rbox(0.006, 0.014, 0.04, 0.001, 1), 'rubber', { pos: [sx * 0.024, -0.058, -0.44], wear: 'none' }); // spring / leg latch
  }

  // ---------- TRIGGER GUARD + TRIGGER ----------
  {
    const path = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.055, 0.0), new THREE.Vector3(0, -0.084, 0.01), new THREE.Vector3(0, -0.09, 0.035), new THREE.Vector3(0, -0.082, 0.058), new THREE.Vector3(0, -0.06, 0.065)]);
    b.add(new THREE.TubeGeometry(path, 12, 0.003, 8, false), 'metal', { wear: 'all', wearAmt: 0.2 });
    b.add(rbox(0.03, 0.012, 0.13, 0.003, 1), 'metal', { pos: [0, -0.06, 0.0], wearAmt: 1.1 }); // bottom metal
    const tb = new Builder(); tb.add(rbox(0.006, 0.024, 0.005, 0.0015, 1), 'steel', { pos: [0, -0.012, 0], rot: [0.2, 0, 0], wearAmt: 1.5 });
    parts.trigger = tb.build(mats, 'trigger'); parts.trigger.position.set(0, -0.062, 0.028); group.add(parts.trigger);
  }
  // ---------- MAGAZINE (AICS-style 5-round steel box, animated) ----------
  {
    const mb = new Builder();
    mb.add(rbox(0.027, 0.062, 0.085, 0.003, 2), 'steel', { pos: [0, -0.092, -0.03], rot: [0.06, 0, 0], wearAmt: 0.9 });
    mb.add(rbox(0.03, 0.008, 0.09, 0.002, 1), 'polymer', { pos: [0, -0.124, -0.028], rot: [0.06, 0, 0], wearAmt: 1.2 }); // floor plate
    for (let i = 0; i < 3; i++) mb.add(box(0.028, 0.002, 0.07), 'rubber', { pos: [0, -0.075 - i * 0.014, -0.03], wear: 'none' }); // witness ribs
    parts.mag = mb.build(mats, 'mag'); group.add(parts.mag); parts.mag.userData.home = new THREE.Vector3(0, 0, 0);
  }
  // ---------- BOLT (body + handle, animated) ----------
  {
    const bb = new Builder();
    bb.add(cylZ(0.0105, 0.0105, 0.22, 16), 'steel', { pos: [0, 0, 0.0], wear: 'rim', wearAmt: 0.4 });
    parts.boltBody = bb.build(mats, 'boltBody'); parts.boltBody.position.set(0, 0.0, 0.01); parts.boltBody.userData.home = parts.boltBody.position.clone();
    parts.boltBody.children[0].material = mats.brass.clone(); parts.boltBody.children[0].material.color.set(0x8f9298); parts.boltBody.children[0].material.roughness = 0.22; // polished bolt
    group.add(parts.boltBody);
    const hb = new Builder();
    // root on the bolt, shaft sweeping right-down-back, ball knob
    hb.add(cylZ(0.013, 0.013, 0.02, 12), 'steel', { pos: [0, 0, 0], wear: 'rim', wearAmt: 1.2 });
    {
      const path = new THREE.CatmullRomCurve3([new THREE.Vector3(0.008, 0, 0.0), new THREE.Vector3(0.024, -0.012, 0.006), new THREE.Vector3(0.036, -0.03, 0.012)]);
      hb.add(new THREE.TubeGeometry(path, 8, 0.0042, 10, false), 'steel', { wear: 'all', wearAmt: 0.35 });
    }
    hb.add(sphere(0.0115, 16), 'steel', { pos: [0.04, -0.036, 0.014], wear: 'all', wearAmt: 0.5 });
    parts.boltHandle = hb.build(mats, 'boltHandle'); parts.boltHandle.position.set(0, 0, 0.078); parts.boltHandle.userData.home = parts.boltHandle.position.clone();
    parts.boltHandle.userData.travel = 0.085; parts.boltHandle.userData.liftAngle = 1.15; parts.boltHandle.userData.grip = [0.04, -0.045, 0.10];
    group.add(parts.boltHandle);
  }

  // ---------- SCOPE (Mk4 10x40 on a rail, two rings) ----------
  addRail(b, 'metal', 0.16, 0.021, { pos: [0, 0.0175, -0.01] });
  for (const z of [-0.055, 0.035]) {
    b.add(rbox(0.032, 0.022, 0.016, 0.003, 2), 'metal', { pos: [0, 0.036, z] }); // ring base
    b.add(cylZ(0.0185, 0.0185, 0.016, 24, true), 'metal', { pos: [0, scopeY, z], wear: 'rim', wearAmt: 0.9 }); // ring
    b.add(cylX(0.004, 0.004, 0.02, 8), 'steel', { pos: [0.014, scopeY + 0.014, z], wear: 'rim' }); // ring screws
    b.add(cylX(0.004, 0.004, 0.02, 8), 'steel', { pos: [0.014, scopeY - 0.012, z], wear: 'rim' });
    b.add(cylX(0.005, 0.005, 0.012, 8), 'steel', { pos: [0.018, 0.03, z], wear: 'rim' }); // clamp nut
  }
  b.add(cylZ(0.0152, 0.0152, 0.17, 24), 'metal', { pos: [0, scopeY, -0.02], wear: 'rim', wearAmt: 0.5 }); // main tube
  b.add(lathe([[0, 0], [0.0152, 0], [0.026, 0.03], [0.028, 0.06], [0.028, 0.095], [0.0255, 0.1], [0, 0.1]], 28).rotateX(-Math.PI / 2), 'metal', { pos: [0, scopeY, -0.105], wear: 'rim', wearAmt: 0.6 }); // objective bell (forward)
  b.add(lathe([[0, 0], [0.0152, 0], [0.019, 0.02], [0.021, 0.06], [0.0225, 0.075], [0.021, 0.082], [0, 0.082]], 28).rotateX(Math.PI / 2), 'metal', { pos: [0, scopeY, 0.065], wear: 'rim', wearAmt: 0.6 }); // ocular bell (rearward)
  b.add(torus(0.022, 0.0025, 8, 28), 'rubber', { pos: [0, scopeY, 0.147], wear: 'none' }); // eyepiece rubber ring
  b.add(cylZ(0.021, 0.021, 0.045, 24), 'metal', { pos: [0, scopeY, -0.02], wear: 'rim', wearAmt: 0.8 }); // turret saddle
  b.add(cylY(0.0125, 0.0125, 0.02, 16), 'metal', { pos: [0, scopeY + 0.03, -0.02], wear: 'rim', wearAmt: 1.3 }); // elevation turret
  b.add(cylX(0.0125, 0.0125, 0.02, 16), 'metal', { pos: [0.03, scopeY, -0.02], wear: 'rim', wearAmt: 1.3 }); // windage turret
  b.add(cylX(0.011, 0.011, 0.016, 16), 'metal', { pos: [-0.028, scopeY, -0.02], wear: 'rim', wearAmt: 1.3 }); // parallax/illumination
  for (const [y, x] of [[scopeY + 0.041, 0], [scopeY, 0.041]]) b.add(x ? cylX(0.006, 0.006, 0.004, 10) : cylY(0.006, 0.006, 0.004, 10), 'rubber', { pos: [x, y, -0.02], wear: 'none' }); // turret caps
  b.add(cylZ(0.0175, 0.0175, 0.02, 18), 'metal', { pos: [0, scopeY, 0.06], wear: 'rim', wearAmt: 1.0 }); // magnification ring (fixed 10x — knurled band)
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; b.add(box(0.002, 0.004, 0.02), 'rubber', { pos: [Math.cos(a) * 0.0185, scopeY + Math.sin(a) * 0.0185, 0.06], rot: [0, 0, a], wear: 'none' }); }
  // flip-up objective cap (open, standing up above the bell)
  b.add(cylZ(0.029, 0.029, 0.004, 24), 'polymer', { pos: [0, scopeY + 0.035, -0.205], rot: [Math.PI / 2 - 0.35, 0, 0], wearAmt: 1.0 });
  b.add(cylX(0.004, 0.004, 0.014, 8), 'steel', { pos: [0, scopeY + 0.027, -0.205], wear: 'rim' }); // cap hinge
  b.add(cylZ(0.0265, 0.0265, 0.09, 24, true), 'blackout', { pos: [0, scopeY, -0.16], wear: 'none' }); // inner black bore of the bell
  b.add(cylZ(0.019, 0.019, 0.07, 20, true), 'blackout', { pos: [0, scopeY, 0.11], wear: 'none' });
  {
    const lensF = new THREE.Mesh(new THREE.CircleGeometry(0.0265, 32), mats.lens); lensF.position.set(0, scopeY, -0.204); lensF.renderOrder = 20; group.add(lensF);
    const lensR = new THREE.Mesh(new THREE.CircleGeometry(0.0195, 32), mats.lens); lensR.position.set(0, scopeY, 0.146); lensR.rotation.y = Math.PI; lensR.renderOrder = 21; group.add(lensR);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.0145, 24), new THREE.MeshBasicMaterial({ color: 0x050708 })); inner.position.set(0, scopeY, -0.05); group.add(inner); // deep black behind the objective
    parts.lensF = lensF; parts.lensR = lensR;
  }

  parts.sight = new THREE.Object3D(); parts.sight.position.set(0, scopeY, 0.08); group.add(parts.sight);
  parts.muzzle = new THREE.Object3D(); parts.muzzle.position.set(0, 0, -0.75); group.add(parts.muzzle);
  parts.eject = new THREE.Object3D(); parts.eject.position.set(0.02, 0.012, -0.03); group.add(parts.eject);

  parts.body = b.build(mats, 'sniperBody'); group.add(parts.body);

  // ---------- ARMS ----------
  const right = buildArm('right', { curl: [0.7, 0.2, 0.9, 0.95, 1.0], spread: 0.05, thumbUp: 1.1, forearmLen: 0.32 }, (hand, fore) => {
    hand.position.set(0.037, -0.095, 0.10);
    orient(hand, [0, -1, 0.22], [-0.15, 0, -1]);
    fore.position.copy(hand.position); fore.lookAt(0.13, -0.30, 0.44); fore.rotateX(Math.PI / 2);
  }, mats);
  group.add(right); parts.armR = right;
  const left = buildArm('left', { curl: [0.45, 0.7, 0.85, 0.9, 0.95], spread: 0.03, thumbUp: 0.6, forearmLen: 0.32 }, (hand, fore) => {
    hand.position.set(-0.058, -0.016, -0.30);
    orient(hand, [0, 0, -1], [0.6, -0.8, 0]);
    fore.position.copy(hand.position); fore.lookAt(-0.22, -0.37, -0.15); fore.rotateX(Math.PI / 2);
  }, mats);
  group.add(left); parts.armL = left;

  group.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = true; } });
  return { group, parts, spec: SNIPER_SPEC };
}
