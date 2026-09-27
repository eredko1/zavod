# Pinned Coney regression input

`coney.json.gz` contains the original OSM response and nine separate NYC source responses used by the map regression tests. `manifest.json` records queries, acquisition timestamps, counts and a SHA-256 checksum of the uncompressed JSON. Each response retains its own source metadata and original properties. Node's built-in gzip support reads it; no download is needed to run offline tests.

This fixture is test input, not an automatic data source for the map page. Live queries and explicit `map-capture.mjs` exports remain separate. Refreshing this fixture is a deliberate baseline change: review geometry/provenance differences and expected assertions, then regenerate its checksum. Do not replace it implicitly when public datasets change.

`building-identity.json` is a small, separate September 2026 capture near Hampton Avenue and Hastings Street. It retains four OSM buildings and five corresponding NYC footprints, including a shifted identity match, a split footprint, weak overlap and a placeholder BIN. Query provenance and source metadata remain in the file. It exercises matching behavior rather than serving as a benchmark scene.

OSM data © OpenStreetMap contributors, available under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). See [OpenStreetMap copyright and attribution](https://www.openstreetmap.org/copyright). NYC records are attributed to NYC Open Data and the NYC Department of City Planning's LION service; dataset identifiers and query URLs appear in the manifest. Consult the [NYC Open Data terms](https://opendata.cityofnewyork.us/overview/#termsofuse) and each dataset's metadata for its terms and limitations.

Vercel deployment and the optional npm release artifact exclude this directory. Browser-based regression tests inject it explicitly from the local Node runner.
