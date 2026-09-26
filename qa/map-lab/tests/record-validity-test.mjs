import assert from 'node:assert/strict';
import {validateAssets,observeAssetActivity,observeEnvironment} from '../benchmark/record-validity.js';
const raw=events=>({pendingAssets:0,assetEvents:events.map(([kind,atMs])=>({kind,atMs,url:'asset'})),frames:[{phase:'walk',startMs:10,cpu:{loop:2}},{phase:'walk',startMs:20,cpu:{loop:2}}]});
validateAssets(raw([['start',1],['end',9]]),['walk']);
validateAssets(raw([['start',23],['end',25]]),['walk']);
for(const events of [[['start',1],['end',25]],[['start',12],['end',13]],[['start',10],['end',11]],[['start',1],['start',2],['end',3],['end',25]]])assert.throws(()=>validateAssets(raw(events),['walk']),/Assets/);
const manager={itemStart(){return 7;}},original=manager.itemStart,watch=observeAssetActivity(manager);watch.validate();assert.equal(manager.itemStart('x'),7);assert.throws(()=>watch.validate(),/Assets changed/);watch.dispose();assert.equal(manager.itemStart,original);
console.log('PASS asset intervals crossing measurement boundaries, between-frame activity, duplicate URLs and control monitor cleanup');
for(const [visibilityState,focused] of [['hidden',true],['visible',false]]){
  globalThis.document={visibilityState,hasFocus:()=>focused};
  try{assert.throws(()=>observeEnvironment({}),/visible, focused/);}finally{delete globalThis.document;}
}
console.log('PASS initially hidden or unfocused replays are rejected');
const listeners=new Map();
Object.assign(globalThis,{document:{visibilityState:'visible',hasFocus:()=>true},window:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},MutationObserver:class{observe(){}disconnect(){}},devicePixelRatio:1,innerWidth:1000,innerHeight:800});
try{
  const guard=observeEnvironment({width:600,height:400});guard.validate();
  innerWidth=1100;listeners.get('resize')();innerWidth=1000;listeners.get('resize')();
  assert.throws(()=>guard.validate(),/Viewport/);guard.dispose();assert.equal(listeners.size,0);
}finally{for(const key of ['document','window','MutationObserver','devicePixelRatio','innerWidth','innerHeight'])delete globalThis[key];}
console.log('PASS viewport resize-and-restore is rejected even when canvas dimensions stay fixed');
