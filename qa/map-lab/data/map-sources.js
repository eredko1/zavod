import { fetchJSON } from './api-request.js';
import { withRequestTimeout } from './request-abort.js';
import {sourceGeometryError} from './source-geometry.js';
import {sourceNumber} from './source-number.js';
import {NYC_MESH_LAYER,fetchBuildingMeshes} from './nyc-building-mesh.js';
import {arcgisURL,fetchArcgisFeatures} from './arcgis-features.js';
import {fetchArcgisPointTable} from './arcgis-point-table.js';
import {acquisitionError} from './acquisition-error.js';
import {MTA_STATIONS_ROOT,stationURL,fetchStations} from './mta-stations.js';
import {NYC_LIDAR_EPT,fetchLiDAR} from './lidar-ept.js';
import {PLANIMETRIC_SOURCES} from './nyc-planimetrics.js';
import {ACQUISITION_LIMITS} from './acquisition-limits.js';
export const SOCRATA_LIMITS=Object.freeze({records:ACQUISITION_LIMITS.vectorRecords,page:1000});
const LION_BATCH_SIZE=500;
// Source IDs are stable provenance keys. Dataset updates and imagery capture dates are different.
export const LION_LAYER = 'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/LION/FeatureServer/0';
export const WATER_TANK_LAYER='https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services/Water_Tank_2022/FeatureServer/27';
export const NYSDOT_RAMP_LAYER='https://gis.dot.ny.gov/hostingny/rest/services/Geocortex/HDSV/MapServer/7';
export const NYSDOT_ROADWAY_LAYER='https://gis.dot.ny.gov/hostingny/rest/services/Roadways/Roadway/FeatureServer/3';
export const NYSDOT_BRIDGE_LAYER='https://gis.dot.ny.gov/hostingny/rest/services/Asset/NYSDOT_Structures/FeatureServer/0';
export const NYSDOT_OVERHEAD_SIGN_LAYER='https://gis.dot.ny.gov/hostingny/rest/services/Asset/NYSDOT_Structures/FeatureServer/2';
export const NYSDOT_HEIGHT_RESTRICTED_BRIDGE_LAYER='https://gis.dot.ny.gov/hostingny/rest/services/Geocortex/osowscreen_hoocs/MapServer/2';
export const USDOT_NBI_LAYER='https://geo.dot.gov/server/rest/services/Hosted/National_Bridge_Inventory/FeatureServer/0';
export const NYSDOT_BRIDGE_ROADWAY_TABLE='https://gis.dot.ny.gov/hostingny/rest/services/Roadways/SMS_Roadway_Inventory/FeatureServer/0';
export const datasetURL = dataset => {const source=NYC_SOURCES.find(s=>s.dataset===dataset);return source?.catalogURL||source?.layer||(dataset==='NYC-2014-I3S'?NYC_MESH_LAYER:`https://data.cityofnewyork.us/d/${dataset}`);};
export const NYC_SOURCES = [
  { id: 'nyc-roadbed', dataset: 'i36f-5ih7', name: 'NYC roadbeds', color: '#829cbb', kind: 'roadbed' },
  { id: 'nyc-sidewalk', dataset: '52n9-sdep', name: 'NYC sidewalks', color: '#f5ddb0', kind: 'sidewalk' },
  { id: 'nyc-median', dataset: 'ees7-4ufv', name: 'NYC medians (painted + raised)', color: '#a3d8a0', kind: 'median' },
  { id: 'nyc-curbs', dataset: '5xvt-8cbk', name: 'NYC curbs', color: '#ebc18a', kind: 'curb' },
  { id: 'nyc-pavement', dataset: 'vs44-rznx', name: 'NYC pavement edges', color: '#afb9cb', kind: 'line' },
  { id: 'nyc-buildings', dataset: '5zhs-2jue', name: 'NYC building footprints', color: '#d8ae8e', kind: 'building', idField: 'doitt_id' },
  { id:'nyc-building-grade',dataset:'bsin-59hv',name:'NYC building grade and floor observations',color:'#d5b6a2',kind:'building-grade-inventory',idField:'bin',sourceRole:'building-grade-and-floor',elevationUnit:'feet' },
  { id: 'nyc-buildings-2014', dataset: 'NYC-2014-I3S', name: 'NYC 2014 building and roof meshes', color: '#e2a878', kind: 'building-mesh', idField: 'objectid', api:'i3s' },
  { id:'nyc-water-tanks',dataset:'NYC-WATER-TANK-2022',name:'NYC 2022 rooftop water tanks',color:'#b6a289',kind:'roof-equipment',idField:'OBJECTID',api:'arcgis-features',layer:WATER_TANK_LAYER,geometryType:'esriGeometryPolygon',requiredFields:['BIN','BASE_ELEVATION','TOP_ELEVATION','HEIGHT','FEATURE_CODE','SUB_FEATURE_CODE','GlobalID'],captureYear:2022,verticalCRS:'NAVD88',elevationUnit:'feet',captureRules:'https://github.com/CityOfNewYork/nyc-planimetrics/blob/main/Capture_Rules.md#water-tank' },
  { id: 'nyc-trees', dataset: 'hn5i-inap', name: 'NYC forestry tree points', color: '#89c79a', kind: 'tree', idField: 'objectid', geometryField: 'location' },
  { id: 'nyc-lion', dataset: 'LION', name: 'NYC LION street network', color: '#e9a4ad', kind: 'lion', idField: 'OBJECTID', api: 'arcgis', layer: LION_LAYER },
  { id: 'nyc-elevation', dataset: '9uxf-ng6q', name: 'NYC elevation samples', color: '#c2a1de', kind: 'elevation' },
  { id: 'nyc-transport', dataset: 'r9cu-9r7b', name: 'NYC bridges and transport structures', color: '#dfad83', kind: 'transport' },
  { id: 'nyc-railroad', dataset: 'anc7-97cy', name: 'NYC railroad lines', color: '#d6bdd5', kind: 'railroad' },
  { id: 'nyc-rail-structures', dataset: 'dwer-xbgx', name: 'NYC stations and rail structures', color: '#b6a5d5', kind: 'rail-structures' },
  { id: 'nyc-retaining-walls', dataset: 's2pi-ccum', name: 'NYC retaining walls', color: '#c4a895', kind: 'retaining-walls' },
  { id: 'nyc-boardwalk', dataset: 'p9cw-7gsv', name: 'NYC boardwalks', color: '#d6bb91', kind: 'boardwalk' },
  { id: 'nyc-shoreline', dataset: '59xk-wagz', name: 'NYC shoreline', color: '#82c8cf', kind: 'shoreline' },
  { id: 'nyc-hydro-structures', dataset: '6hbv-tek4', name: 'NYC piers, jetties and seawalls', color: '#a9bfc3', kind: 'hydro-structures' },
  { id: 'nyc-hydrography', dataset: 'pjs3-c3z5', name: 'NYC water and beach areas', color: '#81afc8', kind: 'hydrography' },
  {id:'nysdot-ramps',dataset:'NYSDOT-STATE-RAMP',name:'NYSDOT state ramps',color:'#c39ccd',kind:'transport-reference',idField:'OBJECTID',api:'arcgis-features',layer:NYSDOT_RAMP_LAYER,geometryType:'esriGeometryPolyline',requiredFields:['DOTID','RAMP_INTERCHANGE_CODE','BRIDGE_FEATURE_NUMBER','NUM_LANES','PAVEMENT_WIDTH']},
  {id:'nysdot-roadways',dataset:'NYSDOT-ROADWAY-INVENTORY',name:'NYSDOT roadway inventory',color:'#cb97ad',kind:'transport-reference',idField:'OBJECTID',api:'arcgis-features',layer:NYSDOT_ROADWAY_LAYER,geometryType:'esriGeometryPolyline',requiredFields:['DOT_ID','Roadway_Type','BIN','Direction_ID','Travel_Lanes_Pr_Dir','Total_Pavement_Width']},
  {id:'nysdot-bridges',dataset:'NYSDOT-BRIDGES',name:'NYSDOT bridge inventory',color:'#be95df',kind:'bridge-inventory',idField:'ObjectID',api:'arcgis-features',layer:NYSDOT_BRIDGE_LAYER,geometryType:'esriGeometryPoint',requiredFields:['BIN','NumberOfSpans','GTMSStructure','GTMSMaterial','BridgeLengthft','DeckAreaSqFt']},
  {id:'nysdot-overhead-signs',dataset:'NYSDOT-OVERHEAD-SIGN-STRUCTURES',name:'NYSDOT overhead sign structures',color:'#d4b573',kind:'sign-structure-inventory',sourceRole:'overhead-sign-asset',idField:'OBJECTID',api:'arcgis-features',layer:NYSDOT_OVERHEAD_SIGN_LAYER,geometryType:'esriGeometryPoint',requiredFields:['AssetID','SIN','AssetStatus','EditedDate','GlobalID']},
  {id:'nysdot-height-restricted-bridges',dataset:'NYSDOT-HEIGHT-RESTRICTED-BRIDGES',name:'NYSDOT height-restricted bridges',color:'#db8f72',kind:'bridge-clearance-inventory',sourceRole:'bridge-clearance-observation',idField:'OBJECTID',api:'arcgis-features',layer:NYSDOT_HEIGHT_RESTRICTED_BRIDGE_LAYER,geometryType:'esriGeometryPoint',requiredFields:['BIN','CARRIED_1','CROSSED_1','MIN_VERT_CLEARANCE_ON','MIN_VERT_CLEARANCE_UNDER','POSTED_VRT_CLRNC_UNDER','PERMITTED_VC_UNDER','INSPECTION_DATE']},
  {id:'usdot-nbi-2023',dataset:'USDOT-NBI-2023',name:'USDOT 2023 National Bridge Inventory',color:'#a78fc8',kind:'bridge-inventory',idField:'fid',api:'arcgis-features',layer:USDOT_NBI_LAYER,geometryType:'esriGeometryPoint',requiredFields:['structure_','main_unit_','appr_spans','max_span_l','deck_width','vert_clr_1','pier_prote']},
  {id:'nysdot-bridge-roadway',dataset:'NYSDOT-BRIDGE-ROADWAY',name:'NYSDOT bridge-roadway relationships',color:'#bb8bb1',kind:'transport-reference',sourceRole:'bridge-roadway-link',idField:'OBJECTID',api:'arcgis-point-table',layer:NYSDOT_BRIDGE_ROADWAY_TABLE,requiredFields:['BIN','Bridge_ROUTE_ID','ROUTE_ID','FROM_MEASURE','TO_MEASURE','Roadway_Type','Lat','Long']},
  {id:'mta-stations',dataset:'39hk-dx4f',name:'MTA subway station inventory',color:'#a0adf0',kind:'station-inventory',idField:'station_id',api:'socrata-stations',catalogURL:MTA_STATIONS_ROOT+'/Transportation/MTA-Subway-Stations/39hk-dx4f'},
  {id:'mta-entrances',dataset:'i9wp-a4ja',name:'MTA subway entrances and exits (2024)',color:'#adabef',kind:'station-inventory',sourceRole:'station-entrance',idField:':id',api:'socrata-stations',catalogURL:MTA_STATIONS_ROOT+'/Transportation/MTA-Subway-Entrances-and-Exits-2024/i9wp-a4ja'},
  {id:'nyc-pedestrian-ramps',dataset:'ufzp-rrqu',name:'NYC pedestrian ramp survey',color:'#c6bd92',kind:'street-inventory',sourceRole:'pedestrian-ramp-survey',idField:'rampid'},
  {id:'nyc-pedestrian-progress',dataset:'e7gc-ub6z',name:'NYC pedestrian ramp program progress',color:'#d0b9a1',kind:'street-inventory',sourceRole:'pedestrian-ramp-program',idField:'objectid'},
  {id:'nyc-lidar-2017',dataset:'NOAA-NYC-LIDAR-9306',name:'NYC 2017 LiDAR point data',color:'#d2ade7',kind:'point-cloud',api:'ept',catalogURL:'https://noaa-nos-coastal-lidar-pds.s3.amazonaws.com/laz/geoid18/9306/index.html'},
  ...PLANIMETRIC_SOURCES,
];
export const CONEY_BOUNDS = { south: 40.5752, west: -73.9798, north: 40.5799, east: -73.9760 };
export function areaWKT(b) {
  if (!b || !['south','west','north','east'].every(k=>Number.isFinite(b[k])) || b.south >= b.north || b.west >= b.east || b.south < -90 || b.north > 90 || b.west < -180 || b.east > 180) throw new Error('Invalid geographic bounds.');
  return `POLYGON ((${b.west} ${b.south}, ${b.east} ${b.south}, ${b.east} ${b.north}, ${b.west} ${b.north}, ${b.west} ${b.south}))`;
}
export function nycURL(source, bounds, offset = 0, limit = SOCRATA_LIMITS.page) {
  if(source.api==='socrata-stations'){areaWKT(bounds);return stationURL(source,bounds);}
  if(source.api==='ept'){areaWKT(bounds);return NYC_LIDAR_EPT+'/ept.json';}
  if(source.api==='i3s')return NYC_MESH_LAYER+'?f=json';
  if(source.api==='arcgis-features'){areaWKT(bounds);return arcgisURL(source,bounds);}
  if(source.api==='arcgis-point-table'){areaWKT(bounds);return source.layer+'/query';}
  if (source.api === 'arcgis') return lionURL(bounds);
  const query = new URLSearchParams({ $where: `intersects(${source.geometryField || 'the_geom'}, '${areaWKT(bounds)}')`, $order: `${source.idField || 'source_id'},:id`, $limit: String(limit), $offset: String(offset) });
  return `https://data.cityofnewyork.us/resource/${source.dataset}.geojson?${query}`;
}
export async function fetchNYC(source, bounds, signal, onRetry,onProgress) {
  if(source.api==='socrata-stations'){areaWKT(bounds);return fetchStations(source,bounds,signal,onRetry);}
  if(source.api==='ept'){areaWKT(bounds);return fetchLiDAR(source,bounds,signal,onRetry,undefined,onProgress);}
  if(source.api==='i3s'){areaWKT(bounds);return fetchBuildingMeshes(source,bounds,signal,onRetry);}
  if(source.api==='arcgis-features'){areaWKT(bounds);return fetchArcgisFeatures(source,bounds,signal,onRetry);}
  if(source.api==='arcgis-point-table'){areaWKT(bounds);return fetchArcgisPointTable(source,bounds,signal,onRetry);}
  if (source.api === 'arcgis') return fetchLION(source, bounds, signal, onRetry);
  const features = [], urls = [], requests=[], ids = new Set(),responses=[]; let complete = false;
  let metadata = null, metadataError = null,rawMetadata=null;const metadataURL=`https://data.cityofnewyork.us/api/views/${source.dataset}.json`;
  try{
  for (let offset = 0; offset <= SOCRATA_LIMITS.records; offset += SOCRATA_LIMITS.page) {
    const limit=Math.min(SOCRATA_LIMITS.page,SOCRATA_LIMITS.records-offset+1);
    const url = nycURL(source, bounds, offset,limit); urls.push(url);requests.push({url,method:'GET'});
    const data = await fetchJSON(url,{signal},onRetry);
    responses.push({url,data});
    if (data.error || data.code) throw new Error(`NYC API: ${data.message || data.error}`);
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('NYC API did not return a GeoJSON FeatureCollection.');
    if(data.features.length>limit)throw Error('NYC API exceeded the requested page size; source snapshot rejected.');
    if(offset+data.features.length>SOCRATA_LIMITS.records)throw Error(`More than ${SOCRATA_LIMITS.records.toLocaleString('en-US')} source rows: choose a smaller map area. No partial result displayed.`);
    for (const f of data.features) {
      if (!['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString', 'Point', 'MultiPoint'].includes(f.geometry?.type)) throw new Error('Unexpected geometry type; previous result retained.');
      const id = f.properties?.[source.idField || 'source_id']; if (id === undefined) throw new Error('NYC feature has no source identifier.');
      const key = recordKey(f); if (!ids.has(key)) { ids.add(key); features.push(f); }
    }
    if (data.features.length < limit) { complete = true; break; }
  }
  if (!complete) throw new Error('NYC source pagination did not prove completeness. No partial result displayed.');
  // Metadata is useful but not required to display a successful geometry query.
  try { requests.push({url:metadataURL,method:'GET'});const d=await withRequestTimeout(signal,10000,async signal=>{const r=await fetch(metadataURL,{signal,cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();});rawMetadata=d;metadata = { name: d.name, dataUpdatedAt: d.rowsUpdatedAt ? new Date(d.rowsUpdatedAt * 1000).toISOString() : null, metadataUpdatedAt: d.viewLastModified ? new Date(d.viewLastModified * 1000).toISOString() : null }; }
  catch (e) { if (signal?.aborted) throw e; metadataError = e.message; }
  return { sourceId: source.id, dataset: source.dataset, bounds, urls,requests, fetchedAt: new Date().toISOString(), metadata, metadataError,raw:{responses,metadata:rawMetadata,metadataURL}, data: { type: 'FeatureCollection', features } };
  }catch(cause){throw acquisitionError(cause,source,bounds,{urls,requests,raw:{responses,metadata:rawMetadata,metadataURL}},signal);}
}
export const sourceRecordCount=snapshot=>snapshot.data.features.length+(snapshot.data.assets?.length||0);
export function sourceSummary(snapshot){
  const assets=snapshot.data.assets;if(!assets)return `${snapshot.data.features.length} features`;
  const state=!assets.length?'no intersecting tiles':assets.every(a=>a.decoded?.encoding==='laszip')?'validated records; decoded on query':assets.every(a=>a.decoded?.records)?'decoded records available':'decoding pending';
  return `${assets.length} LiDAR payloads · ${snapshot.metadata.pointCount.toLocaleString('en-US')} stored points · ${state}`;
}
export function geoPolygons(geometry) { return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : []; }

export function geoLines(g) { return g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []; }
export function geoPoints(g) { return g.type === 'Point' ? [g.coordinates] : g.type === 'MultiPoint' ? g.coordinates : []; }
export function featureID(source, feature) {
  if(feature.sourceRecordId)return `${feature.sourceRecordId}/point/${feature.pointIndex}`;
  // Repeated IDs can describe conflicting observations at identical coordinates.
  let hash = 2166136261; for (const c of recordKey(feature)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return `${source.id}/${feature.properties[source.idField || 'source_id']}@${(hash >>> 0).toString(16)}`;
}
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const recordKey=feature=>JSON.stringify([canonical(feature.geometry),canonical(feature.properties)]);
// Expand multipart observations for normalization/display; keep raw snapshots intact.
export function sourceFeatures(source,features){
  return features.flatMap(feature=>{
    const geometryError=sourceGeometryError(feature.geometry);
    if(geometryError||feature.geometry.type!=='MultiPoint')return[{...feature,geometryError}];
    const sourceRecordId=featureID(source,feature);return feature.geometry.coordinates.map((coordinates,pointIndex)=>({...feature,sourceRecordId,pointIndex,geometryError:null,geometry:{type:'Point',coordinates}}));
  });
}

export const NYC_MEDIAN_TYPES = { '360010': 'Painted road marking area; not a physical island', '360020': 'Curbed median', '360030': 'Rail median', '360040': 'Fence median', '360050': 'Grass median', '360060': 'Barrier median', '360070': 'Other median', '360080': 'Traffic island' };

export function lionURL(bounds, extra = {}) {
  areaWKT(bounds);
  return `${LION_LAYER}/query?${new URLSearchParams({ where: '1=1', geometry: JSON.stringify({xmin:bounds.west,ymin:bounds.south,xmax:bounds.east,ymax:bounds.north,spatialReference:{wkid:4326}}), geometryType:'esriGeometryEnvelope', inSR:'4326', spatialRel:'esriSpatialRelIntersects', outFields:'*', outSR:'4326', returnGeometry:'true',returnZ:'true',returnM:'true', f:'geojson', ...extra })}`;
}
async function fetchLION(source, bounds, signal, onRetry) {
  let metadata=null,metadataError=null,rawMetadata=null;const metadataURL=`${LION_LAYER}?f=json`;
  const urls=[],requests=[],responses=[],get=async(url,post=false)=>{
    urls.push(url);const parsed=new URL(url),target=post?`${parsed.origin}${parsed.pathname}`:url;
    const request={url:target,method:post?'POST':'GET',...(post?{body:parsed.searchParams.toString()}:{})};requests.push(request);
    const data=await fetchJSON(target,{signal,method:request.method,...(post?{body:parsed.searchParams}:{})},onRetry);
    responses.push({request:{...request},data});
    if(data.error)throw new Error(`LION API: ${data.error.message}`);return data;
  };
  try{
  // Fetch a fixed ID set first: no pagination by a non-unique street/segment identifier.
  const idURL=lionURL(bounds,{returnIdsOnly:'true',returnGeometry:'false',f:'json'}), ids=await get(idURL);
  if(!Array.isArray(ids.objectIds)||ids.objectIds.some(id=>!Number.isSafeInteger(id)||id<0)||new Set(ids.objectIds).size!==ids.objectIds.length)throw new Error('LION returned an invalid object ID list.');
  const objectIds=[...ids.objectIds].sort((a,b)=>a-b);if(objectIds.length>ACQUISITION_LIMITS.vectorRecords)throw new Error(`More than ${ACQUISITION_LIMITS.vectorRecords.toLocaleString('en-US')} LION records; choose a smaller area.`);
  const features=[];
  // POST preserves full batches without exceeding the service's GET query-string limit.
  for(let i=0;i<objectIds.length;i+=LION_BATCH_SIZE){
    const batch=objectIds.slice(i,i+LION_BATCH_SIZE),data=await get(lionURL(bounds,{objectIds:batch.join(',')}),true);if(data.type!=='FeatureCollection'||!Array.isArray(data.features)||data.exceededTransferLimit)throw new Error('Incomplete LION geometry response.');
    const returned=new Set();
    for(const raw of data.features){const f=structuredClone(raw);if(!['LineString','MultiLineString'].includes(f.geometry?.type))throw new Error('Unexpected LION geometry.');if(!f.properties||typeof f.properties!=='object'||Array.isArray(f.properties))throw new Error('Missing LION feature properties.');if(f.properties.OBJECTID===undefined&&f.id!==undefined)f.properties.OBJECTID=f.id;const id=sourceNumber(f.properties.OBJECTID);if(!Number.isSafeInteger(id)||!batch.includes(id)||returned.has(id))throw new Error('Unexpected or duplicate LION feature identity.');returned.add(id);features.push(f);}
    if(returned.size!==batch.length)throw new Error('LION returned incomplete records; source snapshot rejected.');
  }
  try{requests.push({url:metadataURL,method:'GET'});const d=await withRequestTimeout(signal,10000,async signal=>{const r=await fetch(metadataURL,{signal,cache:'no-store'}),d=await r.json();rawMetadata=d;if(!r.ok||d.error)throw new Error(d.error?.message||r.statusText);return d;});metadata={name:d.name,dataUpdatedAt:d.editingInfo?.lastEditDate?new Date(d.editingInfo.lastEditDate).toISOString():null,metadataUpdatedAt:null,description:d.description,copyright:d.copyrightText,hasZ:d.hasZ,spatialReference:d.extent?.spatialReference,fields:d.fields?.map(f=>({name:f.name,alias:f.alias,type:f.type})),sourceURL:LION_LAYER};}catch(e){if(signal?.aborted)throw e;metadataError=e.message;}
  return {sourceId:source.id,dataset:source.dataset,bounds,urls,requests,queryURL:lionURL(bounds),fetchedAt:new Date().toISOString(),metadata,metadataError,raw:{responses,metadata:rawMetadata,metadataURL},data:{type:'FeatureCollection',features}};
  }catch(cause){throw acquisitionError(cause,source,bounds,{urls,requests,raw:{responses,metadata:rawMetadata,metadataURL}},signal);}
}
