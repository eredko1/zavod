# laz-perf browser worker decoder

Unmodified worker JavaScript and WebAssembly from `laz-perf@0.0.7`, published by Connor Manning under the Hobu project. The user authorized this dependency exception for Map Lab's live LiDAR acquisition. It adds no build step, installation scripts, CDN or runtime service. The game does not import it.

- Upstream: https://github.com/hobuinc/laz-perf
- Package: https://registry.npmjs.org/laz-perf/-/laz-perf-0.0.7.tgz
- Source revision: `d0d3047e05221421fa0b02b3da4e93797edb2c52`
- Package integrity: `sha512-2xRqm/f/2UqDS5qqkjOyDb6uVIjkVw6SGmQlMoTQliVWkZhPfIbUJTubUl3mTloaWqKcjlS/urmP1CYoxelsEg==`
- License: Apache-2.0; [LICENSE](LICENSE) is the upstream `COPYING` at that revision.

| File | Original package path | SHA-256 |
| --- | --- | --- |
| laz-perf.js | lib/worker/laz-perf.js | 9c2ac7225aa514430b308aeb1fd38d16ce5a5356205d1d8646498594063e8552 |
| laz-perf.wasm | lib/worker/laz-perf.wasm | 9c1802bc31b567dd4aa1ce9ab010e7e51e095dc42af8379b474ae6f221a9327f |
| LICENSE | Upstream COPYING | 959f77033ba56a3b146faf5c02f9162071f2d0bff4b8b6f1c2193a4b41127d39 |

Verify these hashes when updating. Change the recorded revision/integrity and run the point-record, source-acquisition and browser-worker QA checks. Acquisition validates every record and retains original lossless compressed bytes with decoded checksums/layout evidence. Renderer queries decode intersecting tiles into complete LAS records; coordinates and original fields remain separate from physical interpretation. A decoder does not reconstruct supports or align coordinate datums.
