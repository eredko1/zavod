import {fetchJSON} from './api-request.js';
import {checkAbort} from './request-abort.js';
import {sourceNumber} from './source-number.js';
import {acquisitionError} from './acquisition-error.js';
import {ACQUISITION_LIMITS} from './acquisition-limits.js';

export const MTA_STATIONS_ROOT='https://data.ny.gov';
const RECORD_LIMIT=ACQUISITION_LIMITS.vectorRecords;
const ID_BATCH_LIMIT=100;
const INVENTORY_PAGE_SIZE=1000;
const PROFILES={
  'mta-stations':{latitude:'gtfs_latitude',longitude:'gtfs_longitude',role:'GTFS station centroid',fields:{station_id:'number',complex_id:'number',gtfs_stop_id:'text',gtfs_latitude:'number',gtfs_longitude:'number',structure:'text'}},
  'mta-entrances':{latitude:'entrance_latitude',longitude:'entrance_longitude',role:'Reported entrance location',fields:{station_id:'text',complex_id:'text',gtfs_stop_id:'text',entrance_latitude:'number',entrance_longitude:'number',entrance_type:'text',entry_allowed:'text',exit_allowed:'text'}}
};
export function stationURL(source,bounds,extra={}){
  const profile=PROFILES[source.id];if(!profile)throw Error('Unknown MTA coordinate source.');
  const where=`${profile.latitude} between ${bounds.south} and ${bounds.north} AND ${profile.longitude} between ${bounds.west} and ${bounds.east}`;
  return `${MTA_STATIONS_ROOT}/resource/${source.dataset}.json?${new URLSearchParams({$where:where,$order:source.idField,$limit:String(INVENTORY_PAGE_SIZE),...extra})}`;
}
export async function fetchStations(source,bounds,signal,onRetry){
  const requests=[],responses=[],get=async url=>{checkAbort(signal);requests.push({url,method:'GET'});const data=await fetchJSON(url,{signal},onRetry);responses.push({url,data});return data;};
  try{
    const profile=PROFILES[source.id];if(!profile)throw Error('Unknown MTA coordinate source.');
    const systemID=source.idField===':id',identity=row=>systemID?row[':id']:sourceNumber(row[source.idField]);
    const metadata=await get(`${MTA_STATIONS_ROOT}/api/views/${source.dataset}.json`);
    if(metadata.id!==source.dataset||!Array.isArray(metadata.columns)||Object.entries(profile.fields).some(([name,type])=>!metadata.columns.some(c=>c.fieldName===name&&c.dataTypeName===type)))throw Error('Unsupported MTA station schema.');
    const inventory=[];
    for(let offset=0;offset<=RECORD_LIMIT;offset+=INVENTORY_PAGE_SIZE){
      const limit=Math.min(INVENTORY_PAGE_SIZE,RECORD_LIMIT-offset+1),page=await get(stationURL(source,bounds,{$select:source.idField,$limit:String(limit),$offset:String(offset)}));
      if(!Array.isArray(page)||page.length>limit||offset+page.length>RECORD_LIMIT)throw Error('Incomplete MTA station inventory; choose a smaller area.');
      inventory.push(...page);if(page.length<limit)break;
    }
    const ids=inventory.map(identity),idSet=new Set(ids);
    if(ids.some(id=>systemID?typeof id!=='string'||!/^row-[a-z0-9_.~-]+$/.test(id):!Number.isSafeInteger(id)||id<0)||idSet.size!==ids.length)throw Error('Invalid MTA station identifiers.');
    const rows=[];
    for(let offset=0;offset<ids.length;offset+=ID_BATCH_LIMIT){
      const batch=ids.slice(offset,offset+ID_BATCH_LIMIT),records=await get(stationURL(source,bounds,{$where:`${source.idField} in (${batch.map(id=>systemID?`'${id}'`:id).join(',')})`,$select:'*, :id',$limit:String(batch.length+1)}));
      if(!Array.isArray(records)||records.length!==batch.length)throw Error('Incomplete MTA station records.');
      if(records.some(row=>!batch.includes(identity(row))))throw Error('Invalid MTA station identity.');rows.push(...records);
    }
    if(!Array.isArray(rows)||rows.length!==ids.length||new Set(rows.map(identity)).size!==ids.length)throw Error('Incomplete MTA station records.');
    const features=rows.map(row=>{
      const id=identity(row),lat=sourceNumber(row[profile.latitude]),lon=sourceNumber(row[profile.longitude]);
      if(!idSet.has(id)||lat===null||lon===null||Math.abs(lat)>90||Math.abs(lon)>180||typeof row.gtfs_stop_id!=='string'||!row.gtfs_stop_id.trim())throw Error('Invalid MTA station identity or centroid.');
      // Supplied coordinates have a documented role; retain georeference unchanged as an alternative field.
      return {type:'Feature',properties:{...row},geometry:{type:'Point',coordinates:[lon,lat]}};
    });
    return {sourceId:source.id,dataset:source.dataset,bounds,urls:requests.map(r=>r.url),requests,queryURL:stationURL(source,bounds),fetchedAt:new Date().toISOString(),metadata:{name:metadata.name,dataUpdatedAt:metadata.rowsUpdatedAt?new Date(metadata.rowsUpdatedAt*1000).toISOString():null,metadataUpdatedAt:metadata.viewLastModified?new Date(metadata.viewLastModified*1000).toISOString():null,coordinateRole:profile.role},raw:{metadata,responses},data:{type:'FeatureCollection',features}};
  }catch(cause){throw acquisitionError(cause,source,bounds,{requests,urls:requests.map(r=>r.url),raw:{responses}},signal);}
}
