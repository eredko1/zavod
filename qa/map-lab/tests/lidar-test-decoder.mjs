import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {decodeLASRecords} from '../data/las-point-records.js';
// Exercise the identical vendored worker binary in Node without adding a second runtime bundle.
export async function testLiDARDecoder(){
  const context=vm.createContext({self:{location:{href:'http://localhost/laz-perf.js'}},importScripts(){throw Error('Unexpected decoder script import in Node QA.');},console,WebAssembly,setTimeout,clearTimeout,performance,TextDecoder});
  vm.runInContext(await readFile(new URL('../../../vendor/laz-perf/laz-perf.js',import.meta.url),'utf8'),context);
  const decoder=await context.createLazPerf({wasmBinary:await readFile(new URL('../../../vendor/laz-perf/laz-perf.wasm',import.meta.url))});
  return {decode:(buffer,header,originCount,maxBytes)=>decodeLASRecords(decoder,buffer,header,originCount,maxBytes),dispose(){}};
}
