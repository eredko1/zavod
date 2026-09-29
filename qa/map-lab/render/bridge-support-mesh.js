import * as THREE from '../../../vendor/three/build/three.module.js';
import {clipSurfaceGeometry} from './map-merge-mesh.js';
import {clipSolidGeometry} from './solid-clip.js';

// Coarse open frame, explicitly estimated. A pylon footprint must never become a solid wall across its roads.
export function supportGeometry(feature,shapeOf){
  const model=feature.supportModel,vertices=[],pieces=[];
  try{
    const append=(shape,bottom,top)=>{const g=new THREE.ExtrudeGeometry(shape,{depth:top-bottom,bevelEnabled:false,steps:1});g.rotateX(-Math.PI/2);g.translate(0,bottom,0);const bounded=clipSolidGeometry(g,feature.clipBounds);pieces.push(bounded);const p=bounded.index?bounded.toNonIndexed():bounded;if(p!==bounded)pieces.push(p);vertices.push(...p.attributes.position.array);};
    for(const shape of feature.shapes){let floor=new THREE.ShapeGeometry(shapeOf(shape));floor.rotateX(-Math.PI/2);floor=clipSurfaceGeometry(floor,model.corridors);pieces.push(floor);const p=floor.attributes.position;
      if(!p.count)throw Error('Mapped pylon has no leg area outside mapped road corridors.');
      for(let i=0;i<p.count;i+=3){const ring=[0,1,2].map(j=>[p.getX(i+j),p.getZ(i+j)]);append(shapeOf({outer:ring,holes:[]}),0,model.height-model.beamHeight);}
      append(shapeOf(shape),model.height-model.beamHeight,model.height);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();return geometry;
  }finally{for(const piece of pieces)piece.dispose();}
}
