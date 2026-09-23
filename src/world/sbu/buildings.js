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
  const { x0, x1, z0, z1 } = o; const y0 = o.y0 ?? 0; const R = B.world.R;
  const storey = o.storey ?? 4.2, band = o.band ?? 1.5, inset = o.inset ?? 0.7, pitch = o.pitch ?? 4.2, pierW = o.pierW ?? 0.5;
  const wall = o.wall ?? 'precast', glass = o.glass ?? 'glass', pier = o.pier ?? wall, lip = o.lip ?? 0.3, litP = o.lit ?? 0.3;
  const pierOut = o.pierOut ?? 0.15;                 // piers stand proud of the spandrel face
  let y = y0;
  if (o.ground) {
    const g = o.ground; const gi = g.inset ?? 1.2; const gh = g.h ?? storey; const gk = g.glass ?? 'glassDark';
    B.box(gk, [x0 + gi, y, z0 + gi], [x1 - gi, y + gh, z1 - gi], { collide: false });
    const cp = g.pitch ?? pitch * 2; const cw = g.colW ?? Math.max(pierW, 0.6);
    for (let x = x0 + 0.2; x < x1 - cw; x += cp) { B.box(pier, [x, y, z0 + 0.1], [x + cw, y + gh, z0 + 0.1 + cw], { collide: false }); B.box(pier, [x, y, z1 - 0.1 - cw], [x + cw, y + gh, z1 - 0.1], { collide: false }); }
    for (let z = z0 + 0.2; z < z1 - cw; z += cp) { B.box(pier, [x0 + 0.1, y, z], [x0 + 0.1 + cw, y + gh, z + cw], { collide: false }); B.box(pier, [x1 - 0.1 - cw, y, z], [x1 - 0.1, y + gh, z + cw], { collide: false }); }
    for (const [cx, cz] of [[x0 + 0.1, z0 + 0.1], [x1 - 0.1 - cw, z0 + 0.1], [x0 + 0.1, z1 - 0.1 - cw], [x1 - 0.1 - cw, z1 - 0.1 - cw]]) B.box(pier, [cx, y, cz], [cx + cw, y + gh, cz + cw], { collide: false });
    // soffit of the arcade (underside of the first slab) + dark mullions on the recessed glass
    B.box(wall, [x0, y + gh - 0.5, z0], [x1, y + gh, z1], { collide: false });
    const mp = 2.4;
    for (let x = x0 + gi + mp; x < x1 - gi; x += mp) { B.box('darkMullion', [x - 0.05, y, z0 + gi - 0.1], [x + 0.05, y + gh - 0.5, z0 + gi], { collide: false }); B.box('darkMullion', [x - 0.05, y, z1 - gi], [x + 0.05, y + gh - 0.5, z1 - gi + 0.1], { collide: false }); }
    y += gh;
  }
  const floors = o.floors ?? 3;
  for (let f = 0; f < floors; f++) {
    const wy = y, wh = storey - band;
    // recessed glass per bay (random 30 % lit), mullions at bay pitch inside the reveal
    const bays = (a0, a1, side) => {
      for (let a = a0; a < a1 - 0.05; a += pitch) {
        const b1 = Math.min(a1, a + pitch); const key = R() < litP ? 'glassLit' : glass;
        if (side === 'n') B.box(key, [a, wy, z0 + inset], [b1, wy + wh, z0 + inset + 0.05], { collide: false });
        if (side === 's') B.box(key, [a, wy, z1 - inset - 0.05], [b1, wy + wh, z1 - inset], { collide: false });
        if (side === 'w') B.box(key, [x0 + inset, wy, a], [x0 + inset + 0.05, wy + wh, b1], { collide: false });
        if (side === 'e') B.box(key, [x1 - inset - 0.05, wy, a], [x1 - inset, wy + wh, b1], { collide: false });
      }
    };
    bays(x0, x1, 'n'); bays(x0, x1, 's'); bays(z0, z1, 'w'); bays(z0, z1, 'e');
    // reveal returns (the sides of the recess) so the glass sits in a real pocket
    B.box(wall, [x0 + inset, wy, z0 + inset], [x1 - inset, wy + wh, z1 - inset], { collide: false });
    if (pierW > 0) {
      for (let x = x0 + pitch / 2 - pierW / 2; x < x1 - pierW; x += pitch) { B.box(pier, [x, wy, z0 - pierOut], [x + pierW, wy + wh, z0 + inset], { collide: false }); B.box(pier, [x, wy, z1 - inset], [x + pierW, wy + wh, z1 + pierOut], { collide: false }); }
      for (let z = z0 + pitch / 2 - pierW / 2; z < z1 - pierW; z += pitch) { B.box(pier, [x0 - pierOut, wy, z], [x0 + inset, wy + wh, z + pierW], { collide: false }); B.box(pier, [x1 - inset, wy, z], [x1 + pierOut, wy + wh, z + pierW], { collide: false }); }
      // corner piers
      for (const [cx, cz] of [[x0 - pierOut, z0 - pierOut], [x1 + pierOut - inset - pierW, z0 - pierOut], [x0 - pierOut, z1 + pierOut - inset - pierW], [x1 + pierOut - inset - pierW, z1 + pierOut - inset - pierW]]) B.box(pier, [cx, wy, cz], [cx + inset + pierW, wy + wh, cz + inset + pierW], { collide: false });
    }
    const mp = o.mullionPitch ?? pitch / 3, mm = o.mullionW ?? 0.14;   // ≥ 0.12 m: thin mullions shimmer into dashes at distance
    if (mp > 0) {
      for (let x = x0 + mp; x < x1 - 0.2; x += mp) { B.box('darkMullion', [x - mm / 2, wy, z0 + inset - 0.08], [x + mm / 2, wy + wh, z0 + inset + 0.02], { collide: false }); B.box('darkMullion', [x - mm / 2, wy, z1 - inset - 0.02], [x + mm / 2, wy + wh, z1 - inset + 0.08], { collide: false }); }
      for (let z = z0 + mp; z < z1 - 0.2; z += mp) { B.box('darkMullion', [x0 + inset - 0.08, wy, z - mm / 2], [x0 + inset + 0.02, wy + wh, z + mm / 2], { collide: false }); B.box('darkMullion', [x1 - inset - 0.02, wy, z - mm / 2], [x1 - inset + 0.08, wy + wh, z + mm / 2], { collide: false }); }
      B.box('darkMullion', [x0 + inset - 0.08, wy + wh * 0.5 - mm, z0 + inset - 0.08], [x1 - inset + 0.08, wy + wh * 0.5 + mm, z1 - inset + 0.08], { collide: false });
    }
    // soot / rain staining hanging under every window sill (0.5 m, alpha 0.35) — brick never reads as one clean tile
    if (o.sillStain !== false) {
      const sy0 = wy - 0.62, sy1 = wy - 0.06, e = lip + 0.035;
      if (sy0 > y0 + 0.2) {
        B.box('sillStain', [x0 + 0.3, sy0, z0 - e - 0.02], [x1 - 0.3, sy1, z0 - e], { collide: false, uv: false });
        B.box('sillStain', [x0 + 0.3, sy0, z1 + e], [x1 - 0.3, sy1, z1 + e + 0.02], { collide: false, uv: false });
        B.box('sillStain', [x0 - e - 0.02, sy0, z0 + 0.3], [x0 - e, sy1, z1 - 0.3], { collide: false, uv: false });
        B.box('sillStain', [x1 + e, sy0, z0 + 0.3], [x1 + e + 0.02, sy1, z1 - 0.3], { collide: false, uv: false });
      }
    }
    // spandrel band with a projecting slab lip at its base (reads as the floor slab)
    B.box(wall, [x0 - lip, wy + wh, z0 - lip], [x1 + lip, wy + wh + 0.35, z1 + lip], { collide: false });
    B.box(wall, [x0, wy + wh + 0.35, z0], [x1, wy + storey, z1], { collide: false });
    // lighter cast-concrete band at each floor line (0.3 m) — the horizontal course that breaks up brick
    if (o.floorBand) {
      const fb = lip + 0.06;
      B.box('floorBand', [x0 - fb, wy + wh + 0.05, z0 - fb], [x1 + fb, wy + wh + 0.35, z1 + fb], { collide: false });
    }
    y += storey;
  }
  if (o.top) { B.box(o.top.key, [x0, y, z0], [x1, y + o.top.h, z1], { collide: false }); y += o.top.h; }
  const par = o.parapet ?? 0.9;
  if (par > 0) { B.box(wall, [x0, y, z0], [x1, y + par, z1], { collide: false }); y += par; }
  roofKit(B, x0, z0, x1, z1, y, o.roof ?? 'roof', R, o.hvac ?? 4);
  if (o.collide !== false) B.world.box([x0 - pierOut, y0, z0 - pierOut], [x1 + pierOut, y, z1 + pierOut]);
  return { top: y };
}

/** Roof: gravel surface + HVAC units / vents. */
export function roofKit(B, x0, z0, x1, z1, yTop, key, R, n = 4) {
  // parapet cap ring (0.4 m) + gravel deck just above the slab top
  for (const [a, b] of [[[x0 - 0.1, z0 - 0.1], [x1 + 0.1, z0 + 0.4]], [[x0 - 0.1, z1 - 0.4], [x1 + 0.1, z1 + 0.1]], [[x0 - 0.1, z0], [x0 + 0.4, z1]], [[x1 - 0.4, z0], [x1 + 0.1, z1]]]) B.box('graniteCap', [a[0], yTop, a[1]], [b[0], yTop + 0.3, b[1]], { collide: false });
  B.box(key, [x0 + 0.4, yTop, z0 + 0.4], [x1 - 0.4, yTop + 0.03, z1 - 0.4], { collide: false });
  yTop += 0.28;
  const w = x1 - x0 - 6, d = z1 - z0 - 6; if (w < 4 || d < 4) return;
  for (let i = 0; i < n; i++) {
    const ux = x0 + 3 + R() * (w - 3), uz = z0 + 3 + R() * (d - 3); const s = 1.6 + R() * 2.2, h = 1.0 + R() * 1.2;
    B.box('hvac', [ux, yTop - 0.25, uz], [ux + s, yTop - 0.25 + h, uz + s * (0.6 + R() * 0.5)], { collide: false });
    if (R() < 0.5) B.cyl('hvac', ux + s / 2, uz + s * 0.4, yTop - 0.25 + h, yTop - 0.25 + h + 0.35, s * 0.32, 12);
  }
  if (R() < 0.7) B.box('steelDark', [x0 + 4, yTop - 0.25, z0 + 4], [x0 + 5.6, yTop + 2.2, z0 + 5.6], { collide: false }); // stair bulkhead
}

/** Plain massing block (backdrop). */
export function block(B, key, x0, z0, x1, z1, h, { y0 = 0, roof = 'roof', collide = true, hvac = 2 } = {}) {
  B.box(key, [x0, y0, z0], [x1, y0 + h, z1], { collide });
  roofKit(B, x0, z0, x1, z1, y0 + h, roof, B.world.R, hvac);
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

  // ---- the Library: 6 storeys of pale precast bands on a deep pier grid, arcade at ground, slit clerestory, sawtooth roof, brick stair towers ---
  const L = LIB;
  const lib = facade(B, { x0: L.x0, x1: L.x1, z0: L.z0, z1: L.z1, floors: 4, storey: 4.2, band: 1.5, inset: 0.8, pitch: 4.2, pierW: 0.6, pierOut: 0.2, wall: 'precast', glass: 'glass', ground: { h: 4.6, inset: 3.0, glass: 'glassDark', pitch: 8.4, colW: 0.8 }, top: { h: 4.2, key: 'slit' }, parapet: 1.0, hvac: 8 });
  facade(B, { x0: L.wingX0, x1: L.x0 + 0.5, z0: L.wingZ0, z1: L.wingZ1, floors: 4, storey: 4.2, band: 1.5, inset: 0.8, pitch: 4.2, pierW: 0.6, pierOut: 0.2, wall: 'precast', ground: { h: 4.6, inset: 3.0, glass: 'glassDark', pitch: 8.4, colW: 0.8 }, top: { h: 4.2, key: 'slit' }, parapet: 1.0, hvac: 2 });
  sawtooth(B, L.x0 + 4, L.x1 - 4, L.z0 + 6, L.z1 - 12, lib.top - 0.3, 7, 2.6);
  // brick stair/service towers (dark brick) rising above the parapet
  block(B, 'brickDark', L.x0 - 1.5, L.z1 - 8, L.x0 + 4.5, L.z1 + 0.8, lib.top + 2.4, { hvac: 0 });
  block(B, 'brickDark', L.x1 - 6, L.z0 - 0.8, L.x1 + 0.8, L.z0 + 7, lib.top + 2.4, { hvac: 0 });
  block(B, 'brickDark', L.x0 - 1.5, L.z0 - 0.8, L.x0 + 4.5, L.z0 + 7, lib.top + 1.6, { hvac: 0 });
  // entrance under the arcade: glass vestibule flush with the columns, canopy slab projecting over the walk, lettering on the canopy fascia
  B.box('glassDark', [L.entX0, 0, L.z1 - 3.0], [L.entX1, 4.1, L.z1 - 0.4], { collide: true });
  for (let x = L.entX0; x <= L.entX1 + 0.01; x += 1.5) B.box('alu', [x - 0.06, 0, L.z1 - 0.5], [x + 0.06, 4.1, L.z1 - 0.34], { collide: false });
  B.box('alu', [L.entX0 - 0.1, 2.2, L.z1 - 0.5], [L.entX1 + 0.1, 2.32, L.z1 - 0.34], { collide: false });
  B.box('precast', [L.entX0 - 3, 4.6, L.z1 - 3.0], [L.entX1 + 3, 5.2, L.z1 + 3.6], { collide: false });                 // canopy slab
  B.box('precast', [L.entX0 - 3, 4.6, L.z1 + 3.2], [L.entX1 + 3, 6.2, L.z1 + 3.6], { collide: false });                 // fascia panel
  lettering(world, 'LIBRARY', (L.entX0 + L.entX1) / 2, 5.25, L.z1 + 3.62, 7.5, 0.7);
  lettering(world, 'Central Memorial', (L.entX0 + L.entX1) / 2, 5.85, L.z1 + 3.62, 7.5, 0.34);
  for (const x of [L.entX0 - 2.4, L.entX1 + 2.4]) B.cyl('precast', x, L.z1 + 3.0, 0, 4.6, 0.3, 12, { collide: true });
  // arcade floor + planters at the columns, library east face at the Staller terraces: base wall down to the pit floor
  B.box('terrazzo', [L.x0 + 0.1, 0.0, L.z1 - 3.0], [L.x1 - 0.1, 0.06, L.z1], { collide: false });
  B.box('precastDark', [L.x1 - 0.2, PIT.floor - 0.5, PIT.z0], [L.x1 + 0.2, 0.05, PIT.z1], { collide: false });
  for (let x = L.x0 + 3; x < L.x1 - 3; x += 16.8) { if (x > L.entX0 - 5 && x < L.entX1 + 5) continue; B.box('concreteGrey', [x, 0, L.z1 - 2.6], [x + 3.2, 0.5, L.z1 - 0.6]); B.box('hedge', [x + 0.1, 0.5, L.z1 - 2.5], [x + 3.1, 1.0, L.z1 - 0.7], { collide: false }); world.cover(x + 1.6, L.z1 + 0.3, 0, 1); }

  // ---- Student Activities Center ----------------------------------------------------------------------------------------
  const S = SAC;
  // glass hall (west front onto the SAC plaza): white steel curtain wall 2 storeys + fascia band with plate bosses
  B.box('glass', [S.x0 + 0.4, 0, S.z0 + 0.4], [S.hallX1, 10.6, S.hallZ1 - 0.4], { collide: true });
  curtain(B, { face: 'w', a0: S.z0, a1: S.hallZ1, c: S.x0 + 0.4, y0: 0, y1: 10.6, cellW: 2.55, cellH: 2.65, glass: 'glass' });
  curtain(B, { face: 'n', a0: S.x0, a1: S.hallX1, c: S.z0 + 0.4, y0: 0, y1: 10.6, cellW: 2.6, cellH: 2.65, glass: 'glass' });
  curtain(B, { face: 's', a0: S.x0, a1: S.hallX1, c: S.hallZ1 - 0.4, y0: 0, y1: 10.6, cellW: 2.6, cellH: 2.65, glass: 'glass' });
  // a few lit bays behind the curtain wall (interior lights)
  for (let z = S.z0 + 3; z < S.hallZ1 - 3; z += 7.6) B.box('glassLit', [S.x0 + 1.2, 0.2, z], [S.x0 + 1.3, 4.8, z + 3.8], { collide: false });
  B.box('fascia', [S.x0 - 0.3, 10.6, S.z0 - 0.3], [S.hallX1 + 0.3, 12.4, S.hallZ1 + 0.3], { collide: false });
  B.box('gravelRoof', [S.x0, 12.4, S.z0], [S.hallX1, 12.45, S.hallZ1], { collide: false });
  roofKit(B, S.x0, S.z0, S.hallX1, S.hallZ1, 12.7, 'gravelRoof', R, 3);
  for (let z = S.z0 + 2; z < S.hallZ1; z += 5.1) { B.cyl('parapetMetal', S.x0 - 0.33, z, 11.85, 12.25, 0.22, 12); B.box('parapetMetal', [S.x0 - 0.33, 10.8, z + 2.2], [S.x0 - 0.3, 11.2, z + 2.6], { collide: false }); }   // circle + plate bosses
  for (let x = S.x0 + 2; x < S.hallX1; x += 5.1) { B.cyl('parapetMetal', x, S.z0 - 0.33, 11.85, 12.25, 0.22, 12); B.cyl('parapetMetal', x, S.hallZ1 + 0.33, 11.85, 12.25, 0.22, 12); }
  // white entrance vestibule (walkable roof via ladder): terrazzo floor, tinted glass, six aluminium doors, roof beams, painted-metal parapet
  const V = { x0: S.x0 - 4.2, x1: S.x0 - 0.2, z0: S.z0 + 9, z1: S.z0 + 20 };
  B.box('fascia', [V.x0, 4.3, V.z0], [V.x1, 4.6, V.z1], { collide: false });                                                   // roof slab
  world.walkable([V.x0, 0, V.z0], [V.x1, 4.6, V.z1]);
  B.box('terrazzo', [V.x0 + 0.3, 4.6, V.z0 + 0.3], [V.x1 - 0.3, 4.66, V.z1 - 0.3], { collide: false });
  B.box('terrazzo', [V.x0 + 0.1, 0, V.z0 + 0.1], [V.x1, 0.05, V.z1 - 0.1], { collide: false });
  for (let z = V.z0 + 0.6; z < V.z1; z += 2.2) B.box('parapetMetal', [V.x0 + 0.2, 4.0, z], [V.x1, 4.3, z + 0.18], { collide: false });   // roof beams under the slab
  B.box('glassDark', [V.x0 - 0.1, 0.1, V.z0 + 0.6], [V.x0 + 0.1, 2.5, V.z1 - 0.6], { collide: false });
  for (let z = V.z0 + 0.6; z <= V.z1 - 0.6 + 0.01; z += 1.4) { B.box('alu', [V.x0 - 0.16, 0, z - 0.05], [V.x0 + 0.02, 2.7, z + 0.05], { collide: false }); B.box('alu', [V.x0 - 0.16, 1.05, z - 0.05], [V.x0 - 0.12, 1.1, z + 1.35], { collide: false }); } // door frames + push bars
  B.box('alu', [V.x0 - 0.16, 2.6, V.z0 + 0.5], [V.x0 + 0.02, 2.75, V.z1 - 0.5], { collide: false });
  B.box('fascia', [V.x0 - 0.2, 2.75, V.z0], [V.x1, 4.0, V.z0 + 0.15], { collide: false }); B.box('fascia', [V.x0 - 0.2, 2.75, V.z1 - 0.15], [V.x1, 4.0, V.z1], { collide: false });
  B.box('glass', [V.x0 - 0.05, 2.75, V.z0 + 0.5], [V.x0 + 0.05, 4.0, V.z1 - 0.5], { collide: false });                          // clerestory over the doors
  B.box('fascia', [V.x0 - 0.2, 0, V.z0], [V.x0 + 0.1, 2.75, V.z0 + 0.6], { collide: false }); B.box('fascia', [V.x0 - 0.2, 0, V.z1 - 0.6], [V.x0 + 0.1, 2.75, V.z1], { collide: false });
  B.box('parapetMetal', [V.x0 - 0.3, 4.6, V.z0 - 0.3], [V.x0 + 0.1, 5.5, V.z1 + 0.3], { collide: false });                       // parapet: west + ends
  B.box('parapetMetal', [V.x0 - 0.3, 4.6, V.z0 - 0.3], [V.x1 + 0.2, 5.5, V.z0 + 0.1], { collide: false }); B.box('parapetMetal', [V.x0 - 0.3, 4.6, V.z1 - 0.1], [V.x1 + 0.2, 5.5, V.z1 + 0.3], { collide: false });
  world.box([V.x0 - 0.3, 4.6, V.z0 - 0.3], [V.x0 + 0.1, 5.5, V.z1 + 0.3]); world.box([V.x0 - 0.3, 4.6, V.z0 - 0.3], [V.x1 + 0.2, 5.5, V.z0 + 0.1]); world.box([V.x0 - 0.3, 4.6, V.z1 - 0.1], [V.x1 + 0.2, 5.5, V.z1 + 0.3]);
  world.ladder(S.x0 - 2.2, V.z0 - 0.3, 0, 4.6, 0, -1);
  lettering(world, 'STUDENT  ACTIVITIES  CENTER', S.x0 - 0.62, 11.25, (S.z0 + S.hallZ1) / 2, 26, 1.0, -Math.PI / 2, '#55606a');
  // brick wings behind the hall: 3 storeys with ribbon windows + barrel-vault roofs
  facade(B, { x0: S.hallX1, x1: S.x1, z0: S.z0, z1: 66, floors: 3, storey: 4.6, band: 2.4, inset: 0.45, pitch: 3.0, pierW: 0.9, wall: 'brickRed', glass: 'glass', parapet: 0.7, floorBand: true });
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
  lettering(world, 'HOLLIS HALL', F.x1 - 7, 4.4, F.z1 + 3.4, 6.4, 0.7, 0, '#3a3d40');

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

  // ---- Center for the Arts (Staller-style): stepped brown-brick boxes, deep ribbon windows, 24 m fly tower, cantilevered concrete balcony with lettering, recessed glass lobby, ramps + railings ----
  const T = STALLER;
  facade(B, { x0: T.nx0, x1: T.nx1, z0: T.nz0, z1: T.nz1, y0: PIT.floor, floors: 3, storey: 4.6, band: 3.1, inset: 0.6, pitch: 12, pierW: 0, mullionPitch: 2.0, lip: 0.15, wall: 'brickStaller', pier: 'brickStaller', parapet: 0.8, hvac: 5, floorBand: true });
  facade(B, { x0: T.ex0, x1: T.ex1, z0: T.nz1 - 0.5, z1: T.ez1, y0: PIT.floor, floors: 3, storey: 4.6, band: 3.1, inset: 0.6, pitch: 12, pierW: 0, mullionPitch: 2.0, lip: 0.15, wall: 'brickStaller', pier: 'brickStaller', parapet: 0.8, hvac: 3, floorBand: true });
  block(B, 'brickStaller', T.towerX0 - 6, T.towerZ0, T.towerX1, T.towerZ1, 24, { y0: PIT.floor, hvac: 2 });                       // fly tower
  block(B, 'brickStaller', T.nx0 + 10, T.nz0 + 6, T.nx0 + 40, T.nz1 - 20, 19, { y0: PIT.floor, hvac: 2 });                        // recital hall mass
  block(B, 'brickStaller', T.ex0 - 12, T.nz1 - 0.5, T.ex0 + 0.5, T.nz1 + 14, 12.5, { y0: PIT.floor, hvac: 1 });                    // stepped lobby box at the corner (west of the wing)
  block(B, 'brickStaller', T.ex0 - 12, T.ez1 - 12, T.ex0 + 0.5, T.ez1 + 0.5, 9.0, { y0: PIT.floor, hvac: 1 });                     // south box
  // lobby: recessed dark glass two storeys under the balcony, mullions, doors
  B.box('glassDark', [T.ex0 - 0.6, PIT.floor, T.nz1 + 14], [T.ex0 + 0.2, PIT.floor + 7.6, T.ez1 - 12], { collide: false });
  for (let z = T.nz1 + 14; z <= T.ez1 - 12; z += 1.6) B.box('darkMullion', [T.ex0 - 0.66, PIT.floor, z - 0.05], [T.ex0 - 0.5, PIT.floor + 7.6, z + 0.05], { collide: false });
  B.box('darkMullion', [T.ex0 - 0.66, PIT.floor + 2.6, T.nz1 + 14], [T.ex0 - 0.5, PIT.floor + 2.7, T.ez1 - 12], { collide: false });
  for (let z = T.nz1 + 14; z < T.ez1 - 12; z += 7.6) B.box('glassLit', [T.ex0 - 0.5, PIT.floor + 0.2, z + 1.6], [T.ex0 - 0.4, PIT.floor + 2.5, z + 4.8], { collide: false });
  // cantilevered concrete balcony (5 m deep) with a solid parapet carrying the lettering, on two concrete fins
  const bz0 = T.nz1 + 16, bz1 = T.ez1 - 14;
  B.box('concreteGrey', [T.ex0 - 5.5, PIT.floor + 4.2, bz0], [T.ex0 + 0.4, PIT.floor + 4.7, bz1], { collide: false });
  B.box('concreteGrey', [T.ex0 - 5.5, PIT.floor + 4.7, bz0], [T.ex0 - 5.1, PIT.floor + 5.8, bz1], { collide: false });
  world.walkable([T.ex0 - 5.5, PIT.floor, bz0], [T.ex0 - 0.6, PIT.floor + 4.7, bz1]); world.box([T.ex0 - 5.6, PIT.floor + 4.7, bz0], [T.ex0 - 5.0, PIT.floor + 5.9, bz1]);
  for (const z of [bz0 + 0.5, bz1 - 0.5]) B.box('concreteGrey', [T.ex0 - 5.4, PIT.floor, z - 0.35], [T.ex0 - 4.6, PIT.floor + 4.2, z + 0.35], { collide: true });
  lettering(world, 'CENTER FOR THE ARTS', T.ex0 - 5.52, PIT.floor + 5.25, (bz0 + bz1) / 2, 14, 0.62, -Math.PI / 2, '#e8e2d8');
  // cantilevered upper box: the two top storeys of the wing overhang the balcony by 6.5 m on a dark soffit (staller_steps.jpg, right)
  {
    const cx0 = T.ex0 - 6.6, cz0 = bz0 - 6, cz1 = bz1 + 6, cy0 = PIT.floor + 7.0, cy1 = PIT.floor + 14.0;
    B.box('brickStaller', [cx0, cy0 + 0.55, cz0], [T.ex0 + 0.2, cy1, cz1], { collide: false });
    B.box('steelDark', [cx0 - 0.05, cy0, cz0 - 0.05], [T.ex0 + 0.2, cy0 + 0.55, cz1 + 0.05], { collide: false });        // shadow soffit / slab edge
    B.box('floorBand', [cx0 - 0.12, cy0 + 0.55, cz0 - 0.12], [T.ex0 + 0.2, cy0 + 0.88, cz1 + 0.12], { collide: false });
    B.box('floorBand', [cx0 - 0.12, cy1 - 0.4, cz0 - 0.12], [T.ex0 + 0.2, cy1, cz1 + 0.12], { collide: false });
    world.box([cx0, cy0, cz0], [T.ex0 + 0.2, cy1, cz1]);
    // deep ribbon windows on the overhanging west face + the two returns
    for (const [ry0, ry1] of [[cy0 + 1.5, cy0 + 3.4], [cy0 + 5.4, cy0 + 7.3]]) {
      B.box('glassDark', [cx0 - 0.02, ry0, cz0 + 0.8], [cx0 + 0.5, ry1, cz1 - 0.8], { collide: false });
      for (let z = cz0 + 0.8; z < cz1 - 0.8; z += 2.0) B.box('darkMullion', [cx0 - 0.08, ry0, z - 0.07], [cx0 + 0.06, ry1, z + 0.07], { collide: false });
      for (let z = cz0 + 4; z < cz1 - 4; z += 12) B.box('glassLit', [cx0 + 0.06, ry0 + 0.2, z], [cx0 + 0.14, ry1 - 0.2, z + 3.4], { collide: false });
      B.box('graniteCap', [cx0 - 0.28, ry0 - 0.22, cz0 + 0.7], [cx0 + 0.1, ry0, cz1 - 0.7], { collide: false });          // sill
    }
    // white pipe railing continuing the balcony line past the overhang
    for (const yy of [PIT.floor + 4.75, PIT.floor + 5.35]) { B.box('white', [T.ex0 - 5.35, yy, cz0], [T.ex0 - 5.21, yy + 0.09, bz0], { collide: false }); B.box('white', [T.ex0 - 5.35, yy, bz1], [T.ex0 - 5.21, yy + 0.09, cz1], { collide: false }); }
    for (let z = cz0; z < cz1; z += 2.4) { if (z > bz0 && z < bz1) continue; B.box('white', [T.ex0 - 5.34, PIT.floor + 4.7, z - 0.05], [T.ex0 - 5.22, PIT.floor + 5.44, z + 0.05], { collide: false }); }
  }
  world.ladder(T.ex0 - 5.5, bz1 - 3, PIT.floor, PIT.floor + 4.7, -1, 0);                                                            // balcony ladder
  for (let z = bz0 + 6; z < bz1 - 4; z += 10) world.cover(T.ex0 - 4.6, z, -1, 0, PIT.floor + 4.7);
  // planting at the base + ramp with railing from the plaza floor up to the mall-level terrace along the south box
  for (let z = T.nz1 + 16; z < T.ez1 - 14; z += 9) { B.box('concreteGrey', [T.ex0 - 3.2, PIT.floor, z], [T.ex0 - 1.0, PIT.floor + 0.5, z + 3.2]); B.box('hedge', [T.ex0 - 3.1, PIT.floor + 0.5, z + 0.1], [T.ex0 - 1.1, PIT.floor + 1.1, z + 3.1], { collide: false }); world.cover(T.ex0 - 3.8, z + 1.6, -1, 0, PIT.floor); }

  // ---- Chemistry (north perimeter): 5-storey precast slab; Van de Graaff (NW) low concrete ----------------------------------------
  facade(B, { x0: CHEM.x0, x1: CHEM.x1, z0: CHEM.z0, z1: CHEM.z1, floors: 5, storey: 4.0, band: 1.5, inset: 0.6, pitch: 3.6, pierW: 0.5, wall: 'precast', parapet: 0.9 });
  block(B, 'concreteGrey', VDG.x0, VDG.z0, VDG.x1, VDG.z1, 9);
  B.hcyl('roofMetal', 'z', VDG.z0 + 2, VDG.z1 - 2, (VDG.x0 + VDG.x1) / 2, 9, (VDG.x1 - VDG.x0) / 2 - 2, 20);

  // ---- south perimeter: Educational Communications Center (brick), Engineering (precast), Javits / New CS / Light Engineering backdrop ----
  facade(B, { x0: ECC.x0, x1: ECC.x1, z0: ECC.z0, z1: ECC.z1, floors: 2, storey: 4.5, band: 1.8, inset: 0.4, pitch: 3.0, pierW: 0.8, wall: 'brickRed', pier: 'brickRed', parapet: 0.8, floorBand: true });
  facade(B, { x0: ENG.x0, x1: ENG.x1, z0: ENG.z0, z1: ENG.z1, floors: 3, storey: 4.2, band: 1.5, inset: 0.6, pitch: 3.6, pierW: 0.5, wall: 'precast', parapet: 0.9 });
  block(B, 'concrete', JAVITS.x0 + 8, JAVITS.z0 + 8, JAVITS.x1 - 8, JAVITS.z1 - 8, 6.5);
  for (const [cx, cz] of [[JAVITS.x0 + 14, JAVITS.z0 + 14], [JAVITS.x1 - 14, JAVITS.z0 + 14], [JAVITS.x0 + 14, JAVITS.z1 - 14], [JAVITS.x1 - 14, JAVITS.z1 - 14]]) { B.cyl('concrete', cx, cz, 0, 10.5, 13, 28, { collide: true }); B.cyl('roof', cx, cz, 10.5, 10.55, 12.6, 28); B.cyl('glass', cx, cz, 3.2, 5.0, 13.05, 28); }
  facade(B, { x0: NEWCS.x0, x1: NEWCS.x1, z0: NEWCS.z0, z1: NEWCS.z1, floors: 4, storey: 4.0, band: 1.2, inset: 0.4, pitch: 3.0, pierW: 0.3, wall: 'stuccoLight', glass: 'glassLight', parapet: 0.8 });
  facade(B, { x0: LIGHTENG.x0, x1: LIGHTENG.x1, z0: LIGHTENG.z0, z1: LIGHTENG.z1, floors: 2, storey: 4.5, band: 1.8, inset: 0.4, pitch: 3.4, pierW: 0.8, wall: 'brickRed', pier: 'brickRed', parapet: 0.8, mullionPitch: 0, sillStain: false });

  // ---- east: Humanities (precast, partly in), Administration (4-storey concrete on the mall axis, backdrop) -------------------------
  facade(B, { x0: HUM.x0, x1: HUM.x1, z0: HUM.z0, z1: HUM.z1, floors: 3, storey: 4.0, band: 1.4, inset: 0.6, pitch: 3.6, pierW: 0.5, wall: 'precast', parapet: 0.9 });
  facade(B, { x0: ADMIN.x0, x1: ADMIN.x1, z0: ADMIN.z0, z1: ADMIN.z1, floors: 4, storey: 4.0, band: 1.5, inset: 0.7, pitch: 3.6, pierW: 0.55, wall: 'concrete', pier: 'concrete', ground: { h: 4.2, inset: 1.2, pitch: 7.2 }, parapet: 0.9 });
  B.box('concreteGrey', [ADMIN.x0 - 4, 4.2, ADMIN.z0 + 22], [ADMIN.x0 + 0.5, 4.9, ADMIN.z0 + 46], { collide: false });     // entrance canopy on the mall axis

  // ---- north backdrop: Stony Brook Union (brick), Campus Recreation Center (stucco + glass) --------------------------------------------
  facade(B, { x0: UNION.x0, x1: UNION.x1, z0: UNION.z0, z1: UNION.z1, floors: 3, storey: 4.4, band: 1.8, inset: 0.4, pitch: 3.4, pierW: 0.8, wall: 'brickRed', pier: 'brickRed', parapet: 0.8, mullionPitch: 0, sillStain: false });
  facade(B, { x0: REC.x0, x1: REC.x1, z0: REC.z0, z1: REC.z1, floors: 2, storey: 6.0, band: 2.0, inset: 0.4, pitch: 3.0, pierW: 0.3, wall: 'stucco', glass: 'glassLight', parapet: 0.8 });

  // ---- Arts & Culture Center (NE, Wang-style): taupe stucco stepped masses, a REAL 12x7x4 m red steel portal,
  // low square window band, twin glass-strip towers, granite forecourt, stacked lantern tower, reflecting pond ----
  const Wg = WANG;
  const ST = 'stuccoTaupe', STD = 'stuccoTaupeDark';
  // stepped masses: flat render-coat boxes of different heights, no brick, deep shadow planes between them (wang1.jpg)
  const massList = [
    [Wg.x0, Wg.z0 + 30, Wg.x0 + 26, Wg.z1 - 2, 15],
    [Wg.x0 + 22, Wg.z0 + 16, Wg.x0 + 52, Wg.z1 - 12, 19],
    [Wg.x0 + 12, Wg.z0 + 4, Wg.x0 + 40, Wg.z0 + 34, 16],
    [Wg.x0 + 48, Wg.z0 + 6, Wg.x0 + 86, Wg.z0 + 52, 17],
    [Wg.x0 + 52, Wg.z0 + 46, Wg.x1 - 46, Wg.z1 - 6, 13],
    [Wg.x0 + 92, Wg.z0 + 12, Wg.x1 - 12, Wg.z0 + 58, 15],
    [Wg.x0 + 108, Wg.z0 + 54, Wg.x1 - 4, Wg.z1 - 14, 11],
    [Wg.x0 + 2, Wg.z1 - 34, Wg.x0 + 18, Wg.z1 + 2, 11],
  ];
  for (const [mx0, mz0, mx1, mz1, mh] of massList) {
    block(B, ST, mx0, mz0, mx1, mz1, mh, { hvac: 2, roof: 'roof' });
    // shadow reveal: a recessed dark band down the corner of each mass (the vertical joints in the photo)
    B.box(STD, [mx0 - 0.02, 0, mz0 - 0.02], [mx0 + 0.35, mh, mz0 + 0.35], { collide: false });
    B.box(STD, [mx1 - 0.35, 0, mz1 - 0.35], [mx1 + 0.02, mh, mz1 + 0.02], { collide: false });
    // low 1 x 1 m square window band along the TOP of every mass, every 2 m (wang1/wang2.jpg)
    for (let x = mx0 + 2; x < mx1 - 2; x += 2) {
      B.box(R() < 0.25 ? 'glassLit' : 'glassDark', [x, mh - 2.6, mz1 + 0.01], [x + 1, mh - 1.6, mz1 + 0.09], { collide: false });
      B.box('white', [x - 0.09, mh - 2.7, mz1 + 0.02], [x + 1.09, mh - 2.6, mz1 + 0.14], { collide: false });
    }
    for (let z = mz0 + 2; z < mz1 - 2; z += 2) {
      B.box(R() < 0.25 ? 'glassLit' : 'glassDark', [mx1 + 0.01, mh - 2.6, z], [mx1 + 0.09, mh - 1.6, z + 1], { collide: false });
      B.box('white', [mx1 + 0.02, mh - 2.7, z - 0.09], [mx1 + 0.14, mh - 2.6, z + 1.09], { collide: false });
    }
  }
  // entry block: a low flat-roofed pavilion the portal stands in front of
  const ez0 = Wg.z1 - 8, ez1 = Wg.z1 + 3;
  block(B, ST, Wg.x0 + 26, ez0, Wg.x0 + 58, ez1, 8.4, { hvac: 0 });
  B.box('white', [Wg.x0 + 25.7, 8.4, ez0 - 0.3], [Wg.x0 + 58.3, 8.9, ez1 + 0.3], { collide: false });
  // twin glass-strip towers flanking the entrance
  for (const tx0 of [Wg.x0 + 18, Wg.x0 + 60]) {
    B.box(ST, [tx0, 0, Wg.z1 - 8], [tx0 + 6.5, 23, Wg.z1 + 2]);
    B.box('glass', [tx0 + 1.8, 0.5, Wg.z1 + 2], [tx0 + 4.7, 22, Wg.z1 + 2.12], { collide: false });
    for (let y = 3; y < 22; y += 3) B.box('white', [tx0 + 1.6, y, Wg.z1 + 2.02], [tx0 + 4.9, y + 0.16, Wg.z1 + 2.24], { collide: false });
    B.box('white', [tx0 - 0.25, 23, Wg.z1 - 8.25], [tx0 + 6.75, 23.6, Wg.z1 + 2.25], { collide: false });
  }
  // ---- the red portal: REAL box-beam frame, 12 m wide x 7 m tall x 4 m deep, 0.6 m members ----------------------------
  const pW = 12, pH = 7, pD = 4, bm = 0.6;
  const pcx = Wg.x0 + 42, pz1 = Wg.z1 + 3.2, pz0 = pz1 + pD;                    // pz0 = the outer (south) plane, toward the camera
  const pxs = [pcx - pW / 2, pcx, pcx + pW / 2], pzs = [pz1, pz0];
  const hb = bm / 2;
  for (const x of pxs) for (const z of pzs) B.box('redSteel', [x - hb, 0, z - hb], [x + hb, pH, z + hb], { collide: true });        // 6 columns
  for (const y of [pH * 0.55, pH]) {                                                                                                // two beam levels
    for (const z of pzs) B.box('redSteel', [pxs[0] - hb, y - bm, z - hb], [pxs[2] + hb, y, z + hb], { collide: false });            // spanning beams
    for (const x of pxs) B.box('redSteel', [x - hb, y - bm, pz1 - hb], [x + hb, y, pz0 + hb], { collide: false });                   // tie beams front↔back
  }
  for (const x of [pxs[0], pxs[2]]) for (const z of pzs) {                                                                           // knee braces (the angled struts in wang1.jpg)
    const s = x < pcx ? 1 : -1;
    const g = boxGeo([-hb * 0.8, -1.9, -hb * 0.8], [hb * 0.8, 1.9, hb * 0.8]); g.rotateZ(-s * 0.72); g.translate(x + s * 1.25, pH * 0.55 - 1.3, z); B.add('redSteel', g, { uv: false });
  }
  B.box('redSteel', [pxs[0] - hb, pH * 0.55 - bm - 0.7, pz0 - hb - 0.06], [pxs[2] + hb, pH * 0.55 - bm, pz0 + hb + 0.06], { collide: false });   // sign fascia band
  lettering(world, 'ARTS & CULTURE CENTER', pcx, pH * 0.55 - bm - 0.35, pz0 + hb + 0.09, 8.6, 0.42, 0, '#f6efe6');
  // glazed entrance wall behind the frame: dark glass, white mullions, four doors
  B.box('glassDark', [pcx - pW / 2 + 0.4, 0, pz1 - 0.35], [pcx + pW / 2 - 0.4, pH - 0.4, pz1 - 0.2], { collide: true });
  for (let x = pcx - pW / 2 + 0.4; x <= pcx + pW / 2 - 0.4 + 0.01; x += 1.45) B.box('alu', [x - 0.07, 0, pz1 - 0.42], [x + 0.07, pH - 0.4, pz1 - 0.28], { collide: false });
  B.box('alu', [pcx - pW / 2 + 0.3, 2.45, pz1 - 0.42], [pcx + pW / 2 - 0.3, 2.6, pz1 - 0.28], { collide: false });
  B.box('alu', [pcx - pW / 2 + 0.3, 4.4, pz1 - 0.42], [pcx + pW / 2 - 0.3, 4.52, pz1 - 0.28], { collide: false });
  for (let x = pcx - 3.4; x < pcx + 3.4; x += 1.7) B.box('glassLit', [x + 0.1, 0.1, pz1 - 0.26], [x + 1.6, 2.4, pz1 - 0.22], { collide: false });
  // granite entry terrace + steps down to the lawn
  B.box('granite', [pcx - pW / 2 - 3, 0, pz1 - 1], [pcx + pW / 2 + 3, 0.6, pz0 + 3], { collide: true });
  B.stairs('granite', { x: pcx, z: pz0 + 3, y0: 0, rise: 0.6, run: 2.4, width: pW + 6, axis: 'z', dir: 1, n: 3 });
  B.box('graniteCap', [pcx - pW / 2 - 3.1, 0.6, pz1 - 1.1], [pcx - pW / 2 - 3, 0.68, pz0 + 3.1], { collide: false });
  B.box('graniteCap', [pcx + pW / 2 + 3, 0.6, pz1 - 1.1], [pcx + pW / 2 + 3.1, 0.68, pz0 + 3.1], { collide: false });
  for (let z = pz1; z < pz0 + 2; z += 3) { world.cover(pcx - pW / 2 - 3.6, z, -1, 0, 0.6); world.cover(pcx + pW / 2 + 3.6, z, 1, 0, 0.6); }
  // lantern tower: stacked metal tiers on a stucco shaft + four white masts, close behind the entrance (wang1.jpg)
  const tx = Wg.x0 + 52, tz = Wg.z1 - 22;
  B.cyl(ST, tx, tz, 0, 21, 2.4, 6, { collide: true });
  for (let k = 0; k < 9; k++) { B.cyl('alu', tx, tz, 19 + k * 1.55, 19 + k * 1.55 + 0.75, 3.5 - k * 0.1, 6); B.cyl('white', tx, tz, 19 + k * 1.55 + 0.75, 19 + k * 1.55 + 0.95, 2.1, 6); }
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.cyl('white', tx + dx * 1.25, tz + dz * 1.25, 33.5, 43, 0.13, 6);
  // reflecting pond + lawn kerb in front (south) of the entrance
  B.box('concreteGrey', [pcx - 18, -0.5, pz0 + 12], [pcx + 18, 0.3, pz0 + 30], { collide: true });
  B.box('water', [pcx - 17.4, 0.1, pz0 + 12.6], [pcx + 17.4, 0.16, pz0 + 29.4], { collide: false });

  // ---- campus wayfinding signs (generic text, red panels on steel posts) ---------------------------------------------------------------
  const signs = [
    { x: -62, z: 6, ry: 0, text: 'ACADEMIC MALL', sub: 'LIBRARY  ·  ARTS CENTER  →' },
    { x: 60, z: 14, ry: Math.PI, text: 'STUDENT ACTIVITIES CENTER', sub: '←  BUS LOOP  ·  CAMPUS DRIVE' },
    { x: 120, z: -12, ry: 0, text: 'ADMINISTRATION  →', sub: 'ARTS CENTER  ·  THE STEPS' },
    { x: -35, z: -30, ry: 0, text: 'STRIPE WALK', sub: 'SCIENCES  ·  STUDENT UNION  ↑' },
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
