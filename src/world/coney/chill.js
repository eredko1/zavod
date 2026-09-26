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
import { chaseQA } from './chase.js';

// crews: Russian gopniks and neighborhood hustlers. Some just roll up and talk trash, some shake you down together.
const CREWS = {
  ru: { names: ['DIMA', 'MISHA', 'MAX', 'SASHA', 'VOVA', 'KOSTYA', 'ZHENYA', 'SEVA', 'TOLIK', 'LYOSHA', 'KOLYAN', 'SLAVIK'], tag: '#ff8a6a',
    hi: ['Bratan, which district you from?', 'Want semechki? No? Then give money.', 'Three stripes, bro. Respect the three stripes.', 'Why you walk like tourist?', 'Sammy is my cousin. Everybody is Sammy cousin.'],
    rob: ['Ey, bratan — got a cigarette?', 'Pay the neighborhood tax.', 'Brother, lend me twenty. Forever.'],
    bye: ['OK bratan, stay calm, we go.', 'Next time you pay.', 'Poka, tourist.'], look: [[0x15161a, 0xe8e8e8], [0x1c2b5a, 0xe8e8e8], [0x2a2a2e, 0xe8e8e8]], cap: 0x111111 },
  st: { names: ['DRE', 'KEYS', 'BOOGIE', 'TAY', 'SMOKEY', 'JUJU', 'BIG MIKE', 'LIL T'], tag: '#ffb35a',
    hi: ['Ayo, them kicks my size?', 'You lost, playboy?', 'Lemme hold twenty real quick. I\'m good for it. Probably.', 'This my block. Block got a toll.', 'Yo, you look like my cousin\'s landlord.'],
    rob: ['Run that pocket!', 'Appreciate the donation!', 'Tax season, baby!'],
    bye: ['Aight, we out. Stay up.', 'You good. For now.', 'Peace, peace.'], look: [[0x6e6e72, 0xf0f0f0], [0x7a1f1f, 0x111111], [0x3e4a2c, 0xe0c080]], cap: 0x1b1b1b },
  // marks: regular people out for a walk — the ones YOU can rob (F with a weapon out)
  mk: { names: ['TOURIST', 'HIPSTER', 'BABUSHKA', 'FINANCE BRO', 'DELIVERY GUY', 'INFLUENCER', 'DENTIST', 'SUMMER INTERN'], tag: '#9fd3ff',
    hi: [], bye: [], rob: [],
    give: ['Take it, take it! Just don\'t hurt me!', 'OK OK OK — here, it\'s all I got!', 'Please, it\'s my rent money!', 'This is going on my story, man.', 'I\'m calling my cousin! He\'s a cop! …He\'s a crossing guard.'],
    no: ['Not today, pal!', 'I did three years of krav maga, buddy!', 'You picked the wrong grandma!'],
    run: ['HELP! POLICE!', 'Somebody call 911!', 'Aaaah!'],
    look: [[0xe86a3a, 0x6b8fb3], [0x6a4a8a, 0x2a2a2a], [0x8a3a4a, 0x3a3a3a], [0x2e5e8e, 0x1c1c1c], [0x2f7a3a, 0x303a4a], [0xe0c0d0, 0xf0f0f0]], cap: null },
};
const HP = 100;
const FIGHT = ['You want smoke? You got smoke!', 'Oh, now you done it.', 'Bratan, big mistake.', 'Get him!', 'Hold my semechki.'];
let C = null;

// ---- guns off the books: IGOR (under the bench) and now and then a tough in a crew that rolls up to talk ----
const GUNS = { m9: { name: 'Makarov', price: 40, slot: 1 }, deagle: { name: 'Desert Eagle', price: 120, slot: 1 }, r870: { name: 'Sawed-off pump', price: 90, slot: 0 }, mp5: { name: 'MP5', price: 110, slot: 0 }, ak74: { name: 'AK', price: 160, slot: 0 } };
export function gunShop(seller, ids, pitch) {
  return { text: pitch, choices: [...ids.map((id) => ({ label: `${GUNS[id].name} — $${GUNS[id].price}`, go: () => buyGun(seller, id) })), { label: 'Just looking', go: null }] };
}
function buyGun(seller, id) {
  const w = C?.ctx?.weapons, g = GUNS[id];
  if (!w?.setLoadout) return { text: `${seller}: "Not today."`, choices: [{ label: '…', go: null }] };
  if (!K.pay(g.price)) return { text: `${seller}: "${g.price}. Cash. I don't take IOUs."`, choices: [{ label: 'Later', go: null }] };
  const lo = w.loadout || {};
  if (g.slot === 1) { w.lock?.(1, false); w.setLoadout({ primary: lo.primary, secondary: id }); if (C?.ch) C.ch.armed = true; setTimeout(() => w.swap?.(1), 50); }
  else { w.setLoadout({ primary: id, secondary: lo.secondary }); setTimeout(() => w.swap?.(0), 50); }
  K.toast(`Bought a ${g.name}. V still stabs.`, 2400);
  return { text: `${seller}: "${['Clean. Mostly.', 'You didn\'t get it from me.', 'Point it away from Igor.', 'Serial number? What serial number.'][Math.floor(Math.random() * 4)]}"`, choices: [{ label: 'Pleasure doing business', go: null }] };
}

/** jobs (coney/jobs.js): a named person at a spot, e.g. a debtor */
export function spawnPerson(at, name, cash = 40, type = 'mk') { if (!C) return null; const t = spawnGang(type, 'mark', 1, null, { at, name, cash })[0] || null; if (t) t.keep = true; return t; }
export const crewsAlive = (t) => !!(C && t && C.thugs.get(t.id) === t);

/** the crews (both modes): chill = frequent solo robbers + gangs; otherwise a gang now and then */
export function buildCrews(world, { chill = false } = {}) {
  const { ctx, W } = world;
  C = { world, ctx, chill, thugs: new Map(), remote: new Map(), nextId: 1, spawnT: 60, gangT: chill ? 120 : 180, robbed: 0, sendT: 0, calmUntil: 0, markT: 5, robT: null, robPos: new THREE.Vector3(0, -999, 0) };
  ctx.bus.on('playerRespawn', () => { C.calmUntil = performance.now() + 60000; ctx.deathNote = null; for (const t of C.thugs.values()) if (t.intent === 'fight') { t.intent = 'talk'; t.st = 'leave'; t.t = 0; t.m.f.guard = false; } });
  ctx.bus.on('busted', () => {   // one-star collar (coney/chase.js): pay the fine, get dropped back at the park
    const fine = Math.floor(K.cash / 2 / 5) * 5; if (fine > 0) K.pay(fine);
    K.toast(`BUSTED — $${fine} fine and a desk appearance ticket. Back to the block.`, 3500);
    const os = C.world.W.onlineStart; if (os) ctx.player.teleport?.(os[0], os[1] || 0, os[2], os[3] || 0, 0);
    C.calmUntil = performance.now() + 60000;
  });
  K.spot({ pos: C.robPos, r: 3.3, dy: 2, when: () => !!C.robT, prompt: () => (C.robT?.dealer ? `F — TALK TO ${C.robT.name}` : `F — ROB ${C.robT?.name || ''}`), act: () => { const t = C.robT; if (!t) return; if (t.dealer) { t.talkT = -20; t.st = 'talk'; K.openDialog(t.name, gunShop(t.name, t.dealer, `${t.name}: "${t.type === 'ru' ? 'Bratan. You need something that goes bang? I have.' : 'Psst. You need a piece? I got a couple. Cash only.'}"`)); } else robVictim(t); } });   // no shakedowns for a minute after you respawn
  W.mapThugs = () => [...C.thugs.values(), ...C.remote.values()].filter((t) => t.st !== 'dead' && t.type !== 'mk').map((t) => [t.pos.x, t.pos.z]);
  ctx.bus.on('net:thug', (m) => onRemoteThug(m));
  ctx.bus.on('net:thughit', (m) => { if (m.o !== ctx.net?.id) return; const t = C.thugs.get(m.i); if (t) hurt(t, Math.min(120, +m.d || 0), null); });
  K.onUpdate((dt, playing) => update(dt, playing));
  if (typeof window !== 'undefined' && window.__game) window.__game.crews = { state: () => ({ thugs: [...C.thugs.values()].map((t) => ({ id: t.id, name: t.name, type: t.type, intent: t.intent, st: t.st, hp: t.hp, pos: t.pos.toArray().map((v) => +v.toFixed(1)) })), remote: C.remote.size, robbed: C.robbed }), gang: (type, intent, n) => spawnGang(type, intent, n, 14), spawn: (d = 12) => spawnGang('ru', 'rob', 1, d), calm: (ms = 0) => { C.calmUntil = performance.now() + ms; }, mark: (d = 4) => spawnGang('mk', 'mark', 1, d)[0]?.id, dealer: (d = 5) => { const t = spawnGang('st', 'talk', 2, d)[0]; if (t) t.dealer = ['m9', 'deagle']; return t?.id; }, robNear: (force = null) => (C.robT ? (robVictim(C.robT, force), C.robT.name) : null), fight: () => { const t = [...C.thugs.values()].find((x) => x.st !== 'dead' && x.type !== 'mk'); if (t) startFight(t); return t?.name; } };
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
  const vf = buildFigure({ avatar: 'm05', skin: 0xe0b890, hair: 0x2a2018, shirt: 0x1d1f24, pants: 0x1d1f24, shoe: 0xeeeeee, belly: 0.05, shortSleeve: false });
  const tag = nameTag('VITEK', '#9fe39a'); tag.position.set(0, 2.15, 0); vf.group.add(tag); vf.group.position.copy(vp); world.scene.add(vf.group);
  K.onUpdate((dt) => { const me = ctx.player.position; vf.group.rotation.y = Math.atan2(me.x - vp.x, me.z - vp.z); vf.update(dt, 0); });
  K.vendor({ name: 'VITEK', pos: vp, r: 2.4, talk: vitekTalk, fig: vf });
  CH.vitek = vp; (W.mapPOIs || (W.mapPOIs = [])).push({ name: 'VITEK (guns)', x: vp.x, z: vp.z, kind: 'danger' });
  // loadout: the knife; the handgun slot is locked until Vitek comes through
  const arm = () => { const w = ctx.weapons; if (!w?.setLoadout) return false; w.setLoadout({ primary: 'knife', secondary: 'm9' }); w.lock?.(1, !CH.armed, 'No gun yet — VITEK (by the park gate) sells one'); return true; };
  ctx.bus.on('playerRespawn', () => { setTimeout(arm, 50); });
  K.onUpdate((dt, playing) => {
    if (!CH.armedOnce && arm()) { CH.armedOnce = true; K.toast('CHILL MODE — no mercs. Get wasted, don\'t get robbed — or do the robbing (F on a passer-by). Knife + $60. Muggings bring the cops.', 5200); }
    const st = K.state(); if (playing) CH.wasted += ((st?.high || 0) + (st?.drunk || 0)) * dt;
    el.textContent = `WASTED ${Math.floor(CH.wasted)}  ·  ROBBED ${C.robbed}×`;
  });
  if (typeof window !== 'undefined' && window.__game) window.__game.chill = { state: () => ({ thugs: [...C.thugs.values()].filter((t) => t.type !== 'mk').map((t) => ({ id: t.id, name: t.name, st: t.st, hp: t.hp, pos: t.pos.toArray().map((v) => +v.toFixed(1)) })), remote: C.remote.size, wasted: +CH.wasted.toFixed(1), robbed: C.robbed, armed: CH.armed, vitek: CH.vitek.toArray() }), spawn: (d = 12) => spawnGang('ru', 'rob', 1, d) };
  console.log('[chill] mode on');
}

// ---------------------------------------------------------------------------------------------------------------------------
function thugModel(name, seed, type = 'ru') {
  const T = CREWS[type] || CREWS.ru, cols = T.look[seed % T.look.length];
  const MK = { TOURIST: 'm01', 'FINANCE BRO': 'm08', DENTIST: 'm08', BABUSHKA: 'f09', INFLUENCER: 'f01', 'SUMMER INTERN': 'f17', HIPSTER: 'm05', 'DELIVERY GUY': 'm18' };
  const avatar = type === 'ru' ? ['m10', 'm17', 'm05'][seed % 3] : type === 'st' ? ['m04', 'm12', 'm18'][seed % 3] : MK[name] || ['m01', 'm20', 'f17'][seed % 3];
  const f = buildFigure({ avatar, seed, skin: [0xe6c3a2, 0xd9a882, 0x8a5a3c, 0x6b4430, 0x4a2e20][seed % 5], hair: name === 'BABUSHKA' ? 0xb8b4ae : 0x1a1410, bun: name === 'BABUSHKA', shirt: cols[0], pants: type === 'st' ? 0x2a3240 : type === 'mk' ? cols[1] : cols[0], shoe: type === 'mk' ? 0x3a2a20 : cols[1], belly: name === 'FINANCE BRO' || name === 'BABUSHKA' ? 0.3 : 0.05, shortSleeve: type === 'mk' ? true : false });
  if (T.cap != null && !f.avatar) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.125, type === 'st' ? 0.11 : 0.07, 12), new THREE.MeshStandardMaterial({ color: T.cap })); cap.position.set(0, type === 'st' ? 0.08 : 0.1, 0); f.head.add(cap); }
  const tag = nameTag(name, T.tag); tag.position.set(0, 2.15, 0); f.group.add(tag);
  // hitboxes: body + head (weapons' onHit hook)
  const hbm = new THREE.MeshBasicMaterial({ visible: false });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.5, 8), hbm); body.position.y = 0.85; f.group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), hbm); head.position.y = 1.72; f.group.add(head);
  head.userData.part = 'head';
  let blade = null;   // some gopniks carry a folding knife
  if (type === 'ru' && seed % 3 === 0) { blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.028, 0.16), new THREE.MeshStandardMaterial({ color: 0xc9cdd2, metalness: 1, roughness: 0.3 })); blade.position.set(0, -0.3, 0.08); f.limbs.arms[1].fore.add(blade); }
  return { f, hit: [body, head], blade };
}
/** a crew of n (same type) rolls in from one direction, 40–60 m out (or `dist`); intent 'rob' | 'talk' */
function spawnGang(type = Math.random() < 0.5 ? 'ru' : 'st', intent = Math.random() < 0.55 ? 'rob' : 'talk', n = 2 + (Math.random() < 0.4 ? 1 : 0), dist = null, opts = {}) {
  const { ctx, world } = C; const me = ctx.player.position, nav = ctx.ai?.nav, T = CREWS[type] || CREWS.ru;
  let base = opts.at ? opts.at.clone() : null;
  for (let k = 0; k < 12 && !base; k++) { const a = Math.random() * Math.PI * 2, d = dist ?? (40 + Math.random() * 20); const x = me.x + Math.cos(a) * d, z = me.z + Math.sin(a) * d; const q = nav?.nearestFree ? nav.nearestFree(x, z, 5, me.y) : new THREE.Vector3(x, me.y, z); if (q && Math.abs(q.y - me.y) < 1.5) base = new THREE.Vector3(q.x, q.y, q.z); }
  if (!base) return [];
  const used = new Set(), out = [], lk = Math.floor(Math.random() * 5);   // each member gets his own line
  for (let i = 0; i < n; i++) {
    let at = base.clone(); if (i) { const q = nav?.nearestFree?.(base.x + (Math.random() - 0.5) * 5, base.z + (Math.random() - 0.5) * 5, 3, base.y); if (q) at = new THREE.Vector3(q.x, q.y, q.z); }
    let name = opts.name; if (!name) { do { name = T.names[Math.floor(Math.random() * T.names.length)]; } while (used.has(name) && used.size < T.names.length); } used.add(name);
    const id = C.nextId++; const m = thugModel(name, id, type); m.f.group.position.copy(at); world.scene.add(m.f.group);
    const t = { id, name, type, intent, m, pos: at, yaw: 0, st: 'walk', hp: HP, cash: 10 + 5 * Math.floor(Math.random() * 5), loot: [], t: 0, path: null, pathT: 0, punchT: 0.6 * i, said: false, talkT: 0, lk: lk + i, blade: !!m.blade };
    for (const h of m.hit) { h.userData.onHit = (dmg, headshot, point, dir) => hurt(t, dmg, dir); ctx.raycastTargets.push(h); }
    C.thugs.set(id, t); out.push(t);
  }
  if (opts.cash != null) for (const t of out) t.cash = opts.cash;
  if (intent === 'talk' && type !== 'mk' && out.length && Math.random() < 0.4) { const t = out[0]; const pool = ['m9', 'deagle', 'mp5', 'r870', 'ak74'].sort(() => Math.random() - 0.5); t.dealer = pool.slice(0, 2); }   // this one's holding
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
  const { ctx } = C; t.hp -= dmg;
  if (dir) { t.pos.x += dir.x * 0.45; t.pos.z += dir.z * 0.45; }   // rocked back by the blow
  ctx.ai?.blood?.(t.pos.x, t.pos.z, 0.3 + Math.random() * 0.2, t.pos.y + 0.5);
  if (t.hp <= 0) {
    t.st = 'dead'; t.t = 0; t.fallK = 0; t.m.f.guard = false; t.m.f.hands = false; K.toast(`${t.name} is down`, 1200);
    const n = t.cash + t.loot.reduce((a, b) => a + b, 0); if (n > 0) K.dropCash(t.pos.clone().add(new THREE.Vector3(0.6, 0, 0.3)), n);   // everything he had, including what he took off you
    ctx.ai?.blood?.(t.pos.x, t.pos.z, 1.1, t.pos.y + 0.5);
    try { chaseQA.crime(t.type === 'mk' ? 'kill' : 'crewKill'); } catch {}
    for (const o of C.thugs.values()) if (o !== t && o.st !== 'dead' && o.st !== 'flee' && o.pos.distanceTo(t.pos) < 25) { if (o.type !== 'mk' && Math.random() < 0.45) startFight(o); else flee(o); }   // his boys either scatter or go for you
    return;
  }
  t.m.f.play('hit');
  if (t.type === 'mk') { if (t.intent !== 'fight') { flee(t); say(t, CREWS.mk.run[Math.floor(Math.random() * CREWS.mk.run.length)]); try { chaseQA.crime('shot'); } catch {} } return; }
  if (t.hp < 30 && Math.random() < 0.7) { flee(t); K.toast(`${t.name}: "Ay ay ay, OK OK!"`, 1100); return; }
  startFight(t);
  for (const o of C.thugs.values()) if (o !== t && o.type === t.type && o.st !== 'dead' && o.st !== 'flee' && o.intent !== 'fight' && o.pos.distanceTo(t.pos) < 15) startFight(o, true);   // you hit one, you fight them all
}
function startFight(t, quiet = false) {
  if (t.intent === 'fight' || t.st === 'dead') return;
  t.intent = 'fight'; t.st = 'fight'; t.punchT = 0.4 + Math.random() * 0.6; t.hitAt = null; t.m.f.guard = true; t.m.f.hands = false;
  if (!quiet) say(t, FIGHT[Math.floor(Math.random() * FIGHT.length)]);
}
function flee(t) { t.st = 'flee'; t.t = 0; t.m.f.guard = false; t.m.f.hands = false; }
function onRemoteThug(m) {
  const { ctx } = C; if (typeof m.f !== 'string' || !Number.isFinite(+m.x)) return;
  const key = m.f + ':' + m.i; let t = C.remote.get(key);
  if (!t) { if (m.st === 'gone') return; const mm = thugModel(String(m.n || 'GOPNIK').slice(0, 10), m.i | 0, m.k === 'st' || m.k === 'mk' ? m.k : 'ru'); C.world.scene.add(mm.f.group); t = { key, id: key, type: m.k === 'st' || m.k === 'mk' ? m.k : 'ru', m: mm, pos: new THREE.Vector3(+m.x, +m.y, +m.z), yaw: 0, st: m.st, seen: performance.now() };
    for (const h of mm.hit) { h.userData.onHit = (dmg) => ctx.net?.send?.('thughit', { o: m.f, i: m.i, d: Math.round(dmg) }); ctx.raycastTargets.push(h); } C.remote.set(key, t); }
  if (m.st === 'gone') { removeThug(t, C.remote); return; }
  t.target = new THREE.Vector3(+m.x, +m.y, +m.z); t.yaw = +m.r || 0; t.st = m.st; t.seen = performance.now();
}

// ---------------------------------------------------------------------------------------------------------------------------
function update(dt, playing) {
  const { ctx } = C; const me = ctx.player; const now = performance.now();
  const alive = [...C.thugs.values()].filter((t) => t.st !== 'dead').length, cap = C.chill ? 5 : 3;
  // chill: a lone robber every 90–150 s; both modes: a crew now and then (chill 3–5 min, otherwise 4–6 min)
  if (C.chill) { C.spawnT -= dt; if (playing && C.spawnT <= 0 && alive < cap) { C.spawnT = 90 + Math.random() * 60; spawnGang(undefined, 'rob', 1); } }
  C.gangT -= dt; if (playing && C.gangT <= 0 && alive + 2 <= cap) { C.gangT = C.chill ? 180 + Math.random() * 120 : 240 + Math.random() * 120; spawnGang(); }
  // marks: a few regular people always around to rob
  const marks = [...C.thugs.values()].filter((t) => t.type === 'mk' && t.st !== 'dead').length;
  C.markT -= dt; if (playing && C.markT <= 0) { C.markT = 12 + Math.random() * 18; if (marks < (C.chill ? 3 : 2)) spawnGang('mk', 'mark', 1, 28 + Math.random() * 25); }
  // F — ROB: the nearest robbable person in front of you (anyone out walking; crews that only came to talk)
  { let best = null, bd = 3.2; const fx = -Math.sin(me.yaw || 0), fz = -Math.cos(me.yaw || 0);
    for (const t of C.thugs.values()) { if (t.st === 'dead' || t.st === 'flee' || t.st === 'robbed' || !(t.intent === 'mark' || t.intent === 'talk')) continue;
      const vx = t.pos.x - me.position.x, vz = t.pos.z - me.position.z, dd = Math.hypot(vx, vz); if (dd < bd && (vx * fx + vz * fz) / (dd || 1) > 0.3) { bd = dd; best = t; } }
    C.robT = best; if (best) C.robPos.copy(best.pos); }
  // Table Park is neutral ground, and there's a breather after every respawn / robbery: robbers who arrive then just talk
  const os = C.world.W.onlineStart, safe = (os && Math.hypot(me.position.x - os[0], me.position.z - os[2]) < 25) || now < C.calmUntil;
  const gone = (t) => { removeThug(t); ctx.net?.send?.('thug', { i: t.id, st: 'gone', x: 0, y: 0, z: 0 }); };
  for (const t of [...C.thugs.values()]) {
    t.t += dt; const g = t.m.f.group, T = CREWS[t.type] || CREWS.ru;
    if (t.st === 'dead') { t.fallK = Math.min(1, (t.fallK ?? 1) + dt * 2.4); const e = 1 - (1 - t.fallK) ** 2; g.rotation.x = -Math.PI / 2 * e; g.position.set(t.pos.x, t.pos.y + 0.25 * e, t.pos.z); if (t.t > 20) gone(t); continue; }   // crumples, doesn't pop
    const dx = me.position.x - t.pos.x, dz = me.position.z - t.pos.z, d = Math.hypot(dx, dz);
    let speed = 0, goal = null;
    if (t.st === 'robbed') {   // hands up, then the wallet, then legs
      t.robT += dt; t.yaw = Math.atan2(dx, dz);
      if (t.robT > 1.3) { const n = t.cash; t.cash = 0; if (n > 0) { K.earn(n); K.toast(`+$${n} off the ${t.type === 'mk' ? t.name.toLowerCase() : t.name}`, 1800); } flee(t); if (Math.random() < 0.6) { try { chaseQA.crime('rob'); } catch {} } }
      g.position.copy(t.pos); g.rotation.y = t.yaw; t.m.f.update(dt, 0); continue;
    }
    if (t.st === 'flee' || t.st === 'leave') {
      speed = t.st === 'flee' ? 5.5 : 1.7; goal = t.pos.clone().add(new THREE.Vector3(-dx, 0, -dz).normalize().multiplyScalar(10));
      if (t.t > (t.st === 'flee' ? 14 : 20)) { gone(t); continue; }
    } else if (me.dead || !playing) speed = 0;
    else if (t.intent === 'mark') {   // a regular person walking somewhere; wanders off the map when you're long gone
      if (d > 110 && !t.keep) { gone(t); continue; }
      if (!t.goal || Math.hypot(t.goal.x - t.pos.x, t.goal.z - t.pos.z) < 1.2 || t.t > t.goalT) {
        const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 18, q = ctx.ai?.nav?.nearestFree?.(t.pos.x + Math.cos(a) * r, t.pos.z + Math.sin(a) * r, 5, t.pos.y);
        t.goal = q ? new THREE.Vector3(q.x, q.y, q.z) : t.pos.clone(); t.goalT = t.t + 25; t.path = null; }
      speed = 1.3; goal = t.goal; t.st = 'walk';
    } else if (t.intent === 'fight') {   // squared up: close in, guard up, throw hands (or the blade)
      if (d > 35) { t.intent = 'talk'; t.st = 'leave'; t.t = 0; t.m.f.guard = false; }
      else {
        if (d > 1.3) { speed = d > 6 ? 4.4 : 2.2; goal = me.position; } else t.yaw = Math.atan2(dx, dz);
        t.punchT -= dt;
        if (d < 1.9 && t.punchT <= 0) { t.punchT = (t.blade ? 1.1 : 0.75) + Math.random() * 0.6; t.m.f.play('punch'); t.hitAt = 0.14; }
        if (t.hitAt != null && (t.hitAt -= dt) <= 0) { t.hitAt = null;
          if (d < 2.0) { const dmg = t.blade ? 16 + Math.random() * 6 : 7 + Math.random() * 5;
            ctx.deathNote = { text: t.blade ? `stabbed by ${t.name}` : `beaten down by ${t.name}'s crew`, at: performance.now() };
            me.damage?.(dmg, t.pos.clone()); ctx.bus.emit('meleeHit', { point: me.position.clone().setY(me.position.y + 1.4) });
            if (t.blade) ctx.ai?.blood?.(me.position.x, me.position.z, 0.4, me.position.y); } }
      }
    }
    else if (t.intent === 'talk') {   // roll up, talk trash, roll out
      if (d > 3.2 && t.st !== 'talk') { speed = d > 25 ? 1.6 : 2.2; goal = me.position; t.st = 'walk'; }
      else { if (t.st !== 'talk') { t.st = 'talk'; t.talkT = 0; } t.talkT += dt; t.yaw = Math.atan2(dx, dz);
        if (!t.said && t.talkT > 0.4 + (t.id % 3) * 1.6) { t.said = true; say(t, T.hi[t.lk % T.hi.length]); }
        if (t.talkT > 7) { t.st = 'leave'; t.t = 0; if (t.id % 2 === 0) say(t, T.bye[Math.floor(Math.random() * T.bye.length)]); } }
    } else if (safe && t.intent === 'rob' && d < 6) { t.intent = 'talk'; t.said = false; }
    else if (d > 1.3) {
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
    t.m.f.guard = t.st === 'fight'; t.m.f.hands = t.st === 'robbed';
    if (t.st === 'dead') { g.rotation.x = -Math.PI / 2; g.position.y = t.pos.y + 0.25; } else t.m.f.update(dt, moving ? 3 : 0);
  }
}
/** you rob someone: with a gun out they nearly always pay; with a knife some run or swing; crews mostly swing */
function robVictim(t, force = null) {
  const { ctx } = C; const gun = ctx.weapons?.current?.mode !== 'MELEE', M = CREWS.mk;
  const comply = force != null ? +force : t.type === 'mk' ? (gun ? 0.95 : 0.75) : (gun ? 0.55 : 0.3);
  t.path = null; t.goal = null;
  if (Math.random() < comply) {
    t.st = 'robbed'; t.robT = 0; t.m.f.hands = true; t.m.f.guard = false;
    if (t.type === 'mk') { t.cash = t.name === 'FINANCE BRO' ? 40 + Math.floor(Math.random() * 11) * 5 : 10 + Math.floor(Math.random() * 8) * 5; say(t, M.give[Math.floor(Math.random() * M.give.length)]); }
    else say(t, gun ? 'Whoa whoa — easy with that thing!' : 'Aight, aight… you got it.');
    return;
  }
  if (t.type === 'mk' && Math.random() < 0.55) { flee(t); say(t, M.run[Math.floor(Math.random() * M.run.length)]); try { chaseQA.crime('rob'); } catch {} return; }
  if (t.type === 'mk') say(t, M.no[Math.floor(Math.random() * M.no.length)]);
  startFight(t, t.type === 'mk'); for (const o of C.thugs.values()) if (o !== t && o.type === t.type && t.type !== 'mk' && o.st !== 'dead' && o.pos.distanceTo(t.pos) < 15) startFight(o, true);
}
function rob(t) {
  const { ctx } = C; const me = ctx.player, T = CREWS[t.type] || CREWS.ru;
  const cash = K.cash, st = K.state(); t.m.f.play('shove');
  let what = '';
  if (cash >= 10) { const n = Math.max(10, Math.round(cash * 0.3 / 5) * 5); K.pay(n); t.loot.push(n); what = `$${n}`; }
  else if (st?.inv?.length) { const it = st.inv[st.inv.length - 1]; K.take(it); t.loot.push(8); what = `your ${it === 'weed' ? 'bag' : it === 'forty' ? '40' : it === 'bottle' ? 'bottle' : it}`; }
  else { if ((me.health ?? 100) > 30) me.damage?.(Math.min(12, (me.health ?? 100) - 30), t.pos.clone()); ctx.deathNote = { text: `jumped by ${t.name}'s crew`, at: performance.now() }; t.m.f.play('punch'); K.toast(`${t.name}: "Broke?! Then I take it out of your face."`, 1600); t.st = 'flee'; t.t = 0; return; }   // a beating, never a killing
  C.robbed++; C.calmUntil = performance.now() + 60000; K.toast(`${t.name}: "${T.rob[Math.floor(Math.random() * T.rob.length)]}" — took ${what}! (take them down to get it back)`, 3000);
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
    choices: [{ label: 'Here — shashlik and $60', go: deal, cost: 60, need: 'skewer' }, { label: 'Not now', go: null }],
  };
}
