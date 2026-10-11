import {fetchJSON} from './api-request.js';
import {checkAbort} from './request-abort.js';
import {acquisitionError} from './acquisition-error.js';
import {ACQUISITION_LIMITS} from './acquisition-limits.js';

const BATCH_SIZE=500;
export async function fetchArcgisPointTable(source,bounds,signal,onRetry){
  const urls=[],requests=[],responses=[];
  const get=async(url,post=false)=>{
    checkAbort(signal);urls.push(url);
    const parsed=new URL(url),request={url:post?parsed.origin+parsed.pathname:url,method:post?'POST':'GET',...(post?{body:parsed.searchParams.toString()}:{})};
    requests.push(request);const data=await fetchJSON(request.url,{signal,method:request.method,...(post?{body:parsed.searchParams}:{})},onRetry);
    responses.push({request:{...request},data});if(data.error)throw Error(`ArcGIS API: ${data.error.message}`);return data;
  };
  const where=`Lat >= ${bounds.south} AND Lat <= ${bounds.north} AND Long >= ${bounds.west} AND Long <= ${bounds.east}`;
  const query=extra=>`${source.layer}/query?${new URLSearchParams({where,outFields:'*',returnGeometry:'false',f:'json',...extra})}`;
  try{
    const layer=await get(source.layer+'?f=json');
    const oid=layer.fields?.filter(field=>field.type==='esriFieldTypeOID');
    if(layer.type!=='Table'||layer.geometryType!==undefined||oid?.length!==1||oid[0].name!==source.idField||layer.objectIdField!==source.idField)throw Error('Unsupported ArcGIS point-table schema.');
    for(const name of source.requiredFields)if(!layer.fields.some(field=>field.name===name))throw Error('Missing ArcGIS field '+name);
    for(const name of ['Lat','Long'])if(layer.fields.find(field=>field.name===name)?.type!=='esriFieldTypeDouble')throw Error('Invalid ArcGIS coordinate field '+name);
    const idResponse=await get(query({returnIdsOnly:'true'}));let inventory=idResponse.objectIds;
    if(idResponse.objectIdFieldName!==undefined&&idResponse.objectIdFieldName!==source.idField)throw Error('Unexpected ArcGIS object ID field.');
    if(inventory===null){
      if(idResponse.objectIdFieldName!==source.idField)throw Error('Invalid ArcGIS empty object ID response.');
      const count=await get(query({returnCountOnly:'true'}));if(count.count!==0)throw Error('Unconfirmed empty ArcGIS object inventory.');inventory=[];
    }
    if(!Array.isArray(inventory)||inventory.some(id=>!Number.isSafeInteger(id)||id<0)||new Set(inventory).size!==inventory.length)throw Error('Invalid ArcGIS object ID list.');
    const ids=[...inventory].sort((a,b)=>a-b);
    if(ids.length>ACQUISITION_LIMITS.vectorRecords)throw Error(`More than ${ACQUISITION_LIMITS.vectorRecords.toLocaleString('en-US')} ${source.name} records; choose a smaller area.`);
    const features=[];
    for(let offset=0;offset<ids.length;offset+=BATCH_SIZE){
      const batch=ids.slice(offset,offset+BATCH_SIZE),data=await get(query({objectIds:batch.join(',')}),true);
      if(!Array.isArray(data.features)||data.exceededTransferLimit||data.features.length!==batch.length)throw Error('Incomplete ArcGIS table response.');
      const seen=new Set();
      for(const row of data.features){
        const attributes=row.attributes,id=attributes?.[source.idField],lat=attributes?.Lat,lon=attributes?.Long;
        if(!attributes||typeof attributes!=='object'||Array.isArray(attributes)||Object.keys(attributes).length!==layer.fields.length||layer.fields.some(field=>!Object.hasOwn(attributes,field.name)))throw Error('Incomplete ArcGIS table attributes.');
        if(!Number.isSafeInteger(id)||!batch.includes(id)||seen.has(id))throw Error('Unexpected or duplicate ArcGIS table identity.');
        if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<bounds.south||lat>bounds.north||lon<bounds.west||lon>bounds.east)throw Error('Invalid or out-of-area ArcGIS table coordinates.');
        if(Object.keys(row).some(key=>key!=='attributes'))throw Error('Unexpected ArcGIS table geometry.');
        seen.add(id);features.push({type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},properties:attributes});
      }
      if(seen.size!==batch.length)throw Error('Incomplete ArcGIS table object coverage.');
    }
    return {sourceId:source.id,dataset:source.dataset,bounds,urls,requests,queryURL:query(),fetchedAt:new Date().toISOString(),metadata:{name:layer.name,sourceURL:source.layer,coordinateRole:'reported table latitude/longitude',dataUpdatedAt:layer.editingInfo?.dataLastEditDate?new Date(layer.editingInfo.dataLastEditDate).toISOString():null},raw:{layer,responses},data:{type:'FeatureCollection',features}};
  }catch(cause){throw acquisitionError(cause,source,bounds,{urls,requests,raw:{responses}},signal);}
}
