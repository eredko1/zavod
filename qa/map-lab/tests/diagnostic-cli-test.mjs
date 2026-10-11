import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const directory=await mkdtemp(join(tmpdir(),'map-lab-diagnostic-test-'));
try{
  const input=join(directory,'input.json'),output=join(directory,'output');await writeFile(input,JSON.stringify({data:{elements:[]},nyc:[]}));
  // Explicit launch rejection exercises the failure journal without opening any browser.
  const result=spawnSync(process.execPath,['qa/map-lab/tests/crash-diagnostic.mjs','--scene',input,'--generations','1','--output',output],{env:{...process.env,QA_VISIBLE:'0',QA_VIRTUAL_DISPLAY:'0'},encoding:'utf8'});
  assert.equal(result.status,1,result.stderr);const report=JSON.parse(await readFile(join(output,'report.json'))),events=(await readFile(join(output,'events.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(report.status,'failed');assert.match(report.failure,/Visible Chrome requires explicit approval/);assert.deepEqual(events.map(e=>e.kind),['diagnostic-start','browser-launch','diagnostic-error','diagnostic-finish']);assert.equal(events[0].detail.inputSha256,report.inputSha256);assert.equal(events.at(-1).detail.status,'failed');
  console.log('PASS diagnostic launch failure retains timestamped append journal and final failure report without opening Chrome');
}finally{await rm(directory,{recursive:true,force:true});}
