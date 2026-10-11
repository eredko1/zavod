import {compileMapStages} from './map-build.js';
import {serializeBuild} from '../render/scene-wire.js';
self.onmessage=({data})=>{
  try{
    const steps=compileMapStages(data.result,data.settings);let next=steps.next();while(!next.done){const name=next.value;self.postMessage({type:'begin',name});const start=performance.now();next=steps.next();self.postMessage({type:'stage',name,ms:performance.now()-start});}self.postMessage({type:'begin',name:'sceneSerialization'});const start=performance.now(),wire=serializeBuild(next.value);self.postMessage({type:'stage',name:'sceneSerialization',ms:performance.now()-start});self.postMessage({type:'begin',name:'sceneTransfer'});const transferStart=performance.now();self.postMessage({type:'payload',data:wire.payload},wire.transfer);self.postMessage({type:'stage',name:'sceneTransfer',ms:performance.now()-transferStart});self.postMessage({type:'complete'});
  }catch(error){self.postMessage({type:'error',message:error.message});}
};
