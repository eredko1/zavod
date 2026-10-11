# Map Lab and existing game physics

Map Lab is a geometry inspection controller, not the game's character controller. This comparison is implementation-based; it does not claim measured behavioral or performance equivalence.

| Behavior | Map Lab | Existing game |
| --- | --- | --- |
| Position | Camera/eye position; subtract eye offset for feet | Player position stores feet; camera derives eye position from stance |
| Units | Metres, seconds, Y up | Metres, seconds, Y up |
| Horizontal movement | Direct normalized walking/running input | Accelerated movement, directional speed modifiers and air control |
| Vertical movement | Constant-gravity fall, swept landing and small surface steps | Gravity integration with collision substeps, jump/buffer/coyote logic, step up/down |
| Ground support | Ground triangle index plus separate roof/deck index, queried below current feet | Terrain height callback plus capsule support on AABB colliders |
| Building walls | Circle/footprint edge exclusion; extrusion vertical overlap uses actual drawn Float32 bounds; native surfaces use a separate estimated footprint proxy | Vertical capsule against registered AABBs, spatial broad phase and resolution |
| Roofs/bridges | Eligible extrusion roofs/decks support starting and falling; native mesh roof walking remains unsupported; no snap from ground onto an overhead deck | Walkable collider tops, roof/elevated-floor gameplay and navigation registrations |
| Headroom | No general ceiling resolution; placement is an inspection tool | Ceiling collision, crouch headroom checks and capsule overlap checks |
| Props | Visual geometry; no general prop collision | Only objects registered with colliders are solid |
| Gameplay movement | No jumping, crouching, mantling, climbing, slide, fall damage or vehicles | Includes these systems and other game-state interactions |
| Timing | Capped runtime timestep; deterministic benchmark replay timestep | Game update timestep with distance-based collision substeps |
| Network | Local lab only | Player state integrated with game networking |

Parameter sources, kept adjacent to their definitions rather than duplicated here:

- Lab speed, eye height, gravity, step and contact tolerance: [movement.js](../render/movement.js).
- Lab footprint collision radius/body span and movement subdivision: [osm-walk.js](../render/osm-walk.js).
- Game stance, speed, gravity, jumping, stepping and acceleration: [src/player.js](../../../src/player.js).
- Game capsule/AABB implementation: [src/player/collision.js](../../../src/player/collision.js).

The two controllers deliberately have different tuning today. Lab walking is intended to inspect human-scale geometry. It is not evidence of how the map will feel with the game's faster, more complete movement system.

## Walk here

Click **Walk here**, then an eligible extrusion roof, deck, road or ground surface. Reference outlines and native building-mesh surfaces are not walkable geometry. The picked surface sets foot height and the camera adds eye height. Stepping off starts a fall; landing checks the highest visible support below the previous foot position. Hiding a supporting source removes its support on the next simulated step. Escape releases mouse capture; Orbit returns to inspection.

The ground index remains separate for prop placement, default spawn and underpasses. Querying the globally highest roof as “ground” would teleport people to rooftops. Building undersides do not count as floors. Thin bridge decks support landing from above but do not provide a full solid underside/edge collision model.

## Comparison plan before game integration

Use one geometric fixture with a wall, concave courtyard, curb, slope, two stacked decks and a roof edge. Export equivalent game colliders through an explicit adapter; do not copy the lab's rendering mesh into a giant AABB. Test the same starting feet positions and input sequence against both controllers.

Compare support height, wall clearance, stopping position, ability to walk under decks, edge fall time, landing surface, thin-floor tunnelling, headroom and behavior after a supporting collider is hidden/removed. Separate differences due to tuning from differences in collision representation. Benchmark collision/support queries separately from rendering and retain timestep, scene and controller versions.

The lab tests [walk-height-test.mjs](../tests/walk-height-test.mjs) and [infrastructure-browser-test.mjs](../tests/infrastructure-browser-test.mjs) cover falling, roofs, underpasses, source visibility and the real placement UI. A two-controller comparison harness has not been implemented. See [game-map interface](GAME-MAP-INTERFACE.md) for the adapter contract.
