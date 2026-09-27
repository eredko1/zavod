import assert from 'node:assert/strict';
import {physicalLevel,isGroundLevel,isBridgeLevel} from '../pipeline/physical-level.js';
import {compileMap} from '../pipeline/map-build.js';
import {resolveMap,GEOMETRY_DEFAULTS} from '../pipeline/map-pipeline.js';
import {dispose} from '../render/osm-meshes.js';
import {blocked} from '../render/osm-walk.js';
import {validateGeometry} from '../render/geometry-validation.js';
import {NYC_SOURCES} from '../data/map-sources.js';

const bounds={south:0,west:0,north:.001,east:.001},ring=[[.0001,.0001],[.0009,.0001],[.0009,.0009],[.0001,.0009],[.0001,.0001]],geometry=[{lat:.0005,lon:.0002},{lat:.0005,lon:.0008}];
const road=tags=>({type:'way',id:1,tags:{highway:'primary',...tags},geometry,nodes:[10,11]});
const building=tags=>({type:'way',id:2,tags:{building:'yes',height:'10',...tags},geometry:ring.map(([lon,lat])=>({lon,lat}))});
const bench=tags=>({type:'node',id:3,lat:.0005,lon:.0005,tags:{amenity:'bench',...tags}});
const snap=(sourceId,features)=>({sourceId,bounds,data:{features},dataset:NYC_SOURCES.find(s=>s.id===sourceId).dataset});
const nyc=[snap('nyc-transport',[{properties:{source_id:1,feat_code:2300},geometry:{type:'Polygon',coordinates:[ring]}}]),snap('nyc-elevation',[.0002,.0008].map((x,i)=>({properties:{source_id:i,sub_code:300020,elevation:30},geometry:{type:'Point',coordinates:[x,.0005]}})))];
const unresolved=[{layer:'-1'},{layer:'1'},{layer:'junk'},{layer:''},{layer:' '},{layer:'0;1'},{layer:null},{level:'-1'},{level:'2'},{level:'0;1'},{level:'0-2'},{location:'roof'},{location:'overhead'},{location:'underground'},{location:'underwater'},{indoor:'yes'},{tunnel:'yes'},{bridge:'yes',tunnel:'yes'},{bridge:'yes',location:'underground'},{bridge:'yes',level:'1'}];
for(const tags of [{},{layer:'0'},{level:'0'},{bridge:'no',tunnel:'no'},{tunnel:'building_passage'},{location:'surface'}])assert.ok(isGroundLevel({tags}),JSON.stringify(tags));
for(const layer of ['-2','-1','0','1','2']){
  const tags={bridge:'yes',layer};assert.ok(isBridgeLevel({tags}));
  const plan=resolveMap({bounds,nyc,data:{elements:[road(tags)]}});assert.ok(plan.roads[0].elevationProfile,'negative bridge layers may use a measured deck');assert.equal(plan.roads[0].merge.attributes.physicalLevel.kind,'bridge');
}
for(const mergeEnabled of [true,false])for(const tags of unresolved){
  assert.ok(!isGroundLevel({tags}),JSON.stringify(tags));
  const input={bounds,mergeEnabled,nyc,data:{elements:[road(tags),building(tags),bench(tags)]}},raw=JSON.stringify(input),built=compileMap(input,GEOMETRY_DEFAULTS);
  for(const f of [...built.plan.roads,...built.plan.buildings,...built.plan.details.filter(f=>f.id==='node/3')]){
    assert.ok(f.reference&&!f.elevationProfile,`${f.id}: ${JSON.stringify(tags)}`);
    assert.ok(built.plan.issues.some(i=>i.id===f.id&&i.code==='missing-structure-elevation'));
    assert.ok(!built.world.walkable.some(m=>m.userData.feature===f)&&!built.world.elevatedWalkable.some(m=>m.userData.feature===f));
  }
  const b=built.plan.buildings[0];assert.equal(b.extrude,false);assert.equal(blocked(0,0,{buildings:[b]}),false,'unresolved buildings cannot create ground walls');
  assert.ok(built.world.selectable.some(m=>m.isLineSegments&&m.userData.feature===b),'unresolved building outline remains inspectable');
  assert.equal(JSON.stringify(input),raw);dispose(built.world.group);dispose(built.reference);
}
// Matching footprint and BIN cannot erase a different vertical placement.
const city=snap('nyc-buildings',[{properties:{bin:1234567,height_roof:40},geometry:{type:'Polygon',coordinates:[ring]}}]);
const distinct=resolveMap({bounds,nyc:[city],data:{elements:[building({location:'underground','nycdoitt:bin':'1234567'})]}});
assert.equal(distinct.buildings.length,2);assert.equal(distinct.merge.suppressed.length,0);assert.ok(distinct.issues.some(i=>i.code==='building-match-review'));
// A basement part must not suppress the above-ground envelope.
const envelope=building({}),part={...building({building:'no','building:part':'yes',level:'-1'}),id:4};
const parts=resolveMap({bounds,data:{elements:[envelope,part]}});assert.ok(parts.buildings.find(f=>f.id==='way/2').extrude);assert.equal(parts.buildings.find(f=>f.id==='way/2').suppressed,false);
// Clearance evidence and approach diagnostics use the same physical roles as rendering.
for(const tags of [{},{tunnel:'yes'},{location:'underground'},{level:'-1'},{location:'roof'}]){
  const input={bounds,nyc,data:{elements:[road({...tags,maxheight:'99'})]}},built=compileMap(input,GEOMETRY_DEFAULTS),report=validateGeometry({...built,selection:input});
  assert.equal(report.findings.some(f=>f.code==='clearance-conflict'),isGroundLevel({tags}));dispose(built.world.group);dispose(built.reference);
}
assert.equal(physicalLevel({tags:{layer:'-1'}}).kind,'unresolved','relative ordering alone is not an underground classification');
console.log('PASS physical-level semantics, negative bridges, floor/roof/tunnel separation, merge identity, reference meshes, collision and clearance');
