// Weapons, first-person viewmodel, ballistics, impacts. Owned by: WEAPONS agent. STUB — replace entirely.
import * as THREE from 'three';
export async function init(ctx) {
  const api = { current: { name: 'M4', ammo: 30, mag: 30, reserve: 120 }, qaFire: (n) => {} };
  return api;
}
export function update(dt, ctx) {}
