import {inShape} from './osm-model.js';
import {edgeDistance} from './geometry-distance.js';
import {isGroundLevel,isBridgeLevel} from './physical-level.js';

// NYC spots describe visible road/sidewalk surfaces, not necessarily bare earth.
export const GROUND_LEVEL_RULES=Object.freeze({centerlineDistance:3,separation:.25});
export function resolveGroundLevels(plan){
  const decks=plan.details.filter(f=>f.sourceId==='nyc-transport'&&['road-bridge','overpass'].includes(f.infrastructure));
  const roads=plan.roads.filter(f=>!f.path&&(isGroundLevel(f)||isBridgeLevel(f))).map(f=>({f,paths:f.sourcePaths||f.paths}));
  const decisions=[];
  for(const sample of plan.details.filter(f=>f.sourceId==='nyc-elevation'&&String(f.tags.sub_code)==='300000'&&Number.isFinite(f.elevation))){
    const structures=decks.filter(f=>f.shapes.some(s=>inShape(...sample.point,s)));if(structures.length!==1)continue;
    let bridge=null,ground=null;
    for(const {f,paths}of roads){let distance=Infinity;for(const path of paths)for(let i=1;i<path.length;i++)distance=Math.min(distance,edgeDistance(...sample.point,path[i-1],path[i]));
      if(isBridgeLevel(f)){if(!bridge||distance<bridge.distance)bridge={id:f.id,distance};}else if(!ground||distance<ground.distance)ground={id:f.id,distance};
    }
    if(!bridge||bridge.distance>GROUND_LEVEL_RULES.centerlineDistance||ground&&ground.distance<=bridge.distance+GROUND_LEVEL_RULES.separation)continue;
    const decision={id:sample.id,status:'elevated-road',estimated:true,structure:structures[0].id,bridge,ground,rule:GROUND_LEVEL_RULES};decisions.push(decision);
    sample.merge.attributes.groundEligibility=decision;
    plan.issues.push({id:sample.id,code:'spot-level-association',severity:'info',message:`Spot retained but excluded from bare-ground interpolation: within ${bridge.distance.toFixed(2)} m of elevated ${bridge.id} inside ${structures[0].id}; nearest ground road ${ground?.distance.toFixed(2)??'unavailable'} m. Inferred surface role, not a changed observation or a deck-height measurement.`});
  }
  plan.groundSampleDecisions=decisions;
}
