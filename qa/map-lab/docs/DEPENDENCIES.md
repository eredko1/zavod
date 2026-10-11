# Libraries and external services

Keep this inventory and the Help dependency table current when adding or removing an integration. An API supplies data; it does not imply that its provider's JavaScript SDK is installed.

## JavaScript libraries

| Library | Version / source | Scope | Purpose |
| --- | --- | --- | --- |
| Three.js | r186, vendored in `vendor/three/` | Game and map lab | Rendering, geometry, materials and Three.js addons, including OrbitControls |
| three-mesh-bvh | npm declaration `^0.9.15`; browser uses `vendor/three-mesh-bvh/` | Authored game | Accelerated ray casting; not used by the map lab's surface index |
| Apache ECharts | 6.0.0, vendored in `vendor/echarts/` | Lab reports | Charts, legends, filters and zoom; loaded after measurement |
| laz-perf | 0.0.7, pinned worker JS/WASM in `vendor/laz-perf/` | Lab acquisition worker | Decode original LAZ payloads into full measured LAS records; user-authorized dependency exception |
| MQTT.js | 5.10.1, dynamically loaded from jsDelivr or unpkg | Game multiplayer | MQTT client; not loaded by the map lab |
| playwright-core | npm declaration `^1.61.1` | Local QA | Browser automation; not loaded by either web page |

`package.json` alone is not the complete browser inventory: ECharts and laz-perf are vendored, and MQTT.js is loaded by URL. Document import maps select the local Three.js and BVH copies. Map compiler dependencies use explicit URLs to the same vendored Three.js modules because module workers do not inherit document import maps; `vendor/three/package.json` declares those existing files as ES modules for Node QA. No build step was added. License notices for ECharts and its bundled d3 code are under `vendor/echarts/`; [laz-perf provenance](../../../vendor/laz-perf/README.md) records the exact package, revision, integrity and Apache-2.0 license. Its worker loads only for LiDAR decoding, with no runtime CDN or service.

## Active data services

| Service | Usage |
| --- | --- |
| OpenStreetMap through Overpass | Geometry and tags; two selectable endpoints |
| NYC Open Data / Socrata SODA | Registered spatial datasets and their full metadata; see the source registry for the current inventory |
| OSM raster tiles | Background imagery for the area picker only; no generated geometry |
| NYC DCP / NYC ArcGIS REST | LION street network, native 2014 I3S buildings and rooftop water tanks, with complete responses/metadata; no ArcGIS SDK |
| NYSDOT ArcGIS REST | Ramp/roadway alignments and bridge inventory attributes; complete native/GeoJSON responses, retained as references; no ArcGIS SDK or API key |
| NY State Open Data / MTA SODA | Full station and entrance records/schema; GTFS centroids and reported access points remain distinct references; no SDK or key |
| NOAA public S3 / EPT | NYC 2017 lossless LASzip payloads, all intersecting depths, full schema/origin inventory and source-tile metadata; locally validated records and renderer decoding on query, no proxy |
| Public MQTT brokers | Authored game's multiplayer transport; separate from map acquisition |

The map source registry and Help list exact dataset IDs, queries, source attribution and geometry rules.

## Area picker

The native browser picker uses [OSM raster tiles](https://operations.osmfoundation.org/policies/tiles/) with visible attribution, normal browser HTTP caching and viewport-only requests. Images load only while the picker is open and are released when it closes. Automated tests intercept tile requests; they never pan/zoom against public tile servers. No new JavaScript library, geocoding API, API key or build step was added.

Coney Island is the default; the next block west is another preset. Drag to move the selected area, scroll or use buttons to zoom the basemap, and choose a square size. Exact coordinate entry remains available. Address/ZIP search was deferred by request; Photon was researched but is not connected.

Leaflet, MapLibre, OpenLayers, OSM2World, Unreal and Epic PCG are not installed dependencies. Research references in Help remain separate from implemented integrations.

## Deployment boundary

The requested Vercel deployment includes the lab and charts alongside the game. The game does not import the lab. The optional npm release package excludes QA, charts and pinned test data; Vercel does not automatically deploy that package.

The current `vercel.json` only rejects `/.tmp` requests and otherwise falls through to files. `.vercelignore` already excludes that scratch directory from uploads. The application code does not depend on the explicit route, and it does not block `/qa`.
