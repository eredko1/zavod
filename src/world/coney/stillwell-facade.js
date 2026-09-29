// CONEY — the Stillwell Av terminal's Surf Ave front, after the 2004 rebuild (owner's photos): a cream limestone frieze over the
// entrances with scalloped parapets, "BMT LINES" plaques, the BMT medallion and a shield, a fringe of brackets and bulbs under it;
// red CONEY ISLAND letters over the main doors; above, green steel piers studded with bulbs framing tan brick bays with arched
// grilles and the great arched window; the tan brick upper block set back behind, with its flagpole; and the corner tower,
// green steel and glass block, topped by a stepped spire and the ring. Drawn in front of stillwell.js's head-house walls (their
// colliders stay); one merged mesh per material. CONEY agent (stillwell).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STILLWELL } from './stillwell.js';

export function buildStillwellFacade(world) {
  const { scene, ctx } = world, S = STILLWELL, lite = !!ctx.lite, fz = S.zS, X0 = S.x0, X1 = S.x1;
  const M = mats(lite), G = new Map();
  const put = (m, g) => { g = g.index ? g.toNonIndexed() : g; if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); (G.get(m) || G.set(m, []).get(m)).push(g); return g; };
  const box = (m, x0, y0, z0, x1, y1, z1, uvm = 0) => { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); if (uvm) worldUV(g, uvm); return put(m, g); };
  const quad = (m, w, h, x, y, z, ry = 0) => { const g = new THREE.PlaneGeometry(w, h); if (ry) g.rotateY(ry); g.translate(x, y, z); return put(m, g); };
  const bulbs = [];   // instanced: every bulb on the building
  const col = (x, z) => world.box([x - 0.25, 0, z - 0.25], [x + 0.25, 3.3, z + 0.25]);

  // ---- ground floor: green steel storefront frame between the doors, dark shutters ----------------------------------------------
  const PIER = []; for (let x = X0; x <= X1 + 0.01; x += (X1 - X0) / 10) PIER.push(x);
  for (const x of PIER) { box(M.green, x - 0.22, 0, fz + 0.02, x + 0.22, 3.35, fz + 0.32); }
  box(M.green, X0, 3.05, fz + 0.02, X1, 3.35, fz + 0.36);
  for (let i = 0; i + 1 < PIER.length; i++) { const a = PIER[i] + 0.22, b = PIER[i + 1] - 0.22, mid = (a + b) / 2; if ([-69.5, -56, -42.5].some((d) => Math.abs(d - mid) < 3.2)) continue; box(M.shutter, a, 0.2, fz + 0.03, b, 2.95, fz + 0.06, 1); }
  // ---- the limestone frieze: band, scalloped parapets between pilasters, plaques, medallion, shield --------------------------------
  const FY0 = 3.35, FY1 = 5.35;
  box(M.stone, X0 - 0.2, FY0, fz, X1 + 0.2, FY1, fz + 0.5, 1.2);
  box(M.stone, X0 - 0.25, FY0 - 0.1, fz, X1 + 0.25, FY0 + 0.05, fz + 0.58);   // the sill moulding
  const PIL = [X0, -76, -63, -49, -36, X1];
  for (const x of PIL) { box(M.stone, x - 0.3, FY0, fz, x + 0.3, FY1 + 1.35, fz + 0.62, 1.2); box(M.stone, x - 0.38, FY1 + 1.35, fz, x + 0.38, FY1 + 1.5, fz + 0.7); }
  for (let i = 0; i + 1 < PIL.length; i++) { const a = PIL[i] + 0.3, b = PIL[i + 1] - 0.3, n = 14;   // a curved parapet: raised in the middle, a lip on top
    for (let k = 0; k < n; k++) { const x0 = a + (b - a) * k / n, x1 = a + (b - a) * (k + 1) / n, t = (k + 0.5) / n, h = 0.25 + Math.sin(t * Math.PI) ** 0.7 * 0.95; box(M.stone, x0, FY1, fz, x1 + 0.01, FY1 + h, fz + 0.45); box(M.stone, x0, FY1 + h, fz, x1 + 0.01, FY1 + h + 0.08, fz + 0.52); }
    // a recessed panel outline in the middle of each bay
    const mid = (a + b) / 2, pw = Math.min(5, b - a - 2); box(M.stoneDk, mid - pw / 2, FY0 + 0.45, fz + 0.5, mid + pw / 2, FY0 + 0.52, fz + 0.53); box(M.stoneDk, mid - pw / 2, FY1 - 0.35, fz + 0.5, mid + pw / 2, FY1 - 0.28, fz + 0.53);
    for (const e of [mid - pw / 2, mid + pw / 2]) box(M.stoneDk, e - 0.035, FY0 + 0.45, fz + 0.5, e + 0.035, FY1 - 0.28, fz + 0.53); }
  const cell = (i) => ({ u0: (i % 2) / 2, u1: (i % 2 + 1) / 2, v0: 1 - (Math.floor(i / 2) + 1) / 2, v1: 1 - Math.floor(i / 2) / 2 });
  const atlasQuad = (i, w, h, x, y, z) => { const g = quad(M.plaque, w, h, x, y, z), c = cell(i), uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, c.u0 + uv.getX(k) * (c.u1 - c.u0), c.v0 + uv.getY(k) * (c.v1 - c.v0)); };
  atlasQuad(0, 3.4, 0.9, -69.5, FY0 + 1.0, fz + 0.52); atlasQuad(0, 3.4, 0.9, -42.5, FY0 + 1.0, fz + 0.52);
  atlasQuad(1, 1.3, 1.3, -56, FY1 + 0.75, fz + 0.5); atlasQuad(2, 1.0, 1.2, -82, FY0 + 1.05, fz + 0.52); atlasQuad(2, 1.0, 1.2, -29.5, FY0 + 1.05, fz + 0.52);
  // the fringe: small brackets under the frieze, each with a bulb
  for (let x = X0 + 0.5; x < X1 - 0.3; x += 1.25) { box(M.stone, x - 0.07, FY0 - 0.42, fz + 0.36, x + 0.07, FY0 - 0.1, fz + 0.5); bulbs.push([x, FY0 - 0.5, fz + 0.45]); }
  // CONEY ISLAND in red over the main doors
  quad(M.neon, 8.5, 0.62, -56, 2.62, fz + 0.4);
  // ---- above the frieze: green steel piers with bulb studs, tan brick bays with arched grilles, the great arched window -------------
  const TOP = 12.2, WIN = [-50.2, -28.6], WIN_TOP = 16.4;
  const piers = [-88, -81.6, -75.2, -68.8, -62.4, -56, WIN[0] - 0.3, WIN[1] + 0.3, X1];
  for (const x of piers) { box(M.green, x - 0.3, FY1, fz - 0.1, x + 0.3, x > WIN[0] - 1 && x < WIN[1] + 1 ? WIN_TOP - 1.2 : TOP, fz + 0.3); for (let y = FY1 + 0.4; y < TOP - 0.2; y += 0.45) bulbs.push([x, y, fz + 0.33]); }
  box(M.green, X0, TOP - 0.35, fz - 0.1, WIN[0], TOP, fz + 0.32);   // top rail over the bays
  for (let i = 0; i + 1 < piers.length; i++) { const a = piers[i] + 0.3, b = piers[i + 1] - 0.3; if (a >= WIN[0] - 1) continue;
    box(M.brick, a, FY1, fz - 0.05, b, TOP - 0.35, fz + 0.08, 0.5);
    // arched grille window at the top of each bay: a dark half-disc with green bars, bulbs round the arch
    const cx = (a + b) / 2, r = (b - a) / 2 - 0.35, cy = TOP - 1.6; const hd = new THREE.CircleGeometry(r, 16, 0, Math.PI); hd.translate(cx, cy, fz + 0.1); put(M.grille, hd);
    box(M.grille, cx - r, cy - 1.1, fz + 0.09, cx + r, cy, fz + 0.1);
    for (let k = 1; k < 7; k++) { const x = cx - r + (2 * r) * k / 7; box(M.green, x - 0.04, cy - 1.1, fz + 0.11, x + 0.04, cy + Math.sqrt(Math.max(0, r * r - (x - cx) ** 2)), fz + 0.14); }
    for (let k = 0; k <= 12; k++) { const t = Math.PI * k / 12; bulbs.push([cx + Math.cos(t) * (r + 0.15), cy + Math.sin(t) * (r + 0.15), fz + 0.16]); } }
  { // the great arched window: glass, a green mullion grid, the arch frame studded with bulbs
    const [a, b] = WIN, cx = (a + b) / 2, r = (b - a) / 2, sy = WIN_TOP - r; const pts = [];
    const shape = new THREE.Shape(); shape.moveTo(a, FY1 + 0.2); shape.lineTo(b, FY1 + 0.2); shape.lineTo(b, sy); shape.absarc(cx, sy, r, 0, Math.PI, false); shape.lineTo(a, FY1 + 0.2);
    const gl = new THREE.ShapeGeometry(shape, 24); gl.translate(0, 0, fz + 0.05); put(M.glass, gl);
    for (let k = 1; k < 9; k++) { const x = a + (b - a) * k / 9, ytop = sy + Math.sqrt(Math.max(0, r * r - (x - cx) ** 2)); box(M.green, x - 0.07, FY1 + 0.2, fz + 0.06, x + 0.07, ytop, fz + 0.14); }
    for (const y of [FY1 + 2.3, FY1 + 4.6, sy]) box(M.green, a, y - 0.06, fz + 0.06, b, y + 0.06, fz + 0.14);
    for (let k = 0; k < 28; k++) { const t0 = Math.PI * k / 28, t1 = Math.PI * (k + 1) / 28; const p0 = [cx + Math.cos(t0) * (r + 0.25), sy + Math.sin(t0) * (r + 0.25)], p1 = [cx + Math.cos(t1) * (r + 0.25), sy + Math.sin(t1) * (r + 0.25)];
      const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), g = new THREE.BoxGeometry(L + 0.05, 0.55, 0.4); g.rotateZ(Math.atan2(p1[1] - p0[1], p1[0] - p0[0])); g.translate((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, fz + 0.12); put(M.green, g);
      bulbs.push([p0[0] + Math.cos(t0) * 0.35, p0[1] + Math.sin(t0) * 0.35, fz + 0.36]); }
    for (const x of [a - 0.25, b + 0.25]) box(M.green, x - 0.25, FY1, fz - 0.05, x + 0.25, sy, fz + 0.36);
    pts.length = 0; }
  // ---- the upper block: tan brick, set back, small square windows, a rail on the roof; the flagpole -----------------------------
  const UZ0 = fz - 1.6, UZ1 = fz - 34, UY = 18.4;
  box(M.brick, X0 + 1, TOP, UZ1, WIN[0] + 1, UY, UZ0, 0.5); world.box([X0 + 1, TOP, UZ1], [WIN[0] + 1, UY, UZ0]);
  box(M.brick, WIN[0] + 1, WIN_TOP - 1, UZ1, X1 - 8, UY, UZ0 - 2, 0.5); world.box([WIN[0] + 1, WIN_TOP - 1, UZ1], [X1 - 8, UY, UZ0 - 2]);
  for (let x = X0 + 4; x < WIN[0] - 1; x += 3.3) box(M.winDk, x - 0.35, UY - 2.3, UZ0 + 0.01, x + 0.35, UY - 1.6, UZ0 + 0.04);
  for (let x = X0 + 1.2; x < X1 - 8; x += 1.6) box(M.rail, x - 0.03, UY, UZ0 - 0.2, x + 0.03, UY + 1.1, UZ0 - 0.14); box(M.rail, X0 + 1, UY + 1.05, UZ0 - 0.22, X1 - 8, UY + 1.12, UZ0 - 0.12);
  box(M.rail, -62.05, UY, UZ0 - 3.05, -61.95, UY + 11, UZ0 - 2.95); { const g = new THREE.PlaneGeometry(3.2, 1.8); g.translate(-60.35, UY + 9.9, UZ0 - 3); put(M.flag, g); }
  // ---- the corner tower: tan brick base, green steel frame and glass block, the stepped spire and the ring on top -----------------
  { const tx0 = X1 - 7.5, tx1 = X1 + 0.6, tz1 = fz + 0.5, tz0 = fz - 8.5, TY = 23, cx = (tx0 + tx1) / 2, cz = (tz0 + tz1) / 2;
    box(M.brick, tx0, TOP, tz0, tx1, TY - 5, tz1, 0.5); world.box([tx0, TOP, tz0], [tx1, TY, tz1]);
    box(M.blocks, tx0 + 0.3, TY - 5, tz0 + 0.3, tx1 - 0.3, TY, tz1 - 0.3, 0.6);
    for (const [x, z] of [[tx0, tz0], [tx1, tz0], [tx0, tz1], [tx1, tz1]]) { box(M.green, x - 0.3, TOP, z - 0.3, x + 0.3, TY + 0.4, z + 0.3); for (let y = TOP + 0.4; y < TY; y += 0.5) bulbs.push([x, y, z + (z > cz ? 0.32 : -0.32)]); }
    for (const y of [TY - 5, TY - 2.5, TY]) box(M.green, tx0 - 0.3, y - 0.12, tz0 - 0.3, tx1 + 0.3, y + 0.12, tz1 + 0.3);
    // spire: ten shrinking green tiers with a bulb at each corner
    let w = tx1 - tx0 + 0.4, y = TY + 0.2;
    for (let k = 0; k < 10; k++) { const h = 0.62, hw = w / 2; box(M.green, cx - hw, y, cz - hw, cx + hw, y + h * 0.55, cz + hw); if (!lite) for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bulbs.push([cx + sx * hw, y + h * 0.6, cz + sz * hw]); y += h; w *= 0.86; }
    box(M.green, cx - 0.12, y, cz - 0.12, cx + 0.12, y + 1.6, cz + 0.12);
    const ring = new THREE.TorusGeometry(1.1, 0.14, 8, 28); ring.translate(cx, y + 2.7, cz); put(M.green, ring);
    const bar = new THREE.BoxGeometry(0.16, 2.6, 0.16); bar.translate(cx, y + 2.7, cz); put(M.green, bar); }

  // ---- merge, bulbs ------------------------------------------------------------------------------------------------------------
  for (const [m, list] of G) { const g = mergeGeometries(list, false); if (!g) continue; const me = new THREE.Mesh(g, m); me.name = 'stillwellFront:' + m.name; me.castShadow = !lite && !m.transparent && m !== M.neon && m !== M.plaque; me.receiveShadow = true; scene.add(me); if (m === M.stone || m === M.brick || m === M.green) ctx.raycastTargets?.push?.(me); }
  { const n = lite ? Math.ceil(bulbs.length / 2) : bulbs.length, im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 6, 5), M.bulb, n), o = new THREE.Object3D();
    for (let i = 0; i < n; i++) { const b = bulbs[lite ? i * 2 : i]; o.position.set(b[0], b[1], b[2]); o.updateMatrix(); im.setMatrixAt(i, o.matrix); } im.name = 'stillwellFront:bulbs'; scene.add(im); }
  // colliders for the new frame at street level (the piers stand proud of the wall)
  for (const x of PIER) if (![-72, -67, -58.5, -53.5, -45, -40].some((d) => Math.abs(d - x) < 0.5)) col(x, fz + 0.17);
  console.log('[stillwell] Surf Ave front built ·', bulbs.length, 'bulbs');
}

// ---------------------------------------------------------------------------------------------------------------------------
function worldUV(g, m) { const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), az = Math.abs(n.getZ(i)); const u = ax > 0.5 ? p.getZ(i) : p.getX(i), v = Math.abs(n.getY(i)) > 0.5 ? p.getZ(i) : p.getY(i); uv.setXY(i, u / m, v / m); void az; } }
function canvasTex(w, h, draw, rep = false) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
function mats(lite) {
  const q = lite ? 0.5 : 1, S = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });
  const brick = canvasTex(256 * q, 256 * q, (g, w, h) => { g.fillStyle = '#b8936a'; g.fillRect(0, 0, w, h); const bh = h / 16, bw = w / 4;
    for (let r = 0; r < 16; r++) for (let k = -1; k < 5; k++) { const v = Math.random() * 30 - 15; g.fillStyle = `rgb(${196 + v},${160 + v},${118 + v})`; g.fillRect(k * bw + (r % 2 ? bw / 2 : 0) + 1, r * bh + 1, bw - 2, bh - 2); } }, true);
  const stone = canvasTex(256 * q, 256 * q, (g, w, h) => { g.fillStyle = '#e6dcc4'; g.fillRect(0, 0, w, h); for (let i = 0; i < 3000 * q; i++) { g.fillStyle = `rgba(120,100,70,${Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } g.fillStyle = 'rgba(90,75,55,.25)'; for (let y = 0; y < h; y += h / 4) g.fillRect(0, y, w, 2); for (let x = 0; x < w; x += w / 2) g.fillRect(x, 0, 2, h); }, true);
  const shutter = canvasTex(64, 128, (g, w, h) => { g.fillStyle = '#6b6f72'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,.35)'; for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1); }, true);
  const blocks = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#9fb3bb'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) { const v = Math.random() * 20; g.fillStyle = `rgb(${170 + v},${192 + v},${200 + v})`; g.fillRect(x + 1, y + 1, 14, 14); } }, true);
  const plaque = canvasTex(512, 256, (g) => {
    // cell 0: BMT LINES plaque, cell 1: the BMT medallion, cell 2: the shield
    g.fillStyle = '#1f5a4a'; g.fillRect(0, 0, 256, 128); g.strokeStyle = '#c9b98a'; g.lineWidth = 6; g.strokeRect(6, 6, 244, 116); g.fillStyle = '#cfe0d0'; g.font = '700 46px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BMT', 90, 66); g.font = '700 28px Georgia, serif'; g.fillText('LINES', 185, 70);
    g.fillStyle = '#e6dcc4'; g.fillRect(256, 0, 256, 128); g.fillStyle = '#1f5a4a'; g.beginPath(); g.arc(384, 64, 56, 0, 7); g.fill(); g.strokeStyle = '#c9b98a'; g.lineWidth = 6; g.stroke(); g.fillStyle = '#e6dcc4'; g.font = '700 34px Georgia, serif'; g.fillText('BMT', 384, 66);
    g.fillStyle = '#e6dcc4'; g.fillRect(0, 128, 256, 128); g.strokeStyle = '#9a8a66'; g.lineWidth = 7; g.beginPath(); g.moveTo(78, 150); g.lineTo(178, 150); g.lineTo(178, 200); g.quadraticCurveTo(128, 250, 78, 200); g.closePath(); g.stroke(); g.beginPath(); g.moveTo(128, 158); g.lineTo(128, 225); g.stroke(); });
  const neon = canvasTex(1024, 80, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#ff2a1f'; g.shadowColor = '#ff3a2a'; g.shadowBlur = 12; g.font = '700 64px "Arial Black", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('C O N E Y   I S L A N D', w / 2, h / 2 + 2); });
  const flag = canvasTex(190, 100, (g, w, h) => { for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#fff' : '#b22234'; g.fillRect(0, i * h / 13, w, h / 13 + 1); } g.fillStyle = '#3c3b6e'; g.fillRect(0, 0, w * 0.4, h * 7 / 13); g.fillStyle = '#fff'; for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) g.fillRect(6 + c * 12, 5 + r * 10, 2, 2); });
  const m = {
    green: S({ color: 0x1f5a4a, roughness: 0.55, metalness: 0.35 }), stone: S({ map: stone, roughness: 0.85 }), stoneDk: S({ color: 0xbfb294, roughness: 0.9 }),
    brick: S({ map: brick, roughness: 0.9 }), shutter: S({ map: shutter, roughness: 0.6, metalness: 0.4 }), grille: S({ color: 0x1a2320, roughness: 0.7, side: THREE.DoubleSide }),
    glass: S({ color: 0x33485a, roughness: 0.08, metalness: 0.6, side: THREE.DoubleSide }), blocks: S({ map: blocks, roughness: 0.3, metalness: 0.1, emissive: 0x28363c, emissiveIntensity: 0.4 }),
    winDk: S({ color: 0x1b2027, roughness: 0.3 }), rail: S({ color: 0x9aa0a4, roughness: 0.5, metalness: 0.6 }),
    plaque: S({ map: plaque, roughness: 0.6 }), neon: new THREE.MeshBasicMaterial({ map: neon, transparent: true, toneMapped: false, depthWrite: false }),
    flag: S({ map: flag, roughness: 0.8, side: THREE.DoubleSide }), bulb: new THREE.MeshBasicMaterial({ color: 0xfff1c8, toneMapped: false }),
  };
  for (const k in m) m[k].name = k; return m;
}
