import assert from 'node:assert/strict';
import {parseJSONStream} from '../data/json-reader.js';
const encoder=new TextEncoder();
function* chunks(text,size){const bytes=encoder.encode(text);for(let i=0;i<bytes.length;i+=size)yield bytes.subarray(i,i+size);}
const inputs=['null','true','false','0','-0','-123.5e+2','1e400','"plain"','"\\uD800"','[]','{}',' { "a": [true, null, -0, "雪 🌍", {"b":"quote \\\" slash \\\\ line \\n"}], "a": 3 } ', '{"__proto__":{"polluted":true},"constructor":"original","toString":false}',JSON.stringify({binary:'x'.repeat(200000),extras:Array.from({length:3000},(_,i)=>({id:i,unicode:'Я 🌍',value:i/3}))})];
for(const text of inputs)for(const size of [1,7,65536]){
  const actual=await parseJSONStream(chunks(text,size));assert.deepEqual(actual,JSON.parse(text));
  if(text.includes('__proto__')){assert.equal(Object.getPrototypeOf(actual),Object.prototype);assert.ok(Object.hasOwn(actual,'__proto__'));assert.equal({}.polluted,undefined);}
}
for(const text of ['', ' ', '[1,]', '{"a":1,}', '{"a" 1}', '{"a":}', '[}', '{]', 'true false', '01','+1', '1.', '1e','tru','undefined','"unterminated','"\\q"', '"raw\nline"', '\ufeff{}'])for(const size of [1,9])await assert.rejects(()=>parseJSONStream(chunks(text,size)),SyntaxError,text);
await assert.rejects(()=>parseJSONStream([new Uint8Array([0x22,0xff,0x22])]),TypeError,'invalid UTF-8 is rejected');
await assert.rejects(()=>parseJSONStream(['{}']),TypeError);
const cancelled=new AbortController();cancelled.abort();await assert.rejects(()=>parseJSONStream(chunks('{}',1),{signal:cancelled.signal}),e=>e.name==='AbortError');
const inFlight=new AbortController();async function* stop(){yield encoder.encode('{');inFlight.abort();yield encoder.encode('}');}await assert.rejects(()=>parseJSONStream(stop(),{signal:inFlight.signal}),e=>e.name==='AbortError');
console.log('PASS streaming UTF-8/escape/token boundaries, exact JSON semantics and fields, duplicate/prototype keys, malformed/incomplete rejection and cancellation');
