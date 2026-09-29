# Soccer Tavern interior: build spec for the game

## Your task (for the AI coding agent)

Add a new walkable level, the interior of a Brooklyn soccer bar, to this first-person 3D game. You have two inputs: this file and `tavern-layout.json` (same folder). The JSON is the source of truth for every number. If this file and the JSON disagree, the JSON wins.

How to work:

1. Read the existing game code first. Find the engine, how levels or scenes are defined, how the player collider works, and how interactions are handled. Follow the game's own conventions and reuse its systems. Do not add a new framework.
2. Write a small loader that reads `tavern-layout.json` and builds the level from it, rather than hardcoding the numbers. Keep one constant `FT = 0.3048` and convert feet to the game's units there.
3. Build in the order under "Build order" below. Use simple boxes and cylinders as placeholder geometry with basic materials unless the game already has assets.
4. Do not build the basement stairs. The basement door stays closed and locked.
5. When finished, run the checks under "Acceptance checks" and report which pass. Where a value is marked `assumed` in the JSON, keep it, and list those values back to me so they can be corrected.
6. Ask before making any large structural change to the game itself.

## What to build

A walkable interior of a narrow Brooklyn soccer bar (16 ft wide up front, 19.5 ft wide from about halfway back, about 61 ft deep) plus a small backyard, for a first-person 3D game. Geometry can be simple boxes and cylinders. Props are placeholders unless the game already has assets.

Basement stairs are out of scope. The basement door exists and stays closed.

## Coordinates

- Units are feet in the JSON. Convert with `ft * 0.3048` to meters. Keep one `FT = 0.3048` constant.
- Plan origin is the front-left interior corner at street level, as seen by someone walking in.
- `x` grows toward the entrant's right wall. `y` grows toward the back of the building (street is `y=0`, back door wall is `y=61`). `z` is up.
- Engine mapping:
  - Three.js / Babylon / Godot: `world = (x, z, -y) * FT`. A camera with yaw 0 looks down -Z, toward the back of the bar.
  - Unity: `world = (x, z, y) * FT`.
- Player spawns at plan `(8, 5)` facing `+y`, eye height 5.5 ft, capsule radius about 0.9 ft.

## Building outline

The tavern sits between two other buildings, so its outer right wall is one straight line at `x=20`. The interior looks narrower up front (16 ft) because a solid block (`stairs_and_walls_block`, `x` 16 to 20, `y` -0.5 to 31.4) fills the right strip. Model it as one solid box. From `y=31.4` to the back, the interior is 19.5 ft wide.

Depth caveat: the original estimate was about 75 ft. The bar is now 11 stools long plus 3 on the short side, which puts the end of the bar, the darts, the kitchen and the bathrooms much closer to the door, so the room is about 61 ft deep. If 75 is right, add the extra 14 ft between the bar and the back and shift everything with `y > 31` by that amount. `meta.depth_ft` flags this.

## Layout in one paragraph

You enter through a centered, recessed front door. A jukebox nook is on your left. The right nook holds the third hi-top, a square table with round backless stools, and a drink ledge along the wall under the street window. Both nooks have barred street windows. About three steps in, an L-shaped bar starts on your left wall, sticks out 5.3 ft, and runs about 26 ft (to `y=38.5`). Three backed stools sit on the short side by the jukebox and 11 along the long side. Its back end is open so bartenders can walk to the kitchen doorway at `y=43.5`. Three small TVs hang high on the left wall above the liquor, with the middle one behind the taps. Across the aisle on the right, two more hi-tops sit against the wall, the second one just before the solid block. At `y=31.4` the block ends and the room widens to 19.5 ft. The basement door is set into the block's front face, in the right corner. A low 4-seat table runs across the room right in front of it, long axis along `x`, two chairs per long side. The dartboard hangs on the women's bathroom front wall (5.5 ft long, attached to the right wall), center about 2 ft from the right wall. The oche is 7 ft 9 in from the board. The kitchen's wide open front barely sticks out past the dartboard wall. A huge TV hangs high at its right corner, pointing almost due south. Past the darts a 4 ft corridor runs to the back door: kitchen wall and supplies on the left, women's then men's bathroom on the right. The men's bathroom has a small frosted window in the back wall, looking onto the yard. The yard is 8 ft deep with a 4-top, a 2-top, a grill close to the left edge, a plain bench, and a mural on the back wall straight ahead of the back door.

## Wall decor and props

All in `decor` in the JSON. Decor only, no interaction needed.

- **Kitchen shelf and volleyball:** the kitchen doorway is open only underneath. A wooden shelf spans it at the top (bottom edge at z 6.5 ft) and closes it off, making a small display area. A volleyball with a red-brown handprint, Cast Away style, sits on the shelf facing the bar. Keep 6.5 ft of clear height under the shelf.
- **Trophies:** a shelf of darts trophies and similar (cups, plaques) high on the right wall, next to the dart zone. A thrower at the oche facing the board has it on their right.
- **World map:** a huge old political world map from about 1991, roughly 5 ft wide by 4 ft tall, on the right wall between the middle hi-top and the top hi-top. Hung high (bottom edge 5.9 ft) so drinks do not get spilled on it. It shows the USSR and Yugoslavia as single countries and Germany as one country. It only fits if the ceiling is about 10 ft.

## Bathroom fixtures

All in `bathrooms_fixtures` in the JSON.

- **Men's:** wall urinal in the top-left corner (on the back wall next to the frosted window, so you can sort of look out while using it). Toilet in the bottom-right corner, back against the wall shared with the women's, so a sitter's knees point toward the middle of the room. Mirror and sink on that same shared wall, bottom-left.
- **Women's:** toilet dead ahead of the door, back against the right wall. Mirror and sink on the top wall, to the left after you walk in.

## Kitchen fixtures

In `kitchen_fixtures` in the JSON. The kitchen is set up with a central walking path and everything against the outer walls. Left wall, from the doorway: fridge, then an oven (4-burner range), then counter to the back wall. Right wall: a sink dead center with upper cabinets above it, and counter on either side. All placeholder boxes, sizes assumed.

## Seating models

- **Bar stools and the two right-wall hi-top stools:** rectangular backed stools with bars across the back. One shared model.
- **Right nook hi-top stools:** standard round barstools with no back. This is the only hi-top that uses them.
- **Low 4-top and nook chairs:** simple chairs, seat height 1.5 ft.

## Build order

1. Floors and walls from `floors` and `walls.items`. Extrude walls to 10 ft (yard fences 6 ft). Doorways are already gaps.
2. Windows: cut the three openings in `windows`. Use a low wall below the sill, a wall above the head, and a glass pane. Add bars on the two front windows. The men's window is frosted and faces +y (into the yard).
3. Doors: place the meshes from `doors`. `kitchen_doorway` and `bar_back_opening` are open gaps with no door. `basement_door` stays closed and locked.
4. Bar: `bar.counter.boxes`, `bar.back_bar`, `bar.tap_tower`, and the 11 long-side plus 3 short-side backed stools.
5. TVs: `tvs.primary` and `tvs.secondary`. Thin black box with a screen quad. Screens can show a soccer match placeholder. See TV orientation below.
6. Furniture: jukebox, nook hi-top with round stools, nook ledge, two right-wall hi-tops with backed stools, low 4-top and chairs, kitchen fixtures (fridge, oven, counters, sink, upper cabinets), supply stack, yard furniture (including the bench), grill.
7. Darts: board and oche from `darts`. Board faces `-y`. Bullseye at z 5.75 ft. Toe line is 7.77 ft in front of the board face.
8. Mural: a quad on the yard back wall inner face (`y=69`), 10 ft wide, centered at `x=12` (same as the back door). Placeholder texture slot. Content is a Chinese dragon mixed with Norwegian and soccer imagery.
9. Colliders: one box or cylinder per solid. Chairs listed with `soft_collider` get a soft collider (see below). The yard barrier on the left keeps players out of the blocked alley.
10. Interactions: see `interactables`. Use whatever interaction system the game already has.

## TV orientation

- The big TV faces `[0.12, -0.99, 0]` in plan: almost due south, a hair to the southeast. It should read head-on from the floor between the end of the bar and the darts area, and at a good oblique angle from the basement door. It must not face southwest.
- The three small TVs face `+x` off the left wall.
- All four sit at least 7.5 ft off the floor.

## Acceptance checks

- Walk the `walkable.main_route` polyline from the front door to the back door. Nothing blocks it.
- Aisle between bar stools (east edge `x=6.9`) and hi-top stools (west edge `x=12.0`) is at least 5 ft.
- Staff aisle behind the bar is 2.3 ft wide and connects to the kitchen doorway through the open bar end.
- Corridor is 4 ft wide from `y=44.5` to the back door, narrowed to about 2.5 ft by the supply stack.
- Stool counts: 11 on the bar's long side, 3 on the short side, 4 at each of the three hi-tops.
- The dartboard center is about 2 ft from the right wall face, on the dart wall, and the dart wall is 5.5 ft long.
- The bathrooms and kitchen reach the back wall. There is no dead space behind them.
- The kitchen front wall is about 1 ft in front of the dartboard wall face.
- A thrower at the toe line is about 4.7 ft from the basement door face and is tightly boxed in by the oche-side chairs.
- Basement door face is at `y=31.4`, in the right corner. The door-side chairs sit about 0.25 ft from that wall, so opening the door in front of a seated person means they have to scrunch in.
- Soft colliders: chairs at the low 4-top are tighter than a normal player capsule. Give them a soft collider (player slows down and is nudged through) instead of a hard block, or the darts corner becomes unreachable.
- Player cannot leave the bar, backyard, or pass beyond `yard_barrier_left`. Player cannot walk through the basement door.
- Decor is in place: volleyball on the kitchen shelf, trophy shelf on the right wall by the dart zone, world map between the middle and top hi-tops. All at least 5.9 ft off the floor.

## Things intentionally left out

- Basement stairs and everything below.
- NPC behavior beyond the optional spawn points.
- Lighting and audio design. Suggested vibe: dim warm bar, TVs glowing, brighter kitchen doorway, cooler bathrooms, open sky in the yard.
- Wall thickness is a flat 0.5 ft. The real building is probably different.

## Guesses that need a real answer

Marked `assumed` or `*_assumed` in the JSON. Change them if the author knows better.

- Total depth (61 ft, see the caveat above), ceiling height (10 ft).
- Kitchen size (9.5 by 17.5 ft), how wide the kitchen's open front is (8.2 ft).
- Bar counter depth (1.8 ft), staff aisle width (2.3 ft), tap tower position.
- Basement door width (2.5 ft) and how far the solid block runs toward the front.
- TV sizes (big one about 75 in, small ones about 43 in) and heights.
- Nook ledge size, position of the bathroom divider (`y=52.5`), men's window size, mural size, bench length (8 ft), fence heights.
- Trophy shelf length and height, map size (5 by 4 ft), and the volleyball's exact spot on the shelf.

## Questions for whoever built the game

Answers will change how this gets implemented. The spec works without them.

1. Which engine (Three.js, Babylon, Unity, Godot, something else)? The JSON is engine neutral but the loader code isn't.
2. Are levels loaded from JSON, or defined in code? If code, ask the agent to write a small loader that reads `tavern-layout.json`.
3. What does the player collider look like (capsule radius and height)? The tight darts corner depends on it.
4. Does the game have an interaction system (press E, raycast, proximity)? The jukebox and dartboard need one.
5. Should the bar have NPCs, or is this a static map for now?
6. Should the TVs show anything specific, or a placeholder screen?
