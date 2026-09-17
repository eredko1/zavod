// Weapons: arsenal + loadout, first-person viewmodels, feel (sway/bob/ADS/recoil), reload/swap/grenade, hitscan (bullets + pellets) + FX. Owned by: WEAPONS agent.
import * as THREE from 'three';
import { makeTextures, makeMaterials } from './weapons/materials.js';
import { buildRifle, RIFLE_SPEC } from './weapons/rifle.js';
import { buildPistol, PISTOL_SPEC } from './weapons/pistol.js';
import { buildShotgun, SHOTGUN_SPEC } from './weapons/shotgun.js';
import { buildScope } from './weapons/scope.js';
import { FX } from './weapons/fx.js';
import { Grenades } from './weapons/grenade.js';

const DEG = Math.PI / 180;
const VM_FOV = 50;                // vertical fov the viewmodel is authored for (x/y-scale trick emulates it under the world fov)
const ADS_FOV_MUL = 0.7;
const GRENADES = 4;
const DEFAULT_PRIMARY = 'm4a1', DEFAULT_SECONDARY = 'm9';

// Weapon registry: id → { spec, build(mats) }. Optional weapons (sniper/SMG/AK/heavy pistol) are dynamically imported below so a broken file never takes the arsenal down.
const REGISTRY = {
  m4a1: { spec: RIFLE_SPEC, build: (mats) => buildRifle(mats, { suppressor: false }) },
  r870: { spec: SHOTGUN_SPEC, build: (mats) => buildShotgun(mats) },
  m9: { spec: PISTOL_SPEC, build: (mats) => buildPistol(mats) },
};
const OPTIONAL = [
  ['./weapons/sniper.js', 'SNIPER_SPEC', 'buildSniper'],
  ['./weapons/smg.js', 'SMG_SPEC', 'buildSmg'],
  ['./weapons/ak.js', 'AK_SPEC', 'buildAk'],
  ['./weapons/deagle.js', 'DEAGLE_SPEC', 'buildDeagle'],
];

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _rlp = new THREE.Vector3(), _rlr = new THREE.Vector3(), _ins = new THREE.Vector3(), _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _ray = new THREE.Ray();
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t, damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt)), sstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const lerp3 = (out, a, b, t) => out.set(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));
/** keyframe track: keys = [[t, [x,y,z]], ...] sorted; smoothstep between keys */
function track(out, t, keys) {
  if (t <= keys[0][0]) return out.set(...keys[0][1]);
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const k = sstep((t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])); return lerp3(out, keys[i - 1][1], keys[i][1], k); }
  return out.set(...keys[keys.length - 1][1]);
}
function pulse(t, a, b) { return t < a ? sstep(t / a) : 1 - sstep((t - a) / b); }
/** window helper: 1 inside [a,b] with smooth ramps of width r */
function win(u, a, b, r = 0.04) { return sstep((u - a) / r) * (1 - sstep((u - b) / r)); }

let S = null;

// ------------------------------------------------------------------ arsenal
function shotDamage(sp) { return sp.damage * (sp.pellets || 1); }
function arsenalEntry(sp) {
  const st = sp.stats || {};
  const dmg = st.damage ?? shotDamage(sp), rpm = st.rpm ?? sp.rpm, range = st.range ?? sp.range, mag = st.mag ?? sp.mag, mobility = st.mobility ?? 70, accuracy = st.accuracy ?? 60;
  return {
    id: sp.id, name: sp.name, class: sp.class, slot: sp.slot, desc: sp.desc || '', mode: sp.mode,
    stats: { damage: dmg, rpm, range, mag, mobility, accuracy },
    bars: { damage: clamp(Math.round(dmg), 0, 100), fireRate: clamp(Math.round(rpm / 9), 0, 100), range: clamp(Math.round(Math.sqrt(range / 400) * 100), 0, 100), accuracy: clamp(Math.round(accuracy), 0, 100), mobility: clamp(Math.round(mobility), 0, 100) },
  };
}
function buildArsenal() { return Object.values(REGISTRY).map(r => r.spec).sort((a, b) => a.slot - b.slot).map(arsenalEntry); }

export async function init(ctx) {
  const { camera, scene } = ctx;
  const tex = makeTextures(); const mats = makeMaterials(tex);
  const fx = new FX(ctx); const grenades = new Grenades(ctx, mats, fx);
  // optional weapon modules (each is an independent file so a broken one never takes the arsenal down)
  for (const [path, specName, buildName] of OPTIONAL) {
    try { const m = await import(path); const spec = m[specName], build = m[buildName]; if (spec && build && spec.id) REGISTRY[spec.id] = { spec, build: (mm) => build(mm) }; }
    catch (e) { /* not present yet */ }
  }

  const vmRoot = new THREE.Group(); vmRoot.name = 'viewmodel'; camera.add(vmRoot);
  // subtle viewmodel fill (short range so it barely touches the world) — keeps the gun readable in deep shadow
  const fill = new THREE.PointLight(0x9fb8e0, 0.05, 1.4, 2.0); fill.position.set(0.25, 0.22, 0.05); camera.add(fill);
  const fill2 = new THREE.PointLight(0xffc890, 0.02, 1.2, 2.0); fill2.position.set(-0.3, -0.1, -0.1); camera.add(fill2);
  const poseNode = new THREE.Group(); vmRoot.add(poseNode);
  const swayNode = new THREE.Group(); poseNode.add(swayNode);
  const scope = buildScope(camera);

  // fallback environment for the viewmodel if the world hasn't provided one (dark yard with a few sodium lamps)
  let fallbackEnv = null;
  const ensureEnv = () => {
    const useScene = !!scene.environment;
    if (!useScene && !fallbackEnv) {
      const pm = new THREE.PMREMGenerator(ctx.renderer); const es = new THREE.Scene();
      es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 16, 8), new THREE.MeshBasicMaterial({ color: 0x0a0d12, side: THREE.BackSide })));
      const lampMat = new THREE.MeshBasicMaterial({ color: 0xffb060 }); const skyMat = new THREE.MeshBasicMaterial({ color: 0x223044 });
      for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(6, 2), lampMat); const a = i * Math.PI / 2 + 0.4; l.position.set(Math.cos(a) * 30, 8 + i * 2, Math.sin(a) * 30); l.lookAt(0, 0, 0); es.add(l); }
      const sky = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), skyMat); sky.position.set(0, 45, 0); sky.rotation.x = Math.PI / 2; es.add(sky);
      const grd = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshBasicMaterial({ color: 0x141618 })); grd.position.y = -3; grd.rotation.x = -Math.PI / 2; es.add(grd);
      fallbackEnv = pm.fromScene(es, 0.04).texture; pm.dispose();
    }
    // day maps: the bright sky PMREM turns phosphate steel into chrome — pull the viewmodel's reflection strength down
    const dayK = ctx.world?.grade === 'day' ? 0.4 : 1;
    for (const m of Object.values(mats)) { const want = useScene ? null : fallbackEnv; if (m.envMap !== want && 'envMap' in m) { m.envMap = want; m.needsUpdate = true; } if (m.envMapIntensity !== undefined) { if (m.userData.baseEnv === undefined) { m.userData.baseEnv = m.envMapIntensity; m.userData.baseRough = m.roughness; } m.envMapIntensity = m.userData.baseEnv * dayK; if (m.userData.baseMetal === undefined) m.userData.baseMetal = m.metalness; if (m.userData.baseMetal > 0.5) { m.roughness = Math.min(1, m.userData.baseRough + (dayK < 1 ? 0.1 : 0)); m.metalness = m.userData.baseMetal; } } }
    fx.brassMesh.material.envMap = useScene ? null : fallbackEnv;
  };
  ensureEnv();

  S = {
    ctx, mats, fx, grenades, vmRoot, poseNode, swayNode, scope, weapons: [], cache: {}, cur: 0, loadout: null,
    adsTarget: 0, adsT: 0, ads: 0, adsOn: false, scoped: false,
    sprint: 0, lower: 0, swap: null, reload: null, throwing: null, inspect: null,
    rp: new THREE.Vector3(), rr: new THREE.Vector3(), rpv: new THREE.Vector3(), rrv: new THREE.Vector3(),
    lookX: 0, lookY: 0, bobX: 0, bobY: 0, spreadExtra: 0, recPitch: 0, recYaw: 0, swayPitch: 0, swayYaw: 0,
    flashT: 9, flashLife: 0.045, triggerHeld: false, triggerPressed: false, dryLatch: false,
    grenadeCount: GRENADES, wallPull: 0, lastFov: -1, scaleFov: -1, time: 0, envCheck: 0, dead: false,
    fired: 0, arsenal: buildArsenal(),
  };
  S._ensureEnv = ensureEnv;
  ctx.bus.on('shot', (d) => { if (d && d.who === 'enemy' && d.origin && d.dir) { const o = d.origin.isVector3 ? d.origin : _v.set(d.origin[0] ?? d.origin.x, d.origin[1] ?? d.origin.y, d.origin[2] ?? d.origin.z); const dir = d.dir.isVector3 ? d.dir : _v2.set(d.dir[0] ?? d.dir.x, d.dir[1] ?? d.dir.y, d.dir[2] ?? d.dir.z); fx.enemyShot(o.clone(), dir.clone()); } });
  ctx.bus.on('playerDied', () => { S.dead = true; cancelActions(); });
  ctx.bus.on('playerRespawn', () => { S.dead = false; });

  // initial loadout from the URL (?primary=&secondary=), mirrored into settings
  const qs = ctx.qs || new URLSearchParams(location.search);
  setLoadout({ primary: qs.get('primary') || ctx.settings?.loadout?.primary || DEFAULT_PRIMARY, secondary: qs.get('secondary') || ctx.settings?.loadout?.secondary || DEFAULT_SECONDARY }, { silent: true });

  const api = {
    get current() { return S.weapons[S.cur].cur; },
    get slots() { return S.weapons.map(w => w.cur); },
    get ads() { return S.ads; },
    get scoped() { return S.scoped; },
    get reloading() { return !!S.reload; },
    get grenades() { return S.grenadeCount; },
    get spread() { return currentSpread(); },
    get sprinting() { return S.sprint > 0.5; },
    get arsenal() { return S.arsenal; },
    get loadout() { return { ...S.loadout }; },
    get stats() { return arsenalEntry(S.weapons[S.cur].spec).stats; },
    setLoadout: (lo) => setLoadout(lo),
    fire: () => { const w = S.weapons[S.cur]; if (w.ammo > 0 && !w.needsAction) fireShot(w); else if (w.ammo <= 0) dryFire(w); },
    qaFire: (n = 1) => { const w = S.weapons[S.cur]; for (let i = 0; i < n; i++) { if (w.ammo <= 0) { w.ammo = w.spec.mag; } w.needsAction = false; w.actionT = 9; fireShot(w, { hold: 0.6 }); } },
    reload: () => startReload(),
    swap: (slot) => startSwap(slot),
    throwGrenade: () => startThrow(),
    inspect: () => startInspect(),
    // QA helpers
    setAdsForQA: (v = 1) => { S.qaAds = v == null ? null : v; if (v != null) { S.adsTarget = v; S.adsT = v; S.ads = v; S.adsOn = v > 0.5; if (ctx.player) ctx.player.ads = S.adsOn; } },
    qaLoadout: (primary, secondary) => setLoadout({ primary: primary || S.loadout.primary, secondary: secondary || S.loadout.secondary }),
    qaReload: (t = 0.5) => { const w = S.weapons[S.cur]; w.ammo = 0; startReload(true); if (S.reload) S.reload.t = t; },
    qaAction: (t = 0.3) => { const w = S.weapons[S.cur]; if (w.spec.action) { w.needsAction = true; w.actionT = t; } },
    qaSprint: (v = 1) => { S.sprint = v; },
    qaShowcase: (yaw = 0.6, pitch = 0.1, dist = 0.9, x = 0, y = -0.03) => { S.showcase = yaw == null ? null : { yaw, pitch, dist, x, y }; },
    qaGrenade: (t = 0.0) => { startThrow(true); if (S.throwing) S.throwing.t = t; },
    qaExplode: (x, y, z) => { fx.explosion(new THREE.Vector3(x, y, z)); },
    qaImpact: (x, y, z, surface = 'concrete') => { fx.impact(new THREE.Vector3(x, y, z), new THREE.Vector3(0, 1, 0), surface, new THREE.Vector3(0, -1, 0)); },
    materials: mats, fx, grenadeSim: grenades, viewmodel: vmRoot,
    get state() { return S; },
  };
  return api;
}

// ------------------------------------------------------------------ weapon instances / loadout
function getWeapon(id) {
  if (S.cache[id]) return S.cache[id];
  const reg = REGISTRY[id]; const w = reg.build(S.mats); const fx = S.fx;
  S.swayNode.add(w.group); w.group.visible = false;
  // muzzle flash: 3 crossed planes at the muzzle (one facing the camera, two along the barrel)
  const fm = new THREE.MeshBasicMaterial({ map: fx.tex.flash.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(1.8, 1.5, 1.2), side: THREE.DoubleSide });
  fm.map.repeat.set(1 / 3, 1); fm.map.needsUpdate = true;
  const flash = new THREE.Group(); flash.visible = false; w.parts.muzzle.add(flash);
  const sz = w.spec.flashSize ?? (w.spec.slot === 0 ? 0.15 : 0.11);
  const f0 = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), fm); f0.position.z = -0.01; flash.add(f0);
  const f1 = new THREE.Mesh(new THREE.PlaneGeometry(sz * 1.35, sz * 0.8), fm); f1.rotation.y = Math.PI / 2; f1.position.z = -sz * 0.5; flash.add(f1);
  const f2 = new THREE.Mesh(new THREE.PlaneGeometry(sz * 1.35, sz * 0.8), fm); f2.rotation.y = Math.PI / 2; f2.rotation.x = Math.PI / 2; f2.position.z = -sz * 0.5; flash.add(f2);
  for (const f of [f0, f1, f2]) { f.renderOrder = 30; f.frustumCulled = false; }
  if (!w.parts.mag) { w.parts.mag = new THREE.Group(); w.group.add(w.parts.mag); }
  if (w.parts.chargingHandle) { const ch = w.parts.chargingHandle; ch.userData.homeZ = ch.position.z; ch.userData.travel ??= 0.04; }
  w.parts.mag.userData.home = w.parts.mag.position.clone();
  const inst = { ...w, id, flash, flashMat: fm, ammo: w.spec.mag, reserve: w.spec.reserve, fireTimer: 0, shots: 0, lastShot: -9, boltT: 9, trigT: 9, actionT: 9, needsAction: false, slideLocked: false, cur: { id, name: w.spec.name, mode: w.spec.mode || (w.spec.auto ? 'AUTO' : 'SEMI'), class: w.spec.class, ammo: w.spec.mag, mag: w.spec.mag, reserve: w.spec.reserve, slot: w.spec.slot } };
  S.cache[id] = inst; return inst;
}
function resetWeapon(w) {
  w.ammo = w.spec.mag; w.reserve = w.spec.reserve; w.fireTimer = 0; w.shots = 0; w.lastShot = -9; w.boltT = 9; w.trigT = 9; w.actionT = 9; w.needsAction = false; w.slideLocked = false; w.flash.visible = false;
  w.cur.ammo = w.ammo; w.cur.reserve = w.reserve;
  w.parts.mag.visible = true; w.parts.mag.position.copy(w.parts.mag.userData.home); w.parts.mag.rotation.set(0, 0, 0);
  if (w.parts.pump) w.parts.pump.position.copy(w.parts.pump.userData.home);
  if (w.parts.chargingHandle) w.parts.chargingHandle.position.z = w.parts.chargingHandle.userData.homeZ;
  if (w.parts.boltHandle) { w.parts.boltHandle.position.copy(w.parts.boltHandle.userData.home); w.parts.boltHandle.rotation.set(0, 0, 0); }
  if (w.parts.shell) w.parts.shell.visible = false;
  for (const a of [w.parts.armL, w.parts.armR]) if (a) { a.position.copy(a.userData.home.pos); a.rotation.set(0, 0, 0); }
}
function setLoadout(lo = {}, opts = {}) {
  const ctx = S.ctx;
  const ok = (id, slot) => id && REGISTRY[id] && REGISTRY[id].spec.slot === slot;
  const primary = ok(lo.primary, 0) ? lo.primary : (S.loadout?.primary || DEFAULT_PRIMARY);
  const secondary = ok(lo.secondary, 1) ? lo.secondary : (S.loadout?.secondary || DEFAULT_SECONDARY);
  if (S.reload) endReload(false); S.swap = null; S.throwing = null; S.inspect = null;
  for (const w of S.weapons) w.group.visible = false;
  S.weapons = [getWeapon(primary), getWeapon(secondary)];
  S.weapons.forEach((w, i) => { resetWeapon(w); w.cur.slot = i; w.group.visible = i === 0; });
  S.cur = 0; S.loadout = { primary, secondary }; if (ctx.settings) ctx.settings.loadout = { primary, secondary };
  S.adsTarget = 0; S.adsT = 0; S.ads = 0; S.adsOn = false; S.scoped = false; S.scope.rig.visible = false; S.spreadExtra = 0; S.flashW = null; S.rp.set(0, 0, 0); S.rr.set(0, 0, 0); S.rpv.set(0, 0, 0); S.rrv.set(0, 0, 0);
  if (ctx.player) ctx.player.ads = false;
  ctx.bus.emit('loadout', { primary, secondary, initial: !!opts.silent });
  return S.loadout;
}

// ------------------------------------------------------------------ actions
function cancelActions() { if (S.reload) endReload(false); S.throwing = null; S.inspect = null; S.adsTarget = 0; }

function startSwap(slot) {
  if (slot == null || slot === S.cur || slot < 0 || slot >= S.weapons.length || (S.swap && S.swap.to === slot)) return false;
  if (S.reload) endReload(false); S.throwing = null; S.inspect = null;
  S.swap = { to: slot, t: 0, phase: 'lower', dur: S.weapons[S.cur].spec.swapTime }; return true;
}
function startReload(force = false) {
  const w = S.weapons[S.cur], sp = w.spec;
  if (S.reload || S.swap || S.throwing) return false;
  if (!force && (w.ammo >= sp.mag || w.reserve <= 0)) return false;
  if (w.needsAction && w.actionT < sp.actionTime) return false;
  S.inspect = null;
  const empty = w.ammo === 0;
  if (sp.reloadStyle === 'shell') S.reload = { style: 'shell', phase: 'start', t: 0, w, empty, shells: 0, interrupt: false, pushed: false };
  else S.reload = { style: 'mag', t: 0, dur: empty ? sp.reloadTime : sp.reloadTimeTac, empty, magOut: false, magIn: false, racked: false, w };
  S.ctx.bus.emit('reload', { stage: 'start', weapon: sp.name, empty, style: S.reload.style });
  return true;
}
function endReload(complete) {
  const r = S.reload; if (!r) return; const w = r.w;
  if (complete) S.ctx.bus.emit('reload', { stage: 'end', weapon: w.spec.name });
  w.parts.mag.visible = true; w.parts.mag.position.copy(w.parts.mag.userData.home); w.parts.mag.rotation.set(0, 0, 0);
  if (w.parts.chargingHandle) w.parts.chargingHandle.position.z = w.parts.chargingHandle.userData.homeZ;
  if (w.parts.shell) w.parts.shell.visible = false;
  S.reload = null;
}
function startAction(w, delay = 0) { w.needsAction = true; w.actionT = -delay; w.actionEjected = false; w.actionOpened = false; w.actionClosed = false; }
function startThrow(force = false) {
  if (S.throwing || S.swap) return false;
  if (!force && S.grenadeCount <= 0) return false;
  if (S.reload) endReload(false); S.inspect = null;
  S.throwing = { t: 0, pinned: false, thrown: false, dur: 1.15 }; S.adsTarget = 0;
  return true;
}
function startInspect() { if (S.reload || S.swap || S.throwing || S.inspect || S.adsOn) return false; S.inspect = { t: 0, dur: 3.2 }; return true; }

function dryFire(w) {
  if (S.dryLatch) return; S.dryLatch = true;
  w.trigT = 0; S.ctx.bus.emit('dryfire', { weapon: w.spec.name });
  if (w.reserve > 0) startReload();
}

function currentSpread() {
  const w = S.weapons[S.cur], sp = w.spec, p = S.ctx.player;
  const mv = clamp((p?.speed ?? 0) / 4.4, 0, 1.5), air = p && p.onGround === false ? 1.5 : 0;
  return lerp(sp.hipSpread + sp.moveSpread * mv + air, sp.adsSpread + mv * 0.3, S.ads) + S.spreadExtra * (1 - S.ads * 0.8);
}

function ejectFor(w, p) {
  const cam = S.ctx.camera, rng = S.ctx.rng; cam.getWorldDirection(_fwd); _right.set(1, 0, 0).applyQuaternion(cam.quaternion); _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
  const ej = w.parts.eject.getWorldPosition(new THREE.Vector3());
  _v.copy(_right).multiplyScalar(2.2 + rng() * 1.2).addScaledVector(_up, 1.6 + rng() * 0.8).addScaledVector(_fwd, -0.3 + rng() * 0.4); if (p?.velocity) _v.add(p.velocity);
  S.fx.ejectBrass(ej, _v, w.spec.brassScale ?? (w.spec.slot === 0 ? 1 : 0.8));
}

function fireShot(w, opts = {}) {
  const ctx = S.ctx, sp = w.spec, cam = ctx.camera, p = ctx.player, rng = ctx.rng;
  const now = S.time;
  if (now - w.lastShot > 0.35) w.shots = 0;
  w.ammo = Math.max(0, w.ammo - 1); w.shots++; w.lastShot = now; w.boltT = 0; w.trigT = 0; S.fired++;
  if (w.parts.slide && w.ammo === 0) w.slideLocked = true;
  S.inspect = null;
  if (sp.action) startAction(w, sp.actionDelay ?? 0.1);

  // direction with spread (cone; deterministic via ctx.rng)
  cam.updateMatrixWorld(true);
  cam.getWorldDirection(_fwd); _right.set(1, 0, 0).applyQuaternion(cam.quaternion); _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
  const spread = currentSpread() * DEG;
  const origin = cam.getWorldPosition(new THREE.Vector3());
  const coneDir = (spreadRad, out) => { const a = rng() * Math.PI * 2, rad = Math.sqrt(rng()) * spreadRad; const tr = Math.tan(rad); return out.copy(_fwd).addScaledVector(_right, Math.cos(a) * tr).addScaledVector(_up, Math.sin(a) * tr).normalize(); };
  const dir = coneDir(spread, new THREE.Vector3());
  S.spreadExtra = Math.min(sp.spreadMax, S.spreadExtra + sp.spreadPerShot);
  const [foStart, foEnd, foMin] = sp.falloff || [40, 160, 0.6];
  const falloff = (d) => d <= foStart ? 1 : clamp(1 - (d - foStart) / (foEnd - foStart), foMin, 1);

  // hitscan (one ray per bullet; `pellets` rays for shotguns, each in its own sub-cone around the shot direction)
  S._rc = S._rc || new THREE.Raycaster(); const rc = S._rc; rc.near = 0.05; rc.far = sp.range;
  const rays = sp.pellets || 1; const pelletSpread = (sp.pelletSpread || 0) * DEG;
  const soldierHits = new Map(); let firstHit = null, firstDist = sp.range;
  const _pd = new THREE.Vector3();
  for (let i = 0; i < rays; i++) {
    let d = dir;
    if (rays > 1) { const a = rng() * Math.PI * 2, rad = Math.sqrt(rng()) * pelletSpread, tr = Math.tan(rad); _right.set(1, 0, 0).applyQuaternion(cam.quaternion); _up.set(0, 1, 0).applyQuaternion(cam.quaternion); d = _pd.copy(dir).addScaledVector(_right, Math.cos(a) * tr).addScaledVector(_up, Math.sin(a) * tr).normalize(); }
    rc.set(origin, d);
    let hit = null;
    if (ctx.raycastTargets?.length) { const hits = rc.intersectObjects(ctx.raycastTargets, true); for (const h of hits) { if (h.object === S.vmRoot || (!h.object.visible && !h.object.userData?.soldier)) continue; hit = h; break; } } // soldier hitboxes are invisible meshes by design
    if (!hit) continue;
    const dist = hit.distance; if (!firstHit || dist < firstDist) { firstHit = hit; firstDist = dist; }
    let n = hit.normal ? hit.normal.clone() : null;
    if (!n) { n = hit.face ? hit.face.normal.clone() : d.clone().negate(); if (hit.instanceId !== undefined && hit.object.getMatrixAt) { hit.object.getMatrixAt(hit.instanceId, _m); _m.premultiply(hit.object.matrixWorld); n.transformDirection(_m); } else n.transformDirection(hit.object.matrixWorld); }
    if (n.dot(d) > 0) n.negate();
    const ud = hit.object.userData || {};
    if (ud.soldier) {
      const head = ud.part === 'head';
      const dmg = sp.damage * (head ? sp.headMul : 1) * falloff(dist);
      let acc = soldierHits.get(ud.soldier); if (!acc) { acc = { dmg: 0, head: 0, n: 0, point: hit.point.clone(), dir: d.clone(), normal: n }; soldierHits.set(ud.soldier, acc); }
      acc.dmg += dmg; acc.n++; if (head) acc.head++; if (head && acc.head === 1) acc.point.copy(hit.point);
      S.fx.impact(hit.point, n, 'flesh', d);
      ctx.bus.emit('impact', { point: hit.point.clone(), normal: n, surface: 'flesh' });
    } else {
      const surface = ud.surface || (ctx.world?.surfaceAt?.(hit.point)) || 'concrete';
      S.fx.impact(hit.point, n, surface, d);
      ctx.bus.emit('impact', { point: hit.point.clone(), normal: n, surface, distance: dist });
    }
  }
  for (const [soldier, acc] of soldierHits) {
    // single bullets: head = instant (ai.damage handles it). Pellets: a headshot needs at least half the pattern on the head.
    const headshot = rays > 1 ? acc.head * 2 >= rays : acc.head > 0;
    const dmg = Math.round(acc.dmg); if (dmg <= 0) continue;
    try { ctx.ai?.damage?.(soldier, dmg, acc.point.clone(), headshot); } catch (e) { console.warn('[weapons] ai.damage', e); }
    ctx.bus.emit('hit', { soldier, damage: dmg, headshot, point: acc.point.clone(), pellets: acc.n });
  }
  const dist = firstHit ? firstDist : sp.range;

  // muzzle world position (visual) — used by light, brass, tracer, smoke
  const muzzle = w.parts.muzzle.getWorldPosition(new THREE.Vector3());
  S.fx.muzzleLightAt(muzzle, sp.flashStrength ?? (sp.slot === 0 ? 1 : 0.7), opts.hold ? opts.hold : 0.045);
  // viewmodel flash
  S.flashT = 0; S.flashLife = opts.hold ? opts.hold : (0.04 + rng() * 0.02) * (sp.pellets ? 1.6 : 1); S.flashW = w;
  w.flashMat.map.offset.x = Math.floor(rng() * 3) / 3; w.flash.rotation.z = rng() * Math.PI * 2; w.flash.scale.setScalar(0.85 + rng() * 0.4); w.flash.visible = true; w.flashMat.opacity = 1;
  // brass: immediately for self-loaders; manual actions eject when the action opens
  if (!sp.action) ejectFor(w, p);
  // tracer 1-in-3 (never for pellets), smoke wisp every other shot (always for the big bores)
  if (!sp.pellets && w.shots % 3 === 1) S.fx.tracer(muzzle, _v2.subVectors(firstHit ? firstHit.point : _v3.copy(origin).addScaledVector(dir, dist), muzzle).normalize(), dist);
  if (w.shots % 2 === 0 || opts.hold || sp.action) { S.fx.muzzleSmoke(muzzle, _fwd); if (sp.pellets) S.fx.muzzleSmoke(muzzle, _fwd); }

  // visual recoil (spring impulses) — smaller in ADS
  const k = lerp(1, 0.55, S.ads);
  S.rpv.z += sp.kickBack * 40 * k; S.rrv.x += sp.kickUp * 40 * k; S.rrv.z += (rng() - 0.5) * 2 * sp.kickRoll * 40 * k; S.rrv.y += (rng() - 0.5) * sp.kickRoll * 30 * k; S.rpv.x += (rng() - 0.5) * 0.15 * k;
  // camera recoil pattern: climbs, drifts right for the first burst then wanders
  if (p && !opts.noCamera) {
    const n = w.shots; const patternYaw = n < 4 ? 0.3 : n < 9 ? -0.7 : Math.sin(n * 1.7) * 0.8;
    const kp = sp.recoilPitch * DEG * (0.85 + rng() * 0.3) * (n === 1 ? 1.15 : 1) * lerp(1, 0.85, S.ads);
    const ky = sp.recoilYaw * DEG * (patternYaw + (rng() - 0.5) * 1.2) * lerp(1, 0.85, S.ads);
    p.pitch = (p.pitch ?? 0) + kp; p.yaw = (p.yaw ?? 0) + ky; cam.rotation.x += kp; cam.rotation.y += ky;
    S.recPitch += kp * 0.55; S.recYaw += ky * 0.4;
  }
  ctx.bus.emit('shot', { origin, dir, weapon: sp.name, id: sp.id, who: 'player', muzzle, hit: firstHit ? firstHit.point.clone() : null, pellets: rays });
  w.cur.ammo = w.ammo;
}

// ------------------------------------------------------------------ per-frame
export function update(dt, ctx) {
  if (!S) return;
  const p = ctx.player, input = ctx.input, cam = ctx.camera; const playing = ctx.state === 'playing';
  const w = S.weapons[S.cur], sp = w.spec;
  S.time += dt;
  if ((S.envCheck += dt) > 1) { S.envCheck = 0; S._ensureEnv(); }
  const actionBusy = !!sp.action && w.needsAction; // pump/bolt cycling (or waiting to start)

  // ---------- input ----------
  if (playing && dt > 0 && !S.dead) {
    if (input.consume('Digit1')) startSwap(0);
    if (input.consume('Digit2')) startSwap(1);
    if (input.mouse.wheel) startSwap(1 - S.cur);
    if (input.consume('KeyR')) startReload();
    if (input.consume('KeyG')) startThrow();
    if (input.consume('KeyF')) startInspect();
    const trig = !!input.fire; if (trig && !S.triggerHeld) S.triggerPressed = true; if (!trig) S.dryLatch = false; S.triggerHeld = trig;
    if (S.triggerPressed && S.reload?.style === 'shell' && S.reload.phase === 'shell' && w.ammo > 0) S.reload.interrupt = true; // fire interrupts a shell-by-shell reload
    const busy = S.swap || S.throwing;
    S.adsTarget = (input.ads && !busy && !S.reload && !(actionBusy && sp.scope) && (p?.sprinting !== true || S.triggerHeld)) ? 1 : 0;
    if (S.qaAds != null) S.adsTarget = S.qaAds;
    if (S.adsTarget && S.inspect) S.inspect = null;
  } else { S.triggerPressed = false; if (!playing) S.adsTarget = 0; }

  // ---------- ADS ----------
  const adsSpeed = 1 / sp.adsTime;
  S.adsT = clamp(S.adsT + (S.adsTarget ? dt * adsSpeed : -dt * adsSpeed * 1.15), 0, 1);
  if (S.qaAds != null && S.qaAds > 0 && S.qaAds < 1) S.adsT = S.qaAds; // QA: hold a mid-transition pose
  S.ads = S.adsTarget ? 1 - (1 - S.adsT) ** 2.2 : S.adsT ** 1.8; // ease-out in, ease-in out
  const adsOn = S.adsT > 0.5; if (adsOn !== S.adsOn) { S.adsOn = adsOn; ctx.bus.emit('ads', { on: adsOn, scope: !!sp.scope }); }
  if (p) p.ads = S.adsTarget === 1;
  const fovBase = ctx.settings.fov || 75; const adsMul = sp.adsFovMul ?? ADS_FOV_MUL;
  // scopes: fov stays normal until the eye reaches the eyepiece, then snaps down through the last 15% of the transition
  const fovK = sp.scope ? sstep((S.ads - 0.8) / 0.2) : S.ads;
  const targetFov = fovBase * lerp(1, adsMul, fovK);
  if (Math.abs(cam.fov - targetFov) > 0.01 || S.lastFov !== targetFov) { cam.fov = targetFov; cam.updateProjectionMatrix(); S.lastFov = targetFov; }
  if (S.scaleFov !== fovBase) { S.scaleFov = fovBase; const s = Math.tan(fovBase * DEG / 2) / Math.tan(VM_FOV * DEG / 2); S.vmRoot.scale.set(s, s, 1); }

  // ---------- sprint / lowered blends ----------
  const wantSprint = !!(p?.sprinting) && !S.triggerHeld && !S.reload && !S.throwing && S.adsTarget === 0;
  S.sprint = damp(S.sprint, wantSprint ? 1 : 0, wantSprint ? 9 : 14, dt);
  let lowerT = 0;
  // swap
  if (S.swap) {
    const sw = S.swap; sw.t += dt;
    if (sw.phase === 'lower') { lowerT = sstep(sw.t / (sw.dur * 0.45)); if (sw.t >= sw.dur * 0.45) { S.weapons[S.cur].group.visible = false; S.cur = sw.to; S.weapons[S.cur].group.visible = true; sw.phase = 'raise'; sw.t = 0; ctx.bus.emit('swap', { slot: S.cur, name: S.weapons[S.cur].spec.name }); S.rrv.x -= 3; } }
    else { lowerT = 1 - sstep(sw.t / (sw.dur * 0.55)); if (sw.t >= sw.dur * 0.55) { S.swap = null; lowerT = 0; } }
  }
  if (S.dead || ctx.state === 'dead') lowerT = Math.max(lowerT, 1);
  // grenade throw
  if (S.throwing) {
    const th = S.throwing; th.t += dt;
    if (!th.pinned && th.t > 0.12) { th.pinned = true; ctx.bus.emit('grenade', { stage: 'pin' }); }
    if (!th.thrown && th.t > 0.5) { th.thrown = true; S.grenadeCount = Math.max(0, S.grenadeCount - 1); cam.updateMatrixWorld(true); cam.getWorldDirection(_fwd); _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
      const o = cam.getWorldPosition(new THREE.Vector3()).addScaledVector(_fwd, 0.35).addScaledVector(_right, 0.2).add(_v.set(0, -0.15, 0));
      const v = new THREE.Vector3().copy(_fwd).multiplyScalar(17).add(_v.set(0, 3.2, 0)); if (p?.velocity) v.addScaledVector(p.velocity, 0.6);
      S.grenades.spawn(o, v); ctx.bus.emit('grenade', { stage: 'throw', position: o.clone() }); S.rrv.x -= 4; S.rpv.z += 0.5; }
    lowerT = Math.max(lowerT, th.t < 0.5 ? sstep(th.t / 0.3) : 1 - sstep((th.t - 0.5) / 0.55));
    if (th.t >= th.dur) S.throwing = null;
  }
  S.lower = damp(S.lower, lowerT, 30, dt);

  // ---------- firing ----------
  const canFire = playing && !S.dead && !S.reload && !S.swap && !S.throwing && S.lower < 0.3 && S.sprint < 0.45 && (p?.canFire !== false) && !actionBusy;
  w.fireTimer -= dt;
  if (canFire && dt > 0 && (sp.auto ? S.triggerHeld : S.triggerPressed)) {
    if (w.ammo > 0) { let guard = 0; while (w.fireTimer <= 0 && w.ammo > 0 && guard++ < 3 && !w.needsAction) { fireShot(w); w.fireTimer += 60 / sp.rpm; } }
    else dryFire(w);
  }
  if (w.fireTimer < 0) w.fireTimer = 0;
  S.triggerPressed = false;
  if (S.inspect) { S.inspect.t += dt; if (S.inspect.t >= S.inspect.dur) S.inspect = null; }

  // spread decay & camera recoil recovery
  S.spreadExtra = damp(S.spreadExtra, 0, S.time - w.lastShot > 0.12 ? 9 : 2.5, dt);
  if (p && S.time - w.lastShot > 0.09) {
    const kr = 1 - Math.exp(-dt * 11);
    const rp = S.recPitch * kr, ry = S.recYaw * kr; S.recPitch -= rp; S.recYaw -= ry; p.pitch -= rp; p.yaw -= ry; cam.rotation.x -= rp; cam.rotation.y -= ry;
    if (Math.abs(S.recPitch) < 1e-4) S.recPitch = 0; if (Math.abs(S.recYaw) < 1e-4) S.recYaw = 0;
  }

  // ---------- reload timeline ----------
  const reloadOff = { pos: _rlp.set(0, 0, 0), rot: _rlr.set(0, 0, 0) }; // extra weapon offset while reloading / cycling
  const armL = w.parts.armL, armR = w.parts.armR, mag = w.parts.mag;
  armL.position.copy(armL.userData.home.pos); armL.rotation.set(0, 0, 0);
  if (armR) { armR.position.copy(armR.userData.home.pos); armR.rotation.set(0, 0, 0); }
  if (S.reload && S.reload.style === 'mag') {
    const r = S.reload; r.t += dt; const u = clamp(r.t / r.dur, 0, 1);
    const rk = sp.reloadKeys || (sp.slot === 0 ? RIFLE_SPEC.reloadKeys : PISTOL_SPEC.reloadKeys); const isLong = sp.slot === 0;
    const rackAtEnd = r.empty && !sp.action; // bolt guns cycle the bolt after the mag is in instead of racking a handle
    // weapon tilt: roll left + nose down while the hand works the mag, back at the end
    const tiltK = rk.tiltK ?? 1;
    const settle = u > 0.72 ? 1 - sstep((u - 0.72) / 0.28) : 1;
    const ro = sp.reloadOff || { rot: [-0.14 * tiltK, 0.12, -0.42 * tiltK], pos: [0.012, -0.02, 0.01] };
    reloadOff.rot.set(ro.rot[0] * settle, ro.rot[1] * settle, ro.rot[2] * settle); reloadOff.pos.set(ro.pos[0] * settle, ro.pos[1] * settle, ro.pos[2] * settle);
    // left hand track (weapon space, relative to home)
    const magHome = mag.userData.home; const wrist = armL.userData.home.pos;
    const magGrab = rk.magGrab, down = rk.down, rack = rk.rack;
    const rel = (a) => [a[0] - wrist.x, a[1] - wrist.y, a[2] - wrist.z]; // absolute weapon-space → offset from home
    const homeOff = [0, 0, 0];
    const keys = rackAtEnd
      ? [[0, homeOff], [0.16, rel(magGrab)], [0.2, rel(magGrab)], [0.42, rel(down)], [0.5, rel(down)], [0.72, rel(magGrab)], [0.76, rel(magGrab)], [0.86, rel(rack)], [0.93, [rack[0] - wrist.x, rack[1] - wrist.y, rack[2] - wrist.z + 0.035]], [1.0, homeOff]]
      : [[0, homeOff], [0.18, rel(magGrab)], [0.22, rel(magGrab)], [0.45, rel(down)], [0.52, rel(down)], [0.76, rel(magGrab)], [0.8, rel(magGrab)], [1.0, homeOff]];
    const off = track(_v3, u, keys); armL.position.add(off);
    // hand orientation: rotate to grab (palm inward), then to the rack
    const rotK = pulse(u, 0.18, 0.75); armL.rotation.set(-0.5 * rotK * (u > 0.84 && rackAtEnd ? 0.3 : 1), 0.25 * rotK, (isLong ? 0.9 : 0.6) * rotK);
    // magazine events + motion
    if (!r.magOut && u >= 0.2) { r.magOut = true; ctx.bus.emit('reload', { stage: 'magOut', weapon: sp.name }); r.dropV = 0; r.dropY = 0; }
    if (r.magOut && !r.magIn) {
      if (u < 0.5) { r.dropV = (r.dropV || 0) + 12 * dt; r.dropY = (r.dropY || 0) + r.dropV * dt; mag.position.copy(magHome).add(_v3.set(0.0, -r.dropY, -r.dropY * 0.4)); mag.rotation.x = -r.dropY * 2.5; mag.visible = r.dropY < 0.5; }
      else { // new mag carried by the left hand from below into the well
        const k = sstep((u - 0.5) / (rackAtEnd ? 0.22 : 0.26)); mag.visible = true;
        mag.position.copy(magHome).add(_v3.set(0.0, -0.2 * (1 - k), -0.05 * (1 - k))); mag.rotation.set(-0.35 * (1 - k), 0, 0.3 * (1 - k));
      }
    }
    if (!r.magIn && u >= (rackAtEnd ? 0.72 : 0.76)) { r.magIn = true; mag.position.copy(magHome); mag.rotation.set(0, 0, 0); mag.visible = true; ctx.bus.emit('reload', { stage: 'magIn', weapon: sp.name }); S.rpv.y += 0.6; S.rrv.x += 1.2;
      const take = Math.min(sp.mag - w.ammo, w.reserve); w.ammo += take; w.reserve -= take; w.cur.ammo = w.ammo; w.cur.reserve = w.reserve; if (!r.empty) w.slideLocked = false; }
    // charging handle / slide rack on empty reload
    if (rackAtEnd) {
      const rkk = u > 0.86 && u < 0.98 ? pulse((u - 0.86) / 0.12, 0.45, 0.55) : 0;
      if (w.parts.chargingHandle) { const ch = w.parts.chargingHandle; ch.position.z = ch.userData.homeZ + rkk * ch.userData.travel; }
      if (w.parts.bolt) w.parts.bolt.position.z = -0.02 + rkk * 0.05;
      if (!r.racked && u > 0.94) { r.racked = true; w.slideLocked = false; w.boltT = 0.02; S.rrv.x -= 0.8; S.rpv.z += 0.3; if (isLong) w.boltT = 9; }
      if (w.parts.slide) w.slideLocked = w.slideLocked && u < 0.93;
    }
    if (u >= 1) { const cycle = r.empty && sp.action; endReload(true); if (cycle) startAction(w, 0.05); }
  } else if (S.reload && S.reload.style === 'shell') {
    // shell-by-shell tube reload: start (hand to the pouch) → N × [pouch → loading port → push] → end (hand back to the forend)
    const r = S.reload; r.t += dt; const wrist = armL.userData.home.pos;
    const sk = sp.shellKeys || {}; const pouchA = sk.pouch || [-0.07, -0.34, 0.12], portA = sk.port || [-0.008, -0.15, -0.045];
    const pouch = [pouchA[0] - wrist.x, pouchA[1] - wrist.y, pouchA[2] - wrist.z], port = [portA[0] - wrist.x, portA[1] - wrist.y, portA[2] - wrist.z], pushed = [port[0] + 0.01, port[1] + 0.04, port[2] - 0.01];
    const rotPouch = sk.rotPouch || [-0.3, 0.2, 0.3], rotPort = sk.rotPort || [0.55, 0.25, 0.85];
    const shell = w.parts.shell; let hand = null, handRot = null, k = 0;
    if (r.phase === 'start') {
      const u = clamp(r.t / sp.reloadStart, 0, 1); k = sstep(u);
      hand = track(_v3, k, [[0, [0, 0, 0]], [1, pouch]]); handRot = rotPouch.map(v => v * k);
      if (u >= 1) { r.phase = 'shell'; r.t = 0; }
    } else if (r.phase === 'shell') {
      const u = clamp(r.t / sp.shellTime, 0, 1);
      hand = track(_v3, u, [[0, pouch], [0.5, port], [0.62, pushed], [0.72, port], [1.0, pouch]]);
      const kk = pulse(u, 0.5, 0.5); handRot = [lerp(rotPouch[0], rotPort[0], kk), lerp(rotPouch[1], rotPort[1], kk), lerp(rotPouch[2], rotPort[2], kk)];
      if (shell) shell.visible = u > 0.06 && u < 0.62;
      if (!r.pushed && u >= 0.62) { r.pushed = true; r.shells++; w.ammo = Math.min(sp.mag, w.ammo + 1); w.reserve--; w.cur.ammo = w.ammo; w.cur.reserve = w.reserve; S.rpv.y += 0.5; S.rrv.x += 0.6; S.rrv.z -= 0.5; ctx.bus.emit('reload', { stage: 'shell', weapon: sp.name, n: r.shells, ammo: w.ammo }); }
      if (u >= 1) { r.t = 0; r.pushed = false; if (w.ammo >= sp.mag || w.reserve <= 0 || r.interrupt) r.phase = 'end'; }
      k = 1;
    } else { // end
      const u = clamp(r.t / sp.reloadEnd, 0, 1); k = 1 - sstep(u);
      hand = track(_v3, 1 - k, [[0, pouch], [1, [0, 0, 0]]]); handRot = rotPouch.map(v => v * k);
      if (shell) shell.visible = false;
      if (u >= 1) { const cycle = r.empty; endReload(true); if (cycle) startAction(w, 0.05); }
    }
    if (hand) { armL.position.add(hand); armL.rotation.set(handRot[0], handRot[1], handRot[2]); }
    if (shell && shell.visible && shell.userData.off) shell.position.copy(armL.position).add(shell.userData.off);
    // weapon rolls left / tips up a bit to present the loading port
    const so = sp.shellOff || { rot: [0.16, 0.22, -0.5], pos: [-0.02, 0.05, -0.02] };
    reloadOff.rot.set(so.rot[0] * k, so.rot[1] * k, so.rot[2] * k); reloadOff.pos.set(so.pos[0] * k, so.pos[1] * k, so.pos[2] * k);
  }

  // ---------- manual action (pump / bolt) ----------
  if (w.parts.pump) { w.parts.pump.position.copy(w.parts.pump.userData.home); }
  if (w.parts.boltHandle) { w.parts.boltHandle.position.copy(w.parts.boltHandle.userData.home); w.parts.boltHandle.rotation.set(0, 0, 0); }
  if (sp.action && w.needsAction) {
    const blocked = S.reload || S.swap || S.throwing || S.lower > 0.3 || !playing || S.dead; // wait until the hands are free
    if (!blocked) w.actionT += dt; else if (w.actionT < 0) w.actionT = -0.02;
    const u = w.actionT / sp.actionTime;
    if (u >= 1) { w.needsAction = false; w.actionT = 9; }
    else if (u >= 0) {
      if (!w.actionOpened) { w.actionOpened = true; ctx.bus.emit('action', { stage: 'open', kind: sp.action, weapon: sp.name }); }
      if (sp.action === 'pump') {
        const back = sstep((u - 0.04) / 0.32) * (1 - sstep((u - 0.56) / 0.34));
        const travel = w.parts.pump.userData.travel || 0.075;
        w.parts.pump.position.z += travel * back; armL.position.z += travel * back;
        if (!w.actionEjected && u >= 0.30) { w.actionEjected = true; ejectFor(w, p); S.rpv.z += 0.9; S.rrv.x -= 1.0; }
        if (!w.actionClosed && u >= 0.62) { w.actionClosed = true; ctx.bus.emit('action', { stage: 'close', kind: sp.action, weapon: sp.name }); }
        if (u >= 0.88 && !w.actionLocked) { w.actionLocked = true; S.rpv.z -= 0.8; S.rrv.x += 1.4; S.rrv.z += 0.6; }
        const dip = Math.sin(clamp(u, 0, 1) * Math.PI);
        reloadOff.rot.x += -0.05 * dip; reloadOff.rot.z += 0.045 * dip; reloadOff.pos.y += -0.012 * dip; reloadOff.pos.z += 0.012 * dip;
      } else if (sp.action === 'bolt') {
        const bh = w.parts.boltHandle, tr = bh.userData.travel || 0.085;
        const lift = sstep(u / 0.2) * (1 - sstep((u - 0.78) / 0.2));
        const pull = sstep((u - 0.24) / 0.22) * (1 - sstep((u - 0.54) / 0.24));
        bh.rotation.z = (bh.userData.liftAngle || 1.15) * lift; bh.position.z += tr * pull;
        if (w.parts.boltBody) w.parts.boltBody.position.z = w.parts.boltBody.userData.home.z + tr * pull;
        // right hand leaves the grip to work the bolt
        if (armR && bh.userData.grip) { const g = bh.userData.grip, hr = armR.userData.home.pos; const reach = sstep(u / 0.16) * (1 - sstep((u - 0.84) / 0.16));
          armR.position.x += (g[0] - hr.x) * reach; armR.position.y += (g[1] - hr.y) * reach; armR.position.z += (g[2] - hr.z) * reach + tr * pull;
          armR.rotation.set(-0.9 * reach, 0.2 * reach, -0.5 * reach + 0.4 * lift); }
        if (!w.actionEjected && u >= 0.42) { w.actionEjected = true; ejectFor(w, p); S.rpv.z += 0.5; }
        if (!w.actionClosed && u >= 0.62) { w.actionClosed = true; ctx.bus.emit('action', { stage: 'close', kind: sp.action, weapon: sp.name }); }
        if (!w.actionLocked && u >= 0.9) { w.actionLocked = true; S.rrv.z -= 1.2; S.rrv.x += 0.8; }
        if (u < 0.02 && p && !w.actionNudged) { w.actionNudged = true; const np = -0.25 * DEG, ny = 0.35 * DEG; p.pitch += np; p.yaw += ny; cam.rotation.x += np; cam.rotation.y += ny; S.recPitch += np; S.recYaw += ny; S.rrv.z -= 2.0; S.rrv.x -= 0.8; }
        const dip = Math.sin(clamp(u, 0, 1) * Math.PI);
        reloadOff.rot.x += 0.06 * dip; reloadOff.rot.z += 0.30 * dip; reloadOff.rot.y += -0.22 * dip; reloadOff.pos.x += -0.05 * dip; reloadOff.pos.y += 0.01 * dip; reloadOff.pos.z += -0.02 * dip; // bring the receiver into view, roll so the lifted handle shows
      }
    }
    if (u >= 1 || u < 0) { w.actionLocked = false; if (u >= 1) w.actionNudged = false; }
  }

  // ---------- inspect ----------
  const insp = _ins.set(0, 0, 0); let inspRot = null;
  if (S.inspect) { const k = S.inspect.t / S.inspect.dur; const e = Math.sin(k * Math.PI); inspRot = [0.25 * e, 1.25 * Math.sin(k * Math.PI * 2) * e + 0.3 * e, 0.55 * e]; insp.set(-0.06 * e, 0.02 * e, 0.05 * e); }

  // ---------- pose composition ----------
  const sight = w.parts.sight.position;
  const adsPos = [-sight.x, -sight.y, -sp.adsDist - sight.z];
  const pos = lerp3(_v, sp.hip.pos, adsPos, S.ads), rot = lerp3(_v2, sp.hip.rot, [0, 0, 0], S.ads);
  lerp3(pos, [pos.x, pos.y, pos.z], sp.sprint.pos, S.sprint); lerp3(rot, [rot.x, rot.y, rot.z], sp.sprint.rot, S.sprint);
  lerp3(pos, [pos.x, pos.y, pos.z], sp.lower.pos, S.lower); lerp3(rot, [rot.x, rot.y, rot.z], sp.lower.rot, S.lower);
  pos.add(reloadOff.pos).add(insp); rot.add(reloadOff.rot); if (inspRot) { rot.x += inspRot[0]; rot.y += inspRot[1]; rot.z += inspRot[2]; }
  // wall clip avoidance: pull back when something is right in front
  if (ctx.colliders?.length && (ctx.time.frame % 3 === 0)) { cam.getWorldDirection(_fwd); _ray.set(cam.getWorldPosition(_up), _fwd); const reach = sp.wallReach ?? 0.8; let best = reach; for (let i = 0; i < ctx.colliders.length; i++) { const b = ctx.colliders[i]; if (!b?.min) continue; const hp = _ray.intersectBox(b, _v3); if (hp) { const d = hp.distanceTo(_ray.origin); if (d < best) best = d; } } S.wallTarget = best < reach ? (reach - best) : 0; }
  S.wallPull = damp(S.wallPull, S.wallTarget || 0, 12, dt); pos.z += S.wallPull * 0.55; pos.y -= S.wallPull * 0.08; rot.x += S.wallPull * 0.9; rot.y += S.wallPull * 0.4;
  if (S.showcase) { const sc = S.showcase; pos.set(sc.x, sc.y, -sc.dist); rot.set(sc.pitch, sc.yaw, 0); }
  S.poseNode.position.copy(pos); S.poseNode.rotation.set(rot.x, rot.y, rot.z);

  // ---------- sway node: idle sway + look lag + bob + recoil spring ----------
  const t = S.time, adsK = lerp(1, 0.18, S.ads), sprintK = 1 + S.sprint * 1.5;
  const mdx = input?.mouse?.dx ?? 0, mdy = input?.mouse?.dy ?? 0;
  S.lookX = damp(S.lookX, clamp(mdx, -60, 60), 14, dt); S.lookY = damp(S.lookY, clamp(mdy, -60, 60), 14, dt);
  const bob = p?.bob || { x: 0, y: 0, roll: 0 }; S.bobX = damp(S.bobX, bob.x, 22, dt); S.bobY = damp(S.bobY, bob.y, 22, dt);
  // spring integrate (semi-implicit): x'' = -k x - c x'
  const K = 420, C = 30; // substepped: raw Euler at dt>=0.08 s (sub-12 fps) went unstable and made the viewmodel jitter after landings/shots
  for (const [x, v] of [[S.rp, S.rpv], [S.rr, S.rrv]]) { let rem = dt; while (rem > 0) { const h = Math.min(rem, 1 / 240); v.x += (-K * x.x - C * v.x) * h; v.y += (-K * x.y - C * v.y) * h; v.z += (-K * x.z - C * v.z) * h; x.addScaledVector(v, h); rem -= h; } }
  const sn = S.swayNode; if (S.showcase) { sn.position.set(0, 0, 0); sn.rotation.set(0, 0, 0); }
  const swx = (Math.sin(t * 0.7) + 0.5 * Math.sin(t * 1.9 + 1.3) + 0.25 * Math.sin(t * 3.7)) * 0.0022 * adsK * sprintK;
  const swy = (Math.sin(t * 1.1 + 2.0) + 0.5 * Math.sin(t * 2.6) + 0.25 * Math.sin(t * 4.3 + 0.7)) * 0.0018 * adsK * sprintK;
  const land = p?.landImpulse || 0;
  if (!S.showcase) sn.position.set(
    swx - S.lookX * 0.00045 * adsK + S.bobX * 0.9 * adsK + S.rp.x,
    swy - S.lookY * 0.00035 * adsK - S.bobY * 1.1 * adsK - land * 0.05 + S.rp.y * 0.02,
    S.rp.z * 0.025 + land * 0.02);
  if (!S.showcase) sn.rotation.set(
    (Math.sin(t * 0.9 + 0.4) * 0.004) * adsK - S.lookY * 0.0012 * adsK + S.rr.x * 0.05 - land * 0.12 - S.bobY * 1.4 * adsK,
    (Math.sin(t * 0.6 + 1.7) * 0.004) * adsK - S.lookX * 0.0016 * adsK + S.rr.y * 0.05 + S.bobX * 1.2 * adsK,
    (Math.sin(t * 0.8 + 3.1) * 0.005) * adsK - S.lookX * 0.0011 * adsK + S.rr.z * 0.05 + (bob.roll || 0) * 0.6 + S.bobX * 1.4 * adsK);

  // ---------- scope (sniper): overlay replaces the viewmodel once the eye is on the eyepiece; aim sway moves the camera ----------
  const scoped = !!sp.scope && S.ads > 0.85 && !S.reload && !S.swap && !S.throwing && S.lower < 0.3 && !S.showcase && !(w.needsAction && w.actionT >= 0);
  if (scoped !== S.scoped) { S.scoped = scoped; S.scope.rig.visible = scoped; if (scoped) ctx.bus.emit('scope', { on: true }); else ctx.bus.emit('scope', { on: false }); }
  if (!S.swap) w.group.visible = !scoped;
  if (scoped) {
    const sc = S.scope; const half = 0.5 * Math.tan(cam.fov * DEG / 2); sc.rig.scale.set(half, half, 1);
    // scope shadow: eye offset from the recoil spring + bob, so the exit pupil crescent moves like a real eyepiece
    const ox = S.rr.y * 0.05 + S.bobX * 0.8, oy = S.rr.x * 0.05 - S.bobY * 0.8; sc.shadow.position.set(ox * 6, oy * 6, 0); sc.shadow.material.opacity = clamp(Math.hypot(ox, oy) * 40, 0, 0.8);
    // sway (radians) applied as camera deltas; breath-hold on Shift steadies it
    const hold = input?.sprint ? 0.3 : 1; const mv = clamp((p?.speed ?? 0) / 4.4, 0, 1.5);
    const amp = (sp.scopeSway ?? 0.0022) * hold * (1 + mv * 2.5);
    const sx = (Math.sin(t * 0.55) + 0.5 * Math.sin(t * 1.35 + 1.3) + 0.3 * Math.sin(t * 2.9 + 0.4)) * amp;
    const sy = (Math.sin(t * 0.8 + 2.0) + 0.5 * Math.sin(t * 1.9) + 0.3 * Math.sin(t * 3.4 + 0.7)) * amp * 0.8;
    if (p && dt > 0) { const dyaw = sx - S.swayYaw, dpitch = sy - S.swayPitch; p.yaw += dyaw; p.pitch += dpitch; cam.rotation.y += dyaw; cam.rotation.x += dpitch; S.swayYaw = sx; S.swayPitch = sy; }
  } else if (S.swayYaw || S.swayPitch) { if (p) { p.yaw -= S.swayYaw; p.pitch -= S.swayPitch; cam.rotation.y -= S.swayYaw; cam.rotation.x -= S.swayPitch; } S.swayYaw = 0; S.swayPitch = 0; }

  // ---------- moving parts ----------
  for (const ww of S.weapons) {
    ww.boltT += dt; ww.trigT += dt; const pp = ww.parts;
    if (pp.slide) { // pistols: slide cycle + lock-back on empty
      const bt = ww.boltT; const cyc = bt < 0.085 ? pulse(bt / 0.085, 0.3, 0.7) : 0;
      pp.slide.position.z = ww.slideLocked ? (pp.slide.userData.lockBack ?? 0.03) : cyc * (pp.slide.userData.travel ?? 0.032);
    }
    if (pp.bolt && !ww.spec.action) { if (!S.reload || !S.reload.empty || S.reload.w !== ww) { const bt = ww.boltT; pp.bolt.position.z = -0.02 + (bt < 0.075 ? pulse(bt / 0.075, 0.35, 0.65) * 0.05 : 0); } }
    if (pp.trigger) { const tt = pp.slide ? 0.1 : 0.08; pp.trigger.rotation.x = ww.trigT < tt ? pulse(ww.trigT / tt, 0.3, 0.7) * (pp.slide ? 0.4 : 0.35) : 0; }
    ww.cur.ammo = ww.ammo; ww.cur.reserve = ww.reserve;
  }
  // muzzle flash lifetime
  if (S.flashW) { S.flashT += dt; const fl = S.flashW; if (S.flashT >= S.flashLife) { fl.flash.visible = false; S.flashW = null; } else { const k = S.flashT / S.flashLife; fl.flashMat.opacity = k < 0.5 ? 1 : 1 - (k - 0.5) * 2; fl.flash.scale.setScalar(fl.flash.scale.x * (1 + dt * 4)); } }

  // ---------- world FX ----------
  cam.updateMatrixWorld(true);
  S.fx.update(dt, cam); S.grenades.update(dt);
}

export function onResize(ctx) { S && (S.lastFov = -1); }

export function reset(ctx) {
  if (!S) return;
  cancelActions(); S.swap = null; S.cur = 0; S.dead = false;
  S.weapons.forEach((w, i) => { resetWeapon(w); w.group.visible = i === 0; });
  S.adsTarget = 0; S.adsT = 0; S.ads = 0; S.adsOn = false; S.scoped = false; S.scope.rig.visible = false; S.sprint = 0; S.lower = 0; S.rp.set(0, 0, 0); S.rr.set(0, 0, 0); S.rpv.set(0, 0, 0); S.rrv.set(0, 0, 0);
  S.spreadExtra = 0; S.recPitch = 0; S.recYaw = 0; S.swayYaw = 0; S.swayPitch = 0; S.grenadeCount = GRENADES; S.flashW = null; S.wallPull = 0; S.wallTarget = 0;
  S.fx.reset(); S.grenades.reset();
}
