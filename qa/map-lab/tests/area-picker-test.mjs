import {chromeOptions} from '../../browser-launch.mjs';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
await mkdir('.tmp/map-lab',{recursive:true});
const browser=await chromium.launch(chromeOptions({channel:'chrome',headless:false,args:['--no-sandbox','--disable-dev-shm-usage']})),page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],external=[];
page.on('pageerror',e=>errors.push(e.message));let tileRequests=0,failTiles=false;
// Never automate requests to public tile servers. These tests use a local response stub.
await page.route('https://tile.openstreetmap.org/**',r=>{tileRequests++;return r.fulfill(failTiles?{status:503,body:''}:{contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#d3dcc5"/><path d="M0 64H256M64 0V256" stroke="#fff" stroke-width="12"/></svg>'});});
page.on('request',r=>{if(!['localhost','tile.openstreetmap.org'].includes(new URL(r.url()).hostname))external.push(r.url());});
const values=()=>page.evaluate(()=>Object.fromEntries(['south','west','north','east'].map(k=>[k,document.getElementById('area-'+k).valueAsNumber])));
try{
  await page.goto('http://localhost:8790/qa/map-lab/index.html?qa=1');await page.waitForFunction(()=>window.__generator);assert.equal(tileRequests,0,'closed picker makes no tile requests');
  const initial=await values();assert.equal(initial.west,-73.9798);
  await page.evaluate(()=>window.__generator.load({bounds:{south:40.5752,west:-73.9798,north:40.5799,east:-73.976},data:{elements:[{type:'way',id:1,tags:{highway:'footway'},geometry:[{lat:40.577,lon:-73.978},{lat:40.5771,lon:-73.978}]}]},nyc:[]}));
  const loaded=await page.evaluate(()=>window.__generator.result.bounds);
  await page.click('#area-choose');await page.waitForFunction(()=>document.querySelectorAll('#area-tiles img').length>0);assert.equal(await page.locator('#area-preset').inputValue(),'coney');
  const originalCenter=await page.getAttribute('#area-map','aria-label'),map=await page.locator('#area-map').boundingBox();await page.mouse.move(map.x+map.width/2,map.y+map.height/2);await page.mouse.down();await page.mouse.move(map.x+map.width/2+90,map.y+map.height/2+30,{steps:5});await page.mouse.up();assert.notEqual(await page.getAttribute('#area-map','aria-label'),originalCenter,'drag changes the selected geographic center');
  await page.click('#area-dismiss');await page.waitForFunction(()=>!document.querySelector('#area-tiles img'));assert.deepEqual(await values(),initial);assert.ok(await page.locator('#generate').isEnabled());
  await page.click('#area-choose');await page.click('#area-use');assert.ok(await page.locator('#generate').isEnabled(),'applying unchanged bounds preserves loaded data');
  await page.click('#area-choose');await page.selectOption('#area-preset','neighbor');await page.click('#area-use');assert.equal((await values()).east,-73.9798);assert.ok(await page.locator('#generate').isDisabled());assert.deepEqual(await page.evaluate(()=>window.__generator.result.bounds),loaded,'unfetched draft does not relabel loaded source data');
  const pending=await values();await page.click('#area-choose');await page.selectOption('#area-size','1000');const before=await page.locator('#area-box').boundingBox();await page.click('#area-zoom-in');const after=await page.locator('#area-box').boundingBox();assert.ok(after.width>before.width);assert.match(await page.textContent('#area-size-label'),/1000 × 1000/);
  await page.locator('#area-map').focus();await page.keyboard.press('ArrowRight');await page.click('#area-use');assert.notDeepEqual(await values(),pending);
  const selected=await values();await page.click('#area-choose');await page.selectOption('#area-preset','coney');await page.keyboard.press('Escape');assert.deepEqual(await values(),selected);
  await page.click('#area-choose');await page.selectOption('#area-preset','coney');await page.click('#area-use');assert.deepEqual(await values(),initial);
  await page.locator('#area-coordinates > summary').click();await page.fill('#area-west','');await page.click('#area-fetch');assert.match(await page.textContent('#area-status'),/Invalid geographic bounds/);await page.fill('#area-west',String(initial.west));
  // New coordinates force an uncached tile request; reusing loaded images cannot simulate an outage.
  for(const [key,value]of Object.entries({south:51.499,west:-.122,north:51.502,east:-.118}))await page.fill('#area-'+key,String(value));
  failTiles=true;await page.click('#area-choose');await page.waitForFunction(()=>document.getElementById('area-map-status').textContent.includes('unavailable'));await page.click('#area-dismiss');
  const stopped=tileRequests;await page.waitForTimeout(300);assert.equal(tileRequests,stopped,'closed dialog has no tile scheduler');
  failTiles=false;await page.setViewportSize({width:390,height:844});await page.click('#area-choose');await page.waitForTimeout(250);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await page.locator('.area-attribution').isVisible());await page.screenshot({path:'.tmp/map-lab/area-picker-mobile.png'});
  await page.setViewportSize({width:1280,height:900});await page.waitForTimeout(250);await page.screenshot({path:'.tmp/map-lab/area-picker.png'});await page.click('#area-dismiss');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS drag, zoom, size, presets, cancel/Escape, pending-area isolation, missing bounds, tile failure/cleanup, mobile layout and attribution');
}catch(error){console.log('Picker failure',await page.evaluate(()=>({status:document.getElementById('area-map-status').textContent,images:[...document.querySelectorAll('#area-tiles img')].map(i=>({src:i.src,complete:i.complete,width:i.naturalWidth}))})),{tileRequests,errors});throw error;}finally{await browser.close();}
