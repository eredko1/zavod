# ZAVOD — critic loop (three new maps to >= 8/10)

Goal: `wsp` (City Square), `sbu` (University), `terminal` (Central Station) each score >= 8.0
overall against AAA (CoD MW2019-class) standards, judged against the photo refs in `qa/refs/<map>/`
and the two in-house bar maps (`railyard` 7.0, `zavod` 5.9).

## Round protocol
1. **Capture** — `./qa/critic-shots.sh <map> <round>` → `qa/critic/r<round>/<map>-<pose>.png` (1280x720)
   plus per-pose fps / draw calls / triangles. Server must be up: `./qa/serve.sh` (port 8790).
2. **Critique** — a fresh agent (no build context) reads the frames + the refs + the two bar maps and
   writes `qa/critic/<map>-r<round>.md`: a 0-10 score per axis
   (lighting & exposure · materials/texture · geometry & silhouette · clutter/density ·
   readability/composition · recognizability vs photos · perf), an overall, a placeholder-flag list,
   and <= 12 prioritized fixes each naming the pose, the frame region, what "good" looks like in a
   named ref, and the concrete change (colour hex, dimension, material params).
3. **Build** — the map's builder agent implements the fixes. Strict file ownership:
   `src/world/<map>/*.js` + `src/world/maps/<map>.js` only. Verifies with its own screenshots.
4. **Commit + push**, then repeat from 1 with round+1.

Stop when overall >= 8.0 or after round 8.

## Status
| Map | r1 | r2 | r3 | r4 | Current |
|---|---|---|---|---|---|
| wsp (City Square) | 5.9 | — | — | — | **r1 fixes all landed** (6992606, 7b51f99) — needs r2 capture + critique |
| sbu (University) | 3.5 | 4.6 | — | — | **r2 fixes partially landed** (806d600, detail.js) — finish, then r3 capture |
| terminal (Central Station) | 5.3 | — | — | — | **critiqued, 12 fixes queued, builder never launched** |

## Next session — start here
1. `./qa/serve.sh`, then `./qa/critic-shots.sh wsp 2` and `./qa/critic-shots.sh sbu 3`; critique each into `qa/critic/<map>-r<N>.md`.
2. Launch the Central Station builder on `qa/critic/terminal-r1.md`. Highest value first: **(1) cove lighting, (2) the four-faced clock + information booth, (4) the two ruined poses, (8) people in the hall** — those four are most of the 5.3 → ~7 gap and are cheap. Ornament / street exterior / platform grime can follow.
3. Perf watch: `zavod` is at **713 draw calls / 6.8 M tri** (was 581–621) and `wsp` dropped to **52 fps / 1.78 M tri** after the r1 detail pass. Both need a look before adding more.

## Rules for builders
- No real institution / street / person names in rendered text or `name:` data fields (de-branded at 210af80).
- Perf gate: 60 fps @ 1280x720 on M3 Pro, <= ~600 draw calls, <= ~3 M triangles. Bar: railyard 482 dc / 1.85 M tri.
- Every solid → `ctx.colliders` Box3; every hittable mesh → `ctx.raycastTargets` with `userData.surface`.
- `ctx.rng()`, never `Math.random()`, for anything affecting layout.

## Perf findings (2026-09-22)

**City Square canopy — fixed, 31 -> 60 fps.** The two-layer canopy is fill-bound, not geometry-bound: ~9 large
alpha-tested cards overlap per tree, so standing under one shaded every pixel ~9x through a full Standard
material. Measured at 1280x720 hero: 31 baseline · 40 inner layer off · 42 Lambert · 45 all-FrontSide ·
**60 Lambert + FrontSide inner core** (shipped, 9395f63). Outer shell stays DoubleSide so the silhouette is
unchanged. General lesson for every map: big alpha-tested DoubleSide cards wreck the frame rate while draw
calls and triangle counts still look healthy — measure fps from a pose standing directly under them.

**Zavod's 6.8 M triangles is NOT an SBU leak — it is unoptimized Poly Haven props** (the issue already noted
in CONTRACT/handoff as "World agent was mid-fix when stopped"). Scene total is 1.58 M tris; the 6.8 M in
`stats` is the rendered figure across the shadow passes. Per-instance triangle counts from a scene profile:

| Prop | Tris each | Should be |
|---|---|---|
| `street_lamp_01` post | 30,050 | ~500 |
| `portable_generator` | 26,245 | ~800 |
| `concrete_road_barrier_02` | 23,822 | ~50 (it is a box) |
| `metal_jerrycan` | 20,022 | ~300 |
| `plastic_crate_01` | 18,320 | ~100 |
| `cardboard_box_01` | 16,952 | ~12 (it is a box) |
| `wooden_military_crate` | 14,548 | ~100 |

They are correctly instanced, so draw calls are fine; the meshes themselves were never decimated. Fix is a
one-off decimation pass over `assets/props/*` — worth doing before Zavod's perf score (4/10) can move, and it
would cut the shadow cost across every map that reuses these props. Out of scope for the three new maps.
