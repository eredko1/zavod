import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadFixture} from './fixture.mjs';
import {mergePlan,uncoveredPaths} from '../pipeline/map-merge.js';
import {buildingBIN} from '../pipeline/building-match.js';
const square=(x=0,z=0,w=10)=>({outer:[[x,z],[x+w,z],[x+w,z+w],[x,z+w]],holes:[]});
const building=(id,sourceId,x,height=10)=>({id,sourceId,tags:{building:'yes'},shapes:[square(x)],height:{top:height,bottom:0,valid:height!==null,estimated:false},extrude:height!==null,suppressed:false});
const tree=(id,sourceId,x,z=0,status='Full')=>({id,sourceId,tags:{natural:'tree',tpstructure:status},point:[x,z],rule:status==='Full'?'tree':'point',dimensions:{height:7},attributes:{height:{estimated:true}}});
function input(buildings=[],details=[],roads=[]){return {buildings,details,roads,coverage:[...buildings,...details,...roads].map(f=>({id:f.id,sourceId:f.sourceId,tags:f.tags,status:'rendered'})),issues:[]};}
let p=mergePlan(input([building('way/1',undefined,0,12),building('nyc-buildings/1@abc','nyc-buildings',0,null)]));
assert.equal(p.buildings.length,1);assert.equal(p.buildings[0].height.top,12);assert.equal(p.buildings[0].extrude,true);assert.equal(p.buildings[0].merge.members.length,2);
p=mergePlan(input([building('way/1',undefined,0),building('nyc-buildings/1','nyc-buildings',0),building('nyc-buildings/2','nyc-buildings',0)]));assert.equal(p.buildings.length,3);assert.ok(p.merge.summary.conflicts);
p=mergePlan(input([], [tree('node/1',undefined,0),tree('node/2',undefined,10),tree('nyc-trees/1','nyc-trees',0.5),tree('nyc-trees/2','nyc-trees',10,0,'Retired'),tree('nyc-trees/3','nyc-trees',20)]));
assert.equal(p.details.filter(f=>f.rule==='tree').length,3,'unmatched and retired-conflicting OSM trees survive');assert.ok(p.merge.summary.conflicts);assert.equal(p.merge.summary.matched,1);
const crowded=input([], [tree('node/1',undefined,0),tree('node/2',undefined,1),tree('nyc-trees/1','nyc-trees',0.5)]);assert.equal(mergePlan(crowded).details.length,3,'ambiguous neighbors cannot collapse');
const q=uncoveredPaths([[[-5,5],[15,5]]],[square()]);assert.equal(q.removed,10);assert.deepEqual(q.paths,[[[-5,5],[0,5]],[[10,5],[15,5]]]);
const hole=square();hole.holes=[square(3,3,4).outer];assert.ok(Math.abs(uncoveredPaths([[[-5,5],[15,5]]],[hole]).removed-6)<1e-8,'sidewalk holes remain uncovered');
const road={id:'way/road',tags:{highway:'residential'},width:{value:6},paths:[[[-5,5],[15,5]]],shapes:[],path:false};
const bed={id:'nyc-roadbed/1',sourceId:'nyc-roadbed',tags:{},shapes:[hole],rule:'surface'};
p=mergePlan(input([], [bed], [road]));assert.deepEqual(p.roads[0].paths,q.paths,'road fallback cannot refill a roadbed island hole');assert.equal(p.roads[0].sourcePaths[0].length,2);
const source=input([], [tree('node/1',undefined,0),tree('nyc-trees/1','nyc-trees',0.5)]),before=JSON.stringify(source);mergePlan(source);assert.equal(JSON.stringify(source),before,'raw input is not mutated');assert.equal(mergePlan(source,false).details.length,2);
const a=mergePlan(source),b=mergePlan({...source,details:[...source.details].reverse()});assert.deepEqual(a.merge.suppressed,b.merge.suppressed,'fetch order cannot pick a different winner');
const lion = id => ({id,sourceId:'nyc-lion',rule:'line',tags:{SegmentID:'123',Street:'SURF AVENUE',FeatureTyp:'0',Status:'2',RB_Layer:'B',NodeLevelF:'M',NodeLevelT:'M',StreetWidth_Min:72,StreetWidth_Max:75},paths:[[[-5,5],[15,5]]],shapes:[],attributes:{}});
const surf={...road,tags:{highway:'primary',name:'Surf Avenue'},width:{value:8,estimated:true}};
const withLION=mergePlan(input([], [lion('nyc-lion/1@a'),lion('nyc-lion/2@b')], [surf]));
assert.equal(withLION.details.length,1,'LION aliases represent one segment');assert.equal(withLION.details[0].merge.members.length,2);assert.equal(withLION.roads[0].width.value,72*0.3048);assert.equal(withLION.roads[0].merge.attributes.lion.value.Street,'SURF AVENUE');
const repeated=mergePlan(input([], [tree('nyc-trees/0@a','nyc-trees',0),tree('nyc-trees/0@b','nyc-trees',10)]));assert.notEqual(repeated.details[0].merge.canonicalId,repeated.details[1].merge.canonicalId,'repeated source IDs remain distinct canonical records');
console.log('PASS: attribute fallback, ambiguous buildings/trees, unique trees, retired-tree conflicts, exact partial road splitting, island holes, source immutability, disabled mode and deterministic suppression');
if(process.argv.includes('--snapshots')){
  const {planFromOSM}=await import('../pipeline/osm-model.js'),{planFromNYC}=await import('../pipeline/nyc-model.js');
  const {data,nyc}=await loadFixture(),base=planFromOSM(data);
  for(const snap of nyc){const part=planFromNYC(snap,base.origin);for(const k of ['buildings','roads','details','coverage','issues'])base[k].push(...part[k]);}
  const p=mergePlan(base);assert.equal(p.coverage.length,base.coverage.length);assert.ok(p.details.filter(f=>f.rule==='tree').length>=134,'unmatched OSM trees cannot disappear');console.log('SNAPSHOT',p.merge.summary,'buildings',base.buildings.length,'→',p.buildings.length,'trees',base.details.filter(f=>f.rule==='tree').length,'→',p.details.filter(f=>f.rule==='tree').length);
}
const curb=(id,sourceId,height,end=10)=>({id,sourceId,tags:{barrier:'kerb'},rule:'kerb',paths:[[[0,0],[end,0]]],shapes:[],dimensions:{height,width:.12},attributes:{height:{value:height,estimated:!!sourceId}},estimates:[]});
const measured=curb('way/curb',undefined,0),city=curb('nyc-curbs/curb','nyc-curbs',.15);
p=mergePlan(input([],[measured,city]));assert.equal(p.details.length,1);assert.equal(p.details[0].dimensions.height,0);assert.equal(p.details[0].attributes.height.estimated,false);
p=mergePlan(input([],[measured,curb('nyc-curbs/long','nyc-curbs',.15,30)]));assert.equal(p.details.length,2,'local measurement must not raise/lower an entire longer curb');
console.log('PASS matched zero curb heights and no extrapolation across unmatched curb segments');
const classified=curb('way/classified',undefined,0);classified.attributes.height={value:0,estimated:true,source:'OSM classification',reason:'Flush classification'};
for(const records of [[measured,classified,city],[classified,measured,city]]){const out=mergePlan(input([],records));assert.equal(out.details.length,1);assert.equal(out.details[0].attributes.height.estimated,false,'classification cannot replace a numeric measurement');assert.equal(out.details[0].merge.attributes.height.source,measured.id);}
p=mergePlan(input([],[classified,city]));assert.ok(p.issues.some(i=>i.id===city.id&&i.message.includes('Flush classification')),'classification fallback must remain in generation logs');
console.log('PASS curb measurement precedence and fallback logging');
const numeric=curb('way/numeric',undefined,.02),lowered=curb('way/lowered',undefined,.03);lowered.attributes.height={value:.03,estimated:true,source:'OSM classification',reason:'Lowered classification'};
const mergeCurbs=records=>{const out=mergePlan(input([],records));return {suppressed:out.merge.suppressed,heights:out.details.map(f=>[f.id,f.dimensions.height]).sort(),conflicts:out.merge.summary.conflicts};};
assert.deepEqual(mergeCurbs([numeric,lowered,city]),mergeCurbs([lowered,numeric,city]),'conflicting classified and numeric heights resolve independently of response order');
console.log('PASS deterministic conflicting curb heights');
for(const tags of [{bridge:'no'},{tunnel:'no'},{location:'surface'}])assert.deepEqual(mergePlan(input([],[bed],[{...road,tags:{...road.tags,...tags}}])).roads[0].paths,q.paths);
for(const tags of [{bridge:'yes'},{tunnel:'yes'},{location:'underground'}])assert.deepEqual(mergePlan(input([],[bed],[{...road,tags:{...road.tags,...tags}}])).roads[0].paths,road.paths);
console.log('PASS explicit surface tags merge; separate structure levels remain independent');

const identified=(id,source,x,bin)=>{const f=building(id,source,x);f.tags[source==='nyc-buildings'?'bin':'nycdoitt:bin']=bin;return f;};
const shifted=[identified('way/shift',undefined,0,'3246402'),identified('nyc-buildings/shift','nyc-buildings',2,'3246402')];
p=mergePlan(input(shifted));assert.equal(p.buildings.length,1,'shared identity merges shifted footprints below 80% IoU');assert.match(p.buildings[0].merge.evidence[0],/Shared NYC BIN 3246402/);
assert.equal(mergePlan(input(shifted),false).buildings.length,2);
assert.deepEqual(mergePlan(input([...shifted].reverse())).merge.suppressed,p.merge.suppressed,'identity matching is order independent');
for(const bin of ['3000000','0000000','3246402;3246403','bad',''])assert.equal(buildingBIN(identified('way/test',undefined,0,bin)),null);
for(const [name,records] of [
  ['placeholder',shifted.map(f=>({...f,tags:{building:'yes',bin:'3000000','nycdoitt:bin':'3000000'}}))],
  ['conflicting identity',[identified('way/a',undefined,0,'3246402'),identified('nyc-buildings/b','nyc-buildings',0,'3246403')]],
  ['split footprint',[shifted[0],identified('nyc-buildings/far','nyc-buildings',7,'3246402')]],
  ['reused identity',[...shifted,identified('nyc-buildings/reused','nyc-buildings',30,'3246402')]],
]){const out=mergePlan(input(records));assert.equal(out.buildings.length,records.length,name+' remains unresolved');assert.ok(out.issues.some(i=>i.code==='building-match-review'),name+' has an actionable review log');}
p=mergePlan(input([building('way/no-id',undefined,0),building('nyc-buildings/no-id','nyc-buildings',0)]));assert.equal(p.buildings.length,1,'strong geometry fallback remains available without IDs');
console.log('PASS shared BIN matching, placeholders, conflicting/reused identity, geometry sanity, logging and disabled mode');
const {resolveMap}=await import('../pipeline/map-pipeline.js'),identity=JSON.parse(await readFile(new URL('./fixtures/building-identity.json',import.meta.url),'utf8'));
p=resolveMap(identity);assert.ok(p.merge.suppressed.includes('way/248531787'),'reported shifted house merges using its BIN');
for(const id of ['way/248531886','way/248534592','way/248534731']){assert.ok(p.buildings.some(f=>f.id===id),'split/weak/placeholder remains visible');assert.ok(p.issues.some(i=>i.id===id&&i.code==='building-match-review'),'unresolved footprint gets a review reason');}
console.log('PASS captured Hampton/Hastings building identity regression');
