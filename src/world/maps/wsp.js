// MAP: CITY SQUARE — a downtown park + the surrounding village blocks, 1:1 from a measured plan. Owned by: WSP agent (this file + ../wsp/*).
// Levels: park floor y=0 · fountain pit -0.9 (3 steps) · mounds to +3.6 · library plaza +0.9 · terrace stoops +1.4 · mews roof 7.2 · alley studios roof 10 · arch attic 23.5 (ladder in the west pier).
import * as THREE from 'three';
import { BOUNDS, ARCH, CHESS, MOUNDS, STATUE_E, PARKHOUSE, BUILDINGS, FOUNTAIN } from '../wsp/layout.js';
import { loadedTextures } from '../wsp/textures.js';
import { buildSky } from '../wsp/sky.js';
import { buildGround, groundHeight } from '../wsp/ground.js';
import { buildArch } from '../wsp/arch.js';
import { buildBuildings } from '../wsp/buildings.js';
import { buildFurniture } from '../wsp/furniture.js';
import { buildTrees } from '../wsp/trees.js';
import { buildCrowd, scatter } from '../crowd.js';
import { PARK } from '../wsp/layout.js';

export const meta = {
  id: 'wsp', name: 'CITY SQUARE', subtitle: 'DAY OPS · DOWNTOWN PARK', time: 'day', weather: 'clear',
  description: 'A downtown park and the blocks around it: the marble memorial arch (climb the pier ladder to the attic), the fountain plaza, chess corner and mounds, row houses, a university library and the village streets.',
  grade: 'day', ambience: 'wsp-day', thumb: 'assets/thumbs/wsp.jpg',
};

export function build(world) {
  const { ctx, W } = world;
  W.bounds.set(new THREE.Vector3(BOUNDS.x0, -2, BOUNDS.z0), new THREE.Vector3(BOUNDS.x1, 60, BOUNDS.z1));
  W.groundHeight = groundHeight;

  // ladders: register without the per-rung meshes (draw calls), draw them merged at the end
  const ladders = []; const ladderReal = world.ladder;
  world.ladder = (x, z, y0, y1, nx, nz) => { const L = ladderReal(x, z, y0, y1, nx, nz, { mesh: false }); ladders.push(L); return L; };
  ctx.progress(0.13, 'wsp: sky'); buildSky(world);
  const T = loadedTextures(); world.T = T;
  ctx.progress(0.15, 'wsp: ground'); buildGround(world, T);
  ctx.progress(0.18, 'wsp: arch'); buildArch(world, T);
  ctx.progress(0.2, 'wsp: village blocks'); buildBuildings(world, T);
  ctx.progress(0.22, 'wsp: furniture + streets'); buildFurniture(world, T);
  ctx.progress(0.24, 'wsp: trees'); buildTrees(world, T);
  buildLadderMeshes(world, ladders);
  // people: the square is never empty — walkers on the paved paths, loiterers at the fountain rim and around the plaza,
  // pedestrians on the surrounding sidewalks. Set dressing only (no colliders, not raycast targets).
  try {
    const R = world.R, V = world.maskSample, gh = (x, z) => groundHeight(x, z);
    const onPaved = (x, z) => { const m = V(x, z); return m !== 'hex' && m !== 'side'; };
    const crowd = scatter(R, 70, PARK.x0 + 3, PARK.x1 - 3, PARK.z0 + 3, PARK.z1 - 3, 0, (x, z) => onPaved(x, z) || Math.hypot(x, z) < FOUNTAIN.coping + 0.6, { walk: 0.55, bag: 0.08, gap: 2.2 });
    for (let i = 0; i < 14; i++) { const a = R() * Math.PI * 2, r = FOUNTAIN.coping + 0.9 + R() * 1.5; crowd.push({ x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r, ry: Math.atan2(-Math.cos(a), -Math.sin(a)) + (R() - 0.5) * 0.8, pose: R() < 0.35 ? 'phone' : 'stand' }); }
    crowd.push(...scatter(R, 60, BOUNDS.x0 + 6, BOUNDS.x1 - 6, BOUNDS.z0 + 6, BOUNDS.z1 - 6, 0, (x, z) => V(x, z) !== 'side' || (x > PARK.x0 - 2 && x < PARK.x1 + 2 && z > PARK.z0 - 2 && z < PARK.z1 + 2), { walk: 0.75, bag: 0.05, gap: 3 }));
    for (const c of crowd) c.y = gh(c.x, c.z);
    buildCrowd(world, crowd);
  } catch (e) { console.warn('[wsp] crowd', e); }

  // ---- gameplay ------------------------------------------------------------------------------------------------------
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const A = ARCH; const roofY = A.height;
  W.playerSpawns = [v(-13, 0, 80), v(2, 0, 76), v(-28, 0, 76), v(20, 0, 75.5)];               // Park Row South sidewalk / Cooper St mouth
  W.enemySpawns = [
    v(A.cx + 5, roofY, A.cz), v(A.cx - 5, roofY, A.cz),                                       // arch attic
    v(-112, groundHeight(-112, 38), 38), v(-100, groundHeight(-100, 46), 46),                  // mounds
    v(-135, 0, 46), v(-142, 0, 56),                                                            // chess plaza
    v(STATUE_E.x + 4, 0, STATUE_E.z + 3), v(30, 0, -20), v(-30, 0, -22),                     // around the plaza
    v(0, FOUNTAIN.floor, 6),                                                                   // fountain pit
    v(-9.5, 0, -66), v(12.5, 0, -66), v(1, 0, -95),                                            // arch forecourt + the avenue
    v(60, 0, -60), v(-60, 0, -60), v(110, 0, -30), v(-110, 0, -30),                            // north walk / lawns
    v(100, 0, 40), v(-60, 0, 30), v(120, 0, 5),                                                // south / east
    v(48, 0, -80), v(-100, 0, -80), v(145, 0, 30), v(-168, 0, 20),                             // streets
    v(60, 7.2, -124), v(-125, 10, -142),                                                       // roofs (Mews / Alley studios)
    v(100, 0.9, 86),                                                                           // library plaza
  ];
  // online: meet on the fountain plaza's south rim (arch straight ahead); big open park — default wave ring
  W.onlineStart = [-8, 0, 22, -0.3];
  W.waveTuning = { near: 26, far: 72, gap: 20, size: 1, maxAlive: 14, respawnMax: 170 };
  W.poses = {
    spawn: [-13, 0, 80, 0.05, 0.0],
    hero: [-17, 0, 15, -0.24, 0.05],            // from the S rim of the fountain plaza: basin + jets, arch behind, the tower through it
    overview: [-215, 95, 135, -0.95, -0.5],
    arch: [1.5, 0, -22, 0, 0.12],               // on the axis, looking north through the arch up the avenue
    attic: [A.cx + 6.2, roofY, A.cz + 2.6, 0.34, -0.055],  // over the north parapet: mews roofs, water tanks, the skyline
    fountain: [-6, FOUNTAIN.floor, 9, -0.55, 0.04],
    chess: [-118, 0, 42, 1.25, 0.0],
    mounds: [-92, 0, 40, 1.3, 0.05],
    row: [30, 0, -70, 0.15, 0.12],              // the terrace row from the north walk
    // — the four framing poses below are also aliased to fictional names; both keys work.
    bobst: [72, 0, 69, -2.52, 0.27],            // the library's red sandstone mass over its raised plaza
    macdougal: [-164.2, 0, 136, 0.30, 0.03],     // park-side sidewalk looking north up the shopfront row
    kimmel: [-25, 0, 49, -2.68, 0.20],          // the chapel campanile left, the student-centre glass tower right
    judson: [-4, 0, 68, 2.585, 0.30],           // the campanile head-on over the south walk
    garibaldi: [52, 0, -1, -1.33, 0.26],        // the bronze on its granite pedestal, park behind
    fifth: [0, 0, -100, 0, 0.08],
  };
  // fictional aliases for the landmark poses (the four above keep their historic keys for the QA harness)
  Object.assign(W.poses, {
    library: W.poses.bobst, shopfronts: W.poses.macdougal, studentctr: W.poses.kimmel,
    campanile: W.poses.judson, statue: W.poses.garibaldi, avenue: W.poses.fifth,
  });
  // cover along the fountain coping, paths, lawn fences (more from furniture builders)
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const r = FOUNTAIN.coping + 0.6; world.cover(Math.cos(a) * r, Math.sin(a) * r, Math.cos(a), Math.sin(a)); }
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const r = FOUNTAIN.r - 1; world.cover(Math.cos(a) * r, Math.sin(a) * r, -Math.cos(a), -Math.sin(a), FOUNTAIN.floor); }
  for (const m of MOUNDS) for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { const x = m.x + Math.cos(a) * m.r * 0.6, z = m.z + Math.sin(a) * m.r * 0.6; world.cover(x, z, Math.cos(a), Math.sin(a), groundHeight(x, z)); }

  W.surfaceAt = (p) => {
    const x = p.x, z = p.z, y = p.y;
    if (y > 22 && Math.abs(x - A.cx) < 10 && Math.abs(z - A.cz) < 5) return 'concrete';
    const r = Math.hypot(x, z);
    if (r < FOUNTAIN.basinR && r > FOUNTAIN.plinthR && y < FOUNTAIN.floor + 0.5) return 'water';
    if (r < FOUNTAIN.plaza) return 'concrete';
    if (world.groundMask && world.maskSample) { const s = world.maskSample(x, z); if (s === 'lawn') return 'ground'; return 'concrete'; }
    return 'ground';
  };
}

/** One merged mesh for all ladders (rails + rungs) instead of ~80 meshes per ladder. */
function buildLadderMeshes(world, ladders) {
  const { ctx, scene } = world; const geos = [];
  for (const L of ladders) {
    const h = L.y1 - L.y0 + 0.9; const ang = Math.atan2(L.nx, L.nz);
    const add = (g) => { g.rotateY(ang); g.translate(L.x + L.nx * 0.12, L.y0, L.z + L.nz * 0.12); geos.push(g); };
    for (const sx of [-0.22, 0.22]) { const r = new THREE.CylinderGeometry(0.02, 0.02, h, 6); r.translate(sx, h / 2, 0); add(r); }
    for (let y = 0.3; y < h - 0.2; y += 0.3) { const r = new THREE.CylinderGeometry(0.014, 0.014, 0.44, 6); r.rotateZ(Math.PI / 2); r.translate(0, y, 0); add(r); }
    for (let y = 2.5; y < h - 1; y += 2.5) { const b = new THREE.BoxGeometry(0.5, 0.04, 0.16); b.translate(0, y, -0.1); add(b); }   // wall brackets
  }
  if (!geos.length) return;
  const g = new THREE.BufferGeometry(); const pos = [], nor = [], uv = [];
  for (const q of geos) { const n = q.index ? q.toNonIndexed() : q; pos.push(...n.attributes.position.array); nor.push(...n.attributes.normal.array); uv.push(...n.attributes.uv.array); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.5, metalness: 0.8 })); m.name = 'ladders'; m.castShadow = true; m.userData.surface = 'metal'; scene.add(m); ctx.raycastTargets.push(m);
}
