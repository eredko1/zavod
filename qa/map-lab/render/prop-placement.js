import * as THREE from '../../../vendor/three/build/three.module.js';

const SURFACE_PROPS=new Set(['bench','lamp','signal','pole','bin','bollard','gate']),CONTACT_EPSILON=1e-5;
// Use walking surfaces at build/visibility changes; no per-frame placement work.
export function placeSurfaceProps(group,terrain,surfaces,issues) {
  const props=new Map(),changed=new Set(),vertex=new THREE.Vector3(),logs=new Map(issues.filter(i=>i.code==='surface-placement').map(i=>[i.id,i]));
  group.traverse(mesh=>{
    if(!mesh.isInstancedMesh&&!mesh.userData.clippedInstance)return;
    for(let i=0;i<(mesh.isInstancedMesh?mesh.count:1);i++){
      const f=mesh.isInstancedMesh?mesh.userData.features[i]:mesh.userData.feature;if(!f.point||f.reference||!SURFACE_PROPS.has(f.rule)||f.elevation!==undefined)continue;
      const matrix=new THREE.Matrix4();if(mesh.isInstancedMesh)mesh.getMatrixAt(i,matrix);else{mesh.updateMatrix();matrix.copy(mesh.matrix);}
      // Undo the previous assembly placement, or the first drape's component-center offset.
      matrix.elements[13]-=f.attributes.placement?.value??(terrain.active?terrain.sample(matrix.elements[12],matrix.elements[14]):0);
      if(!props.has(f))props.set(f,{base:surfaces.sample(...f.point),parts:[]});
      const prop=props.get(f),positions=mesh.geometry.attributes.position;
      for(let n=0;n<positions.count;n++){
        vertex.fromBufferAttribute(positions,n).applyMatrix4(matrix);
        if(Math.abs(vertex.y)<CONTACT_EPSILON)prop.base=Math.max(prop.base,surfaces.sample(vertex.x,vertex.z));
      }
      prop.parts.push({mesh,index:i,matrix});
    }
  });
  for(const [f,{base,parts}] of props){
    if(base!==f.attributes.placement?.value)for(const {mesh,index,matrix} of parts){matrix.elements[13]+=base;if(mesh.isInstancedMesh)mesh.setMatrixAt(index,matrix);else matrix.decompose(mesh.position,mesh.quaternion,mesh.scale);changed.add(mesh);}
    f.attributes.placement={value:base,unit:'metres',source:'rendered walking surfaces',estimated:true,reason:'Highest surface at the mapped point and model foot contacts; terrain and curb offsets retain their source/rule estimates.'};
    if(f.render)f.render.attributes.placement=f.attributes.placement;
    const message=`${f.rule} base=${base.toFixed(3)} m in local world coordinates; placed on visible rendered surfaces using model foot contacts (estimated).`;
    if(logs.has(f.id))logs.get(f.id).message=message;else issues.push({id:f.id,code:'surface-placement',severity:'info',message});
  }
  for(const mesh of changed)if(mesh.isInstancedMesh){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}else mesh.updateMatrixWorld(true);
}
