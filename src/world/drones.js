// Killer drones: use one from the bag (Gear) and it lifts off beside you, hunts the nearest bad guy within 60 m — mercenaries,
// cops, and street crews that are after you or fighting — hovers over them and fires short bursts. When the battery is nearly
// flat (45 s) it dives into its target and explodes. Passers-by and friends are never targets. Owned by: main.
import * as THREE from 'three';

const LIFE = 45, SPEED = 11, RANGE = 60, SHOT_DMG = 10, FIRE_EVERY = 0.6, BLAST_R = 4, BLAST_DMG = 80;   // tuned down: a helper, not a win button
const D = [];
let bound = false;

export function launchDrone(ctx) {
  if (!bound) { bound = true; ctx.world?.updaters?.push?.((dt) => update(dt, ctx)); ctx.bus.on('worldReset', () => { for (const d of D.splice(0)) kill(d, ctx, false); }); }
  if (D.length) { ctx.hud?.toast?.('One drone at a time: yours is still up', 1600); return false; }
  const p = ctx.player.position, g = model(); g.position.set(p.x + 0.8, p.y + 1.6, p.z + 0.8); ctx.scene.add(g);
  D.push({ g, t: 0, fire: 0, target: null, dive: false, rotors: g.userData.rotors, look: 0 });
  ctx.hud?.toast?.('Drone up for 45 s. It hunts the nearest bad guy.', 1800); return true;
}

function model() {
  const g = new THREE.Group(), dark = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.5, metalness: 0.4 }), red = new THREE.MeshBasicMaterial({ color: 0xff2a1a }), blade = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.55 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.28), dark));
  const rotors = [];
  for (const [x, z] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.025, 0.03), dark); arm.position.set(x / 2, 0, z / 2); arm.rotation.y = Math.atan2(z, -x); g.add(arm);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.01, 16), blade); r.position.set(x, 0.05, z); g.add(r); rotors.push(r); }
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), red); eye.position.set(0, -0.03, -0.15); g.add(eye);
  const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 8), dark); gun.rotation.x = Math.PI / 2; gun.position.set(0, -0.06, -0.12); g.add(gun);
  g.userData.rotors = rotors; g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); return g;
}

const _t = new THREE.Vector3(), _d = new THREE.Vector3();
/** bad guys: live AI soldiers (mercs / cops) and chill crews that are coming for you or fighting (never passers-by, never players) */
function targets(ctx) {
  const out = [];
  for (const s of ctx.ai?.soldiers || []) if (s && !s.dead && s.position) out.push({ pos: s.position, hit: (dmg, at) => { try { ctx.ai.damage(s, dmg, at); } catch {} } });
  for (const h of ctx.raycastTargets || []) { const t = h?.userData?.thug; if (!t || t.dead || t.down || !h.parent || t.intent === 'mark' || t.st === 'flee') continue; if (out.some((o) => o.thug === t)) continue;
    out.push({ thug: t, pos: h.getWorldPosition(new THREE.Vector3()), hit: (dmg, at) => { try { h.userData.onHit(dmg, false, at, null); } catch {} } }); }
  return out;
}
function update(dt, ctx) {
  if (!D.length || ctx.state !== 'playing') return;
  const list = D.length ? targets(ctx) : [];
  for (const d of D.slice()) {
    d.t += dt; for (const r of d.rotors) r.rotation.y += dt * 60;
    const g = d.g; if (d.t > LIFE) { kill(d, ctx, true); continue; }
    // pick / keep the nearest target in range
    let best = null, bd = RANGE; for (const o of list) { const k = o.pos.distanceTo(g.position); if (k < bd) { bd = k; best = o; } }
    d.target = best;
    const diving = d.t > LIFE - 8 && best;
    if (best) _t.copy(best.pos).setY(best.pos.y + (diving ? 0.9 : 4.2)); else { const p = ctx.player.position; _t.set(p.x + Math.cos(d.t) * 2, p.y + 3, p.z + Math.sin(d.t) * 2); }
    if (best && !diving) { _t.x += Math.cos(d.t * 0.9) * 3; _t.z += Math.sin(d.t * 0.9) * 3; }   // orbit over the target
    _d.subVectors(_t, g.position); const dist = _d.length(); const sp = diving ? SPEED * 1.8 : SPEED;
    if (dist > 0.05) g.position.addScaledVector(_d.normalize(), Math.min(dist, sp * dt));
    if (best) { g.lookAt(best.pos.x, g.position.y, best.pos.z); g.rotation.x = -0.25; }
    if (diving && best && g.position.distanceTo(best.pos) < 1.6) { kill(d, ctx, true); continue; }
    d.fire -= dt; if (best && !diving && d.fire <= 0 && bd < 30) { d.fire = FIRE_EVERY;
      const at = best.pos.clone().setY(best.pos.y + 1.1); best.hit(SHOT_DMG, at); tracer(ctx, g.position, at);
      try { ctx.audio?.play?.('shot_smg', { position: g.position, volume: 0.35 }); } catch {} }
  }
}
function tracer(ctx, a, b) {
  const geo = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]), m = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 }));
  ctx.scene.add(m); setTimeout(() => { ctx.scene.remove(m); geo.dispose(); }, 70);
}
function kill(d, ctx, boom) {
  const i = D.indexOf(d); if (i > -1) D.splice(i, 1); ctx.scene.remove(d.g);
  if (!boom) return; const pos = d.g.position.clone();
  for (const o of targets(ctx)) { const k = o.pos.distanceTo(pos); if (k < BLAST_R) o.hit(Math.round(BLAST_DMG * (1 - k / BLAST_R)), o.pos.clone().setY(o.pos.y + 1)); }
  ctx.bus.emit('explosion', { position: pos, radius: BLAST_R });
}
