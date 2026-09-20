// SBU buildings: banded brutalist facades (spandrel + recessed glass + piers), the Melville Library, SAC, Frey, Staller, Psychology, Harriman, ESS, Chemistry, Wang, Admin, Humanities and backdrop halls. SBU agent.
import * as THREE from 'three';
import { Batch, boxGeo, prismGeo, circlePts } from './geo.js';
import { letteringTexture, signTexture } from './mats.js';
import { LIB, SAC, FREY, HARRIMAN, ESS, PSY, STALLER, PIT, ADMIN, HUM, ECC, JAVITS, ENG, NEWCS, LIGHTENG, CHEM, VDG, UNION, REC, WANG } from './layout.js';

/**
 * Banded facade building. Each storey = recessed glass band (inset) + spandrel band (full footprint) + piers at pitch.
 * o: { x0,x1,z0,z1, y0, floors, storey, band, inset, pitch, pierW, wall, glass, pier, ground:{h, inset, glass}, top:{h,key}, parapet, roof, collide }
 */
export function facade(B, o) {
  const { x0, x1, z0, z1 } = o; const y0 = o.y0 ?? 0;
  const storey = o.storey ?? 4.2, band = o.band ?? 1.5, inset = o.inset ?? 0.7, pitch = o.pitch ?? 4.2, pierW = o.pierW ?? 0.5;
  const wall = o.wall ?? 'precast', glass = o.glass ?? 'glass', pier = o.pier ?? wall;
  let y = y0;
  if (o.ground) {
    const g = o.ground; const gi = g.inset ?? 1.2; const gh = g.h ?? storey;
    B.box(g.glass ?? 'glass', [x0 + gi, y, z0 + gi], [x1 - gi, y + gh, z1 - gi], { collide: false });
    // columns along each face
    const cp = g.pitch ?? pitch * 2;
    for (let x = x0 + pierW; x < x1 - pierW; x += cp) { B.box(pier, [x, y, z0], [x + pierW, y + gh, z0 + gi], { collide: false }); B.box(pier, [x, y, z1 - gi], [x + pierW, y + gh, z1], { collide: false }); }
    for (let z = z0 + pierW; z < z1 - pierW; z += cp) { B.box(pier, [x0, y, z], [x0 + gi, y + gh, z + pierW], { collide: false }); B.box(pier, [x1 - gi, y, z], [x1, y + gh, z + pierW], { collide: false }); }
    // corners
    B.box(pier, [x0, y, z0], [x0 + gi, y + gh, z0 + gi], { collide: false }); B.box(pier, [x1 - gi, y, z0], [x1, y + gh, z0 + gi], { collide: false });
    B.box(pier, [x0, y, z1 - gi], [x0 + gi, y + gh, z1], { collide: false }); B.box(pier, [x1 - gi, y, z1 - gi], [x1, y + gh, z1], { collide: false });
    y += gh;
  }
  const floors = o.floors ?? 3;
  for (let f = 0; f < floors; f++) {
    const wy = y, wh = storey - band;
    B.box(glass, [x0 + inset, wy, z0 + inset], [x1 - inset, wy + wh, z1 - inset], { collide: false });
    if (pierW > 0) for (let x = x0 + pitch / 2 - pierW / 2; x < x1 - pierW; x += pitch) { B.box(pier, [x, wy, z0], [x + pierW, wy + wh, z0 + inset], { collide: false }); B.box(pier, [x, wy, z1 - inset], [x + pierW, wy + wh, z1], { collide: false }); }
    if (pierW > 0) for (let z = z0 + pitch / 2 - pierW / 2; z < z1 - pierW; z += pitch) { B.box(pier, [x0, wy, z], [x0 + inset, wy + wh, z + pierW], { collide: false }); B.box(pier, [x1 - inset, wy, z], [x1, wy + wh, z + pierW], { collide: false }); }
    const mp = o.mullionPitch ?? pitch / 3, mm = 0.07;
    if (mp > 0) {
      for (let x = x0 + mp; x < x1 - 0.2; x += mp) { B.box('darkMullion', [x - mm / 2, wy, z0 + inset - 0.12], [x + mm / 2, wy + wh, z0 + inset], { collide: false }); B.box('darkMullion', [x - mm / 2, wy, z1 - inset], [x + mm / 2, wy + wh, z1 - inset + 0.12], { collide: false }); }
      for (let z = z0 + mp; z < z1 - 0.2; z += mp) { B.box('darkMullion', [x0 + inset - 0.12, wy, z - mm / 2], [x0 + inset, wy + wh, z + mm / 2], { collide: false }); B.box('darkMullion', [x1 - inset, wy, z - mm / 2], [x1 - inset + 0.12, wy + wh, z + mm / 2], { collide: false }); }
      B.box('darkMullion', [x0 + inset - 0.12, wy + wh * 0.5 - mm, z0 + inset - 0.12], [x1 - inset + 0.12, wy + wh * 0.5 + mm, z1 - inset + 0.12], { collide: false });
    }
    B.box(wall, [x0, wy + wh, z0], [x1, wy + storey, z1], { collide: false });
    y += storey;
  }
  if (o.top) { B.box(o.top.key, [x0, y, z0], [x1, y + o.top.h, z1], { collide: false }); y += o.top.h; }
  const par = o.parapet ?? 0.9;
  if (par > 0) { B.box(wall, [x0, y, z0], [x1, y + par, z1], { collide: false }); y += par; }
  B.box(o.roof ?? 'roof', [x0 + 0.3, y - 0.3, z0 + 0.3], [x1 - 0.3, y - 0.25, z1 - 0.3], { collide: false });
  if (o.collide !== false) B.world.box([x0, y0, z0], [x1, y, z1]);
  return { top: y };
}

/** Plain massing block (backdrop). */
export function block(B, key, x0, z0, x1, z1, h, { y0 = 0, roof = 'roof', collide = true } = {}) {
  B.box(key, [x0, y0, z0], [x1, y0 + h, z1], { collide });
  B.box(roof, [x0 + 0.3, y0 + h - 0.02, z0 + 0.3], [x1 - 0.3, y0 + h + 0.03, z1 - 0.3], { collide: false });
}

/** Glass curtain wall with a mullion grid on one face. face: 'n'|'s'|'e'|'w'; the wall spans a0..a1 along the face at position c, from y0 to y1. */
export function curtain(B, { face, a0, a1, c, y0, y1, glass = 'glassLight', mullion = 'whiteMullion', cellW = 2.4, cellH = 2.2, depth = 0.12, mw = 0.1 }) {
  const horiz = face === 'n' || face === 's';
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
  const out = face === 'n' ? -1 : face === 's' ? 1 : face === 'w' ? -1 : 1; // outward direction along the face normal
  const g0 = c, g1 = c + out * depth;
  const box = (p0, p1, y_0, y_1, key) => B.box(key, horiz ? [Math.min(p0, p1), y_0, Math.min(g0, g1)] : [Math.min(g0, g1), y_0, Math.min(p0, p1)], horiz ? [Math.max(p0, p1), y_1, Math.max(g0, g1)] : [Math.max(g0, g1), y_1, Math.max(p0, p1)], { collide: false });
  box(lo, hi, y0, y1, glass);
  const m0 = c + out * depth, m1 = c + out * (depth + mw);
  const mbox = (p0, p1, y_0, y_1) => B.box(mullion, horiz ? [Math.min(p0, p1), y_0, Math.min(m0, m1)] : [Math.min(m0, m1), y_0, Math.min(p0, p1)], horiz ? [Math.max(p0, p1), y_1, Math.max(m0, m1)] : [Math.max(m0, m1), y_1, Math.max(p0, p1)], { collide: false });
  for (let a = lo; a <= hi + 0.01; a += cellW) mbox(a - mw / 2, a + mw / 2, y0, y1);
  for (let y = y0; y <= y1 + 0.01; y += cellH) mbox(lo, hi, y - mw / 2, y + mw / 2);
}

/** Sawtooth roof monitors along x across a roof strip (library). */
function sawtooth(B, x0, x1, z0, z1, y, pitch = 7, h = 2.6) {
  for (let z = z0 + 2; z + pitch <= z1; z += pitch) {
    const g = boxGeo([x0, 0, -pitch * 0.55 / 2], [x1, 0.25, pitch * 0.55 / 2]); g.rotateX(-0.95); g.translate(0, y + h / 2, z + pitch * 0.35); B.add('glass', g);
    B.box('precast', [x0, y, z + pitch * 0.55], [x1, y + h, z + pitch * 0.55 + 0.4], { collide: false });
    B.box('precast', [x0, y, z], [x0 + 0.3, y + h, z + pitch * 0.55 + 0.4], { collide: false });
    B.box('precast', [x1 - 0.3, y, z], [x1, y + h, z + pitch * 0.55 + 0.4], { collide: false });
  }
}

function lettering(world, text, x, y, z, w, h, ry = 0, color = '#2a2d31') {
  const t = letteringTexture({ text, color, w: Math.round(w * 90), h: Math.round(h * 90) });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6, alphaTest: 0.2 }));
  m.position.set(x, y, z); m.rotation.y = ry; m.name = 'sbu:lettering'; world.scene.add(m);
  return m;
}

export function buildBuildings(world, M) {
  const { ctx, scene, R, W } = world;
  const B = new Batch(world, M, 'bld');

  // ---- Frank Melville Jr. Memorial Library: 6 storeys of pale precast bands, slit top floor, sawtooth roof, brick stair towers ---
  const L = LIB;
  const lib = facade(B, { x0: L.x0, x1: L.x1, z0: L.z0, z1: L.z1, floors: 4, storey: 4.2, band: 1.5, inset: 0.85, pitch: 4.2, pierW: 0.55, wall: 'precast', glass: 'glass', ground: { h: 4.6, inset: 1.3, glass: 'glassDark', pitch: 8.4 }, top: { h: 4.2, key: 'slit' }, parapet: 1.0 });
  facade(B, { x0: L.wingX0, x1: L.x0 + 0.5, z0: L.wingZ0, z1: L.wingZ1, floors: 4, storey: 4.2, band: 1.5, inset: 0.85, pitch: 4.2, pierW: 0.55, wall: 'precast', ground: { h: 4.6, inset: 1.3, glass: 'glassDark', pitch: 8.4 }, top: { h: 4.2, key: 'slit' }, parapet: 1.0 });
  sawtooth(B, L.x0 + 4, L.x1 - 4, L.z0 + 6, L.z1 - 12, lib.top - 0.3, 7, 2.6);
  // brick stair/service towers (dark brick) rising above the parapet
  block(B, 'brickDark', L.x0 - 1.5, L.z1 - 8, L.x0 + 4.5, L.z1 + 0.8, lib.top + 2.4, { roof: 'roof' });
  block(B, 'brickDark', L.x1 - 6, L.z0 - 0.8, L.x1 + 0.8, L.z0 + 7, lib.top + 2.4, { roof: 'roof' });
  block(B, 'brickDark', L.x0 - 1.5, L.z0 - 0.8, L.x0 + 4.5, L.z0 + 7, lib.top + 1.6, { roof: 'roof' });
  // entrance: projecting glass vestibule on the mall face, concrete canopy, "LIBRARY" lettering, planters
  B.box('glass', [L.entX0, 0, L.z1 - 0.5], [L.entX1, 4.2, L.z1 + 2.2], { collide: true });
  B.box('darkMullion', [L.entX0 - 0.15, 0, L.z1 + 2.2], [L.entX0 + 0.15, 4.4, L.z1 + 2.5], { collide: false });
  B.box('darkMullion', [L.entX1 - 0.15, 0, L.z1 + 2.2], [L.entX1 + 0.15, 4.4, L.z1 + 2.5], { collide: false });
  for (let x = L.entX0 + 3; x < L.entX1; x += 3) B.box('darkMullion', [x - 0.06, 0, L.z1 + 2.2], [x + 0.06, 4.2, L.z1 + 2.45], { collide: false });
  B.box('precast', [L.entX0 - 1, 4.2, L.z1 - 0.5], [L.entX1 + 1, 4.9, L.z1 + 3.4], { collide: false });
  B.box('precast', [L.entX0 - 1, 4.9, L.z1 - 0.2], [L.entX1 + 1, 6.4, L.z1 + 0.15], { collide: false });
  lettering(world, 'LIBRARY', (L.entX0 + L.entX1) / 2, 5.45, L.z1 + 0.17, 8, 0.9);
  lettering(world, 'Central Memorial', (L.entX0 + L.entX1) / 2, 6.1, L.z1 + 0.17, 8, 0.4);
  // library east face at the Staller terraces: base wall down to the pit floor
  B.box('precastDark', [L.x1 - 0.2, PIT.floor - 0.5, PIT.z0], [L.x1 + 0.2, 0.05, PIT.z1], { collide: false });

  // ---- Student Activities Center ----------------------------------------------------------------------------------------
  const S = SAC;
  // glass hall (west front onto the SAC plaza): white steel curtain wall 2 storeys + white trim band
  B.box('glassLight', [S.x0 + 0.4, 0, S.z0 + 0.4], [S.hallX1, 10.6, S.hallZ1 - 0.4], { collide: true });
  curtain(B, { face: 'w', a0: S.z0, a1: S.hallZ1, c: S.x0 + 0.4, y0: 0, y1: 10.6, cellW: 2.55, cellH: 2.65 });
  curtain(B, { face: 'n', a0: S.x0, a1: S.hallX1, c: S.z0 + 0.4, y0: 0, y1: 10.6, cellW: 2.6, cellH: 2.65 });
  curtain(B, { face: 's', a0: S.x0, a1: S.hallX1, c: S.hallZ1 - 0.4, y0: 0, y1: 10.6, cellW: 2.6, cellH: 2.65 });
  B.box('white', [S.x0 - 0.3, 10.6, S.z0 - 0.3], [S.hallX1 + 0.3, 12.4, S.hallZ1 + 0.3], { collide: false });
  B.box('roof', [S.x0, 12.4, S.z0], [S.hallX1, 12.45, S.hallZ1], { collide: false });
  for (let z = S.z0 + 2; z < S.hallZ1; z += 5.1) B.cyl('white', S.x0 - 0.36, z, 11.85, 12.25, 0.22, 12);      // circle ornaments on the trim
  // white entrance vestibule (walkable roof via ladder) with doors
  B.box('white', [S.x0 - 4.2, 0, S.z0 + 9], [S.x0 - 0.2, 4.6, S.z0 + 20], { walkable: false, collide: false });
  world.walkable([S.x0 - 4.2, 0, S.z0 + 9], [S.x0 - 0.2, 4.6, S.z0 + 20]);
  B.box('glass', [S.x0 - 4.3, 0.1, S.z0 + 9.6], [S.x0 - 4.1, 2.6, S.z0 + 19.4], { collide: false });
  for (let z = S.z0 + 9.6; z <= S.z0 + 19.4; z += 1.4) B.box('whiteMullion', [S.x0 - 4.36, 0, z - 0.05], [S.x0 - 4.2, 2.7, z + 0.05], { collide: false });
  B.box('whiteMullion', [S.x0 - 4.36, 2.6, S.z0 + 9.5], [S.x0 - 4.2, 2.75, S.z0 + 19.5], { collide: false });
  B.box('white', [S.x0 - 4.5, 4.6, S.z0 + 8.7], [S.x0 + 0.2, 5.1, S.z0 + 20.3], { collide: false });                    // parapet lip (stops falls)
  world.box([S.x0 - 4.5, 4.6, S.z0 + 8.7], [S.x0 - 4.2, 5.4, S.z0 + 20.3]); world.box([S.x0 - 4.5, 4.6, S.z0 + 8.7], [S.x0 + 0.2, 5.4, S.z0 + 9]); world.box([S.x0 - 4.5, 4.6, S.z0 + 20], [S.x0 + 0.2, 5.4, S.z0 + 20.3]);
  world.ladder(S.x0 - 2.2, S.z0 + 9, 0, 4.6, 0, -1);
  lettering(world, 'STUDENT  ACTIVITIES  CENTER', S.x0 - 0.62, 11.25, (S.z0 + S.hallZ1) / 2, 26, 1.0, -Math.PI / 2, '#55606a');
  // brick wings behind the hall: 3 storeys with ribbon windows + barrel-vault roofs
  facade(B, { x0: S.hallX1, x1: S.x1, z0: S.z0, z1: 66, floors: 3, storey: 4.6, band: 2.4, inset: 0.45, pitch: 3.0, pierW: 0.9, wall: 'brickRed', glass: 'glass', parapet: 0.7 });
  for (const [z0, z1] of [[S.z0 + 3, S.z0 + 19], [S.z0 + 25, S.z0 + 41]]) B.hcyl('roofMetal', 'x', S.hallX1 + 1, S.x1 - 1, (z0 + z1) / 2, 14.6, 4.2, 24);
  // auditorium / ballroom block (brick, windowless, white cornice) south-west
  block(B, 'brickRed', S.x0, S.hallZ1, S.hallX1 + 8, S.z1, 12.5);
  B.box('white', [S.x0 - 0.3, 11.2, S.hallZ1 - 0.3], [S.hallX1 + 8.3, 12.6, S.z1 + 0.3], { collide: false });
  block(B, 'brickRed', S.hallX1 + 8, 66, S.x1, S.z1, 11);
  // curved glass bay facing the Academic Mall (ballroom front) — circle-segment prism with white spandrel band
  const bay = circlePts(S.bayCx, S.bayCz, S.bayR, 40, Math.PI + 0.42, Math.PI * 2 - 0.42).filter(p => p[1] <= S.z0 + 3.2);
  bay.push([bay[bay.length - 1][0], S.z0 + 3.2]); bay.push([bay[0][0], S.z0 + 3.2]);
  B.prism('glassLight', bay, 0, 8.4, { collide: false });
  B.prism('white', bay, 8.4, 10.2, { collide: false });
  B.prism('roof', bay, 10.2, 10.25, { collide: false });
  // bay mullions (radial) + step colliders approximating the arc
  for (let i = 0; i < bay.length - 2; i += 1) { const p = bay[i]; const a = Math.atan2(p[1] - S.bayCz, p[0] - S.bayCx); const g = boxGeo([-0.08, 0, -0.16], [0.08, 8.4, 0.16]); g.rotateY(-a + Math.PI / 2); g.translate(p[0] + Math.cos(a) * 0.1, 0, p[1] + Math.sin(a) * 0.1); B.add('whiteMullion', g, { uv: false }); }
  for (let k = 0; k < 6; k++) { const y = 1.4 + k * 1.4; B.prism('whiteMullion', bay.map(p => { const a = Math.atan2(p[1] - S.bayCz, p[0] - S.bayCx); return [p[0] + Math.cos(a) * 0.12, p[1] + Math.sin(a) * 0.12]; }), y - 0.05, y + 0.05, { collide: false }); }
  { const n = 7; for (let i = 0; i < n; i++) { const a0 = Math.PI + 0.42 + (Math.PI - 0.84) * i / n, a1 = Math.PI + 0.42 + (Math.PI - 0.84) * (i + 1) / n; const xs = [S.bayCx + Math.cos(a0) * S.bayR, S.bayCx + Math.cos(a1) * S.bayR], zs = [S.bayCz + Math.sin(a0) * S.bayR, S.bayCz + Math.sin(a1) * S.bayR]; world.box([Math.min(...xs), 0, Math.min(...zs)], [Math.max(...xs), 10.2, S.z0 + 3.2]); } }
  // raised terrace with steps in front of the bay (mall side)
  B.box('concretePav', [S.bayCx - 21, 0, S.z0 - 6], [S.bayCx + 21, 0.9, S.z0 + 3.2], { walkable: true });
  B.stairs('concretePav', { x: S.bayCx, z: S.z0 - 6, y0: 0, rise: 0.9, run: 2.4, width: 42, axis: 'z', dir: -1, n: 3 });
  for (const x of [S.bayCx - 21.6, S.bayCx + 21]) { B.box('concreteGrey', [x, 0, S.z0 - 8.4], [x + 0.6, 1.35, S.z0 + 3.2]); world.cover(x + 0.3, S.z0 - 9.2, 0, -1); }
  // red glass drum (rotunda) at the west end of the mall front
  B.cyl('glassRed', S.drumX, S.drumZ, 0, 8.2, S.drumR, 32, { collide: true });
  B.cyl('white', S.drumX, S.drumZ, 8.2, 9.2, S.drumR + 0.3, 32);
  for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; const g = boxGeo([-0.07, 0, -0.07], [0.07, 8.2, 0.07]); g.translate(S.drumX + Math.cos(a) * (S.drumR + 0.05), 0, S.drumZ + Math.sin(a) * (S.drumR + 0.05)); B.add('whiteMullion', g, { uv: false }); }
  for (let k = 1; k < 4; k++) B.cyl('whiteMullion', S.drumX, S.drumZ, k * 2.05 - 0.05, k * 2.05 + 0.05, S.drumR + 0.08, 32);
  // canopy along the mall face of the brick wing (between drum and bay)
  B.box('white', [S.drumX + S.drumR, 4.2, S.z0 - 2.4], [S.bayCx - S.bayR * Math.cos(0.42) - 0.5, 4.7, S.z0 + 0.3], { collide: false });
  for (let x = S.drumX + S.drumR + 2; x < S.bayCx - S.bayR * Math.cos(0.42) - 1; x += 4) B.cyl('white', x, S.z0 - 1.8, 0, 4.2, 0.16, 10);

  // ---- Frey Hall: 3-storey ribbed concrete lecture hall (west of the Zebra Path) with a taller stair block ---------------------
  const F = FREY;
  facade(B, { x0: F.x0, x1: F.x1, z0: F.z0, z1: F.z1, floors: 3, storey: 4.5, band: 1.7, inset: 0.6, pitch: 3.6, pierW: 0.7, wall: 'ribbed', pier: 'ribbed', glass: 'glass', parapet: 0.8 });
  block(B, 'ribbed', F.x0 + 4, F.z1 - 14, F.x0 + 16, F.z1 + 0.5, 17.5);
  B.box('concreteGrey', [F.x1 - 12, 0, F.z1], [F.x1 - 2, 3.6, F.z1 + 3.2], { collide: true });               // entrance vestibule (south)
  B.box('glass', [F.x1 - 11.5, 0, F.z1 + 3.2], [F.x1 - 2.5, 3.2, F.z1 + 3.35], { collide: false });
  lettering(world, 'FREY HALL', F.x1 - 7, 4.4, F.z1 + 3.4, 6, 0.7, 0, '#3a3d40');

  // ---- Harriman Hall (west, partly outside the bounds) — ribbed concrete on a brick base ----------------------------------------
  const H = HARRIMAN;
  facade(B, { x0: H.x0, x1: H.x1, z0: H.z0, z1: H.z1, floors: 3, storey: 4.3, band: 1.6, inset: 0.5, pitch: 3.2, pierW: 0.6, wall: 'ribbed', pier: 'ribbed', ground: { h: 4.3, inset: 0.6, glass: 'brickDark', pitch: 6.4 }, parapet: 0.8 });
  // ---- Earth & Space Sciences (west edge) — 4-storey concrete slab -------------------------------------------------------------
  const E = ESS;
  facade(B, { x0: E.x0, x1: E.x1, z0: E.z0, z1: E.z1, floors: 4, storey: 4.2, band: 1.5, inset: 0.6, pitch: 3.6, pierW: 0.55, wall: 'concrete', pier: 'concrete', parapet: 0.9 });
  block(B, 'concrete', E.x1 - 12, E.z0 + 20, E.x1 + 0.4, E.z0 + 32, 22);                                    // stair tower

  // ---- Psychology A: 3-storey precast, L-shaped -----------------------------------------------------------------------------------
  const P = PSY;
  facade(B, { x0: P.x0, x1: P.wingX0 + 0.5, z0: P.z0, z1: P.z1, floors: 3, storey: 4.0, band: 1.4, inset: 0.6, pitch: 3.6, pierW: 0.5, wall: 'precast', parapet: 0.9 });
  facade(B, { x0: P.wingX0, x1: P.x1, z0: P.z0, z1: P.wingZ1, floors: 3, storey: 4.0, band: 1.4, inset: 0.6, pitch: 3.6, pierW: 0.5, wall: 'precast', parapet: 0.9 });
  lettering(world, 'PSYCHOLOGY', (P.x0 + P.x1) / 2, 4.3, P.z0 - 0.02, 7, 0.6, 0, '#3a3d40');

  // ---- Staller Center for the Arts: brown brick, ribbon windows, fly tower, west entrance canopy on the sunken plaza ---------------
  const T = STALLER;
  facade(B, { x0: T.nx0, x1: T.nx1, z0: T.nz0, z1: T.nz1, y0: PIT.floor, floors: 3, storey: 4.6, band: 3.1, inset: 0.35, pitch: 12, pierW: 0, mullionPitch: 1.6, wall: 'brickStaller', pier: 'brickStaller', parapet: 0.8 });
  facade(B, { x0: T.ex0, x1: T.ex1, z0: T.nz1 - 0.5, z1: T.ez1, y0: PIT.floor, floors: 3, storey: 4.6, band: 3.1, inset: 0.35, pitch: 12, pierW: 0, mullionPitch: 1.6, wall: 'brickStaller', pier: 'brickStaller', parapet: 0.8 });
  block(B, 'brickStaller', T.towerX0 - 6, T.towerZ0, T.towerX1, T.towerZ1, 24, { y0: PIT.floor });
  block(B, 'brickStaller', T.nx0 + 10, T.nz0 + 6, T.nx0 + 40, T.nz1 - 20, 19, { y0: PIT.floor });                 // recital hall mass
  // entrance: glazed lobby + concrete canopy on the pit floor, lettering
  B.box('glass', [T.ex0 - 0.6, PIT.floor, T.ez0 + 6], [T.ex0 + 0.2, PIT.floor + 4.2, T.ez0 + 30], { collide: false });
  for (let z = T.ez0 + 6; z <= T.ez0 + 30; z += 1.6) B.box('darkMullion', [T.ex0 - 0.66, PIT.floor, z - 0.05], [T.ex0 - 0.5, PIT.floor + 4.2, z + 0.05], { collide: false });
  B.box('concreteGrey', [T.ex0 - 5.5, PIT.floor + 4.2, T.ez0 + 5], [T.ex0 + 0.4, PIT.floor + 5.0, T.ez0 + 31], { collide: false });
  for (const z of [T.ez0 + 7, T.ez0 + 29]) B.box('concreteGrey', [T.ex0 - 5.2, PIT.floor, z - 0.35], [T.ex0 - 4.5, PIT.floor + 4.2, z + 0.35], { collide: true });
  lettering(world, 'STALLER CENTER FOR THE ARTS', T.ex0 - 5.52, PIT.floor + 4.55, T.ez0 + 18, 11, 0.5, -Math.PI / 2, '#e8e2d8');
  // raised terrace with railing along the wing's west face (mall level), reached by a ladder from the plaza + a stair from the mall
  B.box('concreteGrey', [T.ex0 - 5, PIT.floor - 0.5, T.ez0 + 32], [T.ex0, 0, T.ez1], { walkable: true });
  for (let z = T.ez0 + 32; z <= T.ez1; z += 2) B.box('steelDark', [T.ex0 - 5, 0, z - 0.03], [T.ex0 - 4.94, 1.05, z + 0.03], { collide: false });
  B.box('steelDark', [T.ex0 - 5.02, 1.0, T.ez0 + 32], [T.ex0 - 4.92, 1.08, T.ez1], { collide: false });
  world.box([T.ex0 - 5.1, 0, T.ez0 + 32], [T.ex0 - 4.9, 1.1, T.ez1]);
  world.ladder(T.ex0 - 5, T.ez0 + 32.6, PIT.floor, 0, -1, 0);
  for (let z = T.ez0 + 36; z < T.ez1 - 2; z += 8) world.cover(T.ex0 - 4.2, z, -1, 0, 0);

  // ---- Chemistry (north perimeter): 5-storey precast slab; Van de Graaff (NW) low concrete ----------------------------------------
  facade(B, { x0: CHEM.x0, x1: CHEM.x1, z0: CHEM.z0, z1: CHEM.z1, floors: 5, storey: 4.0, band: 1.5, inset: 0.6, pitch: 3.6, pierW: 0.5, wall: 'precast', parapet: 0.9 });
  block(B, 'concreteGrey', VDG.x0, VDG.z0, VDG.x1, VDG.z1, 9);
  B.hcyl('roofMetal', 'z', VDG.z0 + 2, VDG.z1 - 2, (VDG.x0 + VDG.x1) / 2, 9, (VDG.x1 - VDG.x0) / 2 - 2, 20);

  // ---- south perimeter: Educational Communications Center (brick), Engineering (precast), Javits / New CS / Light Engineering backdrop ----
  facade(B, { x0: ECC.x0, x1: ECC.x1, z0: ECC.z0, z1: ECC.z1, floors: 2, storey: 4.5, band: 1.8, inset: 0.4, pitch: 3.0, pierW: 0.8, wall: 'brickRed', pier: 'brickRed', parapet: 0.8 });
  facade(B, { x0: ENG.x0, x1: ENG.x1, z0: ENG.z0, z1: ENG.z1, floors: 3, storey: 4.2, band: 1.5, inset: 0.6, pitch: 3.6, pierW: 0.5, wall: 'precast', parapet: 0.9 });
  block(B, 'concrete', JAVITS.x0 + 8, JAVITS.z0 + 8, JAVITS.x1 - 8, JAVITS.z1 - 8, 6.5);
  for (const [cx, cz] of [[JAVITS.x0 + 14, JAVITS.z0 + 14], [JAVITS.x1 - 14, JAVITS.z0 + 14], [JAVITS.x0 + 14, JAVITS.z1 - 14], [JAVITS.x1 - 14, JAVITS.z1 - 14]]) { B.cyl('concrete', cx, cz, 0, 10.5, 13, 28, { collide: true }); B.cyl('roof', cx, cz, 10.5, 10.55, 12.6, 28); B.cyl('glass', cx, cz, 3.2, 5.0, 13.05, 28); }
  facade(B, { x0: NEWCS.x0, x1: NEWCS.x1, z0: NEWCS.z0, z1: NEWCS.z1, floors: 4, storey: 4.0, band: 1.2, inset: 0.4, pitch: 3.0, pierW: 0.3, wall: 'stuccoLight', glass: 'glassLight', parapet: 0.8 });
  facade(B, { x0: LIGHTENG.x0, x1: LIGHTENG.x1, z0: LIGHTENG.z0, z1: LIGHTENG.z1, floors: 2, storey: 4.5, band: 1.8, inset: 0.4, pitch: 3.0, pierW: 0.8, wall: 'brickRed', pier: 'brickRed', parapet: 0.8 });

  // ---- east: Humanities (precast, partly in), Administration (4-storey concrete on the mall axis, backdrop) -------------------------
  facade(B, { x0: HUM.x0, x1: HUM.x1, z0: HUM.z0, z1: HUM.z1, floors: 3, storey: 4.0, band: 1.4, inset: 0.6, pitch: 3.6, pierW: 0.5, wall: 'precast', parapet: 0.9 });
  facade(B, { x0: ADMIN.x0, x1: ADMIN.x1, z0: ADMIN.z0, z1: ADMIN.z1, floors: 4, storey: 4.0, band: 1.5, inset: 0.7, pitch: 3.6, pierW: 0.55, wall: 'concrete', pier: 'concrete', ground: { h: 4.2, inset: 1.2, pitch: 7.2 }, parapet: 0.9 });
  B.box('concreteGrey', [ADMIN.x0 - 4, 4.2, ADMIN.z0 + 22], [ADMIN.x0 + 0.5, 4.9, ADMIN.z0 + 46], { collide: false });     // entrance canopy on the mall axis
  block(B, 'concreteGrey', 277, -60, 339, 84, 13);                                                                          // Administration parking garage (backdrop)

  // ---- north backdrop: Stony Brook Union (brick), Campus Recreation Center (stucco + glass) --------------------------------------------
  facade(B, { x0: UNION.x0, x1: UNION.x1, z0: UNION.z0, z1: UNION.z1, floors: 3, storey: 4.4, band: 1.8, inset: 0.4, pitch: 3.2, pierW: 0.8, wall: 'brickRed', pier: 'brickRed', parapet: 0.8 });
  facade(B, { x0: REC.x0, x1: REC.x1, z0: REC.z0, z1: REC.z1, floors: 2, storey: 6.0, band: 2.0, inset: 0.4, pitch: 3.0, pierW: 0.3, wall: 'stucco', glass: 'glassLight', parapet: 0.8 });

  // ---- Charles B. Wang Center (NE backdrop): grey stepped stucco masses, red steel entry frame, stacked lantern tower + masts, pond ----
  const Wg = WANG;
  block(B, 'stucco', Wg.x0, Wg.z0 + 30, Wg.x0 + 60, Wg.z1, 18);
  block(B, 'stucco', Wg.x0 + 20, Wg.z0 + 10, Wg.x0 + 75, Wg.z0 + 40, 22);
  block(B, 'stucco', Wg.x0 + 60, Wg.z0 + 30, Wg.x1 - 30, Wg.z1 + 2, 15);
  block(B, 'stucco', Wg.x0 + 75, Wg.z0, Wg.x1, Wg.z0 + 50, 20);
  block(B, 'stucco', Wg.x0 + 100, Wg.z0 + 50, Wg.x1 - 10, Wg.z1 - 10, 12);
  for (let k = 0; k < 4; k++) B.box('glassLight', [Wg.x0 + 62 + k * 18, 3, Wg.z1 - 12], [Wg.x0 + 70 + k * 18, 15, Wg.z1 + 2.2], { collide: false });
  // red frame portal at the south-west entrance (facing the mall/library)
  const fx0 = Wg.x0 + 10, fx1 = Wg.x0 + 30, fz = Wg.z1 + 2;
  for (const x of [fx0, fx1]) for (const z of [fz, fz + 8]) B.box('red', [x - 0.4, 0, z - 0.4], [x + 0.4, 9, z + 0.4], { collide: true });
  for (const y of [4.5, 8.6]) { B.box('red', [fx0 - 0.4, y - 0.35, fz - 0.4], [fx1 + 0.4, y + 0.35, fz + 0.4], { collide: false }); B.box('red', [fx0 - 0.4, y - 0.35, fz + 7.6], [fx1 + 0.4, y + 0.35, fz + 8.4], { collide: false }); for (const x of [fx0, fx1]) B.box('red', [x - 0.4, y - 0.35, fz], [x + 0.4, y + 0.35, fz + 8], { collide: false }); }
  B.box('glass', [fx0 + 1, 0, fz + 1], [fx1 - 1, 8.2, fz + 7], { collide: true });
  // lantern tower: stacked hexagonal metal tiers on a stucco shaft + four white masts
  const tx = Wg.x0 + 52, tz = Wg.z0 + 26;
  B.cyl('stucco', tx, tz, 0, 22, 2.2, 6);
  for (let k = 0; k < 9; k++) B.cyl('alu', tx, tz, 20 + k * 1.5, 20 + k * 1.5 + 0.7, 3.4 - k * 0.12, 6);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.cyl('white', tx + dx * 1.2, tz + dz * 1.2, 33, 42, 0.12, 6);
  // Wang courtyard pond (backdrop)
  B.box('water', [Wg.x0 + 30, -0.05, Wg.z1 - 30], [Wg.x0 + 58, 0.0, Wg.z1 - 8], { collide: false });

  // ---- campus wayfinding signs (generic text, red panels on steel posts) ---------------------------------------------------------------
  const signs = [
    { x: -62, z: 6, ry: 0, text: 'ACADEMIC MALL', sub: 'LIBRARY  ·  STALLER CENTER  →' },
    { x: 60, z: 14, ry: Math.PI, text: 'STUDENT ACTIVITIES CENTER', sub: '←  BUS LOOP  ·  CAMPUS DRIVE' },
    { x: 120, z: -12, ry: 0, text: 'ADMINISTRATION  →', sub: 'WANG CENTER  ·  STALLER STEPS' },
    { x: -35, z: -30, ry: 0, text: 'ZEBRA PATH', sub: 'CHEMISTRY  ·  STUDENT UNION  ↑' },
    { x: -118, z: 66, ry: Math.PI / 2, text: 'CAMPUS DRIVE', sub: 'BUS LOOP' },
  ];
  for (const s of signs) {
    const t = signTexture({ text: s.text, sub: s.sub, w: 768, h: 192, font: 'bold 54px Helvetica, Arial, sans-serif' });
    const m = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.65, 0.08), [M.red, M.red, M.red, M.red, new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 })]);
    m.position.set(s.x, 2.4, s.z); m.rotation.y = s.ry; m.castShadow = true; m.name = 'sbu:sign'; scene.add(m); world.solid(m, 'metal', { collide: false });
    B.cyl('steelDark', s.x + Math.cos(s.ry) * 1.1, s.z - Math.sin(s.ry) * 1.1, 0, 2.75, 0.06, 8);
    B.cyl('steelDark', s.x - Math.cos(s.ry) * 1.1, s.z + Math.sin(s.ry) * 1.1, 0, 2.75, 0.06, 8);
    world.box([s.x - 0.3, 0, s.z - 0.3], [s.x + 0.3, 2.8, s.z + 0.3]);
  }

  B.flush();
}
