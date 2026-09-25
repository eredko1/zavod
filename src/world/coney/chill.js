// CONEY — CHILL MODE (?mode=chill): no mercenaries, no cops. You start with a knife and $60; the neighborhood's gopniks and
// hustlers keep trying to shake you down (they walk up, "got a cigarette, bratan?", and take a cut of your cash or your
// stash, then run). Knife them and they drop what they carry. The goal: get as wasted as possible without getting robbed —
// WASTED (time spent high / drunk) and ROBBED counters on the HUD. The only gun in town: VITEK, round the back of the
// towers, sells a Makarov for $60 and a hot skewer of shashlik off the mangal at Table Park.
// Crews (both modes, buildCrews): Russian gopniks and neighborhood hustlers roll through in 2s and 3s — some just talk trash,
// some shake you down together. Every client owns the crews that come for its own player and streams them ('thug', 5 Hz);
// friends see them as puppets and can hit them too ('thughit' → the owner applies it).
import * as THREE from 'three';
import { hangkit as K } from '../hangkit.js';
import { buildFigure, nameTag } from '../deli.js';

// crews: Russian gopniks and neighborhood hustlers. Some just roll up and talk trash, some shake you down together.
const CREWS = {
  ru: { names: ['KOLYAN', 'VOVCHIK', 'DIMON', 'TOLIK', 'SLAVIK', 'ZHEKA', 'LYOKHA', 'BORYA'], tag: '#ff8a6a',
    hi: ['Bratan, which district you from?', 'Want semechki? No? Then give money.', 'Three stripes, bro. Respect the three stripes.', 'Why you walk like tourist?', 'Sammy is my cousin. Everybody is Sammy cousin.'],
    rob: ['Ey, bratan — got a cigarette?', 'Pay the neighborhood tax.', 'Brother, lend me twenty. Forever.'],
    bye: ['OK bratan, stay calm, we go.', 'Next time you pay.', 'Poka, tourist.'], look: [[0x15161a, 0xe8e8e8], [0x1c2b5a, 0xe8e8e8], [0x2a2a2e, 0xe8e8e8]], cap: 0x111111 },
  st: { names: ['DRE', 'KEYS', 'BOOGIE', 'TAY', 'SMOKEY', 'JUJU', 'BIG MIKE', 'LIL T'], tag: '#ffb35a',
    hi: ['Ayo, them kicks my size?', 'You lost, playboy?', 'Lemme hold twenty real quick. I\'m good for it. Probably.', 'This my block. Block got a toll.', 'Yo, you look like my cousin\'s landlord.'],
    rob: ['Run that pocket!', 'Appreciate the donation!', 'Tax season, baby!'],
    bye: ['Aight, we out. Stay up.', 'You good. For now.', 'Peace, peace.'], look: [[0x6e6e72, 0xf0f0f0], [0x7a1f1f, 0x111111], [0x3e4a2c, 0xe0c080]], cap: 0x1b1b1b },
};
const HP = 100;
let C = null;

/** the crews (both modes): chill = frequent solo robbers + gangs; otherwise a gang now and then */
export function buildCrews(world, { chill = false } = {}) {
  const { ctx, W } = world;
  C = { world, ctx, chill, thugs: new Map(), remote: new Map(), nextId: 1, spawnT: 25, gangT: chill ? 60 : 90, robbed: 0, sendT: 0 };
  W.mapThugs = () => [...C.thugs.values(), ...C.remote.values()].filter((t) => t.st !== 'dead').map((t) => [t.pos.x, t.pos.z]);
  ctx.bus.on('net:thug', (m) => onRemoteThug(m));
  ctx.bus.on('net:thughit', (m) => { if (m.o !== ctx.net?.id) return; const t = C.thugs.get(m.i); if (t) hurt(t, Math.min(120, +m.d || 0), null); });
  K.onUpdate((dt, playing) => update(dt, playing));
  if (typeof window !== 'undefined' && window.__game) window.__game.crews = { state: () => ({ thugs: [...C.thugs.values()].map((t) => ({ id: t.id, name: t.name, type: t.type, intent: t.intent, st: t.st, hp: t.hp, pos: t.pos.toArray().map((v) => +v.toFixed(1)) })), remote: C.remote.size, robbed: C.robbed }), gang: (type, intent, n) => spawnGang(type, intent, n, 14), spawn: (d = 12) => spawnGang('ru', 'rob', 1, d) };
  return C;
}

export function buildChill(world, H) {
  const { ctx, W } = world;
  W.mode = 'chill';
  const CH = { wasted: 0, armed: false };
  buildCrews(world, { chill: true }); C.ch = CH;
  K.earn(40);   // $60 to start (the kit gives 20)
  // HUD: WASTED / ROBBED
  const el = document.createElement('div'); el.className = 'hkui zvchill';
  el.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 62px);transform:translateX(-50%);z-index:40;font:700 13px Barlow Condensed,Arial;letter-spacing:.18em;color:#ffd27a;background:rgba(8,10,14,.55);padding:4px 12px;border-left:2px solid #ffb24a;pointer-events:none;white-space:nowrap';
  document.body.appendChild(el);
  ctx.bus.on('state', ({ state }) => { el.style.visibility = state === 'playing' ? '' : 'hidden'; });
  // VITEK, the handgun guy, leaning on the fence a few steps from the park gate
  const s0 = W.onlineStart || [220, 0, -380]; let vp = new THREE.Vector3(s0[0] - 12, 0, s0[2] + 9);
  try { const q = ctx.ai?.nav?.nearestFree?.(vp.x, vp.z, 6, 0); if (q) vp = new THREE.Vector3(q.x, q.y, q.z); } catch {}
  const vf = buildFigure({ skin: 0xe0b890, hair: 0x2a2018, shirt: 0x1d1f24, pants: 0x1d1f24, shoe: 0xeeeeee, belly: 0.05, shortSleeve: false });
  const tag = nameTag('VITEK', '#9fe39a'); tag.position.set(0, 2.15, 0); vf.group.add(tag); vf.group.position.copy(vp); world.scene.add(vf.group);
  K.onUpdate((dt) => { const me = ctx.player.position; vf.group.rotation.y = Math.atan2(me.x - vp.x, me.z - vp.z); vf.update(dt, 0); });
  K.vendor({ name: 'VITEK', pos: vp, r: 2.4, talk: vitekTalk });
  CH.vitek = vp; (W.mapPOIs || (W.mapPOIs = [])).push({ name: 'VITEK (guns)', x: vp.x, z: vp.z, kind: 'danger' });
  // loadout: the knife; the handgun slot is locked until Vitek comes through
  const arm = () => { const w = ctx.weapons; if (!w?.setLoadout) return false; w.setLoadout({ primary: 'knife', secondary: 'm9' }); w.lock?.(1, !CH.armed, 'No gun yet — VITEK (by the park gate) sells one'); return true; };
  ctx.bus.on('playerRespawn', () => { setTimeout(arm, 50); });
  K.onUpdate((dt, playing) => {
    if (!CH.armedOnce && arm()) { CH.armedOnce = true; K.toast('CHILL MODE — no mercs. Get wasted, don\'t get robbed. You\'ve got a knife and $60.', 4200); }
    const st = K.state(); if (playing) CH.wasted += ((st?.high || 0) + (st?.drunk || 0)) * dt;
    el.textContent = `WASTED ${Math.floor(CH.wasted)}  ·  ROBBED ${C.robbed}×`;
  });
  if (typeof window !== 'undefined' && window.__game) window.__game.chill = { state: () => ({ thugs: [...C.thugs.values()].map((t) => ({ id: t.id, name: t.name, st: t.st, hp: t.hp, pos: t.pos.toArray().map((v) => +v.toFixed(1)) })), remote: C.remote.size, wasted: +CH.wasted.toFixed(1), robbed: C.robbed, armed: CH.armed, vitek: CH.vitek.toArray() }), spawn: (d = 12) => spawnGang('ru', 'rob', 1, d) };
  console.log('[chill] mode on');
}

// ---------------------------------------------------------------------------------------------------------------------------
function thugModel(name, seed, type = 'ru') {
  const T = CREWS[type] || CREWS.ru, cols = T.look[seed % T.look.length];
  const f = buildFigure({ skin: [0xe6c3a2, 0xd9a882, 0x8a5a3c, 0x6b4430, 0x4a2e20][seed % 5], hair: 0x1a1410, shirt: cols[0], pants: type === 'st' ? 0x2a3240 : cols[0], shoe: cols[1], belly: 0.05, shortSleeve: false });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.125, type === 'st' ? 0.11 : 0.07, 12), new THREE.MeshStandardMaterial({ color: T.cap })); cap.position.set(0, type === 'st' ? 0.08 : 0.1, 0); f.head.add(cap);
  const tag = nameTag(name, T.tag); tag.position.set(0, 2.15, 0); f.group.add(tag);
  // hitboxes: body + head (weapons' onHit hook)
  const hbm = new THREE.MeshBasicMaterial({ visible: false });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.5, 8), hbm); body.position.y = 0.85; f.group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), hbm); head.position.y = 1.72; f.group.add(head);
  head.userData.part = 'head';
  return { f, hit: [body, head] };
}
/** a crew of n (same type) rolls in from one direction, 40–60 m out (or `dist`); intent 'rob' | 'talk' */
function spawnGang(type = Math.random() < 0.5 ? 'ru' : 'st', intent = Math.random() < 0.55 ? 'rob' : 'talk', n = 2 + (Math.random() < 0.4 ? 1 : 0), dist = null) {
  const { ctx, world } = C; const me = ctx.player.position, nav = ctx.ai?.nav, T = CREWS[type] || CREWS.ru;
  let base = null;
  for (let k = 0; k < 12 && !base; k++) { const a = Math.random() * Math.PI * 2, d = dist ?? (40 + Math.random() * 20); const x = me.x + Math.cos(a) * d, z = me.z + Math.sin(a) * d; const q = nav?.nearestFree ? nav.nearestFree(x, z, 5, me.y) : new THREE.Vector3(x, me.y, z); if (q && Math.abs(q.y - me.y) < 1.5) base = new THREE.Vector3(q.x, q.y, q.z); }
  if (!base) return [];
  const used = new Set(), out = [], lk = Math.floor(Math.random() * 5);   // each member gets his own line
  for (let i = 0; i < n; i++) {
    let at = base.clone(); if (i) { const q = nav?.nearestFree?.(base.x + (Math.random() - 0.5) * 5, base.z + (Math.random() - 0.5) * 5, 3, base.y); if (q) at = new THREE.Vector3(q.x, q.y, q.z); }
    let name; do { name = T.names[Math.floor(Math.random() * T.names.length)]; } while (used.has(name) && used.size < T.names.length); used.add(name);
    const id = C.nextId++; const m = thugModel(name, id, type); m.f.group.position.copy(at); world.scene.add(m.f.group);
    const t = { id, name, type, intent, m, pos: at, yaw: 0, st: 'walk', hp: HP, cash: 10 + 5 * Math.floor(Math.random() * 5), loot: [], t: 0, path: null, pathT: 0, punchT: 0.6 * i, said: false, talkT: 0, lk: lk + i };
    for (const h of m.hit) { h.userData.onHit = (dmg, headshot, point, dir) => hurt(t, dmg, dir); ctx.raycastTargets.push(h); }
    C.thugs.set(id, t); out.push(t);
  }
  if (n > 1) K.toast(`${type === 'ru' ? 'A crew of gopniks' : 'Some guys from the block'} ${intent === 'rob' ? 'are coming your way — watch your pockets' : 'are rolling up'}`, 2400);
  return out;
}
function say(t, line) { K.toast(`${t.name}: "${line}"`, 2400); }
function removeThug(t, map = C.thugs) {
  const { ctx } = C; C.world.scene.remove(t.m.f.group);
  for (const h of t.m.hit) { const k = ctx.raycastTargets.indexOf(h); if (k > -1) ctx.raycastTargets.splice(k, 1); }
  map.delete(t.id);
}
function hurt(t, dmg, dir) {
  if (t.st === 'dead') return;
  t.hp -= dmg;
  if (t.hp <= 0) {
    t.st = 'dead'; t.t = 0; K.toast(`${t.name} is down`, 1200);
    const n = t.cash + t.loot.reduce((a, b) => a + b, 0); if (n > 0) K.dropCash(t.pos.clone().add(new THREE.Vector3(0.6, 0, 0.3)), n);   // everything he had, including what he took off you
    t.m.f.group.rotation.x = -Math.PI / 2; t.m.f.group.position.y = t.pos.y + 0.25;
    for (const o of C.thugs.values()) if (o !== t && o.st !== 'dead' && o.st !== 'flee' && o.pos.distanceTo(t.pos) < 25) { o.st = 'flee'; o.t = 0; }   // the rest of the crew scatters
  } else if (t.st !== 'flee') { t.st = 'flee'; t.t = 0; K.toast(`${t.name}: "Ay ay ay, OK OK!"`, 1100); }
}
function onRemoteThug(m) {
  const { ctx } = C; if (typeof m.f !== 'string' || !Number.isFinite(+m.x)) return;
  const key = m.f + ':' + m.i; let t = C.remote.get(key);
  if (!t) { if (m.st === 'gone') return; const mm = thugModel(String(m.n || 'GOPNIK').slice(0, 10), m.i | 0, m.k === 'st' ? 'st' : 'ru'); C.world.scene.add(mm.f.group); t = { key, id: key, m: mm, pos: new THREE.Vector3(+m.x, +m.y, +m.z), yaw: 0, st: m.st, seen: performance.now() };
    for (const h of mm.hit) { h.userData.onHit = (dmg) => ctx.net?.send?.('thughit', { o: m.f, i: m.i, d: Math.round(dmg) }); ctx.raycastTargets.push(h); } C.remote.set(key, t); }
  if (m.st === 'gone') { removeThug(t, C.remote); return; }
  t.target = new THREE.Vector3(+m.x, +m.y, +m.z); t.yaw = +m.r || 0; t.st = m.st; t.seen = performance.now();
}

// ---------------------------------------------------------------------------------------------------------------------------
function update(dt, playing) {
  const { ctx } = C; const me = ctx.player; const now = performance.now();
  const alive = [...C.thugs.values()].filter((t) => t.st !== 'dead').length, cap = C.chill ? 5 : 3;
  // chill: a lone robber every 35–60 s; both modes: a crew now and then (chill 70–110 s, otherwise 2.5–4 min)
  if (C.chill) { C.spawnT -= dt; if (playing && C.spawnT <= 0 && alive < cap) { C.spawnT = 35 + Math.random() * 25; spawnGang(undefined, 'rob', 1); } }
  C.gangT -= dt; if (playing && C.gangT <= 0 && alive + 2 <= cap) { C.gangT = C.chill ? 70 + Math.random() * 40 : 150 + Math.random() * 90; spawnGang(); }
  const gone = (t) => { removeThug(t); ctx.net?.send?.('thug', { i: t.id, st: 'gone', x: 0, y: 0, z: 0 }); };
  for (const t of [...C.thugs.values()]) {
    t.t += dt; const g = t.m.f.group, T = CREWS[t.type] || CREWS.ru;
    if (t.st === 'dead') { if (t.t > 20) gone(t); continue; }
    const dx = me.position.x - t.pos.x, dz = me.position.z - t.pos.z, d = Math.hypot(dx, dz);
    let speed = 0, goal = null;
    if (t.st === 'flee' || t.st === 'leave') {
      speed = t.st === 'flee' ? 5.5 : 1.7; goal = t.pos.clone().add(new THREE.Vector3(-dx, 0, -dz).normalize().multiplyScalar(10));
      if (t.t > (t.st === 'flee' ? 14 : 20)) { gone(t); continue; }
    } else if (me.dead || !playing) speed = 0;
    else if (t.intent === 'talk') {   // roll up, talk trash, roll out
      if (d > 3.2 && t.st !== 'talk') { speed = d > 25 ? 1.6 : 2.2; goal = me.position; t.st = 'walk'; }
      else { if (t.st !== 'talk') { t.st = 'talk'; t.talkT = 0; } t.talkT += dt; t.yaw = Math.atan2(dx, dz);
        if (!t.said && t.talkT > 0.4 + (t.id % 3) * 1.6) { t.said = true; say(t, T.hi[t.lk % T.hi.length]); }
        if (t.talkT > 7) { t.st = 'leave'; t.t = 0; if (t.id % 2 === 0) say(t, T.bye[Math.floor(Math.random() * T.bye.length)]); } }
    } else if (d > 1.3) {
      speed = d > 25 ? 1.6 : 3.4; goal = me.position; t.st = d > 25 ? 'walk' : 'run';
      if (!t.said && d < 9) { t.said = true; say(t, T.hi[t.lk % T.hi.length]); }
    } else { t.st = 'rob'; t.punchT -= dt; if (t.punchT <= 0) { t.punchT = 1.2; rob(t); } }   // up close: shake you down
    if (goal && speed > 0) {
      // follow the nav path (re-planned every 1.5 s), straight line if there's none
      if (!t.path || now - t.pathT > 1500) { t.pathT = now; try { t.path = ctx.ai?.nav?.findPath?.(t.pos, goal instanceof THREE.Vector3 ? goal : new THREE.Vector3(goal.x, goal.y, goal.z), { maxExpand: 6000 }) || null; } catch { t.path = null; } t.pi = 0; }
      let w = goal; if (t.path && t.path.length) { while (t.pi < t.path.length - 1 && Math.hypot(t.path[t.pi].x - t.pos.x, t.path[t.pi].z - t.pos.z) < 0.6) t.pi++; w = t.path[Math.min(t.pi, t.path.length - 1)]; }
      const wx = w.x - t.pos.x, wz = w.z - t.pos.z, wl = Math.hypot(wx, wz) || 1; t.pos.x += wx / wl * Math.min(wl, speed * dt); t.pos.z += wz / wl * Math.min(wl, speed * dt); if (Number.isFinite(w.y)) t.pos.y += (w.y - t.pos.y) * Math.min(1, dt * 6);
      const want = Math.atan2(wx, wz); t.yaw += Math.atan2(Math.sin(want - t.yaw), Math.cos(want - t.yaw)) * Math.min(1, dt * 8);
    } else if (t.st === 'rob') t.yaw = Math.atan2(dx, dz);
    g.position.copy(t.pos); g.rotation.y = t.yaw; t.m.f.update(dt, speed);
  }
  // stream mine (5 Hz), animate friends'
  C.sendT -= dt; if (C.sendT <= 0 && ctx.net?.connected) { C.sendT = 0.2; for (const t of C.thugs.values()) ctx.net.send('thug', { i: t.id, n: t.name, k: t.type, st: t.st, x: +t.pos.x.toFixed(2), y: +t.pos.y.toFixed(2), z: +t.pos.z.toFixed(2), r: +t.yaw.toFixed(2) }); }
  for (const t of [...C.remote.values()]) {
    if (now - t.seen > 3000) { removeThug(t, C.remote); continue; }
    const g = t.m.f.group; const moving = t.target && t.target.distanceTo(t.pos) > 0.05;
    if (t.target) t.pos.lerp(t.target, Math.min(1, dt * 8)); g.position.copy(t.pos); g.rotation.y = t.yaw;
    if (t.st === 'dead') { g.rotation.x = -Math.PI / 2; g.position.y = t.pos.y + 0.25; } else t.m.f.update(dt, moving ? 3 : 0);
  }
}
function rob(t) {
  const { ctx } = C; const me = ctx.player, T = CREWS[t.type] || CREWS.ru;
  const cash = K.cash, st = K.state();
  let what = '';
  if (cash >= 10) { const n = Math.max(10, Math.round(cash * 0.3 / 5) * 5); K.pay(n); t.loot.push(n); what = `$${n}`; }
  else if (st?.inv?.length) { const it = st.inv[st.inv.length - 1]; K.take(it); t.loot.push(8); what = `your ${it === 'weed' ? 'bag' : it === 'forty' ? '40' : it === 'bottle' ? 'bottle' : it}`; }
  else { me.damage?.(12, t.pos.clone()); K.toast(`${t.name}: "Broke?! Then I take it out of your face."`, 1600); return; }
  C.robbed++; K.toast(`${t.name}: "${T.rob[Math.floor(Math.random() * T.rob.length)]}" — took ${what}! (take them down to get it back)`, 3000);
  try { ctx.bus.emit('playerDamaged', { amount: 1, from: t.pos.clone() }); } catch {}
  t.st = 'flee'; t.t = 0;
}

// ---------------------------------------------------------------------------------------------------------------------------
function vitekTalk(Kk, again) {
  const { ctx } = C;
  const CH = C.ch;
  if (CH.armed) return { text: 'VITEK: "You got the piece, bratan. Don\'t tell nobody where from."', choices: [{ label: 'I never saw you', go: null }] };
  const deal = () => {
    if (!K.has('skewer')) return { text: 'VITEK: "Where\'s my shashlik? Hot, from the mangal at Table Park. NET GOST sells the meat. Then we talk."', choices: [{ label: 'On it', go: null }] };
    if (!K.pay(60)) return { text: 'VITEK: "Sixty, bratan. I don\'t do layaway."', choices: [{ label: 'Later', go: null }] };
    K.take('skewer'); CH.armed = true;
    const w = ctx.weapons; w?.lock?.(1, false); w?.setLoadout?.({ primary: 'knife', secondary: 'm9' }); w?.swap?.(1);
    K.toast('Got a Makarov (slot 2). The locals will think twice.', 3000);
    return { text: 'VITEK: "Mmm. Still hot. OK — here. Makarov. Clean, mostly. Fifteen in the mag. You never met me."', choices: [{ label: 'Pleasure doing business', go: null }] };
  };
  return {
    text: again ? 'VITEK: "Psst. You back? Got my shashlik? Got sixty?"' : 'VITEK: "Psst. Bratan. The gopniks giving you trouble? I can help. A Makarov. Sixty dollar — and I\'m starving. Bring me a hot skewer of shashlik off the mangal at Table Park."',
    choices: [{ label: 'Here — shashlik and $60', go: deal }, { label: 'Not now', go: null }],
  };
}
