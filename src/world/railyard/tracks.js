// RAILYARD tracks: ballast mounds, instanced sleepers, merged rail profiles, crossovers/switches, buffer stops. RAILYARD agent.
import * as THREE from 'three';
import { Batch, worldUV } from './geo.js';
import { TRACK_X, TRACK_Z0, TRACK_Z1, GAUGE, BALLAST_H, SLEEPER_H, SLEEPER_TOP, RAIL_TOP, RAIL_H } from './layout.js';

const HALF_G = GAUGE / 2;

/** Rail profile (foot / web / head) as a merged box group along z from z0..z1 at x. Returns geometries [foot+web (steelDark), head (railHead)]. */
function railGeos(x, z0, z1, y0 = SLEEPER_TOP) {
  const L = z1 - z0, zm = (z0 + z1) / 2;
  const foot = new THREE.BoxGeometry(0.15, 0.02, L); foot.translate(x, y0 + 0.01, zm);
  const web = new THREE.BoxGeometry(0.03, RAIL_H - 0.06, L); web.translate(x, y0 + 0.02 + (RAIL_H - 0.06) / 2, zm);
  const head = new THREE.BoxGeometry(0.072, 0.045, L); head.translate(x, y0 + RAIL_H - 0.0225, zm);
  return { foot, web, head };
}

function mergePair(a, b) {
  const g = new THREE.BufferGeometry(); const pos = [], nor = [], uv = [];
  for (const q of [a, b]) { const n = q.toNonIndexed(); pos.push(...n.attributes.position.array); nor.push(...n.attributes.normal.array); uv.push(...n.attributes.uv.array); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

export function buildTracks(world, M) {
  const { ctx, scene, R } = world;
  const B = new Batch(world, M, 'tracks');

  // oily / brake-dust darkening along each track centre, baked into the ballast shader (world-space)
  {
    const mat = M.ballast; const tx = new Float32Array(8); TRACK_X.forEach((v, i) => { tx[i] = v; });
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      sh.uniforms.uTrackX = { value: tx };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBPos;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvBPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vBPos; uniform float uTrackX[8]; float gOil;\nfloat oilHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
        .replace('#include <map_fragment>', `#include <map_fragment>
          { float d = 99.0; for (int i = 0; i < 8; i++) d = min(d, abs(vBPos.x - uTrackX[i]));
            float n = oilHash(floor(vBPos.xz * vec2(3.0, 0.7))) * 0.5 + oilHash(floor(vBPos.xz * vec2(9.0, 2.3))) * 0.5;
            gOil = (1.0 - smoothstep(0.35, 1.05, d)) * (0.45 + 0.55 * n) * step(vBPos.y, 0.6);
            gOil += (1.0 - smoothstep(1.0, 1.7, d)) * 0.18 * step(vBPos.y, 0.6);
            diffuseColor.rgb *= 1.0 - gOil * 0.62; }`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor - gOil * 0.3, 0.25, 1.0);');
    };
    const prevKey = mat.customProgramCacheKey; mat.customProgramCacheKey = () => (prevKey ? prevKey.call(mat) : '') + '|oil';
  }

  // ---- ballast mounds: trapezoid prism per track -------------------------------------
  for (const tx of TRACK_X) {
    const shape = new THREE.Shape();
    shape.moveTo(-2.2, 0); shape.lineTo(2.2, 0); shape.lineTo(1.7, BALLAST_H); shape.lineTo(-1.7, BALLAST_H); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: TRACK_Z1 - TRACK_Z0, bevelEnabled: false });
    g.translate(tx, 0, TRACK_Z0); // extrude goes +z from 0
    B.add('ballast', g, { uvScale: 0.55 });
    world.box([tx - 1.7, 0, TRACK_Z0], [tx + 1.7, BALLAST_H, TRACK_Z1]);
  }

  // ---- sleepers: one InstancedMesh -----------------------------------------------------
  const pitch = 0.62;
  const perTrack = Math.floor((TRACK_Z1 - TRACK_Z0) / pitch);
  const sleeperGeo = new THREE.BoxGeometry(2.5, SLEEPER_H, 0.24); worldUV(sleeperGeo, 0.5);
  const sleepers = new THREE.InstancedMesh(sleeperGeo, M.sleeper, perTrack * TRACK_X.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), e = new THREE.Euler();
  let i = 0;
  for (const tx of TRACK_X) {
    for (let k = 0; k < perTrack; k++) {
      const z = TRACK_Z0 + pitch * (k + 0.5) + (R() - 0.5) * 0.04;
      e.set(0, (R() - 0.5) * 0.02, 0); q.setFromEuler(e); p.set(tx + (R() - 0.5) * 0.03, BALLAST_H + SLEEPER_H / 2 - 0.02, z);
      sleepers.setMatrixAt(i++, m.compose(p, q, s));
    }
    // collider: sleeper bed as one slab per track
    world.box([tx - 1.25, 0, TRACK_Z0], [tx + 1.25, SLEEPER_TOP, TRACK_Z1]);
  }
  sleepers.count = i; sleepers.instanceMatrix.needsUpdate = true;
  // base plates (two per sleeper) as one instanced mesh sharing the sleeper matrices
  const plate = new THREE.BoxGeometry(0.34, 0.03, 0.3); const pl = plate.clone().translate(-HALF_G, SLEEPER_H / 2 + 0.015, 0), pr = plate.clone().translate(HALF_G, SLEEPER_H / 2 + 0.015, 0);
  const plateGeo = mergePair(pl, pr); worldUV(plateGeo, 1.5);
  const plates = new THREE.InstancedMesh(plateGeo, M.rustSheet, i);
  for (let k = 0; k < i; k++) { sleepers.getMatrixAt(k, m); plates.setMatrixAt(k, m); }
  plates.instanceMatrix.needsUpdate = true; plates.castShadow = false; plates.receiveShadow = true; plates.userData.surface = 'metal'; plates.name = 'baseplates'; plates.frustumCulled = false;
  scene.add(plates); ctx.raycastTargets.push(plates);
  sleepers.castShadow = true; sleepers.receiveShadow = true; sleepers.userData.surface = 'wood'; sleepers.name = 'sleepers'; sleepers.frustumCulled = false;
  scene.add(sleepers); ctx.raycastTargets.push(sleepers);

  // ---- rails ------------------------------------------------------------------------------
  for (const tx of TRACK_X) {
    for (const sx of [-HALF_G, HALF_G]) {
      const r = railGeos(tx + sx, TRACK_Z0, TRACK_Z1);
      B.add('steelDark', r.foot, { uvScale: 0.5 }); B.add('steelDark', r.web, { uvScale: 0.5 }); B.add('railHead', r.head, { uv: false });
      world.box([tx + sx - 0.075, SLEEPER_TOP, TRACK_Z0], [tx + sx + 0.075, RAIL_TOP, TRACK_Z1]);
    }
  }

  // ---- crossovers (diagonal rails between adjacent tracks) + switch blades / point machines ----
  const crossovers = [[0, 1, -30], [2, 3, 22], [3, 4, -22], [4, 5, 44], [5, 6, -58], [6, 7, 30], [1, 2, 50]];
  for (const [a, b, zc] of crossovers) {
    const xa = TRACK_X[a], xb = TRACK_X[b]; const dir = Math.sign(xb - xa);
    const len = 14; const dx = xb - xa; const ang = Math.atan2(dx, len);
    for (const sx of [-HALF_G, HALF_G]) {
      const L = Math.hypot(dx, len);
      const foot = new THREE.BoxGeometry(0.15, 0.02, L), web = new THREE.BoxGeometry(0.03, RAIL_H - 0.06, L), head = new THREE.BoxGeometry(0.072, 0.045, L);
      for (const [g, y] of [[foot, SLEEPER_TOP + 0.01], [web, SLEEPER_TOP + 0.02 + (RAIL_H - 0.06) / 2], [head, SLEEPER_TOP + RAIL_H - 0.0225]]) {
        g.rotateY(-ang); g.translate((xa + xb) / 2 + sx * Math.cos(ang), y, zc);
      }
      B.add('steelDark', foot, { uvScale: 0.5 }); B.add('steelDark', web, { uvScale: 0.5 }); B.add('railHead', head, { uv: false });
    }
    // diagonal sleepers under the crossover (merged, wood)
    for (let k = -6; k <= 6; k++) {
      const t = k / 6; const sg = new THREE.BoxGeometry(2.6, SLEEPER_H, 0.24); sg.rotateY(-ang); sg.translate((xa + xb) / 2 + t * dx / 2, BALLAST_H + SLEEPER_H / 2 - 0.02, zc + t * len / 2);
      B.add('sleeper', sg, { uvScale: 0.5 });
    }
    // point machine boxes at both switch ends
    for (const [x, z] of [[xa + dir * 1.35, zc - len / 2 - 1], [xb - dir * 1.35, zc + len / 2 + 1]]) {
      B.box('cabinet', [x - 0.3, BALLAST_H, z - 0.36], [x + 0.3, BALLAST_H + 0.42, z + 0.36], { collide: true, uvScale: 1 }); B.box('yellow', [x - 0.31, BALLAST_H + 0.42, z - 0.37], [x + 0.31, BALLAST_H + 0.46, z + 0.37], { collide: false, uv: false });
      B.box('steelDark', [Math.min(x, x - dir * 1.0), SLEEPER_TOP, z - 0.05], [Math.max(x, x - dir * 1.0), SLEEPER_TOP + 0.06, z + 0.05], { collide: false });
    }
  }

  // ---- buffer stops at the north end of the two dead-end tracks --------------------------------
  for (const ti of [1, 4]) {
    const tx = TRACK_X[ti], z = -60;
    B.box('rustPlate', [tx - 1.1, SLEEPER_TOP, z - 0.5], [tx + 1.1, SLEEPER_TOP + 1.3, z + 0.1], { uvScale: 0.8 });
    for (const sx of [-0.8, 0.8]) { const g = new THREE.BoxGeometry(0.25, 0.25, 2.6); g.rotateX(-0.45); g.translate(tx + sx, SLEEPER_TOP + 0.8, z + 1.2); B.add('rustPlate', g); }
    world.box([tx - 1.1, 0, z - 0.6], [tx + 1.1, 1.5, z + 2.2]);
    world.cover(tx, z + 3.2, 0, 1); world.cover(tx, z - 1.6, 0, -1);
  }

  // ---- derail / ground signals: small dwarf signals beside tracks -------------------------------
  for (const [ti, z] of [[3, -12], [6, 18], [1, -2], [4, 52]]) {
    const x = TRACK_X[ti] + 1.55;
    B.box('steelDark', [x - 0.1, BALLAST_H, z - 0.1], [x + 0.1, BALLAST_H + 0.9, z + 0.1], { collide: false });
    B.box('black', [x - 0.22, BALLAST_H + 0.9, z - 0.12], [x + 0.22, BALLAST_H + 1.35, z + 0.12], { collide: false, uv: false });
    B.box(R() < 0.5 ? 'lampRed' : 'lampGreen', [x - 0.12, BALLAST_H + 1.0, z + 0.12], [x + 0.12, BALLAST_H + 1.25, z + 0.14], { collide: false, uv: false });
  }

  B.flush();
}
