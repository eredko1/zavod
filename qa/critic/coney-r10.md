# Coney Island — critic round 10 (hangout, playtest pass)

Screenshots: `/private/tmp/claude-501/-Users-eugene-Code/5cf2e33b-bf21-490d-b2a8-d28817f0fbe5/scratchpad/critic/` (39 frames, 1280×720, real GPU).
Flows walked:
- Table Park spawn, Igor, mangal and bikes
- Sammy's deli and NET GOST
- Elevator to the 19th floor, then the roof stair
- Stillwell concourse, stairs and platforms
- W 8 St lower, upper and footbridge
- Wonder Wheel ride, boardwalk, Surf Ave
- Belt Pkwy
- Full map (M) and help card (H)
- A crew robbery (default mode)
- Chill mode: 150 s idle at the spawn, then Vitek

## Scores

| Axis | /10 | Why |
|---|---|---|
| Visual fidelity | 6.0 | The Luna towers now read right: dark gallery cores and stepped massing (`01`, `03`). The boardwalk is convincing (`23`). Stillwell and W 8 St are still greybox: flat floors, blank walls, a moiré lattice ceiling (`12`, `12b`, `15b`). |
| Level/space design | 6.0 | The Table Park → deli → market → towers loop is tight and walkable. Surf Ave is a dead 60 m asphalt lot (`24`). The roof is a trench between taller wings (`21`). |
| Fun, moment to moment | 6.0 | Sammy, the mangal and the Wonder Wheel are real moments. Chill mode is sabotaged by robbery spam, and a default-mode crew beat a passive player to death (`19b`). |
| Social/multiplayer hooks | 7.5 | Shared radio, sharing with B, give $10 (N), elevators friends ride together, wall-clock trains and rasta visitors. Few games give friends this many excuses to hang out. |
| Polish/bugs | 5.0 | Mirrored station signs, wrong death copy, a roof rendered with the water material, floating tanks, lobby ceiling acne, and the boardwalk zig-zag still there (r9 #1). |
| UI/UX clarity | 5.0 | The help card covers the top-right quarter permanently. The full map crams the whole hangout into its clipped NE corner. Igor spends your money silently. |
| Performance | 8.0 | 60 fps everywhere, 520–1,300 draw calls, 6.5–7.5M tris; 917–927 during a wave. The only drop is with the full map open: 48 / 35 fps (`10`, `43`). |

## Top 12 problems (most impactful first)

**1. Robbery spam kills chill mode, and crews can kill you in the default mode.**
- Evidence: `31`, `33b`, `19`, `19b`.
- What happened in chill: idle at the Table Park spawn for 150 s, robbed 5 times, $60 → $0.
- Why it matters: Vitek's Makarov costs $60 plus a $12 shashlik, so the chill goal can't be reached.
- What happened in the default mode: a 3-man `gang('gopnik','rob')` took a 100 HP player to KIA in about 10 s ("Broke?! Then I take it out of your face").
- Fix in `chill.js:130-132`:
  - Lone robber every 90–150 s (was 35–60 s). Gangs every 180–300 s.
  - No robbing within 25 m of `onlineStart`, and none for 60 s after a respawn or after a robbery.
  - A robber takes about 30% of your cash, not a flat $10–20.
  - When you're broke, crew punches stop at 30 HP.

**2. Death by gopniks says "the site fell to the mercenaries".**
- Evidence: `19b`.
- Where: `hud.js:625`.
- Fix: pass the cause on `playerDied` and change the line, e.g. "JUMPED BY LYOSHA'S CREW". Hide RETRY in the hangout, where only the T respawn makes sense.

**3. The help card is always on.**
- Evidence: `01`, `05`, `06`, `12`, `41`.
- It covers about 25% of the screen, top right, including the view of the towers from the spawn.
- Fix (help string at `hangout.js:47`): show it for 10 s on the first spawn, then collapse it to an "H · controls" chip. Remember the choice in localStorage.

**4. The full map clips the hangout.**
- Evidence: `10`, `43`, `16b`, `42`.
- The overlap: SAMMY, OLGA, NET GOST and SAMMY'S DELI labels sit on top of each other at the map's east edge.
- Cut off: "W 8 ST – NY AQUARIUM STA…", "…ARACHUTE JUMP" and the BELT PKWY arrow.
- The minimap is half black on the W 8 St platforms (x > 440) and fully black on the Belt.
- Fix:
  - In `minimap.js` `shoot()`, pad the map bounds by 60 m (not the play bounds in `maps/coney.js:30`).
  - Clamp labels inside the frame and skip labels that collide.
  - Add a simple route strip for the Belt zone.
  - Stop redrawing the 2048-px image every frame while the map is open (cache the background layer).

**5. W 8 St station signs are mirrored ("muiraupA YN – tS 8 W").**
- Evidence: `15b`, `16`.
- Where: `w8th.js:85-86`. Both platform sides (`s = ±1`) use the same `ang + π/2`.
- Fix: add `+ (s > 0 ? Math.PI : 0)`, or make the signs two back-to-back planes.
- Also: the `W.w8th.lower` / `upper` points (`w8th.js:89`) put you on the track bed, not the platform. Flip the sign of `platIn`.

**6. Igor has no dialogue, and F spends silently.**
- Evidence: `03`, `04`.
- What happened: F from four spots around his bench spent $20 (a bag, then a bottle) with only a toast.
- Why it matters: the park's centrepiece NPC is the only vendor without a conversation. His 1.3 m name tag also fills the screen.
- Fix:
  - Turn `buyIgor` (`hangout.js:247`) into a `K.dialog` like Sammy's: bag $10 / bottle $10 / a line of gossip.
  - Fade name tags inside 3 m.
  - Grey out choices you can't afford. Vitek offers "Here — shashlik and $60" when you have $0 (`33b`).

**7. NET GOST is a copy of Sammy's deli.**
- Evidence: `18` vs `06`.
- Both have the same box, the same LOTTO / BACON / COLD BEER windows and the same awning. Both sit alone on bare lots.
- Fix: add a variant in the `locals.js` market builder:
  - Cyrillic window vinyl and a green awning.
  - Produce crates and a smoked-fish case.
  - A second storey or neighbouring storefronts, so neither shop floats.

**8. Stillwell concourse is greybox.**
- Evidence: `12`, `12b`, `14`.
- Flat blue-white floor, grey-box turnstiles, and a blank grey south wall with one opening.
- The "D F N Q · TO ALL TRAINS" sign sits exactly behind the HUD compass.
- Fix in `stillwell.js`:
  - Terrazzo floor texture, turnstile silhouettes, tiled walls.
  - Drop the sign 1 m.
  - Swap the green lattice ceiling (moiré here and under W 8 St, `15b`) for a solid panel with a normal map, or raise its anisotropy.

**9. The boardwalk zig-zag line is still there.**
- Evidence: `23`, lower left of the deck, at (−10, 0, 150).
- This was r9 fix #1 and it did not land. It is the first thing you see on the boardwalk.

**10. The roof next to the Wonder Wheel uses the water shader.**
- Evidence: `22`, during the wheel ride, around (77, 5, 61).
- A flat roof shimmers like ocean water.
- Fix: find that roof's material in `landmarks.js` / `city.js`.

**11. Water tanks float above the Aquarium skyline.**
- Evidence: `18`, `44-tanks-0.35`.
- Two or three brown tanks hang in the sky with no building under them, seen from W 8 St.
- Fix: in `horizon.js`, build the tanks with the same LOD as their building, or drop them.

**12. The 19th-floor trip is a letdown.**
- Evidence: `08`, `08b`, `08c`, `21`.
- Lobby at (158.5, 0, −442.1): shadow acne or z-fighting stripes across the ceiling.
- Elevator: about 7 s of a black "▲ 8" screen.
- "Roof" at (175.6, 50.7, −452.7): the core deck, 3.5 m above the 19th floor, walled in by taller wings, with nothing on it.
- Fix in `housing.js`:
  - Nudge the ceiling off the slab, or raise the shadow bias.
  - Show the car interior instead of the black screen.
  - Put a sofa, milk crates and a boombox on the roof, and route the stair to the tallest wing so the view opens up (`21b` shows it can).

## Keep — this works

- **Sammy's writing and dialogue UI** (`07`): funny, readable, numbered choices, and it's the social glue.
- **Table Park composition** (`01c`, `05b`): fenced pad, tables, mangal, bikes at the gate, towers on three sides. It feels like a place.
- **The views from height**: the 19th-floor window (`09`, `09b`) and the Wonder Wheel ride (`22`) sell the scale of Coney.
- **Stillwell platform shed** (`13`, `13b`): the arched shed silhouette, yellow edges and trains that pull in on the wall clock.
- **Boardwalk dressing** (`23`): signage, rolled shutters with tags, lamps, crowd.
- **Performance headroom**: 60 fps at about 900 draw calls in a wave, so there is budget for the fixes above.
