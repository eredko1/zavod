# ZAVOD — University map (`?map=sbu`) — Critic round 1

Frames: `qa/critic/sbu-*.png` (14 poses, 1280x720), bars: `qa/critic/bar-railyard.png`, `qa/critic/bar-zavod.png`.
Refs used: `qa/refs/sbu/sac1.jpg`, `library1.jpg`, `staller_steps.jpg`, `mall1.jpg`, `fountain1.jpg`, `wang1.jpg`, `wang2.jpg`.

## Scores (0–10)

| Axis | Railyard (bar) | Zavod (bar) | **University** | Notes on University |
|---|---|---|---|---|
| Lighting & exposure | 7 | 7 | **4** | Whites clip (SAC fascia, `terrace` is a 100% white box). Ambient too high: no contact darkening where walls meet ground. `overview` has a hard fog band at horizon. |
| Materials / texture | 7 | 6 | **3** | Every window is the same flat sky-blue card with no reflection/interior. Brick and hex-tile are single uniform tiles, zero grime/AO/variation. Grass is a flat green. |
| Geometric detail & silhouette | 7 | 6 | **3** | Extruded boxes everywhere. Library has no recessed bays or piers. Wang is the wrong building. Fountain is a white cone. Buses are boxes. Trees are blob sprites on black cylinders. |
| Clutter / believability density | 7 | 5 | **2** | Lawns and plazas are empty. No bins, bike racks, planters, signage, people. Compare `mall1.jpg`: groundcover beds, tree pits, curbs, benches, banners, bins every 20 m. |
| Readability / composition | 7 | 6 | **5** | Layout reads (mall axis, SAC plaza, fountain). But `wang` pose is a wall + gun; `terrace` is nothing; `javits` is a brick box on grass. |
| Recognizability vs photos | 7 (identity) | 7 (identity) | **4** | Colors and plan are right (SAC white/red drum, library tan, staller brown brick, red banners). Forms are wrong: Wang, Staller massing, Library depth, fountain. |
| Perf | 8 (60 fps, 442 dc, 1.84 M tri) | 6 (60 fps, 581 dc, 6.77 M tri) | **8** (60 fps, 209–320 dc, ~1.09 M tri) | Cheapest map by far. Budget is unspent — there is headroom for 2–3× geometry. |
| **Overall** | **7.0** | **6.1** | **3.5** | Ship-blocking. Reads as a greybox with color applied. |

Placeholder flags (must go): fountain cone (`fountain`), white-box terrace interior (`terrace`), box buses with a blue stripe (`roads`), uniform hex tile with no wear (`hero`,`library`,`fountain`), single-tile brick on Wang/Staller/Javits (`wang`,`staller`,`javits`), sky-card windows on every building, blob-sprite trees with no branches (`zebra`,`roads`), clipped signage text ("Central Memorial LIBRARY" / "ER CENTER FOR THE") (`library`,`staller`), dirt-stripe lawn bands (`staller`), no HVAC/parapet on any roof (`overview`).

## Prioritized fixes (max 12)

1. **Fountain is a white cone on a disc** (`fountain`, center-left). Good = `fountain1.jpg`: 1.1 m granite basin ring (rough split-face blocks, cap slab), radial cobble infill, central jet + 6 arc jets, wet dark stone inside. Do: replace cone with torus-wall (r 6 m, h 1.1 m, `roughness 0.9`, split-face normal map), inner cobble floor (`#5a5750`, roughness 0.85, wet mask), water plane (`#3b4a4d`, metalness 0.1, roughness 0.05) 0.2 m below rim, particle/mesh jets (8 m spire + 6 × 3 m arcs), 4-ring cobble apron outside matching photo.

2. **Library facade is a flat extruded card** (`library`, whole frame). Good = `library1.jpg`: 0.6–0.8 m deep concrete pier grid, band floors that read as horizontal slabs, deep shadowed window bays, tall narrow clerestory strip on top floor, recessed ground-floor arcade, canopy over entrance with "Frank Melville Jr. Memorial LIBRARY" cut into the slab. Do: model piers as real boxes (not texture), recess glass 0.7 m, add slab lips 0.3 m, ground floor set back 3 m under columns, fix the signage text (currently truncated/overlapping).

3. **Wang Center is the wrong building** (`wang`, whole frame; also `overview` right). Game shows a red-brick 2-storey slab with ribbon windows. Good = `wang1.jpg`/`wang2.jpg`: taupe-grey stucco (`#8a8478`, roughness 0.8) stepped boxes 12–18 m tall, twin glass-strip towers flanking entrance, a **red steel portal frame** (`#c8262a`, 0.6 m beams, 2 bays deep) with "CHARLES B. WANG CENTER" on the lintel, granite entry steps, low square window band. Keep the pagoda spire (already present). Reflecting pond is fine, keep it.

4. **Terrace pose is a clipped white box** (`terrace`, entire frame). Floor, walls, mullions all `#ffffff` with no shading. Do: floor = grey terrazzo tile (`#a9a6a0`, roughness 0.6), parapet in painted metal (`#dcdcd8`, roughness 0.4, metalness 0.3), glass tint (`#6f8f8a`, roughness 0.05, metalness 0.9, envMap), add roof beam structure and lower exposure so no pixel exceeds 0.95.

5. **Windows are sky-blue stickers on every building** (`sac`, `library`, `hero`, `plaza`, `javits`). Good = `sac1.jpg`: green-grey glass with reflection gradient, visible interior (lights, blinds), dark mullion depth. Do: one glass material (`#5c7a74`, roughness 0.04, metalness 0.95, envMapIntensity 1.2) + interior-parallax card or cubemap; mullions extruded 0.08 m; 30% of windows randomly emissive-warm (`#ffe4b0`, 0.4) for interior lights.

6. **SAC entrance and fascia** (`sac`, center; `spawn`). Entrance is a white box with blue rectangles; no doors, no rivet-plate pattern, blown-out white. Good = `sac1.jpg`: 6 aluminum-framed glass doors with push bars and signs, plate detail on fascia (circular and rectangular bosses), blue "BOTTLES & CANS" and black "WASTE" bins at door, bench. Do: fascia `#e6e6e2` roughness 0.5 (not 1.0 white), add boss details as 0.03 m plates, door frames as geometry, lettering with slight offset shadow.

7. **Ground tiles uniformly tiled and dead** (`hero`, `library`, `fountain`, `frey`). Good = `mall1.jpg`: hex paver with grime, joint dirt, moss, wide brick banding, raised granite curbs (0.15 m), tree pits with ivy groundcover. Do: macro-variation noise on albedo (±8% luminance, 20 m scale), detail AO in joints, add curb geometry where paving meets grass, tree pits 3 × 3 m with groundcover material, drop leaf decals.

8. **Trees are identical sprite blobs on black tubes** (`zebra`, `roads`, `hero`, `javits`). Good = `mall1.jpg`: London plane with branching, mottled bark, canopy that lets light through. Do: 3+ species (plane, oak, pine already present), 3 scale variants ±20%, random Y rotation, branch geometry to 2nd order, bark albedo (`#7a7062` mottled, roughness 0.9) not black, shadow-casting leaf cards with alpha, contact shadow on ground.

9. **Staller Center massing and lawn** (`staller`, whole frame). Game = single brown extrusion with a strip of glass. Good = `staller_steps.jpg`: stepped brick boxes (fly-tower 24 m, wings 12 m), cantilevered concrete balcony with "STALLER CENTER FOR THE ARTS" (text is clipped in game), ramps, railings, deep recessed glass lobby, planting at base. Lawn has odd horizontal dirt-stripe bands — remove, use a proper lawn material with tree shadows and a granite retaining wall at the edge (0.5 m).

10. **Ambient too flat, no contact occlusion** (all poses; visible at every wall/ground junction). Bar frames have proper grounded shadows. Do: enable SSAO (radius 0.6, intensity 0.9) or bake contact AO decals at building bases; hemisphere light intensity 0.6 → 0.35; sun 2.4 with shadow map 4096 over 120 m and PCF soft; tonemapping exposure 0.85.

11. **Buses and bus loop** (`roads`, center). Buses are white boxes with a blue stripe, no wheels, no glass, no doors; lot has no curbs, shelters are flat cards. Do: bus = body + 6 wheels + tinted glass band + folding doors + roof HVAC hump, "Stony Brook University" text; add shelter with roof, bench, sign; concrete curbs (0.15 m), lane arrows, crosswalk paint with wear.

12. **Roofs and skyline** (`overview`, whole frame). All roofs are flat untextured planes; fog forms a hard horizontal band. Do: parapet caps (0.4 m) on every roof, 2–6 HVAC units/vent boxes per roof, gravel roof material (`#6d6a62`, roughness 1.0), fog `near` further out and exp density instead of linear so the horizon does not read as a stripe; distant tree line as varied billboards not uniform spikes.
