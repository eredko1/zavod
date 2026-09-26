import {chromeOptions} from '../../browser-launch.mjs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch(chromeOptions({channel:'chrome',headless:false,args:['--no-sandbox','--disable-dev-shm-usage']}));
try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:8790/qa/map-lab/index.html?qa=1');await page.waitForFunction(()=>window.__generator);
  const checks=await page.evaluate(async()=>{
    const {initNYCLayers}=await import('/qa/map-lab/ui/nyc-layers.js'),root=document.createElement('div');
    root.innerHTML='<div id="nyc-sources"></div><div id="details"></div><svg xmlns="http://www.w3.org/2000/svg"></svg>';document.body.append(root);
    const svg=root.querySelector('svg');let inspections=0;
    const layers=initNYCLayers({root,svg,project:p=>[p.lon,p.lat],mapBounds:()=>({south:40.57,north:40.58,west:-73.99,east:-73.97}),inspected:()=>inspections++,changed(){}});
    layers.restore([{sourceId:'nyc-roadbed',data:{features:[{geometry:{type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,0]]]},properties:{source_id:1}}]}}]);layers.render();
    const path=svg.querySelector('path'),send=(target,type,x=0)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,clientX:x,clientY:0}));
    send(path,'pointerdown');send(svg,'pointerup');path.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));const click=inspections;
    send(path,'pointerdown');send(svg,'pointermove',20);send(svg,'pointermove',0);send(svg,'pointerup');path.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));const drag=inspections;
    send(path,'pointerdown');send(svg,'pointercancel');send(svg,'pointerup');const cancel=inspections;
    root.remove();return {click,drag,cancel};
  });
  assert.deepEqual(checks,{click:1,drag:1,cancel:1});assert.deepEqual(errors,[]);console.log('PASS NYC pointer selection occurs once, drag-and-return and cancellation do not select');
}finally{await browser.close();}
