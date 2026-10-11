import assert from 'node:assert/strict';
import {jsonChunks} from '../ui/json-chunks.js';
import {jsonStream} from '../ui/json-stream.js';

for(const value of [null,true,12,NaN,Infinity,'quote" slash\\ newline\n\u0000\ud800',{missing:undefined,fn(){},symbol:Symbol(),array:[undefined,,NaN],date:new Date('2026-01-01T00:00:00Z')},new Number(12),new String('s'),new Boolean(false),{nested:{toJSON(key){return {key};}}},new Uint8Array([1,2])])assert.equal(await new Response(jsonStream(value)).text(),JSON.stringify(value));
const string='x'.repeat(65535)+'😀\ud800\n"\\'.repeat(40000),value={source:{records:string,raw:string},other:[string]},before=JSON.stringify(value);
assert.deepEqual(JSON.parse(await new Response(jsonStream(value)).text()),value,'escaped strings and UTF-16 boundary splits preserve exact fields');assert.equal(JSON.stringify(value),before);
assert.equal(await new Response(jsonStream(value)).text(),Array.from(jsonChunks(value)).join(''),'stream and chunk encoders preserve identical UTF-8 JSON');
let complete=0,cancelled=0;await new Response(jsonStream({exact:true},undefined,{onComplete:()=>complete++,onCancel:()=>cancelled++})).text();assert.equal(complete,1);assert.equal(cancelled,0);
let streamError;await assert.rejects(new Response(jsonStream({n:1n},error=>streamError=error)).text(),TypeError);assert.ok(streamError instanceof TypeError);
const cyclic={};cyclic.child=cyclic;assert.throws(()=>Array.from(jsonChunks(cyclic)),/circular/);assert.throws(()=>Array.from(jsonChunks({n:1n})),TypeError);assert.throws(()=>Array.from(jsonChunks(undefined)),/No JSON/);
const clock=Object.getOwnPropertyDescriptor(performance,'now'),cancellationErrors=[];let time=0;
try{
  Object.defineProperty(performance,'now',{configurable:true,value:()=>time});
  const stream=jsonStream(value,error=>cancellationErrors.push(error),{onCancel:()=>cancelled++});time=13;
  const reader=stream.getReader(),pending=reader.read();await Promise.resolve();await reader.cancel();assert.equal((await pending).done,true);await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(cancellationErrors,[],'cancel during a cooperative yield releases the producer without a false serialization error');
  assert.equal(cancelled,1);assert.equal(complete,1);
}finally{if(clock)Object.defineProperty(performance,'now',clock);else delete performance.now;}
console.log('PASS bounded JSON streaming, escaping/surrogate boundaries, JSON omission/null rules, toJSON keys, raw-field preservation and explicit unsupported/cycle rejection');
