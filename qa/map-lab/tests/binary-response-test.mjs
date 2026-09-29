import assert from 'node:assert/strict';
import {readBinaryResponse} from '../data/binary-response.js';
const budget={bytes:0,limit:6};assert.deepEqual(new Uint8Array(await readBinaryResponse(new Response(new Uint8Array([1,2,3])),budget,'test')),new Uint8Array([1,2,3]));assert.equal(budget.bytes,3);
let cancelled=false;const large=new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'content-length':'4'}});await assert.rejects(readBinaryResponse(large,budget,'test'),/7 bytes.*limit 6/);assert.equal(cancelled,true);assert.equal(budget.bytes,3,'header rejection does not claim unread bytes');
const outcomes=await Promise.allSettled([readBinaryResponse(new Response(new Uint8Array([4,5,6])),budget,'test'),readBinaryResponse(new Response(new Uint8Array([7,8])),budget,'test')]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.match(outcomes.find(r=>r.status==='rejected').reason.message,/limit exceeded/);
await assert.rejects(readBinaryResponse(new Response(null),{bytes:0,limit:1},'test'),/Missing/);
console.log('PASS exact binary bytes, preflight cancellation, shared concurrent byte budget and explicit missing-body rejection');
