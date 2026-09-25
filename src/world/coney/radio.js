// CONEY — Luna Park Radio. One station, a shuffle-free rotation of the crew's tracks, on the wall clock: everyone in the room
// hears the same song at the same second (position = Date.now() mod the rotation). Settings → Audio → Luna Park Radio:
// Off / In cars (default: the car radio, louder) / Always (quieter on foot); Radio volume. Keys: M on/off, . next track
// (skips the station for you only). Plain <audio> elements (streamed, nothing decoded up front). CONEY agent.
import { saveAudio } from '../../ctx.js';

const TRACKS = [
  { src: './assets/audio/radio/adidas-from-donbass.mp3', title: 'Adidas from Donbass' },
  { src: './assets/audio/radio/gopnik-disneyland.mp3', title: 'Гопник-Диснейленд' },
];

export function buildRadio(world) {
  const { ctx, W } = world; const S = ctx.settings;
  const R = { els: TRACKS.map((t) => { const a = new Audio(); a.preload = 'metadata'; a.src = t.src; a.crossOrigin = 'anonymous'; return a; }), dur: TRACKS.map(() => 0), cur: -1, skip: 0, on: false, lastTitle: '' };
  R.els.forEach((a, i) => a.addEventListener('loadedmetadata', () => { R.dur[i] = a.duration || 0; }));
  W.radio = { tracks: TRACKS.map((t) => t.title), get now() { return R.cur >= 0 ? TRACKS[R.cur].title : null; }, qa: () => R.els.map((a) => ({ playing: !a.paused, t: +a.currentTime.toFixed(1), vol: +a.volume.toFixed(2) })) };
  // where the station is right now: [track, offset]
  const at = () => {
    const total = R.dur.reduce((a, b) => a + b, 0); if (!(total > 0)) return [0, 0];
    let t = ((Date.now() / 1000 + R.skip) % total + total) % total;
    for (let i = 0; i < R.dur.length; i++) { if (t < R.dur[i]) return [i, t]; t -= R.dur[i]; }
    return [0, 0];
  };
  const stop = () => { for (const a of R.els) if (!a.paused) a.pause(); R.on = false; R.cur = -1; };
  addEventListener('keydown', (e) => {
    if (e.repeat || ctx.state !== 'playing' || world.W !== ctx.world) return;
    // M: on if you can't hear it, off if you can
    if (e.code === 'KeyM') { S.radio = R.on ? 'off' : 'always'; saveAudio(S); ctx.hud?.toast?.(S.radio === 'off' ? 'RADIO OFF' : '📻 LUNA PARK RADIO — ON', 1400); }
    if (e.code === 'Period' && R.on) { const [, off] = at(); R.skip += (R.dur[R.cur] || 0) - off + 0.05; R.cur = -1; }   // next track (just for you)
  });
  world.updaters.push(() => {
    if (ctx.world !== W) return;
    const car = !!ctx.vehicles?.mounted, mode = S.radio || 'car';
    const want = (ctx.state === 'playing' || ctx.state === 'paused') && (mode === 'always' || (mode === 'car' && car));
    if (!want) { if (R.on) stop(); return; }
    if (!(R.dur.every((d) => d > 0))) { for (const a of R.els) if (a.preload !== 'auto') { a.preload = 'auto'; a.load(); } return; }   // wait for durations
    const [i, off] = at();
    const vol = Math.max(0, Math.min(1, (S.radioVolume ?? 0.7) * (S.masterVolume ?? 1) * (car ? 1 : 0.55) * (ctx.state === 'paused' ? 0.4 : 1)));
    if (i !== R.cur) {
      for (const a of R.els) if (!a.paused) a.pause();
      const a = R.els[i]; R.cur = i; try { a.currentTime = off; } catch {} a.volume = vol; a.play().catch(() => { R.cur = -1; });   // blocked until the first click: retry next frame
      if (TRACKS[i].title !== R.lastTitle) { R.lastTitle = TRACKS[i].title; ctx.hud?.toast?.(`📻 LUNA PARK RADIO · ${TRACKS[i].title}`, 2600); }
    } else {
      const a = R.els[i]; a.volume = vol;
      if (Math.abs(a.currentTime - off) > 2.5) try { a.currentTime = off; } catch {}   // stay on the station clock
      if (a.paused) a.play().catch(() => {});
    }
    R.on = true;
  });
  ctx.bus.on('state', ({ state }) => { if (state === 'menu' || state === 'dead') stop(); });
}
