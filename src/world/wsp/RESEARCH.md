# Washington Square Park — research & coordinate plan (WSP agent, 2026-09-16)

Frame: metres, origin = centre of the fountain (OSM way centroid 40.73083 N, 73.99746 W). +x = "park east" (along Washington Sq N/S),
+z = "park south" (along the 5th Ave axis). The Manhattan grid is rotated ≈ 29° from true north; the whole plan below is in the
grid-aligned park frame (rotation applied to OSM coordinates; script output: `qa/refs/wsp/osm_plan_metres.txt`).

## Footprint (OpenStreetMap, ODbL)
- Park polygon: x ∈ [-163, 136], z ∈ [-73, 74] → 299 × 147 m ≈ 4.4 ha = 10.9 acres incl. sidewalks (Wikipedia: 9.75 acres). Built 1:1.
- Streets: Washington Sq N z ∈ [-73,-88] (building line -88), Sq S z ∈ [74, 87], Sq E x ∈ [136, 146], Sq W x ∈ [-163, -172].
  Fifth Avenue runs north from the arch between x ≈ -16 and 14.
- Fountain (sunken plaza): circle r ≈ 11.5 (OSM) → 23 m ⌀ floor, 3 concentric granite steps (0.3 rise, 1.0 tread) to r 14.5, floor y = -0.9.
  Central raised basin r 2.6, rim 0.45 m. Surrounding paved plaza (hex pavers) to r ≈ 31 (OSM path ring r 31). Inner ring path r 18.
- Washington Square Arch: footprint x ∈ [-8, 11], z ∈ [-57.5, -50.5] → centre (1.5, -54), 17.4 m wide (57 ft), 7.0 m deep, 23.5 m tall (77 ft),
  opening 9.1 m (30 ft) span × 14.3 m (47 ft) high, piers 4.15 m each. Tuckahoe marble (warm white). Stair inside the WEST pier (door on its
  west face) → attic. Sculpture groups on the NORTH face of both piers (Washington at War E, at Peace W) on pedestals at the base;
  winged victories in the spandrels; frieze with 13 large + 42 small stars and W's; attic inscription "LET US RAISE A STANDARD…".
- Garibaldi statue (1888, bronze on granite pedestal): (58, -6) — east of the fountain on the E path. Holley bust: west side ≈ (-55, -3).
- Paths (OSM footways, all built): radial N (0,-18)→(0,-31) splitting to x=-9.5 / x=12.5 around the arch; S (0,18)→(-13,70);
  SE (30,12)→(57,70); E (32,1)→(132,2); NE curve (57,1)→(107,-42); W (-31,0)→(-159,-2); SW diagonal (-77,-1)→(-130,43) to the chess plaza;
  NW diagonal (-89,-8)→(-130,-45) to the Hangman's Elm circle (-134,-49, r 5); NE circle (111,-45, r 5); SE circle (109,49, r 6);
  north walk (-131,-53)→(-14,-57) and (12.6,-57)→(101,-50); south walk (104,48)→(-120,55); perimeter walk 2 m inside the fence.
- Chess plaza: SW corner ≈ x ∈ [-150,-118], z ∈ [30, 62] (20 concrete tables). Mounds ("Play Hills"): x ∈ [-120,-92], z ∈ [29,52], three hills 2.5–4 m.
- Playgrounds: toddler NW x ∈ [-62,-36] z ∈ [-66,-56]; main NE x ∈ [32,80] z ∈ [-43,-20]. Dog runs: large x ∈ [-86,-34] z ∈ [48,67]; small x ∈ [21,41] z ∈ [58,67].
- Park house (comfort station, 4.6 m): x ∈ [-72,-44] z ∈ [40,52]. Hangman's Elm at (-149, -55) (NW corner, ~ 34 m English elm).
- Surroundings (OSM heights): N: The Row 1–13 Wash Sq N x ∈ [14,83] z ∈ [-115,-88] 18.7 m red-brick Greek Revival + marble stoops;
  2 Fifth Ave (tan brick, 63 m) x ∈ [-64,-16] z < -89; One Fifth Ave (Art Deco setback tower, ≈ 90 m) NE of the arch across 8th St;
  NW row 12–20 m brick houses x ∈ [-142,-64] z < -90. E: Silver Center (buff/white, 49 m) x ∈ [145,179] z ∈ [-67,-8]; Pless 26 m z ∈ [12,36];
  Goddard 25.5 m z ∈ [36,71]; Brown Bldg (brick 44 m) behind. S: Kimmel (glass/limestone 50 m) x ∈ [9,46]; GCASL x ∈ [-8,16];
  Judson Memorial Church (yellow brick, 20.5 m) x ∈ [-41,-21] + campanile ≈ 40 m at (-22, 90); brick houses x ∈ [-83,-41] 17–26 m;
  Bobst Library (red Longmeadow sandstone, 43 m, ribbed) x ∈ [70,128] z ∈ [89,152]; Kaufman 50 m SE behind. W: NYU dorm towers 49–65 m tan brick.

## Materials / furniture (photos in qa/refs/wsp, sources in SOURCES.txt)
- Paving: dark blue-grey hexagonal asphalt pavers (≈ 30 cm across) everywhere on paths and the arch/fountain plaza; grey granite flags and
  granite steps inside the sunken fountain plaza; granite curbing; street asphalt + concrete sidewalks with granite curbs.
- Lamps: black cast-iron posts ≈ 4.5 m with white acorn/globe luminaires (WSP twin-globe posts + single-globe Bishop's-crook style). Off in daylight.
- Benches: World's-Fair style — black steel frame + dark stained wooden slats (~1.8 m), in long continuous runs along paths and around the plaza.
- Fences: low (0.45–1.1 m) black steel pipe/picket fences around lawns, taller (1.3 m) at playgrounds/dog runs; park perimeter 1.1 m iron fence w/ gates.
- Trees: London planes (mottled grey/olive trunks, broad canopies 15–22 m), elms, a few cherries; dense canopy all round the plaza and along the north walk.
- Light: late-morning sun from the SE (HDRI urban_street_04, sun elev ≈ 30° measured; key light raised to 42°), haze light.

## Sources
- OpenStreetMap via Overpass (overpass.private.coffee), park/fountain/arch/footway/building ways with heights — ODbL.
- Wikipedia: Washington Square Arch (73.5–77 ft high, 57 ft wide, 30 ft span, 47 ft opening height, Tuckahoe marble, sculptures, inscription).
- Wikipedia: Washington Square Park (9.75 acres, 2009 fountain renovation aligned with the arch, mounds, chess plaza).
- Photos: Wikimedia Commons (see qa/refs/wsp/SOURCES.txt for file + license per image).
