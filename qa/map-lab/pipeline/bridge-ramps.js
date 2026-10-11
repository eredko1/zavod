import {isBridgeLevel} from './physical-level.js';
import {pathPosition} from './geometry-distance.js';
import {BRIDGE_LEVEL_RULES,bridgeSamplePairs} from './bridge-levels.js';

const RAMP_RULES=Object.freeze({nodeHeightTolerance:.01,pointTolerance:.01,observationDistance:3,associationSeparation:.25,maxGrade:BRIDGE_LEVEL_RULES.maxGrade});
// Exact shared OSM nodes constrain connecting grades, including ramps whose layer changes at a junction.
export function resolveBridgeRamps(plan,heightAt,{note}){
  const roads=plan.roads.filter(r=>!r.elevationAmbiguous&&isBridgeLevel(r)&&r.nodes&&r.paths.length===1&&!r.path).sort((a,b)=>a.id.localeCompare(b.id)),adjacent=new Map(),anchors=new Map(),resolved=[];
  for(const road of roads){
    if(road.elevationProfile){const original=road.sourcePaths?.[0]||road.paths[0];for(const at of [0,road.nodes.length-1]){const p=original[at];if(!p||pathPosition(road.paths[0],p).distance>RAMP_RULES.pointTolerance)continue;const node=road.nodes[at];if(!anchors.has(node))anchors.set(node,[]);anchors.get(node).push({id:road.id,point:p,value:heightAt(road.elevationProfile,...p)});}}
    else for(const node of [road.nodes[0],road.nodes.at(-1)]){if(!adjacent.has(node))adjacent.set(node,[]);adjacent.get(node).push(road);}
  }
  const anchor=node=>{const list=anchors.get(node);return list?.length&&Math.max(...list.map(a=>a.value))-Math.min(...list.map(a=>a.value))<=RAMP_RULES.nodeHeightTolerance?list[0]:null;},visited=new Set();
  for(const [start,edges]of adjacent){const a=anchor(start);if(!a)continue;
    for(const first of edges){if(visited.has(first.id))continue;let current=start,road=first,end=null;const members=[],points=[];
      for(;;){visited.add(road.id);members.push(road);const forward=road.nodes[0]===current,path=forward?road.paths[0]:[...road.paths[0]].reverse();points.push(...(points.length?path.slice(1):path));current=road.nodes[forward?road.nodes.length-1:0];end=anchor(current);if(end)break;const next=(adjacent.get(current)||[]).filter(r=>r!==road);if(next.length!==1||visited.has(next[0].id))break;road=next[0];}
      if(!end)continue;const length=pathPosition(points,points.at(-1)).station;if(!length||Math.abs(a.value-end.value)/length>RAMP_RULES.maxGrade){for(const r of members)note(r,'Connected bridge endpoint heights imply an unsupported ramp grade; original paths retained.','ramp-grade-conflict');continue;}
      const samples=[];
      for(const f of plan.details.filter(f=>f.sourceId==='nyc-elevation'&&['300000','300020'].includes(String(f.tags.sub_code))&&Number.isFinite(f.elevation))){const at=pathPosition(points,f.point);if(at.distance>RAMP_RULES.observationDistance||at.station<=RAMP_RULES.pointTolerance||at.station>=length-RAMP_RULES.pointTolerance)continue;
        if(plan.roads.some(r=>!members.includes(r)&&pathPosition((r.sourcePaths||r.paths)?.[0]||[],f.point).distance<=at.distance+RAMP_RULES.associationSeparation))continue;
        samples.push({id:f.id,x:f.point[0],z:f.point[1],value:f.elevation,station:at.station});
      }
      const observations=[{station:0,value:a.value,source:a.id},...samples.map(s=>({station:s.station,value:s.value,source:s.id})),{station:length,value:end.value,source:end.id}].sort((a,b)=>a.station-b.station||a.source.localeCompare(b.source)),knots=[];
      for(const observation of observations){const previous=knots.at(-1);if(previous&&observation.station-previous.station<=RAMP_RULES.pointTolerance&&Math.abs(observation.value-previous.value)<=RAMP_RULES.nodeHeightTolerance){previous.observations??=[{...previous}];previous.observations.push(observation);}else knots.push(observation);}
      if(bridgeSamplePairs(samples).length||knots.slice(1).some((k,i)=>{const previous=knots[i],gap=k.station-previous.station;return gap<=RAMP_RULES.pointTolerance||Math.abs(k.value-previous.value)/gap>RAMP_RULES.maxGrade;})){for(const r of members)note(r,'Measured ramp observations conflict with one continuous grade; no connecting surface selected.','ramp-observation-conflict');continue;}
      const profile={kind:'longitudinal',path:points,knots,samples:[{id:a.id,x:a.point[0],z:a.point[1],value:a.value},...samples,{id:end.id,x:end.point[0],z:end.point[1],value:end.value}],parameters:RAMP_RULES,method:'Connected bridge ramp across exact shared OSM nodes; measured endpoint heights and uniquely associated road observations, piecewise linear estimated connecting grade'};
      for(const road of members)resolved.push({road,profile,anchors:[a.id,end.id]});
    }
  }return resolved;
}
