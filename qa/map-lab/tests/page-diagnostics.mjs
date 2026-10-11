import {mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {openDiagnosticFile} from './diagnostic-file.mjs';
import {DIAGNOSTIC_LIMITS} from '../ui/diagnostic-journal.js';
const observed=new WeakSet(),journals=new WeakMap();
export function recordPageDiagnostic(page,kind,detail={}){
  const journal=journals.get(page);if(!journal)throw Error('Page diagnostics are not active.');
  journal.append(kind,detail);journal.sync();
}
export function recordPageDiagnostics(page,name,{directory='.tmp/map-lab/diagnostics'}={}){
  if(observed.has(page))return;
  if(!/^[a-z0-9-]+$/.test(name))throw Error('Invalid diagnostic name');
  mkdirSync(directory,{recursive:true});const path=`${directory}/${name}-${Date.now()}-${randomUUID()}.jsonl`,journal=openDiagnosticFile(path),append=journal.append;observed.add(page);journals.set(page,journal);
  const consoleEvent=message=>{if(message.text().startsWith('MAP LAB CHECKPOINT '))append('checkpoint',JSON.parse(message.text().slice(19)));};
  const pageError=error=>append('page-error',{message:String(error.stack||error).slice(0,DIAGNOSTIC_LIMITS.text)}),crash=()=>{append('page-crash');journal.sync();};
  const download=file=>append('download-start',{filename:file.suggestedFilename()});
  page.on('console',consoleEvent);page.on('pageerror',pageError);page.on('crash',crash);page.on('download',download);append('page-observation-start');
  page.once('close',()=>{append('page-close');page.removeListener('console',consoleEvent);page.removeListener('pageerror',pageError);page.removeListener('crash',crash);page.removeListener('download',download);journals.delete(page);journal.close();});
  console.log('DIAGNOSTIC LOG',path);return path;
}
