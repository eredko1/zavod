// Procedural Remington 870-class pump shotgun viewmodel (bore = -Z, +Y up, +X right; meters). Owned by: WEAPONS agent.
import * as THREE from 'three';
import { Builder, rbox, box, cylZ, cylY, cylX, torus, extrude, lathe, sphere } from './geo.js';
import { buildArm } from './arms.js';
import { orient } from './rifle.js';

export const SHOTGUN_SPEC = {
  id: 'r870', name: 'R870', class: 'Shotgun', slot: 0, mode: 'PUMP',
  desc: '12 ga pump-action. Devastating inside 12 m, useless past 30. Tube-fed, shell by shell.',
  mag: 6, reserve: 36, rpm: 75, auto: false, damage: 13, headMul: 1.6, range: 30, pellets: 8, pelletSpread: 2.6, falloff: [12, 30, 0],
  action: 'pump', actionTime: 0.8, actionDelay: 0.12,
  reloadStyle: 'shell', shellTime: 0.52, reloadStart: 0.35, reloadEnd: 0.32,
  hipSpread: 1.2, adsSpread: 0.4, spreadPerShot: 0.2, spreadMax: 3, moveSpread: 1.0,
  recoilPitch: 2.4, recoilYaw: 0.7, kickBack: 0.11, kickUp: 0.22, kickRoll: 0.08,
  reloadTime: 3.5, reloadTimeTac: 3.5, swapTime: 0.5, adsTime: 0.26, adsDist: 0.26, adsFovMul: 0.8,
  flashSize: 0.21, flashStrength: 1.8, brassScale: 1.7,
  hip: { pos: [0.085, -0.105, -0.25], rot: [0.0, 0.05, 0.01] },
  sprint: { pos: [0.16, -0.17, -0.30], rot: [-0.25, 0.75, 0.35] },
  lower: { pos: [0.12, -0.36, -0.28], rot: [-0.9, 0.35, 0.2] },
  stats: { damage: 100, rpm: 75, range: 30, mag: 6, mobility: 72, accuracy: 30 },
};

/** A 12 ga shell: red hull + brass head, axis along -Z (crimp forward). */
export function addShell(b, pos, rot = [0, 0, 0]) {
  b.add(cylZ(0.0095, 0.0095, 0.046, 12), 'shellRed', { pos: [pos[0], pos[1], pos[2] - 0.008], rot, wear: 'rim', wearAmt: 0.6 });
  b.add(cylZ(0.0105, 0.0105, 0.014, 12), 'brass', { pos: [pos[0], pos[1], pos[2] + 0.022], rot, wear: 'none' });
  b.add(cylZ(0.0075, 0.0095, 0.004, 12), 'shellRed', { pos: [pos[0], pos[1], pos[2] - 0.033], rot, wear: 'none' }); // star crimp
}

export function buildShotgun(mats) {
  const b = new Builder();
  const group = new THREE.Group(); group.name = 'shotgun';
  const parts = {};
  const boreY = 0.022, tubeY = -0.012;

  // ---------- RECEIVER (milled steel block, rounded top) ----------
  b.add(rbox(0.04, 0.056, 0.215, 0.006, 3), 'blued', { pos: [0, 0.0, 0.0] });
  b.add(cylZ(0.02, 0.02, 0.215, 16), 'blued', { pos: [0, 0.02, 0.0], wear: 'rim', wearAmt: 0.6 }); // rounded top
  b.add(rbox(0.036, 0.02, 0.19, 0.003, 1), 'blued', { pos: [0, -0.034, 0.0] }); // lower receiver lip
  // ejection port (right) — dark recess with bright worn edge
  b.add(box(0.004, 0.02, 0.058), 'blackout', { pos: [0.019, 0.006, -0.03], wear: 'none' });
  b.add(rbox(0.003, 0.024, 0.062, 0.0008, 1), 'steel', { pos: [0.0195, 0.006, -0.03], wear: 'all', wearAmt: 0.25 });
  // loading port (bottom, in front of the trigger guard)
  b.add(box(0.018, 0.004, 0.05), 'blackout', { pos: [0, -0.043, -0.045], wear: 'none' });
  // top: ghost-ring rail base + rear ghost ring
  b.add(rbox(0.024, 0.006, 0.12, 0.0015, 1), 'metal', { pos: [0, 0.043, 0.0], wearAmt: 1.3 });
  b.add(rbox(0.014, 0.016, 0.01, 0.002, 1), 'steel', { pos: [0, 0.052, 0.05], wearAmt: 1.3 }); // ring base
  b.add(torus(0.007, 0.0016, 6, 18), 'steel', { pos: [0, 0.066, 0.05], wear: 'all', wearAmt: 0.3 }); // ghost ring
  b.add(rbox(0.026, 0.004, 0.008, 0.001, 1), 'steel', { pos: [0, 0.058, 0.05], wearAmt: 1.2 }); // wing protectors base
  // safety button (behind trigger), pins
  b.add(cylX(0.004, 0.004, 0.036, 10), 'steel', { pos: [0, -0.02, 0.085], wear: 'rim', wearAmt: 1.4 });
  for (const z of [0.07, -0.06]) b.add(cylX(0.0035, 0.0035, 0.042, 8), 'steel', { pos: [0, 0.0, z], wear: 'rim', wearAmt: 1.5 });
  // action release (left, in front of trigger guard)
  b.add(rbox(0.005, 0.006, 0.02, 0.001, 1), 'steel', { pos: [-0.016, -0.044, 0.005], wearAmt: 1.5 });

  // ---------- SIDE SADDLE (left side, 6 shells) ----------
  b.add(rbox(0.006, 0.05, 0.19, 0.0015, 1), 'polymer', { pos: [-0.024, 0.0, -0.005], wearAmt: 1.1 });
  for (let i = 0; i < 6; i++) { const z = -0.085 + i * 0.032; addShell(b, [-0.036, -0.004 + (i % 2) * 0.004, z + 0.003], [0, 0, 0]); }

  // ---------- TRIGGER GUARD (polymer) + TRIGGER ----------
  {
    const path = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.04, -0.005), new THREE.Vector3(0, -0.075, 0.008), new THREE.Vector3(0, -0.082, 0.04), new THREE.Vector3(0, -0.076, 0.07), new THREE.Vector3(0, -0.045, 0.085)]);
    b.add(new THREE.TubeGeometry(path, 12, 0.0032, 8, false), 'polymer', { wear: 'all', wearAmt: 0.15 });
    b.add(rbox(0.024, 0.02, 0.1, 0.004, 2), 'polymer', { pos: [0, -0.044, 0.04] }); // trigger plate housing
    const tb = new Builder();
    tb.add(rbox(0.006, 0.026, 0.005, 0.0015, 1), 'steel', { pos: [0, -0.013, 0], rot: [0.2, 0, 0], wearAmt: 1.5 });
    parts.trigger = tb.build(mats, 'trigger'); parts.trigger.position.set(0, -0.046, 0.03); group.add(parts.trigger);
  }

  // ---------- BARREL (18.5") + MAG TUBE ----------
  b.add(cylZ(0.0105, 0.012, 0.485, 18), 'blued', { pos: [0, boreY, -0.35], wear: 'rim', wearAmt: 0.5 });
  b.add(cylZ(0.0135, 0.0135, 0.03, 18), 'blued', { pos: [0, boreY, -0.12], wear: 'rim', wearAmt: 1.2 }); // barrel/receiver collar
  b.add(cylZ(0.0115, 0.0115, 0.02, 18), 'blued', { pos: [0, boreY, -0.582], wear: 'rim', wearAmt: 1.3 }); // muzzle band
  b.add(cylZ(0.0085, 0.0085, 0.004, 14), 'blackout', { pos: [0, boreY, -0.593], wear: 'none' }); // bore
  // front sight: ramp + brass bead (aligned with the ghost ring at y=0.066)
  b.add(extrude([[-0.03, 0.03], [0.012, 0.03], [0.012, 0.044], [-0.006, 0.044]], 0.006, { bevel: 0.0008, uvScale: 20 }), 'steel', { pos: [0, 0, -0.565], rot: [0, -Math.PI / 2, 0], wearAmt: 1.3 });
  b.add(sphere(0.0025, 10), 'brass', { pos: [0, 0.0645, -0.571], wear: 'none' });
  // magazine tube (4+1 tube with extension) + cap/lug
  b.add(cylZ(0.0125, 0.0125, 0.33, 18), 'blued', { pos: [0, tubeY, -0.27], wear: 'rim', wearAmt: 0.8 });
  b.add(cylZ(0.0145, 0.0135, 0.022, 18), 'steel', { pos: [0, tubeY, -0.446], wear: 'rim', wearAmt: 1.4 }); // extension cap
  b.add(torus(0.006, 0.0016, 6, 14), 'steel', { pos: [-0.019, tubeY, -0.446], rot: [0, Math.PI / 2, 0], wear: 'all', wearAmt: 0.5 }); // sling swivel
  // barrel clamp joining barrel & tube near the muzzle
  b.add(rbox(0.03, 0.05, 0.016, 0.003, 2), 'steel', { pos: [0, (boreY + tubeY) / 2, -0.43], wearAmt: 1.3 });
  b.add(cylX(0.003, 0.003, 0.034, 8), 'steel', { pos: [0, (boreY + tubeY) / 2, -0.43], wear: 'rim' }); // clamp screw

  // ---------- STOCK (synthetic, classic profile with a raked wrist) ----------
  {
    // side profile in (z, y): receiver rear → wrist → comb → butt
    const prof = [[0.107, 0.028], [0.15, 0.024], [0.26, 0.026], [0.40, 0.02], [0.415, -0.02], [0.418, -0.11], [0.36, -0.108], [0.30, -0.075], [0.22, -0.05], [0.16, -0.045], [0.125, -0.05], [0.107, -0.04]];
    b.add(extrude(prof.map(p => [p[0], p[1]]), 0.038, { bevel: 0.007, bevelSegments: 3, uvScale: 6 }), 'polymer', { rot: [0, -Math.PI / 2, 0] });
    // wrist checkering panels + recoil pad + sling stud
    for (const x of [-0.0225, 0.0225]) b.add(rbox(0.003, 0.028, 0.055, 0.001, 1), 'rubber', { pos: [x, -0.014, 0.17], rot: [-0.08, 0, 0], wear: 'none' });
    b.add(rbox(0.042, 0.13, 0.018, 0.006, 2), 'rubber', { pos: [0, -0.045, 0.424], rot: [0.02, 0, 0], wear: 'none' });
    b.add(cylY(0.003, 0.003, 0.01, 8), 'steel', { pos: [0, -0.104, 0.36], wear: 'rim' });
    b.add(torus(0.007, 0.0016, 6, 14), 'steel', { pos: [0, -0.114, 0.36], rot: [0, 0, 0], wear: 'all', wearAmt: 0.5 });
  }

  // ---------- PUMP FOREND (animated: slides +Z ~75 mm) ----------
  {
    const pb = new Builder();
    const L = 0.175;
    pb.add(rbox(0.046, 0.044, L, 0.012, 3), 'polymer', { pos: [0, tubeY - 0.003, 0] });
    // longitudinal ribs (raised) around the lower half + finger grooves
    for (let i = -3; i <= 3; i++) { const a = i * 0.32; const r = 0.024; pb.add(rbox(0.006, 0.004, L * 0.78, 0.0012, 1), 'polymer', { pos: [Math.sin(a) * r, tubeY - 0.003 - Math.cos(a) * r, 0.0], rot: [0, 0, -a], wearAmt: 1.4 }); }
    for (const x of [-0.024, 0.024]) for (let i = 0; i < 4; i++) pb.add(box(0.002, 0.012, 0.003), 'rubber', { pos: [x, tubeY + 0.006, -0.05 + i * 0.034], wear: 'none' });
    // front cap ring + rear ring
    pb.add(cylZ(0.0215, 0.0215, 0.008, 18), 'steel', { pos: [0, tubeY - 0.003, -L / 2 - 0.002], wear: 'rim', wearAmt: 1.2 });
    // dual action bars running back into the receiver
    for (const x of [-0.0145, 0.0145]) pb.add(rbox(0.004, 0.012, 0.26, 0.001, 1), 'steel', { pos: [x, 0.002, L / 2 + 0.08], wearAmt: 1.3 });
    parts.pump = pb.build(mats, 'pump'); parts.pump.position.set(0, 0, -0.245); parts.pump.userData.home = parts.pump.position.clone(); parts.pump.userData.travel = 0.075;
    group.add(parts.pump);
  }
  // shell carrier (feed latch) visible in the loading port — a dummy "mag" so the generic code has a target
  parts.mag = new THREE.Group(); parts.mag.userData.home = new THREE.Vector3(); group.add(parts.mag);

  parts.sight = new THREE.Object3D(); parts.sight.position.set(0, 0.066, 0.05); group.add(parts.sight);
  parts.muzzle = new THREE.Object3D(); parts.muzzle.position.set(0, boreY, -0.595); group.add(parts.muzzle);
  parts.eject = new THREE.Object3D(); parts.eject.position.set(0.024, 0.006, -0.03); group.add(parts.eject);

  parts.body = b.build(mats, 'shotgunBody'); group.add(parts.body);

  // ---------- ARMS ----------
  // right hand wraps the stock wrist (palm on the right face, thumb over the top, fingers under)
  const right = buildArm('right', { curl: [0.55, 0.25, 0.85, 0.95, 1.0], spread: 0.05, thumbUp: 1.0, forearmLen: 0.32 }, (hand, fore) => {
    hand.position.set(0.032, -0.035, 0.135);
    orient(hand, [0, -0.85, 0.53], [-0.1, -0.53, -0.85]);
    fore.position.copy(hand.position); fore.lookAt(0.13, -0.27, 0.45); fore.rotateX(Math.PI / 2);
  }, mats);
  group.add(right); parts.armR = right;
  // left hand cups the pump forend from below-left
  const left = buildArm('left', { curl: [0.5, 0.75, 0.85, 0.9, 0.95], spread: 0.03, thumbUp: 0.6, forearmLen: 0.32 }, (hand, fore) => {
    hand.position.set(-0.056, -0.004, -0.245);
    orient(hand, [0, 0, -1], [0.6, -0.8, 0]);
    fore.position.copy(hand.position); fore.lookAt(-0.22, -0.36, -0.10); fore.rotateX(Math.PI / 2);
  }, mats);
  group.add(left); parts.armL = left;
  // a loose shell carried by the left hand during reloads (hidden otherwise)
  {
    const sb = new Builder(); addShell(sb, [0, 0, 0]);
    parts.shell = sb.build(mats, 'shell'); parts.shell.visible = false; parts.shell.rotation.set(1.25, 0.15, 0.1); // base in the palm, crimp pointing up-forward into the port
    parts.shell.userData.off = new THREE.Vector3(0.012, 0.048, -0.012); // offset from the left wrist (weapon space)
    group.add(parts.shell);
  }

  group.traverse(o => { if (o.isMesh) { o.frustumCulled = false; if (!/^arm_/.test(o.parent?.name || '')) o.castShadow = false; o.receiveShadow = true; } });
  return { group, parts, spec: SHOTGUN_SPEC };
}
