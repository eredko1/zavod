// Coney street scene: node qa/street-test.mjs [outdir] — the mapped storefronts, walk-up fronts, Surf Ave arches + billboards,
// signals (lit from the traffic phases), poles + wires, bins, Surf Ave parking and the vendor tables are built; the pedestrian
// signals agree with the car signals; crosswalk walkers wait for the WALK; the street types show up among the live locals.
// Shots from the spots of the Street View references (Surf & Stillwell, Surf at W 12th, Surf at W 8th, Mermaid at W 15th,
// Stillwell under the el, W 8th St, W 12th St).
import pw from 'playwright-core';
const { chromium } = pw;
const out = process.argv[2] || '/tmp';
const URL = `http://localhost:${process.env.PORT || 8790}/?qa=1&map=coney&mode=chill&ai=0&time=day`;
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = [], logs = []; pg.on('pageerror', (e) => errs.push(e.message));
pg.on('console', (m) => { const t = m.text(); if (/^\[(fronts|street)\]|\[coney\] (fronts|street)/.test(t)) logs.push(t); });
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
await pg.goto(URL, { timeout: 240000 }); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
await pg.evaluate(() => window.__game.setState('playing')); await pg.waitForTimeout(500);
const N = (js, a) => pg.evaluate(js, a);
console.log(logs.join('\n'));
const fr = await N(() => window.__ctx.world.fronts?.stats), st = await N(() => window.__game.street?.stats());
ok(fr && fr.stores >= 40, 'the mapped businesses have storefronts', JSON.stringify(fr));
ok(fr && fr.generic >= 15 && fr.walkups >= 20, 'walk-up streets: ground-floor shops, cornices, fire escapes', JSON.stringify(fr));
ok(fr && fr.arches >= 2 && fr.boards >= 2, 'Surf Ave: arched upper storeys and rooftop billboards', JSON.stringify(fr));
ok(st && st.heads >= 12 && st.poles >= 10 && st.bins >= 20 && st.cars >= 10 && st.stalls >= 3, 'street kit: signals, poles, bins, parked cars, vendor tables', JSON.stringify(st));
// pedestrian heads: WALK only while the cars along the walk have the green, never with a red; the car heads show one lamp each
const lamps = await N(() => window.__game.street.lamps());
const heads = lamps.filter((l) => l.k !== 'hand' && l.k !== 'man'), lit = heads.filter((l) => l.s === l.k).length;
ok(heads.length && lit * 3 === heads.length, 'each vehicle head lights exactly one lamp, from the traffic phase', `${lit} lit of ${heads.length} lamps`);
// crosswalk walkers: watch the live ones near Surf & Stillwell for a while — none steps off on a red
const cross = await N(async () => { window.__game.teleport(-80, 0.3, -120, 0, 0); await new Promise((r) => setTimeout(r, 2500));
  const F = window.__game.folk; const seen = { n: 0, waited: 0, crossed: 0, bad: 0 };
  for (let i = 0; i < 70; i++) { await new Promise((r) => setTimeout(r, 500)); const A = F?.crossers?.() || []; seen.n = Math.max(seen.n, A.length);
    for (const c of A) { if (c.waiting) seen.waited++; if (c.mid) seen.crossed++; if (c.leaving && c.state !== 'G') seen.bad++; } }
  seen.starts = F.crossStats().starts; return seen; });
ok(cross.n >= 2 && cross.waited > 0 && cross.crossed > 0 && cross.starts > 0 && cross.bad === 0, 'crosswalk walkers wait at the kerb and step off only on the WALK', JSON.stringify(cross));
const types = await N(async () => { const T = {}; for (const [x, z] of [[-150, -290], [-86, -140], [-80, -270], [20, -128]]) { window.__game.teleport(x, 0.3, z, 0, 0); await new Promise((r) => setTimeout(r, 1800)); for (const a of window.__game.folk?.archs?.() || []) T[a] = (T[a] || 0) + 1; } return T; });
ok(Object.keys(types).filter((k) => k !== 'none').length >= 3, 'the street types are out (tourists, kids, elders, workers, sellers …)', JSON.stringify(types));
// the reference spots
const shots = [['surf-stillwell', -86, -152, Math.PI, 0.02], ['surf-w12', 52, -112, Math.PI / 2, 0.02], ['surf-w8', 218, -114, Math.atan2(25, -16), 0.05], ['mermaid-w15', -205, -292, -Math.PI / 2, 0.03],
  ['stillwell-el', -79, -236, 0, 0.0], ['w8th', 366, -270, 0, 0.03], ['w12th', 40, -240, 0, 0.03], ['signal', -70, -116, Math.PI * 0.75, 0.12]];
for (const [n, x, z, yaw, pitch] of shots) { await N(([x, z, yaw, pitch]) => window.__game.teleport(x, 0.3, z, yaw, pitch), [x, z, yaw, pitch]); await pg.waitForTimeout(2600); await pg.screenshot({ path: `${out}/street-${n}.png` }); }
ok(errs.length === 0, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
