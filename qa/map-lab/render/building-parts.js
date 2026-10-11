import {ringArea,affineProjection} from '../pipeline/osm-model.js';
import {surfaceFragments} from './map-merge-mesh.js';
import {shapeTriangles} from './shape-triangles.js';

export const PART_ASSEMBLY_RULES=Object.freeze({areaTolerance:1e-6,heightTolerance:.001});
const area=shapes=>shapes.reduce((sum,s)=>sum+Math.abs(ringArea(s.outer))-s.holes.reduce((a,h)=>a+Math.abs(ringArea(h)),0),0);
function comparisonShapes(features){
  if(!features.every(f=>f.shapes.every(s=>s.geographic)))return{shapes:features.map(f=>f.shapes),coordinates:'Projected local metres; original geographic rings unavailable for this comparison'};
  const [lon,lat]=features[0].shapes[0].geographic.outer[0],project=affineProjection(lat,lon);
  return{shapes:features.map(f=>f.shapes.map(s=>({outer:s.geographic.outer.map(project),holes:s.geographic.holes.map(r=>r.map(project))}))),coordinates:'Affine WGS84 source rings; local metre scale for area predicates, preserves geographic segment topology'};
}
export function uncoveredBuildingArea(shapes,masks){
  let total=0;
  for(const shape of shapes)for(const triangle of shapeTriangles(shape))for(const fragment of surfaceFragments(triangle,masks))total+=Math.abs(ringArea(fragment));
  return total;
}
export function resolveBuildingParts(plan,{note}){
  const parents=plan.buildings.filter(f=>!f.part&&f.extrude&&!f.reference&&!f.mesh).sort((a,b)=>a.id.localeCompare(b.id)),parts=plan.buildings.filter(f=>f.part&&f.extrude&&!f.reference).sort((a,b)=>a.id.localeCompare(b.id)),assignments=new Map(parents.map(p=>[p,[]])),coverage=new Map(plan.coverage.map(c=>[c.id,c]));
  const reference=(part,message)=>{part.reference=true;part.extrude=false;part.render.status='reference';note(part,message,'part-assembly-review');const c=coverage.get(part.id);if(c){c.status='reference';c.reason=message;}};
  for(const part of parts){const matches=parents.map(parent=>{const {shapes}=comparisonShapes([parent,part]);return{parent,partArea:area(shapes[1]),uncovered:uncoveredBuildingArea(shapes[1],shapes[0])};}),owners=matches.filter(m=>m.uncovered<=PART_ASSEMBLY_RULES.areaTolerance);if(owners.length===1)assignments.get(owners[0].parent).push(part);else if(owners.length>1)reference(part,'Building part fits multiple enabled parents; parent assignment and volume replacement require review.');else if(matches.some(m=>m.partArea-m.uncovered>PART_ASSEMBLY_RULES.areaTolerance))reference(part,'Building part intersects an enabled parent but extends outside it; independent source geometry retained for assembly review.');}
  for(const [parent,members]of assignments){if(!members.length)continue;for(const f of [parent,...members])if(!Number.isFinite(f.height?.bottom)||!Number.isFinite(f.height?.top)||f.height.top<=f.height.bottom)throw Error('Building assembly has no valid render height '+f.id);
    const {shapes,coordinates}=comparisonShapes([parent,...members]),parentShapes=shapes[0],memberShapes=shapes.slice(1),uncovered=uncoveredBuildingArea(parentShapes,memberShapes.flat()),complete=uncovered<=PART_ASSEMBLY_RULES.areaTolerance,baseShapes=memberShapes.filter((s,i)=>members[i].height.bottom<=parent.height.bottom+PART_ASSEMBLY_RULES.heightTolerance&&members[i].height.top>parent.height.bottom),baseUncovered=baseShapes.length===members.length?uncovered:uncoveredBuildingArea(parentShapes,baseShapes.flat()),completeBase=baseUncovered<=PART_ASSEMBLY_RULES.areaTolerance,maxTop=Math.max(...members.map(p=>p.height.top)),reachesTop=maxTop+PART_ASSEMBLY_RULES.heightTolerance>=parent.height.top;
    parent.render.attributes.partAssembly={parts:members.map(p=>p.id),footprintArea:area(parentShapes),uncoveredArea:uncovered,completeFootprint:complete,baseUncoveredArea:baseUncovered,completeBase,parentHeight:parent.height,maximumPartTop:maxTop,reachesParentTop:reachesTop,coordinates,parameters:PART_ASSEMBLY_RULES};
    if(complete&&completeBase&&reachesTop){parent.suppressed=true;parent.render.status='represented';parent.render.evidence.push('Enabled parts cover the complete parent footprint and base, and retain its maximum height envelope; original whole geometry remains available.');if(Math.abs(maxTop-parent.height.top)>PART_ASSEMBLY_RULES.heightTolerance)note(parent,'Selected part assembly has a higher maximum top than the whole-building model; both height observations remain available.','part-height-review');
      const ring=parent.shapes[0].outer,point=[0,1].map(k=>ring.reduce((sum,p)=>sum+p[k],0)/ring.length);for(const part of members){part.placementAnchor={source:parent.id,point,groundElevation:parent.groundElevation??null,estimated:true,method:'Shared parent base for the rendered assembly; datum alignment and terrain placement remain provisional'};part.render.attributes.partPlacement=part.placementAnchor;}
      const c=coverage.get(parent.id);if(c){c.status='represented';c.reason=parent.render.evidence.at(-1);}}
    else{const message=!complete?'Enabled parts do not cover the complete parent footprint; complete parent volume retained and partial parts remain references.':!completeBase?'Enabled parts leave the parent base uncovered; raised parts cannot erase the lower whole-building body.':'Enabled parts fall below the parent maximum height; incomplete vertical evidence retains the whole-building model.';note(parent,message,'part-assembly-review');for(const part of members)reference(part,message);}
  }
  plan.counts={...plan.counts,hiddenOutlines:plan.buildings.filter(b=>b.suppressed).length};
}
