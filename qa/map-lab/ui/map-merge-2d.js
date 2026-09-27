import { createShapeQuery, pointBounds } from '../pipeline/shape-query.js';

// Keep masks local to each road, but store each detailed polygon only once in SVG defs.
const MASK_PADDING=100;
const path=ring=>ring.map((p,i)=>`${i?'L':'M'}${p[0]},${p[1]}`).join(' ');
export function display2DMerge(svg, plan) {
  const ns=svg.namespaceURI;
  svg.querySelector('[data-merge-defs]')?.remove();
  for(const e of svg.querySelectorAll('[data-merge-hidden]')){e.style.display='';delete e.dataset.mergeHidden;}
  for(const e of svg.querySelectorAll('[data-merge-original]')){e.setAttribute('d',e.dataset.mergeOriginal);e.removeAttribute('mask');delete e.dataset.mergeOriginal;}
  if(!plan?.merge.enabled)return;
  const suppressed=new Set(plan.merge.suppressed), pathsByID=new Map([...plan.roads.filter(r=>r.sourcePaths||r.mergeMasks),...(plan.details||[]).filter(f=>f.mergeMasks)].map(r=>[r.id,r]));
  const defs=document.createElementNS(ns,'defs');defs.dataset.mergeDefs='';svg.prepend(defs);
  const outlines=new Map(),queries=new Map();let sequence=0;
  const element=(name,attrs,parent)=>{const e=document.createElementNS(ns,name);for(const [key,value] of Object.entries(attrs))e.setAttribute(key,value);parent.append(e);return e;};
  function maskFor(road) {
    const shapes=road.mergeMasks;if(!shapes?.length)return null;
    if(!queries.has(shapes))queries.set(shapes,createShapeQuery(shapes));
    const box=pointBounds([...(road.sourcePaths||road.paths||[]).flat(),...road.shapes.flatMap(s=>s.outer)]);
    box[0]-=MASK_PADDING;box[1]-=MASK_PADDING;box[2]+=MASK_PADDING;box[3]+=MASK_PADDING;
    const nearby=queries.get(shapes)(box);if(!nearby.length)return null;
    const region={x:box[0],y:box[1],width:box[2]-box[0],height:box[3]-box[1]},id=`resolved-road-${sequence++}`;
    const mask=element('mask',{id,maskUnits:'userSpaceOnUse',...region},defs);
    element('rect',{...region,fill:'white'},mask);
    for(const shape of nearby){
      if(!outlines.has(shape)){
        const id=`resolved-outline-${outlines.size}`;
        element('path',{id,d:[shape.outer,...shape.holes].map(r=>path(r)+' Z').join(' '),fill:'black','fill-rule':'evenodd'},defs);
        outlines.set(shape,id);
      }
      element('use',{href:`#${outlines.get(shape)}`},mask);
    }
    return `url(#${id})`;
  }
  for(const e of svg.querySelectorAll('[data-feature],[data-nyc-feature]')){
    const id=e.dataset.feature||e.dataset.nycFeature;
    if(suppressed.has(id)){e.style.display='none';e.dataset.mergeHidden='';continue;}
    const road=pathsByID.get(id);if(!road)continue;
    const mask=maskFor(road);
    for(const node of e.matches('path')?[e]:e.querySelectorAll('path')){
      node.dataset.mergeOriginal=node.getAttribute('d');
      if(road.sourcePaths&&node.getAttribute('fill')==='none')node.setAttribute('d',road.paths.map(path).join(' '));
      if(mask)node.setAttribute('mask',mask);
    }
  }
}
