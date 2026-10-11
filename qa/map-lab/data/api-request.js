import { checkAbort, withRequestTimeout } from './request-abort.js';
const RETRY_STATUS = new Set([429,502,503,504]), MAX_ATTEMPTS = 3, MAX_WAIT = 15000;
export const ATTEMPT_TIMEOUT = 55000;
export class TransportError extends Error {}
export class APIError extends Error {
  constructor(message, status, retryAfter = null) { super(message);this.status=status;this.retryAfter=retryAfter; }
}
function pause(ms, signal) {
  return new Promise((resolve,reject)=>{checkAbort(signal);const done=()=>{signal?.removeEventListener('abort',cancel);resolve();},timer=setTimeout(done,ms),cancel=()=>{clearTimeout(timer);try{checkAbort(signal);}catch(e){reject(e);}};signal?.addEventListener('abort',cancel,{once:true});});
}
export async function retryRequest(request, { signal, onRetry=()=>{}, wait=pause } = {}) {
  for(let attempt=1;attempt<=MAX_ATTEMPTS;attempt++){
    checkAbort(signal);
    try{return await request();}catch(e){
      checkAbort(signal);
      if(attempt===MAX_ATTEMPTS||!(e instanceof TransportError||e.name==='TimeoutError'||RETRY_STATUS.has(e.status)))throw e;
      const specified=e.retryAfter===null||e.retryAfter===undefined?null:Number.isFinite(Number(e.retryAfter))?Number(e.retryAfter)*1000:Date.parse(e.retryAfter)-Date.now();
      // Never hammer a server whose Retry-After exceeds our bounded interactive wait.
      if(specified>MAX_WAIT)throw e;
      const delay=Number.isFinite(specified)&&specified!==null?Math.max(0,specified):1000*2**(attempt-1);
      onRetry({attempt:attempt+1,maxAttempts:MAX_ATTEMPTS,delay,message:e.message});await wait(delay,signal);
    }
  }
}
export async function fetchJSON(url, init={}, onRetry) {
  return retryRequest(()=>withRequestTimeout(init.signal,ATTEMPT_TIMEOUT,async signal=>{
    let response,text;
    try{response=await fetch(url,{...init,signal,cache:'no-store'});text=await response.text();}
    catch(e){if(e instanceof TypeError)throw new TransportError(e.message,{cause:e});throw e;}
    let data;try{data=JSON.parse(text);}catch{throw new APIError(`API ${response.status}: ${text.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,350)||'Expected JSON.'}`,response.status,response.headers.get('Retry-After'));}
    if(!response.ok)throw new APIError(`API ${response.status}: ${data.remark||data.message||response.statusText}`,response.status,response.headers.get('Retry-After'));
    return data;
  }),{signal:init.signal,onRetry});
}
