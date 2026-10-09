// Fists: both hands up in a loose guard (fingers curled, thumbs over). Melee like the knife (a short hitscan "punch", spec.melee):
// jab / cross alternate, a quick third punch is a hook for more. weapons.js drops the hands out of view when you haven't punched
// for a moment, so walking about in chill mode nobody's waving anything around. Chill mode's default; 7 / numpad 7 anywhere.
// Owned by: WEAPONS agent.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const FISTS_SPEC = {
  id: 'fists', name: 'FISTS', class: 'Melee', slot: 0, mode: 'MELEE', melee: true, fists: true,
  desc: 'Two hands and a bad attitude. Jab, cross, hook: chain them for the big one.',
  mag: 1, reserve: 0, rpm: 190, auto: false, damage: 14, headMul: 1.5, range: 1.8, falloff: [2, 2, 1],
  reloadStyle: 'mag', reloadKeys: { magGrab: [0, 0, 0], down: [0, 0, 0], rack: [0, 0, 0], tiltK: 0 },
  flashSize: 0, flashStrength: 0, brassScale: 0,
  stats: { damage: 14, rpm: 190, range: 2, mag: 1, mobility: 100, accuracy: 100 },
  hipSpread: 0.3, adsSpread: 0.3, spreadPerShot: 0, spreadMax: 0, moveSpread: 0,
  recoilPitch: 0, recoilYaw: 0, kickBack: -0.4, kickUp: -0.15, kickRoll: 0.2,
  reloadTime: 1, reloadTimeTac: 1, swapTime: 0.18, adsTime: 0.15, adsDist: 0.3,
  hip: { pos: [0, -0.1, -0.3], rot: [0.1, 0, 0] },
  sprint: { pos: [0, -0.2, -0.26], rot: [-0.3, 0, 0] },
  lower: { pos: [0, -0.4, -0.24], rot: [-0.9, 0, 0] },
};

// a bare fist, modelled directly (the gun hands are gloved): x across the knuckles, y up, +z back toward the wrist and the eye.
// sgn = 1 right hand, -1 left. Built from rounded blocks at a real hand's proportions (a fist is ~9 cm across the knuckles, the
// back of the hand flat, the fingers 2 cm rods folded under, the thumb tucked across the middle segments), not spheres: spheres
// read as balloons at this distance. The forearm goes into a jacket sleeve.
function bareFist(sgn, skin, knuckle, nail, sleeve) {
  const g = new THREE.Group(), add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.rotation.set(rx, ry, rz); g.add(me); return me; };
  const rb = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 3, r);
  // the back of the hand: a flat, slightly tapered slab sloping down from the wrist to the knuckles
  add(rb(0.078, 0.026, 0.07, 0.011), skin, 0, 0.004, 0.006, -0.12, 0, 0);
  // four knuckles and their curled fingers. Index and middle stand furthest forward, the ring and little fingers step back and
  // down; each finger is the first segment (down the front of the fist) and the second (folded back underneath)
  const F = [[-0.027, 0.0195, 0], [-0.0085, 0.02, 0.002], [0.0095, 0.019, -0.003], [0.026, 0.0165, -0.009]];
  // the shadowed creases between the fingers: a darker core behind them (the fingers sit a hair apart over it)
  add(rb(0.074, 0.03, 0.03, 0.008), knuckle, 0, -0.012, -0.03, 0.05, 0, 0);
  F.forEach(([x0, w0, dz], k) => { const x = sgn * x0, dy = k === 3 ? -0.004 : 0, w = w0 * 0.9;
    add(rb(w, 0.012, 0.016, 0.0055), knuckle, x, 0.014 + dy, -0.03 + dz);                       // knuckle ridge
    add(rb(w * 0.96, 0.034, 0.02, 0.0075), skin, x, -0.004 + dy, -0.04 + dz, 0.12, 0, 0);       // first segment, down the front
    add(rb(w * 0.92, 0.018, 0.026, 0.0075), skin, x, -0.024 + dy, -0.026 + dz, 0, 0, 0);      // second segment, folded under
    add(rb(w * 0.55, 0.0025, 0.009, 0.001), nail, x, -0.0335 + dy, -0.02 + dz); });             // a nail peeking out underneath
  // the thumb: its base along the inner side of the hand, the end laid across the front of the index and middle fingers
  add(rb(0.022, 0.02, 0.045, 0.009), skin, -sgn * 0.038, -0.01, -0.002, 0.15, -sgn * 0.35, 0);
  add(rb(0.04, 0.017, 0.019, 0.008), skin, -sgn * 0.021, -0.02, -0.046, 0, 0, sgn * 0.08);
  add(rb(0.011, 0.0025, 0.012, 0.001), nail, -sgn * 0.006, -0.0115, -0.047);
  // the wrist (a flattened oval, narrower than the hand) and the forearm, dropping back and out to the edge of the screen
  const wrist = add(new THREE.CylinderGeometry(0.025, 0.027, 0.05, 16), skin, 0, -0.004, 0.06, Math.PI / 2 - 0.05, 0, 0); wrist.scale.set(1.25, 1, 0.82);
  const fore = add(new THREE.CylinderGeometry(0.031, 0.025, 0.2, 16), skin, sgn * 0.012, -0.04, 0.17, Math.PI / 2 - 0.42, 0, -sgn * 0.06); fore.scale.set(1.2, 1, 0.85);
  // a jacket sleeve from mid forearm on, with a cuff, running off the bottom corner of the screen
  const cuff = add(new THREE.CylinderGeometry(0.041, 0.04, 0.035, 18), sleeve, sgn * 0.024, -0.075, 0.26, Math.PI / 2 - 0.45, 0, -sgn * 0.07); cuff.scale.set(1.15, 1, 0.9);
  const arm = add(new THREE.CylinderGeometry(0.048, 0.042, 0.4, 18), sleeve, sgn * 0.05, -0.16, 0.44, Math.PI / 2 - 0.48, 0, -sgn * 0.1); arm.scale.set(1.1, 1, 0.92);
  return g;
}

export function buildFists(mats) {
  const group = new THREE.Group(); group.name = 'fists'; const parts = {};
  // skin: a warm mid tone, matte, a touch of sheen like real skin; the knuckles a little redder; a dark jacket sleeve
  if (!mats.fistSkin) {
    mats.fistSkin = new THREE.MeshPhysicalMaterial({ color: 0xb27b5e, roughness: 0.68, metalness: 0, sheen: 0.4, sheenColor: new THREE.Color(0xf0c8b0), sheenRoughness: 0.6 });
    mats.fistKnuckle = new THREE.MeshPhysicalMaterial({ color: 0xa86b52, roughness: 0.72, metalness: 0, sheen: 0.3, sheenColor: new THREE.Color(0xf0c0a8), sheenRoughness: 0.6 });
    mats.fistNail = new THREE.MeshStandardMaterial({ color: 0xd9b3a0, roughness: 0.32 });
    mats.fistSleeve = new THREE.MeshStandardMaterial({ color: 0x23252b, roughness: 0.92, metalness: 0 });
  }
  const body = new THREE.Group(); body.name = 'fistsBody'; group.add(body); parts.body = body;
  parts.sight = new THREE.Object3D(); parts.sight.position.set(0, 0.03, 0); group.add(parts.sight);
  parts.muzzle = new THREE.Object3D(); parts.muzzle.position.set(0, 0.0, -0.2); group.add(parts.muzzle);
  parts.eject = new THREE.Object3D(); group.add(parts.eject);
  // the guard: right fist a touch lower and further back, both turned slightly in, knuckles toward the target
  for (const [sgn, key, x, y, z, ry] of [[1, 'armR', 0.105, -0.04, -0.07, 0.22], [-1, 'armL', -0.105, -0.025, -0.11, -0.22]]) {
    const f = bareFist(sgn, mats.fistSkin, mats.fistKnuckle, mats.fistNail, mats.fistSleeve); f.position.set(x, y, z); f.rotation.set(0.32, ry, sgn * -0.62);   // rolled in: thumb side up, the curl of the fingers toward you
    f.userData.home = { pos: f.position.clone(), rot: f.rotation.clone() }; group.add(f); parts[key] = f; }
  group.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = true; } });
  return { group, parts, spec: FISTS_SPEC };
}
