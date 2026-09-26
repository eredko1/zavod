import { distribution, gpuStatusCounts } from './frame-profiler.js';

export const FRAME_LIMIT_MS = 1000 / 60;
export const CPU_STAGES = [
  ['controls','Controls','#5cd0ef'], ['ground','Ground lookup','#93d189'],
  ['collision','Collision','#bca8f5'], ['simulation','Other simulation','#e4cf78'],
  ['renderSubmit','Render submission','#ffad66'], ['other','Other CPU / profiler','#92a4b6'],
];
export const activityName = mode => ({ idle:'Idle', orbit:'Orbit camera', 'walk-turn':'Walk + turn', 'run-turn':'Run + turn', 'first-draw':'First draw (startup)' })[mode] || mode;
const GPU_REASONS={unsupported:'GPU timers unsupported',disjoint:'GPU timer invalidated','queue-full':'timer queue full','context-lost':'WebGL context lost',timeout:'timer results timed out','allocation-failed':'timer allocation failed',pending:'timer result pending',unknown:'timer status missing'};
export function gpuSampleNote({rendered,gpu,gpuStatus}) {
  if(!rendered)return 'No redraws';
  const reasons=Object.entries(gpuStatus).filter(([status])=>status!=='valid').map(([status,count])=>`${count} ${GPU_REASONS[status]||status}`);
  return `${gpu.samples}/${rendered} draws timed${reasons.length?' · '+reasons.join('; '):''}`;
}

// Child scopes are removed from their parent so stack segments never double-count work.
export function cpuParts(frame) {
  const c=frame.cpu, ground=c.ground||0, collision=c.collision||0, controls=c.controls||0, render=c.renderSubmit||0;
  const simulation=Math.max(0,(c.simulation||0)-ground-collision);
  return [controls,ground,collision,simulation,render,Math.max(0,c.loop-controls-ground-collision-simulation-render)];
}
export function activityFrames(report, mode) { return report.runs.flatMap(r=>r.raw.frames.filter(f=>f.phase===mode)); }
export function activitySummary(report, mode) {
  const frames=activityFrames(report,mode), sorted=frames.filter(f=>Number.isFinite(f.cpu.loop)).sort((a,b)=>a.cpu.loop-b.cpu.loop);
  const frame=sorted[Math.ceil(sorted.length*.95)-1],rendered=frames.filter(f=>f.rendered),gpu=distribution(rendered.map(f=>f.gpuMs));
  return {mode,frames:frames.length,rendered:rendered.length,cpu:frame?.cpu.loop??null,parts:frame?cpuParts(frame):CPU_STAGES.map(()=>null),gpu,gpuStatus:gpuStatusCounts(rendered)};
}
