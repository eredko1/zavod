// CONEY locals — characters with little side-quests, all on the hangkit:
//  · POPS, a cranky old-timer who cruises the neighborhood in his green cart. Listen to him ramble (or hand him a sip of your
//    40) and he rolls with you for 3 minutes blasting mercs with his old pump shotgun. Cruising is on the wall clock (every
//    client sees him in the same spot); who he's riding with is a net event; the rider's own client applies his damage.
//  · SHADES, working the boardwalk: $10 designer sunglasses. They come with crabs. Sammy sells the special lotion.
//  · NET GOST MARKET (the Russian grocery by the park): OLGA sells marinated shashlik + kvass. Grill the meat on the mangal at
//    Table Park and eat it off the skewer: the golden Deagle.
import * as THREE from 'three';
import { hangkit as K, sell } from '../hangkit.js';
import { buildFigure, nameTag, buildDeli, buildWalker } from '../deli.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _rc = new THREE.Raycaster();
let L = null;

export function buildLocals(world, H) {
  const { ctx, W, scene } = world;
  L = { world, ctx, H, pops: null };
  try { buildPops(world, H); } catch (e) { console.warn('[locals] pops', e); }
  try { buildShades(world); } catch (e) { console.warn('[locals] shades', e); }
  try { buildMarket(world, H); } catch (e) { console.warn('[locals] market', e); }
  ctx.bus.on('net:grill', () => { if (L?.grill) K.puff(L.grill.pos.clone().add(new THREE.Vector3(0, 1.0, 0))); });
  ctx.bus.on('net:pops', (m) => { if (L?.pops && typeof m.f === 'string') { L.pops.leader = m.f; L.pops.until = performance.now() + Math.min(200, +m.u || 180) * 1000; } });
  if (typeof window !== 'undefined' && window.__game) window.__game.locals = { pops: () => L.pops && { pos: L.pops.pos.toArray().map((v) => +v.toFixed(1)), leader: L.pops.leader, left: Math.max(0, Math.round((L.pops.until - performance.now()) / 1000)), kills: L.pops.kills }, recruit: () => recruit(), grill: () => L.grill && { state: L.grill.state }, market: () => L.market && { counter: L.market.counter.toArray(), cashier: L.market.sammy.toArray(), door: L.market.door.toArray(), face: L.market.face }, mangal: () => L.grill && L.grill.pos.toArray() };
}

// ---------------------------------------------------------------------------------------------------------------------------
// POPS
function buildPops(world, H) {
  const { ctx, W, scene } = world;
  // the cart: a little green utility cart with a white canopy, POPS behind the wheel
  const g = new THREE.Group(); scene.add(g);
  const M = (c, r = 0.6, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const green = M(0x2f6b3a, 0.45, 0.2), white = M(0xe8e6de, 0.7), black = M(0x151515, 0.8), chrome = M(0xb8bcc0, 0.3, 0.8);
  const box = (m, w, h, d, x, y, z) => { const e = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); e.position.set(x, y, z); e.castShadow = true; g.add(e); return e; };
  box(green, 1.3, 0.45, 2.4, 0, 0.55, 0); box(green, 1.3, 0.6, 0.5, 0, 0.95, 0.95); box(black, 1.1, 0.12, 0.8, 0, 0.85, -0.05); box(black, 1.1, 0.6, 0.12, 0, 1.15, -0.4);
  box(white, 1.4, 0.06, 2.0, 0, 2.05, 0.05); for (const [x, z] of [[-0.62, -0.85], [0.62, -0.85], [-0.62, 0.95], [0.62, 0.95]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.25), chrome); p.position.set(x, 1.45, z); g.add(p); }
  for (const [x, z] of [[-0.65, -0.8], [0.65, -0.8], [-0.65, 0.8], [0.65, 0.8]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.18, 14), black); w.rotation.z = Math.PI / 2; w.position.set(x, 0.26, z); g.add(w); }
  { const sw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 16), black); sw.position.set(-0.3, 1.25, 0.55); sw.rotation.x = -0.9; g.add(sw); }
  const pops = buildFigure({ pose: 'sit', skin: 0x8a5a3c, hair: 0xd8d8d2, beard: true, beardColor: 0xcfcfc8, shirt: 0x5b6b3a, pants: 0x3b3f4a, belly: 0.35, glasses: true, shortSleeve: false });
  pops.group.position.set(-0.3, 0.4, -0.1); g.add(pops.group);   // faces +z, the cart's front
  { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.07, 14), M(0x1c2a44)); cap.position.set(0, 0.92, 0.01); pops.head.add(cap); const brim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.12), M(0x1c2a44)); brim.position.set(0, 0.89, 0.12); pops.head.add(brim); }
  const tag = nameTag('POPS'); tag.position.set(0, 2.45, 0); g.add(tag);
  const flash = new THREE.PointLight(0xffc070, 0, 10); flash.position.set(0.6, 1.4, 0); g.add(flash);
  // cruise route: a loop through the neighborhood on the AI nav floor (Table Park → W 8th St → the boardwalk → back)
  const start = W.onlineStart || [220, 0, -380];
  const anchors = [[start[0] + 6, start[2] + 6], [330, -300], [372, -180], [330, 120], [200, 146], [60, 146], [120, -60], [180, -250]];
  let route = [];
  const nav = ctx.ai?.nav;
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i], b = anchors[(i + 1) % anchors.length];
    let seg = null; try { if (nav?.findPath) seg = nav.findPath(new THREE.Vector3(a[0], 0, a[1]), new THREE.Vector3(b[0], 0, b[1]), { maxExpand: 60000 }); } catch {}
    if (seg && seg.complete !== false && seg.length) route.push(...seg.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
    else route.push(new THREE.Vector3(a[0], 0, a[1]), new THREE.Vector3(b[0], 0, b[1]));
  }
  // cumulative lengths → position by wall-clock time (shared by every client)
  const cum = [0]; for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + route[i].distanceTo(route[i - 1])); const LEN = cum[cum.length - 1] + route[0].distanceTo(route[route.length - 1]);
  const along = (s, out) => { s = ((s % LEN) + LEN) % LEN; let i = 0; while (i < cum.length - 1 && cum[i + 1] < s) i++; const a = route[i], b = route[(i + 1) % route.length], seg = (i + 1 < cum.length ? cum[i + 1] : LEN) - cum[i]; return out.copy(a).lerp(b, seg > 0 ? (s - cum[i]) / seg : 0); };
  const P = L.pops = { g, fig: pops, flash, pos: new THREE.Vector3(), yaw: 0, leader: null, until: 0, fireT: 1, kills: 0, talking: false, stopUntil: 0, lastPos: new THREE.Vector3(), rambled: false };
  along(0, P.pos); g.position.copy(P.pos);
  const SPEED = 4.2, gy = (x, z, y) => { const f = world.W.groundHeight ? world.W.groundHeight(x, z) : 0; return Number.isFinite(f) && Math.abs(f - y) < 3 ? f : y; };
  K.vendor({ name: 'POPS', pos: P.pos, r: 3.0, talk: (Kk, again) => popsTalk(again) });
  K.onUpdate((dt) => {
    const now = performance.now(); const me = ctx.player;
    const riding = P.leader && now < P.until; if (!riding && P.leader) { if (P.leader === 'me' || P.leader === ctx.net?.id) ctx.hud?.toast?.('POPS: "Alright, my stories are on. I\'m out."', 2200); P.leader = null; }
    const talkingNow = K.state()?.dialog?.name === 'POPS';
    // pull over for anyone who walks up to the cart (then catch back up with the route)
    if (!P.leader) { let near = Math.hypot(me.position.x - P.pos.x, me.position.z - P.pos.z) < 5; if (!near && ctx.net?.list) for (const id of ctx.net.list()) { const q = ctx.net.peer(id); if (q?.pos && Math.hypot(q.pos.x - P.pos.x, q.pos.z - P.pos.z) < 5) { near = true; break; } } if (near) P.stopUntil = now + 2500; }
    let target = null;
    if (riding) {   // follow whoever he's riding with, 5 m off their shoulder
      const lp = (P.leader === 'me' || P.leader === ctx.net?.id) ? me.position : ctx.net?.peer?.(P.leader)?.pos;
      if (lp) { _v.set(lp.x - P.pos.x, 0, lp.z - P.pos.z); const d = _v.length(); target = d > 7 ? _v2.copy(lp).addScaledVector(_v.normalize(), -5) : null; }
    } else if (!talkingNow && now > P.stopUntil) target = along((Date.now() / 1000) * SPEED, _v2);
    if (target) { const dx = target.x - P.pos.x, dz = target.z - P.pos.z, d = Math.hypot(dx, dz); const step = Math.min(d, (riding ? 9 : SPEED) * dt * (riding ? 1 : 3));
      if (riding || d > 40) { P.pos.x += dx / (d || 1) * Math.min(d, riding ? 9 * dt : d); P.pos.z += dz / (d || 1) * Math.min(d, riding ? 9 * dt : d); } else { P.pos.x += dx / (d || 1) * step; P.pos.z += dz / (d || 1) * step; }
      if (d > 0.05) { const want = Math.atan2(dx, dz); let dd = want - P.yaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); P.yaw += dd * Math.min(1, dt * 4); }
      P.pos.y = gy(P.pos.x, P.pos.z, target.y ?? P.pos.y); }
    if (talkingNow) { const want = Math.atan2(me.position.x - P.pos.x, me.position.z - P.pos.z); P.yaw += Math.atan2(Math.sin(want - P.yaw), Math.cos(want - P.yaw)) * Math.min(1, dt * 3); P.stopUntil = now + 4000; }
    g.position.copy(P.pos); g.rotation.y = P.yaw; pops.update(dt);
    // riding with you: blast the nearest merc in sight every ~1.4 s (only the rider's client deals the damage)
    P.flash.intensity = Math.max(0, P.flash.intensity - dt * 40);
    if (riding) {
      P.fireT -= dt; if (P.fireT > 0) return; P.fireT = 1.2 + Math.random() * 0.5;
      const eye = _v.copy(P.pos).add(new THREE.Vector3(0, 1.7, 0)); let best = null, bd = 32;
      for (const s of ctx.ai?.soldiers || []) { if (!s || s.dead || !s.position) continue; const d = s.position.distanceTo(P.pos); if (d < bd && clearShot(eye, s.chest ? s.chest(new THREE.Vector3()) : s.position)) { bd = d; best = s; } }
      if (!best) return;
      const at = best.chest ? best.chest(new THREE.Vector3()) : best.position.clone(); P.flash.intensity = 30; P.yaw = Math.atan2(at.x - P.pos.x, at.z - P.pos.z);
      try { ctx.bus.emit('shot', { origin: eye.clone(), dir: at.clone().sub(eye).normalize(), weapon: 'ak', who: 'enemy', hit: true }); } catch {}
      if (P.leader === 'me' || P.leader === ctx.net?.id) { const hs = Math.random() < 0.25; const wasDead = best.dead; ctx.ai.damage(best, hs ? 200 : 55 + Math.random() * 25, at, hs); if (!wasDead && best.dead) { P.kills++; if (Math.random() < 0.5) ctx.hud?.toast?.(['POPS: "That\'s for 1977!"', 'POPS: "Get off my boardwalk!"', 'POPS: "Still got it!"', 'POPS: "Tell your mama Pops said hi!"'][Math.floor(Math.random() * 4)], 1800); } }
    }
  });
}
function clearShot(a, b) {
  const d = a.distanceTo(b); _rc.set(a, _v2.subVectors(b, a).normalize()); _rc.near = 0.5; _rc.far = d - 0.6;
  try { for (const h of _rc.intersectObjects(L.ctx.raycastTargets, false)) { const u = h.object.userData; if (u.soldier || u.noLOS || u.remote) continue; return false; } } catch { return false; }
  return true;
}
function recruit() {
  const P = L.pops; if (!P) return; P.leader = 'me'; P.until = performance.now() + 180000; P.rambled = true;
  L.ctx.net?.send?.('pops', { u: 180 }); L.ctx.hud?.toast?.('POPS is rolling with you for 3 minutes', 2400);
}
// his rambling: a few minutes of it, one line at a time — or a sip of your 40 gets straight to business
function popsTalk(again) {
  const P = L.pops; const riding = P.leader && performance.now() < P.until;
  if (riding) return { text: 'POPS: "I\'m already with you! Keep your head down and let Pops work."', choices: [{ label: 'Thanks, Pops', go: null }] };
  const sip = K.has('forty') ? [{ label: 'Here, Pops — have a sip of my 40', go: () => { K.take('forty'); recruit(); return { text: 'POPS: "Ohhh, Olde English. My doctor says no. My doctor is dead. …Alright! Let\'s go bust some heads!"', choices: [{ label: 'Let\'s ride', go: null }] }; } }] : [];
  const RAMBLE = [
    'You know why the pigeons on this boardwalk don\'t blink? Cameras. Government puts \'em in during the \'78 blackout. I was there. I saw a pigeon charging on a payphone.',
    'I was in the Navy, see. Stationed with a dolphin named Carl. Carl owed me forty dollars. They reassigned him to Florida. Convenient, right? RIGHT?',
    'The Cyclone? Built by the same people who built the moon. Not the landing — the MOON. Why do you think it rattles? It remembers.',
    'Back in my day a slice was a nickel and the nickel was made of real nickel. Now it\'s zinc! ZINC! You\'re chewing on a battery and they call it progress.',
    'My second wife left me for a man who sold hot dogs out of a canoe. On the Belt Parkway. You think I\'m lying. I got the canoe. It\'s in my closet.',
    'Them mercenaries? Amateurs. In \'64 we fought off a biker gang with nothing but a folding chair and the Wonder Wheel schedule.',
  ];
  const line = (i) => ({ text: `POPS: "${RAMBLE[i]}"`, choices: [...(i === 0 ? sip : []), { label: ['…uh huh', '(nod slowly)', 'Wow, Pops.', 'Mm-hm…', 'No way.', 'Pops, the mercs—'][i], go: () => i + 1 < RAMBLE.length ? line(i + 1) : ({ text: 'POPS: "…You actually listened. Nobody listens to Pops. Alright, get in my blind spot. Let\'s go crack some mercenary skulls."', choices: [{ label: 'Let\'s ride', go: () => { recruit(); return null; } }] }) }, { label: '(walk away)', go: null }] });
  return again && P.rambled ? { text: 'POPS: "You again. You want another story or you want some help?"', choices: [...sip, { label: 'Tell me a story', go: () => line(0) }, { label: 'Just passing', go: null }] } : line(0);
}

// ---------------------------------------------------------------------------------------------------------------------------
// SHADES: sunglasses (with complimentary crabs) on the boardwalk
function buildShades(world) {
  buildWalker(world, K, { name: 'SHADES', talk: shadesTalk, shirt: 0xe3e3e3, pants: 0x2a2f3a, skin: 0x6b4430, path: [[-80, 148], [-20, 150], [40, 149], [110, 151], [170, 150], [240, 148]], speed: 0.9 });
}
function shadesTalk(Kk, again) {
  const buy = () => {
    if (K.status.shades) return { text: 'SHADES: "You already got the best pair on the island, boss."', choices: [{ label: 'Right', go: null }] };
    if (!K.pay(10)) return { text: 'SHADES: "Ten dollars, boss. These are designer. The designer is my cousin."', choices: [{ label: 'Later', go: null }] };
    K.setStatus('shades', true);
    setTimeout(() => { K.setStatus('crabs', true); K.toast('…why is everything itchy? (Sammy sells a special lotion)', 3200); }, 25000);
    return { text: 'SHADES: "Lookin\' like a movie star! No refunds. No returns. Don\'t ask where they been."', choices: [{ label: 'Sweet', go: null }] };
  };
  return { text: again ? 'SHADES: "Back for another pair? Two for fifteen!"' : 'SHADES: "Yo yo yo, sunglasses! Designer sunglasses! Ten dollars! Real Italian, from Italy, the country!"', choices: [{ label: 'Gimme a pair — $10', go: buy }, { label: 'Nah', go: { text: 'SHADES: "Your eyes, your funeral, boss."', choices: [{ label: '…', go: null }] } }] };
}
/** Sammy's lotion (hooked into his shop menu from hangout.js) */
export function sammyLotion(Kk, after) {
  if (!K.status.crabs) return [];
  return [{ label: 'Sammy… I need the special lotion', go: () => {
    if (!K.pay(15)) return after('Fifteen dollar. You don\'t have? Then you scratch, my friend. Hahaha.');
    K.setStatus('crabs', false); K.setStatus('shades', false);
    return after('Hahaha! The sunglasses guy, eh? Every week! Here — apply generous, and throw away the glasses. Fifteen dollar.');
  } }];
}

// ---------------------------------------------------------------------------------------------------------------------------
// NET GOST MARKET + the mangal at Table Park
function buildMarket(world, H) {
  const { ctx, W, scene } = world;
  // the market: west kerb of W 8th St (the Luna Park side), south of Neptune
  const cols = ctx.colliders.filter((b) => !(b.max.y <= 1.6 && b.max.x - b.min.x < 5.2 && b.max.z - b.min.z < 5.2));
  const clear = (fx, fz, u, n) => { for (let a = -4.6; a <= 4.6; a += 0.8) for (let d = -2; d <= 11.6; d += 0.8) { const x = fx + u.x * a + n.x * d, z = fz + u.y * a + n.y * d; if (cols.some((b) => x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z && b.max.y > 0.4 && b.min.y < 3)) return false; } return true; };
  const A = new THREE.Vector2(384, -478), u = new THREE.Vector2(327 - 384, -219 + 478).normalize(), n = new THREE.Vector2(-u.y, u.x); if (n.x > 0) n.negate();
  const yaw = Math.atan2(n.x, n.y); let spot = null;
  for (let s = 20; s < 250 && !spot; s += 3) { const fx = A.x + u.x * s + n.x * 8.5, fz = A.y + u.y * s + n.y * 8.5; if (clear(fx, fz, u, n)) spot = [fx, fz]; }
  if (spot) {
    for (const [i, c] of (world.parkedCars || []).entries()) { if (c.gone) continue; if (Math.hypot(c.x - spot[0], c.z - spot[1]) < 12) K.stealLocal(i, false); }
    const D = buildDeli(world, { x: spot[0], z: spot[1], yaw, name: 'NET GOST MARKET · ПРОДУКТЫ', vendorName: 'OLGA', shirt: 0x7a2a4a, bun: true, hair: 0xb58a4a, skin: 0xe8c2a0 });
    L.market = D; (W.mapPOIs || (W.mapPOIs = [])).push({ name: 'NET GOST MARKET', x: D.door.x, z: D.door.z, kind: 'shop' });
    K.vendor({ name: 'OLGA', pos: D.sammy, r: 2.3, talk: (Kk, again) => ({
      text: again ? 'OLGA: "Again you? OK. What?"' : 'OLGA: "Zdravstvuyte. Shashlik is marinated since yesterday — pork, onion, a little vinegar. Twelve dollar. Kvass, three."',
      choices: [
        { label: 'Shashlik — $12', go: () => ({ text: 'OLGA: "' + sell('meat', 12, 'OLGA', { ok: 'Here. Grill it on the mangal in the park. Not in the microwave. I will know.', broke: 'Twelve dollar. Is not charity.', full: 'Your hands are full. Put something down.' }) + '"', choices: [{ label: 'Spasibo', go: null }] }) },
        { label: 'Kvass — $3', go: () => ({ text: 'OLGA: "' + sell('kvass', 3, 'OLGA', { ok: 'Kvass. Very healthy. Is basically bread.', broke: 'Three dollar.', full: 'Hands full.' }) + '"', choices: [{ label: 'Spasibo', go: null }] }) },
        { label: 'Just looking', go: { text: 'OLGA: "Looking costs one dollar." (she is joking) (probably)', choices: [{ label: '…', go: null }] } },
      ] }) });
  } else console.warn('[locals] no spot for the market');
  // the mangal: a steel charcoal grill by the picnic tables at Table Park
  const at = (H.igor ? H.igor.clone() : new THREE.Vector3(...(W.onlineStart || [220, 0, -380]))).add(new THREE.Vector3(3.2, 0, -3.0));
  const g = new THREE.Group(); g.position.copy(at); scene.add(g);
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.5, metalness: 0.7 }), coal = new THREE.MeshStandardMaterial({ color: 0x220a04, emissive: 0xff4a10, emissiveIntensity: 0.0 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.25, 0.35), steel); b.position.y = 0.72; g.add(b);
  for (const [x, z] of [[-0.45, -0.14], [0.45, -0.14], [-0.45, 0.14], [0.45, 0.14]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6), steel); l.position.set(x, 0.3, z); g.add(l); }
  const coals = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.28), coal); coals.position.y = 0.82; g.add(coals);
  const skewers = new THREE.Group(); skewers.visible = false; g.add(skewers);
  for (let k = 0; k < 5; k++) { const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.55), steel); sk.rotation.x = Math.PI / 2; sk.position.set(-0.36 + k * 0.18, 0.88, 0); skewers.add(sk); for (let q = 0; q < 4; q++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.06), new THREE.MeshStandardMaterial({ color: 0x8a3a24, roughness: 0.8 })); m.position.set(-0.36 + k * 0.18, 0.88, -0.15 + q * 0.1); skewers.add(m); } }
  world.box([at.x - 0.6, 0, at.z - 0.3], [at.x + 0.6, 0.85, at.z + 0.3]);
  const tag = nameTag('MANGAL', '#ffb070'); tag.position.set(0, 1.5, 0); tag.scale.set(0.9, 0.23, 1); g.add(tag);
  const G = L.grill = { pos: at, state: 'idle', t: 0, coals, skewers };
  K.spot({ pos: at, r: 2.2, prompt: () => G.state === 'idle' ? (K.has('meat') ? 'F — GRILL THE SHASHLIK' : 'MANGAL — buy shashlik at NET GOST (W 8th St)') : G.state === 'cooking' ? `sizzling… ${Math.ceil(G.t)} s` : (ctx.mode === 'chill' ? 'F — TAKE THE SHASHLIK' : 'F — EAT THE SHASHLIK'),
    when: () => true, act: () => {
      if (G.state === 'idle' && K.take('meat')) { G.state = 'cooking'; G.t = 15; skewers.visible = true; K.toast('On the mangal. 15 seconds. Don\'t leave it.', 2000); }
      else if (G.state === 'ready') { G.state = 'idle'; skewers.visible = false; if (ctx.mode === 'chill') { K.give('skewer'); K.toast('Hot shashlik to go — VITEK is hungry (behind the towers)', 2600); } else eatShashlik(); }
    } });
  K.onUpdate((dt) => {
    coals.material.emissiveIntensity = G.state === 'cooking' ? 1.2 + Math.sin(performance.now() / 120) * 0.3 : G.state === 'ready' ? 0.5 : 0.05;
    if (G.state !== 'cooking') return;
    G.t -= dt; G.smokeT = (G.smokeT || 0) - dt;
    if (G.smokeT <= 0) { G.smokeT = 0.7; const p = at.clone().add(new THREE.Vector3(0, 1.0, 0)); K.puff(p); ctx.net?.send?.('grill', {}); }   // grill smoke (not the kind that gets you high)
    if (G.t <= 0) { G.state = 'ready'; K.toast('The shashlik is ready — F to eat', 2400); }
  });
}
function eatShashlik() {
  const { ctx } = L; const w = ctx.weapons;
  if (w?.setLoadout) { const lo = w.loadout || {}; w.setLoadout({ primary: lo.primary, secondary: 'deagle' }); w.tint?.('deagle', 0xd4af37); w.swap?.(1); }
  if (ctx.player) ctx.player.health = ctx.player.maxHealth || 100;
  K.toast('Shashlik! Full health — and a GOLDEN DEAGLE (slot 2)', 3200);
  ctx.net?.send?.('buy', { k: 'meat', v: 'the mangal' });
}
