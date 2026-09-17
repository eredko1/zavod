# ZAVOD

A browser first-person shooter built in Three.js (r186, WebGL 2) — no engine, no build step. Single-player vs AI squads across five maps.

**Play:** https://zavod-chi.vercel.app (desktop Chrome/Firefox/Safari; phones get touch controls and a lighter asset set — iOS 16.4+).

## Maps
| Map | Setting |
|---|---|
| Zavod | Rainy night container yard / shipyard (`?map=zavod`) |
| Railyard | Daytime multi-level freight yard: overpass, platform, office roof, wagon decks (`?map=railyard`) |
| Grand Central | Real Grand Central Terminal: Main Concourse, balconies, Vanderbilt Hall, Dining Concourse, subway (`?map=terminal`) |
| Washington Square | in progress (`?map=wsp`) |
| Stony Brook | in progress (`?map=sbu`) |

## Controls
WASD move · Shift sprint · Space jump (3 quick jumps → super jump) · C/Ctrl crouch · LMB fire · RMB or E aim · R reload · G grenade · 1/2 weapons · walk into a ladder to climb · Esc pause · Tab scoreboard.
Loadout (AR / shotgun / sniper / SMG / AK · M9 / DE .50) and map are chosen in the main menu.

## Run locally
```
./qa/serve.sh          # http://localhost:8790  (no-cache static server)
```
Query params: `?map=`, `?primary=&secondary=`, `?quality=ultra|high|medium|low`, `?rain=1`, `?touch=1`.

## Development
- `CONTRACT.md` — module contract; each module (`src/world`, `player`, `weapons`, `ai`, `post`, `hud`, `audio`) has strict ownership so several agents can work in parallel.
- QA: `node qa/shot.mjs "http://localhost:8790/?qa=1&map=zavod&pose=hero" out.png` renders a deterministic frame headlessly on the real GPU; `window.__game` exposes hooks (`stats()`, `pose()`, `fire()`, `freezeAI()`, `killAll()`).
- Mobile assets: `qa/build-mobile-assets.sh` regenerates the 512 px mirror in `assets-m/`.

Assets: Poly Haven (CC0), three.js example soldier, Barlow (OFL). Non-commercial tech demo.
