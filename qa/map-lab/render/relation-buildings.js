import {surfaceIdentity} from '../pipeline/surface-identity.js';
import {PART_ASSEMBLY_RULES} from './building-parts.js';

// A template height estimate must not erase a retained source entity. Choose presentation only after both models exist.
export function resolveRelationBuildings(plan,data,{note}){
  if(!data)return;
  const byID=new Map(plan.buildings.map(f=>[f.id,f])),coverage=new Map(plan.coverage.map(c=>[c.id,c])),pairs=[],counts=new Map();
  for(const relation of data.elements.filter(e=>e.type==='relation'&&e.tags?.type==='multipolygon')){
    const parent=byID.get(`relation/${relation.id}`);if(!parent||parent.reference||parent.mesh||parent.suppressed||!parent.shapes.length)continue;
    const candidates=[];
    for(const member of relation.members||[]){
      if(member.type!=='way'||member.role&&member.role!=='outer')continue;
      const child=byID.get(`way/${member.ref}`);
      if(!child||child.reference||child.mesh||child.suppressed||child.part!==parent.part||!child.shapes.length||!child.extrude&&!parent.extrude)continue;
      if(!Number.isFinite(parent.height.bottom)||!Number.isFinite(child.height.bottom)||Math.abs(parent.height.bottom-child.height.bottom)>PART_ASSEMBLY_RULES.heightTolerance)continue;
      if(surfaceIdentity(parent.shapes)!==surfaceIdentity(child.shapes))continue;
      if(!candidates.includes(child))candidates.push(child);
    }
    for(const child of candidates){pairs.push({parent,child});counts.set(parent,(counts.get(parent)||0)+1);counts.set(child,(counts.get(child)||0)+1);}
  }
  for(const {parent,child}of pairs){
    if(counts.get(parent)!==1||counts.get(child)!==1){note(parent,'Multiple exact relation/member building representations; no visual identity winner selected.','relation-building-review');continue;}
    const selected=!parent.extrude||child.extrude&&parent.height.estimated&&!child.height.estimated?child:parent,represented=selected===child?parent:child;
    const decision={parent:parent.id,member:child.id,selected:selected.id,parentHeight:structuredClone(parent.height),memberHeight:structuredClone(child.height),method:'Explicit outer-member reference and identical footprint/holes/base; prefer a usable measured height, then the whole relation model'};
    for(const f of [parent,child])f.render.attributes.relationRepresentation=decision;
    represented.suppressed=true;represented.render.status='represented';represented.render.evidence.push(`Exact relation/member geometry represented by ${selected.id}; original geometry and height tags remain available.`);
    const c=coverage.get(represented.id);if(c){c.status='represented';c.reason=represented.render.evidence.at(-1);c.representedBy=selected.id;}
    plan.issues=plan.issues.filter(i=>!(i.id===represented.id&&i.code==='missing-height'));
    if(parent.height.valid&&child.height.valid&&Math.abs(parent.height.top-child.height.top)>PART_ASSEMBLY_RULES.heightTolerance)note(represented,'Relation/member height alternatives disagree; the render selection retains both original observations and records both model envelopes.','relation-height-review');
  }
}
