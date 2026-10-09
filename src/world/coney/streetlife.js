// CONEY street life (after traffic + folk): the small things that make a block read as New York —
//  · pigeons: flocks on the sidewalks and plazas pecking about; walk up (or run) and the flock bursts up, circles, lands again;
//  · litter: coffee cups, wrappers, chip bags, newspaper pages and cans in the gutters and on the sidewalks;
//  · delivery trucks at the kerb with their hazards going, the back open, a guy with a hand truck stacked with cases;
//  · bus stops that work: people wait at the sign, get on when a bus dwells there, and riders step off and walk away.
// One InstancedMesh per kind (pigeons are animated only near the camera), merged trucks; phones get smaller counts. CONEY agent.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OSM, PLAY } from './osm.js';
import { BW } from './shore.js';
import { streetAt } from './fronts.js';
import { addFolkSpots } from './folk.js';
import { BUS_STOPS } from './traffic.js';

const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L)); return Math.hypot(a[0] + t * dx - x, a[1] + t * dz - z); };
const inRoad = (x, z, pad = 0.2) => OSM.r.some((r) => { for (let i = 0; i + 1 < r.p.length; i++) if (segD(x, z, r.p[i], r.p[i + 1]) < r.w / 2 + pad) return true; return false; });
const inMap = (x, z) => x > PLAY.x0 + 3 && x < PLAY.x1 - 3 && z > -556 && z < BW.z0 - 3;
function walkLine(p, step, fn, start = step / 2) { let carry = start; for (let i = 0; i + 1 < p.length; i++) { const [ax, az] = p[i], [bx, bz] = p[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 1e-3) continue; const ux = (bx - ax) / L, uz = (bz - az) / L; let d = carry; while (d < L) { fn(ax + ux * d, az + uz * d, ux, uz); d += step; } carry = d - L; } }
const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };

export function buildStreetLife(world) {
  const { scene, ctx, W } = world, lite = !!ctx.lite; let seed = 55117; const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const blocked = (x, z, rad = 0.5) => ctx.colliders.some((b) => x > b.min.x - rad && x < b.max.x + rad && z > b.min.z - rad && z < b.max.z + rad && b.max.y > 0.2 && b.min.y < 2.5);
  const st = { pigeons: 0, litter: 0, trucks: 0, waiting: 0 };
  const roads = OSM.r.filter((r) => r.w >= 9 && !r.busLoop && r.p.some(([x, z]) => inMap(x, z))).map((r) => ({ r, kind: streetAt(r.p[Math.floor(r.p.length / 2)][0], r.p[Math.floor(r.p.length / 2)][1]) }));
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();

  // ---- litter -------------------------------------------------------------------------------------------------------------
  { const atlas = canvasTex(512, 128, (g) => {
      g.clearRect(0, 0, 512, 128);
      g.fillStyle = '#f4f2ea'; g.beginPath(); g.ellipse(64, 64, 40, 54, 0.3, 0, 7); g.fill(); g.fillStyle = '#6b3a1a'; g.beginPath(); g.ellipse(64, 50, 30, 16, 0.3, 0, 7); g.fill(); g.fillStyle = '#2a62c8'; g.fillRect(40, 70, 48, 8);   // a coffee cup on its side
      g.fillStyle = '#e8e4da'; g.beginPath(); for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28, r = 30 + Math.random() * 20; g.lineTo(192 + Math.cos(a) * r, 64 + Math.sin(a) * r); } g.fill(); g.strokeStyle = 'rgba(0,0,0,.25)'; g.stroke();   // crumpled napkin
      g.fillStyle = '#d8301e'; g.beginPath(); g.moveTo(276, 30); g.lineTo(366, 24); g.lineTo(372, 100); g.lineTo(272, 108); g.closePath(); g.fill(); g.fillStyle = '#ffd23a'; g.font = '700 20px Arial'; g.fillText('CHIPS', 290, 72);   // a chip bag
      g.fillStyle = '#e9e6dc'; g.fillRect(392, 14, 108, 100); g.fillStyle = 'rgba(40,40,40,.55)'; for (let y = 24; y < 108; y += 7) g.fillRect(398 + ((y / 7) % 2) * 50, y, 46, 3); g.font = '900 16px Georgia'; g.fillStyle = '#111'; g.fillText('DAILY POST', 400, 30);   // newspaper page
    });
    const mat = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, roughness: 0.9, side: THREE.DoubleSide });
    const want = lite ? 260 : 650, items = [[], [], [], []], cans = [];
    for (let k = 0; k < want * 3 && items.reduce((a, b) => a + b.length, cans.length) < want; k++) {
      const q = roads[(R() * roads.length) | 0]; if (!q) break; const { r, kind } = q; const i = (R() * (r.p.length - 1)) | 0, [ax, az] = r.p[i], [bx, bz] = r.p[i + 1], t = R(), L = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / L, uz = (bz - az) / L;
      if (kind === 'surf' && R() < 0.4) continue;   // Surf gets swept more
      const s = R() < 0.5 ? 1 : -1, off = R() < 0.55 ? r.w / 2 - 0.25 - R() * 0.4 : r.w / 2 + 0.6 + R() * 2.5, x = ax + ux * L * t - uz * s * off, z = az + uz * L * t + ux * s * off;
      if (!inMap(x, z) || blocked(x, z, 0.1)) continue;
      if (R() < 0.2) cans.push([x, z, R() * 6.28]); else items[(R() * 4) | 0].push([x, z, R() * 6.28, 0.18 + R() * 0.25]);
    }
    for (const [x, z, a, sc, cell] of W.brightonLitter || []) items[cell].push([x, z, a, sc]);   // Brighton Beach Av's kerbs too
    items.forEach((list, cell) => { if (!list.length) return; const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setX(i, (cell + u.getX(i)) / 4);
      const im = new THREE.InstancedMesh(g, mat, list.length); list.forEach(([x, z, a, sc], i) => { _e.set(0, a, 0); _q.setFromEuler(_e); im.setMatrixAt(i, _m.compose(_p.set(x, 0.035 + i * 1e-5, z), _q, _s.set(sc * (cell === 3 ? 2.2 : 1), 1, sc * (cell === 3 ? 1.8 : 1)))); }); im.receiveShadow = true; im.name = 'life:litter'; scene.add(im); st.litter += list.length; });
    if (cans.length) { const g = new THREE.CylinderGeometry(0.033, 0.033, 0.12, 8); g.rotateZ(Math.PI / 2); const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.8 }), cans.length);
      const cc = [0xc8202a, 0x2a62c8, 0x2fbf6a, 0xd8d8d8, 0xf2c418]; cans.forEach(([x, z, a], i) => { _e.set(0, a, 0); _q.setFromEuler(_e); im.setMatrixAt(i, _m.compose(_p.set(x, 0.035, z), _q, _s.set(1, 1, 1))); im.setColorAt(i, _c.set(cc[i % cc.length])); }); im.name = 'life:cans'; scene.add(im); st.litter += cans.length; }
  }

  // ---- delivery trucks at the kerb, hazards on, a worker unloading ------------------------------------------------------------
  const LIVERY = [['FRESHLY DIRECT', '#ffffff', '#2f8a3a'], ['UPX', '#4a2f1d', '#f2c418'], ['COLA-COLA', '#c8102e', '#ffffff'], ['BOARHEAD PROVISIONS', '#ffffff', '#8a1a1a'], ['MOTHER RUSSIA IMPORTS', '#1f3f8a', '#ffd23a'], ['BREADWINNER BAKERY', '#f2e6c8', '#c8202a']];
  const hazard = new THREE.MeshStandardMaterial({ color: 0xff9a1a, emissive: 0xff8a10, emissiveIntensity: 0 }), trucks = [], workers = [];
  { const want = lite ? 3 : 6, cand = [];
    for (const { r, kind } of roads) { if (r.w < 14 || !['mermaid', 'surf', 'stillwell', 'w8', 'w12', 'neptune'].includes(kind)) continue; walkLine(r.p, 23, (x, z, ux, uz) => cand.push({ x, z, ux, uz, w: r.w })); }
    for (let k = 0; k < cand.length * 2 && trucks.length < want; k++) {
      const c = cand[(R() * cand.length) | 0]; const s = R() < 0.5 ? 1 : -1, off = c.w / 2 - 1.35, x = c.x - c.uz * s * off, z = c.z + c.ux * s * off;
      if (!inMap(x, z) || blocked(x, z, 3.2) || trucks.some((t) => Math.hypot(t.x - x, t.z - z) < 60)) continue;
      trucks.push({ x, z, ry: Math.atan2(c.ux * s, c.uz * s) + (s > 0 ? 0 : 0), s, ux: c.ux, uz: c.uz, liv: LIVERY[trucks.length % LIVERY.length] });
    }
    const geos = new Map(); const add = (key, g, color) => { if (color != null) { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); const n = g.attributes.position.count, a = new Float32Array(n * 3); _c.set(color); for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); } (geos.get(key) || geos.set(key, []).get(key)).push(g); };
    const liveryTex = canvasTex(1024, 1024, (g) => LIVERY.forEach(([n, bg, fg], i) => { const y = i * (1024 / 6); g.fillStyle = bg; g.fillRect(0, y, 1024, 1024 / 6); g.fillStyle = fg; g.font = '900 64px "Arial Black", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; let f = 64; g.font = `900 ${f}px "Arial Black", Arial`; const w = g.measureText(n).width; if (w > 940) { f *= 940 / w; g.font = `900 ${f}px "Arial Black", Arial`; } g.fillText(n, 512, y + 1024 / 12); g.fillRect(40, y + 1024 / 6 - 26, 944, 8); }));
    trucks.forEach((t, ti) => {
      const place = (g) => { g.rotateY(t.ry); g.translate(t.x, 0, t.z); return g; };
      const bx = (sx, sy, sz, x, y, z) => { const g = new THREE.BoxGeometry(sx, sy, sz); g.translate(x, y, z); return place(g); };   // truck frame: +z forward, +x right
      add('col', bx(2.3, 2.5, 4.6, 0, 2.05, -1.1), 0xf2f2ee);                        // the box
      add('col', bx(2.2, 1.9, 1.9, 0, 1.55, 2.3), t.liv[1] === '#ffffff' ? 0xd8dde2 : t.liv[1]);   // the cab
      add('col', bx(2.1, 0.8, 0.05, 0, 1.95, 3.26), 0x1d2733); add('col', bx(2.3, 0.45, 6.6, 0, 0.55, 0.0), 0x2a2c30);   // windshield, chassis
      for (const [wx, wz] of [[-1.0, 2.3], [1.0, 2.3], [-1.0, -1.9], [1.0, -1.9], [-1.0, -2.9], [1.0, -2.9]]) { const g = new THREE.CylinderGeometry(0.48, 0.48, 0.32, 14); g.rotateZ(Math.PI / 2); g.translate(wx, 0.48, wz); add('col', place(g), 0x161616); }
      add('col', bx(2.3, 2.5, 0.06, 0, 2.05, -3.43), 0x8a8f94);                       // the rear frame (roll-up door open)
      add('col', bx(2.1, 0.05, 1.6, 0, 0.95, -4.25), 0x9aa0a6);                       // the lift gate down
      for (const [hx, hz] of [[-1.0, 3.25], [1.0, 3.25], [-1.1, -3.45], [1.1, -3.45]]) add('haz', bx(0.18, 0.12, 0.06, hx, 1.1, hz), null);
      // the livery: a strip of the atlas on both sides of the box
      const li = LIVERY.indexOf(t.liv); for (const side of [-1, 1]) { const g = new THREE.PlaneGeometry(4.5, 1.6); const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i), 1 - (li + 1) / 6 + u.getY(i) / 6); g.rotateY(side * Math.PI / 2); g.translate(side * 1.17, 2.2, -1.1); add('liv', place(g), null); }
      // the hand truck at the back with three cases, and the guy unloading
      const hx = -0.6, hz = -5.2; add('col', bx(0.5, 1.3, 0.08, hx, 0.65, hz - 0.2), 0x2a2c30); for (let k = 0; k < 3; k++) add('col', bx(0.48, 0.32, 0.4, hx, 0.2 + k * 0.33, hz), [0xa0743c, 0x8a5a2a, 0xa0743c][k]);
      const fx = Math.sin(t.ry), fz = Math.cos(t.ry), rx = Math.cos(t.ry), rz = -Math.sin(t.ry), wpx = t.x + rx * 0.3 + fx * -5.0, wpz = t.z + rz * 0.3 + fz * -5.0;
      workers.push({ x: wpx, y: 0, z: wpz, ry: t.ry + Math.PI, pose: 'stand', zone: 'vendor', arch: 'worker' });
      world.box([t.x - 2.4, 0, t.z - 2.4], [t.x + 2.4, 3.3, t.z + 2.4]); world.box([t.x + fx * -2 - 1.3, 0, t.z + fz * -2 - 1.3], [t.x + fx * -2 + 1.3, 3.3, t.z + fz * -2 + 1.3]); world.box([t.x + fx * 2 - 1.3, 0, t.z + fz * 2 - 1.3], [t.x + fx * 2 + 1.3, 3.3, t.z + fz * 2 + 1.3]);
      st.trucks++;
    });
    if (geos.get('col')) { const me = new THREE.Mesh(mergeGeometries(geos.get('col'), false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 })); me.castShadow = !lite; me.receiveShadow = true; me.name = 'life:trucks'; scene.add(me); }
    if (geos.get('haz')) { const me = new THREE.Mesh(mergeGeometries(geos.get('haz'), false), hazard); me.name = 'life:hazards'; scene.add(me); }
    if (geos.get('liv')) { const me = new THREE.Mesh(mergeGeometries(geos.get('liv'), false), new THREE.MeshStandardMaterial({ map: liveryTex, roughness: 0.5 })); me.name = 'life:livery'; scene.add(me); }
    world.updaters.push(() => { hazard.emissiveIntensity = Math.floor(performance.now() / 450) % 2 ? 2.2 : 0; });
  }

  // ---- pigeons ------------------------------------------------------------------------------------------------------------
  { const flocksAt = [[-82, -150], [-60, -136], [-110, -96], [-56, -210], [-30, -205], [80, -392], [-150, -282], [-85, -282], [20, -125], [200, -102], [-20, 130], [120, 132], [-200, 135]];
    if (W.onlineStart) flocksAt.push([W.onlineStart[0] + 6, W.onlineStart[2] + 4]);
    const NF = lite ? 7 : flocksAt.length, NB = lite ? 5 : 8, birds = [];
    const body = (() => { const parts = []; const b = new THREE.SphereGeometry(0.1, 8, 6); b.scale(0.85, 0.8, 1.45); b.translate(0, 0.14, 0); parts.push(b); const h = new THREE.SphereGeometry(0.052, 8, 6); h.translate(0, 0.25, 0.13); parts.push(h);
      const beak = new THREE.ConeGeometry(0.014, 0.045, 5); beak.rotateX(Math.PI / 2); beak.translate(0, 0.245, 0.19); parts.push(beak); const tail = new THREE.BoxGeometry(0.09, 0.015, 0.11); tail.rotateX(0.25); tail.translate(0, 0.12, -0.17); parts.push(tail);
      for (const s of [-1, 1]) { const w = new THREE.BoxGeometry(0.03, 0.06, 0.2); w.translate(s * 0.08, 0.15, -0.02); parts.push(w); } for (const s of [-1, 1]) { const l = new THREE.BoxGeometry(0.012, 0.07, 0.012); l.translate(s * 0.03, 0.035, 0.01); parts.push(l); }
      return mergeGeometries(parts.map((g) => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); return g; }), false); })();
    const im = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.8 }), NF * NB); im.name = 'life:pigeons'; im.frustumCulled = false; im.castShadow = false;
    const tones = [0x6b6f78, 0x585c66, 0x7d818a, 0x4a4c52, 0xb8b4ac, 0x8a6a52];
    const snap = ([x, z]) => { for (let r = 0; r <= 14; r += 2) for (let k = 0; k < (r ? 10 : 1); k++) { const a = k / 10 * 6.283, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (!inRoad(px, pz, 0.8) && !blocked(px, pz, 1.2)) return [px, pz]; } return null; };   // on the pavement, not in the road
    const flocks = flocksAt.slice(0, NF).map(snap).filter(Boolean).map(([x, z], fi) => ({ x, z, state: 'ground', t: 0, birds: Array.from({ length: NB }, (_, k) => { const b = { hx: x + (R() - 0.5) * 5, hz: z + (R() - 0.5) * 4, x: 0, y: 0, z: 0, yaw: R() * 6.28, ph: R() * 6.28, i: birds.length, vx: 0, vy: 0, vz: 0 }; b.x = b.hx; b.z = b.hz; birds.push(b); im.setColorAt(b.i, _c.set(tones[(fi + k) % tones.length])); return b; }) }));
    st.pigeons = birds.length; scene.add(im); W.pigeonFlocks = flocks;
    const write = (b, pitch, flap) => { _e.set(pitch, b.yaw, 0); _q.setFromEuler(_e); im.setMatrixAt(b.i, _m.compose(_p.set(b.x, b.y, b.z), _q, _s.set(1 + flap * 0.8, 1 - flap * 0.3, 1))); };
    for (const b of birds) write(b, 0, 0);
    for (let i = birds.length; i < im.count; i++) im.setMatrixAt(i, _m.makeScale(0, 0, 0));
    world.updaters.push((dt) => {
      const cam = ctx.camera.position, P = ctx.player?.position; if (!P) return; let any = false; const t = performance.now() / 1000;
      for (const f of flocks) {
        if (Math.abs(cam.x - f.x) > 90 || Math.abs(cam.z - f.z) > 90) continue; any = true;
        const near = Math.hypot(P.x - f.x, P.z - f.z) < (ctx.player.speed > 4 ? 9 : 4.5) && P.y < 3;
        if (f.state === 'ground' && near) { f.state = 'fly'; f.t = 0; for (const b of f.birds) { const a = Math.atan2(b.x - P.x, b.z - P.z) + (R() - 0.5); b.vx = Math.sin(a) * 4; b.vz = Math.cos(a) * 4; b.vy = 4 + R() * 2; } }
        f.t += dt;
        for (const b of f.birds) {
          if (f.state === 'ground') {   // peck about: a few steps, head bobbing
            if (R() < dt * 0.4) b.yaw += (R() - 0.5) * 2; const sp = Math.sin(t * 6 + b.ph) > 0.6 ? 0.25 : 0; b.x += Math.sin(b.yaw) * sp * dt; b.z += Math.cos(b.yaw) * sp * dt;
            if (Math.hypot(b.x - b.hx, b.z - b.hz) > 3) b.yaw = Math.atan2(b.hx - b.x, b.hz - b.z); b.y = 0.02; write(b, Math.max(0, Math.sin(t * 9 + b.ph)) * 0.5, 0);
          } else {   // burst up, circle overhead, glide back down to the same corner
            if (f.t < 1.6) { b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt; b.vy *= 0.97; }
            else if (f.t < 11) { const a = t * 0.6 + b.ph, r = 9 + (b.i % 4); const tx = f.x + Math.cos(a) * r, tz = f.z + Math.sin(a) * r, ty = 11 + (b.i % 3); b.x += (tx - b.x) * dt * 1.2; b.z += (tz - b.z) * dt * 1.2; b.y += (ty - b.y) * dt * 1.2; }
            else { b.x += (b.hx - b.x) * dt * 0.9; b.z += (b.hz - b.z) * dt * 0.9; b.y += (0.02 - b.y) * dt * 1.4; if (f.t > 15 && !near) { f.state = 'ground'; } }
            b.yaw = Math.atan2(b.vx + Math.cos(t + b.ph), b.vz + Math.sin(t + b.ph)); write(b, -0.2, Math.abs(Math.sin(t * 22 + b.ph)));
          }
        }
      }
      if (any) im.instanceMatrix.needsUpdate = true;
    });
  }

  // ---- bus stops that work: people wait, get on when the bus is in, riders get off and walk off ------------------------------
  const waiting = [], alight = [];
  for (const [name, x, z] of BUS_STOPS) { if (!inMap(x, z)) continue;
    const r = OSM.r.reduce((m, q) => { let d = 1e9; for (let i = 0; i + 1 < q.p.length; i++) d = Math.min(d, segD(x, z, q.p[i], q.p[i + 1])); return d < m.d ? { d, q } : m; }, { d: 1e9, q: null }).q; if (!r) continue;
    let best = null; for (let i = 0; i + 1 < r.p.length; i++) { const d = segD(x, z, r.p[i], r.p[i + 1]); if (!best || d < best.d) best = { d, a: r.p[i], b: r.p[i + 1] }; }
    const ux = best.b[0] - best.a[0], uz = best.b[1] - best.a[1], L = Math.hypot(ux, uz) || 1, nx = -uz / L, nz = ux / L, sgn = (x - best.a[0]) * nx + (z - best.a[1]) * nz > 0 ? 1 : -1, off = r.w / 2 + 1.6;
    const kx = x - nx * ((x - best.a[0]) * nx + (z - best.a[1]) * nz) + nx * sgn * off, kz = z - nz * ((x - best.a[0]) * nx + (z - best.a[1]) * nz) + nz * sgn * off;   // on the kerb by the stop
    const n = lite ? 2 : 3; for (let k = 0; k < n; k++) { const s = { x: kx + (ux / L) * (k * 1.4 - 1.4) + nx * sgn * (k % 2) * 0.7, y: 0, z: kz + (uz / L) * (k * 1.4 - 1.4) + nz * sgn * (k % 2) * 0.7, ry: Math.atan2(-nx * sgn, -nz * sgn), pose: k === 1 ? 'phone' : 'stand', zone: 'busstop', stop: [x, z] }; if (!blocked(s.x, s.z, 0.2)) waiting.push(s); }
    for (let k = 0; k < 2; k++) alight.push({ x: kx + (ux / L) * (k ? 1 : -1) * 1.2, y: 0, z: kz + (uz / L) * (k ? 1 : -1) * 1.2, ry: Math.atan2((ux / L) * (k ? 1 : -1), (uz / L) * (k ? 1 : -1)), pose: 'walk', zone: 'busstop', stop: [x, z], gone: performance.now() + 1e12, alighter: true });
  }
  st.waiting = waiting.length;
  try { addFolkSpots(world, [...waiting, ...alight, ...workers]); } catch (e) { console.warn('[life] folk', e); }
  { const T = () => window?.__game?.traffic; let tick = 0;
    world.updaters.push((dt) => { tick -= dt; if (tick > 0) return; tick = 0.5; const api = T(); if (!api?.buses) return; const now = performance.now();
      const dwell = api.buses().filter((b) => b.state === 'dwell');
      for (const s of waiting) if (!s.gone && dwell.some((b) => Math.hypot(b.x - s.stop[0], b.z - s.stop[1]) < 14)) s.gone = now + 60000 + Math.random() * 60000;   // got on (back in a minute or two, out of sight)
      for (const s of alight) { const at = dwell.some((b) => Math.hypot(b.x - s.stop[0], b.z - s.stop[1]) < 14);
        if (at && s.gone > now + 1e9 && Math.random() < 0.6) { s.gone = 0; s.offT = now + 45000; } else if (!at && s.offT && now > s.offT && !s.E) { s.gone = now + 1e12; s.offT = 0; } } });
  }
  console.log('[life]', st.pigeons, 'pigeons ·', st.litter, 'litter ·', st.trucks, 'delivery trucks ·', st.waiting, 'waiting at stops');
  if (typeof window !== 'undefined' && window.__game) window.__game.streetLife = { stats: () => ({ ...st }), flocks: () => (W.pigeonFlocks || []).map((f) => ({ x: Math.round(f.x), z: Math.round(f.z), state: f.state, y: +Math.max(...f.birds.map((b) => b.y)).toFixed(1) })) };
  return st;
}
