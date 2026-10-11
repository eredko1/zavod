import {NYC_LIDAR_EPT} from '../data/lidar-ept.js';

// Only the hierarchy is constructed; both point binaries, schema and origin inventory are captured samples.
export function nativeLayerTransport(samples,{mutateJSON=(suffix,data)=>data,mutateBinary=(id,bytes)=>bytes,emptyStations=false}={}){
  return async(url)=>{
    const u=new URL(url),suffix=u.href.startsWith(NYC_LIDAR_EPT)?u.pathname.slice(new URL(NYC_LIDAR_EPT).pathname.length):u.pathname;
    let data;
    if(u.hostname==='data.ny.gov'){
      data=u.pathname.includes('/api/views/')?samples.mta.raw.metadata:u.searchParams.get('$select')==='station_id'?(emptyStations?[]:samples.mta.data.features.map(f=>({station_id:f.properties.station_id}))):samples.mta.data.features.map(f=>f.properties);
    }else if(suffix==='/ept.json')data=samples.lidar.metadata;
    else if(suffix==='/ept-sources/list.json')data=samples.lidar.origins;
    else if(suffix.startsWith('/ept-sources/')){data=samples.lidar.sourceMetadata.find(r=>r.url.endsWith(suffix))?.data;if(!data)throw Error('Unrecorded LiDAR source metadata '+suffix);}
    else if(suffix==='/ept-hierarchy/0-0-0-0.json')data=Object.fromEntries(samples.lidar.assets.map((a,i)=>[a.id,i?-1:a.pointCount]));
    else if(suffix===`/ept-hierarchy/${samples.lidar.assets[1].id}.json`)data={[samples.lidar.assets[1].id]:samples.lidar.assets[1].pointCount};
    else if(suffix.startsWith('/ept-data/')){
      const id=suffix.split('/').at(-1).replace('.laz',''),raw=samples.lidar.payloads.find(p=>p.id===id);if(!raw)throw Error('Unrecorded LiDAR test payload '+id);
      return new Response(mutateBinary(id,Buffer.from(raw.binary,'base64')),{headers:{'content-type':'application/octet-stream'}});
    }else throw Error('Unrecorded native source test request '+url);
    return new Response(JSON.stringify(mutateJSON(suffix,structuredClone(data))),{headers:{'content-type':'application/json'}});
  };
}
