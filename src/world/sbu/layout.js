// SBU plan constants — metres, origin = Academic Mall centre in front of the Melville Library, +x campus-east, +z campus-south (see RESEARCH.md). SBU agent.
export const BOUNDS = { x0: -165, x1: 180, z0: -150, z1: 140 };
export const GROUND = { x0: -420, x1: 420, z0: -420, z1: 420 };

// Academic Mall paving band (hex pavers) and the library forecourt lawn
export const MALL = { x0: -125, x1: 196, z0: -14, z1: 12 };
export const LIB = { x0: -12, x1: 73, z0: -144, z1: -25, wingX0: -19, wingZ0: -130, wingZ1: -56, entX0: 18, entX1: 36, h: 26.6 };
export const LIB_LAWN = { x0: -12, x1: 73, z0: -25, z1: -14 };

// Student Activities Center
export const SAC = { x0: -81, x1: 11, z0: 21, z1: 95, hallX1: -60, hallZ1: 55, bayCx: -9.5, bayCz: 33.7, bayR: 22.7, bayZ: 11, drumX: -72, drumZ: 14, drumR: 7 };
export const SAC_PLAZA = [[-109, 28], [-100, 61], [-96, 61], [-95, 65], [-92, 64], [-93, 55], [-81, 55], [-81, 21], [-60, 21], [-60, 24], [-27, 24], [-24, 18], [-33, 14], [-33, 7], [-64, 7], [-67, -3], [-79, -2], [-91, -14], [-116, -10], [-121, 16]];
export const PLAZA_C = { x: -96, z: 24, r: 30 };

export const BUS_LOOP = { x: -135, z: 94, r: 21, w: 9 };
export const FREY = { x0: -96, x1: -46, z0: -128, z1: -52 };
export const ZEBRA = { x: -35, w: 8, z0: -113, z1: -37 };
export const HARRIMAN = { x0: -219, x1: -121, z0: -110, z1: -54 };
export const ESS = { x0: -239, x1: -140, z0: -41, z1: 52 };
export const PSY = { x0: 55, x1: 116, z0: 19, z1: 72, wingZ1: 37, wingX0: 77 };
export const STALLER = { nx0: 78, nx1: 174, nz0: -198, nz1: -141, ex0: 146, ex1: 174, ez0: -141, ez1: -61, towerX0: 146, towerX1: 174, towerZ0: -198, towerZ1: -168 };
export const PIT = { x0: 78, x1: 146, z0: -141, z1: -61, floorX0: 132, floor: -3, steps: 8, tread: 5, rise: 0.375 };
export const FOUNTAIN = { x: 136, z: -6, r: 4.5, ring: 9 };
export const POND = { x0: 156, x1: 176, z0: -60, z1: -36, depth: -0.6 };
export const ADMIN = { x0: 198, x1: 272, z0: -65, z1: 4 };
export const HUM = { x0: 175, x1: 241, z0: 11, z1: 110 };
export const ECC = { x0: 50, x1: 117, z0: 109, z1: 182 };
export const JAVITS = { x0: 89, x1: 160, z0: 151, z1: 218 };
export const ENG = { x0: -99, x1: -51, z0: 124, z1: 227 };
export const NEWCS = { x0: -19, x1: 32, z0: 164, z1: 248 };
export const LIGHTENG = { x0: -195, x1: -129, z0: 139, z1: 194 };
export const CHEM = { x0: -117, x1: -22, z0: -199, z1: -143 };
export const VDG = { x0: -186, x1: -134, z0: -141, z1: -98 };
export const UNION = { x0: -24, x1: 66, z0: -306, z1: -237 };
export const REC = { x0: -97, x1: -31, z0: -315, z1: -220 };
export const WANG = { x0: 197, x1: 340, z0: -230, z1: -130 };
export const ENG_DRIVE = { x0: -52, x1: -44, z0: 112, z1: 140 };
export const EAST_LAWN = { x0: 120, x1: 175, z0: 12, z1: 110 };
