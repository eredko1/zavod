// Fists (chill mode's default): node qa/fists-test.mjs — chill starts unarmed (fists, hands down, no gun drawn), 7 brings
// the fists back from a gun, punches land for damage and a quick third one is a hook for more.
import pw from 'playwright-core';
const b = await pw.chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 1000, height: 600 } }); const errs = []; pg.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERROR', e.message); });
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
await pg.goto(`http://localhost:${process.env.PORT || 8790}/?qa=1&map=coney&mode=chill&time=day`, { timeout: 180000 }); await pg.waitForFunction(() => window.__game?.ready && window.__game.chill, null, { timeout: 180000 });
await pg.evaluate(() => window.__game.setState('playing')); await pg.waitForTimeout(4000);
const W = () => pg.evaluate(() => { const w = window.__ctx.weapons; let vis = false; w.viewmodel.traverse((o) => { if (o.name === 'fists' && o.visible) vis = true; }); return { cur: w.currentId, bag: w.bag, fistsVisible: vis }; });
let s = await W(); ok(s.cur === 'fists', 'chill starts with fists, no gun drawn', JSON.stringify(s));
ok(!s.fistsVisible, 'hands down while you are not fighting', JSON.stringify(s));
ok(!s.bag.includes('fists') && s.bag.includes('knife') && s.bag.includes('ak74'), 'the knife, AK and sniper are in the bag (fists are 7, not in it)', JSON.stringify(s.bag));
await pg.keyboard.press('Digit3'); await pg.waitForTimeout(900); const g = await W(); await pg.keyboard.press('Digit7'); await pg.waitForTimeout(900); s = await W();
ok(g.cur !== 'fists' && s.cur === 'fists', '3 draws a gun, 7 puts it away (fists)', `${g.cur} → ${s.cur}`);
// a passer-by in front: jab, cross, hook
const hit = await pg.evaluate(async () => { const C = window.__game.crews; window.__game.chill?.state && C.calm(60000); const id = C.mark(1.2); await new Promise((r) => setTimeout(r, 400)); const t = C.state().thugs.find((q) => q.id === id); if (!t) return { err: 'no mark' };
  const p = window.__ctx.player; const dx = t.pos[0] - p.position.x, dz = t.pos[2] - p.position.z; p.yaw = Math.atan2(-dx, -dz); p.pitch = -0.05; window.__ctx.camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
  const hp0 = t.hp, W2 = window.__ctx.weapons, combos = [];
  for (let k = 0; k < 3; k++) { W2.fire(); combos.push(W2.combo()); await new Promise((r) => setTimeout(r, 260)); }
  const t2 = C.state().thugs.find((q) => q.id === id); return { hp0, hp1: t2?.hp ?? 0, combos, d: Math.hypot(dx, dz).toFixed(2) }; });
ok(hit.hp1 < hit.hp0, 'punches land for damage', JSON.stringify(hit));
ok(JSON.stringify(hit.combos) === '[0,1,2]', 'a quick chain: jab, cross, hook', JSON.stringify(hit.combos));
s = await W(); ok(s.fistsVisible, 'fists up while fighting', JSON.stringify(s));
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
