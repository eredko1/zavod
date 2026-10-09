// Character picker (pause menu → Character, or first time in chill mode): play as one of Arkasha's crew or RED. One player
// per character: a pick is broadcast ('look', re-sent every 8 s) and the picker greys out what friends hold (same pick at
// once: the lower id keeps it). Picking spawns you at Arkasha's table and that character's NPC there stands down. FELIP
// comes with mushrooms, and anyone who walks up to a Felip player can buy some. Owned by: main.
import * as THREE from 'three';
import { CHARS, setRemoteChar, looks } from './outfits.js';
import { hangkit as K } from './hangkit.js';

const KEY = 'zavod.char';
// each character arrives with their own kit (strength differs: vodka < Guinness < gin < Jameson < Manhattan < blunt; mushrooms top everything)
const PERKS = { mcguinness: ['blunt', 'guinness'], elf: ['jameson', 'vape'], redko: ['gin', 'cigs'], arkasha: ['manhattan', 'manhattan'], feliks: ['shrooms', 'shrooms', 'shrooms'], sasha: ['sausage', 'kvass'] };
const PERK_TXT = { mcguinness: 'a blunt + a Guinness', elf: 'Jameson, a vape and the big knife; friends near you get free shots', redko: 'gin + cigs', arkasha: 'two Manhattans', feliks: '3 × mushrooms; friends near you get mushrooms + weed', sasha: 'a sausage + kvass' };
let S = null;
export const myChar = () => { try { const c = localStorage.getItem(KEY); return CHARS[c] ? c : 'redko'; } catch { return 'redko'; } };

export function mountCharSelect(ctx) {
  if (S) { S.ctx = ctx; hookKit(ctx); return; } S = { ctx, root: null, felPos: new THREE.Vector3(), felId: null };
  const W = () => ctx.world?.W || ctx.world || {};
  ctx.bus.on('net:look', (m) => {
    if (!m || typeof m.c !== 'string' || !/^[a-z0-9]{8}$/.test(m.f || '')) return;
    setRemoteChar(m.f, m.c, ctx);
    if (S.dealt && m.c === myChar() && m.f < (ctx.net?.id || '')) { ctx.hud?.toast?.(`${ctx.net?.peer?.(m.f)?.name || 'A friend'} is already ${CHARS[m.c].name}: dealing you someone else`, 2600); deal(); }   // same pick at once: the lower id keeps it
  });
  ctx.bus.on('net:shroompaid', (m) => { if (m?.to !== ctx.net?.id) return; ctx.hud?.toast?.(`You hooked ${ctx.net?.peer?.(m.f)?.name || 'someone'} up`, 2000); });
  ctx.bus.on('charSelect', () => open());
  setInterval(() => { try { if (ctx.net?.connected && (S.dealt || ctx.mode !== 'chill')) ctx.net.send('look', { c: myChar() }); } catch {} }, 8000);   // chill: nothing until you're dealt (a stale saved pick would block a friend)
  setInterval(() => crewSync(W()), 1000);
  hookKit(ctx);
  // joining: you're dealt a random free character and start at their spot with their kit (Pause > Character to switch)
  if (ctx.mode === 'chill') setTimeout(() => { if (!S.dealt) deal(); }, ctx.net?.connected ? 4500 : 1500);
  window.__game && (window.__game.charSelect = { open, pick, mine: myChar, taken: () => [...taken().entries()], dbg: () => ({ felId: S.felId, felPos: S.felPos.toArray(), mine: myChar() }) });
}

/** per-kit hooks (the kit is rebuilt with the map, so these are re-registered on every mount) */
function hookKit(ctx) {
  // a Felip player hands out mushrooms and weed, free (once a minute per person)
  let lastGift = -Infinity;
  K.spot?.({ pos: S.felPos, r: 4, when: () => !!S.felId, prompt: () => (performance.now() - lastGift < 60000 ? 'FELIP: "Pace yourself, man."' : 'F — FELIP: FREE MUSHROOMS + WEED'), act: () => {
    if (performance.now() - lastGift < 60000) return; if (K.full?.()) return ctx.hud?.toast?.('Pockets full', 1400);
    lastGift = performance.now(); K.give('shrooms'); K.give('weed'); ctx.net?.send?.('shroompaid', { to: S.felId }); ctx.hud?.toast?.('FELIP: "On the house. Two minutes, full send. B to use."', 2400); } });
  // an Elf player pours shots for everyone round him (once a minute each)
  let lastShot = -Infinity; S.elfPos = S.elfPos || new THREE.Vector3();
  K.spot?.({ pos: S.elfPos, r: 4, when: () => !!S.elfId, prompt: () => (performance.now() - lastShot < 60000 ? 'THE ELF: "Pace yourself."' : 'F — THE ELF POURS YOU A SHOT'), act: () => {
    if (performance.now() - lastShot < 60000) return; lastShot = performance.now(); if (K.give?.('jameson')) K.useItem?.('jameson'); ctx.net?.send?.('shroompaid', { to: S.elfId }); ctx.hud?.toast?.('THE ELF: "Za zdorovye. Down it."', 2200); } });
  K.onUpdate?.(() => { S.elfId = null; const me = ctx.player?.position; if (!me || myChar() === 'elf') return; for (const [pid, c] of looks()) { if (c !== 'elf') continue; const q = ctx.net?.peer?.(pid); if (q?.pos && q.pos.distanceTo(me) < 4) { S.elfPos.copy(q.pos); S.elfId = pid; return; } } });
  K.onUpdate?.(() => { S.felId = null; const me = ctx.player?.position; if (!me || myChar() === 'feliks') return; for (const [pid, c] of looks()) { if (c !== 'feliks') continue; const q = ctx.net?.peer?.(pid); if (q?.pos && q.pos.distanceTo(me) < 4) { S.felPos.copy(q.pos); S.felId = pid; return; } } });
}
function deal() { const t = taken(), free = Object.keys(CHARS).filter((c) => !t.has(c)); pick(free.length ? free[(Math.random() * free.length) | 0] : 'redko', true); }
/** who holds which character: me + every peer still in the room */
function taken() {
  const t = new Map(), live = new Set(S.ctx.net?.list?.() || []);
  for (const [pid, c] of looks()) { if (!live.has(pid)) { looks().delete(pid); continue; } t.set(c, pid); }
  if (S.dealt) t.set(myChar(), S.ctx.net?.id || 'me');
  return t;
}
function crewSync(W) {
  const t = taken(); for (const [id, e] of Object.entries(W.crew || {})) { if (!e) continue; const hide = t.has(id);
    if (hide !== !!e._claimed) { e._claimed = hide; e.off = hide; if (e.fig?.group) e.fig.group.visible = !hide; } }
}
function pick(id, auto = false) {
  if (!CHARS[id]) return; const holder = taken().get(id);
  if (holder && holder !== (S.ctx.net?.id || 'me')) { S.ctx.hud?.toast?.(`${S.ctx.net?.peer?.(holder)?.name || 'A friend'} is already ${CHARS[id].name}`, 2000); return; }
  try { localStorage.setItem(KEY, id); } catch {}
  S.dealt = true; try { S.ctx.net?.send?.('look', { c: id }); } catch {}
  const W = S.ctx.world?.W || S.ctx.world || {}; crewSync(W);
  const e = W.crew?.[id], T = W.arkadyTable;   // your character's usual spot (their NPC steps aside), facing the table
  if (e?.pos || T) { const at = e?.pos || T.seat, look = !T ? at : Math.hypot(at.x - T.pos.x, at.z - T.pos.z) < 0.5 ? T.seat : T.pos; try { S.ctx.player?.teleport?.(at.x, at.y || 0, at.z, Math.atan2(-(look.x - at.x), -(look.z - at.z)), 0); } catch {} }
  S.got = S.got || new Set(); if (!S.got.has(id)) { S.got.add(id); for (const it of PERKS[id] || []) K.give?.(it); }   // the kit once per character (switching back and forth doesn't farm it)
  S.ctx.hud?.toast?.(`${auto ? 'Tonight you' : 'You'}'re ${CHARS[id].name} · ${PERK_TXT[id] || ''} · Pause > Character to switch`, 3400); close();
}
function open() {
  if (S.root) return; try { document.exitPointerLock?.(); } catch {}
  const cur = myChar(), t = taken(), me = S.ctx.net?.id || 'me', r = document.createElement('div'); r.className = 'cs-panel';
  const blurb = { redko: 'NYC history, Tool and SOAD, always has a smoke', arkasha: 'geopolitics, durak as strategy, a Manhattan', mcguinness: 'jazz, punk, the Bronx, pints of Guinness', feliks: 'maps, code, mushrooms, mesh networks', elf: 'three stripes, history trivia, Jameson', sasha: 'economics, bad crypto bets, always takes' };
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
