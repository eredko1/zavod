// Online co-op waves (src/netwaves.js), 3 headless clients in one coney room: node qa/waves-test.mjs [outdir]
// host election → shared soldiers (same ids, positions ≤ 1.5 m) → a non-host kills one (all see it die + kill feed) →
// a soldier hurts a non-host player → respawn bike within 15 m → the host leaves, another client takes over, waves go on.
import { chromium } from '/Users/eugene/Code/node_modules/playwright-core/index.mjs';
const out = process.argv[2] || '/tmp'; const room = 'wv' + Math.random().toString(36).slice(2, 7);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const errs = [];
const mk = async (n) => {
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  p.on('pageerror', (e) => { errs.push(n + ': ' + e.message); console.log(n, 'PAGEERROR', e.message); });
  p.on('console', (m) => { const t = m.text(); if (/\[netwaves\]/.test(t) || (m.type() === 'error' && !/RGBE|deprecated|404|Failed to load/.test(t))) console.log(n, t.slice(0, 200)); });
  await p.goto(`http://localhost:8790/?qa=1&mp=1&room=${room}&map=coney&name=${n}`, { timeout: 150000 });
  await p.waitForFunction(() => window.__game?.ready && window.__ctx.net?.connected && window.__game.waves, null, { timeout: 150000 });
  p.tag = n; return p;
};
let P = [await mk('ALPHA'), await mk('BRAVO'), await mk('CHARLIE')];
const st = (p) => p.evaluate(() => window.__game.waves.state());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, step = 250) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(step); } return null; }

// 1) one host, everybody agrees
const agreed = await until(async () => { const s = await Promise.all(P.map(st)); const h = s.map((x) => x.hostId); return h[0] && h.every((x) => x === h[0]) && s.filter((x) => x.host).length === 1 ? s : null; }, 20000);
ok(!!agreed, 'one host, all agree: ' + JSON.stringify((agreed || await Promise.all(P.map(st))).map((x) => [x.id, x.host, x.hostId])));
const ids = await Promise.all(P.map((p) => p.evaluate(() => window.__ctx.net.id)));
const hostId = agreed ? agreed[0].hostId : ids.slice().sort()[0];
ok(hostId === ids.slice().sort()[0], 'host is the lowest id ' + hostId);
const H = P[ids.indexOf(hostId)], C = P.filter((p) => p !== H);
console.log('host', H.tag, 'clients', C.map((p) => p.tag).join(','));

// everybody together outside building 2 (the online start)
const start = await H.evaluate(() => window.__ctx.player.position.toArray());
for (const [i, p] of P.entries()) await p.evaluate(([x, y, z, i]) => window.__game.teleport(x + (i - 1) * 1.5, y, z + (i - 1), 0, 0), [...start, i]);

// 2) host starts wave 1 → all three see the same soldiers
await H.evaluate(() => window.__game.waves.start(1));
const w1 = await until(async () => { const s = await st(H); return s.soldiers.filter((x) => !x.dead).length >= 6 ? s : null; }, 15000);
ok(!!w1, 'wave 1 spawned on host: ' + (w1 ? w1.soldiers.length : 0) + ' soldiers');
const banner = await Promise.all(C.map((p) => p.evaluate(() => [window.__game.waves.state().wave, document.querySelector('.wave')?.className || document.body.innerHTML.includes('WAVE 1') ])));
ok(banner.every((x) => x[0] === 1), 'clients got wave 1: ' + JSON.stringify(banner));
await sleep(2500);
await H.evaluate(() => window.__game.freezeAI(true)); await sleep(1200);
const snap = await Promise.all(P.map(st));
const hs = snap[P.indexOf(H)].soldiers.filter((x) => !x.dead);
for (const p of C) {
  const cs = snap[P.indexOf(p)].soldiers.filter((x) => !x.dead && !x.missing);
  const same = hs.length === cs.length && hs.every((h) => cs.some((c) => c.id === h.id));
  let maxd = 0; for (const h of hs) { const c = cs.find((c) => c.id === h.id); if (c) maxd = Math.max(maxd, Math.hypot(h.pos[0] - c.pos[0], h.pos[1] - c.pos[1], h.pos[2] - c.pos[2])); }
  ok(same && maxd < 1.5, `${p.tag} sees the same ${cs.length}/${hs.length} soldiers, max offset ${maxd.toFixed(2)} m`);
}
// same check while they run (unfrozen, sampled together)
await H.evaluate(() => window.__game.freezeAI(false)); await sleep(3000);
{ const s2 = await Promise.all(P.map(st)); const h2 = s2[P.indexOf(H)].soldiers.filter((x) => !x.dead); let maxd = 0, n = 0;
  for (const p of C) for (const c of s2[P.indexOf(p)].soldiers) { const h = h2.find((h) => h.id === c.id); if (h && !c.dead) { n++; maxd = Math.max(maxd, Math.hypot(h.pos[0] - c.pos[0], h.pos[2] - c.pos[2])); } }
  console.log(`INFO moving soldiers: ${n} puppet samples, max offset ${maxd.toFixed(2)} m (render lag included)`); }

// 3) a non-host kills one: aim at it, fire
await H.evaluate(() => window.__game.freezeAI(true)); await sleep(600);
const K = C[0]; const kid = (await st(K)).soldiers.find((x) => !x.dead && !x.missing)?.id;
const kpos = await K.evaluate((id) => window.__game.waves.aimAt(id, 7), kid); await sleep(400);
let dead = false;
for (let i = 0; i < 12 && !dead; i++) {
  await K.evaluate((id) => { window.__game.waves.lookAt(id); }, kid); await sleep(80);
  await K.evaluate(() => window.__game.fire(1)); await sleep(250);
  dead = (await st(H)).soldiers.find((x) => x.id === kid)?.dead;
}
await sleep(800);
const ks = await Promise.all(P.map(st));
ok(dead && ks.every((s) => s.soldiers.find((x) => x.id === kid)?.dead), `${K.tag} killed soldier #${kid} at ${JSON.stringify(kpos)} — dead on all: ${JSON.stringify(ks.map((s) => s.soldiers.find((x) => x.id === kid)?.dead))}`);
const kidK = await K.evaluate(() => window.__ctx.net.id);
ok(ks.every((s) => s.kills.some((k) => k.id === kid && k.k === kidK)), 'kill credited to ' + K.tag + ' on all clients: ' + JSON.stringify(ks.map((s) => s.kills.filter((k) => k.id === kid))));
const feed = await Promise.all(P.map((p) => p.evaluate(() => [...document.querySelectorAll('.k')].map((e) => e.textContent).join(' | '))));
ok(feed.every((f) => /MERCENARY/.test(f)), 'kill feed on all: ' + JSON.stringify(feed));
await K.screenshot({ path: `${out}/waves-kill.png` });

// 4) screenshot from a non-host looking at live puppets
const V = C[1]; const vid = (await st(V)).soldiers.find((x) => !x.dead && !x.missing)?.id;
await V.evaluate((id) => window.__game.waves.aimAt(id, 11), vid); await sleep(1200);
await V.screenshot({ path: `${out}/waves-puppets.png` });

// 5) a soldier damages a non-host player: park the others far away, spawn two right next to the victim
await H.evaluate(() => { window.__game.freezeAI(false); window.__ctx.ai.qaKillAll(); });
const vpos = await V.evaluate(() => window.__ctx.player.position.toArray());
for (const p of P) if (p !== V) await p.evaluate(([x, y, z]) => window.__game.teleport(x + 90, y, z, 0, 0), vpos);
await sleep(1500);
const hp0 = await V.evaluate(() => window.__ctx.player.health);
await H.evaluate(([x, y, z]) => window.__game.waves.spawnAt(x + 9, z + 2, 2), vpos);
const hurt = await until(async () => { const r = await V.evaluate(() => [window.__ctx.player.health, window.__ctx.player.dead, window.__game.waves.state().shotsTaken]); return r[2] > 0 && (r[0] < hp0 || r[1]) ? r : null; }, 20000);
ok(!!hurt, `soldier damaged non-host ${V.tag}: hp ${hp0} -> ${JSON.stringify(hurt)}`);

// 6) respawn → a motorcycle within 15 m
await V.evaluate(() => { const p = window.__ctx.player; if (!p.dead) p.damage(999); });
await sleep(6000);
const bike = await V.evaluate(() => { const p = window.__ctx.player; let best = 1e9; for (const b of window.__ctx.vehicles.list) if (!b.spec?.car) best = Math.min(best, Math.hypot(b.pos.x - p.position.x, b.pos.z - p.position.z)); return [p.dead, +best.toFixed(1), window.__game.waves.state().bikes]; });
ok(!bike[0] && bike[1] < 15, 'respawned with a bike within 15 m: ' + JSON.stringify(bike));

// 7) the host leaves → the lowest remaining id takes over and the waves go on
await H.evaluate(() => { window.__ctx.ai.qaKillAll(); window.__game.waves.start(2); }); await sleep(5000);
const before = await st(C[0]); const liveBefore = before.soldiers.filter((x) => !x.dead && !x.missing).map((x) => x.id);
await H.close(); P = C;
const nextId = (await Promise.all(P.map((p) => p.evaluate(() => window.__ctx.net.id)))).sort()[0];
const took = await until(async () => { const s = await Promise.all(P.map(st)); return s.every((x) => x.hostId === nextId) && s.some((x) => x.host) ? s : null; }, 15000);
ok(!!took, 'new host ' + nextId + ': ' + JSON.stringify((took || await Promise.all(P.map(st))).map((x) => [x.id, x.host, x.hostId, x.wave, x.phase])));
if (took) {
  const NH = P[took.findIndex((x) => x.host)]; const O = P.find((p) => p !== NH);
  const s = await st(NH);
  const kept = liveBefore.filter((id) => s.soldiers.some((x) => x.id === id && !x.dead)).length;
  ok(s.wave === 2 && s.phase === 'active' && kept > 0, `new host carried wave ${s.wave} (${s.phase}), adopted ${kept}/${liveBefore.length} soldiers with the same ids`);
  const o1 = await st(O); await sleep(2500); const o2 = await st(O);
  let moved = 0; for (const x of o2.soldiers) { const y = o1.soldiers.find((q) => q.id === x.id); if (y && !x.dead && Math.hypot(x.pos[0] - y.pos[0], x.pos[2] - y.pos[2]) > 0.5) moved++; }
  ok(o2.hostId === nextId && o2.soldiers.filter((x) => !x.dead).length > 0 && moved > 0, `${O.tag} follows the new host: ${o2.soldiers.filter((x) => !x.dead).length} live puppets, ${moved} moving`);
  await NH.evaluate(() => { window.__ctx.ai.qaKillAll(); });
  const next = await until(async () => { const q = await st(O); return q.wave === 3 && q.phase === 'active' ? q : null; }, 30000, 500);
  ok(!!next, 'waves continue under the new host: ' + JSON.stringify(next ? [next.wave, next.phase, next.alive] : await st(O)));
  await O.screenshot({ path: `${out}/waves-after-migration.png` });
}
ok(!errs.length, 'no page errors ' + JSON.stringify(errs.slice(0, 3)));
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
await b.close(); process.exit(fails ? 1 : 0);
