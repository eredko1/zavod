// One budget may be shared by concurrent geometry/attribute responses.
export async function readBinaryResponse(response,budget,label){
  const exceeded=requested=>Error(`${label} limit exceeded: ${requested} bytes requested or received (limit ${budget.limit}). No partial source selected.`);
  const length=response.headers.get('content-length');if(length!==null&&Number(length)>budget.limit-budget.bytes){await response.body?.cancel();throw exceeded(budget.bytes+Number(length));}
  const reader=response.body?.getReader();if(!reader)throw Error(`Missing ${label} response body.`);
  const chunks=[];let bytes=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;budget.bytes+=value.byteLength;if(budget.bytes>budget.limit)throw exceeded(budget.bytes);bytes+=value.byteLength;chunks.push(value);}}
  catch(error){try{await reader.cancel();}catch(cancelError){throw new AggregateError([error,cancelError],error.message+'; response cancellation also failed.');}throw error;}finally{reader.releaseLock();}
  const buffer=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}return buffer.buffer;
}
