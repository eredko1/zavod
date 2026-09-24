// CONEY — the Belt Parkway run to JFK. Drive up W 8th St past Sammy's (north end, by Neptune Ave) through the green
// "BELT PKWY EAST · JFK AIRPORT" gantry and you're on the parkway eastbound: 3 lanes each way along Jamaica Bay (water and marsh
// islands south, trees and low Queens rooftops north, Jersey-barrier median, cobra-head lights, overhead signs, traffic), into
// the airport loop — terminals with gates and parked jets, the control tower, a parking garage, a runway where jets land every
// ~35 s right over your head — and back out westbound; the "CONEY ISLAND" exit drops you back on W 8th St heading south.
// About a minute each way at speed (1.2 km of parkway); T skips ahead (to the airport eastbound, home from anywhere else).
// The parkway is its own zone far south of the map (the real one is 15 km long): W.zones lets players / vehicles live there
// without widening W.bounds (the AI nav window stays on Coney). Everyone who comes along (passengers) is carried with the driver.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hangkit as K } from '../hangkit.js';

export const ZONE = { x0: -2000, x1: 3400, z0: 11400, z1: 12700, oz: 12000 };   // world rect of the zone; local z = world z − oz
const X_W = 300, X_E = 1500;                                                     // parkway west end (entry / exit) → the airport loop
const C = (x) => 35 * Math.sin(2 * Math.PI * (x - X_W) / (X_E - X_W));          // centreline wiggle (local z), 0 at both ends
const LANES = 3, LW = 3.6, MED = 0.6, SH = 1.2, ROAD = LANES * LW + SH * 2;      // one carriageway: 3 lanes + shoulders = 13.2 m
const CW = MED / 2 + ROAD / 2;                                                    // carriageway centre offset from the median = 6.9 m
const RAMP = { x0: 394, x1: 420, z0: -560, z1: -541 };                           // coney: the on-ramp trigger (north end of W 8th St)
const BACK = { x: 404, z: -522, h: Math.PI };                                     // coney: where the exit puts you (heading south)

let Z = null;

export function buildBelt(world) {
  const { ctx, W, scene } = world;
  (W.zones || (W.zones = [])).push({ x0: ZONE.x0, x1: ZONE.x1, z0: ZONE.z0, z1: ZONE.z1 });
  { const gh = W.groundHeight; W.groundHeight = (x, z) => (z > ZONE.z0 - 50 && z < ZONE.z1 + 50 && x > ZONE.x0 - 50 && x < ZONE.x1 + 50 ? 0 : gh ? gh(x, z) : 0); }   // the parkway zone is flat (coney's function reports sea floor out here)
  const root = new THREE.Group(); root.name = 'beltParkway'; root.position.set(0, 0, ZONE.oz); scene.add(root);
  Z = { world, ctx, root, planes: [], traffic: [], t: 0, busy: false, lastTrip: -9 };
  const M = mats();
  const G = new Map(); const put = (m, g) => (G.get(m) || G.set(m, []).get(m)).push(g);
  const wbox = (x0, y0, z0, x1, y1, z1) => world.box([Math.min(x0, x1), y0, Math.min(z0, z1) + ZONE.oz], [Math.max(x0, x1), y1, Math.max(z0, z1) + ZONE.oz]);

  // ---- centreline polylines (local) --------------------------------------------------------------------------------------
  const pw = []; for (let x = X_W - 30; x <= X_E; x += 10) pw.push(new THREE.Vector2(x, C(x)));      // the parkway
  // traffic keeps right: eastbound is the south carriageway (+z), westbound the north one. Airport ring: the eastbound carries on
  // east, hairpins north round the east end, runs back west along the north side, then an S-curve drops south into the westbound
  const ring = [];
  for (let x = X_E; x <= 2300; x += 10) ring.push(new THREE.Vector2(x, CW));
  for (let a = Math.PI / 2; a >= -Math.PI / 2 - 1e-6; a -= Math.PI / 24) ring.push(new THREE.Vector2(2300 + Math.cos(a) * 150, CW - 150 + Math.sin(a) * 150));
  const sy = CW - 300; for (let x = 2290; x >= 1660; x -= 10) ring.push(new THREE.Vector2(x, sy));
  const P0 = new THREE.Vector2(1650, sy), P1 = new THREE.Vector2(1560, sy), P2 = new THREE.Vector2(1590, -CW), P3 = new THREE.Vector2(X_E, -CW);
  const bez = (t) => { const u = 1 - t; return new THREE.Vector2(u * u * u * P0.x + 3 * u * u * t * P1.x + 3 * u * t * t * P2.x + t * t * t * P3.x, u * u * u * P0.y + 3 * u * u * t * P1.y + 3 * u * t * t * P2.y + t * t * t * P3.y); };
  for (let t = 0.05; t <= 1.0001; t += 0.05) ring.push(bez(t));
  Z.ring = ring;

  // ---- road surfaces ----------------------------------------------------------------------------------------------------
  // ribbon between two signed offsets (+ = left of travel direction) along a polyline, at height y, v in metres / vRep
  const ribbon = (pts, o0, o1, y, vRep = 12) => {
    const pos = [], uv = [], idx = []; let L = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; const tx = b.x - a.x, tz = b.y - a.y, tl = Math.hypot(tx, tz) || 1;
      const nx = tz / tl, nz = -tx / tl;   // left normal
      if (i) L += pts[i].distanceTo(pts[i - 1]);
      pos.push(pts[i].x + nx * o0, y, pts[i].y + nz * o0, pts[i].x + nx * o1, y, pts[i].y + nz * o1); uv.push(0, L / vRep, 1, L / vRep);
      if (i) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals(); if (g.attributes.normal.getY(0) < 0) { g.index.array.reverse(); g.computeVertexNormals(); }
    return g;
  };
  // each carriageway textured with its own lane markings (yellow edge on the median side, dashed lanes, white edge outside)
  put(M.road, ribbon(pw, -MED / 2, -MED / 2 - ROAD, 0.02));         // eastbound (south side; + offsets = north)
  put(M.road, ribbon(pw, MED / 2, MED / 2 + ROAD, 0.02));           // westbound (north side)
  put(M.road, ribbon(ring, ROAD / 2, -ROAD / 2, 0.02));             // the airport loop (one-way, same markings)
  // median: concrete Jersey barrier the whole way (collider cells), cobra-head poles on it every 70 m
  const barrier = []; const barrierAt = (pts, off) => { for (let i = 0; i < pts.length - 1; i += 1) { const a = pts[i], b = pts[i + 1]; const L = a.distanceTo(b), ang = Math.atan2(b.y - a.y, b.x - a.x); const g = new THREE.BoxGeometry(L + 0.05, 1.0, 0.55); g.translate(0, 0.5, 0); g.rotateY(-ang); const tx = (b.x - a.x) / L, tz = (b.y - a.y) / L; g.translate((a.x + b.x) / 2 + tz * off, 0, (a.y + b.y) / 2 - tx * off); barrier.push(g); wbox((a.x + b.x) / 2 + tz * off - 0.4, 0, (a.y + b.y) / 2 - tx * off - 0.4, (a.x + b.x) / 2 + tz * off + 0.4, 1.0, (a.y + b.y) / 2 - tx * off + 0.4); } };
  barrierAt(pw.filter((p) => p.x < X_E - 10), 0);
  // outer guardrails (steel W-beam on posts) both sides of the parkway, and both sides of the loop
  const rails = []; const railAt = (pts, off) => { for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; const L = a.distanceTo(b), ang = Math.atan2(b.y - a.y, b.x - a.x), tx = (b.x - a.x) / L, tz = (b.y - a.y) / L; const cx = (a.x + b.x) / 2 + tz * off, cz = (a.y + b.y) / 2 - tx * off;
    const g = new THREE.BoxGeometry(L + 0.05, 0.32, 0.12); g.translate(0, 0.62, 0); g.rotateY(-ang); g.translate(cx, 0, cz); rails.push(g);
    const pst = new THREE.BoxGeometry(0.12, 0.75, 0.12); pst.translate(cx, 0.37, cz); rails.push(pst); wbox(cx - 0.35, 0, cz - 0.35, cx + 0.35, 0.8, cz + 0.35); } };
  railAt(pw, MED / 2 + ROAD + 0.6); railAt(pw, -(MED / 2 + ROAD + 0.6));
  railAt(ring.slice(1, ring.length - 3), ROAD / 2 + 0.6); railAt(ring.slice(1, ring.length - 3), -(ROAD / 2 + 0.6));
  put(M.concrete, mergeGeometries(barrier.map((g) => g.index ? g.toNonIndexed() : g))); put(M.steel, mergeGeometries(rails.map((g) => g.index ? g.toNonIndexed() : g)));
  // lamp poles on the median (both arms), on the loop's inner edge
  const poles = [], heads = [];
  const pole = (x, z, arms) => { const p = new THREE.CylinderGeometry(0.1, 0.16, 11, 8); p.translate(x, 5.5, z); poles.push(p.toNonIndexed());
    for (const [dx, dz] of arms) { const a = new THREE.BoxGeometry(Math.abs(dx) > 0.1 ? 3 : 0.12, 0.12, Math.abs(dz) > 0.1 ? 3 : 0.12); a.translate(x + dx * 1.5, 10.8, z + dz * 1.5); poles.push(a.toNonIndexed()); const h = new THREE.BoxGeometry(0.7, 0.18, 0.35); h.translate(x + dx * 3, 10.7, z + dz * 3); heads.push(h.toNonIndexed()); } };
  for (let x = X_W + 40; x < X_E - 20; x += 70) pole(x, C(x), [[0, -1], [0, 1]]);
  for (let i = 4; i < ring.length - 4; i += 7) { const a = ring[i], b = ring[i + 1], L = a.distanceTo(b) || 1, tz = (b.y - a.y) / L, tx = (b.x - a.x) / L; pole(a.x - tz * (ROAD / 2 + 1.5), a.y + tx * (ROAD / 2 + 1.5), [[tz, -tx]]); }
  put(M.steel, mergeGeometries(poles)); put(M.lamp, mergeGeometries(heads));

  // ---- ground, bay, marsh, shore --------------------------------------------------------------------------------------------
  put(M.grass, ribbon(pw, MED / 2 + ROAD + 0.3, 900, -0.02, 40));                  // north verge + fields
  put(M.shore, ribbon(pw, -(MED / 2 + ROAD + 0.3), -(MED / 2 + ROAD + 14), -0.05, 20));   // riprap shore south
  { const g = new THREE.PlaneGeometry(9000, 5000); g.rotateX(-Math.PI / 2); g.translate(700, -1.1, 2400); put(M.water, g); }       // Jamaica Bay
  { const g = new THREE.PlaneGeometry(1900, 700); g.rotateX(-Math.PI / 2); g.translate(2350, 0.0, -300); put(M.apron, g); }          // the airport's ground
  { const g = new THREE.PlaneGeometry(9000, 1400); g.rotateX(-Math.PI / 2); g.translate(700, -0.04, -1050); put(M.grass, g); }      // far fields north
  for (let i = 0; i < 16; i++) { const g = new THREE.CircleGeometry(40 + (i * 37) % 70, 18); g.rotateX(-Math.PI / 2); g.scale(1.8, 1, 0.8); g.translate(-1600 + i * 190, -0.5, 180 + (i * 131) % 700); put(M.marsh, g); }   // marsh islands
  wbox(X_W - 40, 0, -MED / 2 - ROAD - 1.4 + C(X_W), X_E, 1.2, -MED / 2 - ROAD - 1.0 + C(X_E));   // (end cap; the rails do the real work)

  // ---- signs: overhead green gantries ---------------------------------------------------------------------------------------
  const gantry = (x, side, lines) => {
    const c = C(x), z0 = side > 0 ? c + MED / 2 + ROAD + 1 : c - MED / 2 - ROAD - 1, zm = side > 0 ? c + 0.5 : c - 0.5;   // side > 0: over the eastbound
    const post = (z) => { const p = new THREE.BoxGeometry(0.4, 7.2, 0.4); p.translate(x, 3.6, z); put(M.steel, p); wbox(x - 0.4, 0, z - 0.4, x + 0.4, 7.2, z + 0.4); };
    post(z0); post(zm); const beam = new THREE.BoxGeometry(0.35, 0.35, Math.abs(z0 - zm)); beam.translate(x, 7.0, (z0 + zm) / 2); put(M.steel, beam);
    const tex = signTex(lines); const w = Math.abs(z0 - zm) * 0.8;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.32), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12 }));
    panel.position.set(x - side * 0.25, 6.2, (z0 + zm) / 2); panel.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; root.add(panel);
  };
  gantry(X_W + 120, 1, ['BELT PKWY', 'EAST', 'JFK AIRPORT  1 MI']);
  gantry(760, 1, ['EXIT 17', 'CROSS BAY BLVD', 'ROCKAWAYS']);
  gantry(1200, 1, ['JFK AIRPORT', 'ALL TERMINALS', 'NEXT RIGHT']);
  gantry(1250, -1, ['BELT PKWY', 'WEST', 'CONEY ISLAND  1 MI']);
  gantry(X_W + 200, -1, ['EXIT 7', 'CONEY ISLAND', 'W 8 ST · OCEAN PKWY']);

  // ---- north side: street trees + a strip of low Queens roofs ----------------------------------------------------------------
  const tree = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(3.2, 1), M.tree, 520), trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 3, 6), M.trunk, 520);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(); let n = 0;
  for (let x = X_W; x < X_E - 40 && n < 520; x += 9 + ((x * 7) % 5)) { const o = MED / 2 + ROAD + 6 + ((x * 13) % 22); const z = C(x) - o; const k = 0.8 + ((x * 3) % 7) / 10;
    s.set(k, k * (1.1 + ((x * 11) % 4) / 10), k); p.set(x, 3 + k * 2.6, z); tree.setMatrixAt(n, m4.compose(p, q, s)); s.set(1, 1, 1); p.set(x, 1.5, z); trunk.setMatrixAt(n, m4.compose(p, q, s)); n++; }
  tree.count = trunk.count = n; tree.castShadow = true; root.add(tree, trunk);
  const house = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.house, 700), roofI = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.roof, 700); let h = 0;
  for (let x = X_W; x < X_E - 60 && h < 700; x += 11) for (const row of [70, 95, 130, 170]) { if (h >= 700) break; const w = 8 + (x * row) % 5, d = 12 + (x + row) % 6, hh = 6 + ((x * row) % 9); const z = C(x) - row - ((x * 7) % 9);
    s.set(w, hh, d); p.set(x, hh / 2, z); house.setMatrixAt(h, m4.compose(p, q, s)); s.set(w + 0.3, 0.5, d + 0.3); p.set(x, hh + 0.25, z); roofI.setMatrixAt(h, m4.compose(p, q, s)); h++; }
  house.count = roofI.count = h; root.add(house, roofI);

  // ---- JFK: terminals, gates + parked jets, the tower, a garage, the runway -----------------------------------------------------
  // terminals inside the ring: kerb + drop-off on the south face (the loop road), gates and jets on the north (airside)
  const term = (x0, x1, z0, z1, name) => {
    const hgt = 16; { const g = box(x0, 0, z0, x1, hgt, z1); const uv = g.attributes.uv, dims = [[z1 - z0, hgt], [z1 - z0, hgt], [x1 - x0, z1 - z0], [x1 - x0, z1 - z0], [x1 - x0, hgt], [x1 - x0, hgt]]; for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / 12, uv.getY(k) * dims[f][1] / 9); } put(M.glass, g); } put(M.steel, box(x0 - 1, hgt, z0 - 1, x1 + 1, hgt + 1.5, z1 + 3));   // glass hall + roof slab over the kerb
    put(M.concrete, box(x0 + 2, 0, z1 + 1, x1 - 2, 0.2, z1 + 6));   // kerb / drop-off
    wbox(x0, 0, z0, x1, hgt, z1);
    const t = signTex([name], '#0e2b52'); const pl = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(40, x1 - x0 - 6), 5), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.4 })); pl.position.set((x0 + x1) / 2, hgt - 3.5, z1 + 0.3); root.add(pl);
    for (let x = x0 + 25; x < x1 - 10; x += 55) { put(M.steel, box(x - 2, 4, z0 - 28, x + 2, 7, z0)); Z.planes.push(parkedJet(root, M, x, z0 - 48, 0)); }   // jet bridges + a jet at every gate
  };
  { const t = signTex(['JFK', 'INTERNATIONAL AIRPORT'], '#123a7a'); const sg = new THREE.Mesh(new THREE.PlaneGeometry(26, 9), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.25 }));
    sg.position.set(1560, 9.5, CW + 24); sg.rotation.y = -Math.PI / 2 + 0.35; root.add(sg); for (const dz of [-8, 8]) { put(M.steel, box(1560 - 0.3, 0, CW + 24 + dz - 0.3, 1560 + 0.3, 14, CW + 24 + dz + 0.3)); } }
  term(1690, 1880, -110, -40, 'TERMINAL 4'); term(1930, 2150, -120, -40, 'TERMINAL 5');
  put(M.concrete, box(1700, 0, -262, 1900, 22, -205)); wbox(1700, 0, -262, 1900, 22, -205);   // parking garage
  for (let k = 1; k < 5; k++) put(M.dark, box(1700, k * 4.4 - 1.2, -205, 1900, k * 4.4, -204.5));
  { const tw = [2240, 0, -220]; put(M.concrete, cyl(tw[0], tw[2], 0, 62, 4.2, 5.5)); put(M.glass, cyl(tw[0], tw[2], 62, 70, 8, 6.5)); put(M.steel, cyl(tw[0], tw[2], 70, 72, 8.6, 8.6)); wbox(tw[0] - 5, 0, tw[2] - 5, tw[0] + 5, 72, tw[2] + 5); }
  const RWY = { z: -560, x0: 900, x1: 3300, w: 60 };
  { const g = new THREE.PlaneGeometry(RWY.x1 - RWY.x0, RWY.w); g.rotateX(-Math.PI / 2); g.translate((RWY.x0 + RWY.x1) / 2, 0.12, RWY.z); put(M.runway, g); }
  { const g = new THREE.PlaneGeometry(RWY.x1 - RWY.x0, 26); g.rotateX(-Math.PI / 2); g.translate((RWY.x0 + RWY.x1) / 2, 0.1, -440); put(M.taxi, g); }   // taxiway
  for (let x = RWY.x0 + 30; x < RWY.x1 - 30; x += 60) put(M.paint, box(x, 0.12, RWY.z - 0.5, x + 30, 0.16, RWY.z + 0.5));   // centreline dashes
  for (const x of [RWY.x0 + 20, RWY.x1 - 60]) for (let k = -6; k <= 6; k++) if (k) put(M.paint, box(x, 0.12, RWY.z + k * 3.8 - 0.9, x + 40, 0.16, RWY.z + k * 3.8 + 0.9));   // threshold bars
  // landing jets: every ~35 s one comes in from the east over the terminals, flares and rolls out
  for (let k = 0; k < 2; k++) { const j = jetMesh(M); j.visible = false; root.add(j); Z.landing = Z.landing || []; Z.landing.push({ m: j, t: -k * 18 }); }
  Z.rwy = RWY;

  // ---- traffic: cars cruising both carriageways + the loop (visual; they don't collide) ------------------------------------------
  for (let i = 0; i < 22; i++) { const car = trafficCar(M, i); root.add(car); Z.traffic.push({ m: car, eb: i % 2 === 0, lane: i % 3, s: (i * 397) % 3700, v: 24 + (i % 5) * 2.5 }); }

  // ---- merge everything static ------------------------------------------------------------------------------------------------
  for (const [m, list] of G) { const geo = list.length === 1 ? list[0] : mergeGeometries(list.map((g) => { const gg = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gg.deleteAttribute(k); if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2)); return gg; }));
    if (!geo) continue; const mesh = new THREE.Mesh(geo, m); mesh.receiveShadow = true; mesh.castShadow = m !== M.water && m !== M.grass && m !== M.road && m !== M.apron && m !== M.runway && m !== M.shore && m !== M.marsh && m !== M.taxi; root.add(mesh); }

  // ---- coney: the on-ramp gantry at the north end of W 8th St ------------------------------------------------------------------
  { const x = (RAMP.x0 + RAMP.x1) / 2, z = -536; const tex = signTex(['BELT PKWY', 'EAST', 'JFK AIRPORT ↑']);
    for (const dx of [-11, 11]) { const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7.2, 0.4), M.steel); p2.position.set(x + dx, 3.6, z); scene.add(p2); world.box([x + dx - 0.3, 0, z - 0.3], [x + dx + 0.3, 7.2, z + 0.3]); }
    const bm = new THREE.Mesh(new THREE.BoxGeometry(22, 0.35, 0.35), M.steel); bm.position.set(x, 7.0, z); scene.add(bm);
    const pn = new THREE.Mesh(new THREE.PlaneGeometry(9, 3), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15 })); pn.position.set(x, 6.1, z + 0.25); scene.add(pn); }

  world.updaters.push((dt) => { if (Z?.world === world) update(dt); });
  if (typeof window !== 'undefined' && window.__game) window.__game.belt = { enter: () => enter(), exit: () => exit(), state: () => ({ inZone: inZone(ctx.player.position), t: +Z.t.toFixed(1) }), ramp: RAMP, zone: ZONE };
  console.log('[belt] parkway + JFK built');
}

// ---------------------------------------------------------------------------------------------------------------------------
const inZone = (p) => p.z > ZONE.z0 && p.z < ZONE.z1 && p.x > ZONE.x0 && p.x < ZONE.x1;
function update(dt) {
  Z.t += dt; const { ctx } = Z; const p = ctx.player; const now = performance.now() / 1000;
  // traffic
  const loop = X_E - X_W;
  for (const c of Z.traffic) { c.s = (c.s + c.v * dt) % loop; const x = c.eb ? X_W + c.s : X_E - c.s; const off = MED / 2 + SH + LW * (c.lane + 0.5); const z = C(x) + (c.eb ? off : -off);
    const x2 = x + (c.eb ? 1 : -1), z2 = C(x2) + (c.eb ? off : -off); c.m.position.set(x, 0, z); c.m.rotation.y = Math.atan2(-(x2 - x), -(z2 - z)); }
  // landing jets
  for (const L of Z.landing) { L.t += dt; const T = 35; if (L.t < 0) continue; const k = (L.t % T) / T; const R = Z.rwy;
    const x = 5200 - k * (5200 - 1200), td = 2900; const y = x > td ? (x - td) * 0.052 : 0; L.m.visible = true; L.m.position.set(x, y + 1.6, R.z); L.m.rotation.set(0, Math.PI / 2, x > td ? -0.05 : 0); }
  if (!p || p.dead || now - Z.lastTrip < 3) return;
  // T: skip ahead — eastbound → the airport loop, anywhere else in the zone → back to Coney
  const here = ctx.vehicles?.mounted ? ctx.vehicles.mounted.pos : p.position;
  if (inZone(here) && ctx.state === 'playing' && ctx.input?.pressed?.has?.('KeyT')) { ctx.input.pressed.delete('KeyT'); if (here.x < X_E - 50 && here.z - ZONE.oz > C(here.x)) skipToAirport(); else exit(); return; }
  if (inZone(here) && !Z.hintT) { Z.hintT = 1; ctx.hud?.toast?.('T — skip ahead', 2500); }
  if (!inZone(here)) Z.hintT = 0;
  // on-ramp: drive through the gantry at the north end of W 8th St
  const v = ctx.vehicles?.mounted;
  if (v && !Z.busy && v.pos.x > RAMP.x0 && v.pos.x < RAMP.x1 && v.pos.z > RAMP.z0 && v.pos.z < RAMP.z1) enter();
  // exit: the westbound end of the parkway (driving or walking) → back to Coney
  const q = v ? v.pos : p.position;
  if (!Z.busy && inZone(q) && q.x < X_W + 10 && q.z - ZONE.oz < C(X_W) - 0.2) exit();   // westbound = north carriageway
}
function moveTo(x, z, h, speed) {
  const { ctx } = Z; const v = ctx.vehicles?.mounted, p = ctx.player;
  if (v) { v.pos.set(x, 0, z); v.heading = h; v.vel.set(-Math.sin(h) * speed, 0, -Math.cos(h) * speed); v.vy = 0; v.air = false; if (v.group) { v.group.position.copy(v.pos); v.group.rotation.y = h; } }
  else p.teleport(x, 0, z, h, 0);
}
function fade(text, fn) {
  const V = K; Z.busy = true; Z.lastTrip = performance.now() / 1000;
  const f = document.querySelector('.hgfade'), fl = document.querySelector('.hgfloor');
  if (f) { f.style.transition = 'opacity .35s'; f.style.opacity = '1'; }
  setTimeout(() => { try { fn(); } catch (e) { console.warn('[belt]', e); } if (fl) { fl.style.fontSize = '44px'; fl.textContent = text; }
    setTimeout(() => { if (f) f.style.opacity = '0'; if (fl) fl.textContent = ''; setTimeout(() => { if (f) { f.style.transition = ''; fl && (fl.style.fontSize = ''); } Z.busy = false; }, 400); }, 900); }, 380);
  void V;
}
function enter() { const sp = Math.max(18, Math.abs(Z.ctx.vehicles?.mounted?.fwdSpeed || 0)); fade('BELT PARKWAY · EASTBOUND', () => { const off = MED / 2 + SH + LW * 1.5; moveTo(X_W + 25, ZONE.oz + C(X_W + 25) + off, -Math.PI / 2, sp); }); }
function skipToAirport() { const sp = Math.max(18, Math.abs(Z.ctx.vehicles?.mounted?.fwdSpeed || 0)); fade('JFK AIRPORT', () => moveTo(X_E + 40, ZONE.oz + CW, -Math.PI / 2, Z.ctx.vehicles?.mounted ? sp : 0)); }
function exit() { const sp = Math.max(10, Math.abs(Z.ctx.vehicles?.mounted?.fwdSpeed || 0) * 0.6); fade('EXIT 7 · CONEY ISLAND', () => moveTo(BACK.x, BACK.z, BACK.h, Z.ctx.vehicles?.mounted ? sp : 0)); }

// ---------------------------------------------------------------------------------------------------------------------------
function box(x0, y0, z0, x1, y1, z1) { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g; }
function cyl(x, z, y0, y1, r0, r1) { const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, 20); g.translate(x, (y0 + y1) / 2, z); return g; }
function signTex(lines, bg = '#0f6b3a') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 176; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 176); g.strokeStyle = '#fff'; g.lineWidth = 5; g.strokeRect(8, 8, 496, 160);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const hh = 150 / lines.length; lines.forEach((t, i) => { let fs = i === 0 ? 50 : 40; do { g.font = `700 ${fs}px Arial`; fs -= 2; } while (g.measureText(t).width > 470); g.fillText(t, 256, 13 + hh * (i + 0.5)); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function roadTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#3a3b3d'; g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 5000; i++) { const v = 40 + Math.random() * 40; g.fillStyle = `rgba(${v},${v},${v + 2},0.5)`; g.fillRect(Math.random() * 256, Math.random() * 512, 2, 2); }
  const px = (m) => m / ROAD * 256;
  g.fillStyle = '#e8c33a'; g.fillRect(px(SH) - 3, 0, 5, 512);                        // yellow edge (median side)
  g.fillStyle = '#ecece6'; g.fillRect(px(ROAD - SH) - 2, 0, 5, 512);                  // white edge (outside)
  for (let l = 1; l < LANES; l++) for (let y = 0; y < 512; y += 128) g.fillRect(px(SH + l * LW) - 2, y, 4, 54);   // dashed lanes (3 m / 9 m)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
function jointTex() {   // airport concrete: 7.5 m slabs with dark joints, a few tyre streaks
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#a3a39c'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2500; i++) { const v = 140 + Math.random() * 40; g.fillStyle = `rgba(${v},${v},${v - 4},0.35)`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  g.strokeStyle = 'rgba(55,55,52,0.8)'; g.lineWidth = 2; for (let k = 0; k <= 4; k++) { g.beginPath(); g.moveTo(k * 64, 0); g.lineTo(k * 64, 256); g.stroke(); g.beginPath(); g.moveTo(0, k * 64); g.lineTo(256, k * 64); g.stroke(); }
  for (let k = 0; k < 8; k++) { g.fillStyle = 'rgba(40,40,40,0.12)'; g.fillRect(Math.random() * 256, 0, 6 + Math.random() * 10, 256); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1900 / 60, 700 / 60); t.anisotropy = 8; return t;
}
function glassTex() {   // curtain wall: blue-grey panes, white mullions, spandrel bands every 4.5 m
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#8fb3c8'); gr.addColorStop(1, '#4e7288'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#e8ecef'; for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 3, 256); for (let y = 0; y < 256; y += 64) g.fillRect(0, y, 256, 8);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
function mats() {
  const S = (c, r = 0.8, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const road = new THREE.MeshStandardMaterial({ map: roadTex(), roughness: 0.85 });
  return {
    road, concrete: S(0xb8b4aa, 0.9), steel: S(0x8d9296, 0.45, 0.7), lamp: new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffd9a0, emissiveIntensity: 0.6 }),
    grass: S(0x5d7a3a, 1), shore: S(0x7a7266, 1), marsh: S(0x7c8a4a, 1), water: new THREE.MeshStandardMaterial({ color: 0x2d5566, roughness: 0.18, metalness: 0.1 }),
    apron: new THREE.MeshStandardMaterial({ map: jointTex(), roughness: 0.95 }), runway: Object.assign(S(0x2e2f31, 0.9), { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), taxi: Object.assign(S(0x3c3d3f, 0.9), { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), paint: Object.assign(S(0xf2f2ee, 0.7), { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }),
    glass: new THREE.MeshStandardMaterial({ map: glassTex(), color: 0xffffff, roughness: 0.15, metalness: 0.55, emissive: 0x223344, emissiveIntensity: 0.25 }),
    dark: S(0x1c1e22, 0.8), tree: S(0x3e5a2c, 1), trunk: S(0x4a3a2a, 1), house: S(0xa89a88, 0.95), roof: S(0x4a4440, 0.95),
    jet: S(0xf2f3f5, 0.4, 0.2), jetBlue: S(0x1f4f9a, 0.5, 0.1), engine: S(0x9aa0a6, 0.4, 0.7), carBody: [0x2b3f73, 0x8a1c1c, 0xdadada, 0x1c1c1c, 0x6d7c86, 0xe0b422].map((c) => S(c, 0.35, 0.3)), carGlass: S(0x111418, 0.1, 0.5), tire: S(0x151515, 0.9),
  };
}
function jetMesh(M) {
  const g = new THREE.Group();
  const f = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 44, 16), M.jet); f.rotation.z = Math.PI / 2; g.add(f);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(2.0, 16, 10), M.jet); nose.scale.set(2.2, 1, 1); nose.position.x = 22; g.add(nose);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(2.0, 9, 16), M.jet); tail.rotation.z = Math.PI / 2; tail.position.x = -26.5; g.add(tail);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(9, 0.5, 38), M.jet); wing.position.set(1, -0.8, 0); g.add(wing);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(7, 9, 0.5), M.jetBlue); fin.position.set(-24, 5, 0); g.add(fin);
  const hs = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.4, 14), M.jet); hs.position.set(-25, 1.2, 0); g.add(hs);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(2.03, 2.03, 40, 16, 1, true, Math.PI * 0.9, Math.PI * 0.2), M.jetBlue); stripe.rotation.z = Math.PI / 2; g.add(stripe);
  for (const zs of [-7.5, 7.5]) { const e = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.1, 4.5, 14), M.engine); e.rotation.z = Math.PI / 2; e.position.set(4, -2.1, zs); g.add(e); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function parkedJet(root, M, x, z, yaw) { const j = jetMesh(M); j.position.set(x, 3.2, z); j.rotation.y = yaw + Math.PI / 2; root.add(j); return j; }
function trafficCar(M, i) {
  const g = new THREE.Group(); const body = M.carBody[i % M.carBody.length];
  const b = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.75, 4.5), body); b.position.y = 0.65; g.add(b);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.4), M.carGlass); cab.position.set(0, 1.3, 0.2); g.add(cab);
  for (const [x, z] of [[-0.85, -1.4], [0.85, -1.4], [-0.85, 1.4], [0.85, 1.4]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 12), M.tire); w.rotation.z = Math.PI / 2; w.position.set(x, 0.34, z); g.add(w); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
