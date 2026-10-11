import {inShape} from './osm-model.js';
import {clipPaths} from './area-clip.js';
import {physicalLevel,isGroundLevel,isBridgeLevel} from './physical-level.js';
import {resolveBridgeLevels,longitudinalHeight,BRIDGE_LEVEL_RULES} from './bridge-levels.js';
import {resolveBridgeRamps} from './bridge-ramps.js';

export const STRUCTURE_RULES=Object.freeze({sampleSpacing:10,maxSupportDistance:125,minSamples:2,conflictTolerance:.01,deckOffset:.04});
const inside=(p,f)=>f.shapes.some(s=>inShape(...p,s));
export const compatibleStructure=(feature,structure)=>feature.rule==='rail'?['rail-bridge','rail-viaduct'].includes(structure.infrastructure):feature.path?structure.infrastructure==='pedestrian-bridge':['road-bridge','overpass'].includes(structure.infrastructure);
function pointsOf(f){
  let paths=[...(f.paths||[]),...(f.shapes||[]).flatMap(s=>[s.outer,...s.holes].map(r=>[...r,r[0]]))];
  if(f.clipBounds)paths=clipPaths(paths,f.clipBounds);
  const points=paths.flatMap(path=>path.flatMap((p,i)=>{if(!i)return[p];const a=path[i-1],n=Math.max(1,Math.ceil(Math.hypot(p[0]-a[0],p[1]-a[1])/STRUCTURE_RULES.sampleSpacing));return Array.from({length:n},(_,j)=>[a[0]+(p[0]-a[0])*(j+1)/n,a[1]+(p[1]-a[1])*(j+1)/n]);}));
  // Check interior support too; observations around a large perimeter do not cover its centre.
  for(const s of f.shapes||[]){const b=s.outer.reduce((b,p)=>({x0:Math.min(b.x0,p[0]),x1:Math.max(b.x1,p[0]),z0:Math.min(b.z0,p[1]),z1:Math.max(b.z1,p[1])}),{x0:Infinity,x1:-Infinity,z0:Infinity,z1:-Infinity}),c=f.clipBounds;
    if(c){b.x0=Math.max(b.x0,c.x0);b.x1=Math.min(b.x1,c.x1);b.z0=Math.max(b.z0,c.z0);b.z1=Math.min(b.z1,c.z1);}
    for(let x=b.x0;x<=b.x1;x+=STRUCTURE_RULES.sampleSpacing)for(let z=b.z0;z<=b.z1;z+=STRUCTURE_RULES.sampleSpacing)if(inShape(x,z,s))points.push([x,z]);
  }return points;
}
export function profileHeight(profile,x,z){
  if(profile.kind==='longitudinal')return longitudinalHeight(profile,x,z);
  const near=profile.samples.map(s=>({s,d:Math.hypot(s.x-x,s.z-z)})).sort((a,b)=>a.d-b.d||a.s.id.localeCompare(b.s.id)).slice(0,4);
  if(near[0].d<1e-6)return near[0].s.value;
  return near.reduce((sum,n)=>sum+n.s.value/(n.d*n.d),0)/near.reduce((sum,n)=>sum+1/(n.d*n.d),0);
}

// Relations supplement records; they never equate a centreline, deck, roof or sample.
export function resolveInfrastructure(plan,{note}){
  const coverage=new Map(plan.coverage.map(c=>[c.id,c]));
  const structures=plan.details.filter(f=>f.sourceId==='nyc-transport'&&['road-bridge','rail-bridge','rail-viaduct','pedestrian-bridge','overpass'].includes(f.infrastructure));
  const observations=plan.details.filter(f=>f.sourceId==='nyc-elevation'&&String(f.tags.sub_code)==='300020'&&Number.isFinite(f.elevation));
  const owned=new Map(structures.map(f=>[f,[]])),levelClaims=new Map();
  for(const sample of observations){const candidates=structures.filter(f=>inside(sample.point,f));
    if(candidates.length===1)owned.get(candidates[0]).push({id:sample.id,x:sample.point[0],z:sample.point[1],value:sample.elevation});
    else if(candidates.length>1)for(const f of candidates)note(f,`Bridge sample ${sample.id} intersects multiple structures; elevation association is ambiguous.`,'elevation-association');
  }
  function record(f,profile,source){
    f.elevationProfile=profile;f.reference=false;f.groundSurface=false;
    f.render.attributes.elevationProfile={source,estimated:true,unit:'metres',method:profile.method,parameters:profile.parameters||STRUCTURE_RULES,samples:profile.samples,knots:profile.knots,role:profile.role,relativeLayer:profile.relativeLayer,datum:'NYC elevation reference; alignment with ground provisional'};
    f.render.evidence.push(`Elevation constrained by ${profile.samples.length} unambiguous bridge samples; interpolation remains estimated.`);
    const c=coverage.get(f.id);if(c){c.status='rendered';c.reason='Measured bridge samples constrain an estimated elevated surface.';}
    plan.issues=plan.issues.filter(i=>!(i.id===f.id&&['infrastructure-reference','flat-road','flat-detail'].includes(i.code)));
    plan.issues.push({id:f.id,code:'estimated-elevated-profile',severity:'info',message:`Bridge-sample interpolation from ${source}; no surveyed crossfall, deck thickness or supports. NYC vertical-reference alignment remains provisional.`});
  }
  for(const f of structures){
    const samples=owned.get(f).sort((a,b)=>a.id.localeCompare(b.id)),unique=[];let conflict=false;
    for(const s of samples){const previous=unique.find(p=>p.x===s.x&&p.z===s.z);if(previous){if(Math.abs(previous.value-s.value)>STRUCTURE_RULES.conflictTolerance){conflict=true;unique.push(s);}}else unique.push(s);}
    const levels=resolveBridgeLevels(f,unique,plan.roads);
    if(levels.mixed){
      f.render.attributes.mixedLevels={parameters:BRIDGE_LEVEL_RULES,pairs:levels.pairs?.map(p=>[p.lower.id,p.upper.id])||[],resolvedRoads:levels.resolved.map(r=>r.road.id)};
      note(f,'Nearby bridge observations describe separate elevations; a single polygon cannot be interpolated across them. Unassigned readings and the full polygon remain references.','mixed-bridge-levels');
      for(const resolved of levels.resolved){if(!levelClaims.has(resolved.road))levelClaims.set(resolved.road,[]);levelClaims.get(resolved.road).push({structure:f,resolved});}
      continue;
    }
    const points=pointsOf(f),supported=unique.length>=STRUCTURE_RULES.minSamples&&points.length&&points.every(p=>unique.some(s=>Math.hypot(s.x-p[0],s.z-p[1])<=STRUCTURE_RULES.maxSupportDistance));
    if(conflict||!supported){note(f,conflict?'Conflicting co-located bridge elevations; deck remains an outline.':'Insufficient local bridge samples to support the complete visible deck; outline retained.','missing-structure-elevation');continue;}
    f.rule='surface';f.surface=true;f.surfaceKind=['road-bridge','overpass'].includes(f.infrastructure)?'roadbed':'paved';f.surfaceHeight=STRUCTURE_RULES.deckOffset;
    f.attributes.surfaceOffset={value:STRUCTURE_RULES.deckOffset,unit:'metres',source:'Display offset',estimated:true};
    record(f,{samples:unique,method:'Four-nearest inverse-distance interpolation; bounded sample support'},f.id);
  }
  for(const [road,claims]of levelClaims){
    const otherSupports=structures.filter(s=>s.elevationProfile&&compatibleStructure(road,s)&&pointsOf(road).every(p=>inside(p,s)));
    if(claims.length!==1||otherSupports.length){road.elevationAmbiguous=true;note(road,'Multiple structures claim this road; level profile remains unresolved.','elevation-association');continue;}
    const {structure,resolved}=claims[0];road.sourcePaths=road.paths;road.paths=resolved.paths;road.unresolvedPaths=resolved.unresolvedPaths;record(road,resolved.profile,structure.id);road.surfaceHeight=STRUCTURE_RULES.deckOffset;road.render.attributes.structure={source:structure.id,relationship:'measured-level-within'};road.render.evidence.push('Source polygon mixes levels; only the bounded longitudinally supported road interval is rendered. Remaining original path is a reference.');
  }
  // Resolve ordinary whole-deck associations first; ramps can then use their measured node heights.
  const unresolved=[];
  for(const f of [...plan.buildings,...plan.roads,...plan.details].filter(f=>!f.elevationProfile&&(f.requiresElevation||!isGroundLevel(f))&&f.sourceId!=='nyc-transport')){
    const points=pointsOf(f),level=f.sourceId&&f.sourceId!=='osm-overpass'?{kind:'source-role',reason:`NYC ${f.infrastructure} requires its source-specific vertical model.`}:physicalLevel(f);f.render.attributes.physicalLevel={...level,source:f.id};
    const supportedRole=f.sourceId==='nyc-railroad'?['elevated-rail','viaduct-rail'].includes(f.infrastructure):isBridgeLevel(f);
    // A platform, roof, barrier or prop cannot inherit a road/track height merely by containment.
    const candidates=f.elevationAmbiguous||!points.length||!supportedRole||!(f.width||f.rule==='rail')?[]:structures.filter(s=>s.elevationProfile&&compatibleStructure(f,s)&&points.every(p=>inside(p,s)));
    if(candidates.length===1){const s=candidates[0];record(f,s.elevationProfile,s.id);f.render.attributes.structure={source:s.id,relationship:'supported-by'};
      if(f.width){f.reference=true;const c=coverage.get(f.id);if(c){c.status='reference';c.reason='Road centreline reference; the associated measured deck supplies its surface.';}f.render.evidence.push('Road centreline retained as an elevated reference; the measured deck supplies its surface.');}
    }
    else unresolved.push({f,level,candidates});
  }
  for(const {road,profile,anchors}of resolveBridgeRamps(plan,profileHeight,{note})){record(road,profile,anchors.join(', '));road.surfaceHeight=STRUCTURE_RULES.deckOffset;road.render.attributes.rampAnchors=anchors;}
  for(const {f,level,candidates}of unresolved)if(!f.elevationProfile){f.reference=true;f.requiresElevation=true;if(f.height)f.extrude=false;const c=coverage.get(f.id);if(c){c.status='reference';c.reason='Feature has no unique, fully supported elevation profile.';}plan.issues=plan.issues.filter(i=>!(i.id===f.id&&['flat-road','flat-detail'].includes(i.code)));note(f,`${level.reason} ${candidates.length?'Multiple elevated supports; outline retained.':'No fully supported compatible structure covers this feature; outline/marker retained.'}`,'missing-structure-elevation');}
  // Source attributes with known units remain distinct from inferred surface geometry.
  for(const f of plan.details.filter(f=>Number.isFinite(f.absoluteElevation))){f.groundSurface=false;f.render.attributes.elevation=f.attributes.elevation;f.render.evidence.push('Recorded NYC surface elevation (feet converted to metres); no structure thickness inferred.');}
}
