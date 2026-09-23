// SBU detail pass (critic r2): baked contact occlusion, grass-card clumps, real hedge rows,
// distant tree-line billboards and the lawn clutter (benches, bins, racks, bollards, sign posts, planters). SBU agent.
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { Batch } from './geo.js';
import { LIB, LIB_LAWN, MALL, SAC, PLAZA_C, BUS_LOOP, PIT, STALLER, PSY, ECC, JAVITS, EAST_LAWN, FOUNTAIN, WANG, FREY, ZEBRA, BOUNDS } from './layout.js';

// ---------------------------------------------------------------------------------------------
// baked contact occlusion: mitred gradient skirts around footprints + radial discs under props.
// Drawn with MultiplyBlending on top of the ground, so every wall/planter/tree foot gets a soft
// grounded darkening that the single sun shadow cannot give (there is no SSAO on day maps).
// ---------------------------------------------------------------------------------------------
class DecalSink {
  constructor() { this.pos = []; this.uv = []; }
  quad(a, b, c, d, uva, uvb, uvc, uvd) {   // a,b inner edge · c,d outer edge (each [x,y,z])
    const P = this.pos, U = this.uv;
    P.push(...a, ...b, ...c, ...a, ...c, ...d);
    U.push(...uva, ...uvb, ...uvc, ...uva, ...uvc, ...uvd);
  }
  /** Mitred skirt around an axis-aligned rect: v = 0 at the wall, v = 1 at `w` metres out. */
  ring(x0, z0, x1, z1, w, y = 0.025) {
    const i0 = [0, 0], i1 = [1, 0], o0 = [0, 1], o1 = [1, 1];
    this.quad([x0, y, z0], [x1, y, z0], [x1 + w, y, z0 - w], [x0 - w, y, z0 - w], i0, i1, o1, o0);   // north
    this.quad([x1, y, z1], [x0, y, z1], [x0 - w, y, z1 + w], [x1 + w, y, z1 + w], i0, i1, o1, o0);   // south
    this.quad([x0, y, z1], [x0, y, z0], [x0 - w, y, z0 - w], [x0 - w, y, z1 + w], i0, i1, o1, o0);   // west
    this.quad([x1, y, z0], [x1, y, z1], [x1 + w, y, z1 + w], [x1 + w, y, z0 - w], i0, i1, o1, o0);   // east
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  }
}

function discGeometry(places) {   // places: [{x, y, z, r}]
  const pos = [], uv = [];
  for (const p of places) {
    const r = p.r, y = (p.y ?? 0) + 0.024;
    pos.push(p.x - r, y, p.z - r, p.x + r, y, p.z - r, p.x + r, y, p.z + r,
             p.x - r, y, p.z - r, p.x + r, y, p.z + r, p.x - r, y, p.z + r);
    uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

// building footprints that meet the ground inside the playable area (skirt width in metres)
const AO_RECTS = [
  [LIB.x0, LIB.z0, LIB.x1, LIB.z1, 1.3], [LIB.wingX0, LIB.wingZ0, LIB.x0 + 0.5, LIB.wingZ1, 1.1],
  [SAC.x0, SAC.z0, SAC.x1, SAC.z1, 1.3], [FREY.x0, FREY.z0, FREY.x1, FREY.z1, 1.2],
  [PSY.x0, PSY.z0, PSY.wingX0 + 0.5, PSY.z1, 1.1], [PSY.wingX0, PSY.z0, PSY.x1, PSY.wingZ1, 1.1],
  [ECC.x0, ECC.z0, ECC.x1, ECC.z1, 1.2], [JAVITS.x0 + 8, JAVITS.z0 + 8, JAVITS.x1 - 8, JAVITS.z1 - 8, 1.2],
  [STALLER.nx0, STALLER.nz0, STALLER.nx1, STALLER.nz1, 1.2], [STALLER.ex0, STALLER.nz1, STALLER.ex1, STALLER.ez1, 1.2],
  [-239, -41, -140, 52, 1.2], [-219, -110, -121, -54, 1.2], [-117, -199, -22, -143, 1.2],
  [175, 11, 241, 110, 1.2], [198, -65, 272, 4, 1.2], [-99, 124, -51, 227, 1.1], [-19, 164, 32, 248, 1.1],
  [WANG.x0, WANG.z0, WANG.x1, WANG.z1, 1.4],
];

export function buildDetail(world, M) {
  const { ctx, scene, R, W } = world;
  const B = new Batch(world, M, 'detail');
  const gh = W.groundHeight;
  const j = (a) => (R() - 0.5) * a;

  // ---- contact occlusion -------------------------------------------------------------------
  const sink = new DecalSink();
  for (const [x0, z0, x1, z1, w] of AO_RECTS) sink.ring(x0, z0, x1, z1, w);
  // the fountain basin, the plaza drum and the sunken-plaza retaining walls
  sink.ring(FOUNTAIN.x - 6.2, FOUNTAIN.z - 6.2, FOUNTAIN.x + 6.2, FOUNTAIN.z + 6.2, 1.1);
  sink.ring(PIT.x0, PIT.z0, PIT.x1, PIT.z1, 1.2, PIT.floor + 0.03);
  {
    const em = new THREE.Mesh(sink.geometry(), M.aoEdge);
    em.name = 'sbu:aoEdge'; em.renderOrder = 2; em.frustumCulled = true; scene.add(em);
  }
  // radial contact shadows under every free-standing prop (filled by props.js through W.sbuAOSpots)
  const discs = (W.sbuAOSpots || []).slice();
  for (const [x, z, r] of [[FOUNTAIN.x, FOUNTAIN.z, 9], [PLAZA_C.x, PLAZA_C.z, 7]]) discs.push({ x, z, y: gh(x, z), r });
  if (discs.length) { const dm = new THREE.Mesh(discGeometry(discs), M.aoDisc); dm.name = 'sbu:aoDisc'; dm.renderOrder = 3; scene.add(dm); }

  // ---- grass-card clumps on the lawns ---------------------------------------------------------
  const cardGeo = (() => {
    const a = new THREE.PlaneGeometry(0.42, 0.3); a.translate(0, 0.15, 0);
    const b = new THREE.PlaneGeometry(0.42, 0.3); b.rotateY(Math.PI / 2); b.translate(0, 0.15, 0);
    return BGU.mergeGeometries([a.toNonIndexed(), b.toNonIndexed()], false);
  })();
  const LAWNS = [
    [PIT.x0 + 2, PIT.z0 + 2, PIT.x1 - 1, PIT.z1 - 2, 3.1],       // the grass terraces (steps / staller poses) — sparser: seen at a grazing angle
    [EAST_LAWN.x0 + 2, EAST_LAWN.z0 + 6, EAST_LAWN.x1 - 2, EAST_LAWN.z1 - 2],
    [LIB.x0 + 2, LIB.z1 + 4.5, LIB.x1 - 2, LIB_LAWN.z1 - 1.5],
    [120, 118, 178, 138], [30, 92, 116, 106], [-40, 92, 14, 132],  // lecture-hall lawns / south belt
    [WANG.x0 + 8, WANG.z1 + 8, WANG.x0 + 76, WANG.z1 + 34],        // arts-centre lawn
    [-60, 26, -36, 62], [16, 26, 50, 78], [-160, 20, -120, 54],
    [FREY.x0 - 4, FREY.z1 + 2, FREY.x1 + 4, MALL.z0 - 6],
  ];
  const cards = [];
  for (const [x0, z0, x1, z1, st] of LAWNS) {
    const sp = (st ?? 2.1) * 0.7;
    for (let x = x0; x < x1; x += sp) for (let z = z0; z < z1; z += sp) {
      if (R() < 0.22) continue;
      const px = x + j(sp * 0.9), pz = z + j(sp * 0.9);
      cards.push({ x: px, z: pz, y: gh(px, pz), ry: R() * Math.PI, s: 0.4 + R() * 0.45 });
    }
  }
  {
    const im = new THREE.InstancedMesh(cardGeo, M.grassCard, cards.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
    for (let i = 0; i < cards.length; i++) { const c = cards[i]; e.set(0, c.ry, 0); q.setFromEuler(e); p.set(c.x, c.y, c.z); s.set(c.s, c.s * (0.8 + R() * 0.5), c.s); m.compose(p, q, s); im.setMatrixAt(i, m); }
    im.instanceMatrix.needsUpdate = true; im.castShadow = false; im.receiveShadow = false;
    im.name = 'sbu:grassCards'; im.userData.surface = 'ground'; im.computeBoundingSphere?.();
    scene.add(im);
  }

  // ---- distant tree line: 3 silhouettes, ±30 % scale, ringing the campus inside the haze --------
  {
    const lists = [[], [], []];
    const N = 70, r0 = 900;   // outside the whole OSM-built campus (it now extends ~700 m from the mall)
    for (let k = 0; k < N; k++) {
      const a = (k + R() * 0.45) * Math.PI * 2 / N;
      const rr = r0 + j(50);
      const h = 40 * (0.7 + R() * 0.6), w = 150 * (0.7 + R() * 0.6);
      const g = new THREE.PlaneGeometry(w, h); g.translate(0, h / 2, 0);
      g.rotateY(-a + Math.PI / 2);
      g.translate(Math.cos(a) * rr + 70, -1.5, Math.sin(a) * rr - 150);
      lists[(R() * 3) | 0].push(g);
    }
    for (let i = 0; i < 3; i++) {
      if (!lists[i].length) continue;
      const merged = BGU.mergeGeometries(lists[i].map(g => g.toNonIndexed()), false);
      const mesh = new THREE.Mesh(merged, M.treeline[i]);
      mesh.name = 'sbu:treeline' + i; mesh.renderOrder = -1; scene.add(mesh);
      for (const g of lists[i]) g.dispose();
    }
  }

  B.flush({ shadow: true });
  return { cards: cards.length };
}

/**
 * A real hedge: 1 m tall × 0.8 m deep box of foliage with a ±0.1 m noise-displaced top and sides,
 * a woody base shadow gap and gaps left at path crossings.
 */
export function hedgeRow(B, world, x0, z0, x1, z1, { h = 1.0, d = 0.8, y = 0, gaps = [] } = {}) {
  const R = world.R;
  const along = Math.hypot(x1 - x0, z1 - z0);
  if (along < 0.3) return;
  const ux = (x1 - x0) / along, uz = (z1 - z0) / along;
  const nx = -uz, nz = ux;                                   // across the run
  const seg = 1.0;
  const n = Math.max(1, Math.round(along / seg));
  const pos = [], nor = [], uv = [];
  const push = (a, b, c) => {
    pos.push(...a, ...b, ...c);
    const ux1 = b[0] - a[0], uy1 = b[1] - a[1], uz1 = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx1 = uy1 * vz - uz1 * vy, ny1 = uz1 * vx - ux1 * vz, nz1 = ux1 * vy - uy1 * vx;
    const l = Math.hypot(nx1, ny1, nz1) || 1; nx1 /= l; ny1 /= l; nz1 /= l;
    for (let k = 0; k < 3; k++) nor.push(nx1, ny1, nz1);
    uv.push(a[0] * 0.8 + a[2] * 0.8, a[1] * 0.8, b[0] * 0.8 + b[2] * 0.8, b[1] * 0.8, c[0] * 0.8 + c[2] * 0.8, c[1] * 0.8);
  };
  const quad = (a, b, c, d) => { push(a, b, c); push(a, c, d); };
  const inGap = (t) => gaps.some(([g0, g1]) => t > g0 && t < g1);
  const hw = d / 2;
  const P = (t, s, yy) => [x0 + ux * t + nx * s, yy, z0 + uz * t + nz * s];
  const top = (t) => y + h + (Math.sin(t * 1.7) * 0.5 + Math.sin(t * 0.63 + 1.3) * 0.5) * 0.1 + (R() - 0.5) * 0.06;
  let started = false, prevT = 0, prevTop = 0, prevBulge = 0;
  for (let i = 0; i <= n; i++) {
    const t = along * i / n;
    const gap = inGap(t);
    const tp = top(t), bulge = hw * (0.88 + R() * 0.24);
    if (i > 0 && !gap && started) {
      // two sides + the rounded top
      quad(P(prevT, prevBulge, y), P(t, bulge, y), P(t, bulge, tp - 0.12), P(prevT, prevBulge, prevTop - 0.12));
      quad(P(t, -bulge, y), P(prevT, -prevBulge, y), P(prevT, -prevBulge, prevTop - 0.12), P(t, -bulge, tp - 0.12));
      quad(P(prevT, prevBulge, prevTop - 0.12), P(t, bulge, tp - 0.12), P(t, 0, tp), P(prevT, 0, prevTop));
      quad(P(prevT, 0, prevTop), P(t, 0, tp), P(t, -bulge, tp - 0.12), P(prevT, -prevBulge, prevTop - 0.12));
    }
    if (i === 0 || (gap && started)) {                        // end caps at the run ends and at every gap
      const bb = bulge, tt = tp;
      quad(P(t, -bb, y), P(t, bb, y), P(t, bb, tt - 0.12), P(t, -bb, tt - 0.12));
    }
    started = !gap;
    prevT = t; prevTop = tp; prevBulge = bulge;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  B.add('hedgeLeaf', g, { uv: false });
  // woody / mulch base strip and a collider along the run
  world.box([Math.min(x0, x1) - hw, y, Math.min(z0, z1) - hw], [Math.max(x0, x1) + hw, y + h, Math.max(z0, z1) + hw]);
}
