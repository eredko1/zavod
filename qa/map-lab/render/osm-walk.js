import { inShape } from '../pipeline/osm-model.js';
export function edgeDistance(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}
export function blocked(x, z, plan, radius = 0.28, ground = plan.groundSample?.(x, z) ?? 0) {
  return plan.buildings.some(b => b.extrude && !b.suppressed && !b.failed && b.height.bottom + (b.ground || 0) < ground + 1.8 && b.height.top + (b.ground || 0) > ground && b.shapes.some(s =>
    inShape(x, z, s) || [s.outer, ...s.holes].some(r => r.some((p, i) => edgeDistance(x, z, p, r[(i + 1) % r.length]) < radius))));
}
export function move(position, dx, dz, plan, collision = blocked) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.12));
  for (let i = 0; i < steps; i++) { if (!collision(position.x + dx / steps, position.z, plan)) position.x += dx / steps; if (!collision(position.x, position.z + dz / steps, plan)) position.z += dz / steps; }
}
export function spawn(plan) {
  const candidates = plan.roads.flatMap(r => r.paths.flatMap(p => p.flatMap((v, i) => i ? [v, [(v[0] + p[i - 1][0]) / 2, (v[1] + p[i - 1][1]) / 2]] : [v]))).sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  return candidates.find(p => !blocked(...p, plan, 1)) || [plan.bounds.x0 - 5, plan.bounds.z0 - 5];
}
