// Static, world-space surface triangles. Visual geometry and walking share the same faces and holes.
export function objectVisible(object) { for (let o = object; o; o = o.parent) if (!o.visible) return false; return true; }
export function surfaceIndex(meshes, fallback, cell = 10) {
  const cells = new Map(); let triangles = 0;
  for (const mesh of meshes) {
    const p = mesh.geometry.attributes.position, index = mesh.geometry.index, count = index?.count ?? p.count, matrix = mesh.matrixWorld.elements;
    const point = n => { const x = p.getX(n), y = p.getY(n), z = p.getZ(n); return [matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12], matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13], matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14]]; };
    for (let i = 0; i < count; i += 3) {
      const [a,b,c] = [0,1,2].map(j => point(index ? index.getX(i+j) : i+j)), bx = b[0]-a[0], bz = b[2]-a[2], cx = c[0]-a[0], cz = c[2]-a[2], det = bx*cz-bz*cx;
      if (Math.abs(det) < 1e-10) continue;
      // Building undersides cannot support a person; road ribbons may have either winding.
      if(mesh.userData.feature?.height&&det>0)continue;
      const t = [a[0],a[2],a[1],cz/det,-cx/det,-bz/det,bx/det,b[1]-a[1],c[1]-a[1]];
      const x0 = Math.floor(Math.min(a[0],b[0],c[0])/cell), x1 = Math.floor(Math.max(a[0],b[0],c[0])/cell), z0 = Math.floor(Math.min(a[2],b[2],c[2])/cell), z1 = Math.floor(Math.max(a[2],b[2],c[2])/cell);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const key = `${x},${z}`; if (!cells.has(key)) cells.set(key, new Map());
        const groups = cells.get(key); if (!groups.has(mesh)) groups.set(mesh, []); groups.get(mesh).push(t);
      }
      triangles++;
    }
  }
  return indexedSurfaces(cells,triangles,fallback,cell);
}
export function surfaceIndexFromData(data,objects,fallback){return indexedSurfaces(new Map(data.entries.map(([key,groups])=>[key,new Map(groups.map(([id,list])=>{if(!objects[id])throw Error('Missing surface object '+id);return[objects[id],list];}))])),data.triangles,fallback,data.cell);}
function indexedSurfaces(cells,triangles,fallback,cell){
  return { cells: cells.size, triangles, toData(id){return {cell,triangles,entries:[...cells].map(([key,groups])=>[key,[...groups].map(([mesh,list])=>[id(mesh),list])])};},sample(x,z,ceiling=Infinity) {
    const base=fallback(x,z);let height=base<=ceiling?base:-Infinity;
    const groups = cells.get(`${Math.floor(x/cell)},${Math.floor(z/cell)}`); if (!groups) return height;
    for (const [mesh, list] of groups) {
      if (!objectVisible(mesh)) continue;
      for (const t of list) { const dx = x-t[0], dz = z-t[1], u = dx*t[3]+dz*t[4], v = dx*t[5]+dz*t[6]; if (u >= 0 && v >= 0 && u+v <= 1) {const y=t[2]+u*t[7]+v*t[8];if(y<=ceiling)height=Math.max(height,y);} }
    }
    return height;
  } };
}
