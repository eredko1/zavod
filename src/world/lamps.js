// Sodium / halogen lamps: fixtures (GLTF), lights (spot w/ shadow on key ones), volumetric cones, beacons. WORLD agent.
import * as THREE from 'three';
import { instanceModel } from './props.js';
import { WAREHOUSE, DOCK, SUBSTATION, HUT } from './structures.js';

const SODIUM = 0xffa347, HALOGEN = 0xd9e6ff, MERCURY = 0xbfe3d2;

export function buildLamps(world) {
  const { ctx, scene, W } = world;
  const wh = WAREHOUSE, dk = DOCK, sb = SUBSTATION;
  let shadowBudget = ctx.settings.quality === 'low' ? 1 : ctx.settings.quality === 'medium' ? 2 : 4;
  const spots = [];

  const cones = [];
  const coneMat = makeConeMaterial();
  const addCone = (x, y, z, color, height, radius, strength = 1, target = null) => {
    const g = new THREE.ConeGeometry(radius, height, 64, 2, true);
    g.translate(0, -height / 2, 0);
    const m = coneMat.clone();
    m.uniforms.uColor.value = new THREE.Color(color);
    m.uniforms.uStrength.value = strength;
    m.uniforms.uHeight.value = height;
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    if (target) {
      const dir = new THREE.Vector3(target[0] - x, target[1] - y, target[2] - z).normalize();
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    }
    mesh.renderOrder = 5;
    mesh.frustumCulled = true;
    scene.add(mesh);
    cones.push(m);
    return mesh;
  };
  const lamp = ({ x, y, z, color = SODIUM, intensity = 600, angle = 0.75, penumbra = 0.6, shadow = false, dist = 40, cone = true, coneStrength = 1, target = null, key = false }) => {
    let light;
    if (shadow && shadowBudget > 0) {
      shadowBudget--;
      light = new THREE.SpotLight(color, intensity, dist, angle, penumbra, 2);
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.0015;
      light.shadow.normalBias = 0.03;
      light.shadow.camera.near = 0.5;
      light.shadow.camera.far = dist;
    } else if (angle < 1.3) {
      light = new THREE.SpotLight(color, intensity, dist, angle, penumbra, 2);
    } else {
      light = new THREE.PointLight(color, intensity, dist, 2);
    }
    light.position.set(x, y, z);
    if (light.isSpotLight) {
      light.target.position.set(target ? target[0] : x, target ? target[1] : 0, target ? target[2] : z);
      scene.add(light.target);
    }
    scene.add(light);
    spots.push(light);
    ctx.lights.spots.push(light);
    W.lampPositions.push({ x, y, z, color: new THREE.Color(color), intensity });
    if (cone && light.isSpotLight) {
      const tPos = target ? new THREE.Vector3(...target) : new THREE.Vector3(x, 0, z);
      const lPos = new THREE.Vector3(x, y, z);
      const beamLen = Math.min(dist * 0.95, lPos.distanceTo(tPos));
      const coneH = beamLen > 0.5 ? beamLen : y * 0.98;
      const coneR = Math.tan(angle) * coneH * 0.88;
      addCone(x, y - 0.05, z, color, coneH, coneR, coneStrength, target);
    }
    return light;
  };

  // ---- yard poles (street_lamp_01 scaled to ~7 m) -----------------------------
  const poles = [
    { x: -2, z: 2, ry: 0.3, shadow: true, color: SODIUM, intensity: 650 },            // plaza
    { x: 15.25, z: 20, ry: 1.6, shadow: true, color: SODIUM, intensity: 520 },        // hero lane
    { x: 41.25, z: -22, ry: 0.2, shadow: false, color: SODIUM, intensity: 520 },      // yard north-east
    { x: -30, z: 24, ry: 0.9, shadow: false, color: MERCURY, intensity: 480 },        // west yard, greenish mercury
    { x: -6, z: 50, ry: 0.0, shadow: false, color: SODIUM, intensity: 420 },          // spawn / gate
  ];
  const poleScale = 1.85;
  instanceModel(world, 'street_lamp_01', poles.map(p => ({ x: p.x, z: p.z, ry: p.ry, s: poleScale })), 'metal');
  for (const p of poles) {
    const hx = p.x + Math.sin(p.ry) * 0.9 * 0 + Math.cos(p.ry) * 0.0, hz = p.z;
    lamp({ x: hx, y: 3.75 * poleScale, z: hz, color: p.color, intensity: p.intensity, angle: 0.8, penumbra: 0.5, shadow: p.shadow, dist: 45, coneStrength: 1.0 });
  }

  // ---- warehouse: hanging industrial lamps -----------------------------------
  const hang = [];
  for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) hang.push({ x: wh.x0 + 8 + i * 13, z: wh.z0 + 9 + k * 16 });
  instanceModel(world, 'hanging_industrial_lamp', hang.map(h => ({ x: h.x, z: h.z, y: wh.h - 0.3 })), 'metal', { collide: false, castShadow: false });
  hang.forEach((h, i) => {
    if (i === 0 || i === 5) return;
    lamp({
      x: h.x,
      y: wh.h - 1.7,
      z: h.z,
      color: i % 3 === 1 ? HALOGEN : SODIUM,
      intensity: i === 4 || i === 1 ? 750 : 480,
      angle: 0.95,
      penumbra: 0.7,
      shadow: i === 4 || i === 1,
      dist: 30,
      cone: true,
      coneStrength: 0.85
    });
  });

  // dock canopy lamps
  const dockLamps = [{ x: dk.x1 - 1.5, z: dk.z0 + 5 }, { x: dk.x1 - 1.5, z: dk.z1 - 5 }];
  instanceModel(world, 'hanging_industrial_lamp', dockLamps.map(h => ({ x: h.x, z: h.z, y: 4.1 })), 'metal', { collide: false, castShadow: false });
  for (const dl of dockLamps) {
    lamp({
      x: dl.x,
      y: 3.2,
      z: dl.z,
      color: SODIUM,
      intensity: 350,
      angle: 0.95,
      penumbra: 0.7,
      shadow: false,
      dist: 22,
      cone: true,
      coneStrength: 0.8
    });
  }

  // ---- wall lamps ---------------------------------------------------------------
  const walls = [
    { x: sb.x0 + 7, y: 4.6, z: sb.z1 + 0.1, ry: 0, color: HALOGEN, intensity: 320 },
    { x: wh.x1 + 0.1, y: 3.4, z: -29, ry: Math.PI / 2, color: SODIUM, intensity: 220 },
    { x: wh.x0 + 8, y: 6.6, z: wh.z1 + 0.1, ry: 0, color: SODIUM, intensity: 380 },
    { x: wh.x0 + 32, y: 6.6, z: wh.z1 + 0.1, ry: 0, color: SODIUM, intensity: 380 },
    { x: HUT.x, y: 2.5, z: HUT.z - 1.65, ry: Math.PI, color: SODIUM, intensity: 120 },
    { x: -57.6, y: 3.2, z: 44, ry: -Math.PI / 2, color: SODIUM, intensity: 200 },
    { x: -57.6, y: 3.2, z: -10, ry: -Math.PI / 2, color: HALOGEN, intensity: 200 },
    { x: 57.6, y: 3.2, z: 12, ry: Math.PI / 2, color: SODIUM, intensity: 200 },
  ];
  instanceModel(world, 'industrial_wall_lamp', walls.map(w => ({ x: w.x, y: w.y - 0.2, z: w.z, ry: w.ry })), 'metal', { collide: false, castShadow: false });
  walls.forEach((w, i) => {
    if (![0, 2, 3, 4].includes(i)) return; // budget: substation, warehouse front x2, hut
    const nx = Math.sin(w.ry), nz = Math.cos(w.ry); // outward normal of the wall
    lamp({
      x: w.x + nx * 0.5,
      y: w.y - 0.05,
      z: w.z + nz * 0.5,
      color: w.color,
      intensity: w.intensity * 0.85,
      angle: 0.90,
      penumbra: 0.8,
      shadow: false,
      dist: 22,
      target: [w.x + nx * 3.5, 0, w.z + nz * 3.5],
      cone: true,
      coneStrength: 0.75
    });
  });

  // ---- crane floodlights + red beacons ------------------------------------------
  const cr = world.crane;
  if (cr) {
    // Main gantry trolley floodlight beaming down into the central container canyon
    lamp({
      x: 30,
      y: 17,
      z: 30,
      color: HALOGEN,
      intensity: 1400,
      angle: 0.30,
      penumbra: 0.6,
      shadow: shadowBudget > 0,
      dist: 55,
      target: [30, 0, 30],
      cone: true,
      coneStrength: 0.75
    });
    // Left gantry arm floodlight angled into the west yard/plaza
    lamp({
      x: 10,
      y: 16.5,
      z: 30,
      color: HALOGEN,
      intensity: 1000,
      angle: 0.32,
      penumbra: 0.65,
      shadow: false,
      dist: 45,
      target: [6, 0, 22],
      cone: true,
      coneStrength: 0.65
    });
    // Right gantry arm floodlight angled into the east container stacks
    lamp({
      x: 48,
      y: 16.5,
      z: 30,
      color: HALOGEN,
      intensity: 1000,
      angle: 0.32,
      penumbra: 0.65,
      shadow: false,
      dist: 45,
      target: [42, 0, 22],
      cone: true,
      coneStrength: 0.65
    });

    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, fog: false });
    const bg = new THREE.SphereGeometry(0.25, 10, 8);
    for (const [x, y, z] of cr.beacons) { const b = new THREE.Mesh(bg, beaconMat); b.position.set(x, y, z); scene.add(b); }
    world.updaters.push((dt) => { const t = ctx.time.elapsed; beaconMat.color.setScalar(0); const on = (Math.sin(t * 2.2) > 0.2) ? 1 : 0.06; beaconMat.color.setRGB(3.5 * on, 0.35 * on, 0.25 * on); });
  }
  // sky-glow fill over the yard so nothing is pitch black between pools
  const glow = new THREE.PointLight(0x4a5670, 90, 160, 1.4); glow.position.set(0, 40, 0); scene.add(glow);

  // ---- emissive fixture materials -------------------------------------------------
  const patch = (id, matName, color, intensity) => {
    const src = ctx.assets.modelSource(id); if (!src) return;
    src.scene.traverse((o) => { if (!o.isMesh) return; const mats = Array.isArray(o.material) ? o.material : [o.material]; for (const m of mats) { if (m.name === matName) { m.emissive = new THREE.Color(color); m.emissiveIntensity = intensity; m.toneMapped = true; } } });
  };
  patch('street_lamp_01', 'street_lamp_01_glass', SODIUM, 3);
  patch('street_lamp_01', 'street_lamp_01_bulb', 0xffe2b0, 7);
  patch('hanging_industrial_lamp', 'hanging_industrial_lamp_glass', 0xffd39a, 5);
  patch('industrial_wall_lamp', 'industrial_wall_lamp_glass', 0xffd39a, 4);

  // flicker: a couple of tired sodium lamps
  const flick = [spots[2], spots[6]].filter(Boolean);
  const base = flick.map(l => l.intensity);
  world.updaters.push((dt) => {
    const t = ctx.time.elapsed;
    flick.forEach((l, i) => { const n = Math.sin(t * 37 + i) * Math.sin(t * 5.3 + i * 2) ; l.intensity = base[i] * (n > 0.85 ? 0.35 : 1.0 - Math.max(0, Math.sin(t * 11 + i)) * 0.08); });
    for (const m of cones) m.uniforms.uTime.value = t;
  });
  world.cones = cones;
}

function makeConeMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: {
      uColor: { value: new THREE.Color(0xffa347) },
      uStrength: { value: 1.0 },
      uTime: { value: 0.0 },
      uHeight: { value: 10.0 },
    },
    vertexShader: `
      uniform float uHeight;
      varying vec3 vN;
      varying vec3 vV;
      varying float vT;
      varying vec3 vW;

      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        // Normalized vertical position along the light cone [0.0 = apex/bulb, 1.0 = base/ground]
        vT = clamp(-position.y / max(uHeight, 0.001), 0.0, 1.0);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uStrength;
      uniform float uTime;
      varying vec3 vN;
      varying vec3 vV;
      varying float vT;
      varying vec3 vW;

      float hash1(float n) {
        return fract(sin(n) * 43758.5453123);
      }

      float vnoise(vec3 x) {
        vec3 p = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        float n = p.x + p.y * 57.0 + p.z * 113.0;
        return mix(
          mix(mix(hash1(n + 0.0), hash1(n + 1.0), f.x),
              mix(hash1(n + 57.0), hash1(n + 58.0), f.x), f.y),
          mix(mix(hash1(n + 113.0), hash1(n + 114.0), f.x),
              mix(hash1(n + 170.0), hash1(n + 171.0), f.x), f.y),
          f.z
        );
      }

      void main() {
        // Soft silhouette edge falloff (soft at glancing silhouette edges, solid through beam core)
        float fr = abs(dot(normalize(vN), normalize(vV)));
        float edge = smoothstep(0.02, 0.45, fr);

        // Volumetric scattering density down the beam
        float len = mix(1.0, 0.45, vT);

        // Soft apex fade so the cone doesn't start as a razor needle at the fixture
        float topFade = smoothstep(0.005, 0.08, vT);

        // Soft base & depth fade to eliminate hard geometry intersections
        float baseFade = smoothstep(1.0, 0.84, vT);
        float groundFade = smoothstep(0.04, 0.70, max(0.0, vW.y));
        float depthFade = baseFade * groundFade;

        // Soft camera near-fade to eliminate near-plane clipping
        float camDist = length(cameraPosition - vW);
        float nearFade = smoothstep(0.35, 1.8, camDist);

        // Fast-falling rain streaks in world space (stretched along Y)
        vec3 rainCoord = vec3(vW.x * 3.5 + vW.z * 2.0, vW.y * 0.9 + uTime * 16.0, vW.z * 3.5);
        float rainN = vnoise(rainCoord);
        float rainStreak = 0.82 + 0.36 * smoothstep(0.35, 0.80, rainN);

        // Slowly swirling atmospheric humid mist
        vec3 mistCoord = vec3(vW.x * 0.25 + uTime * 0.12, vW.y * 0.20 - uTime * 0.06, vW.z * 0.25 + uTime * 0.09);
        float mist = 0.80 + 0.35 * vnoise(mistCoord);

        // Glistening suspended dust motes
        vec3 moteCoord = vec3(vW.x * 5.5, vW.y * 4.5 - uTime * 1.5, vW.z * 5.5);
        float moteN = vnoise(moteCoord);
        float motes = pow(moteN, 6.0) * 1.4;

        float particulate = rainStreak * mist + motes;

        // Dramatic volumetric scattering opacity (boosted to ~0.25)
        float baseOpacity = 0.25;
        float a = edge * len * topFade * depthFade * nearFade * baseOpacity * uStrength * particulate;
        a = clamp(a, 0.0, 0.90);

        // Three.js AdditiveBlending uses (SrcAlphaFactor, OneFactor), so src.rgb is multiplied by src.a in the blend pipeline
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
}
