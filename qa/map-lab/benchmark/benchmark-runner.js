import { summarizeFrames, fingerprint, validateRepeats } from './frame-report.js';
import { replayConfig } from './replay-config.js';
import { sceneMetadata } from './scene-metadata.js';
import { observeEnvironment, validateAssets } from './record-validity.js';
import { checkAbort } from '../data/request-abort.js';
export { sceneMetadata } from './scene-metadata.js';

export async function recordRepeat(harness, config, { signal, progress = () => {}, rebuild = false } = {}) {
  const {world,profiler}=harness;let raw;
  if(profiler.busy)throw Error('Benchmark profiler is already in use');
  const environment=observeEnvironment(world.renderer.domElement);
  const check=()=>checkAbort(signal),cancel=()=>harness.cancelReplay('Benchmark cancelled');signal?.addEventListener('abort',cancel,{once:true});
  try {
    check();profiler.start();
    if(rebuild)harness.loadResult(world.selection,world.settings);
    const assetWaitMs=await profiler.waitForAssets();check();
    if(rebuild)await harness.runReplay('first-draw',{warmup:0,frames:2});
    for(const mode of config.modes){check();progress(mode);await harness.runReplay(mode,config);}
    raw=await profiler.stop();check();
    validateAssets(raw,config.modes);environment.validate();
    const summaries=Object.fromEntries(await Promise.all([...rebuild?['first-draw']:[],...config.modes].map(async mode=>[mode,await summarizeFrames(raw,mode)])));check();
    const metadata=sceneMetadata(world);if(metadata.contextLost)throw Error('WebGL context was lost');
    return {raw,summaries,metadata,assetWaitMs};
  } catch(e){e.profile=raw || await profiler.stop();throw e;}
  finally {environment.dispose();signal?.removeEventListener('abort',cancel);harness.finishReplay();}
}
export async function runBenchmark(harness, { options={}, signal, progress, onReport=()=>{}, generationProfile=null } = {}) {
  const {world}=harness,config=replayConfig(options,harness.scenarios),report={schema:4,kind:'interactive',status:'running',recordedAt:new Date().toISOString(),inputHash:await fingerprint(JSON.stringify(world.selection)),config,scenarioVersions:Object.fromEntries(config.modes.map(id=>[id,harness.scenarios[id].version])),runs:[],generationProfile};onReport(report);
  try {for(let repeat=0;repeat<config.repeats;repeat++){checkAbort(signal);const run=await recordRepeat(harness,config,{signal,rebuild:true,progress:mode=>progress?.(repeat,mode)});report.runs.push({repeat,...run});}
    checkAbort(signal);validateRepeats(report);report.status='complete';
  } catch(e){report.status=signal?.aborted?'cancelled':'failed';report.failure=e.message;report.failureProfile=e.profile;}
  return report;
}
