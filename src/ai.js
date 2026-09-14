// Enemy soldiers: models, animation, navigation, cover, combat. Owned by: AI agent. STUB — replace entirely.
import * as THREE from 'three';
export async function init(ctx) {
  return { soldiers: [], frozen: false, qaKillAll: () => {}, damage: (soldier, amount, point, headshot) => {} };
}
export function update(dt, ctx) {}
