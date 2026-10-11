import {ShapeUtils,Vector2} from '../../../vendor/three/build/three.module.js';
import {vertexData,triangleGroups} from './vertex-data.js';
import {inRing,ringArea} from '../pipeline/osm-model.js';

const WELD=1e-6;
function hasArea(a,b,c){
  const u=b.slice(0,3).map((v,i)=>v-a[i]),v=c.slice(0,3).map((v,i)=>v-a[i]);
  return Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>WELD*Math.max(Math.hypot(...u),Math.hypot(...v));
}
function appendTriangle(vertices,a,b,c){if(hasArea(a,b,c))vertices.push(...a,...b,...c);}
function capLoops(segments,axis){
  const points=new Map(),edges=new Map(),cells=new Map(),coordinates=p=>axis===0?[p[1],p[2]]:[p[0],p[1]];
  const key=p=>{const q=coordinates(p),x=Math.floor(q[0]/WELD),y=Math.floor(q[1]/WELD);
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const id of cells.get(`${x+dx},${y+dy}`)||[]){const r=coordinates(points.get(id));if(Math.hypot(q[0]-r[0],q[1]-r[1])<=WELD)return id;}
    const id=String(points.size),cell=`${x},${y}`;points.set(id,p);if(!cells.has(cell))cells.set(cell,[]);cells.get(cell).push(id);return id;
  };
  for(const [a,b]of segments){const ka=key(a),kb=key(b);if(ka===kb)continue;const id=[ka,kb].sort().join('/');if(edges.has(id))edges.delete(id);else edges.set(id,[ka,kb]);}
  const adjacent=new Map();for(const [id,[a,b]]of edges)for(const [u,v]of[[a,b],[b,a]]){if(!adjacent.has(u))adjacent.set(u,[]);adjacent.get(u).push({id,to:v});}
  const loops=[];
  while(edges.size){const [first,[start,next]]=edges.entries().next().value;edges.delete(first);const loop=[points.get(start)];let current=next;
    while(current!==start){loop.push(points.get(current));const choices=adjacent.get(current).filter(e=>edges.has(e.id));if(choices.length!==1)throw Error('Solid clipping produced an open or ambiguous cap boundary');const e=choices[0];edges.delete(e.id);current=e.to;}
    if(loop.length>=3)loops.push({vertices:loop,points:loop.map(coordinates),parent:null,depth:0});
  }
  loops.sort((a,b)=>Math.abs(ringArea(b.points))-Math.abs(ringArea(a.points)));
  for(let i=0;i<loops.length;i++)for(let j=i-1;j>=0;j--)if(inRing(...loops[i].points[0],loops[j].points)){loops[i].parent=loops[j];loops[i].depth=loops[j].depth+1;break;}
  return loops;
}

// Cap each plane before the next cut, including corners and courtyard sections.
export function clipSolidGeometry(geometry,bounds){
  if(!bounds)return geometry;
  geometry.computeBoundingBox();const box=geometry.boundingBox;
  if(box.min.x>=bounds.x0&&box.max.x<=bounds.x1&&box.min.z>=bounds.z0&&box.max.z<=bounds.z1)return geometry;
  const channels=vertexData(geometry),stride=channels.stride,index=geometry.index;
  let vertices=[],groups=[];
  for(const group of triangleGroups(geometry)){
    const start=vertices.length/stride;
    for(let i=group.start;i<group.start+group.count;i++)vertices.push(...channels.read(index?index.getX(i):i));
    groups.push({...group,start});
  }
  // Keep intersections in double precision through all four planes. Converting
  // each intermediate cut to Float32 splits shared cap vertices at map distances.
  try{
    for(const [axis,edge,sign]of[[0,bounds.x0,1],[0,bounds.x1,-1],[2,bounds.z0,1],[2,bounds.z1,-1]]){
      let outside=false;for(let i=axis;i<vertices.length;i+=stride)if(sign*(vertices[i]-edge)<-WELD){outside=true;break;}if(!outside)continue;
      const next=[],nextGroups=[],segments=[];
      for(const group of groups){
        const start=next.length/stride;
        for(let i=group.start;i<group.start+group.count;i+=3){
          const tri=[0,1,2].map(j=>{const v=vertices.slice((i+j)*stride,(i+j+1)*stride);if(Math.abs(v[axis]-edge)<WELD)v[axis]=edge;return v;}),ring=[];
          for(let k=0;k<3;k++){const a=tri[k],b=tri[(k+1)%3],da=sign*(a[axis]-edge),db=sign*(b[axis]-edge);if(da>=0)ring.push(a);if((da>=0)!==(db>=0)){const t=da/(da-db),point=a.map((v,j)=>v+(b[j]-v)*t);point[axis]=edge;ring.push(point);}}
          if(ring.length<3||!ring.slice(1,-1).some((v,j)=>hasArea(ring[0],v,ring[j+2])))continue;
          for(let k=0;k<ring.length;k++){const a=ring[k],b=ring[(k+1)%ring.length];if(a[axis]===edge&&b[axis]===edge)segments.push([a,b]);}
          for(let j=1;j+1<ring.length;j++)appendTriangle(next,ring[0],ring[j],ring[j+1]);
        }
        nextGroups.push({start,count:next.length/stride-start,materialIndex:group.materialIndex});
      }
      const start=next.length/stride,loops=capLoops(segments,axis);
      for(const outer of loops.filter(l=>l.depth%2===0)){
        const holes=loops.filter(l=>l.parent===outer&&l.depth%2===1),points=[outer,...holes].flatMap(l=>l.vertices),triangles=ShapeUtils.triangulateShape(outer.points.map(p=>new Vector2(...p)),holes.map(h=>h.points.map(p=>new Vector2(...p))));
        for(const indices of triangles){const tri=indices.map(i=>points[i]),coords=tri.map(v=>axis===0?[v[1],v[2]]:[v[0],v[1]]);if(Math.sign(ringArea(coords))!==-sign)tri.reverse();appendTriangle(next,...tri);}
      }
      nextGroups.push({start,count:next.length/stride-start,materialIndex:0});vertices=next;groups=nextGroups;
    }
    const result=channels.geometry(vertices,groups);result.computeVertexNormals();return result;
  }finally{geometry.dispose();}
}
