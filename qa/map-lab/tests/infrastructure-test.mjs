import assert from 'node:assert/strict';
import * as THREE from 'three';
import {NYC_SOURCES} from '../data/map-sources.js';
import {resolveMap,GEOMETRY_DEFAULTS} from '../pipeline/map-pipeline.js';
import {compileMap} from '../pipeline/map-build.js';
import {dispose} from '../render/osm-meshes.js';
import {boundGeometry} from '../render/bounded-geometry.js';
import {clipPaths} from '../pipeline/area-clip.js';
import {planFromOSM} from '../pipeline/osm-model.js';
import {profileHeight} from '../pipeline/infrastructure-merge.js';
import {terrainFromSnapshots} from '../render/map-terrain.js';
import {validateGeometry} from '../render/geometry-validation.js';
import {advanceHeight} from '../render/walk-height.js';
import {MOVEMENT} from '../render/movement.js';

const bounds={south:40.57,north:40.571,west:-73.98,east:-73.979};
const polygon=(id,code,ring,extra={})=>({type:'Feature',properties:{source_id:id,feat_code:code,sub_code:code*100,...extra},geometry:{type:'Polygon',coordinates:[ring]}});
const ring=[[-73.9799,40.5703],[-73.9791,40.5703],[-73.9791,40.5707],[-73.9799,40.5707],[-73.9799,40.5703]];
const line=(id,code,coordinates,extra={})=>({type:'Feature',properties:{source_id:id,feat_code:code,sub_code:code*100,...extra},geometry:{type:'LineString',coordinates}});
const point=(id,coordinates,elevation,sub_code='300020')=>({type:'Feature',properties:{source_id:id,elevation,sub_code},geometry:{type:'Point',coordinates}});
const snap=(sourceId,features)=>({sourceId,bounds,dataset:NYC_SOURCES.find(s=>s.id===sourceId).dataset,data:{type:'FeatureCollection',features}});
const road={type:'way',id:10,tags:{highway:'primary',bridge:'yes',layer:'1'},geometry:[{lat:40.5705,lon:-73.9798},{lat:40.5705,lon:-73.9792}]};
const result={bounds,data:{elements:[road]},nyc:[snap('nyc-transport',[polygon(1,2300,ring)]),snap('nyc-elevation',[
  point(1,[-73.9798,40.5705],30),point(2,[-73.9792,40.5705],40),
  point(3,[-73.98,40.57],5,'300000'),point(4,[-73.979,40.57],5,'300000'),point(5,[-73.98,40.571],5,'300000'),
]) ]};
const original=JSON.stringify(result),plan=resolveMap(result),deck=plan.details.find(f=>f.sourceId==='nyc-transport');
assert.ok(deck.elevationProfile);assert.equal(deck.groundSurface,false);assert.equal(deck.merge.ruleId,'transport');
assert.ok(plan.roads[0].reference&&plan.roads[0].elevationProfile,'deck supplies road surface without duplicate ribbon');
assert.equal(profileHeight(deck.elevationProfile,deck.elevationProfile.samples[0].x,deck.elevationProfile.samples[0].z),30*.3048);
assert.equal(JSON.stringify(result),original,'normalization/merge must not mutate snapshots');
const widerSnapshots=structuredClone(result);for(const s of widerSnapshots.nyc)s.bounds={south:40.56,north:40.59,west:-74,east:-73.96};
assert.deepEqual(resolveMap(widerSnapshots).bounds,plan.bounds,'selected bounds override a larger source capture');
const reverse=resolveMap({...result,nyc:[...result.nyc].reverse()});assert.deepEqual(reverse.details.find(f=>f.sourceId==='nyc-transport').elevationProfile,deck.elevationProfile);
const unmerged=resolveMap({...result,mergeEnabled:false});assert.ok(unmerged.roads[0].elevationProfile,'vertical safety is independent of duplicate suppression');
const build=compileMap(result,GEOMETRY_DEFAULTS),mesh=build.world.selectable.find(m=>m.userData.feature?.id===deck.id);
assert.ok(mesh.isMesh);const pos=mesh.geometry.attributes.position;for(let i=0;i<pos.count;i++)assert.ok(pos.getY(i)>7&&pos.getY(i)<12);
assert.ok(build.surfaces.sample(0,0)<1,'ground walker must not snap onto an overhead deck');
assert.ok(!build.world.walkable.includes(mesh));dispose(build.world.group);dispose(build.reference);
const missing=resolveMap({...result,nyc:result.nyc.slice(0,1)});assert.ok(missing.details[0].reference);assert.ok(missing.roads[0].reference);assert.ok(missing.issues.some(i=>i.code==='missing-structure-elevation'));
const ambiguous=structuredClone(result);ambiguous.nyc[0].data.features.push(polygon(2,2320,ring));assert.ok(resolveMap(ambiguous).details.filter(f=>f.sourceId==='nyc-transport').every(f=>f.reference));
const conflict=structuredClone(result);conflict.nyc[1].data.features.push(point(6,[-73.9798,40.5705],60));assert.ok(resolveMap(conflict).details.find(f=>f.sourceId==='nyc-transport').reference);
const roofOnly=structuredClone(result);roofOnly.nyc[1].data.features.forEach(f=>f.properties.sub_code='302000');assert.ok(resolveMap(roofOnly).details.find(f=>f.sourceId==='nyc-transport').reference);
const tunnel=structuredClone(result);tunnel.data.elements[0].tags={highway:'primary',tunnel:'yes',layer:'-1'};assert.ok(!resolveMap(tunnel).roads[0].elevationProfile);
console.log('PASS structure profiles, units, support evidence, ambiguity, missing/conflicting heights, source order, tunnel separation and ground walking');
const groundSpots=structuredClone(result);groundSpots.nyc[1].data.features.push(point(7,[-73.9796,40.5705],30,'300000'));
const gp=resolveMap(groundSpots),terrain=terrainFromSnapshots(groundSpots.nyc,gp.origin,true,gp.groundSampleDecisions);
assert.equal(gp.groundSampleDecisions.length,1);assert.ok(gp.issues.some(i=>i.code==='spot-level-association'));assert.equal(terrain.samples.length,3,'deck spot excluded from ground without changing raw observation');
for(const tags of [{location:'underground'},{tunnel:'yes'},{layer:'-1'},{layer:'1'},{layer:'invalid'},{level:'-1'},{location:'roof'}]){
  const crossing=structuredClone(groundSpots);crossing.data.elements.push({...road,id:11,tags:{highway:'primary',...tags}});
  const resolved=resolveMap(crossing);
  assert.deepEqual(resolved.groundSampleDecisions,gp.groundSampleDecisions,'unresolved/non-ground roads cannot compete as ground evidence');
  assert.equal(terrainFromSnapshots(crossing.nyc,resolved.origin,true,resolved.groundSampleDecisions).samples.length,3);
}
const off=groundSpots.nyc.map(s=>({...s,visible:s.sourceId!=='nyc-elevation'}));assert.equal(terrainFromSnapshots(off,gp.origin).active,false);
const medianPair={bounds,nyc:[snap('nyc-median',[polygon(1,3600,ring,{sub_code:360010})]),snap('nyc-sidewalk',[polygon(2,3800,[...ring].reverse())])]};
const mp=resolveMap(medianPair);assert.equal(mp.details.filter(f=>f.surface).length,1,'identical sidewalk/median shares one physical surface');
assert.equal(resolveMap({...medianPair,nyc:medianPair.nyc.map(s=>({...s,visible:s.sourceId!=='nyc-median'}))}).details[0].sourceId,'nyc-sidewalk');
const approach=structuredClone(result);approach.data.elements[0].nodes=[1,2];approach.data.elements.push({type:'way',id:11,nodes:[2,3],tags:{highway:'primary'},geometry:[road.geometry[1],{lat:40.5705,lon:-73.979}]});
const ab=compileMap(approach,GEOMETRY_DEFAULTS),joined=validateGeometry({...ab,selection:approach});assert.ok(!joined.findings.some(f=>f.code==='approach-discontinuity:2'),'connected deck and road have no generated step');assert.equal(joined.approachChecks.length,1);assert.ok(Math.abs(joined.approachChecks[0].gap)<.25,'actual drawn meshes meet across the deck edge');
const support=(x,z,ceiling)=>Math.max(ab.surfaces.sample(x,z,ceiling),ab.supports.sample(x,z,ceiling)),path=ab.plan.approaches[0].points,start=path[0],end=path.at(-1),steps=500;
for(const reverse of [false,true]){const a=reverse?end:start,b=reverse?start:end,position={x:a[0],z:a[1],y:support(...a,Infinity)+MOVEMENT.eye},motion={grounded:true,velocity:0};for(let i=1;i<=steps;i++){position.x=a[0]+(b[0]-a[0])*i/steps;position.z=a[1]+(b[1]-a[1])*i/steps;advanceHeight(position,motion,1/60,support);assert.ok(motion.grounded,'walking across the actual ramp stays grounded in either direction');assert.ok(Math.abs(position.y-MOVEMENT.eye-support(position.x,position.z,Infinity))<1e-5);}}
assert.ok(ab.surfaces.sample(0,0)<1,'approach must not lift ground below deck');
const actualDeck=ab.world.selectable.find(m=>m.userData.feature?.id===deck.id&&m.isMesh),unrelated=actualDeck.clone();unrelated.userData={feature:{...actualDeck.userData.feature,id:'unrelated-deck'}};actualDeck.visible=false;ab.world.group.add(unrelated);ab.world.selectable.push(unrelated);
assert.ok(validateGeometry({...ab,selection:approach}).findings.some(f=>f.code==='approach-discontinuity:2'),'another overlapping deck cannot conceal the missing selected deck');ab.world.selectable.pop();ab.world.group.remove(unrelated);actualDeck.visible=true;dispose(ab.world.group);dispose(ab.reference);
const railCrossing=structuredClone(approach);railCrossing.nyc[0].data.features[0].properties.feat_code=2320;const rb=compileMap(railCrossing,GEOMETRY_DEFAULTS);assert.ok(!validateGeometry({...rb,selection:railCrossing}).findings.some(f=>f.code.startsWith('approach-discontinuity')),'road approaches cannot inherit rail bridge heights');dispose(rb.world.group);dispose(rb.reference);

const infrastructure={bounds,nyc:[snap('nyc-railroad',[line(1,2410,[[-73.9798,40.5705],[-73.9792,40.5705]])]),snap('nyc-retaining-walls',[line(1,4000,ring.slice(0,2))]),snap('nyc-rail-structures',[polygon(1,2140,ring)]),snap('nyc-boardwalk',[polygon(1,4300,ring)]),snap('nyc-hydro-structures',[polygon(1,2800,ring,{elevation:'20'})]),snap('nyc-hydrography',[polygon(1,2660,ring)]),snap('nyc-shoreline',[line(1,3900,ring.slice(0,2))])]};
const ip=resolveMap(infrastructure);assert.equal(ip.details.filter(f=>f.reference).length,4);assert.equal(ip.details.find(f=>f.infrastructure==='pier').absoluteElevation,6.096);
assert.ok(ip.details.every(f=>f.merge.ruleId!=='unknown'));assert.ok(ip.issues.some(i=>i.message.includes('datum')));
for(const terrain of [true,false]){const built=compileMap(infrastructure,{...GEOMETRY_DEFAULTS,terrain});for(const m of built.world.selectable){const p=m.geometry.attributes.position;assert.ok([...p.array].every(Number.isFinite));if(m.isMesh)assert.ok(m.geometry.attributes.normal);}dispose(built.world.group);dispose(built.reference);}
const rail={type:'way',id:1,tags:{railway:'rail',gauge:'1435',width:'8'},geometry:road.geometry};
assert.equal(planFromOSM({elements:[rail]}).details[0].dimensions.width,1.435,'track gauge is not corridor width');
assert.equal(planFromOSM({elements:[{...rail,tags:{railway:'abandoned'}}]}).details[0].reference,true);
console.log('PASS infrastructure classification, source policies, absolute elevations, missing-height references, normals and OSM gauge');

assert.deepEqual(clipPaths([[[-2,0],[2,0],[2,2],[-2,2],[-2,0]]],{x0:-1,x1:1,z0:-1,z1:1}),[[[-1,0],[1,0]]]);
const shape=new THREE.Shape([new THREE.Vector2(-5,-5),new THREE.Vector2(5,-5),new THREE.Vector2(5,5),new THREE.Vector2(-5,5)]);
shape.holes.push(new THREE.Path([new THREE.Vector2(-1,-1),new THREE.Vector2(-1,1),new THREE.Vector2(1,1),new THREE.Vector2(1,-1)]));
const geo=new THREE.ShapeGeometry(shape);geo.rotateX(-Math.PI/2);const clipped=boundGeometry(geo,{x0:-3,x1:3,z0:-3,z1:3});
let area=0;const p=clipped.attributes.position;for(let i=0;i<p.count;i+=3)area+=Math.abs((p.getX(i+1)-p.getX(i))*(p.getZ(i+2)-p.getZ(i))-(p.getX(i+2)-p.getX(i))*(p.getZ(i+1)-p.getZ(i)))/2;
assert.ok(Math.abs(area-32)<1e-5,'clipping must preserve the hole, not fill it');assert.ok(clipped.attributes.uv&&clipped.attributes.normal);clipped.dispose();
console.log('PASS area clipping retains holes, vertex channels and separated path fragments');
