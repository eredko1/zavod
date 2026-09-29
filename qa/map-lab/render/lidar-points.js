import {archivedPointView} from '../data/lidar-records.js';
import {createLiDARDecoder} from '../data/lidar-decoder.js';
import {checkAbort} from '../data/request-abort.js';

export const POINT_QUERY_RULES=Object.freeze({batchSize:8192,maxResults:100000});
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
const intersects=(a,b)=>[0,1,2].every(i=>a[i]<=b[i+3]&&a[i+3]>=b[i]);
function filter(values,maximum,name){
  if(values===undefined)return null;
  if(!Array.isArray(values))throw Error('Invalid LiDAR '+name+' filter.');
  for(const value of values)if(!Number.isInteger(value)||value<0||value>maximum)throw Error('Invalid LiDAR '+name+' filter.');
  return new Set(values);
}
// Renderer-side selection of measured records. Native bounds are mandatory: no guessed geographic/datum transform.
export async function queryLiDARPoints(snapshot,{bounds,classes,originIds,limit=POINT_QUERY_RULES.maxResults,signal}={},decoderFactory=createLiDARDecoder){
  if(!Array.isArray(bounds)||bounds.length!==6||!bounds.every(Number.isFinite)||![0,1,2].every(i=>bounds[i]<=bounds[i+3]))throw Error('LiDAR query requires finite native XYZ bounds.');
  if(!Number.isInteger(limit)||limit<1||limit>POINT_QUERY_RULES.maxResults)throw Error('Invalid LiDAR result limit.');
  if(!Array.isArray(snapshot?.data?.assets)||!snapshot.metadata?.spatialReference)throw Error('LiDAR query requires a captured point source and its coordinate reference.');
  const selectedClasses=filter(classes,31,'classification'),selectedOrigins=filter(originIds,0xffffffff,'origin'),points=[],assets=[],classifications={};let examined=0;
  bounds=[...bounds];classes=classes===undefined?undefined:[...classes];originIds=originIds===undefined?undefined:[...originIds];
  checkAbort(signal);let decoder;
  try{
  for(const asset of snapshot.data.assets){
    checkAbort(signal);if(!intersects(asset.header.bounds,bounds))continue;
    await pause();checkAbort(signal);const view=await archivedPointView(snapshot,asset,async()=>decoder??=await decoderFactory(signal),signal);let matched=0;
    for(let index=0;index<view.count;index++){
      if(index%POINT_QUERY_RULES.batchSize===0){await pause();checkAbort(signal);}
      examined++;const classification=view.classification(index);if(selectedClasses&&!selectedClasses.has(classification))continue;
      if(selectedOrigins&&!selectedOrigins.has(view.originId(index)))continue;
      const xyz=view.xyz(index);if(!xyz.every((v,i)=>v>=bounds[i]&&v<=bounds[i+3]))continue;
      if(points.length===limit)throw Error('LiDAR result limit exceeded; narrow the native bounds or filters. No truncated result returned.');
      const point=view.point(index);
      // A small selection must not retain an entire decoded tile through a subarray backing buffer.
      points.push({assetId:asset.id,index,...point,record:point.record.slice(),extraBytes:point.extraBytes.slice()});matched++;classifications[classification]=(classifications[classification]||0)+1;
    }
    assets.push({id:asset.id,sha256:asset.sha256,recordsSha256:asset.decoded.sha256,examined:view.count,matched});
  }
  checkAbort(signal);
  return {sourceId:snapshot.sourceId,fetchedAt:snapshot.fetchedAt,spatialReference:structuredClone(snapshot.metadata.spatialReference),bounds:[...bounds],filters:{classes:classes===undefined?null:[...classes],originIds:originIds===undefined?null:[...originIds]},examined,matched:points.length,classifications,assets,points};
  }finally{decoder?.dispose();}
}
