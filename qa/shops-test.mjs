// Walk-in shops on the Coney streets (coney/fronts.js picks them, coney/shops.js fills them):
//  - counts the walk-ins per street against WALKIN_SHARE (desktop) / WALKIN_SHARE_LITE (phone path, ?touch=1)
//  - walks the player in through the door of several (one of each interior kind where there is one): he must end up in the room
//  - walks him into closed fronts: he must stay on the sidewalk
//  - screenshots the interiors (from inside) and a doorway from the street
//  - heap (after a GC) and draw calls on desktop and on the phone path, at fixed poses on Mermaid / Stillwell / Surf
// Usage: PORT=8846 node qa/shops-test.mjs [outdir]    (PERF_ONLY=1: just the heap / draw call numbers, e.g. for a baseline on main)
// Exit code 1 on any failure.
import { chromium } from 'playwright-core';
const PORT = process.env.PORT || 8790, OUT = process.argv[2] || '/tmp/shops', PERF_ONLY = process.env.PERF_ONLY === '1';
const MAIN = ['surf', 'mermaid', 'stillwell', 'brighton'], SHARE = [0.25, 0.35], SHARE_LITE = [0.12, 0.25];
const KINDS = ['grocery', 'pizza', 'laundry', 'phone', 'pharmacy', 'bar', 'russian'];
// fixed poses (x, y, z, yaw) on the walk-in blocks, the same on any build so before / after compare
const POSES = { mermaid: [-150, 0, -291, Math.PI / 2], stillwell: [-93, 0, -400, 0], surf: [0, 0, -118, -Math.PI / 2] };
import fs from 'node:fs'; fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--mute-audio', '--enable-precise-memory-info', '--js-flags=--expose-gc', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let fails = 0; const ok = (c, msg, x = '') => { console.log((c ? 'OK   ' : 'FAIL ') + msg, x); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const open = async (q = '') => {
  const pg = await browser.newPage({ viewport: { width: 1100, height: 620 } });
  pg.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  pg.on('console', (m) => { if (/\[shops\]|\[fronts\]/.test(m.text())) console.log('  ', m.text()); });
  await pg.goto(`http://localhost:${PORT}/?qa=1&map=coney&mode=chill&time=day&ai=0${q}`, { timeout: 240000 });
  await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  await pg.addStyleTag({ content: 'body > *:not(canvas):not(:has(canvas)) { visibility: hidden !important; }' });   // no HUD in the shots
  await sleep(1500); return pg;
};
const perf = async (pg, label) => {
  const out = {};
  for (const [k, p] of Object.entries(POSES)) {
    await pg.evaluate((p) => window.__game.teleport(p[0], p[1], p[2], p[3], 0), p); await sleep(4000);
    const calls = []; for (let i = 0; i < 6; i++) { calls.push(await pg.evaluate(() => window.__game.stats().drawCalls)); await sleep(500); }
    calls.sort((a, b) => a - b); out[k] = calls[3];
    // the interiors' own share (each mesh is one draw): the totals above swing by ~100 with traffic and passers-by
    out[k + 'Interior'] = await pg.evaluate(() => { let n = 0; window.__ctx.scene?.traverse?.((o) => { if (/^shop:/.test(o.name || '')) o.traverse((m) => { if (m.isMesh && m.visible) n++; }); }); return n; });
  }
  await pg.evaluate(() => window.gc?.()); await sleep(500);
  out.heapMB = await pg.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1048576));
  out.colliders = await pg.evaluate(() => window.__ctx.colliders.length);
  console.log(`PERF ${label}`, JSON.stringify(out)); return out;
};
const world = (pg) => pg.evaluate(() => { const W = window.__ctx.world.W || window.__ctx.world; return { stats: W.fronts?.stats, closed: W.fronts?.closed || [], shops: window.__game.shops?.list() || [] }; });
const counts = (w, [lo, hi], label) => {
  let fronts = 0, walkin = 0; const per = {};
  for (const s of MAIN) { const v = w.stats?.walkin?.[s]; if (!v) continue; fronts += v.fronts; walkin += v.walkin; per[s] = `${v.walkin}/${v.fronts}`; }
  const pct = fronts ? walkin / fronts : 0;
  ok(pct >= lo && pct <= hi, `${label}: ${walkin}/${fronts} main-street storefronts are walk-ins (${(pct * 100).toFixed(1)}%, want ${lo * 100}-${hi * 100}%)`, JSON.stringify(per));
  return { fronts, walkin, pct };
};
// the shop's frame from its QA entry: inward unit, along unit, the facade point under the door
const frame = (s) => { const dx = s.inside[0] - s.door[0], dz = s.inside[2] - s.door[2], l = Math.hypot(dx, dz), n = [dx / l, dz / l]; return { n, t: [-n[1], n[0]], yawIn: Math.atan2(-n[0], -n[1]) }; };
const where = (s, p) => { const { n, t } = frame(s), rx = p[0] - s.mid[0], rz = p[2] - s.mid[2]; return { depth: rx * n[0] + rz * n[1], side: rx * t[0] + rz * t[1] }; };

const R = {};
if (!PERF_ONLY) {
  const pg = await open();
  const w = await world(pg);
  R.desk = counts(w, SHARE, 'desktop');
  const main = w.shops.filter((s) => MAIN.includes(s.street));
  const kinds = new Set(main.map((s) => s.kind)); ok(KINDS.every((k) => kinds.has(k)), 'interior kinds on the main streets', [...kinds].join(' '));
  // walk in: one per kind (then the first few others)
  const pick = []; for (const k of KINDS) { const s = main.find((q) => q.kind === k); if (s) pick.push(s); } for (const s of main) if (pick.length < 9 && !pick.includes(s)) pick.push(s);
  let inside = 0, surfShot = false;
  for (const s of pick) {
    const { n, yawIn } = frame(s);
    await pg.evaluate(([s, n, yaw]) => window.__game.teleport(s.door[0] - n[0] * 1.5, 0, s.door[2] - n[1] * 1.5, yaw, 0), [s, n, yawIn]); await sleep(600);
    await pg.evaluate(() => window.__ctx.player.qaWalk({ x: 0, y: 1 }, 1.4));
    const p = await pg.evaluate(() => window.__ctx.player.position.toArray()), at = where(s, p);
    const good = at.depth > 1.0 && at.depth < s.rd && Math.abs(at.side) < s.hw && p[1] < 0.5; if (good) inside++;
    ok(good, `walk into ${s.name} (${s.kind}, ${s.street})`, JSON.stringify({ depth: +at.depth.toFixed(2), side: +at.side.toFixed(2), y: +p[1].toFixed(2), rd: +s.rd.toFixed(1) }));
    // the room from just inside the door, and the doorway from the street
    await pg.evaluate(([s, n, yaw]) => window.__game.teleport(s.mid[0] + n[0] * 0.6, 0, s.mid[2] + n[1] * 0.6, yaw, -0.08), [s, n, yawIn]); await sleep(1600);
    const f = `${OUT}/shop-${s.kind}-${s.name.replace(/[^A-Za-z0-9]+/g, '_')}.png`; await pg.screenshot({ path: f }); console.log('   shot', f);
    if (s.kind === 'pizza' || s.kind === 'russian' || (s.street === 'surf' && !surfShot && (surfShot = true))) { await pg.evaluate(([s, n, yaw]) => window.__game.teleport(s.door[0] - n[0] * 5, 0, s.door[2] - n[1] * 5, yaw, 0), [s, n, yawIn]); await sleep(1600);
      const g = `${OUT}/door-${s.kind}-${s.street}.png`; await pg.screenshot({ path: g }); console.log('   shot', g); }
  }
  ok(inside >= Math.min(5, pick.length), `${inside}/${pick.length} walk-ins entered`);
  // closed fronts: walk straight at the glass, he must stay outside
  const shut = w.closed.filter((c) => MAIN.includes(c.street)).filter((_, i) => i % 3 === 0); let held = 0, tried = 0;
  for (const c of shut) { if (tried >= 8) break;
    const dx = c.in[0] - c.out[0], dz = c.in[2] - c.out[2], l = Math.hypot(dx, dz), n = [dx / l, dz / l], face = [c.out[0] + n[0] * 1.5, c.out[2] + n[1] * 1.5];
    await pg.evaluate(([c, n]) => window.__game.teleport(c.out[0] - n[0] * 1.0, 0, c.out[2] - n[1] * 1.0, Math.atan2(-n[0], -n[1]), 0), [c, n]); await sleep(500);
    if (await pg.evaluate(() => window.__ctx.player.position.y < -0.5)) { console.log(`SKIP closed ${c.name} (${c.street}): the teleport lands under the street there (the subway level)`); continue; }
    tried++;
    await pg.evaluate(() => window.__ctx.player.qaWalk({ x: 0, y: 1 }, 1.6));
    const p = await pg.evaluate(() => window.__ctx.player.position.toArray()), pen = (p[0] - face[0]) * n[0] + (p[2] - face[1]) * n[1];
    const good = pen < 0.05 || p[1] > 1; if (good) held++;
    ok(good, `closed ${c.name} (${c.street}) stops you at the front`, JSON.stringify({ penetration: +pen.toFixed(2), y: +p[1].toFixed(2) }));
  }
  ok(tried >= 6 && held === tried, `${held}/${tried} closed fronts held`);
  R.deskPerf = await perf(pg, 'desktop');
  await pg.close();
  const ph = await open('&touch=1');
  R.phone = counts(await world(ph), SHARE_LITE, 'phone (touch=1)');
  R.phonePerf = await perf(ph, 'phone (touch=1)');
  await ph.close();
} else {
  const pg = await open(); R.deskPerf = await perf(pg, 'desktop'); await pg.close();
  const ph = await open('&touch=1'); R.phonePerf = await perf(ph, 'phone (touch=1)'); await ph.close();
}
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL OK');
process.exit(fails ? 1 : 0);
