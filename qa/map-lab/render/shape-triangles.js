import {ShapeUtils,Vector2} from '../../../vendor/three/build/three.module.js';

// ShapeUtils removes closing duplicates in place; flatten the same cloned rings after triangulation.
export function shapeTriangles(shape){
  const outer=shape.outer.map(p=>new Vector2(...p)),holes=shape.holes.map(r=>r.map(p=>new Vector2(...p))),indices=ShapeUtils.triangulateShape(outer,holes),points=[outer,...holes].flat().map(p=>[p.x,p.y]);
  return indices.map(t=>t.map(i=>points[i]));
}
