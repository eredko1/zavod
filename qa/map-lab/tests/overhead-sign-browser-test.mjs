import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {chromeOptions,verifyHardwareGpu} from '../../browser-launch.mjs';

const browser=await chromium.launch(chromeOptions({args:['--no-sandbox','--disable-dev-shm-usage']}));
try{
  const gpu=await verifyHardwareGpu(browser),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://localhost:8790/qa/map-lab/?qa=1');await page.waitForFunction(()=>window.__generator);
  const bounds={south:40.70,west:-74.02,north:40.72,east:-73.99},properties={OBJECTID:42,AssetID:'asset-42',SIN:'S-42',AssetStatus:'Active',EditedDate:1780000000000,GlobalID:'{11111111-2222-3333-4444-555555555555}'},feature={type:'Feature',geometry:{type:'Point',coordinates:[-74.005,40.71]},properties},raw={layer:{name:'Overhead Sign Structure',geometryType:'esriGeometryPoint'},responses:[{data:{features:[{attributes:properties}]}}]},scene={bounds,data:{elements:[]},nyc:[{sourceId:'nysdot-overhead-signs',dataset:'NYSDOT-OVERHEAD-SIGN-STRUCTURES',bounds,raw,data:{type:'FeatureCollection',features:[feature]}}]};
  await page.evaluate(async input=>{window.__generator.load(input);await window.__generator.generate();},scene);
  const state=await page.evaluate(()=>{const g=window.__generator,d=g.world.plan.details.find(item=>item.sourceId==='nysdot-overhead-signs');return{execution:g.world.settings.execution,reference:d?.reference,role:d?.sourceRole,ruleId:d?.merge?.ruleId,tags:d?.tags,dimensions:d?.dimensions,estimates:d?.estimates,raw:g.world.plan.observations.records.find(r=>r.sourceId==='nysdot-overhead-signs')?.snapshot.raw};});
  assert.equal(state.execution,'worker');assert.equal(state.reference,true);assert.equal(state.role,'overhead-sign-asset');assert.equal(state.ruleId,'sign-structure-inventory');assert.deepEqual(state.tags,properties);assert.deepEqual(state.dimensions,{});assert.deepEqual(state.estimates,[]);assert.deepEqual(state.raw,raw);
  await page.click('#help-open');assert.match(await page.locator('#source-rows').textContent(),/NYSDOT overhead sign structures/);assert.match(await page.locator('#merge-rule-sign-structure-inventory').textContent(),/sign-asset namespace/);await page.click('#help-close');
  assert.deepEqual(errors,[]);console.log('PASS overhead sign worker retention and Help on GPU:',gpu.renderer);
}finally{await browser.close();}
