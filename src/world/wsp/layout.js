// WSP plan constants — metres, origin = fountain centre, +x park-east (along Washington Sq N/S), +z park-south (down the 5th Ave axis).
// Source: OSM footprint rotated into the Manhattan grid frame (RESEARCH.md / qa/refs/wsp/osm_plan_metres.txt). WSP agent.

export const PARK = { x0: -163, x1: 136, z0: -73, z1: 74 };           // park fence line
export const BOUNDS = { x0: -176, x1: 150, z0: -142, z1: 166 };        // playable: park + one block each side
export const CORE = { x0: -190, x1: 165, z0: -160, z1: 180 };          // fine ground mesh / mask extent

// streets: roadway [r0,r1] (asphalt); everything else between building lines is sidewalk. Names are real; layout from OSM centrelines.
export const STREETS = [
  { name: 'Washington Square North', axis: 'x', r0: -83, r1: -76, a0: -176, a1: 150, oneway: -1 },     // z range, spans x
  { name: 'Washington Square South', axis: 'x', r0: 77, r1: 83, a0: -176, a1: 150, oneway: 1 },
  { name: 'West 3rd Street', axis: 'x', r0: 155, r1: 161, a0: -176, a1: 150, oneway: 1 },
  { name: 'Washington Mews', axis: 'x', r0: -138, r1: -132, a0: -4, a1: 136, oneway: 0, cobble: true },
  { name: 'MacDougal Alley', axis: 'x', r0: -133, r1: -128, a0: -164, a1: -64, oneway: 0, cobble: true },
  { name: 'Washington Square West / MacDougal', axis: 'z', r0: -170, r1: -166, a0: -142, a1: 166, oneway: 1 },
  { name: 'Washington Square East / University Pl', axis: 'z', r0: 139, r1: 144, a0: -142, a1: 86, oneway: -1 },
  { name: 'Fifth Avenue', axis: 'z', r0: -11, r1: 9, a0: -142, a1: -83, oneway: 1 },
  { name: 'Thompson Street', axis: 'z', r0: -17, r1: -11, a0: 83, a1: 166, oneway: -1 },
  { name: 'Sullivan Street', axis: 'z', r0: -90, r1: -84, a0: 83, a1: 166, oneway: 1 },
  { name: 'LaGuardia Place', axis: 'z', r0: 54, r1: 63, a0: 83, a1: 166, oneway: 0 },
];

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
  { w: 5, pts: [[0, 18], [-0.5, 37], [-3, 46], [-9, 56], [-12.5, 64], [-13, 74]] },   // S exit (Thompson St)
  { w: 5, pts: [[30, 12], [39, 18], [47, 26], [54, 39], [57, 56], [57, 74]] },        // SE exit (LaGuardia Pl)
  { w: 5, pts: [[32, 1], [57, 1], [119, 2], [136, 2]] },                              // E exit (Washington Pl)
  { w: 4.5, pts: [[57, 1], [69, 8], [88, 26], [104, 44]] },                           // ESE diagonal
  { w: 4.5, pts: [[57, 1], [75, -14], [93, -30], [107, -42]] },                       // ENE diagonal
  { w: 5, pts: [[-31, 0], [-77, -1], [-136, -1.5], [-163, -1.7]] },                   // W exit (W Washington Pl)
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

// Buildings (OSM footprints, heights). style: brick | row | tan | stone | white | glass | sandstone | church. Closed interiors.
// shops: ground-floor storefront strip on the given face ('n'|'s'|'e'|'w'). stoops: Greek-Revival stoops on face.
export const BUILDINGS = [
  // ---- north: The Row + Fifth Avenue + Washington Mews block --------------------------------------------------
  { id: 'row', name: 'The Row (1–13 Washington Sq N)', x0: 14, x1: 83, z0: -115, z1: -88, h: 18.7, style: 'row', stoops: 's', bays: 12 },
  { id: 'row2', name: '19–26 Washington Sq N', x0: -64, x1: -16, z0: -102, z1: -88, h: 17.5, style: 'row', stoops: 's', bays: 9 },
  { id: 'twofifth', name: '2 Fifth Avenue', x0: -64, x1: -16, z0: -173, z1: -102, h: 63, style: 'tan', bays: 8, floors: 19 },
  { id: 'onefifth', name: 'One Fifth Avenue', x0: 11, x1: 43, z0: -176, z1: -139, h: 85, style: 'tan', bays: 6, floors: 26, setbacks: true },
  { id: 'mewsN', name: 'Washington Mews (north side)', x0: 41, x1: 134, z0: -154, z1: -140, h: 7.2, style: 'white', bays: 12, floors: 2 },
  { id: 'mewsS', name: 'Washington Mews (south side)', x0: 14, x1: 108, z0: -132, z1: -117, h: 7.2, style: 'white', bays: 12, floors: 2 },
  { id: 'rowE', name: '25–29 Washington Sq N', x0: 82, x1: 134, z0: -117, z1: -88, h: 18.5, style: 'brick', bays: 8, floors: 5 },
  { id: 'nwA', name: 'NYU Abu Dhabi / Kevorkian', x0: -93, x1: -68, z0: -129, z1: -88, h: 17.7, style: 'brick', bays: 5, floors: 5 },
  { id: 'nwB', name: 'Wash Sq N houses', x0: -117, x1: -93, z0: -116, z1: -88, h: 20.5, style: 'row', bays: 5, floors: 5, stoops: 's' },
  { id: 'nwC', name: 'Wash Sq N houses W', x0: -141, x1: -117, z0: -110, z1: -88, h: 18.2, style: 'brick', bays: 5, floors: 5 },
  { id: 'nwD', name: '29 Wash Sq W corner', x0: -156, x1: -141, z0: -125, z1: -88, h: 29.9, style: 'tan', bays: 3, floors: 9 },
  { id: 'alleyN', name: 'MacDougal Alley studios', x0: -156, x1: -95, z0: -150, z1: -135, h: 10, style: 'brick', bays: 10, floors: 3 },
  { id: 'eighthN', name: 'W 8th St block', x0: -95, x1: -63, z0: -171, z1: -140, h: 19.3, style: 'brick', bays: 5, floors: 6 },
  { id: 'onefifthN', name: 'Fifth Ave north block', x0: 41, x1: 130, z0: -182, z1: -160, h: 17, style: 'brick', bays: 12, floors: 5 },
  // ---- east: Washington Square East / University Place -------------------------------------------------------
  { id: 'silver', name: 'Silver Center', x0: 145, x1: 179, z0: -67, z1: -8, h: 49.4, style: 'white', bays: 8, floors: 11 },
  { id: 'pless', name: 'Pless Building', x0: 146, x1: 180, z0: 12, z1: 36, h: 26, style: 'brick', bays: 6, floors: 7 },
  { id: 'goddard', name: 'Goddard Hall', x0: 146, x1: 177, z0: 36, z1: 71, h: 25.5, style: 'stone', bays: 7, floors: 6 },
  { id: 'waverlyE', name: 'Waverly Building', x0: 156, x1: 199, z0: -114, z1: -81, h: 49.7, style: 'brick', bays: 8, floors: 12 },
  { id: 'weinstein', name: 'Weinstein Hall', x0: 157, x1: 190, z0: -147, z1: -106, h: 25.6, style: 'tan', bays: 8, floors: 9 },
  { id: 'univPlE', name: 'University Pl east block', x0: 146, x1: 180, z0: -81, z1: -67, h: 22, style: 'brick', bays: 5, floors: 6 },
  { id: 'brown', name: 'Brown Building', x0: 179, x1: 210, z0: -39, z1: -8, h: 43.7, style: 'brick', bays: 6, floors: 10 },
  // ---- south: Washington Square South --------------------------------------------------------------------------
  { id: 'kimmel', name: 'Kimmel Center', x0: 9, x1: 46, z0: 86, z1: 151, h: 50, style: 'glass', bays: 6, floors: 12 },
  { id: 'gcasl', name: 'GCASL', x0: -8, x1: 9, z0: 87, z1: 150, h: 26, style: 'glass', bays: 4, floors: 6 },
  { id: 'judson', name: 'Judson Memorial Church', x0: -41, x1: -21, z0: 87, z1: 118, h: 20.5, style: 'church', bays: 4, floors: 3 },
  { id: 'judsonHall', name: 'Judson Hall / KJCC', x0: -52, x1: -41, z0: 86, z1: 112, h: 21.5, style: 'church', bays: 3, floors: 5 },
  { id: 'southRow', name: 'Wash Sq S houses (Heyman, Kevorkian)', x0: -83, x1: -52, z0: 86, z1: 112, h: 20, style: 'brick', bays: 7, floors: 5 },
  { id: 'furman', name: 'Furman Hall', x0: -76, x1: -22, z0: 118, z1: 150, h: 44.3, style: 'stone', bays: 10, floors: 12 },
  { id: 'bobst', name: 'Bobst Library', x0: 70, x1: 128, z0: 89, z1: 152, h: 43, style: 'sandstone', bays: 10, floors: 12, plaza: true },
  { id: 'kaufman', name: 'Kaufman Management Center (Stern)', x0: 144, x1: 193, z0: 89, z1: 153, h: 50.5, style: 'stone', bays: 10, floors: 13 },
  { id: 'tisch', name: 'Tisch Hall (Stern)', x0: 184, x1: 233, z0: 127, z1: 146, h: 45, style: 'stone', bays: 8, floors: 12 },
  { id: 'sullivanS', name: 'Sullivan / W 3rd block', x0: -160, x1: -95, z0: 86, z1: 124, h: 22, style: 'brick', bays: 12, floors: 6, shops: 'n' },
  { id: 'dagostino', name: "D'Agostino Hall", x0: -160, x1: -107, z0: 128, z1: 150, h: 45.6, style: 'brick', bays: 10, floors: 14 },
  { id: 'macdS', name: 'MacDougal / W 3rd shops', x0: -176, x1: -160, z0: 100, z1: 150, h: 16, style: 'brick', bays: 3, floors: 5, shops: 'e' },
  { id: 'thirdS', name: 'W 3rd St south block', x0: -110, x1: 50, z0: 166, z1: 200, h: 17, style: 'brick', bays: 24, floors: 5, shops: 'n' },
  { id: 'thirdSE', name: 'W 3rd / LaGuardia', x0: 64, x1: 150, z0: 166, z1: 200, h: 24, style: 'tan', bays: 14, floors: 7 },
  // ---- west: Washington Square West / MacDougal ---------------------------------------------------------------
  { id: 'wA', name: '2 Washington Sq Village tower', x0: -206, x1: -172, z0: -69, z1: -32, h: 65.6, style: 'tan', bays: 6, floors: 20 },
  { id: 'wB', name: '29 Washington Sq W', x0: -206, x1: -172, z0: -32, z1: -10, h: 49, style: 'tan', bays: 5, floors: 15 },
  { id: 'wC', name: 'Hayden Hall', x0: -206, x1: -172, z0: -10, z1: 8, h: 40, style: 'tan', bays: 4, floors: 12 },
  { id: 'lipton', name: 'Lipton Hall', x0: -219, x1: -172, z0: 8, z1: 42, h: 50, style: 'brick', bays: 8, floors: 15 },
  { id: 'wD', name: 'MacDougal towers', x0: -206, x1: -172, z0: 42, z1: 76, h: 64, style: 'tan', bays: 6, floors: 20 },
  { id: 'wE', name: 'MacDougal St shops', x0: -206, x1: -172, z0: 84, z1: 100, h: 17.5, style: 'brick', bays: 4, floors: 5, shops: 'e' },
  { id: 'wilf', name: 'Wilf Hall', x0: -206, x1: -176, z0: 100, z1: 124, h: 25.4, style: 'brick', bays: 5, floors: 7, shops: 'e' },
  { id: 'wF', name: 'MacDougal walk-ups', x0: -206, x1: -176, z0: 124, z1: 150, h: 14, style: 'brick', bays: 5, floors: 4, shops: 'e' },
  { id: 'wG', name: 'Waverly / MacDougal', x0: -206, x1: -172, z0: -120, z1: -88, h: 18, style: 'brick', bays: 5, floors: 5, shops: 'e' },
  { id: 'tenthCh', name: 'Tenth Church', x0: -206, x1: -172, z0: -135, z1: -120, h: 23.5, style: 'stone', bays: 4, floors: 3 },
];
