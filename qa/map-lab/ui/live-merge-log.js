export function createMergeLog(root) {
const $=id=>root.querySelector(`#${id}`);let result=null;
function show(){const mode=$('merge-log-filter').value,term=$('merge-log-search').value.toLowerCase(),all=result?.decisions||[];
  const rows=all.filter(r=>(mode==='all'||(mode==='conflicts'?r.conflicts.length:(!r.representedBy&&(r.members.length>1||r.status==='partial'||(r.status==='represented'&&r.evidence.length)))||r.conflicts.length))&&(!term||JSON.stringify(r).toLowerCase().includes(term)));
  $('live-counts').textContent=result?`${all.length} records · ${result.summary.matched} matches · ${result.summary.suppressed} redundant records represented · ${result.summary.conflicts} conflicts · showing ${Math.min(rows.length,200)}/${rows.length} filtered results`:'No data loaded.';
  $('merge-results').replaceChildren();for(const r of rows.slice(0,200)){const b=document.createElement('button');b.dataset.mergeDecision=r.canonicalId;b.dataset.conflict=!!r.conflicts.length;b.textContent=`${r.status} · ${r.ruleId} · ${r.members.map(m=>m.id).join(' + ')} — ${r.conflicts[0]||r.evidence[0]||'Retained source record'}`;b.onclick=()=>{$('merge-selected').textContent=JSON.stringify(r,null,2);};$('merge-results').append(b);}
  if(!rows.length)$('merge-results').textContent=result?'No decisions match this filter. Choose “All source records” to inspect retained features.':'Fetch a source to begin. No saved map data is loaded.';
}

function sourceEvent(d){const li=document.createElement('li');li.dataset.sourceEvent=d.sourceId;li.textContent=`${new Date().toLocaleTimeString()} · ${d.sourceId} · ${d.stage}${d.features!==undefined?' · '+d.features+' records':''}${d.message?' · '+d.message:''}`;$('source-events').prepend(li);while($('source-events').children.length>100)$('source-events').lastChild.remove();}
$('merge-log-filter').onchange=show;$('merge-log-search').oninput=show;show();

return { sourceEvent, update(value){result=value;show();}, reset(){result=null;$('source-events').replaceChildren();$('merge-selected').textContent='Choose a result to inspect.';show();} };
}
