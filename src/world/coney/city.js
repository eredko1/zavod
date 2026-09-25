// CONEY city side: sidewalk base, streets (curbs, double-yellow on the avenues, crosswalks), lots, parks, ball fields,
// every OSM building by style (brick housing towers, walk-ups, rowhouses, amusement-strip shopfronts with galvanised shutters,
// painted sign boards, striped awnings and cornices, the Surf Avenue sideshow blocks), the avenue's street kit (cobra-head lights,
// hydrants, parking signs, zebra crosswalks) and the elevated subway viaducts running into the terminal. CONEY agent.
import * as THREE from 'three';
import { Batch, boxGeo } from '../sbu/geo.js';
import { facade, block } from '../sbu/buildings.js';
import { OSM, PLAY } from './osm.js';
import { BW } from './shore.js';
import { ribbon, walk, footprint, footprintAngle, decompose, segDist, bbox, cen, pip } from '../osmkit.js';
import { placeCars } from '../carkit.js';


export function buildCity(world, M) {
  const { scene, ctx, R } = world;
  const G = new Batch(world, M, 'cityGround'), S = new Batch(world, M, 'city'), F = new Batch(world, M, 'cityFar');
  // ground layers sit mm apart (visual only; the walk collider is the base slab). From the 19th floor (~50 m up, near 0.03)
  // the depth buffer can't resolve 5 mm at 100 m+ and roads/curbs/lots z-fought — "pulsating" streets as the camera swayed.
  // Each layer gets its own merged mesh and a per-draw polygon offset rank (higher = drawn on top) instead of relying on y.
  const L = [1, 2, 3, 4, 5, 6, 7].map((r) => Object.assign(new Batch(world, M, 'cityGround' + r), { rank: r }));
  const [Lpark, Llot, Lpitch, Lcurb, Lroad, Lpath, Lpaint] = L;
  // ---- base ground north of the boardwalk: concrete sidewalk everywhere, streets and plots on top -----------------------
  G.add('concretePav', boxGeo([-1000, -0.2, -1000], [900, 0.0, BW.z0]), { uvScale: 1 / 3 });
  world.box([-1000, -1, -1000], [900, 0, BW.z0]);
  for (const p of OSM.pk) Lpark.poly('grass', p, 0.015);
  for (const p of OSM.l) Llot.poly('asphalt', p, 0.02);
  for (const o of OSM.pt) { Lpitch.poly(/baseball|softball/.test(o.sport) ? 'grass' : /basketball|handball|tennis/.test(o.sport) ? 'asphalt' : 'grass', o.p, 0.025); }
  for (const r of OSM.r) {
    const a = ribbon(r.p, r.w, 0.035); if (a) Lroad.add('asphalt', a, { uvScale: 1 / 6 });
    const c = ribbon(r.p, r.w + 0.5, 0.03); if (c) Lcurb.add('curb', c, { uvScale: 0.5 });
    if (r.w >= 14) { const y1 = ribbonOffset(r.p, -0.18, 0.18, 0.04), y2 = ribbonOffset(r.p, 0.18, 0.18, 0.04); if (y1) Lpaint.add('paintY', y1, { uv: false }); if (y2) Lpaint.add('paintY', y2, { uv: false }); }
    else if (r.w >= 9) walk(r.p, 6, (x, z, dx, dz) => { const d = boxGeo([-0.06, 0.04, -1.5], [0.06, 0.045, 1.5]); d.rotateY(Math.atan2(dx, dz)); d.translate(x, 0, z); Lpaint.add('paint', d, { uv: false }); });
  }
  for (const w of OSM.w) { const g = ribbon(w.p, w.w, 0.045); if (g) Lpath.add(w.s ? 'concreteGrey' : 'concretePav', g, { uvScale: 1 / 3 }); }
  G.flush({ shadow: false });
  for (const B of L) for (const m of B.flush({ shadow: false })) groundBias(m, B.rank);

  // ---- buildings ----------------------------------------------------------------------------------------------------
  const inPlay = (b) => b.play;
  for (const b of OSM.b) {
    // Luna Park Houses (the five ~21-storey towers north of the avenue) are built by coney/housing.js — skip them here
    if (b.s === 'tower' && b.h > 50) { const [lx, lz] = cen(b.p); if (lx > 60 && lx < 380 && lz > -520 && lz < -110) continue; }
    const T = inPlay(b) ? S : F;
    try { building(T, world, M, b); } catch (e) { console.warn('[coney] building', e); }
  }
  S.flush({ shadow: true }); F.flush({ shadow: true });

  // ---- elevated subway: steel viaduct (columns + girders + ties + rails) along every elevated OSM rail line ----------------
  viaducts(world, M);
  streetKit(world, M);

  // ---- parked cars along the residential streets and in the lots ------------------------------------------------------
  const cars = [];
  for (const r of OSM.r) { if (r.w < 9 || r.w > 16) continue; walk(r.p, 6.5, (x, z, dx, dz) => { if (R() < 0.6) return; if (!(x > PLAY.x0 && x < PLAY.x1 && z > PLAY.z0 && z < BW.z0 - 5)) return; for (const s of [-1, 1]) { if (R() < 0.4) continue; const off = r.w / 2 - 1.3; cars.push({ x: x - dz * s * off, z: z + dx * s * off, ry: Math.atan2(dx, dz) - Math.PI / 2 + (s > 0 ? Math.PI : 0), kind: ['sedan', 'sedan', 'suv', 'hatch', 'van', 'cab'][(R() * 6) | 0] }); } }); }
  for (const p of OSM.l) { const q = bbox(p); if (!(q.x1 > PLAY.x0 && q.x0 < PLAY.x1 && q.z1 > PLAY.z0 && q.z0 < PLAY.z1)) continue; for (let x = q.x0 + 3; x < q.x1 - 3; x += 2.8) for (let z = q.z0 + 4; z < q.z1 - 3; z += 7) if (pip(x, z, p) && R() < 0.25) cars.push({ x, z, ry: Math.PI / 2 * (R() < 0.5 ? 1 : -1), kind: ['sedan', 'suv', 'hatch', 'van'][(R() * 4) | 0] }); }
  placeCars(world, cars, { raycast: false });
  for (const c of cars) { c.box = world.box([c.x - 1.6, 0, c.z - 1.6], [c.x + 1.6, 1.5, c.z + 1.6]); if (R() < 0.12) world.cover(c.x, c.z + 2, 0, 1); }
}

function ribbonOffset(pts, off, w, y) { // thin ribbon offset sideways from a polyline (paint lines)
  const sh = pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; return [p[0] - dz / L * off, p[1] + dx / L * off]; });
  return ribbon(sh, w * 0.6, y);
}

const STYLE = {
  tower: { wall: 'brickBrown', pier: 'brickBrown', storey: 2.8, band: 1.35, inset: 0.3, pitch: 2.9, pierW: 0.8, parapet: 1.2, floorBand: true, lit: 0.12 },
  apart: { wall: 'brickRed', pier: 'brickRed', storey: 3.0, band: 1.5, inset: 0.3, pitch: 2.8, pierW: 0.9, parapet: 0.9, floorBand: true, lit: 0.15 },
  civic: { wall: 'precast', storey: 3.8, band: 1.4, inset: 0.5, pitch: 3.4, pierW: 0.5, parapet: 0.9 },
};

function building(T, world, M, b) {
  const R = world.R; const h = Math.max(3, b.h); const s = b.s;
  // local (footprint-aligned) frame -> world, the same transform osmkit.footprint applies to rotated footprints
  const ang = footprintAngle(b.p), aligned = Math.abs(ang) < 0.07, [ox, oz] = cen(b.p);
  const cw = Math.cos(ang), sw = Math.sin(ang), cl = Math.cos(-ang), sl = Math.sin(-ang);
  const toWorld = aligned ? (x, z) => [x, z] : (x, z) => [ox + (x - ox) * cw - (z - oz) * sw, oz + (x - ox) * sw + (z - oz) * cw];
  const loc = aligned ? b.p : b.p.map(([x, z]) => [ox + (x - ox) * cl - (z - oz) * sl, oz + (x - ox) * sl + (z - oz) * cl]);
  const shopLike = s !== 'tower' && s !== 'apart' && s !== 'civic' && s !== 'rowhouse' && s !== 'aquarium' && s !== 'service';
  // Surf Avenue frontage: a face whose outward normal points at the avenue within a sidewalk's width of its kerb
  const fronts = (mx, mz, nx, nz) => { const [wx, wz] = toWorld(mx, mz), [qx, qz] = toWorld(mx + nx * 4, mz + nz * 4); const d = surfDist(wx, wz); return d < 24 && surfDist(qx, qz) < d - 2.5; };
  let sideshow = false; const rs = shopLike ? decompose(loc) : [];
  const inRect = (x, z) => rs.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);   // shared wall with another rect
  if (shopLike && b.play && h >= 3.5) { sideshow = rs.some((r) => fronts((r.x0 + r.x1) / 2, r.z0, 0, -1) || fronts((r.x0 + r.x1) / 2, r.z1, 0, 1) || fronts(r.x0, (r.z0 + r.z1) / 2, -1, 0) || fronts(r.x1, (r.z0 + r.z1) / 2, 1, 0)) && R() < 0.55; }
  footprint(T, world, M, b.p, (B, r) => {
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    if (w < 3 || d < 3) { block(B, s === 'tower' ? 'brickBrown' : 'brickRed', r.x0, r.z0, r.x1, r.z1, h, { hvac: 0 }); return; }
    if (!b.play && (s === 'tower' || s === 'apart' || s === 'rowhouse')) { block(B, s === 'tower' ? (R() < 0.6 ? 'towerFarBrown' : 'towerFarTan') : 'towerFarRed', r.x0, r.z0, r.x1, r.z1, h, { hvac: s === 'tower' ? 1 : 0 }); return; }
    if (s === 'tower' || s === 'apart' || s === 'civic') {
      const st = STYLE[s]; const floors = Math.max(1, Math.round(h / st.storey));
      facade(B, { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, floors, ...st, hvac: s === 'tower' ? 2 : 1, mullionPitch: s === 'civic' ? undefined : 0 });
      return;
    }
    if (s === 'rowhouse') { // 2–3 storey attached houses: brick or siding, punched windows, stoop-less (Coney bungalows/rowhouses)
      const floors = Math.max(1, Math.round(h / 3.1));
      facade(B, { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, floors, storey: 3.1, band: 1.6, inset: 0.2, pitch: 2.6, pierW: 1.2, wall: R() < 0.5 ? 'brickRed' : M.paintWallKeys[(R() * 6) | 0], pier: undefined, parapet: 0.5, lit: 0.1, hvac: 0, mullionPitch: 0 });
      return;
    }
    if (s === 'aquarium') { block(B, 'precast', r.x0, r.z0, r.x1, r.z1, Math.min(h, 12), { hvac: 1 }); return; }
    if (s === 'service') { block(B, R() < 0.5 ? 'concreteGrey' : M.paintWallKeys[(R() * 6) | 0], r.x0, r.z0, r.x1, r.z1, Math.min(h, 8), { hvac: 1 }); return; }
    shop(B, world, M, r, Math.min(h, 12), { arcade: s === 'arcade', far: !b.play, sideshow, fronts, inside: inRect });
  });
}

// ---- Surf Avenue (the 22 m OSM avenue) -------------------------------------------------------------------------------
const SURF = OSM.r.filter((r) => r.w === 22);
const surfDist = (x, z) => { let d = 1e9; for (const r of SURF) d = Math.min(d, segDist(x, z, r.p)); return d; };
let signSeq = 0, lastShutter = -1;
/** 35 % of shutters carry one of 8 graffiti pieces, the rest one of 8 clean/stickered variants; never the same cell twice in a row */
const pickShutter = (R) => { let c; do c = R() < 0.35 ? (R() * 8) | 0 : 8 + ((R() * 8) | 0); while (c === lastShutter); return (lastShutter = c); };

/** Face kit: local frame on one wall face — u along the face (centred on its midpoint), y up, n outward from the wall plane. */
function faceKit(B, alongX, sgn, mid, c) {
  const place = (g) => { if (alongX) { if (sgn < 0) g.rotateY(Math.PI); } else g.rotateY(sgn > 0 ? Math.PI / 2 : -Math.PI / 2); g.translate(alongX ? mid : c, 0, alongX ? c : mid); return g; };
  return {
    box(key, a, b, o = {}) { B.add(key, place(boxGeo(a, b)), o); },
    geo(key, g, o = { uv: false }) { B.add(key, place(g), o); },
    /** outward-facing quad u0..u1 x y0..y1 at n, UVs remapped into the atlas rect [u0, v0, du, dv] */
    quad(key, u0, u1, y0, y1, n, [a, bb, du, dv]) {
      const g = new THREE.PlaneGeometry(u1 - u0, y1 - y0); g.translate((u0 + u1) / 2, (y0 + y1) / 2, n);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, a + uv.getX(i) * du, bb + uv.getY(i) * dv);
      B.add(key, place(g), { uv: false });
    },
  };
}
/** striped awning: 1.8 m deep, 0.6 m fall, 0.3 m valance; UV u = metres / 0.6 so each stripe is 0.3 m */
function awning(F, key, u0, u1, yTop, far = false) {
  const W = u1 - u0, D = 1.8, fall = 0.6, S = Math.hypot(D, fall), th = Math.atan2(fall, D);
  const stripe = (g) => { const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 0.6, uv.getY(i)); return g; };
  const s = stripe(new THREE.BoxGeometry(W, 0.04, S)); s.rotateX(th); s.translate((u0 + u1) / 2, yTop - fall / 2, D / 2); F.geo(key, s);
  const v = stripe(new THREE.BoxGeometry(W, 0.3, 0.03)); v.translate((u0 + u1) / 2, yTop - fall - 0.15, D); F.geo(key, v);
  if (!far) for (const e of [u0, u1]) { const t = new THREE.BoxGeometry(0.03, 0.03, S); t.rotateX(th); t.translate(e, yTop - fall / 2 - 0.03, D / 2); F.geo('corniceDark', t); }   // side frame rods
}

/** Amusement-strip storefront face (boardwalk + side streets): stucco pilasters between galvanised roll-down shutters (some
 *  rolled up onto a lit counter), shutter hood, 1.2 m painted sign boards on the fascia, striped awnings on ~60 % of units,
 *  projecting cornice; two-storey fronts get a window row (or sideshow banners) upstairs. */
function shopFront(F, M, R, L, h, wall, o) {
  const far = o.far; const nb = Math.max(1, Math.round(L / 4.0)), bw = L / nb;
  // cornice (0.3 m projection) + fillet, drip ledge over the sign band
  F.box('cornice', [-L / 2 - 0.3, h - 0.38, 0], [L / 2 + 0.3, h, 0.3]);
  if (!far) F.box('cornice', [-L / 2, h - 0.55, 0], [L / 2, h - 0.38, 0.14]);
  F.box('cornice', [-L / 2, 4.55, 0], [L / 2, 4.68, 0.22]);
  F.box('galv', [-L / 2 + 0.05, 2.95, 0], [L / 2 - 0.05, 3.22, 0.26]);                        // shutter hood
  for (let i = 0; i < nb; i++) {
    const u0 = -L / 2 + i * bw + 0.2, u1 = -L / 2 + (i + 1) * bw - 0.2;
    if (!far) F.box(wall, [u0 - 0.4, 0, 0], [u0, 2.95, 0.12]);
    const open = !far && R() < (o.arcade ? 0.5 : 0.28);
    if (open) { F.quad('shopInterior', u0, u1, 0.02, 2.95, 0.02, M.interiorCell(o.arcade && R() < 0.7)); F.box('steel', [u0 + 0.05, 0, 0], [u1 - 0.05, 1.05, 0.5]); F.box('corniceDark', [u0 + 0.05, 1.05, 0], [u1 - 0.05, 1.1, 0.56]); }
    else F.quad('shutterAtlas', u0, u1, 0.03, 2.95, 0.04, M.shutterCell(pickShutter(R)));
  }
  if (!far) F.box(wall, [L / 2 - 0.2, 0, 0], [L / 2, 2.95, 0.12]);
  // units of 2–3 bays: sign board(s) + optional awning
  let i = 0;
  while (i < nb) {
    const k = Math.min(nb - i, nb - i === 4 ? 2 : 2 + (R() < 0.4 ? 1 : 0)); const U0 = -L / 2 + i * bw, U1 = U0 + k * bw; i += k;
    const W = U1 - U0, ns = Math.max(1, Math.round(W / 6)), slot = W / ns;
    for (let j = 0; j < ns; j++) {
      const cx = U0 + slot * (j + 0.5), sw = Math.min(4.4, slot - 0.5); if (sw < 1.6) continue;
      signSeq = (signSeq + 1 + ((R() * 5) | 0)) % M.signCount;
      if (!far) F.box('corniceDark', [cx - sw / 2 - 0.08, 3.3, 0], [cx + sw / 2 + 0.08, 4.5, 0.14]);
      F.quad('signAtlas', cx - sw / 2, cx + sw / 2, 3.36, 4.44, far ? 0.03 : 0.145, M.signCell(o.arcade && R() < 0.5 ? [2, 3, 8, 9][(R() * 4) | 0] : signSeq));
    }
    if (R() < 0.6) awning(F, M.awnKeys[(R() * (R() < 0.8 ? 2 : 3)) | 0], U0 + 0.15, U1 - 0.15, 3.25, far);
  }
  if (h >= 7.5) { // upper storey: windows, or a row of painted banners
    const banners = !far && R() < 0.35; const nw = Math.max(1, Math.floor(L / 3.2)), ww = L / nw;
    for (let j = 0; j < nw; j++) {
      const cx = -L / 2 + ww * (j + 0.5);
      if (banners && j % 2 === 0) { F.quad('ssBanner', cx - 1.2, cx + 1.2, 4.85, Math.min(7.85, h - 0.6), 0.05, M.bannerCell((R() * 12) | 0)); continue; }
      F.box('glass', [cx - 0.75, 5.3, 0], [cx + 0.75, 7.0, 0.03]);
      if (far) continue;
      F.box('cornice', [cx - 0.88, 5.15, 0], [cx + 0.88, 5.3, 0.12]); F.box('cornice', [cx - 0.85, 7.0, 0], [cx + 0.85, 7.12, 0.06]);
      F.box('whiteMullion', [cx - 0.03, 5.3, 0], [cx + 0.03, 7.0, 0.06]);
    }
  }
}

/** Surf Avenue sideshow front (Surf_Avenue_Coney_Island1.jpg): stucco two-storey block, galvanised shutters between orange
 *  posts, a 1.5 m mural frieze band, a row of 2.4 x 3 m hand-painted banners alternating with windows upstairs, a 1 m
 *  terracotta tile overhang on blue brackets every 1.6 m. */
function sideshowFront(F, M, R, L, h) {
  const nb = Math.max(1, Math.round(L / 3.6)), bw = L / nb;
  for (let i = 0; i <= nb; i++) { const u = -L / 2 + i * bw; F.box('ssOrange', [u - 0.18, 0, 0], [u + 0.18, 3.3, 0.2]); }
  for (let i = 0; i < nb; i++) { const u0 = -L / 2 + i * bw + 0.18, u1 = u0 + bw - 0.36; F.quad('shutterAtlas', u0, u1, 0.03, 3.0, 0.05, M.shutterCell(pickShutter(R))); }
  F.box('ssOrange', [-L / 2 - 0.1, 3.0, 0], [L / 2 + 0.1, 3.35, 0.26]);                                       // orange lintel
  F.box('ssBlue', [-L / 2, 3.35, 0], [L / 2, 4.95, 0.08]);                                                      // frieze backing
  F.quad('ssFrieze', -L / 2 + 0.08, L / 2 - 0.08, 3.4, 4.9, 0.085, [R(), 0, (L - 0.16) / 12, 1]);
  F.box('cornice', [-L / 2, 4.95, 0], [L / 2, 5.1, 0.24]);                                                      // ledge
  const ns = Math.max(1, Math.floor((L - 0.8) / 3.1)), sw = (L - 0.8) / ns; let bi = (R() * 12) | 0;
  for (let j = 0; j < ns; j++) {
    const cx = -L / 2 + 0.4 + sw * (j + 0.5);
    if (j % 2 === 0 || R() < 0.3) { bi = (bi + 1 + ((R() * 3) | 0)) % 12; F.quad('ssBanner', cx - 1.2, cx + 1.2, 5.25, 8.25, 0.05, M.bannerCell(bi)); continue; }
    F.box('glassDark', [cx - 0.8, 5.6, 0], [cx + 0.8, 7.7, 0.03]);
    F.box('cornice', [cx - 0.95, 5.45, 0], [cx + 0.95, 5.6, 0.16]); F.box('cornice', [cx - 0.95, 7.7, 0], [cx + 0.95, 7.85, 0.06]);
    for (const x of [cx - 0.88, cx + 0.8]) F.box('cornice', [x, 5.6, 0], [x + 0.08, 7.7, 0.06]);
    F.box('whiteMullion', [cx - 0.03, 5.6, 0], [cx + 0.03, 7.7, 0.06]); F.box('whiteMullion', [cx - 0.8, 6.9, 0], [cx + 0.8, 6.95, 0.06]);
  }
  // roof: brackets every 1.6 m, soffit, blue fascia board, tile slope (pent roof) rising back over the front bay
  for (let u = -L / 2 + 0.5; u <= L / 2 - 0.4; u += 1.6) {
    F.box('ssBlue', [u - 0.1, 7.95, 0], [u + 0.1, 8.55, 0.22]); F.box('ssBlue', [u - 0.1, 8.3, 0], [u + 0.1, 8.55, 0.95]); F.box('ssBlue', [u - 0.1, 8.12, 0.2], [u + 0.1, 8.3, 0.5]);
  }
  F.box('ssBlue', [-L / 2 - 0.2, 8.55, 0], [L / 2 + 0.2, 8.62, 1.0]);
  F.box('ssBlue', [-L / 2 - 0.25, 8.45, 0.95], [L / 2 + 0.25, 8.72, 1.08]);
  const n0 = 1.05, y0 = 8.66, n1 = -1.8, y1 = 9.9, S = Math.hypot(n0 - n1, y1 - y0), th = Math.atan2(y1 - y0, n0 - n1);
  const t = new THREE.BoxGeometry(L + 0.5, 0.1, S); { const uv = t.attributes.uv, p = t.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 2, p.getZ(i) / 2.4); }
  t.rotateX(th); t.translate(0, (y0 + y1) / 2, (n0 + n1) / 2); F.geo('ssTile', t);
  F.box('ssStucco', [-L / 2, h, n1 - 0.12], [L / 2, y1, n1]);
}

function shop(B, world, M, r, h0, o) {
  const R = world.R; const w = r.x1 - r.x0, d = r.z1 - r.z0;
  const h = o.sideshow ? 8.6 : h0 > 7 ? Math.max(h0, 8.4) : Math.max(h0, 5.4);
  const wall = o.sideshow ? 'ssStucco' : M.paintWallKeys[(R() * 6) | 0];
  block(B, wall, r.x0, r.z0, r.x1, r.z1, h, { hvac: h > 6 ? 1 : 0 });
  const faces = [['z0', r.x0, r.x1, r.z0, -1], ['z1', r.x0, r.x1, r.z1, 1], ['x0', r.z0, r.z1, r.x0, -1], ['x1', r.z0, r.z1, r.x1, 1]];
  for (const [f, a0, a1, c, sgn] of faces) {
    const L = a1 - a0; if (L < 4) continue;
    const alongX = f[0] === 'z', mid = (a0 + a1) / 2;
    const mx = alongX ? mid : c + sgn * 0.6, mz = alongX ? c + sgn * 0.6 : mid;
    if (o.inside(mx, mz)) continue;                                               // shared wall with another rect of this footprint
    const F = faceKit(B, alongX, sgn, mid, c);
    if (o.sideshow && o.fronts(alongX ? mid : c, alongX ? c : mid, alongX ? 0 : sgn, alongX ? sgn : 0)) sideshowFront(F, M, R, L, h);
    else shopFront(F, M, R, L, h, wall, o);
  }
  if (w > 6 && d > 6) { world.cover((r.x0 + r.x1) / 2, r.z0 - 1.2, 0, -1); world.cover((r.x0 + r.x1) / 2, r.z1 + 1.2, 0, 1); }
}

// ---- Surf Avenue street kit: cobra-head streetlights every 30 m (staggered sides), hydrants every 60 m, parking signs, zebra
// crosswalks at every side-street mouth. Merged per material; poles/hydrants/sign posts get colliders.
function streetKit(world, M) {
  const { ctx } = world; const K = new Batch(world, M, 'surfKit');
  const inPlay = (x, z) => x > PLAY.x0 + 3 && x < PLAY.x1 - 3 && z > PLAY.z0 + 3 && z < BW.z0 - 3;
  // intersections: side-street ends on the avenue centreline
  const ints = [];
  for (const r of OSM.r) { if (r.w === 22 || r.w < 9) continue; for (const [e, n] of [[r.p[0], r.p[1]], [r.p[r.p.length - 1], r.p[r.p.length - 2]]]) {
    if (!n || surfDist(e[0], e[1]) > 3) continue; let dx = n[0] - e[0], dz = n[1] - e[1]; const Ld = Math.hypot(dx, dz) || 1; dx /= Ld; dz /= Ld;
    if (ints.some((q) => Math.hypot(q.x - e[0], q.z - e[1]) < 4 && q.dx * dx + q.dz * dz > 0.9)) continue; ints.push({ x: e[0], z: e[1], dx, dz, w: r.w }); } }
  const nearInt = (x, z, rad) => ints.some((q) => Math.hypot(q.x - x, q.z - z) < rad);
  const blocked = (x, z, rad = 0.4) => ctx.colliders.some((b) => x > b.min.x - rad && x < b.max.x + rad && z > b.min.z - rad && z < b.max.z + rad && b.max.y > 0.2 && b.min.y < 2.5);
  const surfTan = (x, z) => { let best = 1e9, t = [1, 0]; for (const r of SURF) for (let i = 0; i + 1 < r.p.length; i++) { const d = segDist(x, z, [r.p[i], r.p[i + 1]]); if (d < best) { best = d; const ax = r.p[i + 1][0] - r.p[i][0], az = r.p[i + 1][1] - r.p[i][1], L = Math.hypot(ax, az) || 1; t = [ax / L, az / L]; } } return t; };
  const stripes = (cx, cz, ux, uz, span, len) => { const a = Math.atan2(ux, uz); for (let s = -span / 2 + 0.5; s <= span / 2 - 0.5; s += 1.2) { const g = boxGeo([-0.3, 0.04, -len / 2], [0.3, 0.047, len / 2]); g.rotateY(a); g.translate(cx + uz * s, 0, cz - ux * s); K.add('paint', g, { uv: false }); } };
  for (const q of ints) {
    if (!inPlay(q.x, q.z)) continue;
    stripes(q.x + q.dx * 14, q.z + q.dz * 14, q.dx, q.dz, q.w - 0.4, 3.0);                                     // across the side street
    const [tx, tz] = surfTan(q.x, q.z); const s = tx * q.dx + tz * q.dz > 0 ? -1 : 1; const o = q.w / 2 + 3.2;  // across the avenue, beside the mouth
    stripes(q.x + tx * o * s, q.z + tz * o * s, tx, tz, 21.4, 3.0);
  }
  const place = (step, off, fn) => { let k = 0; for (const r of SURF) walk(r.p, step, (x, z, ux, uz) => { k++; const s = k % 2 ? 1 : -1; const px = x - uz * s * off, pz = z + ux * s * off; if (!inPlay(px, pz) || nearInt(x, z, 12) || blocked(px, pz)) return; fn(px, pz, uz * s, -ux * s, ux, uz); }); };
  const cyl = (key, x, y0, y1, z, r0, r1, seg = 10) => { const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg); g.translate(x, (y0 + y1) / 2, z); K.add(key, g); };
  // cobra-head streetlights: 9 m galvanised pole, curved outreach arm, flat head with a lens facing down
  place(15, 11.9, (x, z, dx, dz) => {
    cyl('galv', x, 0, 9.0, z, 0.14, 0.085, 10); K.add('galv', boxGeo([x - 0.22, 0, z - 0.22], [x + 0.22, 0.5, z + 0.22]));
    const a = Math.atan2(-dz, dx); const arm = (x0, y0, x1, y1, t) => { const L = Math.hypot(x1 - x0, y1 - y0); const g = new THREE.BoxGeometry(L, t, t); g.rotateZ(Math.atan2(y1 - y0, x1 - x0)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0); g.rotateY(a); g.translate(x, 0, z); K.add('galv', g); };
    arm(0, 8.55, 0.9, 9.05, 0.09); arm(0.85, 9.03, 2.2, 9.28, 0.08); arm(2.15, 9.27, 2.9, 9.32, 0.07);
    const hd = new THREE.BoxGeometry(0.95, 0.2, 0.38); hd.translate(3.2, 9.3, 0); hd.rotateY(a); hd.translate(x, 0, z); K.add('galv', hd);
    const ln = new THREE.BoxGeometry(0.7, 0.04, 0.28); ln.translate(3.22, 9.18, 0); ln.rotateY(a); ln.translate(x, 0, z); K.add('lampLens', ln, { uv: false });
    world.box([x - 0.2, 0, z - 0.2], [x + 0.2, 9, z + 0.2]);
  });
  // hydrants
  place(60, 11.6, (x, z) => {
    cyl('hydrant', x, 0, 0.08, z, 0.2, 0.2); cyl('hydrant', x, 0.08, 0.66, z, 0.15, 0.13);
    const cap = new THREE.SphereGeometry(0.14, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2); cap.translate(x, 0.66, z); K.add('galv', cap); cyl('galv', x, 0.78, 0.86, z, 0.04, 0.03, 6);
    const nz = new THREE.CylinderGeometry(0.055, 0.055, 0.42, 8); nz.rotateZ(Math.PI / 2); nz.translate(x, 0.46, z); K.add('galv', nz);
    const ft = new THREE.CylinderGeometry(0.075, 0.075, 0.12, 8); ft.rotateX(Math.PI / 2); ft.translate(x, 0.42, z + 0.16); K.add('galv', ft);
    world.box([x - 0.25, 0, z - 0.25], [x + 0.25, 0.85, z + 0.25]);
  });
  // parking signs (plate faces along the kerb, towards traffic)
  let ps = 0;
  place(45, 11.7, (x, z, dx, dz, ux, uz) => {
    K.add('galv', boxGeo([x - 0.03, 0, z - 0.03], [x + 0.03, 2.9, z + 0.03]));
    const a = Math.atan2(ux, uz); const p = new THREE.PlaneGeometry(0.46, 0.46); const top = (ps++ % 2) === 0; const uv = p.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), (top ? 0.5 : 0) + uv.getY(i) * 0.5);
    p.translate(0, 2.45, 0.035); p.rotateY(a); p.translate(x, 0, z); K.add('parkSign', p, { uv: false });
    const bk = boxGeo([-0.23, 2.22, 0.02], [0.23, 2.68, 0.03]); bk.rotateY(a); bk.translate(x, 0, z); K.add('galv', bk, { uv: false });
    world.box([x - 0.06, 0, z - 0.06], [x + 0.06, 2.9, z + 0.06]);
  });
  for (const m of K.flush({ shadow: true })) if (m.name === 'surfKit:paint') groundBias(m, 8);
}

/** Elevated subway: bents (two columns + cap girder) every 12 m, plate girders, two stringers, floor beams every 3 m (in play),
 *  the tie deck — its soffit is a tie/stringer texture with a lifted emissive term so the underside never renders #000. */
function viaducts(world, M) {
  const V = new Batch(world, M, 'viaduct');
  const Y = 7.5;   // top of rail
  const near = (x, z) => x > PLAY.x0 - 30 && x < PLAY.x1 + 30 && z > PLAY.z0 - 30 && z < PLAY.z1 + 30;
  const W8u = [0.970, 0.242];   // W 8 St station axis (coney/w8th.js): its own two-level structure
  const inW8 = (x, z) => { const dx = x - 274.5, dz = z + 153, a = dx * W8u[0] + dz * W8u[1], o = -dx * W8u[1] + dz * W8u[0]; return a > -12 && a < 200 && Math.abs(o) < 11; };
  const inTerminal = (x, z) => (x > -90 && x < -22 && z > -446 && z < -255) || inW8(x, z);   // the Stillwell terminal + W 8 St build their own decks + tracks
  for (const l of OSM.rl) {
    if (!l.el) continue;
    const pts = l.p; if (pts.length < 2) continue;
    walk(pts, 12, (x, z, dx, dz) => { // bents: two columns + cap girder across the track (+ knee braces in play)
      if (inTerminal(x, z)) return;
      const ang = Math.atan2(dx, dz);
      for (const s of [-2.4, 2.4]) { const g = boxGeo([-0.25, 0, -0.25], [0.25, Y - 1.1, 0.25]); g.translate(s, 0, 0); g.rotateY(ang); g.translate(x, 0, z); V.add('elGirder', g); }
      const cap = boxGeo([-3.0, Y - 1.3, -0.35], [3.0, Y - 0.9, 0.35]); cap.rotateY(ang); cap.translate(x, 0, z); V.add('elGirder', cap);
      if (near(x, z)) for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(0.16, 1.7, 0.2); g.rotateZ(s * 0.75); g.translate(s * 1.85, Y - 1.85, 0); g.rotateY(ang); g.translate(x, 0, z); V.add('elGirder', g); }
      world.box([x - 0.4, 0, z - 0.4], [x + 0.4, Y - 1, z + 0.4]);
    });
    if (pts.some(([x, z]) => near(x, z))) walk(pts, 3, (x, z, dx, dz) => { if (!near(x, z) || inTerminal(x, z)) return; const g = boxGeo([-2.0, Y - 0.62, -0.1], [2.0, Y - 0.25, 0.1]); g.rotateY(Math.atan2(dx, dz)); g.translate(x, 0, z); V.add('elGirder', g); });
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1]; const L = Math.hypot(bx - ax, bz - az); if (L < 0.5) continue; if (inTerminal((ax + bx) / 2, (az + bz) / 2)) continue; const ang = Math.atan2(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const seg = (x0, y0, x1, y1, key, uv = true) => { const g = boxGeo([x0, y0, -L / 2 - 0.05], [x1, y1, L / 2 + 0.05]); if (!uv) { const u = g.attributes.uv, p = g.attributes.position; for (let k = 0; k < u.count; k++) u.setXY(k, (p.getX(k) + 2.5) / 5, p.getZ(k) / 2.4); } g.rotateY(ang); g.translate(mx, 0, mz); V.add(key, g, { uv }); };
      seg(-2.2, Y - 1.0, -1.9, Y - 0.2, 'elGirder'); seg(1.9, Y - 1.0, 2.2, Y - 0.2, 'elGirder');                  // plate girders
      seg(-0.95, Y - 0.72, -0.65, Y - 0.25, 'elGirder'); seg(0.65, Y - 0.72, 0.95, Y - 0.25, 'elGirder');          // stringers under the rails
      seg(-2.5, Y - 0.25, 2.5, Y - 0.1, 'elSoffit', false);                                                        // tie deck (soffit texture)
      seg(-0.8, Y - 0.1, -0.7, Y, 'steel'); seg(0.7, Y - 0.1, 0.8, Y, 'steel');                                    // running rails
    }
  }
  V.flush({ shadow: true });
}

// Per-draw polygon offset for stacked ground layers: materials are shared (day/night + wetness tweak them), so the offset is
// set just before this mesh draws and restored after instead of cloning. rank 1..n pulls the layer toward the camera.
export function groundBias(mesh, rank) {
  let prev = null;
  mesh.onBeforeRender = (_r, _s, _c, _g, m) => { prev = [m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits]; m.polygonOffset = true; m.polygonOffsetFactor = -rank; m.polygonOffsetUnits = -2 * rank; };
  mesh.onAfterRender = (_r, _s, _c, _g, m) => { if (prev) [m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits] = prev; };
}
