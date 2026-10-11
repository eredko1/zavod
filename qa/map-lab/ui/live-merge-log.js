import {eventScope} from './event-scope.js';
const RESULT_LIMIT=200,SOURCE_EVENT_LIMIT=100;
export function createMergeLog(root) {
const $=id=>root.querySelector(`#${id}`),events=eventScope(),records=new WeakMap();let result=null,selection=null;
// Associated source records share a canonical group; their original owner remains the first member.
const identity=record=>JSON.stringify([record.phase,record.id??record.members[0].id]);
function show(){const mode=$('merge-log-filter').value,term=$('merge-log-search').value.toLowerCase(),all=result?.decisions||[];
  const rows=all.filter(r=>(mode==='all'||(mode==='conflicts'?r.conflicts.length:(!r.representedBy&&(r.members.length>1||['partial','excluded'].includes(r.status)||r.attributes.treePlacement?.excluded?.length||(r.status==='represented'&&r.evidence.length)||r.phase==='render'&&Object.keys(r.attributes).length))||r.conflicts.length))&&(!term||JSON.stringify(r).toLowerCase().includes(term)));
  $('live-counts').textContent=result?`${all.length} source/render records · ${result.summary.matched} matched source records · ${result.summary.suppressed} represented source records · ${result.summary.conflicts} source conflicts · ${all.filter(r=>r.phase==='render'&&r.conflicts.length).length} render conflicts · showing ${Math.min(rows.length,RESULT_LIMIT)}/${rows.length} filtered results`:'No data loaded.';
  $('merge-results').replaceChildren();for(const r of rows.slice(0,RESULT_LIMIT)){const b=document.createElement('button');b.dataset.mergeDecision=r.canonicalId;b.dataset.conflict=!!r.conflicts.length;b.textContent=`${r.phase} · ${r.status} · ${r.ruleId} · ${r.members.map(m=>m.id).join(' + ')} — ${r.conflicts[0]||r.evidence[0]||'Retained source record'}`;records.set(b,r);$('merge-results').append(b);}
  const current=selection&&all.find(record=>identity(record)===selection);if(current)$('merge-selected').textContent=JSON.stringify(current,null,2);else{selection=null;$('merge-selected').textContent='Choose a result to inspect.';}
  if(!rows.length)$('merge-results').textContent=result?'No decisions match this filter. Choose “All source and render records” to inspect retained features.':'Fetch a source to begin. No saved map data is loaded.';
}

function sourceEvent(d){const li=document.createElement('li');li.dataset.sourceEvent=d.sourceId;li.textContent=`${new Date().toLocaleTimeString()} · ${d.sourceId} · ${d.stage}${d.features!==undefined?' · '+d.features+' records':''}${d.message?' · '+d.message:''}`;$('source-events').prepend(li);while($('source-events').children.length>SOURCE_EVENT_LIMIT)$('source-events').lastChild.remove();}
// One owned listener inspects the current row; replaced buttons retain no callbacks.
events.on($('merge-results'),'click',event=>{const button=event.target.closest('button[data-merge-decision]'),record=records.get(button);if(!record)return;selection=identity(record);$('merge-selected').textContent=JSON.stringify(record,null,2);});
events.on($('merge-log-filter'),'change',show);events.on($('merge-log-search'),'input',show);show();

return { sourceEvent, update(value,render=null){result=value?{...value,decisions:[...value.decisions.map(d=>({...d,phase:'source'})),...(render?.decisions||[]).map(d=>({...d,phase:'render'}))]}:null;show();}, reset(){result=null;selection=null;$('source-events').replaceChildren();show();},dispose(){events.dispose();} };
}
