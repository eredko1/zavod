# Map lab documentation

Open [the map lab](../index.html) and choose **Help & pipeline**. Its **Benchmark architecture** section is the in-page guide and documentation hub.

- [WebGL research and review](./WEBGL-BENCHMARK-REVIEW.md): primary references, isolation, release boundary, overhead experiment and findings.
- [Benchmark architecture](./BENCHMARK-ARCHITECTURE.md): components, ownership, measurement flow, outputs and extension points.
- [Dependency inventory](./DEPENDENCIES.md): libraries, external APIs, game-only integrations and deployment boundaries.
- [Map pipeline](./OSM-PIPELINE.md): source acquisition, merging, geometry rules, module contracts and validation.
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
  render/                        Meshes, terrain, walking and Three.js world
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
