// Real car models (GLB) for the kinds that have one; everything else stays the lofted carkit body. Loaded once before the
// map builds (world.js), normalised into the carkit frame (+x = front, ground at y 0, centred), and handed out as clones for
// driven / remote cars or as per-mesh InstancedMeshes for parked rows. Materials follow the three.js car example, minus
// transmission (it re-renders the scene every frame): tinted see-through glass instead.
// Models: coupe = "Ferrari 458 Italia" by vicent091036 (https://sketchfab.com/models/57bf6cc56931426e87494f554df1dab6), CC-BY 4.0,
// via the three.js examples. Owned by: main.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { carSpec } from './carkit.js';

const SRC = { coupe: { url: './assets/models/cars/ferrari.glb', ao: './assets/models/cars/ferrari_ao.png' } };
const M = {};   // kind -> { root: Group (normalised), parts: [{ geo, mat, m4, body }] }
let loading = null;

export function loadCarModels(ctx) {
  if (loading) return loading;
  const draco = new DRACOLoader(); draco.setDecoderPath('./vendor/three/examples/jsm/libs/draco/');
  const gl = new GLTFLoader(); gl.setDRACOLoader(draco);
  const touch = !!ctx?.lite;
  loading = Promise.all(Object.entries(SRC).map(async ([kind, s]) => {
    try {
      const g = await gl.loadAsync(s.url), scene = g.scene;
      const body = touch ? new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.6, roughness: 0.35 }) : new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.9, roughness: 0.45, clearcoat: 1, clearcoatRoughness: 0.03 });
      const details = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.4 });
      const glass = new THREE.MeshStandardMaterial({ color: 0x9aa7ae, metalness: 0.25, roughness: 0.05, transparent: true, opacity: 0.38, depthWrite: false });
      scene.traverse((o) => { if (!o.isMesh) return; const n = o.name;
        if (n === 'body') o.material = body; else if (/^rim_|^trim$/.test(n)) o.material = details; else if (n === 'glass') o.material = glass;
        else if (o.material?.isMeshPhysicalMaterial && o.material.transmission > 0) o.material = glass;
        o.castShadow = n === 'body'; o.receiveShadow = true; });
      // AO / contact shadow card under the car (the example's baked shadow)
      const ao = await new THREE.TextureLoader().loadAsync(s.ao).catch(() => null);
      if (ao) { const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.655 * 4, 1.3 * 4), new THREE.MeshBasicMaterial({ map: ao, blending: THREE.MultiplyBlending, toneMapped: false, transparent: true, depthWrite: false })); sh.name = 'aoShadow'; sh.rotation.x = -Math.PI / 2; sh.renderOrder = 2; scene.add(sh); }
      // normalise: front along +x (the front wheels are the ones named *_f*), length = the kind's length, wheels on y = 0
      scene.updateMatrixWorld(true);
      const fl = scene.getObjectByName('wheel_fl'), rr = scene.getObjectByName('wheel_rr'), a = new THREE.Vector3(), b = new THREE.Vector3();
      fl?.getWorldPosition(a); rr?.getWorldPosition(b);
      const root = new THREE.Group(), inner = new THREE.Group(); inner.add(scene); root.add(inner);
      const along = Math.abs(a.z - b.z) > Math.abs(a.x - b.x) ? 'z' : 'x', dir = Math.sign(along === 'z' ? a.z - b.z : a.x - b.x) || 1;
      inner.rotation.y = along === 'z' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      root.updateMatrixWorld(true);
      const bb = new THREE.Box3(); scene.traverse((o) => { if (o.isMesh && o.name !== 'aoShadow') bb.expandByObject(o); });
      const len = bb.max.x - bb.min.x, want = carSpec(kind)?.len || len, k = want / (len || 1);
      inner.scale.setScalar(k); root.updateMatrixWorld(true); bb.makeEmpty(); scene.traverse((o) => { if (o.isMesh && o.name !== 'aoShadow') bb.expandByObject(o); });
      inner.position.set(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2); root.updateMatrixWorld(true);
      const parts = []; scene.traverse((o) => { if (o.isMesh) parts.push({ geo: o.geometry, mat: o.material, m4: o.matrixWorld.clone(), body: o.material === body }); });
      M[kind] = { root, parts, body };
    } catch (e) { console.warn('[carmodels]', kind, e?.message || e); }
  }));
  return loading;
}

export const hasCarModel = (kind) => !!M[kind];

/** a car you can drive / a friend's car: a clone in the carkit frame with its own paint colour */
export function carModel(kind, color = 0xb01010) {
  const m = M[kind]; if (!m) return null;
  const g = m.root.clone(true), paint = m.body.clone(); paint.color = new THREE.Color(color);
  g.traverse((o) => { if (o.isMesh && o.material === m.body) o.material = paint; });
  return g;
}

/** parked rows: one InstancedMesh per model part; instanceColor tints the paint. transforms = Matrix4 per car (carkit frame → world) */
export function instanceCarModel(kind, transforms, colors, scene) {
  const m = M[kind]; if (!m || !transforms.length) return null; const out = [], t = new THREE.Matrix4();
  for (const p of m.parts) {
    const im = new THREE.InstancedMesh(p.geo, p.mat, transforms.length); im.name = `cars:${kind}:model`;
    transforms.forEach((T, i) => { im.setMatrixAt(i, t.multiplyMatrices(T, p.m4)); if (p.body) im.setColorAt(i, colors[i]); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = p.body; im.receiveShadow = true; im.frustumCulled = false; im.userData.surface = 'metal'; scene.add(im); out.push(im);
  }
  return out;
}
