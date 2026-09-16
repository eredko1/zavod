// Enemy soldiers: models, animation, navigation, cover, combat, waves & score. Owned by: AI agent.
// Helpers live in src/ai/: model.js (asset + gear), nav.js (grid/A*), soldier.js (runtime + procedural anim), ragdoll.js.
import * as THREE from 'three';
import { NavGrid, generateCover } from './ai/nav.js';
import { loadSoldierAsset, createInstance, makeBloodTexture } from './ai/model.js';
import { Soldier, SPEED } from './ai/soldier.js';
import { Ragdoll } from './ai/ragdoll.js';

const WAVES = [4, 6, 8, 10, 12, 14];
const TOTAL_WAVES = WAVES.length;
const VIEW_RANGE = 45, VIEW_RANGE_ALERT = 60, HEAR_RANGE = 40;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _ray = new THREE.Raycaster();
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrapAngle = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };

let S = null; // module state

class Squad {
  constructor(id) { this.id = id; this.members = []; this.alerted = false; this.alertT = -100; this.lastKnown = new THREE.Vector3(); this.engagedT = 0; this.flankT = 0; this.flanker = null; }
  alert(t, pos) { if (!this.alerted) { this.alerted = true; this.engagedT = t; } this.alertT = t; this.lastKnown.copy(pos); for (const m of this.members) { if (!m.dead && t - m.lastSeen > 3) { m.lastKnown.copy(pos); m.lastSeen = Math.max(m.lastSeen, t - 2.5); } } }
  alive() { return this.members.filter(m => !m.dead); }
}

// ---------- geometry helpers ----------
function segBlocked3D(a, b, boxes) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  for (const box of boxes) {
    let tmin = 0, tmax = 1, ok = true;
    for (let ax = 0; ax < 3 && ok; ax++) {
      const o = ax === 0 ? a.x : ax === 1 ? a.y : a.z, d = ax === 0 ? dx : ax === 1 ? dy : dz, lo = ax === 0 ? box.min.x : ax === 1 ? box.min.y : box.min.z, hi = ax === 0 ? box.max.x : ax === 1 ? box.max.y : box.max.z;
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) ok = false; continue; }
      let t1 = (lo - o) / d, t2 = (hi - o) / d; if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) ok = false;
    }
    if (ok) return true;
  }
  return false;
}

// ray vs vertical capsule (player). returns t along dir (unit) or -1
function rayCapsule(o, d, base, height, r) {
  const ay = base.y + r, by = base.y + height - r;
  // closest approach between ray (o + t d) and segment (base.x, y in [ay,by], base.z)
  // treat as infinite cylinder first
  const ox = o.x - base.x, oz = o.z - base.z;
  const A = d.x * d.x + d.z * d.z, B = 2 * (ox * d.x + oz * d.z), C = ox * ox + oz * oz - r * r;
  let t = -1;
  if (A > 1e-8) {
    const disc = B * B - 4 * A * C; if (disc < 0) return -1;
    const s = Math.sqrt(disc); const t0 = (-B - s) / (2 * A); if (t0 < 0) return -1;
    const y = o.y + d.y * t0; if (y >= ay && y <= by) t = t0; else if (y < ay) t = raySphere(o, d, base.x, ay, base.z, r); else t = raySphere(o, d, base.x, by, base.z, r);
  } else { if (C > 0) return -1; t = raySphere(o, d, base.x, d.y > 0 ? ay : by, base.z, r); if (t < 0) t = 0; }
  return t;
}
function raySphere(o, d, cx, cy, cz, r) {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz; const B = 2 * (ox * d.x + oy * d.y + oz * d.z), C = ox * ox + oy * oy + oz * oz - r * r;
  const disc = B * B - 4 * C; if (disc < 0) return -1; const t = (-B - Math.sqrt(disc)) / 2; return t < 0 ? -1 : t;
}

// ---------- LOS with adaptive mesh raycast ----------
const losStats = { n: 0, ms: 0, meshOk: true };
function rayClear(ctx, a, b) {
  if (segBlocked3D(a, b, S.nav.solids)) return false;
  if (!losStats.meshOk || S.raysThisFrame >= S.rayBudget) return true;
  const targets = ctx.raycastTargets; if (!targets || !targets.length) return true;
  const t0 = performance.now();
  _v.subVectors(b, a); const dist = _v.length(); _ray.set(a, _v.multiplyScalar(1 / dist)); _ray.near = 0.05; _ray.far = dist - 0.05;
  let clear = true;
  try {
    const hits = _ray.intersectObjects(targets, false);
    for (let i = 0; i < hits.length; i++) { const o = hits[i].object; if (o.userData.soldier || o.userData.noLOS) continue; clear = false; break; }
  } catch (e) { clear = true; }
  S.raysThisFrame++;
  const ms = performance.now() - t0; losStats.n++; losStats.ms += ms;
  if (losStats.n >= 40) { const avg = losStats.ms / losStats.n; if (avg > 1.2) { losStats.meshOk = false; console.warn('[ai] mesh raycasts too slow (' + avg.toFixed(2) + ' ms), using collider LOS only'); } losStats.n = 0; losStats.ms = 0; }
  return clear;
}

// ---------- spawning ----------
function acquireInstance(ctx) {
  let inst = S.pool.pop();
  if (!inst) { inst = createInstance(S.asset, S.variantN++ % 3); inst.rifleLocal = { p: inst.rifle.position.clone(), q: inst.rifle.quaternion.clone(), s: inst.rifle.scale.clone() }; }
  else { // restore rifle to chest
    const r = inst.rifle; if (r.parent !== inst.bones.Spine2) { r.parent?.remove(r); inst.bones.Spine2.add(r); r.position.copy(inst.rifleLocal.p); r.quaternion.copy(inst.rifleLocal.q); r.scale.copy(inst.rifleLocal.s); }
    r.visible = true; inst.group.visible = true;
  }
  ctx.scene.add(inst.group);
  return inst;
}
function releaseInstance(ctx, inst) { ctx.scene.remove(inst.group); S.pool.push(inst); }

function spawnSoldier(ctx, pos, yaw, opts = {}) {
  const inst = acquireInstance(ctx);
  const s = new Soldier(ctx, S.asset, inst, opts);
  s.placeAt(pos, yaw); s.spawnT = ctx.time.elapsed; s.nextThink = ctx.time.elapsed + ctx.rng() * 0.25;
  for (const h of inst.hitboxes) { h.userData.soldier = s; if (!ctx.raycastTargets.includes(h)) ctx.raycastTargets.push(h); }
  S.soldiers.push(s);
  return s;
}

function playerVisibleFrom(ctx, p) {
  const pl = ctx.player; if (!pl) return false;
  const eye = pl.eye ? pl.eye() : _v3.set(pl.position.x, pl.position.y + 1.6, pl.position.z);
  const d = _v.set(p.x - eye.x, 0, p.z - eye.z); const dist = d.length(); if (dist > 90) return false;
  const f = _v2.set(-Math.sin(pl.yaw || 0), 0, -Math.cos(pl.yaw || 0));
  if (d.multiplyScalar(1 / dist).dot(f) < 0.25) return false; // outside ~150° cone
  return rayClear(ctx, eye, _v3.set(p.x, p.y + 1.2, p.z));
}

function pickSpawns(ctx, count) {
  let spawns = (ctx.world?.enemySpawns || []).filter(v => v && isFinite(v.x) && (v.y || 0) < 0.15); // TODO multi-level nav: elevated spawns skipped until nav knows floors
  if (spawns.length < count) { for (let i = 0; i < count * 3 && spawns.length < count + 4; i++) { const p = S.nav.randomFreeNear(0, 0, 55, ctx.rng); if (p && p.distanceTo(ctx.player.position) > 25) spawns.push(p); } }
  const pp = ctx.player?.position || new THREE.Vector3();
  // prefer spawns hidden from the player at 35–65 m; fall back to the farthest ones
  const scored = spawns.map(p => { const d = p.distanceTo(pp); const vis = d < 90 && playerVisibleFrom(ctx, p); return { p, d, vis, score: (vis ? 100 : 0) + Math.max(0, 35 - d) * 3 + Math.max(0, d - 65) }; });
  scored.sort((a, b) => a.score - b.score || b.d - a.d);
  const out = []; for (const s of scored) { if (s.d < 18) continue; out.push(s.p); if (out.length >= count) break; }
  while (out.length < count && scored.length) out.push(scored[out.length % scored.length].p);
  return out;
}

function splitSquads(n) { const out = []; while (n > 0) { if (n === 5 || n === 6) { out.push(3); n -= 3; } else if (n === 7) { out.push(4); n -= 4; } else { const k = Math.min(4, n); out.push(k); n -= k; } } return out; }

function spawnSquad(ctx, size, spawnPos, waveN) {
  const sq = new Squad(S.squadN++);
  const yaw = Math.atan2(ctx.player.position.x - spawnPos.x, ctx.player.position.z - spawnPos.z);
  for (let i = 0; i < size; i++) {
    const a = (i / size) * Math.PI * 2 + ctx.rng(); const r = i === 0 ? 0 : 1.4 + ctx.rng();
    const p = S.nav.randomFreeNear(spawnPos.x + Math.cos(a) * r, spawnPos.z + Math.sin(a) * r, 1.5, ctx.rng) || spawnPos.clone();
    const rusher = waveN >= 2 && i === size - 1 && size >= 3;
    const s = spawnSoldier(ctx, p, yaw + (ctx.rng() - 0.5) * 0.4, { archetype: rusher ? 'rusher' : 'rifleman', health: rusher ? 80 : 100 });
    s.squad = sq; sq.members.push(s); s.state = 'advance'; s.peeks = 0;
  }
  S.squads.push(sq);
  return sq;
}

function startWave(ctx, n) {
  S.wave = n; S.phase = 'active'; S.phaseT = 0;
  const count = WAVES[n - 1]; const groups = splitSquads(count);
  const spawns = pickSpawns(ctx, groups.length);
  S.pending = groups.map((size, i) => ({ size, at: i === 0 ? 0 : i * 3.5, spawn: spawns[i] || spawns[0] }));
  S.waveClock = 0;
  ctx.bus.emit('wave', { n, total: TOTAL_WAVES, enemies: count });
}

// ---------- cover ----------
function coverPoints(ctx) {
  const w = ctx.world?.coverPoints;
  if (w && w.length >= 8) { if (S.coverSrc !== w) { S.coverSrc = w; S.cover = w.filter(c => (c.position?.y || 0) < 0.15).map(c => ({ position: c.position, normal: c.normal || new THREE.Vector3(0, 0, 1), height: c.height ?? 1.3, claimedBy: null })); } }
  else if (!S.cover || S.coverSrc !== 'gen' || S.coverN !== ctx.colliders.length) { S.coverSrc = 'gen'; S.coverN = ctx.colliders.length; S.cover = generateCover(ctx, S.nav).map(c => ({ ...c, claimedBy: null })); }
  return S.cover;
}

function pickCover(ctx, s, opt) {
  const pts = coverPoints(ctx); const pp = ctx.player.position; const eye = ctx.player.eye ? ctx.player.eye() : _v3.set(pp.x, pp.y + 1.6, pp.z);
  const pf = _v2.set(-Math.sin(ctx.player.yaw || 0), 0, -Math.cos(ctx.player.yaw || 0));
  let best = null, bestScore = 1e9; const cands = [];
  for (const c of pts) {
    if (c.claimedBy && c.claimedBy !== s && !c.claimedBy.dead) continue;
    const dp = c.position.distanceTo(pp), ds = c.position.distanceTo(s.position);
    if (ds < 1.0 && !opt.allowCurrent) continue;
    if (opt.maxTravel && ds > opt.maxTravel) continue;
    if (opt.closerThan !== undefined && dp > opt.closerThan) continue;
    if (opt.fartherThan !== undefined && dp < opt.fartherThan) continue;
    if (dp < (opt.minDist ?? 5)) continue;
    const toP = _v.subVectors(pp, c.position); toP.y = 0; toP.normalize();
    if (c.normal.dot(toP) > -0.2) continue; // solid must be between the point and the player
    let score = Math.abs(dp - (opt.preferDist ?? 16)) * 1.0 + ds * 0.45;
    if (opt.flank) { const ang = Math.acos(clamp(_v.negate().dot(pf), -1, 1)); score += Math.abs(ang - Math.PI / 2) * 10; }
    for (const o of S.soldiers) if (o !== s && !o.dead && o.position.distanceToSquared(c.position) < 4) score += 6;
    cands.push([score, c]);
  }
  cands.sort((a, b) => a[0] - b[0]);
  // confirm the best few block LOS from the player at crouch height (raycast, ≤ 2)
  let checked = 0;
  for (const [sc, c] of cands) {
    if (checked >= 2) { best = best || c; break; }
    checked++;
    const cp = _v.set(c.position.x, c.position.y + 1.0, c.position.z);
    if (!rayClear(ctx, cp, eye)) { best = c; break; }
    if (!best) best = c; // fallback to the top candidate even if unconfirmed
  }
  return best;
}
function claim(s, c) { if (s.cover && s.cover !== c && s.cover.claimedBy === s) s.cover.claimedBy = null; s.cover = c; if (c) c.claimedBy = s; }

// peek side: tangent direction giving LOS to the player from standing eye height
function choosePeek(ctx, s, c) {
  const eye = ctx.player.eye ? ctx.player.eye() : _v3.set(ctx.player.position.x, ctx.player.position.y + 1.6, ctx.player.position.z);
  const t = new THREE.Vector3().crossVectors(c.normal, new THREE.Vector3(0, 1, 0)).normalize();
  const toP = _v.subVectors(ctx.player.position, c.position); const side = Math.sign(toP.dot(t)) || 1;
  for (const k of [side, -side]) {
    const p = c.position.clone().addScaledVector(t, 0.75 * k);
    if (!S.nav.isFree(p.x, p.z)) continue;
    if (rayClear(ctx, _v2.set(p.x, p.y + 1.55, p.z), eye)) return { pos: p, lean: k };
  }
  return { pos: c.position.clone(), lean: 0 };
}

// ---------- perception ----------
function perceive(ctx, s, t) {
  const pl = ctx.player; const eye = pl.eye ? pl.eye() : _v3.set(pl.position.x, pl.position.y + 1.6, pl.position.z);
  const se = s.eye(new THREE.Vector3());
  const d = _v.subVectors(eye, se); const dist = d.length(); d.multiplyScalar(1 / dist);
  const alerted = s.squad?.alerted || t - s.lastSeen < 6;
  let vis = false;
  if (dist < (alerted ? VIEW_RANGE_ALERT : VIEW_RANGE)) {
    const f = _v2.set(Math.sin(s.yaw), 0, Math.cos(s.yaw));
    const cosA = (d.x * f.x + d.z * f.z) / Math.max(1e-6, Math.hypot(d.x, d.z));
    if (cosA > (alerted ? -0.1 : 0.5) || dist < 4) vis = rayClear(ctx, se, eye);
  }
  s.seesPlayer = vis; s.playerDist = dist;
  if (vis) { if (t - s.lastSeen > 2.5) s.reactUntil = t + 0.5 + ctx.rng() * 0.7; s.lastSeen = t; s.lastKnown.copy(pl.position); if (s.squad) s.squad.alert(t, pl.position); s.engageTime += 0.2; }
  else s.engageTime = Math.max(0, s.engageTime - 0.05);
  const knows = t - s.lastSeen < 4;
  if (knows) { const lk = vis ? pl.position : s.lastKnown; s.setAim(_v.set(lk.x, lk.y + (pl.crouching ? 0.9 : 1.25), lk.z)); }
  else s.clearAim();
  return vis;
}

// ---------- behaviour ----------
function think(ctx, s, t) {
  const pl = ctx.player; const vis = perceive(ctx, s, t); const dist = s.playerDist; const sq = s.squad;
  const known = t - s.lastSeen < 4 || sq?.alerted;
  s.stateT += t - (s.thinkT || t); s.thinkT = t;
  s.wantFire = false;
  if (s.qaLock) return qaThink(ctx, s, t, vis);

  // hurt: fall back once
  if (s.health < s.maxHealth * 0.35 && !s.fellBack && s.archetype !== 'rusher' && s.state !== 'hurt') {
    const c = pickCover(ctx, s, { fartherThan: dist + 3, maxTravel: 22, preferDist: dist + 8 });
    if (c) { s.fellBack = true; s.state = 'hurt'; s.stateT = 0; claim(s, c); s.setGoal(c.position, 'run'); s.crouchTarget = 0; s.leanTarget = 0; }
  }

  if (s.archetype === 'rusher') {
    if (s.state !== 'advance') { s.state = 'advance'; s.stateT = 0; }
    if (dist > 4.5) { s.setGoal(pl.position, 'run'); s.crouchTarget = 0; } else s.setGoal(null);
    if (vis && dist < 28) s.wantFire = true;
    return;
  }

  switch (s.state) {
    case 'advance': case 'flank': {
      s.crouchTarget = 0; s.leanTarget = 0;
      if (!s.cover || s.arrived || (s.cover && s.cover.claimedBy !== s)) {
        if (s.arrived && s.cover && s.position.distanceTo(s.cover.position) < 1.2) { s.state = 'cover'; s.stateT = 0; s.peeks = 0; s.setGoal(null); s.crouchTarget = s.cover.height > 0.9 ? 1 : 0.4; break; }
        const c = pickCover(ctx, s, s.state === 'flank' ? { flank: true, preferDist: 12, minDist: 6, maxTravel: 45 } : { closerThan: Math.max(8, dist - 2), preferDist: known ? 13 : 9, minDist: 5, maxTravel: 40 });
        if (c) { claim(s, c); s.setGoal(c.position, 'run'); }
        else { // no cover: approach the player directly, stop at 8 m
          if (dist > 8) s.setGoal(pl.position, 'run'); else { s.setGoal(null); s.state = 'cover'; s.stateT = 0; s.peeks = 0; }
        }
      }
      if (vis && dist < 20 && s.stateT > 0.5) s.wantFire = true; // fire on the move when close
      if (s.state === 'flank' && s.stateT > 14) { s.state = 'advance'; s.stateT = 0; }
      break;
    }
    case 'cover': {
      s.setGoal(null); s.leanTarget = 0;
      const tall = (s.cover?.height ?? 1.3) > 0.9; s.crouchTarget = tall ? 1 : 0.35;
      // fully suppressed? if the player is right on top of us, stand and fight
      if (dist < 5 && vis) { s.state = 'shoot'; s.stateT = 0; s.peek = { pos: s.position.clone(), lean: 0 }; s.crouchTarget = 0; break; }
      const wait = s.peeks === 0 ? 0.5 + ctx.rng() * 0.8 : 0.9 + ctx.rng() * 1.3;
      if (s.stateT > wait) {
        if (known && s.cover) { s.peek = choosePeek(ctx, s, s.cover); s.state = 'shoot'; s.stateT = 0; s.setGoal(s.peek.pos, 'walk'); s.leanTarget = s.peek.lean; s.crouchTarget = tall ? 0 : 0.35; s.peeks++; }
        else if (known && !s.cover) { s.peek = { pos: s.position.clone(), lean: 0 }; s.state = 'shoot'; s.stateT = 0; s.crouchTarget = 0.35; s.peeks++; } // in the open: fight from here
        else if (s.stateT > wait + 2.5) { s.state = 'advance'; s.stateT = 0; claim(s, null); }
      }
      break;
    }
    case 'shoot': {
      if (vis || t - s.lastSeen < 1.5) s.wantFire = true;
      const dur = 1.6 + ctx.rng() * 1.4;
      if (s.stateT > dur || (!vis && t - s.lastSeen > 2.2)) {
        s.leanTarget = 0;
        if (!s.cover) { s.state = 'advance'; s.stateT = 0; break; }
        if (s.peeks >= 2 + (ctx.rng() < 0.5 ? 1 : 0) || dist > 30) {
          // reposition: flank or push
          const wantFlank = sq && sq.alive().length >= 2 && (t - sq.flankT > 9) && ctx.rng() < 0.5;
          if (wantFlank) { sq.flankT = t; s.state = 'flank'; } else s.state = 'advance';
          s.stateT = 0; claim(s, null); s.crouchTarget = 0;
        } else { s.state = 'cover'; s.stateT = 0; s.setGoal(s.cover.position, 'walk'); }
      }
      break;
    }
    case 'hurt': {
      s.crouchTarget = s.arrived ? 1 : 0;
      if (s.arrived && s.stateT > 3.5) { s.state = 'cover'; s.stateT = 0; s.peeks = 0; }
      if (s.stateT > 12) { s.state = 'advance'; s.stateT = 0; }
      if (vis && dist < 6) s.wantFire = true;
      break;
    }
    default: s.state = 'advance'; s.stateT = 0;
  }
}

function qaThink(ctx, s, t, vis) {
  const pl = ctx.player; const lock = s.qaLock;
  if (s.qaTarget) s.setAim(s.qaTarget); else s.setAim(_v.set(pl.position.x, pl.position.y + 1.25, pl.position.z));
  s.lastSeen = t;
  switch (lock) {
    case 'shoot': s.state = 'shoot'; s.crouchTarget = 0; s.wantFire = true; s.setGoal(null); break;
    case 'cover': s.state = 'cover'; s.crouchTarget = 1; s.setGoal(null); break;
    case 'lean': s.state = 'shoot'; s.crouchTarget = 0; s.leanTarget = 1; s.wantFire = true; s.setGoal(null); break;
    case 'advance': case 'run': s.state = 'advance'; s.crouchTarget = 0; if (s.playerDist > 3) s.setGoal(pl.position, 'run'); else s.setGoal(null); if (lock === 'advance' && vis) s.wantFire = true; break;
    case 'walk': s.state = 'advance'; s.crouchTarget = 0; if (s.playerDist > 3) s.setGoal(pl.position, 'walk'); else s.setGoal(null); break;
    case 'idle': s.state = 'patrol'; s.clearAim(); s.crouchTarget = 0; s.setGoal(null); break;
    case 'aim': s.state = 'shoot'; s.crouchTarget = 0; s.setGoal(null); break;
    default: break;
  }
}

// ---------- firing ----------
function fireRound(ctx, s, t) {
  const pl = ctx.player; const origin = s.muzzleWorld(new THREE.Vector3());
  const targetY = pl.position.y + (pl.crouching ? 0.8 : 1.2);
  const target = s.seesPlayer ? _v.set(pl.position.x, targetY, pl.position.z) : _v.set(s.lastKnown.x, s.lastKnown.y + 1.2, s.lastKnown.z);
  const dir = target.sub(origin).normalize();
  // inaccuracy cone: 8° → 2.5° over ~8 s of engagement; worse when the player sprints, is far, or we're moving
  const dist = s.playerDist || 20;
  let cone = THREE.MathUtils.lerp(9, 2.8, clamp(s.engageTime / 10, 0, 1));
  if (pl.sprinting || pl.moveState === 'sprint') cone *= 1.6; else if ((pl.speed || 0) > 3) cone *= 1.25;
  cone *= 1 + dist / 45; if (s.speed > 1.5) cone *= 1.7; if (s.crouch > 0.5) cone *= 0.85; if (s.archetype === 'rusher') cone *= 1.3;
  const rad = THREE.MathUtils.degToRad(cone) * Math.sqrt(ctx.rng()) * (0.5 + 0.5 * ctx.rng());
  const ang = ctx.rng() * Math.PI * 2;
  const u = _v2.set(0, 1, 0).cross(dir).normalize(), w = _v3.crossVectors(dir, u);
  dir.addScaledVector(u, Math.cos(ang) * Math.tan(rad)).addScaledVector(w, Math.sin(ang) * Math.tan(rad)).normalize();
  const shotDir = dir.clone();
  s.showFlash(); s.shotsFired++;
  // hit test vs player capsule then world
  const h = pl.height || 1.7; const tHit = rayCapsule(origin, shotDir, pl.position, h, 0.35);
  let hitPlayer = false;
  if (tHit > 0 && tHit < 120) {
    const end = origin.clone().addScaledVector(shotDir, tHit - 0.05);
    hitPlayer = !segBlocked3D(origin, end, S.nav.solids);
    if (hitPlayer && losStats.meshOk && S.raysThisFrame < S.rayBudget + 2) hitPlayer = rayClear(ctx, origin, end);
  }
  ctx.bus.emit('shot', { origin: origin.clone(), dir: shotDir, weapon: 'ak', who: 'enemy', soldier: s, hit: hitPlayer });
  if (hitPlayer && ctx.state === 'playing') {
    const dmg = 8 + Math.floor(ctx.rng() * 7);
    try { pl.damage?.(dmg, s.position.clone()); } catch (e) { console.error('[ai] player.damage', e); }
  }
}

function updateFire(ctx, s, dt, t) {
  if (s.fireCooldown > 0) s.fireCooldown -= dt;
  if (s.burst > 0) {
    s.nextShot -= dt;
    if (s.nextShot <= 0 && s.stagger <= 0) { fireRound(ctx, s, t); s.burst--; s.nextShot = 0.1; if (s.burst === 0) s.fireCooldown = 0.5 + ctx.rng() * (s.archetype === 'rusher' ? 0.5 : 1.0); }
  } else if (s.wantFire && s.fireCooldown <= 0 && s.hasTarget && t >= (s.reactUntil || 0)) { s.burst = 3 + Math.floor(ctx.rng() * 4); s.nextShot = 0.05; }
  if (!s.wantFire && s.burst > 0 && !s.seesPlayer && t - s.lastSeen > 1.5) s.burst = 0;
}

// ---------- death ----------
function killSoldier(ctx, s, hit) {
  if (s.dead) return;
  s.dead = true; s.alive = false; s.state = 'dead'; s.deadT = 0; s.burst = 0; s.wantFire = false; s.hasTarget = false;
  s.inst.flash.visible = false; s.inst.flash2.visible = false;
  claim(s, null);
  for (const h of s.inst.hitboxes) { const i = ctx.raycastTargets.indexOf(h); if (i > -1) ctx.raycastTargets.splice(i, 1); }
  try { s.ragdoll = new Ragdoll(s, S.nav, hit); } catch (e) { console.error('[ai] ragdoll', e); s.ragdoll = null; }
  // drop the rifle
  const r = s.inst.rifle; const wp = r.getWorldPosition(new THREE.Vector3()), wq = r.getWorldQuaternion(new THREE.Quaternion());
  r.parent.remove(r); ctx.scene.add(r); r.position.copy(wp); r.quaternion.copy(wq); r.scale.set(1, 1, 1);
  const av = new THREE.Vector3(ctx.rng() - 0.5, ctx.rng() - 0.5, ctx.rng() - 0.5).multiplyScalar(9);
  const vel = new THREE.Vector3(s.vel.x * 0.5 + (ctx.rng() - 0.5) * 1.5, 1.2 + ctx.rng(), s.vel.z * 0.5 + (ctx.rng() - 0.5) * 1.5);
  if (hit?.dir) vel.addScaledVector(hit.dir, 1.5);
  S.dropped.push({ mesh: r, vel, av, t: 0, landed: false, soldier: s });
  s.inst.flash.visible = false;
  // blood
  placeBlood(ctx, s.position.x, s.position.z, 1 + ctx.rng() * 0.6);
  // score (QA-spawned dummies don't count)
  const t = ctx.time.elapsed; const headshot = !!hit?.headshot;
  if (s.qaLock) { ctx.bus.emit('enemyKilled', { soldier: s, headshot, position: s.position.clone(), streak: S.streak, score: S.score, qa: true }); if (s.squad) s.squad.alert(t, ctx.player.position); return; }
  if (t - S.streakT < 4) S.streak = Math.min(S.streak + 1, 5); else S.streak = 1; S.streakT = t;
  const mult = 1 + (S.streak - 1) * 0.5;
  S.score += Math.round((headshot ? 150 : 100) * mult); S.kills++;
  ctx.bus.emit('enemyKilled', { soldier: s, headshot, position: s.position.clone(), streak: S.streak, score: S.score });
  if (s.squad) { s.squad.alert(t, ctx.player.position); }
}

function placeBlood(ctx, x, z, scale) {
  const b = S.blood[S.bloodN++ % S.blood.length];
  b.position.set(x + (ctx.rng() - 0.5) * 0.3, S.nav.groundY(x, z) + 0.012, z + (ctx.rng() - 0.5) * 0.3);
  b.rotation.z = ctx.rng() * Math.PI * 2; b.scale.setScalar(scale); b.visible = true; b.userData.t = 0; b.material.opacity = 1;
}

// ---------- module ----------
export async function init(ctx) {
  const asset = await loadSoldierAsset(ctx);
  const nav = new NavGrid(ctx, 0.5);
  const bloodTex = makeBloodTexture(ctx.rng);
  const bloodGeo = new THREE.PlaneGeometry(1, 1); bloodGeo.rotateX(-Math.PI / 2);
  const blood = [];
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(bloodGeo, new THREE.MeshStandardMaterial({ map: bloodTex, transparent: true, roughness: 0.25, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    m.visible = false; m.renderOrder = 2; m.receiveShadow = true; m.name = 'blood'; ctx.scene.add(m); blood.push(m);
  }
  S = {
    asset, nav, soldiers: [], squads: [], pool: [], dropped: [], blood, bloodN: 0, variantN: 0, squadN: 0,
    wave: 0, score: 0, kills: 0, streak: 0, streakT: -100, phase: 'idle', phaseT: 0, pending: [], waveClock: 0,
    raysThisFrame: 0, rayBudget: 6, rebuildT: 0, enabled: ctx.qs?.get('ai') !== '0', startDelay: 2.5, cover: null, coverSrc: null,
  };
  // pre-warm a few instances
  for (let i = 0; i < 4; i++) { const inst = createInstance(asset, S.variantN++ % 3); inst.rifleLocal = { p: inst.rifle.position.clone(), q: inst.rifle.quaternion.clone(), s: inst.rifle.scale.clone() }; S.pool.push(inst); }

  ctx.bus.on('shot', (e) => {
    if (!e || e.who === 'enemy' || !S) return;
    const o = e.origin || ctx.player?.position; if (!o) return; const t = ctx.time.elapsed;
    for (const sq of S.squads) { for (const m of sq.members) { if (!m.dead && m.position.distanceTo(o) < HEAR_RANGE) { sq.alert(t, ctx.player.position); break; } } }
  });
  ctx.bus.on('state', ({ state }) => { if (state === 'playing' && S.phase === 'idle' && S.enabled) { S.phase = 'countdown'; S.phaseT = S.startDelay; } });

  const api = {
    get soldiers() { return S.soldiers; }, frozen: false,
    get wave() { return S.wave; }, get score() { return S.score; }, get kills() { return S.kills; }, get streak() { return S.streak; },
    get phase() { return S.phase; }, get totalWaves() { return TOTAL_WAVES; }, get waveEnemies() { return WAVES[Math.max(0, S.wave - 1)]; },
    get nextWaveIn() { return S.phase === 'between' || S.phase === 'countdown' ? S.phaseT : 0; },
    alive: () => S.soldiers.filter(s => !s.dead).length,
    remaining: () => S.soldiers.filter(s => !s.dead).length + S.pending.reduce((a, p) => a + p.size, 0),
    damage: (soldier, amount, point, headshot) => {
      if (!soldier || soldier.dead) return;
      amount = +amount || 0; if (headshot) amount = Math.max(amount, soldier.maxHealth);
      soldier.health -= amount;
      const pe = ctx.player.eye ? ctx.player.eye() : ctx.player.position;
      const dir = new THREE.Vector3().subVectors(soldier.chest(new THREE.Vector3()), pe).normalize();
      const t = ctx.time.elapsed; soldier.lastSeen = t; soldier.lastKnown.copy(ctx.player.position); if (soldier.squad) soldier.squad.alert(t, ctx.player.position);
      soldier.engageTime += 0.5;
      if (soldier.health <= 0) killSoldier(ctx, soldier, { point: point ? point.clone() : null, dir, headshot: !!headshot, strength: headshot ? 4 : 3.5 });
      else soldier.flinch(dir, headshot ? 1.5 : 0.8 + Math.min(0.6, amount / 60));
    },
    damageRadius: (pos, r, dmg) => {
      for (const s of S.soldiers.slice()) {
        if (s.dead) continue; const c = s.chest(new THREE.Vector3()); const d = c.distanceTo(pos); if (d > r) continue;
        if (segBlocked3D(pos, c, S.nav.solids) && d > 1.5) continue;
        const amount = dmg * Math.pow(1 - d / r, 0.7);
        const dir = new THREE.Vector3().subVectors(c, pos).normalize(); dir.y += 0.6; dir.normalize();
        soldierDamageDir(ctx, s, amount, c, dir, 6 + 4 * (1 - d / r));
      }
    },
    qaKillAll: () => { for (const s of S.soldiers.slice()) if (!s.dead) killSoldier(ctx, s, { dir: new THREE.Vector3(ctx.rng() - 0.5, 0.2, ctx.rng() - 0.5).normalize(), strength: 3 }); },
    qaSpawnAt: (x, z, opts = {}) => {
      const p = S.nav.nearestFree(x, z, 6) || new THREE.Vector3(x, 0, z);
      const yaw = opts.yaw ?? Math.atan2(ctx.player.position.x - p.x, ctx.player.position.z - p.z);
      const s = spawnSoldier(ctx, p, yaw, { archetype: opts.archetype || 'rifleman', health: opts.health });
      s.qaLock = opts.state || 'aim'; s.state = s.qaLock === 'cover' ? 'cover' : 'shoot';
      if (opts.target) s.qaTarget = new THREE.Vector3(opts.target[0], opts.target[1] ?? 1.25, opts.target[2]);
      if (opts.state === 'dead') { s.qaLock = 'idle'; s.updateVisual(0); killSoldier(ctx, s, { dir: new THREE.Vector3(Math.sin(yaw + Math.PI), 0.1, Math.cos(yaw + Math.PI)).normalize(), strength: opts.strength ?? 3.5, headshot: !!opts.headshot }); }
      if (opts.crouch !== undefined) { s.crouch = s.crouchTarget = opts.crouch; }
      s.nextThink = 0; return s;
    },
    qaStartWave: (n) => startWave(ctx, n || 1),
    qaSetEnabled: (v) => { S.enabled = !!v; },
    nav, cover: () => coverPoints(ctx), losStats,
  };
  ctx.ai = api; S.api = api;
  return api;
}

function soldierDamageDir(ctx, s, amount, point, dir, strength) {
  s.health -= amount; const t = ctx.time.elapsed; s.lastSeen = t; s.lastKnown.copy(ctx.player.position); if (s.squad) s.squad.alert(t, ctx.player.position);
  if (s.health <= 0) killSoldier(ctx, s, { point, dir, headshot: false, strength }); else s.flinch(dir, 1.2);
}

export function reset(ctx) {
  if (!S) return;
  for (const s of S.soldiers) { for (const h of s.inst.hitboxes) { const i = ctx.raycastTargets.indexOf(h); if (i > -1) ctx.raycastTargets.splice(i, 1); } releaseInstance(ctx, s.inst); }
  S.soldiers.length = 0; S.squads.length = 0; S.pending.length = 0;
  for (const d of S.dropped) ctx.scene.remove(d.mesh); S.dropped.length = 0;
  for (const b of S.blood) b.visible = false;
  if (S.cover) for (const c of S.cover) c.claimedBy = null;
  S.wave = 0; S.score = 0; S.kills = 0; S.streak = 0; S.streakT = -100; S.phase = 'idle'; S.phaseT = 0;
  if (S.enabled) { S.phase = 'countdown'; S.phaseT = S.startDelay; }
}

export function update(dt, ctx) {
  if (!S) return;
  const t = ctx.time.elapsed; const api = S.api; const playing = ctx.state === 'playing';
  const active = playing && !api.frozen && dt > 0;
  S.raysThisFrame = 0; S.nav.budget = 4;
  S.rebuildT += dt; if (S.rebuildT > 2) { S.rebuildT = 0; S.nav.maybeRebuild(); }

  // ---- waves ----
  if (active && S.enabled) {
    if (S.phase === 'countdown') { S.phaseT -= dt; if (S.phaseT <= 0) startWave(ctx, 1); }
    else if (S.phase === 'between') { S.phaseT -= dt; if (S.phaseT <= 0) startWave(ctx, S.wave + 1); }
    else if (S.phase === 'active') {
      S.waveClock += dt;
      for (let i = S.pending.length - 1; i >= 0; i--) { const p = S.pending[i]; if (S.waveClock >= p.at) { S.pending.splice(i, 1); spawnSquad(ctx, p.size, p.spawn, S.wave); } }
      if (!S.pending.length && api.alive() === 0) {
        if (S.wave >= TOTAL_WAVES) { S.phase = 'victory'; ctx.bus.emit('victory', { score: S.score, kills: S.kills }); try { ctx.setState('victory'); } catch (e) {} }
        else { S.phase = 'between'; S.phaseT = 6; }
      }
    }
  }

  // ---- soldiers ----
  const soldiers = S.soldiers; const others = soldiers;
  for (let i = 0; i < soldiers.length; i++) {
    const s = soldiers[i];
    if (s.dead) {
      s.deadT += dt;
      if (s.ragdoll && !s.ragdoll.settled && dt > 0) { s.ragdoll.step(dt); s.ragdoll.apply(); }
      if (s.deadT > 12) { const k = (s.deadT - 12) / 1.5; s.group.position.y = s.position.y - k * 1.2; if (k >= 1) s.removeMe = true; }
      continue;
    }
    if (active) {
      if (t >= s.nextThink) { s.nextThink = t + 0.15 + ctx.rng() * 0.1; try { think(ctx, s, t); } catch (e) { if (ctx.time.frame % 120 === 0) console.error('[ai] think', e); } }
      s.moveStep(dt, S.nav, others, ctx.player);
      s.updateFacing(dt);
      s.updateAim(dt);
      updateFire(ctx, s, dt, t);
    } else {
      s.vel.multiplyScalar(0.8); s.speed = 0; s.wantFire = false; s.burst = 0;
      if (!playing) s.clearAim();
    }
    s.updateVisual(dt);
  }
  // remove finished corpses
  for (let i = soldiers.length - 1; i >= 0; i--) { const s = soldiers[i]; if (s.removeMe) { soldiers.splice(i, 1); releaseInstance(ctx, s.inst); } }
  // squads cleanup
  for (let i = S.squads.length - 1; i >= 0; i--) if (S.squads[i].members.every(m => m.dead)) S.squads.splice(i, 1);

  // ---- dropped rifles ----
  for (let i = S.dropped.length - 1; i >= 0; i--) {
    const d = S.dropped[i]; d.t += dt; const m = d.mesh;
    if (!d.landed) {
      d.vel.y -= 18 * dt; m.position.addScaledVector(d.vel, dt);
      m.rotation.x += d.av.x * dt; m.rotation.y += d.av.y * dt; m.rotation.z += d.av.z * dt;
      const gy = S.nav.groundY(m.position.x, m.position.z) + 0.035;
      if (m.position.y <= gy) {
        m.position.y = gy; d.landed = true;
        const yaw = Math.atan2(d.vel.x, d.vel.z) + (ctx.rng() - 0.5);
        d.restQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, ctx.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2, 'YXZ'));
        d.fromQ = m.quaternion.clone(); d.landT = 0;
      }
    } else if (d.landT < 0.25) { d.landT += dt; m.quaternion.slerpQuaternions(d.fromQ, d.restQ, Math.min(1, d.landT / 0.25)); }
    if (d.t > 12) { const k = (d.t - 12) / 1.5; m.position.y = S.nav.groundY(m.position.x, m.position.z) + 0.035 - k * 0.4; if (k >= 1) { ctx.scene.remove(m); S.dropped.splice(i, 1); } }
  }
  // ---- blood fade ----
  for (const b of S.blood) { if (!b.visible) continue; b.userData.t += dt; if (b.userData.t > 40) { b.material.opacity = Math.max(0, 1 - (b.userData.t - 40) / 4); if (b.material.opacity <= 0) b.visible = false; } }
  if (S.streak > 0 && t - S.streakT > 4) S.streak = 0;
}
