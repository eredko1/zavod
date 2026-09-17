# Washington Square Park — research & coordinate plan (WSP agent; merged with the coordinator's pre-research, 2026-09-17)

Frame: metres, origin = centre of the fountain (OSM way centroid 40.73083 N, 73.99746 W), **+x park-east, +z park-south, +y up**.
The Manhattan grid is rotated ≈ 29° from true north; everything below is in the grid-aligned frame (OSM coordinates rotated;
raw dump: `qa/refs/wsp/osm_plan_metres.txt`, constants in `src/world/wsp/layout.js`).

## Measured footprint (OpenStreetMap via Overpass, ODbL) — built 1:1
- Park polygon x ∈ [-163, 136], z ∈ [-73, 74] → 299 × 147 m (incl. its sidewalks; Wikipedia 9.75 acres). Playable bounds x ∈ [-176, 150], z ∈ [-142, 166] (≈ 326 × 308 m): the park + one block each side.
- Streets (OSM centrelines): Washington Sq N z≈-77 · Sq S z≈78 · Sq W / MacDougal St x≈-165 · Sq E / University Pl x≈139 · Fifth Ave x≈-2 (north of the arch) ·
  Washington Mews z≈-135 · MacDougal Alley z≈-130 · Thompson St x≈-14 · Sullivan St x≈-87 · LaGuardia Pl x≈58 · W 3rd St z≈158 · Waverly Pl / W 4th St continue the N/S park streets beyond the corners.
- Fountain: OSM circle r ≈ 11.5 → sunken floor 23 m ⌀ at −0.9 m, three 0.3 m granite steps (1 m treads) to r 14.5, coping to r 16.4, hex-paved plaza to r ≈ 31 (OSM ring path), inner ring path r 18. Central basin r 2.6, rim 0.45 m, jets.
- Washington Square Arch (OSM footprint x ∈ [-8, 11], z ∈ [-57.5, -50.5]): centre (1.5, -54); Wikipedia: 77 ft (23.5 m) high, 57 ft (17.4 m) wide, 30 ft (9.1 m) span, 47 ft (14.3 m) opening, piers 4.15 m, Tuckahoe marble.
  Stair in the WEST pier → attic; statue groups on the NORTH face (Washington at War E pier, at Peace W pier); winged victories in the spandrels; star/W frieze; attic inscription.
- Garibaldi (OSM node) (58, -6) east of the fountain; Holley bust west ≈ (-55, -3). Park house (comfort station) x ∈ [-72,-44] z ∈ [40,49]. Hangman's Elm (-149, -55).
- Chess plaza SW x ∈ [-150,-120] z ∈ [30,62]; "Play Hills" mounds x ∈ [-120,-92] z ∈ [29,52] (3 hills 2–3.6 m); playgrounds NE x ∈ [32,80] z ∈ [-43,-20] and NW x ∈ [-62,-36] z ∈ [-66,-56]; dog runs x ∈ [-86,-34] z ∈ [50,67] and x ∈ [21,41] z ∈ [58,67]; three round plazas (NW elm circle, NE, SE).
- Paths: all OSM footways transcribed (`PATHS` in layout.js) — radial N/S/E/W/SE/NE/SW/NW from the plaza, north walk, south walk, east loop, perimeter walks, corner entries, arch flanks.
- Surroundings (OSM footprints + heights): The Row 1–13 Wash Sq N x ∈ [14,83] 18.7 m (red brick Greek Revival, stoops) · 19–26 Wash Sq N + 2 Fifth Ave (63 m, tan) west of Fifth ·
  One Fifth Avenue x ∈ [11,43] z ∈ [-176,-139] 85 m Art-Deco setbacks (on the axis view, NE of the arch) · Washington Mews 2-storey stables · Silver Center x ∈ [145,179] 49 m (white/buff) ·
  Pless / Goddard 26 m · Brown Bldg 44 m · Kimmel Center x ∈ [9,46] z ∈ [86,151] 50 m (glass) · GCASL · Judson Memorial Church x ∈ [-41,-21] 20.5 m + campanile ≈ 40 m ·
  Bobst Library x ∈ [70,128] z ∈ [89,152] 43 m (red Longmeadow sandstone grid) with its raised forecourt · Kaufman (Stern) 50 m + Tisch Hall 45 m SE · Furman Hall 44 m · D'Agostino 46 m ·
  NYU dorm towers 49–65 m along Wash Sq W · MacDougal / W 3rd / Sullivan walk-ups 14–22 m with storefronts.

## Materials / furniture (photos: qa/refs/wsp, licences in SOURCES.txt)
- Paving: dark grey-blue hexagonal asphalt pavers on every path and plaza; grey granite flags + steps in the sunken fountain; concrete sidewalks with 5-ft scoring; asphalt streets with lane lines + zebra crossings.
- Lamps: black cast-iron ≈ 4.5 m posts with white acorn globes (off by day). Benches: World's-Fair style, black steel + dark slats, in long runs. Fences: 0.42 m black hoops around lawns (step-over), 1.1 m perimeter pickets on granite curbs with gates at every path, 1.3 m at playgrounds/dog runs.
- Trees: London planes / elms (mottled bark, 15–20 m broad canopies) lining every path, dense along the north and south walks, tree pits on the sidewalks. Hedges inside the perimeter fence.
- Street: parallel-parked cars, hydrants, one-way signs, bike racks, tree pits, Greek-Revival stoops with iron railings on The Row, awnings + storefronts on MacDougal / W 3rd / Sullivan, police barriers closing the street ends.
- Light: late morning, sun from the SE ≈ 46°, partly-cloudy sky HDRI (kloofendal_48d) as background + PMREM environment, exposure 0.95, light haze.

## Levels (all walkable / AI-registered)
park floor 0 · fountain pit −0.9 (steps via groundHeight) · mounds to +3.6 · Row stoops +1.4 · Bobst plaza +0.9 · playground decks +1.6 · park-house roof 5.3 (ladder S side) ·
Washington Mews roof 7.2 (fire-escape ladder from the Mews) · MacDougal Alley studios roof 10 (ladder from the alley) · arch attic 23.5 (ladder inside the west pier, door on its west face).

## Sources
- OpenStreetMap / Overpass (overpass.private.coffee): park, fountain, arch, footways, buildings with heights, streets — ODbL.
- Wikipedia: Washington Square Arch (dimensions, materials, sculpture programme, inscription); Washington Square Park (area, 2009 fountain move/renovation, mounds, chess plaza).
- Photos (Wikimedia Commons, CC / PD — see qa/refs/wsp/SOURCES.txt): arch north + south faces, fountain plaza, chess tables, Bobst/Kimmel, Judson, One Fifth Avenue, Garibaldi, Holley, park overview, Fifth Ave looking north.
