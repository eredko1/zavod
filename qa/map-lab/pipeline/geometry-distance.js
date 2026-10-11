export function edgeDistance(x,z,a,b){
  const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
}
export function pathPosition(points,point){
  let station=0,best={distance:Infinity};
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(!length)continue;
    const t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dz)/(length*length))),p=[a[0]+dx*t,a[1]+dz*t],d=Math.hypot(p[0]-point[0],p[1]-point[1]);
    if(d<best.distance)best={distance:d,station:station+t*length,point:p,index:i-1,t};station+=length;
  }return best;
}
