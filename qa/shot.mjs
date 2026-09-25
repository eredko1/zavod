#!/usr/bin/env node
// Real-GPU headless screenshot harness.
// Usage: node qa/shot.mjs <url> <out.png> [--w 1920] [--h 1080] [--wait "<js expr>"] [--eval "<js>"] [--settle ms] [--console] [--timeout ms]
import { chromium } from 'playwright-core';
import path from 'node:path';

const args = process.argv.slice(2);
const url = args[0]; const out = args[1];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : d; };
const has = (k) => args.includes('--' + k);
const W = +opt('w', 1920), H = +opt('h', 1080);
const waitExpr = opt('wait', 'window.__game && window.__game.ready === true');
const evalJs = opt('eval', null);
const settle = +opt('settle', 1500);
const timeout = +opt('timeout', 90000);

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu',
         '--disable-gpu-vsync', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', m => { const t = `[${m.type()}] ${m.text()}`; logs.push(t); if (has('console')) console.log(t); });
page.on('pageerror', e => { const t = `[pageerror] ${e.message}`; logs.push(t); console.log(t); });
try {
  await page.goto(url, { waitUntil: 'load', timeout });
  await page.waitForFunction(waitExpr, null, { timeout });
  if (evalJs) await page.evaluate(evalJs);
  await page.waitForTimeout(settle);
  const stats = await page.evaluate(() => (window.__game && window.__game.stats) ? window.__game.stats() : null).catch(() => null);
  await page.screenshot({ path: out });
  if (stats && stats.errors && stats.errors.length) console.log('BOOT ERRORS: ' + stats.errors.join(' | '));
  console.log(JSON.stringify({ ok: true, out: path.resolve(out), stats, errors: logs.filter(l => l.startsWith('[pageerror]') || l.startsWith('[error]')) }));
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: String(e.message || e), logs: logs.slice(-40) }));
  try { await page.screenshot({ path: out.replace(/\.png$/, '.fail.png') }); } catch {}
  process.exitCode = 1;
} finally { await browser.close(); }
