import { inShape } from '../pipeline/osm-model.js';
import {edgeDistance} from '../pipeline/geometry-distance.js';
export {edgeDistance};
export function blocked(x, z, plan, radius = 0.28, ground = plan.groundSample?.(x, z) ?? 0) {
  return plan.buildings.some(b => b.extrude && !b.suppressed && !b.failed && b.height.bottom + (b.ground || 0) < ground + 1.8 && b.height.top + (b.ground || 0) > ground && b.shapes.some(s =>
    inShape(x, z, s) || [s.outer, ...s.holes].some(r => r.some((p, i) => edgeDistance(x, z, p, r[(i + 1) % r.length]) < radius))));
}
export function move(position, dx, dz, plan, collision = blocked) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.12));
  for (let i = 0; i < steps; i++) { if (!collision(position.x + dx / steps, position.z, plan)) position.x += dx / steps; if (!collision(position.x, position.z + dz / steps, plan)) position.z += dz / steps; }
}
export function spawn(plan) {
  const b=plan.bounds,clearance=Math.min(1,(b.x1-b.x0)/4,(b.z1-b.z0)/4),inside=([x,z])=>[Math.max(b.x0+clearance,Math.min(b.x1-clearance,x)),Math.max(b.z0+clearance,Math.min(b.z1-clearance,z))];
  const candidates = plan.roads.filter(r=>!r.reference).flatMap(r => r.paths.flatMap(p => p.flatMap((v, i) => i ? [v, [(v[0] + p[i - 1][0]) / 2, (v[1] + p[i - 1][1]) / 2]] : [v]))).map(inside).sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  const GRID_STEPS=8;for(let z=0;z<=GRID_STEPS;z++)for(let x=0;x<=GRID_STEPS;x++)candidates.push(inside([b.x0+(b.x1-b.x0)*x/GRID_STEPS,b.z0+(b.z1-b.z0)*z/GRID_STEPS]));
  const point=candidates.find(p=>!blocked(...p,plan,clearance));if(!point)throw Error('No clear ground spawn inside this area. Use Walk here to choose a surface.');return point;
}
