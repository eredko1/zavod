// First-person controller + capsule collision. Owned by: PLAYER agent. STUB — replace entirely.
import * as THREE from 'three';
export async function init(ctx) {
  const { camera, input } = ctx;
  const p = { position: new THREE.Vector3(0, 0, 20), velocity: new THREE.Vector3(), yaw: 0, pitch: 0, height: 1.7, health: 100, maxHealth: 100, onGround: true, crouching: false, sprinting: false, ads: false, speed: 0 };
  p.eye = () => new THREE.Vector3(p.position.x, p.position.y + p.height, p.position.z);
  p.teleport = (x, y, z, yaw = 0, pitch = 0) => { p.position.set(x, y, z); p.yaw = yaw; p.pitch = pitch; p.velocity.set(0, 0, 0); };
  p.damage = (amount, from) => { p.health = Math.max(0, p.health - amount); ctx.bus.emit('playerDamaged', { amount, from }); if (p.health <= 0) { ctx.bus.emit('playerDied'); ctx.setState('dead'); } };
  return p;
}
export function update(dt, ctx) {
  const p = ctx.player, { input, camera } = ctx;
  if (dt === 0) return;
  const sens = ctx.settings.sensitivity * (p.ads ? ctx.settings.adsSensitivityMul : 1);
  p.yaw -= input.mouse.dx * sens; p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch - input.mouse.dy * sens));
  const f = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)), r = new THREE.Vector3(f.z, 0, -f.x);
  const mv = new THREE.Vector3();
  if (input.forward) mv.add(f); if (input.back) mv.sub(f); if (input.right) mv.add(r); if (input.left) mv.sub(r);
  p.sprinting = input.sprint && input.forward; p.crouching = input.crouch;
  const spd = p.sprinting ? 6.5 : p.crouching ? 2.2 : 4.4;
  if (mv.lengthSq() > 0) mv.normalize().multiplyScalar(spd);
  p.velocity.x = mv.x; p.velocity.z = mv.z;
  p.position.addScaledVector(p.velocity, dt);
  p.speed = Math.hypot(p.velocity.x, p.velocity.z);
  p.height = p.crouching ? 1.15 : 1.7;
  camera.position.copy(p.eye()); camera.rotation.set(p.pitch, p.yaw, 0);
}
