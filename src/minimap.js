// Maps: a minimap (top-left, rotates with you) and a full-screen map (M; tap the minimap on phones). The background is the map
// itself, rendered once from straight above (orthographic, fog / sky / far horizon layers hidden) the first time you play,
// tone-mapped on the CPU and stored as an image; maps may add crisp street centrelines (W.mapRoads [{p, w}]), street labels
// (W.mapLabels [{t, x, z, r}]) and points of interest (W.mapPOIs [{name, x, z, kind}]). Live markers: you (arrow), friends
// (blue + name), mercenaries / cops (red), chill-mode gopniks (orange), vendors (yellow), bikes (green).
import * as THREE from 'three';
import { kit } from './world/hangkit.js';

let M = null;
const KIND = { park: ['#7fd08a', '▲'], shop: ['#ffd27a', '$'], ride: ['#ff8ad1', '✦'], transit: ['#8ac7ff', 'Ⓜ'], landmark: ['#e8e2d0', '●'], danger: ['#ff6a5a', '!'], road: ['#9fe39a', '➜'] };

export function init(ctx) {
  const css = document.createElement('style'); css.textContent = `
  .zvmini{position:fixed;left:calc(env(safe-area-inset-left,0px) + 14px);top:calc(env(safe-area-inset-top,0px) + 58px);z-index:39;border-radius:50%;box-shadow:0 0 0 2px rgba(255,255,255,.25),0 4px 18px rgba(0,0,0,.45);background:rgba(10,12,16,.6);cursor:pointer}
  .zvbig{position:fixed;inset:0;z-index:57;display:none;align-items:center;justify-content:center;background:rgba(4,6,9,.78);backdrop-filter:blur(2px)}
  .zvbig.on{display:flex}.zvbig canvas{box-shadow:0 10px 40px rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.18);max-width:96vw;max-height:92vh}
  .zvbig .k{position:absolute;right:18px;bottom:14px;font:600 12px Barlow,Arial;color:#cfd6dd;letter-spacing:.12em}
  .zvbig .h{position:absolute;left:50%;top:12px;transform:translateX(-50%);font:700 18px 'Barlow Condensed',Arial;letter-spacing:.3em;color:#fff}`;
  document.head.appendChild(css);
  const size = ctx.isTouch ? 118 : 172;
  const mini = document.createElement('canvas'); mini.className = 'zvmini'; mini.width = mini.height = size * 2; mini.style.width = mini.style.height = size + 'px'; mini.style.display = 'none'; document.body.appendChild(mini);
  const big = document.createElement('div'); big.className = 'zvbig'; big.innerHTML = '<div class="h"></div><canvas></canvas><div class="k">M · close</div>'; document.body.appendChild(big);
  M = { ctx, mini, mctx: mini.getContext('2d'), size, big, bcan: big.querySelector('canvas'), img: null, shotAt: 0, frame: 0, open: false };
  const toggle = () => { M.open = !M.open; big.classList.toggle('on', M.open); if (M.open) { big.querySelector('.h').textContent = (ctx.world?.maps?.find((m) => m.id === ctx.world?.mapId)?.name || 'MAP').toUpperCase(); drawBig(); } };
  addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !e.repeat && (ctx.state === 'playing' || M.open) && !document.querySelector('.hkdlg.on') && !document.querySelector('.zvon.on')) { toggle(); } if (e.code === 'Escape' && M.open) toggle(); });
  mini.addEventListener('click', (e) => { e.stopPropagation(); toggle(); }); mini.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); toggle(); }, { passive: false });
  big.addEventListener('click', () => { if (M.open) toggle(); }); big.addEventListener('touchstart', (e) => { e.preventDefault(); if (M.open) toggle(); }, { passive: false });
  ctx.bus.on('state', ({ state }) => {
    mini.style.display = state === 'playing' && M.img ? 'block' : 'none';
    if (state === 'playing' && !M.img && !M.pending) { M.pending = true; setTimeout(() => { try { snapshot(); } catch (e) { console.warn('[map] snapshot', e); } M.pending = false; mini.style.display = ctx.state === 'playing' ? 'block' : 'none'; }, 1500); }
  });
  return { toggle, get open() { return M.open; }, snapshot: () => snapshot(), qa: () => ({ img: !!M.img, w: M.img?.width, h: M.img?.height }) };
}

// ---------------------------------------------------------------------------------------------------------------------------
// the background: the world from above
function snapshot() {
  const { ctx } = M; const W = ctx.world, b = W?.bounds; if (!b) return;
  const w = b.max.x - b.min.x, d = b.max.z - b.min.z, cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
  const res = ctx.isTouch ? 1024 : 2048, RW = w >= d ? res : Math.round(res * w / d), RH = w >= d ? Math.round(res * d / w) : res;
  const cam = new THREE.OrthographicCamera(-w / 2, w / 2, d / 2, -d / 2, 1, 4000); cam.position.set(cx, 1500, cz); cam.up.set(0, 0, -1); cam.lookAt(cx, 0, cz); cam.updateMatrixWorld(true);
  const scene = ctx.scene, R = ctx.renderer, hidden = [];
  scene.traverse((o) => { if (o === scene || !o.visible) return; const n = o.name || '';
    if (o === ctx.camera || o.isSprite || o.isPoints || /far|sky|dome|horizon|cloud|star|moon|sun|firework|rain/i.test(n) || (o.isMesh && o.renderOrder < 0) || (o.isMesh && o.material && (o.material.depthTest === false))) { hidden.push(o); o.visible = false; } });
  const fog = scene.fog, bg = scene.background; scene.fog = null; scene.background = new THREE.Color(0x0e1a24);
  const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType });
  const prevT = R.getRenderTarget(); R.setRenderTarget(rt); R.clear(); R.render(scene, cam); R.setRenderTarget(prevT);
  for (const o of hidden) o.visible = true; scene.fog = fog; scene.background = bg;
  const buf = new Uint16Array(RW * RH * 4); R.readRenderTargetPixels(rt, 0, 0, RW, RH, buf); rt.dispose();
  const c = document.createElement('canvas'); c.width = RW; c.height = RH; const g = c.getContext('2d'); const img = g.createImageData(RW, RH);
  const f16 = (h) => { const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff; return e === 0 ? s * Math.pow(2, -14) * (m / 1024) : e === 31 ? 0 : s * Math.pow(2, e - 15) * (1 + m / 1024); };
  const exp = 1.25;
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
    const si = ((RH - 1 - y) * RW + x) * 4, di = (y * RW + x) * 4;   // read is bottom-up
    for (let k = 0; k < 3; k++) { let v = Math.max(0, f16(buf[si + k])) * exp; v = v / (1 + v); v = Math.pow(v, 1 / 2.2); img.data[di + k] = Math.min(255, v * 255); }
    img.data[di + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // map style: a touch darker + desaturated so the markers and labels pop
  g.globalCompositeOperation = 'saturation'; g.fillStyle = 'rgba(128,128,128,0.35)'; g.fillRect(0, 0, RW, RH); g.globalCompositeOperation = 'source-over';
  g.fillStyle = 'rgba(8,12,18,0.22)'; g.fillRect(0, 0, RW, RH);
  // crisp streets on top
  const px = (x) => (x - b.min.x) / w * RW, pz = (z) => (z - b.min.z) / d * RH, sc = RW / w;
  if (Array.isArray(W.mapRoads)) { g.lineCap = g.lineJoin = 'round';
    for (const pass of [0, 1]) for (const r of W.mapRoads) { if (!r.p?.length) continue; g.beginPath(); r.p.forEach(([x, z], i) => (i ? g.lineTo(px(x), pz(z)) : g.moveTo(px(x), pz(z)))); g.lineWidth = Math.max(1.2, (r.w || 8) * sc) + (pass ? 0 : 2.5 * sc); g.strokeStyle = pass ? 'rgba(214,218,222,0.78)' : 'rgba(20,24,30,0.55)'; g.stroke(); } }
  M.img = c; M.map = { b, w, d, RW, RH, px, pz };
  console.log('[map] snapshot', RW, 'x', RH);
}

// ---------------------------------------------------------------------------------------------------------------------------
export function update(dt, ctx) {
  if (!M?.img) return; M.frame++;
  if (M.open) { if (M.frame % 3 === 0) drawBig(); return; }
  if (ctx.state === 'playing' && M.frame % 3 === 0) drawMini();
}
function markers() {
  const { ctx } = M; const out = { enemies: [], thugs: [], friends: [], bikes: [], vendors: [] };
  for (const s of ctx.ai?.soldiers || []) if (s && !s.dead && s.position) out.enemies.push([s.position.x, s.position.z, !!s.brain]);
  const th = ctx.world?.mapThugs?.(); if (th) out.thugs = th;
  const net = ctx.net; if (net?.list) for (const id of net.list()) { const q = net.peer(id); if (q?.pos) out.friends.push([q.pos.x, q.pos.z, q.name || '', q.dead]); }
  for (const v of ctx.vehicles?.list || []) if (v !== ctx.vehicles.mounted && v.pos) out.bikes.push([v.pos.x, v.pos.z, !!v.spec?.car]);
  const K = kit(); if (K) for (const v of K.vendors) out.vendors.push([v.pos.x, v.pos.z, v.name]);
  return out;
}
function drawMarkers(g, P, scale, rot = 0, big = false) {
  const { ctx } = M; const mk = markers();
  const dot = (x, z, r, fill, stroke = 'rgba(0,0,0,.6)') => { const [u, v] = P(x, z); g.beginPath(); g.arc(u, v, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); g.lineWidth = 1.5; g.strokeStyle = stroke; g.stroke(); return [u, v]; };
  const label = (u, v, t, col, fs) => { g.save(); g.font = `700 ${fs}px Barlow Condensed, Arial`; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(t, u, v); g.fillStyle = col; g.fillText(t, u, v); g.restore(); };
  const k = big ? 1 : 2;   // minimap canvas is 2x
  for (const [x, z, car] of mk.bikes) { const [u, v] = P(x, z); g.fillStyle = car ? '#6fd08a' : '#9fe39a'; g.fillRect(u - 3 * k, v - 3 * k, 6 * k, 6 * k); }
  for (const [x, z, n] of mk.vendors) { const [u, v] = dot(x, z, 4.5 * k, '#ffd27a'); if (big) label(u, v - 9, n, '#ffd27a', 12); }
  for (const [x, z, cop] of mk.enemies) dot(x, z, 4 * k, cop ? '#b36bff' : '#ff4a3a', '#2a0000');
  for (const [x, z] of mk.thugs) dot(x, z, 4 * k, '#ff9a3a', '#2a1000');
  for (const [x, z, n, dead] of mk.friends) { const [u, v] = dot(x, z, 5 * k, dead ? '#667' : '#4aa3ff', '#fff'); if (big) label(u, v - 10, n, '#cfe3ff', 13); else label(u, v - 12, n, '#cfe3ff', 20); }
  // you: an arrow along your view
  const p = ctx.player; if (p) { const [u, v] = P(p.position.x, p.position.z); g.save(); g.translate(u, v); g.rotate(rot - p.yaw); g.beginPath(); const s = 9 * k; g.moveTo(0, -s); g.lineTo(s * 0.7, s * 0.8); g.lineTo(0, s * 0.35); g.lineTo(-s * 0.7, s * 0.8); g.closePath(); g.fillStyle = '#ffd23b'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#000'; g.stroke(); g.restore(); }
}
function drawMini() {
  const { ctx, mctx: g, mini } = M; const S = mini.width, R = S / 2, p = ctx.player; if (!p) return;
  const m = M.map, view = 240;   // metres across
  const k = S / view, rot = p.yaw;   // heading up
  g.clearRect(0, 0, S, S); g.save(); g.beginPath(); g.arc(R, R, R - 2, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#0e1a24'; g.fillRect(0, 0, S, S);
  g.translate(R, R); g.rotate(rot); g.scale(k, k);
  const imgScale = m.w / m.RW; g.drawImage(M.img, 0, 0, m.RW, m.RH, m.b.min.x - p.position.x, m.b.min.z - p.position.z, m.RW * imgScale, m.RH * imgScale);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const P = (x, z) => { const dx = x - p.position.x, dz = z - p.position.z, c = Math.cos(rot), s = Math.sin(rot); return [R + (dx * c - dz * s) * k, R + (dx * s + dz * c) * k]; };
  drawMarkers(g, P, k, rot, false);
  g.restore();
  // north tick
  const na = rot; g.save(); g.translate(R, R); g.rotate(na); g.fillStyle = '#fff'; g.font = '700 22px Barlow Condensed, Arial'; g.textAlign = 'center'; g.fillText('N', 0, -R + 24); g.restore();
  g.beginPath(); g.arc(R, R, R - 2, 0, Math.PI * 2); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.35)'; g.stroke();
}
function drawBig() {
  if (!M.img) return; const { ctx, bcan: c } = M; const m = M.map, W = ctx.world;
  const maxW = innerWidth * 0.96, maxH = innerHeight * 0.88, sc = Math.min(maxW / m.RW, maxH / m.RH), CW = Math.round(m.RW * sc), CH = Math.round(m.RH * sc), dpr = Math.min(2, devicePixelRatio || 1);
  if (c.width !== CW * dpr) { c.width = CW * dpr; c.height = CH * dpr; c.style.width = CW + 'px'; c.style.height = CH + 'px'; }
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.drawImage(M.img, 0, 0, CW, CH);
  const P = (x, z) => [(x - m.b.min.x) / m.w * CW, (z - m.b.min.z) / m.d * CH];
  const label = (u, v, t, col, fs, rot = 0, weight = 700) => { g.save(); g.translate(u, v); g.rotate(rot); g.font = `${weight} ${fs}px Barlow Condensed, Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 3.5; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(t, 0, 0); g.fillStyle = col; g.fillText(t, 0, 0); g.restore(); };
  for (const L of W?.mapLabels || []) { const [u, v] = P(L.x, L.z); label(u, v, L.t, L.col || '#e9eef2', L.fs || 14, L.r || 0, 600); }
  for (const q of W?.mapPOIs || []) { const [col, icon] = KIND[q.kind] || KIND.landmark; const [u, v] = P(q.x, q.z);
    g.beginPath(); g.arc(u, v, 8, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,.65)'; g.fill(); g.lineWidth = 2; g.strokeStyle = col; g.stroke();
    g.font = '700 11px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col; g.fillText(icon, u, v + 0.5); label(u, v + 16, q.name, col, 13); }
  drawMarkers(g, P, 1, 0, true);
  // legend
  const items = [['#ffd23b', 'YOU'], ['#4aa3ff', 'FRIENDS'], ['#ff4a3a', 'MERCS'], ['#b36bff', 'COPS'], ['#ff9a3a', 'GOPNIKS'], ['#ffd27a', 'VENDORS'], ['#9fe39a', 'BIKES / CARS']];
  g.save(); g.fillStyle = 'rgba(6,8,12,.72)'; g.fillRect(10, 10, 118, items.length * 18 + 12); items.forEach(([col, t], i) => { g.fillStyle = col; g.beginPath(); g.arc(24, 24 + i * 18, 5, 0, Math.PI * 2); g.fill(); g.fillStyle = '#e8edf2'; g.font = '600 12px Barlow, Arial'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(t, 36, 24 + i * 18); }); g.restore();
}
