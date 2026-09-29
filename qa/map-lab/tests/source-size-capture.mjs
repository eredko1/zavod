// Live adapter measurements, one complete source at a time; no area-size extrapolation.
import {chromium} from 'playwright-core';
import {mkdir,writeFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromeOptions,verifyHardwareGpu,displayBackend} from '../../browser-launch.mjs';
import {validateArea,areaDimensions,METRES_PER_LATITUDE_DEGREE,METRES_PER_LONGITUDE_DEGREE} from '../data/generator-area.js';
import {recordPageDiagnostics} from './page-diagnostics.mjs';
import {ACQUISITION_LIMITS} from '../data/acquisition-limits.js';
const args=process.argv.slice(2),options=new Map();
for(let i=0;i<args.length;i++){const key=args[i];if(!['--output','--center','--side','--only','--osm-endpoint'].includes(key)||options.has(key))throw Error('Unknown or repeated option: '+key);const value=args[++i];if(!value||value.startsWith('--'))throw Error(key+' requires a value');options.set(key,value);}
const osmEndpoint=options.get('--osm-endpoint')||'https://overpass-api.de/api/interpreter';
if(!['https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter'].includes(osmEndpoint))throw Error('Unsupported OSM endpoint.');
const center=(options.get('--center')??'40.5775,-73.978').split(',').map(Number),side=Number(options.get('--side')??2000);
if(center.length!==2||!center.every(Number.isFinite)||!Number.isFinite(side)||side<=0)throw Error('Use --center latitude,longitude --side metres');
const [latitude,longitude]=center,dy=side/2/METRES_PER_LATITUDE_DEGREE,dx=side/2/(METRES_PER_LONGITUDE_DEGREE*Math.cos(latitude*Math.PI/180)),bounds=validateArea({south:latitude-dy,west:longitude-dx,north:latitude+dy,east:longitude+dx});
const directory=options.get('--output')??'.tmp/map-lab/source-sizes-2km';await mkdir(directory,{recursive:true});
const report={version:1,startedAt:new Date().toISOString(),bounds,dimensions:areaDimensions(bounds),acquisitionLimits:ACQUISITION_LIMITS,displayBackend:displayBackend(),method:'Sequential live production adapters; complete source JSON streamed to disk. Rejected evidence is separate and never selected. Encoded response sizes are CDP measurements, not retained JSON size or RAM. Decoded point bytes measure validated records, not retained RAM.',sources:[]};
const save=()=>writeFile(directory+'/measurements.json',JSON.stringify(report,null,2));await writeFile(directory+'/measurements.json',JSON.stringify(report,null,2),{flag:'wx'});let browser;
try{
  browser=await chromium.launch(chromeOptions({args:['--no-sandbox','--disable-dev-shm-usage']}));report.browser=browser.version();report.gpu=await verifyHardwareGpu(browser);
  const page=await browser.newPage(),session=await page.context().newCDPSession(page);report.diagnosticFile=recordPageDiagnostics(page,'source-size-capture');await session.send('Network.enable');const requests=new Map();
  session.on('Network.requestWillBeSent',event=>requests.set(event.requestId,{url:event.request.url}));
  session.on('Network.loadingFinished',event=>{const request=requests.get(event.requestId);if(request)request.encodedBytes=event.encodedDataLength;});
  session.on('Network.loadingFailed',event=>{const request=requests.get(event.requestId);if(request)request.failure=event.errorText;});
  await page.goto('http://localhost:8790/qa/map-lab/?qa=1');await page.waitForFunction(()=>window.__generator);
  const sources=await page.evaluate(async()=>{const {NYC_SOURCES}=await import('./data/map-sources.js');return [{id:'osm-overpass',name:'OpenStreetMap'},...NYC_SOURCES.map(({id,name})=>({id,name}))];});
  const only=options.get('--only')?.split(',');if(only&&(new Set(only).size!==only.length||only.some(id=>!sources.some(s=>s.id===id))))throw Error('--only requires distinct registered source IDs');report.selection=only||'all registered sources';
  for(const source of sources){
    if(only&&!only.includes(source.id))continue;
    requests.clear();const started=performance.now();const measurement={...source,status:'querying'};report.sources.push(measurement);await save();console.log('QUERY',source.id);
    const detail=await page.evaluate(async({source,bounds,osmEndpoint})=>{
      const {NYC_SOURCES,fetchNYC,sourceRecordCount}=await import('./data/map-sources.js'),{queryForArea}=await import('./data/generator-area.js'),{queryOSM}=await import('./data/osm-source.js');
      console.info('MAP LAB CHECKPOINT '+JSON.stringify({type:'size-source-start',sourceId:source.id,bounds}));let snapshot;try{
        const query=queryForArea(bounds);snapshot=source.id==='osm-overpass'?{sourceId:source.id,bounds,query,endpoint:osmEndpoint,fetchedAt:new Date().toISOString(),data:await queryOSM(query,osmEndpoint)}:await fetchNYC(NYC_SOURCES.find(s=>s.id===source.id),bounds,undefined,undefined,progress=>console.info('MAP LAB CHECKPOINT '+JSON.stringify({type:'size-source-progress',sourceId:source.id,...progress,heap:performance.memory?.usedJSHeapSize})));
      }catch(e){console.info('MAP LAB CHECKPOINT '+JSON.stringify({type:'size-source-rejected',sourceId:source.id,message:String(e.message)}));window.__sizeSnapshot=e.acquisition||null;return {status:'rejected',failure:String(e.message),urls:e.acquisition?.urls||[],evidenceAvailable:!!e.acquisition};}
        console.info('MAP LAB CHECKPOINT '+JSON.stringify({type:'size-source-acquired',sourceId:source.id,heap:performance.memory?.usedJSHeapSize}));
        window.__sizeSnapshot=snapshot;
        const assets=snapshot.data.assets||[],nodes=snapshot.raw?.nodes||[],binaryBytes=value=>value?value.length*3/4-(value.endsWith('==')?2:value.endsWith('=')?1:0):0;
        const {sourceInventories}=await import('./pipeline/source-inventory.js');const result=source.id==='osm-overpass'?{data:snapshot.data,...snapshot,nyc:[]}:{data:null,nyc:[snapshot]};const inventory=sourceInventories(result).find(s=>s.sourceId===source.id);
        if(source.id!=='osm-overpass'&&inventory.snapshot.raw!==snapshot.raw)throw Error('Source inventory lost its raw archive');
        return {status:'complete',records:source.id==='osm-overpass'?snapshot.data.elements.length:sourceRecordCount(snapshot),inventoryRecords:inventory.records.length,features:snapshot.data.features?.length??null,assets:assets.length,points:assets.reduce((n,a)=>n+(a.pointCount||0),0),compressedPointBytes:assets.reduce((n,a)=>n+a.bytes,0),decodedPointBytes:assets.reduce((n,a)=>n+a.decoded.bytes,0),meshVertices:(snapshot.data.features||[]).reduce((n,f)=>n+(f.mesh?.positions.length||0)/3,0),meshBinaryBytes:nodes.reduce((n,node)=>n+binaryBytes(node.geometry)+Object.values(node.attributes||{}).reduce((m,value)=>m+binaryBytes(value),0),0),fetchedAt:snapshot.fetchedAt,metadata:snapshot.metadata,urls:snapshot.urls||[snapshot.endpoint]};
    },{source,bounds,osmEndpoint});
    Object.assign(measurement,detail);measurement.queryMs=performance.now()-started;
    if(detail.status==='complete'||detail.evidenceAvailable){
      const filename=source.id+(detail.status==='complete'?'.json':'-rejected.json'),[download]=await Promise.all([page.waitForEvent('download'),page.evaluate(async filename=>{const {downloadJSON}=await import('./ui/download.js');await downloadJSON(window.__sizeSnapshot,filename);},filename)]);
      const path=directory+'/'+filename;await download.saveAs(path);const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);measurement.export={file:filename,bytes:(await stat(path)).size,sha256:hash.digest('hex')};
    }
    const urls=new Set(measurement.urls),network=[...requests.values()].filter(r=>urls.has(r.url));measurement.network={completedResponses:network.filter(r=>r.encodedBytes!==undefined).length,encodedResponseBytes:network.reduce((n,r)=>n+(r.encodedBytes??0),0),unfinishedResponses:network.filter(r=>r.encodedBytes===undefined&&!r.failure).length,failedResponses:network.filter(r=>r.failure).length};
    await page.evaluate(()=>delete window.__sizeSnapshot);await save();console.log('RESULT',source.id,measurement.status,measurement.export?.bytes??0,measurement.failure??'');
  }
  report.status='complete';report.totals={complete:report.sources.filter(s=>s.status==='complete').length,rejected:report.sources.filter(s=>s.status==='rejected').length,completeExportBytes:report.sources.filter(s=>s.status==='complete').reduce((n,s)=>n+s.export.bytes,0),rejectedEvidenceBytes:report.sources.filter(s=>s.status==='rejected').reduce((n,s)=>n+(s.export?.bytes||0),0)};
}catch(e){report.status='failed';report.failure=e.message;process.exitCode=1;console.error(e.message);}
finally{report.finishedAt=new Date().toISOString();await save();await browser?.close();}
