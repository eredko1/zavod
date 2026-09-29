import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {chromeOptions,verifyHardwareGpu} from '../../browser-launch.mjs';

const data={elements:[{type:'way',id:1,tags:{building:'yes','building:levels':'2'},geometry:[{lat:51.5,lon:-.12},{lat:51.5,lon:-.1199},{lat:51.5001,lon:-.1199},{lat:51.5001,lon:-.12},{lat:51.5,lon:-.12}]}]};
const browser=await chromium.launch(chromeOptions({args:['--no-sandbox','--disable-dev-shm-usage']}));
try{
  await verifyHardwareGpu(browser);
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Fail the actual preview resolver once, after a successful fetch and source acceptance.
  const module=await readFile(new URL('../pipeline/map-pipeline.js',import.meta.url),'utf8');
  await page.route('**/pipeline/map-pipeline.js',route=>route.fulfill({contentType:'text/javascript',body:module.replace('export function resolveSources(','function sourcePlan(')+"\nexport function resolveSources(...args){if(globalThis.failPreview&&args[0].data?.elements.length){globalThis.failPreview=false;throw Error('injected preview failure');}return sourcePlan(...args);}"}));
  await page.route('**/api/interpreter',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)}));
  await page.goto('http://localhost:8790/qa/map-lab/?qa=1');await page.waitForFunction(()=>window.__generator);
  await page.evaluate(()=>{document.getElementById('storey').value=0;});
  await page.evaluate(()=>window.__generator.fetchArea(false,'[out:json];way(1);out geom;'));
  assert.equal(await page.locator('#error').textContent(),'');
  const plan=await page.evaluate(()=>({render:!!window.__generator.previewPlan.render,height:window.__generator.previewPlan.buildings[0].height,estimates:window.__generator.previewPlan.buildings[0].estimates}));
  assert.equal(plan.render,false);assert.equal(plan.height.top,null);assert.equal(plan.estimates,undefined,'floor tags do not introduce a render-estimate ledger during gathering');
  await page.evaluate(()=>{globalThis.failPreview=true;document.getElementById('storey').value=3;});
  await page.evaluate(()=>window.__generator.fetchArea(false,'[out:json];way(1);out geom;'));
  assert.match(await page.locator('#error').textContent(),/OpenStreetMap \(preview\): injected preview failure/);
  assert.deepEqual(await page.evaluate(()=>window.__generator.result.data),data,'preview failure retains the successfully acquired source');
  await page.evaluate(()=>window.__generator.generate());assert.ok(await page.locator('#log-download').isEnabled());
  await page.locator('details:has(#log-download) > summary').click();
  const [download]=await Promise.all([page.waitForEvent('download').catch(e=>{throw new Error(e.message+'; page errors: '+JSON.stringify(errors));}),page.locator('#log-download').click()]);
  const log=JSON.parse(await readFile(await download.path(),'utf8'));
  assert.equal(log.acquisition[0].status,'loaded');assert.equal(log.acquisition[0].previewStatus,'error');assert.equal(log.acquisition[0].previewMessage,'injected preview failure');assert.deepEqual(log.acquisitionFailures,[]);
  await page.evaluate(()=>{
    const schedule=globalThis.setTimeout;globalThis.stopAtPreview=true;
    globalThis.setTimeout=(fn,delay,...args)=>{if(globalThis.stopAtPreview&&delay===0&&document.getElementById('area-status').textContent.startsWith('Updating preview:')){globalThis.stopAtPreview=false;return schedule(()=>{document.getElementById('area-cancel').click();fn(...args);},delay);}return schedule(fn,delay,...args);};
  });
  await page.evaluate(()=>window.__generator.fetchArea(false,'[out:json];way(1);out geom;'));
  assert.match(await page.locator('#area-status').textContent(),/^Stopped\./);assert.deepEqual(await page.evaluate(()=>window.__generator.result.data),data,'stop during preview paint retains the completed source');
  assert.deepEqual(errors,[]);console.log('PASS source-only gathering with invalid render settings, separate preview failure and intact loaded-source provenance');
}finally{await browser.close();}
