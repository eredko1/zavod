import assert from 'node:assert/strict';
import {resolveMap} from '../pipeline/map-pipeline.js';
import {loadFixture} from './fixture.mjs';
const input=await loadFixture(),initial=resolveMap(input);
for(const source of ['nyc-buildings','nyc-roadbed','nyc-sidewalk','nyc-trees']){
  const selected={...input,nyc:input.nyc.map(s=>({...s,visible:s.sourceId!==source}))},plan=resolveMap(selected);
  assert.ok(![...plan.buildings,...plan.roads,...plan.details].some(f=>f.sourceId===source));
  for(const row of plan.merge.decisions.filter(r=>r.status!=='hidden'))assert.ok(!row.members.some(m=>m.sourceId===source),'hidden provider cannot suppress an enabled alternative');
  if(source==='nyc-buildings'){
    const replaced=initial.merge.decisions.filter(r=>r.geometrySource===source&&r.members.length>1).flatMap(r=>r.members.filter(m=>m.sourceId==='osm-overpass').map(m=>m.id));
    assert.ok(replaced.length);assert.ok(replaced.every(id=>plan.buildings.some(f=>f.id===id)),'OSM buildings restored');
  }
}
assert.deepEqual(resolveMap(input).merge,initial.merge,'re-enabling sources is deterministic');
console.log('PASS selected providers restore alternatives and cannot suppress enabled inputs');
