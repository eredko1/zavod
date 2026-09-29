// Small synchronous checkpoints survive a renderer exit; source payloads stay in their own exports.
export const DIAGNOSTIC_LIMITS=Object.freeze({sessions:3,events:160,text:1200,detailChars:4000,contextChars:32000});
const PREFIX='map-lab-diagnostic-v1:',TAB=PREFIX+'tab';
export function createDiagnosticJournal({storage,tabStorage,storageError=null,now=()=>new Date().toISOString(),id=()=>crypto.randomUUID(),onChange=()=>{}}){
  let persistenceError=storageError?String(storageError.message||storageError).slice(0,DIAGNOSTIC_LIMITS.text):null,previous=null;
  const failed=e=>{persistenceError??=String(e.message||e).slice(0,DIAGNOSTIC_LIMITS.text);};
  const retained=(preferred=null)=>{const entries=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(PREFIX)&&key!==TAB){const entry=JSON.parse(storage.getItem(key));if(entry)entries.push({key,entry});}}return entries.sort((a,b)=>Number(b.entry.id===preferred)-Number(a.entry.id===preferred)||b.entry.updatedAt.localeCompare(a.entry.updatedAt)||a.key.localeCompare(b.key));};
  try{const key=tabStorage.getItem(TAB);previous=key?JSON.parse(storage.getItem(PREFIX+key)||'null'):null;previous??=retained()[0]?.entry||null;}catch(e){failed(e);}
  const current={version:1,id:id(),startedAt:now(),updatedAt:null,operation:null,context:{},events:[],droppedEvents:0};
  try{tabStorage.setItem(TAB,current.id);}catch(e){failed(e);}
  const snapshot=()=>({limits:DIAGNOSTIC_LIMITS,persistenceError,previous,current});
  function persist(){
    current.updatedAt=now();
    try{
      storage.setItem(PREFIX+current.id,JSON.stringify(current));
      for(const entry of retained(current.id).slice(DIAGNOSTIC_LIMITS.sessions))storage.removeItem(entry.key);
    }catch(e){failed(e);}
    onChange(snapshot());
  }
  const bounded=(value,limit)=>{const json=JSON.stringify(value);return json.length<=limit?value:{omitted:true,reason:'Diagnostic summary exceeded character limit',characters:json.length,limit};};
  function record(kind,detail={}){
    // Callers pass bounded summaries, never features, raw responses or native point buffers.
    current.events.push({at:now(),kind,detail:bounded(detail,DIAGNOSTIC_LIMITS.detailChars)});
    if(current.events.length>DIAGNOSTIC_LIMITS.events){current.events.shift();current.droppedEvents++;}
    persist();
  }
  const message=e=>String(e?.stack||e?.message||e).slice(0,DIAGNOSTIC_LIMITS.text);
  return {snapshot,record,message,
    begin(name,context){current.operation={name,status:'active',startedAt:now()};current.context=bounded(context,DIAGNOSTIC_LIMITS.contextChars);record('operation-start',{name});},
    end(status='complete',detail={}){if(current.operation)current.operation={...current.operation,status,finishedAt:now()};record('operation-end',{status,...detail});},
    error(kind,e){record(kind,{message:message(e)});},
  };
}
