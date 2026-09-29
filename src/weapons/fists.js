// Fists: both hands up in a loose guard (fingers curled, thumbs over). Melee like the knife (a short hitscan "punch", spec.melee):
// jab / cross alternate, a quick third punch is a hook for more. weapons.js drops the hands out of view when you haven't punched
// for a moment, so walking about in chill mode nobody's waving anything around. Chill mode's default; 7 / numpad 7 anywhere.
// Owned by: WEAPONS agent.
import * as THREE from 'three';

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
// sgn = 1 right hand, -1 left: the thumb wraps across the front of the fingers toward the body's centre
function bareFist(sgn, skin, nail) {
  const g = new THREE.Group(), add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.rotation.set(rx, ry, rz); g.add(me); return me; };
  const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 4, 10);
  // the back of the hand / palm block, slightly rounded, and the knuckle row across the front top
  { const m = add(new THREE.SphereGeometry(1, 18, 12), skin, 0, 0.004, 0.012); m.scale.set(0.043, 0.029, 0.045); }   // the back of the hand and palm, rounded
  for (let k = 0; k < 4; k++) { const x = sgn * (-0.027 + k * 0.018), r = k === 3 ? 0.0098 : 0.0112;
    add(new THREE.SphereGeometry(r, 10, 8), skin, x, 0.02, -0.028 - (k === 0 || k === 3 ? -0.003 : 0));   // knuckle
    // the curled finger: first segment down the front, second folded back under
    add(cap(r * 0.95, 0.018), skin, x, 0.002, -0.036, 0, 0, 0);
    add(cap(r * 0.9, 0.016), skin, x, -0.02, -0.022, Math.PI / 2, 0, 0);
    add(new THREE.BoxGeometry(r * 1.1, 0.002, r * 1.1), nail, x, -0.03, -0.012); }
  // the thumb: a pad at the heel of the hand, then laid across the front of the index and middle fingers
  add(new THREE.SphereGeometry(0.02, 10, 8), skin, -sgn * 0.034, -0.006, 0.02);
  add(cap(0.011, 0.03), skin, -sgn * 0.016, -0.014, -0.036, 0, 0, Math.PI / 2 - sgn * 0.25);
  // wrist and bare forearm, dropping back and out toward the elbow (off the bottom corner of the screen)
  add(new THREE.CylinderGeometry(0.03, 0.028, 0.05, 12), skin, 0, -0.002, 0.07, Math.PI / 2, 0, 0);
  const fore = add(new THREE.CylinderGeometry(0.03, 0.026, 0.3, 12), skin, sgn * 0.035, -0.08, 0.21, Math.PI / 2 - 0.55, 0, -sgn * 0.15);
  void fore; return g;
}

export function buildFists(mats) {
  const group = new THREE.Group(); group.name = 'fists'; const parts = {};
  if (!mats.fistSkin) { mats.fistSkin = new THREE.MeshStandardMaterial({ color: 0xc98f6a, roughness: 0.62, metalness: 0 }); mats.fistNail = new THREE.MeshStandardMaterial({ color: 0xe8c8b8, roughness: 0.35 }); }
  const body = new THREE.Group(); body.name = 'fistsBody'; group.add(body); parts.body = body;
  parts.sight = new THREE.Object3D(); parts.sight.position.set(0, 0.03, 0); group.add(parts.sight);
  parts.muzzle = new THREE.Object3D(); parts.muzzle.position.set(0, 0.0, -0.2); group.add(parts.muzzle);
  parts.eject = new THREE.Object3D(); group.add(parts.eject);
  // the guard: right fist a touch lower and further back, both turned slightly in, knuckles toward the target
  for (const [sgn, key, x, y, z, ry] of [[1, 'armR', 0.105, -0.04, -0.07, 0.22], [-1, 'armL', -0.105, -0.025, -0.11, -0.22]]) {
    const f = bareFist(sgn, mats.fistSkin, mats.fistNail); f.position.set(x, y, z); f.rotation.set(0.12, ry, sgn * -0.12);
    f.userData.home = { pos: f.position.clone(), rot: f.rotation.clone() }; group.add(f); parts[key] = f; }
  group.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = true; } });
  return { group, parts, spec: FISTS_SPEC };
}
