# SBU — Stony Brook University (Academic Mall) research → build plan (2026-09-17)

## Frame
Metres, **origin = centre of the Academic Mall in front of the Melville Library**, +x east, +z south, +y up (mall level).
The campus grid is rotated 9.1° from true north; all OSM coordinates were rotated by −9.1° so the buildings are axis-aligned in game space (campus "east" = +x).
Playable bounds x −165…165, z −150…140 (330 × 290 m). Everything outside is backdrop (real position, simplified massing).

## Measured plan (OpenStreetMap ways/relations, projected at 40.9147 N −73.1235 W, rotated; rounded to 1 m)
| Element | Footprint (game m) | Height / notes |
|---|---|---|
| Frank Melville Jr. Memorial Library | x −19…73, z −144…−24 (92 × 120 m); entrance on the south face at x≈27 | 6 storeys ≈ 26 m; pale precast concrete with horizontal spandrel bands and deep-set ribbon windows, top floor narrow slit windows, sawtooth roof monitors, dark-brick corner stair towers; glass ground floor + "LIBRARY" lettering; lawn with low hoop fence in front |
| Academic Mall | band z −24…10, x −125…200, hex grey concrete pavers with red-brick bands, tree rows (planes/oaks), silver lampposts w/ lantern heads + red banners, black steel-slat benches, blue/green bins | y = 0 |
| SAC Plaza (circular plaza) | circle r≈45 centred (−72, 20): radial concrete bands, asphalt/paver sectors, bollards | y = 0; the SAC's white-framed glass front (E face at x −81, z 21…55) opens onto it |
| Student Activities Center | x −93…11, z 11…97; semicircular bay r≈13 at (−2, 24) facing the mall (glass drum), brick 3-storey wings with barrel-vault roofs behind, brick auditorium block SE | glass front 2 storeys ≈ 11 m, brick wings ≈ 14 m |
| Campus Drive bus loop | circle centre (−135, 94) r ≈ 21, road 9 m; Campus Drive exits west | asphalt, curbs, bus shelter, 2 buses |
| Frey Hall | x −97…−44, z −130…−49 (sawtooth east edge) | 3 storeys ≈ 14 m, brutalist ribbed/bush-hammered concrete |
| Zebra Path | x −35 (8 m wide), z −113…−37, striped black/white concrete bands | between Frey and the library, leads north to Chemistry |
| Harriman Hall | x −219…−121, z −110…−54 | 3 storeys ≈ 13 m concrete/brick |
| Earth & Space Sciences | x −239…−140, z −41…52 | 4 storeys ≈ 18 m concrete |
| Psychology A | x 55…116, z 19…72 | 3 storeys ≈ 12 m concrete |
| Staller Center for the Arts | north block x 69…174, z −198…−141; east wing x 146…174, z −141…−61; fly tower at (146…174, −198…−170) | brown brick, ribbon windows, fly tower ≈ 24 m, wings ≈ 14 m; west entrance canopy on the east wing at z≈−125 |
| Staller Steps | x 81…137, z −130…−61: grass terraces with concrete risers rising from the Staller plaza (y −3, x 132…146) west to the library (y 0) | 8 terraces × 0.375 m |
| Academic Fountain | ground-level circular splash fountain r 4.5 at (136, −6) in a cobble circle r 9 | central jet |
| The Brook (pond) | x 157…199, z −69…−27 (diagonal) | shallow pond, concrete edge — clipped at the east edge |
| Administration | x 198…272, z −65…4 | 4 storeys ≈ 16 m, concrete — backdrop east on the mall axis |
| Humanities | x 175…241, z 11…110 | 3 storeys ≈ 12 m — backdrop east |
| Educational Communications Center | x 50…117, z 109…182 | 2–3 storeys — south perimeter |
| Jacob K. Javits Lecture Center | x 89…160, z 151…218 | 2 storeys — backdrop south |
| Engineering / New CS | x −99…−51, z 124…227 / x −19…32, z 164…248 | 3–4 storeys — south perimeter |
| Chemistry | x −117…−22, z −199…−143 | 5 storeys ≈ 20 m — north perimeter |
| Stony Brook Union / Campus Rec Center | x −24…66, z −306…−237 / x −97…−31, z −315…−220 | backdrop north |
| Charles B. Wang Center | x 197…340, z −230…−130 | grey stepped stucco masses ≈ 18 m, red steel entry frame, stacked metal "lantern" tower ≈ 32 m with 4 white masts — backdrop NE; courtyard/pond at (240, −190) |
| John S. Toll Drive | z ≈ −207 (north of Chemistry / Staller) | backdrop road |
| Engineering Drive | x −60…−26, z 115…250 | south edge road |

## Pictorial notes (qa/refs/sbu/*.jpg — Wikimedia Commons, local only)
- library1/2/3, glaser_library: pale tan precast concrete, 5–6 horizontal bands, window bands recessed ~0.7 m with dark mullions, top-floor slits, brick corner tower, "LIBRARY" lettering, hex pavers with brick bands, hoop fence, silver lampposts.
- mall1/2/3, mall_staller: hex grey pavers, brick bands every ~6 m, tree pits with ivy, steel-slat benches, blue/green bins, red banners on lamps, plane trees.
- sac1/2/3: white steel curtain wall with white trim band and circle ornaments, red-brick wings with barrel vaults, red glass drum, brick auditorium, radial plaza paving, bollards.
- staller1/2, staller_steps, staller_steps_lib: brown brick, ribbon windows, fly tower, entrance canopy, grass terraces with concrete risers, library east facade with sawtooth monitors.
- wang1/2/3: grey stucco masses, red frame, lantern tower.
- fountain1/2: ground-level splash fountain, cobble circle, lamp banners.
- humanities, alley: concrete/brick halls, paved alleys.

## Sources
- OpenStreetMap (ODbL) via Overpass (overpass.kumi.systems) bbox 40.911–40.920 N, −73.131…−73.118 W; SAC relation 555625 via Nominatim.
- https://en.wikipedia.org/wiki/Frank_Melville_Jr._Memorial_Library (six storeys, 682,000 sq ft, 1969–71 wings, Glaser sculpture facing the mall)
- https://commons.wikimedia.org/wiki/Category:Melville_Library_(Stony_Brook_University), .../Category:Academic_Mall_(Stony_Brook_University), .../Category:Staller_Center_for_the_Arts, .../Category:Charles_B._Wang_Center, .../Category:Student_Activities_Center_(Stony_Brook_University)
