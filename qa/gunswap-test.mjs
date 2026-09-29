// Weapon switching: node qa/gunswap-test.mjs — collect five guns, switch at random by key / Q / wheel (with reloads) for
// ~60 presses and check every frame that only one gun model is drawn (an old gun used to stay visible next to the new one).
import pw from 'playwright-core';
const b = await pw.chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
const pg = await b.newPage({ viewport: { width: 1000, height: 600 } }); pg.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
await pg.goto(`http://localhost:${process.env.PORT || 8790}/?qa=1&map=coney&ai=0`, { timeout: 180000 }); await pg.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
await pg.evaluate(() => window.__game.setState('playing')); await pg.waitForTimeout(1500);
await pg.evaluate(() => { const W = window.__ctx.weapons; for (const id of ['ak74', 'm24', 'shotgun', 'mp5', 'm4a1']) try { W.collect(id, 30); } catch {}
  let rifle = null; W.viewmodel.traverse((o) => { if (o.name === 'rifle' && !rifle) rifle = o; }); const sway = rifle.parent; window.__bad = []; window.__frames = 0;
  const tick = () => { window.__frames++; const vis = sway.children.filter((c) => c.isGroup && c.visible && c.children.length > 2).map((c) => c.name); if (vis.length > 1) window.__bad.push(vis.join('+')); requestAnimationFrame(tick); }; tick(); });
console.log('bag', JSON.stringify(await pg.evaluate(() => window.__ctx.weapons.bag)));
const keys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'KeyQ'];
for (let r = 0; r < 60; r++) { const k = keys[Math.floor(Math.random() * keys.length)]; await pg.keyboard.press(k); await pg.waitForTimeout(Math.random() < 0.5 ? 40 : 350); if (Math.random() < 0.15) await pg.keyboard.press('KeyR'); if (Math.random() < 0.1) { await pg.mouse.wheel(0, 100); } }
await pg.waitForTimeout(1500);
const r = await pg.evaluate(() => ({ frames: window.__frames, bad: window.__bad.length, sample: [...new Set(window.__bad)].slice(0, 8) }));
const pass = r.frames > 100 && r.bad === 0; console.log((pass ? 'PASS' : 'FAIL') + ' one gun drawn at a time while switching', JSON.stringify(r));
await b.close(); console.log(pass ? 'ALL PASS' : '1 FAILED'); process.exit(pass ? 0 : 1);
