// Beach + amusement people: live Rocketbox locals near the beach and the rides, rob one, one fights back, a mugger sticks you
// up (forced via __game.folk.mug), buy cigs / beer / spliff from each hustler type, smoke a cig (no high), no page errors.
// node qa/beachpeople-test.mjs [outdir] [mode: chill|normal]
import { chromium } from 'playwright-core';
const out = process.argv[2] || '/tmp', mode = process.argv[3] || 'chill';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
pg.on('console', (m) => { if (/\[folk\]|\[hustlers\]/.test(m.text())) console.log('  console:', m.text().slice(0, 200)); });
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
await pg.goto(`http://localhost:8790/?qa=1&map=coney${mode === 'chill' ? '&mode=chill' : '&ai=0'}&time=day`, { timeout: 150000 });
await pg.waitForFunction(() => window.__game?.ready && window.__game.crews && window.__game.folk, null, { timeout: 150000 });
await pg.waitForTimeout(3500);   // chill deals you a character ~1.5 s in and walks you to their spot: let that happen before teleporting
await pg.evaluate(() => { window.__game.setState('playing'); window.__game.hangout.give(300); window.__game.crews.calm(1e9); });
const pose = (x, z, yaw = 0) => pg.evaluate(([x, z, yaw]) => { const W = window.__ctx.world; const y = z > 161 ? W.groundHeight(x, z) : 0; window.__game.teleport(x, y, z, yaw, -0.05); }, [x, z, yaw]);
const folk = () => pg.evaluate(() => window.__game.folk.state());
// 1) the beach: live people, realistic avatars
await pose(-20, 200, Math.PI); await pg.waitForTimeout(2500);
let f = await folk();
ok(f.active >= 6 && f.near.every((p) => p.real), 'beach: live realistic people near you', `${f.active} live · ${[...new Set(f.near.map((p) => p.mode))].join('/')} · zones ${[...new Set(f.near.map((p) => p.zone))].join('/')}`);
ok(f.near.some((p) => p.mode === 'lie'), 'sunbathers lying on towels');
await pg.screenshot({ path: `${out}/beach-people.png` });
await pose(-20, 185, 0.4); await pg.waitForTimeout(1200); await pg.screenshot({ path: `${out}/beach-people2.png` });
// 2) the boardwalk + rides
await pose(20, 149, -Math.PI / 2); await pg.waitForTimeout(2000); f = await folk();
ok(f.active >= 6 && f.near.some((p) => p.zone === 'bw' || p.zone === 'rail'), 'boardwalk: strollers are live', `${f.active} live`);
await pg.screenshot({ path: `${out}/boardwalk-people.png` });
await pose(-30, 60, -1.2); await pg.waitForTimeout(2000); f = await folk();
ok(f.active >= 3 && f.near.some((p) => p.zone === 'park' || p.zone === 'queue'), 'rides: people in the amusement area are live', `${f.active} live`);
await pg.screenshot({ path: `${out}/rides-people.png` });
// 3) rob a soft one (forced comply) — hands up, cash
await pose(20, 149, -Math.PI / 2); await pg.waitForTimeout(1500);
const cash0 = (await pg.evaluate(() => window.__game.hangout.state().cash));
const who = await pg.evaluate(() => window.__game.folk.face('soft', 1.5)); await pg.waitForTimeout(500);
const target = await pg.evaluate(() => window.__game.folk.state().robTarget);
ok(!!target, 'F — ROB prompt targets the local in front of you', `${who} → ${target}`);
const robbed = await pg.evaluate(() => window.__game.folk.rob(1)); await pg.waitForTimeout(2200);
const cash1 = (await pg.evaluate(() => window.__game.hangout.state().cash));
ok(!!robbed && cash1 > cash0, 'robbed a local: hands up → cash', `${robbed?.name} $${cash0} → $${cash1}`);
await pg.screenshot({ path: `${out}/folk-robbed.png` });
// 3b) rob a local who's carrying: his piece goes into your bag
await pg.evaluate(() => window.__game.chase?.clear?.());
await pose(-10, 149, -Math.PI / 2); await pg.waitForTimeout(1500);
await pg.evaluate(() => window.__game.folk.face('soft', 1.5)); await pg.waitForTimeout(500);
const armed = await pg.evaluate(() => window.__game.folk.giveGun('deagle'));
const bag0 = await pg.evaluate(() => window.__ctx.weapons.bag);
await pg.evaluate(() => window.__game.folk.rob(1)); await pg.waitForTimeout(3000);
const bag1 = await pg.evaluate(() => window.__ctx.weapons.bag);
ok(!bag0.includes('deagle') && bag1.includes('deagle'), 'robbed a civilian of his gun (into the bag)', `${armed}: ${JSON.stringify(bag0)} → ${JSON.stringify(bag1)}`);
// 3c) the subway: someone waiting on a Stillwell platform, then a rider in the F (board it at Stillwell first)
{ const at = await pg.evaluate(() => window.__game.folk.subway('subway')); await pg.waitForTimeout(1200);
  const c0 = await pg.evaluate(() => window.__game.hangout.state().cash); await pg.evaluate(() => window.__game.folk.subway('subway')); await pg.waitForTimeout(300);
  const r2 = await pg.evaluate(() => window.__game.folk.robLight(1)); await pg.waitForTimeout(600); const c1 = await pg.evaluate(() => window.__game.hangout.state().cash);
  ok(!!r2 && c1 > c0, 'robbed someone on a subway platform', `${JSON.stringify(at)} ${JSON.stringify(r2)} $${c0} → $${c1}`); await pg.screenshot({ path: `${out}/subway-rob.png` }); }
{ await pg.evaluate(() => { const S = window.__game.subway; const u = S.until('STW'); if (u != null) S.skew(u + 2); }); await pg.waitForTimeout(500);
  let boarded = false;
  for (const c of [0, 1, 2]) for (const sx of [2.6, -2.6]) for (const dz of [2.1, -2.1]) { if (boarded) break;
    await pg.evaluate(([c, sx, dz]) => { const car = window.__game.subway.debug().cars[c]; window.__game.teleport(car[0] + sx, 8.6, car[2] + dz, 0, 0); }, [c, sx, dz]); await pg.waitForTimeout(500);
    boarded = await pg.evaluate(() => { const S = window.__game.subway; if (!S.state().door) return false; S.board(); return S.state().aboard; }); }
  await pg.waitForTimeout(1200);
  const c0 = await pg.evaluate(() => window.__game.hangout.state().cash);
  const r2 = await pg.evaluate(() => window.__game.folk.robLight(1, 6)); await pg.waitForTimeout(600); const c1 = await pg.evaluate(() => window.__game.hangout.state().cash);
  ok(boarded && !!r2 && c1 > c0, 'robbed a rider in the F train', `boarded ${boarded} ${JSON.stringify(r2)} $${c0} → $${c1}`); await pg.screenshot({ path: `${out}/train-rob.png` });
  await pg.evaluate(() => window.__game.subway.alight()); await pg.waitForTimeout(300); }
// 4) one fights back: hit a scrappy / tough one
await pose(20, 149, -Math.PI / 2); await pg.waitForTimeout(1500);
await pg.evaluate(() => window.__game.chase?.clear?.());
const hitWho = await pg.evaluate(() => window.__game.folk.hit('tough', 20) || window.__game.folk.hit('scrappy', 20)); await pg.waitForTimeout(2500);
let cr = await pg.evaluate(() => window.__game.crews.state());
const fighter = cr.thugs.find((t) => t.name === hitWho);
ok(!!fighter && (fighter.intent === 'fight' || fighter.st === 'fight'), 'a local you hit fights back', `${hitWho} ${JSON.stringify(fighter && [fighter.type, fighter.intent, fighter.st, fighter.hp])}`);
await pg.screenshot({ path: `${out}/folk-fight.png` });
await pg.evaluate(() => { const p = window.__ctx.player; p.heal?.(); for (const t of window.__game.crews.state().thugs) { } });
// knife him down
for (let i = 0; i < 12; i++) {
  const done = await pg.evaluate((n) => { const p = window.__ctx.player; const t = window.__game.crews.state().thugs.find((x) => x.name === n && x.st !== 'dead'); if (!t) return true; const yaw = Math.atan2(-(t.pos[0] - p.position.x), -(t.pos[2] - p.position.z)); p.yaw = yaw; p.pitch = -0.12; window.__game.fire(1); p.heal?.(); return false; }, hitWho);
  if (done) break; await pg.waitForTimeout(600);
}
cr = await pg.evaluate(() => window.__game.crews.state());
ok(!cr.thugs.some((t) => t.name === hitWho && t.st === 'fight'), 'the fight ends (knife)', JSON.stringify(cr.thugs.filter((t) => t.name === hitWho).map((t) => [t.st, t.hp])));
// 5) a mugger walks up and sticks you up → refuse → he fights
await pg.evaluate(() => { window.__game.chase?.clear?.(); window.__game.crews.calm(0); window.__ctx.player.heal?.(); });
await pose(-60, 148, -Math.PI / 2); await pg.waitForTimeout(2500);
const mugName = await pg.evaluate(() => window.__game.folk.mug(4, 14));
ok(!!mugName, 'a local turns mugger', mugName);
let dlg = null; for (let i = 0; i < 30 && !dlg; i++) { await pg.waitForTimeout(500); dlg = await pg.evaluate(() => window.__game.hangout.state().dialog); }
ok(dlg && dlg.name === mugName, 'the mugger sticks you up (dialogue)', dlg && `${dlg.text} | ${dlg.choices.join(' / ')}`);
await pg.screenshot({ path: `${out}/mugger.png` });
if (dlg) { await pg.evaluate((n) => window.__game.hangout.choose(n - 1), dlg.choices.length); await pg.waitForTimeout(1500); }
const mg = await pg.evaluate(() => window.__game.crews.mugging());
ok(mg && mg.intent === 'fight', 'refuse → he fights', JSON.stringify(mg));
await pg.evaluate(() => { window.__game.crews.calm(1e9); window.__ctx.player.heal?.(); window.__game.chase?.clear?.(); });
// 6) buy cigs / beer / spliff from each hustler type
const H = await pg.evaluate(() => window.__game.hustlers.list());
ok(H.length >= 6 && ['ZHORA', 'TOLIK', 'DEE', 'ARTUR', 'NUTCRACKER'].every((n) => H.some((h) => h.name === n)), 'hustlers placed (4 + the nutcracker guys)', H.map((h) => h.name).join(','));
const buy = async (name, label) => {
  const h = (await pg.evaluate(() => window.__game.hustlers.list())).find((x) => x.name === name);
  await pg.evaluate(([x, y, z]) => { window.__game.teleport(x + 1.4, y, z, Math.PI / 2, -0.1); }, h.pos); await pg.waitForTimeout(700);
  await pg.keyboard.press('KeyF'); await pg.waitForTimeout(400);
  const d = await pg.evaluate(() => window.__game.hangout.state().dialog); const i = d ? d.choices.findIndex((c) => c.startsWith(label)) : -1;
  if (i >= 0) { await pg.evaluate((i) => window.__game.hangout.choose(i), i); await pg.waitForTimeout(300); }
  const s = await pg.evaluate(() => window.__game.hangout.state()); await pg.evaluate(() => window.__game.hangout.close()); return { d, s };
};
let r = await buy('ZHORA', 'Pack of Reds'); ok(r.s.inv.includes('cigs'), 'ZHORA (boardwalk) sells cigs', JSON.stringify(r.s.inv)); await pg.screenshot({ path: `${out}/hustler-zhora.png` });
// smoke one: smoke puffs, no high
await pg.evaluate(() => { const s = window.__game.hangout.state(); while (s.inv.length && s.inv[s.inv.length - 1] !== 'cigs') s.inv.pop(); window.__game.hangout.use(); }); await pg.waitForTimeout(4000);
const hs = await pg.evaluate(() => window.__game.hangout.state()); ok(hs.high === 0 && hs.inv.includes('cigs'), 'a cig: smoke, no high, pack keeps the rest', `high ${hs.high} inv ${JSON.stringify(hs.inv)}`);
await pg.screenshot({ path: `${out}/cig.png` });
await pg.waitForTimeout(6000);
await pg.evaluate(() => { window.__game.hangout.state(); }); await pg.evaluate(async () => { (await import('/src/world/hangkit.js')).kit().inv.length = 0; });   // empty the bag (use() can't burn keep items like the starter Bic, so a use-until-empty loop never ends)
await pg.waitForTimeout(500);
r = await buy('TOLIK', 'Tallboy'); ok(r.s.inv.includes('tallboy'), 'TOLIK (cooler on the sand) sells a tallboy', JSON.stringify({ inv: r.s.inv, d: r.d, cash: r.s.cash, tolik: (await pg.evaluate(() => window.__game.hustlers.list())).find((x) => x.name === 'TOLIK'), me: await pg.evaluate(() => window.__ctx.player.position.toArray().map((v) => +v.toFixed(1))) })); await pg.screenshot({ path: `${out}/hustler-tolik.png` });
r = await buy('DEE', 'Pre-rolled spliff'); ok(r.s.inv.includes('spliff'), 'DEE (beach) sells a spliff', JSON.stringify(r.s.inv));
await pg.evaluate(() => { const K = window.__game.hangout; K.use(); K.use(); }); await pg.waitForTimeout(300);
r = await buy('ARTUR', 'Shot of Jameson'); ok(r.s.inv.includes('jameson'), 'ARTUR (rides) sells booze', JSON.stringify(r.s.inv)); await pg.screenshot({ path: `${out}/hustler-artur.png` });
r = await buy('ZHORA', 'Стопка'); ok(r.s.inv.includes('vodka'), 'vodka shot', JSON.stringify(r.s.inv));
// 7) trash talk happened
f = await folk(); ok(f.stats.barks > 0 || f.stats.muggers > 0, 'locals talk', JSON.stringify(f.stats));
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
