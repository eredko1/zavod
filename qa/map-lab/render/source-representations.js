import {buildingOverlap} from '../pipeline/building-match.js';
import {MESH_SELECTION} from '../pipeline/nyc-building-mesh.js';
import {MERGE_PARAMETERS} from '../pipeline/map-merge.js';
import {createTreeSurfaceQuery} from '../pipeline/tree-placement.js';

export const REPRESENTATION_RULES=Object.freeze({partReviewOverlap:.1});
export function selectNativeBuildings(plan,sourcePlan){
  const coverage=new Map(plan.coverage.map(c=>[c.id,c])),sources=new Map(sourcePlan.buildings.map(f=>[f.id,f]));
  for(const mesh of plan.buildings.filter(f=>f.mesh).sort((a,b)=>a.id.localeCompare(b.id))){
    const context=mesh.merge.attributes.currentBuildingContext;if(!context)continue;const building=plan.buildings.find(f=>f.id===context.source),source=sources.get(context.source);if(!building||!source)throw Error('Associated native mesh lacks its source identity context.');
    const detail=mesh.mesh.detail,height=source.height.top,year=Number(source.tags.construction_year),parts=plan.buildings.filter(p=>p.part&&buildingOverlap(p.shapes,source.shapes,MERGE_PARAMETERS.buildingGrid)>REPRESENTATION_RULES.partReviewOverlap);
    const reason=year>MESH_SELECTION.captureYear?'Current construction year postdates the 2014 capture.':parts.length?'Current mapped building parts require separate fidelity/coverage review.':!source.height.valid||source.height.estimated?'No measured current building height for mesh validation.':Math.abs(detail.span-height)>Math.max(MESH_SELECTION.heightAbsoluteTolerance,height*MESH_SELECTION.heightRelativeTolerance)?'Mesh vertical span conflicts with the current recorded roof height.':detail.upperBands.length<2&&detail.slopedArea<MESH_SELECTION.minBandArea?'Mesh adds no measured stepped or sloped upper surfaces over the current extrusion.':null;
    mesh.render.attributes.selection={parameters:MESH_SELECTION,detail,currentFootprint:source.id,currentHeight:height,constructionYear:source.tags.construction_year,parts:parts.map(p=>p.id),selected:!reason,reason};
    if(reason){mesh.render.status='reference';mesh.render.evidence.push(reason+' Source geometry retained.');const c=coverage.get(mesh.id);if(c)c.reason=reason;continue;}
    mesh.reference=false;mesh.extrude=true;mesh.groundElevation=source.groundElevation;mesh.geometryContext={source:source.id,shapes:structuredClone(source.shapes),height:structuredClone(source.height)};
    mesh.render.status='selected';mesh.render.evidence.push('Measured upper bands or sloped surfaces improve the current extrusion, with compatible measured height and capture history. Placement remains a separate estimate.');
    building.suppressed=true;building.render.status='represented';building.render.representedBy=mesh.id;building.render.evidence.push('Current identity/footprint retained; native surfaces selected by the renderer.');
    for(const [f,status]of [[mesh,'rendered'],[building,'represented']]){const c=coverage.get(f.id);if(c){c.status=status;c.reason=f.render.evidence.at(-1);}}
  }
}
export function selectTreePoints(plan){
  const surfaceAt=createTreeSurfaceQuery(plan);
  for(const tree of plan.details.filter(f=>f.rule==='tree')){const alternatives=tree.merge.attributes.position?.alternatives;if(!alternatives||!surfaceAt(tree.point))continue;const usable=alternatives.filter(a=>!surfaceAt(a.value));if(usable.length!==1)continue;const selected=usable[0];tree.point=structuredClone(selected.value);tree.render.attributes.position={source:selected.source,value:tree.point,estimated:false,method:'Retained measured alternative outside modeled road/walkway surfaces; source identity group unchanged'};tree.render.evidence.push(tree.render.attributes.position.method);}
}
