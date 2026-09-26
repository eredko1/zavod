// Every map / mode on phone + tablet profiles: loads, no page errors, no 404s, texture budget. node qa/mobile-matrix.mjs [filter]
// Profiles: new iPhone (WebKit), older iPad (WebKit, low-mem budget), older Android phone (Chromium, low-mem budget).
import { webkit, chromium, devices } from 'playwright-core';
const only = process.argv[2] || '';
const PROFILES = [['iPhone 15 Pro', webkit, ''], ['iPad (gen 7)', webkit, '&lowmem=1'], ['Galaxy S9+', chromium, '&lowmem=1']];
const MODES = [['zavod', ''], ['railyard', ''], ['terminal', ''], ['wsp', ''], ['sbu', ''], ['coney', ''], ['coney', '&mode=chill']];
let fails = 0; const rows = [];
for (const [dev, engine, extra] of PROFILES) {
  if (only && !dev.includes(only)) continue;
  const b = await engine.launch(engine === chromium ? { channel: 'chrome', headless: true, args: ['--mute-audio'] } : { headless: true });
  for (const [map, q] of MODES) {
    const ctx = await b.newContext({ ...devices[dev] }); const pg = await ctx.newPage(); const errs = [], bad = new Set();
    pg.on('pageerror', (e) => errs.push(e.message.slice(0, 140))); pg.on('response', (r) => { if (r.status() >= 400) bad.add(r.url().split('/').slice(-2).join('/')); });
    const t0 = Date.now(); let ok = false, info = null;
    try {
      await pg.goto(`http://localhost:8790/?qa=1&map=${map}${q}${extra}&touch=1`, { timeout: 120000 }); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 200000 }); ok = true;
      await pg.evaluate(() => window.__game.setState('playing')); await pg.waitForTimeout(2500);
      info = await pg.evaluate(() => { let tex = 0; const seen = new Set(); window.__ctx.scene.traverse((o) => { const ms = o.material ? [].concat(o.material) : []; for (const m of ms) for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'emissiveMap', 'metalnessMap']) { const t = m[k]; if (!t || seen.has(t)) continue; seen.add(t); const im = t.image; tex += (im?.width || 0) * (im?.height || 0) * 5.3; } });
        return { boot: window.__ctx.bootErrors || [], texMB: Math.round(tex / 1048576), q: window.__ctx.settings.quality, calls: window.__game.stats?.().drawCalls }; });
    } catch (e) { errs.push('LOAD: ' + e.message.slice(0, 100)); }
    const pass = ok && !errs.length && !(info?.boot?.length) && !bad.size && (info?.texMB ?? 999) < (extra ? 260 : 420);
    if (!pass) fails++;
    rows.push(`${pass ? 'PASS' : 'FAIL'} ${dev.padEnd(14)} ${(map + q.replace('&mode=', ' ')).padEnd(12)} ${Math.round((Date.now() - t0) / 1000)}s tex ${info?.texMB ?? '?'}MB calls ${info?.calls ?? '?'} ${info?.q ?? ''} ${errs.concat(info?.boot || []).slice(0, 2).join(' ; ')} ${bad.size ? '404: ' + [...bad].slice(0, 3).join(',') : ''}`);
    console.log(rows[rows.length - 1]);
    await ctx.close();
  }
  await b.close();
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
