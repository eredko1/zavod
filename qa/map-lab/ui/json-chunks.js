const JSON_CHUNK_CHARACTERS=65536;
// Preserve JSON semantics without constructing one string containing the whole source archive.
export function* jsonChunks(value){
  const active=new Set();
  function* string(value){yield '"';for(let i=0;i<value.length;i+=JSON_CHUNK_CHARACTERS)yield JSON.stringify(value.slice(i,i+JSON_CHUNK_CHARACTERS)).slice(1,-1);yield '"';}
  const prepare=(value,key)=>{if(value!==null&&(typeof value==='object'||typeof value==='bigint')&&typeof value.toJSON==='function')value=value.toJSON(key);if(value instanceof Number||value instanceof String||value instanceof Boolean)value=value.valueOf();return value;};
  const unsupported=value=>value===undefined||typeof value==='function'||typeof value==='symbol';
  function* encode(value){
    if(typeof value==='string'){yield* string(value);return;}
    if(value===null||typeof value!=='object'){yield JSON.stringify(value);return;}
    if(active.has(value))throw new TypeError('Cannot export circular JSON data.');active.add(value);
    if(Array.isArray(value)){
      yield '[';const length=value.length;
      for(let i=0;i<length;i++){if(i)yield ',';const item=prepare(value[i],String(i));if(unsupported(item))yield 'null';else yield* encode(item);}yield ']';
    }else{
      yield '{';let first=true;
      for(const key of Object.keys(value)){const item=prepare(value[key],key);if(unsupported(item))continue;if(!first)yield ',';first=false;yield* string(key);yield ':';yield* encode(item);}yield '}';
    }
    active.delete(value);
  }
  const prepared=prepare(value,'');if(unsupported(prepared))throw new TypeError('No JSON value to export.');yield* encode(prepared);
}
