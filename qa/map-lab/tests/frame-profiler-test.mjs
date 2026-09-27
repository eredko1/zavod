import assert from 'node:assert/strict';
import {createFrameProfiler,distribution} from '../benchmark/frame-profiler.js';
function fixture(supported=true,maxPending=8) {
  let time=0; const ext={GPU_DISJOINT_EXT:1,TIME_ELAPSED_EXT:2}, state={ready:true,disjoint:false,lost:false,deleted:0};
  const gl={QUERY_RESULT_AVAILABLE:3,QUERY_RESULT:4,getExtension:()=>supported?ext:null,getParameter:()=>state.disjoint,isContextLost:()=>state.lost,createQuery:()=>({}),beginQuery(){},endQuery(){},getQueryParameter:(q,p)=>p===3?state.ready:7000000,deleteQuery(){state.deleted++},texImage2D(){time+=3},bufferData(){time+=2},compileShader(){time+=4}};
  const renderer={getContext:()=>gl,info:{render:{calls:5,triangles:10},memory:{textures:1,geometries:2}}}, profiler=createFrameProfiler(renderer,{clock:()=>time,maxPending});
  return {profiler,gl,state,advance:ms=>time+=ms};
}
assert.equal(distribution([]).p95,null); assert.equal(distribution([null,NaN]).samples,0); assert.equal(distribution([1,2,3,4,5]).p95,5);
{
  const {profiler:p,advance}=fixture();p.start();p.beginBuild();advance(100);advance(8);p.buildMark('mesh',8);advance(50);advance(4);p.buildMark('drape',4);p.endBuild();const r=await p.stop();assert.equal(r.builds[0].totalMs,12);assert.equal(r.builds[0].wallMs,162);assert.equal(r.builds[0].yieldMs,150,'paint waits never inflate measured build work');
}
{
  const {profiler:p,gl,advance}=fixture(), original=gl.texImage2D;
  p.start(); p.beginBuild({sources:9}); advance(8); p.buildMark('merge'); advance(4); p.buildMark('mesh'); p.endBuild();
  p.beginFrame('walk-turn'); p.measure('controls',()=>advance(2));
  p.measure('simulation',()=>{p.measure('ground',()=>advance(1));p.measure('collision',()=>advance(2));advance(1)});
  p.render(()=>{gl.texImage2D();gl.bufferData();gl.compileShader()});p.endFrame({});
  const data=await p.stop(), f=data.frames[0];
  assert.equal(f.cpu.loop,15);assert.equal(f.cpu.simulation,4);assert.equal(f.cpu.ground,1);assert.equal(f.cpu.collision,2);assert.equal(f.cpu.renderSubmit,9);assert.equal(f.cpu.other,0);assert.equal(f.gpuMs,7);assert.equal(f.gpuStatus,'valid');
  assert.deepEqual(f.resources.map(e=>[e.kind,e.cpuMs]),[['textureUpload',3],['bufferUpload',2],['shaderSetup',4]]);
  assert.equal(data.builds[0].totalMs,12);assert.equal(gl.texImage2D,original,'restore API wrappers');
}
{
  const {profiler:p}=fixture(false);p.start();p.beginFrame();p.render(()=>{});p.endFrame({});const r=await p.stop();assert.equal(r.frames[0].gpuMs,null);assert.equal(r.frames[0].gpuStatus,'unsupported');
}
{
  const {profiler:p,state}=fixture();p.start();p.beginFrame();p.render(()=>{});p.endFrame({});state.disjoint=true;p.beginFrame();p.render(()=>{});p.endFrame({});const r=await p.stop();assert.ok(r.frames.every(f=>f.gpuStatus==='disjoint'&&f.gpuMs===null));assert.equal(state.deleted,1);
}
{
  const {profiler:p,state}=fixture(true,1);state.ready=false;p.start();p.beginFrame();p.render(()=>{});p.endFrame({});p.beginFrame();p.render(()=>{});p.endFrame({});state.ready=true;const r=await p.stop();assert.equal(r.frames[0].gpuStatus,'valid');assert.equal(r.frames[1].gpuStatus,'queue-full');assert.equal(state.deleted,1);
}
{
  const {profiler:p,state}=fixture();p.start();p.beginFrame();p.render(()=>{});p.endFrame({});state.lost=true;const r=await p.stop();assert.equal(r.frames[0].gpuStatus,'context-lost');
}
{
  const {profiler:p}=fixture(), manager={itemStart(){},itemEnd(){},itemError(){}}, original=manager.itemStart;
  p.trackLoadingManager(manager);p.start();manager.itemStart('texture.png');manager.itemEnd('texture.png');await p.waitForAssets();const r=await p.stop();assert.equal(r.pendingAssets,0);assert.equal(r.assetEvents.length,2);assert.equal(manager.itemStart,original);
  p.start();manager.itemStart('bad.png');manager.itemError('bad.png');manager.itemEnd('bad.png');await assert.rejects(p.waitForAssets(),/failed to load/);await p.stop();
}
console.log('PASS: inclusive CPU scopes, texture/buffer/shader API attribution, build phases, async GPU results, unsupported/disjoint/backpressure/context-loss handling, wrapper cleanup and statistics');
{
  const original=globalThis.PerformanceObserver;let disconnected=false;
  globalThis.PerformanceObserver=class {
    static supportedEntryTypes=['longtask'];
    observe(){}
    takeRecords(){return [{entryType:'longtask',startTime:10,duration:55}];}
    disconnect(){disconnected=true;}
  };
  try{const {profiler:p}=fixture(false);p.start();const report=await p.stop();assert.equal(report.longTasks.length,1);assert.equal(report.longTasks[0].durationMs,55);assert.ok(disconnected);}
  finally{globalThis.PerformanceObserver=original;}
}
console.log('PASS queued observer entries are retained at stop');
{
  const {profiler:p,gl}=fixture(false),second=createFrameProfiler({getContext:()=>gl}),original=gl.texImage2D;
  p.start();assert.throws(()=>second.start(),/context is already/);await p.stop();second.start();await second.stop();assert.equal(gl.texImage2D,original);
  const manager={itemStart(){},itemEnd(){},itemError(){}},other=fixture(false).profiler,initial=manager.itemStart;
  p.trackLoadingManager(manager);other.trackLoadingManager(manager);p.start();assert.throws(()=>other.start(),/manager is already/);await p.stop();other.start();await other.stop();assert.equal(manager.itemStart,initial);
}
console.log('PASS overlapping WebGL/manager owners rejected and reusable after cleanup');
