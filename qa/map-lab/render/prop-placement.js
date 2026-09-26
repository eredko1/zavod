import * as THREE from 'three';

const SURFACE_PROPS=new Set(['bench','lamp','signal','pole','bin','bollard','gate']),CONTACT_EPSILON=1e-5;
// Use walking surfaces at build/visibility changes; no per-frame placement work.
export function placeSurfaceProps(group,terrain,surfaces,issues) {
  const props=new Map(),changed=new Set(),vertex=new THREE.Vector3(),logs=new Map(issues.filter(i=>i.code==='surface-placement').map(i=>[i.id,i]));
  group.traverse(mesh=>{
    if(!mesh.isInstancedMesh)return;
    for(let i=0;i<mesh.count;i++){
      const f=mesh.userData.features[i];if(!f.point||!SURFACE_PROPS.has(f.rule)||f.elevation!==undefined)continue;
      const matrix=new THREE.Matrix4();mesh.getMatrixAt(i,matrix);
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
    if(base!==f.attributes.placement?.value)for(const {mesh,index,matrix} of parts){matrix.elements[13]+=base;mesh.setMatrixAt(index,matrix);changed.add(mesh);}
    f.attributes.placement={value:base,unit:'metres',source:'rendered walking surfaces',estimated:true,reason:'Highest surface at the mapped point and model foot contacts; terrain and curb offsets retain their source/rule estimates.'};
    const message=`${f.rule} base=${base.toFixed(3)} m in local world coordinates; placed on visible rendered surfaces using model foot contacts (estimated).`;
    if(logs.has(f.id))logs.get(f.id).message=message;else issues.push({id:f.id,code:'surface-placement',severity:'info',message});
  }
  for(const mesh of changed){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}
}
