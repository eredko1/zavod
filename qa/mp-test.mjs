// Two-client online test: node qa/mp-test.mjs [map] [outdir]
// Checks: both connect + see each other, the online meet-up start (W.onlineStart) is a valid standing spot and both start
// near it, the remote player is drawn at the sender's exact position on every level of the map (balconies, pits, subway,
// roofs …), B kills A (victim-authoritative damage, score), A respawns on a valid floor away from B with spawn protection.
// Exit code 1 on any failure.
import { chromium } from 'playwright-core';
const map = process.argv[2] || 'railyard', out = process.argv[3] || '/tmp';
const room = 'qa' + Math.random().toString(36).slice(2, 7);
// per-map level probes: pose names (W.poses) on other floors than the start
const LEVELS = { terminal: ['mezzanine', 'dining', 'platform', 'street'], railyard: ['overpass', 'office_roof', 'platform'], wsp: ['attic', 'fountain'], sbu: ['steps', 'terrace'], zavod: [[-12, 3, 40, 0.3], 'containers'], coney: ['hero', 'beach'] };   // (a [x, y, z, yaw] entry = explicit spot)
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const errs = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mk = async (name) => { const p = await browser.newPage({ viewport: { width: 960, height: 540 } }); p.on('pageerror', e => { errs.push(name + ': ' + e.message); console.log(name, 'PAGEERROR', e.message); }); p.on('console', m => { const t = m.text(); if (/\[net\]|error/i.test(t) && !/RGBE|deprecated|link up|404|Failed to load/.test(t)) console.log(name, t); });
  await p.goto(`http://localhost:8790/?qa=1&mp=1&room=${room}&map=${map}&ai=0&name=${name}`, { timeout: 150000 }); await p.waitForFunction(() => window.__game?.ready && window.__ctx?.net?.connected, null, { timeout: 150000 }); return p; };
const A = await mk('ALPHA'); const B = await mk('BRAVO');
await sleep(3000);
ok((await A.evaluate(() => window.__ctx.net.peers)) === 1 && (await B.evaluate(() => window.__ctx.net.peers)) === 1, 'A and B see each other');
// meet-up start: a valid floor, both players near it
const floorCheck = () => { const c = window.__ctx, p = c.player.position, n = c.ai?.nav; const f = n ? n.floorAt(p.x, p.z, p.y) : p.y; return { pos: p.toArray().map((v) => +v.toFixed(2)), floorOff: +(p.y - f).toFixed(2), free: n ? n.isFree(p.x, p.z, p.y) : true, start: c.world.onlineStart || null }; };
const sa = await A.evaluate(floorCheck), sb = await B.evaluate(floorCheck);
ok(!!sa.start, `map defines an online start ${JSON.stringify(sa.start)}`);
for (const [t, s] of [['A', sa], ['B', sb]]) ok(s.start && Math.hypot(s.pos[0] - s.start[0], s.pos[2] - s.start[2]) < 5 && Math.abs(s.floorOff) < 0.35 && s.free, `${t} starts at the meet-up on a free floor ${JSON.stringify(s)}`);
await sleep(1500);
// remote on the right floor: A visits each level, B must draw A where A really is (3-D)
const aid = await A.evaluate(() => window.__ctx.net.id);
for (const pose of LEVELS[map] || []) {
  const pa = await A.evaluate((n) => { if (Array.isArray(n)) window.__game.teleport(n[0], n[1], n[2], n[3] || 0, 0); else window.__game.pose(n); return window.__ctx.player.position.toArray(); }, pose);
  await sleep(1400);
  const pa2 = await A.evaluate(() => window.__ctx.player.position.toArray());
  const seen = await B.evaluate((id) => { const p = window.__ctx.net.peer(id); return p ? p.pos.toArray() : null; }, aid);
  const d = seen ? Math.hypot(seen[0] - pa2[0], seen[1] - pa2[1], seen[2] - pa2[2]) : 99;
  ok(d < 0.4, `level '${pose}': A at y=${pa2[1].toFixed(2)} (posed ${pa[1].toFixed(2)}), B draws A at y=${seen ? seen[1].toFixed(2) : '-'} (3-D error ${d.toFixed(2)} m)`);
  if (map === 'terminal' && pose === 'mezzanine') {   // screenshot: B on the concourse looking up at A on the balcony
    await B.evaluate(([x, y, z]) => { const bx = x - 14, bz = z + 6; const dx = x - bx, dz = z - bz, dy = y + 1.2 - 1.6; window.__game.teleport(bx, 0, bz, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))); }, pa2);
    await sleep(1200); await B.screenshot({ path: `${out}/mp-${map}-B-sees-A-balcony.png` });
  }
}
// back together: B 7 m in front of A, looking back at A
await A.evaluate(() => { const s = window.__ctx.world.onlineStart; if (s) window.__game.teleport(s[0], s[1], s[2], s[3], 0); });
await sleep(500);
const a = await A.evaluate(() => { const p = window.__ctx.player.position; return [p.x, p.y, p.z, window.__ctx.player.yaw]; });
await B.evaluate(([x, y, z, yaw]) => { const fx = -Math.sin(yaw), fz = -Math.cos(yaw); window.__game.teleport(x + fx * 7, y, z + fz * 7, yaw + Math.PI, 0); }, a);
await A.evaluate(([x, y, z, yaw]) => { window.__game.teleport(x, y, z, yaw, 0); }, a);
await sleep(2500);
await A.screenshot({ path: `${out}/mp-${map}-A.png` }); await B.screenshot({ path: `${out}/mp-${map}-B.png` });
// B aims at A's chest and fires until A dies
const hp0 = await A.evaluate(() => window.__ctx.player.health);
let dead = false;
for (let i = 0; i < 30 && !dead; i++) { await B.evaluate(() => { const c = window.__ctx.camera; c.rotation.x = -0.12; window.__game.fire(1); }); await sleep(160); if (i % 4 === 3) dead = await A.evaluate(() => window.__ctx.player.dead); }
await sleep(1200);
const ad = await A.evaluate(() => [window.__ctx.player.health, window.__ctx.player.dead, window.__ctx.state]);
ok(ad[1], `B killed A: health ${hp0} -> ${JSON.stringify(ad)}`);
const sc = await B.evaluate(() => window.__ctx.net.scores());
ok(sc.some((s) => s.name === 'BRAVO' && s.k === 1) && sc.some((s) => s.name === 'ALPHA' && s.d === 1), 'scores B 1/0, A 0/1 ' + JSON.stringify(sc));
await sleep(4800);
const r = await A.evaluate(() => { const c = window.__ctx, p = c.player.position, n = c.ai?.nav; const f = n ? n.floorAt(p.x, p.z, p.y) : p.y; return { hp: c.player.health, dead: c.player.dead, state: c.state, pos: p.toArray().map((v) => +v.toFixed(1)), floorOff: +(p.y - f).toFixed(2), free: n ? n.isFree(p.x, p.z, p.y) : true, gh: +c.world.groundHeight(p.x, p.z).toFixed(2) }; });
const bpos = await B.evaluate(() => window.__ctx.player.position.toArray());
const dAB = Math.hypot(r.pos[0] - bpos[0], r.pos[2] - bpos[2]);
ok(!r.dead && r.hp === 100 && r.state === 'playing', 'A respawned ' + JSON.stringify(r));
ok(Math.abs(r.floorOff) < 0.35 && r.free, 'respawn spot is a free floor');
ok(dAB > 15, `respawn away from the killer (${dAB.toFixed(1)} m)`);
await B.screenshot({ path: `${out}/mp-${map}-B2.png` });
ok(!errs.length, 'no page errors ' + JSON.stringify(errs.slice(0, 3)));
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
await browser.close(); process.exit(fails ? 1 : 0);
