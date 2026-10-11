import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {chromeOptions,verifyHardwareGpu} from '../../browser-launch.mjs';
import {mockMeshSource} from './mesh-source-mock.mjs';
import {NYC_SOURCES} from '../data/map-sources.js';

const browser=await chromium.launch(chromeOptions({channel:'chrome',headless:false,args:['--no-sandbox','--disable-dev-shm-usage']})),page=await browser.newPage({viewport:{width:1500,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(120000);
await mkdir('.tmp/map-lab/fidelity',{recursive:true});
try{
  const fixture=await mockMeshSource(page),city=fixture.mesh.nyc.find(s=>s.sourceId==='nyc-buildings');
  await page.route('**/api/interpreter',r=>r.fulfill({contentType:'application/json',body:'{"elements":[]}'}));
  await page.route('**/resource/*.geojson?*',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(r.request().url().includes(city.dataset)?city.data:{type:'FeatureCollection',features:[]})}));
  await page.route('https://data.cityofnewyork.us/api/views/*.json',r=>r.fulfill({contentType:'application/json',body:'{}'}));await page.route('**/LION/FeatureServer/0?*',r=>r.fulfill({contentType:'application/json',body:'{"name":"LION"}'}));await page.route('**/LION/FeatureServer/0/query**',r=>r.fulfill({contentType:'application/json',body:'{"objectIds":[]}'}));
  await page.goto('http://localhost:8790/qa/map-lab/index.html?qa=1');await page.waitForFunction(()=>!!window.__generator);
  await page.click('#auto-coney');await page.waitForFunction(()=>!window.__generator.busy);assert.equal(await page.evaluate(()=>window.__generator.result.nyc.length),NYC_SOURCES.length,await page.textContent('#error'));
  assert.equal(await page.evaluate(()=>window.__generator.result.nyc.find(s=>s.sourceId==='nyc-buildings-2014').data.features.length),36);assert.ok(await page.evaluate(()=>window.__generator.result.nyc.find(s=>s.sourceId==='nyc-buildings-2014').raw.nodes.some(n=>n.geometry&&n.attributes.f_4)),'UI acquisition retains original binary observations');
  await page.click('#generate');await page.waitForFunction(()=>!window.__generator.busy);assert.equal(await page.evaluate(()=>window.__generator.world.plan.buildings.filter(f=>f.mesh&&!f.reference).length),13);
  assert.equal(await page.evaluate(()=>window.__generator.world.getWorld().selectable.filter(m=>m.userData.feature?.equipmentModel).length),2,'both mapped building 3 tanks render as linked equipment');assert.ok(await page.evaluate(()=>window.__generator.result.nyc.find(s=>s.sourceId==='nyc-water-tanks').raw.responses.some(r=>r.data.features?.[0]?.attributes?.BASE_ELEVATION)),'native equipment attributes retained');
  assert.ok(await page.evaluate(()=>JSON.stringify(window.__generator.previewPlan.merge)===JSON.stringify(window.__generator.world.plan.merge)),'meshes and placement never alter source merge decisions');
  await page.locator('#generation-info > details:has(#log-download) > summary').click();
  const [generationDownload]=await Promise.all([page.waitForEvent('download'),page.click('#log-download')]),generation=JSON.parse(await readFile(await generationDownload.path(),'utf8'));
  assert.ok(generation.render.decisions.filter(d=>d.attributes.equipment?.estimated).length===2);assert.ok(generation.render.decisions.filter(d=>d.attributes.placement?.terrainEnabled===false).length>=2,'actual flat-plane placement is exported only in render records');assert.ok(generation.merge.decisions.every(d=>!d.attributes.equipment&&!d.attributes.placement&&!d.attributes.elevationProfile));
  const gpu=await verifyHardwareGpu(browser);await page.screenshot({path:'.tmp/map-lab/fidelity/luna-roofs.png'});
  await page.evaluate(()=>{const w=window.__generator.world,f=w.plan.buildings.find(f=>f.mesh&&!f.reference&&String(f.tags.bin)==='3320750');w.focusFeature(f.id);w.suspend(true);w.draw();});await page.screenshot({path:'.tmp/map-lab/fidelity/luna-building-3-with-tanks.png'});await page.evaluate(()=>{window.__generator.world.fit();window.__generator.world.suspend(false);});
  await page.click('#tab-2d');await page.uncheck('[data-source-visible="nyc-water-tanks"]');await page.click('#generate');await page.waitForFunction(()=>!window.__generator.busy);assert.equal(await page.evaluate(()=>window.__generator.world.plan.details.filter(f=>f.equipmentModel).length),0);assert.equal(await page.evaluate(()=>window.__generator.result.nyc.find(s=>s.sourceId==='nyc-water-tanks').data.features.length),2,'hiding equipment never deletes raw records');
  await page.click('#tab-2d');await page.check('[data-source-visible="nyc-water-tanks"]');await page.click('#generate');await page.waitForFunction(()=>!window.__generator.busy);assert.equal(await page.evaluate(()=>window.__generator.world.plan.details.filter(f=>f.equipmentModel).length),2);
  await page.click('#tab-2d');await page.uncheck('[data-source-visible="nyc-buildings-2014"]');await page.click('#generate');await page.waitForFunction(()=>!window.__generator.busy);assert.equal(await page.evaluate(()=>window.__generator.world.plan.buildings.filter(f=>f.mesh).length),0);assert.equal(await page.evaluate(()=>window.__generator.world.plan.buildings.filter(f=>f.sourceId==='nyc-buildings').length),34);
  await page.evaluate(async result=>{window.__generator.load(result);await window.__generator.generate();},fixture.bridge);
  const checks=await page.evaluate(()=>{const w=window.__generator.world;return {gradedRoads:w.plan.roads.filter(f=>f.elevationProfile?.role).length,pylons:w.getWorld().selectable.filter(m=>m.userData.feature?.supportModel).length,errors:w.plan.issues.filter(i=>i.severity==='error'),gpuRenderer:w.renderer?.getContext?.().getParameter?.(7937)};});assert.ok(checks.gradedRoads>=6);assert.equal(checks.pylons,2);assert.deepEqual(checks.errors,[]);
  await page.screenshot({path:'.tmp/map-lab/fidelity/verrazzano-levels.png'});
  await page.evaluate(()=>window.__generator.benchmark({frames:20,warmup:5,repeats:1}));const report=await page.evaluate(()=>window.__generator.report);assert.equal(report.status,'complete',report.failure);assert.ok(report.runs[0].raw.frames.some(f=>Number.isFinite(f.gpuMs)),'benchmark retains actual GPU timer coverage');await writeFile('.tmp/map-lab/fidelity/browser-result.json',JSON.stringify({gpu,checks,report},null,2));
  assert.deepEqual(errors,[]);console.log('PASS live-flow native API replay, raw exports, mesh/equipment source restoration, linked building 3 tanks, roof and bridge graphics, mapped pylons and hardware GPU benchmark');
}finally{await browser.close();}
