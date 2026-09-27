import assert from 'node:assert/strict';
import * as THREE from 'three';
import {clipSolidGeometry} from '../render/solid-clip.js';
import {boundInstances} from '../render/bound-instances.js';
import {placeSurfaceProps} from '../render/prop-placement.js';
const bounds={x0:0,x1:1,z0:-.5,z1:.8};
function verify(g,b){
  const p=g.attributes.position,ix=g.index,triangles=[],unique=new Map(),key=v=>v.map(n=>Math.round(n*1e5)).join(',');let volume=0;
  for(let i=0;i<(ix?.count??p.count);i+=3){
    const tri=[0,1,2].map(j=>{const n=ix?ix.getX(i+j):i+j;return[p.getX(n),p.getY(n),p.getZ(n)];});triangles.push(tri);
    for(const v of tri){unique.set(key(v),v);assert.ok(v[0]>=b.x0-1e-5&&v[0]<=b.x1+1e-5&&v[2]>=b.z0-1e-5&&v[2]<=b.z1+1e-5);}
    const [a,c,d]=tri;volume+=(a[0]*(c[1]*d[2]-c[2]*d[1])+a[1]*(c[2]*d[0]-c[0]*d[2])+a[2]*(c[0]*d[1]-c[1]*d[0]))/6;
  }
  // Earcut may remove collinear boundary vertices. Compare subdivided edges so
  // geometrically closed caps need not share the original triangle tessellation.
  const edges=new Map();for(const tri of triangles)for(let i=0;i<3;i++){
    const a=tri[i],b=tri[(i+1)%3],d=b.map((v,j)=>v-a[j]),length=d.reduce((n,v)=>n+v*v,0);if(length<1e-10)continue;
    const points=[...unique.values()].map(p=>({p,t:p.reduce((n,v,j)=>n+(v-a[j])*d[j],0)/length})).filter(({p,t})=>t>=-1e-6&&t<=1+1e-6&&Math.hypot(...p.map((v,j)=>v-a[j]-t*d[j]))<1e-5).sort((a,b)=>a.t-b.t);
    for(let j=1;j<points.length;j++){const x=key(points[j-1].p),y=key(points[j].p);if(x===y)continue;const k=[x,y].sort().join('/');edges.set(k,(edges.get(k)||0)+1);}
  }
  assert.ok([...edges.values()].every(n=>n===2),'clipped solid has watertight caps');assert.ok(volume>0,'cap faces point outward');return volume;
}
const box=clipSolidGeometry(new THREE.BoxGeometry(4,4,4),bounds);assert.ok(Math.abs(verify(box,bounds)-5.2)<1e-5);box.dispose();
for(const g of [new THREE.CylinderGeometry(2,2,3,8),new THREE.SphereGeometry(2,8,6)]){const result=clipSolidGeometry(g,bounds);verify(result,bounds);result.dispose();}
const shape=new THREE.Shape([new THREE.Vector2(-3,-3),new THREE.Vector2(3,-3),new THREE.Vector2(3,3),new THREE.Vector2(-3,3)]);shape.holes.push(new THREE.Path([new THREE.Vector2(-1,-1),new THREE.Vector2(-1,1),new THREE.Vector2(1,1),new THREE.Vector2(1,-1)]));const g=new THREE.ExtrudeGeometry(shape,{depth:5,bevelEnabled:false});g.rotateX(-Math.PI/2);const courtyard={x0:0,x1:2,z0:-2,z1:2},clipped=clipSolidGeometry(g,courtyard);assert.ok(Math.abs(verify(clipped,courtyard)-30)<1e-4,'courtyard remains empty after side cuts');clipped.dispose();
console.log('PASS watertight building/box/cylinder/sphere caps, corner cuts, normals, volume and courtyard preservation');
// Captured NYC footprint: roof/wall intersections fell on opposite weld-cell
// sides despite differing by less than a micrometre.
const outline=[[525.0767254027305,215.94095969332983],[515.1891171759348,214.25871566746565],[509.06648352638086,213.21706890576326],[509.95985309304285,207.96618306954335],[513.965813430465,208.64775684640267],[525.9700950366591,210.69017390001295]],edgeShape=new THREE.Shape(outline.map(([x,z])=>new THREE.Vector2(x,-z))),edgeGeometry=new THREE.ExtrudeGeometry(edgeShape,{depth:7.65048,bevelEnabled:false});edgeGeometry.rotateX(-Math.PI/2);
const edgeBounds={x0:-1493.4118533997769,x1:510.01380108796883,z0:-342.8883012787761,z1:1655.8031273798524},edge=clipSolidGeometry(edgeGeometry,edgeBounds);assert.ok(edge.attributes.position.count>0);edge.dispose();
const prop={id:'edge-bench',point:[.75,0],rule:'bench',attributes:{placement:{value:.19}}},primitive=new THREE.BoxGeometry(1,1,1);primitive.translate(0,.5,0);
const instance=new THREE.InstancedMesh(primitive,new THREE.MeshBasicMaterial(),1);instance.setMatrixAt(0,new THREE.Matrix4().makeTranslation(.75,.19,0));instance.userData.features=[prop];const group=new THREE.Group();group.add(instance);const world={group,selectable:[instance]};boundInstances(world,bounds);
assert.ok(world.selectable[0].userData.clippedInstance);placeSurfaceProps(group,{active:false},{sample:()=>2.3},[]);const placed=world.selectable[0],position=placed.geometry.attributes.position;let bottom=Infinity;for(let i=0;i<position.count;i++)bottom=Math.min(bottom,position.getY(i)+placed.position.y);assert.ok(Math.abs(bottom-2.3)<1e-6,'clipped prop responds to changed surface height');placed.geometry.dispose();primitive.dispose();instance.material.dispose();
console.log('PASS edge-clipped prop placement follows cached surface visibility changes');
