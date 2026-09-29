import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {chromeOptions,verifyHardwareGpu} from '../../browser-launch.mjs';
import {loadPlanimetricSamples,loadLandContextSamples} from './fixture.mjs';
import {planimetricTransport} from './planimetric-source-mock.mjs';
import {fetchNYC,NYC_SOURCES} from '../data/map-sources.js';

const fixture=await loadPlanimetricSamples(),originalFetch=globalThis.fetch,snapshots=[];
fixture.samples.push(...(await loadLandContextSamples()).samples);
try{
  globalThis.fetch=planimetricTransport(fixture);
  for(const id of [...fixture.samples.map(s=>s.sourceId),...fixture.streetSamples.map(s=>s.sourceId),'mta-entrances'])snapshots.push(await fetchNYC(NYC_SOURCES.find(s=>s.id===id),fixture.entrances.bounds));
}finally{globalThis.fetch=originalFetch;}
snapshots.push({sourceId:'nyc-building-grade',bounds:fixture.entrances.bounds,data:{type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[fixture.entrances.bounds.west,fixture.entrances.bounds.south]},properties:{bin:'1000005.0',z_grade:'0.263',z_floor:'11.854',notes1:'Property not Visible Due to Construction or Obstruction'}}]},raw:{responses:[{data:{source:'BES fixture'}}]}});
const browser=await chromium.launch(chromeOptions({args:['--no-sandbox','--disable-dev-shm-usage']}));
try{
  const gpu=await verifyHardwareGpu(browser),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:8790/qa/map-lab/?qa=1');await page.waitForFunction(()=>window.__generator);
  await page.evaluate(input=>window.__generator.load(input),{bounds:fixture.entrances.bounds,nyc:snapshots});await page.evaluate(()=>window.__generator.generate());
  const actual=await page.evaluate(()=>{const g=window.__generator,p=g.world.plan;return {worker:g.world.settings.execution,sourceSame:JSON.stringify(p.merge)===JSON.stringify(g.previewPlan.merge),details:p.details.map(f=>({sourceId:f.sourceId,sourceGeometry:f.sourceGeometry,role:f.sourceRole,reference:f.reference,dimensions:f.dimensions})),raw:Object.fromEntries(p.observations.records.filter(r=>r.sourceId!=='osm-overpass').map(r=>[r.sourceId,r.snapshot.raw]))};});
  assert.equal(actual.worker,'worker');assert.equal(actual.sourceSame,true);assert.deepEqual(actual.raw,Object.fromEntries(snapshots.map(s=>[s.sourceId,s.raw])));
  assert.equal(actual.details.length,fixture.samples.length+fixture.streetSamples.length+fixture.entrances.data.features.length+1);
  assert.ok(actual.details.every(f=>f.reference&&Object.keys(f.dimensions).length===0));
  assert.equal(actual.details.find(f=>f.sourceId==='nyc-building-grade').role,'building-grade-and-floor');
  for(const sample of fixture.samples)assert.deepEqual(actual.details.find(f=>f.sourceId===sample.sourceId).sourceGeometry,sample.geoJSONFeature.geometry);
  await page.click('#tab-2d');const id='nyc-curb-cuts-2022',card=page.locator(`[data-source-visible="${id}"]`).locator('..').locator('..');await card.locator('details').evaluate(e=>e.open=true);
  const [download]=await Promise.all([page.waitForEvent('download'),card.getByRole('button',{name:'Download JSON'}).click()]);
  assert.deepEqual(JSON.parse(await readFile(await download.path(),'utf8')).raw,snapshots.find(s=>s.sourceId===id).raw);
  await page.uncheck(`[data-source-visible="${id}"]`);assert.ok(await page.evaluate(()=>!window.__generator.previewPlan.details.some(f=>f.sourceId==='nyc-curb-cuts-2022')));
  assert.ok(await page.evaluate(()=>window.__generator.previewPlan.observations.records.some(r=>r.sourceId==='nyc-curb-cuts-2022')));
  await page.click('#help-open');assert.equal(await page.locator('#source-rows tr').count(),NYC_SOURCES.length);assert.match(await page.locator('#merge-rule-planimetric-inventory').textContent(),/independent confirmation/);assert.match(await page.locator('#merge-rule-station-inventory').textContent(),/entrance row IDs/);
  assert.match(await page.locator('#merge-rule-building-grade-inventory').textContent(),/source-estimated/);
  assert.match(await page.locator('#source-rows').textContent(),/OBJECTID_1, OBJECTID, Z_CENTER, Z_START, Z_END/);
  assert.deepEqual(errors,[]);console.log('PASS original geometry/XYZ/raw channels through preview, worker and downloads; source-only references, visibility and complete Help registry; GPU:',gpu.renderer);
}finally{await browser.close();}
