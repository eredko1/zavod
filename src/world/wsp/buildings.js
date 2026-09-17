// WSP surrounding blocks: OSM building footprints as textured boxes merged per style, ground-floor storefronts/doors/awnings,
// The Row's Greek-Revival stoops, Judson campanile, One Fifth Avenue setbacks, Bobst raised plaza, fire-escape ladders to two roofs. WSP agent.
import * as THREE from 'three';
import { BUILDINGS, BOUNDS, STREETS } from './layout.js';
import { facadeTexture, storefrontTexture } from './textures.js';
import { mergeGeos } from './ground.js';

const FLOOR_H = 3.3, BAY_W = 3.6;

/** BoxGeometry with per-face UVs scaled in metres (tile = 4 bays × 4 floors), top/bottom collapsed to a plain wall texel. */
function facadeBox(x0, x1, z0, z1, y0, y1, tileW = 4 * BAY_W, tileH = 4 * FLOOR_H) {
  const w = x1 - x0, h = y1 - y0, d = z1 - z0;
  const g = new THREE.BoxGeometry(w, h, d); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const uv = g.attributes.uv;
  const faceScale = [[d / tileW, h / tileH], [d / tileW, h / tileH], [0, 0], [0, 0], [w / tileW, h / tileH], [w / tileW, h / tileH]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; const [sx, sy] = faceScale[f]; uv.setXY(k, uv.getX(k) * sx + 0.01, uv.getY(k) * sy + 0.01); }
  return g;
}

export function buildBuildings(world, T) {
  const { ctx, scene, R } = world;
  const styles = {};
  const styleTex = (st) => styles[st] || (styles[st] = facadeTexture(R, st));
  const groups = {};      // style → geometries
  const roofs = [], doors = [], awnA = [], awnB = [], stoopStone = [], iron = [], glassG = [];
  const push = (st, geo) => (groups[st] || (groups[st] = [])).push(geo);
  const box3 = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));

  for (const B of BUILDINGS) {
    const { x0, x1, z0, z1, h, style } = B;
    if (B.setbacks) {
      // One Fifth Avenue: 3 setbacks + crown (Art Deco)
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
      const tiers = [[w, d, 0, 30], [w * 0.78, d * 0.8, 30, 58], [w * 0.5, d * 0.55, 58, 85], [w * 0.22, d * 0.25, 85, 92]];
      for (const [tw, td, ya, yb] of tiers) { push(style, facadeBox(cx - tw / 2, cx + tw / 2, cz - td / 2, cz + td / 2, ya, yb)); roofs.push(roofGeo(cx - tw / 2, cx + tw / 2, cz - td / 2, cz + td / 2, yb)); }
      ctx.colliders.push(box3(x0, 0, z0, x1, 92, z1));
      continue;
    }
    push(style, facadeBox(x0, x1, z0, z1, 0, h, 4 * BAY_W, style === 'row' ? 17.2 : style === 'sandstone' ? 4 * 3.6 : 4 * FLOOR_H));
    roofs.push(roofGeo(x0, x1, z0, z1, h));
    // parapet / cornice ledge
    push(style, cornice(x0, x1, z0, z1, h));
    ctx.colliders.push(box3(x0, 0, z0, x1, h, z1));
    // ground floor: storefront strip on the street face, doors elsewhere
    const faces = [];
    if (B.shops) faces.push(B.shops);
    for (const f of faces) {
      const len = f === 'n' || f === 's' ? x1 - x0 : z1 - z0;
      const geo = new THREE.PlaneGeometry(len, 4.2, 1, 1); geo.translate(0, 2.1, 0);
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 24, uv.getY(i));
      placeOnFace(geo, f, x0, x1, z0, z1, 0.06); glassG.push(geo);
      // awnings every 6 m
      for (let s = 3; s < len - 2; s += 6) {
        const aw = new THREE.BoxGeometry(4.2, 0.12, 1.6); aw.translate(0, 3.55, 0.8); aw.rotateX(0.32);
        const along = f === 'n' || f === 's' ? x0 + s : z0 + s; const t = new THREE.Vector3();
        if (f === 'n') { aw.rotateY(Math.PI); t.set(along, 0, z0 - 0.05); } else if (f === 's') { t.set(along, 0, z1 + 0.05); } else if (f === 'w') { aw.rotateY(Math.PI / 2); t.set(x0 - 0.05, 0, along); } else { aw.rotateY(-Math.PI / 2); t.set(x1 + 0.05, 0, along); }
        aw.translate(t.x, t.y, t.z); (R() < 0.5 ? awnA : awnB).push(aw);
      }
    }
    // plain entrance doors (2 per building, on the park-facing face)
    const df = B.stoops || (z1 <= -73 ? 's' : z0 >= 74 ? 'n' : x0 >= 136 ? 'w' : 'e');
    if (!B.shops) {
      const len = df === 'n' || df === 's' ? x1 - x0 : z1 - z0; const n = Math.max(1, Math.round(len / 18));
      for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * len; const geo = new THREE.PlaneGeometry(1.8, 3.0); geo.translate(0, 1.5, 0); placeOnFace(geo, df, x0, x1, z0, z1, 0.05, a); doors.push(geo); }
    }
    if (B.stoops) buildStoops(B, stoopStone, iron, doors, ctx);
  }

  // ---- merged meshes per style ----------------------------------------------------------------------------------
  const solidMesh = (geos, mat, name, surface = 'concrete', shadow = true) => {
    if (!geos.length) return null;
    const m = new THREE.Mesh(mergeGeos(geos), mat); m.name = name; m.castShadow = shadow; m.receiveShadow = true; m.userData.surface = surface; scene.add(m); ctx.raycastTargets.push(m); return m;
  };
  for (const st in groups) {
    const map = styleTex(st);
    const mat = new THREE.MeshStandardMaterial({ map, roughness: st === 'glass' ? 0.25 : 0.85, metalness: st === 'glass' ? 0.4 : 0, envMapIntensity: st === 'glass' ? 1.2 : 0.4 });
    if (st === 'brick' || st === 'row') { mat.normalMap = T.brickN; mat.normalScale = new THREE.Vector2(0.4, 0.4); }
    solidMesh(groups[st], mat, 'bld_' + st);
  }
  solidMesh(roofs, new THREE.MeshStandardMaterial({ color: 0x5a5753, roughness: 0.95 }), 'roofs');
  solidMesh(doors, new THREE.MeshStandardMaterial({ color: 0x1d1c1a, roughness: 0.6, metalness: 0.2 }), 'doors', 'wood', false);
  const sf = new THREE.MeshStandardMaterial({ map: storefrontTexture(R), roughness: 0.4, metalness: 0.1 });
  solidMesh(glassG, sf, 'storefronts', 'metal', false);
  solidMesh(awnA, new THREE.MeshStandardMaterial({ color: 0x2d5a3a, roughness: 0.9, side: THREE.DoubleSide }), 'awningsA', 'wood');
  solidMesh(awnB, new THREE.MeshStandardMaterial({ color: 0x8a2a24, roughness: 0.9, side: THREE.DoubleSide }), 'awningsB', 'wood');
  solidMesh(stoopStone, new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.75 }), 'stoops');
  solidMesh(iron, new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.5, metalness: 0.7 }), 'ironwork', 'metal');

  buildJudsonTower(world);
  buildBobstPlaza(world, T);
  buildRoofLadders(world);
  buildStreetEnds(world);
  buildBackdrop(world, styleTex);
}

function roofGeo(x0, x1, z0, z1, y) { const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y + 0.02, (z0 + z1) / 2); return g; }
function cornice(x0, x1, z0, z1, h) { const g = new THREE.BoxGeometry(x1 - x0 + 0.8, 0.7, z1 - z0 + 0.8); g.translate((x0 + x1) / 2, h - 0.35, (z0 + z1) / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.01, 0.01); return g; }
function placeOnFace(geo, f, x0, x1, z0, z1, off, along = null) {
  const cx = along != null ? (f === 'n' || f === 's' ? x0 + along : (x0 + x1) / 2) : (x0 + x1) / 2;
  const cz = along != null ? (f === 'e' || f === 'w' ? z0 + along : (z0 + z1) / 2) : (z0 + z1) / 2;
  if (f === 'n') { geo.rotateY(Math.PI); geo.translate(cx, 0, z0 - off); }
  else if (f === 's') { geo.translate(cx, 0, z1 + off); }
  else if (f === 'w') { geo.rotateY(-Math.PI / 2); geo.translate(x0 - off, 0, cz); }
  else { geo.rotateY(Math.PI / 2); geo.translate(x1 + off, 0, cz); }
}

/** Greek-Revival stoops along the given face: 4 marble steps up to a raised entrance, iron railings + areaway fence, walkable. */
function buildStoops(B, stone, iron, doors, ctx) {
  const { x0, x1, z0, z1 } = B; const f = B.stoops; const len = x1 - x0; const n = B.bays ? Math.round(B.bays) : 8; const pitch = len / n;
  const zf = f === 's' ? z1 : z0, dir = f === 's' ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const cx = x0 + (i + 0.5) * pitch;
    // steps: 4 × 0.35 rise, 0.32 tread, 1.6 wide, perpendicular to the face
    for (let s = 0; s < 4; s++) {
      const y1 = 0.35 * (s + 1), d0 = 0.32 * (4 - s); const g = new THREE.BoxGeometry(1.6, y1, d0 + 0.6);
      const zc = zf + dir * (d0 + 0.6) / 2; g.translate(cx, y1 / 2, zc); stone.push(g);
      ctx.colliders.push(new THREE.Box3(new THREE.Vector3(cx - 0.8, 0, Math.min(zf, zf + dir * (d0 + 0.6))), new THREE.Vector3(cx + 0.8, y1, Math.max(zf, zf + dir * (d0 + 0.6)))));
    }
    // landing + door surround
    const land = new THREE.BoxGeometry(2.4, 1.4, 0.7); land.translate(cx, 0.7, zf + dir * 0.35); stone.push(land);
    ctx.colliders.push(new THREE.Box3(new THREE.Vector3(cx - 1.2, 0, Math.min(zf, zf + dir * 0.7)), new THREE.Vector3(cx + 1.2, 1.4, Math.max(zf, zf + dir * 0.7))));
    const sur = new THREE.BoxGeometry(2.4, 3.2, 0.25); sur.translate(cx, 1.4 + 1.6, zf + dir * 0.12); stone.push(sur);
    const door = new THREE.PlaneGeometry(1.2, 2.6); door.translate(0, 1.4 + 1.3, 0); if (f === 'n') door.rotateY(Math.PI); door.translate(cx, 0, zf + dir * 0.26); doors.push(door);
    // railings: two rails along the steps + newel balls
    for (const sx of [-0.85, 0.85]) {
      const rail = new THREE.BoxGeometry(0.06, 0.06, 2.0); rail.rotateX(-dir * 0.72); rail.translate(cx + sx, 1.45, zf + dir * 1.15); iron.push(rail);
      for (let k = 0; k < 4; k++) { const p = new THREE.BoxGeometry(0.03, 0.9 + k * 0.33, 0.03); p.translate(cx + sx, (0.9 + k * 0.33) / 2 + 0.05, zf + dir * (1.9 - k * 0.45)); iron.push(p); }
      const ball = new THREE.SphereGeometry(0.09, 8, 6); ball.translate(cx + sx, 1.05, zf + dir * 1.95); iron.push(ball);
    }
    // areaway fence between stoops
    const fx0 = cx + 1.3, fx1 = cx + pitch - 1.3;
    if (fx1 > fx0 + 0.5) { const top = new THREE.BoxGeometry(fx1 - fx0, 0.05, 0.05); top.translate((fx0 + fx1) / 2, 1.1, zf + dir * 1.4); iron.push(top); for (let x = fx0; x < fx1; x += 0.25) { const p = new THREE.BoxGeometry(0.025, 1.15, 0.025); p.translate(x, 0.575, zf + dir * 1.4); iron.push(p); } ctx.colliders.push(new THREE.Box3(new THREE.Vector3(fx0, 0, Math.min(zf, zf + dir * 1.45)), new THREE.Vector3(fx1, 1.15, Math.max(zf, zf + dir * 1.45)))); }
  }
}

/** Judson Memorial Church campanile (≈ 40 m, yellow brick, open belfry, pyramid roof) at the church's NE corner. */
function buildJudsonTower(world) {
  const { ctx, scene } = world;
  const mat = new THREE.MeshStandardMaterial({ color: 0xc9aa6c, roughness: 0.85 });
  const cx = -18.5, cz = 91, w = 7.5;
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(w, 34, w), mat); shaft.position.set(cx, 17, cz); scene.add(shaft); world.solid(shaft, 'concrete');
  // belfry: corner piers + dark arched openings
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a221e, roughness: 0.9 });
  const belf = new THREE.Mesh(new THREE.BoxGeometry(w, 6, w), dark); belf.position.set(cx, 37, cz); scene.add(belf); world.solid(belf, 'concrete');
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 6, 1.4), mat); p.position.set(cx + dx * (w / 2 - 0.7), 37, cz + dz * (w / 2 - 0.7)); scene.add(p); p.castShadow = true; }
  const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.8, w + 0.8), mat); cap.position.set(cx, 40.4, cz); scene.add(cap); cap.castShadow = true;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.72, 4.5, 4), new THREE.MeshStandardMaterial({ color: 0x6a4a3a, roughness: 0.9 })); roof.position.set(cx, 43, cz); roof.rotation.y = Math.PI / 4; scene.add(roof); roof.castShadow = true;
  // church nave gable roof hint (low pitched box on the church body)
  const gable = new THREE.Mesh(new THREE.BoxGeometry(18, 3.2, 26), new THREE.MeshStandardMaterial({ color: 0x7a5a48, roughness: 0.9 })); gable.position.set(-31, 21.5, 103); gable.scale.set(1, 1, 1); scene.add(gable); gable.castShadow = true;
}

/** Bobst Library forecourt: raised granite plaza (0.9 m) with steps down to Washington Sq S, planters as cover. */
function buildBobstPlaza(world, T) {
  const { ctx, scene } = world;
  const mat = new THREE.MeshStandardMaterial({ map: world.tex.granite, roughness: 0.7, color: 0xb0aaa0 });
  const x0 = 72, x1 = 126, z0 = 83.2, z1 = 89;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.9, z1 - z0), mat); slab.position.set((x0 + x1) / 2, 0.45, (z0 + z1) / 2); scene.add(slab); slab.castShadow = slab.receiveShadow = true; slab.userData.surface = 'concrete'; ctx.raycastTargets.push(slab);
  world.walkable([x0, 0, z0], [x1, 0.9, z1]);
  // 3 steps along the north edge (toward the park)
  for (let s = 0; s < 3; s++) { const y = 0.3 * (s + 1), d = 0.4 * (3 - s); const st = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 - 20, y, d), mat); st.position.set((x0 + x1) / 2, y / 2, z0 - d / 2); scene.add(st); st.receiveShadow = true; st.userData.surface = 'concrete'; ctx.raycastTargets.push(st); world.walkable([x0 + 10, 0, z0 - d], [x1 - 10, y, z0]); }
  // planters (cover)
  for (const px of [x0 + 4, x1 - 4]) { const pl = new THREE.Mesh(new THREE.BoxGeometry(5, 0.9, 2.2), mat); pl.position.set(px, 0.9 + 0.45, z0 + 2); scene.add(pl); world.solid(pl, 'concrete'); world.cover(px, z0 + 4, 0, 1, 0.9); world.cover(px, z0 + 0.4, 0, -1, 0.9); }
  world.cover(x0 + 15, z0 - 1.6, 0, -1); world.cover(x1 - 15, z0 - 1.6, 0, -1);
}

/** Fire-escape ladders onto two low roofs: Washington Mews south row (7.2 m) and the MacDougal Alley studios (10 m). */
function buildRoofLadders(world) {
  const { ctx } = world;
  const mews = BUILDINGS.find(b => b.id === 'mewsS'), alley = BUILDINGS.find(b => b.id === 'alleyN');
  const roofOf = (B, parapet = 0.5) => {
    world.walkable([B.x0, B.h - 0.5, B.z0], [B.x1, B.h, B.z1]);
    for (const [a, b] of [[[B.x0, B.z0], [B.x1, B.z0 + 0.3]], [[B.x0, B.z1 - 0.3], [B.x1, B.z1]], [[B.x0, B.z0], [B.x0 + 0.3, B.z1]], [[B.x1 - 0.3, B.z0], [B.x1, B.z1]]])
      ctx.colliders.push(new THREE.Box3(new THREE.Vector3(a[0], B.h, a[1]), new THREE.Vector3(b[0], B.h + parapet, b[1])));
    // roof furniture: water tank + bulkhead as cover
    const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
    const bulk = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 3), new THREE.MeshStandardMaterial({ color: 0x6a6660, roughness: 0.9 })); bulk.position.set(cx - 6, B.h + 1.2, cz); world.scene.add(bulk); world.solid(bulk, 'concrete');
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 3.2, 12), new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.9 })); tank.position.set(cx + 8, B.h + 1.6 + 1.2, cz); world.scene.add(tank); world.solid(tank, 'wood');
    const legs = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 2.6), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 })); legs.position.set(cx + 8, B.h + 0.6, cz); world.scene.add(legs); world.solid(legs, 'metal');
    world.cover(cx - 6, cz - 2.2, 0, -1, B.h); world.cover(cx - 6, cz + 2.2, 0, 1, B.h); world.cover(cx + 8, cz - 2.2, 0, -1, B.h); world.cover(cx + 8, cz + 2.2, 0, 1, B.h);
    world.cover(cx, B.z0 + 0.9, 0, 1, B.h); world.cover(cx, B.z1 - 0.9, 0, -1, B.h);
  };
  if (mews) { world.ladder(mews.x0 + 30, mews.z0 - 0.05, 0, mews.h, 0, -1); roofOf(mews); }     // from Washington Mews (north side of the row)
  if (alley) { world.ladder(alley.x0 + 20, alley.z1 + 0.05, 0, alley.h, 0, 1); roofOf(alley); }  // from MacDougal Alley (south face)
}

/** Street ends at the playable bounds: police barriers + parked box trucks close the perimeter; colliders. */
function buildStreetEnds(world) {
  const { ctx, scene } = world;
  const barMat = new THREE.MeshStandardMaterial({ color: 0x2d4a8a, roughness: 0.7 });
  const geos = [];
  const bar = (x, z, along) => { // NYPD-style blue sawhorse barrier 2.4 m
    const top = new THREE.BoxGeometry(along ? 2.4 : 0.12, 0.12, along ? 0.12 : 2.4); top.translate(x, 1.05, z); geos.push(top);
    const mid = new THREE.BoxGeometry(along ? 2.4 : 0.12, 0.35, along ? 0.12 : 2.4); mid.translate(x, 0.55, z); geos.push(mid);
    for (const s of [-1, 1]) { const leg = new THREE.BoxGeometry(along ? 0.08 : 0.9, 1.1, along ? 0.9 : 0.08); leg.translate(x + (along ? s * 1.1 : 0), 0.55, z + (along ? 0 : s * 1.1)); geos.push(leg); }
    ctx.colliders.push(new THREE.Box3(new THREE.Vector3(x - (along ? 1.2 : 0.45), 0, z - (along ? 0.45 : 1.2)), new THREE.Vector3(x + (along ? 1.2 : 0.45), 1.1, z + (along ? 0.45 : 1.2))));
  };
  for (const s of STREETS) {
    if (s.axis === 'x') { for (const xe of [BOUNDS.x0 + 1.5, BOUNDS.x1 - 1.5]) { if (s.a0 > xe || s.a1 < xe) continue; for (let z = s.r0 + 1.2; z < s.r1; z += 2.5) bar(xe, z, false); } }
    else { for (const ze of [BOUNDS.z0 + 1.5, BOUNDS.z1 - 1.5]) { if (s.a0 > ze || s.a1 < ze) continue; for (let x = s.r0 + 1.2; x < s.r1; x += 2.5) bar(x, ze, true); } }
  }
  const m = new THREE.Mesh(mergeGeos(geos), barMat); m.name = 'barriers'; m.castShadow = true; m.userData.surface = 'wood'; scene.add(m); ctx.raycastTargets.push(m);
}

/** Distant blocks beyond the playable bounds (no colliders): the Village continues, Fifth Avenue runs north to a Midtown skyline. */
function buildBackdrop(world, styleTex) {
  const { scene, R } = world; const geos = {}; const push = (st, g) => (geos[st] || (geos[st] = [])).push(g);
  const roofs = [];
  const blk = (x0, x1, z0, z1, h, st) => { push(st, facadeBox(x0, x1, z0, z1, 0, h)); roofs.push(roofGeo(x0, x1, z0, z1, h)); };
  const styles = ['brick', 'tan', 'brick', 'stone', 'brick', 'white'];
  // Fifth Avenue north: 3 more blocks each side, 8th → 11th St
  for (let z = -190; z > -520; z -= 70) for (const [x0, x1] of [[-90, -16], [14, 90]]) blk(x0, x1, z - 60, z, 20 + R() * 40, styles[(R() * styles.length) | 0]);
  // ring of blocks outside the bounds (north, south, east, west)
  for (let x = -600; x < 600; x += 60) { if (x > -100 && x < 100) continue; blk(x, x + 55, -260, -190, 18 + R() * 30, styles[(R() * 6) | 0]); blk(x, x + 55, 210, 280, 18 + R() * 30, styles[(R() * 6) | 0]); }
  for (let z = -260; z < 280; z += 60) { blk(-330, -260, z, z + 55, 18 + R() * 35, styles[(R() * 6) | 0]); blk(240, 310, z, z + 55, 18 + R() * 35, styles[(R() * 6) | 0]); }
  // Midtown skyline far up Fifth Avenue (scaled down for fog): Empire State on the axis, a few slabs
  blk(-20, 22, -1000, -960, 130, 'stone'); blk(-10, 12, -990, -970, 175, 'stone'); blk(-3, 5, -983, -977, 205, 'stone');
  for (const [x, z, h] of [[-120, -900, 90], [90, -950, 110], [-60, -1050, 120], [160, -1000, 95], [-200, -980, 80], [40, -1100, 140]]) blk(x, x + 40, z, z + 40, h, 'glass');
  for (const st in geos) { const m = new THREE.Mesh(mergeGeos(geos[st]), new THREE.MeshStandardMaterial({ map: styleTex(st), roughness: 0.85 })); m.name = 'backdrop_' + st; m.receiveShadow = true; scene.add(m); }
  const rm = new THREE.Mesh(mergeGeos(roofs), new THREE.MeshStandardMaterial({ color: 0x5a5753, roughness: 0.95 })); rm.name = 'backdropRoofs'; scene.add(rm);
}
