import {Vector3,Matrix4} from 'three';
import {objectVisible,surfaceIndex} from './map-surface-index.js';
import {profileHeight,compatibleStructure} from '../pipeline/infrastructure-merge.js';
import {inShape,length,projection} from '../pipeline/osm-model.js';
import {surfaceOverlaps} from './surface-overlap.js';
import {approachHeight,approachSeam} from '../pipeline/road-approaches.js';
import {isGroundLevel,isBridgeLevel} from '../pipeline/physical-level.js';

export const VALIDATION_RULES=Object.freeze({boundsTolerance:.002,heightTolerance:.005,approachTolerance:.25,seamProbeDistance:.1,version:3});
// On-demand diagnostics, outside the frame loop and benchmark. No source or scene mutation.
export function validateGeometry({plan,world,terrain,surfaces:groundSurfaces,selection}) {
  const start=performance.now(),findings=[],seen=new Set(),emitted=new Set(),meshesByHash=new Map(),surfaces=[],duplicates=new Set();let vertices=0,meshes=0,instances=0,profileVertices=0;
  const add=(id,code,message,kind='geometry',severity='error')=>{const key=`${id}/${code}`;if(!seen.has(key)){seen.add(key);findings.push({id,code,message,kind,severity});}};
  const b=plan.bounds,point=new Vector3(),instance=new Matrix4(),transform=new Matrix4();
  const checkPoint=id=>{vertices++;if(![point.x,point.y,point.z].every(Number.isFinite))add(id,'nonfinite-vertex','Generated coordinates are not finite.');else if(point.x<b.x0-VALIDATION_RULES.boundsTolerance||point.x>b.x1+VALIDATION_RULES.boundsTolerance||point.z<b.z0-VALIDATION_RULES.boundsTolerance||point.z>b.z1+VALIDATION_RULES.boundsTolerance)add(id,'outside-area','Generated geometry extends outside the selected area.');};
  world.group.updateMatrixWorld(true);
  for(const mesh of [...world.selectable,world.walkable[0]]){
    if(!objectVisible(mesh))continue;
    if(mesh.isInstancedMesh){const p=mesh.geometry.attributes.position;for(let n=0;n<mesh.count;n++){const f=mesh.userData.features[n];emitted.add(f.id);instances++;mesh.getMatrixAt(n,instance);transform.multiplyMatrices(mesh.matrixWorld,instance);for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i).applyMatrix4(transform);checkPoint(f.id);}}continue;}
    const f=mesh.userData.feature||(mesh===world.walkable[0]?{id:'terrain'}:null),p=mesh.geometry?.attributes.position;if(!f||!p?.count)continue;emitted.add(f.id);meshes++;
    const absolute=Number.isFinite(f.absoluteElevation),profile=f.elevationProfile;
    let hash=2166136261;
    const indices=mesh.geometry.index?new Set(mesh.geometry.index.array):Array.from({length:p.count},(_,i)=>i);
    for(const i of indices){
      point.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);checkPoint(f.id);
      if(![point.x,point.y,point.z].every(Number.isFinite))continue;
      if(mesh.isMesh&&(f.surface||f.width)&&(profile||absolute||f.roadElevation)){
        const expected=(f.roadElevation?approachHeight(f.roadElevation,point.x,point.z,terrain):(profile?profileHeight(profile,point.x,point.z):f.absoluteElevation)-terrain.datum)+(f.surfaceHeight||0);profileVertices++;
        if(Math.abs(point.y-expected)>VALIDATION_RULES.heightTolerance)add(f.id,'elevation-mismatch','Generated surface differs from its resolved elevation rule.');
      }
      for(const v of [point.x,point.y,point.z])hash=Math.imul(hash^Math.round(v/VALIDATION_RULES.heightTolerance),16777619);
    }
    if(mesh.isMesh&&(f.surface||f.width)&&!f.reference)surfaces.push(mesh);
    if(mesh.isMesh&&f.surface){
      const key=`${p.count}/${mesh.geometry.index?.count||0}/${hash>>>0}`,previous=meshesByHash.get(key);
      if(previous&&previous.userData.feature.id!==f.id&&sameGeometry(mesh,previous)){add(f.id,'duplicate-surface',`Exact surface copy of ${previous.userData.feature.id}.`,'geometry','warning');duplicates.add([f.id,previous.userData.feature.id].sort().join('|'));}
      else meshesByHash.set(key,mesh);
    }
  }
  for(const pair of surfaceOverlaps(surfaces,VALIDATION_RULES.heightTolerance))if(!duplicates.has([pair.id,pair.other].sort().join('|')))add(pair.id,`overlapping-surface:${pair.other}`,`Surface intersects or coincides with ${pair.other} over a positive projected area.`,'geometry','warning');
  for(const issue of plan.issues.filter(i=>i.severity!=='info'))add(issue.id,issue.code,issue.message,'data','warning');
  // A posted vehicle limit is not a deck survey, but a deck top below it contradicts the model.
  const project=projection(...plan.origin),decks=plan.details.filter(f=>f.elevationProfile&&f.surface),hidden=new Set(plan.coverage.filter(c=>c.status==='hidden').map(c=>c.id));
  for(const way of selection?.data?.elements||[]){
    const limit=length(way.tags?.maxheight);if(way.type!=='way'||hidden.has(`way/${way.id}`)||!way.tags?.highway||!(limit>0)||!way.geometry||!isGroundLevel(way))continue;
    for(const coordinate of way.geometry){if(!coordinate)continue;const [x,z]=project(coordinate);if(x<b.x0||x>b.x1||z<b.z0||z>b.z1)continue;
      for(const deck of decks)if(deck.shapes.some(s=>inShape(x,z,s))){const clearance=profileHeight(deck.elevationProfile,x,z)-terrain.datum-terrain.sample(x,z);
        if(clearance<limit)add(`way/${way.id}`,'clearance-conflict',`Tagged vehicle limit ${limit.toFixed(2)} m exceeds generated deck-top separation ${clearance.toFixed(2)} m at ${coordinate.lat}, ${coordinate.lon}. Review ground samples and ${deck.id}; deck thickness is also unknown.`,'data','warning');
      }
    }
  }
  const approachChecks=[],checkedJoins=new Set(),approachMeshes=world.selectable.filter(m=>m.isMesh&&!m.isInstancedMesh&&m.userData.feature?.roadElevation),deckMeshes=world.selectable.filter(m=>m.isMesh&&m.userData.feature?.surface&&m.userData.feature?.elevationProfile);
  const approachIndexes=new Map(),deckIndexes=new Map();
  for(const chain of plan.approaches||[])for(const anchor of chain.knots.filter(k=>k.kind==='deck')){
    const seam=approachSeam(chain,anchor);if(!seam)continue;
    const [x,z]=seam.point,[dx,dz]=seam.direction,epsilon=VALIDATION_RULES.seamProbeDistance,inside=[x-dx*epsilon,z-dz*epsilon],outside=[x+dx*epsilon,z+dz*epsilon];
    if([...inside,...outside].some(v=>!Number.isFinite(v))||[inside,outside].some(([x,z])=>x<b.x0||x>b.x1||z<b.z0||z>b.z1))continue;
    // An unrelated overlapping surface must not conceal a missing selected join.
    if(!approachIndexes.has(chain))approachIndexes.set(chain,surfaceIndex(approachMeshes.filter(m=>m.userData.feature.roadElevation.chains.includes(chain)),()=>-Infinity));
    if(!deckIndexes.has(anchor.source))deckIndexes.set(anchor.source,surfaceIndex(deckMeshes.filter(m=>m.userData.feature.id===anchor.source),()=>-Infinity));
    const node=anchor.station===0?chain.nodes[0]:chain.nodes.at(-1),deck=deckIndexes.get(anchor.source).sample(...inside),road=approachIndexes.get(chain).sample(...outside),gap=road-deck,valid=Number.isFinite(gap);
    checkedJoins.add(`${node}/${anchor.source}`);approachChecks.push({chain:chain.id,node,deck:anchor.source,point:seam.point,deckHeight:Number.isFinite(deck)?deck:null,roadHeight:Number.isFinite(road)?road:null,gap:valid?gap:null});
    if(!valid||Math.abs(gap)>VALIDATION_RULES.approachTolerance)add(anchor.source,`approach-discontinuity:${node}`,valid?`Rendered approach ${chain.wayIDs.join(', ')} differs by ${gap.toFixed(2)} m across the deck boundary.`:`No continuous rendered approach/deck surface at shared node ${node}; inspect ${chain.wayIDs.join(', ')}.`,'data','warning');
  }
  const ways=(selection?.data?.elements||[]).filter(w=>w.type==='way'&&!hidden.has(`way/${w.id}`)&&w.tags?.highway&&w.geometry&&w.nodes),connections=new Map();
  for(const way of ways.filter(isGroundLevel))for(const at of [0,way.nodes.length-1]){const node=way.nodes[at];if(!connections.has(node))connections.set(node,[]);connections.get(node).push(way);}
  for(const bridge of ways.filter(isBridgeLevel))for(const at of [0,bridge.nodes.length-1]){
    const coordinate=bridge.geometry[at],joined=connections.get(bridge.nodes[at]),feature=plan.roads.find(f=>f.id===`way/${bridge.id}`);if(!coordinate||!joined?.length||!feature)continue;
    const [x,z]=project(coordinate);if(x<b.x0||x>b.x1||z<b.z0||z>b.z1)continue;
    const supports=decks.filter(d=>compatibleStructure(feature,d)&&d.shapes.some(s=>inShape(x,z,s)));if(supports.length!==1)continue;
    if(checkedJoins.has(`${bridge.nodes[at]}/${supports[0].id}`))continue;
    const deck=supports[0],top=profileHeight(deck.elevationProfile,x,z)-terrain.datum+(deck.surfaceHeight||0),ground=groundSurfaces?.sample(x,z)??terrain.sample(x,z),gap=top-ground;
    if(Math.abs(gap)>VALIDATION_RULES.approachTolerance)add(`way/${bridge.id}`,`approach-discontinuity:${bridge.nodes[at]}`,`Shared node ${bridge.nodes[at]} joins ${joined.map(w=>'way/'+w.id).join(', ')} with a ${gap.toFixed(2)} m generated deck/ground step at ${coordinate.lat}, ${coordinate.lon}. A connected approach profile is unresolved.`,'data','warning');
  }
  const features=new Map([...plan.buildings,...plan.roads,...plan.details].map(f=>[f.id,f])),groups=new Map();
  for(const c of plan.coverage){
    const f=features.get(c.id),type=f?.infrastructure||(f?.height?'building':f?.width?'road/path':f?.rule)||c.rule||'unclassified',source=c.sourceId||'osm-overpass',key=`${source}/${type}`;
    if(!groups.has(key))groups.set(key,{source,type,meshes:0,references:0,missing:0,represented:0,hidden:0,excluded:0,estimated:0});const row=groups.get(key);
    if(['merged','represented'].includes(c.status))row.represented++;
    else if(c.status==='hidden')row.hidden++;
    else if(c.status==='excluded')row.excluded++;
    else if(emitted.has(c.id)){row[f?.reference?'references':'meshes']++;if(f?.estimates?.length||f?.height?.estimated||f?.width?.estimated||f?.elevationProfile||f?.roadElevation)row.estimated++;}
    else row.missing++;
  }
  return {version:VALIDATION_RULES.version,generatedAt:new Date().toISOString(),durationMs:performance.now()-start,bounds:b,checked:{meshes,instances,vertices,profileVertices,approachJoins:approachChecks.length},approachChecks,limits:['Surface intersections inspect drawn triangles; prop-to-prop and building-wall intersections are not checked.','Agreement with a rule does not validate the source survey or an estimated height.'],summary:{geometryErrors:findings.filter(f=>f.kind==='geometry'&&f.severity==='error').length,geometryWarnings:findings.filter(f=>f.kind==='geometry'&&f.severity==='warning').length,dataGaps:findings.filter(f=>f.kind==='data').length},coverage:[...groups.values()].sort((a,b)=>a.source.localeCompare(b.source)||a.type.localeCompare(b.type)),findings};
}
function sameGeometry(a,b){
  const p=a.geometry.attributes.position,q=b.geometry.attributes.position,ai=a.geometry.index,bi=b.geometry.index;if(!!ai!==!!bi)return false;if(ai&&ai.array.some((v,i)=>v!==bi.array[i]))return false;
  if(a.matrixWorld.elements.some((v,i)=>v!==b.matrixWorld.elements[i]))return false;
  return p.array.every((v,i)=>Math.abs(v-q.array[i])<=VALIDATION_RULES.heightTolerance);
}
