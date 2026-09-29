// Dataset observations include provider metadata and native response channels; visibility is UI state.
export function sourceInventories(result){
  const osm={data:result.data,query:result.query,endpoint:result.endpoint,fetchedAt:result.fetchedAt,bounds:result.bounds};
  return [{sourceId:'osm-overpass',records:result.data?.elements||[],snapshot:osm},...(result.nyc||[]).map(s=>{const {visible,...snapshot}=s,records=s.data.assets&&s.data.features.length?[...s.data.features,...s.data.assets]:s.data.assets||s.data.features;return {sourceId:s.sourceId,records,snapshot};})];
}
