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
import * as vr from './vr/vr.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// BVH-accelerated raycasts for every mesh (bullets, AI line of sight, impact FX). Merged map batches are 100k+ triangle
// meshes whose bounding sphere covers the whole map, so an unaccelerated ray tested every triangle (14 fps with AI on the
// big campus). Trees are built lazily for any raycast target over ~500 triangles, including meshes added after boot.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const ctx = createCtx();
// Phones: every image loader (textures, GLTF props, HDR stays) is redirected to the <=512px mirror in assets-m/ (see qa/build-mobile-assets.sh)
if (ctx.lite && ctx.qs.get('fullassets') !== '1') THREE.DefaultLoadingManager.setURLModifier((url) => /\/assets\/.*\.(jpe?g|png)(\?.*)?$/i.test(url) ? url.replace('/assets/', '/assets-m/').replace(/\.png(\?.*)?$/i, '.jpg$1') : url);
window.__ctx = ctx;

// ---------- renderer / scene / camera ----------
const app = document.getElementById('app');
// a headset gets MSAA: three sizes the XR framebuffer's samples from this flag, and without it every edge shimmers in VR (on Quest's
// tiled GPU 4x MSAA is nearly free). The flat game keeps its own post-process AA.
const renderer = new THREE.WebGLRenderer({ antialias: !!ctx.xrDevice, powerPreference: 'high-performance', stencil: false, depth: true, logarithmicDepthBuffer: false });
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
document.addEventListener('pointerlockchange', () => { input.locked = document.pointerLockElement === renderer.domElement; ctx.bus.emit('pointerlock', input.locked); if (!input.locked && ctx.state === 'playing' && !ctx.xr?.presenting) setState('paused'); });
ctx.requestPointerLock = () => { const q = (o) => { try { const r = renderer.domElement.requestPointerLock(o); r?.catch?.(() => { if (o) q(); }); } catch { if (o) q(); } }; q({ unadjustedMovement: true }); };   // promise rejections (no user gesture, headless) are harmless

// ---------- state ----------
function setState(s) {
  const prev = ctx.state; if (prev === s) return;
  ctx.state = s; ctx.bus.emit('state', { state: s, prev });
  if (ctx.isTouch || ctx.xr?.presenting) { input.locked = s === 'playing'; ctx.bus.emit('pointerlock', input.locked); return; }
  if (s === 'playing' && !input.locked && !ctx.qa) ctx.requestPointerLock();
  if (s !== 'playing' && input.locked) document.exitPointerLock();
}
ctx.setState = setState;
// "Reset map for everyone" (Settings): chill maps clear through hangkit's worldReset; wave maps also restart the waves.
// Maps without the hangout kit hear the net 'fresh' here (hangkit bridges it itself where it runs; the stamp dedupes).
let lastReset = 0;
ctx.bus.on('worldReset', () => { lastReset = performance.now(); if (ctx.mode !== 'chill') setTimeout(() => ctx.restart(), 0); });
ctx.bus.on('net:fresh', () => setTimeout(() => { if (performance.now() - lastReset > 500) ctx.bus.emit('worldReset', { by: 'net' }); }, 50));
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

const MODULES = [['assets', assets], ['world', world], ['player', player], ['weapons', weapons], ['ai', ai], ['audio', audio], ['post', post], ['hud', hud], ['touch', touch], ['vehicles', vehicles], ['net', net], ['netwaves', netwaves], ['minimap', minimap], ['vr', vr]];
const UPDATE_ORDER = ['vr', 'touch', 'vehicles', 'player', 'weapons', 'ai', 'world', 'audio', 'hud', 'net', 'netwaves', 'minimap']; // vehicles before player: a mounted player is driven by the vehicle // post.render() runs last
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
  await prewarm();
  ctx.progress(1, 'ready');
  document.getElementById('boot').classList.add('hide');
  const go = ctx.qs.get('go') === '1'; if (go) try { const u = new URL(location.href); u.searchParams.delete('go'); history.replaceState(null, '', u); } catch {}   // ?go=1: picked on the menu before the reload
  setState(ctx.qa || go ? 'playing' : 'menu');
  ctx.bus.emit('boot');
  const pose = ctx.qs.get('pose'); if (pose && ctx.world?.poses?.[pose]) window.__game.teleport(...ctx.world.poses[pose]);
  window.__game.ready = true;
  last = performance.now(); renderer.setAnimationLoop(frame);   // the renderer's loop: it switches to the headset's frame clock in VR
}

// Pre-warm behind the loading screen: compile every material in the scene (KHR_parallel_shader_compile lets the driver do it
// off the main thread), then draw one hidden frame with culling off and hidden objects shown, so shadow-depth programs, post
// passes, textures and vertex buffers are all resident before the first visible frame. Without it each of those compiled or
// uploaded the first time it came into view: a 1-8 s first frame and 0.1-0.3 s hitches when turning.
async function prewarm() {
  ctx.progress(0.98, 'warming up shaders');
  ctx.bus.emit('prewarm');   // last call to build anything that samples other modules' meshes (their arrays may be freed below)
  const t0 = performance.now();
  try { await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 20000))]); } catch (e) { console.warn('[boot] compileAsync', e); }
  const t1 = performance.now(), culled = [], shown = [], lit = new Set();
  scene.traverse((o) => { if (o.isLight) for (let p = o; p; p = p.parent) lit.add(p); });   // never reveal a hidden light: a new light count recompiles every program
  scene.traverse((o) => { if (o.frustumCulled && (o.isMesh || o.isPoints || o.isLine || o.isSprite)) { o.frustumCulled = false; culled.push(o); } if (!o.visible && !lit.has(o)) { o.visible = true; shown.push(o); } });
  try { if (ctx.post?.render) ctx.post.render(0, ctx); else renderer.render(scene, camera); renderer.setRenderTarget(null); }
  catch (e) { console.warn('[boot] warm frame', e); }
  finally { for (const o of culled) o.frustumCulled = true; for (const o of shown) o.visible = false; }
  ctx.perf.warm = { compileMs: Math.round(t1 - t0), frameMs: Math.round(performance.now() - t1), programs: renderer.info.programs?.length || 0 };
  // phones: the big merged static meshes nobody raycasts (parked cars, Brighton, the backdrop, 8th Ave) are on the GPU now,
  // their JS copies are dead weight (~35 MB): iOS kills the tab near its memory ceiling
  if (ctx.lite) { const rt = new Set(ctx.raycastTargets || []), seen = new Set();
    scene.traverse((o) => { const g = o.geometry; if (!o.isMesh || !g || seen.has(g) || rt.has(o) || o.isSkinnedMesh || !/^(cars|brighton|horizon|tavern):/.test(o.name || '')) return; seen.add(g);
      if (!g.boundingSphere) g.computeBoundingSphere(); if (!g.boundingBox) g.computeBoundingBox(); for (const k in g.attributes) g.attributes[k].array = null; if (g.index) g.index.array = null; }); }
  // phones: the big static buildings' own geometry (city, landmarks, boardwalk, the viaduct …) was kept in JS only so bullets,
  // sight lines and footsteps could raycast it (~120 MB + its BVH). Those raycasts go to one invisible mesh of the collision
  // boxes instead (the same shapes, a few MB); the originals stay on the GPU and drop their JS copies. Ground meshes stay.
  if (ctx.lite && ctx.colliders?.length) {
    const heavy = (o) => o.isMesh && !o.isSkinnedMesh && !o.userData.onHit && !o.userData.soldier && /^(city|cityFar|landmarks|luna|viaduct|shore|park|brighton|tavern|stillwell|surfKit):/.test(o.name || '') && !/ground/i.test(o.name) && o.geometry?.attributes?.position?.array;
    const drop = ctx.raycastTargets.filter(heavy);
    if (drop.length) {
      const pos = [], idx = []; let v = 0;
      for (const b of ctx.colliders) { if (!b?.isBox3 || b.isEmpty() || b.max.x - b.min.x > 400 || b.max.z - b.min.z > 400) continue; const { min: m, max: M } = b;
        for (const [x, y, z] of [[m.x, m.y, m.z], [M.x, m.y, m.z], [M.x, M.y, m.z], [m.x, M.y, m.z], [m.x, m.y, M.z], [M.x, m.y, M.z], [M.x, M.y, M.z], [m.x, M.y, M.z]]) pos.push(x, y, z);
        for (const f of [0, 1, 2, 0, 2, 3, 5, 4, 7, 5, 7, 6, 4, 0, 3, 4, 3, 7, 1, 5, 6, 1, 6, 2, 3, 2, 6, 3, 6, 7, 4, 5, 1, 4, 1, 0]) idx.push(v + f); v += 8; }
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); pg.setIndex(idx); pg.computeVertexNormals(); pg.computeBoundingSphere(); pg.computeBoundingBox();
      const proxy = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); proxy.visible = false; proxy.name = 'raycastProxy'; proxy.userData.surface = 'concrete'; scene.add(proxy); try { pg.computeBoundsTree?.(); } catch {}
      const gone = new Set(drop); ctx.raycastTargets.splice(0, ctx.raycastTargets.length, ...ctx.raycastTargets.filter((o) => !gone.has(o)), proxy);
      for (const o of drop) { const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); if (!g.boundingBox) g.computeBoundingBox(); try { g.disposeBoundsTree?.(); } catch {} g.boundsTree = null; for (const k in g.attributes) g.attributes[k].array = null; if (g.index) g.index.array = null; }
      console.log(`[boot] phones: ${drop.length} building meshes → a ${Math.round(pos.length / 24)}-box raycast proxy`);
    } }
}

// ---------- loop ----------
let last = performance.now(); let fpsAcc = 0, fpsN = 0;
// ?prof=1: per-frame CPU profile (each module, each world updater, render) + renderer resource counts, read by qa/perf.mjs.
// A frame whose program count grew compiled a shader; texture/geometry growth means an upload in that frame.
const PROF = ctx.qs.get('prof') === '1' ? { frames: [], cur: null, mark(k, ms) { const c = this.cur; if (c) c.parts[k] = (c.parts[k] || 0) + ms; }, reset() { this.frames.length = 0; } } : null;
if (PROF) { ctx.prof = PROF; window.__prof = PROF; }
// GPU time per frame (EXT_disjoint_timer_query_webgl2): queries resolve a few frames later and are written back onto their frame
const GL = renderer.getContext(), TQ = PROF && GL.getExtension('EXT_disjoint_timer_query_webgl2'), gpuQ = [];
function pollGpu() { while (gpuQ.length && GL.getQueryParameter(gpuQ[0][0], GL.QUERY_RESULT_AVAILABLE)) { const [q, c] = gpuQ.shift(); if (!GL.getParameter(TQ.GPU_DISJOINT_EXT)) c.gpu = GL.getQueryParameter(q, GL.QUERY_RESULT) / 1e6; GL.deleteQuery(q); } }
function frame(now) {
  const f0 = PROF ? performance.now() : 0; if (PROF) PROF.cur = { t: now, dt: now - last, parts: {} };
  let dt = (now - last) / 1000; last = now;
  if (dt < 0) dt = 0; if (dt > 0.1) dt = 0.1;
  dt *= ctx.time.scale;
  const paused = ctx.state === 'paused' || ctx.state === 'menu';
  const simDt = paused ? 0 : dt;
  ctx.time.dt = simDt; ctx.time.elapsed += simDt; ctx.time.frame++;
  ctx.time.realDt = dt;
  for (const name of UPDATE_ORDER) { const m = mods[name]; if (m && m.update) { const t0 = PROF ? performance.now() : 0; try { m.update(simDt, ctx); } catch (e) { if (ctx.time.frame % 300 === 1) console.error(`[update:${name}]`, e); } if (PROF) PROF.mark(name, performance.now() - t0); } }
  input.mouse.dx = 0; input.mouse.dy = 0; input.mouse.wheel = 0; input.pressed.clear();
  // depth precision: near 0.03 can't resolve ground detail 100 m+ away, so from high up (coney 19th floor / roof) streets
  // and roofs z-fought ("pulsating"). 4x the near plane up there; ≤ 0.15 leaves the hip/ADS viewmodels unclipped.
  if (!ctx.xr?.presenting) { const nr = camera.position.y > 12 ? 0.12 : 0.03; if (camera.near !== nr) { camera.near = nr; camera.updateProjectionMatrix(); } }
  const r0 = PROF ? performance.now() : 0; let gq = null; if (TQ && !ctx.post?._S?.profiling) { pollGpu(); gq = GL.createQuery(); GL.beginQuery(TQ.TIME_ELAPSED_EXT, gq); }
  if (ctx.xr?.presenting) vr.render(ctx);   // the headset: straight to the eyes (the post chain is screen-space, one view)
  else if (ctx.post && ctx.post.render) ctx.post.render(dt, ctx); else renderer.render(scene, camera);
  if (gq) { GL.endQuery(TQ.TIME_ELAPSED_EXT); gpuQ.push([gq, PROF.cur]); }
  if (PROF) { const c = PROF.cur, I = renderer.info; c.parts.render = performance.now() - r0; c.cpu = performance.now() - f0; c.progs = I.programs?.length || 0; c.tex = I.memory.textures; c.geo = I.memory.geometries; c.calls = I.render.calls; c.tris = I.render.triangles; PROF.frames.push(c); if (PROF.frames.length > 20000) PROF.frames.splice(0, 5000); PROF.cur = null; }
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
