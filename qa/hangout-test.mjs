// Scripted hangout playthrough on coney: node qa/hangout-test.mjs [outdir]
import { chromium } from '/Users/eugene/Code/node_modules/playwright-core/index.mjs';
const out = process.argv[2] || '/tmp';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--mute-audio'] });
const pg = await browser.newPage({ viewport: { width: 1280, height: 720 } });
pg.on('pageerror', e => console.log('PAGEERROR', e.message)); pg.on('console', m => { const t = m.text(); if (/\[hangout\]|\[coney\]|error/i.test(t) && !/RGBE|deprecated/.test(t)) console.log(t); });
console.log('goto'); await pg.goto('http://localhost:8790/?qa=1&map=coney&ai=0', { timeout: 120000 }); console.log('loaded'); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 150000 }); console.log('ready');
const st = () => pg.evaluate(() => ({ ...window.__game.hangout.state(), pos: window.__ctx.player.position.toArray().map(v => +v.toFixed(1)), mounted: !!window.__ctx.player.mounted, veh: !!window.__ctx.vehicles.mounted }));
const shot = (n) => pg.screenshot({ path: `${out}/hg-${n}.png` });
let s = await st(); console.log('start', JSON.stringify(s));
// go to the online start spot, look at the lobby
await pg.evaluate(() => { const [x, y, z, yaw] = window.__ctx.world.onlineStart; window.__game.teleport(x, y, z, yaw, 0.05); }); await pg.waitForTimeout(1200); await shot('1-start');
// Igor
await pg.evaluate(() => { const [x, , z] = window.__game.hangout.state().igor; window.__game.teleport(x + 2, 0, z + 0.5, Math.PI / 2, 0); }); await pg.waitForTimeout(800); await shot('2-igor');
await pg.evaluate(() => window.__game.hangout.buy()); console.log('after buy', JSON.stringify(await st()));
// lobby elevator: stand at car 0 and ride up (through the real press path)
await pg.evaluate(() => { const [x, y, z] = window.__game.hangout.state().lobby[0]; window.__game.teleport(x, y, z, 0, 0); }); await pg.waitForTimeout(600); await shot('3-lobby');
await pg.evaluate(() => window.__game.hangout.ride('up', 0)); await pg.waitForTimeout(2200); await shot('4-ride'); await pg.waitForTimeout(3000);
s = await st(); console.log('after up', JSON.stringify(s)); await shot('5-top');
await pg.evaluate(() => window.__game.hangout.light()); await pg.waitForTimeout(9000); console.log('high', JSON.stringify(await st())); await shot('6-high');
await pg.evaluate(() => window.__game.hangout.ride('down', 0)); await pg.waitForTimeout(5500); console.log('after down', JSON.stringify(await st()));
await pg.evaluate(() => window.__game.hangout.steal()); await pg.waitForTimeout(800); console.log('after steal', JSON.stringify(await st()));
await pg.evaluate(() => window.__ctx.vehicles.qaDrive(1, 0.2, 3)); await pg.waitForTimeout(3500); console.log('driving', JSON.stringify(await pg.evaluate(() => window.__ctx.vehicles.qaState()))); await shot('7-drive');
await browser.close();
