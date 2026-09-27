// Character picker (pause menu → Character, or first time in chill mode): play as one of Arkasha's crew or REDKO. One player
// per character: a pick is broadcast ('look', re-sent every 8 s) and the picker greys out what friends hold (same pick at
// once: the lower id keeps it). Picking spawns you at Arkasha's table and that character's NPC there stands down. FELIKS
// comes with mushrooms, and anyone who walks up to a Feliks player can buy some. Owned by: main.
import * as THREE from 'three';
import { CHARS, setRemoteChar, looks } from './outfits.js';
import { hangkit as K } from './hangkit.js';

const KEY = 'zavod.char';
let S = null;
export const myChar = () => { try { const c = localStorage.getItem(KEY); return CHARS[c] ? c : 'redko'; } catch { return 'redko'; } };

export function mountCharSelect(ctx) {
  if (S) { S.ctx = ctx; hookKit(ctx); return; } S = { ctx, root: null, felPos: new THREE.Vector3(), felId: null };
  const W = () => ctx.world?.W || ctx.world || {};
  ctx.bus.on('net:look', (m) => {
    if (!m || typeof m.c !== 'string' || !/^[a-z0-9]{8}$/.test(m.f || '')) return;
    setRemoteChar(m.f, m.c, ctx);
    if (m.c === myChar() && m.c !== 'redko' && m.f < (ctx.net?.id || '')) { ctx.hud?.toast?.(`${ctx.net?.peer?.(m.f)?.name || 'A friend'} is already ${CHARS[m.c].name}: pick someone else`, 2600); try { localStorage.setItem(KEY, 'redko'); } catch {} open(); }
  });
  ctx.bus.on('net:shroompaid', (m) => { if (m?.to !== ctx.net?.id) return; ctx.hud?.toast?.(`You hooked ${ctx.net?.peer?.(m.f)?.name || 'someone'} up with mushrooms and weed`, 2000); });
  ctx.bus.on('charSelect', () => open());
  setInterval(() => { try { if (ctx.net?.connected) ctx.net.send('look', { c: myChar() }); } catch {} }, 8000);
  setInterval(() => crewSync(W()), 1000);
  hookKit(ctx);
  try { if (ctx.mode === 'chill' && !localStorage.getItem(KEY)) setTimeout(() => ctx.state === 'playing' && open(), 2500); } catch {}
  window.__game && (window.__game.charSelect = { open, pick, mine: myChar, taken: () => [...taken().entries()], dbg: () => ({ felId: S.felId, felPos: S.felPos.toArray(), mine: myChar() }) });
}

/** per-kit hooks (the kit is rebuilt with the map, so these are re-registered on every mount) */
function hookKit(ctx) {
  // a Feliks player hands out mushrooms and weed, free (once a minute per person)
  let lastGift = -Infinity;
  K.spot?.({ pos: S.felPos, r: 4, when: () => !!S.felId, prompt: () => (performance.now() - lastGift < 60000 ? 'FELIKS: "Pace yourself, man."' : 'F — FELIKS: FREE MUSHROOMS + WEED'), act: () => {
    if (performance.now() - lastGift < 60000) return; if (K.full?.()) return ctx.hud?.toast?.('Pockets full', 1400);
    lastGift = performance.now(); K.give('shrooms'); K.give('weed'); ctx.net?.send?.('shroompaid', { to: S.felId }); ctx.hud?.toast?.('FELIKS: "On the house. Two minutes, full send. B to use."', 2400); } });
  K.onUpdate?.(() => { S.felId = null; const me = ctx.player?.position; if (!me || myChar() === 'feliks') return; for (const [pid, c] of looks()) { if (c !== 'feliks') continue; const q = ctx.net?.peer?.(pid); if (q?.pos && q.pos.distanceTo(me) < 4) { S.felPos.copy(q.pos); S.felId = pid; return; } } });
}
/** who holds which character: me + every peer still in the room */
function taken() {
  const t = new Map(), live = new Set(S.ctx.net?.list?.() || []);
  for (const [pid, c] of looks()) { if (!live.has(pid)) { looks().delete(pid); continue; } if (c !== 'redko') t.set(c, pid); }
  if (myChar() !== 'redko') t.set(myChar(), S.ctx.net?.id || 'me');
  return t;
}
function crewSync(W) {
  const t = taken(); for (const [id, e] of Object.entries(W.crew || {})) { if (!e) continue; const hide = t.has(id);
    if (hide !== !!e._claimed) { e._claimed = hide; e.off = hide; if (e.fig?.group) e.fig.group.visible = !hide; } }
}
function pick(id) {
  if (!CHARS[id]) return; const holder = taken().get(id);
  if (holder && holder !== (S.ctx.net?.id || 'me')) { S.ctx.hud?.toast?.(`${S.ctx.net?.peer?.(holder)?.name || 'A friend'} is already ${CHARS[id].name}`, 2000); return; }
  try { localStorage.setItem(KEY, id); } catch {}
  try { S.ctx.net?.send?.('look', { c: id }); } catch {}
  const W = S.ctx.world?.W || S.ctx.world || {}; crewSync(W);
  const T = W.arkadyTable; if (T) { const off = { arkasha: [0, -1.05], sasha: [3.2, -2.35], mcguinness: [-2.9, 1.9], elf: [2.6, 2.3], feliks: [-3.3, -1.4], redko: [1.6, 1.2] }[id] || [1.6, 1.2];
    try { S.ctx.player?.teleport?.(T.seat.x + off[0] * 0.5, T.seat.y || 0, T.seat.z + off[1] * 0.5, Math.atan2(T.seat.x - T.pos.x, T.seat.z - T.pos.z), 0); } catch {} }
  if (id === 'feliks') for (let i = 0; i < 3; i++) K.give?.('shrooms');
  S.ctx.hud?.toast?.(`You're ${CHARS[id].name} now${id === 'feliks' ? ' · 3 × 🍄 in your bag (B)' : ''}. Friends online see you as ${CHARS[id].name}.`, 2600); close();
}
function open() {
  if (S.root) return; try { document.exitPointerLock?.(); } catch {}
  const cur = myChar(), t = taken(), me = S.ctx.net?.id || 'me', r = document.createElement('div'); r.className = 'cs-panel';
  const blurb = { redko: 'long hair, TOOL tee, the new guy on the block', arkasha: 'glasses, a Manhattan, never loses at durak', mcguinness: 'big afro, band tee, pints of Guinness', feliks: 'long hair, rocker, engineer, mushrooms', elf: 'full three-stripe track suit, Jameson', sasha: 'always takes, never beats' };
  r.innerHTML = `<div class="cs-box"><h2>WHO ARE YOU?</h2><div class="cs-grid">${Object.entries(CHARS).map(([id, c]) => { const h = t.get(id), busy = h && h !== me;
    return `<button data-c="${id}" class="${id === cur ? 'on' : ''}"${busy ? ' disabled' : ''}><b>${c.name}</b><small>${busy ? 'taken by ' + (S.ctx.net?.peer?.(h)?.name || 'a friend') : blurb[id] || ''}</small></button>`; }).join('')}</div><button class="cs-x" data-c="">Close</button></div>`;
  r.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b || b.disabled) return; b.dataset.c ? pick(b.dataset.c) : close(); });
  if (!document.getElementById('cs-css')) { const st = document.createElement('style'); st.id = 'cs-css'; st.textContent = CSS; document.head.appendChild(st); }
  document.body.appendChild(r); S.root = r;
}
function close() { S.root?.remove(); S.root = null; if (S.ctx.state === 'playing') try { S.ctx.requestPointerLock?.(); } catch {} }
const CSS = `.cs-panel{position:fixed;inset:0;z-index:62;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);font:500 14px Barlow,Arial;color:#f1eee6}
.cs-box{width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:rgba(18,20,22,.95);border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:16px}
.cs-box h2{margin:0 0 12px;font:700 22px 'Barlow Condensed',Arial;letter-spacing:.2em}.cs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}
.cs-grid button{display:flex;flex-direction:column;gap:4px;text-align:left;padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:inherit;font:inherit;cursor:pointer}
.cs-grid button.on{border-color:#d4aa46;background:rgba(212,170,70,.2)}.cs-grid button:disabled{opacity:.4;cursor:not-allowed}.cs-grid b{font:700 16px 'Barlow Condensed',Arial;letter-spacing:.1em}.cs-grid small{opacity:.7}
.cs-x{margin-top:12px;padding:8px 14px;border-radius:6px;border:1px solid rgba(255,255,255,.3);background:transparent;color:inherit;cursor:pointer}`;
