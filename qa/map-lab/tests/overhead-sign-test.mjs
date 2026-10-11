import assert from 'node:assert/strict';
import {fetchNYC,NYC_SOURCES,datasetURL,nycURL} from '../data/map-sources.js';
import {resolveSources,resolveMap} from '../pipeline/map-pipeline.js';

const source=NYC_SOURCES.find(s=>s.id==='nysdot-overhead-signs'),bounds={south:40.70,west:-74.02,north:40.72,east:-73.99},properties={OBJECTID:42,AssetID:'asset-42',SIN:'S-42',AssetStatus:'Active',EditedDate:1780000000000,GlobalID:'{11111111-2222-3333-4444-555555555555}'},point=[-74.005,40.71],feature={type:'Feature',geometry:{type:'Point',coordinates:point},properties},layer={name:'Overhead Sign Structure',geometryType:'esriGeometryPoint',objectIdField:'OBJECTID',hasZ:false,hasM:false,extent:{spatialReference:{wkid:26918}},fields:[{name:'OBJECTID',type:'esriFieldTypeOID'},...source.requiredFields.map(name=>({name,type:'esriFieldTypeString'}))]},originalFetch=globalThis.fetch;
assert.ok(source);assert.equal(datasetURL(source.dataset),source.layer);assert.ok(nycURL(source,bounds).startsWith(source.layer+'/query?'));
try{
  globalThis.fetch=async(url,options={})=>{
    const parsed=new URL(url),params=options.body instanceof URLSearchParams?options.body:parsed.searchParams;
    const data=!parsed.pathname.endsWith('/query')?layer:params.get('returnIdsOnly')==='true'?{objectIdFieldName:'OBJECTID',objectIds:[properties.OBJECTID]}:params.get('f')==='json'?{features:[{attributes:properties,geometry:{x:584000,y:4500000}}]}:{type:'FeatureCollection',features:[feature]};
    return new Response(JSON.stringify(data));
  };
  const snapshot=await fetchNYC(source,bounds),input={bounds,data:{elements:[]},nyc:[snapshot]},before=JSON.stringify(input),merged=resolveSources(input),render=resolveMap(input),record=merged.details[0];
  assert.deepEqual(snapshot.data.features,[feature]);assert.deepEqual(snapshot.raw.layer,layer);assert.equal(snapshot.raw.responses.length,4);assert.deepEqual(snapshot.raw.responses[2].data.features[0].attributes,properties);
  assert.equal(record.sourceRole,'overhead-sign-asset');assert.equal(record.merge.ruleId,'sign-structure-inventory');assert.equal(record.reference,true);assert.equal(record.rule,'point');assert.deepEqual(record.tags,properties);assert.deepEqual(record.dimensions,{});assert.deepEqual(record.estimates,[]);assert.ok(record.point);
  for(const key of ['width','height','supportModel','face','gantry','columns','elevation'])assert.equal(record[key],undefined,'source merge must not invent '+key);
  assert.deepEqual(merged.merge,render.merge);assert.equal(render.details[0].reference,true);assert.deepEqual(merged.observations.records.find(r=>r.sourceId===source.id).snapshot.raw,snapshot.raw);assert.equal(JSON.stringify(input),before);
  const hidden=resolveSources({...input,nyc:[{...snapshot,visible:false}]});assert.equal(hidden.details.length,0);assert.equal(hidden.observations.records.length,merged.observations.records.length);
  globalThis.fetch=async(url,options={})=>{const parsed=new URL(url),params=options.body instanceof URLSearchParams?options.body:parsed.searchParams;const data=!parsed.pathname.endsWith('/query')?layer:params.get('returnIdsOnly')==='true'?{objectIdFieldName:'OBJECTID',objectIds:[properties.OBJECTID]}:params.get('f')==='json'?{features:[{attributes:properties,geometry:{x:584000,y:4500000}}]}:{type:'FeatureCollection',features:[{...feature,properties:{...properties,AssetStatus:'Retired'}}]};return new Response(JSON.stringify(data));};
  await assert.rejects(fetchNYC(source,bounds),error=>{assert.match(error.message,/Conflicting ArcGIS native\/GeoJSON property AssetStatus/);assert.equal(error.acquisition.sourceId,source.id);assert.equal(error.acquisition.status,'rejected');assert.equal(error.acquisition.raw.responses.length,4);return true;});
  console.log('PASS overhead sign source identity, complete paired records, reference-only merge, raw retention, visibility and conflicting status rejection');
}finally{globalThis.fetch=originalFetch;}
