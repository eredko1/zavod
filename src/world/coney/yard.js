// CONEY — Coney Island Yard: the big yard north of Stillwell, between the West End / Sea Beach el (the D and the N) and Shell
// Rd, up towards Coney Island Creek. Nothing of it is in the OSM extract, so it's laid out here: a lead that turns off the el
// north of Neptune Ave and ramps down to grade, a ladder of stub tracks running north to bumper blocks, R160s laid up on most of
// them, the yard tower by the ladder, the overhaul shop on the east side and light masts over it all. A train you drive comes
// in through the throat switch (Y in the cab, subway.js); step off and it stays laid up on its track. Off the play rect: a
// W.zones rect lets you walk it. Parked trains are instanced (one draw per car piece, whatever the number of trains).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const YARD = { x0: -12, x1: 400, z0: -935, z1: -598 };   // world rect: ballast, no sprawl (horizon.js), a walkable zone
const NT = 12, GAP = 6.5, TURN_IN = 26, D0 = 160, ZEND = -905, R_LADDER = 30, RAMP0 = 12, RAMP1 = 175, GAUGE = 1.435, GRADE = 0.35;   // GRADE: top of rail on the ballast
const DIAG = new THREE.Vector2(Math.SQRT1_2, -Math.SQRT1_2);   // the ladder runs north-east across the yard

/** a polyline through waypoints with each corner rounded (quadratic, tangent T = r·tan(θ/2)), resampled every `step` m */
function rounded(wp, r, step = 2) {
  const pts = [wp[0].clone()];
  const line = (a, b) => { const L = a.distanceTo(b), n = Math.max(1, Math.round(L / step)); for (let k = 1; k <= n; k++) pts.push(a.clone().lerp(b, k / n)); };
  let from = wp[0];
  for (let i = 1; i < wp.length - 1; i++) {
    const v = wp[i], a = v.clone().sub(wp[i - 1]).normalize(), b = wp[i + 1].clone().sub(v).normalize();
    const th = Math.acos(Math.max(-1, Math.min(1, a.dot(b)))), T = Math.min(r * Math.tan(th / 2), v.distanceTo(wp[i - 1]) * 0.45, v.distanceTo(wp[i + 1]) * 0.45);
    const p0 = v.clone().addScaledVector(a, -T), p1 = v.clone().addScaledVector(b, T);
    line(from, p0); const n = Math.max(2, Math.round((2 * T) / step));
    for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; pts.push(new THREE.Vector2(u * u * p0.x + 2 * u * t * v.x + t * t * p1.x, u * u * p0.y + 2 * u * t * v.y + t * t * p1.y)); }
    from = p1;
  }
  line(from, wp[wp.length - 1]); return pts;
}

/**
 * The yard's tracks, every one starting at J (on the el, heading `dir` = north along it) and ending at its bumper block. Points
 * are THREE.Vector3 (x, rail height, z) with .s (m from J). Pure geometry: subway.js splices them onto a route you drive.
 */
export function yardTracks(J, dir, rail) {
  const j = new THREE.Vector2(J.x, J.z), d = new THREE.Vector2(dir.x, dir.z).normalize(), K = j.clone().addScaledVector(d, TURN_IN);
  const out = [];
  for (let k = 0; k < NT; k++) {
    const Lk = K.clone().addScaledVector(DIAG, D0 + k * GAP * Math.SQRT2), E = new THREE.Vector2(Lk.x, ZEND);
    const flat = rounded([j, K, Lk, E], R_LADDER);
    const P = []; let s = 0;
    flat.forEach((p, i) => { if (i) s += Math.hypot(p.x - flat[i - 1].x, p.y - flat[i - 1].y); const k = Math.max(0, Math.min(1, (s - RAMP0) / (RAMP1 - RAMP0)));
      const v = new THREE.Vector3(p.x, GRADE + (rail - GRADE) * (1 - k * k * (3 - 2 * k)), p.y); v.s = s; P.push(v); });
    // where this track leaves the ladder: a little before Lk (the start of its turnout curve)
    P.branch = Math.max(0, TURN_IN + D0 + k * GAP * Math.SQRT2 - R_LADDER * 0.6);
    P.L = s; P.k = k; P.x = Lk.x; out.push(P);
  }
  return out;
}
const at = (P, s, o = new THREE.Vector3()) => { s = Math.max(0, Math.min(P.L, s)); let lo = 0, hi = P.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m].s <= s) lo = m; else hi = m; }
  const a = P[lo], b = P[hi], k = (s - a.s) / Math.max(1e-6, b.s - a.s); return o.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k); };

function gravelTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#6d665d'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) { const v = 70 + Math.random() * 90 | 0; g.fillStyle = `rgb(${v},${v - 6},${v - 12})`; g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2.2, 1 + Math.random() * 2.2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
function signTex(text, sub) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 160; const g = c.getContext('2d'); g.fillStyle = '#0d0f12'; g.fillRect(0, 0, 1024, 160);
  g.fillStyle = '#f2f2f2'; g.font = '700 74px Helvetica, Arial'; g.textBaseline = 'middle'; g.fillText(text, 30, sub ? 62 : 82);
  if (sub) { g.fillStyle = '#b8bec6'; g.font = '500 34px Helvetica, Arial'; g.fillText(sub, 32, 126); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/**
 * Build it. `J`/`dir`: the junction on the el; `rail`: rail height there; `sources`: car groups of running trains to lay up
 * copies of (subway.js buildTrain output, one array of NCAR cars per line); `car` = { CAR, NCAR }.
 */
export function buildYard(world, { J, dir, rail, sources, car }) {
  const { scene, W, ctx } = world, lite = !!ctx.lite;
  const tracks = yardTracks(J, dir, rail);
  const root = new THREE.Group(); root.name = 'coneyYard'; scene.add(root);
  const solid = (x0, y0, z0, x1, y1, z1) => ctx.colliders?.push(new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)));   // the game's colliders are AABBs
  const steel = new THREE.MeshStandardMaterial({ color: 0x8b8e92, roughness: 0.35, metalness: 0.85 }), tieM = new THREE.MeshStandardMaterial({ color: 0x3d3128, roughness: 0.95 });
  const green = new THREE.MeshStandardMaterial({ color: 0x3f5a47, roughness: 0.7, metalness: 0.35 }), conc = new THREE.MeshStandardMaterial({ color: 0x77726a, roughness: 0.9 });

  // ballast over the whole yard (sits over the horizon's land tile)
  { const gt = gravelTex(); gt.repeat.set((YARD.x1 - YARD.x0) / 6, (YARD.z1 - YARD.z0) / 6);
    const g = new THREE.PlaneGeometry(YARD.x1 - YARD.x0, YARD.z1 - YARD.z0); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: gt, roughness: 1, color: 0xcfc8bd })); m.position.set((YARD.x0 + YARD.x1) / 2, 0.04, (YARD.z0 + YARD.z1) / 2); m.receiveShadow = true; root.add(m); }

  // rails + ties: the shared lead / ladder once (the last track runs the whole diagonal), then each track from where it branches
  const rails = [], tieMats = []; const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _o = new THREE.Object3D();
  const lay = (P, s0, s1) => {
    for (let s = s0; s < s1 - 0.01; s += 2) { at(P, s, _a); at(P, Math.min(s1, s + 2), _b); const dx = _b.x - _a.x, dz = _b.z - _a.z, dy = _b.y - _a.y, L = Math.hypot(dx, dz, dy) || 1, ang = Math.atan2(dx, dz), pitch = -Math.atan2(dy, Math.hypot(dx, dz));
      for (const o of [-GAUGE / 2, GAUGE / 2]) { const g = new THREE.BoxGeometry(0.08, 0.16, L + 0.02); g.rotateX(pitch); g.rotateY(ang); g.translate((_a.x + _b.x) / 2 + Math.cos(ang) * o, (_a.y + _b.y) / 2 - 0.08, (_a.z + _b.z) / 2 - Math.sin(ang) * o); rails.push(g); } }
    for (let s = s0; s < s1; s += lite ? 1.6 : 0.9) { at(P, s, _a); at(P, s + 0.5, _b); _o.position.set(_a.x, _a.y - 0.23, _a.z); _o.rotation.set(0, Math.atan2(_b.x - _a.x, _b.z - _a.z), 0); _o.updateMatrix(); tieMats.push(_o.matrix.clone()); }
  };
  const last = tracks[NT - 1]; lay(last, 4, last.L);
  for (let k = 0; k < NT - 1; k++) lay(tracks[k], tracks[k].branch, tracks[k].L);
  { const m = new THREE.Mesh(mergeGeometries(rails, false), steel); m.receiveShadow = true; root.add(m); }
  { const tg = new THREE.BoxGeometry(2.6, 0.14, 0.24), im = new THREE.InstancedMesh(tg, tieM, tieMats.length); tieMats.forEach((mx, i) => im.setMatrixAt(i, mx)); im.receiveShadow = true; root.add(im); }

  // the lead's viaduct down off the el: a deck + columns while it's up, a concrete wall-and-fill ramp near the bottom
  { const gs = [], cs = []; const P = last;
    for (let s = 8; s < RAMP1; s += 6) { at(P, s, _a); at(P, s + 6, _b); if (_a.y < 0.5) break; const ang = Math.atan2(_b.x - _a.x, _b.z - _a.z), L = Math.hypot(_b.x - _a.x, _b.z - _a.z), pitch = -Math.atan2(_b.y - _a.y, L);
      const y = (_a.y + _b.y) / 2, cx = (_a.x + _b.x) / 2, cz = (_a.z + _b.z) / 2;
      if (y > 2.6) { const d = new THREE.BoxGeometry(4.6, 0.3, L + 0.1); d.rotateX(pitch); d.rotateY(ang); d.translate(cx, y - 0.2, cz); gs.push(d);
        for (const o of [-2.2, 2.2]) { const gd = new THREE.BoxGeometry(0.4, 0.8, L + 0.1); gd.rotateX(pitch); gd.rotateY(ang); gd.translate(cx + Math.cos(ang) * o, y - 0.75, cz - Math.sin(ang) * o); gs.push(gd); }
        if (Math.round(s / 6) % 2 === 0) for (const o of [-2.6, 2.6]) { const c = new THREE.BoxGeometry(0.55, y - 1.1, 0.55); c.translate(_a.x + Math.cos(ang) * o, (y - 1.1) / 2, _a.z - Math.sin(ang) * o); gs.push(c); } }
      else { const f = new THREE.BoxGeometry(5.4, y, L + 0.1); f.rotateY(ang); f.translate(cx, y / 2 - 0.05, cz); cs.push(f); } }
    if (gs.length) { const m = new THREE.Mesh(mergeGeometries(gs, false), green); m.castShadow = m.receiveShadow = true; root.add(m); }
    if (cs.length) { const m = new THREE.Mesh(mergeGeometries(cs, false), conc); m.castShadow = m.receiveShadow = true; root.add(m); } }

  // bumper blocks (red / white faces), the yard tower, the shop, light masts
  { const bg = []; for (const P of tracks) { at(P, P.L, _a); at(P, P.L - 1, _b); const ang = Math.atan2(_a.x - _b.x, _a.z - _b.z);
      for (const [w, h, d, y, f] of [[2.6, 1.3, 0.5, 0.65, 0.4], [0.25, 1.1, 2.6, 0.55, -0.6]]) for (const o of w < 1 ? [-0.9, 0.9] : [0]) { const g = new THREE.BoxGeometry(w, h, d); g.translate(o, y, f); g.rotateY(ang); g.translate(_a.x, 0, _a.z); bg.push(g); } }
    const m = new THREE.Mesh(mergeGeometries(bg, false), new THREE.MeshStandardMaterial({ color: 0xb0281e, roughness: 0.7 })); m.castShadow = true; root.add(m); }
  const tw = tracks[0], tx = tw.x - 26, tz = tw[tw.length - 1].z + 175;   // the tower: west of track 1, looking down the ladder
  { const brick = new THREE.MeshStandardMaterial({ color: 0x8a5a44, roughness: 0.9 }), glass = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.15, metalness: 0.6, emissive: 0x332a18, emissiveIntensity: 0.4 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(9, 7, 7), brick); b.position.set(tx, 3.5, tz); b.castShadow = b.receiveShadow = true; root.add(b);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 8), glass); cab.position.set(tx, 8.5, tz); root.add(cab);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(11, 0.4, 9), conc); roof.position.set(tx, 10.2, tz); root.add(roof);
    solid(tx - 4.5, 0, tz - 3.5, tx + 4.5, 10.4, tz + 3.5);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.4), new THREE.MeshBasicMaterial({ map: signTex('CONEY ISLAND YARD', 'TOWER · NYC TRANSIT') })); sg.position.set(tx + 5.02, 5.6, tz); sg.rotation.y = Math.PI / 2; root.add(sg); }
  { const sx0 = tracks[NT - 1].x + 30, sx1 = sx0 + 64, sz0 = ZEND + 10, sz1 = ZEND + 190;   // the overhaul shop: a long sawtooth-roofed shed
    const wall = new THREE.MeshStandardMaterial({ color: 0xb9ab95, roughness: 0.92 }), roofM = new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.8, metalness: 0.3 });
    const g = new THREE.Mesh(new THREE.BoxGeometry(sx1 - sx0, 12, sz1 - sz0), wall); g.position.set((sx0 + sx1) / 2, 6, (sz0 + sz1) / 2); g.castShadow = g.receiveShadow = true; root.add(g);
    const teeth = []; for (let z = sz0; z < sz1 - 1; z += 12) { const t = new THREE.BoxGeometry(sx1 - sx0, 3.2, 12); t.translate(0, 1.6, 0); const p = t.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 3 && p.getZ(i) > 0) p.setY(i, 0.2); t.translate((sx0 + sx1) / 2, 12, z + 6); teeth.push(t); }
    solid(sx0, 0, sz0, sx1, 15, sz1);
    const r = new THREE.Mesh(mergeGeometries(teeth, false), roofM); r.castShadow = true; root.add(r);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(36, 3), new THREE.MeshBasicMaterial({ map: signTex('CONEY ISLAND OVERHAUL SHOP') })); sg.position.set((sx0 + sx1) / 2, 9.2, sz1 + 0.05); root.add(sg); }
  { const pole = [], heads = []; const mast = (x, z) => { const p = new THREE.CylinderGeometry(0.22, 0.32, 22, 6); p.translate(x, 11, z); pole.push(p); const h = new THREE.BoxGeometry(3, 0.6, 1.2); h.translate(x, 22, z); heads.push(h); };
    for (const k of [-1, 2, 5, 8, NT - 1]) { const x = k < 0 ? tracks[0].x - 8 : tracks[k].x + GAP / 2, zTop = (k < 0 ? tracks[0] : tracks[Math.min(NT - 1, k + 1)]).find((p) => Math.abs(p.x - (k < 0 ? tracks[0].x : tracks[Math.min(NT - 1, k + 1)].x)) < 0.05).z - 20;   // north of where the next track leaves the ladder
      for (let z = zTop; z > ZEND + 10; z -= 68) mast(x, z); }
    if (pole.length) { root.add(new THREE.Mesh(mergeGeometries(pole, false), new THREE.MeshStandardMaterial({ color: 0x777b80, roughness: 0.6, metalness: 0.6 })));
      root.add(new THREE.Mesh(mergeGeometries(heads, false), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd9a0, emissiveIntensity: 0.8 }))); } }

  // laid-up trains: every source car piece becomes one InstancedMesh; a train is NCAR instance slots along its track
  const { CAR, NCAR } = car, free = new Set(tracks.map((P) => P.k)), parked = [];
  const placeCars = (P, sHead, cb) => { for (let c = 0; c < NCAR; c++) { const sm = sHead - (c + 0.5) * CAR; at(P, sm + CAR / 2 - 2.6, _a); at(P, sm - CAR / 2 + 2.6, _b);
    _o.position.copy(_a).add(_b).multiplyScalar(0.5); _o.rotation.set(0, Math.atan2(_a.x - _b.x, _a.z - _b.z), 0); _o.updateMatrix(); cb(c, _o.matrix); } };
  const want = sources.length ? Math.min(NT - 3, lite ? 3 : 8) : 0, pick = []; for (let i = 0; pick.length < want && i < NT * 3; i++) { const k = (i * 5 + 1) % NT; if (!pick.includes(k)) pick.push(k); }
  const bySrc = sources.map(() => []); pick.forEach((k, i) => bySrc[i % sources.length].push(k));
  sources.forEach((cars, si) => { const ks = bySrc[si]; if (!ks.length) return;
    cars.forEach((g, c) => { for (const ch of g.children) { if (!ch.isMesh) continue;
      let m = ch.material; if (m === g.userData.head || m === g.userData.mark) { m = m.clone(); m.emissiveIntensity = 0.05; }   // headlights / marker lamps off
      const im = new THREE.InstancedMesh(ch.geometry, m, ks.length); im.castShadow = false; im.receiveShadow = true; ch.updateMatrix();
      ks.forEach((k, i) => placeCars(tracks[k], tracks[k].L - 4, (cc, mx) => { if (cc === c) im.setMatrixAt(i, _m.multiplyMatrices(mx, ch.matrix)); }));
      im.computeBoundingSphere(); root.add(im); } });
    for (const k of ks) { free.delete(k); parked.push(k); placeCars(tracks[k], tracks[k].L - 4, (c, mx) => { _a.setFromMatrixPosition(mx); solid(_a.x - 1.6, 0, _a.z - CAR / 2 + 0.3, _a.x + 1.6, 4.2, _a.z + CAR / 2 - 0.3); }); } });   // the tracks run due north here: a box per car

  // the whole yard is out past the play rect: walkable, its own zone; a name on the map
  (W.zones || (W.zones = [])).unshift({ x0: 0, x1: YARD.x1, z0: YARD.z0, z1: -540, name: 'CONEY ISLAND YARD', hint: 'R160s laid up between runs' });   // first: Bay 50 St's rect overlaps it (the lead, west of x 0, stays in that one)
  (W.mapPOIs || (W.mapPOIs = [])).push({ name: 'CONEY ISLAND YARD', x: tx + 60, z: tz - 60, kind: 'landmark' });
  // far away: hide it (the horizon draws the land under it)
  const C = new THREE.Vector3((YARD.x0 + YARD.x1) / 2, 0, (YARD.z0 + YARD.z1) / 2);
  world.updaters.push(() => { const cam = ctx.camera?.position; if (cam) root.visible = Math.hypot(cam.x - C.x, cam.z - C.z) < (lite ? 700 : 1400); });

  return {
    tracks, J, free: () => [...free].sort((a, b) => a - b), parked: () => parked.slice(),
    /** a train you drove in stays here: copies of its cars where they stand, the track taken */
    layUp(k, cars) { if (!free.has(k)) return false; free.delete(k); parked.push(k);
      for (const g of cars) { g.updateMatrixWorld(true); const cp = g.clone(); cp.matrixAutoUpdate = false; cp.matrix.copy(g.matrixWorld); cp.visible = true; root.add(cp);
        _a.setFromMatrixPosition(g.matrixWorld); const h = Math.atan2(g.matrixWorld.elements[8], g.matrixWorld.elements[10]), ex = Math.abs(Math.sin(h)) * CAR / 2 + 1.6, ez = Math.abs(Math.cos(h)) * CAR / 2 + 1.6;
        solid(_a.x - ex + 0.3, 0, _a.z - ez + 0.3, _a.x + ex - 0.3, 4.2, _a.z + ez - 0.3); }
      try { ctx.player?.rebuildColliders?.(); } catch {}
      return true; },
  };
}
const _m = new THREE.Matrix4();
