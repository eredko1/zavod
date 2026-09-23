// Online free-for-all over free public MQTT brokers (WebSockets) — no server of our own. Owned by: main.
//
// Join: menu "Play online" (reloads into ?room=public on the current map) or any URL with ?room=<name>. ?name=<callsign>.
// Topics (per map + room):  zv2/<map>/<room>/s/<id>  player state, 15 Hz  ·  zv2/<map>/<room>/ev  events (hello/shot/hit/kill/bye)
// Model: each client owns its own player. Shooters raycast locally against interpolated remote hitboxes and send `hit`;
// the victim's client applies damage (so health is never disputed) and announces `kill`. Remote players are the AI soldier
// model driven by snapshots rendered 100 ms in the past (smooth under jitter). AI waves are off online (?ai=1 keeps them).
// Public brokers are shared and unauthenticated: rooms are not private and a modified client could lie. Fine for casual play.
import * as THREE from 'three';
import { createInstance } from './ai/model.js';

const BROKERS = ['wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt', 'wss://test.mosquitto.org:8081'];
const RATE = 1 / 15, INTERP = 0.1, TIMEOUT = 6000, RESPAWN = 4, PROTECT = 2.5;
let S = null;

export async function init(ctx) {
  const qs = ctx.qs; const online = qs.has('room') || qs.get('mp') === '1';
  // menu entry works even when offline: reload into the public room on this map
  ctx.bus.on('ui', (e) => { if (e?.action !== 'online') return; const u = new URL(location.href); u.searchParams.set('room', u.searchParams.get('room') || 'public'); u.searchParams.set('map', ctx.world?.mapId || 'zavod'); location.href = u.toString(); });
  if (!online || qs.get('mp') === '0') return null;
  let mqtt; try { mqtt = (await import('https://cdn.jsdelivr.net/npm/mqtt@5.10.1/dist/mqtt.esm.js')).default; } catch (e) { console.warn('[net] mqtt lib unavailable', e); return null; }
  const id = Math.random().toString(36).slice(2, 10);
  const room = (qs.get('room') || 'public').replace(/[^\w-]/g, '').slice(0, 24) || 'public';
  let name = qs.get('name'); try { if (!name) name = localStorage.getItem('zavod.name'); if (qs.get('name')) localStorage.setItem('zavod.name', qs.get('name')); } catch {}
  name = String(name || 'OP-' + id.slice(0, 4).toUpperCase()).replace(/[<>&"]/g, '').slice(0, 16);
  const base = `zv2/${ctx.world?.mapId || 'zavod'}/${room}/`;
  S = { ctx, mqtt, id, room, name, base, peers: new Map(), score: new Map(), t: 0, seq: 0, lastAttacker: null, protectT: PROTECT, respawnT: -1, brokerI: 0, client: null, ui: null };
  S.score.set(id, { name, k: 0, d: 0 });
  connect();
  // online = free-for-all: no AI waves, and every spawn point on the map is fair game
  if (qs.get('ai') !== '1') { try { ctx.ai?.qaSetEnabled?.(false); ctx.ai?.qaKillAll?.(); } catch {} }
  const W = ctx.world; if (W?.enemySpawns?.length) W.playerSpawns = [...(W.playerSpawns || []), ...W.enemySpawns];
  ctx.bus.on('shot', (e) => { if (!e || e.who !== 'player' || !S.client?.connected) return; const o = e.muzzle || e.origin; send({ t: 'shot', o: v3(o), d: v3(e.dir), w: e.id || '' }); });
  ctx.bus.on('playerDied', () => { const a = S.lastAttacker && performance.now() - S.lastAttacker.at < 8000 ? S.lastAttacker : null; send({ t: 'kill', k: a?.id || null, v: id, hs: !!a?.hs }); onKill(a?.id || null, id, !!a?.hs); S.respawnT = RESPAWN; });
  ctx.bus.on('explosion', (e) => { if (e && !e.remote && e.position) send({ t: 'boom', p: v3(e.position), r: e.radius || 6 }); });
  ctx.bus.on('playerRespawn', () => { S.protectT = PROTECT; S.lastAttacker = null; });
  buildUI();
  addEventListener('beforeunload', () => { try { send({ t: 'bye' }); S.client?.end(true); } catch {} });
  return {
    get peers() { return S.peers.size; }, get connected() { return !!S.client?.connected; }, room, name, id,
    hit: (peer, dmg, hs, point) => { const p = S.peers.get(peer); if (!p || p.dead) return; send({ t: 'hit', to: peer, dmg: Math.min(250, dmg | 0), hs: !!hs }); },
    scores: () => [...S.score.entries()].map(([k, v]) => ({ id: k, ...v })),
  };
}

function connect() {
  const url = BROKERS[S.brokerI % BROKERS.length];
  const c = S.mqtt.connect(url, { clientId: 'zv_' + S.id + '_' + S.brokerI, clean: true, connectTimeout: 6000, reconnectPeriod: 0, keepalive: 20,
    will: { topic: S.base + 'ev', payload: JSON.stringify({ f: S.id, t: 'bye' }), qos: 0, retain: false } });
  S.client = c;
  c.on('connect', () => { c.subscribe([S.base + 's/+', S.base + 'ev']); send({ t: 'hello', n: S.name }); status(`ONLINE · ${S.room}`); console.log('[net] connected', url, S.room, S.name); });
  const fail = () => { if (S.client !== c) return; try { c.end(true); } catch {} S.brokerI++; status('RECONNECTING…'); setTimeout(connect, 1500); };
  c.on('error', fail); c.on('close', fail);
  c.on('message', (topic, buf) => { let m; try { m = JSON.parse(buf.toString()); } catch { return; } if (topic.startsWith(S.base + 's/')) onState(topic.slice(S.base.length + 2), m); else onEvent(m); });
}
const send = (m) => { if (!S?.client?.connected) return; m.f = S.id; try { S.client.publish(S.base + 'ev', JSON.stringify(m)); } catch {} };
const v3 = (v) => v ? [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)] : [0, 0, 0];

// ---------- remote players ----------
function peerFor(pid, name) {
  let p = S.peers.get(pid); if (p) { if (name && name !== p.name) p.name = name; return p; }
  const ctx = S.ctx; const asset = ctx.ai?.asset; if (!asset) return null;
  const inst = createInstance(asset, [...pid].reduce((a, c) => a + c.charCodeAt(0), 0) % 3);
  ctx.scene.add(inst.group);
  for (const h of inst.hitboxes) { h.userData.remote = pid; delete h.userData.soldier; ctx.raycastTargets.push(h); }
  const tag = nameTag(name || '?'); tag.position.y = 2.25; inst.group.add(tag);
  p = { id: pid, name: name || '?', inst, tag, snaps: [], dead: false, seen: performance.now(), fall: 0 };
  S.peers.set(pid, p); if (!S.score.has(pid)) S.score.set(pid, { name: p.name, k: 0, d: 0 });
  ctx.hud?.toast?.(`${p.name} joined`, 1800); return p;
}
function dropPeer(pid) {
  const p = S.peers.get(pid); if (!p) return; const ctx = S.ctx;
  ctx.scene.remove(p.inst.group); for (const h of p.inst.hitboxes) { const i = ctx.raycastTargets.indexOf(h); if (i > -1) ctx.raycastTargets.splice(i, 1); }
  S.peers.delete(pid); S.score.delete(pid); ctx.hud?.toast?.(`${p.name} left`, 1500);
}
function nameTag(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.font = '600 30px Barlow, Arial, sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(8, 12, 240, 40); g.fillStyle = '#ff7a5c'; g.fillText(text, 128, 43);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: true, transparent: true })); s.scale.set(1.3, 0.33, 1); return s;
}
function onState(pid, m) {
  if (pid === S.id || !Array.isArray(m.p)) return;
  const p = peerFor(pid, m.n); if (!p) return;
  p.seen = performance.now();
  p.snaps.push({ t: p.seen / 1000, x: m.p[0], y: m.p[1], z: m.p[2], yaw: m.p[3] || 0, sp: m.p[4] || 0, f: m.p[5] | 0 });
  if (p.snaps.length > 20) p.snaps.shift();
}
function onEvent(m) {
  if (!m || m.f === S.id) return; const ctx = S.ctx;
  if (m.t === 'bye') return dropPeer(m.f);
  if (m.t === 'hello') { peerFor(m.f, String(m.n || '').slice(0, 16)); return; }
  if (m.t === 'shot') {
    const p = S.peers.get(m.f); const o = new THREE.Vector3(...m.o), d = new THREE.Vector3(...m.d).normalize();
    if (p?.inst.muzzle) p.inst.muzzle.getWorldPosition(o);
    try { ctx.weapons?.fx?.enemyShot?.(o, d); } catch {}
    try { ctx.audio?.play?.('enemy_rifle', { position: { x: o.x, y: o.y, z: o.z } }); } catch {}
    return;
  }
  if (m.t === 'hit' && m.to === S.id) {
    const me = ctx.player; if (!me || me.dead || S.protectT > 0) return;
    const p = S.peers.get(m.f); S.lastAttacker = { id: m.f, hs: !!m.hs, at: performance.now() };
    me.damage(Math.max(0, Math.min(250, +m.dmg || 0)), p ? p.inst.group.position.clone() : null);
    return;
  }
  if (m.t === 'boom' && Array.isArray(m.p)) {   // someone's frag: replay the blast, and hurt ourselves if we are in range
    const pos = new THREE.Vector3(...m.p), R = Math.min(12, +m.r || 6);
    try { ctx.weapons?.fx?.explosion?.(pos); } catch {} try { ctx.audio?.play?.('explosion', { position: { x: pos.x, y: pos.y, z: pos.z } }); } catch {}
    const me = ctx.player; if (me && !me.dead && S.protectT <= 0) { const d = Math.hypot(me.position.x - pos.x, me.position.y + 0.9 - pos.y, me.position.z - pos.z); if (d < R) { const dmg = Math.round(100 * (1 - d / R) ** 1.3); if (dmg > 0) { S.lastAttacker = { id: m.f, hs: false, at: performance.now() }; me.damage(dmg, pos); } } }
    return;
  }
  if (m.t === 'kill') return onKill(m.k, m.v, !!m.hs);
}
function onKill(killer, victim, hs) {
  const ctx = S.ctx; const nm = (id) => id === S.id ? S.name : (S.peers.get(id)?.name || S.score.get(id)?.name || '?');
  const kv = S.score.get(victim) || { name: nm(victim), k: 0, d: 0 }; kv.d++; S.score.set(victim, kv);
  if (killer && killer !== victim) { const kk = S.score.get(killer) || { name: nm(killer), k: 0, d: 0 }; kk.k++; S.score.set(killer, kk); }
  const vp = S.peers.get(victim); if (vp) { vp.dead = true; vp.fall = 0; }
  ctx.hud?.killfeed?.(`${killer ? nm(killer) : 'WORLD'}  ${hs ? '⊕ ' : ''}▸  ${nm(victim)}`);
  if (killer === S.id && victim !== S.id) { ctx.hud?.hitmarker?.(hs, true); ctx.hud?.scorePopup?.(hs ? 'HEADSHOT KILL' : 'KILL', hs); }
  renderBoard();
}

// ---------- per frame ----------
export function update(dt, ctx) {
  if (!S) return;
  const me = ctx.player; S.t += dt; if (S.protectT > 0) S.protectT -= dt;
  if (S.respawnT > 0) status(`RESPAWN IN ${Math.ceil(S.respawnT)}`);
  if (S.respawnT > 0 && (S.respawnT -= dt) <= 0) { S.respawnT = -1; try { me.respawn(); } catch (e) { console.warn('[net] respawn', e); } }
  if (me?.position && S.t >= RATE && S.client?.connected) {
    S.t = 0; const p = me.position; const flags = (me.dead ? 1 : 0) | (me.crouching ? 2 : 0) | (me.ads ? 4 : 0);
    try { S.client.publish(S.base + 's/' + S.id, JSON.stringify({ n: S.name, p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +(me.yaw || 0).toFixed(3), +(me.speed || 0).toFixed(1), flags] })); } catch {}
  }
  const now = performance.now(), rt = now / 1000 - INTERP;
  for (const [pid, p] of S.peers) {
    if (now - p.seen > TIMEOUT) { dropPeer(pid); continue; }
    const sn = p.snaps; if (!sn.length) continue;
    let a = sn[0], b = sn[sn.length - 1];
    for (let i = 0; i + 1 < sn.length; i++) if (sn[i].t <= rt && sn[i + 1].t >= rt) { a = sn[i]; b = sn[i + 1]; break; }
    const k = b.t > a.t ? Math.min(1, Math.max(0, (rt - a.t) / (b.t - a.t))) : 1;
    const g = p.inst.group; g.position.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
    let dy = b.yaw - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); g.rotation.y = a.yaw + dy * k + Math.PI;
    const dead = !!(b.f & 1); if (!dead && p.dead) { p.dead = false; p.fall = 0; }
    p.dead = p.dead || dead;
    p.fall = p.dead ? Math.min(1, p.fall + dt * 2.5) : 0; g.rotation.x = -p.fall * Math.PI / 2; g.position.y += p.fall * 0.25;
    p.tag.visible = !p.dead;
    const crouch = !!(b.f & 2); p.inst.inner && (p.inst.inner.scale.y = crouch ? 0.72 : 1);
    const sp = b.sp; const A = p.inst.actions;
    if (A) { const w = sp > 4.5 ? [0, 0, 1] : sp > 0.4 ? [0, 1, 0] : [1, 0, 0]; ['Idle', 'Walk', 'Run'].forEach((n, i) => { const act = A[n]; if (act) act.setEffectiveWeight(THREE.MathUtils.lerp(act.getEffectiveWeight(), p.dead ? (n === 'Idle' ? 1 : 0) : w[i], Math.min(1, dt * 8))); }); }
    p.inst.mixer?.update(dt);
  }
  if (S.ui) S.ui.board.style.display = (ctx.input?.keys?.has?.('Tab') || S.tab) ? 'block' : 'none';
}

// ---------- HUD bits: status badge + scoreboard (hold Tab) ----------
function buildUI() {
  const css = document.createElement('style'); css.textContent = `
  .zvnet{position:fixed;top:12px;right:14px;z-index:40;font:600 12px Barlow,Arial,sans-serif;letter-spacing:.12em;color:#cfe3ff;background:rgba(10,14,20,.55);padding:5px 10px;border-left:2px solid #4aa3ff;pointer-events:none}
  .zvboard{display:none;position:fixed;left:50%;top:18%;transform:translateX(-50%);min-width:420px;z-index:41;background:rgba(8,10,14,.82);border:1px solid rgba(255,255,255,.12);font:500 15px Barlow,Arial,sans-serif;color:#e8edf2;pointer-events:none}
  .zvboard h3{margin:0;padding:10px 16px;font:700 13px 'Barlow Condensed',Arial;letter-spacing:.2em;background:rgba(74,163,255,.18)}
  .zvboard table{width:100%;border-collapse:collapse}.zvboard td{padding:6px 16px}.zvboard tr.me td{color:#ffd27a}.zvboard td.n{text-align:right;width:60px}`;
  document.head.appendChild(css);
  const badge = document.createElement('div'); badge.className = 'zvnet'; badge.textContent = 'CONNECTING…'; document.body.appendChild(badge);
  const board = document.createElement('div'); board.className = 'zvboard'; document.body.appendChild(board);
  S.ui = { badge, board };
  addEventListener('keydown', (e) => { if (e.code === 'Tab') { e.preventDefault(); S.tab = true; renderBoard(); } });
  addEventListener('keyup', (e) => { if (e.code === 'Tab') S.tab = false; });
  setInterval(() => { if (S.client?.connected) status(`ONLINE · ${S.room} · ${S.peers.size + 1} PLAYER${S.peers.size ? 'S' : ''}`); }, 1000);
  renderBoard();
}
function status(t) { if (S?.ui) S.ui.badge.textContent = t; }
function renderBoard() {
  if (!S?.ui) return;
  const rows = [...S.score.entries()].sort((a, b) => b[1].k - a[1].k || a[1].d - b[1].d)
    .map(([pid, v]) => `<tr class="${pid === S.id ? 'me' : ''}"><td>${esc(v.name)}</td><td class="n">${v.k}</td><td class="n">${v.d}</td></tr>`).join('');
  S.ui.board.innerHTML = `<h3>FREE FOR ALL · ${esc(S.room.toUpperCase())}</h3><table><tr><td style="opacity:.5">PLAYER</td><td class="n" style="opacity:.5">K</td><td class="n" style="opacity:.5">D</td></tr>${rows}</table>`;
}
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
