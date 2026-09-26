import assert from 'node:assert/strict';
import {createShapeQuery,pointBounds} from '../pipeline/shape-query.js';
import {uncoveredPaths} from '../pipeline/map-merge.js';
const square=(x,z,w)=>({outer:[[x,z],[x+w,z],[x+w,z+w],[x,z+w]],holes:[]});
const shapes=Array.from({length:400},(_,i)=>square((i%20)*100,Math.floor(i/20)*100,30));
shapes[0].holes=[square(10,10,10).outer];
const query=createShapeQuery(shapes);
assert.deepEqual(query([30,0,30,0]),[shapes[0]],'touching boundaries remain candidates');
assert.deepEqual(query([10,10,20,20]),[shapes[0]],'contained segments must still test holes');
assert.deepEqual(pointBounds([[-4,9],[10,-3]]),[-4,-3,10,9]);
const paths=[[[0,15],[2000,15]],[[15,-10],[15,2000]],[[2000,2000],[-10,-10]],[[10,10],[20,10]],[[15,15],[15,15]],[[50,50],[80,80]]];
// Exhaustive candidate enumeration is the reference algorithm; compare complete split geometry.
assert.deepEqual(uncoveredPaths(paths,shapes,query),uncoveredPaths(paths,shapes,()=>shapes));
assert.deepEqual(uncoveredPaths([[[-5,15],[35,15]]],shapes).paths,[[[-5,15],[0,15]],[[10,15],[20,15]],[[30,15],[35,15]]]);
console.log('PASS broad-phase queries preserve exact splitting, touching edges, holes and distant fragments across 2 km');
