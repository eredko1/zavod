// Friends switching maps: node qa/follow-test.mjs — A and B in a room on zavod; A opens "Play with friends" from the pause
// menu, picks wsp, Go → B gets the follow banner, presses J → both on wsp in the same room and see each other.
import { chromium } from 'playwright-core';
const room = 'fo' + Math.random().toString(36).slice(2, 6);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const mk = async (n) => { const p = await b.newPage({ viewport: { width: 960, height: 540 } }); p.on('pageerror', (e) => console.log(n, 'PAGEERROR', e.message));
  await p.goto(`http://localhost:8790/?qa=1&room=${room}&map=zavod&ai=0&name=${n}`, { timeout: 150000 }); await p.waitForFunction(() => window.__game?.ready && window.__ctx.net?.connected, null, { timeout: 150000 }); return p; };
const A = await mk('ALPHA'), B = await mk('BRAVO');
await A.waitForFunction(() => window.__ctx.net.peers === 1, null, { timeout: 30000 }).catch(() => {});
// A: pause → "Friends · switch map" → pick wsp → Go
await A.evaluate(() => window.__ctx.setState('paused')); await A.waitForTimeout(400);
const btn = await A.$('.pause [data-act="friends"]'); ok(!!btn, 'pause menu has Friends · switch map'); await btn.click(); await A.waitForTimeout(500);
ok(await A.evaluate(() => document.querySelector('.zvon')?.classList.contains('on')), 'friends overlay opens');
ok(await A.evaluate((r) => document.querySelector('.zvon .room').value === r, room), 'overlay keeps the current room');
await A.click('.zvon .mapt[data-id="wsp"]'); await A.click('.zvon .join');
await A.waitForURL(/map=wsp/, { timeout: 15000 }); ok(/room=/.test(A.url()) && /name=ALPHA/.test(A.url()), 'A navigates to wsp with room + name', A.url());
const shown = await B.waitForFunction(() => { const f = document.querySelector('.zvfollow'); return f && f.style.display === 'flex' ? f.textContent : null; }, null, { timeout: 15000 }).then((h) => h.jsonValue()).catch(() => null);
ok(!!shown, 'B sees the follow banner', shown || '');
await B.keyboard.press('KeyJ'); await B.waitForURL(/map=wsp/, { timeout: 15000 }).catch(() => {});
ok(/map=wsp/.test(B.url()) && new RegExp('room=' + room).test(B.url()), 'B followed to wsp in the same room', B.url());
await Promise.all([A, B].map((p) => p.waitForFunction(() => window.__game?.ready && window.__ctx.net?.connected, null, { timeout: 150000 })));
const seen = await A.waitForFunction(() => window.__ctx.net.peers === 1, null, { timeout: 30000 }).then(() => true).catch(() => false);
ok(seen, 'A and B see each other on wsp');
await b.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
