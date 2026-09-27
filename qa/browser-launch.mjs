import {readFileSync} from 'node:fs';
import {basename} from 'node:path';

const VULKAN_ARGS=['--use-angle=vulkan','--enable-features=Vulkan','--disable-vulkan-surface','--enable-gpu'];
export const displayBackend=()=>process.env.QA_VIRTUAL_DISPLAY==='1'?'verified-xvfb-x11-vulkan':'approved-desktop';

// Xvfb sets DISPLAY but leaves Wayland reachable. Pin Chrome's backend and verify its server.
export function chromeOptions(options={}) {
  const env={...process.env,...options.env},virtual=env.QA_VIRTUAL_DISPLAY==='1',headless=options.headless??false;
  const args=[...(options.args||[])];
  if(virtual){
    const display=/^:(\d+)(?:\.\d+)?$/.exec(env.DISPLAY||'');
    if(!display)throw Error('Virtual-display tests require a local Xvfb DISPLAY. Run with xvfb-run.');
    let server;
    try{const pid=readFileSync(`/tmp/.X${display[1]}-lock`,'utf8').trim();server=readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0')[0];}catch{throw Error('Cannot verify Xvfb server for DISPLAY; refusing a desktop browser launch.');}
    if(basename(server)!=='Xvfb')throw Error('DISPLAY is not backed by Xvfb; refusing a desktop browser launch.');
    if(args.some(a=>/^--(ozone-platform|display|use-angle|use-gl|enable-features|disable-features|disable-vulkan|disable-gpu|enable-gpu)/.test(a)))throw Error('Virtual-display backend is owned by the shared test launcher.');
    // ANGLE renders on the GPU; Vulkan's offscreen surface path avoids Xvfb's software GL.
    delete env.WAYLAND_DISPLAY;env.XDG_SESSION_TYPE='x11';args.push('--ozone-platform=x11',...VULKAN_ARGS);
  }else if(!headless&&env.QA_VISIBLE!=='1')throw Error('Use xvfb-run with QA_VIRTUAL_DISPLAY=1. Visible Chrome requires explicit approval and QA_VISIBLE=1.');
  return {...(options.executablePath?{}:{channel:'chrome'}),...options,headless:virtual?false:headless,args,env};
}

// Performance runs must fail explicitly if Chrome falls back to software rendering.
export async function verifyHardwareGpu(browser){
  const session=await browser.newBrowserCDPSession();
  try{
    const {gpu}=await session.send('SystemInfo.getInfo'),renderer=gpu.auxAttributes?.glRenderer,features=gpu.featureStatus;
    if(!renderer||/swiftshader|llvmpipe|softpipe|software|lavapipe/i.test(renderer)||features?.webgl!=='enabled'||features?.gpu_compositing!=='enabled')throw Error('Hardware GPU rendering/compositing unavailable: '+JSON.stringify({renderer,features}));
    return {renderer,features,devices:gpu.devices};
  }finally{await session.detach();}
}
