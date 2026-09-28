// The bag (I, or the 🎒 button on touch): everything on you in one panel, by category. Guns (the weapon bag, 1–9) and the
// knife, then smokes (weed, spliffs, cigs, vapes), lighters, booze, drinks, food, loot. Tap a gun to draw it; items can be
// used (same as B, but the one you pick) or dropped. Mounted by hangkit.buildKit on every hangout map. Owned by: main.
import { ITEMS } from './hangkit.js';

const CATS = [['smoke', 'Smokes'], ['tool', 'Lighters'], ['booze', 'Booze'], ['drink', 'Drinks'], ['food', 'Food'], ['loot', 'Loot'], ['trip', 'Trips'], ['misc', 'Other']];
let I = null;

export function mountInventory(ctx, K) {
  if (I) { I.ctx = ctx; I.K = K; return; }
  const root = document.createElement('div'); root.className = 'inv-panel'; root.style.display = 'none'; document.body.appendChild(root);
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const btn = document.createElement('button'); btn.className = 'inv-btn'; btn.textContent = '🎒'; btn.title = 'Bag (I)';
  if (ctx.isTouch) document.body.appendChild(btn);
  I = { ctx, K, root, btn, open: false };
  ctx.bus.on('inventory', () => { if (I.ctx.state === 'playing') toggle(); });   // hangkit's BAG button on phones
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); toggle(); }, { passive: false });
  root.addEventListener('click', onClick); root.addEventListener('touchend', (e) => { const t = e.target.closest('[data-a]'); if (t) { e.preventDefault(); onClick(e); } });
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyI' && !e.repeat && I.ctx.state === 'playing' && !I.ctx.durakOpen && !document.querySelector('.hkui.dialog')) { e.preventDefault(); toggle(); }
    else if (I.open && e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); toggle(false); }
  }, true);
  I.ctx.bus.on('state', ({ state }) => { if (state !== 'playing') toggle(false); btn.style.display = state === 'playing' ? '' : 'none'; });
  // the weapon strip: every gun you carry, always on screen — click / tap to draw it (1–9 on a keyboard), BAG opens the rest
  const strip = document.createElement('div'); strip.className = 'inv-strip' + (ctx.isTouch ? ' touch' : ''); document.body.appendChild(strip); I.strip = strip; let sig = '';
  strip.addEventListener('click', (e) => { const t = e.target.closest('[data-g]'); if (!t) return; e.stopPropagation(); if (t.dataset.g === 'bag') toggle(true); else I.ctx.weapons?.selectBag?.(+t.dataset.g); });
  strip.addEventListener('touchstart', (e) => { const t = e.target.closest('[data-g]'); if (!t) return; e.preventDefault(); e.stopPropagation(); if (t.dataset.g === 'bag') toggle(true); else I.ctx.weapons?.selectBag?.(+t.dataset.g); }, { passive: false });
  setInterval(() => { const W = I.ctx.weapons; let bag = []; try { bag = W?.bag || []; } catch {} const cur = W?.currentId, show = I.ctx.state === 'playing' && !I.open;
    const n = bag.map((id, i) => `${i}:${id}:${id === cur ? 1 : 0}`).join(',') + show; if (n === sig) return; sig = n; strip.style.display = show ? 'flex' : 'none';
    strip.innerHTML = bag.map((id, i) => `<button data-g="${i}" class="${id === cur ? 'on' : ''}"><b>${i + 1}</b>${esc(String(id).toUpperCase().replace('AK74', 'AK').replace('M24', 'SNIPER'))}</button>`).join('') + `<button data-g="bag" class="bag">🎒 BAG${I.ctx.isTouch ? '' : ' (I)'}</button>`; }, 350);
  window.__game && (window.__game.inventory = { open: () => toggle(true), close: () => toggle(false), state: () => ({ open: I.open, html: root.textContent }) });
}

function toggle(v = !I.open) {
  I.open = v; I.root.style.display = v ? 'flex' : 'none';
  if (v) { try { document.exitPointerLock?.(); } catch {} render(); } else if (I.ctx.state === 'playing') { try { I.ctx.requestPointerLock?.(); } catch {} }
}

function render() {
  const { ctx, K } = I, s = K.state?.() || { inv: [], cash: 0 }, W = ctx.weapons;
  const bag = (() => { try { return W?.bag || []; } catch { return []; } })(), cur = W?.currentId;
  const guns = bag.map((id, i) => `<button class="row gun${id === cur ? ' on' : ''}" data-a="gun" data-i="${i}"><b>${i + 1}</b><span>${esc(String(id).toUpperCase())}</span><em>${id === cur ? 'in hand' : 'draw'}</em></button>`).join('')
    + (bag.some((id) => /knife/i.test(id)) ? '' : `<div class="row"><b>V</b><span>🔪 Knife</span><em>quick stab</em></div>`);
  const count = {}; for (const it of s.inv) count[it] = (count[it] || 0) + 1;
  const sect = CATS.map(([k, t]) => {
    const rows = Object.keys(count).filter((it) => (ITEMS[it]?.kind || 'misc') === k).map((it) => {
      const sp = ITEMS[it] || {}, left = sp.cig ? ` · ${K.left?.(it) || sp.cig} left` : '';
      return `<div class="row"><b>${sp.icon || '?'}</b><span>${esc(sp.name || it)}${count[it] > 1 ? ` ×${count[it]}` : ''}<small>${left}</small></span>${sp.keep ? '' : `<button data-a="use" data-k="${it}">Use</button>`}<button class="ghost" data-a="drop" data-k="${it}">Drop</button></div>`;
    }).join('');
    return rows ? `<h3>${t}</h3>${rows}` : '';
  }).join('');
  I.root.innerHTML = `<div class="inv-box"><header><h2>BAG</h2><span>$${s.cash} · ${s.inv.length}/12</span><button class="ghost" data-a="close">✕</button></header>
    <h3>Weapons</h3>${guns}${sect || '<p class="empty">Nothing else on you. The hustlers on the beach sell smokes, lighters and booze.</p>'}
    <footer>${ctx.isTouch ? 'tap a gun to draw it' : 'I / Esc close · 1–9 guns · B uses the last item'}</footer></div>`;
}

function onClick(e) {
  const t = e.target.closest('[data-a]'); if (!t) return; const a = t.dataset.a, { K, ctx } = I;
  if (a === 'close') return toggle(false);
  if (a === 'gun') { ctx.weapons?.selectBag?.(+t.dataset.i); return toggle(false); }
  if (a === 'use') { K.useItem?.(t.dataset.k); return toggle(false); }
  if (a === 'drop') { if (K.drop?.(t.dataset.k)) ctx.hud?.toast?.(`Dropped the ${ITEMS[t.dataset.k]?.name || t.dataset.k}`, 1400); render(); }
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const CSS = `
.inv-panel{position:fixed;inset:0;z-index:58;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);font:500 14px Barlow,Arial;color:#f1eee6}
.inv-box{width:min(420px,calc(100vw - 32px));max-height:calc(100vh - 40px);overflow:auto;background:rgba(18,20,22,.94);border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:14px 16px}
.inv-box header{display:flex;align-items:center;gap:10px}.inv-box h2{margin:0;font:700 20px 'Barlow Condensed',Arial;letter-spacing:.2em}.inv-box header span{flex:1;opacity:.75}
.inv-box h3{margin:12px 0 4px;font:700 12px Barlow;letter-spacing:.14em;text-transform:uppercase;opacity:.6}
.inv-box .row{display:flex;align-items:center;gap:8px;width:100%;padding:7px 8px;border-radius:6px;background:rgba(255,255,255,.05);margin:3px 0;color:inherit;font:inherit;border:0;text-align:left}
.inv-box .row b{width:22px;text-align:center}.inv-box .row span{flex:1}.inv-box .row small{opacity:.6;margin-left:4px}.inv-box .row em{font-style:normal;opacity:.6;font-size:12px}
.inv-box .row.gun{cursor:pointer}.inv-box .row.gun.on{background:rgba(212,170,70,.25)}
.inv-box button[data-a]:not(.row){padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.3);background:rgba(212,170,70,.9);color:#111;font:700 12px Barlow;cursor:pointer}
.inv-box button.ghost{background:transparent;color:#f1eee6}.inv-box .empty{opacity:.65}.inv-box footer{margin-top:10px;font-size:12px;opacity:.55}
.inv-strip{position:fixed;right:22px;bottom:150px;z-index:41;display:none;gap:4px;font:700 11px 'Barlow Condensed',Arial;letter-spacing:.08em}.inv-strip.touch{top:108px;bottom:auto;right:10px;flex-direction:column}
.inv-strip button{display:flex;gap:4px;align-items:center;padding:5px 8px;border-radius:5px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.5);color:#e8e6df;font:inherit;cursor:pointer}.inv-strip button b{opacity:.6}.inv-strip button.on{background:rgba(212,170,70,.85);color:#111}.inv-strip button.bag{background:rgba(40,90,60,.75)}
.inv-btn{position:fixed;left:calc(env(safe-area-inset-left,0px) + 14px);top:calc(env(safe-area-inset-top,0px) + 200px);z-index:40;width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:rgba(0,0,0,.45);font-size:20px}
`;
