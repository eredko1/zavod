// Living rainy-industrial ambience. Owned by: AUDIO agent.
// Continuous layers: rain bed (pink noise through 3 bands + slow LFOs), rain-on-metal resonance,
// wind (LFO-modulated low-passed noise with random-walk cutoff + gusts), industrial hum (50 Hz mains + harmonics,
// with a beating second unit and a faint transformer buzz). Discrete events scheduled with a lookahead clock:
// drips (metal clicks / puddle plinks), thunder every 25-70 s, distant gunfire bursts, a rare far siren.
// Works on OfflineAudioContext too: start(t) then schedule(untilTime).

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Ambience {
  constructor(g, play) {
    this.g = g; this.ac = g.ac; this.rng = g.rng; this.play = play;
    const ac = this.ac;
    this.out = ac.createGain(); this.out.gain.value = 0; this.out.connect(g.dest);
    this.nodes = []; this.started = false; this.level = 0;
    this.build();
  }
  _src(kind, len) {
    const s = this.ac.createBufferSource(); s.buffer = this.g.bank.noise(kind, len); s.loop = true; this.nodes.push(s); return s;
  }
  _lfo(rate, depth, target, offset = 0, type = 'sine') {
    const ac = this.ac; const l = ac.createOscillator(); l.type = type; l.frequency.value = rate;
    const lg = ac.createGain(); lg.gain.value = depth; l.connect(lg); lg.connect(target);
    if (offset) { const c = ac.createConstantSource(); c.offset.value = offset; c.connect(target); this.nodes.push(c); }
    this.nodes.push(l); return l;
  }
  _filt(type, f, q, gain) { const b = this.ac.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; if (gain != null) b.gain.value = gain; return b; }
  _gain(v) { const g = this.ac.createGain(); g.gain.value = v; return g; }
  build() {
    const ac = this.ac, rng = this.rng;
    // ---- rain bed
    this.rain = this._gain(1); this.rain.connect(this.out);
    const rainHiss = this._src('pink', 7.3);                // hiss band (the "sheet" of rain)
    const hb = this._filt('bandpass', 3200, 0.3); const hg = this._gain(0.095);
    rainHiss.connect(hb); hb.connect(hg); hg.connect(this.rain);
    this._lfo(0.07, 0.03, hg.gain); this._lfo(0.31, 0.015, hg.gain);
    const rainBody = this._src('pink', 5.9);                // body / roar of rain on asphalt
    const bb = this._filt('bandpass', 700, 0.6); const bg = this._gain(0.045);
    rainBody.connect(bb); bb.connect(bg); bg.connect(this.rain);
    this._lfo(0.05, 0.02, bg.gain);
    const rainSizzle = this._src('white', 4.7);             // high sizzle, gust-driven sheets
    const sb = this._filt('highpass', 6000, 0.7); const sg = this._gain(0.056);
    rainSizzle.connect(sb); sb.connect(sg); sg.connect(this.rain);
    this._lfo(0.19, 0.014, sg.gain); this._lfo(0.023, 0.011, sg.gain);
    const rainMetal = this._src('pink', 3.1);               // rain drumming on container roofs (resonant)
    const mb = this._filt('bandpass', 1450, 3.5); const mb2 = this._filt('bandpass', 2300, 4); const mg = this._gain(0.02), mg2 = this._gain(0.014);
    rainMetal.connect(mb); mb.connect(mg); mg.connect(this.rain); rainMetal.connect(mb2); mb2.connect(mg2); mg2.connect(this.rain);
    this._lfo(0.9, 0.01, mg.gain); this._lfo(1.3, 0.007, mg2.gain);
    // ---- wind
    this.wind = this._gain(1); this.wind.connect(this.out);
    const windSrc = this._src('white', 6.1);
    this.windLp = this._filt('lowpass', 320, 1.3); this.windGain = this._gain(0.064);
    windSrc.connect(this.windLp); this.windLp.connect(this.windGain); this.windGain.connect(this.wind);
    this._lfo(0.06, 120, this.windLp.frequency); this._lfo(0.017, 90, this.windLp.frequency, 0, 'triangle');
    this._lfo(0.09, 0.02, this.windGain.gain); this._lfo(0.21, 0.01, this.windGain.gain);
    const windWhistle = this._filt('bandpass', 1900, 12); const wwg = this._gain(0.006);   // whistle through fence/cables
    windSrc.connect(windWhistle); windWhistle.connect(wwg); wwg.connect(this.wind);
    this._lfo(0.13, 0.005, wwg.gain); this._lfo(0.05, 400, windWhistle.frequency);
    // ---- industrial hum (50 Hz mains; Eastern-European grid)
    this.hum = this._gain(1); this.hum.connect(this.out);
    for (const [f, g, type] of [[50, 0.0036, 'sine'], [100, 0.0027, 'sine'], [150, 0.0012, 'sine'], [50.3, 0.0018, 'sine'], [100, 0.0015, 'square']]) {
      const o = ac.createOscillator(); o.type = type; o.frequency.value = f; const og = this._gain(g);
      if (type === 'square') { const lp = this._filt('lowpass', 700, 0.8); o.connect(lp); lp.connect(og); } else o.connect(og);
      og.connect(this.hum); this.nodes.push(o);
    }
    const humLfo = this._gain(1); this.hum.disconnect(); this.hum.connect(humLfo); humLfo.connect(this.out);
    this._lfo(0.11, 0.25, humLfo.gain);
    // machinery: a slow ventilation fan pulse (low thump 1.4 Hz) far away
    const fan = this._src('brown', 3.7); const fanLp = this._filt('lowpass', 140, 1); const fanG = this._gain(0.018);
    fan.connect(fanLp); fanLp.connect(fanG); fanG.connect(this.out);
    this._lfo(1.45, 0.015, fanG.gain);
    // scheduler
    this.next = { drip: 0, thunder: 0, gunfire: 0, siren: 0, gust: 0 };
  }
  start(t = this.ac.currentTime) {
    if (this.started) return; this.started = true; this.t0 = t;
    for (const n of this.nodes) { try { n.start(t); } catch { } }
    const r = this.rng;
    this.next.drip = t + 0.2; this.next.thunder = t + 8 + r() * 20; this.next.gunfire = t + 6 + r() * 12; this.next.siren = t + 45 + r() * 90; this.next.gust = t + 3 + r() * 6;
  }
  // schedule discrete events up to `until` (absolute context time)
  schedule(until, opts = {}) {
    if (!this.started) return;
    const r = this.rng, nx = this.next;
    while (nx.drip < until) {
      if (!this.rainOff) this.play('drip', { t: nx.drip, volume: 0.5 + r() * 0.6 });
      nx.drip += -Math.log(1 - r()) * 0.42 + 0.03;                           // exponential inter-arrival, mean ~0.45 s
    }
    if (!opts.noEvents) {
      while (nx.thunder < until) { this.play('thunder', { t: nx.thunder, near: r(), pan: r() * 1.4 - 0.7 }); nx.thunder += 25 + r() * 45; }
      while (nx.gunfire < until) { this.play('dist_gunfire', { t: nx.gunfire, pan: r() * 1.8 - 0.9, volume: 0.5 + r() * 0.5 }); nx.gunfire += 8 + r() * 18; }
      while (nx.siren < until) { this.play('siren', { t: nx.siren, len: 6 + r() * 8, pan: r() * 1.8 - 0.9 }); nx.siren += 120 + r() * 200; }
    }
    while (nx.gust < until) { this.gust(nx.gust, 0.5 + r()); nx.gust += 5 + r() * 12; }
  }
  gust(t, strength) {
    const g = this.windGain.gain, f = this.windLp.frequency, r = this.rng;
    const rise = 0.8 + r() * 1.2, fall = 1.5 + r() * 2;
    g.setTargetAtTime(0.064 + 0.09 * strength, t, rise / 3); g.setTargetAtTime(0.064, t + rise, fall / 3);
    f.setTargetAtTime(320 + 500 * strength, t, rise / 3); f.setTargetAtTime(320, t + rise + 0.3, fall / 3);
  }
  // level 0..1 crossfade (menu → 0, playing → 1)
  fade(level, time = 1.5) {
    if (level === this.level) return; this.level = level;
    const t = this.ac.currentTime, p = this.out.gain;
    p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(level, t + time);
  }
  stop() { for (const n of this.nodes) { try { n.stop(); } catch { } } this.started = false; }
}
