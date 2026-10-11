// The Q's whole run, car by car: Stillwell -> W 8 St (lower level) -> Ocean Pkwy -> Brighton Beach and back, sampled every
// SAMPLE_DT s of train time. At every sample each car's body (an inset box) must not cut a collider (walls, pillars, columns),
// a tree crown, and both of its trucks must ride on a deck (an el mesh just under the rails), not in the air or sunk into one.
// Screenshots from beside the track at the worst spots. node qa/q-route-test.mjs [outdir]   (PORT=8790 by default)
import { chromium } from 'playwright-core';
const out = process.argv[2] || '/tmp', LINE = process.env.LINE || 'Q';
const SAMPLE_DT = 0.25, SHOTS = 4;
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const pg = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
await pg.goto(`http://localhost:${process.env.PORT || 8790}/?qa=1&map=coney&mode=chill&ai=0&time=day`, { timeout: 150000 });
await pg.waitForFunction(() => window.__game?.ready && window.__game.subway?.line, null, { timeout: 150000 });
await pg.evaluate(() => { window.__game.setState('playing'); window.__ctx.camera.getObjectByName('viewmodel').visible = false; });

// ---- the obstacles: collider boxes (inset), tree crowns (spheres), and the el decks to ride on ----
await pg.evaluate(async (LINE) => {
  const THREE = await import('three'), { MeshBVH, acceleratedRaycast } = await import('three-mesh-bvh'), ctx = window.__ctx, U = window.__game.subway.line(LINE);
  const IN = 0.05, CELL = 16, hash = new Map(), key = (i, j) => i + ',' + j;
  ctx.colliders.forEach((bx, n) => { if (!bx?.isBox3 || bx.isEmpty()) return; const s = bx.max.clone().sub(bx.min); if (s.x > 200 || s.z > 200) return;   // ground / zone slabs
    if (s.x > 30 && s.z > 30) return;   // a rotated building's conservative AABB (osmkit footprint), not drawn geometry: the Ocean Pkwy shop's reaches the el, its walls are 15 m off
    for (let i = Math.floor(bx.min.x / CELL); i <= Math.floor(bx.max.x / CELL); i++) for (let j = Math.floor(bx.min.z / CELL); j <= Math.floor(bx.max.z / CELL); j++) (hash.get(key(i, j)) || hash.set(key(i, j), []).get(key(i, j))).push(n); });
  const trees = []; ctx.scene.traverse((o) => { if (!o.isInstancedMesh || !/leaf|canopy|tree/i.test(o.name + '|' + (o.material?.name || ''))) return; if (/horizon/.test(o.name)) return;   // horizon: far backdrop, never near the el
    o.updateMatrixWorld(true); o.geometry.computeBoundingSphere(); const bs = o.geometry.boundingSphere, m = new THREE.Matrix4(), c = new THREE.Vector3();
    for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); m.premultiply(o.matrixWorld); c.copy(bs.center).applyMatrix4(m); const r = bs.radius * m.getMaxScaleOnAxis(); if (r > 0) trees.push([c.x, c.y, c.z, r * 0.8, o.name || o.material.name]); } });
  const decks = []; ctx.scene.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && /^(viaduct|viaductLine|w8th|stillwell|brighton):/.test(o.name) && !/stwCeil|glass|bulb|w8Lamp|sign/i.test(o.name)) { o.geometry.boundsTree ||= new MeshBVH(o.geometry); o.raycast = acceleratedRaycast; decks.push(o); } });
  const ray = new THREE.Raycaster(); ray.firstHitOnly = true;
  // a car body: local x ±HX, y Y0..Y1 above the rail, z ±HZ (the R160 is 3.0 m wide, its floor 1.1 m over the rail)
  const HX = 1.35, Y0 = 1.25, Y1 = 4.1, HZ = 8.7, TRUCK = 18.4 / 2 - 2.6;
  window.__qr = { THREE, U, hash, CELL, trees, decks, ray, colliders: ctx.colliders, IN, HX, Y0, Y1, HZ, TRUCK, LINE };
  window.__qrCheck = () => {
    const Q = window.__qr, M = new THREE.Matrix4(), hits = [];
    Q.U.carMatrices().forEach((arr, c) => { M.fromArray(arr); const e = M.elements, px = e[12], py = e[13], pz = e[14];
      const ax = new THREE.Vector2(e[0], e[2]).normalize(), az = new THREE.Vector2(e[8], e[10]).normalize();   // car local x / z on the ground plane
      const hzX = Math.abs(az.x) * Q.HZ + Math.abs(ax.x) * Q.HX, hzZ = Math.abs(az.y) * Q.HZ + Math.abs(ax.y) * Q.HX, y0 = py + Q.Y0, y1 = py + Q.Y1;
      // colliders: 2D separating-axis test of the car's footprint (an oriented rectangle) against each inset box, plus the height band
      const seen = new Set();
      for (let i = Math.floor((px - hzX) / Q.CELL); i <= Math.floor((px + hzX) / Q.CELL); i++) for (let j = Math.floor((pz - hzZ) / Q.CELL); j <= Math.floor((pz + hzZ) / Q.CELL); j++) for (const n of Q.hash.get(i + ',' + j) || []) {
        if (seen.has(n)) continue; seen.add(n); const bx = Q.colliders[n], mn = bx.min, mx = bx.max;
        if (mx.y - Q.IN <= y0 || mn.y + Q.IN >= y1) continue;
        const x0 = mn.x + Q.IN, x1 = mx.x - Q.IN, z0 = mn.z + Q.IN, z1 = mx.z - Q.IN; if (x1 <= x0 || z1 <= z0) continue;
        if (x1 < px - hzX || x0 > px + hzX || z1 < pz - hzZ || z0 > pz + hzZ) continue;   // world axes
        const cx = (x0 + x1) / 2 - px, cz = (z0 + z1) / 2 - pz, ex = (x1 - x0) / 2, ez = (z1 - z0) / 2;
        const sep = (u, h) => Math.abs(cx * u.x + cz * u.y) > h + ex * Math.abs(u.x) + ez * Math.abs(u.y);
        if (sep(ax, Q.HX) || sep(az, Q.HZ)) continue;
        hits.push({ kind: 'collider', c, at: [+px.toFixed(1), +py.toFixed(1), +pz.toFixed(1)], box: [mn.x, mn.y, mn.z, mx.x, mx.y, mx.z].map((v) => +v.toFixed(1)) }); }
      // tree crowns: sphere vs the car's box
      for (const [tx, ty, tz, r, name] of Q.trees) { const dx = tx - px, dz = tz - pz; if (dx * dx + dz * dz > (Q.HZ + r + 2) ** 2) continue;
        const lx = dx * ax.x + dz * ax.y, lz = dx * az.x + dz * az.y, qx = Math.max(-Q.HX, Math.min(Q.HX, lx)), qz = Math.max(-Q.HZ, Math.min(Q.HZ, lz)), qy = Math.max(y0, Math.min(y1, ty));
        if ((lx - qx) ** 2 + (lz - qz) ** 2 + (ty - qy) ** 2 < r * r) hits.push({ kind: 'tree', c, at: [+px.toFixed(1), +py.toFixed(1), +pz.toFixed(1)], tree: [tx, ty, tz, r].map((v) => +v.toFixed(1)), name }); }
      // the deck: straight down from each truck, the first el surface must be just under the rail (not metres down, not above it)
      for (const s of [-1, 1]) { const o = new THREE.Vector3(0, 3, s * Q.TRUCK).applyMatrix4(M), rail = new THREE.Vector3(0, 0, s * Q.TRUCK).applyMatrix4(M).y;
        Q.ray.set(o, new THREE.Vector3(0, -1, 0)); Q.ray.far = 12; const h = Q.ray.intersectObjects(Q.decks, false)[0];
        const gap = h ? rail - h.point.y : Infinity;
        if (!(gap > -0.05 && gap < 0.75)) hits.push({ kind: gap === Infinity ? 'no deck' : gap < 0 ? 'sunk in deck' : 'over deck', c, at: [+o.x.toFixed(1), +rail.toFixed(2), +o.z.toFixed(1)], gap: +gap.toFixed(2), on: h?.object.name || null }); }
    });
    return hits;
  };
}, LINE);

// ---- sample one whole cycle from the start of the Stillwell dwell ----
const info = await pg.evaluate(() => { const U = window.__qr.U; U.skew(U.until('STW') + 0.01); return { cycle: U.state().cycle, stops: U.stops() }; });
console.log(`${LINE}: cycle ${info.cycle} s, stops ${info.stops.map((q) => `${q.id}@${q.s}`).join(' ')}`);
const all = await pg.evaluate(async ({ cycle, DT }) => {
  const U = window.__qr.U, raf = () => new Promise((r) => requestAnimationFrame(() => r())), res = []; let t = 0, wall = performance.now();
  await raf(); await raf();
  while (t < cycle) { const hits = window.__qrCheck(), st = U.state(); for (const h of hits) res.push({ t: +t.toFixed(2), head: st.head, leg: st.leg, ...h });
    const real = (performance.now() - wall) / 1000; wall = performance.now(); U.skew(DT - real); t += DT; await raf(); }   // the wall clock runs on too: skew only the rest of each step
  return res;
}, { cycle: info.cycle, DT: SAMPLE_DT });

const by = {}; for (const h of all) (by[h.kind] ||= []).push(h);
for (const k of Object.keys(by)) { console.log(`  ${k}: ${by[k].length}`); for (const h of by[k].filter((_, i) => i % Math.ceil(by[k].length / 8) === 0)) console.log('   ', JSON.stringify(h)); }
// where: clusters of hits 40 m across, with how many and what they hit (the box or tree)
for (const k of ['collider', 'tree']) { const cl = []; for (const h of by[k] || []) { const c = cl.find((q) => Math.hypot(q.at[0] - h.at[0], q.at[2] - h.at[2]) < 40); if (c) c.n++; else cl.push({ at: h.at, n: 1, what: h.box || h.tree || '', name: h.name || '' }); } for (const c of cl) console.log(`  ${k} x${c.n} near ${c.at.join(',')} ${JSON.stringify(c.what)} ${c.name}`); }
for (const k of ['collider', 'tree']) ok(!by[k], `no ${k} inside a ${LINE} car over the whole run`, by[k] ? `${by[k].length} hits, first at t ${by[k][0].t} s, car at ${by[k][0].at}` : '');
const off = [...(by['no deck'] || []), ...(by['over deck'] || []), ...(by['sunk in deck'] || [])];
ok(!off.length, `every ${LINE} truck rides on a deck just under its rails`, off.length ? `${off.length} off-deck samples, first ${JSON.stringify(off[0])}` : '');

// ---- screenshots from beside the track at the worst spots (or along the run when it's clean) ----
const spots = []; for (const h of all) if (!spots.some((q) => Math.hypot(q.at[0] - h.at[0], q.at[2] - h.at[2]) < 60)) spots.push(h);
const views = spots.length ? spots.slice(0, SHOTS) : [];
if (!views.length) { const s = info.stops; for (const f of [0.08, 0.2, 0.33, 0.45]) views.push({ t: f * info.cycle, kind: 'clean' }); }
await pg.evaluate(() => window.__game.setState('paused'));
for (const [i, v] of views.entries()) {
  await pg.evaluate((t) => { const U = window.__qr.U; U.skew(((U.until('STW') + t) % U.state().cycle) + 0.01); }, v.t);
  await pg.waitForTimeout(400);
  await pg.evaluate((c) => { const Q = window.__qr, M = new Q.THREE.Matrix4().fromArray(Q.U.carMatrices()[c ?? 2]), e = M.elements, p = new Q.THREE.Vector3(e[12], e[13], e[14]), x = new Q.THREE.Vector3(e[0], 0, e[2]).normalize(), z = new Q.THREE.Vector3(e[8], 0, e[10]).normalize();
    const cam = window.__ctx.camera; cam.position.copy(p).addScaledVector(x, 22).addScaledVector(z, -14).setY(p.y + 4); cam.lookAt(p.x, p.y + 1.5, p.z); document.querySelectorAll('#menu, .menu, #pause, .overlay').forEach((d) => (d.style.display = 'none')); }, v.c);
  await pg.waitForTimeout(500); const f = `${out}/${LINE.toLowerCase()}-route-${i}-${v.kind.replace(/ /g, '')}.png`; await pg.screenshot({ path: f }); console.log('  shot', f, v.at ? `at ${v.at}` : `t ${v.t.toFixed(0)} s`);
}
ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
