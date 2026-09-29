import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {chromeOptions,verifyHardwareGpu} from '../../browser-launch.mjs';
import {recordPageDiagnostics} from './page-diagnostics.mjs';
const browser=await chromium.launch(chromeOptions({args:['--no-sandbox','--disable-dev-shm-usage']}));
try{
  await verifyHardwareGpu(browser);const context=await browser.newContext();let page=await context.newPage();const path=recordPageDiagnostics(page,'intentional-crash');await page.goto('http://localhost:8790/qa/map-lab/?qa=1');await page.waitForFunction(()=>window.__generator);
  await page.evaluate(()=>{const d=window.__generator.diagnostics;d.begin('generate',{bounds:{west:-74},sources:[{sourceId:'mesh',records:123}]});d.record('build-stage',{stage:'merge'});});
  console.log('Checkpoint written; deliberately crashing renderer');
  const crashed=page.waitForEvent('crash',{timeout:15000}),session=await page.context().newCDPSession(page);let commandError=null;
  // Page.crash has no response from the destroyed renderer; closing its target ends the command.
  const command=session.send('Page.crash').catch(error=>{commandError=error.message;});await crashed;console.log('Renderer crash observed');
  await page.close();await command;if(commandError)assert.match(commandError,/crash|closed/i);page=await context.newPage();await page.goto('http://localhost:8790/qa/map-lab/?qa=1');await page.waitForFunction(()=>window.__generator);const state=await page.evaluate(()=>window.__generator.diagnostics.snapshot());
  const external=(await readFile(path,'utf8')).trim().split('\n').map(line=>JSON.parse(line));assert.ok(external.some(e=>e.kind==='page-crash'));assert.equal(external.filter(e=>e.kind==='checkpoint').at(-1).detail.event.detail.stage,'merge','last checkpoint must survive outside the destroyed renderer');
  assert.equal(state.previous.operation.status,'active');assert.equal(state.previous.events.at(-1).detail.stage,'merge');assert.equal(state.previous.context.sources[0].records,123);assert.match(await page.locator('#diagnostic-status').textContent(),/interrupted/);
  await page.locator('details:has(#diagnostic-download) > summary').click();const [download]=await Promise.all([page.waitForEvent('download'),page.click('#diagnostic-download')]);const exported=JSON.parse(await readFile(await download.path(),'utf8'));assert.deepEqual(exported.previous,state.previous);
  await page.evaluate(()=>setTimeout(()=>{throw Error('injected diagnostic exception');},0));await page.waitForFunction(()=>window.__generator.diagnostics.snapshot().current.events.some(e=>e.kind==='uncaught-error'&&e.detail.message.includes('injected diagnostic exception')));
  await page.evaluate(async()=>{await window.__generator.ensureWorld();window.__generator.world.renderer.getContext().getExtension('WEBGL_lose_context').loseContext();});await page.waitForFunction(()=>window.__generator.diagnostics.snapshot().current.events.some(e=>e.kind==='webglcontextlost'));
  console.log('PASS checkpoints survive intentional renderer crash/reopen, exact export, uncaught errors and WebGL context loss');
}finally{await browser.close();}
