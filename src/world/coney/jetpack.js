// Jet packs by Arkasha's table: F to strap one on, hold Space (touch: JUMP) to fly, WASD steers at full air control, fuel
// burns while you thrust and refills on the ground. X takes it off (it goes back on the rack). Death / world reset drop it.
// Physics: sets ctx.player.jet { on, thrust } — player.js adds thrust and full air control. Owned by: CONEY.
import * as THREE from 'three';
import { hangkit as K } from '../hangkit.js';

const THRUST = 34, BURN = 14, REFILL = 9, RACK = [[-4.8, 3.6], [-4.8, 4.6], [-4.8, 5.6]];
let J = null;

export function buildJetpacks(world) {
  const { ctx, W } = world; const T = W.arkadyTable; if (!T) return;
  J = { ctx, packs: [], worn: null, fuel: 100, bar: null };
  const yaw = Math.atan2(T.seat.x - T.pos.x, T.seat.z - T.pos.z), up = new THREE.Vector3(0, 1, 0);
  for (const [lx, lz] of RACK) {
    const pos = new THREE.Vector3(lx, 0, lz).applyAxisAngle(up, yaw).add(T.pos).setY(0);
    const g = model(); g.position.copy(pos).setY(0.02); g.rotation.y = yaw; world.scene.add(g);
    const pk = { g, pos, home: pos.clone() }; J.packs.push(pk);
    K.spot({ pos, r: 1.8, when: () => !J.worn && pk.g.visible, prompt: 'F — STRAP ON THE JET PACK', act: () => wear(pk) });
  }
  const bar = document.createElement('div'); bar.style.cssText = 'position:fixed;left:50%;bottom:150px;transform:translateX(-50%);width:160px;height:8px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.3);z-index:41;display:none;pointer-events:none';
  bar.innerHTML = '<i style="display:block;height:100%;width:100%;background:#ffb24a"></i><small style="position:absolute;left:0;right:0;top:-18px;text-align:center;font:700 11px Barlow Condensed,Arial;letter-spacing:.14em;color:#fff;text-shadow:0 1px 2px #000">JET PACK · SPACE · X OFF</small>'; document.body.appendChild(bar); J.bar = bar;
  addEventListener('keydown', (e) => { if (e.code === 'KeyX' && J.worn && ctx.state === 'playing') takeOff(); });
  ctx.bus.on('playerDied', () => { if (J.worn) takeOff(); });
  ctx.bus.on('worldReset', () => { if (J.worn) takeOff(); for (const p of J.packs) { p.g.visible = true; p.g.position.copy(p.home).setY(0.02); } });
  K.onUpdate((dt, playing) => update(dt, playing));
  if (window.__game) window.__game.jetpack = { state: () => ({ worn: !!J.worn, fuel: Math.round(J.fuel), y: +ctx.player.position.y.toFixed(2) }), wear: () => wear(J.packs[0]), off: takeOff };
}

function model() {
  const g = new THREE.Group(), steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.9, roughness: 0.3 }), dark = new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.6 }), red = new THREE.MeshStandardMaterial({ color: 0xb01818, roughness: 0.4, metalness: 0.4 });
  for (const s of [-0.13, 0.13]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.62, 16), steel); t.position.set(s, 0.62, 0); g.add(t); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), red); cap.position.set(s, 0.93, 0); g.add(cap); const n = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.14, 12, 1, true), dark); n.position.set(s, 0.24, 0); n.rotation.x = Math.PI; g.add(n); }
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.14), dark); pack.position.set(0, 0.62, 0.12); g.add(pack);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); return g;
}
function wear(pk) { if (J.worn) return; J.worn = pk; pk.g.visible = false; J.fuel = Math.max(J.fuel, 60); J.bar.style.display = 'block'; J.ctx.hud?.toast?.('Jet pack on. Hold SPACE to fly · X to take it off', 2400); }
function takeOff() { const pk = J.worn; if (!pk) return; J.worn = null; J.ctx.player.jet = null; J.bar.style.display = 'none'; pk.g.visible = true; pk.g.position.copy(pk.home).setY(0.02); }
function update(dt, playing) {
  if (!J.worn) return; const p = J.ctx.player, inp = J.ctx.input;
  const hold = playing && !p.mounted && (inp?.keys?.has?.('Space') || false);
  const thrust = hold && J.fuel > 0 ? THRUST : 0;
  J.fuel = Math.max(0, Math.min(100, J.fuel + (thrust ? -BURN : p.onGround ? REFILL : 0) * dt));
  p.jet = { on: true, thrust };
  if (thrust && Math.random() < dt * 14) try { K.puff?.(p.position.clone().setY(p.position.y + 0.3)); } catch {}
  const i = J.bar.firstChild; i.style.width = `${J.fuel | 0}%`; i.style.background = J.fuel < 20 ? '#ff5a3a' : '#ffb24a';
}
