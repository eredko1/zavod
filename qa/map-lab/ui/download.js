import {jsonStream} from './json-stream.js';
let registration;
export async function downloadJSON(value, filename) {
  if(!/^[a-zA-Z0-9_.-]+$/.test(filename))throw Error('Invalid JSON download filename.');
  const event=stage=>globalThis.dispatchEvent(new CustomEvent('map-lab-download',{detail:{filename,stage}}));event('requested');
  registration??=navigator.serviceWorker.register(new URL('../download-worker.js',import.meta.url),{updateViaCache:'none'});
  const installed=await registration,worker=installed.active||installed.installing||installed.waiting;
  if(!worker)throw Error('JSON download worker is unavailable.');
  if(worker.state!=='activated')await new Promise((resolve,reject)=>{const changed=()=>{if(worker.state==='activated'||worker.state==='redundant'){worker.removeEventListener('statechange',changed);worker.state==='activated'?resolve():reject(Error('JSON download worker failed to activate.'));}};worker.addEventListener('statechange',changed);changed();});
  event('worker-activated');
  if(navigator.serviceWorker.controller?.scriptURL!==worker.scriptURL)await new Promise(resolve=>{const changed=()=>{if(navigator.serviceWorker.controller?.scriptURL===worker.scriptURL){navigator.serviceWorker.removeEventListener('controllerchange',changed);resolve();}};navigator.serviceWorker.addEventListener('controllerchange',changed);changed();});
  event('controller-ready');
  const token=crypto.randomUUID(),channel=new MessageChannel(),stream=jsonStream(value,error=>{event('serialization-error');globalThis.reportError(error);},{onComplete:()=>event('serialized'),onCancel:()=>event('stream-cancelled')});
  const ready=new Promise((resolve,reject)=>{channel.port1.onmessage=event=>{channel.port1.close();event.data.ready?resolve():reject(Error(event.data.error));};});
  navigator.serviceWorker.controller.postMessage({token,filename,stream},[stream,channel.port2]);
  event('stream-posted');
  await ready;
  event('ready');
  // Let the attachment response start the download; an anchor download attribute bypasses the worker.
  const a=document.createElement('a');a.href=new URL(`../__download/${token}`,import.meta.url);a.click();event('dispatched');
}
