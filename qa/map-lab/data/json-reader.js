import {checkAbort} from './request-abort.js';
const WORK_MILLISECONDS=12;
// Parse one complete JSON value without allocating an archive-sized string. Individual fields remain intact.
function reader(){
  const frames=[];let root,complete=false,mode='idle',parts=[],escaped=false,position=0;
  const fail=()=>{throw new SyntaxError('Invalid or incomplete JSON at character '+position);};
  const frame=()=>frames.at(-1),canValue=()=>frames.length?['value','value-or-end'].includes(frame().state):!complete;
  const canKey=()=>frame()?.type==='object'&&['key','key-or-end'].includes(frame().state);
  const accept=value=>{
    const parent=frame();if(!parent){if(complete)fail();root=value;complete=true;return;}
    if(!canValue())fail();
    if(parent.type==='array')parent.value.push(value);
    else Object.defineProperty(parent.value,parent.key,{value,writable:true,enumerable:true,configurable:true});
    parent.state='comma-or-end';
  };
  const token=()=>{
    const raw=parts.join('');parts=[];let value;try{value=JSON.parse(raw);}catch{fail();}
    if(mode==='string'&&canKey()){frame().key=value;frame().state='colon';}else accept(value);
    mode='idle';
  };
  const delimiter=code=>code===32||code===9||code===10||code===13||code===44||code===58||code===123||code===125||code===91||code===93;
  return {
    write(text){
      let segment=0;
      for(let i=0;i<text.length;i++,position++){
        const code=text.charCodeAt(i);
        if(mode==='string'){
          if(escaped)escaped=false;
          else if(code===92)escaped=true;
          else if(code===34){parts.push(text.slice(segment,i+1));token();}
          continue;
        }
        if(mode==='token'){
          if(!delimiter(code))continue;
          parts.push(text.slice(segment,i));token();
        }
        if(code===32||code===9||code===10||code===13)continue;
        if(code===34){if(!canValue()&&!canKey())fail();mode='string';segment=i;escaped=false;continue;}
        if(code===45||(code>=48&&code<=57)||code===116||code===102||code===110){if(!canValue())fail();mode='token';segment=i;continue;}
        const parent=frame();
        if(code===123||code===91){if(!canValue())fail();frames.push(code===123?{type:'object',value:{},state:'key-or-end'}:{type:'array',value:[],state:'value-or-end'});}
        else if(code===125||code===93){
          if(!parent||parent.type!==(code===125?'object':'array')||!['key-or-end','value-or-end','comma-or-end'].includes(parent.state))fail();
          frames.pop();accept(parent.value);
        }else if(code===58){if(parent?.state!=='colon')fail();parent.state='value';}
        else if(code===44){if(parent?.state!=='comma-or-end')fail();parent.state=parent.type==='object'?'key':'value';}
        else fail();
      }
      if(mode!=='idle')parts.push(text.slice(segment));
    },
    finish(){if(mode==='token')token();if(mode!=='idle'||frames.length||!complete)fail();return root;},
  };
}
export async function parseJSONStream(chunks,{signal}={}){
  const parser=reader(),decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});let lastYield=performance.now();checkAbort(signal);
  for await(const chunk of chunks){
    checkAbort(signal);if(!(chunk instanceof Uint8Array))throw TypeError('JSON stream requires UTF-8 byte chunks.');
    parser.write(decoder.decode(chunk,{stream:true}));
    if(performance.now()-lastYield>=WORK_MILLISECONDS){await new Promise(resolve=>setTimeout(resolve,0));lastYield=performance.now();}
  }
  checkAbort(signal);parser.write(decoder.decode());return parser.finish();
}
