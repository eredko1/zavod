// OSM layer orders overlapping features; level identifies floors. Neither supplies metres.
const active=value=>value!==undefined&&value!=='no';
const numericLevel=value=>{const n=typeof value==='string'&&/^[+-]?\d+(\.\d+)?$/.test(value.trim())?Number(value):typeof value==='number'?value:NaN;return Number.isFinite(n)?n:null;};
export function physicalLevel(feature){
  const t=feature.tags||{},layer=t.layer===undefined?0:numericLevel(t.layer),level=t.level===undefined?0:numericLevel(t.level);
  const result=(kind,reason)=>({kind,layer,level,reason});
  if(layer===null||level===null)return result('unresolved','Unsupported layer/level value; lists, ranges and malformed values need explicit vertical resolution.');
  if(['underground','underwater'].includes(t.location))return result('subsurface',`location=${t.location} requires a measured vertical placement.`);
  if(active(t.tunnel)&&t.tunnel!=='building_passage')return result('tunnel','Tunnel geometry needs its own vertical model, independently of layer sign.');
  if(active(t.indoor)||level!==0)return result('unresolved','Indoor/floor placement needs a building-level model; level is not a metre offset.');
  if(![undefined,'surface','outdoor','bridge'].includes(t.location))return result('unresolved',`location=${t.location} has no supported ground or deck placement.`);
  if(active(t.bridge)||t.location==='bridge'){
    if(t.tunnel==='building_passage'||t.location==='surface')return result('unresolved','Bridge and passage/surface tags disagree about physical placement.');
    return result('bridge','Bridge role; layer orders crossings and does not determine deck height or underground status.');
  }
  if(layer!==0)return result('unresolved','Relative layer without a resolved physical support; neither ground elevation nor underground depth is implied.');
  return result('ground',t.tunnel==='building_passage'?'Building passage at ground level; overhead building clearance is unresolved.':'Ground placement allowed; local terrain height is still measured or estimated separately.');
}
export const isGroundLevel=f=>physicalLevel(f).kind==='ground';
export const isBridgeLevel=f=>physicalLevel(f).kind==='bridge';
