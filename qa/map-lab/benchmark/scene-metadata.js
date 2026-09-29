import { REVISION } from 'three';
import { sceneCoverage } from './scene-coverage.js';
export function sceneMetadata(world) {
  const r=world.renderer,gl=r.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info'),textures=new Set(),buffers=new Set();let bytes=0;
  world.scene.traverse(o=>{for(const a of [...Object.values(o.geometry?.attributes||{}),...(o.geometry?.index?[o.geometry.index]:[]),...(o.instanceMatrix?[o.instanceMatrix]:[])])if(!buffers.has(a.array.buffer)){buffers.add(a.array.buffer);bytes+=a.array.byteLength;}for(const m of o.material?Array.isArray(o.material)?o.material:[o.material]:[])for(const v of Object.values(m))if(v?.isTexture)textures.add(v.uuid);});
  return {
    stats:world.stats(),
    featureIDs:[...world.plan.buildings,...world.plan.roads,...world.plan.details].map(f=>f.id).sort(),
    gpu:gl.getParameter(debug?debug.UNMASKED_RENDERER_WEBGL:gl.RENDERER),
    browser:navigator.userAgent,threeRevision:REVISION,mergePolicyVersion:world.plan.merge?.version,renderPolicyVersion:world.plan.render?.version,
    viewport:[innerWidth,innerHeight],canvas:[r.domElement.width,r.domElement.height],devicePixelRatio,
    materialTextures:textures.size,geometryBufferBytes:bytes,
    settings:{...world.settings,merge:world.selection.mergeEnabled!==false,hiddenOSM:world.selection.hiddenOSM||[],sources:world.selection.nyc.map(s=>[s.sourceId,s.visible!==false])},
    geometryCoverage:sceneCoverage(world.scene),focused:document.hasFocus(),contextLost:gl.isContextLost(),
  };
}
