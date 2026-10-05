// node qa/tools/make-nyc-standin.mjs: builds the NYC stand-in block-out (qa/tools/standin.html) and writes assets/maps/nyc-standin.glb
import pw from 'playwright-core';
import { writeFileSync } from 'node:fs';
const b = await pw.chromium.launch({ channel: 'chrome', headless: true });
const pg = await b.newPage(); pg.on('pageerror', (e) => console.log('ERR', e.message));
await pg.goto(`http://localhost:${process.env.PORT || 8790}/qa/tools/standin.html`); await pg.waitForFunction(() => window.__glb || window.__err, null, { timeout: 60000 });
const err = await pg.evaluate(() => window.__err); if (err) { console.log('ERR', err); process.exit(1); }
const glb = Buffer.from(await pg.evaluate(() => window.__glb), 'base64'); writeFileSync(new URL('../../assets/maps/nyc-standin.glb', import.meta.url), glb);
console.log('wrote assets/maps/nyc-standin.glb', glb.length, 'bytes'); await b.close();
