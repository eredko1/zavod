import assert from 'node:assert/strict';
import {sourceNumber} from '../data/source-number.js';
import {planFromNYC} from '../pipeline/nyc-model.js';
import {terrainFromSnapshots} from '../render/map-terrain.js';
for(const v of [null,undefined,'','  ',false,[],{},'NaN',Infinity])assert.equal(sourceNumber(v),null);
for(const v of [0,'0',' 0 '])assert.equal(sourceNumber(v),0);
const features=[null,'',0,'10','20'].map((elevation,i)=>({type:'Feature',geometry:{type:'Point',coordinates:[-73.98+i*.0001,40.577]},properties:{source_id:i,sub_code:'300000',elevation}}));
const snapshot={sourceId:'nyc-elevation',data:{features}},plan=planFromNYC(snapshot,[40.577,-73.98]),terrain=terrainFromSnapshots([snapshot],[40.577,-73.98],true);
assert.equal(plan.details.filter(d=>d.elevation!==undefined).length,3);assert.equal(terrain.samples.length,3);assert.equal(terrain.min,0);
console.log('PASS missing elevation stays missing; recorded zero remains valid in normalization and terrain');
const point=(id,coordinates,elevation)=>({type:'Feature',properties:{source_id:id,sub_code:'300000',elevation},geometry:{type:'Point',coordinates}});
const terrainOf=features=>terrainFromSnapshots([{sourceId:'nyc-elevation',data:{features}}],[40.577,-73.98]);
for(const coordinates of [[],[null,40.577],[-73.98,''],[181,40],[-73,91]]){const t=terrainOf([point('bad',coordinates,10)]);assert.equal(t.samples.length,0);assert.equal(t.issues[0].code,'invalid-geometry');}
const observations=[point('a',[-73.98,40.577],10),point('b',[-73.98,40.577],20),point('c',[-73.979,40.577],30),point('d',[-73.979,40.577],30)];
const conflicting=terrainOf(observations);assert.equal(conflicting.samples.length,1);assert.equal(conflicting.samples[0].members.length,2);assert.equal(conflicting.issues.length,2);const {sample:sampleA,...forward}=conflicting,{sample:sampleB,...reverse}=terrainOf([...observations].reverse());assert.deepEqual(reverse,forward);assert.equal(sampleA(0,0),sampleB(0,0));
console.log('PASS invalid coordinates rejected, conflicting co-located elevations logged and excluded, equal duplicates combined');
