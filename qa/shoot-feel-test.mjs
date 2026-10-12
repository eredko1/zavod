#!/usr/bin/env node
// Shooting feel: click-to-flash latency, per-weapon recoil kick + recovery, spread/ADS, hit + kill markers, NPC flinch / death,
// shots to kill a thug and a cop, NPC reactions, impact FX + decal pool cap, screen shake, touch aim assist, phone firefight cost.
// node qa/shoot-feel-test.mjs   (PORT=8849 for qa/serve.py 8849). Prints a JSON summary line ("feel") used for the PR table.
import { chromium } from 'playwright-core';
const PORT = process.env.PORT || 8790;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const feel = {};
const boot = async (extra = '') => {
  const pg = await browser.newPage({ viewport: { width: 960, height: 540 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
  await pg.goto(`http://localhost:${PORT}/?qa=1&map=coney&mode=chill&time=day${extra}`, { timeout: 150000 });
  await pg.waitForFunction(() => window.__game?.ready && window.__game.crews, null, { timeout: 150000 });
  await pg.evaluate(() => {
    window.__game.setState('playing'); const s = window.__ctx.world.onlineStart; window.__game.teleport(s[0] + 40, 0, s[2], 0, 0); window.__game.crews.calm(1e9);
    const c = window.__ctx; c.input.locked = true; c.weapons.qaLoadout('m4a1', 'm9'); c.weapons.lock(0, false); c.weapons.lock(1, false);
    // helpers shared by the steps below
    window.__qa = {
      frames: (n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }),
      aimAt: (x, y, z) => { const p = c.player, e = c.camera.position; const dx = x - e.x, dy = y - e.y, dz = z - e.z; p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz)); },
      thugObj: (id) => c.raycastTargets.find((h) => h.userData.thug?.id === id)?.userData.thug,
      hm: () => { const el = document.querySelector('#hud .hm'); return { anim: el ? el.getAnimations().length : 0, kill: !!el?.classList.contains('kill') }; },
    };
  });
  await pg.waitForTimeout(1200);
  return { pg, errs };
};

try {
  const { pg, errs } = await boot();
  // ---------- 1) click → feedback latency (a real mousedown; fire must land on the next simulated frame with the flash up)
  const lat = await pg.evaluate(async () => {
    const c = window.__ctx, S = c.weapons.state; await window.__qa.frames(30);
    const f0 = S.fired; let downFrame = -1, t0 = 0;
    addEventListener('mousedown', () => { downFrame = c.time.frame; t0 = performance.now(); }, { once: true, capture: true });
    dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    for (let i = 0; i < 10; i++) { await window.__qa.frames(1); if (S.fired > f0) { const out = { frames: c.time.frame - downFrame, ms: +(performance.now() - t0).toFixed(1), flash: !!S.flashW && S.flashW.flash.visible, light: S.fx.muzzleLight.intensity > 0 }; dispatchEvent(new MouseEvent('mouseup', { button: 0 })); return out; } }
    dispatchEvent(new MouseEvent('mouseup', { button: 0 })); return { frames: 99 };
  });
  feel.latency = lat; ok(lat.frames <= 1 && lat.flash, 'feedback on the click frame (shot + muzzle flash on the next frame)', JSON.stringify(lat));

  // ---------- 2) recoil per weapon: camera kick (deg), time for the recoverable part to settle (90%), viewmodel spring settle
  const rec = await pg.evaluate(async () => {
    const c = window.__ctx, W = c.weapons, S = W.state, p = c.player, out = {};
    for (const [pri, sec, slot] of [['m4a1', 'm9', 0], ['ak74', 'm9', 0], ['mp5', 'm9', 0], ['r870', 'm9', 0], ['m4a1', 'm9', 1], ['m4a1', 'deagle', 1]]) {
      W.qaLoadout(pri, sec); if (slot) { W.swap(1); await window.__qa.frames(60); }
      const id = W.currentId; if (out[id]) continue; await window.__qa.frames(40); p.pitch = 0;
      await window.__qa.frames(3); const p0 = p.pitch; const t0 = performance.now(); W.fire();
      const tr = []; for (let i = 0; i < 70; i++) { await window.__qa.frames(1); tr.push([performance.now() - t0, p.pitch - p0, Math.abs(S.rr.x), (S.shakeAmp || 0)]); }
      const peak = Math.max(...tr.map((x) => x[1])), fin = tr[tr.length - 1][1], vmPeak = Math.max(...tr.map((x) => x[2]));
      const ip = tr.findIndex((x) => x[1] === peak); let recMs = null; for (let i = ip; i < tr.length; i++) if (Math.abs(tr[i][1] - fin) <= 0.1 * Math.max(1e-6, peak - fin)) { recMs = tr[i][0]; break; }
      let vmMs = null; for (let i = tr.length - 1; i >= 0; i--) if (tr[i][2] > 0.1 * vmPeak) { vmMs = tr[Math.min(tr.length - 1, i + 1)][0]; break; }
      out[id] = { kickDeg: +(peak * 57.3).toFixed(2), keepDeg: +(fin * 57.3).toFixed(2), recoverMs: recMs && Math.round(recMs), vmSettleMs: vmMs && Math.round(vmMs), shake: +Math.max(...tr.map((x) => x[3])).toFixed(4) };
      p.pitch = 0;
    }
    W.qaLoadout('m4a1', 'm9'); return out;
  });
  feel.recoil = rec; console.log('recoil', JSON.stringify(rec));
  ok(Object.values(rec).every((r) => r.kickDeg > 0.1), 'every gun kicks the camera');
  ok(Object.values(rec).every((r) => r.recoverMs != null && r.recoverMs < 260), 'recoil recovers in under ~0.25 s', Object.entries(rec).map(([k, r]) => `${k}:${r.recoverMs}`).join(' '));
  ok(Object.values(rec).every((r) => r.shake > 0), 'light screen shake on a shot');

  // ---------- 3) spread / bloom / ADS
  const spr = await pg.evaluate(async () => {
    const c = window.__ctx, W = c.weapons, S = W.state; await window.__qa.frames(60); const hip = W.spread;
    W.setAdsForQA(1); await window.__qa.frames(5); const ads = W.spread; const fov = c.camera.fov; W.setAdsForQA(null); await window.__qa.frames(30);
    for (let i = 0; i < 8; i++) W.fire(); const bloom = W.spread; await window.__qa.frames(40); const back = W.spread;
    return { hipDeg: +hip.toFixed(2), adsDeg: +ads.toFixed(2), bloom8Deg: +bloom.toFixed(2), after0_6sDeg: +back.toFixed(2), adsFov: +fov.toFixed(1) };
  });
  feel.spread = spr; ok(spr.adsDeg < spr.hipDeg && spr.bloom8Deg > spr.hipDeg, 'ADS tightens, bursts bloom', JSON.stringify(spr));

  // ---------- 4) a thug: hitmarker, hit sound, flinch, kill marker, death fall, shots to kill, reaction
  const thug = await pg.evaluate(async () => {
    const c = window.__ctx, W = c.weapons, S = W.state, q = window.__qa; W.qaLoadout('m4a1', 'm9'); S.qaNoSpread = true;
    const hits = []; c.bus.on('hit', (d) => hits.push(d)); const played = () => c.audio?.qaPlayed?.() || []; const n0 = played().length;
    const kills = []; c.bus.on('hit', (d) => { if (d.kill) kills.push(1); });
    const id = window.__game.crews.gang('st', 'talk', 1)[0]?.id; await q.frames(30);
    const t = q.thugObj(id); if (!t) return { err: 'no thug' };
    const p = c.player; const a = p.yaw; t.pos.set(p.position.x - Math.sin(a) * 8, t.pos.y, p.position.z - Math.cos(a) * 8); await q.frames(10);
    let shots = 0, flinch = false, hm = null, firstHitSnd = null, react = null; const fallK = [];
    while (t.st !== 'dead' && shots < 30) {
      q.aimAt(t.pos.x, t.pos.y + 1.15, t.pos.z); await q.frames(2); const h0 = hits.length; W.fire(); shots++;
      if (hits.length > h0 && !hm) { hm = q.hm(); firstHitSnd = played(); }
      await q.frames(1); if (t.m.f.act?.name === 'hit') flinch = true; if (!react && t.st !== 'dead') react = t.intent + '/' + t.st;
      await q.frames(6);
    }
    const killHm = q.hm(); for (let i = 0; i < 20; i++) { await q.frames(1); fallK.push(t.fallK ?? 0); }
    S.qaNoSpread = false; const snd = played();
    return { shots, dead: t.st === 'dead', hm, hitSound: !!firstHitSnd?.includes('hitmarker'), killSound: snd.includes('kill'), sounds: [...new Set(snd)].slice(0, 8), flinch, react, killHm, killEvent: kills.length > 0, fall: +fallK[fallK.length - 1].toFixed(2), fallFrames: fallK.findIndex((k) => k >= 0.99) };
  });
  feel.thug = thug; console.log('thug', JSON.stringify(thug));
  ok(thug.dead, `thug drops (${thug.shots} rifle shots)`);
  ok(thug.hm && thug.hm.anim > 0, 'hitmarker on a hit');
  ok(thug.hitSound, 'hit sound on a hit', thug.sounds.join(','));
  ok(thug.flinch, 'thug flinches on a hit');
  ok(thug.killSound, 'kill sound on a thug kill');
  ok(thug.killHm.kill, 'distinct kill marker on the kill');
  ok(thug.fall > 0.9, 'thug falls (death animation)');

  // ---------- 5) a cop: shots to kill, flinch, ragdoll, kill marker, reaction
  const cop = await pg.evaluate(async () => {
    const c = window.__ctx, W = c.weapons, S = W.state, q = window.__qa; S.qaNoSpread = true;
    const before = new Set(c.ai.soldiers); window.__game.chase.stars(2); window.__game.chase.spawn('cop', 9, 12); await q.frames(20);
    const s = c.ai.soldiers.find((x) => !before.has(x) && !x.dead); if (!s) { S.qaNoSpread = false; return { err: 'no cop' }; }
    let shots = 0, flinch = false, states = new Set(); const _v = s.chest ? s.chest(new (s.position.constructor)()) : null;
    while (!s.dead && shots < 30) {
      const ch = s.chest(_v); q.aimAt(ch.x, ch.y, ch.z); await q.frames(2); W.fire(); shots++; await q.frames(1);
      if (s.flOmega > 0.5 || s.stagger > 0) flinch = true; states.add(s.state); await q.frames(5);
    }
    const killHm = q.hm(); await q.frames(10); S.qaNoSpread = false; window.__game.chase.clear?.();
    return { shots, dead: s.dead, health: s.maxHealth, flinch, ragdoll: !!s.ragdoll, states: [...states], killHm };
  });
  feel.cop = cop; console.log('cop', JSON.stringify(cop));
  ok(cop.dead && cop.ragdoll, `cop drops into a ragdoll (${cop.shots} rifle shots)`);
  ok(cop.flinch, 'cop flinches on a hit');
  ok(cop.killHm?.kill, 'kill marker on a cop kill');

  // ---------- 6) impacts: sparks/dust + decal pool cap
  const dec = await pg.evaluate(async () => {
    const fx = window.__ctx.weapons.fx; const p = window.__ctx.player.position; fx.reset(); const s0 = fx.sparks.n ?? 0;
    window.__ctx.weapons.qaImpact(p.x, 0.01, p.z - 3, 'concrete'); const sparks = (fx.sparks.n ?? 0) - s0, dust = fx.dust.n ?? 0;
    for (let i = 0; i < 400; i++) window.__ctx.weapons.qaImpact(p.x + (i % 20) * 0.1, 0.01, p.z - 3 - Math.floor(i / 20) * 0.1, 'concrete');
    const out = { sparks, dust, decals: fx.decals.count, max: fx.decalMax }; fx.reset(); return out;
  });
  feel.decals = dec; ok(dec.sparks > 0 && dec.dust > 0, 'impact sparks + dust', JSON.stringify(dec)); ok(dec.decals <= dec.max && dec.max <= 200, `decal pool capped (${dec.decals}/${dec.max})`);
  ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
  await pg.close();

  // ---------- 7) phone: aim assist pulls toward a target just off the crosshair; a firefight stays cheap
  const ph = await boot('&touch=1');
  const assist = await ph.pg.evaluate(async () => {
    const c = window.__ctx, W = c.weapons, S = W.state, q = window.__qa, p = c.player;
    const id = window.__game.crews.gang('st', 'talk', 1)[0]?.id; await q.frames(30); const t = q.thugObj(id); if (!t) return { err: 'no thug' };
    const a = p.yaw; const fix = [p.position.x - Math.sin(a) * 10, t.pos.y, p.position.z - Math.cos(a) * 10]; t.pos.set(...fix); await q.frames(4);
    const err = () => { t.pos.set(...fix); const e = c.camera.position; const dx = t.pos.x - e.x, dz = t.pos.z - e.z; let d = Math.atan2(-dx, -dz) - p.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); return Math.abs(d) * 57.3; };
    q.aimAt(t.pos.x, t.pos.y + 1.15, t.pos.z); p.yaw += 3 / 57.3; await q.frames(2); const e0 = err();
    c.input.touch.ads = true; for (let i = 0; i < 30; i++) { t.pos.set(...fix); await q.frames(1); } c.input.touch.ads = false; const e1 = err();
    return { e0: +e0.toFixed(2), e1: +e1.toFixed(2) };
  });
  feel.assist = assist; console.log('assist', JSON.stringify(assist));
  ok(assist.e1 < assist.e0 * 0.8, 'touch aim assist pulls toward the target', JSON.stringify(assist));
  // firefight cost: draw calls with the trigger held vs released, interleaved in 20-frame windows so NPCs walking through the
  // frame average out (a single idle-vs-firing pair swings +-25), plus heap after a forced GC
  const cost = await ph.pg.evaluate(async () => {
    const c = window.__ctx, W = c.weapons, q = window.__qa; await q.frames(60);
    const heap = () => { window.gc?.(); return performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0; };
    const win = async (fire) => { c.input.touch.fire = fire; let dc = 0; for (let i = 0; i < 20; i++) { await q.frames(1); dc += c.renderer.info.render.calls; const w = W.state.weapons[W.state.cur]; if (w.ammo < 3) w.ammo = 30; } return dc / 20; };
    const h0 = heap(); let idle = 0, firing = 0; for (let k = 0; k < 4; k++) { idle += await win(false); firing += await win(true); } c.input.touch.fire = false;
    const h1 = heap();
    return { dcIdle: Math.round(idle / 4), dcFiring: Math.round(firing / 4), heap0: +h0.toFixed(1), heap1: +h1.toFixed(1), fired: W.state.fired };
  });
  feel.phone = cost; console.log('phone', JSON.stringify(cost));
  ok(cost.dcFiring - cost.dcIdle <= 10, `phone firefight draw calls +${cost.dcFiring - cost.dcIdle} (${cost.dcIdle} -> ${cost.dcFiring})`);
  ok(cost.heap1 - cost.heap0 <= 10, `phone firefight heap +${(cost.heap1 - cost.heap0).toFixed(1)} MB`);
  ok(ph.errs.length === 0, 'no page errors (phone)', ph.errs.slice(0, 3).join(' | '));
} catch (e) { fails++; console.log('EXC', e); }
console.log('feel', JSON.stringify(feel));
await browser.close();
console.log(fails ? `${fails} FAIL` : 'ALL PASS'); process.exitCode = fails ? 1 : 0;
