// Gloved first-person hands + forearms, baked per pose into merged meshes (3 materials: glove, knuckle, sleeve; strap/watch reuse 'rubber'). Owned by: WEAPONS agent.
// Look target: coyote-tan tactical gloves with a hard knuckle plate, dark pebbled palms, black wrist strap (+ watch on the left), multicam sleeve with a rolled cuff.
import * as THREE from 'three';
import { Builder, rbox, capsule, cylY, cylZ, sphere, torus, lathe, box } from './geo.js';

const _m = new THREE.Matrix4();

/**
 * Hand local frame: origin at wrist, +Y along the palm toward the fingers, palm faces -Z (back of hand = +Z),
 * thumb on -X for the right hand, +X for the left.
 * pose: { curl:[5 numbers 0..1 (thumb, index, middle, ring, pinky)], spread, thumbUp, indexOut (0..1: trigger finger indexed straight), watch }
 */
export function buildHand(side, pose = {}) {
  const sgn = side === 'right' ? -1 : 1; // thumb side on X
  const g = new THREE.Group(); g.name = `hand_${side}`;
  const add = (parent, geom, key, p = [0, 0, 0], r = [0, 0, 0], ud = {}) => { const m = new THREE.Mesh(geom); m.position.set(...p); m.rotation.set(...r); m.userData.key = key; Object.assign(m.userData, ud); parent.add(m); return m; };

  // palm: beveled block, thicker at the heel, slight taper toward the wrist
  const palmW = 0.082, palmL = 0.09, palmT = 0.031;
  add(g, rbox(palmW, palmL, palmT, 0.012, 2), 'glove', [0, palmL / 2 - 0.004, 0]);
  add(g, rbox(palmW * 0.78, 0.042, palmT * 0.92, 0.011, 1), 'glove', [0, 0.006, 0]); // wrist taper
  add(g, box(palmW * 0.8, palmL * 0.78, 0.006), 'glove', [0, palmL / 2 + 0.002, -palmT / 2 - 0.001], [0, 0, 0], { palm: 1 }); // dark pebbled palm patch
  add(g, sphere(0.021, 8), 'glove', [sgn * 0.027, 0.03, -0.006], [0, 0, 0], { palm: 1 }); // thenar pad
  add(g, sphere(0.014, 6), 'glove', [-sgn * 0.03, 0.035, -0.008], [0, 0, 0], { palm: 1 }); // hypothenar pad
  // glove wrist strap (black band + buckle tab) and the cuff
  add(g, cylY(0.038, 0.037, 0.018, 12, true), 'rubber', [0, -0.006, 0], [0, 0, 0], { sx: 1.1, sz: 0.46 });
  add(g, box(0.03, 0.012, 0.006), 'rubber', [-sgn * 0.02, -0.006, palmT / 2 + 0.006], [0, 0, 0.2]); // strap tab
  add(g, box(0.012, 0.014, 0.008), 'knuckle', [-sgn * 0.006, -0.006, palmT / 2 + 0.007]); // buckle
  // hard knuckle plate (raised, follows the MCP line) + individual finger knuckle caps
  add(g, rbox(0.074, 0.03, 0.011, 0.005, 2), 'knuckle', [0, palmL - 0.012, palmT / 2 + 0.003], [0.3, 0, 0]);
  add(g, rbox(0.06, 0.012, 0.006, 0.003, 1), 'knuckle', [0, palmL - 0.03, palmT / 2 + 0.004], [0.15, 0, 0]); // rear plate segment
  // watch on the left wrist: strap ring, case, dark face, crown
  if (pose.watch) {
    add(g, torus(0.039, 0.0045, 5, 14), 'rubber', [0, -0.02, 0], [Math.PI / 2, 0, 0], { sx: 1.1, sy: 0.46 });
    add(g, cylZ(0.019, 0.019, 0.01, 14), 'knuckle', [0.0, -0.02, palmT / 2 + 0.012]);
    add(g, cylZ(0.0155, 0.0155, 0.003, 14), 'rubber', [0.0, -0.02, palmT / 2 + 0.017]); // face (dark)
    add(g, torus(0.0165, 0.0018, 4, 14), 'knuckle', [0.0, -0.02, palmT / 2 + 0.0175]); // bezel
    add(g, cylY(0.003, 0.003, 0.005, 8), 'knuckle', [0.0195, -0.02, palmT / 2 + 0.012], [0, 0, Math.PI / 2]); // crown
  }

  const curl = pose.curl || [0.6, 0.55, 0.85, 0.9, 0.95];
  const spread = pose.spread ?? 0.06;
  const indexOut = pose.indexOut ?? (curl[1] < 0.3 ? 1 : 0);
  // fingers: index..pinky along X
  const fingerX = [-0.029, -0.0098, 0.0098, 0.029].map(v => v * -sgn); // index is on the thumb side
  const lens = [[0.042, 0.027, 0.022], [0.046, 0.03, 0.023], [0.042, 0.027, 0.022], [0.033, 0.022, 0.02]];
  const rads = [0.0092, 0.0096, 0.009, 0.008];
  for (let f = 0; f < 4; f++) {
    let c = curl[f + 1];
    const isIndex = f === 0 && indexOut > 0.5;
    if (isIndex) c = Math.min(c, 0.12);
    let parent = g; const y = palmL - 0.008;
    const base = new THREE.Group(); base.position.set(fingerX[f], y, 0.002);
    base.rotation.z = (f - 1.5) * spread * -sgn * (1 - c * 0.6) + (isIndex ? -sgn * 0.12 : 0); base.rotation.x = -c * 1.25 + (isIndex ? 0.08 : 0); parent.add(base); parent = base;
    for (let s = 0; s < 3; s++) {
      const L = lens[f][s], r = rads[f] * (1 - s * 0.09);
      const seg = new THREE.Group(); seg.position.set(0, s === 0 ? 0 : lens[f][s - 1], 0); seg.rotation.x = s === 0 ? 0 : -c * (s === 1 ? 1.35 : 0.9); parent.add(seg);
      add(seg, capsule(r, L - r * 0.6, 2, 6), 'glove', [0, L / 2, 0], [0, 0, 0], s === 2 ? { wear: 'rim', wearAmt: 1.6 } : {});
      if (s === 0) add(seg, box(r * 1.9, L * 0.55, 0.005), 'knuckle', [0, L * 0.45, r * 0.95], [0.1, 0, 0]); // proximal knuckle cap
      parent = seg;
    }
  }
  // thumb: two segments from the side of the palm
  {
    const c = curl[0];
    const base = new THREE.Group(); base.position.set(sgn * 0.038, 0.03, -0.006);
    base.rotation.set(-(0.3 + c * 0.9) * (pose.thumbUp ?? 1), 0, sgn * (-0.95 + c * 0.6), 'ZXY');
    g.add(base);
    const L1 = 0.047, L2 = 0.034;
    add(base, capsule(0.013, L1 - 0.01, 2, 7), 'glove', [0, L1 / 2, 0]);
    add(base, box(0.018, 0.02, 0.005), 'knuckle', [0, L1 * 0.55, 0.011], [0, 0, 0]); // thumb plate
    const tip = new THREE.Group(); tip.position.set(0, L1, 0); tip.rotation.x = -c * 0.9; base.add(tip);
    add(tip, capsule(0.011, L2 - 0.008, 2, 7), 'glove', [0, L2 / 2, 0], [0, 0, 0], { wear: 'rim', wearAmt: 1.6 });
  }
  return g;
}

/** Forearm from wrist point back toward the elbow: length along +Y of the returned group. Tapered camo sleeve + rolled cuff. */
export function buildForearm(len = 0.3) {
  const g = new THREE.Group(); g.name = 'forearm';
  len = Math.min(len, 0.26); // keep the elbow off-screen: a long fat sleeve was covering ~20% of the frame (Tarkov shows hand + wrist + a little sleeve)
  const prof = [[0.03, 0.0], [0.033, 0.02], [0.036, 0.08], [0.039, 0.16], [0.041, len * 0.85], [0.042, len], [0.0, len]];
  const m = new THREE.Mesh(lathe(prof, 14)); m.userData.key = 'sleeve'; m.position.y = -0.005; g.add(m);
  const cuff = new THREE.Mesh(torus(0.037, 0.012, 6, 14)); cuff.userData.key = 'sleeve'; cuff.rotation.x = Math.PI / 2; cuff.position.y = 0.02; cuff.userData.wear = 'all'; cuff.userData.wearAmt = 0.25; g.add(cuff); // rolled cuff
  const cuff2 = new THREE.Mesh(torus(0.041, 0.008, 5, 14)); cuff2.userData.key = 'sleeve'; cuff2.rotation.x = Math.PI / 2; cuff2.position.y = 0.032; g.add(cuff2); // second roll
  return g;
}

/** Bakes a Group hierarchy of Meshes (with userData.key) into the builder (relative to `root`). */
export function bakeGroup(root, builder, wear = 'none') {
  root.updateMatrixWorld(true);
  _m.copy(root.matrixWorld).invert();
  root.traverse(o => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone();
    if (o.userData.sx || o.userData.sy || o.userData.sz) geo.scale(o.userData.sx || 1, o.userData.sy || 1, o.userData.sz || 1); // flattened bands (wrist is an oval)
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(_m, o.matrixWorld));
    const key = o.userData.key || 'glove';
    builder.add(geo, key, { wear: o.userData.wear || (key === 'knuckle' ? 'box' : wear), wearAmt: o.userData.wearAmt ?? 0.8, grime: key === 'sleeve' ? 0.6 : 0.45, palm: o.userData.palm || 0 });
  });
}

/**
 * Builds a posed arm (hand + forearm) baked into merged meshes. `place(hand, forearm)` positions the groups in weapon space.
 * The left hand gets the watch unless pose.watch === false.
 */
export function buildArm(side, pose, place, mats) {
  const root = new THREE.Group();
  const hand = buildHand(side, { watch: side === 'left', ...pose }); const fore = buildForearm(pose.forearmLen ?? 0.32);
  root.add(hand); root.add(fore);
  place(hand, fore);
  // Elbow off-screen: whatever the weapon pose asked for, bend the forearm steeply down and away from the eye (weapon space: -y down, +z toward the camera).
  { const d = new THREE.Vector3(0, 1, 0).applyQuaternion(fore.quaternion); d.y -= 0.55; d.z -= 0.15; d.x *= 0.9; d.normalize(); fore.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); }
  const b = new Builder();
  bakeGroup(root, b, 'none');
  const g = b.build(mats, `arm_${side}`);
  // re-origin the arm at the wrist so rotating the group swings the hand naturally
  const wrist = hand.position.clone();
  for (const m of g.children) m.geometry.translate(-wrist.x, -wrist.y, -wrist.z);
  g.position.copy(wrist);
  g.userData.wrist = wrist.clone();
  g.userData.home = { pos: wrist.clone(), rot: new THREE.Euler() };
  return g;
}
