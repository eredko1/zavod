// Sniper scope overlay: camera-attached black surround + lens disc with a canvas mil-dot reticle, vignette and chromatic edge. Owned by: WEAPONS agent.
import * as THREE from 'three';

function reticleTexture(size = 1024) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const cx = size / 2, cy = size / 2, R = size / 2;
  g.clearRect(0, 0, size, size);
  // faint glass tint + vignette toward the edge
  let grd = g.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
  grd.addColorStop(0, 'rgba(6,10,14,0.0)'); grd.addColorStop(0.55, 'rgba(4,7,10,0.18)'); grd.addColorStop(0.85, 'rgba(2,4,6,0.62)'); grd.addColorStop(1, 'rgba(0,0,0,0.98)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  // chromatic fringe: bluish just inside the edge, amber right at the rim
  grd = g.createRadialGradient(cx, cy, R * 0.90, cx, cy, R);
  grd.addColorStop(0, 'rgba(60,120,255,0)'); grd.addColorStop(0.45, 'rgba(70,130,255,0.22)'); grd.addColorStop(0.72, 'rgba(255,150,60,0.28)'); grd.addColorStop(1, 'rgba(255,120,40,0.0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  // soft glare crescent (upper-left) to sell curved glass
  grd = g.createRadialGradient(cx - R * 0.45, cy - R * 0.5, R * 0.05, cx - R * 0.45, cy - R * 0.5, R * 0.55);
  grd.addColorStop(0, 'rgba(180,200,230,0.10)'); grd.addColorStop(1, 'rgba(180,200,230,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  // mil-dot reticle
  g.strokeStyle = 'rgba(0,0,0,0.96)'; g.fillStyle = 'rgba(0,0,0,0.96)'; g.lineCap = 'butt';
  const thin = size * 0.0022, thick = size * 0.010, postFrom = R * 0.47;
  g.lineWidth = thin; g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
  g.lineWidth = thick; g.beginPath();
  g.moveTo(cx - R, cy); g.lineTo(cx - postFrom, cy); g.moveTo(cx + postFrom, cy); g.lineTo(cx + R, cy);
  g.moveTo(cx, cy + postFrom); g.lineTo(cx, cy + R); g.moveTo(cx, cy - R); g.lineTo(cx, cy - postFrom); g.stroke();
  const mil = R * 0.088, dotR = size * 0.0042;
  for (let i = 1; i <= 4; i++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.beginPath(); g.arc(cx + dx * mil * i, cy + dy * mil * i, dotR, 0, Math.PI * 2); g.fill(); }
  // tiny center gap dot
  g.beginPath(); g.arc(cx, cy, dotR * 0.6, 0, Math.PI * 2); g.fill();
  // ranging hash marks on the lower post
  g.lineWidth = thin * 1.2; g.beginPath(); for (let i = 1; i <= 5; i++) { const y = cy + postFrom + i * mil * 0.9; g.moveTo(cx - mil * 0.45, y); g.lineTo(cx + mil * 0.45, y); } g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  return t;
}

/**
 * Builds the overlay in "unit" space: lens radius = 0.92 of the view half-height at distance 0.5. The caller scales it each
 * frame by 0.5*tan(fov/2) so the lens always fills ~the same fraction of the screen regardless of fov.
 */
export function buildScope(camera) {
  const rig = new THREE.Group(); rig.name = 'scopeOverlay'; rig.visible = false; rig.position.z = -0.5; camera.add(rig);
  const R = 0.92;
  // black surround (huge rect with a circular hole)
  const shape = new THREE.Shape(); shape.moveTo(-40, -40); shape.lineTo(40, -40); shape.lineTo(40, 40); shape.lineTo(-40, 40); shape.closePath();
  const hole = new THREE.Path(); hole.absarc(0, 0, R, 0, Math.PI * 2, true); shape.holes.push(hole);
  const surround = new THREE.Mesh(new THREE.ShapeGeometry(shape, 96), new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false, depthWrite: true, transparent: true, toneMapped: false })); // writes near depth + draws late so the world's transparent light shafts/particles can't bleed over the housing
  surround.renderOrder = 1000; surround.frustumCulled = false; rig.add(surround);
  // eyepiece rim (dark grey bevel with a faint highlight ring)
  const rim = new THREE.Mesh(new THREE.RingGeometry(R * 0.985, R * 1.03, 96), new THREE.MeshBasicMaterial({ color: 0x0b0c0e, depthTest: false, depthWrite: false, transparent: true, toneMapped: false }));
  rim.renderOrder = 1001; rim.frustumCulled = false; rig.add(rim);
  const rim2 = new THREE.Mesh(new THREE.RingGeometry(R * 0.972, R * 0.99, 96), new THREE.MeshBasicMaterial({ color: 0x2a2c30, depthTest: false, depthWrite: false, toneMapped: false, transparent: true, opacity: 0.55 }));
  rim2.renderOrder = 1002; rim2.frustumCulled = false; rig.add(rim2);
  // lens with reticle
  const lens = new THREE.Mesh(new THREE.CircleGeometry(R, 96), new THREE.MeshBasicMaterial({ map: reticleTexture(), transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  lens.renderOrder = 1003; lens.frustumCulled = false; rig.add(lens);
  // shadow crescent: eye slightly off-axis (moves with sway/recoil for a "scope shadow" feel)
  const shadow = new THREE.Mesh(new THREE.RingGeometry(R * 0.80, R * 1.0, 96, 1, 0, Math.PI * 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.0, depthTest: false, depthWrite: false, toneMapped: false }));
  shadow.renderOrder = 1004; shadow.frustumCulled = false; rig.add(shadow);
  return { rig, surround, rim, lens, shadow, R };
}
