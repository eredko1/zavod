import {chromeOptions} from '../../browser-launch.mjs';
import assert from 'node:assert/strict';
import {loadFixture} from './fixture.mjs';
const {data:osm,nyc:snaps}=await loadFixture();
import { chromium } from 'playwright-core';

const browser = await chromium.launch(chromeOptions({ channel: 'chrome', headless: process.env.QA_HEADED !== '1', args: ['--no-sandbox', '--disable-dev-shm-usage'] }));
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } }), errors = [];
page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(120000);
try {
  await page.goto('http://localhost:8790/qa/map-lab/index.html?qa=1'); await page.waitForFunction(() => window.__generator);
  await page.evaluate(async ({osm,snaps})=>{window.__generator.load({data:osm,nyc:snaps});await window.__generator.generate();},{osm,snaps});
  const result = await page.evaluate(async () => {
    const g = window.__generator.world, terrain = g.getTerrain(), T = await import('three'), { drapeScene } = await import('/qa/map-lab/render/map-terrain.js'), { surfaceIndex, objectVisible } = await import('/qa/map-lab/render/map-surface-index.js');
    // Opposite diagonals and unrelated subdivisions must still describe the same terrain plane.
    const planes = new T.Group();
    for (const [segments, offset, angle] of [[1,0,0],[7,0.04,Math.PI/2],[3,0.19,0]]) {
      const geo = new T.PlaneGeometry(120,120,segments,segments); geo.rotateX(-Math.PI/2); geo.rotateY(angle); geo.translate(3,offset,7);
      const mesh = new T.Mesh(geo, new T.MeshBasicMaterial({side:T.DoubleSide})); mesh.userData.offset = offset; planes.add(mesh);
    }
    drapeScene(planes, terrain); planes.updateMatrixWorld(true);
    // New terrain vertices must retain interpolated UV/color/custom channels and material groups.
    for(const mesh of planes.children){const p=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv;if(!uv||uv.count!==p.count)throw Error('Lost UV channel');for(let i=0;i<p.count;i++)if(!Number.isFinite(uv.getX(i))||!Number.isFinite(uv.getY(i)))throw Error('Invalid UV');}
    const tagged=new T.PlaneGeometry(20,20);tagged.rotateX(-Math.PI/2);const tp=tagged.attributes.position;tagged.setAttribute('heat',new T.Float32BufferAttribute(Array.from({length:tp.count},(_,i)=>tp.getX(i)+2*tp.getZ(i)),1));
    const colored=new Uint8Array(tp.count*3).fill(128);tagged.setAttribute('color',new T.Uint8BufferAttribute(colored,3,true));tagged.addGroup(0,3,0);tagged.addGroup(3,3,1);
    const taggedMesh=new T.Mesh(tagged,new T.MeshBasicMaterial());drapeScene(taggedMesh,terrain);const taggedGeo=taggedMesh.geometry;
    for(let i=0;i<taggedGeo.attributes.position.count;i++){const p=taggedGeo.attributes.position;if(Math.abs(taggedGeo.attributes.heat.getX(i)-p.getX(i)-2*p.getZ(i))>1e-4)throw Error('Custom attribute interpolation failed');if(Math.abs(taggedGeo.attributes.color.getX(i)-128/255)>1e-6)throw Error('Normalized colors lost');}
    if(taggedGeo.groups.length!==2||taggedGeo.groups[1].materialIndex!==1)throw Error('Material groups lost');taggedGeo.dispose();taggedMesh.material.dispose();
    let maxGapError = 0, points = 0;
    for (let x = -53.7; x < 60; x += 4.3) for (let z = -50.3; z < 63; z += 4.7) {
      const ray = new T.Raycaster(new T.Vector3(x,100,z),new T.Vector3(0,-1,0));
      for (const mesh of planes.children) { const hit = ray.intersectObject(mesh)[0]; if (!hit) throw new Error('Terrain clipping lost surface coverage'); maxGapError = Math.max(maxGapError,Math.abs(hit.point.y - terrain.sample(x,z) - mesh.userData.offset)); points++; }
    }
    let maxPlaneError = 0, triangles = 0;
    function inspect(o) {
      if (o.userData.building || o.isInstancedMesh || o.userData.clippedInstance) return;
      if (o.isMesh) {
        const p = o.geometry.attributes.position, index = o.geometry.index, count = index ? index.count : p.count;
        for (let i = 0; i < count; i += 3) {
          const ids = [0,1,2].map(j => index ? index.getX(i+j) : i+j), x = ids.reduce((s,j)=>s+p.getX(j),0)/3, z = ids.reduce((s,j)=>s+p.getZ(j),0)/3;
          const y = ids.reduce((s,j)=>s+p.getY(j),0)/3, offset = p.getY(ids[0])-terrain.sample(p.getX(ids[0]),p.getZ(ids[0]));
          maxPlaneError = Math.max(maxPlaneError, Math.abs(y-terrain.sample(x,z)-offset)); triangles++;
        }
      }
      o.children.forEach(inspect);
    }
    inspect(g.scene);
    const { buildScene, dispose } = await import('/qa/map-lab/render/osm-meshes.js'), original = buildScene({ ...g.plan, buildings: [] });
    const areas = meshes => { const out = new Map(); for (const o of meshes) { const f = o.userData.feature; if (!o.isMesh || !f || f.height) continue; const p = o.geometry.attributes.position, idx = o.geometry.index, count = idx?.count ?? p.count; let area = 0; for (let i = 0; i < count; i += 3) { const [a,b,c] = [0,1,2].map(j => idx ? idx.getX(i+j) : i+j); area += Math.abs((p.getX(b)-p.getX(a))*(p.getZ(c)-p.getZ(a))-(p.getZ(b)-p.getZ(a))*(p.getX(c)-p.getX(a)))/2; } out.set(f.id,(out.get(f.id)||0)+area); } return out; };
    const {clipSurfaceGeometry}=await import('/qa/map-lab/render/map-merge-mesh.js'), cutInput=new T.PlaneGeometry(20,20);cutInput.rotateX(-Math.PI/2);
    const cp=cutInput.attributes.position;for(let i=0;i<cp.count;i++)cp.setY(i,cp.getX(i)*.1+cp.getZ(i)*.2);
    cutInput.setAttribute('heat',new T.Float32BufferAttribute(Array.from({length:cp.count},(_,i)=>cp.getX(i)+2*cp.getZ(i)),1));cutInput.addGroup(0,3,0);cutInput.addGroup(3,3,1);
    const clipped=clipSurfaceGeometry(cutInput,[{outer:[[-5,-5],[5,-5],[5,5],[-5,5]],holes:[[[-2,-2],[-2,2],[2,2],[2,-2]]]}]),cutMesh=new T.Mesh(clipped);cutMesh.userData.feature={id:'clip-probe'};
    if(Math.abs(areas([cutMesh]).get('clip-probe')-316)>.001)throw Error('Clipping lost mask holes or uncovered surface');
    for(let i=0;i<clipped.attributes.position.count;i++){const p=clipped.attributes.position,x=p.getX(i),z=p.getZ(i);if(Math.abs(p.getY(i)-x*.1-z*.2)>1e-5||Math.abs(clipped.attributes.heat.getX(i)-x-2*z)>1e-5||Math.abs(clipped.attributes.uv.getX(i)-(x+10)/20)>1e-5)throw Error('Clipping lost interpolated height/attributes');}
    if(clipped.groups.length!==2||clipped.groups[1].materialIndex!==1)throw Error('Clipping lost material groups');clipped.dispose();cutMesh.material.dispose();
    const {buildDetails}=await import('/qa/map-lab/render/osm-detail-meshes.js'),flush=buildDetails({details:[{id:'flush',rule:'kerb',paths:[[[0,0],[10,0]]],dimensions:{height:0,width:.12}}],issues:[]},()=>{});
    if(flush.selectable.length)throw Error('Zero curb height produced a degenerate solid');dispose(flush.group);
    const beforeAreas = areas(original.selectable), afterAreas = areas(g.getWorld().selectable); let maxAreaError = 0;
    for (const [id,area] of beforeAreas) { if (!afterAreas.has(id)) throw Error(`Lost surface ${id}`); maxAreaError = Math.max(maxAreaError,Math.abs(area-afterAreas.get(id))); } dispose(original.group);
    // Compare the optimized lookup against the existing geometric reference, including edges and visibility.
    let queryError = 0, queries = 0, worstQuery = null;
    const compare = (x,z) => {
      const ray = new T.Raycaster(new T.Vector3(x,10000,z),new T.Vector3(0,-1,0)), hits = ray.intersectObjects(g.getWorld().walkable.filter(objectVisible),false);
      const expected = hits.length ? hits[0].point.y : terrain.sample(x,z), actual = g.groundAt(x,z), error = Math.abs(actual-expected); if (error > queryError) { queryError = error; worstQuery = { x,z,expected,actual,feature:hits[0]?.object.userData.feature?.id }; } queries++;
    };
    const b = g.plan.bounds;
    for (let x = b.x0; x <= b.x1; x += (b.x1-b.x0)/12) for (let z = b.z0; z <= b.z1; z += (b.z1-b.z0)/12) compare(x,z);
    for (const f of g.plan.details.filter(f => f.surface).slice(0,15)) for (const p of f.shapes[0].outer.slice(0,4)) compare(...p);
    const world = g.getWorld(), merge = JSON.stringify(g.plan.merge), geometries = world.selectable.map(o => o.geometry), eye = g.camera.position.toArray();
    g.setSourceVisible('nyc-sidewalk',false);
    const hidden = !world.selectable.some(o => o.userData.feature?.sourceId === 'nyc-sidewalk' && objectVisible(o));
    for (let x = b.x0+1; x < b.x1; x += 35) compare(x, (b.z0+b.z1)/2);
    g.setSourceVisible('nyc-sidewalk',true);
    const visibilityStable = g.getWorld() === world && world.selectable.every((o,i) => o.geometry === geometries[i]) && JSON.stringify(g.plan.merge) === merge && g.camera.position.toArray().every((v,i) => v === eye[i]);
    // A transformed surface with a courtyard exercises holes, local-to-world conversion and parent visibility.
    const shape = new T.Shape([new T.Vector2(0,0),new T.Vector2(20,0),new T.Vector2(20,20),new T.Vector2(0,20)]);
    shape.holes.push(new T.Path([new T.Vector2(5,5),new T.Vector2(5,15),new T.Vector2(15,15),new T.Vector2(15,5)]));
    const geo = new T.ShapeGeometry(shape); geo.rotateX(-Math.PI/2);
    const mesh = new T.Mesh(geo,new T.MeshBasicMaterial({side:T.DoubleSide})), parent = new T.Group(); parent.add(mesh); parent.position.set(12,3,17); parent.rotation.y = .37; parent.updateMatrixWorld(true);
    const idx = surfaceIndex([mesh],()=>-2), hole = new T.Vector3(10,0,-10).applyMatrix4(mesh.matrixWorld), solid = new T.Vector3(2,0,-2).applyMatrix4(mesh.matrixWorld);
    const holeHeight = idx.sample(hole.x,hole.z), solidHeight = idx.sample(solid.x,solid.z); parent.visible = false; const hiddenHeight = idx.sample(solid.x,solid.z);
    geo.dispose(); mesh.material.dispose();
    for (const mesh of planes.children) { mesh.geometry.dispose(); mesh.material.dispose(); }
    return { maxGapError, maxPlaneError, maxAreaError, points, triangles, queryError, worstQuery, queries, hidden, visibilityStable, holeHeight, solidHeight, hiddenHeight, stats:g.stats() };
  });
  assert.ok(result.maxGapError < 0.00005, JSON.stringify(result)); assert.ok(result.maxPlaneError < 0.00005, JSON.stringify(result));
  assert.equal(result.stats.buildings,36); assert.equal(result.stats.errors,1);
  assert.ok(result.queryError < 0.00005, JSON.stringify(result)); assert.ok(result.visibilityStable); assert.ok(result.hidden); assert.equal(result.holeHeight,-2); assert.ok(Math.abs(result.solidHeight-3)<1e-8); assert.equal(result.hiddenHeight,-2);
  assert.ok(result.triangles < 400000, 'terrain subdivision regression: must stay below half of the previous 954k surface triangles');
  assert.ok(result.maxAreaError < .01, 'surface area must survive projection');
  const idleFrames = await page.evaluate(async () => { for (let i=0;i<30;i++) await new Promise(requestAnimationFrame); const r=window.__generator.world.renderer, start=r.info.render.frame; for (let i=0;i<30;i++) await new Promise(requestAnimationFrame); return r.info.render.frame-start; });
  assert.equal(idleFrames,0,'settled orbit view should not redraw');
  await page.screenshot({path:'.tmp/map-lab/terrain-layer-fixed.png'});
  await page.evaluate(()=>{ const g=window.__generator.world; g.camera.position.set(80,90,100); g.camera.lookAt(0,0,0); });
  // Zoom with OrbitControls so animation does not restore the previous target.
  await page.locator('#world').hover(); await page.mouse.wheel(0,-550); await page.waitForTimeout(600);
  await page.screenshot({path:'.tmp/map-lab/terrain-layer-close.png'});
  assert.deepEqual(errors,[]); console.log('PASS: shared terrain planes preserve 4 cm road / 19 cm sidewalk offsets across independent triangulations and full scene',result);
} finally { await browser.close(); }
