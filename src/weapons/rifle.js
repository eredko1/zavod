// Procedural M4A1-class carbine viewmodel (bore axis = -Z, +Y up, +X right; units = meters). Owned by: WEAPONS agent.
import * as THREE from 'three';
import { Builder, rbox, box, cylZ, cylY, cylX, torus, extrude, lathe, sphere, addRail } from './geo.js';
import { buildArm } from './arms.js';

export const RIFLE_SPEC = {
  id: 'm4a1', name: 'M4A1', class: 'AR', slot: 0, mode: 'AUTO',
  desc: '5.56 carbine. Balanced damage, controllable full-auto, T2 red dot.',
  mag: 30, reserve: 180, rpm: 800, auto: true, damage: 34, headMul: 2.2, range: 200, falloff: [40, 160, 0.6],
  reloadStyle: 'mag', reloadKeys: { magGrab: [-0.02, -0.18, -0.02], down: [-0.1, -0.42, 0.06], rack: [-0.02, 0.055, 0.12], tiltK: 1 },
  flashSize: 0.15, flashStrength: 1, brassScale: 1,
  stats: { damage: 34, rpm: 800, range: 200, mag: 30, mobility: 70, accuracy: 72 },
  hipSpread: 1.6, adsSpread: 0.12, spreadPerShot: 0.55, spreadMax: 6.5, moveSpread: 1.8,
  recoilPitch: 0.34, recoilYaw: 0.16, kickBack: 0.028, kickUp: 0.055, kickRoll: 0.03,
  reloadTime: 2.1, reloadTimeTac: 1.75, swapTime: 0.42, adsTime: 0.22, adsDist: 0.215,
  hip: { pos: [0.088, -0.10, -0.27], rot: [0.0, 0.05, 0.01] },
  sprint: { pos: [0.16, -0.16, -0.30], rot: [-0.25, 0.75, 0.35] },
  lower: { pos: [0.12, -0.36, -0.28], rot: [-0.9, 0.35, 0.2] },
};

function magazineGeometry() {
  // Side profile (z forward = -, y down), 30rd PMAG: straight 45 mm then curved forward
  const pts = []; const N = 9; const curve = (t) => -0.075 * t * t; // forward offset
  const top = -0.055, bottom = -0.245, backZ = 0.03, frontZ = -0.027;
  for (let i = 0; i <= N; i++) { const t = i / N; pts.push([backZ + curve(t) * 0.92, top + (bottom - top) * t]); }
  for (let i = N; i >= 0; i--) { const t = i / N; pts.push([frontZ + curve(t), top + (bottom - top) * t + (i === N ? 0.004 : 0)]); }
  const g = extrude(pts, 0.024, { bevel: 0.0025, bevelSegments: 2, uvScale: 10 });
  g.rotateY(-Math.PI / 2); // shape x → z, extrude width along X
  return g;
}

export function buildRifle(mats, opts = {}) {
  const b = new Builder();
  const group = new THREE.Group(); group.name = 'rifle';
  const parts = {};

  // ---------- UPPER RECEIVER ----------
  b.add(rbox(0.036, 0.052, 0.205, 0.0045, 2), 'metal', { pos: [0, 0.005, 0.0] });
  b.add(rbox(0.037, 0.02, 0.06, 0.004), 'metal', { pos: [0, 0.0, -0.10], wearAmt: 1.3 }); // barrel nut collar
  addRail(b, 'metal', 0.19, 0.021, { pos: [0, 0.031, 0.0] });
  // rail side lips
  b.add(rbox(0.006, 0.006, 0.19, 0.0015, 1), 'metal', { pos: [0.0135, 0.031, 0] });
  b.add(rbox(0.006, 0.006, 0.19, 0.0015, 1), 'metal', { pos: [-0.0135, 0.031, 0] });
  // forward assist (right rear)
  b.add(cylX(0.007, 0.007, 0.018, 12), 'steel', { pos: [0.023, 0.006, 0.065], wear: 'rim' });
  b.add(cylX(0.009, 0.009, 0.006, 12), 'steel', { pos: [0.031, 0.006, 0.065], wear: 'rim' });
  // ejection port recess + brass deflector
  b.add(box(0.003, 0.02, 0.05), 'rubber', { pos: [0.0175, 0.004, -0.02], wear: 'none' });
  b.add(rbox(0.004, 0.022, 0.052, 0.001, 1), 'steel', { pos: [0.0195, -0.008, -0.02], rot: [1.9, 0, 0], wearAmt: 1.4 }); // open dust cover, hanging down
  b.add(extrude([[0, 0], [0.012, 0], [0.012, 0.028], [0, 0.02]], 0.02, { uvScale: 20 }), 'metal', { pos: [0.018, -0.005, 0.015], rot: [0, 0, 0] }); // deflector
  // pins / takedown
  for (const z of [0.075, -0.04]) { b.add(cylX(0.004, 0.004, 0.04, 8), 'steel', { pos: [0, -0.019, z], wear: 'rim', wearAmt: 1.5 }); }
  // shell deflector lip & receiver roll marks (thin dark plate on left)
  b.add(rbox(0.002, 0.03, 0.09, 0.0005, 1), 'metal', { pos: [-0.0185, -0.032, 0.03], wear: 'none', grime: 0.9 });

  // ---------- LOWER RECEIVER ----------
  b.add(rbox(0.032, 0.036, 0.13, 0.004, 2), 'metal', { pos: [0, -0.037, 0.03] });
  // magwell (slightly flared)
  b.add(rbox(0.034, 0.05, 0.065, 0.004, 2), 'metal', { pos: [0, -0.06, -0.008], rot: [0.05, 0, 0] });
  b.add(rbox(0.037, 0.008, 0.07, 0.003, 1), 'metal', { pos: [0, -0.083, -0.008], rot: [0.05, 0, 0], wearAmt: 1.5 }); // flared lip
  // trigger guard: bent tube
  {
    const path = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.055, -0.005), new THREE.Vector3(0, -0.088, 0.006), new THREE.Vector3(0, -0.093, 0.035), new THREE.Vector3(0, -0.086, 0.062), new THREE.Vector3(0, -0.06, 0.07)]);
    b.add(new THREE.TubeGeometry(path, 12, 0.0028, 8, false), 'metal', { wear: 'all', wearAmt: 0.2 });
  }
  // selector (left), mag release (right), bolt catch (left)
  b.add(rbox(0.006, 0.006, 0.028, 0.002, 1), 'steel', { pos: [-0.019, -0.03, 0.055], rot: [0, 0.0, 0], wearAmt: 1.6 });
  b.add(cylX(0.004, 0.004, 0.008, 8), 'steel', { pos: [-0.019, -0.03, 0.045], wear: 'rim' });
  b.add(cylX(0.005, 0.005, 0.006, 10), 'steel', { pos: [0.019, -0.045, 0.005], wear: 'rim', wearAmt: 1.5 }); // mag release
  b.add(rbox(0.012, 0.005, 0.01, 0.001, 1), 'metal', { pos: [0.02, -0.045, 0.005] }); // release fence
  b.add(rbox(0.005, 0.024, 0.012, 0.0015, 1), 'steel', { pos: [-0.019, -0.03, -0.005], wearAmt: 1.4 }); // bolt catch paddle
  // pistol grip (polymer, raked ~20°)
  b.add(rbox(0.03, 0.115, 0.042, 0.009, 3), 'polymer', { pos: [0, -0.10, 0.082], rot: [-0.33, 0, 0] });
  b.add(rbox(0.032, 0.02, 0.05, 0.006, 2), 'polymer', { pos: [0, -0.052, 0.078], rot: [-0.2, 0, 0] }); // grip top / beavertail
  b.add(rbox(0.031, 0.012, 0.044, 0.004, 2), 'polymer', { pos: [0, -0.157, 0.104], rot: [-0.33, 0, 0] }); // grip floor plug
  // grip texture bands (rubber inserts) — read as MIAD-style panels
  for (let i = 0; i < 3; i++) b.add(rbox(0.0335, 0.012, 0.036, 0.003, 1), 'rubber', { pos: [0, -0.078 - i * 0.026, 0.091 + i * 0.009], rot: [-0.33, 0, 0], wear: 'none' });

  // ---------- BUFFER TUBE + STOCK ----------
  b.add(cylZ(0.017, 0.017, 0.014, 16), 'metal', { pos: [0, 0.006, 0.11], wear: 'rim' }); // castle nut
  b.add(cylZ(0.0135, 0.0135, 0.19, 16), 'metal', { pos: [0, 0.006, 0.205], wear: 'rim', wearAmt: 1.4 }); // buffer tube
  b.add(rbox(0.024, 0.035, 0.03, 0.006, 2), 'metal', { pos: [0, -0.012, 0.115] }); // receiver extension / rear takedown
  b.add(rbox(0.04, 0.058, 0.14, 0.01, 3), 'polymer', { pos: [0, -0.008, 0.29] }); // stock body
  b.add(extrude([[0.24, -0.02], [0.35, -0.02], [0.35, -0.085], [0.30, -0.08], [0.255, -0.05]], 0.03, { bevel: 0.003, uvScale: 10 }), 'polymer', { rot: [0, -Math.PI / 2, 0] }); // stock spine
  b.add(rbox(0.042, 0.11, 0.016, 0.006, 2), 'rubber', { pos: [0, -0.04, 0.358], wear: 'none' }); // buttpad
  b.add(torus(0.008, 0.0018, 6, 16), 'steel', { pos: [-0.021, -0.02, 0.30], rot: [0, Math.PI / 2, 0], wear: 'all', wearAmt: 0.5 }); // sling loop

  // ---------- HANDGUARD (M-LOK free-float, octagon) ----------
  const hgLen = 0.27, hgZ = -0.245, hgR = 0.0215, hgY = 0.012;
  b.add(cylZ(hgR, hgR, hgLen, 8), 'metal', { pos: [0, hgY, hgZ], rot: [0, 0, Math.PI / 8], wear: 'rim', wearAmt: 1.6 });
  addRail(b, 'metal', hgLen - 0.01, 0.021, { pos: [0, 0.031, hgZ] });
  // M-LOK slots at 3/6/9 o'clock (dark inset plates), 5 per side
  const apo = hgR * Math.cos(Math.PI / 8);
  for (let i = 0; i < 5; i++) {
    const z = hgZ - hgLen / 2 + 0.03 + i * 0.045;
    b.add(box(0.0012, 0.0075, 0.032), 'rubber', { pos: [apo, hgY, z], wear: 'none' });
    b.add(box(0.0012, 0.0075, 0.032), 'rubber', { pos: [-apo, hgY, z], wear: 'none' });
    b.add(box(0.0075, 0.0012, 0.032), 'rubber', { pos: [0, hgY - apo, z], wear: 'none' });
  }
  // anti-rotation tabs / handguard rear ring
  b.add(cylZ(0.0235, 0.0235, 0.012, 8), 'metal', { pos: [0, hgY, -0.116], rot: [0, 0, Math.PI / 8], wear: 'rim' });
  // hand stop / angled foregrip (polymer wedge under the handguard)
  b.add(extrude([[-0.305, -0.017], [-0.215, -0.017], [-0.205, -0.045], [-0.26, -0.056], [-0.305, -0.04]], 0.028, { bevel: 0.003, uvScale: 10 }), 'polymer', { rot: [0, -Math.PI / 2, 0] });
  // QD sling socket
  b.add(torus(0.006, 0.0016, 6, 14), 'steel', { pos: [-0.023, 0.0, -0.33], rot: [0, Math.PI / 2, 0], wear: 'all', wearAmt: 0.5 });

  // ---------- BARREL + MUZZLE ----------
  const suppressed = !!opts.suppressor;
  b.add(cylZ(0.0085, 0.0095, 0.09, 14), 'steel', { pos: [0, 0.006, -0.42], wear: 'rim', wearAmt: 0.6 });
  b.add(cylZ(0.0095, 0.0095, 0.006, 14), 'steel', { pos: [0, 0.006, -0.463], wear: 'rim' }); // crush washer
  let muzzleZ;
  if (suppressed) {
    b.add(lathe([[0.0, 0], [0.016, 0], [0.019, 0.01], [0.019, 0.15], [0.017, 0.16], [0.011, 0.162], [0.0, 0.162]], 24).rotateX(-Math.PI / 2), 'steel', { pos: [0, 0.006, -0.46], wear: 'rim', wearAmt: 1.2, grime: 0.9 });
    muzzleZ = -0.625;
  } else {
    // A2-style birdcage: body + dark slots
    b.add(lathe([[0.0, 0], [0.0098, 0], [0.0098, 0.012], [0.0112, 0.018], [0.0112, 0.05], [0.009, 0.056], [0.0, 0.056]], 20).rotateX(-Math.PI / 2), 'steel', { pos: [0, 0.006, -0.465], wear: 'rim', wearAmt: 1.3 });
    for (let i = 0; i < 5; i++) { const a = -Math.PI * 0.5 + (i + 0.5) * Math.PI * 1.25 / 5 + Math.PI * 0.35; b.add(box(0.0025, 0.0035, 0.026), 'rubber', { pos: [Math.cos(a) * 0.0108, 0.006 + Math.sin(a) * 0.0108, -0.499], rot: [0, 0, a + Math.PI / 2], wear: 'none' }); }
    b.add(cylZ(0.0065, 0.0065, 0.004, 12), 'rubber', { pos: [0, 0.006, -0.521], wear: 'none' }); // bore
    muzzleZ = -0.522;
  }
  // low-profile gas block (visible in the handguard gap) — front sight base folded
  b.add(rbox(0.012, 0.014, 0.024, 0.002, 1), 'steel', { pos: [0, 0.043, -0.36], wearAmt: 1.2 }); // folded front sight
  b.add(rbox(0.014, 0.012, 0.03, 0.002, 1), 'steel', { pos: [0, 0.043, 0.085], wearAmt: 1.2 }); // folded rear sight
  b.add(cylX(0.0045, 0.0045, 0.008, 8), 'steel', { pos: [0, 0.049, 0.09], wear: 'rim' }); // rear sight aperture knob

  // ---------- OPTIC (T2-class red dot on lower-1/3 mount) ----------
  const oz = 0.02, oy = 0.081; // optic tube centre
  b.add(rbox(0.026, 0.018, 0.058, 0.003, 2), 'metal', { pos: [0, 0.046, oz], wearAmt: 1.2 }); // mount base
  b.add(rbox(0.032, 0.026, 0.05, 0.004, 2), 'metal', { pos: [0, 0.063, oz] }); // riser
  b.add(rbox(0.006, 0.014, 0.024, 0.002, 1), 'steel', { pos: [0.017, 0.048, oz], wearAmt: 1.5 }); // clamp lever
  b.add(cylX(0.006, 0.006, 0.01, 8), 'steel', { pos: [0.02, 0.048, oz + 0.02], wear: 'rim' }); // clamp screw
  b.add(cylZ(0.0165, 0.0165, 0.06, 24, true), 'metal', { pos: [0, oy, oz], wear: 'rim', wearAmt: 1.5 }); // tube (open)
  b.add(torus(0.0165, 0.0025, 8, 24), 'metal', { pos: [0, oy, oz - 0.03], wear: 'all', wearAmt: 0.22 }); // front hood ring
  b.add(torus(0.0165, 0.0025, 8, 24), 'metal', { pos: [0, oy, oz + 0.03], wear: 'all', wearAmt: 0.22 }); // rear ring
  b.add(cylZ(0.0135, 0.0135, 0.058, 20, true), 'blackout', { pos: [0, oy, oz], wear: 'none' }); // inner tube (unlit black)
  b.add(cylX(0.009, 0.009, 0.012, 12), 'metal', { pos: [0.021, oy, oz], wear: 'rim', wearAmt: 1.3 }); // windage turret
  b.add(cylY(0.009, 0.009, 0.012, 12), 'metal', { pos: [0, oy + 0.021, oz], wear: 'rim', wearAmt: 1.3 }); // elevation turret
  b.add(cylX(0.0105, 0.0105, 0.012, 12), 'metal', { pos: [-0.021, oy, oz + 0.008], wear: 'rim', wearAmt: 1.3 }); // battery/brightness knob
  b.add(cylX(0.0075, 0.0075, 0.004, 10), 'rubber', { pos: [-0.028, oy, oz + 0.008], wear: 'none' });

  // ---------- CHARGING HANDLE (separate, animated) ----------
  {
    const cb = new Builder();
    cb.add(rbox(0.034, 0.008, 0.02, 0.002, 1), 'steel', { pos: [0, 0, 0], wearAmt: 1.5 });
    cb.add(rbox(0.012, 0.009, 0.075, 0.002, 1), 'steel', { pos: [0, 0, -0.045], wearAmt: 1.3 });
    cb.add(rbox(0.012, 0.01, 0.014, 0.002, 1), 'steel', { pos: [-0.016, 0.001, -0.002], wearAmt: 1.6 }); // latch
    parts.chargingHandle = cb.build(mats, 'chargingHandle'); parts.chargingHandle.position.set(0, 0.024, 0.098);
    group.add(parts.chargingHandle);
  }
  // ---------- BOLT CARRIER (visible through the port, animated) ----------
  {
    const cb = new Builder();
    cb.add(rbox(0.016, 0.018, 0.09, 0.002, 1), 'brass', { pos: [0, 0, 0], wear: 'none' });
    parts.bolt = cb.build(mats, 'bolt'); parts.bolt.position.set(0.009, 0.004, -0.02);
    parts.bolt.children[0].material = mats.steel; // BCG steel; keep separate mesh
    group.add(parts.bolt);
  }
  // ---------- TRIGGER (animated) ----------
  {
    const cb = new Builder();
    cb.add(rbox(0.006, 0.026, 0.005, 0.0015, 1), 'steel', { pos: [0, -0.013, 0], rot: [0.2, 0, 0], wearAmt: 1.5 });
    parts.trigger = cb.build(mats, 'trigger'); parts.trigger.position.set(0, -0.056, 0.03); group.add(parts.trigger);
  }
  // ---------- MAGAZINE (animated) ----------
  {
    const cb = new Builder();
    cb.add(magazineGeometry(), 'fde', { wear: 'box', wearAmt: 0.8 });
    // ribs
    for (let i = 0; i < 6; i++) { const t = i / 6; cb.add(rbox(0.0265, 0.004, 0.05, 0.0012, 1), 'fde', { pos: [0, -0.075 - t * 0.16, 0.0015 - 0.075 * t * t * 0.96], rot: [0.55 * t, 0, 0], wearAmt: 1.2 }); }
    cb.add(rbox(0.029, 0.01, 0.062, 0.003, 1), 'polymer', { pos: [0, -0.246, 0.003 - 0.071], rot: [0.55, 0, 0], wearAmt: 1.3 }); // floor plate
    cb.add(rbox(0.026, 0.006, 0.02, 0.002, 1), 'rubber', { pos: [0, -0.248, -0.10], rot: [0.55, 0, 0], wear: 'none' }); // mag pull loop
    parts.mag = cb.build(mats, 'mag'); parts.mag.position.set(0, 0, 0); group.add(parts.mag);
    parts.mag.userData.home = new THREE.Vector3(0, 0, 0);
  }

  // ---------- OPTIC GLASS + DOT (separate materials / render order) ----------
  {
    const lensF = new THREE.Mesh(new THREE.CircleGeometry(0.0135, 24), mats.glass); lensF.position.set(0, oy, oz - 0.026); lensF.renderOrder = 20; group.add(lensF);
    const lensR = new THREE.Mesh(new THREE.CircleGeometry(0.0135, 24), mats.glass); lensR.position.set(0, oy, oz + 0.026); lensR.rotation.y = Math.PI; lensR.renderOrder = 21; group.add(lensR);
    // red dot: sharp core + soft halo, drawn in front of the front lens so it's visible through the tube
    const dotTex = makeDotTexture();
    const dotMat = mats.dot.clone(); dotMat.map = dotTex; dotMat.color.set(0xff2a18);
    const dot = new THREE.Mesh(new THREE.PlaneGeometry(0.0062, 0.0062), dotMat); dot.position.set(0, oy, oz - 0.024); dot.renderOrder = 22; dot.rotation.y = 0; group.add(dot);
    parts.dot = dot; parts.lensF = lensF; parts.lensR = lensR;
    // emissive LED housing at the bottom-front inside the tube
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.0015, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false })); led.position.set(0, oy - 0.011, oz + 0.02); group.add(led);
  }

  // sight point: where the eye should look through (centre of the optic tube)
  parts.sight = new THREE.Object3D(); parts.sight.position.set(0, oy, oz); group.add(parts.sight);
  parts.muzzle = new THREE.Object3D(); parts.muzzle.position.set(0, 0.006, muzzleZ); group.add(parts.muzzle);
  parts.eject = new THREE.Object3D(); parts.eject.position.set(0.024, 0.006, -0.02); group.add(parts.eject);

  const body = b.build(mats, 'rifleBody'); group.add(body); parts.body = body;

  // ---------- ARMS ----------
  // Right hand on the pistol grip (grip axis raked ~19°). Hand +Y (fingers) → forward, palm → left (toward the grip).
  const right = buildArm('right', { curl: [0.7, 0.2, 0.9, 0.95, 1.0], spread: 0.05, thumbUp: 1.1, forearmLen: 0.32 }, (hand, fore) => {
    hand.position.set(0.036, -0.10, 0.155);
    orient(hand, [0, -1, 0.33], [-0.15, 0, -1]); // pinky side down the grip, fingers forward, back of hand to the right
    fore.position.copy(hand.position); fore.lookAt(0.13, -0.30, 0.47); fore.rotateX(Math.PI / 2); // +Y of forearm toward the elbow
  }, mats);
  group.add(right); parts.armR = right;
  // Left hand under the handguard, C-clamp on the hand stop. Fingers → right, palm → up.
  const left = buildArm('left', { curl: [0.5, 0.8, 0.9, 0.95, 1.0], spread: 0.02, thumbUp: 0.55, forearmLen: 0.32 }, (hand, fore) => {
    hand.position.set(-0.053, 0.03, -0.215);
    orient(hand, [0.05, 0.06, -1], [0.42, -0.9, 0]); // C-clamp: palm on the left face, thumb forward over the top, fingers wrap under to the right; back of the hand faces the eye
    fore.position.copy(hand.position); fore.lookAt(-0.21, -0.34, -0.12); fore.rotateX(Math.PI / 2);
  }, mats);
  group.add(left); parts.armL = left;

  group.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = true; } });
  return { group, parts, spec: RIFLE_SPEC };
}

/** Sets obj's rotation so local X→xAxis, local Y→yAxis (z = x×y). */
export function orient(obj, xAxis, yAxis) {
  const x = new THREE.Vector3(...xAxis).normalize(), y = new THREE.Vector3(...yAxis).normalize(), z = new THREE.Vector3().crossVectors(x, y).normalize();
  y.crossVectors(z, x);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

export function makeDotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.18, 'rgba(255,60,40,1)'); grd.addColorStop(0.35, 'rgba(255,30,20,0.55)'); grd.addColorStop(1, 'rgba(255,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
