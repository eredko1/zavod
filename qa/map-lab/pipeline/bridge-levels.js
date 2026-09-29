import {pathPosition} from './geometry-distance.js';
import {inShape} from './osm-model.js';
import {isBridgeLevel} from './physical-level.js';

export const BRIDGE_LEVEL_RULES=Object.freeze({pairDistance:5,minVerticalSeparation:3,minPairs:3,maxLateralDistance:35,maxStationGap:125,maxGrade:.15,stationTolerance:.01});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function bridgeSamplePairs(samples){
  const candidates=samples.map(a=>({a,near:samples.filter(b=>b!==a&&distance(a,b)<=BRIDGE_LEVEL_RULES.pairDistance&&Math.abs(a.value-b.value)>=BRIDGE_LEVEL_RULES.minVerticalSeparation)})),pairs=[];
  for(const {a,near}of candidates)if(near.length===1){const b=near[0];if(a.id.localeCompare(b.id)>=0||candidates.find(c=>c.a===b).near.length!==1)continue;const ordered=[a,b].sort((a,b)=>a.value-b.value);pairs.push({lower:ordered[0],upper:ordered[1],point:[(a.x+b.x)/2,(a.z+b.z)/2]});}
  return pairs;
}
export function connectedBridgePath(group,road){
  if(!road.nodes)return road.paths[0];let path=[...road.paths[0]],seen=new Set([road.id]);
  for(const start of [true,false]){let node=road.nodes[start?0:road.nodes.length-1];for(;;){const next=group.filter(r=>!seen.has(r.id)&&r.nodes&&(r.nodes[0]===node||r.nodes.at(-1)===node));if(next.length!==1)break;const r=next[0],forward=r.nodes[0]===node,points=forward?r.paths[0]:[...r.paths[0]].reverse();seen.add(r.id);node=r.nodes[forward?r.nodes.length-1:0];path=start?[...points.slice(1).reverse(),...path]:[...path,...points.slice(1)];}}
  return path;
}
function slicePath(points,lo,hi){
  const kept=[],remainder=[];let station=0;
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!length)continue;const end=station+length,at=s=>a.map((v,k)=>v+(b[k]-v)*(s-station)/length);
    const start=Math.max(station,lo),stop=Math.min(end,hi);if(stop>start){if(!kept.length)kept.push(at(start));kept.push(at(stop));}
    if(station<lo)remainder.push([a,at(Math.min(end,lo))]);if(end>hi)remainder.push([at(Math.max(station,hi)),b]);station=end;
  }return {paths:kept.length>=2?[kept]:[],remainder};
}
export function resolveBridgeLevels(structure,samples,roads){
  const pairs=bridgeSamplePairs(samples),mixed=samples.some((a,i)=>samples.slice(i+1).some(b=>distance(a,b)<=BRIDGE_LEVEL_RULES.pairDistance&&Math.abs(a.value-b.value)>=BRIDGE_LEVEL_RULES.minVerticalSeparation));if(!mixed)return {mixed:false,resolved:[]};
  const candidates=roads.filter(r=>isBridgeLevel(r)&&r.width&&!r.path&&r.paths.length===1&&r.paths[0].some(p=>structure.shapes.some(s=>inShape(...p,s)))),groups=new Map(),resolved=[];
  for(const road of candidates){const identity=road.tags.wikidata||road.tags['bridge:ref']||road.tags.name,layer=Number(road.tags.layer);if(!identity||!Number.isFinite(layer))continue;if(!groups.has(identity))groups.set(identity,[]);groups.get(identity).push(road);}
  if(pairs.length<BRIDGE_LEVEL_RULES.minPairs)return {mixed:true,pairs,resolved};
  for(const group of groups.values()){
    const layers=[...new Set(group.map(r=>Number(r.tags.layer)))].sort((a,b)=>a-b);if(layers.length!==2)continue;
    for(const road of group){
      const sourcePath=road.paths[0],path=connectedBridgePath(group.filter(r=>Number(r.tags.layer)===Number(road.tags.layer)),road),role=Number(road.tags.layer)===layers[0]?'lower':'upper',knots=[];
      for(const pair of pairs){const at=pathPosition(path,pair.point);if(at.distance>BRIDGE_LEVEL_RULES.maxLateralDistance||at.t===0&&at.index===0||at.t===1&&at.index===path.length-2)continue;const sample=pair[role];knots.push({station:at.station,value:sample.value,source:sample.id,pair:[pair.lower.id,pair.upper.id]});}
      knots.sort((a,b)=>a.station-b.station||a.source.localeCompare(b.source));
      if(knots.length<BRIDGE_LEVEL_RULES.minPairs)continue;
      // No extrapolation or smoothing across unobserved spans, conflicting stations or steep cross-level jumps.
      const runs=[];let run=[];for(const knot of knots){const previous=run.at(-1),gap=previous?knot.station-previous.station:null;if(previous&&(gap<=BRIDGE_LEVEL_RULES.stationTolerance||gap>BRIDGE_LEVEL_RULES.maxStationGap||Math.abs(knot.value-previous.value)/gap>BRIDGE_LEVEL_RULES.maxGrade)){if(run.length>=BRIDGE_LEVEL_RULES.minPairs)runs.push(run);run=[];}run.push(knot);}if(run.length>=BRIDGE_LEVEL_RULES.minPairs)runs.push(run);
      if(runs.length!==1)continue;const selected=runs[0],offset=pathPosition(path,sourcePath[0]).station,interval=slicePath(sourcePath,selected[0].station-offset,selected.at(-1).station-offset);if(!interval.paths.length)continue;
      resolved.push({road,paths:interval.paths,unresolvedPaths:interval.remainder,profile:{kind:'longitudinal',path,knots:selected,samples:selected.map(k=>samples.find(s=>s.id===k.source)),method:'Piecewise linear longitudinal grade from paired measured bridge levels; OSM layer orders the measured levels, never supplies metres',role,relativeLayer:Number(road.tags.layer),parameters:BRIDGE_LEVEL_RULES}});
    }
  }return {mixed:true,pairs,resolved};
}
export function longitudinalHeight(profile,x,z){
  const station=pathPosition(profile.path,[x,z]).station,knots=profile.knots;if(station<=knots[0].station)return knots[0].value;if(station>=knots.at(-1).station)return knots.at(-1).value;
  let lo=0,hi=knots.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(knots[mid].station<=station)lo=mid;else hi=mid;}const a=knots[lo],b=knots[hi],t=(station-a.station)/(b.station-a.station);return a.value+(b.value-a.value)*t;
}
