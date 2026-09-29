import assert from 'node:assert/strict';
import {loadFidelityFixture} from './fixture.mjs';
import {fetchNYC,NYC_SOURCES,CONEY_BOUNDS,WATER_TANK_LAYER} from '../data/map-sources.js';

const {mesh}=await loadFidelityFixture(),tank=mesh.nyc.find(s=>s.sourceId==='nyc-water-tanks'),source=NYC_SOURCES.find(s=>s.id===tank.sourceId),nativeFetch=globalThis.fetch;let missing=false;
globalThis.fetch=async(url,options={})=>{
  const params=options.body instanceof URLSearchParams?options.body:new URL(url).searchParams;let data;
  if(!new URL(url).pathname.endsWith('/query'))data=tank.raw.layer;
  else if(params.get('returnIdsOnly')==='true')data={objectIds:tank.data.features.map(f=>f.properties.OBJECTID).reverse()};
  else{assert.equal(options.method,'POST');assert.equal(url,WATER_TANK_LAYER+'/query');assert.equal(params.get('outFields'),'*');assert.equal(params.get('returnZ'),'true');assert.equal(params.get('returnM'),'true');data=params.get('f')==='json'?tank.raw.responses.find(r=>r.data.features?.[0]?.attributes).data:{...tank.data,features:tank.data.features.slice(missing?1:0)};}
  return new Response(JSON.stringify(data),{status:200});
};
try{
  const snapshot=await fetchNYC(source,CONEY_BOUNDS);assert.equal(snapshot.raw.responses.length,4);assert.deepEqual(snapshot.raw.layer,tank.raw.layer);assert.deepEqual(snapshot.data.features,tank.data.features);assert.ok(snapshot.raw.responses.some(r=>r.request.body&&new URLSearchParams(r.request.body).get('returnTrueCurves')==='true'));assert.deepEqual(JSON.parse(JSON.stringify(snapshot)),snapshot,'raw native responses, domains and ignored fields survive JSON export');
  missing=true;await assert.rejects(fetchNYC(source,CONEY_BOUNDS),/Incomplete ArcGIS object coverage/);
  for(const identity of [null,'',false,0]){
    globalThis.fetch=async(url,options={})=>{const params=options.body instanceof URLSearchParams?options.body:new URL(url).searchParams,f=structuredClone(tank.data.features[0]);f.id=0;f.properties.OBJECTID=identity;const data=!new URL(url).pathname.endsWith('/query')?tank.raw.layer:params.get('returnIdsOnly')==='true'?{objectIds:[0]}:params.get('f')==='json'?{features:[{attributes:{...f.properties,OBJECTID:0}}]}:{type:'FeatureCollection',features:[f]};return new Response(JSON.stringify(data),{status:200});};
    if(identity===0)assert.equal((await fetchNYC(source,CONEY_BOUNDS)).data.features[0].properties.OBJECTID,0,'explicit zero identity remains distinct from missing identity');
    else await assert.rejects(fetchNYC(source,CONEY_BOUNDS),/feature identity/,'missing/blank/boolean IDs cannot satisfy an object-zero inventory');
  }
  const city=NYC_SOURCES.find(s=>s.id==='nyc-roadbed'),feature={type:'Feature',properties:{source_id:4,unused:'keep me'},geometry:{type:'Polygon',coordinates:[[[0,0,7],[1,0,8],[1,1,9],[0,0,7]]]}};
  globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('/api/views/')?{name:'Roadbed',columns:[{fieldName:'unused',domain:{future:'keep domain'}}],futureMetadata:'keep metadata'}:{type:'FeatureCollection',futureResponse:'keep response',features:[feature,structuredClone(feature)]}),{status:200});
  const socrata=await fetchNYC(city,CONEY_BOUNDS);assert.equal(socrata.data.features.length,1,'existing display deduplication remains');assert.equal(socrata.raw.responses[0].data.features.length,2,'identical original observations are retained before deduplication');assert.equal(socrata.raw.responses[0].data.futureResponse,'keep response');assert.equal(socrata.raw.metadata.columns[0].domain.future,'keep domain');assert.equal(socrata.data.features[0].geometry.coordinates[0][1][2],8,'returned Z survives retention');assert.equal(socrata.requests.length,2);assert.deepEqual(JSON.parse(JSON.stringify(socrata)).raw,socrata.raw);
  console.log('PASS full native equipment, all fields/Z/M requests, complete ID coverage, raw Socrata duplicates/metadata/Z and JSON export');
}finally{globalThis.fetch=nativeFetch;}
