import { inShape } from './osm-model.js';
import { MERGE_POLICY_VERSION, MERGE_POLICIES, NYC_MERGE_POLICY } from './map-merge-rules.js';
import { buildingOverlap, createBuildingMatcher } from './building-match.js';
import { createShapeQuery, pointBounds } from './shape-query.js';

// Conservative starting tolerances, in metres. Ambiguous candidates never suppress either source.
export const MERGE_PARAMETERS = { treeDistance: 1.5, treeConflictDistance: 4, buildingOverlap: 0.8, buildingIdentityOverlap: 0.5, buildingReviewOverlap: 0.2, buildingGrid: 1, curbDistance: 0.35, treeRowClearance: 2 };
const osm = f => !f.sourceId || f.sourceId === 'osm-overpass';
const sourceOf = f => f.sourceId || 'osm-overpass';
const stableID = f => f.sourceId === 'nyc-lion' && f.tags?.SegmentID ? `nyc-lion/segment/${f.tags.SegmentID}` : f.id.replace(/@[a-f0-9]+$/, '');
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const inside = (p, shapes) => shapes.some(s => inShape(...p, s));
const physicalLevel = f => [undefined,'no'].includes(f.tags?.bridge) && [undefined,'no'].includes(f.tags?.tunnel) && [undefined,'surface'].includes(f.tags?.location) && (!f.tags?.layer || Number(f.tags.layer) === 0);
const overlap=(a,b)=>buildingOverlap(a,b,MERGE_PARAMETERS.buildingGrid);
function edgeDistance(p, a, b) { const dx=b[0]-a[0], dz=b[1]-a[1], t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1))); return dist(p,[a[0]+dx*t,a[1]+dz*t]); }
function lineCovered(paths, candidates, tolerance) {
  const edges = candidates.flatMap(f => f.paths.flatMap(r => r.slice(1).map((b,i) => [r[i],b])));
  return edges.length && paths.length && paths.every(r => r.slice(1).every((b,i) => { const a=r[i], steps=Math.max(1,Math.ceil(dist(a,b))); for(let n=0;n<=steps;n++) {const p=[a[0]+(b[0]-a[0])*n/steps,a[1]+(b[1]-a[1])*n/steps]; if(!edges.some(([u,v])=>edgeDistance(p,u,v)<=tolerance)) return false;} return true; }));
}
// Split at exact polygon-edge crossings, then retain uncovered intervals. Never discard a whole crossing way.
export function uncoveredPaths(paths, shapes, query = createShapeQuery(shapes)) {
  const result = []; let removed = 0;
  for (const path of paths) { let current = null;
    for (let k=1;k<path.length;k++) { const a=path[k-1],b=path[k],dx=b[0]-a[0],dz=b[1]-a[1], cuts=[0,1];
      const nearby=query(pointBounds([a,b]));
      for (const s of nearby) for (const r of [s.outer,...s.holes]) for(let i=0;i<r.length;i++) {const c=r[i],d=r[(i+1)%r.length],ex=d[0]-c[0],ez=d[1]-c[1],den=dx*ez-dz*ex;if(Math.abs(den)<1e-10)continue;const t=((c[0]-a[0])*ez-(c[1]-a[1])*ex)/den,u=((c[0]-a[0])*dz-(c[1]-a[1])*dx)/den;if(t>1e-9&&t<1-1e-9&&u>=0&&u<=1)cuts.push(t);}
      cuts.sort((u,v)=>u-v);
      for(let i=1;i<cuts.length;i++){const lo=cuts[i-1],hi=cuts[i];if(hi-lo<1e-9)continue;const at=t=>[a[0]+dx*t,a[1]+dz*t];if(inside(at((lo+hi)/2),nearby)){removed+=(hi-lo)*Math.hypot(dx,dz);current=null;continue;}const start=at(lo),end=at(hi);if(current&&dist(current.at(-1),start)<1e-6)current.push(end);else{current=[start,end];result.push(current);}}
    }
  }
  return { paths: result, removed };
}
export function policyFor(f) {
  if (NYC_MERGE_POLICY[f.sourceId]) return NYC_MERGE_POLICY[f.sourceId];
  const t=f.tags||{};
  if(f.height || t.building || t['building:part'])return 'buildings';
  if(f.rule==='tree')return 'trees';
  if(['tree-row','hedge'].includes(f.rule)||['wood','scrub','tree_row'].includes(t.natural))return 'vegetation-areas';
  if(t.barrier==='kerb'||f.rule==='kerb')return 'curbs';
  if(t.barrier || ['fence','wall','gate'].includes(f.rule))return 'barriers';
  if(t.railway || f.rule==='rail')return 'rail';
  if(f.width)return f.path?'sidewalks':'roads';
  if(['bench','lamp','signal','pole','bin','bollard'].includes(f.rule))return 'street-furniture';
  if(f.surface)return 'areas';
  if(t.amenity||t.shop||t.entrance||t.place||t.name)return 'places';
  if(['metadata','geometry-reference'].includes(f.rule))return 'relations';
  return 'unknown';
}
export function mergePlan(input, enabled = true) {
  const plan = structuredClone(input), all=[...plan.buildings,...plan.roads,...plan.details], coverage=new Map(plan.coverage.map(c=>[c.id,c])), suppressed=new Set(), decisions=[];
  const records = new Map(), idCounts=new Map();
  for(const c of plan.coverage){const id=stableID(c);idCounts.set(id,(idCounts.get(id)||0)+1);}
  const canonical=f=>idCounts.get(stableID(f))>1?f.id:stableID(f);
  for(const f of all){const ruleId=policyFor(f), member={id:f.id,sourceId:sourceOf(f),stableId:stableID(f),tags:structuredClone(f.tags)}, r={canonicalId:canonical(f),ruleId,ruleVersion:MERGE_POLICY_VERSION,status:'retained',members:[member],geometrySource:sourceOf(f),attributes:{},evidence:[],conflicts:[]};f.merge=r;records.set(f.id,r);decisions.push(r);}
  for(const c of plan.coverage) if(!records.has(c.id)){const r={canonicalId:canonical(c),ruleId:policyFor(c),ruleVersion:MERGE_POLICY_VERSION,status:c.status,members:[{id:c.id,sourceId:sourceOf(c),stableId:stableID(c),tags:c.tags}],geometrySource:sourceOf(c),attributes:{},evidence:[],conflicts:[]};records.set(c.id,r);decisions.push(r);}
  function note(f, message, code='merge-conflict'){const r=records.get(f.id);if(r.conflicts.includes(message))return;r.conflicts.push(message);plan.issues.push({id:f.id,dataset:f.dataset,code,severity:'warning',message});}
  function represent(a,b,evidence){suppressed.add(a.id);a.merge.status='merged';a.merge.canonicalId=b.merge.canonicalId;b.merge.status='merged';b.merge.members.push(...a.merge.members);b.merge.evidence.push(evidence);a.merge.evidence.push(evidence);a.merge.representedBy=b.id;const c=coverage.get(a.id);if(c){c.status='merged';c.reason=evidence;c.representedBy=b.id;} }
  function pair(left,right,score,act){const pairs=[];for(const a of left)for(const b of right){const evidence=score(a,b);if(evidence)pairs.push({a,b,evidence});}for(const p of pairs){const aa=pairs.filter(q=>q.a===p.a),bb=pairs.filter(q=>q.b===p.b);if(aa.length===1&&bb.length===1)act(p.a,p.b,p.evidence);else{note(p.a,'Ambiguous spatial match; all candidate records retained.');note(p.b,'Ambiguous spatial match; all candidate records retained.');}}}
  if(enabled){
    // LION aliases repeat physical geometry. Keep every row as a member and draw each identical segment once.
    const lions=plan.details.filter(f=>f.sourceId==='nyc-lion').sort((a,b)=>a.id.localeCompare(b.id)), lionGroups=new Map();
    for(const f of lions){const t=f.tags, key=JSON.stringify([t.SegmentID,f.paths,...['RB_Layer','FeatureTyp','Status','StreetWidth_Min','StreetWidth_Max','Number_Travel_Lanes','Number_Park_Lanes','TrafDir','NodeLevelF','NodeLevelT'].map(k=>t[k])]);if(lionGroups.has(key))represent(f,lionGroups.get(key),'Identical LION segment geometry and physical attributes; address/name alias rows retained as members.');else lionGroups.set(key,f);}
    const streetName=s=>String(s||'').toUpperCase().replace(/(\d+)(ST|ND|RD|TH)\b/g,'$1').replace(/\bW\b/g,'WEST').replace(/\bE\b/g,'EAST').replace(/\bAVE?\b/g,'AVENUE').replace(/\bST\b/g,'STREET').replace(/\s+/g,' ').trim();
    for(const r of plan.roads.filter(f=>osm(f)&&!f.path&&physicalLevel(f)&&f.tags.name&&f.paths.length)){
      const candidates=[...lionGroups.values()].filter(f=>String(f.tags.FeatureTyp).trim()==='0'&&String(f.tags.Status).trim()==='2'&&['B','R'].includes(f.tags.RB_Layer)&&f.tags.NodeLevelF==='M'&&f.tags.NodeLevelT==='M'&&streetName(f.tags.Street)===streetName(r.tags.name)&&lineCovered(r.paths,[f],3));
      if(candidates.length===1){const f=candidates[0],t=f.tags;r.merge.attributes.lion={source:f.id,value:t};r.merge.evidence.push('LION association: same normalized street name and entire OSM path within 3 m of one constructed street-level segment.');if(r.width.estimated&&Number(t.StreetWidth_Min)>0){r.width={value:Number(t.StreetWidth_Min)*0.3048,estimated:true,source:'Matched LION minimum paved width; constant-width approximation'};r.merge.attributes.width={source:f.id,value:r.width.value,unit:'metres',estimated:true,minimumFeet:t.StreetWidth_Min,maximumFeet:t.StreetWidth_Max};}}
      else if(candidates.length>1)note(r,'Multiple LION segments satisfy the association; OSM width retained and no direction/lanes overwritten.');
    }

    const cityBuildings=plan.buildings.filter(f=>f.sourceId==='nyc-buildings'&&f.shapes.length&&String(f.tags.feature_code)!=='1003');
    const osmBuildings=plan.buildings.filter(f=>osm(f)&&!f.part&&!f.suppressed&&f.shapes.length),matchBuilding=createBuildingMatcher(osmBuildings,cityBuildings,MERGE_PARAMETERS),rejectedBuildings=[];
    pair(osmBuildings,cityBuildings,(a,b)=>{const match=matchBuilding(a,b);if(match.reason)rejectedBuildings.push({a,b,reason:match.reason});return match.evidence;},(a,b,evidence)=>{
      if(plan.buildings.some(p=>p.part&&p.extrude&&overlap(p.shapes,b.shapes)>0.1)){note(b,'NYC building overlaps mapped building parts; retained for review rather than collapsing part geometry.');return;}
      if(!b.extrude&&a.extrude){b.height=structuredClone(a.height);b.extrude=true;b.merge.attributes.height={source:a.id,value:b.height.top,unit:'metres',estimated:b.height.estimated};const c=coverage.get(b.id);if(c){c.status='rendered';c.reason='Height recovered from matched OSM building.';}plan.issues=plan.issues.filter(i=>!(i.id===b.id&&i.code==='missing-height'));}
      else if(b.extrude)b.merge.attributes.height={source:b.id,value:b.height.top,unit:'metres',estimated:false};
      if(!b.extrude){note(b,'Matched footprints have no usable height; original missing-height errors retained.');return;}
      if(a.height.valid&&Math.abs(a.height.top-b.height.top)>Math.max(3,b.height.top*0.2))note(b,`Height conflict: OSM ${a.height.top.toFixed(2)} m, selected NYC ${b.height.top.toFixed(2)} m; alternatives retained.`);
      b.merge.attributes.geometry={source:b.id};b.merge.attributes.osmTags={source:a.id,value:a.tags};represent(a,b,evidence);plan.issues=plan.issues.filter(i=>!(i.id===a.id&&i.code==='missing-height'));
    });
    for(const {a,b,reason} of rejectedBuildings)if(!suppressed.has(a.id)&&!suppressed.has(b.id)){note(a,`${b.id}: ${reason}`,'building-match-review');note(b,`${a.id}: ${reason}`,'building-match-review');}
    const cityTrees=plan.details.filter(f=>f.sourceId==='nyc-trees'), osmTrees=plan.details.filter(f=>osm(f)&&f.rule==='tree');
    pair(osmTrees,cityTrees.filter(f=>f.rule==='tree'),(a,b)=>{const d=dist(a.point,b.point),species=a.tags.species?.toLowerCase(),other=b.tags.genusspecies?.toLowerCase();return d<=MERGE_PARAMETERS.treeDistance&&(!species||!other||other.includes(species))?`Tree points ${d.toFixed(2)} m apart; mutually unique active-tree match.`:null;},(a,b,evidence)=>{a.merge.attributes.forestry={source:b.id,value:b.tags};a.merge.attributes.height={source:a.attributes.height?.estimated?'rule-default':a.id,value:a.dimensions.height,estimated:a.attributes.height?.estimated??true};represent(b,a,evidence);});
    for(const a of osmTrees)for(const b of cityTrees.filter(f=>f.rule!=='tree'))if(dist(a.point,b.point)<=MERGE_PARAMETERS.treeConflictDistance)note(a,`Nearby NYC ${b.tags.tpstructure} record ${b.id}; OSM tree preserved pending dated status evidence.`);
    const roadbeds=plan.details.filter(f=>f.sourceId==='nyc-roadbed'), sidewalks=plan.details.filter(f=>f.sourceId==='nyc-sidewalk');
    const roadMasks=roadbeds.flatMap(f=>f.shapes.map(s=>({outer:s.outer,holes:[]}))), sidewalkMasks=sidewalks.flatMap(f=>f.shapes);
    const roadQuery=createShapeQuery(roadMasks),sidewalkQuery=createShapeQuery(sidewalkMasks);
    for(const road of plan.roads.filter(osm)){
      if(!physicalLevel(road)||road.tags.highway==='steps'){road.merge.evidence.push('Separate/unknown structure level or steps; retained independently.');continue;}
      const masks=road.path?sidewalkMasks:roadMasks;
      if(!masks.length)continue;
      const result=uncoveredPaths(road.paths,masks,road.path?sidewalkQuery:roadQuery);road.sourcePaths=road.paths;road.paths=result.paths;
      // Shape subtraction is performed by the renderer; keep these same masks for the 2D SVG view.
      road.mergeMasks=masks;road.merge.evidence.push(`${result.removed.toFixed(2)} m of centerline represented by NYC ${road.path?'sidewalk':'roadbed'} surfaces; original graph retained.`);road.merge.status=result.removed?'partial':'retained';
      if(!road.paths.length&&!road.shapes.length){suppressed.add(road.id);road.merge.status='represented';const c=coverage.get(road.id);if(c){c.status='represented';c.reason=road.merge.evidence.at(-1);}}
    }
    const curbs=plan.details.filter(f=>f.sourceId==='nyc-curbs');
    // Resolve recorded dimensions before classifications; source ordering cannot choose a height.
    const osmCurbs=plan.details.filter(f=>osm(f)&&f.rule==='kerb').sort((a,b)=>Number(!!a.attributes.height?.estimated)-Number(!!b.attributes.height?.estimated)||a.id.localeCompare(b.id));
    for(const f of osmCurbs)if(physicalLevel(f)&&lineCovered(f.paths,curbs,MERGE_PARAMETERS.curbDistance)){
      const candidates=curbs.filter(c=>lineCovered(f.paths,[c],MERGE_PARAMETERS.curbDistance));
      if(candidates.length!==1){note(f,'Curb alignment spans multiple candidate records; retained for review.');continue;}
      const c=candidates[0],h=f.attributes.height;
      if(h && (!h.estimated || h.source==='OSM classification')){
        if(!lineCovered(c.paths,[f],MERGE_PARAMETERS.curbDistance)){note(f,'Local curb height cannot set an entire longer NYC curb; tagged geometry retained.');continue;}
        if(c.attributes?.height&&!c.attributes.height.estimated&&Math.abs(c.dimensions.height-h.value)>.001){note(f,'Conflicting curb heights; both records retained for review.');continue;}
        if(c.attributes.height?.estimated || !h.estimated){
          c.dimensions.height=h.value;c.attributes.height=structuredClone(h);c.merge.attributes.height={...structuredClone(h),source:f.id};
          c.estimates=(c.estimates||[]).filter(message=>!message.startsWith('Curb height='));
          plan.issues=plan.issues.filter(i=>!(i.id===c.id&&i.code==='estimated-detail'&&i.message.startsWith('Curb height=')));
          if(h.estimated){const message=`Curb height=${h.value} m (${h.reason}; matched ${f.id}).`;c.estimates.push(message);plan.issues.push({id:c.id,dataset:c.dataset,code:'estimated-detail',severity:'info',message});}
        }
      }
      represent(f,c,'Coincident compatible curb segments, every metre checked within 0.35 m.');
    }
    const trees=plan.details.filter(f=>f.rule==='tree'&&!suppressed.has(f.id));for(const f of plan.details.filter(f=>f.rule==='tree-row')){f.excludeTreePoints=trees.map(t=>t.point);f.treeClearance=MERGE_PARAMETERS.treeRowClearance;f.merge.evidence.push('Generated tree-row placeholders excluded within 2 m of individual tree records.');}
  }
  for(const f of all){const r=records.get(f.id);if(!r.evidence.length)r.evidence.push(enabled?'No confirmed duplicate; retained with original geometry and attributes.':'Merge disabled; original source overlay.');const c=coverage.get(f.id);if(c)c.merge=r;}
  const active = Object.fromEntries(['buildings','roads','details'].map(k=>[k,plan[k].filter(f=>!suppressed.has(f.id))]));Object.assign(plan,active);
  plan.merge={enabled,version:MERGE_POLICY_VERSION,parameters:MERGE_PARAMETERS,decisions,suppressed:[...suppressed].sort(),summary:{suppressed:suppressed.size,matched:decisions.filter(r=>r.members.length>1).length,conflicts:decisions.filter(r=>r.conflicts.length).length,partial:decisions.filter(r=>r.status==='partial').length},policies:MERGE_POLICIES.map(r=>r.id)};
  return plan;
}
