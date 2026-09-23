// CONEY life: beach umbrellas + towels in family clusters, lifeguard chairs, a busy boardwalk, strollers in the amusement
// streets, queues at the rides, bathers at the waterline, gulls. Set dressing only (no colliders except the lifeguard chairs).
// CONEY agent.
import * as THREE from 'three';
import { Batch, boxGeo } from '../sbu/geo.js';
import { buildCrowd, scatter } from '../crowd.js';
import { OSM, PLAY } from './osm.js';
import { BW, sandHeight, waterZ, SAND_TOP } from './shore.js';
import { bbox } from '../osmkit.js';

export function buildBeachLife(world, M) {
  const { scene, R } = world; const B = new Batch(world, M, 'beachLife');
  const umbrellaCols = [0xd8312a, 0x2a62c8, 0xf2c418, 0x2f9a4a, 0xf4f0e6, 0xe8661e, 0x7a2a8a, 0x1cb0c0].map((c) => new THREE.Color(c));
  const towelCols = [0xe84a6a, 0x3ab0e0, 0xf2c418, 0xffffff, 0x6ad06a, 0xe8661e, 0x8a4ae0].map((c) => new THREE.Color(c));
  const umbrellas = [], towels = [], crowd = [];
  const X0 = PLAY.x0 - 80, X1 = PLAY.x1 + 80;
  // family clusters between the dry-sand line and ~12 m above the waterline, denser near the stairs
  for (let i = 0; i < 520; i++) {
    const x = X0 + R() * (X1 - X0); const zw = waterZ(x); const z = BW.z1 + 14 + R() * (zw - BW.z1 - 30);
    if (umbrellas.some((u) => Math.hypot(u.x - x, u.z - z) < 7)) continue;
    const y = sandHeight(x, z);
    if (R() < 0.75) umbrellas.push({ x, y, z, ry: R() * 6.3, tilt: (R() - 0.5) * 0.3, c: umbrellaCols[(R() * umbrellaCols.length) | 0] });
    const n = 1 + ((R() * 4) | 0);
    for (let k = 0; k < n; k++) { const tx = x + (R() - 0.5) * 4, tz = z + (R() - 0.5) * 3; towels.push({ x: tx, y: sandHeight(tx, tz) + 0.02, z: tz, ry: R() * 6.3, c: towelCols[(R() * towelCols.length) | 0] }); if (R() < 0.5) { const lie = R() < 0.65; crowd.push({ x: tx, y: sandHeight(tx, tz) + (lie ? 0.02 : 0), z: tz, ry: R() * 6.3, pose: lie ? 'lie' : R() < 0.7 ? 'stand' : 'phone', bag: 0 }); } }
  }
  inst(scene, umbrellaGeo(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide, name: 'umbrella' }), umbrellas, true);
  inst(scene, new THREE.CylinderGeometry(0.025, 0.025, 2.3, 6).translate(0, 1.15, 0), M.alu, umbrellas.map((u) => ({ ...u, c: null })), true);
  { // towels: 1.8 x 0.9 m, 1 cm thick, with a woven stripe texture (critic r7 #10 — they were zero-thickness flat quads)
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 128);
    for (let y = 0; y < 128; y += 16) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, y, 64, 6); } g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(0, 0, 64, 5); g.fillRect(0, 123, 64, 5);
    const tt = new THREE.CanvasTexture(c); tt.colorSpace = THREE.SRGBColorSpace;
    inst(scene, new THREE.BoxGeometry(0.9, 0.012, 1.8), new THREE.MeshStandardMaterial({ color: 0xffffff, map: tt, roughness: 0.95, name: 'towel' }), towels, false); }
  // lifeguard chairs every ~120 m near the water (white wooden A-frame chair with a red cross panel)
  for (let x = PLAY.x0 + 40; x < PLAY.x1; x += 120) { const z = waterZ(x) - 22, y = sandHeight(x, z); for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) B.add('coasterWhite', boxGeo([x + dx - 0.08, y, z + dz - 0.08], [x + dx * 0.5 + 0.08, y + 3.2, z + dz * 0.5 + 0.08]), { uv: false }); B.box('coasterWhite', [x - 0.7, y + 2.2, z - 0.5], [x + 0.7, y + 2.35, z + 0.5]); B.box('coasterRed', [x - 0.6, y + 2.35, z - 0.52], [x + 0.6, y + 3.1, z - 0.45], { collide: false }); world.cover(x, z - 1.5, 0, -1, y); }
  // bathers standing in the shallows
  for (let i = 0; i < 70; i++) { const x = X0 + R() * (X1 - X0), z = waterZ(x) + 2 + R() * 14; crowd.push({ x, y: sandHeight(x, z) - 0.2, z, ry: R() * 6.3, pose: R() < 0.3 ? 'walk' : 'stand', bag: 0 }); }
  // boardwalk: dense two-way stroll, people at the rail looking out to sea
  crowd.push(...scatter(R, 170, PLAY.x0, PLAY.x1, BW.z0 + 1.5, BW.z1 - 3, 0, () => false, { walk: 0.75, bag: 0.05, gap: 2.2 }).map((c) => ({ ...c, ry: c.pose === 'walk' ? (R() < 0.5 ? Math.PI / 2 : -Math.PI / 2) + (R() - 0.5) * 0.3 : c.ry })));
  for (let i = 0; i < 40; i++) { const x = PLAY.x0 + R() * (PLAY.x1 - PLAY.x0); crowd.push({ x, y: 0, z: BW.z1 - 0.8, ry: 0 + (R() - 0.5) * 0.6, pose: R() < 0.3 ? 'phone' : 'stand', bag: 0 }); }
  // amusement area + streets: walkers on the OSM footpaths/streets south of the avenue, groups at the ride fences
  const blocked = (x, z) => OSM.b.some((b) => { const q = b._bb || (b._bb = bbox(b.p)); return x > q.x0 - 1 && x < q.x1 + 1 && z > q.z0 - 1 && z < q.z1 + 1; });
  crowd.push(...scatter(R, 160, PLAY.x0 + 40, PLAY.x1 - 20, -140, BW.z0 - 2, 0, blocked, { walk: 0.6, bag: 0.05, gap: 3 }));
  for (const r of OSM.rd) { if (!(r.x > PLAY.x0 && r.x < PLAY.x1 && r.z > PLAY.z0 && r.z < BW.z0)) continue; const n = 2 + ((R() * 5) | 0); for (let k = 0; k < n; k++) { const a = R() * 6.3, d = 8 + R() * 3; crowd.push({ x: r.x + Math.cos(a) * d, y: 0, z: r.z + Math.sin(a) * d, ry: Math.atan2(-Math.cos(a), -Math.sin(a)), pose: R() < 0.4 ? 'phone' : 'stand', bag: 0 }); } }
  const cams = Object.values(world.W.poses || {});
  buildCrowd(world, crowd.filter((c) => !cams.some((p) => Math.hypot(p[0] - c.x, p[2] - c.z) < 3.5)));
  B.flush({ shadow: true });
  gulls(world);
}

function umbrellaGeo() { // 8-panel canopy, alternating panels darker so the instance colour reads as stripes
  const g = new THREE.ConeGeometry(1.25, 0.55, 8, 1, true); g.translate(0, 2.25, 0);
  const col = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < g.attributes.position.count; i++) { const a = Math.atan2(g.attributes.position.getZ(i), g.attributes.position.getX(i)); const k = Math.floor((a + Math.PI) / (Math.PI / 4) + 0.5) % 2 ? 1 : 0.62; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
}
function inst(scene, geo, mat, list, shadow) {
  if (!list.length) return; if (geo.attributes.color) mat.vertexColors = true;
  const im = new THREE.InstancedMesh(geo, mat, list.length); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  list.forEach((u, i) => { e.set(u.tilt || 0, u.ry || 0, 0); q.setFromEuler(e); im.setMatrixAt(i, m4.compose(new THREE.Vector3(u.x, u.y, u.z), q, new THREE.Vector3(1, 1, 1))); if (u.c) im.setColorAt(i, u.c); });
  im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.castShadow = shadow; im.receiveShadow = true; scene.add(im);
}
function gulls(world) {
  const n = 26; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0, 0.08, 0.1, 0, 0.08, -0.1, 0.5, 0, 0, 0, 0.08, 0.1, 0, 0.08, -0.1], 3)); g.setIndex([0, 1, 2, 3, 5, 4]); g.computeVertexNormals();
  const im = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xf2f2f0, side: THREE.DoubleSide }), n); im.frustumCulled = false; world.scene.add(im);
  const R = world.R; const birds = Array.from({ length: n }, () => ({ cx: -200 + R() * 400, cz: 150 + R() * 150, r: 10 + R() * 30, h: 12 + R() * 20, w: 0.2 + R() * 0.3, ph: R() * 6 }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(); let t = 0;
  world.updaters.push((dt) => { t += dt; birds.forEach((b, i) => { const a = b.ph + t * b.w; e.set(0, -a, Math.sin(t * 6 + i) * 0.4); q.setFromEuler(e); const s = 1 + 0.3 * Math.sin(t * 7 + i); m4.compose(new THREE.Vector3(b.cx + Math.cos(a) * b.r, b.h + Math.sin(t + i) * 1.5, b.cz + Math.sin(a) * b.r), q, new THREE.Vector3(s, 1, 1)); im.setMatrixAt(i, m4); }); im.instanceMatrix.needsUpdate = true; });
}
