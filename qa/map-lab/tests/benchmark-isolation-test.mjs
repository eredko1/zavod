// No bundler: audit runtime imports and npm's actual release file manifest.
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { resolve,dirname,relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { SourceTextModule } from 'node:vm';
const root=process.cwd(),visited=new Set(),forbidden=/(?:^|\/)(?:benchmark|echarts)(?:\/|$)|frame-profiler|__generator/;
const aliases={'three':resolve('vendor/three/build/three.module.js'),'three/addons/':resolve('vendor/three/examples/jsm')+'/','three-mesh-bvh':resolve('vendor/three-mesh-bvh/src/index.js')};
async function visit(file){
  if(visited.has(file))return;visited.add(file);const source=await readFile(file,'utf8');
  assert.doesNotMatch(source,forbidden,`Benchmark dependency in ${relative(root,file)}`);
  const imports=[...new SourceTextModule(source).dependencySpecifiers,...[...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g)].map(m=>m[1])];
  for(const spec of imports){
    let target;if(spec.startsWith('.'))target=resolve(dirname(file),spec);else if(aliases[spec])target=aliases[spec];else{const prefix=Object.keys(aliases).find(k=>k.endsWith('/')&&spec.startsWith(k));if(prefix)target=aliases[prefix]+spec.slice(prefix.length);}
    assert.ok(target,`Unresolved import ${spec} in ${file}`);await visit(target);
  }
}
await visit(resolve('src/main.js'));await visit(resolve('qa/map-lab/render/map-world.js'));
// Game boot also chooses module paths dynamically; audit every game source file.
for(const file of await readdir('src',{recursive:true}))if(file.endsWith('.js'))await visit(resolve('src',file));
const [release]=JSON.parse(execFileSync('npm',['pack','--dry-run','--json','--ignore-scripts','--cache',resolve('.tmp/npm-release-audit')],{encoding:'utf8',maxBuffer:20*1024*1024}));
const files=release.files.map(f=>f.path);for(const file of files)assert.doesNotMatch(file,/^(qa\/|\.tmp\/|vendor\/(?:echarts|laz-perf)\/)|benchmark|frame-profiler/);
for(const required of ['index.html','src/main.js','vendor/three/build/three.module.js'])assert.ok(files.includes(required),`Missing release file ${required}`);
console.log(`PASS ${visited.size} runtime modules exclude benchmark imports; ${files.length} release files exclude QA, benchmark and chart code`);
