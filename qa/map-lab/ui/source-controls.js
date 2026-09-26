import { NYC_SOURCES, nycURL } from '../data/map-sources.js';
import { downloadJSON } from './download.js';

// Source cards present the active session; API requests belong to the generator controller.
export function sourceControls({ root, mapBounds, changed }) {
  const states = new Map();
  const el=(name,text,parent)=>{const e=document.createElement(name);e.textContent=text;parent?.append(e);return e;};
  for(const source of NYC_SOURCES){
    const card=el('div','',root);card.className='source-card';const label=el('label','',card),visible=el('input','',label);visible.type='checkbox';visible.checked=true;visible.dataset.sourceVisible=source.id;el('span',source.name,label).style.color=source.color;
    const status=el('p','Not loaded.',card),details=el('details','',card);status.dataset.sourceStatus=source.id;el('summary','Source details',details);
    const query=el('a','Open API query ↗',details),meta=el('p',`Dataset ${source.dataset}`,details),download=el('button','Download JSON',details);query.target='_blank';query.rel='noopener';download.disabled=true;
    const state={source,snapshot:null,visible,status,query,meta,download};states.set(source.id,state);
    visible.onchange=()=>changed(source.id,'visibility');download.onclick=()=>downloadJSON(state.snapshot,`${source.id}.json`);
  }
  return { states,
    snapshots:()=>[...states.values()].flatMap(s=>s.snapshot?[{...s.snapshot,visible:s.visible.checked}]:[]),
    restore(snapshots=[]){for(const s of states.values()){
      const previous=s.snapshot;s.snapshot=snapshots.find(snap=>snap.sourceId===s.source.id)||null;
      if(s.snapshot?.visible!==undefined)s.visible.checked=s.snapshot.visible;else if(!previous)s.visible.checked=true;
      s.download.disabled=!s.snapshot;s.status.textContent=s.snapshot?`${s.snapshot.data.features.length} features`:'Not loaded.';
      s.query.href=s.snapshot?.queryURL||s.snapshot?.urls?.[0]||nycURL(s.source,mapBounds());
      s.meta.textContent=s.snapshot?`Dataset ${s.snapshot.dataset} · Data updated: ${s.snapshot.metadata?.dataUpdatedAt||'not reported'} · Metadata updated: ${s.snapshot.metadata?.metadataUpdatedAt||'not reported'}.${s.snapshot.metadataError?' Metadata unavailable: '+s.snapshot.metadataError:''}`:`Dataset ${s.source.dataset} · Not queried for this area.`;
    }},
    hasVisible:()=>[...states.values()].some(s=>s.visible.checked&&s.snapshot?.data.features.length),
  };
}
