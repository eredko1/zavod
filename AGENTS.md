# AGENTS.md — working on ZAVOD (for Codex / Claude / any coding agent)

Browser FPS in plain Three.js r186 (vendored in `vendor/`, ES modules + importmap, **no build step**).
`main` auto-deploys to https://zavod-chi.vercel.app — **work on a branch and open a PR** (Vercel posts a preview URL on
every PR); don't push straight to `main` while people are playing.

## Run
```
npm install            # only playwright-core, for the QA scripts (needs Google Chrome installed)
./qa/serve.sh          # no-cache static server → http://localhost:8790
```
Useful URLs: `?map=coney` · `?map=coney&mode=chill` · `?qa=1` (exposes `window.__game` hooks) · `?ai=0` (no mercs) ·
`?time=day|dusk|night` · `?touch=1` (phone UI) · `?mp=1&room=NAME&name=YOU` (online).

## Layout
- `src/main.js` — boot, module list (`MODULES` / `UPDATE_ORDER`), `window.__game` QA hooks.
- Modules export `init(ctx)`, `update(dt, ctx)`, `reset(ctx)`; they talk through `ctx.bus` events. See `CONTRACT.md`.
  An exception thrown in `update` is swallowed and logged only every 300 frames — if something "just stops animating",
  look for `[update:<name>]` errors in the console.
- `src/weapons.js` + `src/weapons/*` (viewmodels, `knife.js`), `src/ai.js` (mercs, blood, gun drops), `src/player.js`,
  `src/vehicles.js` (bikes/cars), `src/net.js` (MQTT multiplayer), `src/netwaves.js` (online waves), `src/hud.js`,
  `src/touch.js` (mobile controls), `src/minimap.js` (minimap + full map on M), `src/audio.js`.
- Maps: `src/world/maps/*.js`. Coney Island lives in `src/world/coney/`:
  - `hangout.js` — the friends' hangout (Igor, towers/elevators, Sammy's deli, Wonder Wheel ride)
  - `chill.js` — crews/robbers, passers-by you can rob, street fights, chill mode (knife, Vitek's Makarov)
  - `locals.js` — POPS cart ally, SHADES, NET GOST market, the mangal · `jobs.js` — Igor's side jobs
  - `chase.js` — wanted level / cops · `stillwell.js`, `w8th.js` — subway stations · `housing.js` — Luna Park towers
  - `belt.js` — Belt Pkwy → JFK zone · `radio.js` — Luna Park Radio
- `src/world/hangkit.js` — shared hangout kit for every map: cash, inventory, vendors + dialog, spots (F), elevators,
  stealing cars, sharing booze/smoke. `src/world/deli.js` — figures (`buildFigure`, with fight/hands-up anims), delis.

## Conventions
- Match the surrounding style: dense one-line helpers, short `// why` comments, no new dependencies, no build tools.
- Colliders are axis-aligned boxes (`world.box`); rotated things are built from small AABB cells.
- Anything visible to friends online must go through `ctx.net.send(type, payload)` → `net:<type>` on the bus.
- Clock-synced world things (trains, radio, visitors) use `Date.now()` so every client agrees.

## Test before you push
Each feature has a headless Playwright script in `qa/` (real GPU via Chrome). Run the ones near your change, e.g.
`node qa/chill-test.mjs`, `node qa/fight-test.mjs`, `node qa/jobs-test.mjs`; `npm test` runs the main set.
Screenshots: `node qa/shot.mjs "http://localhost:8790/?qa=1&map=coney" out.png --eval "<js>" --console`.
Run tests one at a time (parallel headless Chrome instances time out).
