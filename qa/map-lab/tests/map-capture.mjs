import {NYC_SOURCES} from '../data/map-sources.js';
import {chromeOptions} from '../../browser-launch.mjs';
// Explicit live fixture capture through the same generator APIs used interactively.
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {CONEY_BOUNDS,validateArea,inNYC} from '../data/generator-area.js';
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const output=arg('--output','.tmp/map-lab'),area=arg('--area',null);
const bounds=area?validateArea(Object.fromEntries(['south','west','north','east'].map((key,i)=>[key,Number(area.split(',')[i])]))):CONEY_BOUNDS;
await mkdir(output,{recursive:true});
const browser=await chromium.launch(chromeOptions({channel:'chrome',headless:false,args:['--no-sandbox','--disable-dev-shm-usage']}));
try{
  const page=await browser.newPage();await page.goto('http://localhost:8790/qa/map-lab/index.html?qa=1');await page.waitForFunction(()=>window.__generator);
  await page.locator('#area-coordinates > summary').click();
  page.on('requestfinished',r=>{if(/resource\/.*geojson|api\/interpreter|LION\/FeatureServer\/0\/query/.test(r.url()))console.log('Received',new URL(r.url()).pathname);});
  for(const [key,value]of Object.entries(bounds))await page.fill('#area-'+key,String(value));
  await page.evaluate(()=>window.__generator.fetchArea());
  const result=await page.evaluate(()=>window.__generator.result);
  if(!result.data||result.nyc.length!==(inNYC(bounds)?NYC_SOURCES.length:0))throw Error(await page.textContent('#error')||'Incomplete source capture');
  await writeFile(`${output}/scene.json`,JSON.stringify(result));
  // Existing geometry tests consume individual snapshots; scene.json is the portable replay input.
  await writeFile(`${output}/osm-latest-data.json`,JSON.stringify({...result,nyc:undefined}));
  for(const snap of result.nyc)await writeFile(`${output}/${snap.sourceId}.json`,JSON.stringify(snap));
  console.log(`Captured OSM + ${result.nyc.length} NYC sources to ${output}/scene.json`);
}finally{await browser.close();}
