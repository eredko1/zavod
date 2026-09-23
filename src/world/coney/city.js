// CONEY city side: sidewalk base, streets (curbs, double-yellow on the avenues, crosswalks), lots, parks, ball fields,
// every OSM building by style (brick housing towers, walk-ups, rowhouses, amusement-strip shops with shutters + painted banners,
// arcades, service sheds), and the elevated subway viaducts running into the terminal. CONEY agent.
import * as THREE from 'three';
import { Batch, boxGeo } from '../sbu/geo.js';
import { facade, block } from '../sbu/buildings.js';
import { OSM, PLAY } from './osm.js';
import { BW } from './shore.js';
import { ribbon, walk, footprint, bbox, cen, pip } from '../osmkit.js';
import { placeCars } from '../carkit.js';


export function buildCity(world, M) {
  const { scene, ctx, R } = world;
  const G = new Batch(world, M, 'cityGround'), S = new Batch(world, M, 'city'), F = new Batch(world, M, 'cityFar');
  // ---- base ground north of the boardwalk: concrete sidewalk everywhere, streets and plots on top -----------------------
  G.add('concretePav', boxGeo([-1000, -0.2, -1000], [900, 0.0, BW.z0]), { uvScale: 1 / 3 });
  world.box([-1000, -1, -1000], [900, 0, BW.z0]);
  for (const p of OSM.pk) G.poly('grass', p, 0.015);
  for (const p of OSM.l) G.poly('asphalt', p, 0.02);
  for (const o of OSM.pt) { G.poly(/baseball|softball/.test(o.sport) ? 'grass' : /basketball|handball|tennis/.test(o.sport) ? 'asphalt' : 'grass', o.p, 0.025); }
  for (const r of OSM.r) {
    const a = ribbon(r.p, r.w, 0.035); if (a) G.add('asphalt', a, { uvScale: 1 / 6 });
    const c = ribbon(r.p, r.w + 0.5, 0.03); if (c) G.add('curb', c, { uvScale: 0.5 });
    if (r.w >= 14) { const y1 = ribbonOffset(r.p, -0.18, 0.18, 0.04), y2 = ribbonOffset(r.p, 0.18, 0.18, 0.04); if (y1) G.add('paintY', y1, { uv: false }); if (y2) G.add('paintY', y2, { uv: false }); }
    else if (r.w >= 9) walk(r.p, 6, (x, z, dx, dz) => { const d = boxGeo([-0.06, 0.04, -1.5], [0.06, 0.045, 1.5]); d.rotateY(Math.atan2(dx, dz)); d.translate(x, 0, z); G.add('paint', d, { uv: false }); });
  }
  for (const w of OSM.w) { const g = ribbon(w.p, w.w, 0.045); if (g) G.add(w.s ? 'concreteGrey' : 'concretePav', g, { uvScale: 1 / 3 }); }
  G.flush({ shadow: false });

  // ---- buildings ----------------------------------------------------------------------------------------------------
  const inPlay = (b) => b.play;
  for (const b of OSM.b) {
    const T = inPlay(b) ? S : F;
    try { building(T, world, M, b); } catch (e) { console.warn('[coney] building', e); }
  }
  S.flush({ shadow: true }); F.flush({ shadow: true });

  // ---- elevated subway: steel viaduct (columns + girders + ties + rails) along every elevated OSM rail line ----------------
  viaducts(world, M);

  // ---- parked cars along the residential streets and in the lots ------------------------------------------------------
  const cars = [];
  for (const r of OSM.r) { if (r.w < 9 || r.w > 16) continue; walk(r.p, 6.5, (x, z, dx, dz) => { if (R() < 0.6) return; if (!(x > PLAY.x0 && x < PLAY.x1 && z > PLAY.z0 && z < BW.z0 - 5)) return; for (const s of [-1, 1]) { if (R() < 0.4) continue; const off = r.w / 2 - 1.3; cars.push({ x: x - dz * s * off, z: z + dx * s * off, ry: Math.atan2(dx, dz) - Math.PI / 2 + (s > 0 ? Math.PI : 0), kind: ['sedan', 'sedan', 'suv', 'hatch', 'van', 'cab'][(R() * 6) | 0] }); } }); }
  for (const p of OSM.l) { const q = bbox(p); if (!(q.x1 > PLAY.x0 && q.x0 < PLAY.x1 && q.z1 > PLAY.z0 && q.z0 < PLAY.z1)) continue; for (let x = q.x0 + 3; x < q.x1 - 3; x += 2.8) for (let z = q.z0 + 4; z < q.z1 - 3; z += 7) if (pip(x, z, p) && R() < 0.25) cars.push({ x, z, ry: Math.PI / 2 * (R() < 0.5 ? 1 : -1), kind: ['sedan', 'suv', 'hatch', 'van'][(R() * 4) | 0] }); }
  placeCars(world, cars, { raycast: false });
  for (const c of cars) { world.box([c.x - 1.6, 0, c.z - 1.6], [c.x + 1.6, 1.5, c.z + 1.6]); if (R() < 0.12) world.cover(c.x, c.z + 2, 0, 1); }
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
    shop(B, world, M, r, Math.min(h, 12), s === 'arcade');
  });
}

/** Amusement-strip building: painted masonry box, roll-down shutters (some open onto a lit counter), colourful fascia band,
 *  painted banner signs, awnings; taller ones get a second-floor window row + banner murals. */
function shop(B, world, M, r, h, arcade) {
  const R = world.R; const w = r.x1 - r.x0, d = r.z1 - r.z0;
  const wall = M.paintWallKeys[(R() * 6) | 0];
  block(B, wall, r.x0, r.z0, r.x1, r.z1, h, { hvac: h > 6 ? 1 : 0 });
  const faces = [['z0', r.x0, r.x1, r.z0, -1], ['z1', r.x0, r.x1, r.z1, 1], ['x0', r.z0, r.z1, r.x0, -1], ['x1', r.z0, r.z1, r.x1, 1]];
  for (const [f, a0, a1, c, sgn] of faces) {
    const L = a1 - a0; if (L < 4) continue;
    const alongX = f[0] === 'z'; const bay = 4.2; const nb = Math.max(1, Math.floor(L / bay)); const bw = L / nb;
    const fk = M.fasciaKeys[(R() * M.fasciaKeys.length) | 0];
    // fascia band (1 m) at 3.1 m
    const fb = alongX ? [[a0, 3.1, c + sgn * 0.02], [a1, 4.1, c + sgn * 0.12]] : [[c + sgn * 0.02, 3.1, a0], [c + sgn * 0.12, 4.1, a1]];
    B.add(fk, boxGeo(fb[0].map((v, i) => Math.min(v, fb[1][i])), fb[0].map((v, i) => Math.max(v, fb[1][i]))), { uv: false });
    for (let i = 0; i < nb; i++) {
      const b0 = a0 + i * bw + 0.25, b1 = a0 + (i + 1) * bw - 0.25; const open = R() < 0.35;
      const p0 = alongX ? [b0, 0.05, c + sgn * 0.03] : [c + sgn * 0.03, 0.05, b0], p1 = alongX ? [b1, 2.9, c + sgn * 0.06] : [c + sgn * 0.06, 2.9, b1];
      const mn = p0.map((v, k) => Math.min(v, p1[k])), mx = p0.map((v, k) => Math.max(v, p1[k]));
      if (open) { B.add('glassLit', boxGeo(mn, mx), { uv: false }); const cm = alongX ? [b0, 0, c + sgn * 0.1] : [c + sgn * 0.1, 0, b0], cM = alongX ? [b1, 1.05, c + sgn * 0.7] : [c + sgn * 0.7, 1.05, b1]; B.add(M.fasciaKeys[(R() * 8) | 0], boxGeo(cm.map((v, k) => Math.min(v, cM[k])), cm.map((v, k) => Math.max(v, cM[k]))), { uv: false }); }
      else B.add('shutter2', boxGeo(mn, mx), { uvScale: 1 / 3 });
      // shutter box + side piers
      const hb0 = alongX ? [b0 - 0.25, 2.9, c + sgn * 0.02] : [c + sgn * 0.02, 2.9, b0 - 0.25], hb1 = alongX ? [b1 + 0.25, 3.1, c + sgn * 0.3] : [c + sgn * 0.3, 3.1, b1 + 0.25];
      B.add('steelDark', boxGeo(hb0.map((v, k) => Math.min(v, hb1[k])), hb0.map((v, k) => Math.max(v, hb1[k]))), { uv: false });
    }
    // banner sign above the fascia, or a painted mural band on taller walls (shared sign materials, merged in the batch)
    {
      const mural = h > 7 && R() < 0.5; const key = mural ? M.muralKeys[(R() * 4) | 0] : M.signKeys[(R() * M.signKeys.length) | 0];
      const sw = Math.min(L - 1, mural ? L * 0.8 : 7), sh = sw / 4;
      const y = Math.min(h - sh / 2 - 0.3, 4.3 + sh / 2 + (mural ? 0.8 : 0));
      if (sw > 2 && y - sh / 2 > 3.9) {
        const g = new THREE.PlaneGeometry(sw, sh); const mid = (a0 + a1) / 2;
        if (alongX) { g.rotateY(sgn > 0 ? 0 : Math.PI); g.translate(mid, y, c + sgn * 0.14); } else { g.rotateY(sgn > 0 ? Math.PI / 2 : -Math.PI / 2); g.translate(c + sgn * 0.14, y, mid); }
        B.add(key, g, { uv: false });
      }
    }
    // striped awning over half the faces
    if (R() < 0.5) { const aw = alongX ? [[a0 + 0.3, 3.0, c], [a1 - 0.3, 3.15, c + sgn * 1.6]] : [[c, 3.0, a0 + 0.3], [c + sgn * 1.6, 3.15, a1 - 0.3]]; B.add(M.fasciaKeys[(R() * 8) | 0], boxGeo(aw[0].map((v, k) => Math.min(v, aw[1][k])), aw[0].map((v, k) => Math.max(v, aw[1][k]))), { uv: false }); }
  }
  if (w > 6 && d > 6) { world.cover((r.x0 + r.x1) / 2, r.z0 - 1.2, 0, -1); world.cover((r.x0 + r.x1) / 2, r.z1 + 1.2, 0, 1); }
}

function viaducts(world, M) {
  const V = new Batch(world, M, 'viaduct'); const R = world.R;
  const Y = 7.5;   // top of rail
  for (const l of OSM.rl) {
    if (!l.el) continue;
    const pts = l.p; if (pts.length < 2) continue;
    walk(pts, 12, (x, z, dx, dz) => { // bents: two columns + cap girder across the track
      const ang = Math.atan2(dx, dz);
      for (const s of [-2.4, 2.4]) { const g = boxGeo([-0.25, 0, -0.25], [0.25, Y - 1.1, 0.25]); g.translate(s, 0, 0); g.rotateY(ang); g.translate(x, 0, z); V.add('railSteelGreen', g, { uv: false }); }
      const cap = boxGeo([-3.0, Y - 1.3, -0.35], [3.0, Y - 0.9, 0.35]); cap.rotateY(ang); cap.translate(x, 0, z); V.add('railSteelGreen', cap, { uv: false });
      world.box([x - 0.4, 0, z - 0.4], [x + 0.4, Y - 1, z + 0.4]);
    });
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1]; const L = Math.hypot(bx - ax, bz - az); if (L < 0.5) continue; const ang = Math.atan2(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const seg = (x0, y0, x1, y1, key, w0 = null) => { const g = boxGeo([x0, y0, -L / 2 - 0.05], [x1, y1, L / 2 + 0.05]); g.rotateY(ang); g.translate(mx, 0, mz); V.add(key, g, { uv: w0 === null ? false : true }); };
      seg(-2.2, Y - 1.0, -1.9, Y - 0.2, 'railSteelGreen'); seg(1.9, Y - 1.0, 2.2, Y - 0.2, 'railSteelGreen');            // plate girders
      seg(-2.5, Y - 0.25, 2.5, Y - 0.1, 'planksDark');                                                                    // tie deck
      seg(-0.8, Y - 0.1, -0.7, Y, 'steel'); seg(0.7, Y - 0.1, 0.8, Y, 'steel');                                           // running rails
    }
  }
  V.flush({ shadow: true });
}
