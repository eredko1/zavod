// RAILYARD layout constants shared by the sub-builders. RAILYARD agent.
// Axes: tracks run along Z (north = -Z). Player spawns south (+Z). Yard floor y = 0.
export const SIZE = 132;                      // playable extent (±66)
export const FENCE = 63;                      // perimeter fence half-extent
export const TRACK_X = [-27, -21.5, -16, -10.5, -5, 0.5, 6, 13.5];
export const TRACK_Z0 = -66, TRACK_Z1 = 66;
export const GAUGE = 1.435;                   // rail centre distance
export const BALLAST_H = 0.12, SLEEPER_H = 0.14, RAIL_H = 0.16;
export const SLEEPER_TOP = BALLAST_H + SLEEPER_H;   // 0.26
export const RAIL_TOP = SLEEPER_TOP + RAIL_H;       // 0.42 (≤ step-up 0.45)
export const CAR_FLOOR = 1.2;                 // wagon deck height

export const PLATFORM = { x0: 17, x1: 26, z0: -34, z1: 34, h: 1.1 };
export const SHED = { x0: 26, x1: 34, z0: -34, z1: 34, floor: 1.1, roof: 6.6 };
export const OFFICE = { x0: -44, x1: -32, z0: 6, z1: 16, floor1: 3.6, roof: 7.2, parapet: 8.0 };
export const OVERPASS = { z0: -48.5, z1: -39.5, x0: -53, x1: 53, top: 7.5, slab: 0.8, parapet: 1.0, rampEnd: -3.5, rampW: 9 };
export const DEPOT = { x0: -62, x1: -34, z0: 26, z1: 60 };
export const ROAD_E = { x0: 44, x1: 53 };     // east service road (ramp continues south to the gate)
export const ROAD_W = { x0: -53, x1: -44 };
