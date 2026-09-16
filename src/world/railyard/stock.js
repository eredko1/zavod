// RAILYARD rolling stock: procedural boxcars (walk-through), flatcars (walkable decks, containers), tank cars, hoppers. RAILYARD agent.
import * as THREE from 'three';
import { Batch, boxGeo } from './geo.js';
import { TRACK_X, RAIL_TOP, CAR_FLOOR } from './layout.js';
import { stencilTexture } from './mats.js';

const WHEEL_R = 0.46;

/** Bogies + wheels + underframe shared by all cars. x = track centre, zc = car centre, L = body length. */
function underframe(B, x, zc, L, { world }) {
  // centre sill / underframe
  B.box('steelDark', [x - 1.35, 0.78, zc - L / 2 + 0.1], [x + 1.35, CAR_FLOOR - 0.15, zc + L / 2 - 0.1], { collide: false, uvScale: 0.6 });
  B.box('steelDark', [x - 0.45, 0.62, zc - L / 2 + 1.0], [x + 0.45, 0.8, zc + L / 2 - 1.0], { collide: false });
  for (const bz of [zc - L / 2 + 2.3, zc + L / 2 - 2.3]) {
    B.box('steel', [x - 1.25, 0.48, bz - 1.3], [x + 1.25, 0.82, bz + 1.3], { collide: false, uvScale: 0.8 });    // bogie frame
    B.box('steelDark', [x - 0.9, 0.3, bz - 1.35], [x + 0.9, 0.5, bz + 1.35], { collide: false });
    for (const wz of [bz - 0.9, bz + 0.9]) {
      // axle
      B.hcyl('steelDark', 'x', x - 1.0, x + 1.0, wz, WHEEL_R, 0.08, 8);
      for (const wx of [x - 0.75, x + 0.75]) {
        const w = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.13, 20); w.rotateZ(Math.PI / 2); w.translate(wx, WHEEL_R + RAIL_TOP - 0.02, wz);
        B.add('steelDark', w, { uv: false });
        const fl = new THREE.CylinderGeometry(WHEEL_R + 0.03, WHEEL_R + 0.03, 0.03, 20); fl.rotateZ(Math.PI / 2); fl.translate(wx + (wx < x ? -0.06 : 0.06), WHEEL_R + RAIL_TOP - 0.02, wz);
        B.add('rustSheet', fl, { uv: false });
      }
    }
  }
  // couplers + buffers
  for (const [ez, d] of [[zc - L / 2, -1], [zc + L / 2, 1]]) {
    B.box('steelDark', [x - 0.18, 0.85, ez], [x + 0.18, 1.15, ez + d * 0.6], { collide: false });
    B.box('black', [x - 0.3, 0.9, Math.min(ez + d * 0.45, ez + d * 0.7)], [x + 0.3, 1.2, Math.max(ez + d * 0.45, ez + d * 0.7)], { collide: false, uv: false });
  }
  // whole underframe collider (nobody crawls under a wagon)
  world.box([x - 1.45, 0, zc - L / 2], [x + 1.45, CAR_FLOOR, zc + L / 2]);
}

function ladder(B, x0, x1, y0, y1, z, along = 'x') {
  const n = Math.floor((y1 - y0) / 0.32);
  const rails = along === 'x' ? [[x0, z - 0.02, x0 + 0.04, z + 0.02], [x1 - 0.04, z - 0.02, x1, z + 0.02]] : [[x0 - 0.02, x1, x0 + 0.02, x1 + 0.04], [x0 - 0.02, z - 0.04, x0 + 0.02, z]];
  for (const [a, b, c, d] of rails) B.box('steelDark', [a, y0, b], [c, y1, d], { collide: false });
  for (let i = 1; i <= n; i++) {
    const y = y0 + i * 0.32;
    if (along === 'x') B.box('steelDark', [x0, y - 0.015, z - 0.015], [x1, y + 0.015, z + 0.015], { collide: false });
    else B.box('steelDark', [x0 - 0.015, y - 0.015, z], [x0 + 0.015, y + 0.015, x1], { collide: false });
  }
}

/**
 * Boxcar. opts: { mat, L=15, doors: { west:bool, east:bool } (open sides), step: 'east'|'west'|null (loading steps to the floor for AI), plate: side with a dock plate to x }.
 */
export function boxcar(B, world, x, zc, { mat = 'wagonRed', L = 15, doors = { west: false, east: false }, dockPlate = null, id = 0 } = {}) {
  const W = 1.5, H = 3.2, y0 = CAR_FLOOR, y1 = CAR_FLOOR + H, t = 0.08, doorHalf = 1.35;
  underframe(B, x, zc, L, { world });
  // floor (walkable through the doors)
  B.box('plank', [x - W, y0 - 0.12, zc - L / 2], [x + W, y0, zc + L / 2], { walkable: true, uvScale: 0.6 });
  // side walls (with door gaps), door leaves
  for (const side of ['west', 'east']) {
    const sx = side === 'west' ? -1 : 1; const wx0 = sx > 0 ? x + W - t : x - W, wx1 = sx > 0 ? x + W : x - W + t;
    const open = doors[side];
    if (open) {
      B.box(mat, [wx0, y0, zc - L / 2], [wx1, y1, zc - doorHalf], { uvScale: 0.42 });
      B.box(mat, [wx0, y0, zc + doorHalf], [wx1, y1, zc + L / 2], { uvScale: 0.42 });
      // door leaf slid open (outside the wall, over the +z half)
      const ox0 = sx > 0 ? x + W + 0.02 : x - W - 0.1, ox1 = sx > 0 ? x + W + 0.1 : x - W - 0.02;
      B.box(mat, [ox0, y0 + 0.05, zc + doorHalf + 0.1], [ox1, y1 - 0.1, zc + doorHalf + 0.1 + 2.7], { collide: true, uvScale: 0.42 });
      // door header / lintel and threshold plate
      B.box('steelDark', [wx0 - (sx > 0 ? 0 : 0.03), y1 - 0.25, zc - doorHalf], [wx1 + (sx > 0 ? 0.03 : 0), y1, zc + doorHalf], { collide: true });
      B.box('metalPlate', [wx0 - (sx > 0 ? 0.0 : 0.02), y0 - 0.02, zc - doorHalf], [wx1 + (sx > 0 ? 0.02 : 0), y0 + 0.02, zc + doorHalf], { collide: false, uvScale: 1 });
      // door track rail above
      B.box('steelDark', [sx > 0 ? x + W + 0.02 : x - W - 0.12, y1 - 0.12, zc - doorHalf - 0.2], [sx > 0 ? x + W + 0.12 : x - W - 0.02, y1 - 0.05, zc + doorHalf + 3.0], { collide: false });
    } else {
      B.box(mat, [wx0, y0, zc - L / 2], [wx1, y1, zc + L / 2], { uvScale: 0.42 });
      const ox0 = sx > 0 ? x + W + 0.02 : x - W - 0.1, ox1 = sx > 0 ? x + W + 0.1 : x - W - 0.02;
      B.box(mat, [ox0, y0 + 0.05, zc - doorHalf], [ox1, y1 - 0.1, zc + doorHalf], { collide: true, uvScale: 0.42 });
      B.box('steelDark', [sx > 0 ? x + W + 0.02 : x - W - 0.12, y1 - 0.12, zc - doorHalf - 1.6], [sx > 0 ? x + W + 0.12 : x - W - 0.02, y1 - 0.05, zc + doorHalf + 1.6], { collide: false });
    }
    // side ribs (corrugation posts)
    for (let k = -3; k <= 3; k++) {
      const rz = zc + k * (L / 7); if (Math.abs(rz - zc) < doorHalf + 0.3) continue;
      B.box('steelDark', [sx > 0 ? x + W : x - W - 0.05, y0, rz - 0.05], [sx > 0 ? x + W + 0.05 : x - W, y1 - 0.15, rz + 0.05], { collide: false });
    }
  }
  // end walls + roof (slightly peaked with a centre ridge cap)
  B.box(mat, [x - W, y0, zc - L / 2], [x + W, y1, zc - L / 2 + t], { uvScale: 0.42 });
  B.box(mat, [x - W, y0, zc + L / 2 - t], [x + W, y1, zc + L / 2], { uvScale: 0.42 });
  B.box('corrugated', [x - W - 0.08, y1, zc - L / 2 - 0.08], [x + W + 0.08, y1 + 0.1, zc + L / 2 + 0.08], { collide: true, uvScale: 0.6 });
  B.box('corrugated', [x - 0.8, y1 + 0.1, zc - L / 2], [x + 0.8, y1 + 0.2, zc + L / 2], { collide: false, uvScale: 0.6 });
  // ladder + brake wheel at the +z end
  ladder(B, x + W - 0.5, x + W - 0.1, y0 + 0.2, y1 + 0.1, zc + L / 2 + 0.06, 'x');
  const bw = new THREE.TorusGeometry(0.28, 0.025, 6, 16); bw.translate(x - 0.9, y0 + 1.4, zc + L / 2 + 0.16); B.add('steelDark', bw, { uv: false });
  B.box('steelDark', [x - 0.92, y0 + 0.3, zc + L / 2], [x - 0.88, y0 + 1.4, zc + L / 2 + 0.16], { collide: false });
  // dock plate (bridge to the platform) — walkable
  if (dockPlate) {
    const [px0, px1] = dockPlate; const lo = Math.min(px0, px1), hi = Math.max(px0, px1);
    B.box('metalPlate', [lo, CAR_FLOOR - 0.06, zc - 1.0], [hi, CAR_FLOOR + 0.0, zc + 1.0], { walkable: true, uvScale: 1 });
  }
  // cover on both ends of the car
  world.cover(x, zc - L / 2 - 1.2, 0, -1); world.cover(x, zc + L / 2 + 1.2, 0, 1);
  world.cover(x - W - 1.0, zc - L / 4, -1, 0); world.cover(x + W + 1.0, zc + L / 4, 1, 0);
}

/** Flatcar with optional containers: cargo = [{ z: offset, len: 6.06|12.19, mat }] */
export function flatcar(B, world, x, zc, { L = 15, cargo = [], deck = 'metalPlate', stakes = true } = {}) {
  const W = 1.5;
  underframe(B, x, zc, L, { world });
  B.box(deck, [x - W, CAR_FLOOR - 0.14, zc - L / 2], [x + W, CAR_FLOOR, zc + L / 2], { walkable: true, uvScale: 0.6 });
  B.box('steelDark', [x - W - 0.03, CAR_FLOOR - 0.28, zc - L / 2], [x + W + 0.03, CAR_FLOOR - 0.12, zc + L / 2], { collide: false });
  if (stakes) for (let k = -3; k <= 3; k++) for (const sx of [-W - 0.02, W - 0.1]) B.box('steelDark', [x + sx, CAR_FLOOR, zc + k * 2.1 - 0.06], [x + sx + 0.12, CAR_FLOOR + 0.35, zc + k * 2.1 + 0.06], { collide: false });
  for (const c of cargo) {
    const cw = 1.22, ch = 2.59, cl = c.len; const z0 = zc + c.z - cl / 2, z1 = zc + c.z + cl / 2;
    B.box(c.mat, [x - cw, CAR_FLOOR, z0], [x + cw, CAR_FLOOR + ch, z1], { uvScale: 0.41 });
    // corner castings, door bars on the +z end
    for (const [cx, cz] of [[x - cw, z0], [x + cw - 0.18, z0], [x - cw, z1 - 0.18], [x + cw - 0.18, z1 - 0.18]]) B.box('steelDark', [cx, CAR_FLOOR, cz], [cx + 0.18, CAR_FLOOR + 0.25, cz + 0.18], { collide: false });
    for (const bx of [-0.75, -0.25, 0.25, 0.75]) B.box('steelDark', [x + bx - 0.03, CAR_FLOOR + 0.2, z1], [x + bx + 0.03, CAR_FLOOR + ch - 0.2, z1 + 0.05], { collide: false });
    world.cover(x, z0 - 1.0, 0, -1); world.cover(x, z1 + 1.0, 0, 1);
  }
  if (!cargo.length) { world.cover(x - W - 1.0, zc, -1, 0); world.cover(x + W + 1.0, zc, 1, 0); }
}

/** Tank car: cylindrical tank on saddles, top walkway + dome, end ladder. */
export function tankcar(B, world, x, zc, { L = 13, mat = 'wagonGreen', domeMat = 'steel' } = {}) {
  const r = 1.45, cy = CAR_FLOOR + 0.05 + r, tl = L - 1.6;
  underframe(B, x, zc, L, { world });
  // frame ends + saddles
  B.box('steelDark', [x - 1.4, CAR_FLOOR - 0.1, zc - L / 2], [x + 1.4, CAR_FLOOR + 0.12, zc - L / 2 + 1.6], { collide: false, uvScale: 0.6 });
  B.box('steelDark', [x - 1.4, CAR_FLOOR - 0.1, zc + L / 2 - 1.6], [x + 1.4, CAR_FLOOR + 0.12, zc + L / 2], { collide: false, uvScale: 0.6 });
  for (const sz of [zc - tl / 2 + 0.8, zc + tl / 2 - 0.8]) B.box('steelDark', [x - 1.3, CAR_FLOOR, sz - 0.35], [x + 1.3, cy - 0.6, sz + 0.35], { collide: false, uvScale: 0.6 });
  B.hcyl(mat, 'z', zc - tl / 2, zc + tl / 2, x, cy, r, 28, { uvScale: 0.32 });
  for (const ez of [zc - tl / 2, zc + tl / 2]) {
    const cap = new THREE.SphereGeometry(r, 28, 14); cap.scale(1, 1, 0.42); cap.translate(x, cy, ez); B.add(mat, cap, { uvScale: 0.32 });
  }
  // top walkway, dome, hand rails, ladder
  B.box('grid', [x - 0.45, cy + r - 0.02, zc - tl / 2 + 0.6], [x + 0.45, cy + r + 0.04, zc + tl / 2 - 0.6], { collide: false, uvScale: 1 });
  B.cyl(domeMat, x, zc, cy + r - 0.2, cy + r + 0.45, 0.55, 18); B.cyl('steelDark', x, zc, cy + r + 0.45, cy + r + 0.52, 0.62, 18);
  for (const sx of [-0.6, 0.6]) {
    B.box('steelDark', [x + sx - 0.02, cy + r, zc - tl / 2 + 0.6], [x + sx + 0.02, cy + r + 0.9, zc + tl / 2 - 0.6], { collide: false });
    for (let k = -2; k <= 2; k++) B.box('steelDark', [x + sx - 0.02, cy + r, zc + k * 2.5 - 0.02], [x + sx + 0.02, cy + r + 0.9, zc + k * 2.5 + 0.02], { collide: false });
  }
  ladder(B, x + 0.3, x + 0.7, CAR_FLOOR + 0.1, cy + r, zc + tl / 2 + 0.5, 'x');
  world.box([x - r, CAR_FLOOR, zc - L / 2], [x + r, cy + r + 0.05, zc + L / 2]);
  world.cover(x - r - 0.9, zc, -1, 0); world.cover(x + r + 0.9, zc, 1, 0); world.cover(x, zc - L / 2 - 1.2, 0, -1); world.cover(x, zc + L / 2 + 1.2, 0, 1);
}

/** Open-top hopper: ribbed body, sloped hopper bottoms, gravel load. */
export function hopper(B, world, x, zc, { L = 12.5, mat = 'wagonRust', load = 'ballast' } = {}) {
  const W = 1.5, y0 = CAR_FLOOR + 0.35, y1 = CAR_FLOOR + 3.1;
  underframe(B, x, zc, L, { world });
  B.box(mat, [x - W, y0, zc - L / 2 + 0.2], [x - W + 0.08, y1, zc + L / 2 - 0.2], { uvScale: 0.42 });
  B.box(mat, [x + W - 0.08, y0, zc - L / 2 + 0.2], [x + W, y1, zc + L / 2 - 0.2], { uvScale: 0.42 });
  B.box(mat, [x - W, y0, zc - L / 2 + 0.2], [x + W, y1, zc - L / 2 + 0.28], { uvScale: 0.42 });
  B.box(mat, [x - W, y0, zc + L / 2 - 0.28], [x + W, y1, zc + L / 2 - 0.2], { uvScale: 0.42 });
  // top chord + ribs
  B.box('steelDark', [x - W - 0.06, y1 - 0.12, zc - L / 2 + 0.14], [x + W + 0.06, y1 + 0.02, zc + L / 2 - 0.14], { collide: false });
  for (let k = -4; k <= 4; k++) { const rz = zc + k * (L - 1) / 8; for (const sx of [-W - 0.06, W]) B.box('steelDark', [x + sx, y0 - 0.05, rz - 0.05], [x + sx + 0.06, y1, rz + 0.05], { collide: false }); }
  // hopper bays (tapered): pyramid frustums under the body
  for (const hz of [zc - L / 3, zc, zc + L / 3]) {
    const g = new THREE.CylinderGeometry(2.12, 0.57, 0.9, 4, 1); g.rotateY(Math.PI / 4); g.scale(1.0, 1, (L / 3 - 0.3) / 3.0); g.translate(x, CAR_FLOOR - 0.1, hz);
    B.add(mat, g, { uvScale: 0.42 });
  }
  // load (heaped gravel)
  B.box(load, [x - W + 0.1, y1 - 0.55, zc - L / 2 + 0.3], [x + W - 0.1, y1 - 0.25, zc + L / 2 - 0.3], { collide: false, uvScale: 0.7 });
  const heap = new THREE.CylinderGeometry(0.2, 1.3, 0.55, 5, 1); heap.scale(1, 1, (L - 1.2) / 2.6); heap.translate(x, y1 - 0.25 + 0.27, zc); B.add(load, heap, { uvScale: 0.7 });
  ladder(B, x - W + 0.1, x - W + 0.5, CAR_FLOOR + 0.2, y1, zc - L / 2 + 0.14, 'x');
  world.box([x - W - 0.06, CAR_FLOOR, zc - L / 2], [x + W + 0.06, y1 + 0.02, zc + L / 2]);
  world.cover(x - W - 1.0, zc, -1, 0); world.cover(x + W + 1.0, zc, 1, 0); world.cover(x, zc - L / 2 - 1.2, 0, -1); world.cover(x, zc + L / 2 + 1.2, 0, 1);
}

/** Stencilled reporting marks on wagon sides (decal planes, no colliders). */
function markings(world, M, list) {
  const { scene, R } = world;
  const tex = stencilTexture({ text: 'RZD  24-7731  •  60t', R });
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const geos = [];
  for (const { x, y, z, side, w } of list) {
    const g = new THREE.PlaneGeometry(w, w / 4); g.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2); g.translate(x + side * 0.011, y, z);
    geos.push(g);
  }
  if (!geos.length) return;
  const pos = [], uv = [], nor = [];
  for (const g of geos) { const n = g.toNonIndexed(); pos.push(...n.attributes.position.array); uv.push(...n.attributes.uv.array); nor.push(...n.attributes.normal.array); }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); mg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); mg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  const mesh = new THREE.Mesh(mg, mat); mesh.name = 'stock:markings'; mesh.renderOrder = 2; scene.add(mesh);
}

export function buildStock(world, M) {
  const B = new Batch(world, M, 'stock');
  const T = TRACK_X; const marks = [];
  const mark = (x, zc, y = CAR_FLOOR + 2.4) => { marks.push({ x: x + 1.5, y, z: zc - 4.2, side: 1, w: 3.2 }); marks.push({ x: x - 1.5, y, z: zc - 4.2, side: -1, w: 3.2 }); };

  // T0 (x=-27): boxcar string, one car open both sides (walk-through lane between T0/T1 and the west edge)
  const t0 = [[-50, 'wagonRust', { west: false, east: false }], [-34.2, 'wagonRed', { west: false, east: true }], [-18.4, 'wagonGreen', { west: true, east: true }], [-2.6, 'wagonRed', { west: false, east: false }], [13.2, 'wagonBlue', { west: true, east: true }]];
  for (const [z, mat, doors] of t0) { boxcar(B, world, T[0], z, { mat, doors }); mark(T[0], z); }
  // T1 (x=-21.5): hoppers south, a tank car north under the overpass
  for (const z of [24, 37.5, 51]) hopper(B, world, T[1], z, { mat: z === 37.5 ? 'wagonRed' : 'wagonRust' });
  tankcar(B, world, T[1], -45, { mat: 'wagonBlue' });
  // T2 (x=-16): tank car string north
  for (const [z, mat] of [[-52, 'wagonGreen'], [-38.5, 'wagonRust'], [-25, 'wagonGreen'], [-11.5, 'wagonBlue']]) tankcar(B, world, T[2], z, { mat });
  // T3 (x=-10.5): main open lane — empty
  // T4 (x=-5): flatcars, mixed containers, two empty decks
  flatcar(B, world, T[4], -30, { cargo: [{ z: 0, len: 12.19, mat: 'contMaroon' }] });
  flatcar(B, world, T[4], -14.2, { cargo: [] });
  flatcar(B, world, T[4], 1.6, { cargo: [{ z: -3.6, len: 6.06, mat: 'contOrange' }, { z: 3.6, len: 6.06, mat: 'contBlue' }] });
  flatcar(B, world, T[4], 17.4, { cargo: [], deck: 'plank' });
  flatcar(B, world, T[4], 33.2, { cargo: [{ z: 2.5, len: 6.06, mat: 'contGreen' }] });
  // T5 (x=0.5): boxcars south string + two north under/behind the overpass; gap in the middle = crossing lane
  for (const [z, mat, doors] of [[25, 'wagonRed', { west: true, east: false }], [40.8, 'wagonRust', { west: false, east: false }], [56.6, 'wagonGreen', { west: false, east: true }], [-40, 'wagonBlue', { west: true, east: true }], [-55.8, 'wagonRed', { west: false, east: false }]]) { boxcar(B, world, T[5], z, { mat, doors }); mark(T[5], z); }
  // T6 (x=6): service lane — one lone tank car far north
  tankcar(B, world, T[6], -56, { mat: 'wagonRust' });
  // T7 (x=13.5): boxcars along the platform, platform-side doors open with dock plates
  const plate = [15.0, 17.05];
  for (const [z, mat, both] of [[-26, 'wagonGreen', false], [-10.2, 'wagonRed', true], [12, 'wagonBlue', true], [27.8, 'wagonRust', false]]) {
    boxcar(B, world, T[7], z, { mat, doors: { west: both, east: true }, dockPlate: plate }); mark(T[7], z);
  }

  B.flush();
  markings(world, M, marks);
}
