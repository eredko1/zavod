// Pure geometry checks; no browser or network required.
import assert from 'node:assert/strict';
import { runs, joinRings, normalize } from '../pipeline/osm-geometry.js';
const p = (lon, lat) => ({ lat, lon }), a = p(0, 0), b = p(4, 0), c = p(4, 4), d = p(0, 4);
assert.deepEqual(runs([a, b, null, c, d]), [[a, b], [c, d]], 'clipped geometry must not bridge missing coordinates');
const joined = joinRings([[a, b], [c, b], [a, d], [c, d]]);
assert.equal(joined.length, 1, 'unordered, reversed member ways form one ring');
assert.equal(joined[0].length, 5);
assert.deepEqual(joined[0][0], joined[0][4], 'ring closes regardless of which vertex starts it');
assert.deepEqual(new Set(joined[0].slice(0, -1).map(JSON.stringify)), new Set([a, b, c, d].map(JSON.stringify)));
const hole = [p(1, 1), p(2, 1), p(2, 2), p(1, 2), p(1, 1)];
const [multi] = normalize([{ type: 'relation', id: 1, tags: { type: 'multipolygon', building: 'yes' }, members: [
  { type: 'way', role: 'outer', geometry: [a, b, c] }, { type: 'way', role: 'outer', geometry: [a, d, c] },
  { type: 'way', role: 'inner', geometry: hole },
] }]);
assert.equal(multi.paths.length, 2, 'outer ring and courtyard remain separate');
assert.ok(multi.paths.every(p => p.closed));
assert.equal(multi.category, 'buildings');
const [clippedMulti] = normalize([{ type: 'relation', id: 7, tags: { type: 'multipolygon', building: 'yes' }, members: [
  { type: 'way', role: 'outer', geometry: [a, b, null, d] }, { type: 'way', role: 'inner', geometry: hole },
] }]);
assert.ok(clippedMulti.paths.every(p => !p.closed), 'a surviving hole must not become filled when the outer boundary is clipped');
const [partial] = normalize([{ type: 'way', id: 2, tags: { building: 'yes' }, geometry: [a, b, null, d, a] }]);
assert.ok(partial.paths.every(p => !p.closed), 'partial buildings must not become invented filled polygons');
const [loop] = normalize([{ type: 'way', id: 3, tags: { highway: 'residential', junction: 'roundabout' }, geometry: [a, b, c, d, a] }]);
assert.equal(loop.paths[0].closed, false, 'a closed road centerline is not an area');
const resolved = normalize([{ type: 'node', id: 1, ...a }, { type: 'node', id: 2, ...b }, { type: 'way', id: 4, nodes: [1, 2], tags: { barrier: 'fence' } }]);
assert.equal(resolved[2].paths[0].points.length, 2, 'node references can supply missing inline geometry');
assert.equal(resolved[0].category, 'vertices');
const tags = { name: '<script>bad</script>', height: '18', 'building:levels': '5' };
assert.deepEqual(normalize([{ type: 'node', id: 5, ...a, tags }])[0].tags, tags, 'original tags are preserved verbatim');
assert.equal(normalize([{ type: 'way', id: 6, tags: { building: 'yes' } }]).length, 0, 'geometry-free objects are skipped');
console.log('PASS: gaps, reversed rings, courtyards, partial outlines, road loops, node references, original tags, missing geometry');
