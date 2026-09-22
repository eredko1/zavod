// CITY SQUARE furniture: benches, cast-iron lampposts, lawn + perimeter fences, chess plaza, the two statues, park house (ladder → roof),
// playgrounds, dog runs, and the street: parked cars, hydrants, one-way signs, bike racks, tree pits, road markings. All instanced/merged. WSP agent.
import * as THREE from 'three';
import { carGeometries, carMaterials, CAR_KINDS, CAR_COLORS } from '../carkit.js';
import { PARK, PATHS, FOUNTAIN, CHESS, STATUE_E, STATUE_W, PLAY_NE, PLAY_NW, DOG_L, DOG_S, PARKHOUSE, STREETS, BOUNDS, ARCH, CIRCLES, BUILDINGS } from './layout.js';
import { chessTexture } from './textures.js';
import { mergeGeos } from './ground.js';

const M = {};
const mat = (k, o) => M[k] || (M[k] = new THREE.MeshStandardMaterial(o));
const BLACK = () => mat('iron', { color: 0x15161a, roughness: 0.55, metalness: 0.6 });
const WOOD = () => mat('slat', { color: 0x4a3626, roughness: 0.85 });
const CONC = () => mat('conc', { color: 0x8f8a82, roughness: 0.9 });

/** Instance a merged geometry at placements [{x,y,z,ry,s}] → InstancedMesh (raycastable, optional per-instance AABB collider). */
export function instance(world, geo, material, places, { surface = 'metal', collide = null, shadow = true, name = 'inst', colors = null, ray = true } = {}) {
  const { ctx, scene } = world; if (!places.length) return null;
  const im = new THREE.InstancedMesh(geo, material, places.length); im.name = name;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
  places.forEach((pl, i) => {
    e.set(0, pl.ry || 0, 0); q.setFromEuler(e); p.set(pl.x, pl.y || 0, pl.z); const sc = pl.s || 1; s.set(sc, sc, sc); im.setMatrixAt(i, m.compose(p, q, s));
    if (colors) im.setColorAt(i, colors[i % colors.length]);
    if (collide) { const [hx, hy, hz] = collide; const c = Math.abs(Math.cos(pl.ry || 0)), sn = Math.abs(Math.sin(pl.ry || 0)); const ex = hx * c + hz * sn, ez = hx * sn + hz * c; ctx.colliders.push(new THREE.Box3(new THREE.Vector3(pl.x - ex, (pl.y || 0), pl.z - ez), new THREE.Vector3(pl.x + ex, (pl.y || 0) + hy, pl.z + ez))); }
  });
  im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = shadow; im.receiveShadow = true; im.userData.surface = surface; im.frustumCulled = false; scene.add(im); if (ray) ctx.raycastTargets.push(im);
  return im;
}

const along = (pts, step, fn) => { // walk a polyline, call fn(x, z, dirx, dirz) every `step` metres
  let next = 0, acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1]; const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); const ux = dx / L, uz = dz / L;
    while (next <= acc + L) { const d = next - acc; fn(x0 + ux * d, z0 + uz * d, ux, uz); next += step; }
    acc += L;
  }
};

export function buildFurniture(world, T) {
  const { ctx, scene, R } = world; const V = (x, z) => world.maskSample ? world.maskSample(x, z) : 'lawn';
  const isPaved = (x, z) => { const s = V(x, z); return s === 'hex' || s === 'side'; };
  const contact = world.contactBlobs = [];   // {x,z,s,y?,ry?,ax?,az?} → soft contact-shadow blobs, merged into one mesh at the end

  // ---- benches (World's Fair style): cast-iron end frames + wooden slats, 1.85 m ----------------------------------
  const frame = [], slats = [];
  for (const sx of [-0.85, 0.85]) {
    // narrow cast-iron end frame: two splayed legs + a stretcher + a scrolled arm (not a solid black slab)
    for (const [dz, lean] of [[-0.22, 0.16], [0.2, -0.14]]) { const leg = new THREE.BoxGeometry(0.055, 0.47, 0.09); leg.rotateX(lean); leg.translate(sx, 0.235, dz); frame.push(leg); }
    const foot = new THREE.BoxGeometry(0.09, 0.05, 0.62); foot.translate(sx, 0.025, -0.01); frame.push(foot);
    const str = new THREE.BoxGeometry(0.05, 0.05, 0.42); str.translate(sx, 0.22, -0.02); frame.push(str);
    const back = new THREE.BoxGeometry(0.06, 0.55, 0.07); back.rotateX(-0.25); back.translate(sx, 0.7, -0.24); frame.push(back);
    const arm = new THREE.BoxGeometry(0.055, 0.05, 0.5); arm.translate(sx, 0.67, -0.02); frame.push(arm);
    const armP = new THREE.BoxGeometry(0.05, 0.22, 0.05); armP.translate(sx, 0.56, 0.2); frame.push(armP);
  }
  for (let i = 0; i < 3; i++) { const s = new THREE.BoxGeometry(1.85, 0.04, 0.13); s.translate(0, 0.46, -0.2 + i * 0.16); slats.push(s); }
  for (let i = 0; i < 3; i++) { const s = new THREE.BoxGeometry(1.85, 0.12, 0.04); s.rotateX(-0.25); s.translate(0, 0.62 + i * 0.15, -0.26 - i * 0.04); slats.push(s); }
  const benches = [];
  const bench = (x, z, ry) => benches.push({ x, z, ry });
  // ring of benches around the fountain plaza, facing the centre, on the coping band and at r 20 / 27
  for (const [r, n] of [[FOUNTAIN.coping + 1.3, 26], [24, 22], [29.5, 18]]) for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + (r > 20 ? 0.08 : 0); if (Math.abs(Math.sin(a)) < 0.12 || Math.abs(Math.cos(a)) < 0.12) continue; bench(Math.cos(a) * r, Math.sin(a) * r, Math.atan2(-Math.cos(a), -Math.sin(a))); }
  // along the main paths: both sides every 4.2 m in runs, facing the path
  for (const p of PATHS.slice(0, 12)) { let k = 0; along(p.pts, 4.2, (x, z, ux, uz) => { k++; if (k % 7 < 2) return; for (const sd of [-1, 1]) { const nx = -uz * sd, nz = ux * sd; const off = p.w / 2 + 0.6; const bx = x + nx * off, bz = z + nz * off; if (V(bx, bz) === 'asphalt') continue; bench(bx, bz, Math.atan2(-nx, -nz)); } }); }
  // chess plaza rows + east statue plaza
  for (let i = 0; i < 6; i++) bench(CHESS.x0 + 4 + i * 4.5, CHESS.z1 - 2.5, Math.PI);
  const benchFrame = instance(world, mergeGeos(frame), BLACK(), benches, { surface: 'metal', name: 'benchFrames', collide: [0.95, 0.9, 0.35] });
  instance(world, mergeGeos(slats), WOOD(), benches, { surface: 'wood', name: 'benchSlats', collide: null });
  for (const b of benches) { contact.push({ x: b.x, z: b.z, s: 2.6, ry: b.ry, ax: 2.4, az: 1.0 }); if (R() < 0.35) { const nx = Math.sin(b.ry), nz = Math.cos(b.ry); world.cover(b.x + nx * 0.9, b.z + nz * 0.9, nx, nz); } }

  // ---- lampposts: black cast-iron post 4.4 m on a 0.4 m octagonal base, single acorn globe (warm, off by day) --------
  const post = [new THREE.CylinderGeometry(0.07, 0.11, 4.4, 10)]; post[0].translate(0, 2.2, 0);
  const base = new THREE.CylinderGeometry(0.19, 0.2, 0.42, 8); base.translate(0, 0.21, 0); post.push(base);          // 0.4 m across flats, octagonal cast iron
  const baseCap = new THREE.CylinderGeometry(0.135, 0.185, 0.12, 8); baseCap.translate(0, 0.48, 0); post.push(baseCap);
  const baseFoot = new THREE.CylinderGeometry(0.22, 0.24, 0.07, 8); baseFoot.translate(0, 0.035, 0); post.push(baseFoot);
  const collar = new THREE.CylinderGeometry(0.13, 0.13, 0.2, 10); collar.translate(0, 4.4, 0); post.push(collar);
  const globe = new THREE.SphereGeometry(0.24, 12, 10); globe.scale(1, 1.3, 1); globe.translate(0, 4.78, 0);
  const cap = new THREE.ConeGeometry(0.14, 0.22, 10); cap.translate(0, 5.16, 0); post.push(cap);
  const lamps = [];
  const lamp = (x, z) => lamps.push({ x, z, ry: R() * 6.3 });
  for (let i = 0; i < 12; i++) { const a = (i + 0.5) / 12 * Math.PI * 2; lamp(Math.cos(a) * 21, Math.sin(a) * 21); }
  for (const p of PATHS.slice(0, 17)) { let k = 0; along(p.pts, 22, (x, z, ux, uz) => { k++; const sd = k & 1 ? 1 : -1; const bx = x - uz * sd * (p.w / 2 + 0.9), bz = z + ux * sd * (p.w / 2 + 0.9); if (V(bx, bz) !== 'asphalt') lamp(bx, bz); }); }
  for (let x = -150; x < 140; x += 24) { lamp(x, PARK.z0 - 1.6); lamp(x + 7, PARK.z1 + 1.6); }
  for (let z = -60; z < 70; z += 26) { lamp(PARK.x0 - 1.6, z); lamp(PARK.x1 + 1.6, z + 9); }
  // sidewalks of the outer streets
  for (const s of STREETS) { if (s.axis === 'x') { for (let x = s.a0 + 8; x < s.a1; x += 30) lamp(x, s.r0 - 1.6); } else { for (let z = s.a0 + 8; z < s.a1; z += 30) lamp(s.r1 + 1.6, z); } }
  instance(world, mergeGeos(post), mat('castIron', { color: 0x1e1e1e, roughness: 0.6, metalness: 0.45 }), lamps, { surface: 'metal', name: 'lampPosts', collide: [0.15, 4.4, 0.15] });
  instance(world, globe, mat('globe', { color: 0xf6f2e4, roughness: 0.35, emissive: 0xfff2d0, emissiveIntensity: 0.3 }), lamps, { surface: 'metal', name: 'lampGlobes', shadow: false });
  for (const l of lamps) contact.push({ x: l.x, z: l.z, s: 1.3 });
  world.W.lampPositions.push(...lamps.map(l => new THREE.Vector3(l.x, 4.85, l.z)));

  // ---- lawn fences (0.42 m black steel hoops, step-over) along both edges of every path; perimeter fence 1.1 m -----
  const hoop = []; { const rail = new THREE.BoxGeometry(2.0, 0.035, 0.035); rail.translate(0, 0.40, 0); hoop.push(rail); const rail2 = rail.clone(); rail2.translate(0, -0.2, 0); hoop.push(rail2); for (const sx of [-0.95, 0.95]) { const p = new THREE.BoxGeometry(0.03, 0.42, 0.03); p.translate(sx, 0.21, 0); hoop.push(p); } }
  const hoops = [];
  for (const p of PATHS) along(p.pts, 2.0, (x, z, ux, uz) => { for (const sd of [-1, 1]) { const off = p.w / 2 + 0.25; const fx = x - uz * sd * off, fz = z + ux * sd * off; if (V(fx - uz * sd * 0.5, fz + ux * sd * 0.5) !== 'lawn') continue; hoops.push({ x: fx, z: fz, ry: Math.atan2(-uz, ux) }); } });
  for (let i = 0; i < 96; i++) { const a = i / 96 * Math.PI * 2; const r = FOUNTAIN.plaza + 0.3; if (V(Math.cos(a) * (r + 0.6), Math.sin(a) * (r + 0.6)) === 'lawn') hoops.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, ry: Math.atan2(-Math.cos(a), -Math.sin(a)) }); }
  instance(world, mergeGeos(hoop), BLACK(), hoops, { surface: 'metal', name: 'lawnFence', collide: [1.0, 0.42, 0.04], shadow: false, ray: false });
  // perimeter: 1.1 m picket fence on a granite curb, gaps at path entrances
  const pick = []; { const top = new THREE.BoxGeometry(2.0, 0.04, 0.04); top.translate(0, 1.08, 0); pick.push(top); const mid = top.clone(); mid.translate(0, -0.5, 0); pick.push(mid); for (let x = -0.9; x <= 0.9; x += 0.15) { const p = new THREE.BoxGeometry(0.025, 1.1, 0.025); p.translate(x, 0.55, 0); pick.push(p); } const curb = new THREE.BoxGeometry(2.0, 0.25, 0.3); curb.translate(0, 0.125, 0); }
  const picks = []; const curbs = [];
  const gap = (x, z) => { for (const p of PATHS) for (const pt of p.pts) if (Math.hypot(pt[0] - x, pt[1] - z) < p.w / 2 + 1.4) return true; return false; };
  for (let x = PARK.x0 + 1; x < PARK.x1; x += 2) for (const z of [PARK.z0, PARK.z1]) { if (gap(x, z)) continue; picks.push({ x, z, ry: 0 }); }
  for (let z = PARK.z0 + 1; z < PARK.z1; z += 2) for (const x of [PARK.x0, PARK.x1]) { if (gap(x, z)) continue; picks.push({ x, z, ry: Math.PI / 2 }); }
  instance(world, mergeGeos(pick), BLACK(), picks, { surface: 'metal', name: 'perimeterFence', collide: [1.0, 1.1, 0.05], shadow: true });
  const curbG = new THREE.BoxGeometry(2.0, 0.22, 0.3); curbG.translate(0, 0.11, 0);
  instance(world, curbG, mat('granite', { map: world.tex.granite, roughness: 0.7, color: 0xb8b4ac }), picks, { surface: 'concrete', name: 'fenceCurb', shadow: false, ray: false });

  // ---- chess plaza: 0.8 m square cast-concrete tables with an 8×8 inlay, one pedestal, 2 fixed stools (5 × 4 grid) ---
  const concMat = mat('concTable', { map: T.concrete, normalMap: T.concreteN, normalScale: new THREE.Vector2(0.5, 0.5), color: 0xa4a29c, roughness: 0.9, metalness: 0 });
  const tableG = [];
  { const top = new THREE.BoxGeometry(0.8, 0.1, 0.8); top.translate(0, 0.75, 0); tableG.push(top);
    const chamf = new THREE.BoxGeometry(0.72, 0.05, 0.72); chamf.translate(0, 0.675, 0); tableG.push(chamf);         // moulded underside
    const ped = new THREE.CylinderGeometry(0.15, 0.22, 0.7, 12); ped.translate(0, 0.35, 0); tableG.push(ped);
    const foot = new THREE.CylinderGeometry(0.3, 0.34, 0.09, 12); foot.translate(0, 0.045, 0); tableG.push(foot);     // grounded base (no floating pedestal)
    for (const sz of [-0.86, 0.86]) {
      const seat = new THREE.CylinderGeometry(0.22, 0.22, 0.08, 14); seat.translate(0, 0.44, sz); tableG.push(seat);
      const leg = new THREE.CylinderGeometry(0.08, 0.11, 0.42, 10); leg.translate(0, 0.21, sz); tableG.push(leg);
      const sfoot = new THREE.CylinderGeometry(0.17, 0.2, 0.06, 10); sfoot.translate(0, 0.03, sz); tableG.push(sfoot);
    } }
  const boards = new THREE.PlaneGeometry(0.66, 0.66); boards.rotateX(-Math.PI / 2); boards.translate(0, 0.802, 0);
  const tables = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) tables.push({ x: CHESS.x0 + 4 + i * 5.2, z: CHESS.z0 + 5 + j * 5.5, ry: (j & 1) * Math.PI / 2 });
  instance(world, mergeGeos(tableG), concMat, tables, { surface: 'concrete', name: 'chessTables', collide: [0.45, 0.8, 1.05] });
  instance(world, boards, mat('board', { map: chessTexture(), roughness: 0.75 }), tables, { surface: 'concrete', name: 'chessBoards', shadow: false, ray: false });
  for (const t of tables) { world.cover(t.x + 1.1, t.z, 1, 0); world.cover(t.x - 1.1, t.z, -1, 0); contact.push({ x: t.x, z: t.z, s: 2.2 }); }
  // 0.5 m coursed-stone wall along the back (north) edge of the chess plaza, with a granite coping
  { const wm = mat('lowWall', { map: world.tex.granite, color: 0x9a948a, roughness: 0.85 });
    const cm = mat('wallCap', { map: world.tex.granite, color: 0xb0aaa0, roughness: 0.7 });
    const wz = CHESS.z0 + 1.2, wx0 = CHESS.x0 + 1, wx1 = CHESS.x1 - 1;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(wx1 - wx0, 0.5, 0.45), wm); wall.position.set((wx0 + wx1) / 2, 0.25, wz);
    scene.add(wall); world.solid(wall, 'concrete');
    const capW = new THREE.Mesh(new THREE.BoxGeometry(wx1 - wx0 + 0.16, 0.1, 0.6), cm); capW.position.set((wx0 + wx1) / 2, 0.55, wz); scene.add(capW); capW.castShadow = capW.receiveShadow = true; capW.userData.surface = 'concrete'; ctx.raycastTargets.push(capW);
    for (let x = wx0 + 2; x < wx1; x += 5) { world.cover(x, wz + 1.0, 0, 1); contact.push({ x, z: wz, s: 3.0 }); } }

  // ---- statues: bronze general with drawn sword (east) on a grey granite pedestal w/ inscription band + step; bronze bust (west) --
  const bronze = new THREE.MeshStandardMaterial({ map: patinaTexture(R), color: 0xe8ddc4, roughness: 0.42, metalness: 0.5, envMapIntensity: 1.5 });
  const gran = mat('graniteDark', { map: world.tex.granite, color: 0x8e8c88, roughness: 0.7 });
  const bandMat = mat('inscription', { color: 0x2a2724, roughness: 0.6, metalness: 0.2 });
  const statue = (x, z, pedH, figH, w, ry = 0, bust = false) => {
    const step = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.6, 4.2), gran); step.position.set(x, 0.3, z); scene.add(step); world.solid(step, 'concrete');
    const ped = new THREE.Mesh(new THREE.BoxGeometry(2.2, pedH, 2.2), gran); ped.position.set(x, 0.6 + pedH / 2, z); scene.add(ped); world.solid(ped, 'concrete');
    const capG = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.25, 2.6), gran); capG.position.set(x, 0.6 + pedH + 0.12, z); scene.add(capG); capG.castShadow = true;
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.3, 2.24), bandMat); band.position.set(x, 0.6 + pedH * 0.55, z); scene.add(band);   // dark inscription band (name fictional, no text)
    const g = new THREE.Group(); g.position.set(x, 0.6 + pedH + 0.25, z); g.rotation.y = ry; scene.add(g);
    const parts = [];
    if (bust) { parts.push(box(w * 1.3, figH * 0.55, w * 0.7, 0, figH * 0.27, 0), sph(w * 0.32, 0, figH * 0.75, 0), cyl(w * 0.2, w * 0.28, figH * 0.2, 0, figH * 0.5, 0)); }
    else {
      const h = figH;
      // heavier, more readable massing: boots → greatcoat → chest → shoulders → head, with a cloak that gives silhouette
      parts.push(cyl(w * 0.2, w * 0.26, h * 0.42, -w * 0.21, h * 0.21, 0.02), cyl(w * 0.2, w * 0.26, h * 0.42, w * 0.23, h * 0.21, 0.06));   // legs / boots
      parts.push(box(w * 0.34, h * 0.06, w * 0.52, -w * 0.21, h * 0.03, 0.06), box(w * 0.34, h * 0.06, w * 0.52, w * 0.23, h * 0.03, 0.1));   // boot soles
      parts.push(cyl(w * 0.62, w * 0.78, h * 0.3, 0, h * 0.5, 0.02));                                                                          // greatcoat skirt (flared)
      parts.push(box(w * 1.06, h * 0.26, w * 0.62, 0, h * 0.72, 0));                                                                           // torso
      parts.push(box(w * 0.9, h * 0.1, w * 0.66, 0, h * 0.62, 0.03));                                                                          // belted waist
      parts.push(box(w * 1.46, h * 0.09, w * 0.66, 0, h * 0.87, 0));                                                                           // shoulders / epaulettes
      parts.push(cyl(w * 0.15, w * 0.18, h * 0.07, 0, h * 0.92, 0), sph(w * 0.24, 0, h * 0.99, 0));                                            // neck, head
      parts.push(cyl(w * 0.27, w * 0.27, h * 0.045, 0, h * 1.06, 0), cyl(w * 0.2, w * 0.24, h * 0.05, 0, h * 1.09, 0));                        // brimmed cap
      parts.push(box(w * 0.26, h * 0.4, w * 0.26, w * 0.78, h * 0.78, 0.05, 1.2));                                                             // raised sword arm
      parts.push(box(0.07, h * 0.62, 0.15, w * 1.0, h * 1.26, 0.05, 0.22), box(0.3, 0.07, 0.17, w * 0.94, h * 0.98, 0.05));                    // sword blade + guard
      parts.push(box(w * 0.26, h * 0.38, w * 0.26, -w * 0.74, h * 0.66, 0.1, -0.3));                                                           // other arm (hand on hip)
      parts.push(box(w * 1.25, h * 0.78, w * 0.2, -w * 0.05, h * 0.5, -w * 0.42, 0.06));                                                        // cloak falling behind (flat panel, keeps the silhouette readable)
      parts.push(box(w * 0.7, h * 0.3, w * 0.16, w * 0.42, h * 0.3, -w * 0.4, 0.35));                                                             // cloak sweep
      parts.push(box(w * 0.5, h * 0.1, w * 0.14, -w * 0.05, h * 0.9, -w * 0.4));                                                               // cloak collar
    }
    const m = new THREE.Mesh(mergeGeos(parts), bronze); g.add(m); m.castShadow = true; m.userData.surface = 'metal'; ctx.raycastTargets.push(m);
    ctx.colliders.push(new THREE.Box3(new THREE.Vector3(x - 1.3, 0.6 + pedH, z - 1.3), new THREE.Vector3(x + 1.3, 0.6 + pedH + figH * 1.3, z + 1.3)));
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) world.cover(x + nx * 2.4, z + nz * 2.4, nx, nz);
  };
  statue(STATUE_E.x, STATUE_E.z, 2.4, 2.9, 1.0, Math.PI / 2);
  statue(STATUE_W.x, STATUE_W.z, 1.8, 1.3, 0.9, -Math.PI / 2, true);
  contact.push({ x: STATUE_E.x, z: STATUE_E.z, s: 7.0 }, { x: STATUE_W.x, z: STATUE_W.z, s: 6.4 });

  // ---- park house (comfort station): brick, hipped roof, ladder on the south side → walkable roof ------------------
  { const P = PARKHOUSE; const cx = (P.x0 + P.x1) / 2, cz = (P.z0 + P.z1) / 2, w = P.x1 - P.x0, d = P.z1 - P.z0;
    const bm = new THREE.MeshStandardMaterial({ map: T.brick, normalMap: T.brickN, roughness: 0.9, color: 0xb8a48c }); T.brick.repeat.set(1, 1);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, P.h, d), bm); body.position.set(cx, P.h / 2, cz); scene.add(body); body.castShadow = body.receiveShadow = true; body.userData.surface = 'concrete'; ctx.raycastTargets.push(body);
    world.walkable([P.x0, P.h - 0.5, P.z0], [P.x1, P.h, P.z1]);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 0.35, d + 1.2), mat('slate', { color: 0x4a4d52, roughness: 0.9 })); roof.position.set(cx, P.h + 0.12, cz); scene.add(roof); roof.castShadow = true; roof.userData.surface = 'concrete'; ctx.raycastTargets.push(roof);
    for (const [a, b] of [[[P.x0 - 0.6, P.z0 - 0.6], [P.x1 + 0.6, P.z0 - 0.3]], [[P.x0 - 0.6, P.z1 + 0.3], [P.x1 + 0.6, P.z1 + 0.6]], [[P.x0 - 0.6, P.z0], [P.x0 - 0.3, P.z1]], [[P.x1 + 0.3, P.z0], [P.x1 + 0.6, P.z1]]]) ctx.colliders.push(new THREE.Box3(new THREE.Vector3(a[0], P.h, a[1]), new THREE.Vector3(b[0], P.h + 0.7, b[1])));
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 0.5, d + 1.2), bm); parapet.position.set(cx, P.h + 0.45, cz); scene.add(parapet); parapet.castShadow = true; // (visual; the hollow is faked by the roof box below it)
    const roofTop = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.3, d - 0.2), mat('tar', { color: 0x3a3a3a, roughness: 0.95 })); roofTop.position.set(cx, P.h + 0.55, cz); scene.add(roofTop); roofTop.receiveShadow = true;
    world.walkable([P.x0, P.h + 0.2, P.z0], [P.x1, P.h + 0.7, P.z1]);
    world.ladder(cx + 6, P.z1 + 0.65, 0, P.h + 0.7, 0, 1);
    for (const dx of [-8, 0, 8]) { const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.4), mat('door', { color: 0x2a2622, roughness: 0.7 })); door.position.set(cx + dx, 1.2, P.z1 + 0.02); scene.add(door); }
    contact.push({ x: cx, z: cz, s: 1, ax: w + 3.4, az: d + 3.4 });
    world.cover(cx - 8, P.z1 + 1.2, 0, 1); world.cover(cx + 8, P.z1 + 1.2, 0, 1); world.cover(cx, P.z0 - 1.2, 0, -1); world.cover(cx - 6, cz - 2.5, 0, -1, P.h + 0.7); world.cover(cx + 6, cz + 2.5, 0, 1, P.h + 0.7);
  }

  // ---- playgrounds + dog runs: 1.3 m fences with gates, simple play structures --------------------------------------
  const tallPick = []; { const top = new THREE.BoxGeometry(2.0, 0.05, 0.05); top.translate(0, 1.28, 0); tallPick.push(top); const mid = top.clone(); mid.translate(0, -1.1, 0); tallPick.push(mid); for (let x = -0.9; x <= 0.9; x += 0.12) { const p = new THREE.BoxGeometry(0.02, 1.3, 0.02); p.translate(x, 0.65, 0); tallPick.push(p); } }
  const tp = [];
  const fenceRect = (r, gateSide) => {
    for (let x = r.x0 + 1; x < r.x1; x += 2) for (const [z, side] of [[r.z0, 'n'], [r.z1, 's']]) { if (gateSide === side && Math.abs(x - (r.x0 + r.x1) / 2) < 2) continue; tp.push({ x, z, ry: 0 }); }
    for (let z = r.z0 + 1; z < r.z1; z += 2) for (const [x, side] of [[r.x0, 'w'], [r.x1, 'e']]) { if (gateSide === side && Math.abs(z - (r.z0 + r.z1) / 2) < 2) continue; tp.push({ x, z, ry: Math.PI / 2 }); }
  };
  fenceRect(PLAY_NE, 's'); fenceRect(PLAY_NW, 's'); fenceRect(DOG_L, 'n'); fenceRect(DOG_S, 'n');
  instance(world, mergeGeos(tallPick), BLACK(), tp, { surface: 'metal', name: 'playFence', collide: [1.0, 1.3, 0.04] });
  const pmG = [], pm2G = [], blackG = [];
  const play = (r) => {
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const B3 = (x0, y0, z0, x1, y1, z1) => ctx.colliders.push(new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)));
    pmG.push(box(4, 0.2, 3, cx - 4, 1.6, cz)); world.walkable([cx - 6, 1.4, cz - 1.5], [cx - 2, 1.7, cz + 1.5]);
    for (const [dx, dz] of [[-1.9, -1.4], [1.9, -1.4], [-1.9, 1.4], [1.9, 1.4]]) { pmG.push(box(0.12, 1.6, 0.12, cx - 4 + dx, 0.8, cz + dz)); B3(cx - 4 + dx - 0.06, 0, cz + dz - 0.06, cx - 4 + dx + 0.06, 1.6, cz + dz + 0.06); }
    for (const dz of [-1.4, 1.4]) pmG.push(box(3.8, 0.06, 0.06, cx - 4, 2.5, cz + dz)); for (const dx of [-1.9, 1.9]) pmG.push(box(0.06, 0.06, 2.8, cx - 4 + dx, 2.5, cz)); // top rails
    const slide = new THREE.BoxGeometry(0.9, 0.1, 4.2); slide.rotateX(0.36); slide.translate(cx - 4, 0.9, cz + 3.5); pm2G.push(slide);
    for (let i = 0; i < 4; i++) world.walkable([cx - 4.45, 0, cz + 1.5 + i * 0.95], [cx - 3.55, 0.4 + i * 0.4, cz + 2.45 + i * 0.95]);
    pmG.push(box(4, 0.12, 0.12, cx + 5, 2.4, cz));
    for (const dx of [-1.9, 1.9]) for (const dz of [-0.8, 0.8]) { const l = new THREE.BoxGeometry(0.1, 2.5, 0.1); l.rotateX(dz > 0 ? -0.3 : 0.3); l.translate(cx + 5 + dx, 1.25, cz + dz); pmG.push(l); }
    B3(cx + 3, 0, cz - 1, cx + 3.2, 2.4, cz + 1); B3(cx + 6.8, 0, cz - 1, cx + 7, 2.4, cz + 1);
    for (const dx of [-0.9, 0.9]) { blackG.push(box(0.5, 0.06, 0.2, cx + 5 + dx, 0.5, cz)); for (const sx of [-0.2, 0.2]) blackG.push(box(0.02, 1.9, 0.02, cx + 5 + dx + sx, 1.45, cz)); }
    // spring riders + a sandbox rim
    for (const [dx, dz] of [[0, -6], [1.5, -6.5], [-1.5, -6.5]]) { pm2G.push(box(0.5, 0.3, 0.9, cx + dx, 0.6, cz + dz)); blackG.push(cyl(0.05, 0.08, 0.5, cx + dx, 0.25, cz + dz)); }
    pmG.push(box(5, 0.35, 0.3, cx + 3, 0.17, cz + 6)); pmG.push(box(5, 0.35, 0.3, cx + 3, 0.17, cz + 9)); pmG.push(box(0.3, 0.35, 3.3, cx + 0.5, 0.17, cz + 7.5)); pmG.push(box(0.3, 0.35, 3.3, cx + 5.5, 0.17, cz + 7.5));
    world.cover(cx - 4, cz - 2.2, 0, -1); world.cover(cx - 4, cz + 2.2, 0, 1); world.cover(cx + 1, cz, 1, 0); world.cover(cx + 3, cz + 5.2, 0, -1);
  };
  play(PLAY_NE); play(PLAY_NW);
  const pmM = new THREE.Mesh(mergeGeos(pmG), mat('play', { color: 0x2f6f8f, roughness: 0.6 })); pmM.castShadow = true; pmM.userData.surface = 'metal'; scene.add(pmM); ctx.raycastTargets.push(pmM);
  const pm2M = new THREE.Mesh(mergeGeos(pm2G), mat('play2', { color: 0xd9a020, roughness: 0.6 })); pm2M.castShadow = true; pm2M.userData.surface = 'metal'; scene.add(pm2M); ctx.raycastTargets.push(pm2M);
  const blM = new THREE.Mesh(mergeGeos(blackG), BLACK()); blM.castShadow = true; blM.userData.surface = 'metal'; scene.add(blM); ctx.raycastTargets.push(blM);

  // ---- park clutter: litter bins, bollards, notice boards, newspaper boxes, a kiosk, leaf litter, pigeons ----------
  buildClutter(world, T, contact);

  // ---- streets: parked cars, hydrants, one-way signs, bike racks, tree pits, road markings ------------------------------
  buildStreet(world, T);

  // contact shadows are built last, from src/world/wsp/trees.js, once the trees + hedges have added their blobs too
}

/** One merged, alpha-blended mesh of soft dark ellipses at ground level. Cheap AO that reads as grounding. */
export function buildContactShadows(world, places) {
  const { scene, R } = world; if (!places.length) return;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.5)'); gr.addColorStop(0.8, 'rgba(0,0,0,0.13)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const geos = [];
  for (const p of places) {
    const ax = (p.ax || p.s) * 0.5, az = (p.az || p.s) * 0.5;
    const q = new THREE.PlaneGeometry(ax * 2, az * 2); q.rotateX(-Math.PI / 2);
    if (p.ry) q.rotateY(p.ry);
    q.translate(p.x, (p.y || 0) + 0.02, p.z); geos.push(q);
  }
  const m = new THREE.Mesh(mergeGeos(geos), new THREE.MeshBasicMaterial({
    map: tex, color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false, fog: true,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  }));
  m.name = 'contactShadows'; m.renderOrder = 2; m.frustumCulled = false; scene.add(m);
}

/** Park clutter: wire litter bins, bollards, notice boards, newspaper boxes, two kiosks, leaf litter, pigeon silhouettes. */
function buildClutter(world, T, contact) {
  const { ctx, scene, R } = world; const V = world.maskSample;
  const paved = (x, z) => { const v = V(x, z); return v === 'hex' || v === 'side'; };

  // --- litter bins: green perforated steel drum on a ring foot, with a dark liner ---------------------------------
  const binG = [], binDark = [];
  { const drum = new THREE.CylinderGeometry(0.31, 0.27, 0.78, 14, 1, true); drum.translate(0, 0.45, 0); binG.push(drum);
    const rim = new THREE.TorusGeometry(0.315, 0.028, 5, 16); rim.rotateX(Math.PI / 2); rim.translate(0, 0.84, 0); binG.push(rim);
    const band = new THREE.TorusGeometry(0.3, 0.022, 5, 16); band.rotateX(Math.PI / 2); band.translate(0, 0.5, 0); binG.push(band);
    const foot = new THREE.CylinderGeometry(0.29, 0.29, 0.07, 14); foot.translate(0, 0.035, 0); binG.push(foot);
    const liner = new THREE.CylinderGeometry(0.27, 0.24, 0.66, 12); liner.translate(0, 0.44, 0); binDark.push(liner); }
  const bins = [];
  for (const p of PATHS.slice(0, 14)) { let k = 0; along(p.pts, 26, (x, z, ux, uz) => { k++; const sd = k & 1 ? 1 : -1; const bx = x - uz * sd * (p.w / 2 + 0.7), bz = z + ux * sd * (p.w / 2 + 0.7); if (paved(bx, bz)) bins.push({ x: bx, z: bz, ry: R() * 6.3 }); }); }
  for (let i = 0; i < 10; i++) { const a = (i + 0.4) / 10 * Math.PI * 2, r = FOUNTAIN.coping + 2.4; bins.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, ry: R() * 6.3 }); }
  for (let i = 0; i < 4; i++) bins.push({ x: CHESS.x0 + 5 + i * 7, z: CHESS.z1 - 3.5, ry: R() * 6.3 });
  instance(world, mergeGeos(binG), new THREE.MeshStandardMaterial({ color: 0x1f3a24, roughness: 0.55, metalness: 0.5, side: THREE.DoubleSide }), bins, { surface: 'metal', name: 'litterBins', collide: [0.32, 0.9, 0.32] });
  instance(world, mergeGeos(binDark), new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 }), bins, { surface: 'metal', name: 'binLiners', shadow: false, ray: false });
  for (const b of bins) { contact.push({ x: b.x, z: b.z, s: 1.2 }); if (R() < 0.4) world.cover(b.x, b.z + 0.8, 0, 1); }

  // --- bollards at every park gate / path mouth ------------------------------------------------------------------
  const bolG = mergeGeos([cyl(0.09, 0.11, 0.9, 0, 0.45, 0), sph(0.1, 0, 0.92, 0), cyl(0.15, 0.17, 0.08, 0, 0.04, 0)]);
  const bollards = [];
  for (const p of PATHS.slice(0, 20)) { const ends = [p.pts[0], p.pts[p.pts.length - 1]]; for (const e of ends) { for (const sd of [-1, 1]) { const bx = e[0] + sd * (p.w / 2 - 0.5), bz = e[1]; if (paved(bx, bz)) bollards.push({ x: bx, z: bz, ry: 0 }); } } }
  instance(world, bolG, BLACK(), bollards, { surface: 'metal', name: 'bollards', collide: [0.14, 0.95, 0.14] });
  for (const b of bollards) contact.push({ x: b.x, z: b.z, s: 0.75 });

  // --- park notice boards (blank green panels on two posts) ------------------------------------------------------
  const nbG = mergeGeos([box(0.07, 1.9, 0.07, -0.62, 0.95, 0), box(0.07, 1.9, 0.07, 0.62, 0.95, 0)]);
  const nbPanel = new THREE.BoxGeometry(1.5, 1.05, 0.07); nbPanel.translate(0, 1.5, 0);
  const boards2 = [];
  for (const [x, z, ry] of [[-13, 70, 0], [1.5, -70, Math.PI], [-130, 46, 1.2], [56, 68, 0.3], [FOUNTAIN.plaza - 2, 6, -1.4], [-24, -34, 2.6], [110, 44, 1.9]]) boards2.push({ x, z, ry });
  instance(world, nbG, BLACK(), boards2, { surface: 'metal', name: 'noticePosts', collide: [0.8, 2.0, 0.12] });
  instance(world, nbPanel, new THREE.MeshStandardMaterial({ color: 0x24402c, roughness: 0.6, metalness: 0.2 }), boards2, { surface: 'metal', name: 'noticePanels', shadow: true, ray: false });
  for (const b of boards2) { contact.push({ x: b.x, z: b.z, s: 2.0, ry: b.ry, ax: 1.9, az: 0.8 }); world.cover(b.x, b.z + 0.9, 0, 1); }

  // --- newspaper boxes in rows of 3 on the outer sidewalks -------------------------------------------------------
  const npG = mergeGeos([box(0.42, 0.75, 0.38, 0, 0.5, 0), box(0.36, 0.12, 0.34, 0, 0.93, 0), box(0.08, 0.5, 0.08, -0.14, 0.15, 0), box(0.08, 0.5, 0.08, 0.14, 0.15, 0)]);
  const npWin = new THREE.BoxGeometry(0.3, 0.3, 0.02); npWin.translate(0, 0.7, 0.2);
  const npapers = [], npCols = [0x8a2020, 0x1d3f75, 0x2c6b3a, 0x5a4a10, 0x2a2a2a].map(c2 => new THREE.Color(c2));
  for (const s of STREETS) { if (s.cobble) continue;
    for (let t = s.a0 + 24; t < s.a1 - 10; t += 62) for (const side of [0, 1]) {
      const off = side ? s.r1 + 1.5 : s.r0 - 1.5; const bx = s.axis === 'x' ? t : off, bz = s.axis === 'x' ? off : t;
      if (bx < BOUNDS.x0 + 3 || bx > BOUNDS.x1 - 3 || bz < BOUNDS.z0 + 3 || bz > BOUNDS.z1 - 3) continue;
      if (V(bx, bz) !== 'side') continue;
      const ry = s.axis === 'x' ? (side ? Math.PI : 0) : (side ? -Math.PI / 2 : Math.PI / 2);
      for (let k = 0; k < 3; k++) { const ox = s.axis === 'x' ? k * 0.5 : 0, oz = s.axis === 'x' ? 0 : k * 0.5; npapers.push({ x: bx + ox, z: bz + oz, ry }); }
    } }
  if (npapers.length) {
    instance(world, npG, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.3 }), npapers, { surface: 'metal', name: 'newsBoxes', collide: [0.24, 0.95, 0.22], colors: npCols });
    instance(world, npWin, new THREE.MeshStandardMaterial({ color: 0x1c2428, roughness: 0.12, metalness: 0.5 }), npapers, { surface: 'metal', name: 'newsWindows', shadow: false, ray: false });
    for (const n of npapers) contact.push({ x: n.x, z: n.z, s: 0.9 });
  }

  // --- two vendor kiosks on the plaza rim (steel cart + striped canopy) -------------------------------------------
  const kioskBody = [], kioskTop = [], kioskDark = [];
  { kioskBody.push(box(2.2, 1.05, 1.1, 0, 0.62, 0));
    kioskBody.push(box(2.35, 0.1, 1.25, 0, 1.19, 0));
    for (const sx of [-0.95, 0.95]) for (const sz of [-0.45, 0.45]) kioskBody.push(cyl(0.035, 0.035, 1.05, sx, 1.75, sz));
    kioskTop.push(box(2.6, 0.1, 1.5, 0, 2.3, 0));
    kioskDark.push(cyl(0.3, 0.3, 0.16, -0.55, 1.32, 0), cyl(0.3, 0.3, 0.16, 0.2, 1.32, 0));
    for (const sx of [-1.02, 1.02]) kioskDark.push(cyl(0.16, 0.16, 0.1, sx, 0.05, 0)); }
  const kiosks = [{ x: -22, z: 4, ry: 1.4 }, { x: 26, z: 24, ry: -1.9 }, { x: -132, z: 52, ry: 0.4 }];
  instance(world, mergeGeos(kioskBody), new THREE.MeshStandardMaterial({ color: 0x8d949a, roughness: 0.42, metalness: 0.75 }), kiosks, { surface: 'metal', name: 'kiosks', collide: [1.25, 1.3, 0.75] });
  instance(world, mergeGeos(kioskTop), new THREE.MeshStandardMaterial({ color: 0xc23a2c, roughness: 0.85, side: THREE.DoubleSide }), kiosks, { surface: 'wood', name: 'kioskCanopies', ray: false });
  instance(world, mergeGeos(kioskDark), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.5 }), kiosks, { surface: 'metal', name: 'kioskFittings', shadow: false, ray: false });
  for (const k of kiosks) { contact.push({ x: k.x, z: k.z, s: 3.4, ry: k.ry, ax: 3.2, az: 2.0 }); world.cover(k.x, k.z + 1.6, 0, 1); world.cover(k.x, k.z - 1.6, 0, -1); }

  // --- leaf litter: small alpha cards lying on the paving, swept into drifts along kerbs and step lines ------------
  { const S2 = 64, c2 = document.createElement('canvas'); c2.width = c2.height = S2; const g2 = c2.getContext('2d'); g2.clearRect(0, 0, S2, S2);
    for (let i = 0; i < 11; i++) { g2.fillStyle = `hsl(${26 + R() * 28},${16 + R() * 22}%,${22 + R() * 16}%)`; g2.beginPath(); g2.ellipse(8 + R() * 48, 8 + R() * 48, 3 + R() * 7, 2 + R() * 4, R() * 3, 0, 7); g2.fill(); }
    const lt = new THREE.CanvasTexture(c2); lt.colorSpace = THREE.SRGBColorSpace;
    const q = new THREE.PlaneGeometry(0.55, 0.55); q.rotateX(-Math.PI / 2); q.translate(0, 0.018, 0);
    const litter = [];
    for (let i = 0; i < 520; i++) {
      const x = PARK.x0 + R() * (PARK.x1 - PARK.x0), z = PARK.z0 + R() * (PARK.z1 - PARK.z0);
      if (!paved(x, z)) continue; litter.push({ x, z, ry: R() * 6.3, s: 0.5 + R() * 0.8 });
    }
    instance(world, q, new THREE.MeshStandardMaterial({ map: lt, alphaTest: 0.4, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), litter, { surface: 'ground', name: 'leafLitter', shadow: false, ray: false });
  }

  // --- pigeons: tiny grey bodies pecking around the fountain and the chess plaza ---------------------------------
  { const pg = mergeGeos([sph(0.075, 0, 0.095, 0), box(0.06, 0.05, 0.11, 0, 0.11, -0.09), sph(0.042, 0, 0.165, -0.085), cyl(0.012, 0.012, 0.08, 0, 0.04, 0.02)]);
    const birds = [];
    for (let i = 0; i < 46; i++) { const a = R() * 6.3, r = 17 + R() * 13; const x = Math.cos(a) * r, z = Math.sin(a) * r; if (paved(x, z)) birds.push({ x, z, ry: R() * 6.3, s: 0.85 + R() * 0.35 }); }
    for (let i = 0; i < 18; i++) { const x = CHESS.x0 + 2 + R() * (CHESS.x1 - CHESS.x0 - 4), z = CHESS.z0 + 2 + R() * (CHESS.z1 - CHESS.z0 - 4); if (paved(x, z)) birds.push({ x, z, ry: R() * 6.3, s: 0.85 + R() * 0.3 }); }
    const pigeonCols = [0x6e737a, 0x8a8f96, 0x4e535a, 0x9aa0a6].map(c3 => new THREE.Color(c3));
    if (birds.length) { instance(world, pg, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), birds, { surface: 'flesh', name: 'pigeons', shadow: true, ray: false, colors: pigeonCols });
      for (const b of birds) contact.push({ x: b.x, z: b.z, s: 0.34 }); }
  }
}

/** Bronze with green verdigris streaks (canvas). */
function patinaTexture(R) {
  const S = 256; const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#4b3f2a'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1200; i++) { g.fillStyle = `rgba(${60 + R() * 40 | 0},${50 + R() * 30 | 0},${25 + R() * 20 | 0},${R() * 0.5})`; g.fillRect(R() * S, R() * S, 2 + R() * 4, 2 + R() * 4); }
  for (let i = 0; i < 70; i++) { const x = R() * S, y0 = R() * S * 0.6, h = 30 + R() * 120; const gr = g.createLinearGradient(0, y0, 0, y0 + h); gr.addColorStop(0, `rgba(80,140,110,${0.25 + R() * 0.45})`); gr.addColorStop(1, 'rgba(80,140,110,0)'); g.fillStyle = gr; g.fillRect(x, y0, 2 + R() * 6, h); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(95,160,125,${0.15 + R() * 0.3})`; g.beginPath(); g.ellipse(R() * S, R() * S, 4 + R() * 14, 3 + R() * 8, R() * 3, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function box(w, h, d, x = 0, y = 0, z = 0, rz = 0) { const g = new THREE.BoxGeometry(w, h, d); if (rz) g.rotateZ(rz); g.translate(x, y, z); return g; }
function cyl(r0, r1, h, x, y, z) { const g = new THREE.CylinderGeometry(r0, r1, h, 10); g.translate(x, y, z); return g; }
function sph(r, x, y, z) { const g = new THREE.SphereGeometry(r, 10, 8); g.translate(x, y, z); return g; }

function buildStreet(world, T) {
  const { ctx, scene, R } = world; const V = world.maskSample;
  // ---- vehicles: sedan / cab / van — extruded side profiles, tinted glass band, 0.33 m rubber wheels + hubcaps, lights, plates; clearcoat paint ----
  const CM = carMaterials();
  const placements = {}; for (const k of CAR_KINDS) placements[k] = [];
  for (const s of STREETS) {
    if (s.cobble) continue;
    const n = Math.floor((s.a1 - s.a0) / 7.4);
    for (let i = 0; i < n; i++) {
      const t = s.a0 + 3.7 + i * 7.4 + (R() - 0.5) * 1.2; if (R() < 0.3) continue;
      for (const side of [0, 1]) {
        if (s.id === 'college' && side === 1) continue;
        const lane = side ? s.r1 - 1.15 : s.r0 + 1.15;
        const x = s.axis === 'x' ? t : lane, z = s.axis === 'x' ? lane : t;
        if (x < BOUNDS.x0 + 4 || x > BOUNDS.x1 - 4 || z < BOUNDS.z0 + 4 || z > BOUNDS.z1 - 4) continue;
        if (Math.abs(x - ARCH.cx) < 22 && z < -70 && z > -100) continue;   // keep the arch axis view clear
        const ry = s.axis === 'x' ? (side ? Math.PI : 0) : (side ? -Math.PI / 2 : Math.PI / 2);
        const r = R(); const kind = r < 0.16 ? 'cab' : r < 0.26 ? 'van' : r < 0.44 ? 'suv' : r < 0.6 ? 'hatch' : 'sedan';
        placements[kind].push({ x, z, ry: ry + (R() - 0.5) * 0.04, kind });
      }
    }
  }
  for (const kind of CAR_KINDS) {
    const P = placements[kind]; if (!P.length) continue;
    const kit = carGeometries(kind), G = kit.geos;
    const cols = kind === 'cab' ? [new THREE.Color(0xf2b820)] : P.map(() => CAR_COLORS[(R() * CAR_COLORS.length) | 0]);
    instance(world, G.paint, CM.paint, P, { surface: 'metal', name: 'cars_' + kind, colors: cols, collide: null });
    P.forEach((c) => { const ax = Math.abs(Math.cos(c.ry)) > 0.5; const hx = kit.len / 2, hz = kit.w / 2; const ex = ax ? hx : hz, ez = ax ? hz : hx; ctx.colliders.push(new THREE.Box3(new THREE.Vector3(c.x - ex, 0, c.z - ez), new THREE.Vector3(c.x + ex, Math.min(kit.h, 1.6), c.z + ez))); const nx = ax ? 0 : 1, nz = ax ? 1 : 0; world.cover(c.x + nx * (hz + 0.6), c.z + nz * (hz + 0.6), nx, nz); world.cover(c.x - nx * (hz + 0.6), c.z - nz * (hz + 0.6), -nx, -nz); });
    for (const c of P) world.contactBlobs.push({ x: c.x, z: c.z, ry: c.ry, ax: kit.len + 0.8, az: kit.w + 0.9 });
    for (const slot of ['glass', 'rubber', 'rim', 'trim', 'lampW', 'lampR', 'plate']) if (G[slot]) instance(world, G[slot], CM[slot], P, { surface: 'metal', name: slot + '_' + kind, shadow: slot === 'rubber', ray: slot === 'glass' });
  }

  // ---- hydrants (red), one-way signs, bike racks, tree pits, street trees positions ----------------------------------
  // NYC-style hydrant: flanged foot, barrel, collar, domed bonnet with operating nut, two side outlets with caps + chains' lugs
  const hydLathe = new THREE.LatheGeometry([[0, 0], [0.19, 0], [0.19, 0.05], [0.15, 0.07], [0.13, 0.1], [0.13, 0.52], [0.16, 0.55], [0.16, 0.6], [0.14, 0.62], [0.135, 0.66], [0.11, 0.74], [0.06, 0.78], [0.035, 0.8], [0.035, 0.86], [0, 0.87]].map(([r, y]) => new THREE.Vector2(r, y)), 14);
  const hyd = mergeGeos([hydLathe.toNonIndexed(), new THREE.CylinderGeometry(0.055, 0.06, 0.36, 10).rotateZ(Math.PI / 2).translate(0, 0.44, 0), new THREE.CylinderGeometry(0.075, 0.075, 0.04, 10).rotateZ(Math.PI / 2).translate(0.19, 0.44, 0), new THREE.CylinderGeometry(0.075, 0.075, 0.04, 10).rotateZ(Math.PI / 2).translate(-0.19, 0.44, 0), new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10).rotateX(Math.PI / 2).translate(0, 0.42, 0.15)].map(g => g.index ? g.toNonIndexed() : g));
  const signPost = mergeGeos([cyl(0.03, 0.03, 3.0, 0, 1.5, 0), box(0.9, 0.3, 0.03, 0, 2.6, 0)]);
  const rack = mergeGeos([new THREE.TorusGeometry(0.4, 0.03, 6, 12, Math.PI).translate(0, 0.5, 0), box(0.06, 0.5, 0.06, -0.4, 0.25, 0), box(0.06, 0.5, 0.06, 0.4, 0.25, 0)]);
  const hydrants = [], signs = [], racks = [], pits = [];
  world.streetTrees = [];
  for (const s of STREETS) {
    if (s.cobble) continue;
    const L = s.a1 - s.a0;
    for (let t = s.a0 + 6; t < s.a1 - 4; t += 9) {
      for (const side of [0, 1]) {
        const off = side ? s.r1 + 1.0 : s.r0 - 1.0; const x = s.axis === 'x' ? t : off, z = s.axis === 'x' ? off : t;
        if (x < BOUNDS.x0 + 2 || x > BOUNDS.x1 - 2 || z < BOUNDS.z0 + 2 || z > BOUNDS.z1 - 2) continue;
        if (V(x, z) !== 'side') continue;
        if (Math.abs(x - ARCH.cx) < 13 && z < -70) continue;   // arch avenue axis view stays clear
        // alternate hydrant / tree pit / rack / sign along the kerb
        const k = Math.floor((t - s.a0) / 9 + side * 2) % 4;
        const ry = s.axis === 'x' ? 0 : Math.PI / 2;
        if (k === 0) hydrants.push({ x, z, ry });
        else if (k === 1 || k === 3) { const px = x + (s.axis === 'x' ? 0 : (side ? 0.6 : -0.6)), pz = z + (s.axis === 'x' ? (side ? 0.6 : -0.6) : 0); pits.push({ x: px, z: pz, ry }); world.streetTrees.push({ x: px, z: pz, s: 0.62 + R() * 0.2 }); }
        else if (k === 2 && R() < 0.5) racks.push({ x, z, ry: ry + Math.PI / 2 }); else signs.push({ x, z, ry: ry + (s.oneway < 0 ? Math.PI : 0) });
      }
    }
  }
  instance(world, hyd, mat('hydrant', { color: 0x8e2a1e, roughness: 0.62, metalness: 0.35 }), hydrants, { surface: 'metal', name: 'hydrants', collide: [0.2, 1.0, 0.2] });
  for (const a of hydrants) world.contactBlobs.push({ x: a.x, z: a.z, s: 0.8 });
  for (const a of signs) world.contactBlobs.push({ x: a.x, z: a.z, s: 0.5 });
  for (const a of racks) world.contactBlobs.push({ x: a.x, z: a.z, s: 1.4 });
  instance(world, signPost, mat('signpost', { color: 0x6a6f74, roughness: 0.5, metalness: 0.6 }), signs, { surface: 'metal', name: 'signs', collide: [0.06, 3.0, 0.06] });
  instance(world, rack, BLACK(), racks, { surface: 'metal', name: 'bikeRacks', collide: [0.45, 0.6, 0.08] });
  const pitG = new THREE.BoxGeometry(1.5, 0.05, 1.5); pitG.translate(0, 0.025, 0);
  instance(world, pitG, mat('soil', { color: 0x584635, roughness: 1 }), pits, { surface: 'ground', name: 'treePits', shadow: false, ray: false });
  // granite kerb around each pit + a couple of weed tufts, so it reads as a street tree pit not a collider plate
  { const kerb = [];
    for (const [kx, kz, kw, kd] of [[0, -0.8, 1.76, 0.16], [0, 0.8, 1.76, 0.16], [-0.8, 0, 0.16, 1.44], [0.8, 0, 0.16, 1.44]]) { const k = new THREE.BoxGeometry(kw, 0.13, kd); k.translate(kx, 0.065, kz); kerb.push(k); }
    instance(world, mergeGeos(kerb), mat('pitKerb', { map: world.tex.granite, color: 0xa7a299, roughness: 0.8 }), pits, { surface: 'concrete', name: 'treePitKerbs', shadow: false, ray: false });
    for (const a of pits) world.contactBlobs.push({ x: a.x, z: a.z, s: 2.1 }); }
  // one-way arrow plates: white plane with a black arrow (canvas)
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 96); g.fillStyle = '#111'; g.fillRect(40, 40, 140, 16); g.beginPath(); g.moveTo(170, 20); g.lineTo(230, 48); g.lineTo(170, 76); g.fill(); g.font = 'bold 22px Arial'; g.fillText('ONE WAY', 44, 30);
  const arrowTex = new THREE.CanvasTexture(c); arrowTex.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.PlaneGeometry(0.9, 0.3); plate.translate(0, 2.6, 0.02);
  instance(world, plate, new THREE.MeshStandardMaterial({ map: arrowTex, roughness: 0.5, side: THREE.DoubleSide }), signs, { surface: 'metal', name: 'signPlates', shadow: false, ray: false });

  // ---- road markings: lane edge lines + zebra crosswalks at the park corners / the avenue (merged, y 0.012) ----------
  const marks = [];
  const line = (x0, z0, x1, z1, w) => { const L = Math.hypot(x1 - x0, z1 - z0); const g = new THREE.PlaneGeometry(L, w); g.rotateX(-Math.PI / 2); g.rotateY(-Math.atan2(z1 - z0, x1 - x0)); g.translate((x0 + x1) / 2, 0.012, (z0 + z1) / 2); marks.push(g); };
  for (const s of STREETS) {
    if (s.cobble) continue;
    if (s.axis === 'x') { for (let x = s.a0; x < s.a1; x += 8) line(x, (s.r0 + s.r1) / 2, x + 3, (s.r0 + s.r1) / 2, 0.15); }
    else { for (let z = s.a0; z < s.a1; z += 8) line((s.r0 + s.r1) / 2, z, (s.r0 + s.r1) / 2, z + 3, 0.15); }
  }
  const zebra = (x, z, axis, len, wide) => { for (let i = -wide / 2; i < wide / 2; i += 1.2) { if (axis === 'x') line(x - len / 2, z + i, x + len / 2, z + i, 0.6); else line(x + i, z - len / 2, x + i, z + len / 2, 0.6); } };
  zebra(1.5, -79.5, 'z', 7, 8); zebra(-13, 80, 'z', 6, 6); zebra(57, 80, 'z', 6, 8); zebra(-165, -77, 'x', 8, 6); zebra(140, 2, 'z', 8, 6); zebra(-168, 76, 'x', 5, 6); zebra(-168, 1, 'x', 5, 6);
  const mm = new THREE.Mesh(mergeGeos(marks), new THREE.MeshStandardMaterial({ color: 0xe9e6dc, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); mm.name = 'roadMarks'; mm.receiveShadow = true; scene.add(mm);
}
