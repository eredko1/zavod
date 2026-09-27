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

## What each test checks

Use these names with `--only`, separated by commas. They match filenames without `-test.mjs`. Most use synthetic or pinned inputs. `infrastructure-browser` and `large-benchmark` accept the runner's saved `--scene` input; without it, the latter uses the pinned fixture rather than the large scene.

| Model test | Coverage |
| --- | --- |
| `api-request` | Cancellation, timeouts, HTTP errors and configured retries |
| `area-view` | Geographic bounds and preview projection |
| `benchmark-isolation` | Game imports and release package exclude benchmark/QA/chart code |
| `build-stages` | Build-stage execution, timings and cancellation cleanup |
| `frame-profiler` | CPU/GPU bookkeeping, draw scopes and resource accounting |
| `frame-report` | Statistics, chart data and comparison validation |
| `geometry-validation` | Detection of injected invalid heights, bounds, coordinates and overlaps |
| `infrastructure` | Source classifications, units, measured decks, ground observations and walking slopes |
| `lion-source` | LION query paging and responses |
| `map-merge` | Building/tree/road/curb matching, conflicts, priorities and provenance |
| `merge-selection` | Disabled providers cannot suppress enabled alternatives |
| `osm-geometry` | OSM ways, relations, polygon rings and holes |
| `osm-model` | Height/width rules, parts, missing geometry and footprint collision |
| `physical-level` | Negative bridge layers, floors, roofs, tunnels, invalid tags and reference-only collision behavior |
| `record-validity` | Environment/input changes invalidate benchmark recordings |
| `review-regression` | Source identity, atomic mesh failures, drawn coverage and movement requirements |
| `road-approaches` | Connected ramps, measured anchors, seams, underpasses and ambiguity |
| `shape-query` | Spatial lookup against geometric reference queries |
| `solid-clip` | Area-boundary clipping and closed caps, including holes |
| `source-geometry` | Malformed geometry is logged while valid sibling records survive |
| `source-number` | Valid numbers, zero, missing and invalid values remain distinct |
| `tree-placement` | Road/walkway exclusions, islands, edges and tree/row deduplication |
| `walk-height` | Support selection, gravity, falling and landing |

| Browser test | Coverage |
| --- | --- |
| `area-picker` | Dragging/selecting areas and picker layout |
| `benchmark-adapter` | Custom scenarios, terrain coverage, runtime isolation and failure cleanup |
| `browser-display` | Xvfb isolation, actual hardware WebGL and GPU timers |
| `frame-profile-browser` | Actual upload/shader/render measurement and charts |
| `infrastructure-browser` | Cropping, roof picking/falling, layering logs, geometry download and saved-scene validation |
| `large-benchmark` | Supplied scene or pinned-fixture generation, replay and charts |
| `map-generator` | Fetch/filter/generate/benchmark, downloads, cancellation, errors and mobile layout |
| `map-nyc` | NYC geometry, elevation, visibility and height rules |
| `map-preview` | SVG holes, masks, toggles and bounded large-area preview |
| `map-regression` | Help links, fetch controls, filters, cancellation, safe text and area changes |
| `map-world` | Building dimensions, courtyards, pointer-lock walking and wall collisions |
| `nyc-selection` | Clicks versus drags/cancellation |
| `review-ui` | Component recreation, listener ownership, prop placement and malformed input |
| `surface-props` | Bench/prop contact on flat, raised and sloped surfaces |
| `terrain-layer` | Surface separation, terrain triangulation, ground queries and cached visibility |

See [profiling](MAP-PROFILING.md) for traces and overhead experiments. Xvfb GPU results are separate from desktop baselines; software rendering is not a hardware performance result.

## Results

These files are under ignored `.tmp/map-lab/` and may be overwritten by the next matching test:

| File | Meaning |
| --- | --- |
| `checks-model.json`, `checks-browser.json` | Scope, preset, timestamp, exit codes and durations |
| `infrastructure-live-review.json` | Saved-scene counts, profiles and data errors |
| `infrastructure-validation.json` | Geometry findings, coverage and road/deck joins |
| `infrastructure-live-3d.png`, `infrastructure-live-2d.png`, `shell-approaches-3d.png` | Scene views; Shell image exists when that join is present |
| `generator-benchmark-quick.json`, `generator-benchmark.json` | Short/full in-page benchmark reports |
| `generator-report.png` | Chart screenshot |
| `large-benchmark.json` | Separate large-scene/pinned-fixture benchmark report |

Missing source heights and geometry warnings can be expected input limitations even when tests pass. Passing verifies assertions, not every visual detail or survey accuracy. See [review notes](REVIEW-2026-09-27.md) and [rendering gaps](RENDERING-GAPS.md).
