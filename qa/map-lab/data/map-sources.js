import { fetchJSON } from './api-request.js';
import { withRequestTimeout } from './request-abort.js';
// Source IDs are stable provenance keys. Dataset updates and imagery capture dates are different.
export const LION_LAYER = 'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/LION/FeatureServer/0';
export const datasetURL = dataset => dataset === 'LION' ? LION_LAYER : `https://data.cityofnewyork.us/d/${dataset}`;
export const NYC_SOURCES = [
  { id: 'nyc-roadbed', dataset: 'i36f-5ih7', name: 'NYC roadbeds', color: '#829cbb', kind: 'roadbed' },
  { id: 'nyc-sidewalk', dataset: '52n9-sdep', name: 'NYC sidewalks', color: '#f5ddb0', kind: 'sidewalk' },
  { id: 'nyc-median', dataset: 'ees7-4ufv', name: 'NYC medians (painted + raised)', color: '#a3d8a0', kind: 'median' },
  { id: 'nyc-curbs', dataset: '5xvt-8cbk', name: 'NYC curbs', color: '#ebc18a', kind: 'curb' },
  { id: 'nyc-pavement', dataset: 'vs44-rznx', name: 'NYC pavement edges', color: '#afb9cb', kind: 'line' },
  { id: 'nyc-buildings', dataset: '5zhs-2jue', name: 'NYC building footprints', color: '#d8ae8e', kind: 'building', idField: 'doitt_id' },
  { id: 'nyc-trees', dataset: 'hn5i-inap', name: 'NYC forestry tree points', color: '#89c79a', kind: 'tree', idField: 'objectid', geometryField: 'location' },
  { id: 'nyc-lion', dataset: 'LION', name: 'NYC LION street network', color: '#e9a4ad', kind: 'lion', idField: 'OBJECTID', api: 'arcgis', layer: LION_LAYER },
  { id: 'nyc-elevation', dataset: '9uxf-ng6q', name: 'NYC elevation samples', color: '#c2a1de', kind: 'elevation' },
];
export const CONEY_BOUNDS = { south: 40.5752, west: -73.9798, north: 40.5799, east: -73.9760 };
export function areaWKT(b) {
  if (!b || !['south','west','north','east'].every(k=>Number.isFinite(b[k])) || b.south >= b.north || b.west >= b.east || b.south < -90 || b.north > 90 || b.west < -180 || b.east > 180) throw new Error('Invalid geographic bounds.');
  return `POLYGON ((${b.west} ${b.south}, ${b.east} ${b.south}, ${b.east} ${b.north}, ${b.west} ${b.north}, ${b.west} ${b.south}))`;
}
export function nycURL(source, bounds, offset = 0, limit = 1000) {
  if (source.api === 'arcgis') return lionURL(bounds);
  const query = new URLSearchParams({ $where: `intersects(${source.geometryField || 'the_geom'}, '${areaWKT(bounds)}')`, $order: `${source.idField || 'source_id'},:id`, $limit: String(limit), $offset: String(offset) });
  return `https://data.cityofnewyork.us/resource/${source.dataset}.geojson?${query}`;
}
export async function fetchNYC(source, bounds, signal, onRetry) {
  if (source.api === 'arcgis') return fetchLION(source, bounds, signal, onRetry);
  const features = [], urls = [], ids = new Set(); let complete = false;
  for (let offset = 0; offset < 10000; offset += 1000) {
    const url = nycURL(source, bounds, offset); urls.push(url);
    const data = await fetchJSON(url,{signal},onRetry);
    if (data.error || data.code) throw new Error(`NYC API: ${data.message || data.error}`);
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('NYC API did not return a GeoJSON FeatureCollection.');
    for (const f of data.features) {
      if (!['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString', 'Point', 'MultiPoint'].includes(f.geometry?.type)) throw new Error('Unexpected geometry type; previous result retained.');
      const id = f.properties?.[source.idField || 'source_id']; if (id === undefined) throw new Error('NYC feature has no source identifier.');
      const key = JSON.stringify([f.properties, f.geometry]); if (!ids.has(key)) { ids.add(key); features.push(f); }
    }
    if (data.features.length < 1000) { complete = true; break; }
  }
  if (!complete) throw new Error('More than 10,000 features: choose a smaller map area. No partial result displayed.');
  // Metadata is useful but not required to display a successful geometry query.
  let metadata = null, metadataError = null;
  try { const d=await withRequestTimeout(signal,10000,async signal=>{const r=await fetch(`https://data.cityofnewyork.us/api/views/${source.dataset}.json`,{signal,cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();});metadata = { name: d.name, dataUpdatedAt: d.rowsUpdatedAt ? new Date(d.rowsUpdatedAt * 1000).toISOString() : null, metadataUpdatedAt: d.viewLastModified ? new Date(d.viewLastModified * 1000).toISOString() : null }; }
  catch (e) { if (signal?.aborted) throw e; metadataError = e.message; }
  return { sourceId: source.id, dataset: source.dataset, bounds, urls, fetchedAt: new Date().toISOString(), metadata, metadataError, data: { type: 'FeatureCollection', features } };
}
export function geoPolygons(geometry) { return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : []; }

export function geoLines(g) { return g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []; }
export function geoPoints(g) { return g.type === 'Point' ? [g.coordinates] : g.type === 'MultiPoint' ? g.coordinates : []; }
export function featureID(source, feature) {
  // Some NYC SOURCE_IDs are zero/repeated. A geometry suffix preserves distinct records.
  let hash = 2166136261; for (const c of JSON.stringify(feature.geometry)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return `${source.id}/${feature.properties[source.idField || 'source_id']}@${(hash >>> 0).toString(16)}`;
}

export const NYC_MEDIAN_TYPES = { '360010': 'Painted road marking area; not a physical island', '360020': 'Curbed median', '360030': 'Rail median', '360040': 'Fence median', '360050': 'Grass median', '360060': 'Barrier median', '360070': 'Other median', '360080': 'Traffic island' };

export function lionURL(bounds, extra = {}) {
  areaWKT(bounds);
  return `${LION_LAYER}/query?${new URLSearchParams({ where: '1=1', geometry: JSON.stringify({xmin:bounds.west,ymin:bounds.south,xmax:bounds.east,ymax:bounds.north,spatialReference:{wkid:4326}}), geometryType:'esriGeometryEnvelope', inSR:'4326', spatialRel:'esriSpatialRelIntersects', outFields:'*', outSR:'4326', returnGeometry:'true', f:'geojson', ...extra })}`;
}
async function fetchLION(source, bounds, signal, onRetry) {
  const urls=[],requests=[],get=async(url,post=false)=>{
    urls.push(url);const parsed=new URL(url),target=post?`${parsed.origin}${parsed.pathname}`:url;
    const request={url:target,method:post?'POST':'GET',...(post?{body:parsed.searchParams.toString()}:{})};requests.push(request);
    const data=await fetchJSON(target,{signal,method:request.method,...(post?{body:parsed.searchParams}:{})},onRetry);
    if(data.error)throw new Error(`LION API: ${data.error.message}`);return data;
  };
  // Fetch a fixed ID set first: no pagination by a non-unique street/segment identifier.
  const idURL=lionURL(bounds,{returnIdsOnly:'true',returnGeometry:'false',f:'json'}), ids=await get(idURL);
  if(!Array.isArray(ids.objectIds))throw new Error('LION did not return an object ID list.');
  const objectIds=[...new Set(ids.objectIds)].sort((a,b)=>a-b);if(objectIds.length>10000)throw new Error('More than 10,000 LION records; choose a smaller area.');
  const features=[];
  // POST preserves full batches without exceeding the service's GET query-string limit.
  for(let i=0;i<objectIds.length;i+=500){const batch=objectIds.slice(i,i+500),data=await get(lionURL(bounds,{objectIds:batch.join(',')}),true);if(data.type!=='FeatureCollection'||!Array.isArray(data.features)||data.exceededTransferLimit)throw new Error('Incomplete LION geometry response.');for(const f of data.features){if(!['LineString','MultiLineString'].includes(f.geometry?.type))throw new Error('Unexpected LION geometry.');if(f.properties?.OBJECTID===undefined&&f.id!==undefined)f.properties.OBJECTID=f.id;features.push(f);}}
  const returned=new Set(features.map(f=>Number(f.properties.OBJECTID)));if(returned.size!==objectIds.length||objectIds.some(id=>!returned.has(id)))throw new Error('LION changed during the query or returned incomplete records; retry.');
  let metadata=null,metadataError=null;
  try{const d=await withRequestTimeout(signal,10000,async signal=>{const r=await fetch(`${LION_LAYER}?f=json`,{signal,cache:'no-store'}),d=await r.json();if(!r.ok||d.error)throw new Error(d.error?.message||r.statusText);return d;});metadata={name:d.name,dataUpdatedAt:d.editingInfo?.lastEditDate?new Date(d.editingInfo.lastEditDate).toISOString():null,metadataUpdatedAt:null,description:d.description,copyright:d.copyrightText,hasZ:d.hasZ,spatialReference:d.extent?.spatialReference,fields:d.fields?.map(f=>({name:f.name,alias:f.alias,type:f.type})),sourceURL:LION_LAYER};}catch(e){if(signal?.aborted)throw e;metadataError=e.message;}
  return {sourceId:source.id,dataset:source.dataset,bounds,urls,requests,queryURL:lionURL(bounds),fetchedAt:new Date().toISOString(),metadata,metadataError,data:{type:'FeatureCollection',features}};
}
