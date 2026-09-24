// A NYC corner deli / bodega you can walk into (buildDeli) + simple low-poly people for vendors (buildFigure) + Sammy's
// conversation (sammyTalk). Used by the coney / wsp / sbu hangouts through hangkit.js vendors.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sell } from './hangkit.js';

// ---------------------------------------------------------------------------------------------------------------------------
// people
/**
 * @param o.skin/hair/shirt/pants/shoe colours · o.beard · o.belly (0..1) · o.pose 'stand' | 'sit' | 'walk' · o.tam (rasta knit hat + locs)
 * @returns { group, update(t, moving) }
 */
export function buildFigure(o = {}) {
  const mat = (c, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const skin = mat(o.skin ?? 0xc69c72, 0.6), hair = mat(o.hair ?? 0x1c1714, 0.9), shirt = mat(o.shirt ?? 0x2d3e56), pants = mat(o.pants ?? 0x2a2a2a), shoe = mat(o.shoe ?? 0x222222, 0.6);
  const g = new THREE.Group(); const sit = o.pose === 'sit', belly = o.belly ?? 0.3;
  const add = (parent, geo, m, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => { const e = new THREE.Mesh(geo, m); e.position.set(x, y, z); e.scale.set(sx, sy, sz); e.rotation.set(rx, 0, rz); e.castShadow = true; parent.add(e); return e; };
  const hipY = sit ? 0.5 : 0.92;
  const body = new THREE.Group(); body.position.y = hipY; g.add(body);
  add(body, new THREE.CapsuleGeometry(0.19, 0.36, 4, 12), shirt, 0, 0.36, 0, (o.slim ? 0.92 : 1.15) + belly * 0.25, 1, (o.slim ? 0.72 : 0.9) + belly * 0.35);          // torso
  if (belly > 0.2) add(body, new THREE.SphereGeometry(0.2, 12, 10), shirt, 0, 0.22, 0.08, 1.1, 0.9, 0.6 + belly * 0.6);             // belly
  add(body, new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), skin, 0, 0.72, 0);                                                       // neck
  const head = new THREE.Group(); head.position.set(0, 0.86, 0.01); body.add(head);
  add(head, new THREE.SphereGeometry(0.115, 16, 12), skin, 0, 0, 0, 0.95, 1.12, 1.02);
  add(head, new THREE.SphereGeometry(0.024, 8, 6), skin, 0, -0.01, 0.115);                                                             // nose
  for (const s of [-1, 1]) add(head, new THREE.SphereGeometry(0.02, 8, 6), skin, s * 0.112, 0, 0);                                    // ears
  if (!o.tam) add(head, new THREE.SphereGeometry(0.12, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, 0, 0.025, -0.006, 1, 0.8, 1.05);
  if (o.beard) add(head, new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), mat(o.beardColor ?? o.hair ?? 0x1c1714, 0.95), 0, -0.02, 0.025, 0.98, 1.05, 1.02);
  if (o.glasses) { const gm = mat(0x111111, 0.3); for (const s of [-1, 1]) add(head, new THREE.TorusGeometry(0.028, 0.005, 6, 14), gm, s * 0.045, 0.02, 0.105); }
  if (o.tam) {   // rasta knit tam in red / gold / green bands, locs hanging behind
    const cols = [0x1f7a33, 0xe0b422, 0xb4221c];
    cols.forEach((c, i) => add(head, new THREE.CylinderGeometry(0.15 - i * 0.012, 0.155 - i * 0.012, 0.055, 16), mat(c, 0.95), 0, 0.07 + i * 0.05, -0.03));
    add(head, new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(cols[0], 0.95), 0, 0.2, -0.03, 1.05, 0.7, 1.1);
    const lm = mat(o.hair ?? 0x1a120c, 0.95); for (let k = 0; k < 9; k++) { const a = Math.PI * (0.25 + 0.5 * k / 8) + Math.PI / 2; add(head, new THREE.CapsuleGeometry(0.016, 0.3, 3, 6), lm, Math.cos(a) * 0.1, -0.12, Math.sin(a) * 0.08 - 0.05, 1, 1, 1, 0.15, 0); }
  }
  // arms (pivot at the shoulder) and legs (pivot at the hip)
  const limbs = { arms: [], legs: [] };
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * ((o.slim ? 0.21 : 0.25) + belly * 0.04), 0.62, 0); body.add(sh);
    add(sh, new THREE.CapsuleGeometry(0.06, 0.24, 4, 8), shirt, 0, -0.14, 0);
    const fore = new THREE.Group(); fore.position.y = -0.3; sh.add(fore);
    add(fore, new THREE.CapsuleGeometry(0.05, 0.2, 4, 8), o.shortSleeve === false ? shirt : skin, 0, -0.12, 0); add(fore, new THREE.SphereGeometry(0.048, 8, 6), skin, 0, -0.27, 0);
    if (sit) { sh.rotation.x = -0.5; fore.rotation.x = -0.9; sh.rotation.z = s * 0.1; } else sh.rotation.z = s * 0.06;
    limbs.arms.push({ sh, fore, s });
    const hip = new THREE.Group(); hip.position.set(s * 0.1, 0, 0); body.add(hip);
    add(hip, new THREE.CapsuleGeometry(0.08, 0.34, 4, 8), pants, 0, -0.22, 0);
    const knee = new THREE.Group(); knee.position.y = -0.44; hip.add(knee);
    add(knee, new THREE.CapsuleGeometry(0.065, 0.32, 4, 8), pants, 0, -0.2, 0); add(knee, new THREE.BoxGeometry(0.1, 0.07, 0.25), shoe, 0, -0.44, 0.05);
    if (sit) { hip.rotation.x = -Math.PI / 2; knee.rotation.x = Math.PI / 2; }
    limbs.legs.push({ hip, knee, s });
  }
  let ph = Math.random() * 6;
  return {
    group: g, head,
    update(dt, speed = 0) {   // walk cycle driven by speed (m/s); idle sway otherwise
      if (sit) { head.rotation.y = Math.sin(performance.now() / 2300) * 0.25; return; }
      ph += dt * (speed > 0.05 ? speed * 5.2 : 0); const a = speed > 0.05 ? Math.sin(ph) * 0.5 : 0;
      for (const L of limbs.legs) { L.hip.rotation.x = a * L.s; L.knee.rotation.x = Math.max(0, -Math.sin(ph + (L.s > 0 ? 0 : Math.PI)) * 0.6) * (speed > 0.05 ? 1 : 0); }
      for (const A of limbs.arms) { A.sh.rotation.x = -a * A.s * 0.8; A.fore.rotation.x = -0.25; }
      body.position.y = hipY + (speed > 0.05 ? Math.abs(Math.cos(ph)) * 0.03 : Math.sin(performance.now() / 900) * 0.004);
    },
  };
}

export function nameTag(text, color = '#ffd27a') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.font = '700 34px Barlow, Arial'; x.textAlign = 'center';
  const w = Math.min(236, x.measureText(text).width + 36); x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(128 - w / 2, 10, w, 44); x.fillStyle = color; x.fillText(text, 128, 44);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })); s.scale.set(1.1, 0.28, 1); return s;
}

// ---------------------------------------------------------------------------------------------------------------------------
// the deli
const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

/**
 * Walk-in bodega. Front (the door) faces the street; local +z runs into the store.
 * @param o.x/z storefront centre on the ground · o.y ground height · o.yaw rotation so local +z = into the store · o.name awning text
 * @returns { sammy: Vector3 (vendor point), door: Vector3 (outside the door), inside: Vector3, group }
 */
export function buildDeli(world, o) {
  const { scene, ctx } = world; const y0 = o.y || 0;
  const Wd = 8, D = 11, Hh = 4.2, CEIL = 3.2, T = 0.22;
  const root = new THREE.Group(); root.position.set(o.x, y0, o.z); root.rotation.y = o.yaw; scene.add(root);
  const L = (x, z, y = 0) => new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), o.yaw).add(new THREE.Vector3(o.x, y0, o.z));
  // colliders: rotated walls become 0.5 m AABB cells so the interior stays walkable
  const cellBox = (x0, z0, x1, z1, yb, yt) => {
    const nx = Math.max(1, Math.ceil(Math.abs(x1 - x0) / 0.5)), nz = Math.max(1, Math.ceil(Math.abs(z1 - z0) / 0.5));
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      const ax = x0 + (x1 - x0) * i / nx, bx = x0 + (x1 - x0) * (i + 1) / nx, az = z0 + (z1 - z0) * k / nz, bz = z0 + (z1 - z0) * (k + 1) / nz;
      const cs = [L(ax, az), L(bx, az), L(ax, bz), L(bx, bz)];
      world.box([Math.min(...cs.map((c) => c.x)), y0 + yb, Math.min(...cs.map((c) => c.z))], [Math.max(...cs.map((c) => c.x)), y0 + yt, Math.max(...cs.map((c) => c.z))]);
    }
  };
  const M = {
    brick: new THREE.MeshStandardMaterial({ color: 0x8a4a36, roughness: 0.92 }),
    wall: new THREE.MeshStandardMaterial({ color: 0xe9e2cf, roughness: 0.9 }),
    ceil: new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: 0.95 }),
    tube: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f7ff, emissiveIntensity: 2.2 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x9fb4bf, roughness: 0.06, transparent: true, opacity: 0.28, envMapIntensity: 1.2, depthWrite: false }),
    frame: new THREE.MeshStandardMaterial({ color: 0x1e2022, roughness: 0.4, metalness: 0.7 }),
    shelf: new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.5, metalness: 0.4 }),
    counter: new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.7 }),
    top: new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.35, metalness: 0.3 }),
    plexi: new THREE.MeshPhysicalMaterial({ color: 0xd8e4ea, roughness: 0.04, transparent: true, opacity: 0.18, depthWrite: false }),
    fridge: new THREE.MeshStandardMaterial({ color: 0xe8f0ff, emissive: 0xcfe0ff, emissiveIntensity: 0.9, roughness: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.6 }),
    floor: new THREE.MeshStandardMaterial({ roughness: 0.55, map: canvasTex(256, 256, (g) => { for (let i = 0; i < 8; i++) for (let k = 0; k < 8; k++) { g.fillStyle = (i + k) % 2 ? '#e6dfcc' : '#8a6f55'; g.fillRect(i * 32, k * 32, 32, 32); } g.fillStyle = 'rgba(40,30,20,0.12)'; for (let n = 0; n < 900; n++) g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }) }),
  };
  M.floor.map.wrapS = M.floor.map.wrapT = THREE.RepeatWrapping; M.floor.map.repeat.set(Wd / 2.4, D / 2.4);
  const PAL = [0xc8201e, 0x2a62c8, 0xf2c418, 0x2f9a48, 0xe86a1c, 0x7a3fb0, 0xf0f0ea, 0x1a1a1a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
  const box = (m, x0, y0b, z0, x1, y1, z1, collide = false) => { const e = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0b, z1 - z0), m); e.position.set((x0 + x1) / 2, (y0b + y1) / 2, (z0 + z1) / 2); e.castShadow = e.receiveShadow = true; root.add(e); if (collide) cellBox(x0, z0, x1, z1, y0b, y1); return e; };
  const hx = Wd / 2;
  // shell: side + back walls, front piers / sills / header, roof, ceiling, floor
  box(M.brick, -hx - T, 0, 0, -hx, Hh, D + T, true); box(M.brick, hx, 0, 0, hx + T, Hh, D + T, true); box(M.brick, -hx - T, 0, D, hx + T, Hh, D + T, true);
  box(M.wall, -hx + 0.01, 0, 0.2, -hx + 0.03, CEIL, D - 0.01); box(M.wall, hx - 0.03, 0, 0.2, hx - 0.01, CEIL, D - 0.01); box(M.wall, -hx, 0, D - 0.03, hx, CEIL, D - 0.01);
  box(M.brick, -hx - T, 0, -0.05, -hx + 0.4, Hh, 0.2, true); box(M.brick, hx - 0.4, 0, -0.05, hx + T, Hh, 0.2, true);   // corner piers
  for (const [a, b] of [[-hx + 0.4, -0.9], [0.9, hx - 0.4]]) { box(M.brick, a, 0, -0.05, b, 0.6, 0.2, true); box(M.frame, a, 0.6, 0, b, 0.66, 0.16); const gl = box(M.glass, a, 0.66, 0.06, b, 2.8, 0.1); gl.castShadow = false; cellBox(a, 0, b, 0.2, 0.6, 2.8); }
  box(M.brick, -hx - T, 2.8, -0.05, hx + T, Hh, 0.2, true);   // header over windows + door (2.8 m clear)
  for (const x of [-0.9, 0.9]) box(M.frame, x - 0.05, 0, -0.02, x + 0.05, 2.8, 0.2);
  box(M.brick, -hx - T, Hh - 0.02, -0.05, hx + T, Hh + 0.25, D + T);   // roof + parapet cap
  box(M.ceil, -hx, CEIL, 0.2, hx, CEIL + 0.04, D);
  const fl = box(M.floor, -hx, 0, 0.2, hx, 0.03, D); fl.castShadow = false;
  for (let k = 0; k < 3; k++) for (const x of [-1.8, 1.8]) box(M.tube, x - 0.08, CEIL - 0.05, 2 + k * 3.2, x + 0.08, CEIL, 3.6 + k * 3.2);
  // interior light so the store reads lit from the street at any time of day
  const lamp = new THREE.PointLight(0xf2f6ff, 14, 13, 1.6); lamp.position.set(0, CEIL - 0.3, D / 2); root.add(lamp);
  // sign board + awning
  const sign = canvasTex(1024, 128, (g, w, h) => { g.fillStyle = '#f4d21c'; g.fillRect(0, 0, w, h); g.fillStyle = '#c3121b'; const txt = o.name || "SAMMY'S DELI & GROCERY"; let fs = 86; do { g.font = `900 ${fs}px Arial Black, Arial`; fs -= 4; } while (g.measureText(txt).width > w - 40 && fs > 30); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w / 2, h / 2 + 4); });
  const sb = new THREE.Mesh(new THREE.BoxGeometry(Wd + 0.3, 0.95, 0.12), [M.dark, M.dark, M.dark, M.dark, new THREE.MeshStandardMaterial({ map: sign, emissive: 0xffffff, emissiveMap: sign, emissiveIntensity: 0.55, roughness: 0.5 }), M.dark]);
  sb.rotation.y = Math.PI; sb.position.set(0, 3.45, -0.14); root.add(sb);
  const aw = canvasTex(512, 64, (g, w, h) => { for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#f2efe6' : '#b3121c'; g.fillRect(i * w / 16, 0, w / 16, h); } });
  const awn = new THREE.Mesh(new THREE.PlaneGeometry(Wd + 0.2, 1.3), new THREE.MeshStandardMaterial({ map: aw, side: THREE.DoubleSide, roughness: 0.9 })); awn.position.set(0, 2.62, -0.6); awn.rotation.x = -Math.PI / 2 + 0.55; root.add(awn);
  // window signs: OPEN / COLD BEER / LOTTO / ATM (emissive neon-ish cards just inside the glass)
  const card = (txt, fg, bg, x, y, w, h, glow = 1.4) => { const t = canvasTex(256, 96, (g, W, H) => { g.fillStyle = bg; g.fillRect(0, 0, W, H); g.fillStyle = fg; g.font = '800 54px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, W / 2, H / 2 + 2); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: glow, transparent: true })); m.position.set(x, y, 0.13); m.rotation.y = Math.PI; root.add(m); };
  card('OPEN', '#ff3b3b', '#120404', -2.6, 2.1, 0.9, 0.34, 2.2); card('COLD BEER', '#3bd0ff', '#040a12', -2.0, 1.5, 1.4, 0.42, 2); card('LOTTO', '#ffd23b', '#1a1204', 2.4, 2.2, 0.9, 0.34, 1.6); card('ATM', '#ffffff', '#0a3a8a', 3.1, 1.3, 0.5, 0.3, 0.8);
  card('HERO · COFFEE · BACON EGG & CHEESE', '#1a1a1a', '#f2efe6', 1.9, 0.95, 1.9, 0.26, 0.35);
  // counter (runs into the store along the right wall) with plexiglass, register, lotto machine, candy rack
  const cx0 = 1.9, cx1 = 2.6, cz0 = 1.1, cz1 = 4.2;
  box(M.counter, cx0, 0, cz0, cx1, 1.0, cz1, true); box(M.top, cx0 - 0.05, 1.0, cz0 - 0.05, cx1 + 0.05, 1.05, cz1 + 0.05);
  box(M.counter, cx1, 0, cz1 - 0.1, hx, 1.0, cz1 + 0.05, true);   // closes the gap behind the counter
  const px = box(M.plexi, cx0 + 0.02, 1.05, cz0 + 0.3, cx0 + 0.04, 1.95, cz1 - 0.2); px.castShadow = false;
  box(M.dark, cx0 + 0.15, 1.05, 1.55, cx0 + 0.55, 1.28, 2.0); box(M.dark, cx0 + 0.3, 1.28, 1.65, cx0 + 0.5, 1.42, 1.9);   // register (door end, not in Sammy's face)
  box(PAL[2], cx0 + 0.1, 1.05, 3.4, cx0 + 0.5, 1.5, 3.8);   // lotto terminal
  box(M.frame, cx0 - 0.06, 0.15, cz0 + 0.25, cx0 - 0.02, 0.95, cz0 + 2.6);   // candy rack back panel
  for (let r = 0; r < 4; r++) for (let k = 0; k < 16; k++) box(PAL[(k * 5 + r * 3) % 8], cx0 - 0.3, 0.2 + r * 0.2, cz0 + 0.3 + k * 0.145, cx0 - 0.06, 0.29 + r * 0.2, cz0 + 0.41 + k * 0.145);
  // behind the counter: cigarette + liquor shelves on the right wall
  for (let s = 0; s < 4; s++) { box(M.shelf, hx - 0.45, 1.15 + s * 0.4, 0.9, hx - 0.05, 1.18 + s * 0.4, 4.6); for (let k = 0; k < 14; k++) { const m = PAL[(k * 3 + s) % 8]; if (s < 2) box(m, hx - 0.4, 1.18 + s * 0.4, 1.0 + k * 0.25, hx - 0.12, 1.34 + s * 0.4, 1.2 + k * 0.25); else { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.3, 8), s === 2 ? new THREE.MeshStandardMaterial({ color: 0x6a3a10, roughness: 0.15 }) : new THREE.MeshStandardMaterial({ color: 0x2a4a1a, roughness: 0.15 })); b.position.set(hx - 0.25, 1.33 + s * 0.4, 1.05 + k * 0.25); root.add(b); } } }
  // aisles: two gondolas + a wall shelf of chips / cans
  const gondola = (x, z0, z1) => { box(M.shelf, x - 0.35, 0, z0, x + 0.35, 0.12, z1, true); box(M.shelf, x - 0.03, 0, z0, x + 0.03, 1.6, z1, true);
    for (let s = 0; s < 4; s++) for (const side of [-1, 1]) { box(M.shelf, x + side * 0.35 - (side > 0 ? 0.32 : 0), 0.3 + s * 0.38, z0, x + side * 0.35 + (side < 0 ? 0.32 : 0), 0.32 + s * 0.38, z1);
      for (let z = z0 + 0.08; z < z1 - 0.2; z += 0.22) box(PAL[Math.floor(Math.random() * 8)], x + side * 0.2 - 0.1, 0.32 + s * 0.38, z, x + side * 0.2 + 0.1, 0.32 + s * 0.38 + 0.18 + Math.random() * 0.1, z + 0.17); } };
  gondola(-2.2, 4.6, 8.9); gondola(-0.1, 4.6, 8.9);
  box(M.shelf, -hx, 0, 1.0, -hx + 0.5, 2.2, 9.2, true);
  for (let s = 0; s < 5; s++) for (let z = 1.1; z < 9.0; z += 0.3) box(PAL[Math.floor(Math.random() * 8)], -hx + 0.08, 0.2 + s * 0.42, z, -hx + 0.45, 0.4 + s * 0.42 + Math.random() * 0.08, z + 0.24);
  // beer fridges on the back wall (the glow you see from the street)
  box(M.dark, -hx + 0.2, 0, D - 0.75, hx - 0.2, 2.35, D - 0.05, true);
  for (let d = 0; d < 7; d++) { const x0 = -hx + 0.3 + d * 1.06; box(M.fridge, x0, 0.12, D - 0.72, x0 + 0.98, 2.25, D - 0.7);
    for (let s = 0; s < 5; s++) for (let k = 0; k < 6; k++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 7), PAL[(d + s + k) % 3 === 0 ? 3 : (d + k) % 8]); b.position.set(x0 + 0.1 + k * 0.155, 0.28 + s * 0.42, D - 0.66); root.add(b); } }
  for (let d = 0; d <= 7; d++) box(M.frame, -hx + 0.26 + d * 1.06, 0.1, D - 0.69, -hx + 0.3 + d * 1.06, 2.28, D - 0.66);
  // Sammy on his stool behind the counter, facing the aisle; the bodega cat asleep on the counter
  const sammy = buildFigure({ pose: 'sit', skin: 0xb88760, hair: 0x221c18, beard: false, shirt: o.shirt ?? 0x2f3d52, pants: 0x2b2b2e, belly: 0, slim: true, glasses: !!o.glasses, shortSleeve: false });   // thin, clean-shaven
  sammy.group.position.set(3.25, 0.32, 2.6); sammy.group.rotation.y = -Math.PI / 2; root.add(sammy.group);   // on a tall stool: head clears the counter
  box(M.frame, 3.12, 0, 2.47, 3.38, 0.82, 2.73);   // stool
  const tag = nameTag(o.vendorName || 'SAMMY'); tag.position.set(0, 1.85, 0); sammy.group.add(tag);
  { const cat = new THREE.Group(); const fur = new THREE.MeshStandardMaterial({ color: 0xd08a3c, roughness: 0.95 });
    const e = (geo, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, fur); m.position.set(x, y, z); m.scale.set(sx, sy, sz); cat.add(m); };
    e(new THREE.SphereGeometry(0.13, 12, 8), 0, 0.09, 0, 1.6, 0.7, 1); e(new THREE.SphereGeometry(0.075, 10, 8), 0.2, 0.1, 0.03); e(new THREE.ConeGeometry(0.025, 0.05, 6), 0.21, 0.17, 0.0); e(new THREE.ConeGeometry(0.025, 0.05, 6), 0.21, 0.17, 0.06);
    e(new THREE.CapsuleGeometry(0.02, 0.2, 3, 6), -0.2, 0.04, 0.08, 1, 1, 1); cat.children[cat.children.length - 1].rotation.z = Math.PI / 2;
    cat.position.set(cx0 + 0.3, 1.05, 3.1); cat.rotation.y = 0.5; root.add(cat); }
  // merge everything static into one mesh per material (the shelves are hundreds of little boxes)
  { root.updateMatrixWorld(true); const inv = root.matrixWorld.clone().invert(); const byMat = new Map(); const kill = [];
    root.traverse((e) => { if (!e.isMesh || e.parent !== root || Array.isArray(e.material)) return; const g = e.geometry.clone().applyMatrix4(inv.clone().multiply(e.matrixWorld)); const gg = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gg.deleteAttribute(k); (byMat.get(e.material) || byMat.set(e.material, []).get(e.material)).push(gg); kill.push(e); });
    for (const e of kill) root.remove(e);
    for (const [m, list] of byMat) { const mesh = new THREE.Mesh(mergeGeometries(list, false), m); mesh.castShadow = !m.transparent && m !== M.tube && m !== M.fridge; mesh.receiveShadow = true; root.add(mesh); ctx.raycastTargets?.push(mesh); } }
  world.updaters?.push((dt) => sammy.update(dt));
  return { sammy: L(3.25, 2.6), counter: L(1.3, 2.6), door: L(0, -1.6), inside: L(0, 1.4), face: o.yaw + Math.PI, group: root };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Sammy's talk: the first time he has to ask his question before he'll sell you anything; after that he just teases you.
export function sammyTalk(vendorName = 'SAMMY', { cousin = false } = {}) {
  const shop = () => ({
    text: `What you need, my friend? Liquor, fifteen dollar — I keep it under the counter. Or, I tell you… the big 40 of Olde English. Five dollar. Best deal in the neighborhood.`,
    choices: [
      { label: 'Bottle of liquor — $15', go: () => after(sell('bottle', 15, vendorName, lines)) },
      { label: '40oz Olde English — $5', go: () => after(sell('forty', 5, vendorName, { ...lines, ok: `Good choice! Here — in the bag. Don't drink it in front of the store, the cops they know me. Share with your boys!` })) },
      { label: 'Nothing, just looking', go: { text: 'Looking is free. The cat is also free. …No. The cat is not free.', choices: [{ label: 'Later, Sammy', go: null }] } },
    ],
  });
  const lines = { ok: `Here. Put it away, put it away. And share with your friends, eh? Don't be stingy.`, broke: `You don't have money? Go take it off those guys shooting up the block, hahaha. Then come back.`, full: `Your hands are full, habibi. Drink first. (B)` };
  const after = (reply) => ({ text: reply, choices: [{ label: 'Something else', go: shop }, { label: 'Thanks, Sammy', go: null }] });
  const question = (lead) => ({
    text: `${lead}Before I sell you anything, I ask you something serious. Very serious. You and your girlfriend… you do the anal yet?`,
    choices: [
      { label: `…What?! Yeah. We do.`, go: { text: `Hahaha! My man! Wallahi, I knew it — you have the face. OK. For you, special price.`, choices: [{ label: 'Uh… thanks?', go: shop }] } },
      { label: `Nah, she's not into it.`, go: { text: `Patience, habibi. Patience. You buy her something nice, you take her on the boardwalk… then you ask her about the anal. Inshallah. Now, what you need?`, choices: [{ label: `I'll work on it`, go: shop }] } },
      { label: `I don't have a girlfriend.`, go: { text: `No girlfriend?! No anal, no girlfriend — that's why you look so stressed, my friend. OK, OK. Drink, relax, you find one.`, choices: [{ label: 'Wow. OK.', go: shop }] } },
      { label: `Why do you ask everybody about anal?`, go: { text: `Twenty-two years behind this counter. Everybody lies about the Lotto — nobody lies to Sammy about the anal. Hahaha!`, choices: [{ label: 'Fair enough', go: shop }] } },
    ] });
  return (K, again) => again
    ? question(['My friend is back! So… you did the anal yet or no? Hahaha. ', 'Ahh, look who it is. So tell me the truth now — the anal, yes? ', 'Again you come! OK, same question, I need to know. '][Math.floor(Math.random() * 3)])
    : question(cousin ? `Ahh, welcome, welcome! My cousin has the store in Coney Island — same family, same prices, same question. ` : `Ahh, my friend! Come in, come in, close the door, the cat gets out. `);
}

/** Rasta dealer's talk (wsp / sbu): ten dollars a bag. */
export function rastaTalk(vendorName = 'RAS') {
  return (K, again) => ({
    text: again ? `Bredren! Yuh back. Need more of di good herb?` : `Wha gwan, bredren. Everyting irie? Mi have di good herb — ten dollar a bag. Straight from di garden.`,
    choices: [
      { label: 'One bag — $10', go: () => ({ text: sell('weed', 10, vendorName, { ok: `Bless up. Pass it to yuh bredren dem, seen? (B)`, broke: `Ten dollar, bredren. Come back when yuh have it.`, full: `Yuh pockets full already, mon. Smoke dat first. (B)` }), choices: [{ label: 'Respect', go: null }] }) },
      { label: `Nah, I'm good`, go: { text: `No problem, mon. Walk good.`, choices: [{ label: 'Later', go: null }] } },
    ],
  });
}

// ---------------------------------------------------------------------------------------------------------------------------
/** First free 8.5 × 13 m footprint (storefront + 2 m of sidewalk) near any candidate { x, z, yaw } (local +z = into the store),
 *  searching outward up to `reach` m along the frontage and back from it; on maps with a ground mask (world.maskSample) the
 *  store must stand on sidewalk / paving (never road or lawn) with a road just outside its door. Falls back to scanning the
 *  whole playable area. Returns { x, z, yaw } or null. */
export function findDeliSpot(world, candidates, reach = 40, { exclude = [] } = {}) {
  const cols = world.ctx.colliders.filter((b) => !(b.max.y <= 1.6 && b.max.x - b.min.x < 5.2 && b.max.z - b.min.z < 5.2));   // parked cars move out of the way
  const V = world.maskSample;
  const out = (x, z) => exclude.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
  const clear = (fx, fz, yaw) => { const s = Math.sin(yaw), c = Math.cos(yaw);   // local x → (c, -s), local z → (s, c)
    for (const [a, d] of [[-4.6, -2], [4.6, -2], [-4.6, 11.6], [4.6, 11.6], [0, 5]]) if (out(fx + c * a + s * d, fz - s * a + c * d)) return false;
    if (V) {   // cheap mask pass first: a road right outside the door, sidewalk / paving under the whole store
      let road = 0; for (let a = -3; a <= 3; a += 1.5) if (V(fx + c * a - s * 6, fz - s * a - c * 6) === 'asphalt') road++; if (road < 3) return false;
      for (let a = -4.6; a <= 4.6; a += 1.15) for (let d = 0; d <= 11.6; d += 1.15) { const m = V(fx + c * a + s * d, fz - s * a + c * d); if (m === 'asphalt' || m === 'lawn') return false; }
    }
    for (let a = -4.6; a <= 4.6; a += 0.8) for (let d = -2.2; d <= 11.6; d += 0.8) { const x = fx + c * a + s * d, z = fz - s * a + c * d;
      if (cols.some((b) => x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z && b.max.y > 0.4 && b.min.y < 3)) return false;
      const g = world.groundHeight ? world.groundHeight(x, z) : 0; if (Number.isFinite(g) && Math.abs(g) > 0.35) return false; }
    return true; };
  const bump = (x, z, yaw) => {   // parked cars on the footprint / in front of the door go
    const s = Math.sin(yaw), c = Math.cos(yaw);
    for (const car of world.parkedCars || []) { if (car.gone) continue; const dx = car.x - x, dz = car.z - z, la = dx * c - dz * s, ld = dx * s + dz * c; if (Math.abs(la) < 6 && ld > -4 && ld < 13) { hideCar(world, car); } } };
  for (const cand of candidates) {
    const s = Math.sin(cand.yaw), c = Math.cos(cand.yaw);
    for (let r = 0; r <= reach; r += 2) for (const sgn of r ? [1, -1] : [1]) for (const back of [0, 3, -3, 6]) {
      const x = cand.x + c * r * sgn + s * back, z = cand.z - s * r * sgn + c * back;
      if (clear(x, z, cand.yaw)) { bump(x, z, cand.yaw); return { x, z, yaw: cand.yaw }; }
    }
  }
  // fallback: every valid frontage on the map, nearest to where friends meet wins
  const B = world.W?.bounds; if (!B) return null; const [mx, , mz] = world.W.onlineStart || [0, 0, 0]; let best = null, bd = Infinity;
  for (const yaw of [0, Math.PI, Math.PI / 2, -Math.PI / 2]) for (let x = B.min.x + 10; x < B.max.x - 10; x += 2) for (let z = B.min.z + 10; z < B.max.z - 10; z += 2) {
    const d = Math.hypot(x - mx, z - mz); if (d < bd && clear(x, z, yaw)) { bd = d; best = { x, z, yaw }; } }
  if (best) bump(best.x, best.z, best.yaw);
  return best;
}
function hideCar(world, car) { car.gone = true; for (const { im, i } of car.refs || []) { im.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); im.instanceMatrix.needsUpdate = true; } if (car.box) { const k = world.ctx.colliders.indexOf(car.box); if (k > -1) world.ctx.colliders.splice(k, 1); } }

/** A vendor who walks a loop of waypoints (stops and turns to face anyone who comes close). Registers with the hangkit. */
export function buildWalker(world, K, o) {
  const f = buildFigure({ skin: o.skin ?? 0x5a3a28, hair: 0x1a120c, beard: true, beardColor: 0x1a120c, tam: !!o.tam, shirt: o.shirt ?? 0x6b7a3a, pants: o.pants ?? 0x4a4236, shoe: 0x6a5238, belly: 0.1, shortSleeve: true });
  const tag = nameTag(o.name); tag.position.set(0, 2.15, 0); f.group.add(tag);
  world.scene.add(f.group);
  const path = o.path.map(([x, z]) => new THREE.Vector3(x, 0, z)); let i = 0, seg = 1;
  const pos = path[0].clone(); f.group.position.copy(pos);
  const vendor = K.vendor({ name: o.name, pos, r: 2.4, talk: o.talk });
  const gy = (x, z) => { const g = world.groundHeight ? world.groundHeight(x, z) : 0; return Number.isFinite(g) ? g : 0; };
  let wait = 0, yaw = 0;
  K.onUpdate((dt) => {
    const ctx = world.ctx; const me = ctx.player?.position; let near = me && Math.hypot(me.x - pos.x, me.z - pos.z) < 4 ? me : null;
    if (!near && ctx.net?.list) for (const id of ctx.net.list()) { const q = ctx.net.peer(id); if (q?.pos && Math.hypot(q.pos.x - pos.x, q.pos.z - pos.z) < 3.5) { near = q.pos; break; } }
    let speed = 0;
    if (near) { const want = Math.atan2(near.x - pos.x, near.z - pos.z); let d = want - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * Math.min(1, dt * 5); }
    else if (wait > 0) wait -= dt;
    else {
      const tgt = path[i]; const dx = tgt.x - pos.x, dz = tgt.z - pos.z, L = Math.hypot(dx, dz);
      if (L < 0.4) { i += seg; if (i >= path.length || i < 0) { seg = -seg; i += 2 * seg; } if (Math.random() < 0.35) wait = 2 + Math.random() * 4; }
      else { speed = o.speed ?? 1.05; const k = Math.min(L, speed * dt) / L; pos.x += dx * k; pos.z += dz * k; const want = Math.atan2(dx, dz); let d = want - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * Math.min(1, dt * 6); }
    }
    pos.y = gy(pos.x, pos.z); f.group.position.copy(pos); f.group.rotation.y = yaw; f.update(dt, speed);
  });
  return vendor;
}
