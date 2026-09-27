export const SEGMENT_TOLERANCE=Object.freeze({parallel:1e-10,endpoint:1e-9});
// Split a segment at polygon boundaries; caller decides which intervals to retain.
export function segmentCuts(a,b,shapes,{parallel=SEGMENT_TOLERANCE.parallel,endpoint=SEGMENT_TOLERANCE.endpoint}={}){
  const dx=b[0]-a[0],dz=b[1]-a[1],cuts=[0,1];
  for(const shape of shapes)for(const ring of [shape.outer,...shape.holes])for(let i=0;i<ring.length;i++){
    const c=ring[i],d=ring[(i+1)%ring.length],ex=d[0]-c[0],ez=d[1]-c[1],den=dx*ez-dz*ex;if(Math.abs(den)<parallel)continue;
    const t=((c[0]-a[0])*ez-(c[1]-a[1])*ex)/den,u=((c[0]-a[0])*dz-(c[1]-a[1])*dx)/den;if(t>endpoint&&t<1-endpoint&&u>=0&&u<=1)cuts.push(t);
  }return [...new Set(cuts)].sort((a,b)=>a-b);
}
