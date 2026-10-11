import assert from 'node:assert/strict';
import {fetchNYC,NYC_SOURCES,nycURL} from '../data/map-sources.js';
import {planFromNYC} from '../pipeline/nyc-model.js';
import {resolveSources} from '../pipeline/map-pipeline.js';
import {NYC_MERGE_POLICY} from '../pipeline/map-merge-rules.js';

const source=NYC_SOURCES.find(s=>s.id==='nyc-building-grade'),bounds={south:40.70,west:-74.02,north:40.72,east:-74.00},nativeFetch=globalThis.fetch;
const feature={type:'Feature',geometry:{type:'Point',coordinates:[-74.008,40.711]},properties:{bin:1000001,bbl:'1000010001',z_grade:'8.4',z_floor:'9.1',subgrade:'Yes',notes1:'Property not visible due to construction or obstruction',notes2:'source note',x:983000,y:198000}};
assert.equal(NYC_MERGE_POLICY[source.id],'building-grade-inventory');
assert.equal(new URL(nycURL(source,bounds)).searchParams.get('$where')?.includes('intersects(the_geom'),true);
globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('/api/views/')?{name:'BES',columns:[{fieldName:'notes1'}]}:{type:'FeatureCollection',features:[feature]}));
try{
  const snapshot=await fetchNYC(source,bounds),plan=planFromNYC(snapshot,[40.711,-74.008],undefined,true),resolved=resolveSources({data:{elements:[]},nyc:[snapshot],bounds});
  assert.equal(snapshot.data.features.length,1);
  assert.deepEqual(snapshot.raw.responses[0].data.features[0],feature);
  assert.equal(plan.buildings.length,0,'centroid does not create a building');
  assert.equal(plan.details.length,1);
  assert.equal(plan.details[0].reference,true);
  assert.equal(plan.details[0].tags.notes1,feature.properties.notes1);
  assert.deepEqual(plan.details[0].dimensions,{},'source values remain observations, not merge-generated dimensions');
  assert.deepEqual(plan.details[0].estimates,[],'upstream estimate stays qualified in the raw record');
  assert.match(plan.coverage[0].reason,/source-estimated/);
  assert.deepEqual(plan.issues,[]);
  assert.equal(resolved.observations.records.find(s=>s.sourceId===source.id).records[0],snapshot.data.features[0]);
  assert.equal(resolved.details.find(d=>d.sourceId===source.id).reference,true);
  assert.equal(resolved.details.find(d=>d.sourceId===source.id).tags.z_floor,feature.properties.z_floor);
  assert.equal(resolved.details.find(d=>d.sourceId===source.id).elevation,undefined);
  const footprint={sourceId:'nyc-buildings',bounds,data:{type:'FeatureCollection',features:[{type:'Feature',properties:{doitt_id:11,bin:1000001,ground_elevation:'9',height_roof:'20',feature_code:'1000'},geometry:{type:'Polygon',coordinates:[[[-74.009,40.710],[-74.007,40.710],[-74.007,40.712],[-74.009,40.712],[-74.009,40.710]]]}}]}};
  const withFootprint=resolveSources({data:{elements:[]},nyc:[footprint,snapshot],bounds}),building=withFootprint.buildings.find(b=>b.sourceId==='nyc-buildings');
  assert.equal(building.groundElevation,9*0.3048,'qualified BES grade cannot silently replace a different building-base observation');
  assert.equal(withFootprint.observations.records.find(s=>s.sourceId===source.id).records[0],snapshot.data.features[0]);
  console.log('PASS BES live-query shape, complete source fields and reference-only merge');
}finally{globalThis.fetch=nativeFetch;}
