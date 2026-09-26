import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {chromeOptions,verifyHardwareGpu} from '../../browser-launch.mjs';
for(const [renderer,compositing] of [['ANGLE SwiftShader','enabled'],['ANGLE Intel','disabled_software']]){
  let detached=false;
  const browser={newBrowserCDPSession:async()=>({send:async()=>({gpu:{auxAttributes:{glRenderer:renderer},featureStatus:{webgl:'enabled',gpu_compositing:compositing}}}),detach:async()=>{detached=true;}})};
  await assert.rejects(verifyHardwareGpu(browser),/Hardware GPU/);assert.ok(detached);
}
const options=chromeOptions({args:['--no-sandbox','--disable-dev-shm-usage']});
assert.equal(options.headless,false);assert.ok(options.args.includes('--ozone-platform=x11'));assert.equal(options.env.WAYLAND_DISPLAY,undefined);
const browser=await chromium.launch(options);
try{
  const page=await browser.newPage();await page.goto('about:blank');
  const cdp=await browser.newBrowserCDPSession(),processes=await cdp.send('SystemInfo.getProcessInfo'),pid=processes.processInfo.find(p=>p.type==='browser').id;
  const command=(await readFile(`/proc/${pid}/cmdline`,'utf8')).split('\0');assert.ok(command.includes('--ozone-platform=x11'));
  assert.ok(command.includes('--use-angle=vulkan'));
  const graphics=await verifyHardwareGpu(browser);console.log('PASS Chrome forced to X11 on verified Xvfb',options.env.DISPLAY);console.log('GPU:',graphics.renderer);
  const webgl=await page.evaluate(async()=>{
    const gl=document.createElement('canvas').getContext('webgl2');if(!gl)throw Error('WebGL2 unavailable');
    const debug=gl.getExtension('WEBGL_debug_renderer_info'),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if(!debug||!timer)throw Error('WebGL renderer information or GPU timers unavailable');
    const renderer=gl.getParameter(debug.UNMASKED_RENDERER_WEBGL),q=gl.createQuery();
    gl.beginQuery(timer.TIME_ELAPSED_EXT,q);gl.clear(gl.COLOR_BUFFER_BIT);gl.endQuery(timer.TIME_ELAPSED_EXT);gl.flush();
    const deadline=performance.now()+3000;
    while(!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
    const available=gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE),disjoint=gl.getParameter(timer.GPU_DISJOINT_EXT),ns=available?gl.getQueryParameter(q,gl.QUERY_RESULT):null;
    gl.deleteQuery(q);return {renderer,available,disjoint,ns};
  });
  assert.doesNotMatch(webgl.renderer,/swiftshader|llvmpipe|software|lavapipe/i);assert.equal(webgl.available,true);assert.equal(webgl.disjoint,false);assert.ok(Number.isFinite(webgl.ns)&&webgl.ns>=0);
  console.log('PASS actual WebGL context and asynchronous GPU timer',webgl);
  assert.throws(()=>chromeOptions({env:{QA_VIRTUAL_DISPLAY:'0',QA_VISIBLE:'0'}}),/Visible Chrome/);
  assert.throws(()=>chromeOptions({env:{QA_VIRTUAL_DISPLAY:'1',DISPLAY:':98765'}}),/Cannot verify/);
}finally{await browser.close();}
