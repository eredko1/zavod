import {checkAbort} from './request-abort.js';
export const LIDAR_DECODER=Object.freeze({name:'laz-perf',version:'0.0.7',recordEncoding:'LAS 1.2 format 1, little endian, full records',source:'https://github.com/hobuinc/laz-perf/tree/d0d3047e05221421fa0b02b3da4e93797edb2c52'});
export function createLiDARDecoder(signal){
  checkAbort(signal);const worker=new Worker(new URL('./lidar-decode-worker.js',import.meta.url));let pending=null,disposed=false;
  const finish=(error,result)=>{const request=pending;pending=null;if(request)error?request.reject(error):request.resolve(result);};
  const dispose=()=>{if(disposed)return;disposed=true;signal?.removeEventListener('abort',abort);worker.terminate();finish(Error('LiDAR decoder disposed.'));};
  const abort=()=>{finish(signal.reason||new DOMException('LiDAR decoding cancelled','AbortError'));dispose();};
  signal?.addEventListener('abort',abort,{once:true});
  worker.onerror=event=>{finish(Error(event.message));dispose();};worker.onmessageerror=()=>{finish(Error('Decoded LiDAR records could not be deserialized.'));dispose();};
  worker.onmessage=({data})=>finish(data.error?Error(data.error):null,data.result);
  return {decode(buffer,header,originCount,maxBytes){checkAbort(signal);if(disposed||pending)throw Error('LiDAR decoder unavailable or already active.');return new Promise((resolve,reject)=>{pending={resolve,reject};try{worker.postMessage({buffer,header,originCount,maxBytes},[buffer]);}catch(error){finish(error);dispose();}});},dispose};
}
