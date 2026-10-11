import {checkAbort} from '../data/request-abort.js';
import {restoreBuild,releaseBuild} from '../render/scene-wire.js';
import {runBuildStagesAsync} from './build-stages.js';
import {compilerInput} from './compiler-input.js';

export async function compileMapInWorker(result,settings,mark,beforeStage,signal){
  checkAbort(signal);await beforeStage('sourceTransfer');checkAbort(signal);
  const worker=new Worker(new URL('./map-build-worker.js',import.meta.url),{type:'module'});
  let built;
  try{
    const data=await new Promise((resolve,reject)=>{
      let progress=Promise.resolve(),settled=false,payload;const abort=()=>finish(reject,signal.reason||Error('Build cancelled')),finish=(fn,value)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);fn(value);};signal?.addEventListener('abort',abort,{once:true});
      worker.onerror=event=>finish(reject,Error(event.message));worker.onmessageerror=()=>finish(reject,Error('Compiled scene could not be deserialized.'));worker.onmessage=({data})=>{
        if(settled)return;
        if(data.type==='begin'){progress=progress.then(()=>{if(!settled)return beforeStage(data.name);});progress.catch(error=>finish(reject,error));}
        else if(data.type==='stage')mark(data.name,data.ms,'worker');
        else if(data.type==='payload')payload=data.data;
        else if(data.type==='error')finish(reject,Error(data.message));else if(data.type==='complete'){if(!payload)finish(reject,Error('Build worker omitted its compiled scene.'));else progress.then(()=>finish(resolve,payload),error=>finish(reject,error));}else finish(reject,Error('Unsupported build worker message.'));
      };
      try{const start=performance.now();worker.postMessage({result:compilerInput(result),settings});mark('sourceTransfer',performance.now()-start);}catch(error){finish(reject,error);}
    });
    checkAbort(signal);built=await runBuildStagesAsync(restoreBuild(data,result,settings),mark,async name=>{checkAbort(signal);await beforeStage(name);checkAbort(signal);});checkAbort(signal);return built;
  }catch(error){if(built)releaseBuild(built);throw error;}
  finally{worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;worker.terminate();}
}
