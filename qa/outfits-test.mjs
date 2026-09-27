// Outfits (world/outfits.js): McGUINNESS (m12 + afro), THE ELF (1.70 m, three-stripe track suit), and two online players who
// see each other as the hero (m20, 1.83 m, jeans + a different SOAD-style tee each), plus the durak MP seat swatches.
// node qa/outfits-test.mjs [outdir]
import { chromium } from 'playwright-core';
const out = process.argv[2] || '/tmp';
const room = 'of' + Math.random().toString(36).slice(2, 6);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const errs = [];
const mk = async (n, url, w = 900, h = 700) => { const p = await b.newPage({ viewport: { width: w, height: h } }); p.on('pageerror', (e) => errs.push(n + ': ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && /outfit|shader|WebGL/i.test(m.text())) errs.push(n + ' console: ' + m.text().slice(0, 300)); });
  await p.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
  await p.goto(url, { timeout: 150000 }); return p; };
const until = async (fn, ms = 10000, step = 100) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await new Promise((r) => setTimeout(r, step)); } };

// figure lookups + measurement (world-space bbox of the skinned meshes in their current animated pose)
const HELP = () => {
  const T = window.__ctx.scene, THREE_ = window.__THREE;
  const persons = []; T.traverse((o) => { if (o.name === 'person') persons.push(o); });
  const has = (g, f) => { let r = false; g.traverse((o) => { if (!r && f(o)) r = true; }); return r; };
  const measure = (g) => { g.updateMatrixWorld(true); let lo = Infinity, hi = -Infinity; g.traverse((o) => { if (o.isSkinnedMesh && !/opacity/i.test(o.material?.name || '')) { const p = o.geometry.attributes.position, v = new THREE_.Vector3(); for (let i = 0; i < p.count; i += 3) { v.fromBufferAttribute(p, i); o.applyBoneTransform(i, v); v.applyMatrix4(o.matrixWorld); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); } } }); return +(hi - lo).toFixed(3); };
  return { persons, has, measure };
};

// ---------------------------------------------------------------------------------------------------------- NPCs at the table
{
  const P = await mk('solo', `http://localhost:8790/?qa=1&map=coney&ai=0&time=day`);
  await P.waitForFunction(() => window.__game?.ready && window.__game.hangout?.arkady(), null, { timeout: 150000 });
  await P.evaluate(async () => { window.__THREE = await import('three'); window.__game.setState('playing'); });
  const info = await P.evaluate(`(() => { const H = (${HELP})();
    const vend = window.__game.hangout.vendors(); const v = (n) => vend.find((x) => x.name === n);
    const mcg = H.persons.find((g) => H.has(g, (o) => o.name === 'afro')), elf = H.persons.find((g) => H.has(g, (o) => /_track$/.test(o.material?.name || '')));
    return { mcg: v('McGUINNESS')?.pos, elf: v('THE ELF')?.pos, mcgH: mcg && H.measure(mcg), elfH: elf && H.measure(elf), mcgAv: !!mcg, elfAv: !!elf, rest: window.__outfitsRest?.() };
  })()`);
  console.log('npc', JSON.stringify(info));
  ok(info.mcgAv, 'McGUINNESS has an afro');
  ok(info.elfAv, 'THE ELF wears the baked track suit');
  ok(info.elfH && Math.abs(info.elfH - 1.70) < 0.05, 'THE ELF stands ~1.70 m', info.elfH);
  const look = async (pos, name, dist = 2.1, ang = 0, dy = 0) => {
    await P.evaluate(([q, d, a, dy]) => { const x = q[0] + Math.sin(a) * d, z = q[2] + Math.cos(a) * d; window.__game.teleport(x, q[1] + dy, z, Math.atan2(-(q[0] - x), -(q[2] - z)), -0.12); }, [pos, dist, ang, dy]);
    await P.waitForTimeout(900); await P.screenshot({ path: `${out}/${name}.png` });
  };
  // stand in front of each (they face their own yaw; try a few angles)
  for (const [k, a] of [['front', 0], ['side', 1.6], ['back', 3.14]]) { await look(info.mcg, 'mcg-' + k, 2.0, 2.2 + a); await look(info.elf, 'elf-' + k, 2.0, -2.4 + a); }
  await P.close();
}
if (process.argv.includes('--npc')) { console.log(errs.length ? 'ERRORS ' + errs.join('\n') : 'no page errors'); await b.close(); process.exit(fails ? 1 : 0); }
