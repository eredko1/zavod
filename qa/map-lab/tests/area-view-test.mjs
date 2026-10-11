import assert from 'node:assert/strict';
import {mapPoint,mapCoordinate,panArea,centeredArea,areaCenter,fitAreaZoom,tileLayout,MAX_MAP_LATITUDE} from '../data/area-view.js';
import {CONEY_BOUNDS,areaDimensions,validateArea,MAX_AREA_METRES} from '../data/generator-area.js';
for(const center of [{lat:40.577,lon:-73.978},{lat:0,lon:0},{lat:84.5,lon:179.9}])for(const zoom of [3,16,19]){const result=mapCoordinate(mapPoint(center,zoom),zoom);assert.ok(Math.abs(result.lat-center.lat)<1e-8);assert.ok(Math.abs(result.lon-center.lon)<1e-8);}
const d=areaDimensions(CONEY_BOUNDS),moved=panArea(CONEY_BOUNDS,120,-80,16);assert.ok(moved.west<CONEY_BOUNDS.west);assert.ok(moved.north<CONEY_BOUNDS.north);for(const k of ['width','height'])assert.ok(Math.abs(areaDimensions(moved)[k]-d[k])<1e-6);
for(const center of [{lat:90,lon:180},{lat:-90,lon:-180}]){const b=centeredArea(center,{width:5000,height:5000});assert.ok(b.north<=MAX_MAP_LATITUDE&&b.south>=-MAX_MAP_LATITUDE);validateArea(b);assert.ok(b.west>=-180&&b.east<=180);}
for(const b of [{},{south:0,west:0,north:1},{south:null,west:0,north:1,east:1}])assert.throws(()=>validateArea(b),/bounds/);
const zoom=fitAreaZoom(CONEY_BOUNDS,760,400),tiles=tileLayout(areaCenter(CONEY_BOUNDS),zoom,760,400);assert.ok(zoom>=3&&zoom<=19);assert.ok(tiles.length<=20);assert.equal(new Set(tiles.map(t=>t.key)).size,tiles.length);
assert.throws(()=>centeredArea({lat:NaN,lon:0},d));assert.throws(()=>centeredArea({lat:0,lon:0},{width:MAX_AREA_METRES+1,height:500}));
console.log('PASS tile projection, area-size preservation, geographic limits, complete bounds validation and viewport-only tile coverage');
