// WSP furniture: benches, twin-globe lampposts, lawn + perimeter fences, chess tables, Garibaldi + Holley, park house (ladder → roof),
// playgrounds, dog runs, and the street: parked cars, hydrants, one-way signs, bike racks, tree pits, road markings. All instanced/merged. WSP agent.
import * as THREE from 'three';
import { PARK, PATHS, FOUNTAIN, CHESS, GARIBALDI, HOLLEY, PLAY_NE, PLAY_NW, DOG_L, DOG_S, PARKHOUSE, STREETS, BOUNDS, ARCH, CIRCLES, BUILDINGS } from './layout.js';
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

  // ---- benches (World's Fair style): steel frame + 4 slats, 1.85 m ------------------------------------------------
  const frame = [], slats = [];
  for (const sx of [-0.85, 0.85]) { const leg = new THREE.BoxGeometry(0.06, 0.45, 0.55); leg.translate(sx, 0.225, 0); frame.push(leg); const back = new THREE.BoxGeometry(0.06, 0.55, 0.08); back.rotateX(-0.25); back.translate(sx, 0.7, -0.24); frame.push(back); const arm = new THREE.BoxGeometry(0.06, 0.05, 0.55); arm.translate(sx, 0.66, 0); frame.push(arm); }
  for (let i = 0; i < 3; i++) { const s = new THREE.BoxGeometry(1.85, 0.04, 0.13); s.translate(0, 0.46, -0.2 + i * 0.16); slats.push(s); }
  for (let i = 0; i < 3; i++) { const s = new THREE.BoxGeometry(1.85, 0.12, 0.04); s.rotateX(-0.25); s.translate(0, 0.62 + i * 0.15, -0.26 - i * 0.04); slats.push(s); }
  const benches = [];
  const bench = (x, z, ry) => benches.push({ x, z, ry });
  // ring of benches around the fountain plaza, facing the centre, on the coping band and at r 20 / 27
  for (const [r, n] of [[FOUNTAIN.coping + 1.3, 26], [24, 22], [29.5, 18]]) for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + (r > 20 ? 0.08 : 0); if (Math.abs(Math.sin(a)) < 0.12 || Math.abs(Math.cos(a)) < 0.12) continue; bench(Math.cos(a) * r, Math.sin(a) * r, Math.atan2(-Math.cos(a), -Math.sin(a))); }
  // along the main paths: both sides every 4.2 m in runs, facing the path
  for (const p of PATHS.slice(0, 12)) { let k = 0; along(p.pts, 4.2, (x, z, ux, uz) => { k++; if (k % 7 < 2) return; for (const sd of [-1, 1]) { const nx = -uz * sd, nz = ux * sd; const off = p.w / 2 + 0.6; const bx = x + nx * off, bz = z + nz * off; if (V(bx, bz) === 'asphalt') continue; bench(bx, bz, Math.atan2(-nx, -nz)); } }); }
  // chess plaza rows + Garibaldi plaza
  for (let i = 0; i < 6; i++) bench(CHESS.x0 + 4 + i * 4.5, CHESS.z1 - 2.5, Math.PI);
  const benchFrame = instance(world, mergeGeos(frame), BLACK(), benches, { surface: 'metal', name: 'benchFrames', collide: [0.95, 0.9, 0.35] });
  instance(world, mergeGeos(slats), WOOD(), benches, { surface: 'wood', name: 'benchSlats', collide: null });
  for (const b of benches) if (R() < 0.35) { const nx = Math.sin(b.ry), nz = Math.cos(b.ry); world.cover(b.x + nx * 0.9, b.z + nz * 0.9, nx, nz); }

  // ---- lampposts: black cast-iron post 4.4 m, single acorn globe (WSP "Type B" style), off by day ---------------------
  const post = [new THREE.CylinderGeometry(0.07, 0.11, 4.4, 10)]; post[0].translate(0, 2.2, 0);
  const base = new THREE.CylinderGeometry(0.2, 0.26, 0.5, 10); base.translate(0, 0.25, 0); post.push(base);
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
  instance(world, mergeGeos(post), BLACK(), lamps, { surface: 'metal', name: 'lampPosts', collide: [0.15, 4.4, 0.15] });
  instance(world, globe, mat('globe', { color: 0xf3f3ee, roughness: 0.35, emissive: 0x111111 }), lamps, { surface: 'metal', name: 'lampGlobes', shadow: false });
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

  // ---- chess plaza: concrete tables with inlaid boards + 2 stools each (5 × 4 grid) --------------------------------
  const tableG = []; { const top = new THREE.BoxGeometry(0.9, 0.08, 0.9); top.translate(0, 0.74, 0); tableG.push(top); const ped = new THREE.CylinderGeometry(0.16, 0.2, 0.7, 10); ped.translate(0, 0.35, 0); tableG.push(ped); for (const sz of [-0.85, 0.85]) { const seat = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10); seat.translate(0, 0.45, sz); tableG.push(seat); const leg = new THREE.CylinderGeometry(0.06, 0.08, 0.45, 8); leg.translate(0, 0.22, sz); tableG.push(leg); } }
  const boards = new THREE.PlaneGeometry(0.64, 0.64); boards.rotateX(-Math.PI / 2); boards.translate(0, 0.785, 0);
  const tables = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) tables.push({ x: CHESS.x0 + 4 + i * 5.2, z: CHESS.z0 + 5 + j * 5.5, ry: (j & 1) * Math.PI / 2 });
  instance(world, mergeGeos(tableG), CONC(), tables, { surface: 'concrete', name: 'chessTables', collide: [0.45, 0.8, 1.05] });
  instance(world, boards, mat('board', { map: chessTexture(), roughness: 0.6 }), tables, { surface: 'concrete', name: 'chessBoards', shadow: false, ray: false });
  for (const t of tables) { world.cover(t.x + 1.1, t.z, 1, 0); world.cover(t.x - 1.1, t.z, -1, 0); }

  // ---- statues: Garibaldi (bronze on a 2.6 m granite pedestal, sword-drawing pose) and the Holley bust (west) --------
  const bronze = mat('bronze', { color: 0x3f4a3c, roughness: 0.45, metalness: 0.7 });
  const gran = mat('graniteDark', { color: 0x7a7570, roughness: 0.65 });
  const statue = (x, z, pedH, figH, w, ry = 0, bust = false) => {
    const ped = new THREE.Mesh(new THREE.BoxGeometry(2.4, pedH, 2.4), gran); ped.position.set(x, pedH / 2, z); scene.add(ped); world.solid(ped, 'concrete');
    const step = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.35, 3.6), gran); step.position.set(x, 0.175, z); scene.add(step); world.solid(step, 'concrete');
    const g = new THREE.Group(); g.position.set(x, pedH, z); g.rotation.y = ry; scene.add(g);
    const parts = [];
    if (bust) { parts.push(box(w * 1.3, figH * 0.55, w * 0.7, 0, figH * 0.27, 0), sph(w * 0.32, 0, figH * 0.75, 0)); }
    else { parts.push(cyl(w * 0.5, w * 0.6, figH * 0.5, 0, figH * 0.25, 0), box(w * 1.1, figH * 0.32, w * 0.6, 0, figH * 0.66, 0), sph(w * 0.24, 0, figH * 0.92, 0), box(w * 0.2, figH * 0.4, w * 0.2, w * 0.7, figH * 0.72, 0, 0.9), box(w * 0.2, figH * 0.36, w * 0.2, -w * 0.62, figH * 0.6, 0, -0.3), box(0.06, figH * 0.45, 0.06, w * 0.95, figH * 0.55, 0.3, 0.9)); }
    const m = new THREE.Mesh(mergeGeos(parts), bronze); g.add(m); m.castShadow = true; m.userData.surface = 'metal'; ctx.raycastTargets.push(m);
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) world.cover(x + nx * 2.3, z + nz * 2.3, nx, nz);
  };
  statue(GARIBALDI.x, GARIBALDI.z, 2.6, 3.0, 1.0, Math.PI / 2);
  statue(HOLLEY.x, HOLLEY.z, 2.0, 1.4, 0.9, -Math.PI / 2, true);

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

  // ---- streets: parked cars, hydrants, one-way signs, bike racks, tree pits, road markings ------------------------------
  buildStreet(world, T);
}

function box(w, h, d, x = 0, y = 0, z = 0, rz = 0) { const g = new THREE.BoxGeometry(w, h, d); if (rz) g.rotateZ(rz); g.translate(x, y, z); return g; }
function cyl(r0, r1, h, x, y, z) { const g = new THREE.CylinderGeometry(r0, r1, h, 10); g.translate(x, y, z); return g; }
function sph(r, x, y, z) { const g = new THREE.SphereGeometry(r, 10, 8); g.translate(x, y, z); return g; }

function buildStreet(world, T) {
  const { ctx, scene, R } = world; const V = world.maskSample;
  // ---- car: body + cabin + wheels (one InstancedMesh with per-instance colour) --------------------------------------
  // sedan side profile extruded across the width; cabin glass as a second, slightly wider extrusion band
  const prof = new THREE.Shape(); [[-2.25, 0.32], [2.25, 0.32], [2.3, 0.72], [1.75, 0.82], [0.95, 1.32], [-0.75, 1.38], [-1.85, 0.92], [-2.3, 0.85]].forEach(([x, y], i) => i ? prof.lineTo(x, y) : prof.moveTo(x, y)); prof.closePath();
  const carGeo = new THREE.ExtrudeGeometry(prof, { depth: 1.76, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1 }); carGeo.translate(0, 0, -0.88);
  const gl = new THREE.Shape(); [[0.9, 0.86], [1.55, 0.84], [0.85, 1.28], [-0.7, 1.33], [-1.7, 0.92], [-1.0, 0.86]].forEach(([x, y], i) => i ? gl.lineTo(x, y) : gl.moveTo(x, y)); gl.closePath();
  const glassG = new THREE.ExtrudeGeometry(gl, { depth: 1.8, bevelEnabled: false }); glassG.translate(0, 0.02, -0.9);
  const wheelG = []; for (const [x, z] of [[1.45, 0.85], [1.45, -0.85], [-1.45, 0.85], [-1.45, -0.85]]) { const w = new THREE.CylinderGeometry(0.33, 0.33, 0.22, 12); w.rotateX(Math.PI / 2); w.translate(x, 0.33, z); wheelG.push(w); }
  const wheels = mergeGeos(wheelG);
  const cars = []; const carCols = [0x1a1a1c, 0xd8d8d8, 0x8a8f96, 0x2b3a6b, 0x6b1f1f, 0xe8e6e0, 0x3a3a3a, 0xf1c232, 0x232323, 0xb5b8bd].map(c => new THREE.Color(c));
  for (const s of STREETS) {
    if (s.cobble) continue;
    const L = s.a1 - s.a0; const n = Math.floor(L / 7.2);
    for (let i = 0; i < n; i++) {
      const t = s.a0 + 3.5 + i * 7.2 + (R() - 0.5) * 1.5; if (R() < 0.3) continue;
      for (const side of [0, 1]) {
        if (s.name.startsWith('LaGuardia') && side === 1) continue;
        const lane = side ? s.r1 - 1.1 : s.r0 + 1.1;
        const x = s.axis === 'x' ? t : lane, z = s.axis === 'x' ? lane : t;
        if (x < BOUNDS.x0 + 4 || x > BOUNDS.x1 - 4 || z < BOUNDS.z0 + 4 || z > BOUNDS.z1 - 4) continue;
        if (Math.abs(x - ARCH.cx) < 22 && z < -70 && z > -100) continue;   // keep the Fifth Ave axis view clear
        const ry = s.axis === 'x' ? (side ? Math.PI : 0) : (side ? -Math.PI / 2 : Math.PI / 2);
        cars.push({ x, z, ry });
      }
    }
  }
  const im = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.5, envMapIntensity: 1.0 }), cars.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), e = new THREE.Euler();
  cars.forEach((c, i) => { e.set(0, c.ry, 0); q.setFromEuler(e); p.set(c.x, 0, c.z); im.setMatrixAt(i, m.compose(p, q, sc)); im.setColorAt(i, carCols[(R() * carCols.length) | 0]); const ax = Math.abs(Math.cos(c.ry)) > 0.5; const ex = ax ? 2.3 : 0.95, ez = ax ? 0.95 : 2.3; ctx.colliders.push(new THREE.Box3(new THREE.Vector3(c.x - ex, 0, c.z - ez), new THREE.Vector3(c.x + ex, 1.4, c.z + ez))); const nx = ax ? 0 : 1, nz = ax ? 1 : 0; world.cover(c.x + nx * 1.8, c.z + nz * 1.8, nx, nz); world.cover(c.x - nx * 1.8, c.z - nz * 1.8, -nx, -nz); });
  im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.castShadow = im.receiveShadow = true; im.userData.surface = 'metal'; im.name = 'cars'; im.frustumCulled = false; scene.add(im); ctx.raycastTargets.push(im);
  instance(world, wheels, mat('tyre', { color: 0x1a1a1a, roughness: 0.9 }), cars, { surface: 'metal', name: 'wheels', shadow: false });
  instance(world, glassG, mat('carglass', { color: 0x1c2630, roughness: 0.1, metalness: 0.6 }), cars, { surface: 'metal', name: 'carGlass', shadow: false });

  // ---- hydrants (red), one-way signs, bike racks, tree pits, street trees positions ----------------------------------
  const hyd = mergeGeos([cyl(0.14, 0.16, 0.7, 0, 0.35, 0), cyl(0.09, 0.09, 0.18, 0, 0.78, 0), sph(0.12, 0, 0.9, 0), box(0.5, 0.1, 0.1, 0, 0.55, 0)]);
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
        if (Math.abs(x - ARCH.cx) < 13 && z < -70) continue;   // Fifth Ave axis view stays clear
        // alternate hydrant / tree pit / rack / sign along the kerb
        const k = Math.floor((t - s.a0) / 9 + side * 2) % 4;
        const ry = s.axis === 'x' ? 0 : Math.PI / 2;
        if (k === 0) hydrants.push({ x, z, ry });
        else if (k === 1 || k === 3) { const px = x + (s.axis === 'x' ? 0 : (side ? 0.6 : -0.6)), pz = z + (s.axis === 'x' ? (side ? 0.6 : -0.6) : 0); pits.push({ x: px, z: pz, ry }); world.streetTrees.push({ x: px, z: pz, s: 0.62 + R() * 0.2 }); }
        else if (k === 2 && R() < 0.5) racks.push({ x, z, ry: ry + Math.PI / 2 }); else signs.push({ x, z, ry: ry + (s.oneway < 0 ? Math.PI : 0) });
      }
    }
  }
  instance(world, hyd, mat('hydrant', { color: 0xc8261a, roughness: 0.5, metalness: 0.2 }), hydrants, { surface: 'metal', name: 'hydrants', collide: [0.2, 1.0, 0.2] });
  instance(world, signPost, mat('signpost', { color: 0x6a6f74, roughness: 0.5, metalness: 0.6 }), signs, { surface: 'metal', name: 'signs', collide: [0.06, 3.0, 0.06] });
  instance(world, rack, BLACK(), racks, { surface: 'metal', name: 'bikeRacks', collide: [0.45, 0.6, 0.08] });
  const pitG = new THREE.BoxGeometry(1.6, 0.04, 1.6); pitG.translate(0, 0.02, 0);
  instance(world, pitG, mat('soil', { color: 0x3b2f24, roughness: 1 }), pits, { surface: 'ground', name: 'treePits', shadow: false, ray: false });
  // one-way arrow plates: white plane with a black arrow (canvas)
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 96); g.fillStyle = '#111'; g.fillRect(40, 40, 140, 16); g.beginPath(); g.moveTo(170, 20); g.lineTo(230, 48); g.lineTo(170, 76); g.fill(); g.font = 'bold 22px Arial'; g.fillText('ONE WAY', 44, 30);
  const arrowTex = new THREE.CanvasTexture(c); arrowTex.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.PlaneGeometry(0.9, 0.3); plate.translate(0, 2.6, 0.02);
  instance(world, plate, new THREE.MeshStandardMaterial({ map: arrowTex, roughness: 0.5, side: THREE.DoubleSide }), signs, { surface: 'metal', name: 'signPlates', shadow: false, ray: false });

  // ---- road markings: lane edge lines + zebra crosswalks at the park corners / Fifth Ave (merged, y 0.012) ----------
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
