export function showGeometryReport(root,report,focus){
  const element=(tag,text,parent)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;parent?.append(e);return e;};
  root.replaceChildren();const s=report.summary;element('p',`${s.geometryErrors} geometry errors · ${s.geometryWarnings} geometry warnings · ${s.dataGaps} data gaps`,root);
  const table=element('table',undefined,element('div',undefined,root));table.parentElement.className='scroll';
  const head=element('tr',undefined,element('thead',undefined,table));for(const title of ['Source / type','Meshes','Outlines / markers','No geometry','Merged','Hidden','Excluded','Estimated'])element('th',title,head);
  const body=element('tbody',undefined,table);for(const c of report.coverage){const row=element('tr',undefined,body);for(const value of [`${c.source} / ${c.type}`,c.meshes,c.references,c.missing,c.represented,c.hidden,c.excluded,c.estimated])element('td',value,row);}
  const label=element('label','Findings ',root),filter=element('select',undefined,label);filter.setAttribute('aria-label','Geometry finding filter');for(const [value,name] of [['geometry','Geometry'],['data','Data gaps'],['all','All']]){const option=element('option',name,filter);option.value=value;}
  const list=element('ul',undefined,root),more=element('button','Show more',root);let limit=30;
  const draw=()=>{list.replaceChildren();const findings=report.findings.filter(f=>filter.value==='all'||f.kind===filter.value);for(const f of findings.slice(0,limit)){const li=element('li',undefined,list),button=element('button',f.id,li);button.onclick=()=>focus(f.id);li.append(document.createTextNode(` ${f.code}: ${f.message}`));}if(!findings.length)element('li','No findings in this category.',list);more.hidden=limit>=findings.length;};
  filter.onchange=()=>{limit=30;draw();};more.onclick=()=>{limit+=30;draw();};draw();
  const details=element('details',undefined,root);element('summary','What these checks cover',details);for(const text of report.limits)element('p',text,details);
}
