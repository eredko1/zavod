import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {chromeOptions} from '../../browser-launch.mjs';
const browser=await chromium.launch(chromeOptions({args:['--no-sandbox','--disable-dev-shm-usage']}));
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
  await page.goto('http://localhost:8790/qa/map-lab/?qa=1');await page.waitForFunction(()=>window.__generator);
  const placement=await page.evaluate(async()=>{
    const g=window.__generator,bounds={south:0,west:0,north:.001,east:.001},ring=[[0,0],[.001,0],[.001,.001],[0,.001],[0,0]];
    g.load({bounds,data:{elements:[{type:'node',id:99,lat:.0005,lon:.0005,tags:{amenity:'bench'}}]},nyc:[{sourceId:'nyc-boardwalk',bounds,data:{type:'FeatureCollection',features:[{type:'Feature',properties:{source_id:1,feat_code:4300},geometry:{type:'Polygon',coordinates:[ring]}}]}}]});await g.generate();
    const w=g.world,f=w.plan.details.find(f=>f.id==='node/99'),base=f.attributes.placement.value;
    w.setSourceVisible('nyc-boardwalk',false);const hidden=f.attributes.placement.value,ground=w.groundAt(...f.point);w.setSourceVisible('nyc-boardwalk',true);
    return {base,hidden,ground,restored:f.attributes.placement.value};
  });
  assert.equal(placement.hidden,placement.ground);assert.ok(placement.base>placement.hidden);assert.equal(placement.restored,placement.base);
  const lifecycle=await page.evaluate(async()=>{
    const {createAreaPicker}=await import('/qa/map-lab/ui/area-picker.js'),{createMapPreview}=await import('/qa/map-lab/ui/map-preview.js');
    const dialog=document.getElementById('area-picker').cloneNode(true);document.body.append(dialog);let calls=0;
    const area={south:40.5752,north:40.5799,west:-73.9798,east:-73.976},picker=createAreaPicker(dialog,{onApply:()=>calls++});picker.open(area);picker.dispose();
    dialog.querySelector('#area-use').click();const afterDispose=calls;
    const replacement=createAreaPicker(dialog,{onApply:()=>calls++});replacement.open(area);dialog.querySelector('#area-use').click();replacement.dispose();dialog.remove();
    const root=document.getElementById('layout').cloneNode(true);root.querySelector('#nyc-sources').replaceChildren();root.querySelector('#layers').replaceChildren();root.querySelector('#map').replaceChildren();document.body.append(root);
    let merges=0;const options={onMerge:()=>merges++},view=createMapPreview(root,options),input={data:{elements:[{type:'way',id:1,tags:{highway:'footway'},geometry:[{lat:40.576,lon:-73.978},{lat:40.577,lon:-73.978}]}]},nyc:[]};
    view.setArea(area);view.load(input);view.fit();view.dispose();const before=merges,svg=root.querySelector('#map'),oldBox=svg.getAttribute('viewBox');
    root.querySelector('#merge-enabled').dispatchEvent(new Event('change'));svg.dispatchEvent(new KeyboardEvent('keydown',{key:'+'}));const inert=merges===before&&svg.getAttribute('viewBox')===oldBox;
    const next=createMapPreview(root,options);next.setArea(area);next.load(input);next.fit();const width=()=>Number(svg.getAttribute('viewBox').split(' ')[2]),first=width();svg.dispatchEvent(new KeyboardEvent('keydown',{key:'+'}));const zoom=width()/first;
    next.dispose();root.remove();return {afterDispose,calls,inert,zoom};
  });
  assert.deepEqual(lifecycle,{afterDispose:0,calls:1,inert:true,zoom:.75});assert.deepEqual(errors,[]);
  const multipart=await page.evaluate(()=>{const g=window.__generator,bounds={south:0,west:0,north:.001,east:.001};g.load({bounds,nyc:[{sourceId:'nyc-elevation',bounds,data:{features:[{type:'Feature',properties:{source_id:1,sub_code:300000,elevation:10},geometry:{type:'MultiPoint',coordinates:[[.0002,.0002],[.0008,.0008]]}}]}}]});return {svg:[...document.querySelectorAll('[data-nyc-feature]')].map(p=>p.dataset.nycFeature).sort(),plan:g.previewPlan.details.map(f=>f.id).sort()};});
  assert.equal(multipart.svg.length,2);assert.deepEqual(multipart.svg,multipart.plan);
  const malformed=await page.evaluate(async()=>{
    const g=window.__generator,input=structuredClone(g.result);
    input.nyc[0].data.features.push({type:'Feature',properties:{source_id:2,sub_code:300000,elevation:10},geometry:{type:'MultiPoint',coordinates:null}});
    g.load(input);await g.generate();
    return {svg:document.querySelectorAll('[data-nyc-feature]').length,details:g.world.plan.details.length,errors:g.world.plan.issues.filter(i=>i.code==='invalid-geometry').length,skipped:g.previewPlan.coverage.filter(c=>c.status==='skipped').length,canBenchmark:!document.getElementById('bench-run').disabled};
  });
  assert.deepEqual(malformed,{svg:2,details:2,errors:1,skipped:1,canBenchmark:true});assert.deepEqual(errors,[]);
  console.log('PASS cached boardwalk prop placement and UI dispose/recreate lifecycle');
}finally{await browser.close();}
