# WSP — Washington Square Park research → build plan (pre-research, 2026-09-16)

Coordinate frame: metres, origin = fountain centre, **+x east, +z south, +y up**. The park is a near-rectangle ≈ 200 m (E–W) × 160 m (N–S); 9.75 acres / 3.95 ha.
Bounding streets: Washington Sq North (z ≈ −80), South (z ≈ +80), East (x ≈ +100), West (x ≈ −100). Fifth Avenue meets the north edge on the arch axis (x ≈ 0).

## Measured facts (Wikipedia: Washington Square Park; Washington Square Arch)
| Element | Fact | Game plan |
|---|---|---|
| Arch | Tuckahoe marble, total height 22.4–23 m, width 17 m, opening 9.1 m wide × 14 m high, piers 9.1 m apart; attic inscription band; frieze of 13 large + 42 small stars with "W"s; winged victories in the spandrels; 1918 statues on the north faces: *Washington as Commander-in-Chief* (east pier), *Washington as President* (west pier) | Arch centre at (0, 0, −72) spanning x −8.5…8.5, z −3…3 (piers 3.9 m wide); coffered vault; statue groups as blocky figures ~4.5 m; maintenance ladder inside the west pier (`world.ladder`) → walkable attic roof y ≈ 22 (sniper perch, parapet colliders) |
| Fountain (Tisch) | 2009: moved ~7 m to sit on the arch axis; large circular basin with central jet and side jets; sunken plaza flattened/shrunk with concentric steps | Basin r ≈ 12 m at origin; plaza sunk 0.9 m (3 concentric steps ≤ 0.3 m, AABB steps); water plane + jet sprites; the plaza ring is the map's central "pit" |
| Paths | Radiate from the fountain plaza to every corner/entrance; hexagonal asphalt pavers with granite curbs; granite slab benches (2007–14 renovation) | 8 radial paths 6 m wide + a ring path; hex-paver canvas texture; lawns between (grass + weeds cards) |
| Garibaldi statue | 1888, east of the fountain | (+26, 0, +2) on a 3 m pedestal |
| Holley bust | west side | (−28, 0, −6) |
| Chess plaza | SW corner | tables + stools around (−60, 0, +45); low iron fence |
| Mounds | SW quadrant (near chess/kids' area) | two grass hills r ≈ 14 m, h ≈ 2.4 m at (−45, 0, +25) and (−25, 0, +45) — `groundHeight` |
| Playgrounds | NE and NW | fenced pads (+55, 0, −45), (−55, 0, −45) with simple play structures |
| Dog runs | two (large SW-ish / small NE) | fenced gravel ovals |
| Hangman's Elm | NW corner, giant English elm | trunk r 1.6 m, canopy r 14 m at (−80, 0, −60) |
| NW lawn | reopened 2020, ~3,600 m² | big lawn (−60…−20, −60…−20) |
| Bobst Library | NYU, red sandstone, Philip Johnson, **east** side (Wash Sq South/East corner) | 40 m tall block of red sandstone panels at x +100…+140, z +20…+80, grid windows |
| Judson Memorial Church + campanile | south side | Romanesque brick/limestone; 3-storey church body at (−20…+10, +82…+110) with a 30 m square campanile |
| The Row | Greek Revival row houses, north side, brick with white stoops and railings | continuous 4-storey brick facade z −82…−100 across x −90…+60, stoops with iron railings |
| One Fifth Avenue | 27-storey Art Deco tower straight north on 5th Ave | silhouette block at (−10…+10, −130…−160), 90 m, visible through the arch |
| Kimmel Center / Stern | NYU, south-west | glass-and-stone modern blocks on the south/west edge |
| Street furniture | Bishop's-crook cast-iron lampposts, wooden-slat benches with concrete ends, low iron hoop fences, trash cans, NYU/NYPD signs | instanced; generic signage text |
| Trees | London planes, elms, oaks | ~60 trees: trunk + 3 crossed alpha cards |

## Sources
- https://en.wikipedia.org/wiki/Washington_Square_Park (area, streets, 2009 fountain realignment, features, surroundings, NW lawn)
- https://en.wikipedia.org/wiki/Washington_Square_Arch (dimensions, materials, sculpture program, frieze/inscription)
- TODO next run: OSM/satellite trace of the exact path network and mound positions; 8–12 photos into qa/refs/wsp/ (arch N & S faces, fountain plaza, chess plaza, Garibaldi, The Row, Bobst, Judson campanile, hex pavers, benches/lamps).
