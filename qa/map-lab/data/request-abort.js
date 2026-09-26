const cancelled = signal => signal?.reason || new DOMException('Request cancelled', 'AbortError');
export function checkAbort(signal) { if (signal?.aborted) throw cancelled(signal); }

// AbortController works in browsers that do not implement AbortSignal.any/timeout.
// Keep the timer alive through body parsing, and release listeners on every exit.
export async function withRequestTimeout(signal, timeoutMs, request) {
  checkAbort(signal);
  const controller=new AbortController();let reason;
  const abort=value=>{if(!controller.signal.aborted){reason=value;controller.abort(value);}};
  const cancel=()=>abort(cancelled(signal)),timer=setTimeout(()=>abort(new DOMException('Request timed out','TimeoutError')),timeoutMs);
  signal?.addEventListener('abort',cancel,{once:true});
  try{return await request(controller.signal);}catch(e){throw reason || e;}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
