# Map Lab: start here

Fetch live OpenStreetMap/NYC data, inspect it in 2D, generate an untextured 3D world, and measure rendering. This is separate from the authored game map.

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

The terminal prints `PASS`/`FAIL`; a nonzero exit status means failure. `.tmp/map-lab/checks-model.json` and `checks-browser.json` record scope and results and are overwritten by later runs. **[Test guide](docs/TESTING.md)** explains every check, crash reproduction and outputs.

## Continue development

Read the **[session handoff](docs/HANDOFF.md)** for the next rendering pass, then [rendering gaps](docs/RENDERING-GAPS.md) and [layering rules](docs/DATA-LAYERING.md).

Code lives in `data/` (fetching), `pipeline/` (normalization/rules), `render/` (meshes/walking), `ui/` (page), and `benchmark/` (optional measurement). Tests are in `tests/`, docs in `docs/`, and ignored local captures/reports in `.tmp/map-lab/`. There is no build step. The separate npm release artifact excludes QA and benchmark code.

[All documentation](docs/README.md) · [Pipeline](docs/OSM-PIPELINE.md) · [Game integration](docs/GAME-MAP-INTERFACE.md) · [Benchmark architecture](docs/BENCHMARK-ARCHITECTURE.md)
