// Level, materials, lighting, weather. Owned by: WORLD agent. STUB — replace entirely.
import * as THREE from 'three';
export async function init(ctx) {
  const { scene } = ctx;
  scene.background = new THREE.Color(0x0b0f14);
  scene.fog = new THREE.FogExp2(0x0b0f14, 0.02);
  const hemi = new THREE.HemisphereLight(0x334455, 0x111111, 0.6); scene.add(hemi); ctx.lights.hemi = hemi;
  const key = new THREE.DirectionalLight(0x8899bb, 1.2); key.position.set(20, 40, 10); key.castShadow = true; scene.add(key); ctx.lights.key = key;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor); ctx.raycastTargets.push(floor);
  for (let i = 0; i < 12; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 2.4), new THREE.MeshStandardMaterial({ color: 0x556677, roughness: 0.6, metalness: 0.4 }));
    b.position.set((ctx.rng() - 0.5) * 80, 1.3, (ctx.rng() - 0.5) * 80); b.castShadow = b.receiveShadow = true; scene.add(b);
    ctx.colliders.push(new THREE.Box3().setFromObject(b)); ctx.raycastTargets.push(b);
  }
  return {
    poses: { spawn: [0, 0, 20, 0, 0], overview: [0, 12, 40, 0, -0.3] },
    playerSpawns: [new THREE.Vector3(0, 0, 20)],
    enemySpawns: [new THREE.Vector3(0, 0, -30), new THREE.Vector3(20, 0, -20), new THREE.Vector3(-20, 0, -20)],
    navNodes: [], bounds: new THREE.Box3(new THREE.Vector3(-100, 0, -100), new THREE.Vector3(100, 20, 100)),
    groundHeight: (x, z) => 0,
  };
}
export function update(dt, ctx) {}
