# ZAVOD — Module Contract (read fully before touching code)

Single-player FPS in Three.js r186 (WebGL). Rainy night, Eastern-European shipyard/industrial yard. Target look: Call of Duty MW2019 "Shipment" / "Docks" (rain, containers, sodium/halogen lights, wet asphalt, puddle reflections, volumetric haze). Target perf: 60 fps @ 1920x1080 on Apple M3 Pro, ultra quality.

## Ground rules
- **Strict file ownership.** You edit ONLY the files assigned to you. Never edit `src/main.js`, `src/ctx.js`, `index.html`, or another agent's module. If you need something from another module that isn't in this contract, code defensively (`ctx.ai?.soldiers ?? []`) and mention it in your report.
- No build step. Plain ES modules, importmap: `import * as THREE from 'three'` and `from 'three/addons/...'` (vendored at `vendor/three/`). No npm packages at runtime unless you vendor them under `vendor/` as plain ESM/UMD files.
- Assets go in `assets/<kind>/`. CC0 only (Poly Haven API: `https://api.polyhaven.com/files/<id>` → pick `gltf`/`2k`/`jpg` or textures `Diffuse/nor_gl/Rough/Disp/AO` 2k jpg). Keep total assets < 150 MB. Never hotlink at runtime — download to `assets/`.
- Module shape: `export async function init(ctx)` returns the module's public API (stored as `ctx.<name>`); `export function update(dt, ctx)` (dt=0 when paused/menu, so animate only from dt); optional `export function onResize(ctx)`, `export function reset(ctx)` (called on restart — reset all runtime state, do not re-create heavy assets).
- Determinism for QA: use `ctx.rng()` (seeded) instead of `Math.random()` for anything that affects layout/spawns.
- Every mesh you add that bullets/eyes can hit MUST be pushed to `ctx.raycastTargets` (leaf meshes or InstancedMesh; no Groups) with `mesh.userData.surface = 'metal'|'concrete'|'wood'|'ground'|'water'|'flesh'`.
- Every solid you add MUST also be pushed as a `THREE.Box3` into `ctx.colliders` (AABB in world space; for rotated things push a tight-ish box). Thin decorations (cables, puddles, decals) don't need colliders.
- Verify visually before you report: `./qa/serve.sh` then `node qa/shot.mjs "http://localhost:8790/?qa=1&pose=<name>" qa/shots/<you>-<n>.png --console` (Node 20: `source ~/.nvm/nvm.sh && nvm use 20`). Read the PNG. Iterate until it genuinely looks AAA. Check `stats` in the JSON output for fps/drawCalls/triangles and page errors.

## ctx (see src/ctx.js)
```
ctx.THREE, ctx.scene, ctx.camera (PerspectiveCamera, rotation.order 'YXZ', near .03 far 600), ctx.renderer, ctx.canvas
ctx.state: 'boot'|'menu'|'playing'|'paused'|'dead'|'victory'   ctx.setState(s)   ctx.restart()
ctx.time { dt, elapsed, frame, scale, realDt }   ctx.perf { fps, frameMs, drawCalls, triangles }
ctx.settings { quality:'ultra'|'high'|'medium'|'low', fov, sensitivity, adsSensitivityMul, shadows, rain, motionBlur, ssr, ao, bloom, dof, filmGrain, masterVolume }
ctx.input { down(code), consume(code) /*edge*/, fire, ads, forward, back, left, right, sprint, crouch, jump, mouse{dx,dy,wheel}, locked, pressed:Set }
ctx.bus.on(name, fn) / emit(name, data)     ctx.rng()     ctx.qa (bool: QA mode — auto-start, no pointer lock needed)
ctx.colliders: Box3[]      ctx.raycastTargets: Object3D[]      ctx.lights { key, fill, hemi, spots[] }
ctx.requestPointerLock()   ctx.progress(frac, text)
```
Key bindings (already handled by main→input): WASD move, Shift sprint, C/Ctrl crouch, Space jump, R reload (`consume('KeyR')`), G grenade, 1/2 weapon slots, Mouse0 fire, Mouse2 ADS, Esc pause, Tab scoreboard.

## Module APIs (what each module MUST expose on its returned object)

### world.js (+ assets.js) — WORLD agent
```
poses: { [name]: [x,y,z,yaw,pitch] }         // QA camera poses; MUST include: spawn, hero, containers, crane, warehouse, overview, puddles
playerSpawns: Vector3[]   enemySpawns: Vector3[]  (≥ 12, spread across the map, on walkable ground y=0)
coverPoints: { position:Vector3, normal:Vector3 }[]   // spots beside solid cover (≥ 40)
bounds: Box3              groundHeight(x,z) → number (0 everywhere is fine)
surfaceAt(point) → 'metal'|'concrete'|... (optional)
```
World owns: scene.background/environment (HDRI PMREM), fog, all lights (`ctx.lights.key` = a moon/overcast directional with shadows; spots for sodium lamps; emissive fixtures), `renderer.toneMappingExposure`, rain (particles + streaks), puddles/wet surfaces (roughness maps, screen-space or planar reflection meshes), ground, containers, cranes, warehouses, props, decals, atmosphere. Map ≈ 120×120 m playable, believable layout with lanes/cover like a CoD 6v6 map.

### player.js — PLAYER agent
```
position:Vector3 (feet)  velocity:Vector3  yaw  pitch  height  eye()→Vector3  health  maxHealth
onGround  crouching  sprinting  ads (set by weapons)  speed  moveState:'idle'|'walk'|'sprint'|'crouch'|'air'
teleport(x,y,z,yaw,pitch)   damage(amount, fromPosition)   heal(dt)   respawn()
bob: { x, y }  // current view-bob offset (weapons reads for viewmodel), landImpulse
```
Capsule (r .35, h 1.7 / crouch 1.15) vs `ctx.colliders` AABBs with step-up ≤ .45 m, slopes n/a, gravity 20, jump 6.5, sprint 6.6, walk 4.4, crouch 2.2, ADS 2.6, acceleration/friction so it feels like CoD (snappy, ~0.1 s to full speed). Head bob, sprint camera tilt/FOV kick, landing dip, regen health after 4 s (CoD-style), red-vignette handled by hud/post via 'playerDamaged'. Emits `footstep {position, surface, sprint}` on stride. Camera position/rotation is set here every frame. Dead: `ctx.setState('dead')` + emit `playerDied`.

### weapons.js — WEAPONS agent
```
current: { name, ammo, mag, reserve, slot }   slots[]   ads (0..1)   reloading
fire()/qaFire(n)   reload()   swap(slot)   throwGrenade()
```
Owns the first-person viewmodel (rifle + arms) attached to camera, with sway, bob (from player.bob), ADS transition (sights aligned with camera center, FOV zoom via `ctx.camera.fov` lerp toward settings.fov*0.7 — player agent does NOT touch fov), recoil (visual kick + camera pitch/yaw pattern applied via `ctx.player.pitch/yaw`), muzzle flash (sprite + PointLight for 1-2 frames), ejected brass, tracers, hitscan raycast against `ctx.raycastTargets`, impact FX per surface (sparks/dust/chips + decal + `impact {point, normal, surface}` event), bullet holes (decal pool), reload animation, weapon swap, grenades (arc, bounce vs colliders, explosion → `ctx.ai.damageRadius(pos, r, dmg)`, `ctx.player.damage`, emit `explosion {position, radius}`). Hitting a soldier: raycast hit object with `userData.soldier` → `ctx.ai.damage(soldier, dmg, point, headshot)` and emit `hit {soldier, damage, headshot, point}`. Weapons: assault rifle (M4-class) primary, pistol secondary. Emits `shot {origin, dir, weapon}`, `reload {stage}`, `ads {on}`.

### ai.js — AI agent
```
soldiers: Soldier[]   frozen:bool   wave  score  kills  alive()
damage(soldier, amount, point, headshot)   damageRadius(pos, r, dmg)   qaKillAll()
```
Soldier = { position, mesh/group, health, state:'patrol'|'advance'|'cover'|'shoot'|'flank'|'hurt'|'dead', hitboxes: { head, body } } — hitbox meshes pushed into `ctx.raycastTargets` with `userData.soldier = soldier; userData.part = 'head'|'body'; userData.surface='flesh'`. Rigged, animated soldier model (three.js example `Soldier.glb` from https://github.com/mrdoob/three.js/raw/dev/examples/models/gltf/Soldier.glb has Idle/Walk/Run + skeleton; retarget/aim procedurally; add helmet/vest/rifle props; or better CC0 if found). Nav: build a grid from `ctx.colliders` + `ctx.world.bounds` (cell .5 m) and A*; use `ctx.world.coverPoints`. Behaviors: squads of 3–4, advance under cover, peek & shoot with burst cadence and inaccuracy that improves with time, flank, react to being shot (flinch anim/impulse), death (ragdoll-ish fall using bone physics or a convincing procedural collapse + blood decal), and wave/score logic (waves of 4→12 enemies, emit `wave {n}`, `enemyKilled {soldier, headshot, position}`, `victory` after wave 6 → `ctx.setState('victory')`). Enemies shoot the player: raycast LOS, `ctx.player.damage(dmg, soldier.position)`, tracers + muzzle flash on their rifles (emit `shot` with `who:'enemy'` so audio/weapons FX pools can render them).

### post.js — POST agent
```
render(dt, ctx)   shake(amount)   setQuality(q)
```
EffectComposer pipeline: RenderPass → (GTAO/SSAO) → SSR on wet surfaces (or cheap alternative) → UnrealBloom (threshold high, for lamps/muzzle) → motion blur (camera-motion) → DOF (subtle, ADS-aware) → film grain + vignette + chromatic aberration (subtle) + color grade (cold teal/orange CoD LUT feel) → SMAA/TAA → OutputPass. Listen to `playerDamaged` (red pulse/desaturate), `explosion` (shake + flash), `shot` (tiny kick), respect ctx.settings flags + quality. Auto-step quality down if fps < 45 for 3 s. `ctx.qa` screenshots must look like the real game (no debug overlays).

### hud.js (+ hud.css) — HUD agent
```
hitmarker(headshot)  damageFrom(dirVector3)  killfeed(text)  toast(text)  showMenu()  hideMenu()
```
CoD MW-style: main menu (title ZAVOD, DEPLOY, settings sliders bound to ctx.settings, controls), pause, death screen (retry → `ctx.restart()`), victory screen w/ stats, in-game: compass strip w/ bearings + enemy pings, ammo/mag/reserve bottom-right with weapon name, health bar/vignette, crosshair (dynamic spread; hides on ADS), hit markers (white/red on kill), directional damage indicators, kill feed, wave banner, score, grenade indicator, low-ammo/reload prompt, interaction prompts. Use DOM + CSS (fonts: system / bundled woff2 if you add one to assets/). Everything reads `ctx.player`, `ctx.weapons`, `ctx.ai` each frame in `update`. Must look native-AAA, not web-page.

### audio.js — AUDIO agent
```
play(name, { position?, volume?, pitch? })   setListener(pos, quat)
```
Web Audio, procedural synthesis + optional CC0 samples under assets/audio (< 20 MB). Rain bed (layered noise, filtered, with drips + distant thunder/rumble), wind, industrial hum, distant gunfire/sirens ambience, player rifle (layered transient + body + tail, with distance/indoor variants for enemy shots), pistol, reload foley (`reload` stages), footsteps by surface (`footstep`), impacts by surface (`impact`), hitmarker/kill tick, grenade pin/bounce/explosion (with low-pass "tinnitus" duck via `explosion`), UI clicks, low-health heartbeat, enemy shots positionally panned (PannerNode) via `shot {who:'enemy', origin}`. Start context on first user gesture; in `ctx.qa` mode stay silent but don't throw.

## Events (ctx.bus)
`state {state,prev}` · `boot` · `pointerlock bool` · `quality q` · `shot {origin,dir,weapon,who:'player'|'enemy'}` · `impact {point,normal,surface}` · `hit {soldier,damage,headshot,point}` · `enemyKilled {soldier,headshot,position}` · `playerDamaged {amount,from}` · `playerDied` · `playerRespawn` · `explosion {position,radius}` · `footstep {position,surface,sprint,who}` · `reload {stage:'start'|'magOut'|'magIn'|'end'}` · `ads {on}` · `wave {n,total}` · `victory` · `grenade {stage:'pin'|'throw'|'bounce'}`

## QA
- `?qa=1` auto-starts in 'playing' with no pointer lock; `?pose=<name>` teleports the player to a world pose after boot; `?seed=N`; `?quality=`.
- `window.__game`: `ready`, `stats()`, `pose(name)`, `teleport()`, `fire(n)`, `freezeAI(v)`, `killAll()`, `timeScale(s)`, `quality(q)`.
- Screenshot: `node qa/shot.mjs "http://localhost:8790/?qa=1&pose=hero" qa/shots/x.png --console [--eval "js"] [--settle ms]`.

---
# Addendum 2 — Maps, loadouts, multi-level (2026-09-16)

## Maps
- Registry: `src/world/maps/index.js` → `MAPS = { zavod, railyard, terminal }`. Each map module exports `meta` `{ id, name, subtitle, time:'night'|'day', weather, description, grade:'night'|'day', ambience, thumb }` and `build(world)`. `src/world.js` (owned by main) picks `?map=<id>` (default zavod), calls `build`, exposes `ctx.world.mapId`, `.meta`, `.maps` (all metas, for the selector), `.grade`, `.ambience`.
- A map is chosen by **reloading with `?map=<id>`** (the HUD map selector sets `location.search`, preserving other params like `primary=`/`secondary=`). No runtime map swapping.
- Map builders get the `world` helper: `solid(mesh, surface, {collide, shadow, box})`, `box(min,max)`, `walkable(min,max)` (elevated floor for AI + collider), `cover(x,z,nx,nz,y=0)`, `R` (seeded rng), `W` (the ctx.world object to fill: bounds, playerSpawns, enemySpawns, coverPoints, poses, surfaceAt, groundHeight), `updaters` (per-frame fns), `scene`, `ctx`.
- Multi-level rule: any surface the player/AI can stand on that is above y=0 MUST be a collider AABB whose top is the floor (stairs = stacked AABB steps ≤ 0.45 m rise; ramps = many thin steps) AND, if the AI should path over it, also registered via `world.walkable(min,max)`. Railings/edges need colliders so nobody walks off unintentionally unless it's a deliberate drop (drops ≤ 4 m are fine). Every map: ≥ 3 player spawns, ≥ 12 enemy spawns on walkable ground (any level), ≥ 40 cover points, poses incl. `spawn`, `hero`, `overview` + 4 more cinematic ones.
- Day maps: sun DirectionalLight with 4096 shadow map tightly fitted to the play area (`ctx.lights.key`), sky via HDRI PMREM (Poly Haven 2k, e.g. `kloppenheim_06_puresky`, `belfast_sunset_puresky`, `overcast_soil_puresky`) as `scene.background` + `scene.environment`, exposure ≈ 1.0, fog light and distant. Interior maps: sun through windows (SpotLights/RectArea-like emissive panels + baked-looking light shafts), warm interior bulbs, `scene.environment` from a neutral interior PMREM.
- Post reads `ctx.world.grade` ('night' → current teal/orange; 'day' → neutral filmic, slightly warm, less vignette/grain); audio reads `ctx.world.ambience` ('rain-industrial' | 'railyard-day' | 'terminal-day').

## Weapons arsenal & loadout
- `ctx.weapons.arsenal`: `[{ id, name, class:'AR'|'SMG'|'Shotgun'|'Sniper'|'LMG'|'Pistol', slot:0|1, desc, stats:{ damage, rpm, range, mag, mobility } }]`.
- `ctx.weapons.setLoadout({ primary:id, secondary:id })` swaps the two slots immediately (rebuilds/attaches viewmodels, full ammo). Defaults from `ctx.qs.get('primary') || 'm4a1'`, `ctx.qs.get('secondary') || 'm9'`; `ctx.settings.loadout = {primary, secondary}` mirrors the current choice.
- Sniper: ADS shows a scope (rendered by weapons: scope-view render or a high-zoom fov + reticle mesh/overlay + lens vignette), fov to ~settings.fov*0.22, heavy sway reduced when holding Shift... keep simple: hold-breath not required. Shotgun: 8 pellets/shot, spread cone, damage falloff, pump animation. SMG: fast rpm, low damage, fast ADS. LMG optional.

## HUD additions
- Main menu gains **SELECT MAP** (cards: name, subtitle, time-of-day tag, description, thumbnail from `meta.thumb` with a CSS fallback gradient if the image 404s; selecting reloads with `?map=`) and **LOADOUT** (primary list + secondary list from `ctx.weapons.arsenal`, stat bars, calls `setLoadout`, and rewrites `?primary=&secondary=` into the URL via history.replaceState so a map reload keeps it). Current map name + loadout shown on the menu and the death/victory screens.

## AI on multi-level maps
- Nav must be height-aware: build the walkable grid from `ctx.world.bounds`, `ctx.colliders` and `ctx.world.walkables` (cell 0.5 m; a cell's floor = highest collider top ≤ 2.0 m above the base floor that has ≥ 1.8 m clearance above it; neighbors connect if |Δfloor| ≤ 0.5 m). Soldiers stand on their cell floor; enemySpawns/coverPoints may have y>0. LOS rays as before. Use the new maps for testing (`?map=railyard`, `?map=terminal`).

## Real-place maps (wsp, sbu) — research standard
- `wsp` = Washington Square Park (Manhattan) and `sbu` = Stony Brook University (Long Island). Before building, the agent RESEARCHES with WebSearch/WebFetch: satellite/plan layout and dimensions, landmark positions and proportions, materials (stone/brick/concrete/paving patterns), vegetation, street furniture, surrounding facades and skyline, typical light. Write findings to `src/world/<id>/RESEARCH.md` (sources listed) before coding, and build to that plan. Recognizable but not a survey: no real logos, signage text may be generic. Same multi-level/gameplay rules as every map (spawns, cover, poses, walkables), day lighting per Addendum 2.
