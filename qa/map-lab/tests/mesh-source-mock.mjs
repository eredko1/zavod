import {NYC_MESH_LAYER} from '../data/nyc-building-mesh.js';
import {loadFidelityFixture} from './fixture.mjs';
import {WATER_TANK_LAYER,NYC_SOURCES} from '../data/map-sources.js';
import {NYC_LIDAR_EPT} from '../data/lidar-ept.js';
import {mockEmptyBridgeRoadwayTable} from './bridge-roadway-mock.mjs';

// Browser test transport only. The production UI has no pinned-data or local-file fallback.
export async function mockMeshSource(page,{empty=false}={}){
  await page.route('https://data.ny.gov/api/views/39hk-dx4f.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({id:'39hk-dx4f',columns:['station_id','complex_id','gtfs_stop_id','gtfs_latitude','gtfs_longitude','structure'].map(fieldName=>({fieldName,dataTypeName:['gtfs_stop_id','structure'].includes(fieldName)?'text':'number'}))})}));
  await page.route('https://data.ny.gov/resource/39hk-dx4f.json?*',r=>r.fulfill({contentType:'application/json',body:'[]'}));
  await page.route('https://data.ny.gov/api/views/i9wp-a4ja.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({id:'i9wp-a4ja',columns:['station_id','complex_id','gtfs_stop_id','entrance_latitude','entrance_longitude','entrance_type','entry_allowed','exit_allowed'].map(fieldName=>({fieldName,dataTypeName:fieldName.startsWith('entrance_l')?'number':'text'}))})}));
  await page.route('https://data.ny.gov/resource/i9wp-a4ja.json?*',r=>r.fulfill({contentType:'application/json',body:'[]'}));
  await page.route(NYC_LIDAR_EPT+'/**',r=>{
    const suffix=r.request().url().slice(NYC_LIDAR_EPT.length),b=[0,0,0,1,1,1];
    const data=suffix==='/ept.json'?{version:'1.0.0',dataType:'laszip',hierarchyType:'json',srs:{authority:'EPSG',horizontal:'6347',vertical:'5703'},bounds:b,boundsConforming:b,points:1,schema:['X','Y','Z','Classification','OriginId'].map(name=>({name,type:'unsigned',size:4}))}:suffix==='/ept-hierarchy/0-0-0-0.json'?{'0-0-0-0':1}:suffix==='/ept-sources/list.json'?[{id:'empty-test-source',bounds:b,status:'inserted',points:1,inserts:1}]:null;
    if(!data)throw Error('Unexpected empty LiDAR test request '+suffix);return r.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  for(const source of NYC_SOURCES.filter(s=>s.api==='arcgis-point-table'))await mockEmptyBridgeRoadwayTable(page,source);
  for(const source of NYC_SOURCES.filter(s=>s.api==='arcgis-features'&&s.id!=='nyc-water-tanks'))await page.route(source.layer+'**',route=>{
    const layer={geometryType:source.geometryType,objectIdField:source.idField,hasZ:source.nativeHasZ,extent:{spatialReference:{wkid:102718,latestWkid:2263}},fields:[{name:source.idField,type:'esriFieldTypeOID'},...source.requiredFields.map(name=>({name,type:'esriFieldTypeString'}))]};
    const params=new URL(route.request().url()).searchParams;
    return route.fulfill({contentType:'application/json',body:JSON.stringify(new URL(route.request().url()).pathname.endsWith('/query')?(params.get('returnCountOnly')==='true'?{count:0}:{objectIdFieldName:source.idField,objectIds:null}):layer)});
  });
  const fixture=await loadFidelityFixture(),snapshot=fixture.mesh.nyc.find(s=>s.sourceId==='nyc-buildings-2014');
  await page.route(NYC_MESH_LAYER+'**',route=>{
    const url=new URL(route.request().url()),suffix=url.pathname.slice(new URL(NYC_MESH_LAYER).pathname.length);
    if(!suffix)return route.fulfill({contentType:'application/json',body:JSON.stringify(snapshot.raw.layer)});
    const parts=suffix.split('/').filter(Boolean),node=empty?{node:{id:'root',mbs:[0,0,0,1]}}:snapshot.raw.nodes.find(n=>n.id===parts[1]);
    if(!node)throw Error('Unrecorded mesh test request '+suffix);
    if(parts.length===2)return route.fulfill({contentType:'application/json',body:JSON.stringify(node.node)});
    const bytes=parts[2]==='geometries'?node.geometry:node.attributes?.[parts[3]];if(!bytes)throw Error('Unrecorded mesh binary '+suffix);
    return route.fulfill({contentType:'application/octet-stream',body:Buffer.from(bytes,'base64')});
  });
  const tank=fixture.mesh.nyc.find(s=>s.sourceId==='nyc-water-tanks');
  await page.route(WATER_TANK_LAYER+'**',route=>{
    const url=new URL(route.request().url());if(!url.pathname.endsWith('/query'))return route.fulfill({contentType:'application/json',body:JSON.stringify(tank.raw.layer)});
    const params=route.request().postData()?new URLSearchParams(route.request().postData()):url.searchParams;
    const data=params.get('returnIdsOnly')==='true'?(empty?{objectIds:[]}:tank.raw.responses.find(r=>r.data.objectIds)?.data):params.get('f')==='json'?tank.raw.responses.find(r=>r.data.features?.[0]?.attributes)?.data:tank.data;
    if(!data)throw Error('Unrecorded equipment test request');return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });return fixture;
}
