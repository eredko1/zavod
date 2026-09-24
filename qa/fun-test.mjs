// Fun pack: nitro (Shift) beats plain throttle, N gives a friend $10 over the network, Q horn doesn't error. node qa/fun-test.mjs
import { chromium } from '/Users/eugene/Code/node_modules/playwright-core/index.mjs';
const room = 'fn' + Math.random().toString(36).slice(2, 6);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const errs = [];
const mk = async (n) => { const p = await b.newPage({ viewport: { width: 900, height: 500 } }); p.on('pageerror', (e) => errs.push(n + ': ' + e.message)); await p.goto(`http://localhost:8790/?qa=1&room=${room}&map=coney&ai=0&name=${n}`, { timeout: 150000 }); await p.waitForFunction(() => window.__game?.ready && window.__ctx.net?.connected, null, { timeout: 150000 }); return p; };
const A = await mk('ALPHA'), B = await mk('BRAVO');
await A.waitForFunction(() => window.__ctx.net.peers === 1, null, { timeout: 30000 }).catch(() => {});
// nitro: two 3.5 s runs down Surf Ave-ish open road from the same spot, plain vs Shift
const run = async (shift) => {
  await A.evaluate(() => { const V = window.__ctx.vehicles; if (V.mounted) V.dismount(); window.__game.teleport(-60, 0, 100, -Math.PI / 2, 0); });
  await A.waitForTimeout(400);
  await A.evaluate(() => { const V = window.__ctx.vehicles; const p = window.__ctx.player.position; const c = V.spawnCar(p.x, p.z, -Math.PI / 2, 'sedan', 0x333333, 0); V.mount(c); });
  await A.waitForTimeout(400); await A.keyboard.down('KeyW'); if (shift) await A.keyboard.down('ShiftLeft');
  let top = 0; for (let i = 0; i < 14; i++) { await A.waitForTimeout(250); top = Math.max(top, await A.evaluate(() => Math.abs(window.__ctx.vehicles.mounted?.fwdSpeed || 0))); }
  await A.keyboard.up('KeyW'); if (shift) await A.keyboard.up('ShiftLeft'); return top;
};
const plain = await run(false), nitro = await run(true);
ok(nitro > plain * 1.1, 'nitro is faster', `${plain.toFixed(1)} → ${nitro.toFixed(1)} m/s`);
await A.keyboard.press('KeyQ'); await A.waitForTimeout(300);
// give cash: stand next to BRAVO, N
await A.evaluate(() => { const V = window.__ctx.vehicles; if (V.mounted) V.dismount(); });
await B.evaluate(() => window.__game.teleport(0, 0, 100, 0, 0)); await A.evaluate(() => window.__game.teleport(1.5, 0, 100, 0, 0)); await A.waitForTimeout(2500);
const c0 = await B.evaluate(() => window.__game.hangout.state().cash), a0 = await A.evaluate(() => window.__game.hangout.state().cash);
await A.keyboard.press('KeyN'); await A.waitForTimeout(2500);
const c1 = await B.evaluate(() => window.__game.hangout.state().cash), a1 = await A.evaluate(() => window.__game.hangout.state().cash);
ok(c1 === c0 + 10 && a1 === a0 - 10, 'N gave BRAVO $10', `A ${a0}→${a1} · B ${c0}→${c1}`);
ok(!errs.length, 'no page errors', JSON.stringify(errs));
await b.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
