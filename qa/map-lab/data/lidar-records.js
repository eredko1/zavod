import {pointRecordView} from './las-point-records.js';
import {readLASHeader} from './lidar-ept.js';
import {unbase64,sha256} from './binary-archive.js';
import {checkAbort} from './request-abort.js';

// Validate portable archive references before decoding; never fetch a replacement tile for a damaged capture.
export async function archivedPointView(snapshot,asset,decoder,signal){
  checkAbort(signal);
  if(asset.decoded?.encoding==='base64'){
    const records=unbase64(asset.decoded.records);
    if(records.byteLength!==asset.decoded.bytes||records.byteLength!==asset.pointCount*asset.header.recordSize||asset.decoded.pointCount!==asset.pointCount||asset.decoded.recordSize!==asset.header.recordSize||await sha256(records)!==asset.decoded.sha256)throw Error('LiDAR decoded archive checksum/coverage mismatch: '+asset.id);
    checkAbort(signal);return pointRecordView(asset,records);
  }
  if(asset.decoded?.encoding!=='laszip')throw Error('Intersecting LiDAR asset has no decoded records: '+asset.id+'. Query the source again to acquire them.');
  const matches=snapshot.raw?.payloads?.filter(p=>p.id===asset.decoded.payloadId)||[],origins=snapshot.raw?.responses?.find(r=>r.url.endsWith('/ept-sources/list.json'))?.data;
  if(matches.length!==1||matches[0].id!==asset.id||matches[0].url!==asset.url||!Array.isArray(origins)||!origins.length)throw Error('Incomplete LiDAR archive reference: '+asset.id);
  const payload=matches[0],buffer=unbase64(payload.binary);
  if(buffer.byteLength!==payload.bytes||payload.bytes!==asset.bytes||payload.sha256!==asset.sha256||await sha256(buffer)!==asset.sha256)throw Error('LiDAR compressed archive checksum/coverage mismatch: '+asset.id);
  checkAbort(signal);
  const header=readLASHeader(buffer,asset.pointCount);
  if(Object.entries(header).some(([key,value])=>JSON.stringify(value)!==JSON.stringify(asset.header[key])))throw Error('LiDAR archived header mismatch: '+asset.id);
  const bytes=header.pointCount*header.recordSize;
  if(asset.decoded.bytes!==bytes)throw Error('LiDAR decoded archive coverage mismatch: '+asset.id);
  const worker=await decoder();checkAbort(signal);
  const decoded=await worker.decode(buffer,header,origins.length,bytes);
  if(await sha256(decoded.records)!==asset.decoded.sha256)throw Error('LiDAR decoded archive checksum mismatch: '+asset.id);
  checkAbort(signal);return pointRecordView({...asset,decoded},decoded.records);
}
