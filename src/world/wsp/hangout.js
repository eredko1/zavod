// CITY SQUARE hangout (wsp): the same friends loop as Coney on the hangkit — a deli with its own Sammy, rasta dealers walking
// the park paths selling bags, the hidden staircase in the arch's west pier up to the attic roof, the library elevator to its
// roof (the whole square below), and cars parked along the streets to steal. WSP agent.
import * as THREE from 'three';
import { buildKit, hangkit as K, kitQA } from '../hangkit.js';
import { buildDeli, findDeliSpot, sammyTalk, buildWalker, rastaTalk } from '../deli.js';
import { placeCars } from '../carkit.js';
import { ARCH, BUILDINGS, STREETS, BOUNDS, PARK } from './layout.js';

export function buildWspHangout(world) {
  const { ctx, W } = world;
  buildKit(world, { cash: 20, title: 'CITY SQUARE — CONTROLS',
    help: 'F · talk (Sammy, the Ras) / stairs / elevator / steal car / hop in<br>B · blaze or drink (stand close to share)<br>Rastas walk the park paths selling bags ($10)<br>Sammy\'s deli is on the streets round the square<br>Arch: hidden stairs in the west pier door<br>Library: elevator to the roof on its park side<br>Mercs drop cash — walk over it',
    respawn: { label: 'the Fountain', at: () => W.onlineStart } });
  if (typeof window !== 'undefined' && window.__game) window.__game.hangout = kitQA;

  // ---- the arch: hidden staircase behind the little door in the west pier's west face → the attic roof ------------------
  const A = ARCH, xW0 = A.cx - A.width / 2;
  K.shaft({ kind: 'stairs', label: 'ARCH ROOF', floors: 2,
    lobby: { cars: [{ pos: new THREE.Vector3(xW0 - 0.9, 0, A.cz), yaw: -Math.PI / 2 }] },
    tops: [{ cars: [{ pos: new THREE.Vector3(A.cx + 3.5, A.height, A.cz + 1.2), yaw: 0 }], face: Math.PI }] });   // up top: facing south over the fountain

  // ---- the library (12 storeys): elevator lobby on the park (north) face → walkable roof with a parapet ------------------
  const lib = BUILDINGS.find((b) => b.id === 'library');
  if (lib) {
    const roofY = lib.h, cx = (lib.x0 + lib.x1) / 2;
    world.walkable([lib.x0 + 0.3, roofY - 0.5, lib.z0 + 0.3], [lib.x1 - 0.3, roofY, lib.z1 - 0.3]);
    for (const [a, b] of [[[lib.x0, lib.z0], [lib.x1, lib.z0 + 0.4]], [[lib.x0, lib.z1 - 0.4], [lib.x1, lib.z1]], [[lib.x0, lib.z0], [lib.x0 + 0.4, lib.z1]], [[lib.x1 - 0.4, lib.z0], [lib.x1, lib.z1]]]) world.box([a[0], roofY, a[1]], [b[0], roofY + 1.1, b[1]]);
    // elevator doors on the facade (two brushed-steel panels) so the call point reads
    const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.9 });
    for (const dx of [-1.3, 1.3]) { const d = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.3, 0.08), steel); d.position.set(cx + dx, 1.15 + 0.9, lib.z0 - 0.05); world.scene.add(d); }
    const lit = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18), new THREE.MeshBasicMaterial({ color: 0xffb24a })); lit.position.set(cx, 3.5 + 0.9, lib.z0 - 0.1); lit.rotation.y = Math.PI; world.scene.add(lit);
    K.shaft({ kind: 'elevator', floors: 12, label: 'LIBRARY ROOF',
      lobby: { cars: [{ pos: new THREE.Vector3(cx - 1.3, 0.9, lib.z0 - 1.2), yaw: Math.PI }, { pos: new THREE.Vector3(cx + 1.3, 0.9, lib.z0 - 1.2), yaw: Math.PI }] },
      tops: [{ cars: [{ pos: new THREE.Vector3(cx - 1.3, roofY, lib.z0 + 3), yaw: Math.PI }, { pos: new THREE.Vector3(cx + 1.3, roofY, lib.z0 + 3), yaw: Math.PI }], face: 0 }] });   // arrive facing north over the park
  }

  // ---- the deli: a storefront on a street round the square (first free frontage) ----------------------------------------
  try {
    const spot = findDeliSpot(world, [
      { x: -14, z: 90, yaw: 0 },    // Cooper St, south of the park, front facing north onto Park Row South
      { x: 58, z: 90, yaw: 0 }, { x: -90, z: 90, yaw: 0 }, { x: -140, z: 90, yaw: 0 },
      { x: -40, z: -92, yaw: Math.PI }, { x: 60, z: -92, yaw: Math.PI },   // north side, facing south
      { x: 150, z: 0, yaw: -Math.PI / 2 },                                     // east
    ], 36, { exclude: [{ x0: PARK.x0 - 2, x1: PARK.x1 + 2, z0: PARK.z0 - 2, z1: PARK.z1 + 2 }] });
    if (spot) {
      const D = buildDeli(world, { ...spot, name: "SAMMY'S DELI & GROCERY", vendorName: 'SAMMY', shirt: 0x5a2f2f, glasses: true });
      K.vendor({ name: 'SAMMY', pos: D.sammy, r: 2.3, talk: sammyTalk('SAMMY', { cousin: true }) });
      world.W.deli = D;
    } else console.warn('[wsp] no free frontage for the deli');
  } catch (e) { console.warn('[wsp] deli', e); }

  // ---- rasta dealers walking the park paths ------------------------------------------------------------------------------
  buildWalker(world, K, { name: 'RAS', tam: true, talk: rastaTalk('RAS'), shirt: 0x7a2a22, pants: 0x3c3a30,
    path: [[-20, 22], [-26, 12], [-28, 0], [-60, -1], [-77, -1], [-100, 18], [-118, 33], [-130, 43]] });   // fountain rim → west walk → chess corner
  buildWalker(world, K, { name: 'JAH-B', tam: true, talk: rastaTalk('JAH-B'), shirt: 0xd6b23a, pants: 0x2e3a2a, skin: 0x4a2e20,
    path: [[24, -18], [32, 1], [57, 1], [69, 8], [88, 26], [104, 44], [70, 62], [40, 57], [30, 30]] });     // east lawns loop

  // ---- the map (src/minimap.js): street names + points of interest ------------------------------------------------------------
  W.mapLabels = STREETS.filter((st) => !st.cobble).map((st) => st.axis === 'x' ? { t: st.name.toUpperCase(), x: Math.max(st.a0, BOUNDS.x0 + 60) + 40, z: (st.r0 + st.r1) / 2 } : { t: st.name.toUpperCase(), x: (st.r0 + st.r1) / 2, z: Math.max(st.a0, BOUNDS.z0 + 30) + 30, r: Math.PI / 2 });
  W.mapPOIs = [...(W.mapPOIs || []), { name: 'MEMORIAL ARCH (hidden stairs)', x: A.cx, z: A.cz, kind: 'landmark' }, { name: 'FOUNTAIN', x: 0, z: 0, kind: 'park' },
    ...(lib ? [{ name: 'LIBRARY (roof elevator)', x: (lib.x0 + lib.x1) / 2, z: lib.z0, kind: 'landmark' }] : []),
    ...(W.deli ? [{ name: "SAMMY'S DELI", x: W.deli.door.x, z: W.deli.door.z, kind: 'shop' }] : [])];

  // ---- cars parked along the kerbs (stealable) ---------------------------------------------------------------------------
  try { parkCars(world); } catch (e) { console.warn('[wsp] cars', e); }
}

function parkCars(world) {
  const R = world.R || Math.random, cols = world.ctx.colliders, cars = [];
  const crossing = (s, a) => STREETS.some((o) => o !== s && o.axis !== s.axis && a > o.r0 - 7 && a < o.r1 + 7);
  const free = (x, z, hx, hz) => !cols.some((b) => x + hx > b.min.x && x - hx < b.max.x && z + hz > b.min.z && z - hz < b.max.z && b.max.y > 0.3 && b.min.y < 1.5);
  for (const s of STREETS) {
    if (s.cobble || s.id === 'arch') continue;
    for (const side of [0, 1]) {
      const c = side ? s.r1 - 1.25 : s.r0 + 1.25;
      for (let a = Math.max(s.a0, s.axis === 'x' ? BOUNDS.x0 : BOUNDS.z0) + 6; a < Math.min(s.a1, s.axis === 'x' ? BOUNDS.x1 : BOUNDS.z1) - 6; a += 6.4) {
        if (crossing(s, a) || R() < 0.45) continue;
        const [x, z] = s.axis === 'x' ? [a, c] : [c, a]; const [hx, hz] = s.axis === 'x' ? [2.4, 1.0] : [1.0, 2.4];
        if (!free(x, z, hx, hz)) continue;
        const dd = world.W.deli?.door; if (dd && Math.hypot(x - dd.x, z - dd.z) < 7) continue;   // keep the kerb outside the deli door clear
        const flow = s.oneway || (side ? 1 : -1);   // cars face the traffic direction on their side
        cars.push({ x, z, ry: s.axis === 'x' ? (flow > 0 ? 0 : Math.PI) : (flow > 0 ? -Math.PI / 2 : Math.PI / 2), kind: ['sedan', 'sedan', 'suv', 'hatch', 'cab', 'van'][(R() * 6) | 0], hx, hz });
      }
    }
  }
  placeCars(world, cars, { raycast: false });
  for (const c of cars) c.box = world.box([c.x - c.hx, 0, c.z - c.hz], [c.x + c.hx, 1.5, c.z + c.hz]);
  console.log('[wsp] parked cars', cars.length);
}
