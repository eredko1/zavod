import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {chromeOptions} from '../../browser-launch.mjs';
const browser=await chromium.launch(chromeOptions({args:['--no-sandbox','--disable-dev-shm-usage']}));
try{
  const page=await browser.newPage();await page.goto('http://localhost:8790/qa/map-lab/index.html');
  const checks=await page.evaluate(async()=>{
    const T=await import('three'),{buildDetails}=await import('/qa/map-lab/render/osm-detail-meshes.js'),{drapeScene}=await import('/qa/map-lab/render/map-terrain.js'),{placeSurfaceProps}=await import('/qa/map-lab/render/prop-placement.js'),{surfaceIndex}=await import('/qa/map-lab/render/map-surface-index.js'),{dispose}=await import('/qa/map-lab/render/osm-meshes.js');
    const checks=[];
    for(const active of [false,true]){
      const terrain={active,sample:(x,z)=>active?.03*x+.02*z:0},f={id:'bench',rule:'bench',point:[0,0],rotation:.4,dimensions:{height:1,length:2,width:.6},attributes:{}},plan={details:[f],issues:[]};
      const mesh=buildDetails(plan),path=new T.PlaneGeometry(20,20);path.rotateX(-Math.PI/2);path.translate(0,.19,0);const paving=new T.Mesh(path);mesh.group.add(paving);drapeScene(mesh.group,terrain);mesh.group.updateMatrixWorld(true);
      const surfaces=surfaceIndex([paving],terrain.sample),m=new T.Matrix4(),v=new T.Vector3(),feet=[];
      mesh.group.traverse(o=>{if(!o.isInstancedMesh)return;for(let i=0;i<o.count;i++){o.getMatrixAt(i,m);const ground=active?terrain.sample(m.elements[12],m.elements[14]):0,p=o.geometry.attributes.position;for(let n=0;n<p.count;n++){v.fromBufferAttribute(p,n).applyMatrix4(m);if(Math.abs(v.y-ground)<1e-5)feet.push({mesh:o,index:i,vertex:n});}}});
      const gaps=()=>feet.map(({mesh,index,vertex})=>{mesh.getMatrixAt(index,m);v.fromBufferAttribute(mesh.geometry.attributes.position,vertex).applyMatrix4(m);return v.y-surfaces.sample(v.x,v.z);});
      const before=Math.min(...gaps());placeSurfaceProps(mesh.group,terrain,surfaces,plan.issues);
      const after=gaps(),base=f.attributes.placement.value;
      paving.visible=false;placeSurfaceProps(mesh.group,terrain,surfaces,plan.issues);const hiddenBase=f.attributes.placement.value;
      paving.visible=true;placeSurfaceProps(mesh.group,terrain,surfaces,plan.issues);
      checks.push({active,before,min:Math.min(...after),max:Math.max(...after),logged:plan.issues.filter(i=>i.code==='surface-placement').length,base,hiddenBase,restoredBase:f.attributes.placement.value,feet:feet.length});dispose(mesh.group);
    }
    return checks;
  });
  for(const c of checks){assert.ok(c.feet>0);assert.ok(c.before<-.18,'original legs reproduced below the raised path');assert.ok(c.min>=-1e-5,'no foot penetrates the rendered surface');assert.ok(Math.abs(c.min)<1e-5,'at least one foot contacts the surface');assert.ok(c.max<.07,'assembled bench stays rigid on sloping terrain');assert.equal(c.logged,1);assert.ok(Math.abs(c.base-c.hiddenBase-.19)<1e-5);assert.equal(c.restoredBase,c.base);}
  console.log('PASS flat and sloped raised paths, rigid bench assembly, foot contact and placement logs',checks);
}finally{await browser.close();}
