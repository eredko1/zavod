import {pointRecordSummary} from '../data/las-point-records.js';
// The compiler consumes vector data/metadata; restoration reattaches complete point records and archives.
export function compilerInput(result){
  const {acquisitionFailures,...input}=result;
  if(input.nyc)input.nyc=input.nyc.map(({raw,...snapshot})=>snapshot.data.assets?.some(asset=>asset.decoded?.records)?{...snapshot,data:{...snapshot.data,assets:snapshot.data.assets.map(({decoded,...asset})=>decoded?{...asset,decoded:pointRecordSummary(decoded)}:asset)}}:snapshot);
  return input;
}
