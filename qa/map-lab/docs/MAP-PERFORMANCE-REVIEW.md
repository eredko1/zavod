# Map geometry performance review — 26 September 2026

Start with the [unified local generator](../index.html): choose bounds or Auto Coney, inspect/filter 2D, Generate 3D, then Benchmark. The [Help & pipeline](../index.html#pipeline) page documents usage, source APIs, rules, dependencies and remaining work. The lab is enabled on Vercel; local scratch data in `.tmp/` remains excluded.

The first optimization pass is implemented locally. Keep Three.js/WebGL2: removing redundant subdivision and accelerating walking queries improves this scene without removing mapped features. No renderer libraries were added; OSM2World and Streets GL are implementation references.

**New: scoped CPU/GPU profiling.** The [repeatable frame harness](./MAP-PROFILING.md) measures controls, simulation, ground queries, collision and render submission separately; asynchronous GPU queries measure the drawing command interval. It includes walking while rotating, first-render resource uploads, asset readiness and a saved-run comparison. [Open the verified report](http://localhost:8790/.tmp/map-lab/frame-profile-verified.html). The older frame intervals below describe cadence, not percentage of the CPU/GPU budget used.

The [source-code research and design](./MAP-RENDERING-DESIGN.md) provides pinned upstream references and distinguishes implemented work from later extensions.

## Implemented optimization and repeatable benchmark

The historical `qa/map-render-benchmark.mjs` (now retired in favor of the shared frame harness) measured three warm combined builds, 69 individual ground queries (three passes over 23 locations), source visibility changes, and 3.5 seconds of real WASD walking with mouse capture. Both runs used the same saved responses, input hash, headed Chrome 154, Intel UHD 620, 1280 × 800 viewport, 930 × 800 canvas and DPR 1.

| Measurement | Before optimization | After optimization |
| --- | ---: | ---: |
| Combined build median, three runs | 6,334 ms | 2,242 ms |
| Stored mesh triangles | 956,171 | 314,242 |
| Geometry / instance buffer payload | 66.15 MiB | 18.47 MiB |
| Ground query p95 | 58.7 ms | 0.1 ms |
| Visibility toggle | 5,855 ms, rebuild | 13.7 ms, reuse |
| Walking frame interval p50 / p95 | 183.3 / 216.6 ms | 16.7 / 16.7 ms |
| Walking frames sampled | 17 | 210 |
| Overview draw calls | 225 | 232 |

Both scenes retain **33 rendered buildings, 73 roads/paths and 794 other geometry features**, identical coverage counts, 27 merge matches, 94 suppressed duplicate records and the same one missing-height error. Buildings retain 1,612 triangles. The reduction comes from terrain/surface subdivision, not simplifying building footprints or deleting small features.

The optimized median query registered zero at the browser timer's resolution; that does not mean zero computation. The p95 is reported instead. RAF timing measures the observed application frame interval, not isolated GPU cost. Geometry payload excludes JavaScript allocations (including the new spatial index), temporary buffers, driver allocations and render targets. These are local desktop measurements, not a mobile or full-game guarantee. The before run walked less distance because the existing controller caps simulation time per frame; the after run traveled approximately 4.92 m in 3.5 s, close to the intended 1.4 m/s.

What changed:

- Base terrain is generated directly as an indexed 5 m grid; flat mode needs only two ground triangles.
- Original surface triangles are projected once, visiting only covered row spans. The old recursive pre-subdivision is removed.
- Walking uses a 10 m spatial index of the actual rendered surface triangles plus direct terrain interpolation. It respects holes and source visibility. Picking still uses raycasting on visible objects.
- Source visibility reuses the merged model, meshes and buffers, preserving the camera. Prop batches are separated by source for independent visibility, accounting for the seven additional overview draw calls.
- A settled orbit view skips WebGL draws; orbit damping and walking still update correctly. The animation callback remains active for controls and input.

Changes in API data, merge rules, terrain mode, storey height or curb height still rebuild the scene. The approximately 2.2 s synchronous full build remains a future worker/incremental-generation opportunity. The height index preserves the current flattened-surface behavior; bridge-level navigation remains unimplemented.

Validation passed in headed Chrome: 2,025 surface-separation probes; plane checks on all 312,194 terrain/surface triangles; 240 indexed-height comparisons against reference rays (maximum discrepancy approximately 0.000000024 m); per-feature projected area preservation (maximum difference 0.0011 m²); transformed courtyard holes; hidden-source exclusion; mesh/camera/merge identity across toggles; and zero redraws over 30 settled orbit frames. OSM, NYC and merged-scene browser regressions also passed, including height errors, building collisions, source handoff and mobile layout. Screenshot inspection confirmed the basic merged scene remains visible without the earlier triangular terrain bleed.

Run from the project root with Node 22+ and the local server running:

```sh
xvfb-run -a -s '-screen 0 1600x1200x24' env QA_VIRTUAL_DISPLAY=1 QA_HEADED=1 TMPDIR="$PWD/.tmp/map-lab" node qa/map-lab/tests/map-frame-profile.mjs --label current
xvfb-run -a -s '-screen 0 1600x1200x24' env QA_VIRTUAL_DISPLAY=1 QA_HEADED=1 TMPDIR="$PWD/.tmp/map-lab" node qa/map-lab/tests/terrain-layer-test.mjs
```

The current harness uses fixtures captured by `qa/map-lab/tests/map-capture.mjs` and writes `frame-profile-LABEL.json` and `.html`. See [MAP-PROFILING.md](./MAP-PROFILING.md) for the current schema and comparison requirements. The table above is historical and its walking statistic is animation-frame cadence, not CPU/GPU work. The original source-interception benchmark has been removed; record a fresh baseline with the current harness.

## Rendering layer: recommendation and remaining options

Use **Three.js WebGLRenderer** for the current untextured, walkable scene. It uses WebGL2 and exposes render statistics, instancing and shader precompilation. This recommendation follows the measured improvement in our existing renderer; it is not a claim that Three.js is universally faster. [Renderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html), [instancing](https://threejs.org/docs/pages/InstancedMesh.html)

Babylon.js and PlayCanvas document the same families of optimizations: instancing, reducing repeated scene work and batching compatible meshes. Their documentation supplies no evidence that changing engines would improve this particular workload. [Babylon optimization guide](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/scene/optimize_your_scene.md), [PlayCanvas batching](https://developer.playcanvas.com/user-manual/graphics/advanced-rendering/batching/)

Rendering only when a map view changes is explicitly recommended by Three.js's on-demand rendering guide and is now applied to our settled orbit view. [Three.js guide](https://threejs.org/manual/pages/rendering-on-demand.html)

Further renderer experiments should be measured individually: spatial material batches for culling/draw calls, shader prewarming to reduce first-frame stalls, backing-buffer resolution on high-DPI screens, and depth-buffer configurations with precision/separation tests. Keep the current depth configuration for now; switching it is not necessary for this measured improvement. Avoid removing geometry detail to address a CPU query problem. [WebGL guidance](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)

Three.js also provides WebGPURenderer with a WebGL2 fallback. Treat migration as a separate compatibility and performance experiment if later profiling shows a renderer bottleneck. No WebGPU speedup has been measured here. [WebGPURenderer](https://threejs.org/docs/pages/WebGPURenderer.html)

## Historical measurements: initial shared-grid experiment

Headed Chrome 154 reported `ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (WHL GT2), OpenGL ES 3.2)`. Viewport 1280 × 800; canvas 930 × 800; device pixel ratio 1. All variants used the same fetched OSM and nine NYC snapshots, initial camera, merge rules and visible features. Each included 33 buildings and 794 other features. The previous terrain algorithm was reconstructed through browser response interception; production files were not reverted for the comparison. The flat variant is a diagnostic control and has no elevation fidelity.

| Measurement | Previous terrain, with bleed | Shared-grid experiment | Flat control |
| --- | ---: | ---: | ---: |
| Synchronous combined build | 567 ms | 4,481 ms | 405 ms |
| Stored mesh triangles¹ | 75,642 | 956,171 | 39,622 |
| Geometry / instance buffer payload² | 5.69 MiB | 66.15 MiB | 1.72 MiB |
| Draw calls at overview | 225 | 225 | 226 |
| Submitted triangles at overview³ | 187,010 | 1,067,539 | 150,990 |
| Ground query median | 1.7 ms | 30.9 ms | 1.8 ms |
| Ground query p95 | 2.8 ms | 38.8 ms | 5.1 ms |
| Stationary frame interval median | 16.7 ms | 16.7 ms | 16.7 ms |

¹ Counts geometry triangles per mesh, including prototype geometry once per instanced batch; excludes line primitives. ² Measured typed-array payload, not total process or GPU memory. It excludes driver allocations, render targets, JavaScript objects and temporary generation allocations. ³ Includes rendered instances, hence larger than stored triangle counts.

Method limits: one combined build per variant; 35 measured stationary frame intervals after five warm-up frames; 23 ground query positions. Build timings are indicative, not repeated statistical benchmarks. RAF cadence is refresh-limited and is not isolated GPU time. This was not an active-walking, phone, high-DPI, long-session or full-game benchmark. The short 60 FPS stationary result does not demonstrate enough CPU headroom for walking.

The earlier headless run reported SwiftShader software rendering, not hardware acceleration. Its frame rates are not used to judge normal GPU performance. That run still reproduced the generation/memory regression.

Reproduction scripts and raw output are in ignored project scratch space:

- `.tmp/map-lab/performance-review.mjs`
- `.tmp/map-lab/performance-review-headed.json`
- `.tmp/map-lab/performance-review.json` (software-rendered run)

Run with Node 22 and installed Chrome, sequentially: `PERF_HEADED=1 TMPDIR="$PWD/.tmp/map-lab" node .tmp/map-lab/performance-review.mjs`. The script explicitly replays QA snapshots; the normal UI does not read these files.

## Review findings, in priority order

1. **P1 — Surface subdivision creates a 12.6× triangle increase and an approximately 7.9× build-time increase.** `map-terrain.js:70` converts meshes to non-indexed triangles, recursively subdivides them, then clips every resulting triangle to grid cells and diagonals. The original triangle boundaries and recursive split boundaries survive as extra fragments. The base ground, created as an unrelated plane grid in `osm-3d.js:82`, also goes through this process. It alone becomes 363,258 triangles; NYC roadbeds add 261,482 and sidewalks add 219,372. Those three categories account for roughly 88% of stored triangles. Feature draping takes 2,466 ms and base-ground generation/draping takes 1,587 ms: together approximately 90% of the 4,481 ms build.

   Recommendation: build the base ground directly on the shared lattice with shared vertex indices. Clip surface boundaries against terrain cells once, without preserving unnecessary source triangulation and recursive diagonals. Retain holes and merge provenance. Clip or chunk geometry outside the playable/query region after preserving original source records. Sharing a terrain surface is the correctness requirement; the current subdivision algorithm is not a requirement.

2. **P1 — Walking repeatedly raycasts the dense visible surfaces.** `osm-3d.js:52` creates a raycaster and intersects all walkable meshes for each ground query. `osm-walk.js:6` calls it while checking movement along each axis, and the animation loop queries it again for eye height. A single median query is already 30.9 ms; multiple queries can consume most of a frame before rendering.

   Recommendation without a new library: index candidate road/sidewalk/terrain triangles by local spatial cell, then interpolate the top applicable surface at the player's XY location. Reuse this same resolved surface representation for drawing and ground queries, including holes and curb offsets. Preserve a separate path for future bridges and other stacked surfaces. Validate equivalence against the existing downward raycast before replacing it. A BVH is another established acceleration technique; the main game already vendors one, but no BVH integration or benchmark was performed for the viewer after the user requested keeping the generator free of added libraries.

3. **P2 — Display changes regenerate the whole world synchronously.** Source visibility callbacks and OSM checkbox changes in `osm-3d.js:95` re-normalize, re-merge, re-mesh and re-drape everything. With the current experiment this can block the UI for seconds even when only a layer's visibility changes. Each arriving source also rebuilds the accumulated scene.

   Recommendation: cache normalized source plans, merge results and generated geometry by data/rule version. Toggle scene-group visibility for display-only changes. Update only affected groups when sources or rules change. After reducing unnecessary work, move expensive pure geometry generation into a browser worker if needed; a worker does not reduce triangle count or total computation by itself.

4. **P2 — Non-indexed surface buffers and continuous idle rendering leave additional savings.** The terrain pass duplicates vertex records per triangle; the current measured buffers total 66.15 MiB. The viewer also runs its rendering loop while the orbit view is still. Both are worth addressing after the two P1 issues.

   Recommendation: use indexed geometry where position, normal and other vertex attributes agree. Preserve normal/material seams instead of blindly welding everything. Render on changes while orbiting, continuing frames until damping settles; keep continuous rendering while walking. Consider spatial material batches only after measuring draw-call pressure, so batching does not remove useful culling or picking identity.

Buildings are not the primary geometry cost: all 33 rendered building solids total 1,612 triangles. Repeated props already use eight instanced batches for 7,261 component instances. Reducing the 215 trees or switching renderers is not supported as the first optimization by these measurements.

## Published guidance and how it applies

- [Three.js BufferGeometry](https://threejs.org/docs/pages/BufferGeometry.html#index) supports shared vertex indices and documents attribute/normal behavior. This supports investigating the current loss of indexing.
- [Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) reduces draw calls for repeated geometry/materials. Our props already use this pattern.
- [Mozilla WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) recommends batching draws, budgeting memory and considering backing-buffer resolution. These are useful later controls; our overview draw-call count did not increase with the terrain regression.
- [Cesium GroundPrimitive](https://cesium.com/learn/cesiumjs/ref-doc/GroundPrimitive.html) documents asynchronous worker-based geometry construction/batching. It is a reference for keeping geometry work off the UI thread, not a dependency recommendation.
- [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) documents accelerated mesh queries and first-hit raycasts. Cited as an established alternative, not newly installed or integrated.
- [OSM2World's browser library documentation](https://osm2world.org/docs/library-web/) separates conversion from rendering and exposes levels of detail, while noting browser conversion performance limits. Study the design; do not assume its performance or integration suits our NYC merge pipeline without measurements. [Example renders](https://osm2world.org/screens/) show output possibilities, not our exact block. Its [code is MIT licensed](https://github.com/tordanik/OSM2World/blob/master/LICENSE.txt).

The initial targets were sub-millisecond typical ground lookup, no multi-second visibility regeneration, and preserved surface/footprint correctness. The local follow-up above meets those performance targets in this desktop sample. Further generation and renderer experiments should use the same repeatable harness. Nothing has been committed.

## Unified generator validation

The [generator](../index.html) now carries selected source data and 2D visibility into 3D and exposes the shared replay profiler through its Benchmark button. It runs a warm current-scene experiment; the CLI remains the controlled offline/fresh-context comparison tool. The schema-2 harness rejects incomplete baselines, compares actual visible feature geometry, fingerprints served assets, records comparison failures and rejects failed/cancelled replays. See [profiling methodology and latest validation](./MAP-PROFILING.md) for limits and reports. No new renderer optimization is claimed from this UI integration.
