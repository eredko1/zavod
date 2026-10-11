import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {chromeOptions,verifyHardwareGpu} from '../../browser-launch.mjs';

const browser=await chromium.launch(chromeOptions({args:['--no-sandbox','--disable-dev-shm-usage']}));
try{
  const gpu=await verifyHardwareGpu(browser),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://localhost:8790/qa/map-lab/?qa=1');await page.waitForFunction(()=>window.__generator);
  const bounds={south:40.70,west:-74.02,north:40.72,east:-73.99},properties={OBJECTID:9548,BIN:'2268930',CARRIED_1:'PEDESTRIAN BRIDGE',CROSSED_1:'I-478',MIN_VERT_CLEARANCE_ON:0,MIN_VERT_CLEARANCE_UNDER:13.67,POSTED_VRT_CLRNC_UNDER:0,PERMITTED_VC_UNDER:13.42,INSPECTION_DATE:1762387200000,CONDITION_RATING:6.51599979},feature={type:'Feature',geometry:{type:'Point',coordinates:[-74.01484534552868,40.70620211749575]},properties},raw={layer:{name:'Height Restricted Bridges',geometryType:'esriGeometryPoint'},responses:[{data:{features:[{attributes:{...properties,CONDITION_RATING:6.516}}]}}]},scene={bounds,data:{elements:[]},nyc:[{sourceId:'nysdot-height-restricted-bridges',dataset:'NYSDOT-HEIGHT-RESTRICTED-BRIDGES',bounds,raw,data:{type:'FeatureCollection',features:[feature]}}]};
  await page.evaluate(async input=>{window.__generator.load(input);await window.__generator.generate();},scene);
  const state=await page.evaluate(()=>{const g=window.__generator,d=g.world.plan.details.find(item=>item.sourceId==='nysdot-height-restricted-bridges');return{execution:g.world.settings.execution,reference:d?.reference,role:d?.sourceRole,ruleId:d?.merge?.ruleId,tags:d?.tags,dimensions:d?.dimensions,estimates:d?.estimates,raw:g.world.plan.observations.records.find(r=>r.sourceId==='nysdot-height-restricted-bridges')?.snapshot.raw};});
  assert.equal(state.execution,'worker');assert.equal(state.reference,true);assert.equal(state.role,'bridge-clearance-observation');assert.equal(state.ruleId,'bridge-clearance-inventory');assert.deepEqual(state.tags,properties);assert.deepEqual(state.dimensions,{});assert.deepEqual(state.estimates,[]);assert.deepEqual(state.raw,raw);
  await page.click('#help-open');assert.match(await page.locator('#source-rows').textContent(),/NYSDOT height-restricted bridges/);assert.match(await page.locator('#merge-rule-bridge-clearance-inventory').textContent(),/reported numeric values/);await page.click('#help-close');
  assert.deepEqual(errors,[]);console.log('PASS height-restricted bridge worker retention and Help on GPU:',gpu.renderer);
}finally{await browser.close();}
