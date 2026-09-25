// Procedural Web Audio: weapons, ambience, footsteps, UI. Owned by: AUDIO agent.
// Engine in src/audio/engine.js (bus graph, voice pool, listener, ducks), recipes in src/audio/sounds.js,
// ambience in src/audio/ambience.js, primitives in src/audio/dsp.js, QA analysis in src/audio/qa.js.
//
// Public API (ctx.audio): play(name, {position?, volume?, pitch?, pan?}) · setListener(pos, quat) · muted (get/set)
// setVolume(bus, v) · getVolume(bus) · reset(ctx) · qaRender(name) → {wav, stats} · qaSpectrogram(name) → PNG data URL
// In ctx.qa mode (without &audiotest=1) no AudioContext is created: play() is a silent no-op, qaRender still works (offline).

import { createEngine } from './audio/engine.js';
import { SOUNDS } from './audio/sounds.js';
import { encodeWav, analyze, spectrogramPNG } from './audio/qa.js';

let E = null;            // live engine
let silent = true;       // qa mode without audiotest
let ac = null;
let C = null;            // ctx
let footL = false;       // player footstep L/R alternation
let lastState = null;
let lastVolume = -1;
let warned = false;
const qaCache = new Map();

const warn = (e) => { if (!warned) { warned = true; console.warn('[audio]', e); } };

export async function init(ctx) {
  C = ctx;
  silent = !!(ctx.qa && ctx.qs?.get?.('audiotest') !== '1');
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!silent && AC) {
    try {
      ac = new AC({ latencyHint: 'interactive' });
      E = createEngine(ac, { seed: ctx.seed ?? 1337, quality: ctx.settings?.quality, masterVolume: ctx.settings?.masterVolume ?? 1 });
      const resume = () => { if (ac.state !== 'running') ac.resume().catch(() => { }); };
      addEventListener('pointerdown', resume, { passive: true }); addEventListener('keydown', resume); addEventListener('click', resume, { passive: true });
      if (ctx.qa) resume(); // autoplay policy disabled in the audio test harness
    } catch (e) { warn(e); E = null; silent = true; }
  }
  bind(ctx);

  const api = {
    play(name, o) { if (silent || !E) return null; try { return E.play(name, o || {}); } catch (e) { warn(e); return null; } },
    setListener(pos, quat) { if (silent || !E) return; try { E.setListener(pos, quat); } catch (e) { warn(e); } },
    setVolume(bus, v) { if (E) E.setVolume(bus, v); },
    getVolume(bus) { return E ? E.getVolume(bus) : 0; },
    get muted() { return E ? E.master.gain.value === 0 : true; },
    set muted(m) { if (E) E.setVolume('master', m ? 0 : (ctx.settings?.masterVolume ?? 1)); },
    get context() { return ac; },
    get engine() { return E; },
    sounds: Object.keys(SOUNDS),
    tinnitus(i) { if (E) E.tinnitus(i); },
    qaRender, qaSpectrogram,
  };
  return api;
}

// ------------------------------------------------------------------ event bindings
function bind(ctx) {
  const bus = ctx.bus; if (!bus?.on) return;
  const P = (n, o) => { if (!silent && E) { try { E.play(n, o || {}); } catch (e) { warn(e); } } };
  const surf = (s) => (['concrete', 'metal', 'wood', 'water', 'ground', 'flesh'].includes(s) ? s : 'concrete');
  bus.on('shot', (d = {}) => {
    if (d.who === 'enemy') { P('enemy_rifle', { position: d.origin || d.position }); return; }
    const w = d.weapon; const name = typeof w === 'string' ? w : (w?.name ?? w?.type ?? '');
    P(/pistol|m1911|1911|9mm|glock|handgun|sidearm/i.test(name) || w?.slot === 2 ? 'pistol' : 'rifle');
  });
  bus.on('impact', (d = {}) => P('impact_' + surf(d.surface), { position: d.point }));
  bus.on('hit', (d = {}) => P('hitmarker', { headshot: !!d.headshot }));
  bus.on('enemyKilled', () => P('kill'));
  bus.on('playerDamaged', (d = {}) => P('hurt', { volume: Math.min(1.3, 0.55 + (d.amount ?? 20) / 45) }));
  bus.on('playerDied', () => { P('stinger_death'); });
  bus.on('victory', () => P('stinger_victory'));
  bus.on('wave', () => P('stinger_wave'));
  bus.on('explosion', (d = {}) => {
    P('explosion', { position: d.position });
    if (E && d.position) {
      const L = E.g.listener, dx = d.position.x - L.x, dy = d.position.y - L.y, dz = d.position.z - L.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz), r = (d.radius ?? 5) * 2.5 + 8;
      E.tinnitus(1 - dist / r);
    } else if (E) E.tinnitus(0.6);
  });
  bus.on('footstep', (d = {}) => {
    const name = 'footstep_' + surf(d.surface);
    if (!d.who || d.who === 'player') { footL = !footL; P(name, { sprint: !!d.sprint, pan: footL ? -0.22 : 0.22, volume: d.sprint ? 1 : 0.85 }); }
    else P(name, { position: d.position, sprint: !!d.sprint, volume: 0.7 });
  });
  bus.on('reload', (d = {}) => { const m = { magOut: 'reload_out', magIn: 'reload_in', end: 'reload_end' }[d.stage]; if (m) P(m); });
  bus.on('ads', (d = {}) => P('ads', { on: d.on !== false }));
  bus.on('grenade', (d = {}) => { const m = { pin: 'grenade_pin', throw: 'grenade_throw', bounce: 'grenade_bounce' }[d.stage]; if (m) P(m, { position: d.position }); });
  bus.on('swap', () => P('swap'));
  bus.on('dryfire', () => P('dryfire'));
  bus.on('state', ({ state }) => applyState(state));
  bus.on('restart', () => reset(ctx));
}

function applyState(state) {
  if (silent || !E) return;
  const first = lastState === null; lastState = state;
  if (ac.state !== 'running') ac.resume().catch(() => { });
  if (state === 'playing') { E.ambience.start(); E.ambience.fade(1, first ? 2.5 : 1.2); }
  else if (state === 'menu' || state === 'boot') E.ambience.fade(0, 1.5);
  else E.ambience.fade(0.6, 1.0);   // paused / dead / victory: ambience stays under the muffle
}

// ------------------------------------------------------------------ per-frame
const _v = { x: 0, y: 0, z: 0 }, _q = { x: 0, y: 0, z: 0, w: 1 };
export function update(dt, ctx) {
  if (silent || !E) return;
  try {
    const now = ac.currentTime;
    if (ctx.state !== lastState) applyState(ctx.state);
    // listener from camera
    const cam = ctx.camera;
    if (cam) {
      if (cam.matrixWorld && cam.getWorldPosition && ctx.THREE) {
        if (!update._p) { update._p = new ctx.THREE.Vector3(); update._q = new ctx.THREE.Quaternion(); }
        cam.getWorldPosition(update._p); cam.getWorldQuaternion(update._q);
        E.setListener(update._p, update._q);
      } else if (cam.position) {
        _v.x = cam.position.x; _v.y = cam.position.y; _v.z = cam.position.z;
        const q = cam.quaternion || _q; E.setListener(_v, q);
      }
    }
    if ((ctx.time?.frame ?? 0) % 6 === 0) E.sweep(now);
    // rain toggle: mute the rain bed and its drips when settings.rain is off (wind/hum/thunder stay)
    const rainOn = ctx.settings?.rain !== false; if (rainOn !== update._rainOn) { update._rainOn = rainOn; try { E.ambience.rain.gain.setTargetAtTime(rainOn ? 1 : 0, now, 0.25); } catch (e) {} }
    E.ambience.rainOff = !rainOn;
    // per-map ambience hints: dry day maps get no storm; interiors get no wind (proper day/interior beds are a later block)
    const amb = ctx.world?.ambience || 'rain-industrial'; if (amb !== update._amb) { update._amb = amb; const indoor = /terminal/.test(amb), dry = amb !== 'rain-industrial'; E.ambience.indoor = indoor; if (dry) { try { E.ambience.rain.gain.setTargetAtTime(0, now, 0.2); } catch (e) {} E.ambience.rainOff = true; } try { E.ambience.wind.gain.setTargetAtTime(indoor ? 0.05 : 1, now, 0.3); } catch (e) {} }
    E.ambience.schedule(now + 0.8);
    const p = ctx.player;
    E.updateVitals(now, { health: p?.health ?? 100, maxHealth: p?.maxHealth ?? 100, playing: ctx.state === 'playing', paused: ctx.state === 'paused' });
    const mv = ctx.settings?.masterVolume ?? 1;
    if (mv !== lastVolume) { lastVolume = mv; E.setVolume('master', mv); }
    // the mix sliders: effects (weapons / enemies / UI), footsteps (foley), ambience — relative to each bus's base level
    const S = ctx.settings || {}, key = `${S.sfxVolume}|${S.footVolume}|${S.ambVolume}`;
    if (key !== update._mix) { update._mix = key; const fx = S.sfxVolume ?? 1;
      E.setVolume('weapons', fx); E.setVolume('enemies', 0.79 * fx); E.setVolume('ui', 0.63 * fx); E.setVolume('foley', 0.79 * (S.footVolume ?? 0.45)); E.setVolume('ambience', 0.5 * (S.ambVolume ?? 0.8)); }
  } catch (e) { warn(e); }
}

export function reset(ctx) {
  if (silent || !E) return;
  try { E.stopAll(0.04); E.updateVitals(ac.currentTime, { health: 100, playing: true }); } catch (e) { warn(e); }
}

// ------------------------------------------------------------------ QA: offline render + analysis
const SCENES = {
  ambience: { dur: 8, steady: true, run: (e, t) => { e.ambience.start(0); e.ambience.out.gain.setValueAtTime(0, 0); e.ambience.out.gain.linearRampToValueAtTime(1, 0.15); e.ambience.schedule(8, { noEvents: true }); } },
  rain: { dur: 6, steady: true, run: (e) => { e.ambience.start(0); e.ambience.out.gain.setValueAtTime(0, 0); e.ambience.out.gain.linearRampToValueAtTime(1, 0.15); e.ambience.wind.gain.value = 0; e.ambience.hum.gain.value = 0; e.ambience.schedule(6, { noEvents: true }); } },
  wind: { dur: 8, steady: true, run: (e) => { e.ambience.start(0); e.ambience.out.gain.setValueAtTime(0, 0); e.ambience.out.gain.linearRampToValueAtTime(1, 0.15); e.ambience.rain.gain.value = 0; e.ambience.hum.gain.value = 0; e.ambience.gust(1.5, 1.2); } },
  hum: { dur: 4, steady: true, run: (e) => { e.ambience.start(0); e.ambience.out.gain.setValueAtTime(0, 0); e.ambience.out.gain.linearRampToValueAtTime(1, 0.15); e.ambience.rain.gain.value = 0; e.ambience.wind.gain.value = 0; } },
  rifle_burst: { dur: 2.4, run: (e, t) => { for (let i = 0; i < 8; i++) e.play('rifle', { t: t + i * 0.08 }); } },
  enemy_rifle_far: { dur: 2.2, run: (e, t) => { e.setListener({ x: 0, y: 1.7, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }); e.play('enemy_rifle', { t, position: { x: 28, y: 1.5, z: -28 } }); } },
  enemy_rifle_near: { dur: 1.8, run: (e, t) => { e.setListener({ x: 0, y: 1.7, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }); e.play('enemy_rifle', { t, position: { x: -5, y: 1.5, z: -3 } }); } },
  explosion_tinnitus: { dur: 4, run: (e, t) => { e.setListener({ x: 0, y: 1.7, z: 0 }); e.play('explosion', { t, position: { x: 3, y: 0, z: -4 } }); e.tinnitus(1, t); e.play('rifle', { t: t + 0.9 }); e.play('rifle', { t: t + 2.6 }); } },
  low_health: { dur: 4, run: (e, t) => { e.updateVitals(0, { health: 10, playing: true }); for (let i = 0; i < 4; i++) e.play('heartbeat', { t: t + i * 0.6, volume: 1 }); e.play('rifle', { t: t + 1.0 }); } },
  reload_seq: { dur: 2.4, run: (e, t) => { e.play('reload_out', { t }); e.play('reload_in', { t: t + 0.9 }); e.play('reload_end', { t: t + 1.6 }); } },
  footsteps_walk: { dur: 3, run: (e, t) => { for (let i = 0; i < 5; i++) e.play('footstep_concrete', { t: t + i * 0.55, pan: i % 2 ? 0.22 : -0.22 }); } },
};

async function renderOffline(name, opts = {}) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const def = SOUNDS[name], scene = SCENES[name];
  if (!def && !scene) throw new Error(`unknown sound ${name}`);
  const sr = 48000, dur = opts.dur ?? scene?.dur ?? def.render ?? 1.5;
  const off = new OAC(2, Math.ceil(sr * dur), sr);
  const e = createEngine(off, { seed: (C?.seed ?? 1337) + (opts.seed ?? 0), quality: 'ultra', masterVolume: 1 });
  const t0 = 0.05;
  if (scene) scene.run(e, t0); else e.play(name, { t: t0, ...opts });
  const buf = await off.startRendering();
  const stats = analyze(buf, { steady: !!scene?.steady });
  return { buf, stats };
}

export async function qaRender(name, opts = {}) {
  const r = await renderOffline(name, opts);
  const out = { name, wav: encodeWav(r.buf), stats: r.stats };
  qaCache.set(name, { buf: r.buf, stats: r.stats });
  return out;
}
export async function qaSpectrogram(name, opts = {}) {
  let c = qaCache.get(name);
  if (!c) { const r = await renderOffline(name, opts); c = { buf: r.buf, stats: r.stats }; qaCache.set(name, c); }
  return spectrogramPNG(c.buf, name, c.stats);
}
export const qaSounds = () => [...Object.keys(SOUNDS), ...Object.keys(SCENES)];
