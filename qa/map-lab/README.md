# Map Lab: start here

Fetch live OpenStreetMap and registered NYC, NYSDOT, MTA and NOAA sources, inspect source selections, generate an untextured 3D world, and measure rendering. This is separate from the authored game map.

[Measured 2 km source sizes](docs/SOURCE-SIZES.md) lists each live source's retained payload and acquisition status. [Crash diagnostics](docs/CRASH-DIAGNOSTICS.md) describes persistent page checkpoints and external QA event logs. The [current review](docs/REVIEW-FIDELITY-2026-09-28.md) records the data-readiness finding and monitored reliability issues.

## Open the page

From the repository root:

```bash
./qa/serve.sh
```

Open **[Map Lab locally](http://localhost:8790/qa/map-lab/)**. Choose **Auto Coney**, or **Choose on map** and **Fetch area**. Inspect the source checkboxes, then **Generate 3D**. Click **Walk here**, then a surface; WASD moves, Shift runs, and Esc releases the mouse. **Validate geometry** lists findings; **Benchmark** displays timing charts. **Help & pipeline** explains the rules.

[Hosted Map Lab](https://zavod-chi.vercel.app/qa/map-lab/) shows the last deployed version. Automatic Vercel deployments are disabled in root `vercel.json`; local commits do not publish changes.

## Run automated checks

Requires Node 22+, project dependencies (`npm install` on a fresh checkout), Google Chrome and Xvfb. Keep the server running. On this machine use the project-local Node:

```bash
MAP_LAB_NODE="$PWD/.tmp/npm-cache/_npx/52027bd8fc0022aa/node_modules/node/bin/node"
"$MAP_LAB_NODE" --version
"$MAP_LAB_NODE" qa/map-lab/tests/run-tests.mjs
```

On another machine, set `MAP_LAB_NODE` to its Node 22+ executable. The runner starts headed Chrome under Xvfb, without desktop windows, and runs browsers sequentially. Do not run other graphics tests at the same time. `npm test` runs the game's tests, not this suite.

| Arguments after `run-tests.mjs` | What runs |
| --- | --- |
| None | All discovered model/browser checks; short benchmark replays |
| `--full` | Same checks with the page's full repeated benchmark preset |
| `--only physical-level,infrastructure,road-approaches` | Layering, bridge heights and ramps |
| `--only infrastructure-browser --scene .tmp/map-lab/live-infrastructure/scene.json` | Saved large-scene reproduction for the intermittent Chrome crash |

The terminal prints `PASS`/`FAIL`; a nonzero exit status means failure. `.tmp/map-lab/checks-model.json` and `checks-browser.json` are latest-run pointers; exclusive `checks-model-<run-id>.json` and `checks-browser-<run-id>.json` retain each run's scope/results without overwriting another experiment. **[Test guide](docs/TESTING.md)** explains every check, crash reproduction and outputs.

The user-authorized crash investigation can run in visible desktop Chrome with the full page benchmark. See the [desktop investigation command](docs/TESTING.md#authorized-desktop-chrome-investigation). Its hardware/driver results stay separate from the default Xvfb checks.

## Continue development

Read the **[session handoff](docs/HANDOFF.md)** for the next rendering pass, then [rendering gaps](docs/RENDERING-GAPS.md) and [layering rules](docs/DATA-LAYERING.md).

[Acquisition and source merging](docs/SOURCE-ACQUISITION.md) distinguishes collected data from metadata-only research. Original NYC vertex geometry, land/context boundaries, curb cuts/equipment outlines, pedestrian-ramp survey/program records, MTA stations/entrances, NYSDOT overhead-sign and bridge-clearance points, and NYC 2017 LiDAR payloads join the area-fetch/merge flow. New geometry channels remain references; live LiDAR validates every point through pinned laz-perf and retains complete lossless tiles; renderer queries decode exact records by native XYZ bounds/classes/origins, while physical reconstruction remains pending. Explicit standalone OSM man_made structures retain measured dimensions and their mapped role instead of becoming generic land. Original fields, coordinate channels and complete compressed point records are retained, with decoded checksums and layout evidence. Coverage budgets for every adapter are centralized in [acquisition-limits.js](data/acquisition-limits.js) and shown directly in Help. The current source list comes from [the registry](data/map-sources.js).

**[Source/render contract](docs/SOURCE-RENDER-BOUNDARY.md)** separates measured source selection from render estimates and retains complete alternatives plus full raw snapshots for rendering. Interactive 3D generation uses a cancellable worker and batched scene restoration; see [benchmark architecture](docs/BENCHMARK-ARCHITECTURE.md). **[Current fidelity integration](docs/FIDELITY-INTEGRATION.md)** explains live 2014 mesh and water-tank selection, global bridge/ramp rules, mapped pylons, full raw-source retention and verified limits. **[Transport inventories](docs/TRANSPORT-INVENTORIES.md)** covers the live NYSDOT ramp, roadway, bridge, clearance and sign references, available fields and remaining support/grade gaps. **[Source fidelity audit](docs/SOURCE-FIDELITY-AUDIT.md)** inventories existing/unused/new datasets, Overture/Esri sources and LiDAR, with archived comparisons and remaining work.

Fetch area and the 2D preview resolve source observations only. Generate 3D prepares estimates and models in a worker and adds a separate render log. Preview failures remain distinct from acquisition failures; successfully fetched data stays retained. Source exports stream complete JSON fields through a lab-scoped download worker on HTTPS/localhost; keep the page open until its download finishes. Reviewed LiDAR/roof budgets and their remaining limits are documented in [source acquisition](docs/SOURCE-ACQUISITION.md).

**[Support sources](docs/SUPPORT-SOURCES.md)** separates mapped support positions, bridge inventory constraints, public pier/cap/footing designs and pending LiDAR/transit work. **[Source-gap catalog](docs/SOURCE-GAP-CATALOG.md)** groups all connected sources and records missing measurements and official leads for pillars. Rejected acquisition responses remain separate evidence in merge/generation/benchmark downloads; incomplete sources never enter the active merge.

**[Fidelity review](docs/REVIEW-FIDELITY-2026-09-28.md)** records corrected findings, open limits and the scoped test reports; the earlier intermittent large-scene crash remains unexplained.

Code lives in `data/` (fetching), `pipeline/` (normalization/rules), `render/` (meshes/walking), `ui/` (page), and `benchmark/` (optional measurement). Tests are in `tests/`, docs in `docs/`, and ignored local captures/reports in `.tmp/map-lab/`. There is no build step. The separate npm release artifact excludes QA and benchmark code.

[All documentation](docs/README.md) · [Pipeline](docs/OSM-PIPELINE.md) · [Game integration](docs/GAME-MAP-INTERFACE.md) · [Benchmark architecture](docs/BENCHMARK-ARCHITECTURE.md)
