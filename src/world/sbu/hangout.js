// UNIVERSITY hangout (sbu) on the hangkit: a campus deli with its own Sammy by the SAC plaza, rasta dealers on the Academic
// Mall, the library elevator to its roof, the stairs up the Student Activities Center to the hall roof, and every parked car
// in the lots is stealable. SBU agent.
import * as THREE from 'three';
import { buildKit, hangkit as K, kitQA } from '../hangkit.js';
import { buildDeli, findDeliSpot, sammyTalk, buildWalker, rastaTalk } from '../deli.js';
import { LIB, SAC } from './layout.js';

const _rc = new THREE.Raycaster(), _down = new THREE.Vector3(0, -1, 0);
/** highest raycast-target surface under (x, z) below y0 — the real roof height of a building */
function roofAt(world, x, z, y0 = 80) { _rc.set(new THREE.Vector3(x, y0, z), _down); _rc.far = y0 + 5; const h = _rc.intersectObjects(world.ctx.raycastTargets, false)[0]; return h ? h.point.y : null; }

export function buildSbuHangout(world) {
  const { W } = world;
  buildKit(world, { cash: 20, title: 'UNIVERSITY — CONTROLS',
    help: 'F · talk (Sammy, the Ras) / stairs / elevator / steal car / hop in<br>B · blaze or drink (stand close to share)<br>Rastas walk the Academic Mall selling bags ($10)<br>Sammy\'s deli: by the SAC plaza<br>Library: elevator at the entrance arcade → roof<br>SAC: stairs at the glass hall → roof<br>Every parked car in the lots can be stolen<br>Mercs drop cash — walk over it',
    respawn: { label: 'SAC Plaza', at: () => W.onlineStart } });
  if (typeof window !== 'undefined' && window.__game) window.__game.hangout = kitQA;

  // ---- library elevator: entrance arcade (south face, under the overhang) → the roof, facing the mall ---------------------
  { const cx = (LIB.entX0 + LIB.entX1) / 2, rz = LIB.z1 - 14;
    let roofY = roofAt(world, cx, rz); if (!Number.isFinite(roofY) || roofY < 15) roofY = LIB.h - 1;
    world.walkable([LIB.x0 + 1, roofY - 0.5, LIB.z0 + 1], [LIB.x1 - 1, roofY, LIB.z1 - 1]);
    for (const [a, b] of [[[LIB.x0, LIB.z0], [LIB.x1, LIB.z0 + 0.4]], [[LIB.x0, LIB.z1 - 0.4], [LIB.x1, LIB.z1]], [[LIB.x0, LIB.z0], [LIB.x0 + 0.4, LIB.z1]], [[LIB.x1 - 0.4, LIB.z0], [LIB.x1, LIB.z1]]]) world.box([a[0], roofY, a[1]], [b[0], roofY + 1.1, b[1]]);
    const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.9 });
    for (const dx of [-1.3, 1.3]) { const d = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.3, 0.08), steel); d.position.set(cx + dx, 1.15, LIB.z1 + 0.06); world.scene.add(d); }
    K.shaft({ kind: 'elevator', floors: 6, label: 'LIBRARY ROOF',
      lobby: { cars: [{ pos: new THREE.Vector3(cx - 1.3, 0, LIB.z1 + 1.2), yaw: 0 }, { pos: new THREE.Vector3(cx + 1.3, 0, LIB.z1 + 1.2), yaw: 0 }] },
      tops: [{ cars: [{ pos: new THREE.Vector3(cx - 1.3, roofY, rz), yaw: 0 }, { pos: new THREE.Vector3(cx + 1.3, roofY, rz), yaw: 0 }], face: Math.PI }] });   // up top: facing south over the mall
  }

  // ---- SAC: stairs from the plaza (west glass hall) to the hall roof -------------------------------------------------------
  { const roofY = 12.45, z = (SAC.z0 + SAC.hallZ1) / 2;
    world.walkable([SAC.x0, roofY - 0.5, SAC.z0], [SAC.hallX1, roofY, SAC.hallZ1]);
    for (const [a, b] of [[[SAC.x0 - 0.35, SAC.z0 - 0.35], [SAC.hallX1, SAC.z0]], [[SAC.x0 - 0.35, SAC.hallZ1], [SAC.hallX1, SAC.hallZ1 + 0.35]], [[SAC.x0 - 0.35, SAC.z0], [SAC.x0, SAC.hallZ1]]]) world.box([a[0], roofY, a[1]], [b[0], roofY + 1.0, b[1]]);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.3, 1.3), new THREE.MeshStandardMaterial({ color: 0x3a4652, roughness: 0.5, metalness: 0.6 })); door.position.set(SAC.x0 - 0.1, 1.15, z + 6); world.scene.add(door);
    K.shaft({ kind: 'stairs', floors: 3, label: 'SAC ROOF',
      lobby: { cars: [{ pos: new THREE.Vector3(SAC.x0 - 1.3, 0, z + 6), yaw: -Math.PI / 2 }] },
      tops: [{ cars: [{ pos: new THREE.Vector3(SAC.x0 + 5, roofY, z), yaw: Math.PI / 2 }], face: Math.PI / 2 }] });   // up top: facing west over the plaza
  }

  // ---- the deli by the SAC plaza --------------------------------------------------------------------------------------------
  try {
    const spot = findDeliSpot(world, [{ x: -118, z: -26, yaw: Math.PI }, { x: -120, z: 60, yaw: Math.PI / 2 }, { x: -60, z: -24, yaw: Math.PI }, { x: 20, z: 20, yaw: 0 }], 40);
    if (spot) { const D = buildDeli(world, { ...spot, name: "SAMMY'S CAMPUS DELI", vendorName: 'SAMMY', shirt: 0x2f4a38 }); K.vendor({ name: 'SAMMY', pos: D.sammy, r: 2.3, talk: sammyTalk('SAMMY', { cousin: true }) }); W.deli = D; }
    else console.warn('[sbu] no free spot for the deli');
  } catch (e) { console.warn('[sbu] deli', e); }

  // ---- rasta dealers on the Academic Mall and around the SAC plaza ----------------------------------------------------------
  buildWalker(world, K, { name: 'RAS', tam: true, talk: rastaTalk('RAS'), shirt: 0x2e6b34, pants: 0x3c3a30, path: [[-110, 0], [-80, 2], [-40, 1], [0, -2], [40, -2], [90, 0], [130, 2]] });
  buildWalker(world, K, { name: 'IRIE', tam: true, talk: rastaTalk('IRIE'), shirt: 0xc9a52c, pants: 0x2e3a2a, skin: 0x4a2e20, path: [[-100, 40], [-112, 26], [-104, 8], [-86, 12], [-90, 30]] });
}
