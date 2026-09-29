import {fetchJSON,ATTEMPT_TIMEOUT} from './api-request.js';
import {checkAbort,withRequestTimeout} from './request-abort.js';
import {acquisitionError} from './acquisition-error.js';
import {readBinaryResponse} from './binary-response.js';
import {ACQUISITION_LIMITS} from './acquisition-limits.js';
import {base64} from './binary-archive.js';

export const NYC_MESH_LAYER='https://tiles.arcgis.com/tiles/yG5s3afENB5iO9fj/arcgis/rest/services/3D_Buildings_Citywide/SceneServer/layers/0';
export const MESH_LIMITS=ACQUISITION_LIMITS.mesh;
const ATTRIBUTE_KEYS=['f_0','f_1','f_2','f_3','f_4'];
export function intersectsNode(node,bounds){
  const [lon,lat,height,radius]=node.mbs||[];
  if(![lon,lat,height,radius].every(Number.isFinite)||radius<0||Math.abs(lat)>90||Math.abs(lon)>180)throw Error('Invalid NYC mesh node bounds.');
  // Conservative metre-to-degree bounds; this adapter only covers NYC latitudes.
  const dy=radius/100000,dx=Math.abs(lat)+dy>=90?360:radius/(100000*Math.cos((Math.abs(lat)+dy)*Math.PI/180));
  return lon+dx>=bounds.west&&lon-dx<=bounds.east&&lat+dy>=bounds.south&&lat-dy<=bounds.north;
}
export function validateMeshLayer(layer){
  const schema=layer.store?.defaultGeometrySchema,attrs=layer.attributeStorageInfo;
  if(layer.spatialReference?.wkid!==4326||layer.heightModelInfo?.vertCRS!=='EGM96_Geoid'||layer.heightModelInfo?.heightUnit!=='meter'||schema?.topology!=='PerAttributeArray'||schema.geometryType!=='triangles'||JSON.stringify(schema.ordering)!==JSON.stringify(['position','normal','uv0','color']))throw Error('Unsupported NYC mesh coordinate system or geometry layout.');
  for(const [name,type,count]of [['position','Float32',3],['normal','Float32',3],['uv0','Float32',2],['color','UInt8',4]])if(schema.vertexAttributes?.[name]?.valueType!==type||schema.vertexAttributes[name].valuesPerElement!==count)throw Error('Unsupported NYC mesh vertex layout.');
  for(const [key,name,type]of [['f_0','OBJECTID','Oid32'],['f_1','BIN','Int32'],['f_2','DOITT_ID','Int32'],['f_3','SOURCE_ID','Float64'],['f_4','IsClosed','String']])if(!attrs?.some(a=>a.key===key&&a.name===name&&a.attributeValues?.valueType===type))throw Error('Unsupported NYC mesh identity attributes.');
  if(schema.featureAttributes?.id?.valueType!=='UInt64'||schema.featureAttributes?.faceRange?.valueType!=='UInt32')throw Error('Unsupported NYC mesh feature layout.');
}
export function decodeMeshNode(node,buffer,attributes){
  const g=new DataView(buffer);if(g.byteLength<8)throw Error('Truncated NYC mesh header.');
  const vertices=g.getUint32(0,true),count=g.getUint32(4,true),offset=8+vertices*36;
  if(vertices%3||g.byteLength!==offset+count*16)throw Error('Incomplete NYC mesh geometry.');
  if(vertices>MESH_LIMITS.vertices)throw Error(`NYC mesh vertex limit exceeded: ${vertices} vertices requested (limit ${MESH_LIMITS.vertices}).`);
  if(count>MESH_LIMITS.features)throw Error(`NYC mesh object limit exceeded: ${count} objects requested (limit ${MESH_LIMITS.features}).`);
  const a=ATTRIBUTE_KEYS.map(key=>{if(!attributes[key])throw Error('Missing NYC mesh attribute '+key);return new DataView(attributes[key]);});
  for(let i=0;i<a.length;i++)if(a[i].byteLength<4||a[i].getUint32(0,true)!==count||(i<3&&a[i].byteLength!==4+count*4)||(i===3&&a[i].byteLength!==8+count*8))throw Error('Incomplete NYC mesh attribute array.');
  if(a[4].byteLength<8+count*4||a[4].byteLength!==8+count*4+a[4].getUint32(4,true))throw Error('Incomplete NYC mesh closure attributes.');
  let stringBytes=0;for(let i=0;i<count;i++)stringBytes+=a[4].getUint32(8+i*4,true);if(stringBytes!==a[4].getUint32(4,true))throw Error('Invalid NYC mesh string lengths.');
  const features=[],ids=new Set(),ranges=[];
  for(let i=0;i<count;i++){
    const objectId=Number(g.getBigUint64(offset+i*8,true)),lo=g.getUint32(offset+count*8+i*8,true),hi=g.getUint32(offset+count*8+i*8+4,true);
    if(!Number.isSafeInteger(objectId)||objectId!==a[0].getUint32(4+i*4,true)||ids.has(objectId)||lo>hi||hi>=vertices/3)throw Error('Invalid NYC mesh identity or face range.');
    ids.add(objectId);ranges.push([lo,hi]);const positions=[],extent=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
    for(let v=lo*3;v<(hi+1)*3;v++)for(let k=0;k<3;k++){const value=node.mbs[k]+g.getFloat32(8+v*12+k*4,true);if(!Number.isFinite(value))throw Error('Nonfinite NYC mesh position.');positions.push(value);extent[k]=Math.min(extent[k],value);extent[k+3]=Math.max(extent[k+3],value);}
    features.push({objectId,bin:a[1].getInt32(4+i*4,true),doitt_id:a[2].getInt32(4+i*4,true),source_id:a[3].getFloat64(8+i*8,true),nodeId:String(node.id),positions,extent});
  }
  ranges.sort((a,b)=>a[0]-b[0]);let end=0;for(const [lo,hi]of ranges){if(lo!==end)throw Error('Overlapping or unassigned NYC mesh faces.');end=hi+1;}if(end!==vertices/3)throw Error('Unassigned NYC mesh faces.');
  return features;
}
export function meshFeature(mesh){
  const polygons=[],seen=new Set(),p=mesh.positions;
  for(let i=0;i<p.length;i+=9){const ring=[[p[i],p[i+1]],[p[i+3],p[i+4]],[p[i+6],p[i+7]]],area=(ring[1][0]-ring[0][0])*(ring[2][1]-ring[0][1])-(ring[1][1]-ring[0][1])*(ring[2][0]-ring[0][0]);if(Math.abs(area)<1e-16)continue;const key=ring.map(v=>v.join(',')).sort().join('/');if(seen.has(key))continue;seen.add(key);polygons.push([[...ring,ring[0]]]);}
  return {type:'Feature',properties:{objectid:mesh.objectId,bin:mesh.bin,doitt_id:mesh.doitt_id,source_id:mesh.source_id,node_id:mesh.nodeId,capture_year:2014},geometry:{type:'MultiPolygon',coordinates:polygons},mesh:{positions:p,extent:mesh.extent,verticalCRS:'EGM96',unit:'metres'}};
}
export async function fetchBuildingMeshes(source,bounds,signal,onRetry){
  const urls=[],responses=[],rawNodes=[],features=[],ids=new Set(),budget={bytes:0,limit:MESH_LIMITS.bytes},get=async url=>{checkAbort(signal);urls.push(url);const data=await fetchJSON(url,{signal},onRetry);responses.push({url,data});return data;};let layer=null;
  try{
  layer=await get(NYC_MESH_LAYER+'?f=json');validateMeshLayer(layer);
  const queue=['root'],visited=new Set();let leafCount=0,totalVertices=0;
  while(queue.length){
    checkAbort(signal);const id=queue.shift();if(visited.has(id))continue;visited.add(id);if(visited.size>MESH_LIMITS.nodes)throw Error(`NYC mesh node limit exceeded: ${visited.size} nodes requested (limit ${MESH_LIMITS.nodes}). Choose a smaller area.`);
    const node=await get(`${NYC_MESH_LAYER}/nodes/${encodeURIComponent(id)}?f=json`);if(String(node.id)!==id)throw Error('NYC mesh node identity mismatch.');rawNodes.push({id,node});if(!intersectsNode(node,bounds))continue;
    if(node.children?.length){for(const child of node.children){if(child.id===undefined||child.id===null)throw Error('Missing NYC mesh child identity.');if(intersectsNode(child,bounds))queue.push(String(child.id));}continue;}
    if(++leafCount>MESH_LIMITS.leaves)throw Error(`NYC mesh leaf limit exceeded: ${leafCount} leaves requested (limit ${MESH_LIMITS.leaves}). Choose a smaller area.`);
    if(node.geometryData?.length!==1)throw Error('Unsupported NYC mesh leaf geometry layout.');
    const raw=rawNodes.at(-1),nodeURL=`${NYC_MESH_LAYER}/nodes/${encodeURIComponent(id)}`,binary=async(suffix,key=null)=>{checkAbort(signal);const url=nodeURL+suffix;urls.push(url);const buffer=await withRequestTimeout(signal,ATTEMPT_TIMEOUT,async signal=>{const response=await fetch(url,{signal,cache:'no-store'});if(!response.ok)throw Error(`NYC mesh HTTP ${response.status}`);return readBinaryResponse(response,budget,'NYC mesh binary-byte');});if(key){raw.attributes??={};raw.attributes[key]=base64(buffer);}else raw.geometry=base64(buffer);return buffer;};
    const results=await Promise.allSettled([binary('/geometries/0'),...ATTRIBUTE_KEYS.map(key=>binary(`/attributes/${key}/0`,key))]);
    for(const result of results)if(result.status==='rejected')throw result.reason;
    const buffers=results.map(r=>r.value),attributes=Object.fromEntries(ATTRIBUTE_KEYS.map((key,i)=>[key,buffers[i+1]]));
    if(buffers[0].byteLength<8)throw Error('Truncated NYC mesh header.');totalVertices+=new DataView(buffers[0]).getUint32(0,true);if(totalVertices>MESH_LIMITS.vertices)throw Error(`NYC mesh vertex limit exceeded: ${totalVertices} vertices requested (limit ${MESH_LIMITS.vertices}). Choose a smaller area.`);
    const meshes=decodeMeshNode(node,buffers[0],attributes);
    for(const mesh of meshes){if(ids.has(mesh.objectId))throw Error('NYC mesh object appears in multiple leaves; incomplete identity partition.');ids.add(mesh.objectId);if(ids.size>MESH_LIMITS.features)throw Error(`NYC mesh object limit exceeded: ${ids.size} objects requested (limit ${MESH_LIMITS.features}). Choose a smaller area.`);const e=mesh.extent;if(e[0]<=bounds.east&&e[3]>=bounds.west&&e[1]<=bounds.north&&e[4]>=bounds.south)features.push(meshFeature(mesh));}
  }
  return {sourceId:source.id,dataset:source.dataset,bounds,urls,queryURL:NYC_MESH_LAYER+'?f=json',fetchedAt:new Date().toISOString(),metadata:{name:layer.name,captureYear:2014,spatialReference:layer.spatialReference,heightModelInfo:layer.heightModelInfo,dataUpdatedAt:null,metadataUpdatedAt:null},raw:{layer,nodes:rawNodes,responses,binaryEncoding:'base64'},data:{type:'FeatureCollection',features}};
  }catch(cause){throw acquisitionError(cause,source,bounds,{urls,requests:urls.map(url=>({url,method:'GET'})),raw:{layer,nodes:rawNodes,responses,binaryEncoding:'base64'}},signal);}
}
