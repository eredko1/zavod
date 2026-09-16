// Audio engine: bus graph, reverb sends, voice pool, listener, ducks (tinnitus / low health / pause), ambience.
// Owned by: AUDIO agent. Built on either an AudioContext (live) or an OfflineAudioContext (qaRender).
//
//  voices ─▶ bus gains (ambience/weapons/foley/enemies/ui/music) ─▶ muffleA (tinnitus LP) ─▶ duckA (tinnitus)
//         ╰▶ reverb sends: yard IR (1.4 s) / big IR (2.6 s) ─▶ returns ─▶ muffleA …         ─▶ muffleB (health/pause LP) ─▶ duckB
//  vital bus (heartbeat, tinnitus whine) ────────────────────────────────────────────────────▶ master ─▶ limiter ─▶ soft clip ─▶ out

import { Bank, Voice, mulberry32, db, clamp } from './dsp.js';
import { SOUNDS, microVariation } from './sounds.js';
import { Ambience } from './ambience.js';

const BUS_NAMES = ['ambience', 'weapons', 'foley', 'enemies', 'ui', 'music'];
const BUS_LEVEL = { ambience: db(-6), weapons: db(0), foley: db(-2), enemies: db(-2), ui: db(-4), music: db(-3) };
const FAMILY = (name) => name.startsWith('footstep_') ? 'footstep' : name.startsWith('impact_') ? 'impact' : name;

export function createEngine(ac, { seed = 1337, quality = 'ultra', propagation = true, masterVolume = 1 } = {}) {
  const rng = mulberry32((seed ^ 0xA0D10) >>> 0);
  const bank = new Bank(ac, rng);
  // ---- master chain
  const master = ac.createGain(); master.gain.value = masterVolume;
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -7; limiter.knee.value = 5; limiter.ratio.value = 14; limiter.attack.value = 0.0015; limiter.release.value = 0.12;
  const clip = ac.createWaveShaper(); clip.oversample = '2x';
  { const N = 4097, c = new Float32Array(N); for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * 2 - 1, a = Math.abs(x); const y = a < 0.6 ? a : 0.6 + 0.375 * Math.tanh((a - 0.6) / 0.375); c[i] = Math.sign(x) * y; } clip.curve = c; }
  master.connect(limiter); limiter.connect(clip); clip.connect(ac.destination);
  // ---- duck / muffle chain (A: tinnitus, automated; B: health + pause, per-frame)
  const muffleA = ac.createBiquadFilter(); muffleA.type = 'lowpass'; muffleA.frequency.value = 20000; muffleA.Q.value = 0.5;
  const duckA = ac.createGain();
  const muffleB = ac.createBiquadFilter(); muffleB.type = 'lowpass'; muffleB.frequency.value = 20000; muffleB.Q.value = 0.5;
  const duckB = ac.createGain();
  muffleA.connect(duckA); duckA.connect(muffleB); muffleB.connect(duckB); duckB.connect(master);
  // ---- busses
  const bus = {};
  for (const n of BUS_NAMES) { const g = ac.createGain(); g.gain.value = BUS_LEVEL[n]; g.connect(muffleA); bus[n] = g; }
  const vital = ac.createGain(); vital.gain.value = db(-2); vital.connect(master); bus.vital = vital;
  // ---- reverbs (industrial yard; big for explosions/thunder/distant)
  const convYard = ac.createConvolver(); convYard.buffer = bank.ir('yard');
  const retYard = ac.createGain(); retYard.gain.value = db(-3); convYard.connect(retYard); retYard.connect(muffleA);
  const sendYard = ac.createGain(); const sendYardHp = ac.createBiquadFilter(); sendYardHp.type = 'highpass'; sendYardHp.frequency.value = 240; sendYard.connect(sendYardHp); sendYardHp.connect(convYard);
  const convBig = ac.createConvolver(); convBig.buffer = bank.ir('big');
  const retBig = ac.createGain(); retBig.gain.value = db(-6); convBig.connect(retBig); retBig.connect(muffleA);
  const sendBig = ac.createGain(); const sendBigHp = ac.createBiquadFilter(); sendBigHp.type = 'highpass'; sendBigHp.frequency.value = 120; sendBig.connect(sendBigHp); sendBigHp.connect(convBig);

  const g = { ac, bank, rng, listener: { x: 0, y: 1.7, z: 0 }, propagation, t0: 0, send: sendYard, sendBig, dest: bus.foley, quality };
  const voices = []; const lastPlay = new Map(); let hrtfCount = 0;
  const LIMIT = { rifle: 6, pistol: 6, enemy_rifle: 14, footstep: 10, impact: 12, drip: 24, explosion: 4, thunder: 2, dist_gunfire: 3, siren: 1, default: 8 };

  function play(name, o = {}) {
    const def = SOUNDS[name]; if (!def) return null;
    const t = Math.max(o.t ?? ac.currentTime + 0.005, ac.currentTime);
    // dedupe (an event AND a direct play() for the same shot within 4 ms)
    if (!o.t) { const lp = lastPlay.get(name); if (lp != null && t - lp < 0.004 && !o.position) return null; lastPlay.set(name, t); }
    // voice pool: per-family limit, steal the oldest
    const fam = FAMILY(name), lim = LIMIT[fam] ?? LIMIT.default;
    const same = voices.filter(v => v.family === fam && !v.dead);
    if (same.length >= lim) { same.sort((a, b) => a.start - b.start); same[0].release(0.012); }
    const pos = def.positional && o.position ? o.position : null;
    const hrtf = !!(pos && def.positional.hrtf && quality !== 'low' && hrtfCount < 10);
    const v = new Voice(g, {
      name, volume: (o.volume ?? 1) * db(def.trim ?? 0) * (1 + (rng() - 0.5) * 0.18), dest: bus[def.bus] || bus.foley,
      send: def.send, sendBig: def.sendBig, position: pos, hrtf, pan: o.pan,
      refDistance: def.positional?.refDistance, maxDistance: def.positional?.maxDistance, absorb: def.positional?.absorb,
    });
    v.family = fam; v.start = t; v.hrtf = hrtf; if (hrtf) hrtfCount++;
    if (pos && v.distance > (def.positional.maxDistance ?? 80) * 1.5) { v.stop(); return null; } // inaudible: skip
    const opts = { ...o, t, rng, pitch: (o.pitch ?? 1) * microVariation(rng, def.cents ?? 50) };
    if (o.pan == null && def.positional == null && o.position == null) opts.pan = undefined;
    try { def.fn(v, opts); } catch (e) { v.stop(); throw e; }
    voices.push(v);
    return v;
  }
  function sweep(now) {
    for (let i = voices.length - 1; i >= 0; i--) { const v = voices[i]; if (v.dead || v.end + 0.05 < now) { if (v.hrtf && !v.dead) hrtfCount--; v.stop(); voices.splice(i, 1); } }
  }
  function stopAll(fade = 0.03) { for (const v of voices) { if (v.hrtf && !v.dead) hrtfCount--; v.release(fade); } setTimeout(() => sweep(Infinity), (fade + 0.1) * 1000); }

  // ---- listener
  const L = ac.listener; let lpos = g.listener;
  function setListener(pos, quat) {
    if (!pos) return; lpos.x = pos.x; lpos.y = pos.y; lpos.z = pos.z;
    let fx = 0, fy = 0, fz = -1, ux = 0, uy = 1, uz = 0;
    if (quat) {
      const { x, y, z, w } = quat;
      // rotate (0,0,-1) and (0,1,0) by quaternion
      fx = -(2 * (x * z + w * y)); fy = -(2 * (y * z - w * x)); fz = -(1 - 2 * (x * x + y * y));
      ux = 2 * (x * y - w * z); uy = 1 - 2 * (x * x + z * z); uz = 2 * (y * z + w * x);
    }
    if (L.positionX) {
      L.positionX.value = pos.x; L.positionY.value = pos.y; L.positionZ.value = pos.z;
      L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz; L.upX.value = ux; L.upY.value = uy; L.upZ.value = uz;
    } else { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fx, fy, fz, ux, uy, uz); }
  }

  // ---- ambience
  const ambience = new Ambience({ ...g, dest: bus.ambience }, (n, o) => play(n, o));

  // ---- tinnitus (explosion) — automated on chain A + a whine on the vital bus
  function tinnitus(intensity, t = ac.currentTime) {
    const i = clamp(intensity, 0, 1); if (i < 0.05) return;
    const f = muffleA.frequency, d = duckA.gain;
    // let the blast's own crack through (40 ms), then slam the world down to ~600 Hz / -10 dB, hold, recover over ~2 s
    const on = t + 0.04, hold = 0.2 + 0.35 * i, rec = 0.6 + 1.2 * i;   // ~2 s total at full intensity
    const low = 20000 * Math.pow(600 / 20000, i);
    f.cancelScheduledValues(t); f.setValueAtTime(20000, on); f.exponentialRampToValueAtTime(low, on + 0.03); f.setValueAtTime(low, on + hold); f.exponentialRampToValueAtTime(20000, on + hold + rec);
    d.cancelScheduledValues(t); d.setValueAtTime(1, on); d.linearRampToValueAtTime(1 - 0.7 * i, on + 0.03); d.setValueAtTime(1 - 0.7 * i, on + hold); d.linearRampToValueAtTime(1, on + hold + rec * 0.8);
    play('tinnitus', { t: on, intensity: i, volume: i });
  }

  // ---- per-frame: health muffle + heartbeat + pause muffle
  let nextBeat = 0, muffleTarget = 20000, duckTarget = 1;
  function setMuffleB(freq, gain, now, tau = 0.08) {
    if (Math.abs(freq - muffleTarget) > 1 || Math.abs(gain - duckTarget) > 1e-3) {
      muffleTarget = freq; duckTarget = gain;
      muffleB.frequency.setTargetAtTime(freq, now, tau); duckB.gain.setTargetAtTime(gain, now, tau);
    }
  }
  function updateVitals(now, { health = 100, maxHealth = 100, playing = true, paused = false }) {
    const lowT = clamp((35 - health) / 35, 0, 1);
    let freq = 20000 * Math.pow(0.07, lowT), gain = 1 - 0.15 * lowT;
    if (paused) { freq = Math.min(freq, 900); gain = Math.min(gain, 0.55); }
    if (!playing && !paused) { freq = Math.min(freq, 3000); gain = Math.min(gain, 0.7); }
    setMuffleB(freq, gain, now, paused ? 0.15 : 0.08);
    if (lowT > 0 && playing) {
      const bpm = 68 + 48 * lowT;
      if (nextBeat < now) nextBeat = now + 0.05;
      while (nextBeat < now + 0.2) { play('heartbeat', { t: nextBeat, volume: 0.45 + 0.55 * lowT, beats: 1 }); nextBeat += 60 / bpm; }
    } else nextBeat = 0;
  }

  return {
    ac, bank, rng, g, bus, master, limiter, voices, ambience, play, sweep, stopAll, setListener, tinnitus, updateVitals,
    setVolume(name, v) { const n = name === 'master' ? master : bus[name]; if (n) n.gain.setTargetAtTime(clamp(v, 0, 2), ac.currentTime, 0.03); },
    getVolume(name) { const n = name === 'master' ? master : bus[name]; return n ? n.gain.value : 0; },
  };
}
