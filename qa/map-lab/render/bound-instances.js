import {Box3,Matrix4,Mesh} from 'three';
import {clipSolidGeometry} from './solid-clip.js';

// Keep interior instances batched; only edge-crossing instances need clipped individual meshes.
export function boundInstances(world,bounds){
  const matrix=new Matrix4(),transform=new Matrix4(),box=new Box3(),next=[];world.group.updateMatrixWorld(true);
  for(const mesh of world.selectable){
    if(!mesh.isInstancedMesh){next.push(mesh);continue;}
    mesh.geometry.computeBoundingBox();const features=[],segments=[];let count=0;
    for(let i=0;i<mesh.count;i++){
      mesh.getMatrixAt(i,matrix);transform.multiplyMatrices(mesh.matrixWorld,matrix);box.copy(mesh.geometry.boundingBox).applyMatrix4(transform);
      if(box.max.x<=bounds.x0||box.min.x>=bounds.x1||box.max.z<=bounds.z0||box.min.z>=bounds.z1)continue;
      const f=mesh.userData.features[i];
      if(box.min.x>=bounds.x0&&box.max.x<=bounds.x1&&box.min.z>=bounds.z0&&box.max.z<=bounds.z1){mesh.setMatrixAt(count++,matrix);features.push(f);segments.push(mesh.userData.segments?.[i]);continue;}
      const geometry=clipSolidGeometry(mesh.geometry.clone().applyMatrix4(transform),bounds);if(!geometry.attributes.position.count){geometry.dispose();continue;}
      const clipped=new Mesh(geometry,mesh.material);clipped.userData={feature:f,clippedInstance:true};
      // Keep the assembly placement separate so cached visibility can re-ground
      // both the clipped and batched pieces through the same placement pass.
      if(f.attributes?.placement){const base=f.attributes.placement.value;geometry.translate(0,-base,0);clipped.position.y=base;clipped.updateMatrix();}
      world.group.add(clipped);next.push(clipped);
    }
    mesh.count=count;mesh.userData.features=features;mesh.userData.segments=segments;mesh.instanceMatrix.needsUpdate=true;
    if(count){mesh.computeBoundingSphere();next.push(mesh);}else{mesh.removeFromParent();mesh.dispose();}
  }
  world.selectable=next;world.group.updateMatrixWorld(true);
}
