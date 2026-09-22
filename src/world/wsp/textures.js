// WSP procedural + loaded textures. WSP agent.
import * as THREE from 'three';

const loader = new THREE.TextureLoader();
function tex(url, { srgb = false, rep = 1 } = {}) {
  const t = loader.load(url); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(rep, rep); return t;
}
export function loadedTextures() {
  return {
    grass: tex('./assets/textures/wsp_grass_Diffuse_1k.jpg', { srgb: true }), grassN: tex('./assets/textures/wsp_grass_nor_gl_1k.jpg'),
    marble: tex('./assets/textures/wsp_marble_Diffuse_1k.jpg', { srgb: true }), marbleN: tex('./assets/textures/wsp_marble_nor_gl_1k.jpg'),
    brick: tex('./assets/textures/wsp_brick_Diffuse_1k.jpg', { srgb: true }), brickN: tex('./assets/textures/wsp_brick_nor_gl_1k.jpg'),
    asphalt: tex('./assets/textures/asphalt_02_Diffuse_2k.jpg', { srgb: true }), asphaltN: tex('./assets/textures/asphalt_02_nor_gl_2k.jpg'), asphaltA: tex('./assets/textures/asphalt_02_arm_2k.jpg'),
    concrete: tex('./assets/textures/concrete_floor_02_Diffuse_1k.jpg', { srgb: true }), concreteN: tex('./assets/textures/concrete_floor_02_nor_gl_1k.jpg'),
  };
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function finish(c, { srgb = true, wrap = true, aniso = 8, nearest = false } = {}) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; if (nearest) t.magFilter = THREE.NearestFilter; t.generateMipmaps = true; return t;
}
const rnd = (R, a, b) => a + R() * (b - a);

/** Hexagonal asphalt pavers (WSP paths): dark blue-grey hex tiles, pale mortar joints. Tile = 512 px covers ~2.0 m (hex ≈ 30 cm across flats). */
export function hexPaverTexture(R) {
  const S = 512; const [c, g] = canvas(S, S);
  g.fillStyle = '#66676a'; g.fillRect(0, 0, S, S);                 // mortar (dark, low contrast)
  const cols = 8; const a = S / (cols * 1.5);                       // hex circumradius so the tile wraps: width per column = 1.5a
  const hgt = Math.sqrt(3) * a; const rows = Math.round(S / hgt);   // approximately wrap in y
  const aY = S / rows / Math.sqrt(3);
  for (let r = -1; r <= rows + 1; r++) for (let q = -1; q <= cols + 1; q++) {
    const cx = q * 1.5 * a, cy = r * Math.sqrt(3) * aY + (q & 1 ? Math.sqrt(3) * aY / 2 : 0);
    const v = rnd(R, -12, 12); const base = [86 + v, 87 + v, 90 + v];
    g.fillStyle = `rgb(${base[0] | 0},${base[1] | 0},${base[2] | 0})`;
    g.beginPath(); for (let i = 0; i < 6; i++) { const t = Math.PI / 3 * i; const px = cx + (a - 2.2) * Math.cos(t), py = cy + (aY - 2.2) * Math.sin(t); i ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); g.fill();
    // wear highlights
    if (R() < 0.35) { g.fillStyle = `rgba(160,162,165,${rnd(R, 0.04, 0.12)})`; g.beginPath(); g.ellipse(cx + rnd(R, -6, 6), cy + rnd(R, -6, 6), a * 0.5, aY * 0.35, R() * 3, 0, Math.PI * 2); g.fill(); }
  }
  // grime speckle
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '20,22,26' : '150,150,150'},${R() * 0.22})`; g.fillRect(R() * S, R() * S, 1 + R() * 2, 1 + R() * 2); }
  return finish(c);
}

/** Grey granite flags (fountain floor / steps): 512 px = 2 m, 2×4 slabs with thin joints. */
export function graniteTexture(R, { tone = 150, slabs = [2, 4], joint = 3 } = {}) {
  const S = 512; const [c, g] = canvas(S, S);
  g.fillStyle = `rgb(${tone - 45},${tone - 45},${tone - 42})`; g.fillRect(0, 0, S, S);
  const [nx, ny] = slabs; const sw = S / nx, sh = S / ny;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v = rnd(R, -9, 9); g.fillStyle = `rgb(${tone + v | 0},${tone + v - 1 | 0},${tone + v - 5 | 0})`;
    const off = j & 1 ? sw / 2 : 0; const x = ((i * sw + off) % S);
    g.fillRect(x + joint, j * sh + joint, sw - 2 * joint, sh - 2 * joint); if (x + sw > S) g.fillRect(x - S + joint, j * sh + joint, sw - 2 * joint, sh - 2 * joint);
  }
  for (let i = 0; i < 30000; i++) { const v = R(); g.fillStyle = `rgba(${v < 0.5 ? '30,30,34' : '235,232,226'},${R() * 0.26})`; g.fillRect(R() * S, R() * S, 1, 1); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(20,20,22,${R() * 0.08})`; g.beginPath(); g.ellipse(R() * S, R() * S, 10 + R() * 40, 6 + R() * 20, R() * 3, 0, 7); g.fill(); }   // damp / wear patches
  return finish(c);
}

/** Concrete sidewalk with scoring lines (5 ft squares): 512 px = 3 m. */
export function sidewalkTexture(R) {
  const S = 512; const [c, g] = canvas(S, S);
  g.fillStyle = '#9b9893'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 20000; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '60,58,55' : '210,206,200'},${R() * 0.25})`; g.fillRect(R() * S, R() * S, 1 + R(), 1 + R()); }
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(40,40,40,${R() * 0.25})`; g.beginPath(); g.ellipse(R() * S, R() * S, 2 + R() * 6, 2 + R() * 6, 0, 0, 7); g.fill(); } // gum spots
  g.strokeStyle = 'rgba(60,58,54,0.7)'; g.lineWidth = 3; for (const p of [0, S / 2]) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.moveTo(0, p); g.lineTo(S, p); g.stroke(); }
  return finish(c);
}

/** Leaf-cluster alpha card (London plane): broad lobed leaves, olive/yellow-green. */
export function leafTexture(R, { hue = 95 } = {}) {
  const S = 512; const [c, g] = canvas(S, S);
  g.clearRect(0, 0, S, S);
  const leaf = (x, y, r, rot, l) => {
    g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = `hsl(${hue + rnd(R, -8, 8)},${28 + l * 0.6 | 0}%,${l | 0}%)`;
    g.beginPath(); g.moveTo(0, -r);
    for (let i = 0; i < 5; i++) { const t = -Math.PI / 2 + (i + 0.5) * Math.PI * 2 / 5; g.quadraticCurveTo(Math.cos(t - 0.35) * r * 1.15, Math.sin(t - 0.35) * r * 1.15, Math.cos(t) * r * 0.55, Math.sin(t) * r * 0.55); g.quadraticCurveTo(Math.cos(t + 0.35) * r * 1.15, Math.sin(t + 0.35) * r * 1.15, Math.cos(t + Math.PI * 2 / 10) * r, Math.sin(t + Math.PI * 2 / 10) * r); }
    g.closePath(); g.fill(); g.restore();
  };
  // clusters: denser in the middle, ragged silhouette
  for (let i = 0; i < 900; i++) {
    const ang = R() * Math.PI * 2, d = Math.pow(R(), 0.6) * S * 0.46;
    const x = S / 2 + Math.cos(ang) * d, y = S / 2 + Math.sin(ang) * d * 0.95;
    const depth = d / (S * 0.46); leaf(x, y, rnd(R, 14, 30), R() * 6.3, rnd(R, 20, 36) + (1 - depth) * -5);
  }
  for (let i = 0; i < 260; i++) { const ang = R() * 6.3, d = Math.pow(R(), 0.5) * S * 0.42; leaf(S / 2 + Math.cos(ang) * d, S / 2 + Math.sin(ang) * d, rnd(R, 12, 22), R() * 6.3, rnd(R, 30, 44)); }
  const t = finish(c, { wrap: false }); return t;
}

/** Plane-tree bark: mottled olive/cream/grey patches. 256 px = 1 m around. */
export function barkTexture(R) {
  const S = 256; const [c, g] = canvas(S, S);
  g.fillStyle = '#8a8272'; g.fillRect(0, 0, S, S);
  const cols = ['#a49e8a', '#6f6a5c', '#b9b09a', '#7c8468', '#c8bfa6', '#5f5a50'];
  for (let i = 0; i < 260; i++) { g.fillStyle = cols[(R() * cols.length) | 0]; g.globalAlpha = 0.7; g.beginPath(); g.ellipse(R() * S, R() * S, rnd(R, 6, 22), rnd(R, 10, 34), R() * 3, 0, 7); g.fill(); }
  g.globalAlpha = 1; for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(30,28,24,${R() * 0.2})`; g.fillRect(R() * S, R() * S, 1, 2 + R() * 4); }
  return finish(c);
}

/** Generic facade texture: one tile = `bays` window bays × `floors` floors. Returns { map, emissive? } sized 512×512. */
export function facadeTexture(R, style = 'brick', { bays = 4, floors = 4 } = {}) {
  const S = 512; const [c, g] = canvas(S, S);
  const P = {
    brick: { wall: '#7e4a3c', wall2: '#6b3d31', trim: '#d9d2c2', glass: '#2a3238', frame: '#efe9dc' },
    row: { wall: '#87503f', wall2: '#734335', trim: '#e9e3d5', glass: '#26303a', frame: '#f2eee4' },
    tan: { wall: '#b39a72', wall2: '#a68e68', trim: '#cbb996', glass: '#2c343a', frame: '#d8ccb0' },
    stone: { wall: '#cfc7b4', wall2: '#c4bca8', trim: '#e6e0d0', glass: '#2a3238', frame: '#e3ddcd' },
    sandstone: { wall: '#9a4f3b', wall2: '#8a4432', trim: '#7d3a2b', glass: '#1b2126', frame: '#5d2f24' },
    glass: { wall: '#7d8a92', wall2: '#6f7b83', trim: '#c5cbd0', glass: '#4b6472', frame: '#d7dde0' },
    white: { wall: '#d8d3c8', wall2: '#cec9bd', trim: '#efeae0', glass: '#2c3439', frame: '#f0ece4' },
    church: { wall: '#c4a56b', wall2: '#b89a62', trim: '#d9c9a2', glass: '#3a2f3f', frame: '#e6d7ae' },
  }[style] || { wall: '#8a7d6a', wall2: '#7e7260', trim: '#c9c0ad', glass: '#2a3238', frame: '#e0dacc' };
  g.fillStyle = P.wall; g.fillRect(0, 0, S, S);
  // brick courses / panel joints
  if (style === 'brick' || style === 'row' || style === 'tan') {
    g.fillStyle = P.wall2; for (let y = 0; y < S; y += 4) for (let x = ((y / 4) & 1) * 5; x < S; x += 10) if (R() < 0.5) g.fillRect(x, y, 4, 2);
    g.fillStyle = 'rgba(0,0,0,0.10)'; for (let y = 0; y < S; y += 4) g.fillRect(0, y, S, 1);
  } else if (style === 'sandstone') {
    // Bobst: strong vertical piers + horizontal bands (grid of red sandstone)
    g.fillStyle = P.wall2; for (let y = 0; y < S; y += 3) g.fillRect(0, y, S, 1);
  } else if (style === 'stone' || style === 'white') {
    g.fillStyle = 'rgba(0,0,0,0.10)'; for (let y = 0; y < S; y += 32) g.fillRect(0, y, S, 2); for (let x = 0; x < S; x += 64) g.fillRect(x, 0, 2, S);
  } else if (style === 'glass') {
    g.fillStyle = P.glass; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${150 + R() * 80 | 0},${170 + R() * 60 | 0},${190 + R() * 50 | 0},${R() * 0.25})`; g.fillRect(R() * S, R() * S, 30 + R() * 90, 3 + R() * 8); }
  }
  if (style === 'church') {
    // yellow Roman brick courses + a big round-arched window per bay on the upper half, small arched openings below, corbel band
    g.fillStyle = P.wall2; for (let y = 0; y < S; y += 5) g.fillRect(0, y, S, 1);
    for (let b = 0; b < bays; b++) {
      const x0 = b * (S / bays), bw2 = S / bays; const wx = x0 + bw2 * 0.25, ww = bw2 * 0.5;
      const arch = (y, h) => { g.beginPath(); g.moveTo(wx, y + h); g.lineTo(wx, y + ww / 2); g.arc(wx + ww / 2, y + ww / 2, ww / 2, Math.PI, 0); g.lineTo(wx + ww, y + h); g.closePath(); };
      g.fillStyle = P.trim; g.save(); g.translate(0, -6); arch(60, 190); g.fill(); g.restore(); g.fillStyle = 'rgba(0,0,0,0.55)'; arch(60, 190); g.fill(); g.fillStyle = P.glass; g.save(); g.translate(0, 4); arch(60, 182); g.fill(); g.restore();
      const gr = g.createLinearGradient(0, 60, 0, 250); gr.addColorStop(0, 'rgba(180,140,120,0.35)'); gr.addColorStop(1, 'rgba(40,30,50,0.1)'); g.fillStyle = gr; arch(60, 190); g.fill();
      g.fillStyle = P.frame; g.fillRect(wx + ww / 2 - 2, 60, 4, 190); g.fillRect(wx, 150, ww, 4);
      for (const sx of [0.12, 0.62]) { const ax = x0 + bw2 * sx, aw = bw2 * 0.26; g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.moveTo(ax, 500); g.lineTo(ax, 340 + aw / 2); g.arc(ax + aw / 2, 340 + aw / 2, aw / 2, Math.PI, 0); g.lineTo(ax + aw, 500); g.closePath(); g.fill(); }
    }
    g.fillStyle = P.trim; g.fillRect(0, 290, S, 8); g.fillRect(0, 12, S, 6); for (let x = 0; x < S; x += 24) g.fillRect(x, 18, 12, 10);
    return finish(c);
  }
  const bw = S / bays, fh = S / floors;
  for (let f = 0; f < floors; f++) for (let b = 0; b < bays; b++) {
    const x0 = b * bw, y0 = f * fh;
    if (style === 'glass') { g.fillStyle = '#b9bcbf'; g.fillRect(x0, y0 + fh * 0.72, bw, fh * 0.28); g.fillStyle = '#8e9296'; g.fillRect(x0, y0, 4, fh); g.fillRect(x0 + bw / 2 - 1, y0, 2, fh * 0.72); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x0, y0 + fh * 0.72, bw, 3); continue; }
    if (style === 'sandstone') {
      // deep-set narrow window in a grid: pier | window | pier
      // Bobst: two narrow slot windows per bay between deep sandstone piers, spandrel band
      g.fillStyle = P.trim; g.fillRect(x0, y0, bw, 10); g.fillRect(x0, y0, 12, fh); g.fillRect(x0 + bw / 2 - 5, y0, 10, fh);
      for (const sx of [0.16, 0.6]) { const wx = x0 + bw * sx, ww = bw * 0.24; g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(wx - 3, y0 + 10, ww + 6, fh - 10); g.fillStyle = P.glass; g.fillRect(wx, y0 + 14, ww, fh - 18); g.fillStyle = 'rgba(120,150,170,0.25)'; g.fillRect(wx, y0 + 14, ww, (fh - 18) * 0.4); }
      continue;
    }
    // punched window with sill + lintel, 2-over-2 sash
    const ww = bw * (style === 'row' ? 0.36 : 0.42), wh = fh * (style === 'row' ? 0.62 : 0.55);
    const wx = x0 + (bw - ww) / 2, wy = y0 + fh * 0.2;
    g.fillStyle = P.trim; g.fillRect(wx - 6, wy - 8, ww + 12, 7); g.fillRect(wx - 8, wy + wh, ww + 16, 6);   // lintel / sill
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(wx, wy, ww, wh);                                              // reveal shadow
    g.fillStyle = P.glass; g.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
    // glass sky reflection gradient
    const gr = g.createLinearGradient(0, wy, 0, wy + wh); gr.addColorStop(0, 'rgba(160,190,215,0.55)'); gr.addColorStop(0.5, 'rgba(120,150,175,0.15)'); gr.addColorStop(1, 'rgba(60,70,80,0)'); g.fillStyle = gr; g.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
    g.fillStyle = P.frame; g.fillRect(wx + ww / 2 - 1.5, wy, 3, wh); g.fillRect(wx, wy + wh / 2 - 1.5, ww, 3);
    if (R() < 0.18) { g.fillStyle = 'rgba(235,225,205,0.8)'; g.fillRect(wx + 3, wy + 3, ww - 6, wh * 0.45); }      // blind / curtain
    if (style === 'row' && f === floors - 1) { g.fillStyle = '#1e1f22'; g.fillRect(wx - 10, wy - 2, 4, wh + 4); g.fillRect(wx + ww + 6, wy - 2, 4, wh + 4); } // shutters look
  }
  // grime at floor lines
  for (let f = 1; f < floors; f++) { const gr = g.createLinearGradient(0, f * fh - 10, 0, f * fh + 10); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, f * fh - 10, S, 20); }
  return finish(c);
}

/** Storefront strip (ground floor of a MacDougal / W 3rd block): 1024×256 = 4 shops × 6 m, 4.2 m tall. */
export function storefrontTexture(R) {
  const W = 1024, H = 256; const [c, g] = canvas(W, H);
  const names = ['CAFFE', 'FALAFEL', 'BOOKS', 'PIZZA', 'RECORDS', 'ESPRESSO', 'COMEDY', 'NOODLES', 'TATTOO', 'BAR', 'BAGELS', 'VINTAGE'];
  const cols = ['#2b3a2e', '#7a2222', '#1f2f4a', '#3a2a1a', '#223', '#5a4a10', '#0e3a3a', '#4a1a3a'];
  for (let s = 0; s < 4; s++) {
    const x0 = s * 256; const col = cols[(R() * cols.length) | 0];
    g.fillStyle = '#6e6a63'; g.fillRect(x0, 0, 256, H);                      // pier masonry
    g.fillStyle = col; g.fillRect(x0 + 8, 0, 240, 64);                         // fascia / signboard
    g.fillStyle = '#e8e2cf'; g.font = 'bold 34px Arial Narrow, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(names[(R() * names.length) | 0], x0 + 128, 32);
    g.fillStyle = '#20262b'; g.fillRect(x0 + 16, 70, 224, 176);                // shop window + door
    const gr = g.createLinearGradient(0, 70, 0, 246); gr.addColorStop(0, 'rgba(170,200,225,0.55)'); gr.addColorStop(1, 'rgba(60,70,80,0.05)'); g.fillStyle = gr; g.fillRect(x0 + 16, 70, 224, 176);
    g.fillStyle = 'rgba(255,225,160,0.35)'; for (let i = 0; i < 5; i++) g.fillRect(x0 + 30 + R() * 120, 100 + R() * 100, 8 + R() * 30, 6 + R() * 20); // interior
    g.fillStyle = '#4a4238'; g.fillRect(x0 + 176, 96, 60, 150); g.fillStyle = '#c9b98a'; g.fillRect(x0 + 226, 170, 5, 5); // door + handle
    g.fillStyle = '#2a2a2a'; g.fillRect(x0 + 16, 70, 224, 4); g.fillRect(x0 + 172, 96, 4, 150);
  }
  return finish(c, { aniso: 16 });
}

/** Arch attic inscription band (tileable in x is not needed): 2048×256. */
export function inscriptionTexture() {
  const W = 2048, H = 256; const [c, g] = canvas(W, H);
  g.fillStyle = '#e4dfd3'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(120,110,95,${Math.random() * 0.12})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  g.fillStyle = '#7d766a'; g.font = '600 46px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('TO THE CITIZENS WHO BUILT THIS CITY AND TO THOSE WHO KEEP IT FREE', W / 2, H * 0.36);
  g.font = '600 40px Georgia, serif'; g.fillText('ERECTED BY THE PEOPLE OF THE CITY · MDCCCXCII', W / 2, H * 0.68);
  return finish(c, { wrap: false, aniso: 16 });
}

/** Frieze: stars and W's between mouldings (tileable). */
export function friezeTexture() {
  const W = 512, H = 128; const [c, g] = canvas(W, H);
  g.fillStyle = '#ddd7ca'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#b9b2a4'; g.fillRect(0, 0, W, 10); g.fillRect(0, H - 10, W, 10);
  const star = (x, y, r) => { g.beginPath(); for (let i = 0; i < 10; i++) { const rr = i & 1 ? r * 0.45 : r; const t = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr); } g.closePath(); g.fill(); };
  g.fillStyle = '#9d9587';
  for (let i = 0; i < 4; i++) { star(64 + i * 128, H / 2, 30); g.font = 'bold 34px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('C', 128 + i * 128, H / 2); }
  for (let i = 0; i < 8; i++) star(32 + i * 64, 24, 7), star(32 + i * 64, H - 24, 7);
  const t = finish(c, { aniso: 16 }); t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

/** Coffered vault texture (tileable): recessed squares with rosettes. */
export function cofferTexture() {
  const S = 256; const [c, g] = canvas(S, S);
  g.fillStyle = '#d9d3c6'; g.fillRect(0, 0, S, S);
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const x = i * 128, y = j * 128;
    g.fillStyle = '#c3bcae'; g.fillRect(x + 14, y + 14, 100, 100);
    g.fillStyle = '#aaa294'; g.fillRect(x + 22, y + 22, 84, 84);
    g.fillStyle = '#8f887b'; g.fillRect(x + 30, y + 30, 68, 68);
    g.fillStyle = '#cbc4b5'; g.beginPath(); g.arc(x + 64, y + 64, 16, 0, 7); g.fill();
    g.fillStyle = '#e6e0d3'; g.fillRect(x + 14, y + 14, 100, 4); g.fillRect(x + 14, y + 14, 4, 100);
  }
  return finish(c);
}

/** Checkerboard chess-table top (64 px). */
export function chessTexture() {
  const S = 128; const [c, g] = canvas(S, S);
  g.fillStyle = '#b9b3a4'; g.fillRect(0, 0, S, S);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { g.fillStyle = (i + j) & 1 ? '#4a4540' : '#cfc9ba'; g.fillRect(16 + i * 12, 16 + j * 12, 12, 12); }
  return finish(c, { wrap: false, nearest: true });
}

/** Simple ground mask painter over an area [x0,x1]×[z0,z1] → canvas texture (R paving, G asphalt, B sidewalk/concrete). */
export function makeMask(area, px, draw) {
  const w = Math.round((area.x1 - area.x0) * px), h = Math.round((area.z1 - area.z0) * px);
  const [c, g] = canvas(w, h); g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  const X = (x) => (x - area.x0) * px, Z = (z) => (z - area.z0) * px;
  const m = {
    g, px, X, Z,
    color: (ch) => ({ r: '#ff0000', g: '#00ff00', b: '#0000ff', k: '#000000' }[ch]),
    rect(ch, x0, z0, x1, z1) { g.fillStyle = m.color(ch); g.fillRect(X(Math.min(x0, x1)), Z(Math.min(z0, z1)), Math.abs(x1 - x0) * px, Math.abs(z1 - z0) * px); },
    circle(ch, x, z, r) { g.fillStyle = m.color(ch); g.beginPath(); g.arc(X(x), Z(z), r * px, 0, Math.PI * 2); g.fill(); },
    path(ch, pts, wdt) { g.strokeStyle = m.color(ch); g.lineWidth = wdt * px; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(X(p[0]), Z(p[1])) : g.moveTo(X(p[0]), Z(p[1]))); g.stroke(); },
  };
  draw(m);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.flipY = false;
  return t;
}

/** Tuckahoe-marble canvas: near-white warm grey with faint veins and weathering (512 px ≈ 2.4 m). */
export function marbleTexture(R) {
  const S = 512; const [c, g] = canvas(S, S);
  g.fillStyle = '#e6e2d9'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(${150 + R() * 40 | 0},${150 + R() * 40 | 0},${145 + R() * 40 | 0},${0.12 + R() * 0.2})`; g.lineWidth = 0.6 + R() * 1.6; g.beginPath(); let x = R() * S, y = R() * S; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (R() - 0.5) * 90; y += (R() - 0.5) * 90; g.lineTo(x, y); } g.stroke(); }
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '120,115,105' : '255,255,250'},${R() * 0.14})`; g.fillRect(R() * S, R() * S, 1 + R() * 2, 1 + R() * 2); }
  // block joints (ashlar) every 1/3 tile
  g.strokeStyle = 'rgba(90,85,78,0.35)'; g.lineWidth = 2; for (let y = 0; y < S; y += S / 3) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); } for (let x = 0; x < S; x += S / 2) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke(); }
  return finish(c);
}
