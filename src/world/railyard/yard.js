// RAILYARD yard dressing: fuel depot, signal gantries, catenary masts + wires, chain-link perimeter with gates, sleeper/rail stacks, distant skyline. RAILYARD agent.
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { Batch, slopedBox, worldUV } from './geo.js';
import { TRACK_X, TRACK_Z0, TRACK_Z1, DEPOT, FENCE, OFFICE, ROAD_E, ROAD_W, SLEEPER_TOP, RAIL_TOP } from './layout.js';
import { chainlinkTexture, barbedTexture } from '../mats.js';

export function buildYard(world, M) {
  const B = new Batch(world, M, 'yard');
  buildDepot(B, world, M);
  buildGantries(B, world, M);
  buildCatenary(B, world, M);
  buildStacks(B, world, M);
  buildClutter(B, world, M);
  buildFencePosts(B, world, M);
  B.flush();
  buildFenceMesh(world, M);
  buildDistant(world, M);
}

// ---- fuel depot (SW) ------------------------------------------------------------------------------------------------
function buildDepot(B, world, M) {
  const D = DEPOT; const bx0 = -60, bx1 = -40, bz0 = 30, bz1 = 56; const bh = 1.0, bt = 0.3;
  // bund wall with gaps on the east side (z 42..44.4) and north side (x -48.2..-45.8)
  B.box('concreteWall', [bx0, 0, bz0], [bx1, bh, bz0 + bt], { uvScale: 0.5 });
  B.box('concreteWall', [bx0, 0, bz1 - bt], [bx1, bh, bz1], { uvScale: 0.5 });
  B.box('concreteWall', [bx0, 0, bz0], [bx0 + bt, bh, bz1], { uvScale: 0.5 });
  B.box('concreteWall', [bx1 - bt, 0, bz0], [bx1, bh, 42], { uvScale: 0.5 }); B.box('concreteWall', [bx1 - bt, 0, 44.4], [bx1, bh, bz1], { uvScale: 0.5 });
  B.box('concrete', [bx0, 0, bz0], [bx1, 0.08, bz1], { collide: false, uvScale: 0.4 });
  // three horizontal tanks on concrete saddles
  const tanks = [[-56.2, 'wagonGreen'], [-50, 'contGrey'], [-43.8, 'rustPlate']];
  for (const [x, mat] of tanks) {
    const r = 1.9, cy = 0.9 + r, z0 = 33, z1 = 45;
    for (const sz of [z0 + 1.6, z1 - 1.6]) B.box('concreteWall', [x - 1.5, 0, sz - 0.5], [x + 1.5, cy - 1.0, sz + 0.5], { uvScale: 0.5 });
    B.hcyl(mat, 'z', z0, z1, x, cy, r, 28, { uvScale: 0.3 });
    for (const ez of [z0, z1]) { const cap = new THREE.SphereGeometry(r, 28, 14); cap.scale(1, 1, 0.35); cap.translate(x, cy, ez); B.add(mat, cap, { uvScale: 0.3 }); }
    B.box('grid', [x - 0.5, cy + r - 0.02, z0 + 1], [x + 0.5, cy + r + 0.04, z1 - 1], { collide: false, uvScale: 1 });
    for (const sx of [-0.6, 0.6]) B.box('steelDark', [x + sx - 0.02, cy + r, z0 + 1], [x + sx + 0.02, cy + r + 0.9, z1 - 1], { collide: false });
    B.cyl('steelDark', x, (z0 + z1) / 2, cy + r - 0.1, cy + r + 0.5, 0.35, 12);
    // pipework down to the manifold
    B.hcyl('steelDark', 'x', x - 0.2, x + 0.2, 47, 1.0, 0.12, 10);
    B.cyl('steelDark', x, z1 + 0.6, 0.3, cy, 0.12, 10);
    B.hcyl('steelDark', 'z', z1 + 0.6, 48.2, x, 1.0, 0.12, 10);
    world.box([x - r, 0, z0 - 0.7], [x + r, cy + r + 0.5, z1 + 0.7]);
    world.cover(x - r - 1.0, 39, -1, 0); world.cover(x + r + 1.0, 39, 1, 0);
  }
  // manifold: header pipe with valves along z=48.2
  B.hcyl('steelDark', 'x', -58.5, -41.5, 48.2, 1.0, 0.16, 12, { collide: true });
  for (const x of [-56.2, -50, -43.8, -47, -53]) { B.cyl('yellow', x, 48.2, 1.1, 1.5, 0.1, 8); B.cyl('yellow', x, 48.2, 1.5, 1.56, 0.32, 12); }
  // vertical storage tank with helical stair suggestion (ring platform + ladder) and a low conical roof
  const vx = -50, vz = 51.5, vr = 3.6, vh = 8.5;
  B.cyl('paintedConcrete', vx, vz, 0, 0.4, vr + 0.5, 36);
  B.cyl('rustPlate', vx, vz, 0.4, vh, vr, 36, { uvScale: 0.3 });
  const cone = new THREE.CylinderGeometry(0.6, vr + 0.15, 1.0, 36); cone.translate(vx, vh + 0.5, vz); B.add('steelDark', cone, { uvScale: 0.3 });
  const ring = new THREE.TorusGeometry(vr + 0.6, 0.04, 6, 48); ring.rotateX(Math.PI / 2); ring.translate(vx, vh + 0.9, vz); B.add('steelDark', ring, { uv: false });
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; B.box('steelDark', [vx + Math.cos(a) * (vr + 0.6) - 0.02, vh, vz + Math.sin(a) * (vr + 0.6) - 0.02], [vx + Math.cos(a) * (vr + 0.6) + 0.02, vh + 0.95, vz + Math.sin(a) * (vr + 0.6) + 0.02], { collide: false }); }
  const walk = new THREE.RingGeometry(vr, vr + 0.7, 36); walk.rotateX(-Math.PI / 2); walk.translate(vx, vh, vz); B.add('grid', walk, { uvScale: 1 });
  for (let i = 0; i < 26; i++) { const y = 0.5 + i * 0.32; B.box('steelDark', [vx + vr - 0.05, y, vz - 0.25], [vx + vr + 0.25, y + 0.03, vz + 0.25], { collide: false }); }
  for (const sz of [-0.25, 0.25]) B.box('steelDark', [vx + vr + 0.2, 0.4, vz + sz - 0.02], [vx + vr + 0.25, vh + 1.0, vz + sz + 0.02], { collide: false });
  world.box([vx - vr - 0.5, 0, vz - vr - 0.5], [vx + vr + 0.5, vh + 1.0, vz + vr + 0.5]);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; world.cover(vx + Math.cos(a) * (vr + 1.4), vz + Math.sin(a) * (vr + 1.4), Math.cos(a), Math.sin(a)); }
  // pump house (brick) with corrugated roof, door facing the tanks, gauge panel
  const px0 = -39, px1 = -34, pz0 = 34, pz1 = 38.5, ph = 3.1;
  B.box('brickDark', [px0, 0, pz0], [px0 + 0.3, ph, pz1], { uvScale: 0.42 }); B.box('brickDark', [px1 - 0.3, 0, pz0], [px1, ph, pz1], { uvScale: 0.42 });
  B.box('brickDark', [px0, 0, pz0], [px1, ph, pz0 + 0.3], { uvScale: 0.42 });
  B.box('brickDark', [px0, 0, pz1 - 0.3], [px0 + 1.6, ph, pz1], { uvScale: 0.42 }); B.box('brickDark', [px0 + 2.8, 0, pz1 - 0.3], [px1, ph, pz1], { uvScale: 0.42 }); B.box('brickDark', [px0 + 1.6, 2.2, pz1 - 0.3], [px0 + 2.8, ph, pz1], { uvScale: 0.42 });
  B.add('corrugated', slopedBox([px0 - 0.4, ph, pz0 - 0.4], [px1 + 0.4, ph + 0.9, pz1 + 0.4], 'x', { topA0: ph + 0.9, topA1: ph + 0.2, botA0: ph + 0.75, botA1: ph + 0.05 }), { uvScale: 0.6 });
  world.box([px0 - 0.4, ph, pz0 - 0.4], [px1 + 0.4, ph + 0.9, pz1 + 0.4]);
  B.box('concrete', [px0, 0, pz0], [px1, 0.05, pz1], { collide: false, uvScale: 0.4 });
  B.box('steel', [px0 + 0.4, 0.05, pz0 + 0.5], [px0 + 1.8, 1.1, pz0 + 1.6], { uvScale: 1 }); B.cyl('steelDark', px0 + 1.1, pz0 + 1.05, 1.1, 1.5, 0.25, 12);
  world.cover(px0 - 1.2, 36, -1, 0); world.cover(px1 + 1.2, 36, 1, 0); world.cover(px0 + 2.2, pz1 + 1.3, 0, 1);
  // fuel island by the road end: canopy + two bowsers + bollards
  const fx = -48.5, fz = 27.5;
  for (const dx of [-3.2, 3.2]) B.box('steelDark', [fx + dx - 0.15, 0, fz - 0.15], [fx + dx + 0.15, 4.2, fz + 0.15], { uvScale: 1 });
  B.box('corrugated', [fx - 5, 4.2, fz - 2.6], [fx + 5, 4.4, fz + 2.6], { uvScale: 0.6 }); B.box('white', [fx - 5.05, 3.85, fz - 2.65], [fx + 5.05, 4.25, fz - 2.55], { collide: false, uv: false });
  for (const dx of [-1.6, 1.6]) { B.box('white', [fx + dx - 0.45, 0, fz - 0.3], [fx + dx + 0.45, 1.7, fz + 0.3], { uvScale: 1 }); B.box('black', [fx + dx - 0.35, 0.9, fz - 0.32], [fx + dx + 0.35, 1.5, fz - 0.29], { collide: false, uv: false }); world.cover(fx + dx, fz - 1.3, 0, -1); world.cover(fx + dx, fz + 1.3, 0, 1); }
  B.box('concrete', [fx - 2.6, 0, fz - 0.9], [fx + 2.6, 0.18, fz + 0.9], { uvScale: 0.5 });
  for (const dx of [-2.9, 2.9]) B.cyl('yellow', fx + dx, fz, 0, 1.0, 0.12, 10, { collide: true });
}

// ---- signal gantries spanning the tracks -----------------------------------------------------------------------------
function buildGantries(B, world, M) {
  for (const [z, facing] of [[-57, 1], [42, -1]]) {
    const xa = -30, xb = 16.5, h = 7.6;
    for (const x of [xa, xb]) {
      // lattice column: 4 corner angles + diagonals
      for (const [dx, dz] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) B.box('steelDark', [x + dx - 0.05, 0, z + dz - 0.05], [x + dx + 0.05, h, z + dz + 0.05], { collide: false });
      for (let y = 0.6; y < h - 0.6; y += 1.2) {
        for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(0.05, 1.35, 0.05); g.rotateZ(s * 0.6); g.translate(x, y + 0.6, z + s * 0.35); B.add('steelDark', g, { uv: false }); const g2 = new THREE.BoxGeometry(0.05, 1.35, 0.05); g2.rotateX(s * 0.6); g2.translate(x + s * 0.35, y + 0.6, z); B.add('steelDark', g2, { uv: false }); }
      }
      B.box('concreteWall', [x - 0.7, 0, z - 0.7], [x + 0.7, 0.6, z + 0.7], { uvScale: 0.5 });
      world.box([x - 0.45, 0, z - 0.45], [x + 0.45, h, z + 0.45]);
      world.cover(x - 1.0, z, -1, 0); world.cover(x + 1.0, z, 1, 0);
    }
    // beam (two chords + lattice), catwalk grating + hand rail
    B.box('steelDark', [xa, h - 0.8, z - 0.45], [xb, h - 0.65, z + 0.45], { collide: false }); B.box('steelDark', [xa, h - 0.15, z - 0.45], [xb, h, z + 0.45], { collide: false });
    for (let x = xa + 0.5; x < xb - 0.5; x += 1.0) { const g = new THREE.BoxGeometry(0.05, 0.9, 0.05); g.rotateZ(0.7); g.translate(x + 0.4, h - 0.4, z - 0.42); B.add('steelDark', g, { uv: false }); const g2 = g.clone(); g2.translate(0, 0, 0.84); B.add('steelDark', g2, { uv: false }); }
    B.box('grid', [xa, h - 0.65, z - 0.4], [xb, h - 0.6, z + 0.4], { collide: false, uvScale: 1 });
    B.box('steelDark', [xa, h + 0.45, z + facing * 0.45 - 0.02], [xb, h + 0.5, z + facing * 0.45 + 0.02], { collide: false });
    // signal heads over each track, facing approaching trains
    for (let i = 0; i < TRACK_X.length; i++) {
      const tx = TRACK_X[i]; const y0 = h - 2.1;
      B.box('steelDark', [tx - 0.06, y0, z - 0.06], [tx + 0.06, h - 0.8, z + 0.06], { collide: false });
      B.box('black', [tx - 0.3, y0 - 0.1, z - 0.18], [tx + 0.3, y0 + 1.4, z + 0.18], { collide: false, uv: false });
      B.box('black', [tx - 0.42, y0 + 1.4, z - 0.2 + (facing > 0 ? 0 : 0.1)], [tx + 0.42, y0 + 1.5, z + 0.2 + (facing > 0 ? 0.3 : 0)], { collide: false, uv: false }); // hood
      const zf = z - facing * 0.19;
      const lit = (i * 7 + z) % 3 === 0 ? 'lampGreen' : 'lampRed';
      B.box(lit, [tx - 0.16, y0 + 0.95, Math.min(zf, zf - facing * 0.02)], [tx + 0.16, y0 + 1.27, Math.max(zf, zf - facing * 0.02)], { collide: false, uv: false });
      B.box('black', [tx - 0.16, y0 + 0.45, Math.min(zf, zf - facing * 0.02)], [tx + 0.16, y0 + 0.77, Math.max(zf, zf - facing * 0.02)], { collide: false, uv: false });
      B.box('white', [tx - 0.2, y0 - 0.02, Math.min(zf, zf - facing * 0.01)], [tx + 0.2, y0 + 0.28, Math.max(zf, zf - facing * 0.01)], { collide: false, uv: false }); // number plate
    }
  }
}

// ---- catenary masts + contact wires over tracks 3–6 -------------------------------------------------------------------
function buildCatenary(B, world, M) {
  const wireY = 6.0;
  const masts = [];
  for (let z = -55; z <= 55; z += 22) masts.push([-31.5, z, 1]);
  for (let z = -44; z <= 55; z += 22) masts.push([9.8, z, -1]);
  for (const [x, z, dir] of masts) {
    // H-section mast: two flanges + web
    B.box('steelDark', [x - 0.16, 0, z - 0.2], [x + 0.16, 8.2, z - 0.14], { collide: false, uvScale: 1 });
    B.box('steelDark', [x - 0.16, 0, z + 0.14], [x + 0.16, 8.2, z + 0.2], { collide: false, uvScale: 1 });
    B.box('steelDark', [x - 0.03, 0, z - 0.14], [x + 0.03, 8.2, z + 0.14], { collide: false, uvScale: 1 });
    B.box('concreteWall', [x - 0.6, 0, z - 0.6], [x + 0.6, 0.5, z + 0.6], { uvScale: 0.5 });
    world.box([x - 0.2, 0, z - 0.25], [x + 0.2, 8.2, z + 0.25]);
    // cantilever: horizontal tube + inclined stay over the nearest 2 tracks
    const reach = dir > 0 ? 8.0 : 6.0;
    B.hcyl('steelDark', 'x', x, x + dir * reach, z, wireY + 0.9, 0.05, 8);
    const stay = new THREE.CylinderGeometry(0.035, 0.035, Math.hypot(reach, 1.6), 6); stay.rotateZ(Math.PI / 2); stay.rotateZ(-dir * Math.atan2(1.6, reach)); stay.translate(x + dir * reach / 2, wireY + 0.9 + 0.8, z); B.add('steelDark', stay, { uv: false });
    for (const k of [0.45, 1.0]) { B.cyl('white', x + dir * reach * k, z, wireY + 0.45, wireY + 0.9, 0.06, 8); B.cyl('steelDark', x + dir * reach * k, z, wireY + 0.3, wireY + 0.45, 0.02, 6); }
    B.box('yellow', [x - 0.18, 1.2, z - 0.22], [x + 0.18, 1.5, z + 0.22], { collide: false, uv: false });
    world.cover(x + dir * 0.9, z, dir, 0);
  }
  // contact + messenger wires (thin boxes; no colliders) over tracks 3..6
  for (const ti of [2, 3, 4, 5]) {
    const tx = TRACK_X[ti];
    B.box('steelDark', [tx - 0.012, wireY, TRACK_Z0], [tx + 0.012, wireY + 0.024, TRACK_Z1], { collide: false, uv: false });
    B.box('steelDark', [tx - 0.01, wireY + 1.0, TRACK_Z0], [tx + 0.01, wireY + 1.02, TRACK_Z1], { collide: false, uv: false });
    for (let z = -60; z <= 60; z += 8) B.box('steelDark', [tx - 0.006, wireY, z], [tx + 0.006, wireY + 1.0, z + 0.012], { collide: false, uv: false });
  }
}

// ---- stacks: sleepers, rails, concrete sleepers, wheelsets, cable drums (cover) -----------------------------------------
function buildStacks(B, world, M) {
  const { R } = world;
  const sleeperStack = (x, z, layers = 5, ry = 0) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    for (let l = 0; l < layers; l++) {
      const along = l % 2 === 0; const y0 = 0.02 + l * 0.24, y1 = y0 + 0.23;
      for (let k = 0; k < 5; k++) {
        const off = -1.0 + k * 0.5;
        const g = along ? new THREE.BoxGeometry(2.6, 0.23, 0.24) : new THREE.BoxGeometry(0.24, 0.23, 2.6);
        g.rotateY(ry); g.translate(x + (along ? -off * s : off * c), (y0 + y1) / 2, z + (along ? off * c : off * s)); B.add('sleeper', g, { uvScale: 0.5 });
      }
    }
    const h = 0.02 + layers * 0.24; world.box([x - 1.35, 0, z - 1.35], [x + 1.35, h, z + 1.35]);
    world.cover(x - 2.0, z, -1, 0); world.cover(x + 2.0, z, 1, 0); world.cover(x, z - 2.0, 0, -1); world.cover(x, z + 2.0, 0, 1);
  };
  const railStack = (x, z, n = 4, L = 12) => {
    for (let l = 0; l < 3; l++) {
      const y = 0.15 + l * 0.32;
      for (const dz of [-4.5, 0, 4.5]) B.box('plank', [x - 1.0, y - 0.15, z + dz - 0.12], [x + 1.0, y - 0.0, z + dz + 0.12], { collide: false, uvScale: 1 });
      for (let k = 0; k < n; k++) { const rx = x - 0.75 + k * 0.5; B.box('rustSheet', [rx - 0.07, y, z - L / 2], [rx + 0.07, y + 0.03, z + L / 2], { collide: false }); B.box('rustSheet', [rx - 0.015, y + 0.03, z - L / 2], [rx + 0.015, y + 0.13, z + L / 2], { collide: false }); B.box('rustSheet', [rx - 0.035, y + 0.13, z - L / 2], [rx + 0.035, y + 0.17, z + L / 2], { collide: false }); }
    }
    world.box([x - 1.0, 0, z - L / 2], [x + 1.0, 0.15 + 3 * 0.32, z + L / 2]);
    world.cover(x - 1.7, z - 3, -1, 0); world.cover(x + 1.7, z + 3, 1, 0);
  };
  const concreteSleepers = (x, z, layers = 4) => {
    for (let l = 0; l < layers; l++) for (let k = 0; k < 4; k++) B.box('paintedConcrete', [x - 1.3, 0.02 + l * 0.22, z - 0.9 + k * 0.5], [x + 1.3, 0.02 + l * 0.22 + 0.2, z - 0.9 + k * 0.5 + 0.28], { collide: false, uvScale: 1 });
    world.box([x - 1.3, 0, z - 0.95], [x + 1.3, 0.02 + layers * 0.22, z + 0.85]);
    world.cover(x - 1.9, z, -1, 0); world.cover(x + 1.9, z, 1, 0);
  };
  const wheelset = (x, z, ry = 0) => {
    const g = new THREE.CylinderGeometry(0.46, 0.46, 0.13, 20); g.rotateZ(Math.PI / 2); const a = new THREE.CylinderGeometry(0.08, 0.08, 2.0, 8); a.rotateZ(Math.PI / 2);
    const g1 = g.clone().translate(-0.75, 0, 0), g2 = g.clone().translate(0.75, 0, 0);
    for (const q of [g1, g2, a]) { q.rotateY(ry); q.translate(x, 0.46, z); B.add('rustSheet', q, { uv: false }); }
    world.box([x - 1.0, 0, z - 0.5], [x + 1.0, 0.92, z + 0.5]);
  };
  const drum = (x, z, r = 0.9, w = 1.0) => {
    const d = new THREE.CylinderGeometry(r, r, 0.08, 20); d.rotateZ(Math.PI / 2);
    const d1 = d.clone().translate(x - w / 2, r, z), d2 = d.clone().translate(x + w / 2, r, z); B.add('plank', d1, { uv: false }); B.add('plank', d2, { uv: false });
    B.hcyl('black', 'x', x - w / 2, x + w / 2, z, r, r * 0.72, 16);
    world.box([x - w / 2 - 0.05, 0, z - r], [x + w / 2 + 0.05, 2 * r, z + r]); world.cover(x, z - r - 0.8, 0, -1); world.cover(x, z + r + 0.8, 0, 1);
  };
  // lane 3 (x=-10.5) is the hero lane: flank it with stacks at intervals; more around the office and the SE yard
  sleeperStack(-8.0, 44, 5, 0.06); sleeperStack(-13.2, 12, 4, -0.05); sleeperStack(-8.0, -6, 5, 0.03); sleeperStack(-13.0, -28, 6, 0.0);
  sleeperStack(-35, -2, 5, 0.1); sleeperStack(-38.5, -1, 3, -0.15); sleeperStack(36, 44, 5, 0.02); sleeperStack(36, 48, 4, 0.0); sleeperStack(40, 46, 6, 0.05);
  sleeperStack(-56, 10, 5, 0.0); sleeperStack(-56, 14, 4, 0.0); sleeperStack(30, -50, 5, 0.04); sleeperStack(-40, -56, 5, 0.0);
  railStack(-31.5, 30); railStack(-31.5, 44); railStack(28, 52); railStack(3.2, -14, 3, 10);
  concreteSleepers(-8.2, 22); concreteSleepers(-8.2, 24.2); concreteSleepers(33, 40); concreteSleepers(-36, -10);
  wheelset(-12.5, -44, 0.2); wheelset(-12.5, -46.5, 0.1); wheelset(9.5, 46, 0.05); wheelset(-34, -14, 1.5);
  drum(-9.5, 56); drum(-11.8, 56.2, 0.75, 0.8); drum(37, 56); drum(-36.5, 22);
  // container stacks: west fence strip (2-high), north yard, SE corner — big readable cover blocks
  const cont = (x, z, len, mat, y = 0, ry = 0) => {
    const g = new THREE.BoxGeometry(2.44, 2.59, len); g.rotateY(ry); g.translate(x, y + 2.59 / 2, z); B.add(mat, g, { uvScale: 0.41 });
    const c = Math.abs(Math.cos(ry)), sn = Math.abs(Math.sin(ry)); const hx = (2.44 * c + len * sn) / 2, hz = (2.44 * sn + len * c) / 2;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box('steelDark', [x + dx * hx - (dx > 0 ? 0.2 : 0), y, z + dz * hz - (dz > 0 ? 0.2 : 0)], [x + dx * hx + (dx > 0 ? 0 : 0.2), y + 0.25, z + dz * hz + (dz > 0 ? 0 : 0.2)], { collide: false });
    world.box([x - hx, y, z - hz], [x + hx, y + 2.59, z + hz]);
    if (y === 0) { world.cover(x - hx - 0.9, z, -1, 0); world.cover(x + hx + 0.9, z, 1, 0); world.cover(x, z - hz - 0.9, 0, -1); world.cover(x, z + hz + 0.9, 0, 1); }
  };
  cont(-58, -52, 12.19, 'contMaroon'); cont(-58, -52, 12.19, 'contGrey', 2.59); cont(-58, -38, 12.19, 'contBlue'); cont(-58, -24, 6.06, 'contOrange'); cont(-58, -24, 6.06, 'contGreen', 2.59); cont(-58, -16, 6.06, 'contYellow');
  cont(-54.6, -45, 6.06, 'contGreen', 0, 0.08);
  cont(24, -56, 12.19, 'contBlue', 0, 1.571); cont(24, -56, 12.19, 'contMaroon', 2.59, 1.571); cont(40, -56, 6.06, 'contOrange', 0, 1.571); cont(-6, -62.5, 6.06, 'contGrey', 0, 1.571);
  cont(30, 44, 6.06, 'contGreen', 0, 1.571); cont(30, 44, 6.06, 'contYellow', 2.59, 1.571); cont(26, 56, 12.19, 'contBlue', 0, 0.02); cont(56, 40, 12.19, 'contMaroon'); cont(56, 40, 12.19, 'contOrange', 2.59); cont(56, 56, 6.06, 'contGrey');
  // cable trough lids along the west lane + a short retaining kerb near the office
  for (let z = -60; z < 0; z += 1.0) B.box('paintedConcrete', [-29.75, 0, z], [-29.25, 0.16, z + 0.96], { collide: false, uvScale: 1 });
  B.box('concreteWall', [OFFICE.x1 + 0.4, 0, OFFICE.z0 - 3.2], [OFFICE.x1 + 6.0, 0.55, OFFICE.z0 - 2.9], { uvScale: 0.5 });
  world.cover(OFFICE.x1 + 3.2, OFFICE.z0 - 2.0, 0, 1); world.cover(OFFICE.x1 + 3.2, OFFICE.z0 - 4.1, 0, -1);
}

// ---- small clutter: procedural oil drums, pallets, relay cabinets, floodlight masts, yard lamps ------------------------
function buildClutter(B, world, M) {
  const { R } = world;
  const drum = (x, z, mat, { lying = false, ry = 0 } = {}) => {
    const r = 0.29, h = 0.88;
    if (!lying) {
      B.cyl(mat, x, z, 0, h, r, 14, { uvScale: 0.8 });
      for (const y of [0.2, 0.62]) { const rg = new THREE.TorusGeometry(r + 0.01, 0.018, 5, 16); rg.rotateX(Math.PI / 2); rg.translate(x, y, z); B.add('steelDark', rg, { uv: false }); }
      B.cyl('steelDark', x, z, h, h + 0.02, r - 0.03, 14);
      world.box([x - r, 0, z - r], [x + r, h, z + r]);
    } else {
      const g = new THREE.CylinderGeometry(r, r, h, 14); g.rotateZ(Math.PI / 2); g.rotateY(ry); g.translate(x, r, z); B.add(mat, g, { uv: false });
      world.box([x - 0.45, 0, z - 0.45], [x + 0.45, 2 * r, z + 0.45]);
    }
  };
  const drumCluster = (x, z, n, spread = 0.75) => {
    const mats = ['drumBlue', 'drumRed', 'drumGrey', 'rustPlate', 'wagonGreen'];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + R(); const rr = i === 0 ? 0 : spread * (0.8 + R() * 0.4); drum(x + Math.cos(a) * rr, z + Math.sin(a) * rr, mats[(R() * mats.length) | 0], { lying: i === n - 1 && R() < 0.4, ry: R() * 3 }); }
    world.cover(x - spread - 0.9, z, -1, 0); world.cover(x + spread + 0.9, z, 1, 0);
  };
  drumCluster(-8.2, 36, 4); drumCluster(3.4, -8, 3); drumCluster(-13.4, -36, 5, 0.9); drumCluster(-34.5, 6, 3); drumCluster(37, 56, 6, 1.0); drumCluster(-56, 40, 4); drumCluster(9.6, 50, 3); drumCluster(-30.5, -52, 4); drumCluster(41, 20, 3); drumCluster(22.5, -37.5, 3);
  drum(-10.5, 22.5, 'drumRed', { lying: true, ry: 0.4 }); drum(9.6, -26, 'drumGrey'); drum(-31.2, 40, 'drumBlue'); drum(30.5, 37.8, 'rustPlate');
  // pallets (stacked, some leaning)
  const pallet = (x, z, n = 1, ry = 0) => {
    for (let k = 0; k < n; k++) {
      const y = k * 0.145;
      for (const dz of [-0.55, 0, 0.55]) { const g = new THREE.BoxGeometry(1.2, 0.1, 0.1); g.rotateY(ry); g.translate(x, y + 0.05, z + dz); B.add('plank', g, { uvScale: 1 }); }
      for (const dx of [-0.5, 0, 0.5]) { const g = new THREE.BoxGeometry(0.12, 0.02, 1.2); g.rotateY(ry); g.translate(x + dx, y + 0.11, z); B.add('plank', g, { uvScale: 1 }); }
      const g = new THREE.BoxGeometry(1.2, 0.02, 1.2); g.rotateY(ry); g.translate(x, y + 0.13, z); B.add('plank', g, { uvScale: 1 });
    }
    world.box([x - 0.65, 0, z - 0.65], [x + 0.65, n * 0.145, z + 0.65]);
  };
  pallet(-8.5, 40, 6, 0.1); pallet(-7.2, 41.4, 3, 0.4); pallet(23.5, 14, 4, 0.05); pallet(-33.5, 15.5, 5, 0.2); pallet(30, 8, 3, 0.1); pallet(36, 50.5, 8, 0.0); pallet(37.5, 50.5, 5, 0.1); pallet(-46, 36, 2, 0.5); pallet(3.6, -50, 7, 0.02);
  world.cover(-9.7, 40, -1, 0); world.cover(36.7, 52.0, 0, 1); world.cover(3.6, -48.7, 0, 1);
  // relay / signalling cabinets beside the tracks (grey-green steel, concrete plinth)
  const cabinet = (x, z, w = 1.2, d = 0.6, h = 1.5, ry = 0) => {
    B.box('concreteWall', [x - w / 2 - 0.1, 0, z - d / 2 - 0.1], [x + w / 2 + 0.1, 0.25, z + d / 2 + 0.1], { uvScale: 0.5 });
    B.box('cabinet', [x - w / 2, 0.25, z - d / 2], [x + w / 2, 0.25 + h, z + d / 2], { uvScale: 0.8 });
    B.box('steelDark', [x - w / 2 - 0.02, 0.25 + h, z - d / 2 - 0.05], [x + w / 2 + 0.02, 0.25 + h + 0.05, z + d / 2 + 0.05], { collide: false });
    B.box('steelDark', [x - 0.03, 0.25 + h * 0.45, z + d / 2], [x + 0.03, 0.25 + h * 0.6, z + d / 2 + 0.03], { collide: false });
    world.cover(x, z - d / 2 - 0.8, 0, -1); world.cover(x, z + d / 2 + 0.8, 0, 1);
  };
  cabinet(-13.0, -20); cabinet(-13.0, 38); cabinet(9.6, -12, 1.6, 0.7, 1.7); cabinet(-31.8, -34); cabinet(-31.8, 18, 2.2, 0.8, 1.9); cabinet(9.6, 32); cabinet(17.5, -40, 1.0, 0.6, 1.3); cabinet(-8.6, -60, 1.4);
  // floodlight masts (tall, lattice-ish with a lamp head cluster) — strong daytime silhouettes
  const flood = (x, z) => {
    B.cyl('steelDark', x, z, 0, 14, 0.22, 10, { collide: true, uvScale: 1 }); B.cyl('steelDark', x, z, 14, 16.5, 0.15, 8);
    B.box('concreteWall', [x - 0.8, 0, z - 0.8], [x + 0.8, 0.6, z + 0.8], { uvScale: 0.5 });
    B.box('steelDark', [x - 1.4, 16.2, z - 0.08], [x + 1.4, 16.35, z + 0.08], { collide: false }); B.box('steelDark', [x - 1.4, 15.3, z - 0.08], [x + 1.4, 15.45, z + 0.08], { collide: false });
    for (const dx of [-1.1, -0.55, 0, 0.55, 1.1]) for (const y of [15.45, 16.35]) { B.box('black', [x + dx - 0.22, y, z - 0.25], [x + dx + 0.22, y + 0.35, z + 0.05], { collide: false, uv: false }); B.box('white', [x + dx - 0.18, y + 0.03, z + 0.05], [x + dx + 0.18, y + 0.32, z + 0.07], { collide: false, uv: false }); }
    for (let y = 1; y < 14; y += 0.35) B.box('steelDark', [x + 0.2, y, z - 0.18], [x + 0.26, y + 0.03, z + 0.18], { collide: false });
    world.cover(x - 1.0, z, -1, 0); world.cover(x + 1.0, z, 1, 0);
  };
  flood(-31.5, 60); flood(9.7, -30); flood(-31.5, -8); flood(41, 12); flood(9.7, 60);
  // yard lamps along the platform back lane and the depot apron
  for (const [x, z] of [[38, -20], [38, 10], [-42, 30], [-58, 30], [-40, 58]]) { B.cyl('steelDark', x, z, 0, 7.5, 0.09, 8, { collide: true }); B.box('steelDark', [x - 0.06, 7.3, z - 0.06], [x + 0.06, 7.5, z + 1.6], { collide: false }); B.box('white', [x - 0.3, 7.15, z + 1.1], [x + 0.3, 7.3, z + 2.0], { collide: false, uv: false }); }
}

// ---- perimeter fence: posts (merged), rails, gate frames -----------------------------------------------------------------
const GATES = { north: [-30.5, 17], south: [-30.5, 17], roadS: [ROAD_E.x0 - 1, ROAD_E.x1 + 1], roadN: [ROAD_W.x0 - 1, ROAD_W.x1 + 1] };
function fenceRuns() {
  const F = FENCE; const runs = [];
  // north side (z=-F): gap for tracks
  runs.push({ axis: 'x', c: -F, a0: -F, a1: GATES.north[0] }); runs.push({ axis: 'x', c: -F, a0: GATES.north[1], a1: F });
  // south side (z=F): gaps for tracks and the east road
  runs.push({ axis: 'x', c: F, a0: -F, a1: GATES.south[0] }); runs.push({ axis: 'x', c: F, a0: GATES.south[1], a1: GATES.roadS[0] }); runs.push({ axis: 'x', c: F, a0: GATES.roadS[1], a1: F });
  runs.push({ axis: 'z', c: -F, a0: -F, a1: F }); runs.push({ axis: 'z', c: F, a0: -F, a1: F });
  return runs;
}
function buildFencePosts(B, world, M) {
  const H = 2.4;
  for (const r of fenceRuns()) {
    const n = Math.ceil((r.a1 - r.a0) / 3);
    for (let i = 0; i <= n; i++) {
      const a = r.a0 + (r.a1 - r.a0) * i / n; const x = r.axis === 'x' ? a : r.c, z = r.axis === 'x' ? r.c : a;
      B.cyl('steelDark', x, z, 0, H + 0.1, 0.045, 6);
      B.box('steelDark', [x - 0.05, H - 0.5, z - 0.05], [x + 0.05, H + 0.1, z + 0.05], { collide: false, uv: false });
    }
    const min = r.axis === 'x' ? [r.a0, H - 0.02, r.c - 0.02] : [r.c - 0.02, H - 0.02, r.a0], max = r.axis === 'x' ? [r.a1, H + 0.02, r.c + 0.02] : [r.c + 0.02, H + 0.02, r.a1];
    B.box('steelDark', min, max, { collide: false, uv: false });
    world.box(r.axis === 'x' ? [r.a0, 0, r.c - 0.08] : [r.c - 0.08, 0, r.a0], r.axis === 'x' ? [r.a1, H + 0.6, r.c + 0.08] : [r.c + 0.08, H + 0.6, r.a1]);
  }
  // gates: track gates (sliding leaves half open) and the road gate (swing leaf open)
  for (const [gz, g] of [[-FENCE, GATES.north], [FENCE, GATES.south]]) {
    for (const gx of [g[0], g[1]]) { B.box('steelDark', [gx - 0.15, 0, gz - 0.15], [gx + 0.15, 3.4, gz + 0.15], { uvScale: 1 }); B.box('yellow', [gx - 0.17, 0.4, gz - 0.17], [gx + 0.17, 1.2, gz + 0.17], { collide: false, uv: false }); }
    B.box('steelDark', [g[0], 3.4, gz - 0.1], [g[1], 3.6, gz + 0.1], { collide: false, uv: false });
  }
  const rg = GATES.roadS; B.box('steelDark', [rg[0] - 0.2, 0, FENCE - 0.2], [rg[0] + 0.2, 2.8, FENCE + 0.2], { uvScale: 1 }); B.box('steelDark', [rg[1] - 0.2, 0, FENCE - 0.2], [rg[1] + 0.2, 2.8, FENCE + 0.2], { uvScale: 1 });
  // barrier arm (raised) + guard hut by the south road gate
  B.box('white', [rg[0] + 0.3, 0, FENCE - 1.2], [rg[0] + 0.7, 1.1, FENCE - 0.8], { uvScale: 1 });
  const arm = new THREE.BoxGeometry(0.12, 0.2, 5.5); arm.rotateX(-1.25); arm.translate(rg[0] + 0.5, 3.6, FENCE - 1.0 + 1.4); B.add('white', arm, { uv: false });
  B.box('paintedConcrete', [rg[1] + 0.6, 0, FENCE - 4.0], [rg[1] + 3.4, 2.7, FENCE - 1.2], { uvScale: 0.5 }); B.box('corrugated', [rg[1] + 0.4, 2.7, FENCE - 4.2], [rg[1] + 3.6, 2.85, FENCE - 1.0], { collide: false, uvScale: 0.6 });
  window_(B, rg[1] + 0.6, FENCE - 3.4, FENCE - 1.8, 1.1, 2.1);
  world.cover(rg[1] + 4.2, FENCE - 2.6, 1, 0); world.cover(rg[1] - 0.8, FENCE - 2.6, -1, 0);
}
function window_(B, x, z0, z1, y0, y1) { B.box('glass', [x - 0.03, y0, z0], [x + 0.03, y1, z1], { collide: false, uv: false }); B.box('steelDark', [x - 0.05, y0 - 0.06, z0 - 0.06], [x + 0.05, y0, z1 + 0.06], { collide: false, uv: false }); B.box('steelDark', [x - 0.05, y1, z0 - 0.06], [x + 0.05, y1 + 0.06, z1 + 0.06], { collide: false, uv: false }); }

/** Chain-link panels (alpha-tested planes) + barbed wire strip, one merged mesh each. */
function buildFenceMesh(world, M) {
  const { scene, ctx } = world; const H = 2.4;
  const cl = chainlinkTexture(); const bw = barbedTexture();
  const panels = [], wires = [];
  for (const r of fenceRuns()) {
    const L = r.a1 - r.a0;
    const g = new THREE.PlaneGeometry(L, H); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / 0.5, uv.getY(i) * H / 0.5);
    if (r.axis === 'x') g.translate(r.a0 + L / 2, H / 2, r.c); else { g.rotateY(Math.PI / 2); g.translate(r.c, H / 2, r.a0 + L / 2); }
    panels.push(g);
    const w = new THREE.PlaneGeometry(L, 0.32); const wuv = w.attributes.uv; for (let i = 0; i < wuv.count; i++) wuv.setXY(i, wuv.getX(i) * L / 1.2, wuv.getY(i));
    if (r.axis === 'x') w.translate(r.a0 + L / 2, H + 0.32, r.c); else { w.rotateY(Math.PI / 2); w.translate(r.c, H + 0.32, r.a0 + L / 2); }
    wires.push(w);
  }
  const pm = new THREE.MeshStandardMaterial({ map: cl, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.8, color: 0xb8bcc0, envMapIntensity: 0.8 });
  const pmesh = new THREE.Mesh(BGU.mergeGeometries(panels, false), pm); pmesh.name = 'fence:chainlink'; pmesh.castShadow = false; pmesh.receiveShadow = true; pmesh.userData.surface = 'metal'; pmesh.frustumCulled = false;
  scene.add(pmesh); ctx.raycastTargets.push(pmesh);
  const wm = new THREE.MeshStandardMaterial({ map: bw, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.9, color: 0xc8ccd0 });
  const wmesh = new THREE.Mesh(BGU.mergeGeometries(wires, false), wm); wmesh.name = 'fence:barbed'; wmesh.castShadow = false; wmesh.frustumCulled = false; scene.add(wmesh);
}

// ---- distant: silos, grain elevator, cranes, warehouses, skyline, pylons, continuing tracks with parked stock -------------
function buildDistant(world, M) {
  const { scene, R, ctx } = world;
  const geos = [], dark = [], plain = [];
  const box = (list, w, h, d, x, y, z, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); list.push(g); };
  const cyl = (list, r, h, x, y, z, seg = 14) => { const g = new THREE.CylinderGeometry(r, r, h, seg); g.translate(x, y, z); list.push(g); };
  // grain silos + elevator head house (north-west, beyond the fence)
  for (let i = 0; i < 7; i++) cyl(plain, 4.2, 30, -52 + i * 8.6, 15, -128, 18);
  box(plain, 62, 3, 10, -26, 31.5, -128); box(geos, 14, 44, 12, -60, 22, -120); box(plain, 6, 6, 60, -26, 34, -132);
  for (let i = 0; i < 5; i++) cyl(plain, 3.6, 24, 40 + i * 7.6, 12, -140, 16);
  // marshalling yard beyond: continuing tracks (steel), parked dark wagons (silhouettes) north and south
  for (const tx of TRACK_X) for (const [z0, z1] of [[TRACK_Z0 - 60, TRACK_Z0], [TRACK_Z1, TRACK_Z1 + 60]]) { box(dark, 0.08, 0.16, z1 - z0, tx - 0.72, 0.3, (z0 + z1) / 2); box(dark, 0.08, 0.16, z1 - z0, tx + 0.72, 0.3, (z0 + z1) / 2); }
  for (const [ti, z, L] of [[0, -95, 15], [0, -111, 15], [2, -84, 13], [4, -100, 15], [5, -78, 15], [7, -90, 15], [1, 90, 12], [3, 84, 15], [3, 100, 15], [6, 92, 15], [7, 108, 15]]) {
    const tx = TRACK_X[ti]; box(dark, 3.0, 3.3, L, tx, 1.2 + 1.65, z); box(dark, 2.7, 0.9, L - 1, tx, 0.7, z);
  }
  // midground sheds just outside the fence: real materials (corrugated walls, dark roofs) so they hold up at 40–80 m
  const MB = new Batch(world, M, 'midground');
  const shed = (x, z, w, d, h, ry = 0) => {
    const g = new THREE.BoxGeometry(w, h, d); g.rotateY(ry); g.translate(x, h / 2, z); MB.add('corrugated', g, { uvScale: 0.6 });
    const r = new THREE.BoxGeometry(w + 0.8, 0.4, d + 0.8); r.rotateY(ry); r.translate(x, h + 0.2, z); MB.add('steelDark', r, { uvScale: 0.5 });
    const ridge = new THREE.BoxGeometry(w * 0.9, 1.6, 3); ridge.rotateY(ry); ridge.translate(x, h + 0.9, z); MB.add('rustPlate', ridge, { uvScale: 0.5 });
    const base = new THREE.BoxGeometry(w + 0.2, 1.2, d + 0.2); base.rotateY(ry); base.translate(x, 0.6, z); MB.add('concreteWall', base, { uvScale: 0.5 });
  };
  shed(100, -20, 56, 28, 11); shed(98, 22, 40, 24, 8.5, 0.05); shed(118, 60, 34, 28, 14, -0.1); shed(-105, -10, 28, 58, 9.5, 0.1); shed(-98, 60, 26, 24, 8, -0.2);
  const chim = new THREE.CylinderGeometry(2.0, 2.6, 42, 14); chim.translate(118, 21, -36); MB.add('brickDark', chim, { uvScale: 0.5 }); MB.add('steelDark', new THREE.CylinderGeometry(2.2, 2.2, 1.2, 14).translate(118, 42.2, -36), { uv: false });
  MB.add('brick', new THREE.BoxGeometry(14, 20, 14).translate(-115, 10, 40), { uvScale: 0.42 });
  MB.flush({ shadow: false });
  for (let i = 0; i < 6; i++) box(dark, 9, 3, 30, 80 + i * 10, 13.5, -20, 0);
  // container gantry cranes far east (port) and a couple of luffing cranes
  for (const [x, z, ry] of [[165, -60, 0.1], [180, 10, -0.05], [175, 70, 0.2]]) {
    const H = 38; const g = [];
    for (const sx of [-7, 7]) for (const sz of [-7, 7]) box(g, 1.6, H * 0.8, 1.6, sx, H * 0.4, sz);
    box(g, 18, 2.4, 18, 0, H * 0.8, 0); box(g, 2.4, H * 0.25, 2.4, 0, H * 0.92, 0); box(g, 60, 2.4, 2.4, 8, H + 1.6, 0);
    const boom = new THREE.BoxGeometry(40, 2, 2); boom.rotateZ(0.6); boom.translate(-6, H + 12, 0); g.push(boom);
    const mg = BGU.mergeGeometries(g, false); mg.rotateY(ry); mg.translate(x, 0, z); dark.push(mg);
  }
  // city skyline (blocks) far north + south, water tower, chimneys, pylons on the west
  for (let i = 0; i < 16; i++) { const w = 18 + R() * 30, h = 20 + R() * 45; box(geos, w, h, 16 + R() * 14, -180 + i * 24 + (R() - 0.5) * 10, h / 2, -230 - R() * 40, (R() - 0.5) * 0.3); }
  for (let i = 0; i < 9; i++) { const w = 16 + R() * 26, h = 14 + R() * 30; box(geos, w, h, 14 + R() * 12, -120 + i * 30 + (R() - 0.5) * 10, h / 2, 200 + R() * 40, (R() - 0.5) * 0.3); }
  cyl(plain, 1.6, 60, -150, 30, -150, 10); cyl(plain, 2.0, 50, 150, 25, -170, 10); cyl(plain, 5, 8, -90, 32, -90, 12); cyl(plain, 0.8, 28, -90, 14, -90, 8);
  for (let i = 0; i < 5; i++) { const z = -140 + i * 60; box(dark, 2, 44, 2, -160, 22, z); box(dark, 24, 1.4, 1.4, -160, 38, z); box(dark, 18, 1.4, 1.4, -160, 32, z); }
  // treeline: a low broken band of dark blobs along the far west and north-east
  // treeline: clusters of tapered cones (poplars) well beyond the fence
  for (let i = 0; i < 70; i++) { const west = i < 40; const x = west ? -150 + R() * 30 : 70 + R() * 90, z = west ? -120 + R() * 240 : -150 - R() * 25; const h = 9 + R() * 8; const g = new THREE.CylinderGeometry(0.4, 2.6 + R() * 1.5, h, 6); g.translate(x, h / 2 + 0.5, z); dark.push(g); }
  // windows pattern for the skyline blocks (unlit daytime glazing on precast panels)
  const wc = document.createElement('canvas'); wc.width = 128; wc.height = 128; const wg = wc.getContext('2d');
  wg.fillStyle = '#7a838b'; wg.fillRect(0, 0, 128, 128); wg.fillStyle = '#6a737b'; wg.fillRect(0, 60, 128, 8);
  for (let yy = 8; yy < 128; yy += 32) for (let xx = 6; xx < 128; xx += 21) { wg.fillStyle = R() < 0.85 ? '#3a4650' : '#9aa4ab'; wg.fillRect(xx, yy, 12, 16); }
  const winTex = new THREE.CanvasTexture(wc); winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping; winTex.colorSpace = THREE.SRGBColorSpace;
  const skyMat = new THREE.MeshStandardMaterial({ map: winTex, color: 0xa8aeb4, roughness: 0.95, metalness: 0, name: 'skyline' });
  const skyGeo = BGU.mergeGeometries(geos.map(g => g.index ? g.toNonIndexed() : g), false);
  // uv: 1 window column per 3.5 m, one storey per 4 m (world-space by dominant axis)
  { const pos = skyGeo.attributes.position, nor = skyGeo.attributes.normal, uv = skyGeo.attributes.uv; for (let i = 0; i < pos.count; i++) { const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i)); if (ny > nx && ny > nz) uv.setXY(i, 0.02, 0.02); else if (nx > nz) uv.setXY(i, pos.getZ(i) / 3.5, pos.getY(i) / 4.0); else uv.setXY(i, pos.getX(i) / 3.5, pos.getY(i) / 4.0); } uv.needsUpdate = true; }
  const m1 = new THREE.Mesh(skyGeo, skyMat); m1.frustumCulled = false; m1.name = 'distant'; m1.castShadow = false; m1.receiveShadow = false; scene.add(m1);
  const m3 = new THREE.Mesh(BGU.mergeGeometries(plain.map(g => g.index ? g.toNonIndexed() : g), false), M.distant); m3.frustumCulled = false; m3.name = 'distant-plain'; m3.castShadow = false; m3.receiveShadow = false; scene.add(m3); m3.userData.surface = 'concrete'; ctx.raycastTargets.push(m3);
  const m2 = new THREE.Mesh(BGU.mergeGeometries(dark.map(g => g.index ? g.toNonIndexed() : g), false), M.distantDark); m2.frustumCulled = false; m2.name = 'distant-dark'; m2.castShadow = false; m2.receiveShadow = false; scene.add(m2);
  for (const m of [m1, m2]) { m.userData.surface = 'concrete'; ctx.raycastTargets.push(m); }
}
