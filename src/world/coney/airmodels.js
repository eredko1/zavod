// CONEY — the models for coney/airsupport.js, both facing -z like the cars, built once per spawn from cached textures.
// The NYPD chopper: a Bell 429-style lofted fuselage (superellipse sections nose → tail boom) wearing a painted livery texture
// (white over navy, the light-blue cheat line, glossy dark glass for the windscreen / cabin windows, door seams, NYPD / POLICE,
// the tail number) with a matching roughness map, engine cowl and exhausts, a 4-blade main rotor with tip stripes and a blur
// disc, the canted fin and stabilizer with end plates, a 4-blade tail rotor, bent skid tubes and cross tubes, FLIR ball,
// Nightsun searchlight, antennas, nav lights + a beacon, and stub wings carrying M134 six-barrel miniguns.
// The tank: an M1A2-style hull (side profile extruded: lower glacis, shallow upper glacis, deck, rear plate), fenders and
// skirt panels, track belts as ribbons round sprocket / idler / road wheels with a link texture that scrolls, instanced road
// wheels that turn; the angular wedge turret (top-view polygon extruded) with bustle rack and stowage, commander's cupola +
// M2, loader's hatch + M240, sights, smoke launchers, whip antennas; a lathe-turned gun with fume extractor and muzzle sensor.
// Tan CARC with panel lines and dust. Phones get half-size textures and no shadows. CONEY agent.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TEX = {};
function canvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }
function tex(c, srgb = true, rep = null) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.flipY = false; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); } return t; }
const bucket = () => { const G = new Map(); const put = (m, g) => { const n = g.index ? g.toNonIndexed() : g; if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2)); (G.get(m) || G.set(m, []).get(m)).push(n); return g; };
  const build = (parent, shadows) => { for (const [m, list] of G) { const mesh = new THREE.Mesh(mergeGeometries(list.map((g) => { const k = g.clone(); for (const a of Object.keys(k.attributes)) if (!['position', 'normal', 'uv'].includes(a)) k.deleteAttribute(a); return k; }), false), m); mesh.castShadow = shadows; mesh.receiveShadow = true; parent.add(mesh); } }; return { put, build }; };
const at = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; };
const tube = (pts, r, seg = 24) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, r, 8, false);

// ---- the chopper ------------------------------------------------------------------------------------------------------------
// fuselage sections: z, half width, half height, centre y; the bottom is flatter than the top
const FUS = [[-2.78, 0.04, 0.04, 1.22], [-2.62, 0.4, 0.34, 1.24], [-2.35, 0.68, 0.6, 1.33], [-1.85, 0.87, 0.8, 1.48], [-1.2, 0.97, 0.9, 1.58], [-0.3, 1.0, 0.94, 1.62], [0.6, 0.98, 0.94, 1.64],
  [1.35, 0.86, 0.86, 1.72], [1.95, 0.56, 0.58, 1.9], [2.4, 0.32, 0.36, 2.0], [4.2, 0.23, 0.26, 2.06], [6.55, 0.15, 0.18, 2.14], [6.9, 0.05, 0.06, 2.15]];
const Z0 = FUS[0][0], Z1 = FUS[FUS.length - 1][0], LEN = Z1 - Z0;
function loft(secs, ring = 28, nTop = 2.3, nBot = 3.6) {
  const pos = [], uv = [], idx = [];
  secs.forEach(([z, w, h, cy], i) => { for (let k = 0; k <= ring; k++) { const th = k / ring * Math.PI * 2, s = Math.sin(th), c = Math.cos(th), n = c > 0 ? nBot : nTop;   // th 0 = the belly, π/2 = right side, π = the roof
      pos.push(w * Math.sign(s) * Math.abs(s) ** (2 / n), cy - h * Math.sign(c) * Math.abs(c) ** (2 / n), z); uv.push((z - Z0) / LEN, k / ring); }
    if (i) for (let k = 0; k < ring; k++) { const a = (i - 1) * (ring + 1) + k, b = a + ring + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); } });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
/** the livery, in fuselage UV space: x = along the body (nose → tail), y = round it (0 belly, .25 right, .5 roof, .75 left) */
function livery(W, H) {
  const X = (z) => (z - Z0) / LEN * W, Y = (u) => u * H;
  const col = canvas(W, H, (g) => {
    g.fillStyle = '#f3f4f6'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#132a63'; g.fillRect(0, 0, W, Y(0.15)); g.fillRect(0, Y(0.85), W, Y(0.15));   // navy belly
    g.fillStyle = '#4f86d9'; g.fillRect(0, Y(0.15), W, Y(0.022)); g.fillRect(0, Y(0.828), W, Y(0.022));   // the cheat line
    g.fillStyle = '#132a63'; g.fillRect(X(1.95), Y(0.15), X(6.9) - X(1.95), Y(0.06)); g.fillRect(X(1.95), Y(0.79), X(6.9) - X(1.95), Y(0.06));
    const glass = (z0, z1, u0, u1, r) => { g.fillStyle = '#0b1420'; g.beginPath(); g.roundRect(X(z0), Y(u0), X(z1) - X(z0), Y(u1) - Y(u0), r); g.fill(); g.fillStyle = 'rgba(160,190,230,0.18)'; g.fillRect(X(z0) + 4, Y(u0) + 3, (X(z1) - X(z0)) * 0.5, (Y(u1) - Y(u0)) * 0.22); };
    glass(-2.62, -1.25, 0.33, 0.67, 18);                                                                    // the wrap-round windscreen
    for (const [u0, u1] of [[0.25, 0.36], [0.64, 0.75]]) { glass(-1.15, -0.25, u0, u1, 10); glass(-0.12, 0.85, u0, u1, 10); }   // cockpit door + cabin sliding door windows
    glass(-2.45, -1.95, 0.19, 0.25, 8); glass(-2.45, -1.95, 0.75, 0.81, 8);                                  // chin windows
    g.strokeStyle = 'rgba(40,46,60,0.55)'; g.lineWidth = 2;                                                   // door seams
    for (const [u0, u1] of [[0.17, 0.38], [0.62, 0.83]]) { g.strokeRect(X(-1.22), Y(u0), X(-0.2) - X(-1.22), Y(u1) - Y(u0)); g.strokeRect(X(-0.18), Y(u0), X(0.95) - X(-0.18), Y(u1) - Y(u0)); }
    for (let z = -2.4; z < 6.6; z += 0.55) { g.strokeStyle = 'rgba(0,0,0,0.06)'; g.beginPath(); g.moveTo(X(z), 0); g.lineTo(X(z), H); g.stroke(); }   // skin panel lines
    // lettering: left side reads nose → tail as painted; the right side is mirrored in UV space, so it's drawn turned round
    const text = (t, z, u, size, color, sy, right) => { g.save(); g.translate(X(z), Y(u)); if (right) g.scale(-1, -1); g.scale(1, sy); g.font = `900 ${size}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(t, 0, 0); g.restore(); };
    for (const right of [false, true]) { const u = (d) => (right ? 0.25 - d : 0.75 + d);
      text('NYPD', 0.38, u(0.1), H * 0.075, '#132a63', 1.25, right); text('POLICE', 4.2, u(-0.035) + (right ? 0.01 : -0.01), H * 0.05, '#132a63', 2.6, right);
      text('N917PD', 5.6, u(0.07), H * 0.03, '#132a63', 2.2, right); text('AVIATION UNIT', 0.38, u(0.035), H * 0.028, '#4f86d9', 1.2, right); }
    const n = g.getImageData(0, 0, W, H), d = n.data; for (let i = 0; i < d.length; i += 4) { const k = (Math.random() - 0.5) * 6; d[i] += k; d[i + 1] += k; d[i + 2] += k; } g.putImageData(n, 0, 0);
  });
  const rough = canvas(W, H, (g) => { g.drawImage(col, 0, 0); const n = g.getImageData(0, 0, W, H), d = n.data; for (let i = 0; i < d.length; i += 4) { const glassy = d[i] < 30 && d[i + 2] < 45 ? 1 : 0; const v = glassy ? 18 : 95; d[i] = d[i + 1] = d[i + 2] = v; } g.putImageData(n, 0, 0); });
  return { map: tex(col), rough: tex(rough, false) };
}
function heliMats(lite) {
  if (TEX.heli) return TEX.heli; const L = livery(lite ? 1024 : 2048, lite ? 256 : 512), S = (c, r, m) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const body = lite ? new THREE.MeshStandardMaterial({ map: L.map, roughnessMap: L.rough, roughness: 1, metalness: 0.15 }) : new THREE.MeshPhysicalMaterial({ map: L.map, roughnessMap: L.rough, roughness: 1, metalness: 0.15, clearcoat: 0.7, clearcoatRoughness: 0.15 });
  return (TEX.heli = { body, white: S(0xeef0f2, 0.3, 0.2), navy: S(0x132a63, 0.35, 0.3), blade: S(0x2b2d31, 0.45, 0.4), tip: S(0xf2c230, 0.4, 0.2), metal: S(0x8a8f96, 0.35, 0.85), dark: S(0x1c1e21, 0.55, 0.6), gun: S(0x2a2b2d, 0.35, 0.9),
    lens: new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.05, metalness: 0.9, emissive: 0x335577, emissiveIntensity: 0.15 }), red: new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff2010, emissiveIntensity: 2 }),
    green: new THREE.MeshStandardMaterial({ color: 0x20ff60, emissive: 0x10ff50, emissiveIntensity: 2 }), blur: new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }) });
}
export function heliModel(lite) {
  const M = heliMats(lite), group = new THREE.Group(), B = bucket(), put = B.put;
  { const f = new THREE.Mesh(loft(FUS, lite ? 20 : 32), M.body); f.castShadow = !lite; f.receiveShadow = true; group.add(f); }
  put(M.white, at(loft([[-0.7, 0.02, 0.02, 2.55], [-0.55, 0.42, 0.3, 2.58], [0.2, 0.52, 0.36, 2.62], [1.3, 0.48, 0.34, 2.6], [1.75, 0.3, 0.22, 2.42], [1.9, 0.05, 0.05, 2.35]].map(([z, w, h, y]) => [z, w, h, y]), 16, 2.2, 6), 0, 0, 0));   // engine cowl
  for (const s of [-1, 1]) put(M.dark, tube([[s * 0.28, 2.65, 1.55], [s * 0.42, 2.72, 1.9], [s * 0.62, 2.85, 2.1]], 0.1, 8));   // exhausts
  put(M.metal, new THREE.CylinderGeometry(0.11, 0.14, 0.62, 12).translate(0, 3.12, 0)); put(M.dark, new THREE.CylinderGeometry(0.34, 0.3, 0.16, 16).translate(0, 3.0, 0));   // mast + swashplate
  // tail: canted fin, stabilizer + end plates, tail skid
  { const sh = new THREE.Shape([[0, 0], [0.9, 0], [1.25, 1.55], [0.75, 1.6], [0.25, 0.35]].map(([x, y]) => new THREE.Vector2(x, y))); const g = new THREE.ExtrudeGeometry(sh, { depth: 0.09, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 });
    g.rotateY(-Math.PI / 2); g.translate(0.045, 2.05, 6.15); put(M.navy, g); put(M.navy, new THREE.BoxGeometry(0.08, 0.6, 0.55).translate(0, 1.85, 6.45)); }
  put(M.white, new THREE.BoxGeometry(2.1, 0.06, 0.48).translate(0, 2.05, 5.55)); for (const s of [-1, 1]) put(M.navy, new THREE.BoxGeometry(0.05, 0.5, 0.5).translate(s * 1.05, 2.12, 5.58));
  put(M.dark, tube([[0, 1.85, 6.1], [0, 1.6, 6.45], [0, 1.62, 6.7]], 0.03, 6));
  // skids: bent tubes and two arched cross tubes, steps
  for (const s of [-1, 1]) { put(M.metal, tube([[s * 1.05, 0.06, 1.6], [s * 1.05, 0.05, -1.4], [s * 1.05, 0.12, -1.85], [s * 1.04, 0.32, -2.1]], 0.055, 20));
    put(M.dark, new THREE.BoxGeometry(0.06, 0.04, 0.5).translate(s * 1.05, 0.42, -0.5)); }
  for (const z of [-1.0, 0.95]) put(M.metal, tube([[-1.05, 0.08, z], [-0.95, 0.75, z], [0, 0.92, z], [0.95, 0.75, z], [1.05, 0.08, z]], 0.05, 16));
  // sensors, lights, antennas
  put(M.dark, new THREE.SphereGeometry(0.22, 14, 10).translate(0, 0.72, -2.15)); put(M.lens, new THREE.CircleGeometry(0.11, 12).translate(0, 0, 0.01).rotateY(Math.PI).translate(0, 0.72, -2.37));
  put(M.dark, new THREE.CylinderGeometry(0.17, 0.2, 0.55, 14).rotateX(Math.PI / 2).translate(0.62, 0.78, -1.65)); put(M.lens, new THREE.CircleGeometry(0.16, 14).rotateY(Math.PI).translate(0.62, 0.78, -1.93));   // Nightsun
  for (const [x, z, h] of [[0, 0.3, 0.5], [0.3, 1.1, 0.35], [-0.25, -1.5, 0.3]]) put(M.dark, new THREE.CylinderGeometry(0.012, 0.02, h, 5).translate(x, 2.55 + h / 2 + (z > 0 ? 0 : -0.2), z));
  put(M.red, new THREE.SphereGeometry(0.05, 8, 6).translate(-1.08, 2.1, 5.55)); put(M.green, new THREE.SphereGeometry(0.05, 8, 6).translate(1.08, 2.1, 5.55));
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), M.red.clone()); beacon.position.set(0, 2.66, 6.62); group.add(beacon);
  // stub wings + M134 miniguns (six barrels round a spindle, the motor housing, the ammo chute)
  for (const s of [-1, 1]) { put(M.navy, new THREE.BoxGeometry(0.75, 0.08, 0.5).translate(s * 1.3, 1.12, -0.25)); put(M.dark, new THREE.BoxGeometry(0.06, 0.32, 0.12).translate(s * 1.55, 0.98, -0.25));
    put(M.gun, new THREE.CylinderGeometry(0.11, 0.11, 0.55, 12).rotateX(Math.PI / 2).translate(s * 1.62, 0.84, -0.35));
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; put(M.gun, new THREE.CylinderGeometry(0.018, 0.018, 0.85, 6).rotateX(Math.PI / 2).translate(s * 1.62 + Math.cos(a) * 0.06, 0.84 + Math.sin(a) * 0.06, -1.0)); }
    put(M.gun, new THREE.CylinderGeometry(0.085, 0.085, 0.05, 12).rotateX(Math.PI / 2).translate(s * 1.62, 0.84, -1.3)); put(M.dark, tube([[s * 1.62, 0.84, -0.1], [s * 1.4, 0.7, 0.2], [s * 1.0, 0.8, 0.4]], 0.06, 8)); }
  B.build(group, !lite);
  // main rotor: four tapered blades with a little droop, yellow tips; a blur disc that takes over at speed
  const rotorG = new THREE.Group(); rotorG.position.set(0, 3.42, 0); group.add(rotorG);
  const bl = []; for (let k = 0; k < 4; k++) { const g = new THREE.BoxGeometry(5.1, 0.045, 0.32); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); if (x > 0) p.setZ(i, p.getZ(i) * 0.75); p.setY(i, p.getY(i) - x * 0.012); }
    g.translate(2.75, 0, 0); g.rotateY(k * Math.PI / 2); bl.push(g); }
  const blades = new THREE.Mesh(mergeGeometries(bl, false), M.blade); blades.castShadow = !lite; rotorG.add(blades);
  const tips = []; for (let k = 0; k < 4; k++) tips.push(new THREE.BoxGeometry(0.3, 0.05, 0.25).translate(5.15, -0.065, 0).rotateY(k * Math.PI / 2)); blades.add(new THREE.Mesh(mergeGeometries(tips, false), M.tip));
  rotorG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.2, 12), M.metal));
  const blur = new THREE.Mesh(new THREE.RingGeometry(0.4, 5.3, 40, 1).rotateX(-Math.PI / 2), M.blur.clone()); rotorG.add(blur);
  const tailG = new THREE.Group(); tailG.position.set(-0.16, 2.6, 6.55); group.add(tailG);
  tailG.add(new THREE.Mesh(mergeGeometries([0, 1, 2, 3].map((k) => new THREE.BoxGeometry(0.03, 0.62, 0.11).translate(0, 0.31, 0).rotateX(k * Math.PI / 2)), false), M.blade));
  let light = null; if (!lite) { light = new THREE.SpotLight(0xf4f7ff, 900, 120, 0.22, 0.5, 1.2); light.position.set(0.62, 0.78, -1.95); light.visible = false; group.add(light); group.add(light.target); }
  return { group, rotorG, tailG, blades, blur, light, beacon };
}

// ---- the tank ---------------------------------------------------------------------------------------------------------------
function tankMats(lite) {
  if (TEX.tank) return TEX.tank; const s = lite ? 512 : 1024;
  const carc = canvas(s, s, (g, w, h) => { g.fillStyle = '#b39a6c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { const v = Math.random(); g.fillStyle = `rgba(${v < 0.5 ? '90,70,40' : '220,205,170'},${0.03 + Math.random() * 0.05})`; const r = 2 + Math.random() * 14; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, r, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(60,48,30,0.35)'; g.lineWidth = 2; for (let x = 0; x < w; x += w / 6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += h / 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.fillStyle = 'rgba(40,32,20,0.5)'; for (let x = w / 12; x < w; x += w / 6) for (let y = h / 8; y < h; y += h / 4) { g.beginPath(); g.arc(x, y, 2.5, 0, 7); g.fill(); }   // bolts
    const gr = g.createLinearGradient(0, h, 0, h * 0.55); gr.addColorStop(0, 'rgba(110,90,60,0.45)'); gr.addColorStop(1, 'rgba(110,90,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });   // dust low down
  const track = canvas(256, 64, (g, w, h) => { g.fillStyle = '#26241f'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) { g.fillStyle = '#3d3a33'; g.fillRect(x + 2, 4, 26, h - 8); g.fillStyle = '#181713'; g.fillRect(x + 12, 0, 6, h); g.fillStyle = '#5a554b'; g.fillRect(x + 4, 8, 4, h - 16); g.fillRect(x + 22, 8, 4, h - 16); } });
  const wheel = canvas(128, 128, (g, w) => { g.fillStyle = '#1b1b19'; g.beginPath(); g.arc(64, 64, 63, 0, 7); g.fill(); g.fillStyle = '#9c865e'; g.beginPath(); g.arc(64, 64, 50, 0, 7); g.fill();
    g.fillStyle = '#7d6a4a'; for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; g.beginPath(); g.arc(64 + Math.cos(a) * 30, 64 + Math.sin(a) * 30, 9, 0, 7); g.fill(); } g.fillStyle = '#5c4e36'; g.beginPath(); g.arc(64, 64, 14, 0, 7); g.fill(); void w; });
  const S = (c, r, m) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m }), trackT = tex(track, true, [1, 1]);
  return (TEX.tank = { carc: new THREE.MeshStandardMaterial({ map: tex(carc, true, [1, 1]), roughness: 0.82, metalness: 0.12 }), tan: S(0xab9468, 0.8, 0.12), dark: S(0x2a2924, 0.7, 0.5), steel: S(0x55524a, 0.45, 0.7), black: S(0x111110, 0.6, 0.3),
    rubber: S(0x1a1a18, 0.95, 0.0), glass: new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.05, metalness: 0.9 }), track: new THREE.MeshStandardMaterial({ map: trackT, roughness: 0.75, metalness: 0.55 }), trackT,
    wheel: new THREE.MeshStandardMaterial({ map: tex(wheel), roughness: 0.7, metalness: 0.3 }), canvas: S(0x6b6044, 0.95, 0), lamp: new THREE.MeshStandardMaterial({ color: 0xdedcd0, emissive: 0x403c30, roughness: 0.2 }) });
}
const prism = (pts, depth, bevel = 0.04) => new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))), { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 4 });
/** a box-projected UV so the CARC texture lands evenly on any piece (about 1 tile per 2.5 m) */
function boxUV(g, k = 0.4) { g = g.index ? g.toNonIndexed() : g; g.computeVertexNormals(); const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)); const [u, v] = ax >= ay && ax >= az ? [p.getZ(i), p.getY(i)] : ay >= az ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)]; uv[i * 2] = u * k; uv[i * 2 + 1] = v * k; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g; }
const WHEEL_Z = [-2.55, -1.7, -0.85, 0, 0.85, 1.7, 2.55], WHEEL_R = 0.34, TRACK_X = 1.48, TRACK_W = 0.64;
/** the track's run (z, y in the side view): under the road wheels, up round the sprocket at the back, the top run on return rollers, down round the idler */
function trackPath() {
  const pts = [], arc = (cz, cy, r, a0, a1, n) => { for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cz + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  for (let z = -2.95; z <= 2.95; z += 0.25) pts.push([z, 0.02]);
  arc(3.35, 0.62, 0.42, -Math.PI / 2 + 0.35, Math.PI / 2, 10);
  for (let z = 3.1; z >= -3.2; z -= 0.3) pts.push([z, 1.04 + (z < -2.6 ? (-2.6 - z) * -0.05 : 0)]);
  arc(-3.55, 0.7, 0.36, Math.PI / 2, Math.PI * 1.45, 8);
  return pts;
}
function trackBelt() {
  const P = trackPath(), pos = [], uv = [], idx = []; let s = 0;
  for (let i = 0; i <= P.length; i++) { const [z, y] = P[i % P.length]; if (i) { const [pz, py] = P[i - 1]; s += Math.hypot(z - pz, y - py); }
    pos.push(-TRACK_W / 2, y, z, TRACK_W / 2, y, z); uv.push(s / 0.25 / 8, 0, s / 0.25 / 8, 1); if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
export function tankModel(lite) {
  const M = tankMats(lite), group = new THREE.Group(), B = bucket(), put = B.put;
  // hull: the side profile (z forward = -z, y up) extruded across, centred
  { const g = prism([[-3.3, 0.45], [-3.95, 0.92], [-3.85, 1.12], [-2.2, 1.5], [3.55, 1.52], [3.85, 1.3], [3.8, 0.55], [3.2, 0.4]].map(([z, y]) => [z, y]), 2.5, 0.05); g.rotateY(-Math.PI / 2); g.translate(1.25, 0, 0); put(M.carc, boxUV(g)); }
  // fenders and skirts (the skirts in sections, the front one shorter), headlight clusters, tow pintles, tool boxes, the engine deck grilles
  for (const s of [-1, 1]) { put(M.carc, boxUV(new THREE.BoxGeometry(0.98, 0.06, 7.5).translate(s * 1.71, 1.5, 0.05)));
    for (let k = 0; k < 6; k++) { const z0 = -3.55 + k * 1.15; put(M.carc, boxUV(new THREE.BoxGeometry(0.07, k ? 0.72 : 0.6, 1.12).translate(s * 2.2, k ? 1.13 : 1.2, z0 + 0.56))); }
    put(M.dark, new THREE.BoxGeometry(0.34, 0.2, 0.18).translate(s * 1.65, 1.62, -3.6)); put(M.lamp, new THREE.CircleGeometry(0.06, 10).rotateY(Math.PI).translate(s * 1.58, 1.62, -3.7)); put(M.lamp, new THREE.CircleGeometry(0.06, 10).rotateY(Math.PI).translate(s * 1.73, 1.62, -3.7));
    put(M.steel, new THREE.TorusGeometry(0.1, 0.03, 6, 12).rotateY(Math.PI / 2).translate(s * 0.8, 0.95, -3.98)); put(M.carc, boxUV(new THREE.BoxGeometry(0.5, 0.35, 1.4).translate(s * 1.65, 1.71, 2.2))); }
  put(M.black, new THREE.BoxGeometry(2.0, 0.03, 1.6).translate(0, 1.535, 2.6)); for (let z = 1.9; z < 3.4; z += 0.12) put(M.dark, new THREE.BoxGeometry(1.95, 0.04, 0.03).translate(0, 1.55, z));   // engine deck grille
  put(M.black, new THREE.BoxGeometry(1.9, 0.5, 0.05).translate(0, 1.0, 3.84));   // exhaust grille on the back plate
  put(M.dark, new THREE.BoxGeometry(0.5, 0.06, 0.6).translate(0, 1.54, -2.55)); for (const x of [-0.18, 0, 0.18]) put(M.glass, new THREE.BoxGeometry(0.12, 0.08, 0.05).translate(x, 1.57, -2.86));   // driver's hatch + periscopes
  // running gear: track belts (scrolling links), sprocket, idler, return rollers; road wheels are instanced so they can turn
  for (const s of [-1, 1]) { const belt = new THREE.Mesh(trackBelt(), M.track); belt.position.x = s * TRACK_X; belt.material.side = THREE.DoubleSide; belt.castShadow = !lite; group.add(belt);
    put(M.dark, new THREE.CylinderGeometry(0.4, 0.4, 0.5, 12).rotateZ(Math.PI / 2).translate(s * TRACK_X, 0.62, 3.35)); put(M.dark, new THREE.CylinderGeometry(0.33, 0.33, 0.5, 14).rotateZ(Math.PI / 2).translate(s * TRACK_X, 0.7, -3.55));
    for (const z of [-2, 0, 2]) put(M.dark, new THREE.CylinderGeometry(0.1, 0.1, 0.3, 8).rotateZ(Math.PI / 2).translate(s * TRACK_X, 0.96, z)); }
  const wg = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.5, lite ? 14 : 20).rotateZ(Math.PI / 2); { const uv = wg.attributes.uv, p = wg.attributes.position; for (let i = 0; i < p.count; i++) if (Math.abs(Math.abs(p.getX(i)) - 0.25) < 1e-3) uv.setXY(i, 0.5 + p.getZ(i) / WHEEL_R / 2, 0.5 + p.getY(i) / WHEEL_R / 2); }
  const wheels = new THREE.InstancedMesh(wg, M.wheel, WHEEL_Z.length * 2); wheels.castShadow = !lite; group.add(wheels);
  const turretG = new THREE.Group(); turretG.position.set(0, 1.52, 0.2); group.add(turretG);
  const T = bucket(); { const g = prism([[-0.75, -2.35], [0.75, -2.35], [1.72, -1.3], [1.78, 1.15], [1.6, 1.6], [-1.6, 1.6], [-1.78, 1.15], [-1.72, -1.3]].map(([x, z]) => [x, -z]), 0.78, 0.06); g.rotateX(-Math.PI / 2); T.put(M.carc, boxUV(g)); }
  // bustle rack (rails round the back) with stowage, the cupola + M2, loader's hatch + M240, the GPS sight 'doghouse', CITV, smoke launchers, antennas
  { const y = 0.82; for (const [a, b] of [[[-1.6, y, 1.6], [-1.6, y, 2.45]], [[1.6, y, 1.6], [1.6, y, 2.45]], [[-1.6, y, 2.45], [1.6, y, 2.45]]]) T.put(M.dark, tube([a, b], 0.025, 2));
    for (let x = -1.5; x <= 1.5; x += 0.25) T.put(M.dark, new THREE.CylinderGeometry(0.015, 0.015, 0.45, 4).translate(x, y - 0.2, 2.45));
    T.put(M.canvas, boxUV(new THREE.BoxGeometry(2.6, 0.5, 0.7).translate(0, 0.32 + 0.2, 2.05))); T.put(M.canvas, boxUV(new THREE.BoxGeometry(0.8, 0.35, 0.55).translate(-0.7, 0.95, 2.05))); T.put(M.tan, new THREE.CylinderGeometry(0.2, 0.2, 0.7, 10).rotateZ(Math.PI / 2).translate(0.75, 0.95, 2.1)); }
  T.put(M.carc, boxUV(new THREE.CylinderGeometry(0.42, 0.45, 0.32, 16).translate(0.62, 0.94, 0.55))); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; T.put(M.glass, new THREE.BoxGeometry(0.14, 0.07, 0.04).rotateY(-a).translate(0.62 + Math.sin(a) * 0.44, 0.98, 0.55 - Math.cos(a) * 0.44)); }
  T.put(M.dark, new THREE.BoxGeometry(0.22, 0.2, 0.55).translate(0.62, 1.2, 0.35)); T.put(M.dark, new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6).rotateX(Math.PI / 2).translate(0.62, 1.22, -0.35));   // M2
  T.put(M.carc, boxUV(new THREE.CylinderGeometry(0.38, 0.38, 0.08, 16).translate(-0.7, 0.82, 0.6))); T.put(M.dark, new THREE.CylinderGeometry(0.022, 0.022, 0.9, 6).rotateX(Math.PI / 2).translate(-0.7, 1.15, 0.2)); T.put(M.dark, new THREE.BoxGeometry(0.1, 0.32, 0.1).translate(-0.7, 0.98, 0.55));
  T.put(M.carc, boxUV(new THREE.BoxGeometry(0.55, 0.42, 0.65).translate(0.95, 0.98, -1.15))); T.put(M.glass, new THREE.BoxGeometry(0.42, 0.22, 0.02).translate(0.95, 1.03, -1.48));   // gunner's primary sight
  T.put(M.dark, new THREE.CylinderGeometry(0.12, 0.14, 0.5, 10).translate(-0.85, 1.03, -0.5)); T.put(M.dark, new THREE.BoxGeometry(0.34, 0.26, 0.3).translate(-0.85, 1.38, -0.5)); T.put(M.glass, new THREE.BoxGeometry(0.26, 0.16, 0.02).translate(-0.85, 1.38, -0.66));   // CITV
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) T.put(M.dark, new THREE.CylinderGeometry(0.05, 0.05, 0.22, 8).rotateX(-1.1).translate(s * (1.45 + (k % 2) * 0.1), 0.62 + Math.floor(k / 2) * 0.09, -1.55 + (k % 2) * 0.05));
  for (const x of [-1.25, 1.25]) T.put(M.black, new THREE.CylinderGeometry(0.008, 0.014, 2.6, 4).translate(x, 0.78 + 1.3, 1.4));
  T.build(turretG, !lite);
  // the gun: mantlet, then a lathe-turned 120 mm tube with the fume extractor bulge and the muzzle reference sensor
  const barrel = new THREE.Group(); barrel.position.set(0, 0.42, -2.25); turretG.add(barrel);
  barrel.add(new THREE.Mesh(boxUV(new THREE.BoxGeometry(1.0, 0.55, 0.4).translate(0, 0, 0.05)), M.carc));
  { const prof = [[0.2, 0], [0.19, 0.4], [0.13, 0.5], [0.12, 1.6], [0.17, 1.75], [0.17, 2.55], [0.12, 2.7], [0.11, 4.95], [0.13, 5.0], [0.13, 5.2], [0.0, 5.2]].map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(prof, lite ? 12 : 20); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, M.tan); m.castShadow = !lite; barrel.add(m);
    const ms = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.18), M.dark); ms.position.set(0, 0.17, -4.95); barrel.add(ms); }
  const gunTip = new THREE.Object3D(); gunTip.position.set(0, 0, -5.3); barrel.add(gunTip);
  B.build(group, !lite);
  return { group, turretG, barrel, gunTip, wheels, trackTex: M.trackT, barrelZ: -2.25 };
}
/** per frame: the road wheels turn and the track links run with the distance driven */
export function tankRunningGear(c) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), ax = new THREE.Vector3(1, 0, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(); let i = 0;
  q.setFromAxisAngle(ax, -(c.treadT || 0) / WHEEL_R);
  for (const s of [-1, 1]) for (const z of WHEEL_Z) c.wheels.setMatrixAt(i++, m.compose(p.set(s * TRACK_X, WHEEL_R + 0.03, z), q, one));
  c.wheels.instanceMatrix.needsUpdate = true; c.trackTex.offset.x = -(c.treadT || 0) / 0.25 / 8;
}
