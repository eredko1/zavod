// TERMINAL plan constants (metres; east=+x, north=-z). See RESEARCH.md. TERMINAL agent.
export const P = {
  // Main Concourse room
  X0: -42, X1: 42, Z0: -18.5, Z1: 18.5,
  CORNICE: 22, APEX: 38, WALL_T: 1.0,
  BAL_Y: 6, BAL_X: 31,      // W/E balcony front at |x| = 31
  BAL_NZ: -12,              // north balcony front z
  // Stairs (west; east mirrored)
  ST_X0: -20, ST_X1: -26,   // lower flight bottom→top
  ST_HALF: 4,               // lower flight half width
  LAND_Z: 5.5,              // landing half depth (z)
  UP_X0: -28.5,             // upper flights x∈[-31,-28.5]
  UP_Z1: 11.5,              // upper flights end |z|
  // south: ticket offices, wall openings, ramp strip, bridge, Vanderbilt Hall
  TICK_X0: 9, TICK_X1: 25, TICK_Z0: 15.2, TICK_H: 3.6,
  OPEN_X0: 26.5, OPEN_X1: 31,   // corner openings |x|
  BRIDGE_HX: 7.5,               // bridge half width
  RZ0: 19.5, RZ1: 29,           // ramp/gallery strip
  RAMP_TOP_X: 50, RAMP_BOT_X: 8, RAMP_Z0: 22.5,   // ramps run |x| 50→8 in z∈[22.5,29]
  LOW: -6, SUB: -12,
  VH: { x0: -31, x1: 31, z0: 30, z1: 50, h: 15 },
  DIN: { x0: -31, x1: 31, z0: 30, z1: 50 },      // dining concourse under VH (y=-6)
  OYS: { x0: -31, x1: -8, z0: 30, z1: 41 },       // oyster bar room (y=-6)
  MEZ: { x0: -16, x1: 16, z0: 50, z1: 58 },       // subway mezzanine (y=-6)
  PLAT: { x0: -46, x1: 46, z0: 58, z1: 68 },      // subway platform (y=-12)
  TRACK: { z0: 68, z1: 73 },
  SOUTH_WALL_Z: 73.5,
  BOUNDS: { x0: -56, x1: 56, z0: -26, z1: 78, y0: -14, y1: 46 },
};
