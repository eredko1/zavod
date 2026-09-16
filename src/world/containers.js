// ISO container yard: instanced stacked containers (closed + open-door variants). WORLD agent.
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { addGrime, graffitiTexture } from './mats.js';

export const CL = 12.19, CH = 2.59, CW = 2.44;
const PALETTE = [0x7a2e1e, 0x1f3a6e, 0x2e5a30, 0x6a6d70, 0x5a1f28, 0xb5561a, 0xb9b7ad, 0x1f5c5a, 0xa77f1c, 0x8a3b2a, 0x243d5c];

function scaleUV(geo, su, sv) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); }

/** Container body geometry with groups: 0 painted panels, 1 dark steel (frame, rods), 2 interior (open only) */
function containerGeometry(open) {
  const painted = [], steel = [], interior = [];
  const side = (w, h, tx, ty, tz, rotY = 0, rotX = 0) => {
    const g = new THREE.PlaneGeometry(w, h); scaleUV(g, w / 2.44, h / 2.59);
    if (rotX) g.rotateX(rotX); if (rotY) g.rotateY(rotY); g.translate(tx, ty, tz); return g;
  };
  // long sides
  painted.push(side(CL, CH, 0, 0, CW / 2, 0));
  painted.push(side(CL, CH, 0, 0, -CW / 2, Math.PI));
  // top
  painted.push(side(CL, CW, 0, CH / 2, 0, 0, -Math.PI / 2));
  // bottom (dark)
  steel.push(side(CL, CW, 0, -CH / 2, 0, 0, Math.PI / 2));
  // rear end (-x)
  painted.push(side(CW, CH, -CL / 2, 0, 0, -Math.PI / 2));
  if (!open) {
    // door end (+x): two door panels with lock rods
    painted.push(side(CW, CH, CL / 2, 0, 0, Math.PI / 2));
    for (const z of [-0.95, -0.35, 0.35, 0.95]) { const r = new THREE.CylinderGeometry(0.03, 0.03, CH - 0.3, 6); r.translate(CL / 2 + 0.05, 0, z); steel.push(r); }
    for (const z of [-0.65, 0.65]) for (const y of [-0.9, 0, 0.9]) { const h = new THREE.BoxGeometry(0.1, 0.12, 0.5); h.translate(CL / 2 + 0.05, y, z); steel.push(h); }
  } else {
    // interior: floor, walls, ceiling, back
    const inset = 0.08;
    interior.push(side(CL - inset, CW - inset, 0, -CH / 2 + inset, 0, 0, -Math.PI / 2)); // floor faces up
    interior.push(side(CL - inset, CW - inset, 0, CH / 2 - inset, 0, 0, Math.PI / 2)); // ceiling faces down
    interior.push(side(CL - inset, CH - inset, 0, 0, CW / 2 - inset, Math.PI));
    interior.push(side(CL - inset, CH - inset, 0, 0, -CW / 2 + inset, 0));
    interior.push(side(CW, CH, -CL / 2 + inset, 0, 0, Math.PI / 2));
    // doors swung open (~112°) on hinges at z=±CW/2
    for (const s of [-1, 1]) {
      const d = new THREE.BoxGeometry(0.06, CH - 0.1, CW / 2 - 0.05); scaleUV(d, 0.5, 1);
      d.translate(0, 0, -s * (CW / 4)); d.rotateY(-s * 1.95); d.translate(CL / 2, 0, s * CW / 2);
      painted.push(d);
      const rod = new THREE.CylinderGeometry(0.03, 0.03, CH - 0.3, 6);
      rod.translate(0.05, 0, -s * (CW / 4 + 0.25)); rod.rotateY(-s * 1.95); rod.translate(CL / 2, 0, s * CW / 2);
      steel.push(rod);
    }
  }
  // corner posts + top/bottom rails
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = new THREE.BoxGeometry(0.18, CH + 0.02, 0.18); p.translate(sx * (CL / 2 - 0.02), 0, sz * (CW / 2 - 0.02)); steel.push(p); }
  for (const sy of [-1, 1]) for (const sz of [-1, 1]) { const r = new THREE.BoxGeometry(CL, 0.12, 0.14); r.translate(0, sy * (CH / 2 - 0.05), sz * (CW / 2 - 0.02)); steel.push(r); }
  for (const sy of [-1, 1]) for (const sx of [-1, 1]) { const r = new THREE.BoxGeometry(0.14, 0.12, CW); r.translate(sx * (CL / 2 - 0.02), sy * (CH / 2 - 0.05), 0); steel.push(r); }
  // forklift pockets
  for (const x of [-1.0, 1.0]) { const f = new THREE.BoxGeometry(0.4, 0.14, CW + 0.02); f.translate(x, -CH / 2 + 0.07, 0); steel.push(f); }

  const parts = [BGU.mergeGeometries(painted, false), BGU.mergeGeometries(steel, false)];
  if (interior.length) parts.push(BGU.mergeGeometries(interior, false));
  const merged = BGU.mergeGeometries(parts, true);
  merged.computeBoundingBox(); merged.computeBoundingSphere();
  return merged;
}

export function buildContainers(world) {
  const { ctx, scene, R, W } = world;
  const A = ctx.assets;
  const painted = A.material('container', { grayscale: true, repeat: 1, roughness: 1, metalness: 1, normalScale: 1.2, envMapIntensity: 0.9 });
  addGrime(painted, R, { strength: 0.85, scale: 0.45, height: 1.4, tint: [0.36, 0.28, 0.2], wet: 0.4, key: 'c' });
  const steel = A.material('rust', { repeat: [2, 1], roughness: 1, metalness: 1, color: 0x9a9a9a, envMapIntensity: 0.6 });
  const interior = A.material('rusty_sheet', { repeat: [4, 1], roughness: 1, metalness: 1, color: 0x8a8a8a, envMapIntensity: 0.3, side: THREE.DoubleSide });

  const geoClosed = containerGeometry(false);
  const geoOpen = containerGeometry(true);

  // ---- layout -----------------------------------------------------------------
  const rows = [12, 18.5, 25, 31.5, 38, 44.5, 51];
  const slots = [-32, -18, -4, 10, 24, 38];
  const closed = [], open = [];
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const place = (list, x, y, z, rot, color) => list.push({ x, y, z, rot, color });

  for (const rx of rows) for (const sz of slots) {
    if (R() < 0.26) continue; // gap → lane crossing
    const r = R(); const h = r < 0.35 ? 1 : r < 0.78 ? 2 : 3;
    const cross = R() < 0.08 && h === 1;
    const jitterZ = (R() - 0.5) * 0.6;
    for (let k = 0; k < h; k++) {
      const yaw = (cross ? 0 : Math.PI / 2) + (R() - 0.5) * 0.02 + (k > 0 ? (R() - 0.5) * 0.04 : 0);
      const isOpen = k === 0 && R() < 0.16;
      const jx = k > 0 ? (R() - 0.5) * 0.3 : 0;
      place(isOpen ? open : closed, rx + jx, CH / 2 + k * CH + 0.005, sz + jitterZ, yaw + (isOpen && R() < 0.5 ? Math.PI : 0), pick(PALETTE));
    }
  }
  // loose containers: plaza + west yard, at angles, give the map some diagonal cover
  place(closed, -6, CH / 2, -14, 0.35, 0x1f3a6e);
  place(open, 2, CH / 2, -30, -1.25, 0xb5561a);
  place(closed, -20, CH / 2, 8, 1.35, 0x7a2e1e);
  place(closed, -20, CH * 1.5, 8, 1.4, 0x6a6d70);
  place(closed, -46, CH / 2, 12, -0.2, 0x2e5a30);
  place(open, -34, CH / 2, 16, 1.55, 0x5a1f28);
  place(closed, 4, CH / 2, 34, 1.62, 0x243d5c);
  place(closed, -12, CH / 2, 46, 0.1, 0x8a3b2a);
  place(closed, 44, CH / 2, 50, 0.05, 0x1f5c5a);
  place(closed, 44, CH * 1.5, 50, 0.08, 0xa77f1c);

  const mk = (geo, list, name) => {
    const im = new THREE.InstancedMesh(geo, [painted, steel, interior], list.length);
    im.name = name;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const col = new THREE.Color();
    list.forEach((c, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.rot); p.set(c.x, c.y, c.z);
      m.compose(p, q, s); im.setMatrixAt(i, m);
      im.setColorAt(i, col.setHex(c.color));
      // collider: AABB of rotated box
      const hx = CL / 2, hz = CW / 2; const cs = Math.abs(Math.cos(c.rot)), sn = Math.abs(Math.sin(c.rot));
      const ex = hx * cs + hz * sn, ez = hx * sn + hz * cs;
      ctx.colliders.push(new THREE.Box3(new THREE.Vector3(c.x - ex, c.y - CH / 2, c.z - ez), new THREE.Vector3(c.x + ex, c.y + CH / 2, c.z + ez)));
      if (c.y < CH) {
        // cover points at the ends and middle of both long sides
        const fx = Math.cos(c.rot), fz = -Math.sin(c.rot); // local +x in world
        const nx = -fz, nz = fx; // local +z in world (side normal)
        for (const t of [-0.35, 0, 0.35]) for (const s of [-1, 1]) world.cover(c.x + fx * t * CL + nx * s * (CW / 2 + 0.7), c.z + fz * t * CL + nz * s * (CW / 2 + 0.7), nx * s, nz * s);
        for (const s of [-1, 1]) world.cover(c.x + fx * s * (CL / 2 + 0.8), c.z + fz * s * (CL / 2 + 0.8), fx * s, fz * s);
      }
    });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = true; im.receiveShadow = true; im.userData.surface = 'metal';
    im.computeBoundingSphere?.(); im.frustumCulled = true;
    scene.add(im); ctx.raycastTargets.push(im);
    return im;
  };
  mk(geoClosed, closed, 'containers');
  mk(geoOpen, open, 'containersOpen');
  W.containers = { closed, open };

  // graffiti decals on a few ground-level container sides
  const tags = ['ЗАВОД', 'СЕКТОР 7', 'ВЫХОД', 'НЕТ', 'ГРУЗ', 'КРАН 2'];
  const colors = ['#d8322d', '#e5c33a', '#3ab0e5', '#e07a2b', '#cfcfcf'];
  let n = 0;
  for (const c of closed) {
    if (c.y > CH || n >= 8 || R() < 0.55) continue;
    const t = graffitiTexture({ text: pick(tags), color: pick(colors), R });
    const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const g = new THREE.PlaneGeometry(4.5, 1.8);
    const mesh = new THREE.Mesh(g, m);
    const s = R() < 0.5 ? 1 : -1;
    const fx = Math.cos(c.rot), fz = -Math.sin(c.rot), nx = -fz, nz = fx;
    const off = (R() - 0.5) * 5;
    mesh.position.set(c.x + fx * off + nx * s * (CW / 2 + 0.02), c.y - 0.2, c.z + fz * off + nz * s * (CW / 2 + 0.02));
    mesh.rotation.y = c.rot + (s > 0 ? 0 : Math.PI);
    mesh.receiveShadow = true; mesh.renderOrder = 2;
    scene.add(mesh); n++;
  }
}
