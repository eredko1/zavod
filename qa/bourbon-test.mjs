// «Бурбон, братва, Гудзон»: Arkasha's ice run (Sammy's ice → back before it melts → a Manhattan), the table regulars
// (Sasha, McGuinness, the Elf), the Elf's magic spliff. node qa/bourbon-test.mjs [outdir]
import { chromium } from 'playwright-core';
const out = process.argv[2] || '/tmp';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 1000, height: 560 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
await pg.goto('http://localhost:8790/?qa=1&map=coney&ai=0&time=day', { timeout: 150000 }); await pg.waitForFunction(() => window.__game?.ready && window.__game.jobs, null, { timeout: 150000 });
await pg.evaluate(() => { window.__game.setState('playing'); window.__game.hangout.give(50); window.__ctx.camera.getObjectByName('viewmodel').visible = false; });
const A = await pg.evaluate(() => window.__game.hangout.arkady());
const toArk = () => pg.evaluate((a) => { const s = a.seat, p = a.pos; window.__game.teleport(s[0], 0, s[2], Math.atan2(-(p[0] - s[0]), -(p[2] - s[2])), -0.1); }, A);
const dlg = () => pg.evaluate(() => [...document.querySelectorAll('.hkch')].map((x) => x.textContent.trim()));
await toArk(); await pg.waitForTimeout(900);
await pg.keyboard.press('KeyF'); await pg.waitForTimeout(400); let ch = await dlg(); ok(ch.some((t) => /Манхэттен/.test(t)), 'Arkasha offers a Manhattan', JSON.stringify(ch));
await pg.keyboard.press('Digit1'); await pg.waitForTimeout(300); await pg.keyboard.press('Digit1'); await pg.waitForTimeout(300); await pg.keyboard.press('Digit1'); await pg.waitForTimeout(300);
let j = await pg.evaluate(() => window.__game.jobs.state()); ok(j?.kind === 'ice', 'ice run starts, marker on Sammy\'s', JSON.stringify(j));
// Sammy: the shop has ice + zebra milk
const d = await pg.evaluate(() => window.__game.hangout.state().deli);
await pg.evaluate((d) => window.__game.teleport(d.counter[0], 0, d.counter[2], Math.atan2(-(d.sammy[0] - d.counter[0]), -(d.sammy[2] - d.counter[2])), 0), d); await pg.waitForTimeout(800);
await pg.keyboard.press('KeyF'); await pg.waitForTimeout(400); await pg.keyboard.press('Digit1'); await pg.waitForTimeout(300); await pg.keyboard.press('Digit1'); await pg.waitForTimeout(300);
ch = await dlg(); const iceK = ch.findIndex((t) => /Bag of ice/.test(t)); ok(iceK >= 0 && ch.some((t) => /Zebra milk/.test(t)), 'Sammy sells ice and zebra milk', JSON.stringify(ch));
if (iceK >= 0) { await pg.keyboard.press('Digit' + (iceK + 1)); await pg.waitForTimeout(300); await pg.keyboard.press('Digit1'); await pg.waitForTimeout(300); }
let st = await pg.evaluate(() => window.__game.hangout.state()); ok(st.inv.includes('ice'), 'bought a bag of ice (it\'s melting)', JSON.stringify({ inv: st.inv, ice: st.iceLeft }));
await pg.keyboard.press('KeyF'); await pg.waitForTimeout(200);
j = await pg.evaluate(() => window.__game.jobs.state()); ok(j?.label && /melting/.test(j.label), 'job switches to "bring it back"', JSON.stringify(j));
// back to Arkasha → the Manhattan
await toArk(); await pg.waitForTimeout(900); await pg.keyboard.press('KeyF'); await pg.waitForTimeout(400);
ch = await dlg(); ok(/лёд/i.test(ch[0] || ''), 'deliver the ice', JSON.stringify(ch)); await pg.keyboard.press('Digit1'); await pg.waitForTimeout(400);
st = await pg.evaluate(() => window.__game.hangout.state()); ok(st.inv.includes('manhattan') && !st.inv.includes('ice'), 'Arkasha shakes a Manhattan («Wunderbar!»)', JSON.stringify(st.inv));
ok(!(await pg.evaluate(() => window.__game.jobs.state())) && (await pg.evaluate(() => window.__game.jobs.done())) >= 1, 'ice run completes');
await pg.keyboard.press('Digit2'); await pg.waitForTimeout(400);
await pg.keyboard.press('KeyB'); await pg.waitForTimeout(800); st = await pg.evaluate(() => window.__game.hangout.state()); ok(st.drunk > 0.3, 'the Manhattan hits', `drunk ${st.drunk}`);
await pg.screenshot({ path: `${out}/bourbon-manhattan.png` });
// the regulars
const vs = await pg.evaluate(() => window.__game.hangout.vendors().map((v) => v.name));
ok(['SASHA', 'McGUINNESS', 'THE ELF'].every((n) => vs.includes(n)), 'Sasha, McGuinness and the Elf are at the table', JSON.stringify(vs));
const elf = await pg.evaluate(() => window.__game.hangout.vendors().find((v) => v.name === 'THE ELF').pos);
await pg.evaluate(([e, a]) => { const dx = e[0] - a[0], dz = e[2] - a[2], L = Math.hypot(dx, dz); const x = e[0] + dx / L * 1.3, z = e[2] + dz / L * 1.3; window.__game.teleport(x, 0, z, Math.atan2(-(e[0] - x), -(e[2] - z)), -0.05); }, [elf, A.pos]); await pg.waitForTimeout(600);
await pg.evaluate(() => window.__game.hangout.state().inv.length && null);
await pg.keyboard.press('KeyF'); await pg.waitForTimeout(400); console.log('dialog', await pg.evaluate(() => document.querySelector('.hkdlg .nm, .nm')?.textContent)); await pg.keyboard.press('Digit2'); await pg.waitForTimeout(300); await pg.keyboard.press('Digit1'); await pg.waitForTimeout(300);
st = await pg.evaluate(() => window.__game.hangout.state()); ok(st.inv.includes('spliff'), 'the Elf rolls a spliff ($10)', JSON.stringify(st.inv));
await pg.screenshot({ path: `${out}/bourbon-regulars.png` });
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
