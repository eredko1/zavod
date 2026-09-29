import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadNativeLayerSamples} from './fixture.mjs';
import {nativeLayerTransport} from './native-layer-mock.mjs';
import {NYC_SOURCES,fetchNYC,sourceRecordCount,sourceSummary,datasetURL,nycURL} from '../data/map-sources.js';
import {LIDAR_LIMITS,readLASHeader,eptNodeBounds,fetchLiDAR} from '../data/lidar-ept.js';
import {testLiDARDecoder} from './lidar-test-decoder.mjs';
import {utm18N,lidarEnvelope,LIDAR_QUERY_PADDING_METRES} from '../data/lidar-query.js';
import {resolveSources,resolveMap} from '../pipeline/map-pipeline.js';
import {sourceInventories} from '../pipeline/source-inventory.js';

const samples=await loadNativeLayerSamples(),originalFetch=globalThis.fetch,source=id=>NYC_SOURCES.find(s=>s.id===id),station=source('mta-stations'),lidar=source('nyc-lidar-2017'),bounds=samples.lidar.bounds;
const fetchPoints=()=>fetchLiDAR(lidar,bounds,undefined,undefined,testLiDARDecoder);
try{
  globalThis.fetch=nativeLayerTransport(samples);
  const mta=await fetchNYC(station,samples.mta.bounds),points=await fetchPoints();
  assert.deepEqual(mta.data,samples.mta.data);assert.deepEqual(mta.raw.metadata,samples.mta.raw.metadata);assert.equal(mta.requests.length,3);
  assert.deepEqual(points.data.assets.map(({decoded,...asset})=>asset),samples.lidar.assets);assert.deepEqual(points.raw.payloads,samples.lidar.payloads);
  assert.equal(points.raw.metadata.schema.length,samples.lidar.metadata.schema.length);assert.deepEqual(points.raw.responses.find(r=>r.url.endsWith('/list.json')).data,samples.lidar.origins);
  assert.equal(points.metadata.query.resolution,'all intersecting hierarchy depths');assert.equal(points.metadata.query.cropped,false);assert.equal(points.metadata.query.paddingMetres,LIDAR_QUERY_PADDING_METRES);
  assert.equal(sourceRecordCount(points),2);assert.match(sourceSummary(points),/2 LiDAR payloads.*validated records; decoded on query/);assert.match(datasetURL(station.dataset),/data.ny.gov/);assert.match(nycURL(station,bounds),/gtfs_latitude/);
  assert.match(sourceSummary({...points,metadata:{...points.metadata,pointCount:0},data:{features:[],assets:[]}}),/0 stored points.*no intersecting tiles/);
  for(const payload of points.raw.payloads){const bytes=Buffer.from(payload.binary,'base64');assert.equal(createHash('sha256').update(bytes).digest('hex'),payload.sha256);assert.equal(bytes.length,payload.bytes);}
  // Cancellation during the final checksum must retain evidence without selecting a complete cloud.
  const controllerHash=new AbortController(),digest=crypto.subtle.digest;let hashes=0;
  try{crypto.subtle.digest=async(...args)=>{const value=await digest.call(crypto.subtle,...args);if(++hashes===2)controllerHash.abort(new DOMException('Cancelled during checksum','AbortError'));return value;};await assert.rejects(fetchLiDAR(lidar,bounds,controllerHash.signal,undefined,testLiDARDecoder),e=>e.acquisition.status==='cancelled'&&e.acquisition.data.assets[0].decoded.sha256.length===64&&e.acquisition.raw.payloads[0].binary.length>0);}
  finally{crypto.subtle.digest=digest;}
  const input={bounds,nyc:[mta,points]},before=JSON.stringify(input),merged=resolveSources(input),rendered=resolveMap(input),originalPlan=JSON.stringify(merged);
  assert.equal(merged.details.length,mta.data.features.length);assert.ok(merged.details.every(f=>f.reference&&f.sourceRole==='station-inventory'&&!f.height&&!f.width&&f.estimates.length===0));
  assert.equal(merged.coverage.filter(c=>c.sourceId===lidar.id).length,2);assert.ok(merged.merge.decisions.filter(d=>d.members[0].sourceId===lidar.id).every(d=>d.ruleId==='point-cloud'&&d.status==='retained'));
  assert.deepEqual(rendered.merge,merged.merge);assert.equal(rendered.details.length,mta.data.features.length);assert.equal(merged.observations.records.find(r=>r.sourceId===lidar.id).records,points.data.assets);assert.equal(rendered.observations.records.find(r=>r.sourceId===lidar.id).snapshot.raw,points.raw);
  assert.equal(JSON.stringify(input),before);assert.equal(JSON.stringify(merged),originalPlan);
  const hidden=resolveSources({...input,nyc:[mta,{...points,visible:false}]});assert.ok(hidden.coverage.filter(c=>c.sourceId===lidar.id).every(c=>c.status==='hidden'));assert.equal(hidden.observations.records.find(r=>r.sourceId===lidar.id).records.length,2);
  const hybrid={...points,data:{...points.data,features:[mta.data.features[0]]}},hybridRecords=sourceInventories({nyc:[hybrid]})[1].records;assert.equal(hybridRecords.length,sourceRecordCount(hybrid));assert.equal(hybridRecords[0],mta.data.features[0]);assert.equal(hybridRecords[1],points.data.assets[0],'hybrid observations retain both record channels');
  globalThis.fetch=nativeLayerTransport(samples,{emptyStations:true});assert.equal((await fetchNYC(station,bounds)).data.features.length,0);
  globalThis.fetch=nativeLayerTransport(samples,{mutateJSON:(suffix,data)=>suffix.includes('/resource/')&&data[0]?.gtfs_stop_id?data.slice(1):data});await assert.rejects(fetchNYC(station,bounds),e=>e.acquisition.status==='rejected'&&/Incomplete MTA/.test(e.message)&&e.acquisition.raw.responses.length===3);
  for(const change of [row=>{row.gtfs_latitude='';},row=>{row.station_id='999999';},row=>{row.gtfs_stop_id=null;}]){
    globalThis.fetch=nativeLayerTransport(samples,{mutateJSON:(suffix,data)=>{if(suffix.includes('/resource/')&&data[0]?.gtfs_stop_id)change(data[0]);return data;}});await assert.rejects(fetchNYC(station,bounds),/Invalid MTA/);
  }
  globalThis.fetch=nativeLayerTransport(samples,{mutateJSON:(suffix,data)=>{if(suffix.endsWith('/ept.json'))data.srs.horizontal='3857';return data;}});await assert.rejects(fetchPoints(),/Unsupported NYC LiDAR/);
  globalThis.fetch=nativeLayerTransport(samples,{mutateJSON:(suffix,data)=>{if(suffix.endsWith('0-0-0-0.json'))data['0-0-0-0']=LIDAR_LIMITS.points;return data;}});await assert.rejects(fetchPoints(),e=>/point\/asset limit.*points requested/.test(e.message)&&e.acquisition.query.selectedPoints>LIDAR_LIMITS.points&&e.acquisition.query.selectedAssets===2);
  globalThis.fetch=nativeLayerTransport(samples,{mutateJSON:(suffix,data)=>{if(suffix.endsWith('/list.json'))data[0].points++;return data;}});await assert.rejects(fetchPoints(),/original-source inventory/);
  globalThis.fetch=nativeLayerTransport(samples,{mutateJSON:(suffix,data)=>/ept-sources\/\d+\.json$/.test(suffix)?{}:data});await assert.rejects(fetchPoints(),/metadata identity\/coverage mismatch/);
  globalThis.fetch=nativeLayerTransport(samples,{mutateJSON:(suffix,data)=>suffix.includes('/ept-hierarchy/')?{}:data});await assert.rejects(fetchPoints(),/Incomplete EPT hierarchy/);
  globalThis.fetch=nativeLayerTransport(samples,{mutateJSON:(suffix,data)=>{if(suffix.endsWith('0-0-0-0.json'))data['2-0-0-0']=1;return data;}});await assert.rejects(fetchPoints(),/Orphaned EPT/);
  globalThis.fetch=nativeLayerTransport(samples,{mutateBinary:(id,bytes)=>{if(id!==samples.lidar.assets[0].id)bytes.writeUInt32LE(1,107);return bytes;}});
  await assert.rejects(fetchPoints(),e=>/coverage mismatch/.test(e.message)&&e.acquisition.raw.payloads.length===2&&e.acquisition.raw.payloads[1].binary.length>0);
  globalThis.fetch=nativeLayerTransport(samples,{mutateBinary:(id,bytes)=>{bytes.writeDoubleLE(0,187);return bytes;}});await assert.rejects(fetchPoints(),/bounds exceed/);
  assert.throws(()=>readLASHeader(new ArrayBuffer(4),1),/truncated/);assert.throws(()=>eptNodeBounds('999-0-0-0',samples.lidar.metadata.bounds),/depth/);assert.throws(()=>eptNodeBounds('01-1-0-0',samples.lidar.metadata.bounds),/coordinates/);assert.throws(()=>lidarEnvelope({west:0,east:1,south:40,north:41}),/restricted/);
  assert.ok(Math.abs(utm18N(-75,40)[0]-500000)<1e-6);assert.ok(Math.abs(utm18N(-75,0)[1])<1e-6);
  // Independent installed PROJ +proj=utm +zone=18 +ellps=GRS80 comparison; no runtime PROJ dependency.
  for(const [lon,lat,x,y]of [[-73.978,40.5775,586498.9826189735,4492359.117353762],[-72,42,748464.9207142128,4654130.8912068475]]){const q=utm18N(lon,lat);assert.ok(Math.hypot(q[0]-x,q[1]-y)<.001,'acquisition projection agrees with PROJ to a millimetre');}
  const controller=new AbortController();controller.abort();globalThis.fetch=()=>{throw Error('Cancelled acquisition reached transport');};for(const s of [station,lidar])await assert.rejects(fetchNYC(s,bounds,controller.signal),{name:'AbortError'});
  console.log('PASS actual MTA field/centroid retention, original LiDAR bytes and additive hierarchy, strict acquisition/identity gates, separate raw evidence, source-only merge, visibility and cancellation');
}finally{globalThis.fetch=originalFetch;}
