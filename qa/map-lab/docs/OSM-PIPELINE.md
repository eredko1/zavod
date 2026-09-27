# Map development and benchmark lab

Run `./qa/serve.sh` and open [Map lab](http://localhost:8790/qa/map-lab/index.html). This is the only map-tool HTML entry point. Help opens the living pipeline document in the same page, including flow charts, API registry, merge policies, query examples, research references and remaining work. Update Help when changing a source or rule. The lab is enabled on Vercel at `/qa/map-lab/index.html`. Local `.tmp/` snapshots and reports remain excluded.

Auto Coney queries fresh OSM and all registered NYC sources. Choose on map opens the draggable area picker with Coney Island as the default and a next-block-west preset. Zoom changes the basemap scale; the size selector changes the highlighted fetch area. Use this area applies the pending bounds; Cancel/Escape discards them. Fetch area acquires the selected bounds; outside NYC it queries OSM only. Exact coordinates remain available. A pending area disables generation and benchmarking until fetched, while previously loaded source data retains its original bounds. No address/ZIP search is connected. A custom Overpass query is OSM-only, derives its bounds from returned geometry and preserves its exact query text. Areas are limited to 5 km per side. New queries clear the previous source session. Temporary network/time-out and HTTP 429/502/503/504 failures get at most three attempts, with cancelable backoff and retry progress. Permanent query errors and incomplete results are reported; no partial Overpass response is treated as success.

Filter sources/categories in 2D, inspect merge decisions, then Generate 3D. Changes to sources, filters or geometry rules invalidate the generated selection until regenerated. The scene's explicit source-visibility API can reuse existing geometry for experiments. Missing building heights are skipped and logged; OSM floor counts use the configurable metres-per-floor rule. NYC roof heights are converted from feet. Concave footprints and holes are retained. Ground samples provide estimated terrain, excluding roof and bridge elevations. Invalid coordinates are rejected; identical co-located readings are combined, while conflicting elevations at the same coordinate are excluded and logged with all candidates. A complete matching multipolygon replaces repeated outer-member surfaces, retaining fences and different area roles. A building parent must have a usable footprint and height before it can replace a member.

Curb heights prefer numeric OSM measurements, including zero, then supported curb classifications, then the configured 0.15 m default. Metres, centimetres, millimetres and feet are converted to metres. Classification values remain estimates. A mutually covered curb line can transfer its height to NYC geometry; a local point or short segment cannot set the height of an entire longer curb or sidewalk. Zero-height curbs retain their data without a degenerate solid. The queried NYC curb/sidewalk/roadbed layers provide horizontal geometry, not measured vertical offsets, so sidewalk offsets still use a logged default. Point curb measurements are retained; local ramp shaping and the separate NYC pedestrian-ramp survey remain future work. See the [OSM curb tag reference](https://wiki.openstreetmap.org/wiki/Key:kerb).

The lab uses vendored Three.js r186 and Apache ECharts 6.0.0, with no build step or runtime CDN. ECharts loads only after a benchmark finishes, for interactive legends, activity filters, tooltips and timeline zoom. The report appears directly in the page; optional JSON download retains the measurements. It is separate from the authored game and has no IndexedDB handoff, iframe, or auto-loaded fixture data. Models remain untextured. Walk uses WASD, Shift run, mouse look and Esc release, with dimensions defined in [movement.js](../render/movement.js) and footprint building collisions. Click Walk here, then a roof, supported deck or ground surface to start there; walking off edges falls onto the next supporting surface. Props remain visual; interiors, general ceiling collision and game navigation are not implemented. See [physics comparison](PHYSICS-COMPARISON.md).

Building matching follows the versioned [policy catalog](../pipeline/map-merge-rules.js): a unique shared `nycdoitt:bin`/`bin` plus at least 50% sampled intersection-over-union, or the existing 80% geometry threshold without conflicting valid IDs. The geometric identity check is a conservative rule, not a survey tolerance. Borough placeholders such as `3000000` are not identities; repeated IDs, conflicting IDs and weak matches retain geometry and `building-match-review` reasons. [OSM BIN documentation](https://wiki.openstreetmap.org/wiki/Key:nycdoitt:bin) explains placeholder/reused IDs and why an ID alone cannot establish equal geometry. The matcher lives in `pipeline/building-match.js`, shared by the 2D preview and 3D compiler. Identity criteria remain stable; checkbox selection determines which providers participate.

After surfaces are draped and indexed, `render/prop-placement.js` anchors benches and other supported street furniture to the highest visible rendered surface at their mapped point and model foot contacts. All components move together; they no longer follow different terrain samples or start below raised sidewalks. Placement records retain the estimated local base height and emit `surface-placement` log entries. The build measures this step as `propPlacement`; changing roadbed, sidewalk or median visibility recomputes support and updates the existing placement records. It adds no per-frame work. Rigid props on a slope can leave a small gap beneath lower feet; surveyed foundations and adaptive leg lengths are not implemented.

## Module contracts

Source modules are organized by responsibility under `qa/map-lab/`; tests and CLI tools are under `qa/map-lab/`. See the [repository layout](./README.md) and [benchmark architecture](./BENCHMARK-ARCHITECTURE.md). The page URL is unchanged.

| Module | Responsibility |
| --- | --- |
| `area-picker.js`, `area-tiles.js`, `area-view.js` | Isolated draft bounds, native map gestures, viewport-only tile display and Web Mercator picker math; no geometry or benchmark dependencies |
| `map-generator.js` | Owns query session, cancellation, view selection and UI state |
| `api-request.js`, `osm-source.js`, `map-sources.js` | Bounded retries, source adapters, paging and provenance |
| `map-pipeline.js` | Pure source normalization and merge resolution shared by both views |
| `map-preview.js`, `nyc-layers.js`, `source-controls.js` | 2D geometry, inspection and source filters; no independent fetch controller |
| `map-build.js` | Compile resolved data into disposable geometry, terrain and walking surfaces; stage marks and failure cleanup |
| `map-world.js` | Explicit world API, scene ownership, orbit and walking; no benchmark imports |
| `vertex-data.js` | Attribute interpolation through clipping; preserves UVs, colors, custom static channels and material groups |
| `benchmark-runner.js`, `replay-config.js` | Shared repeat driver, replay configuration, asset barrier and scene metadata |
| `map-benchmark.js`, `scenarios.js` | Development-only scope/replay adapter and versioned scenario registry |
| `frame-profiler.js`, `frame-report.js`, `frame-report-view.js` | CPU/GPU instrumentation, statistics/compatibility checks and shared report UI |
| `frame-chart-data.js`, `frame-charts.js` | Exclusive CPU stages and ECharts duration bars/timelines; chart resources disposed before another run |

Build stages are `normalize`, `merge`, `terrainSamples`, `meshes`, `drape`, `baseTerrain`, `surfaceIndex`, and `sceneSwap`. They measure synchronous CPU work, not network time or total GPU compilation. Acquisition timings are recorded separately. The first draw and asset barrier precede warmed frame scenarios.

Fallback reasons are recorded in generation issues and feature attributes; merged curb height choices also carry source IDs and estimate flags in merge decisions. Downloads retain raw source responses, the generation log (coverage, merge decisions, issues, settings and build timings), and benchmark reports. These are explicit exports, not a dependency-aware artifact cache. No Make/Gradle-style incremental runner is installed, and adding one is deferred; do not build a bespoke cache/task framework in this geometry pass.

Future material/texture work belongs in the mesh/material stage of `map-build.js`; add named yields and progress labels for new stages. Generate 3D and benchmark rebuilds paint the current stage before executing it. CPU build timings exclude those paint waits; elapsed time includes them. The loader is hidden during measured frames. Register asynchronous loaders with the profiler, include experiment settings in `sceneMetadata`, and use the same shared runner for comparisons. Attribute preservation is supported now; texture generation and switches are deferred. Do not copy page controllers or add alternate renderer HTML pages.

Terrain surfaces share a 5 m triangle lattice. The base ground is directly indexed, feature triangles are clipped once, and a spatial triangle index supports walking heights. Supported bridge decks and [connected road approaches](INFRASTRUCTURE.md#connected-road-approaches) use separate elevation rules; approach grades retain their estimate flags and leave underpass ground unchanged. Normals are recomputed after draping; UV/color/custom attributes interpolate across cuts. Settled orbit skips WebGL draws. [Profiling instructions](./MAP-PROFILING.md) distinguish CPU work, GPU elapsed time and animation-frame cadence.

## Validation

Node 22+ and installed Chrome are required. Run browser tests sequentially through the verified Xvfb/X11 launcher, which selects ANGLE Vulkan for GPU rendering without desktop windows. Check the reported renderer and GPU timer coverage; headed mode alone does not guarantee hardware acceleration. See [profiling setup](./MAP-PROFILING.md).

```sh
npm run test:benchmark-isolation
xvfb-run -a -s '-screen 0 1600x1200x24' env QA_VIRTUAL_DISPLAY=1 QA_HEADED=1 node qa/map-lab/tests/benchmark-adapter-test.mjs
node qa/map-lab/tests/source-number-test.mjs
node qa/map-lab/tests/api-request-test.mjs
node qa/map-lab/tests/frame-profiler-test.mjs
node qa/map-lab/tests/frame-report-test.mjs
node qa/map-lab/tests/osm-geometry-test.mjs
node qa/map-lab/tests/osm-model-test.mjs
node qa/map-lab/tests/map-merge-test.mjs
xvfb-run -a -s '-screen 0 1600x1200x24' env QA_VIRTUAL_DISPLAY=1 QA_HEADED=1 node qa/map-lab/tests/map-regression-test.mjs
xvfb-run -a -s '-screen 0 1600x1200x24' env QA_VIRTUAL_DISPLAY=1 QA_HEADED=1 node qa/map-lab/tests/map-world-test.mjs
# Optional fresh scene capture (requires internet; offline tests already include pinned input):
xvfb-run -a -s '-screen 0 1600x1200x24' env QA_VIRTUAL_DISPLAY=1 QA_HEADED=1 node qa/map-lab/tests/map-capture.mjs
xvfb-run -a -s '-screen 0 1600x1200x24' env QA_VIRTUAL_DISPLAY=1 QA_HEADED=1 node qa/map-lab/tests/map-generator-test.mjs
xvfb-run -a -s '-screen 0 1600x1200x24' env QA_VIRTUAL_DISPLAY=1 QA_HEADED=1 node qa/map-lab/tests/map-nyc-test.mjs
xvfb-run -a -s '-screen 0 1600x1200x24' env QA_VIRTUAL_DISPLAY=1 QA_HEADED=1 node qa/map-lab/tests/terrain-layer-test.mjs
xvfb-run -a -s '-screen 0 1600x1200x24' env QA_VIRTUAL_DISPLAY=1 QA_HEADED=1 node qa/map-lab/tests/map-frame-profile.mjs --label current
xvfb-run -a -s '-screen 0 1600x1200x24' env QA_VIRTUAL_DISPLAY=1 QA_HEADED=1 node qa/map-lab/tests/frame-profile-browser-test.mjs
```

Pinned regression data and its provenance are tracked in `qa/map-lab/tests/fixtures/`. Fresh captures and reports live in ignored `.tmp/map-lab/`; `map-capture.mjs` collects source responses through the same UI controller and exports a portable scene. Browser tests cover geometry, holes, heights, terrain, normalized vertex attributes, real keyboard walking, source identity, cross-area queries, retries, dynamic filter locking, GPU-drain cancellation and mobile layout. There is no claim that these tests cover the authored game's AI, multiplayer or main loop.

## Tree placement

Tree placement uses [tree-placement.js](../pipeline/tree-placement.js) after vertical resolution and duplicate matching. With merging enabled, tree centres inside ground road/walkway surfaces are excluded beyond the named edge clearance. Polygon holes, planted islands and separate bridge/tunnel levels are preserved. A confirmed tree pair prefers its mapped position outside the conflicting surface, retaining both candidate coordinates and dimension provenance. Generated row points are checked against surfaces, retained individual trees and earlier row points in stable ID order. Exclusions appear in merge/generation logs with surface or represented-tree IDs; they do not erase source observations. Surface widths and clearance margins remain explicit estimates. Disable merging to inspect original positions.

## Source selection and cached visibility

Source/category checkboxes select the inputs to merging. Disabled providers cannot suppress enabled buildings, trees or road segments. The preview resolves the selected sources again while reusing raw SVG paths; Generate 3D compiles the same selection. Hidden records remain in coverage and the original snapshots. The low-level cached 3D visibility API only changes presentation; it does not regenerate alternatives.

## Large-area acquisition and preview

Roadbed and sidewalk merging rejects disjoint polygon bounds before exact segment/edge tests. The SVG preview stores each outline once and references only nearby outlines from local masks; polygon holes and the original geometry remain intact. Building matching caches footprint bounds and parsed BINs for one normalization result, preserving the same identity and overlap rules.

LION first queries the complete spatial object-ID set, then sends geometry requests as form-encoded POST batches. Its server rejected the longer GET batch query with HTTP 404; the same parameters via POST succeeded. Snapshots retain both logical query URLs and actual request methods/bodies for replay. Source logs and acquisition reports separate fetch time from synchronous preview processing (`fetchMs`, `previewMs`); preview time excludes browser paint.

Run `node qa/map-lab/tests/shape-query-test.mjs` and `node qa/map-lab/tests/lion-source-test.mjs`, then `qa/map-lab/tests/map-preview-test.mjs` under the documented Xvfb launcher. These cover exact splitting, holes, bounded SVG storage, complete POST batching and request provenance. Large-area normalization, preview and 3D construction remain synchronous; worker/chunk scheduling is still future work.
