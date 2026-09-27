# Next session: rendering

Updated 2026-09-27. Branch: `feat/map-lab`. Start with the [README](../README.md) for the local URL and commands; follow root `AGENTS.md`. The user wants the next session to focus on rendering collected/merged data as accurate, simple, untextured geometry. The authored game remains separate.

## Current state

- Single entry: `qa/map-lab/index.html`. Live OSM/NYC fetch, area picker, selected-source merging, 2D preview, 3D generation, walking, validation and benchmark charts.
- Infrastructure work includes NYC transport/rail/coastal sources, measured deck profiles, connected approaches, bounded geometry, closed clipping caps, tree placement and shared walking support queries.
- Review fixes cover source identity/geometry validation, curb conflicts, resource/UI lifecycle, benchmark terrain/outline coverage and physical-layer semantics. [Review findings](REVIEW-2026-09-27.md) records the work and limits.
- [Layering rules](DATA-LAYERING.md) distinguish relative `layer`, floor `level`, explicit bridge/tunnel roles and `location`. Negative layer does not imply underground. Unsupported placement stays logged reference geometry; it cannot create ground walking surfaces or merge away a surface building.
- Measurements, units, estimates, associations and conflicts remain in logs. Classification lives in `pipeline/physical-level.js`; merge policy version lives in `pipeline/map-merge-rules.js`.
- No generated map has been integrated into the authored game. [Game interface](GAME-MAP-INTERFACE.md) and [physics comparison](PHYSICS-COMPARISON.md) describe future integration.

## Open issue: intermittent Chrome crash

The large saved-scene browser test crashed twice during generation. An instrumented failure reported Chrome code 133 after normalization and before merge completed. A later diagnostic run passed generation, geometry validation and all checked deck joins. Cause is **unproven**. No retry, timeout increase or recovery workaround was added. A separate project-Node inventory diagnostic also exited 139 once and later completed; no connection between these failures has been established.

Use the original `.tmp/map-lab/live-infrastructure/scene.json` and the [reproduction command](TESTING.md#reproduce-the-large-scene-crash). The capture is local and ignored, not committed. Keep it unchanged. `tests/infrastructure-browser-test.mjs` emits stage timing/heap information and Chrome target-crash events. Collect evidence before changing behavior; a passing rerun is not a diagnosis.

Local layering-pass evidence:

- `.tmp/map-lab/layer-review-model.json`: initial focused model checks.
- `.tmp/map-lab/layer-review-browser.json`: failed captured-scene run and passing smaller checks.
- `.tmp/map-lab/layer-review-capture.json`: later successful diagnostic capture check.
- `.tmp/map-lab/infrastructure-validation.json`: captured geometry/data findings and joins.

Earlier complete-suite results are in `review-full-model.json` and `review-full-browser.json` in the same directory, before the final layering changes. They are not a complete-suite baseline for this revision. Current runner summaries identify their actual subset/preset and are overwritten by later runs.

Before this handoff commit, all model checks (including release isolation) and the `map-regression` Help/UI browser check passed again. The captured-scene crash was not rerun or declared fixed in that pre-commit check.

## Next rendering work

Start with the [feature-family gap inventory](RENDERING-GAPS.md) and [infrastructure field usage](INFRASTRUCTURE.md). Inspect saved input and logs before inventing geometry or fetching another source. Candidates include unresolved rail/platform placement, deck thickness/supports, waterfront tops/shoreline boundaries and overlap classification. Measurements take precedence; unsupported dimensions stay explicit estimates or references. Keep textures and game integration out of scope unless requested.

Code boundaries: `data/` acquires/validates raw sources; `pipeline/` normalizes/merges and resolves physical levels; `render/` owns meshes, terrain, walking and geometry checks; `ui/` owns selection/progress/logs; `benchmark/` owns optional instrumentation/reports. Keep benchmark imports out of the game runtime and release package.

Use the project Node from the README. Run graphics tests sequentially in headed Chrome through `qa/browser-launch.mjs` under verified Xvfb; no visible desktop Chrome without permission. Keep outputs in project `.tmp/map-lab/`. Server: `./qa/serve.sh`, port 8790. Automatic Vercel deployment is disabled in root `vercel.json`; committing does not establish a deployed preview. Do not push to `main`.
