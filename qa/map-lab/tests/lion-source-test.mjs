import assert from 'node:assert/strict';
import {fetchNYC,NYC_SOURCES,CONEY_BOUNDS,LION_LAYER} from '../data/map-sources.js';
const nativeFetch=globalThis.fetch,source=NYC_SOURCES.find(s=>s.id==='nyc-lion'),ids=Array.from({length:1001},(_,i)=>100000+i),batches=[];
let incomplete=false;
globalThis.fetch=async(url,options={})=>{
  const query=options.body instanceof URLSearchParams?options.body:new URL(url).searchParams;
  let data;
  if(query.get('returnIdsOnly')==='true')data={objectIds:[...ids].reverse()};
  else if(query.has('objectIds')){
    assert.equal(options.method,'POST');assert.equal(url,`${LION_LAYER}/query`);assert.equal(query.get('outFields'),'*');assert.equal(query.get('outSR'),'4326');
    const batch=query.get('objectIds').split(',').map(Number);batches.push(batch);
    data={type:'FeatureCollection',features:batch.slice(incomplete?1:0).map(id=>({type:'Feature',properties:{OBJECTID:id},geometry:{type:'LineString',coordinates:[[0,0],[1,1]]}}))};
  }else data={name:'LION'};
  return new Response(JSON.stringify(data),{status:200});
};
try{
  const snap=await fetchNYC(source,CONEY_BOUNDS);assert.deepEqual(batches.map(b=>b.length),[500,500,1]);assert.deepEqual(snap.data.features.map(f=>f.properties.OBJECTID),ids);
  assert.equal(snap.requests.length,5);assert.equal(snap.raw.responses.length,4);assert.equal(snap.raw.metadata.name,'LION');assert.equal(new URLSearchParams(snap.requests[1].body).get('objectIds'),ids.slice(0,500).join(','));
  incomplete=true;await assert.rejects(fetchNYC(source,CONEY_BOUNDS),/incomplete records/);
  const record=id=>({type:'Feature',properties:{OBJECTID:id},geometry:{type:'LineString',coordinates:[[0,0],[1,1]]}});
  const respond=(inventory,records)=>{globalThis.fetch=async(url,options={})=>{const query=options.body instanceof URLSearchParams?options.body:new URL(url).searchParams;return new Response(JSON.stringify(query.get('returnIdsOnly')==='true'?{objectIds:inventory}:query.has('objectIds')?{type:'FeatureCollection',features:records}:{name:'LION'}),{status:200});};};
  for(const invalid of [[null],[false],[-1],[1.5],[0,0]]){respond(invalid,[]);await assert.rejects(fetchNYC(source,CONEY_BOUNDS),/invalid object ID list/);}
  for(const identity of [null,'',false]){respond([0],[record(identity)]);await assert.rejects(fetchNYC(source,CONEY_BOUNDS),/feature identity/);}
  respond([0],[record(0)]);assert.equal((await fetchNYC(source,CONEY_BOUNDS)).data.features[0].properties.OBJECTID,0,'explicit zero identity is valid');
  respond([0],[record(0),record(0)]);await assert.rejects(fetchNYC(source,CONEY_BOUNDS),/duplicate LION feature identity/);
  respond([0],[record(0),record(1)]);await assert.rejects(fetchNYC(source,CONEY_BOUNDS),/feature identity/);
  respond([0],[{...record(0),properties:null}]);await assert.rejects(fetchNYC(source,CONEY_BOUNDS),/Missing LION feature properties/);
  console.log('PASS LION POST batches, exact ID coverage, request provenance and rejected missing, duplicate or invalid records');
}finally{globalThis.fetch=nativeFetch;}
