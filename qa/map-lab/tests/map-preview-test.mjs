import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {chromeOptions} from '../../browser-launch.mjs';
const browser=await chromium.launch(chromeOptions({args:['--no-sandbox','--disable-dev-shm-usage']}));
try {
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:8790/qa/map-lab/index.html?qa=1');await page.waitForFunction(()=>window.__generator);
  const result=await page.evaluate(async()=>{
    const {display2DMerge}=await import('/qa/map-lab/ui/map-merge-2d.js');
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('width',100);svg.setAttribute('height',100);
    const element=(tag,attrs,parent)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);parent.append(e);return e;};
    const box=(x,y,w)=>({outer:[[x,y],[x+w,y],[x+w,y+w],[x,y+w]],holes:[]});
    const shape=box(10,10,80);shape.holes=[box(40,40,20).outer];
    const group=element('g',{'data-feature':'road'},svg),node=element('path',{d:'M0 0H100V100H0Z',fill:'red'},group);
    const road={id:'road',sourcePaths:[],paths:[],shapes:[box(0,0,100)],mergeMasks:[shape]};
    const plan={merge:{enabled:true,suppressed:[]},roads:[road]};display2DMerge(svg,plan);
    const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));await image.decode();
    const canvas=document.createElement('canvas');canvas.width=canvas.height=100;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    const alpha=(x,y)=>ctx.getImageData(x,y,1,1).data[3],pixels=[alpha(5,5),alpha(20,20),alpha(50,50)];
    display2DMerge(svg,{...plan,merge:{enabled:false}});const restored=!node.hasAttribute('mask')&&node.getAttribute('d')==='M0 0H100V100H0Z'&&!svg.querySelector('defs');
    // Many roads share dense, distant polygons. Storage must grow with unique outlines, not road × polygon vertices.
    svg.replaceChildren();const shapes=Array.from({length:200},(_,i)=>{const x=(i%20)*100,y=Math.floor(i/20)*100;return {outer:Array.from({length:128},(_,j)=>{const a=j*Math.PI*2/128;return [x+30*Math.cos(a),y+30*Math.sin(a)];}),holes:[]};});
    const roads=Array.from({length:1000},(_,i)=>{const x=(i%20)*100,y=Math.floor(i/20)*20;const g=element('g',{'data-feature':String(i)},svg);element('path',{d:`M${x},${y}h50`,fill:'none'},g);return {id:String(i),sourcePaths:[[[x,y],[x+50,y]]],paths:[[[x,y],[x+50,y]]],shapes:[],mergeMasks:shapes};});
    display2DMerge(svg,{merge:{enabled:true,suppressed:[]},roads});
    const counts={outlines:svg.querySelectorAll('defs > path').length,copies:svg.querySelectorAll('mask path').length,uses:svg.querySelectorAll('mask use').length,bytes:svg.outerHTML.length};
    display2DMerge(svg,{merge:{enabled:true,suppressed:[]},roads});counts.defs=svg.querySelectorAll('defs').length;
    return {pixels,restored,counts};
  });
  assert.deepEqual(result.pixels,[255,0,255],'outside remains visible, sidewalk hidden, courtyard hole preserved');assert.ok(result.restored,'merge toggle restores original geometry');
  assert.equal(result.counts.outlines,200);assert.equal(result.counts.copies,0);assert.ok(result.counts.uses<10000,'distant polygons excluded');assert.ok(result.counts.bytes<2e6,'dense outlines stored once');assert.equal(result.counts.defs,1);assert.deepEqual(errors,[]);
  console.log('PASS SVG holes, mask sharing, merge toggle and bounded 2 km preview storage',result.counts);
} finally {await browser.close();}
