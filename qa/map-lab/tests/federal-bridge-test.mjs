import assert from 'node:assert/strict';
import {fetchNYC,NYC_SOURCES} from '../data/map-sources.js';
import {resolveSources} from '../pipeline/map-pipeline.js';
import {NYC_MERGE_POLICY} from '../pipeline/map-merge-rules.js';

const source=NYC_SOURCES.find(s=>s.id==='usdot-nbi-2023'),bounds={south:40.702,west:-74.02,north:40.72,east:-73.996},nativeFetch=globalThis.fetch;
const properties={fid:359780,structure_:'000000002232019',main_unit_:89,appr_spans:7,max_span_l:36.5,deck_width:22.6,vert_clr_1:4.14,min_vert_c:4.47,pier_prote:'3',facility_c:'RTE 907L'};
const layer={name:'National_Bridge_Inventory',geometryType:'esriGeometryPoint',objectIdField:'fid',hasZ:false,hasM:false,fields:Object.keys(properties).map(name=>({name,type:name==='fid'?'esriFieldTypeOID':'esriFieldTypeString'}))};
const nativeFeature={attributes:properties,geometry:{x:-74.007744,y:40.703153}},geoJSONFeature={type:'Feature',properties,geometry:{type:'Point',coordinates:[-74.007744,40.703153]}};
assert.equal(NYC_MERGE_POLICY[source.id],'transport-inventory');
globalThis.fetch=async(url,options={})=>{
  const params=options.body instanceof URLSearchParams?options.body:new URL(url).searchParams;
  const data=!new URL(url).pathname.endsWith('/query')?layer:params.get('returnIdsOnly')==='true'?{objectIds:[properties.fid]}:params.get('f')==='json'?{features:[nativeFeature]}:{type:'FeatureCollection',features:[geoJSONFeature]};
  return new Response(JSON.stringify(data));
};
try{
  const snapshot=await fetchNYC(source,bounds),merged=resolveSources({bounds,data:{elements:[]},nyc:[snapshot]});
  assert.deepEqual(snapshot.raw.responses[2].data.features,[nativeFeature]);
  assert.deepEqual(snapshot.data.features,[geoJSONFeature]);
  assert.equal(merged.details.length,1);
  const bridge=merged.details[0];
  assert.equal(bridge.reference,true);
  assert.equal(bridge.merge.ruleId,'transport-inventory');
  assert.deepEqual(bridge.dimensions,{});
  assert.deepEqual(bridge.estimates,[]);
  assert.equal(bridge.tags.min_vert_c,properties.min_vert_c);
  assert.equal(bridge.tags.pier_prote,properties.pier_prote);
  assert.equal(bridge.supportModel,undefined);
  assert.equal(bridge.elevationProfile,undefined);
  assert.equal(bridge.elevation,undefined);
  assert.deepEqual(merged.observations.records.find(r=>r.sourceId===source.id).records,[geoJSONFeature]);
  console.log('PASS federal bridge native/GeoJSON acquisition, raw span/clearance/protection retention and reference-only merge');
}finally{globalThis.fetch=nativeFetch;}
