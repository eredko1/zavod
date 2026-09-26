// The shared durak table at ARKASHA's over the net: A opens a 3-seat $20 table (A, B, Arkasha AI), B joins; both clients are driven
// with the legal-move API until game over. Checks: identical state on both clients (seq + JSON), only your own hand face up, a
// HUMAN→HUMAN перевод lands on the next seat, the host rejects an illegal move, stakes paid, B walks away mid-game → AI takes the
// seat and the game finishes, and the host walking away → B takes over as host and finishes. node qa/durak-mp-test.mjs [outdir]
import { chromium } from 'playwright-core';
const out = process.argv[2] || '/tmp';
const room = 'dk' + Math.random().toString(36).slice(2, 6);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const errs = [];
const mk = async (n, w = 700, h = 420) => { const p = await b.newPage({ viewport: { width: w, height: h } }); p.on('pageerror', (e) => errs.push(n + ': ' + e.message));
  await p.addInitScript(() => { try { localStorage.setItem('zavod.helpSeen', '1'); } catch {} });
  await p.goto(`http://localhost:8790/?qa=1&mp=1&room=${room}&map=coney&ai=0&time=day&name=${n}`, { timeout: 150000 });
  await p.waitForFunction(() => window.__game?.ready && window.__ctx.net?.connected && window.__game.durakMP && window.__game.hangout?.arkady(), null, { timeout: 150000 }); return p; };
const A = await mk('ALPHA'), B = await mk('BRAVO', 390, 760);   // B on a phone-width screen: 3 seats must fit 390px
await A.waitForFunction(() => window.__ctx.net.list().length >= 1, null, { timeout: 30000 }); await B.waitForFunction(() => window.__ctx.net.list().length >= 1, null, { timeout: 30000 });
const ark = await A.evaluate(() => window.__game.hangout.arkady());
for (const [p, dx] of [[A, 0], [B, 0.8]]) await p.evaluate(([a, dx]) => { window.__game.setState('playing'); window.__game.hangout.give(100); const s = a.seat, q = a.pos; window.__game.teleport(s[0] + dx, 0, s[2], Math.atan2(-(q[0] - s[0]), -(q[2] - s[2])), -0.1); }, [ark, dx]);
await A.waitForTimeout(800);
const st = (p) => p.evaluate(() => window.__game.durakMP.state());
const until = async (fn, ms = 10000, step = 80) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await new Promise((r) => setTimeout(r, step)); } };

// ---- A opens, B sees it (dialog choice) and joins
await A.evaluate(() => window.__game.durakMP.open({ seats: 3, stake: 20, aiDelay: 120 }));
const seen = await until(() => B.evaluate(() => window.__game.durakMP.rooms().length > 0 && window.__game.durakMP.choices()));
ok(seen && seen.some((c) => /Сесть за общий стол — ALPHA/.test(c)), 'B sees the open table in Arkasha\'s dialog (who\'s seated)', JSON.stringify(seen));
await B.evaluate(() => window.__game.durakMP.join());
const lob = await until(async () => { const [a, bb] = [await st(A), await st(B)]; return a && bb && a.seq === bb.seq && bb.seats.filter((s) => s.id).length === 2 && [a, bb]; });
ok(!!lob && lob[0].n === 3 && lob[0].seats[2].n === 'ARKASHA' && lob[1].ui?.lobby, 'B joins the lobby: 3 seats — ALPHA, BRAVO, ARKASHA (AI)', JSON.stringify(lob?.[0].seats));
await A.screenshot({ path: `${out}/durakmp-lobby.png` });
const idA = lob[0].id, idB = lob[1].id;

let divergences = 0, faceUpBad = 0, compared = 0, hh = null, hhOk = false, rejected = null, moves = 0;
const legalPick = (s, humanSeats) => {   // prefer a HUMAN→HUMAN transfer; otherwise mostly beat / play, sometimes pass
  const L = s.legal; if (!L.length) return null;
  const tx = L.filter((m) => m.kind === 'transfer' || m.kind === 'show');
  const nextSeat = (x) => { for (let k = 1; k <= s.n; k++) { const y = (x + k) % s.n; if (!JSON.parse(s.g).out.includes(y)) return y; } return x; };
  if (tx.length && humanSeats.includes(nextSeat(s.seat))) return { m: tx[0], hh: nextSeat(s.seat) };
  const beat = L.filter((m) => m.kind === 'beat'); if (beat.length) return { m: beat[Math.floor(Math.random() * beat.length)] };
  const play = L.filter((m) => m.kind === 'play'); const stop = L.find((m) => m.kind === 'bito' || m.kind === 'done' || m.kind === 'take');
  if (play.length && (!stop || Math.random() < (s.legal.some((m) => m.kind === 'take') ? 1 : 0.5))) return { m: play[Math.floor(Math.random() * play.length)] };
  return { m: stop || L[0] };
};
/** drive every seated client until the game on `host` is over */
async function playOut(clients, { stopAfter = Infinity, tryIllegal = false, checkHH = true } = {}) {
  let n = 0;
  for (let it = 0; it < 3000; it++) {
    const ss = await Promise.all(clients.map(st)); const H = ss[0]; if (!H) return 'no-table';
    if (H.over) return 'over';
    // consistency: same seq → identical JSON; and each UI shows only its own hand face up
    for (let i = 1; i < ss.length; i++) if (ss[i] && ss[i].seq === H.seq) { compared++; if (ss[i].g !== H.g) divergences++; }
    for (const s of ss) if (s?.ui && s.g && s.seat >= 0) { const G = JSON.parse(s.g); if (s.ui.faceUpTop !== 0 || s.ui.hand !== G.hands[s.seat].length || s.ui.seats !== s.n - 1) faceUpBad++; }
    if (tryIllegal && !rejected) {   // B plays out of turn / a card it doesn't hold → host says no, nothing changes
      const k = clients.indexOf(B), sb = ss[k];
      if (sb && sb.toAct !== sb.seat && sb.toAct >= 0) { const G = JSON.parse(sb.g); const notMine = G.deck[0] || G.trumpCard;
        await B.evaluate(([w, c]) => window.__game.durakMP.raw({ who: w, kind: 'play', c }), [sb.seat, notMine]);
        const nk = await until(() => B.evaluate(() => window.__game.durakMP.nack()), 4000);
        const after = await st(A); rejected = { nack: nk, handSame: JSON.stringify(JSON.parse(after.g).hands[sb.seat]) === JSON.stringify(JSON.parse(sb.g).hands[sb.seat]) || after.seq > sb.seq };
        continue; }
    }
    const k = ss.findIndex((s) => s && s.seat >= 0 && s.toAct === s.seat && s.legal.length);
    if (k < 0) { await new Promise((r) => setTimeout(r, 60)); continue; }
    const s = ss[k], humanSeats = s.seats.map((x, i) => (x.id ? i : -1)).filter((i) => i >= 0 && i !== s.seat);
    const p = legalPick(s, humanSeats); if (!p) continue;
    await clients[k].evaluate((m) => window.__game.durakMP.move(m), p.m); moves++; n++;
    const nx = await until(async () => { const v = await st(clients[k]); return v && v.seq > s.seq && v; }, 6000, 40);
    if (p.hh !== undefined && checkHH && nx && !hh) { hh = { from: s.seat, to: p.hh, kind: p.m.kind }; hhOk = nx.def === p.hh && nx.att === s.seat && nx.lt?.to === p.hh; await clients[k].screenshot({ path: `${out}/durakmp-transfer.png` }); }
    if (n >= stopAfter) return 'stopped';
  }
  return 'stuck';
}
const cash = async () => [await A.evaluate(() => window.__game.durakMP.state()?.cash ?? window.__game.hangout.state().cash), await B.evaluate(() => window.__game.hangout.state().cash)];

// ---- game 1..n: play until a human→human transfer has happened
const c0 = await cash();
await A.evaluate(() => window.__game.durakMP.deal());
let dealt = await until(async () => { const [a, bb] = [await st(A), await st(B)]; return a?.ph === 'play' && bb?.ph === 'play' && a.seq === bb.seq && [a, bb]; });
ok(!!dealt && dealt[0].n === 3 && dealt[0].seat === 0 && dealt[1].seat === 1, 'A deals: both clients in the game, seats A=0 B=1 ARKASHA=2');
await new Promise((r) => setTimeout(r, 300)); const c1 = await cash();
ok(c1[0] === c0[0] - 20 && c1[1] === c0[1] - 20, 'both humans paid the $20 stake', `${c0} → ${c1}`);
await B.screenshot({ path: `${out}/durakmp-phone.png` });
let games = 0, res;
for (;;) {
  games++; res = await playOut([A, B], { tryIllegal: games === 1 });
  const [a, bb] = [await st(A), await st(B)];
  const fin = await until(async () => { const x = await st(B); return x?.over && x; }, 5000);
  ok(res === 'over' && !!fin && fin.g === a.g && fin.seq === a.seq, `game ${games} plays to the end, both clients agree`, `${res} · durak = ${a.result === 'draw' ? 'draw' : a.seats[a.result]?.n} · seq ${a.seq}`);
  await new Promise((r) => setTimeout(r, 400)); const cc = await cash(), share = 30;
  const exp = (seat) => (a.result === 'draw' ? 20 : a.result === seat ? 0 : share);
  ok(cc[0] === c1[0] + exp(0) && cc[1] === c1[1] + exp(1), `game ${games} stakes: pot $60, durak gets nothing, winners +$30`, `before ${c1} after ${cc} (durak seat ${a.result})`);
  if (games === 1) await A.screenshot({ path: `${out}/durakmp-end.png` });
  if (hh || games >= 5) break;
  // again: same seats, stakes re-collected
  await B.evaluate(() => window.__game.durakMP.again());
  const re = await until(async () => { const [x, y] = [await st(A), await st(B)]; return x?.ph === 'play' && !x.over && y?.seq === x.seq && x; }, 8000);
  ok(!!re && re.deal === games + 1, `B asks for another deal → host re-deals (deal ${games + 1})`);
  await new Promise((r) => setTimeout(r, 300)); c1.splice(0, 2, ...(await cash()));
}
ok(!!rejected && !!rejected.nack && rejected.handSame, 'an illegal move from B is rejected by the host (nack, nothing changes)', JSON.stringify(rejected));
ok(!!hh && hhOk, 'a HUMAN→HUMAN перевод happens and the attack lands on the next seat', JSON.stringify(hh));
ok(compared > 20 && divergences === 0, 'both clients hold identical state at every common seq', `${compared} compared, ${divergences} diverged`);
ok(faceUpBad === 0, 'each client shows only its own hand face up (opponents are card backs)', `${faceUpBad} bad frames`);

// ---- again, then B walks away mid-game → AI takes the seat, A finishes; B forfeits the stake
const cb0 = await cash();
await A.evaluate(() => window.__game.durakMP.again());
await until(async () => { const [x, y] = [await st(A), await st(B)]; return x?.ph === 'play' && !x.over && y?.seq === x.seq; }, 8000);
await new Promise((r) => setTimeout(r, 300)); const cb1 = await cash();
ok(cb1[0] === cb0[0] - 20 && cb1[1] === cb0[1] - 20, '"again": stakes re-collected', `${cb0} → ${cb1}`);
await playOut([A, B], { stopAfter: 6, checkHH: false });
await B.evaluate(() => window.__game.durakMP.leave());
const took = await until(async () => { const x = await st(A); return x && !x.seats[1].id && x; }, 6000);
ok(!!took && (await st(B)) === null && !(await B.evaluate(() => !!document.querySelector('.durak'))), 'B leaves mid-game → an AI takes B\'s seat, B\'s table closes', JSON.stringify(took?.seats));
res = await playOut([A]); const aEnd = await st(A);
ok(res === 'over', 'the game finishes with the AI in B\'s seat', `durak = ${aEnd.result === 'draw' ? 'draw' : aEnd.seats[aEnd.result]?.n}`);
await new Promise((r) => setTimeout(r, 300)); const cb2 = await cash();
ok(cb2[0] === cb1[0] + (aEnd.result === 'draw' ? 20 : aEnd.result === 0 ? 0 : 30) && cb2[1] === cb1[1], 'A paid by the result, B forfeited', `${cb1} → ${cb2}`);

// ---- B comes back (spectates until the next deal), A deals, then the HOST walks away → B takes over and finishes
await B.evaluate(() => window.__game.durakMP.join());
const spec = await until(async () => { const y = await st(B); return y && y.seat < 0 && y.wait.includes(y.id) && y; }, 8000);
ok(!!spec, 'B re-joins after the game → waits / spectates for the next deal');
await A.evaluate(() => window.__game.durakMP.again());
const d3 = await until(async () => { const [x, y] = [await st(A), await st(B)]; return x?.ph === 'play' && !x.over && y?.seq === x.seq && y.seat >= 0 && [x, y]; }, 8000);
ok(!!d3, 'the next deal seats B again');
await playOut([A, B], { stopAfter: 4, checkHH: false });
await A.evaluate(() => window.__game.durakMP.leave());
const mig = await until(async () => { const y = await st(B); return y && y.host === idB && !y.seats.some((s) => s.id === idA) && y; }, 8000);
ok(!!mig, 'host leaves → B becomes host, an AI takes A\'s seat', JSON.stringify(mig?.seats));
res = await playOut([B]);
ok(res === 'over', 'B (the new host) runs the AI seats and finishes the game', res);

ok(!errs.length, 'no page errors', JSON.stringify(errs.slice(0, 3)));
console.log(`(${moves} human moves driven over ${games + 2} deals)`);
await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
