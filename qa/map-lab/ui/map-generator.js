import {showGeometryReport} from './geometry-report.js';
import { initHelp } from './map-help.js';
import { createMapPreview } from './map-preview.js';
import { createMergeLog } from './live-merge-log.js';
import { queryOSM } from '../data/osm-source.js';
import { checkAbort } from '../data/request-abort.js';
import { NYC_SOURCES, fetchNYC, datasetURL,sourceRecordCount,sourceSummary } from '../data/map-sources.js';
import { CONEY_BOUNDS, DEFAULT_BOUNDS, validateArea, areaDimensions, inNYC, queryForArea, boundsFromOSM } from '../data/generator-area.js';
import { GEOMETRY_DEFAULTS } from '../pipeline/map-pipeline.js';
import { runBenchmark } from '../benchmark/benchmark-runner.js';
import { buildTable, mountReport, clearReport } from '../benchmark/frame-report-view.js';
import { downloadJSON } from './download.js';
import { createAreaPicker } from './area-picker.js';
import {createBuildProgress,buildStageLabel,paintProgress as settle} from './build-progress.js';
import {createDiagnosticJournal,DIAGNOSTIC_LIMITS} from './diagnostic-journal.js';
import {MERGE_POLICY_VERSION} from '../pipeline/map-merge-rules.js';
import {RENDER_POLICY_VERSION} from '../render/render-rules.js';
import {ACQUISITION_LIMITS} from '../data/acquisition-limits.js';

const $=id=>document.getElementById(id),log=createMergeLog(document);
let storage,tabStorage,storageError;try{storage=localStorage;tabStorage=sessionStorage;}catch(e){storageError=e;}
const qa=new URLSearchParams(location.search).has('qa');
const diagnostics=createDiagnosticJournal({storage,tabStorage,storageError,onChange:state=>{$('diagnostic-status').textContent=state.persistenceError?'Checkpoint persistence failed: '+state.persistenceError:state.previous?.operation?.status==='active'?'Earlier operation has no completion checkpoint; download its log. It may have been interrupted, closed or still running in another tab.':'Local crash checkpoints enabled.';if(qa){const event=state.current.events.at(-1);console.log('MAP LAB CHECKPOINT '+JSON.stringify({sessionId:state.current.id,event,...(event.kind==='operation-start'?{context:state.current.context}:{})}));}}});
const memory=()=>performance.memory?{heapBytes:performance.memory.usedJSHeapSize,heapLimitBytes:performance.memory.jsHeapSizeLimit}:null;
const sourceCounts=result=>[{sourceId:'osm-overpass',records:result.data?.elements.length||0},...(result.nyc||[]).map(s=>({sourceId:s.sourceId,records:sourceRecordCount(s),fetchedAt:s.fetchedAt,points:s.metadata?.pointCount,decodedBytes:s.metadata?.decodedBytes}))];
const diagnosticContext=()=>({bounds:{...bounds},settings:geometryOptions(),sources:sourceCounts(preview.result()),acquisitionLimits:ACQUISITION_LIMITS,mergePolicy:MERGE_POLICY_VERSION,renderPolicy:RENDER_POLICY_VERSION,userAgent:navigator.userAgent});
addEventListener('error',event=>diagnostics.error('uncaught-error',event.error||event.message));
addEventListener('unhandledrejection',event=>diagnostics.error('unhandled-rejection',event.reason));
addEventListener('map-lab-download',event=>diagnostics.record('download-stage',{...event.detail,memory:memory()}));
addEventListener('pagehide',event=>diagnostics.record('page-hide',{persisted:event.persisted,memory:memory()}));
diagnostics.record('page-open',{userAgent:navigator.userAgent});
if(['localhost','127.0.0.1','[::1]'].includes(location.hostname))$('endpoint').value='https://overpass-api.de/api/interpreter';
const loading=createBuildProgress($('build-loading'));
initHelp($('pipeline'));
const geometryOptions=()=>({storey:Number($('storey').value),curb:Number($('curb-height').value),terrain:$('terrain-enabled').checked});
$('storey').value=GEOMETRY_DEFAULTS.storey;$('curb-height').value=GEOMETRY_DEFAULTS.curb;
const preview=createMapPreview(document,{onMerge:log.update});
let geometryReport=null;
let bounds={...DEFAULT_BOUNDS},controller=null,busy=false,dirty=true,areaChanged=false,report=null,generationProfile=null,world=null,harness=null,acquisition=[];
const picker=createAreaPicker($('area-picker'),{onApply:b=>{const previous=formBounds(),changed=Object.keys(b).some(k=>b[k]!==previous[k]);setBounds(b);if(changed)pendingArea();}});
const say=text=>{$('area-status').textContent=text;if(busy)loading.show(text);};
function sync(){const r=preview.result(),has=!!r.data?.elements.length||r.nyc.some(sourceRecordCount);$('generate').disabled=busy||areaChanged||!has;$('bench-run').disabled=busy||dirty||!world?.plan;$('validate').disabled=busy||dirty||!world?.plan;$('tab-3d').disabled=busy||!world?.plan;$('generate').textContent=dirty?'Generate 3D':'Regenerate 3D';}
function lock(value){
  busy=value;$('selection-controls').disabled=value;$('selection-controls').inert=value;$('generation-info').inert=value;
  // A disabled fieldset covers controls created by subsequent API responses too.
  for(const id of ['auto-coney','area-fetch','fetch','tab-2d','orbit','top','walk','respawn'])$(id).disabled=value;
  $('busy-cover').hidden=!value;for(const id of ['world','map-viewport'])$(id).setAttribute('aria-busy',String(value));if(!value)loading.hide();sync();
}
function invalidate(){geometryReport=null;$('geometry-report-panel').hidden=true;dirty=true;report=null;clearReport($('bench-results'));$('benchmark-panel').hidden=true;$('bench-download').disabled=$('log-download').disabled=true;sync();if(world?.plan)$('generation-summary').textContent='Selection changed. Generate 3D to apply these sources and rules.';}
function updateLink(){$('turbo').href=`https://overpass-turbo.eu/?Q=${encodeURIComponent($('query').value)}`;}
const formBounds=()=>Object.fromEntries(['south','west','north','east'].map(k=>[k,$('area-'+k).valueAsNumber]));
function pendingArea(){areaChanged=true;invalidate();say('Area changed. Fetch area to load its data.');}
function setBounds(b,{query=true,selection=false}={}){bounds={...validateArea(b)};if(selection){preview.setArea(bounds);areaChanged=false;}for(const k of Object.keys(bounds))$('area-'+k).value=bounds[k];const d=areaDimensions(bounds);$('area-summary').textContent=`${Math.round(d.width)} × ${Math.round(d.height)} m`;if(query)$('query').value=queryForArea(bounds);updateLink();}
function load(result){setBounds(result.bounds||boundsFromOSM(result.data||{elements:[]})||CONEY_BOUNDS,{query:false,selection:true});preview.load(result);invalidate();}
async function fetchArea(coney=false,custom=null){
  if(busy)return;
  const query=custom===null?null:custom.trim();
  try{if(query===null)setBounds(coney?CONEY_BOUNDS:formBounds(),{selection:true});else if(!query)throw Error('Enter a query first.');}
  catch(e){say(e.message);return;}
  const result={data:null,nyc:[],acquisitionFailures:[],bounds:{...bounds},query:query??queryForArea(bounds),endpoint:$('endpoint').value,fetchedAt:new Date().toISOString()};
  diagnostics.begin('fetch',{bounds:result.bounds,query:result.query.slice(0,DIAGNOSTIC_LIMITS.text),queryTruncated:result.query.length>DIAGNOSTIC_LIMITS.text,endpoint:result.endpoint,mergePolicy:MERGE_POLICY_VERSION});
  if(query!==null){$('query').value=query;updateLink();}
  controller=new AbortController();const signal=controller.signal;lock(true);$('area-cancel').disabled=false;$('error').textContent='';invalidate();switchView('2d');log.reset();acquisition=[];preview.load(result);
  const failures=[];
  async function collect(id,name,fn,accept){
    const start=performance.now();let retries=0,fetchMs=null,previewMs=null,accepted=false;diagnostics.record('source-start',{sourceId:id,memory:memory()});log.sourceEvent({sourceId:id,stage:'fetching'});say(`Fetching ${name}…`);
    try{
      const data=await fn(info=>{retries++;say(`${name}: retry ${info.attempt}/${info.maxAttempts} in ${(info.delay/1000).toFixed(1)} s…`);log.sourceEvent({sourceId:id,stage:'retry',message:info.message});});
      fetchMs=performance.now()-start;checkAbort(signal);diagnostics.record('source-acquired',{sourceId:id,fetchMs,records:id==='osm-overpass'?data.elements.length:sourceRecordCount(data),memory:memory()});say(`Updating preview: ${name}…`);log.sourceEvent({sourceId:id,stage:'preview',message:`Fetch ${Math.round(fetchMs)} ms`});
      await new Promise(resolve=>setTimeout(resolve,0));
      // A stop during the paint wait cannot discard this already completed source.
      const previewStart=performance.now();accept(data);accepted=true;preview.load(result);previewMs=performance.now()-previewStart;
      log.sourceEvent({sourceId:id,stage:'loaded',features:id==='osm-overpass'?data.elements.length:sourceRecordCount(data),message:`Fetch ${Math.round(fetchMs)} ms · preview ${Math.round(previewMs)} ms${id==='osm-overpass'?'':' · '+sourceSummary(data)}`});
      acquisition.push({sourceId:id,status:'loaded',durationMs:performance.now()-start,fetchMs,previewMs,retries});
      diagnostics.record('source-ready',{sourceId:id,fetchMs,previewMs,memory:memory()});
    }
    catch(e){
      if(e.acquisition)result.acquisitionFailures.push(e.acquisition);
      const status=signal.aborted?'cancelled':'error',stage=accepted?'preview':'acquisition';
      failures.push(`${name} (${stage}): ${signal.aborted?'Request cancelled':e.message}`);
      log.sourceEvent({sourceId:id,stage:accepted?`preview-${status}`:status,message:e.message});
      acquisition.push({sourceId:id,status:accepted?'loaded':status,durationMs:performance.now()-start,fetchMs,previewMs,retries,...(accepted?{previewStatus:status,previewMessage:e.message}:{message:e.message})});
      diagnostics.record('source-error',{sourceId:id,stage,status,accepted,message:diagnostics.message(e),memory:memory()});
    }
  }
  try{
    await collect('osm-overpass','OpenStreetMap',retry=>queryOSM(result.query,result.endpoint,signal,retry),data=>{if(query!==null){const area=boundsFromOSM(data);if(area){setBounds(area,{query:false,selection:true});result.bounds={...bounds};}}result.data=data;});
    if(query===null&&inNYC(bounds))for(const source of NYC_SOURCES){if(signal.aborted)break;await collect(source.id,source.name,retry=>fetchNYC(source,bounds,signal,retry,progress=>{diagnostics.record('source-progress',{sourceId:source.id,...progress,memory:memory()});say(`${source.name}: ${progress.stage==='inventory'?`${progress.assets} tiles · ${progress.points.toLocaleString('en-US')} points`:`${progress.completed}/${progress.total} tiles validated`}…`);}),snap=>result.nyc.push(snap));await new Promise(resolve=>setTimeout(resolve,0));}
    const hasData=!!result.data?.elements.length||result.nyc.some(sourceRecordCount);
    say(`${signal.aborted?'Stopped.':hasData?'Fetched.':'No data loaded.'} ${result.data?.elements.length||0} OSM elements · ${result.nyc.length} regional sources${failures.length?' · '+failures.length+' acquisition/preview errors':''}.${query!==null?' Custom query is OSM-only.':''}${hasData?' Inspect the layers, then Generate 3D.':''}`);$('error').textContent=failures.join('\n');
  }catch(e){diagnostics.error('fetch-error',e);diagnostics.end(signal.aborted?'cancelled':'failed');throw e;}
  finally{if(diagnostics.snapshot().current.operation.status==='active')diagnostics.end(signal.aborted?'cancelled':failures.length?'with-errors':'complete',{sources:sourceCounts(result),memory:memory()});controller=null;lock(false);$('area-cancel').disabled=true;}
}
function switchView(view){const three=view==='3d';$('map-viewport').hidden=three;$('three-view').hidden=!three;$('tab-2d').setAttribute('aria-pressed',!three);$('tab-3d').setAttribute('aria-pressed',three);world?.suspend(!three);if(!three)requestAnimationFrame(()=>preview.fit());}
function inspect(f){if(!f)return;const link=document.createElement('a'),pre=document.createElement('pre');link.textContent=f.id;link.href=f.dataset?datasetURL(f.dataset):`https://www.openstreetmap.org/${f.id}`;link.target='_blank';link.rel='noopener';pre.textContent=JSON.stringify({rule:f.rule,height:f.height,width:f.width,tags:f.tags,merge:f.merge,render:f.render,attributes:f.attributes,estimates:f.estimates},null,2);$('details').replaceChildren(link,pre);}
async function ensureWorld(){if(!world){const {createMapWorld}=await import('../render/map-world.js');const {createMapBenchmark}=await import('../benchmark/map-benchmark.js');world=createMapWorld({canvas:$('world'),viewport:$('three-view'),onInspect:inspect,onError:message=>{$('error').textContent=message;if(message)diagnostics.record('world-error',{message:message.slice(0,DIAGNOSTIC_LIMITS.text)});},onMode:(mode,message)=>{$('world-help').textContent=message;$('reticle').hidden=mode!=='walk';}});harness=createMapBenchmark(world);const gl=world.renderer.getContext(),info=gl.getExtension('WEBGL_debug_renderer_info');diagnostics.record('renderer-created',{renderer:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)});for(const kind of ['webglcontextlost','webglcontextrestored'])world.renderer.domElement.addEventListener(kind,event=>diagnostics.record(kind,{message:event.statusMessage||'',memory:memory()}));}return world;}
function showBenchmarkBuilds(builds){$('bench-builds').innerHTML=builds.length?buildTable(builds):'';$('bench-builds').parentElement.hidden=!builds.length;}
function showGeneration(){log.update(world.plan.merge,world.plan.render);const s=world.stats();$('generation-summary').textContent=`${s.buildings} buildings · ${s.roads} road/path features · ${s.details} other features · ${s.errors} generation errors.`;$('build-results').innerHTML=buildTable(generationProfile.builds);$('generation-log').textContent=world.plan.issues.map(i=>`${i.severity} · ${i.id} · ${i.message}`).join('\n')||'No issues.';$('log-download').disabled=false;}
async function generate(){
  if(busy||areaChanged)return;geometryReport=null;$('geometry-report-panel').hidden=true;let profiling=false;controller=new AbortController();const signal=controller.signal;lock(true);$('build-cancel').hidden=false;$('log-download').disabled=true;$('generation-summary').textContent='Building merged geometry…';
  diagnostics.begin('generate',diagnosticContext());let lastStage=null;
  try{loading.show('Preparing map');switchView('3d');await ensureWorld();world.suspend(true);await settle(signal);harness.profiler.start();profiling=true;await harness.loadResult(preview.result(),geometryOptions(),async stage=>{if(stage!==lastStage){lastStage=stage;diagnostics.record('build-stage',{stage,memory:memory()});}loading.show(buildStageLabel(stage));await settle(signal);},signal);$('build-cancel').hidden=true;loading.show('Finishing build');diagnostics.record('build-assets',{memory:memory()});await harness.profiler.waitForAssets();generationProfile=await harness.profiler.stop();profiling=false;dirty=false;showGeneration();diagnostics.end('complete',{memory:memory()});}
  catch(e){diagnostics.error('generation-error',e);diagnostics.end(signal.aborted?'cancelled':'failed',{memory:memory()});if(profiling)await harness.profiler.stop();$('generation-summary').textContent=e.message;dirty=true;}
  finally{controller=null;$('build-cancel').hidden=true;world?.suspend(false);lock(false);}
}
async function validate(){
  if(busy||dirty||!world?.plan)return;lock(true);loading.show('Checking generated geometry');
  diagnostics.begin('validate',diagnosticContext());
  try{await settle();const {validateGeometry}=await import('../render/geometry-validation.js');geometryReport=validateGeometry({plan:world.plan,world:world.getWorld(),terrain:world.getTerrain(),surfaces:{sample:world.groundAt},selection:world.selection});showGeometryReport($('geometry-report'),geometryReport,id=>{switchView('3d');world.focusFeature(id);});$('geometry-report-panel').hidden=false;$('geometry-report-panel').open=true;$('geometry-report-panel').scrollIntoView({block:'nearest'});}
  catch(e){diagnostics.error('validation-error',e);diagnostics.end('failed');$('error').textContent=e.message;}finally{if(diagnostics.snapshot().current.operation.status==='active')diagnostics.end();lock(false);}
}
async function benchmark(options={}){
  if(busy||dirty||!world?.plan)return;report=null;lock(true);switchView('3d');controller=new AbortController();const signal=controller.signal;
  diagnostics.begin('benchmark',{...diagnosticContext(),options});let lastCheckpoint=null;
  $('benchmark-panel').hidden=false;$('benchmark-panel').dataset.running='true';clearReport($('bench-results'));showBenchmarkBuilds([]);$('bench-scenario').closest('.frame-sequence').hidden=true;$('bench-scenario').hidden=$('benchmark-chart').hidden=true;$('bench-cancel').disabled=false;$('bench-download').disabled=true;
  $('bench-state').textContent='Preparing benchmark. Graphs appear here after all repeats finish.';loading.show('Preparing benchmark');
  const hidden=()=>{if(document.hidden)controller?.abort(new Error('Benchmark cancelled: page became hidden'));};document.addEventListener('visibilitychange',hidden);
  try{report=await runBenchmark(harness,{options,signal,generationProfile,onReport:r=>{report=r;report.acquisition=acquisition;report.acquisitionFailures=world.plan.observations.acquisitionFailures;},progress:(repeat,mode,stage)=>{const checkpoint=`${repeat}:${mode}:${stage}`;if(checkpoint!==lastCheckpoint){lastCheckpoint=checkpoint;diagnostics.record('benchmark-stage',{repeat,mode,stage,memory:memory()});}$('bench-state').textContent=`Repeat ${repeat+1} · ${stage?buildStageLabel(stage):mode}. Keep this page in the foreground.`;if(stage||mode==='Rebuilding map'){loading.show(`Repeat ${repeat+1} · ${stage?buildStageLabel(stage):mode}`);return settle(signal);}loading.hide();}});
    showBenchmarkBuilds([...report.runs.flatMap(r=>r.raw.builds),...(report.failureProfile?.builds||[])]);
    if(report.status==='complete'){await mountReport(report,{results:$('bench-results'),select:$('bench-scenario'),timeline:$('benchmark-chart')});$('bench-state').textContent='Complete. Click legends to filter; red line = 60 FPS target.';}
    else $('bench-state').textContent=`${report.status==='cancelled'?'Cancelled':'Failed'}: ${report.failure}. No complete frame charts; available build timings and diagnostic download are retained.`;
    diagnostics.end(report.status,{failure:report.failure,memory:memory()});
  }catch(e){diagnostics.error('benchmark-error',e);diagnostics.end(signal.aborted?'cancelled':'failed');$('bench-state').textContent=e.message;}
  finally{document.removeEventListener('visibilitychange',hidden);controller=null;delete $('benchmark-panel').dataset.running;$('bench-cancel').disabled=true;lock(false);$('bench-download').disabled=!report;}
}
$('auto-coney').onclick=()=>fetchArea(true);$('area-fetch').onclick=()=>fetchArea();$('fetch').onclick=()=>fetchArea(false,$('query').value);$('query').oninput=updateLink;
$('area-choose').onclick=()=>{try{picker.open(formBounds());}catch(e){say(e.message);}};
for(const key of ['south','west','north','east'])$('area-'+key).addEventListener('input',pendingArea);
$('area-cancel').onclick=()=>controller?.abort(new Error('Request cancelled'));$('bench-cancel').onclick=()=>controller?.abort(new Error('Benchmark cancelled'));
$('build-cancel').onclick=()=>controller?.abort(new Error('Map build cancelled'));
$('generate').onclick=generate;$('tab-2d').onclick=()=>switchView('2d');$('tab-3d').onclick=()=>switchView('3d');$('bench-run').onclick=()=>benchmark();
$('validate').onclick=validate;$('geometry-report-download').onclick=()=>{diagnostics.record('geometry-download-click',{filename:'map-geometry-checks.json'});return downloadJSON(geometryReport,'map-geometry-checks.json');};
$('orbit').onclick=()=>world.fit();$('top').onclick=()=>world.fit(true);$('walk').onclick=()=>world.pickWalk();$('respawn').onclick=()=>world.respawn();
$('bench-download').onclick=()=>downloadJSON(report,'map-benchmark.json');$('log-download').onclick=()=>downloadJSON({acquisition,acquisitionFailures:world.plan.observations.acquisitionFailures,settings:world.settings,builds:generationProfile.builds,coverage:world.plan.coverage,merge:world.plan.merge,render:world.plan.render,issues:world.plan.issues},'map-generation.json');
$('diagnostic-download').onclick=()=>downloadJSON(structuredClone(diagnostics.snapshot()),'map-diagnostics.json');
for(const id of ['layers','nyc-sources','merge-panel','osm-visible'])$(id).addEventListener('change',invalidate);
$('geometry-settings').addEventListener('change',()=>{invalidate();log.update(preview.plan.merge);});
$('help-open').onclick=()=>$('pipeline').showModal();$('help-close').onclick=()=>$('pipeline').close();if(location.hash==='#pipeline')$('pipeline').showModal();
setBounds(DEFAULT_BOUNDS,{selection:true});preview.load({data:null,nyc:[]});sync();
// QA observes the same explicit APIs used by the page; production modules do not read this hook.
if(qa)window.__generator={fetchArea,generate,benchmark,validate,load,ensureWorld,switchView,diagnostics,get busy(){return busy;},get report(){return report;},get geometryReport(){return geometryReport;},get result(){return preview.result();},get world(){return world;},get harness(){return harness;},get previewPlan(){return preview.plan;}};
