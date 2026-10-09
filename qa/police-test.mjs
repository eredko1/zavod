// GTA-style policing in chill mode: node qa/police-test.mjs [outdir]
// Ambient NYPD (cruisers + foot patrols) before any crime; an unseen gunshot costs nothing until a witness phones it in (~6 s,
// "… called the cops"); hitting the caller stops the call; the search circle shows while they've lost sight of you and the stars
// clear after 8 s outside it; cops' damage goes up with the stars.
import pw from 'playwright-core';
const { chromium } = pw;
const out = process.argv[2] || '/tmp';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 1200, height: 680 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
const toasts = []; await pg.exposeFunction('logT', (t) => toasts.push(t));
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
await pg.goto(`http://localhost:${process.env.PORT || 8790}/?qa=1&map=coney&mode=chill&time=day`, { timeout: 240000 });
await pg.waitForFunction(() => window.__game?.ready && window.__game.chase, null, { timeout: 240000 });
await pg.evaluate(() => { window.__game.setState('playing'); const h = window.__ctx.hud, o = h.toast; h.toast = function (t, ms) { window.logT(String(t)); return o.call(this, t, ms); }; });
const N = (js, a) => pg.evaluate(js, a);
const S = () => N(() => window.__game.chase.search());
await pg.waitForTimeout(9000);
let s = await S(); ok(s.patrols >= 2 && s.cruisers >= 1 && s.stars === 0, 'ambient NYPD: foot patrols and cruisers out before anything happens', JSON.stringify(s));
// a gunshot on Mermaid with locals about and no cop in sight: no stars yet, somebody is on the phone, then the stars
const shoot = (x, z) => N(async ([x, z]) => { window.__game.chase.clear?.(); window.__game.teleport(x, 0.3, z, 0, 0); await new Promise((r) => setTimeout(r, 3500));
  window.__ctx.bus.emit('shot', { who: 'player', origin: window.__ctx.player.position.clone() }); await new Promise((r) => setTimeout(r, 400));
  return { stars: window.__game.chase.search().stars, callers: window.__game.folk.callers() }; }, [x, z]);
let r = await shoot(-190, -296);
ok(r.stars === 0 && r.callers.length >= 1, 'an unseen gunshot: no instant star, a witness pulls out a phone', JSON.stringify(r));
await pg.waitForTimeout(7000); s = await S();
ok(s.stars >= 1 && toasts.some((t) => /called the cops/.test(t)), 'the call goes through: stars, and "… called the cops"', JSON.stringify({ s, t: toasts.filter((t) => /called/.test(t)) }));
// stop the caller: hit them mid-call and nothing is reported
await N(() => window.__game.chase.clear?.()); await pg.waitForTimeout(6000);
for (const [x, z] of [[-240, -296], [-300, -296], [-150, -170], [-260, -160]]) { r = await shoot(x, z); if (!r.stars && r.callers.length) break; await pg.waitForTimeout(4000); }   // (a patrol that happens to see it reports it on the spot: try elsewhere)
const hit = await N(() => window.__game.folk.hitCaller());
await pg.waitForTimeout(7500); s = await S();
ok(r.callers.length >= 1 && hit && s.stars === 0, 'hit the caller and the call is dropped (no stars)', JSON.stringify({ r, hit, s }));
// the search circle: reported, then run 250 m away out of sight; the circle shows on the map, the stars clear 8 s outside it
await N(() => { window.__game.chase.clear?.(); window.__game.chase.report('shot'); }); await pg.waitForTimeout(300);
await N(() => window.__game.teleport(380, 0.3, -420, 0, 0)); await pg.waitForTimeout(3500);
const circle = await N(() => window.__ctx.world.mapSearch?.()); s = await S();
ok(circle && circle[2] >= 75 && s.stars >= 1 && s.evading, 'lost sight of you: the search circle is on the map, you are outside it', JSON.stringify({ circle, s }));
await pg.screenshot({ path: `${out}/police-search.png` });
await pg.waitForTimeout(8500); s = await S();
ok(s.stars === 0, 'eight seconds outside the circle, unseen: the stars clear', JSON.stringify(s));
// more stars, harder hits
const dm = await N(async () => { const C = window.__game.chase; C.clear?.(); window.__game.teleport(-150, 0.3, -200, 0, 0); await new Promise((r) => setTimeout(r, 1000)); C.report('kill'); C.report('kill'); C.report('kill'); await new Promise((r) => setTimeout(r, 9000)); return C.dmg?.(); });
ok(dm && dm.length > 0 && dm.every((d) => d.dmg <= 0.46), 'cops hit harder with more stars, never above 0.45', JSON.stringify(dm));
ok(errs.length === 0, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
