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
| wsp (City Square) | 5.9 | — | — | — | r1 fixes landing |
| sbu (University) | 3.5 | 4.6 | — | — | r2 fixes landing |
| terminal (Central Station) | — | — | — | — | r1 capture done |

## Rules for builders
- No real institution / street / person names in rendered text or `name:` data fields (de-branded at 210af80).
- Perf gate: 60 fps @ 1280x720 on M3 Pro, <= ~600 draw calls, <= ~3 M triangles. Bar: railyard 482 dc / 1.85 M tri.
- Every solid → `ctx.colliders` Box3; every hittable mesh → `ctx.raycastTargets` with `userData.surface`.
- `ctx.rng()`, never `Math.random()`, for anything affecting layout.
