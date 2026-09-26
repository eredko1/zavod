// CONEY jobs — GTA-style side work from IGOR at Table Park, one at a time, local to each player:
//  · DELIVERY  — run a package across Coney before the clock runs out (the further, the better it pays)
//  · COLLECT   — a named debtor is out walking somewhere; find him, shake him down (F with a weapon out) or drop him
//  · CHOP SHOP — steal any car and bring it to the guys under the el; stealing it brings the cops, that's on you
// A gold light beam marks the drop in the world; the map / minimap show a gold diamond (W.mapJob). CONEY agent (jobs).
import * as THREE from 'three';
import { hangkit as K } from '../hangkit.js';
import { spawnPerson, crewsAlive } from './chill.js';

let J = null;
const DEBTORS = ['LENNY', 'FAT ARTIE', 'VADIK', 'SAL THE BARBER', 'KOSTYA BIS', 'TOMMY TWO-PHONES'];

export function buildJobs(world) {
  const { ctx, W, scene } = world;
  // the beam: an additive column + a ground ring, hidden until a job needs it
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffc830, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Group(); beam.name = 'jobBeam'; beam.visible = false; scene.add(beam);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 60, 20, 1, true), beamMat); col.position.y = 30; beam.add(col);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 32), beamMat.clone()); ring.material.opacity = 0.7; ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; beam.add(ring);
  const hud = document.createElement('div'); hud.className = 'hkui'; document.body.appendChild(hud);
  hud.style.cssText = 'position:fixed;left:50%;top:92px;transform:translateX(-50%);z-index:44;background:rgba(8,10,14,.72);border-left:3px solid #ffc830;color:#f2e6c4;font:600 14px Barlow,Arial;padding:6px 12px;letter-spacing:.04em;display:none;pointer-events:none;white-space:nowrap';
  J = { world, ctx, W, beam, ring, hud, job: null, done: 0 };
  W.mapJob = () => J.job && J.job.at && [J.job.at.x, J.job.at.z, J.job.label];
  K.onUpdate((dt, playing) => update(dt, playing));
  ctx.bus.on('playerDied', () => { if (J.job) fail('You went down. The job\'s off.'); });
  ctx.bus.on('worldReset', () => { if (J.job) clear(); });
  if (typeof window !== 'undefined' && window.__game) window.__game.jobs = { state: () => J.job && { kind: J.job.kind, t: +J.job.t.toFixed(1), at: J.job.at?.toArray(), label: J.job.label }, start: (k) => start(k), done: () => J.done, finish: () => { if (J.job) complete(); } };
  return J;
}

/** ARKASHA's ice run («Бурбон, братва, Гудзон»): Sammy's for a bag of ice, then back to the card table before it melts */
export function startIce(deliDoor, arkPos) {
  if (!J || J.job) return false;
  J.job = { kind: 'ice', stage: 0, at: deliDoor.clone(), home: arkPos.clone(), t: 240, pay: 10, label: 'Ice for Arkasha: Sammy\'s on W 8th' };
  arm(); return true;
}
export function finishIce() { if (J?.job?.kind === 'ice') { complete(' — «Получай свой Wunderbar!»'); return true; } return false; }
/** IGOR's dialog branch */
export function jobsTalk() {
  if (!J) return { text: 'IGOR: "No work today."', choices: [{ label: 'OK', go: null }] };
  if (J.job) return { text: `IGOR: "You already have job. ${J.job.label}. Go, go — clock is ticking."`, choices: [{ label: 'Drop it', go: () => { fail('Igor shrugs. "Your loss."'); return null; } }, { label: 'On it', go: null }] };
  return {
    text: 'IGOR: "Work? Sure, I have work. Nothing crazy. Mostly nothing crazy."',
    choices: [
      { label: 'Delivery — run a package', go: () => ({ text: start('deliver'), choices: [{ label: 'Say less', go: null }] }) },
      { label: 'Collect a debt', go: () => ({ text: start('collect'), choices: [{ label: 'I\'ll find him', go: null }] }) },
      { label: 'Chop shop — bring a car', go: () => ({ text: start('chop'), choices: [{ label: 'Easy money', go: null }] }) },
      { label: 'Not now', go: null },
    ],
  };
}

function farPoint(min, max) {   // a walkable point min..max m away, near a named place if we can
  const { ctx, W } = J; const me = ctx.player.position, nav = ctx.ai?.nav;
  const pois = (W.mapPOIs || []).filter((q) => { if (/BELT|JFK/i.test(q.name)) return false; const d = Math.hypot(q.x - me.x, q.z - me.z); return d > min && d < max; });
  for (let k = 0; k < 20; k++) {
    let x, z, name = null;
    if (pois.length && k < 12) { const q = pois[Math.floor(Math.random() * pois.length)]; x = q.x + (Math.random() - 0.5) * 16; z = q.z + (Math.random() - 0.5) * 16; name = q.name; }
    else { const a = Math.random() * Math.PI * 2, r = min + Math.random() * (max - min); x = me.x + Math.cos(a) * r; z = me.z + Math.sin(a) * r; }
    const q = nav?.nearestFree?.(x, z, 8, 0); if (q && Math.abs(q.y) < 1.5 && !(W.chaseNoGo?.(q.x, q.z, q.y))) return { at: new THREE.Vector3(q.x, q.y, q.z), name };
  }
  return null;
}
function start(kind) {
  const { ctx } = J; const me = ctx.player.position;
  if (kind === 'deliver') {
    const p = farPoint(120, 420); if (!p) return 'IGOR: "Hm. Nobody home today. Ask me later."';
    const d = Math.hypot(p.at.x - me.x, p.at.z - me.z), pay = 20 + Math.round(d / 10 / 5) * 5;
    J.job = { kind, at: p.at, t: Math.round(d / 3.2 + 35), pay, label: `Deliver to ${p.name ? titled(p.name) : 'the drop'}` };
    arm(); return `IGOR: "This bag goes to my friend by ${p.name ? titled(p.name) : 'the marker'}. Don't open it. Don't smell it. ${J.job.t} seconds, $${pay}. Take a bike, you're slow."`;
  }
  if (kind === 'collect') {
    const p = farPoint(90, 300); if (!p) return 'IGOR: "Everybody paid me already. Is a miracle."';
    const name = DEBTORS[Math.floor(Math.random() * DEBTORS.length)], cash = 45 + Math.floor(Math.random() * 4) * 5;
    const t = spawnPerson(p.at, name, cash); if (!t) return 'IGOR: "Forget it, he left town."';
    J.job = { kind, who: t, at: t.pos, t: 240, pay: 15, label: `Collect from ${name}` };
    arm(); return `IGOR: "${name} owes me $${cash}. He walks around ${p.name ? titled(p.name) : 'there'} like he owns it. Get the money — you keep it, I get respect. Plus fifteen from me."`;
  }
  if (kind === 'chop') {
    const base = J.W.stillwell?.concourse || null;   // out on Stillwell Ave, west of the terminal
    let at = null; const nav = ctx.ai?.nav;
    if (base) { const q = nav?.nearestFree?.(base.x - 44, base.z + 14, 14, 0); if (q) at = new THREE.Vector3(q.x, q.y, q.z); }
    if (!at) { const p = farPoint(100, 300); at = p?.at; } if (!at) return 'IGOR: "Garage is closed. Cops everywhere."';
    J.job = { kind, at, t: 300, pay: 70, label: 'Chop shop: bring a car' };
    arm(); return 'IGOR: "My cousins under the el on Stillwell need a car. Any car. Not yours — you don\'t have one. $70. Cops will be upset, so drive like you mean it."';
  }
  return 'IGOR: "What?"';
}
const titled = (s) => s.toLowerCase().replace(/(^|[\s·–-])\S/g, (m) => m.toUpperCase()).replace(/\bNy\b/, 'NY');
function arm() { J.beam.visible = true; J.beam.position.copy(J.job.at); J.hud.style.display = 'block'; try { J.ctx.audio?.play?.('ui_click'); } catch {} }
function clear() { J.job = null; J.beam.visible = false; J.hud.style.display = 'none'; }
function fail(msg) { K.toast(`JOB FAILED — ${msg}`, 3000); clear(); }
function complete(extra = '') {
  const j = J.job; if (!j) return; K.earn(j.pay); J.done++;
  K.toast(`JOB DONE — +$${j.pay}${extra}`, 3200); try { J.ctx.audio?.play?.('kill'); } catch {} clear();
}
function update(dt, playing) {
  const j = J?.job; if (!j) return;
  if (playing) j.t -= dt;
  const me = J.ctx.player.position, d = Math.hypot(j.at.x - me.x, j.at.z - me.z);
  J.ring.rotation.z += dt * 0.8; J.beam.position.copy(j.at);
  const mm = Math.max(0, Math.floor(j.t / 60)), ss = Math.max(0, Math.floor(j.t % 60)).toString().padStart(2, '0');
  J.hud.textContent = `JOB · ${j.label} · ${Math.round(d)} m · ${mm}:${ss}`;
  if (j.t <= 0) return fail(j.kind === 'deliver' ? 'too slow. Igor\'s friend ate the sandwich himself.' : j.kind === 'collect' ? `${j.label.replace('Collect from ', '')} got away.` : 'the chop shop closed up.');
  if (j.kind === 'ice') {   // stage 0: get the ice at Sammy's · stage 1: race it back (it melts in ~2 min)
    if (j.stage === 0 && K.has('ice')) { j.stage = 1; j.at = j.home.clone(); j.label = 'Bring the ice to Arkasha — it\'s melting!'; J.beam.position.copy(j.at); K.toast('Лёд есть. Бегом к Аркаше — тает!', 2200); }
    else if (j.stage === 1 && !K.has('ice')) return fail('the ice melted. «Весь растаял. Я за новым.»');
    return;
  }
  if (j.kind === 'deliver' && d < 3.5 && Math.abs(j.at.y - me.y) < 3) complete(' — "Tell Igor we\'re square."');
  else if (j.kind === 'collect') {
    const t = j.who; if (!crewsAlive(t) && t.cash > 0 && t.st !== 'dead') return fail('he slipped away.');
    if (t.st === 'dead' || t.cash === 0) complete(t.st === 'dead' ? ' (his cash is on the ground — grab it)' : '');
  } else if (j.kind === 'chop') {
    const v = J.ctx.vehicles?.mounted;
    if (v?.spec?.car && d < 7) { complete(' — "Nice ride. Was."'); try { J.ctx.vehicles.dismount?.(); } catch {} }
  }
}
