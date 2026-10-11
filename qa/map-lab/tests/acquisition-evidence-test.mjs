import assert from 'node:assert/strict';
import {loadFidelityFixture} from './fixture.mjs';
import {fetchNYC,NYC_SOURCES,CONEY_BOUNDS} from '../data/map-sources.js';
import {queryOSM} from '../data/osm-source.js';
import {NYC_MESH_LAYER} from '../data/nyc-building-mesh.js';
import {acquisitionError} from '../data/acquisition-error.js';

const nativeFetch=globalThis.fetch,json=data=>new Response(JSON.stringify(data)),reject=async(fn,inspect)=>assert.rejects(fn,e=>{assert.equal(e.acquisition.status,'rejected');assert.equal(e.acquisition.data,undefined);assert.deepEqual(JSON.parse(JSON.stringify(e.acquisition)),e.acquisition);inspect(e.acquisition);return true;});
try{
  const source=NYC_SOURCES.find(s=>s.id==='nyc-roadbed'),page=Array.from({length:1000},(_,source_id)=>({type:'Feature',properties:{source_id},geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,0]]]}})),malformed={type:'FeatureCollection',features:[{type:'Feature',properties:{source_id:1000},geometry:null}]};
  globalThis.fetch=async url=>json(new URL(url).searchParams.get('$offset')==='0'?{type:'FeatureCollection',features:page}:malformed);
  await reject(()=>fetchNYC(source,CONEY_BOUNDS),e=>{assert.equal(e.sourceId,source.id);assert.equal(e.requests.length,2);assert.deepEqual(e.raw.responses[0].data.features,page);assert.deepEqual(e.raw.responses[1].data,malformed);});
  const lion=NYC_SOURCES.find(s=>s.id==='nyc-lion'),partial={type:'FeatureCollection',features:[{type:'Feature',properties:{OBJECTID:0},geometry:{type:'LineString',coordinates:[[0,0],[1,1]]}}]};
  globalThis.fetch=async(url,options={})=>json((options.body||new URL(url).searchParams).get('returnIdsOnly')==='true'?{objectIds:[0,1]}:partial);
  await reject(()=>fetchNYC(lion,CONEY_BOUNDS),e=>{assert.equal(e.requests[1].method,'POST');assert.equal(e.raw.responses.length,2);assert.deepEqual(e.raw.responses[1].data,partial);});
  const incomplete={remark:'provider reports incomplete query',elements:[{type:'node',id:1,lat:40,lon:-74}]};globalThis.fetch=async()=>json(incomplete);
  await reject(()=>queryOSM('[out:json];node(1);out;','https://example.test/overpass'),e=>{assert.equal(e.sourceId,'osm-overpass');assert.deepEqual(e.raw.responses[0].data,incomplete);assert.equal(new URLSearchParams(e.requests[0].body).get('data'),'[out:json];node(1);out;');});
  const {mesh}=await loadFidelityFixture(),snapshot=mesh.nyc.find(s=>s.sourceId==='nyc-buildings-2014'),meshSource=NYC_SOURCES.find(s=>s.id===snapshot.sourceId);let fault='decode',leaf=null;
  globalThis.fetch=async url=>{
    const suffix=new URL(url).pathname.slice(new URL(NYC_MESH_LAYER).pathname.length),parts=suffix.split('/').filter(Boolean);
    if(!suffix)return json(snapshot.raw.layer);
    const raw=snapshot.raw.nodes.find(n=>n.id===parts[1]);assert.ok(raw,'request must be in the complete captured traversal');
    if(parts.length===2)return json(raw.node);
    leaf??=raw;if(fault==='binary'&&parts[2]==='attributes'&&parts[3]==='f_1')return new Response('',{status:400});
    const bytes=Buffer.from(parts[2]==='geometries'?raw.geometry:raw.attributes[parts[3]],'base64');return new Response(fault==='decode'&&parts[2]==='geometries'?bytes.subarray(0,-1):bytes);
  };
  await reject(()=>fetchNYC(meshSource,snapshot.bounds),e=>{const raw=e.raw.nodes.find(n=>n.id===leaf.id);assert.equal(raw.geometry,Buffer.from(leaf.geometry,'base64').subarray(0,-1).toString('base64'));assert.deepEqual(raw.attributes,leaf.attributes);assert.ok(e.raw.responses.some(r=>r.data.id===leaf.id));});
  fault='binary';leaf=null;
  await reject(()=>fetchNYC(meshSource,snapshot.bounds),e=>{const raw=e.raw.nodes.find(n=>n.id===leaf.id);assert.equal(raw.geometry,leaf.geometry);assert.equal(raw.attributes.f_1,undefined);for(const key of ['f_0','f_2','f_3','f_4'])assert.equal(raw.attributes[key],leaf.attributes[key]);assert.ok(e.requests.some(r=>r.url.endsWith('/attributes/f_1/0')));});
  const controller=new AbortController();controller.abort('explicit cancellation');const cancellation=acquisitionError(controller.signal.reason,source,CONEY_BOUNDS,{raw:{responses:[]}},controller.signal);assert.equal(cancellation.message,'explicit cancellation');assert.equal(cancellation.acquisition.status,'cancelled');
  console.log('PASS rejected Socrata/LION/OSM responses, I3S undecodable/partially failed binary channels, request provenance, export round trips and cancellation evidence');
}finally{globalThis.fetch=nativeFetch;}
