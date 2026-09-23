// Static architecture: warehouse, loading dock, substation, tanks, perimeter walls/fences, gantry crane. WORLD agent.
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { addGrime, signTexture, chainlinkTexture, barbedTexture } from './mats.js';

export const WAREHOUSE = { x0: -56, x1: -14, z0: -56, z1: -22, h: 9 };
export const DOCK = { x0: -14, x1: -8, z0: -50, z1: -30, h: 1.2 };
export const SUBSTATION = { x0: 30, x1: 44, z0: -57, z1: -47, h: 6 };
export const CRANE = { z: 30, x0: 9.5, x1: 53.5, h: 18 };
export const HUT = { x: 9.5, z: 53.5 };

function scaleUV(geo, su, sv) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return geo; }
/** Box with world-scale UVs (texture tile = `tile` metres) */
function tbox(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv; const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / tile, uv.getY(k) * dims[f][1] / tile); }
  return g;
}

export function buildStructures(world) {
  const { ctx, scene, R } = world;
  const A = ctx.assets;
  const bins = new Map(); // material → geometries[]
  const add = (mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => {
    if (rx || ry || rz) { const e = new THREE.Euler(rx, ry, rz); geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(e)); }
    geo.translate(x, y, z);
    if (!bins.has(mat)) bins.set(mat, []); bins.get(mat).push(geo); return geo;
  };
  const solidBox = (mat, w, h, d, x, y, z, tile = 2, surface = 'concrete', ry = 0) => {
    add(mat, tbox(w, h, d, tile), x, y, z, ry);
    if (!ry) world.box([x - w / 2, y - h / 2, z - d / 2], [x + w / 2, y + h / 2, z + d / 2]);
    else { const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry)); const ex = (w * c + d * s) / 2, ez = (w * s + d * c) / 2; world.box([x - ex, y - h / 2, z - ez], [x + ex, y + h / 2, z + ez]); }
    bins.get(mat).surface = surface;
  };

  // ---- materials -----------------------------------------------------------
  const M = {
    corr: addGrime(A.material('corrugated', { grayscale: true, color: 0x59626c, repeat: 1, normalScale: 1.1, envMapIntensity: 0.7 }), R, { strength: 0.9, scale: 0.35, height: 2.5, key: 's1' }),
    corrDark: addGrime(A.material('corrugated', { grayscale: true, color: 0x3b4149, repeat: 1, normalScale: 1.1, envMapIntensity: 0.6 }), R, { strength: 0.7, scale: 0.35, height: 2.5, key: 's2' }),
    // roof/canopy undersides are seen at grazing angles under point lights: the full-strength rib normal map aliased into
    // heavy moiré there. Softer normals + rougher sheet for anything overhead.
    corrRoof: addGrime(A.material('corrugated', { grayscale: true, color: 0x3b4149, repeat: 1, normalScale: 0.3, envMapIntensity: 0.35, roughness: 1 }), R, { strength: 0.7, scale: 0.35, height: 2.5, key: 's3' }),
    concrete: addGrime(A.material('concrete_wall', { repeat: 1, color: 0xa8a8a8, envMapIntensity: 0.5 }), R, { strength: 0.9, scale: 0.5, height: 1.6, tint: [0.3, 0.28, 0.25], key: 's3' }),
    concreteFloor: A.material('concrete_floor', { repeat: 1, color: 0x9a9a9a, envMapIntensity: 0.7 }),
    cracked: addGrime(A.material('cracked_concrete', { repeat: 1, color: 0xa0a0a0, envMapIntensity: 0.5 }), R, { strength: 0.8, scale: 0.5, height: 0.9, key: 's4' }),
    steel: addGrime(A.material('metal_plate', { repeat: 1, color: 0x4c5158, envMapIntensity: 0.8 }), R, { strength: 0.8, scale: 0.6, height: 3, tint: [0.5, 0.3, 0.18], key: 's5' }),
    steelRed: addGrime(A.material('metal_plate', { repeat: 1, color: 0x8a2a1c, envMapIntensity: 0.8 }), R, { strength: 0.9, scale: 0.4, height: 6, tint: [0.4, 0.25, 0.15], key: 's6' }),
    steelYellow: addGrime(A.material('metal_plate', { repeat: 1, color: 0xc48a14, envMapIntensity: 0.8 }), R, { strength: 0.9, scale: 0.4, height: 6, tint: [0.4, 0.3, 0.15], key: 's7' }),
    rust: A.material('rust', { repeat: 1, color: 0xbbbbbb, envMapIntensity: 0.5 }),
    grid: A.material('grid', { repeat: 1, color: 0xcccccc, envMapIntensity: 0.6 }),
    brick: addGrime(A.material('brick', { repeat: 1, color: 0xb0a8a0, envMapIntensity: 0.4 }), R, { strength: 0.9, scale: 0.5, height: 2, tint: [0.3, 0.26, 0.22], key: 's8' }),
    shutter: addGrime(A.material('shutter', { grayscale: true, color: 0x6a7078, repeat: 1, envMapIntensity: 0.7 }), R, { strength: 0.8, scale: 0.4, height: 2, key: 's9' }),
    paintedConc: addGrime(A.material('painted_concrete', { repeat: 1, color: 0x9ea39a, envMapIntensity: 0.5 }), R, { strength: 0.9, scale: 0.5, height: 1.5, key: 's10' }),
    fenceMesh: new THREE.MeshStandardMaterial({ map: chainlinkTexture(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, color: 0x9aa0a6, roughness: 0.5, metalness: 0.8, envMapIntensity: 0.8 }),
    barbed: new THREE.MeshStandardMaterial({ map: barbedTexture(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, color: 0xaeb4ba, roughness: 0.4, metalness: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x223028, roughness: 0.35, metalness: 0.1, transmission: 0, transparent: true, opacity: 0.75, emissive: 0x8a5a1c, emissiveIntensity: 0.35, envMapIntensity: 1.2 }),
  };
  M.fenceMesh.map.repeat.set(1, 1);
  world.M = M;

  buildWarehouse(world, M, add, solidBox);
  buildDock(world, M, add, solidBox);
  buildSubstation(world, M, add, solidBox);
  buildTanks(world, M, add, solidBox);
  buildPerimeter(world, M, add, solidBox);
  buildCrane(world, M, add, solidBox);
  buildPlaza(world, M, add, solidBox);

  // ---- merge bins into one mesh per material ------------------------------
  for (const [mat, geos] of bins) {
    const merged = BGU.mergeGeometries(geos, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = 'static:' + (mat.name || '');
    const surface = geos.surface || (mat === M.concrete || mat === M.cracked || mat === M.brick || mat === M.concreteFloor || mat === M.paintedConc ? 'concrete' : 'metal');
    mesh.userData.surface = surface;
    mesh.castShadow = !(mat === M.fenceMesh || mat === M.barbed || mat === M.glass);
    mesh.receiveShadow = true;
    scene.add(mesh); ctx.raycastTargets.push(mesh);
  }
}

// ============================================================================
function buildWarehouse(world, M, add, solidBox) {
  const { x0, x1, z0, z1, h } = WAREHOUSE; const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const t = 0.25;
  // concrete plinth ring + corrugated walls above (north/west/east full; south with bays)
  const plinth = 1.0;
  const wall = (len, x, z, ry, segs) => {
    // segs: [ [from, to, yBottom, yTop] ] along local x, in metres from -len/2
    for (const [a, b, yb, yt] of segs) {
      const L = b - a; const midL = (a + b) / 2;
      const dx = Math.cos(ry) * midL, dz = -Math.sin(ry) * midL;
      const g = tbox(L, yt - yb, t, 2.4); g.applyMatrix4(new THREE.Matrix4().makeRotationY(ry)); g.translate(x + dx, (yb + yt) / 2, z + dz);
      add(yt <= plinth ? M.concrete : M.corr, g);
      const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry)); const ex = (L * c + t * s) / 2, ez = (L * s + t * c) / 2;
      world.box([x + dx - ex, yb, z + dz - ez], [x + dx + ex, yt, z + dz + ez]);
    }
  };
  // north wall (z0), west wall (x0), east wall (x1) with a door hole at z -31..-29
  wall(W, cx, z0, 0, [[-W / 2, W / 2, 0, plinth], [-W / 2, W / 2, plinth, h]]);
  wall(D, x0, cz, Math.PI / 2, [[-D / 2, D / 2, 0, plinth], [-D / 2, D / 2, plinth, h]]);
  const dz0 = -31 - cz, dz1 = -29 - cz; // east door local coords (local x runs +z when ry = -PI/2)
  wall(D, x1, cz, -Math.PI / 2, [[-D / 2, dz0, 0, plinth], [dz1, D / 2, 0, plinth], [-D / 2, dz0, plinth, h], [dz1, D / 2, plinth, h], [dz0, dz1, 2.4, h]]);
  // south wall: bays A (x -50..-42, open) and B (x -34..-26, half-shut), rest wall
  const sx = (x) => x - cx;
  wall(W, cx, z1, 0, [
    [-W / 2, sx(-50), 0, plinth], [-W / 2, sx(-50), plinth, h],
    [sx(-42), sx(-34), 0, plinth], [sx(-42), sx(-34), plinth, h],
    [sx(-26), W / 2, 0, plinth], [sx(-26), W / 2, plinth, h],
    [sx(-50), sx(-42), 6.2, h], [sx(-34), sx(-26), 6.2, h],
  ]);
  // half-closed roller shutter over bay B (bottom at 2.7 m) + door drums
  const shutB = tbox(8, 3.5, 0.12, 1.5); add(M.shutter, shutB, -30, 2.7 + 1.75, z1 - 0.15);
  world.box([-34, 2.7, z1 - 0.25], [-26, 6.2, z1 - 0.05]);
  for (const bx of [-46, -30]) add(M.steel, new THREE.CylinderGeometry(0.45, 0.45, 8.2, 14).rotateZ(Math.PI / 2), bx, 6.6, z1 - 0.35);
  // door frames (yellow/black) around bays
  for (const bx of [-46, -30]) for (const s of [-1, 1]) solidBox(M.steelYellow, 0.3, 6.2, 0.4, bx + s * 4.05, 3.1, z1, 1, 'metal');
  // pedestrian door + window band on the south wall
  add(M.steel, tbox(1.1, 2.2, 0.1, 1), -20, 1.1, z1 + 0.08);
  for (let i = 0; i < 3; i++) add(M.glass, new THREE.PlaneGeometry(2.2, 1.2), -23 + i * 3.3, 7.4, z1 + 0.02);
  for (let i = 0; i < 6; i++) add(M.glass, new THREE.PlaneGeometry(2.2, 1.2), -54 + i * 4.4, 7.4, z1 + 0.02);
  for (let i = 0; i < 6; i++) add(M.glass, new THREE.PlaneGeometry(2.2, 1.2), x1 + 0.02, 7.4, -52 + i * 5.5, Math.PI / 2);
  // roof slab + parapet + trusses + rooftop units
  add(M.corrRoof, tbox(W + 0.6, 0.3, D + 0.6, 3.5), cx, h + 0.15, cz);
  world.box([x0 - 0.3, h, z0 - 0.3], [x1 + 0.3, h + 0.3, z1 + 0.3]);
  for (const [w, d, x, z] of [[W + 0.6, 0.3, cx, z0 - 0.15], [W + 0.6, 0.3, cx, z1 + 0.15], [0.3, D + 0.6, x0 - 0.15, cz], [0.3, D + 0.6, x1 + 0.15, cz]]) add(M.concrete, tbox(w, 0.9, d, 2), x, h + 0.75, z);
  for (let i = 0; i < 6; i++) { const rx = x0 + 4 + i * 7; add(M.steel, tbox(6, 1.4, 4, 2), rx, h + 1.0, cz + (i % 2 ? 8 : -6)); }
  add(M.rust, new THREE.CylinderGeometry(2.2, 2.2, 4, 18), x0 + 8, h + 2.3, z0 + 8);
  for (let i = 0; i < 4; i++) add(M.rust, new THREE.CylinderGeometry(0.35, 0.35, 1.6, 10), x0 + 14 + i * 8, h + 1.0, z0 + 20);
  // interior: floor, columns, trusses, catwalk, stairs
  add(M.concreteFloor, scaleUV(new THREE.PlaneGeometry(W - 0.5, D - 0.5).rotateX(-Math.PI / 2), (W - 0.5) / 3, (D - 0.5) / 3), cx, 0.02, cz);
  for (let i = 0; i <= 7; i++) for (const z of [z0 + 0.4, z1 - 0.4]) { const x = x0 + i * 6; if (x > x1) continue; solidBox(M.steel, 0.4, h, 0.4, x, h / 2, z, 1, 'metal'); }
  for (let i = 1; i < 7; i++) { const x = x0 + i * 6; add(M.steel, tbox(0.4, 1.2, D - 0.5, 2), x, h - 0.7, cz); for (let j = 0; j < 8; j++) add(M.steel, tbox(0.15, 0.9, 0.15, 1), x, h - 0.7, z0 + 2 + j * 4, 0, 0, 0.6); }
  for (let j = 0; j < 4; j++) add(M.steel, tbox(W - 0.5, 0.25, 0.25, 2), cx, h - 1.35, z0 + 4 + j * 8.5);
  // catwalk along the north wall at 4.5 m
  const cwY = 4.5, cwD = 1.8;
  add(M.grid, tbox(W - 1, 0.08, cwD, 1.2), cx, cwY, z0 + 0.3 + cwD / 2);
  world.box([x0 + 0.5, cwY - 0.1, z0 + 0.3], [x1 - 0.5, cwY + 0.04, z0 + 0.3 + cwD]);
  add(M.steel, tbox(W - 1, 0.25, 0.1, 1), cx, cwY - 0.1, z0 + 0.3 + cwD);
  for (let i = 0; i < 10; i++) { const x = x0 + 1 + i * 4.4; add(M.steel, tbox(0.06, 1.1, 0.06, 1), x, cwY + 0.55, z0 + 0.3 + cwD); add(M.steel, tbox(0.3, 0.3, cwD, 1), x, cwY - 0.25, z0 + 0.3 + cwD / 2); }
  for (const yy of [0.55, 1.05]) add(M.steel, new THREE.CylinderGeometry(0.03, 0.03, W - 1, 6).rotateZ(Math.PI / 2), cx, cwY + yy, z0 + 0.3 + cwD);
  // stairs to catwalk at the east end (steps 0.3 m)
  const steps = 15, sw = 1.2; const stX = x1 - 1.2;
  for (let i = 0; i < steps; i++) { const y = (i + 1) * 0.3; const zz = z0 + 0.3 + cwD + 0.5 + i * 0.36; solidBox(M.grid, sw, 0.08, 0.36, stX, y, zz, 1, 'metal'); }
  add(M.steel, tbox(0.08, 0.05, steps * 0.36, 1), stX - sw / 2, steps * 0.15 + 0.9, z0 + 0.3 + cwD + 0.5 + steps * 0.18, 0, -Math.atan2(0.3, 0.36), 0);
  for (let i = 0; i < 6; i++) add(M.steel, tbox(0.05, 1.0, 0.05, 1), stX - sw / 2, (i * 2.5 + 1) * 0.3 + 0.5, z0 + 0.3 + cwD + 0.5 + i * 2.5 * 0.36);
  // mezzanine office box in the NW corner (a room the player can hide behind)
  solidBox(M.paintedConc, 8, 3.2, 6, x0 + 4.5, 1.6, z0 + 3.5, 2, 'concrete');
  add(M.glass, new THREE.PlaneGeometry(4, 1.2), x0 + 4.5, 2.2, z0 + 6.52);
  add(M.steel, tbox(1, 2.2, 0.08, 1), x0 + 8.55, 1.1, z0 + 5);
  // stacked crates pile & interior pallet racks (simple steel racks)
  for (const rx of [-40, -32]) {
    for (const lvl of [0.15, 2.0, 3.8]) add(M.steel, tbox(6, 0.12, 1.2, 1), rx, lvl, z0 + 8);
    for (const sxx of [-3, 3]) for (const szz of [-0.6, 0.6]) solidBox(M.steelRed, 0.1, 4.2, 0.1, rx + sxx, 2.1, z0 + 8 + szz, 1, 'metal');
    world.box([rx - 3, 0, z0 + 7.4], [rx + 3, 0.3, z0 + 8.6]);
  }
  // signage on the front wall
  const sign = signTexture({ text: 'ЗАВОД №3', sub: 'СКЛАД ГОТОВОЙ ПРОДУКЦИИ', w: 1024, h: 256, bg: '#2a2622', fg: '#e6dcc6', R: world.R });
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshStandardMaterial({ map: sign, roughness: 0.6, metalness: 0.2, emissive: 0x332a1a, emissiveMap: sign, emissiveIntensity: 0.25 }));
  signMesh.position.set(-38, 7.9, z1 + 0.16); world.scene.add(signMesh); world.ctx.raycastTargets.push(signMesh); signMesh.userData.surface = 'metal';
  const warn = signTexture({ text: 'ОСТОРОЖНО! РАБОТАЕТ КРАН', stripes: true, w: 1024, h: 160, bg: '#141414', fg: '#f0e6c0', border: null, font: 'bold 74px Arial', R: world.R });
  const warnMesh = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.95), new THREE.MeshStandardMaterial({ map: warn, roughness: 0.5, metalness: 0.3 }));
  warnMesh.position.set(-30, 6.6 - 0.35 - 3.5 + 0.2, z1 + 0.16); warnMesh.position.y = 2.15; world.scene.add(warnMesh);
}

// ============================================================================
function buildDock(world, M, add, solidBox) {
  const { x0, x1, z0, z1, h } = DOCK; const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  solidBox(M.cracked, x1 - x0, h, z1 - z0, cx, h / 2, cz, 2.5, 'concrete');
  // bumpers + yellow edge stripe
  for (let i = 0; i < 5; i++) solidBox(M.rust, 0.25, 0.5, 0.5, x1 + 0.1, 0.8, z0 + 2 + i * 4, 1, 'metal');
  add(M.steelYellow, tbox(0.12, 0.05, z1 - z0, 1), x1 - 0.06, h + 0.02, cz);
  // stairs at both ends (steps 0.3)
  for (const end of [-1, 1]) for (let i = 0; i < 4; i++) { const y = (i + 1) * 0.3; const zz = end < 0 ? z0 - 2 + i * 0.5 : z1 + 2 - i * 0.5; solidBox(M.cracked, 2.4, 0.3, 0.5, cx, y - 0.15, zz, 1, 'concrete'); }
  // railing
  for (const zz of [z0 + 0.2, z1 - 0.2]) add(M.steel, new THREE.CylinderGeometry(0.03, 0.03, x1 - x0 - 0.4, 6).rotateZ(Math.PI / 2), cx, h + 1.0, zz);
  // canopy over the dock from the warehouse wall
  add(M.corrRoof, tbox(x1 - x0 + 2, 0.12, z1 - z0 + 2, 3.5), cx + 1, 4.2, cz);
  for (const zz of [z0 + 0.5, z1 - 0.5]) solidBox(M.steel, 0.15, 3.0, 0.15, x1 + 0.7, h + 1.5, zz, 1, 'metal');
  world.cover(x1 + 1.2, z0 + 3, 1, 0); world.cover(x1 + 1.2, z1 - 3, 1, 0); world.cover(cx, z1 + 3.2, 0, 1); world.cover(cx, z0 - 3.2, 0, -1);
}

// ============================================================================
function buildSubstation(world, M, add, solidBox) {
  const { x0, x1, z0, z1, h } = SUBSTATION; const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, W = x1 - x0, D = z1 - z0;
  solidBox(M.brick, W, h, D, cx, h / 2, cz, 2.2, 'concrete');
  add(M.concrete, tbox(W + 0.5, 0.6, D + 0.5, 2), cx, h + 0.3, cz);
  add(M.concrete, tbox(W + 0.3, 0.9, 0.3, 2), cx, 0.45, z1 + 0.15); // plinth
  // steel door + shutter + warning sign on south face
  add(M.shutter, tbox(3, 3.2, 0.1, 1.2), cx - 3, 1.6, z1 + 0.06);
  add(M.steel, tbox(1.1, 2.2, 0.1, 1), cx + 4, 1.1, z1 + 0.06);
  const warn = signTexture({ text: 'ВЫСОКОЕ НАПРЯЖЕНИЕ', sub: 'НЕ ВЛЕЗАЙ — УБЬЁТ', w: 768, h: 256, bg: '#c8b028', fg: '#111', border: '#111', font: 'bold 70px Arial', R: world.R });
  const wm = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.8), new THREE.MeshStandardMaterial({ map: warn, roughness: 0.55 }));
  wm.position.set(cx + 1, 2.3, z1 + 0.12); world.scene.add(wm);
  // insulator stack / transformer on the roof, conduit down the wall
  for (let i = 0; i < 3; i++) add(M.rust, new THREE.CylinderGeometry(0.25, 0.3, 1.6, 10), cx - 4 + i * 2.5, h + 1.4, cz);
  add(M.steel, tbox(3, 2, 2, 1.5), cx + 3.5, h + 1.6, cz - 1);
  for (let i = 0; i < 3; i++) add(M.rust, new THREE.CylinderGeometry(0.06, 0.06, h, 6), x0 + 2 + i * 0.4, h / 2, z1 + 0.22);
  world.cover(cx - 3, z1 + 1.2, 0, 1); world.cover(x0 - 1.2, cz + 2, -1, 0); world.cover(x1 + 1.2, cz + 2, 1, 0);
}

// ============================================================================
function buildTanks(world, M, add, solidBox) {
  // bund wall enclosure (0.6 m) around two horizontal tanks + one vertical silo
  const bx0 = -52, bx1 = -28, bz0 = 34, bz1 = 54;
  const wallSeg = (w, d, x, z) => solidBox(M.concrete, w, 0.6, d, x, 0.3, z, 2, 'concrete');
  wallSeg(bx1 - bx0, 0.3, (bx0 + bx1) / 2, bz0); wallSeg(bx1 - bx0, 0.3, (bx0 + bx1) / 2, bz1);
  wallSeg(0.3, bz1 - bz0, bx0, (bz0 + bz1) / 2);
  wallSeg(0.3, 8, bx1, bz0 + 4); wallSeg(0.3, 8, bx1, bz1 - 4); // gap at z 42..46
  add(M.cracked, scaleUV(new THREE.PlaneGeometry(bx1 - bx0 - 0.3, bz1 - bz0 - 0.3).rotateX(-Math.PI / 2), 8, 7), (bx0 + bx1) / 2, 0.015, (bz0 + bz1) / 2);
  for (const tz of [39.5, 48.5]) {
    const tank = new THREE.CylinderGeometry(2.2, 2.2, 11, 24).rotateZ(Math.PI / 2);
    add(M.steelRed, tank, -41, 3.0, tz);
    for (const s of [-1, 1]) add(M.steelRed, new THREE.SphereGeometry(2.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(Math.PI / 2 * -s), -41 + s * 5.5, 3.0, tz);
    for (const sx of [-3.5, 3.5]) solidBox(M.concrete, 1.2, 1.6, 4.6, -41 + sx, 0.8, tz, 1.5, 'concrete');
    world.box([-47, 0.8, tz - 2.2], [-35, 5.2, tz + 2.2]);
    add(M.rust, new THREE.CylinderGeometry(0.12, 0.12, 6, 8), -41 + 2, 5.2 + 0.0, tz, 0, Math.PI / 2, 0);
    add(M.steel, new THREE.CylinderGeometry(0.5, 0.5, 0.5, 12), -41, 5.3, tz);
    world.cover(-41, tz + 3.2, 0, 1); world.cover(-41, tz - 3.2, 0, -1);
  }
  // vertical silo + ladder cage
  add(M.rust, new THREE.CylinderGeometry(3, 3, 10, 28), -24, 5, 45); world.box([-27, 0, 42], [-21, 10, 48]);
  add(M.rust, new THREE.ConeGeometry(3.05, 1.2, 28), -24, 10.6, 45);
  for (let i = 0; i < 20; i++) add(M.steel, tbox(0.5, 0.03, 0.03, 1), -20.95, 0.5 + i * 0.45, 45);
  for (const s of [-1, 1]) add(M.steel, tbox(0.03, 9.5, 0.03, 1), -20.95, 5, 45 + s * 0.25);
  world.cover(-20, 45, 1, 0); world.cover(-24, 41.5, 0, -1);
  // pipe rack along the west wall from the tanks up north
  for (let i = 0; i < 3; i++) add(M.rust, new THREE.CylinderGeometry(0.16 - i * 0.03, 0.16 - i * 0.03, 90, 8).rotateX(Math.PI / 2), -56.6 + i * 0.5, 2.6 + i * 0.35, -6);
  for (let j = 0; j < 12; j++) { add(M.steel, tbox(1.6, 0.12, 0.12, 1), -56.4, 2.4, -50 + j * 8); solidBox(M.steel, 0.12, 2.4, 0.12, -55.7, 1.2, -50 + j * 8, 1, 'metal'); }
}

// ============================================================================
function buildPerimeter(world, M, add, solidBox) {
  const E = 58;
  // north & west: precast concrete panel walls 3 m
  const panelWall = (len, x, z, ry) => {
    const g = tbox(len, 3, 0.25, 2.5); g.applyMatrix4(new THREE.Matrix4().makeRotationY(ry)); g.translate(x, 1.5, z); add(M.concrete, g);
    const n = Math.round(len / 3);
    for (let i = 0; i <= n; i++) { const o = -len / 2 + i * (len / n); const px = x + Math.cos(ry) * o, pz = z - Math.sin(ry) * o; add(M.concrete, tbox(0.35, 3.2, 0.35, 1), px, 1.6, pz); }
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry)); const ex = (len * c + 0.35 * s) / 2, ez = (len * s + 0.35 * c) / 2;
    world.box([x - ex, 0, z - ez], [x + ex, 3.2, z + ez]);
  };
  panelWall(2 * E + 4, 0, -E, 0);
  panelWall(2 * E + 4, -E, 0, Math.PI / 2);
  // barbed wire on walls
  for (const [x, z, ry] of [[0, -E, 0], [-E, 0, Math.PI / 2]]) { const g = new THREE.PlaneGeometry(2 * E + 4, 0.35); scaleUV(g, (2 * E + 4) / 0.8, 1); g.applyMatrix4(new THREE.Matrix4().makeRotationY(ry)); g.translate(x, 3.35, z); add(M.barbed, g); }
  // east & south: chainlink fence with barbed top; gate on the south at x -2..6
  const fence = (from, to, x, z, ry) => {
    const len = to - from; const mid = (from + to) / 2; const cx = x + Math.cos(ry) * mid, cz = z - Math.sin(ry) * mid;
    const g = new THREE.PlaneGeometry(len, 2.5); scaleUV(g, len / 0.6, 2.5 / 0.6); g.applyMatrix4(new THREE.Matrix4().makeRotationY(ry)); g.translate(cx, 1.25, cz); add(M.fenceMesh, g);
    const b = new THREE.PlaneGeometry(len, 0.35); scaleUV(b, len / 0.8, 1); b.applyMatrix4(new THREE.Matrix4().makeRotationY(ry)); b.translate(cx, 2.75, cz); add(M.barbed, b);
    const n = Math.round(len / 3);
    for (let i = 0; i <= n; i++) { const o = from + i * (len / n); const px = x + Math.cos(ry) * o, pz = z - Math.sin(ry) * o; add(M.steel, new THREE.CylinderGeometry(0.05, 0.05, 2.9, 8), px, 1.45, pz); }
    const rail = new THREE.CylinderGeometry(0.03, 0.03, len, 6).rotateZ(Math.PI / 2); rail.applyMatrix4(new THREE.Matrix4().makeRotationY(ry)); rail.translate(cx, 2.5, cz); add(M.steel, rail);
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry)); const ex = (len * c + 0.2 * s) / 2, ez = (len * s + 0.2 * c) / 2;
    world.box([cx - ex, 0, cz - ez], [cx + ex, 3, cz + ez]);
  };
  fence(-E - 2, E + 2, E, 0, Math.PI / 2);   // east
  fence(-E - 2, -2, 0, E, 0);                // south west part
  fence(6, E + 2, 0, E, 0);                  // south east part
  // gate (closed, chainlink on steel frame) + posts + sign
  for (const gx of [-2, 6]) solidBox(M.steel, 0.3, 3.4, 0.3, gx, 1.7, E, 1, 'metal');
  const gg = new THREE.PlaneGeometry(8, 2.4); scaleUV(gg, 8 / 0.6, 2.4 / 0.6); gg.translate(2, 1.3, E + 0.05); add(M.fenceMesh, gg);
  add(M.steelRed, tbox(8, 0.1, 0.1, 1), 2, 2.5, E + 0.05); add(M.steelRed, tbox(8, 0.1, 0.1, 1), 2, 0.15, E + 0.05);
  add(M.steelRed, tbox(0.1, 2.4, 0.1, 1), 2, 1.3, E + 0.05);
  world.box([-2, 0, E - 0.2], [6, 3, E + 0.3]);
  const gs = signTexture({ text: 'ПРОХОД ЗАПРЕЩЁН', sub: 'ОХРАНЯЕМАЯ ТЕРРИТОРИЯ', w: 768, h: 256, bg: '#b8262a', fg: '#f3ede0', border: '#f3ede0', font: 'bold 66px Arial', R: world.R });
  const gm = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.8), new THREE.MeshStandardMaterial({ map: gs, roughness: 0.5, side: THREE.DoubleSide })); gm.position.set(2, 1.8, E - 0.02); gm.rotation.y = Math.PI; world.scene.add(gm);
  // guard hut with lit window
  const { x: hx, z: hz } = HUT;
  solidBox(M.paintedConc, 3.2, 2.9, 3.2, hx, 1.45, hz, 1.5, 'concrete');
  add(M.corrDark, tbox(3.8, 0.15, 3.8, 2), hx, 3.0, hz);
  add(M.glass, new THREE.PlaneGeometry(1.6, 1.0), hx - 1.61, 1.8, hz, -Math.PI / 2);
  add(M.glass, new THREE.PlaneGeometry(1.6, 1.0), hx, 1.8, hz - 1.61, Math.PI);
  add(M.steel, tbox(0.9, 2.1, 0.08, 1), hx + 0.6, 1.05, hz - 1.62);
  world.cover(hx - 2.4, hz, -1, 0); world.cover(hx, hz - 2.4, 0, -1);
  // quay beyond the east fence: concrete edge + dark harbour water + bollards
  add(M.cracked, scaleUV(new THREE.PlaneGeometry(10, 130).rotateX(-Math.PI / 2), 4, 40), E + 5, 0.01, 0);
  add(M.concrete, tbox(0.6, 1.5, 130, 2), E + 10, -0.75, 0);
  for (let i = 0; i < 9; i++) add(M.rust, new THREE.CylinderGeometry(0.25, 0.3, 0.7, 10), E + 9.2, 0.35, -56 + i * 14);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x06090d, roughness: 0.12, metalness: 0.6, envMapIntensity: 1.5 }));
  water.position.set(E + 210, -1.4, 0); water.receiveShadow = false; water.userData.surface = 'water'; world.scene.add(water); world.ctx.raycastTargets.push(water);
  world.water = water;
  // extra outer blockers so the player can never leave the yard
  world.box([-70, 0, E + 0.4], [70, 6, E + 3]); world.box([E + 0.4, 0, -70], [E + 3, 6, 70]);
}

// ============================================================================
function buildCrane(world, M, add, solidBox) {
  const { z, x0, x1, h } = CRANE;
  // rubber-tyred gantry: two portal legs, two girders, trolley, spreader on cables, cab, beacon
  for (const lx of [x0, x1]) {
    for (const lz of [z - 3, z + 3]) { solidBox(M.steelYellow, 0.9, h, 0.9, lx, h / 2, lz, 2, 'metal'); }
    solidBox(M.steelYellow, 1.4, 1.4, 9, lx, 1.4, z, 2, 'metal'); // bogie
    for (const wz of [z - 3.2, z + 3.2]) for (const s of [-1, 1]) add(M.rust, new THREE.CylinderGeometry(0.8, 0.8, 0.7, 14).rotateZ(Math.PI / 2), lx + s * 0.9, 0.8, wz);
    add(M.steelYellow, tbox(0.9, 0.9, 7, 2), lx, h - 1.5, z); // top cross
    add(M.steelYellow, tbox(0.4, 0.4, 7.5, 1), lx, h * 0.5, z, 0, 0.7, 0); // diagonal brace
    add(M.steelYellow, tbox(0.4, 0.4, 7.5, 1), lx, h * 0.5, z, 0, -0.7, 0);
    for (let i = 0; i < 12; i++) add(M.steel, tbox(0.4, 0.03, 0.03, 1), lx + 0.65, 1.5 + i * 1.3, z - 3); // ladder rungs
  }
  for (const gz of [z - 1.6, z + 1.6]) add(M.steelYellow, tbox(x1 - x0 + 3, 1.6, 1.1, 2.5), (x0 + x1) / 2, h, gz);
  world.box([x0 - 1.5, h - 0.8, z - 2.2], [x1 + 1.5, h + 0.8, z + 2.2]);
  const tx = 30; add(M.steel, tbox(4, 1.6, 4.6, 2), tx, h + 1.6, z); // trolley
  add(M.steel, tbox(2.2, 1.8, 2.2, 1.5), tx - 3.5, h - 2.0, z - 3.2); // operator cab
  add(M.glass, new THREE.PlaneGeometry(2.0, 1.2), tx - 3.5, h - 2.0, z - 4.31, Math.PI);
  const sy = 9.5; // spreader height
  for (const cxo of [-1.8, 1.8]) for (const czo of [-0.9, 0.9]) add(M.steel, new THREE.CylinderGeometry(0.03, 0.03, h - sy, 4), tx + cxo, (h + sy) / 2, z + czo);
  add(M.steelYellow, tbox(12.2, 0.6, 2.44, 2), tx, sy, z); // spreader
  add(M.steelYellow, tbox(2.5, 1.2, 2.44, 2), tx, sy + 0.9, z);
  world.crane = { beacons: [[x0, h + 1.0, z - 3], [x1, h + 1.0, z + 3], [tx, h + 2.8, z]] };
  for (const lx of [x0, x1]) { world.cover(lx + 1.6, z, 1, 0); world.cover(lx - 1.6, z, -1, 0); }
}

// ============================================================================
function buildPlaza(world, M, add, solidBox) {
  // jersey barriers (procedural extruded profile) in a broken line across the plaza + near spawn
  const prof = new THREE.Shape(); prof.moveTo(-0.4, 0); prof.lineTo(0.4, 0); prof.lineTo(0.4, 0.12); prof.lineTo(0.14, 0.55); prof.lineTo(0.11, 0.95); prof.lineTo(-0.11, 0.95); prof.lineTo(-0.14, 0.55); prof.lineTo(-0.4, 0.12); prof.closePath();
  const jb = BGU.mergeVertices(new THREE.ExtrudeGeometry(prof, { depth: 3, bevelEnabled: false })); jb.translate(0, 0, -1.5); jb.rotateY(Math.PI / 2); // length along x
  scaleUV(jb, 0.5, 0.5);
  const spots = [[-4, -18, 0.2], [-1, -19.5, 0.1], [8, 12, 1.4], [8.2, 15.2, 1.5], [-14, 26, 0.05], [-10.8, 26.3, -0.1], [-6, 40, 1.6], [16, 48, 0.3], [-30, -8, 1.2], [-30, -4.8, 1.3], [26, -46, 0], [29.2, -46.2, 0.05], [50, 2, 1.55], [50.1, 5.2, 1.6]];
  for (const [x, zz, ry] of spots) {
    const g = jb.clone(); g.applyMatrix4(new THREE.Matrix4().makeRotationY(ry)); g.translate(x, 0, zz); add(M.cracked, g);
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry)); const ex = (3 * c + 0.8 * s) / 2, ez = (3 * s + 0.8 * c) / 2;
    world.box([x - ex, 0, zz - ez], [x + ex, 0.95, zz + ez]);
    const nx = Math.sin(ry), nz = Math.cos(ry);
    world.cover(x + nx * 1.1, zz + nz * 1.1, nx, nz); world.cover(x - nx * 1.1, zz - nz * 1.1, -nx, -nz);
  }
  // cable spools (wood) and pallet stacks
  const spool = (x, zz, r, w, ry) => {
    const g = BGU.mergeGeometries([
      new THREE.CylinderGeometry(r, r, 0.12, 20).translate(0, w / 2, 0),
      new THREE.CylinderGeometry(r, r, 0.12, 20).translate(0, -w / 2, 0),
      new THREE.CylinderGeometry(r * 0.45, r * 0.45, w, 16),
    ], false);
    g.rotateZ(Math.PI / 2); g.rotateY(ry); g.translate(x, r, zz); add(M.rust, g); // rust mat reads as dark wood at night
    world.box([x - r, 0, zz - r], [x + r, 2 * r, zz + r]); world.cover(x, zz + r + 0.8, 0, 1); world.cover(x, zz - r - 0.8, 0, -1);
  };
  spool(-8, 4, 0.9, 0.9, 0.4); spool(-9.5, 6.2, 0.7, 0.8, 1.1); spool(-40, 26, 1.0, 1.0, 0.2); spool(48, -30, 0.8, 0.8, 0.9);
  const pallet = (x, zz, n, ry) => {
    const g = tbox(1.2, 0.15 * n, 0.8, 1); g.applyMatrix4(new THREE.Matrix4().makeRotationY(ry)); g.translate(x, 0.075 * n, zz); add(M.rust, g);
    world.box([x - 0.7, 0, zz - 0.7], [x + 0.7, 0.15 * n, zz + 0.7]);
  };
  pallet(-11, -4, 8, 0.1); pallet(-12.4, -4.2, 5, 0.3); pallet(-10, -20, 12, 1.5); pallet(-12, -44, 10, 0.2); pallet(-12, -36, 6, 0.1); pallet(38, 6, 9, 0.7); pallet(12, 46, 7, 0.2);
  pallet(-44, -14, 11, 0.3); pallet(-45.5, -13.6, 4, 0.5);
  // drainage grates (steel grid) set into the asphalt
  for (const [x, zz] of [[-2, 16], [14, -12], [28, 30], [-30, 20], [-6, -30], [40, -20], [-40, 6]]) {
    add(M.grid, scaleUV(new THREE.PlaneGeometry(0.8, 0.5).rotateX(-Math.PI / 2), 2, 1.2), x, 0.012, zz);
  }
  // rusted pipe run along the north wall behind the yard + manhole covers
  for (let i = 0; i < 2; i++) add(M.rust, new THREE.CylinderGeometry(0.2 - i * 0.06, 0.2 - i * 0.06, 100, 8).rotateZ(Math.PI / 2), 5, 1.6 + i * 0.5, -57.4);
  for (const [x, zz] of [[6, 20], [-24, -8], [20, 8]]) add(M.rust, new THREE.CylinderGeometry(0.45, 0.45, 0.03, 16), x, 0.015, zz);
}
