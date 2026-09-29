// Regenerate src/world/coney/tavern-layout.js from tavern-layout.json (the source of truth, feet, owner's spec):
//   node qa/tools/tavern-layout-js.mjs
// The game loads the .js copy (a plain module): JSON module imports need newer browsers than the game supports.
import { readFileSync, writeFileSync } from 'node:fs';
const src = new URL('../../src/world/coney/tavern-layout.json', import.meta.url), out = new URL('../../src/world/coney/tavern-layout.js', import.meta.url);
const data = JSON.parse(readFileSync(src, 'utf8'));
writeFileSync(out, `// GENERATED from tavern-layout.json by qa/tools/tavern-layout-js.mjs. Edit the JSON, then rerun the tool.\nexport const LAYOUT = ${JSON.stringify(data)};\n`);
console.log('wrote', out.pathname);
