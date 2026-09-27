import {vertexData,triangleGroups} from './vertex-data.js';

// Clip triangulated surfaces, so concave polygons and courtyard holes stay intact.
export function boundGeometry(geometry,bounds){
  if(!bounds)return geometry;
  const channels=vertexData(geometry),index=geometry.index,vertices=[],groups=[];
  const clip=(ring,axis,edge,sign)=>{const out=[];for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],da=sign*(a[axis]-edge),db=sign*(b[axis]-edge);if(da>=0)out.push(a);if((da>=0)!==(db>=0)){const t=da/(da-db);out.push(a.map((v,k)=>v+(b[k]-v)*t));}}return out;};
  for(const group of triangleGroups(geometry)){
    const start=vertices.length/channels.stride;
    for(let i=group.start;i<group.start+group.count;i+=3){let ring=[0,1,2].map(j=>channels.read(index?index.getX(i+j):i+j));
      for(const [axis,edge,sign]of[[0,bounds.x0,1],[0,bounds.x1,-1],[2,bounds.z0,1],[2,bounds.z1,-1]])ring=clip(ring,axis,edge,sign);
      for(let j=1;j+1<ring.length;j++)for(const p of[ring[0],ring[j],ring[j+1]])vertices.push(...p);
    }groups.push({start,count:vertices.length/channels.stride-start,materialIndex:group.materialIndex});
  }const result=channels.geometry(vertices,groups);result.computeVertexNormals();geometry.dispose();return result;
}
