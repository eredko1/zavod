# ZAVOD — City Square map (`?map=wsp`) — Critic round 1

Frames: `qa/critic/wsp/wsp-*.png` (15 poses, 1280x720). Bars: `qa/critic/bar-railyard.png`, `qa/critic/bar-zavod.png`.
Refs used: `qa/refs/wsp/arch_fountain.jpg`, `fountain_plaza.jpg`, `chess_tables.jpg`, `row_houses_1982.jpg`.

Capture note: the working tree currently has a syntax error in `src/ai/nav.js` line 72 (an inline `//` comment swallows `if (...) continue; for (...) {...}` on the same line) that breaks the whole game (`Unexpected token '{'`). Frames were captured by serving the committed HEAD `nav.js` via a Playwright route. The builder must fix that line before anything else ships.

In-world text audit: all rendered strings are fictional — arch inscription ("TO THE CITIZENS WHO BUILT THIS CITY…"), shop fascias (CAFFE / FALAFEL / NOODLES …), "ONE WAY". No real institution names are rendered. `src/world/wsp/layout.js` carries real names in data labels (`Bobst Library`, `Kimmel Center`, `Judson Memorial Church`, `NYU Abu Dhabi`, street names) — never rendered today, but any future nameplate/street-sign feature would leak them. See fix 12.

## Scores (0–10)

| Axis | Railyard | Zavod | **City Square** | Notes |
|---|---|---|---|---|
| Lighting & exposure | 7 | 7 | **6** | Sunlit plaza reads well. Arch is near-clipped flat white (`arch`). Under the canopy (`spawn`,`garibaldi`,`kimmel`) everything is one flat dim green — no dappled light, no contact AO. `overview` has the same hard fog band as University. |
| Materials / texture | 7 | 6 | **5** | Building window grids and brick have variation; hex pavers OK. Arch is untextured white (`arch`); fountain plaza is flat white tile (`fountain`) where the ref is grey granite; hedges are solid green boxes (`kimmel`,`spawn`); cars are single-colour boxes. |
| Geometric detail & silhouette | 7 | 6 | **5** | Arch silhouette, roundels, star band, inscription: good. Row-house stoops, railings, church campanile: good. Fountain is a 4 m disc with cone jets, not the 20 m sunken basin (`fountain`). Cars are chamfered boxes (`macdougal`,`fifth`). Statue is a black blob (`garibaldi`). Chess tables are white mushrooms (`chess`). Rooftop in `attic` is a bare white plane. |
| Clutter / density | 7 | 5 | **6** | Benches, lamps, hedges, hydrants, fences, chess tables, parked cars: the best density of the three custom maps. Missing: bins, people/silhouettes, kiosks, signage, leaves, rooftop water tanks/HVAC. |
| Readability / composition | 7 | 6 | **6** | `hero`, `fountain`, `arch`, `row` compose well. `macdougal` is 50% black car box. `bobst` and `kimmel` are mostly canopy underside with visible leaf-card seams. `judson` is half a car and half a glass wall. |
| Recognizability vs photos | 7 | 7 | **6** | Arch + tan towers + campanile + row houses + chess corner = unmistakably the source square. Fountain basin is wrong, statue unreadable, plaza colour wrong. |
| Perf | 7 (60 fps, 482 dc, 1.85 M tri) | 4 (30 fps, 621 dc, 6.78 M tri) | **8** (60 fps, 193–307 dc, ~1.15 M tri) | Cheap. Budget available for cars, statue, fountain steps. |
| **Overall** | **7.0** | **5.9** | **5.9** | Best of the custom maps; a few placeholders drag it down. |

Placeholder flags: box cars everywhere (`macdougal`,`fifth`,`judson`,`row`), fountain disc + solid cone jets (`fountain`), black-blob statue (`garibaldi`), mushroom chess tables (`chess`), bare white rooftop (`attic`), solid-green hedge boxes (`kimmel`,`spawn`), square dark base plate under lamps (`spawn`), flat white arch marble (`arch`), magenta edge line along the arch cornice (`arch`, 1440p crop), untextured white distant city (`overview`).

## Prioritized fixes (max 12)

1. **Fix the nav.js syntax error** (blocks every map). `src/world`-independent: `src/ai/nav.js:72` — the `// 0.6 m margin…` comment is placed mid-statement and comments out the rest of the line. Move the comment to its own line above the loop.

2. **Fountain basin is a 4 m disc; the ref is a 20 m sunken plaza** (`fountain`, centre; `hero`, mid-right). Good = `fountain_plaza.jpg`: three concentric granite step rings (0.35 m rise each) down to a flat grey granite floor (`#8d8d88`, roughness 0.7, 1.2 m slab joints), a 4 m raised central plinth (`#6e6e6a`), jets as translucent particle columns not solid white cones. Do: sink the plaza 1.05 m with 3 step rings (they exist at the outer edge in `hero` — extend them to the full circle), recolour the floor from white to grey granite, replace the cones with alpha-blended jet meshes (opacity 0.55, additive) plus a mist sprite.

3. **Cars are single-colour boxes** (`macdougal` 50% of frame, `fifth`, `judson`, `row`, `bobst`). Bars have no cars, but the University buses got this note too. Do: one sedan + one cab + one van mesh with real wheels (0.33 m, dark rubber, hubcap), tinted glass band (the shared glass material, `#3a4a50`), headlights/tail lights, licence plate, paint with clearcoat (roughness 0.25, metalness 0.6). Move the `macdougal` pose so the camera is not inside a car.

4. **Statue is a black blob on a plinth** (`garibaldi`, centre-left). Good = `garibaldi.jpg` ref: bronze figure with sword, on a granite pedestal with inscription band. Do: bronze material (`#4b3f2a`, metalness 0.8, roughness 0.5, green patina streaks), a humanoid silhouette with an arm/sword, plinth in grey granite with a 0.3 m dark inscription band and a 0.6 m step. Keep name fictional.

5. **Arch is untextured flat white with a magenta edge artifact** (`arch`, whole frame; visible as a purple line along the entablature top at 1440p). Good = `arch_fountain.jpg`: warm grey-white marble (`#d9d4c8`), soot streaks under cornices, deep shadow inside the coffered barrel vault, relief spandrels. Do: albedo `#d9d4c8` with 8 m macro grime (±8%), a 0.1 m dark AO band under every cornice, coffers in the vault as 0.15 m recesses; fix the coplanar cornice cap that produces the magenta line (offset 0.01 m or merge).

6. **Canopy underside is flat leaf cards with visible seams** (`bobst`, `kimmel`, `spawn`, `garibaldi`: the top 60% of frame). Good = `chess_tables.jpg`: layered leaves with sun breaking through, dappled ground. Do: two-layer canopy (inner dark `#2d4a22`, outer lit `#6a9a3c`), alpha-tested leaf cards with `side: DoubleSide` and translucency (`transmission` or a fake back-light term), random rotation so seams do not align; add a dappled-light projector (cookie texture) over paths under canopy.

7. **Chess tables are white mushrooms** (`chess`, left third). Good = `chess_tables.jpg`: square concrete tables with inlaid checkerboard, fixed benches, low stone wall behind. Do: 0.8 m square concrete top (`#a4a29c`, roughness 0.9) with an 8 × 8 checker decal, single pedestal, 2 fixed concrete stools, 0.5 m stone wall along the back edge.

8. **Hedges are solid green boxes** (`kimmel`, `spawn`, `macdougal`). Do: leaf albedo `#3d5a2a` with 0.1 m noise displacement on the box surface, a darker base band, and 2–3 leaf-card sprites poking out of the top; add a 0.2 m soil strip under each hedge.

9. **Lamp bases sit on a large dark square plate** (`spawn`, left; also under several lamps in `chess`). Reads as a placeholder collider. Do: replace with a 0.4 m octagonal cast-iron base (`#1e1e1e`, roughness 0.6) and delete the plate; lamp head should emit a warm point light at dusk (not needed for this daytime map, but the globe should have `emissive #fff2d0` 0.3).

10. **Rooftop in `attic` is a bare white plane** (`attic`, lower 60%). Good = `row_houses_1982.jpg`: wooden water tanks, bulkheads, HVAC, parapet, tar roof. Do: tar/gravel roof material (`#5a5652`, roughness 1.0), 0.6 m parapet with coping, 1 water tank (2.5 m dia cedar cylinder, conical cap) per large roof, 2–4 HVAC boxes and a stair bulkhead per roof.

11. **Distant city is white untextured boxes behind a fog stripe** (`overview`, top third; `attic`, background). Do: give the distant kit the same tan/brick window-grid textures at low res, cap heights with parapets, and switch to exponential fog (density 0.0025) so the horizon does not read as a stripe.

12. **Real names in data labels** (`src/world/wsp/layout.js` lines 10–131: `Bobst Library`, `Kimmel Center`, `Judson Memorial Church`, `NYU Abu Dhabi / Kevorkian`, `Fifth Avenue`, `Washington Square …`; `furniture.js:190` branches on `'LaGuardia'`). Not rendered today, so not a visible defect, but the world-text rule says no real institution names: rename the `name` fields to fictional equivalents (e.g. `Central Library`, `Student Centre`, `Memorial Chapel`, `Arch Avenue`) and key `furniture.js` off `id` instead of `name` so nothing can leak into a future sign/nameplate pass.
