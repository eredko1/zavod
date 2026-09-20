// Mobile / touch controls. Owned by: main. Renders a CoD-Mobile-style overlay and drives ctx.input (axis, look, buttons).
// Left half: floating virtual stick (auto-sprint when pushed to the rim). Right half: drag to look; button cluster for fire/ADS/jump/crouch/reload/swap/grenade.
const CSS = `
#touch{position:fixed;inset:0;z-index:30;pointer-events:none;-webkit-user-select:none;user-select:none;touch-action:none;font-family:"Barlow Condensed","Arial Narrow",system-ui,sans-serif}
#touch.on{pointer-events:auto}
#touch.hidden{display:none}
#touch .zone{position:absolute;top:0;bottom:0;width:50%}
#touch .zone.l{left:0}#touch .zone.r{right:0}
#touch .stick{position:absolute;width:132px;height:132px;margin:-66px 0 0 -66px;border-radius:50%;border:2px solid rgba(255,255,255,.28);background:rgba(0,0,0,.18);display:none}
#touch .stick i{position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:rgba(255,255,255,.55);box-shadow:0 2px 12px rgba(0,0,0,.5)}
#touch .btn{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:50%;border:1.5px solid rgba(255,255,255,.35);background:rgba(10,14,20,.45);color:#e8ecf1;font-weight:600;letter-spacing:.08em;font-size:13px;backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);transition:transform .08s,background .08s}
#touch .btn.down{background:rgba(233,162,59,.55);border-color:#e9a23b;transform:scale(.94)}
#touch .btn.tog.on{background:rgba(233,162,59,.35);border-color:#e9a23b}
#touch .fire{right:calc(env(safe-area-inset-right,0px) + 28px);bottom:calc(env(safe-area-inset-bottom,0px) + 92px);width:104px;height:104px;font-size:15px;border-width:2px;background:rgba(160,40,30,.42);border-color:rgba(255,120,100,.6)}
#touch .fire.down{background:rgba(220,70,50,.7)}
#touch .ads{right:calc(env(safe-area-inset-right,0px) + 150px);bottom:calc(env(safe-area-inset-bottom,0px) + 70px);width:68px;height:68px}
#touch .jump{right:calc(env(safe-area-inset-right,0px) + 30px);bottom:calc(env(safe-area-inset-bottom,0px) + 214px);width:64px;height:64px}
#touch .crouch{right:calc(env(safe-area-inset-right,0px) + 150px);bottom:calc(env(safe-area-inset-bottom,0px) + 156px);width:60px;height:60px}
#touch .reload{right:calc(env(safe-area-inset-right,0px) + 236px);bottom:calc(env(safe-area-inset-bottom,0px) + 28px);width:56px;height:56px;font-size:12px}
#touch .swap{right:calc(env(safe-area-inset-right,0px) + 112px);bottom:calc(env(safe-area-inset-bottom,0px) + 14px);width:52px;height:52px;font-size:11px}
#touch .nade{right:calc(env(safe-area-inset-right,0px) + 236px);bottom:calc(env(safe-area-inset-bottom,0px) + 100px);width:54px;height:54px;font-size:11px}
#touch .pause{right:calc(env(safe-area-inset-right,0px) + 16px);top:calc(env(safe-area-inset-top,0px) + 10px);width:44px;height:30px;border-radius:6px;font-size:12px}
#touch .act{left:calc(env(safe-area-inset-left,0px) + 120px);bottom:calc(env(safe-area-inset-bottom,0px) + 230px);min-width:96px;height:44px;padding:0 14px;border-radius:22px;font-size:13px;background:rgba(233,162,59,.35);border-color:#e9a23b;display:none}
#touch .act.show{display:flex}
#touch .fireL{left:calc(env(safe-area-inset-left,0px) + 30px);bottom:calc(env(safe-area-inset-bottom,0px) + 230px);width:70px;height:70px;background:rgba(160,40,30,.3);border-color:rgba(255,120,100,.45)}
`;

let S = null;

export async function init(ctx) {
  if (!ctx.isTouch) return { active: false };
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const root = document.createElement('div'); root.id = 'touch'; root.className = 'hidden';
  root.innerHTML = `
    <div class="zone l"></div><div class="zone r"></div>
    <div class="stick"><i></i></div>
    <div class="btn pause">II</div>
    <div class="btn fire">FIRE</div><div class="btn fireL"></div>
    <div class="btn ads tog">ADS</div>
    <div class="btn jump">JUMP</div>
    <div class="btn crouch tog">CROUCH</div>
    <div class="btn reload">RELOAD</div>
    <div class="btn swap">SWAP</div>
    <div class="btn nade">NADE</div>
    <div class="btn act">TAKE</div>`;
  document.body.appendChild(root);
  const q = (c) => root.querySelector(c);
  const input = ctx.input; const T = input.touch;
  S = { root, stick: q('.stick'), knob: q('.stick i'), stickId: null, stickOrigin: { x: 0, y: 0 }, looks: new Map(), R: 56, lookSens: 2.2, };

  const setAxis = (dx, dy) => { const m = Math.hypot(dx, dy); const k = m > S.R ? S.R / m : 1; const x = dx * k / S.R, y = dy * k / S.R; T.axis.x = x; T.axis.y = y; T.sprint = Math.hypot(x, y) > 0.92 && y < -0.5; S.knob.style.transform = `translate(${x * S.R}px,${y * S.R}px)`; };
  const clearStick = () => { S.stickId = null; T.axis.x = T.axis.y = 0; T.sprint = false; S.stick.style.display = 'none'; S.knob.style.transform = ''; };

  // ---- left zone: floating stick
  const zl = q('.zone.l');
  zl.addEventListener('touchstart', (e) => { e.preventDefault(); if (S.stickId !== null) return; const t = e.changedTouches[0]; S.stickId = t.identifier; S.stickOrigin = { x: t.clientX, y: t.clientY }; S.stick.style.display = 'block'; S.stick.style.left = t.clientX + 'px'; S.stick.style.top = t.clientY + 'px'; setAxis(0, 0); }, { passive: false });
  const onMove = (e) => { e.preventDefault(); for (const t of e.changedTouches) { if (t.identifier === S.stickId) setAxis(t.clientX - S.stickOrigin.x, t.clientY - S.stickOrigin.y); else if (S.looks.has(t.identifier)) { const l = S.looks.get(t.identifier); input.mouse.dx += (t.clientX - l.x) * S.lookSens; input.mouse.dy += (t.clientY - l.y) * S.lookSens; l.x = t.clientX; l.y = t.clientY; } } };
  const onEnd = (e) => { for (const t of e.changedTouches) { if (t.identifier === S.stickId) clearStick(); S.looks.delete(t.identifier); } };
  // ---- right zone + buttons: look-drag (a finger that starts on a button can also drag to look)
  const startLook = (e) => { for (const t of e.changedTouches) S.looks.set(t.identifier, { x: t.clientX, y: t.clientY }); };
  q('.zone.r').addEventListener('touchstart', (e) => { e.preventDefault(); startLook(e); }, { passive: false });
  root.addEventListener('touchmove', onMove, { passive: false });
  root.addEventListener('touchend', onEnd); root.addEventListener('touchcancel', onEnd);

  // ---- buttons
  const hold = (el, on, off, { look = false } = {}) => {
    el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('down'); on(); if (look) startLook(e); }, { passive: false });
    const end = (e) => { el.classList.remove('down'); off(); };
    el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
  };
  const tap = (el, fn) => el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('down'); setTimeout(() => el.classList.remove('down'), 120); fn(); }, { passive: false });
  const press = (code) => { input.keys.add(code); input.pressed.add(code); setTimeout(() => input.keys.delete(code), 120); };
  for (const sel of ['.fire', '.fireL']) hold(q(sel), () => { T.fire = true; input.pressed.add('Mouse0'); }, () => { T.fire = false; }, { look: sel === '.fire' });
  const adsEl = q('.ads'); tap(adsEl, () => { T.ads = !T.ads; adsEl.classList.toggle('on', T.ads); });
  const crEl = q('.crouch'); tap(crEl, () => { const on = !input.keys.has('KeyC'); if (on) input.keys.add('KeyC'); else input.keys.delete('KeyC'); crEl.classList.toggle('on', on); });
  hold(q('.jump'), () => { input.keys.add('Space'); input.pressed.add('Space'); }, () => input.keys.delete('Space'));
  tap(q('.reload'), () => press('KeyR'));
  tap(q('.swap'), () => { const slot = ctx.weapons?.current?.slot ?? 0; press(slot === 0 ? 'Digit2' : 'Digit1'); input.mouse.wheel += 1; });
  tap(q('.nade'), () => press('KeyG'));
  S.act = q('.act'); tap(S.act, () => { input.pressed.add('KeyF'); }); // contextual: pick up weapon / mount / dismount (same F both systems read)
  tap(q('.pause'), () => ctx.setState('paused'));

  const show = (v) => { root.classList.toggle('hidden', !v); root.classList.toggle('on', v); if (!v) { clearStick(); S.looks.clear(); T.fire = false; } };
  ctx.bus.on('state', ({ state }) => show(state === 'playing'));
  show(ctx.state === 'playing');
  // QA hooks
  return {
    active: true,
    qaStick: (x, y) => { T.axis.x = x; T.axis.y = y; T.sprint = Math.hypot(x, y) > 0.92 && y < -0.5; },
    qaLook: (dx, dy) => { input.mouse.dx += dx; input.mouse.dy += dy; },
    qaFire: (on) => { T.fire = on; if (on) input.pressed.add('Mouse0'); },
  };
}

export function update(dt, ctx) {
  if (!S || !S.act) return;
  // contextual action button: weapon pickup or motorcycle mount/dismount
  const pk = ctx.ai?.nearPickup, bike = ctx.vehicles?.nearBike, mounted = ctx.vehicles?.mounted || ctx.player?.mounted;
  const label = mounted ? 'GET OFF' : pk ? `TAKE ${(pk.id || 'GUN').toUpperCase().replace('AK74', 'AK')}` : bike ? 'RIDE' : null;
  if (label !== S.actLabel) { S.actLabel = label; S.act.textContent = label || ''; S.act.classList.toggle('show', !!label && ctx.state === 'playing'); }
}
export function reset(ctx) { if (S) { ctx.input.touch.fire = false; ctx.input.touch.ads = false; } }
