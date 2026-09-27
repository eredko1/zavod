import { summarizeFrames, fingerprint, validateRepeats, validateReplay } from './frame-report.js';
import { replayConfig } from './replay-config.js';
import { sceneMetadata } from './scene-metadata.js';
import { observeEnvironment, validateAssets } from './record-validity.js';
import { checkAbort } from '../data/request-abort.js';
import {scenarioRequirements} from './scenarios.js';
export { sceneMetadata } from './scene-metadata.js';

export async function recordRepeat(harness, config, { signal, progress = () => {}, rebuild = false } = {}) {
  const {world,profiler}=harness;let raw;
  if(profiler.busy)throw Error('Benchmark profiler is already in use');
  let environment;
  const check=()=>checkAbort(signal),cancel=()=>harness.cancelReplay('Benchmark cancelled');signal?.addEventListener('abort',cancel,{once:true});
  try {
    if(rebuild){world.stop();await progress('Rebuilding map');}
    // The caller finishes its layout before the measurement environment is pinned.
    environment=observeEnvironment(world.renderer.domElement);
    check();profiler.start();
    if(rebuild)await harness.loadResult(world.selection,world.settings,async stage=>{check();await progress('Rebuilding map',stage);check();});
    const assetWaitMs=await profiler.waitForAssets();check();
    if(rebuild){progress('First draw');await harness.runReplay('first-draw',{warmup:0,frames:2});}
    for(const mode of config.modes){check();progress(mode);await harness.runReplay(mode,config);}
    progress('Collecting GPU timings');raw=await profiler.stop();check();
    validateAssets(raw,config.modes);environment.validate();
    const summaries=Object.fromEntries(await Promise.all([...rebuild?['first-draw']:[],...config.modes].map(async mode=>[mode,await summarizeFrames(raw,mode)])));check();
    validateReplay(summaries,config,harness.scenarios);
    progress('Checking results');const metadata=sceneMetadata(world);if(metadata.contextLost)throw Error('WebGL context was lost');
    return {raw,summaries,metadata,assetWaitMs};
  } catch(e){e.profile=raw || await profiler.stop();throw e;}
  finally {environment?.dispose();signal?.removeEventListener('abort',cancel);harness.finishReplay();}
}
export async function runBenchmark(harness, { options={}, signal, progress, onReport=()=>{}, generationProfile=null } = {}) {
  const {world}=harness,config=replayConfig(options,harness.scenarios),report={schema:5,kind:'interactive',status:'running',recordedAt:new Date().toISOString(),inputHash:await fingerprint(JSON.stringify(world.selection)),config,scenarioVersions:Object.fromEntries(config.modes.map(id=>[id,harness.scenarios[id].version])),scenarioRequirements:scenarioRequirements(config.modes,harness.scenarios),runs:[],generationProfile};onReport(report);
  try {for(let repeat=0;repeat<config.repeats;repeat++){checkAbort(signal);const run=await recordRepeat(harness,config,{signal,rebuild:true,progress:(mode,stage)=>progress?.(repeat,mode,stage)});report.runs.push({repeat,...run});}
    checkAbort(signal);validateRepeats(report);report.status='complete';
  } catch(e){report.status=signal?.aborted?'cancelled':'failed';report.failure=e.message;report.failureProfile=e.profile;}
  return report;
}
