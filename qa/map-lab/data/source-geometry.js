import {sourceCoordinate} from './source-coordinate.js';

// One validation boundary for normalization, preview and terrain sampling.
export function sourceGeometryError(geometry){
  try{
    const array=(value,min,label)=>{if(!Array.isArray(value)||value.length<min)throw Error(`Invalid ${label}`);return value;};
    const line=points=>array(points,2,'line coordinates').forEach(sourceCoordinate);
    const ring=points=>{array(points,4,'polygon ring').forEach(sourceCoordinate);if(points[0][0]!==points.at(-1)[0]||points[0][1]!==points.at(-1)[1])throw Error('Incomplete polygon ring.');};
    const polygon=rings=>array(rings,1,'polygon coordinates').forEach(ring);
    const coordinates=geometry?.coordinates;
    switch(geometry?.type){
      case 'Point':sourceCoordinate(coordinates);break;
      case 'MultiPoint':array(coordinates,1,'MultiPoint coordinates').forEach(sourceCoordinate);break;
      case 'LineString':line(coordinates);break;
      case 'MultiLineString':array(coordinates,1,'MultiLineString coordinates').forEach(line);break;
      case 'Polygon':polygon(coordinates);break;
      case 'MultiPolygon':array(coordinates,1,'MultiPolygon coordinates').forEach(polygon);break;
      default:throw Error('Unsupported geometry type');
    }
    return null;
  }catch(error){return error.message;}
}
