# Map lab documentation

Open [the map lab](../index.html) and choose **Help & pipeline**. Its **Game integration plan** and **Benchmark architecture** sections link to the implementation guides below.

- [Quick start](../README.md): local site and suite commands.
- [Test guide](TESTING.md): every check, outputs and crash reproduction.
- [Session handoff](HANDOFF.md): state, unresolved errors and next rendering work.

- [WebGL research and review](./WEBGL-BENCHMARK-REVIEW.md): primary references, isolation, release boundary, overhead experiment and findings.
- [Benchmark architecture](./BENCHMARK-ARCHITECTURE.md): components, ownership, measurement flow, outputs and extension points.
- [Dependency inventory](./DEPENDENCIES.md): libraries, external APIs, game-only integrations and deployment boundaries.
- [Map pipeline](./OSM-PIPELINE.md): source acquisition, merging, geometry rules, module contracts and validation.
- [Current fidelity integration](./FIDELITY-INTEGRATION.md): live 2014 meshes and water tanks, selection/attachment rules, global bridge grades, mapped supports, raw retention and remaining limits.
- [Transport inventories](TRANSPORT-INVENTORIES.md): live NYSDOT ramp/roadway alignments and bridge structural attributes, complete source retention, reference roles and missing support locations/grades.
- [Source acquisition](SOURCE-ACQUISITION.md): actual MTA records and original LiDAR point payloads, metadata-only distinctions, complete hierarchy selection, preserved compressed/decoded measurements and deferred interpretation/modeling.
- [Support sources](SUPPORT-SOURCES.md): mapped supports, structural inventory constraints, public pier/cap/footing drawings, LiDAR/transit candidates and measured-versus-estimated boundaries.
- [Source-gap catalog](SOURCE-GAP-CATALOG.md): all connected source groups, missing measurements, scoped OSM support counts and official plan/source leads.
- [Source fidelity audit and merge plan](./SOURCE-FIDELITY-AUDIT.md): existing/unused/new datasets, archived building comparisons, supports, preserved research data and remaining source-selection work.
- [Game integration plan](./GAME-MAP-INTERFACE.md): coordinate conversion, the existing game interface, collision generation, navigation and implementation gates.
- [Running and reading benchmarks](./MAP-PROFILING.md): repeat configuration, CLI usage, interpretation and comparison checks.
- [Performance review](./MAP-PERFORMANCE-REVIEW.md): historical measurements, implemented improvements and unresolved GPU questions.
- [Rendering research](./MAP-RENDERING-DESIGN.md): source references and geometry/terrain design decisions.

## Repository layout

```text
qa/map-lab/
  index.html                     Single application entry point
  README.md                      Start here: layout and running the lab
  data/                          API clients, retries and geographic bounds
  pipeline/                      Normalization, merge rules and build orchestration
  render/                        Derived models/logs, meshes, terrain, walking and world
  ui/                            Page controller, area picker, 2D preview, Help and styles
  benchmark/                     Replay, instrumentation, reports and charts
  docs/                          All map-lab documentation
  tests/                         Automated tests, live capture and CLI benchmark
    fixtures/                    Pinned and attributed test data
vendor/three/                   Existing Three.js renderer
vendor/echarts/                 Pinned benchmark chart library + licenses
.tmp/map-lab/                   Ignored live captures, reports and traces
```

The lab does not replace the authored game map. `src/world/` remains the game's separate world implementation. The older Python authoring scripts in `qa/tools/` are not part of the live map lab.

[Infrastructure sources, field usage and elevation rules](INFRASTRUCTURE.md).

[Physical layers and vertical placement](DATA-LAYERING.md): negative layers, floor numbers, bridge/tunnel roles, ground eligibility and unresolved-placement logs.

[Map Lab versus game physics](PHYSICS-COMPARISON.md): current contracts, differences and comparison plan.

[Geometry validation and one-command checks](GEOMETRY-VALIDATION.md): current-scene diagnostics and live-data review.

[Infrastructure pass review](REVIEW-2026-09-27.md): fixes verified in this pass and outstanding rendering/data issues.

[Fidelity and source/render review](REVIEW-FIDELITY-2026-09-28.md): every corrected finding, remaining limits, data-readiness finding, monitored reliability issues and scoped verification evidence.

[Rendering gap inventory](RENDERING-GAPS.md): every current feature family, unused physical fields, source examples and the next geometry pass.

- [Source/render contract](SOURCE-RENDER-BOUNDARY.md): immutable source selection, all observations and separate render models/logs.
- [Measured source sizes](SOURCE-SIZES.md): actual live per-source payloads for a defined 2 km square, rejection evidence and verification limits.
- [Crash diagnostics](CRASH-DIAGNOSTICS.md): persistent local checkpoints, external QA journals, retention and deliberate crash checks.
