import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {chromeOptions} from '../../browser-launch.mjs';

const browser=await chromium.launch(chromeOptions({args:['--no-sandbox','--disable-dev-shm-usage']}));
try{
  const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:8790/qa/map-lab/?qa=1');await page.waitForFunction(()=>window.__generator);
  await page.evaluate(async()=>{const {downloadJSON}=await import('./ui/download.js');const button=document.createElement('button');button.id='export-test';button.onclick=()=>downloadJSON({source:'exact',zero:0,text:'😀\n"'},'source.json');document.body.append(button);});
  const [first]=await Promise.all([page.waitForEvent('download'),page.click('#export-test')]);assert.deepEqual(JSON.parse(await readFile(await first.path(),'utf8')),{source:'exact',zero:0,text:'😀\n"'});assert.equal(first.suggestedFilename(),'source.json');
  const stages=await page.evaluate(()=>window.__generator.diagnostics.snapshot().current.events.filter(e=>e.kind==='download-stage'&&e.detail.filename==='source.json').map(e=>e.detail.stage));for(const stage of ['requested','worker-activated','controller-ready','stream-posted','ready','dispatched','serialized'])assert.ok(stages.includes(stage),'download checkpoint missing '+stage);
  const worker=context.serviceWorkers()[0];
  let unclaimedURL,consumedURL;
  for(const attribute of [true,false]){
    const url=await page.evaluate(async attribute=>{
      const token=crypto.randomUUID(),channel=new MessageChannel(),stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"complete":true}'));controller.close();}}),ready=new Promise(resolve=>channel.port1.onmessage=()=>{channel.port1.close();resolve();});
      navigator.serviceWorker.controller.postMessage({token,filename:'controlled.json',stream},[stream,channel.port2]);await ready;
      const anchor=document.createElement('a');anchor.id='controlled-export';anchor.href=new URL('__download/'+token,location.href);anchor.textContent='Controlled export';if(attribute)anchor.download='controlled.json';document.body.append(anchor);return anchor.href;
    },attribute);
    const [download]=await Promise.all([page.waitForEvent('download'),page.click('#controlled-export')]);
    const token=url.split('/').at(-1);
    if(attribute){unclaimedURL=url;assert.equal(await download.failure(),'canceled');assert.equal(await worker.evaluate(token=>downloads.has(token),token),true,'forced download bypasses the worker and leaves its stream unclaimed');}
    else{consumedURL=url;assert.equal(await download.failure(),null);assert.deepEqual(JSON.parse(await readFile(await download.path(),'utf8')),{complete:true});assert.equal(await worker.evaluate(token=>downloads.has(token),token),false,'attachment navigation consumes the one-use stream');}
    await page.locator('#controlled-export').evaluate(e=>e.remove());
  }
  assert.equal(await page.evaluate(async()=>{const url=new URL('__download/'+crypto.randomUUID(),location.href);return (await fetch(url)).status;}),404);
  assert.equal(await page.evaluate(async url=>(await fetch(url)).status,consumedURL),404,'a consumed token cannot be replayed');
  assert.equal(await page.evaluate(async url=>(await fetch(url,{method:'POST'})).status,unclaimedURL),405);assert.equal(await worker.evaluate(token=>downloads.has(token),unclaimedURL.split('/').at(-1)),true,'a rejected method cannot consume a pending stream');
  assert.match(await page.evaluate(async()=>{const {downloadJSON}=await import('./ui/download.js');try{await downloadJSON({},'bad\nname');}catch(error){return error.message;}}),/Invalid JSON download filename/);
  assert.deepEqual(errors,[]);console.log('PASS exact streamed attachment, filename and unknown-token gate; controlled download-attribute comparison proves worker bypass');
}finally{await browser.close();}
