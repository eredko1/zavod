# WebGL benchmark and renderer review

Reviewed 26 September 2026. There is no universal WebGL benchmark standard or certification for this application. We use established engine/browser patterns, test their implementation, and retain explicit measurement limits.

## Research and project decisions

| Primary reference | Relevant practice | Application here |
| --- | --- | --- |
| [Unity Web profiling](https://docs.unity.com/en-us/engine/6000.5/manual/platform-specific/webgl/building-distribution/web-profile) | Profiler support belongs to development builds. | Runtime modules do not import the benchmark adapter. The release file allowlist excludes QA and charts. |
| [PlayCanvas profiler](https://developer.playcanvas.com/user-manual/optimization/profiler/) | Opt-in profiling distinguishes CPU update and render activity. | The development adapter temporarily wraps normal runtime methods; cleanup restores them on success, cancellation and failure. |
| [Khronos timer-query specification](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/) | Read available GPU results asynchronously, reject disjoint results and delete queries. | Bounded outstanding queries, asynchronous draining, explicit missing statuses; no `gl.finish()` or GPU busy wait. |
| [Chrome Performance reference](https://developer.chrome.com/docs/devtools/performance/reference/) | Capture settings affect overhead; detailed instrumentation is diagnostic. | Optional traces are a separate configuration. ECharts and screenshots run after measured replay. |
| [MotionMark methodology](https://browserbench.org/MotionMark/about.html) | Control display conditions, warm up, repeat and consider uncertainty. | Fixed viewport/DPR, versioned deterministic routes, repeated runs and a paired overhead experiment. MotionMark exercises other browser graphics workloads; its score is not a substitute for this WebGL scene. We do not implement its adaptive complexity or confidence intervals. |
| [Spector.js](https://github.com/BabylonJS/Spector.js), [PlayCanvas GPU tools](https://developer.playcanvas.com/user-manual/optimization/gpu-profiling/) | Inspect frame commands/state or use GPU tools to explain expensive work. | Use separate diagnostic captures for unexplained spikes; do not compare captured runs with uncaptured baselines as equivalent measurements. Neither tool is a release dependency. |
| [Three.js object optimization](https://threejs.org/manual/pages/optimize-lots-of-objects.html), [resource disposal](https://threejs.org/manual/pages/how-to-dispose-of-objects.html) | Reduce unnecessary scene objects/draws and explicitly release owned resources. | Instance repeated props, reuse visibility groups, skip settled orbit draws and dispose replaced meshes/materials. |
| [PlayCanvas batching](https://developer.playcanvas.com/user-manual/graphics/advanced-rendering/batching/), [instancing](https://developer.playcanvas.com/user-manual/graphics/advanced-rendering/hardware-instancing/) | Combine compatible geometry and instance repeated meshes; preserve useful rendering boundaries. | Keep feature provenance and source visibility when grouping meshes. Larger spatial chunks/LOD are future experiments, not blanket merges that remove detail. |

These sources inform our design; they do not establish that our custom terrain, collision or merge rules are an industry standard. The [geometry research](./MAP-RENDERING-DESIGN.md) separately explains the map reconstruction decisions.

## Isolation and release boundary

`render/map-world.js` owns ordinary rendering, camera/input, simulation and scene lifetime. `benchmark/map-benchmark.js` owns replay, scope wrappers and profiling. `benchmark/scenarios.js` owns versioned routes. Nothing under `render/`, `pipeline/` or the authored game's module graph imports the benchmark. Normal rendering has no profiler branches, timing queries or benchmark callbacks.

The lab remains available on the current Vercel deployment by request. It is a development tool shipped alongside the game; opening the game does not load it. That deployment must not be described as excluding all QA files.

There is no compiler or bundler. `package.json` uses npm's `files` allowlist to define an explicit release artifact. `npm pack --pack-destination .tmp` produces a package excluding `qa/`, `vendor/echarts/` and scratch artifacts. `npm run test:benchmark-isolation` parses static imports with Node's VM module parser, audits all game sources including dynamically chosen modules, and checks npm's dry-run file manifest. It guards the current import conventions; arbitrary computed future imports still require review. Vercel does not automatically use this npm artifact: a future release deployment must use the extracted allowlisted package. Existing unrelated game QA hooks in `src/` are outside this map-benchmark exclusion.

## Overhead and interpretation

Run `xvfb-run -a env QA_VIRTUAL_DISPLAY=1 npm run benchmark:overhead`. It replays the same walk/turn path with profiling off/on, alternating AB/BA across four pairs. The same external callback timer measures both modes. The control installs no GL timing/upload wrappers or per-frame profile records. The output is `.tmp/map-lab/benchmark-overhead.json`.

The historical headed experiment on Intel UHD 620 observed paired median CPU deltas of approximately 0–0.1 ms and p95 deltas of approximately −0.1–0 ms. That run was incorrectly labeled virtual-display: Chrome used the inherited Wayland desktop. It must not be used as an Xvfb baseline. The small negative values are measurement noise, not evidence that profiling accelerates rendering. See the raw artifact for device, canvas, samples and ordering. These noisy observations are not a universal overhead bound or a claim of zero overhead. They must not be subtracted from frame reports. The shared external timer and deterministic driver also have cost; an untouched release workload needs external browser tracing for additional evidence, and tracing itself has overhead.

CPU loop timing covers the profiled scope, including query polling and scope instrumentation. It ends before final replay bookkeeping. The overhead experiment measures the enclosing callback as well. GPU elapsed measures submitted GL work, not utilization or presentation latency. CPU/GPU duration bars cannot reconstruct their actual overlap. Missing GPU samples can be biased toward slow frames: reports show incomplete coverage, and comparisons reject partially sampled GPU runs. Unsupported timers still permit CPU-only inspection.

## Review findings and dispositions

| Issue | Finding and disposition |
| --- | --- |
| Abort compatibility | New AbortSignal helpers caused every source to fail on older browsers; replaced and tested with all helpers disabled. |
| Runtime coupling | Renderer owned replay/profiling; moved to a development adapter and guarded the import boundary. |
| Release leakage | Static deployments included QA; added an audited release allowlist while retaining the explicitly requested live lab. |
| Observer overhead | Instrumentation had no control experiment; added paired off/on measurements and documented nonzero cost. |
| Asset drift | A load could finish during measurement and escape the pending-assets check; measured-scenario asset events now invalidate the run. |
| Viewport drift | End-only dimensions missed resize-and-restore; observe dimension mutations, visibility and focus changes. |
| Progress layout | Benchmark progress text changed canvas height during measurement; reserve status space before the run. |
| GPU coverage | Valid-only percentiles could hide missing slow samples; added visible coverage warnings and partial-sample comparison rejection. |
| Scenario coupling | Fixed scenario validation and idle-specific phase relabeling blocked custom routes; added a versioned registry and explicit phases. |
| Fixture coupling | CLI assumed the original NYC block; portable scene input and selectable scenarios remove that restriction. |
| Curb ordering | Conflicting classifications and recorded heights produced order-dependent merges; resolve recorded values first with stable IDs. |
| Empty measurements | Blank/null elevation could become zero; normalize missing values separately while retaining actual zero. |
| Retry classification | Arbitrary programming TypeErrors were retried as network failures; retries now require transport, timeout or eligible HTTP errors. |
| Pagination ties | Nonunique source IDs did not totally order paged SODA results; added `:id` as the stable tie-breaker per [Socrata guidance](https://dev.socrata.com/docs/paging.html). A live dataset can still change during paging; saved responses are the benchmark input. |
| Buffered observers | Disconnect could discard queued diagnostic entries; drain observer records before disconnecting. |
| Report confusion | Quick UI tests could overwrite the full-run report; use distinct artifact names. Older report schemas are historical and not comparable with this refactor. |
| Stale interfaces | Removed an unused movement re-export and corrected outdated runtime/replay ownership documentation and Help links. |

## Independent review follow-up

These findings were reproduced and fixed after the independent review. Regression evidence is recorded in the profiling guide.

| Issue | Finding and disposition |
| --- | --- |
| Spanning loads | An asset pending throughout a measured scenario escaped the event-window check; reconstruct pending counts at scenario start. |
| Empty GPU capture | Zero valid GPU samples could pass comparison validation; reject disjoint/timeout captures while retaining explicitly unsupported CPU-only inspection. |
| Wrapper ownership | Overlapping profilers could strand loading-manager or GL wrappers; enforce exclusive ownership until cleanup. |
| Historical report | The chart test needed an ignored historical HTML report; generate its report from the current instrumentation test. |
| Replay constants | Overhead and CLI defaults duplicated replay settings; use the shared configuration and versioned scenario registry. |
| Control validity | Off/on overhead measurements lacked viewport and asset activity guards; observe both consistently and restore them after each trial. |
| Dead interfaces | Profiler getters and source-control stats were unused; remove them. |
| Terrain coordinates | Terrain reread invalid raw coordinates after normalization rejected them; share strict coordinate validation and log failures. |
| Elevation conflicts | Co-located observations selected an arbitrary first elevation; combine identical readings and log/exclude conflicting locations. |
| Ground tags | Explicit bridge=no, tunnel=no and location=surface prevented valid ground merges; recognize those values without merging elevated structures. |
| Duplicate surfaces | Tagged outer ways repeated their multipolygon surface; preserve a complete matching parent and retain independent boundary solids and provenance. |
| Building suppression | An incomplete or heightless parent could suppress a usable member building; require a renderable parent before suppression. |
| Chart license | Vendored ECharts lacked its bundled d3 license; restore the upstream license text. |
| Map attribution | Source attribution was confined to Help; add visible map attribution in both views. |
| Scratch deployment | Screenshot/reference scratch directories could reach Vercel; restore their exclusions and exclude pinned test fixtures. |
| Stale Help | Help duplicated historical measurements and stale source/log descriptions; replace them with current behavior and links. |
| Fixture portability | Offline tests required untracked API captures; check in a compressed immutable input with checksum, queries, dates and attribution. |
| Pointer duplication | Per-path and delegated NYC pointer handlers overlapped; use one gesture owner, ignore native duplicate clicks and retain drag/cancel state. |

## Remaining limits

The harness measures the lab; authored game scenes need their own adapter/routes. Fixed warmup and short repeated runs do not prove thermal stability or long-session performance. GPU spikes remain unexplained, so there is no guaranteed 60 FPS claim. The map still uses estimated terrain/curb offsets where measurements are missing, does not support bridge-level pedestrian navigation, and has no textures, streaming or worker generation yet. Bounding-box coverage comparisons complement geometry tests; equal bounds alone do not prove equal polygon interiors.

The live neighboring-area smoke test fetched every source and drew the scene. Its generation log still contains incomplete boundary footprints from bounded Overpass geometry and missing heights; those features are skipped explicitly. See `.tmp/map-lab/live-smoke.json` and `live-neighbor.png` for the actual source counts, errors and rendered result. Successful acquisition does not mean every source record can produce a complete model.

Review loops cover pure rules, browser lifecycle/failure tests, headed end-to-end generation/replay, actual pointer-lock walking, terrain geometry, release isolation and live acquisition. Test artifacts and commands are indexed in [profiling instructions](./MAP-PROFILING.md).

## Area-picker review

| Issue | Finding and disposition |
| --- | --- |
| Pending area | Unfetched bounds could be mixed with loaded data; keep picker drafts separate and disable generation until a fetch. |
| Missing bounds | Empty coordinate fields became zero and missing object keys escaped validation; use numeric input validity and require all four finite bounds. |
| Tile lifecycle | Picker imagery must not load during replay or while hidden; request viewport tiles only while the dialog is open and cancel its scheduler on close. |
| Dragged tiles | Tiles leaving the viewport could retain stale positions during a drag; reposition existing images before loading the settled viewport. |
| Merged visibility | Hiding a canonical source does not restore its suppressed counterpart; documented as a deferred minor limitation with merge-log provenance and an unmerged inspection option. |

No address/ZIP service or additional JavaScript library was introduced. OSM tiles are a presentation-only external service, recorded in the dependency inventory.

Additional review findings: the first tile-outage test reused already decoded images and never exercised a failed request; it now uses an uncached area, preserving normal production caching. Old AGENTS.md wording described graphics checks as headless despite the Xvfb preference; it now explicitly requires headed Chrome under Xvfb for graphics/map-lab checks. Unused tile-layout positions were removed after the drag renderer took ownership of image positioning.

## Display isolation correction

**Wayland bypass:** xvfb-run left WAYLAND_DISPLAY and XDG_SESSION_TYPE=wayland inherited. A diagnostic with a nonexistent Wayland socket reproduced Chrome selecting Wayland and failing despite a valid Xvfb DISPLAY. Earlier claims of verified virtual-display isolation were incorrect. The shared launcher now verifies the Xvfb server, forces X11, removes Wayland access, and rejects unapproved desktop launches. A process-level regression confirms the flag in the running Chrome process.

**Software backend:** the initial isolated X11 configuration selected SwiftShader. Selecting ANGLE Vulkan enabled Intel WebGL rendering, but Chrome compositing remained software until Vulkan compositing and offscreen surfaces were configured. The launcher now enables both and the display test checks actual WebGL renderer identity and completed GPU timing, beyond device enumeration. CLI performance runs reject software rendering/compositing. Their configuration distinguishes this backend from old reports; desktop and offscreen presentation remain separate measurement environments. See [GPU launch configuration](./MAP-PROFILING.md).

**Dialog lifecycle:** a picker test asserted image removal before the asynchronous close event ran; the assertion now waits for that lifecycle cleanup. **Unchanged bounds:** applying identical picker bounds unnecessarily invalidated the loaded scene; it now preserves it.

## Building, prop and report follow-up

- **Ignored identity:** shifted OSM/NYC buildings with matching BINs failed the geometry-only 80% rule; policy 5 now uses unique shared IDs with a geometry sanity check. Real Hampton/Hastings source records are pinned in a small separate regression fixture.
- **Silent retention:** below-threshold building candidates had only a generic retained message; substantial unresolved overlaps and identity conflicts now expose candidate IDs, overlap scores and rejection reasons. Three high-overlap Coney fixture pairs have conflicting BINs and are now retained for review rather than silently suppressed.
- **Buried props:** terrain draping ignored raised walking surfaces and placed bench components independently; a measured build stage now places each rigid assembly on the rendered surface at its point and foot contacts, with an estimated-placement log.
- **Empty results:** repeated build details were exposed before data existed; the section now stays hidden until populated, including available build diagnostics after failed/cancelled runs. Completed in-page tests verify charts and all repeat rows.
- **Unused lookup:** removed an unused feature-ID map in the merge pass.

Remaining limitations: source filters do not reinstate merged originals; unresolved identity/footprint conflicts deliberately remain visible; rigid prop feet are not individually reshaped for sloped terrain. See the pipeline and profiling documents for scope.

Validation: live capture reproduced the screenshot's 2,483 OSM elements and 226 NYC buildings; policy 5 resolved 178 building pairs compared with 68 under the previous rule. The two-source replay confirmed identical suppression in 2D and 3D. Pure merge tests include captured source records, invalid/repeated/conflicting IDs and order independence. GPU/Xvfb tests passed flat/sloped bench foot contact, the three-repeat quick in-page report with chart/build rows, cancellation/failure diagnostics, and terrain area/height/walking-index preservation. This targeted pass does not establish a new full-length performance baseline.

## Commit preparation review

| Issue | Finding and disposition |
| --- | --- |
| Hidden support | Hidden sidewalks still supported props; apply source visibility before placement and re-anchor assemblies when supporting layers change. |
| Stale export | Selecting new data left the previous generation log downloadable; disable that export until the new generation succeeds. |
| Initial focus | Environment checks watched changes but accepted runs starting hidden or unfocused; reject both initial conditions. |
| Comparison dimensions | Equal canvas dimensions could mask different viewports or device pixel ratios; compare both in repeat and comparison validation. |
| Launcher bypass | The stair regression still launched Chrome directly; use the shared Xvfb-aware launcher. |
| Fixture alias | The new viewport regression shared metadata between repeats; give the modified repeat its own metadata object so the test exercises a mismatch. |

The placement reproduction now reports zero gap above visible ground with sidewalks hidden, and loading different data disables the stale generation download. No per-frame placement pass or new dependencies were added.

Validation passed: pure request, area, profiler/report, validity, numeric, geometry/model and merge suites; sequential Xvfb browser checks for surface props, benchmark adapters, the quick three-repeat generator/report, terrain layers, area picker and regression flows. The runtime import and release-file audit passed. Gameplay review and stair regressions passed separately for the original fixes. The report screenshot was inspected for actual rendered charts. Quick GPU samples still exceeded the frame target; this review does not replace a full performance baseline.

## Post-commit review

| Issue | Finding and disposition |
| --- | --- |
| Fixed-canvas resize | Replay validation missed viewport changes when canvas dimensions stayed constant; record viewport dimensions in the live environment guard, including resize-and-restore. |
| Candidate status | Comparison validation accepted failed, cancelled or running candidates with full frame counts; require a completed candidate and finalize the CLI capture before comparing. |
| Duplicate state | The renderer kept an unused source alias and getter alongside its selection; remove the redundant state and accessor. |
| Offset wording | Raised-surface logs described the curb offset as height above ground; name the reference road surface to match the geometry rule. |

Validation: all nine pure suites and eleven sequential browser suites passed, including real fixed-canvas viewport resize-and-restore, GPU display isolation, walking, NYC layers, terrain/prop placement, charts, picker and failure recovery. A short two-repeat CLI baseline and candidate comparison both completed. These captures exercise validation rather than establish a performance baseline; GPU costs and frame cadence remain variable. Original gameplay changes were reread; their preceding gameplay and stair results remain applicable because this pass changed only the map lab.

## Chart clarity follow-up

- **Startup samples:** the initial two-callback view lacked context; keep it selected, label startup and frame counts, and show dots for isolated samples that cannot form a line.
- **Missing reasons:** GPU unavailability hid the distinction between no redraws and timer failures; show recorded status counts and omit misleading “Unavailable ms” units.
- **Sparse layout:** large row spacing separated related measurements; compact both charts and label CPU work, GPU work and optional frame spacing.
- **Numeric labels:** floating-point axis endpoints and singular frame counts were awkward to read; format labels without changing measured values.

Pure report/profiler tests and the chart interaction, mobile, unsupported-timer and quick in-page report checks passed. After the final label/point polish, an additional browser run stalled while initializing the world; its logs repeatedly reported “Failed to initialize Skia for SharedContextState.” That isolated test was stopped without changing the launcher or adding retries. Final label formatting passed syntax checks; the extra visual recheck remains incomplete.
