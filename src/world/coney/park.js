// CONEY amusement-park dressing: the open ground between the avenue and the boardwalk is dense with food kiosks, game booths,
// striped awnings, string lights, picnic tables, bins and planters (critic r2: "a big empty concrete slab"). Everything is
// placed clear of OSM buildings, roads, ride fences and the landmarks. CONEY agent.
import * as THREE from 'three';
import { Batch, boxGeo } from '../sbu/geo.js';
import { OSM, PLAY } from './osm.js';
import { BW } from './shore.js';
import { LM } from './landmarks.js';
import { bbox, segDist } from '../osmkit.js';

export const ZONE = { x0: -270, x1: 245, z0: -60, z1: BW.z0 - 1 };

export function buildPark(world, M) {
  const { R } = world; const B = new Batch(world, M, 'park');
  const bb = OSM.b.map((b) => b._bb || (b._bb = bbox(b.p)));
  const coasters = OSM.rc.map((c) => bbox(c.p));
  const taken = [];
  const clear = (x, z, r) => {
    if (bb.some((q) => x > q.x0 - r && x < q.x1 + r && z > q.z0 - r && z < q.z1 + r)) return false;
    if (coasters.some((q) => x > q.x0 - 2 && x < q.x1 + 2 && z > q.z0 - 2 && z < q.z1 + 2)) return false;
    if (OSM.rd.some((d) => Math.hypot(d.x - x, d.z - z) < 11 + r)) return false;
    if (OSM.r.some((rd) => segDist(x, z, rd.p) < rd.w / 2 + r + 1)) return false;
    if (Math.hypot(x - LM.wheel.x, z - LM.wheel.z) < 16 || Math.hypot(x - LM.pj.x, z - LM.pj.z) < 12) return false;
    return !taken.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr + r);
  };
  // ---- kiosks / booths: counter box, striped awning, banner sign, lit counter window ---------------------------------------
  let n = 0;
  for (let i = 0; i < 2500 && n < 95; i++) {
    const x = ZONE.x0 + R() * (ZONE.x1 - ZONE.x0), z = ZONE.z0 + R() * (ZONE.z1 - ZONE.z0);
    const w = 3 + R() * 3.5, d = 2.4 + R() * 1.4; if (!clear(x, z, Math.max(w, d) / 2 + 1.5)) continue;
    taken.push([x, z, Math.max(w, d) / 2 + 1.5]); n++;
    const ry = [0, Math.PI / 2, Math.PI, -Math.PI / 2][(R() * 4) | 0]; const cs = Math.cos(ry), sn = Math.sin(ry);
    const P = (lx, ly, lz) => [x + lx * cs + lz * sn, ly, z - lx * sn + lz * cs];
    const put = (key, a, b, opt = {}) => { const g = boxGeo([a[0], a[1], a[2]], [b[0], b[1], b[2]]); g.translate(-(a[0] + b[0]) / 2, 0, -(a[2] + b[2]) / 2); g.rotateY(ry); const c = P((a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2); g.translate(c[0], 0, c[2]); B.add(key, g, opt); };
    const wall = M.paintWallKeys[(R() * 6) | 0], fk = M.fasciaKeys[(R() * 8) | 0], fk2 = M.fasciaKeys[(R() * 8) | 0];
    put(wall, [-w / 2, 0, -d / 2], [w / 2, 2.6, d / 2]);
    put('glassLit', [-w / 2 + 0.3, 1.0, d / 2], [w / 2 - 0.3, 2.2, d / 2 + 0.03], { uv: false });
    put(fk, [-w / 2 - 0.05, 0.95, d / 2], [w / 2 + 0.05, 1.05, d / 2 + 0.45], { uv: false });            // counter ledge
    put(fk2, [-w / 2 - 0.1, 2.6, -d / 2 - 0.1], [w / 2 + 0.1, 2.9, d / 2 + 0.1], { uv: false });          // roof cap
    // awning: alternating stripes as thin slats tilted out over the counter
    for (let k = 0; k < Math.floor(w / 0.5); k++) { const lx = -w / 2 + k * 0.5; const g = boxGeo([0, 0, 0], [0.5, 0.04, 1.3]); g.translate(0, 0, 0); g.rotateX(-0.35); g.translate(lx, 2.55, d / 2); g.rotateY(ry); g.translate(x, 0, z); B.add(k % 2 ? 'white' : fk, g, { uv: false }); }
    const sg = new THREE.PlaneGeometry(Math.min(w, 5), Math.min(w, 5) / 4); sg.translate(0, 3.4 + Math.min(w, 5) / 8, d / 2 + 0.05); sg.rotateY(ry); sg.translate(x, 0, z); B.add(M.signKeys[(R() * M.signKeys.length) | 0], sg, { uv: false });
    const back = new THREE.PlaneGeometry(Math.min(w, 5), Math.min(w, 5) / 4); back.rotateY(Math.PI); back.translate(0, 3.4 + Math.min(w, 5) / 8, d / 2 + 0.04); back.rotateY(ry); back.translate(x, 0, z); B.add('steelDark', back, { uv: false });
    for (const sx of [-1, 1]) put('steelDark', [sx * Math.min(w, 5) / 2 - 0.05, 2.9, d / 2], [sx * Math.min(w, 5) / 2 + 0.05, 3.4 + Math.min(w, 5) / 4, d / 2 + 0.1], { uv: false });
    const hw = (Math.abs(cs) > 0.5 ? w : d) / 2, hd = (Math.abs(cs) > 0.5 ? d : w) / 2;
    world.box([x - hw, 0, z - hd], [x + hw, 2.9, z + hd]);
    world.cover(x + sn * (d / 2 + 0.8), z + cs * (d / 2 + 0.8), sn, cs); world.cover(x - sn * (d / 2 + 0.8), z - cs * (d / 2 + 0.8), -sn, -cs);
  }
  // ---- string-light poles with catenaries of bulbs between neighbours ---------------------------------------------------
  const poles = [];
  for (let i = 0; i < 2000 && poles.length < 70; i++) { const x = ZONE.x0 + R() * (ZONE.x1 - ZONE.x0), z = ZONE.z0 + R() * (ZONE.z1 - ZONE.z0); if (!clear(x, z, 0.6) || poles.some(([px, pz]) => Math.hypot(px - x, pz - z) < 12)) continue; poles.push([x, z]); taken.push([x, z, 0.6]); }
  const bulbPts = [];
  for (const [x, z] of poles) {
    B.cyl('steelDark', x, z, 0, 6, 0.1, 8, { collide: true });
    const nb = poles.filter(([px, pz]) => { const d = Math.hypot(px - x, pz - z); return d > 1 && d < 22; }).slice(0, 2);
    for (const [px, pz] of nb) for (let k = 1; k < 12; k++) { const t = k / 12; bulbPts.push(new THREE.Vector3(x + (px - x) * t, 5.8 - Math.sin(t * Math.PI) * 1.4, z + (pz - z) * t)); }
  }
  if (bulbPts.length) {
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 4), M.bulb, bulbPts.length); const m4 = new THREE.Matrix4();
    bulbPts.forEach((p, i) => im.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z))); im.instanceMatrix.needsUpdate = true; im.name = 'stringLights'; world.scene.add(im);
    // the wires
    const wp = []; for (let i = 0; i + 1 < bulbPts.length; i++) if (bulbPts[i].distanceTo(bulbPts[i + 1]) < 3) wp.push(bulbPts[i], bulbPts[i + 1]);
    const lg = new THREE.BufferGeometry().setFromPoints(wp); world.scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x222222 })));
  }
  // ---- picnic tables, bins, planters --------------------------------------------------------------------------------
  for (let i = 0; i < 3000 && taken.length < 330; i++) {
    const x = ZONE.x0 + R() * (ZONE.x1 - ZONE.x0), z = ZONE.z0 + R() * (ZONE.z1 - ZONE.z0); const k = R();
    if (k < 0.45) { if (!clear(x, z, 1.4)) continue; taken.push([x, z, 1.4]); const c = M.fasciaKeys[(R() * 8) | 0]; B.box(c, [x - 0.9, 0.72, z - 0.4], [x + 0.9, 0.78, z + 0.4]); for (const s of [-0.65, 0.65]) B.box(c, [x - 0.9, 0.42, z + s - 0.15], [x + 0.9, 0.47, z + s + 0.15], { collide: false }); B.box('steelDark', [x - 0.05, 0, z - 0.7], [x + 0.05, 0.72, z + 0.7], { collide: false }); if (R() < 0.3) world.cover(x, z + 1.2, 0, 1); }
    else if (k < 0.75) { if (!clear(x, z, 0.5)) continue; taken.push([x, z, 0.5]); B.cyl(R() < 0.5 ? 'binGreen' : 'binBlue', x, z, 0, 0.95, 0.32, 12, { collide: true }); }
    else { if (!clear(x, z, 1.2)) continue; taken.push([x, z, 1.2]); B.box('concreteGrey', [x - 1, 0, z - 1], [x + 1, 0.6, z + 1]); B.box('hedge', [x - 0.9, 0.6, z - 0.9], [x + 0.9, 1.2, z + 0.9], { collide: false }); world.cover(x + 1.4, z, 1, 0); }
  }
  B.flush({ shadow: true });
}
