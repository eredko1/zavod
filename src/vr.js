// WebXR VR subsystem for Meta Quest 2 and Meta Quest 3.
// Handles unified Touch Controllers + Hand Tracking, pointing rays,
// teleportation, thumbstick locomotion, world-space 3D HUD & interactive menus,
// and Quest 2/3 performance optimizations (foveation, 72 Hz floor, pixel ratio cap).
import * as THREE from 'three';
import { OculusHandModelFactory } from 'three/addons/webxr/OculusHandModelFactory.js';

export function initVR(ctx) {
  const { renderer, scene, camera, playerRig } = ctx;
  if (!renderer.xr) return null;

  // VR root state
  const vr = {
    enabled: true,
    controllers: [],
    controllerGrips: [],
    hands: [],
    pointingRays: [],
    reticles: [],
    activeControllerIndex: 0,
    activeAim: { origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1), quaternion: new THREE.Quaternion() },
    teleportMarker: null,
    teleportValid: false,
    teleportTarget: new THREE.Vector3(),
    hudMesh: null,
    hudCanvas: null,
    hudCtx: null,
    hudTexture: null,
    menuMesh: null,
    menuCanvas: null,
    menuCtx: null,
    menuTexture: null,
    menuButtons: [],
    hoveredButton: null,
    hitmarkerTimer: 0,
    toastText: '',
    toastTimer: 0,
    lastSnapTime: 0,
  };

  ctx.vr = vr;

  // 1. Session Start / End configuration & Quest performance optimizations
  renderer.xr.addEventListener('sessionstart', () => {
    const session = renderer.xr.getSession();

    // Quest 2 / Quest 3 Performance: Cap pixel ratio & enable aggressive foveated rendering
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    if (typeof renderer.xr.setFoveation === 'function') {
      renderer.xr.setFoveation(1.0);
    }

    // Maintain a solid 72 Hz refresh floor on Meta Quest hardware
    if (session && session.supportedFrameRates && typeof session.updateTargetFrameRate === 'function') {
      if (session.supportedFrameRates.includes(72)) {
        session.updateTargetFrameRate(72).catch(() => {});
      }
    }

    // Show floating VR menu on session start if in menu/boot state
    if (ctx.state === 'menu' || ctx.state === 'boot') {
      showMenuPanel(vr, true);
    }
  });

  renderer.xr.addEventListener('sessionend', () => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ctx.settings?.renderScale ?? 1));
  });

  // 2. Controllers & Laser Pointing Rays
  const rayGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1)
  ]);
  const rayMat = new THREE.LineBasicMaterial({
    color: 0x5bc0eb,
    transparent: true,
    opacity: 0.75,
    linewidth: 2
  });

  const reticleGeo = new THREE.RingGeometry(0.012, 0.022, 32);
  const reticleMat = new THREE.MeshBasicMaterial({
    color: 0x5bc0eb,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    depthTest: false
  });

  for (let i = 0; i < 2; i++) {
    const controller = renderer.xr.getController(i);
    controller.userData.index = i;
    controller.name = `vr-controller-${i}`;
    playerRig.add(controller);
    vr.controllers.push(controller);

    // Visible laser beam
    const line = new THREE.Line(rayGeo.clone(), rayMat.clone());
    line.name = 'ray';
    line.scale.z = 5;
    controller.add(line);
    vr.pointingRays.push(line);

    // Reticle
    const reticle = new THREE.Mesh(reticleGeo.clone(), reticleMat.clone());
    reticle.name = 'reticle';
    reticle.visible = false;
    scene.add(reticle);
    vr.reticles.push(reticle);

    // Unified input events (Touch Controller trigger & Hand Tracking pinch)
    controller.addEventListener('selectstart', (e) => onSelectStart(e, i, ctx, vr));
    controller.addEventListener('selectend', (e) => onSelectEnd(e, i, ctx, vr));
    controller.addEventListener('select', (e) => onSelect(e, i, ctx, vr));
  }

  // 3. Hand Tracking Meshes via OculusHandModelFactory
  const handModelFactory = new OculusHandModelFactory();
  for (let i = 0; i < 2; i++) {
    const hand = renderer.xr.getHand(i);
    hand.userData.index = i;
    hand.name = `vr-hand-${i}`;
    const model = handModelFactory.createHandModel(hand, 'boxes');
    hand.add(model);
    playerRig.add(hand);
    vr.hands.push(hand);
  }

  // 4. Ground Teleport Marker
  const tpRingGeo = new THREE.RingGeometry(0.28, 0.35, 36);
  tpRingGeo.rotateX(-Math.PI / 2);
  const tpInnerGeo = new THREE.CircleGeometry(0.22, 36);
  tpInnerGeo.rotateX(-Math.PI / 2);
  const tpMat = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const tpMarker = new THREE.Group();
  tpMarker.add(new THREE.Mesh(tpRingGeo, tpMat));
  tpMarker.add(new THREE.Mesh(tpInnerGeo, new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })));
  tpMarker.visible = false;
  scene.add(tpMarker);
  vr.teleportMarker = tpMarker;

  // 5. World-Space 3D HUD Mesh (Attached to camera/rig)
  buildVRHUD(ctx, vr);

  // 6. World-Space 3D Interactive Menu Mesh
  buildVRMenu(ctx, vr);

  // Event bus hooks for HUD feedback
  ctx.bus?.on?.('hit', () => { vr.hitmarkerTimer = 0.25; });
  ctx.bus?.on?.('playerDamaged', () => { vr.dmgFlash = 0.3; });
  ctx.bus?.on?.('state', ({ state }) => {
    if (state !== 'playing') {
      showMenuPanel(vr, true);
    } else {
      showMenuPanel(vr, false);
    }
  });

  return vr;
}

// -----------------------------------------------------------------------------
// Input & Selection Handling
// -----------------------------------------------------------------------------
function onSelectStart(e, controllerIndex, ctx, vr) {
  vr.activeControllerIndex = controllerIndex;

  // 1. If pointing at interactive menu button, trigger click
  if (vr.menuMesh?.visible && vr.hoveredButton) {
    vr.hoveredButton.action();
    hapticPulse(vr.controllers[controllerIndex], 0.6, 40);
    return;
  }

  // 2. If pointing at ground teleport marker, teleport player
  if (vr.teleportValid && ctx.player) {
    ctx.player.teleport(vr.teleportTarget.x, vr.teleportTarget.y, vr.teleportTarget.z);
    hapticPulse(vr.controllers[controllerIndex], 0.4, 30);
    vr.teleportValid = false;
    if (vr.teleportMarker) vr.teleportMarker.visible = false;
    return;
  }

  // 3. In-game action: Fire weapon / attack
  if (ctx.state === 'playing') {
    if (ctx.weapons?.fire) {
      ctx.weapons.fire();
    } else {
      ctx.input?.pressed?.add('Mouse0');
    }
    hapticPulse(vr.controllers[controllerIndex], 0.8, 45);
  }
}

function onSelectEnd(e, controllerIndex, ctx, vr) {
  // Can be used for charged shots or release-to-teleport if desired
}

function onSelect(e, controllerIndex, ctx, vr) {
  // select is emitted after selectstart/end
}

function hapticPulse(controller, intensity = 0.5, durationMs = 30) {
  try {
    const session = controller?.parent?.parent?.renderer?.xr?.getSession?.();
    const source = controller?.userData?.inputSource;
    if (source?.gamepad?.hapticActuators?.length) {
      source.gamepad.hapticActuators[0].pulse(intensity, durationMs);
    }
  } catch {}
}

// -----------------------------------------------------------------------------
// World-space 3D HUD (Attached to player camera)
// -----------------------------------------------------------------------------
function buildVRHUD(ctx, vr) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 340;
  const hCtx = canvas.getContext('2d');

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  // Curved or planar banner sitting in lower peripheral vision
  const hudGeo = new THREE.PlaneGeometry(0.85, 0.28);
  const hudMat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
    depthWrite: false
  });

  const hudMesh = new THREE.Mesh(hudGeo, hudMat);
  hudMesh.name = 'vr-hud';
  // Positioned gently below eye center
  hudMesh.position.set(0, -0.24, -0.75);
  hudMesh.rotation.x = -0.22;
  hudMesh.renderOrder = 999;

  ctx.camera.add(hudMesh);

  vr.hudMesh = hudMesh;
  vr.hudCanvas = canvas;
  vr.hudCtx = hCtx;
  vr.hudTexture = texture;
}

function updateVRHUD(ctx, vr, dt) {
  if (!vr.hudCtx) return;
  const c = vr.hudCtx;
  const w = vr.hudCanvas.width, h = vr.hudCanvas.height;
  c.clearRect(0, 0, w, h);

  const p = ctx.player;
  const wpn = ctx.weapons;
  const curW = wpn?.current;
  const hp = Math.max(0, Math.round(p?.health ?? 100));

  if (vr.hitmarkerTimer > 0) vr.hitmarkerTimer -= dt;
  if (vr.dmgFlash > 0) vr.dmgFlash -= dt;

  // Background HUD container with cyberpunk chamfer
  c.save();
  c.fillStyle = 'rgba(7, 10, 15, 0.78)';
  c.strokeStyle = vr.dmgFlash > 0 ? '#ef4444' : 'rgba(233, 162, 59, 0.45)';
  c.lineWidth = 3;
  roundRect(c, 20, 20, w - 40, h - 40, 16);
  c.fill();
  c.stroke();

  // 1. Health Bar & Value
  c.fillStyle = '#94a3b8';
  c.font = '600 24px system-ui, sans-serif';
  c.fillText('HEALTH', 50, 68);

  const hpFrac = Math.max(0, Math.min(1, hp / 100));
  c.fillStyle = '#1e293b';
  c.fillRect(50, 84, 280, 24);
  c.fillStyle = hp > 50 ? '#22c55e' : hp > 25 ? '#f59e0b' : '#ef4444';
  c.fillRect(50, 84, 280 * hpFrac, 24);

  c.fillStyle = '#f8fafc';
  c.font = '700 32px monospace';
  c.fillText(`${hp} HP`, 50, 150);

  // 2. Weapon & Ammo Counter
  c.fillStyle = '#94a3b8';
  c.font = '600 24px system-ui, sans-serif';
  c.textAlign = 'right';
  c.fillText('WEAPON', w - 50, 68);

  const wName = curW?.name || wpn?.primary?.id?.toUpperCase() || 'RIFLE';
  c.fillStyle = '#eab308';
  c.font = '700 30px system-ui, sans-serif';
  c.fillText(wName, w - 50, 108);

  const ammo = curW?.ammo ?? 30;
  const reserve = curW?.reserve ?? 120;
  c.fillStyle = ammo === 0 ? '#ef4444' : '#ffffff';
  c.font = '700 48px monospace';
  c.fillText(`${ammo}`, w - 160, 170);

  c.fillStyle = '#64748b';
  c.font = '600 28px monospace';
  c.fillText(`/ ${reserve}`, w - 50, 170);

  // 3. Center Wave / Status
  c.textAlign = 'center';
  c.fillStyle = '#38bdf8';
  c.font = '700 28px system-ui, sans-serif';
  const waveText = ctx.ai?.wave ? `WAVE ${ctx.ai.wave}` : 'ZAVOD VR';
  c.fillText(waveText, w / 2, 72);

  const enemyCount = (ctx.ai?.soldiers || []).filter(s => s?.state !== 'dead').length;
  c.fillStyle = '#94a3b8';
  c.font = '600 22px system-ui, sans-serif';
  c.fillText(enemyCount > 0 ? `${enemyCount} HOSTILES ACTIVE` : 'PATROL SECURE', w / 2, 108);

  // 4. Hitmarker Indicator
  if (vr.hitmarkerTimer > 0) {
    c.strokeStyle = '#ef4444';
    c.lineWidth = 4;
    const cx = w / 2, cy = 160, s = 14;
    c.beginPath();
    c.moveTo(cx - s, cy - s); c.lineTo(cx - 4, cy - 4);
    c.moveTo(cx + s, cy - s); c.lineTo(cx + 4, cy - 4);
    c.moveTo(cx - s, cy + s); c.lineTo(cx - 4, cy + 4);
    c.moveTo(cx + s, cy + s); c.lineTo(cx + 4, cy + 4);
    c.stroke();
  }

  // 5. Toast / Status Message
  if (ctx.state !== 'playing') {
    c.fillStyle = '#f59e0b';
    c.font = '700 26px system-ui, sans-serif';
    c.fillText(`STATUS: ${ctx.state.toUpperCase()}`, w / 2, 220);
  }

  c.restore();
  vr.hudTexture.needsUpdate = true;
}

// -----------------------------------------------------------------------------
// World-space 3D Interactive Menu Panel
// -----------------------------------------------------------------------------
function buildVRMenu(ctx, vr) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 760;
  const mCtx = canvas.getContext('2d');

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const menuGeo = new THREE.PlaneGeometry(1.4, 1.05);
  const menuMat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.96,
    side: THREE.DoubleSide
  });

  const menuMesh = new THREE.Mesh(menuGeo, menuMat);
  menuMesh.name = 'vr-menu-panel';
  menuMesh.position.set(0, 1.45, -1.8);
  menuMesh.visible = (ctx.state !== 'playing');
  ctx.playerRig.add(menuMesh);

  vr.menuMesh = menuMesh;
  vr.menuCanvas = canvas;
  vr.menuCtx = mCtx;
  vr.menuTexture = texture;

  // Define clickable interactive buttons [x, y, w, h, label, action]
  vr.menuButtons = [
    {
      id: 'play',
      x: 180, y: 310, w: 664, h: 72,
      label: 'DEPLOY / RESUME',
      action: () => { ctx.setState('playing'); showMenuPanel(vr, false); }
    },
    {
      id: 'restart',
      x: 180, y: 405, w: 664, h: 72,
      label: 'RESTART MISSION',
      action: () => { ctx.restart(); showMenuPanel(vr, false); }
    },
    {
      id: 'spawn',
      x: 180, y: 500, w: 664, h: 72,
      label: 'RESPAWN AT SAFE POINT',
      action: () => { ctx.player?.respawn?.(); showMenuPanel(vr, false); }
    },
    {
      id: 'chill',
      x: 180, y: 595, w: 664, h: 72,
      label: 'TOGGLE CHILL / WAVES MODE',
      action: () => {
        ctx.mode = (ctx.mode === 'chill' ? null : 'chill');
        ctx.restart();
        showMenuPanel(vr, false);
      }
    }
  ];

  renderVRMenu(ctx, vr);
}

function showMenuPanel(vr, show) {
  if (vr.menuMesh) {
    vr.menuMesh.visible = show;
  }
}

function renderVRMenu(ctx, vr) {
  if (!vr.menuCtx) return;
  const c = vr.menuCtx;
  const w = vr.menuCanvas.width, h = vr.menuCanvas.height;
  c.clearRect(0, 0, w, h);

  c.save();

  // Background Card
  c.fillStyle = 'rgba(8, 12, 18, 0.94)';
  c.strokeStyle = '#e9a23b';
  c.lineWidth = 4;
  roundRect(c, 20, 20, w - 40, h - 40, 24);
  c.fill();
  c.stroke();

  // Header Title
  c.textAlign = 'center';
  c.fillStyle = '#f8fafc';
  c.font = '800 52px system-ui, sans-serif';
  c.fillText('ZAVOD : WEBXR VR', w / 2, 95);

  c.fillStyle = '#38bdf8';
  c.font = '600 24px system-ui, sans-serif';
  c.fillText('META QUEST 2 & QUEST 3 · HAND TRACKING + TOUCH CONTROLLERS', w / 2, 138);

  // Status Badge
  c.fillStyle = '#94a3b8';
  c.font = '500 20px monospace';
  const stateDesc = ctx.state === 'dead' ? 'STATUS: KILLED IN ACTION' : ctx.state === 'victory' ? 'STATUS: OPERATION COMPLETE' : 'STATUS: MISSION READY';
  c.fillText(stateDesc, w / 2, 180);

  // Controls hint
  c.fillStyle = '#64748b';
  c.font = '400 19px system-ui, sans-serif';
  c.fillText('Aim laser ray and Pinch (Hands) or Pull Trigger (Controllers) to select', w / 2, 235);

  // Render Buttons
  for (const btn of vr.menuButtons) {
    const isHovered = vr.hoveredButton === btn;
    c.fillStyle = isHovered ? '#e9a23b' : 'rgba(26, 34, 46, 0.85)';
    c.strokeStyle = isHovered ? '#ffffff' : '#334155';
    c.lineWidth = isHovered ? 3 : 2;

    roundRect(c, btn.x, btn.y, btn.w, btn.h, 12);
    c.fill();
    c.stroke();

    c.fillStyle = isHovered ? '#05070a' : '#f8fafc';
    c.font = isHovered ? '700 26px system-ui, sans-serif' : '600 26px system-ui, sans-serif';
    c.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 9);
  }

  c.restore();
  vr.menuTexture.needsUpdate = true;
}

// -----------------------------------------------------------------------------
// Per-Frame Update (Locomotion, Teleportation Raycast, UI Hover, Active Aim)
// -----------------------------------------------------------------------------
const _raycaster = new THREE.Raycaster();
const _tempMat = new THREE.Matrix4();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

export function updateVR(dt, ctx) {
  const vr = ctx.vr;
  if (!vr || !ctx.renderer.xr.isPresenting) return;

  const session = ctx.renderer.xr.getSession();

  // 1. Unified Gamepad Thumbstick Locomotion & Turning
  if (session && session.inputSources) {
    let moveX = 0, moveY = 0, turnX = 0;

    for (const source of session.inputSources) {
      if (source.gamepad && source.gamepad.axes) {
        const axes = source.gamepad.axes;
        // Axes indices standard: [0, 1] touch/stick or [2, 3] primary thumbstick
        const ax = Math.abs(axes[2]) > 0.15 ? axes[2] : (Math.abs(axes[0]) > 0.15 ? axes[0] : 0);
        const ay = Math.abs(axes[3]) > 0.15 ? axes[3] : (Math.abs(axes[1]) > 0.15 ? axes[1] : 0);

        if (source.handedness === 'left') {
          moveX += ax;
          moveY += ay;
        } else if (source.handedness === 'right') {
          turnX += ax;
        }
      }
    }

    // Apply movement relative to HMD yaw
    const p = ctx.player;
    if (p && (Math.abs(moveX) > 0 || Math.abs(moveY) > 0)) {
      ctx.camera.getWorldDirection(_fwd);
      _fwd.y = 0;
      _fwd.normalize();
      _right.set(-_fwd.z, 0, _fwd.x);

      const speed = p.sprinting ? 6.0 : 3.8;
      p.position.addScaledVector(_right, moveX * speed * dt);
      p.position.addScaledVector(_fwd, -moveY * speed * dt);
    }

    // Smooth / snap turning on right stick
    if (p && Math.abs(turnX) > 0.25) {
      const now = performance.now();
      if (now - vr.lastSnapTime > 220) {
        p.yaw -= Math.sign(turnX) * (Math.PI / 6); // 30-degree snap turn
        vr.lastSnapTime = now;
      }
    }
  }

  // 2. Update Controller Pointing Rays & Reticles
  vr.teleportValid = false;
  vr.hoveredButton = null;

  for (let i = 0; i < 2; i++) {
    const controller = vr.controllers[i];
    const ray = vr.pointingRays[i];
    const reticle = vr.reticles[i];

    if (!controller.visible) {
      reticle.visible = false;
      continue;
    }

    _tempMat.identity().extractRotation(controller.matrixWorld);
    const origin = controller.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyMatrix4(_tempMat).normalize();

    // Cache active aim for weapon hitscan
    if (i === vr.activeControllerIndex) {
      vr.activeAim.origin.copy(origin);
      vr.activeAim.dir.copy(dir);
      vr.activeAim.quaternion.copy(controller.quaternion);
    }

    _raycaster.set(origin, dir);
    _raycaster.near = 0.05;
    _raycaster.far = 25;

    let hitDist = 12;
    let hitFound = false;

    // Check interaction with 3D menu panel
    if (vr.menuMesh?.visible) {
      const menuHits = _raycaster.intersectObject(vr.menuMesh);
      if (menuHits.length > 0) {
        const hit = menuHits[0];
        hitDist = hit.distance;
        hitFound = true;

        if (hit.uv) {
          const uvX = hit.uv.x * vr.menuCanvas.width;
          const uvY = (1 - hit.uv.y) * vr.menuCanvas.height;

          for (const btn of vr.menuButtons) {
            if (uvX >= btn.x && uvX <= btn.x + btn.w && uvY >= btn.y && uvY <= btn.y + btn.h) {
              vr.hoveredButton = btn;
              break;
            }
          }
        }
      }
    }

    // If not hovering over menu, check ground for accessible teleportation
    if (!hitFound && ctx.state === 'playing') {
      const colliders = ctx.raycastTargets || [];
      const groundHits = _raycaster.intersectObjects(colliders, false);
      for (const gh of groundHits) {
        // Find ground / floor hits
        if (gh.point.y < origin.y - 0.2 && gh.normal?.y > 0.6) {
          hitDist = gh.distance;
          hitFound = true;
          vr.teleportValid = true;
          vr.teleportTarget.copy(gh.point);
          if (vr.teleportMarker) {
            vr.teleportMarker.position.copy(gh.point);
            vr.teleportMarker.position.y += 0.03;
            vr.teleportMarker.visible = true;
          }
          break;
        }
      }
    }

    // Update ray visual length and reticle position
    ray.scale.z = hitDist;
    if (hitFound) {
      reticle.position.copy(origin).addScaledVector(dir, hitDist - 0.01);
      reticle.lookAt(ctx.camera.position);
      reticle.visible = true;
    } else {
      reticle.visible = false;
    }
  }

  if (!vr.teleportValid && vr.teleportMarker) {
    vr.teleportMarker.visible = false;
  }

  // 3. Render Dynamic Canvas Textures
  updateVRHUD(ctx, vr, dt);
  if (vr.menuMesh?.visible) {
    renderVRMenu(ctx, vr);
  }
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
