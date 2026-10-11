import assert from 'node:assert/strict';
import {loadTransportInventoryFixture} from './fixture.mjs';
import {fetchNYC,NYC_SOURCES,datasetURL,nycURL} from '../data/map-sources.js';
import {resolveSources,resolveMap} from '../pipeline/map-pipeline.js';

const {samples}=await loadTransportInventoryFixture(),nativeFetch=globalThis.fetch,snapshots=[],acquisitionFailures=[];
try{
  for(const sample of samples){
    const source=NYC_SOURCES.find(s=>s.id===sample.sourceId),id=sample.geoJSONFeature.properties[source.idField];let fault=null;
    const respond=async(url,options={})=>{
      const params=options.body instanceof URLSearchParams?options.body:new URL(url).searchParams;let data;
      if(!new URL(url).pathname.endsWith('/query')){data=structuredClone(sample.layer);if(fault==='schema')data.fields=data.fields.filter(f=>f.name!==source.requiredFields[0]);}
      else if(params.get('returnIdsOnly')==='true')data={objectIds:[id]};
      else{
        assert.equal(options.method,'POST');assert.equal(url,source.layer+'/query');for(const [key,value]of Object.entries({outFields:'*',returnZ:'true',returnM:'true',outSR:'4326'}))assert.equal(params.get(key),value);
        data=params.get('f')==='json'?{features:[structuredClone(sample.nativeFeature)]}:{type:'FeatureCollection',features:[structuredClone(sample.geoJSONFeature)]};
        if(fault===params.get('f'))data.features=[];
        if(params.get('f')==='geojson'){
          if(fault==='property')data.features[0].properties[source.requiredFields[0]]='conflicting value';
          if(fault==='missing-property')delete data.features[0].properties[source.requiredFields[0]];
          if(fault==='extra-property')data.features[0].properties.unrecorded_field=1;
          if(fault==='id-property'){data.features[0].id=id;delete data.features[0].properties[source.idField];}
          if(fault==='key-order')data.features[0].properties=Object.fromEntries(Object.entries(data.features[0].properties).reverse());
          if(fault==='api')data={error:{message:'provider rejection'}};
        }
      }return new Response(JSON.stringify(data));
    };
    globalThis.fetch=respond;const snapshot=await fetchNYC(source,sample.bounds);snapshots.push(snapshot);
    assert.deepEqual(snapshot.data.features,[sample.geoJSONFeature]);assert.deepEqual(snapshot.raw.layer,sample.layer);assert.deepEqual(snapshot.raw.responses[2].data.features,[sample.nativeFeature]);assert.deepEqual(JSON.parse(JSON.stringify(snapshot)),snapshot,'full fields, metadata, native Z/M and exported records survive');
    assert.equal(datasetURL(source.dataset),source.layer);assert.ok(nycURL(source,sample.bounds).startsWith(source.layer+'/query?'));
    assert.equal(snapshot.metadata.verticalCRS,undefined,'geometry channels do not assign an unverified vertical datum');assert.equal(snapshot.metadata.elevationUnit,undefined);
    for(const [name,message]of [['json',/Incomplete native/],['geojson',/Incomplete ArcGIS object/],['schema',/Missing ArcGIS field/]]){fault=name;await assert.rejects(fetchNYC(source,sample.bounds),message);}fault=null;
    for(const name of ['property','missing-property','extra-property','api']){
      fault=name;await assert.rejects(fetchNYC(source,sample.bounds),e=>{
        assert.match(e.message,name==='api'?/provider rejection/:/Conflicting ArcGIS/);assert.equal(e.acquisition.status,'rejected');assert.equal(e.acquisition.sourceId,source.id);assert.deepEqual(e.acquisition.raw.responses[2].data.features[0],sample.nativeFeature);assert.equal(e.acquisition.raw.responses.length,4);assert.equal(e.acquisition.data,undefined,'rejected pairs are evidence, never a complete usable snapshot');assert.deepEqual(JSON.parse(JSON.stringify(e.acquisition)),e.acquisition);acquisitionFailures.push(e.acquisition);return true;
      });
    }
    for(const name of ['id-property','key-order']){fault=name;assert.deepEqual((await fetchNYC(source,sample.bounds)).data.features[0].properties,sample.geoJSONFeature.properties);}fault=null;
    // MapServer metadata can omit objectIdField; its declared OID field still defines identity.
    if(source.id==='nysdot-ramps')assert.equal(sample.layer.objectIdField,undefined);
  }
  const sample=samples.find(s=>s.sourceId==='nysdot-roadways'),source=NYC_SOURCES.find(s=>s.id===sample.sourceId),ids=Array.from({length:501},(_,i)=>i),batches=[];
  globalThis.fetch=async(url,options={})=>{
    const params=options.body instanceof URLSearchParams?options.body:new URL(url).searchParams;let data;
    if(!new URL(url).pathname.endsWith('/query'))data=sample.layer;
    else if(params.get('returnIdsOnly')==='true')data={objectIds:[...ids].reverse()};
    else{const batch=params.get('objectIds').split(',').map(Number);if(params.get('f')==='json')batches.push(batch);data=params.get('f')==='json'?{features:batch.map(id=>({...sample.nativeFeature,attributes:{...sample.nativeFeature.attributes,[source.idField]:id}}))}:{type:'FeatureCollection',features:batch.map(id=>({...sample.geoJSONFeature,properties:{...sample.geoJSONFeature.properties,[source.idField]:id}}))};}
    return new Response(JSON.stringify(data));
  };
  const batched=await fetchNYC(source,sample.bounds);assert.deepEqual(batches.map(b=>b.length),[500,1]);assert.deepEqual(batched.data.features.map(f=>f.properties[source.idField]),ids);
  let count=0,field=source.idField;
  globalThis.fetch=async url=>{const params=new URL(url).searchParams,data=!new URL(url).pathname.endsWith('/query')?sample.layer:params.get('returnCountOnly')==='true'?{count}:{objectIdFieldName:field,objectIds:null};return new Response(JSON.stringify(data));};
  const empty=await fetchNYC(source,sample.bounds);assert.deepEqual(empty.data.features,[]);assert.ok(empty.raw.responses.some(r=>r.data.count===0));assert.equal(empty.raw.responses[1].data.objectIds,null,'provider response remains unchanged');
  for(const unconfirmed of [null,'0',1]){count=unconfirmed;await assert.rejects(fetchNYC(source,sample.bounds),/Unconfirmed empty/);}count=0;
  for(const invalidField of [undefined,'WrongID']){field=invalidField;await assert.rejects(fetchNYC(source,sample.bounds),/object ID/);}field=source.idField;
  const bounds=samples[0].bounds,input={bounds,data:{elements:[]},nyc:snapshots,acquisitionFailures},original=JSON.stringify(input),merged=resolveSources(input),render=resolveMap(input);
  assert.equal(merged.observations.acquisitionFailures,acquisitionFailures);assert.equal(render.observations.acquisitionFailures,acquisitionFailures,'rejected observations remain separate renderer evidence');
  assert.equal(merged.details.length,samples.length);assert.equal(render.details.length,samples.length);assert.deepEqual(merged.merge,render.merge,'render preparation does not rewrite source decisions');
  for(const f of [...merged.details,...render.details]){assert.equal(f.reference,true);assert.equal(f.merge.ruleId,'transport-inventory');assert.deepEqual(f.dimensions,{});for(const name of ['elevation','absoluteElevation','elevationProfile','supportModel','nodes','width'])assert.equal(f[name],undefined,'invented inventory '+name);}
  const bridge=merged.details.find(f=>f.sourceRole==='bridge-inventory');assert.ok(bridge.point);assert.equal(bridge.rule,'point');assert.equal(bridge.tags.NumberOfSpans,samples.find(s=>s.sourceId===bridge.sourceId).geoJSONFeature.properties.NumberOfSpans);
  assert.equal(merged.observations.records.length,samples.length+1,'OSM and every inventory provider are retained');assert.equal(JSON.stringify(input),original);
  const hidden=resolveSources({...input,nyc:snapshots.map(s=>({...s,visible:s.sourceId!=='nysdot-roadways'}))});assert.equal(hidden.details.length,samples.length-1);assert.equal(hidden.observations.records.length,merged.observations.records.length,'visibility never drops provider observations');
  const controller=new AbortController();controller.abort();globalThis.fetch=()=>{throw Error('aborted request reached transport');};await assert.rejects(fetchNYC(source,bounds,controller.signal),{name:'AbortError'});
  console.log('PASS captured roadway/ramp/bridge schemas, complete native/GeoJSON batching, paired property consistency and rejection evidence, retained fields/Z/M, source-only inventory roles, immutable exports, visibility and cancellation');
}finally{globalThis.fetch=nativeFetch;}
