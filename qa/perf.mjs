#!/usr/bin/env node
// Frame-time profiler: load time, steady fps + frame-time percentiles per pose, hitches (> 50 ms) with their cause, draw calls,
// programs, heap. Uses the ?prof=1 frame profiler in main.js (per module / per world updater / render CPU time per frame).
// node qa/perf.mjs [scene filter] [--profile desktop|low|iphone] [--secs 10] [--json out.json] [--base http://localhost:8790]
import { chromium, webkit, devices } from 'playwright-core';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : d; };
const only = args[0] && !args[0].startsWith('--') ? args[0] : '';
const PROFILE = opt('profile', 'desktop'), SECS = +opt('secs', 10), BASE = opt('base', 'http://localhost:8790'), JSON_OUT = opt('json', null);
const SCENES = [
  ['coney', '', ['spawn', 'hero', 'rides', 'luna']],
  ['coney-chill', '&map=coney&mode=chill', ['spawn', 'sideshow', 'beach', 'surfave']],
  ['zavod', '&map=zavod', ['spawn', 'containers', 'warehouse', 'overview']],
  ['terminal', '&map=terminal', ['spawn', 'clock', 'dining', 'platform']],
].map(([name, q, poses]) => ({ name, q: q || '&map=coney', poses }));

const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
const r1 = (v) => Math.round(v * 10) / 10;

async function launch() {
  if (PROFILE === 'iphone') { const b = await webkit.launch({ headless: true }); return { b, ctx: await b.newContext({ ...devices['iPhone 15 Pro'] }), extra: '&touch=1' }; }
  const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--mute-audio', '--enable-precise-memory-info', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
  return { b, ctx: await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }), extra: PROFILE === 'low' ? '&low=1' : '' };
}

// summarise a window of profiler frames: steady stats + the worst frames with the parts that ate them
function summarise(frames) {
  if (frames.length < 2) return null;
  const dts = frames.slice(1).map((f) => f.dt), span = (frames[frames.length - 1].t - frames[0].t) / 1000;
  const hitches = [];
  for (let i = 1; i < frames.length; i++) {
    const f = frames[i]; if (f.dt <= 50) continue;
    const prev = frames[i - 1], cause = [];
    if (f.progs > prev.progs) cause.push(`+${f.progs - prev.progs} programs`);
    if (f.tex > prev.tex) cause.push(`+${f.tex - prev.tex} tex`);
    if (f.geo - prev.geo > 5) cause.push(`+${f.geo - prev.geo} geo`);
    const top = Object.entries(f.parts).filter(([k]) => !['world'].includes(k) || !Object.keys(f.parts).some((x) => x.startsWith('u:'))).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${r1(v)}`);
    hitches.push({ dt: r1(f.dt), cpu: r1(f.cpu), gpu: r1(f.gpu || 0), cause: cause.join(' '), top: top.join(', '), gap: r1(f.dt - (prev.cpu || 0)) });
  }
  hitches.sort((a, b) => b.dt - a.dt);
  // average CPU per part over the window (top 8)
  const acc = {}; for (const f of frames) for (const [k, v] of Object.entries(f.parts)) acc[k] = (acc[k] || 0) + v;
  const parts = Object.entries(acc).map(([k, v]) => [k, v / frames.length]).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${v.toFixed(2)}`);
  const mid = frames[frames.length >> 1];
  return { fps: r1((frames.length - 1) / span), p50: r1(pct(dts, 50)), p95: r1(pct(dts, 95)), p99: r1(pct(dts, 99)), max: r1(Math.max(...dts)), long: hitches.length,
    cpu50: r1(pct(frames.map((f) => f.cpu), 50)), cpu95: r1(pct(frames.map((f) => f.cpu), 95)), gpu50: r1(pct(frames.filter((f) => f.gpu).map((f) => f.gpu), 50)), gpu95: r1(pct(frames.filter((f) => f.gpu).map((f) => f.gpu), 95)), calls: mid.calls, tris: mid.tris, progs: frames[frames.length - 1].progs, newProgs: frames[frames.length - 1].progs - frames[0].progs, hitches: hitches.slice(0, 5), parts };
}

const results = [];
for (const S of SCENES) {
  if (only && !S.name.includes(only)) continue;
  const { b, ctx, extra } = await launch(); const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  // long animation frames with script attribution: names the JS behind a hitch even when it runs outside the game loop
  await page.addInitScript(() => { window.__loaf = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.duration > 50) window.__loaf.push({ t: Math.round(e.startTime), d: Math.round(e.duration), block: Math.round(e.blockingDuration), render: Math.round(e.renderStart ? e.startTime + e.duration - e.renderStart : 0), scripts: (e.scripts || []).filter((s) => s.duration > 8).map((s) => `${(s.sourceURL || '').split('/').slice(-2).join('/')}:${s.sourceFunctionName || s.invoker} ${Math.round(s.duration)}`).slice(0, 4) }); }).observe({ type: 'long-animation-frame', buffered: true }); } catch {} });
  const t0 = Date.now();
  await page.goto(`${BASE}/?qa=1&prof=1${S.q}${extra}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000, polling: 50 });
  const loadS = (Date.now() - t0) / 1000;
  await page.evaluate(() => { window.__progs0 = new Set((window.__ctx.renderer.info.programs || []).map((p) => p.cacheKey)); });
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { dcl: n ? Math.round(n.domContentLoadedEventEnd) : 0 }; });
  // startup: first 6 s after ready (everything that compiles / uploads lazily shows up here)
  await page.evaluate(() => { window.__game.setState('playing'); window.__ctx.player.protectUntil = 1e15; });
  await page.waitForTimeout(6000);
  const startup = summarise(await page.evaluate(() => window.__prof.frames.slice(1)));
  const R = { scene: S.name, profile: PROFILE, loadS: r1(loadS), startup, poses: {}, errs };
  for (const pose of S.poses) {
    const ok = await page.evaluate((p) => { window.__prof.reset(); const r = window.__game.pose(p); return r === p; }, pose);
    if (!ok) { R.poses[pose] = { missing: true }; continue; }
    await page.waitForTimeout(1500);
    const first = await page.evaluate(() => window.__prof.frames.splice(0));   // arrival: first 1.5 s at a new spot (compiles, uploads, activation)
    await page.waitForTimeout(SECS * 1000);
    const steady = await page.evaluate(() => window.__prof.frames.splice(0));
    // turn: a steady 360 over 3 s (reveals anything built/compiled on first sight, and turn stutter)
    await page.evaluate(() => { window.__spin = true; const f = () => { if (!window.__spin) return; window.__ctx.input.mouse.dx += 2 * Math.PI / 0.0022 / 180; requestAnimationFrame(f); }; requestAnimationFrame(f); });
    await page.waitForTimeout(3000); await page.evaluate(() => { window.__spin = false; });
    const turn = await page.evaluate(() => window.__prof.frames.splice(0));
    R.poses[pose] = { arrive: summarise(first), steady: summarise(steady), turn: summarise(turn) };
  }
  R.loaf = await page.evaluate(() => window.__loaf.filter((e) => e.t > performance.now() - 1e9).sort((a, b) => b.d - a.d).slice(0, 8));
  R.heapMB = await page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);
  R.state = await page.evaluate(() => window.__ctx.state);
  R.warm = await page.evaluate(() => window.__ctx.perf.warm || null);
  R.lateProgs = await page.evaluate(() => { const c = {}; for (const p of window.__ctx.renderer.info.programs || []) if (!window.__progs0.has(p.cacheKey)) c[p.name] = (c[p.name] || 0) + 1; return c; });
  results.push(R);
  const line = (k, s) => s ? `${k.padEnd(18)} fps ${String(s.fps).padStart(5)}  p50 ${s.p50} p95 ${s.p95} p99 ${s.p99} max ${s.max}  long ${s.long}  cpu ${s.cpu50}/${s.cpu95} gpu ${s.gpu50}/${s.gpu95}  calls ${s.calls} tris ${Math.round(s.tris / 1000)}k progs ${s.progs}(+${s.newProgs})` : `${k} -`;
  console.log(`\n=== ${S.name} [${PROFILE}] load ${R.loadS}s  heap ${R.heapMB}MB  state ${R.state} ${errs.length ? 'ERRORS ' + errs.slice(0, 2).join(' | ') : ''}`);
  console.log(`  warm ${JSON.stringify(R.warm)}  programs compiled after ready: ${JSON.stringify(R.lateProgs)}`);
  console.log(line('startup', startup)); for (const h of startup?.hitches || []) console.log(`    ${h.dt}ms cpu ${h.cpu} gpu ${h.gpu} ${h.cause} | ${h.top}`);
  if (startup) console.log('    avg: ' + startup.parts.join(' · '));
  console.log('  LoAF top: ' + R.loaf.map((e) => `@${(e.t / 1000).toFixed(1)}s ${e.d}ms[${e.scripts.join('; ')}]`).join('\n            '));
  for (const [p, v] of Object.entries(R.poses)) {
    if (v.missing) { console.log(`${p}: missing pose`); continue; }
    for (const k of ['arrive', 'steady', 'turn']) { console.log(line(`${p}.${k}`, v[k])); for (const h of (v[k]?.hitches || []).slice(0, k === 'steady' ? 3 : 2)) console.log(`    ${h.dt}ms cpu ${h.cpu} gpu ${h.gpu} ${h.cause} | ${h.top}`); }
    if (v.steady) console.log('    avg: ' + v.steady.parts.join(' · '));
  }
  await b.close();
}
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(results, null, 1));
