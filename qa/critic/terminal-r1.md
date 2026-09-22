# ZAVOD — Central Station map (`?map=terminal`) — Critic round 1

Frames: `qa/critic/r1/terminal-*.png` (17 poses, 1280x720). Bars: `qa/critic/bar-railyard.png` (7.0), `qa/critic/bar-zavod.png` (5.9).
Refs: `qa/refs/terminal/{concourse_wide,concourse_east,light_shafts,vanderbilt_hall,dining_concourse,whispering_gallery,clock_booth,info_booth,subway_platform,stairs_platform,ticket_windows,ceiling_cancer}.jpg`.

Perf across all 17 poses: **60 fps, 271–350 draw calls, 1.12–1.34 M triangles.** This is the cheapest of the three
new maps and has the most headroom of any map in the game. Nothing below is blocked on budget.

## Scores (0–10)

| Axis | Railyard | Zavod | **Central Station r1** | Notes |
|---|---|---|---|---|
| Lighting & exposure | 7 | 7 | **5** | Light shafts through the clerestories (`shafts`, `overview`) are the best single thing in the map. But there is no cove lighting anywhere — the ref's defining feature is a continuous warm strip washing every cornice and arch. Concourse is one flat ambient value; no falloff from window to floor. `street` is a murky flat grey; `facade` is blown out at the top and black underneath. |
| Materials / texture | 7 | 6 | **4** | Limestone is a single flat tan with a faint uniform block grid — no warm veining, no soot, no polish gradient, no colour break between wall / pier / cornice. Floor is flat pale tile with zero reflection (ref: polished warm marble that mirrors the lights). Arch windows are white flat planes with a painted grid; ref mullions are dark bronze with real depth and a glow behind. Street buildings are untextured tan boxes with painted-on windows. |
| Geometric detail & silhouette | 7 | 6 | **5** | The **massing is genuinely good**: barrel vault + cross-vault lunettes, east/west balconies with balustrades, the ramps, the dining vaults, the 4-track subway, the stair wells. What is entirely missing is ornament: no coffer rosettes in the vault arches, no relief spandrel sculptures in the lunette webs, no chandeliers in the main concourse, no cornice dentils, no pier capitals. The famous four-faced clock is absent — the information booth is a plain drum with pennants. |
| Clutter / density | 7 | 5 | **5** | Benches, newsstand kiosks, track boards, dining tables/stools, a couple of trash bins. Zero people. Platforms are bare. No luggage, no rolling carts, no stanchions, no ticket queue, no litter, no pigeons, no departure crowd. A transit hall with nobody in it reads as a greybox. |
| Readability / composition | 7 | 6 | **4** | Two poses are ruined by a black slab filling the frame: `clock` is ~60% the back of the INFORMATION banner (and the clock it is named for is not in shot), `overview` is ~50% the unlit back of a departure board. `ramp` is a corridor of blank wall. `street` is half dark void at shop level. |
| Recognizability vs photos | 7 | 7 | **6** | Green constellation ceiling + arched clerestories + TRACK boards + balustraded balconies read unmistakably as the source hall. The missing brass clock is the single biggest recognizability loss; the absent cove lighting is the second. |
| Perf | 7 (60 fps, 482 dc, 1.85 M tri) | 4 (30 fps, 621 dc, 6.78 M tri) | **8** (60 fps, 271–350 dc, ~1.3 M tri) | Huge headroom. Spend it. |
| **Overall** | **7.0** | **5.9** | **5.3** | Best bones of the three new maps, least surface. It is a well-planned greybox. |

Placeholder flags: flat untextured limestone everywhere; white flat-plane arch windows (`hero`,`stairs`,`overview`); unreflective floor (every interior pose); black unlit slab boards (`overview`,`clock`,`hero`); no clock on the information booth (`clock`); pennant drum instead of the booth (`clock`); bare platforms (`platform`,`train`); untextured tan street boxes with painted windows (`street`,`facade`); black void shopfronts (`street`); flat green steel platform columns with no rivets/wear (`platform`); dining vault tile is one uniform corduroy pattern (`dining`,`gallery`,`ramp`).

## Prioritized fixes (max 12)

1. **Cove lighting — the defining light of the building is missing** (every interior pose; ref `concourse_wide.jpg`, `concourse_east.jpg`). In the ref a continuous warm strip runs the full length of every cornice and around every arch head, washing the stone from below and creating the whole value gradient of the room. Do: emissive strip meshes (`#ffd9a0`, emissive intensity ~2.5, bloom-visible) along the main cornice on all four walls, along the balcony undersides, and around each clerestory arch; back them with a few wide low-intensity point/rect lights so the stone actually receives the wash. This single change is worth more than any other item here.

2. **Restore the four-faced clock and rebuild the information booth** (`clock` pose, centre; ref `clock_booth.jpg`, `info_booth.jpg`). Currently a plain drum with coloured pennants and no clock at all — and the pose named for it does not even frame it. Do: octagonal marble/brass booth ~4 m across with a gold-leaf kiosk band and lit window openings, a central brass column, and the four-faced opal-glass clock on top (4 faces, ~0.7 m dia, cream emissive `#f3e6c8` at 0.4, black hands and numerals, brass bezel `#b08d3f` metalness 0.9). Re-aim the `clock` pose to frame it at ~8 m with the vault behind.

3. **Vault and lunette ornament** (`hero`, `overview`, `shafts`, `stairs`; ref `concourse_wide.jpg`, `ceiling_cancer.jpg`). The vault arches in the ref carry a band of deep carved rosettes and the lunette webs carry relief sculpture; ours are bare. Do: a repeating rosette/coffer band (0.15 m recesses, normal-mapped or real shallow geometry) along each transverse arch soffit; a relief panel material in the six lunette webs; dentil course under the main cornice. Also give the green ceiling real paint variation — the ref is mottled teal `#2f5f52` with gold constellation linework and visible patina, not a flat fill with white dots.

4. **Fix the two ruined poses** (`clock`, `overview`). `overview` is half the unlit back of a departure board; `clock` is 60% the back of the INFORMATION banner. Do: give every board a finished back (dark bronze frame, cable runs, a maintenance ladder) so no camera sees a raw black plane, and re-aim both poses to compose the hall — `overview` from the west balcony looking east down the full length, `clock` on the booth as in fix 2.

5. **Limestone needs to stop being one flat tan** (every interior pose; ref `concourse_wide.jpg`). Do: warm cream base `#c9b590` with 6 m macro luminance variation (±8%), a subtle vertical veining/streak overlay, soot darkening in the upper 3 m and under every cornice and balcony, a 0.1 m dark AO band at every wall/floor and wall/pier join, and a distinctly lighter polished band on the pier bases (the ref's stone is visibly polished up to ~2 m and matte above).

6. **Arch windows are white flat planes** (`hero`, `stairs`, `overview`, `shafts`; ref `concourse_wide.jpg`, `light_shafts.jpg`). Do: dark bronze mullion grid as real geometry standing 0.12 m proud of the glass (`#3a3026`, metalness 0.7), glass behind it as a bright but not clipped emissive-ish plane (`#e8eef5`, keep it below 1.0 after tone mapping), and a deep reveal (0.8 m) so the head casts a real shadow into the hall.

7. **Floor has no polish** (every interior pose; ref `concourse_wide.jpg`, `dining_concourse.jpg`). The ref floor mirrors the chandeliers and the crowd. Do: drop roughness to ~0.25 on the concourse marble, give it a warm tan albedo with large slab joints and a Tennessee-marble pink/grey mottle, bump envMapIntensity, and add a broad soft specular sheen under the windows. Keep the dining/passage terrazzo matte for contrast.

8. **The hall is empty of people and life** (every interior pose). A concourse with nobody in it cannot score above a 6 regardless of materials. Do: 25–40 low-poly standing/walking civilian silhouettes (instanced, simple capsule-ish bodies with varied clothing colours, no faces needed at this fidelity) clustered at the booth, the boards, the stairs and the ticket windows, with contact shadows; plus luggage, stanchion-and-rope queues at the ticket windows, rolling carts, bins, and a few pigeons. Non-combatant props only — they must not be `ctx.raycastTargets` soldiers.

9. **Chandeliers are missing from the main concourse** (`hero`, `shafts`, `stairs`; ref `concourse_wide.jpg` — the tall gilt fixtures on the piers). `vanderbilt` already has good ones; the main hall has none. Do: reuse the Vanderbilt chandelier kit as wall-mounted gilt sconces on each main-hall pier, with a warm point light each at low intensity so they read against the stone.

10. **Platforms are bare** (`platform`, `train`; ref `subway_platform.jpg`, `stairs_platform.jpg`). Do: dirt/soot gradient up the tile walls, a grimy platform edge with a yellow warning strip (worn, not clean), trash and ballast in the track bed, third-rail and sleeper detail, cable trays and conduit on the walls, wall-mounted signage at intervals, benches, a leaking-pipe stain or two, and rivets/rust/paint chipping on the green columns (they are currently perfectly clean flat green).

11. **Street exterior is an untextured box town** (`street`, `facade`, `viaduct`; ref any street-level photo). Do: real brick/limestone/terracotta albedos with window reveals instead of painted-on rectangles, lit shopfront interiors instead of black voids (a simple emissive back-plane + a counter silhouette is enough), awnings with fabric texture, sidewalk detail (gratings, hydrants, scaffolding, newspaper boxes, bollards), and a proper daylight exposure — the current `street` reads several stops underexposed while `facade` clips at the cornice.

12. **Dining/passage vault tile is one uniform corduroy** (`dining`, `gallery`, `ramp`; ref `dining_concourse.jpg`, `whispering_gallery.jpg`, `oyster_bar_ceiling.jpg`). Do: Guastavino herringbone tile as a proper tiled albedo with per-tile tone variation (±10%), a darker mortar network, soot at the vault springing, and stronger lamp-to-vault falloff so the curvature reads. Also break up `ramp`: the long blank wall needs signage, a handrail, wall lamps at intervals and a tiled wainscot.

## Note for the user (not a defect)
The main concourse renders a US flag (`hero`, matching `concourse_wide.jpg`). All institution names are already
fictionalised ("MAIN ST", "DINING CO…", generic TRACK numbers). The flag is the one remaining element that ties
the fictional station to a specific real place — keep or drop as you prefer; it is not a de-branding violation.
