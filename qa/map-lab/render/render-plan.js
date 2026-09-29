import {planFromOSM,heightOf,DEFAULTS} from '../pipeline/osm-model.js';
import {planFromNYC} from '../pipeline/nyc-model.js';
import {resolveInfrastructure} from '../pipeline/infrastructure-merge.js';
import {resolveGroundLevels} from '../pipeline/ground-levels.js';
import {resolveRoadApproaches} from '../pipeline/road-approaches.js';
import {resolveBridgeSupports} from '../pipeline/bridge-supports.js';
import {resolveRoofEquipment} from '../pipeline/roof-equipment.js';
import {createTreeSurfaceQuery,resolveTreePlacements,TREE_PLACEMENT_RULES} from '../pipeline/tree-placement.js';
import {RENDER_POLICY_VERSION} from './render-rules.js';
import {resolveBuildingParts} from './building-parts.js';
import {meshTopology} from './mesh-topology.js';
import {selectNativeBuildings,selectTreePoints} from './source-representations.js';
import {resolveRelationBuildings} from './relation-buildings.js';

export {RENDER_POLICY_VERSION};
const CURB_CLASS_TOLERANCE=.001;
// Rendering owns derived dimensions, placement and visual exclusions. Source merge decisions remain unchanged.
export function prepareRenderPlan(sourcePlan,result=null,settings={}){
  settings={...DEFAULTS,terrain:true,...settings};
  if(!(settings.storey>0&&settings.storey<=20))throw Error('Metres per floor must be greater than zero and at most 20.');
  if(!(settings.curb>=0&&settings.curb<=1))throw Error('Curb height must be between 0 and 1 metre.');
  const {observations,...selected}=sourcePlan,plan=structuredClone(selected),features=[...plan.buildings,...plan.roads,...plan.details],coverage=new Map(plan.coverage.map(c=>[c.id,c])),decisions=[],excluded=new Set();
  // Observation inventories are immutable inputs; avoid cloning native geometry merely to make a render model.
  plan.observations=observations;
  plan.sourceOptions=plan.options;plan.options={...settings};
  for(const f of features){f.render={id:f.id,canonicalId:f.merge.canonicalId,ruleId:f.merge.ruleId,status:'retained',members:f.merge.members,attributes:{},evidence:[],conflicts:[]};decisions.push(f.render);const c=coverage.get(f.id);if(c)c.render=f.render;}
  const activeByID=new Map(features.map(f=>[f.id,f]));
  for(const road of plan.roadNetwork||[]){const active=activeByID.get(road.id);if(active){road.render=active.render;continue;}const source=coverage.get(road.id)?.merge;if(!source)throw Error('Road topology has no source identity '+road.id);road.render={id:road.id,canonicalId:source.canonicalId,ruleId:source.ruleId,status:'represented',members:source.members,attributes:{},evidence:['Topology retained; surface represented by confirmed source coverage.'],conflicts:[]};decisions.push(road.render);coverage.get(road.id).render=road.render;}
  const note=(f,message,code='render-conflict')=>{if(f.render.conflicts.includes(message))return;f.render.conflicts.push(message);plan.issues.push({id:f.id,dataset:f.dataset,code,severity:'warning',message});};
  if(result){
    const templates=[],issues=[];
    if(result.data?.elements?.length){const osm=planFromOSM(result.data,{...settings,retainRepresented:true});templates.push(...osm.buildings,...osm.roads,...osm.details);issues.push(...osm.issues);}
    for(const snap of result.nyc||[]){const city=planFromNYC(snap,plan.origin,settings.curb);templates.push(...city.buildings,...city.roads,...city.details);issues.push(...city.issues);}
    const byID=new Map(templates.map(f=>[f.id,f]));
    for(const f of features){
      let template=byID.get(f.id);if(!template)throw Error('Missing render input for source feature '+f.id);
      const coverageItem=coverage.get(f.id);if(coverageItem?.status==='retained'){coverageItem.status=f.reference?'reference':'rendered';coverageItem.reason='Prepared by rendering from retained source observations.';}
      const osmMember=f.merge.members.find(m=>m.sourceId==='osm-overpass');
      if(f.rule==='tree'&&osmMember){template=byID.get(osmMember.id);if(!template)throw Error('Missing matched tree render input '+osmMember.id);}
      f.dimensions??={};f.attributes??={};f.estimates??=[];
      for(const [key,value]of Object.entries(template.dimensions||{}))if(f.dimensions[key]===undefined){f.dimensions[key]=value;if(!template.attributes?.[key])f.attributes[key]={value,unit:'metres',estimated:true,source:'Render rule default'};}
      for(const [key,value]of Object.entries(template.attributes||{}))if(f.attributes[key]===undefined)f.attributes[key]=structuredClone(value);
      for(const key of ['surfaceHeight','baseOffset','rotation'])if(f[key]===undefined&&template[key]!==undefined)f[key]=template[key];
      if(['bench','gate'].includes(f.rule)&&!sourcePlan.details.find(d=>d.id===f.id)?.rotation&&template.estimates.some(m=>m.startsWith('orientation=')))f.render.attributes.orientation={value:f.rotation,unit:'radians',estimated:true,source:'North-facing render default'};
      if(f.height&&!f.mesh){
        if(!f.height.valid){const candidate=template.height?.valid?template.height:osmMember?heightOf(osmMember.tags,settings):null;if(candidate?.valid)f.height=structuredClone(candidate);}
        if(f.height.bottom===null){const candidate=osmMember?heightOf(osmMember.tags,settings):template.height;if(!candidate)throw Error('Missing render base model '+f.id);f.height={...structuredClone(candidate),top:f.height.top,topEstimated:false,valid:f.height.top!==null&&f.height.top>candidate.bottom};}
        f.extrude=!!(f.shapes.length&&f.height.valid&&!f.reference);
        if(f.height.estimated)f.render.attributes.height={...f.height,unit:'metres',estimated:true,source:osmMember?.id||f.id};
        const c=coverage.get(f.id);if(c&&!f.reference){c.status=f.extrude?'rendered':'skipped';c.reason=f.extrude?'Source footprint with measured or explicitly estimated render height.':'No supported render height for the source footprint.';}
      }
      if(f.tags.highway&&f.paths){if(!f.width)f.width=structuredClone(template.width);const range=f.merge.attributes.widthRange;if(f.width?.estimated&&Number(range?.minimum)>0){f.width={value:Number(range.minimum)*.3048,estimated:true,source:'Matched LION minimum paved width; constant-width approximation'};f.render.attributes.width={...f.width,unit:'metres',source:range.source,minimumFeet:range.minimum,maximumFeet:range.maximum};}}
      if(f.width?.estimated&&!f.render.attributes.width)f.render.attributes.width={...f.width,unit:'metres'};
      if(f.rule==='kerb'&&!f.merge.attributes.height){const inferred=f.merge.members.map(m=>byID.get(m.id)?.attributes?.height).filter(h=>h?.estimated&&h.source==='OSM classification');if(inferred.length){if(inferred.some(h=>Math.abs(h.value-inferred[0].value)>CURB_CLASS_TOLERANCE)){f.reference=true;const message='Conflicting source curb classifications; renderer retains an outline instead of choosing a height.';note(f,message,'curb-render-conflict');if(coverageItem){coverageItem.status='reference';coverageItem.reason=message;}}else{f.dimensions.height=inferred[0].value;f.attributes.height=structuredClone(inferred[0]);}}}
      const inferred=Object.fromEntries(Object.entries(f.attributes).filter(([,value])=>value?.estimated));if(Object.keys(inferred).length)f.render.attributes.dimensions=inferred;
      for(const [key,attr]of Object.entries(inferred))f.estimates.push(`${key}=${attr.value} ${attr.unit||''} (${attr.source}; render estimate)`);
      if(f.height?.estimated)f.estimates.push(f.height.source+' (render estimate)');
      if(f.width?.estimated)f.estimates.push(f.width.source+' (render estimate)');
      f.render.evidence.push(...f.estimates);
    }
    for(const road of plan.roadNetwork||[]){const active=plan.roads.find(f=>f.id===road.id),template=byID.get(road.id);road.width=active?.width||template?.width;}
    for(const issue of issues)if(issue.code!=='estimated-detail'&&features.some(f=>f.id===issue.id)&&!plan.issues.some(i=>i.id===issue.id&&i.code===issue.code))plan.issues.push(issue);
    for(const f of features)for(const message of f.estimates||[])plan.issues.push({id:f.id,code:'estimated-detail',severity:'info',message});
    plan.issues=plan.issues.filter(i=>i.code!=='missing-height'||!plan.buildings.find(f=>f.id===i.id)?.extrude);
  }
  selectNativeBuildings(plan,sourcePlan);
  for(const f of plan.buildings.filter(f=>f.mesh&&!f.reference)){
    f.mesh.topology=meshTopology(f.mesh.positions);f.render.attributes.nativeTopology=f.mesh.topology;f.render.evidence.push(f.mesh.topology.closed?'Native triangles pass the render solid audit; area cuts may add estimated caps. Roof walking remains unsupported.':'Native triangles do not pass the render solid audit; surface display and the recorded footprint collision proxy remain separate.');
    const current=f.geometryContext;if(!current)throw Error('Selected native mesh has no measured source context.');
    let height=structuredClone(current.height);if(height.bottom===null){const member=f.merge.members.find(m=>m.sourceId==='osm-overpass');if(!member)throw Error('Unknown collision base has no retained source height input '+f.id);const base=heightOf(member.tags,settings);height={...base,top:height.top,topEstimated:false,valid:height.top>base.bottom};if(!height.valid)note(f,'Estimated base conflicts with the measured top; native display remains available but its extrusion collision proxy is disabled.','invalid-collision-height');}
    f.collisionProxy={...structuredClone(current),height,estimated:true};f.render.attributes.collision={source:current.source,height,estimated:true,method:'Retained current footprint extrusion proxy; native surface topology is not certified for collision'};
    f.mesh.placement={estimated:true,method:'Rigid base rebase onto matched current building base; preserves relative surfaces, not an EGM96 to NAVD88 datum transformation',source:current.source,sourceBase:f.mesh.sourceBase,targetGroundElevation:f.groundElevation??null};f.render.attributes.placement=f.mesh.placement;plan.issues.push({id:f.id,code:'estimated-mesh-placement',severity:'info',message:f.mesh.placement.method});
  }
  resolveRelationBuildings(plan,result?.data,{note});resolveBuildingParts(plan,{note});
  resolveInfrastructure(plan,{note});resolveGroundLevels(plan);resolveRoadApproaches(plan,{note});resolveBridgeSupports(plan);resolveRoofEquipment(plan,new Set(),{note});
  for(const f of plan.details.filter(f=>Number.isFinite(f.absoluteElevation))){const message='Recorded surface top; thickness/supports unknown. Elevation datum alignment with NYC ground samples is provisional.';f.render.evidence.push(message);plan.issues.push({id:f.id,code:'provisional-surface-datum',severity:'info',message});}
  if(plan.merge.enabled){selectTreePoints(plan);for(const e of resolveTreePlacements(plan,new Set(),createTreeSurfaceQuery(plan))){excluded.add(e.id);const f=features.find(f=>f.id===e.id),c=coverage.get(e.id);f.render.status='excluded';f.render.attributes.treePlacement={...e,rule:TREE_PLACEMENT_RULES};f.render.evidence.push(e.reason+' Original source observation retained.');f.render.conflicts.push(f.render.evidence.at(-1));if(c){c.status='excluded';c.reason=f.render.evidence.at(-1);}plan.issues.push({id:e.id,code:'tree-surface-conflict',severity:'warning',message:f.render.evidence.at(-1)});}}
  for(const key of ['buildings','roads','details'])plan[key]=plan[key].filter(f=>!excluded.has(f.id));
  plan.render={version:RENDER_POLICY_VERSION,decisions,excluded:[...excluded].sort()};return plan;
}
