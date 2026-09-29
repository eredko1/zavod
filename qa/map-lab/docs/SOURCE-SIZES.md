# Measured 2 km source sample

The adjacent [vector/baseline manifest](source-size-measurements.json) and [later full LiDAR manifest](source-size-lidar-measurements.json) are the sources of this table. Both query a 2,000 × 2,000 metre square centered at 40.5775, -73.978 (Coney Island/Luna Park), using the application's area-coordinate convention. The baseline began 2026-09-29T14:52:11.329Z; LiDAR was separately acquired 2026-09-29T15:54:57.249Z through 2026-09-29T16:04:06.813Z. These independently dated captures are not an atomic snapshot. The square includes ocean and does not establish capacity for a dense inland or bridge area. Exact bounds, dates, URLs, hardware/backend, per-source checksums and network measurements remain in the manifests.

All 45 sources registered for this historical Coney capture have complete retained samples across these captures. The later building-grade source is measured separately below. Retained JSON totals **630.81 MiB** (661448346 bytes). These include original responses, metadata, native/derived geometry and lossless base64 archives, not RAM usage or GPU model sizes. CDP encoded-response bytes are measured separately. The earlier rejected LiDAR evidence remains in the baseline manifest rather than being counted as point data.

| Source | Acquisition | Records/assets | Retained JSON MiB |
| --- | --- | ---: | ---: |
| OpenStreetMap (osm-overpass) | complete | 31131 | 6.279 |
| NYC roadbeds (nyc-roadbed) | complete | 402 | 3.709 |
| NYC sidewalks (nyc-sidewalk) | complete | 217 | 3.602 |
| NYC medians (painted + raised) (nyc-median) | complete | 122 | 0.982 |
| NYC curbs (nyc-curbs) | complete | 724 | 3.277 |
| NYC pavement edges (nyc-pavement) | complete | 603 | 3.656 |
| NYC building footprints (nyc-buildings) | complete | 1650 | 2.574 |
| NYC 2014 building and roof meshes (nyc-buildings-2014) | complete | 1658 | 35.422 |
| NYC 2022 rooftop water tanks (nyc-water-tanks) | complete | 20 | 0.163 |
| NYC forestry tree points (nyc-trees) | complete | 3536 | 3.872 |
| NYC LION street network (nyc-lion) | complete | 1387 | 6.665 |
| NYC elevation samples (nyc-elevation) | complete | 3566 | 1.543 |
| NYC bridges and transport structures (nyc-transport) | complete | 10 | 0.464 |
| NYC railroad lines (nyc-railroad) | complete | 556 | 0.665 |
| NYC stations and rail structures (nyc-rail-structures) | complete | 37 | 0.091 |
| NYC retaining walls (nyc-retaining-walls) | complete | 5 | 0.012 |
| NYC boardwalks (nyc-boardwalk) | complete | 1 | 0.121 |
| NYC shoreline (nyc-shoreline) | complete | 1 | 1.297 |
| NYC piers, jetties and seawalls (nyc-hydro-structures) | complete | 25 | 0.092 |
| NYC water and beach areas (nyc-hydrography) | complete | 3 | 0.696 |
| NYSDOT state ramps (nysdot-ramps) | complete | 26 | 0.148 |
| NYSDOT roadway inventory (nysdot-roadways) | complete | 195 | 3.110 |
| NYSDOT bridge inventory (nysdot-bridges) | complete | 9 | 0.048 |
| MTA subway station inventory (mta-stations) | complete | 4 | 0.050 |
| MTA subway entrances and exits (2024) (mta-entrances) | complete | 15 | 0.054 |
| NYC pedestrian ramp survey (nyc-pedestrian-ramps) | complete | 633 | 0.839 |
| NYC pedestrian ramp program progress (nyc-pedestrian-progress) | complete | 548 | 0.339 |
| NYC 2017 LiDAR point data (nyc-lidar-2017) | complete (later capture) | 2186 tiles | 526.979 |
| NYC 2022 transport structures (nyc-transport-2022) | complete | 10 | 0.860 |
| NYC 2022 rail structures (nyc-rail-structures-2022) | complete | 37 | 0.213 |
| NYC 2022 railroad lines (nyc-railroad-2022) | complete | 553 | 1.379 |
| NYC 2022 curbs (nyc-curbs-2022) | complete | 724 | 6.727 |
| NYC 2022 pavement edges (nyc-pavement-2022) | complete | 602 | 7.263 |
| NYC 2022 retaining walls (nyc-retaining-walls-2022) | complete | 5 | 0.045 |
| NYC 2022 curb cuts (nyc-curb-cuts-2022) | complete | 1739 | 2.875 |
| NYC 2022 cooling towers (nyc-cooling-towers-2022) | complete | 372 | 0.566 |
| NYC 2022 miscellaneous structures (nyc-misc-structures-2022) | complete | 32 | 0.109 |
| NYC 2022 parking lots (nyc-parking-2022) | complete | 131 | 0.883 |
| NYC 2022 plazas (nyc-plazas-2022) | complete | 6 | 0.091 |
| NYC 2022 parks (nyc-parks-2022) | complete | 113 | 1.313 |
| NYC 2022 open space (nyc-open-space-2022) | complete | 91 | 0.264 |
| NYC 2022 sidewalk lines (nyc-sidewalk-lines-2022) | complete | 404 | 0.835 |
| NYC 2022 swimming pools (nyc-pools-2022) | complete | 5 | 0.056 |
| NYC 2022 construction areas (nyc-construction-2022) | complete | 8 | 0.060 |
| NYC 2022 cartographic pavement edges (nyc-pavement-carto-2022) | complete | 118 | 0.521 |

The LiDAR capture retains **76,169,458 points across 2,186 intersecting tiles**, including all additive depths. Original compressed tiles occupy **380.45 MiB** (398928854 bytes); validation decoded **2397.15 MiB** (2513592114 bytes) of exact records. Decoded buffers are released after validation; complete originals and decoded checksums/layout evidence remain available to renderer queries. These are measured counts/bytes, not density estimates. Tile envelopes and ancestor points can extend beyond the requested geographic rectangle. The current [shared budgets](../data/acquisition-limits.js) admitted this entire selection.

The exported point JSON exceeds V8's single-string limit. [parseJSONStream](../data/json-reader.js) consumes UTF-8 chunks from a browser response body or Node readable stream, retaining every field without a whole-archive string. It rejects malformed/incomplete input and supports cancellation; it never supplies a partial snapshot. Native renderer queries work directly on the acquired object and decode exact intersecting tiles. The source-only capture recorded a peak reported heap of about 596 MiB during export; this is neither a combined 45-source memory maximum nor a 3D/GPU baseline.

Source records and raw archives from completed providers remain available in [renderer observation inventories](SOURCE-RENDER-BOUNDARY.md). Native roofs/tanks have model rules; original XYZ/curves, pedestrian surveys, transit and roadway/bridge inventories largely remain references awaiting interpretation. Actual regular train/highway column locations and caps remain gaps. Acquisition does not infer supports, elevations, model geometry or missing dimensions. Survey mirrors are retained without treating them as independent measurements.

Baseline artifacts remain under ignored `.tmp/map-lab/commit-review-20260929/sources-2km/`; the full point capture is `.tmp/map-lab/limits-review-20260929/lidar-2km/`. Independent Python parsing/base64 hashing and a Node read outside the tool sandbox verify every original compressed tile against its recorded checksum. A separate streamed, frozen-input audit in `complete-sample-native.json` retains all 45 inventories and raw archive identities, finds no modeled estimates in source features, and confirms exact renderer record/extra-byte access. Captures have separate epochs and no combined 3D capacity claim.

The first Node combined audit reported a tile mismatch although the saved archive and that NOAA tile independently match every checksum; a later sandboxed JIT-disabled Node read reported a syntax error on the same valid archive. An unrestricted JIT-disabled read subsequently checked all 2,186 tiles successfully. These remain byte/read-processing findings, not evidence that the source file changed. The prior baseline checksum/JSON-read failures and spontaneous crashes remain recorded. Passing independent checks do not explain these failures or close the [review gate](REVIEW-FIDELITY-2026-09-28.md).

## Lower Manhattan 2 km comparison

The [initial Manhattan manifest](source-size-manhattan-measurements.json), [building-grade manifest](source-size-manhattan-grade-measurements.json), [expanded LiDAR manifest](source-size-manhattan-lidar-measurements.json), [federal bridge manifest](source-size-manhattan-nbi-measurements.json), [alternate Overpass manifest](source-size-manhattan-osm-measurements.json) and [state bridge-roadway manifest](source-size-manhattan-bridge-roadway-measurements.json) query the same 2,000 × 2,000 metre square centered at **40.7110, -74.0080**. The captures ran separately on 2026-09-29, so they are not one atomic provider state. Exact bounds, times, source URLs, budgets and export SHA-256 values are in the adjacent manifests. The original 43 complete exports, separately rejected evidence, building-grade, federal bridge, state bridge-roadway and alternate OSM exports match independent file hashes. A separate Python parser verified the expanded LiDAR JSON and every compressed tile byte count and SHA-256: 2,838 of 2,838 matched, with no issues. The verifier report is kept under ignored `.tmp/map-lab/manhattan-review/lidar-expanded/independent-verification.json`.

All **48 sources registered at the time of these captures** completed across separately dated queries, retaining **1,097.96 MiB** (1,151,298,694 bytes) of complete JSON, including lossless base64 originals. The initial 45-source pass completed 43 and rejected OSM and LiDAR without selecting partial data. Later live queries completed those two sources plus the newly registered building-grade, federal bridge and state bridge-roadway sources. This is source-by-source acquisition evidence, not a simultaneous browser scene or GPU-memory measurement. The later overhead-sign source is a separate scoped capture under ignored `.tmp/map-lab/sign-source/live-probe.json`, not part of this historical aggregate.

| Source | Lower Manhattan observation | Coney comparison |
| --- | ---: | ---: |
| 2014 building/roof mesh | 2,059 features; 73.99 MiB | 1,658; 35.42 MiB |
| NYC building footprints | 2,043; 3.68 MiB | 1,650; 2.57 MiB |
| NYC roadbeds | 881; 7.99 MiB | 402; 3.71 MiB |
| NYC LION street network | 3,328; 15.96 MiB | 1,387; 6.67 MiB |
| NYC rooftop water tanks | 294; 1.97 MiB | 20; 0.16 MiB |
| NYC building grade/floor | 1,971; 2.87 MiB | Not queried in prior capture |
| USDOT 2023 bridge inventory | 11 bridge points; 0.16 MiB | Not queried in prior capture |
| NYSDOT bridge-roadway relationships | 15 reported points; 0.10 MiB | Not queried in prior capture |
| OSM Overpass | 123,325 elements; 26.13 MiB (alternate endpoint) | 31,131 elements; 6.28 MiB |
| 2017 LiDAR | 127,919,817 points, 2,838 tiles; 878.76 MiB | 76,169,458 points; 526.98 MiB |

The later [overhead-sign measurement record](source-size-sign-measurements.json) uses those same Coney and Lower Manhattan bounds in a separate direct Chrome query. It preserves the exact JSON byte counts and snapshot hashes beside the sample values; full original service responses remain in ignored `.tmp/map-lab/sign-source/live-probe.json`.

| Later sign source | Coney 2 km | Lower Manhattan 2 km |
| --- | ---: | ---: |
| NYSDOT overhead sign asset points | 8 records; 26,416 snapshot JSON bytes | 24 records; 39,332 snapshot JSON bytes |

The Manhattan response includes 21 active and three retired assets; one asset has a null `AssetID`. The validated `OBJECTID` is the source identity. Both captures retain layer metadata and four original acquisition responses, including native and GeoJSON forms. These are reported asset locations, not measured sign faces, posts or bridge supports, and are not included in the historical 48-source aggregate above.

The later [height-restricted-bridge measurement record](source-size-clearance-measurements.json) uses the same area bounds in a separate direct Chrome query. Complete original service responses are under ignored `.tmp/map-lab/sign-source/clearance-probe.json`.

| Later clearance source | Coney 2 km | Lower Manhattan 2 km |
| --- | ---: | ---: |
| NYSDOT height-restricted bridge points | 9 records; 74,354 snapshot JSON bytes | 26 records; 152,904 snapshot JSON bytes |

The Coney response has four positive under-clearance values below 99 and five zeros. Manhattan has 18 such positive values, six zeros and two values at least 99. These are raw source fields; zero and high values require field-dictionary interpretation before any selection as a physical clearance. Native and GeoJSON representations, all 53 fields and original response metadata remain retained. This source is also outside the historical 48-source aggregate.

The full Manhattan LiDAR selection retains 676,293,280 compressed bytes and validates 4,221,353,961 decoded point-record bytes under the revised 150-million-point and 5-GiB decoded-byte budgets. The point count includes complete intersecting EPT tiles and may include points outside the exact rectangle. The initial LiDAR rejection retained hierarchy/query evidence, **not** a partial point cloud; the complete later capture is a separate source snapshot. The original OSM endpoint returned HTTP 504; the alternate endpoint returned the full requested OSM response, preserving 104,033 nodes, 18,376 ways and 916 relations. The alternate service is an availability observation, not proof that all Overpass endpoints are interchangeable or that a single combined scene fits in memory.

For under-building clues, the Manhattan OSM export retains 721 `min_height` and 114 `building:min_level` tagged elements. NYC footprints include three feature-code 1006 cantilevered buildings and seven feature-code 2110 skybridges. These counts are raw tags/classifications from the same OSM and footprint exports above; they do not certify an open passage or measured underside clearance. In the prior Coney export, `min_height` and footprint codes 1006/2110 were absent, with one `building:min_level` tag outside the identified Luna Park towers. No explicit Luna Park passage height has been verified.

To take a new sample without cloning a combined large scene through CDP:

```bash
xvfb-run -a -s '-screen 0 1600x1200x24' env QA_HEADED=1 QA_VIRTUAL_DISPLAY=1 \
  "$MAP_LAB_NODE" qa/map-lab/tests/source-size-capture.mjs \
  --center 40.5775,-73.978 --side 2000 --output .tmp/map-lab/new-source-sizes
```

Use `--only source-id[,source-id]` for an explicitly scoped capture. The manifest records its selection and active budgets; an external JSONL journal retains checkpoints during LiDAR validation. Decoded point bytes count validated records, not resident memory. This tool queries one provider at a time and streams full successful snapshots or separate rejected evidence to disk. Use a fresh output directory; exclusive manifest creation preserves earlier captures. It reports acquisition failures and never labels partial evidence complete. It measures data availability and payload sizes rather than running 2D preview or 3D generation. It creates no production source cache.
