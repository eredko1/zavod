import { MOVEMENT } from '../render/movement.js';

// Scenario factories reset the scene once; step() is driven by fixed simulation time.
const idle = world => { world.fit();world.look(0,0);return ()=>null; };
const orbit = world => {
  idle(world);const b=world.plan.bounds,center={x:(b.x0+b.x1)/2,z:(b.z0+b.z1)/2},offset=world.camera.position.clone();offset.x-=center.x;offset.z-=center.z;
  return t=>{const angle=t*.35,c=Math.cos(angle),s=Math.sin(angle);world.camera.position.set(center.x+offset.x*c+offset.z*s,offset.y,center.z+offset.z*c-offset.x*s);world.invalidate();return null;};
};
const walking = speed => world => {idle(world);world.walk({capture:false});return t=>{world.look(.65*Math.sin(t*.7),.22*Math.sin(t*.9));return {x:.3*Math.sin(t),z:-1,speed};};};
export const DEFAULT_SCENARIOS = Object.freeze({
  idle:{version:1,create:idle},orbit:{version:1,create:orbit},
  'walk-turn':{version:1,create:walking(MOVEMENT.walk)},'run-turn':{version:1,create:walking(MOVEMENT.run)},
});
