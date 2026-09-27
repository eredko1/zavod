import {chromeOptions} from '../../browser-launch.mjs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser=await chromium.launch(chromeOptions({channel:'chrome',headless:false,args:['--no-sandbox','--disable-dev-shm-usage']})),page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://localhost:8790/qa/map-lab/index.html?qa=1');await page.bringToFront();await page.waitForFunction(()=>window.__generator);
  assert.equal(Number(await page.inputValue('#area-west')),-73.9798);assert.equal(Number(await page.inputValue('#area-east')),-73.976);
  const layout=await page.evaluate(()=>{const panel=document.getElementById('benchmark-panel'),state=document.getElementById('bench-state'),main=document.querySelector('main');panel.hidden=false;panel.dataset.running='true';state.textContent='';const before=main.getBoundingClientRect().height;state.textContent='Repeat 1 · walk-turn. Keep this page in the foreground.';const after=main.getBoundingClientRect().height;panel.hidden=true;delete panel.dataset.running;return {before,after};});
  assert.equal(layout.before,layout.after,'benchmark progress must not resize the canvas');
  const results=await page.evaluate(async()=>{
    const g=window.__generator;g.load({data:{elements:[{type:'way',id:1,tags:{highway:'footway'},geometry:[{lat:40.577,lon:-73.982},{lat:40.578,lon:-73.982}]}]},nyc:[]});await g.generate();
    const w=g.world,{createMapBenchmark}=await import('/qa/map-lab/benchmark/map-benchmark.js'),{runBenchmark}=await import('/qa/map-lab/benchmark/benchmark-runner.js'),{DefaultLoadingManager:assets}=await import('three');
    const methods=['controls','simulate','groundAt','collision','draw'],originals=methods.map(k=>w[k]),gl=w.renderer.getContext(),upload=gl.bufferData;
    const clean=()=>!('profiler'in w)&&methods.every((k,i)=>w[k]===originals[i])&&gl.bufferData===upload;
    async function run(create,version=7){const h=createMapBenchmark(w,{scenarios:{custom:{version,create}}});try{return await runBenchmark(h,{options:{modes:['custom'],frames:3,warmup:0,repeats:2}});}finally{await h.dispose();}}
    const stationary=await run(world=>{world.fit();return ()=>null;});
    const {sceneMetadata}=await import('/qa/map-lab/benchmark/scene-metadata.js'),{validateComparison}=await import('/qa/map-lab/benchmark/frame-report.js');
    const terrain=w.getWorld().walkable[0],coverage=stationary.runs[0].metadata.geometryCoverage;
    if(!coverage.some(f=>f.id==='terrain'))throw Error('Terrain is absent from benchmark coverage');
    const rejectTerrainChange=()=>{const candidate=structuredClone(stationary);for(const r of candidate.runs)r.metadata=sceneMetadata(w);try{validateComparison(stationary,candidate);return null;}catch(e){return e.message;}};
    terrain.visible=false;const hiddenTerrain=rejectTerrainChange();terrain.visible=true;
    const positions=terrain.geometry.attributes.position,vertex=terrain.geometry.index.getX(0),height=positions.getY(vertex);positions.setY(vertex,height+1);const alteredTerrain=rejectTerrainChange();positions.setY(vertex,height);
    if(!/geometryCoverage/.test(hiddenTerrain)||!/geometryCoverage/.test(alteredTerrain))throw Error(`Terrain changes escaped comparison validation: hidden=${hiddenTerrain}, altered=${alteredTerrain}`);
    const thrown=await run(()=>()=>{throw Error('scenario failure');});const afterError=clean();
    const asset=await run(()=>()=>{assets.itemStart('test://completed-asset');assets.itemEnd('test://completed-asset');return null;});
    const resized=await run(world=>()=>{const {width,height}=world.renderer.domElement;world.renderer.setSize(width+1,height,false);world.renderer.setSize(width,height,false);return null;});
    const recovered=await run(world=>{world.fit();return ()=>null;});
    return {stationary:{status:stationary.status,version:stationary.scenarioVersions.custom,frames:stationary.runs.map(r=>r.summaries.custom.frames)},thrown:thrown.failure,asset:asset.failure,resized:resized.failure,afterError,clean:clean(),recovered:recovered.status};
  });
  assert.deepEqual(results.stationary,{status:'complete',version:7,frames:[3,3]});assert.match(results.thrown,/scenario failure/);assert.match(results.asset,/Assets changed/);assert.match(results.resized,/Viewport/);assert.ok(results.afterError&&results.clean);assert.equal(results.recovered,'complete');assert.deepEqual(errors,[]);
  await page.evaluate(async()=>{const {observeEnvironment}=await import('/qa/map-lab/benchmark/record-validity.js');const canvas=document.createElement('canvas');canvas.width=600;canvas.height=400;window.viewportGuard=observeEnvironment(canvas);});
  await page.setViewportSize({width:1300,height:800});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
  await page.setViewportSize({width:1280,height:800});
  const viewportFailure=await page.evaluate(()=>{try{window.viewportGuard.validate();return null;}catch(e){return e.message;}finally{window.viewportGuard.dispose();delete window.viewportGuard;}});
  assert.match(viewportFailure,/Viewport/);
  console.log('PASS Coney preset, custom versioned scenario, unchanged runtime methods, resize/asset invalidation, failure cleanup and recovery');
}finally{await browser.close();}
