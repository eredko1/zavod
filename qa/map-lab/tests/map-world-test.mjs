import {chromeOptions} from '../../browser-launch.mjs';
// Synthetic footprints verify human scale, holes, missing heights and real pointer-lock movement.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
const browser = await chromium.launch(chromeOptions({ channel: 'chrome', headless: process.env.QA_HEADED !== '1', args: ['--no-sandbox', '--disable-dev-shm-usage'] }));
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(75000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const coords = list => list.map(([x, z]) => ({ lon: -73.978 + x / 84500, lat: 40.577 - z / 111000 }));
const square = (x, z, size) => coords([[x, z], [x + size, z], [x + size, z + size], [x, z + size], [x, z]]);
let response = { osm3s: { timestamp_osm_base: '2026-09-26T00:00:00Z' }, elements: [
  { type: 'way', id: 1, tags: { building: 'yes', height: '12', 'building:levels': '9' }, geometry: coords([[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20], [0, 0]]) },
  { type: 'way', id: 2, tags: { building: 'yes', 'building:levels': '2' }, geometry: square(30, 0, 10) },
  { type: 'way', id: 3, tags: { building: 'yes' }, geometry: square(-30, 0, 10) },
  { type: 'relation', id: 4, tags: { type: 'multipolygon', building: 'yes', height: '8' }, members: [{ type: 'way', ref: 40, role: 'outer', geometry: square(0, 30, 20) }, { type: 'way', ref: 41, role: 'inner', geometry: square(5, 35, 10) }] },
  { type: 'way', id: 5, tags: { highway: 'residential', width: '7' }, geometry: coords([[-50, -10], [60, -10]]) },
] };
const handler = route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(response) });
const stats = () => page.evaluate(() => window.__generator.world.stats());
const run=async()=>{await page.evaluate(()=>window.__generator.fetchArea(false,document.getElementById('query').value));await page.click('#generate');await page.waitForFunction(()=>!window.__generator.busy);};
try {
  await page.route('**/api/interpreter', handler); await page.goto('http://localhost:8790/qa/map-lab/index.html?qa=1'); await page.waitForFunction(() => window.__generator);
  assert.equal(await page.evaluate(()=>window.__generator.world), null); await run(); assert.equal((await stats()).buildings, 3); assert.equal((await stats()).errors, 1);
  assert.match(await page.textContent('#generation-log'), /way\/3/); assert.match(await page.textContent('#generation-log'), /neither a usable height/);
  const geometry = await page.evaluate(async () => {
    const T = await import('/vendor/three/build/three.module.js'), g = window.__generator.world;
    g.scene.updateMatrixWorld(true);
    const meshes = g.getWorld().selectable.filter(m => m.userData.feature?.height);
    const height = id => { const box = new T.Box3().setFromObject(meshes.find(m => m.userData.feature.id === id)); return box.max.y - box.min.y; };
    const hole = g.plan.buildings.find(b => b.id === 'relation/4').shapes[0].holes[0], x = hole.reduce((s, p) => s + p[0], 0) / hole.length, z = hole.reduce((s, p) => s + p[1], 0) / hole.length;
    const ray = new T.Raycaster(new T.Vector3(x, 100, z), new T.Vector3(0, -1, 0));
    return { height: height('way/1'), estimated: height('way/2'), courtyardHits: ray.intersectObjects(meshes).length, hiddenMissing: !meshes.some(m => m.userData.feature.id === 'way/3'), vertices: g.plan.buildings[0].shapes[0].outer.length };
  });
  assert.equal(geometry.height, 12); assert.ok(Math.abs(geometry.estimated - 6) < 1e-5); assert.equal(geometry.courtyardHits, 0); assert.equal(geometry.hiddenMissing, true); assert.equal(geometry.vertices, 6);
  await page.locator('#geometry-settings > summary').click();await page.fill('#storey', '3.5');await page.click('#generate');await page.waitForFunction(()=>!window.__generator.busy); assert.equal(await page.evaluate(() => window.__generator.world.plan.buildings[1].height.top), 7);
  await page.locator('#generation-info > details > summary').click();const download = page.waitForEvent('download'); await page.click('#log-download'); assert.equal((await download).suggestedFilename(), 'map-generation.json');
  await page.bringToFront(); await page.click('#walk'); await page.waitForFunction(() => document.pointerLockElement?.id === 'world');
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const start = (await stats()).position; await page.keyboard.down('KeyW');
  try { await page.waitForFunction(start => { const p = window.__generator.world.stats().position; return Math.hypot(p[0]-start[0],p[2]-start[2])>.3; }, start, { timeout: 5000 }); } finally { await page.keyboard.up('KeyW'); }
  const end = (await stats()).position; assert.ok(Math.hypot(end[0] - start[0], end[2] - start[2]) > 0.3, 'WASD moves player'); assert.ok(Math.abs(end[1] - 1.725) < 0.001, 'eye height above rendered road');
  await page.evaluate(() => { const g = window.__generator.world, b = g.plan.buildings[0].shapes[0].outer; g.setPosition((b[0][0] + b[1][0]) / 2, b[0][1] - 2, Math.PI); });
  await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW'); await page.waitForTimeout(1200); await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
  assert.ok(await page.evaluate(() => window.__generator.world.stats().position[2] < window.__generator.world.plan.buildings[0].shapes[0].outer[0][1] - 0.25), 'run stops at building wall');
  await page.evaluate(() => document.exitPointerLock()); await page.waitForFunction(() => !document.pointerLockElement); await page.click('#orbit');
  console.log('PASS: extrusion, height policy, courtyard holes, skipped-building log, rebuild, walking and running collisions');
  await mkdir('.tmp/map-lab', { recursive: true }); await page.screenshot({ path: '.tmp/map-lab/osm-3d.png' });
  await page.click('#walk'); await page.waitForFunction(() => document.pointerLockElement?.id === 'world'); await page.screenshot({ path: '.tmp/map-lab/osm-3d-walk.png' }); await page.evaluate(() => document.exitPointerLock()); await page.click('#orbit');
  await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await page.screenshot({ path: '.tmp/map-lab/osm-3d-mobile.png' });
  assert.deepEqual(errors, []); console.log('PASS: desktop/mobile rendering; no page errors');
} finally { await browser.close(); }
