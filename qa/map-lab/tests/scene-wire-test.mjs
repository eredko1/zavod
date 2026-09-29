import assert from 'node:assert/strict';
import {loadFidelityFixture} from './fixture.mjs';
import {compileMap} from '../pipeline/map-build.js';
import {GEOMETRY_DEFAULTS} from '../pipeline/map-pipeline.js';
import {serializeBuild,restoreBuild,releaseBuild} from '../render/scene-wire.js';
import {runBuildStages} from '../pipeline/build-stages.js';
import * as THREE from '../../../vendor/three/build/three.module.js';
import {surfaceIndex,surfaceIndexFromData} from '../render/map-surface-index.js';
import {compilerInput} from '../pipeline/compiler-input.js';
import {resolveMap} from '../pipeline/map-pipeline.js';

const fixture=await loadFidelityFixture();
for(const result of [fixture.mesh,fixture.bridge]){
  const before=JSON.stringify(result),input=compilerInput(result),built=compileMap(input,GEOMETRY_DEFAULTS),expected=built.world.selectable.map(m=>({id:m.userData.feature?.id,features:m.userData.features,position:Array.from(m.geometry.attributes.position.array),index:m.geometry.index?Array.from(m.geometry.index.array):null,matrix:m.matrixWorld.toArray(),count:m.isInstancedMesh?m.count:null,instances:m.isInstancedMesh?Array.from(m.instanceMatrix.array):null})),wire=serializeBuild(built),data=structuredClone(wire.payload,{transfer:wire.transfer}),restored=runBuildStages(restoreBuild(data,result,GEOMETRY_DEFAULTS));
  assert.deepEqual(built.plan.merge,resolveMap(result).merge,'omitting archives cannot change source selection');
  for(let i=0;i<input.nyc.length;i++){assert.equal(input.nyc[i].raw,undefined);assert.equal(input.nyc[i].data,result.nyc[i].data);assert.deepEqual(input.nyc[i].metadata,result.nyc[i].metadata);}
  assert.deepEqual(restored.plan.merge,built.plan.merge);assert.deepEqual(restored.plan.render,built.plan.render);assert.equal(restored.world.selectable.length,expected.length);
  for(let i=0;i<built.world.selectable.length;i++)if(built.world.selectable[i].isInstancedMesh){const source=built.world.selectable[i],target=restored.world.selectable[i];for(const key of ['instanceMatrix','instanceColor'])if(source[key]){assert.equal(target[key].isInstancedBufferAttribute,true);for(const field of ['meshPerAttribute','usage','gpuType','normalized'])assert.equal(target[key][field],source[key][field]);}}
  for(let i=0;i<expected.length;i++){const mesh=restored.world.selectable[i],e=expected[i];assert.equal(mesh.userData.feature?.id,e.id);assert.deepEqual(mesh.userData.features,e.features);assert.deepEqual(Array.from(mesh.geometry.attributes.position.array),e.position);assert.deepEqual(mesh.geometry.index?Array.from(mesh.geometry.index.array):null,e.index);assert.ok(mesh.matrixWorld.toArray().every((v,k)=>Math.abs(v-e.matrix[k])<1e-6));if(mesh.isInstancedMesh){assert.equal(mesh.count,e.count);assert.deepEqual(Array.from(mesh.instanceMatrix.array),e.instances);}}
  for(const f of restored.plan.buildings.filter(f=>f.extrude&&!f.suppressed)){const p=f.shapes[0]?.outer?.[0];if(p)for(const ceiling of [Infinity,2,10,100])assert.equal(restored.supports.sample(...p,ceiling),built.supports.sample(...p,ceiling));}
  for(const snapshot of result.nyc){const inventory=restored.plan.observations.records.find(s=>s.sourceId===snapshot.sourceId);assert.equal(inventory.records,snapshot.data.features);if(snapshot.raw)assert.equal(inventory.snapshot.raw,snapshot.raw);}
  assert.equal(JSON.stringify(result),before);
  releaseBuild(restored);releaseBuild(built);
}
{
  const raw={payloads:[{binary:'original point bytes'}]},failed=[{sourceId:'source',raw}],result={data:{elements:[]},nyc:[{sourceId:'nyc-lidar-2017',metadata:{pointDecoding:'pending'},data:{features:[],assets:[{id:'0-0-0-0',pointCount:1}]},raw}],acquisitionFailures:failed},input=compilerInput(result);
  assert.equal(input.acquisitionFailures,undefined);assert.equal(input.nyc[0].raw,undefined);assert.equal(input.nyc[0].data,result.nyc[0].data);assert.equal(result.nyc[0].raw,raw);assert.equal(result.acquisitionFailures,failed);
  assert.deepEqual(compilerInput({data:{elements:[]}}),{data:{elements:[]}});
}
assert.throws(()=>runBuildStages(restoreBuild({version:-1},{},{})),/wire version/);
{
  const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([0,5,0,9,5,0,0,5,9],3)),mesh=new THREE.Mesh(geometry);mesh.updateMatrixWorld(true);const index=surfaceIndex([mesh],()=>-Infinity,3),restored=surfaceIndexFromData(index.toData(()=>0),[mesh],()=>-Infinity);assert.equal(restored.sample(4,1),5,'custom cell dimensions survive transfer');mesh.visible=false;assert.equal(restored.sample(4,1),-Infinity);geometry.dispose();mesh.material.dispose();
}
{
  const built=compileMap(fixture.bridge,GEOMETRY_DEFAULTS),data=structuredClone(serializeBuild(built).payload),geometryDispose=THREE.BufferGeometry.prototype.dispose,materialDispose=THREE.Material.prototype.dispose;let geometries=0,materials=0;
  THREE.BufferGeometry.prototype.dispose=function(){geometries++;return geometryDispose.call(this);};THREE.Material.prototype.dispose=function(){materials++;return materialDispose.call(this);};
  try{const steps=restoreBuild(data,fixture.bridge,GEOMETRY_DEFAULTS);steps.next();const next=steps.next();assert.equal(next.done,false,'fixture reaches a restoration batch before completion');assert.throws(()=>steps.throw(Error('cancelled hydration')),/cancelled hydration/);assert.ok(geometries>0);assert.equal(materials,data.materials.length,'all partial restoration materials are released');}
  finally{THREE.BufferGeometry.prototype.dispose=geometryDispose;THREE.Material.prototype.dispose=materialDispose;releaseBuild(built);}
}
console.log('PASS transferable scene channels, indices, instances, transforms, ownership, source/render ledgers, walking samples and immutable raw inputs');
