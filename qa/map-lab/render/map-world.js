import * as THREE from 'three';
import {compileMapInWorker} from '../pipeline/worker-build.js';
import {checkAbort} from '../data/request-abort.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GEOMETRY_DEFAULTS, FEATURE_GROUPS } from '../pipeline/map-pipeline.js';
import { projection } from '../pipeline/osm-model.js';
import { MOVEMENT } from './movement.js';
import { advanceHeight } from './walk-height.js';
import { dispose } from './osm-meshes.js';
import { move, spawn, blocked } from './osm-walk.js';
import { compileMapStages } from '../pipeline/map-build.js';
import {runBuildStages} from '../pipeline/build-stages.js';
import { objectVisible } from './map-surface-index.js';
import { sourceVisible, setFeatureVisibility } from './feature-visibility.js';
import { placeSurfaceProps } from './prop-placement.js';
import {queryLiDARPoints} from './lidar-points.js';

export function createMapWorld({ canvas, viewport, onInspect = () => {}, onError = () => {}, onMode = () => {} }) {
const events = new AbortController(), listen = (target,type,fn) => target.addEventListener(type,fn,{signal:events.signal});
let selection = {data:null,nyc:[]}, settings = {...GEOMETRY_DEFAULTS};
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xe5e9e7);
scene.add(new THREE.HemisphereLight(0xffffff, 0x919b92, 2));
const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(-100, 200, 80); scene.add(sun);
const camera = new THREE.PerspectiveCamera(55, 1, 0.08, 20000), orbit = new OrbitControls(camera, canvas); orbit.enableDamping = true; orbit.maxPolarAngle = Math.PI * 0.495;
camera.position.set(150, 220, 260); orbit.update();
let plan = null, world = null, reference = null, mode = 'orbit', yaw = 0, pitch = 0, last = performance.now(),buildController=null;
let terrain = null, resolved = null, surfaces = null, supports = null, needsRender = true;
const motion={velocity:0,grounded:true};
let hiddenOSM = new Set(), suspended = false, running = false;
orbit.addEventListener('change', () => { needsRender = true; });
const keys = new Set(), ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
function rendered() { return plan?.buildings.filter(b => b.extrude && !b.suppressed && !b.failed) || []; }
function message() { onMode(mode, mode === 'walk' ? `${document.pointerLockElement === canvas ? 'Mouse to look' : 'Click the world to look'} · WASD walk · Shift run · Esc release · Eye height 1.7 m` : mode==='place'?'Click a roof, road or ground surface to walk there · Esc cancel':'Orbit: drag to rotate · Right drag to pan · Scroll to zoom · North is −Z'); }
function fit(top = false) {
  if (!plan) return; document.exitPointerLock?.(); mode = 'orbit'; keys.clear(); motion.velocity=0;motion.grounded=true; orbit.enabled = true;
  const b = plan.bounds, x = (b.x0 + b.x1) / 2, z = (b.z0 + b.z1) / 2, height = Math.max(0, ...rendered().map(b => b.height.top));
  const span = Math.max(b.x1 - b.x0, b.z1 - b.z0, height, 40), d = span / Math.min(camera.aspect, 1);
  camera.up.set(0, 1, 0); orbit.target.set(x, 0, z); camera.position.set(x + (top ? 0 : d * 0.55), d * (top ? 1.3 : 0.85), z + (top ? 0.001 : d * 0.75)); orbit.update(); message();
}
function respawn() { if (!plan) return; const [x, z] = spawn(plan); camera.position.set(x, groundAt(x, z) + MOVEMENT.eye, z); motion.velocity=0;motion.grounded=true; yaw = 0; pitch = 0; camera.rotation.set(0, 0, 0, 'YXZ'); }
async function lock() { try { await canvas.requestPointerLock(); } catch (e) { onError(`Mouse capture failed: ${e.message}. Click the world to retry.`); } }
function pickWalk(){if(!plan)return;document.exitPointerLock?.();mode='place';orbit.enabled=true;keys.clear();message();}
function walkAt(point,{capture=true}={}){if(!plan)return;mode='walk';orbit.enabled=false;keys.clear();camera.position.set(point.x,point.y+MOVEMENT.eye,point.z);motion.velocity=0;motion.grounded=true;const direction=camera.getWorldDirection(new THREE.Vector3());yaw=Math.atan2(-direction.x,-direction.z);pitch=0;camera.rotation.set(0,yaw,0,'YXZ');canvas.focus();message();needsRender=true;if(capture)lock();}
function walk({capture=true} = {}) { if (!plan) return; if (mode !== 'walk') respawn(); mode = 'walk'; orbit.enabled = false; keys.clear(); canvas.focus(); message(); if(capture)lock(); }
function coverageSummary() { return (plan?.coverage || []).reduce((out, c) => { out[c.status] = (out[c.status] || 0) + 1; return out; }, {}); }
function groundAt(x, z) {
  return surfaces?.sample(x, z) ?? terrain?.sample(x, z) ?? 0;
}
function supportAt(x,z,ceiling) {return Math.max(surfaces?.sample(x,z,ceiling)??-Infinity,supports?.sample(x,z,ceiling)??-Infinity);}
function focusFeature(id){
  if(!plan)return;let f=[...plan.buildings,...plan.roads,...plan.details].find(f=>f.id===id);
  if(!f){const raw=selection.data?.elements.find(e=>`${e.type}/${e.id}`===id);if(raw?.geometry){const project=projection(...plan.origin);f={id,tags:raw.tags,paths:[raw.geometry.filter(Boolean).map(project)]};}}
  if(!f){onError('This record has no active geometry; inspect its merge members or source download.');return;}
  const points=[...(f.point?[f.point]:[]),...(f.paths||[]).flat(),...(f.shapes||[]).flatMap(s=>s.outer)];if(!points.length)return;
  const box=new THREE.Box3();for(const [x,z]of points)box.expandByPoint(new THREE.Vector3(x,groundAt(x,z),z));
  const center=box.getCenter(new THREE.Vector3()),bottom=f.height?.bottom??f.equipmentModel?.bottom??0,top=f.height?.top??f.equipmentModel?.top??f.supportModel?.height??0;center.y=(f.ground??center.y)+(bottom+top)/2;const span=Math.max(box.max.x-box.min.x,box.max.z-box.min.z,top-bottom,15);
  document.exitPointerLock?.();mode='orbit';orbit.enabled=true;keys.clear();orbit.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(span*.6,span,span));orbit.update();message();onInspect(f);needsRender=true;
}
function applyVisibility() {
  if (!resolved || !world) return;
  const visible = f => sourceVisible(f,selection.nyc)&&!hiddenOSM.has(f.id);
  const active = new Set();
  for (const key of FEATURE_GROUPS) { plan[key] = resolved[key].filter(visible); for (const f of plan[key]) active.add(f.id); }
  setFeatureVisibility(world.group,f=>active.has(f.id));
  plan.coverage = resolved.coverage.map(c => !active.has(c.id) && ['rendered','reference'].includes(c.status) && resolved.geometryIDs.has(c.id) ? { ...c, status: 'hidden', reason: 'Resolved geometry source is hidden; merge result is unchanged.' } : { ...c });
  needsRender = true;
}
function loadResult(result, options = {}, mark = () => {}, beforeStage=null,signal=null) {
  if(buildController)throw Error('A map build is already active.');
  return beforeStage?loadWorkerResult(result,options,mark,beforeStage,signal):runBuildStages(loadStages(result,options),mark);
}
async function loadWorkerResult(result,options,mark,beforeStage,signal){
  const controller=new AbortController(),abort=()=>controller.abort(signal.reason);buildController=controller;signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const nextSelection={...result,nyc:result.nyc||[]},nextSettings={...GEOMETRY_DEFAULTS,...options,execution:'worker'};let built;
  try{if(!result.data?.elements?.length&&!nextSelection.nyc.length)throw Error('No source data to generate.');built=await compileMapInWorker(nextSelection,nextSettings,mark,beforeStage,controller.signal);await beforeStage('sceneSwap');checkAbort(controller.signal);const start=performance.now();acceptBuild(built,nextSelection,nextSettings);built=null;mark('sceneSwap',performance.now()-start);}
  finally{if(built){dispose(built.world.group);dispose(built.reference);}signal?.removeEventListener('abort',abort);buildController=null;}
}
function* loadStages(result,options){
  const nextSelection={...result,nyc:result.nyc||[]},nextSettings={...GEOMETRY_DEFAULTS,...options,execution:'main'};
  if (!result.data?.elements?.length && !nextSelection.nyc.length) throw Error('No source data to generate.');
  const built = yield* compileMapStages(nextSelection,nextSettings);
  try{yield 'sceneSwap';}catch(error){dispose(built.world.group);dispose(built.reference);throw error;}
  acceptBuild(built,nextSelection,nextSettings);
}
function acceptBuild(built,nextSelection,nextSettings){
  const {plan:next,world:mesh,reference:ref,terrain:nextTerrain,surfaces:nextSurfaces,supports:nextSupports}=built;
  if (world) { scene.remove(world.group); dispose(world.group); } if (reference) { scene.remove(reference); dispose(reference); }
  selection=nextSelection;settings=nextSettings;hiddenOSM=new Set(nextSelection.hiddenOSM||[]);
  plan = next; world = mesh; reference = ref; terrain = nextTerrain; surfaces = nextSurfaces; supports=nextSupports; plan.groundSample = (x,z)=>api.groundAt(x,z); scene.add(world.group, reference); scene.updateMatrixWorld(true);
  resolved = { buildings: next.buildings, roads: next.roads, details: next.details, coverage: next.coverage.map(c => ({ ...c })), geometryIDs: new Set([...next.buildings,...next.roads,...next.details].map(f => f.id)) }; applyVisibility();
  fit();
}
listen(document,'pointerlockchange', () => { keys.clear(); message(); }); listen(window,'blur', () => keys.clear());
listen(document,'mousemove', e => { if (mode !== 'walk' || document.pointerLockElement !== canvas) return; yaw -= e.movementX * 0.002; pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * 0.002)); camera.rotation.set(pitch, yaw, 0, 'YXZ'); });
listen(document,'keydown', e => { if(mode==='place'&&e.code==='Escape'){mode='orbit';message();return;} if (mode === 'walk' && document.pointerLockElement === canvas && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(e.code)) { keys.add(e.code); e.preventDefault(); } });
listen(document,'keyup', e => keys.delete(e.code));
let down = null;
listen(canvas,'pointerdown', e => { down = [e.clientX, e.clientY]; });
listen(canvas,'click', e => {
  if (!world) return; if (mode === 'walk') { if (document.pointerLockElement !== canvas) lock(); return; }
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
  const rect = canvas.getBoundingClientRect(); mouse.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1); ray.setFromCamera(mouse, camera);
  if(mode==='place'){const hit=ray.intersectObjects([...world.walkable,...world.elevatedWalkable].filter(objectVisible),false)[0];if(!hit||Math.abs(hit.face.normal.y)<.5){onError('Choose the top of a roof, road or ground surface.');return;}onError('');walkAt(hit.point);return;}
  const hit = ray.intersectObjects(world.selectable.filter(objectVisible), false)[0]; if (!hit) return;
  onInspect(hit.object.userData.features?.[hit.instanceId] || hit.object.userData.feature);
});
const observer = new ResizeObserver(() => { const r = viewport.getBoundingClientRect(); if (!r.width || !r.height) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); needsRender = true; }); observer.observe(viewport);
function simulate(dt, input) {
  if (!plan) return;
  let x = input?.x ?? (+keys.has('KeyD') - +keys.has('KeyA')), z = input?.z ?? (+keys.has('KeyS') - +keys.has('KeyW')), norm = Math.hypot(x,z);
  if (norm) { const speed = input?.speed ?? (keys.has('ShiftLeft') || keys.has('ShiftRight') ? MOVEMENT.run : MOVEMENT.walk); x *= speed*dt/norm; z *= speed*dt/norm; move(camera.position,x*Math.cos(yaw)+z*Math.sin(yaw),-x*Math.sin(yaw)+z*Math.cos(yaw),plan,(x,z)=>{const feet=camera.position.y-MOVEMENT.eye,step=motion.grounded?MOVEMENT.step:0,support=api.supportAt(x,z,feet+step+MOVEMENT.contactEpsilon);return api.groundAt(x,z)>feet+step+MOVEMENT.contactEpsilon||api.collision(x,z,Math.max(feet,support)+MOVEMENT.contactEpsilon);}); }
  advanceHeight(camera.position,motion,dt,(x,z,ceiling)=>api.supportAt(x,z,ceiling));
}
function controls() { if(mode==='orbit'||mode==='place')orbit.update(); }
function draw() { renderer.render(scene,camera);needsRender=false; }
function frame(dt,input=null) { api.controls();const movement=typeof input==='function'?input():input;if(mode==='walk'&&(movement||document.pointerLockElement===canvas))api.simulate(dt,movement);if(needsRender||mode==='walk')api.draw(); }
function tick() {
  if (suspended) return;
  try {
  const now = performance.now(), dt = Math.min((now - last) / 1000, MOVEMENT.maxDt); last = now;
  frame(dt);
  } catch (e) { suspended = true; onError(e.message); }
}
function start() { if(running)return;running=true;last=performance.now();renderer.setAnimationLoop(tick); }
function stop() { running=false;renderer.setAnimationLoop(null); }
const api = {
  queryPoints(sourceId,options){const snapshot=selection.nyc.find(s=>s.sourceId===sourceId);if(!snapshot)throw Error('Point source is not loaded: '+sourceId);return queryLiDARPoints(snapshot,options);},
  loadResult, applyVisibility, scene, camera, renderer, fit, walk, pickWalk, walkAt, respawn, focusFeature, start, stop, frame, controls, simulate, draw,
  collision: (x,z,ground)=>blocked(x,z,plan,undefined,ground),
  look(angle,tilt) {yaw=angle;pitch=tilt;camera.rotation.set(pitch,yaw,0,'YXZ');},
  capturePose: ()=>({position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),yaw,pitch}),
  invalidate: ()=>{needsRender=true;},
  get plan() { return plan; }, get settings() {return settings;}, get selection() {return selection;},
  stats: () => ({ buildings:rendered().length, roads:plan?.roads.length || 0, details:plan?.details.length || 0, coverage:coverageSummary(), merge:plan?.merge?.summary || null, errors:plan?.issues.filter(i=>i.severity==='error').length || 0, mode, position:camera.position.toArray(), drawCalls:renderer.info.render.calls, nyc:Object.fromEntries(selection.nyc.map(s=>[s.sourceId,{features:s.data.features.length,visible:s.visible!==false}])), terrain:terrain ? {active:terrain.active,samples:terrain.samples.length,datum:terrain.datum,min:terrain.min,max:terrain.max}:null }),
  getTerrain: () => terrain, groundAt, supportAt, getWorld: () => world,
  setSourceVisible(id, value) { const s=selection.nyc.find(s=>s.sourceId===id); if(s&&s.visible!==value){s.visible=value;applyVisibility();placeSurfaceProps(world.group,terrain,surfaces,plan.issues);} },
  setPosition(x,z,angle=0) {motion.velocity=0;motion.grounded=true;camera.position.set(x,groundAt(x,z)+MOVEMENT.eye,z);yaw=angle;pitch=0;camera.rotation.set(0,yaw,0,'YXZ');},
  suspend(value) { suspended=value; keys.clear(); if(value && document.pointerLockElement===canvas)document.exitPointerLock(); if(!value){last=performance.now();needsRender=true;} },
  dispose() { buildController?.abort(Error('View disposed during build.'));stop();events.abort(); observer.disconnect(); orbit.dispose(); if(world)dispose(world.group); if(reference)dispose(reference); renderer.dispose(); },
};
start();return api;
}
