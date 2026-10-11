import assert from 'node:assert/strict';
import {ACQUISITION_LIMITS} from '../data/acquisition-limits.js';
import {fetchNYC,SOCRATA_LIMITS,NYC_SOURCES} from '../data/map-sources.js';
import {MAX_AREA_METRES,validateArea,METRES_PER_LATITUDE_DEGREE,METRES_PER_LONGITUDE_DEGREE} from '../data/generator-area.js';
import {ARCGIS_LIMITS} from '../data/arcgis-features.js';
import {LIDAR_LIMITS} from '../data/lidar-ept.js';
import {MESH_LIMITS} from '../data/nyc-building-mesh.js';
import {loadNativeLayerSamples} from './fixture.mjs';

const originalFetch=globalThis.fetch,source=NYC_SOURCES.find(s=>s.id==='nyc-elevation'),bounds={south:40.57,north:40.58,west:-73.98,east:-73.97};
const row=i=>({type:'Feature',geometry:{type:'Point',coordinates:[-73.975,40.575]},properties:{source_id:String(i),elevation:i}});
try{
  assert.equal(ARCGIS_LIMITS.features,SOCRATA_LIMITS.records);assert.equal(SOCRATA_LIMITS.records,ACQUISITION_LIMITS.vectorRecords);
  assert.ok(LIDAR_LIMITS.points>76169458&&LIDAR_LIMITS.assets>2186,'measured 2 km hierarchy fits the count budgets');
  assert.ok(LIDAR_LIMITS.decodedBytes>=LIDAR_LIMITS.points*33,'captured 33-byte point layout fits the decoded budget');
  assert.equal(MESH_LIMITS,ACQUISITION_LIMITS.mesh);assert.ok(Object.isFrozen(MESH_LIMITS));
  assert.equal(MAX_AREA_METRES,ACQUISITION_LIMITS.areaMetres);
  const box=size=>({south:0,north:size/METRES_PER_LATITUDE_DEGREE,west:0,east:size/(METRES_PER_LONGITUDE_DEGREE*Math.cos(size/METRES_PER_LATITUDE_DEGREE/2*Math.PI/180))});
  validateArea(box(MAX_AREA_METRES));assert.throws(()=>validateArea(box(MAX_AREA_METRES+1)),/km/);
  for(const total of [SOCRATA_LIMITS.records,SOCRATA_LIMITS.records+1]){
    const pages=[];globalThis.fetch=async url=>{const u=new URL(url);if(u.pathname.includes('/api/views/'))return Response.json({name:'Test elevation'});const offset=Number(u.searchParams.get('$offset')),limit=Number(u.searchParams.get('$limit'));pages.push({offset,limit});return Response.json({type:'FeatureCollection',features:Array.from({length:Math.min(limit,Math.max(0,total-offset))},(_,i)=>row(offset+i))});};
    if(total===SOCRATA_LIMITS.records){const snapshot=await fetchNYC(source,bounds);assert.equal(snapshot.data.features.length,total);assert.equal(snapshot.raw.responses.at(-1).data.features.length,0,'exact cap needs empty confirmation');}
    else await assert.rejects(()=>fetchNYC(source,bounds),e=>/No partial/.test(e.message)&&e.acquisition.raw.responses.at(-1).data.features.length===1);
    assert.deepEqual(pages.at(-1),{offset:SOCRATA_LIMITS.records,limit:1});
  }
  globalThis.fetch=async()=>Response.json({type:'FeatureCollection',features:Array.from({length:SOCRATA_LIMITS.page+1},(_,i)=>row(i))});
  await assert.rejects(()=>fetchNYC(source,bounds),/exceeded the requested page size/);
  const samples=await loadNativeLayerSamples(),station=NYC_SOURCES.find(s=>s.id==='mta-stations'),stationRow=i=>({...samples.mta.data.features[0].properties,station_id:String(i+1)});
  const total=1027,pages=[];globalThis.fetch=async url=>{const u=new URL(url);if(u.pathname.includes('/api/views/'))return Response.json(samples.mta.raw.metadata);if(u.searchParams.get('$select')==='station_id'){const offset=Number(u.searchParams.get('$offset')),limit=Number(u.searchParams.get('$limit'));pages.push(offset);return Response.json(Array.from({length:Math.min(limit,Math.max(0,total-offset))},(_,i)=>({station_id:String(offset+i+1)})));}const ids=u.searchParams.get('$where').match(/\(([^)]+)\)/)[1].split(',').map(Number);return Response.json(ids.map(id=>stationRow(id-1)));};
  const transit=await fetchNYC(station,bounds);assert.equal(transit.data.features.length,total);assert.deepEqual(pages,[0,1000]);assert.deepEqual(transit.data.features.at(-1).properties,stationRow(total-1));
  let requestedRows=false;globalThis.fetch=async url=>{const u=new URL(url);if(u.pathname.includes('/api/views/'))return Response.json(samples.mta.raw.metadata);if(u.searchParams.get('$select')!=='station_id'){requestedRows=true;throw Error('Oversized inventory started record acquisition');}const offset=Number(u.searchParams.get('$offset')),limit=Number(u.searchParams.get('$limit'));return Response.json(Array.from({length:Math.min(limit,ACQUISITION_LIMITS.vectorRecords+1-offset)},(_,i)=>({station_id:String(offset+i+1)})));};
  await assert.rejects(()=>fetchNYC(station,bounds),e=>/Incomplete MTA station inventory/.test(e.message)&&e.acquisition.raw.responses.at(-1).data.length===1);assert.equal(requestedRows,false);
  console.log('PASS enlarged shared acquisition budgets, exact-cap completeness, overage evidence and strict page-size contract');
}finally{globalThis.fetch=originalFetch;}
