# Map Lab

[Open locally](http://localhost:8790/qa/map-lab/index.html) after starting `./qa/serve.sh` from the repository root. Fetch an area, inspect its merged 2D geometry, generate an untextured 3D world, then run benchmarks. **Help & pipeline** explains the controls and data flow.

```text
qa/map-lab/
  index.html          Single browser entry point
  data/               API clients and geographic area selection
  pipeline/           Normalization, source merging and build orchestration
  render/             Meshes, terrain, walking and Three.js world
  ui/                 Page controls, 2D preview, help and styles
  benchmark/          Optional instrumentation, replay, reports and charts
  tests/              Automated tests, live capture and CLI benchmarks
    fixtures/         Pinned, attributed test inputs
  docs/               Architecture, research, pipeline and benchmark guides
```

Run commands from the repository root. [Test and benchmark commands](docs/MAP-PROFILING.md) use Node 22+ and headed Chrome under Xvfb. Tests run sequentially. The shared browser launcher remains in `qa/browser-launch.mjs` because other QA tools use it too. Generated captures, reports and traces go in ignored `.tmp/map-lab/`.

[Documentation index](docs/README.md) · [Pipeline](docs/OSM-PIPELINE.md) · [Benchmark architecture](docs/BENCHMARK-ARCHITECTURE.md)

The authored game stays in `src/`. The lab is available on Vercel; test fixtures and local artifacts are excluded. The separate npm release artifact excludes all QA and benchmark code.
