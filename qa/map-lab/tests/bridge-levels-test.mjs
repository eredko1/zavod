import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadFidelityFixture} from './fixture.mjs';
import {resolveMap,GEOMETRY_DEFAULTS} from '../pipeline/map-pipeline.js';
import {profileHeight} from '../pipeline/infrastructure-merge.js';
import {resolveBridgeRamps} from '../pipeline/bridge-ramps.js';
import {pathPosition} from '../pipeline/geometry-distance.js';
import {compileMap} from '../pipeline/map-build.js';
import {dispose} from '../render/osm-meshes.js';
import {resolveBridgeLevels} from '../pipeline/bridge-levels.js';
import {roadCorridors} from '../pipeline/bridge-supports.js';
import {inShape} from '../pipeline/osm-model.js';

const {bridge:result}=await loadFidelityFixture(),original=JSON.stringify(result),plan=resolveMap(result),mixed=plan.details.find(f=>f.render.attributes.mixedLevels),roads=plan.roads.filter(r=>r.elevationProfile?.role);
assert.ok(mixed.reference&&!mixed.elevationProfile,'mixed-level footprint must never become a blended deck');assert.ok(mixed.render.attributes.mixedLevels.pairs.length>=30);assert.ok(roads.some(r=>r.elevationProfile.role==='upper')&&roads.some(r=>r.elevationProfile.role==='lower'));
const uncertain=resolveBridgeLevels({shapes:[]},[{id:'a',x:0,z:0,value:10},{id:'b',x:0,z:0,value:20},{id:'c',x:0,z:0,value:30}],[]);assert.ok(uncertain.mixed&&!uncertain.resolved.length,'ambiguous local clusters still prohibit a blended surface');
let largestJump=0;
for(const road of roads){const profile=road.elevationProfile,path=profile.path;
  for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.ceil(length/5);for(let n=1;n<=steps;n++){const p=t=>a.map((v,k)=>v+(b[k]-v)*t),before=p((n-1)/steps),after=p(n/steps);largestJump=Math.max(largestJump,Math.abs(profileHeight(profile,...after)-profileHeight(profile,...before)));}}
  assert.ok(road.unresolvedPaths.length,'unmeasured ends remain references');assert.ok(profile.knots.every(k=>k.pair?.length===2));
}
assert.ok(largestJump<.75,'paired-grade rendering removes the captured 9 m jumps over 5 m intervals');
const reversed=resolveMap({...result,data:{...result.data,elements:[...result.data.elements].reverse()},nyc:result.nyc.map(s=>({...s,data:{...s.data,features:[...s.data.features].reverse()}}))});assert.deepEqual(reversed.roads.filter(r=>r.elevationProfile?.role).map(r=>[r.id,r.elevationProfile.role]).sort(),roads.map(r=>[r.id,r.elevationProfile.role]).sort());
const noLayers=structuredClone(result);for(const e of noLayers.data.elements)delete e.tags.layer;assert.equal(resolveMap(noLayers).roads.filter(r=>r.elevationProfile?.role).length,0,'unnamed/unordered levels cannot claim which height belongs to which road');
const pylons=plan.details.filter(f=>f.supportModel);assert.equal(pylons.length,2);assert.ok(pylons.every(f=>f.dimensions.height===211&&f.supportModel.estimated));assert.equal(plan.buildings.filter(f=>f.tags['bridge:support']).length,0,'tagged pylon buildings are supports, never building blocks');assert.equal(plan.details.filter(f=>f.supportKind==='abutment'&&f.reference).length,2);
const compiled=compileMap(result,{...GEOMETRY_DEFAULTS,terrain:false}),meshes=compiled.world.selectable.filter(m=>m.userData.feature?.supportModel);assert.equal(meshes.length,2);
for(const mesh of meshes){const f=mesh.userData.feature;assert.ok(mesh.geometry.attributes.position.array.every(Number.isFinite));const road=plan.roads.find(r=>f.supportModel.roads.includes(r.id));const ring=f.shapes[0].outer,center=ring.reduce((p,v)=>[p[0]+v[0]/ring.length,p[1]+v[1]/ring.length],[0,0]),at=pathPosition((road.sourcePaths||road.paths)[0],center),point=at.point;compiled.world.group.updateMatrixWorld(true);const ray=new THREE.Raycaster(new THREE.Vector3(point[0],100,point[1]),new THREE.Vector3(0,-1,0));assert.equal(ray.intersectObject(mesh).length,0,'mapped road corridor remains open below the estimated top beam');}
assert.equal(JSON.stringify(result),original,'all original observations and tags retained');dispose(compiled.world.group);dispose(compiled.reference);
// General connecting-ramp rule: different relative-layer tags may meet at the same actual junction.
const anchor=(id,nodes,path,value)=>({id,nodes,paths:[path],tags:{highway:'motorway',bridge:'yes',layer:'3'},elevationProfile:{samples:[{id:id+'-height',x:path[0][0],z:0,value}]} ,width:{value:9}});
const left=anchor('left',[1,2],[[-20,0],[0,0]],30),right=anchor('right',[4,5],[[100,0],[120,0]],20),ramp=(id,nodes,path)=>({id,nodes,paths:[path],tags:{highway:'motorway_link',bridge:'yes',layer:'2'},width:{value:6}}),a=ramp('a',[2,3],[[0,0],[40,0]]),b=ramp('b',[3,4],[[40,0],[100,0]]),rampPlan={roads:[left,right,a,b],details:[]},notes=[];
const connected=resolveBridgeRamps(rampPlan,profileHeight,{note:(_f,m)=>notes.push(m)});assert.equal(connected.length,2);assert.equal(profileHeight(connected[0].profile,40,0),26);assert.equal(profileHeight(connected[1].profile,100,0),20);assert.ok(connected.every(r=>r.profile.parameters&&r.anchors.includes('left')));
const disconnected=structuredClone(rampPlan);disconnected.roads[3].nodes[0]=99;assert.equal(resolveBridgeRamps(disconnected,profileHeight,{note:()=>{}}).length,0,'nearby coordinates never substitute for shared OSM nodes');
const steep=structuredClone(rampPlan);steep.roads[1].elevationProfile.samples[0].value=100;assert.equal(resolveBridgeRamps(steep,profileHeight,{note:()=>{}}).length,0,'incompatible ramp heights remain explicit gaps');
const redundant=structuredClone(rampPlan);redundant.details=['spot-a','spot-b'].map(id=>({id,sourceId:'nyc-elevation',tags:{sub_code:'300020'},point:[40,0],elevation:26}));const joined=resolveBridgeRamps(redundant,profileHeight,{note:()=>{}});assert.equal(joined.length,2);assert.equal(joined[0].profile.samples.length,4,'duplicate height evidence is retained');assert.equal(joined[0].profile.knots.length,3,'identical observations describe one grade knot');
assert.deepEqual(resolveBridgeRamps({...redundant,roads:[...redundant.roads].reverse(),details:[...redundant.details].reverse()},profileHeight,{note:()=>{}}).map(r=>[r.road.id,r.profile.knots]),joined.map(r=>[r.road.id,r.profile.knots]));
redundant.details[1].elevation=28;assert.equal(resolveBridgeRamps(redundant,profileHeight,{note:()=>{}}).length,0,'conflicting observations at one station cannot be averaged into a ramp');
const bends=roadCorridors({shapes:[],paths:[[[0,0],[20,0],[20,20]]],width:{value:10}});assert.ok(bends.some(s=>inShape(23.5,-3.5,s)),'pylon clearance includes the road renderer round join beyond either segment quad');
console.log('PASS captured double-deck separation, stable grades, source order, ordered-level evidence, bounded intervals, open mapped pylons and general connected ramp joins');
