import {openSync,writeSync,fsyncSync,closeSync} from 'node:fs';
// Exclusive append journal; every checkpoint is written before the caller advances.
export function openDiagnosticFile(path){
  const fd=openSync(path,'wx');
  return {append(kind,detail={}){const bytes=Buffer.from(JSON.stringify({at:new Date().toISOString(),kind,detail})+'\n');let offset=0;while(offset<bytes.length)offset+=writeSync(fd,bytes,offset,bytes.length-offset);},sync(){fsyncSync(fd);},close(){fsyncSync(fd);closeSync(fd);}};
}
