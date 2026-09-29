import {fetchJSON,ATTEMPT_TIMEOUT} from './api-request.js';
import {checkAbort,withRequestTimeout} from './request-abort.js';
import {acquisitionError} from './acquisition-error.js';
import {lidarEnvelope,LIDAR_QUERY_PADDING_METRES} from './lidar-query.js';
import {createLiDARDecoder,LIDAR_DECODER} from './lidar-decoder.js';
import {readBinaryResponse} from './binary-response.js';
import {ACQUISITION_LIMITS} from './acquisition-limits.js';
import {base64,sha256} from './binary-archive.js';

export const NYC_LIDAR_EPT='https://noaa-nos-coastal-lidar-pds.s3.amazonaws.com/entwine/geoid18/9306';
// Reviewed acquisition budgets; depth is a protocol validation constraint, not a density selector.
export const LIDAR_LIMITS=Object.freeze({...ACQUISITION_LIMITS.lidar,depth:30});
const PROGRESS_ASSET_INTERVAL=32;
const intersects=(b,q)=>b[0]<=q[2]&&b[3]>=q[0]&&b[1]<=q[3]&&b[4]>=q[1];
function validBounds(b){return Array.isArray(b)&&b.length===6&&b.every(Number.isFinite)&&[0,1,2].every(i=>b[i]<=b[i+3]);}
function keyParts(key){
  if(!/^\d+-\d+-\d+-\d+$/.test(key))throw Error('Invalid EPT node identity.');
  const p=key.split('-').map(Number),[depth,...coordinates]=p;
  if(p.join('-')!==key||depth>LIDAR_LIMITS.depth||coordinates.some(v=>!Number.isSafeInteger(v)||v>=2**depth))throw Error('Unsupported EPT node depth or coordinates.');
  return p;
}
export function eptNodeBounds(key,bounds){
  const [depth,...indices]=keyParts(key),size=2**depth,min=indices.map((v,i)=>bounds[i]+(bounds[i+3]-bounds[i])*v/size),max=indices.map((v,i)=>bounds[i]+(bounds[i+3]-bounds[i])*(v+1)/size);
  return [...min,...max];
}
function descendant(key,root){const a=keyParts(key),b=keyParts(root);return a[0]>=b[0]&&a.slice(1).every((v,i)=>Math.floor(v/2**(a[0]-b[0]))===b[i+1]);}
export function validateEPT(metadata){
  if(metadata.version!=='1.0.0'||metadata.dataType!=='laszip'||metadata.hierarchyType!=='json'||metadata.srs?.authority!=='EPSG'||metadata.srs.horizontal!=='6347'||metadata.srs.vertical!=='5703'||!validBounds(metadata.bounds)||!validBounds(metadata.boundsConforming)||!Number.isSafeInteger(metadata.points)||metadata.points<=0||!Array.isArray(metadata.schema))throw Error('Unsupported NYC LiDAR EPT metadata.');
  if(new Set(metadata.schema.map(s=>s.name)).size!==metadata.schema.length)throw Error('Duplicate EPT schema dimensions.');
  for(const s of metadata.schema)if(typeof s.name!=='string'||!s.name||!['signed','unsigned','float'].includes(s.type)||![1,2,4,8].includes(s.size)||(s.type==='float'&&s.size<4)||(s.scale!==undefined&&(!Number.isFinite(s.scale)||s.scale<=0))||(s.offset!==undefined&&!Number.isFinite(s.offset)))throw Error('Invalid EPT dimension schema.');
  for(const name of ['X','Y','Z','Classification','OriginId'])if(!metadata.schema.some(s=>s.name===name))throw Error('Missing EPT dimension '+name);
}
// Validate the delivered LAS header and compression declaration; point decompression remains a separate step.
export function readLASHeader(buffer,expectedPoints){
  const v=new DataView(buffer),text=(start,length)=>new TextDecoder().decode(buffer.slice(start,start+length)).replace(/\0+$/,'');
  if(v.byteLength<227||text(0,4)!=='LASF'||v.getUint8(24)!==1||v.getUint8(25)!==2||v.getUint16(94,true)!==227)throw Error('Unsupported or truncated LiDAR LAS header.');
  const offset=v.getUint32(96,true),vlrCount=v.getUint32(100,true),format=v.getUint8(104),recordSize=v.getUint16(105,true),pointCount=v.getUint32(107,true);
  if(format!==129||recordSize<28||pointCount!==expectedPoints||offset>=v.byteLength)throw Error('LiDAR payload/header point coverage mismatch.');
  let cursor=227,compressed=false;
  for(let i=0;i<vlrCount;i++){
    if(cursor+54>offset)throw Error('Truncated LAS variable-length record.');
    const user=text(cursor+2,16),id=v.getUint16(cursor+18,true),length=v.getUint16(cursor+20,true);cursor+=54+length;
    if(cursor>offset)throw Error('Truncated LAS variable-length payload.');
    if(user==='laszip encoded'&&id===22204)compressed=true;
  }
  if(!compressed)throw Error('Missing LASzip compression declaration.');
  const scale=[0,1,2].map(i=>v.getFloat64(131+i*8,true)),origin=[0,1,2].map(i=>v.getFloat64(155+i*8,true)),bounds=[v.getFloat64(187,true),v.getFloat64(203,true),v.getFloat64(219,true),v.getFloat64(179,true),v.getFloat64(195,true),v.getFloat64(211,true)];
  if(!validBounds(bounds)||scale.some(n=>!Number.isFinite(n)||n<=0)||origin.some(n=>!Number.isFinite(n)))throw Error('Invalid LAS coordinate metadata.');
  return {version:'1.2',pointFormat:format&63,compressed:true,pointCount,recordSize,pointDataOffset:offset,vlrCount,scale,offset:origin,bounds};
}
async function readPayload(url,budget,signal){
  return withRequestTimeout(signal,ATTEMPT_TIMEOUT,async signal=>{
    const response=await fetch(url,{signal,cache:'no-store'});if(!response.ok)throw Error(`LiDAR HTTP ${response.status}`);
    return readBinaryResponse(response,budget,'LiDAR compressed-byte');
  });
}
export async function fetchLiDAR(source,bounds,signal,onRetry,decoderFactory=createLiDARDecoder,onProgress){
  const requests=[],responses=[],payloads=[],assets=[],get=async suffix=>{checkAbort(signal);const url=NYC_LIDAR_EPT+'/'+suffix;requests.push({url,method:'GET'});const data=await fetchJSON(url,{signal},onRetry);responses.push({url,data});return data;};let metadata=null,query=null;
  let decoder;
  try{
    query={nativeEnvelope:lidarEnvelope(bounds),horizontalCRS:'EPSG:6347',paddingMetres:LIDAR_QUERY_PADDING_METRES,method:'GRS80 UTM18N acquisition envelope with frame allowance; original point coordinates unchanged',resolution:'all intersecting hierarchy depths',cropped:false};
    metadata=await get('ept.json');validateEPT(metadata);
    const queue=['0-0-0-0'],visited=new Set(),nodes=new Map();
    while(queue.length){
      const root=queue.shift();if(visited.has(root))throw Error('Repeated EPT hierarchy page.');visited.add(root);if(visited.size>LIDAR_LIMITS.hierarchyPages)throw Error(`LiDAR hierarchy limit exceeded: ${visited.size} pages requested (limit ${LIDAR_LIMITS.hierarchyPages}). Choose a smaller area.`);
      const hierarchy=await get(`ept-hierarchy/${root}.json`);
      if(!hierarchy||typeof hierarchy!=='object'||Array.isArray(hierarchy)||!Number.isSafeInteger(hierarchy[root])||hierarchy[root]<=0)throw Error('Incomplete EPT hierarchy page.');
      for(const [key,count]of Object.entries(hierarchy)){
        if(!descendant(key,root)||!Number.isSafeInteger(count)||(count!==-1&&count<=0))throw Error('Invalid EPT hierarchy entry.');
        if(nodes.has(key)&&!(key===root&&nodes.get(key)===-1))throw Error('Conflicting EPT hierarchy identity.');
        nodes.set(key,count);
        if(count===-1&&intersects(eptNodeBounds(key,metadata.bounds),query.nativeEnvelope))queue.push(key);
      }
    }
    for(const key of nodes.keys()){
      const [depth,...indices]=keyParts(key);if(depth&&!nodes.has(`${depth-1}-${indices.map(v=>Math.floor(v/2)).join('-')}`))throw Error('Orphaned EPT hierarchy node.');
    }
    const selected=[...nodes].filter(([key,count])=>count>0&&intersects(eptNodeBounds(key,metadata.bounds),query.nativeEnvelope)).sort(([a],[b])=>a.localeCompare(b)),pointCount=selected.reduce((sum,[,count])=>sum+count,0);
    query.selectedAssets=selected.length;query.selectedPoints=pointCount;
    const overages=[];
    if(selected.length>LIDAR_LIMITS.assets)overages.push(`${selected.length} tiles requested (limit ${LIDAR_LIMITS.assets})`);
    if(pointCount>LIDAR_LIMITS.points)overages.push(`${pointCount} points requested (limit ${LIDAR_LIMITS.points})`);
    if(overages.length)throw Error(`LiDAR point/asset limit exceeded: ${overages.join('; ')}. Choose a smaller area. No partial source selected.`);
    onProgress?.({stage:'inventory',assets:selected.length,points:pointCount});
    // OriginId maps into the complete provider list. Keep its full records, including entries outside the selected area.
    const origins=await get('ept-sources/list.json');
    if(!Array.isArray(origins)||new Set(origins.map(s=>s.id)).size!==origins.length||origins.some(s=>!validBounds(s.bounds)||typeof s.id!=='string'||s.status!=='inserted'||!Number.isSafeInteger(s.points)||s.points<=0||s.inserts!==s.points))throw Error('Invalid EPT original-source inventory.');
    if(origins.reduce((sum,s)=>sum+s.points,0)!==metadata.points)throw Error('EPT original-source point inventory mismatch.');
    const sourceMetadata=new Map();
    for(const [index,origin]of origins.entries())if(intersects(origin.bounds,query.nativeEnvelope)){
      if(typeof origin.url!=='string'||!/^\d+\.json$/.test(origin.url))throw Error('Unsupported EPT original-source metadata URL.');
      if(!sourceMetadata.has(origin.url))sourceMetadata.set(origin.url,await get('ept-sources/'+origin.url));
      const detail=sourceMetadata.get(origin.url)?.[origin.id];
      if(!detail||detail.origin!==index||detail.points!==origin.points||JSON.stringify(detail.bounds)!==JSON.stringify(origin.bounds)||!detail.metadata||typeof detail.metadata!=='object')throw Error('EPT original-source metadata identity/coverage mismatch.');
    }
    const budget={bytes:0,limit:LIDAR_LIMITS.bytes};let decodedBytes=0;
    for(const [id,count]of selected){
      checkAbort(signal);const url=`${NYC_LIDAR_EPT}/ept-data/${id}.laz`;requests.push({url,method:'GET'});
      const buffer=await readPayload(url,budget,signal),raw={id,url,bytes:buffer.byteLength,binary:base64(buffer)};payloads.push(raw);
      const header=readLASHeader(buffer,count),nodeBounds=eptNodeBounds(id,metadata.bounds);
      if(header.bounds.some((v,i)=>i<3?v<nodeBounds[i]-header.scale[i]:v>nodeBounds[i]+header.scale[i-3]))throw Error('LAS point bounds exceed the EPT node envelope.');
      const checksum=await sha256(buffer);raw.sha256=checksum;
      const asset={id,url,pointCount:count,bytes:buffer.byteLength,sha256:checksum,bounds:nodeBounds,header};assets.push(asset);
      decoder??=await decoderFactory(signal);const decoded=await decoder.decode(buffer,header,origins.length,LIDAR_LIMITS.decodedBytes-decodedBytes);
      decodedBytes+=decoded.records.byteLength;
      const recordsSha256=await sha256(decoded.records);
      // The original LASzip tile contains every record. Keep validation evidence without a second cloud-sized archive.
      const {records,...summary}=decoded;
      asset.decoded={...summary,payloadId:id,encoding:'laszip',bytes:records.byteLength,sha256:recordsSha256,decoder:LIDAR_DECODER};
      checkAbort(signal);
      if(assets.length===1||assets.length%PROGRESS_ASSET_INTERVAL===0||assets.length===selected.length)onProgress?.({stage:'validated-tiles',completed:assets.length,total:selected.length,assetId:id,compressedBytes:budget.bytes,decodedBytes});
    }
    checkAbort(signal);
    return {sourceId:source.id,dataset:source.dataset,bounds,urls:requests.map(r=>r.url),requests,queryURL:NYC_LIDAR_EPT+'/ept.json',fetchedAt:new Date().toISOString(),metadata:{name:source.name,captureYear:2017,dataUpdatedAt:null,metadataUpdatedAt:null,spatialReference:metadata.srs,schema:metadata.schema,pointCount,bytes:budget.bytes,decodedBytes,pointDecoding:'validated; complete LASzip records retained; renderer decodes queried tiles',decoder:LIDAR_DECODER,query},raw:{metadata,responses,payloads,binaryEncoding:'base64'},data:{type:'FeatureCollection',features:[],assets}};
  }catch(cause){throw acquisitionError(cause,source,bounds,{requests,urls:requests.map(r=>r.url),query,data:{type:'FeatureCollection',features:[],assets},raw:{metadata,responses,payloads,binaryEncoding:'base64'}},signal);}
  finally{decoder?.dispose();}
}
