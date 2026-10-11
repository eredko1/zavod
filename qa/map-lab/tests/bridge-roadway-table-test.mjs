import assert from 'node:assert/strict';
import {fetchNYC,NYC_SOURCES} from '../data/map-sources.js';
import {resolveSources} from '../pipeline/map-pipeline.js';
import {NYC_MERGE_POLICY} from '../pipeline/map-merge-rules.js';

const source=NYC_SOURCES.find(s=>s.id==='nysdot-bridge-roadway'),bounds={south:40.70,west:-74.02,north:40.72,east:-73.99},nativeFetch=globalThis.fetch;
const attributes={OBJECTID:487,BIN:'223201B',Bridge_ROUTE_ID:'275042011',ROUTE_ID:'275042011',FROM_MEASURE:0.281,TO_MEASURE:0.38,Roadway_Type:'Ramp',Lat:40.70827446,Long:-73.99981962};
const layer={name:'Bridge_With_Roadway_Inventory',type:'Table',objectIdField:'OBJECTID',fields:Object.keys(attributes).map(name=>({name,type:name==='OBJECTID'?'esriFieldTypeOID':['Lat','Long'].includes(name)?'esriFieldTypeDouble':'esriFieldTypeString'}))};
let fault=null;
globalThis.fetch=async(url,options={})=>{
  const params=options.body instanceof URLSearchParams?options.body:new URL(url).searchParams;
  const row={attributes:{...attributes}};
  if(fault==='coordinate')row.attributes.Lat=41;
  if(fault==='identity')row.attributes.OBJECTID=999;
  if(fault==='field')delete row.attributes.Roadway_Type;
  const data=!new URL(url).pathname.endsWith('/query')?layer:params.get('returnIdsOnly')==='true'?fault==='empty'?{objectIdFieldName:'OBJECTID',objectIds:null}:{objectIds:[487]}:params.get('returnCountOnly')==='true'?{count:0}:{features:[row]};
  return new Response(JSON.stringify(data));
};
try{
  assert.equal(NYC_MERGE_POLICY[source.id],'transport-inventory');
  const snapshot=await fetchNYC(source,bounds),merged=resolveSources({bounds,data:{elements:[]},nyc:[snapshot]});
  assert.equal(snapshot.data.features.length,1);
  assert.deepEqual(snapshot.data.features[0].geometry.coordinates,[attributes.Long,attributes.Lat]);
  assert.deepEqual(snapshot.raw.responses[2].data.features[0].attributes,attributes);
  assert.equal(snapshot.raw.layer.type,'Table');
  const detail=merged.details[0];
  assert.equal(detail.reference,true);
  assert.equal(detail.merge.ruleId,'transport-inventory');
  assert.equal(detail.sourceRole,'bridge-roadway-link');
  assert.deepEqual(detail.dimensions,{});
  assert.deepEqual(detail.estimates,[]);
  for(const name of ['elevation','elevationProfile','supportModel','width'])assert.equal(detail[name],undefined);
  assert.deepEqual(merged.observations.records.find(r=>r.sourceId===source.id).records,snapshot.data.features);
  for(const name of ['coordinate','identity']){fault=name;await assert.rejects(fetchNYC(source,bounds),/Invalid or out-of-area|Unexpected or duplicate/);}fault=null;
  fault='field';await assert.rejects(fetchNYC(source,bounds),/Incomplete ArcGIS table attributes/);
  fault='empty';const empty=await fetchNYC(source,bounds);assert.deepEqual(empty.data.features,[]);assert.equal(empty.raw.responses[2].data.count,0);
  console.log('PASS bounded bridge-roadway table acquisition, complete source rows, reference-only merge and inconsistent-row rejection');
}finally{globalThis.fetch=nativeFetch;}
