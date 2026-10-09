// CONEY — P.S. 90, the Edna Cohen School, 2840 W 12th St, across W 12th from the Luna Park Houses (by Table Park). Built on its
// OSM footprint (a stepped L, four rectangles) as a three-storey NYC public school: red brick with limestone sill bands and a
// parapet, rows of big classroom windows (kids' art taped in some), the limestone entrance on W 12th with PUBLIC SCHOOL 90 cut
// over the doors and the blue DOE sign on the sidewalk, a flagpole with the flag moving in the wind, and the schoolyard inside
// the L: fenced asphalt with painted games (four square, hopscotch, a basketball key), two hoops and a gate. Kids in the yard
// in the daytime (folk.js live spots). Called from city.js in place of the generic civic block. CONEY agent.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { facade } from '../sbu/buildings.js';

const RECTS = [[16.8, -384.3, 73.6, -367.6], [16.8, -419.4, 45.8, -384.3], [45.8, -409.5, 73.5, -384.3], [52.6, -444, 73.5, -409.5]];   // x0 z0 x1 z1
const YARD = [17.6, -443.4, 52.0, -420.2], DOOR_Z = -397, FRONT_X = 73.6, FLOORS = 3, STOREY = 3.6;
/** the OSM block this replaces (centroid inside the site) */
export const isSchool = (cx, cz) => cx > 15 && cx < 76 && cz > -446 && cz < -365;

const canvasTex = (w, h, draw, rep) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };

export function buildSchool(B, world, M) {
  const { scene, ctx } = world, lite = !!ctx.lite;
  // the building: brick, limestone bands, big windows, a parapet; facade() builds walls, glass, colliders and the roof
  for (const [x0, z0, x1, z1] of RECTS) facade(B, { x0, x1, z0, z1, floors: FLOORS, storey: STOREY, band: 1.1, inset: 0.28, pitch: 3.0, pierW: 0.75, wall: 'brickRed', pier: 'brickRed', parapet: 1.3, lit: 0.08, hvac: 2, mullionPitch: 1.0 });
  const col = [], quads = new Map(); const _c = new THREE.Color();
  const put = (g, color) => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); const n = g.attributes.position.count, a = new Float32Array(n * 3); _c.set(color); for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); col.push(g); };
  const box = (x0, y0, z0, x1, y1, z1, color) => { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); put(g, color); };
  const quad = (key, w, h, x, y, z, ry, uv) => { const g = new THREE.PlaneGeometry(w, h); if (uv) { const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, uv[0] + u.getX(i) * uv[2], uv[1] + u.getY(i) * uv[3]); } g.rotateY(ry); g.translate(x, y, z); (quads.get(key) || quads.set(key, []).get(key)).push(g); };
  const LIME = 0xd9d2c2;
  // limestone sill bands round the street faces + the coping
  for (let f = 1; f <= FLOORS; f++) { const y = f * STOREY - 0.05; box(FRONT_X - 0.02, y - 0.18, -444, FRONT_X + 0.12, y, -367.6, LIME); box(16.8, y - 0.18, -367.6 - 0.02, 73.6, y, -367.48, LIME); }
  // ---- the entrance on W 12th: limestone surround, steps, double doors, the name cut in stone
  { const zc = DOOR_Z, w = 7.2;
    box(FRONT_X, 0, zc - w / 2 - 0.6, FRONT_X + 0.5, 5.4, zc - w / 2, LIME); box(FRONT_X, 0, zc + w / 2, FRONT_X + 0.5, 5.4, zc + w / 2 + 0.6, LIME); box(FRONT_X, 4.0, zc - w / 2, FRONT_X + 0.5, 5.4, zc + w / 2, LIME);
    for (let k = 0; k < 3; k++) box(FRONT_X + 0.5 + k * 0.4, 0, zc - w / 2 - 0.4, FRONT_X + 1.7, 0.16 * (3 - k), zc + w / 2 + 0.4, 0xbab3a4);
    for (const dz of [-2.6, -0.9, 0.9]) { box(FRONT_X + 0.02, 0.48, zc + dz, FRONT_X + 0.12, 3.2, zc + dz + 1.6, 0x1f4a7a); box(FRONT_X + 0.12, 1.55, zc + dz + 0.2, FRONT_X + 0.2, 1.62, zc + dz + 1.4, 0xb8bcc2); }
    const name = canvasTex(1024, 128, (g, W, H) => { g.fillStyle = '#d9d2c2'; g.fillRect(0, 0, W, H); g.fillStyle = 'rgba(70,60,48,.85)'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '600 64px "Trajan Pro", Georgia, serif'; g.fillText('PUBLIC SCHOOL 90', W / 2, H / 2 + 4);
      g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1; g.strokeText('PUBLIC SCHOOL 90', W / 2 - 1, H / 2 + 3); });
    quad('name', 6.6, 0.82, FRONT_X + 0.51, 4.7, zc, Math.PI / 2, null); quads.get('name').tex = name;
    const plate = canvasTex(1024, 160, (g, W, H) => { g.fillStyle = '#d9d2c2'; g.fillRect(0, 0, W, H); g.fillStyle = 'rgba(70,60,48,.9)'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'italic 600 54px Georgia, serif'; g.fillText('The Edna Cohen School', W / 2, H / 2); });
    quad('plate', 4.2, 0.66, FRONT_X + 0.02, 6.4, zc, Math.PI / 2, null); quads.get('plate').tex = plate;
    // the blue DOE sign on two posts at the kerb
    const doe = canvasTex(1024, 512, (g, W, H) => { g.fillStyle = '#103a7a'; g.fillRect(0, 0, W, H); g.strokeStyle = '#fff'; g.lineWidth = 10; g.strokeRect(14, 14, W - 28, H - 28); g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.font = '700 150px "Helvetica Neue", Arial, sans-serif'; g.fillText('P.S. 90', 60, 150); g.font = '600 62px "Helvetica Neue", Arial, sans-serif'; g.fillText('The Edna Cohen School', 64, 290); g.font = '500 40px "Helvetica Neue", Arial, sans-serif'; g.fillText('2840 West 12th Street · District 21', 64, 380);
      g.fillText('NYC Department of Education', 64, 440); });
    const sx = FRONT_X + 4.2, sz = zc + 7; for (const d of [-1.05, 1.05]) box(sx - 0.05, 0, sz + d - 0.05, sx + 0.05, 2.6, sz + d + 0.05, 0x8a8f94);
    for (const side of [Math.PI / 2, -Math.PI / 2]) quad('doe', 2.4, 1.2, sx + (side > 0 ? 0.03 : -0.03), 2.0, sz, side, null); quads.get('doe').tex = doe; box(sx - 0.02, 1.38, sz - 1.22, sx + 0.02, 2.62, sz + 1.22, 0x103a7a);
    world.box([sx - 0.1, 0, sz - 1.15], [sx + 0.1, 2.6, sz + 1.15]);
  }
  // kids' art taped in some ground- and first-floor windows on the street faces
  { const art = canvasTex(512, 128, (g, W, H) => { g.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { const x = i * 128; g.fillStyle = ['#fff7d6', '#e6f4ff', '#ffe6f0', '#eaffea'][i]; g.fillRect(x + 8, 8, 112, 112); for (let k = 0; k < 14; k++) { g.strokeStyle = ['#e8202a', '#2a62c8', '#f2c418', '#2fbf6a', '#ff7a1a', '#9a3ad0'][k % 6]; g.lineWidth = 4 + Math.random() * 5; g.beginPath(); g.moveTo(x + 14 + Math.random() * 100, 14 + Math.random() * 100); g.quadraticCurveTo(x + 14 + Math.random() * 100, 14 + Math.random() * 100, x + 14 + Math.random() * 100, 14 + Math.random() * 100); g.stroke(); }
      g.fillStyle = '#f2c418'; g.beginPath(); g.arc(x + 100, 26, 12, 0, 7); g.fill(); } });
    let n = 0; for (let z = -442; z < -369; z += 3.0) { if (Math.abs(z - DOOR_Z) < 5 || (n++ % 3)) continue; for (const f of [0, 1]) quad('art', 0.9, 0.9, FRONT_X + 0.31, f * STOREY + 1.6, z + 1.5, Math.PI / 2, [((n + f) % 4) / 4, 0, 0.25, 1]); }
    quads.get('art') && (quads.get('art').tex = art); }
  // ---- the flagpole by the entrance, the flag moving in the wind
  const flagX = FRONT_X + 3.0, flagZ = DOOR_Z - 7; box(flagX - 0.07, 0, flagZ - 0.07, flagX + 0.07, 10.5, flagZ + 0.07, 0xc8ccd0); box(flagX - 0.3, 0, flagZ - 0.3, flagX + 0.3, 0.3, flagZ + 0.3, 0x9a968e); world.box([flagX - 0.1, 0, flagZ - 0.1], [flagX + 0.1, 10.5, flagZ + 0.1]);
  let flag = null;
  { const tex = canvasTex(380, 200, (g, W, H) => { for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#fff' : '#b22234'; g.fillRect(0, i * H / 13, W, H / 13 + 1); } g.fillStyle = '#3c3b6e'; g.fillRect(0, 0, W * 0.4, H * 7 / 13); g.fillStyle = '#fff';
      for (let r = 0; r < 9; r++) for (let c = 0; c < (r % 2 ? 5 : 6); c++) { g.beginPath(); g.arc(12 + c * 25 + (r % 2 ? 12 : 0), 10 + r * 11.5, 3.2, 0, 7); g.fill(); } });
    const g = new THREE.PlaneGeometry(2.4, 1.3, lite ? 6 : 14, 2); g.translate(1.2, 0, 0); flag = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85 })); flag.position.set(flagX, 9.7, flagZ); flag.castShadow = !lite; flag.name = 'school:flag'; scene.add(flag);
    const base = Float32Array.from(g.attributes.position.array);
    world.updaters.push((dt) => { if (!flag.visible) return; const cam = ctx.camera.position; if (Math.abs(cam.x - flagX) > 160 || Math.abs(cam.z - flagZ) > 160) return; const t = performance.now() / 1000, p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = base[i * 3], k = x / 2.4; p.setZ(i, Math.sin(t * 3.2 - x * 2.4) * 0.22 * k + Math.sin(t * 1.3) * 0.05 * k); p.setY(i, base[i * 3 + 1] - 0.08 * k * k); } p.needsUpdate = true; g.computeVertexNormals(); });
    flag.rotation.y = Math.PI * 0.85; }
  // ---- the schoolyard: painted asphalt, two hoops, a chain-link fence with a gate onto the yard side
  { const [x0, z0, x1, z1] = YARD, w = x1 - x0, d = z1 - z0;
    const paint = canvasTex(1024, 704, (g, W, H) => { g.fillStyle = '#4a4c50'; g.fillRect(0, 0, W, H); for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},.05)`; g.fillRect(Math.random() * W, Math.random() * H, 3, 3); }
      const sx = W / w, sz = H / d; g.lineWidth = 5; g.strokeStyle = '#f2f2ea';
      g.strokeRect(sx * 2, sz * 2, sx * 15, sz * 13); g.beginPath(); g.arc(sx * 9.5, sz * 15, sx * 3, Math.PI, 0); g.stroke(); g.strokeRect(sx * 7.5, sz * 9, sx * 4, sz * 6);   // a basketball key
      g.strokeStyle = '#f2c418'; for (let i = 0; i < 4; i++) g.strokeRect(sx * (20 + (i % 2) * 3), sz * (3 + Math.floor(i / 2) * 3), sx * 3, sz * 3);   // four square
      const hop = ['#e84a4a', '#2a62c8', '#2fbf6a', '#f2c418', '#ff7a1a', '#9a3ad0', '#e84a4a', '#2a62c8']; for (let i = 0; i < 8; i++) { g.fillStyle = hop[i]; g.fillRect(sx * (29 + (i === 3 || i === 5 ? (i === 3 ? -0.9 : 0.9) : 0)), sz * (2 + i * 1.4), sx * 1.6, sz * 1.3); g.fillStyle = '#fff'; g.font = `700 ${sz * 0.9}px Arial`; g.fillText(String(i + 1), sx * 29.4, sz * (3.0 + i * 1.4)); }
      g.fillStyle = '#2a62c8'; g.beginPath(); g.arc(sx * 24, sz * 17, sx * 2.6, 0, 7); g.fill(); g.fillStyle = '#f2c418'; g.font = `700 ${sz * 1.4}px Arial`; g.textAlign = 'center'; g.fillText('P.S. 90', sx * 24, sz * 17.5); });
    const yg = new THREE.PlaneGeometry(w, d); yg.rotateX(-Math.PI / 2); const ym = new THREE.Mesh(yg, new THREE.MeshStandardMaterial({ map: paint, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -12 })); ym.position.set((x0 + x1) / 2, 0.06, (z0 + z1) / 2);   // (over the OSM pitch's grass: polygon offset)
    ym.receiveShadow = true; ym.name = 'school:yard'; scene.add(ym);
    for (const [hx, hz, dir] of [[x0 + 9.5, z0 + 1.0, 1], [x0 + 9.5, z1 - 1.0, -1]]) { box(hx - 0.08, 0, hz - 0.08, hx + 0.08, 3.05, hz + 0.08, 0x2a62c8); box(hx - 0.06, 2.9, hz, hx + 0.06, 3.0, hz + dir * 0.9, 0x2a62c8); box(hx - 0.9, 2.95, hz + dir * 0.9, hx + 0.9, 4.0, hz + dir * 0.95, 0xf4f4f0); { const r = new THREE.TorusGeometry(0.23, 0.02, 6, 16); r.rotateX(Math.PI / 2); r.translate(hx, 3.05, hz + dir * 1.2); put(r, 0xff6a1a); } world.box([hx - 0.12, 0, hz - 0.12], [hx + 0.12, 3, hz + 0.12]); }
    // chain link: one lattice texture on the yard's open sides (the school walls close the rest)
    const link = canvasTex(64, 64, (g) => { g.clearRect(0, 0, 64, 64); g.strokeStyle = '#9aa0a6'; g.lineWidth = 2.2; for (let i = -64; i < 128; i += 11) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); } }, true);
    const fence = []; const run = (ax, az, bx, bz, gap) => { const L = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az) - Math.PI / 2;
      for (let s = 0; s < L; s += 2.5) { const px = ax + (bx - ax) * s / L, pz = az + (bz - az) * s / L; box(px - 0.04, 0, pz - 0.04, px + 0.04, 3.6, pz + 0.04, 0x8a9096); }
      const segs = gap ? [[0, gap[0]], [gap[1], L]] : [[0, L]]; for (const [s0, s1] of segs) { if (s1 - s0 < 0.2) continue; const g = new THREE.PlaneGeometry(s1 - s0, 3.5); const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * (s1 - s0) / 1.2, u.getY(i) * 3.5 / 1.2); g.rotateY(ry); const m = (s0 + s1) / 2; g.translate(ax + (bx - ax) * m / L, 1.8, az + (bz - az) * m / L); fence.push(g);
        world.box([Math.min(ax + (bx - ax) * s0 / L, ax + (bx - ax) * s1 / L) - 0.05, 0, Math.min(az + (bz - az) * s0 / L, az + (bz - az) * s1 / L) - 0.05], [Math.max(ax + (bx - ax) * s0 / L, ax + (bx - ax) * s1 / L) + 0.05, 3.6, Math.max(az + (bz - az) * s0 / L, az + (bz - az) * s1 / L) + 0.05]); }
      box(Math.min(ax, bx) - 0.03, 3.5, Math.min(az, bz) - 0.03, Math.max(ax, bx) + 0.03, 3.6, Math.max(az, bz) + 0.03, 0x8a9096); };
    run(x0 - 0.6, z0 - 0.4, x0 - 0.6, z1, [8, 12]); run(x0 - 0.6, z0 - 0.4, x1 + 0.4, z0 - 0.4, null);   // west side (with the gate) and south side; the school closes north and east
    const fm = new THREE.Mesh(mergeGeometries(fence, false), new THREE.MeshStandardMaterial({ map: link, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 })); fm.name = 'school:fence'; scene.add(fm);
  }
  // meshes
  if (col.length) { const me = new THREE.Mesh(mergeGeometries(col, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })); me.castShadow = !lite; me.receiveShadow = true; me.name = 'school:kit'; scene.add(me); }
  for (const [k, list] of quads) { if (!list.tex) continue; const me = new THREE.Mesh(mergeGeometries(list, false), new THREE.MeshStandardMaterial({ map: list.tex, roughness: 0.7, side: k === 'doe' ? THREE.FrontSide : THREE.FrontSide })); me.name = 'school:' + k; scene.add(me); }
  (world.W.mapPOIs || (world.W.mapPOIs = [])).push({ name: 'P.S. 90', x: 45, z: -405, kind: 'landmark' });
  // kids in the yard (live locals, kid-sized): playing, standing in twos
  world.W.schoolKids = Array.from({ length: lite ? 5 : 10 }, (_, i) => { const [x0, z0, x1, z1] = YARD; return { x: x0 + 3 + ((i * 7.3) % (x1 - x0 - 6)), y: 0, z: z0 + 3 + ((i * 4.1) % (z1 - z0 - 6)), ry: i * 1.7, pose: i % 3 ? 'walk' : 'stand', zone: 'yard', arch: 'schoolkid', s: 0.66 }; });
}
