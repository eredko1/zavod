import assert from 'node:assert/strict';
import {runBuildStages,runBuildStagesAsync} from '../pipeline/build-stages.js';
import {paintProgress} from '../ui/build-progress.js';
function* stages(events){try{yield 'first';events.push('first');yield 'second';events.push('second');return 42;}finally{events.push('cleanup');}}
const sync=[],async=[],marks=[];assert.equal(runBuildStages(stages(sync)),42);
assert.equal(await runBuildStagesAsync(stages(async),(name,ms)=>{assert.ok(ms>=0);marks.push(name);},name=>{assert.equal(async.includes(name),false,'progress runs before its stage');}),42);assert.deepEqual(async,sync);assert.deepEqual(marks,['first','second']);
const failed=[];await assert.rejects(runBuildStagesAsync(stages(failed),()=>{},name=>{if(name==='second')throw Error('cancelled');}),/cancelled/);assert.deepEqual(failed,['first','cleanup'],'yield cancellation disposes partially built resources');
console.log('PASS shared synchronous/asynchronous stage order, pre-stage progress and cancellation cleanup');
const callbacks=new Map();let frameID=0;globalThis.requestAnimationFrame=fn=>{callbacks.set(++frameID,fn);return frameID;};globalThis.cancelAnimationFrame=id=>callbacks.delete(id);
const controller=new AbortController(),paint=paintProgress(controller.signal);controller.abort(Error('hidden page'));await assert.rejects(paint,/hidden page/);assert.equal(callbacks.size,0,'cancellation works even when a hidden page never receives a frame');
const shown=paintProgress();let settled=false;shown.then(()=>settled=true);const tick=()=>{const entry=callbacks.entries().next().value;callbacks.delete(entry[0]);entry[1]();};tick();await Promise.resolve();assert.equal(settled,false);tick();await shown;assert.equal(callbacks.size,0);delete globalThis.requestAnimationFrame;delete globalThis.cancelAnimationFrame;
console.log('PASS two-frame progress painting and cancellation without a frame callback');
