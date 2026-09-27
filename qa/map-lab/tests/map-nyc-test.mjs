import {NYC_SOURCES} from '../data/map-sources.js';
import {chromeOptions} from '../../browser-launch.mjs';
import assert from 'node:assert/strict';
import {loadFixture} from './fixture.mjs';
const {nyc:snapshots}=await loadFixture();
import { chromium } from 'playwright-core';
const browser = await chromium.launch(chromeOptions({ channel: 'chrome', headless: process.env.QA_HEADED !== '1', args: ['--no-sandbox', '--disable-dev-shm-usage'] }));
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } }), errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(75000);
try {
  await page.goto('http://localhost:8790/qa/map-lab/index.html?qa=1'); await page.waitForFunction(() => window.__generator);
  const checks = await page.evaluate(async () => {
    const { terrainFromSnapshots } = await import('/qa/map-lab/render/map-terrain.js'), { planFromNYC } = await import('/qa/map-lab/pipeline/nyc-model.js'), { buildScene, dispose } = await import('/qa/map-lab/render/osm-meshes.js'), { featureID, NYC_SOURCES } = await import('/qa/map-lab/data/map-sources.js'), T = await import('three');
    const origin = [40.5775, -73.978], point = (id, lon, lat, elevation, sub_code) => ({ properties: { source_id: id, elevation, sub_code }, geometry: { type: 'Point', coordinates: [lon, lat] } });
    const samples = [point(0,-73.978,40.5775,10,'300000'),point(0,-73.979,40.5775,20,'300000'),point(3,-73.978,40.578,30,'300000'),point(4,-73.978,40.5775,300,'302000'),point(5,-73.978,40.5775,200,'300020')];
    const terrain = terrainFromSnapshots([{ sourceId: 'nyc-elevation', data: { features: samples } }], origin), src = NYC_SOURCES.find(s => s.id === 'nyc-elevation');
    const ring = [[-73.979,40.577],[-73.978,40.577],[-73.978,40.578],[-73.979,40.578],[-73.979,40.577]], hole = [[-73.9788,40.5772],[-73.9782,40.5772],[-73.9782,40.5778],[-73.9788,40.5778],[-73.9788,40.5772]];
    const f = (id, h) => ({ properties: { doitt_id: id, height_roof: h, ground_elevation: 10 }, geometry: { type: 'Polygon', coordinates: [ring, hole] } });
    const plan = planFromNYC({ sourceId: 'nyc-buildings', data: { features: [f(1,20), f(2,0)] } }, origin), mesh = buildScene(plan); mesh.group.updateMatrixWorld(true);
    const shape = plan.buildings[0].shapes[0], x = shape.holes[0].reduce((a,p) => a+p[0],0)/4, z = shape.holes[0].reduce((a,p) => a+p[1],0)/4, ray = new T.Raycaster(new T.Vector3(x,100,z),new T.Vector3(0,-1,0));
    const result = { samples: terrain.samples.length, min: terrain.min, max: terrain.max, atSample: terrain.sample(0,0), datum: terrain.datum, separateIDs: featureID(src,samples[0]) !== featureID(src,samples[1]), height: plan.buildings[0].height.top, missing: plan.buildings[1].extrude, errors: plan.issues.length, courtyardHits: ray.intersectObjects(mesh.selectable).length }; dispose(mesh.group); return result;
  });
  assert.equal(checks.samples, 3); assert.equal(checks.min, 3.048); assert.equal(checks.max, 9.144); assert.equal(checks.atSample, -3.048); assert.equal(checks.height, 6.096); assert.equal(checks.missing, false); assert.equal(checks.errors, 1); assert.equal(checks.courtyardHits, 0); assert.equal(checks.separateIDs, true);
  console.log('PASS: ground-only classification, feet conversion, sample interpolation, duplicate source IDs, NYC height policy and courtyard holes');
  // Explicit QA replay of pinned API responses; the actual UI never auto-loads these files.

  await page.evaluate(async snaps=>{window.__generator.load({data:null,nyc:snaps});await window.__generator.generate();},snapshots);
  const medianCheck = await page.evaluate(() => { const g = window.__generator.world, median = g.plan.coverage.filter(f => f.sourceId === 'nyc-median'); return { painted: median.filter(f => f.tags.sub_code === '360010' && f.status === 'reference').length, physical: g.plan.details.filter(f => f.sourceId === 'nyc-median').length, paintedMeshes: g.getWorld().selectable.filter(m => m.userData.feature?.sourceId === 'nyc-median' && m.userData.feature.tags.sub_code === '360010').length }; });
  assert.equal(medianCheck.painted, 6); assert.equal(medianCheck.physical, 6); assert.equal(medianCheck.paintedMeshes, 0, 'painted median polygons must not look like physical islands');
  const stats = await page.evaluate(() => window.__generator.world.stats()); assert.ok(stats.buildings > 0); assert.ok(stats.terrain.active); assert.ok(stats.terrain.max < 5, 'roof/bridge elevations do not distort terrain'); assert.equal(await page.textContent('#error'), '');
  const groundChecks = await page.evaluate(() => { const g = window.__generator.world, b = g.plan.buildings.find(b => b.extrude), t = g.getTerrain(); return { groundError: Math.abs(b.ground - (b.groundElevation - t.datum)), hasFiniteMeshes: g.getWorld().selectable.every(m => { const a = m.geometry.attributes.position.array; return a.every(Number.isFinite); }) }; });
  assert.ok(groundChecks.groundError < 1e-8); assert.ok(groundChecks.hasFiniteMeshes);
  await page.evaluate(()=>window.__generator.world.setSourceVisible('nyc-buildings',false)); assert.equal(await page.evaluate(() => window.__generator.world.stats().buildings), 0); await page.evaluate(()=>window.__generator.world.setSourceVisible('nyc-buildings',true));
  await page.evaluate(()=>window.__generator.world.setSourceVisible('nyc-elevation',false)); assert.equal(await page.evaluate(() => window.__generator.world.stats().terrain.active), true, 'markers independent of terrain input');
  await page.screenshot({ path: '.tmp/map-lab/nyc-3d.png' }); await page.bringToFront(); await page.evaluate(()=>window.__generator.world.walk({capture:false})); await page.locator('#world').click(); await page.waitForFunction(() => document.pointerLockElement?.id === 'world'); await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW');
  assert.ok(await page.evaluate(() => { const g = window.__generator.world, p = g.stats().position; return Math.abs(p[1] - g.groundAt(p[0],p[2]) - 1.7) < 1e-6; })); await page.screenshot({ path: '.tmp/map-lab/nyc-3d-walk.png' }); await page.evaluate(() => document.exitPointerLock()); await page.click('#orbit');
  await page.locator('#geometry-settings > summary').click();await page.uncheck('#terrain-enabled');await page.evaluate(()=>window.__generator.generate()); assert.equal(await page.evaluate(() => window.__generator.world.stats().terrain.active), false); await page.fill('#curb-height','0.2');await page.evaluate(()=>window.__generator.generate()); await page.locator('#curb-height').blur();
  assert.ok(await page.evaluate(() => window.__generator.world.plan.details.filter(f => f.sourceId === 'nyc-sidewalk').every(f => Math.abs(f.surfaceHeight-0.24)<1e-8)));
  await page.click('#help-open');await page.waitForFunction(count=>document.querySelectorAll('#source-rows tr').length===count,NYC_SOURCES.length);assert.ok((await page.textContent('#osm-query')).includes('out geom'));await page.screenshot({path:'.tmp/map-lab/map-flow.png'});
  await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); assert.deepEqual(errors, []);
  console.log('PASS: nine source scene, recorded building ground elevations, source visibility, terrain toggle, walking surface height, curb rule, mobile layout', stats);
} finally { await browser.close(); }
