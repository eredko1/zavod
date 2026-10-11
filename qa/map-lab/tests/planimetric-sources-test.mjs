import assert from 'node:assert/strict';
import {loadPlanimetricSamples,loadLandContextSamples} from './fixture.mjs';
import {planimetricTransport} from './planimetric-source-mock.mjs';
import {fetchNYC,NYC_SOURCES} from '../data/map-sources.js';
import {resolveSources,resolveMap} from '../pipeline/map-pipeline.js';

const fixture=await loadPlanimetricSamples(),nativeFetch=globalThis.fetch,snapshots=[];
fixture.samples.push(...(await loadLandContextSamples()).samples);
try{
  globalThis.fetch=planimetricTransport(fixture);
  for(const sample of fixture.samples){
    const source=NYC_SOURCES.find(s=>s.id===sample.sourceId),snapshot=await fetchNYC(source,sample.bounds);snapshots.push(snapshot);
    assert.deepEqual(snapshot.data.features,[sample.geoJSONFeature]);assert.deepEqual(snapshot.raw.layer,sample.layer);
    const native=snapshot.raw.responses.find(r=>r.data.features?.[0]?.attributes);assert.deepEqual(native.data.features,[sample.nativeFeature]);
    assert.equal(new URLSearchParams(native.request.body).get('outSR'),String(sample.layer.extent.spatialReference.wkid));
    assert.equal(snapshot.metadata.elevationUnit,undefined,'a horizontal foot convention does not certify the vertical unit');
    globalThis.fetch=planimetricTransport(fixture,{mutate:(id,data,params)=>{if(id===source.id&&params.get('f')==='json'&&data.features)data.spatialReference={wkid:4326};return data;}});
    await assert.rejects(fetchNYC(source,sample.bounds),/Unexpected native ArcGIS coordinate reference/);
    globalThis.fetch=planimetricTransport(fixture);
  }
  const cartographic=snapshots.find(s=>s.sourceId==='nyc-pavement-carto-2022');
  assert.equal(cartographic.raw.layer.fields.find(f=>f.type==='esriFieldTypeOID').name,'OBJECTID_1');
  assert.ok(Object.hasOwn(cartographic.data.features[0].properties,'OBJECTID'),'retain the related original ID beside the actual service identity');
  const repeatedOriginal=structuredClone(cartographic),second=structuredClone(repeatedOriginal.data.features[0]);second.properties.OBJECTID_1+=1;repeatedOriginal.data.features.push(second);
  const distinct=resolveSources({bounds:repeatedOriginal.bounds,nyc:[repeatedOriginal]});assert.equal(distinct.details.length,2);assert.equal(new Set(distinct.details.map(f=>f.id)).size,2,'related original IDs cannot collapse distinct service identities');
  const source=NYC_SOURCES.find(s=>s.id==='mta-entrances'),entrances=await fetchNYC(source,fixture.entrances.bounds);snapshots.push(entrances);
  for(const sample of fixture.streetSamples){const snapshot=await fetchNYC(NYC_SOURCES.find(s=>s.id===sample.sourceId),sample.bounds);snapshots.push(snapshot);assert.deepEqual(snapshot.data.features,[sample.feature]);assert.deepEqual(snapshot.raw.metadata,sample.metadata);}
  assert.deepEqual(entrances.data,fixture.entrances.data);assert.ok(entrances.data.features.some(f=>f.properties[':id'].includes('~')));
  assert.ok(new Set(entrances.data.features.map(f=>f.properties.station_id)).size<entrances.data.features.length,'one station has distinct entrances');
  for(const [fault,message]of [['duplicate',/Invalid MTA station identifiers/],['injection',/Invalid MTA station identifiers/],['missing',/Incomplete MTA station records/],['coordinate',/Invalid MTA station identity or centroid/]]){
    globalThis.fetch=planimetricTransport(fixture,{mutate:(id,data,params)=>{if(id!=='mta-entrances'||!Array.isArray(data))return data;if(params.get('$select')===':id'){if(fault==='duplicate')data.push(data[0]);if(fault==='injection')data[0][':id']="row-unsafe'";}else{if(fault==='missing')data.pop();if(fault==='coordinate')data[0].entrance_latitude=null;}return data;}});
    await assert.rejects(fetchNYC(source,fixture.entrances.bounds),e=>{assert.match(e.message,message);assert.equal(e.acquisition.status,'rejected');assert.ok(e.acquisition.raw.responses.length);return true;});
  }
  const rows=Array.from({length:201},(_,i)=>({...entrances.data.features[0].properties,':id':'row-batch_'+i})),batches=[];
  globalThis.fetch=async url=>{const u=new URL(url),where=u.searchParams.get('$where');let data;if(u.pathname.includes('/api/views/'))data=entrances.raw.metadata;else if(u.searchParams.get('$select')===':id')data=rows.map(r=>({':id':r[':id']}));else{const ids=[...where.matchAll(/'([^']+)'/g)].map(m=>m[1]);batches.push(ids.length);data=rows.filter(r=>ids.includes(r[':id']));}return new Response(JSON.stringify(data));};
  assert.equal((await fetchNYC(source,fixture.entrances.bounds)).data.features.length,rows.length);assert.deepEqual(batches,[100,100,1]);
  const input={bounds:fixture.entrances.bounds,data:{elements:[]},nyc:snapshots},original=JSON.stringify(input),merged=resolveSources(input),render=resolveMap(input);
  assert.deepEqual(merged.merge,render.merge);assert.equal(merged.details.length,fixture.samples.length+fixture.streetSamples.length+entrances.data.features.length);
  for(const feature of merged.details){
    assert.equal(feature.reference,true);assert.deepEqual(feature.dimensions,{});assert.deepEqual(feature.estimates,[]);
    for(const key of ['absoluteElevation','elevationProfile','supportModel','equipment','height','width'])assert.equal(feature[key],undefined,'source merge must not create '+key);
    assert.equal(feature.merge.ruleId,feature.sourceId==='mta-entrances'?'station-inventory':feature.sourceRole.startsWith('pedestrian-')?'street-inventory':'planimetric-inventory');
    const sample=fixture.samples.find(s=>s.sourceId===feature.sourceId);if(sample)assert.deepEqual(feature.sourceGeometry,sample.geoJSONFeature.geometry);
  }
  assert.equal(JSON.stringify(input),original);
  const hidden=resolveSources({...input,nyc:snapshots.map(s=>({...s,visible:false}))});assert.equal(hidden.details.length,0);assert.equal(hidden.observations.records.length,snapshots.length+1);
  assert.deepEqual(JSON.parse(JSON.stringify(merged.observations.records)).slice(1).map(r=>r.snapshot.raw),snapshots.map(s=>s.raw));
  console.log('PASS original NYC native/geographic geometry channels, CRS rejection, source-only roles, distinct entrance IDs, bounded batches, failed evidence, immutable merge and complete retained snapshots');
}finally{globalThis.fetch=nativeFetch;}
