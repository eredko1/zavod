import * as THREE from '../../../vendor/three/build/three.module.js';
import {dispose} from './osm-meshes.js';
import {terrainFromSnapshots,GROUND_DISPLAY_OFFSET} from './map-terrain.js';
import {surfaceIndexFromData} from './map-surface-index.js';
import {sourceInventories} from '../pipeline/source-inventory.js';

export const SCENE_WIRE_VERSION=2;
const HYDRATION_BATCH_SIZE=100;
const attribute=a=>{if(a.isInterleavedBufferAttribute)throw Error('Interleaved geometry is outside the scene wire contract.');return {array:a.array,itemSize:a.itemSize,normalized:a.normalized,usage:a.usage,gpuType:a.gpuType,instanced:a.isInstancedBufferAttribute===true,meshPerAttribute:a.meshPerAttribute};};
const restoreAttribute=a=>{const b=a.instanced?new THREE.InstancedBufferAttribute(a.array,a.itemSize,a.normalized,a.meshPerAttribute):new THREE.BufferAttribute(a.array,a.itemSize,a.normalized);b.setUsage(a.usage);b.gpuType=a.gpuType;return b;};
export function serializeBuild(built){
  const geometries=[],materials=[],nodes=[],geometryIDs=new Map(),materialIDs=new Map(),nodeIDs=new Map(),buffers=new Set();
  const array=a=>{const data=attribute(a);buffers.add(data.array.buffer);return data;};
  const geometry=g=>{if(Object.keys(g.morphAttributes).length)throw Error('Morph geometry requires a scene wire extension.');if(geometryIDs.has(g))return geometryIDs.get(g);const id=geometries.length;geometryIDs.set(g,id);geometries.push({attributes:Object.fromEntries(Object.entries(g.attributes).map(([key,a])=>[key,array(a)])),index:g.index?array(g.index):null,groups:g.groups,drawRange:g.drawRange,userData:g.userData,name:g.name,sphere:g.boundingSphere?{center:g.boundingSphere.center.toArray(),radius:g.boundingSphere.radius}:null,box:g.boundingBox?{min:g.boundingBox.min.toArray(),max:g.boundingBox.max.toArray()}:null});return id;};
  const material=m=>{if(materialIDs.has(m))return materialIDs.get(m);if(Object.values(m).some(v=>v?.isTexture)||m.isShaderMaterial)throw Error('Textured/shader materials require a scene wire extension.');const id=materials.length;materialIDs.set(m,id);materials.push(m.toJSON());return id;};
  const node=o=>{if(nodeIDs.has(o))return nodeIDs.get(o);if(!['Group','Mesh','LineSegments'].includes(o.type)&&!o.isInstancedMesh)throw Error('Unsupported compiled object '+o.type);const id=nodes.length;nodeIDs.set(o,id);nodes.push(null);const {materials:ownedMaterials,geometries:ownedGeometries,...userData}=o.userData;nodes[id]={castShadow:o.castShadow,receiveShadow:o.receiveShadow,type:o.isInstancedMesh?'InstancedMesh':o.type,matrix:o.matrix.toArray(),visible:o.visible,name:o.name,frustumCulled:o.frustumCulled,renderOrder:o.renderOrder,userData,ownedMaterials:ownedMaterials?.map(material),ownedGeometries:ownedGeometries?.map(geometry),geometry:o.geometry?geometry(o.geometry):null,material:o.material?(Array.isArray(o.material)?o.material.map(material):material(o.material)):null,count:o.isInstancedMesh?o.count:null,instanceMatrix:o.isInstancedMesh?array(o.instanceMatrix):null,instanceColor:o.instanceColor?array(o.instanceColor):null,children:o.children.map(node)};return id;};
  const group=node(built.world.group),reference=node(built.reference),id=o=>{if(!nodeIDs.has(o))throw Error('Unowned compiled surface.');return nodeIDs.get(o);};
  const {records,acquisitionFailures,...observations}=built.plan.observations;
  return {payload:{version:SCENE_WIRE_VERSION,plan:{...built.plan,observations},group,reference,geometries,materials,nodes,selectable:built.world.selectable.map(id),walkable:built.world.walkable.map(id),elevatedWalkable:built.world.elevatedWalkable.map(id),surfaces:built.surfaces.toData(id),supports:built.supports.toData(id)},transfer:[...buffers]};
}
export function* restoreBuild(data,result,settings){
  if(data.version!==SCENE_WIRE_VERSION)throw Error('Unsupported compiled scene wire version.');
  const materials=[],geometries=[],objects=[];
  try{
    yield 'sceneHydration';
    const loader=new THREE.MaterialLoader();for(const m of data.materials)materials.push(loader.parse(m));
    for(const g of data.geometries){const geometry=new THREE.BufferGeometry();for(const [key,a]of Object.entries(g.attributes))geometry.setAttribute(key,restoreAttribute(a));if(g.index)geometry.setIndex(restoreAttribute(g.index));geometry.groups=g.groups;geometry.drawRange=g.drawRange;geometry.userData=g.userData;geometry.name=g.name;if(g.sphere)geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(...g.sphere.center),g.sphere.radius);if(g.box)geometry.boundingBox=new THREE.Box3(new THREE.Vector3(...g.box.min),new THREE.Vector3(...g.box.max));geometries.push(geometry);if(geometries.length%HYDRATION_BATCH_SIZE===0)yield 'sceneHydration';}
    for(const n of data.nodes){const material=Array.isArray(n.material)?n.material.map(id=>materials[id]):materials[n.material],geometry=geometries[n.geometry];let object;if(n.type==='Group')object=new THREE.Group();else if(n.type==='Mesh')object=new THREE.Mesh(geometry,material);else if(n.type==='LineSegments')object=new THREE.LineSegments(geometry,material);else if(n.type==='InstancedMesh'){object=new THREE.InstancedMesh(geometry,material,0);object.count=n.count;object.instanceMatrix=restoreAttribute(n.instanceMatrix);if(n.instanceColor)object.instanceColor=restoreAttribute(n.instanceColor);}else throw Error('Unsupported compiled node '+n.type);object.matrix.fromArray(n.matrix);object.matrix.decompose(object.position,object.quaternion,object.scale);object.castShadow=n.castShadow;object.receiveShadow=n.receiveShadow;object.visible=n.visible;object.name=n.name;object.frustumCulled=n.frustumCulled;object.renderOrder=n.renderOrder;object.userData={...n.userData};if(n.ownedMaterials)object.userData.materials=n.ownedMaterials.map(id=>materials[id]);if(n.ownedGeometries)object.userData.geometries=n.ownedGeometries.map(id=>geometries[id]);objects.push(object);if(objects.length%HYDRATION_BATCH_SIZE===0)yield 'sceneHydration';}
    for(let i=0;i<objects.length;i++)for(const child of data.nodes[i].children)objects[i].add(objects[child]);
    const plan=data.plan,snaps=result.nyc||[];plan.observations.records=sourceInventories(result);plan.observations.acquisitionFailures=result.acquisitionFailures||[];
    const terrain=terrainFromSnapshots(snaps,plan.origin,settings.terrain,plan.groundSampleDecisions),reference=objects[data.reference],group=objects[data.group];group.updateMatrixWorld(true);reference.updateMatrixWorld(true);
    const ground=objects[data.walkable[0]],gb=ground.geometry.userData.groundBounds,surfaces=surfaceIndexFromData(data.surfaces,objects,(x,z)=>terrain.sample(x,z)-(x>=gb.x0&&x<=gb.x1&&z>=gb.z0&&z<=gb.z1?GROUND_DISPLAY_OFFSET:0)),supports=surfaceIndexFromData(data.supports,objects,()=>-Infinity);
    return {plan,terrain,reference,surfaces,supports,world:{group,selectable:data.selectable.map(id=>objects[id]),walkable:data.walkable.map(id=>objects[id]),elevatedWalkable:data.elevatedWalkable.map(id=>objects[id])}};
  }catch(error){for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();throw error;}
}
export function releaseBuild(built){dispose(built.world.group);dispose(built.reference);}
