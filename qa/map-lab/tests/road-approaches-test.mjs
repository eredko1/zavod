import assert from 'node:assert/strict';
import {resolveRoadApproaches,approachHeight,approachSeam} from '../pipeline/road-approaches.js';
import {createTreeSurfaceQuery} from '../pipeline/tree-placement.js';

const shape=(x0,z0,x1,z1)=>({outer:[[x0,z0],[x1,z0],[x1,z1],[x0,z1]],holes:[]}),merge=()=>({attributes:{},evidence:[]});
function fixture(){
  const network=[{id:'bridge',nodes:[1,2],points:[[-15,0],[-2,0]],tags:{highway:'primary',bridge:'yes'},path:false},{id:'a',nodes:[2,3],points:[[-2,0],[10,0]],tags:{highway:'primary'},path:false},{id:'b',nodes:[3,4,5],points:[[10,0],[20,0],[30,0]],tags:{highway:'primary'},path:false}];
  const deck={id:'deck',sourceId:'nyc-transport',infrastructure:'road-bridge',shapes:[shape(-20,-10,0,10)],surface:true,elevationProfile:{samples:[{id:'h1',x:-15,z:-5,value:8},{id:'h2',x:-5,z:5,value:8}]},merge:merge()};
  const bed={id:'bed',sourceId:'nyc-roadbed',shapes:[shape(-5,-4,35,4)],merge:merge()},under={id:'under',sourceId:'nyc-roadbed',shapes:[shape(-12,-30,-8,30)],merge:merge()};
  const sample={id:'spot',sourceId:'nyc-elevation',point:[20,0],tags:{sub_code:'300000'},elevation:4};
  return {roadNetwork:network,roads:network.map(r=>({...r,paths:[r.points],shapes:[],width:{value:8},merge:merge()})),details:[deck,bed,under,sample],issues:[]};
}
const terrain={datum:0,sample:()=>0},plan=fixture(),original=JSON.stringify(plan.roadNetwork);resolveRoadApproaches(plan,{note:(f,message,code)=>plan.issues.push({id:f.id,message,code})});
assert.equal(plan.approaches.length,1);const chain=plan.approaches[0],bed=plan.details.find(f=>f.id==='bed');assert.deepEqual(chain.nodes,[2,3,4,5]);assert.equal(chain.knots.length,3);assert.equal(chain.knots[1].source,'spot');
assert.ok(Math.abs(approachHeight(bed.roadElevation,0,0,terrain)-8)<1e-9,'deck edge meets full bridge elevation');
assert.ok(Math.abs(approachHeight(bed.roadElevation,10,0,terrain)-6)<1e-9,'approach slopes toward the measured spot');
assert.ok(Math.abs(approachHeight(bed.roadElevation,20,0,terrain)-4)<1e-9,'measured road spot is honored');
assert.equal(approachHeight(bed.roadElevation,30,0,terrain),0,'terminal road joins the ground');assert.deepEqual(approachSeam(chain,chain.knots[0]),{point:[0,0],direction:[1,0]});
assert.equal(bed.mergeMasks.length,1);assert.equal(plan.details.find(f=>f.id==='under').roadElevation,undefined,'crossing roadway remains ground');assert.equal(JSON.stringify(plan.roadNetwork),original,'network evidence retained');
assert.ok(bed.merge.attributes.roadElevation.estimated);assert.ok(plan.issues.some(i=>i.code==='estimated-road-approach'));
assert.equal(bed.groundSurface,true);const surfaceAt=createTreeSurfaceQuery(plan);assert.equal(surfaceAt([10,0]).id,'a','approach still excludes trees from its ground road');assert.equal(surfaceAt([-3,0]),null,'deck mask leaves ground underneath available');
const reverse=fixture();reverse.roadNetwork.reverse();resolveRoadApproaches(reverse,{note:()=>{}});assert.deepEqual(reverse.approaches,plan.approaches,'source order cannot change profile');
const disconnected=fixture();disconnected.roadNetwork[1].nodes=[20,3];resolveRoadApproaches(disconnected,{note:()=>{}});assert.equal(disconnected.approaches.length,0,'nearby coordinates are not graph connections');
const parallel=fixture();parallel.roadNetwork.push({id:'parallel',nodes:[6,7],points:[[10,1],[30,1]],tags:{highway:'primary'},path:false});parallel.details.at(-1).point=[20,.5];resolveRoadApproaches(parallel,{note:()=>{}});assert.equal(parallel.approaches[0].knots.length,2,'ambiguous parallel-road measurements are not borrowed');
for(const tags of [{tunnel:'yes'},{location:'underground'},{layer:'-1'},{level:'-1'}]){
  const below=fixture();below.roadNetwork.push({id:'below',nodes:[6,7],points:[[10,0],[30,0]],tags:{highway:'primary',...tags},path:false});resolveRoadApproaches(below,{note:()=>{}});
  assert.equal(below.approaches[0].knots.length,3,'a separate unresolved level cannot veto a visible ground-road observation');
  const endpoint=fixture();Object.assign(endpoint.roadNetwork[0].tags,tags);resolveRoadApproaches(endpoint,{note:()=>{}});
  assert.equal(endpoint.approaches.length,tags.layer?1:0,'only supported bridge roles anchor ground approaches; negative bridge layers remain valid');
}
const offCentre=fixture();offCentre.details.at(-1).point=[20,1];resolveRoadApproaches(offCentre,{note:()=>{}});assert.equal(approachHeight(offCentre.details.find(f=>f.id==='bed').roadElevation,20,1,{datum:0,sample:(_x,z)=>z}),4,'crossfall must preserve the height at the observed location');
const hidden=fixture();hidden.details=hidden.details.filter(f=>f.id!=='deck');resolveRoadApproaches(hidden,{note:()=>{}});assert.equal(hidden.approaches.length,0,'hidden/missing bridge cannot affect an approach');
const conflicting=fixture();conflicting.details.push({...conflicting.details.at(-1),id:'spot2',elevation:8},{...conflicting.details.at(-1),id:'spot3',elevation:8});resolveRoadApproaches(conflicting,{note:()=>{}});assert.equal(conflicting.approaches[0].knots.length,2,'all conflicting station observations are excluded, including agreeing subsets');
const hole=fixture();hole.details.find(f=>f.id==='bed').shapes[0].holes.push(shape(14,-1,15,1).outer);hole.details.push({id:'in-hole',sourceId:'nyc-roadbed',shapes:[shape(14,-1,15,1)],merge:merge()});resolveRoadApproaches(hole,{note:()=>{}});assert.ok(hole.details.find(f=>f.id==='in-hole').roadElevation,'a small polygon inside a hole has disjoint coverage, not ambiguous overlap');
const split=fixture();split.details.find(f=>f.id==='bed').shapes=[shape(-5,-4,15,4)];split.details.push({id:'bed2',sourceId:'nyc-roadbed',shapes:[shape(15,-4,35,4)],merge:merge()});resolveRoadApproaches(split,{note:()=>{}});assert.ok(split.details.find(f=>f.id==='bed2').roadElevation,'a way crossing a roadbed boundary profiles both disjoint portions');
const twoDecks=fixture(),second=structuredClone(twoDecks.details[0]);second.id='deck2';second.shapes=[shape(28,-10,50,10)];twoDecks.details.push(second);twoDecks.roadNetwork.push({id:'bridge2',nodes:[5,6],points:[[30,0],[45,0]],tags:{highway:'primary',bridge:'yes'},path:false});resolveRoadApproaches(twoDecks,{note:()=>{}});assert.equal(twoDecks.approaches.length,1);assert.equal(twoDecks.approaches[0].knots.at(-1).source,'deck2');
console.log('PASS road graph joins, way splits, measured anchors, deck seams, ground transitions, underpass isolation, ambiguity, source order and provenance');
