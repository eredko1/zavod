// Online co-op enemy waves, host-authoritative. Owned by: AI agent (with src/ai.js).
//
// HOST. Deterministic: the lowest net id among connected, non-AFK players (menu / pause / hidden tab = AFK). A client only
// takes over when no fresh host stream exists (no 'wv' for 1.6 s, or the sender left the room), after a 3.5 s boot grace, so
// joining mid-game never steals the role; two hosts (split brain) resolve on the first packet — the higher id yields. A host
// that goes AFK for 2 s resigns. The host runs the real AI (ai.js: waves of squads, nav, cover, ragdolls) with every player as
// a target: ai.mpConfigure({ targets }) hands it the local player object plus one proxy per remote player (the net.js
// interpolated position; same shape as ctx.player: position / eye() / yaw / damage()). Each soldier fights the nearest player,
// switches when someone else is much closer or in plain view while its own target hides, and turns on whoever shoots it.
//
// STREAM. 'wv' at 10 Hz (2 Hz heartbeat when empty): wave / cycle / phase + one row per soldier
// [wid, x, y, z, yaw, speed, flags, hp, aimYaw, aimPitch] (~60 B per soldier, 18 soldiers ≈ 1.1 KB < net.js 4 KB cap).
// Soldier ids (wid) are room-wide and survive host migration: the next host adopts its puppets as real soldiers with the SAME
// wids, positions and health, and carries on the wave (phase, timer, squads still to come) from the last packet it saw.
//
// NON-HOST. Puppets (ai.netPuppet: the same soldier model, hitboxes are raycast targets) extrapolate the newest row ≤ 150 ms
// along its velocity and damp onto it; aim, crouch, run/walk blend, muzzle flashes + tracers + sound come from the flags.
// Hitting a puppet sends ('wvhit', {id, dmg, hs}) to the host, which applies ai.netDamage and credits the shooter; every
// client gets ('wvkill', {id, k, hs}) → kill feed (the killer also gets the kill hitmarker + popup).
// A soldier shooting a remote player: the host sums the damage per victim and sends ('wvshot', {to, dmg, p}) at 5 Hz; the
// victim applies it locally (victim-authoritative like PvP) unless dead, AFK or inside the 2.5 s spawn protection.
//
// WAVES. 6 · 8 · 10 · 12 · 14 · 16 · 18 (×0.6 solo, ×0.8 for two), squads of 3–4 every 4 s, at most 14 alive at once; 14 s
// breaks, 35 s after wave 7, then the cycle repeats tougher (+15 % health / +10 % damage per cycle). Squads spawn 26–70 m
// from a player — preferring someone who just respawned, so the mercs come for you where you respawn — out of every
// player's sight, ≥ 20 m from everyone, on open ground (never on roofs / in buildings; coney: never in a Luna Park lobby).
// Players inside a building (coney/chase.js world.indoorAt: lobbies, elevators, the 19th floor) are staked out at the doors.
// RESPAWN BIKE. After every respawn a rideable motorcycle is placed within ~15 m (unless one is already there).
// Opt out: ?waves=0 (also off with ?ai=0; ?ai=1 keeps the old per-client AI).
import * as THREE from 'three';

const SEND_DT = 0.1, HEARTBEAT_DT = 0.5, SHOT_DT = 0.2, HOST_STALE = 1600, BOOT_GRACE = 3500, AFK_RESIGN = 2000, PROTECT_MS = 2500;
const WAVES = [6, 8, 10, 12, 14, 16, 18], TOTAL = WAVES.length;
const FIRST_DELAY = 20, BREAK = 14, CYCLE_BREAK = 35, MAX_ALIVE = 14, SQUAD_GAP = 4;
const F_FIRE = 1, F_DEAD = 2, F_CROUCH = 4, F_AIM = 8, F_RUSH = 16;
const PH = ['wait', 'countdown', 'active', 'between'];
const ID_RE = /^[a-z0-9]{8}$/;
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const num = (v, lim) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : NaN);
const r2 = (v) => Math.round(v * 100) / 100;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _ray = new THREE.Raycaster();

let N = null;

export async function init(ctx) {
  const qs = ctx.qs, net = ctx.net, ai = ctx.ai;
  if (!net?.send || !net.list || !ai?.mpSpawnSquad || qs.get('ai') === '0' || qs.get('ai') === '1' || qs.get('waves') === '0') return null;
  N = {
    ctx, net, ai, t0: performance.now(), host: false, hostId: null, hostSeen: 0, afkSince: 0,
    wave: 0, cycle: 0, phase: 'wait', phaseT: FIRST_DELAY, pending: [], clock: 0, enemies: 0, nextWid: 1, anchorI: 0,
    byWid: new Map(), puppets: new Map(), proxies: new Map(), targets: [], indoor: new Set(), peerDead: new Map(), respawns: [],
    outShots: new Map(), sendT: 0, beatT: 0, shotT: 0, checkT: 0, waveKey: '', killsSeen: new Set(), killLog: [], shotsTaken: 0, dmgTaken: 0,
    protUntil: 0, myBikes: [], lastWv: 0,
  };
  ai.setMirror({ get wave() { return N.wave; }, alive: () => aliveCount() });
  const bus = ctx.bus;
  bus.on('net:wv', (m) => { try { onWv(m); } catch (e) { console.warn('[netwaves] wv', e); } });
  bus.on('net:wvhit', (m) => onHit(m));
  bus.on('net:wvshot', (m) => onShot(m));
  bus.on('net:wvkill', (m) => onKill(m));
  bus.on('net:wvmsg', (m) => { if (m?.x === 'clear') ctx.hud?.toast?.('ALL WAVES CLEARED — THEY REGROUP', 3000); });
  bus.on('netEnemyKilled', (d) => { if (N.host && d?.soldier?.wid) broadcastKill(d.soldier.wid, d.by, d.headshot); });
  bus.on('enemyKilled', (d) => { if (N.host && d?.wave && d.soldier?.wid) { N.killsSeen.add(d.soldier.wid); broadcastKill(d.soldier.wid, net.id, d.headshot, true); } });
  bus.on('playerRespawn', () => {
    N.protUntil = performance.now() + PROTECT_MS; ai.protectUntil = N.protUntil;
    if (N.host) noteRespawn(ctx.player, ctx.player.position);
    setTimeout(() => { try { ensureBike(); } catch (e) { console.warn('[netwaves] bike', e); } }, 150);
  });
  const api = {
    get isHost() { return N.host; }, get hostId() { return N.host ? net.id : N.hostId; },
    get wave() { return N.wave; }, get phase() { return N.phase; },
    /** a wave fight is on (coney chase: shooting mercs doesn't raise your wanted level) */
    get busy() { return N.phase === 'active' || aliveCount() > 0; },
    alive: () => aliveCount(),
  };
  if (typeof window !== 'undefined' && window.__game) window.__game.waves = QA;
  console.log('[netwaves] online co-op waves on', net.id);
  return api;
}

// ---------------------------------------------------------------------------------------------------------------------------
// roles
const localAfk = () => document.hidden || N.ctx.state === 'menu' || N.ctx.state === 'paused';
function eligible(id) { if (id === N.net.id) return !localAfk(); const p = N.net.peer(id); return !!p && !p.afk; }
function hostFresh(now) { return !!N.hostId && N.hostId !== N.net.id && now - N.hostSeen < HOST_STALE && !!N.net.peer(N.hostId); }

function elect(now) {
  if (N.host) {
    if (localAfk()) { if (!N.afkSince) N.afkSince = now; if (now - N.afkSince > AFK_RESIGN) resign('afk'); } else N.afkSince = 0;
    return;
  }
  if (hostFresh(now) || now - N.t0 < BOOT_GRACE || localAfk() || !N.net.connected) return;
  const cands = [N.net.id, ...N.net.list()].filter(eligible).sort();
  if (cands[0] === N.net.id) becomeHost();
}

function becomeHost() {
  const { ai, ctx } = N;
  N.host = true; N.hostId = N.net.id; N.afkSince = 0;
  ai.mpConfigure({ targets: () => N.targets, indoor: (x) => N.indoor.has(x) });
  buildTargets();
  // adopt the previous host's soldiers: same wid / position / health, squads = runs of consecutive wids that stand close
  const live = [...N.puppets.entries()].filter(([, q]) => !q.s.dead && q.cur).sort((a, b) => a[0] - b[0]);
  let maxWid = 0; for (const wid of N.puppets.keys()) maxWid = Math.max(maxWid, wid);
  let group = [];
  const flush = () => {
    if (!group.length) return; const tgt = nearestTarget(group[0][1].s.position);
    const members = group.map(([, q]) => ({ pos: q.s.position.clone(), yaw: q.s.yaw, health: Math.round(100 * (1 + 0.15 * N.cycle)) * ((q.cur.fl & F_RUSH) ? 0.8 : 1), hp: q.cur.hp, archetype: (q.cur.fl & F_RUSH) ? 'rusher' : 'rifleman', dmgMul: 1 + 0.1 * N.cycle }));
    const ss = ai.mpSpawnSquad(members, tgt);
    ss.forEach((s, i) => { const wid = group[i][0]; s.wid = wid; N.byWid.set(wid, s); });
    for (const [wid, q] of group) { ai.netPuppetRelease(q.s); N.puppets.delete(wid); }
    group = [];
  };
  for (const e of live) { if (group.length >= 4 || (group.length && group[group.length - 1][1].s.position.distanceTo(e[1].s.position) > 12)) flush(); group.push(e); }
  flush();
  N.nextWid = Math.max(N.nextWid, maxWid + 1);
  if (N.phase === 'wait') { N.phase = 'countdown'; N.phaseT = FIRST_DELAY; ctx.hud?.toast?.(`HOSTILES INBOUND IN ${FIRST_DELAY}s`, 2500); }
  if (N.phase === 'active' && !N.pending.length && N.pendingN > 0) N.pending = splitSquads(N.pendingN).map((size, i) => ({ size, at: N.clock + 1 + i * SQUAD_GAP }));
  console.log('[netwaves] HOST', N.net.id, 'wave', N.wave, N.phase, 'adopted', N.byWid.size);
  sendSnap(performance.now());
}

function resign(why) {
  const { ai } = N;
  console.log('[netwaves] resign', why);
  N.host = false; N.hostId = null; N.hostSeen = 0; N.afkSince = 0;
  ai.mpConfigure(null);
  for (const s of N.byWid.values()) { try { ai.removeSoldier(s); } catch {} }
  N.byWid.clear(); N.outShots.clear();
}

// ---------------------------------------------------------------------------------------------------------------------------
// host: targets (the local player + remote proxies)
function proxyFor(id) {
  let x = N.proxies.get(id);
  if (!x) {
    x = { id, remote: true, position: new THREE.Vector3(), yaw: 0, height: 1.75, crouching: false, sprinting: false, speed: 0, mounted: null, _last: null,
      eye() { return new THREE.Vector3(this.position.x, this.position.y + 1.6, this.position.z); },
      damage(dmg, from) { if (!(dmg > 0)) return; const o = N.outShots.get(id) || { dmg: 0, from: null }; o.dmg += dmg; o.from = from ? from.clone() : o.from; N.outShots.set(id, o); } };
    N.proxies.set(id, x);
  }
  return x;
}
function buildTargets() {
  const { ctx, net } = N; const T = N.targets; T.length = 0; N.indoor.clear();
  const indoorAt = ctx.world?.indoorAt;
  const me = ctx.player;
  if (me && !me.dead && ctx.state === 'playing') { T.push(me); if (indoorAt?.(me.position, me.mounted)) N.indoor.add(me); }
  const now = performance.now(), ids = net.list();
  for (const id of ids) {
    const p = net.peer(id); if (!p) continue;
    const wasDead = N.peerDead.get(id); N.peerDead.set(id, !!p.dead);
    if (wasDead && !p.dead) noteRespawn(proxyFor(id), p.pos);
    if (p.dead || p.afk) continue;
    const x = proxyFor(id);
    if (x._last) { const dt = (now - x._last.t) / 1000; if (dt > 0.02) { const sp = Math.hypot(p.pos.x - x._last.x, p.pos.z - x._last.z) / dt; x.speed = x.speed * 0.7 + Math.min(sp, 40) * 0.3; x._last = { x: p.pos.x, z: p.pos.z, t: now }; } } else x._last = { x: p.pos.x, z: p.pos.z, t: now };
    x.position.copy(p.pos); x.yaw = p.heading || 0; x.sprinting = x.speed > 5; x.veh = p.veh;
    T.push(x); if (indoorAt?.(x.position, null)) N.indoor.add(x);
  }
  for (const id of N.proxies.keys()) if (!ids.includes(id)) { N.proxies.delete(id); N.peerDead.delete(id); }
}
function nearestTarget(pos) { let best = null, bd = 1e9; for (const x of N.targets) { const d = x.position.distanceTo(pos) + (N.indoor.has(x) ? 40 : 0); if (d < bd) { bd = d; best = x; } } return best; }
/** someone respawned: remember it (the next squads spawn around them) and radio their new position to the soldiers after them */
function noteRespawn(tgt, pos) {
  N.respawns.push({ tgt, pos: pos.clone(), t: performance.now() }); if (N.respawns.length > 6) N.respawns.shift();
  const t = N.ctx.time.elapsed;
  for (const s of N.byWid.values()) if (!s.dead && s.tgt === tgt) { s.lastKnown.copy(pos); s.lastSeen = Math.max(s.lastSeen, t - 3); }
}

// ---------------------------------------------------------------------------------------------------------------------------
// host: wave machine
function playerScale() { const n = 1 + N.net.list().filter((id) => N.net.peer(id) && !N.net.peer(id).afk).length; return n >= 3 ? 1 : n === 2 ? 0.8 : 0.6; }
function splitSquads(n) { const out = []; while (n > 0) { if (n === 5 || n === 6) { out.push(3); n -= 3; } else if (n === 7) { out.push(4); n -= 4; } else { const k = Math.min(4, n); out.push(k); n -= k; } } return out; }
function startWave(n) {
  if (n > TOTAL) { n = 1; N.cycle++; }
  N.wave = n; N.phase = 'active'; N.clock = 0;
  const count = Math.max(4, Math.round(WAVES[n - 1] * playerScale())); N.enemies = count;
  N.pending = splitSquads(count).map((size, i) => ({ size, at: i * SQUAD_GAP }));
  N.waveKey = `${N.cycle}:${n}`;
  N.ctx.bus.emit('wave', { n, total: TOTAL, enemies: count });
  sendSnap(performance.now());
}
function hostTick(dt) {
  if (N.phase === 'countdown' || N.phase === 'between') { N.phaseT -= dt; if (N.phaseT <= 0) startWave(N.wave + 1); return; }
  if (N.phase !== 'active') return;
  N.clock += dt;
  let alive = aliveCount();
  for (let i = 0; i < N.pending.length; i++) {
    const p = N.pending[i]; if (N.clock < p.at) continue;
    if (alive + p.size > MAX_ALIVE && alive > 0) { p.at = N.clock + 1.5; continue; }
    if (!N.targets.length) { p.at = N.clock + 2; continue; }
    const got = spawnSquad(p.size); if (!got) { p.at = N.clock + 2; continue; }
    N.pending.splice(i--, 1); alive += got;
  }
  if (!N.pending.length && alive === 0 && N.clock > 2) {
    if (N.wave >= TOTAL) { N.phase = 'between'; N.phaseT = CYCLE_BREAK; N.wave = 0; N.ctx.hud?.toast?.('ALL WAVES CLEARED — THEY REGROUP', 3000); N.net.send('wvmsg', { x: 'clear' }); }
    else { N.phase = 'between'; N.phaseT = BREAK; }
    sendSnap(performance.now());
  }
}
function spawnSquad(size) {
  const { ai, ctx } = N;
  // anchor: someone who respawned in the last 25 s (the mercs come for you), else round-robin over the players
  const now = performance.now(); let tgt = null, anchor = null;
  const rs = N.respawns.filter((r) => now - r.t < 25000 && N.targets.includes(r.tgt));
  if (rs.length) { const r = rs[rs.length - 1]; N.respawns.splice(N.respawns.indexOf(r), 1); tgt = r.tgt; anchor = r.pos.clone(); }
  if (!tgt) { const outdoor = N.targets.filter((x) => !N.indoor.has(x)); const pool = outdoor.length ? outdoor : N.targets; tgt = pool[N.anchorI++ % pool.length]; anchor = tgt.position.clone(); }
  const doors = ctx.world?.indoorAt?.(anchor, tgt === ctx.player ? ctx.player.mounted : null);
  if (doors?.length) anchor = doors[0].clone();
  const at = findSpawn(anchor); if (!at) return 0;
  const yaw = Math.atan2(anchor.x - at.x, anchor.z - at.z);
  const hpMul = 1 + 0.15 * N.cycle, members = [];
  for (let i = 0; i < size; i++) {
    const a = (i / size) * Math.PI * 2 + ctx.rng(), r = i === 0 ? 0 : 1.4 + ctx.rng();
    const p = ai.nav.randomFreeNear(at.x + Math.cos(a) * r, at.z + Math.sin(a) * r, 1.5, ctx.rng, at.y) || at.clone();
    const rusher = N.wave >= 2 && i === size - 1 && size >= 3;
    members.push({ pos: p, yaw: yaw + (ctx.rng() - 0.5) * 0.4, health: Math.round((rusher ? 80 : 100) * hpMul), archetype: rusher ? 'rusher' : 'rifleman', dmgMul: 1 + 0.1 * N.cycle });
  }
  const ss = ai.mpSpawnSquad(members, tgt);
  for (const s of ss) { s.wid = N.nextWid++; N.byWid.set(s.wid, s); }
  return ss.length;
}
/** open ground 26–70 m from the anchor, ≥ 20 m from every player, same nav region, hidden from every player if possible */
function findSpawn(anchor) {
  const { ctx, ai } = N; const nav = ai.nav, W = ctx.world || {}, rng = ctx.rng;
  const players = N.targets.map((x) => x.position);
  const reg = nav.regionAt(anchor.x, anchor.z, anchor.y);
  const ok = (q) => {
    if (!q || !Number.isFinite(q.y)) return false;
    if (W.groundHeight && Math.abs(q.y - W.groundHeight(q.x, q.z)) > 1.5) return false;   // roofs, balconies, upper floors
    if (W.chaseNoGo?.(q.x, q.z, q.y) || W.indoorAt?.(q, null)) return false;
    if (reg !== -1 && nav.regionAt(q.x, q.z, q.y) !== reg) return false;
    const d = Math.hypot(q.x - anchor.x, q.z - anchor.z); if (d < 26 || d > 70) return false;
    for (const p of players) if (Math.hypot(q.x - p.x, q.z - p.z) < 20) return false;
    return true;
  };
  const cands = [];
  for (const v of [...(W.enemySpawns || []), ...(W.playerSpawns || [])]) { if (!v) continue; const d = Math.hypot(v.x - anchor.x, v.z - anchor.z); if (d < 26 || d > 70) continue; const q = nav.nearestFree(v.x, v.z, 3, v.y || 0); if (ok(q)) cands.push(q); }
  for (let k = 0; k < 28 && cands.length < 16; k++) { const a = rng() * Math.PI * 2, d = 30 + rng() * 35; const q = nav.nearestFree(anchor.x + Math.cos(a) * d, anchor.z + Math.sin(a) * d, 4, anchor.y); if (ok(q)) cands.push(q); }
  if (!cands.length) { for (let k = 0; k < 12; k++) { const q = nav.randomFreeNear(anchor.x, anchor.z, 60, rng, anchor.y); if (q && !W.chaseNoGo?.(q.x, q.z, q.y) && players.every((p) => Math.hypot(q.x - p.x, q.z - p.z) > 15)) return q; } return null; }
  for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
  for (const q of cands.slice(0, 8)) if (hiddenFromAll(q)) return q;
  return cands[0];
}
function hiddenFromAll(q) {
  const targets = N.ctx.raycastTargets || [];
  for (const x of N.targets) {
    const e = x.eye(); _v.set(q.x, q.y + 1.3, q.z); const d = e.distanceTo(_v); if (d > 150) continue;
    _ray.set(e, _v2.subVectors(_v, e).normalize()); _ray.near = 0.3; _ray.far = d - 0.3;
    let blocked = false;
    try { for (const h of _ray.intersectObjects(targets, false)) { const u = h.object.userData; if (u.soldier || u.noLOS || u.remote) continue; blocked = true; break; } } catch { blocked = true; }
    if (!blocked) return false;
  }
  return true;
}
function aliveCount() {
  if (N.host) { let n = 0; for (const s of N.byWid.values()) if (!s.dead) n++; return n; }
  let n = 0; for (const q of N.puppets.values()) if (!q.s.dead && !q.missing) n++; return n;
}

// ---------------------------------------------------------------------------------------------------------------------------
// host: outbound
function sendSnap(now) {
  const { net, ai } = N; if (!N.host) return;
  const rows = [], dead = [];
  for (const [wid, s] of N.byWid) {
    if (s.removeMe) { N.byWid.delete(wid); continue; }
    const p = s.position;
    if (s.dead) { dead.push([wid, r2(p.x), r2(p.y), r2(p.z), r2(s.yaw), 0, F_DEAD, 0]); continue; }
    const ad = s.aimDir;
    const fl = (s.burst > 0 ? F_FIRE : 0) | (s.crouch > 0.5 ? F_CROUCH : 0) | (s.hasTarget ? F_AIM : 0) | (s.archetype === 'rusher' ? F_RUSH : 0);
    rows.push([wid, r2(p.x), r2(p.y), r2(p.z), r2(s.yaw), Math.round(s.speed * 10) / 10, fl, Math.max(1, Math.round(s.health)), r2(Math.atan2(ad.x, ad.z)), r2(Math.asin(Math.max(-1, Math.min(1, ad.y))))]);
  }
  while (rows.length + dead.length > 40 && dead.length) dead.shift();
  N.lastSend = now;
  net.send('wv', { w: N.wave, c: N.cycle, ph: PH.indexOf(N.phase), pt: Math.round(N.phaseT * 10) / 10, pn: N.pending.reduce((a, p) => a + p.size, 0), e: N.enemies, s: rows.concat(dead) });
  void ai;
}
function flushShots() {
  for (const [id, o] of N.outShots) { const dmg = Math.min(200, Math.round(o.dmg)); if (dmg > 0) N.net.send('wvshot', { to: id, dmg, p: o.from ? [r2(o.from.x), r2(o.from.y), r2(o.from.z)] : null }); }
  N.outShots.clear();
}
function broadcastKill(wid, by, hs, hostLocal = false) {
  const m = { id: wid, k: by || null, hs: !!hs };
  N.net.send('wvkill', m); setTimeout(() => { if (N) N.net.send('wvkill', m); }, 300);   // lossy QoS 0: say it twice (receivers dedupe by wid)
  if (!hostLocal) onKill({ ...m, f: N.net.id });
  else N.killLog.push({ id: wid, k: by, hs: !!hs });
}

// ---------------------------------------------------------------------------------------------------------------------------
// inbound
function onWv(m) {
  if (!N || !m || !ID_RE.test(m.f) || !Array.isArray(m.s)) return;
  const now = performance.now(), f = m.f;
  if (N.host) { if (f < N.net.id && eligible(f)) resign('yield to ' + f); else return; }
  if (N.hostId !== f) console.log('[netwaves] host is', f);
  N.hostId = f; N.hostSeen = now; N.lastWv = now;
  const was = N.phase;
  N.wave = Math.max(0, Math.min(99, m.w | 0)); N.cycle = Math.max(0, Math.min(99, m.c | 0)); N.phase = PH[m.ph | 0] || 'wait'; N.phaseT = +m.pt || 0; N.pendingN = Math.max(0, Math.min(99, m.pn | 0)); N.enemies = m.e | 0;
  if (N.phase === 'countdown' && was !== 'countdown' && N.phaseT > 3) N.ctx.hud?.toast?.(`HOSTILES INBOUND IN ${Math.round(N.phaseT)}s`, 2500);
  const key = `${N.cycle}:${N.wave}`;
  if (N.phase === 'active' && N.wave > 0 && key !== N.waveKey) { N.waveKey = key; N.ctx.bus.emit('wave', { n: N.wave, total: TOTAL, enemies: N.enemies || undefined }); }
  const seen = new Set();
  for (const r of m.s.slice(0, 60)) {
    if (!Array.isArray(r) || r.length < 8) continue;
    const wid = Number.isInteger(r[0]) && r[0] > 0 && r[0] < 1e7 ? r[0] : 0; if (!wid) continue;
    const x = num(r[1], 20000), y = num(r[2], 5000), z = num(r[3], 20000), yaw = num(r[4], 10), sp = num(r[5], 50), fl = Number.isInteger(r[6]) ? r[6] : 0, hp = num(r[7], 1000);
    if ([x, y, z, yaw, sp, hp].some(Number.isNaN)) continue;
    const ay = num(r[8] ?? 0, 10), ap = num(r[9] ?? 0, 10);
    seen.add(wid);
    let q = N.puppets.get(wid);
    if (!q) {
      if (fl & F_DEAD) continue;   // a corpse we never saw alive: skip it
      const s = N.ai.netPuppet(); s.placeAt(_v.set(x, y, z), yaw); s.wid = wid;
      s.onNetHit = (dmg, hs) => hitPuppet(wid, dmg, hs);
      q = { s, cur: null, prev: null, flashT: 0 }; N.puppets.set(wid, q);
      N.nextWid = Math.max(N.nextWid, wid + 1);
    }
    q.prev = q.cur; q.cur = { x, y, z, yaw, sp, fl, hp, ay: Number.isNaN(ay) ? 0 : ay, ap: Number.isNaN(ap) ? 0 : ap, at: now }; q.missing = 0;
    if ((fl & F_DEAD) && !q.s.dead) killPuppet(q, false);
  }
  for (const q of N.puppets.values()) if (!seen.has(q.s.wid) && !q.missing) q.missing = now;
}
function hitPuppet(wid, dmg, hs) {
  if (!N || N.host || !(dmg > 0)) return;
  N.net.send('wvhit', { id: wid, dmg: Math.max(0, Math.min(250, dmg | 0)), hs: !!hs });
}
function onHit(m) {
  if (!N?.host || !m || !ID_RE.test(m.f)) return;
  const s = N.byWid.get(m.id); if (!s || s.dead) return;
  const dmg = Math.max(0, Math.min(250, +m.dmg || 0)); if (!dmg) return;
  const p = N.net.peer(m.f); const tgt = p && !p.dead ? proxyFor(m.f) : null; if (tgt && p) tgt.position.copy(p.pos);
  N.ai.netDamage(s, dmg, !!m.hs, m.f, tgt);
}
function onShot(m) {
  if (!N || !m || m.to !== N.net.id || !(m.f === N.hostId || N.net.peer(m.f))) return;
  const me = N.ctx.player; if (!me || me.dead || localAfk() || performance.now() < N.protUntil) return;
  const dmg = Math.max(0, Math.min(200, +m.dmg || 0)); if (!dmg) return;
  const p = Array.isArray(m.p) ? m.p.map((v) => num(v, 20000)) : null;
  N.shotsTaken++; N.dmgTaken += dmg;
  me.damage(dmg, p && !p.some(Number.isNaN) ? new THREE.Vector3(p[0], p[1], p[2]) : null);
}
function onKill(m) {
  if (!N || !m) return; const wid = m.id | 0; if (!wid || N.killsSeen.has(wid)) return; N.killsSeen.add(wid);
  if (N.killsSeen.size > 800) N.killsSeen = new Set([...N.killsSeen].slice(-400));
  const k = ID_RE.test(m.k) ? m.k : null, hs = !!m.hs, ctx = N.ctx, me = N.net.id;
  N.killLog.push({ id: wid, k, hs }); if (N.killLog.length > 60) N.killLog.shift();
  const q = N.puppets.get(wid); if (q && !q.s.dead) killPuppet(q, hs);
  const name = (id) => id === me ? 'YOU' : (N.net.peer(id)?.name || N.net.scores?.().find((s) => s.id === id)?.name || '?');
  ctx.hud?.killfeed?.(`${k ? name(k) : 'WORLD'} → ${hs ? '⊕ ' : ''}MERCENARY`);
  if (k === me) { ctx.hud?.hitmarker?.(hs, true); ctx.hud?.scorePopup?.(hs ? 'HEADSHOT KILL' : 'KILL', hs); }
}
function killPuppet(q, hs) {
  const s = q.s; const c = q.cur;
  const dir = new THREE.Vector3(Math.sin((c?.yaw ?? s.yaw) + Math.PI), 0.2, Math.cos((c?.yaw ?? s.yaw) + Math.PI)).normalize();
  N.ai.netPuppetKill(s, dir, hs); q.deadAt = performance.now();
}

// ---------------------------------------------------------------------------------------------------------------------------
// per frame
export function update(dt, ctx) {
  if (!N) return;
  const now = performance.now(), rdt = Math.min(0.1, ctx.time?.realDt ?? dt);
  elect(now);
  if (N.host) {
    buildTargets();
    if (dt > 0) hostTick(dt);
    N.checkT -= rdt; if (N.checkT <= 0) { N.checkT = 1; const all = N.ai.soldiers; for (const [wid, s] of N.byWid) if (s.removeMe || !all.includes(s)) N.byWid.delete(wid); }
    N.sendT -= rdt; N.beatT -= rdt;
    if (N.sendT <= 0 && (N.byWid.size || N.beatT <= 0)) { N.sendT = SEND_DT; N.beatT = HEARTBEAT_DT; sendSnap(now); }
    N.shotT -= rdt; if (N.shotT <= 0) { N.shotT = SHOT_DT; if (N.outShots.size) flushShots(); }
  }
  updatePuppets(rdt, now, ctx);
}

function updatePuppets(dt, now, ctx) {
  if (!N.puppets.size) return;
  const cam = ctx.camera.position, far = ctx.isTouch ? 110 : 170, live = N.ai.puppets;
  for (const [wid, q] of N.puppets) {
    const s = q.s, c = q.cur;
    if (!live.includes(s)) { N.puppets.delete(wid); continue; }   // released under us (ai reset)
    if (q.missing && (s.dead ? now - q.missing > 9000 : now - q.missing > (N.host ? 0 : 900))) { N.ai.netPuppetRelease(s); N.puppets.delete(wid); continue; }
    if (s.dead) {
      if (s.ragdoll && !s.ragdoll.settled && dt > 0) { s.ragdoll.step(dt); s.ragdoll.apply(); }
      if (q.deadAt && now - q.deadAt > 12000) { const k = Math.min(1, (now - q.deadAt - 12000) / 1500); s.group.position.y = s.position.y - k * 1.2; }
      continue;
    }
    if (!c) continue;
    // target: newest row, extrapolated ≤ 150 ms along the velocity of the last two rows
    let tx = c.x, ty = c.y, tz = c.z;
    const P = q.prev; if (P) { const span = (c.at - P.at) / 1000; if (span > 0.03 && span < 0.5 && Math.hypot(c.x - P.x, c.z - P.z) < 6) { const age = Math.min(0.15, (now - c.at) / 1000); tx += (c.x - P.x) / span * age; tz += (c.z - P.z) / span * age; ty += (c.y - P.y) / span * age; } }
    if (Math.hypot(s.position.x - tx, s.position.z - tz) > 6) s.position.set(tx, ty, tz);
    s.position.x = damp(s.position.x, tx, 12, dt); s.position.y = damp(s.position.y, ty, 12, dt); s.position.z = damp(s.position.z, tz, 12, dt);
    s.yaw = wrap(s.yaw + wrap(c.yaw - s.yaw) * (1 - Math.exp(-12 * dt)));
    s.speed = c.sp; s.crouchTarget = (c.fl & F_CROUCH) ? 0.6 : 0; s.health = c.hp;
    const vis = Math.hypot(s.position.x - cam.x, s.position.z - cam.z) < far; s.group.visible = vis;
    if (c.fl & F_AIM) { const cp = Math.cos(c.ap); s.setAim(_v.set(s.position.x + Math.sin(c.ay) * cp * 20, s.position.y + 1.35 + Math.sin(c.ap) * 20, s.position.z + Math.cos(c.ay) * cp * 20)); } else s.clearAim();
    if (c.fl & F_FIRE) {
      q.flashT -= dt;
      if (q.flashT <= 0 && vis && now - c.at < 400) {
        q.flashT = 0.1; s.showFlash();
        const o = s.muzzleWorld(new THREE.Vector3()); const d = s.aimDir.clone().normalize();
        try { ctx.bus.emit('shot', { origin: o, dir: d, weapon: 'ak', who: 'enemy', soldier: s, hit: false, net: true }); } catch {}
      }
    }
    if (vis) { s.updateAim(dt); s.updateVisual(dt); }
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// respawn: a rideable motorcycle within ~15 m
function ensureBike() {
  const { ctx } = N; const V = ctx.vehicles, me = ctx.player; if (!V?.qaSpawn || !me || me.dead) return 'none';
  const p = me.position;
  for (const b of V.list || []) { if (b.spec?.car || b === V.mounted || !b.pos) continue; if (Math.hypot(b.pos.x - p.x, b.pos.z - p.z) < 15 && Math.abs(b.pos.y - p.y) < 2) return 'near'; }
  const nav = ctx.ai?.nav, W = ctx.world || {}; const yaw = me.yaw || 0; let spot = null;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = -fz, rz = fx;
  for (const [a, b] of [[3.5, 2.2], [3.5, -2.2], [5, 0], [2, 3], [2, -3], [-3, 2.5], [-3, -2.5], [7, 3], [7, -3], [9, 0]]) {
    const x = p.x + fx * a + rx * b, z = p.z + fz * a + rz * b;
    const q = nav ? nav.nearestFree(x, z, 2.5, p.y) : new THREE.Vector3(x, p.y, z);
    if (!q || Math.abs(q.y - p.y) > 1 || Math.hypot(q.x - p.x, q.z - p.z) > 12 || Math.hypot(q.x - p.x, q.z - p.z) < 1.6) continue;
    if (W.chaseNoGo?.(q.x, q.z, q.y) || W.indoorAt?.(q, null)) continue;
    spot = q; break;
  }
  if (!spot) return 'nospot';
  // reuse our oldest spare bike once we've placed a handful (nobody on it, nobody near it)
  const players = [p, ...N.net.list().map((id) => N.net.peer(id)?.pos).filter(Boolean)];
  N.myBikes = N.myBikes.filter((b) => (V.list || []).includes(b));
  if (N.myBikes.length >= 6) {
    const b = N.myBikes.find((b) => b !== V.mounted && players.every((q) => Math.hypot(q.x - b.pos.x, q.z - b.pos.z) > 25));
    if (b) { moveBike(b, spot, yaw + Math.PI / 2); N.myBikes.push(N.myBikes.splice(N.myBikes.indexOf(b), 1)[0]); return 'moved'; }
  }
  const b = V.qaSpawn(spot.x, spot.z, yaw + Math.PI / 2, spot.y); if (b) N.myBikes.push(b);
  return 'spawned';
}
function moveBike(b, q, yaw) {
  const sp = b.spec; b.pos.set(q.x, q.y, q.z); b.heading = yaw; b.vel?.set?.(0, 0, 0); b.speed = 0; b.fwdSpeed = 0; b.parked = true;
  if (b.home) { b.home.x = q.x; b.home.z = q.z; b.home.y = q.y; b.home.yaw = yaw; }
  b.group.position.copy(b.pos); b.group.rotation.y = yaw;
  if (b.box && sp) { const c = Math.cos(yaw), s = Math.sin(yaw); const hx = Math.abs(c) * sp.hx + Math.abs(s) * sp.hz, hz = Math.abs(s) * sp.hx + Math.abs(c) * sp.hz; b.box.min.set(q.x - hx, q.y, q.z - hz); b.box.max.set(q.x + hx, q.y + (sp.boxH || 1.2), q.z + hz); }
  try { N.ctx.player?.rebuildColliders?.(); } catch {}
}

// ---------------------------------------------------------------------------------------------------------------------------
// QA hooks: window.__game.waves
const QA = {
  state: () => N && {
    id: N.net.id, host: N.host, hostId: N.host ? N.net.id : N.hostId, wave: N.wave, cycle: N.cycle, phase: N.phase, phaseT: +(+N.phaseT).toFixed(1), alive: aliveCount(),
    soldiers: N.host ? [...N.byWid].map(([id, s]) => ({ id, pos: s.position.toArray().map((v) => +v.toFixed(2)), dead: !!s.dead, hp: Math.round(s.health), tgt: s.tgt ? (s.tgt.id || N.net.id) : null }))
      : [...N.puppets].map(([id, q]) => ({ id, pos: q.s.position.toArray().map((v) => +v.toFixed(2)), dead: !!q.s.dead, hp: q.cur?.hp ?? 0, missing: !!q.missing })),
    kills: N.killLog.slice(), shotsTaken: N.shotsTaken, dmgTaken: N.dmgTaken, targets: N.targets.length, bikes: N.myBikes.length,
  },
  /** host: start wave n now */
  start: (n = 1) => { if (!N?.host) return false; startWave(n); return true; },
  /** host: a squad of `size` right here (x, z), fighting the nearest player */
  spawnAt: (x, z, size = 1) => {
    if (!N?.host) return 0; buildTargets(); const at = N.ai.nav.nearestFree(x, z, 6, 0); if (!at) return 0;
    const tgt = nearestTarget(at); const members = []; for (let i = 0; i < size; i++) members.push({ pos: i ? (N.ai.nav.randomFreeNear(at.x, at.z, 2, N.ctx.rng, at.y) || at.clone()) : at.clone(), yaw: 0, health: 100 });
    const ss = N.ai.mpSpawnSquad(members, tgt); for (const s of ss) { s.wid = N.nextWid++; N.byWid.set(s.wid, s); }
    if (N.phase !== 'active') { N.phase = 'active'; N.wave = Math.max(1, N.wave); N.clock = 0; N.pending = []; N.enemies = ss.length; }
    return ss.map((s) => s.wid);
  },
  /** non-host: stand `dist` m from puppet `wid` with a clear view and aim at its chest; returns [x, y, z] of the soldier or null */
  aimAt: (wid, dist = 7) => {
    const q = N?.puppets.get(wid); if (!q || q.s.dead) return null;
    const s = q.s, nav = N.ai.nav, me = N.ctx.player;
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8; const x = s.position.x + Math.cos(a) * dist, z = s.position.z + Math.sin(a) * dist;
      const p = nav.nearestFree(x, z, 1.5, s.position.y); if (!p || Math.abs(p.y - s.position.y) > 0.6) continue;
      const eye = new THREE.Vector3(p.x, p.y + 1.6, p.z), chest = new THREE.Vector3(s.position.x, s.position.y + 1.25, s.position.z);
      const d = chest.distanceTo(eye); _ray.set(eye, _v2.subVectors(chest, eye).normalize()); _ray.near = 0.3; _ray.far = d - 0.4;
      let clear = true; try { for (const h of _ray.intersectObjects(N.ctx.raycastTargets, false)) { const u = h.object.userData; if (u.soldier || u.noLOS || u.remote) continue; clear = false; break; } } catch {}
      if (!clear) continue;
      const dx = chest.x - eye.x, dz = chest.z - eye.z, dy = chest.y - eye.y;
      me.teleport(p.x, p.y, p.z, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
      return s.position.toArray();
    }
    return null;
  },
  /** re-aim at a puppet from where we stand */
  lookAt: (wid) => { const q = N?.puppets.get(wid); if (!q) return false; const me = N.ctx.player; const e = me.eye(); const dx = q.s.position.x - e.x, dz = q.s.position.z - e.z, dy = q.s.position.y + 1.25 - e.y; me.teleport(me.position.x, me.position.y, me.position.z, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))); return true; },
  bike: () => ensureBike(),
};
