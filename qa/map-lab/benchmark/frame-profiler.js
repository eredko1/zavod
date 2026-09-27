// Opt-in QA instrumentation. CPU scopes are inclusive; GPU queries are read asynchronously.
import { MAX_PROFILE_FRAMES } from './replay-config.js';
const managerOwners=new WeakMap(), contextOwners=new WeakMap();
export const gpuStatusCounts=frames=>frames.reduce((counts,f)=>{const status=f.gpuStatus||'unknown';counts[status]=(counts[status]||0)+1;return counts;},{});
export function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a,b) => a-b), n = sorted.length;
  if (!n) return { samples: 0, mean: null, p50: null, p95: null, p99: null, max: null };
  const at = q => sorted[Math.ceil(q*n)-1];
  return { samples: n, mean: sorted.reduce((s,v) => s+v,0)/n, p50: at(.5), p95: at(.95), p99: at(.99), max: sorted[n-1] };
}
export function createFrameProfiler(renderer, { clock = () => performance.now(), maxPending = 8 } = {}) {
  const gl = renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  let active = false, frame = null, frames = [], events = [], builds = [], build = null, pending = [], previous = null, origin = 0, observers = [], restored = [], longTasks = [], disjoint = false;
  const managers = []; let pendingAssets = 0, assetEvents = [], assetCounts = new Map();
  const collectEntries = entries => { for (const e of entries) if (e.startTime >= origin && longTasks.length < 500) longTasks.push({ type:e.entryType, startMs:e.startTime-origin, durationMs:e.duration, blockingDurationMs:e.blockingDuration ?? null }); };
  const record = (name, ms) => { if (!frame) return; frame.cpu[name] = (frame.cpu[name] || 0)+ms; frame.calls[name] = (frame.calls[name] || 0)+1; };
  const discard = status => { for (const p of pending) { p.frame.gpuStatus = status; gl.deleteQuery(p.query); } pending = []; };
  function poll() {
    if (!ext || gl.isContextLost()) { discard('context-lost'); return; }
    disjoint = !!gl.getParameter(ext.GPU_DISJOINT_EXT);
    if (disjoint) { discard('disjoint'); return; }
    pending = pending.filter(p => {
      if (!gl.getQueryParameter(p.query,gl.QUERY_RESULT_AVAILABLE)) return true;
      const ns = gl.getQueryParameter(p.query,gl.QUERY_RESULT); p.frame.gpuMs = ns/1e6; p.frame.gpuStatus = 'valid'; gl.deleteQuery(p.query); return false;
    });
  }
  function wrap(name, kind) {
    const original = gl[name]; if (!original) return;
    const wrapped = function(...args) { const start = clock(); try { return original.apply(this,args); } finally {
      if (active) { const ms = clock()-start, target = frame?.resources || events; target.push({ kind, api: name, cpuMs: ms, atMs: start-origin }); }
    } };
    gl[name] = wrapped; restored.push(() => { if (gl[name] === wrapped) gl[name] = original; });
  }
  const api = {
    get active() { return active; },
    get busy() { return active || pending.length>0 || restored.length>0; },
    trackLoadingManager(manager) { if (api.busy) throw Error('Register loading managers before profiling'); if (!managers.includes(manager)) managers.push(manager); },
    async waitForAssets(timeoutMs = 15000) {
      const start = performance.now();
      while (pendingAssets && performance.now()-start < timeoutMs) await new Promise(resolve => setTimeout(resolve,16));
      if (pendingAssets) throw Error(`Timed out waiting for ${pendingAssets} tracked assets`);
      if (assetEvents.some(e => e.kind === 'error')) throw Error('An asset failed to load; see profiler asset events');
      return performance.now()-start;
    },
    start() {
      if (api.busy) throw Error('Profiler already running or GPU results still pending');
      if(contextOwners.has(gl))throw Error('WebGL context is already being profiled');
      if(managers.some(manager=>managerOwners.has(manager)))throw Error('Loading manager is already being profiled');
      frames = []; events = []; builds = []; longTasks = []; assetEvents = []; assetCounts = new Map(); pendingAssets = 0; previous = null; origin = clock(); active = true;
      contextOwners.set(gl,api);restored.push(()=>contextOwners.delete(gl));
      for(const manager of managers){managerOwners.set(manager,api);restored.push(()=>managerOwners.delete(manager));}
      for (const manager of managers) for (const [name,kind] of [['itemStart','start'],['itemEnd','end'],['itemError','error']]) {
        const original = manager[name], wrapped = function(...args) { if (active) { const url = String(args[0]), count = assetCounts.get(url)||0; if (kind === 'start') { assetCounts.set(url,count+1); pendingAssets++; } else if (kind === 'end' && count) { assetCounts.set(url,count-1); pendingAssets--; } assetEvents.push({ kind, url, atMs: clock()-origin }); } return original.apply(this,args); };
        manager[name] = wrapped; restored.push(() => { if (manager[name] === wrapped) manager[name] = original; });
      }
      for (const name of ['texImage2D','texSubImage2D','texImage3D','texSubImage3D','compressedTexImage2D','compressedTexSubImage2D','compressedTexImage3D','compressedTexSubImage3D','texStorage2D','texStorage3D','generateMipmap']) wrap(name,'textureUpload');
      for (const name of ['bufferData','bufferSubData']) wrap(name,'bufferUpload');
      for (const name of ['compileShader','linkProgram']) wrap(name,'shaderSetup');
      if (typeof PerformanceObserver !== 'undefined') for (const type of ['longtask','long-animation-frame']) if (PerformanceObserver.supportedEntryTypes.includes(type)) {
        const observer = new PerformanceObserver(list => collectEntries(list.getEntries()));
        observer.observe({ type, buffered: false }); observers.push(observer);
      }
    },
    beginFrame(phase = 'interactive') {
      if (!active) { if (pending.length) poll(); return; }
      const start = clock(); poll();
      if (frame) throw Error('Unclosed profiling frame');
      if (frames.length >= MAX_PROFILE_FRAMES) throw Error('Profiler frame limit reached');
      frame = { id: frames.length, phase, startMs: start-origin, intervalMs: previous === null ? null : start-previous, cpu: {}, calls: {}, resources: [], rendered: false, gpuMs: null, gpuStatus: 'not-rendered', visible: typeof document === 'undefined' || document.visibilityState === 'visible' };
      previous = start; frame.cpu.profilerPoll = clock()-start; frames.push(frame);
    },
    measure(name, fn) { if (!active || !frame) return fn(); const start = clock(); try { return fn(); } finally { record(name,clock()-start); } },
    render(fn) {
      if (!active || !frame) return fn();
      let query = null; frame.rendered = true;
      if (!ext) frame.gpuStatus = 'unsupported';
      else if (disjoint) frame.gpuStatus = 'disjoint';
      else if (gl.isContextLost()) frame.gpuStatus = 'context-lost';
      else if (pending.length >= maxPending) frame.gpuStatus = 'queue-full';
      else { query = gl.createQuery(); if (query) { gl.beginQuery(ext.TIME_ELAPSED_EXT,query); frame.gpuStatus = 'pending'; } else frame.gpuStatus = 'allocation-failed'; }
      try { return api.measure('renderSubmit',fn); }
      finally {
        if (query) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push({ query, frame }); }
        frame.drawCalls = renderer.info.render.calls; frame.triangles = renderer.info.render.triangles;
        frame.textures = renderer.info.memory.textures; frame.geometries = renderer.info.memory.geometries;
      }
    },
    endFrame(pose) {
      if (!frame) return;
      frame.pose = pose; frame.cpu.loop = clock()-origin-frame.startMs;
      frame.cpu.other = Math.max(0,frame.cpu.loop-(frame.cpu.controls||0)-(frame.cpu.simulation||0)-(frame.cpu.renderSubmit||0)); frame = null;
    },
    abortFrame(error) { if (frame) { frame.error = error.message; api.endFrame(null); } },
    beginBuild(meta = {}) { if (active) { const start = clock(); build = { ...meta, startMs: start-origin, phases: {}, stamp: start }; builds.push(build); } },
    buildMark(name,durationMs) { if (build) { const now = clock(); build.phases[name] = durationMs??now-build.stamp; build.stamp = now; } },
    endBuild() { if (build) { build.wallMs = clock()-origin-build.startMs; build.totalMs=Object.values(build.phases).reduce((sum,ms)=>sum+ms,0);build.yieldMs=Math.max(0,build.wallMs-build.totalMs);delete build.stamp; build = null; } },
    async stop() {
      if (frame) throw Error('Cannot stop inside a frame');
      active = false; build = null;
      for (const observer of observers) {collectEntries(observer.takeRecords());observer.disconnect();} observers = [];
      const deadline = performance.now()+2000;
      while (pending.length && performance.now() < deadline) { poll(); if (pending.length) await new Promise(resolve => setTimeout(resolve,16)); }
      discard('timeout');
      for (const restore of restored) restore(); restored = [];
      return { gpuSupported: !!ext, frames, builds, resourceEventsOutsideFrames: events, assetEvents, pendingAssets, longTasks, notes: ['CPU scopes are inclusive: ground and collision are inside simulation; upload/setup API durations are inside renderSubmit.', 'GPU elapsed time includes all commands in the draw scope, including any uploads. It excludes presentation/compositor latency.', 'Texture sampling cost is part of GPU shading and is not separately measurable here. Upload API CPU time is not GPU transfer time.', 'CPU and GPU overlap. Do not add their timings or subtract RAF cadence to infer headroom.'] };
    }
  };
  return api;
}
