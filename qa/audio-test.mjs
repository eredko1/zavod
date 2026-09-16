#!/usr/bin/env node
// Audio QA: renders every sound offline in headless Chrome via ctx.audio.qaRender / qaSpectrogram,
// saves WAV + spectrogram PNG into qa/shots/audio/, prints a loudness table and pass/fail per sound.
// Usage: node qa/audio-test.mjs [--only rifle,pistol] [--standalone] [--url http://localhost:8790]
import { chromium } from '/Users/eugene/Code/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : d; };
const has = (k) => args.includes('--' + k);
const base = opt('url', 'http://localhost:8790');
const only = opt('only', null)?.split(',').filter(Boolean);
const outDir = path.resolve('qa/shots/audio'); fs.mkdirSync(outDir, { recursive: true });

// loudness targets (max 100 ms RMS, dBFS) — tolerance ±3 dB
const TARGET = {
  rifle: -10, pistol: -11, enemy_rifle: -17, dryfire: -28, reload_out: -24, reload_in: -24, reload_end: -24, swap: -26, ads: -32,
  footstep_concrete: -24, footstep_metal: -24, footstep_wood: -24, footstep_water: -24, footstep_ground: -24,
  impact_metal: -20, impact_concrete: -20, impact_wood: -20, impact_water: -21, impact_flesh: -21, impact_ground: -21,
  hitmarker: -18, kill: -18, hurt: -14, ui_click: -24, ui_hover: -30, explosion: -6, grenade_pin: -28, grenade_throw: -30, grenade_bounce: -24,
  stinger_wave: -14, stinger_death: -14, stinger_victory: -14, heartbeat: -20, tinnitus: -28, thunder: -20, dist_gunfire: -30, siren: -38, drip: -38,
  ambience: -30, rain: -31, wind: -40, hum: -44,
};

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', m => { const t = `[${m.type()}] ${m.text()}`; logs.push(t); if (has('console')) console.log(t); });
page.on('pageerror', e => { logs.push(`[pageerror] ${e.message}`); console.log(`[pageerror] ${e.message}`); });

let mode = 'game';
async function loadGame() {
  await page.goto(`${base}/?qa=1&audiotest=1`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('window.__game && window.__game.ready === true && window.__ctx && window.__ctx.audio && window.__ctx.audio.qaRender', null, { timeout: 90000 });
}
async function loadStandalone() {
  mode = 'standalone';
  await page.goto(`${base}/qa/`, { waitUntil: 'load', timeout: 30000 });
  await page.evaluate(async () => {
    const mod = await import('/src/audio.js');
    const ctx = { qa: true, qs: new URLSearchParams('qa=1&audiotest=1'), seed: 1337, bus: { on() { }, emit() { } }, settings: { masterVolume: 1, quality: 'ultra' }, state: 'playing', camera: null, time: { frame: 0 }, player: { health: 100 } };
    ctx.audio = await mod.init(ctx);
    window.__ctx = ctx; window.__game = { ready: true };
  });
}
try {
  if (has('standalone')) await loadStandalone();
  else { try { await loadGame(); } catch (e) { console.log('game page not ready (' + String(e.message).split('\n')[0] + ') → standalone module harness'); await loadStandalone(); } }
} catch (e) { console.log(JSON.stringify({ ok: false, error: String(e), logs: logs.slice(-30) })); await browser.close(); process.exit(1); }

const names = only || await page.evaluate(async () => { const m = await import('/src/audio.js'); return m.qaSounds(); });
const rows = []; let fails = 0;
for (const name of names) {
  try {
    const r = await page.evaluate(async (n) => {
      const a = window.__ctx.audio; const res = await a.qaRender(n); const png = await a.qaSpectrogram(n);
      return { stats: res.stats, wav: res.wav, png };
    }, name);
    fs.writeFileSync(path.join(outDir, `${name}.wav`), Buffer.from(r.wav.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(r.png.split(',')[1], 'base64'));
    const s = r.stats, tgt = TARGET[name];
    const measured = s.steady ? s.rmsActiveDb : s.rms100Db;   // beds: integrated RMS; one-shots: max 100 ms RMS
    const dev = tgt == null ? null : +(measured - tgt).toFixed(1);
    const loudOk = dev == null || Math.abs(dev) <= 3;
    const ok = s.ok && loudOk;
    if (!ok) fails++;
    rows.push({ name, dur: s.duration, peakDb: s.peakDb, rms100: s.rms100Db, rmsAct: s.rmsActiveDb, target: tgt ?? '', dev: dev ?? '', dc: s.dcDb, start: s.startLevelDb, end: s.endLevelDb, clip: s.clipRuns, ok: ok ? 'OK' : (s.ok ? 'LOUD' : 'FAIL') });
  } catch (e) { fails++; rows.push({ name, ok: 'ERR ' + String(e.message).split('\n')[0].slice(0, 80) }); }
}
await browser.close();
const pad = (v, n, r = false) => { v = String(v ?? ''); return r ? v.padStart(n) : v.padEnd(n); };
console.log(`mode=${mode}  out=${outDir}`);
console.log(pad('sound', 20) + pad('dur', 6, 1) + pad('peak', 7, 1) + pad('RMS100', 8, 1) + pad('RMSact', 8, 1) + pad('target', 8, 1) + pad('dev', 6, 1) + pad('DC', 7, 1) + pad('start', 7, 1) + pad('end', 7, 1) + pad('clip', 5, 1) + '  status');
for (const r of rows) console.log(pad(r.name, 20) + pad(r.dur, 6, 1) + pad(r.peakDb, 7, 1) + pad(r.rms100, 8, 1) + pad(r.rmsAct, 8, 1) + pad(r.target, 8, 1) + pad(r.dev, 6, 1) + pad(r.dc, 7, 1) + pad(r.start, 7, 1) + pad(r.end, 7, 1) + pad(r.clip, 5, 1) + '  ' + r.ok);
console.log(`${rows.length - fails}/${rows.length} passed; errors: ${logs.filter(l => l.startsWith('[pageerror]')).length}`);
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ mode, rows, logs: logs.slice(-50) }, null, 2));
process.exitCode = fails ? 1 : 0;
