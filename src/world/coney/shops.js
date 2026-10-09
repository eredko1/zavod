// CONEY shops you can walk into. fronts.js picks the storefronts (square-on walls, a deep enough building), cuts the doorway and
// carves the room out of the colliders; here each room gets its people (a cashier, a shopper in the aisle, someone walking in
// and out of the door) and, only while you're near (≤ 40 m, dropped past 60 m: phones never hold more than a couple), its
// interior by kind:
//  · grocery / bodega / pharmacy / liquor: shelf aisles stocked both sides, the glass-door coolers on the back wall, the counter
//    by the door with the register, lotto and the bodega cat;
//  · food: the counter with a glass case, the lit menu board, the kitchen line behind, tables and chairs out front;
//  · bar: the bar along one wall with stools, back-bar bottles, a neon sign, high tops;
//  · candy: colour-filled bins round the walls, the counter, a giant lollipop;
//  · service: a bank (teller windows, an ATM), a salon (chairs and mirrors) or a laundromat (washers and dryers).
// Unlit, colours baked with a bit of fake light and occlusion (like the tavern): no runtime lights, the same day and night. CONEY agent.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addFolkSpots } from './folk.js';

const NEAR = 40, FAR = 60;
const PRODUCT = [0xe8202a, 0x2a62c8, 0xf2c418, 0x2fbf6a, 0xff7a1a, 0xf4f4f0, 0x9a3ad0, 0x1a1a1a, 0xff7ab0, 0x6b3a1a, 0x18c0c8];
const hash = (a, b) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };

export function buildShops(world) {
  const { scene, ctx, W } = world, units = W.shopUnits || []; if (!units.length) return 0;
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true }), glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const spots = [];
  for (const [i, U] of units.entries()) {
    U.M = new THREE.Matrix4().fromArray(U.m); U.i = i;
    const toW = (u, y, w) => new THREE.Vector3(U.flip ? U.L - u : u, y, w).applyMatrix4(U.M);
    const yawIn = (() => { const a = toW(U.dx, 0, 0), b = toW(U.dx, 0, -1); return Math.atan2(b.x - a.x, b.z - a.z); })();
    const doorU = U.dx + U.dw / 2, counterU = U.dx < (U.u0 + U.u1) / 2 ? U.u1 - 1.6 : U.u0 + 1.6;
    // the cashier behind the counter by the door, a shopper in the room, someone walking in and out of the door
    { const p = toW(counterU, 0, -2.1); spots.push({ x: p.x, y: p.y, z: p.z, ry: yawIn + Math.PI, pose: 'stand', zone: 'shop' }); }
    { const a = toW((U.u0 + U.u1) / 2, 0, -U.rd + 1.6), b = toW((U.u0 + U.u1) / 2, 0, -3.2); spots.push({ x: a.x, y: a.y, z: a.z, ry: yawIn, pose: 'walk', zone: 'shop', leg: { ax: a.x, az: a.z, bx: b.x, bz: b.z, yaw: Math.atan2(b.x - a.x, b.z - a.z) } }); }
    { const a = toW(doorU, 0, -2.4), b = toW(doorU, 0, 2.8); spots.push({ x: b.x, y: b.y, z: b.z, ry: yawIn, pose: 'walk', zone: 'shop', leg: { ax: b.x, az: b.z, bx: a.x, bz: a.z, yaw: Math.atan2(a.x - b.x, a.z - b.z) } }); }
    U.toW = toW;
  }
  try { addFolkSpots(world, spots); } catch (e) { console.warn('[shops] folk', e); }

  // ---- interiors, on demand --------------------------------------------------------------------------------------------------
  function build(U) {
    const g = [], gl = [], _c = new THREE.Color(), H = U.H, uL = U.u0 + 0.38, uR = U.u1 - 0.38, wB = -U.rd + 0.05, rnd = (k) => hash(U.i * 7.1 + k, k * 3.3);
    const box = (u0, u1, y0, y1, w0, w1, color, lit = false) => { const a = Math.min(u0, u1), b = Math.max(u0, u1), x0 = U.flip ? U.L - b : a, x1 = U.flip ? U.L - a : b;
      const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, Math.abs(w1 - w0)); geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (w0 + w1) / 2); const ng = geo.toNonIndexed(); ng.deleteAttribute('uv'); ng.applyMatrix4(U.M);
      const p = ng.attributes.position, n = ng.attributes.normal, col = new Float32Array(p.count * 3); _c.set(color);
      for (let i = 0; i < p.count; i++) { const k = lit ? 1 : (0.72 + 0.22 * Math.max(0, n.getY(i)) + 0.06 * Math.abs(n.getX(i))) * (0.82 + 0.18 * Math.min(1, p.getY(i) / H)); col[i * 3] = _c.r * k; col[i * 3 + 1] = _c.g * k; col[i * 3 + 2] = _c.b * k; }
      ng.setAttribute('color', new THREE.BufferAttribute(col, 3)); (lit ? gl : g).push(ng); };
    // the room: floor tiles, walls, ceiling with light panels, the inside of the window wall
    const floorC = { grocery: 0xd8d4c8, food: 0xc8b8a0, bar: 0x5a3a24, candy: 0xf2e6f0, service: 0xcfd4d8 }[U.kind] || 0xd8d4c8, wallC = { grocery: 0xece8de, food: 0xf2e2c4, bar: 0x3a2418, candy: 0xffd6ea, service: 0xe6eaee }[U.kind] || 0xece8de;
    for (let u = uL; u < uR - 0.01; u += 0.6) for (let w = wB; w < -0.05; w += 0.6) box(u, Math.min(uR, u + 0.6), 0.0, 0.03, w, Math.min(-0.05, w + 0.6), ((Math.round(u / 0.6) + Math.round(w / 0.6)) % 2) ? floorC : new THREE.Color(floorC).multiplyScalar(0.86).getHex());
    box(uL - 0.05, uL, 0, H, wB, -0.05, wallC); box(uR, uR + 0.05, 0, H, wB, -0.05, wallC); box(uL, uR, 0, H, wB - 0.05, wB, wallC);
    box(uL, uR, H - 0.05, H, wB, -0.05, 0xf4f4f0); for (let w = wB + 1.2; w < -0.8; w += 2.4) box((uL + uR) / 2 - 1.2, (uL + uR) / 2 + 1.2, H - 0.08, H - 0.05, w - 0.2, w + 0.2, U.kind === 'bar' ? 0xffb060 : 0xfff8e8, true);
    box(uL, uR, 2.95, H, -0.12, -0.05, wallC);   // the wall over the window, inside
    // fixtures by kind
    const cU = U.dx < (U.u0 + U.u1) / 2 ? uR - 1.6 : uL + 1.6, cS = U.dx < (U.u0 + U.u1) / 2 ? -1 : 1;   // the counter sits on the side away from the door
    const name = U.name || '', kind = /BANK/.test(name) ? 'bank' : /NAIL|SALON|BARBER/.test(name) ? 'salon' : /LAUNDR/.test(name) ? 'laundry' : U.kind;
    const shelfRun = (u, w0, w1, both = true) => { box(u - 0.25, u + 0.25, 0, 1.75, w0, w1, 0xb8bcc2); for (let lv = 0; lv < 4; lv++) { const y = 0.25 + lv * 0.4; box(u - 0.3, u + 0.3, y - 0.03, y, w0, w1, 0x8a8f94);
      for (const sd of both ? [-1, 1] : [1]) for (let w = w0 + 0.1, k = 0; w < w1 - 0.15; w += 0.2 + rnd(k) * 0.1, k++) { const h = 0.12 + rnd(k + lv * 31 + sd * 7) * 0.22; box(u + sd * 0.22 - 0.07, u + sd * 0.22 + 0.07, y, y + h, w, w + 0.14, PRODUCT[(k * 3 + lv + (sd > 0 ? 5 : 0) + U.i) % PRODUCT.length]); } } };
    const counter = (u, w, len = 1.8) => { box(u - 0.35, u + 0.35, 0, 1.0, w - len / 2, w + len / 2, 0x6b4a2a); box(u - 0.4, u + 0.4, 1.0, 1.05, w - len / 2 - 0.05, w + len / 2 + 0.05, 0xd8d4c8); box(u - 0.15, u + 0.15, 1.05, 1.3, w - 0.2, w + 0.15, 0x2a2c30); box(u - 0.12, u + 0.12, 1.3, 1.38, w - 0.18, w + 0.05, 0x3a8a4a, true); };
    if (kind === 'grocery') {
      const n = Math.max(1, Math.floor((uR - uL - 2.6) / 1.9)); for (let k = 0; k < n; k++) shelfRun(uL + 1.6 + k * 1.9 + (cS < 0 ? 0 : 1.0), wB + 1.6, -3.2);
      for (let u = uL + 0.2; u < uR - 0.9; u += 0.95) { box(u, u + 0.9, 0, 2.1, wB, wB + 0.8, 0xd8dce0); box(u + 0.05, u + 0.85, 0.15, 2.0, wB + 0.78, wB + 0.8, 0x9ad0f0, true); for (let lv = 0; lv < 4; lv++) for (let b = 0; b < 4; b++) box(u + 0.1 + b * 0.19, u + 0.22 + b * 0.19, 0.2 + lv * 0.45, 0.48 + lv * 0.45, wB + 0.35, wB + 0.6, PRODUCT[(b + lv * 2 + U.i) % PRODUCT.length]); }
      counter(cU, -1.6); box(cU - 0.2, cU + 0.2, 1.05, 1.18, -0.9, -0.55, 0xd8a050); box(cU - 0.08, cU + 0.08, 1.18, 1.26, -0.88, -0.78, 0xd8a050);   // the bodega cat
      box(cU + cS * 0.5 - 0.05, cU + cS * 0.5 + 0.05, 1.2, 2.2, -2.6, -0.6, 0x1a1a1a); box(cU + cS * 0.5 - 0.06, cU + cS * 0.5 + 0.06, 1.3, 2.1, -2.5, -0.7, 0xff3060, true);   // the lotto / cigarette rack
    } else if (kind === 'food') {
      const wc = -Math.min(4.2, U.rd * 0.55); box(uL, uR, 0, 1.05, wc - 0.6, wc, 0xc8c0b0); box(uL + 0.3, uR - 0.3, 1.05, 1.45, wc - 0.5, wc - 0.05, 0xaad8f0, true); for (let u = uL + 0.5; u < uR - 0.6; u += 0.55) box(u, u + 0.4, 1.08, 1.2, wc - 0.45, wc - 0.15, [0xf2c418, 0xd8301e, 0xe8c890, 0x6b3a1a][Math.floor(u * 3) % 4]);
      box(uL + 0.4, uR - 0.4, 2.0, 2.8, wB + 0.02, wB + 0.08, 0x1a1a1a, true); for (let k = 0; k < 9; k++) box(uL + 0.6 + (k % 3) * ((uR - uL - 1.2) / 3), uL + 0.6 + (k % 3) * ((uR - uL - 1.2) / 3) + 1.0, 2.6 - Math.floor(k / 3) * 0.2, 2.68 - Math.floor(k / 3) * 0.2, wB + 0.08, wB + 0.1, 0xffe8a0, true);   // menu board
      for (let u = uL + 0.4; u < uR - 0.8; u += 1.3) box(u, u + 1.1, 0, 0.95, wB + 0.1, wB + 0.8, 0x9aa0a6); box(uL + 0.4, uL + 1.6, 0.95, 1.1, wB + 0.1, wB + 0.8, 0x2a2c30);   // the kitchen line, a griddle
      for (let w = -1.4; w > wc + 1.2; w -= 1.6) { const u = (uL + uR) / 2 + (U.dx < (U.u0 + U.u1) / 2 ? 1 : -1) * 0.8; box(u - 0.35, u + 0.35, 0.72, 0.76, w - 0.35, w + 0.35, 0xe8e4da); box(u - 0.04, u + 0.04, 0, 0.72, w - 0.04, w + 0.04, 0x2a2c30); for (const s of [-1, 1]) box(u + s * 0.6 - 0.2, u + s * 0.6 + 0.2, 0.44, 0.48, w - 0.2, w + 0.2, 0xc8202a); }
    } else if (kind === 'bar') {
      const bu = cS < 0 ? uR - 0.9 : uL + 0.9; box(bu - 0.35, bu + 0.35, 0, 1.08, wB + 1.0, -1.4, 0x3a2414); box(bu - 0.42, bu + 0.42, 1.08, 1.14, wB + 0.95, -1.35, 0x5a3a24);
      for (let w = wB + 1.4; w < -1.6; w += 0.8) { const su = bu - cS * 0.75; box(su - 0.18, su + 0.18, 0.72, 0.78, w - 0.18, w + 0.18, 0x1a1a1a); box(su - 0.03, su + 0.03, 0, 0.72, w - 0.03, w + 0.03, 0x6b6f75); }
      const wall = cS < 0 ? uR : uL; for (let lv = 0; lv < 3; lv++) { box(wall - cS * 0.3, wall, 1.3 + lv * 0.45, 1.33 + lv * 0.45, wB + 1.0, -1.4, 0x5a3a24); for (let w = wB + 1.1, k = 0; w < -1.5; w += 0.16, k++) box(wall - cS * 0.2 - 0.04, wall - cS * 0.2 + 0.04, 1.33 + lv * 0.45, 1.6 + lv * 0.45, w, w + 0.08, [0x6a3a1a, 0x2a6a3a, 0xd8d4c8, 0x8a1a1a, 0xc8a050][(k + lv) % 5]); }
      box((uL + uR) / 2 - 1.0, (uL + uR) / 2 + 1.0, 2.3, 2.6, wB + 0.02, wB + 0.06, 0xff3060, true);   // the neon over the back
    } else if (kind === 'candy') {
      for (const side of [uL, uR]) for (let w = wB + 0.4; w < -1.2; w += 0.7) for (let lv = 0; lv < 3; lv++) { const s = side === uL ? 1 : -1; box(side, side + s * 0.6, 0.3 + lv * 0.6, 0.35 + lv * 0.6, w, w + 0.6, 0xf4f4f0); box(side + s * 0.05, side + s * 0.5, 0.35 + lv * 0.6, 0.62 + lv * 0.6, w + 0.05, w + 0.55, PRODUCT[(Math.round(w * 3) + lv) % PRODUCT.length], true); }
      counter(cU, -1.5); const lu = (uL + uR) / 2; box(lu - 0.04, lu + 0.04, 0, 1.8, wB + 1.5, wB + 1.58, 0xf4f4f0); box(lu - 0.5, lu + 0.5, 1.8, 2.8, wB + 1.5, wB + 1.6, 0xff4fa0, true);
    } else if (kind === 'bank') {
      box(uL, uR, 0, 1.15, wB + 2.2, wB + 2.8, 0xb8a888); box(uL, uR, 1.15, 2.4, wB + 2.45, wB + 2.5, 0xaad8f0, true); for (let u = uL + 1.2; u < uR - 0.5; u += 1.8) box(u, u + 0.06, 1.15, 2.4, wB + 2.4, wB + 2.55, 0x8a8f94);
      box(cU - 0.4, cU + 0.4, 0, 1.7, -1.2, -0.7, 0x2a3a5a); box(cU - 0.3, cU + 0.3, 1.1, 1.45, -0.72, -0.68, 0x3aa0ff, true);   // the ATM
    } else if (kind === 'salon') {
      for (let w = wB + 1.0; w < -1.8; w += 1.5) { const u = cS < 0 ? uL + 0.7 : uR - 0.7; box(u - 0.3, u + 0.3, 0.4, 0.95, w - 0.3, w + 0.3, 0x2a2c30); box(u - 0.06, u + 0.06, 0, 0.4, w - 0.06, w + 0.06, 0x9aa0a6); const mw = cS < 0 ? uL : uR; box(mw - 0.03, mw + 0.03, 1.1, 2.1, w - 0.4, w + 0.4, 0xcfe8f4, true); }
      counter(cU, -1.4);
    } else if (kind === 'laundry') {
      for (let w = wB + 0.4; w < -1.6; w += 0.8) for (const side of [uL, uR]) { const s = side === uL ? 1 : -1; box(side, side + s * 0.75, 0, 0.9, w, w + 0.7, 0xf4f4f0); box(side + s * 0.76, side + s * 0.78, 0.25, 0.75, w + 0.12, w + 0.58, 0x6a8090, true); box(side, side + s * 0.75, 0.95, 1.85, w, w + 0.7, 0xe0e4e8); }
      box((uL + uR) / 2 - 0.5, (uL + uR) / 2 + 0.5, 0, 0.9, wB + 1.0, -2.5, 0xb8a888);   // the folding table
    } else { counter(cU, -1.6); for (let w = wB + 0.8; w < -2.5; w += 2.0) { const u = (uL + uR) / 2; box(u - 0.7, u + 0.7, 0, 0.75, w - 0.4, w + 0.4, 0x8a6a4a); box(u - 0.25, u + 0.25, 0.75, 1.1, w - 0.2, w + 0.1, 0x1a1a1a); } }
    const grp = new THREE.Group(); grp.name = 'shop:' + U.i;
    if (g.length) grp.add(new THREE.Mesh(mergeGeometries(g, false), mat)); if (gl.length) grp.add(new THREE.Mesh(mergeGeometries(gl, false), glow));
    // the window from inside: a faint pane so the street shows through
    { const a = U.toW(uL, 0.5, -0.06), b = U.toW(uR, 2.9, -0.06), pane = new THREE.Mesh(new THREE.PlaneGeometry(Math.hypot(b.x - a.x, b.z - a.z), 2.4), new THREE.MeshBasicMaterial({ color: 0x9ac8e0, transparent: true, opacity: 0.12, depthWrite: false }));
      pane.position.set((a.x + b.x) / 2, 1.7, (a.z + b.z) / 2); const c = U.toW((uL + uR) / 2, 0, -1); pane.lookAt(c.x, 1.7, c.z); grp.add(pane); }
    return grp;
  }
  let t = 0; const live = new Map(), maxLive = ctx.lite ? 2 : 4;
  world.updaters.push((dt) => { t -= dt; if (t > 0) return; t = 0.5; const P = ctx.player?.position; if (!P) return;
    const byD = units.map((U) => [Math.hypot(U.c[0] - P.x, U.c[2] - P.z), U]).sort((a, b) => a[0] - b[0]);
    for (const [d, U] of byD) { const g = live.get(U); if (g && (d > FAR || [...live.keys()].indexOf(U) >= maxLive + 1)) { scene.remove(g); g.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.material !== mat && o.material !== glow) o.material.dispose(); } }); live.delete(U); } }
    let built = 0; for (const [d, U] of byD) { if (d > NEAR || live.size >= maxLive || built) break; if (!live.has(U)) { const g = build(U); scene.add(g); live.set(U, g); built++; } } });
  console.log('[shops]', units.length, 'shops you can walk into ·', spots.length, 'people in and around them');
  if (typeof window !== 'undefined' && window.__game) window.__game.shops = { list: () => units.map((U) => ({ name: U.name, kind: U.kind, c: U.c.map(Math.round), door: U.toW(U.dx + U.dw / 2, 0, 1.5).toArray().map((v) => +v.toFixed(1)), inside: U.toW(U.dx + U.dw / 2, 0, -2.5).toArray().map((v) => +v.toFixed(1)) })), live: () => live.size };
  return units.length;
}
