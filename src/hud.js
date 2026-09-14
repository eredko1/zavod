// HUD, menus, screens. Owned by: HUD agent. STUB — replace entirely.
export async function init(ctx) {
  const el = document.getElementById('hud');
  el.innerHTML = `<div id="stubmenu" style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);font:600 28px sans-serif;cursor:pointer">CLICK TO PLAY</div>`;
  const menu = el.querySelector('#stubmenu');
  menu.onclick = () => ctx.setState('playing');
  ctx.bus.on('state', ({ state }) => { menu.style.display = state === 'playing' ? 'none' : 'flex'; });
  return { hitmarker: () => {}, damageFrom: () => {}, killfeed: () => {}, toast: () => {} };
}
export function update(dt, ctx) {}
