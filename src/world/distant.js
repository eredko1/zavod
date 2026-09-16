// Distant skyline silhouettes behind the fog: apartment blocks, port cranes, silos, chimneys. WORLD agent.
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { windowsTexture } from './mats.js';

export function buildDistant(world) {
  const { scene, R } = world;
  const dark = new THREE.MeshStandardMaterial({ color: 0x0c1016, roughness: 0.95, metalness: 0.1 });
  const geos = [];
  const box = (w, h, d, x, y, z, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); geos.push(g); };
  const cyl = (r, h, x, y, z) => { const g = new THREE.CylinderGeometry(r, r, h, 12); g.translate(x, y, z); geos.push(g); };

  // ---- apartment blocks (panelki) north & west with lit windows ------------------
  const winTex = windowsTexture(R);
  const winMat = new THREE.MeshStandardMaterial({ color: 0x0c1016, roughness: 0.9, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.9 });
  const blocks = [];
  const block = (w, h, d, x, z, ry) => {
    box(w, h, d, x, h / 2, z, ry);
    // lit facade planes slightly proud of the box
    const f = new THREE.PlaneGeometry(w, h); const uv = f.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 3.2), uv.getY(i) * (h / 3.0));
    f.translate(0, h / 2, d / 2 + 0.2); f.rotateY(ry); f.translate(x, 0, z); blocks.push(f);
  };
  block(60, 42, 14, -30, -150, 0.1); block(48, 30, 14, 50, -160, -0.2); block(70, 48, 16, -120, -110, 0.9); block(40, 36, 14, -150, -20, 1.5); block(36, 27, 14, -140, 60, 1.6); block(55, 33, 14, 20, -215, 0.05);
  block(40, 30, 14, -175, -60, 1.2);
  const bw = BGU.mergeGeometries(blocks, false); const bm = new THREE.Mesh(bw, winMat); bm.frustumCulled = false; scene.add(bm);

  // ---- port cranes east (over the water) -----------------------------------------
  const portCrane = (x, z, ry) => {
    const H = 45; const g = [];
    const b = (w, h, d, ox, oy, oz) => { const q = new THREE.BoxGeometry(w, h, d); q.translate(ox, oy, oz); g.push(q); };
    for (const sx of [-6, 6]) for (const sz of [-6, 6]) b(1.4, H * 0.75, 1.4, sx, H * 0.375, sz);
    b(16, 2, 16, 0, H * 0.75, 0); b(2.2, H * 0.3, 2.2, 0, H * 0.9, 0);
    b(70, 2.2, 2.2, 10, H + 2, 0); // boom (partly raised)
    const boom = new THREE.BoxGeometry(48, 2, 2); boom.rotateZ(0.55); boom.translate(-6, H + 14, 0); g.push(boom);
    b(2, 5, 4, -14, H - 3, 0);
    const m = BGU.mergeGeometries(g, false); m.rotateY(ry); m.translate(x, 0, z); geos.push(m);
  };
  portCrane(120, -70, 0.2); portCrane(140, 10, -0.1); portCrane(130, 80, 0.3); portCrane(210, -30, 0.5);
  // ship hull silhouette + superstructure
  box(160, 14, 26, 185, 5, 40, 0.1); box(24, 16, 20, 240, 20, 46, 0.1); cyl(2.5, 10, 244, 32, 46);

  // ---- silos, chimneys, gas holder north/west --------------------------------------
  for (let i = 0; i < 5; i++) cyl(4.5, 34, -60 + i * 10, 17, -125);
  cyl(2.8, 70, -85, 35, -140); cyl(2.2, 58, 90, 29, -135); cyl(14, 24, 110, 12, -120);
  box(90, 22, 30, 80, 11, -120); box(50, 16, 24, -70, 8, -128);
  // pylons
  for (let i = 0; i < 4; i++) { const x = -110 + i * 55; box(2, 40, 2, x, 20, -175); box(22, 1.2, 1.2, x, 34, -175); box(16, 1.2, 1.2, x, 29, -175); }

  const merged = BGU.mergeGeometries(geos, false);
  const mesh = new THREE.Mesh(merged, dark); mesh.frustumCulled = false; scene.add(mesh);

  // aircraft-warning / crane lights in the distance (unfogged points, blink)
  const pts = [[120, 47, -70], [140, 47, 10], [130, 47, 80], [210, 47, -30], [-85, 71, -140], [90, 59, -135], [-110, 41, -175], [-55, 41, -175], [0, 41, -175], [55, 41, -175], [-30, 43, -150], [-120, 49, -110]];
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
  const pm = new THREE.PointsMaterial({ color: 0xff3020, size: 5, sizeAttenuation: false, transparent: true, opacity: 0.9, fog: false, depthWrite: false });
  const p = new THREE.Points(pg, pm); scene.add(p);
  world.updaters.push(() => { pm.opacity = 0.45 + 0.45 * (Math.sin(world.ctx.time.elapsed * 1.3) > 0 ? 1 : 0.2); });
}
