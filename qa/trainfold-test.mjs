// Train folds: node qa/trainfold-test.mjs — every line through a full cycle: the worst angle between consecutive cars stays
// under 30° (the D doubled back through itself at 166°, the F / Q folded ~50° at W 8 St).
import pw from 'playwright-core';
const b = await pw.chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
const pg = await b.newPage({ viewport: { width: 900, height: 500 } }); pg.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
await pg.goto(`http://localhost:${process.env.PORT || 8790}/?qa=1&map=coney&ai=0`, { timeout: 180000 }); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
await pg.evaluate(() => { window.__game.setState('playing'); window.__game.teleport(300, 0, -140, 0, 0); });
const r = await pg.evaluate(async () => { const S = window.__game.subway, out = {};
  for (const id of ['F', 'Q', 'D', 'N']) { let worst = 0, at = null; const L = S.line(id); const cyc = L.state().cycle;
    for (let k = 0; k < 400; k++) { L.skew(cyc / 400); await new Promise((r) => setTimeout(r, 25)); const c = L.debug().cars;
      for (let i = 0; i + 2 < c.length; i++) { const a = Math.atan2(c[i + 1][0] - c[i][0], c[i + 1][2] - c[i][2]), b2 = Math.atan2(c[i + 2][0] - c[i + 1][0], c[i + 2][2] - c[i + 1][2]); let d = Math.abs(Math.atan2(Math.sin(a - b2), Math.cos(a - b2))) * 57.3; if (d > worst) { worst = d; at = c[i + 1].map(Math.round); } } }
    out[id] = { worstDeg: +worst.toFixed(1), at }; }
  return out; });
let fails = 0; for (const [id, v] of Object.entries(r)) { const ok = v.worstDeg < 30; if (!ok) fails++; console.log((ok ? 'PASS' : 'FAIL') + ` ${id}: worst car-to-car bend ${v.worstDeg}°`, JSON.stringify(v.at)); }
await b.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
