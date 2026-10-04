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
  await pg.evaluate(() => window.__iwer.controllers.left.updateAxes('thumbstick', 0, -1)); await pg.waitForTimeout(1200); await pg.evaluate(() => window.__iwer.controllers.left.updateAxes('thumbstick', 0, 0));
  const p1 = await pg.evaluate(() => window.__ctx.player.position.toArray());
  ok(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 1, `${spec}: the left stick walks`, JSON.stringify({ p0: p0.map((v) => +v.toFixed(1)), p1: p1.map((v) => +v.toFixed(1)) }));
  const w = await pg.evaluate(() => ({ id: window.__ctx.weapons?.currentId, ammo: window.__ctx.weapons?.primary?.ammo }));
  if (w.id && w.id !== 'fists') {
    await pg.evaluate(() => window.__iwer.controllers.right.updateButtonValue('trigger', 1)); await pg.waitForTimeout(400); await pg.evaluate(() => window.__iwer.controllers.right.updateButtonValue('trigger', 0)); await pg.waitForTimeout(300);
    const a1 = await pg.evaluate(() => window.__ctx.weapons?.primary?.ammo);
    ok(a1 < w.ammo || w.ammo == null, `${spec}: the trigger fires the ${w.id}`, JSON.stringify({ before: w.ammo, after: a1 }));
  }
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
