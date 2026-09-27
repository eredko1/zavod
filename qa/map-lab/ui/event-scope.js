// Components release their own callbacks without removing another owner's listeners.
export function eventScope(){
  const controller=new AbortController();
  return {on(target,type,callback,options={}){target.addEventListener(type,callback,{...options,signal:controller.signal});},dispose(){controller.abort();}};
}
