// Orchestrator. Owned by: main (integration). Creates renderer/camera/input, boots modules in order, runs the loop, exposes window.__game QA hooks.
import * as THREE from 'three';
import { createCtx, clamp } from './ctx.js';
import * as assets from './assets.js';
import * as world from './world.js';
import * as player from './player.js';
import * as weapons from './weapons.js';
import * as ai from './ai.js';
import * as post from './post.js';
import * as hud from './hud.js';
import * as audio from './audio.js';
import * as touch from './touch.js';
import * as vehicles from './vehicles.js';
import * as net from './net.js';
import * as netwaves from './netwaves.js';
import * as minimap from './minimap.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// BVH-accelerated raycasts for every mesh (bullets, AI line of sight, impact FX). Merged map batches are 100k+ triangle
// meshes whose bounding sphere covers the whole map, so an unaccelerated ray tested every triangle (14 fps with AI on the
// big campus). Trees are built lazily for any raycast target over ~500 triangles, including meshes added after boot.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const ctx = createCtx();
// Phones: every image loader (textures, GLTF props, HDR stays) is redirected to the <=512px mirror in assets-m/ (see qa/build-mobile-assets.sh)
if (ctx.isTouch && ctx.qs.get('fullassets') !== '1') THREE.DefaultLoadingManager.setURLModifier((url) => /\/assets\/.*\.(jpe?g|png)(\?.*)?$/i.test(url) ? url.replace('/assets/', '/assets-m/').replace(/\.png(\?.*)?$/i, '.jpg$1') : url);
window.__ctx = ctx;

// ---------- renderer / scene / camera ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, depth: true, logarithmicDepthBuffer: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, ctx.settings.renderScale));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = ctx.settings.shadows !== false;
// Settings → Shadows: the whole shadow pass on/off (renderer + every shadow-casting light; materials recompile once)
function applyShadows(on) {
  if (renderer.shadowMap.enabled === on) return; renderer.shadowMap.enabled = on;
  scene.traverse((o) => { if (o.isLight && o.shadow) { if (o.userData.castShadow0 === undefined) o.userData.castShadow0 = o.castShadow; o.castShadow = on && o.userData.castShadow0; } if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
}
ctx.bus?.on?.('setting', (e) => { if (e?.key === 'shadows') applyShadows(!!e.value); });
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);
ctx.renderer = renderer; ctx.canvas = renderer.domElement;

const scene = new THREE.Scene();
ctx.scene = scene;
const camera = new THREE.PerspectiveCamera(ctx.settings.fov, innerWidth / innerHeight, 0.03, 600);
camera.rotation.order = 'YXZ';
scene.add(camera);
ctx.camera = camera;

// ---------- input ----------
const input = {
  keys: new Set(), mouse: { dx: 0, dy: 0, buttons: 0, wheel: 0 }, locked: false,
  touch: { axis: { x: 0, y: 0 }, fire: false, ads: false, sprint: false }, // written by touch.js
  // edge-triggered action flags, consumed by player/weapons each frame via consume()
  pressed: new Set(),
  down(code) { return this.keys.has(code); },
  consume(code) { const h = this.pressed.has(code); this.pressed.delete(code); return h; },
  // named actions
  get fire() { return (this.mouse.buttons & 1) !== 0 || this.touch.fire; },
  get ads() { return (this.mouse.buttons & 4) !== 0 || this.down('KeyE') || this.touch.ads; }, // RMB (bit 1 << 2), hold E, or touch — was & 2 (the middle button), so right-click never aimed
  get forward() { return this.down('KeyW') || this.down('ArrowUp') || this.touch.axis.y < -0.3; },
  get back() { return this.down('KeyS') || this.down('ArrowDown') || this.touch.axis.y > 0.3; },
  get left() { return this.down('KeyA') || this.down('ArrowLeft') || this.touch.axis.x < -0.3; },
  get right() { return this.down('KeyD') || this.down('ArrowRight') || this.touch.axis.x > 0.3; },
  get sprint() { return this.down('ShiftLeft') || this.down('ShiftRight') || (this.touch.sprint && !this.touch.fire && !this.touch.ads); }, // on touch, firing/aiming cancels auto-sprint
  get crouch() { return this.down('KeyC') || this.down('ControlLeft'); },
  get jump() { return this.down('Space'); },
};
ctx.input = input;
addEventListener('keydown', e => { if (e.repeat) return; input.keys.add(e.code); input.pressed.add(e.code); if (['Space', 'Tab'].includes(e.code)) e.preventDefault(); });
addEventListener('keyup', e => input.keys.delete(e.code));
addEventListener('blur', () => { input.keys.clear(); input.mouse.buttons = 0; });
addEventListener('mousemove', e => { if (!input.locked && !ctx.qa) return; input.mouse.dx += e.movementX; input.mouse.dy += e.movementY; });
// macOS turns Ctrl+click into a right-click (button 2 + contextmenu). Ctrl is our crouch key, so while crouch-Ctrl is held a
// "right-click" from the primary button is really a trigger pull: map it back to fire (right-click ADS still works via the real button).
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const btnOf = (e) => (IS_MAC && e.ctrlKey && e.button === 2 && input.keys.has('ControlLeft') && !(e.buttons & 2) ? 0 : e.button);
addEventListener('mousedown', e => { if (input.locked) { const b = btnOf(e); input.mouse.buttons |= (1 << b); if (b === 0) input.pressed.add('Mouse0'); if (b === 2) input.pressed.add('Mouse2'); } });
addEventListener('mouseup', e => { const b = btnOf(e); input.mouse.buttons &= ~(1 << b); if (b !== e.button) input.mouse.buttons &= ~(1 << e.button); });
addEventListener('contextmenu', e => { if (input.locked || ctx.state === 'playing') e.preventDefault(); });   // never let a menu steal the pointer lock mid-fight
addEventListener('wheel', e => { input.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('pointerlockchange', () => { input.locked = document.pointerLockElement === renderer.domElement; ctx.bus.emit('pointerlock', input.locked); if (!input.locked && ctx.state === 'playing') setState('paused'); });
ctx.requestPointerLock = () => { const q = (o) => { try { const r = renderer.domElement.requestPointerLock(o); r?.catch?.(() => { if (o) q(); }); } catch { if (o) q(); } }; q({ unadjustedMovement: true }); };   // promise rejections (no user gesture, headless) are harmless

// ---------- state ----------
function setState(s) {
  const prev = ctx.state; if (prev === s) return;
  ctx.state = s; ctx.bus.emit('state', { state: s, prev });
  if (ctx.isTouch) { input.locked = s === 'playing'; ctx.bus.emit('pointerlock', input.locked); return; }
  if (s === 'playing' && !input.locked && !ctx.qa) ctx.requestPointerLock();
  if (s !== 'playing' && input.locked) document.exitPointerLock();
}
ctx.setState = setState;
ctx.restart = () => {
  for (const [name, m] of MODULES) { if (m.reset) { try { m.reset(ctx); } catch (e) { console.error(`[reset:${name}]`, e); } } }
  ctx.time.elapsed = 0; ctx.bus.emit('restart');
  setState('playing');
};
addEventListener('keydown', e => {
  if (e.code === 'Escape') { if (ctx.state === 'playing') setState('paused'); }
});

// ---------- boot ----------
const bootbar = document.getElementById('bootbar'), boottxt = document.getElementById('boottxt');
ctx.progress = (frac, txt) => { bootbar.style.width = `${Math.round(clamp(frac, 0, 1) * 100)}%`; if (txt) boottxt.textContent = txt; };

const MODULES = [['assets', assets], ['world', world], ['player', player], ['weapons', weapons], ['ai', ai], ['audio', audio], ['post', post], ['hud', hud], ['touch', touch], ['vehicles', vehicles], ['net', net], ['netwaves', netwaves], ['minimap', minimap]];
const UPDATE_ORDER = ['touch', 'vehicles', 'player', 'weapons', 'ai', 'world', 'audio', 'hud', 'net', 'netwaves', 'minimap']; // vehicles before player: a mounted player is driven by the vehicle // post.render() runs last
const mods = Object.fromEntries(MODULES);

async function boot() {
  let i = 0;
  for (const [name, mod] of MODULES) {
    ctx.progress(i / MODULES.length, `initializing ${name}`);
    try { const api = await mod.init(ctx); if (api) ctx[name] = api; }
    catch (e) { console.error(`[boot] ${name} failed`, e); ctx.bootErrors = (ctx.bootErrors || []).concat(`${name}: ${e.message}`); }
    i++;
  }
  // memory budget for phones: cap shadow maps after the map built its lights
  if (ctx.settings.shadowMax < 4096) scene.traverse((o) => { if (o.isLight && o.shadow && o.shadow.mapSize.x > ctx.settings.shadowMax) { o.shadow.mapSize.set(ctx.settings.shadowMax, ctx.settings.shadowMax); if (o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; } } });
  // spatial index for large static raycast targets (skinned/soldier hitboxes excluded)
  const bvhFor = () => { for (const o of ctx.raycastTargets) { const g = o.geometry; if (!o.isMesh || o.isSkinnedMesh || !g || g.boundsTree || o.userData.soldier) continue; const n = (g.index ? g.index.count : g.attributes.position?.count || 0) / 3; if (n > 500) { try { g.computeBoundsTree({ maxLeafTris: 8 }); } catch (e) { /* non-indexable geometry: plain raycast */ } } } };
  bvhFor(); ctx.bus.on?.('boot', () => setTimeout(bvhFor, 4000)); setTimeout(bvhFor, 12000);   // async GLTF props arrive later
  ctx.progress(1, 'ready');
  document.getElementById('boot').classList.add('hide');
  setState(ctx.qa ? 'playing' : 'menu');
  ctx.bus.emit('boot');
  const pose = ctx.qs.get('pose'); if (pose && ctx.world?.poses?.[pose]) window.__game.teleport(...ctx.world.poses[pose]);
  window.__game.ready = true;
  requestAnimationFrame(frame);
}

// ---------- loop ----------
let last = performance.now(); let fpsAcc = 0, fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt < 0) dt = 0; if (dt > 0.1) dt = 0.1;
  dt *= ctx.time.scale;
  const paused = ctx.state === 'paused' || ctx.state === 'menu';
  const simDt = paused ? 0 : dt;
  ctx.time.dt = simDt; ctx.time.elapsed += simDt; ctx.time.frame++;
  ctx.time.realDt = dt;
  for (const name of UPDATE_ORDER) { const m = mods[name]; if (m && m.update) { try { m.update(simDt, ctx); } catch (e) { if (ctx.time.frame % 300 === 1) console.error(`[update:${name}]`, e); } } }
  input.mouse.dx = 0; input.mouse.dy = 0; input.mouse.wheel = 0; input.pressed.clear();
  // depth precision: near 0.03 can't resolve ground detail 100 m+ away, so from high up (coney 19th floor / roof) streets
  // and roofs z-fought ("pulsating"). 4x the near plane up there; ≤ 0.15 leaves the hip/ADS viewmodels unclipped.
  { const nr = camera.position.y > 12 ? 0.12 : 0.03; if (camera.near !== nr) { camera.near = nr; camera.updateProjectionMatrix(); } }
  if (ctx.post && ctx.post.render) ctx.post.render(dt, ctx); else renderer.render(scene, camera);
  // perf
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 0.5) { ctx.perf.fps = fpsN / fpsAcc; ctx.perf.frameMs = 1000 * fpsAcc / fpsN; fpsAcc = 0; fpsN = 0; ctx.perf.drawCalls = renderer.info.render.calls; ctx.perf.triangles = renderer.info.render.triangles; }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  for (const [, m] of MODULES) if (m.onResize) m.onResize(ctx);
});

// ---------- QA hooks (window.__game) ----------
window.__game = {
  ready: false, ctx,
  stats: () => ({ fps: +ctx.perf.fps.toFixed(1), frameMs: +ctx.perf.frameMs.toFixed(2), drawCalls: ctx.perf.drawCalls, triangles: ctx.perf.triangles, state: ctx.state, errors: ctx.bootErrors || [], enemies: ctx.ai?.soldiers?.length ?? null, quality: ctx.settings.quality }),
  setState,
  teleport: (x, y, z, yaw = 0, pitch = 0) => ctx.player?.teleport?.(x, y, z, yaw, pitch),
  pose: (name) => ctx.world?.poses?.[name] ? (window.__game.teleport(...ctx.world.poses[name]), name) : Object.keys(ctx.world?.poses || {}),
  fire: (n = 1) => ctx.weapons?.qaFire?.(n),
  freezeAI: (v = true) => { if (ctx.ai) ctx.ai.frozen = v; },
  killAll: () => ctx.ai?.qaKillAll?.(),
  timeScale: (s) => { ctx.time.scale = s; },
  quality: (q) => { ctx.settings.quality = q; ctx.bus.emit('quality', q); },
};
boot();
