import assert from 'node:assert/strict';
import {loadFidelityFixture} from './fixture.mjs';
import {decodeMeshNode,validateMeshLayer,intersectsNode} from '../data/nyc-building-mesh.js';
import {resolveMap,GEOMETRY_DEFAULTS} from '../pipeline/map-pipeline.js';
import {compileMap} from '../pipeline/map-build.js';
import {dispose} from '../render/osm-meshes.js';
import {blocked} from '../render/osm-walk.js';
import {meshDetail} from '../pipeline/nyc-building-mesh.js';
import {buildScene} from '../render/osm-meshes.js';
import {meshTopology} from '../render/mesh-topology.js';

const {mesh:result}=await loadFidelityFixture(),snapshot=result.nyc.find(s=>s.sourceId==='nyc-buildings-2014'),original=JSON.stringify(result),buffers=base64=>Uint8Array.from(Buffer.from(base64,'base64')).buffer;
const triangle=(y,width=.8)=>[0,y,0,width,y,0,0,y,1],faces=[triangle(0,2),triangle(1.2),triangle(1),triangle(1.4),triangle(3,2)];assert.deepEqual(meshDetail(faces.flat()),meshDetail([faces[0],faces[2],faces[1],faces[3],faces[4]].flat()),'roof detail and eligibility must be independent of equivalent triangle order');assert.deepEqual(meshDetail(faces.flat()),meshDetail([...faces].reverse().flat()));
validateMeshLayer(snapshot.raw.layer);const bad=structuredClone(snapshot.raw.layer);bad.heightModelInfo.vertCRS='unknown';assert.throws(()=>validateMeshLayer(bad),/coordinate system/);
assert.equal(intersectsNode({mbs:[snapshot.bounds.west-.00001,snapshot.bounds.south,0,10]},snapshot.bounds),true,'conservative sphere intersections retain near-boundary tiles');
for(const raw of snapshot.raw.nodes.filter(n=>n.geometry)){const geometry=buffers(raw.geometry),attributes=Object.fromEntries(Object.entries(raw.attributes).map(([key,value])=>[key,buffers(value)]));const features=decodeMeshNode(raw.node,geometry,attributes);assert.ok(features.length);assert.throws(()=>decodeMeshNode(raw.node,geometry.slice(0,-1),attributes),/Incomplete/);const wrong=structuredClone(attributes);new DataView(wrong.f_0).setUint32(4,0,true);assert.throws(()=>decodeMeshNode(raw.node,geometry,wrong),/identity/);}
const plan=resolveMap(result),selected=plan.buildings.filter(f=>f.mesh&&!f.reference);assert.equal(selected.length,13,'pinned measured roof-detail selection, not all older meshes');
const off=resolveMap({...result,nyc:result.nyc.map(s=>({...s,visible:s.sourceId!=='nyc-buildings-2014'}))});
assert.ok(selected.every(f=>f.merge.members.some(m=>m.sourceId==='nyc-buildings')&&f.render.attributes.placement.estimated&&f.mesh.detail.upperBands.length>=2));
for(const mesh of selected){const current=off.buildings.find(f=>f.id===mesh.collisionProxy.source);assert.equal(mesh.merge.canonicalId,current.merge.canonicalId);assert.deepEqual(mesh.collisionProxy.shapes,current.shapes);assert.deepEqual(mesh.collisionProxy.height,current.height);assert.ok(mesh.collisionProxy.estimated);}
const proxyExample={...selected[0],ground:0,shapes:[{outer:[[0,0],[10,0],[10,10],[0,10]],holes:[]}],collisionProxy:{height:{bottom:0,top:5},shapes:[{outer:[[0,0],[2,0],[2,2],[0,2]],holes:[]}]}},proxyPlan={buildings:[proxyExample]};assert.ok(blocked(1,1,proxyPlan));assert.equal(blocked(8,8,proxyPlan),false,'walking uses the recorded footprint proxy rather than claiming native surface topology');
const newer=structuredClone(result),first=selected[0],current=newer.nyc.find(s=>s.sourceId==='nyc-buildings').data.features.find(f=>String(f.properties.bin)===String(first.tags.bin));current.properties.construction_year='2020';
assert.ok(resolveMap(newer).buildings.find(f=>f.id===first.id).render.attributes.selection.reason.includes('postdates'),'post-2014 construction evidence prevents replacement after identity matching');
const taller=structuredClone(result);taller.nyc.find(s=>s.sourceId==='nyc-buildings').data.features.find(f=>String(f.properties.bin)===String(first.tags.bin)).properties.height_roof='400';assert.ok(resolveMap(taller).buildings.find(f=>f.id===first.id).render.attributes.selection.reason.includes('vertical span'));
assert.deepEqual(resolveMap({...result,nyc:[...result.nyc].reverse()}).merge.suppressed,plan.merge.suppressed,'fetch order cannot change selection');
assert.equal(off.buildings.filter(f=>f.mesh).length,0);assert.equal(off.buildings.filter(f=>f.sourceId==='nyc-buildings').length,34);
assert.equal(resolveMap({...result,mergeEnabled:false}).buildings.filter(f=>f.mesh&&!f.reference).length,0,'no datum/base inference when duplicate merging is off');
assert.equal(resolveMap({...result,nyc:[snapshot]}).buildings.filter(f=>f.mesh&&!f.reference).length,0,'unmatched meshes retain reference status instead of mixing EGM96 with ground');
assert.equal(JSON.stringify(result),original,'source geometry, attributes and native bytes remain immutable');
const build=compileMap(result,GEOMETRY_DEFAULTS),native=build.world.selectable.filter(m=>m.isMesh&&m.userData.feature?.mesh);assert.equal(native.length,13);assert.ok(native.every(m=>m.geometry.attributes.position.array.every(Number.isFinite)));assert.ok(native.every(m=>!build.world.elevatedWalkable.includes(m)),'surface display does not claim verified roof collision topology');
const audited=selected.find(f=>f.mesh.topology.closed);assert.ok(audited,'captured native geometry exercises a successful solid audit');const xs=audited.mesh.positions.filter((_,i)=>i%3===0),zs=audited.mesh.positions.filter((_,i)=>i%3===2),cut={...audited,clipBounds:{x0:(Math.min(...xs)+Math.max(...xs))/2,x1:Math.max(...xs)+1,z0:Math.min(...zs)-1,z1:Math.max(...zs)+1}},cutPlan={buildings:[cut],roads:[],details:[],coverage:[],issues:[]},cutScene=buildScene(cutPlan);assert.deepEqual(cutPlan.issues,[]);assert.equal(meshTopology(Array.from(cutScene.selectable[0].geometry.attributes.position.array)).closed,true,'verified native shells receive closed cut caps');dispose(cutScene.group);
for(const m of native){const f=m.userData.feature,p=m.geometry.attributes.position,heights=new Set(Array.from({length:p.count},(_,i)=>Math.round(p.getY(i)*100)));assert.ok(heights.size>2,'native stepped heights survive rendering rather than becoming one extrusion');assert.equal(f.mesh.sourceVerticalCRS,'EGM96');}
dispose(build.world.group);dispose(build.reference);console.log('PASS native decoding, boundary traversal, identity validation, source ordering/visibility, temporal/height/detail gates, immutable export and actual roof surfaces');
