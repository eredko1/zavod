// CONEY — the people of Soccer Tavern (6004 8th Ave, Sunset Park): KENNY behind the bar (Chinese American, dry, cash only,
// knows everybody), three regulars on the stools (UNCLE LOU the Liverpool lifer, MR. WONG who's been "about to leave" since
// 2014, AH FAI the dart-league captain) and the 8th Ave crew at the front high-top — BIG TONY, SONNY and DUCK: they walk up
// to strangers, talk (English with Cantonese), warn you off or give you a job. All hurtable like any hangkit vendor.
// Drinks: Tsingtao, Coors Light, a Guinness pint, Jameson and vodka shots, a bucket. CONEY agent (tavern).
import * as THREE from 'three';
import { hangkit as K, sell, ITEMS, kitQA } from '../hangkit.js';
import { buildPerson, peopleReady } from '../people.js';
import { dressFigure, standTall, buildChar } from '../outfits.js';
import { nameTag } from '../deli.js';
import { tavernPlan } from './tavern.js';

// bar items (registered here, not in hangkit.js: they only exist once the tavern is built)
const NEW_ITEMS = {
  tsingtao: { kind: 'booze', icon: '🍺', name: 'Tsingtao (青島啤酒)', drunk: 0.25, dur: 100, glass: 'can', liq: 0xe8c860 },
  coors: { kind: 'booze', icon: '🍺', name: 'Coors Light', drunk: 0.18, dur: 80, glass: 'can', liq: 0xf2e08a },
  erguotou: { kind: 'booze', icon: '🥃', name: 'Er Guo Tou 二鍋頭 (56%, a shot)', drunk: 0.7, dur: 150, glass: 'shot', liq: 0xeef2f2 },
  chuanr_lamb: { kind: 'food', icon: '🍢', name: 'lamb skewers 羊肉串 (cumin, chili)', food: 35 },
  chuanr_chicken: { kind: 'food', icon: '🍢', name: 'chicken skewers 雞肉串', food: 30 },
  chuanr_tofu: { kind: 'food', icon: '🍢', name: 'grilled tofu skewers 烤豆腐', food: 25 },
  boilermaker: { kind: 'booze', icon: '🍺', name: 'Kenny\'s boilermaker (Tsingtao + a baijiu shot dropped in)', drunk: 0.95, dur: 180, glass: 'pint', liq: 0xe8c860 },
};
const SKIN = 0xd6a987;
let P = null;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const say = (t, ms = 3600) => K.toast(t, ms);

export function buildTavernPeople(world) {
  const { ctx, W } = world; const T = W.tavern; if (!T || !peopleReady()) return;
  for (const [k, v] of Object.entries(NEW_ITEMS)) if (!ITEMS[k]) ITEMS[k] = v;
  const { bar: B, zone: Z } = T, oz = Z.oz, SW = 0.15;
  // positions in the owner's plan (feet): tavern.js's layout frame
  const { lx, lz, LAYOUT } = tavernPlan(), P2 = (x, y, dy = 0) => new THREE.Vector3(lx(x), SW + dy, lz(y) + oz), stools = LAYOUT.bar.stools.long_side.positions;
  void B;
  P = { world, ctx, T, figs: [], t: 0, greeted: false, job: null };
  const person = (o, outfit, h = 1.72) => { const f = buildPerson(o); try { standTall(f, h); if (outfit) dressFigure(f, ctx, { skin: SKIN, ...outfit }); } catch (e) { console.warn('[tavern] dress', e); } world.scene.add(f.group); P.figs.push(f); return f; };
  const tag = (f, name, col) => { const s = nameTag(name, col); s.position.set(0, 1.95 / (f.heightScale || 1), 0); s.scale.multiplyScalar(1 / (f.heightScale || 1)); f.group.add(s); };

  // ---- KENNY, behind the bar ----
  const kenny = person({ avatar: 'm10', seed: 60 }, { top: 'track', jacket: 0x141414, stripe: 0x141414, bottom: 'jeans', denim: 0x22262e }, 1.70);
  const kHome = P2(...LAYOUT.spawn_points_for_npcs.bartender_stand); kenny.group.position.copy(kHome); kenny.group.rotation.y = -Math.PI / 2; tag(kenny, 'KENNY', '#ffd27a');
  P.kenny = { f: kenny, home: kHome, to: kHome.clone(), wait: 3 };
  const kPos = P2(5.8, LAYOUT.spawn_points_for_npcs.bartender_stand[1]);
  const venK = K.vendor({ name: 'KENNY', pos: kPos, r: 2.0, fig: kenny, talk: (Kk, again) => kennyTalk(again) });
  P.kenny.v = venK;
  // Kenny's F point slides along the counter to wherever you stand, so at the bar he's always the one you talk to (the regulars were nearer)
  P.kPos = kPos; P.kz = [lz(13.3) + oz, lz(38.2) + oz];
  // ---- the regulars, on the stools ----
  const reg = [
    { id: 'lou', name: 'UNCLE LOU', seat: 3, o: { avatar: 'm10', seed: 61, pose: 'sit', glasses: 'clear', glassesY: 0.035 }, dress: null },
    { id: 'wong', name: 'MR. WONG', seat: 6, o: { avatar: 'm02', seed: 62, pose: 'sit', glasses: 'clear', glassesY: 0.035 }, dress: { top: 'track', jacket: 0x4a4a52, stripe: 0x4a4a52, bottom: 'jeans', denim: 0x2e2e34 } },
    { id: 'fai', name: 'AH FAI', seat: 9, o: { avatar: 'm10', seed: 63, pose: 'sit' }, dress: { top: 'track', jacket: 0x1f4a8a, stripe: 0xf2f2ee, bottom: 'jeans' } },
  ];
  for (const r of reg) { const f = person(r.o, r.dress, 1.7); const [sx, sy] = stools[r.seat]; f.group.position.copy(P2(sx - 0.25, sy, 0.36)); f.group.rotation.y = Math.PI / 2; tag(f, r.name, '#cfe3ff');
    r.v = K.vendor({ name: r.name, pos: P2(sx + 1.5, sy), r: 1.3, fig: f, noMap: true, talk: (Kk, again) => regularTalk(r.id, again) }); r.f = f; }
  P.reg = reg;
  // THE ELF, from the crew: leaning on the end of the bar with his knife, buying rounds of baijiu for whoever's around
  try { const e = buildChar('elf', ctx); if (e) { e.group.position.copy(P2(7.6, 40.8)); e.group.rotation.y = Math.PI / 2; world.scene.add(e.group); P.figs.push(e); tag(e, 'THE ELF', '#b6ffb0');
    P.elf = { f: e, v: K.vendor({ name: 'THE ELF', pos: P2(9.2, 40.8), r: 1.1, fig: e, noMap: true, talk: (Kk, again) => elfTalk(again) }) }; } } catch (e) { console.warn('[tavern] elf', e); }
  // ---- the crew at the front high-top ----
  const crew = [
    { id: 'tony', name: 'BIG TONY', at: [12.9, 15.5], face: -Math.PI / 2, o: { avatar: 'm10', seed: 70 }, dress: { top: 'track', jacket: 0x0c0c0c, stripe: 0xc9a040, bottom: 'track', pants: 0x0c0c0c }, h: 1.80 },
    { id: 'sonny', name: 'SONNY', at: [14.75, 13.1], face: 0, o: { avatar: 'm02', seed: 71, glasses: true }, dress: { top: 'track', jacket: 0x2a2a2e, stripe: 0x2a2a2e, bottom: 'jeans', denim: 0x15161a }, h: 1.74 },
    { id: 'duck', name: 'DUCK', at: [14.75, 17.9], face: Math.PI, o: { avatar: 'm10', seed: 72 }, dress: null, h: 1.66 },
  ];
  for (const c of crew) { const f = person(c.o, c.dress, c.h); f.group.position.copy(P2(c.at[0], c.at[1])); f.group.rotation.y = c.face; f.mood = 'talk'; tag(f, c.name, '#ff9f8a');
    c.home = f.group.position.clone(); c.face0 = c.face; c.f = f;
    c.v = K.vendor({ name: c.name, pos: f.group.position, r: 1.6, fig: f, noMap: true, talk: (Kk, again) => crewTalk(c.id, again) }); }
  P.crew = crew;
  // ---- the skewer cart next door: AUNTIE LI's 羊肉串 grill on the sidewalk just east of the tavern's door ----
  { const cx = 6.2, cz = oz + 8.3, g = new THREE.Group(); g.position.set(cx, SW, cz); g.scale.setScalar(0.7); world.scene.add(g);   // a small cart
    const mat = (c, e = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.3, emissive: e ? c : 0, emissiveIntensity: e });
    const add = (geo, m, x, y, z) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = true; g.add(me); return me; };
    add(new THREE.BoxGeometry(1.9, 0.85, 0.9), mat(0xb8bcc0), 0, 0.55, 0);   // the steel cart
    add(new THREE.BoxGeometry(1.7, 0.1, 0.55), mat(0x222222), 0, 1.02, -0.1); add(new THREE.BoxGeometry(1.6, 0.03, 0.45), mat(0xff5a1a, 1.4), 0, 1.08, -0.1);   // the grill, glowing coals
    for (let k = 0; k < 9; k++) add(new THREE.BoxGeometry(0.02, 0.02, 0.62), mat(0x7a3b1a), -0.72 + k * 0.18, 1.13, -0.1);   // skewers on the grill
    for (const [x, z] of [[-0.8, -0.35], [0.8, -0.35], [-0.8, 0.35], [0.8, 0.35]]) { const w = add(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 12), mat(0x151515), x, 0.13, z); w.rotation.x = Math.PI / 2; }
    add(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), mat(0x888888), 0.7, 1.6, 0.3); const um = add(new THREE.ConeGeometry(1.3, 0.45, 12), mat(0xc8201e), 0.7, 2.75, 0.3); um.castShadow = false;
    const c = document.createElement('canvas'); c.width = 256; c.height = 96; const cg = c.getContext('2d'); cg.fillStyle = '#c8201e'; cg.fillRect(0, 0, 256, 96); cg.fillStyle = '#ffe07a'; cg.textAlign = 'center'; cg.font = '700 40px "PingFang TC","Heiti TC","Noto Sans CJK TC",sans-serif'; cg.fillText('羊肉串', 128, 44); cg.font = '700 20px Arial'; cg.fillStyle = '#fff'; cg.fillText('MEAT · CHICKEN · TOFU  $2-3', 128, 80);
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.68), new THREE.MeshStandardMaterial({ map: tx, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: 0.35 })); sg.position.set(0, 0.55, -0.46); sg.rotation.y = Math.PI; g.add(sg);
    world.box([cx - 0.7, 0, cz - 0.35], [cx + 0.7, 0.85, cz + 0.35]);
    const li = person({ avatar: 'f17', seed: 88 }, { top: 'track', jacket: 0x7a1414, stripe: 0x7a1414, bottom: 'jeans' }, 1.58); li.group.position.set(cx - 0.15, SW, cz + 0.65); li.group.rotation.y = Math.PI; tag(li, 'AUNTIE LI', '#ffd27a');
    P.li = { f: li, v: K.vendor({ name: 'AUNTIE LI', pos: new THREE.Vector3(cx, SW, cz - 0.9), r: 1.6, fig: li, talk: (Kk, again) => liTalk(again) }) }; }
  // the job drop: the N entrance on 8th Ave
  const drop = new THREE.Vector3(17.2, SW, oz - 7.6);
  { const wb = person({ avatar: 'm10', seed: 80 }, { top: 'track', jacket: 0x23446e, stripe: 0xe8e8e8, bottom: 'jeans' }, 1.68); wb.group.position.set(18.0, SW, oz - 8.0); wb.group.rotation.y = -0.9; P.wb = wb; }
  K.spot({ pos: drop, r: 1.8, dy: 2, when: () => P.job === 'envelope', prompt: 'F — HAND THE ENVELOPE TO THE GUY IN THE WINDBREAKER', act: () => { P.job = 'paid'; K.earn(40); say('Guy in the windbreaker: «Tony sent you? …Good. Now forget my face.» (+$40 — Big Tony pays on delivery)', 4200); } });
  world.updaters.push((dt) => { try { update(dt); } catch (e) { if (!P.warned) { P.warned = true; console.warn('[tavern] people', e); } } });
  if (typeof window !== 'undefined' && window.__game) window.__game.tavernPeople = { kit: kitQA, kenny: () => kPos.toArray(), crew: () => crew.map((c) => ({ name: c.name, pos: c.f.group.position.toArray().map((v) => +v.toFixed(2)) })), job: () => P.job, greeted: () => P.greeted, talk: (id) => { const c = crew.find((c) => c.id === id); K.openDialog(c.name, crewTalk(c.id, false)); } };
  console.log('[tavern] people:', P.figs.length);
}

// ---- dialog ----------------------------------------------------------------------------------------------------------------
const KENNY_Q = [
  'KENNY: «Norwegians opened this place in 1929. The Irish kept it. Now me. 我係老闆嘅朋友 — I\'m the owner\'s friend. Same thing.»',
  'KENNY: «Mr. Wong has been "about to leave" since 2014. Don\'t hold the door for him. He takes it personal.»',
  'KENNY: «Darts league is Tuesday. Ah Fai throws like his wife is watching. She is. From Guangzhou. On FaceTime.»',
  'KENNY: «WiFi password? "cashonly". No spaces. Like the bar.»',
  'KENNY: «飲多啲，講少啲. Drink more, talk less. Old Cantonese proverb. I made it up Tuesday.»',
  'KENNY: «Liverpool. Always Liverpool on that TV. Don\'t ask Uncle Lou about Istanbul 2005, he cries, then he buys a round. Actually — ask him.»',
  'KENNY: «The flags? Norway for the old guys, Ireland for the owner, America for the landlord.»',
  'KENNY: «Big Tony? He\'s a businessman. What business? 唔好問. Don\'t ask.»',
  'KENNY: «Somebody asked me for a mojito once. We don\'t talk about him. He went to Park Slope.»',
];
function menu(after) {
  const buy = (item, price, ok) => () => ({ text: `KENNY: «${sell(item, price, 'KENNY', { ok, broke: `That\'s $${price}. 冇錢就冇酒 — no money, no drink. ATM\'s on the corner. It\'s broken.`, full: 'Your hands are full, 朋友. Drink something first (B).' })}»`, choices: [{ label: 'Another round', go: () => after() }, { label: 'Thanks, Kenny', go: null }] });
  return [
    { label: 'Er Guo Tou 二鍋頭, 56% — $2', go: buy('erguotou', 2, 'Er Guo Tou. Two dollars. Tastes like a bus fire. 乾杯 — bottoms up.') },
    { label: 'Boilermaker (Tsingtao + baijiu) — $4', go: buy('boilermaker', 4, 'Drop the shot in, drink it all. House special. Nobody finishes two. Tony finished three, once.') },
    { label: 'Tsingtao 青島 — $3', go: buy('tsingtao', 3, 'Tsingtao. Cold. 飲勝! (B to drink)') },
    { label: 'Vodka, a shot — $3', go: buy('vodka', 3, 'Vodka. The Russians from Brighton drink it like this too. Then they sing.') },
    { label: 'Jameson, a shot — $4', go: buy('jameson', 4, 'Jameson. The Irish holy water. Sláinte — 飲勝.') },
    { label: 'Pint of Guinness — $5', go: buy('guinness', 5, 'Give it a minute to settle. …Okay, you didn\'t. That\'s on you.') },
    { label: 'Coors Light — $2', go: buy('coors', 2, 'Coors Light. Basically water with a sponsorship deal.') },
    { label: 'A bucket (5 Tsingtao) — $12', go: () => { if ((K.state()?.cash ?? 0) < 12) return { text: 'KENNY: «Twelve for the bucket. Count again.»', choices: [{ label: 'Ok', go: null }] };
      let n = 0; K.pay(12); for (let i = 0; i < 5; i++) if (K.give('tsingtao')) n++; if (n < 5) K.earn((5 - n) * 2);
      return { text: `KENNY: «Bucket of five. ${n < 5 ? `Your hands only took ${n} — rest is back in your pocket.` : 'Share it. B passes it round when your friends are close.'} 乾杯!»`, choices: [{ label: '乾杯!', go: null }] }; } },
  ];
}
const ELF = ['THE ELF: «Kenny pours like it\'s 1929 and he\'s scared of the cops. I like Kenny.»', 'THE ELF: «Er Guo Tou is not a drink. It\'s a decision.»', 'THE ELF: «Ah Fai took forty from me at darts. I\'m taking it back tonight. Three boilermakers in. Perfect conditions.»', 'THE ELF: «Sunset Park has better dumplings than Brighton. Say that in Brighton and see what happens.»'];
function elfTalk(again) {
  return { text: again ? pick(ELF) : 'THE ELF: «Bratan! Sit. Kenny — a round of the two-dollar stuff. On me. Everybody drinks.»', choices: [
    { label: 'Take the shot (on the Elf)', go: () => { const ok = K.give('erguotou'); return { text: ok ? 'THE ELF: «Za nas! 乾杯!» (He slides you an Er Guo Tou. B to drink.)' : 'THE ELF: «Your hands are full, bratan. Drink what you got first.»', choices: [{ label: 'Za nas', go: null }] }; } },
    { label: 'Tell me something', go: () => ({ text: pick(ELF), choices: [{ label: 'Ha', go: null }] }) }, { label: 'Later', go: null }] };
}
const LI = ['AUNTIE LI: «Lamb is best. Cumin, chili, 孜然. Tofu is for Mr. Wong, he is on a diet since 2014.»', 'AUNTIE LI: «Twenty years on this corner. Norwegians, Irish, now us. Everybody eats skewers.»', 'AUNTIE LI: «Kenny sends drunk people to me. I send them back to Kenny. Good business.»', 'AUNTIE LI: «Chicken is for children and Duck. …Yes, Duck eats chicken. Don\'t tell him it\'s funny.»'];
function liTalk(again) {
  const buy = (item, price, ok) => () => ({ text: `AUNTIE LI: «${sell(item, price, 'AUNTIE LI', { ok, broke: `$${price}. 冇錢? No money, no skewer.`, full: 'Your hands are full. Eat something first (B).' })}»`, choices: [{ label: 'Another one', go: () => liTalk(true) }, { label: '多謝, thanks', go: null }] });
  return { text: again ? pick(LI) : 'AUNTIE LI: «羊肉串! Hot off the grill. Meat, chicken, tofu. Cash.»', choices: [
    { label: 'Lamb skewers 羊肉串 — $3', go: buy('chuanr_lamb', 3, 'Lamb, extra cumin, little chili. Careful, hot. (B to eat)') },
    { label: 'Chicken skewers 雞肉串 — $2', go: buy('chuanr_chicken', 2, 'Chicken. Crispy skin. Good with Tsingtao from Kenny.') },
    { label: 'Tofu skewers 烤豆腐 — $2', go: buy('chuanr_tofu', 2, 'Tofu, five-spice, chili oil. The healthy one. Healthy-ish.') },
    { label: 'Later', go: null }] };
}
function kennyTalk(again) {
  const node = () => ({ text: again ? pick(KENNY_Q) : 'KENNY: «Soccer Tavern. Cash only, cheapest pour on 8th Ave. 你好 — what are you having?»', choices: [...menu(node), { label: 'Who\'s who in here?', go: () => ({ text: 'KENNY: «Stools: Uncle Lou — Liverpool. Mr. Wong — leaving, supposedly. Ah Fai — darts captain, don\'t bet him. Front table: Big Tony, Sonny, Duck. Be polite. Tip Duck, he remembers.»', choices: [{ label: 'Got it', go: null }] }) }, { label: 'Put it on my tab?', go: () => ({ text: 'KENNY: «冇數賒. No tabs. Not since 1929. There\'s a sign. There are three signs.»', choices: [{ label: 'Fair', go: null }] }) }, { label: 'Later', go: null }] });
  return node();
}
const REG = {
  lou: { hi: 'UNCLE LOU: «Sit, sit. You see that? That\'s Liverpool. I been a Red since \'77. My wife says I love Liverpool more than her. I say 老婆, Liverpool never took the car.»',
    lines: ['UNCLE LOU: «Istanbul, 2005. Three-nil down at half time. I was on this stool. THIS stool. Kenny, tell them.»', 'UNCLE LOU: «Sunset Park in the eighties — Norwegian bakeries, Irish bars, us. Now it\'s bubble tea. I like bubble tea. Don\'t tell Kenny.»', 'UNCLE LOU: «You\'ll never walk alone. Unless you owe Tony money. Then you walk VERY alone.»'] },
  wong: { hi: 'MR. WONG: «I\'m just finishing this one. Then I\'m going. …Kenny, one more.»',
    lines: ['MR. WONG: «My son is a dentist in New Jersey. He says "Dad, come live with us." New Jersey? 唔該, no thanks.»', 'MR. WONG: «The N train is late. The N is always late. I have been waiting for the N since 1991. Spiritually.»', 'MR. WONG: «Leaving now. …After the half.»'] },
  fai: { hi: 'AH FAI: «You throw? Tuesday is league night. Brooklyn Dart League — we won six. The trophies are over the boards. Count them.»',
    lines: ['AH FAI: «Treble twenty is for show. Nineteens win games. Old guys know.»', 'AH FAI: «Double out. You don\'t finish on a double, you don\'t finish. Like life.»', 'AH FAI: «501 is a marathon. 301 is a sprint. Tony only plays 301, he has a short attention span. Don\'t tell him I said that.»'] },
};
function regularTalk(id, again) {
  const r = REG[id]; const ch = [{ label: 'Tell me something', go: () => ({ text: pick(r.lines), choices: [{ label: 'Ha', go: null }, { label: 'Another', go: () => ({ text: pick(r.lines), choices: [{ label: 'Ha', go: null }] }) }] }) }];
  if (id === 'lou') ch.push({ label: 'Buy Uncle Lou a Guinness — $8', go: () => { if (!K.pay(8)) return { text: 'UNCLE LOU: «With what, your good looks? Ha!»', choices: [{ label: 'Ok', go: null }] }; return { text: 'UNCLE LOU: «A gentleman! In this bar! Kenny, write this down — 靚仔 here bought me a pint.» (He tells the whole bar. Big Tony nods at you.)', choices: [{ label: 'Cheers, Lou', go: null }] }; } });
  ch.push({ label: 'Later', go: null });
  return { text: again ? pick(r.lines) : r.hi, choices: ch };
}
const CREW = {
  tony: ['BIG TONY: «You\'re not from 8th Avenue. I know everybody on 8th Avenue. I know their mothers.»', 'BIG TONY: «Relax. We\'re businessmen. 做生意 — we do business. You look like somebody who needs business.»', 'BIG TONY: «The bakery on the corner? My cousin. The fruit stand? Other cousin. The driving school? Don\'t take lessons there. Cousin.»'],
  sonny: ['SONNY: «Nice shoes. Coney Island? 大佬 says Coney people are all gamblers. You gamble? We play darts. For money.»', 'SONNY: «Sunglasses inside? It\'s a look. 你唔明. You wouldn\'t get it.»', 'SONNY: «I have three phones. One for my mother, one for Tony, one for the phone I lost.»'],
  duck: ['DUCK: «They call me Duck because of the roast duck place. I don\'t work there. I just go there. A lot.»', 'DUCK: «Tony says be nice to strangers. I\'m being nice. This is nice. 係咪?»', 'DUCK: «I lost forty dollars to Ah Fai at darts. Forty. He threw with his wrong hand. To teach me.»'],
};
function crewTalk(id, again) {
  const lines = CREW[id];
  const ch = [{ label: 'What do you guys do?', go: () => ({ text: pick(lines), choices: [{ label: 'Okay…', go: null }] }) }];
  if (id === 'tony') {
    if (!P.job || P.job === 'paid') ch.push({ label: 'Got any work?', go: () => { P.job = 'envelope'; return { text: 'BIG TONY: «Easy job. Take this envelope to the guy in the windbreaker by the N train, across the street. Don\'t open it. Don\'t count it. 唔好問. Forty dollars when he gets it.» (F at the N entrance)', choices: [{ label: 'On it', go: null }] }; } });
    else if (P.job === 'envelope') ch.push({ label: 'About the envelope…', go: () => ({ text: 'BIG TONY: «Why are you still here? The N. Across the street. Windbreaker. 快啲!»', choices: [{ label: 'Going', go: null }] }) });
  }
  // the side business: SONNY has the green, DUCK has the white. Quietly, at the table, not in front of Kenny
  if (id === 'sonny') ch.push({ label: 'You holding?', go: () => ({ text: 'SONNY: «Shh. 細聲啲. Not so loud, Kenny runs a clean bar. …What you need?»', choices: [
    { label: 'Bag of weed — $10', go: () => ({ text: sell('weed', 10, 'SONNY', { ok: 'SONNY: «Smoke it in the yard, not in here. Kenny smells it, we both get thrown out.» (B)', broke: 'SONNY: «Ten bucks. You got ten bucks? No? 冇錢冇得傾.»' }), choices: [{ label: 'Thanks', go: null }] }) },
    { label: 'Fat blunt — $20', go: () => ({ text: sell('blunt', 20, 'SONNY', { ok: 'SONNY: «Rolled it myself. Out back. Go slow, it\'s strong.» (B)', broke: 'SONNY: «Twenty. Come back with twenty.»' }), choices: [{ label: 'Thanks', go: null }] }) },
    { label: 'Nah', go: null }] }) });
  if (id === 'duck') ch.push({ label: 'Heard you got something stronger…', go: () => ({ text: 'DUCK: «Who told you? …Sonny told you. Okay. Forty. Bathroom, not the table. Tony doesn\'t like it at the table.»', choices: [
    { label: 'Bag of coke — $40', go: () => ({ text: sell('coke', 40, 'DUCK', { ok: 'DUCK: «You didn\'t get it from me. You don\'t know me. I\'m Duck from the duck place.» (B)', broke: 'DUCK: «Forty. Not thirty-five. Forty. I lost forty at darts, I need forty.»' }), choices: [{ label: 'Thanks', go: null }] }) },
    { label: 'Never mind', go: null }] }) });
  if (id === 'sonny') ch.push({ label: 'Can I sit here?', go: () => ({ text: 'SONNY: «This table is reserved. Since 1998. For us. The bar is right there, 朋友. Kenny will take care of you.»', choices: [{ label: 'Sure', go: null }] }) });
  ch.push({ label: 'Later', go: null });
  return { text: again ? pick(lines) : lines[0], choices: ch };
}

// ---- behaviour: Kenny works the bar, the regulars watch the match, the crew walks up to strangers --------------------------
const _v = new THREE.Vector3();
function walkTo(f, to, dt, sp = 1.1) { const g = f.group.position; _v.set(to.x - g.x, 0, to.z - g.z); const d = _v.length(); if (d < 0.08) { f.update(dt, 0); return true; } _v.multiplyScalar(Math.min(d, sp * dt) / d); g.add(_v); f.group.rotation.y = Math.atan2(_v.x, _v.z); f.update(dt, sp); return false; }
function face(f, x, z, dt) { const want = Math.atan2(x - f.group.position.x, z - f.group.position.z); let d = want - f.group.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); f.group.rotation.y += d * Math.min(1, dt * 4); }
function update(dt) {
  const { ctx, T } = P; const me = ctx.player?.position; if (!me) return;
  const inZone = T.inZone(me), vis = inZone && Math.abs(me.z - T.zone.oz - 20) < 40;
  for (const f of P.figs) f.group.visible = vis;
  if (!vis) return; P.t += dt;
  const inBar = T.inBar(me), dlg = K.state()?.dialog?.name;
  if (!dlg) P.kPos.z = Math.max(P.kz[0], Math.min(P.kz[1], me.z));
  // Kenny: drifts along the aisle (pouring, wiping), turns to whoever's at the bar; stops for you
  const k = P.kenny; if (k.v.hurt?.down) { k.f.update(dt, 0); } else if (dlg === 'KENNY' || (inBar && Math.hypot(me.x - k.v.pos.x, me.z - k.v.pos.z) < 2.2)) { k.f.update(dt, 0); face(k.f, me.x, me.z, dt); }
  else { if (walkTo(k.f, k.to, dt, 0.8)) { k.wait -= dt; if (k.wait < 0) { k.wait = 3 + Math.random() * 6; k.to.set(k.home.x, k.home.y, k.home.z - 3 + Math.random() * 7); } } }
  P.wb?.update(dt, 0); if (P.li) { P.li.f.update(dt, 0); if (dlg === 'AUNTIE LI') face(P.li.f, me.x, me.z, dt); }
  P.elf?.f.update(dt, 0); if (P.elf && dlg === 'THE ELF') face(P.elf.f, me.x, me.z, dt);
  for (const r of P.reg) { r.f.update(dt, 0); if (dlg === r.name) face(r.f, me.x, me.z, dt); }
  // the crew: when a stranger walks in, BIG TONY comes over, says his piece, goes back to the table
  for (const c of P.crew) {
    if (c.v.hurt?.down) { c.f.update(dt, 0); continue; }
    if (c.id === 'tony' && !P.greeted && inBar && !dlg) { const tgt = _v.set(me.x, 0, me.z); const d = Math.hypot(me.x - c.f.group.position.x, me.z - c.f.group.position.z);
      if (d > 1.5) { walkTo(c.f, { x: me.x - (me.x - c.f.group.position.x) / d * 1.4, z: me.z - (me.z - c.f.group.position.z) / d * 1.4 }, dt, 1.3); c.approach = (c.approach || 0) + dt; if (c.approach > 12) P.greeted = true; }
      else { P.greeted = true; c.back = true; say(pick(['BIG TONY: «New face. 你邊度嚟㗎? Where you from? …Coney Island. Okay. Kenny\'s good people. Be good people.»', 'BIG TONY: «Hey. 8th Avenue has rules. Rule one: tip Kenny. Rule two: don\'t sit at our table. Rule three: I\'ll tell you rule three later.»', 'BIG TONY: «You play darts? Ah Fai will take your money. If Ah Fai doesn\'t, I will. Welcome to Soccer Tavern.»']), 5200); }
      continue; }
    if (c.back) { if (walkTo(c.f, c.home, dt, 1.0)) { c.back = false; c.f.group.rotation.y = c.face0; } continue; }
    if (dlg === c.name) { c.f.update(dt, 0); face(c.f, me.x, me.z, dt); continue; }
    c.f.update(dt, 0); if (!inBar) { c.f.group.position.copy(c.home); c.f.group.rotation.y = c.face0; }
  }
  if (!inBar && P.greeted && !P.crew[0].back && Math.hypot(me.x - 0, me.z - T.zone.oz - 10) > 30) P.greeted = false;   // gone a while: they'll greet you again next time
  // bar chatter while you're inside
  P.chatT = (P.chatT ?? 8) - dt; if (inBar && !dlg && P.chatT < 0) { P.chatT = 14 + Math.random() * 12; say(pick([...KENNY_Q.slice(0, 5), ...REG.lou.lines, ...REG.wong.lines, ...CREW.duck, 'SONNY: «Duck, 你又輸錢? You lost AGAIN?»', 'DUCK: «Kenny, 再嚟一支 — one more Tsingtao.»', 'UNCLE LOU: «GOAL! …Offside. Aiya.»']), 3800); }
}
export const tavernPeople = () => P;
