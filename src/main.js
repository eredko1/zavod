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

const ctx = createCtx();
window.__ctx = ctx;

// ---------- renderer / scene / camera ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, depth: true, logarithmicDepthBuffer: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
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
  // edge-triggered action flags, consumed by player/weapons each frame via consume()
  pressed: new Set(),
  down(code) { return this.keys.has(code); },
  consume(code) { const h = this.pressed.has(code); this.pressed.delete(code); return h; },
  // named actions
  get fire() { return (this.mouse.buttons & 1) !== 0; },
  get ads() { return (this.mouse.buttons & 2) !== 0; },
  get forward() { return this.down('KeyW') || this.down('ArrowUp'); },
  get back() { return this.down('KeyS') || this.down('ArrowDown'); },
  get left() { return this.down('KeyA') || this.down('ArrowLeft'); },
  get right() { return this.down('KeyD') || this.down('ArrowRight'); },
  get sprint() { return this.down('ShiftLeft') || this.down('ShiftRight'); },
  get crouch() { return this.down('KeyC') || this.down('ControlLeft'); },
  get jump() { return this.down('Space'); },
};
ctx.input = input;
addEventListener('keydown', e => { if (e.repeat) return; input.keys.add(e.code); input.pressed.add(e.code); if (['Space', 'Tab'].includes(e.code)) e.preventDefault(); });
addEventListener('keyup', e => input.keys.delete(e.code));
addEventListener('blur', () => { input.keys.clear(); input.mouse.buttons = 0; });
addEventListener('mousemove', e => { if (!input.locked && !ctx.qa) return; input.mouse.dx += e.movementX; input.mouse.dy += e.movementY; });
addEventListener('mousedown', e => { if (input.locked) { input.mouse.buttons |= (1 << e.button); if (e.button === 0) input.pressed.add('Mouse0'); if (e.button === 2) input.pressed.add('Mouse2'); } });
addEventListener('mouseup', e => { input.mouse.buttons &= ~(1 << e.button); });
addEventListener('wheel', e => { input.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('pointerlockchange', () => { input.locked = document.pointerLockElement === renderer.domElement; ctx.bus.emit('pointerlock', input.locked); if (!input.locked && ctx.state === 'playing') setState('paused'); });
ctx.requestPointerLock = () => { try { renderer.domElement.requestPointerLock({ unadjustedMovement: true }); } catch { renderer.domElement.requestPointerLock(); } };

// ---------- state ----------
function setState(s) {
  const prev = ctx.state; if (prev === s) return;
  ctx.state = s; ctx.bus.emit('state', { state: s, prev });
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

const MODULES = [['assets', assets], ['world', world], ['player', player], ['weapons', weapons], ['ai', ai], ['audio', audio], ['post', post], ['hud', hud]];
const UPDATE_ORDER = ['player', 'weapons', 'ai', 'world', 'audio', 'hud']; // post.render() runs last
const mods = Object.fromEntries(MODULES);

async function boot() {
  let i = 0;
  for (const [name, mod] of MODULES) {
    ctx.progress(i / MODULES.length, `initializing ${name}`);
    try { const api = await mod.init(ctx); if (api) ctx[name] = api; }
    catch (e) { console.error(`[boot] ${name} failed`, e); ctx.bootErrors = (ctx.bootErrors || []).concat(`${name}: ${e.message}`); }
    i++;
  }
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
