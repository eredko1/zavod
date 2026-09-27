import {Vector3} from 'three';
import {triangleGroups} from './vertex-data.js';

const CELL=5,MIN_AREA=.0001,MIN_PROJECTED_AREA=1e-8;
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function intersection(a,b){
  let ring=a;const direction=Math.sign(cross(...b));
  for(let i=0;i<3&&ring.length;i++){
    const out=[],u=b[i],v=b[(i+1)%3];
    for(let k=0;k<ring.length;k++){const p=ring[k],q=ring[(k+1)%ring.length],dp=direction*cross(u,v,p),dq=direction*cross(u,v,q);if(dp>=0)out.push(p);if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);out.push(p.map((n,j)=>n+(q[j]-n)*t));}}ring=out;
  }return ring;
}
const area=ring=>Math.abs(ring.reduce((n,p,i)=>{const q=ring[(i+1)%ring.length];return n+p[0]*q[1]-p[1]*q[0];},0))/2;
function height(tri,p){const [a,b,c]=tri.points,[ya,yb,yc]=tri.heights,d=cross(a,b,c);return ya+(yb-ya)*cross(a,p,c)/d+(yc-ya)*cross(a,b,p)/d;}
// Broad phase uses projected triangle cells. Compare actual heights over the shared
// area; boundary contact and stacked decks are not coincident surfaces.
export function surfaceOverlaps(meshes,tolerance){
  const cells=new Map(),pairs=new Map(),point=new Vector3();let ordinal=0;
  for(const mesh of meshes){
    const p=mesh.geometry.attributes.position,index=mesh.geometry.index,id=mesh.userData.feature.id;
    for(const group of triangleGroups(mesh.geometry))for(let i=group.start;i<group.start+group.count;i+=3){
      const points=[],heights=[];for(let j=0;j<3;j++){point.fromBufferAttribute(p,index?index.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld);points.push([point.x,point.z]);heights.push(point.y);}
      if(!points.flat().concat(heights).every(Number.isFinite)||Math.abs(cross(...points))<MIN_PROJECTED_AREA)continue;
      const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]),tri={id,points,heights,ordinal:ordinal++,x0:Math.min(...xs),x1:Math.max(...xs),z0:Math.min(...zs),z1:Math.max(...zs),y0:Math.min(...heights),y1:Math.max(...heights)},visited=new Set();
      for(let x=Math.floor(tri.x0/CELL);x<=Math.floor(tri.x1/CELL);x++)for(let z=Math.floor(tri.z0/CELL);z<=Math.floor(tri.z1/CELL);z++){
        const key=`${x},${z}`,bucket=cells.get(key)||new Map();
        for(const [otherId,others]of bucket){const pair=[id,otherId].sort().join('|');if(otherId===id||pairs.has(pair))continue;
        for(const other of others){if(visited.has(other.ordinal))continue;visited.add(other.ordinal);
          if(tri.x0>=other.x1||tri.x1<=other.x0||tri.z0>=other.z1||tri.z1<=other.z0||tri.y0>other.y1+tolerance||other.y0>tri.y1+tolerance)continue;
          const ring=intersection(points,other.points);if(ring.length<3||area(ring)<MIN_AREA)continue;
          const differences=ring.map(p=>height(tri,p)-height(other,p));
          if(Math.min(...differences)<=tolerance&&Math.max(...differences)>=-tolerance){pairs.set(pair,{id,other:other.id});break;}
        }}if(!bucket.has(id))bucket.set(id,[]);bucket.get(id).push(tri);cells.set(key,bucket);
      }
    }
  }return [...pairs.values()];
}
