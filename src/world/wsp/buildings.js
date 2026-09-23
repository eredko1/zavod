// CITY SQUARE surrounding blocks: measured building footprints as textured boxes merged per style, ground-floor storefronts/doors/awnings,
// Greek-Revival stoops on the terrace rows, the chapel campanile, the avenue tower setbacks, the library's raised plaza, fire-escape ladders to two roofs. WSP agent.
import * as THREE from 'three';
import { BUILDINGS, BOUNDS, STREETS } from './layout.js';
import { facadeTexture, storefrontTexture } from './textures.js';
import { gravelTexture } from './arch.js';
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

  const rooftop = { parapet: [], coping: [], tank: [], frame: [], hvac: [], bulk: [], vent: [] };
  for (const B of BUILDINGS) {
    const { x0, x1, z0, z1, h, style } = B;
    if (B.setbacks) {
      // avenue tower: 3 setbacks + crown (Art Deco)
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
      const tiers = [[w, d, 0, 30], [w * 0.78, d * 0.8, 30, 58], [w * 0.5, d * 0.55, 58, 85], [w * 0.22, d * 0.25, 85, 92]];
      for (const [tw, td, ya, yb] of tiers) { push(style, facadeBox(cx - tw / 2, cx + tw / 2, cz - td / 2, cz + td / 2, ya, yb)); roofs.push(roofGeo(cx - tw / 2, cx + tw / 2, cz - td / 2, cz + td / 2, yb)); }
      ctx.colliders.push(box3(x0, 0, z0, x1, 92, z1));
      continue;
    }
    push(style, facadeBox(x0, x1, z0, z1, 0, h, 4 * BAY_W, style === 'row' ? 17.2 : style === 'sandstone' ? 4 * 3.6 : style === 'church' ? 20 : 4 * FLOOR_H));
    roofs.push(roofGeo(x0, x1, z0, z1, h));
    dressRoof(B, rooftop, R);
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
    facadeShader(mat, st);
    solidMesh(groups[st], mat, 'bld_' + st);
  }
  const gravel = gravelTexture(R);
  solidMesh(roofs, new THREE.MeshStandardMaterial({ map: gravel, color: 0x5a5652, roughness: 1.0, metalness: 0 }), 'roofs');
  // rooftops: parapet + coping on every block, then water tanks / HVAC / bulkheads on the big low roofs
  const parMat = new THREE.MeshStandardMaterial({ map: gravel, color: 0x6a655e, roughness: 0.98 });
  solidMesh(rooftop.parapet, parMat, 'roofParapets');
  solidMesh(rooftop.coping, new THREE.MeshStandardMaterial({ color: 0x8e887e, roughness: 0.8 }), 'roofCoping');
  solidMesh(rooftop.tank, new THREE.MeshStandardMaterial({ color: 0x5f4634, roughness: 0.95 }), 'waterTanks', 'wood');
  solidMesh(rooftop.frame, new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.65, metalness: 0.6 }), 'tankFrames', 'metal');
  solidMesh(rooftop.hvac, new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.5, metalness: 0.65 }), 'roofHVAC', 'metal');
  solidMesh(rooftop.bulk, new THREE.MeshStandardMaterial({ color: 0x7b6a5c, roughness: 0.92 }), 'roofBulkheads');
  solidMesh(rooftop.vent, new THREE.MeshStandardMaterial({ color: 0x3f4448, roughness: 0.6, metalness: 0.5 }), 'roofVents', 'metal');
  solidMesh(doors, new THREE.MeshStandardMaterial({ color: 0x1d1c1a, roughness: 0.6, metalness: 0.2 }), 'doors', 'wood', false);
  const sfTex = storefrontTexture(R); const sf = new THREE.MeshStandardMaterial({ map: sfTex, emissiveMap: sfTex.userData.glow, emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.3, metalness: 0.1 });
  solidMesh(glassG, sf, 'storefronts', 'metal', false);
  solidMesh(awnA, new THREE.MeshStandardMaterial({ color: 0x2d5a3a, roughness: 0.9, side: THREE.DoubleSide }), 'awningsA', 'wood');
  solidMesh(awnB, new THREE.MeshStandardMaterial({ color: 0x8a2a24, roughness: 0.9, side: THREE.DoubleSide }), 'awningsB', 'wood');
  solidMesh(stoopStone, new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.75 }), 'stoops');
  solidMesh(iron, new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.5, metalness: 0.7 }), 'ironwork', 'metal');

  buildCampanile(world);
  buildLibraryPlaza(world, T);
  buildRoofLadders(world);
  buildStreetEnds(world);
  buildBackdrop(world, styleTex);
}

/** Tar roofs read as bare planes from the arch attic: give each one a 0.6 m parapet with coping, a cedar water tank on a
 *  steel frame, a stair bulkhead and 2-4 HVAC boxes. Everything merges into a handful of meshes. */
function dressRoof(B, out, R) {
  const { x0, x1, z0, z1, h } = B; const w = x1 - x0, d = z1 - z0;
  if (w < 6 || d < 6) return;
  const PH = 0.6, PT = 0.32;
  const bar = (ax0, az0, ax1, az1) => { const g = new THREE.BoxGeometry(ax1 - ax0, PH, az1 - az0); g.translate((ax0 + ax1) / 2, h + PH / 2, (az0 + az1) / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (ax1 - ax0) / 4, uv.getY(i) * 0.2); out.parapet.push(g); };
  bar(x0, z0, x1, z0 + PT); bar(x0, z1 - PT, x1, z1); bar(x0, z0 + PT, x0 + PT, z1 - PT); bar(x1 - PT, z0 + PT, x1, z1 - PT);
  const cap = (ax0, az0, ax1, az1) => { const g = new THREE.BoxGeometry(ax1 - ax0, 0.1, az1 - az0); g.translate((ax0 + ax1) / 2, h + PH + 0.05, (az0 + az1) / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.01, 0.01); out.coping.push(g); };
  cap(x0 - 0.08, z0 - 0.08, x1 + 0.08, z0 + PT + 0.08); cap(x0 - 0.08, z1 - PT - 0.08, x1 + 0.08, z1 + 0.08);
  cap(x0 - 0.08, z0 + PT, x0 + PT + 0.08, z1 - PT); cap(x1 - PT - 0.08, z0 + PT, x1 + 0.08, z1 - PT);
  if (w * d < 260) return;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const at = (fx, fz) => [x0 + 2.4 + fx * (w - 4.8), z0 + 2.4 + fz * (d - 4.8)];
  // cedar water tank on a steel frame, conical cap
  { const [tx, tz] = at(0.22 + R() * 0.14, 0.24 + R() * 0.5);
    const legH = 2.2, tankH = 3.4, r = 1.25;
    const body = new THREE.CylinderGeometry(r, r * 1.04, tankH, 14); body.translate(tx, h + legH + tankH / 2, tz); out.tank.push(body);
    const conic = new THREE.ConeGeometry(r * 1.12, 1.15, 14); conic.translate(tx, h + legH + tankH + 0.55, tz); out.tank.push(conic);
    for (const hoopY of [0.5, tankH - 0.5]) { const hp = new THREE.TorusGeometry(r * 1.02, 0.05, 5, 16); hp.rotateX(Math.PI / 2); hp.translate(tx, h + legH + hoopY, tz); out.frame.push(hp); }
    for (const [lx, lz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) { const lg = new THREE.BoxGeometry(0.13, legH, 0.13); lg.translate(tx + lx, h + legH / 2, tz + lz); out.frame.push(lg); }
    const plat = new THREE.BoxGeometry(2.4, 0.12, 2.4); plat.translate(tx, h + legH, tz); out.frame.push(plat);
    const pipe = new THREE.CylinderGeometry(0.09, 0.09, legH + 1.2, 7); pipe.translate(tx + r * 0.9, h + (legH + 1.2) / 2, tz); out.frame.push(pipe);
  }
  // stair bulkhead with a sloped roof
  { const [bx, bz] = at(0.72, 0.3 + R() * 0.3);
    const bb = new THREE.BoxGeometry(3.2, 2.6, 2.6); bb.translate(bx, h + 1.3, bz); out.bulk.push(bb);
    const br = new THREE.BoxGeometry(3.6, 0.22, 3.0); br.rotateX(0.14); br.translate(bx, h + 2.68, bz); out.bulk.push(br);
    const dr = new THREE.BoxGeometry(0.12, 2.0, 1.0); dr.translate(bx - 1.6, h + 1.0, bz); out.vent.push(dr);
  }
  // 2-4 HVAC boxes + a few vent stacks
  const n = 2 + ((R() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const [hx, hz] = at(0.3 + R() * 0.55, 0.15 + R() * 0.7);
    const bw = 1.4 + R() * 1.6, bd = 1.0 + R() * 1.2, bh = 0.8 + R() * 0.8;
    const bx2 = new THREE.BoxGeometry(bw, bh, bd); bx2.translate(hx, h + bh / 2 + 0.12, hz); out.hvac.push(bx2);
    const skid = new THREE.BoxGeometry(bw + 0.2, 0.12, bd + 0.2); skid.translate(hx, h + 0.06, hz); out.vent.push(skid);
    if (R() < 0.6) { const fan = new THREE.CylinderGeometry(bd * 0.32, bd * 0.32, 0.22, 10); fan.translate(hx, h + bh + 0.22, hz); out.hvac.push(fan); }
  }
  for (let i = 0; i < 3; i++) { const [vx, vz] = at(R(), R()); const st = new THREE.CylinderGeometry(0.13, 0.15, 1.1 + R() * 0.9, 8); st.translate(vx, h + 0.7, vz); out.vent.push(st); }
}

/** Every block of one style shares a single merged mesh and one 512 px tile, so without this they all read identically.
 *  Hash the block's 40 m cell into a brightness/hue offset, add a macro blotch, and lay street grime over the lower
 *  floors and a faint sky-bounce sheen over the top ones. */
function facadeShader(mat, key) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vFPos;
        float fh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float fn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(fh(i), fh(i+vec2(1,0)), f.x), mix(fh(i+vec2(0,1)), fh(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 cell = floor(vFPos.xz / 40.0);
        float hA = fh(cell), hB = fh(cell + 17.3), hC = fh(cell + 91.7);
        diffuseColor.rgb *= mix(0.82, 1.14, hA);
        diffuseColor.rgb *= vec3(1.0 + (hB - 0.5) * 0.14, 1.0 + (hC - 0.5) * 0.09, 1.0 - (hB - 0.5) * 0.12);
        diffuseColor.rgb *= mix(0.9, 1.08, fn(vFPos.xz * 0.06 + vFPos.y * 0.02));
        float grime = 1.0 - smoothstep(0.0, 9.0, vFPos.y);
        diffuseColor.rgb *= 1.0 - grime * 0.22 * (0.6 + 0.4 * fn(vFPos.xz * 1.4));
        diffuseColor.rgb *= 1.0 + smoothstep(18.0, 46.0, vFPos.y) * 0.1;`);
  };
  mat.customProgramCacheKey = () => 'wsp-facade-' + key;
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

/** Memorial Chapel campanile (≈ 40 m, yellow brick, open belfry, pyramid roof) at the church's NE corner. */
function buildCampanile(world) {
  const { ctx, scene } = world;
  const mat = new THREE.MeshStandardMaterial({ map: facadeTexture(world.R, 'church', { bays: 2 }), roughness: 0.85 }); mat.map.repeat.set(1, 1);
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

/** Central Library forecourt: raised granite plaza (0.9 m) with steps down to Park Row South, planters as cover. */
function buildLibraryPlaza(world, T) {
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

/** Fire-escape ladders onto two low roofs: the Carriage Mews south row (7.2 m) and the Lantern Alley studios (10 m). */
function buildRoofLadders(world) {
  const { ctx } = world;
  const mews = BUILDINGS.find(b => b.id === 'mewsSouth'), alley = BUILDINGS.find(b => b.id === 'alleyStudios');
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
  if (mews) { world.ladder(mews.x0 + 30, mews.z0 - 0.05, 0, mews.h, 0, -1); roofOf(mews); }     // from the mews (north side of the row)
  if (alley) { world.ladder(alley.x0 + 20, alley.z1 + 0.05, 0, alley.h, 0, 1); roofOf(alley); }  // from the alley (south face)
}

/** Street ends at the playable bounds: police barriers + parked box trucks close the perimeter; colliders. */
function buildStreetEnds(world) {
  const { ctx, scene } = world;
  const barMat = new THREE.MeshStandardMaterial({ color: 0x2d4a8a, roughness: 0.7 });
  const geos = [];
  const bar = (x, z, along) => { // blue sawhorse police barrier 2.4 m
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

/** Distant blocks beyond the playable bounds (no colliders): the district continues, the avenue runs north to a downtown skyline. */
function buildBackdrop(world, styleTex) {
  const { scene, R } = world; const geos = {}; const push = (st, g) => (geos[st] || (geos[st] = [])).push(g);
  const roofs = [];
  const parapets = [];
  const blk = (x0, x1, z0, z1, h, st) => {
    push(st, facadeBox(x0, x1, z0, z1, 0, h)); roofs.push(roofGeo(x0, x1, z0, z1, h));
    // a 1 m parapet band caps every distant block so the skyline has a cut top edge, not a bare extrusion
    const p = new THREE.BoxGeometry(x1 - x0 + 0.7, 1.0, z1 - z0 + 0.7); p.translate((x0 + x1) / 2, h + 0.5, (z0 + z1) / 2);
    const uv = p.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.01, 0.01); parapets.push(p);
  };
  const styles = ['brick', 'tan', 'brick', 'stone', 'brick', 'white'];
  // avenue north: 3 more blocks each side
  for (let z = -190; z > -520; z -= 70) for (const [x0, x1] of [[-90, -16], [14, 90]]) blk(x0, x1, z - 60, z, 20 + R() * 40, styles[(R() * styles.length) | 0]);
  // ring of blocks outside the bounds (north, south, east, west)
  for (let x = -600; x < 600; x += 60) { if (x > -100 && x < 100) continue; blk(x, x + 55, -260, -190, 18 + R() * 30, styles[(R() * 6) | 0]); blk(x, x + 55, 210, 280, 18 + R() * 30, styles[(R() * 6) | 0]); }
  for (let z = -260; z < 280; z += 60) { blk(-330, -260, z, z + 55, 18 + R() * 35, styles[(R() * 6) | 0]); blk(240, 310, z, z + 55, 18 + R() * 35, styles[(R() * 6) | 0]); }
  // distant skyline far up the avenue (scaled down for fog): a spire on the axis, a few slabs
  blk(-20, 22, -1000, -960, 130, 'stone'); blk(-10, 12, -990, -970, 175, 'stone'); blk(-3, 5, -983, -977, 205, 'stone');
  for (const [x, z, h] of [[-120, -900, 90], [90, -950, 110], [-60, -1050, 120], [160, -1000, 95], [-200, -980, 80], [40, -1100, 140]]) blk(x, x + 40, z, z + 40, h, 'glass');
  for (const st in geos) { const bm = new THREE.MeshStandardMaterial({ map: styleTex(st), roughness: 0.85 }); facadeShader(bm, 'bg_' + st); const m = new THREE.Mesh(mergeGeos(geos[st]), bm); m.name = 'backdrop_' + st; m.receiveShadow = true; scene.add(m); }
  const rm = new THREE.Mesh(mergeGeos(roofs), new THREE.MeshStandardMaterial({ color: 0x55514c, roughness: 0.98 })); rm.name = 'backdropRoofs'; scene.add(rm);
  const pm = new THREE.Mesh(mergeGeos(parapets), new THREE.MeshStandardMaterial({ color: 0x7c7468, roughness: 0.9 })); pm.name = 'backdropParapets'; scene.add(pm);
}
