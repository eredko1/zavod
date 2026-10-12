// Coney collisions probe: node qa/collide-probe.mjs [npc|player|car|remote|all] [outdir]
// - npc:    walkers (folk), crews (chill.js) and cops (chase.js) sampled 10x a second at street anchors; flags a body centre
//           inside a collider box at foot / torso height (benches, stalls, bins, walls, parked cars).
// - player: walks the player (qaWalk) into benches, stalls, bins and parked cars (nose-on and side-on); flags ending up
//           inside the visible footprint, or stopped by an invisible wall well short of it.
// - car:    every drivable kind: the first-person eye vs the cabin (inside the roof / doors, clearance to the shell in a fan
//           of directions vs the camera near plane, steering wheel in front and on screen); screenshots each view.
// - remote: two clients in one room; every mesh of the friend's figure must be visible and opaque.
// Prints counts; exit code 1 on any flag. PORT=8803 for a non-default server.
import { chromium } from 'playwright-core';
const what = process.argv[2] || 'all', out = process.argv[3] || '/tmp';
const PORT = process.env.PORT || 8790;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let flags = 0; const report = (bad, msg, x = '') => { console.log((bad ? 'FLAG ' : 'OK   ') + msg, x); if (bad) flags++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const open = async (q = '') => {
  const pg = await browser.newPage({ viewport: { width: 1100, height: 620 } });
  pg.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await pg.goto(`http://localhost:${PORT}/?qa=1&map=coney&mode=chill&time=day${q}`, { timeout: 180000 });
  await pg.waitForFunction(() => window.__game?.ready && window.__game.crews, null, { timeout: 180000 });
  await sleep(1500); return pg;
};

// in-page: a 4 m bucket grid over the colliders (no slabs) and a "body inside a box" test
const installProbe = () => {
  const ctx = window.__ctx, W = ctx.world.W || {};
  const P = window.__probe = { grid: new Map(), n: -1, stats: {}, ex: {} };
  const parked = new Set((ctx.world.parkedCars || []).map((c) => c.box).filter(Boolean));
  for (const c of ctx.world.parkedCars || []) for (const b of c.boxes || []) parked.add(b);
  const vehicle = new Set((ctx.vehicles?.list || []).map((v) => v.box));
  const build = () => { P.grid.clear(); P.n = ctx.colliders.length;
    for (const b of ctx.colliders) { if (!b || b.isEmpty?.() || b.min.y < -900) continue; const sx = b.max.x - b.min.x, sz = b.max.z - b.min.z; if (sx * sz > 2000) continue;
      for (let i = Math.floor(b.min.x / 4); i <= Math.floor(b.max.x / 4); i++) for (let j = Math.floor(b.min.z / 4); j <= Math.floor(b.max.z / 4); j++) { const k = i * 65536 + j; (P.grid.get(k) || P.grid.set(k, []).get(k)).push(b); } } };
  // centre within r of a box spanning [y+0.3, y+1.4] (shins to chest): a body there is standing in it
  P.inside = (x, y, z, r = 0.15) => { if (ctx.colliders.length !== P.n) build(); const l = P.grid.get(Math.floor(x / 4) * 65536 + Math.floor(z / 4)); if (!l) return null;
    for (const b of l) { if (b.min.y < -900 || b.max.y <= y + 0.3 || b.min.y >= y + 1.4) continue; if (x > b.min.x - r && x < b.max.x + r && z > b.min.z - r && z < b.max.z + r) return b; } return null; };
  P.kind = (b, y) => parked.has(b) ? 'parkedCar' : vehicle.has(b) ? 'vehicle' : b.max.y - y < 0.7 ? 'low(bench/planter)' : b.max.y - y < 1.3 ? 'mid(stall/bin/rail)' : 'tall(wall/pole)';
  P.sample = (src, id, x, y, z, info) => { const s = P.stats[src] || (P.stats[src] = { samples: 0, hits: 0, ids: new Set(), hitIds: new Set(), kinds: {} }); s.samples++; s.ids.add(id);
    const b = P.inside(x, y, z); if (!b) return; s.hits++; s.hitIds.add(id); const k = P.kind(b, y); s.kinds[k] = (s.kinds[k] || 0) + 1;
    const e = P.ex[src] || (P.ex[src] = []); if (e.length < 12 && !e.some((q) => q.id === id)) e.push({ id, at: [x, y, z].map((v) => +v.toFixed(2)), box: [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map((v) => +v.toFixed(2)), k, ...info }); };
  P.tick = () => {
    for (const n of window.__game.folk?.state()?.near || []) if (n.mode === 'walk' || n.mode === 'stand') P.sample('folk:' + n.mode, n.name + '/' + n.avatar + '/' + n.zone, n.pos[0], n.pos[1], n.pos[2], { zone: n.zone });
    for (const t of window.__game.crews.state().thugs) if (t.st !== 'dead') P.sample('crews', t.id, t.pos[0], t.pos[1], t.pos[2], { st: t.st });
    for (const u of window.__game.chase?.state?.()?.units || []) if (!u.dead) P.sample('cops', u.kind + JSON.stringify(u.pos).length + u.kind, u.pos[0], u.pos[1], u.pos[2], {});
  };
  P.timer = setInterval(P.tick, 100);
  P.dump = () => Object.fromEntries(Object.entries(P.stats).map(([k, s]) => [k, { samples: s.samples, hits: s.hits, npcs: s.ids.size, npcsInside: s.hitIds.size, kinds: s.kinds, ex: (P.ex[k] || []).slice(0, 5) }]));
  return true;
};

if (what === 'npc' || what === 'all') {
  const pg = await open();
  await pg.evaluate(installProbe);
  // anchors: spread across the folk spots that walk (Surf, Stillwell, Mermaid, the boardwalk, crosswalks, shop doors)
  const anchors = await pg.evaluate(() => { const L = ((window.__ctx.world.W || window.__ctx.world).folkSpotsList || []).filter((s) => s.pose === 'walk' && !s.sub && !s.train && (s.y || 0) < 1);
    L.sort((a, b) => a.x - b.x || a.z - b.z); const n = 10, out = []; for (let i = 0; i < n; i++) { const s = L[Math.floor((i + 0.5) * L.length / n)]; if (s) out.push([s.x, s.y || 0, s.z, s.zone]); } return out; });
  console.log('anchors', JSON.stringify(anchors.map((a) => [Math.round(a[0]), Math.round(a[2]), a[3]])));
  for (const [x, y, z] of anchors) {
    await pg.evaluate(([x, y, z]) => { window.__game.teleport(x + 2.5, y, z + 2.5, 0, 0); }, [x, y, z]);
    await sleep(9000);
  }
  // crews: a talking crew walks up to you, marks wander (nav path / straight line); cops come for you with two stars
  const crewSpots = anchors.filter((_, i) => i % 3 === 0);
  for (const [x, y, z] of crewSpots) {
    await pg.evaluate(([x, y, z]) => { window.__game.teleport(x + 2.5, y, z + 2.5, 0, 0); window.__game.crews.gang('ru', 'talk', 3); window.__game.crews.mark(6); window.__game.crews.mark(10); window.__game.chase?.stars?.(2); window.__game.chase?.spawn?.('cop', 10, 18); }, [x, y, z]);
    await sleep(12000);
    await pg.evaluate(() => { window.__game.chase?.clear?.(); });
  }
  const st = await pg.evaluate(() => window.__probe.dump());
  for (const [k, s] of Object.entries(st)) report(s.hits > 0, `npc ${k}: ${s.hits}/${s.samples} samples inside a collider · ${s.npcsInside}/${s.npcs} npcs`, JSON.stringify(s.kinds));
  for (const [k, s] of Object.entries(st)) for (const e of s.ex) console.log('   ', k, JSON.stringify(e));
  await pg.close();
}

if (what === 'player' || what === 'all') {
  const pg = await open('&ai=0');
  // targets: { name, c: centre, f: forward unit (long axis), len, w (visible footprint), y }
  const targets = await pg.evaluate(() => {
    const W = window.__ctx.world.W || window.__ctx.world, me = window.__ctx.player.position, T = [];
    const near = (L, n) => L.slice().sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z)).slice(0, n);
    for (const b of near((W.benches || []).map((b) => ({ ...b })), 3)) T.push({ name: 'park bench', c: [b.x, 0, b.z], f: [Math.cos(b.face), -Math.sin(b.face)], len: 1.9, w: 0.5, sides: ['side'] });   // benches stand in rows of three: end-on you meet the next one
    for (const s of (W.stalls || []).slice(0, 3)) T.push({ name: 'vendor stall', c: [s[0], 0, s[1]], f: [1, 0], len: 2.3, w: 1.0 });
    for (const c of near((window.__ctx.world.parkedCars || []).filter((c) => !c.gone && (c.y || 0) < 0.5), 4)) { const K = { sedan: [4.7, 1.8], cab: [4.8, 1.82], hatch: [4.2, 1.76], suv: [4.75, 1.9], coupe: [4.45, 1.94], muscle: [4.8, 1.9], van: [5.2, 1.98] }[c.kind] || [4.7, 1.8];
      T.push({ name: 'parked ' + c.kind, c: [c.x, c.y || 0, c.z], f: [Math.cos(c.ry || 0), -Math.sin(c.ry || 0)], len: K[0], w: K[1] }); }
    return T; });
  let pass = 0, inside = 0, wall = 0;
  for (const t of targets) for (const side of t.sides || ['end', 'side']) {
    const res = await pg.evaluate(async ({ t, side }) => {
      const [fx, fz] = t.f, ax = side === 'end' ? [fx, fz] : [-fz, fx], half = side === 'end' ? t.len / 2 : t.w / 2;
      const sx = t.c[0] + ax[0] * (half + 3), sz = t.c[2] + ax[1] * (half + 3);
      window.__game.teleport(sx, t.c[1], sz, Math.atan2(ax[0], ax[1]), 0);   // facing back at the centre
      await new Promise((r) => setTimeout(r, 300));
      await window.__ctx.player.qaWalk({ x: 0, y: 1 }, 2.2, { sprint: true });
      const p = window.__ctx.player.position, dx = p.x - t.c[0], dz = p.z - t.c[2];
      const along = dx * fx + dz * fz, across = -dx * fz + dz * fx;   // in the object's frame
      const inFoot = Math.abs(along) < t.len / 2 && Math.abs(across) < t.w / 2;
      const gap = side === 'end' ? Math.abs(along) - t.len / 2 : Math.abs(across) - t.w / 2;   // body centre to the visible surface
      // what stopped us: a box touching the capsule; is it part of the target (inside its footprint + 0.6 m)?
      const touch = window.__ctx.colliders.filter((b) => b.min.y < p.y + 1.4 && b.max.y > p.y + 0.3 && p.x > b.min.x - 0.4 && p.x < b.max.x + 0.4 && p.z > b.min.z - 0.4 && p.z < b.max.z + 0.4);
      const mine = touch.some((b) => { const cx = (b.min.x + b.max.x) / 2 - t.c[0], cz = (b.min.z + b.max.z) / 2 - t.c[2]; return Math.abs(cx * fx + cz * fz) < t.len / 2 + 0.6 && Math.abs(-cx * fz + cz * fx) < t.w / 2 + 0.6; });
      return { inFoot, gap: +gap.toFixed(2), y: +p.y.toFixed(2), on: p.y > t.c[1] + 0.3, other: touch.length > 0 && !mine };
    }, { t, side });
    if (!res.inFoot && res.other) { console.log(`SKIP player → ${t.name} (${side}): stopped by something else first`, JSON.stringify(res)); continue; }
    const bad = res.inFoot && !res.on, invisible = !res.inFoot && res.gap > 0.35 + 0.45;
    if (bad) inside++; else if (invisible) wall++; else pass++;
    report(bad || invisible, `player → ${t.name} (${side}): ${bad ? 'walked INTO it' : invisible ? 'stopped by an invisible wall' : res.on ? 'stepped up on it' : 'stopped at it'}`, JSON.stringify(res));
  }
  console.log(`player: ${pass} ok · ${inside} walked into · ${wall} invisible walls (of ${pass + inside + wall} reached)`);
  await pg.close();
}

if (what === 'car' || what === 'all') {
  const pg = await open('&ai=0&folk=0');
  const kinds = ['sedan', 'suv', 'cab', 'van', 'hatch', 'coupe', 'muscle', 'e34', 'bus'];
  await pg.evaluate(async () => { const ctx = window.__ctx, me = ctx.player.position, car = ctx.vehicles.spawnCar(me.x, me.z, 0, 'sedan', 0x333333, me.y); ctx.vehicles.mount(car); await new Promise((r) => setTimeout(r, 2000)); ctx.vehicles.dismount(); });   // warm-up: the first mount of a session settles late
  for (const kind of kinds) {
    const r = await pg.evaluate(async (kind) => {
      const ctx = window.__ctx, THREE = (await import('three')), me = ctx.player.position;
      if (ctx.vehicles.mounted) ctx.vehicles.dismount();
      // an open stretch of the beach parking: spawn, mount, look straight ahead
      const x = me.x, z = me.z; const car = ctx.vehicles.spawnCar(x, z, 0, kind, 0x8a1c1c, me.y); ctx.vehicles.mount(car);
      for (let i = 0; i < 40 && ctx.camera.position.distanceTo(car.pos) > 7; i++) await new Promise((r) => setTimeout(r, 100));   // the first mount takes a few frames
      await new Promise((r) => setTimeout(r, 900));
      const cam = ctx.camera; cam.updateMatrixWorld(true); car.group.updateMatrixWorld(true);
      const kit = car.body.children.find((o) => o.rotation.y === Math.PI / 2) || car.body;
      const inv = new THREE.Matrix4().copy(kit.matrixWorld).invert(), e = cam.position.clone().applyMatrix4(inv);   // eye in the kit frame (+x front)
      // shell clearance: rays from the eye against the car's own opaque meshes
      const meshes = []; car.group.traverse((o) => { if (o.isMesh && o.visible && !(o.material?.transparent) && o.material?.colorWrite !== false) meshes.push(o); });
      const rc = new THREE.Raycaster(); rc.near = 0; rc.far = 3;
      const dirs = { up: [0, 1, 0], upFwd: [0.5, 0.86, 0], upBack: [-0.5, 0.86, 0], left: [0, 0, -1], right: [0, 0, 1], upLeft: [0, 0.7, -0.7], upRight: [0, 0.7, 0.7], back: [-1, 0, 0], down: [0, -1, 0] };
      const clear = {}; const kq = new THREE.Quaternion(); kit.getWorldQuaternion(kq);
      for (const [k, d] of Object.entries(dirs)) { const v = new THREE.Vector3(...d).normalize().applyQuaternion(kq); rc.set(cam.position, v); const h = rc.intersectObjects(meshes, false)[0]; clear[k] = h ? +h.distance.toFixed(3) : null; }
      // the steering wheel: in front of the eye and on screen, lower half
      const wh = car.steerWheel; const wp = new THREE.Vector3(); wh.getWorldPosition(wp); const we = wp.clone().applyMatrix4(inv), ndc = wp.clone().project(cam);
      let wheelVisible = false; wh.traverse((o) => { if (o.isMesh && o.visible) wheelVisible = true; });
      const K = (await import('/src/world/carkit.js')).carSpec(kind), roof = K ? K.roof : 3.2, own = !car.busKit && !car.carWheels;   // own: a real model / the bus draw their own wheel
      const st = { kind, roof, own, eye: [e.x, e.y, e.z].map((v) => +v.toFixed(3)), near: cam.near, clear, wheel: { kit: [we.x, we.y, we.z].map((v) => +v.toFixed(3)), ndc: [ndc.x, ndc.y].map((v) => +v.toFixed(2)), drawn: wheelVisible } };
      return st;
    }, kind);
    await sleep(400); await pg.screenshot({ path: `${out}/incar-${kind}.png` });
    const c = r.clear, minC = Math.min(...Object.values(c).filter((v) => v != null));
    const noRoof = r.eye[1] > r.roof - 0.1, tight = minC < r.near + 0.08;
    const wheelOff = (r.own || r.kind === 'bus') ? false : !r.wheel.drawn || r.wheel.kit[0] < r.eye[0] + 0.15 || Math.abs(r.wheel.ndc[0]) > 0.6 || r.wheel.ndc[1] > 0 || r.wheel.ndc[1] < -1;
    report(noRoof || tight || wheelOff, `in-car ${kind}: ${noRoof ? 'eye ABOVE the roof · ' : ''}${tight ? `shell ${minC} m from the eye (near ${r.near}) · ` : ''}${wheelOff ? 'steering wheel not in front / off screen · ' : ''}`, JSON.stringify(r));
  }
  await pg.close();
}

if (what === 'remote' || what === 'all') {
  const room = 'qaprobe' + Math.random().toString(36).slice(2, 6);
  const mk = async (name) => { const p = await browser.newPage({ viewport: { width: 960, height: 540 } }); p.on('pageerror', (e) => console.log(name, 'PAGEERROR', e.message));
    await p.goto(`http://localhost:${PORT}/?qa=1&mp=1&room=${room}&map=coney&mode=chill&time=day&ai=0&name=${name}`, { timeout: 180000 }); await p.waitForFunction(() => window.__game?.ready && window.__ctx?.net?.connected, null, { timeout: 180000 }); return p; };
  const A = await mk('ALPHA'), B = await mk('BRAVO');
  await A.waitForFunction(() => window.__ctx.net.peers >= 1, null, { timeout: 30000 }).catch(() => {});
  await sleep(5000);
  // B stands 4 m in front of A, facing A
  const pa = await A.evaluate(() => window.__ctx.player.position.toArray());
  await B.evaluate(([x, y, z]) => window.__game.teleport(x, y, z - 4, Math.PI, -0.05), pa);   // looking +z at A
  await A.evaluate(([x, y, z]) => window.__game.teleport(x, y, z, 0, 0), pa);
  const scan = () => { const out = { heroes: 0, meshes: 0, bad: [] }; window.__ctx.scene.traverse((o) => { if (o.name !== 'hero') return; out.heroes++;
    o.traverse((m) => { if (!m.isMesh) return; out.meshes++; let vis = true; for (let q = m; q; q = q.parent) if (!q.visible) vis = false; const mats = [].concat(m.material);
      for (const mt of mats) { const see = mt.transparent && (mt.opacity < 0.99 || mt.depthWrite === false) || mt.opacity < 0.99 || mt.colorWrite === false || mt.visible === false;
        if ((see && !/lens|glass/i.test(mt.name || '')) || !vis) out.bad.push({ mesh: m.name, mat: mt.name, type: mt.type, transparent: mt.transparent, opacity: mt.opacity, depthWrite: mt.depthWrite, colorWrite: mt.colorWrite, alphaTest: mt.alphaTest, visible: vis }); } }); });
    // the soldier rig under the hero: anything still drawn of it?
    for (const [, p] of []) void p; return out; };
  for (let i = 0; i < 3; i++) { await sleep(2500); const s = await B.evaluate(scan); report(!s.heroes || s.bad.length > 0, `remote figure (pass ${i + 1}): ${s.heroes} heroes · ${s.meshes} meshes · ${s.bad.length} see-through / hidden`, JSON.stringify(s.bad.slice(0, 6))); }
  // close up, looking at the friend's head with their hips off the bottom of the screen: is any part of them frustum-culled
  // while it is on screen? (a cull sphere that misses the mesh pops the whole person out: "see-through")
  await B.evaluate(([x, y, z]) => window.__game.teleport(x, y, z - 1.1, Math.PI, 0.55), pa); await sleep(1500);
  const cull = await B.evaluate(async () => { const THREE = await import('three'), cam = window.__ctx.camera; cam.updateMatrixWorld(true);
    const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)); const out = [];
    window.__ctx.scene.traverse((o) => { if (o.name !== 'hero') return; o.updateMatrixWorld(true); o.traverse((m) => { if (!m.isSkinnedMesh) return;
      const bb = new THREE.Box3().setFromObject(m, true), c = bb.getCenter(new THREE.Vector3()), top = new THREE.Vector3(c.x, bb.max.y - 0.1, c.z).project(cam);
      out.push({ mesh: m.name, onScreen: Math.abs(top.x) < 1 && Math.abs(top.y) < 1 && top.z < 1, culled: m.frustumCulled && !fr.intersectsObject(m) }); }); });
    return out; });
  const popped = cull.filter((c) => c.onScreen && c.culled);
  report(!cull.length || popped.length > 0, `remote figure close-up: ${popped.length}/${cull.length} on-screen meshes frustum-culled`, JSON.stringify(cull));
  await B.screenshot({ path: `${out}/remote-closeup.png` });
  // the friend seen through a parked car's window and in their own car
  await B.screenshot({ path: `${out}/remote-friend.png` });
  await A.evaluate(() => { const me = window.__ctx.player.position; const car = window.__ctx.vehicles.spawnCar(me.x, me.z - 0.5, Math.PI, 'sedan', 0x22305c, me.y); window.__ctx.vehicles.mount(car); });
  await sleep(3000); const s2 = await B.evaluate(scan); report(s2.bad.length > 0, `remote figure driving: ${s2.bad.length} see-through / hidden`, JSON.stringify(s2.bad.slice(0, 6)));
  await B.screenshot({ path: `${out}/remote-friend-driving.png` });
  await A.close(); await B.close();
}

await browser.close();
console.log(flags ? `\n${flags} FLAGGED` : '\nCLEAN'); process.exit(flags ? 1 : 0);
