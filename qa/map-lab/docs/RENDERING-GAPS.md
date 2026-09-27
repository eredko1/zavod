# Rendering coverage and next geometry pass

This audit follows the [infrastructure review](REVIEW-2026-09-27.md). It covers the current OSM rules, all connected NYC adapters, merging, mesh construction and the captured Coney/Shell Road scene. It is an inventory of current behavior, not a claim that every record is physically correct or that every possible OSM tag is supported.

Use **Validate geometry** for current visible coverage and source IDs. The local audit artifacts are `.tmp/map-lab/render-gap-audit.json` (plan groups, example IDs, OSM fields and NYC property inventory), `.tmp/map-lab/infrastructure-validation.json` (actual mesh checks) and `.tmp/map-lab/live-infrastructure/scene.json` (original responses). These are ignored local artifacts; later captures can differ. Counts belong in those reports rather than being copied into this document. A plan marked rendered can still emit no geometry after cropping or fail at meshing; compare both reports.

## Geometry inventory

| Feature family | Current geometry | Remaining gap / available evidence |
| --- | --- | --- |
| Buildings and parts | Footprint extrusion, courtyard holes, measured height or logged floor-count estimate; skip missing height | Roof shape/direction/angle, partial building-part coverage, facade openings and interiors lack rules. Non-flat roof tags are present in the capture, e.g. `way/241856191`. Missing height remains an explicit error. |
| Roadbeds and paths | NYC polygons and uncovered OSM width-based ribbons | Intersection role resolution, bank/crossfall, ramps and grade separation are incomplete. NYC spot observations are sparse, not per-road vertex elevations. |
| Sidewalks, medians and curbs | Raised polygon surfaces and curb beams, explicit matched curb heights where available | Identical raised sidewalk/median footprints share one surface; partial overlaps still need physical-role review. Exposed curb edges, driveway cuts and local kerb-point ramps lack rules. Painted medians are retained in 2D without a 3D marking surface. |
| Steps and inclined paths | Continuous path surfaces | `step_count` and `incline` are retained but do not generate stairs or solve endpoint heights. Examples: `way/366198649`, `way/230060364`. Direction alone is not a measured rise. |
| Road bridges and ramps | Supported NYC decks use bridge spot profiles; connected OSM approaches and matched NYC roadbeds join their edges to measured spots and estimated terrain | Deck thickness, columns, abutments and embankment volume are missing. Disconnected topology, ambiguous roadbed ownership and unsupported decks cannot establish a complete approach. Grade and crossfall remain estimates. Elevated-centreline spot classification fixes the captured Shell Road terrain conflict. |
| Ground railway | Two simple rail beams, OSM gauge when usable; logged default otherwise | Sleepers, ballast, switches, track-count interpretation and cross-source duplicate resolution remain incomplete. Rail section dimensions are estimates. |
| Elevated railway | Supported track alignments follow compatible rail-deck profiles | Unsupported spans, embankments/cuttings and unknown rail subtypes remain references. Do not use `layer` as a height or attach tracks to a nearby road bridge. |
| Stations and transit access | Station outlines; basic entrance/grate footprints | Roof, platform, stair and support geometry is not separated. A station footprint alone does not establish a platform elevation. |
| Tunnels | Reference outlines | No continuous tunnel profile, portal opening or terrain excavation. OSM closed `man_made=tunnel` outlines also need explicit classification. |
| Boardwalks | NYC footprint follows estimated terrain | Recorded support/deck elevations are absent in this response. Deck thickness, supports and transitions to piers/paths are missing; ground interpolation is only an estimate. |
| Piers, jetties and seawalls | NYC footprint surface tops use recorded elevation in feet | No structural thickness, sides, foundations or coastal deduplication. OSM `man_made=pier/groyne/breakwater` lacks dedicated matching and solids; lines become references, closed shapes can fall through to generic land. Examples: `way/101122881`, `way/499395493`, `way/1006442888`. |
| Shoreline and beaches | Shoreline reference, beach surface on terrain | Shoreline is not a retaining wall. Terrain cutaways, banks, erosion profile and underwater ground are absent. No individual `natural=rock` records were found in this capture; a jetty footprint cannot establish each rock's size/location. A simple rock mound would be a logged procedural estimate. |
| Water and wetlands | OSM and NYC water outlines; wetland terrain surface | No datum-compatible water-level model. Unresolved water is excluded from walkable surfaces in either source. A measured flat water plane and shoreline clipping still need rules. |
| Walls, fences and hedges | Simple beams/posts on mapped alignment | Most dimensions are estimates; retaining-wall top/bottom profiles, material-specific shapes and some elevated barriers are unresolved. |
| Trees and rows | Instanced trunks/crowns, tagged OSM dimensions where usable; point/row deduplication and logged exclusions inside road/walkway interiors | NYC tree dimensions remain defaults. Species/material appearance is later work; non-active/status records remain markers. Tree rows use estimated spacing. Placement depends on source surface accuracy; edge clearance is a rule estimate, and ambiguous individual-tree matches remain separate. |
| Street furniture | Basic benches, lamps, signals, poles, bins, bollards and gates | Supported furniture rests on visible ground surfaces. Sign faces, cabinets, cameras, chargers and many other point roles remain markers. Some direction and dimension tags are unused; feet are rigid on slopes. |
| Other structures | Generic outlines, markers or closed land surfaces | Masts, chimneys, tanks and standalone OSM `man_made=bridge` need explicit physical rules. Closed geometry does not necessarily describe ground cover. Examples: `way/1175842008`, `way/1168434201`, `way/415613118`. |
| Source/reference records | LION lines, elevation markers, logical/support records retained | Administrative/network lines must not be mistaken for physical barriers. Service routes, ownership and IDs are metadata, not independent solids. |

## Cross-cutting gaps

- **Vertical semantics:** OSM `ele` is retained but is not reconciled with NYC's vertical reference or used as a general object elevation. Example `way/1006461603` has a recorded zero; missing and zero must stay distinct. Roads/tracks can resolve compatible measured profiles. Other tagged elevated/underground surfaces, barriers and props remain references until their physical role and height are supported.
- **Merge identity:** coastal, station and elevated-track records need physical-role matching; proximity alone must not suppress independent features. Preserve conflicting alternatives and selected-field provenance.
- **Crop physics:** surfaces, lines and transformed instances are clipped; cropped solids receive side caps. Walking/collision bounds remain a separate contract.
- **Layer controls:** checkboxes re-resolve selected merge inputs and restore alternatives in 2D; 3D requires regeneration. The low-level cached visibility API changes presentation and repositions props on the remaining ground surfaces; it does not resolve alternate source geometry.
- **Physics:** rendered surfaces are not a complete game collision/navigation model. Props, ceilings, tunnels, water behavior and map boundaries need explicit contracts, as described in [physics comparison](PHYSICS-COMPARISON.md).
- **Cost and validation:** generation/validation still run on the main thread. The validator checks transformed instances, exact copies, partial surface intersections, bounds and elevation-rule disagreement. Intersections can be intentional; it does not validate source semantics or general solid collisions. Benchmark each geometry expansion using the same captured input and retain estimates in coverage logs.

## Suggested implementation order

1. Unify physical roles and vertical rules for OSM and NYC, including water and standalone structures; extend connected approaches to unresolved topology and roadbed ownership with supported evidence.
2. Resolve duplicate ground/coastal/elevated representations using physical-role evidence; preserve selected-input fallback behavior.
3. Complete basic track/deck, pier/jetty/seawall, water/shore and stair geometry where the available fields support it; log each necessary estimate and unresolved height.
4. Resolve transition discontinuities and classify overlap candidates. Check roofs/underpasses/edges through walking tests as well as screenshots.
5. Compare build stages, mesh/buffer counts and CPU/GPU frame timings against the same-input baseline before adding textures or further detail.

Source interpretation and evidence remain in [infrastructure rules](INFRASTRUCTURE.md) and [the pipeline](OSM-PIPELINE.md). New geometry should be a rule with source attribution, coverage status and a measurable build stage, not a hardcoded Coney-specific object.
