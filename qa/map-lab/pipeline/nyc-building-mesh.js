import {projection} from './osm-model.js';
import {NYC_SOURCES,featureID,sourceFeatures,geoPolygons} from '../data/map-sources.js';

export const MESH_SELECTION=Object.freeze({captureYear:2014,heightAbsoluteTolerance:3,heightRelativeTolerance:.2,horizontalAngle:15,bandTolerance:.25,minBandArea:1,minSurfaceHeight:.5,maxSlopedAngle:75});
export function meshDetail(positions){
  const bands=[],horizontal=[],slopes=[];let min=Infinity,max=-Infinity;
  for(let i=1;i<positions.length;i+=3){min=Math.min(min,positions[i]);max=Math.max(max,positions[i]);}
  for(let i=0;i<positions.length;i+=9){const a=positions.slice(i,i+3),b=positions.slice(i+3,i+6),c=positions.slice(i+6,i+9),u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n),area=Math.abs(n[1])/2,y=(a[1]+b[1]+c[1])/3;
    if(!length||y<=min+MESH_SELECTION.minSurfaceHeight)continue;const angle=Math.acos(Math.min(1,Math.abs(n[1])/length))*180/Math.PI;
    if(angle<=MESH_SELECTION.horizontalAngle)horizontal.push({height:y,area});
    else if(angle<MESH_SELECTION.maxSlopedAngle)slopes.push(area);
  }
  // Canonical order keeps measured roof-detail metrics independent of face order.
  for(const surface of horizontal.sort((a,b)=>a.height-b.height||a.area-b.area)){let band=bands.at(-1);if(!band||surface.height-band.height>MESH_SELECTION.bandTolerance){band={height:surface.height,area:0};bands.push(band);}band.area+=surface.area;}
  return {min,max,span:max-min,upperBands:bands.filter(b=>b.area>=MESH_SELECTION.minBandArea),slopedArea:slopes.sort((a,b)=>a-b).reduce((a,b)=>a+b,0)};
}
export function planFromBuildingMeshes(snapshot,origin){
  const source=NYC_SOURCES.find(s=>s.id===snapshot.sourceId),project=projection(...origin),buildings=[],coverage=[],issues=[];
  for(const f of sourceFeatures(source,snapshot.data.features)){
    const id=featureID(source,f),item={id,sourceId:source.id,dataset:source.dataset,tags:f.properties,rule:'building-mesh',status:'reference',reason:'2014 mesh candidate; requires a unique compatible current footprint and explicit base rebasing.'};coverage.push(item);
    try{
      if(f.geometryError)throw Error(f.geometryError);
      const raw=f.mesh?.positions;if(!Array.isArray(raw)||!raw.length||raw.length%9||!raw.every(Number.isFinite)||f.mesh.verticalCRS!=='EGM96'||f.mesh.unit!=='metres')throw Error('Invalid building mesh or vertical reference.');
      const positions=[];for(let i=0;i<raw.length;i+=3){const [x,z]=project({lon:raw[i],lat:raw[i+1]});positions.push(x,raw[i+2],z);}
      const detail=meshDetail(positions);if(!(detail.span>0))throw Error('Building mesh has no positive vertical span.');
      for(let i=1;i<positions.length;i+=3)positions[i]-=detail.min;
      const ring=r=>r.slice(0,-1).map(([lon,lat])=>project({lon,lat})),shapes=geoPolygons(f.geometry).map(p=>({outer:ring(p[0]),holes:p.slice(1).map(ring)}));
      buildings.push({id,sourceId:source.id,dataset:source.dataset,tags:f.properties,shapes,paths:[],dimensions:{},attributes:{meshDetail:detail},estimates:[],rule:'building-mesh',mesh:{positions,detail,sourceVerticalCRS:'EGM96',sourceBase:detail.min},height:{top:detail.span,bottom:0,valid:true,estimated:false,source:'2014 mesh relative vertical span'},extrude:false,reference:true,suppressed:false,groundSurface:false,walkingSurface:false});
    }catch(e){item.status='skipped';item.reason=e.message;issues.push({id,code:'invalid-building-mesh',severity:'error',message:e.message});}
  }
  return {origin,buildings,roads:[],details:[],coverage,issues};
}
