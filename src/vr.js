// WebXR VR subsystem optimized for Meta Quest 2 and Quest 3.
// Specialized for seamless Hand Tracking (pinch-to-click, pinch-to-teleport, wrist menu)
// as well as Touch Controllers.
import * as THREE from 'three';
import { OculusHandModelFactory } from 'three/addons/webxr/OculusHandModelFactory.js';

export function initVR(ctx) {
  const { renderer, scene, camera, playerRig } = ctx;
  if (!renderer.xr) return null;

  const vr = {
    enabled: true,
    controllers: [],
    hands: [],
    pointingRays: [],
    reticles: [],
    wristMenuButton: null,
    activeAim: {
      origin: new THREE.Vector3(),
      dir: new THREE.Vector3(0, 0, -1),
      quaternion: new THREE.Quaternion()
    },
    // Locomotion & Teleportation
    teleportMarker: null,
    teleportValid: false,
    teleportTarget: new THREE.Vector3(),
    pinchDragStart: null,
    // 3D HUD & 3D Settings Menu
    hudMesh: null,
    hudCanvas: null,
    hudCtx: null,
    hudTexture: null,
    hudDirty: true,
    hudLastUpdate: 0,
    hudLastData: { hp: -1, ammo: -1, res: -1, wave: -1, wName: '' },
    menuMesh: null,
    menuCanvas: null,
    menuCtx: null,
    menuTexture: null,
    menuDirty: true,
    menuButtons: [],
    hoveredButton: null,
    settings: {
      shadows: false,
      muted: false,
      snapTurn: true,
    },
    hitmarkerTimer: 0,
    dmgFlash: 0,
    toastText: '',
    toastTimer: 0,
    lastSnapTime: 0,
  };

  ctx.vr = vr;

  // 1. Session Start / End: Optimizations for Quest 2
  renderer.xr.addEventListener('sessionstart', () => {
    const session = renderer.xr.getSession();

    // Quest 2 Performance: Cap pixel ratio & enable aggressive foveation
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    if (typeof renderer.xr.setFoveation === 'function') {
      renderer.xr.setFoveation(1.0);
    }

    // Request 72 Hz refresh rate
    if (session?.supportedFrameRates && typeof session.updateTargetFrameRate === 'function') {
      if (session.supportedFrameRates.includes(72)) {
        session.updateTargetFrameRate(72).catch(() => {});
      }
    }

    // Default shadows to OFF in VR for Quest 2 fillrate stability
    applyVRShadows(ctx, false);

    // Auto-enter playing state in VR so user can immediately move, shoot, and play
    ctx.setState('playing');
    if (ctx.audio?.engine?.ctx?.state === 'suspended') {
      ctx.audio.engine.ctx.resume().catch(() => {});
    }

    showVRToast(vr, 'HAND TRACKING READY · RIGHT PINCH: SHOOT · LEFT PINCH: TELEPORT', 4000);
  });

  renderer.xr.addEventListener('sessionend', () => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ctx.settings?.renderScale ?? 1));
    applyVRShadows(ctx, ctx.settings?.shadows !== false);
  });

  // 2. Controllers & Pointing Rays (Target Ray Space for Hands & Controllers)
  const rayGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1)
  ]);

  const reticleGeo = new THREE.RingGeometry(0.012, 0.024, 24);
  const reticleMat = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    depthTest: false
  });

  for (let i = 0; i < 2; i++) {
    const controller = renderer.xr.getController(i);
    controller.userData.index = i;
    controller.userData.handedness = (i === 0 ? 'left' : 'right');
    playerRig.add(controller);
    vr.controllers.push(controller);

    controller.addEventListener('connected', (event) => {
      const source = event.data;
      if (source?.handedness) {
        controller.userData.handedness = source.handedness;
      }
    });

    // Laser beam
    const lineMat = new THREE.LineBasicMaterial({
      color: i === 1 ? 0xf43f5e : 0x06b6d4, // Red laser on right hand (gun), cyan on left hand (locomotion)
      transparent: true,
      opacity: 0.7,
      linewidth: 2
    });
    const line = new THREE.Line(rayGeo.clone(), lineMat);
    line.name = 'ray';
    line.scale.z = 4;
    controller.add(line);
    vr.pointingRays.push(line);

    // Reticle dot
    const reticle = new THREE.Mesh(reticleGeo.clone(), reticleMat.clone());
    reticle.name = 'reticle';
    reticle.visible = false;
    scene.add(reticle);
    vr.reticles.push(reticle);

    // Unified Input Handlers (Touch controller trigger press OR hand tracking pinch)
    controller.addEventListener('selectstart', (e) => onSelectStart(e, controller, ctx, vr));
    controller.addEventListener('selectend', (e) => onSelectEnd(e, controller, ctx, vr));
    controller.addEventListener('select', (e) => onSelect(e, controller, ctx, vr));
  }

  // 3. Hand Meshes via OculusHandModelFactory (Optimized for Quest 2)
  const handModelFactory = new OculusHandModelFactory();
  for (let i = 0; i < 2; i++) {
    const hand = renderer.xr.getHand(i);
    hand.userData.index = i;
    hand.userData.handedness = (i === 0 ? 'left' : 'right');
    playerRig.add(hand);

    hand.addEventListener('connected', (event) => {
      const source = event.data;
      if (source?.handedness) {
        hand.userData.handedness = source.handedness;
      }
    });

    const handModel = handModelFactory.createHandModel(hand, 'boxes');
    // Optimize hand model: disable expensive dynamic shadow rendering on mobile GPU
    handModel.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        if (o.material) {
          o.material.roughness = 0.8;
          o.material.metalness = 0.1;
        }
      }
    });
    hand.add(handModel);
    vr.hands.push(hand);
  }

  // Floating Wrist Menu Button attached to Left Hand
  buildWristMenuButton(vr);

  // 4. Ground Teleport Marker
  const tpRingGeo = new THREE.RingGeometry(0.3, 0.38, 32);
  tpRingGeo.rotateX(-Math.PI / 2);
  const tpInnerGeo = new THREE.CircleGeometry(0.24, 32);
  tpInnerGeo.rotateX(-Math.PI / 2);
  const tpMat = new THREE.MeshBasicMaterial({
    color: 0x06b6d4,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const tpMarker = new THREE.Group();
  tpMarker.add(new THREE.Mesh(tpRingGeo, tpMat));
  tpMarker.add(new THREE.Mesh(tpInnerGeo, new THREE.MeshBasicMaterial({
    color: 0x06b6d4,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false
  })));
  tpMarker.visible = false;
  scene.add(tpMarker);
  vr.teleportMarker = tpMarker;

  // 5. World-Space 3D HUD
  buildVRHUD(ctx, vr);

  // 6. World-Space 3D Settings & Menu Panel
  buildVRMenu(ctx, vr);

  // Event bus hooks
  ctx.bus?.on?.('hit', () => { vr.hitmarkerTimer = 0.25; vr.hudDirty = true; });
  ctx.bus?.on?.('playerDamaged', () => { vr.dmgFlash = 0.3; vr.hudDirty = true; });

  return vr;
}

// -----------------------------------------------------------------------------
// Unified Hand & Controller Input Handlers
// -----------------------------------------------------------------------------
function onSelectStart(e, controller, ctx, vr) {
  const isLeft = controller.userData.handedness === 'left';

  // 1. Interacting with 3D Menu Panel
  if (vr.menuMesh?.visible && vr.hoveredButton) {
    vr.hoveredButton.action();
    vr.menuDirty = true;
    return;
  }

  // 2. Interacting with Wrist Menu Button
  if (vr.hoveredWrist) {
    toggleVRMenu(ctx, vr);
    return;
  }

  // 3. Left Hand: Ground Teleportation
  if (isLeft && vr.teleportValid && ctx.player) {
    ctx.player.teleport(vr.teleportTarget.x, vr.teleportTarget.y, vr.teleportTarget.z);
    vr.teleportValid = false;
    if (vr.teleportMarker) vr.teleportMarker.visible = false;
    ctx.audio?.engine?.play?.('teleport');
    return;
  }

  // 4. Left Hand: Start air drag walking if not aiming at ground
  if (isLeft) {
    const pos = controller.getWorldPosition(new THREE.Vector3());
    vr.pinchDragStart = { x: pos.x, y: pos.y, z: pos.z };
    return;
  }

  // 5. Right Hand: Weapon Shooting (Pinch-to-shoot)
  if (!isLeft && ctx.state === 'playing') {
    ctx.input.vr.fire = true;
    ctx.input.pressed.add('Mouse0');
    if (ctx.weapons?.fire) {
      ctx.weapons.fire();
    }
  }
}

function onSelectEnd(e, controller, ctx, vr) {
  const isLeft = controller.userData.handedness === 'left';
  if (!isLeft) {
    ctx.input.vr.fire = false;
  } else {
    vr.pinchDragStart = null;
    ctx.input.vr.axis.x = 0;
    ctx.input.vr.axis.y = 0;
  }
}

function onSelect(e, controller, ctx, vr) {
  // Select completes a click/pinch
}

// -----------------------------------------------------------------------------
// Left Wrist Menu Button (Glance at left wrist to open settings)
// -----------------------------------------------------------------------------
function buildWristMenuButton(vr) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 96;
  const c = canvas.getContext('2d');
  c.fillStyle = 'rgba(10, 15, 25, 0.9)';
  c.strokeStyle = '#e9a23b';
  c.lineWidth = 4;
  c.roundRect(4, 4, 248, 88, 16);
  c.fill(); c.stroke();
  c.fillStyle = '#f8fafc';
  c.font = '700 32px system-ui, sans-serif';
  c.textAlign = 'center';
  c.fillText('⚙️ MENU', 128, 58);

  const tex = new THREE.CanvasTexture(canvas);
  const geo = new THREE.PlaneGeometry(0.1, 0.04);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'wrist-menu-btn';
  mesh.position.set(0.08, 0.04, 0.05);
  mesh.rotation.set(-Math.PI / 2, 0, Math.PI / 2);

  if (vr.hands[0]) {
    vr.hands[0].add(mesh);
  }
  vr.wristMenuButton = mesh;
}

// -----------------------------------------------------------------------------
// World-space 3D HUD (Attached to camera)
// -----------------------------------------------------------------------------
function buildVRHUD(ctx, vr) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 280;
  const hCtx = canvas.getContext('2d');

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const hudGeo = new THREE.PlaneGeometry(0.85, 0.24);
  const hudMat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
    depthWrite: false
  });

  const hudMesh = new THREE.Mesh(hudGeo, hudMat);
  hudMesh.name = 'vr-hud';
  hudMesh.position.set(0, -0.28, -0.85);
  hudMesh.rotation.x = -0.25;
  hudMesh.renderOrder = 999;

  ctx.camera.add(hudMesh);

  vr.hudMesh = hudMesh;
  vr.hudCanvas = canvas;
  vr.hudCtx = hCtx;
  vr.hudTexture = texture;
  vr.hudDirty = true;
}

function updateVRHUD(ctx, vr, dt, now) {
  if (!vr.hudCtx) return;

  const p = ctx.player;
  const wpn = ctx.weapons;
  const curW = wpn?.current;
  const hp = Math.max(0, Math.round(p?.health ?? 100));
  const ammo = curW?.ammo ?? 30;
  const reserve = curW?.reserve ?? 120;
  const wave = ctx.ai?.wave ?? 1;
  const wName = curW?.name || wpn?.primary?.id?.toUpperCase() || 'M4A1';

  if (vr.hitmarkerTimer > 0) { vr.hitmarkerTimer -= dt; vr.hudDirty = true; }
  if (vr.dmgFlash > 0) { vr.dmgFlash -= dt; vr.hudDirty = true; }
  if (vr.toastTimer > 0) { vr.toastTimer -= dt; vr.hudDirty = true; }

  // Check if data changed or 100ms throttle reached
  const d = vr.hudLastData;
  if (!vr.hudDirty && d.hp === hp && d.ammo === ammo && d.res === reserve && d.wave === wave && d.wName === wName && now - vr.hudLastUpdate < 120) {
    return;
  }

  d.hp = hp; d.ammo = ammo; d.res = reserve; d.wave = wave; d.wName = wName;
  vr.hudLastUpdate = now;
  vr.hudDirty = false;

  const c = vr.hudCtx;
  const w = vr.hudCanvas.width, h = vr.hudCanvas.height;
  c.clearRect(0, 0, w, h);

  c.save();
  // Frame
  c.fillStyle = 'rgba(7, 10, 16, 0.82)';
  c.strokeStyle = vr.dmgFlash > 0 ? '#ef4444' : 'rgba(233, 162, 59, 0.5)';
  c.lineWidth = 3;
  roundRect(c, 16, 16, w - 32, h - 32, 18);
  c.fill();
  c.stroke();

  // Health
  c.fillStyle = '#94a3b8';
  c.font = '600 22px system-ui, sans-serif';
  c.fillText('HEALTH', 44, 58);

  const hpFrac = Math.max(0, Math.min(1, hp / 100));
  c.fillStyle = '#1e293b';
  c.fillRect(44, 72, 260, 22);
  c.fillStyle = hp > 50 ? '#22c55e' : hp > 25 ? '#f59e0b' : '#ef4444';
  c.fillRect(44, 72, 260 * hpFrac, 22);

  c.fillStyle = '#f8fafc';
  c.font = '700 32px monospace';
  c.fillText(`${hp} HP`, 44, 134);

  // Weapon & Ammo
  c.textAlign = 'right';
  c.fillStyle = '#94a3b8';
  c.font = '600 22px system-ui, sans-serif';
  c.fillText('WEAPON', w - 44, 58);

  c.fillStyle = '#eab308';
  c.font = '700 28px system-ui, sans-serif';
  c.fillText(wName, w - 44, 95);

  c.fillStyle = ammo === 0 ? '#ef4444' : '#ffffff';
  c.font = '700 44px monospace';
  c.fillText(`${ammo}`, w - 150, 150);

  c.fillStyle = '#64748b';
  c.font = '600 26px monospace';
  c.fillText(`/ ${reserve}`, w - 44, 150);

  // Center: Status / Toast / Controls
  c.textAlign = 'center';
  if (vr.toastTimer > 0 && vr.toastText) {
    c.fillStyle = '#38bdf8';
    c.font = '700 22px system-ui, sans-serif';
    c.fillText(vr.toastText, w / 2, 70);
  } else {
    c.fillStyle = '#38bdf8';
    c.font = '700 24px system-ui, sans-serif';
    c.fillText(`WAVE ${wave}`, w / 2, 60);

    const enemyCount = (ctx.ai?.soldiers || []).filter(s => s?.state !== 'dead').length;
    c.fillStyle = '#94a3b8';
    c.font = '600 20px system-ui, sans-serif';
    c.fillText(enemyCount > 0 ? `${enemyCount} HOSTILES ACTIVE` : 'AREA SECURE', w / 2, 92);
  }

  // Quick Controls Hint
  c.fillStyle = '#64748b';
  c.font = '500 18px system-ui, sans-serif';
  c.fillText('RIGHT PINCH: SHOOT  |  LEFT PINCH: TELEPORT  |  LEFT WRIST: MENU', w / 2, 220);

  // Hitmarker
  if (vr.hitmarkerTimer > 0) {
    c.strokeStyle = '#ef4444';
    c.lineWidth = 4;
    const cx = w / 2, cy = 145, s = 14;
    c.beginPath();
    c.moveTo(cx - s, cy - s); c.lineTo(cx - 4, cy - 4);
    c.moveTo(cx + s, cy - s); c.lineTo(cx + 4, cy - 4);
    c.moveTo(cx - s, cy + s); c.lineTo(cx - 4, cy + 4);
    c.moveTo(cx + s, cy + s); c.lineTo(cx + 4, cy + 4);
    c.stroke();
  }

  c.restore();
  vr.hudTexture.needsUpdate = true;
}

function showVRToast(vr, text, durationMs = 3500) {
  vr.toastText = text;
  vr.toastTimer = durationMs / 1000;
  vr.hudDirty = true;
}

// -----------------------------------------------------------------------------
// World-space 3D Settings & Menu Panel
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
  menuMesh.visible = false;
  ctx.scene.add(menuMesh);

  vr.menuMesh = menuMesh;
  vr.menuCanvas = canvas;
  vr.menuCtx = mCtx;
  vr.menuTexture = texture;
  vr.menuDirty = true;

  // Interactive buttons
  vr.menuButtons = [
    {
      id: 'resume',
      x: 180, y: 240, w: 664, h: 68,
      getLabel: () => '▶  RESUME GAME',
      action: () => toggleVRMenu(ctx, vr, false)
    },
    {
      id: 'shadows',
      x: 180, y: 325, w: 664, h: 68,
      getLabel: () => `SHADOWS: ${vr.settings.shadows ? 'ON (HIGH GPU)' : 'OFF (72 FPS RECOMMENDED)'}`,
      action: () => {
        vr.settings.shadows = !vr.settings.shadows;
        applyVRShadows(ctx, vr.settings.shadows);
        vr.menuDirty = true;
      }
    },
    {
      id: 'audio',
      x: 180, y: 410, w: 664, h: 68,
      getLabel: () => `AUDIO: ${vr.settings.muted ? 'MUTED' : 'ENABLED'}`,
      action: () => {
        vr.settings.muted = !vr.settings.muted;
        if (ctx.audio?.setMasterVolume) {
          ctx.audio.setMasterVolume(vr.settings.muted ? 0 : 1);
        }
        vr.menuDirty = true;
      }
    },
    {
      id: 'respawn',
      x: 180, y: 495, w: 664, h: 68,
      getLabel: () => '📍  RESPAWN AT SAFE POINT',
      action: () => {
        ctx.player?.respawn?.();
        toggleVRMenu(ctx, vr, false);
      }
    },
    {
      id: 'restart',
      x: 180, y: 580, w: 664, h: 68,
      getLabel: () => '🔄  RESTART MISSION',
      action: () => {
        ctx.restart();
        toggleVRMenu(ctx, vr, false);
      }
    }
  ];

  renderVRMenu(ctx, vr);
}

export function toggleVRMenu(ctx, vr, forceState = null) {
  const show = forceState !== null ? forceState : !vr.menuMesh.visible;
  vr.menuMesh.visible = show;

  if (show) {
    // Position menu 1.3m in front of current headset gaze
    const headPos = new THREE.Vector3();
    ctx.camera.getWorldPosition(headPos);
    const headFwd = new THREE.Vector3();
    ctx.camera.getWorldDirection(headFwd);
    headFwd.y = 0;
    if (headFwd.lengthSq() < 1e-4) headFwd.set(0, 0, -1);
    else headFwd.normalize();

    vr.menuMesh.position.copy(headPos).addScaledVector(headFwd, 1.35);
    vr.menuMesh.position.y = headPos.y - 0.05;
    vr.menuMesh.lookAt(headPos);
    vr.menuDirty = true;
  }
}

function renderVRMenu(ctx, vr) {
  if (!vr.menuCtx) return;
  const c = vr.menuCtx;
  const w = vr.menuCanvas.width, h = vr.menuCanvas.height;
  c.clearRect(0, 0, w, h);

  c.save();

  // Background
  c.fillStyle = 'rgba(8, 12, 20, 0.95)';
  c.strokeStyle = '#e9a23b';
  c.lineWidth = 4;
  roundRect(c, 20, 20, w - 40, h - 40, 24);
  c.fill();
  c.stroke();

  // Header Title
  c.textAlign = 'center';
  c.fillStyle = '#f8fafc';
  c.font = '800 48px system-ui, sans-serif';
  c.fillText('ZAVOD : SETTINGS & MENU', w / 2, 90);

  c.fillStyle = '#38bdf8';
  c.font = '600 22px system-ui, sans-serif';
  c.fillText('META QUEST 2 & 3 · HAND TRACKING & CONTROLLERS', w / 2, 130);

  c.fillStyle = '#94a3b8';
  c.font = '500 18px monospace';
  c.fillText('Point hand ray at button and PINCH index finger to select', w / 2, 175);

  // Render Buttons
  for (const btn of vr.menuButtons) {
    const isHovered = vr.hoveredButton === btn;
    c.fillStyle = isHovered ? '#e9a23b' : 'rgba(26, 36, 52, 0.88)';
    c.strokeStyle = isHovered ? '#ffffff' : '#334155';
    c.lineWidth = isHovered ? 3 : 2;

    roundRect(c, btn.x, btn.y, btn.w, btn.h, 12);
    c.fill();
    c.stroke();

    c.fillStyle = isHovered ? '#05070a' : '#f8fafc';
    c.font = isHovered ? '700 26px system-ui, sans-serif' : '600 26px system-ui, sans-serif';
    c.fillText(btn.getLabel(), btn.x + btn.w / 2, btn.y + btn.h / 2 + 9);
  }

  c.restore();
  vr.menuTexture.needsUpdate = true;
  vr.menuDirty = false;
}

function applyVRShadows(ctx, on) {
  if (ctx.renderer) {
    ctx.renderer.shadowMap.enabled = on;
  }
  ctx.scene.traverse((o) => {
    if (o.isLight && o.shadow) {
      o.castShadow = on;
    }
  });
}

// -----------------------------------------------------------------------------
// Per-Frame Update (Locomotion, Aiming, Teleport Raycast, UI Hover)
// -----------------------------------------------------------------------------
const _raycaster = new THREE.Raycaster();
const _tempMat = new THREE.Matrix4();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _planeIntersect = new THREE.Vector3();

export function updateVR(dt, ctx) {
  const vr = ctx.vr;
  if (!vr || !ctx.renderer.xr.isPresenting) return;

  const now = performance.now();
  const session = ctx.renderer.xr.getSession();

  // 1. Hand Pinch-and-Drag Locomotion (Left hand air drag)
  if (vr.pinchDragStart && vr.controllers[0]) {
    const pos = vr.controllers[0].getWorldPosition(new THREE.Vector3());
    const dx = pos.x - vr.pinchDragStart.x;
    const dz = pos.z - vr.pinchDragStart.z;
    // Map hand translation to walking axis
    ctx.input.vr.axis.x = Math.max(-1, Math.min(1, dx * 6));
    ctx.input.vr.axis.y = Math.max(-1, Math.min(1, -dz * 6));
  }

  // 2. Controller Thumbsticks (If controllers are active)
  if (session?.inputSources) {
    for (const source of session.inputSources) {
      if (source.gamepad?.axes) {
        const axes = source.gamepad.axes;
        const ax = Math.abs(axes[2]) > 0.15 ? axes[2] : (Math.abs(axes[0]) > 0.15 ? axes[0] : 0);
        const ay = Math.abs(axes[3]) > 0.15 ? axes[3] : (Math.abs(axes[1]) > 0.15 ? axes[1] : 0);

        if (source.handedness === 'left' && (Math.abs(ax) > 0.15 || Math.abs(ay) > 0.15)) {
          ctx.input.vr.axis.x = ax;
          ctx.input.vr.axis.y = -ay;
        } else if (source.handedness === 'right' && Math.abs(ax) > 0.3) {
          // Snap turn on right stick
          if (now - vr.lastSnapTime > 240) {
            ctx.player.yaw -= Math.sign(ax) * (Math.PI / 6);
            vr.lastSnapTime = now;
          }
        }
      }
    }
  }

  // 3. Update Pointing Rays, Aim, Menu Collision & Teleportation
  vr.teleportValid = false;
  vr.hoveredButton = null;
  vr.hoveredWrist = false;

  for (let i = 0; i < 2; i++) {
    const controller = vr.controllers[i];
    const ray = vr.pointingRays[i];
    const reticle = vr.reticles[i];
    const isLeft = controller.userData.handedness === 'left';

    if (!controller.visible) {
      reticle.visible = false;
      continue;
    }

    _tempMat.identity().extractRotation(controller.matrixWorld);
    const origin = controller.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyMatrix4(_tempMat).normalize();

    // Right Hand updates active aim for weapon hitscan
    if (!isLeft) {
      vr.activeAim.origin.copy(origin);
      vr.activeAim.dir.copy(dir);
      vr.activeAim.quaternion.copy(controller.quaternion);
    }

    _raycaster.set(origin, dir);
    _raycaster.near = 0.05;
    _raycaster.far = 30;

    let hitDist = 10;
    let hitFound = false;

    // Check collision with 3D Menu Panel
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
              if (vr.hoveredButton !== btn) {
                vr.hoveredButton = btn;
                vr.menuDirty = true;
              }
              break;
            }
          }
        }
      }
    }

    // Check collision with Wrist Menu Button (from right hand)
    if (!hitFound && !isLeft && vr.wristMenuButton?.visible) {
      const wristHits = _raycaster.intersectObject(vr.wristMenuButton);
      if (wristHits.length > 0) {
        hitDist = wristHits[0].distance;
        hitFound = true;
        vr.hoveredWrist = true;
      }
    }

    // Left Hand: Robust Ground Teleport Raycast
    if (!hitFound && isLeft && dir.y < -0.15) {
      // 1) Test real geometry in scene
      const sceneTargets = ctx.raycastTargets || [];
      const groundHits = _raycaster.intersectObjects(sceneTargets, true);
      let validHit = null;

      for (const gh of groundHits) {
        if (gh.distance > 0.8 && gh.distance < 30 && gh.point.y < origin.y - 0.2) {
          validHit = gh.point;
          hitDist = gh.distance;
          break;
        }
      }

      // 2) Fallback to ground plane calculation
      if (!validHit) {
        const gY = ctx.world?.groundHeight ? ctx.world.groundHeight(origin.x, origin.z) : 0;
        _groundPlane.constant = -gY;
        if (_raycaster.ray.intersectPlane(_groundPlane, _planeIntersect)) {
          const dist = origin.distanceTo(_planeIntersect);
          if (dist > 0.8 && dist < 30) {
            validHit = _planeIntersect;
            hitDist = dist;
          }
        }
      }

      if (validHit) {
        hitFound = true;
        vr.teleportValid = true;
        vr.teleportTarget.copy(validHit);
        if (vr.teleportMarker) {
          vr.teleportMarker.position.copy(validHit);
          vr.teleportMarker.position.y += 0.04;
          vr.teleportMarker.visible = true;
        }
      }
    }

    // Visual ray beam length and reticle
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

  // 4. Update HUD and Menu Canvas Textures (Throttled for Quest 2)
  updateVRHUD(ctx, vr, dt, now);
  if (vr.menuMesh?.visible && vr.menuDirty) {
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
