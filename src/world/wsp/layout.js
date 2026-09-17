// WSP plan constants — metres, origin = fountain centre, +x park-east (along Washington Sq N/S), +z park-south (down the 5th Ave axis).
// Source: OSM footprint rotated into the Manhattan grid frame (see RESEARCH.md / qa/refs/wsp/osm_plan_metres.txt). WSP agent.

export const PARK = { x0: -163, x1: 136, z0: -73, z1: 74 };           // fence line
export const BOUNDS = { x0: -180, x1: 154, z0: -96, z1: 96 };          // playable (streets + sidewalks included)
export const CORE = { x0: -190, x1: 165, z0: -105, z1: 105 };          // fine ground mesh / mask extent

// streets around the park: [inner sidewalk][roadway][outer sidewalk]
export const ST_N = { z0: -88, z1: -73, road0: -84.5, road1: -77.0 };
export const ST_S = { z0: 74, z1: 87, road0: 78.0, road1: 83.5 };
export const ST_E = { x0: 136, x1: 146, road0: 139.0, road1: 143.0 };
export const ST_W = { x0: -172, x1: -163, road0: -169.5, road1: -166.0 };
export const FIFTH = { x0: -16, x1: 14, road0: -11, road1: 9 };        // Fifth Avenue north of the arch

// fountain plaza (2009 layout): sunken floor r 11.5 @ -0.9, three 0.3 m steps to r 14.5, coping to 16.4, hex-paved plaza to r 31
export const FOUNTAIN = { r: 11.5, floor: -0.9, steps: 3, rise: 0.3, tread: 1.0, coping: 16.4, plaza: 31, basinR: 2.6, basinH: 0.45, ringPath: 18 };

// Washington Square Arch: footprint x[-8,11] z[-57.5,-50.5]
export const ARCH = {
  cx: 1.5, cz: -54, width: 17.4, depth: 7.0, height: 23.5, span: 9.1, openH: 14.3,
  pier: 4.15, baseH: 3.4, friezeY: 15.4, corniceY: 17.6, atticY: 18.3, atticTop: 22.3, parapet: 0.6,
  shaft: 1.7,                  // hollow stair shaft inside the west pier (ladder)
};

export const GARIBALDI = { x: 58, z: -6 };
export const HOLLEY = { x: -55, z: -3 };
export const CHESS = { x0: -150, x1: -120, z0: 30, z1: 62 };
export const MOUNDS = [ { x: -112, z: 38, r: 9, h: 3.6 }, { x: -100, z: 46, r: 7.5, h: 2.6 }, { x: -104, z: 32, r: 6, h: 2.0 } ];
export const PLAY_NE = { x0: 32, x1: 80, z0: -43, z1: -20 };
export const PLAY_NW = { x0: -62, x1: -36, z0: -66, z1: -56 };
export const DOG_L = { x0: -86, x1: -34, z0: 50, z1: 67 };
export const DOG_S = { x0: 21, x1: 41, z0: 58, z1: 67 };
export const PARKHOUSE = { x0: -72, x1: -44, z0: 40, z1: 49, h: 4.6 };
export const ELM = { x: -149, z: -55 };
export const CIRCLES = [ { x: -134, z: -49, r: 5 }, { x: 111, z: -45, r: 5 }, { x: 109, z: 49, r: 6 } ];

// path centrelines [x,z][] with widths (m) — from OSM footways
export const PATHS = [
  { w: 6, pts: [[0, -18], [0, -31]] },                                        // axis to the arch plaza
  { w: 5, pts: [[0, 18], [-0.5, 37], [-3, 46], [-9, 56], [-12.5, 64], [-13, 74]] },   // S exit (to Wash Sq S / Thompson)
  { w: 5, pts: [[30, 12], [39, 18], [47, 26], [54, 39], [57, 56], [57, 74]] },        // SE exit (LaGuardia Pl)
  { w: 5, pts: [[32, 1], [57, 1], [119, 2], [136, 2]] },                              // E exit (Wash Pl)
  { w: 4.5, pts: [[57, 1], [69, 8], [88, 26], [104, 44]] },                           // ESE diagonal
  { w: 4.5, pts: [[57, 1], [75, -14], [93, -30], [107, -42]] },                       // ENE diagonal
  { w: 5, pts: [[-31, 0], [-77, -1], [-136, -1.5], [-163, -1.7]] },                   // W exit (Wash Pl W)
  { w: 4.5, pts: [[-77, -1], [-100, 18], [-130, 43]] },                               // SW diagonal to the chess plaza
  { w: 4.5, pts: [[-77, -1], [-89, -8], [-110, -27], [-130, -45]] },                  // NW diagonal to the elm circle
  { w: 4.5, pts: [[-131, -53], [-118, -61], [-103, -64], [-85, -62], [-69, -57], [-55, -51], [-46, -51], [-28, -55], [-14, -57]] }, // north walk W
  { w: 4.5, pts: [[12.6, -57], [23, -56], [36, -54], [51, -51], [69, -51], [89, -53], [101, -50], [113, -50]] },                    // north walk E
  { w: 4.5, pts: [[104, 48], [70, 62], [40, 57], [4, 59], [-33, 54], [-53, 39], [-76, 44], [-96, 57], [-120, 55], [-150, 56]] },   // south walk
  { w: 4, pts: [[111, -41], [115, -29], [118, -8], [118.5, 21], [114, 35], [108.5, 44]] },   // east loop
  { w: 4, pts: [[132, -68], [129, -62], [115, -50]] },                                  // NE corner entry
  { w: 4, pts: [[114, 54], [131, 71]] },                                                // SE corner entry
  { w: 4, pts: [[-131, -53], [-158, -70]] },                                            // NW corner entry
  { w: 4, pts: [[-130, 43], [-160, 70]] },                                              // SW corner entry
  { w: 3.5, pts: [[-161, -71], [-161, 68]] }, { w: 3.5, pts: [[133, -68], [133, 71]] },  // perimeter walks
  { w: 3.5, pts: [[-161, -71], [-14, -71], [12, -71], [133, -68]] }, { w: 3.5, pts: [[-161, 68], [133, 71]] },
  { w: 4, pts: [[-9.5, -31], [-9.5, -73]] }, { w: 4, pts: [[12.5, -31], [12.5, -73]] },   // arch flanks
  { w: 3.5, pts: [[-48, 4.4], [-48, -5]] }, { w: 3.5, pts: [[-49, -51], [-49, -60]] },
  { w: 3.5, pts: [[47.5, 74], [47.5, 60]] }, { w: 3.5, pts: [[69, 74], [69, 62]] },
  { w: 3.5, pts: [[-19.5, 74], [-19.5, 58]] }, { w: 3.5, pts: [[-6.8, 74], [-6.8, 59]] },
];
// fully hex-paved areas (rects)
export const PAVED_RECTS = [
  { x0: -13, x1: 16, z0: -73, z1: -30 },      // arch axis plaza
  { x0: -26, x1: 29, z0: -73, z1: -60 },      // arch forecourt (north of the arch)
  { x0: -26, x1: -13, z0: -46, z1: -30 }, { x0: 16, x1: 29, z0: -46, z1: -30 },
  { x0: CHESS.x0, x1: CHESS.x1, z0: CHESS.z0, z1: CHESS.z1 },
  { x0: PARKHOUSE.x0 - 3, x1: PARKHOUSE.x1 + 3, z0: PARKHOUSE.z0 - 4, z1: PARKHOUSE.z1 + 2 },
];
