import { distribution, gpuStatusCounts } from './frame-profiler.js';
export { SCENARIOS } from './replay-config.js';
export async function fingerprint(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export async function summarizeFrames(raw, mode) {
  const frames=raw.frames.filter(f=>f.phase===mode), rendered=frames.filter(f=>f.rendered), cpu={},resources={};
  for(const name of ['loop','controls','simulation','collision','ground','renderSubmit','other','profilerPoll']) cpu[name]=distribution(frames.map(f=>f.cpu[name]||0));
  for(const kind of ['textureUpload','bufferUpload','shaderSetup']) { const e=frames.flatMap(f=>f.resources).filter(e=>e.kind===kind); resources[kind]={calls:e.length,cpuTotalMs:e.reduce((s,e)=>s+e.cpuMs,0)}; }
  const poses=frames.map(f=>[...f.pose.position,...f.pose.quaternion,f.pose.yaw,f.pose.pitch].map(v=>Number(v.toFixed(6))));
  const distance=frames.slice(1).reduce((s,f,i)=>s+Math.hypot(f.pose.position[0]-frames[i].pose.position[0],f.pose.position[2]-frames[i].pose.position[2]),0);
  return {frames:frames.length,rendered:rendered.length,cpu,gpu:distribution(rendered.map(f=>f.gpuMs)),gpuStatus:gpuStatusCounts(rendered),interval:distribution(frames.slice(1).map(f=>f.intervalMs)),overBudgetCpu:frames.filter(f=>f.cpu.loop>1000/60).length,overBudgetGpu:rendered.filter(f=>f.gpuMs>1000/60).length,slowIntervals:frames.slice(1).filter(f=>f.intervalMs>25).length,drawCalls:distribution(rendered.map(f=>f.drawCalls)),triangles:distribution(rendered.map(f=>f.triangles)),textures:distribution(rendered.map(f=>f.textures)),resources,poseHash:await fingerprint(JSON.stringify(poses)),distance,hiddenFrames:frames.filter(f=>!f.visible).length};
}
const same=(a,b,message)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(message);};
export function validateBaseline(baseline, candidate) {
  if(baseline.status!=='complete' || baseline.runs?.length!==baseline.config?.repeats) throw Error('Baseline must be complete with all repeats');
  for(const key of ['schema','inputHash','config','scenarioVersions'])same(baseline[key],candidate[key],`Baseline ${key} mismatch`);
  for(const run of baseline.runs)for(const mode of baseline.config.modes)if(run.summaries?.[mode]?.frames!==baseline.config.frames)throw Error(`Incomplete baseline scenario: ${mode}`);
}
export function validateRepeats(report) {
  if(report.runs.length!==report.config.repeats)throw Error('Missing benchmark repeats');
  const first=report.runs[0];
  for(const run of report.runs){
    for(const key of ['gpu','browser','viewport','canvas','devicePixelRatio','settings','featureIDs','assetHashes','geometryCoverage','servedCodeHash'])same(run.metadata[key],first.metadata[key],`Repeat ${key} mismatch`);
    for(const mode of report.config.modes){const s=run.summaries[mode];if(s.frames!==report.config.frames||s.hiddenFrames)throw Error(`Invalid frame coverage: ${mode}`);same(s.poseHash,first.summaries[mode].poseHash,`Replay path drift: ${mode}`);}
  }
}
export function validateComparison(before, after, allowContentChange=false) {
  if(after.status!=='complete')throw Error('Comparison candidate must be complete');
  validateBaseline(before,after);validateRepeats(before);validateRepeats(after);
  for(const report of [before,after])for(const run of report.runs)for(const mode of report.config.modes){
    const s=run.summaries[mode],unsupported=s.gpu?.samples===0&&s.gpuStatus?.unsupported===s.rendered;
    if(s.rendered>0&&s.gpu?.samples!==s.rendered&&!unsupported)throw Error(`Incomplete GPU sample coverage: ${mode}`);
  }
  for(const key of ['gpu','browser','viewport','canvas','devicePixelRatio','settings',...allowContentChange?[]:['featureIDs','assetHashes','materialTextures','geometryCoverage']])same(before.runs[0].metadata[key],after.runs[0].metadata[key],`Comparison ${key} mismatch`);
  for(const mode of after.config.modes)same(before.runs[0].summaries[mode].poseHash,after.runs[0].summaries[mode].poseHash,`Camera route differs: ${mode}`);
}
