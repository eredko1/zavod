// Two-client online test: node qa/mp-test.mjs [map] [outdir]
import { chromium } from '/Users/eugene/Code/node_modules/playwright-core/index.mjs';
const map = process.argv[2] || 'railyard', out = process.argv[3] || '/tmp';
const room = 'qa' + Math.random().toString(36).slice(2, 7);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--mute-audio'] });
const mk = async (name) => { const p = await browser.newPage({ viewport: { width: 960, height: 540 } }); p.on('pageerror', e => console.log(name, 'PAGEERROR', e.message)); p.on('console', m => { const t = m.text(); if (/\[net\]|error/i.test(t) && !/RGBE|deprecated/.test(t)) console.log(name, t); });
  await p.goto(`http://localhost:8790/?qa=1&mp=1&room=${room}&map=${map}&pose=hero&ai=0&name=${name}`); await p.waitForFunction(() => window.__game?.ready && window.__ctx?.net?.connected, null, { timeout: 90000 }); return p; };
const A = await mk('ALPHA'); const B = await mk('BRAVO');
await A.waitForTimeout(3000);
// put B 7 m in front of A, looking back at A
const a = await A.evaluate(() => { const p = window.__ctx.player.position; return [p.x, p.y, p.z, window.__ctx.player.yaw]; });
await B.evaluate(([x, y, z, yaw]) => { const fx = -Math.sin(yaw), fz = -Math.cos(yaw); window.__game.teleport(x + fx * 7, y, z + fz * 7, yaw + Math.PI, 0); }, a);
await A.evaluate(([x, y, z, yaw]) => { window.__game.teleport(x, y, z, yaw, 0); }, a);
await B.waitForTimeout(2500);
console.log('peers A/B', await A.evaluate(() => window.__ctx.net.peers), await B.evaluate(() => window.__ctx.net.peers));
await A.screenshot({ path: `${out}/mp-A.png` }); await B.screenshot({ path: `${out}/mp-B.png` });
// B aims at A's chest and fires until A dies
const hp0 = await A.evaluate(() => window.__ctx.player.health);
for (let i = 0; i < 12; i++) { await B.evaluate(() => { const c = window.__ctx.camera; c.rotation.x = -0.12; window.__game.fire(1); }); await B.waitForTimeout(160); }
await A.waitForTimeout(1500);
console.log('A health', hp0, '->', await A.evaluate(() => [window.__ctx.player.health, window.__ctx.player.dead, window.__ctx.state]));
console.log('B scores', JSON.stringify(await B.evaluate(() => window.__ctx.net.scores())));
await A.waitForTimeout(4500);
console.log('A after respawn', await A.evaluate(() => [window.__ctx.player.health, window.__ctx.player.dead, window.__ctx.state]));
await B.screenshot({ path: `${out}/mp-B2.png` });
await browser.close();
