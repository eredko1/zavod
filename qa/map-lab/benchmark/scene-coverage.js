import * as THREE from 'three';
import { objectVisible } from '../render/map-surface-index.js';

const PRECISION=1000,rounded=value=>Math.round(value*PRECISION)/PRECISION;
// Drawn bounds and physical measures survive batching and equivalent triangulation.
// This is coverage, not proof that two meshes have identical topology.
export function sceneCoverage(group) {
  const records=new Map(),matrix=new THREE.Matrix4(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3();
  group.updateMatrixWorld(true);
  group.traverse(object=>{
    const geometry=object.geometry,p=geometry?.attributes.position;if(!p?.count||!objectVisible(object))return;
    const count=geometry.index?.count??p.count,start=geometry.drawRange.start,end=Math.min(count,start+geometry.drawRange.count);
    const groups=Array.isArray(object.material)?geometry.groups:[{start:0,count,materialIndex:0}],materials=Array.isArray(object.material)?object.material:[object.material];
    const ranges=groups.filter(g=>materials[g.materialIndex]?.visible&&materials[g.materialIndex].opacity!==0).map(g=>[Math.max(start,g.start),Math.min(end,g.start+g.count)]);
    const features=object.userData.features||(object.userData.feature?[object.userData.feature]:[]);
    for(let instance=0;instance<Math.min(features.length,object.isInstancedMesh?object.count:1);instance++){
      if(object.isInstancedMesh){object.getMatrixAt(instance,matrix);matrix.premultiply(object.matrixWorld);}else matrix.copy(object.matrixWorld);
      const box=new THREE.Box3();let surfaceArea=0,lineLength=0,points=0;
      const read=(i,target)=>target.fromBufferAttribute(p,geometry.index?geometry.index.getX(i):i).applyMatrix4(matrix);
      for(const [lo,hi]of ranges){
        if(object.isLine&&hi-lo<2)continue;
        const stride=object.isMesh?3:object.isLineSegments?2:1;
        for(let i=lo;i+stride<=hi;i+=stride){
          read(i,a);box.expandByPoint(a);
          if(object.isMesh){read(i+1,b);read(i+2,c);box.expandByPoint(b);box.expandByPoint(c);surfaceArea+=ab.subVectors(b,a).cross(ac.subVectors(c,a)).length()/2;}
          else if(object.isLineSegments||object.isLine&&i+1<hi){read(i+1,b);box.expandByPoint(b);lineLength+=a.distanceTo(b);}
          else if(object.isPoints)points++;
        }
        if(object.isLineLoop){read(hi-1,a);read(lo,b);lineLength+=a.distanceTo(b);}
      }
      if(box.isEmpty())continue;
      const id=features[instance].id;if(!records.has(id))records.set(id,{box:new THREE.Box3(),surfaceArea:0,lineLength:0,points:0});
      const record=records.get(id);record.box.union(box);record.surfaceArea+=surfaceArea;record.lineLength+=lineLength;record.points+=points;
    }
  });
  return [...records].sort(([a],[b])=>a.localeCompare(b)).map(([id,r])=>({id,bounds:[...r.box.min.toArray(),...r.box.max.toArray()].map(rounded),surfaceArea:rounded(r.surfaceArea),lineLength:rounded(r.lineLength),points:r.points}));
}
