#!/usr/bin/env node
// Builds blind A/B composites: each pair = one of OUR shots vs one CoD REF, randomly left/right.
// Usage: node qa/blind.mjs <round> <ours.png,...>   → qa/blind/r<round>/pair-NN.png + key.json (do NOT show key to the critic)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';
const round = process.argv[2]; const ours = process.argv[3].split(',');
const refDir = 'qa/refs'; const refs = fs.readdirSync(refDir).filter(f => /\.(jpg|png)$/i.test(f)).map(f => path.join(refDir, f));
const outDir = `qa/blind/r${round}`; fs.mkdirSync(outDir, { recursive: true });
let seed = 12345 + +round * 7919; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const key = [];
ours.forEach((o, i) => {
  const r = refs[Math.floor(rnd() * refs.length)];
  const left = rnd() < 0.5 ? 'ours' : 'ref';
  const a = left === 'ours' ? o : r, b = left === 'ours' ? r : o;
  const name = `pair-${String(i + 1).padStart(2, '0')}.png`;
  const url = `http://localhost:8790/qa/compare.html?imgs=${encodeURIComponent('/' + a)},${encodeURIComponent('/' + b)}&labels=A,B&cols=2&w=1920&h=560`;
  execFileSync('node', ['qa/shot.mjs', url, path.join(outDir, name), '--wait', 'window.__done===true', '--settle', '300', '--w', '1920', '--h', '560'], { stdio: 'ignore' });
  key.push({ pair: name, A: left === 'ours' ? 'OURS ' + o : 'REF ' + r, B: left === 'ours' ? 'REF ' + r : 'OURS ' + o });
});
fs.writeFileSync(path.join(outDir, 'key.json'), JSON.stringify(key, null, 2));
console.log(`wrote ${key.length} pairs to ${outDir} (key in key.json)`);
