import {chromeOptions} from '../../browser-launch.mjs';
// Validates real WebGL instrumentation with a texture, then opens the generated report.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {reportDocument} from '../benchmark/frame-report-view.js';
import {summarizeFrames} from '../benchmark/frame-report.js';
await mkdir('.tmp/map-lab',{recursive:true});
import { chromium } from 'playwright-core';
const browser=await chromium.launch(chromeOptions({channel:'chrome',headless:false,args:['--no-sandbox','--disable-dev-shm-usage']})),page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto('http://localhost:8790/qa/map-lab/index.html?qa=1');await page.bringToFront();await page.waitForFunction(()=>window.__generator);await page.evaluate(()=>window.__generator.ensureWorld());
  const result=await page.evaluate(async()=>{
    const T=await import('three'),g=window.__generator.world,p=window.__generator.harness.profiler;g.renderer.setAnimationLoop(null);
    const scene=new T.Scene(),camera=new T.PerspectiveCamera(50,1,.1,100);camera.position.z=3;
    const texture=new T.DataTexture(new Uint8Array([255,128,32,255]),1,1);texture.needsUpdate=true;
    const geometry=new T.PlaneGeometry(2,2),material=new T.MeshBasicMaterial({map:texture}),mesh=new T.Mesh(geometry,material);scene.add(mesh);
    const original=g.renderer.getContext().texImage2D,burn=ms=>{const start=performance.now();while(performance.now()-start<ms){}};
    p.start();p.beginFrame('known-work');p.measure('controls',()=>burn(4));p.measure('simulation',()=>{p.measure('ground',()=>burn(2));p.measure('collision',()=>burn(2))});p.render(()=>g.renderer.render(scene,camera));p.endFrame({});
    const report=await p.stop();const restored=g.renderer.getContext().texImage2D===original;
    texture.dispose();geometry.dispose();material.dispose();return {report,restored};
  });
  const f=result.report.frames[0];assert.ok(f.cpu.controls>=3.5);assert.ok(f.cpu.simulation>=3.5);assert.ok(f.cpu.ground>=1.5);assert.ok(f.cpu.collision>=1.5);
  assert.ok(f.resources.some(e=>e.kind==='textureUpload'));assert.ok(f.resources.some(e=>e.kind==='bufferUpload'));assert.ok(f.resources.some(e=>e.kind==='shaderSetup'));assert.ok(result.restored);
  assert.ok(['valid','unsupported','disjoint'].includes(f.gpuStatus));if(f.gpuStatus==='valid')assert.ok(f.gpuMs>=0);
  console.log('PASS: known CPU work, real texture/buffer/shader instrumentation, asynchronous GPU timing and cleanup', {cpu:f.cpu,gpuStatus:f.gpuStatus,gpuMs:f.gpuMs});
  const modes=['walk-turn','run-turn'],raw={...result.report,frames:modes.map(phase=>({...f,phase,pose:{position:[0,0,0],quaternion:[0,0,0,1],yaw:0,pitch:0}}))};
  const summaries=Object.fromEntries(await Promise.all(modes.map(async mode=>[mode,await summarizeFrames(raw,mode)])));
  const report={schema:4,status:'complete',config:{modes},runs:[{repeat:0,metadata:{gpu:'Browser test'},summaries,raw}]};
  await page.route('**/chart-test-report',route=>route.fulfill({contentType:'text/html',body:reportDocument(report)}));
  await page.goto('http://localhost:8790/chart-test-report');await page.waitForSelector('.frame-overview svg');
  assert.match(await page.locator('.frame-overview').textContent(),/60 FPS/);
  await page.locator('.frame-overview').getByText('Controls',{exact:true}).click();
  assert.equal(await page.evaluate(async()=>{const E=await import('/vendor/echarts/echarts.esm.min.js');return E.getInstanceByDom(document.querySelector('.frame-overview')).getOption().legend[0].selected.Controls;}),false,'legend click hides a stage');
  await page.locator('.frame-overview').getByText('Controls',{exact:true}).click();
  await page.selectOption('[data-activity]','walk-turn');assert.match(await page.locator('.frame-overview').textContent(),/Walk \+ turn/);assert.doesNotMatch(await page.locator('.frame-overview').textContent(),/Run \+ turn/);
  await page.selectOption('[data-activity]','all');await page.selectOption('#scenario','0|walk-turn');assert.match(await page.textContent('body'),/Ground and collision are included/);
  assert.ok(await page.locator('#chart svg').count());await page.screenshot({path:'.tmp/map-lab/frame-profile-report.png'});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  for(const frame of raw.frames){frame.gpuMs=null;frame.gpuStatus='unsupported';}
  for(const mode of modes)report.runs[0].summaries[mode]=await summarizeFrames(raw,mode);
  await page.reload();await page.waitForSelector('.frame-overview svg');
  assert.match(await page.textContent('#results'),/browser\/context does not expose GPU timers/);
  assert.match(await page.textContent('#results'),/GPU timers unsupported/);assert.doesNotMatch(await page.textContent('#results'),/Unavailable ms/);assert.deepEqual(errors,[]);
  console.log('PASS: ECharts stacks, clickable legends, activity filters, frame timeline and mobile layout');
} finally {await browser.close();}
