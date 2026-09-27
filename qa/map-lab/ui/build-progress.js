import {checkAbort} from '../data/request-abort.js';
const LABELS={normalize:'Reading map features',merge:'Merging sources',terrainSamples:'Preparing elevation data',meshes:'Creating meshes',drape:'Fitting geometry to elevation',baseTerrain:'Creating ground',surfaceIndex:'Preparing walking surfaces',propPlacement:'Placing objects',boundInstances:'Clipping area edges',sceneSwap:'Opening the world'};
export const buildStageLabel=name=>LABELS[name]||name;
export function paintProgress(signal){
  checkAbort(signal);
  return new Promise((resolve,reject)=>{let frame;
    const finish=()=>{cancelAnimationFrame(frame);signal?.removeEventListener('abort',finish);try{checkAbort(signal);resolve();}catch(error){reject(error);}};
    signal?.addEventListener('abort',finish,{once:true});frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(finish);});
  });
}
export function createBuildProgress(card){
  return {show(text){card.hidden=false;card.querySelector('[data-loading-stage]').textContent=text;},hide(){card.hidden=true;}};
}
