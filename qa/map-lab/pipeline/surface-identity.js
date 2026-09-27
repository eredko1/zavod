export const SURFACE_IDENTITY_PRECISION=1e-6;
// Ignore ring start, winding and polygon order; retain every hole and exact local outline.
const ringKey=ring=>{
  const points=ring.map(p=>p.map(v=>Math.round(v/SURFACE_IDENTITY_PRECISION)).join(','));
  const order=p=>{let at=0;for(let i=1;i<p.length;i++)if(p[i]<p[at])at=i;return [...p.slice(at),...p.slice(0,at)].join(';');};
  return [order(points),order([...points].reverse())].sort()[0];
};
export const surfaceIdentity=shapes=>shapes.map(s=>`${ringKey(s.outer)}|${s.holes.map(ringKey).sort().join('|')}`).sort().join('/');
