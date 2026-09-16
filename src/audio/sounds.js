// Procedural sound recipes. Owned by: AUDIO agent.
// Each entry: { bus, render (QA render seconds), trim (dB), send/sendBig (reverb sends), positional opts, fn(v, o) }
// fn receives a Voice `v` and options o = { t (absolute start), pitch, rng, ...event data }.
// Recipes are layered like a modern FPS: transient click + body thump + crack + mechanical + reverb tail.

const R = (o, a, b) => a + (b - a) * o.rng();          // uniform random in [a,b)
const V = (o, cents) => Math.pow(2, (o.rng() * 2 - 1) * cents / 1200); // pitch micro-variation

// ------------------------------------------------------------------ weapons
function rifleLayers(v, o, k) {
  // k: character { body:[f0,f1], crack, punch, grit, mech }
  const p = o.pitch, t = o.t;
  v.noise({ t, hp: 2500 * p, peak: 1.0, attack: 0.0004, decay: 0.0035 });                                  // transient click
  v.osc({ t, type: 'sine', f0: k.body[0] * p, f1: k.body[1] * p, sweep: 0.06, peak: 0.95, attack: 0.002, decay: 0.045 }); // body thump
  v.osc({ t, type: 'sawtooth', f0: k.body[0] * 0.75 * p, f1: k.body[1] * p, sweep: 0.05, lp: 520, peak: 0.4, attack: 0.001, decay: 0.035 }); // grit
  v.noise({ t, bp: k.crack * p, bpq: 1.1, peak: 0.95, attack: 0.0008, decay: 0.012 });                     // crack 2-4 kHz, ~30 ms
  v.noise({ t: t + 0.002, bp: k.punch * p, bpq: 0.8, peak: 0.75, attack: 0.002, decay: 0.03 });             // mid punch
  v.noise({ t: t + 0.011, lp: 3200, peak: 0.28, attack: 0.001, decay: 0.02 });                              // ground/first slap
  v.osc({ t: t + k.mech, type: 'square', f0: 3400, peak: 0.1, attack: 0.0005, decay: 0.003, hp: 1500 });    // bolt tick
  v.noise({ t: t + k.mech + 0.002, bp: 4200, bpq: 6, peak: 0.14, attack: 0.0005, decay: 0.006 });           // bolt cycle
}

export const SOUNDS = {
  rifle: { bus: 'weapons', render: 2.0, send: 0.6, sendBig: 0.05, limit: 6, trim: 1.5,
    fn: (v, o) => rifleLayers(v, o, { body: [135, 58], crack: 3000, punch: 560, mech: 0.028 }) },
  pistol: { bus: 'weapons', render: 1.4, send: 0.42, limit: 6, trim: 2,
    fn: (v, o) => {
      const p = o.pitch, t = o.t;
      v.noise({ t, hp: 3000 * p, peak: 1.0, attack: 0.0004, decay: 0.003 });
      v.osc({ t, type: 'sine', f0: 200 * p, f1: 85 * p, sweep: 0.04, peak: 0.85, attack: 0.001, decay: 0.035 });
      v.noise({ t, bp: 3900 * p, bpq: 1.0, peak: 1.0, attack: 0.0008, decay: 0.008 });
      v.noise({ t: t + 0.001, bp: 950 * p, bpq: 0.9, peak: 0.6, attack: 0.001, decay: 0.02 });
      v.noise({ t: t + 0.009, lp: 3000, peak: 0.22, attack: 0.001, decay: 0.015 });
      v.noise({ t: t + 0.022, bp: 3200, bpq: 5, peak: 0.16, decay: 0.006 });                     // slide back
      v.osc({ t: t + 0.055, type: 'square', f0: 2600, peak: 0.07, decay: 0.004, hp: 1200 });    // slide return
    } },
  // enemy AK-class: same layers, band-limited + positioned by the Voice (panner + air absorption + delay)
  enemy_rifle: { bus: 'enemies', render: 1.7, send: 0.5, sendBig: 0.25, limit: 14, trim: -6, positional: { hrtf: true, refDistance: 6, maxDistance: 80, absorb: 34 },
    fn: (v, o) => rifleLayers(v, o, { body: [110, 46], crack: 2500, punch: 480, mech: 0.032 }) },
  dryfire: { bus: 'weapons', render: 0.4, trim: -1, fn: (v, o) => {
      const t = o.t;
      v.osc({ t, type: 'square', f0: 2900, peak: 0.25, decay: 0.003, hp: 1500 });
      v.noise({ t, bp: 2200, bpq: 4, peak: 0.55, decay: 0.006 });
      v.noise({ t: t + 0.045, bp: 3400, bpq: 5, peak: 0.35, decay: 0.005 });  // hammer fall
      v.osc({ t: t + 0.045, type: 'sine', f0: 400, peak: 0.15, decay: 0.008 });
    } },
  reload_out: { bus: 'weapons', render: 0.6, trim: 1, fn: (v, o) => {
      const t = o.t;
      v.noise({ t, bp: 1300, bpq: 3, peak: 0.6, decay: 0.012 });                                 // mag release: plastic clack
      v.osc({ t, type: 'triangle', f0: 620, peak: 0.25, decay: 0.01 });
      v.noise({ t: t + 0.02, bp: 2200, bpq: 1.5, lp: 5000, peak: 0.22, attack: 0.02, hold: 0.06, decay: 0.03 }); // slide out
      v.noise({ t: t + 0.15, kind: 'pink', lp: 900, peak: 0.35, attack: 0.004, decay: 0.02 });  // mag into hand
    } },
  reload_in: { bus: 'weapons', render: 0.6, trim: -10, fn: (v, o) => {
      const t = o.t;
      v.noise({ t, bp: 900, bpq: 2, peak: 0.85, decay: 0.014 });                                 // solid clack
      v.osc({ t, type: 'sine', f0: 180, f1: 120, sweep: 0.02, peak: 0.6, decay: 0.03 });         // thump
      v.noise({ t: t + 0.005, bp: 2600, bpq: 3, peak: 0.3, decay: 0.008 });                       // latch
      v.noise({ t: t + 0.06, bp: 1600, bpq: 4, peak: 0.25, decay: 0.008 });                       // seat tap
    } },
  reload_end: { bus: 'weapons', render: 0.7, trim: -12, fn: (v, o) => {
      const t = o.t;
      v.noise({ t, bp: 3500, bpq: 8, peak: 0.45, decay: 0.01 });                                  // charging handle click
      v.noise({ t, bp: 1800, bpq: 2, peak: 0.3, attack: 0.005, hold: 0.05, decay: 0.02 });         // spring
      v.partials({ t: t + 0.07, f: 2100, peak: 0.3, decay: 0.03, partials: [1, 1.42, 2.1], gains: [1, .6, .35] }); // bolt slam ring
      v.noise({ t: t + 0.07, bp: 1100, bpq: 1.5, peak: 0.75, decay: 0.012 });                     // slam
      v.osc({ t: t + 0.07, type: 'sine', f0: 160, f1: 110, sweep: 0.02, peak: 0.5, decay: 0.03 });
    } },
  swap: { bus: 'weapons', render: 0.7, trim: -6, fn: (v, o) => {
      const t = o.t;
      v.noise({ t, kind: 'pink', bp: 900, bpq: 0.8, lp: 2500, lpTo: 4500, lpTime: 0.15, peak: 0.35, attack: 0.03, hold: 0.06, decay: 0.05 }); // swish
      v.noise({ t: t + 0.02, kind: 'pink', lp: 600, peak: 0.3, attack: 0.01, decay: 0.03 });     // cloth
      v.noise({ t: t + 0.2, bp: 1500, bpq: 3, peak: 0.45, decay: 0.01 });                         // grip click
      v.osc({ t: t + 0.2, type: 'sine', f0: 140, peak: 0.3, decay: 0.02 });
    } },
  ads: { bus: 'weapons', render: 0.4, trim: -7, fn: (v, o) => {
      const t = o.t;
      v.noise({ t, kind: 'pink', lp: 1200, peak: 0.35, attack: 0.01, decay: 0.03 });             // cloth
      if (o.on !== false) v.noise({ t: t + 0.06, bp: 2400, bpq: 4, peak: 0.18, decay: 0.006 }); // soft click
    } },

  // ------------------------------------------------------------------ footsteps (s = sprint scale)
  footstep_concrete: { bus: 'foley', render: 0.5, trim: 4, limit: 10, positional: { refDistance: 3, maxDistance: 30 }, fn: (v, o) => {
      const p = o.pitch, t = o.t, s = o.sprint ? 1.35 : 1;
      v.noise({ t, lp: 1400 * p, peak: 0.6 * s, attack: 0.002, decay: 0.016 * s });
      v.noise({ t, bp: 320 * p, bpq: 1, peak: 0.6 * s, attack: 0.003, decay: 0.03 * s });
      v.noise({ t: t + 0.004, hp: 3000, peak: 0.15, decay: 0.004 });                              // grit
      v.noise({ t: t + (o.sprint ? 0.05 : 0.09), lp: 900, peak: 0.25 * s, attack: 0.003, decay: 0.01 }); // toe
    } },
  footstep_metal: { bus: 'foley', render: 0.9, trim: -13, limit: 10, positional: { refDistance: 3, maxDistance: 35 }, fn: (v, o) => {
      const p = o.pitch, t = o.t, s = o.sprint ? 1.35 : 1;
      v.noise({ t, lp: 2000, peak: 0.55 * s, attack: 0.001, decay: 0.008 });
      v.partials({ t, f: 190 * p, peak: 0.5 * s, decay: 0.12, partials: [1, 1.9, 2.8, 4.3], gains: [1, .5, .35, .2], spread: 0.05 }); // low-Q ring
      v.osc({ t, type: 'sine', f0: 90, f1: 60, sweep: 0.05, peak: 0.4 * s, decay: 0.05 });        // sheet boom
      v.noise({ t: t + (o.sprint ? 0.05 : 0.09), lp: 1500, peak: 0.2 * s, attack: 0.002, decay: 0.008 });
    } },
  footstep_wood: { bus: 'foley', render: 0.5, trim: -11, limit: 10, positional: { refDistance: 3, maxDistance: 30 }, fn: (v, o) => {
      const p = o.pitch, t = o.t, s = o.sprint ? 1.35 : 1;
      v.osc({ t, type: 'sine', f0: 140 * p, f1: 95 * p, sweep: 0.03, peak: 0.7 * s, attack: 0.002, decay: 0.045 }); // hollow thud
      v.noise({ t, lp: 500, peak: 0.5 * s, attack: 0.002, decay: 0.018 });
      v.noise({ t, bp: 1200, bpq: 2, peak: 0.25 * s, decay: 0.008 });
      v.noise({ t: t + (o.sprint ? 0.05 : 0.09), lp: 700, peak: 0.25 * s, attack: 0.003, decay: 0.012 });
    } },
  footstep_water: { bus: 'foley', render: 0.6, trim: -8.5, limit: 10, positional: { refDistance: 3, maxDistance: 30 }, fn: (v, o) => {
      const t = o.t, s = o.sprint ? 1.35 : 1;
      v.noise({ t, hp: 2500, peak: 0.45 * s, attack: 0.004, hold: 0.02, decay: 0.05 });          // sizzle
      v.noise({ t, lp: 700, peak: 0.55 * s, attack: 0.003, decay: 0.02 });                        // splash body
      v.ticks({ t: t + 0.01, count: 5, span: 0.12, hp: 4000, peak: 0.2 * s, decay: 0.004 });      // droplets
    } },
  footstep_ground: { bus: 'foley', render: 0.5, trim: 6.5, limit: 10, positional: { refDistance: 3, maxDistance: 30 }, fn: (v, o) => {
      const t = o.t, s = o.sprint ? 1.35 : 1;
      v.noise({ t, lp: 900, peak: 0.55 * s, attack: 0.003, decay: 0.02 });                        // dirt thud
      v.ticks({ t, count: 8, span: 0.05, spread: 'front', bp: 2500, bpq: 1.5, peak: 0.3 * s, decay: 0.003 }); // gravel
      v.noise({ t: t + (o.sprint ? 0.05 : 0.09), lp: 900, peak: 0.25 * s, attack: 0.003, decay: 0.012 });
    } },

  // ------------------------------------------------------------------ impacts
  impact_metal: { bus: 'foley', render: 0.8, trim: -4, send: 0.3, limit: 12, positional: { refDistance: 4, maxDistance: 45 }, fn: (v, o) => {
      const p = o.pitch, t = o.t;
      v.noise({ t, hp: 1500, peak: 0.6, attack: 0.0005, decay: 0.004 });                           // hit transient
      v.noise({ t, bp: 2300 * p, bpq: 5, peak: 0.8, decay: 0.02 });                                // clang
      v.partials({ t, f: 900 * p, peak: 0.3, decay: 0.045, partials: [1, 2.31, 3.7], gains: [1, .5, .3] });
      v.ticks({ t: t + 0.005, count: 7, span: 0.09, spread: 'front', hp: 4500, peak: 0.35, decay: 0.002, panSpread: 0.6 }); // sparks
      if (o.rng() < 0.45) v.osc({ t: t + 0.008, type: 'sine', f0: 3200 * p, f1: 700 * p, sweep: 0.28, peak: 0.25, attack: 0.005, decay: 0.09, vibrato: { rate: 40, depth: 60 } }); // ricochet whine
    } },
  impact_concrete: { bus: 'foley', render: 0.6, trim: 9, send: 0.25, limit: 12, positional: { refDistance: 4, maxDistance: 45 }, fn: (v, o) => {
      const p = o.pitch, t = o.t;
      v.noise({ t, bp: 1600 * p, bpq: 1, peak: 0.9, attack: 0.0006, decay: 0.01 });               // chip crack
      v.noise({ t, lp: 500, peak: 0.5, decay: 0.02 });                                            // thud
      v.ticks({ t: t + 0.01, count: 6, span: 0.15, bp: 1800, bpq: 2, peak: 0.25, decay: 0.003, panSpread: 0.5 }); // debris
    } },
  impact_wood: { bus: 'foley', render: 0.6, trim: -1, send: 0.25, limit: 12, positional: { refDistance: 4, maxDistance: 45 }, fn: (v, o) => {
      const p = o.pitch, t = o.t;
      v.noise({ t, bp: 800 * p, bpq: 1.5, peak: 0.8, decay: 0.014 });
      v.noise({ t, hp: 2500, peak: 0.5, decay: 0.005 });                                          // splinter crack
      v.osc({ t, type: 'sine', f0: 200, f1: 120, sweep: 0.03, peak: 0.4, decay: 0.03 });
      v.ticks({ t: t + 0.01, count: 4, span: 0.08, bp: 3000, peak: 0.2, decay: 0.003 });
    } },
  impact_water: { bus: 'foley', render: 0.7, trim: -7, limit: 12, positional: { refDistance: 4, maxDistance: 40 }, fn: (v, o) => {
      const t = o.t;
      v.noise({ t, hp: 1800, peak: 0.6, attack: 0.002, hold: 0.01, decay: 0.04 });
      v.noise({ t, lp: 600, peak: 0.6, attack: 0.002, decay: 0.015 });
      v.osc({ t: t + 0.003, type: 'sine', f0: 900, f1: 1800, sweep: 0.03, peak: 0.15, decay: 0.02 }); // plink
      v.ticks({ t: t + 0.02, count: 6, span: 0.15, hp: 4000, peak: 0.2, decay: 0.004, panSpread: 0.5 });
    } },
  impact_flesh: { bus: 'foley', render: 0.5, trim: -4.5, limit: 12, positional: { refDistance: 4, maxDistance: 40 }, fn: (v, o) => {
      const t = o.t;
      v.noise({ t, lp: 350, peak: 0.85, attack: 0.002, decay: 0.03 });                            // wet thud
      v.osc({ t, type: 'sine', f0: 110, f1: 70, sweep: 0.03, peak: 0.5, decay: 0.04 });
      v.noise({ t: t + 0.002, bp: 1200, bpq: 1.2, peak: 0.3, decay: 0.012 });                     // slap
    } },
  impact_ground: { bus: 'foley', render: 0.5, trim: 11, send: 0.2, limit: 12, positional: { refDistance: 4, maxDistance: 40 }, fn: (v, o) => {
      const t = o.t;
      v.noise({ t, lp: 600, peak: 0.7, attack: 0.001, decay: 0.018 });                            // dust thud
      v.noise({ t, bp: 1400, bpq: 1.2, peak: 0.4, decay: 0.008 });
      v.ticks({ t: t + 0.01, count: 5, span: 0.1, bp: 2200, bpq: 1.5, peak: 0.2, decay: 0.003 });
    } },

  // ------------------------------------------------------------------ feedback / ui
  hitmarker: { bus: 'ui', render: 0.3, trim: 4.5, fn: (v, o) => {
      const t = o.t, p = o.headshot ? 1.25 : 1;
      v.osc({ t, type: 'triangle', f0: 1900 * p, peak: 0.6, attack: 0.001, decay: 0.008 });
      v.osc({ t: t + 0.03, type: 'triangle', f0: 2500 * p, peak: 0.55, attack: 0.001, decay: 0.008 });
      v.noise({ t, hp: 3000, peak: 0.25, decay: 0.002 });
    } },
  kill: { bus: 'ui', render: 0.5, trim: -2, fn: (v, o) => {
      const t = o.t;
      v.osc({ t, type: 'triangle', f0: 1100, peak: 0.6, decay: 0.014 });
      v.osc({ t: t + 0.045, type: 'triangle', f0: 800, peak: 0.6, decay: 0.02 });
      v.osc({ t, type: 'sine', f0: 150, f1: 90, sweep: 0.04, peak: 0.4, decay: 0.05 });          // confirm thud
    } },
  hurt: { bus: 'foley', render: 1.2, trim: -4, fn: (v, o) => {
      const t = o.t;
      v.noise({ t, lp: 300, peak: 0.9, attack: 0.002, decay: 0.05 });                             // flesh thump
      v.osc({ t, type: 'sine', f0: 95, f1: 55, sweep: 0.06, peak: 0.7, decay: 0.07 });
      v.noise({ t, bp: 1500, bpq: 1, peak: 0.3, decay: 0.01 });                                   // slap
      v.osc({ t: t + 0.01, type: 'sine', f0: 3300, peak: 0.12, attack: 0.005, decay: 0.12 });     // HF ring
    } },
  ui_click: { bus: 'ui', render: 0.3, trim: 3.5, fn: (v, o) => {
      const t = o.t;
      v.osc({ t, type: 'square', f0: 2200, peak: 0.3, decay: 0.004, lp: 6000 });
      v.noise({ t, bp: 3000, bpq: 2, peak: 0.4, decay: 0.004 });
      v.osc({ t, type: 'sine', f0: 600, peak: 0.25, decay: 0.012 });
    } },
  ui_hover: { bus: 'ui', render: 0.3, trim: 6, fn: (v, o) => {
      const t = o.t;
      v.noise({ t, bp: 4000, bpq: 2, peak: 0.25, decay: 0.003 });
      v.osc({ t, type: 'sine', f0: 900, peak: 0.15, decay: 0.008 });
    } },

  // ------------------------------------------------------------------ explosives
  explosion: { bus: 'weapons', render: 3.5, trim: 2, send: 0.5, sendBig: 0.9, limit: 4, positional: { hrtf: true, refDistance: 10, maxDistance: 120, absorb: 60 }, fn: (v, o) => {
      const t = o.t;
      v.noise({ t, hp: 800, peak: 0.9, attack: 0.001, decay: 0.03 });                             // initial crack
      v.osc({ t, type: 'sine', f0: 95, f1: 38, sweep: 0.09, peak: 1.0, attack: 0.003, decay: 0.35 }); // sub thump
      v.noise({ t, lp: 6000, lpTo: 250, lpTime: 0.9, peak: 1.0, attack: 0.002, decay: 0.3 });     // blast
      v.osc({ t, type: 'sawtooth', f0: 70, f1: 45, sweep: 0.15, lp: 220, peak: 0.6, attack: 0.005, decay: 0.2 }); // boom grit
      v.ticks({ t: t + 0.15, count: 18, span: 1.4, spread: 'front', bp: 1400, bpq: 1.5, peak: 0.3, decay: 0.004, panSpread: 1.2 }); // debris
      v.noise({ t: t + 0.3, kind: 'crackle', lp: 3000, peak: 0.4, attack: 0.05, hold: 0.4, decay: 0.3 }); // crackle bed
    } },
  grenade_pin: { bus: 'foley', render: 0.5, trim: -7.5, fn: (v, o) => {
      const t = o.t;
      v.noise({ t, bp: 3800, bpq: 8, peak: 0.5, decay: 0.012 });                                  // pin ring
      v.partials({ t, f: 3100, peak: 0.25, decay: 0.05, partials: [1, 1.5], gains: [1, .5] });
      v.noise({ t: t + 0.09, bp: 1500, bpq: 3, peak: 0.4, decay: 0.008 });                         // spoon release
      v.noise({ t: t + 0.09, lp: 800, peak: 0.2, decay: 0.01 });
    } },
  grenade_throw: { bus: 'foley', render: 0.5, trim: -5, fn: (v, o) => {
      const t = o.t;
      v.noise({ t, kind: 'pink', bp: 700, bpq: 0.7, lp: 1500, lpTo: 6000, lpTime: 0.2, peak: 0.4, attack: 0.05, hold: 0.05, decay: 0.06 }); // swish
      v.noise({ t, kind: 'pink', lp: 500, peak: 0.25, attack: 0.02, decay: 0.05 });               // cloth
    } },
  grenade_bounce: { bus: 'foley', render: 0.6, trim: -7, send: 0.3, positional: { refDistance: 4, maxDistance: 40 }, fn: (v, o) => {
      const p = o.pitch, t = o.t;
      v.noise({ t, bp: 1400 * p, bpq: 3, peak: 0.7, decay: 0.012 });
      v.partials({ t, f: 1100 * p, peak: 0.3, decay: 0.04, partials: [1, 1.37, 2.2], gains: [1, .5, .3] });
      v.osc({ t, type: 'sine', f0: 160, f1: 100, sweep: 0.02, peak: 0.4, decay: 0.03 });
    } },

  // ------------------------------------------------------------------ stingers (music bus)
  stinger_wave: { bus: 'music', render: 4.0, trim: -9, sendBig: 0.4, fn: (v, o) => {
      const t = o.t;
      const hit = (tt, g) => {
        v.osc({ t: tt, type: 'sine', f0: 90, f1: 42, sweep: 0.08, peak: g, attack: 0.002, decay: 0.25 });
        v.noise({ t: tt, lp: 2500, lpTo: 200, lpTime: 0.3, peak: 0.6 * g, decay: 0.08 });
        v.noise({ t: tt, hp: 3000, peak: 0.3 * g, decay: 0.004 });
      };
      hit(t, 1); hit(t + 0.38, 0.8);
      for (const [f, d] of [[55, -7], [82.5, 5], [110, 9], [165, -4]])
        v.osc({ t, type: 'sawtooth', f0: f, detune: d, lp: 250, lpTo: 2400, lpTime: 1.8, peak: 0.16, attack: 0.3, hold: 1.25, decay: 0.2, trem: { rate: 7, depth: 0.25 } }); // tension pad
      v.noise({ t: t + 0.4, kind: 'pink', hp: 300, lp: 400, lpTo: 7000, lpTime: 1.4, peak: 0.3, attack: 1.25, decay: 0.12 }); // riser
      hit(t + 1.85, 1.1);
    } },
  stinger_death: { bus: 'music', render: 5.0, trim: -9, sendBig: 0.5, fn: (v, o) => {
      const t = o.t;
      v.osc({ t, type: 'sine', f0: 80, f1: 40, sweep: 0.1, peak: 0.9, decay: 0.4 });               // toll hit
      v.noise({ t, lp: 1500, lpTo: 100, lpTime: 1.5, peak: 0.5, attack: 0.01, decay: 0.5 });
      v.osc({ t, type: 'sawtooth', f0: 110, f1: 40, sweep: 2.2, lp: 900, lpTo: 150, lpTime: 2.2, peak: 0.3, attack: 0.05, hold: 1.5, decay: 0.5 }); // falling drone
      v.osc({ t, type: 'sine', f0: 55, f1: 28, sweep: 2.2, peak: 0.6, attack: 0.05, hold: 1.5, decay: 0.6 });
      v.osc({ t: t + 0.02, type: 'sine', f0: 2800, peak: 0.07, attack: 0.05, decay: 0.8 });       // ring
    } },
  stinger_victory: { bus: 'music', render: 5.0, trim: -8, sendBig: 0.45, fn: (v, o) => {
      const t = o.t;
      v.osc({ t, type: 'sine', f0: 100, f1: 50, sweep: 0.08, peak: 0.9, decay: 0.3 });             // timpani
      v.noise({ t: t + 0.02, hp: 6000, peak: 0.35, attack: 0.005, decay: 0.15 });                  // shimmer
      for (const f of [220, 277.2, 329.6, 440, 554.4, 659.3]) {
        v.osc({ t, type: 'triangle', f0: f, peak: 0.16, attack: 0.15, hold: 1.2, decay: 0.5 });
        v.osc({ t, type: 'sawtooth', f0: f, detune: 6, lp: 600, lpTo: 4000, lpTime: 1.2, peak: 0.06, attack: 0.3, hold: 1.1, decay: 0.5 });
      }
      v.osc({ t: t + 0.55, type: 'sine', f0: 110, f1: 55, sweep: 0.08, peak: 0.7, decay: 0.3 });
      v.osc({ t: t + 1.1, type: 'sine', f0: 120, f1: 60, sweep: 0.08, peak: 0.8, decay: 0.4 });
      v.noise({ t: t + 1.1, hp: 5000, peak: 0.3, attack: 0.005, decay: 0.2 });
    } },

  // ------------------------------------------------------------------ vital signs (direct to master, bypasses the muffle)
  heartbeat: { bus: 'vital', render: 3.0, trim: -14, fn: (v, o) => {
      const t = o.t, n = o.beats ?? 1, per = o.period ?? 0.86;
      for (let i = 0; i < n; i++) {
        const tt = t + i * per;
        v.osc({ t: tt, type: 'sine', f0: 120, f1: 45, sweep: 0.06, lp: 200, peak: 1.0, attack: 0.004, decay: 0.09 });
        v.osc({ t: tt + 0.17, type: 'sine', f0: 100, f1: 42, sweep: 0.05, lp: 200, peak: 0.65, attack: 0.004, decay: 0.08 });
      }
    } },
  tinnitus: { bus: 'vital', render: 3.0, trim: -22, fn: (v, o) => {
      const t = o.t, i = o.intensity ?? 1;
      v.osc({ t, type: 'sine', f0: 4000, peak: 0.6 * i, attack: 0.01, hold: 0.55 * i, decay: 0.3 * i + 0.06 });
      v.osc({ t, type: 'sine', f0: 4007, peak: 0.4 * i, attack: 0.01, hold: 0.55 * i, decay: 0.3 * i + 0.06 });
    } },

  // ------------------------------------------------------------------ ambience one-shots
  thunder: { bus: 'ambience', render: 7, trim: -8.5, sendBig: 0.6, limit: 2, fn: (v, o) => {
      const t = o.t, near = o.near ?? o.rng(), pan = o.pan ?? R(o, -0.7, 0.7);
      if (near > 0.55) { v.noise({ t, lp: 3500, lpTo: 400, lpTime: 0.5, peak: 0.8, attack: 0.008, decay: 0.12, pan }); v.noise({ t, hp: 1500, peak: 0.5, attack: 0.002, decay: 0.03, pan }); } // crack
      v.noise({ t: t + 0.05, kind: 'brown', hp: 35, lp: 900, lpTo: 110, lpTime: 3, peak: 2.4, attack: 0.15, hold: 0.4, decay: 1.1, pan, trem: { rate: 3.5, depth: 0.35 } }); // rumble
      v.noise({ t: t + 0.1, lp: 500, lpTo: 150, lpTime: 2, peak: 0.5, attack: 0.2, hold: 0.3, decay: 0.9, pan, trem: { rate: 5.5, depth: 0.5 } }); // mid texture
      for (let k = 0; k < 3; k++)
        v.noise({ t: t + 0.8 + k * 0.9 + o.rng() * 0.4, kind: 'brown', hp: 35, lp: 260, lpq: 1.2, peak: 1.6 * (1 - k * 0.2), attack: 0.3, hold: 0.2, decay: 0.7, pan: pan * 0.6, trem: { rate: 2 + o.rng() * 3, depth: 0.4 } }); // rolling
      v.osc({ t, type: 'sine', f0: 45, f1: 32, sweepTau: 1.2, peak: 0.18, attack: 0.2, hold: 1, decay: 0.8, vibrato: { rate: 0.7, depth: 40 } }); // sub
    } },
  dist_gunfire: { bus: 'ambience', render: 2.5, trim: -12, sendBig: 0.8, limit: 3, fn: (v, o) => {
      const t = o.t, n = 3 + Math.floor(o.rng() * 6), pan = o.pan ?? R(o, -0.9, 0.9), per = 0.075 + o.rng() * 0.05;
      for (let i = 0; i < n; i++) {
        const tt = t + i * per * (0.92 + o.rng() * 0.16);
        v.noise({ t: tt, lp: 550, peak: 0.6, attack: 0.002, decay: 0.03, pan });
        v.osc({ t: tt, type: 'sine', f0: 75, f1: 45, sweep: 0.05, peak: 0.5, decay: 0.05, pan });
      }
    } },
  siren: { bus: 'ambience', render: 6, trim: -29, sendBig: 0.9, limit: 1, fn: (v, o) => {
      const t = o.t, len = o.len ?? 4.5, pan = o.pan ?? R(o, -0.9, 0.9);
      v.osc({ t, type: 'triangle', f0: 740, lp: 1500, peak: 0.5, attack: 1.2, hold: len - 2.4, decay: 0.6, pan, vibrato: { rate: 0.55, depth: 300 } });
      v.osc({ t, type: 'sine', f0: 740, lp: 1500, peak: 0.3, attack: 1.2, hold: len - 2.4, decay: 0.6, pan, vibrato: { rate: 0.55, depth: 300 } });
    } },
  drip: { bus: 'ambience', render: 0.3, trim: -7.5, limit: 24, fn: (v, o) => {
      const t = o.t, pan = o.pan ?? R(o, -0.9, 0.9);
      if (o.rng() < 0.65) { // on metal: pitched click
        const f = R(o, 1800, 5200);
        v.osc({ t, type: 'sine', f0: f, peak: 0.6, attack: 0.0005, decay: R(o, 0.003, 0.01), pan });
        v.noise({ t, bp: f, bpq: 9, peak: 0.5, attack: 0.0005, decay: 0.004, pan });
      } else { // into a puddle: rising plink
        const f = R(o, 1500, 3000);
        v.osc({ t, type: 'sine', f0: f, f1: f * 1.7, sweep: 0.025, peak: 0.35, attack: 0.001, decay: 0.012, pan });
        v.noise({ t, hp: 3500, peak: 0.2, attack: 0.001, decay: 0.005, pan });
      }
    } },
};

// aliases
SOUNDS.footstep_flesh = SOUNDS.footstep_concrete;
SOUNDS.footstep_gravel = SOUNDS.footstep_ground;
SOUNDS.impact_gravel = SOUNDS.impact_ground;

export const microVariation = (rng, cents = 60) => Math.pow(2, (rng() * 2 - 1) * cents / 1200);
