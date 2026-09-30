import { chromeOptions } from './browser-launch.mjs';
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const browser = await chromium.launch(chromeOptions({
  ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' }),
  headless: process.env.QA_HEADED !== '1',
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling'
  ]
}));

try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('http://localhost:8790/?qa=1&quality=low', { timeout: 120000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });

  console.log('Testing WebXR VR implementation');

  const xrChecks = await page.evaluate(async () => {
    const c = window.__game.ctx;
    const results = [];
    const check = (ok, msg) => { if (!ok) throw new Error(msg); results.push(msg); };

    // 1. WebXR Setup & VRButton
    check(!!c.renderer.xr, 'Renderer XR manager present');
    check(c.renderer.xr.enabled === true, 'renderer.xr.enabled is true');
    const vrBtn = document.getElementById('vr-button');
    check(!!vrBtn, 'VRButton appended to DOM (#vr-button)');

    // 2. Camera & Locomotion Rig
    check(!!c.playerRig, 'playerRig group exists in context');
    check(c.playerRig.name === 'playerRig', 'playerRig named correctly');
    check(c.camera.parent === c.playerRig, 'Camera is reparented to playerRig');
    check(c.playerRig.parent === c.scene, 'playerRig is in scene');

    // 3. Controllers & Hands
    check(!!c.vr, 'VR subsystem initialized');
    check(c.vr.controllers.length === 2, 'Two XR controllers registered');
    check(c.vr.pointingRays.length === 2, 'Pointing rays attached to both controllers');
    check(c.vr.reticles.length === 2, 'Reticles created for both controllers');
    check(c.vr.hands.length === 2, 'Two XR hands registered with OculusHandModelFactory');
    check(!!c.vr.teleportMarker, 'Ground teleport marker exists');

    // 4. World-Space 3D UI
    check(!!c.vr.hudMesh, 'World-space 3D HUD mesh exists');
    check(!!c.vr.hudTexture, 'HUD canvas texture initialized');
    check(!!c.vr.menuMesh, 'World-space 3D interactive menu mesh exists');
    check(c.vr.menuButtons.length >= 4, 'Interactive VR menu buttons configured');

    // 5. Performance Caps
    const dpr = c.renderer.getPixelRatio();
    check(dpr <= 1.25, `Pixel ratio capped for VR (actual: ${dpr})`);

    // 6. Weapon Aim Routing
    c.vr.activeAim.dir.set(0, 0, -1);
    check(!!c.vr.activeAim.dir, 'Active aim vector accessible');

    return results;
  });

  for (const label of xrChecks) {
    console.log('PASS ' + label);
  }

  assert.deepEqual(errors, [], 'No browser errors during WebXR execution');
  console.log('ALL WEBXR CHECKS PASS');
} finally {
  await browser.close();
}
