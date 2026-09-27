import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {chromeOptions,verifyHardwareGpu} from '../../browser-launch.mjs';
import {loadFixture} from './fixture.mjs';
const at=process.argv.indexOf('--scene'),scene=at<0?await loadFixture():JSON.parse(await readFile(process.argv[at+1],'utf8'));
const browser=await chromium.launch(chromeOptions({args:['--no-sandbox','--disable-dev-shm-usage']}));
try{
  console.log('GPU',(await verifyHardwareGpu(browser)).renderer);
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.setDefaultTimeout(180000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.text().startsWith('BENCH'))console.log(m.text());});
  await page.goto('http://localhost:8790/qa/map-lab/index.html?qa=1');await page.waitForFunction(()=>window.__generator);
  await page.evaluate(async scene=>{const g=window.__generator;g.load(scene);await g.ensureWorld();const p=g.harness.profiler,mark=p.buildMark,end=p.endBuild;p.buildMark=(name,ms)=>{console.log('BENCH build',name,Math.round(ms));return mark(name,ms);};p.endBuild=()=>{console.log('BENCH build end');return end();};await g.generate();},scene);
  assert.ok(await page.locator('#bench-run').isEnabled());console.log('BENCH initial generation ready');
  await page.evaluate(()=>{const h=window.__generator.harness,replay=h.runReplay;h.runReplay=async(mode,options)=>{console.log('BENCH replay start',mode);const start=performance.now();try{return await replay(mode,options);}finally{console.log('BENCH replay end',mode,Math.round(performance.now()-start));}};});
  await page.evaluate(()=>{window.largeBenchmark=window.__generator.benchmark({frames:10,warmup:2,repeats:1});});
  await page.waitForFunction(()=>!window.__generator.busy,null,{timeout:180000});
  const report=await page.evaluate(()=>window.__generator.report);await writeFile('.tmp/map-lab/large-benchmark.json',JSON.stringify(report,null,2));
  assert.equal(report?.status,'complete',report?.failure);assert.ok(await page.locator('#bench-results .frame-overview svg').count());assert.deepEqual(errors,[]);
  console.log('PASS large captured scene benchmark and charts');
}finally{await browser.close();}
