// Washington Square Arch: 17.4 × 7.0 × 23.5 m Tuckahoe marble, 9.1 m span, 14.3 m opening; hollow west pier with a ladder to the attic roof. WSP agent.
import * as THREE from 'three';
import { ARCH } from './layout.js';
import { inscriptionTexture, friezeTexture, cofferTexture, marbleTexture } from './textures.js';
import { mergeGeos } from './ground.js';

export function buildArch(world, T) {
  const { ctx, scene } = world; const A = ARCH;
  const marble = new THREE.MeshStandardMaterial({ map: marbleTexture(world.R), normalMap: T.marbleN, normalScale: new THREE.Vector2(0.15, 0.15), roughness: 0.62, metalness: 0, color: 0xffffff });
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
  boxAt(0, A.corniceY + 0.3, 0, A.width + 1.2, 0.6, A.depth + 1.2);           // main cornice
  boxAt(0, A.atticTop + 0.35, 0, A.width + 0.9, 0.7, A.depth + 0.9);          // attic cornice
  boxAt(0, A.atticTop + 1.0, 0, A.width + 0.9, 0.5, A.depth + 0.9);           // blocking course
  const ornMesh = new THREE.Mesh(mergeGeos(ornament), marble); g.add(ornMesh); ornMesh.castShadow = ornMesh.receiveShadow = true; ornMesh.userData.surface = 'concrete'; ctx.raycastTargets.push(ornMesh);
  // attic (inscription band) both faces + attic sides
  const attic = new THREE.Mesh(new THREE.BoxGeometry(A.width, A.atticTop - A.corniceY - 0.6, A.depth), marble); attic.position.set(0, (A.atticTop + A.corniceY + 0.6) / 2, 0); g.add(attic); attic.castShadow = attic.receiveShadow = true; attic.userData.surface = 'concrete'; ctx.raycastTargets.push(attic);
  const insTex = inscriptionTexture(); const insMat = new THREE.MeshStandardMaterial({ map: insTex, roughness: 0.6, color: 0xf0ebe0 });
  for (const zs of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(A.width - 2, 1.3), insMat); p.position.set(0, (A.atticTop + A.atticY) / 2, zs * (hd + 0.01)); p.rotation.y = zs > 0 ? 0 : Math.PI; g.add(p); }
  // frieze band (stars + W's) across both faces between the spandrels and the cornice
  const frz = new THREE.MeshStandardMaterial({ map: friezeTexture(), roughness: 0.6, color: 0xf0ebe0 }); frz.map.repeat.set(4, 1);
  for (const zs of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(A.width, 1.2), frz); p.position.set(0, A.corniceY - 0.9, zs * (hd + 0.02)); p.rotation.y = zs > 0 ? 0 : Math.PI; g.add(p); }
  // spandrel medallions (wreaths) + winged-victory blocks
  for (const zs of [-1, 1]) for (const xs of [-1, 1]) {
    const m = new THREE.TorusGeometry(0.9, 0.22, 8, 24); m.translate(xs * (hw - A.pier / 2), A.baseH + 6.5, zs * (hd + 0.15)); ornament.push(m);
    for (const fg of figure(2.6, 0.7, 0, 0, 0)) { fg.scale(1, 1, 0.35); fg.rotateZ(xs * 0.5); fg.translate(xs * (R + 1.6), springY + 1.6, zs * (hd + 0.12)); ornament.push(fg); }   // winged victory relief
    const wing = new THREE.BoxGeometry(1.6, 0.5, 0.12); wing.rotateZ(xs * -0.6); wing.translate(xs * (R + 2.6), springY + 3.4, zs * (hd + 0.1)); ornament.push(wing);
    // recessed pier panels (raised frames)
    const fr = new THREE.BoxGeometry(A.pier - 1.2, 5.6, 0.12); fr.translate(xs * (hw - A.pier / 2), A.baseH + 3.6, zs * (hd + 0.05)); ornament.push(fr);
  }
  ornMesh.geometry.dispose(); ornMesh.geometry = mergeGeos(ornament);
  // coffered vault: a cylinder segment just inside the intrados with the coffer texture
  const cof = new THREE.MeshStandardMaterial({ map: cofferTexture(), roughness: 0.7, color: 0xe6e0d3, side: THREE.BackSide }); cof.map.repeat.set(6, 3);
  const vaultGeo = new THREE.CylinderGeometry(R - 0.05, R - 0.05, A.depth - 0.1, 32, 1, true, 0, Math.PI); vaultGeo.rotateX(Math.PI / 2); vaultGeo.rotateZ(Math.PI / 2);
  const vault = new THREE.Mesh(vaultGeo, cof); vault.position.set(0, springY, 0); g.add(vault); vault.userData.surface = 'concrete'; ctx.raycastTargets.push(vault);

  // ---- roof: walkable attic top with a low parapet; exit hole over the shaft ----------------------------------------
  const roofY = A.height; // 23.5
  const slabMat = new THREE.MeshStandardMaterial({ color: 0xb9b3a6, roughness: 0.85 });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(A.width + 0.9, 0.3, A.depth + 0.9), slabMat); roof.position.set(0, roofY - 0.15, 0); g.add(roof); roof.receiveShadow = true; roof.userData.surface = 'concrete'; ctx.raycastTargets.push(roof);
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

  // ---- statue groups (north face): Washington + two allegorical figures per pier, blocky, merged into one mesh -----
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
