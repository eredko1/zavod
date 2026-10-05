// VR on every map: node qa/vr-maps-test.mjs [maps] [--precache]. Each map loads as the headset would (?vr=1: the lite build) under
// Meta's IWER emulator, enters VR, then: frames run, the left stick walks, the trigger fires (wave maps), no page errors; prints the
// eyes' draw calls. --precache also writes precache.json: every same-origin file the maps loaded, for sw.js to fetch on install
// (re-run it after adding assets).
import pw from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
const { chromium } = pw;
const args = process.argv.slice(2), PRE = args.includes('--precache');
const MAPS = (args.find((a) => !a.startsWith('--')) || 'coney:chill,zavod,railyard,terminal,wsp,sbu').split(',');
const IWER = readFileSync(new URL('../node_modules/iwer/build/iwer.min.js', import.meta.url), 'utf8');
const BASE = `http://localhost:${process.env.PORT || 8790}`;
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const files = new Set();
for (const spec of MAPS) {
  const [map, mode] = spec.split(':');
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  pg.on('requestfinished', (r) => { if (!/^https?:/.test(r.url())) return; const u = new URL(r.url()); if (u.origin === BASE && r.method() === 'GET') files.add(u.pathname); });
  await pg.addInitScript(IWER + `\n;window.__iwer = new IWER.XRDevice(IWER.metaQuest3); window.__iwer.installRuntime({ forceInstall: true }); try { localStorage.setItem('zavod.helpSeen', '1'); } catch {}`);
  await pg.goto(`${BASE}/?qa=1&map=${map}${mode ? '&mode=' + mode : ''}&vr=1&time=day`, { timeout: 240000 });
  await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  await pg.evaluate(() => { window.__game.setState('playing'); window.__game.freezeAI?.(true); window.__game.vr.enter(); });
  await pg.waitForFunction(() => window.__game.vr.state().presenting, null, { timeout: 15000 }).catch(() => {});
  await pg.waitForTimeout(2500);
  const st = await pg.evaluate(async () => { const I = window.__ctx.renderer.info, f0 = window.__ctx.time.frame, c0 = I.render.calls; await new Promise((r) => setTimeout(r, 1500)); const n = window.__ctx.time.frame - f0; return { presenting: window.__game.vr.state().presenting, frames: n, calls: Math.round((I.render.calls - c0) / Math.max(1, n)), culled: window.__game.vr.state().culled }; });
  ok(st.presenting && st.frames > 10, `${spec}: in VR, frames running`, JSON.stringify(st));
  const p0 = await pg.evaluate(() => window.__ctx.player.position.toArray());
  let p1 = p0;   // a spawn facing a wall: look another way and try again
  for (let k = 0; k < 4 && Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) <= 1; k++) {
    await pg.evaluate((k) => { const a = k * Math.PI / 2; window.__iwer.quaternion.set(0, Math.sin(a / 2), 0, Math.cos(a / 2)); }, k); await pg.waitForTimeout(300);
    await pg.evaluate(() => window.__iwer.controllers.left.updateAxes('thumbstick', 0, -1)); await pg.waitForTimeout(1200); await pg.evaluate(() => window.__iwer.controllers.left.updateAxes('thumbstick', 0, 0));
    p1 = await pg.evaluate(() => window.__ctx.player.position.toArray()); }
  await pg.evaluate(() => window.__iwer.quaternion.set(0, 0, 0, 1));
  ok(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 1, `${spec}: the left stick walks`, JSON.stringify({ p0: p0.map((v) => +v.toFixed(1)), p1: p1.map((v) => +v.toFixed(1)) }));
  const w = await pg.evaluate(() => ({ id: window.__ctx.weapons?.currentId, ammo: window.__ctx.weapons?.primary?.ammo }));
  if (w.id && w.id !== 'fists') {
    await pg.evaluate(() => window.__iwer.controllers.right.updateButtonValue('trigger', 1)); await pg.waitForTimeout(400); await pg.evaluate(() => window.__iwer.controllers.right.updateButtonValue('trigger', 0)); await pg.waitForTimeout(300);
    const a1 = await pg.evaluate(() => window.__ctx.weapons?.primary?.ammo);
    ok(a1 < w.ammo || w.ammo == null, `${spec}: the trigger fires the ${w.id}`, JSON.stringify({ before: w.ammo, after: a1 }));
  }
  // the same VR kit on every map: the walk-through, the tablet (Y, laser + trigger), the holsters, the wheel / bars of whatever you can drive
  const ctl = (side, fn) => pg.evaluate(`window.__iwer.controllers.${side}.${fn}`);
  const click = async (side, btn, ms = 150) => { await ctl(side, `updateButtonValue('${btn}', 1)`); await pg.waitForTimeout(ms); await ctl(side, `updateButtonValue('${btn}', 0)`); await pg.waitForTimeout(400); };
  const aimRight = (t) => pg.evaluate((t) => { const c = window.__iwer.controllers.right, o = c.position, d = [t[0] - o.x, t[1] - o.y, t[2] - o.z], L = Math.hypot(...d); d.forEach((v, i) => { d[i] = v / L; });
    const ax = [d[1], -d[0], 0], al = Math.hypot(...ax), ang = Math.acos(-d[2]), sn = Math.sin(ang / 2); if (al > 1e-6) c.quaternion.set(ax[0] / al * sn, ax[1] / al * sn, 0, Math.cos(ang / 2)); else c.quaternion.set(0, 0, 0, 1); }, t);
  ok(await pg.evaluate(() => window.__game.vr.tut()) >= 0, `${spec}: the walk-through is up on the first VR session`);
  await pg.evaluate(() => { window.__iwer.quaternion.set(0, 0, 0, 1); const l = window.__iwer.controllers.left; l.position.set(-0.2, 1.3, -0.35); l.quaternion.set(0, 0, 0, 1); const r = window.__iwer.controllers.right; r.position.set(0.2, 1.3, -0.3); }); await pg.waitForTimeout(300);
  await click('left', 'y-button', 200);
  const tb = await pg.evaluate(() => window.__game.vr.tablet());
  let tabOk = false; if (tb.shown) { const at = await pg.evaluate(() => window.__game.vr.tabletRect(window.__game.vr.tabletTab('guns'))); await aimRight(at); await pg.waitForTimeout(200); await click('right', 'trigger'); tabOk = (await pg.evaluate(() => window.__game.vr.tablet().tab)) === 'guns'; }
  ok(tb.shown && tabOk, `${spec}: Y brings up the tablet, the laser switches its tab`, JSON.stringify(tb));
  await click('left', 'y-button', 200); await pg.evaluate(() => window.__iwer.controllers.right.quaternion.set(0, 0, 0, 1));
  await pg.evaluate(() => { const W = window.__ctx.weapons; W.collect('ak74', 90); W.fists(); }); await pg.waitForTimeout(500);
  await pg.evaluate(() => { const c = window.__iwer.controllers.right; c.position.set(0.17, 1.52, 0.16); }); await pg.waitForTimeout(300);
  await click('right', 'squeeze', 250); await pg.waitForTimeout(400);
  const rifle = await pg.evaluate(() => window.__ctx.weapons.currentId);   // the last rifle you held (the map's own, or the AK)
  ok(rifle && !/^(fists|knife|m9|deagle|makarov|glock|pistol)/.test(rifle), `${spec}: squeeze over the right shoulder draws a rifle`, String(rifle));
  await pg.evaluate(() => window.__iwer.controllers.right.position.set(0.2, 1.3, -0.3));
  // every kind of thing you can drive on this map (car, bike, jet ski, bus): get on, grab the wheel / the bars, turn it
  const kinds = await pg.evaluate(() => { const seen = new Map(); (window.__ctx.vehicles?.list || []).forEach((v, i) => { const k = v.spec?.kind || (v.spec?.car ? 'car' : 'bike'); if (!seen.has(k) && v.pos) seen.set(k, i); }); return [...seen]; });
  for (const [kind, idx] of kinds) {
    const mounted = await pg.evaluate(async (i) => { const V = window.__ctx.vehicles, v = V.list[i]; window.__game.teleport(v.pos.x + 1, v.pos.y, v.pos.z, 0, 0); await new Promise((r) => setTimeout(r, 400)); V.qaMount(); await new Promise((r) => setTimeout(r, 1200)); return V.mounted === v; }, idx);
    if (!mounted) { console.log(`SKIP ${spec}: could not get on the ${kind}`); continue; }
    // turn right: a wheel clockwise from its top (as the driver sees it), the bars by pulling the right grip back. The vehicle's own
    // frame in the rig (you may sit facing anywhere)
    const F = await pg.evaluate(() => { const vr = window.__game.vr, v = window.__ctx.vehicles.mounted, T = window.__ctx.THREE, rig = window.__ctx.scene.getObjectByName('xrRig'), rq = rig.getWorldQuaternion(new T.Quaternion()).invert();
      const f = new T.Vector3(-Math.sin(v.heading), 0, -Math.cos(v.heading)).applyQuaternion(rq).toArray(); return { f, wf: vr.wheelFrame(), at: vr.wheelAt() }; });
    const right = [-F.f[2], 0, F.f[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    let path = null;
    if (F.wf) { const at = (a) => F.wf.c.map((c, i) => c + 0.17 * (Math.cos(a) * F.wf.y[i] + Math.sin(a) * F.wf.z[i])), sgn = dot(at(0.5).map((v, i) => v - at(0)[i]), right) > 0 ? 1 : -1;
      path = [0, 1, 2, 3, 4, 5, 6].map((k) => at(sgn * k * Math.PI / 4 / 6)); }
    else if (F.at) { const g0 = F.at.map((c, i) => c + right[i] * 0.3); path = [0, 1, 2, 3, 4, 5, 6].map((k) => g0.map((c, i) => c - F.f[i] * 0.02 * k)); }
    let st = null; if (path) { await pg.evaluate((p) => { const c = window.__iwer.controllers.right; c.quaternion.set(0, 0, 0, 1); c.position.set(...p); }, path[0]); await pg.waitForTimeout(250);
      await ctl('right', "updateButtonValue('squeeze', 1)"); await pg.waitForTimeout(250);
      for (const q of path.slice(1)) { await pg.evaluate((p) => window.__iwer.controllers.right.position.set(...p), q); await pg.waitForTimeout(60); }
      st = await pg.evaluate(() => ({ ...window.__game.vr.phys().wheel, in: !!window.__ctx.player.mounted })); await ctl('right', "updateButtonValue('squeeze', 0)"); await pg.waitForTimeout(300); }
    ok(!!path && st?.hands === 1 && st.steer > 0.1 && st.in, `${spec}: the ${kind}: turn its ${st?.kind || 'wheel / bars'} right with your hand and it steers right`, JSON.stringify(st));
    await pg.evaluate(() => window.__iwer.controllers.right.position.set(0.2, 1.3, -0.3));
    await pg.evaluate(() => { window.__ctx.input.pressed?.add?.('KeyF'); }); await pg.waitForTimeout(600);
    if (await pg.evaluate(() => !!window.__ctx.vehicles.mounted)) await pg.evaluate(() => { window.__ctx.vehicles.qaDismount?.(); }); 
  }
  const ph = await pg.evaluate(() => ({ ...window.__game.vr.phys(), shafts: (window.__game.tavernPeople?.kit || window.__game.hangout)?.state?.()?.shafts?.filter((t) => t.kind === 'elevator').length || 0 }));
  if (ph.shafts) ok(ph.buttons > 0, `${spec}: the elevators have call buttons`, JSON.stringify(ph));
  await pg.screenshot({ path: `${process.env.OUT || '/tmp'}/vr-map-${map}.png` });
  ok(errs.length === 0, `${spec}: no page errors`, JSON.stringify(errs.slice(0, 3)));
  await pg.close();
}
if (PRE) {
  const keep = [...files].filter((f) => !/^\/(qa|node_modules|\.well-known)\//.test(f) && !/\?/.test(f)).sort();
  writeFileSync(new URL('../precache.json', import.meta.url), JSON.stringify(keep, null, 0).replace(/","/g, '",\n"') + '\n');
  console.log(`precache.json: ${keep.length} files`);
}
await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
