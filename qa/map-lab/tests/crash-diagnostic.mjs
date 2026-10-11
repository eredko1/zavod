// Explicit stress experiment; never retry a failed generation or recover a crashed target.
import {chromium} from 'playwright-core';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {openDiagnosticFile} from './diagnostic-file.mjs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromeOptions,verifyHardwareGpu,displayBackend} from '../../browser-launch.mjs';
const args=process.argv.slice(2),options=new Map();
for(let i=0;i<args.length;i++){const key=args[i];if(!['--scene','--generations','--collect-gc','--download','--source-download','--benchmark','--benchmark-full','--url','--output'].includes(key)||options.has(key))throw Error('Unknown or repeated crash diagnostic option: '+key);if(['--collect-gc','--download','--benchmark','--benchmark-full'].includes(key))options.set(key,true);else{const value=args[++i];if(!value||value.startsWith('--'))throw Error(key+' requires a value.');options.set(key,value);}}
const gc=options.has('--collect-gc'),download=options.has('--download'),full=options.has('--benchmark-full'),benchmark=options.has('--benchmark')||full,generations=Number(options.get('--generations')??4);
if(full&&options.has('--benchmark'))throw Error('Choose --benchmark or --benchmark-full.');
if(!options.has('--scene')||!Number.isInteger(generations)||generations<1||generations>6)throw Error('Use --scene input.json [--generations 1..6] [--collect-gc] [--download] [--source-download source-id] [--benchmark | --benchmark-full] [--url local-url] [--output directory].');
const directory=options.get('--output')??'.tmp/map-lab/crash-diagnostic',url=new URL(options.get('--url')??'http://localhost:8790/qa/map-lab/index.html?qa=1');
if(url.protocol!=='http:'||url.hostname!=='localhost'||url.port!=='8790'||url.username||url.password)throw Error('Crash experiments require the local QA server.');
const body=await readFile(options.get('--scene')),input=JSON.parse(body),sourceDownload=options.get('--source-download'),sourceSnapshot=sourceDownload?input.nyc?.find(s=>s.sourceId===sourceDownload):null;
if(sourceDownload&&(!/^[a-z0-9-]+$/.test(sourceDownload)||!sourceSnapshot))throw Error('--source-download requires a loaded source ID.');
const report={startedAt:new Date().toISOString(),inputSha256:createHash('sha256').update(body).digest('hex'),url:url.href,displayBackend:displayBackend(),forcedCollection:gc,download,sourceDownload:sourceDownload||null,benchmark,benchmarkPreset:benchmark?(full?'full':'diagnostic'):null,generations:[],stages:[],events:[]};await mkdir(directory,{recursive:true});
// Append before the next operation: even a native Node exit leaves the last written checkpoint.
const journal=openDiagnosticFile(directory+'/events.jsonl'),append=journal.append;
const save=()=>writeFile(directory+'/report.json',JSON.stringify(report,null,2));let browser,closing=false;
append('diagnostic-start',{...report,generations:undefined,stages:undefined,events:undefined});journal.sync();
try{
  append('browser-launch');browser=await chromium.launch(chromeOptions({args:['--no-sandbox','--disable-dev-shm-usage','--enable-logging=stderr','--enable-precise-memory-info']}));browser.on('disconnected',()=>{append('browser-disconnected',{closing});if(!closing)report.events.push({kind:'browserDisconnected'});});
  report.browser=browser.version();report.gpu=await verifyHardwareGpu(browser);const page=await browser.newPage({viewport:{width:1440,height:1000}}),targets=await browser.newBrowserCDPSession();
  await targets.send('Target.setDiscoverTargets',{discover:true});targets.on('Target.targetCrashed',e=>{append('target-crash',e);journal.sync();report.events.push({kind:'targetCrash',...e});console.error('TARGET CRASH',e);});page.on('crash',()=>{append('page-crash');journal.sync();report.events.push({kind:'pageCrash'});});page.on('pageerror',e=>{append('page-error',{message:e.message});report.events.push({kind:'pageError',message:e.message});});
  page.on('console',m=>{if(m.text().startsWith('CRASH STAGE ')){const stage=JSON.parse(m.text().slice(12));append('build-stage',stage);report.stages.push(stage);console.log('STAGE',stage);}else if(m.text().startsWith('CRASH EVENT ')){const event=JSON.parse(m.text().slice(12));append('render-event',event);report.events.push(event);console.error('EVENT',event);}else if(m.text().startsWith('MAP LAB CHECKPOINT '))append('page-checkpoint',JSON.parse(m.text().slice(19)));});
  await page.goto(url.href);await page.waitForFunction(()=>window.__generator);await page.evaluate(async data=>{const g=window.__generator;await g.ensureWorld();g.world.renderer.domElement.addEventListener('webglcontextlost',e=>console.log('CRASH EVENT '+JSON.stringify({kind:'webglContextLost',message:e.statusMessage,time:performance.now()})));const p=g.harness.profiler,mark=p.buildMark;p.buildMark=(name,ms,thread='main')=>{console.log('CRASH STAGE '+JSON.stringify({name,ms,thread,heap:performance.memory.usedJSHeapSize}));return mark(name,ms,thread);};g.load(data);},input);
  const session=await page.context().newCDPSession(page);await session.send('Performance.enable');
  const memory=async()=>{const metrics=await session.send('Performance.getMetrics'),processes=await targets.send('SystemInfo.getProcessInfo'),resident=[];for(const p of processes.processInfo){try{const status=await readFile('/proc/'+p.id+'/status','utf8');resident.push({type:p.type,pid:p.id,rssKiB:Number(/^VmRSS:\s+(\d+)/m.exec(status)?.[1]),peakKiB:Number(/^VmHWM:\s+(\d+)/m.exec(status)?.[1])});}catch(e){if(e.code!=='ENOENT')throw e;}}return {metrics:Object.fromEntries(metrics.metrics.filter(m=>/JSHeap|Nodes|Documents/.test(m.name)).map(m=>[m.name,m.value])),resident};};
  for(let i=0;i<generations;i++){
    const generation={index:i,before:await memory()};report.generations.push(generation);await save();
    append('generation-start',{index:i,memory:generation.before});
    if(sourceDownload){
      await page.click('#tab-2d');const card=page.locator(`[data-source-visible="${sourceDownload}"]`).locator('..').locator('..'),details=card.locator('details');await details.evaluate(element=>element.open=true);
      append('source-download-start',{index:i,sourceId:sourceDownload});const [file]=await Promise.all([page.waitForEvent('download'),card.getByRole('button',{name:'Download JSON'}).click()]),bytes=await readFile(await file.path());assert.deepEqual(JSON.parse(bytes),sourceSnapshot,'source-card download must retain the original snapshot');
      const path=`${directory}/source-${sourceDownload}-${i}.json`;await writeFile(path,bytes);generation.sourceDownload={sourceId:sourceDownload,path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};await details.evaluate(element=>element.open=false);await save();
    }
    await page.evaluate(()=>window.__generator.generate());generation.after=await memory();generation.state=await page.evaluate(()=>({busy:window.__generator.busy,error:document.querySelector('#error').textContent,summary:document.querySelector('#generation-summary').textContent,canBenchmark:!document.querySelector('#bench-run').disabled,contextLost:window.__generator.world.renderer.getContext().isContextLost(),stats:window.__generator.world.stats()}));
    if(generation.state.error||generation.state.busy||generation.state.contextLost||!generation.state.canBenchmark)throw Error(generation.state.error||(generation.state.contextLost?'WebGL context was lost.':generation.state.summary||'Generation did not finish.'));
    if(download){
      const panel=page.locator('details:has(#log-download)');if(!await panel.evaluate(element=>element.open))await panel.locator('summary').click();
      const [file]=await Promise.all([page.waitForEvent('download'),page.click('#log-download')]),bytes=await readFile(await file.path());JSON.parse(bytes);
      generation.download={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
    }
    if(benchmark){append('benchmark-start',{index:i,full});await page.evaluate(full=>window.__generator.benchmark(full?{}:{frames:4,warmup:2,repeats:1}),full);generation.benchmark=await page.evaluate(()=>window.__generator.report);generation.afterBenchmark=await memory();await save();if(generation.benchmark?.status!=='complete')throw Error(generation.benchmark?.failure||'Benchmark did not complete.');append('benchmark-complete',{index:i,memory:generation.afterBenchmark});}
    if(report.events.length)throw Error('Crash experiment recorded target/page/context errors.');
    if(gc){await session.send('HeapProfiler.collectGarbage');generation.afterCollection=await memory();}
    console.log('GENERATION',i,JSON.stringify({before:generation.before.metrics,after:generation.after.metrics,afterCollection:generation.afterCollection?.metrics}));append('generation-complete',{index:i,memory:generation.after});await save();
  }
  if(report.events.length)throw Error('Crash experiment recorded target/page errors.');report.status='complete';
}catch(e){append('diagnostic-error',{message:e.message});report.status='failed';report.failure=e.message;process.exitCode=1;console.error(e.message);}
finally{report.finishedAt=new Date().toISOString();try{await save();}finally{closing=true;try{await browser?.close();}catch(e){append('browser-close-error',{message:e.message});report.closeFailure=e.message;process.exitCode=1;}finally{append('diagnostic-finish',{status:report.status,closeFailure:report.closeFailure});journal.close();}}await save();}
