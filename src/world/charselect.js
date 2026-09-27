// Character picker (pause menu → Character, or first time in chill mode): play as REDKO, ARKASHA, McGUINNESS, FELIKS, THE
// ELF or SASHA. Your pick is saved and broadcast ('look', re-sent every 8 s so late joiners get it); every other client
// rebuilds your figure as that character (outfits.setRemoteChar). Owned by: main.
import { CHARS, setRemoteChar } from './outfits.js';

const KEY = 'zavod.char';
let S = null;
export const myChar = () => { try { const c = localStorage.getItem(KEY); return CHARS[c] ? c : 'redko'; } catch { return 'redko'; } };

export function mountCharSelect(ctx) {
  if (S) return; S = { ctx, root: null, t: 0 };
  ctx.bus.on('net:look', (m) => { if (m && typeof m.c === 'string' && /^[a-z0-9]{8}$/.test(m.f || '')) setRemoteChar(m.f, m.c, ctx); });
  ctx.bus.on('charSelect', () => open());
  setInterval(() => { try { if (ctx.net?.connected) ctx.net.send('look', { c: myChar() }); } catch {} }, 8000);
  try { if (ctx.mode === 'chill' && !localStorage.getItem(KEY)) setTimeout(() => ctx.state === 'playing' && open(), 2500); } catch {}
  window.__game && (window.__game.charSelect = { open, pick, mine: myChar });
}

function pick(id) {
  if (!CHARS[id]) return; try { localStorage.setItem(KEY, id); } catch {}
  try { S.ctx.net?.send?.('look', { c: id }); } catch {}
  S.ctx.hud?.toast?.(`You're ${CHARS[id].name} now. Friends online see you as ${CHARS[id].name}.`, 2400); close();
}
function open() {
  if (S.root) return; try { document.exitPointerLock?.(); } catch {}
  const cur = myChar(), r = document.createElement('div'); r.className = 'cs-panel';
  const blurb = { redko: '6\'0", long black hair, blue eyes, TOOL tee', arkasha: 'glasses, a Manhattan, never loses at durak', mcguinness: '5\'8", big afro, band tee, pints', feliks: '6\'0", long hair, rocker, mushrooms', elf: '5\'7", full three-stripe track suit', sasha: 'always takes, never beats' };
  r.innerHTML = `<div class="cs-box"><h2>WHO ARE YOU?</h2><div class="cs-grid">${Object.entries(CHARS).map(([id, c]) => `<button data-c="${id}" class="${id === cur ? 'on' : ''}"><b>${c.name}</b><small>${blurb[id] || ''}</small></button>`).join('')}</div><button class="cs-x" data-c="">Close</button></div>`;
  r.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; b.dataset.c ? pick(b.dataset.c) : close(); });
  if (!document.getElementById('cs-css')) { const st = document.createElement('style'); st.id = 'cs-css'; st.textContent = CSS; document.head.appendChild(st); }
  document.body.appendChild(r); S.root = r;
}
function close() { S.root?.remove(); S.root = null; if (S.ctx.state === 'playing') try { S.ctx.requestPointerLock?.(); } catch {} }
const CSS = `.cs-panel{position:fixed;inset:0;z-index:62;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);font:500 14px Barlow,Arial;color:#f1eee6}
.cs-box{width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:rgba(18,20,22,.95);border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:16px}
.cs-box h2{margin:0 0 12px;font:700 22px 'Barlow Condensed',Arial;letter-spacing:.2em}.cs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}
.cs-grid button{display:flex;flex-direction:column;gap:4px;text-align:left;padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:inherit;font:inherit;cursor:pointer}
.cs-grid button.on{border-color:#d4aa46;background:rgba(212,170,70,.2)}.cs-grid b{font:700 16px 'Barlow Condensed',Arial;letter-spacing:.1em}.cs-grid small{opacity:.7}
.cs-x{margin-top:12px;padding:8px 14px;border-radius:6px;border:1px solid rgba(255,255,255,.3);background:transparent;color:inherit;cursor:pointer}`;
