// Coney traffic: cars move and stay on the streets, carjack a car (driver out, you drive), no page errors.
// node qa/traffic-test.mjs [chill]
import { chromium } from 'playwright-core';
const mode = process.argv[2] === 'chill' ? '&mode=chill' : '';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const errs = [];
const p = await b.newPage({ viewport: { width: 960, height: 540 } }); p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://localhost:8790/?qa=1&map=coney&ai=0${mode}`, { timeout: 200000 }); await p.waitForFunction(() => window.__game?.ready, null, { timeout: 200000 });
await p.evaluate(() => window.__game.teleport(-130, 0, -150, -Math.PI / 2, 0)); await p.waitForTimeout(3000);
const s1 = await p.evaluate(() => window.__game.traffic.cars());
ok(s1.length >= 8, 'traffic spawned around you', `${s1.length} cars`);
await p.waitForTimeout(6000);
const s2 = await p.evaluate(() => window.__game.traffic.cars());
let moved = 0; for (const c of s2) { const a = s1.find((q) => q.id === c.id); if (a && Math.hypot(a.x - c.x, a.z - c.z) > 3) moved++; }
ok(moved >= s2.length * 0.5, 'cars are moving', `${moved}/${s2.length}`);
const off = s2.filter((c) => c.road > 0.3); ok(!off.length, 'every car is on the asphalt', off.length ? JSON.stringify(off[0]) : `max ${Math.max(...s2.map((c) => c.road))}`);
const sig = await p.evaluate(() => window.__game.traffic.graph().signals); ok(sig >= 4, 'signals on the big junctions', sig);
// carjack
const id = await p.evaluate(() => window.__game.traffic.toDoor()); await p.waitForTimeout(800);
const before = await p.evaluate(() => window.__game.traffic.state());
ok(before.jackable === id, 'standing at a driver door → F prompt', JSON.stringify(before));
await p.keyboard.press('KeyF'); await p.waitForTimeout(1200);
const after = await p.evaluate(() => ({ st: window.__game.traffic.state(), m: window.__ctx.vehicles.qaState(), thugs: window.__game.crews?.state?.().thugs?.length ?? null }));
ok(after.st.jacked === 1 && after.m?.car, 'carjacked: you are in the driver seat', JSON.stringify(after.m?.kind));
ok(after.thugs == null || after.thugs >= 1, 'the driver got pulled out', `crew/folk count ${after.thugs}`);
p.evaluate(() => window.__ctx.vehicles.qaDrive(1, 0, 3)).catch(() => {}); await p.waitForTimeout(3500);
const sp = await p.evaluate(() => window.__ctx.vehicles.qaState()); ok(sp && Math.hypot(sp.x, sp.z) > 0 && sp.speed > 3, 'you drive it away', `speed ${sp?.speed?.toFixed(1)}`);
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
