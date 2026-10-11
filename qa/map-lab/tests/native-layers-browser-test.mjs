import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {chromeOptions,verifyHardwareGpu} from '../../browser-launch.mjs';
import {loadNativeLayerSamples} from './fixture.mjs';
import {nativeLayerTransport} from './native-layer-mock.mjs';
import {recordPageDiagnostics} from './page-diagnostics.mjs';

const samples=await loadNativeLayerSamples();let points;
const browser=await chromium.launch(chromeOptions({args:['--no-sandbox','--disable-dev-shm-usage']}));
try{
  const gpu=await verifyHardwareGpu(browser),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];recordPageDiagnostics(page,'native-layers-browser');page.on('pageerror',e=>errors.push(e.message));
  const transport=nativeLayerTransport(samples);await page.route('https://noaa-nos-coastal-lidar-pds.s3.amazonaws.com/**',async route=>{const response=await transport(route.request().url());await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});});
  await page.goto('http://localhost:8790/qa/map-lab/?qa=1');await page.waitForFunction(()=>window.__generator);
  points=await page.evaluate(async bounds=>{const {NYC_SOURCES,fetchNYC}=await import('./data/map-sources.js');return fetchNYC(NYC_SOURCES.find(s=>s.id==='nyc-lidar-2017'),bounds);},samples.lidar.bounds);
  const input={bounds:samples.lidar.bounds,nyc:[points]};await page.evaluate(input=>window.__generator.load(input),input);
  assert.equal(await page.locator('#generate').isEnabled(),true,'point-only input can resolve sources and export its inventory');assert.match(await page.locator('[data-source-status="nyc-lidar-2017"]').textContent(),/2 LiDAR payloads.*validated records; decoded on query/);
  assert.deepEqual(points.raw.payloads,samples.lidar.payloads);assert.equal(points.metadata.decoder.version,'0.0.7');
  await page.evaluate(()=>window.__generator.generate());
  const state=await page.evaluate(async()=>{const g=window.__generator,p=g.world.plan,inventory=p.observations.records.find(r=>r.sourceId==='nyc-lidar-2017'),{archivedPointView}=await import('./data/lidar-records.js'),{createLiDARDecoder}=await import('./data/lidar-decoder.js'),decoder=createLiDARDecoder();let point;try{point=(await archivedPointView(inventory.snapshot,inventory.records[0],()=>decoder)).point(0).xyz;}finally{decoder.dispose();}return {execution:g.world.settings.execution,details:p.details.length,coverage:p.coverage.length,raw:inventory.snapshot.raw,assets:inventory.records,point,mergeSame:JSON.stringify(p.merge)===JSON.stringify(g.previewPlan.merge)};});
  assert.equal(state.execution,'worker');assert.equal(state.details,0,'tile envelopes must not become physical objects');assert.equal(state.coverage,2);assert.equal(state.mergeSame,true);assert.deepEqual(state.raw,points.raw);
  assert.deepEqual(state.assets,points.data.assets);assert.ok(state.point.every(Number.isFinite));assert.ok(!JSON.stringify(state.raw).includes('"decoded"'));
  const cropped=await page.evaluate(async xyz=>{const q=await window.__generator.world.queryPoints('nyc-lidar-2017',{bounds:[...xyz,...xyz]});return {matched:q.matched,point:q.points[0].xyz};},state.point);assert.ok(cropped.matched>0);assert.deepEqual(cropped.point,state.point);
  await page.click('#tab-2d');const card=page.locator('[data-source-visible="nyc-lidar-2017"]').locator('..').locator('..');await card.locator('details').evaluate(e=>e.open=true);
  const [download]=await Promise.all([page.waitForEvent('download'),card.getByRole('button',{name:'Download JSON'}).click()]);
  const exported=JSON.parse(await readFile(await download.path(),'utf8'));assert.deepEqual(exported.raw,points.raw);assert.deepEqual(exported.data.assets,points.data.assets);
  await page.route('**/point-archive.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(exported)}));
  const restored=await page.evaluate(async xyz=>{const {parseJSONStream}=await import('./data/json-reader.js'),{queryLiDARPoints}=await import('./render/lidar-points.js'),response=await fetch('./point-archive.json'),snapshot=await parseJSONStream(response.body),result=await queryLiDARPoints(snapshot,{bounds:[...xyz,...xyz]});return {assets:snapshot.data.assets.length,payloads:snapshot.raw.payloads.length,matched:result.matched,xyz:result.points[0].xyz};},state.point);
  assert.equal(restored.assets,points.data.assets.length);assert.equal(restored.payloads,points.raw.payloads.length);assert.ok(restored.matched>0);assert.deepEqual(restored.xyz,state.point,'streamed portable archive supplies exact renderer measurements');
  await page.uncheck('[data-source-visible="nyc-lidar-2017"]');assert.ok(await page.evaluate(()=>window.__generator.previewPlan.coverage.every(c=>c.status==='hidden')));
  await page.evaluate(input=>window.__generator.load(input),{bounds:samples.lidar.bounds,nyc:[samples.mta,points]});await page.evaluate(()=>window.__generator.generate());
  assert.equal(await page.evaluate(()=>window.__generator.world.plan.details.length),samples.mta.data.features.length);assert.deepEqual(await page.evaluate(()=>window.__generator.world.plan.observations.records.find(r=>r.sourceId==='mta-stations').snapshot.raw),samples.mta.raw);
  await page.click('#help-open');assert.match(await page.locator('#source-rows').textContent(),/MTA subway station inventory/);assert.match(await page.locator('#merge-rule-point-cloud').textContent(),/additive/);assert.match(await page.locator('#merge-rule-station-inventory').textContent(),/centroid/);
  await page.click('#help-close');
  const cancellation=await page.evaluate(async sample=>{const {createLiDARDecoder}=await import('./data/lidar-decoder.js'),controller=new AbortController(),worker=createLiDARDecoder(controller.signal),buffer=Uint8Array.from(atob(sample.binary),c=>c.charCodeAt(0)).buffer,pending=worker.decode(buffer,sample.header,sample.origins,sample.header.pointCount*sample.header.recordSize);controller.abort(new DOMException('Test cancelled','AbortError'));let error;try{await pending;}catch(e){error=e.name;}worker.dispose();return {error,transferred:buffer.byteLength};},{...samples.lidar.payloads[0],header:samples.lidar.assets[0].header,origins:samples.lidar.origins.length});
  assert.deepEqual(cancellation,{error:'AbortError',transferred:0});
  assert.deepEqual(errors,[]);console.log('PASS point-only input, original payload downloads, source selection, worker provenance retention, station references and Help; GPU:',gpu.renderer);
}finally{await browser.close();}
