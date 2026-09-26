export const sourceVisible=(feature,snapshots)=>!feature.sourceId||feature.sourceId==='osm-overpass'||snapshots.find(s=>s.sourceId===feature.sourceId)?.visible!==false;

// Instances are batched by source; parent visibility also covers building outlines.
export function setFeatureVisibility(group,visible){
  group.traverse(object=>{const feature=object.userData.building||object.userData.feature||object.userData.features?.[0];if(feature)object.visible=visible(feature);});
}
