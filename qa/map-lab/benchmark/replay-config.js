export const SCENARIOS = Object.freeze(['idle','orbit','walk-turn','run-turn']);
export const REPLAY = Object.freeze({ replayVersion:2, frames:300, warmup:120, repeats:3, modes:SCENARIOS, fixedSimulationDt:1/60 });
export const MAX_REPLAY_FRAMES = 5000, MAX_REPEATS = 10, REPLAY_TIMEOUT = 180000;
export const MAX_PROFILE_FRAMES = 25000;
export function replayConfig(options = {}, scenarios = Object.fromEntries(SCENARIOS.map(id=>[id,true]))) {
  const c={...REPLAY,...options};
  if (!Number.isInteger(c.frames)||c.frames<2||!Number.isInteger(c.warmup)||c.warmup<0||c.frames+c.warmup>MAX_REPLAY_FRAMES||!Number.isInteger(c.repeats)||c.repeats<1||c.repeats>MAX_REPEATS||c.fixedSimulationDt!==REPLAY.fixedSimulationDt||c.replayVersion!==REPLAY.replayVersion||!Array.isArray(c.modes)||!c.modes.length||new Set(c.modes).size!==c.modes.length||c.modes.some(id=>!Object.hasOwn(scenarios,id))) throw Error('Invalid benchmark settings');
  if(c.modes.some(id=>!/^[a-z][a-z0-9-]*$/.test(id)||id==='first-draw')||c.modes.length*(c.frames+c.warmup)+2>MAX_PROFILE_FRAMES)throw Error('Invalid scenario identifiers or total frame count');
  return c;
}
