// Local regression checks; no public broker connection. Run after ./qa/serve.sh.
// CHROME_BIN and PLAYWRIGHT_MODULE optionally select an installed browser / Playwright module.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const browser = await chromium.launch({ ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' }), headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) console.log('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto('http://localhost:8790/?qa=1&map=coney&ai=0&touch=1&audiotest=1&quality=low', { timeout: 150000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 150000 });
  console.log('Game ready; checking review regressions');
  const checks = await page.evaluate(async () => {
    const c = window.__game.ctx, results = [];
    const check = (ok, label) => { if (!ok) throw new Error(label); results.push(label); };
    c.settings.shadows = false; c.bus.emit('setting', { key: 'shadows', value: false });
    check(!c.renderer.shadowMap.enabled, 'Shadows disabled before reset');
    document.querySelector('.panel.settings .reset').click();
    check(c.settings.shadows && c.renderer.shadowMap.enabled, 'Restore defaults reapplies shadows');
    c.settings.quality = 'low'; c.bus.emit('quality', 'low');
    check(!!window.__game.hangout.roofDoor(), 'Roof doors remain available alongside lobby doors');
    const world = await import('/src/world.js'); world.update(0, c);
    check(true, 'World update handles lobby and roof doors together');

    const touch = (sel, type, id, remaining = []) => {
      const el = document.querySelector('#touch ' + sel), t = i => new Touch({ identifier: i, target: el, clientX: 10, clientY: 10 });
      el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, changedTouches: [t(id)], targetTouches: remaining.map(t), touches: remaining.map(t) }));
    };
    touch('.fire', 'touchstart', 1, [1]); touch('.fireL', 'touchstart', 2, [2]); touch('.fire', 'touchend', 1);
    check(c.input.touch.fire, 'Releasing right fire preserves left trigger');
    touch('.fireL', 'touchcancel', 2); check(!c.input.touch.fire, 'Last cancelled trigger stops firing');
    touch('.fire', 'touchstart', 3, [3]); touch('.fire', 'touchstart', 4, [3, 4]); touch('.fire', 'touchend', 3, [4]);
    check(c.input.touch.fire, 'Two fingers on one trigger stay active');
    c.bus.emit('playerDied'); touch('.fire', 'touchstart', 5, [5]); touch('.fire', 'touchend', 5);
    check(!c.input.touch.fire, 'Death clears old trigger identifiers');
    c.input.mouse.wheel = 0; c.input.pressed.clear(); touch('.swap', 'touchstart', 6, [6]);
    check(!c.input.mouse.wheel && (c.input.pressed.has('Digit1') || c.input.pressed.has('Digit2')), 'Touch swap does not also change scope zoom');
    c.input.pressed.clear();

    const audio = await import('/src/audio.js'), amb = c.audio.engine.ambience;
    const originalAmb = c.world.ambience;
    for (const on of [true, false, true]) { c.settings.rain = on; audio.update(0, c); check(amb.rainOff, 'Dry map suppresses rain with setting ' + on); }
    c.world.ambience = 'rain-industrial'; audio.update(0, c); check(!amb.rainOff, 'Wet map enables rain');
    c.settings.rain = false; audio.update(0, c); check(amb.rainOff, 'Rain setting mutes wet map');
    c.world.ambience = originalAmb;

    const { kit } = await import('/src/world/hangkit.js'), V = kit(), oldNet = c.net;
    const friend = { name: 'FRIEND', pos: c.player.position.clone(), dead: false, afk: false }, sent = [];
    c.net = { id: 'local000', list: () => ['friend00'], peer: id => id === 'friend00' ? friend : null, send: (t, m) => sent.push({ t, ...m }) };
    const cash = V.cash, gift = { f: 'friend00', to: 'local000', n: 10 };
    c.bus.emit('net:cash', { ...gift, f: 'unknown0' }); c.bus.emit('net:cash', { ...gift, n: 50 });
    friend.pos.y += 20; c.bus.emit('net:cash', gift);
    check(V.cash === cash, 'Unknown, oversized and other-floor gifts rejected');
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN' }));
    check(!sent.length && V.cash === cash, 'Sending cash between floors rejected');
    friend.pos.copy(c.player.position); c.bus.emit('net:cash', gift);
    check(V.cash === cash + 10, 'Nearby valid gift received');
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN' }));
    check(V.cash === cash && sent.length === 1 && sent[0].n === 10, 'Nearby gift debits sender and sends ten dollars');
    c.net = oldNet;

    const count = () => window.__game.crews.state().remote, before = count();
    const thug = { f: 'friend00', i: 7, n: 'GOPNIK', k: 'ru', st: 'walk', x: 0, y: 0, z: 0, r: 0 };
    for (const m of [{ ...thug, i: -1 }, { ...thug, y: null }, { ...thug, z: Infinity }, { ...thug, r: NaN }]) c.bus.emit('net:thug', m);
    check(count() === before, 'Malformed thug packets create no actors');
    c.bus.emit('net:thug', thug); check(count() === before + 1, 'Valid remote thug still spawns');
    c.bus.emit('net:thug', { ...thug, st: 'gone' }); check(count() === before, 'Remote thug removal still works');

    const waves = await import('/src/netwaves.js'), { Bus } = await import('/src/ctx.js');
    const peers = new Map([['host0000', { afk: false }], ['other000', { afk: false }]]), bus = new Bus();
    let damage = 0, kills = 0;
    const mock = { qs: new URLSearchParams(), state: 'playing', bus, world: {},
      player: { dead: false, damage: n => { damage += n; } },
      net: { id: 'local000', connected: true, send() {}, list: () => [...peers.keys()], peer: id => peers.get(id) },
      ai: { mpSpawnSquad() {}, setMirror() {} }, hud: { killfeed() { kills++; } } };
    const api = await waves.init(mock), state = { s: [], w: 1, ph: 1, pt: 10 };
    bus.emit('net:wv', { ...state, f: 'unknown0' }); check(api.hostId === null, 'Unknown wave host rejected');
    bus.emit('net:wv', { ...state, f: 'host0000' }); check(api.hostId === 'host0000', 'First eligible wave host accepted');
    bus.emit('net:wv', { ...state, f: 'other000' }); check(api.hostId === 'host0000', 'Fresh host cannot be replaced by another peer');
    bus.emit('net:wvshot', { f: 'other000', to: 'local000', dmg: 50 }); check(damage === 0, 'Nonhost wave damage rejected');
    bus.emit('net:wvshot', { f: 'host0000', to: 'local000', dmg: 20, p: [] }); check(damage === 20, 'Host wave damage accepted with absent origin');
    bus.emit('net:wvkill', { f: 'other000', id: 5 }); check(kills === 0, 'Nonhost wave kill rejected');
    bus.emit('net:wvkill', { f: 'host0000', id: 5 }); check(kills === 1, 'Host wave kill accepted');
    peers.delete('host0000'); bus.emit('net:wv', { ...state, f: 'other000' });
    check(api.hostId === 'other000', 'Host migration works after departure');
    check(!c.bootErrors?.length, 'No boot failures');
    return results;
  });
  for (const label of checks) console.log('PASS ' + label);
  assert.deepEqual(errors, [], 'Browser errors');
  console.log('ALL PASS');
} finally { await browser.close(); }
