// Gloved first-person hands + forearms (baked per pose into merged meshes). Owned by: WEAPONS agent.
import * as THREE from 'three';
import { Builder, rbox, capsule, cylY, sphere } from './geo.js';

const _m = new THREE.Matrix4();

/**
 * Hand local frame: origin at wrist, +Y along the palm toward the fingers, palm faces -Z (back of hand = +Z),
 * thumb on -X for the right hand, +X for the left.
 * pose: { curl:[5 numbers 0..1 (thumb, index, middle, ring, pinky)], spread, thumbUp }
 */
export function buildHand(side, pose = {}) {
  const sgn = side === 'right' ? -1 : 1; // thumb side on X
  const g = new THREE.Group(); g.name = `hand_${side}`;
  const parts = []; // { geom, key, matrix-from-group }
  const add = (parent, geom, key, p = [0, 0, 0], r = [0, 0, 0]) => { const m = new THREE.Mesh(geom); m.position.set(...p); m.rotation.set(...r); m.userData.key = key; parent.add(m); return m; };

  // palm: slightly tapered, thicker at the wrist
  const palmW = 0.078, palmL = 0.088, palmT = 0.03;
  add(g, rbox(palmW, palmL, palmT, 0.013, 3), 'glove', [0, palmL / 2 - 0.006, 0]);
  add(g, rbox(palmW * 0.8, 0.04, palmT * 0.9, 0.012, 2), 'glove', [0, 0.004, 0]); // wrist taper
  // glove cuff strap
  add(g, rbox(0.066, 0.016, 0.036, 0.008, 2), 'rubber', [0, -0.01, 0]);
  // hard knuckle plate (single plate across MCP joints)
  add(g, rbox(0.07, 0.024, 0.008, 0.004, 2), 'knuckle', [0, palmL - 0.014, palmT / 2 + 0.001], [0.3, 0, 0]);
  // thenar pad (thumb muscle bulge) on the palm side
  add(g, sphere(0.019, 10), 'glove', [sgn * 0.026, 0.028, -0.005]);

  const curl = pose.curl || [0.6, 0.55, 0.85, 0.9, 0.95];
  const spread = pose.spread ?? 0.06;
  // fingers: index..pinky along X
  const fingerX = [-0.028, -0.0095, 0.0095, 0.028].map(v => v * -sgn); // index is on the thumb side
  const lens = [[0.040, 0.026, 0.021], [0.044, 0.029, 0.022], [0.040, 0.026, 0.021], [0.031, 0.021, 0.019]];
  const rads = [0.0088, 0.0092, 0.0086, 0.0076];
  for (let f = 0; f < 4; f++) {
    const c = curl[f + 1];
    let parent = g; let y = palmL - 0.008;
    const base = new THREE.Group(); base.position.set(fingerX[f], y, 0.002); base.rotation.z = (f - 1.5) * spread * -sgn * (1 - c * 0.6); base.rotation.x = -c * 1.25; parent.add(base); parent = base;
    for (let s = 0; s < 3; s++) {
      const L = lens[f][s], r = rads[f] * (1 - s * 0.08);
      const seg = new THREE.Group(); seg.position.set(0, s === 0 ? 0 : lens[f][s - 1], 0); seg.rotation.x = s === 0 ? 0 : -c * (s === 1 ? 1.35 : 0.9); parent.add(seg);
      add(seg, capsule(r, L - r * 0.6, 4, 10), 'glove', [0, L / 2, 0]);
      parent = seg;
    }
  }
  // thumb: two segments from the side of the palm
  {
    const c = curl[0];
    const base = new THREE.Group(); base.position.set(sgn * 0.036, 0.03, -0.006);
    base.rotation.set(-(0.3 + c * 0.9) * (pose.thumbUp ?? 1), 0, sgn * (-0.95 + c * 0.6), 'ZXY');
    g.add(base);
    const L1 = 0.045, L2 = 0.032;
    add(base, capsule(0.0125, L1 - 0.01, 4, 10), 'glove', [0, L1 / 2, 0]);
    const tip = new THREE.Group(); tip.position.set(0, L1, 0); tip.rotation.x = -c * 0.9; base.add(tip);
    add(tip, capsule(0.0105, L2 - 0.008, 4, 10), 'glove', [0, L2 / 2, 0]);
  }
  return g;
}

/** Forearm from wrist point back toward the elbow: length along +Y of the returned group (sleeve). */
export function buildForearm(len = 0.3) {
  const g = new THREE.Group(); g.name = 'forearm';
  const m = new THREE.Mesh(cylY(0.04, 0.029, len, 16)); m.userData.key = 'sleeve'; m.position.y = len / 2 - 0.01; g.add(m);
  const cuff = new THREE.Mesh(cylY(0.031, 0.032, 0.03, 16)); cuff.userData.key = 'rubber'; cuff.position.y = 0.0; g.add(cuff);

  return g;
}

/** Bakes a Group hierarchy of Meshes (with userData.key) into the builder (relative to `root`). */
export function bakeGroup(root, builder, wear = 'none') {
  root.updateMatrixWorld(true);
  _m.copy(root.matrixWorld).invert();
  root.traverse(o => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone();
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(_m, o.matrixWorld));
    const key = o.userData.key || 'glove';
    builder.add(geo, key, { wear: key === 'knuckle' ? 'box' : wear, wearAmt: 0.8, grime: 0.5 });
  });
}

/**
 * Builds a posed arm (hand + forearm) baked into merged meshes. `place(hand, forearm)` positions the groups in weapon space.
 */
export function buildArm(side, pose, place, mats) {
  const root = new THREE.Group();
  const hand = buildHand(side, pose); const fore = buildForearm(pose.forearmLen ?? 0.32);
  root.add(hand); root.add(fore);
  place(hand, fore);
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
