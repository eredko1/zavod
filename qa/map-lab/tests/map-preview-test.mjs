import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {chromeOptions} from '../../browser-launch.mjs';
import {loadFixture} from './fixture.mjs';
const browser=await chromium.launch(chromeOptions({args:['--no-sandbox','--disable-dev-shm-usage']}));
try {
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:8790/qa/map-lab/index.html?qa=1');await page.waitForFunction(()=>window.__generator);
  await page.evaluate(scene=>window.__generator.load(scene),await loadFixture());
  const reuse=await page.evaluate(()=>{
    const g=window.__generator,input=g.result,osm=[...document.querySelectorAll('#map [data-feature]')],regional=[...document.querySelectorAll('#map [data-nyc-feature]')],oldMerge=JSON.stringify(g.previewPlan.merge),originalRecord=g.previewPlan.observations.records.find(r=>r.sourceId===input.nyc[0].sourceId);
    const changed={...input.nyc[0],raw:{...input.nyc[0].raw,previewProvenance:'replacement archive with unchanged geographic records'}};
    g.load({...input,nyc:[changed,...input.nyc.slice(1)]});
    const retained=g.previewPlan.observations.records.find(r=>r.sourceId===changed.sourceId);
    return {osm:osm.every(node=>node.isConnected),regional:regional.every(node=>node.isConnected),mergeSame:JSON.stringify(g.previewPlan.merge)===oldMerge,newArchive:retained.snapshot.raw===changed.raw,oldArchivePreserved:originalRecord.snapshot.raw!==changed.raw};
  });
  assert.deepEqual(reuse,{osm:true,regional:true,mergeSame:true,newArchive:true,oldArchivePreserved:true},'unchanged geometry reuses SVG nodes while the latest full provenance is attached to a fresh source merge');
  const replacement=await page.evaluate(()=>{
    const g=window.__generator,input=g.result,source=input.nyc[0],group=document.querySelector(`[data-nyc-source="${source.sourceId}"]`),other=[...document.querySelectorAll('[data-nyc-source]')].filter(node=>node!==group),changed={...source,data:structuredClone(source.data)};
    g.load({...input,nyc:[changed,...input.nyc.slice(1)]});const changedOnly=!group.isConnected&&other.every(node=>node.isConnected);
    g.load({...input,nyc:input.nyc.slice(1)});const removed=!document.querySelector(`[data-nyc-source="${source.sourceId}"]`);
    g.load({...input,nyc:[...input.nyc].reverse()});const order=[...document.querySelectorAll('[data-nyc-source]')].map(node=>node.dataset.nycSource),expected=input.nyc.map(source=>source.sourceId);
    const osm=document.querySelector('[data-feature]');g.load({...input,bounds:{...input.bounds,north:input.bounds.north+.00001}});const areaRebuilt=!osm.isConnected;
    g.load(input);return {changedOnly,removed,order,expected,areaRebuilt};
  });
  assert.equal(replacement.changedOnly,true);assert.equal(replacement.removed,true);assert.deepEqual(replacement.order,replacement.expected,'inserting an earlier source preserves registry paint order');assert.equal(replacement.areaRebuilt,true,'area/projection changes invalidate reused geometry');
  const sourceOnly=await page.evaluate(()=>{const g=window.__generator,plan=g.previewPlan,input=g.result;document.getElementById('storey').value=0;document.getElementById('storey').dispatchEvent(new Event('change',{bubbles:true}));g.load(input);const same=JSON.stringify(plan.merge)===JSON.stringify(g.previewPlan.merge);document.getElementById('storey').value=3;document.getElementById('storey').dispatchEvent(new Event('change',{bubbles:true}));return {render:!!g.previewPlan.render,same,estimates:[...g.previewPlan.buildings,...g.previewPlan.roads,...g.previewPlan.details].flatMap(f=>f.estimates||[])};});
  assert.deepEqual(sourceOnly,{render:false,same:true,estimates:[]},'source preview neither prepares models nor depends on render dimensions');
  await page.evaluate(()=>window.__generator.generate());
  const excluded=await page.evaluate(()=>window.__generator.world.plan.render.decisions.find(r=>r.status==='excluded')?.members[0].id);
  await page.click('#tab-2d');
  await page.locator('details:has(> #live-log) > summary').click();
  assert.ok(excluded,'fixture exercises tree-placement exclusions');await page.locator('#merge-log-search').fill(excluded);assert.ok(await page.locator('#merge-results button').count());assert.equal(await page.locator(`#map [data-feature="${excluded}"],#map [data-nyc-feature="${excluded}"]`).isVisible(),true,'render exclusion leaves the measured source visible in 2D with its log available');await page.locator('#merge-log-search').fill('');
  await page.evaluate(()=>{window.previewNodes={paths:[...document.querySelectorAll('#map [data-nyc-feature]')],defs:document.querySelector('#map [data-merge-defs]'),plan:window.__generator.previewPlan};});
  for(const source of ['nyc-buildings','nyc-sidewalk','nyc-trees']){
    const control=page.locator(`[data-source-visible="${source}"]`),group=page.locator(`#map [data-nyc-source="${source}"]`);
    await control.uncheck();assert.ok(await group.isHidden(),`${source} hides immediately`);
    await control.check();assert.ok(await group.isVisible(),`${source} returns immediately`);
  }
  assert.ok(await page.evaluate(()=>{const before=window.previewNodes,after=[...document.querySelectorAll('#map [data-nyc-feature]')];delete window.previewNodes;return before.paths.length===after.length&&after.every((p,i)=>p===before.paths[i])&&before.plan!==window.__generator.previewPlan;}),'source checkboxes reuse raw paths and resolve the new input selection');
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
    group.remove();const city=element('path',{'data-nyc-feature':'bed',d:'M0 0H100V100H0Z',fill:'red'},svg),cityPlan={merge:{enabled:true,suppressed:[]},roads:[],details:[{id:'bed',paths:[],shapes:road.shapes,mergeMasks:[shape]}]};display2DMerge(svg,cityPlan);
    image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));await image.decode();ctx.clearRect(0,0,100,100);ctx.drawImage(image,0,0);const cityPixels=[alpha(5,5),alpha(20,20),alpha(50,50)];
    display2DMerge(svg,{...cityPlan,merge:{enabled:false}});const cityRestored=!city.hasAttribute('mask')&&city.getAttribute('d')==='M0 0H100V100H0Z';
    // Many roads share dense, distant polygons. Storage must grow with unique outlines, not road × polygon vertices.
    svg.replaceChildren();const shapes=Array.from({length:200},(_,i)=>{const x=(i%20)*100,y=Math.floor(i/20)*100;return {outer:Array.from({length:128},(_,j)=>{const a=j*Math.PI*2/128;return [x+30*Math.cos(a),y+30*Math.sin(a)];}),holes:[]};});
    const roads=Array.from({length:1000},(_,i)=>{const x=(i%20)*100,y=Math.floor(i/20)*20;const g=element('g',{'data-feature':String(i)},svg);element('path',{d:`M${x},${y}h50`,fill:'none'},g);return {id:String(i),sourcePaths:[[[x,y],[x+50,y]]],paths:[[[x,y],[x+50,y]]],shapes:[],mergeMasks:shapes};});
    display2DMerge(svg,{merge:{enabled:true,suppressed:[]},roads});
    const counts={outlines:svg.querySelectorAll('defs > path').length,copies:svg.querySelectorAll('mask path').length,uses:svg.querySelectorAll('mask use').length,bytes:svg.outerHTML.length};
    display2DMerge(svg,{merge:{enabled:true,suppressed:[]},roads});counts.defs=svg.querySelectorAll('defs').length;
    return {pixels,restored,cityPixels,cityRestored,counts};
  });
  assert.deepEqual(result.pixels,[255,0,255],'outside remains visible, sidewalk hidden, courtyard hole preserved');assert.ok(result.restored,'merge toggle restores original geometry');
  assert.deepEqual(result.cityPixels,[255,0,255],'direct NYC paths use the same deck masks');assert.ok(result.cityRestored,'NYC paths restore on merge toggle');
  assert.equal(result.counts.outlines,200);assert.equal(result.counts.copies,0);assert.ok(result.counts.uses<10000,'distant polygons excluded');assert.ok(result.counts.bytes<2e6,'dense outlines stored once');assert.equal(result.counts.defs,1);assert.deepEqual(errors,[]);
  console.log('PASS SVG holes, mask sharing, merge toggle and bounded 2 km preview storage',result.counts);
} finally {await browser.close();}
