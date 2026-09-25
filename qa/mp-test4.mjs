// Four-client online test (coney by default): node qa/mp-test4.mjs [map] [outdir]
// Staggered joins (D is a phone: ?touch=1, and shares ALPHA's name → duplicate-name labels), kills, one tab "hidden"
// (rAF stopped + visibility hidden + 4x CPU throttle) for longer than the peer timeout, a car stolen, one client
// reloads (leave + rejoin, same id) and must get its score + the stolen car back via sync; finally one closes (bye).
// Checks: everyone sees everyone, identical K/D + names on all clients, hidden peer kept (AFK) and resynced, stolen car
// hidden for the late joiner (its parked-car collider gone), peer removed on leave. Exit code 1 on any failure.
import { chromium } from 'playwright-core';
const map = process.argv[2] || 'coney', out = process.argv[3] || '/tmp';
const room = 'qa4' + Math.random().toString(36).slice(2, 7);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--mute-audio'] });
const t0 = Date.now(); const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
let fails = 0; const check = (ok, what, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', what, extra); if (!ok) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const url = (name, extra = '') => `http://localhost:8790/?qa=1&room=${room}&map=${map}&ai=0&name=${name}${extra}`;
const ready = (p) => p.waitForFunction(() => window.__game?.ready && window.__ctx?.net?.connected, null, { timeout: 150000 });
const mk = async (tag, name, { touch = false } = {}) => {
  const p = await browser.newPage({ viewport: touch ? { width: 844, height: 390 } : { width: 640, height: 360 }, hasTouch: touch, isMobile: false });
  p.on('pageerror', (e) => console.log(tag, 'PAGEERROR', e.message));
  p.on('console', (m) => { const t = m.text(); if (/\[net\]|error/i.test(t) && !/RGBE|deprecated|link up/.test(t)) console.log(tag, t); });
  await p.goto(url(name, touch ? '&touch=1' : ''), { timeout: 150000 }); await ready(p); log(tag, 'joined'); return p;
};
const until = async (fn, ms = 20000, step = 500) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await sleep(step); } return v; };
const peers = (p) => p.evaluate(() => window.__ctx.net.peers);
const board = (p) => p.evaluate(() => Object.fromEntries(window.__ctx.net.scores().map((s) => [s.id, `${s.name}:${s.k}/${s.d}`])));
const same = async (pages, label) => {
  const r = await until(async () => { const bs = await Promise.all(pages.map(board)); const j = bs.map((b) => JSON.stringify(Object.keys(b).sort().map((k) => [k, b[k]]))); return j.every((x) => x === j[0]) ? bs : null; }, 12000);
  const bs = r || await Promise.all(pages.map(board));
  check(!!r, `boards identical on ${pages.length} clients (${label})`, JSON.stringify(bs[0]));
  if (!r) bs.forEach((b, i) => console.log('   client', i, JSON.stringify(b)));
  return bs[0];
};
const kill = async (shooter, victim, label) => {
  const a = await victim.evaluate(() => { const p = window.__ctx.player.position; return [p.x, p.y, p.z, window.__ctx.player.yaw]; });
  await shooter.evaluate(([x, y, z, yaw]) => { const fx = -Math.sin(yaw), fz = -Math.cos(yaw); window.__game.teleport(x + fx * 7, y, z + fz * 7, yaw + Math.PI, 0); }, a);
  await victim.evaluate(([x, y, z, yaw]) => window.__game.teleport(x, y, z, yaw, 0), a);
  await sleep(1500);
  let dead = false;
  for (let i = 0; i < 40 && !dead; i++) { await shooter.evaluate(() => { window.__ctx.camera.rotation.x = -0.12; window.__game.fire(1); }); await sleep(150); if (i % 4 === 3) dead = await victim.evaluate(() => window.__ctx.player.dead); }
  await sleep(600); dead = dead || await victim.evaluate(() => window.__ctx.player.dead);
  check(dead, `${label}: victim died`);
};

// ---- 1. staggered joins ----
const A = await mk('A', 'ALPHA'); await sleep(2500);
const B = await mk('B', 'BRAVO'); await sleep(2500);
const C = await mk('C', 'CHARLIE'); await sleep(2500);
const D = await mk('D', 'ALPHA', { touch: true });
const all = [A, B, C, D];
const seen = await until(async () => (await Promise.all(all.map(peers))).every((n) => n === 3), 30000);
check(!!seen, 'all 4 clients see 3 peers', JSON.stringify(await Promise.all(all.map(peers))));
const ids = await Promise.all(all.map((p) => p.evaluate(() => window.__ctx.net.id)));
const bs0 = await same(all, 'after join');
const alphas = Object.values(bs0).filter((v) => v.startsWith('ALPHA')).map((v) => v.split(':')[0]);
check(alphas.length === 2 && alphas.includes('ALPHA') && alphas.some((n) => /^ALPHA·[A-Z0-9]{2}$/.test(n)), 'duplicate name ALPHA disambiguated consistently', alphas.join(', '));
log('links A', JSON.stringify(await A.evaluate(() => window.__ctx.net.links())));

// ---- 2. B kills A ----
await kill(B, A, 'B→A'); await sleep(1500);
const b1 = await same(all, 'after B kills A');
check(b1[ids[1]]?.endsWith(':1/0') && b1[ids[0]]?.endsWith(':0/1'), 'B 1/0, A 0/1', `${b1[ids[1]]} ${b1[ids[0]]}`);
await A.screenshot({ path: `${out}/mp4-A.png` }); await B.screenshot({ path: `${out}/mp4-B.png` });

// ---- 3. C goes to background (rAF stops, visibility hidden, CPU throttled) for > TIMEOUT; D kills B meanwhile ----
const cdp = await C.context().newCDPSession(C); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await C.evaluate(() => {
  window.__rafQ = []; window.__rafOrig = window.requestAnimationFrame; window.requestAnimationFrame = (cb) => { window.__rafQ.push(cb); return 0; };
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
});
log('C hidden');
await sleep(2500);
const cAfk = await until(async () => (await Promise.all([A, B, D].map((p) => p.evaluate((cid) => window.__ctx.net.peer(cid)?.afk, ids[2])))).every(Boolean), 8000);
check(!!cAfk, 'others show hidden C as AFK');
await kill(D, B, 'D→B (C hidden)');
await sleep(12000 - 4000);
const kept = await Promise.all([A, B, D].map(peers));
check(kept.every((n) => n === 3), 'hidden C kept by others after 12 s (> 10 s timeout)', JSON.stringify(kept));
await C.evaluate(() => {
  delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange'));
  const q = window.__rafQ; window.requestAnimationFrame = window.__rafOrig; q.forEach((cb) => window.__rafOrig(cb));
});
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
log('C visible');
await sleep(2500);
check((await peers(C)) === 3, 'C still sees 3 peers after returning');
const b2 = await same(all, 'after D kills B while C hidden');
check(b2[ids[3]]?.endsWith(':1/0') && b2[ids[1]]?.endsWith(':1/1'), 'D 1/0, B 1/1', `${b2[ids[3]]} ${b2[ids[1]]}`);
const cNotAfk = await until(async () => !(await A.evaluate((cid) => window.__ctx.net.peer(cid)?.afk, ids[2])), 5000);
check(!!cNotAfk, 'C no longer AFK after return');

// ---- 4. A steals a parked car (hangout) — B's collider list is the control ----
if (map === 'coney') {
  await A.evaluate(() => { const [x, y, z, yaw] = window.__ctx.world.onlineStart; window.__game.teleport(x, y, z, yaw, 0); }); await sleep(1500);
  const st = await A.evaluate(() => {
    const cols = window.__ctx.colliders; const pre = cols.slice(); const ok = window.__game.hangout.steal(); const post = new Set(window.__ctx.colliders);
    const gone = pre.filter((b) => !post.has(b)).map((b) => [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map((v) => +v.toFixed(2)));
    return { ok, gone, stolen: window.__ctx.net.stolen() };
  });
  log('A stole', JSON.stringify(st));
  const hasBox = (p, box) => p.evaluate((bx) => window.__ctx.colliders.some((b) => [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].every((v, i) => Math.abs(v - bx[i]) < 0.02)), box);
  check(st.ok && st.stolen.length === 1 && st.gone.length === 1, 'A stole a car (1 index, 1 collider removed)');
  const box = st.gone[0];
  await sleep(2000);
  for (const [tag, p] of [['B', B], ['C', C], ['D', D]]) check(JSON.stringify(await p.evaluate(() => window.__ctx.net.stolen())) === JSON.stringify(st.stolen) && !(await hasBox(p, box)), `${tag} got the steal live (index + collider gone)`);
  await A.evaluate(() => window.__ctx.vehicles.qaDrive?.(1, 0.15, 2)); await sleep(2500);
  const seesCar = await B.evaluate((aid) => window.__ctx.net.peer(aid)?.veh?.k || null, ids[0]);
  check(!!seesCar && seesCar !== 'bike', 'B sees A driving a car', String(seesCar));

  // ---- 5. D (phone) leaves and rejoins: reload keeps the id; score + stolen car come back via sync ----
  await D.reload({ timeout: 150000 }); await ready(D); log('D rejoined');
  const dId2 = await D.evaluate(() => window.__ctx.net.id);
  check(dId2 === ids[3], 'D kept its id across reload');
  const back = await until(async () => (await Promise.all(all.map(peers))).every((n) => n === 3), 25000);
  check(!!back, 'all 4 see 3 peers after D rejoined', JSON.stringify(await Promise.all(all.map(peers))));
  const dSync = await until(async () => { const s = await D.evaluate(() => window.__ctx.net.stolen()); return JSON.stringify(s) === JSON.stringify(st.stolen) ? s : null; }, 10000);
  check(!!dSync, 'late joiner D learned the stolen car index via sync');
  check(!(await hasBox(D, box)), 'late joiner D: stolen parked car hidden (collider removed)');
  const b3 = await same(all, 'after D rejoined');
  check(b3[ids[3]]?.endsWith(':1/0'), 'D score restored after rejoin', b3[ids[3]]);
  await D.screenshot({ path: `${out}/mp4-D-touch.png` });
}
log('interp', JSON.stringify(await B.evaluate(() => window.__ctx.net.info())));

// ---- 6. B closes the tab: everyone drops it quickly ----
await B.close({ runBeforeUnload: true });
const dropped = await until(async () => (await Promise.all([A, C, D].map(peers))).every((n) => n === 2), 8000);
check(!!dropped, 'B removed on all remaining clients after leaving', JSON.stringify(await Promise.all([A, C, D].map(peers))));
await same([A, C, D], 'after B left');

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
