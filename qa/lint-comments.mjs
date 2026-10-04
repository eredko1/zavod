// node qa/lint-comments.mjs [files…] — flags code swallowed by a line comment: `foo(); // why  bar = 1;` (bar never runs). This repo
// writes dense one-line code with trailing `// why` notes, and appending a statement after one has shipped real bugs. Heuristic: after
// a `//` outside strings, something shaped like a statement: `a.b = …;` or `f(…);`. Default: src/vr/*.js.
import { readFileSync, readdirSync } from 'node:fs';
const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(new URL('../src/vr/', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => `src/vr/${f}`);
const CODE_AFTER = /(^|[\s;{])[A-Za-z_$][\w$]*(\.[\w$]+)*(\[[^\]]*\])?\s*[-+*|&]?=(?![=>])\s*[^;]*;|[\w$\]]\([^()]*\);/;
let bad = 0;
for (const f of files) readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
  let q = null, c = -1;
  for (let k = 0; k < line.length; k++) { const ch = line[k]; if (q) { if (ch === '\\') k++; else if (ch === q) q = null; continue; } if (ch === "'" || ch === '"' || ch === '`') q = ch; else if (ch === '/' && line[k + 1] === '/' && line[k - 1] !== ':' && line[k - 1] !== '\\') { c = k; break; } }
  if (c >= 0 && CODE_AFTER.test(line.slice(c))) { bad++; console.log(`${f}:${i + 1}: code after a // comment: ${line.slice(c, c + 140)}`); }
});
console.log(bad ? `${bad} FOUND` : 'OK'); process.exit(bad ? 1 : 0);
