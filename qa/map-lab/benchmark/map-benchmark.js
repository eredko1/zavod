import { DefaultLoadingManager } from 'three';
import { createFrameProfiler } from './frame-profiler.js';
import { DEFAULT_SCENARIOS } from './scenarios.js';
import { REPLAY, MAX_REPLAY_FRAMES, REPLAY_TIMEOUT } from './replay-config.js';

// Development adapter owns instrumentation and replay. The renderer never imports it.
export function createMapBenchmark(world,{scenarios=DEFAULT_SCENARIOS}={}) {
  const profiler=createFrameProfiler(world.renderer);profiler.trackLoadingManager(DefaultLoadingManager);
  let replay=null;
  function finish(error) {
    if(!replay)return;const current=replay;replay=null;
    clearTimeout(current.timer);world.renderer.setAnimationLoop(null);
    for(const restore of current.restores.reverse())restore();
    if(error)current.reject(error);else current.resolve();
  }
  const api={world,profiler,scenarios,
    loadResult(selection,settings){profiler.beginBuild({settings});try{return world.loadResult(selection,settings,name=>profiler.buildMark(name));}finally{profiler.endBuild();}},
    runReplay(mode,{frames=REPLAY.frames,warmup=REPLAY.warmup}={}) {
      if(replay)return Promise.reject(Error('Replay already running'));
      if(!Number.isInteger(frames)||frames<2||!Number.isInteger(warmup)||warmup<0||frames+warmup>MAX_REPLAY_FRAMES)return Promise.reject(Error('Invalid replay length'));
      const scenario=mode==='first-draw'?DEFAULT_SCENARIOS.idle:scenarios[mode];
      if(!scenario||!Number.isInteger(scenario.version)||typeof scenario.create!=='function')return Promise.reject(Error(`Unknown or unversioned scenario: ${mode}`));
      world.stop();
      return new Promise((resolve,reject)=>{
        replay={resolve,reject,restores:[],timer:setTimeout(()=>finish(Error('Replay timed out')),REPLAY_TIMEOUT)};
        try {
          const step=scenario.create(world);let tick=0,input=null;
          const wrap=(name,fn)=>{const original=world[name];world[name]=fn(original);replay.restores.push(()=>{world[name]=original;});};
          wrap('controls',original=>()=>{const update=()=>{input=step(tick*REPLAY.fixedSimulationDt);original();};return profiler.active?profiler.measure('controls',update):update();});
          if(profiler.active){
            for(const [method,scope]of [['simulate','simulation'],['groundAt','ground'],['collision','collision']])wrap(method,original=>(...args)=>profiler.measure(scope,()=>original(...args)));
            wrap('draw',original=>()=>profiler.render(original));
          }
          world.renderer.setAnimationLoop(()=>{
            try {
              profiler.beginFrame(tick<warmup?`${mode}:warmup`:mode);
              // Controls prepare this tick's input before the normal runtime simulation.
              world.frame(REPLAY.fixedSimulationDt,()=>input);
              if(profiler.active)profiler.endFrame(world.capturePose());
              if(++tick>=warmup+frames)finish();
            }catch(e){profiler.abortFrame(e);finish(e);}
          });
        }catch(e){finish(e);}
      });
    },
    cancelReplay(message='Replay cancelled'){finish(Error(message));},
    finishReplay(){api.cancelReplay();world.fit();world.start();},
    async dispose(){api.cancelReplay();await profiler.stop();world.start();},
  };
  return api;
}
