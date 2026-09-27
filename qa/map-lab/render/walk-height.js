import {MOVEMENT} from './movement.js';

// Swept vertical landing: a fast fall must not skip a thin roof or deck.
export function advanceHeight(position, motion, dt, supportAt) {
  const feet=position.y-MOVEMENT.eye,ceiling=feet+(motion.grounded?MOVEMENT.step:MOVEMENT.contactEpsilon);
  const support=supportAt(position.x,position.z,ceiling);
  if(motion.grounded&&Math.abs(support-feet)<=MOVEMENT.step){position.y=support+MOVEMENT.eye;motion.velocity=0;return;}
  const next=feet+motion.velocity*dt-MOVEMENT.gravity*dt*dt/2;motion.velocity-=MOVEMENT.gravity*dt;motion.grounded=false;
  if(Number.isFinite(support)&&next<=support){position.y=support+MOVEMENT.eye;motion.velocity=0;motion.grounded=true;}
  else position.y=next+MOVEMENT.eye;
}
