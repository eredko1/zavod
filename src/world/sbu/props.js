// SBU props: instanced trees (planes/oaks + pines), lampposts with banners, benches, bins, bollards, bike racks, hoop fences, hedges, cars, buses, bus shelter, fountain jet, sculpture. SBU agent.
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { Batch, boxGeo, circlePts } from './geo.js';
import { leafTexture, signTexture } from './mats.js';
import { hedgeRow } from './detail.js';
import { BOUNDS, MALL, LIB, LIB_LAWN, SAC, PLAZA_C, BUS_LOOP, FREY, PSY, PIT, FOUNTAIN, POND, EAST_LAWN, ENG_DRIVE, STALLER, CHEM, HARRIMAN, ESS, ECC, ENG, HUM, ZEBRA } from './layout.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

/** Instance a geometry+material for placements [{x,y,z,ry,s}] → InstancedMesh (raycast target). */
function inst(world, geo, mat, places, surface, { shadow = true, collide = null, name = 'inst' } = {}) {
  const { ctx, scene } = world;
  if (!places.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, places.length);
  for (let i = 0; i < places.length; i++) {
    const p = places[i]; _e.set(0, p.ry ?? 0, 0); _q.setFromEuler(_e); _p.set(p.x, p.y ?? 0, p.z); const s = p.s ?? 1; _s.set(s, p.sy ?? s, s);
    im.setMatrixAt(i, _m.compose(_p, _q, _s));
    if (p.color) im.setColorAt(i, p.color);
    if (collide) { const c = collide(p); if (c) ctx.colliders.push(c); }
  }
  im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = shadow; im.receiveShadow = shadow; im.userData.surface = surface; im.name = 'sbu:' + name; im.frustumCulled = true;
  im.computeBoundingSphere?.();
  scene.add(im); ctx.raycastTargets.push(im);
  return im;
}

function merge(list) { const g = BGU.mergeGeometries(list.map(x => x.index ? x.toNonIndexed() : x), false); for (const x of list) x.dispose(); return g; }

export function buildProps(world, M) {
  const { ctx, scene, R, W } = world;
  const B = new Batch(world, M, 'props');
  const j = (a) => (R() - 0.5) * a;
  const aoSpots = []; W.sbuAOSpots = aoSpots;          // radial contact shadows, baked by detail.js
  const ao = (x, z, r, y = 0) => aoSpots.push({ x, y, z, r });

  // ---- trees --------------------------------------------------------------------------------------------------------------------
  const leafDec = leafTexture(R), leafPine = leafTexture(R, { pine: true });
  const canopyMat = new THREE.MeshStandardMaterial({ map: leafDec.map, alphaMap: leafDec.alphaMap, color: 0xb8cc88, roughness: 1, metalness: 0, alphaTest: 0.42, side: THREE.DoubleSide, envMapIntensity: 0.5, name: 'canopy' });
  const pineMat = new THREE.MeshStandardMaterial({ map: leafPine.map, alphaMap: leafPine.alphaMap, color: 0x84a06a, roughness: 1, metalness: 0, alphaTest: 0.42, side: THREE.DoubleSide, envMapIntensity: 0.45, name: 'pine' });
  // deciduous: trunk + 3 lumpy spheres
  // deciduous species: plane (tall, open), oak (wide, low), maple (round, dense) — trunk + 1st/2nd-order branches, lumpy canopy
  const treeGeo = (trunkH, trunkR, branches) => {
    const parts = []; const trunk = new THREE.CylinderGeometry(trunkR * 0.6, trunkR, trunkH, 8); trunk.translate(0, trunkH / 2, 0); parts.push(trunk);
    for (const [ang, tilt, len, y] of branches) {
      const b = new THREE.CylinderGeometry(trunkR * 0.28, trunkR * 0.5, len, 6); b.translate(0, len / 2, 0); b.rotateZ(tilt); b.rotateY(ang); b.translate(0, y, 0); parts.push(b);
      for (const s2 of [-0.5, 0.55]) { const b2 = new THREE.CylinderGeometry(trunkR * 0.12, trunkR * 0.26, len * 0.6, 5); b2.translate(0, len * 0.3, 0); b2.rotateZ(tilt + s2); b2.rotateY(ang + s2 * 0.4); const ex = Math.sin(tilt) * len * 0.7, ey = Math.cos(tilt) * len * 0.7; b2.translate(Math.cos(ang) * ex, y + ey, -Math.sin(ang) * ex); parts.push(b2); }
    }
    return merge(parts);
  };
  const canopy = (blobs, yScale = 0.82) => { const parts = []; for (const [x, y, z, r] of blobs) { const s = new THREE.SphereGeometry(r, 9, 7); s.scale(1, yScale, 1); s.translate(x, y, z); parts.push(s); } const g = merge(parts); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 3); return g; };
  const species = [
    { trunk: treeGeo(5.6, 0.27, [[0.3, 0.55, 3.4, 5.0], [2.4, 0.5, 3.2, 5.3], [4.3, 0.6, 3.0, 4.8], [1.4, 0.25, 3.6, 5.6]]), leaf: canopy([[0, 8.2, 0, 3.2], [2.2, 7.3, 0.6, 2.5], [-2.0, 7.5, -1.0, 2.4], [0.5, 6.8, 2.3, 2.1], [-0.8, 7.0, -2.4, 2.0], [0.2, 9.6, 0.3, 2.0]], 0.8) },   // plane
    { trunk: treeGeo(3.6, 0.36, [[0.2, 0.9, 3.6, 3.0], [1.8, 0.85, 3.8, 3.2], [3.4, 0.95, 3.4, 2.9], [5.0, 0.8, 3.6, 3.3], [2.6, 0.3, 3.0, 3.6]]), leaf: canopy([[0, 6.4, 0, 4.2], [3.2, 5.6, 1.0, 3.0], [-3.0, 5.9, -1.4, 2.9], [0.8, 5.4, 3.4, 2.7], [-1.2, 5.6, -3.4, 2.6], [2.0, 7.6, -1.5, 2.4]], 0.7) },   // oak
    { trunk: treeGeo(4.2, 0.24, [[0.6, 0.45, 2.8, 3.8], [2.7, 0.5, 2.6, 4.0], [4.6, 0.4, 2.8, 3.7]]), leaf: canopy([[0, 6.6, 0, 3.0], [1.6, 5.9, 0.9, 2.3], [-1.5, 6.1, -1.1, 2.2], [0.3, 5.6, 1.9, 1.9], [-0.5, 8.0, 0, 2.0]], 0.95) },   // maple
  ];
  const pineTrunk = (() => { const t = new THREE.CylinderGeometry(0.14, 0.3, 9, 7); t.translate(0, 4.5, 0); return t; })();
  const pineGeo = (() => {
    const parts = [];
    for (const [y, r, h] of [[3.2, 3.0, 4.2], [5.8, 2.4, 3.8], [8.2, 1.7, 3.4], [10.3, 1.0, 2.6]]) { const c = new THREE.ConeGeometry(r, h, 9, 1, true); c.translate(0, y + h / 2, 0); parts.push(c); }
    const g = merge(parts); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 2); return g;
  })();

  const dec = [[], [], []], pines = [];
  const tree = (x, z, s = 1, kind = 'dec') => {
    const sp = kind === 'pine' ? -1 : (kind === 'oak' ? 1 : kind === 'maple' ? 2 : kind === 'plane' ? 0 : (R() * 3) | 0);
    const p = { x, z, ry: R() * Math.PI * 2, s: s * (0.8 + R() * 0.4), color: new THREE.Color().setHSL(sp === 2 ? 0.16 + R() * 0.08 : 0.22 + R() * 0.07, 0.35 + R() * 0.2, 0.34 + R() * 0.12) };
    (sp < 0 ? pines : dec[sp]).push(p);
    ctx.colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.3, 0, z - 0.3), new THREE.Vector3(x + 0.3, 5, z + 0.3)));
    if (Math.abs(x) < 230 && z > -250 && z < 210) ao(x, z, (sp < 0 ? 2.0 : 3.1) * p.s, W.groundHeight(x, z));
  };
  // mall rows (both sides), library lawn, plaza ring, east lawn, Staller terraces edges, perimeter belts
  for (let x = -100; x < 190; x += 12) { if (!(x > 120 && x < 152)) tree(x + j(1.5), MALL.z1 - 3.4 + j(0.6), 1.0, 'plane'); }
  for (let x = -100; x < 12; x += 12) tree(x + j(1.5), MALL.z0 - 2.5 + j(0.6), 0.95);
  for (let x = LIB.x0 + 8; x < LIB.x1; x += 15) { if (x > LIB.entX0 - 6 && x < LIB.entX1 + 6) continue; tree(x + j(2), LIB_LAWN.z0 + 5.5 + j(1.5), 0.8); }
  for (let x = 80; x < 120; x += 10) tree(x + j(2), MALL.z0 - 4 + j(1.5), 0.95);
  for (let k = 0; k < 14; k++) { const a = k * Math.PI * 2 / 14; if (a > 0.3 && a < 2.9) continue; tree(PLAZA_C.x + Math.cos(a) * (PLAZA_C.r + 4), PLAZA_C.z + Math.sin(a) * (PLAZA_C.r + 4), 1.0); }
  for (let i = 0; i < 22; i++) tree(EAST_LAWN.x0 + 5 + R() * (EAST_LAWN.x1 - EAST_LAWN.x0 - 10), EAST_LAWN.z0 + 8 + R() * (EAST_LAWN.z1 - EAST_LAWN.z0 - 16), 1.05, R() < 0.3 ? 'pine' : 'dec');
  for (let z = PIT.z0 + 8; z < PIT.z1 - 4; z += 9) tree(PIT.x0 + 4 + j(2), z + j(2), 0.9);
  for (let z = -56; z < 8; z += 9) tree(LIB.x0 - 5 + j(1), z + j(2), 0.85);
  for (let z = -40; z < 8; z += 8) tree(-133 + j(1.5), z + j(2), 0.9, 'pine');
  for (let z = 30; z < 120; z += 9) tree(14.5 + j(1), z + j(2), 0.8);
  for (let x = 20; x < 118; x += 9) tree(x + j(2), 84 + j(1.5), 0.9);
  for (let x = 120; x < 176; x += 10) tree(x + j(2), 112 + j(1.5), 0.9, 'pine');
  for (let i = 0; i < 6; i++) tree(-136 + R() * 14, 56 + R() * 18, 0.9, R() < 0.5 ? 'pine' : 'dec');       // between plaza and loop
  for (let i = 0; i < 12; i++) tree(-100 + R() * 40, 100 + R() * 36, 1.0, 'pine');                         // south-west belt
  for (let i = 0; i < 10; i++) tree(-30 + R() * 50, 108 + R() * 30, 1.0, 'pine');                          // south belt (ECC west)
  for (let x = -160; x < -100; x += 8) tree(x + j(2), -146 + j(2), 1.0, 'pine');                            // north-west belt
  for (let x = -164; x > -240; x -= 9) tree(x, -48 + j(3), 1.0, 'pine');                                     // west gap Harriman/ESS
  for (let z = 58; z < 140; z += 8) tree(-163 + j(2), z + j(2), 1.0, 'pine');                               // west edge
  for (let z = -60; z < 140; z += 9) { if (z > -20 && z < 14) continue; tree(178 + j(1.5), z + j(2), 1.0, R() < 0.5 ? 'pine' : 'dec'); } // east edge belt
  for (let x = -260; x < 400; x += 11) tree(x + j(3), -222 + j(4), 1.2, R() < 0.6 ? 'pine' : 'dec');       // beyond Toll Drive
  for (let x = -260; x < 400; x += 12) tree(x + j(3), 262 + j(6), 1.2, R() < 0.6 ? 'pine' : 'dec');        // far south
  for (let z = -220; z < 260; z += 12) tree(-272 + j(4), z + j(3), 1.2, 'pine');                             // far west
  for (let z = -220; z < 260; z += 12) tree(372 + j(4), z + j(3), 1.2, R() < 0.6 ? 'pine' : 'dec');        // far east
  // groves: Zebra Path rows, Frey/Harriman lawns, SAC south woods, Psychology–ECC strip, backdrop forest
  const grove = (x0, z0, x1, z1, n, pineP = 0.5, s = 1.0) => { for (let i = 0; i < n; i++) tree(x0 + R() * (x1 - x0), z0 + R() * (z1 - z0), s, R() < pineP ? 'pine' : 'dec'); };
  for (let z = -108; z < -42; z += 9) { tree(ZEBRA.x - 6.5 + j(0.8), z + j(1.5), 0.85); tree(ZEBRA.x + 6.5 + j(0.8), z + 4 + j(1.5), 0.85); }
  grove(FREY.x0, FREY.z1 + 8, FREY.x1 - 14, MALL.z0 - 4, 7, 0.3, 0.9);
  grove(-160, HARRIMAN.z1 + 8, -128, -20, 10, 0.5);
  grove(-95, 106, 8, 136, 26, 0.6);
  grove(22, 90, 116, 106, 12, 0.3, 0.9);
  grove(LIB.x1 + 8, -146, 146, -142, 0, 0.5);
  grove(-260, -300, 400, -216, 70, 0.6, 1.2);
  grove(-260, 262, 400, 400, 60, 0.6, 1.2);
  grove(-420, -300, -268, 400, 60, 0.7, 1.2);
  grove(380, -300, 520, 400, 50, 0.6, 1.2);
  grove(STALLER.nx0, STALLER.nz0 - 4, STALLER.nx1, STALLER.nz0 - 4, 0, 0.5);
  grove(-118, -140, -100, -60, 8, 0.5, 0.9);
  for (let i = 0; i < 3; i++) { inst(world, species[i].trunk, M.bark, dec[i], 'wood', { name: 'trunks' + i }); inst(world, species[i].leaf, canopyMat, dec[i], 'wood', { name: 'canopy' + i }); }
  inst(world, pineTrunk, M.bark, pines, 'wood', { name: 'pineTrunks' });
  inst(world, pineGeo, pineMat, pines, 'wood', { name: 'pines' });

  // ---- lampposts (silver pole, lantern head, red banners) --------------------------------------------------------------------------
  const lampGeo = (() => {
    const parts = [];
    const base = new THREE.CylinderGeometry(0.22, 0.26, 0.5, 10); base.translate(0, 0.25, 0); parts.push(base);
    const pole = new THREE.CylinderGeometry(0.07, 0.1, 5.4, 10); pole.translate(0, 3.2, 0); parts.push(pole);
    const neck = new THREE.CylinderGeometry(0.12, 0.07, 0.4, 10); neck.translate(0, 6.1, 0); parts.push(neck);
    const arm = new THREE.BoxGeometry(0.06, 0.06, 1.2); arm.translate(0, 4.4, 0.6); parts.push(arm);
    const arm2 = new THREE.BoxGeometry(0.06, 0.06, 1.2); arm2.translate(0, 3.0, 0.6); parts.push(arm2);
    return merge(parts);
  })();
  const headGeo = (() => { const h = new THREE.CylinderGeometry(0.34, 0.26, 0.5, 10); h.translate(0, 6.55, 0); const cap = new THREE.ConeGeometry(0.4, 0.22, 10); cap.translate(0, 6.9, 0); return merge([h, cap]); })();
  const bannerGeo = (() => { const g = new THREE.PlaneGeometry(0.7, 1.7); g.translate(0, 3.7, 0.65); return g; })();
  const lamps = [];
  const lamp = (x, z, ry = 0) => { lamps.push({ x, z, ry }); ctx.colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.25, 0, z - 0.25), new THREE.Vector3(x + 0.25, 6, z + 0.25))); W.lampPositions.push(new THREE.Vector3(x, 6.5, z)); ao(x, z, 0.85, W.groundHeight(x, z)); };
  for (let x = -94; x < 192; x += 24) { if (!(x > 124 && x < 148)) lamp(x, MALL.z1 - 1.0, Math.PI); lamp(x + 12, MALL.z0 + 1.0, 0); }
  for (let k = 0; k < 10; k++) { const a = k * Math.PI * 2 / 10; if (a > 0.5 && a < 2.7) continue; lamp(PLAZA_C.x + Math.cos(a) * 19, PLAZA_C.z + Math.sin(a) * 19, -a + Math.PI / 2); }
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; lamp(BUS_LOOP.x + Math.cos(a) * (BUS_LOOP.r + 6.5), BUS_LOOP.z + Math.sin(a) * (BUS_LOOP.r + 6.5), -a - Math.PI / 2); }
  for (let z = -100; z < -40; z += 20) lamp(ZEBRA.x - 5.2, z, Math.PI / 2);
  for (let z = -134; z < -64; z += 17) lamp(144.2, z, Math.PI / 2);      // pit floor: against the arts-centre face, clear of the `steps` sight line
  for (let z = 20; z < 110; z += 18) lamp(118.2, z, -Math.PI / 2);
  for (let z = 20; z < 110; z += 18) lamp(171.5, z, Math.PI / 2);
  for (let z = -40; z < 8; z += 16) lamp(LIB.x0 - 7.5, z, Math.PI / 2);
  for (let x = 24; x < 118; x += 24) lamp(x, 86.5, 0);
  for (let z = 118; z < 140; z += 12) { lamp(ENG_DRIVE.x0 - 2, z, Math.PI / 2); }
  // lawn-edge lamps: the arts-centre terraces, the south lecture-hall lawn and the arts & culture forecourt
  for (let z = -134; z < -60; z += 18) lamp(PIT.x0 - 3.2, z, -Math.PI / 2);                       // top of the terraces
  for (let x = 124; x < 178; x += 18) lamp(x, 137, 0);                                             // south lawn walk
  for (let x = 126; x < 176; x += 22) lamp(x, 113.5, Math.PI);
  for (const [lx, lz] of [[219, -104], [253, -104], [219, -128], [253, -128]]) lamp(lx, lz, Math.PI);   // arts & culture forecourt
  for (const l of lamps) l.y = W.groundHeight(l.x, l.z);
  inst(world, lampGeo, M.alu, lamps, 'metal', { name: 'lamps' });
  inst(world, headGeo, M.lampHead, lamps, 'metal', { name: 'lampHeads' });
  inst(world, bannerGeo, M.banner, lamps.filter((l, i) => i % 2 === 0), 'wood', { name: 'banners', shadow: false });

  // ---- benches (black steel slats on steel legs), bins, bollards, bike racks, hoop fences ----------------------------------------
  const benchGeo = (() => {
    const parts = [];
    for (let i = 0; i < 6; i++) { const s = new THREE.BoxGeometry(1.8, 0.03, 0.06); s.translate(0, 0.45, -0.22 + i * 0.09); parts.push(s); }
    for (let i = 0; i < 5; i++) { const s = new THREE.BoxGeometry(1.8, 0.06, 0.03); s.translate(0, 0.55 + i * 0.09, 0.28 + i * 0.03); parts.push(s); }
    for (const x of [-0.8, 0.8]) { const leg = new THREE.BoxGeometry(0.05, 0.45, 0.6); leg.translate(x, 0.225, 0.05); parts.push(leg); const bk = new THREE.BoxGeometry(0.05, 0.5, 0.05); bk.translate(x, 0.7, 0.34); parts.push(bk); }
    return merge(parts);
  })();
  const benches = [];
  const bench = (x, z, ry = 0) => { benches.push({ x, z, ry, y: W.groundHeight(x, z) }); const b = new THREE.Box3(new THREE.Vector3(x - 1, 0, z - 0.5), new THREE.Vector3(x + 1, 0.9, z + 0.5)); ctx.colliders.push(b); ao(x, z, 1.35, W.groundHeight(x, z)); world.cover(x + Math.sin(ry) * 0.9, z + Math.cos(ry) * 0.9, Math.sin(ry), Math.cos(ry)); };
  for (let x = -94; x < 190; x += 12) { if (x > 118 && x < 154) continue; bench(x + 6, MALL.z1 - 1.1, Math.PI); if (x < 10 || x > 76) bench(x + 3, MALL.z0 + 1.4, 0); }
  for (let x = LIB.x0 + 10; x < LIB.x1 - 6; x += 16) bench(x, LIB_LAWN.z1 - 0.9, 0);
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + 0.4; if (a > 0.5 && a < 2.7) continue; bench(PLAZA_C.x + Math.cos(a) * 20.5, PLAZA_C.z + Math.sin(a) * 20.5, -a - Math.PI / 2); }
  for (let z = -120; z < -70; z += 16) bench(PIT.floorX0 + 3, z, -Math.PI / 2);
  for (let z = 24; z < 108; z += 20) { bench(121, z, -Math.PI / 2); bench(169, z + 8, Math.PI / 2); }
  for (let z = -95; z < -45; z += 18) bench(ZEBRA.x - 5.6, z, Math.PI / 2);
  for (let x = 30; x < 116; x += 22) bench(x, 85.5, Math.PI);
  bench(FOUNTAIN.x - 12, FOUNTAIN.z - 8, 0.8); bench(FOUNTAIN.x + 12, FOUNTAIN.z - 8, -0.8);
  for (let z = -130; z < -66; z += 14) bench(PIT.x0 - 4.6, z, -Math.PI / 2);                       // above the terraces
  for (let x = 92; x < 130; x += 13) bench(x, PIT.z1 + 2.6, 0);                                     // terrace south rim
  for (let x = 124; x < 176; x += 13) bench(x, 135.4, Math.PI);                                     // south lawn
  for (let x = 128; x < 172; x += 15) bench(x, 114.6, 0);
  for (const [bx, bz, br] of [[216, -100, 0], [228, -100, 0], [248, -100, 0], [260, -100, 0], [212, -118, Math.PI / 2], [262, -118, -Math.PI / 2]]) bench(bx, bz, br);
  inst(world, benchGeo, M.bench, benches, 'wood', { name: 'benches' });

  const binGeo = (() => { const g = new THREE.CylinderGeometry(0.34, 0.3, 1.0, 12, 1, true); g.translate(0, 0.5, 0); const lid = new THREE.CylinderGeometry(0.37, 0.37, 0.08, 12); lid.translate(0, 1.02, 0); return merge([g, lid]); })();
  const bins = [], binsB = [];
  const bin = (x, z, blue = false) => { (blue ? binsB : bins).push({ x, z, y: W.groundHeight(x, z), ry: R() * 6 }); ctx.colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.36, 0, z - 0.36), new THREE.Vector3(x + 0.36, 1.05, z + 0.36))); ao(x, z, 0.72, W.groundHeight(x, z)); };
  for (let x = -90; x < 190; x += 24) { if (x > 118 && x < 154) continue; bin(x + 1.5, MALL.z1 - 1.6); bin(x + 2.3, MALL.z1 - 1.6, true); }
  bin(LIB.entX1 + 3, LIB.z1 + 1.2); bin(LIB.entX1 + 3.8, LIB.z1 + 1.2, true); bin(SAC.x0 - 5.5, SAC.z0 + 22, true); bin(SAC.x0 - 5.5, SAC.z0 + 7); bin(PIT.floorX0 + 2, PIT.z0 + 34, true); bin(121.5, 40); bin(121.5, 40.9, true);
  for (const [bx, bz] of [[PIT.x0 - 4.6, -120], [PIT.x0 - 4.6, -86], [100, PIT.z1 + 2.6], [126, PIT.z1 + 2.6], [130, 135.4], [156, 135.4], [134, 114.6], [222, -100], [254, -100], [BUS_LOOP.x + 3.2, BUS_LOOP.z - 9.4]]) { bin(bx, bz); bin(bx + 0.85, bz, true); }
  inst(world, binGeo, M.binGreen, bins, 'metal', { name: 'bins' }); inst(world, binGeo, M.binBlue, binsB, 'metal', { name: 'binsBlue' });
  // blue-light emergency phones
  const phoneGeo = (() => { const p = new THREE.CylinderGeometry(0.09, 0.11, 2.6, 8); p.translate(0, 1.3, 0); const bx = new THREE.BoxGeometry(0.34, 0.5, 0.22); bx.translate(0, 1.25, 0.12); const cap = new THREE.CylinderGeometry(0.12, 0.12, 0.3, 8); cap.translate(0, 2.75, 0); return merge([p, bx, cap]); })();
  const phones = [[-60, 14], [20, -16], [90, 14], [-35, -60], [122, -20], [-100, 62], [60, 78], [PIT.floorX0 + 3, -66]].map(([x, z]) => ({ x, z, y: W.groundHeight(x, z), ry: R() * 6 }));
  for (const p of phones) ctx.colliders.push(new THREE.Box3(new THREE.Vector3(p.x - 0.2, 0, p.z - 0.2), new THREE.Vector3(p.x + 0.2, 2.9, p.z + 0.2)));
  inst(world, phoneGeo, M.busBlue, phones, 'metal', { name: 'phones' });
  const phoneLight = (() => { const s = new THREE.SphereGeometry(0.13, 8, 6); s.translate(0, 2.95, 0); return s; })();
  inst(world, phoneLight, new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x2255ff, emissiveIntensity: 2.5, name: 'blueLight' }), phones, 'metal', { name: 'phoneLights', shadow: false });

  // bollards at the SAC front and the bus loop
  const bolGeo = (() => { const g = new THREE.CylinderGeometry(0.11, 0.13, 1.0, 10); g.translate(0, 0.5, 0); return g; })();
  const bols = [];
  const bol = (x, z) => { bols.push({ x, z, y: W.groundHeight(x, z) }); ctx.colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.14, 0, z - 0.14), new THREE.Vector3(x + 0.14, 1, z + 0.14))); };
  for (let z = SAC.z0 - 2; z < SAC.z1 + 2; z += 1.6) bol(SAC.x0 - 6.2, z);
  for (let k = 0; k < 40; k++) { const a = k * Math.PI * 2 / 40; bol(BUS_LOOP.x + Math.cos(a) * (BUS_LOOP.r + BUS_LOOP.w / 2 + 0.6), BUS_LOOP.z + Math.sin(a) * (BUS_LOOP.r + BUS_LOOP.w / 2 + 0.6)); }
  for (let x = MALL.x0 + 1; x < MALL.x0 + 3; x += 1.6) for (let z = MALL.z0 + 1; z < MALL.z1; z += 1.8) bol(x, z);
  for (let x = 122; x < 178; x += 2.2) bol(x, 139.2);                                               // south lawn edge
  for (let z = -124; z < -70; z += 2.4) bol(PIT.x0 - 6.4, z);                                        // terrace top walk
  for (let x = 208; x < 268; x += 2.4) bol(x, -95.5);                                                // arts & culture forecourt edge
  inst(world, bolGeo, M.steelDark, bols, 'metal', { name: 'bollards' });

  // bike racks (inverted-U hoops) near the SAC and library entrance
  const rackGeo = (() => { const t = new THREE.TorusGeometry(0.4, 0.03, 6, 12, Math.PI); t.translate(0, 0.45, 0); const l1 = new THREE.CylinderGeometry(0.03, 0.03, 0.45, 6); l1.translate(-0.4, 0.225, 0); const l2 = l1.clone(); l2.translate(0.8, 0, 0); return merge([t, l1, l2]); })();
  const racks = [];
  const rackRow = (x, z, n, ry) => { for (let i = 0; i < n; i++) racks.push({ x: x + Math.cos(ry) * i * 0.9, z: z - Math.sin(ry) * i * 0.9, ry, y: W.groundHeight(x, z) }); ctx.colliders.push(new THREE.Box3(new THREE.Vector3(Math.min(x, x + Math.cos(ry) * n * 0.9) - 0.5, 0, Math.min(z, z - Math.sin(ry) * n * 0.9) - 0.5), new THREE.Vector3(Math.max(x, x + Math.cos(ry) * n * 0.9) + 0.5, 0.9, Math.max(z, z - Math.sin(ry) * n * 0.9) + 0.5))); world.cover(x + Math.cos(ry) * n * 0.45, z - Math.sin(ry) * n * 0.45 + 1.0, 0, 1); };
  rackRow(SAC.x0 - 8, SAC.z0 + 40, 8, Math.PI / 2); rackRow(LIB.entX1 + 8, LIB.z1 + 1.5, 7, 0); rackRow(LIB.entX0 - 14, LIB.z1 + 1.5, 7, 0); rackRow(FREY.x1 - 20, FREY.z1 + 8, 6, 0); rackRow(PSY.x0 + 6, PSY.z0 - 2.4, 6, 0);
  rackRow(126, 133.5, 7, 0); rackRow(160, 133.5, 6, 0); rackRow(PIT.x0 - 8.5, -112, 6, Math.PI / 2); rackRow(214, -98.5, 6, 0);
  inst(world, rackGeo, M.steel, racks, 'metal', { name: 'racks' });

  // low hoop fence around the library lawn and the mall tree strips (steel, thin)
  const hoopGeo = (() => { const t = new THREE.TorusGeometry(0.36, 0.018, 5, 10, Math.PI); t.translate(0, 0.32, 0); const p1 = new THREE.CylinderGeometry(0.018, 0.018, 0.32, 5); p1.translate(-0.36, 0.16, 0); const p2 = p1.clone(); p2.translate(0.72, 0, 0); return merge([t, p1, p2]); })();
  const hoops = [];
  const hoopLine = (x0, z0, x1, z1) => { const n = Math.floor(Math.hypot(x1 - x0, z1 - z0) / 0.74); const ry = Math.atan2(-(z1 - z0), x1 - x0); for (let i = 0; i < n; i++) hoops.push({ x: x0 + (x1 - x0) * (i + 0.5) / n, z: z0 + (z1 - z0) * (i + 0.5) / n, ry, y: 0 }); };
  hoopLine(LIB.x0 + 2, LIB_LAWN.z1 - 0.3, LIB.entX0 - 2.5, LIB_LAWN.z1 - 0.3); hoopLine(LIB.entX1 + 2.5, LIB_LAWN.z1 - 0.3, LIB.x1 - 4, LIB_LAWN.z1 - 0.3);
  hoopLine(EAST_LAWN.x0 + 0.5, EAST_LAWN.z0 + 4, EAST_LAWN.x0 + 0.5, EAST_LAWN.z1 - 6); hoopLine(EAST_LAWN.x0 + 1, EAST_LAWN.z0 + 4.3, EAST_LAWN.x1 - 5, EAST_LAWN.z0 + 4.3);
  hoopLine(PLAZA_C.x - 32, PLAZA_C.z + 20, PLAZA_C.x - 32, PLAZA_C.z + 34);
  inst(world, hoopGeo, M.steelDark, hoops, 'metal', { name: 'hoops', shadow: false });

  // ---- hedges + perimeter fences (closing gaps between buildings at the bounds) ------------------------------------------------------
  // real hedge rows: 1 m tall x 0.8 m deep foliage mesh with a noise-displaced top and gaps at the paths
  const hedge = (x0, z0, x1, z1, h = 1.05, gaps = []) => {
    const horiz = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const ax0 = horiz ? Math.min(x0, x1) : cx, az0 = horiz ? cz : Math.min(z0, z1);
    const ax1 = horiz ? Math.max(x0, x1) : cx, az1 = horiz ? cz : Math.max(z0, z1);
    hedgeRow(B, world, ax0, az0, ax1, az1, { h, d: 0.8, gaps });
    const L = Math.hypot(ax1 - ax0, az1 - az0);
    for (let t = 6; t < L - 4; t += 14) ao(ax0 + (ax1 - ax0) * t / L, az0 + (az1 - az0) * t / L, 1.1);
  };
  const fence = (x0, z0, x1, z1, h = 2.2) => { // chain-link style: posts + thin dark panel
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 3));
    for (let i = 0; i <= n; i++) B.cyl('steelDark', x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, 0, h, 0.04, 6);
    B.box('steelDark', [Math.min(x0, x1) - 0.02, h - 0.05, Math.min(z0, z1) - 0.02], [Math.max(x0, x1) + 0.02, h, Math.max(z0, z1) + 0.02], { collide: false });
    world.box([Math.min(x0, x1) - 0.1, 0, Math.min(z0, z1) - 0.1], [Math.max(x0, x1) + 0.1, h, Math.max(z0, z1) + 0.1]);
  };
  hedge(-150, -146, -117, -144.6);  fence(-150, -146.5, -117, -146.5);                     // NW gap north of Frey → Chemistry
  hedge(LIB.x1, -147, STALLER.nx0, -145.6); fence(LIB.x1, -147.5, STALLER.nx0, -147.5);    // library / Staller passage
  hedge(-165, HARRIMAN.z1, -164, ESS.z0 - 2); fence(-162, HARRIMAN.z1 + 1, -162, ESS.z0 - 2); // west gap Harriman / ESS
  hedge(-165, ESS.z1 + 2, -164, BUS_LOOP.z - 8); hedge(-165, BUS_LOOP.z + 8, -164, BOUNDS.z1);  // west edge beside Campus Drive
  fence(-162, ESS.z1 + 2, -162, BUS_LOOP.z - 8); fence(-162, BUS_LOOP.z + 8, -162, BOUNDS.z1);
  hedge(-165, BOUNDS.z1 - 1, ENG.x0 - 1, BOUNDS.z1); fence(-160, BOUNDS.z1 - 2, ENG.x0 - 1, BOUNDS.z1 - 2);   // south-west edge
  hedge(ENG.x1 + 1, BOUNDS.z1 - 1, ENG_DRIVE.x0 - 3.5, BOUNDS.z1); fence(ENG.x1 + 1, BOUNDS.z1 - 2, ENG_DRIVE.x0 - 3.5, BOUNDS.z1 - 2);
  hedge(ENG_DRIVE.x1 + 3.5, BOUNDS.z1 - 1, ECC.x0 - 1, BOUNDS.z1); fence(ENG_DRIVE.x1 + 3.5, BOUNDS.z1 - 2, ECC.x0 - 1, BOUNDS.z1 - 2);
  hedge(ECC.x1 + 1, BOUNDS.z1 - 1.2, BOUNDS.x1, BOUNDS.z1 - 1.2, 1.05, [[16, 20], [38, 42], [54, 57]]); fence(ECC.x1 + 1, BOUNDS.z1 - 2, BOUNDS.x1, BOUNDS.z1 - 2);  // south-east
  hedge(BOUNDS.x1 - 1, HUM.z1 + 1, BOUNDS.x1, BOUNDS.z1); fence(BOUNDS.x1 - 2, HUM.z1 + 1, BOUNDS.x1 - 2, BOUNDS.z1);  // east edge south of Humanities
  hedge(BOUNDS.x1 - 1, MALL.z1 + 2, BOUNDS.x1, HUM.z0 - 1); fence(BOUNDS.x1 - 2, MALL.z1 + 2, BOUNDS.x1 - 2, HUM.z0 - 1);
  hedge(BOUNDS.x1 - 1, STALLER.ez1 + 1, BOUNDS.x1, MALL.z0 - 2); fence(BOUNDS.x1 - 2, STALLER.ez1 + 1, BOUNDS.x1 - 2, MALL.z0 - 2);   // east edge north of the mall
  hedge(STALLER.ex1 + 0.5, -150, BOUNDS.x1, -148.6); fence(STALLER.ex1 + 0.5, -150.5, BOUNDS.x1, -150.5);
  // mall east end: planters + low wall closing the Admin forecourt (bounds), gate posts
  B.box('concreteGrey', [BOUNDS.x1 - 1.5, 0, MALL.z0 - 2], [BOUNDS.x1 - 0.5, 0.9, MALL.z1 + 2]);
  for (let z = MALL.z0; z < MALL.z1; z += 4) B.box('ivy', [BOUNDS.x1 - 1.45, 0.9, z + 0.2], [BOUNDS.x1 - 0.55, 1.15, z + 3.6], { collide: false });
  // Campus Drive road end: barrier at the west edge
  for (const z of [BUS_LOOP.z - 2.5, BUS_LOOP.z + 2.5]) { B.box('paint', [BOUNDS.x0 - 1.2, 0.6, z - 1.8], [BOUNDS.x0 - 0.9, 1.0, z + 1.8]); B.box('red', [BOUNDS.x0 - 1.2, 0.75, z - 1.8], [BOUNDS.x0 - 0.89, 0.85, z + 1.8], { collide: false }); }
  B.box('steelDark', [BOUNDS.x0 - 1.5, 0, BUS_LOOP.z - 6], [BOUNDS.x0 - 0.5, 1.1, BUS_LOOP.z + 6]);
  // Engineering Drive road end: gate arm
  B.box('paint', [ENG_DRIVE.x0 - 0.5, 0.95, BOUNDS.z1 - 1.6], [ENG_DRIVE.x1 + 0.5, 1.05, BOUNDS.z1 - 1.4], { collide: false });
  world.box([ENG_DRIVE.x0 - 1, 0, BOUNDS.z1 - 2], [ENG_DRIVE.x1 + 1, 1.2, BOUNDS.z1 - 1]);

  // ---- vehicles: buses at the loop, cars along Campus Drive / Engineering Drive --------------------------------------------------------
  const carBody = (() => {
    const parts = [];
    const b = new THREE.BoxGeometry(4.4, 0.65, 1.85); b.translate(0, 0.62, 0); parts.push(b);
    const c = new THREE.BoxGeometry(2.4, 0.6, 1.65); c.translate(-0.15, 1.24, 0); parts.push(c);
    return merge(parts);
  })();
  const carGlass = (() => { const c = new THREE.BoxGeometry(2.2, 0.5, 1.7); c.translate(-0.15, 1.24, 0); return c; })();
  const carWheels = (() => { const parts = []; for (const [x, z] of [[-1.4, -0.85], [1.4, -0.85], [-1.4, 0.85], [1.4, 0.85]]) { const w = new THREE.CylinderGeometry(0.33, 0.33, 0.22, 12); w.rotateX(Math.PI / 2); w.translate(x, 0.33, z); parts.push(w); } return merge(parts); })();
  const carCols = [0x2b2f36, 0xd8d8d4, 0x8d1c22, 0x2d4a7a, 0x6d7075, 0xe6e6e3, 0x3d3f42, 0x7a5d3c];
  const cars = [];
  const car = (x, z, ry) => { cars.push({ x, z, ry, color: new THREE.Color(carCols[(R() * carCols.length) | 0]) }); const c = Math.abs(Math.cos(ry)) > 0.5; ctx.colliders.push(new THREE.Box3(new THREE.Vector3(x - (c ? 2.3 : 1), 0, z - (c ? 1 : 2.3)), new THREE.Vector3(x + (c ? 2.3 : 1), 1.6, z + (c ? 1 : 2.3)))); world.cover(x + (c ? 0 : 1.6), z + (c ? 1.6 : 0), c ? 0 : 1, c ? 1 : 0); };
  for (let x = BOUNDS.x0 + 4; x < BUS_LOOP.x - BUS_LOOP.r - 12; x += 7.5) { if (R() < 0.7) car(x, BUS_LOOP.z + 2.6, 0); if (R() < 0.5) car(x + 3, BUS_LOOP.z - 2.6, Math.PI); }
  for (let z = ENG_DRIVE.z0 + 6; z < BOUNDS.z1 - 4; z += 7.5) if (R() < 0.7) car(ENG_DRIVE.x0 + 1.5, z, Math.PI / 2);
  for (let x = -260; x < 400; x += 14) if (R() < 0.5) car(x, -207 + (R() < 0.5 ? 2.5 : -2.5), R() < 0.5 ? 0 : Math.PI);   // Toll Drive backdrop traffic
  car(-108, 112, Math.PI / 2); car(-108, 118.5, Math.PI / 2);
  for (let z = -880; z < 880; z += 26) { if (R() < 0.6) car(-705 + (R() < 0.5 ? 3.2 : -3.2), z, Math.PI / 2); if (R() < 0.6) car(-683 + (R() < 0.5 ? 3.2 : -3.2), z + 13, -Math.PI / 2); }   // Nicolls Road traffic
  for (let z = -240; z < 250; z += 22) if (R() < 0.5) car(-257 + (R() < 0.5 ? 2.4 : -2.4), z, R() < 0.5 ? Math.PI / 2 : -Math.PI / 2);   // Circle Road
  inst(world, carBody, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.6, envMapIntensity: 1.0, name: 'car' }), cars, 'metal', { name: 'cars' });
  inst(world, carGlass, M.glassDark, cars, 'metal', { name: 'carGlass', shadow: false });
  inst(world, carWheels, M.rubber, cars, 'metal', { name: 'carWheels', shadow: false });
  // ---- buses: real transit coach — body with a skirt, 6 wheels, tinted window band, folding doors,
  // roof HVAC hump, destination sign, mirrors, lights, fictional livery -------------------------------------
  const BL = 12.0, BW = 2.55, BHW = BW / 2;
  const busBody = (() => {
    const parts = [];
    const skirt = new THREE.BoxGeometry(BL - 0.5, 0.62, BW - 0.14); skirt.translate(0, 0.86, 0); parts.push(skirt);          // lower skirt (narrower)
    const lower = new THREE.BoxGeometry(BL, 0.74, BW); lower.translate(0, 1.54, 0); parts.push(lower);                        // belt below the glass
    const upper = new THREE.BoxGeometry(BL, 0.52, BW); upper.translate(0, 3.06, 0); parts.push(upper);                        // header above the glass
    const roof = new THREE.BoxGeometry(BL - 0.22, 0.30, BW - 0.22); roof.translate(0, 3.44, 0); parts.push(roof);
    const roofC = new THREE.BoxGeometry(BL - 0.9, 0.12, BW - 0.05); roofC.translate(0, 3.34, 0); parts.push(roofC);           // roof chamfer
    const front = new THREE.BoxGeometry(0.34, 1.9, BW); front.translate(BL / 2 - 0.17, 2.3, 0); parts.push(front);            // A-pillar face
    const rear = new THREE.BoxGeometry(0.34, 1.9, BW); rear.translate(-BL / 2 + 0.17, 2.3, 0); parts.push(rear);
    const hvac = new THREE.BoxGeometry(3.1, 0.42, 1.85); hvac.translate(-2.2, 3.80, 0); parts.push(hvac);                     // roof HVAC hump
    const hvac2 = new THREE.BoxGeometry(1.5, 0.30, 1.4); hvac2.translate(3.1, 3.74, 0); parts.push(hvac2);
    const bump = new THREE.BoxGeometry(0.32, 0.55, BW + 0.08); bump.translate(BL / 2 + 0.08, 0.82, 0); parts.push(bump);      // bumpers
    const bumpR = new THREE.BoxGeometry(0.32, 0.55, BW + 0.08); bumpR.translate(-BL / 2 - 0.08, 0.82, 0); parts.push(bumpR);
    for (const zz of [-BHW - 0.16, BHW + 0.16]) {                                                                             // mirrors
      const arm = new THREE.BoxGeometry(0.1, 0.1, 0.34); arm.translate(BL / 2 - 0.5, 3.0, zz); parts.push(arm);
      const gl = new THREE.BoxGeometry(0.08, 0.62, 0.3); gl.translate(BL / 2 - 0.5, 2.72, zz + (zz > 0 ? 0.1 : -0.1)); parts.push(gl);
    }
    const dest = new THREE.BoxGeometry(0.06, 0.42, 1.9); dest.translate(BL / 2 + 0.2, 3.02, 0); parts.push(dest);             // destination sign box
    return merge(parts);
  })();
  const busGlassGeo = (() => {
    const parts = [];
    const side = new THREE.BoxGeometry(BL - 1.0, 1.26, BW + 0.04); side.translate(-0.2, 2.42, 0); parts.push(side);           // side window band
    const wind = new THREE.BoxGeometry(0.3, 1.9, BW - 0.24); wind.translate(BL / 2 - 0.02, 2.36, 0); parts.push(wind);        // windscreen
    const back = new THREE.BoxGeometry(0.3, 1.3, BW - 0.3); back.translate(-BL / 2 + 0.02, 2.42, 0); parts.push(back);
    return merge(parts);
  })();
  const busSkinGeo = (() => {                                                                                                 // livery panel (fictional text)
    const g = new THREE.PlaneGeometry(7.6, 0.62); g.rotateY(-Math.PI / 2); g.translate(-BHW - 0.03, 1.52, 0.6);
    const g2 = new THREE.PlaneGeometry(7.6, 0.62); g2.rotateY(Math.PI / 2); g2.translate(BHW + 0.03, 1.52, -0.6);
    return merge([g, g2]);
  })();
  const busDoors = (() => {                                                                                                   // two folding doors, each a pair of leaves
    const parts = [];
    for (const [cx, w] of [[4.3, 1.15], [-1.1, 1.6]]) {
      for (const s2 of [-1, 1]) {
        const leaf = new THREE.BoxGeometry(w / 2 - 0.04, 2.1, 0.07); leaf.translate(cx + s2 * w / 4, 1.62, BHW + 0.02); parts.push(leaf);
      }
      for (const fx of [cx - w / 2, cx + w / 2, cx]) { const fr = new THREE.BoxGeometry(0.07, 2.16, 0.1); fr.translate(fx, 1.62, BHW + 0.05); parts.push(fr); }
      const hd = new THREE.BoxGeometry(w + 0.14, 0.09, 0.1); hd.translate(cx, 2.72, BHW + 0.05); parts.push(hd);
      const st = new THREE.BoxGeometry(w, 0.1, 0.5); st.translate(cx, 0.6, BHW + 0.2); parts.push(st);                         // step
    }
    return merge(parts);
  })();
  const busWheels = (() => {
    const parts = [];
    for (const [x, z] of [[-4.3, -1.16], [-3.05, -1.16], [3.55, -1.16], [-4.3, 1.16], [-3.05, 1.16], [3.55, 1.16]]) {
      const w = new THREE.CylinderGeometry(0.5, 0.5, 0.32, 14); w.rotateX(Math.PI / 2); w.translate(x, 0.5, z); parts.push(w);
      const arch = new THREE.BoxGeometry(1.25, 0.16, 0.12); arch.translate(x, 1.02, z + (z > 0 ? 0.08 : -0.08)); parts.push(arch);
    }
    return merge(parts);
  })();
  const busHubs = (() => { const parts = []; for (const [x, z] of [[-4.3, -1.3], [-3.05, -1.3], [3.55, -1.3], [-4.3, 1.3], [-3.05, 1.3], [3.55, 1.3]]) { const h = new THREE.CylinderGeometry(0.24, 0.24, 0.05, 12); h.rotateX(Math.PI / 2); h.translate(x, 0.5, z); parts.push(h); } return merge(parts); })();
  const busLights = (() => {
    const parts = [];
    for (const z of [-0.85, 0.85]) { const hl = new THREE.BoxGeometry(0.08, 0.3, 0.42); hl.translate(BL / 2 + 0.12, 1.15, z); parts.push(hl); }
    return merge(parts);
  })();
  const busTail = (() => { const parts = []; for (const z of [-0.85, 0.85]) { const tl = new THREE.BoxGeometry(0.08, 0.5, 0.34); tl.translate(-BL / 2 - 0.12, 1.7, z); parts.push(tl); } return merge(parts); })();
  const buses = [];
  const bus = (a) => { const x = BUS_LOOP.x + Math.cos(a) * BUS_LOOP.r, z = BUS_LOOP.z + Math.sin(a) * BUS_LOOP.r; const ry = -a - Math.PI / 2; buses.push({ x, z, ry }); ctx.colliders.push(new THREE.Box3(new THREE.Vector3(x - 6.2, 0, z - 6.2), new THREE.Vector3(x + 6.2, 3.6, z + 6.2))); world.cover(x + Math.cos(a) * 2.6, z + Math.sin(a) * 2.6, Math.cos(a), Math.sin(a)); ao(x, z, 7.5); };
  bus(0.25); bus(2.1); bus(4.2);
  inst(world, busBody, M.bus, buses, 'metal', { name: 'buses' });
  inst(world, busGlassGeo, M.busGlass, buses, 'metal', { name: 'busWin', shadow: false });
  inst(world, busSkinGeo, M.busSkin, buses, 'metal', { name: 'busSkin', shadow: false });
  inst(world, busDoors, M.busGlass, buses, 'metal', { name: 'busDoors', shadow: false });
  inst(world, busWheels, M.rubber, buses, 'metal', { name: 'busWheels', shadow: false });
  inst(world, busHubs, M.alu, buses, 'metal', { name: 'busHubs', shadow: false });
  inst(world, busLights, M.lampHead, buses, 'metal', { name: 'busLights', shadow: false });
  inst(world, busTail, M.tailLight, buses, 'metal', { name: 'busTail', shadow: false });
  // ---- bus shelter on the island: glazed back + side, steel roof, bench, route sign, litter bin --------------
  const sx = BUS_LOOP.x, sz = BUS_LOOP.z - 8;
  for (const [dx, dz] of [[-3, -1.2], [3, -1.2], [-3, 1.2], [3, 1.2]]) B.cyl('steelDark', sx + dx, sz + dz, 0, 2.85, 0.07, 8);
  B.box('glass', [sx - 3.2, 0.35, sz - 1.32], [sx + 3.2, 2.55, sz - 1.22], { collide: true });                 // back glazing
  B.box('glass', [sx - 3.3, 0.35, sz - 1.32], [sx - 3.2, 2.55, sz + 1.2], { collide: false });                  // end glazing
  B.box('steelDark', [sx - 3.3, 0.2, sz - 1.36], [sx + 3.3, 0.36, sz + 1.3], { collide: false });
  B.box('steelDark', [sx - 3.7, 2.85, sz - 1.7], [sx + 3.7, 3.05, sz + 1.7]);                                   // roof slab
  B.box('alu', [sx - 3.75, 3.05, sz - 1.75], [sx + 3.75, 3.14, sz + 1.75], { collide: false });
  B.box('bench', [sx - 2.6, 0.46, sz - 0.95], [sx + 2.6, 0.52, sz - 0.35]);                                     // bench slats
  for (const bxp of [sx - 2.4, sx, sx + 2.4]) B.box('steelDark', [bxp - 0.05, 0, sz - 0.9], [bxp + 0.05, 0.46, sz - 0.4], { collide: false });
  B.cyl('steelDark', sx + 4.6, sz + 0.4, 0, 2.9, 0.06, 8);                                                       // route sign post
  ao(sx, sz, 5.2); ao(sx + 4.6, sz + 0.4, 0.8);
  {
    const t = signTexture({ text: 'ROUTE 5', sub: 'INNER LOOP  ·  EVERY 10 MIN', w: 512, h: 256, bg: '#1e3f7a', font: 'bold 78px Helvetica, Arial, sans-serif' });
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.72, 0.07), [M.steelDark, M.steelDark, M.steelDark, M.steelDark, new THREE.MeshStandardMaterial({ map: t, roughness: 0.65 }), new THREE.MeshStandardMaterial({ map: t, roughness: 0.65 })]);
    m.position.set(sx + 4.6, 2.45, sz + 0.4); m.rotation.y = -0.5; m.castShadow = true; m.name = 'sbu:routeSign'; scene.add(m); world.solid(m, 'metal', { collide: false });
  }
  world.cover(sx, sz + 1.9, 0, 1);
  // the motorcycles belong on the road, not on the brick plaza
  W.vehicleSpots = [
    { x: BUS_LOOP.x + Math.cos(5.2) * (BUS_LOOP.r - 1.5), z: BUS_LOOP.z + Math.sin(5.2) * (BUS_LOOP.r - 1.5), yaw: -5.2 - Math.PI / 2 },
    { x: BUS_LOOP.x + Math.cos(3.4) * (BUS_LOOP.r + 1.5), z: BUS_LOOP.z + Math.sin(3.4) * (BUS_LOOP.r + 1.5), yaw: -3.4 - Math.PI / 2 },
    { x: BUS_LOOP.x - BUS_LOOP.r - 16, z: BUS_LOOP.z + 2.6, yaw: Math.PI / 2 },
    { x: BUS_LOOP.x - BUS_LOOP.r - 26, z: BUS_LOOP.z - 2.6, yaw: -Math.PI / 2 },
    { x: ENG_DRIVE.x0 + 4, z: ENG_DRIVE.z0 + 18, yaw: 0 },
  ];

  // ---- fountain jet + Glaser-style steel sculpture on the library forecourt --------------------------------------------------------
  { // jets: central 8 m spire (tapered, soft-alpha) + 6 arcs from the rim inward (tube along a parabola), gently pulsing
    const jetMat = new THREE.MeshStandardMaterial({ color: 0xf6fbff, transparent: true, opacity: 0.5, roughness: 0.15, metalness: 0.0, depthWrite: false, side: THREE.DoubleSide, emissive: 0xdde8f0, emissiveIntensity: 0.2 });
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.16, 8, 10, 1, true), jetMat); spire.position.set(FOUNTAIN.x, 0.55 + 4, FOUNTAIN.z); spire.name = 'sbu:jet'; scene.add(spire);
    const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.7, 7.6, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.2, depthWrite: false, side: THREE.DoubleSide })); halo.position.copy(spire.position); halo.name = 'sbu:jetHalo'; scene.add(halo);
    const arcs = [];
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3 + 0.3; const p0 = new THREE.Vector3(FOUNTAIN.x + Math.cos(a) * 4.2, 0.6, FOUNTAIN.z + Math.sin(a) * 4.2), p2 = new THREE.Vector3(FOUNTAIN.x + Math.cos(a) * 1.2, 0.6, FOUNTAIN.z + Math.sin(a) * 1.2);
      const p1 = p0.clone().lerp(p2, 0.5); p1.y = 3.2;
      const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.045, 6, false), jetMat); m.name = 'sbu:arc'; scene.add(m); arcs.push(m);
    }
    world.updaters.push(() => { const t = ctx.time.elapsed; spire.scale.y = 1 + Math.sin(t * 5) * 0.04; halo.scale.y = 1 + Math.sin(t * 5 + 1) * 0.06; for (let i = 0; i < arcs.length; i++) arcs[i].scale.y = 1 + Math.sin(t * 4 + i) * 0.05; });
  }
  { // abstract painted-steel sculpture (Glaser-style) east of the entrance walk
    const sx2 = LIB.entX1 + 16, sz2 = LIB.z1 + 6;
    B.box('concreteGrey', [sx2 - 1.6, 0, sz2 - 1.6], [sx2 + 1.6, 0.4, sz2 + 1.6]);
    const g1 = boxGeo([-0.12, 0, -1.1], [0.12, 4.6, 1.1]); g1.rotateY(0.5); g1.translate(sx2, 0.4, sz2); B.add('red', g1, { uv: false });
    const g2 = boxGeo([-1.3, 0, -0.12], [1.3, 3.6, 0.12]); g2.rotateY(-0.35); g2.translate(sx2 + 0.3, 0.4, sz2 + 0.2); B.add('steelDark', g2, { uv: false });
    const g3 = new THREE.TorusGeometry(1.0, 0.1, 8, 24); g3.translate(sx2 - 0.4, 2.8, sz2 - 0.6); B.add('paintY', g3, { uv: false });
    world.cover(sx2, sz2 + 2.4, 0, 1); world.cover(sx2, sz2 - 2.4, 0, -1);
  }

  // ---- SAC plaza umbrellas / tables (green umbrellas) + planters ---------------------------------------------------------------------
  for (let i = 0; i < 6; i++) {
    const x = SAC.x0 - 9 - (i % 3) * 4.2, z = SAC.z0 + 30 + Math.floor(i / 3) * 4.5;
    B.cyl('steelDark', x, z, 0, 2.4, 0.04, 6); B.cyl('binGreen', x, z, 2.2, 2.6, 1.5, 10, { r0: 0.05 }); B.cyl('steelDark', x, z, 0.72, 0.76, 0.6, 12);
    world.box([x - 0.6, 0, z - 0.6], [x + 0.6, 0.8, z + 0.6]); world.cover(x + 1.1, z, 1, 0);
  }
  for (const [x, z] of [[-14, 8], [-52, 8], [-33, 26], [-108, 20], [-108, 30], [122, 18], [122, 26]]) { B.box('concreteGrey', [x - 1.4, 0, z - 0.7], [x + 1.4, 0.75, z + 0.7]); B.box('hedgeLeaf', [x - 1.3, 0.75, z - 0.6], [x + 1.3, 1.3, z + 0.6], { collide: false }); ao(x, z, 1.9); world.cover(x, z + 1.4, 0, 1); world.cover(x, z - 1.4, 0, -1); }

  // ---- lawn clutter: planters, notice kiosks, banner poles, picnic tables on the formerly empty lawns --------
  const planter = (x, z, w = 1.6, d = 1.0) => {
    const y = W.groundHeight(x, z);
    B.box('graniteWall', [x - w, y, z - d], [x + w, y + 0.62, z + d]);
    B.box('graniteCap', [x - w - 0.08, y + 0.62, z - d - 0.08], [x + w + 0.08, y + 0.72, z + d + 0.08], { collide: false });
    B.box('mulchDark', [x - w + 0.15, y + 0.6, z - d + 0.15], [x + w - 0.15, y + 0.68, z + d - 0.15], { collide: false });
    B.box('hedgeLeaf', [x - w + 0.2, y + 0.66, z - d + 0.2], [x + w - 0.2, y + 1.32, z + d - 0.2], { collide: false });
    ao(x, z, Math.max(w, d) + 1.1, y); world.cover(x, z + d + 0.8, 0, 1); world.cover(x, z - d - 0.8, 0, -1);
  };
  for (const [x, z] of [[92, PIT.z1 + 3.4], [118, PIT.z1 + 3.4], [PIT.x0 - 5.4, -140], [PIT.x0 - 5.4, -64],
                        [123, 136], [149, 136], [175, 136], [123, 113], [151, 113],
                        [206, -99], [270, -99], [232, -97], [244, -97],
                        [LIB.entX0 - 8, LIB.z1 + 5.5], [LIB.entX1 + 8, LIB.z1 + 5.5]]) planter(x, z);
  // notice kiosks (triangular pin-boards) on the mall and the lawn walks
  const kiosk = (x, z, ry = 0) => {
    const y = W.groundHeight(x, z);
    for (let k = 0; k < 3; k++) {
      const a = ry + k * Math.PI * 2 / 3;
      const g = boxGeo([-0.62, 0.9, -0.05], [0.62, 2.55, 0.05]); g.rotateY(a); g.translate(x + Math.sin(a) * 0.36, y, z + Math.cos(a) * 0.36); B.add('cream', g, { uv: false });
      const f = boxGeo([-0.68, 0.84, -0.09], [0.68, 2.62, -0.02]); f.rotateY(a); f.translate(x + Math.sin(a) * 0.36, y, z + Math.cos(a) * 0.36); B.add('steelDark', f, { uv: false });
    }
    B.cyl('steelDark', x, z, y, y + 2.8, 0.12, 8);
    B.cyl('steelDark', x, z, y + 2.62, y + 2.78, 0.9, 3);
    world.box([x - 0.9, y, z - 0.9], [x + 0.9, y + 2.8, z + 0.9]); ao(x, z, 1.5, y);
    world.cover(x, z + 1.3, 0, 1);
  };
  kiosk(-46, MALL.z1 - 2.2, 0.4); kiosk(70, MALL.z1 - 2.2, 1.1); kiosk(PIT.x0 - 6, -96, 0.7); kiosk(140, 134, 2.2); kiosk(236, -97, 0.2);
  // banner poles (pairs of tall masts with fabric banners) marking the lawn entrances
  const bannerMat = new THREE.MeshStandardMaterial({ color: 0x9b1b2a, roughness: 0.85, side: THREE.DoubleSide, name: 'bannerTall' });
  const bannerGeos = [];
  const bannerPole = (x, z, ry = 0) => {
    const y = W.groundHeight(x, z);
    B.cyl('alu', x, z, y, y + 7.2, 0.09, 10); B.cyl('alu', x, z, y + 7.2, y + 7.45, 0.14, 10);
    const g = new THREE.PlaneGeometry(0.85, 3.0); g.translate(0.5, y + 5.2, 0); g.rotateY(ry); g.translate(x, 0, z);
    bannerGeos.push(g);
    world.box([x - 0.2, y, z - 0.2], [x + 0.2, y + 7.2, z + 0.2]); ao(x, z, 0.9, y);
  };
  for (const [x, z, ry] of [[PIT.x0 - 7.6, -122, 0], [PIT.x0 - 7.6, -80, 0], [120.5, 131, Math.PI / 2], [178.5, 131, -Math.PI / 2],
                            [204, -101, 0], [272, -101, 0], [LIB.entX0 - 12, LIB_LAWN.z1 - 2, 0], [LIB.entX1 + 12, LIB_LAWN.z1 - 2, 0]]) bannerPole(x, z, ry);
  if (bannerGeos.length) { const bg = BGU.mergeGeometries(bannerGeos.map(g => g.toNonIndexed()), false); const bm = new THREE.Mesh(bg, bannerMat); bm.castShadow = true; bm.name = 'sbu:banners'; bm.userData.surface = 'wood'; scene.add(bm); ctx.raycastTargets.push(bm); }
  // picnic tables on the lawns
  for (const [x, z, ry] of [[132, 126, 0.4], [152, 122, -0.6], [166, 129, 0.2], [PIT.x0 - 12, -104, 0.3], [PIT.x0 - 12, -88, -0.4], [224, -110, 0.5], [250, -112, -0.3]]) {
    const y = W.groundHeight(x, z);
    const top = boxGeo([-0.85, 0.72, -0.38], [0.85, 0.78, 0.38]); top.rotateY(ry); top.translate(x, y, z); B.add('bench', top, { uv: false });
    for (const s2 of [-1, 1]) { const bn = boxGeo([-0.85, 0.44, s2 * 0.72 - 0.16], [0.85, 0.5, s2 * 0.72 + 0.16]); bn.rotateY(ry); bn.translate(x, y, z); B.add('bench', bn, { uv: false }); }
    for (const s2 of [-1, 1]) { const lg = boxGeo([s2 * 0.62 - 0.05, 0, -0.78], [s2 * 0.62 + 0.05, 0.74, 0.78]); lg.rotateY(ry); lg.translate(x, y, z); B.add('steelDark', lg, { uv: false }); }
    world.box([x - 1, y, z - 1], [x + 1, y + 0.8, z + 1]); ao(x, z, 1.7, y); world.cover(x, z + 1.4, 0, 1);
  }

  B.flush();
}
