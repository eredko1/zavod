// VR hands-on: the things you do with your hands instead of buttons. Owned by: main (vr).
//  · steering: grab a car's steering wheel (grip, or a fist with tracked hands) and turn it; a bike's or jet ski's bars, the same.
//    One hand or two. With tracked hands, push the wheel away from you for gas and pull it back to brake (controllers keep the left
//    stick for that). Writes input.xrSteer / input.xrThrottle, which vehicles.js prefers over the stick while they're set.
//  · eat, drink, smoke: X (or the tablet's BAG tab) puts the item in your off hand; bring it to your mouth and it's used (the same as B
//    in the flat game). X again with it in hand uses it straight away.
//  · elevators: a glowing call button by each elevator door; poke it (fingertip or the controller's tip) to call the car.
//  · fist fights: both fists up in front of your face block (player.guard: damage taken ×GUARD_K); punches can land from any
//    direction away from you (hooks, uppercuts), harder the faster they are (ctx.xrPunchK).
//  · darts: at the oche (darts.js's ctx.darts) a dart sits in your gun hand; hold the trigger (or pinch), swing and let go. It flies with
//    your hand's speed under (softened) gravity and scores where it meets the board on the wall.
import * as THREE from 'three';

const GRAB_WHEEL = 0.3, GRAB_BARS = 0.2, WHEEL_TURN = 2.6, BARS_TURN = 0.55, PUSH_DEAD = 0.03, PUSH_FULL = 0.1;
const MOUTH_R = 0.12, USE_SHOW_S = 1.4, SMOKE_SHOW_S = 8;
const GUARD_R = 0.38, GUARD_K = 0.35, BUTTON_R = 0.07, BUTTON_NEAR = 12;
const DART_G = 9.81 * 0.6, DART_VK = 1.1, DART_MIN_V = 1.2, DART_EMA = 0.45, STUCK_KEEP_S = 2.5;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export function createPhysical(host) {
  const { V } = host;
  const P = { wheel: null, hold, xButton, update, guard: false, buttons: null, qa: () => ({ wheel: P.wheel ? { kind: P.wheel.kind, hands: P.wheel.hands.length, angle: +P.wheel.angle.toFixed(3), steer: +(host.ctx.input.xrSteer ?? 0).toFixed(3), thr: +(host.ctx.input.xrThrottle ?? 0).toFixed(3) } : null, held: V.held?.item || null, guard: P.guard, buttons: P.buttons?.length || 0, darts: !!V.darts, dartReady: !!P.dart?.hand.visible, lastDart: P.lastDart || null }) };

  // ---- the wheel / the bars ---------------------------------------------------------------------------------------------------
  /** the thing you steer, for the vehicle you're driving: a car's wheel (rotates about its own X), or the bars (the fork turns about Y) */
  function steerable(ctx) {
    const p = ctx.player, v = ctx.vehicles?.mounted; if (!v || !p?.mounted || p.mounted.dialog) return null;
    if (v.steerWheel) return { kind: 'wheel', obj: v.steerWheel, v };
    if (v.fork && v.fork.children?.length) return { kind: 'bars', obj: v.fork, v };
    return null;
  }
  /** a hand's angle around the steering axis, in the steering part's parent frame */
  function angleOf(S, pos) {
    const par = S.obj.parent; _v.copy(pos); par.worldToLocal(_v); _v.sub(S.obj.position);
    return S.kind === 'wheel' ? Math.atan2(_v.z, _v.y) : Math.atan2(_v.x, _v.z);
  }
  function grabbing(H) { if (!H) return false; if (H.src?.hand) return host.handPose(H.hand) === 'fist'; return !!H.src?.gamepad?.buttons?.[1]?.pressed; }
  function steer(ctx, dt) {
    const inp = ctx.input, S = steerable(ctx);
    if (!S) { if (P.wheel) release(ctx); return; }
    if (!P.wheel || P.wheel.obj !== S.obj) P.wheel = { ...S, hands: [], angle: 0 };
    const W = P.wheel; S.obj.updateWorldMatrix(true, false);
    const centre = S.obj.getWorldPosition(new THREE.Vector3());
    for (const H of [host.offHand(), host.mainHand()]) {
      if (!H) continue; const loc = host.handPos(H, new THREE.Vector3()); if (!loc) continue; const pos = V.rig.localToWorld(loc.clone());   // hands live in the rig; the wheel in the world
      const g = grabbing(H), i = W.hands.findIndex((h) => h.H === H);
      if (g && i < 0 && pos.distanceTo(centre) < (S.kind === 'wheel' ? GRAB_WHEEL : GRAB_BARS + 0.25)) { W.hands.push({ H, a0: angleOf(S, pos), w0: W.angle, p0: loc }); host.pulse(H, 0.4, 30); }
      else if (!g && i >= 0) W.hands.splice(i, 1);
    }
    V.wheelL = W.hands.some((h) => h.H === host.offHand()); V.wheelR = W.hands.some((h) => h.H === host.mainHand());
    if (!W.hands.length) { W.angle *= Math.max(0, 1 - dt * 3); inp.xrSteer = null; inp.xrThrottle = null; return; }   // let go: it self-centres, the stick has it again
    // the wheel follows the hands (the mean of how far each one turned since it took hold)
    let d = 0; for (const h of W.hands) { const pos = host.handPos(h.H, _v2); if (!pos) continue; V.rig.localToWorld(pos); let da = angleOf(S, pos) - h.a0; da = Math.atan2(Math.sin(da), Math.cos(da)); d += h.w0 + da; }
    const lim = S.kind === 'wheel' ? WHEEL_TURN : BARS_TURN; W.angle = Math.max(-lim, Math.min(lim, d / W.hands.length));
    inp.xrSteer = S.kind === 'wheel' ? W.angle / lim : -W.angle / lim;
    // tracked hands: push away = gas, pull back = brake (along where you're looking, flat)
    if (W.hands.every((h) => h.H.src?.hand)) {
      const e = new THREE.Euler().setFromQuaternion(V.headQ, 'YXZ'), fx = -Math.sin(e.y), fz = -Math.cos(e.y); let push = 0;
      for (const h of W.hands) { const pos = host.handPos(h.H, _v2); if (pos) push += (pos.x - h.p0.x) * fx + (pos.z - h.p0.z) * fz; }
      push /= W.hands.length; const a = Math.abs(push);
      inp.xrThrottle = a < PUSH_DEAD ? 0 : Math.sign(push) * Math.min(1, (a - PUSH_DEAD) / (PUSH_FULL - PUSH_DEAD));
    } else inp.xrThrottle = null;
  }
  function release(ctx) { P.wheel = null; V.wheelL = V.wheelR = false; ctx.input.xrSteer = null; ctx.input.xrThrottle = null; }

  // ---- things in your hand: to the mouth ----------------------------------------------------------------------------------------
  function hold(ctx, item) {
    drop(); const K = host.K; if (!(K.state?.()?.inv || []).includes(item)) return false;
    const mesh = modelFor(item); V.held = { item, mesh, used: false, t: 0 };
    host.ctx.hud?.toast?.(`${host.ITEMS[item]?.icon || ''} In your hand: bring it to your mouth`, 1600); host.pulse(host.offHand(), 0.3, 30);
    return true;
  }
  function xButton(ctx) { if (V.held && !V.held.used) use(ctx); else { const inv = host.K.state?.()?.inv || [], it = [...inv].reverse().find((x) => !host.ITEMS[x]?.keep); if (it) hold(ctx, it); else ctx.hud?.toast?.('Nothing on you', 1200); } }
  function use(ctx) {
    const H = V.held; if (!H || H.used) return; H.used = true; H.t = 0; host.K.useItem?.(H.item); host.pulse(host.offHand(), 0.6, 60);
    H.show = /smoke/.test(host.ITEMS[H.item]?.kind) ? SMOKE_SHOW_S : USE_SHOW_S;
  }
  function drop() { const H = V.held; if (!H) return; H.mesh?.parent?.remove(H.mesh); V.held = null; }
  function heldUpdate(ctx, dt) {
    const H = V.held; if (!H) return; const O = host.offHand(); const holder = O ? (O.src?.hand ? O.hand.joints['wrist'] : O.grip) : null;
    if (!holder) return; if (H.mesh.parent !== holder) { holder.add(H.mesh); if (O.src?.hand) { H.mesh.position.set(0, -0.04, -0.07); H.mesh.rotation.set(-Math.PI / 2, 0, 0); } else { H.mesh.position.set(0, 0.02, -0.04); H.mesh.rotation.set(-Math.PI / 2, 0, 0); } }
    if (H.used) { H.t += dt; if (H.t < 0.8) H.mesh.rotateX(-dt * 0.9); if (H.t > H.show) drop(); return; }   // a swig: tipped up, then gone
    // the mouth: a little below and in front of your eyes
    _q.copy(V.headQ); _v.set(0, -0.07, -0.07).applyQuaternion(_q).add(V.head);
    H.mesh.getWorldPosition(_v2); V.rig.worldToLocal(_v2);
    if (_v2.distanceTo(_v) < MOUTH_R) use(ctx);
  }
  function modelFor(item) {
    const m = host.K.itemModel?.(item); if (m) return m;
    const I = host.ITEMS[item] || {}, g = new THREE.Group();
    if (I.kind === 'smoke') { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.085, 8), new THREE.MeshStandardMaterial({ color: item === 'blunt' ? 0x6b4a2a : 0xf2efe6 })); c.rotation.z = Math.PI / 2; g.add(c);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.005, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff6020 })); tip.position.x = 0.044; g.add(tip); }
    else { const b = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.045, 0.07), new THREE.MeshStandardMaterial({ color: I.kind === 'food' ? 0xd9a35a : 0xe8e8e8, roughness: 0.8 })); g.add(b); }
    return g;
  }

  // ---- elevator call buttons -----------------------------------------------------------------------------------------------------
  function buttons(ctx) {
    if (!P.buttons) {
      P.buttons = []; const mat = new THREE.MeshBasicMaterial({ color: 0xffd27a, toneMapped: false }), plate = new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.8, roughness: 0.35 });
      const add = (pos, yaw, act, up) => {
        const g = new THREE.Group(); g.name = 'xrCallButton';
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.015), plate); g.add(back);
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 20), mat.clone()); b.rotation.x = Math.PI / 2; b.position.z = 0.012; g.add(b);
        const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.022, 3), new THREE.MeshBasicMaterial({ color: 0x222222 })); arrow.position.z = 0.024; arrow.rotation.z = up ? 0 : Math.PI; g.add(arrow);
        const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        g.position.set(pos.x + side.x * 0.75, pos.y + 1.15, pos.z + side.z * 0.75); g.visible = false; ctx.scene.add(g);
        P.buttons.push({ g, b, act, down: false, flash: 0 });
      };
      (host.K.shafts?.() || []).forEach((t, i) => { if (t.kind !== 'elevator') return;
        t.lobby.cars.forEach((c, k) => add(c.pos, c.yaw || 0, () => host.K.callElevator(i, k, 'up'), true));
        t.tops.forEach((s, side) => s.cars.forEach((c, k) => add(c.pos, c.yaw || 0, () => host.K.callElevator(i, k, 'down', side), false))); });
    }
    const p = ctx.player?.position; if (!p) return;
    const tips = [host.mainHand(), host.offHand()].map((H) => { const at = H && host.tipOf(H, new THREE.Vector3()); return at ? { H, at } : null; }).filter(Boolean);
    for (const B of P.buttons) {
      const near = Math.abs(B.g.position.x - p.x) < BUTTON_NEAR && Math.abs(B.g.position.z - p.z) < BUTTON_NEAR && Math.abs(B.g.position.y - 1.15 - p.y) < 4;
      B.g.visible = near && !ctx.player.mounted; if (!B.g.visible) continue;
      _v.copy(V.head); V.rig.localToWorld(_v); B.g.rotation.set(0, Math.atan2(_v.x - B.g.position.x, _v.z - B.g.position.z), 0);   // turned to you
      B.flash = Math.max(0, B.flash - ctx.time.realDt); B.b.material.color.setHex(B.flash > 0 ? 0x7dffb0 : 0xffd27a);
      const hit = tips.find((t) => t.at.distanceTo(B.g.position) < BUTTON_R);
      if (hit && !B.down) { B.down = true; B.flash = 0.6; host.pulse(hit.H, 0.5, 40); B.act(); } else if (!hit) B.down = false;
    }
  }

  // ---- blocking ------------------------------------------------------------------------------------------------------------------
  function guard(ctx) {
    const id = ctx.weapons?.currentId, p = ctx.player; P.guard = false;
    if (p && (id === 'fists' || id === 'knife') && !p.mounted) {
      const e = new THREE.Euler().setFromQuaternion(V.headQ, 'YXZ'), fx = -Math.sin(e.y), fz = -Math.cos(e.y);
      const up = (H) => { const pos = H && host.handPos(H, new THREE.Vector3()); if (!pos) return false; const dx = pos.x - V.head.x, dz = pos.z - V.head.z;
        return pos.distanceTo(V.head) < GUARD_R && dx * fx + dz * fz > 0.05 && pos.y > V.head.y - 0.3; };
      P.guard = up(host.offHand()) && up(host.mainHand());
    }
    if (p) p.guard = P.guard ? GUARD_K : 0;
  }

  // ---- darts --------------------------------------------------------------------------------------------------------------------
  function dartMesh() {
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.8, roughness: 0.3 }), f = new THREE.MeshStandardMaterial({ color: 0xe03a2a, side: THREE.DoubleSide });
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.05, 8), m); barrel.rotation.x = Math.PI / 2; g.add(barrel);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0015, 0.03, 6), m); tip.rotation.x = -Math.PI / 2; tip.position.z = -0.04; g.add(tip);
    for (let i = 0; i < 2; i++) { const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.03), f); fl.position.z = 0.04; fl.rotation.set(Math.PI / 2, i * Math.PI / 2, 0); g.add(fl); }
    return g;
  }
  function darts(ctx, dt) {
    const A = ctx.darts, Dt = P.dart || (P.dart = { hand: dartMesh(), held: false, v: new THREE.Vector3(), prev: null, fly: [], stuck: [] });
    const on = !!A?.vr?.(); V.darts = on;
    const M = host.mainHand(), holder = M ? (M.src?.hand ? M.hand.joints['wrist'] : M.grip) : null;
    const ready = on && A.myTurn() && !!holder && !Dt.fly.length;
    if (ready && Dt.hand.parent !== holder) { holder.add(Dt.hand); if (M.src?.hand) Dt.hand.position.set(0, -0.02, -0.09); else Dt.hand.position.set(0, 0.0, -0.06); Dt.hand.rotation.set(0, 0, 0); }
    Dt.hand.visible = ready;
    const pressed = !!M && (M.src?.hand ? !!M.pinch : !!M.src?.gamepad?.buttons?.[0]?.pressed);
    // the dart's world velocity, smoothed (the release frame alone is noisy)
    if (ready) { const w = Dt.hand.getWorldPosition(new THREE.Vector3()); if (Dt.prev && dt > 0) Dt.v.lerp(_v.subVectors(w, Dt.prev).divideScalar(dt), DART_EMA); Dt.prev = w; } else { Dt.prev = null; Dt.v.set(0, 0, 0); }
    if (on && !A.myTurn() && pressed && !Dt.pressPrev) A.go?.();
    if (ready && pressed && !Dt.pressPrev) Dt.held = true;
    if (Dt.held && !pressed) { Dt.held = false; if (ready) throwDart(ctx, A, Dt, M); }
    if (!ready) Dt.held = false;
    Dt.pressPrev = pressed;
    // darts in the air, then in the board
    for (const f of Dt.fly) { f.t += dt; const t = Math.min(f.t, f.T); f.mesh.position.copy(f.p0).addScaledVector(f.v, t); f.mesh.position.y -= 0.5 * DART_G * t * t;
      _v.copy(f.v); _v.y -= DART_G * t; f.mesh.lookAt(_v2.copy(f.mesh.position).sub(_v)); if (f.t >= f.T && !f.done) { f.done = true; host.pulse(f.H, 0.3, 20); } }
    for (let i = Dt.fly.length - 1; i >= 0; i--) if (Dt.fly[i].done) { Dt.stuck.push({ mesh: Dt.fly[i].mesh, t: 0 }); Dt.fly.splice(i, 1); }
    const turn = A?.turn?.() ?? -1; if (turn !== Dt.turn) { Dt.turn = turn; for (const s of Dt.stuck) s.t = s.t || 1e-6; }
    for (let i = Dt.stuck.length - 1; i >= 0; i--) { const s = Dt.stuck[i]; if (s.t > 0 || !on) { s.t += dt; if (s.t > STUCK_KEEP_S || !on) { s.mesh.parent?.remove(s.mesh); Dt.stuck.splice(i, 1); } } }
  }
  /** let go: where does it meet the board's plane (with gravity), and what's that on the board */
  function throwDart(ctx, A, Dt, H) {
    const B = A.board(); if (!B) return; const v = Dt.v.clone().multiplyScalar(DART_VK), p0 = Dt.hand.getWorldPosition(new THREE.Vector3());
    const n = new THREE.Vector3().crossVectors(B.right, B.up).normalize();   // out of the board, towards the thrower
    const toward = -v.dot(n), d = _v.subVectors(p0, B.c).dot(n);
    if (v.length() < DART_MIN_V || toward <= 0.3 || d <= 0) { ctx.hud?.toast?.('Throw it at the board: a quick swing forward and let go', 1600); return; }
    const T = d / toward, hit = p0.clone().addScaledVector(v, T); hit.y -= 0.5 * DART_G * T * T;
    _v.subVectors(hit, B.c); const x = _v.dot(B.right) / B.r1, y = _v.dot(B.up) / B.r1;
    if (!A.throwAt(x, y)) return;
    host.pulse(H, 0.5, 30);
    const mesh = Dt.hand.clone(); mesh.visible = true; ctx.scene.add(mesh); mesh.position.copy(p0);
    Dt.fly.push({ mesh, p0, v, T: Math.min(T, 2), t: 0, H });
    P.lastDart = { x: +x.toFixed(3), y: +y.toFixed(3), v: +v.length().toFixed(2), T: +T.toFixed(2) };
  }

  function update(ctx, dt) {
    if (ctx.state !== 'playing') return;
    darts(ctx, dt);
    steer(ctx, dt); heldUpdate(ctx, dt); guard(ctx);
    try { buttons(ctx); } catch (e) { console.warn('[vr] call buttons', e); P.buttons = P.buttons || []; }
  }
  function end(ctx) { release(ctx); drop(); if (ctx.player) ctx.player.guard = 0; for (const B of P.buttons || []) B.g.visible = false; }
  P.end = end; P.use = use;
  return P;
}
