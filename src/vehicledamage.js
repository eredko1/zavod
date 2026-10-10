// Car damage (GTA style): a car you drive has 2500 health; a crash costs 6·(speed lost)² (≤ 400 a hit). The body dents in where it
// hit (the geometry is cloned on the first dent), the headlights or tail lights go out once that end has taken 300, white smoke
// under 40 %, black smoke and fire under 15 %, and at 0 a 4 s fuse, an explosion ('explosion' on the bus: the audio and blast
// damage already listen) and a charred wreck that won't drive, put back as new a minute later once you're away from it.
// Smoke / fire: one pooled sprite set, nothing when no car is hurt. (Engine audio untouched.)
import * as THREE from 'three';
import { carMaterials } from './world/carkit.js';

const HP = 2500, SMOKE_AT = 1000, FIRE_AT = 375, FUSE = 4, WRECK_T = 60, HIT_MAX = 400, LIGHTS_AT = 300;
let POOL = null, CHAR = null, DARK = null;
function pool(scene) {
  if (POOL) return POOL; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c); POOL = [];
  for (let i = 0; i < 40; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 })); s.visible = false; s.userData.t = 1e9; scene.add(s); POOL.push(s); }
  return POOL;
}
function puff(scene, pos, kind) {
  const P = pool(scene), s = P.find((q) => !q.visible) || P[0]; s.visible = true; s.position.copy(pos); s.userData = { t: 0, life: kind === 'fire' ? 0.35 : 2.2, kind, v: new THREE.Vector3((Math.random() - 0.5) * 0.4, kind === 'fire' ? 1.6 : 1.1, (Math.random() - 0.5) * 0.4) };
  s.material.color.set(kind === 'fire' ? 0xff8a2a : kind === 'black' ? 0x1a1a1a : 0xd8d8d8); s.material.blending = kind === 'fire' ? THREE.AdditiveBlending : THREE.NormalBlending; s.scale.setScalar(kind === 'fire' ? 0.9 : 0.6);
}
const ends = (bike) => { const m = bike.group; m.updateMatrixWorld(); return m; };

/** a crash: speed lost in one frame. Returns the damage dealt. */
export function damageHit(C, bike, drop) {
  if (!bike?.spec?.car || bike.wrecked) return 0;
  if (bike.hp == null) bike.hp = HP;
  const dmg = Math.min(HIT_MAX, 6 * drop * drop); bike.hp = Math.max(0, bike.hp - dmg);
  // where it hit: the end that was leading (+x is the front in the car's frame)
  const front = (bike.fwdSpeed ?? bike.speed ?? 0) >= 0; if (front) bike.dmgF = (bike.dmgF || 0) + dmg; else bike.dmgR = (bike.dmgR || 0) + dmg;
  dent(bike, front, Math.min(0.18, drop * 0.012));
  if ((front ? bike.dmgF : bike.dmgR) > LIGHTS_AT) lightsOut(bike, front);
  if (bike.hp <= 0 && bike.fuse == null) { bike.fuse = FUSE; C.hud?.toast?.('It\'s going to blow — get out!', 2200); }
  return dmg;
}
function dent(bike, front, depth) {
  if (depth < 0.01) return; const g = ends(bike), CM = carMaterials();
  const hit = new THREE.Vector3(front ? 2.3 : -2.3, 0.7, (Math.random() - 0.5) * 1.2);   // car frame: the end that hit
  for (const m of bike.meshes || []) {
    if (!m.isMesh || !m.geometry?.attributes?.position?.array || m.material === CM.glass || m.geometry.attributes.position.count > 40000) continue;
    if (!m.userData.dented) { m.userData.origGeo = m.geometry; m.geometry = m.geometry.clone(); m.userData.dented = true; }
    const inv = new THREE.Matrix4().copy(m.matrixWorld).invert(), local = hit.clone().applyMatrix4(g.matrixWorld).applyMatrix4(inv), p = m.geometry.attributes.position, v = new THREE.Vector3(); let touched = false;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const d = v.distanceTo(local); if (d > 0.9) continue; const k = (1 - d / 0.9) * depth; v.x += (front ? -1 : 1) * k; v.y -= k * 0.3; p.setXYZ(i, v.x, v.y, v.z); touched = true; }
    if (touched) { p.needsUpdate = true; m.geometry.computeVertexNormals(); }
  }
}
function lightsOut(bike, front) {
  const CM = carMaterials(); if (!DARK) DARK = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4 });
  for (const m of bike.meshes || []) if (m.material === (front ? CM.lampW : CM.lampR)) { m.userData.lampMat = m.material; m.material = DARK; }
}
function charred(bike) {
  if (!CHAR) CHAR = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95, metalness: 0.2 }); const CM = carMaterials();
  bike.origMat = new Map(); for (const m of bike.meshes || []) { bike.origMat.set(m, m.material); if (m.material !== CM.glass) m.material = CHAR; }
}

/** per frame for every hurt car: smoke, fire, the fuse, the wreck coming back */
export function updateDamage(C, bikes, dt) {
  const scene = C.scene; let any = false;
  for (const b of bikes) {
    if (!b.spec?.car || b.hp == null || b.hp >= SMOKE_AT && b.fuse == null && !b.wrecked) continue; any = true;
    const g = ends(b), hood = new THREE.Vector3(1.6, 1.1, 0).applyMatrix4(g.matrixWorld);
    b.smokeT = (b.smokeT || 0) - dt;
    if (b.smokeT <= 0) { b.smokeT = b.wrecked ? 0.5 : 0.25; puff(scene, hood, b.hp < FIRE_AT ? 'black' : 'white'); if (b.hp < FIRE_AT && !b.wreckDone) puff(scene, hood.clone().add(new THREE.Vector3(0, -0.2, 0)), 'fire'); }
    if (b.fuse != null && !b.wrecked) { b.fuse -= dt; if (b.fuse <= 0) {
      b.wrecked = true; b.wreckT = WRECK_T; b.fuse = null; charred(b); try { C.bus.emit('explosion', { position: b.pos.clone().setY(1), radius: 6 }); } catch {}
      for (let k = 0; k < 6; k++) puff(scene, hood.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2)), 'fire');
      if (C.vehicles?.mounted === b) try { C.vehicles.dismount(); } catch {} } }
    if (b.wrecked) { b.wreckT -= dt; const P = C.player?.position; if (b.wreckT <= 0 && P && Math.hypot(P.x - b.pos.x, P.z - b.pos.z) > 60) restore(b); }
  }
  if (POOL) for (const s of POOL) { if (!s.visible) continue; const u = s.userData; u.t += dt; if (u.t > u.life) { s.visible = false; continue; } const k = u.t / u.life;
    s.position.addScaledVector(u.v, dt); s.scale.setScalar((u.kind === 'fire' ? 0.9 : 0.6) + k * (u.kind === 'fire' ? -0.5 : 2.2)); s.material.opacity = (u.kind === 'fire' ? 0.9 : 0.55) * (1 - k); }
  return any;
}
function restore(b) {
  if (b.origMat) for (const [m, mat] of b.origMat) m.material = mat; b.origMat = null;
  b.hp = null; b.dmgF = b.dmgR = 0; b.wrecked = false; b.fuse = null; b.smokeT = 0;
  for (const m of b.meshes || []) { if (m.userData.lampMat) { m.material = m.userData.lampMat; m.userData.lampMat = null; } if (m.userData.origGeo) { m.geometry.dispose(); m.geometry = m.userData.origGeo; m.userData.origGeo = null; m.userData.dented = false; } }   // as new: lamps, body
}
export const isWrecked = (b) => !!b?.wrecked;
