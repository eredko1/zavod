import {sourceNumber} from '../data/source-number.js';
import {buildingBIN} from './building-match.js';
import {createShapeQuery} from './shape-query.js';
import {inShape} from './osm-model.js';

export const EQUIPMENT_RULES=Object.freeze({heightTolerance:.01,maxRoofGap:3,maxRoofPenetration:.5,footprintGrid:.25,minParentCoverage:.8,maxGridSteps:150});
export function waterTankFeature(base,item,issues,snapshot){
  const tags=base.tags,values=['BASE_ELEVATION','TOP_ELEVATION','HEIGHT'].map(key=>sourceNumber(tags[key]));
  base.rule='roof-equipment';base.reference=true;base.groundSurface=false;base.walkingSurface=false;base.equipmentKind='water-tank';item.status='reference';item.reason='Rooftop equipment requires a unique compatible building and roof.';
  if(String(tags.FEATURE_CODE)!=='1002'||String(tags.SUB_FEATURE_CODE)!=='100200'||!['New','Updated','Unchanged'].includes(tags.STATUS)||!Number.isInteger(snapshot.metadata?.captureYear)||snapshot.metadata?.verticalCRS!=='NAVD88'||snapshot.metadata?.elevationUnit!=='feet'||values.some(v=>v===null)||!base.shapes.length){item.reason='Unsupported tank role, status, geometry, capture date, dimensions or vertical reference.';issues.push({id:base.id,code:'invalid-roof-equipment',severity:'warning',message:item.reason});return base;}
  const [bottom,top,height]=values.map(v=>v*.3048);if(!(height>0)||Math.abs(top-bottom-height)>EQUIPMENT_RULES.heightTolerance){item.reason='Water-tank base/top/height fields conflict.';issues.push({id:base.id,code:'invalid-roof-equipment',severity:'warning',message:item.reason});return base;}
  base.equipment={bottom,top,height,captureYear:snapshot.metadata.captureYear,verticalCRS:'NAVD88',unit:'metres'};base.attributes.height={value:height,unit:'metres',estimated:false,source:'NYC HEIGHT (feet → metres)',raw:tags.HEIGHT};return base;
}
// Read the highest supplied triangle at XY; this is roof evidence, not certification of mesh collision topology.
export function roofHeightAt(building,x,z){
  if(!building.mesh)return building.height.top;
  const p=building.mesh.positions;let height=-Infinity;
  for(let i=0;i<p.length;i+=9){const dx=x-p[i],dz=z-p[i+2],bx=p[i+3]-p[i],bz=p[i+5]-p[i+2],cx=p[i+6]-p[i],cz=p[i+8]-p[i+2],det=bx*cz-bz*cx;if(Math.abs(det)<1e-10)continue;const u=(dx*cz-dz*cx)/det,v=(dz*bx-dx*bz)/det;if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7)height=Math.max(height,p[i+1]+u*(p[i+4]-p[i+1])+v*(p[i+7]-p[i+1]));}
  return height;
}
export function resolveRoofEquipment(plan,suppressed,{note}){
  const buildings=plan.buildings.filter(b=>!suppressed.has(b.id)&&b.extrude&&!b.reference&&!b.part&&!b.suppressed),coverage=new Map(plan.coverage.map(c=>[c.id,c])),queries=new Map(buildings.map(b=>[b,createShapeQuery(b.collisionProxy?.shapes||b.shapes)]));
  for(const f of plan.details.filter(f=>f.rule==='roof-equipment'&&f.equipment)){
    const bin=String(f.tags.BIN??'').trim(),parents=buildings.filter(b=>buildingBIN(b)===bin);let reason=null,parent=parents[0];
    if(parents.length!==1)reason='Water tank has no unique enabled rendered building with the same valid BIN.';
    else if(!Number.isFinite(parent.groundElevation))reason='Water tank requires a recorded compatible building base; no absolute-to-relative height guess.';
    else if(parent.merge.members.some(m=>sourceNumber(m.tags?.construction_year)>f.equipment.captureYear))reason='Current building construction postdates the tank capture; attachment requires review.';
    if(reason){note(f,reason,'roof-equipment-review');continue;}
    const bottom=f.equipment.bottom-parent.groundElevation,points=[],footprints=[];
    const inside=p=>queries.get(parent)([...p,...p]).some(s=>inShape(...p,s));
    for(const s of f.shapes){const r=s.outer,center=r.reduce((a,p)=>[a[0]+p[0]/r.length,a[1]+p[1]/r.length],[0,0]),xs=r.map(p=>p[0]),zs=r.map(p=>p[1]),xmin=Math.min(...xs),xmax=Math.max(...xs),zmin=Math.min(...zs),zmax=Math.max(...zs),step=Math.max(EQUIPMENT_RULES.footprintGrid,(xmax-xmin)/EQUIPMENT_RULES.maxGridSteps,(zmax-zmin)/EQUIPMENT_RULES.maxGridSteps);let sampled=0,covered=0,maxRoof=-Infinity;
      for(let x=xmin+step/2;x<xmax;x+=step)for(let z=zmin+step/2;z<zmax;z+=step)if(inShape(x,z,s)){sampled++;if(inside([x,z])){covered++;maxRoof=Math.max(maxRoof,roofHeightAt(parent,x,z));}}
      footprints.push({coverage:sampled?covered/sampled:0,sampled,covered,step,maxRoof:Number.isFinite(maxRoof)?maxRoof:null});points.push(center);
      if(!inShape(...center,s)||!inside(center))reason='Tank center is not inside its identified parent footprint.';
    }
    // Mapped tank circles can overhang a narrow roof block. Check area and center support separately.
    if(footprints.some(s=>s.coverage<EQUIPMENT_RULES.minParentCoverage))reason='Tank footprint has insufficient coverage by its identified parent.';
    const roofs=points.map(p=>roofHeightAt(parent,...p));
    if(!reason&&(roofs.some(y=>!Number.isFinite(y)||bottom-y>EQUIPMENT_RULES.maxRoofGap||y-bottom>EQUIPMENT_RULES.maxRoofPenetration)||footprints.some(s=>s.maxRoof!==null&&s.maxRoof-bottom>EQUIPMENT_RULES.maxRoofPenetration)))reason='Tank base conflicts with the selected local roof or equipment may already be modeled; retained for review.';
    if(reason){note(f,reason,'roof-equipment-review');continue;}
    f.reference=false;f.groundElevation=parent.groundElevation;f.equipmentModel={kind:'mapped-envelope',parent:parent.id,canonicalParent:parent.merge.canonicalId,bottom,top:bottom+f.equipment.height,height:f.equipment.height,parameters:EQUIPMENT_RULES,estimated:true};f.render.attributes.equipment={...f.equipmentModel,baseElevation:f.equipment.bottom,topElevation:f.equipment.top,verticalCRS:f.equipment.verticalCRS,roofHeights:roofs,footprints,method:'Mapped footprint extruded between recorded base/top; parent ground elevation supplies the shared rigid base. Envelope shape and datum alignment remain provisional.'};f.render.evidence.push('Unique parent BIN with compatible footprint coverage and local roof support. Equipment complements the selected building, never replaces it.');f.estimates.push('Measured tank footprint and vertical envelope; walls/top shape are an extrusion estimate. Roof cap, legs and materials are not measured.');plan.issues.push({id:f.id,code:'estimated-equipment-envelope',severity:'info',message:f.estimates.at(-1)});const c=coverage.get(f.id);if(c){c.status='rendered';c.reason='Mapped rooftop tank envelope linked to a unique compatible building.';}
  }
}
