// MAP: STONY BROOK — STUB. Owned by: SBU agent (this file plus ../sbu/*.js helpers and assets/models/sbu/).
import * as THREE from 'three';

export const meta = {
  id: 'sbu', name: 'STONY BROOK', subtitle: 'DAY OPS · ACADEMIC MALL', time: 'day', weather: 'clear',
  description: 'Stony Brook University, Long Island: the Academic Mall, brutalist concrete library and lecture halls, the SAC steps, Staller plaza and campus greens.',
  grade: 'day', ambience: 'sbu-day', thumb: 'assets/thumbs/sbu.jpg',
};

export function build(world) {
  const { ctx, W, scene } = world;
  ctx.renderer.toneMappingExposure = 1.0;
  W.bounds.set(new THREE.Vector3(-70, -1, -70), new THREE.Vector3(70, 40, 70));
  scene.background = new THREE.Color(0x9fb3c8);
  scene.fog = new THREE.FogExp2(0x9fb3c8, 0.004);
  const hemi = new THREE.HemisphereLight(0xbfd4ee, 0x5a5348, 0.9); scene.add(hemi); ctx.lights.hemi = hemi;
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.0); sun.position.set(40, 60, 20); sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096); sun.shadow.camera.left = -80; sun.shadow.camera.right = 80; sun.shadow.camera.top = 80; sun.shadow.camera.bottom = -80; sun.shadow.camera.far = 200; sun.shadow.bias = -0.0005;
  scene.add(sun); scene.add(sun.target); ctx.lights.key = sun;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x6d6a63, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.name = 'ground'; scene.add(floor); world.solid(floor, 'concrete', { collide: false });
  for (let i = 0; i < 16; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 3), new THREE.MeshStandardMaterial({ color: 0x8a4a3a, roughness: 0.7 })); b.position.set((world.R() - 0.5) * 100, 1.5, (world.R() - 0.5) * 100); b.name = 'stub'; scene.add(b); world.solid(b, 'metal'); }
  const v = (x, z) => new THREE.Vector3(x, 0, z);
  W.playerSpawns = [v(0, 55), v(8, 55), v(-8, 55)];
  W.enemySpawns = [v(-40, -40), v(0, -50), v(40, -40), v(-55, 0), v(55, 0), v(-40, 30), v(40, 30), v(20, -20), v(-20, -20), v(0, -20), v(50, -50), v(-50, -50)];
  for (let i = 0; i < 40; i++) world.cover((world.R() - 0.5) * 100, (world.R() - 0.5) * 100, 0, 1);
  W.poses = { spawn: [0, 0, 55, 0, 0], hero: [0, 0, 30, 0, 0], overview: [0, 30, 90, 0, -0.4] };
  W.surfaceAt = () => 'concrete';
}
