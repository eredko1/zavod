// The same generator drives synchronous tests and paintable interactive builds.
// Only stage execution is measured; UI paint waits remain outside those timings.
const advance=(steps,name,mark)=>{const start=performance.now();try{return steps.next();}finally{mark(name,performance.now()-start);}};
export function runBuildStages(steps,mark=()=>{}){
  let next=steps.next();while(!next.done)next=advance(steps,next.value,mark);return next.value;
}
export async function runBuildStagesAsync(steps,mark,beforeStage){
  try{let next=steps.next();while(!next.done){await beforeStage(next.value);next=advance(steps,next.value,mark);}return next.value;}
  catch(error){steps.throw(error);throw error;}
}
