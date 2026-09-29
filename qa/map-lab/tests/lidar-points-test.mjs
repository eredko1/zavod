import assert from 'node:assert/strict';
import {loadNativeLayerSamples} from './fixture.mjs';
import {testLiDARDecoder} from './lidar-test-decoder.mjs';
import {pointRecordView} from '../data/las-point-records.js';
import {queryLiDARPoints,POINT_QUERY_RULES} from '../render/lidar-points.js';
import {resolveSources} from '../pipeline/map-pipeline.js';
import {fetchLiDAR} from '../data/lidar-ept.js';
import {NYC_SOURCES} from '../data/map-sources.js';
import {nativeLayerTransport} from './native-layer-mock.mjs';
import {sha256} from '../data/binary-archive.js';

const samples=await loadNativeLayerSamples(),decoder=await testLiDARDecoder(),assets=[];
const unchanged=(value,before)=>{const after=JSON.stringify(value);let offset=0;while(offset<before.length&&before[offset]===after[offset])offset++;assert.ok(after===before,JSON.stringify({issue:'source snapshot changed',offset,before:before.slice(Math.max(0,offset-24),offset+24),after:after.slice(Math.max(0,offset-24),offset+24)}));};
for(const asset of samples.lidar.assets){const payload=samples.lidar.payloads.find(p=>p.id===asset.id),buffer=Uint8Array.from(Buffer.from(payload.binary,'base64')).buffer,decoded=await decoder.decode(buffer,asset.header,samples.lidar.origins.length,asset.pointCount*asset.header.recordSize);assets.push({...asset,decoded:{...decoded,encoding:'base64',records:Buffer.from(decoded.records).toString('base64'),bytes:decoded.records.byteLength,sha256:await sha256(decoded.records)}});}
decoder.dispose();
const snapshot={sourceId:'nyc-lidar-2017',bounds:samples.lidar.bounds,metadata:{spatialReference:{horizontal:'6347',vertical:'5703'}},data:{features:[],assets}},before=JSON.stringify(snapshot),first=pointRecordView(assets[0]).point(0),bounds=[...first.xyz,...first.xyz];
const result=await queryLiDARPoints(snapshot,{bounds,classes:[first.classification],originIds:[first.originId]});
assert.ok(result.matched>0);assert.ok(result.points.some(p=>p.assetId===assets[0].id&&p.index===0));
for(const point of result.points){assert.deepEqual(point.xyz,first.xyz);assert.equal(point.classification,first.classification);assert.equal(point.originId,first.originId);const source=pointRecordView(assets.find(a=>a.id===point.assetId)).point(point.index);assert.deepEqual(point.record,source.record);assert.deepEqual(point.extraBytes,source.extraBytes);assert.equal(point.record.buffer.byteLength,point.record.length,'selected records must not retain whole tile buffers');}
unchanged(snapshot,before);
const damagedLegacy=structuredClone(snapshot),damagedRecords=Buffer.from(damagedLegacy.data.assets[0].decoded.records,'base64');damagedRecords[0]^=1;damagedLegacy.data.assets[0].decoded.records=damagedRecords.toString('base64');await assert.rejects(()=>queryLiDARPoints(damagedLegacy,{bounds}),/checksum\/coverage/);
result.spatialReference.horizontal='changed';assert.equal(snapshot.metadata.spatialReference.horizontal,'6347','result metadata must not alias source metadata');
const input={bounds:samples.lidar.bounds,nyc:[snapshot]},merged=JSON.stringify(resolveSources(input).merge);await queryLiDARPoints(snapshot,{bounds,classes:[]});assert.equal(JSON.stringify(resolveSources(input).merge),merged);
assert.equal((await queryLiDARPoints(snapshot,{bounds,classes:[]})).matched,0);assert.equal((await queryLiDARPoints(snapshot,{bounds:[0,0,0,1,1,1]})).examined,0);
for(const options of [{},{bounds:[0,0,0,-1,1,1]},{bounds,classes:[32]},{bounds,classes:Array(1)},{bounds,originIds:[-1]},{bounds,limit:POINT_QUERY_RULES.maxResults+1}])await assert.rejects(()=>queryLiDARPoints(snapshot,options),/LiDAR/);
await assert.rejects(()=>queryLiDARPoints(snapshot,{bounds:assets[0].header.bounds,limit:1}),/limit exceeded/);
const missing={...snapshot,data:{...snapshot.data,assets:samples.lidar.assets}};await assert.rejects(()=>queryLiDARPoints(missing,{bounds}),/no decoded records/);
const cancelled=new AbortController();cancelled.abort(new DOMException('Cancelled','AbortError'));await assert.rejects(()=>queryLiDARPoints(snapshot,{bounds,signal:cancelled.signal}),e=>e.name==='AbortError');
const inFlight=new AbortController(),pending=queryLiDARPoints(snapshot,{bounds:assets[0].header.bounds,signal:inFlight.signal});setTimeout(()=>inFlight.abort(new DOMException('Cancelled','AbortError')),0);await assert.rejects(()=>pending,e=>e.name==='AbortError');
const supplied=[...bounds],immutable=queryLiDARPoints(snapshot,{bounds:supplied});supplied.fill(0);assert.deepEqual((await immutable).bounds,bounds,'caller mutation cannot change an in-flight crop');
const originalFetch=globalThis.fetch;
try{
  globalThis.fetch=nativeLayerTransport(samples);
  const compact=await fetchLiDAR(NYC_SOURCES.find(s=>s.id==='nyc-lidar-2017'),samples.lidar.bounds,undefined,undefined,testLiDARDecoder),portable=JSON.parse(JSON.stringify(compact)),captured=JSON.stringify(portable);let created=0,disposed=0;
  const factory=async()=>{created++;const worker=await testLiDARDecoder();return {decode:(...args)=>worker.decode(...args),dispose(){disposed++;worker.dispose();}};};
  assert.ok(compact.data.assets.every(a=>a.decoded.encoding==='laszip'&&!Object.hasOwn(a.decoded,'records')),'whole decoded cloud is not retained twice');
  const exact=await queryLiDARPoints(portable,{bounds,classes:[first.classification],originIds:[first.originId]},factory);
  assert.deepEqual(exact.points,result.points,'portable lossless archive returns every measured field and extra byte');unchanged(portable,captured);assert.equal(created,1);assert.equal(disposed,1);
  const noWorker=()=>{throw Error('Nonintersecting tile decoded');};await queryLiDARPoints(portable,{bounds:[0,0,0,1,1,1]},noWorker);
  globalThis.fetch=()=>{throw Error('Renderer attempted replacement network query');};
  for(const damage of [s=>{s.raw.payloads[0].binary='AAAA';},s=>{s.data.assets[0].decoded.sha256='damaged';},s=>{s.data.assets[0].header.offset[0]++;},s=>{s.raw.payloads.push(s.raw.payloads[0]);},s=>{s.data.assets[0].decoded.bytes--; }]){
    const changed=structuredClone(portable);damage(changed);await assert.rejects(()=>queryLiDARPoints(changed,{bounds},factory),/archive|archived/);
  }
  assert.equal(created,disposed,'decode workers are released after integrity failures as well as success');
  await assert.rejects(()=>queryLiDARPoints(portable,{bounds:assets[0].header.bounds,limit:1},factory),/limit exceeded/);assert.equal(created,disposed);
}finally{globalThis.fetch=originalFetch;}
console.log('PASS measured native point crops, class/origin filters, exact records, source/merge immutability, bounded complete results, missing decoding and cancellation');
