// Discover every regression check; run one Chrome instance at a time on Xvfb.
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,delimiter} from 'node:path';
const root=fileURLToPath(new URL('../../../',import.meta.url)),directory=new URL('./',import.meta.url),modelTests=[],browserTests=[];
for(const file of (await readdir(directory)).filter(f=>f.endsWith('-test.mjs')).sort()){
  const source=await readFile(new URL(file,directory),'utf8');
  (/from ['"]playwright-core['"]/.test(source)?browserTests:modelTests).push(file.replace('-test.mjs',''));
}
const args=process.argv.slice(2),full=args.includes('--full');
if(args.some(a=>!['--scene','--browser-only','--only','--full'].includes(a)&&a.startsWith('--')))throw Error('Usage: node qa/map-lab/tests/run-tests.mjs [--scene project-file] [--only names] [--full]');
const onlyAt=args.indexOf('--only'),only=onlyAt>=0?args[onlyAt+1]?.split(','):null;
const sceneAt=args.indexOf('--scene'),scene=sceneAt>=0?args[sceneAt+1]:null,results=[];
if(Number(process.versions.node.split('.')[0])<22)throw Error('Map Lab checks require Node 22 or newer.');
if(sceneAt>=0&&(!scene||scene.startsWith('--')))throw Error('--scene requires a capture filename.');
if(onlyAt>=0&&(!only?.length||only.some(name=>![...modelTests,...browserTests].includes(name))))throw Error('--only requires known comma-separated test names.');
// npm subprocesses must use the same project Node as this runner.
process.env.PATH=dirname(process.execPath)+delimiter+process.env.PATH;
process.env.QA_QUICK=full?'0':'1';
await mkdir('.tmp/map-lab',{recursive:true});
const report=()=>({selection:only||'all discovered regression tests',benchmarkPreset:full?'full':'quick',scene,generatedAt:new Date().toISOString(),results});
const run=(command,argv)=>new Promise(resolve=>{const child=spawn(command,argv,{cwd:root,env:process.env,stdio:'inherit'});child.on('error',e=>{console.error(e.message);resolve(1);});child.on('exit',code=>resolve(code??1));});
const test=async name=>{const start=performance.now(),code=await run(process.execPath,[...(name==='benchmark-isolation'?['--experimental-vm-modules']:[]),`qa/map-lab/tests/${name}-test.mjs`,...(['infrastructure-browser','large-benchmark'].includes(name)&&scene?['--scene',scene]:[])]);results.push({name,code,durationMs:performance.now()-start});};
if(!args.includes('--browser-only')){
  for(const name of modelTests)if(!only||only.includes(name))await test(name);
  await writeFile('.tmp/map-lab/checks-model.json',JSON.stringify(report(),null,2));
  if(results.some(r=>r.code))process.exitCode=1;
  else if(browserTests.some(name=>!only||only.includes(name))){
    const argv=[fileURLToPath(import.meta.url),'--browser-only',...(full?['--full']:[]),...(scene?['--scene',scene]:[]),...(only?['--only',only.join(',')]:[])];
    process.exitCode=process.env.QA_VIRTUAL_DISPLAY==='1'?await run(process.execPath,argv):await run('xvfb-run',['-a','-s','-screen 0 1600x1200x24','env','QA_HEADED=1','QA_VIRTUAL_DISPLAY=1',process.execPath,...argv]);
  }
}else{
  for(const name of browserTests)if(!only||only.includes(name))await test(name);
  await writeFile('.tmp/map-lab/checks-browser.json',JSON.stringify(report(),null,2));console.log('Checks:',results.map(r=>`${r.name}: ${r.code?'FAIL':'PASS'}`).join(' · '));process.exitCode=results.some(r=>r.code)?1:0;
}
