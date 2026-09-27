// Clip presentation, not source records. Merge masks remain nested inside this area clip.
export function clipPreviewArea(svg, bounds, project) {
  svg.querySelector('[data-area-defs]')?.remove();
  svg.querySelector('[data-area-boundary]')?.remove();
  const groups=svg.querySelectorAll('[data-layer],[data-nyc-source]');
  for(const g of groups)g.removeAttribute('clip-path');
  if(!bounds)return null;
  const ns=svg.namespaceURI,defs=document.createElementNS(ns,'defs'),clip=document.createElementNS(ns,'clipPath'),polygon=document.createElementNS(ns,'polygon');
  const corners=[[bounds.west,bounds.south],[bounds.east,bounds.south],[bounds.east,bounds.north],[bounds.west,bounds.north]].map(([lon,lat])=>project({lon,lat}));
  const id=`${svg.id}-fetch-area`;defs.dataset.areaDefs='';clip.id=id;clip.setAttribute('clipPathUnits','userSpaceOnUse');polygon.setAttribute('points',corners.map(p=>p.join(',')).join(' '));clip.append(polygon);defs.append(clip);svg.prepend(defs);
  for(const g of groups)g.setAttribute('clip-path',`url(#${id})`);
  const boundary=polygon.cloneNode();boundary.dataset.areaBoundary='';boundary.setAttribute('fill','none');boundary.setAttribute('stroke','#708793');boundary.setAttribute('stroke-width','1');boundary.setAttribute('stroke-dasharray','4 4');boundary.setAttribute('vector-effect','non-scaling-stroke');boundary.setAttribute('pointer-events','none');svg.append(boundary);
  return {x0:Math.min(...corners.map(p=>p[0])),x1:Math.max(...corners.map(p=>p[0])),z0:Math.min(...corners.map(p=>p[1])),z1:Math.max(...corners.map(p=>p[1]))};
}
