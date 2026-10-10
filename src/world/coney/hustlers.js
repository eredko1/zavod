// CONEY hustlers — the beach and the amusement strip sell smoke, cigs and booze off the books (hangkit vendors):
//  · ZHORA on the boardwalk by the Wonder Wheel: loosie packs, spliffs, a стопка or a whole bottle.
//  · TOLIK with the cooler, down on the sand: "Cold beer, cold water!" — tallboys of Baltika, vodka shots, cigs.
//  · DEE by the lifeguard chair: weed, spliffs, cigs.
//  · ARTUR by the flat rides: cigs, Jameson, vodka, a bottle, a bag.
// Stab / shoot them like any vendor (hangkit hurtable: down ~90 s). "Empty your pockets" robs them: some pay, the rest pull a
// blade and fight (they become a chill.js crew member, streamed to friends) and the pitch is empty for a few minutes. CONEY agent.
import * as THREE from 'three';
import { hangkit as K, sell, kit } from '../hangkit.js';
import { buildPerson, peopleReady, wearHat } from '../people.js';
import { buildFigure, nameTag } from '../deli.js';
import { adoptFolk } from './chill.js';
import { chaseQA } from './chase.js';
import { BW } from './shore.js';
import { LM } from './landmarks.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
let HU = null;

const DEFS = [
  // the nutcracker guys: walk the boardwalk with a bag of plastic bottles (Hennessy + juice), stop when you come close
  { name: 'NUTCRACKER', at: () => [-120, 0, BW.z0 + 7], roam: [-260, 60], avatar: 'm18', glasses: false, hat: 'cap', yaw: Math.PI / 2, type: 'st',
    hi: ['Nutcracker, nutcracker! Hennessy, Bacardi, whatever you want!', 'Ten dollars, fam. Strawberry Henny, it\'s crazy.', 'Nutcrackers! Cold! Don\'t tell the cops.'],
    call: ['NUTCRACKER! NUTCRACKER!', 'Nutcrackers, cold!', 'Henny, Henny, nutcracker!'],
    menu: [['nutcracker', 10, 'Nutcracker (strawberry Henny)'], ['nutcracker', 10, 'Nutcracker (Bacardi mango)']] },
  { name: 'NUTCRACKER MAN', at: () => [180, 0, BW.z0 + 7], roam: [60, 330], avatar: 'm04', glasses: true, yaw: -Math.PI / 2, type: 'st',
    hi: ['Nutcracker? Best on the boardwalk, I make it myself.', 'Nutcrackers, ten. Two for eighteen.', 'You look thirsty, my guy.'],
    call: ['Nutcracker!', 'NUTCRACKERS!', 'Cold nutcrackers, ten!'],
    menu: [['nutcracker', 10, 'Nutcracker (Henny + fruit punch)'], ['nutcracker', 9, 'Nutcracker (the cheap one)']] },
  { name: 'ZHORA', at: () => [LM.wheel.x + 9, 0, BW.z0 + 2.2], avatar: 'm10', glasses: true, hat: 'cap', yaw: Math.PI, type: 'ru',
    hi: ['Сигареты, травка, водочка — всё есть, всё тихо.', 'Psst. Boardwalk special. Cigs, spliffs, a little вода жизни.', 'Бурбон, братва, Гудзон — но бурбона нет. Водка есть.'],
    call: ['Сигареты! Недорого!', 'Loosies, spliffs, psst…'],
    menu: [['cigs', 8, 'Pack of Reds'], ['spliff', 12, 'Spliff'], ['vodka', 5, 'Стопка водки'], ['bottle', 15, 'Bottle of vodka'], ['zippo', 20, 'Zippo, brushed chrome']] },
  { name: 'TOLIK', at: () => [-24, null, BW.z1 + 20], avatar: 'm03', glasses: true, hat: 'bucket', cooler: true, yaw: 0, type: 'ru',
    hi: ['Cold beer, cold water! Пиво холодное — Балтика девятка!', 'Ice cold, my friend. Колд. Like my ex-wife.', 'Beer, water, vodka shot — cops don\'t come on the sand, don\'t worry.'],
    call: ['COLD BEER! COLD WATER!', 'Пиво! Холодное пиво!', 'Beer beer beer, cold beer!'],
    menu: [['tallboy', 5, 'Tallboy of Baltika 9'], ['vodka', 4, 'Vodka shot (from the cooler)'], ['guinness', 7, 'Can of Guinness'], ['cigs', 9, 'Pack of Reds'], ['bic', 2, 'Bic lighter']] },
  { name: 'DEE', at: () => [132, null, BW.z1 + 34], avatar: 'm12', tam: true, glasses: true, yaw: -Math.PI / 2, type: 'st',
    hi: ['Ayo, smoke on the beach, fam. Best view in Brooklyn.', 'Bless. Weed, spliffs, cigs if you square.', 'Sun, sand, sensimilla. Talk to me.'],
    call: ['Smoke, smoke…', 'Trees, loosies…'],
    menu: [['weed', 10, 'Bag of weed'], ['spliff', 12, 'Pre-rolled spliff'], ['cigs', 8, 'Pack of Newports… I mean Reds'], ['vape', 14, 'Vape, watermelon ice'], ['bic', 2, 'Bic lighter']] },
  { name: 'ARTUR', at: () => [-14, 0, 64], avatar: 'm20', glasses: false, hat: 'cap', yaw: 0, type: 'ru',
    hi: ['Катались? Теперь выпить надо. Или покурить.', 'After the Cyclone everybody needs a drink, trust me.', 'Сигареты, Jameson, водочка. Для нервов после аттракционов.'],
    call: ['Для нервов! После Циклона!', 'Cigs, shots, psst…'],
    menu: [['cigs', 8, 'Pack of Reds'], ['jameson', 7, 'Shot of Jameson'], ['vodka', 5, 'Стопка водки'], ['bottle', 15, 'Bottle'], ['weed', 10, 'Bag']] },
];
const SOLD = { cigs: 'Держи. B — закурить. Пять штук, не кури все сразу.', spliff: 'Rolled tight. B to light. Share it, don\'t be that guy.', vodka: 'Стопка. B — залпом. Не закусываешь? Уважаю.', bottle: 'Целая бутылка. Иди с друзьями, один не пей.', tallboy: 'Ice cold. B to crack it. Pass it around.', guinness: 'Irish on the beach. Why not.', jameson: 'Jameson. B to shoot it.', weed: 'Bag. B to blaze. Not near the lifeguard.' };

export function buildHustlers(world) {
  const { ctx, W } = world; if (!kit()) return;
  HU = { world, ctx, list: [] };
  for (const d of DEFS) { try { place(d); } catch (e) { console.warn('[hustlers]', d.name, e); } }
  K.onUpdate((dt, playing) => update(dt, playing));
  ctx.bus.on('worldReset', () => { for (const h of HU.list) if (h.gone) respawn(h); });
  if (typeof window !== 'undefined' && window.__game) window.__game.hustlers = { list: () => HU.list.map((h) => ({ name: h.d.name, pos: h.pos.toArray().map((v) => +v.toFixed(2)), gone: !!h.gone, off: !!h.e?.off })), rob: (name, force = null) => { const h = HU.list.find((x) => x.d.name === name); return h ? robHustler(h, force) : null; } };
}
function freeAt(x, z, y) { return !HU.ctx.colliders.some((b) => x > b.min.x - 0.6 && x < b.max.x + 0.6 && z > b.min.z - 0.6 && z < b.max.z + 0.6 && b.max.y > y + 0.2 && b.min.y < y + 1.9); }
function place(d) {
  const { world } = HU; let [x, y, z] = d.at();
  const gy = (x, z) => (y == null ? world.W.groundHeight?.(x, z) ?? 0 : y);
  for (let r = 0, k = 0; r < 14 && !freeAt(x, z, gy(x, z)); k++) { r = 0.5 + k * 0.35; const a = k * 2.4; if (freeAt(x + Math.cos(a) * r, z + Math.sin(a) * r, gy(x + Math.cos(a) * r, z + Math.sin(a) * r))) { x += Math.cos(a) * r; z += Math.sin(a) * r; break; } }
  const pos = new THREE.Vector3(x, gy(x, z), z);
  const h = { d, pos, home: pos.clone(), yaw: d.yaw, gone: 0, callT: 5 + Math.random() * 8, buys: 0 };
  build(h); HU.list.push(h);
  (world.W.mapPOIs || (world.W.mapPOIs = [])).push({ name: `${d.name} (${d.menu.map((m) => m[0]).includes('tallboy') ? 'beer' : 'smoke / booze'})`, x: pos.x, z: pos.z, kind: 'shop' });
}
function build(h) {
  const { world } = HU; const d = h.d;
  const fig = peopleReady() ? buildPerson({ avatar: d.avatar, seed: d.name.length * 7, glasses: d.glasses, tam: d.tam }) : buildFigure({ glasses: d.glasses, tam: d.tam });
  if (d.hat) wearHat(fig, d.hat === 'cap' ? 'cap' : 'bucket', d.hat === 'cap' ? 0x1a2a5a : 0xe8dcc0);
  const tag = nameTag(d.name, '#ffd27a'); tag.position.set(0, 2.15, 0); fig.group.add(tag);
  fig.group.position.copy(h.pos); fig.group.rotation.y = h.yaw; world.scene.add(fig.group); h.fig = fig;
  if (d.cooler && !h.cooler) {   // the cooler: blue tub, white lid, cans on ice
    const g = new THREE.Group(); const blue = new THREE.MeshStandardMaterial({ color: 0x1f5fb0, roughness: 0.5 }), white = new THREE.MeshStandardMaterial({ color: 0xf0f0ea, roughness: 0.6 });
    const tub = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.38, 0.4), blue); tub.position.y = 0.19; g.add(tub); const lid = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.06, 0.42), white); lid.position.set(0, 0.42, -0.12); lid.rotation.x = -1.1; g.add(lid);
    for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.16, 10), new THREE.MeshStandardMaterial({ color: [0x1d3f8a, 0xc0202a, 0x1a1a1a][i % 3], metalness: 0.7, roughness: 0.35 })); c.position.set(-0.2 + i * 0.1, 0.4, 0.05 + (i % 2) * 0.06); c.rotation.z = (i - 2) * 0.12; g.add(c); }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); g.position.copy(h.pos).add(new THREE.Vector3(Math.sin(h.yaw + 1.2) * 0.8, 0, Math.cos(h.yaw + 1.2) * 0.8)); g.rotation.y = h.yaw; world.scene.add(g); h.cooler = g; }
  h.e = K.vendor({ name: d.name, pos: h.pos, r: 2.4, fig, talk: (Kk, again) => talk(h, again) });
}
function talk(h, again) {
  const d = h.d;
  const buy = (item, price) => () => ({ text: `${d.name}: "${sell(item, price, d.name, { ok: SOLD[item] || 'Держи.', broke: pick([`${price} баксов, брат. Не ${price - 1}.`, `That's $${price}. Come back with money.`, 'Бесплатно только сыр в мышеловке.']), full: 'Руки заняты. Hands full — B first.' })}"`, choices: [{ label: pick(['Спасибо', 'Bless', 'Нормально']), go: null }] });
  return {
    text: `${d.name}: "${again ? pick(['Ещё? Давай.', 'Back already? Say less.', 'Постоянный клиент! Скидки нет.']) : pick(d.hi)}"`,
    choices: [...d.menu.map(([item, price, label]) => ({ label: `${label} — $${price}`, go: buy(item, price) })), { label: 'Empty your pockets (rob him)', go: () => robHustler(h) }, { label: 'Later', go: null }],
  };
}
/** rob a hustler: some pay up and walk off for a while, the rest pull a blade (a chill.js crew member from then on) */
function robHustler(h, force = null) {
  const { ctx } = HU; const d = h.d; if (h.gone || h.e?.off) return null;
  const gun = ctx.weapons?.current?.mode !== 'MELEE';
  const comply = force != null ? +force : gun ? 0.55 : 0.3;
  try { chaseQA.crime('rob'); } catch {}
  if (Math.random() < comply) {
    const n = 20 + 5 * Math.floor(Math.random() * 5); K.earn(n); K.toast(`+$${n} off ${d.name}`, 1800);
    h.e.off = true; h.fig.hands = true; setTimeout(() => { if (h.fig) h.fig.hands = false; }, 2500);
    h.offUntil = performance.now() + 120000; ctx.bus.emit('streetCrime', { kind: 'rob', name: d.name, pos: h.pos.clone() });
    return { text: `${d.name}: "${pick(['Ладно, ладно! Бери. Но я запомнил твоё лицо.', 'Aight, aight — take it. You\'re dead on this boardwalk, you know that?', 'Ты меня грабишь? МЕНЯ? …Держи.'])}"`, choices: [{ label: 'Pleasure', go: null }] };
  }
  // he fights: out of the vendor list, into the street systems
  K.closeDialog(); K.removeVendor(h.e); h.gone = performance.now() + 240000;
  const fig = h.fig; h.fig = null;
  strip(fig);
  HU.world.scene.remove(fig.group);
  const t = adoptFolk({ fig, pos: h.pos.clone(), yaw: h.yaw, name: d.name, type: d.type, temper: 'tough', blade: true, cash: 30 + 5 * Math.floor(Math.random() * 6), intent: 'fight' });
  if (t) { t.keep = true; HU.ctx.net?.send?.('folk', { p: [+h.pos.x.toFixed(2), +h.pos.z.toFixed(2)], st: 'take', v: d.name }); }
  return null;
}
/** take the vendor hitbox + name tag off a hustler's figure (chill.js gives him his own) */
function strip(fig) {
  const { ctx } = HU; fig.group.traverse((o) => { if (o.userData?.surface === 'flesh' && o.userData.onHit) { const k = ctx.raycastTargets.indexOf(o); if (k > -1) ctx.raycastTargets.splice(k, 1); o.userData.onHit = null; } });
  for (const c of [...fig.group.children]) if (c.isSprite) fig.group.remove(c);
}
function respawn(h) { h.gone = 0; h.pos.copy(h.home); build(h); }
function update(dt, playing) {
  const { ctx } = HU; const me = ctx.player?.position; if (!me) return; const now = performance.now();
  for (const h of HU.list) {
    if (h.gone) { if (now > h.gone && Math.hypot(me.x - h.home.x, me.z - h.home.z) > 45) respawn(h); continue; }
    if (h.e?.off && h.offUntil && now > h.offUntil && !h.e.hurt?.down) { h.e.off = false; h.offUntil = 0; }
    if (h.d.roam && h.fig && !h.e?.off) { const near = Math.hypot(me.x - h.pos.x, me.z - h.pos.z) < 6; h.dir = h.dir || 1; if (!near) { h.pos.x += h.dir * 1.1 * dt; if (h.pos.x > h.d.roam[1]) h.dir = -1; else if (h.pos.x < h.d.roam[0]) h.dir = 1; h.fig.group.position.copy(h.pos); h.fig.group.rotation.y = h.dir > 0 ? Math.PI / 2 : -Math.PI / 2; } h.fig.update?.(dt, near ? 0 : 1.1); }   // the nutcracker guys stroll
    const d = Math.hypot(me.x - h.pos.x, me.z - h.pos.z);
    if (d < 9 && !h.e?.hurt?.down) { const want = Math.atan2(me.x - h.pos.x, me.z - h.pos.z); h.yaw += Math.atan2(Math.sin(want - h.yaw), Math.cos(want - h.yaw)) * Math.min(1, dt * 3); h.fig.group.rotation.y = h.yaw; }
    h.fig.mood = K.state()?.dialog?.name === h.d.name ? 'talk' : null;
    if (d < 45 && !h.d.roam) h.fig.update(dt, 0);
    h.callT -= dt; if (playing && h.callT <= 0 && d < 25 && d > 4 && !h.e?.off) { h.callT = 14 + Math.random() * 10; if (Math.random() < 0.6) K.toast(`${h.d.name}: "${pick(h.d.call)}"`, 1800); }
  }
}
// friends: someone robbed / started a fight with a hustler → he's gone from his pitch here too (their client owns the fight)
export function hustlerTaken(name) { const h = HU?.list.find((x) => x.d.name === name); if (!h || h.gone) return false; K.removeVendor(h.e); strip(h.fig); HU.world.scene.remove(h.fig.group); h.fig = null; h.gone = performance.now() + 240000; return true; }
