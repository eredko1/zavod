import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {chromeOptions,verifyHardwareGpu} from '../../browser-launch.mjs';
import {loadTransportInventoryFixture} from './fixture.mjs';
import {NYC_SOURCES} from '../data/map-sources.js';
import {mockMeshSource} from './mesh-source-mock.mjs';
import {readFile} from 'node:fs/promises';
import {mockEmptyBridgeRoadwayTable} from './bridge-roadway-mock.mjs';

const {samples}=await loadTransportInventoryFixture(),browser=await chromium.launch(chromeOptions({args:['--no-sandbox','--disable-dev-shm-usage']}));
try{
  const graphics=await verifyHardwareGpu(browser),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:8790/qa/map-lab/?qa=1');await page.waitForFunction(()=>window.__generator);
  const scene={bounds:{west:-74.06,south:40.59,east:-74.015,north:40.63},data:{elements:[]},acquisitionFailures:[{sourceId:'nysdot-bridges',status:'rejected',raw:{responses:[{data:{error:{message:'test rejection'}}}]}}],nyc:samples.map(s=>({sourceId:s.sourceId,dataset:s.dataset,bounds:s.bounds,data:{type:'FeatureCollection',features:[s.geoJSONFeature]},raw:{layer:s.layer,nativeFeature:s.nativeFeature}}))};
  await page.evaluate(async scene=>{window.__generator.load(scene);await window.__generator.generate();},scene);
  const state=await page.evaluate(()=>{const g=window.__generator,plan=g.world.plan;return {details:plan.details.length,references:plan.details.every(f=>f.reference),estimated:plan.details.filter(f=>f.elevationProfile||f.supportModel||f.width).length,raw:plan.observations.records.filter(s=>s.sourceId.startsWith('nysdot-')).map(s=>s.snapshot.raw),mergeSame:JSON.stringify(g.previewPlan.merge)===JSON.stringify(plan.merge),execution:g.world.settings.execution,selectable:g.world.getWorld().selectable.some(m=>m.userData.feature?.sourceId?.startsWith('nysdot-')||m.userData.features?.some(f=>f.sourceId?.startsWith('nysdot-'))),timer:!!g.world.renderer.getContext().getExtension('EXT_disjoint_timer_query_webgl2')};});
  assert.equal(state.details,samples.length);assert.equal(state.references,true);assert.equal(state.estimated,0);assert.equal(state.mergeSame,true);assert.equal(state.execution,'worker');assert.equal(state.selectable,true);assert.equal(state.timer,true);assert.deepEqual(state.raw,scene.nyc.map(s=>s.raw));
  assert.deepEqual(await page.evaluate(()=>window.__generator.world.plan.observations.acquisitionFailures),scene.acquisitionFailures,'failed responses remain separate renderer evidence after worker restoration');
  assert.equal(await page.locator('#log-download').isVisible(),false,'generation downloads start inside a closed disclosure');await page.click('details:has(#log-download) > summary');assert.equal(await page.locator('#log-download').isVisible(),true);
  const [generationDownload]=await Promise.all([page.waitForEvent('download'),page.click('#log-download')]);assert.deepEqual(JSON.parse(await readFile(await generationDownload.path(),'utf8')).acquisitionFailures,scene.acquisitionFailures);
  await page.evaluate(()=>window.__generator.benchmark({frames:4,warmup:2,repeats:1}));assert.equal(await page.evaluate(()=>window.__generator.report.status),'complete');
  const [benchmarkDownload]=await Promise.all([page.waitForEvent('download'),page.click('#bench-download')]);assert.deepEqual(JSON.parse(await readFile(await benchmarkDownload.path(),'utf8')).acquisitionFailures,scene.acquisitionFailures,'loaded captures also retain evidence in benchmark downloads');
  await page.click('#help-open');assert.equal(await page.locator('#source-rows tr').count(),NYC_SOURCES.length);assert.match(await page.locator('#source-rows').textContent(),/NYSDOT state ramps/);assert.match(await page.locator('#merge-rule-transport-inventory').textContent(),/bridge inventory namespace/);assert.equal((await page.request.get('http://localhost:8790/qa/map-lab/docs/TRANSPORT-INVENTORIES.md')).status(),200);await page.click('#help-close');
  await page.click('#tab-2d');await page.uncheck('[data-source-visible="nysdot-roadways"]');await page.evaluate(()=>window.__generator.generate());
  assert.equal(await page.evaluate(()=>window.__generator.world.plan.details.length),samples.length-1);assert.equal(await page.evaluate(()=>window.__generator.world.plan.observations.records.filter(s=>s.sourceId.startsWith('nysdot-')).length),samples.length);
  // A live-format disagreement must remain downloadable evidence without entering source selection.
  await mockMeshSource(page,{empty:true});
  await page.route('**/api/interpreter',r=>r.fulfill({contentType:'application/json',body:'{"elements":[]}'}));
  await page.route('**/resource/*.geojson?*',r=>r.fulfill({contentType:'application/json',body:'{"type":"FeatureCollection","features":[]}'}));
  await page.route('https://data.cityofnewyork.us/api/views/*.json',r=>r.fulfill({contentType:'application/json',body:'{}'}));
  await page.route('**/LION/FeatureServer/0**',r=>r.fulfill({contentType:'application/json',body:r.request().url().includes('/query')?'{"objectIds":[]}':'{"name":"LION"}'}));
  await mockEmptyBridgeRoadwayTable(page,NYC_SOURCES.find(s=>s.id==='nysdot-bridge-roadway'));
  const sample=samples.find(s=>s.sourceId==='nysdot-bridges'),source=NYC_SOURCES.find(s=>s.id===sample.sourceId),id=sample.nativeFeature.attributes[source.idField];
  await page.route(source.layer+'**',r=>{
    const params=r.request().postData()?new URLSearchParams(r.request().postData()):new URL(r.request().url()).searchParams;
    const data=!new URL(r.request().url()).pathname.endsWith('/query')?sample.layer:params.get('returnIdsOnly')==='true'?{objectIds:[id]}:params.get('f')==='json'?{features:[sample.nativeFeature]}:{type:'FeatureCollection',features:[{...sample.geoJSONFeature,properties:{...sample.geoJSONFeature.properties,NumberOfSpans:sample.nativeFeature.attributes.NumberOfSpans+1}}]};
    return r.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.evaluate(()=>window.__generator.fetchArea());
  const failed=await page.evaluate(()=>({sources:window.__generator.result.nyc.map(s=>s.sourceId),failures:window.__generator.result.acquisitionFailures}));
  assert.ok(!failed.sources.includes(source.id));assert.equal(failed.failures.length,1);assert.equal(failed.failures[0].status,'rejected');assert.deepEqual(failed.failures[0].raw.responses[2].data.features[0],sample.nativeFeature);assert.match(await page.locator('#error').textContent(),/Conflicting ArcGIS/);
  const [download]=await Promise.all([page.waitForEvent('download'),page.click('#merge-download')]);assert.deepEqual(JSON.parse(await readFile(await download.path(),'utf8')).acquisitionFailures,failed.failures);
  await page.evaluate(scene=>window.__generator.load(scene),{...scene,acquisitionFailures:[]});assert.deepEqual(await page.evaluate(()=>window.__generator.result.acquisitionFailures),[],'loading a different capture clears previous rejection evidence');
  assert.deepEqual(errors,[]);console.log('PASS transport inventory references, worker restoration, raw/rejection evidence downloads, separate merge log, Help and source visibility; GPU:',graphics.renderer);
}finally{await browser.close();}
