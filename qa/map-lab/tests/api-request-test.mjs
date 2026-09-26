import assert from 'node:assert/strict';
import { retryRequest, APIError, TransportError } from '../data/api-request.js';
import {withRequestTimeout} from '../data/request-abort.js';
let calls=0,waits=[];
assert.equal(await retryRequest(async()=>{if(++calls<3)throw new APIError('overloaded',503);return 'ok';},{wait:async ms=>waits.push(ms)}),'ok');assert.equal(calls,3);assert.deepEqual(waits,[1000,2000]);
for(const status of [400,401,403,404]){calls=0;await assert.rejects(retryRequest(async()=>{calls++;throw new APIError('bad query',status);}),/bad query/);assert.equal(calls,1);}
calls=0;await assert.rejects(retryRequest(async()=>{calls++;throw new APIError('rate limit',429,'30');}),/rate limit/);assert.equal(calls,1);
waits=[];calls=0;await retryRequest(async()=>{if(!calls++)throw new APIError('rate limit',429,'2');return true;},{wait:async ms=>waits.push(ms)});assert.deepEqual(waits,[2000]);
const controller=new AbortController();calls=0;await assert.rejects(retryRequest(async()=>{calls++;throw new TransportError('network');},{signal:controller.signal,onRetry:()=>controller.abort(new Error('cancelled'))}),/cancelled/);assert.equal(calls,1);
calls=0;await assert.rejects(retryRequest(async()=>{calls++;throw new TransportError('network');},{wait:async()=>{}}),/network/);assert.equal(calls,3);
console.log('PASS retry limits, backoff, Retry-After, permanent errors, cancellation and exhaustion');
const missing=[AbortSignal.any,AbortSignal.timeout,AbortSignal.prototype.throwIfAborted];AbortSignal.any=AbortSignal.timeout=AbortSignal.prototype.throwIfAborted=undefined;
try{
  assert.equal(await withRequestTimeout(null,100,async()=>42),42);
  const pending=signal=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Fetch aborted','AbortError')),{once:true}));
  await assert.rejects(withRequestTimeout(null,5,pending),{name:'TimeoutError'});
  const parent=new AbortController(),reason=Error('User cancelled'),request=withRequestTimeout(parent.signal,100,pending);parent.abort(reason);await assert.rejects(request,e=>e===reason);
  let called=false;await assert.rejects(withRequestTimeout(parent.signal,100,async()=>{called=true;}));assert.equal(called,false);
  const done=new AbortController();let child;await withRequestTimeout(done.signal,5,async signal=>{child=signal;});done.abort();await new Promise(resolve=>setTimeout(resolve,10));assert.equal(child.aborted,false,'finished requests release timeout and cancellation listener');
}finally{[AbortSignal.any,AbortSignal.timeout,AbortSignal.prototype.throwIfAborted]=missing;}
console.log('PASS timeout, cancellation and cleanup without modern AbortSignal helpers');

calls=0;await assert.rejects(retryRequest(async()=>{calls++;throw new TypeError('programming error');},{wait:async()=>{}}),/programming error/);assert.equal(calls,1,'programming errors must not be retried');
