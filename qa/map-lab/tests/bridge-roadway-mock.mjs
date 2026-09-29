export async function mockEmptyBridgeRoadwayTable(page,source){
  const fields=[{name:source.idField,type:'esriFieldTypeOID'},...source.requiredFields.filter(name=>name!==source.idField).map(name=>({name,type:['Lat','Long'].includes(name)?'esriFieldTypeDouble':'esriFieldTypeString'}))];
  await page.route(source.layer+'**',route=>{
    const request=route.request(),params=request.postData()?new URLSearchParams(request.postData()):new URL(request.url()).searchParams;
    const data=!new URL(request.url()).pathname.endsWith('/query')?{name:'Bridge_With_Roadway_Inventory',type:'Table',objectIdField:source.idField,fields}:params.get('returnIdsOnly')==='true'?{objectIdFieldName:source.idField,objectIds:null}:{count:0};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
}
