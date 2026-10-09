// CONEY street events (chill): the block has its own life, not everything happens to you. Every 45-90 s (phones 90-150 s) one is
// staged 35-80 m away, out of sight, on a sidewalk, so you walk into it:
//  · a mugging: one local sticking up another; knock the mugger down and the victim thanks you (no money changes hands here);
//  · an arrest: two cops and a guy with his hands up, then they walk him off;
//  · a street fight: two locals trading swings, four people watching in a ring;
//  · the ice-cream truck parked up with kids round it;
//  · an ambulance: within 90 s of a body, lights going, two medics by it.
// People are Rocketbox figures (people.js), removed when the event ends or you're far off. CONEY agent.
import * as THREE from 'three';
import { buildPerson, peopleReady } from '../people.js';
import { hangkit as K } from '../hangkit.js';

const pick = (a) => a[(Math.random() * a.length) | 0];
let E = null;

export function buildEvents(world) {
  const { ctx, W, scene } = world; if (ctx.mode !== 'chill' || !peopleReady()) return null; const lite = !!ctx.lite;
  E = { world, t: lite ? 70 : 40, live: [], bodies: [], ambT: 0 };
  ctx.bus.on('npcHurt', (d) => { if (d?.dead && d.position) E.bodies.push({ p: d.position.clone(), at: performance.now() }); });
  const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4();
  const outOfSight = (x, z) => { const cam = ctx.camera; _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm); return !_fr.containsPoint(new THREE.Vector3(x, 1, z)); };
  const spot = (dmin = 35, dmax = 80) => { const P = ctx.player.position, L = (W.folkSpotsList || []).filter((s) => s.zone === 'town' && !s.gone); for (let k = 0; k < 60; k++) { const s = pick(L); if (!s) break; const d = Math.hypot(s.x - P.x, s.z - P.z); if (d > dmin && d < dmax && outOfSight(s.x, s.z)) return s; } return null; };
  const fig = (o = {}) => { const f = buildPerson({ seed: (Math.random() * 997) | 0, ...o }); if (!f) return null; scene.add(f.group); return f; };
  const place = (f, x, z, yaw) => { f.group.position.set(x, 0, z); f.group.rotation.y = yaw; };
  const bubble = (f, text) => { try { K.say?.(f, text); } catch {} ctx.hud?.toast?.(text, 2200); };
  const hitbox = (f, onHit) => { const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.75, 8), new THREE.MeshBasicMaterial({ visible: false })); hb.position.y = 0.88; hb.userData.onHit = onHit; hb.userData.surface = 'flesh'; f.group.add(hb); ctx.raycastTargets.push(hb); f.hb = hb; };
  const cleanup = (ev) => { for (const f of ev.figs) { scene.remove(f.group); if (f.hb) { const i = ctx.raycastTargets.indexOf(f.hb); if (i > -1) ctx.raycastTargets.splice(i, 1); } } for (const o of ev.props || []) scene.remove(o); };
  const near = (ev) => Math.hypot(ev.x - ctx.player.position.x, ev.z - ctx.player.position.z);

  const KINDS = {
    mugging(s) { const a = fig(), v = fig(); if (!a || !v) return null; const yaw = Math.random() * 6.28, fx = Math.sin(yaw), fz = Math.cos(yaw);
      place(v, s.x, s.z, yaw + Math.PI); place(a, s.x - fx * 1.3, s.z - fz * 1.3, yaw); a.guard = true; v.hands = true;
      const ev = { kind: 'mugging', x: s.x, z: s.z, figs: [a, v], t: 0, down: false };
      hitbox(a, () => { if (ev.down) return; ev.down = true; a.guard = false; a.group.rotation.x = -1.3; a.group.position.y = 0.1; v.hands = false; ev.t = Math.max(ev.t, 12); bubble(v, pick(['Thank you, thank you!', 'Спасибо, сынок!', 'Yo, I owe you one!'])); try { ctx.bus.emit('streetCrime', { kind: 'hit', pos: a.group.position.clone(), name: 'MUGGER' }); } catch {} });
      ev.step = (dt) => { ev.t += dt; if (!ev.down && ev.t > 9 && ev.t < 9.1) bubble(v, pick(['OK OK, take it!', 'Возьми, возьми, только не бей!'])); if (!ev.down && ev.t > 10) { v.hands = false; a.guard = false; const d = dt * 1.6; a.group.position.x -= fx * d; a.group.position.z -= fz * d; a.group.rotation.y = yaw + Math.PI; a.update(dt, 1.6); } else a.update(dt, 0); v.update(dt, 0); return ev.t < 26; };
      return ev; },
    arrest(s) { const p = fig(), c1 = fig({ avatar: undefined }), c2 = fig(); if (!p || !c1 || !c2) return null; const yaw = Math.random() * 6.28, fx = Math.sin(yaw), fz = Math.cos(yaw);
      place(p, s.x, s.z, yaw); place(c1, s.x - fx * 1.4 + fz * 0.6, s.z - fz * 1.4 - fx * 0.6, yaw); place(c2, s.x - fx * 1.4 - fz * 0.8, s.z - fz * 1.4 + fx * 0.8, yaw); p.hands = true; c1.guard = true;
      for (const c of [c1, c2]) c.group.traverse((o) => { if (o.isSkinnedMesh && o.material?.color) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.35).add(new THREE.Color(0x0b1e4a)); } });   // NYPD navy
      const ev = { kind: 'arrest', x: s.x, z: s.z, figs: [p, c1, c2], t: 0 };
      ev.step = (dt) => { ev.t += dt; const walk = ev.t > 14; for (const f of ev.figs) { if (walk) { f.group.position.x += fz * dt * 1.2; f.group.position.z -= fx * dt * 1.2; f.group.rotation.y = yaw + Math.PI / 2; } f.update(dt, walk ? 1.2 : 0); } if (walk) { p.hands = false; c1.guard = false; } return ev.t < 34; };
      return ev; },
    fight(s) { const a = fig(), b = fig(); if (!a || !b) return null; const yaw = Math.random() * 6.28, fx = Math.sin(yaw), fz = Math.cos(yaw), ring = [];
      place(a, s.x + fx * 0.8, s.z + fz * 0.8, yaw + Math.PI); place(b, s.x - fx * 0.8, s.z - fz * 0.8, yaw); a.guard = b.guard = true;
      for (let k = 0; k < (lite ? 2 : 4); k++) { const w = fig(); if (!w) break; const ang = k / 4 * 6.28 + 0.4; place(w, s.x + Math.cos(ang) * 3.4, s.z + Math.sin(ang) * 3.4, Math.atan2(-Math.cos(ang), -Math.sin(ang))); ring.push(w); }
      const ev = { kind: 'fight', x: s.x, z: s.z, figs: [a, b, ...ring], t: 0, swing: 0, n: 3 + ((Math.random() * 3) | 0) };
      ev.step = (dt) => { ev.t += dt; ev.swing -= dt; if (ev.n > 0 && ev.swing <= 0) { ev.swing = 0.9 + Math.random() * 0.6; const [x, y] = ev.n % 2 ? [a, b] : [b, a]; x.play?.('punch'); setTimeout(() => y.play?.('hit'), 200); ev.n--; if (!ev.n) { const loser = Math.random() < 0.5 ? a : b; loser.guard = false; loser.group.rotation.x = -1.3; loser.group.position.y = 0.1; ev.tEnd = ev.t; } }
        for (const f of ev.figs) f.update(dt, 0); return !ev.tEnd || ev.t - ev.tEnd < 14; };
      return ev; },
    icecream(s) { const truck = iceTruck(); truck.position.set(s.x, 0, s.z); truck.rotation.y = Math.random() * 6.28; scene.add(truck); const kids = [];
      for (let k = 0; k < (lite ? 2 : 3); k++) { const f = fig(); if (!f) break; f.group.scale.setScalar(0.66); const a = truck.rotation.y + Math.PI / 2; place(f, s.x + Math.sin(a) * 2.2 + (k - 1) * 0.8, s.z + Math.cos(a) * 2.2, a + Math.PI); kids.push(f); }
      const ev = { kind: 'icecream', x: s.x, z: s.z, figs: kids, props: [truck], t: 0 }; ev.step = (dt) => { ev.t += dt; for (const f of kids) f.update(dt, 0); return ev.t < 40; }; return ev; },
    ambulance(body) { const amb = ambulance(), yaw = Math.random() * 6.28; amb.position.set(body.p.x + Math.sin(yaw) * 5, 0, body.p.z + Math.cos(yaw) * 5); amb.rotation.y = yaw + Math.PI / 2; scene.add(amb); const medics = [];
      for (let k = 0; k < 2; k++) { const f = fig(); if (!f) break; f.group.traverse((o) => { if (o.isSkinnedMesh && o.material?.color) { o.material = o.material.clone(); o.material.color.lerp(new THREE.Color(0xe8eef2), 0.6); } }); place(f, body.p.x + (k ? 0.9 : -0.9), body.p.z + 0.6, Math.PI); medics.push(f); }
      const ev = { kind: 'ambulance', x: body.p.x, z: body.p.z, figs: medics, props: [amb], t: 0 }; ev.step = (dt) => { ev.t += dt; amb.userData.bar.material.emissiveIntensity = Math.floor(ev.t * 4) % 2 ? 3 : 0.2; for (const f of medics) f.update(dt, 0); return ev.t < 30; }; return ev; },
  };
  function iceTruck() { const g = new THREE.Group(), m = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }); const b = (w, h, d, x, y, z, c) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m(c)); o.position.set(x, y, z); o.castShadow = !lite; g.add(o); };
    b(2.2, 2.4, 4.2, 0, 1.6, -0.6, 0xf4f4f0); b(2.1, 1.6, 1.6, 0, 1.2, 2.2, 0xf4f4f0); b(2.24, 0.4, 4.24, 0, 1.0, -0.6, 0xe0508a); b(2.24, 0.25, 4.24, 0, 2.6, -0.6, 0x3a8ad8); b(0.1, 1.0, 1.6, 1.12, 1.6, -0.6, 0x1a2a3a);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 10), m(0xd8a050)); cone.rotation.x = Math.PI; cone.position.set(0, 3.3, -1.2); g.add(cone); const sc = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), m(0xf8e8f0)); sc.position.set(0, 3.85, -1.2); g.add(sc);
    for (const [x, z] of [[-1, 1.6], [1, 1.6], [-1, -2], [1, -2]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), m(0x151515)); w.rotation.z = Math.PI / 2; w.position.set(x, 0.42, z); g.add(w); } return g; }
  function ambulance() { const g = new THREE.Group(), m = (c, e) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, emissive: e || 0, emissiveIntensity: e ? 1 : 0 }); const b = (w, h, d, x, y, z, mat) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); o.position.set(x, y, z); o.castShadow = !lite; g.add(o); return o; };
    b(2.3, 2.6, 4.0, 0, 1.7, -0.8, m(0xf4f4f0)); b(2.2, 1.7, 1.8, 0, 1.3, 2.1, m(0xf4f4f0)); b(2.32, 0.35, 5.9, 0, 1.3, 0.1, m(0xd8201e)); b(2.1, 0.8, 0.05, 0, 1.75, 3.0, m(0x1d2733));
    g.userData.bar = b(1.6, 0.18, 0.4, 0, 3.08, 1.6, m(0xff2a2a, 0xff2a2a));
    for (const [x, z] of [[-1, 1.8], [1, 1.8], [-1, -2.2], [1, -2.2]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 12), m(0x151515)); w.rotation.z = Math.PI / 2; w.position.set(x, 0.45, z); g.add(w); } return g; }

  world.updaters.push((dt) => {
    if (!E || ctx.state !== 'playing' || !ctx.player) return;
    for (const ev of E.live.slice()) { let keep = false; try { keep = ev.step(dt); } catch (e) { console.warn('[events]', e); } if (!keep || near(ev) > 140) { cleanup(ev); E.live.splice(E.live.indexOf(ev), 1); } }
    // the ambulance: for a body that's been down a little while
    const now = performance.now(); E.bodies = E.bodies.filter((b) => now - b.at < 90000);
    E.ambT -= dt; if (E.ambT <= 0 && E.bodies.length && !E.live.some((q) => q.kind === 'ambulance')) { const b = E.bodies.find((q) => now - q.at > 12000 && Math.hypot(q.p.x - ctx.player.position.x, q.p.z - ctx.player.position.z) < 120); if (b) { const ev = KINDS.ambulance(b); if (ev) { E.live.push(ev); E.bodies.splice(E.bodies.indexOf(b), 1); E.ambT = 60; } } }
    E.t -= dt; if (E.t > 0 || E.live.length >= (lite ? 1 : 2)) return; E.t = lite ? 90 + Math.random() * 60 : 45 + Math.random() * 45;
    const s = spot(); if (!s) return; const kind = pick(['mugging', 'arrest', 'fight', 'icecream', 'mugging', 'fight']);
    try { const ev = KINDS[kind](s); if (ev) E.live.push(ev); } catch (e) { console.warn('[events]', kind, e); }
  });
  if (typeof window !== 'undefined' && window.__game) window.__game.events = { live: () => E.live.map((q) => ({ kind: q.kind, x: Math.round(q.x), z: Math.round(q.z) })), force: (kind) => { const s = spot(5, 60) || { x: ctx.player.position.x + 8, z: ctx.player.position.z }; const ev = KINDS[kind]?.(kind === 'ambulance' ? { p: new THREE.Vector3(s.x, 0, s.z) } : s); if (ev) E.live.push(ev); return !!ev; } };
  return E;
}
