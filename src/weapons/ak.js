// Procedural AK-74M-class rifle viewmodel (bore = -Z, +Y up, +X right; meters). Owned by: WEAPONS agent.
import * as THREE from 'three';
import { Builder, rbox, box, cylZ, cylY, cylX, torus, extrude, lathe, sphere } from './geo.js';
import { buildArm, supportGrip } from './arms.js';
import { orient } from './rifle.js';

export const AK_SPEC = {
  id: 'ak74', name: 'AK-74M', class: 'AR', slot: 0, mode: 'AUTO',
  desc: '5.45 Kalashnikov. Hits harder than the M4 and shrugs off anything, but the recoil climbs and the irons are crude.',
  mag: 30, reserve: 150, rpm: 600, auto: true, damage: 40, headMul: 2.0, range: 220, falloff: [45, 180, 0.6],
  reloadStyle: 'mag', reloadKeys: { magGrab: [-0.02, -0.17, -0.03], down: [-0.1, -0.42, 0.06], rack: [0.02, 0.03, 0.0], tiltK: 1.1 },
  hipSpread: 1.9, adsSpread: 0.16, spreadPerShot: 0.6, spreadMax: 7, moveSpread: 2.0,
  recoilPitch: 0.5, recoilYaw: 0.2, recoilRecover: 1.0, kickBack: 0.04, kickUp: 0.08, kickRoll: 0.045,
  reloadTime: 2.4, reloadTimeTac: 2.0, swapTime: 0.45,
  // ADS: cheek on the stock comb (~0.28 m behind the rear leaf), world fov 55 at the default 75, viewmodel drawn at a steady ~40° so the irons don't balloon
  adsTime: 0.18, adsDist: 0.28, adsFovMul: 55 / 75, adsVmFov: 36,
  flashSize: 0.17, flashStrength: 1.15, brassScale: 1,
  hip: { pos: [0.088, -0.105, -0.27], rot: [0.0, 0.05, 0.01] },
  sprint: { pos: [0.16, -0.16, -0.30], rot: [-0.25, 0.75, 0.35] },
  lower: { pos: [0.12, -0.36, -0.28], rot: [-0.9, 0.35, 0.2] },
  stats: { damage: 40, rpm: 600, range: 220, mag: 30, mobility: 64, accuracy: 60 },
};

function akMagGeometry() {
  const N = 9, top = -0.03, bottom = -0.225, backZ = 0.012, frontZ = -0.05; const curve = (t) => -0.105 * t * t;
  const pts = [];
  for (let i = 0; i <= N; i++) { const t = i / N; pts.push([backZ + curve(t) * 0.9, top + (bottom - top) * t]); }
  for (let i = N; i >= 0; i--) { const t = i / N; pts.push([frontZ + curve(t), top + (bottom - top) * t + (i === N ? 0.005 : 0)]); }
  const g = extrude(pts, 0.03, { bevel: 0.003, bevelSegments: 2, uvScale: 10 }); g.rotateY(-Math.PI / 2); return g;
}

export function buildAk(mats) {
  const b = new Builder();
  const group = new THREE.Group(); group.name = 'ak';
  const parts = {};
  const sightY = 0.052, gasY = 0.03;

  // ---------- RECEIVER (stamped, with a rounded dust cover) ----------
  b.add(rbox(0.04, 0.05, 0.22, 0.004, 2), 'metal', { pos: [0, -0.004, 0.02] });
  b.add(rbox(0.038, 0.014, 0.19, 0.005, 2), 'metal', { pos: [0, 0.026, 0.0], wearAmt: 1.3 }); // dust cover
  for (let i = 0; i < 5; i++) b.add(rbox(0.036, 0.002, 0.003, 0.0005, 1), 'metal', { pos: [0, 0.034, -0.06 + i * 0.03], wear: 'all', wearAmt: 0.4 }); // cover ribs
  b.add(rbox(0.006, 0.02, 0.06, 0.0015, 1), 'steel', { pos: [-0.021, -0.005, 0.045], wearAmt: 1.6 }); // left rail dimple / side-mount rail
  b.add(box(0.004, 0.014, 0.05), 'blackout', { pos: [0.02, 0.012, -0.03], wear: 'none' }); // ejection port
  // selector lever (right, long flat lever) + axis
  b.add(rbox(0.004, 0.008, 0.075, 0.001, 1), 'steel', { pos: [0.023, -0.002, 0.045], rot: [0.55, 0, 0], wearAmt: 1.6 });
  b.add(cylX(0.006, 0.006, 0.006, 10), 'steel', { pos: [0.023, 0.012, 0.075], wear: 'rim' });
  // rear sight block + leaf
  b.add(rbox(0.03, 0.02, 0.03, 0.003, 1), 'steel', { pos: [0, 0.035, -0.095], wearAmt: 1.3 });
  // leaf with a real U-notch. Sight picture = post tip level with the TOP of the notch ears, centred in the gap, so the sight line
  // (sightY) runs across the ear tops; notch bottom is 4 mm lower so ~9 mm of the post shows inside the 4.6 mm gap.
  b.add(rbox(0.02, 0.008, 0.004, 0.0008, 1), 'steel', { pos: [0, sightY - 0.008, -0.10], wearAmt: 1.4 }); // leaf bar (top = notch bottom)
  for (const x of [-0.0061, 0.0061]) b.add(rbox(0.0076, 0.0042, 0.004, 0.0006, 1), 'steel', { pos: [x, sightY - 0.0021, -0.10], wearAmt: 1.4 }); // notch ears (tops at sightY)
  b.add(rbox(0.006, 0.006, 0.022, 0.001, 1), 'steel', { pos: [0, 0.041, -0.082], wearAmt: 1.3 }); // range slider
  // trunnion / pins
  for (const z of [0.09, -0.06]) b.add(cylX(0.0045, 0.0045, 0.044, 8), 'steel', { pos: [0, -0.012, z], wear: 'rim', wearAmt: 1.5 });

  // ---------- BOLT CARRIER (visible charging knob on the right, animated) ----------
  {
    const cb = new Builder();
    cb.add(rbox(0.012, 0.014, 0.05, 0.002, 1), 'steel', { pos: [0, 0, 0], wearAmt: 1.2 });
    cb.add(rbox(0.014, 0.012, 0.02, 0.003, 1), 'steel', { pos: [0.014, 0.0, 0.0], wearAmt: 1.6 }); // charging knob
    parts.bolt = cb.build(mats, 'bolt'); parts.bolt.position.set(0.013, 0.012, -0.02); group.add(parts.bolt);
  }
  // ---------- GAS TUBE + BLOCK, BARREL, FRONT SIGHT, BRAKE ----------
  b.add(cylZ(0.0085, 0.0085, 0.22, 14), 'steel', { pos: [0, gasY, -0.22], wear: 'rim', wearAmt: 1.0 }); // gas tube
  b.add(rbox(0.024, 0.036, 0.03, 0.003, 1), 'steel', { pos: [0, 0.014, -0.345], wearAmt: 1.3 }); // gas block
  b.add(cylZ(0.0095, 0.0105, 0.44, 16), 'steel', { pos: [0, 0, -0.32], wear: 'rim', wearAmt: 0.7 }); // barrel
  b.add(cylZ(0.0032, 0.0032, 0.36, 8), 'steel', { pos: [0, -0.016, -0.30], wear: 'rim', wearAmt: 1.5 }); // cleaning rod
  b.add(rbox(0.022, 0.03, 0.026, 0.003, 1), 'steel', { pos: [0, 0.012, -0.45], wearAmt: 1.3 }); // front sight base
  b.add(rbox(0.004, 0.03, 0.0035, 0.0005, 1), 'steel', { pos: [0, sightY - 0.015, -0.45], wearAmt: 1.2 }); // post (tip exactly at sightY: sits in the notch bottom)
  for (const x of [-0.011, 0.011]) b.add(cylZ(0.003, 0.003, 0.02, 8), 'steel', { pos: [x, sightY - 0.002, -0.45], rot: [0, 0, 0], wear: 'rim', wearAmt: 1.3 }); // ears (uprights)
  for (const x of [-0.011, 0.011]) b.add(rbox(0.006, 0.026, 0.008, 0.002, 1), 'steel', { pos: [x, 0.04, -0.45], wearAmt: 1.3 });
  b.add(torus(0.011, 0.0025, 6, 16, Math.PI), 'steel', { pos: [0, sightY - 0.004, -0.45], wear: 'all', wearAmt: 0.4 }); // hood arc
  // 74-style muzzle brake: chamber body with a slanted front, side slots, expansion port
  b.add(cylZ(0.0125, 0.0125, 0.076, 16), 'steel', { pos: [0, 0, -0.51], wear: 'rim', wearAmt: 1.3 });
  b.add(cylZ(0.0145, 0.0145, 0.02, 16), 'steel', { pos: [0, 0, -0.525], wear: 'rim', wearAmt: 1.3 });
  for (const x of [-0.013, 0.013]) b.add(box(0.003, 0.012, 0.03), 'blackout', { pos: [x, 0.0, -0.53], wear: 'none' }); // slots
  for (let i = 0; i < 3; i++) b.add(cylY(0.0025, 0.0025, 0.03, 8), 'blackout', { pos: [0, 0, -0.50 - i * 0.013], wear: 'none' }); // top vents
  b.add(cylZ(0.007, 0.007, 0.004, 12), 'blackout', { pos: [0, 0, -0.549], wear: 'none' }); // bore
  // ---------- FURNITURE (plum bakelite): upper + lower handguard with ribs ----------
  b.add(rbox(0.036, 0.028, 0.16, 0.007, 3), 'bakelite', { pos: [0, gasY + 0.002, -0.215] }); // upper
  b.add(extrude([[-0.021, -0.036], [0.021, -0.036], [0.024, 0.0], [0.02, 0.01], [-0.02, 0.01], [-0.024, 0.0]], 0.19, { bevel: 0.005, bevelSegments: 3, uvScale: 6 }), 'bakelite', { pos: [0, -0.008, -0.21] }); // lower (palm swell)
  for (const x of [-0.0235, 0.0235]) for (let i = 0; i < 4; i++) b.add(rbox(0.003, 0.022, 0.008, 0.001, 1), 'bakelite', { pos: [x, -0.02, -0.26 + i * 0.03], wearAmt: 1.6 }); // ribs
  b.add(rbox(0.04, 0.05, 0.014, 0.003, 1), 'steel', { pos: [0, -0.005, -0.113], wearAmt: 1.3 }); // handguard retainer / trunnion
  b.add(rbox(0.036, 0.04, 0.012, 0.003, 1), 'steel', { pos: [0, -0.008, -0.31], wearAmt: 1.3 }); // front retainer
  b.add(torus(0.007, 0.0016, 6, 14), 'steel', { pos: [-0.02, -0.018, -0.31], rot: [0, Math.PI / 2, 0], wear: 'all', wearAmt: 0.5 }); // sling loop
  // ---------- PISTOL GRIP + TRIGGER GUARD + TRIGGER ----------
  b.add(rbox(0.03, 0.10, 0.038, 0.008, 3), 'bakelite', { pos: [0, -0.085, 0.10], rot: [-0.3, 0, 0] });
  b.add(rbox(0.031, 0.01, 0.04, 0.003, 1), 'bakelite', { pos: [0, -0.134, 0.118], rot: [-0.3, 0, 0], wearAmt: 1.3 });
  for (let i = 0; i < 4; i++) b.add(rbox(0.032, 0.005, 0.034, 0.001, 1), 'rubber', { pos: [0, -0.06 - i * 0.02, 0.092 + i * 0.006], rot: [-0.3, 0, 0], wear: 'none' }); // grip grooves
  {
    const path = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.03, 0.0), new THREE.Vector3(0, -0.062, 0.005), new THREE.Vector3(0, -0.07, 0.035), new THREE.Vector3(0, -0.064, 0.065), new THREE.Vector3(0, -0.04, 0.08)]);
    b.add(new THREE.TubeGeometry(path, 12, 0.0028, 8, false), 'steel', { wear: 'all', wearAmt: 0.25 });
    b.add(rbox(0.03, 0.006, 0.08, 0.002, 1), 'steel', { pos: [0, -0.03, 0.045], wearAmt: 1.2 }); // trigger guard plate
    const tb = new Builder(); tb.add(rbox(0.006, 0.024, 0.005, 0.0015, 1), 'steel', { pos: [0, -0.012, 0], rot: [0.2, 0, 0], wearAmt: 1.5 });
    parts.trigger = tb.build(mats, 'trigger'); parts.trigger.position.set(0, -0.034, 0.03); group.add(parts.trigger);
  }
  // mag release paddle + magwell lips
  b.add(rbox(0.012, 0.016, 0.016, 0.002, 1), 'steel', { pos: [0, -0.036, -0.005], rot: [0.4, 0, 0], wearAmt: 1.5 });
  // ---------- MAGAZINE (plum bakelite 30-rd, animated) ----------
  {
    const mb = new Builder();
    mb.add(akMagGeometry(), 'bakelite', { wear: 'box', wearAmt: 0.9 });
    for (let i = 0; i < 7; i++) { const t = i / 7; mb.add(rbox(0.032, 0.004, 0.056, 0.001, 1), 'bakelite', { pos: [0, -0.05 - t * 0.16, -0.02 - 0.095 * t * t], rot: [0.75 * t, 0, 0], wearAmt: 1.3 }); }
    mb.add(rbox(0.032, 0.008, 0.07, 0.002, 1), 'steel', { pos: [0, -0.226, -0.125], rot: [0.75, 0, 0], wearAmt: 1.2 }); // floor plate
    parts.mag = mb.build(mats, 'mag'); group.add(parts.mag); parts.mag.userData.home = new THREE.Vector3(0, 0, 0);
  }
  // ---------- SIDE-FOLDING STOCK (polymer, extended) ----------
  b.add(rbox(0.036, 0.048, 0.03, 0.005, 2), 'steel', { pos: [0, -0.006, 0.14], wearAmt: 1.3 }); // hinge block
  b.add(cylY(0.005, 0.005, 0.05, 10), 'steel', { pos: [-0.012, -0.006, 0.148], wear: 'rim' }); // hinge pin
  b.add(extrude([[0.155, 0.02], [0.40, 0.018], [0.41, -0.005], [0.412, -0.065], [0.36, -0.06], [0.155, -0.032]], 0.03, { bevel: 0.005, bevelSegments: 3, uvScale: 6 }), 'polymer', { rot: [0, -Math.PI / 2, 0] });
  b.add(rbox(0.034, 0.088, 0.014, 0.005, 2), 'rubber', { pos: [0, -0.024, 0.418], wear: 'none' }); // buttpad
  for (let i = 0; i < 3; i++) b.add(box(0.032, 0.02, 0.012), 'blackout', { pos: [0, -0.02, 0.22 + i * 0.05], wear: 'none' }); // lightening cutouts
  b.add(torus(0.007, 0.0016, 6, 14), 'steel', { pos: [-0.017, -0.045, 0.38], rot: [0, Math.PI / 2, 0], wear: 'all', wearAmt: 0.5 }); // rear sling loop

  parts.sight = new THREE.Object3D(); parts.sight.position.set(0, sightY, -0.10); group.add(parts.sight);
  parts.sightFront = new THREE.Object3D(); parts.sightFront.position.set(0, sightY, -0.45); group.add(parts.sightFront); // front post tip (QA: sight-line check)
  parts.muzzle = new THREE.Object3D(); parts.muzzle.position.set(0, 0, -0.551); group.add(parts.muzzle);
  parts.eject = new THREE.Object3D(); parts.eject.position.set(0.024, 0.014, -0.03); group.add(parts.eject);

  parts.body = b.build(mats, 'akBody'); group.add(parts.body);

  // ---------- ARMS ----------
  const right = buildArm('right', { curl: [0.7, 0.2, 0.9, 0.95, 1.0], spread: 0.05, thumbUp: 1.1, forearmLen: 0.32 }, (hand, fore) => {
    hand.position.set(0.036, -0.08, 0.12);
    orient(hand, [0, -1, 0.3], [-0.15, 0, -1]);
    fore.position.copy(hand.position); fore.lookAt(0.13, -0.28, 0.45); fore.rotateX(Math.PI / 2);
  }, mats);
  group.add(right); parts.armR = right;
  const left = buildArm('left', { curl: [0.9, 0.72, 0.8, 0.86, 0.9], spread: 0.02, thumbUp: 0.15, forearmLen: 0.3, scale: 1.1, keepFore: true }, (hand, fore) => {
    supportGrip(hand, fore, [0, 0.004, -0.235], 0.03);
  }, mats);
  group.add(left); parts.armL = left;

  group.traverse(o => { if (o.isMesh) { o.frustumCulled = false; if (!/^arm_/.test(o.parent?.name || '')) o.castShadow = false; o.receiveShadow = true; } });
  return { group, parts, spec: AK_SPEC };
}
