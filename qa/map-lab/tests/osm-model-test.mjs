import assert from 'node:assert/strict';
import { heightOf, length, projection, planFromOSM, inShape } from '../pipeline/osm-model.js';
import { blocked, move } from '../render/osm-walk.js';
assert.equal(heightOf({ height: '12', 'building:levels': '9' }).top, 12);
assert.equal(heightOf({ 'building:levels': '2' }).top, 6);
assert.equal(heightOf({ height: 'unknown', 'building:levels': '2' }).top, 6);
assert.equal(heightOf({ height: '0', 'building:levels': '2' }).top, 6);
assert.equal(heightOf({ height: 'NaN', 'building:levels': '-1' }).valid, false);
assert.equal(heightOf({}).top, null);
assert.equal(heightOf({ height: '6', min_height: '8' }).valid, false);
assert.equal(heightOf({ 'building:levels': '4', 'roof:height': '2', min_height: '3' }).top, 14);
assert.ok(Math.abs(length(`6' 2"`) - 1.8796) < 1e-8);
const p = projection(0, 0)({ lat: 0, lon: 0.001 }); assert.ok(Math.abs(p[0] - 111.31949) < 0.001); assert.equal(p[1], 0);
const ring = [[0, 0], [0.001, 0], [0.001, 0.001], [0.0005, 0.001], [0.0005, 0.0005], [0, 0.0005], [0, 0]].map(([lon, lat]) => ({ lon, lat }));
const data = { elements: [
  { type: 'way', id: 1, tags: { building: 'yes', height: '10' }, geometry: ring },
  { type: 'way', id: 2, tags: { building: 'yes' }, geometry: ring },
  { type: 'way', id: 3, tags: { building: 'yes', 'building:levels': '2' }, geometry: ring.map(p => ({ ...p, lon: p.lon + 0.002 })) },
  { type: 'way', id: 4, tags: { building: 'yes', height: '8' } },
  { type: 'way', id: 5, tags: { building: 'yes', height: '8' }, geometry: ring.slice(0, 3) },
] };
const plan = planFromOSM(data); assert.equal(plan.buildings[0].shapes[0].outer.length, 6, 'preserve concave vertices');
assert.equal(plan.buildings[1].extrude, false); assert.equal(plan.buildings[2].height.top, 6);
for (const id of ['way/2', 'way/4', 'way/5']) assert.ok(plan.issues.some(i => i.id === id && i.severity === 'error'), `log ${id}`);
const square = { outer: [[0, 0], [10, 0], [10, 10], [0, 10]], holes: [[[3, 3], [7, 3], [7, 7], [3, 7]]] };
const physics = { buildings: [{ extrude: true, height: { bottom: 0, top: 10 }, shapes: [square] }] };
assert.equal(inShape(5, 5, square), false); assert.equal(blocked(5, 5, physics), false, 'courtyard remains walkable');
assert.equal(blocked(2.9, 5, physics), true); assert.equal(blocked(-0.1, 5, physics), true, 'body radius');
const position = { x: -2, z: 5 }; move(position, 20, 0, physics); assert.ok(position.x < -0.27, 'cannot tunnel through walls');
physics.buildings[0].height.bottom = 3; assert.equal(blocked(2, 2, physics), false, 'walk under raised building');
assert.equal(planFromOSM({ elements: [data.elements[3]] }).issues[0].code, 'missing-geometry');
console.log('PASS: height priority, missing-height errors, units, concave rings, collision clearance, courtyards, anti-tunnelling');
// A zero height is meaningful for curbs, unlike a missing building height.
assert.equal(length('3 cm'),.03);assert.equal(length('15 mm'),.015);
const curbPlan=tags=>planFromOSM({elements:[{type:'way',id:500,tags:{barrier:'kerb',...tags},geometry:[{lat:40.577,lon:-73.978},{lat:40.5771,lon:-73.978}]}]}).details[0];
assert.equal(curbPlan({'kerb:height':'0'}).dimensions.height,0);assert.equal(curbPlan({'kerb:height':'0'}).attributes.height.estimated,false);
assert.equal(curbPlan({height:'3 cm'}).dimensions.height,.03);assert.equal(curbPlan({height:'0.1','kerb:height':'0.2'}).dimensions.height,.1);
assert.equal(curbPlan({kerb:'flush'}).dimensions.height,0);assert.equal(curbPlan({kerb:'lowered'}).dimensions.height,.03);assert.equal(curbPlan({kerb:'lowered'}).attributes.height.estimated,true);
assert.equal(curbPlan({height:'invalid'}).dimensions.height,.15);
console.log('PASS explicit curb height priority, cm/mm units, valid zero and labeled classification/default fallbacks');
const member={type:'way',id:600,tags:{leisure:'park'},geometry:ring},parent={type:'relation',id:601,tags:{type:'multipolygon',leisure:'park'},members:[{type:'way',ref:600,role:'outer',geometry:ring}]};
const areaPlan=(child=member,relation=parent)=>planFromOSM({elements:[child,relation]});
assert.equal(areaPlan().details.length,1);assert.equal(areaPlan().coverage.find(f=>f.id==='way/600').representedBy,'relation/601');
const fence=areaPlan({...member,tags:{...member.tags,barrier:'fence'}});assert.equal(fence.details.length,2);assert.equal(fence.details.find(f=>f.rule==='fence').surface,false);
assert.equal(areaPlan({...member,tags:{leisure:'pitch'}}).details.length,2);
assert.equal(areaPlan(member,{...parent,members:[{...parent.members[0],role:'inner'}]}).details.length,2);
assert.equal(areaPlan(member,{...parent,members:[{...parent.members[0],geometry:ring.slice(0,3)}]}).details.length,2);
console.log('PASS duplicate multipolygon surfaces suppressed with provenance; fences, different tags, inner members and incomplete parents retained');
const buildingMember={...member,tags:{building:'yes',height:'10'}},buildingParent={...parent,tags:{type:'multipolygon',building:'yes',height:'10'}};
assert.equal(areaPlan(buildingMember,buildingParent).buildings.length,1);
for(const relation of [{...buildingParent,tags:{type:'multipolygon',building:'yes'}},{...buildingParent,members:[{...parent.members[0],geometry:ring.slice(0,3)}]}])assert.ok(areaPlan(buildingMember,relation).buildings.some(f=>f.id==='way/600'&&f.extrude));
console.log('PASS incomplete or heightless building parents cannot suppress a usable member');
