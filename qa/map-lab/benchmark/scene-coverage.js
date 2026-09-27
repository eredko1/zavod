import * as THREE from 'three';
import { objectVisible } from '../render/map-surface-index.js';
// Actual drawable geometry, independent of source-record counts and draw-call batching.
export function sceneCoverage(group) {
  const records=new Map(), matrix=new THREE.Matrix4(), box=new THREE.Box3();
  group.updateMatrixWorld(true);
  group.traverse(o=>{
    if(!o.geometry?.attributes.position?.count || !objectVisible(o) || o.geometry.drawRange.count===0) return;
    const materials=Array.isArray(o.material)?o.material:[o.material];if(!materials.some(m=>m?.visible && m.opacity!==0))return;
    const features=o.userData.features || (o.userData.feature?[o.userData.feature]:[]);
    if(!features.length)return;
    if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();
    for(let i=0;i<Math.min(features.length,o.isInstancedMesh?o.count:1);i++){
      const f=features[i];box.copy(o.geometry.boundingBox);
      if(o.isInstancedMesh){o.getMatrixAt(i,matrix);matrix.premultiply(o.matrixWorld);box.applyMatrix4(matrix);}else box.applyMatrix4(o.matrixWorld);
      if(box.isEmpty())continue;
      if(!records.has(f.id))records.set(f.id,new THREE.Box3());records.get(f.id).union(box);
    }
  });
  return [...records].sort(([a],[b])=>a.localeCompare(b)).map(([id,b])=>({id,bounds:[...b.min.toArray(),...b.max.toArray()].map(v=>+v.toFixed(3))}));
}
