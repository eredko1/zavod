// A feature owns its geometries, while materials are shared by the enclosing build.
export function rollbackMeshes(selectable,start){
  for(const mesh of selectable.splice(start)){mesh.removeFromParent();mesh.geometry.dispose();}
}
