import {chromeOptions,displayBackend,verifyHardwareGpu} from '../../browser-launch.mjs';
// Paired AB/BA experiment. The same external callback timer measures both modes.
import assert from 'node:assert/strict';
import {loadFixture} from './fixture.mjs';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { distribution } from '../benchmark/frame-profiler.js';
const root='.tmp/map-lab',selection=await loadFixture();
const browser=await chromium.launch(chromeOptions({channel:'chrome',headless:false,args:['--no-sandbox','--disable-dev-shm-usage']})),page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  const graphics=await verifyHardwareGpu(browser);
  await page.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  await page.goto('http://localhost:8790/qa/map-lab/index.html?qa=1');await page.bringToFront();await page.waitForFunction(()=>window.__generator);
  await page.evaluate(async input=>{window.__generator.load(input);await window.__generator.generate();},selection);
  const report=await page.evaluate(async()=>{
    const {harness:h,world:w}=window.__generator,{sceneMetadata}=await import('/qa/map-lab/benchmark/benchmark-runner.js'),{fingerprint}=await import('/qa/map-lab/benchmark/frame-report.js');
    const {REPLAY}=await import('/qa/map-lab/benchmark/replay-config.js'),{observeEnvironment,observeAssetActivity}=await import('/qa/map-lab/benchmark/record-validity.js'),{DefaultLoadingManager}=await import('three');
    const {frames,warmup,replayVersion}=REPLAY,measurements=[],methods=['controls','simulate','groundAt','collision','draw'],originals=methods.map(k=>w[k]),gl=w.renderer.getContext(),upload=gl.bufferData;
    assertClean();function assertClean(){if('profiler'in w||methods.some((k,i)=>w[k]!==originals[i])||gl.bufferData!==upload)throw Error('Instrumentation leaked into runtime');}
    for(const enabled of [false,true,true,false,false,true,true,false]){
      const samples=new Float64Array(frames),cadence=new Float64Array(frames-1),setLoop=w.renderer.setAnimationLoop,environment=observeEnvironment(w.renderer.domElement),assets=observeAssetActivity(DefaultLoadingManager);let ticks=0,previous=null;
      w.renderer.setAnimationLoop=function(callback){return setLoop.call(this,callback?time=>{const start=performance.now();callback(time);const end=performance.now();if(ticks>=warmup){samples[ticks-warmup]=end-start;if(previous!==null)cadence[ticks-warmup-1]=start-previous;previous=start;}ticks++;}:null);};
      try{if(enabled)h.profiler.start();await h.runReplay('walk-turn',{frames,warmup});const pose=w.capturePose();const raw=enabled?await h.profiler.stop():null;environment.validate();assets.validate();measurements.push({enabled,callbackMs:[...samples],intervalMs:[...cadence],pose,hidden:document.hidden,gpuStatus:raw?.frames.reduce((s,f)=>(s[f.gpuStatus]=(s[f.gpuStatus]||0)+1,s),{})});}
      finally{w.renderer.setAnimationLoop=setLoop;try{if(h.profiler.busy)await h.profiler.stop();}finally{environment.dispose();assets.dispose();}assertClean();}
    }
    h.finishReplay();return {schema:1,kind:'instrumentation-overhead',recordedAt:new Date().toISOString(),frames,warmup,scenario:'walk-turn',scenarioVersion:h.scenarios['walk-turn'].version,replayVersion,inputHash:await fingerprint(JSON.stringify(w.selection)),metadata:sceneMetadata(w),measurements,notes:['External CPU callback timer includes profiler work and replay bookkeeping in both modes. GPU timings require instrumentation and are not an uninstrumented GPU control.','Four adjacent pairs alternate AB/BA order; this is a local noise-sensitive experiment, not a universal overhead guarantee. No timings are corrected by subtracting this estimate.']};
  });
  assert.deepEqual(errors,[]);assert.ok(report.measurements.every(m=>!m.hidden));for(const m of report.measurements)assert.deepEqual(m.pose,report.measurements[0].pose,'Control and profiled routes must end identically');
  report.measurements.forEach(m=>{m.callback=distribution(m.callbackMs);m.interval=distribution(m.intervalMs);});
  report.virtualDisplay=process.env.QA_VIRTUAL_DISPLAY==='1';
  report.displayBackend=displayBackend();report.graphics=graphics;
  report.pairs=Array.from({length:4},(_,i)=>{const pair=report.measurements.slice(i*2,i*2+2),off=pair.find(m=>!m.enabled),on=pair.find(m=>m.enabled);return {order:pair.map(m=>m.enabled?'on':'off'),medianDeltaMs:on.callback.p50-off.callback.p50,p95DeltaMs:on.callback.p95-off.callback.p95};});
  report.observedMedianDelta=distribution(report.pairs.map(p=>p.medianDeltaMs));report.observedP95Delta=distribution(report.pairs.map(p=>p.p95DeltaMs));
  await writeFile(`${root}/benchmark-overhead.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({pairs:report.pairs,observedMedianDelta:report.observedMedianDelta,observedP95Delta:report.observedP95Delta},null,2));
}finally{await browser.close();}
