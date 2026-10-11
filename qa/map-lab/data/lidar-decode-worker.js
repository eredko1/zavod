importScripts('../../../vendor/laz-perf/laz-perf.js');
// One source owns this worker; it decodes sequential assets and is terminated on every exit.
let ready;
self.onmessage=async({data})=>{
  try{ready??=Promise.all([createLazPerf({locateFile:name=>new URL('../../../vendor/laz-perf/'+name,self.location.href).href}),import('./las-point-records.js')]);const [decoder,{decodeLASRecords}]=await ready,result=decodeLASRecords(decoder,data.buffer,data.header,data.originCount,data.maxBytes);self.postMessage({result},[result.records]);}
  catch(error){self.postMessage({error:String(error.message||error)});}
};
