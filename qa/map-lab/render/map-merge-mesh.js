import * as THREE from 'three';
import { vertexData, triangleGroups } from './vertex-data.js';
const cache=new WeakMap(), cell=50;
const bounds=p=>[Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))];
const area=p=>p.reduce((s,v,i)=>{const w=p[(i+1)%p.length];return s+v[0]*w[1]-w[0]*v[1];},0)/2;
function indexOf(shapes){if(cache.has(shapes))return cache.get(shapes);const grid=new Map();for(const s of shapes){const rings=[s.outer,...s.holes], points=rings.flat(), triangles=THREE.ShapeUtils.triangulateShape(s.outer.map(p=>new THREE.Vector2(...p)),s.holes.map(r=>r.map(p=>new THREE.Vector2(...p))));for(const t of triangles){const p=t.map(i=>points[i]);if(area(p)<0)p.reverse();const box=bounds(p), item={p,box};for(let x=Math.floor(box[0]/cell);x<=Math.floor(box[2]/cell);x++)for(let z=Math.floor(box[1]/cell);z<=Math.floor(box[3]/cell);z++){const key=x+','+z;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(item);}}}cache.set(shapes,grid);return grid;}
function half(poly,a,b,inside){const out=[],side=p=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]),keep=d=>inside?d>=-1e-8:d<=1e-8;for(let i=0;i<poly.length;i++){const u=poly[i],v=poly[(i+1)%poly.length],du=side(u),dv=side(v),ku=keep(du),kv=keep(dv);if(ku)out.push(u);if(ku!==kv){const t=du/(du-dv);out.push(u.map((value,k)=>value+(v[k]-value)*t));}}return out;}
function subtract(poly,triangle){let rest=poly;const out=[];for(let i=0;i<3&&rest.length>=3;i++){const a=triangle[i],b=triangle[(i+1)%3],outside=half(rest,a,b,false);if(outside.length>=3&&Math.abs(area(outside))>1e-8)out.push(outside);rest=half(rest,a,b,true);}return out;}
// Exact triangle subtraction keeps polygon holes and uncovered road fragments; no stencil-only hiding.
export function clipSurfaceGeometry(geometry, masks){if(!masks?.length)return geometry;const g=geometry.index?geometry.toNonIndexed():geometry,p=g.attributes.position,grid=indexOf(masks),vertices=[],groups=[],channels=vertexData(g);
  for(const group of triangleGroups(g)){const start=vertices.length/channels.stride;
  for(let i=group.start;i<group.start+group.count;i+=3){const tri=[0,1,2].map(j=>[p.getX(i+j),p.getZ(i+j),...channels.read(i+j)]),box=bounds(tri),candidates=new Set();for(let x=Math.floor(box[0]/cell);x<=Math.floor(box[2]/cell);x++)for(let z=Math.floor(box[1]/cell);z<=Math.floor(box[3]/cell);z++)for(const t of grid.get(x+','+z)||[])if(t.box[2]>=box[0]&&t.box[0]<=box[2]&&t.box[3]>=box[1]&&t.box[1]<=box[3])candidates.add(t);
    let fragments=[tri];for(const t of candidates){fragments=fragments.flatMap(f=>{const b=bounds(f);return b[2]<t.box[0]||b[0]>t.box[2]||b[3]<t.box[1]||b[1]>t.box[3]?[f]:subtract(f,t.p);});if(!fragments.length)break;}
    for(const f of fragments)for(let j=1;j<f.length-1;j++)for(const v of [f[0],f[j],f[j+1]])vertices.push(...v.slice(2));
  }
  groups.push({start,count:vertices.length/channels.stride-start,materialIndex:group.materialIndex});}
  const result=channels.geometry(vertices,groups);if(g!==geometry)g.dispose();geometry.dispose();return result;
}
