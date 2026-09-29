import {segmentCuts} from './segment-cuts.js';
import {inShape} from './osm-model.js';
import {compatibleStructure,profileHeight,STRUCTURE_RULES} from './infrastructure-merge.js';
import {GROUND_LEVEL_RULES} from './ground-levels.js';
import {createShapeQuery,pointBounds} from './shape-query.js';
import {isGroundLevel,isBridgeLevel} from './physical-level.js';
import {pathPosition} from './geometry-distance.js';
export {pathPosition} from './geometry-distance.js';

export const APPROACH_RULES=Object.freeze({stationTolerance:.01,pointTolerance:1e-6});
const ground=r=>isGroundLevel(r)&&r.tags.highway!=='steps';
const inside=(point,feature)=>feature.shapes.some(s=>inShape(...point,s));
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function coveredIntervals(points,feature){
  const intervals=[];let station=0;
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=distance(a,b),cuts=segmentCuts(a,b,feature.shapes);for(let k=1;k<cuts.length;k++){const t=(cuts[k-1]+cuts[k])/2;if(inside([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],feature))intervals.push([station+length*cuts[k-1],station+length*cuts[k]]);}station+=length;}return intervals;
}
const deckAnchor=(deck,point,station)=>({kind:'deck',point,station,source:deck.id,profile:deck.elevationProfile,shapes:deck.shapes});

// Follow actual shared node IDs across way splits. A branch ends the approach at
// a common terrain anchor; adjacent branches therefore keep their existing join.
export function resolveRoadApproaches(plan,{note}){
  const network=[...(plan.roadNetwork||[])].sort((a,b)=>a.id.localeCompare(b.id)),roadByID=new Map(plan.roads.map(r=>[r.id,r])),decks=plan.details.filter(f=>f.sourceId==='nyc-transport'&&f.elevationProfile),ends=new Map(),adjacent=new Map(),edges=[];
  const diagnosticByID=new Map([...network,...plan.roads].map(r=>[r.id,r]));
  for(const r of network){
    if(isBridgeLevel(r))for(const at of [0,r.nodes.length-1]){const matches=decks.filter(d=>compatibleStructure(r,d)&&inside(r.points[at],d));if(matches.length!==1)continue;const node=r.nodes[at];if(!ends.has(node))ends.set(node,[]);ends.get(node).push({deck:matches[0],road:r});}
    if(!ground(r))continue;
    for(let i=1;i<r.nodes.length;i++){if(distance(r.points[i-1],r.points[i])<APPROACH_RULES.pointTolerance)continue;const edge={id:edges.length,road:r,a:r.nodes[i-1],b:r.nodes[i],points:[r.points[i-1],r.points[i]]};edges.push(edge);for(const node of [edge.a,edge.b]){if(!adjacent.has(node))adjacent.set(node,[]);adjacent.get(node).push(edge);}}
  }
  const visited=new Set(),chains=[];
  for(const [node,connections]of [...ends].sort(([a],[b])=>a-b)){
    const owners=[...new Set(connections.map(c=>c.deck))];if(owners.length!==1)continue;const deck=owners[0];
    for(const first of adjacent.get(node)||[]){
      if(visited.has(first.id)||!compatibleStructure(first.road,deck))continue;
      const points=[],nodes=[node],wayIDs=new Set();let current=node,edge=first,length=0,endDeck=null;
      for(;;){
        visited.add(edge.id);wayIDs.add(edge.road.id);const forward=current===edge.a,next=forward?edge.b:edge.a,a=edge.points[forward?0:1],b=edge.points[forward?1:0];if(!points.length)points.push(a);points.push(b);nodes.push(next);length+=distance(a,b);current=next;
        const atEnd=[...new Set((ends.get(current)||[]).map(c=>c.deck).filter(d=>compatibleStructure(first.road,d)))];if(atEnd.length){if(atEnd.length===1)endDeck=atEnd[0];break;}
        const onward=(adjacent.get(current)||[]).filter(e=>e.id!==edge.id&&e.road.path===first.road.path);if(onward.length!==1||visited.has(onward[0].id))break;edge=onward[0];
      }
      if(length<=APPROACH_RULES.stationTolerance)continue;
      const start=deckAnchor(deck,points[0],0),end=endDeck?deckAnchor(endDeck,points.at(-1),length):{kind:'terrain',point:points.at(-1),station:length,source:'Estimated terrain at connected network endpoint'};
      chains.push({id:`approach/${node}/${nodes.at(-1)}`,nodes,points,wayIDs:[...wayIDs].sort(),length,knots:[start,end]});
    }
  }
  const excluded=new Set((plan.groundSampleDecisions||[]).map(d=>d.id)),samples=plan.details.filter(f=>f.sourceId==='nyc-elevation'&&String(f.tags.sub_code)==='300000'&&Number.isFinite(f.elevation)&&!excluded.has(f.id)),roadbeds=plan.details.filter(f=>f.sourceId==='nyc-roadbed'),providers=new Map(),coverage=new Map();
  const shapeOwners=new Map(roadbeds.flatMap(f=>f.shapes.map(s=>[s,f]))),queryRoadbeds=createShapeQuery([...shapeOwners.keys()]);
  const covered=road=>{if(!coverage.has(road)){const candidates=new Set(queryRoadbeds(pointBounds(road.points)).map(s=>shapeOwners.get(s)));coverage.set(road,[...candidates].map(feature=>({feature,intervals:coveredIntervals(road.points,feature)})).filter(c=>c.intervals.length));}return coverage.get(road);};
  for(const chain of chains){
    for(const sample of samples){const at=pathPosition(chain.points,sample.point);if(at.distance>GROUND_LEVEL_RULES.centerlineDistance||at.station<=APPROACH_RULES.stationTolerance||at.station>=chain.length-APPROACH_RULES.stationTolerance||decks.some(d=>inside(sample.point,d)))continue;
      // Nearby parallel carriageways are not interchangeable observations.
      if(network.some(r=>ground(r)&&!chain.wayIDs.includes(r.id)&&pathPosition(r.points,sample.point).distance<=at.distance+GROUND_LEVEL_RULES.separation))continue;
      chain.knots.push({kind:'sample',point:at.point,observedPoint:sample.point,station:at.station,value:sample.elevation,source:sample.id});
    }
    chain.knots.sort((a,b)=>a.station-b.station||a.source.localeCompare(b.source));
    const conflicts=new Set();for(let i=0;i<chain.knots.length;){let end=i+1;while(end<chain.knots.length&&chain.knots[end].station-chain.knots[end-1].station<=APPROACH_RULES.stationTolerance)end++;const group=chain.knots.slice(i,end).filter(k=>k.kind==='sample');if(group.length>1&&Math.max(...group.map(k=>k.value))-Math.min(...group.map(k=>k.value))>STRUCTURE_RULES.conflictTolerance)for(const k of group)conflicts.add(k);i=end;}
    if(conflicts.size){for(const id of chain.wayIDs)note(diagnosticByID.get(id),'Conflicting projected approach observations; those stations are excluded and raw readings retained.','approach-sample-conflict');chain.knots=chain.knots.filter(k=>!conflicts.has(k));}
    for(const id of chain.wayIDs){
      const road=network.find(r=>r.id===id),matches=covered(road),ambiguous=new Set();
      for(let i=0;i<matches.length;i++)for(let j=i+1;j<matches.length;j++)if(matches[i].intervals.some(a=>matches[j].intervals.some(b=>Math.min(a[1],b[1])-Math.max(a[0],b[0])>APPROACH_RULES.stationTolerance))){ambiguous.add(matches[i]);ambiguous.add(matches[j]);}
      for(const match of matches)if(!ambiguous.has(match)){const f=match.feature;if(!providers.has(f))providers.set(f,new Set());providers.get(f).add(chain);}
      if(ambiguous.size)note(diagnosticByID.get(id),'Multiple roadbed polygons cover the same approach interval; ambiguous roadbeds retain terrain elevation.','ambiguous-approach-roadbed');
      // Uncovered OSM ribbons use the same connected profile as the measured outline.
      const f=roadByID.get(id);if(f){f.roadElevation??={chains:[],owners:[]};f.roadElevation.chains.push(chain);f.roadElevation.owners.push(road);f.surfaceHeight=STRUCTURE_RULES.deckOffset;f.groundSurface=true;f.mergeMasks=[...(f.mergeMasks||[]),...chain.knots.filter(k=>k.kind==='deck').flatMap(k=>k.shapes)];}
    }
  }
  for(const [feature,assigned]of providers){
    feature.roadElevation={chains:[...assigned],owners:network.filter(r=>ground(r)&&covered(r).some(c=>c.feature===feature))};feature.groundSurface=true;
    const usedDecks=new Set([...assigned].flatMap(c=>c.knots.filter(k=>k.kind==='deck').map(k=>k.source)));feature.mergeMasks=decks.filter(d=>usedDecks.has(d.id)).flatMap(d=>d.shapes);
  }
  for(const f of [...plan.roads,...providers.keys()].filter(f=>f.roadElevation)){
    f.render.attributes.roadElevation={estimated:true,method:'Connected approach interpolation; measured spots and shared deck constraints, estimated terrain at network endpoints',parameters:APPROACH_RULES,chains:f.roadElevation.chains};
    f.render.evidence.push('Connected approach profile retained across OSM way splits; original footprint unchanged. Covered deck area is represented by its structure surface.');
    plan.issues.push({id:f.id,code:'estimated-road-approach',severity:'info',message:'Connected road grade uses measured spot heights where uniquely associated, deck endpoint constraints and estimated terrain at network endpoints. Crossfall and the connecting grade remain estimates.'});
  }
  plan.approaches=chains;
}

function distanceToShapes(point,shapes){
  let nearest=Infinity;for(const s of shapes){if(inShape(...point,s))return 0;for(const ring of [s.outer,...s.holes])nearest=Math.min(nearest,pathPosition([...ring,ring[0]],point).distance);}return nearest;
}
// Full deck-edge constraints avoid a lateral seam when a surveyed abutment is
// skewed to the centreline. Ground interpolation stays unchanged underneath.
export function approachHeight(field,x,z,terrain){
  const point=[x,z];let owner=null,closest=Infinity;
  for(const road of field.owners){const d=pathPosition(road.points,point).distance;if(d<closest){closest=d;owner=road.id;}}
  let chain=null,at=null;for(const candidate of field.chains.filter(c=>c.wayIDs.includes(owner))){const p=pathPosition(candidate.points,point);if(!at||p.distance<at.distance){chain=candidate;at=p;}}
  if(!chain)return terrain.sample(x,z);
  let index=1;while(index<chain.knots.length-1&&chain.knots[index].station<at.station)index++;const a=chain.knots[index-1],b=chain.knots[index];
  const da=a.kind==='deck'?distanceToShapes(point,a.shapes):Math.max(0,at.station-a.station),db=b.kind==='deck'?distanceToShapes(point,b.shapes):Math.max(0,b.station-at.station),u=da+db>APPROACH_RULES.pointTolerance?da/(da+db):0;
  const crossfall=terrain.sample(x,z)-terrain.sample(...at.point),height=k=>k.kind==='deck'?profileHeight(k.profile,x,z)-terrain.datum:k.kind==='sample'?k.value-terrain.datum+crossfall-(terrain.sample(...k.observedPoint)-terrain.sample(...k.point)):terrain.sample(x,z);
  return height(a)*(1-u)+height(b)*u;
}

export function approachSeam(chain,anchor){
  const points=anchor.station===0?chain.points:[...chain.points].reverse();
  let entered=points.length>0&&distanceToShapes(points[0],anchor.shapes)<=APPROACH_RULES.pointTolerance;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),cuts=segmentCuts(a,b,anchor.shapes);if(!length)continue;
    for(let k=1;k<cuts.length;k++){const middle=(cuts[k-1]+cuts[k])/2,p=[a[0]+dx*middle,a[1]+dz*middle];if(anchor.shapes.some(s=>inShape(...p,s)))entered=true;else if(entered)return {point:[a[0]+dx*cuts[k-1],a[1]+dz*cuts[k-1]],direction:[dx/length,dz/length]};}
  }return null;
}
