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
  assert.equal(snap.requests.length,4);assert.equal(new URLSearchParams(snap.requests[1].body).get('objectIds'),ids.slice(0,500).join(','));
  incomplete=true;await assert.rejects(fetchNYC(source,CONEY_BOUNDS),/incomplete records/);
  console.log('PASS LION POST batches, complete ID coverage, request provenance and rejected missing records');
}finally{globalThis.fetch=nativeFetch;}
