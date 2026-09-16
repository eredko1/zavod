// Shared context, event bus, RNG and small utilities. Owned by: main. Do not add module-specific state here.
import * as THREE from 'three';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Bus {
  constructor() { this.map = new Map(); }
  on(name, fn) { (this.map.get(name) || this.map.set(name, []).get(name)).push(fn); return () => this.off(name, fn); }
  off(name, fn) { const l = this.map.get(name); if (l) { const i = l.indexOf(fn); if (i > -1) l.splice(i, 1); } }
  emit(name, data) { const l = this.map.get(name); if (!l) return; for (let i = 0; i < l.length; i++) { try { l[i](data); } catch (e) { console.error(`[bus:${name}]`, e); } } }
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const deg = (d) => d * Math.PI / 180;

export function createCtx() {
  const qs = new URLSearchParams(location.search);
  const qa = qs.get('qa') === '1';
  const seed = +(qs.get('seed') || 1337);
  const isTouch = qs.get('touch') === '1' || (qs.get('touch') !== '0' && (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1));
  const ctx = {
    THREE,
    qs, qa, isTouch,
    seed,
    rng: mulberry32(seed),
    bus: new Bus(),
    // filled by main
    scene: null, camera: null, renderer: null, canvas: null,
    // state machine: 'boot' | 'menu' | 'playing' | 'paused' | 'dead' | 'victory'
    state: 'boot',
    setState: null,
    time: { dt: 0, elapsed: 0, frame: 0, scale: 1 },
    perf: { fps: 60, frameMs: 16, drawCalls: 0, triangles: 0 },
    settings: {
      quality: qs.get('quality') || (isTouch ? 'medium' : 'high'), // 'ultra' costs ~3x at retina scale until post/world are optimized // 'ultra' | 'high' | 'medium' | 'low'
      fov: 75, sensitivity: 0.0022, adsSensitivityMul: 0.6,
      shadows: true, rain: qs.get('rain') === '1', // rain off by default (toggle in Settings)
      renderScale: +(qs.get('scale') || 1),
      texMax: +(qs.get('texmax') || (isTouch ? 512 : 4096)), // mobile GPUs: cap texture edge (VRAM), see assets.js fit()
      shadowMax: isTouch ? 2048 : 4096, // max device pixel ratio actually rendered (retina 2x → 4x pixels was halving fps) motionBlur: true, ssr: true, ao: true, bloom: true, dof: true, filmGrain: true,
      masterVolume: 1,
    },
    input: null,     // main
    world: null,     // world.js
    player: null,    // player.js
    weapons: null,   // weapons.js
    ai: null,        // ai.js
    post: null,      // post.js
    hud: null,       // hud.js
    audio: null,     // audio.js
    assets: null,    // assets.js
    // Physics/query shared surfaces (populated by world.js, read by everyone)
    colliders: [],       // THREE.Box3[] — static AABB colliders for player/AI/grenade collision
    raycastTargets: [],  // THREE.Object3D[] — world meshes bullets/vision rays test against (world.js pushes, ai.js pushes soldier hitboxes)
    lights: { key: null, fill: null, hemi: null, spots: [] },
  };
  return ctx;
}
