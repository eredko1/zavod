import assert from 'node:assert/strict';
import {fetchNYC,NYC_SOURCES,datasetURL,nycURL} from '../data/map-sources.js';
import {resolveSources,resolveMap} from '../pipeline/map-pipeline.js';

const source=NYC_SOURCES.find(s=>s.id==='nysdot-height-restricted-bridges'),bounds={south:40.70,west:-74.02,north:40.72,east:-73.99},native={OBJECTID:9548,BIN:'2268930',CARRIED_1:'PEDESTRIAN BRIDGE',CROSSED_1:'I-478',MIN_VERT_CLEARANCE_ON:0,MIN_VERT_CLEARANCE_UNDER:13.67,POSTED_VRT_CLRNC_UNDER:0,PERMITTED_VC_UNDER:13.42,INSPECTION_DATE:1762387200000,CONDITION_RATING:6.516},geographic={...native,CONDITION_RATING:6.51599979},feature={type:'Feature',geometry:{type:'Point',coordinates:[-74.01484534552868,40.70620211749575]},properties:geographic},layer={name:'Height Restricted Bridges',geometryType:'esriGeometryPoint',objectIdField:'OBJECTID',hasZ:false,hasM:false,extent:{spatialReference:{wkid:26918}},fields:[{name:'OBJECTID',type:'esriFieldTypeOID'},...source.requiredFields.map(name=>({name,type:'esriFieldTypeDouble'})),{name:'CONDITION_RATING',type:'esriFieldTypeSingle'}]},originalFetch=globalThis.fetch;
assert.ok(source);assert.equal(datasetURL(source.dataset),source.layer);assert.ok(nycURL(source,bounds).startsWith(source.layer+'/query?'));
try{
  let fault=null;
  globalThis.fetch=async(url,options={})=>{const parsed=new URL(url),params=options.body instanceof URLSearchParams?options.body:parsed.searchParams;let data;
    if(!parsed.pathname.endsWith('/query'))data=layer;
    else if(params.get('returnIdsOnly')==='true')data={objectIdFieldName:'OBJECTID',objectIds:[native.OBJECTID]};
    else if(params.get('f')==='json')data={features:[{attributes:fault==='overflow'?{...native,CONDITION_RATING:1e40}:native,geometry:{x:580000,y:4500000}}]};
    else{const properties={...geographic};if(fault==='single')properties.CONDITION_RATING=6.6;if(fault==='overflow')properties.CONDITION_RATING=2e40;if(fault==='double')properties.MIN_VERT_CLEARANCE_UNDER=13.67000001;data={type:'FeatureCollection',features:[{...feature,properties}]};}
    return new Response(JSON.stringify(data));
  };
  const snapshot=await fetchNYC(source,bounds),input={bounds,data:{elements:[]},nyc:[snapshot]},before=JSON.stringify(input),merged=resolveSources(input),render=resolveMap(input),record=merged.details[0];
  assert.deepEqual(snapshot.data.features,[feature]);assert.equal(snapshot.raw.responses.length,4);assert.equal(snapshot.raw.responses[2].data.features[0].attributes.CONDITION_RATING,6.516,'original rounded decimal retained');assert.equal(snapshot.data.features[0].properties.CONDITION_RATING,6.51599979,'original GeoJSON float retained');
  assert.equal(record.sourceRole,'bridge-clearance-observation');assert.equal(record.merge.ruleId,'bridge-clearance-inventory');assert.equal(record.reference,true);assert.equal(record.rule,'point');assert.deepEqual(record.tags,geographic);assert.deepEqual(record.dimensions,{});assert.deepEqual(record.estimates,[]);
  for(const key of ['elevation','absoluteElevation','elevationProfile','supportModel','underside','roadGrade','width'])assert.equal(record[key],undefined,'source merge must not create '+key);
  assert.deepEqual(merged.merge,render.merge);assert.equal(render.details[0].reference,true);assert.deepEqual(merged.observations.records.find(r=>r.sourceId===source.id).snapshot.raw,snapshot.raw);assert.equal(JSON.stringify(input),before);
  const hidden=resolveSources({...input,nyc:[{...snapshot,visible:false}]});assert.equal(hidden.details.length,0);assert.equal(hidden.observations.records.length,merged.observations.records.length);
  for(const [name,field] of [['single','CONDITION_RATING'],['overflow','CONDITION_RATING'],['double','MIN_VERT_CLEARANCE_UNDER']]){fault=name;await assert.rejects(fetchNYC(source,bounds),error=>{assert.match(error.message,new RegExp('Conflicting ArcGIS native/GeoJSON property '+field));assert.equal(error.acquisition.status,'rejected');assert.equal(error.acquisition.raw.responses.length,4);return true;});}
  console.log('PASS live-schema clearance reference, exact float32 equivalence, double conflict rejection, full raw records and no source estimates');
}finally{globalThis.fetch=originalFetch;}
