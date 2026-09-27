import {NYC_SOURCES} from '../data/map-sources.js';
import {chromeOptions} from '../../browser-launch.mjs';
// Opt-in network smoke test. Never replaces the offline benchmark fixtures.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const browser=await chromium.launch(chromeOptions({channel:'chrome',headless:false,args:['--no-sandbox','--disable-dev-shm-usage']})),page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.addInitScript(()=>{AbortSignal.any=AbortSignal.timeout=AbortSignal.prototype.throwIfAborted=undefined;});
  await page.goto('http://localhost:8790/qa/map-lab/index.html?qa=1');await page.bringToFront();await page.waitForFunction(()=>window.__generator);
  page.on('requestfinished',request=>{if(/resource\/.*geojson|api\/interpreter|LION\/FeatureServer\/0\/query/.test(request.url()))console.log('Received',new URL(request.url()).pathname);});
  await page.evaluate(()=>window.__generator.fetchArea());
  const result=await page.evaluate(async()=>{const g=window.__generator,sourceErrors=document.getElementById('error').textContent;await g.generate();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return {bounds:g.result.bounds,osmElements:g.result.data?.elements.length||0,nyc:g.result.nyc.map(s=>({id:s.sourceId,count:s.data.features.length,metadataError:s.metadataError})),sourceErrors,generation:document.getElementById('generation-summary').textContent,stats:g.world?.stats(),issues:g.world?.plan?.issues.filter(i=>i.severity==='error')};});
  await page.screenshot({path:'.tmp/map-lab/live-neighbor.png'});
  await writeFile('.tmp/map-lab/live-smoke.json',JSON.stringify({...result,errors},null,2));console.log(JSON.stringify(result,null,2));
  assert.deepEqual(errors,[]);assert.doesNotMatch(result.sourceErrors,/AbortSignal|throwIfAborted/);assert.ok(result.osmElements>0,'Live OSM fetch failed');assert.equal(result.nyc.length,NYC_SOURCES.length,'Live NYC source failed');assert.ok(result.stats?.buildings>0&&result.stats.drawCalls>0,'Live generation/drawing failed');
}finally{await browser.close();}
