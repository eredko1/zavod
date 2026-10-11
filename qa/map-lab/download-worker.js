// Development-only download transport. No source API, page or game requests are intercepted.
const UNCLAIMED_DOWNLOAD_MILLISECONDS=30000;
const downloads=new Map(),prefix=new URL('__download/',self.registration.scope).href;
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
  const {token,filename,stream}=event.data||{},port=event.ports[0];
  if(!port)return;
  if(!/^[a-f0-9-]{36}$/.test(token)||!/^[a-zA-Z0-9_.-]+$/.test(filename)||!(stream instanceof ReadableStream)||!event.source?.url?.startsWith(self.registration.scope)||downloads.has(token)){if(stream instanceof ReadableStream)stream.cancel();port.postMessage({error:'Invalid download stream request.'});port.close();return;}
  const expiry=setTimeout(()=>{downloads.delete(token);stream.cancel();},UNCLAIMED_DOWNLOAD_MILLISECONDS);
  downloads.set(token,{filename,stream,expiry});port.postMessage({ready:true});port.close();
});
self.addEventListener('fetch',event=>{
  if(!event.request.url.startsWith(prefix))return;
  if(event.request.method!=='GET'){event.respondWith(new Response('GET required.',{status:405}));return;}
  const token=event.request.url.slice(prefix.length),download=downloads.get(token);downloads.delete(token);if(download)clearTimeout(download.expiry);
  event.respondWith(download?new Response(download.stream,{headers:{'Content-Type':'application/json','Content-Disposition':`attachment; filename="${download.filename}"`,'Cache-Control':'no-store'}}):new Response('Unknown download.',{status:404}));
});
