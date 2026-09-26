import { inShape } from './osm-model.js';
import { pointBounds } from './shape-query.js';

// BINs can be placeholders, reused, or shared by several buildings. Identity still needs geometry.
export function buildingBIN(f) {
  const value=String(f.tags?.[f.sourceId==='nyc-buildings'?'bin':'nycdoitt:bin']??'').trim();
  return /^[1-5]\d{6}$/.test(value)&&!/^\d0{6}$/.test(value)?value:null;
}
const bounds=shapes=>{const ps=shapes.flatMap(s=>s.outer);return ps.length?pointBounds(ps):null;};
export function buildingOverlap(a,b,grid=1) {
  return overlapWithinBounds(a,b,grid,bounds(a),bounds(b));
}
function overlapWithinBounds(a,b,grid,x,y) {
  if(!x||!y||x[2]<=y[0]||y[2]<=x[0]||x[3]<=y[1]||y[3]<=x[1])return 0;
  const box=[Math.min(x[0],y[0]),Math.min(x[1],y[1]),Math.max(x[2],y[2]),Math.max(x[3],y[3])],step=Math.max(grid,Math.max(box[2]-box[0],box[3]-box[1])/150);
  let both=0,either=0;
  for(let xx=box[0]+step/2;xx<box[2];xx+=step)for(let zz=box[1]+step/2;zz<box[3];zz+=step){const i=a.some(s=>inShape(xx,zz,s)),j=b.some(s=>inShape(xx,zz,s));if(i||j)either++;if(i&&j)both++;}
  return either?both/either:0;
}
export function createBuildingMatcher(left,right,parameters) {
  // A matcher owns one immutable normalization result; reuse geometry bounds and parsed identities per feature.
  const records=new Map([...left,...right].map(f=>[f,{bin:buildingBIN(f),bounds:bounds(f.shapes)}]));
  const counts=features=>{const map=new Map();for(const f of features){const {bin}=records.get(f);if(bin)map.set(bin,(map.get(bin)||0)+1);}return map;};
  const leftCounts=counts(left),rightCounts=counts(right);
  return (a,b)=>{
    const aa=records.get(a),bb=records.get(b),score=overlapWithinBounds(a.shapes,b.shapes,parameters.buildingGrid,aa.bounds,bb.bounds),aBIN=aa.bin,bBIN=bb.bin,sameBIN=aBIN&&aBIN===bBIN;
    const overlap=`Footprint overlap ${Math.round(score*100)}%`;
    if(sameBIN){
      if(leftCounts.get(aBIN)!==1||rightCounts.get(bBIN)!==1)return {reason:`Shared BIN ${aBIN} is not unique within the source buildings; ${overlap.toLowerCase()}. Retained for review.`};
      if(score<parameters.buildingIdentityOverlap)return {reason:`Shared BIN ${aBIN}, but ${overlap.toLowerCase()} is below the ${parameters.buildingIdentityOverlap*100}% identity geometry check; possible changed/split footprint. Retained for review.`};
      return {evidence:`Shared NYC BIN ${aBIN}; unique in each source; ${overlap.toLowerCase()}.`};
    }
    if(score<parameters.buildingReviewOverlap)return {};
    if(aBIN&&bBIN)return {reason:`Conflicting NYC BINs ${aBIN} and ${bBIN}; ${overlap.toLowerCase()}. Retained for review.`};
    if(score>=parameters.buildingOverlap)return {evidence:`${overlap}; mutually unique whole-building match.`};
    return {reason:`${overlap} is below the ${parameters.buildingOverlap*100}% geometry threshold, with no shared valid BIN. Retained for review.`};
  };
}
