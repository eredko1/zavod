# Tests and reproducing failures

Start with the [short README](../README.md) to launch the site and set `MAP_LAB_NODE`. Run commands from the repository root with the server on port 8790. The runner discovers `tests/*-test.mjs` and runs Chrome sequentially under Xvfb. `npm test` instead runs the main game's checks.

## Reproduce the large-scene crash

The original input on this machine is **`.tmp/map-lab/live-infrastructure/scene.json`**. Preserve it: it contains saved API responses and bounds, is ignored by Git, and is absent from a fresh clone. A fresh fetch may return different data.

```bash
"$MAP_LAB_NODE" qa/map-lab/tests/run-tests.mjs \
  --only infrastructure-browser \
  --scene .tmp/map-lab/live-infrastructure/scene.json
```

This checks a small scene's cropping, roof picking/falling and unresolved levels, then loads the saved scene through the real page, generates 3D geometry, validates road/deck joins, and saves screenshots/findings. It does not fetch new map data.

The observed failure was `page.evaluate: Target crashed` during generation. An instrumented failure reported Chrome crash code **133** after normalization, before merge completed. A later diagnostic run passed. Reproduction is intermittent; the cause remains unproven. A successful rerun is not a fix. No automatic crash retry or longer timeout was added.

Retain terminal output, especially `CAPTURE build` timings/heap sizes and `Chrome target crash`, plus the input scene. Check timestamps: files left by a previous success do not prove the failed run completed. Do not run browser tests concurrently.

To test the same scene's benchmark and charts separately:

```bash
"$MAP_LAB_NODE" qa/map-lab/tests/run-tests.mjs \
  --only large-benchmark \
  --scene .tmp/map-lab/live-infrastructure/scene.json
```

If the capture is missing, copy it from this workspace to replay the same case. For a **new** live input, run the capture below. Add `--area south,west,north,east` for another area; without it, capture uses the default Coney block, not the large crash scene. Do not overwrite the original capture.

```bash
xvfb-run -a -s '-screen 0 1600x1200x24' \
  env QA_HEADED=1 QA_VIRTUAL_DISPLAY=1 \
  "$MAP_LAB_NODE" qa/map-lab/tests/map-capture.mjs \
  --output .tmp/map-lab/new-capture
```

Live API failures or changed records are separate from deterministic geometry regressions.

For an explicit repeated-generation crash experiment, run `tests/crash-diagnostic.mjs --scene path/to/scene.json --output .tmp/map-lab/crash-diagnostic` with the same verified Xvfb/Node setup. It records input checksum, stage/thread timings, heap/process memory and target/page/context errors. Add `--source-download nysdot-roadways` to click and retain an exact loaded source-card download before each generation. Add `--download --benchmark` to reproduce the generation-download-short-benchmark flow; downloads retain their checksum and each benchmark retains its complete report. The diagnostic requires successful generation controls, so a failed build cannot pass by leaving the previous scene visible. It never retries a failed generation. `--collect-gc` is an optional diagnostic comparison, never production behavior; keep its results separate from natural collection. A successful experiment does not diagnose a historical crash. This opt-in stress tool is outside the automatically discovered regression suite.

### Authorized desktop Chrome investigation

The user authorized visible desktop Chrome for this crash investigation. Keep the local server running, run browsers sequentially, and keep the benchmark page in the foreground. The shared launcher still verifies hardware rendering; desktop results retain their actual renderer/driver and remain separate from Xvfb Vulkan measurements. There is no automatic switch after a failure.

```bash
env QA_HEADED=1 QA_VISIBLE=1 QA_VIRTUAL_DISPLAY=0 \
  "$MAP_LAB_NODE" qa/map-lab/tests/crash-diagnostic.mjs \
  --scene .tmp/map-lab/live-infrastructure/scene.json \
  --generations 1 --download --benchmark-full \
  --output .tmp/map-lab/desktop-crash-investigation
```

Choose a new output directory for each experiment. `--benchmark-full` uses the page's default repeated preset from [replay-config.js](../benchmark/replay-config.js); `--benchmark` uses the short diagnostic preset. They are mutually exclusive. Reports record the display backend, preset, post-benchmark memory, complete benchmark/GPU coverage and crash events. Neither option forces garbage collection. To reproduce the separate source-card interaction, use `.tmp/map-lab/open-review/transport-crash-input.json` with `--source-download nysdot-roadways` and another output directory. Both saved inputs are local and absent from a fresh clone.

The regression runner continues to use verified Xvfb. Its `browser-display` test specifically checks Xvfb isolation and must stay on that backend.

Runner reports preserve each child's `exitCode` and `signal` alongside the pass/fail `code`, so a signal termination remains distinguishable from an ordinary test failure.

## What each test checks

Use these names with `--only`, separated by commas. They match filenames without `-test.mjs`. Most use synthetic or pinned inputs. `infrastructure-browser` and `large-benchmark` accept the runner's saved `--scene` input; without it, the latter uses the pinned fixture rather than the large scene.

| Model test | Coverage |
| --- | --- |
| `api-request` | Cancellation, timeouts, HTTP errors and configured retries |
| `binary-response` | Original bytes, header rejection/cancellation and a shared budget across concurrent binary responses |
| `area-view` | Geographic bounds and preview projection |
| `benchmark-isolation` | Game imports and release package exclude benchmark/QA/chart code |
| `build-stages` | Build-stage execution, timings and cancellation cleanup |
| `building-mesh` | Native 2014 decoding, source identities, selection gates, immutable bytes, stepped surfaces and separately logged render collision proxies |
| `relation-buildings` | Retained relation/member templates, exact geometry/base gates, measured-height preference, render-only representation and immutable sources |
| `json-stream` | Bounded archive serialization, escapes/UTF-16 boundaries, JSON omission/null semantics, raw-field preservation and explicit cycle rejection |
| `json-reader` | UTF-8/token/escape boundaries, exact standard JSON fields and numbers, duplicate/prototype keys, malformed/incomplete rejection and cancellation without an archive-sized string |
| `acquisition-limits` | Shared coverage budgets, exact-cap final-page confirmation, retained overflow evidence, strict response page sizes and paged MTA inventories |
| `lidar-decoder` | Pinned decoder/license hashes, complete point records and native coordinates, LAS/VLR offsets, source IDs/classes, byte limits, damaged-stream rejection and compiler archive exclusion |
| `building-parts` | Exact footprint/base coverage, holes/narrow gaps, raised/short/stepped parts, shared placement on sloped terrain, source-coordinate segment topology, ambiguity and render-only assembly |
| `bridge-levels` | Captured mixed decks, ordered grades, bounded intervals, mapped pylon clearance and connected bridge ramps |
| `frame-profiler` | CPU/GPU bookkeeping, draw scopes and resource accounting |
| `frame-report` | Statistics, chart data and comparison validation |
| `geometry-validation` | Detection of injected invalid heights, bounds, coordinates and overlaps |
| `infrastructure` | Source classifications, units, measured decks, ground observations and walking slopes |
| `lion-source` | Fixed LION ID inventory, POST batches, exact unique response coverage and rejection of missing/invalid identities |
| `map-merge` | Building/tree/road/curb matching, conflicts, priorities and provenance |
| `native-layers` | Actual MTA records, original LiDAR bytes/checksums, additive hierarchy, strict completeness/rejection evidence, source-only merge and selection |
| `merge-selection` | Disabled providers cannot suppress enabled alternatives |
| `mesh-topology` | Geometric closure, orientation, duplicate faces, vertex fans, intersections, disjoint shells, T-junctions and clipped caps |
| `osm-geometry` | OSM ways, relations, polygon rings and holes |
| `osm-model` | Height/width rules, parts, missing geometry and footprint collision |
| `physical-level` | Negative bridge layers, floors, roofs, tunnels, invalid tags and reference-only collision behavior |
| `planimetric-sources` | Captured original native CRS/curves and geographic XYZ, strict CRS rejection, pedestrian observations, distinct entrance IDs, bounded transit batches and immutable source-only merge |
| `record-validity` | Environment/input changes invalidate benchmark recordings |
| `review-regression` | Source identity, atomic mesh failures, drawn coverage and movement requirements |
| `road-approaches` | Connected ramps, measured anchors, seams, underpasses and ambiguity |
| `roof-equipment` | Building 3 tanks, parent/footprint/roof/date/base gates, envelope placement, source selection and walking separation |
| `scene-wire` | Transferable geometry/index/instance channels, world transforms, archive-free compiler input with restored full raw snapshots, source/render ledgers and walking indexes |
| `shape-query` | Spatial lookup against geometric reference queries |
| `solid-clip` | Area-boundary clipping and closed caps, including holes |
| `source-geometry` | Malformed geometry is logged while valid sibling records survive |
| `source-number` | Valid numbers, zero, missing and invalid values remain distinct |
| `source-render-boundary` | Immutable measured source merge, complete alternatives, render-only estimates and independent logs |
| `source-retention` | All-field native equipment responses, ID completeness, raw Socrata duplicates/metadata/Z and export retention |
| `building-grade` | BES source fields/qualification retained as a reference without generating floors or replacing footprint ground elevation |
| `federal-bridge` | NBI native/GeoJSON fields, span/clearance/protection evidence and reference-only source merge |
| `bridge-roadway-table` | Bounded state table rows, reported coordinates and route relationships retained; rejects missing fields, changed IDs and out-of-area rows |
| `transport-inventory` | Captured NYSDOT schemas, full native/GeoJSON batching, paired attribute consistency/rejection evidence, confirmed empty inventories, all properties/Z/M, source roles, exports, visibility and cancellation |
| `acquisition-evidence` | Rejected Socrata/LION/incomplete OSM responses, undecodable or partially failed I3S binary channels, retained requests, exports and cancellation evidence |
| `tree-placement` | Road/walkway exclusions, islands, edges and tree/row deduplication |
| `walk-height` | Support selection, gravity, falling and landing |

| Browser test | Coverage |
| --- | --- |
| `gathering-boundary` | Source-only gathering under invalid render settings, separate preview failure, retained fetched data and loaded acquisition provenance |
| `diagnostic-survival` | Deliberate renderer crash/reopen, persistent and external checkpoints, exact diagnostic download, uncaught errors and WebGL context loss |
| `download-transport` | Exact streamed attachments, filename/token gates and controlled proof that forced anchor downloads bypass the worker |
| `native-layers-browser` | Actual vendored worker validation and on-query decoding, point-only input, complete lossless downloads, source toggles, restored measurement retention, cancellation, station references and Help |
| `planimetric-sources-browser` | Original planimetric/pedestrian/entrance references, complete raw/XYZ retention through preview/worker/downloads, source toggles and Help |
| `area-picker` | Dragging/selecting areas and picker layout |
| `benchmark-adapter` | Custom scenarios, terrain coverage, runtime isolation and failure cleanup |
| `browser-display` | Xvfb isolation, actual hardware WebGL and GPU timers |
| `fidelity-browser` | Native mesh/equipment API replay through live fetch controls, building 3 tanks, source toggles, bridge/pylon rendering and actual hardware GPU timings |
| `transport-inventory-browser` | Inventory reference rendering through the worker, raw/rejection evidence downloads, separate merge decisions, source toggles, Help and hardware WebGL/timer support |
| `bridge-roadway-browser` | State bridge-to-route table fields and raw responses survive worker generation as references, with Help registration |
| `frame-profile-browser` | Actual upload/shader/render measurement and charts |
| `infrastructure-browser` | Cropping, roof picking/falling, layering logs, geometry download and saved-scene validation |
| `large-benchmark` | Supplied scene or pinned-fixture generation, replay and charts |
| `map-generator` | Fetch/filter/generate/benchmark, downloads, cancellation, errors and mobile layout |
| `map-nyc` | NYC geometry, elevation, visibility and height rules |
| `map-preview` | Source-only preview, render-excluded observations remain visible, SVG holes/masks, toggles and bounded large-area preview |
| `map-regression` | Help links, fetch controls, filters, cancellation, safe text and area changes |
| `map-world` | Building dimensions, courtyards, pointer-lock walking and wall collisions |
| `nyc-selection` | Clicks versus drags/cancellation |
| `review-ui` | Component recreation, listener ownership, prop placement and malformed input |
| `scene-wire-browser` | Actual hardware GPU instance divisors, matrix/color channels and pixel equality across scene transfer |
| `surface-props` | Bench/prop contact on flat, raised and sloped surfaces |
| `terrain-layer` | Surface separation, terrain triangulation, ground queries and cached visibility |

See [profiling](MAP-PROFILING.md) for traces and overhead experiments. Xvfb GPU results are separate from desktop baselines; software rendering is not a hardware performance result.

[Crash diagnostics](CRASH-DIAGNOSTICS.md) describes bounded local checkpoints, external QA JSONL journals and the model-only journal/CLI checks. [Measured source sizes](SOURCE-SIZES.md) documents the live source-size tool; use a fresh output directory because its manifest creation is exclusive. Acquisition measurements do not establish combined rendering capacity.

## Results

These files are under ignored `.tmp/map-lab/` and may be overwritten by the next matching test:

| File | Meaning |
| --- | --- |
| `checks-model.json`, `checks-browser.json` | Latest scope, preset, timestamp, exit codes and durations; exclusive `checks-<backend>-<run-id>.json` files retain each separate experiment |
| `infrastructure-live-review.json` | Saved-scene counts, profiles and data errors |
| `infrastructure-validation.json` | Geometry findings, coverage and road/deck joins |
| `infrastructure-live-3d.png`, `infrastructure-live-2d.png`, `shell-approaches-3d.png` | Scene views; Shell image exists when that join is present |
| `generator-benchmark-quick.json`, `generator-benchmark.json` | Short/full in-page benchmark reports |
| `generator-report.png` | Chart screenshot |
| `large-benchmark.json` | Separate large-scene/pinned-fixture benchmark report |
| `fidelity/luna-building-3-with-tanks.png`, `fidelity/luna-roofs.png`, `fidelity/verrazzano-levels.png` | Captured mesh/equipment and bridge views |
| `fidelity/browser-result.json` | Hardware renderer evidence, actual GPU timer samples and captured scene checks |

Missing source heights and geometry warnings can be expected input limitations even when tests pass. Passing verifies assertions, not every visual detail or survey accuracy. See [the fidelity/source-render review](REVIEW-FIDELITY-2026-09-28.md), [earlier review notes](REVIEW-2026-09-27.md) and [rendering gaps](RENDERING-GAPS.md).
