// Private post-stack test scene (only with ?posttest=1). Owned by: POST agent. Never used by the real game.
import * as THREE from 'three';

export function buildPostTestScene(ctx) {
  const { scene } = ctx;
  const g = new THREE.Group(); g.name = 'posttest';
  // darker ambient so lamps dominate (this is a night yard)
  if (ctx.lights.hemi) { ctx.lights.hemi.intensity = 0.45; ctx.lights.hemi.color.set(0x35507a); ctx.lights.hemi.groundColor.set(0x0c0d10); }
  if (ctx.lights.key) { ctx.lights.key.intensity = 0.6; ctx.lights.key.color.set(0x6f86b8); }
  scene.fog = new THREE.FogExp2(0x0a0f16, 0.03);
  scene.background = new THREE.Color(0x0a0f16);

  // wet ground: dark, low roughness so lamps give tight specular; SSR provides the mirror
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.32, metalness: 0.0 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0.01; ground.receiveShadow = true; g.add(ground);

  const containerMat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.35 });
  const boxes = [
    [-8, 0, -2, 0.15, 0x7a3a2a], [7, 0, -8, -0.1, 0x2d4a6b], [-3, 0, -14, 0.4, 0x4a5a3a], [12, 0, 0, 0.05, 0x6b6b60], [-14, 0, -10, 0.0, 0x3b4b5b],
  ];
  for (const [x, y, z, ry, c] of boxes) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(6.06, 2.59, 2.44), containerMat(c));
    m.position.set(x, 1.3, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; g.add(m);
    // corrugation-ish stripes
    const s = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.08, 2.5), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }));
    s.position.set(0, 1.0, 0); m.add(s);
  }
  // a stack for AO contact
  for (let i = 0; i < 5; i++) {
    const cr = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshStandardMaterial({ color: 0x6b5a3a, roughness: 0.85 }));
    cr.position.set(2 + (i % 3) * 0.95, 0.45 + Math.floor(i / 3) * 0.9, 6 - Math.floor(i / 3) * 0.1); cr.castShadow = cr.receiveShadow = true; g.add(cr);
  }
  // barrels
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 16), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x5a1e12 : 0x2a3a2a, roughness: 0.5, metalness: 0.6 }));
    b.position.set(-4.5 + i * 0.7, 0.45, 9); b.castShadow = b.receiveShadow = true; g.add(b);
  }

  // sodium lamps on poles + one cold halogen
  const lamp = (x, z, h, color, intensity, emis) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, h, 8), new THREE.MeshStandardMaterial({ color: 0x333338, roughness: 0.6, metalness: 0.7 }));
    pole.position.set(x, h / 2, z); pole.castShadow = true; g.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.6 }));
    head.position.set(x, h, z); g.add(head);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.22), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: emis }));
    bulb.position.set(x, h - 0.11, z); g.add(bulb);
    const spot = new THREE.SpotLight(color, intensity, 40, 0.75, 0.55, 1.4);
    spot.position.set(x, h - 0.15, z); spot.target.position.set(x, 0, z); spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0005; spot.shadow.camera.near = 0.5; spot.shadow.camera.far = 40;
    g.add(spot); g.add(spot.target);
    const pt = new THREE.PointLight(color, intensity * 0.05, 14, 2); pt.position.set(x, h - 0.4, z); g.add(pt);
  };
  lamp(-4.5, 4, 6, 0xffa044, 2600, 18);
  lamp(6, -3, 6, 0xffa044, 2400, 18);
  lamp(-10, -8, 5, 0xffb060, 1600, 12);
  lamp(3, -16, 7, 0xcfe0ff, 2200, 20);   // halogen

  // a small emissive sign on a container
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.4), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff2a1a, emissiveIntensity: 5 }));
  sign.position.set(7, 2.2, -6.75); g.add(sign);

  scene.add(g);
  return g;
}
