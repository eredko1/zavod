// Phone HUD taps: node qa/tap-test.mjs — the minimap and weapon strip only act on a deliberate tap (src/tap.js): a quick tap opens
// the map; a thumb resting on it (long press) or sliding across it (drag) doesn't. The strip is one chip that opens into the row;
// tapping a weapon draws it and folds the row (the M9 stays locked in chill until Vitek sells one).
import pw from 'playwright-core';
const { chromium } = pw;
const URL = `http://localhost:${process.env.PORT || 8790}/?qa=1&map=coney&mode=chill&touch=1&time=day`;
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 915, height: 412 }, isMobile: true, hasTouch: true }); const errs = [];
pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto(URL, { timeout: 240000 }); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
await pg.evaluate(() => window.__game.setState('playing')); await pg.waitForTimeout(1500);
const cdp = await pg.context().newCDPSession(pg);
const touch = async (pts, holdMs = 40) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1] }] });
  for (const p of pts.slice(1)) { await pg.waitForTimeout(16); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p[0], y: p[1] }] }); }
  await pg.waitForTimeout(holdMs); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await pg.waitForTimeout(350); };
const centre = (sel) => pg.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
const mapOpen = () => pg.evaluate(() => !!window.__ctx.minimap?.open || !!document.querySelector('.mm-big.on, .bigmap.on'));
const miniSel = await pg.evaluate(() => { const c = [...document.querySelectorAll('canvas, div')].find((e) => { const r = e.getBoundingClientRect(); return r.left < 60 && r.top < 80 && r.width > 80 && r.width < 200 && Math.abs(r.width - r.height) < 4; }); if (!c) return null; c.dataset.qaMini = '1'; return '[data-qa-mini]'; });
ok(!!miniSel, 'found the minimap');
const m = await centre(miniSel);
await touch([m], 700); ok(!(await mapOpen()), 'a thumb resting on the minimap (0.7 s) does not open the map');
await touch([m, [m[0] + 30, m[1] + 10], [m[0] + 60, m[1] + 20]]); ok(!(await mapOpen()), 'a thumb sliding across the minimap does not open the map');
await touch([m]); const opened = await mapOpen(); ok(opened, 'a quick tap opens the map');
if (opened) { await pg.keyboard.press('KeyM'); await pg.waitForTimeout(300); }
// the weapon strip: one chip → tap opens the row → tap AK draws it, the row folds
const folded = await pg.evaluate(() => [...document.querySelectorAll('.inv-strip button')].filter((x) => getComputedStyle(x).display !== 'none').length);
ok(folded === 1, 'the strip is one chip on a phone', String(folded));
await touch([await centre('.inv-strip button.on')]);
const shown = await pg.evaluate(() => [...document.querySelectorAll('.inv-strip button')].filter((x) => getComputedStyle(x).display !== 'none').length);
ok(shown > 2, 'tapping the chip opens the row', String(shown));
const ak = await pg.evaluate(() => { const b = [...document.querySelectorAll('.inv-strip button')].find((x) => x.textContent.trim().endsWith("AK")); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
await touch([ak]); await pg.waitForTimeout(700);
const st = await pg.evaluate(() => ({ cur: window.__ctx.weapons.currentId, open: document.querySelector('.inv-strip').classList.contains('open') }));
ok(/ak/.test(st.cur) && !st.open, 'tapping AK draws it and folds the row', JSON.stringify(st));
ok(errs.length === 0, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
