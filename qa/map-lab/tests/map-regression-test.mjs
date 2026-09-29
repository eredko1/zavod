import {chromeOptions} from '../../browser-launch.mjs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mockMeshSource} from './mesh-source-mock.mjs';
const browser=await chromium.launch(chromeOptions({channel:'chrome',headless:false,args:['--no-sandbox','--disable-dev-shm-usage']})),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
const ring=[{lat:40.577,lon:-73.979},{lat:40.577,lon:-73.9788},{lat:40.5772,lon:-73.9788},{lat:40.5772,lon:-73.979},{lat:40.577,lon:-73.979}];
const fixture={elements:[{type:'way',id:1,tags:{building:'yes',height:'12'},geometry:ring},{type:'way',id:2,tags:{highway:'footway'},geometry:[{lat:40.5768,lon:-73.9792},{lat:40.5768,lon:-73.9784}]},{type:'node',id:3,lat:40.5773,lon:-73.9781,tags:{amenity:'bench',name:'<img src=x onerror=alert(1)>'}},{type:'way',id:4,tags:{barrier:'fence',leisure:'dog_park'},geometry:ring.map(p=>({...p,lat:p.lat+.0005}))}]};
let response=fixture,attempts=0,failures=1,nycRequests=0,release;
const held=new Promise(resolve=>release=resolve);let arrived=false;
try{
  await mockMeshSource(page,{empty:true});
  await page.route('**/api/interpreter',r=>{attempts++;const fail=failures-->0;return r.fulfill({status:fail?503:200,contentType:'application/json',body:JSON.stringify(fail?{remark:'temporary overload'}:response)});});
  await page.route('**/resource/*.geojson?*',async r=>{nycRequests++;if(nycRequests===1){arrived=true;await held;}return r.fulfill({contentType:'application/json',body:'{"type":"FeatureCollection","features":[]}'});});
  await page.route('https://data.cityofnewyork.us/api/views/*.json',r=>r.fulfill({contentType:'application/json',body:'{}'}));await page.route('**/LION/FeatureServer/0?*',r=>r.fulfill({contentType:'application/json',body:'{}'}));await page.route('**/LION/FeatureServer/0/query**',r=>r.fulfill({contentType:'application/json',body:'{"objectIds":[]}'}));
  await page.goto('http://localhost:8790/qa/map-lab/index.html?qa=1');await page.waitForFunction(()=>window.__generator);
  await page.click('#help-open');await page.getByRole('link',{name:'Benchmark architecture',exact:true}).click();assert.ok(await page.locator('#benchmark-heading').isVisible());
  for(const href of await page.locator('#benchmark-docs + ul a').evaluateAll(links=>links.map(a=>a.href)))assert.equal((await page.request.get(href)).status(),200,'Help documentation must resolve');
  assert.equal(await page.locator('#benchmark-docs + ul a').count(),7);await page.click('#help-close');console.log('PASS benchmark architecture and centralized documentation links');
  await page.click('#auto-coney');while(!arrived)await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(attempts,2);assert.match(await page.textContent('#source-events'),/retry/);assert.ok(await page.locator('input[data-layer="buildings"]').isDisabled());release();await page.waitForFunction(()=>!window.__generator.busy);
  await page.uncheck('input[data-layer="buildings"]');await page.click('#area-fetch');await page.waitForFunction(()=>!window.__generator.busy);assert.equal(await page.locator('input[data-layer="buildings"]').isChecked(),false);await page.check('input[data-layer="buildings"]');
  console.log('PASS transient retry, dynamic controls locked, filters survive progressive loads');
  await page.locator('[data-feature="node/3"]').click();assert.equal(await page.locator('#details img').count(),0);assert.match(await page.textContent('#details'),/<img/);assert.equal(await page.locator('[data-feature="way/4"]').count(),1);
  const view=await page.getAttribute('#map','viewBox');await page.click('#zoom-in');assert.notEqual(await page.getAttribute('#map','viewBox'),view);
  await page.locator('#live-log').evaluate(e=>e.parentElement.open=true);await page.selectOption('#merge-log-filter','all');assert.ok(await page.locator('[data-merge-decision]').count());await page.locator('[data-merge-decision]').first().click();assert.match(await page.textContent('#merge-selected'),/members/);
  await page.click('#generate');await page.waitForFunction(()=>!window.__generator.busy);assert.equal(await page.evaluate(()=>JSON.stringify(window.__generator.previewPlan.merge)===JSON.stringify(window.__generator.world.plan.merge)),true);
  // Cancel after replay has completed while async GPU query drain is still pending.
  await page.evaluate(()=>{const g=window.__generator,w=g.harness,stop=w.profiler.stop.bind(w.profiler);window.drainReached=false;w.profiler.stop=async()=>{const raw=await stop();window.drainReached=true;await new Promise(resolve=>window.releaseDrain=resolve);return raw;};window.pendingBenchmark=g.benchmark({frames:3,warmup:0,repeats:1});window.restoreStop=()=>w.profiler.stop=stop;});
  await page.waitForFunction(()=>window.drainReached);await page.click('#bench-cancel');await page.evaluate(()=>window.releaseDrain());await page.evaluate(()=>window.pendingBenchmark);assert.equal(await page.evaluate(()=>window.__generator.report.status),'cancelled');await page.evaluate(()=>window.restoreStop());
  console.log('PASS shared resolution, safe feature text, merge logs, cancellation during final GPU drain');
  const count=nycRequests,query='[out:json];nwr(51.499,-0.122,51.502,-0.118);out geom;';response={elements:fixture.elements.map(e=>({...e,lat:e.lat?e.lat+10.923:undefined,lon:e.lon?e.lon+73.858:undefined,geometry:e.geometry?.map(p=>({lat:p.lat+10.923,lon:p.lon+73.858}))}))};
  await page.evaluate(query=>window.__generator.fetchArea(false,query),query);assert.equal(nycRequests,count);assert.equal(await page.inputValue('#query'),query);assert.equal(await page.evaluate(()=>window.__generator.result.nyc.length),0);assert.ok(Number(await page.inputValue('#area-south'))>51);
  await page.click('#generate');await page.waitForFunction(()=>!window.__generator.busy);assert.ok(await page.evaluate(()=>window.__generator.world.plan.origin[0]>51));
  failures=99;await page.click('#area-fetch');await page.waitForFunction(()=>document.getElementById('area-status').textContent.includes('retry'));await page.click('#area-cancel');await page.waitForFunction(()=>!window.__generator.busy);assert.match(await page.textContent('#area-status'),/Stopped/);
  assert.deepEqual(errors,[]);console.log('PASS custom-query bounds, no cross-area NYC data, editor preserved, cancelable retry');
}finally{release();await browser.close();}
