// GRS80 UTM zone 18N projection for acquisition envelopes, not model coordinates or datum alignment.
const ELLIPSOID_RADIUS=6378137,INVERSE_FLATTENING=298.257222101,UTM_SCALE=.9996,CENTRAL_MERIDIAN=-75,FALSE_EASTING=500000;
export const LIDAR_QUERY_PADDING_METRES=20;
export function utm18N(lon,lat){
  const rad=Math.PI/180,p=lat*rad,l=(lon-CENTRAL_MERIDIAN)*rad,f=1/INVERSE_FLATTENING,e=f*(2-f),ep=e/(1-e),s=Math.sin(p),c=Math.cos(p),t=Math.tan(p)**2,n=ELLIPSOID_RADIUS/Math.sqrt(1-e*s*s),a=c*l,h=ep*c*c;
  const m=ELLIPSOID_RADIUS*((1-e/4-3*e**2/64-5*e**3/256)*p-(3*e/8+3*e**2/32+45*e**3/1024)*Math.sin(2*p)+(15*e**2/256+45*e**3/1024)*Math.sin(4*p)-35*e**3/3072*Math.sin(6*p));
  return [FALSE_EASTING+UTM_SCALE*n*(a+(1-t+h)*a**3/6+(5-18*t+t*t+72*h-58*ep)*a**5/120),UTM_SCALE*(m+n*Math.tan(p)*(a*a/2+(5-t+9*h+4*h*h)*a**4/24+(61-58*t+t*t+600*h-330*ep)*a**6/720))];
}
export function lidarEnvelope(bounds){
  if(bounds.west< -75||bounds.east> -72||bounds.south<40||bounds.north>42)throw Error('LiDAR acquisition projection is restricted to the NYC region.');
  const points=[bounds.west,(bounds.west+bounds.east)/2,bounds.east].flatMap(lon=>[bounds.south,(bounds.south+bounds.north)/2,bounds.north].map(lat=>utm18N(lon,lat))),p=LIDAR_QUERY_PADDING_METRES;
  // Account for the unaligned WGS84/NAD83 frames when selecting tiles; never shift original point coordinates.
  return [Math.min(...points.map(q=>q[0]))-p,Math.min(...points.map(q=>q[1]))-p,Math.max(...points.map(q=>q[0]))+p,Math.max(...points.map(q=>q[1]))+p];
}
