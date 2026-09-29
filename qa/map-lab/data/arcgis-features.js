import {fetchJSON} from './api-request.js';
import {checkAbort} from './request-abort.js';
import {sourceNumber} from './source-number.js';
import {acquisitionError} from './acquisition-error.js';
import {ACQUISITION_LIMITS} from './acquisition-limits.js';

export const ARCGIS_LIMITS=Object.freeze({features:ACQUISITION_LIMITS.vectorRecords,batch:500});
const GEOJSON_TYPES={esriGeometryPolygon:['Polygon','MultiPolygon'],esriGeometryPolyline:['LineString','MultiLineString'],esriGeometryPoint:['Point']};
// ArcGIS can print one esriFieldTypeSingle as rounded decimal JSON and float32 GeoJSON.
const sameAttribute=(native,geographic,type)=>native===geographic||(type==='esriFieldTypeSingle'&&Number.isFinite(native)&&Number.isFinite(geographic)&&Number.isFinite(Math.fround(native))&&Math.fround(native)===Math.fround(geographic));
export function arcgisURL(source,bounds,extra={}){
  return `${source.layer}/query?${new URLSearchParams({where:'1=1',geometry:JSON.stringify({xmin:bounds.west,ymin:bounds.south,xmax:bounds.east,ymax:bounds.north,spatialReference:{wkid:4326}}),geometryType:'esriGeometryEnvelope',inSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:'*',outSR:'4326',returnGeometry:'true',returnZ:'true',returnM:'true',f:'geojson',...extra})}`;
}
export async function fetchArcgisFeatures(source,bounds,signal,onRetry){
  const urls=[],requests=[],responses=[],get=async(url,post=false)=>{
    checkAbort(signal);urls.push(url);const parsed=new URL(url),target=post?`${parsed.origin}${parsed.pathname}`:url,request={url:target,method:post?'POST':'GET',...(post?{body:parsed.searchParams.toString()}:{})};requests.push(request);
    const data=await fetchJSON(target,{signal,method:request.method,...(post?{body:parsed.searchParams}:{})},onRetry);responses.push({request:{...request},data});if(data.error)throw Error(`ArcGIS API: ${data.error.message}`);return data;
  };
  try{
  const layer=await get(source.layer+'?f=json');
  const oidFields=Array.isArray(layer.fields)?layer.fields.filter(f=>f.type==='esriFieldTypeOID'):[];
  const fieldTypes=new Map((Array.isArray(layer.fields)?layer.fields:[]).map(f=>[f.name,f.type]));
  if(layer.geometryType!==source.geometryType||oidFields.length!==1||oidFields[0].name!==source.idField||(layer.objectIdField!==undefined&&layer.objectIdField!==source.idField))throw Error('Unsupported ArcGIS layer schema.');
  for(const name of source.requiredFields)if(!layer.fields.some(f=>f.name===name))throw Error('Missing ArcGIS field '+name);
  const nativeSR=layer.extent?.spatialReference;
  if(source.nativeGeometry&&(!Number.isSafeInteger(nativeSR?.wkid)||layer.hasZ!==source.nativeHasZ))throw Error('Unsupported native ArcGIS coordinate schema.');
  const ids=await get(arcgisURL(source,bounds,{returnIdsOnly:'true',returnGeometry:'false',f:'json'}));let inventory=ids.objectIds;
  if(ids.objectIdFieldName!==undefined&&ids.objectIdFieldName!==source.idField)throw Error('Unexpected ArcGIS object ID field.');
  // These services return null for empty selections; independently verify the empty inventory.
  if(inventory===null){
    if(ids.objectIdFieldName!==source.idField)throw Error('Invalid ArcGIS empty object ID response.');
    const count=await get(arcgisURL(source,bounds,{returnCountOnly:'true',returnGeometry:'false',f:'json'}));
    if(count.count!==0)throw Error('Unconfirmed empty ArcGIS object inventory.');inventory=[];
  }
  if(!Array.isArray(inventory)||inventory.some(id=>!Number.isSafeInteger(id)||id<0)||new Set(inventory).size!==inventory.length)throw Error('Invalid ArcGIS object ID list.');
  const objectIds=[...inventory].sort((a,b)=>a-b);if(objectIds.length>ARCGIS_LIMITS.features)throw Error(`More than ${ARCGIS_LIMITS.features.toLocaleString('en-US')} ${source.name} records; choose a smaller area.`);
  const features=[];
  for(let i=0;i<objectIds.length;i+=ARCGIS_LIMITS.batch){
    const batch=objectIds.slice(i,i+ARCGIS_LIMITS.batch),native=await get(arcgisURL(source,bounds,{objectIds:batch.join(','),f:'json',returnTrueCurves:'true',...(source.nativeGeometry?{outSR:String(nativeSR.wkid)}:{})}),true);
    if(source.nativeGeometry&&![nativeSR.wkid,nativeSR.latestWkid].filter(Number.isSafeInteger).includes(native.spatialReference?.wkid))throw Error('Unexpected native ArcGIS coordinate reference.');
    if(!Array.isArray(native.features)||native.exceededTransferLimit||native.features.length!==batch.length||new Set(native.features.map(f=>f.attributes?.[source.idField])).size!==batch.length||native.features.some(f=>!batch.includes(f.attributes?.[source.idField])))throw Error('Incomplete native ArcGIS object coverage.');
    const nativeAttributes=new Map(native.features.map(f=>[f.attributes[source.idField],f.attributes]));
    const data=await get(arcgisURL(source,bounds,{objectIds:batch.join(',')}),true);
    if(data.type!=='FeatureCollection'||!Array.isArray(data.features)||data.exceededTransferLimit)throw Error('Incomplete ArcGIS geometry response.');
    const returned=new Set();
    for(const raw of data.features){
      const f=structuredClone(raw);if(!GEOJSON_TYPES[source.geometryType]?.includes(f.geometry?.type))throw Error('Unexpected ArcGIS feature geometry.');if(!f.properties||typeof f.properties!=='object'||Array.isArray(f.properties))throw Error('Missing ArcGIS feature properties.');if(f.properties[source.idField]===undefined&&f.id!==undefined)f.properties[source.idField]=f.id;const id=sourceNumber(f.properties[source.idField]);if(!Number.isSafeInteger(id)||!batch.includes(id)||returned.has(id))throw Error('Unexpected or duplicate ArcGIS feature identity.');
      // Paired formats are separate live reads; matching IDs alone cannot prove matching observations.
      const attributes=nativeAttributes.get(id),keys=new Set([...Object.keys(attributes),...Object.keys(f.properties)]);
      for(const key of keys)if(!Object.hasOwn(attributes,key)||!Object.hasOwn(f.properties,key)||!sameAttribute(attributes[key],f.properties[key],fieldTypes.get(key)))throw Error(`Conflicting ArcGIS native/GeoJSON property ${key} for object ${id}; source snapshot rejected.`);
      returned.add(id);features.push(f);
    }
    if(returned.size!==batch.length)throw Error('Incomplete ArcGIS object coverage; source snapshot rejected.');
  }
  return {sourceId:source.id,dataset:source.dataset,bounds,urls,requests,queryURL:arcgisURL(source,bounds),fetchedAt:new Date().toISOString(),metadata:{name:layer.name,dataUpdatedAt:layer.editingInfo?.dataLastEditDate?new Date(layer.editingInfo.dataLastEditDate).toISOString():null,metadataUpdatedAt:layer.editingInfo?.schemaLastEditDate?new Date(layer.editingInfo.schemaLastEditDate).toISOString():null,...(source.captureYear===undefined?{}:{captureYear:source.captureYear}),...(source.verticalCRS===undefined?{}:{verticalCRS:source.verticalCRS}),...(source.elevationUnit===undefined?{}:{elevationUnit:source.elevationUnit}),sourceURL:source.layer,hasZ:layer.hasZ,hasM:layer.hasM,spatialReference:layer.extent?.spatialReference},raw:{layer,responses},data:{type:'FeatureCollection',features}};
  }catch(cause){throw acquisitionError(cause,source,bounds,{urls,requests,raw:{responses}},signal);}
}
