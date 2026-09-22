// Memorial Arch: 17.4 × 7.0 × 23.5 m Tuckahoe marble, 9.1 m span, 14.3 m opening; hollow west pier with a ladder to the attic roof. WSP agent.
import * as THREE from 'three';
import { ARCH } from './layout.js';
import { inscriptionTexture, friezeTexture, cofferTexture, marbleTexture } from './textures.js';
import { mergeGeos } from './ground.js';

export function buildArch(world, T) {
  const { ctx, scene } = world; const A = ARCH;
  const marble = new THREE.MeshStandardMaterial({ map: marbleTexture(world.R), normalMap: T.marbleN, normalScale: new THREE.Vector2(0.28, 0.28), roughness: 0.72, metalness: 0, color: 0xd9d4c8 });
  grimeShader(marble, [A.corniceY, A.atticTop + 0.7, A.baseH + 0.5, A.openH - A.span / 2 + 0.45]);
  world.marbleMat = marble;
  const g = new THREE.Group(); g.name = 'arch'; g.position.set(A.cx, 0, A.cz); scene.add(g);
  const hw = A.width / 2, hd = A.depth / 2, R = A.span / 2, springY = A.openH - R;
  const xW0 = -hw, xW1 = -hw + A.pier, xE0 = hw - A.pier, xE1 = hw;   // pier x ranges (local)
  const add = (mesh, surface = 'concrete', collide = true, box = null) => { g.add(mesh); mesh.updateWorldMatrix(true, false); world.solid(mesh, surface, { collide, box }); return mesh; };
  const wbox = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(new THREE.Vector3(A.cx + x0, y0, A.cz + z0), new THREE.Vector3(A.cx + x1, y1, A.cz + z1));

  // ---- main body: extruded elevation (rect minus round-headed opening), UVs in metres --------------------------------
  const shape = new THREE.Shape(); shape.moveTo(-hw, 0); shape.lineTo(hw, 0); shape.lineTo(hw, A.corniceY); shape.lineTo(-hw, A.corniceY); shape.closePath();
  const hole = new THREE.Path(); hole.moveTo(-R, 0); hole.lineTo(-R, springY); hole.absarc(0, springY, R, Math.PI, 0, true); hole.lineTo(R, 0); hole.closePath(); shape.holes.push(hole);
  const body = new THREE.ExtrudeGeometry(shape, { depth: A.depth, bevelEnabled: false, curveSegments: 24, steps: 1 }); body.translate(0, 0, -hd);
  scaleUV(body, 1 / 2.4);
  const bodyMesh = new THREE.Mesh(body, marble); bodyMesh.name = 'archBody';
  g.add(bodyMesh); bodyMesh.castShadow = bodyMesh.receiveShadow = true; bodyMesh.userData.surface = 'concrete'; ctx.raycastTargets.push(bodyMesh);
  // colliders: east pier solid; west pier hollow (4 walls around the stair shaft with a door on the west face); span above the opening
  const s = A.shaft, sx0 = xW0 + (A.pier - s) / 2, sx1 = sx0 + s, sz0 = -s / 2, sz1 = s / 2;
  ctx.colliders.push(wbox(xE0, 0, -hd, xE1, A.height, hd));
  ctx.colliders.push(wbox(sx1, 0, -hd, xW1, A.height, hd));                       // east wall of the shaft (inner side of the west pier)
  ctx.colliders.push(wbox(xW0, 0, -hd, sx1, A.height, sz0));                       // north wall
  ctx.colliders.push(wbox(xW0, 0, sz1, sx1, A.height, hd));                        // south wall
  ctx.colliders.push(wbox(xW0, 2.2, sz0, sx0, A.height, sz1));                     // west wall above the door
  ctx.colliders.push(wbox(-R - 0.2, springY, -hd, R + 0.2, A.height, hd));         // vault + attic over the opening (approx.)
  // door opening in the west face of the west pier: cut visually with a dark recess + door frame
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.2, 1.1), new THREE.MeshStandardMaterial({ color: 0x2b2a28, roughness: 0.8, metalness: 0.3 }));
  door.position.set(xW0 + 0.1, 1.1, 0); g.add(door); door.userData.surface = 'metal'; ctx.raycastTargets.push(door);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.5, 1.5), marble); frame.position.set(xW0 - 0.05, 1.25, 0); g.add(frame);
  // shaft interior: dark walls (seen through the door) + ladder up the east inner wall; top exit onto the attic roof
  const shaftMat = new THREE.MeshStandardMaterial({ color: 0x6d675e, roughness: 0.9 });
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(s, A.height, s), shaftMat); shaft.material.side = THREE.BackSide; shaft.position.set((sx0 + sx1) / 2, A.height / 2, 0); g.add(shaft);
  // the door: knock a hole out of the extrude visually — we simply overlay a dark opening panel outside the wall
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.2), new THREE.MeshBasicMaterial({ color: 0x0d0d0c })); dark.position.set(xW0 - 0.02, 1.1, 0); dark.rotation.y = -Math.PI / 2; g.add(dark);
  // ladder: face at the east wall of the shaft, normal -x (climber stands west of it), from the floor to the roof
  world.ladder(A.cx + sx1 - 0.05, A.cz, 0, A.height, -1, 0);

  // ---- ornament: pier bases, imposts, keystone, spandrel medallions, frieze, cornice, attic, parapet ----------------
  const ornament = [];
  const boxAt = (x, y, z, w, h, d) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); scaleUV(b, 1 / 2.4); ornament.push(b); };
  for (const [x0, x1] of [[xW0, xW1], [xE0, xE1]]) {
    const cx = (x0 + x1) / 2;
    boxAt(cx, 0.35, 0, A.pier + 0.5, 0.7, A.depth + 0.5);                    // plinth
    boxAt(cx, A.baseH, 0, A.pier + 0.35, 0.5, A.depth + 0.35);               // base cap
    boxAt(cx, springY, 0, A.pier + 0.3, 0.45, A.depth + 0.3);               // impost band
    // pedestals for the statue groups on the north face
    boxAt(cx, A.baseH + 0.9, -hd - 0.9, 3.4, 1.8, 1.8);
  }
  boxAt(0, A.openH + 0.6, 0, 1.2, 1.9, A.depth + 0.4);                        // keystone
  // cornices: each sits 0.1 m INTO the course below it so no two caps are coplanar (that coplanarity was the magenta edge line)
  boxAt(0, A.corniceY + 0.22, 0, A.width + 1.2, 0.72, A.depth + 1.2);         // main cornice  (bottom 17.46, top 18.18)
  boxAt(0, A.atticTop + 0.30, 0, A.width + 0.9, 0.78, A.depth + 0.9);         // attic cornice (bottom 22.21, top 22.99)
  // blocking course: a RING of four bars, not a solid block — a solid one caps the roof deck and reads as a bare white plane
  { const bw = A.width + 0.94, bd = A.depth + 0.94, t = 0.55, by = A.atticTop + 0.92;
    boxAt(0, by, -(bd - t) / 2, bw, 0.58, t); boxAt(0, by, (bd - t) / 2, bw, 0.58, t);
    boxAt(-(bw - t) / 2, by, 0, t, 0.58, bd - 2 * t); boxAt((bw - t) / 2, by, 0, t, 0.58, bd - 2 * t); }
  const ornMesh = new THREE.Mesh(mergeGeos(ornament), marble); g.add(ornMesh); ornMesh.castShadow = ornMesh.receiveShadow = true; ornMesh.userData.surface = 'concrete'; ctx.raycastTargets.push(ornMesh);
  // attic (inscription band) both faces + attic sides — overlaps the main cornice by 0.15 m
  const atticH = A.atticTop - A.corniceY - 0.45;
  const attic = new THREE.Mesh(new THREE.BoxGeometry(A.width, atticH, A.depth), marble); attic.position.set(0, A.corniceY + 0.45 + atticH / 2 - 0.08, 0); g.add(attic); attic.castShadow = attic.receiveShadow = true; attic.userData.surface = 'concrete'; ctx.raycastTargets.push(attic);
  // ---- 0.1 m dark AO bands tucked under every projecting cornice / impost / base cap ------------------------------
  const aoMat = new THREE.MeshStandardMaterial({ color: 0x4e4a42, roughness: 0.95, metalness: 0 });
  const aoG = [];
  const aoBand = (y, w, d) => { const b = new THREE.BoxGeometry(w, 0.1, d); b.translate(0, y - 0.05, 0); aoG.push(b); };
  const aoBandAt = (x, y, w, d) => { const b = new THREE.BoxGeometry(w, 0.1, d); b.translate(x, y - 0.05, 0); aoG.push(b); };
  aoBand(A.corniceY + 0.22 - 0.36, A.width + 1.12, A.depth + 1.12);            // under the main cornice
  aoBand(A.atticTop + 0.30 - 0.39, A.width + 0.82, A.depth + 0.82);            // under the attic cornice
  aoBand(A.atticTop + 0.92 - 0.29, A.width + 0.88, A.depth + 0.88);            // under the blocking course
  for (const [x0, x1] of [[xW0, xW1], [xE0, xE1]]) {
    const cx = (x0 + x1) / 2;
    aoBandAt(cx, A.baseH - 0.25, A.pier + 0.28, A.depth + 0.28);               // under the base cap
    aoBandAt(cx, springY - 0.225, A.pier + 0.22, A.depth + 0.22);              // under the impost band
    aoBandAt(cx, 0.7 - 0.02, A.pier + 0.42, A.depth + 0.42);                   // top of the plinth (contact line)
  }
  const aoMesh = new THREE.Mesh(mergeGeos(aoG), aoMat); g.add(aoMesh); aoMesh.receiveShadow = true;
  const insTex = inscriptionTexture(); const insMat = new THREE.MeshStandardMaterial({ map: insTex, roughness: 0.6, color: 0xf0ebe0 });
  for (const zs of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(A.width - 2, 1.3), insMat); p.position.set(0, (A.atticTop + A.atticY) / 2, zs * (hd + 0.01)); p.rotation.y = zs > 0 ? 0 : Math.PI; g.add(p); }
  // frieze band (stars + W's) across both faces between the spandrels and the cornice
  const frz = new THREE.MeshStandardMaterial({ map: friezeTexture(), roughness: 0.6, color: 0xf0ebe0 }); frz.map.repeat.set(4, 1);
  for (const zs of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(A.width, 1.2), frz); p.position.set(0, A.corniceY - 0.9, zs * (hd + 0.02)); p.rotation.y = zs > 0 ? 0 : Math.PI; g.add(p); }
  // spandrel medallions (wreaths) + winged-victory blocks
  for (const zs of [-1, 1]) for (const xs of [-1, 1]) {
    // spandrel roundel: a moulded wreath with a carved field, in the triangle over each arch haunch
    const rx = xs * (R + 1.55), ry = springY + 2.5;
    const m = new THREE.TorusGeometry(1.0, 0.2, 7, 22); m.translate(rx, ry, zs * (hd + 0.16)); ornament.push(m);
    const mIn = new THREE.CylinderGeometry(0.84, 0.84, 0.16, 20); mIn.rotateX(Math.PI / 2); mIn.translate(rx, ry, zs * (hd + 0.09)); ornament.push(mIn);
    for (let k = 0; k < 6; k++) { const pl = new THREE.BoxGeometry(0.5, 0.16, 0.12); pl.rotateZ(k / 6 * Math.PI); pl.translate(rx, ry, zs * (hd + 0.2)); ornament.push(pl); }   // wreath binding
    // swags falling from the roundel toward the impost
    for (const sgn of [-1, 1]) { const sw = new THREE.BoxGeometry(1.5, 0.22, 0.12); sw.rotateZ(sgn * 0.55); sw.translate(rx + sgn * 1.25, ry - 1.15, zs * (hd + 0.12)); ornament.push(sw); }
    // pier panels: a proud moulded FRAME around a recessed field (4 bars, not a slab — a slab reads as a blank plate)
    const pw = A.pier - 1.2, ph = 5.6, py = A.baseH + 3.6, px = xs * (hw - A.pier / 2);
    for (const [bw, bh, bx, by] of [[pw, 0.16, 0, ph / 2], [pw, 0.16, 0, -ph / 2], [0.16, ph, -pw / 2, 0], [0.16, ph, pw / 2, 0]]) {
      const b = new THREE.BoxGeometry(bw, bh, 0.1); b.translate(px + bx, py + by, zs * (hd + 0.05)); ornament.push(b);
    }
    // dentil course under the entablature (small blocks)
    for (let k = 0; k < 9; k++) { const dn = new THREE.BoxGeometry(0.22, 0.26, 0.2); dn.translate(xs * (hw - 0.55 - k * 0.72), A.corniceY - 0.42, zs * (hd + 0.1)); ornament.push(dn); }
  }
  ornMesh.geometry.dispose(); ornMesh.geometry = mergeGeos(ornament);
  // ---- coffered barrel vault: a recessed shell 0.15 m behind the intrados + a real rib grid on the intrados line ----
  const cof = new THREE.MeshStandardMaterial({ map: cofferTexture(), roughness: 0.9, color: 0x8b857a, side: THREE.BackSide }); cof.map.repeat.set(3, 1.5);
  const vaultGeo = new THREE.CylinderGeometry(R - 0.01, R - 0.01, A.depth - 0.02, 48, 1, true, 0, Math.PI); vaultGeo.rotateX(Math.PI / 2); vaultGeo.rotateZ(Math.PI / 2);
  const vault = new THREE.Mesh(vaultGeo, cof); vault.position.set(0, springY, 0); g.add(vault); vault.receiveShadow = true; vault.userData.surface = 'concrete'; ctx.raycastTargets.push(vault);
  { // rib grid standing 0.15 m proud of the coffer field, so each coffer reads as a 0.15 m recess
    const ribs = []; const rr = R - 0.15, tube = 0.075;
    for (let i = 0; i < 6; i++) {
      const z = -hd + 0.12 + i * (A.depth - 0.24) / 5;
      const t = new THREE.TorusGeometry(rr, tube, 5, 26, Math.PI); t.translate(0, springY, z); ribs.push(t);
    }
    for (let i = 0; i <= 8; i++) {
      const a = i / 8 * Math.PI; const b = new THREE.BoxGeometry(0.15, 0.15, A.depth - 0.1);
      b.rotateZ(a); b.translate(Math.cos(a) * rr, springY + Math.sin(a) * rr, 0); ribs.push(b);
    }
    const ribMesh = new THREE.Mesh(mergeGeos(ribs), marble); g.add(ribMesh); ribMesh.castShadow = ribMesh.receiveShadow = true; ribMesh.userData.surface = 'concrete'; ctx.raycastTargets.push(ribMesh);
    // soffit shadow band where the vault springs from the piers
    const soff = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, A.depth - 0.08), aoMat);
    for (const sx of [-1, 1]) { const m2 = soff.clone(); m2.position.set(sx * (R + 0.02), springY - 0.25, 0); g.add(m2); }
  }

  // ---- roof: walkable attic top with a low parapet; exit hole over the shaft ----------------------------------------
  const roofY = A.height; // 23.5
  const slabMat = new THREE.MeshStandardMaterial({ map: gravelTexture(world.R), roughness: 1.0, metalness: 0, color: 0x6e6a64 });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(A.width + 0.9, 0.3, A.depth + 0.9), slabMat); roof.position.set(0, roofY - 0.15, 0); g.add(roof); roof.receiveShadow = true; roof.userData.surface = 'concrete'; ctx.raycastTargets.push(roof);
  { const uv = roof.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 3); }
  // walkable slab pieces (hole over the shaft)
  world.walkable([A.cx + sx1, roofY - 0.4, A.cz - hd - 0.45], [A.cx + hw + 0.45, roofY, A.cz + hd + 0.45]);
  world.walkable([A.cx - hw - 0.45, roofY - 0.4, A.cz - hd - 0.45], [A.cx + sx1, roofY, A.cz + sz0]);
  world.walkable([A.cx - hw - 0.45, roofY - 0.4, A.cz + sz1], [A.cx + sx1, roofY, A.cz + hd + 0.45]);
  world.walkable([A.cx - hw - 0.45, roofY - 0.4, A.cz + sz0], [A.cx + sx0, roofY, A.cz + sz1]);
  const hatch = new THREE.Mesh(new THREE.BoxGeometry(s + 0.3, 0.32, s + 0.3), new THREE.MeshBasicMaterial({ color: 0x141412 })); hatch.position.set((sx0 + sx1) / 2, roofY - 0.14, 0); g.add(hatch);
  const par = A.parapet, pw = 0.35;
  const parMat = marble; const parapets = [];
  const pb = (x, z, w, d) => { const b = new THREE.BoxGeometry(w, par, d); b.translate(x, roofY + par / 2, z); scaleUV(b, 1 / 2.4); parapets.push(b); ctx.colliders.push(wbox(x - w / 2, roofY, z - d / 2, x + w / 2, roofY + par, z + d / 2)); };
  pb(0, -hd - 0.45 + pw / 2, A.width + 0.9, pw); pb(0, hd + 0.45 - pw / 2, A.width + 0.9, pw); pb(-hw - 0.45 + pw / 2, 0, pw, A.depth + 0.9); pb(hw + 0.45 - pw / 2, 0, pw, A.depth + 0.9);
  const parMesh = new THREE.Mesh(mergeGeos(parapets), parMat); g.add(parMesh); parMesh.castShadow = parMesh.receiveShadow = true; parMesh.userData.surface = 'concrete'; ctx.raycastTargets.push(parMesh);
  // roof furniture: hatch coaming + propped lid, an aerial mast with guys, conduit runs, a drain sump and a gravel drift
  { const ironM = new THREE.MeshStandardMaterial({ color: 0x33373b, roughness: 0.6, metalness: 0.55 });
    const iron = [], hx = (sx0 + sx1) / 2;
    const coam = new THREE.BoxGeometry(s + 0.5, 0.36, s + 0.5); coam.translate(hx, roofY + 0.18, 0); iron.push(coam);
    const lid = new THREE.BoxGeometry(s + 0.55, 0.08, s + 0.55); lid.rotateZ(-0.85); lid.translate(hx + 1.1, roofY + 1.0, 0); iron.push(lid);
    const mast = new THREE.CylinderGeometry(0.05, 0.07, 3.6, 8); mast.translate(hw - 1.4, roofY + 1.8, -hd + 1.2); iron.push(mast);
    for (let k = 0; k < 3; k++) { const arm = new THREE.BoxGeometry(0.9, 0.04, 0.04); arm.translate(hw - 1.4, roofY + 2.4 + k * 0.4, -hd + 1.2); iron.push(arm); }
    for (const zz of [-1.6, 1.6]) { const con = new THREE.CylinderGeometry(0.05, 0.05, 9.0, 6); con.rotateZ(Math.PI / 2); con.translate(1.2, roofY + 0.09, zz); iron.push(con); }
    const sump = new THREE.CylinderGeometry(0.28, 0.24, 0.1, 12); sump.translate(-hw + 1.6, roofY + 0.02, hd - 1.1); iron.push(sump);
    const im = new THREE.Mesh(mergeGeos(iron), ironM); g.add(im); im.castShadow = im.receiveShadow = true; im.userData.surface = 'metal'; ctx.raycastTargets.push(im);
    ctx.colliders.push(wbox(hx - (s + 0.5) / 2, roofY, -(s + 0.5) / 2, hx + (s + 0.5) / 2, roofY + 0.36, (s + 0.5) / 2));
    // gravel drifts blown against the parapet
    const drift = [];
    for (let k = 0; k < 7; k++) { const d = new THREE.BoxGeometry(1.4 + k % 3, 0.06, 0.55); d.translate(-hw + 2 + k * 2.5, roofY + 0.03, hd + 0.2 - 0.5); drift.push(d); }
    const dm = new THREE.Mesh(mergeGeos(drift), slabMat); g.add(dm); dm.receiveShadow = true;
  }

  // ---- statue groups (north face): a commander + two allegorical figures per pier, blocky, merged into one mesh -----
  const statMat = new THREE.MeshStandardMaterial({ color: 0xd6cfc0, roughness: 0.75 });
  const figGeos = [];
  for (const [x0, x1] of [[xW0, xW1], [xE0, xE1]]) {
    const cx = (x0 + x1) / 2, baseY = A.baseH + 1.8, z = -hd - 0.9;
    figGeos.push(...figure(4.6, 1.0, cx, baseY, z), ...figure(3.6, 0.75, cx - 1.15, baseY, z), ...figure(3.6, 0.75, cx + 1.15, baseY, z));
    ctx.colliders.push(wbox(cx - 1.7, 0, z - 0.9, cx + 1.7, A.baseH + 1.8, z + 0.9));
  }
  const figMesh = new THREE.Mesh(mergeGeos(figGeos), statMat); g.add(figMesh); figMesh.castShadow = figMesh.receiveShadow = true; figMesh.userData.surface = 'concrete'; ctx.raycastTargets.push(figMesh);

  // cover around the arch piers + the plaza rim
  for (const x of [A.cx - hw - 1, A.cx + hw + 1]) { world.cover(x, A.cz - hd - 1.5, 0, -1); world.cover(x, A.cz + hd + 1.5, 0, 1); }
  world.cover(A.cx - hw - 1.2, A.cz, -1, 0); world.cover(A.cx + hw + 1.2, A.cz, 1, 0);
  for (const x of [A.cx - hw + 1.5, A.cx + hw - 1.5]) { world.cover(x, A.cz - hd - 0.45 - 0.8, 0, 1, roofY); world.cover(x, A.cz + hd + 0.45 + 0.8 - 1.6, 0, -1, roofY); }
  return g;
}

/** Blocky standing figure (robed) as geometries translated to (x, y, z). */
function figure(h = 4.5, w = 1.0, x = 0, y = 0, z = 0) {
  const out = []; const add = (geo, dy, dx = 0, rz = 0) => { if (rz) geo.rotateZ(rz); geo.translate(x + dx, y + dy, z); out.push(geo); };
  add(new THREE.CylinderGeometry(w * 0.55, w * 0.7, h * 0.55, 10), h * 0.275);
  add(new THREE.BoxGeometry(w * 1.05, h * 0.3, w * 0.6), h * 0.7);
  add(new THREE.BoxGeometry(w * 1.4, h * 0.08, w * 0.6), h * 0.85);
  add(new THREE.SphereGeometry(w * 0.26, 10, 8), h * 0.92);
  add(new THREE.BoxGeometry(w * 0.22, h * 0.34, w * 0.22), h * 0.7, w * 0.68, -0.2);
  add(new THREE.BoxGeometry(w * 0.22, h * 0.34, w * 0.22), h * 0.7, -w * 0.68, 0.2);
  return out;
}

export function scaleUV(geo, k) { const uv = geo.attributes.uv; if (!uv) return; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k); }

/** Macro grime (8 m blotches, ±8%) + soot streaks running down from each cornice/impost height. */
export function grimeShader(mat, bandTops, key = 'wsp-grime') {
  const tops = new Float32Array(8); bandTops.slice(0, 8).forEach((v, i) => (tops[i] = v));
  const n = Math.min(bandTops.length, 8);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTops = { value: tops };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGPos; uniform float uTops[8];
        float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(gh(i), gh(i+vec2(1,0)), f.x), mix(gh(i+vec2(0,1)), gh(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 wp = vGPos;
        float macro = gn(wp.xz * 0.125) * 0.55 + gn(wp.xy * 0.125 + 4.7) * 0.45;
        diffuseColor.rgb *= mix(0.88, 1.10, macro);
        float streak = 0.35 + 0.65 * gn(vec2(wp.x, wp.z) * 2.3);
        float soot = 0.0, ao = 0.0;
        for (int i = 0; i < ${n}; i++) {
          float d = uTops[i] - wp.y;
          soot += smoothstep(0.0, 0.05, d) * (1.0 - smoothstep(0.1, 2.4, d));
          ao   += smoothstep(0.0, 0.02, d) * (1.0 - smoothstep(0.02, 0.22, d));
        }
        diffuseColor.rgb *= 1.0 - clamp(soot, 0.0, 1.0) * 0.38 * streak;
        diffuseColor.rgb *= 1.0 - clamp(ao, 0.0, 1.0) * 0.30;`);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

/** Tar-and-gravel roof: dark grey aggregate with tar patches and seam lines. 512 px ≈ 4 m. */
export function gravelTexture(R) {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#5a5652'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 24000; i++) { const v = R(); g.fillStyle = `rgba(${v < 0.45 ? '32,30,28' : v < 0.8 ? '124,120,112' : '158,152,142'},${0.25 + R() * 0.5})`; g.fillRect(R() * S, R() * S, 1 + R() * 2.4, 1 + R() * 2.4); }
  for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(22,20,19,${0.12 + R() * 0.3})`; g.beginPath(); g.ellipse(R() * S, R() * S, 18 + R() * 70, 12 + R() * 44, R() * 3, 0, 7); g.fill(); }   // tar patches
  g.strokeStyle = 'rgba(28,26,24,0.55)'; g.lineWidth = 3;
  for (let y = 0; y < S; y += S / 4) { g.beginPath(); g.moveTo(0, y + (R() - 0.5) * 4); g.lineTo(S, y + (R() - 0.5) * 4); g.stroke(); }                                           // felt seams
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
