// The block's stores: node qa/stores-test.mjs [outdir] — every store (bodega, pizza, Chinese takeout, liquor) is on the map, you can
// walk in through the door, F talks to whoever's behind the counter, and the first thing on the menu ends up in your bag.
import pw from 'playwright-core';
const { chromium } = pw;
const out = process.argv[2] || '/tmp';
const URL = `http://localhost:${process.env.PORT || 8790}/?qa=1&map=coney&mode=chill&ai=0&time=day`;
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 1200, height: 680 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto(URL, { timeout: 240000 }); await pg.waitForFunction(() => window.__game?.ready && window.__game.tavernPeople, null, { timeout: 240000 });
await pg.evaluate(() => window.__game.setState('playing')); await pg.waitForTimeout(500);
const shops = await pg.evaluate(() => window.__game.stores || []);
ok(shops.length >= 4, 'stores on the map', JSON.stringify(shops.map((s) => s.name)));
let n = 0;
for (const s of shops) {
  // walk in from the door to the customer side of the counter, F, buy the first thing on the menu
  const res = await pg.evaluate(async (s) => {
    const K = window.__game.tavernPeople.kit; K.close(); K.give(40); const inv0 = K.state().inv.length;
    window.__game.teleport(s.door[0], 0.05, s.door[2], 0, 0); await new Promise((r) => setTimeout(r, 300));
    window.__game.teleport(s.counter[0], 0.05, s.counter[2], 0, 0); await new Promise((r) => setTimeout(r, 500));
    window.__ctx.input.pressed.add('KeyF'); await new Promise((r) => setTimeout(r, 400));
    const d = K.state().dialog; if (!d) return { err: 'no dialog' };
    K.choose(0); await new Promise((r) => setTimeout(r, 300)); const st = K.state(); K.close();
    return { vendor: d.name, first: d.choices[0], bought: st.inv.length > inv0, last: st.inv[st.inv.length - 1] };
  }, s);
  ok(res.bought && res.vendor === s.who, `${s.name}: walk in, talk to ${s.who}, buy`, JSON.stringify(res));
  if (n++ === 0) { await pg.evaluate((s) => { window.__game.teleport(s.counter[0], 0.05, s.counter[2], 0, 0); }, s); await pg.waitForTimeout(700); await pg.screenshot({ path: `${out}/store-inside.png` });
    await pg.evaluate((s) => { const dx = s.counter[0] - s.door[0], dz = s.counter[2] - s.door[2]; window.__game.teleport(s.door[0] - dx * 2.5, 0.05, s.door[2] - dz * 2.5, Math.atan2(-dx, -dz) + Math.PI, 0); }, s); await pg.waitForTimeout(700); await pg.screenshot({ path: `${out}/store-front.png` }); }
}
ok(errs.length === 0, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
