# ZAVOD — University map (`?map=sbu`) — Critic round 2

Frames: `qa/critic/r2/sbu-*.png` (15 poses incl. new `steps`, 1280x720). Bars re-captured: `qa/critic/bar-railyard.png`, `qa/critic/bar-zavod.png`.
Refs: `qa/refs/sbu/{sac1,library1,staller_steps,mall1,fountain1,wang1,wang2}.jpg`.

## Scores (0–10)

| Axis | Railyard | Zavod | Univ r1 | **Univ r2** | Delta | Why |
|---|---|---|---|---|---|---|
| Lighting & exposure | 7 | 7 | 4 | **5** | +1 | Exposure 0.85 fixed the clipped SAC fascia and the white terrace. Still no contact AO anywhere; `overview` fog band unchanged; `steps` risers render pure black (unlit material). |
| Materials / texture | 7 | 6 | 3 | **4** | +1 | Tinted reflective glass with lit bays is the single biggest win. Brick on Staller/Wang/Javits is still one uniform tile. Hex paving macro-noise is not visible at player height (`hero`,`fountain`). Lawn is still a flat green. |
| Geometric detail & silhouette | 7 | 6 | 3 | **4** | +1 | Library piers/arcade/canopy are real geometry now. Fountain has a basin ring and jets. Roof kits visible in `overview`. Wang has towers + red portal, but the portal is a flat 2D lattice at half scale and the mass is still a brick box. Buses are still boxes. Trees are unchanged blobs. |
| Clutter / density | 7 | 5 | 2 | **3** | +1 | Bike racks and bins near SAC, planters on the mall. Lawns (`staller`,`javits`,`wang`) are still empty fields. Hedge along Javits is a flat black strip. |
| Readability / composition | 7 | 6 | 5 | **5** | 0 | `wang` pose is now 60% sky with the building 200 m away. `steps` has a lamp post through the centre of frame. `plaza`/`spawn` have motorcycles parked on a pedestrian plaza. |
| Recognizability vs photos | 7 | 7 | 4 | **5** | +1 | Fountain and library now read as SBU. Wang is closer (towers, portal, spire) but is brown brick — real is taupe stucco (`wang1.jpg`). Staller is still a single slab, no cantilevered box. |
| Perf | 7 (60 fps, 482 dc, 1.85 M tri) | **4** (30 fps, 621 dc, 6.78 M tri) | 8 | **8** (60 fps, 268–457 dc, ~1.45 M tri) | 0 | University still cheapest map. **Zavod bar regressed from 60 to 30 fps** on this capture (dc 581→621) — check whether the shared glass/lit-bay material or roof kits leaked into the Zavod map. |
| **Overall** | **7.0** | **5.9** (was 6.1) | 3.5 | **4.6** | +1.1 | Better, still a greybox with good glass. |

### Improved
- Glass: `sac`, `library`, `hero`, `plaza` — tint, reflection gradient, occasional lit interiors. Matches `sac1.jpg` tone.
- Library: `library` — pier grid, deep bays, arcade, canopy with "LIBRARY" lettering. Reads as `library1.jpg` at 30 m.
- Fountain: `fountain` — ring, cobble apron, jets. Good silhouette.
- Terrace: `terrace` — no longer a white void; concrete floor, parapet, real view over the loop.
- SAC: `sac` — doors, canopy, bins, no clipped whites.
- Roofs: `overview` — parapets and HVAC boxes on most roofs.

### Regressed / new problems
- **`steps` pose**: terrace risers are flat black (no lighting response, no material), lamp post bisects the frame, library upper floors show aliasing/moiré dashes on the mullions.
- **`wang` pose**: camera moved far back; the building is a small brown box with a tiny red 2D portal. Worse framing than r1.
- **`roads` pose**: new bare-dirt patch bottom-left with a razor-hard grass edge; buses unchanged (box + blue stripe, no wheels).
- **`plaza`/`spawn`**: motorcycles spawned on the brick plaza — if gameplay vehicles, move spawns to the bus loop.
- **Zavod bar**: 30 fps on this capture (was 60). Verify nothing from the SBU material/roof pass is global.

## Prioritized fixes (max 10)

1. **`steps` risers are unlit black** (`steps`, lower half of frame). Good = `staller_steps.jpg`: pale grey concrete risers (`#b5b2aa`, roughness 0.85) with a 0.05 m nosing shadow, grass treads with a granite curb. Do: assign the standard concrete material to the riser meshes (they currently have no albedo/black), add a 0.04 m lip, and move the lamp post out of the pose's centre line or offset the pose 2 m.

2. **Wang Center still reads as a brick box with a sticker portal** (`wang`, centre; `overview` right). Good = `wang1.jpg`/`wang2.jpg`. Do: change facade to taupe stucco (`#8a8478`, roughness 0.8, no brick map); scale the red portal to 12 m wide × 7 m tall × 4 m deep with 0.6 m box beams as real geometry (currently a flat lattice ~5 m); add the low square window band (1 × 1 m every 2 m) along the top; move the `wang` pose to 25 m from the portal so it fills the frame.

3. **Brick is one uniform tile on every brick building** (`staller`, `javits`, `wang`, `sac` right wing). Good = `staller_steps.jpg`: dark brown brick with mortar-line variation, soot streaks under sills, lighter courses at floor bands. Do: brick albedo with 4 × 4 m macro variation (±10% luminance), a second dirt/streak overlay under every window sill (0.5 m, alpha 0.35), and a horizontal concrete band at each floor (0.3 m, `#a9a49a`).

4. **Contact occlusion is absent** (every pose; wall/ground joins in `library`, `sac`, `javits`). Bars have grounded shadows. Do: SSAO radius 0.6, intensity 0.9, or bake a 1 m gradient AO decal at every building base and planter; hemisphere light 0.35; shadow map 4096 over 120 m with PCF soft.

5. **Buses are boxes** (`roads`, `terrace` background). Do: body + 6 wheels (0.5 m radius, dark rubber), tinted window band using the new glass material, folding doors, roof HVAC hump, "Stony Brook University" side text; add a bus shelter with roof, bench and route sign at the loop.

6. **Trees are unchanged sprite blobs on black tubes** (`zebra`, `hero`, `roads`). Good = `mall1.jpg`. Do: bark albedo `#7a7062` mottled (not black); 2nd-order branch geometry; scale ±20% and random Y rotation per instance; alpha-tested leaf cards that cast shadows; contact shadow decal at base.

7. **Lawns are flat green** (`staller`, `javits`, `wang`, `roads`). Good = `staller_steps.jpg`: mow stripes, patchy tone, tree shadows, a granite retaining wall at the edge. Do: grass albedo with 8 m noise (±6%), 0.5 m grass-card clumps every 3 m within 20 m of camera, and a 0.5 m retaining wall where lawn meets paving; remove the hard dirt/grass edge in `roads` (blend with a 1 m alpha).

8. **Javits hedge is a flat black strip** (`javits`, mid-frame). Do: replace with a 1 m tall × 0.8 m deep hedge mesh (leaf albedo `#3d5a2a`, roughness 0.9, noise displacement 0.1 m) with gaps at paths.

9. **Library mullion aliasing at distance** (`steps`, `fountain` background). Thin dark mullions shimmer as dashes. Do: mullion width ≥ 0.12 m, enable anisotropic filtering 8× on the glass/mullion maps, and swap to a baked window-strip texture beyond 80 m.

10. **Overview horizon** (`overview`, top third). Fog still forms a hard stripe and the distant tree line is identical spikes. Do: exponential fog (density 0.0035) instead of linear; tree-line billboards with 3 silhouettes and ±30% scale.
