// Broad-phase bounds only reject disjoint polygons; exact tests still keep every edge and hole.
export function pointBounds(points) {
  const box=[Infinity,Infinity,-Infinity,-Infinity];
  for(const [x,z] of points){box[0]=Math.min(box[0],x);box[1]=Math.min(box[1],z);box[2]=Math.max(box[2],x);box[3]=Math.max(box[3],z);}
  return box;
}
export function createShapeQuery(shapes) {
  const entries=shapes.map(shape=>({shape,box:pointBounds(shape.outer)}));
  return box=>entries.filter(e=>e.box[2]>=box[0]&&e.box[0]<=box[2]&&e.box[3]>=box[1]&&e.box[1]<=box[3]).map(e=>e.shape);
}
