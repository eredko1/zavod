// Audio DSP primitives: seeded RNG, noise/IR buffer generation, envelopes, Voice (node-graph builder).
// Owned by: AUDIO agent. Works identically on AudioContext and OfflineAudioContext.

export const db = (d) => Math.pow(10, d / 20);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

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

// ---------------------------------------------------------------- buffers
export function noiseBuffer(ac, seconds, kind, rng, channels = 1) {
  const sr = ac.sampleRate, n = Math.max(1, Math.floor(seconds * sr));
  const buf = ac.createBuffer(channels, n, sr);
  for (let c = 0; c < channels; c++) {
    const d = buf.getChannelData(c);
    if (kind === 'pink') {
      // Paul Kellet's refined pink filter
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < n; i++) {
        const w = rng() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
    } else if (kind === 'brown') {
      let y = 0;
      for (let i = 0; i < n; i++) { y = (y + 0.02 * (rng() * 2 - 1)) / 1.02; d[i] = y * 3.5; }
    } else if (kind === 'crackle') {
      // sparse impulsive noise (debris / spark bed)
      for (let i = 0; i < n; i++) { const r = rng(); d[i] = r < 0.004 ? (rng() * 2 - 1) : 0; }
    } else {
      for (let i = 0; i < n; i++) d[i] = rng() * 2 - 1;
    }
    // normalize to peak .95 (no DC — noise sources are zero-mean; remove any residual)
    let mean = 0; for (let i = 0; i < n; i++) mean += d[i]; mean /= n;
    let pk = 1e-9; for (let i = 0; i < n; i++) { d[i] -= mean; const a = Math.abs(d[i]); if (a > pk) pk = a; }
    const s = 0.95 / pk; for (let i = 0; i < n; i++) d[i] *= s;
    // seamless loop: short crossfade at the tail
    const xf = Math.min(2048, n >> 3);
    for (let i = 0; i < xf; i++) { const t = i / xf; d[n - xf + i] = d[n - xf + i] * (1 - t) + d[i] * t; }
  }
  return buf;
}

// Impulse response of a large open industrial yard at night: sparse early reflections off containers
// and warehouse walls, a metallic flutter echo between container rows, and a diffuse tail whose high
// frequencies die faster than lows (air absorption). Stereo, decorrelated.
export function yardIR(ac, rng, { duration = 1.4, tau = 0.22, flutter = true, size = 1 } = {}) {
  const sr = ac.sampleRate, n = Math.floor(duration * sr);
  const buf = ac.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    // late diffuse tail
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const x = rng() * 2 - 1;
      const fc = 7000 * Math.exp(-t * 1.8) + 900;
      const a = 1 - Math.exp(-2 * Math.PI * fc / sr);
      lp += a * (x - lp);
      const e = Math.exp(-t / tau) * (t < 0.02 ? t / 0.02 : 1);
      d[i] = lp * e * 0.45;
    }
    // early reflections: diffuse bursts
    const taps = 10;
    for (let k = 0; k < taps; k++) {
      const t = (0.006 + rng() * 0.085) * size;
      const g = (0.9 - t * 5) * (0.6 + rng() * 0.4);
      const len = Math.floor(sr * (0.0015 + rng() * 0.004));
      const start = Math.floor(t * sr);
      for (let j = 0; j < len && start + j < n; j++) d[start + j] += (rng() * 2 - 1) * g * Math.exp(-j / len * 3.5);
    }
    // flutter echo (container rows ~ 15 m apart => ~45 ms period), decaying
    if (flutter) {
      const per = Math.floor(sr * (0.042 + rng() * 0.008) * size);
      for (let m = 1; m <= 14; m++) {
        const start = m * per + Math.floor(rng() * 40);
        const g = 0.3 * Math.pow(0.72, m);
        const len = Math.floor(sr * 0.0025);
        let f = 0;
        for (let j = 0; j < len && start + j < n; j++) { f += 0.35 * ((rng() * 2 - 1) - f); d[start + j] += f * g * Math.exp(-j / len * 3); }
      }
    }
    // remove DC, normalize
    let mean = 0; for (let i = 0; i < n; i++) mean += d[i]; mean /= n;
    let pk = 1e-9; for (let i = 0; i < n; i++) { d[i] -= mean; const a = Math.abs(d[i]); if (a > pk) pk = a; }
    const s = 0.9 / pk; for (let i = 0; i < n; i++) d[i] *= s;
  }
  return buf;
}

// Per-context cache of shared buffers.
export class Bank {
  constructor(ac, rng) { this.ac = ac; this.rng = rng; this.cache = new Map(); }
  noise(kind = 'white', seconds = 2) {
    const k = `${kind}:${seconds}`;
    if (!this.cache.has(k)) this.cache.set(k, noiseBuffer(this.ac, seconds, kind, this.rng));
    return this.cache.get(k);
  }
  ir(kind = 'yard') {
    const k = `ir:${kind}`;
    if (!this.cache.has(k)) {
      const opts = kind === 'big' ? { duration: 2.6, tau: 0.5, size: 1.6 } : kind === 'small' ? { duration: 0.5, tau: 0.07, flutter: false, size: 0.4 } : {};
      this.cache.set(k, yardIR(this.ac, this.rng, opts));
    }
    return this.cache.get(k);
  }
}

// ---------------------------------------------------------------- Voice
// One playing sound instance: a private gain -> (panner) -> bus, plus an optional reverb send.
// Primitives schedule sources with absolute context times and register them for stop().
export class Voice {
  constructor(g, o = {}) {
    const ac = g.ac; this.g = g; this.ac = ac; this.rng = g.rng;
    this.nodes = []; this.end = 0; this.dead = false; this.name = o.name || '';
    this.out = ac.createGain(); this.out.gain.value = o.volume ?? 1;
    let tail = this.out;
    this.distance = 0;
    if (o.position && g.listener) {
      const L = g.listener;
      const dx = o.position.x - L.x, dy = o.position.y - L.y, dz = o.position.z - L.z;
      this.distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      // air absorption (far shots lose crack, keep boom)
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
      lp.frequency.value = clamp(20000 * Math.exp(-this.distance / (o.absorb ?? 32)), 700, 20000);
      const p = ac.createPanner();
      p.panningModel = o.hrtf ? 'HRTF' : 'equalpower';
      p.distanceModel = 'inverse'; p.refDistance = o.refDistance ?? 6; p.maxDistance = o.maxDistance ?? 80; p.rolloffFactor = o.rolloff ?? 1;
      if (p.positionX) { p.positionX.value = o.position.x; p.positionY.value = o.position.y; p.positionZ.value = o.position.z; }
      else p.setPosition(o.position.x, o.position.y, o.position.z);
      tail.connect(lp); lp.connect(p); tail = p; this.panner = p;
    } else if (o.pan) {
      const sp = ac.createStereoPanner ? ac.createStereoPanner() : null;
      if (sp) { sp.pan.value = clamp(o.pan, -1, 1); tail.connect(sp); tail = sp; }
    }
    this.tail = tail;
    tail.connect(o.dest || g.dest);
    if ((o.send ?? 0) > 0 && g.send) {
      const s = ac.createGain(); s.gain.value = o.send; tail.connect(s); s.connect(g.send); this.sendNode = s;
    }
    if ((o.sendBig ?? 0) > 0 && g.sendBig) {
      const s = ac.createGain(); s.gain.value = o.sendBig; tail.connect(s); s.connect(g.sendBig); this.sendBigNode = s;
    }
  }
  // distance-based propagation delay (s)
  get delay() { return this.g.propagation ? Math.min(0.25, this.distance / 343) : 0; }
  _track(src, t, dur) { this.nodes.push(src); if (t + dur > this.end) this.end = t + dur; }
  // exponential-ish decay envelope on a gain param
  _env(p, t, { attack = 0.001, peak = 1, hold = 0, decay = 0.02, dur }) {
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + attack);
    if (hold > 0) p.setValueAtTime(peak, t + attack + hold);
    p.setTargetAtTime(0, t + attack + hold, decay);
    const natural = attack + hold + decay * 7; // -60 dB
    const total = dur ?? natural;
    if (total < natural - 0.002) {
      // explicit early cut: hold the current value then ramp to 0 over 5 ms (no click)
      try { p.cancelAndHoldAtTime(t + total - 0.005); p.linearRampToValueAtTime(0, t + total); } catch { }
    }
    return total;
  }
  _chain(src, o, t, total) {
    let n = src;
    const mk = (type, f, q, gain) => { const b = this.ac.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; if (gain != null) b.gain.value = gain; n.connect(b); n = b; return b; };
    if (o.hp) mk('highpass', o.hp, o.hpq ?? 0.7);
    if (o.lp) { const b = mk('lowpass', o.lp, o.lpq ?? 0.7); if (o.lpTo) { b.frequency.setValueAtTime(o.lp, t); b.frequency.exponentialRampToValueAtTime(Math.max(20, o.lpTo), t + (o.lpTime ?? total)); } }
    if (o.bp) mk('bandpass', o.bp, o.bpq ?? 1);
    if (o.bp2) mk('bandpass', o.bp2, o.bp2q ?? 1);
    if (o.peak) mk('peaking', o.peak, o.peakq ?? 1, o.peakGain ?? 6);
    if (o.shelf) mk('highshelf', o.shelf, undefined, o.shelfGain ?? -6);
    return n;
  }
  // post stage: tremolo LFO + stereo pan
  _post(g, o, t, total) {
    const ac = this.ac; let n = g;
    if (o.trem) {
      const tg = ac.createGain(); tg.gain.value = 1 - (o.trem.depth ?? 0.5);
      const l = ac.createOscillator(); l.type = o.trem.type || 'sine'; l.frequency.value = o.trem.rate || 8;
      const lg = ac.createGain(); lg.gain.value = (o.trem.depth ?? 0.5);
      l.connect(lg); lg.connect(tg.gain); l.start(t); l.stop(t + total + 0.02); this._track(l, t, total);
      n.connect(tg); n = tg;
    }
    if (o.pan != null && ac.createStereoPanner) { const sp = ac.createStereoPanner(); sp.pan.value = clamp(o.pan, -1, 1); n.connect(sp); n = sp; }
    return n;
  }
  // noise burst
  noise(o) {
    const ac = this.ac, t = (o.t ?? this.g.t0) + this.delay;
    const src = ac.createBufferSource();
    src.buffer = this.g.bank.noise(o.kind || 'white', o.len || 2);
    src.loop = true; src.loopStart = 0; src.loopEnd = src.buffer.duration;
    if (o.rate) src.playbackRate.value = o.rate;
    const g = ac.createGain();
    const total = this._env(g.gain, t, o);
    const last = this._chain(src, o, t, total);
    last.connect(g);
    this._post(g, o, t, total).connect(o.dest || this.out);
    const off = this.rng() * (src.buffer.duration - 0.5);
    src.start(t, off); src.stop(t + total + 0.01);
    this._track(src, t, total + 0.01);
    return g;
  }
  // oscillator with optional pitch sweep
  osc(o) {
    const ac = this.ac, t = (o.t ?? this.g.t0) + this.delay;
    const src = ac.createOscillator(); src.type = o.type || 'sine';
    const f0 = Math.max(1, o.f0 ?? o.f ?? 440), f1 = o.f1 != null ? Math.max(1, o.f1) : null;
    src.frequency.setValueAtTime(f0, t);
    if (f1 != null) {
      if (o.sweepTau) src.frequency.setTargetAtTime(f1, t, o.sweepTau);
      else src.frequency.exponentialRampToValueAtTime(f1, t + (o.sweep ?? 0.05));
    }
    if (o.detune) src.detune.value = o.detune;
    const g = ac.createGain();
    const total = this._env(g.gain, t, o);
    const last = this._chain(src, o, t, total);
    last.connect(g);
    this._post(g, o, t, total).connect(o.dest || this.out);
    if (o.vibrato) { // vibrato/tremolo LFO on frequency
      const l = ac.createOscillator(); l.frequency.value = o.vibrato.rate || 6; const lg = ac.createGain(); lg.gain.value = o.vibrato.depth || 10;
      l.connect(lg); lg.connect(src.detune); l.start(t); l.stop(t + total + 0.01); this._track(l, t, total);
    }
    src.start(t); src.stop(t + total + 0.01);
    this._track(src, t, total + 0.01);
    return g;
  }
  // a short one-pole-ish resonant "ring": several decaying partials (metal taps, clacks)
  partials(o) {
    const base = o.f || 440, n = o.partials || [1, 1.5, 2.3, 3.7], gains = o.gains || [1, 0.6, 0.4, 0.25];
    for (let i = 0; i < n.length; i++) {
      this.osc({ ...o, type: o.type || 'sine', f0: base * n[i] * (1 + (this.rng() - 0.5) * (o.spread ?? 0.02)), f1: null, peak: (o.peak ?? 1) * gains[i], decay: (o.decay ?? 0.08) * (o.decayScale ? o.decayScale[i] ?? 1 : 1 / (1 + i * 0.4)) });
    }
  }
  // a group of tiny noise ticks spread in time (sparks, debris, crackle)
  ticks(o) {
    const n = o.count || 6, span = o.span || 0.1, t = o.t ?? this.g.t0;
    for (let i = 0; i < n; i++) {
      const r = this.rng();
      this.noise({ ...o, t: t + (o.spread === 'front' ? span * r * r : span * r), peak: (o.peak ?? 1) * (0.4 + 0.6 * this.rng()), decay: (o.decay ?? 0.003) * (0.6 + 0.8 * this.rng()), attack: 0.0005, bp: o.bp ? o.bp * (0.8 + 0.4 * this.rng()) : undefined, pan: o.panSpread ? (this.rng() - 0.5) * o.panSpread : o.pan });
    }
  }
  stop() {
    if (this.dead) return; this.dead = true;
    for (const n of this.nodes) { try { n.stop(); } catch { } }
    try { this.out.disconnect(); } catch { }
    try { this.tail.disconnect(); } catch { }
    if (this.sendNode) try { this.sendNode.disconnect(); } catch { }
    if (this.sendBigNode) try { this.sendBigNode.disconnect(); } catch { }
  }
  // fade out then stop (for sustained voices)
  release(time = 0.05) {
    if (this.dead) return; const t = this.ac.currentTime;
    this.out.gain.cancelScheduledValues(t); this.out.gain.setValueAtTime(this.out.gain.value, t); this.out.gain.linearRampToValueAtTime(0, t + time);
    this.end = Math.min(this.end, t + time + 0.02);
    for (const n of this.nodes) { try { n.stop(t + time + 0.02); } catch { } }
  }
}
