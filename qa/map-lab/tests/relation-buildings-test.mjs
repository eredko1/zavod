import assert from 'node:assert/strict';
import {resolveSources,resolveMap,GEOMETRY_DEFAULTS} from '../pipeline/map-pipeline.js';
import {compileMap} from '../pipeline/map-build.js';
import {dispose} from '../render/osm-meshes.js';
const geometry=[{lat:40.57,lon:-73.98},{lat:40.57,lon:-73.979},{lat:40.571,lon:-73.979},{lat:40.571,lon:-73.98},{lat:40.57,lon:-73.98}];
const input=(parentTags,childTags={height:'10'})=>({data:{elements:[{type:'way',id:10,tags:{building:'yes',...childTags},geometry},{type:'relation',id:20,tags:{type:'multipolygon',building:'yes',...parentTags},members:[{type:'way',ref:10,role:'outer',geometry}]}]}});
for(const [parentTags,childTags,selected]of [[{'building:levels':'2'},{height:'10'},'way/10'],[{}, {height:'10'},'way/10'],[{'building:levels':'2'},{'building:levels':'2'},'relation/20'],[{'building:levels':'2'},{},'relation/20']]){
  const scene=input(parentTags,childTags),before=JSON.stringify(scene),source=resolveSources(scene),sourceBefore=JSON.stringify(source),built=compileMap(scene,GEOMETRY_DEFAULTS),models=built.plan.buildings;
  assert.equal(models.filter(f=>f.extrude&&!f.suppressed).length,1);assert.equal(models.find(f=>f.extrude&&!f.suppressed).id,selected);assert.ok(models.every(f=>f.render.attributes.relationRepresentation));assert.deepEqual(built.plan.merge,source.merge);assert.equal(JSON.stringify(resolveSources(scene)),sourceBefore);assert.equal(JSON.stringify(scene),before);assert.ok(!built.plan.issues.some(i=>i.code==='missing-height'));dispose(built.world.group);dispose(built.reference);
  for(const storey of [2,5])assert.deepEqual(resolveMap(scene,{storey}).buildings.map(f=>f.id),models.map(f=>f.id),'model settings cannot drop retained source entities');
}
const raised=input({'building:levels':'4','building:min_level':'1'});assert.ok(resolveMap(raised).buildings.every(f=>!f.suppressed),'different base models cannot be deduplicated by footprint');
const partial=input({'building:levels':'2'});partial.data.elements[1].members[0].geometry=geometry.map(p=>({...p,lon:p.lon+.0001}));assert.ok(resolveMap(partial).buildings.every(f=>!f.suppressed),'nonidentical relation/member outlines remain available');
console.log('PASS retained render templates, measured relation/member height priority, exact geometry/base gates, source immutability and setting-independent entity membership');
