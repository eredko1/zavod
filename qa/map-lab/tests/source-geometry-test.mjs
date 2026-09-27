import assert from 'node:assert/strict';
import {fetchNYC,NYC_SOURCES,featureID} from '../data/map-sources.js';
import {compileMap} from '../pipeline/map-build.js';
import {GEOMETRY_DEFAULTS} from '../pipeline/map-pipeline.js';
import {dispose} from '../render/osm-meshes.js';

const bounds={south:0,west:0,north:.001,east:.001},source=NYC_SOURCES.find(s=>s.id==='nyc-elevation');
const feature=(id,geometry)=>({type:'Feature',properties:{source_id:id,sub_code:300000,elevation:10},geometry});
const valid=feature(1,{type:'MultiPoint',coordinates:[[.0002,.0002],[.0008,.0008]]});
const malformed=[{type:'MultiPoint',coordinates:null},{type:'MultiPoint',coordinates:[]},{type:'MultiPoint',coordinates:[[.0005,.0005],null]},{type:'Polygon',coordinates:[null]},{type:'LineString',coordinates:[[null,.0005],[.0006,.0005]]}].map((g,i)=>feature(i+2,g));
const raw={type:'FeatureCollection',features:[valid,...malformed]},before=JSON.stringify(raw),nativeFetch=globalThis.fetch;
let snapshot;
try{globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('/resource/')?raw:{}));snapshot=await fetchNYC(source,bounds);}finally{globalThis.fetch=nativeFetch;}
assert.equal(snapshot.data.features.length,raw.features.length,'raw source evidence is retained');
const built=compileMap({bounds,nyc:[snapshot]},GEOMETRY_DEFAULTS);
assert.equal(built.plan.details.length,2,'valid sibling record still generates both points');assert.equal(built.terrain.samples.length,2);
for(const f of malformed){const id=featureID(source,f);assert.equal(built.plan.coverage.find(c=>c.id===id).status,'skipped');assert.equal(built.plan.issues.filter(i=>i.id===id&&i.code==='invalid-geometry').length,1,'one error per record, shared by terrain and normalization');}
assert.equal(JSON.stringify(snapshot.data),before,'normalization does not rewrite raw data');
dispose(built.world.group);dispose(built.reference);
console.log('PASS malformed source geometry is logged per record while valid siblings generate');
