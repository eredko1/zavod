// TERMINAL materials: procedural canvas textures (marble, Caen stone, celestial vault, subway tile, brass, boards). TERMINAL agent.
import * as THREE from 'three';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, { srgb = true, repeat = true, aniso = 8, nearest = false } = {}) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; if (nearest) t.magFilter = THREE.NearestFilter;
  return t;
}
// value noise helpers (deterministic via R)
function noiseField(R, S, oct = 4) {
  const out = new Float32Array(S * S); let amp = 1, total = 0;
  for (let o = 0; o < oct; o++) {
    const n = 4 << o; const grid = new Float32Array(n * n); for (let i = 0; i < n * n; i++) grid[i] = R();
    const g = (i, j) => grid[((j % n + n) % n) * n + ((i % n + n) % n)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const fx = x / S * n, fy = y / S * n; const gx = Math.floor(fx), gy = Math.floor(fy); const tx = fx - gx, ty = fy - gy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = g(gx, gy), b = g(gx + 1, gy), c = g(gx, gy + 1), d = g(gx + 1, gy + 1);
      out[y * S + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy);
    }
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}
function veins(g, R, S, { color, count, width, alpha }) {
  g.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    let x = R() * S, y = R() * S; let a = R() * Math.PI * 2;
    g.strokeStyle = color; g.globalAlpha = alpha * (0.5 + R() * 0.5); g.lineWidth = width * (0.4 + R() * 0.8);
    g.beginPath(); g.moveTo(x, y);
    const n = 20 + Math.floor(R() * 40);
    for (let k = 0; k < n; k++) { a += (R() - 0.5) * 0.9; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); }
    g.stroke();
  }
  g.globalAlpha = 1;
}

export function makeMats(ctx, R, env) {
  const M = {};
  const std = (name, p) => { const m = new THREE.MeshStandardMaterial(p); m.name = name; if (env) m.envMap = env; return m; };

  // ---- Tennessee pink marble floor (tile = 4 m) -------------------------------
  {
    const S = 1024, [c, g] = canvas(S, S);
    g.fillStyle = '#cfbfae'; g.fillRect(0, 0, S, S);
    const nf = noiseField(R, 256, 5);
    for (let y = 0; y < S; y += 4) for (let x = 0; x < S; x += 4) { const n = nf[((y >> 2) % 256) * 256 + ((x >> 2) % 256)]; g.fillStyle = `rgba(${165 + n * 55},${140 + n * 50},${122 + n * 45},0.7)`; g.fillRect(x, y, 4, 4); }
    veins(g, R, S, { color: '#8a5f4d', count: 26, width: 2.2, alpha: 0.35 });
    veins(g, R, S, { color: '#e8d6c8', count: 30, width: 3, alpha: 0.35 });
    // slab joints every 1 m (256px) with slight offset per row
    g.strokeStyle = 'rgba(70,50,42,0.75)'; g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * 256); g.lineTo(S, i * 256); g.stroke(); }
    for (let j = 0; j < 4; j++) for (let i = 0; i <= 4; i++) { const off = (j % 2) * 128; g.beginPath(); g.moveTo(i * 256 + off, j * 256); g.lineTo(i * 256 + off, (j + 1) * 256); g.stroke(); }
    const map = tex(c);
    const [rc, rg] = canvas(512, 512); rg.fillStyle = '#3a3a3a'; rg.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 900; i++) { rg.fillStyle = `rgba(${120 + R() * 100},${120 + R() * 100},${120 + R() * 100},${0.15 + R() * 0.3})`; rg.fillRect(R() * 512, R() * 512, 2 + R() * 30, 1 + R() * 3); }
    // traffic lanes (worn = rougher)
    for (let i = 0; i < 6; i++) { const x = R() * 512; const gr = rg.createLinearGradient(x - 60, 0, x + 60, 0); gr.addColorStop(0, 'rgba(120,120,120,0)'); gr.addColorStop(0.5, 'rgba(140,140,140,0.5)'); gr.addColorStop(1, 'rgba(120,120,120,0)'); rg.fillStyle = gr; rg.fillRect(x - 60, 0, 120, 512); }
    const rough = tex(rc, { srgb: false });
    M.marbleFloor = std('marbleFloor', { map, roughnessMap: rough, roughness: 1.0, metalness: 0.02, color: 0xffffff, envMapIntensity: 0.9 });
    M.marbleFloor.userData.uv = 0.25;
  }
  // ---- Caen stone ashlar (walls) tile = 4 m ----------------------------------------
  {
    const S = 1024, [c, g] = canvas(S, S);
    g.fillStyle = '#b39a72'; g.fillRect(0, 0, S, S);
    const nf = noiseField(R, 256, 4);
    for (let y = 0; y < S; y += 4) for (let x = 0; x < S; x += 4) { const n = nf[((y >> 2) % 256) * 256 + ((x >> 2) % 256)]; g.fillStyle = `rgba(${165 + n * 45},${140 + n * 40},${100 + n * 40},0.7)`; g.fillRect(x, y, 4, 4); }
    // blocks 1.2 x 0.6 m → 307 x 154 px
    const bw = 341, bh = 128;
    for (let j = 0; j < S / bh; j++) {
      const off = (j % 2) * bw / 2;
      for (let i = -1; i < S / bw + 1; i++) {
        const x = i * bw + off, y = j * bh; const t = R() * 0.25;
        g.fillStyle = `rgba(${90 + t * 200},${80 + t * 160},${60 + t * 130},${0.12 + R() * 0.12})`; g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        g.strokeStyle = 'rgba(95,80,60,0.55)'; g.lineWidth = 2.5; g.strokeRect(x + 1, y + 1, bw - 2, bh - 2);
        g.strokeStyle = 'rgba(255,245,225,0.25)'; g.lineWidth = 1; g.strokeRect(x + 4, y + 4, bw - 8, bh - 8);
      }
    }
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(90,70,50,${R() * 0.18})`; g.fillRect(R() * S, R() * S, 1 + R() * 3, 1 + R() * 3); }
    M.stone = std('caenStone', { map: tex(c), roughness: 0.82, metalness: 0.0, color: 0xffffff });
    M.stone.userData.uv = 0.25;
  }
  // ---- Botticino cream marble (wainscot, booths, stairs) tile = 2 m -----------------
  {
    const S = 1024, [c, g] = canvas(S, S);
    g.fillStyle = '#ddd0b8'; g.fillRect(0, 0, S, S);
    const nf = noiseField(R, 256, 5);
    for (let y = 0; y < S; y += 4) for (let x = 0; x < S; x += 4) { const n = nf[((y >> 2) % 256) * 256 + ((x >> 2) % 256)]; g.fillStyle = `rgba(${200 + n * 45},${185 + n * 40},${160 + n * 35},0.8)`; g.fillRect(x, y, 4, 4); }
    veins(g, R, S, { color: '#9a8468', count: 22, width: 1.8, alpha: 0.35 });
    veins(g, R, S, { color: '#f4ecdd', count: 18, width: 2.5, alpha: 0.4 });
    g.strokeStyle = 'rgba(80,65,50,0.5)'; g.lineWidth = 3; for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(0, i * 512); g.lineTo(S, i * 512); g.stroke(); g.beginPath(); g.moveTo(i * 512, 0); g.lineTo(i * 512, S); g.stroke(); }
    M.marble = std('botticino', { map: tex(c), roughness: 0.28, metalness: 0.02, color: 0xffffff, envMapIntensity: 0.8 });
    M.marble.userData.uv = 0.5;
    M.marbleDark = std('marbleDark', { map: M.marble.map, roughness: 0.3, metalness: 0.02, color: 0x8d7f6d });
    M.marbleDark.userData.uv = 0.5;
  }
  // ---- Celestial vault: teal plaster + gold stars/constellations (unique, covers the vault once) ----
  {
    const W = 2048, H = 1024, [c, g] = canvas(W, H);
    g.fillStyle = '#3b8f97'; g.fillRect(0, 0, W, H);
    const nf = noiseField(R, 256, 4);
    for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 8) { const n = nf[((y >> 3) % 256) * 256 + ((x >> 3) % 256)]; g.fillStyle = `rgba(${34 + n * 34},${108 + n * 36},${112 + n * 34},0.55)`; g.fillRect(x, y, 8, 8); }
    // grime gradient at edges (age)
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(20,40,40,0.18)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(20,40,40,0.18)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // dark uncleaned patch (Cancer, NW corner)
    g.fillStyle = 'rgba(40,45,38,0.9)'; g.fillRect(W * 0.16, H * 0.06, 90, 40);
    // emissive layer: stars + constellation lines + zodiac band
    const [ec, eg] = canvas(W, H); eg.fillStyle = '#000'; eg.fillRect(0, 0, W, H);
    eg.globalAlpha = 0.5; eg.drawImage(c, 0, 0); eg.globalAlpha = 1; // plaster self-glow baked into the emissive (the real vault is uplit from the cornice)
    const stars = [];
    for (let i = 0; i < 2600; i++) { const x = R() * W, y = R() * H, r = 0.6 + R() * 1.6; stars.push([x, y, r]); eg.fillStyle = `rgba(255,${205 + R() * 40},${120 + R() * 60},${0.6 + R() * 0.4})`; eg.beginPath(); eg.arc(x, y, r, 0, Math.PI * 2); eg.fill(); }
    // ecliptic band (gold)
    eg.strokeStyle = 'rgba(230,180,80,0.55)'; eg.lineWidth = 3; eg.beginPath(); for (let x = 0; x <= W; x += 16) eg.lineTo(x, H * 0.5 + Math.sin(x / W * Math.PI * 2) * H * 0.22); eg.stroke();
    eg.strokeStyle = 'rgba(230,180,80,0.35)'; eg.lineWidth = 2; eg.beginPath(); for (let x = 0; x <= W; x += 16) eg.lineTo(x, H * 0.5 + Math.sin(x / W * Math.PI * 2) * H * 0.22 + 60); eg.stroke();
    eg.beginPath(); for (let x = 0; x <= W; x += 16) eg.lineTo(x, H * 0.5 + Math.sin(x / W * Math.PI * 2) * H * 0.22 - 60); eg.stroke();
    // constellations: clusters of bright stars joined by thin gold lines + faint figure ellipses
    for (let k = 0; k < 14; k++) {
      const cx = W * (0.08 + R() * 0.84), cy = H * (0.15 + R() * 0.7); const n = 5 + Math.floor(R() * 6); const pts = [];
      for (let i = 0; i < n; i++) pts.push([cx + (R() - 0.5) * 260, cy + (R() - 0.5) * 180]);
      eg.strokeStyle = 'rgba(235,190,90,0.55)'; eg.lineWidth = 1.2; eg.beginPath(); eg.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) eg.lineTo(p[0], p[1]); eg.stroke();
      for (const p of pts) { eg.fillStyle = 'rgba(255,230,160,1)'; eg.beginPath(); eg.arc(p[0], p[1], 3.2, 0, Math.PI * 2); eg.fill(); }
      // faint gold figure strokes (a few open curves, like the painted zodiac figures) — no closed scribbles
      g.strokeStyle = 'rgba(205,165,85,0.45)'; g.lineWidth = 2.2;
      for (let s2 = 0; s2 < 2; s2++) { g.beginPath(); const a0 = R() * Math.PI * 2, rr = 60 + R() * 70; g.arc(cx + (R() - 0.5) * 120, cy + (R() - 0.5) * 80, rr, a0, a0 + 1.2 + R() * 1.6); g.stroke(); }
    }
    const map = tex(c, { repeat: false }), em = tex(ec, { repeat: false });
    M.vault = std('vault', { map, emissiveMap: em, emissive: new THREE.Color(0xfff2dc), emissiveIntensity: 0.85, roughness: 0.9, metalness: 0.0, side: THREE.BackSide, color: 0xffffff });
    M.vault.userData.castShadow = false;
  }
  // ---- metals -----------------------------------------------------------------------
  M.brass = std('brass', { color: 0xc8a34f, metalness: 1.0, roughness: 0.32, envMapIntensity: 1.2 });
  M.brassDark = std('brassDark', { color: 0x8a6a30, metalness: 1.0, roughness: 0.45, envMapIntensity: 1.0 });
  M.bronze = std('bronze', { color: 0x4a3a26, metalness: 0.9, roughness: 0.5 });
  M.ironDark = std('iron', { color: 0x23262a, metalness: 0.8, roughness: 0.55 });
  M.steelGreen = std('steelGreen', { color: 0x2f4a3a, metalness: 0.6, roughness: 0.6 });
  M.stainless = std('stainless', { color: 0xb9bcc0, metalness: 1.0, roughness: 0.38, envMapIntensity: 1.1 });
  M.steelBlue = std('steelBlue', { color: 0x1f2f4a, metalness: 0.7, roughness: 0.5 });
  M.rubber = std('rubber', { color: 0x151515, roughness: 0.95, metalness: 0 });
  // ---- plaster / paint ------------------------------------------------------------
  M.plaster = std('plaster', { color: 0xd9cfb9, roughness: 0.9, metalness: 0 });
  M.plasterDark = std('plasterDark', { color: 0x8f8574, roughness: 0.92, metalness: 0 });
  M.concrete = std('concrete', { color: 0x7a7772, roughness: 0.95, metalness: 0 });
  { // grimy concrete floor map (tile = 4 m): mottled grey with dark traffic wear and litter specks
    const S = 512, [c, g] = canvas(S, S); g.fillStyle = '#8c8985'; g.fillRect(0, 0, S, S);
    const nf = noiseField(R, 128, 4); for (let y = 0; y < S; y += 4) for (let x = 0; x < S; x += 4) { const n = nf[((y >> 2) % 128) * 128 + ((x >> 2) % 128)]; g.fillStyle = `rgba(${70 + n * 90},${68 + n * 88},${64 + n * 85},0.8)`; g.fillRect(x, y, 4, 4); }
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${20 + R() * 40},${18 + R() * 35},${15 + R() * 30},${0.2 + R() * 0.5})`; g.beginPath(); g.arc(R() * S, R() * S, 1 + R() * 6, 0, 7); g.fill(); }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(200,195,185,${0.3 + R() * 0.4})`; g.fillRect(R() * S, R() * S, 2 + R() * 6, 1 + R() * 3); }
    M.grimeMap = tex(c);
  }
  M.asphalt = std('asphalt', { color: 0x2a2a2c, roughness: 0.98, metalness: 0 });
  M.ballast = std('ballast', { color: 0x4a4644, roughness: 1, metalness: 0 });
  // ---- wood (benches, tables) -------------------------------------------------------
  {
    const S = 512, [c, g] = canvas(S, S); g.fillStyle = '#6b4327'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(${40 + R() * 40},${20 + R() * 25},${10 + R() * 15},${0.25 + R() * 0.4})`; g.lineWidth = 1 + R() * 2; const y = R() * S; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= S; x += 32) g.lineTo(x, y + Math.sin(x / 60 + i) * 3); g.stroke(); }
    M.wood = std('wood', { map: tex(c), roughness: 0.55, metalness: 0 }); M.wood.userData.uv = 1;
  }
  // ---- subway tile: white 15x7.5 cm, tile = 1 m ------------------------------------
  {
    const S = 512, [c, g] = canvas(S, S); g.fillStyle = '#9a9890'; g.fillRect(0, 0, S, S);
    const tw = 76.8, th = 38.4;
    for (let j = 0; j < S / th; j++) for (let i = -1; i < S / tw + 1; i++) { const off = (j % 2) * tw / 2; const v = 225 + R() * 25; g.fillStyle = `rgb(${v},${v - 2},${v - 8})`; g.fillRect(i * tw + off + 2, j * th + 2, tw - 4, th - 4); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(i * tw + off + 4, j * th + 4, tw - 8, 6); }
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(60,50,40,${R() * 0.25})`; g.fillRect(R() * S, R() * S, 1 + R() * 4, 1 + R() * 2); }
    M.tile = std('subwayTile', { map: tex(c), roughness: 0.25, metalness: 0.0, envMapIntensity: 0.7 }); M.tile.userData.uv = 1;
    // colored band (deep green) with mosaic border
    const [bc, bg] = canvas(512, 128); bg.fillStyle = '#12442f'; bg.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 512; i += 16) for (let j = 0; j < 128; j += 16) { bg.fillStyle = `rgba(${R() * 30},${60 + R() * 40},${40 + R() * 30},0.8)`; bg.fillRect(i + 1, j + 1, 14, 14); }
    bg.fillStyle = '#b48a3c'; bg.fillRect(0, 0, 512, 12); bg.fillRect(0, 116, 512, 12);
    M.tileBand = std('tileBand', { map: tex(bc), roughness: 0.3, metalness: 0 }); M.tileBand.userData.uv = 1;
  }
  // ---- Guastavino herringbone tile (gallery vaults, Oyster Bar) tile = 1 m -----------
  {
    const S = 512, [c, g] = canvas(S, S); g.fillStyle = '#7d6a54'; g.fillRect(0, 0, S, S);
    const tw = 64, th = 22;
    for (let j = 0; j < S / th + 2; j++) for (let i = -2; i < S / tw + 2; i++) {
      const v = 190 + R() * 45; g.fillStyle = `rgb(${v},${v - 25},${v - 60})`;
      g.save(); g.translate(i * tw + (j % 2) * tw / 2, j * th); g.rotate(j % 2 ? 0.35 : -0.35); g.fillRect(0, 0, tw - 3, th - 3); g.restore();
    }
    M.guastavino = std('guastavino', { map: tex(c), roughness: 0.6, metalness: 0 }); M.guastavino.userData.uv = 1;
  }
  // ---- terrazzo (dining floor) tile = 2 m -----------------------------------------
  {
    const S = 512, [c, g] = canvas(S, S); g.fillStyle = '#a99a86'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 6000; i++) { const t = R(); g.fillStyle = t < 0.4 ? '#d9cbb4' : t < 0.7 ? '#6d5a4a' : '#8a3f34'; g.beginPath(); g.arc(R() * S, R() * S, 1 + R() * 3, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(60,50,40,0.6)'; g.lineWidth = 3; g.strokeRect(1, 1, S - 2, S - 2);
    M.terrazzo = std('terrazzo', { map: tex(c), roughness: 0.35, metalness: 0, envMapIntensity: 0.6 }); M.terrazzo.userData.uv = 0.5;
  }
  // ---- daylight window glass (unlit, HDR-bright, mullion grid) ----------------------
  {
    const W = 512, H = 1024, [c, g] = canvas(W, H);
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#dff1ff'); gr.addColorStop(0.45, '#f7f4e6'); gr.addColorStop(1, '#cfe3f2'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = '#2a2418';
    for (let x = 0; x <= W; x += 64) g.fillRect(x - 3, 0, 6, H);
    for (let y = 0; y <= H; y += 64) g.fillRect(0, y - 3, W, 6);
    for (let x = 0; x <= W; x += 16) g.fillRect(x - 1, 0, 2, H);
    for (let y = 0; y <= H; y += 21) g.fillRect(0, y - 1, W, 2);
    const t = tex(c, { repeat: true });
    M.glass = new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(2.6, 2.4, 2.1), toneMapped: true, side: THREE.DoubleSide }); M.glass.name = 'glass'; M.glass.userData.castShadow = false; M.glass.userData.uv = 1 / 4;
    M.glassDim = new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1.1, 1.1, 1.05), toneMapped: true, side: THREE.DoubleSide }); M.glassDim.name = 'glassDim'; M.glassDim.userData.castShadow = false; M.glassDim.userData.uv = 1 / 4;
  }
  // ---- bulb strip (emissive, warm) --------------------------------------------------
  M.bulb = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, 3.2, 1.6), toneMapped: true }); M.bulb.name = 'bulb'; M.bulb.userData.castShadow = false;
  M.fluor = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.9, 3.2), toneMapped: true }); M.fluor.name = 'fluor'; M.fluor.userData.castShadow = false;
  M.lampGlass = std('lampGlass', { color: 0xfff1cc, emissive: 0xffc77a, emissiveIntensity: 3.5, roughness: 0.4, metalness: 0, transparent: true, opacity: 0.9 }); M.lampGlass.userData.castShadow = false;
  M.shopGlow = std('shopGlow', { color: 0xf3dcb0, emissive: 0xffd9a0, emissiveIntensity: 0.9, roughness: 0.8, metalness: 0 }); M.shopGlow.userData.castShadow = false;
  M.clockFace = std('clockFace', { color: 0xfff6e6, emissive: 0xffe6b8, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0 });
  M.darkGlass = std('darkGlass', { color: 0x0e1418, roughness: 0.08, metalness: 0.9, envMapIntensity: 1.3 });
  M.trainWindow = std('trainWindow', { color: 0x1a2530, roughness: 0.1, metalness: 0.6, emissive: 0x4a5560, emissiveIntensity: 0.6 });
  M.redSeat = std('redSeat', { color: 0xa8451f, roughness: 0.7, metalness: 0 });
  M.blueSeat = std('blueSeat', { color: 0x2b4670, roughness: 0.7, metalness: 0 });
  M.shutter = std('shutter', { color: 0x6b6f72, metalness: 0.7, roughness: 0.5 });

  // ---- departure board (canvas) -----------------------------------------------------
  M.board = (title = 'DEPARTURES') => {
    const W = 1024, H = 512, [c, g] = canvas(W, H); g.fillStyle = '#0b0d10'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e6c26a'; g.font = 'bold 44px "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'left'; g.fillText(title, 30, 60);
    g.fillStyle = '#9fb3c8'; g.font = '22px "Helvetica Neue", Arial'; g.fillText('TIME     DESTINATION                    TRACK   STATUS', 30, 100);
    const dest = ['NEW HAVEN', 'STAMFORD', 'WHITE PLAINS', 'POUGHKEEPSIE', 'CROTON-HARMON', 'NORTH WHITE PLAINS', 'WASSAIC', 'SOUTHEAST', 'NEW CANAAN', 'DANBURY', 'BRIDGEPORT', 'HARLEM-125 ST'];
    for (let i = 0; i < 12; i++) {
      const y = 140 + i * 30; const hh = 9 + Math.floor(i / 4), mm = (i * 17 + 5) % 60;
      g.fillStyle = '#e8b64a'; g.font = 'bold 22px "Courier New", monospace'; g.fillText(`${hh}:${mm < 10 ? '0' : ''}${mm}`, 30, y);
      g.fillStyle = '#f2ecd8'; g.fillText(dest[i], 150, y);
      g.fillStyle = '#7fd7e6'; g.fillText(String(11 + i * 2), 620, y);
      g.fillStyle = i % 5 === 3 ? '#e07a4a' : '#7be07a'; g.fillText(i % 5 === 3 ? 'DELAYED' : i % 3 === 0 ? 'BOARDING' : 'ON TIME', 740, y);
    }
    const m = std('board', { map: tex(c, { repeat: false }), emissiveMap: null, emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.4, metalness: 0.2 });
    m.emissiveMap = m.map; m.emissiveIntensity = 1.6; m.color.setRGB(0.2, 0.2, 0.2);
    return m;
  };
  // ---- mosaic station name tablet -------------------------------------------------
  M.mosaic = (text = 'GRAND CONCOURSE', sub = '42 ST') => {
    const W = 1024, H = 256, [c, g] = canvas(W, H); g.fillStyle = '#e9e4d6'; g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 12) for (let y = 0; y < H; y += 12) { const v = 215 + R() * 35; g.fillStyle = `rgb(${v},${v - 4},${v - 14})`; g.fillRect(x + 1, y + 1, 10, 10); }
    g.fillStyle = '#1c5a3c'; g.fillRect(0, 0, W, 26); g.fillRect(0, H - 26, W, 26); g.fillRect(0, 0, 26, H); g.fillRect(W - 26, 0, 26, H);
    g.fillStyle = '#b78a34'; g.fillRect(26, 26, W - 52, 6); g.fillRect(26, H - 32, W - 52, 6);
    g.fillStyle = '#12301f'; g.font = 'bold 92px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, W / 2, H / 2 - 18);
    g.font = 'bold 40px Georgia, serif'; g.fillText(sub, W / 2, H / 2 + 62);
    const m = std('mosaic', { map: tex(c, { repeat: false }), roughness: 0.35, metalness: 0 }); return m;
  };
  // ---- generic sign (gold on black / black on cream) ------------------------------
  M.sign = (text, { bg = '#111', fg = '#e6c26a', w = 1024, h = 128, font = 'bold 72px Georgia, serif' } = {}) => {
    const [c, g] = canvas(w, h); g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2);
    const m = std('sign', { map: tex(c, { repeat: false }), roughness: 0.5, metalness: 0.1 }); return m;
  };
  M.poster = (i = 0) => {
    const W = 256, H = 256, [c, g] = canvas(W, H); const pal = [['#1d3f73', '#f2c14e'], ['#7a1f2b', '#f4ede0'], ['#0f5e4a', '#e8e2cf'], ['#333', '#ff7a3d'], ['#2b6ca3', '#ffffff'], ['#5b3a7a', '#f0d36b']][i % 6];
    g.fillStyle = pal[0]; g.fillRect(0, 0, W, H); g.fillStyle = pal[1];
    for (let k = 0; k < 5; k++) { g.globalAlpha = 0.25 + R() * 0.5; g.beginPath(); g.arc(R() * W, R() * H * 0.7, 20 + R() * 60, 0, 7); g.fill(); }
    g.globalAlpha = 1; g.fillRect(16, H - 70, W - 32, 3); g.font = 'bold 26px Helvetica, Arial, sans-serif'; g.textAlign = 'left'; g.fillText(['SEE MORE OF THE CITY', 'RIDE SAFE · STAND CLEAR', 'SUMMER CONCERTS', 'MUSEUM NIGHTS', 'THE NEW LINE OPENS', 'FRESH EVERY MORNING'][i % 6].slice(0, 20), 16, H - 40);
    g.font = '14px Helvetica, Arial'; g.fillText('a message from the city', 16, H - 18);
    const m = std('poster', { map: tex(c, { repeat: false }), roughness: 0.6, metalness: 0 }); return m;
  };
  M.rollSign = (text) => {
    const [c, g] = canvas(256, 64); g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#f0f0e8'; g.font = 'bold 40px Helvetica, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 32);
    const m = new THREE.MeshBasicMaterial({ map: tex(c, { repeat: false }), color: new THREE.Color(1.6, 1.6, 1.6) }); m.name = 'rollSign'; return m;
  };
  return M;
}
