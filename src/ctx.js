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
  // ?mode=chill (coney): no mercs — knives, street fights, robbing / getting robbed, cops on muggings, get wasted (coney/chill.js)
  // a bare URL loads Coney chill (the one most people want, and one load instead of the menu → reload); any ?map= / ?mode= link
  // (shared rooms, the map picker, Play solo) gets exactly what it names
  if (!qs.has('map') && !qs.has('mode')) { qs.set('map', 'coney'); qs.set('mode', 'chill'); }
  const mode = qs.get('mode') === 'chill' ? 'chill' : null;
  if (mode) { qs.set('ai', '0'); qs.set('waves', '0'); }
  const qa = qs.get('qa') === '1';
  const seed = +(qs.get('seed') || 1337);
  // a VR headset's browser (Quest / Pico, or ?vr=1): the phone-weight build (a mobile GPU rendering two eyes at 72 Hz; ?low=0 lifts
  // the cap)
  const xrDevice = qs.get('vr') === '1' || (qs.get('vr') !== '0' && /OculusBrowser|Quest|Pico/i.test(navigator.userAgent || ''));
  // a headset's 2D browser page plays like a tablet (the controllers point and click the touch controls); in VR they're hidden
  const isTouch = qs.get('touch') === '1' || (qs.get('touch') !== '0' && (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1));
  // low-power laptops / desktops (integrated Intel HD/UHD, Mesa, software GL, <=4 cores or <=4 GB): the same light path as phones
  // (small textures, fewer people, no shadows, lower render scale) without the touch controls. ?low=1 forces it, ?low=0 turns it off.
  const lowPower = qs.get('low') === '1' || (qs.get('low') !== '0' && !isTouch && (xrDevice || weakGPU()));
  const lite = isTouch || lowPower; if (typeof window !== 'undefined') window.__zavodLite = lite;
  const ctx = {
    THREE,
    qs, qa, isTouch, lowPower, lite, mode, xrDevice,
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
      quality: qs.get('quality') || (isTouch ? 'medium' : lowPower ? 'low' : 'high'), // 'ultra' costs ~3x at retina scale until post/world are optimized // 'ultra' | 'high' | 'medium' | 'low'
      fov: 75, sensitivity: 0.0022, adsSensitivityMul: 0.6,
      shadows: qs.get('shadows') ? qs.get('shadows') === '1' : !lite, rain: qs.get('rain') === '1',   // phones: no shadow pass by default (it re-renders every caster) // rain off by default (toggle in Settings)
      renderScale: +(qs.get('scale') || (lowPower ? 0.75 : 1)),
      texMax: +(qs.get('texmax') || (lite ? 512 : 4096)), // mobile GPUs: cap texture edge (VRAM), see assets.js fit()
      shadowMax: lite ? 2048 : 4096, // max device pixel ratio actually rendered (retina 2x → 4x pixels was halving fps) motionBlur: true, ssr: true, ao: true, bloom: true, dof: true, filmGrain: true,
      // audio mix (persisted per device, see saveAudio): effects = weapons/enemies/UI, footsteps = the foley bus (quieter by
      // default so the radio carries), ambience; radio = coney's Luna Park Radio: 'off' | 'car' | 'always'
      ...loadAudio(),
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

function loadAudio() {
  let A = {}; try { A = JSON.parse(localStorage.getItem('zavod.audio') || '{}') || {}; } catch {}
  const n = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1.5, v)) : d);
  return { masterVolume: n(A.master, 1), sfxVolume: n(A.sfx, 1), footVolume: n(A.foot, 0.45), ambVolume: n(A.amb, 0.8), radio: ['off', 'car', 'always'].includes(A.radio) ? A.radio : 'car', radioVolume: n(A.radioVol, 0.7) };
}
export function saveAudio(S) {
  try { localStorage.setItem('zavod.audio', JSON.stringify({ master: S.masterVolume, sfx: S.sfxVolume, foot: S.footVolume, amb: S.ambVolume, radio: S.radio, radioVol: S.radioVolume })); } catch {}
}

/** integrated / software GPUs that choke on the full desktop path */
function weakGPU() {
  try {
    const mem = navigator.deviceMemory || 0, cores = navigator.hardwareConcurrency || 0;
    if ((mem && mem <= 4) || (cores && cores <= 4)) return true;
    const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl'); if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info'), r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Microsoft Basic|Intel.*(UHD|HD|Iris\(TM\) Graphics [0-9])|Mesa Intel|Mali-[GT]|Adreno \(TM\) [3-5]/i.test(r);
  } catch { return false; }
}
