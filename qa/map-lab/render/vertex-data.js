import { BufferGeometry, Float32BufferAttribute } from '../../../vendor/three/build/three.module.js';
// Carry static vertex channels through polygon cuts. Normals are recomputed for the resulting planes.
export function vertexData(geometry) {
  const attributes=[['position',geometry.attributes.position],...Object.entries(geometry.attributes).filter(([name])=>!['position','normal'].includes(name))];
  const stride=attributes.reduce((n,[,a])=>n+a.itemSize,0);
  return { stride,
    read(index) { const values=[];for(const [,a]of attributes)for(let k=0;k<a.itemSize;k++)values.push(a.getComponent(index,k));return values; },
    geometry(vertices,groups=[]) {const result=new BufferGeometry();let offset=0;for(const [name,a]of attributes){const values=new Float32Array(vertices.length/stride*a.itemSize);for(let i=0;i<vertices.length/stride;i++)for(let k=0;k<a.itemSize;k++)values[i*a.itemSize+k]=vertices[i*stride+offset+k];result.setAttribute(name,new Float32BufferAttribute(values,a.itemSize));offset+=a.itemSize;}for(const g of groups)result.addGroup(g.start,g.count,g.materialIndex);result.name=geometry.name;result.userData={...geometry.userData};return result;},
  };
}
export function triangleGroups(geometry) {
  const count=geometry.index?.count??geometry.attributes.position.count,start=geometry.drawRange.start,end=Math.min(count,start+geometry.drawRange.count);
  return (geometry.groups.length?geometry.groups:[{start:0,count,materialIndex:0}]).map(g=>({...g,start:Math.max(start,g.start),count:Math.max(0,Math.min(end,g.start+g.count)-Math.max(start,g.start))}));
}
