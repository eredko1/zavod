import {pathPosition} from './geometry-distance.js';
import {inShape} from './osm-model.js';
import {buildingOverlap} from './building-match.js';
import {isBridgeLevel} from './physical-level.js';

export const SUPPORT_RULES=Object.freeze({corridorMargin:1,corridorJoinSegments:12,beamHeightRatio:.05,maxBeamHeight:10});
export function roadCorridors(road){
  const shapes=[...road.shapes],radius=road.width.value/2+SUPPORT_RULES.corridorMargin;
  for(const path of road.paths){for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!length)continue;const x=-(b[1]-a[1])/length*radius,z=(b[0]-a[0])/length*radius;shapes.push({outer:[[a[0]+x,a[1]+z],[a[0]-x,a[1]-z],[b[0]-x,b[1]-z],[b[0]+x,b[1]+z]],holes:[]});}}
  // The road renderer uses round joins; reserve those clearances at bends and endpoints too.
  for(const path of road.paths)for(const p of path)shapes.push({outer:Array.from({length:SUPPORT_RULES.corridorJoinSegments},(_,i)=>{const angle=i*Math.PI*2/SUPPORT_RULES.corridorJoinSegments;return [p[0]+Math.cos(angle)*radius,p[1]+Math.sin(angle)*radius];}),holes:[]});
  return shapes;
}
export function resolveBridgeSupports(plan){
  const coverage=new Map(plan.coverage.map(c=>[c.id,c])),roads=plan.roads.filter(f=>isBridgeLevel(f)&&f.width&&!f.path).sort((a,b)=>a.id.localeCompare(b.id)).map(f=>({...f,paths:f.sourcePaths||f.paths})),structures=plan.details.filter(f=>f.sourceId==='nyc-transport'&&['road-bridge','overpass'].includes(f.infrastructure));
  for(const support of plan.details.filter(f=>f.rule==='bridge-support')){
    if(support.supportKind!=='pylon'||!(support.dimensions.height>0)||support.shapes.length!==1)continue;
    const ring=support.shapes[0].outer,center=ring.reduce((p,v)=>[p[0]+v[0]/ring.length,p[1]+v[1]/ring.length],[0,0]),radius=Math.max(...ring.map(p=>Math.hypot(p[0]-center[0],p[1]-center[1]))),matches=roads.filter(r=>r.paths.some(path=>pathPosition(path,center).distance<radius+r.width.value/2));
    const owners=structures.filter(f=>f.shapes.some(s=>inShape(...center,s)));if(!matches.length||owners.length!==1)continue;
    const corridors=matches.flatMap(roadCorridors);if(!buildingOverlap(support.shapes,corridors))continue;
    support.reference=false;support.supportModel={kind:'open-pylon-frame',corridors,height:support.dimensions.height,beamHeight:Math.min(SUPPORT_RULES.maxBeamHeight,support.dimensions.height*SUPPORT_RULES.beamHeightRatio),parameters:SUPPORT_RULES,roads:matches.map(r=>r.id),structure:owners[0].id,estimated:true};
    support.render.attributes.supportModel=support.supportModel;support.render.evidence.push('Mapped pylon outline and tagged height retained within one road structure. Estimated frame keeps the mapped OSM bridge road corridors open to the top beam; terrain base, member shape, corridor margin and top beam depth are estimates. Unresolved road heights remain unresolved.');
    support.attributes.placement={source:'estimated-terrain-at-mapped-footprint',estimated:true};support.estimates.push('Open pylon frame: unmeasured legs/beam; terrain base is estimated, including over water. No cables, bracing or foundations inferred.');
    const c=coverage.get(support.id);if(c){c.status='rendered';c.reason='Mapped pylon with tagged height; estimated open frame around mapped roadway corridors.';}
    plan.issues.push({id:support.id,code:'estimated-support-frame',severity:'info',message:support.estimates.at(-1)});
  }
}
