// Soc Tav jukebox sync: node qa/juke-test.mjs — two browsers in the bar; A feeds the jukebox, B hears the same song at the same second
import pw from 'playwright-core';
const { chromium } = pw;
const URL = `http://localhost:${process.env.PORT || 8790}/?qa=1&map=coney&ai=0&time=night&room=jkqa${process.pid}`;
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
async function open(name) {
  const pg = await b.newPage({ viewport: { width: 900, height: 560 } }); pg.on('pageerror', (e) => { fails++; console.log('PAGEERROR', name, e.message); });
  await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
  await pg.goto(URL + `&name=${name}`, { timeout: 180000 }); await pg.waitForFunction(() => window.__game?.ready && window.__game.tavern, null, { timeout: 180000 });
  await pg.evaluate(() => window.__game.setState('playing'));
  await pg.evaluate(() => { const T = window.__game.tavern, d = T.door; window.__game.teleport(T.bar.x0 + 2, d[1], T.zone.oz + 20, Math.PI, 0); }); await pg.waitForTimeout(1500);
  return pg;
}
const A = await open('JA'), B = await open('JB');
ok((await A.evaluate(() => window.__game.tavern.state().inBar)) && (await B.evaluate(() => window.__game.tavern.state().inBar)), 'both in the bar');
await A.waitForTimeout(4000);
await A.evaluate(() => window.__game.tavern.juke('Nutcracker Sandman (Remastered)'));
let ra, rb; for (let i = 0; i < 25; i++) { await A.waitForTimeout(1000); ra = await A.evaluate(() => window.__game.tavern.radio()); rb = await B.evaluate(() => window.__game.tavern.radio()); if (ra.now && rb.now === ra.now) break; }
ok(ra.now === 'Nutcracker Sandman (Remastered)', 'A hears the pick', ra.now);
ok(rb.now === ra.now, 'B hears the same song', rb.now);
const ta = Math.max(...ra.qa.map((q) => q.playing ? q.t : 0)), tb = Math.max(...rb.qa.map((q) => q.playing ? q.t : 0));
ok(Math.abs(ta - tb) < 3, 'same second', `${ta} vs ${tb}`);
await b.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
