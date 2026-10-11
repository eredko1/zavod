import assert from 'node:assert/strict';
import {loadFidelityFixture} from './fixture.mjs';
import {resolveSources,resolveMap} from '../pipeline/map-pipeline.js';
import {prepareRenderPlan} from '../render/render-plan.js';

const {mesh,bridge}=await loadFidelityFixture();
const synthetic={data:{elements:[
  ...[[1,40.58,-73.98],[2,40.58,-73.9799],[3,40.5801,-73.9799],[4,40.5801,-73.98]].map(([id,lat,lon])=>({type:'node',id,lat,lon})),
  {type:'way',id:1,nodes:[1,2,3,4,1],tags:{building:'yes','building:levels':'4'}},
  {type:'way',id:2,nodes:[1,2],tags:{highway:'residential',lanes:'2'}},
  {type:'node',id:5,lat:40.5802,lon:-73.98,tags:{natural:'tree'}},
  {type:'way',id:3,nodes:[3,4],tags:{barrier:'kerb',kerb:'flush'}},
]},nyc:[]};
for(const input of [synthetic,mesh,bridge]){
  const raw=JSON.stringify(input),source=resolveSources(input),before=JSON.stringify(source),rendered=prepareRenderPlan(source,input,{storey:3,curb:.15,terrain:true});
  assert.equal(JSON.stringify(source),before,'render preparation must not alter source selections or observations');
  assert.equal(JSON.stringify(input),raw,'all native observations remain immutable');
  assert.deepEqual(rendered.merge,source.merge,'render estimates and exclusions never enter the source merge log');
  assert.ok(rendered.render.decisions.length);
  for(const snapshot of input.nyc||[]){const inventory=rendered.observations.records.find(s=>s.sourceId===snapshot.sourceId);assert.equal(inventory.records,snapshot.data.features);for(const [key,value]of Object.entries(snapshot))if(key!=='visible')assert.equal(inventory.snapshot[key],value,'raw provider channels and metadata remain available to render rules');assert.equal(inventory.snapshot.visible,undefined);}
  const features=[...source.buildings,...source.roads,...source.details];
  for(const f of features){
    assert.equal(f.render,undefined);assert.equal(f.elevationProfile,undefined);assert.equal(f.roadElevation,undefined);assert.equal(f.supportModel,undefined);assert.equal(f.equipmentModel,undefined);assert.equal(f.collisionProxy,undefined);assert.equal(f.collisionBounds,undefined);assert.equal(f.mesh?.placement,undefined);assert.equal(f.geometryContext,undefined);assert.equal(f.placementAnchor,undefined);assert.equal(f.merge?.attributes.selection,undefined);assert.equal(f.treePoints,undefined);
    assert.equal((f.estimates||[]).length,0,'source normalization must not supply defaults');
    for(const attr of Object.values(f.attributes||{}))assert.notEqual(attr?.estimated,true,'merged source dimensions must be measurements');
  }
  assert.deepEqual(resolveSources(input,{storey:8,curb:.4,terrain:false}).merge,source.merge,'render defaults cannot change source identity/selection');
  const ids=new Set(source.observations.records.flatMap(s=>s.records.map(r=>s.sourceId==='osm-overpass'?r.type+'/'+r.id:null)));
  for(const key of ['buildings','roads','details'])for(const f of source.observations[key])ids.add(f.id);
  for(const decision of source.merge.decisions)for(const member of decision.members)assert.ok(ids.has(member.id),'every unique source geometry remains available, including represented alternatives');
}
const source=resolveSources(synthetic),rendered=resolveMap(synthetic);
const notSupport=structuredClone(synthetic);notSupport.data.elements.find(f=>f.type==='way'&&f.id===1).tags['bridge:support']='no';const notSupportSource=resolveSources(notSupport);assert.equal(notSupportSource.buildings.length,1);assert.equal(notSupportSource.buildings[0].merge.ruleId,'buildings');assert.equal(notSupportSource.details.filter(f=>f.rule==='bridge-support').length,0);assert.equal(resolveMap(notSupport).buildings[0].height.top,12,'an explicitly inactive support tag does not suppress an otherwise valid building');
assert.deepEqual(resolveSources(synthetic,{storey:0,curb:9}).merge,source.merge,'invalid render settings do not invalidate measured source selections');assert.throws(()=>resolveMap(synthetic,{storey:0}),/Metres per floor/);assert.throws(()=>resolveMap(synthetic,{curb:9}),/Curb height/);
assert.equal(source.buildings[0].height.top,null);assert.equal(rendered.buildings[0].height.top,12);assert.ok(rendered.buildings[0].render.attributes.height.estimated);
assert.equal(source.roads[0].width,null);assert.ok(rendered.roads[0].width.estimated);
assert.deepEqual(source.details.find(f=>f.rule==='tree').dimensions,{});assert.equal(rendered.details.find(f=>f.rule==='tree').dimensions.height,7);
assert.equal(source.details.find(f=>f.rule==='kerb').dimensions.height,undefined);assert.equal(rendered.details.find(f=>f.rule==='kerb').dimensions.height,0);
assert.ok(rendered.details.find(f=>f.rule==='kerb').render.attributes.dimensions.height.estimated);
const raised=structuredClone(synthetic);raised.data.elements.find(f=>f.type==='way'&&f.id===1).tags={building:'yes',height:'12','building:min_level':'2'};const raisedSource=resolveSources(raised),raisedRender=resolveMap(raised);assert.equal(raisedSource.buildings[0].height.bottom,null,'missing measured base stays unknown in source selection');assert.equal(raisedRender.buildings[0].height.bottom,6);assert.equal(raisedRender.buildings[0].render.attributes.height.bottomEstimated,true);assert.equal(raisedRender.buildings[0].render.attributes.height.topEstimated,false);assert.deepEqual(raisedRender.merge,raisedSource.merge);
raised.data.elements.find(f=>f.type==='way'&&f.id===1).tags['building:min_level']='9';assert.equal(resolveMap(raised).buildings[0].extrude,false,'an estimated lower floor above the measured top cannot silently become a ground building');
const curbConflict=structuredClone(synthetic);curbConflict.data.elements.push({type:'way',id:4,nodes:[3,4],tags:{barrier:'kerb',kerb:'lowered'}});curbConflict.nyc=[{sourceId:'nyc-curbs',bounds:{south:40.58,west:-73.98,north:40.5802,east:-73.9799},data:{type:'FeatureCollection',features:[{type:'Feature',properties:{source_id:90},geometry:{type:'LineString',coordinates:[[-73.9799,40.5801],[-73.98,40.5801]]}}]}}];
const curbSources=resolveSources(curbConflict),curbRender=resolveMap(curbConflict),curb=curbRender.details.find(f=>f.sourceId==='nyc-curbs');assert.equal(curbSources.details.find(f=>f.sourceId==='nyc-curbs').dimensions.height,undefined);assert.deepEqual(curbRender.merge,curbSources.merge);assert.equal(curb.reference,true);assert.equal(curbRender.coverage.find(c=>c.id===curb.id).status,'reference');assert.ok(curb.render.conflicts.length,'contradictory classification models retain an outline and a render conflict');
const raisedNative=structuredClone(mesh),selected=resolveMap(raisedNative).buildings.find(f=>f.mesh&&!f.reference),current=raisedNative.nyc.find(s=>s.sourceId==='nyc-buildings').data.features.find(f=>String(f.properties.bin)===String(selected.tags.bin)),top=Number(current.properties.height_roof)*.3048;
current.properties.height_roof=null;const currentRing=current.geometry.type==='MultiPolygon'?current.geometry.coordinates[0][0]:current.geometry.coordinates[0];raisedNative.data={elements:[{type:'way',id:20,tags:{building:'yes',height:String(top),'building:min_level':'2','nycdoitt:bin':String(current.properties.bin)},geometry:currentRing.map(([lon,lat])=>({lon,lat}))}]};
const recovered=resolveSources({...raisedNative,nyc:raisedNative.nyc.filter(s=>s.sourceId==='nyc-buildings')});assert.equal(recovered.coverage.find(c=>c.tags.bin===current.properties.bin).status,'retained','source height recovery does not claim a rendered model');
const nativeSource=resolveSources(raisedNative),nativeRender=resolveMap(raisedNative),native=nativeRender.buildings.find(f=>f.id===selected.id);assert.equal(nativeSource.buildings.find(f=>f.id===selected.id).geometryContext,undefined);assert.equal(nativeSource.buildings.find(f=>f.id===native.collisionProxy.source).height.bottom,null);assert.equal(native.collisionProxy.height.bottom,6);assert.equal(native.render.attributes.collision.height.bottomEstimated,true);assert.deepEqual(nativeRender.merge,nativeSource.merge);
console.log('PASS immutable measured source merge, all geometry alternatives, render-only dimensions/profiles/placement/supports/equipment and independent logs');
