import { validateArea, areaDimensions, MAX_AREA_METRES, SIZE_PRECISION_METRES, METRES_PER_LATITUDE_DEGREE, METRES_PER_LONGITUDE_DEGREE } from './generator-area.js';

// Web Mercator is only for the tile picker. Generated geometry keeps its local metre projection.
export const TILE_SIZE = 256, MAX_MAP_LATITUDE = 85.05112878, MIN_ZOOM = 3, MAX_ZOOM = 19;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function mapPoint({lat,lon}, zoom) {
  const size = TILE_SIZE * 2 ** zoom, phi = clamp(lat,-MAX_MAP_LATITUDE,MAX_MAP_LATITUDE) * Math.PI / 180;
  return { x:(lon+180)/360*size, y:(1-Math.asinh(Math.tan(phi))/Math.PI)/2*size };
}
export function mapCoordinate({x,y}, zoom) {
  const size=TILE_SIZE*2**zoom;
  return { lon:x/size*360-180, lat:Math.atan(Math.sinh(Math.PI*(1-2*y/size)))*180/Math.PI };
}
export const areaCenter = b => ({lat:(b.south+b.north)/2,lon:(b.west+b.east)/2});
export function centeredArea(center, dimensions) {
  const {width,height}=dimensions;
  if (![width,height].every(n=>Number.isFinite(n)&&n>0&&n<=MAX_AREA_METRES+SIZE_PRECISION_METRES) || ![center.lat,center.lon].every(Number.isFinite)) throw Error('Invalid area size or center.');
  const halfLat=height/METRES_PER_LATITUDE_DEGREE/2,lat=clamp(center.lat,-MAX_MAP_LATITUDE+halfLat,MAX_MAP_LATITUDE-halfLat);
  const halfLon=width/(METRES_PER_LONGITUDE_DEGREE*Math.cos(lat*Math.PI/180))/2,lon=clamp(center.lon,-180+halfLon,180-halfLon);
  return validateArea({south:lat-halfLat,north:lat+halfLat,west:lon-halfLon,east:lon+halfLon});
}
export function panArea(bounds, dx, dy, zoom) {
  const p=mapPoint(areaCenter(bounds),zoom);
  return centeredArea(mapCoordinate({x:p.x-dx,y:p.y-dy},zoom),areaDimensions(bounds));
}
export function fitAreaZoom(bounds, width, height) {
  const a=mapPoint({lat:bounds.north,lon:bounds.west},0),b=mapPoint({lat:bounds.south,lon:bounds.east},0);
  return clamp(Math.floor(Math.log2(Math.min(width*.65/(b.x-a.x),height*.65/(b.y-a.y)))),MIN_ZOOM,MAX_ZOOM);
}
export function tileLayout(center, zoom, width, height) {
  const p=mapPoint(center,zoom),left=p.x-width/2,top=p.y-height/2,count=2**zoom,tiles=[];
  for(let y=Math.max(0,Math.floor(top/TILE_SIZE));y<=Math.min(count-1,Math.floor((top+height-1)/TILE_SIZE));y++)
    for(let x=Math.max(0,Math.floor(left/TILE_SIZE));x<=Math.min(count-1,Math.floor((left+width-1)/TILE_SIZE));x++)tiles.push({key:`${zoom}/${x}/${y}`});
  return tiles;
}
