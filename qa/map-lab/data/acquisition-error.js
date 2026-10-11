// Rejected observations are evidence, never a complete source snapshot.
export class AcquisitionError extends Error{
  constructor(cause,acquisition){super(String(cause?.message??cause),{cause});if(cause?.name)this.name=cause.name;this.acquisition=acquisition;}
}
export function acquisitionError(cause,source,bounds,evidence,signal){
  return new AcquisitionError(cause,{sourceId:source.id,dataset:source.dataset,...(bounds?{bounds:{...bounds}}:{}),status:signal?.aborted?'cancelled':'rejected',message:String(cause?.message??cause),fetchedAt:new Date().toISOString(),...evidence});
}
