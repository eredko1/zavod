# Geometry validation and repeatable checks

Use **Validate geometry** after generating a world. The report separates geometry errors, geometry warnings and data gaps. Its coverage table groups features by source and physical type: meshes, outlines/markers, records with no emitted geometry, represented duplicates, hidden records, rule-excluded records, and geometry that uses estimates. Estimates overlap the mesh/reference counts; they are not additional features. A source record without geometry can be metadata, outside the area, unresolved or skipped; inspect its coverage reason before calling it a missing object. Tree-placement exclusions have their own count rather than appearing as unexplained missing geometry.

The findings filter switches between geometry and data. Clicking a feature ID focuses its geometry (or its preserved OSM footprint/line when another source represents it). **Download checks** saves the full report; the page lists findings in batches to keep it usable on larger areas.

Implemented checks:

- Finite generated coordinates and area-bound compliance, including base terrain and every active instance's transformed vertices.
- Every generated deck, hydro and profiled approach surface vertex agrees with the selected elevation rule within the tolerance in [geometry-validation.js](../render/geometry-validation.js).
- Exact duplicate surface meshes plus positive-area surface triangle intersections at coincident/crossing heights, independent of triangulation. These are review candidates: road junctions and deliberate area overlays can legitimately overlap. Boundary-only contacts and separate deck levels are excluded. Prop-to-prop and building-wall intersections are not checked.
- Source/merge errors and unresolved measurement records.
- Render preparation audits native building triangle topology separately: subdivided geometric edges, vertex fans, orientation, degenerate/duplicate faces, self-intersections and signed volume. Only meshes passing that audit receive estimated solid caps on area cuts; this does not establish native roof collision. Parent/part replacement additionally requires complete footprint/base coverage, including holes, and retention of the parent maximum-height envelope. Original geographic rings provide an affine source-plane comparison, preserving segment topology across different vertex densities; accepted parts share an explicitly estimated parent base. Extrusion collision uses drawn Float32 vertical bounds, preserving the measured source height. See [fidelity integration](FIDELITY-INTEGRATION.md).
- Shared OSM nodes connecting bridge and non-bridge ways: sample actual mesh heights on each side of the deck footprint boundary at the centreline and both lateral offsets when a resolved road width is available. Each offset follows the actual boundary, including skewed abutments; a path entirely outside a deck cannot invent a crossing. `approachChecks.probes` records positions, heights, differences and missing/outside-crop status. Missing surfaces/boundaries or excessive differences produce `approach-discontinuity`; an unrelated deck cannot conceal missing selected geometry. Unresolved profiles retain the shared-node diagnostic. Thresholds, lateral fraction and probe spacing live in [geometry-validation.js](../render/geometry-validation.js). These samples do not establish a surveyed grade or continuous coverage across every point of the seam.
- Ground-level OSM numeric `maxheight` observations under a resolved deck: a deck top lower than the recorded vehicle limit above interpolated ground is flagged as a data/model conflict. A sign is not a surveyed deck height, and deck thickness remains unknown. This check examines returned way vertices, not a continuous clearance survey.

Validation runs explicitly outside animation and benchmark measurement. Its own duration and scanned vertex counts are recorded. It does not add per-frame instrumentation. It cannot establish the correctness of an input survey, prove an estimated dimension, or replace inspection of complex intersections.

## One test command

With Node 22+ and the local server running:

```bash
node qa/map-lab/tests/run-tests.mjs
# Full page benchmark preset (the default suite uses quick replay counts):
node qa/map-lab/tests/run-tests.mjs --full
```

The runner uses **its own Node executable** for child scripts. It runs pure model checks first, then starts one Xvfb display and runs Playwright Chrome tests sequentially. If it is already inside the verified virtual-display environment, it reuses that display. It does not launch visible desktop Chrome. It writes concise result summaries to `.tmp/map-lab/checks-model.json` and `.tmp/map-lab/checks-browser.json`.

To include a saved live response from the real page:

```bash
node qa/map-lab/tests/run-tests.mjs --scene .tmp/map-lab/live-infrastructure/scene.json
```

Live capture remains a separate acquisition step using `tests/map-capture.mjs`. Keeping acquisition separate prevents an API outage or changed source geometry from being confused with a code regression. The page itself always fetches live data when Fetch area is used; tests do not replace its query with saved data.

Use `--only map-world,terrain-layer` to rerun named checks after a targeted fix; these are subset results, not a new complete-suite baseline.

The runner covers clipping and polygon holes, unit conversion, source matching, bridge/ground separation, roof placement, falling/landing, source visibility, terrain layering, prop grounding, report downloads, benchmark replay and the current UI. Synthetic cases provide known expected outcomes; the supplied scene exercises the actual downloaded data. The original pinned fixture is unchanged.

## Shell Road / West 4th Street review

NYC subtype 300000 describes visible road/sidewalk spot heights, including elevated road surfaces; it is not a bare-earth classification. The [official capture rules](https://github.com/CityOfNewYork/nyc-planimetrics/blob/main/Capture_Rules.md) describe that acquisition. In the captured Shell Road crossing, high spots follow the Belt bridge centrelines while low spots follow the road underneath. Treating both as terrain raised the underpass incorrectly.

[Ground-role resolution](../pipeline/ground-levels.js) excludes a spot from bare-ground interpolation only inside one road-structure footprint, close to an elevated centreline and distinctly farther from a ground road. It preserves the raw observation and logs the sample, both roads, structure, distances and inferred role. It does not promote those spots into surveyed deck heights. The captured crossing no longer violates the tagged vehicle clearance. Other ambiguous observations and datum alignment remain uncertainties; `clearance-conflict` remains available for contradictory cases.

[Connected road profiles](../pipeline/road-approaches.js) now join supported decks to terrain through the actual OSM node graph. They retain NYC roadbed outlines and use uniquely associated spot observations where available; deck edges and terminal terrain constrain the interpolated grade. The crossing road and bare-ground interpolation remain separate. Grade, crossfall and terrain endpoint heights remain estimates in the separate render log. The captured-scene check verifies the rendered joins and underpass clearance; its measurements are in `.tmp/map-lab/infrastructure-validation.json`.

Other visible gaps: an elevated sheet has no structural thickness/support columns until those are supplied by measurements or a separate logged procedural rule. Station outlines do not establish platform or roof heights. See [infrastructure coverage](INFRASTRUCTURE.md) and [physics comparison](PHYSICS-COMPARISON.md).
