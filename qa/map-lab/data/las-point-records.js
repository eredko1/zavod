// LAS 1.2 format 1 is the delivered layout; EPT schema order is not its byte layout.
const POINT_BYTES=28,POINT_FORMAT=1,HEADER_BYTES=227,ORIGIN_TYPE=5;
const VLR={bytes:54,user:2,userLength:16,id:18,length:20};
const EXTRA={bytes:192,type:2,options:3,name:4,nameLength:32};
const POINT={coordinateBytes:4,intensity:12,returns:14,classification:15,scanAngle:16,user:17,source:18,gpsTime:20};
const TYPE_BYTES=[0,1,1,2,2,4,4,8,8,4,8];
const text=(bytes,start,length)=>new TextDecoder().decode(bytes.subarray(start,start+length)).replace(/\0+$/,'');
// Logs/compiler metadata identify the records; complete bytes stay on the original observation.
export function pointRecordSummary({records,...summary}){return summary;}
export function lasExtraDimensions(buffer,header){
  const bytes=new Uint8Array(buffer),view=new DataView(buffer),dimensions=[];let cursor=HEADER_BYTES,offset=POINT_BYTES;
  for(let i=0;i<header.vlrCount;i++){
    const user=text(bytes,cursor+VLR.user,VLR.userLength),id=view.getUint16(cursor+VLR.id,true),length=view.getUint16(cursor+VLR.length,true);cursor+=VLR.bytes;
    if(user==='LASF_Spec'&&id===4){
      if(length%EXTRA.bytes)throw Error('Invalid LAS extra-dimension descriptors.');
      for(let end=cursor+length;cursor<end;cursor+=EXTRA.bytes){
        const dataType=view.getUint8(cursor+EXTRA.type),options=view.getUint8(cursor+EXTRA.options),name=text(bytes,cursor+EXTRA.name,EXTRA.nameLength),components=dataType?Math.ceil(dataType/10):1,type=dataType?(dataType-1)%10+1:0,size=dataType?TYPE_BYTES[type]*components:options;
        if(dataType>30||!size||!name||dimensions.some(d=>d.name===name))throw Error('Unsupported LAS extra dimension.');
        dimensions.push({name,dataType,options,offset,size,descriptor:Array.from(bytes.subarray(cursor,cursor+EXTRA.bytes))});offset+=size;
      }
    }else cursor+=length;
  }
  if(offset!==header.recordSize)throw Error('LAS extra dimensions do not cover the point record.');
  return dimensions;
}
export function decodeLASRecords(decoder,buffer,header,originCount,maxBytes){
  if(header.pointFormat!==POINT_FORMAT||!Number.isSafeInteger(header.pointCount)||header.pointCount<=0||!Number.isInteger(header.recordSize)||header.recordSize<POINT_BYTES||!Number.isSafeInteger(originCount)||originCount<=0||!Number.isSafeInteger(maxBytes)||maxBytes<0)throw Error('Unsupported LAS decoding contract.');
  const size=header.pointCount*header.recordSize;
  if(!Number.isSafeInteger(size)||size>maxBytes)throw Error(`LiDAR decoded-byte limit exceeded: ${size} bytes needed for this tile, ${maxBytes} bytes remaining. Choose a smaller area.`);
  const dimensions=lasExtraDimensions(buffer,header),origin=dimensions.find(d=>d.name==='OriginId');
  if(origin?.dataType!==ORIGIN_TYPE)throw Error('Unsupported LAS OriginId layout.');
  const reader=new decoder.LASZip();let file=0,point=0;
  try{
    file=decoder._malloc(buffer.byteLength);point=decoder._malloc(header.recordSize);if(!file||!point)throw Error('LiDAR decoder allocation failed.');
    decoder.HEAPU8.set(new Uint8Array(buffer),file);reader.open(file,buffer.byteLength);
    if(reader.getCount()!==header.pointCount||reader.getPointFormat()!==header.pointFormat||reader.getPointLength()!==header.recordSize)throw Error('Decoded LAS header coverage mismatch.');
    const records=new Uint8Array(size),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],classes={};
    for(let i=0;i<header.pointCount;i++){
      reader.getPoint(point);const view=new DataView(decoder.HEAPU8.buffer,point,header.recordSize);
      for(let axis=0;axis<3;axis++){const value=view.getInt32(axis*POINT.coordinateBytes,true)*header.scale[axis]+header.offset[axis];if(!Number.isFinite(value)||value<header.bounds[axis]-header.scale[axis]||value>header.bounds[axis+3]+header.scale[axis])throw Error('Decoded LAS point exceeds its header envelope.');min[axis]=Math.min(min[axis],value);max[axis]=Math.max(max[axis],value);}
      if(view.getUint32(origin.offset,true)>=originCount)throw Error('Decoded LAS point has an unknown OriginId.');
      const classification=view.getUint8(POINT.classification)&31;classes[classification]=(classes[classification]||0)+1;
      records.set(decoder.HEAPU8.subarray(point,point+header.recordSize),i*header.recordSize);
    }
    return {records:records.buffer,pointCount:header.pointCount,pointFormat:header.pointFormat,recordSize:header.recordSize,extraDimensions:dimensions,bounds:[...min,...max],classifications:classes};
  }finally{reader.delete();if(point)decoder._free(point);if(file)decoder._free(file);}
}
export function pointRecordView(asset,records){
  if((records===undefined&&asset.decoded?.encoding!=='base64')||asset.header.pointFormat!==POINT_FORMAT)throw Error('No supported decoded LAS records.');
  if(records!==undefined&&!(records instanceof ArrayBuffer))throw Error('Unsupported decoded LAS record buffer.');
  const bytes=records===undefined?Uint8Array.from(atob(asset.decoded.records),character=>character.charCodeAt(0)):new Uint8Array(records);
  if(bytes.length!==asset.header.pointCount*asset.header.recordSize)throw Error('Decoded LAS record coverage mismatch.');
  const view=new DataView(bytes.buffer),header=asset.header,origin=asset.decoded.extraDimensions.find(d=>d.name==='OriginId');
  if(origin?.dataType!==ORIGIN_TYPE)throw Error('Unsupported decoded LAS OriginId layout.');
  const offsetOf=index=>{
    if(!Number.isInteger(index)||index<0||index>=header.pointCount)throw Error('LAS point index is outside the payload.');
    return index*header.recordSize;
  },xyzAt=offset=>header.scale.map((scale,axis)=>view.getInt32(offset+axis*POINT.coordinateBytes,true)*scale+header.offset[axis]);
  return {count:header.pointCount,extraDimensions:asset.decoded.extraDimensions,
    xyz:index=>xyzAt(offsetOf(index)),classification:index=>view.getUint8(offsetOf(index)+POINT.classification)&31,originId:index=>view.getUint32(offsetOf(index)+origin.offset,true),point(index){
    const offset=offsetOf(index),returns=view.getUint8(offset+POINT.returns),classification=view.getUint8(offset+POINT.classification);
    return {xyz:xyzAt(offset),intensity:view.getUint16(offset+POINT.intensity,true),returnNumber:returns&7,numberOfReturns:(returns>>3)&7,scanDirectionFlag:(returns>>6)&1,edgeOfFlightLine:returns>>7,classification:classification&31,classificationFlags:classification>>5,scanAngleRank:view.getInt8(offset+POINT.scanAngle),userData:view.getUint8(offset+POINT.user),pointSourceId:view.getUint16(offset+POINT.source,true),gpsTime:view.getFloat64(offset+POINT.gpsTime,true),originId:view.getUint32(offset+origin.offset,true),extraBytes:bytes.subarray(offset+POINT_BYTES,offset+header.recordSize),record:bytes.subarray(offset,offset+header.recordSize)};
  }};
}
