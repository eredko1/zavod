import assert from 'node:assert/strict';
import * as T from 'three';
import {surfaceIndex} from '../render/map-surface-index.js';
import {advanceHeight} from '../render/walk-height.js';
import {MOVEMENT} from '../render/movement.js';
import {compileMap} from '../pipeline/map-build.js';
import {GEOMETRY_DEFAULTS} from '../pipeline/map-pipeline.js';
import {blocked} from '../render/osm-walk.js';
import {releaseBuild} from '../render/scene-wire.js';
const deck=new T.Mesh(new T.PlaneGeometry(10,10).rotateX(-Math.PI/2));deck.position.y=12;deck.updateMatrixWorld(true);
const surfaces=surfaceIndex([deck],()=>0),p={x:0,z:0,y:12+MOVEMENT.eye},state={velocity:0,grounded:true};
const step=()=>advanceHeight(p,state,.05,(x,z,cap)=>surfaces.sample(x,z,cap));
assert.equal(surfaces.sample(0,0,1),0,'passing under a bridge must select ground');
step();assert.equal(p.y,13.7);p.x=6;step();assert.ok(p.y<13.7&&p.y>13,'walk off an edge begins a fall, not a ground teleport');
for(let n=0;n<50;n++)step();assert.equal(p.y,MOVEMENT.eye);assert.ok(state.grounded);p.x=0;step();assert.equal(p.y,MOVEMENT.eye,'walking beneath deck must not snap up');
p.y=50;state.grounded=false;state.velocity=-200;step();step();step();step();assert.equal(p.y,13.7,'swept landing must not tunnel through thin decks');
deck.visible=false;step();assert.ok(p.y<13.7,'hidden support no longer holds player');
const building=new T.Mesh(new T.BoxGeometry(10,4,10));building.position.y=8;building.userData.feature={height:{top:10,bottom:6}};building.updateMatrixWorld(true);const roofs=surfaceIndex([building],()=>0);assert.equal(roofs.sample(0,0,8),0,'building undersides are not walkable');assert.equal(roofs.sample(0,0,11),10);
console.log('PASS roofs, bridge underpasses, walking off edges, swept landing, hidden supports and excluded building undersides');
const ring=[[-73.98,40.58],[-73.9799,40.58],[-73.9799,40.5801],[-73.98,40.5801],[-73.98,40.58]];
for(const [height,min_height]of [['12.2','0'],['12.2','6.11'],['1.1','0']]){
  const input={data:{elements:[{type:'way',id:1,tags:{building:'yes',height,min_height},geometry:ring.map(([lon,lat])=>({lon,lat}))}]},nyc:[]},built=compileMap(input,{...GEOMETRY_DEFAULTS,terrain:false});
  try{const f=built.plan.buildings[0],point=[0,1].map(k=>f.shapes[0].outer.reduce((sum,p)=>sum+p[k],0)/f.shapes[0].outer.length),top=built.supports.sample(...point);assert.equal(blocked(...point,built.plan,undefined,top),false,'the actual drawn roof cannot block walking due to tag/buffer precision');assert.equal(blocked(...point,built.plan,undefined,top-.01),true,'walls just below the roof still block');assert.equal(f.height.top,Number(height),'collision precision never changes the selected measurement');assert.equal(f.render.attributes.collision.verticalBounds.top,f.collisionBounds.top);}
  finally{releaseBuild(built);}
}
console.log('PASS decimal and raised roof collision uses drawn geometry precision without changing measured heights');
