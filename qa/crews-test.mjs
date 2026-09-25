// Crews + visitors (coney, normal mode, AI off): POPS / SHADES / Vitek near Table Park, the rasta visitor schedule, a talking
// crew (rolls up, talks, leaves), a robbing crew (robs, scatters when one drops). node qa/crews-test.mjs [outdir]
import { chromium } from '/Users/eugene/Code/node_modules/playwright-core/index.mjs';
const out = process.argv[2] || '/tmp';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 1100, height: 620 } }); const errs = []; pg.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERROR', e.message); });
const toasts = []; await pg.exposeFunction('__t', (t) => toasts.push(t));
await pg.goto('http://localhost:8790/?qa=1&map=coney&ai=0&time=day', { timeout: 150000 }); await pg.waitForFunction(() => window.__game?.ready && window.__game.crews, null, { timeout: 150000 });
await pg.evaluate(() => { const h = window.__ctx.hud; const o = h.toast; h.toast = function (t, ms) { if (typeof t === 'string' && /"/.test(t)) window.__t(t); return o.call(this, t, ms); }; });
const o = await pg.evaluate(() => window.__ctx.world.onlineStart);
const dist = (p) => Math.hypot(p[0] - o[0], p[2] - o[2]);
const pops = await pg.evaluate(() => window.__game.locals.pops().pos); ok(dist(pops) < 80, 'POPS cruises near Table Park', dist(pops).toFixed(0) + ' m');
const shades = await pg.evaluate(async () => (await import('/src/world/hangkit.js')).kit().vendors.find((v) => v.name === 'SHADES').pos.toArray()); ok(dist(shades) < 35, 'SHADES walks round the park', dist(shades).toFixed(0) + ' m');
const vis = await pg.evaluate(() => window.__game.visitor()); const ph = (Date.now() / 1000) % 190;
ok(ph < 135 ? !!vis : !vis, 'rasta visitor matches the clock schedule', JSON.stringify({ ph: ph.toFixed(0), vis }));
await pg.evaluate((o) => window.__game.teleport(o[0], 0, o[2], 0, 0), o); await pg.waitForTimeout(500);
// talking crew
await pg.evaluate(() => window.__game.crews.gang('st', 'talk', 3)); await pg.waitForTimeout(9000);
let c = await pg.evaluate(() => window.__game.crews.state());
ok(toasts.some((t) => /DRE|KEYS|BOOGIE|TAY|SMOKEY|JUJU|BIG MIKE|LIL T/.test(t)), 'the crew talks trash', JSON.stringify(toasts.slice(-3)));
await pg.screenshot({ path: `${out}/crews-talk.png` });
await pg.waitForTimeout(6000); c = await pg.evaluate(() => window.__game.crews.state());
ok(c.thugs.filter((t) => t.type !== 'mk').every((t) => t.st === 'leave'), '…then they roll out', JSON.stringify(c.thugs.map((t) => t.st)));
ok(c.robbed === 0, 'talkers don\'t rob');
// robbing crew
await pg.evaluate((o) => { window.__game.teleport(o[0] + 40, 0, o[2], 0, 0); window.__game.crews.calm(0); }, o); await pg.waitForTimeout(600);
// the park itself is neutral ground and there's a grace minute after a spawn, so step out and clear the grace
await pg.evaluate(() => { window.__game.hangout.give(80); window.__game.crews.gang('ru', 'rob', 2); }); 
await pg.waitForFunction(() => window.__game.crews.state().robbed >= 1, null, { timeout: 25000 }).catch(() => {});
c = await pg.evaluate(() => window.__game.crews.state()); ok(c.robbed >= 1, 'the gopniks rob you', `robbed ${c.robbed}×`);
await pg.screenshot({ path: `${out}/crews-rob.png` });
ok(!errs.length, 'no page errors', JSON.stringify(errs));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
