# Repeatable frame profiling

Use this harness to measure where the merged-map viewer spends time, rather than treating a 16.7 ms display interval as 16.7 ms of computation. A development adapter drives the normal movement, collision, ground-query and rendering functions in headed Chrome; the runtime imports no profiler or replay code. Profiling starts only for generation or Benchmark. Normal interactive frames do not install GL wrappers or issue timing queries. `?qa=1` exposes test hooks; the page itself uses explicit module APIs. See [research, overhead measurements and release isolation](./WEBGL-BENCHMARK-REVIEW.md).

## In-page benchmark

Open [Map generator](http://localhost:8790/qa/map-lab/index.html), fetch an area, filter the 2D layers, and Generate 3D. The Benchmark button rebuilds the scene and runs the shared profiler and replay with three repeats, 120 warmup frames and 300 measured frames for each of four scenarios. It displays p95 CPU/GPU/frame/ground timings, draw counts, triangles and a frame chart. Download report exports generation phases, raw frames, resource counters, input fingerprint, route hashes and visible geometry coverage. Generation starts asset tracking before creating the meshes, then waits for tracked assets before enabling Benchmark. Stop cancels the replay; changing tabs cancels hidden-page runs. Unsupported GPU timing remains unavailable.

This is a repeated build and warmed rendering experiment in one context, with named build-stage tables. It is not a cold-load test and does not use the command-line runner's network blocking or served-byte asset manifest. Sources are fetched before timing, and changing area/filter selection invalidates the result. The page does not load saved fixtures automatically.

Charts appear after all repeats complete. “Repeated build stages” contains one timing row per measured scene rebuild (normalization, merge, terrain, meshes, surface index, prop placement and scene swap). It stays hidden while empty. Failed/cancelled runs explain why complete frame charts are unavailable and retain any measured build rows plus the diagnostic download.

## Run and compare

From the project root, with Node 22+ and Google Chrome installed:

Prefer a virtual display for headed browser tests when installed:

```sh
xvfb-run -a -s '-screen 0 1600x1200x24' env QA_HEADED=1 QA_VIRTUAL_DISPLAY=1 TMPDIR="$PWD/.tmp/map-lab" \
  node qa/map-lab/tests/map-generator-test.mjs
```

Check `command -v xvfb-run` first. All map-lab scripts use `qa/browser-launch.mjs`, which verifies that DISPLAY points to Xvfb, forces Chrome's X11 backend and removes its Wayland socket environment. **xvfb-run alone did not isolate earlier tests:** Chrome inherited the Wayland desktop and opened visible windows. Reports marked virtualDisplay before this launcher fix are not verified Xvfb results and must not serve as virtual-display baselines.

If Xvfb is unavailable or fails, ask before opening visible Chrome; only an explicitly approved desktop run may use `QA_VISIBLE=1`. The shared launcher selects ANGLE Vulkan with `--use-angle=vulkan --enable-features=Vulkan --disable-vulkan-surface --enable-gpu`: WebGL and compositing use the GPU, with offscreen presentation to Xvfb. Simply selecting ANGLE Vulkan on this machine accelerated WebGL but left compositing in software; the complete configuration enables both. No package installation or desktop window is required.

Run `qa/map-lab/tests/browser-display-test.mjs` under Xvfb to verify actual process flags, the WebGL renderer and a completed, non-disjoint GPU timer query. This configuration reports **Intel UHD Graphics 620** locally. The CLI benchmark and overhead experiment reject software rendering or disabled GPU compositing rather than silently recording a hardware baseline. Reports record `displayBackend: verified-xvfb-x11-vulkan`; comparisons reject older configurations. Keep desktop and virtual-display measurements separate: offscreen presentation is not a physical monitor's refresh/compositing path. Run browsers sequentially. Chromium documents explicit GPU enablement and ANGLE Vulkan as ways to access hardware in offscreen environments: [GPU hardware guidance](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/using-gpu-hardware-in-headless-chrome.md).

```sh
./qa/serve.sh
xvfb-run -a env QA_VIRTUAL_DISPLAY=1 node qa/map-lab/tests/map-frame-profile.mjs --label baseline
# Make a change, then repeat on the same device and inputs:
xvfb-run -a env QA_VIRTUAL_DISPLAY=1 node qa/map-lab/tests/map-frame-profile.mjs --label candidate \
  --compare .tmp/map-lab/frame-profile-baseline.json
```

A new checkout includes a checksum-verified [pinned Coney input](../tests/fixtures/README.md). The CLI and offline regression tests use it by default. It stores source responses, not meshes, frames or timings: each run builds and renders the current code. To capture fresh API data, run `xvfb-run -a env QA_VIRTUAL_DISPLAY=1 node qa/map-lab/tests/map-capture.mjs`; this requires internet access and exports `scene.json`, a portable input for `--scene`.

Capture and track another area independently:

```sh
xvfb-run -a -s '-screen 0 1600x1200x24' env QA_VIRTUAL_DISPLAY=1 QA_HEADED=1 node qa/map-lab/tests/map-capture.mjs --area 40.5752,-73.9836,40.5799,-73.9798 --output .tmp/map-lab/west
xvfb-run -a -s '-screen 0 1600x1200x24' env QA_VIRTUAL_DISPLAY=1 QA_HEADED=1 node qa/map-lab/tests/map-frame-profile.mjs --scene .tmp/map-lab/west/scene.json --label west-baseline
xvfb-run -a -s '-screen 0 1600x1200x24' env QA_VIRTUAL_DISPLAY=1 QA_HEADED=1 node qa/map-lab/tests/map-frame-profile.mjs --scene .tmp/map-lab/west/scene.json --label west-orbit --modes idle,orbit
```

Keep scene fixtures immutable for comparisons. Outside NYC, capture exports an empty NYC source array and replays OSM alone. The UI can benchmark any fetched area without saving fixtures. CLI results record the scene filename and fingerprint; versions/settings/environment are retained in both entry points.

The runner reads the pinned input or the explicit `--scene` file and aborts external network requests during profiling, so API response time and changing datasets do not enter frame comparisons. The page fetches live data and its Benchmark button uses the currently loaded selection; it never substitutes the pinned test input. The fixture and its provenance manifest are excluded from Vercel and the npm release artifact.

Each label produces a JSON report, an HTML report with a selectable frame chart, and one screenshot per repeat. For example: [baseline report](http://localhost:8790/.tmp/map-lab/frame-profile-baseline.html). These files live in ignored scratch space. Keep baseline and candidate labels distinct; rerunning a label overwrites that label's artifacts.

The default is **three repeats**, each in a fresh browser context, with **120 warmup and 300 measured frames per scenario**:

| Scenario | Work exercised |
| --- | --- |
| Idle | Settled orbit view; control/profiler overhead, no intentional redraws |
| Orbit | Camera rotates around the complete scene; culling, submission and GPU work |
| Walk + turn | Forward movement, light strafing, yaw changes and looking up/down; actual ground and building collision rules |
| Run + turn | The same input pattern at running speed, exercising more movement/collision work |

Replay advances simulation by a fixed 1/60-second tick per sampled frame. That keeps the path identical even when one version renders slowly. Wall-clock duration may therefore differ; this is a deterministic workload test, not a claim about real-time speed during dropped frames. The runner checks position/quaternion hashes across repeats. It bypasses OS keyboard/mouse delivery and pointer lock while using the same simulation functions; `qa/map-lab/tests/map-world-test.mjs` separately checks real input and capture.

Optional flags: `--frames 600 --warmup 180 --repeats 3`, `--width 1920 --height 1080 --dpr 2`, or `--trace`. A quick smoke test is `--frames 60 --warmup 30 --repeats 1`. GPU load depends on actual canvas size, which the report records separately from the viewport.

`--trace` writes a Chrome trace per repeat with timeline and V8 profiling events for deeper CPU, layout, browser and startup investigation. Load the `.trace.json` file in Chrome DevTools Performance. Tracing adds overhead, so traced and untraced runs are separate configurations.

Schema 4 comparisons require a completed baseline with all repeats, matching fixture hash, replay settings and scenario versions, browser/GPU, canvas and generation settings. Earlier schemas must be regenerated: replay ownership and timing boundaries changed. Checks include camera paths, feature/asset identity and actual visible geometry bounds per feature, including instances. Geometry tests remain necessary: equal bounds do not prove equal holes or surface area. Code hashes are recorded but may change—that is what an optimization comparison is for. Use `--allow-content-change` when intentionally comparing added models or textures; this relaxes feature/asset identity checks, not camera/environment/settings checks. It does not make different scenes an apples-to-apples optimization result. Scene failures and final comparison/repeat failures save diagnostics with `status: failed`; externally interrupted reports remain `running`. Animation-loop exceptions reject the active replay, which also has a finite deadline. The profiler has capacity for all four maximum-length scenarios plus startup frames.

## What is measured

| Metric | Meaning |
| --- | --- |
| CPU loop | Elapsed profiled scope inside the animation callback, including query polling and instrumentation; excludes final replay bookkeeping |
| Controls | Orbit/input replay and camera orientation work |
| Simulation | Movement and eye-height update, **including** ground and collision scopes |
| Ground | Time evaluating the nearby walking surfaces; nested within simulation |
| Collision | Building-footprint collision tests; nested within simulation |
| Render submission | CPU time inside `renderer.render`, including transforms, culling, material updates and GL command submission |
| GPU elapsed | Asynchronously measured GL command interval around rendering; separate from CPU submission |
| Frame interval | Time between animation callback starts; affected by refresh cadence, scheduling and missed frames |
| Texture/buffer uploads and shader setup | Count and CPU duration of wrapped GL API calls; nested in render submission when issued there |
| Build phases | Normalization, merge, terrain samples, base meshes, surface projection, base terrain, surface index, prop placement and scene swap |

Reports contain raw frames and p50/p95/p99/max/mean statistics, CPU/GPU budget exceedances, frame intervals over 25 ms, draw calls, submitted triangles, renderer texture/geometry counts, geometry-buffer payload, GPU query status and browser long-task/long-animation-frame observations where supported. Sub-timer-resolution CPU samples may register zero; they do not establish zero cost.

**Do not add nested columns.** Ground and collision are already in simulation; simulation and submission are already in CPU loop. CPU and GPU work can overlap, so adding them does not measure a frame's total cost. GPU timing excludes browser compositing and presentation. A low CPU time alone does not establish GPU headroom.

The in-page report uses vendored Apache ECharts 6.0.0. Each activity has two duration bars: a CPU stack and an independent GPU bar, with a red 16.67 ms target. The CPU stack uses the actual frame at the 95th percentile across repeats, subtracting ground/collision from simulation and keeping remaining loop work separate. It never sums the individual stages' percentiles. GPU shows its own 95th percentile; these bars do not establish synchronized CPU/GPU start times. Click legends to hide/show stages, filter activities, or zoom the per-frame timeline. Missing GPU samples remain unavailable. Raw tables and sample coverage are expandable; JSON download is optional. Charts load after profiling and are disposed before the next benchmark.

The compact **Each frame** chart keeps **First draw (startup)** selected initially and labels every option with its frame count. First draw records two callbacks; only callbacks that redraw have GPU samples, and point markers keep isolated startup samples visible. Startup may include buffer uploads and shader setup if needed; this scope excludes the earlier API fetch and does not directly measure display presentation. Select a walking/running activity for the longer warmed replay. Blue shows CPU work, pink shows GPU work, and optional **Frame spacing** shows the interval between callback starts. Lower durations are better; unused space below the target is not a measurement of GPU utilization or guaranteed spare capacity.

GPU coverage distinguishes **No redraws** from unsupported timers or failed samples. The detail row displays the recorded reason and count, such as timer invalidation, queue saturation or timeout. An unavailable measurement is never displayed as zero milliseconds. Browser timer support and hardware acceleration are separate questions.

GPU timers use `EXT_disjoint_timer_query_webgl2`, with a bounded queue and availability polling. There is no `gl.finish()` and no busy-wait for GPU results. Unsupported timers, invalid/disjoint measurements, queue overflow, context loss and readback timeout remain explicit statuses with null timing; they never become fabricated zero-cost GPU samples. [Timer-query documentation](https://developer.mozilla.org/en-US/docs/Web/API/EXT_disjoint_timer_query), [WebGL guidance](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)

Browser long-task observations cover work the scoped callback may not explain, but are diagnostic events, not another summable CPU phase. They do not capture every small layout, decode, GC or browser task. Use an optional trace when a spike remains unexplained. [Long animation frames](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongAnimationFrameTiming)

## Textures and future content

The harness already measures texture allocation/upload API calls, mipmap generation, buffer uploads and shader compilation/link submission. A browser test renders a real `DataTexture` to verify these counters even while the map itself is untextured. GPU texture sampling stays inside shader execution; it cannot be assigned a trustworthy separate “texture GPU time” by this harness. A controlled textures-on/off experiment or GPU tooling would be required to isolate its effect.

The profiler tracks Three.js's default loading manager and waits for outstanding assets before beginning warmed scenarios. Failed, timed-out or changing tracked assets during measured scenarios invalidate the run, even if a load finishes immediately. Runs must start visible and focused; viewport, visibility or focus changes also invalidate them, including viewport changes with a fixed-size canvas. Repeat sets and comparisons must retain the same viewport and device pixel ratio as well as canvas dimensions and renderer configuration. Both reports must be complete before comparison. Additional custom loading managers must be registered with `profiler.trackLoadingManager(manager)` before `start()`; custom loaders that bypass Three.js loading managers need an equivalent readiness barrier in the runner. Streaming scenes require their own recorded streaming schedule, rather than silently reusing a static-ready scenario.

The command-line runner hashes actual local HTTP response bytes, retaining URL query strings; HTTP failures and changing responses invalidate the run. It fingerprints the runner, page and module files, including Three.js core and addons, and records served code separately. Keep reference textures/models local and stable for repeatable tests; external asset requests are blocked. The first scene draws are separated from warmed measurements, including any uploads and shader setup. A fresh browser context does **not** guarantee cold OS/driver shader caches. CPU time inside `compileShader` or `texImage2D` is API time, not full asynchronous compilation or GPU transfer completion. Three.js may also allocate internal textures even when there are zero texture maps on scene materials.

As new simulation systems are added, wrap their actual work with `profiler.measure('systemName', fn)` and expose that scope in the summary. Preserve nested scope relationships in the report. More shader passes are included in total GPU rendering while they remain inside the measured render scope; if introducing a compositor or multiple passes outside that scope, wrap the complete draw path. Profiling never automatically knows the semantics of a new engine subsystem.

## Validation and interpretation

```sh
node qa/map-lab/tests/frame-profiler-test.mjs
node qa/map-lab/tests/frame-report-test.mjs
node qa/map-lab/tests/record-validity-test.mjs
# Browser tests run sequentially; the chart test builds its own report.
xvfb-run -a -s '-screen 0 1600x1200x24' env QA_HEADED=1 QA_VIRTUAL_DISPLAY=1 node qa/map-lab/tests/map-generator-test.mjs
xvfb-run -a -s '-screen 0 1600x1200x24' env QA_HEADED=1 QA_VIRTUAL_DISPLAY=1 node qa/map-lab/tests/frame-profile-browser-test.mjs
xvfb-run -a -s '-screen 0 1600x1200x24' env QA_HEADED=1 QA_VIRTUAL_DISPLAY=1 node qa/map-lab/tests/map-world-test.mjs
```

Unit checks cover inclusive attribution, uploads, asynchronous GPU results, invalid/unsupported timers, queue limits, context loss, asset readiness and wrapper restoration. Browser checks inject known CPU work, render an actual texture and validate the generated report. Existing geometry tests remain essential: a frame-time improvement is not acceptable if road coverage or building geometry disappears.

Keep the page foreground, run Chrome instances sequentially, record GPU/browser/DPR, and compare multiple repeats. GPU frequency, temperature, power state and other processes can change timings even on the same machine. A 16.7 ms frame cadence can coexist with much smaller CPU/GPU work; report those measurements separately. These tests cover this map lab, not the separately authored multiplayer game or mobile devices.

Validated locally on 26 September 2026: two full three-repeat runs, 300 measured frames per scenario per repeat, matching camera hashes and 901 retained feature IDs. The [verified run](http://localhost:8790/.tmp/map-lab/frame-profile-verified.html) passed comparison compatibility checks, real-texture instrumentation, report/mobile checks and normal walking regressions. A short `--trace` run produced a readable Chrome trace with 8,775 events. The verified run also captured substantial GPU/frame-interval spikes in some repeats despite low CPU-loop time; those samples remain in the report. Their cause has not been isolated, so these results are not a guaranteed 60 FPS capacity limit.

Schema 2 validation: the unified page passed its full three-repeat button run, arbitrary-area switching without stale NYC sources, category/source filtering into 3D, and mobile layout. A follow-up run covered asset tracking around generation, frame-error rejection, cancellation and recovery. The [reviewed offline report](http://localhost:8790/.tmp/map-lab/frame-profile-generator-reviewed.html) completed three fresh-context repeats with matching routes and visible geometry. Terrain area/height preservation, merged-source rendering and actual keyboard walking checks also passed. These local artifacts are not shipped or committed. Earlier spike observations remain unresolved; a successful later run does not explain their cause.


Refactor validation (26 September 2026): the [schema 3 report](http://localhost:8790/.tmp/map-lab/frame-profile-refactored.html) completed three fresh-context repeats with matching routes and visible geometry. Build CPU totals were 1.41–1.51 s; walking/turning p95 CPU was 2.3–2.5 ms and GPU was 14.0–14.4 ms, on Intel UHD 620 at 960 × 653 canvas pixels and DPR 1. Geometry retained 33 buildings, 73 roads/paths and 794 other features. Static buffers grew to 23.49 MiB because clipping now preserves UV channels. This run is a new baseline, not a direct speed comparison with schema 2’s different layout and timing scope. Some GPU frames still exceeded 16.67 ms.

## Current adapter validation

The schema 4 in-page run completed all three repeats with 300 measured frames and 120 warmup frames per scenario. Canvas size stayed fixed at 1180 × 740 pixels, DPR 1, on Intel UHD 620. Walking p95 CPU was 2.5–2.7 ms and GPU was 12.2–14.6 ms, with all 300 walking GPU samples valid in each repeat. This is a new measurement configuration, not a direct comparison with earlier schemas/canvas sizes. The raw report is `.tmp/map-lab/generator-benchmark.json`; the UI displays equivalent charts immediately after a run.

Headed tests also passed actual keyboard walking/collision, terrain/ring/attribute preservation, custom versioned scenarios, resize and mid-run asset invalidation, cancellation during GPU draining, frame-error recovery, chart legend/filter controls and mobile layout. The live neighboring-area query passed all ten sources with `AbortSignal.any`, `timeout` and `throwIfAborted` disabled. The import/release audit passed. Short fresh-context CLI runs additionally exercised a synthetic non-NYC scene with only idle/walking scenarios; these are functional extension tests, not a hardware capacity benchmark.

Independent follow-up validation (26 September 2026): the offline regression input is now tracked and checksum verified. Pure request/profiler/report/asset-window/geometry/model/merge/elevation checks passed; The earlier headed run passed the in-page quick benchmark, real-texture/chart/mobile checks, request/cancel regressions, walking collisions, NYC geometry, shared terrain planes and adapter validity/cleanup. A fresh CLI run (`--label final-review-xvfb --frames 30 --warmup 15 --repeats 2`) passed all four scenarios and repeat identity checks. Its short capture validates operation, not a stable performance baseline. The paired off/on experiment used the inherited Wayland desktop despite being launched through xvfb-run. Its Intel UHD 620 timings are historical desktop observations, not verified virtual-display measurements.

The final NYC pointer regression also passed (single selection, drag-and-return, cancellation), and `qa/review-test.mjs` passed all existing gameplay fixes in the earlier headed run (before Xvfb backend isolation was corrected). The latter covers settings reset, touch triggers, weather audio, cash proximity, malformed actor packets and wave-host validation; it is separate from map frame measurements.

Area-picker validation: `area-view-test.mjs` checks projection, constant selection size, complete bounds and geographic limits. `area-picker-test.mjs` runs headed under Xvfb and covers dragging, zoom, resizing, presets, Cancel/Escape, pending-area isolation, tile errors/cleanup and mobile attribution. Tile requests are intercepted with test responses; cached images are retained normally, so outage tests use previously unseen coordinates. The in-page quick benchmark, request/cancellation regression and adapter checks also passed after integration. The picker requests no tiles while closed and has no geocoding service.

Initial X11/Xvfb revalidation after the Wayland fix, before Vulkan was configured: `browser-display-test.mjs` confirmed the actual Chrome process flag and reported SwiftShader. `area-picker-test.mjs`, `map-generator-test.mjs` with `QA_QUICK=1`, `map-regression-test.mjs`, and `benchmark-adapter-test.mjs` all passed sequentially. That three-repeat in-page functional benchmark returned unavailable GPU timers, correctly displayed as unavailable rather than zero; it is not a hardware baseline.

Hardware Xvfb validation (26 September 2026): the [Vulkan report](http://localhost:8790/.tmp/map-lab/frame-profile-xvfb-vulkan.html) completed all three default repeats on Intel UHD 620, with a 960 × 653 canvas at DPR 1. Every orbit/walk/run scenario retained 300 valid GPU samples per repeat; idle retained none because it did not redraw. Actual process flags, hardware compositing, WebGL renderer and asynchronous timer queries passed the display regression. Walking GPU p95 exceeded 16.67 ms in each repeat, and frame intervals showed missed cadence; this is verified hardware execution, not a 60 FPS guarantee or a direct comparison with desktop results. Raw artifacts remain local and are not committed.
