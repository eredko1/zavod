import {jsonChunks} from './json-chunks.js';
const STREAM_CHARACTERS=65536,WORK_MILLISECONDS=12;
export function jsonStream(value,onError=()=>{},{onComplete=()=>{},onCancel=()=>{}}={}){
  const iterator=jsonChunks(value),encoder=new TextEncoder();let lastYield=performance.now(),cancelled=false;
  return new ReadableStream({
    async pull(controller){
      try{
        if(performance.now()-lastYield>=WORK_MILLISECONDS){await new Promise(resolve=>setTimeout(resolve,0));lastYield=performance.now();}
        if(cancelled)return;
        const parts=[];let characters=0,done=false;
        while(characters<STREAM_CHARACTERS){const next=iterator.next();if(next.done){done=true;break;}parts.push(next.value);characters+=next.value.length;}
        if(characters)controller.enqueue(encoder.encode(parts.join('')));if(done){controller.close();onComplete();}
      }catch(error){controller.error(error);onError(error);}
    },
    cancel(){cancelled=true;iterator.return();onCancel();},
  });
}
