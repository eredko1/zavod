// TERMINAL — exterior: Main Street block south of the waiting hall (sidewalks, road, taxis, lamps, hydrants, kiosks), the terminal's street
// facade (attic, clock group, flank wings, exterior shell), the elevated viaduct with its approach, the far-side buildings, a tower directly
// north, a hazy midtown-style skyline and a sky dome. Closed one block out. TERMINAL agent.
import * as THREE from 'three';
import { placeCars } from '../carkit.js';
import { Bucket, mat4, lathe, instanced } from './kit.js';
import { P } from './plan.js';
import { SUN_DIR } from './lighting.js';

function canvasTex(w, h, draw, { srgb = true, repeat = true } = {}) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; }

export function buildExterior(world, M, Z) {
  const { ctx, scene, R } = world; const B = new Bucket(world);
  const { ST, VH, SUB, LOW } = P; const T = 1.0;
  const uv = (m) => m.userData.uv ?? 0.5;

  // ---- materials -------------------------------------------------------------------------------------------------------------------
  const road = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, map: canvasTex(512, 512, (g, W, H) => {
    g.fillStyle = '#34353a'; g.fillRect(0, 0, W, H); for (let i = 0; i < 9000; i++) { const v = 35 + R() * 50; g.fillStyle = `rgba(${v},${v},${v + 3},0.6)`; g.fillRect(R() * W, R() * H, 2, 2); }
    g.fillStyle = '#d9c246'; g.fillRect(0, H * 0.19, W, 4); g.fillRect(0, H * 0.21, W, 4);                       // double yellow centre line
    g.fillStyle = '#e8e6df'; for (let x = 0; x < W; x += 96) { g.fillRect(x, H * 0.53, 48, 4); g.fillRect(x, H * 0.87, 48, 4); }  // dashed lane lines
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(20,20,22,${0.2 + R() * 0.4})`; g.fillRect(R() * W, R() * H, 20 + R() * 80, 3 + R() * 10); }
  }) }); road.name = 'road'; road.userData.uv = 1 / 15;
  const sidewalk = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, map: canvasTex(512, 512, (g, W, H) => {
    g.fillStyle = '#9a968d'; g.fillRect(0, 0, W, H); for (let i = 0; i < 6000; i++) { const v = 120 + R() * 60; g.fillStyle = `rgba(${v},${v - 3},${v - 8},0.5)`; g.fillRect(R() * W, R() * H, 2, 2); }
    g.strokeStyle = 'rgba(60,58,52,0.8)'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, H); g.stroke(); g.beginPath(); g.moveTo(0, i * 128); g.lineTo(W, i * 128); g.stroke(); }
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(30,30,30,${0.3 + R() * 0.4})`; g.beginPath(); g.arc(R() * W, R() * H, 3 + R() * 8, 0, 7); g.fill(); }
  }) }); sidewalk.name = 'sidewalk'; sidewalk.userData.uv = 1 / 6;
  const facadeTex = (bg, win, floors = 2, bays = 2) => canvasTex(512, 512, (g, W, H) => {
    g.fillStyle = bg; g.fillRect(0, 0, W, H); for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${R() * 0.12})`; g.fillRect(R() * W, R() * H, 3, 3); }
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; for (let y = 0; y < H; y += H / floors / 3) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const fw = W / bays, fh = H / floors;
    for (let f = 0; f < floors; f++) for (let b = 0; b < bays; b++) { const x = b * fw + fw * 0.25, y = f * fh + fh * 0.2; g.fillStyle = '#3a3532'; g.fillRect(x - 6, y - 6, fw * 0.5 + 12, fh * 0.55 + 12); g.fillStyle = win; g.fillRect(x, y, fw * 0.5, fh * 0.55); g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x, y, fw * 0.5, fh * 0.12); g.fillStyle = '#2a2622'; g.fillRect(x + fw * 0.25 - 2, y, 4, fh * 0.55); g.fillRect(x, y + fh * 0.27, fw * 0.5, 4); }
  });
  const bldgA = new THREE.MeshStandardMaterial({ map: facadeTex('#a08c72', '#4a5a6c'), roughness: 0.85 }); bldgA.name = 'bldgA'; bldgA.userData.uv = 1 / 8;
  const bldgB = new THREE.MeshStandardMaterial({ map: facadeTex('#7d6b5c', '#55606a'), roughness: 0.85 }); bldgB.name = 'bldgB'; bldgB.userData.uv = 1 / 8;
  const bldgC = new THREE.MeshStandardMaterial({ map: facadeTex('#b9b2a4', '#3f5468', 2, 3), roughness: 0.8 }); bldgC.name = 'bldgC'; bldgC.userData.uv = 1 / 9;
  const glassTower = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (g, W, H) => { g.fillStyle = '#5d7488'; g.fillRect(0, 0, W, H); g.fillStyle = '#7f95a8'; for (let y = 0; y < H; y += 32) for (let x = 0; x < W; x += 32) { g.fillStyle = R() < 0.5 ? '#6e8497' : '#556b7e'; g.fillRect(x + 2, y + 2, 28, 22); } g.fillStyle = '#2f3a44'; for (let y = 0; y < H; y += 32) g.fillRect(0, y + 24, W, 8); for (let x = 0; x < W; x += 32) g.fillRect(x, 0, 3, H); }), roughness: 0.45, metalness: 0.3 }); glassTower.name = 'glassTower'; glassTower.userData.uv = 1 / 8;
  const stoneTower = new THREE.MeshStandardMaterial({ map: facadeTex('#8a7d6b', '#3a4650', 2, 2), roughness: 0.9 }); stoneTower.name = 'stoneTower'; stoneTower.userData.uv = 1 / 8;
  const taxiYellow = new THREE.MeshStandardMaterial({ color: 0xf0b323, roughness: 0.35, metalness: 0.2 }); taxiYellow.name = 'taxi';
  const carPaint = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.3, metalness: 0.4 }); carPaint.name = 'carPaint';
  const carPaint2 = new THREE.MeshStandardMaterial({ color: 0x8b1d1d, roughness: 0.3, metalness: 0.4 }); carPaint2.name = 'carPaint2';
  const hydrantRed = new THREE.MeshStandardMaterial({ color: 0xb8251c, roughness: 0.5 }); hydrantRed.name = 'hydrant';
  const granite = M.marbleDark; const steel = M.steelGreen; const dark = M.ironDark;

  // ---- sky dome (only visible outside) -------------------------------------------------------------------------------------------------
  {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uSun: { value: SUN_DIR.clone() } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w * 0.9999; }',
      fragmentShader: 'varying vec3 vD; uniform vec3 uSun; void main(){ float h = clamp(vD.y, -0.05, 1.0); vec3 zen = vec3(0.30,0.48,0.78); vec3 hor = vec3(0.86,0.84,0.78); vec3 c = mix(hor, zen, pow(h, 0.55)); float s = max(dot(vD, uSun), 0.0); c += vec3(1.0,0.9,0.7) * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.25); gl_FragColor = vec4(c, 1.0); }' }));
    sky.position.set(0, 20, 60); sky.name = 'sky'; sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
  }

  // ---- street slab (collider: it sits over the subway) ----------------------------------------------------------------------------------
  B.box(road, [ST.x0, -0.8, ST.curbN], [ST.x1, 0, ST.curbS], { uvScale: uv(road) });
  B.box(sidewalk, [ST.x0, -0.8, ST.z0 - 0.5], [ST.x1, 0.15, ST.curbN], { uvScale: uv(sidewalk) });
  B.box(sidewalk, [ST.x0, -0.8, ST.curbS], [ST.x1, 0.15, ST.z1 + 0.5], { uvScale: uv(sidewalk) });
  world.box([ST.x0, -0.8, ST.z0 - 0.5], [ST.x1, 0, ST.z1 + 0.5]); world.box([ST.x0, 0, ST.z0 - 0.5], [ST.x1, 0.15, ST.curbN]); world.box([ST.x0, 0, ST.curbS], [ST.x1, 0.15, ST.z1 + 0.5]);
  world.walkable([ST.x0, -0.8, ST.z0 - 0.5], [ST.x1, 0, ST.z1 + 0.5]);
  B.box(M.concrete, [ST.x0, 0, ST.curbN - 0.12], [ST.x1, 0.15, ST.curbN], { uvScale: 1 }); B.box(M.concrete, [ST.x0, 0, ST.curbS], [ST.x1, 0.15, ST.curbS + 0.12], { uvScale: 1 });
  // crosswalk in front of the entrance + storm drains
  for (let x = -10; x <= 10; x += 2) B.box(M.plaster, [x - 0.5, 0.005, ST.curbN + 0.2], [x + 0.5, 0.012, ST.curbS - 0.2], { uvScale: 1 });
  for (const gx of [-40, -20, 22, 44]) B.box(dark, [gx - 0.6, 0.0, ST.curbN - 0.5], [gx + 0.6, 0.02, ST.curbN + 0.4], { uvScale: 1 });

  // ---- terminal street facade: attic, clock group, flank wings, corridor-strip shell, concourse shell, tower north --------------------------
  {
    const z1 = VH.z1 + T; // facade plane at z=51
    // pilasters (paired) and entablature on the facade
    for (const px of [-22, -19.5, -6.5, -4, 4, 6.5, 19.5, 22]) { B.box(M.stone, [px - 0.7, 0, z1], [px + 0.7, 15.6, z1 + 1.2], { uvScale: uv(M.stone) }); B.box(M.marble, [px - 0.9, 13.6, z1], [px + 0.9, 15.6, z1 + 1.4], { uvScale: uv(M.marble) }); B.box(M.marbleDark, [px - 0.85, 0, z1], [px + 0.85, 1.6, z1 + 1.3], { uvScale: uv(M.marbleDark) }); world.box([px - 0.7, 0, z1], [px + 0.7, 15.6, z1 + 1.2]); }
    B.box(M.marble, [VH.x0 - T - 1, 15.6, VH.z0 - 4], [VH.x1 + T + 1, 18.0, z1 + 1.6], { uvScale: uv(M.marble) });          // entablature
    B.box(M.stone, [VH.x0 - T, 18.0, VH.z0 - 4], [VH.x1 + T, 24.5, z1 + 0.4], { uvScale: uv(M.stone) });                        // attic
    B.box(M.marble, [VH.x0 - T - 0.5, 24.5, VH.z0 - 4], [VH.x1 + T + 0.5, 25.5, z1 + 0.9], { uvScale: uv(M.marble) });
    // clock group: stepped pediment block with a big clock (fictional sculpture group massed as blocks)
    B.box(M.stone, [-9, 25.5, VH.z0 + 2], [9, 30.5, z1 + 0.2], { uvScale: uv(M.stone) }); B.box(M.stone, [-6, 30.5, VH.z0 + 4], [6, 34.5, z1 - 0.6], { uvScale: uv(M.stone) });
    B.box(M.stone, [-14, 25.5, VH.z0 + 3], [-9, 29, z1 - 0.3], { uvScale: uv(M.stone) }); B.box(M.stone, [9, 25.5, VH.z0 + 3], [14, 29, z1 - 0.3], { uvScale: uv(M.stone) });
    B.add(M.brass, new THREE.CylinderGeometry(2.3, 2.3, 0.3, 32), mat4(0, 28.2, z1 + 0.3, Math.PI / 2)); B.add(M.clockFace, new THREE.CylinderGeometry(2.0, 2.0, 0.34, 32), mat4(0, 28.2, z1 + 0.3, Math.PI / 2));
    B.add(dark, new THREE.BoxGeometry(0.16, 1.5, 0.05), mat4(0, 28.9, z1 + 0.5)); B.add(dark, new THREE.BoxGeometry(1.1, 0.16, 0.05), mat4(0.5, 28.2, z1 + 0.5));
    B.add(M.brass, new THREE.SphereGeometry(1.2, 16, 12), mat4(0, 35.5, VH.z0 + 6)); // gilded orb finial
    // flank wings (|x| 32..56, z 30..51) and the corridor-strip shell (z 19.5..30, |x| 43..55); concourse shell above; roof slabs
    for (const s of [-1, 1]) {
      const wx0 = Math.min(s * 32, s * 56), wx1 = Math.max(s * 32, s * 56);
      B.box(M.stone, [wx0, 0, VH.z0], [wx1, 22, z1], { uvScale: uv(M.stone) }); world.box([wx0, -1, VH.z0], [wx1, 22, z1]);
      B.box(M.marble, [wx0, 15.6, VH.z0], [wx1, 17.0, z1 + 0.8], { uvScale: uv(M.marble) });
      for (const wz of [8, 12.5]) for (let x = wx0 + 3; x < wx1 - 2; x += 4) B.box(M.glassDim, [x - 1, wz - 1.4, z1 - 0.01], [x + 1, wz + 1.4, z1 + 0.05], { uvScale: uv(M.glassDim) });
      B.box(M.stone, [Math.min(s * 43, s * 56), 4.8, P.RZ0 - 1], [Math.max(s * 43, s * 56), 22, VH.z0 + 0.01], { uvScale: uv(M.stone) });
    }
    B.box(M.stone, [P.X0 - T - 0.2, 0, P.Z0 - T - 0.2], [P.X1 + T + 0.2, 40, P.Z1 + T + 0.2], { uvScale: uv(M.stone) });   // concourse exterior shell (inner faces culled)
    B.box(M.plasterDark, [P.X0 - 2, 40, P.Z0 - 2], [P.X1 + 2, 41, P.Z1 + 2], { uvScale: 0.5 });
    B.box(M.stone, [-56, 22, P.RZ0 - 1], [56, 23, z1], { uvScale: uv(M.stone) });                                              // wing roofs
    // tower directly north/above (dark grid)
    B.box(glassTower, [-40, 0, -110], [40, 210, -30], { uvScale: uv(glassTower) }); B.box(dark, [-42, 60, -112], [42, 62, -28], { uvScale: 1 }); B.box(dark, [-30, 210, -100], [30, 214, -40], { uvScale: 1 });
  }

  // ---- viaduct: E–W deck in front of the facade + N–S approach over the road, granite piers, steel girders, balustrades -----------------------
  {
    const y = ST.viaductY, zA = 51.6, zB = 58.8;
    B.box(M.concrete, [ST.x0, y, zA], [ST.x1, y + 1.2, zB], { uvScale: 0.5 });
    B.box(road, [ST.x0, y + 1.2, zA + 0.6], [ST.x1, y + 1.25, zB - 0.6], { uvScale: uv(road) });
    for (const ez of [zA, zB - 0.5]) { B.box(granite, [ST.x0, y + 1.2, ez], [ST.x1, y + 2.3, ez + 0.5], { uvScale: uv(granite) }); }
    for (let x = ST.x0 + 6; x < ST.x1; x += 12) for (const pz of [zA + 0.9, zB - 2.3]) { if (Math.abs(x) < 3) continue; B.box(granite, [x - 1, 0, pz], [x + 1, y, pz + 2], { uvScale: uv(granite) }); world.box([x - 1, 0, pz], [x + 1, y, pz + 2]); B.box(M.marble, [x - 1.2, y - 0.8, pz - 0.2], [x + 1.2, y, pz + 2.2], { uvScale: uv(M.marble) }); }
    for (const gz of [zA + 1.2, (zA + zB) / 2, zB - 1.2]) B.box(steel, [ST.x0, y - 0.9, gz - 0.25], [ST.x1, y, gz + 0.25], { uvScale: 1 });
    for (let x = ST.x0; x <= ST.x1; x += 6) B.box(steel, [x - 0.15, y - 0.9, zA], [x + 0.15, y, zB], { uvScale: 1 });
    // N–S approach: rises from the far facade (portal) to the deck; a single steel arch over the road
    B.box(M.concrete, [-8, y, zB], [8, y + 1.2, ST.z1 + 4], { uvScale: 0.5 }); B.box(road, [-7.4, y + 1.2, zB], [7.4, y + 1.25, ST.z1 + 4], { uvScale: uv(road) });
    for (const s of [-1, 1]) B.box(granite, [Math.min(s * 8, s * 7.4), y + 1.2, zB], [Math.max(s * 8, s * 7.4), y + 2.3, ST.z1 + 4], { uvScale: uv(granite) });
    const arc = new THREE.TorusGeometry(8.5, 0.35, 8, 32, Math.PI); for (const ax of [-8.2, 8.2]) B.add(steel, arc, mat4(ax, y - 7.6, (zB + ST.z1) / 2 + 1.5, 0, Math.PI / 2, 0));
    for (const s of [-1, 1]) { B.box(granite, [s * 8.2 - 1, 0, ST.z1 - 4], [s * 8.2 + 1, y, ST.z1 - 2], { uvScale: uv(granite) }); world.box([s * 8.2 - 1, 0, ST.z1 - 4], [s * 8.2 + 1, y, ST.z1 - 2]); }
    // lamps on the viaduct balustrade
    for (let x = ST.x0 + 12; x < ST.x1; x += 24) { B.add(dark, new THREE.CylinderGeometry(0.06, 0.09, 3.2, 8), mat4(x, y + 3.8, zB - 0.25)); B.add(M.lampGlass, new THREE.SphereGeometry(0.25, 10, 8), mat4(x, y + 5.5, zB - 0.25)); }
    // vehicles on the deck
    taxi(B, taxiYellow, dark, -30, y + 1.25, 55, 0); taxi(B, taxiYellow, dark, 22, y + 1.25, 54, 0.05); car(B, carPaint, dark, 45, y + 1.25, 56, Math.PI); car(B, carPaint2, dark, -12, y + 1.25, 56.5, Math.PI);
  }

  // ---- far side of the street: building row with shopfronts, awnings, a subway kiosk; side seals; skyline -----------------------------------
  {
    const z0 = ST.facadeZ;
    const blocks = [[-62, -36, 22, bldgA], [-36, -12, 30, bldgC], [-12, 14, 18, bldgB], [14, 40, 34, bldgC], [40, 62, 26, bldgA]];
    for (const [x0, x1, h, mat] of blocks) { B.box(mat, [x0, 0, z0], [x1, h, z0 + 14], { uvScale: uv(mat) }); world.box([x0, -1, z0], [x1, h, z0 + 14]); B.box(dark, [x0, h, z0 - 0.2], [x1, h + 0.8, z0 + 14], { uvScale: 1 }); B.box(M.marbleDark, [x0, 0, z0 - 0.3], [x1, 4.5, z0], { uvScale: 1 }); }
    // ground-floor shopfronts: glass + awnings + signs
    const awn = [0x8b1d1d, 0x1d4b8b, 0x1f6b3a, 0x8b6a1d].map(c => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }); m.name = 'awning'; return m; });
    let k = 0; const names = ['DELI  ·  GROCERY', 'PHARMACY', 'DINER', 'BOOKS & NEWS', 'COFFEE', 'SHOE REPAIR', 'BANK', 'FLOWERS'];
    const shopTex = [0, 1, 2].map((v) => shopInteriorTexture(world.R, v)); for (let x = -58; x < 60; x += 9) { if (Math.abs(x) < 10) continue; { const inside = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 3.2), new THREE.MeshBasicMaterial({ map: shopTex[k % 3], color: 0xd9ccb4, fog: true })); inside.position.set(x, 2.0, z0 - 0.305); inside.rotation.y = Math.PI; world.scene.add(inside); const pane = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 3.2), shopGlass()); pane.position.set(x, 2.0, z0 - 0.37); pane.rotation.y = Math.PI; world.scene.add(pane); B.box(dark, [x - 3.5, 0.3, z0 - 0.4], [x + 3.5, 0.42, z0 - 0.3], { uvScale: 1 }); for (const fx of [x - 3.45, x + 3.45, x - 1.1]) B.box(dark, [fx - 0.06, 0.4, z0 - 0.42], [fx + 0.06, 3.6, z0 - 0.3], { uvScale: 1 }); } const aw = awn[k % 4]; B.add(aw, new THREE.BoxGeometry(7, 0.12, 1.8), mat4(x, 3.7, z0 - 1.2, 0.35)); B.add(M.atlas, M.signGeo(names[k % names.length], { bg: '#1a1a1a', fg: '#f2e6c8', font: 'bold 60px Georgia, serif' }, 6, 0.6), mat4(x, 4.05, z0 - 0.36, 0, Math.PI, 0)); k++; }
    // viaduct portal in the far facade
    B.box(M.asphalt, [-8, ST.viaductY + 1.2, z0 - 0.4], [8, ST.viaductY + 7, z0 + 6], { uvScale: 1 }); B.box(granite, [-9.5, ST.viaductY + 7, z0 - 0.6], [9.5, ST.viaductY + 8.2, z0 + 0.2], { uvScale: uv(granite) });
    // side seals: cross-street building faces + road-end walls at |x| = 62
    for (const s of [-1, 1]) { const x0 = Math.min(s * 62, s * 70), x1 = Math.max(s * 62, s * 70); B.box(bldgB, [x0, 0, ST.z0 - 6], [x1, 18, z0 + 14], { uvScale: uv(bldgB) }); world.box([x0, -1, ST.z0 - 8], [x1, 44, z0 + 16]); B.box(dark, [x0, 18, ST.z0 - 6], [x1, 19, z0 + 14], { uvScale: 1 }); }
    // skyline (hazy): generic towers behind the far row, one stepped spire tower to the east, one slab to the west
    const towers = [[-110, 130, 24, 70, glassTower], [-80, 150, 30, 120, stoneTower], [-40, 175, 28, 90, glassTower], [-10, 140, 34, 160, glassTower], [30, 165, 26, 110, stoneTower], [70, 130, 30, 80, glassTower], [100, 160, 40, 140, stoneTower], [130, 120, 26, 60, glassTower], [-140, 100, 40, 50, stoneTower], [150, 200, 40, 100, glassTower]];
    for (const [x, z, w, h, mat] of towers) { B.box(mat, [x - w / 2, 0, z - w / 2], [x + w / 2, h, z + w / 2], { uvScale: uv(mat) }); B.box(dark, [x - w / 2 - 0.5, h, z - w / 2 - 0.5], [x + w / 2 + 0.5, h + 1.2, z + w / 2 + 0.5], { uvScale: 1 }); }
    { const x = 55, z = 135; for (const [w, h0, h1] of [[34, 0, 120], [26, 120, 150], [18, 150, 172], [11, 172, 186], [6, 186, 196]]) B.box(stoneTower, [x - w / 2, h0, z - w / 2], [x + w / 2, h1, z + w / 2], { uvScale: uv(stoneTower) }); B.add(M.stainless, new THREE.ConeGeometry(2.5, 26, 8), mat4(x, 209, z)); }
    // haze wall behind the towers (very soft, sits inside the fog band)
  }

  // ---- street furniture: lamps, hydrants, bollards, benches, newsstand, subway kiosk, taxis and parked cars ------------------------------------
  {
    const lamp = (x, z) => { B.add(dark, new THREE.CylinderGeometry(0.08, 0.14, 7.5, 8), mat4(x, 3.75, z)); B.add(dark, new THREE.BoxGeometry(2.6, 0.08, 0.08), mat4(x, 7.4, z)); for (const dx of [-1.2, 1.2]) B.add(M.lampGlass, new THREE.SphereGeometry(0.22, 10, 8), mat4(x + dx, 7.2, z)); world.box([x - 0.15, 0, z - 0.15], [x + 0.15, 7.5, z + 0.15]); };
    for (const x of [-48, -24, 24, 48]) lamp(x, ST.curbN - 0.6); for (const x of [-36, 0, 36]) lamp(x, ST.curbS + 0.6);
    const hyd = lathe([[0.14, 0], [0.16, 0.12], [0.11, 0.2], [0.13, 0.55], [0.17, 0.62], [0.13, 0.7], [0.1, 0.85], [0, 0.9]], 10);
    for (const [x, z] of [[-42, ST.curbN - 1.0], [16, ST.curbN - 1.0], [-20, ST.curbS + 1.0], [40, ST.curbS + 1.0]]) { B.add(hydrantRed, hyd, mat4(x, 0.15, z)); world.box([x - 0.2, 0, z - 0.2], [x + 0.2, 1.05, z + 0.2]); world.cover(x + 0.7, z, 1, 0); }
    for (let x = -30; x <= 30; x += 6) { if (Math.abs(x) < 8) continue; B.add(dark, new THREE.CylinderGeometry(0.16, 0.18, 0.9, 10), mat4(x, 0.6, ST.curbN - 0.35)); world.box([x - 0.18, 0, ST.curbN - 0.53], [x + 0.18, 1.05, ST.curbN - 0.17]); }
    // newsstand (near sidewalk east) + subway entrance kiosk (far sidewalk west): green railings around a stair that ends in a closed gate
    B.box(M.shutter, [30, 0.15, ST.z0 + 0.6], [34.5, 2.8, ST.z0 + 3.2], { uvScale: 1, collide: true }); B.add(M.atlas, M.signGeo('NEWS  ·  MAGAZINES  ·  LOTTO', { bg: '#1a1410', fg: '#e8c56a', font: 'bold 56px Georgia, serif' }, 4.2, 0.45), mat4(32.25, 2.5, ST.z0 + 3.22));
    world.cover(35.2, ST.z0 + 1.9, 1, 0); world.cover(29.3, ST.z0 + 1.9, -1, 0);
    { const kx = -30, kz = ST.curbS + 3.2; B.box(M.asphalt, [kx - 1.6, 0.16, kz - 2.5], [kx + 1.6, 0.17, kz + 2.5], { uvScale: 1 }); for (const s of [-1, 1]) { B.box(M.steelGreen, [kx + s * 1.7 - 0.06, 0.15, kz - 2.6], [kx + s * 1.7 + 0.06, 1.2, kz + 2.6], { uvScale: 1 }); for (let z = kz - 2.4; z <= kz + 2.4; z += 0.3) B.add(M.steelGreen, new THREE.CylinderGeometry(0.02, 0.02, 1.0, 5), mat4(kx + s * 1.7, 0.65, z)); } B.box(M.steelGreen, [kx - 1.7, 0.15, kz + 2.5], [kx + 1.7, 1.2, kz + 2.6], { uvScale: 1 }); world.box([kx - 1.8, 0, kz - 2.6], [kx + 1.8, 1.2, kz + 2.7]); B.add(M.steelGreen, new THREE.CylinderGeometry(0.06, 0.07, 3.2, 8), mat4(kx - 1.7, 1.75, kz - 2.6)); B.add(M.lampGlass, new THREE.SphereGeometry(0.24, 12, 8), mat4(kx - 1.7, 3.5, kz - 2.6)); B.add(M.atlas, M.signGeo('SUBWAY  ·  1 · 2 · 3 · 4', { bg: '#0d3b1f', fg: '#ffffff', font: 'bold 64px Helvetica, Arial' }, 3.4, 0.45), mat4(kx, 3.6, kz - 2.6, 0, Math.PI, 0)); B.box(M.brassDark, [kx - 1.75, 3.35, kz - 2.66], [kx + 1.75, 3.85, kz - 2.56], { uvScale: 1 }); world.termLamps.push([kx - 1.7, 3.5, kz - 2.6]); }
    // parked / stopped vehicles on the road (cover)
    const cars = [[-50, ST.curbN + 1.6, 0, 'taxi'], [-38, ST.curbN + 1.6, 0.03, 'car'], [-14, ST.curbN + 1.7, -0.02, 'taxi'], [8, ST.curbS - 1.7, Math.PI, 'taxi'], [26, ST.curbS - 1.6, Math.PI + 0.04, 'car2'], [46, ST.curbS - 1.6, Math.PI, 'taxi'], [-30, 63, 0.02, 'taxi'], [36, 63, Math.PI, 'car']];
    placeCars(world, cars.map(([x, z, yaw, kind]) => ({ x, z, ry: yaw, kind: kind === 'taxi' ? 'cab' : kind === 'car' ? 'sedan' : 'suv' })));
    for (const [x, z, yaw, kind] of cars) { world.box([x - 2.4, 0, z - 1.05], [x + 2.4, 1.5, z + 1.05]); world.cover(x, z + 1.7, 0, 1); world.cover(x, z - 1.7, 0, -1); }
    // traffic light on the near corner + bus stop shelter (far side)
    B.add(dark, new THREE.CylinderGeometry(0.1, 0.12, 6, 8), mat4(-56, 3.15, ST.curbN - 0.6)); B.add(dark, new THREE.BoxGeometry(6, 0.14, 0.14), mat4(-53, 6.1, ST.curbN - 0.6)); B.add(dark, new THREE.BoxGeometry(0.4, 1.1, 0.4), mat4(-50.5, 5.4, ST.curbN - 0.6)); B.add(hydrantRed, new THREE.SphereGeometry(0.12, 8, 6), mat4(-50.5, 5.75, ST.curbN - 0.85)); world.box([-56.15, 0, ST.curbN - 0.75], [-55.85, 6, ST.curbN - 0.45]);
    B.box(M.darkGlass, [10, 0.15, ST.curbS + 0.9], [16, 0.16, ST.curbS + 2.4], { uvScale: 1 }); for (const px of [10.2, 15.8]) B.add(dark, new THREE.BoxGeometry(0.1, 2.6, 0.1), mat4(px, 1.45, ST.curbS + 2.35)); B.box(M.darkGlass, [10, 2.7, ST.curbS + 0.8], [16, 2.85, ST.curbS + 2.5], { uvScale: 1 }); B.box(M.darkGlass, [10.1, 0.15, ST.curbS + 2.3], [15.9, 2.7, ST.curbS + 2.4], { uvScale: 1 }); world.box([10, 0, ST.curbS + 2.25], [16, 2.7, ST.curbS + 2.45]); B.box(M.wood, [10.5, 0.55, ST.curbS + 1.7], [15.5, 0.62, ST.curbS + 2.2], { uvScale: 1, collide: true });
  }
  // motorcycles: street spots (vehicles module reads these)
  world.W.vehicleSpots = [{ x: -44, z: 58, yaw: Math.PI / 2 }, { x: 52, z: 68, yaw: -Math.PI / 2 }, { x: 0, z: 66, yaw: 0 }];

  B.flush((m) => (m === dark || m === steel || m === M.stainless || m === M.brass || m === M.brassDark || m === taxiYellow || m === carPaint || m === carPaint2 || m === hydrantRed || m === M.shutter ? 'metal' : m === M.wood ? 'wood' : 'concrete'), { name: 'exterior' });
}

let CM = null; // shared car materials
function carMats() { if (CM) return CM; CM = { glass: new THREE.MeshStandardMaterial({ color: 0x1a232b, roughness: 0.1, metalness: 0.6 }), sign: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.9, 1.2) }), head: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 2.4, 2.2) }), tail: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 0.3, 0.2) }) }; for (const k in CM) CM[k].name = 'car_' + k; return CM; }
function taxi(B, paint, dark, x, y, z, yaw) {
  const C = carMats();
  const m = mat4(x, y, z, 0, yaw);
  const add = (geo, mat, dx, dy, dz) => { geo.translate(dx, dy, dz); geo.applyMatrix4(m); B.add(mat, geo, null, { uvScale: 1 }); };
  add(new THREE.BoxGeometry(4.6, 0.55, 1.9), paint, 0, 0.62, 0); add(new THREE.BoxGeometry(2.6, 0.6, 1.75), paint, -0.2, 1.2, 0);
  add(new THREE.BoxGeometry(2.5, 0.42, 1.65), C.glass, -0.2, 1.22, 0);
  add(new THREE.BoxGeometry(0.9, 0.22, 0.45), dark, -0.2, 1.62, 0); add(new THREE.BoxGeometry(0.85, 0.18, 0.4), C.sign, -0.2, 1.63, 0);
  for (const dx of [-1.55, 1.55]) for (const dz of [-0.85, 0.85]) { const w = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14); w.rotateX(Math.PI / 2); add(w, dark, dx, 0.34, dz); }
  for (const dz of [-0.6, 0.6]) { add(new THREE.BoxGeometry(0.06, 0.16, 0.3), C.head, 2.3, 0.65, dz); add(new THREE.BoxGeometry(0.06, 0.16, 0.3), C.tail, -2.3, 0.65, dz); }
  add(new THREE.BoxGeometry(4.7, 0.12, 2.0), dark, 0, 0.33, 0);
}
function car(B, paint, dark, x, y, z, yaw) {
  const C = carMats(); const m = mat4(x, y, z, 0, yaw);
  const add = (geo, mat, dx, dy, dz) => { geo.translate(dx, dy, dz); geo.applyMatrix4(m); B.add(mat, geo, null, { uvScale: 1 }); };
  add(new THREE.BoxGeometry(4.5, 0.5, 1.85), paint, 0, 0.6, 0); add(new THREE.BoxGeometry(2.4, 0.55, 1.7), paint, -0.1, 1.12, 0);
  add(new THREE.BoxGeometry(2.3, 0.4, 1.6), C.glass, -0.1, 1.14, 0);
  for (const dx of [-1.5, 1.5]) for (const dz of [-0.82, 0.82]) { const w = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 14); w.rotateX(Math.PI / 2); add(w, dark, dx, 0.33, dz); }
  add(new THREE.BoxGeometry(4.6, 0.12, 1.95), dark, 0, 0.32, 0);
}

// Lit shop interior seen through the glass: warm ceiling light, shelving with product colour, counter, a couple of people.
function shopInteriorTexture(R, v) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, v === 1 ? '#e8ecef' : '#f3dfb8'); gr.addColorStop(0.35, v === 1 ? '#aeb4b8' : '#b89868'); gr.addColorStop(1, '#3a3026'); g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,250,235,0.9)'; g.fillRect(30 + i * 85, 6, 50, 5); }                                     // ceiling fixtures
  for (let row = 0; row < 3; row++) { const y = 70 + row * 42; g.fillStyle = '#4a3a2a'; g.fillRect(0, y + 30, 512, 5); for (let x = 0; x < 512; x += 6 + R() * 8) { g.fillStyle = `hsl(${R() * 360},${30 + R() * 40}%,${35 + R() * 30}%)`; g.fillRect(x, y + 30 - (10 + R() * 18), 4 + R() * 5, 30); } }
  g.fillStyle = '#2a2018'; g.fillRect(v === 2 ? 40 : 300, 180, 180, 76); g.fillStyle = '#5a4630'; g.fillRect(v === 2 ? 40 : 300, 176, 180, 6);        // counter
  for (let i = 0; i < 2 + v; i++) { const x = 60 + R() * 400; g.fillStyle = 'rgba(25,20,16,0.85)'; g.beginPath(); g.ellipse(x, 150, 11, 13, 0, 0, 7); g.fill(); g.fillRect(x - 17, 163, 34, 93); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
let SHOPGLASS = null;
function shopGlass() { return SHOPGLASS || (SHOPGLASS = new THREE.MeshPhysicalMaterial({ color: 0x2a3036, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.32, envMapIntensity: 1.8, depthWrite: false, name: 'shopGlass' })); }
