// Procedural MP5A3-class SMG viewmodel (bore = -Z, +Y up, +X right; meters). Owned by: WEAPONS agent.
import * as THREE from 'three';
import { Builder, rbox, box, cylZ, cylY, cylX, torus, extrude, lathe, sphere } from './geo.js';
import { buildArm } from './arms.js';
import { orient } from './rifle.js';

export const SMG_SPEC = {
  id: 'mp5', name: 'MP5', class: 'SMG', slot: 0, mode: 'AUTO',
  desc: '9 mm roller-delayed SMG. 900 rpm, almost no recoil, snaps to the sights. Runs out of steam past 40 m.',
  mag: 30, reserve: 180, rpm: 900, auto: true, damage: 24, headMul: 1.8, range: 90, falloff: [18, 60, 0.6],
  reloadStyle: 'mag', reloadKeys: { magGrab: [-0.02, -0.17, -0.085], down: [-0.1, -0.40, 0.03], rack: [-0.035, 0.05, -0.30], tiltK: 1 },
  hipSpread: 1.3, adsSpread: 0.15, spreadPerShot: 0.32, spreadMax: 5, moveSpread: 1.1,
  recoilPitch: 0.2, recoilYaw: 0.12, kickBack: 0.018, kickUp: 0.032, kickRoll: 0.025,
  reloadTime: 1.95, reloadTimeTac: 1.55, swapTime: 0.34, adsTime: 0.15, adsDist: 0.23, adsFovMul: 0.75,
  flashSize: 0.12, flashStrength: 0.8, brassScale: 0.85,
  hip: { pos: [0.085, -0.10, -0.21], rot: [0.0, 0.05, 0.01] },
  sprint: { pos: [0.15, -0.15, -0.25], rot: [-0.25, 0.7, 0.35] },
  lower: { pos: [0.12, -0.34, -0.25], rot: [-0.9, 0.35, 0.2] },
  stats: { damage: 24, rpm: 900, range: 90, mag: 30, mobility: 92, accuracy: 66 },
};

function smgMagGeometry() {
  // curved 30-rd steel mag, side profile (z, y): straight top section then a forward sweep
  const N = 8, top = -0.052, bottom = -0.235, backZ = -0.058, frontZ = -0.094; const curve = (t) => -0.06 * t * t;
  const pts = [];
  for (let i = 0; i <= N; i++) { const t = i / N; pts.push([backZ + curve(t), top + (bottom - top) * t]); }
  for (let i = N; i >= 0; i--) { const t = i / N; pts.push([frontZ + curve(t) * 1.02, top + (bottom - top) * t + (i === N ? 0.003 : 0)]); }
  const g = extrude(pts, 0.021, { bevel: 0.002, bevelSegments: 2, uvScale: 10 }); g.rotateY(-Math.PI / 2); return g;
}

export function buildSmg(mats) {
  const b = new Builder();
  const group = new THREE.Group(); group.name = 'smg';
  const parts = {};
  const tubeY = 0.031, sightY = 0.056;

  // ---------- RECEIVER (stamped steel: box with a rounded top, shallow side ribs) ----------
  b.add(rbox(0.045, 0.04, 0.26, 0.006, 3), 'metal', { pos: [0, 0.0, -0.03] });
  b.add(cylZ(0.0225, 0.0225, 0.26, 18), 'metal', { pos: [0, 0.008, -0.03], wear: 'rim', wearAmt: 0.6 });
  for (const x of [-0.0235, 0.0235]) for (const y of [0.012, -0.004]) b.add(rbox(0.002, 0.006, 0.22, 0.0006, 1), 'metal', { pos: [x, y, -0.03], wear: 'none', grime: 0.8 }); // pressed longitudinal ribs
  b.add(box(0.004, 0.016, 0.05), 'blackout', { pos: [0.0225, 0.004, -0.06], wear: 'none' }); // ejection port (right)
  b.add(rbox(0.003, 0.02, 0.054, 0.0008, 1), 'steel', { pos: [0.023, 0.004, -0.06], wear: 'all', wearAmt: 0.25 });
  b.add(rbox(0.05, 0.05, 0.03, 0.006, 2), 'polymer', { pos: [0, -0.002, 0.115], wearAmt: 1.2 }); // rear cap / stock housing
  for (const z of [-0.14, 0.09]) b.add(cylX(0.0045, 0.0045, 0.05, 8), 'steel', { pos: [0, -0.014, z], wear: 'rim', wearAmt: 1.5 }); // push pins
  b.add(torus(0.008, 0.0018, 6, 14), 'steel', { pos: [-0.026, 0.012, -0.12], rot: [0, Math.PI / 2, 0], wear: 'all', wearAmt: 0.5 }); // front sling loop
  // ---------- COCKING TUBE (above the barrel) + COCKING HANDLE ----------
  b.add(cylZ(0.011, 0.011, 0.25, 16), 'metal', { pos: [0, tubeY, -0.27], wear: 'rim', wearAmt: 0.9 });
  b.add(cylZ(0.013, 0.013, 0.02, 16), 'metal', { pos: [0, tubeY, -0.155], wear: 'rim', wearAmt: 1.2 }); // tube collar
  b.add(box(0.008, 0.012, 0.12), 'blackout', { pos: [-0.007, tubeY, -0.30], wear: 'none' }); // handle slot
  {
    const cb = new Builder();
    cb.add(rbox(0.012, 0.008, 0.03, 0.002, 1), 'steel', { pos: [0, 0, 0], wearAmt: 1.6 });
    cb.add(rbox(0.026, 0.008, 0.012, 0.002, 1), 'steel', { pos: [-0.014, 0.009, 0], rot: [0, 0, -0.75], wearAmt: 1.6 }); // lever swept up-left
    parts.chargingHandle = cb.build(mats, 'chargingHandle'); parts.chargingHandle.position.set(-0.006, tubeY + 0.002, -0.305); parts.chargingHandle.userData.travel = 0.06; group.add(parts.chargingHandle);
  }
  // ---------- BARREL + TRI-LUG ----------
  b.add(cylZ(0.0085, 0.0085, 0.27, 14), 'steel', { pos: [0, 0.0, -0.28], wear: 'rim', wearAmt: 0.8 });
  b.add(cylZ(0.0105, 0.0105, 0.025, 14), 'steel', { pos: [0, 0.0, -0.395], wear: 'rim', wearAmt: 1.3 }); // tri-lug collar
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.5; b.add(rbox(0.007, 0.006, 0.022, 0.001, 1), 'steel', { pos: [Math.cos(a) * 0.012, Math.sin(a) * 0.012, -0.393], rot: [0, 0, a], wearAmt: 1.4 }); }
  b.add(cylZ(0.006, 0.006, 0.004, 12), 'blackout', { pos: [0, 0, -0.41], wear: 'none' }); // bore
  // ---------- FRONT SIGHT TOWER (hooded post) ----------
  b.add(rbox(0.016, 0.022, 0.018, 0.002, 1), 'metal', { pos: [0, tubeY + 0.014, -0.365], wearAmt: 1.2 });
  b.add(torus(0.0085, 0.0018, 6, 18), 'metal', { pos: [0, sightY, -0.365], wear: 'all', wearAmt: 0.3 }); // hood ring
  b.add(rbox(0.0025, 0.009, 0.004, 0.0005, 1), 'steel', { pos: [0, sightY - 0.0045, -0.365], wearAmt: 1.2 }); // post (tip at sightY)
  // ---------- REAR DRUM SIGHT ----------
  b.add(rbox(0.024, 0.014, 0.024, 0.003, 1), 'metal', { pos: [0, 0.03, 0.06], wearAmt: 1.2 }); // base
  b.add(cylX(0.013, 0.013, 0.02, 20), 'metal', { pos: [0, sightY - 0.002, 0.06], wear: 'rim', wearAmt: 1.3 }); // drum
  b.add(cylZ(0.004, 0.004, 0.022, 12), 'blackout', { pos: [0, sightY, 0.06], wear: 'none' }); // aperture (dark) — sight line passes through its centre
  b.add(torus(0.0045, 0.001, 6, 14), 'steel', { pos: [0, sightY, 0.049], wear: 'all', wearAmt: 0.4 }); // aperture ring
  b.add(rbox(0.026, 0.004, 0.006, 0.001, 1), 'metal', { pos: [0, 0.05, 0.075], wearAmt: 1.2 }); // drum support
  // ---------- HANDGUARD (slim tapered polymer) ----------
  b.add(extrude([[-0.02, -0.02], [0.02, -0.02], [0.0225, 0.022], [-0.0225, 0.022]], 0.185, { bevel: 0.006, bevelSegments: 3, uvScale: 6 }), 'polymer', { pos: [0, -0.003, -0.255] });
  for (const x of [-0.021, 0.021]) for (let i = 0; i < 5; i++) b.add(box(0.002, 0.014, 0.003), 'rubber', { pos: [x, -0.006, -0.325 + i * 0.03], wear: 'none' }); // grip grooves
  b.add(rbox(0.045, 0.045, 0.012, 0.004, 2), 'polymer', { pos: [0, -0.002, -0.352], wearAmt: 1.4 }); // front end cap
  // ---------- TRIGGER GROUP HOUSING (polymer lower with pictogram selector) + GRIP ----------
  b.add(rbox(0.04, 0.036, 0.14, 0.006, 2), 'polymer', { pos: [0, -0.036, 0.04] });
  b.add(rbox(0.03, 0.11, 0.04, 0.008, 3), 'polymer', { pos: [0, -0.10, 0.085], rot: [-0.3, 0, 0] }); // pistol grip
  b.add(rbox(0.031, 0.01, 0.042, 0.003, 1), 'polymer', { pos: [0, -0.153, 0.104], rot: [-0.3, 0, 0], wearAmt: 1.3 }); // grip floor
  for (let i = 0; i < 3; i++) b.add(rbox(0.0325, 0.01, 0.034, 0.002, 1), 'rubber', { pos: [0, -0.08 - i * 0.024, 0.092 + i * 0.0075], rot: [-0.3, 0, 0], wear: 'none' }); // grip texture bands
  b.add(rbox(0.006, 0.006, 0.026, 0.0015, 1), 'steel', { pos: [-0.022, -0.03, 0.03], rot: [0, 0, 0.3], wearAmt: 1.6 }); // selector lever (left)
  b.add(cylX(0.005, 0.005, 0.006, 10), 'steel', { pos: [-0.023, -0.03, 0.02], wear: 'rim' });
  for (const [dx, c] of [[0, 'rubber'], [0.006, 'shellRed']]) b.add(box(0.001, 0.004, 0.003), c, { pos: [-0.0205, -0.022 + dx, 0.012], wear: 'none' }); // pictogram dots
  {
    const path = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.052, -0.012), new THREE.Vector3(0, -0.084, -0.004), new THREE.Vector3(0, -0.09, 0.025), new THREE.Vector3(0, -0.084, 0.052), new THREE.Vector3(0, -0.06, 0.06)]);
    b.add(new THREE.TubeGeometry(path, 12, 0.003, 8, false), 'polymer', { wear: 'all', wearAmt: 0.15 });
    const tb = new Builder(); tb.add(rbox(0.006, 0.024, 0.005, 0.0015, 1), 'steel', { pos: [0, -0.012, 0], rot: [0.2, 0, 0], wearAmt: 1.5 });
    parts.trigger = tb.build(mats, 'trigger'); parts.trigger.position.set(0, -0.055, 0.02); group.add(parts.trigger);
  }
  // ---------- MAGWELL + PADDLE RELEASE ----------
  b.add(rbox(0.032, 0.036, 0.05, 0.004, 2), 'metal', { pos: [0, -0.034, -0.075], wearAmt: 1.1 });
  b.add(rbox(0.014, 0.012, 0.028, 0.002, 1), 'steel', { pos: [0, -0.05, -0.04], rot: [0.3, 0, 0], wearAmt: 1.4 }); // paddle
  b.add(cylX(0.005, 0.005, 0.006, 10), 'steel', { pos: [0.02, -0.03, -0.055], wear: 'rim', wearAmt: 1.5 }); // push-button release
  // ---------- MAGAZINE (animated) ----------
  {
    const mb = new Builder();
    mb.add(smgMagGeometry(), 'steel', { wear: 'box', wearAmt: 0.9 });
    for (let i = 0; i < 5; i++) { const t = i / 5; mb.add(rbox(0.0225, 0.003, 0.03, 0.001, 1), 'steel', { pos: [0, -0.07 - t * 0.15, -0.076 - 0.06 * t * t], rot: [0.5 * t, 0, 0], wearAmt: 1.3 }); }
    mb.add(rbox(0.025, 0.008, 0.038, 0.002, 1), 'polymer', { pos: [0, -0.236, -0.133], rot: [0.5, 0, 0], wearAmt: 1.2 }); // floor plate
    parts.mag = mb.build(mats, 'mag'); group.add(parts.mag); parts.mag.userData.home = new THREE.Vector3(0, 0, 0);
  }
  // ---------- RETRACTABLE STOCK (A3: twin rods + butt) ----------
  for (const x of [-0.02, 0.02]) b.add(cylZ(0.0055, 0.0055, 0.20, 12), 'steel', { pos: [x, 0.0, 0.225], wear: 'rim', wearAmt: 1.0 });
  b.add(rbox(0.05, 0.02, 0.02, 0.004, 2), 'polymer', { pos: [0, -0.002, 0.14], wearAmt: 1.3 }); // rod guide / release button block
  b.add(cylY(0.006, 0.006, 0.01, 10), 'steel', { pos: [0, -0.018, 0.135], wear: 'rim' }); // stock release
  b.add(rbox(0.05, 0.10, 0.024, 0.006, 2), 'polymer', { pos: [0, -0.02, 0.335], wearAmt: 1.2 }); // butt
  b.add(rbox(0.048, 0.098, 0.006, 0.002, 1), 'rubber', { pos: [0, -0.02, 0.35], wear: 'none' });

  parts.sight = new THREE.Object3D(); parts.sight.position.set(0, sightY, 0.06); group.add(parts.sight);
  parts.muzzle = new THREE.Object3D(); parts.muzzle.position.set(0, 0.0, -0.412); group.add(parts.muzzle);
  parts.eject = new THREE.Object3D(); parts.eject.position.set(0.026, 0.006, -0.06); group.add(parts.eject);

  parts.body = b.build(mats, 'smgBody'); group.add(parts.body);

  // ---------- ARMS ----------
  const right = buildArm('right', { curl: [0.7, 0.2, 0.9, 0.95, 1.0], spread: 0.05, thumbUp: 1.1, forearmLen: 0.32 }, (hand, fore) => {
    hand.position.set(0.036, -0.09, 0.105);
    orient(hand, [0, -1, 0.3], [-0.15, 0, -1]);
    fore.position.copy(hand.position); fore.lookAt(0.13, -0.29, 0.43); fore.rotateX(Math.PI / 2);
  }, mats);
  group.add(right); parts.armR = right;
  const left = buildArm('left', { curl: [0.5, 0.8, 0.9, 0.95, 1.0], spread: 0.02, thumbUp: 0.55, forearmLen: 0.32 }, (hand, fore) => {
    hand.position.set(-0.05, 0.012, -0.27);
    orient(hand, [0, 0, -1], [0.55, -0.83, 0]);
    fore.position.copy(hand.position); fore.lookAt(-0.21, -0.35, -0.13); fore.rotateX(Math.PI / 2);
  }, mats);
  group.add(left); parts.armL = left;

  group.traverse(o => { if (o.isMesh) { o.frustumCulled = false; if (!/^arm_/.test(o.parent?.name || '')) o.castShadow = false; o.receiveShadow = true; } });
  return { group, parts, spec: SMG_SPEC };
}
