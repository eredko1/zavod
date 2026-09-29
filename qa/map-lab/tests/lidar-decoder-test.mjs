import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {loadNativeLayerSamples} from './fixture.mjs';
import {testLiDARDecoder} from './lidar-test-decoder.mjs';
import {lasExtraDimensions,pointRecordView,pointRecordSummary} from '../data/las-point-records.js';
import {compilerInput} from '../pipeline/compiler-input.js';

const samples=await loadNativeLayerSamples(),decoder=await testLiDARDecoder(),sha=bytes=>createHash('sha256').update(bytes instanceof ArrayBuffer?new Uint8Array(bytes):bytes).digest('hex');
for(const [file,expected]of [['laz-perf.js','9c2ac7225aa514430b308aeb1fd38d16ce5a5356205d1d8646498594063e8552'],['laz-perf.wasm','9c1802bc31b567dd4aa1ce9ab010e7e51e095dc42af8379b474ae6f221a9327f'],['LICENSE','959f77033ba56a3b146faf5c02f9162071f2d0bff4b8b6f1c2193a4b41127d39']])assert.equal(sha(await readFile(new URL('../../../vendor/laz-perf/'+file,import.meta.url))),expected,file);
const expectedClasses=[{1:9269,2:543,7:12174,9:400,13:56,17:7},{1:6088,2:2254,7:9081,8:173,9:50,10:15,12:1,13:20}];
for(const [index,asset]of samples.lidar.assets.entries()){
  const payload=samples.lidar.payloads.find(p=>p.id===asset.id),compressed=Uint8Array.from(Buffer.from(payload.binary,'base64')).buffer,before=sha(compressed),decoded=await decoder.decode(compressed,asset.header,samples.lidar.origins.length,asset.pointCount*asset.header.recordSize);
  assert.equal(sha(compressed),before);assert.deepEqual(decoded.classifications,expectedClasses[index]);assert.equal(decoded.records.byteLength,asset.pointCount*asset.header.recordSize);assert.equal(decoded.pointFormat,1);
  assert.deepEqual(decoded.extraDimensions.map(d=>[d.name,d.offset,d.size]),[['ClassFlags',28,1],['OriginId',29,4]],'LAS VLR layout differs from EPT schema order');
  const normalized={...decoded,records:Buffer.from(decoded.records).toString('base64'),encoding:'base64'},observation={...asset,decoded:normalized},view=pointRecordView(observation),bytes=new DataView(decoded.records);
  for(const point of [0,Math.floor(view.count/2),view.count-1]){
    const actual=view.point(point),offset=point*asset.header.recordSize;assert.deepEqual(actual.xyz,[0,1,2].map(axis=>bytes.getInt32(offset+axis*4,true)*asset.header.scale[axis]+asset.header.offset[axis]));assert.equal(actual.originId,bytes.getUint32(offset+29,true));assert.deepEqual(Array.from(actual.record),Array.from(new Uint8Array(decoded.records,offset,asset.header.recordSize)));assert.equal(actual.extraBytes.length,5);
  }
  assert.throws(()=>view.point(-1),/index/);assert.throws(()=>view.point(view.count),/index/);
  const source={nyc:[{sourceId:'nyc-lidar-2017',raw:{payloads:[payload]},data:{features:[],assets:[observation]}}]},input=compilerInput(source);assert.equal(input.nyc[0].data.assets[0].decoded.records,undefined);assert.deepEqual(input.nyc[0].data.assets[0].decoded,pointRecordSummary(normalized));assert.equal(source.nyc[0].data.assets[0].decoded.records,normalized.records);
  assert.throws(()=>decoder.decode(compressed,asset.header,samples.lidar.origins.length,decoded.records.byteLength-1),/decoded-byte limit/);
  assert.throws(()=>decoder.decode(compressed,asset.header,1,decoded.records.byteLength),/unknown OriginId/);
  const bad=compressed.slice(0),badView=new DataView(bad);badView.setUint8(227+54+2,31);assert.throws(()=>lasExtraDimensions(bad,asset.header),/extra dimension/);
  const truncated=compressed.slice(0,asset.header.pointDataOffset+8);assert.throws(()=>decoder.decode(truncated,asset.header,samples.lidar.origins.length,decoded.records.byteLength),/./,'damaged compressed stream rejects');
}
decoder.dispose();console.log('PASS pinned worker binary/license, full point records and native coordinates, actual extra-dimension layout, origins/classes, bounded decoding, damaged-stream rejection and archive-free compiler input');
