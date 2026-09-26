import { areaWKT, CONEY_BOUNDS } from './map-sources.js';
export { CONEY_BOUNDS };
export const MAX_AREA_METRES=5000;
export const SIZE_PRECISION_METRES=1e-6;
export const METRES_PER_LATITUDE_DEGREE=111132, METRES_PER_LONGITUDE_DEGREE=111320;
// Adjacent rectangle to the west; Auto Coney keeps its original extent.
export const NEIGHBOR_BOUNDS = {...CONEY_BOUNDS,west:Number((2*CONEY_BOUNDS.west-CONEY_BOUNDS.east).toFixed(6)),east:CONEY_BOUNDS.west};
export const DEFAULT_BOUNDS = CONEY_BOUNDS;
export const areaDimensions = bounds => ({height:(bounds.north-bounds.south)*METRES_PER_LATITUDE_DEGREE,width:(bounds.east-bounds.west)*METRES_PER_LONGITUDE_DEGREE*Math.cos((bounds.north+bounds.south)/2*Math.PI/180)});
export function validateArea(bounds) {
  areaWKT(bounds);
  const {height,width}=areaDimensions(bounds);
  if(height>MAX_AREA_METRES+SIZE_PRECISION_METRES||width>MAX_AREA_METRES+SIZE_PRECISION_METRES)throw Error('Choose an area no more than 5 km across each side for this local geometry lab.');
  return bounds;
}
export const inNYC = b => b.south<40.93 && b.north>40.49 && b.west<-73.68 && b.east>-74.26;
export function queryForArea(b) { validateArea(b);const box=[b.south,b.west,b.north,b.east].join(',');return `[out:json][timeout:45];\nnwr(${box});\nout geom(${box});`; }
// Custom QL is arbitrary code. Derive its area from actual geometry and never mix in form-bound NYC responses.
export function boundsFromOSM(data) {
  let south=Infinity,west=Infinity,north=-Infinity,east=-Infinity;
  const visit=e=>{if(Number.isFinite(e.lat)&&Number.isFinite(e.lon)){south=Math.min(south,e.lat);north=Math.max(north,e.lat);west=Math.min(west,e.lon);east=Math.max(east,e.lon);}for(const p of e.geometry||[])if(p)visit(p);for(const m of e.members||[])visit(m);};
  for(const e of data.elements)visit(e);if(!Number.isFinite(south))return null;
  if(south===north){south=Math.max(-90,south-.0001);north=Math.min(90,north+.0001);}if(west===east){west=Math.max(-180,west-.0001);east=Math.min(180,east+.0001);}
  return validateArea({south,west,north,east});
}
