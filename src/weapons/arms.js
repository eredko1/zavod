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
  const palmW = 0.084, palmL = 0.092, palmT = 0.03;
  const wedge = (geom) => { const p = geom.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const t = (y + palmL / 2) / palmL; const sx = 0.78 + 0.22 * t; const sz = (1.1 - 0.35 * t) * (z > 0 ? 1 + 0.25 * (1 - Math.abs(x) / (palmW / 2)) * t : 1); p.setXYZ(i, x * sx, y, z * sz); } geom.computeVertexNormals(); return geom; };
  const sm = (v, a, b) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  // baked occlusion (adds to the grime channel): palm side, finger roots under the knuckle plate, wrist/cuff junction
  add(g, wedge(rbox(palmW, palmL, palmT, 0.012, 3)), 'glove', [0, palmL / 2 - 0.004, 0], [0, 0, 0], { ao: (x, y, z) => 0.5 * sm(-z, 0.004, 0.012) + 0.55 * sm(y, 0.022, 0.04) * sm(z, 0.0, 0.01) + 0.5 * sm(-y, 0.02, 0.04) });
  add(g, rbox(palmW * 0.78, 0.042, palmT * 0.92, 0.011, 1), 'glove', [0, 0.006, 0], [0, 0, 0], { ao: () => 0.6 }); // wrist taper (in the cuff shadow)
  add(g, box(palmW * 0.8, palmL * 0.78, 0.006), 'glove', [0, palmL / 2 + 0.002, -palmT / 2 - 0.001], [0, 0, 0], { palm: 1 }); // dark pebbled palm patch
  add(g, sphere(0.021, 8), 'glove', [sgn * 0.027, 0.03, -0.006], [0, 0, 0], { palm: 1, ao: () => 0.45 }); // thenar pad
  add(g, sphere(0.014, 6), 'glove', [-sgn * 0.03, 0.035, -0.008], [0, 0, 0], { palm: 1, ao: () => 0.45 }); // hypothenar pad
  // glove wrist strap (black band + buckle tab) and the cuff
  add(g, cylY(0.035, 0.034, 0.016, 12, true), 'rubber', [0, -0.004, 0], [0, 0, 0], { sx: 1.05, sz: 0.44 });
  add(g, box(0.03, 0.012, 0.006), 'rubber', [-sgn * 0.02, -0.006, palmT / 2 + 0.006], [0, 0, 0.2]); // strap tab
  add(g, box(0.012, 0.014, 0.008), 'knuckle', [-sgn * 0.006, -0.006, palmT / 2 + 0.007]); // buckle
  // hard knuckle plate (raised, follows the MCP line) + individual finger knuckle caps
  add(g, rbox(0.072, 0.03, 0.011, 0.005, 2), 'knuckle', [0, palmL - 0.012, palmT / 2 + 0.006], [0.35, 0, 0]);
  add(g, rbox(0.06, 0.012, 0.006, 0.003, 1), 'knuckle', [0, palmL - 0.03, palmT / 2 + 0.007], [0.15, 0, 0]); // rear plate segment
  // watch on the left wrist: strap ring, case, dark face, crown
  if (pose.watch) {
    add(g, torus(0.0325, 0.004, 5, 14), 'rubber', [0, -0.014, 0], [Math.PI / 2, 0, 0], { sx: 1.05, sy: 0.42 }); // strap hugs the wrist oval
    add(g, cylZ(0.018, 0.018, 0.009, 14), 'knuckle', [0.0, -0.014, palmT / 2 + 0.006]);
    add(g, cylZ(0.0145, 0.0145, 0.003, 14), 'rubber', [0.0, -0.014, palmT / 2 + 0.0105]); // face (dark)
    add(g, torus(0.0155, 0.0018, 4, 14), 'knuckle', [0.0, -0.014, palmT / 2 + 0.011]); // bezel
    add(g, cylY(0.003, 0.003, 0.005, 8), 'knuckle', [0.0185, -0.014, palmT / 2 + 0.006], [0, 0, Math.PI / 2]); // crown
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
      const fao = (x, y, z) => 0.45 * sm(-z, 0.0, r * 0.6) + 0.35 * sm(Math.abs(x), r * 0.45, r * 0.95) * sm(z, -r, r * 0.2) + (s > 0 ? 0.45 : 0.6) * sm(-y, L * 0.15, L * 0.45); // palm side, between fingers, joint creases
      add(seg, capsule(r, L - r * 0.6, 2, 6), 'glove', [0, L / 2, 0], [0, 0, 0], s === 2 ? { wear: 'rim', wearAmt: 1.4, ao: fao } : { ao: fao, wear: s === 0 ? 'box' : 'none', wearAmt: 0.5 });
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
    add(base, capsule(0.013, L1 - 0.01, 2, 7), 'glove', [0, L1 / 2, 0], [0, 0, 0], { ao: (x, y, z) => 0.45 * sm(-z, 0, 0.008) + 0.6 * sm(-y, L1 * 0.15, L1 * 0.45) });
    add(base, box(0.018, 0.02, 0.005), 'knuckle', [0, L1 * 0.55, 0.011], [0, 0, 0]); // thumb plate
    const tip = new THREE.Group(); tip.position.set(0, L1, 0); tip.rotation.x = -c * 0.9; base.add(tip);
    add(tip, capsule(0.011, L2 - 0.008, 2, 7), 'glove', [0, L2 / 2, 0], [0, 0, 0], { wear: 'rim', wearAmt: 1.6 });
  }
  return g;
}

/** Forearm from wrist point back toward the elbow: length along +Y of the returned group. Elliptical sleeve with cloth folds, wrist bone, rolled cuff. */
export function buildForearm(len = 0.3) {
  const g = new THREE.Group(); g.name = 'forearm';
  len = Math.min(len, 0.26); // keep the elbow off-screen: a long fat sleeve was covering ~20% of the frame (Tarkov shows hand + wrist + a little sleeve)
  // radius profile: wrist → folds → swelling upper forearm; folds are soft rings that get irregular below
  const prof = [[0.026, 0.0], [0.03, 0.012], [0.034, 0.03], [0.031, 0.042], [0.036, 0.056], [0.033, 0.07], [0.038, 0.09], [0.0365, 0.105], [0.041, 0.13], [0.044, 0.17], [0.047, len * 0.85], [0.047, len], [0.0, len]];
  const geo = lathe(prof, 16);
  {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const a = Math.atan2(z, x); const r = Math.hypot(x, z); if (r < 1e-6) continue;
      // elliptical cross-section (wider side-to-side), plus wandering wrinkle displacement that fades toward the wrist
      const fold = 1 + 0.06 * Math.sin(a * 3 + y * 40) * Math.sin(y * 55 + 1.3) * Math.min(1, y / 0.05) + 0.03 * Math.sin(a * 5 + 2.0) * Math.min(1, y / 0.08);
      const rr = r * fold; p.setXYZ(i, Math.cos(a) * rr * 1.18, y, Math.sin(a) * rr * 0.86);
    }
    geo.computeVertexNormals();
  }
  const m = new THREE.Mesh(geo); m.userData.key = 'sleeve'; m.position.y = -0.002; g.add(m);
  // wrist bone (ulna) bump under the cuff edge, on the little-finger side
  const bone = new THREE.Mesh(sphere(0.009, 6)); bone.userData.key = 'glove'; bone.position.set(0.026, 0.004, 0.004); g.add(bone);
  // rolled cuff: thick, slightly irregular double roll
  const cuffGeo = torus(0.034, 0.013, 7, 16); { const p = cuffGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); const a = Math.atan2(y, x); const k = 1 + 0.08 * Math.sin(a * 4 + 0.7) + 0.05 * Math.sin(a * 7); p.setXYZ(i, x * k * 1.15, y * k * 0.88, p.getZ(i) * (1 + 0.15 * Math.sin(a * 3))); } cuffGeo.computeVertexNormals(); }
  const cuff = new THREE.Mesh(cuffGeo); cuff.userData.key = 'sleeve'; cuff.rotation.x = Math.PI / 2; cuff.position.y = 0.022; cuff.userData.wear = 'all'; cuff.userData.wearAmt = 0.3; g.add(cuff);
  const cuff2 = new THREE.Mesh(torus(0.038, 0.007, 5, 16)); cuff2.userData.key = 'sleeve'; cuff2.rotation.x = Math.PI / 2; cuff2.position.y = 0.036; cuff2.scale.set(1.15, 1, 0.88); g.add(cuff2);
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
    if (o.userData.ao) { const p = geo.attributes.position, a = new Float32Array(p.count); for (let i = 0; i < p.count; i++) a[i] = Math.min(1, o.userData.ao(p.getX(i), p.getY(i), p.getZ(i))); geo.setAttribute('ao', new THREE.BufferAttribute(a, 1)); }
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(_m, o.matrixWorld));
    { // subtle baked gradient: surfaces facing down (weapon-space -y) sit in the arm's own shadow
      geo.computeVertexNormals(); const n = geo.attributes.normal; let ao = geo.attributes.ao; if (!ao) { ao = new THREE.BufferAttribute(new Float32Array(n.count), 1); geo.setAttribute('ao', ao); }
      for (let i = 0; i < n.count; i++) ao.setX(i, Math.min(1, ao.getX(i) + 0.4 * Math.max(0, -n.getY(i)) + 0.12 * Math.max(0, -n.getX(i))));
    }
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
  const hand = buildHand(side, { watch: side === 'left' && !pose.keepFore, ...pose }); const fore = buildForearm(pose.forearmLen ?? 0.32);
  root.add(hand); root.add(fore);
  place(hand, fore);
  hand.scale.setScalar(pose.scale ?? (side === 'left' ? 1.08 : 1.0));
  // Elbow off-screen: whatever the weapon pose asked for, bend the forearm steeply down and away from the eye (weapon space: -y down, +z toward the camera).
  if (!pose.keepFore) { const d = new THREE.Vector3(0, 1, 0).applyQuaternion(fore.quaternion); d.y -= 0.55; d.z -= 0.15; d.x *= 0.9; d.normalize(); fore.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); }
  const b = new Builder();
  bakeGroup(root, b, 'none');
  const g = b.build(mats, `arm_${side}`);
  for (const m of g.children) { m.castShadow = true; m.receiveShadow = true; }
  // re-origin the arm at the wrist so rotating the group swings the hand naturally
  const wrist = hand.position.clone();
  for (const m of g.children) m.geometry.translate(-wrist.x, -wrist.y, -wrist.z);
  g.position.copy(wrist);
  g.userData.wrist = wrist.clone();
  g.userData.home = { pos: wrist.clone(), rot: new THREE.Euler() };
  return g;
}

/**
 * Modern "C-clamp" support grip: palm flat on the left face of the handguard, thumb hooked over the top, fingers
 * wrapping forward-down and under; the back of the hand + knuckle plate face the eye (the MW/Tarkov read), wrist low-left
 * and behind, forearm dropping to the lower-left corner. `c` = handguard centre [x, y, z] level with the palm, `r` = radius.
 */
export function supportGrip(hand, fore, c, r = 0.022, elbow = [-0.46, -0.36, 0.06]) {
  const Y = new THREE.Vector3(0.32, -0.45, -0.83).normalize();   // wrist → knuckles: forward, angling down so the fingers wrap under
  const Zb = new THREE.Vector3(-0.93, 0.34, 0.0).normalize();  // back of the hand: left and a little up (toward the eye)
  const X = new THREE.Vector3().crossVectors(Y, Zb).normalize(); // thumb: up and over the top
  const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
  hand.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  const palm = new THREE.Vector3(c[0] - r - 0.015, c[1] - 0.016, c[2]); // palm surface against the left face
  hand.position.copy(palm).addScaledVector(Y, -0.05);
  fore.position.copy(hand.position); fore.lookAt(...elbow); fore.rotateX(Math.PI / 2);
}
