import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {chromeOptions,verifyHardwareGpu} from '../../browser-launch.mjs';

const browser=await chromium.launch(chromeOptions({args:['--no-sandbox','--disable-dev-shm-usage']}));
try{
  const gpu=await verifyHardwareGpu(browser),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://localhost:8790/qa/map-lab/?qa=1');await page.waitForFunction(()=>window.__generator);
  const sourceId='nysdot-bridge-roadway',feature={type:'Feature',geometry:{type:'Point',coordinates:[-73.99981962,40.70827446]},properties:{OBJECTID:487,BIN:'223201B',Bridge_ROUTE_ID:'275042011',ROUTE_ID:'275042011',FROM_MEASURE:0.281,TO_MEASURE:0.38,Roadway_Type:'Ramp',Lat:40.70827446,Long:-73.99981962}};
  const scene={bounds:{south:40.70,west:-74.02,north:40.72,east:-73.99},data:{elements:[]},nyc:[{sourceId,dataset:'NYSDOT-BRIDGE-ROADWAY',bounds:{south:40.70,west:-74.02,north:40.72,east:-73.99},raw:{layer:{type:'Table'},responses:[{data:{features:[{attributes:feature.properties}]}}]},data:{type:'FeatureCollection',features:[feature]}}]};
  await page.evaluate(async scene=>{window.__generator.load(scene);await window.__generator.generate();},scene);
  const state=await page.evaluate(()=>{const g=window.__generator,d=g.world.plan.details.find(item=>item.sourceId==='nysdot-bridge-roadway');return{execution:g.world.settings.execution,reference:d?.reference,role:d?.sourceRole,measures:[d?.tags.FROM_MEASURE,d?.tags.TO_MEASURE],dimensions:d?.dimensions,estimates:d?.estimates,raw:g.world.plan.observations.records.find(r=>r.sourceId==='nysdot-bridge-roadway')?.snapshot.raw};});
  assert.equal(state.execution,'worker');assert.equal(state.reference,true);assert.equal(state.role,'bridge-roadway-link');assert.deepEqual(state.measures,[0.281,0.38]);assert.deepEqual(state.dimensions,{});assert.deepEqual(state.estimates,[]);assert.deepEqual(state.raw,scene.nyc[0].raw);
  await page.click('#help-open');assert.match(await page.locator('#source-rows').textContent(),/NYSDOT bridge-roadway relationships/);assert.match(await page.locator('#merge-rule-transport-inventory').textContent(),/bridge-roadway/);await page.click('#help-close');
  assert.deepEqual(errors,[]);console.log('PASS bridge-roadway source fields, worker archive restoration and Help on GPU:',gpu.renderer);
}finally{await browser.close();}
