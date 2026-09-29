import {createShapeQuery} from '../pipeline/shape-query.js';
import {surfaceFragments} from './map-merge-mesh.js';
import {ringArea} from '../pipeline/osm-model.js';

export const TOPOLOGY_RULES=Object.freeze({weld:1e-4,intersectionArea:1e-8,maxTriangles:2000,maxEdgeCandidates:400000,maxFacePairs:100000});
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function intersects(a,b,shared){
  const n=cross(sub(b[1],b[0]),sub(b[2],b[0])),size=Math.hypot(...n),dist=p=>dot(sub(p,b[0]),n)/size,tol=TOPOLOGY_RULES.weld;
  const distances=a.map(dist);
  if(distances.every(d=>Math.abs(d)<=tol)){
    const axis=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs))),project=p=>p.filter((_,i)=>i!==axis),triangle=a.map(project),mask={outer:b.map(project),holes:[]},outside=surfaceFragments(triangle,[mask]).reduce((s,r)=>s+Math.abs(ringArea(r)),0);
    return Math.abs(ringArea(triangle))-outside>TOPOLOGY_RULES.intersectionArea;
  }
  const u=sub(b[1],b[0]),v=sub(b[2],b[0]),uu=dot(u,u),vv=dot(v,v),uv=dot(u,v),den=uu*vv-uv*uv;
  for(let i=0;i<3;i++){const j=(i+1)%3,da=distances[i],db=distances[j];if(da*db>0||Math.abs(da-db)<=tol)continue;const t=da/(da-db);if(t<0||t>1)continue;const p=a[i].map((x,k)=>x+(a[j][k]-x)*t);if(shared.some(q=>Math.hypot(...sub(p,q))<=tol))continue;const w=sub(p,b[0]),wu=dot(w,u),wv=dot(w,v),x=(wu*vv-wv*uv)/den,y=(wv*uu-wu*uv)/den;if(x>tol/Math.sqrt(uu)&&y>tol/Math.sqrt(vv)&&x+y<1-tol/Math.max(Math.sqrt(uu),Math.sqrt(vv)))return true;}
  return false;
}
// Audit measured triangles without repairing them. Collinear T-junctions share subdivided geometric edges.
export function meshTopology(positions){
  if(!positions.length||positions.length%9||!positions.every(Number.isFinite))throw Error('Invalid topology input.');
  const incomplete=reason=>({closed:false,complete:false,triangles:positions.length/9,parameters:TOPOLOGY_RULES,method:'Render solid audit incomplete: '+reason+'. Source triangles retained for display; no caps or native collision inferred.'});
  if(positions.length/9>TOPOLOGY_RULES.maxTriangles)return incomplete('triangle work limit exceeded');
  const tol=TOPOLOGY_RULES.weld,cells=new Map(),vertices=[],faces=[],seen=new Set();let degenerate=0,duplicate=0,volume=0;
  const vertex=p=>{const cell=p.map(v=>Math.floor(v/tol));for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const id of cells.get([cell[0]+x,cell[1]+y,cell[2]+z].join(','))||[])if(Math.hypot(...sub(vertices[id],p))<=tol)return id;const id=vertices.length;vertices.push(p);const key=cell.join(',');if(!cells.has(key))cells.set(key,[]);cells.get(key).push(id);return id;};
  const origin=positions.slice(0,3);
  for(let i=0;i<positions.length;i+=9){const points=[0,1,2].map(j=>positions.slice(i+j*3,i+j*3+3)),ids=points.map(vertex);if(new Set(ids).size<3||Math.hypot(...cross(sub(points[1],points[0]),sub(points[2],points[0])))<=tol*tol){degenerate++;continue;}const key=[...ids].sort((a,b)=>a-b).join(',');if(seen.has(key))duplicate++;seen.add(key);volume+=dot(sub(points[0],origin),cross(sub(points[1],origin),sub(points[2],origin)))/6;faces.push({id:faces.length,ids,points,outer:points.map(p=>[p[0],p[2]]),holes:[],low:Math.min(...points.map(p=>p[1])),high:Math.max(...points.map(p=>p[1]))});}
  const query=createShapeQuery(vertices.map((p,id)=>({outer:[[p[0],p[2]]],holes:[],id}))),edges=new Map(),incident=new Map();
  let edgeCandidates=0;
  for(const face of faces)for(let i=0;i<3;i++){
    const a=face.points[i],b=face.points[(i+1)%3],start=face.ids[i],end=face.ids[(i+1)%3],d=sub(b,a),length=dot(d,d),near=query([Math.min(a[0],b[0])-tol,Math.min(a[2],b[2])-tol,Math.max(a[0],b[0])+tol,Math.max(a[2],b[2])+tol]);edgeCandidates+=near.length;if(edgeCandidates>TOPOLOGY_RULES.maxEdgeCandidates)return incomplete('edge candidate work limit exceeded');const interior=near.map(r=>{const p=vertices[r.id],t=dot(sub(p,a),d)/length;return{id:r.id,t,p};}).filter(r=>r.id!==start&&r.id!==end&&r.t>0&&r.t<1&&Math.hypot(...sub(r.p,a.map((v,k)=>v+r.t*d[k])))<=tol),candidates=[{id:start,t:0},...interior,{id:end,t:1}].sort((a,b)=>a.t-b.t||a.id-b.id);
    for(let j=1;j<candidates.length;j++){const x=candidates[j-1].id,y=candidates[j].id;if(x===y)continue;const key=[Math.min(x,y),Math.max(x,y)].join(',');if(!edges.has(key))edges.set(key,{faces:[],balance:0});const edge=edges.get(key);edge.faces.push(face.id);edge.balance+=x<y?1:-1;for(const id of [x,y]){if(!incident.has(id))incident.set(id,new Set());incident.get(id).add(face.id);}}
  }
  let openEdges=0,nonManifoldEdges=0,orientationConflicts=0,nonManifoldVertices=0;
  const adjacent=new Map(faces.map(f=>[f.id,new Set()]));
  for(const edge of edges.values()){if(edge.faces.length===1)openEdges++;else if(edge.faces.length!==2)nonManifoldEdges++;else{if(edge.balance)orientationConflicts++;adjacent.get(edge.faces[0]).add(edge.faces[1]);adjacent.get(edge.faces[1]).add(edge.faces[0]);}}
  for(const members of incident.values()){const visited=new Set(),queue=[members.values().next().value];while(queue.length){const f=queue.pop();if(visited.has(f))continue;visited.add(f);for(const next of adjacent.get(f))if(members.has(next)&&!visited.has(next))queue.push(next);}if(visited.size!==members.size)nonManifoldVertices++;}
  // Nested shells can be closed and non-intersecting while assigning contradictory interior volumes.
  const components=[],visited=new Set();for(const face of faces){if(visited.has(face.id))continue;const box=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity],queue=[face.id];while(queue.length){const id=queue.pop();if(visited.has(id))continue;visited.add(id);for(const p of faces[id].points)for(let k=0;k<3;k++){box[k]=Math.min(box[k],p[k]);box[k+3]=Math.max(box[k+3],p[k]);}for(const next of adjacent.get(id))if(!visited.has(next))queue.push(next);}components.push(box);}
  let componentBoundsOverlaps=0;for(let i=0;i<components.length;i++)for(let j=i+1;j<components.length;j++)if([0,1,2].every(k=>Math.min(components[i][k+3],components[j][k+3])-Math.max(components[i][k],components[j][k])>tol))componentBoundsOverlaps++;
  let intersections=0,facePairs=0;const faceQuery=createShapeQuery(faces);
  for(const a of faces){const xs=a.outer.map(p=>p[0]),zs=a.outer.map(p=>p[1]);for(const b of faceQuery([Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)])){if(b.id<=a.id||b.low>a.high+tol||b.high<a.low-tol)continue;if(++facePairs>TOPOLOGY_RULES.maxFacePairs)return incomplete('face pair work limit exceeded');const shared=a.ids.filter(id=>b.ids.includes(id)).map(id=>vertices[id]);if(intersects(a.points,b.points,shared)||intersects(b.points,a.points,shared))intersections++;}}
  const closed=faces.length>0&&!degenerate&&!duplicate&&!openEdges&&!nonManifoldEdges&&!orientationConflicts&&!nonManifoldVertices&&!componentBoundsOverlaps&&!intersections&&volume>tol*tol*tol;
  return {closed,complete:true,triangles:positions.length/9,vertices:vertices.length,degenerateFaces:degenerate,duplicateFaces:duplicate,openEdges,nonManifoldEdges,orientationConflicts,nonManifoldVertices,components:components.length,componentBoundsOverlaps,selfIntersections:intersections,signedVolume:volume,parameters:TOPOLOGY_RULES,method:'Geometric edge subdivision, oriented edge/vertex manifold checks and triangle intersection checks; positive volume required. Overlapping component bounds require interior-volume review. No source geometry repaired.'};
}
