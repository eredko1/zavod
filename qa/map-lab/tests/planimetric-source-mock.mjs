// Selected captured records; the ID inventory is constructed for this offline test.
export function planimetricTransport(fixture,{mutate=(sourceId,data)=>data}={}){
  return async(url,options={})=>{
    const u=new URL(url),params=options.body instanceof URLSearchParams?options.body:u.searchParams;let data,id;
    if(u.hostname==='data.ny.gov'){
      id='mta-entrances';const snapshot=fixture.entrances;
      data=u.pathname.includes('/api/views/')?snapshot.raw.metadata:params.get('$select')===':id'?snapshot.data.features.map(f=>({':id':f.properties[':id']})):snapshot.data.features.map(f=>f.properties);
    }else if(u.hostname==='data.cityofnewyork.us'){
      const sample=fixture.streetSamples.find(s=>s.metadataURL===url||new URL(s.queryURL).pathname===u.pathname);if(!sample)throw Error('Unrecorded pedestrian test request '+url);id=sample.sourceId;
      data=u.pathname.includes('/api/views/')?sample.metadata:{type:'FeatureCollection',features:[sample.feature]};
    }else{
      const sample=fixture.samples.find(s=>url.startsWith(s.nativeRequest.url.replace(/\/query$/,'')));if(!sample)throw Error('Unrecorded planimetric test request '+url);id=sample.sourceId;
      const idField=sample.layer.fields.find(f=>f.type==='esriFieldTypeOID').name;
      data=!u.pathname.endsWith('/query')?sample.layer:params.get('returnIdsOnly')==='true'?{objectIdFieldName:idField,objectIds:[sample.geoJSONFeature.properties[idField]]}:params.get('f')==='json'?{spatialReference:sample.nativeSpatialReference,features:[sample.nativeFeature]}:{type:'FeatureCollection',features:[sample.geoJSONFeature]};
    }
    return new Response(JSON.stringify(mutate(id,structuredClone(data),params)),{headers:{'content-type':'application/json'}});
  };
}
