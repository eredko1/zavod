import { initHelp } from './map-help.js';
import { createMapPreview } from './map-preview.js';
import { createMergeLog } from './live-merge-log.js';
import { queryOSM } from '../data/osm-source.js';
import { checkAbort } from '../data/request-abort.js';
import { NYC_SOURCES, fetchNYC, datasetURL } from '../data/map-sources.js';
import { CONEY_BOUNDS, DEFAULT_BOUNDS, validateArea, areaDimensions, inNYC, queryForArea, boundsFromOSM } from '../data/generator-area.js';
import { GEOMETRY_DEFAULTS } from '../pipeline/map-pipeline.js';
import { runBenchmark } from '../benchmark/benchmark-runner.js';
import { buildTable, mountReport, clearReport } from '../benchmark/frame-report-view.js';
import { downloadJSON } from './download.js';
import { createAreaPicker } from './area-picker.js';

const $=id=>document.getElementById(id),log=createMergeLog(document);
initHelp($('pipeline'));
const geometryOptions=()=>({storey:Number($('storey').value),curb:Number($('curb-height').value),terrain:$('terrain-enabled').checked});
$('storey').value=GEOMETRY_DEFAULTS.storey;$('curb-height').value=GEOMETRY_DEFAULTS.curb;
const preview=createMapPreview(document,{options:geometryOptions,onMerge:log.update});
let bounds={...DEFAULT_BOUNDS},controller=null,busy=false,dirty=true,areaChanged=false,report=null,generationProfile=null,world=null,harness=null,acquisition=[];
const picker=createAreaPicker($('area-picker'),{onApply:b=>{const previous=formBounds(),changed=Object.keys(b).some(k=>b[k]!==previous[k]);setBounds(b);if(changed)pendingArea();}});
const say=text=>$('area-status').textContent=text;
function sync(){const r=preview.result(),has=!!r.data?.elements.length||r.nyc.some(s=>s.data.features.length);$('generate').disabled=busy||areaChanged||!has;$('bench-run').disabled=busy||dirty||!world?.plan;$('tab-3d').disabled=busy||!world?.plan;$('generate').textContent=dirty?'Generate 3D':'Regenerate 3D';}
function lock(value){
  busy=value;$('selection-controls').disabled=value;$('selection-controls').inert=value;$('generation-info').inert=value;
  // A disabled fieldset covers controls created by subsequent API responses too.
  for(const id of ['auto-coney','area-fetch','fetch','tab-2d','orbit','top','walk','respawn'])$(id).disabled=value;
  $('busy-cover').hidden=!value;sync();
}
function invalidate(){dirty=true;report=null;clearReport($('bench-results'));$('benchmark-panel').hidden=true;$('bench-download').disabled=$('log-download').disabled=true;sync();if(world?.plan)$('generation-summary').textContent='Selection changed. Generate 3D to apply these sources and rules.';}
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
  const result={data:null,nyc:[],bounds:{...bounds},query:query??queryForArea(bounds),endpoint:$('endpoint').value,fetchedAt:new Date().toISOString()};
  if(query!==null){$('query').value=query;updateLink();}
  controller=new AbortController();const signal=controller.signal;lock(true);$('area-cancel').disabled=false;$('error').textContent='';invalidate();switchView('2d');log.reset();acquisition=[];preview.load(result);
  const failures=[];
  async function collect(id,name,fn,accept){
    const start=performance.now();let retries=0,fetchMs=null,previewMs=null;log.sourceEvent({sourceId:id,stage:'fetching'});say(`Fetching ${name}…`);
    try{
      const data=await fn(info=>{retries++;say(`${name}: retry ${info.attempt}/${info.maxAttempts} in ${(info.delay/1000).toFixed(1)} s…`);log.sourceEvent({sourceId:id,stage:'retry',message:info.message});});
      fetchMs=performance.now()-start;checkAbort(signal);say(`Updating preview: ${name}…`);log.sourceEvent({sourceId:id,stage:'preview',message:`Fetch ${Math.round(fetchMs)} ms`});
      await new Promise(resolve=>setTimeout(resolve,0));checkAbort(signal);
      const previewStart=performance.now();accept(data);preview.load(result);previewMs=performance.now()-previewStart;
      log.sourceEvent({sourceId:id,stage:'loaded',features:id==='osm-overpass'?data.elements.length:data.data.features.length,message:`Fetch ${Math.round(fetchMs)} ms · preview ${Math.round(previewMs)} ms`});
      acquisition.push({sourceId:id,status:'loaded',durationMs:performance.now()-start,fetchMs,previewMs,retries});
    }
    catch(e){failures.push(`${name}: ${signal.aborted?'Request cancelled':e.message}`);log.sourceEvent({sourceId:id,stage:signal.aborted?'cancelled':'error',message:e.message});acquisition.push({sourceId:id,status:signal.aborted?'cancelled':'error',durationMs:performance.now()-start,fetchMs,previewMs,retries,message:e.message});}
  }
  try{
    await collect('osm-overpass','OpenStreetMap',retry=>queryOSM(result.query,result.endpoint,signal,retry),data=>{if(query!==null){const area=boundsFromOSM(data);if(area){setBounds(area,{query:false,selection:true});result.bounds={...bounds};}}result.data=data;});
    if(query===null&&inNYC(bounds))for(const source of NYC_SOURCES){if(signal.aborted)break;await collect(source.id,source.name,retry=>fetchNYC(source,bounds,signal,retry),snap=>result.nyc.push(snap));await new Promise(resolve=>setTimeout(resolve,0));}
    const hasData=!!result.data?.elements.length||result.nyc.some(s=>s.data.features.length);
    say(`${signal.aborted?'Stopped.':hasData?'Fetched.':'No data loaded.'} ${result.data?.elements.length||0} OSM elements · ${result.nyc.length} NYC sources${failures.length?' · '+failures.length+' source errors':''}.${query!==null?' Custom query is OSM-only.':''}${hasData?' Inspect the layers, then Generate 3D.':''}`);$('error').textContent=failures.join('\n');
  }finally{controller=null;lock(false);$('area-cancel').disabled=true;}
}
function switchView(view){const three=view==='3d';$('map-viewport').hidden=three;$('three-view').hidden=!three;$('tab-2d').setAttribute('aria-pressed',!three);$('tab-3d').setAttribute('aria-pressed',three);world?.suspend(!three);if(!three)requestAnimationFrame(()=>preview.fit());}
function inspect(f){if(!f)return;const link=document.createElement('a'),pre=document.createElement('pre');link.textContent=f.id;link.href=f.dataset?datasetURL(f.dataset):`https://www.openstreetmap.org/${f.id}`;link.target='_blank';link.rel='noopener';pre.textContent=JSON.stringify({rule:f.rule,height:f.height,width:f.width,tags:f.tags,merge:f.merge,attributes:f.attributes,estimates:f.estimates},null,2);$('details').replaceChildren(link,pre);}
async function ensureWorld(){if(!world){const {createMapWorld}=await import('../render/map-world.js');const {createMapBenchmark}=await import('../benchmark/map-benchmark.js');world=createMapWorld({canvas:$('world'),viewport:$('three-view'),onInspect:inspect,onError:message=>$('error').textContent=message,onMode:(mode,message)=>{$('world-help').textContent=message;$('reticle').hidden=mode!=='walk';}});harness=createMapBenchmark(world);}return world;}
const settle=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
function showBenchmarkBuilds(builds){$('bench-builds').innerHTML=builds.length?buildTable(builds):'';$('bench-builds').parentElement.hidden=!builds.length;}
function showGeneration(){const s=world.stats();$('generation-summary').textContent=`${s.buildings} buildings · ${s.roads} road/path features · ${s.details} other features · ${s.errors} generation errors.`;$('build-results').innerHTML=buildTable(generationProfile.builds);$('generation-log').textContent=world.plan.issues.map(i=>`${i.severity} · ${i.id} · ${i.message}`).join('\n')||'No issues.';$('log-download').disabled=false;}
async function generate(){
  if(busy||areaChanged)return;let profiling=false;lock(true);$('log-download').disabled=true;$('generation-summary').textContent='Building merged geometry…';
  try{switchView('3d');await ensureWorld();world.suspend(false);await settle();harness.profiler.start();profiling=true;harness.loadResult(preview.result(),geometryOptions());await harness.profiler.waitForAssets();generationProfile=await harness.profiler.stop();profiling=false;dirty=false;showGeneration();}
  catch(e){if(profiling)await harness.profiler.stop();$('generation-summary').textContent=e.message;dirty=true;}
  finally{lock(false);}
}
async function benchmark(options={}){
  if(busy||dirty||!world?.plan)return;report=null;lock(true);switchView('3d');controller=new AbortController();const signal=controller.signal;
  $('benchmark-panel').hidden=false;$('benchmark-panel').dataset.running='true';clearReport($('bench-results'));showBenchmarkBuilds([]);$('bench-scenario').closest('.frame-sequence').hidden=true;$('bench-scenario').hidden=$('benchmark-chart').hidden=true;$('bench-cancel').disabled=false;$('bench-download').disabled=true;
  const hidden=()=>{if(document.hidden)controller?.abort(new Error('Benchmark cancelled: page became hidden'));};document.addEventListener('visibilitychange',hidden);
  try{await settle();report=await runBenchmark(harness,{options,signal,generationProfile,onReport:r=>{report=r;report.acquisition=acquisition;},progress:(repeat,mode)=>{$('bench-state').textContent=`Repeat ${repeat+1} · ${mode}. Keep this page in the foreground.`;}});
    showBenchmarkBuilds([...report.runs.flatMap(r=>r.raw.builds),...(report.failureProfile?.builds||[])]);
    if(report.status==='complete'){await mountReport(report,{results:$('bench-results'),select:$('bench-scenario'),timeline:$('benchmark-chart')});$('bench-state').textContent='Complete. Click legends to filter; red line = 60 FPS target.';}
    else $('bench-state').textContent=`${report.status==='cancelled'?'Cancelled':'Failed'}: ${report.failure}. No complete frame charts; available build timings and diagnostic download are retained.`;
  }catch(e){$('bench-state').textContent=e.message;}
  finally{document.removeEventListener('visibilitychange',hidden);controller=null;delete $('benchmark-panel').dataset.running;$('bench-cancel').disabled=true;lock(false);$('bench-download').disabled=!report;}
}
$('auto-coney').onclick=()=>fetchArea(true);$('area-fetch').onclick=()=>fetchArea();$('fetch').onclick=()=>fetchArea(false,$('query').value);$('query').oninput=updateLink;
$('area-choose').onclick=()=>{try{picker.open(formBounds());}catch(e){say(e.message);}};
for(const key of ['south','west','north','east'])$('area-'+key).addEventListener('input',pendingArea);
$('area-cancel').onclick=()=>controller?.abort(new Error('Request cancelled'));$('bench-cancel').onclick=()=>controller?.abort(new Error('Benchmark cancelled'));
$('generate').onclick=generate;$('tab-2d').onclick=()=>switchView('2d');$('tab-3d').onclick=()=>switchView('3d');$('bench-run').onclick=()=>benchmark();
$('orbit').onclick=()=>world.fit();$('top').onclick=()=>world.fit(true);$('walk').onclick=()=>world.walk();$('respawn').onclick=()=>world.respawn();
$('bench-download').onclick=()=>downloadJSON(report,'map-benchmark.json');$('log-download').onclick=()=>downloadJSON({acquisition,settings:world.settings,builds:generationProfile.builds,coverage:world.plan.coverage,merge:world.plan.merge,issues:world.plan.issues},'map-generation.json');
for(const id of ['layers','nyc-sources','merge-panel','osm-visible'])$(id).addEventListener('change',invalidate);
$('geometry-settings').addEventListener('change',()=>{invalidate();try{preview.refreshRules();$('error').textContent='';}catch(e){$('error').textContent=e.message;}});
$('help-open').onclick=()=>$('pipeline').showModal();$('help-close').onclick=()=>$('pipeline').close();if(location.hash==='#pipeline')$('pipeline').showModal();
setBounds(DEFAULT_BOUNDS,{selection:true});preview.load({data:null,nyc:[]});sync();
// QA observes the same explicit APIs used by the page; production modules do not read this hook.
if(new URLSearchParams(location.search).has('qa'))window.__generator={fetchArea,generate,benchmark,load,ensureWorld,switchView,get busy(){return busy;},get report(){return report;},get result(){return preview.result();},get world(){return world;},get harness(){return harness;},get previewPlan(){return preview.plan;}};
