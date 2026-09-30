#!/usr/bin/env node
import { chromeOptions } from './browser-launch.mjs';

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

const url = 'http://localhost:8790/?map=coney&go=1&v=' + Date.now();
console.log('Testing VR depth, rig positioning, and viewmodel hiding on Coney Island:', url);

const page = await browser.newPage();
page.on('console', msg => {
  if (msg.type() === 'error') console.error('[browser error]', msg.text());
});

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 60000 });

const res = await page.evaluate(async () => {
  const ctx = window.__game.ctx;
  const renderer = ctx.renderer;
  const camera = ctx.camera;
  const playerRig = ctx.playerRig;
  const player = ctx.player;
  const vr = ctx.vr;

  const initialPlayerPos = { x: player.position.x, y: player.position.y, z: player.position.z };
  const initialNear = camera.near;
  const initialVmVisible = ctx.weapons?.viewmodel ? ctx.weapons.viewmodel.visible : null;

  // Simulate XR sessionstart
  renderer.xr.isPresenting = true;
  renderer.xr.dispatchEvent({ type: 'sessionstart' });

  const vrPlayerPos = { x: player.position.x, y: player.position.y, z: player.position.z };
  const vrRigPos = { x: playerRig.position.x, y: playerRig.position.y, z: playerRig.position.z };
  const vrNear = camera.near;
  const vrVmVisible = ctx.weapons?.viewmodel ? ctx.weapons.viewmodel.visible : null;

  // Run a frame while presenting
  window.__game.frame(performance.now() + 16);

  const vrRigPosAfterFrame = { x: playerRig.position.x, y: playerRig.position.y, z: playerRig.position.z };

  // Simulate XR sessionend
  renderer.xr.isPresenting = false;
  renderer.xr.dispatchEvent({ type: 'sessionend' });

  const endNear = camera.near;
  const endVmVisible = ctx.weapons?.viewmodel ? ctx.weapons.viewmodel.visible : null;

  return {
    initialPlayerPos,
    initialNear,
    initialVmVisible,
    vrPlayerPos,
    vrRigPos,
    vrNear,
    vrVmVisible,
    vrRigPosAfterFrame,
    endNear,
    endVmVisible,
    menuHasExitVr: vr.menuButtons.some(b => b.id === 'exit-vr'),
    menuHasResume: vr.menuButtons.some(b => b.id === 'resume'),
  };
});

console.log('Results:', JSON.stringify(res, null, 2));

let failed = false;
if (res.vrNear !== 0.15) {
  console.error(`FAIL: VR near plane expected 0.15, got ${res.vrNear}`);
  failed = true;
} else {
  console.log('PASS: VR camera near plane is 0.15 (eliminates mobile Z-fighting)');
}

if (res.vrVmVisible !== false) {
  console.error(`FAIL: VR viewmodel expected hidden (false), got ${res.vrVmVisible}`);
  failed = true;
} else {
  console.log('PASS: Desktop viewmodel hidden in VR (eliminates double-vision focus conflict)');
}

if (Math.abs(res.vrRigPos.x - res.initialPlayerPos.x) > 0.01 || Math.abs(res.vrRigPos.z - res.initialPlayerPos.z) > 0.01) {
  console.error(`FAIL: playerRig (${res.vrRigPos.x}, ${res.vrRigPos.z}) did not match player position (${res.initialPlayerPos.x}, ${res.initialPlayerPos.z})`);
  failed = true;
} else {
  console.log('PASS: playerRig position matches player spawn (at Table Park, not 0,0,0)');
}

if (res.endNear !== 0.03) {
  console.error(`FAIL: Restored near plane expected 0.03, got ${res.endNear}`);
  failed = true;
} else {
  console.log('PASS: Desktop camera near plane restored to 0.03 on sessionend');
}

if (res.endVmVisible !== true) {
  console.error(`FAIL: Restored viewmodel expected visible (true), got ${res.endVmVisible}`);
  failed = true;
} else {
  console.log('PASS: Desktop viewmodel restored on sessionend');
}

if (!res.menuHasExitVr) {
  console.error('FAIL: Missing exit-vr button in VR menu');
  failed = true;
} else {
  console.log('PASS: Exit VR button present in 3D menu');
}

await browser.close();
process.exit(failed ? 1 : 0);
