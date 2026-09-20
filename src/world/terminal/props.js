// TERMINAL props: instanced balusters, bulb strings, lamps/pendants, turnstiles, NYPD barriers, luggage carts, kiosks, trash cans (Poly Haven), flags. TERMINAL agent.
import * as THREE from 'three';
import { Bucket, mat4, lathe, instanced } from './kit.js';
import { instanceModel } from '../props.js';
import { P } from './plan.js';
import { vaultY } from './concourse.js';
import { table } from './south.js';

export function buildProps(world, M) {
  const { ctx, scene, R } = world; const B = new Bucket(world);
  const uv = (m) => m.userData.uv ?? 0.5;

  // ---- turned marble balusters (instanced) --------------------------------------------------------------------
  {
    const geo = lathe([[0.07, 0], [0.09, 0.05], [0.055, 0.12], [0.075, 0.3], [0.1, 0.45], [0.07, 0.62], [0.055, 0.74], [0.085, 0.8], [0.085, 0.84], [0, 0.84]], 10);
    instanced(world, geo, M.marble, world.termBal, 'concrete', { name: 'balusters', shadow: true });
  }
  // ---- bulb strings along the cornices, end arches and balcony fronts ------------------------------------------
  {
    const mats = []; const sph = new THREE.SphereGeometry(0.07, 8, 6);
    for (let x = P.X0; x <= P.X1; x += 0.55) { mats.push(mat4(x, P.CORNICE + 0.35, P.Z1 - 1.05)); mats.push(mat4(x, P.CORNICE + 0.35, P.Z0 + 1.05)); }
    for (let i = 0; i <= 90; i++) { const z = P.Z0 + (P.Z1 - P.Z0) * i / 90; const y = vaultY(z) - 1.55; mats.push(mat4(P.X0 + 1.25, y, z)); mats.push(mat4(P.X1 - 1.25, y, z)); }
    for (let z = P.Z0 + 0.3; z <= P.Z1 - 0.3; z += 0.6) { mats.push(mat4(-P.BAL_X + 0.02, P.BAL_Y - 0.62, z)); mats.push(mat4(P.BAL_X - 0.02, P.BAL_Y - 0.62, z)); }
    for (let x = -P.BAL_X; x <= P.BAL_X; x += 0.6) mats.push(mat4(x, P.BAL_Y - 0.62, P.BAL_NZ + 0.02));
    // frieze line above the balcony arcade on the long walls
    for (let x = P.X0; x <= P.X1; x += 0.6) { mats.push(mat4(x, P.BAL_Y + 4.65, P.Z1 - 0.75)); mats.push(mat4(x, P.BAL_Y + 4.65, P.Z0 + 0.75)); }
    const im = instanced(world, sph, M.bulb, mats, 'metal', { name: 'bulbs', shadow: false }); if (im) im.castShadow = false;
  }
  // ---- lamps registered by builders --------------------------------------------------------------------------
  for (const L of world.termLamps) {
    const [x, y, z, type] = L;
    if (type === 'wall') { B.add(M.brass, new THREE.BoxGeometry(0.16, 0.5, 0.12), mat4(x, y, z + 0.4)); B.add(M.lampGlass, new THREE.SphereGeometry(0.16, 10, 8), mat4(x, y + 0.1, z + 0.2)); }
    else if (type === 'pendant') { B.add(M.brass, new THREE.CylinderGeometry(0.02, 0.02, 1.0, 6), mat4(x, y + 0.5, z)); B.add(M.brass, lathe([[0, 0], [0.35, 0], [0.42, 0.05], [0.2, 0.3], [0.05, 0.36]], 16), mat4(x, y - 0.05, z)); B.add(M.lampGlass, new THREE.SphereGeometry(0.16, 10, 8), mat4(x, y - 0.05, z)); }
    else if (type === 'fluor') { B.box(M.fluor, [x - 1.2, y - 0.03, z - 0.05], [x + 1.2, y + 0.03, z + 0.05], { uvScale: 1 }); B.box(M.ironDark, [x - 1.3, y + 0.03, z - 0.1], [x + 1.3, y + 0.15, z + 0.1], { uvScale: 1 }); }
  }
  // ---- turnstiles (instanced) ------------------------------------------------------------------------------------
  {
    const parts = [];
    const cab = new THREE.BoxGeometry(0.28, 1.0, 1.3); cab.translate(-0.5, 0.5, 0); parts.push(cab);
    const cab2 = cab.clone(); cab2.translate(1.0, 0, 0); parts.push(cab2);
    const top = new THREE.BoxGeometry(0.32, 0.06, 1.34); top.translate(-0.5, 1.03, 0); parts.push(top); const top2 = top.clone(); top2.translate(1.0, 0, 0); parts.push(top2);
    const hub = new THREE.CylinderGeometry(0.07, 0.07, 0.6, 10); hub.rotateX(Math.PI / 2); hub.translate(-0.35, 0.95, 0.1); parts.push(hub);
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; const arm = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6); arm.translate(0, 0.25, 0); arm.rotateZ(Math.PI / 2 + a * 0); arm.applyMatrix4(new THREE.Matrix4().makeRotationX(a)); arm.translate(-0.35, 0.95, 0.35); parts.push(arm); }
    const geo = mergeSimple(parts);
    const mats = world.termTurnstiles.map(([x, y, z]) => mat4(x, y, z));
    instanced(world, geo, M.stainless, mats, 'metal', { name: 'turnstiles' });
    for (const [x, y, z] of world.termTurnstiles) world.ctx.colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.66, y, z - 0.67), new THREE.Vector3(x - 0.34, y + 1.06, z + 0.67)), new THREE.Box3(new THREE.Vector3(x + 0.34, y, z - 0.67), new THREE.Vector3(x + 0.66, y + 1.06, z + 0.67)));
  }
  // ---- NYPD-style wooden sawhorse barriers (cover) on the concourse -----------------------------------------------
  {
    const parts = []; const plank = new THREE.BoxGeometry(2.4, 0.25, 0.05); plank.translate(0, 0.95, 0); parts.push(plank);
    const plank2 = new THREE.BoxGeometry(2.4, 0.12, 0.05); plank2.translate(0, 0.45, 0); parts.push(plank2);
    for (const dx of [-1.05, 1.05]) for (const dz of [-0.35, 0.35]) { const leg = new THREE.BoxGeometry(0.06, 1.1, 0.06); leg.translate(dx, 0.55, dz * 0.9); leg.applyMatrix4(new THREE.Matrix4().makeRotationX(dz > 0 ? -0.32 : 0.32)); leg.translate(0, 0, dz * 0.1); parts.push(leg); }
    const geo = mergeSimple(parts);
    const spots = [[-6, 10, 0.2], [-3.6, 10.3, -0.1], [6, -10, 0.1], [8.4, -9.8, 0.3], [14, 4, 1.5], [14, 1.6, 1.6], [-14, -4, 1.5], [-14, -1.6, 1.4], [20, -12, 0.0], [22.4, -12.2, 0.15], [-22, 12, 0.05], [-19.6, 12.2, -0.1], [3, -14, 0.6], [-3, 14, 0.7]];
    const mats = spots.map(([x, z, ry]) => mat4(x, 0, z, 0, ry));
    instanced(world, geo, M.wood, mats, 'wood', { name: 'barriers' });
    for (const [x, z, ry] of spots) { const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry)); const hx = 1.2 * c + 0.4 * s, hz = 1.2 * s + 0.4 * c; world.ctx.colliders.push(new THREE.Box3(new THREE.Vector3(x - hx, 0, z - hz), new THREE.Vector3(x + hx, 1.1, z + hz))); world.cover(x - Math.sin(ry) * 0.9, z + Math.cos(ry) * 0.9, -Math.sin(ry), Math.cos(ry)); world.cover(x + Math.sin(ry) * 0.9, z - Math.cos(ry) * 0.9, Math.sin(ry), -Math.cos(ry)); }
  }
  // ---- luggage carts (instanced) -------------------------------------------------------------------------------------
  {
    const parts = []; const bed = new THREE.BoxGeometry(1.3, 0.06, 0.8); bed.translate(0, 0.35, 0); parts.push(bed);
    const back = new THREE.BoxGeometry(0.05, 1.2, 0.8); back.translate(-0.62, 0.95, 0); parts.push(back);
    const bar = new THREE.CylinderGeometry(0.02, 0.02, 0.84, 8); bar.rotateX(Math.PI / 2); bar.translate(-0.62, 1.55, 0); parts.push(bar);
    for (const dx of [-0.45, 0.45]) for (const dz of [-0.3, 0.3]) { const w = new THREE.CylinderGeometry(0.12, 0.12, 0.06, 10); w.rotateX(Math.PI / 2); w.translate(dx, 0.12, dz); parts.push(w); }
    const case1 = new THREE.BoxGeometry(0.6, 0.45, 0.35); case1.translate(0.1, 0.62, 0.1); parts.push(case1); const case2 = new THREE.BoxGeometry(0.5, 0.3, 0.3); case2.translate(-0.2, 0.55, -0.2); parts.push(case2);
    const geo = mergeSimple(parts);
    const spots = [[-9, -12, 0.3, 0], [10, 12.5, -1.2, 0], [26, 8, 2.2, 0], [-27, -9, 1.0, 0], [-34, -6, 0.4, 6], [34, 8, 2.6, 6], [0, -15.5, 1.6, 6], [-52.5, 27.5, 0.2, 0], [52.5, 20.5, 3.0, 0]];
    instanced(world, geo, M.ironDark, spots.map(([x, z, ry, y]) => mat4(x, y, z, 0, ry)), 'metal', { name: 'carts' });
    for (const [x, z, ry, y] of spots) { world.ctx.colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.75, y, z - 0.75), new THREE.Vector3(x + 0.75, y + 1.5, z + 0.75))); world.cover(x + 1.2, z, 1, 0, y); }
  }
  // ---- newsstand kiosks (shuttered) on the concourse + a flower stand ------------------------------------------------
  for (const [kx, kz] of [[-16, -5], [16, 10]]) { // north kiosk pulled off the track-gate lane
    B.box(M.marbleDark, [kx - 2.2, 0, kz - 1.4], [kx + 2.2, 0.9, kz + 1.4], { uvScale: 1, collide: true });
    B.box(M.shutter, [kx - 2.2, 0.9, kz - 1.4], [kx + 2.2, 2.6, kz + 1.4], { uvScale: 1, collide: true });
    B.box(M.brassDark, [kx - 2.3, 2.6, kz - 1.5], [kx + 2.3, 2.85, kz + 1.5], { uvScale: 1 });
    const s = M.sign('NEWSSTAND  ·  MAGAZINES  ·  CANDY', { bg: '#1a1410', fg: '#e8c56a', font: 'bold 56px Georgia, serif' });
    for (const sgnZ of [kz - 1.51, kz + 1.51]) B.add(s, new THREE.PlaneGeometry(4.2, 0.45), mat4(kx, 2.35, sgnZ, 0, sgnZ < kz ? Math.PI : 0, 0));
    world.cover(kx - 2.9, kz, -1, 0); world.cover(kx + 2.9, kz, 1, 0); world.cover(kx, kz - 2.1, 0, -1); world.cover(kx, kz + 2.1, 0, 1);
  }
  // ---- balcony restaurant tables (west: café tables; east: long shop table + stools) --------------------------------
  for (const z of [-9, -4, 4, 9]) { table(B, M, -38.5, P.BAL_Y, z); world.cover(-37.3, z, 1, 0, P.BAL_Y); }
  B.box(M.wood, [37.2, P.BAL_Y + 0.72, -5], [39.2, P.BAL_Y + 0.8, 5], { uvScale: 1 }); for (const z of [-4, -1.3, 1.3, 4]) B.box(M.ironDark, [37.9, P.BAL_Y, z - 0.25], [38.5, P.BAL_Y + 0.72, z + 0.25], { uvScale: 1 });
  world.ctx.colliders.push(new THREE.Box3(new THREE.Vector3(37.2, P.BAL_Y, -5), new THREE.Vector3(39.2, P.BAL_Y + 0.8, 5))); world.cover(36.4, 0, -1, 0, P.BAL_Y);
  // ---- the big flag hanging from the east balcony wall (plain stripes, no emblem) ---------------------------------------
  {
    const c = document.createElement('canvas'); c.width = 256; c.height = 512; const g = c.getContext('2d');
    for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#f1f0ea' : '#b22234'; g.fillRect(0, i * 512 / 13, 256, 512 / 13 + 1); }
    g.fillStyle = '#3c3b6e'; g.fillRect(0, 0, 110, 512 * 7 / 13); g.fillStyle = '#f1f0ea'; for (let j = 0; j < 9; j++) for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(9 + i * 18 + (j % 2) * 9, 12 + j * 30, 3.2, 0, 7); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const fm = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide }); fm.name = 'flag';
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 12.5, 6, 12), fm); flag.position.set(P.X1 - 1.6, 17, 14); flag.rotation.y = -Math.PI / 2; flag.name = 'flag'; flag.castShadow = true; flag.receiveShadow = true; scene.add(flag); ctx.raycastTargets.push(flag); flag.userData.surface = 'wood';
  }
  // ---- trash cans (Poly Haven model, instanced) --------------------------------------------------------------------------
  {
    const src = ctx.assets?.modelSource?.('metal_trash_can');
    const extra = [[-12, 0, 14], [12, 0, -11.2], [-30, 0, 12.5], [30, 0, -12.5], [2.5, 6, -13], [-38, 6, 4], [-6.6, 0, 21], [-44, 0, 20.1], [44, 0, 20.1]];
    const all = [...world.termTrash, ...extra];
    if (src) { const root = src.scene; root.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(root); instanceModel(world, 'metal_trash_can', all.map(([x, y, z]) => ({ x, z, y: y - bb.min.y, ry: R() * 6.28 })), 'metal'); }
    else for (const [x, y, z] of all) B.add(M.ironDark, new THREE.CylinderGeometry(0.32, 0.28, 0.9, 12), mat4(x, y + 0.45, z));
  }
  B.flush((m) => (m === M.brass || m === M.brassDark || m === M.ironDark || m === M.stainless || m === M.shutter ? 'metal' : 'concrete'), { name: 'props' });
}

function mergeSimple(geos) { let total = 0; const ng = geos.map(g => g.index ? g.toNonIndexed() : g); for (const g of ng) total += g.attributes.position.count; const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uvs = new Float32Array(total * 2); let off = 0; for (const g of ng) { pos.set(g.attributes.position.array, off * 3); nor.set(g.attributes.normal.array, off * 3); uvs.set(g.attributes.uv.array, off * 2); off += g.attributes.position.count; } const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); return out; }
