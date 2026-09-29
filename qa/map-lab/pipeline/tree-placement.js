import {inShape} from './osm-model.js';
import {pointBounds} from './shape-query.js';
import {edgeDistance as segmentDistance} from './geometry-distance.js';
import {isGroundLevel} from './physical-level.js';

// A visual conflict rule, not a claim that the mapped tree never existed.
export const TREE_PLACEMENT_RULES=Object.freeze({edgeClearance:.35,rowClearance:2});
const ground=f=>!f.reference&&f.groundSurface!==false&&!f.elevationProfile&&f.absoluteElevation===undefined&&isGroundLevel(f);
const distance=(p,a,b)=>segmentDistance(...p,a,b);
const edgeDistance=(p,s)=>Math.min(...[s.outer,...s.holes].map(r=>r.reduce((d,a,i)=>Math.min(d,distance(p,a,r[(i+1)%r.length])),Infinity)));
const planted=f=>f.sourceId==='nyc-median'&&String(f.tags.sub_code)==='360050'||f.surface&&(f.tags?.['area:highway']==='traffic_island'||f.tags?.traffic_calming==='island')&&['grass','flowerbed'].includes(f.tags?.landuse);

export function createTreeSurfaceQuery(plan){
  const areas=[],islands=plan.details.filter(f=>ground(f)&&planted(f)).flatMap(f=>f.shapes||[]),margin=TREE_PLACEMENT_RULES.edgeClearance;
  for(const f of [...plan.details,...plan.roads].sort((a,b)=>a.id.localeCompare(b.id))){
    if(!ground(f))continue;
    const eligible=f.width||['nyc-roadbed','nyc-sidewalk','nyc-boardwalk'].includes(f.sourceId)||f.surface&&['footway','path','pedestrian','cycleway'].includes(f.tags?.highway);
    if(!eligible)continue;
    for(const shape of f.shapes||[])areas.push({f,shape,box:pointBounds(shape.outer)});
    for(const path of f.paths||[])for(let i=1;i<path.length;i++)if(f.width?.value>margin*2){const a=path[i-1],b=path[i],r=f.width.value/2,box=pointBounds([a,b]);areas.push({f,a,b,r,box:[box[0]-r,box[1]-r,box[2]+r,box[3]+r]});}
  }
  return point=>{
    if(islands.some(s=>inShape(...point,s)))return null;
    for(const a of areas){const [x,z]=point,b=a.box;if(x<b[0]||x>b[2]||z<b[1]||z>b[3])continue;
      if(a.f.mergeMasks?.some(s=>inShape(x,z,s)))continue;
      if(a.shape?inShape(x,z,a.shape)&&edgeDistance(point,a.shape)>margin:distance(point,a.a,a.b)<a.r-margin)return a.f;
    }return null;
  };
}

export function treeRowPoints(f){
  if(!(f.dimensions.spacing>0&&Number.isFinite(f.dimensions.spacing)))throw Error(`Invalid tree-row spacing: ${f.id}`);
  const points=[];
  for(const line of f.paths){let next=0;for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!length)continue;for(;next<length;next+=f.dimensions.spacing)points.push([a[0]+(b[0]-a[0])*next/length,a[1]+(b[1]-a[1])*next/length]);next-=length;}}
  return points;
}

export function resolveTreePlacements(plan,suppressed,surfaceAt){
  const excluded=[],trees=plan.details.filter(f=>f.rule==='tree'&&!suppressed.has(f.id));
  for(const f of trees){if(!ground(f))continue;const surface=surfaceAt(f.point);if(surface)excluded.push({id:f.id,surface:surface.id,point:f.point,reason:'Tree centre lies inside a ground road/walkway beyond the edge clearance.'});}
  const blocked=new Set(excluded.map(e=>e.id)),points=trees.filter(f=>ground(f)&&!blocked.has(f.id)).map(f=>({point:f.point,id:f.id}));
  for(const row of plan.details.filter(f=>f.rule==='tree-row').sort((a,b)=>a.id.localeCompare(b.id))){
    if(!ground(row))continue;
    const kept=[],removed=[];
    for(const [index,point]of treeRowPoints(row).entries()){
      const surface=ground(row)?surfaceAt(point):null,duplicate=points.find(p=>Math.hypot(point[0]-p.point[0],point[1]-p.point[1])<TREE_PLACEMENT_RULES.rowClearance);
      if(surface||duplicate)removed.push({index,point,...surface?{surface:surface.id}:{representedBy:duplicate.id}});
      else{kept.push(point);points.push({point,id:`${row.id}#${index}`});}
    }
    row.treePoints=kept;row.render.attributes.treePlacement={rule:TREE_PLACEMENT_RULES,generated:kept.length+removed.length,kept:kept.length,excluded:removed};
    if(removed.length){row.render.evidence.push(`Excluded ${removed.length} generated trees on roads/walkways or near retained individual/row trees.`);plan.issues.push({id:row.id,code:'tree-row-placement',severity:'info',message:row.render.evidence.at(-1)});}
  }
  return excluded;
}
