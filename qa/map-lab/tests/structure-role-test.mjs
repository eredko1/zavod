import assert from 'node:assert/strict';
import {resolveSources,GEOMETRY_DEFAULTS} from '../pipeline/map-pipeline.js';
import {compileMap} from '../pipeline/map-build.js';
import {dispose} from '../render/osm-meshes.js';
const bounds={south:40.57,west:-73.98,north:40.571,east:-73.979},geometry=[{lat:40.5702,lon:-73.9798},{lat:40.5702,lon:-73.9792},{lat:40.5708,lon:-73.9792},{lat:40.5708,lon:-73.9798},{lat:40.5702,lon:-73.9798}];
for(const kind of ['pier','breakwater','groyne','mast','tower','bridge','yes']){
  const input={bounds,data:{elements:[{type:'way',id:1,tags:{man_made:kind,height:'8',width:'2'},geometry}]}},before=JSON.stringify(input),source=resolveSources(input),f=source.details[0];
  assert.equal(f.reference,true);assert.equal(f.surface,undefined,'a closed structure must not become land');assert.equal(f.structureKind,kind);assert.equal(f.merge.ruleId,'structures');assert.equal(f.dimensions.height,8);assert.equal(f.attributes.height.estimated,false);assert.equal(f.estimates.length,0);
  const built=compileMap(input,GEOMETRY_DEFAULTS);assert.ok(built.world.selectable.some(m=>m.isLineSegments&&m.userData.feature.id===f.id));assert.ok(!built.world.selectable.some(m=>m.isMesh&&m.userData.feature?.id===f.id));assert.equal(JSON.stringify(input),before);dispose(built.world.group);dispose(built.reference);
}
const park=resolveSources({bounds,data:{elements:[{type:'way',id:1,tags:{leisure:'park',man_made:'no'},geometry}]}});assert.equal(park.details[0].surface,true);
const point=resolveSources({bounds,data:{elements:[{type:'node',id:1,lat:40.5705,lon:-73.9795,tags:{man_made:'mast',height:'8'}}]}}).details[0];assert.equal(point.merge.ruleId,'structures');assert.equal(point.dimensions.height,8);assert.ok(point.point);
console.log('PASS closed structure roles, measured dimensions, source-only normalization, reference rendering and ordinary area preservation');
