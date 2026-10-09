// CONEY folk — the beach, the boardwalk and the rides are full of LIVE people near you: the instanced crowd (world/crowd.js)
// is swapped for realistic Rocketbox avatars (world/people.js) around the player — sunbathers on their towels (on their
// backs or bellies), people in low beach chairs, bathers in the shallows, strollers walking the boardwalk / the waterline /
// the amusement streets, groups at the ride fences. Small mods for variety: clothes recoloured per person (skin kept),
// sunglasses, caps and sun hats. LOD: the nearest N spots within ~40 m (phones: 10 within ~26 m) are live; everything else
// stays instanced; off-screen people skip their animation mixer.
// Every live one is part of the street: F robs them (coney/chill.js robVictim — soft ones pay or run, scrappy ones swing,
// tough ones pull a blade), shooting / stabbing pulls them into the chill fight system (they flee or fight back), and now and
// then one of them is a MUGGER who walks up and sticks you up (dialogue: pay / stash / talk / refuse → fight). They talk
// trash: speech bubbles over the head (+ a toast when it's aimed at you) when you bump into them, point a gun, stagger past
// wasted, or when something goes down nearby. Online: whoever pulls a local into the street systems owns him (chill streams
// him as a 'thug'); a 'folk' event hides that spot on every other client so nobody sees a double. CONEY agent.
import * as THREE from 'three';
import { buildPerson, peopleReady, peopleDebug, AVATARS } from '../people.js';
import { hangkit as K, kit } from '../hangkit.js';
import { adoptFolk, folkRob, folkHurt, crewCalm, crewTakeGun } from './chill.js';
import { chaseQA, setReporter } from './chase.js';
import { W8 } from './w8th.js';
import { STILLWELL } from './stillwell.js';
import { BW } from './shore.js';
import { buildHustlers, hustlerTaken } from './hustlers.js';
import { streetAt } from './fronts.js';

const hash = (x, z, k = 0) => { const v = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return v - Math.floor(v); };
const pick = (a, h = Math.random()) => a[Math.floor(h * a.length) % a.length];
const NAMES = {
  m: ['ZHORA', 'BORYA', 'VINNIE', 'TONY', 'LYOVA', 'GARIK', 'SEMYON', 'MIKEY', 'PAULIE', 'DENIS', 'ROMA', 'SAL', 'YASHA', 'FRANKIE', 'EDIK', 'GENA', 'RICO', 'MARAT', 'DEDUSHKA FIMA', 'GYM BRO'],
  f: ['ZINA', 'RITA', 'DENISE', 'SVETA', 'LARISA', 'ANGIE', 'MARINA', 'TANYA', 'DONNA', 'LYUBA', 'GINA', 'TÖTYA ROZA', 'KAREN FROM JERSEY'],
};
// trash talk — Brighton Russian + Brooklyn English. Keyed by what set it off.
const BARK = {
  bump: ['Смотри куда прёшь!', 'Yo, personal space, bro!', 'Ты слепой? The whole boardwalk and you walk into ME.', 'Excuse YOU.', 'Эй, аккуратней, турист!', 'You step on my towel, you buy me a beer.', 'Bro. Bro. BRO.', 'Тише едешь — дальше будешь.'],
  gun: ['Опусти пушку, идиот!', 'Put that away, you psycho!', 'Whoa whoa whoa — я просто загораю!', 'Is that real?! Yo, is that REAL?!', 'Не стреляй, у меня внуки!', 'Point it at the seagulls, genius.'],
  wasted: ['Ты пьяный что ли? В два часа дня?', 'Yo, somebody cut this guy off.', 'Закусывать надо, молодой человек!', 'He smells like Sammy\'s back room.', 'Бурбон, братва, Гудзон — а тебе хватит.', 'Sir, this is a family beach.'],
  witness: ['Я всё видел! I SAW that!', 'Somebody call the cops!', 'Ой-ой-ой, что делается…', 'Yo, that\'s messed up!', 'Не моё дело. Не моё дело.', 'Brighton was quieter in \'89.'],
  chatter: ['Вода сегодня как лёд.', 'Who took my flip-flops?!', 'Семечки будешь?', 'Nathan\'s line is crazy today.', 'Сынок, намажься кремом!', 'The Cyclone is closed AGAIN?', 'В моё время чебурек стоил доллар.', 'Yo, the Mets lost again.', 'Бурбон, братва, Гудзон…', 'That seagull took my knish!'],
  panic: ['Бежим!', 'RUN!', 'Мама!', 'Nope. Nope. Nope.'],
  vendor: ['Water! Cold water, one dollar!', 'Phone chargers, phone cases!', 'Холодная вода! Один доллар!', 'Selfie stick, five dollar, best price!', 'Boss, sunglasses? Two for ten!', 'Mango, mango, mango!', 'Kids love it — bubble gun, eight dollar!'],
  kid: ['Mom! MOM! Can we go on the Cyclone?', 'Мама, хочу мороженое!', 'Last one to the beach is a rotten egg!', 'My backpack weighs like a thousand pounds.'],
};
const TINT = {
  beach: [0xe8205a, 0x1a8ad8, 0xf2c418, 0x2fbf6a, 0xff6a2a, 0x18c0c8, 0xff7ab0, 0xf0f0f0, 0x7a2ae0, 0xd01a1a],
  town: [0xf2f0ea, 0xe84a4a, 0x2a62c8, 0xf2c418, 0x5ac0b0, 0xf08aa8, 0x3a3f46, 0x7a9a4a, 0xff8a3a, 0x1d2230, 0x9ad0f0, 0x9a3a8a, 0xd8c8a8],
};
let F = null;
const _v = new THREE.Vector3(), _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sp = new THREE.Sphere();

export function buildFolk(world, spots, crowd) {
  const { ctx, W } = world;
  try { buildHustlers(world); } catch (e) { console.warn('[folk] hustlers', e); }   // the vendors come either way
  if (!peopleReady() || !crowd || !kit() || ctx.qs?.get?.('folk') === '0') return;   // ?folk=0: instanced crowd only (perf A/B)
  const touch = !!ctx.lite;
  F = { world, ctx, crowd, spots: spots.filter((s) => s._refs).concat(subwaySpots(world)), active: new Set(), cache: [], tickT: 0, frame: 0, barkT: 0, mugT: ctx.mode === 'chill' ? 60 + Math.random() * 40 : 140 + Math.random() * 90,
    N: touch ? 10 : 30, R_ON: touch ? 26 : 42, CACHE: touch ? 14 : 44, robE: null, robPos: new THREE.Vector3(0, -999, 0), lastP: new THREE.Vector3(), pspeed: 0, stats: { barks: 0, muggers: 0, adopted: 0 } };
  W.sandAt = (x, z) => z > BW.z1;
  for (const s of F.spots) if (!s.key) s.key = `${s.x.toFixed(1)},${s.z.toFixed(1)}`;
  const av = Object.keys(peopleDebug().av).filter((id) => !AVATARS[id]?.solo);
  F.av = { m: av.filter((id) => AVATARS[id].g === 'm'), f: av.filter((id) => AVATARS[id].g === 'f') };
  if (!F.av.m.length) F.av.m = av; if (!F.av.f.length) F.av.f = F.av.m;
  // F — ROB the local right in front of you (walking past doesn't count: stop and face them)
  K.spot({ pos: F.robPos, r: 2.5, dy: 2.2, low: true, when: () => !!F.robE, prompt: () => `F — ROB ${F.robE?.p.name || ''}`, act: () => { const E = F.robE; if (!E) return; if (E.s.sub) { lightRob(E); return; } const t = promote(E, 'rob'); if (t) folkRob(t); } });
  ctx.bus.on('streetCrime', (e) => onCrime(e));
  ctx.bus.on('net:folk', (m) => { if (typeof m.v === 'string') { hustlerTaken(m.v.slice(0, 12)); return; } if (!Array.isArray(m.p)) return; const s = (typeof m.k === 'string' && F.spots.find((q) => q.key === m.k)) || findSpot(+m.p[0], +m.p[1]); if (s) take(s); });
  ctx.bus.on('worldReset', () => { for (const s of F.spots) if (s.gone) { s.gone = 0; if (!s.E) crowd.hide(s, false); } F.mugT = 90; });
  ctx.bus.on('npcHurt', (d) => { if (d?.position) onCrime({ kind: d.dead ? 'kill' : 'hit', pos: d.position, name: d.name }); });
  world.updaters.push((dt) => { if (F?.world === world) update(dt); });
  setReporter(phoneCops);   // chase.js: unseen crimes need a witness who phones it in
  if (typeof window !== 'undefined' && window.__game) window.__game.folk = folkQA;
  console.log('[folk]', F.spots.length, 'crowd spots can come alive ·', av.length, 'avatars');
}

// ---- who is this person (deterministic from the spot, so a spot is the same person every time you come back) ----------------
function persona(s) {
  if (s.p) return s.p;
  const h = (k) => hash(s.x, s.z, k), beach = s.zone === 'towel' || s.zone === 'water';
  const fem = h(1) < 0.45, ids = fem ? F.av.f : F.av.m, avatar = ids[Math.floor(h(2) * ids.length) % ids.length];
  const t = h(3), dark = !!AVATARS[avatar]?.dark;
  const temper = !fem && t < 0.14 ? 'tough' : t < 0.36 ? 'scrappy' : 'soft';
  const arch = archetype(s, h);
  s.p = { arch, kid: arch === 'kid' || arch === 'schoolkid', avatar, fem, name: pick(NAMES[fem ? 'f' : 'm'], h(4)), temper, type: temper === 'tough' ? (dark ? 'st' : 'ru') : 'mk', blade: temper === 'tough' && h(5) < 0.8,
    cash: 10 + 5 * Math.floor(h(6) * 8), tint: h(7) < 0.7 ? pick(beach ? TINT.beach : TINT.town, h(8)) : null, glasses: h(9) < (beach ? 0.45 : 0.25),
    hat: h(10) < (beach ? 0.4 : 0.22) ? (fem ? 'sun' : h(11) < 0.5 ? 'cap' : 'bucket') : null, belly: h(12) < 0.25,
    gun: temper === 'tough' ? (h(5) < 0.8 ? 'knife' : 'm9') : h(15) < 0.12 ? 'm9' : null,   // some carry: rob or drop them and it's yours
    mood: s.zone === 'queue' || s.zone === 'park' ? (h(13) < 0.4 ? 'talk' : null) : s.zone === 'bw' && h(13) < 0.08 ? 'drunk' : null, speed: 1.15 + h(14) * 0.35 };
  const P = s.p;   // the street types (Surf Ave tourists and families, kids with school bags on Mermaid, the old-timers, hi-vis crews on Stillwell, the sellers)
  if (P.kid) { P.temper = 'soft'; P.gun = null; P.blade = false; P.speed = 1.0 + h(16) * 0.25; P.cash = 2; P.name = pick(['LITTLE VINNIE', 'MISHA', 'KAYLA', 'DIMA', 'JAYDEN', 'SOFIA', 'ARTYOM', 'MIA'], h(17)); P.glasses = false; P.hat = h(18) < 0.25 ? 'cap' : null; }
  if (arch === 'elder') { P.speed = 0.62 + h(16) * 0.18; P.tint = pick([0x5a5a5a, 0x3a3f50, 0x6b5a4a, 0x8a8478, 0x2a2a2a], h(8)); P.hat = h(18) < 0.55 ? 'cap' : null; P.hatCol = pick([0x3a3a3a, 0x5a4a3a, 0x2a3040], h(19)); P.name = pick(['DEDUSHKA FIMA', 'BABA RAYA', 'OLD SAL', 'MRS. GOLDBERG', 'UNCLE ZYAMA', 'MR. ESPOSITO'], h(17)); }
  if (arch === 'worker') { P.tint = 0xd6ff1f; P.hat = 'cap'; P.hatCol = 0xff7a1a; P.glasses = h(18) < 0.4; P.mood = h(13) < 0.5 ? 'talk' : null; }
  if (arch === 'tourist') { P.glasses = h(9) < 0.6; P.hat = h(10) < 0.45 ? (fem ? 'sun' : h(11) < 0.5 ? 'cap' : 'bucket') : P.hat; P.tint = pick(TINT.beach, h(8)); }
  if (arch === 'vendor') { P.temper = h(3) < 0.3 ? 'scrappy' : 'soft'; P.hat = h(10) < 0.6 ? (h(11) < 0.5 ? 'cap' : 'bucket') : null; P.mood = null; P.cash = 40 + 5 * Math.floor(h(6) * 8); }
  return s.p;
}

/** who walks this street: set by life.js on the town spots (s.arch), or worked out from where the spot is */
function archetype(s, h) {
  if (s.arch) return s.arch;
  if (s.zone === 'vendor') return 'vendor';
  if (s.zone === 'towel' || s.zone === 'water' || s.zone === 'subway' || s.zone === 'rail') return null;
  const st = s.zone === 'bw' ? 'surf' : streetAt(s.x, s.z), r = h(22);
  return pickArch(st, r);
}
/** street → mix of types (shared with life.js so the far instanced crowd agrees with the live one) */
export function pickArch(st, r) {
  if (st === 'surf') return r < 0.45 ? 'tourist' : r < 0.6 ? 'kid' : r < 0.68 ? 'elder' : null;
  if (st === 'mermaid' || st === 'neptune') return r < 0.22 ? 'schoolkid' : r < 0.47 ? 'elder' : null;
  if (st === 'stillwell') return r < 0.24 ? 'worker' : r < 0.34 ? 'elder' : r < 0.44 ? 'tourist' : null;
  if (st === 'w8' || st === 'w12') return r < 0.12 ? 'schoolkid' : r < 0.3 ? 'elder' : r < 0.4 ? 'tourist' : null;
  return r < 0.1 ? 'kid' : r < 0.2 ? 'elder' : null;
}

// clothes recolour: keeps skin-toned texels, pushes the rest toward the person's colour (luminance kept)
function tintMat(src, col) {
  const m = src.clone(); m.userData.tint = { value: new THREE.Color(col) };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTint = m.userData.tint;
    sh.fragmentShader = 'uniform vec3 uTint;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 c = diffuseColor.rgb; vec3 g = pow(max(c, vec3(0.0)), vec3(0.4545)); float mx = max(g.r, max(g.g, g.b)), mn = min(g.r, min(g.g, g.b)); float sat = (mx - mn) / max(mx, 1e-3);
        float hue = (g.g - g.b) / max(g.r - g.b, 1e-3);
        float skin = step(g.b, g.g) * step(g.g, g.r) * smoothstep(0.1, 0.18, sat) * (1.0 - smoothstep(0.62, 0.72, sat)) * smoothstep(0.04, 0.1, g.r - g.b) * smoothstep(0.1, 0.2, mx) * smoothstep(0.1, 0.25, hue) * (1.0 - smoothstep(0.8, 0.95, hue));
        float l = dot(c, vec3(0.3, 0.59, 0.11));
        vec2 uv = vMapUv; float side = 1.0 - step(0.31, uv.x) * step(uv.x, 0.69);   // Rocketbox atlas: torso column in the middle, sleeves on the sides between the legs and forearms
        float shirt = (1.0 - side) * step(uv.y, 0.87) + side * step(0.43, uv.y) * step(uv.y, 0.63);
        diffuseColor.rgb = mix(c, uTint * (0.18 + 1.7 * l), (1.0 - skin) * shirt); }`);
  };
  m.customProgramCacheKey = () => 'folkTint1';
  return m;
}
const HATM = {}, BAGG = {};
function hatMat(c) { return HATM[c] || (HATM[c] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 })); }
const HATG = {};
function hat(kind, col) {
  const g = new THREE.Group();
  if (!HATG.cap) { HATG.cap = new THREE.SphereGeometry(0.108, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5); HATG.brim = new THREE.BoxGeometry(0.17, 0.012, 0.11); HATG.sunB = new THREE.CylinderGeometry(0.22, 0.22, 0.008, 20); HATG.sunC = new THREE.CylinderGeometry(0.095, 0.105, 0.09, 16); HATG.buckB = new THREE.CylinderGeometry(0.14, 0.155, 0.05, 16, 1, true); HATG.buckC = new THREE.CylinderGeometry(0.1, 0.112, 0.07, 16); }
  const m = hatMat(col), add = (geo, x, y, z, rx = 0) => { const e = new THREE.Mesh(geo, m); e.position.set(x, y, z); e.rotation.x = rx; e.castShadow = true; g.add(e); };
  if (kind === 'cap') { add(HATG.cap, 0, 0.035, -0.01); add(HATG.brim, 0, 0.04, 0.1, -0.12); }
  else if (kind === 'sun') { add(HATG.sunB, 0, 0.05, 0); add(HATG.sunC, 0, 0.09, -0.005); }
  else { add(HATG.buckB, 0, 0.045, 0); add(HATG.buckC, 0, 0.09, -0.005); }
  return g;
}

/** a person for a spot; sitting ones are built on the chair clip (they get re-built standing if they have to get up) */
function makeFig(s, sit) {
  const p = persona(s);
  const f = buildPerson({ avatar: p.avatar, seed: Math.floor(hash(s.x, s.z, 20) * 997), pose: sit ? 'sit' : undefined, glasses: p.glasses, female: p.fem });
  f.mood = p.mood;
  if (p.tint != null) f.group.traverse((o) => { if (o.isSkinnedMesh && /_body$/.test(o.material?.name || '')) o.material = tintMat(o.material, p.tint); });
  if (p.hat) f.head.add(hat(p.hat, p.hatCol ?? pick([0xf2f0ea, 0x1a2a5a, 0xc0202a, 0xe8c890, 0x151515, 0x2a6a3a, 0xf2c418], hash(s.x, s.z, 21))));
  if (p.kid) f.group.scale.setScalar(s.s && s.s < 0.8 ? s.s : 0.68);
  if (p.arch === 'schoolkid' || (p.arch === 'tourist' && hash(s.x, s.z, 23) < 0.3)) {   // a backpack: a rounded pack + a front pocket, on the back (the figure faces +z)
    const bag = new THREE.Group(), m = hatMat(pick([0x1a2a5a, 0xc0202a, 0x2a6a3a, 0xff7ab0, 0x151515, 0xf2c418, 0x7a2ae0], hash(s.x, s.z, 24)));
    const a = new THREE.Mesh(BAGG.body || (BAGG.body = new THREE.BoxGeometry(0.32, 0.4, 0.15)), m); a.position.set(0, 1.22, -0.2); const b = new THREE.Mesh(BAGG.pocket || (BAGG.pocket = new THREE.BoxGeometry(0.24, 0.18, 0.06)), m); b.position.set(0, 1.12, -0.3);
    a.castShadow = b.castShadow = true; bag.add(a, b); f.group.add(bag);
  }
  return f;
}
function disposeFig(f) { f.group.traverse((o) => { if (o.material?.userData?.tint) o.material.dispose(); }); }

// ---- LOD: spots near you come alive -------------------------------------------------------------------------------------
function activate(s) {
  const { world, ctx } = F; const p = persona(s);
  const mode = s.pose === 'lie' ? 'lie' : s.pose === 'sit' ? 'sit' : s.pose === 'walk' ? 'walk' : 'stand';
  let E = F.cache.find((e) => e.s === s); if (E) F.cache.splice(F.cache.indexOf(E), 1);
  if (!E) {
    const fig = makeFig(s, mode === 'sit');
    const holder = new THREE.Group(); holder.name = 'folk'; holder.add(fig.group);
    if (mode === 'lie') { const back = hash(s.x, s.z, 30) < 0.72; fig.group.rotation.x = back ? -Math.PI / 2 : Math.PI / 2; fig.group.position.set(0, 0.11, back ? 0.85 : -0.85); }
    if (mode === 'sit') fig.group.position.y = s.sitOff ?? (s.chairY ?? s.y) - s.y - 0.13;
    const hbm = new THREE.MeshBasicMaterial({ visible: false });
    const hb = mode === 'lie' ? new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 1.8), hbm) : new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, mode === 'sit' ? 1.3 : 1.75, 8), hbm);
    hb.position.y = mode === 'lie' ? 0.16 : mode === 'sit' ? 0.2 : 0.88; hb.userData.surface = 'flesh'; holder.add(hb);
    E = { s, p, fig, holder, hb, mode, meshes: [], cast: true, hp: 100, pos: new THREE.Vector3(s.x, s.y || 0, s.z), yaw: s.ry || 0, leg: null, dir: 1, speed: 0, acc: 0, inView: true, barkT: 0, bubble: null, bubbleT: 0, hands: 0, panic: 0 };
    hb.userData.onHit = (dmg, head, point, dir) => { if (E.call) endCall(E, false); if (s.sub) return lightHit(E, dmg * (head ? 1.6 : 1));
      if (p.kid) { const P = F.ctx.player.position; E.panic = 5; E.panicYaw = Math.atan2(E.pos.x - P.x, E.pos.z - P.z); say(E, pick(BARK.panic)); return; }   // kids run, they don't fight
      const t = promote(E, 'hit'); if (t) folkHurt(t, dmg * (head ? 1.6 : 1), dir, head); };
    if (mode === 'walk') planLeg(E);
    fig.group.traverse((o) => { if (o.isMesh) E.meshes.push(o); });
  }
  if (s.train) trainPose(s);
  E.pos.set(s.x, s.y || 0, s.z); E.yaw = mode === 'walk' && E.leg ? E.leg.yaw : s.ry || 0; E.t = 0;
  E.holder.position.copy(E.pos); E.holder.rotation.y = E.yaw; world.scene.add(E.holder); ctx.raycastTargets.push(E.hb);
  F.crowd.hide(s, true); s.E = E; F.active.add(E);
}
function deactivate(E, keep = true) {
  const { world, ctx } = F; F.active.delete(E); E.s.E = null; world.scene.remove(E.holder);
  const k = ctx.raycastTargets.indexOf(E.hb); if (k > -1) ctx.raycastTargets.splice(k, 1);
  if (E.bubble) { E.bubble.parent?.remove(E.bubble); E.bubble = null; }
  if (E.dead) { E.s.gone = performance.now() + 180000; keep = false; disposeFig(E.fig); }   // a body doesn't come back from the cache
  if (!E.s.gone) F.crowd.hide(E.s, false);
  E.fig.hands = false; E.panic = 0;
  if (keep) { F.cache.push(E); while (F.cache.length > F.CACHE) disposeFig(F.cache.shift().fig); }
}
/** walkers ping-pong along their heading (boardwalk strollers along the deck, bathers along the waterline), clear of colliders */
function planLeg(E) {
  const s = E.s; let yaw = s.ry || 0;
  if (s.cross) { E.leg = { ...s.cross.leg }; E.atEnd = true; return; }
  if (s.zone === 'water' || s.zone === 'bw') yaw = Math.sin(yaw) >= 0 ? Math.PI / 2 : -Math.PI / 2;
  if (s.zone === 'subway') yaw = 0;   // pace along the platform (they face the tracks: walking that way took them off the edge)
  const fx = Math.sin(yaw), fz = Math.cos(yaw), cols = F.ctx.colliders, L = 7 + hash(s.x, s.z, 40) * 7;
  const free = (x, z) => !cols.some((b) => x > b.min.x - 0.4 && x < b.max.x + 0.4 && z > b.min.z - 0.4 && z < b.max.z + 0.4 && b.max.y > (s.y || 0) + 0.3 && b.min.y < (s.y || 0) + 1.8);
  let a = 0, b = 0; while (a < L && free(s.x - fx * (a + 1), s.z - fz * (a + 1))) a += 1; while (b < L && free(s.x + fx * (b + 1), s.z + fz * (b + 1))) b += 1;
  if (a + b < 3) { E.mode = 'stand'; return; }
  E.leg = { ax: s.x - fx * a, az: s.z - fz * a, bx: s.x + fx * b, bz: s.z + fz * b, yaw };
}
// ---- witnesses phone the cops (GTA): the nearest local who saw it pulls out a phone; ~6 s later the stars come, unless you stop them
const _ray = new THREE.Raycaster();
function sees(E, pos) {
  _v.set(E.pos.x, E.pos.y + 1.6, E.pos.z); const to = new THREE.Vector3(pos.x, (pos.y || 0) + 1.2, pos.z), d = _v.distanceTo(to); if (d < 2) return true;
  _ray.set(_v, to.sub(_v).normalize()); _ray.near = 0.5; _ray.far = d - 0.8;
  try { for (const h of _ray.intersectObjects(F.ctx.raycastTargets, false)) { const u = h.object.userData; if (u.soldier || u.noLOS || u.surface === 'flesh') continue; return false; } } catch { return false; }
  return true;
}
function phoneCops(type, pos, done) {
  if (!F || [...F.active].filter((E) => E.call).length >= 2) return false;
  const R = type === 'shot' ? 60 : 30; let best = null, bd = R;
  for (const E of F.active) { if (E.call || E.dead || E.angry > 0 || E.p.temper === 'tough' || E.s.sub || E.s.train || E.mode === 'lie' || E.p.arch === 'kid') continue;
    const d = Math.hypot(E.pos.x - pos.x, E.pos.z - pos.z); if (d < bd && sees(E, pos)) { bd = d; best = E; } }
  if (!best) return false;
  best.call = { t: 6, done }; best.panic = 0; best.fig.phone = true; say(best, pick(['☎ 911? Yeah, somebody just…', '☎ Алло, полиция?!', '☎ Yo, 911, there\'s a guy on Surf…', '☎ Police, please, hurry!']));
  return true;
}
function endCall(E, ok) { if (!E.call) return; const c = E.call; E.call = null; E.fig.phone = false; if (ok) { say(E, pick(['…yeah, hurry up.', '…они уже едут.', '…OK, they\'re coming.'])); c.done(E.p.name); } else { say(E, pick(['OK OK! No cops!', 'Я никому не звоню!', 'I wasn\'t calling nobody!'])); E.fig.hands = true; E.hands = 3; } }
/** a crosswalk walker may step off: the cars along the way they walk have the green (so the ones crossing their path are stopped) */
function crossOK(E) {
  const S = F.world.W.signals, c = E.s.cross; if (!S) return true;
  const hx = E.dir > 0 ? c.hx : -c.hx, hz = E.dir > 0 ? c.hz : -c.hz, n = c.j.n, t = ((Date.now() / 1000 + n.sig.off) % 34 + 34) % 34;
  const g = Math.abs(hx * n.sig.ax + hz * n.sig.az) > 0.7 ? 0 : 1, e = t - (g ? 18 : 0);
  return e >= 0 && e < 4 && S.state(c.j, hx, hz) === 'G';   // only in the first 4 s of their green, so they're across before the amber (traffic.js: 12-14 s green)
}
/** more spots, added after the crowd is built (coney/street.js: crosswalk walkers, the sellers at the vendor tables): live only */
export function addFolkSpots(world, list) {
  if (!F || F.world !== world) return 0;
  for (const s of list) { s.key = s.key || `${s.zone}:${s.x.toFixed(1)},${s.z.toFixed(1)}`; F.spots.push(s); }
  return list.length;
}
/** pull a live local into the street systems (chill.js): he's a real crew member from here on, streamed to friends */
function promote(E, why) {
  const s = E.s; if (s.gone || !F.active.has(E)) return null;
  if (s.sub) return null;   // platform / train riders: handled in place (lightRob / lightHit)
  const { ctx } = F; const p = E.p, pos = E.pos.clone();
  if (F.world.W.sandAt(pos.x, pos.z)) { const gy = F.world.W.groundHeight?.(pos.x, pos.z); if (Number.isFinite(gy)) pos.y = gy - (s.zone === 'water' ? 0.2 : 0); }
  let yaw = E.yaw; if (E.mode === 'lie') yaw += Math.PI;
  const standing = E.mode === 'stand' || E.mode === 'walk';
  let fig = E.fig; E.holder.remove(fig.group);
  if (!standing) { disposeFig(fig); fig = makeFig(s, false); } else { fig.group.position.set(0, 0, 0); fig.group.rotation.set(0, 0, 0); }
  fig.hands = false; fig.mood = why === 'mug' ? 'angry' : null;
  s.gone = performance.now() + 180000; deactivate(E, false); F.crowd.hide(s, true);
  const tough = why === 'mug';
  const t = adoptFolk({ fig, pos, yaw, name: p.name, type: tough && p.type === 'mk' ? (AVATARS[p.avatar]?.dark ? 'st' : 'ru') : p.type, temper: tough && p.temper === 'soft' ? 'scrappy' : p.temper, blade: tough ? p.blade || Math.random() < 0.4 : p.blade, gun: tough ? (p.gun || (Math.random() < 0.5 ? 'm9' : null)) : p.gun, cash: p.cash, intent: why === 'mug' ? 'mug' : 'mark', onGone: () => disposeFig(fig) });
  if (!t) return null;
  F.stats.adopted++;
  ctx.net?.send?.('folk', { p: [+s.x.toFixed(2), +s.z.toFixed(2)], k: s.key, st: 'take' });
  return t;
}
// ---- the subway: people waiting on the Stillwell / W 8 St / Neptune Av platforms, riders sitting in the F cars ------------------
const ISLANDS = [[-82, -74], [-68, -60], [-53, -46], [-38, -29]];   // Stillwell's four island platforms (coney/stillwell.js)
function subwaySpots(world) {
  const { ctx, W } = world, out = [], cols = ctx.colliders;
  const free = (x, y, z) => !cols.some((b) => x > b.min.x - 0.5 && x < b.max.x + 0.5 && z > b.min.z - 0.5 && z < b.max.z + 0.5 && b.max.y > y + 0.2 && b.min.y < y + 1.8);
  const add = (x, y, z, ry, k, pose = 'stand') => { if (free(x, y, z)) out.push({ x, y, z, ry, pose, zone: 'subway', sub: true, key: k }); };
  const S = STILLWELL;
  ISLANDS.forEach(([a, b], i) => { for (let k = 0; k < 6; k++) { const h = hash(i, k, 50), z = S.zP1 + 8 + h * (S.zP0 - S.zP1 - 16), side = hash(i, k, 51) < 0.5 ? a + 1.6 : b - 1.6; add(side, S.PLAT, z, side < (a + b) / 2 ? -Math.PI / 2 : Math.PI / 2, `stw${i}.${k}`, hash(i, k, 52) < 0.25 ? 'walk' : 'stand'); } });
  { const u = new THREE.Vector2().subVectors(W8.P1, W8.P0).normalize(), n = new THREE.Vector2(-u.y, u.x);
    for (const [lv, L] of [['lo', W8.LO], ['up', W8.UP]]) for (const sg of [-1, 1]) for (let k = 0; k < 4; k++) { const a = 10 + hash(sg, k, lv === 'lo' ? 60 : 61) * (W8.L - 20), o = sg * (W8.platIn + 1 + hash(sg, k, 62) * (W8.platOut - W8.platIn - 2));
      add(W8.P0.x + u.x * a + n.x * o, L.plat, W8.P0.y + u.y * a + n.y * o, Math.atan2(-n.x * sg, -n.y * sg), `w8${lv}${sg}.${k}`); } }
  const NP = W.neptunePlat;
  if (NP) for (const sg of [-1, 1]) for (let k = 0; k < 4; k++) { const a = NP.a0 + hash(sg, k, 70) * (NP.a1 - NP.a0), o = sg * (NP.o0 + hash(sg, k, 71) * (NP.o1 - NP.o0)); const p0 = NP.at(a, 0, NP.plat), p = NP.at(a, o, NP.plat); add(p.x, NP.plat, p.z, Math.atan2(p0.x - p.x, p0.z - p.z), `nep${sg}.${k}`); }
  // F train riders: two per car on the bench seats, facing across the car
  if (ctx.subway?.toWorld) for (let c = 0; c < 6; c++) for (const [lx, lz] of [[1.18, [-4.15, 0, 4.15][c % 3]], [-1.18, [4.15, -4.15, 0][c % 3]]]) out.push({ x: 0, y: -999, z: 0, ry: 0, pose: 'sit', zone: 'train', sub: true, train: { c, lx, lz }, sitOff: 0.08, key: `f${c}.${lx > 0 ? 'r' : 'l'}` });
  return out;
}
const _ta = new THREE.Vector3(), _tb = new THREE.Vector3();
function trainPose(s) {
  const sw = F?.ctx.subway || s._sw; const t = s.train; if (!sw?.toWorld) return;
  const a = sw.toWorld(t.c, t.lx, t.lz, _ta), b = sw.toWorld(t.c, t.lx + 1, t.lz, _tb); if (!a) return;
  s.x = a.x; s.y = a.y; s.z = a.z; const yx = Math.atan2(b.x - a.x, b.z - a.z); s.ry = t.lx > 0 ? yx + Math.PI : yx;
}
const GIVE = ['Бери, бери! Только не трогай!', 'Take it! It\'s a MetroCard and forty bucks!', 'OK OK — here, it\'s all I got!', 'Это на проезд было!', 'Yo, not on the F train, man…'];
const NO = ['Ты кого грабишь?! Я с Брайтона!', 'Not today, pal!', 'I ride the F at 3 AM, you think you scare me?', 'Давай, давай — попробуй!'];
/** rob someone who can't walk off (a platform / a moving car): they pay up in place, or swing */
function lightRob(E, force = null) {
  const { ctx } = F; const p = E.p;
  if (E.robbed || E.dead) { say(E, 'Меня уже ограбили! Already robbed, bro.'); K.toast(`${p.name}: "Already robbed, bro."`, 1600); return false; }
  const gun = ctx.weapons?.current?.mode !== 'MELEE';
  const comply = force != null ? +force : p.temper === 'tough' ? (gun ? 0.35 : 0.1) : p.temper === 'scrappy' ? (gun ? 0.7 : 0.35) : (gun ? 0.95 : 0.75);
  E.robbed = true; ctx.bus.emit('streetCrime', { kind: 'rob', name: p.name, pos: E.pos.clone(), folk: true });
  if (Math.random() < comply) {
    if (E.mode !== 'sit') { E.fig.hands = true; E.hands = 3; }
    const line = pick(GIVE); say(E, line); K.earn(p.cash); K.toast(`${p.name}: "${line}" — +$${p.cash}`, 2400);
    if (p.gun) setTimeout(() => crewTakeGun(p.gun, p.name), 1200);
    try { chaseQA.crime('rob', E.pos); } catch {}   // witnesses decide (chase.js → phoneCops)
    return true;
  }
  const line = pick(NO); say(E, line); K.toast(`${p.name}: "${line}"`, 2000); E.angry = 7; E.strikeT = 0.4; return false;
}
function strike(E) {
  const { ctx } = F; const me = ctx.player; const blade = E.p.gun === 'knife'; E.strikeT = blade ? 1.3 : 1.0;
  E.fig.play?.('punch'); const dmg = blade ? 14 + Math.random() * 6 : 6 + Math.random() * 5;
  ctx.deathNote = { text: blade ? `cut by ${E.p.name} on the F` : `beaten down by ${E.p.name}`, at: performance.now() };
  me.damage?.(dmg, E.pos.clone()); ctx.bus.emit('meleeHit', { point: me.position.clone().setY(me.position.y + 1.4) });
}
function lightHit(E, dmg) {
  const { ctx } = F; if (E.dead) return; E.hp -= dmg; E.fig.play?.('hit'); ctx.ai?.blood?.(E.pos.x, E.pos.z, 0.3 + Math.random() * 0.2, E.pos.y + 0.5);
  if (E.hp > 0) { if (E.p.temper !== 'soft') { E.angry = 8; E.strikeT = Math.min(E.strikeT ?? 0.5, 0.5); if (E.barkT <= 0) { say(E, pick(NO)); E.barkT = 6; } } else if (E.barkT <= 0) { say(E, pick(BARK.panic)); E.barkT = 6; } ctx.bus.emit('npcHurt', { name: E.p.name, dead: false, position: E.pos.clone() }); return; }
  E.dead = true; E.deadT = 0; E.angry = 0; E.fig.hands = false;
  if (E.mode === 'sit') E.fig.group.rotation.z = 1.1; else { E.fig.group.rotation.x = -Math.PI / 2; E.fig.group.position.set(0, 0.12, 0.85); }
  const n = (E.robbed ? 0 : E.p.cash) + 5 * (1 + Math.floor(Math.random() * 3)); K.earn(n); K.toast(`${E.p.name} is down — +$${n}`, 1800);
  if (E.p.gun && !E.robbed) setTimeout(() => crewTakeGun(E.p.gun, E.p.name), 900);
  ctx.ai?.blood?.(E.pos.x, E.pos.z, 1.1, E.pos.y + 0.3);
  ctx.bus.emit('npcHurt', { name: E.p.name, dead: true, position: E.pos.clone() });   // chase.js: a killing brings the cops
  ctx.net?.send?.('folk', { p: [+E.s.x.toFixed(2), +E.s.z.toFixed(2)], k: E.s.key, st: 'take' });
}
function findSpot(x, z) { let best = null, bd = 1.5; for (const s of F.spots) { const d = Math.abs(s.x - x) + Math.abs(s.z - z); if (d < bd) { bd = d; best = s; } } return best; }
function take(s) { if (s.E) deactivate(s.E, true); s.gone = performance.now() + 180000; F.crowd.hide(s, true); }

// ---- per frame -------------------------------------------------------------------------------------------------------
function update(dt) {
  const { ctx } = F; const me = ctx.player; if (!me) return; const P = me.position; F.frame++;
  F.pspeed = F.pspeed * 0.8 + (Math.hypot(P.x - F.lastP.x, P.z - F.lastP.z) / Math.max(dt, 1e-3)) * 0.2; F.lastP.copy(P);
  F.tickT -= dt; if (F.tickT <= 0) { F.tickT = 0.25; tick(); }
  const cam = ctx.camera; if (F.frame % 8 === 0) { _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm); for (const E of F.active) E.inView = _fr.intersectsSphere(_sp.set(_v.set(E.pos.x, E.pos.y + 0.9, E.pos.z), 1.6)); }
  for (const E of F.active) {
    let speed = 0;
    if (E.s.train) { trainPose(E.s); E.pos.set(E.s.x, E.s.y, E.s.z); E.yaw = E.s.ry; }   // riding the F: stuck to the seat as the car moves
    if (E.dead) { E.deadT += dt; if (E.deadT > 20) { deactivate(E, false); continue; } E.holder.position.copy(E.pos); E.holder.rotation.y = E.yaw; continue; }
    if (E.angry > 0) { E.angry -= dt; E.strikeT -= dt; if (E.strikeT <= 0 && Math.hypot(P.x - E.pos.x, P.z - E.pos.z) < 2.1) strike(E); }
    if (E.panic > 0) {   // something happened: leg it away from it for a few seconds
      E.panic -= dt; speed = 4.2; const fx = Math.sin(E.panicYaw), fz = Math.cos(E.panicYaw);
      E.pos.x += fx * speed * dt; E.pos.z += fz * speed * dt; E.yaw += Math.atan2(Math.sin(E.panicYaw - E.yaw), Math.cos(E.panicYaw - E.yaw)) * Math.min(1, dt * 8);
      if (F.world.W.sandAt(E.pos.x, E.pos.z)) { const gy = F.world.W.groundHeight?.(E.pos.x, E.pos.z); if (Number.isFinite(gy)) E.pos.y = gy; }
    } else if (E.mode === 'walk' && E.leg) {
      const L = E.leg, tx = E.dir > 0 ? L.bx : L.ax, tz = E.dir > 0 ? L.bz : L.az, dx = tx - E.pos.x, dz = tz - E.pos.z, d = Math.hypot(dx, dz);
      const nearMe = Math.hypot(P.x - E.pos.x, P.z - E.pos.z) < 1.1;   // don't walk through the player
      const wait = (E.s.cross && E.atEnd && !crossOK(E)) || !!E.call;   // at the kerb: the hand is up
      if (E.s.cross && E.atEnd && !wait && !E.call) { E.atEnd = false; F.stats.crossStarts = (F.stats.crossStarts || 0) + 1; }
      if (wait && !E.call) { const want = Math.atan2(dx, dz); E.yaw += Math.atan2(Math.sin(want - E.yaw), Math.cos(want - E.yaw)) * Math.min(1, dt * 3); }
      else if (d < 0.3) { E.dir = -E.dir; if (E.s.cross) E.atEnd = true; } else if (!nearMe && !E.fig.hands) { speed = E.p.speed; E.pos.x += dx / d * speed * dt; E.pos.z += dz / d * speed * dt; const want = Math.atan2(dx, dz); E.yaw += Math.atan2(Math.sin(want - E.yaw), Math.cos(want - E.yaw)) * Math.min(1, dt * 5); }
      if (E.s.zone === 'water' || F.world.W.sandAt(E.pos.x, E.pos.z)) { const gy = F.world.W.groundHeight?.(E.pos.x, E.pos.z); if (Number.isFinite(gy)) E.pos.y = gy - (E.s.zone === 'water' ? 0.2 : 0); }
    }
    if (E.call) { E.call.t -= dt; const want = Math.atan2(E.pos.x - P.x, E.pos.z - P.z); E.yaw += Math.atan2(Math.sin(want - E.yaw), Math.cos(want - E.yaw)) * Math.min(1, dt * 3); if (E.call.t <= 0) endCall(E, true); }
    if (E.hands > 0) { E.hands -= dt; if (E.hands <= 0) E.fig.hands = false; }
    E.holder.position.copy(E.pos); E.holder.rotation.y = E.yaw;
    // animation: every frame in view and close, every other frame further out, not at all off-screen
    E.acc += dt; const far = Math.hypot(P.x - E.pos.x, P.z - E.pos.z) > 20;
    if (E.inView && (!far || (F.frame + E.s.x) % 2 < 1)) { E.fig.update(E.acc, speed); E.acc = 0; } else if (E.acc > 1) E.acc = 1;
    if (E.bubble) { E.bubbleT -= dt; if (E.bubbleT <= 0) { E.bubble.parent?.remove(E.bubble); E.bubble.material.map.dispose(); E.bubble.material.dispose(); E.bubble = null; } }
  }
  // F — ROB: stood still, facing someone within reach
  F.robE = null;
  if (!ctx.vehicles?.mounted && (F.pspeed < 2.6 || me.mounted?.train) && !K.state()?.dialog) {   // riding the F: the train's speed doesn't count
    const fx = -Math.sin(me.yaw || 0), fz = -Math.cos(me.yaw || 0); let bd = 2.3;
    for (const E of F.active) { const vx = E.pos.x - P.x, vz = E.pos.z - P.z, d = Math.hypot(vx, vz); if (d < bd && Math.abs(E.pos.y - P.y) < 2 && (vx * fx + vz * fz) / (d || 1) > 0.7 && !E.p.kid) { bd = d; F.robE = E; } }
    if (F.robE) F.robPos.copy(F.robE.pos).setY(P.y);
  }
}
function tick() {
  const { ctx } = F; const me = ctx.player, P = me.position, now = performance.now();
  // which spots should be live: the nearest N inside R_ON (a little hysteresis on the way out)
  const R = F.R_ON, cand = [];
  for (const s of F.spots) { if (s.train) trainPose(s); if (s.gone) { if (now > s.gone && Math.hypot(s.x - P.x, s.z - P.z) > R + 12) { s.gone = 0; F.crowd.hide(s, false); } continue; }
    const dx = s.x - P.x, dz = s.z - P.z; if (Math.abs(dx) > R + 8 || Math.abs(dz) > R + 8) continue; const d = Math.hypot(dx, dz); if (d < R + 8) cand.push([d, s]); }
  cand.sort((a, b) => a[0] - b[0]);
  const want = new Set(); for (const [d, s] of cand) { if (want.size >= F.N) break; if (d < R || s.E) want.add(s); }
  for (const E of [...F.active]) if (!want.has(E.s)) deactivate(E);
  let built = 0; for (const s of want) if (!s.E && built < (F.active.size < 4 ? 8 : 3)) { activate(s); built++; }
  if (!(ctx.state === 'playing' && !me.dead)) return;
  // trash talk
  F.barkT -= 0.25; const st = K.state() || {}, wasted = (st.drunk || 0) > 0.3 || (st.high || 0) > 0.45;
  const w = ctx.weapons, aiming = (w?.ads ?? 0) > 0.5 && w?.current?.mode !== 'MELEE' && !!w?.current;
  const fx = -Math.sin(me.yaw || 0) * Math.cos(me.pitch || 0), fz = -Math.cos(me.yaw || 0) * Math.cos(me.pitch || 0);
  for (const E of F.active) {
    const dx = E.pos.x - P.x, dz = E.pos.z - P.z, d = Math.hypot(dx, dz); E.barkT -= 0.25;
    const cast = !ctx.lite && d < 18; if (cast !== E.cast) { E.cast = cast; for (const m of E.meshes) m.castShadow = cast; }   // shadow LOD
    if (E.dead) continue;
    if (aiming && d < 28 && d > 0.5 && (dx * fx + dz * fz) / d > 0.985) {   // a gun on them: hands up (and a mouthful)
      if (E.call) endCall(E, false);
      if (E.mode !== 'lie' && E.mode !== 'sit') { E.fig.hands = true; E.hands = 2.5; }
      if (E.barkT <= 0 && F.barkT <= 0) bark(E, 'gun', true);
    } else if (d < 1.5 && F.pspeed > 1.2 && E.barkT <= 0 && F.barkT <= 0) bark(E, 'bump', true);
    else if (wasted && d < 4.5 && E.barkT <= 0 && F.barkT <= 0 && Math.random() < 0.3) bark(E, 'wasted', true);
    else if (d < 7 && E.barkT <= 0 && F.barkT <= -6 && Math.random() < (E.p.arch === 'vendor' ? 0.12 : 0.04)) bark(E, E.p.arch === 'vendor' ? 'vendor' : E.p.kid ? 'kid' : 'chatter', false);
  }
  // muggers: now and then one of the locals near you decides you look rich
  F.mugT -= 0.25;
  if (F.mugT <= 0) { F.mugT = (ctx.mode === 'chill' ? 70 : 150) + Math.random() * 70; if (!crewCalm() && !st.dialog && !ctx.vehicles?.mounted) mugger(10, 30); }
}
function mugger(dmin, dmax) {
  const P = F.ctx.player.position; let best = null, bd = Infinity;
  for (const E of F.active) { if (E.p.fem || E.p.kid || E.mode === 'lie' || E.mode === 'sit') continue; const d = Math.hypot(E.pos.x - P.x, E.pos.z - P.z); if (d < dmin || d > dmax) continue; const k = Math.abs(d - (dmin + dmax) / 2); if (k < bd) { bd = k; best = E; } }
  if (!best) for (const E of F.active) { if (E.p.fem || E.p.kid) continue; const d = Math.hypot(E.pos.x - P.x, E.pos.z - P.z); if (d < bd) { bd = d; best = E; } }
  if (!best) return null; const name = best.p.name;
  const t = promote(best, 'mug'); if (t) F.stats.muggers++; return t ? name : null;
}

// ---- speech bubbles ----------------------------------------------------------------------------------------------------
function bark(E, kind, atYou) {
  const line = pick(BARK[kind]); E.barkT = 25; F.barkT = kind === 'chatter' ? 4 : 5.5; F.stats.barks++;
  say(E, line); if (atYou) K.toast(`${E.p.name}: "${line}"`, 2200);
}
function say(E, line) {
  if (E.bubble) { E.bubble.parent?.remove(E.bubble); E.bubble.material.map.dispose(); E.bubble.material.dispose(); }
  const c = document.createElement('canvas'); c.width = 512; c.height = 96; const x = c.getContext('2d'); x.font = '600 30px Barlow, Arial';
  const words = line.split(' '), lines = ['']; for (const wd of words) { const tl = (lines[lines.length - 1] + ' ' + wd).trim(); if (x.measureText(tl).width > 470 && lines[lines.length - 1]) lines.push(wd); else lines[lines.length - 1] = tl; }
  const L = lines.slice(0, 2), wmax = Math.max(...L.map((l) => x.measureText(l).width)) + 28, h = L.length * 34 + 16;
  x.fillStyle = 'rgba(255,255,255,0.92)'; x.beginPath(); x.roundRect?.(256 - wmax / 2, 2, wmax, h, 14); if (!x.roundRect) x.rect(256 - wmax / 2, 2, wmax, h); x.fill();
  x.fillStyle = '#111'; x.textAlign = 'center'; L.forEach((l, i) => x.fillText(l, 256, 32 + i * 34));
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); s.scale.set(1.9, 0.36, 1); s.renderOrder = 5;
  s.position.set(E.pos.x, E.pos.y + (E.mode === 'lie' ? 0.9 : E.mode === 'sit' ? 1.7 : 2.15), E.pos.z); F.world.scene.add(s);
  s.onBeforeRender = () => s.position.set(E.pos.x, E.pos.y + (E.mode === 'lie' ? 0.9 : E.mode === 'sit' ? 1.7 : 2.15), E.pos.z);
  E.bubble = s; E.bubbleT = 2.8;
}
/** something went down: the nearest witnesses have an opinion, soft ones close by run */
function onCrime(e) {
  if (!F || !e?.pos) return; const { pos } = e; let n = 0;
  const list = [...F.active].map((E) => [Math.hypot(E.pos.x - pos.x, E.pos.z - pos.z), E]).filter(([d]) => d < 26).sort((a, b) => a[0] - b[0]);
  for (const [d, E] of list) {
    if (E.p.name === e.name) continue;
    if ((e.kind === 'kill' || e.kind === 'fight' || e.kind === 'hit') && d < 13 && E.p.temper === 'soft' && E.mode !== 'lie' && E.mode !== 'sit') { E.panic = 5 + Math.random() * 3; E.panicYaw = Math.atan2(E.pos.x - pos.x, E.pos.z - pos.z) + (Math.random() - 0.5) * 0.6; if (n < 1 && E.barkT <= 0) { bark(E, 'panic', false); n++; } continue; }
    if (n < 2 && E.barkT <= 0) { say(E, pick(BARK.witness)); E.barkT = 20; n++; }
  }
}

/** QA hooks: window.__game.folk */
export const folkQA = {
  crossers: () => F ? [...F.active].filter((E) => E.s.cross).map((E) => { const c = E.s.cross, hx = E.dir > 0 ? c.hx : -c.hx, hz = E.dir > 0 ? c.hz : -c.hz, L = E.leg;
    const along = L ? ((E.pos.x - L.ax) * (L.bx - L.ax) + (E.pos.z - L.az) * (L.bz - L.az)) / ((L.bx - L.ax) ** 2 + (L.bz - L.az) ** 2 || 1) : 0;
    return { waiting: !!E.atEnd && !crossOK(E), mid: along > 0.3 && along < 0.7, leaving: !E.atEnd && (E.dir > 0 ? along < 0.12 : along > 0.88), state: F.world.W.signals?.state(c.j, hx, hz) }; }) : [],
  callers: () => F ? [...F.active].filter((E) => E.call).map((E) => ({ name: E.p.name, t: +E.call.t.toFixed(1), pos: E.pos.toArray().map((v) => +v.toFixed(1)) })) : [],
  hitCaller: () => { const E = F && [...F.active].find((q) => q.call); if (!E) return false; E.hb.userData.onHit(5, false, null, null); return true; },
  crossStats: () => F ? { starts: F.stats.crossStarts || 0 } : null,
  archs: () => F ? [...F.active].map((E) => E.p.arch || 'none') : [],
  state: () => F && { spots: F.spots.length, active: F.active.size, gone: F.spots.filter((s) => s.gone).length, cache: F.cache.length, stats: { ...F.stats }, robTarget: F.robE?.p.name || null, pspeed: +F.pspeed.toFixed(2),
    near: [...F.active].map((E) => ({ name: E.p.name, avatar: E.p.avatar, mode: E.mode, zone: E.s.zone, temper: E.p.temper, tint: E.p.tint != null, hat: E.p.hat, pos: E.pos.toArray().map((v) => +v.toFixed(1)), real: !!E.fig.avatar, d: +Math.hypot(E.pos.x - F.ctx.player.position.x, E.pos.z - F.ctx.player.position.z).toFixed(1) })).sort((a, b) => a.d - b.d) },
  /** face the nearest live local (optionally of a temper) from `d` m and return its name */
  face: (temper = null, d = 1.6) => { const P = F.ctx.player.position; let best = null, bd = Infinity; for (const E of F.active) { if (temper && E.p.temper !== temper) continue; if (E.mode === 'lie' || E.mode === 'sit') continue; const dd = Math.hypot(E.pos.x - P.x, E.pos.z - P.z); if (dd < bd) { bd = dd; best = E; } }
    if (!best) return null; if (best.mode === 'walk') { best.mode = 'stand'; best.leg = null; } const a = Math.random() * 6.28, x = best.pos.x + Math.cos(a) * d, z = best.pos.z + Math.sin(a) * d; F.ctx.player.teleport(x, best.pos.y, z, Math.atan2(-(best.pos.x - x), -(best.pos.z - z)), -0.1); F.lastP.set(x, 0, z); F.pspeed = 0; return best.p.name; },
  rob: (force = null) => { const E = F.robE; if (!E) return null; const t = promote(E, 'rob'); if (t) folkRob(t, force); return t ? { id: t.id, name: t.name } : null; },
  hit: (temper = 'scrappy', dmg = 25) => { const P = F.ctx.player.position; let best = null, bd = Infinity; for (const E of F.active) { if (temper && E.p.temper !== temper) continue; const d = Math.hypot(E.pos.x - P.x, E.pos.z - P.z); if (d < bd) { bd = d; best = E; } } if (!best) return null; best.hb.userData.onHit(dmg, false, best.pos.clone(), new THREE.Vector3(0, 0, 0)); return best.p.name; },
  mug: (dmin = 4, dmax = 14) => mugger(dmin, dmax),
  /** stand in front of someone on a subway platform (zone 'subway') or in the F (zone 'train') */
  subway: (zone = 'subway') => { const list = F.spots.filter((s) => s.zone === zone && !s.gone); if (!list.length) return null; const s = list[0]; if (s.train) trainPose(s); const fx = Math.sin(s.ry), fz = Math.cos(s.ry), x = s.x + fx * 1.3, z = s.z + fz * 1.3; F.ctx.player.teleport(x, s.y, z, Math.atan2(fx, fz), -0.15); F.lastP.set(x, s.y, z); F.pspeed = 0; return { key: s.key, pos: [s.x, s.y, s.z] }; },
  giveGun: (id = 'm9') => { const E = F.robE; if (E) E.p.gun = id; return E?.p.name || null; },
  robLight: (force = null, reach = 0) => { let E = F.robE; if (!E && reach) { const P = F.ctx.player.position; let bd = reach; for (const e of F.active) { const d = Math.hypot(e.pos.x - P.x, e.pos.z - P.z); if (e.s.sub && d < bd) { bd = d; E = e; } } } return E && E.s.sub ? { name: E.p.name, ok: lightRob(E, force), gun: E.p.gun } : null; },
  armed: (temper = null) => { const P = F.ctx.player.position; let best = null, bd = Infinity; for (const E of F.active) { if (!E.p.gun || E.p.gun === 'knife' || E.s.sub || E.mode === 'lie' || E.mode === 'sit') continue; if (temper && E.p.temper !== temper) continue; const d = Math.hypot(E.pos.x - P.x, E.pos.z - P.z); if (d < bd) { bd = d; best = E; } } return best ? best.p.name : null; },
  bark: (kind = 'bump') => { const E = [...F.active][0]; if (E) bark(E, kind, true); return E?.p.name; },
};
