// CONEY — the grounds of the Luna Park Houses, after the aerial photo: between the towers big lawns crossed by paths,
// a fenced asphalt "traffic garden" court with painted road loops (kids ride bikes round it), fenced playgrounds with
// rubber safety surface (climbing tower + slide, swings, spring riders), flower beds at every entrance and along the lawn
// edges, hydrangea shrubs, and wooden water tanks up on the towers' roofs.
// Everything is placed by scanning the real lawn meshes (housing.js 'hLawn') for clear ground — no trees, walls or paths
// under it — and aligned to the nearest tower. CONEY agent (greens).
import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function buildGreens(world, M) {
  const { scene, ctx } = world; const towers = world.lunaTowers || []; if (!towers.length || !M?.hLawn) return;
  // ---- lawn lookup: raycast down onto the lawn batch (BVH) ----
  const lawns = []; scene.traverse((o) => { if (o.isMesh && o.material === M.hLawn) lawns.push(o); });
  if (!lawns.length) { console.warn('[greens] no lawn meshes'); return; }
  for (const m of lawns) { if (!m.geometry.boundsTree) m.geometry.boundsTree = new MeshBVH(m.geometry); m.raycast = acceleratedRaycast; m.updateMatrixWorld(true); }
  const rc = new THREE.Raycaster(); rc.firstHitOnly = true; const down = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3();
  const isLawn = (x, z) => { o.set(x, 3, z); rc.set(o, down); rc.far = 4; return rc.intersectObjects(lawns, false).length > 0; };
  const blocked = (x, z, r = 0.6) => ctx.colliders.some((b) => b.max.y > 0.2 && b.min.y < 2 && x > b.min.x - r && x < b.max.x + r && z > b.min.z - r && z < b.max.z + r);
  const W = world.W, keepOut = [W.onlineStart, W.stillwell?.concourse?.toArray?.()].filter(Boolean);
  const nearTower = (x, z) => { let best = towers[0], bd = 1e9; for (const t of towers) { const d = Math.hypot(t.centre.x - x, t.centre.z - z); if (d < bd) { bd = d; best = t; } } return best; };
  const axisOf = (t) => { const a = t.toWorld(0, 0, 0), b = t.toWorld(1, 0, 0); return Math.atan2(b.x - a.x, b.z - a.z); };
  // a rectangle (w × d, yaw) is free if every sample is lawn, nothing solid is on it, and it's clear of what's already placed
  const placed = [];
  const fits = (cx, cz, w, d, yaw, pad = 1) => {
    if (keepOut.some((k) => Math.hypot(k[0] - cx, k[2] - cz) < Math.max(w, d) / 2 + 14)) return false;
    if (placed.some((p) => Math.hypot(p.x - cx, p.z - cz) < (p.r + Math.max(w, d) / 2 + 4))) return false;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let u = -w / 2 - pad; u <= w / 2 + pad + 0.01; u += 2) for (let v = -d / 2 - pad; v <= d / 2 + pad + 0.01; v += 2) {
      const x = cx + u * c + v * s, z = cz - u * s + v * c; if (!isLawn(x, z) || blocked(x, z, 0.3)) return false; }
    return true;
  };
  // candidates: lawn points in the Luna Park superblock, nearest the middle of the towers first
  const cx0 = towers.reduce((a, t) => a + t.centre.x, 0) / towers.length, cz0 = towers.reduce((a, t) => a + t.centre.z, 0) / towers.length;
  const cand = []; for (let x = cx0 - 190; x <= cx0 + 190; x += 5) for (let z = cz0 - 220; z <= cz0 + 220; z += 5) cand.push([x, z, Math.hypot(x - cx0, z - cz0)]);
  cand.sort((a, b) => a[2] - b[2]);
  const findSpot = (w, d) => { for (const [x, z] of cand) { if (!isLawn(x, z)) continue; const t = nearTower(x, z); const base = axisOf(t);
    for (const yaw of [base, base + Math.PI / 2]) if (fits(x, z, w, d, yaw)) { placed.push({ x, z, r: Math.max(w, d) / 2 }); return { x, z, yaw }; } } return null; };
  const mats = makeMats();
  const G = new Map(); const put = (m, g) => (G.get(m) || G.set(m, []).get(m)).push(g.index ? g.toNonIndexed() : g);
  const at = (P, lx, lz) => { const c = Math.cos(P.yaw), s = Math.sin(P.yaw); return [P.x + lx * c + lz * s, P.z - lx * s + lz * c]; };
  const box = (m, P, lx, ly, lz, w, h, d, rx = 0, ry = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateX(rx); g.rotateZ(rz); g.rotateY(ry + P.yaw); const [x, z] = at(P, lx, lz); g.translate(x, ly, z); put(m, g); };
  const cyl = (m, P, lx, ly, lz, r0, r1, h, seg = 12) => { const g = new THREE.CylinderGeometry(r1, r0, h, seg); const [x, z] = at(P, lx, lz); g.translate(x, ly, z); put(m, g); };
  const col = (P, lx0, lz0, lx1, lz1, h) => { for (let u = lx0; u < lx1 - 0.01; u += 0.6) for (let v = lz0; v < lz1 - 0.01; v += 0.6) { const [x, z] = at(P, u + 0.3, v + 0.3); world.box([x - 0.34, 0, z - 0.34], [x + 0.34, h, z + 0.34]); } };
  const fence = (P, w, d, gaps) => {   // black steel picket fence round a rectangle with gaps (local x ranges) on the ±d/2 sides
    const run = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(z1 - z0, x1 - x0); if (L < 0.3) return;
      for (const y of [0.15, 1.05]) box(mats.iron, P, (x0 + x1) / 2, y, (z0 + z1) / 2, L, 0.04, 0.04, 0, -a);
      for (let k = 0; k <= L / 0.14; k++) { const t = k * 0.14 / L; box(mats.iron, P, x0 + (x1 - x0) * t, 0.55, z0 + (z1 - z0) * t, 0.018, 1.1, 0.018); }
      const n = Math.max(1, Math.round(L / 0.6)); for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; const [x, z] = at(P, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t); world.box([x - 0.25, 0, z - 0.25], [x + 0.25, 1.1, z + 0.25]); } };
    const hw = w / 2, hd = d / 2;
    for (const sz of [-1, 1]) { let x = -hw; for (const [g0, g1] of gaps) { run(x, sz * hd, g0, sz * hd); x = g1; } run(x, sz * hd, hw, sz * hd); }
    run(-hw, -hd, -hw, hd); run(hw, -hd, hw, hd);
  };
  // ---- the traffic garden: asphalt, painted loops, a big tree, benches, fence with two openings ----
  const TG = findSpot(28, 20);
  if (TG) {
    const pad = new THREE.PlaneGeometry(28, 20); pad.rotateX(-Math.PI / 2); pad.rotateY(TG.yaw); pad.translate(TG.x, 0.05, TG.z); put(mats.court, pad);
    fence(TG, 28, 20, [[-3, 1.5]]);
    for (const [lx, lz] of [[-10, 11.3], [0, 11.3], [10, 11.3]]) { box(mats.bench, TG, lx, 0.45, lz, 1.8, 0.06, 0.42); box(mats.bench, TG, lx, 0.7, lz + 0.2, 1.8, 0.4, 0.05); }
    tree(put, mats, ...at(TG, 6, -3), 1.25);
    placedFeature('TRAFFIC GARDEN', TG);
  }
  // ---- two playgrounds ----
  for (let k = 0; k < 2; k++) {
    const P = findSpot(16, 13); if (!P) break;
    const surf = new THREE.PlaneGeometry(16, 13); surf.rotateX(-Math.PI / 2); surf.rotateY(P.yaw); surf.translate(P.x, 0.06, P.z); put(k ? mats.rubberB : mats.rubberA, surf);
    fence(P, 16, 13, [[-1.5, 1.5]]);
    // climbing tower: 4 posts, deck at 1.5 m, coloured roof, a slide off one side, a ladder the other
    for (const [lx, lz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) box(mats.post, P, -3 + lx, 1.4, -1 + lz, 0.12, 2.8, 0.12);
    box(mats.deck, P, -3, 1.5, -1, 2.6, 0.1, 2.6); box(k ? mats.roofB : mats.roofA, P, -3, 3.0, -1, 3.0, 0.12, 3.0, 0, Math.PI / 4 * 0);
    box(k ? mats.roofB : mats.roofA, P, -3, 3.35, -1, 2.0, 0.6, 2.0, 0, 0, 0);
    for (const sx of [-1, 1]) box(mats.rail, P, -3 + sx * 1.25, 2.0, -1, 0.06, 0.8, 2.6);
    box(mats.slide, P, -3, 0.85, 1.9, 0.7, 0.06, 3.2, 0.52, 0);                        // the slide chute
    for (const sx of [-1, 1]) box(mats.slide, P, -3 + sx * 0.36, 1.0, 1.9, 0.05, 0.25, 3.2, 0.52, 0);
    for (let r = 0; r < 5; r++) box(mats.rail, P, -4.45, 0.3 + r * 0.3, -1, 0.05, 0.05, 0.9);   // ladder rungs
    col(P, -4.3, -2.3, -1.7, 0.3, 1.6);
    // swings: steel A-frame, two seats on chains
    for (const sx of [-1, 1]) { box(mats.post, P, 3.5 + sx * 1.9, 1.1, 3, 0.1, 2.4, 0.1, 0.35, 0); box(mats.post, P, 3.5 + sx * 1.9, 1.1, 1.6, 0.1, 2.4, 0.1, -0.35, 0); }
    box(mats.post, P, 3.5, 2.3, 2.3, 4.0, 0.1, 0.1);
    for (const sx of [-0.8, 0.8]) { for (const cz of [-0.18, 0.18]) box(mats.chain, P, 3.5 + sx, 1.45, 2.3 + cz, 0.02, 1.7, 0.02); box(mats.seat, P, 3.5 + sx, 0.58, 2.3, 0.5, 0.05, 0.22); }
    col(P, 1.5, 1.4, 5.5, 3.2, 2.2);
    // spring riders + a bench outside the fence
    for (const [lx, lz, m] of [[3, -3, mats.roofA], [5, -3.5, mats.roofB]]) { box(mats.chain, P, lx, 0.25, lz, 0.18, 0.5, 0.18); box(m, P, lx, 0.7, lz, 0.35, 0.35, 0.8); }
    box(mats.bench, P, 0, 0.45, 7.3, 2, 0.06, 0.42); box(mats.bench, P, 0, 0.7, 7.5, 2, 0.4, 0.05);
    placedFeature('PLAYGROUND', P);
  }
  // ---- flower beds: at every lobby door (both sides of the path), plus along lawn edges ----
  const flowers = [];
  const bed = (x, z, yaw, len = 3.2, wid = 1.1) => {
    const P = { x, z, yaw }; box(mats.soil, P, 0, 0.07, 0, len, 0.14, wid); box(mats.kerb, P, 0, 0.1, wid / 2 + 0.05, len + 0.2, 0.2, 0.1); box(mats.kerb, P, 0, 0.1, -wid / 2 - 0.05, len + 0.2, 0.2, 0.1);
    const n = Math.round(len * wid * 7); for (let i = 0; i < n; i++) { const [fx, fz] = at(P, (Math.random() - 0.5) * (len - 0.2), (Math.random() - 0.5) * (wid - 0.2)); flowers.push([fx, fz, Math.floor(Math.random() * 4), 0.7 + Math.random() * 0.6]); }
  };
  for (const t of towers) for (const d of t.lobby?.doors || []) {
    const out = d.outside, inn = d.inside, dir = new THREE.Vector3(out.x - inn.x, 0, out.z - inn.z).normalize(), side = new THREE.Vector3(-dir.z, 0, dir.x), yaw = Math.atan2(side.x, side.z) - Math.PI / 2;
    for (const sg of [-1, 1]) { const p = inn.clone().addScaledVector(dir, 4.5).addScaledVector(side, sg * 3.4); if (isLawn(p.x, p.z) && !blocked(p.x, p.z, 0.4)) bed(p.x, p.z, yaw); }
  }
  let edgeBeds = 0;
  for (const [x, z] of cand) { if (edgeBeds >= 22) break; if (!isLawn(x, z) || blocked(x, z, 0.8)) continue;
    const edge = [[3, 0], [-3, 0], [0, 3], [0, -3]].find(([dx, dz]) => !isLawn(x + dx, z + dz) && !blocked(x + dx, z + dz, 0.2)); if (!edge) continue;
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 3) || flowers.some((f) => Math.hypot(f[0] - x, f[1] - z) < 9)) continue;
    const yaw = Math.atan2(edge[0], edge[1]) + Math.PI / 2; bed(x - edge[0] * 0.35, z - edge[1] * 0.35, yaw, 4 + Math.random() * 2, 1.0); edgeBeds++;
    if (Math.random() < 0.5) { const [hx, hz] = [x - edge[1] * 3, z + edge[0] * 3]; if (isLawn(hx, hz) && !blocked(hx, hz, 0.6)) for (let i = 0; i < 3; i++) { const g = new THREE.SphereGeometry(0.55 + Math.random() * 0.25, 10, 8); g.translate(hx + (Math.random() - 0.5) * 1.6, 0.5, hz + (Math.random() - 0.5) * 1.6); put(Math.random() < 0.5 ? mats.hydrPink : mats.hydrBlue, g); } }
  }
  // the flowers themselves: crossed quads (instanced), four kinds from one atlas
  if (flowers.length) {
    const q1 = new THREE.PlaneGeometry(0.34, 0.34), q2 = q1.clone(); q2.rotateY(Math.PI / 2); const cross = mergeGeometries([q1, q2]); cross.translate(0, 0.17, 0);
    const uv = cross.attributes.uv; const im = new THREE.InstancedMesh(cross, mats.flower, flowers.length); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    im.geometry = cross; im.geometry.setAttribute('kind', new THREE.InstancedBufferAttribute(new Float32Array(flowers.map((f) => f[2])), 1)); void uv;
    flowers.forEach(([x, z, , s], i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI); sc.setScalar(s); p.set(x, 0.12, z); m4.compose(p, q, sc); im.setMatrixAt(i, m4); });
    im.instanceMatrix.needsUpdate = true; im.castShadow = false; im.receiveShadow = true; scene.add(im);
  }
  // ---- rooftop water tanks (two, side by side, on steel stands) on building 2 and the tower nearest the middle ----
  const tankTowers = [world.lunaTowers.find((t) => t === towers.find((x) => x.core)) , ...towers].filter(Boolean);
  const done = new Set();
  for (const t of [nearTower(cx0, cz0), towers[1]]) { if (!t || done.has(t) || !t.core) continue; done.add(t);
    const k = t.core, y = k.roof?.y ?? 50, a = k.A ? k.A[0] + 4.5 : 0, c = k.C ? (k.C[0] + k.C[1]) / 2 : 0;
    for (const da of [0, 5.2]) { const p = t.toWorld(a + da, y, c); const P = { x: p.x, z: p.z, yaw: 0 };
      for (const [lx, lz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) cyl(mats.steelDark, P, lx, y + 1.5, lz, 0.1, 0.1, 3, 6);
      box(mats.steelDark, P, 0, y + 3.05, 0, 3.6, 0.15, 3.6);
      cyl(mats.tankWood, P, 0, y + 5.2, 0, 1.9, 1.9, 4.2, 20);
      for (const hy of [3.6, 4.6, 5.6, 6.6]) cyl(mats.steelDark, P, 0, y + hy, 0, 1.93, 1.93, 0.08, 20);
      { const g = new THREE.ConeGeometry(2.0, 1.1, 20); g.translate(P.x, y + 7.85, P.z); put(mats.tankRoof, g); } } }
  void tankTowers;
  for (const [m, list] of G) { const mesh = new THREE.Mesh(mergeGeometries(list, false), m); mesh.castShadow = m !== mats.court && m !== mats.rubberA && m !== mats.rubberB && m !== mats.soil; mesh.receiveShadow = true; scene.add(mesh); }
  function placedFeature(name, P) { (W.mapPOIs || (W.mapPOIs = [])).push({ name, x: P.x, z: P.z, kind: 'landmark' }); }
  console.log('[greens]', TG ? 'traffic garden ✓' : 'no court', '·', placed.length - (TG ? 1 : 0), 'playgrounds ·', flowers.length, 'flowers');
}

function tree(put, mats, x, z, s = 1) {
  const tr = new THREE.CylinderGeometry(0.18 * s, 0.26 * s, 3.2 * s, 8); tr.translate(x, 1.6 * s, z); put(mats.trunk, tr);
  for (const [dx, dy, dz, r] of [[0, 4.2, 0, 2.3], [1.2, 3.8, 0.6, 1.6], [-1.1, 3.9, -0.5, 1.7], [0.3, 5.1, -0.7, 1.4]]) { const g = new THREE.IcosahedronGeometry(r * s, 1); g.translate(x + dx * s, dy * s, z + dz * s); put(mats.leaves, g); }
}
function canvasTex(w, h, draw, rep) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); } return t; }
function makeMats() {
  const S = (c, r = 0.8, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  // the traffic garden: asphalt with two painted road loops, dashed centre lines, a zebra crossing, stop bars
  const court = canvasTex(1024, 732, (g, w, h) => {
    g.fillStyle = '#56585b'; g.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { const v = 70 + Math.random() * 40; g.fillStyle = `rgba(${v},${v},${v + 3},0.45)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.strokeStyle = '#e9e6dc'; g.lineWidth = 6; g.lineJoin = 'round';
    const loop = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * w, y * h) : g.moveTo(x * w, y * h))); g.closePath(); g.stroke(); };
    const L1 = [[0.12, 0.2], [0.5, 0.12], [0.86, 0.22], [0.9, 0.55], [0.72, 0.84], [0.35, 0.86], [0.12, 0.66]], L2 = [[0.22, 0.32], [0.48, 0.26], [0.74, 0.34], [0.76, 0.54], [0.62, 0.72], [0.36, 0.72], [0.24, 0.58]];
    const smooth = (P) => { const out = []; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; for (let t = 0; t < 1; t += 0.1) { const c = P[(i + 2) % P.length], p0 = P[(i - 1 + P.length) % P.length]; const t2 = t * t, t3 = t2 * t; out.push([0.5 * ((2 * a[0]) + (-p0[0] + b[0]) * t + (2 * p0[0] - 5 * a[0] + 4 * b[0] - c[0]) * t2 + (-p0[0] + 3 * a[0] - 3 * b[0] + c[0]) * t3), 0.5 * ((2 * a[1]) + (-p0[1] + b[1]) * t + (2 * p0[1] - 5 * a[1] + 4 * b[1] - c[1]) * t2 + (-p0[1] + 3 * a[1] - 3 * b[1] + c[1]) * t3)]); } } return out; };
    loop(smooth(L1)); loop(smooth(L2));
    g.setLineDash([22, 22]); g.lineWidth = 3; const mid = smooth(L1).map(([x, y], i) => { const [x2, y2] = smooth(L2)[i]; return [(x + x2) / 2, (y + y2) / 2]; }); loop(mid); g.setLineDash([]);
    g.fillStyle = '#e9e6dc'; for (let k = 0; k < 6; k++) g.fillRect(w * 0.47 + k * 16, h * 0.12, 9, h * 0.13);   // zebra
    g.lineWidth = 5; g.beginPath(); g.moveTo(w * 0.86, h * 0.56); g.lineTo(w * 0.77, h * 0.54); g.stroke();
  });
  const rubber = (a, b) => canvasTex(256, 256, (g) => { g.fillStyle = a; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 6000; i++) { g.fillStyle = Math.random() < 0.5 ? b : 'rgba(0,0,0,0.18)'; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); } }, [4, 3]);
  const wood = canvasTex(256, 256, (g) => { g.fillStyle = '#6e4a2c'; g.fillRect(0, 0, 256, 256); for (let x = 0; x < 256; x += 14) { g.fillStyle = `rgba(${40 + Math.random() * 30},${25 + Math.random() * 20},15,0.5)`; g.fillRect(x, 0, 2, 256); for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(30,18,8,0.25)'; g.fillRect(x + Math.random() * 12, Math.random() * 256, 1, 8 + Math.random() * 20); } } }, [6, 1]);
  const flowerTex = canvasTex(256, 64, (g) => {   // 4 kinds in a row: red geranium, yellow marigold, purple petunia, white daisy
    const cols = [['#c8141e', '#7a0a0e'], ['#f2b418', '#b36a08'], ['#8a3ac0', '#4a1a70'], ['#f4f2ea', '#e8c030']];
    cols.forEach(([pet, ctr], k) => { const ox = k * 64; g.fillStyle = '#2f6a22'; g.fillRect(ox + 30, 30, 4, 34); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, cx = ox + 32 + Math.cos(a) * 10, cy = 22 + Math.sin(a) * 10; g.fillStyle = pet; g.beginPath(); g.ellipse(cx, cy, 9, 6, a, 0, 7); g.fill(); } g.fillStyle = ctr; g.beginPath(); g.arc(ox + 32, 22, 5, 0, 7); g.fill();
      g.fillStyle = '#3f7a2a'; g.beginPath(); g.ellipse(ox + 22, 46, 8, 4, 0.6, 0, 7); g.fill(); g.beginPath(); g.ellipse(ox + 42, 50, 8, 4, -0.6, 0, 7); g.fill(); });
  });
  const flower = new THREE.MeshStandardMaterial({ map: flowerTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 });
  flower.onBeforeCompile = (sh) => {   // pick one of the 4 flowers per instance from the 'kind' attribute
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float kind;').replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = vec2((uv.x + kind) / 4.0, uv.y);\n#endif');
  };
  return {
    court: new THREE.MeshStandardMaterial({ map: court, roughness: 0.9 }), rubberA: new THREE.MeshStandardMaterial({ map: rubber('#a8462e', '#c86a4a'), roughness: 0.95 }), rubberB: new THREE.MeshStandardMaterial({ map: rubber('#2e5f8a', '#4a86b8'), roughness: 0.95 }),
    iron: S(0x1b1b1d, 0.5, 0.6), bench: S(0x2e5a3a, 0.8), post: S(0x2a6ab0, 0.4, 0.5), deck: S(0x6a6e72, 0.6, 0.4), rail: S(0xe0b422, 0.4, 0.3), slide: S(0xe8c21a, 0.3, 0.1), roofA: S(0xc8321e, 0.6), roofB: S(0x2a8a4a, 0.6),
    chain: S(0x8d9296, 0.35, 0.9), seat: S(0x1a1a1a, 0.8), soil: S(0x3a2a1c, 1), kerb: S(0xb3aea4, 0.9), hydrPink: S(0xd88ab8, 0.8), hydrBlue: S(0x8aa8e0, 0.8),
    trunk: S(0x4a3a2a, 1), leaves: S(0x4a6a2e, 0.95), steelDark: S(0x2b2c2e, 0.6, 0.6), tankWood: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.95 }), tankRoof: S(0x3a2e24, 0.9), flower,
  };
}
