import {chromeOptions,displayBackend,verifyHardwareGpu} from '../../browser-launch.mjs';
// Headed, offline replay of the merged scene. See qa/map-lab/docs/MAP-PROFILING.md.
import assert from 'node:assert/strict';
import {loadFixture} from './fixture.mjs';
import { readFile, writeFile, readdir, mkdir, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
import { validateBaseline, validateRepeats, validateComparison } from '../benchmark/frame-report.js';
import { distribution } from '../benchmark/frame-profiler.js';
import { DEFAULT_SCENARIOS } from '../benchmark/scenarios.js';
import { REPLAY, replayConfig } from '../benchmark/replay-config.js';
import { reportDocument } from '../benchmark/frame-report-view.js';
const arg = (key,fallback) => { const i = process.argv.indexOf(key); return i < 0 ? fallback : process.argv[i+1]; };
const label = arg('--label','current').replace(/[^a-z0-9_-]/gi,'-'), root = '.tmp/map-lab', hash = value => createHash('sha256').update(value).digest('hex');
const config = replayConfig({ frames: Number(arg('--frames',REPLAY.frames)), warmup: Number(arg('--warmup',REPLAY.warmup)), repeats: Number(arg('--repeats',REPLAY.repeats)), modes:arg('--modes',REPLAY.modes.join(',')).split(','), width: Number(arg('--width',1280)), height: Number(arg('--height',800)), dpr: Number(arg('--dpr',1)), trace: process.argv.includes('--trace') });
config.virtualDisplay=process.env.QA_VIRTUAL_DISPLAY==='1';
config.displayBackend=displayBackend();
for (const key of ['width','height']) assert.ok(Number.isInteger(config[key]) && config[key]>0,`Invalid ${key}`);
assert.ok(config.dpr>0 && config.dpr<=2,'Invalid device pixel ratio');
await mkdir(root,{recursive:true});
const sceneFile=arg('--scene',null);
const sceneText=sceneFile?await readFile(sceneFile,'utf8'):JSON.stringify(await loadFixture());
const selection=JSON.parse(sceneText),inputHash=hash(sceneText);
assert.ok(Array.isArray(selection.data?.elements)&&Array.isArray(selection.nyc),'Scene must contain OSM elements and NYC snapshots (an empty array is valid)');
const codeFiles=[];
for(const dir of ['qa/map-lab','vendor/three','vendor/echarts'])for(const f of await readdir(dir,{recursive:true}))if(/\.(js|html|css)$/.test(f))codeFiles.push(dir+'/'+f);
codeFiles.push('qa/map-lab/tests/map-frame-profile.mjs','qa/browser-launch.mjs');codeFiles.sort();
const codeHash=hash((await Promise.all(codeFiles.map(async f=>f+await readFile(f,'utf8')))).join(''));
const report = { schema: 4, status: 'running', label, scene:sceneFile||'pinned-coney-fixture', recordedAt: new Date().toISOString(), inputHash, codeHash, config, scenarioVersions:Object.fromEntries(config.modes.map(id=>[id,DEFAULT_SCENARIOS[id].version])), runs: [], comparison: null };
const comparisonBaseline = arg('--compare',null) ? JSON.parse(await readFile(arg('--compare'),'utf8')) : null;
if(comparisonBaseline) validateBaseline(comparisonBaseline,report);
async function saveTrace(cdp,path) {
  const done = new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve)); await cdp.send('Tracing.end'); const {stream}=await done, file=await open(path,'w');
  try { let eof=false; while(!eof) { const part=await cdp.send('IO.read',{handle:stream}); await file.write(part.base64Encoded?Buffer.from(part.data,'base64'):part.data); eof=part.eof; } } finally { await file.close(); await cdp.send('IO.close',{handle:stream}); }
}
const browser = await chromium.launch(chromeOptions({channel:'chrome',headless:false,args:['--no-sandbox','--disable-dev-shm-usage']}));
try {
  report.graphics=await verifyHardwareGpu(browser);
  for (let repeat=0;repeat<config.repeats;repeat++) {
    const context=await browser.newContext({viewport:{width:config.width,height:config.height},deviceScaleFactor:config.dpr}), page=await context.newPage(), errors=[], network=[], assets=new Map(), responses=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',r=>{const u=new URL(r.request().url()); if(u.hostname==='localhost' || u.hostname==='127.0.0.1') { return r.continue(); } network.push(u.origin); return r.abort();});
    page.on('response',response=>{const u=new URL(response.url());if(!['localhost','127.0.0.1'].includes(u.hostname))return;responses.push((async()=>{if(!response.ok())throw Error('HTTP '+response.status()+': '+u.pathname);const digest=hash(await response.body());const key=u.pathname+u.search;const previous=assets.get(key);if(previous && previous!==digest)throw Error('Asset changed during run: '+key);assets.set(key,digest);})().catch(e=>errors.push(e.message)));});
    let cdp;
    try {
      await page.goto('http://localhost:8790/qa/map-lab/index.html?qa=1'); await page.bringToFront(); await page.waitForFunction(()=>window.__generator);
      await page.evaluate(async selection=>{const g=window.__generator;g.load(selection);await g.generate();},selection);
      if(config.trace) { cdp=await context.newCDPSession(page); await cdp.send('Tracing.start',{categories:'devtools.timeline,v8,blink.user_timing,disabled-by-default-v8.cpu_profiler',transferMode:'ReturnAsStream'}); }
      console.log(`Run ${repeat+1}/${config.repeats}: build + ${config.modes.join(', ')}`);
      const recorded=await page.evaluate(async config=>{const {recordRepeat}=await import('/qa/map-lab/benchmark/benchmark-runner.js');return recordRepeat(window.__generator.harness,config,{rebuild:true});},config);
      const {raw,metadata,summaries,assetWaitMs}=recorded;
      await Promise.all(responses); if(raw.pendingAssets || raw.assetEvents.some(e=>e.kind==='error'))throw Error('Assets pending or failed during replay');
      assert.deepEqual(errors,[]); assert.deepEqual(network,[],'Replay must not request live APIs'); assert.equal(metadata.contextLost,false);
      for(const snap of selection.nyc)assert.equal(metadata.stats.nyc[snap.sourceId].features,snap.data.features.length,'Scene source records must survive loading');
      metadata.assetHashes=Object.fromEntries([...assets].filter(([url])=>!/\.(js|html|css)(\?|$)/.test(url)).sort(([a],[b])=>a.localeCompare(b)));
      metadata.servedCodeHash=hash(JSON.stringify([...assets].filter(([url])=>/\.(js|html|css)(\?|$)/.test(url)).sort(([a],[b])=>a.localeCompare(b))));
      for(const mode of config.modes) { assert.equal(summaries[mode].frames,config.frames); assert.equal(summaries[mode].hiddenFrames,0); if(mode.endsWith('-turn')) assert.ok(summaries[mode].distance>.1,`${mode} must actually move`); }
      const run={repeat,metadata,summaries,raw,assetWaitMs,errors}; report.runs.push(run);
      await page.screenshot({path:`${root}/frame-profile-${label}-${repeat+1}.png`});
      if(config.trace) await saveTrace(cdp,`${root}/frame-profile-${label}-${repeat+1}.trace.json`);
      await writeFile(`${root}/frame-profile-${label}.json`,JSON.stringify(report,null,2));
      console.log(JSON.stringify(Object.fromEntries(config.modes.map(mode=>[mode,{cpuP95:summaries[mode].cpu.loop.p95,gpuP95:summaries[mode].gpu.p95,intervalP95:summaries[mode].interval.p95}]))));
    } catch(error) {
      report.status='failed'; report.failure={repeat,message:error.message,errors,network};
      try { report.failure.profile=await page.evaluate(()=>window.__generator?.harness?.profiler?.stop()); } catch {}
      await writeFile(`${root}/frame-profile-${label}.json`,JSON.stringify(report,null,2)); throw error;
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
try {
  validateRepeats(report);
  report.status='complete';
  if(comparisonBaseline) {
    validateComparison(comparisonBaseline,report,process.argv.includes('--allow-content-change'));
    report.comparison={baseline:arg('--compare'),modes:{}};
    for(const mode of config.modes) { const metrics={};for(const key of ['cpu','gpu']) { const get=s=>key==='cpu'?s.cpu.loop.p95:s.gpu.p95,before=distribution(comparisonBaseline.runs.map(r=>get(r.summaries[mode]))).p50,after=distribution(report.runs.map(r=>get(r.summaries[mode]))).p50;metrics[key]={beforeP95:before,afterP95:after,percentChange:before>0&&after!==null?(after/before-1)*100:null}; }report.comparison.modes[mode]=metrics; }
  }
} catch(error) {report.status='failed';report.failure={message:error.message};await writeFile(`${root}/frame-profile-${label}.json`,JSON.stringify(report,null,2));throw error;}
const html=reportDocument(report);
await writeFile(`${root}/frame-profile-${label}.json`,JSON.stringify(report,null,2)); await writeFile(`${root}/frame-profile-${label}.html`,html);
console.log(`Report: http://localhost:8790/${root}/frame-profile-${label}.html`);
